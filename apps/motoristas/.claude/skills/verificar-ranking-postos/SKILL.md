---
name: verificar-ranking-postos
description: "Verifica o ranking de postos por cidade: Custom API new_ObterRankingPostos (FuelRanking, FuelRankingPlugin) e a tela Preço dos postos no App Motoristas. Use ao mudar esses arquivos ou a entrada no Relatório de gastos."
---
# Verificar ranking de postos

## Cobre
- Código: `plugins/DriverRecordSharing/FuelRanking.cs`, `FuelRankingPlugin.cs`, `FuelRepository.LoadFleetFuelings`, `src/lib/rankingPostos.ts`, `src/screens/RankingPostosScreen.tsx`.
- Testes: `plugins/DriverRecordSharing.Tests/FuelRankingTests.cs`, `tests/rankingPostos.test.ts`.
- Regra: últimos 30 dias, CNPJ válido de `cr40f_iacnpjlido`, fora os CNPJs da empresa e o R$/litro fora de `FuelMath` (3 a 12), status enviado, a corrigir ou validado. A resposta nunca traz motorista nem CNPJ.

## Preparar ambiente
- `npm test` e `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`.
- `dotnet test` em `plugins/DriverRecordSharing.Tests` (em worktree, copie `DriverRecordSharing.snk` do checkout principal; é ignorado pelo Git).
- Dev server: `PORT=<porta livre> node scripts/dev-server.cjs`. Ele reescreve `dist/`; restaure com `git checkout -- dist package.json package-lock.json`.

## Roteiro (mock em localhost, viewport 390×844)
1. Abra `/#gastos-relatorio` e toque em "Ver preço dos postos por cidade" → rota `#ranking-postos`, título "Preço dos postos".
2. Pindamonhangaba mostra 2 postos em ordem de preço; o primeiro tem o selo "Menor preço"; o segundo diz "Baseado em 1 abastecimento".
3. Taubaté tem 1 posto e nenhum selo.
4. Sem rolagem horizontal; toque em Voltar → `#gastos-relatorio`.
5. `?mockRankingPostos=erro#ranking-postos` → "Não foi possível carregar o preço dos postos." e "Tentar de novo".
6. `?mockRankingPostos=vazio#ranking-postos` → "Ainda não há preços de postos nos últimos 30 dias."

## Dataverse (só local, nunca na nuvem)
- Provisionar com `scripts/provision-relatorio-combustivel.ps1` depois de publicar o assembly a partir da `main` atualizada.
- No DEV, `cr40f_iacnpjlido` estava vazio em 05/11/2026: a tela fica vazia até haver despesa com CNPJ lido. O PROD tem os dados, mas exige `scripts/deploy-prod.ps1`.
- Confira uma chamada autenticada de motorista: a resposta deve ter `ok`, `dias` e `cidades`, sem nome de motorista.
