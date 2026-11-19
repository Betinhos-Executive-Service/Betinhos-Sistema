---
name: verificar-checklists
description: "Verifica a tela Checklists de Veículos do shell (#/frota-checklists: abas Veículos, Checklists, Modelos e Padrões, drawer do checklist, solicitar checklist, editor de modelo) em mock com Playwright, desktop e 390 px. Use após mudar apps/shell/src/pages/frota/checklists/**."
---
# Verificar Checklists de Veículos

## Cobre
- `apps/shell/src/pages/frota/checklists/**`: `ChecklistsAba.tsx` (envolve a tela em `ToastProvider`), `components/GestaoChecklists.tsx` (PageLayout `frota-page gestao-checklists`, Tabs, MetricCard, Table, Drawer, Dialog e toasts do `@betinhos/ui`), `ModeloEditor.tsx`, `PadroesTab.tsx`, `FotosChecklist.tsx`, `gestao.css`, regras em `domain/gestaoChecklists.ts` (inclui o mock) e `domain/padroesChecklists.ts`.

## Testes e tipos
1. `cd apps/shell && pnpm exec vitest run src/pages/frota` → todos passam (722 em 19/11/2026). `ChecklistsAba.test.tsx` espera o h1 "Checklists de Veículos", a tabela "Situação por veículo" e as abas pelo nome sem o número do badge.
2. `pnpm typecheck` → sem erros.

## Dados do mock (`pnpm dev`, porta 36472)
`getMock()` em `domain/gestaoChecklists.ts`; recarrega a cada entrada na página.
- Modelos: "Vistoria quinzenal" (`mod-quinzenal`, padrão, 15 dias), "Carros de terceiros e aluguel" (`mod-terceiros`, 30 dias, prioridade 10) e "Entrega de veículo novo" (`mod-entrega`, inativo).
- Veículos com situações variadas (em dia, vencido, sem checklist, sem motorista); o primeiro "Solicitar checklist" é o de MGA3J44.

## Roteiro em mock (navegador)
Com `pnpm dev` rodando em `apps/shell`:
`node .claude/skills/verificar-checklists/fluxo-mock.cjs <pasta-dos-prints>` (`BASE` muda a URL; fora da VM cloud, `PLAYWRIGHT_MODULE` e `CHROMIUM`). Uma linha ✅/❌ por passo e prints `desktop-NN-*.png` (1600×1000) e `mobile-01-tabela.png` (390×844).
1. h1 "Checklists de Veículos", KPIs em MetricCard e a tabela "Situação por veículo" na aba Veículos.
2. Aba Checklists, filtro "Todos": clicar na linha abre o Drawer do checklist; Esc fecha.
3. Abas Modelos e Padrões renderizam sem quebra (conferir os prints).
4. Modelos: abrir um modelo mostra o editor (h1 com o nome do modelo); "Modelos" volta e devolve o foco ao botão do modelo (`data-foco`). Com alteração não salva o voltar pergunta "Descartar alterações?".
5. Veículos: "Solicitar checklist do …" abre o Dialog; confirmar mostra o toast "Checklist solicitado para MGA3J44.".
6. Console sem erros nem avisos durante o roteiro.
7. 390 px: sem rolagem horizontal; na tabela, a situação (com o detalhe) e a ação ocupam linhas próprias abaixo do veículo; Subir, Descer e Duplicar com alvo de 44 px.

Comportamento com dados reais, Custom API ou flow (solicitação de verdade, fotos no SharePoint) não é coberto pelo mock: conferir no DEV autenticado.
