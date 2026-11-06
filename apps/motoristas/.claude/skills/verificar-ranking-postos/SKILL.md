---
name: verificar-ranking-postos
description: "Verifica os postos perto do motorista e as avaliações: Custom APIs new_ObterRankingPostos e new_AvaliarPosto (FuelRanking, FuelRankingPlugin, PostoGeocoder, PostoAvaliacoes, PostoAvaliacaoPlugin) e a tela Postos perto de você no App Motoristas. Use ao mudar esses arquivos ou a entrada no Relatório de gastos."
---
# Verificar ranking de postos

## Cobre
- Código: `plugins/DriverRecordSharing/FuelRanking.cs`, `FuelRankingPlugin.cs`, `FuelRepository.LoadFleetFuelings`, `FuelRepository.LoadPostos`, `PostoGeocoder.cs`, `src/lib/rankingPostos.ts`, `src/screens/RankingPostosScreen.tsx`, `plugins/DriverRecordSharing/PostoAvaliacoes.cs`, `PostoAvaliacaoPlugin.cs`, `FuelRepository.LoadAvaliacoes`, `SaveAvaliacao`, `src/lib/avaliacaoPostos.ts`, `src/components/gastos/PostoDetalheDialog.tsx`.
- Testes: `plugins/DriverRecordSharing.Tests/FuelRankingTests.cs`, `PostoAvaliacoesTests.cs`, `tests/rankingPostos.test.ts`.
- Regra: últimos 30 dias, categoria "Abastecimento" (DEV) ou "Combustível" (PROD), CNPJ válido de `cr40f_iacnpjlido`, fora os CNPJs da empresa e o R$/litro fora de `FuelMath` (3 a 12), status enviado, a corrigir ou validado. A resposta nunca traz CNPJ, e os abastecimentos não identificam motorista; só comentários de avaliação saem com o nome do autor, por decisão do Renan. Coordenada vem do cadastro da ANP e, sem ela, do Nominatim (mostrada como "cerca de"); posto pendente fica fora. Cada chamada resolve no máximo 1 posto novo; se BrasilAPI, ANP ou Nominatim falharem, nada é gravado e o posto volta para a fila. O app filtra 10 km e calcula o semáforo pela meta `METAS_GASTOS.litro`.

- Avaliações: qualquer motorista avalia, uma por posto (avaliar de novo substitui). Valem 12 meses. `new_oculta`, marcada pela gestão na tabela `new_avaliacaoposto`, esconde só o comentário: o voto segue contando, e editar não desfaz a ocultação. Sem a tabela ou com falha na leitura, o ranking sai com `postoId` e `avaliacoes` nulos, e a ficha esconde a seção. A data é `new_avaliadoem`, não `modifiedon`, que muda ao ocultar.

## Preparar ambiente
- `npm test` e `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`.
- `dotnet test` em `plugins/DriverRecordSharing.Tests` (em worktree, copie `DriverRecordSharing.snk` do checkout principal; é ignorado pelo Git).
- Dev server: `PORT=<porta livre> node scripts/dev-server.cjs`. Ele reescreve `dist/`; restaure com `git checkout -- dist package.json package-lock.json`.

## Roteiro (mock em localhost, viewport 390×844)
1. Abra `/?p=1#gastos-relatorio` e toque no cartão "Postos perto de mim", em Suas médias (sem gastos no período, o link "Ver postos perto de mim") → rota `#ranking-postos`, título "Postos perto de você".
2. O destaque mostra o menor preço do raio ("Melhor opção perto de você" se estiver na meta; senão "Menor preço perto de você"); "Posto Exemplo Distante" (mais de 10 km) não aparece.
3. Em Outros postos, os itens vêm do mais perto para o mais longe, com a recomendação Atenção ou Evitar e nomes em caixa alta já ajustados.
4. Tocar em um posto abre a ficha com endereço, distância ("cerca de" no ponto aproximado), "Abrir no Maps" e até 5 últimos abastecimentos com data e R$/litro, sem motorista. X, Esc e toque fora fecham; a lista segue na mesma posição.
4b. O ícone de mapa da linha abre `google.com/maps/search` com a busca "Posto de gasolina <nome> <endereço>" sem abrir a ficha.
5. Sem rolagem horizontal; toque em Voltar → `#gastos-relatorio`.
6. `?mockRankingPostos=semgps#ranking-postos` → aviso de localização e "Tentar de novo", sem lista.
7. `?mockRankingPostos=erro#ranking-postos` → "Não foi possível carregar os postos." e "Tentar de novo".
7b. `?mockRankingPostos=lento#ranking-postos` → painel de combustível animado no centro, com as etapas Localização e Postos, e "Buscando sua localização…" e depois "Procurando postos perto de você…". Atualizar com a lista aberta mantém a lista, mostra "Atualizando postos…" e, se falhar, avisa sem apagar a lista.
8. `?mockRankingPostos=vazio#ranking-postos` → "Nenhum posto usado pela frota a até 10 km de você nos últimos 30 dias."

9. Na ficha, "Avaliações dos motoristas" mostra "4 de 5 recomendam", até 3 motivos e comentários com nome e data. "Avaliar este posto" abre o formulário; Enviar fica desabilitado até escolher Recomendo ou Não recomendo, e trocar o sentido limpa os motivos.
10. Com rascunho alterado, Esc, X, toque fora e Cancelar perguntam "Descartar alterações?"; "Continuar editando" preserva o texto. Sem alteração, fecham direto.
11. Enviar atualiza a ficha e a lista, mostra "Avaliação enviada" e o botão vira "Editar minha avaliação", com a avaliação anterior preenchida.
12. `?mockRankingPostos=falhaavaliar#ranking-postos` → erro no formulário, sem perder o rascunho.

## Dataverse (só local, nunca na nuvem)
- Provisionar com `scripts/provision-relatorio-combustivel.ps1` depois de publicar o assembly a partir da `main` atualizada.
- No DEV, `cr40f_iacnpjlido` estava vazio em 05/11/2026: a tela fica vazia até haver despesa com CNPJ lido. O PROD tem os dados, mas exige `scripts/deploy-prod.ps1`.
- Confira uma chamada autenticada de motorista: a resposta deve ter `ok`, `dias` e `postos`, sem nome de motorista fora dos comentários.
- Confira `new_AvaliarPosto` com dois motoristas: a segunda avaliação do mesmo motorista substitui a primeira, e marcar `new_oculta` tira o comentário da resposta sem mudar a contagem.
- Confira a permissão de localização no celular, na URL direta e dentro do Power Apps.
