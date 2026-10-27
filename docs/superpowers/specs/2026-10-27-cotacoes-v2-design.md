# Cotações V2 — processo revisto do zero

Aprovado pelo Renan em 27/10/2026. Substitui as regras de tarefa da V1.1 (spec `2026-10-23-cotacoes-v1-1.md` no repo Tela Planner).

## Fluxo

| Etapa | Quem | Coluna | Ação no Planner | Aviso (notificação do Planner) |
|---|---|---|---|---|
| ① Pedido | Quem atendeu (WhatsApp, e-mail ou telefone) | Nova | Criar cotação: solicitante, texto do pedido, prazo (Hoje / 2 dias / 7 dias / data) | Financeiro, só se o prazo for hoje |
| ② Custo | Financeiro | Em análise / Aguardando informação | Iniciar cotação; pedir informação; adicionar opções (título + valor) | — |
| ② → Cotada | automático | Cotada | Opção com valor deriva Cotada | Quem criou a cotação |
| ③ Envio | Quem criou | Respondida | Botão **Enviei** (data automática) | Lembrete a quem enviou após 2 dias úteis sem decisão |
| ④ Decisão | Quem enviou | Histórico | **Aceitou** (opção escolhida) ou **Perdida** (motivo obrigatório: preço, fechou com outro, desistiu, sem resposta) | — |

## Regras

- Obrigatórios na criação: solicitante, texto do pedido, prazo. O resto é opcional.
- Proposta = várias opções (título + valor). Condições gerais deixam de ser exigidas.
- Mantêm-se as 5 colunas: Nova · Em análise · Aguardando informação · Cotada · Respondida (+ Histórico).
- **Cotação não cria nem depende de tarefa.** O kanban de Cotações é a fila. Avisos e lembretes saem da cotação (dono = quem criou; financeiro = destinatário dos urgentes).
- "Enviei" não pede canal nem destinatário.
- Aceite só registra a opção; a reserva continua sendo criada à parte.
- Tarefas já ligadas a cotações ficam como estão; cotações novas não criam tarefa.

## Mudanças em relação à V1.1

- Remove: criação/atualização de tarefa a partir da cotação (`quoteTaskFlow`, contexto de espera na tarefa, bloqueio de concluir tarefa), diálogo de envio com canal/destinatário/data.
- Adiciona: notificação "cotação urgente" (prazo hoje) ao financeiro; "preço pronto" ao criador ao entrar em Cotada; lembrete de 2 dias úteis em Respondida; motivo obrigatório em Perdida.
- Reaproveita: notificações e lembrete diário existentes do Planner, `deriveQuoteStatus`, `addBusinessDays`, kanban e drawer.

## Onde implementar

Na migração `#/planner` (branch `claude/planner-react`), já em TS. O Tela Planner antigo fica congelado na V1.1.

## Verificação

- Testes: criação sem tarefa; Cotada derivada notifica o criador; prazo hoje notifica o financeiro; Enviei grava só a data; lembrete aparece após 2 dias úteis e some com a decisão; Perdida sem motivo é bloqueada.
- Mock no navegador: fluxo completo Nova → Histórico, nos dois desfechos.
- DEV autenticado depois do merge; PROD congelado até o Renan liberar.
