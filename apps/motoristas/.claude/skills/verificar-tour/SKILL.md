---
name: verificar-tour
description: "Verifica o tour de primeiro acesso do App Motoristas: abertura automática no Início, Pular, reabrir por 'Ver tour de novo', spotlight no elemento real, 360 px e teclado. Use após mudar src/app/tour.ts, src/components/common/TourOverlay.tsx, src/tour.css, o rodapé/âncoras data-tour de src/screens/InitialScreen.tsx ou a integração do tour em src/App.tsx."
---
# Verificar tour de primeiro acesso

## Cobre
- Código: `src/app/tour.ts` (passos, preferência local, posicionamento), `src/components/common/TourOverlay.tsx`, `src/tour.css`, âncoras `data-tour` e link "Ver tour de novo" em `src/screens/InitialScreen.tsx`, estado `tourOpen` em `src/App.tsx`, `tests/tour.test.ts`.
- Persistência: `localStorage["app-motoristas-tour-v1:<id do motorista>"] = "visto"`. Só local: trocar de aparelho ou limpar o navegador faz o tour voltar (não há coluna de preferências do motorista no Dataverse).

## Preparar ambiente
- `node --test --experimental-strip-types tests/tour.test.ts` (não depende de `node_modules`).
- Dev server: `PORT=<porta reservada em ~/.codex/dev-ports.json> npm run dev` e abrir `http://localhost:<porta>/webresource-app-motoristas.html#inicio` (modo mock, motorista `localhost-driver`).
- Para simular primeiro acesso: `localStorage.removeItem("app-motoristas-tour-v1:localhost-driver")` e recarregar, ou "Resetar dados locais" no rodapé do Início (só em localhost).

## Roteiro automatizado (preferido)
`APP_MOTORISTAS_URL=http://localhost:<porta> CHROME_PATH=<binário Chromium/Brave> node scripts/qa/verify-tour.cjs .verificacao/<data>-<branch>` (sem `CHROME_PATH` usa o Google Chrome instalado; sem `playwright-core` no projeto, prefixe com `NODE_PATH` do cache do npx ou `npx -y -p playwright-core@1.56.1`). Todas as linhas `OK`; prints `tour-passo-1..7.png`, `tour-reabrir.png`, `tour-360.png` na pasta indicada. Cobre os cenários 1 a 5 abaixo, a borda de passo sem elemento e o console.

## Roteiro manual (viewport 360×740 e 375×812)
1. Primeiro acesso → cerca de 0,7 s após o Início carregar, o tour abre em "Passo 1 de 7 · Serviços do dia" com o card "Serviços" recortado (`.tour-spotlight`) e o cartão (`.tour-card`) abaixo dele, sem cobrir o destaque.
2. "Pular" → fecha; recarregar → não abre de novo (chave `visto` gravada).
3. Rodapé do Início → "Ver tour de novo" → reabre no passo 1.
4. "Próximo" até o fim: cada passo recorta o elemento real (`[data-tour]`: `servicos` ×2, `checklists`, `expenses`, `comunicados`, `multas`, `maintenancePhoto`); a tela rola até o elemento; o cartão fica abaixo ou acima e os botões Pular/Voltar/Próximo nunca saem da viewport. No último passo o botão é "Concluir" e "Pular" some.
5. Teclado: foco inicial em "Próximo"; Tab circula só dentro do cartão; `→`/`←` avançam/voltam; Esc fecha como "Pular". Botão Voltar do celular (fora do Início) dispara Esc pelo `backGuard`.
6. 360 px de largura: cartão com 12 px de margem, texto sem corte, três botões na mesma linha.

## Casos de borda
- Passo sem elemento na tela (ex.: tile removido ou `Recibo personalizado` ausente) é pulado: `resolveTourSteps` filtra na abertura e o efeito de medição avança se o elemento sumir no meio.
- Nenhuma âncora na tela → fecha com motivo `indisponivel`, sem marcar como visto.
- Overlay de carregamento e erro crítico ficam acima do tour (z 90+ contra z 85); o tour só abre com `dataLoading` nulo e sem `criticalError`.
- `localStorage` bloqueado: não lança; `hasSeenTour` devolve `true` para não insistir a cada abertura.

## Evidência obrigatória
- Prints `tour-passo-1.png` … `tour-passo-7.png` (um por passo) e `tour-360.png`; console sem erros.

## Limites
- Comportamento dentro do Power Apps/model-driven e o `Xrm` real não são verificáveis em localhost; a chave local usa o id real do motorista (`driverContext.id`).
