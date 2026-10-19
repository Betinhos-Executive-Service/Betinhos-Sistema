#!/bin/bash
# SessionStart: prepara a VM das sessões cloud do Claude Code (Node 24, deps, Chromium, typecheck).
# Roda aqui, e não no setup script do ambiente, porque o NODE_AUTH_TOKEN só existe dentro da sessão.
# Localmente (Windows) não faz nada.
set -uo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"
LOG=/tmp/cloud-setup.log
if bash scripts/cloud-setup.sh >> "$LOG" 2>&1; then
  grep '^\[cloud-setup\]' "$LOG" | tail -1
else
  # Não bloqueia a sessão: o resumo entra no contexto para a sessão relatar e corrigir.
  echo "[cloud-setup] FALHOU (exit $?). Últimas linhas de $LOG:"
  grep -v -i 'authtoken' "$LOG" | tail -15
fi
exit 0
