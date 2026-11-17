# Painel "Filtros" do DS: lista única com grupos

Data: 16/11/2026. Aprovado pelo Renan em três seções (estrutura, interação, técnica).

## Problema

O painel "Filtros" do Design System (`design-system-betinhos`, `packages/ui/src/tableView/FiltersPanel.tsx`) é usado por todas as listas
(~35 telas). Na Composição de Preços, com a visão "Tenaris", ele mostra:

- duas abas ("Por coluna" e "Avançado"), dois modelos mentais; em qual aba o filtro cai depende de regra interna;
- uma linha por coluna filtrável (13 campos de valor com placeholder "≥ 0", que parece valor), sem hierarquia;
- filtros ativos espalhados (Status no fim da aba, o filtro de cliente em outra aba);
- filtros da visão iguais aos do usuário, e as condições que a tela não sabe ler fora do painel, num diálogo à parte
  ("Filtros da visão (N)"), às vezes com nome interno e sem como remover uma só.

## Objetivo

O painel mais simples e intuitivo possível, que permita grupos. Só o painel muda: a barra de chips (`FilterChips`), o menu
de cada coluna (`ColumnFilter`/`ColumnMenu`) e a regra de quais filtros cada tela grava ficam como estão. O formato gravado
nas visões (`TableFilters`) não muda; nenhuma tela precisa mudar além da Composição.

## Desenho

### Estrutura

- **Uma lista, sem abas.** Só aparecem as condições que existem; sem filtro, estado vazio: "Nenhum filtro" /
  "Mostrando todas as N <noun>." / botão "+ Adicionar filtro".
- **Cada condição lê como frase**: `Campo operador valor` numa caixa só ("Status é um de Pendente, Aprovado"), com × à
  direita. Clicar em cada parte edita aquela parte (popover).
- **Conectores à esquerda**: a primeira linha diz "Onde"; a segunda tem o conector clicável "e ▾"/"ou ▾" (alterna direto,
  sem menu); as demais repetem o conector, sem clique. É o `logic` do grupo.
- **Grupo**: bloco recuado (fundo `--soft`, borda esquerda 3px `--blue`) com seus próprios conectores, "+ Filtro" no fim e
  × no cabeçalho. Nasce em "ou". Um nível só de grupo dentro da raiz (`MAX_GROUP_DEPTH = 2`): dentro do grupo não há
  "+ Grupo".
- **Condições só leitura** (a tela não sabe ler, vindas da visão nativa): no topo da lista, com "Sempre" no lugar do
  conector, cadeado, borda tracejada, texto cinza e "só leitura ⓘ" com o motivo no tooltip. Têm × quando a tela permite
  remover (`onRemoveLocked`). Ficam fora do e/ou porque o Dynamics as aplica junto com tudo.
- **Origem na visão**: um aviso só no topo, "Filtros diferentes da visão salva · Restaurar", que aparece quando o rascunho
  difere dos filtros da visão salva. "Restaurar" volta o rascunho para eles (não aplica).
- **Rodapé**: "Limpar" (ghost, esvazia o rascunho; condições só leitura ficam) e o primário "Mostrar 42 composições"
  (`noun` da lista, padrão "registros"; sem contagem, "Mostrar resultados"). Sem "Cancelar": fecha no X ou Esc.
  Botão desabilitado quando o rascunho é igual ao aplicado.
- **Rascunho**: nada vale antes do primário. Fechar com mudança pede confirmação de descarte (o diálogo atual fica).

### Adicionar e editar

| Situação | Comportamento |
|---|---|
| "+ Adicionar filtro" | Abre o seletor de campo (popover): busca no topo, "Colunas da tabela" (campos sem `relation`, na ordem de `fields`) e "Outros campos" (com `relation`, mostrada à direita em cinza). Ao escolher, nasce a linha com o operador padrão do tipo e o popover do valor já aberto. |
| "+ Adicionar grupo" | Cria o grupo em "ou" com uma linha, abrindo o seletor de campo. |
| Clicar no campo | Mesmo seletor. Campo do mesmo `kind` mantém operador e valor; de outro tipo volta ao operador padrão e limpa o valor. |
| Clicar no operador | Menu com os operadores do tipo (`FILTER_OPS`), "está vazio"/"está preenchido" abaixo de um divisor. |
| Clicar no valor | Editor por tipo: texto (input), número (input BRL quando `money`, dois para "entre"), data (atalhos no topo + data/intervalo), escolha e relação (checklist com busca; relação usa `search`), Sim/Não (toggle). |
| Valor vazio ao sair | A linha mostra "escolha um valor" em cinza; o rodapé diz "1 filtro sem valor não entra" (o `conditionProblem` atual decide). |
| Menu da linha (⋯, aparece no hover e no foco) | Trocar campo, Duplicar, Colocar num grupo (embrulha a linha num grupo "ou" e abre o seletor para a segunda), Remover (`Del`). Dentro de grupo, "Colocar num grupo" não aparece. |
| × | Remove sem confirmar. Remover o último filtro de um grupo remove o grupo. × do grupo remove o grupo inteiro. |

Operadores padrão: texto "contém", número "igual a", data "hoje", escolha e relação "é um de", Sim/Não "é sim" (o primeiro
de `FILTER_OPS`, como hoje).

### Teclado e leitor de tela

- `Tab` percorre campo → operador → valor → ⋯ → × de cada linha; `Enter`/`Espaço` abre o popover; `Esc` fecha o popover;
  um segundo `Esc` fecha o painel (com o aviso de descarte se houver mudança).
- `Del`/`Backspace` com a linha (caixa) em foco remove a linha. `Ctrl/Cmd+Enter` aplica.
- Cada linha é `role="group"` com `aria-label` igual à frase ("Status é um de Pendente, Aprovado"); o conector é botão com
  `aria-label="Trocar para ou"`/`"Trocar para e"`. O número do primário fica em região `aria-live="polite"`.
- Ao remover, o foco vai para a linha seguinte (ou para "+ Adicionar filtro").

### Movimento

- Linha ou grupo que entra: opacidade 0 → 1 e `translateY(-4px)` → 0, 150 ms, `cubic-bezier(0.23, 1, 0.32, 1)`. Ao sair:
  opacidade, 120 ms. Nada anima em ação de teclado (remoção por `Del`, `Ctrl+Enter`).
- Popovers: `scale(0.97)` + opacidade, 150 ms ease-out, `transform-origin` no gatilho.
- Contagem: recalcula 400 ms depois da última mudança; enquanto carrega, o número antigo fica com opacidade 0.5 (sem spinner).
- Botões com `:active { transform: scale(0.97) }`. `prefers-reduced-motion: reduce` tira os deslocamentos e mantém só
  opacidade.
- Sem biblioteca nova: CSS transitions (o DS não usa Framer Motion).

### Celular (≤ 820px)

O mesmo conteúdo no `Sheet`. A caixa da condição quebra: campo em cima, operador e valor embaixo. Popovers viram `Sheet`
de baixo.

### Visual

Tokens do DS (`packages/tokens/design-tokens.css`): `--ink`, `--slate`, `--line`, `--soft`, `--blue`, `--blue-soft`,
`--navy` no primário, Manrope, escala de 4px. Sombra só nos popovers, muito difusa. Caixas com raio de 7–8px.

## Técnica

### Formato gravado: sem mudança

`TableFilters { quick, advanced }` fica. Duas funções puras novas em `packages/ui/src/tableView/filters.ts`:

- `toPanelList(filters: TableFilters, fields: FilterField[]): FilterGroup` — raiz "e" com: cada condição de `quick`
  (na ordem de `fields`), depois os itens do `advanced` se ele for "e", ou o `advanced` inteiro como grupo se for "ou"
  (com `id` preservado). Se o `advanced` "ou" tiver subgrupos e `quick` não estiver vazio, a lista mostra 3 níveis (não
  perde nada); o painel não oferece criar além de 2.
- `fromPanelList(list: FilterGroup, fields: FilterField[]): TableFilters` — com a raiz em "e", cada condição de raiz
  completa, que é a única do seu campo, cujo campo não é `advancedOnly` e cujo operador a célula do filtro rápido sabe
  mostrar (`QUICK_OPS`: texto `contains`/`eq`/`begins`/`not-contains`/`empty`/`not-empty`; número todos; escolha e relação
  `in`; data os atalhos e `between`; Sim/Não `yes`/`no`) volta para `quick[field]`; o resto vai para `advanced` (raiz
  "e"; se sobrar um único item e ele for grupo, ele vira a raiz do `advanced`, desfazendo o embrulho de `toPanelList`).
  Com a raiz em "ou", tudo vai para `advanced` e `quick` fica vazio.
- Propriedade testada: `fromPanelList(toPanelList(x))` é equivalente a `x` (mesmas condições, mesma lógica, mesmos
  `id`) para todos os casos de `filters.test.ts`, inclusive `quick` vazio, `advanced` vazio, `advanced` "ou" e grupos.

### `FiltersPanel`: props novas, todas opcionais

| Prop | Uso |
|---|---|
| `saved?: TableFilters` | Filtros da visão salva; liga o aviso "Filtros diferentes da visão salva · Restaurar". |
| `locked?: Array<{ id: string; label: string; reason?: string }>` | Condições só leitura, com texto já legível. |
| `onRemoveLocked?: (id: string) => void` | Remove uma condição só leitura (aplica na hora, como hoje o "limpar" do diálogo). Sem ela, sem ×. |
| `noun?: { one: string; other: string }` | Substantivo do primário e do estado vazio; padrão `{ one: 'registro', other: 'registros' }`. |

`initialTab` e `FiltersPanelTab` continuam exportados, sem efeito, marcados `@deprecated`. `ViewBar.filters` ganha
`locked`, `onRemoveLocked` e `noun` e repassa ao painel; `saved` o `ViewBar` calcula da visão ativa
(`readFilters(view.active.config.filters, fields)`). `FilterChips` "editar avançado" passa a só abrir o painel.

Versão do DS: minor (1.35.0), com nota no CHANGELOG/README do componente.

### Composição (`apps/shell/src/pages/composicao`)

- `useComposicaoViewState`: expõe `locked` como `Array<{ id, label, reason }>`, um item por `ViewFilter` travado e um por
  grupo travado (`groups`/`orGroups`, rótulo "uma destas: …"). Rótulo com o nome de exibição do catálogo e o valor
  formatado (reaproveitar `describeNative` de `ReadOnlyFilters.tsx`, que vira função em `data/`); motivo: "Condição da
  visão que esta tela não sabe editar. Ela continua valendo; para mudar, edite a visão no Dynamics ou use 'Salvar como'."
- `clearLockedFilters` vira `removeLockedFilter(id)`: chama `fromTableFilters` com o `LockedFilters` sem aquele item.
- `CompositionCommandLine` passa `locked`, `onRemoveLocked` e `noun: { one: 'composição', other: 'composições' }` ao
  `ViewBar` e deixa de renderizar `ReadOnlyFilters` (componente e teste removidos).
- Dependência `@betinhos/ui` sobe para `^1.35.0`.

## Fora do escopo

Barra de chips, filtro do cabeçalho da coluna, busca por palavra-chave, regra de gravação das visões nativas, bugs de
travamento da visão Tenaris (não reproduzidos no DEV).

## Verificação

- DS: testes de `toPanelList`/`fromPanelList` (ida e volta), testes de componente do painel (adicionar, trocar operador,
  e/ou, grupo, colocar num grupo, remover com `Del`, só leitura com e sem ×, Restaurar, Limpar, Esc duplo, estado vazio),
  `pnpm typecheck` e a suíte do pacote.
- Sistema Betinhos: testes da Composição (`table-view.test.ts`, `ComposicaoPage.view-bar.test.tsx`) e typecheck.
- Prints no mock (antes/depois) do painel na Composição e numa lista comum (desktop 1440 e celular 375), trazidos para o chat.
