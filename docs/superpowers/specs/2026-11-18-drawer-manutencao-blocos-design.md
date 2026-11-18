# Drawer de manutenção em blocos — design

Data: 18/11/2026. Base: spec `2026-11-17-manutencoes-gaveta-passo-a-passo-design.md` (o passo a passo continua igual).

## Problema

O passo a passo agrada, mas o resto do drawer está solto:

- O pedido do motorista fica no fim, em texto corrido cinza, e a descrição se repete (título e fim).
- O topo está espalhado: subtítulo à esquerda, prazo à direita e "⋯" isolado no corpo.
- Textos de rodapé sem uso: "Edição completa no formulário do Dataverse.", "As alterações uma a uma ficam na auditoria…", "Também dá para programar pela linha na Geral.".
- Tudo empilhado, sem blocos que separem pedido, ação e histórico.

## Decisão

Direção A (escolhida entre A blocos, B duas colunas, C abas): uma coluna com três cards, nesta ordem, sem rodapé.

### 1. Cabeçalho do Drawer

- Eyebrow `MANUTENÇÃO · OM-xxxx`; título `placa · descrição` (como hoje).
- Linha de chips logo abaixo do título: grau, status e prazo (`situacao.prazo`; chip de perigo quando `prazo.perigo`), seguida de "pedido por X em dd/mm" em texto secundário. Quando programada, "motorista leva em …" substitui o texto do pedido, como hoje no subtítulo.
- "⋯ Mais ações" sai do corpo (`frota-guia__topo`) e vai para as `actions` do Drawer, antes do `BotaoAuditoria`. Itens e regras do menu não mudam; o foco continua voltando ao "⋯" depois de fechar um formulário de exceção.

### 2. Card "Pedido" (sempre primeiro)

- Fundo `surface-subtle`, título de seção "Pedido".
- Descrição do motorista entre aspas; abaixo, lista de pares: km no pedido, tipo de reparo, comentário ao motorista (cada um só aparece se tiver valor).
- Fotos do pedido (`Arquivos`, sem título próprio) e o link "Ver o veículo".

### 3. Card "Próximo passo"

- Barra de etapas (`frota-etapas`) no topo do card; abaixo, o conteúdo atual: Agendar, Programar, aguardando conclusão, ou o formulário de exceção (reagendar, reprovar, cancelar, concluir, corrigir classificação) quando aberto pelo "⋯".
- Status Realizado: o card se chama "Resultado" e mostra o `dl` da conclusão, a nota fiscal e as fotos finais (conteúdo atual de `Realizada`).
- Reprovado e Cancelado: o card mostra o motivo, como hoje.

### 4. Card "Histórico"

- A lista `frota-guia__feitos` vira linha do tempo (marcador e texto), com as mesmas linhas que `avaliar()` gera hoje; não busca data nem autor novos (isso fica na auditoria).
- Sem itens: o card não aparece.

### 5. Removidos

- Footer do Drawer inteiro (texto e botão "Abrir formulário"); a edição fica só no drawer.
- Textos "As alterações uma a uma ficam na auditoria…" e "Também dá para programar pela linha na Geral.".
- Bloco solto do fim com a descrição repetida.

## Preservado

Carregamento com contador de requisição, tratamento do StaleError (`desatualizada()`), trava síncrona do `useGravar`, `gravado()` (toast, recarga, `onChanged`), clique fora e "Descartar alterações?" com edição pendente, regras de `domain/manutencaoEtapas.ts`.

## Arquivos

- `apps/shell/src/pages/frota/components/GavetaManutencao.tsx`: cabeçalho com chips e "⋯", sem footer, cards Pedido e Histórico.
- `apps/shell/src/pages/frota/components/ManutencaoPassoAPasso.tsx`: sem o topo próprio; vira o card "Próximo passo"/"Resultado"; expõe o menu e o histórico para a gaveta.
- `apps/shell/src/pages/frota/frota.css`: estilos dos cards e da linha do tempo com tokens do DS, sem borda lateral colorida.

## Verificação

- `pnpm typecheck` e testes de `pages/frota` (ajustar os que procuram textos removidos ou o "⋯" no corpo).
- Print no mock (`#/frota-manutencoes?registro=manutencao:m1` a `m4`) para Solicitado, Agendado, Programado e Realizado, em 1440 px e em 390 px.
- `ux-audit` modo Rápido no mock.
- Skill `verificar-shell` (e a de frota, se houver) antes do PR.
