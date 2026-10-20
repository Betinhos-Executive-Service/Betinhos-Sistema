---
name: verificar-plantao
description: "Verifica o plantão de erros: coletor (scripts/plantao/coletar.mjs), mascaramento de dados pessoais (scripts/plantao/mascarar.mjs) e a identidade só-leitura (packages/deploy/criar-identidade-plantao.ps1). Use após mudar scripts/plantao/** ou o script da identidade."
---
# Verificar plantão de erros

## Cobre
- `scripts/plantao/mascarar.mjs` (+ teste), `scripts/plantao/coletar.mjs`, `packages/deploy/criar-identidade-plantao.ps1`, `.claude/skills/plantao-erros`.

## Preparar ambiente
- Node 24. Local: `az login` com acesso de leitura ao DEV e ao PROD. Nuvem: variáveis `PLANTAO_TENANT_ID`, `PLANTAO_CLIENT_ID`, `PLANTAO_CLIENT_SECRET` (ambiente cloud "Plantão").

## Roteiro
1. `node --test scripts/plantao/mascarar.test.mjs` → todos passam.
2. Coleta real (somente leitura): `node scripts/plantao/coletar.mjs --desde <7 dias atrás> > .verificacao/<pasta>/coleta.json` → exit 0, `falhas: []`, `flowsProd` com grupos (nome do flow, ocorrências, `errorcode`), `appDev` lista (pode ser vazia) e `appProd` lista ou aviso de tabela ausente.
3. Sem dado pessoal na coleta: `grep -cE "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}" coleta.json` = 0 e nenhum telefone/CPF legível.
4. Sem credencial (fora da nuvem e sem az): `az logout` não é necessário; simule com `PATH=` vazio só para o comando → `falhas` com "sem credencial", exit 1, nenhum token impresso.
5. Identidade: `powershell -File packages/deploy/criar-identidade-plantao.ps1` (sem `-Apply`) → só linhas `DRY RUN`; no PROD apenas `prvReadflowrun, prvReadWorkflow` (+ `prvReadcr40f_errodosistema` quando a tabela existir); no DEV também `prvWritecr40f_errodosistema`. Nenhum segredo na saída.
6. Depois do `-Apply` (feito pelo Renan): na nuvem, `node scripts/plantao/coletar.mjs` com as variáveis `PLANTAO_*` → mesmo resultado do passo 2. Tentar escrever no PROD com esse token (ex.: `PATCH` num `workflow`) → HTTP 403.

## Evidência obrigatória
- Saída do `node --test`, a coleta mascarada e o log do dry run em `.verificacao/<data>-<branch>/`.

## Limites
- A IA não executa `-Apply` (cria credencial e muda segurança do PROD): é do Renan.
