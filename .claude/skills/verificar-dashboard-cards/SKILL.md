---
name: verificar-dashboard-cards
description: Verifica os cards do Dashboard do shell (StatCard, AlertCard, DeltaBadge, Sparkline do DS) nas 8 abas e 3 larguras. Use após mudar apps/shell/src/pages/dashboard (KpiGrid, KpiLinha, KpiExtras, AlertList, abas, dashboard.css).
---

# Verificar cards do Dashboard

1. Subir o shell em modo mock: `cd apps/shell && npx vite --port 36472 --strictPort` (depois de trocar a versão do `@betinhos/ui`, com `--force`: sem isso o dashboard fica em "Carregando" sem erro no console) (worktree sem `node_modules`: `pnpm install` antes).
2. Rodar a medição (Playwright em 8 abas x 1440, 840 e 390 com toque):
   `PLAYWRIGHT=<pasta do playwright-core desta máquina> CHROME_EXE=<chrome-headless-shell> node .claude/skills/verificar-dashboard-cards/medir.cjs http://localhost:36472/ <pasta-dos-prints>`
   Sem `PLAYWRIGHT`, o script faz `require('playwright-core')` (instale com `npm i -g playwright-core` ou aponte para um `node_modules/playwright-core` existente; no desktop do Renan há um em `~/.local/share/ctf-importar/node_modules/`). Chromium: `npx playwright install chromium-headless-shell`.
3. Esperado (sai com código 0): rolagem horizontal 0; nenhum `.bt-stat__value` cortado; maior `.bt-stat` até 180 px (162 px é o card sem extras, conferido no DS; apoio em 2 linhas ou extras fazem a fileira crescer, decisão do Renan de 17/11/2026; em 17/11 o máximo era 176 px, em Despesas); `.bt-alert-card` ~60 px; console sem erro nem aviso; clique (1440) e toque (390) no corpo de um KPI com drill-down mudam o hash para `detalhe=`.
4. Abrir os PNGs (`<aba>-<largura>.png`) e conferir o visual. Encerrar o vite ao terminar.
