---
name: verificar-conciliacao-cartao
description: "Verifica a conciliação diária do cartão de crédito (Banco MCP/Open Finance → Dataverse DEV): schema cr40f_cartaocorporativo/cr40f_transacaocartao, privilégios, conector personalizado Betinhos Banco MCP, connection reference new_BetinhosBancoMcp e o flow 'Conciliação do cartão | Diário'. Use após mudar packages/deploy/provision-conciliacao-cartao.ps1, conceder-privilegios-conciliacao-cartao.ps1, provision-conector-banco-mcp.ps1, conectores/banco-mcp.openapi.json, provision-flow-conciliacao-cartao.ps1 ou flows/conciliacao-cartao-diario.* ou a tela apps/shell/src/pages/conciliacao-cartao (#/conciliacao-cartao)."
---
# Verificar conciliação do cartão

## Cobre
- Schema (`provision-conciliacao-cartao.ps1`): `cr40f_cartaocorporativo` (conta, final, vigência DateOnly, motorista), `cr40f_transacaocartao` (chave alternativa em `cr40f_idexterno`, situação, motivo, lookups cartão/despesa/motorista) e `cr40f_despesaoperacional.cr40f_conciliadacartao`.
- Privilégios das duas tabelas para "Acesso-Betinhos-MDA" e "DEV - Usuário".
- Conector `new_betinhos-20banco-20mcp` (só leitura: ListarConexoes, ListarContas, ListarTransacoes) e a referência `new_BetinhosBancoMcp`. A API key fica só na conexão do Power Platform.
- Flow diário 08:07 (fora da hora cheia; `Conexoes`, `Contas` e `Transacoes_pagina` com retry próprio depois do 429 do Pluggy de 06/11, causa não provada): leitura toda antes de gravar, mas só entra conta lida por inteiro e a falha de uma conexão não impede gravar as outras (a conta não lida volta na janela D-10 seguinte; o run fica Failed; conta com mais de 20 páginas de 500 fica de fora sem marcar falha); transação gravada antes de criar/casar despesa; casa por motorista do cartão vigente, forma "Cartão de crédito", valor ±0,05 e compra -1..+2 dias; sem despesa cria uma (origem 100000002, statusoperacional 100000001) para o motorista validar; push `gastos-cartao` por motorista.

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
- O histórico do run esconde entradas e saídas (secureData): o id da conta (`cr40f_idconta`) para cadastrar cartão sai das transações já gravadas. Conta da Betinhos (a0c4fcc8…) não traz final; a da DePaula (dea94c56…) traz. Falha de uma transação aparece só em `actions/<nome>/repetitions` (paginado por `nextLink`); o banco já mandou `merchant` como texto, e `Dados` precisa aguentar isso.
- Tipo: no Open Finance `operationType = PAGAMENTO` é compra com o cartão (o Itaú da DePaula manda assim em todas). Pagamento de fatura é crédito (valor < 0 ou type CREDIT) com PAGAMENTO/PAGTO na descrição. Conferir depois de cada run: nenhuma transação de valor positivo com tipo Pagamento de fatura (100000002).
- `Dono_motorista` (e `_R`) passa a despesa para o usuário do motorista; se o papel dele no ambiente não tem leitura de `cr40f_despesaoperacional`, falha com Forbidden e o flow segue (despesa fica com o dono do flow e ligada à transação). Conferir depois do run: nenhuma despesa "Criado pela conciliação do cartão" sem transação apontando para ela.
- Tempo real (gerados de `flows/conciliacao-cartao-tempo-real.mjs` a partir do diário, publicados pelo mesmo provision): "Conciliação do cartão | Reprocessada" (gatilho em cr40f_transacaocartao com o filtro de `Reabertas`; roda o corpo de `Cada_reaberta`) e "Conciliação do cartão | Despesa atualizada" (gatilho em cr40f_despesaoperacional com conciliadacartao e status fora de Precisa corrigir: Enviado/Validado concilia, Recusado/Cancelado diverge). Teste: reprocessar uma compra e, em até ~1 min, ver a despesa criada; completar a despesa no App e ver a transação sair de Aguardando motorista. O push continua só no diário.
- Varredura no diário (ações `Paradas` e `Cada_parada`): transação em Aguardando motorista cuja despesa já saiu de "Precisa corrigir" é concluída na execução seguinte, com a mesma regra do flow Despesa atualizada (Recusado/Cancelado → Divergência; demais → Conciliada automática). Rede de segurança para quando o gatilho falhou; em operação normal `Paradas` volta vazio. Provar: desligar "Despesa atualizada", completar a despesa de teste, religar, rodar o diário e conferir a situação.
- Divergência depois de conciliar (recusada, cancelada, excluída ou desativada): (1) tempo real, "Despesa atualizada": status Recusado/Cancelado leva as transações ligadas em Conciliada automática ou manual para Divergência, motivo "A despesa ligada a esta compra foi recusada ou cancelada depois de conciliada; confira a cobrança."; Enviado/Validado não mexe nelas. (2) Diário, ações `Excluidas`/`Cada_excluida` (entre `Cada_parada` e o push, depois de tudo que cria ou liga despesa no run): compra ativa sem despesa ativa ligada (o Dataverse zera o lookup ao excluir, relação RemoveLink, então não há gatilho; despesa desativada também conta) em Conciliada automática, Conciliada manual ou Aguardando motorista e alterada antes do início do run vira Divergência, motivo "A compra está sem despesa ativa ligada (excluída, desativada ou o vínculo falhou); confira a cobrança." O corte por `modifiedon` existe porque `Gravar_situacao`/`Gravar_reaberta` gravam a situação antes de ligar a despesa: linha mexida no próprio run (ou pelo Reprocessar ao mesmo tempo) fica para o diário seguinte; Pendente, Sem motorista, Ignorada e Divergência não mudam.
- Prova no DEV (valor R$ 1,23, nome 'TESTE CONCILIAÇÃO', sem motorista real e sem push; apague tudo no fim): crie uma transação de compra e uma despesa do cartão (`cr40f_conciliadacartao = true`, Validado) ligadas entre si, a transação em Conciliada automática. (a) Mude a despesa para Recusado e, em até ~1 min, confira a transação em Divergência com o motivo de recusa; repita com Conciliada manual e com Cancelado; com Validado a situação não muda. (b) Volte a transação para Conciliada automática, exclua a despesa, rode o diário e confira Divergência com o motivo de exclusão e o run sem falha na checagem final. (c) Uma transação Pendente sem despesa continua Pendente.
5. Para testar com a API fora do flow use `request_secret` (nunca a key no chat) e só leitura.

## Tela `#/conciliacao-cartao` (shell React)
Arquivos: `apps/shell/src/pages/conciliacao-cartao/` (domain/regras.ts, data/{mock,queries,source}.ts, components/*), item "Conciliação do cartão" no grupo Financeiro (`nav/menu.ts`, ícone `CreditCard` em `app/AppShell.tsx`), rota em `app/routes.tsx`.
- Abas: Para revisar (Pendente, Sem motorista, Divergência), Aguardando motorista (aba própria), Conciliadas (automática + manual), Ignoradas, Cartões. Filtros por cartão, motorista e período (data da compra).
- Ações: Casar (candidatas com o mesmo critério do flow: motorista, forma "Cartão de crédito", valor ±0,05 da compra inteira, gasto de -1 a +2 dias, não recusada/cancelada, não conciliada; grava `cr40f_conciliadacartao = true` na despesa e depois a transação como Conciliada manual), Ignorar (motivo obrigatório), Reabrir (ignorada → Pendente), Reprocessar (sem motorista: acha o cartão vigente como o flow, preferindo o do final ao da conta toda; liga cartão/motorista e volta a Pendente; na execução seguinte o passo `Reabertas`/`Cada_reaberta` do flow aplica a mesma regra do lançamento novo: casa com a despesa, marca divergência ou cria a despesa para o motorista validar, e o push sai no mesmo run), Cadastrar/editar cartão (bloqueia vigência sobreposta na mesma conta e final).

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
5. IA valida a despesa do cartão (flow "Despesas | Análise IA", depois de `pnpm --filter @betinhos/despesas-ia constantes` e `provision-flow-despesas-ia.ps1 -SomenteValidar`; valor R$ 1,23, nome 'TESTE CONCILIAÇÃO', apague no fim): (a) despesa com `cr40f_origem = 100000002`, `cr40f_conciliadacartao = true`, comprovante anexado e `cr40f_statusanexo = 100000002` (Completo): em até ~2 min `cr40f_iastatusanalise` sai de vazio/100000000 para Concluída e o run do flow mostra `valorDoExtratoCartao: true` no `Contexto`. (b) Mesma despesa com comprovante de outro valor: decisão `precisa_corrigir`, motivos pedem o comprovante certo e não pedem para corrigir o valor. (c) Despesa com origem 100000002 sem `cr40f_conciliadacartao`, ou com a IA em andamento (100000001), ou concluída numa despesa Validado: o flow não dispara. (e) Depois de (b), simule o reenvio do App: anexo antigo continua Enviado, crie o anexo novo, grave `cr40f_statusoperacional` = 100000000 (Enviado), `new_uploadexpectedcount` = 1 e `cr40f_statusanexo` 100000001 e depois 100000002: a IA analisa de novo e o run mostra só o anexo novo em `Comprovantes` (vale também para o App). (d) Despesa do App (origem 100000000): continua disparando, com `valorDoExtratoCartao: false`.

## Não verificável na nuvem
Tudo que toca Dataverse, conector ou API: só local, com o DEV.
