---
name: verificar-postos-proximos
description: "Verifica a tela Postos próximos do App Motoristas (mapa Leaflet com OpenStreetMap, postos da rede CTF da tabela new_postocombustivel, os 10 mais próximos, cartão com Ir/Waze) e o atalho na tela de gastos. Use ao mudar src/features/postos/**, tests/postosProximos.test.ts, wazeNavigateUrl em src/features/detalhe/mapLinks.ts ou a entrada no menu inicial."
---
# Verificar postos próximos

## Cobre
- Código: `src/features/postos/` (`postosProximos.ts` com a consulta OData por área, haversine e top 10; `remoto.ts` com o mock e a leitura via `Xrm.WebApi`; `PostosMapa.tsx`; `PostosProximosScreen.tsx`; `rotas.tsx`; `postos.css`), `wazeNavigateUrl` em `src/features/detalhe/mapLinks.ts`, entrada "Postos próximos" em `src/features/servicos/InitialScreen.tsx`, atalho `.expense-postos` em `src/features/despesas/ExpenseScreen.tsx`, rota `#postos-proximos` em `src/app/navigation.ts`, capítulo do tour `postos-proximos`.
- Regra: só `new_aceitactf = true`, `new_statusgeo` diferente de Pendente (100000000) e com latitude e longitude. Busca por caixa da área visível (debounce de 400 ms, `$select` mínimo, `$top` 200); abaixo do zoom 11 pede para aproximar o mapa. Sem GPS, centro em São José dos Campos com aviso discreto. Sem nota de avaliação, de propósito.

## Preparar ambiente
- `pnpm test` e `pnpm typecheck` em `apps/motoristas`.
- Build: `node scripts/build-react-singlefile.cjs --no-version` (apaga e recria `dist/`). Sirva `dist/` com `python3 -m http.server <porta>` e abra `http://localhost:<porta>/index.html#postos-proximos`; o servidor do Vite puro não aplica o CSS do app. Os mosaicos do OpenStreetMap precisam de internet.

## Roteiro (mock em localhost, viewport 390×844, geolocalização em -23.1896, -45.8841)
1. Menu inicial → "Postos próximos" abre `#postos-proximos`; no Relatório de gastos o botão "Postos próximos" leva à mesma tela e Voltar retorna ao ponto de origem.
2. O mapa mostra mosaicos do OSM, a legenda "© OpenStreetMap", pinos azuis dos postos e o marcador da posição. Pendentes nunca aparecem (o mock só traz geocodificados).
3. A lista mostra até 10 postos, do mais perto ao mais longe do centro do mapa. Tocar em um item centraliza o mapa e abre o cartão: nome, endereço, "a X km de você", "Ir" (Google Maps) e "Waze".
4. Tocar em um pino abre o mesmo cartão; X fecha. Arrastar o mapa recarrega a lista depois de ~400 ms; zoom abaixo de 11 mostra o pedido para aproximar.
5. Negar a localização: aviso discreto de centro padrão, mapa em São José dos Campos. O botão de mira volta à posição do motorista.
6. Sem rolagem horizontal; a versão `vX.Y.Z · dd/mm/aaaa HH:mm` aparece no canto.

## No DEV (não coberto pelo mock)
- Abra o app pelo Dataverse e confira a consulta real: o papel do motorista precisa de leitura em `new_postocombustivel`, e a Web API devolve a lista de postos CTF na área (compare com a tabela por `new_municipio`).
- Confira no navegador do WebResource se a política de segurança de conteúdo deixa carregar `tile.openstreetmap.org` e se o uso de mosaicos continua dentro da política do OSM (uso leve; para volume alto, trocar o provedor).
