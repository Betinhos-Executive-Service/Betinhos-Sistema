---
name: verificar-solucoes
description: "Verifica as ferramentas de segmentação da AppBetinhos em 4 soluções (BetinhosCore, Automacao, Interface, Motoristas): classificador, conferência, fotos e distribuidor. Use após mudar packages/deploy/solucoes/** ou antes de exportar as 4 soluções do DEV."
---
# Verificar segmentação da AppBetinhos (soluções)

## Cobre
- Código: `packages/deploy/solucoes/**` (`classificar.mjs`, `conferir.mjs`, `comparar-fotos.mjs`, `arquivo.mjs`, `regras.json`, `dataverse.ps1`, `solucoes.ps1`, `distribuir-solucoes.ps1`, `foto-ambiente.ps1`) e o script `test` de `packages/deploy/package.json`.
- Ambiente: só o DEV (`org23b93544.crm2.dynamics.com`). Todos os passos abaixo são somente leitura; `distribuir-solucoes.ps1 -Aplicar` não faz parte do roteiro.

## Preparar ambiente
- Raiz do repo (ou da worktree). Node e `pnpm` instalados; Windows PowerShell 5.1 (`powershell`).
- Passos 3 e 4 falam com o DEV: usam `DV_CLIENT_ID`/`DV_TENANT_ID`/`DV_CLIENT_SECRET` se existirem; sem eles, abrem o login do módulo MSAL.PS (conta do Renan). Na VM cloud não há credencial do Dataverse: lá só os passos 1 e 2 valem.
- Fotos e ZIPs ficam em `backup/solucoes/` (a pasta `/backup/` está no `.gitignore`). Nunca faça `git add` deles.

## Roteiro
1. Testes Node: `pnpm --filter @betinhos/deploy test` → código 0, `fail 0` (a suíte inclui `classificar`, `conferir`, `comparar-fotos` e `cli`, além dos testes de `flows/`).
2. Testes PowerShell com respostas simuladas (não toca no Dataverse): `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/testa-solucoes.ps1` → código 0, nenhuma linha começando por `FALHA`; a última leitura teve 31 linhas `ok`.
3. Conferência no DEV: `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/distribuir-solucoes.ps1 -SomenteConferir` → código 0 e a linha `[solucoes] conferencia: sem dono 0; em duas 0; fora do lugar 0; dependencias para cima 0`. A última linha `detalhes:` aponta o `relatorio.json` com os ids.
   - Se der `sem dono N` com N > 0, outra sessão adicionou componentes à AppBetinhos no DEV. Identifique cada id (`solutioncomponents?$filter=objectid eq <id>`), rode o mesmo script sem flags (dry run, só mostra "a distribuir" por solução) e peça o ok antes de rodar com `-Aplicar` (só DEV). Depois repita o passo 3 até zerar.
4. Fotos do DEV sem perda: duas fotos seguidas, depois o comparador.
   - `powershell -NoProfile -ExecutionPolicy Bypass -File packages/deploy/solucoes/foto-ambiente.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com -Saida backup/solucoes/foto-a.json`
   - mesmo comando com `-Saida backup/solucoes/foto-b.json`
   - `node packages/deploy/solucoes/comparar-fotos.mjs backup/solucoes/foto-a.json backup/solucoes/foto-b.json` → código 0 e todas as listas de perda vazias (`registrosCairam`, `tabelasSumiram`, `fluxosSumiram`, `fluxosDesligados`, `stepsSumiram`, `stepsDesativados`, `stepsPerderamSeguro`, `variaveisSumiram`, `variaveisMudaram`, `componentesSumiram`).
   - Sinal de segurança: `grep -c '"value"' backup/solucoes/foto-a.json` → `0` (a foto guarda só o hash SHA-256 das variáveis, nunca o valor).
   - Comparar uma foto nova com uma antiga (ex.: a de antes de uma importação) é o uso real: o DEV é vivo e outras sessões criam registros e fluxos, então `registrosMudaram` com contagem diferente é esperado. O que reprova é qualquer lista de perda não vazia (código 1).

## Casos de borda
- Caixa de entrada vazia: `distribuir-solucoes.ps1` aborta com "voltou com 0 componentes" (nunca aprova por vazio); confira a conexão e a solução `AppBetinhos`.
- Assembly dentro de pacote de plug-in aparece como "assembly empacotado" e fica fora da conferência: é esperado (quem carrega é o pacote).
- `SEM REGRA`/`PROIBIDO` nos avisos: componente novo sem regra em `regras.json` ou valor de variável (tipo 381) na caixa; ajuste as regras, não force a distribuição.

## Evidência obrigatória
- A linha `[solucoes] conferencia: ...` do passo 3 e o código de saída.
- A saída completa do comparador do passo 4 (JSON) e o código de saída.
- Resumo dos passos 1 e 2 (`pass N / fail 0`; contagem de `ok` e de `FALHA`).

## Limites
- Só prova o DEV. Nada aqui diz algo sobre TEST (`appbetinhostest.crm2.dynamics.com`) ou PROD (`orgf261ae8e.crm2.dynamics.com`): isso é a Fase 2, com ok de cópia do Renan.
- O DEV muda o tempo todo (outras sessões mexem na AppBetinhos). Rode a conferência de novo antes de cada exportação das 4 soluções; um resultado antigo não vale.
- A conferência cobre dono e dependências dos componentes; não prova que as soluções gerenciadas importam em outro ambiente.
