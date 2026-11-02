#!/usr/bin/env bash
# Roda um script de provisionamento (.ps1) no Linux/macOS contra o DEV, com o login salvo por dv-token.mjs.
#   node packages/deploy/dv-token.mjs login          # uma vez (o refresh token fica em ~/.cache/betinhos-dv)
#   packages/deploy/rodar-linux.sh provision-treinamentos.ps1 [-Apply]
# Precisa de pwsh 7 (PATH ou ~/.local/powershell/pwsh). Só DEV: os scripts recusam o host de PROD.
set -euo pipefail
aqui="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="${1:?Uso: rodar-linux.sh <script.ps1> [argumentos]}"; shift
pwsh_bin="$(command -v pwsh || true)"; [ -x "${pwsh_bin:-}" ] || pwsh_bin="$HOME/.local/powershell/pwsh"
[ -x "$pwsh_bin" ] || { echo "pwsh 7 não encontrado." >&2; exit 1; }
dev="https://org23b93544.crm2.dynamics.com"
export DV_ENVIRONMENT_URL="$dev" DV_SOLUTION="${DV_SOLUTION:-AppBetinhos}" DV_BLOCKED_HOSTS="orgf261ae8e.crm2.dynamics.com"
DV_ACCESS_TOKEN="$(node "$aqui/dv-token.mjs" token "$dev")"; export DV_ACCESS_TOKEN
FLOW_ACCESS_TOKEN="$(node "$aqui/dv-token.mjs" token https://service.flow.microsoft.com)"; export FLOW_ACCESS_TOKEN
exec "$pwsh_bin" -NoProfile -File "$aqui/$script" "$@"
