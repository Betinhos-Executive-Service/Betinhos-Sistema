---
name: verificar-ranking-postos
description: "Verifica os postos perto do motorista: Custom API new_ObterRankingPostos (FuelRanking, FuelRankingPlugin, PostoGeocoder) e a tela Postos perto de você no App Motoristas. Use ao mudar esses arquivos ou a entrada no Relatório de gastos."
---
# Verificar ranking de postos

## Cobre
- Código: `plugins/DriverRecordSharing/FuelRanking.cs`, `FuelRankingPlugin.cs`, `FuelRepository.LoadFleetFuelings`, `FuelRepository.LoadPostos`, `PostoGeocoder.cs`, `src/features/despesas/rankingPostos.ts`, `src/features/despesas/RankingPostosScreen.tsx`.
- Testes: `plugins/DriverRecordSharing.Tests/FuelRankingTests.cs`, `tests/rankingPostos.test.ts`.
- Regra: últimos 30 dias, categoria "Abastecimento" (DEV) ou "Combustível" (PROD), CNPJ válido de `cr40f_iacnpjlido`, fora os CNPJs da empresa e o R$/litro fora de `FuelMath` (3 a 12), status enviado, a corrigir ou validado. A resposta nunca traz motorista nem CNPJ. Coordenada vem do cadastro da ANP e, sem ela, do Nominatim (mostrada como "cerca de"); posto pendente fica fora. Cada chamada resolve no máximo 1 posto novo; se BrasilAPI, ANP ou Nominatim falharem, nada é gravado e o posto volta para a fila. O app filtra 10 km e calcula o semáforo pela meta `METAS_GASTOS.litro`.

## Preparar ambiente
- `npm test` e `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`.
- `dotnet test` em `plugins/DriverRecordSharing.Tests` (em worktree, copie `DriverRecordSharing.snk` do checkout principal; é ignorado pelo Git).
- Dev server: `PORT=<porta livre> node scripts/dev-server.cjs`. Ele reescreve `dist/`; restaure com `git checkout -- dist package.json package-lock.json`.

## Roteiro (mock em localhost, viewport 390×844)
1. Abra `/?p=1#gastos-relatorio` e toque no cartão "Postos perto de mim", em Suas médias (sem gastos no período, o link "Ver postos perto de mim") → rota `#ranking-postos`, título "Postos perto de você".
2. A lista vem do mais perto para o mais longe; "Posto Exemplo Distante" (mais de 10 km) não aparece.
3. Semáforo: R$ 6,09 "Recomendado", R$ 6,19 "Atenção" e R$ 6,83 "Evitar".
4. O posto com ponto do Nominatim mostra "cerca de X km"; o da ANP mostra só a distância.
5. Sem rolagem horizontal; toque em Voltar → `#gastos-relatorio`.
6. `?mockRankingPostos=semgps#ranking-postos` → aviso de localização e "Tentar de novo", sem lista.
7. `?mockRankingPostos=erro#ranking-postos` → "Não foi possível carregar os postos." e "Tentar de novo".
8. `?mockRankingPostos=vazio#ranking-postos` → "Nenhum posto usado pela frota a até 10 km de você nos últimos 30 dias."

## Dataverse (só local, nunca na nuvem)
- Provisionar com `scripts/provision-relatorio-combustivel.ps1` depois de publicar o assembly a partir da `main` atualizada.
- No DEV, `cr40f_iacnpjlido` estava vazio em 05/11/2026: a tela fica vazia até haver despesa com CNPJ lido. O PROD tem os dados, mas exige `scripts/deploy-prod.ps1`.
- Confira uma chamada autenticada de motorista: a resposta deve ter `ok`, `dias` e `postos`, sem nome de motorista.
- Confira a permissão de localização no celular, na URL direta e dentro do Power Apps.
