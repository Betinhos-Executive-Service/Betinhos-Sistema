---
name: verificar-cotacoes
description: Verifica as Cotações V2 do Planner no shell (#/planner?view=quotes) — cotação sem tarefa, obrigatórios (solicitante, pedido, prazo), Cotada derivada, botão "Enviei" só com data, avisos no sininho (urgente, preço pronto, lembrete de 2 dias úteis) e motivo de perda em lista — no mock e no Dataverse DEV.
---

# Verificar cotações (V2)

1. Unitário (`apps/shell`): `pnpm exec tsc --noEmit` e `pnpm exec vitest run src/pages/planner`. Arquivos-chave: `domain/quoteNotifications.test.ts` (regras de aviso e `LOSS_REASONS`), `data/mock.quotesV2.test.ts`, `data/dataverse.quotesV2.test.ts` (sem POST em `cr40f_plannertarefas`, `cr40f_Criador@odata.bind`, aviso com `cr40f_Cotacao@odata.bind`, dedupe, colunas ausentes = sem aviso), `components/quotes/quotesV2.test.tsx`. Cotações legadas com tarefa: `data/legacyQuoteTask.fixture.ts` mantém os testes da V1.1.
2. Mock no navegador: `pnpm dev` (porta 36472, mock fora do Dataverse), `#/planner?view=quotes`. Para estado limpo: `localStorage.removeItem('betinhos-tela-planner-mock-v3-calendar')`.
   - Nova cotação: só "Nome do solicitante", "Pedido do cliente" e "Prazo para responder" têm `*`; prazo **Hoje** → sininho mostra "Cotação para hoje" (Renan é do Financeiro no mock). Na `localStorage`, a cotação tem `creatorEmployeeId` e `plannerTaskId` vazio, e nenhuma tarefa com o `quoteId`.
   - Clicar no aviso abre o drawer da cotação (URL `view=quotes&quoteId=…`).
   - **Iniciar cotação** → valor na opção → **Salvar alterações** → status Cotada, aviso "Preço pronto" para o criador e ação primária **Enviei**.
   - **Enviei** → Respondida ao cliente sem diálogo; a versão tem `sentAt` e `channel`/`recipient` vazios.
   - Lembrete: mude o `sentAt` da versão para 3+ dias úteis atrás e recarregue → "Cobrar decisão do cliente" no sininho (uma vez por dia).
   - **Registrar decisão do cliente** → Aceitou → Histórico. Repita com Perdida: **Confirmar** sem motivo mostra "Escolha o motivo da perda."; a lista tem Preço, Fechou com outro, Desistiu, Sem resposta.
   - Avisos persistidos (regressão de 27/10/2026, `data/mock.noticePersist.test.ts`): injete na `localStorage` um aviso `quote_urgent` para `employee-renan` e outro para `employee-marina` (com `dedupeKey`), recarregue, clique no do Renan e recarregue de novo → o do Renan continua lido e o da Marina continua salvo (`saveState` junta com o que já estava gravado).
   - Cotação sem tarefa: o drawer não mostra "Histórico da tarefa".
   - Console sem erros. Evidências em `.verificacao/evidencias/cotacoes-v2/`.
3. DEV (só a partir do checkout principal, depois do merge): rode uma vez `packages/planner/scripts/ensure-quote-v2-dev.ps1` (cria `cr40f_plannernotificacao.cr40f_cotacao` e `cr40f_pedidodecotacao.cr40f_criador`; `-WhatIf` só lista). Sem as colunas, o app salva a cotação sem criador e sem avisos e registra `QUOTE_V2_SCHEMA_MISSING` no log. Com elas: crie "TESTE CLAUDE" com prazo hoje e confira `cr40f_plannernotificacaos?$filter=cr40f_tipo eq 'quote_urgent'&$orderby=createdon desc&$top=5` (com `_cr40f_cotacao_value`), `_cr40f_criador_value` na cotação e nenhuma `cr40f_plannertarefas` nova com `_cr40f_pedidocotacao_value` dela. Confirme que o usuário comum tem Create em `cr40f_plannernotificacao`. Apague os registros de teste.
4. PROD congelado: só leitura até o Renan liberar.

Implementação: regras em `apps/shell/src/pages/planner/domain/quoteNotifications.ts`; ação primária em `domain/quoteDomain.ts` (`getQuoteNextAction`, `validateQuoteStep`); stores em `data/mock.ts` (`createQuote`, `syncQuoteFollowUps`) e `data/dataverse.ts` (`createLiveQuote`, `createQuoteNotifications`, `probeQuoteV2Schema`); UI em `components/quotes/{HybridQuotesView,QuoteManagementDrawer,QuoteFields}.tsx`, `components/NotificationsPanel.tsx` e `usePlanner.ts` (`openNotification`).
