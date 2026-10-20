---
name: verificar-ambiente-cloud
description: "Verifica o preparo da VM das sessões cloud do Claude Code: hook SessionStart (.claude/hooks/session-start.sh + .claude/settings.json) que roda scripts/cloud-setup.sh. Use após mudar esses arquivos, o .gitignore de .claude/, package.json/packageManager, pnpm-lock.yaml de forma que afete instalação, .npmrc ou a seção 'Ambiente cloud' do CLAUDE.md."
---
# Verificar ambiente cloud

## Cobre
- Código: `scripts/cloud-setup.sh`, `.claude/hooks/session-start.sh`, `.claude/settings.json` (hook SessionStart, matcher `startup|resume`, timeout 600 s), `.gitignore` (exceções `!.claude/hooks/` e `!.claude/settings.json`), `.npmrc`, `package.json` (`packageManager`), `scripts/testa-cloud-setup.sh`.
- Como funciona: o setup script do ambiente "Padrão" em claude.ai/code fica vazio; o hook roda o `cloud-setup.sh` a cada sessão (saída em `/tmp/cloud-setup.log`) e não faz nada fora da nuvem (`CLAUDE_CODE_REMOTE` ≠ `true`). O script usa o nvm da imagem (`/opt/nvm`) para o Node 24 e grava o PATH no `$CLAUDE_ENV_FILE`, instala o pnpm do `packageManager`, faz `pnpm install --frozen-lockfile`, reaproveita o Chromium da imagem (`$PLAYWRIGHT_BROWSERS_PATH`, playwright 1.56.1 = build 1194) e termina com `pnpm typecheck`.
- Referência numa sessão nova: hook ~30 s; `pnpm test` ~2–2,5 min (shell: 145 arquivos, 1264 testes); `GeralPage.test.tsx` ~100–190 s.

## Roteiro A — rápido, na própria sessão cloud (depois de mudar o script)
1. Sintaxe: `bash -n scripts/cloud-setup.sh && bash -n .claude/hooks/session-start.sh && node -e 'JSON.parse(require("fs").readFileSync(".claude/settings.json"))'` → sem saída.
2. Hook em ambiente limpo, simulando a sessão nova (nunca imprima o token):
   ```bash
   T=$(mktemp -d); OUT=$T/hook.log; P=/opt/node22/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
   base=(HOME="$HOME" PATH="$P" PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-}"
     HTTP_PROXY="${HTTP_PROXY:-}" HTTPS_PROXY="${HTTPS_PROXY:-}" NO_PROXY="${NO_PROXY:-}"
     http_proxy="${http_proxy:-}" https_proxy="${https_proxy:-}" no_proxy="${no_proxy:-}"
     NODE_EXTRA_CA_CERTS="${NODE_EXTRA_CA_CERTS:-}" SSL_CERT_FILE="${SSL_CERT_FILE:-}"
     CLAUDE_PROJECT_DIR="$PWD")
   hook() { env -i "${base[@]}" "$@" bash .claude/hooks/session-start.sh; }
   : > /tmp/cloud-setup.log
   hook NODE_AUTH_TOKEN="$NODE_AUTH_TOKEN" CLAUDE_CODE_REMOTE=true CLAUDE_ENV_FILE=$T/env > $T/r1.out
   echo "hook exit=$? | $(tail -1 $T/r1.out)" | tee $OUT
   echo "env file: $(cat $T/env)" | tee -a $OUT
   echo "shell novo: $(env -i "${base[@]}" bash -c ". $T/env; node -v")" | tee -a $OUT
   hook CLAUDE_CODE_REMOTE=true CLAUDE_ENV_FILE=$T/env2 > $T/r2.out
   echo "sem token exit=$? | $(grep -o 'FALHOU.*' $T/r2.out | head -1)" | tee -a $OUT
   hook NODE_AUTH_TOKEN=x > $T/r3.out
   echo "sem CLAUDE_CODE_REMOTE exit=$? | saída: $(wc -c < $T/r3.out) bytes" | tee -a $OUT
   echo "linhas _authToken no ~/.npmrc: $(grep -c _authToken ~/.npmrc)" | tee -a $OUT
   echo "tokens nos logs: $(cat /tmp/cloud-setup.log $T/*.out | grep -c 'gh[pos]_')" | tee -a $OUT
   ```
   Esperado: `hook exit=0 | [cloud-setup] Pronto. ...`; env file com o PATH do Node 24 (`.../v24.x/bin`); shell novo `v24.x`; `sem token exit=0 | FALHOU (exit 1)...` (a sessão não trava); `sem CLAUDE_CODE_REMOTE exit=0 | saída: 0 bytes`; `_authToken: 1`; `tokens nos logs: 0`.

## Roteiro B — definitivo, numa sessão cloud nova (depois do merge na `main`)
Só a `main` vale para sessões novas. Abra uma sessão no ambiente "Padrão", somente leitura: não rode o `cloud-setup.sh` nem ajuste o PATH à mão. Confira:
- `/tmp/cloud-setup.log` com uma única execução terminando em `Pronto.`, sem `ERRO`/`FALHOU` (`grep -c 'Node v' /tmp/cloud-setup.log` → 1).
- `grep -o 'has_init_script:[a-z]*' /tmp/environment-manager.out` → `has_init_script:false`.
- A mensagem `[cloud-setup] Pronto.` do hook aparece no contexto inicial.
- `node -v` → v24 sem ajuste manual.
- `pnpm typecheck` e `pnpm test` verdes (tempos da referência acima).
- `pnpm dev` sobe na 36472 sem `netstat: not found`.
- Screenshot: `npx -y playwright@1.56.1 screenshot --wait-for-timeout=4000 --viewport-size=1440,900 http://localhost:36472 /tmp/shell.png` → shell em modo mock.

## Roteiro C — opcional, Linux limpo fora da imagem cloud (WSL)
Testa o `cloud-setup.sh` sem `/opt/nvm` nem Chromium pré-instalado (baixa Node 24 e Chromium; o hook não entra). No Git Bash desta máquina (Windows), com o WSL `Ubuntu`:
```bash
export MSYS_NO_PATHCONV=1 NODE_AUTH_TOKEN="$(gh auth token)" WSLENV=NODE_AUTH_TOKEN/u
git ls-files -z | tar --null -T - -cf /tmp/repo.tar   # arquivos novos: git add -N antes
cp scripts/testa-cloud-setup.sh /tmp/testa.sh
wsl.exe -d Ubuntu -u root bash /mnt/c/Users/mendo/AppData/Local/Temp/testa.sh /mnt/c/Users/mendo/AppData/Local/Temp/repo.tar
```
Esperado: `run1 exit=0 | ... Pronto.`, `run2 exit=0 | ... Pronto.` (idempotente), `_authToken: 1`, `sem-token exit=1 | ERRO: defina NODE_AUTH_TOKEN` (o script falha; quem segura a sessão é o hook), `token vazado nos logs: 0`.

## Armadilhas conhecidas
- O `NODE_AUTH_TOKEN` não chega ao setup script do ambiente, só à sessão: por isso o preparo está no hook.
- O `~/.bashrc` da imagem sai cedo em shell não interativo: o PATH do Node 24 só chega à sessão pelo `$CLAUDE_ENV_FILE`.
- O proxy bloqueia `cdn.playwright.dev`: use o Chromium da imagem. Ao trocar a versão do Playwright, confira o build com `npx -y playwright@X install --dry-run chromium`.
- `pkill -f <padrão>` mata o próprio shell quando o padrão aparece no comando: encerre pelo PID.

## Evidência obrigatória
- Saída do roteiro A em `.verificacao/<data>-<branch>/hook.log`.
- Relatório da sessão nova (roteiro B), quando houver.
