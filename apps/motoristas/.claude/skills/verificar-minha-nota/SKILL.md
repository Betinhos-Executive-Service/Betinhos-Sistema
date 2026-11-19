---
name: verificar-minha-nota
description: "Verifica a nota de condução da Infleet no App Motoristas: Custom API new_NotaInfleet (NotaInfleet, NotaInfleetPlugin, InfleetGateway.Query) e a tela Minha nota (src/features/minha-nota). Use ao mudar esses arquivos, o módulo Minha nota da InitialScreen ou o capítulo do tour."
---
# Verificar Minha nota (Infleet)

## Cobre
- Código: `packages/plugins/Betinhos.DriverRecordSharing/NotaInfleet.cs`, `NotaInfleetPlugin.cs`, `InfleetGateway.Query`, `packages/plugins/scripts/register-notainfleet-customapi.ps1`, `src/features/minha-nota/**`.
- Testes: `packages/plugins/Betinhos.DriverRecordSharing.Tests/NotaInfleetTests.cs`, `NotaInfleetPluginTests.cs`, `tests/notaInfleet.test.ts`.
- Regra (spec `docs/superpowers/specs/2026-11-19-nota-infleet-app-design.md`): uma consulta `driverProfile` com aliases `p90` (90 dias) e `m0..m5` (meses, fronteiras 00:00 America/Sao_Paulo). Sem `new_infleetdriverid` → `sem_cadastro` sem chamar a Infleet; `km < 50` ou `generalGrade` nulo → `em_formacao`. Comportamentos só não nulos, da pior para a melhor; meses só com km e nota. Faixas: ≥90 Ótima, 75–89 Boa, <75 Atenção; "O que melhorar" = até 2 piores abaixo de 90. Sem ranking nem posição.
- Cache no aparelho (`notaCache.ts`, chave `app-motoristas-nota-infleet-v1`, por usuário): vale 6 h; vencido aparece na hora e a tela troca quando a Infleet responde. Início e Minha nota dividem uma consulta só (`useNotaInfleet`).
- Token só pela tabela `cr40f_segredo` (`infleet.token`): a Custom API não tem step, então não há configuração segura de fallback. Trace nunca leva token nem resposta crua.

## Preparar ambiente
- `pnpm test` e `pnpm typecheck` em `apps/motoristas`.
- `~/.dotnet/dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests -p:SignAssembly=false --filter NotaInfleet` (roda no Linux via mono).
- Build: `node scripts/build-react-singlefile.cjs --no-version` gera `dist/index.html`; sirva `dist/` estático em porta livre.

## Roteiro (mock em localhost, viewport 390×844)
1. Abra `/?p=1`, feche o tour com Esc. Na grade do Início, "Minha nota" mostra a nota (83) no lugar do ícone, na cor da faixa (verde ≥90, amarelo 75–89, vermelho <75; `?mockNota=93` e `?mockNota=68` trocam a nota do mock). Sem nota (em formação, sem cadastro, erro) fica o ícone gauge. Recarregar a página mostra a nota já em 250 ms (cache). "Apagar dados locais" limpa o cache (`app-motoristas-nota-infleet-v1`); cache com formato inválido é descartado e a nota volta da Infleet.
2. Toque → rota `#minha-nota`. Esc de novo se o capítulo do tour abrir. Skeleton enquanto carrega.
3. Mock padrão: anel 83 "de 100" em amarelo, selo "Boa", "Faltam 7 pontos para Ótima", "↑ Subiu 3 pontos em relação a out/26", "Últimos 90 dias · 5.156 km"; cada item de "O que melhorar" com a dica; "O que melhorar" com Frenagem brusca 67 (vermelho) e Curva brusca 78 (amarelo), cada item na cor da própria faixa; `?mockNota=74` mostra "Falta 1 ponto para Boa" (singular); barras por comportamento da pior para a melhor; evolução jun/26 → nov/26.
4. `?mockNota=formacao#minha-nota` → "Sua nota está em formação…" com o km do período, sem nota.
5. `?mockNota=sem#minha-nota` → "Seu cadastro ainda não está ligado à telemetria. Fale com a operação."
6. `?mockNota=erro#minha-nota` → mensagem de erro e "Tentar de novo".
7. No fim, o parágrafo de como a nota funciona com as faixas. Sem rolagem horizontal; Voltar retorna ao Início.

## Dataverse (só local, nunca na nuvem)
- Pré-requisito: linha `infleet.token` na `cr40f_segredo` do ambiente (`packages/deploy/gravar-segredo.ps1`). Em 19/11/2026 o PROD tinha, o DEV não.
- Depois do Deploy publicar o assembly: `register-notainfleet-customapi.ps1` (dry-run) e `-Apply`, do checkout principal na `develop`.
- Prova: motorista real com `new_infleetdriverid` abre Minha nota e vê a mesma `generalGrade` do `driverProfile` de 90 dias consultado direto na Infleet (sem imprimir o token).
