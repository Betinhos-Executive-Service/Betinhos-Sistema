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

## V2.1 — lacunas da cotação sem tarefa

Decisões do Renan em 28/10/2026.

1. **Aguardar informação** só na edição da cotação (nunca na criação). Move para "Aguardando informação" e grava três colunas novas em `cr40f_pedidodecotacao`:
   - `cr40f_aguardandooque` (texto 500) — o que falta;
   - `cr40f_aguardandodequem` (texto 200) — de quem;
   - `cr40f_aguardandoretorno` (DateOnly) — data de retorno; padrão = hoje + 2 dias úteis (`addBusinessDays`).
   Os três são obrigatórios ao entrar em Aguardando. Na data de retorno (ou depois, enquanto continuar aguardando) sai o aviso `quote_waiting_return` no sininho para o criador e para os membros da equipe Financeiro, pelo mesmo mecanismo do lembrete de follow-up (dedupe por destinatário + dia). Ao sair de Aguardando, os três campos são limpos. Arrastar o card para Aguardando abre a cotação já no diálogo; "Registrar retorno" em cotação sem tarefa retoma para Em análise.
2. **Anexos da cotação** no SharePoint pelos flows HTTP já usados (`FLOW_VARS` de `funcionarios/data/sharepoint.ts`: salvar, listar, consultar, excluir), pasta `Cotacoes/<id da cotação>` (DEV em `Cotacoes/DEV/<id>`), até 10 MB (`DOC_MAX_BYTES`), qualquer tipo, nome por `sanitizeFileName`. Incluídos na criação e na edição; listados no drawer.
3. **Cotações antigas com tarefa**: os anexos da tarefa continuam no drawer, só leitura, sem migração.
4. **Preço pronto** avisa o criador a cada nova entrada em Cotada: a chave de dedupe inclui o instante da transição.

Colunas criadas por `packages/planner/scripts/ensure-quote-v2-dev.ps1` (idempotente; primeiro as colunas da cotação, por último a lookup da notificação; erro isolado por item). O app só grava os campos de espera se as colunas existirem (sonda 404).

## V2.2 — um passo por vez

Decisões do Renan em 28/10/2026. Redesenho de UX; as regras da V2 e da V2.1 (avisos, Cotada derivada, "Enviei" só com data, lembretes, Aguardar informação, anexos no SharePoint) não mudam.

1. **Criar cotação = 3 telas curtas**, com "Passo N de 3" e botões Voltar/Continuar: (1) **Quem pediu?** (solicitante), (2) **O que pediu?** (texto do pedido), (3) **Para quando?** (Hoje / 2 dias / 7 dias / data). Cada passo valida só os seus campos; a cotação só é gravada ao fim do passo 3 ("Criar cotação"). Voltar preserva o que foi digitado.
2. **Opcionais recolhidos** em "Adicionar detalhes" dentro do passo a que pertencem: cliente/empresa, telefone, e-mail e título interno no passo 1; passageiros, perfil, observações internas e anexos no passo 2; prioridade no passo 3. Se um opcional tem erro (ex.: e-mail inválido), o bloco abre sozinho. Custo e condições gerais saíram da criação: entram ao cotar.
3. **Abrir uma cotação mostra só o passo atual** com um botão principal grande:
   - Nova → resumo (quem, o quê, para quando) + **Começar a cotar**;
   - Em análise → tabela de opções editável (todas visíveis, como hoje) + **Salvar preços** (com valor, vira Cotada);
   - Cotada → **Enviei ao cliente** (e "Ver proposta" discreto para copiar/baixar);
   - Respondida → **Cliente aceitou** / **Perdida** (motivo em lista);
   - Aguardando informação → resumo (o que falta, de quem, retorno) + **Registrar retorno** (e "Editar");
   - Aceita/Perdida/Cancelada → resultado + "Reabrir cotação".
   "Aguardar informação" aparece como ação secundária discreta em Nova e Em análise.
4. **Ver detalhes** (recolhido) reúne pedido completo, anexos, dados editáveis (Pedido, Custo), retornos da tarefa legada e histórico de propostas.
5. Mantidos: lista editável de opções (decisão 3), os três campos de Aguardar (decisão 4), arrastar no Kanban (decisão 5) e a mesma tela para quem cria e para o Financeiro, mudando só o botão principal (decisão 6).
6. O botão do card no Kanban segue o mesmo rótulo do drawer ("Começar a cotar", "Cliente aceitou"); em Cotada o card continua "Enviei".
