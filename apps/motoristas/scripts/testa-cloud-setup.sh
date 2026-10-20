#!/usr/bin/env bash
# Teste do preparo da VM cloud num Linux limpo (WSL): cloud-setup.sh direto (instalação limpa,
# 2ª execução, Chromium da imagem, falha clara sem token, sem mexer no ~/.npmrc) e o hook SessionStart
# (.claude/hooks/session-start.sh: remoto, local e com falha).
# Uso (dentro do WSL, como root): testa-cloud-setup.sh <repo.tar>
# Pastas com sufixo -motoristas: outras sessões testam outros repos no mesmo WSL ao mesmo tempo.
set -u
SRC_TAR="$1"
R=/root/sb-motoristas H=/root/sbhome-motoristas
rm -rf "$R" "$H" /root/sbfail-motoristas /root/run*-motoristas.log && mkdir -p "$R" "$H"
tar -xf "$SRC_TAR" -C "$R"
cd "$R"
export HOME="$H"
TOKEN="${NODE_AUTH_TOKEN:-}"
unset NODE_AUTH_TOKEN CLAUDE_CODE_REMOTE CLAUDE_ENV_FILE

# --- scripts/cloud-setup.sh direto ---
bash scripts/cloud-setup.sh > /root/run0-motoristas.log 2>&1
echo "run0 (sem token) exit=$? | $(grep -c 'ERRO: defina NODE_AUTH_TOKEN' /root/run0-motoristas.log) aviso de token"
[ -n "$TOKEN" ] || { echo "ABORTADO: rode com NODE_AUTH_TOKEN (WSLENV=NODE_AUTH_TOKEN/u)"; exit 1; }
export NODE_AUTH_TOKEN="$TOKEN"

bash scripts/cloud-setup.sh > /root/run1-motoristas.log 2>&1
echo "run1 (limpa, com token) exit=$? | $(tail -1 /root/run1-motoristas.log)"

bash scripts/cloud-setup.sh > /root/run2-motoristas.log 2>&1
echo "run2 (2a execucao) exit=$? | $(tail -1 /root/run2-motoristas.log) | reinstalou Node: $(grep -c 'Instalando Node' /root/run2-motoristas.log)"

# Simula a VM cloud: Chromium já presente em $PLAYWRIGHT_BROWSERS_PATH (não deve baixar outro)
mkdir -p "$H/pw-fake/chromium-1194"
PLAYWRIGHT_BROWSERS_PATH="$H/pw-fake" bash scripts/cloud-setup.sh > /root/run3-motoristas.log 2>&1
echo "run3 (Chromium da imagem) exit=$? | $(grep -c 'Chromium da imagem' /root/run3-motoristas.log) reaproveitamento, $(grep -ci 'Downloading Chrom' /root/run3-motoristas.log) downloads"

echo "testes: $(grep -E '^(#|ℹ) (pass|fail) ' /root/run2-motoristas.log | tr '\n' ' ')"
echo "~/.npmrc criado: $([ -f "$HOME/.npmrc" ] && echo sim || echo nao)"

# --- hook SessionStart ---
rm -f /tmp/cloud-setup.log /root/env-motoristas
out="$(CLAUDE_CODE_REMOTE=true CLAUDE_PROJECT_DIR="$R" CLAUDE_ENV_FILE=/root/env-motoristas bash .claude/hooks/session-start.sh)"
echo "hook remoto exit=$? | $(printf '%s\n' "$out" | tail -1)"
echo "env-file: $(grep -c 'PATH=' /root/env-motoristas 2>/dev/null) linha(s) PATH | node no PATH novo: $(env -i HOME="$H" bash -c ". /root/env-motoristas; node -v" 2>&1)"
cp /tmp/cloud-setup.log /root/run4-motoristas.log 2>/dev/null

out="$(CLAUDE_PROJECT_DIR="$R" bash .claude/hooks/session-start.sh)"
echo "hook local exit=$? | saida: '${out}'"

mkdir -p /root/sbfail-motoristas/scripts /root/sbfail-motoristas/.claude/hooks
cp .claude/hooks/session-start.sh /root/sbfail-motoristas/.claude/hooks/
printf '#!/usr/bin/env bash\necho "[cloud-setup] simulando erro"\nexit 7\n' > /root/sbfail-motoristas/scripts/cloud-setup.sh
out="$(CLAUDE_CODE_REMOTE=true CLAUDE_PROJECT_DIR=/root/sbfail-motoristas bash /root/sbfail-motoristas/.claude/hooks/session-start.sh)"
echo "hook com falha exit=$? | $(printf '%s\n' "$out" | head -1)"

echo "token vazado nos logs: $(cat /root/run*-motoristas.log | grep -c -e 'gh[po]_' -e "$TOKEN")"
