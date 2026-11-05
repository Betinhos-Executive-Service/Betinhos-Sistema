---
name: verificar-deploy-dev
description: "Verifica o workflow Deploy do GitHub Actions que publica no DEV a tela do Sistema Betinhos e os plugins (push na branch develop). Use após mudar .github/workflows/deploy.yml, pendentes-dev.ps1, push-plugins-dev.ps1, mudancas-dev.mjs ou um registrador de plugin, ou quando o deploy automático do plantão falhar."
---
# Verificar deploy automático no DEV

## Cobre
- `.github/workflows/deploy.yml` (só DEV; job `dev`, runner Windows, environment `dev` do GitHub).
- `packages/deploy/pendentes-dev.ps1` (o que o DEV ainda não tem; também é a trava do `publicar.yml`), `packages/deploy/mudancas-dev.mjs` (que arquivo é de qual peça), `packages/deploy/push-plugins-dev.ps1` e os registradores `packages/plugins/tools/Cr40f.*.Registrar` (conta de serviço quando há `DV_CLIENT_SECRET`; commit na descrição do assembly só com `GITHUB_ACTIONS=true`).

## Roteiro
1. YAML válido: `python -c "import yaml;yaml.safe_load(open('.github/workflows/deploy.yml',encoding='utf-8'))"` sem erro; gatilhos só `push` em `develop` (com `paths`) e `workflow_dispatch`; nenhum job para test/prod.
2. Workflow ativo: `gh api repos/Betinhos-Executive-Service/Betinhos-Sistema/actions/workflows -q '.workflows[]|select(.path==".github/workflows/deploy.yml").state'` = `active`.
3. Execução real (publica a `develop` atual no DEV; só com ok do Renan na primeira vez): `gh workflow run deploy.yml --ref develop`, depois `gh run watch <id> --exit-status` → sucesso; no resumo da execução "Publicado no DEV - vX.Y.Z".
4. DEV mostra a mesma versão: rodapé de `https://org23b93544.crm2.dynamics.com/WebResources/cr40f_SistemaBetinhos.html` (force o cache, ver verificar-shell) = vX.Y.Z do passo 3, maior que a anterior.
5. Custo: duração do job no resumo da execução (referência: alguns minutos; acima de 15 é cancelado).
6. Regras de arquivo → peça: `node --test packages/deploy/mudancas-dev.test.mjs` → todos passam.
7. Pendentes (somente leitura, PowerShell 5.1 com `DV_*` do DEV): `powershell -File packages/deploy/pendentes-dev.ps1` → JSON `{tela, plugins, motivos}`; logo depois de um Deploy verde da `develop`, `tela:false` e `plugins:[]`. No log do Deploy, o passo "O que o DEV ainda não tem" lista os motivos e "Publicar os plugins" mostra `[plugins] <nome> publicado em N s` para cada um.
8. Commit nos plugins: `pluginassemblies?$select=name,description&$filter=startswith(name,'Cr40f.')` no DEV → cada descrição = sha de 40 caracteres de um commit da `develop`.
9. Versão nunca retrocede (`packages/deploy/bump-version.mjs` + `push-dev.ps1 -Build`): `node --test packages/deploy/bump-version.test.mjs` → 5 passam. No log do job: `[push-dev] versao publicada no DEV: vA` seguido de `Build vB` com B > A; no DEV, a descrição de `cr40f_SistemaBetinhos.html` = `vB <sha do commit>` (`webresourceset?$select=description`). Um `pnpm push` local logo depois deve publicar vB+1, não voltar ao número do repo. Primeira execução após esta mudança mostra "desconhecida" (descrição ainda vazia).

## Evidência obrigatória
- Saída do passo 1 e, quando executado, link/id da execução e a versão do rodapé.

## Limites
- Push em `develop` que só muda documentação, skills ou scripts do plantão não dispara (filtro `paths`); use `workflow_dispatch` para forçar (`forcar_tela`, `forcar_plugins` = `frota,acesso` ou `todos`).
- Flows e schema (`provision-*`) não passam pelo Deploy: usam `az login` e conexões do usuário.
- Secrets necessários no environment `dev`: `DV_CLIENT_SECRET`, `PLUGIN_SNK_<NOME>` (base64 do `.snk` de `%USERPROFILE%\.codex\keys`; nunca gerar outro, muda o public key token) e variáveis `ACESSO_*` (as do `.env` local).
