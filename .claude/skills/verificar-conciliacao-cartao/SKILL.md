---
name: verificar-conciliacao-cartao
description: "Verifica a conciliação diária do cartão de crédito (Banco MCP/Open Finance → Dataverse DEV): schema cr40f_cartaocorporativo/cr40f_transacaocartao, privilégios, conector personalizado Betinhos Banco MCP, connection reference new_BetinhosBancoMcp e o flow 'Conciliação do cartão | Diário'. Use após mudar packages/deploy/provision-conciliacao-cartao.ps1, conceder-privilegios-conciliacao-cartao.ps1, provision-conector-banco-mcp.ps1, conectores/banco-mcp.openapi.json, provision-flow-conciliacao-cartao.ps1 ou flows/conciliacao-cartao-diario.* ou a tela apps/shell/src/pages/conciliacao-cartao (#/conciliacao-cartao)."
---
# Verificar conciliação do cartão

## Cobre
- Schema (`provision-conciliacao-cartao.ps1`): `cr40f_cartaocorporativo` (conta, final, vigência DateOnly, motorista), `cr40f_transacaocartao` (chave alternativa em `cr40f_idexterno`, situação, motivo, lookups cartão/despesa/motorista) e `cr40f_despesaoperacional.cr40f_conciliadacartao`.
- Privilégios das duas tabelas para "Acesso-Betinhos-MDA" e "DEV - Usuário".
- Conector `new_betinhos-20banco-20mcp` (só leitura: ListarConexoes, ListarContas, ListarTransacoes) e a referência `new_BetinhosBancoMcp`. A API key fica só na conexão do Power Platform.
- Flow diário 08:00: leitura toda antes de gravar; transação gravada antes de criar/casar despesa; casa por motorista do cartão vigente, forma "Cartão de crédito", valor ±0,05 e compra -1..+2 dias; sem despesa cria uma (origem 100000002, statusoperacional 100000001) para o motorista validar; push `gastos-cartao` por motorista.

## Testes locais (sem Dataverse)
```
cd packages/deploy && node --test flows/conciliacao-cartao-diario.test.mjs
```
Esperado: todos passam (trigger, só leitura no Banco MCP com secureData, ordem leitura → gravação, idempotência e religação, parcelas, filtros, push, tokens sem dado de ambiente, ações e variáveis existentes).

## DRY RUN no DEV (Linux)
```
cd packages/deploy
./rodar-linux.sh provision-conciliacao-cartao.ps1
./rodar-linux.sh conceder-privilegios-conciliacao-cartao.ps1     # falha "Privilegio ... nao existe" até o schema existir
./rodar-linux.sh provision-conector-banco-mcp.ps1
./rodar-linux.sh provision-flow-conciliacao-cartao.ps1           # lista pré-requisitos ausentes até schema e conector existirem
```
Nunca rode com `-Apply` fora da `main` no checkout principal. PROD é bloqueado nos scripts.

## Depois do -Apply (DEV, na main)
1. Ordem: schema → privilégios → conector → flow. O schema termina conferindo colunas, chave e solução AppBetinhos.
2. O Renan cria a conexão "Betinhos Banco MCP" com a key e a liga à referência `new_BetinhosBancoMcp`. Rode o script do flow de novo: ele sai LIGADO.
3. Cadastre um cartão de teste (conta = id da conta CREDIT, final, início da vigência, motorista) e rode o flow manualmente ("Executar") no Power Automate.
4. Confira: transações em `cr40f_transacaocartao` sem duplicar ao rodar duas vezes; nenhuma com motivo "Em processamento"; compra do motorista lançada vira "Conciliada automática" e a despesa fica com `cr40f_conciliadacartao = true`; compra sem lançamento cria a despesa do motorista e a transação fica "Aguardando motorista"; IOF/tarifa "Ignorada"; parcela >1 "Ignorada".
5. Para testar com a API fora do flow use `request_secret` (nunca a key no chat) e só leitura.

## Tela `#/conciliacao-cartao` (shell React)
Arquivos: `apps/shell/src/pages/conciliacao-cartao/` (domain/regras.ts, data/{mock,queries,source}.ts, components/*), item "Conciliação do cartão" no grupo Financeiro (`nav/menu.ts`, ícone `CreditCard` em `app/AppShell.tsx`), rota em `app/routes.tsx`.
- Abas: Para revisar (Pendente, Sem motorista, Divergência), Aguardando motorista (aba própria), Conciliadas (automática + manual), Ignoradas, Cartões. Filtros por cartão, motorista e período (data da compra).
- Ações: Casar (candidatas com o mesmo critério do flow: motorista, forma "Cartão de crédito", valor ±0,05 da compra inteira, gasto de -1 a +2 dias, não recusada/cancelada, não conciliada; grava `cr40f_conciliadacartao = true` na despesa e depois a transação como Conciliada manual), Ignorar (motivo obrigatório), Reabrir (ignorada → Pendente), Reprocessar (sem motorista: acha o cartão vigente como o flow, preferindo o do final ao da conta toda; liga cartão/motorista e volta a Pendente para casar na tela, porque o flow não reclassifica transação já gravada), Cadastrar/editar cartão (bloqueia vigência sobreposta na mesma conta e final).

### Testes locais (mock, sem Dataverse)
```
cd apps/shell
npx vitest run src/pages/conciliacao-cartao src/nav/menu.test.ts src/app/AppShell.icons.test.tsx
cd ../.. && pnpm typecheck
```
Esperado: regras (abas, filtros, ações, vigência final × conta toda, candidatas, $filter, validação do cartão) e página (abas, filtro, casar, ignorar/reabrir, descartar alterações, reprocessar, cadastrar cartão) verdes.
A suíte inteira (`npx vitest run` em `apps/shell`) também deve ficar verde: o `vite.config.ts` roda os testes com `--no-experimental-webstorage`, então o `localStorage` do Node 24 não disputa mais com o do jsdom.

### Navegador (pnpm dev, dados de exemplo)
`pnpm dev` (porta 36472) e abra `http://localhost:36472/#/conciliacao-cartao` em 1366px e 390px. Roteiro: Casar "POSTO SHELL AV BRASIL" com "Combustível Shell" (Pix não aparece); Ignorar "RESTAURANTE SABOR" (clique fora com motivo digitado pede "Descartar alterações?"); "LAVA RAPIDO JARDINS" → "Vincular cartão e motorista" (Nubank conta toda · Elaine) e aparece "Lavagem do carro"; "ESTACIONAMENTO CENTRO" → "Cadastrar cartão" (conta e final já preenchidos) → reabrir e vincular. Sem erro no console, sem rolagem horizontal, versão `vX.Y.Z · dd/mm/aaaa HH:mm` no canto. Script de referência: Playwright com `chromium.launch({ executablePath: <ms-playwright/chromium_headless_shell-*/...> })`.

### No DEV (local, depois do push pela main)
1. Abrir a tela pelo shell no DEV; conferir que carrega transações, cartões e motoristas (erro "Tabela ... não encontrada na metadata" = schema ausente).
2. Cadastrar um cartão de teste e reprocessar uma transação "Sem motorista": conferir no registro `_cr40f_cartao_value`, `_cr40f_motorista_value` e `cr40f_situacao = 100000000`.
3. Casar uma Pendente: despesa com `cr40f_conciliadacartao = true` e transação com `_cr40f_despesa_value` e situação 100000002.
4. Privilégios: usuário sem escrita em `cr40f_transacaocartao`/`cr40f_cartaocorporativo`/`cr40f_despesaoperacional` recebe toast de erro e nada muda na lista.

## Não verificável na nuvem
Tudo que toca Dataverse, conector ou API: só local, com o DEV.
