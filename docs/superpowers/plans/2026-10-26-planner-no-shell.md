# Planner no shell (`#/planner`) — spec e plano

Pedido do Renan em 26/10/2026: trazer o Planner inteiro (repo `Tela Planner`, ~24 mil linhas JSX, React 18) para o Sistema Betinhos, **sem mudar comportamento**. Respostas ao brief: 1B TypeScript · 2B componentes `@betinhos/ui` no lugar do CSS/tokens próprios · 3A scripts, flows, plugins, extensão, worker e WAHA em `packages/planner` · 4A menu "Planner" abre `#/planner`, WebResource `new_TelaPlanner` segue publicado em paralelo até validar (só DEV) · 5A repo Tela Planner congelado depois.

Fonte: `C:/Users/mendo/Desktop/vscode/Tela Planner` na `main` (`6bd900d`, v0.1.622). PROD congelado: nenhuma publicação ou alteração lá.

## Critérios de aceite

- Os 57 arquivos de teste do Planner portados para Vitest em TS e verdes (paridade de regra).
- `pnpm typecheck`, `pnpm test` e `pnpm build` do shell verdes; I/O tipado como `unknown` nas fronteiras.
- `#/planner` abre no mock com as mesmas abas e fluxos (Central, Tarefas em quadro/lista/agenda, Boas ideias, Contatos, Cotações, Configurações/importação); deep links antigos (`view=quotes&quoteId`, `taskId`, `contactId`) funcionam.
- Visual pelos componentes e tokens do `@betinhos/ui`; CSS da rota só para layout, escopado em `.planner-page`.
- MSAL (Graph) funciona no shell; URI de redirect nova no Entra é passo manual do Renan.
- Item "Planner" do menu vira `kind: 'page'`; `new_TelaPlanner.html` continua publicável pelo repo antigo até validar.

## Fases

1. **packages/planner**: `scripts/`, `power-platform/`, `extension/`, `serverless/`, WAHA e docs de deploy. Sem mudança de comportamento; revisar segredos antes de commitar.
2. **Domínio e dados em TS** em `apps/shell/src/pages/planner/{domain,data}` com testes portados (um módulo por commit).
3. **Telas em TSX** com `@betinhos/ui`: `App.jsx` vira `PlannerPage.tsx` + hook `usePlanner` + `views/` + `components/`.
4. **Rota e menu**: `PAGE_LOADERS.planner`, `MenuItem.page` com `'planner'`, deep links.
5. **Verificação e entrega**: skills `verificar-cotacoes`, `verificar-anexos-task`, `verificar-log-erros` adaptadas ao shell; qualidade antes do PR; PR; README do Tela Planner marcado como congelado.

## Riscos

- Quebra do `App.jsx` monolítico é onde o comportamento pode mudar; cada view entra com os testes de contrato portados.
- React 18 → 19 em drawers e Kanban com drag nativo.
- Bundle: docx, pdf-lib e html2canvas só no chunk lazy do Planner.
