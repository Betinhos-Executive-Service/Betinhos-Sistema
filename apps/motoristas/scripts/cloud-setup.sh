#!/usr/bin/env bash
# Preparo da VM das sessões cloud do Claude Code (claude.ai/code, ambiente "Padrão") para o App Motoristas.
# Quem chama é o hook SessionStart (.claude/hooks/session-start.sh), dentro da sessão; o setup script
# do ambiente fica vazio. Deixa a VM pronta para codar, rodar typecheck/testes/build e verificar a UI
# (modo mock em localhost) no Chromium headless. Idempotente.
#
# Adaptado do modelo genérico: o repo tem dois lockfiles e o oficial é o package-lock.json (npm,
# atualizado a cada build); o pnpm-lock.yaml está defasado. Exige NODE_AUTH_TOKEN (token GitHub com read:packages)
# nas variáveis do ambiente cloud: o logger de erros vem de @betinhos-executive-service/ui no GitHub Packages.
# Nunca coloque credenciais do Dataverse aqui: a VM não publica nada (ver CLAUDE.md, "Ambiente cloud").
set -euo pipefail
cd "$(dirname "$0")/.."

log() { printf '\n[cloud-setup] %s\n' "$*"; }

# 1. Node 24 (os testes usam --experimental-strip-types, que exige Node >= 22.6)
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
  # 2ª execução: reaproveita o Node 24 já instalado (sem consultar a lista remota de versões)
  if ! nvm use 24 >/dev/null 2>&1; then
    log "Instalando Node 24 (atual: $(node -v 2>/dev/null || echo nenhum))"
    nvm install 24 >/dev/null
  fi
  nvm alias default 24 >/dev/null
fi
log "Node $(node -v)"
# O shell da sessão não lê ~/.bashrc: o PATH do Node vai pelo arquivo de ambiente da sessão (hook SessionStart).
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$(dirname "$(command -v node)"):\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

# 2. Dependências pelo lockfile oficial (npm). O .npmrc do repo lê o token de NODE_AUTH_TOKEN.
if [ -z "${NODE_AUTH_TOKEN:-}" ]; then
  echo "[cloud-setup] ERRO: defina NODE_AUTH_TOKEN (token GitHub com read:packages) nas variáveis do ambiente cloud." >&2
  exit 1
fi
npm ci --no-audit --no-fund

# 3. Navegador headless para as skills verificar-<area> (screenshots da UI em modo mock).
# A VM cloud já traz Chromium em $PLAYWRIGHT_BROWSERS_PATH (build 1194 = playwright@1.56.1) e bloqueia
# o CDN do Playwright: reaproveita. Fora dela tenta instalar; falha vira aviso, não derruba o setup.
PLAYWRIGHT_VERSION=1.56.1
if compgen -G "${PLAYWRIGHT_BROWSERS_PATH:-/nonexistent}/chromium*" >/dev/null; then
  log "Chromium da imagem em $PLAYWRIGHT_BROWSERS_PATH; use playwright@${PLAYWRIGHT_VERSION} (não baixe outro)"
else
  npx -y "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium \
    || PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npx -y "playwright@${PLAYWRIGHT_VERSION}" install chromium \
    || log "AVISO: Chromium não instalado (rede bloqueada?); sem verificação visual nesta VM"
fi

# 4. Checagem rápida: se isto falhar, a VM não está pronta
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
npm test --silent
log "Pronto. Dev server: npm run dev (porta 5173, modo mock em localhost sem Dataverse). Build: npm run build."
