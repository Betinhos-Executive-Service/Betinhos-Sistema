---
name: verificar-deploy-dev
description: "Verifica o workflow Deploy do GitHub Actions que publica a tela do Sistema Betinhos no DEV (push na branch dev). Use após mudar .github/workflows/deploy.yml, ou quando o deploy automático do plantão falhar."
---
# Verificar deploy automático no DEV

## Cobre
- `.github/workflows/deploy.yml` (só DEV; job `dev`, runner Windows, environment `dev` do GitHub).

## Roteiro
1. YAML válido: `python -c "import yaml;yaml.safe_load(open('.github/workflows/deploy.yml',encoding='utf-8'))"` sem erro; gatilhos só `push` em `dev` (com `paths`) e `workflow_dispatch`; nenhum job para test/prod.
2. Workflow ativo: `gh api repos/Betinhos-Executive-Service/Betinhos-Sistema/actions/workflows -q '.workflows[]|select(.path==".github/workflows/deploy.yml").state'` = `active`.
3. Execução real (publica a `main` atual no DEV; só com ok do Renan na primeira vez): `gh workflow run deploy.yml --ref dev`, depois `gh run watch <id> --exit-status` → sucesso; no resumo da execução "Publicado no DEV - vX.Y.Z".
4. DEV mostra a mesma versão: rodapé de `https://org23b93544.crm2.dynamics.com/WebResources/cr40f_SistemaBetinhos.html` (force o cache, ver verificar-shell) = vX.Y.Z do passo 3, maior que a anterior.
5. Custo: duração do job no resumo da execução (referência: alguns minutos; acima de 15 é cancelado).

## Evidência obrigatória
- Saída do passo 1 e, quando executado, link/id da execução e a versão do rodapé.

## Limites
- Push em `dev` que só muda documentação, skills ou scripts do plantão não dispara (filtro `paths`); use `workflow_dispatch` para forçar.
