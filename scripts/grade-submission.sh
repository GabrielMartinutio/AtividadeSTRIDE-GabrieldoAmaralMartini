#!/usr/bin/env bash
# Corrige uma entrega da Atividade STRIDE (nota automática / 4,0).
# Uso:
#   ./scripts/grade-submission.sh https://github.com/aluno/AtividadeSTRIDE-Nome
#   ./scripts/grade-submission.sh /caminho/para/repo-do-aluno

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEACHER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TARGET="${1:-}"

if [[ -z "${TARGET}" ]]; then
  echo "Uso: $0 <url-do-repo-ou-caminho-local>" >&2
  exit 1
fi

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Comando obrigatório não encontrado: $1" >&2; exit 1; }
}

need_cmd npm
need_cmd node
need_cmd git

if ! command -v semgrep >/dev/null 2>&1; then
  echo ">> Semgrep não encontrado. Tentando instalar via pip..."
  need_cmd pip
  pip install --user semgrep
  export PATH="${HOME}/.local/bin:${PATH}"
fi
need_cmd semgrep

CREATED_TEMP=0
WORK_DIR=""

cleanup() {
  if [[ "${CREATED_TEMP}" -eq 1 && -n "${WORK_DIR}" && -d "${WORK_DIR}" ]]; then
    rm -rf "${WORK_DIR}"
  fi
}
trap cleanup EXIT

if [[ -d "${TARGET}" ]]; then
  WORK_DIR="$(cd "${TARGET}" && pwd)"
else
  WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/stride-grade.XXXXXX")"
  CREATED_TEMP=1
  echo ">> Clonando ${TARGET} ..."
  git clone --depth 1 "${TARGET}" "${WORK_DIR}"
fi

echo ">> Aplicando testes e regras oficiais do template (antifraude)..."
rm -rf "${WORK_DIR}/tests"
cp -R "${TEACHER_ROOT}/tests" "${WORK_DIR}/tests"
cp -f "${TEACHER_ROOT}/semgrep.yml" "${WORK_DIR}/semgrep.yml"
cp -f "${TEACHER_ROOT}/jest.config.js" "${WORK_DIR}/jest.config.js"

export JWT_SECRET="${JWT_SECRET:-grading-secret-professor-stride}"

cd "${WORK_DIR}"

echo ">> npm install"
npm install --silent

echo ">> npm test (integridade)"
TESTS_PASSED=0
if npm test; then
  TESTS_PASSED=1
fi

JSON_PATH="${WORK_DIR}/semgrep-grade.json"
echo ">> semgrep (segurança)"
set +e
semgrep --config "${WORK_DIR}/semgrep.yml" --json --output "${JSON_PATH}" src
set -e

python3 - <<'PY' "${JSON_PATH}" "${TESTS_PASSED}"
import json, sys
from pathlib import Path

json_path = Path(sys.argv[1])
tests_passed = sys.argv[2] == "1"

rules = [
    ("S", "Spoofing", "stride-spoofing-hardcoded-jwt-secret", 0.5),
    ("T", "Tampering", "stride-tampering-sql-injection", 0.5),
    ("R", "Repudiation", "stride-repudiation-empty-catch", 0.5),
    ("I", "Information Disclosure", "stride-info-disclosure-stack-trace", 0.5),
    ("D", "Denial of Service", "stride-dos-redos-regex", 0.5),
    ("E", "Elevation of Privilege", "stride-eop-dynamic-exec", 0.5),
]

findings = set()
if json_path.exists():
    data = json.loads(json_path.read_text(encoding="utf-8"))
    for item in data.get("results", []):
        findings.add(item.get("check_id"))

print("")
print("========== RESULTADO DA CORREÇÃO ==========")
security_total = 0.0
for letter, name, rule_id, points in rules:
    fixed = rule_id not in findings
    pts = points if fixed else 0.0
    security_total += pts
    mark = "OK" if fixed else "FALHA"
    print(f"[{letter}] {name:<24} {mark:<6} {pts:.1f}/0,5")

integrity = 1.0 if tests_passed else 0.0
print(f"[+] Integridade (npm test)   {'OK' if tests_passed else 'FALHA':<6} {integrity:.1f}/1,0")
total = security_total + integrity
print("")
print(f"NOTA FINAL: {total:.1f} / 4,0")
print(f"  Segurança:   {security_total:.1f} / 3,0")
print(f"  Integridade: {integrity:.1f} / 1,0")
if findings:
    print("")
    print("Regras ainda disparando:")
    for f in sorted(findings):
        print(f"  - {f}")
print("===========================================")
sys.exit(0 if total >= 4.0 else 2)
PY
