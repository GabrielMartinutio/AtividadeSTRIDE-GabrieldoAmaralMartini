#!/usr/bin/env node
/**
 * Fallback antifraude quando Semgrep nao esta instalado (ex.: Windows sem Python).
 * Espelha as 6 regras de semgrep.yml com heuristicas simples sobre src/.
 * Saida JSON: { findings: string[] } — check_ids iguais aos do Semgrep.
 */
const fs = require('fs');
const path = require('path');

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const srcDir = path.join(root, 'src');

function readSrc() {
  if (!fs.existsSync(srcDir)) {
    console.error(`Pasta src/ nao encontrada em ${root}`);
    process.exit(1);
  }
  const files = fs.readdirSync(srcDir).filter((f) => /\.(ts|js)$/.test(f));
  return files
    .map((f) => `// FILE:${f}\n${fs.readFileSync(path.join(srcDir, f), 'utf8')}`)
    .join('\n');
}

const code = readSrc();
const findings = new Set();

if (
  /jwt\.sign\s*\([^)]*(['"`])123456\1/.test(code) ||
  /const\s+\w+\s*=\s*['"`]123456['"`][\s\S]{0,200}jwt\.sign/.test(code) ||
  /jwt\.sign\s*\(\s*[^,]+,\s*['"`][^'"`]+['"`]/.test(code)
) {
  findings.add('stride-spoofing-hardcoded-jwt-secret');
}

if (
  /SELECT[\s\S]{0,120}\+\s*username/.test(code) ||
  /WHERE\s+username\s*=\s*['"]\s*\+/.test(code) ||
  /\.all\(\s*[`'"][^]*?\+/.test(code) ||
  /const\s+query\s*=\s*["'][^"']*["']\s*\+/.test(code) ||
  /const\s+query\s*=\s*"[^"]*"\s*\+\s*username/.test(code)
) {
  findings.add('stride-tampering-sql-injection');
}

if (/catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(code)) {
  findings.add('stride-repudiation-empty-catch');
}

if (/stack\s*:\s*err(?:or)?\.stack/.test(code) || /stack\s*:\s*\w+\.stack/.test(code)) {
  findings.add('stride-info-disclosure-stack-trace');
}

if (/\(\[[^\]]+\]\+\)\+/.test(code) || /\(\[a-zA-Z0-9\]\+\)\+/.test(code)) {
  findings.add('stride-dos-redos-regex');
}

if (/\bexec\s*\(/.test(code) || /\beval\s*\(/.test(code)) {
  findings.add('stride-eop-dynamic-exec');
}

const result = { findings: [...findings], engine: 'node-fallback' };
const outPath = process.argv[3];
if (outPath) {
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
}
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(0);
