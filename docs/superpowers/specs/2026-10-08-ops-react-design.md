# Ordens de Pagamento em React — design

**Data:** 08/10/2026 · **Status:** aprovado em conversa (escolhas do Renan) · **Escopo:** rota `#/ops` no shell, no lugar da lista nativa `cr40f_financeiro` (grupo Financeiro, item "Ordens de Pagamento").

## 1. Contexto e decisões

- OP = `cr40f_financeiro`. Nasce pelo botão **Gerar OP** das reservas (Flow Gerar OP, gatilho HTTP com os GUIDs). Os serviços apontam para ela por `_cr40f_financeiro_value`; os pagantes também.
- O rateio continua na Tela Gerar Pagantes (Custom API `cr40f_GerarPagantes`), aberta embutida como em Pagantes.
- Escolhas do Renan: lista + ficha completa no molde de Pagantes; a tela **só cancela** OP (Paga, Parcial e Pendente vêm dos flows de baixa); nome no menu "Ordens de Pagamento".
- Fora do escopo: criar OP, editar campos, excluir, ações em lote.

## 2. Schema (metadata de DEV, 08/10/2026)

| Coluna | Uso |
|---|---|
| `cr40f_financeiroid`, `cr40f_idfinanceiro` (OP-n) | id e código |
| `cr40f_status` | 202410000 Aberta, 100000001 Pagamento Pendente, 202410006 Pagamento Parcial, 202410003 Paga, 202410004 Cancelada |
| `cr40f_valor` | valor da OP |
| `new_clientedaop`, `new_passageirosdaop`, `cr40f_trajetos` | textos gerados por flow (podem defasar) |
| `cr40f_datado1servico`, `cr40f_datadoultimoservico` | período dos serviços |
| `cr40f_idioma` | Português, Inglês, Espanhol |
| `createdon`, `modifiedon`, `_createdby_value` | linha do tempo |

Rótulos de choice vêm da metadata, com os acima como recuo.

## 3. Regras

- **Cancelar OP:** grava `cr40f_status = 202410004`. O flow "Dar baixa na OP → Geral" só trata Paga e Pendente, então as reservas não mudam. Só é permitido quando a OP não está Paga nem Cancelada **e** não tem pagante ativo (todos cancelados ou nenhum): cancelar pagante depois faz o flow "Pagantes → OP" recalcular o status e desfaria o cancelamento. Sem isso, o botão fica desabilitado com o motivo.
- **Gerar pagantes:** abre `/WebResources/Tela_GerarPagantes/index.html?recordId=<op>&embedded=1`; ao fechar com `refresh`, recarrega. Desabilitado em OP cancelada.
- **Rateio:** soma das parcelas ativas vs valor da OP e vs soma da composição de preços dos serviços; diferença gera alerta. Recebido = parcelas Pago/Autorizado.
- **Pagante no rateio:** mostra nome, valor, status e as ações rápidas de Pagantes (WhatsApp, copiar link). Status do pagante continua sendo mudado em `#/pagantes`.

## 4. Busca, filtros e visões

- Período por `createdon`: 30, 90 (padrão), 365 dias, tudo.
- Busca local sem acento por OP, cliente, passageiros e trajetos.
- Filtro de status (múltiplo).
- Visões prontas: Todas, Em aberto (Aberta, Pendente, Parcial), Pagas, Canceladas. "Salvar visão" em `localStorage` (`betinhos.ops.visoes.v1`), mesmas regras de Pagantes.

## 5. Layout

- `PageHeader`: eyebrow Financeiro, título Ordens de Pagamento, meta "N OPs · R$ total" e selo "Dados de exemplo" no mock.
- Desktop: tabela (OP + cliente, Serviços (período), Passageiros, Valor, Status, Criada em). Linha abre a ficha.
- ≤ 820 px: cards (OP, cliente, valor, status, período).
- Ficha (`Drawer wide`): hero (OP, status, cliente, valor), ações (Gerar pagantes, Cancelar OP), blocos Resumo (período, idioma, passageiros, trajetos), **Rateio** (parcelas, recebido, alertas), **Serviços** (data, código, destino, valor), **Linha do tempo** (criada, 1º serviço, último serviço, pagamentos, cancelamento/última alteração).
- Estados: skeleton, erro com "Tentar de novo", vazio, vazio por filtro, toasts.

## 6. Arquitetura

`apps/shell/src/pages/ops/`: `domain/` (tipos, status, filtros/visões, rateio, linha do tempo — puros e testados), `data/` (queries, source dataverse/mock), `useOps.ts`, `components/`, `ops.css` só com tokens `--bt-*`. Reaproveita de Pagantes: `loadPagantes`/`opFilter`, `loadServicos`, `QuickActions`, `GerarPagantesFrame`, `SaveViewDialog`, formatadores.

## 7. Aceite

- Lista abre em mock; filtros, busca e visões persistem; ficha mostra rateio, serviços e linha do tempo.
- Cancelar pede confirmação, respeita o bloqueio e atualiza a linha.
- `pnpm test` e `pnpm typecheck` verdes; sem cor fora dos tokens, sem gradiente; 320 px sem rolagem horizontal.
