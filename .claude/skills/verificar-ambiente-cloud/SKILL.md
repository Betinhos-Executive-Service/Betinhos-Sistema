---
name: verificar-ambiente-cloud
description: "Verifica o setup da VM cloud do Claude Code (scripts/cloud-setup.sh). Use após mudar scripts/cloud-setup.sh, package.json/packageManager, pnpm-lock.yaml de forma que afete instalação, .npmrc ou a seção 'Ambiente cloud' do CLAUDE.md."
---
# Verificar ambiente cloud

## Cobre
- Código: `scripts/cloud-setup.sh`, `.npmrc`, `package.json` (`packageManager`).
- Resultado: VM Linux limpa com Node 24, pnpm da versão do `packageManager`, dependências instaladas, Chromium do Playwright e `pnpm typecheck` passando.

## Preparar ambiente
- Linux limpo que simula a VM. Nesta máquina (Windows): WSL `Ubuntu` como root, em pasta e HOME temporários (Docker Desktop também serve, se estiver rodando).
- Token: `NODE_AUTH_TOKEN="$(gh auth token)"` (a conta precisa de `read:packages`). Nunca imprima o token.

## Roteiro
1. `bash -n scripts/cloud-setup.sh` → sem saída (sintaxe ok).
2. Arquivos novos ainda não commitados: `git add -N <arquivos>` (senão ficam fora do tar).
3. No Git Bash, rode o teste completo num Linux limpo (um teste por vez; todos usam `/root/sb` no WSL):
   ```bash
   export MSYS_NO_PATHCONV=1 NODE_AUTH_TOKEN="$(gh auth token)" WSLENV=NODE_AUTH_TOKEN/u
   git ls-files -z | tar --null -T - -cf /tmp/repo.tar
   cp scripts/testa-cloud-setup.sh /tmp/testa.sh
   wsl.exe -d Ubuntu -u root bash /mnt/c/Users/mendo/AppData/Local/Temp/testa.sh /mnt/c/Users/mendo/AppData/Local/Temp/repo.tar
   ```
   (`/tmp` do Git Bash = `C:\Users\mendo\AppData\Local\Temp`.) Esperado:
   - `run1 exit=0 | [cloud-setup] Pronto. ...` (instalação limpa)
   - `run2 exit=0 | [cloud-setup] Pronto. ...` (idempotente)
   - `linhas de token no ~/.npmrc: 1`
   - `sem-token exit=1 | ERRO: defina NODE_AUTH_TOKEN`
   - `token vazado nos logs: 0`

## Evidência obrigatória
- Saída do passo 3 em `.verificacao/<data>-<branch>/teste-wsl.log`.

## Limites
- O WSL/Docker simula a VM, mas a imagem da nuvem pode já trazer Node/pnpm. Depois de mudar o script, a primeira sessão cloud real confirma o comportamento; relate se o setup falhar lá.
