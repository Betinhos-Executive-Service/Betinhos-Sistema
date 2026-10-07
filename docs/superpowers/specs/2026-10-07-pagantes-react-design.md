# Pagantes em React — design

**Data:** 07/10/2026 · **Status:** aprovado em conversa (escolhas do Renan) · **Escopo:** rota `#/pagantes` no shell, no lugar da lista nativa `cr40f_pagantes` (grupo Financeiro).

## 1. Contexto e decisões

- Pagante = parcela do rateio de uma Ordem de Pagamento (`cr40f_financeiro`, "OP") atribuída a uma pessoa de `cr40f_bancodedados`. Não há lookup para reserva nem cliente; o caminho é pagante → OP → reservas e pagante → pessoa → cliente.
- Criar, refazer rateio e excluir continuam com a Custom API `cr40f_GerarPagantes` (Tela Gerar Pagantes). Esta tela **não cria nem exclui** pagante.
- Novidades escolhidas: ficha com histórico, busca com filtros e visões salvas, ações rápidas (WhatsApp com link, copiar link, gerar/reenviar recibo, abrir OP no Gerar Pagantes) e status manual (Pago/Cancelado) com confirmação.
- Fora do escopo: ações em lote, edição de valor/forma/canal, auditoria nativa, novo gerador de recibo.

## 2. Schema usado (export AppBetinhos v168 + provisionamento do Gerar Pagantes)

| Coluna | Uso |
|---|---|
| `cr40f_pagantesid`, `cr40f_id` (PAG-n) | id e código |
| `_cr40f_bancodedados_value` | pessoa (nome pelo FormattedValue); contato em `cr40f_bancodedados`: `cr40f_nomedopassageiro`, `cr40f_telefone`, `cr40f_email`, `_cr40f_cliente_value` |
| `_cr40f_financeiro_value` | OP (nome pelo FormattedValue) |
| `cr40f_valor` | valor da parcela |
| `cr40f_formadepagamento` | 202410000 Cartão, 202410001 Pedido de compra, 202410002 Pix |
| `cr40f_status` | 202410001 Pendente, 202410002 Pago, 202410003 Negado, 202410004 Expirado, 202410005 Cancelado, 202410006 Não finalizado, 202410007 Autorizado, 202410010 Aguardando facial |
| `cr40f_statusdorecibo` | 202410000 Pendente, 202410002 Gerado, 202410001 Enviado |
| `cr40f_linkdepagamento`, `cr40f_linkdorecibo` | links |
| `cr40f_datadoultimolembrete`, `createdon`, `modifiedon` | linha do tempo |
| `cr40f_statusgeracaolink`, `cr40f_errogeracaolink`, `cr40f_statusenvioemail`, `cr40f_erroenvioemail`, `cr40f_dataenvioemail` | provisionadas depois do v168: a consulta tenta com elas e repete sem elas se a coluna não existir (mesmo "safe mode" do Operacional) |

Rótulos de choice vêm da metadata (`host.metadata.choices`); os valores acima só decidem regras.

## 3. Regras

- **Travado:** Pago e Autorizado não aceitam mudança de status (regra do plugin).
- **Marcar como pago:** grava `cr40f_status = 202410002`. Opção marcada por padrão "Gerar e enviar o recibo agora", que também grava `cr40f_statusdorecibo = 202410000` se o recibo ainda não foi enviado (igual ao webhook da Cielo). Dispara flows reais: baixa da OP e recibo automático.
- **Cancelar pagante:** grava `cr40f_status = 202410005`; a OP é reavaliada pelo flow de baixa.
- **WhatsApp:** só com telefone válido (`phoneDigits`). Mensagem de cobrança com link quando não pago; com link do recibo quando pago e houver recibo; senão só a saudação.
- **Copiar link:** link de pagamento quando não pago; link do recibo quando pago.
- **Gerar/reenviar recibo:** para Pago/Autorizado. Carrega o WebResource `cr40f_GerarRecibo` e chama `GerarRecibo` com um controle de grade simulado contendo o pagante; o modal e o envio são os do script atual. O shim do Xrm ganha `showProgressIndicator`/`closeProgressIndicator`/`openAlertDialog` para funcionar fora do model-driven.
- **Abrir OP:** abre `/WebResources/Tela_GerarPagantes/index.html?recordId=<op>&embedded=1` em painel; ao receber `cr40f-gerar-pagantes:close` com `refresh`, recarrega a lista.

## 4. Busca, filtros e visões

- Período por `createdon`: 30 dias, 90 dias (padrão), 12 meses, tudo. Mudar o período recarrega.
- Busca local por nome, PAG, OP, telefone e e-mail (sem acento, sem caixa).
- Filtros: status do pagamento, forma, recibo, "Com falha de envio".
- Visões prontas: Todos, Pendentes, Pagos sem recibo, Com falha de envio. Visões do usuário: "Salvar visão" grava nome + filtros em `localStorage` (`betinhos.pagantes.visoes.v1`); excluir pelo menu. A última visão usada volta ao abrir. Tudo funciona sem `localStorage` (memória).

## 5. Layout

- `PageHeader`: eyebrow Financeiro, título Pagantes, meta "N pagantes · R$ total filtrado" e selo "Dados de exemplo" no mock. Sem ação primária (criação é no Gerar Pagantes).
- `PageToolbar filters`: visões (Select), busca, período, status, forma, recibo, falhas, limpar.
- Desktop: tabela (Pagante, OP, Valor, Forma, Pagamento, Recibo, Criado em, ações rápidas por ícone). Linha abre a ficha.
- ≤ 820 px: lista de cards (nome, PAG, valor, status, ações WhatsApp/copiar).
- Ficha: `Drawer size="wide"` com hero (PAG, status, nome, valor), blocos (forma, OP, contato, recibo), ações, alertas de falha de link/e-mail, **Rateio da OP** (outros pagantes e soma vs total) e **Serviços da OP** (data, código, destino), e **Linha do tempo** (criado, link gerado/falhou, e-mail enviado/falhou, último lembrete, recibo, última alteração).
- Estados: skeleton na carga, erro com "Tentar de novo", vazio sem dados, vazio por filtro com "Limpar filtros", toasts de sucesso/erro.

## 6. Arquitetura

`apps/shell/src/pages/pagantes/`: `domain/` (tipos, status, filtros/visões, mensagens, linha do tempo — puros e testados), `data/` (queries, source dataverse/mock, recibo, gerar pagantes), `usePagantes.ts`, `components/` (filtros, tabela, cards, ficha, diálogos), `pagantes.css` só com tokens `--bt-*`.

## 7. Aceite

- Lista abre em mock e no Dataverse DEV; filtros, busca e visões persistem; ficha mostra rateio, serviços e linha do tempo.
- Ações rápidas abrem WhatsApp/copiam link; status manual pede confirmação e atualiza a linha.
- `pnpm test` e `pnpm typecheck` verdes; sem cor fora dos tokens, sem gradiente; 320 px sem rolagem horizontal.
