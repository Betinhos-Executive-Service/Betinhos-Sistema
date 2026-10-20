---
name: verificar-ambiente-cloud
description: "Verifica o preparo da VM cloud do Claude Code do App Motoristas (scripts/cloud-setup.sh chamado pelo hook SessionStart). Use após mudar scripts/cloud-setup.sh, scripts/testa-cloud-setup.sh, .claude/hooks/session-start.sh, .claude/settings.json, package.json/package-lock.json de forma que afete a instalação, .npmrc, .gitattributes ou a seção 'Ambiente cloud' do CLAUDE.md."
---
# Verificar ambiente cloud

## Cobre
- Código: `scripts/cloud-setup.sh`, `scripts/testa-cloud-setup.sh`, `.claude/hooks/session-start.sh`, `.claude/settings.json` (hook `SessionStart`, `startup|resume`, timeout 600 s), `package-lock.json`, `.gitattributes` (`*.sh` em LF).
- O hook só age com `CLAUDE_CODE_REMOTE=true`, grava o PATH do Node no `$CLAUDE_ENV_FILE` (o shell da sessão não lê `~/.bashrc`) e nunca bloqueia a sessão: falha vira o resumo `[cloud-setup] FALHOU ...` no contexto.
- Resultado: VM Linux limpa com Node 24, `npm ci` pelo `package-lock.json` (não pnpm), Chromium reaproveitado da imagem (`$PLAYWRIGHT_BROWSERS_PATH`, build 1194 = `playwright@1.56.1`) ou instalado fora dela (falha só gera AVISO), `tsc` estrito e `npm test` passando. Exige `NODE_AUTH_TOKEN` (read:packages) para o `@betinhos-executive-service/ui` do GitHub Packages; sem ele para com `ERRO: defina NODE_AUTH_TOKEN`, sem gravar `~/.npmrc` (o `.npmrc` do repo lê a variável).

## Preparar ambiente
- Linux limpo que simula a VM. Nesta máquina (Windows): WSL `Ubuntu` como root, em pasta e HOME descartáveis (`/root/sb-motoristas`, `/root/sbhome-motoristas`). Outras sessões usam o mesmo WSL com sufixos próprios; não use `/root/sb`.
- Token: `export NODE_AUTH_TOKEN=$(gh auth token)` e `export WSLENV=NODE_AUTH_TOKEN/u` antes do `wsl.exe` (o script aborta sem ele). Nunca grave o token em arquivo.

## Roteiro
1. `bash -n scripts/cloud-setup.sh && bash -n scripts/testa-cloud-setup.sh` → sem saída de erro.
2. `file scripts/*.sh` → nenhum com `CRLF`.
3. Arquivos novos ainda não commitados: `git add -N <arquivos>` (senão ficam fora do tar).
4. No Git Bash (demora ~15–25 min: quatro instalações completas):
   ```bash
   export MSYS_NO_PATHCONV=1
   git ls-files -z | tar --null -T - -cf /tmp/repo-motoristas.tar
   cp scripts/testa-cloud-setup.sh /tmp/testa-motoristas.sh
   wsl.exe -d Ubuntu -u root bash /mnt/c/Users/mendo/AppData/Local/Temp/testa-motoristas.sh /mnt/c/Users/mendo/AppData/Local/Temp/repo-motoristas.tar
   ```
   (`/tmp` do Git Bash = `C:\Users\mendo\AppData\Local\Temp`.) Esperado:
   - `run0 (sem token) exit=1 | 1 aviso de token`
   - `run1 (limpa, com token) exit=0 | [cloud-setup] Pronto. ...`
   - `run2 (2a execucao) exit=0 | [cloud-setup] Pronto. ... | reinstalou Node: 0` (idempotente)
   - `run3 (Chromium da imagem) exit=0 | 1 reaproveitamento, 0 downloads` (simula a VM real, que já traz Chromium em `$PLAYWRIGHT_BROWSERS_PATH` e bloqueia o CDN)
   - `testes: ℹ pass N ℹ fail 0`
   - `~/.npmrc criado: nao`
   - `hook remoto exit=0 | [cloud-setup] Pronto. ...`
   - `env-file: 1 linha(s) PATH | node no PATH novo: v24...`
   - `hook local exit=0 | saida: ''`
   - `hook com falha exit=0 | [cloud-setup] FALHOU (exit 7). ...`
   - `token vazado nos logs: 0`
   - Erro de rede no WSL (`EAI_AGAIN`, `ECONNRESET`, `Could not resolve host`) ou `Wsl/Service/CreateInstance` não é defeito do script: confira com `getent hosts registry.npmjs.org` e rode de novo. Logs em `/root/run*-motoristas.log` no WSL.

## Evidência obrigatória
- Saída do passo 4 em `.verificacao/<data>-<branch>/teste-wsl.log`.

## Limites
- O WSL simula a VM; a imagem real traz Node 22 em `/opt/node22/bin`, nvm em `/opt/nvm` (o script instala o 24 por ele) e Chromium em `/opt/pw-browsers`, com o CDN do Playwright bloqueado. A prova final é uma sessão cloud nova no ambiente "Padrão" depois do merge (só a branch padrão vale para sessões novas): ela deve abrir com `[cloud-setup] Pronto.` no contexto.
- Se o `pnpm-lock.yaml` voltar a ser o lockfile oficial (campo `packageManager`), troque o passo 2 do script e este roteiro.
