#!/usr/bin/env bash
# Setup do ambiente cloud do Claude Code (claude.ai/code) para o Sistema Betinhos.
# Cada sessão cloud roda numa VM Linux própria: este script deixa a VM pronta para
# codar, rodar typecheck/testes e verificar a UI no navegador headless.
#
# Roda pelo hook SessionStart (.claude/hooks/session-start.sh) a cada sessão cloud: o NODE_AUTH_TOKEN das
# variáveis do ambiente só existe dentro da sessão, não no setup script do ambiente.
#   Variável do ambiente: NODE_AUTH_TOKEN = token do GitHub com read:packages (Design System no GitHub Packages)
# Nunca coloque credenciais do Dataverse aqui: a VM não publica nada (ver CLAUDE.md, "Ambiente cloud").
set -euo pipefail
cd "$(dirname "$0")/.."

log() { printf '\n[cloud-setup] %s\n' "$*"; }

# 1. Node 24 (mesma versão do CI)
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [ "$(node_major)" -lt 24 ]; then
  # Usa o nvm que já existir (a imagem cloud traz um em /opt/nvm); senão instala em ~/.nvm.
  for d in "${NVM_DIR:-}" /opt/nvm "$HOME/.nvm"; do
    if [ -n "$d" ] && [ -s "$d/nvm.sh" ]; then export NVM_DIR="$d"; break; fi
  done
  if [ ! -s "${NVM_DIR:-}/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  fi
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  if ! nvm use 24 >/dev/null 2>&1; then
    log "Instalando Node 24 (atual: $(node -v 2>/dev/null || echo nenhum))"
    nvm install 24 >/dev/null
  fi
  nvm alias default 24 >/dev/null
  # Shells novos (inclusive os da sessão) começam com o Node da imagem na frente do PATH (/opt/node22/bin):
  # fixa o Node 24 no fim do ~/.bashrc (interativos) e do ~/.profile (login), trocando a linha de uma execução anterior.
  NODE24_PATH="export PATH=\"$(dirname "$(nvm which 24)"):\$PATH\"  # cloud-setup: node 24"
  for rc in "$HOME/.bashrc" "$HOME/.profile"; do
    sed -i '/# cloud-setup: node 24$/d' "$rc" 2>/dev/null || true
    echo "$NODE24_PATH" >> "$rc"
  done
fi
log "Node $(node -v)"
# Rodando pelo hook SessionStart: o shell da sessão não lê o ~/.bashrc (sai cedo em shell não interativo),
# então o PATH do Node 24 vai pelo arquivo de ambiente da sessão.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$(dirname "$(command -v node)"):\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

# 2. pnpm na versão do packageManager
PNPM_VERSION="$(node -p 'require("./package.json").packageManager.split("@")[1]')"
corepack enable
corepack prepare "pnpm@${PNPM_VERSION}" --activate
log "pnpm $(pnpm -v)"

# 3. Acesso ao GitHub Packages (@betinhos-executive-service/ui e tokens)
if [ -z "${NODE_AUTH_TOKEN:-}" ]; then
  echo "[cloud-setup] ERRO: defina NODE_AUTH_TOKEN (token GitHub com read:packages) nas variáveis do ambiente cloud." >&2
  exit 1
fi
grep -q 'npm.pkg.github.com/:_authToken' "$HOME/.npmrc" 2>/dev/null \
  || echo '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}' >> "$HOME/.npmrc"

# 4. Dependências (lockfile congelado, igual ao CI)
pnpm install --frozen-lockfile

# 5. Navegador headless para as skills verificar-<area> (screenshots da UI em modo mock)
# A imagem cloud já traz o Chromium em $PLAYWRIGHT_BROWSERS_PATH (/opt/pw-browsers, build 1194 = playwright 1.56.1)
# e o proxy bloqueia o CDN do Playwright: se os builds desta versão já estão lá, não baixa nada.
PLAYWRIGHT_VERSION=1.56.1
PW_DIRS="$(npx -y "playwright@${PLAYWRIGHT_VERSION}" install --dry-run chromium 2>/dev/null | sed -n 's/^ *Install location: *//p' || true)"
pw_instalado() {
  [ -n "$PW_DIRS" ] || return 1
  while read -r dir; do [ -d "$dir" ] || return 1; done <<< "$PW_DIRS"
}
if pw_instalado; then
  log "Chromium do playwright@${PLAYWRIGHT_VERSION} já instalado em ${PLAYWRIGHT_BROWSERS_PATH:-~/.cache/ms-playwright}; reaproveitando"
elif ! npx -y "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium; then
  # Distro mais nova que a lista do Playwright: usa o build do Ubuntu 24.04, compatível.
  log "Plataforma não reconhecida pelo Playwright; usando build ubuntu24.04"
  PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npx -y "playwright@${PLAYWRIGHT_VERSION}" install chromium
fi

# 6. Checagem rápida: se isto falhar, a VM não está pronta
pnpm typecheck
log "Pronto. Dev server: pnpm dev (porta 36472, modo mock sem Dataverse). Testes: pnpm test."
