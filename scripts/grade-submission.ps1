#!/usr/bin/env pwsh
[CmdletBinding()]
param(
  [string]$RepoUrl,
  [string]$Path
)

$ErrorActionPreference = 'Stop'

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$TeacherRoot = Split-Path -Parent $ScriptRoot

$RuleMap = [ordered]@{
  'stride-spoofing-hardcoded-jwt-secret' = @{ Letter = 'S'; Name = 'Spoofing'; Points = 0.5 }
  'stride-tampering-sql-injection'       = @{ Letter = 'T'; Name = 'Tampering'; Points = 0.5 }
  'stride-repudiation-empty-catch'       = @{ Letter = 'R'; Name = 'Repudiation'; Points = 0.5 }
  'stride-info-disclosure-stack-trace'   = @{ Letter = 'I'; Name = 'Information Disclosure'; Points = 0.5 }
  'stride-dos-redos-regex'               = @{ Letter = 'D'; Name = 'Denial of Service'; Points = 0.5 }
  'stride-eop-dynamic-exec'              = @{ Letter = 'E'; Name = 'Elevation of Privilege'; Points = 0.5 }
}

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Comando obrigatorio nao encontrado: $Name"
  }
}

function Get-PythonLauncher {
  foreach ($candidate in @('python', 'py')) {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) {
      return $candidate
    }
  }
  return $null
}

function Test-RealPython {
  $py = Get-PythonLauncher
  if (-not $py) { return $null }
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $out = & $py --version 2>&1 | Out-String
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -ne 0) { return $null }
  if ($out -match 'Python\s+\d+\.\d+') { return $py }
  return $null
}

function Ensure-SecurityScanner {
  if (Get-Command semgrep -ErrorAction SilentlyContinue) {
    return 'semgrep'
  }

  $py = Test-RealPython
  if ($py) {
    Write-Host "[grade] Instalando Semgrep com: $py -m pip install semgrep" -ForegroundColor Yellow
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $py -m pip install --user semgrep | Out-Host
    $pipCode = $LASTEXITCODE
    if ($pipCode -eq 0) {
      & $py -m semgrep --version | Out-Host
      if ($LASTEXITCODE -eq 0) {
        $ErrorActionPreference = $prev
        return 'semgrep-python'
      }
    }
    $ErrorActionPreference = $prev
  }

  Write-Host '[grade] Semgrep indisponivel - usando fallback Node (grade-security-check.cjs)' -ForegroundColor Yellow
  return 'node-fallback'
}

function Invoke-SecurityScan {
  param(
    [string]$Engine,
    [string]$WorkDir,
    [string]$JsonPath
  )

  if ($Engine -eq 'node-fallback') {
    $checker = Join-Path $TeacherRoot 'scripts\grade-security-check.cjs'
    $raw = & node $checker $WorkDir
    $parsed = $raw | ConvertFrom-Json
    $results = @()
    foreach ($id in @($parsed.findings)) {
      $results += @{ check_id = "$id" }
    }
    $semgrepShape = @{
      results = $results
      engine  = 'node-fallback'
    }
    ($semgrepShape | ConvertTo-Json -Depth 6) | Set-Content -Path $JsonPath -Encoding utf8
    return
  }

  $config = Join-Path $WorkDir 'semgrep.yml'
  $src = Join-Path $WorkDir 'src'
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    if ($Engine -eq 'semgrep-python') {
      $py = Test-RealPython
      & $py -m semgrep --config $config --json --output $JsonPath $src | Out-Host
    }
    else {
      & semgrep --config $config --json --output $JsonPath $src | Out-Host
    }
  }
  finally {
    $ErrorActionPreference = $prev
  }
}

function Resolve-WorkDir {
  if ($Path) {
    if (-not (Test-Path $Path)) { throw "Path nao existe: $Path" }
    return (Resolve-Path $Path).Path
  }
  if (-not $RepoUrl) {
    throw 'Informe -RepoUrl ou -Path'
  }
  Assert-Command git
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('stride-grade-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  Write-Host "[grade] Clonando $RepoUrl ..." -ForegroundColor Cyan
  git clone --depth 1 $RepoUrl $tmp
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao clonar. Verifique URL e acesso (collaborator/publico).' }
  return $tmp
}

function Overlay-OfficialArtifacts([string]$WorkDir) {
  $sameRepo = ((Resolve-Path $WorkDir).Path -eq (Resolve-Path $TeacherRoot).Path)
  if ($sameRepo) {
    Write-Host '[grade] Alvo e o proprio template - mantendo testes/regras locais' -ForegroundColor Cyan
    return
  }

  Write-Host '[grade] Aplicando testes e regras oficiais do template (antifraude)...' -ForegroundColor Cyan
  $destTests = Join-Path $WorkDir 'tests'
  if (Test-Path $destTests) {
    Remove-Item -Recurse -Force $destTests
  }
  Copy-Item -Recurse -Force (Join-Path $TeacherRoot 'tests') $destTests
  Copy-Item -Force (Join-Path $TeacherRoot 'semgrep.yml') (Join-Path $WorkDir 'semgrep.yml')
  Copy-Item -Force (Join-Path $TeacherRoot 'jest.config.js') (Join-Path $WorkDir 'jest.config.js')
}

Assert-Command npm
Assert-Command node
$scanEngine = Ensure-SecurityScanner

$workDir = Resolve-WorkDir
$createdTemp = [bool]$RepoUrl
if (-not $env:JWT_SECRET) {
  $env:JWT_SECRET = 'grading-secret-professor-stride'
}

try {
  Overlay-OfficialArtifacts -WorkDir $workDir
  Push-Location $workDir

  Write-Host '[grade] npm install' -ForegroundColor Cyan
  npm install --silent
  if ($LASTEXITCODE -ne 0) { throw 'npm install falhou' }

  Write-Host '[grade] npm test (integridade)' -ForegroundColor Cyan
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  npm test
  $testsPassed = ($LASTEXITCODE -eq 0)
  $ErrorActionPreference = $prevEap

  $jsonPath = Join-Path $workDir 'semgrep-grade.json'
  Write-Host "[grade] scan de seguranca ($scanEngine)" -ForegroundColor Cyan
  Invoke-SecurityScan -Engine $scanEngine -WorkDir $workDir -JsonPath $jsonPath

  $findings = @()
  if (Test-Path $jsonPath) {
    $report = Get-Content $jsonPath -Raw | ConvertFrom-Json
    if ($report.results) {
      $findings = @($report.results | ForEach-Object { $_.check_id } | Select-Object -Unique)
    }
  }

  Write-Host ''
  Write-Host '========== RESULTADO DA CORRECAO ==========' -ForegroundColor Green
  Write-Host "Alvo: $(if ($RepoUrl) { $RepoUrl } else { $workDir })"
  Write-Host ''

  $securityTotal = 0.0
  foreach ($ruleId in $RuleMap.Keys) {
    $meta = $RuleMap[$ruleId]
    $fixed = -not ($findings -contains $ruleId)
    $pts = if ($fixed) { [double]$meta.Points } else { 0.0 }
    $securityTotal += $pts
    $mark = if ($fixed) { 'OK' } else { 'FALHA' }
    $color = if ($fixed) { 'Green' } else { 'Red' }
    Write-Host ("[{0}] {1,-24} {2,-6} {3:N1}/0,5" -f $meta.Letter, $meta.Name, $mark, $pts) -ForegroundColor $color
  }

  $integrityPts = if ($testsPassed) { 1.0 } else { 0.0 }
  $integrityMark = if ($testsPassed) { 'OK' } else { 'FALHA' }
  $integrityColor = if ($testsPassed) { 'Green' } else { 'Red' }
  Write-Host ("[+] Integridade (npm test)   {0,-6} {1:N1}/1,0" -f $integrityMark, $integrityPts) -ForegroundColor $integrityColor

  $total = $securityTotal + $integrityPts
  Write-Host ''
  Write-Host ("NOTA FINAL: {0:N1} / 4,0" -f $total) -ForegroundColor Cyan
  Write-Host ("  Seguranca:   {0:N1} / 3,0" -f $securityTotal)
  Write-Host ("  Integridade: {0:N1} / 1,0" -f $integrityPts)

  if ($findings.Count -gt 0) {
    Write-Host ''
    Write-Host 'Regras ainda disparando:' -ForegroundColor Yellow
    $findings | ForEach-Object { Write-Host "  - $_" }
  }

  Write-Host '===========================================' -ForegroundColor Green

  if ($total -ge 4.0) { exit 0 } else { exit 2 }
}
finally {
  Pop-Location -ErrorAction SilentlyContinue
  if ($createdTemp -and (Test-Path $workDir)) {
    Remove-Item -Recurse -Force $workDir -ErrorAction SilentlyContinue
  }
}
