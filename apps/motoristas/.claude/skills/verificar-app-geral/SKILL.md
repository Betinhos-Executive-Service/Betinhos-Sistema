---
name: verificar-app-geral
description: "Verificação base do App Motoristas: testes Node, TypeScript estrito, build single-file e prévia local sem erros. Use após mudar qualquer arquivo de src/, tests/ ou scripts/ que não tenha uma skill verificar-<area> mais específica, ou junto com ela quando a mudança tocar src/App.tsx ou src/styles.css."
---
# Verificar app (geral)

## Cobre
- Código: `src/**` (App, telas, componentes, lib), `tests/**`, `scripts/**`.
- Áreas com skill própria (rode as duas): gastos → `verificar-gastos`.

## Preparar ambiente
- Node instalado; dependências do repositório principal (`App Motoristas/node_modules`) resolvem também nos worktrees.
- Dev server: `PORT=<porta livre> node scripts/dev-server.cjs` → `http://127.0.0.1:<porta>/`. Ele reescreve `dist/`; use `git checkout -- dist` antes do commit se não for publicar.

## Roteiro
1. `npm test` → `ℹ fail 0`.
2. `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` → sem saída.
3. Dev server sobe e imprime `[dev] build atualizado` (build single-file sem erro).
4. Navegador interno em `/?dev=preview` → a lista de demos aparece (Botões, Tela inicial, Serviços, Gastos...). Abra a tela afetada pela mudança e interaja com o controle alterado.
5. `read_console_messages` com `onlyErrors: true` → sem erros.

## Casos de borda
- Viewport 390×844 e desktop; landscape baixo quando a tela tiver modo compacto.

## Evidência obrigatória
- Saídas de teste e TypeScript; screenshot da tela afetada na prévia.

## Limites
- Integração Dataverse/Flow só no app publicado (DEV com login). PROD é somente leitura.
