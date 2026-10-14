# Financeiro automático (semi) — design

**Data:** 14/10/2026 · **Status:** aprovado em conversa (escolhas do Renan) · **Escopo:** motor de sincronização de status financeiros (Custom API + plugin), fechamento mensal por cliente e tela `#/financeiro/pendencias` no shell.

## 1. Problema

Os status financeiros vivem em quatro entidades e só um elo é automático (flow "Pagantes → OP"). O resto é mão, e descasa todo dia:

| Entidade | Campo | Valores relevantes |
|---|---|---|
| Reserva (`cr40f_reservadeveculos`) | `cr40f_statusdefaturamento` | Pago (202410010), Pagante em viagem (202410006), Mensal (202410008), demais conferidos na metadata |
| Composição de Preço (`cr40f_composicaodeprecos`) | `new_status` | Pendente / Concluída (100000000 / 100000001, conferir qual é qual) |
| OP (`cr40f_financeiro`) | `cr40f_status` | Aberta 202410000, Pendente 100000001, Parcial 202410006, Paga 202410003, Cancelada 202410004 |
| Pagante (`cr40f_pagantes`) | `cr40f_status` | Pendente 202410001, Pago 202410002, Autorizado 202410007, Cancelado 202410005, outros |

Descompassos confirmados pelo Renan (todos doem): OP paga sem Reserva/CP acompanharem; Reserva marcada Pago sem OP; OP cancelada ou rateio refeito sem Reserva/CP voltarem; Mensal sem OP e dashboard contando errado.

## 2. Decisões

- **O dinheiro manda, mas nada trava.** A automação só escreve quando há evento de dinheiro (pagante ou OP muda de status). O status de faturamento da Reserva também carrega *motivo* ("Pagante em viagem") e continua editável na mão; valores informativos ficam intactos até um evento de dinheiro.
- **Mensal gera OP consolidada** por cliente e mês, com um pagante único, disparada **manualmente** pela pessoa do financeiro por botão na tela de pendências.
- **Toda escrita financeira passa por Custom API/plugin.** O shell não faz `update` direto em OP, Reserva nem CP para esses campos.
- **Histórico quitado é intocável.** O motor nunca rebaixa Reserva Pago cuja OP está Paga, nem toca em reserva sem OP. Só desfaz o que ele mesmo marcou, com o log como prova.
- Abordagem escolhida: **B** (Custom API + tela de pendências). Descartadas: só flows encadeados (invisível, corrida, não cobre reserva sem OP) e só tela (continua dependendo de alguém abrir).

## 3. Motor de regras (plugin, função pura)

Entrada: uma OP (ou uma Reserva, que resolve para a OP dela). Saída: lista de mudanças `{entidade, id, campo, de, para, motivo}`.

| Situação da OP (pagantes ativos = não cancelados) | Efeito |
|---|---|
| Todos Pago/Autorizado e soma ≥ total da OP | OP → Paga; cada Reserva da OP → Pago; CP de cada reserva → Concluída |
| Algum pago, não todos (ou soma < total) | OP → Pagamento Parcial; Reserva e CP não mudam |
| Nenhum pago (todos cancelados ou sem pagante) | OP → Aberta; Reserva que estava Pago **por essa OP** (há log) → Pendente; CP → Pendente |
| OP cancelada | Reserva perde o vínculo `_cr40f_financeiro_value`; se estava Pago por essa OP → Pendente; CP → Pendente |
| Reserva Pago na mão sem OP, ou com OP não paga | Não mexe. Vira pendência tipo 2 |
| Reserva "Pagante em viagem", "Mensal" e outros informativos | Não mexe até evento de dinheiro. Mensal sem OP vira pendência tipo 4 só depois do mês fechar |

Total da OP = `cr40f_financeiro.valor` ou, sem ele, soma de `new_valortotal` das CPs dos serviços (mesma conta do plugin Gerar Pagantes e de `resumoRateio` em `apps/shell/src/pages/ops/domain/status.ts`). Comparações em centavos.

Idempotente: rodar duas vezes não produz mudanças na segunda. Toda mudança gravada gera uma linha de log.

## 4. Custom APIs e plugin

Mesmo molde do `cr40f_GerarPagantes` (`C:\Users\mendo\Desktop\vscode\Tela Gerar Pagantes\src\Plugins`): `RequestJson` → `ResponseJson`, registrador em `tools/`.

### 4.1 `cr40f_SincronizarFinanceiro` (bound a `cr40f_financeiro`)

- Request: `{ "modo": "simular" | "aplicar", "origem": "manual" | "automatico" }`.
- Response: `{ "mudancas": [...], "aplicadas": bool, "erros": [...] }`.
- `simular` não grava. `aplicar` grava em contexto elevado, numa transação, e insere o log.
- Permissão: usuário precisa de Write na OP (mesma checagem `RetrievePrincipalAccessRequest` do Gerar Pagantes).

### 4.2 Steps automáticos

- Pós-operação `Update` de `cr40f_pagantes` (filtro `cr40f_status`) e de `cr40f_financeiro` (filtro `cr40f_status`): chama o motor em modo `aplicar`, origem `automatico`, para a OP afetada.
- Anti-loop: ignora execução com `Depth > 1` vinda do próprio motor e marca `SharedVariables["cr40f_sync"]`.
- Substitui o flow "Pagantes → OP": desativado em DEV após comparar resultado nas mesmas OPs; não excluído.

### 4.3 `cr40f_FecharMesCliente` (unbound)

- Request: `{ "clienteId", "mes": "AAAA-MM" }`.
- Seleciona reservas do cliente com `cr40f_status` Concluído, `cr40f_statusdefaturamento` Mensal, sem OP, saída dentro do mês (fuso America/Sao_Paulo).
- Cria a OP (`cr40f_financeiro`) com valor = soma das CPs, vincula as reservas, grava log. Não cria pagante; devolve `{ "opId", "reservas": n, "valor" }`.
- Sem reserva elegível: erro claro, nada criado.

### 4.4 Tabela de log `cr40f_sincronizacaofinanceira`

Colunas: OP (lookup), reserva (lookup, opcional), entidade, campo, valor anterior, valor novo, motivo (texto), origem (choice manual/automático), usuário, data. Somente inserção pelo plugin; sem edição na UI. Entra na solução AppBetinhos.

## 5. Tela `#/financeiro/pendencias`

Molde de OPs/Pagantes: `PageHeader` (eyebrow Financeiro, título Pendências, meta "N pendências · R$ total") + `PageToolbar filters` + tabela ≥ 820 px / cards abaixo + `Drawer wide`. Tokens `--bt-*`, sem gradiente, `#FCFCFB` em neutros.

Divergências calculadas **no cliente** a partir de reservas, CPs, OPs e pagantes do período (reaproveita as queries do Dashboard e de OPs):

| Tipo | Condição | Ação |
|---|---|---|
| 1 | OP Paga e alguma Reserva ≠ Pago ou CP ≠ Concluída | Corrigir |
| 2 | Reserva Pago sem OP ou com OP não paga | Ver OP / Criar OP (abre Geral com a seleção) |
| 3 | OP cancelada ou sem pagante ativo e Reserva ainda Pago | Corrigir |
| 4 | Reserva Mensal, Concluída, sem OP, mês já fechado (agrupado por cliente + mês) | Fechar mês |
| 5 | Soma do rateio ativo ≠ total da OP (reaproveita `resumoRateio`) | Abrir Gerar Pagantes |

- **Corrigir**: chama `simular`, mostra "vai mudar X → Y" em diálogo, confirma, chama `aplicar`, recarrega a linha. Erros em toast com a mensagem da API.
- **Fechar mês**: diálogo com reservas, total e cliente; confirma → `cr40f_FecharMesCliente` → abre `GerarPagantesFrame` com a OP nova; ao fechar com `refresh`, recarrega.
- Filtros: período (90 dias padrão, por data de saída), tipo, cliente, busca local. Visões salvas em `localStorage` (`betinhos.pendencias.visoes.v1`), funciona sem storage.
- Drawer: detalhe (reserva, OP, pagantes, valores) e histórico do log daquela OP.
- Sem ações em lote. Mock sem Xrm com dados de exemplo cobrindo os 5 tipos. Versão de build `vX.Y.Z · dd/mm/aaaa HH:mm` no canto, como nas outras telas.

## 6. Arquitetura no repo

- Plugin: novo projeto `packages/plugins/Cr40f.Financeiro.Plugin/` (motor em classe pura `SyncEngine` testável sem Dataverse; `SincronizarFinanceiroPlugin`, `FecharMesClientePlugin`, `PaganteOpStepPlugin`). Testes xUnit em `packages/plugins/Cr40f.Financeiro.Plugin.Tests/`. Registrador em `packages/plugins/tools/` copiado do molde.
- Shell: `apps/shell/src/pages/pendencias/` com `domain/` (tipos, detecção das 5 divergências, agrupamento mensal; puros e testados), `data/` (queries, source dataverse/mock, chamadas das APIs via `host.client.request`), `usePendencias.ts`, `components/`, `pendencias.css`. Rota e item no menu do grupo Financeiro.
- Schema versionado: tabela de log, Custom APIs e steps na solução AppBetinhos via `pnpm push`.

## 7. Entregas (cada uma publicável sozinha)

1. Plugin + `cr40f_SincronizarFinanceiro` só em `simular` + tabela de log. Testes do motor. Validação em DEV só leitura.
2. Modo `aplicar` + steps automáticos; flow "Pagantes → OP" desativado em DEV após comparação.
3. Tela de Pendências com tipos 1, 2, 3 e 5.
4. `cr40f_FecharMesCliente` + tipo 4.

## 8. Riscos

- **Metadata não conferida nesta sessão** (MCP `Dataverse_DEV` fora): valores de `cr40f_statusdefaturamento` (qual é "Pendente"), `new_status` da CP, lookups reserva→OP/CP e nome do entity set. Passo 0 do plano; se faltar, parar e reportar.
- **Loop plugin ↔ plugin**: anti-loop por `Depth` + `SharedVariables`.
- **Dados antigos**: a primeira rodada da tela vai listar muita coisa histórica; o período padrão de 90 dias limita, e nada é corrigido sem clique.
- **PROD**: tudo em DEV até pedido explícito; solução versionada antes de promover.

## 9. Aceite

- Motor: cada linha da tabela do §3 coberta por teste; `aplicar` duas vezes seguidas = zero mudanças na segunda.
- DEV: `simular` em 10 OPs reais devolve mudanças coerentes com o que a pessoa do financeiro faria; `aplicar` numa OP de teste grava status e log.
- Tela: abre em mock com os 5 tipos; Corrigir mostra prévia e aplica; Fechar mês cria OP e abre Gerar Pagantes; `pnpm test` e `pnpm typecheck` verdes; 320 px sem rolagem horizontal; sem cor fora dos tokens.
