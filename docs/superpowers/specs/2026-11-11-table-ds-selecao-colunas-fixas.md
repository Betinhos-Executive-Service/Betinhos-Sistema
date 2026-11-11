# Table do DS: seleção de linhas, menu sobre a seleção e colunas fixas escolhidas pelo usuário

Data: 11/11/2026. Destino: PR no `design-system-betinhos` (`@betinhos-executive-service/ui`, versão minor 1.19.0), depois a adoção no shell.

## Por quê

A Tabela Geral (`apps/shell/src/pages/geral/components/GeralTable.tsx`) tem um grid próprio com coisas que o `Table` do DS não tem: seleção por checkbox e por clique (Ctrl/Cmd, Shift), menu de clique direito que age sobre a seleção e coluna fixa na rolagem horizontal. As outras listas (Pagantes, OPs, Pendências, Infrações…) usam o `Table` e ficam sem isso. Levar esses comportamentos ao DS deixa todas as listas iguais e permite, no fim, apagar o grid próprio da Geral.

Ordenar, filtrar pelo título, ocultar, reordenar e redimensionar colunas já existem no `Table` (com `view`) e não mudam.

## O que muda no DS

Tudo é opcional: tela que não passa as props novas continua como está.

### 1. Colunas fixas (escolhidas pelo usuário)

Nenhuma coluna é fixa por padrão. O usuário escolhe quais ficam fixas e a escolha é gravada na visão, como larguras e ordem.

**Modelo (`tableView/config.ts`):**

```ts
export type ViewColumnDef = {
  key: string
  label: string
  defaultHidden?: boolean
  /** Começa fixa na visão padrão (e no "Restaurar colunas"). */
  defaultPinned?: boolean
}

export type ViewColumnState = { key: string; visible: boolean; width?: number; label?: string; pinned?: true }
```

- `pinned` é opcional, então `CONFIG_VERSION` continua 1 e as visões salvas antigas abrem sem colunas fixas (ou com as `defaultPinned`, se forem a visão padrão). `normalizeConfig` passa a preservar `pinned: true` e descarta qualquer outro valor.
- Funções puras novas, ao lado de `moveVisibleColumn`/`resizeColumn`/`toggleColumn`: `pinColumn(config, key)`, `unpinColumn(config, key)`, `pinnedColumns(config)`.

**Regras:**

1. As colunas fixas formam um bloco contínuo à esquerda. Fixar uma coluna leva a coluna para o fim do bloco fixo; desafixar leva para logo depois do bloco. Assim a ordem da tela sempre mostra o que fica parado e o que rola, e os deslocamentos `left` se somam sem buracos.
2. A coluna-título (primeira do código, regra de `enforce`) continua sempre visível e passa a ser a primeira **do bloco em que estiver**: primeira do bloco fixo se estiver fixa, primeira das que rolam se não estiver. Hoje `enforce` a põe em primeiro absoluto; essa é a única regra existente que muda.
3. Arrastar e Alt+setas reordenam só dentro do bloco. Para passar uma coluna de um bloco a outro, o usuário fixa ou desafixa.
4. Coluna oculta perde o `pinned` (ao reaparecer, volta solta).
5. Limite de largura: as fixas não passam de 50% da largura visível da tabela. "Fixar coluna" fica desabilitado, com dica "As colunas fixas já ocupam metade da tabela", quando a nova coluna passaria do limite. Se a janela encolher e o limite estourar, as fixas da direita deixam de grudar até caber de novo, sem mexer na visão salva.
6. Até 820px (cabeçalho escondido, layout de lista) não há colunas fixas; a visão salva não muda.
7. Coluna fixa usa largura em px: a salva ou o `defaultWidth`/`columnDefaultWidth`. Coluna `minmax(…, 1fr)` vira a largura padrão em px enquanto estiver fixa.

**Interface:**

- Menu do título (`ColumnMenu`): item "Fixar coluna" / "Desafixar coluna" (ícones pin / pin-off), entre "Limpar filtro" e "Ocultar coluna". Prop nova `pinned?: boolean` e callback `onTogglePin?: () => void`; sem o callback, o item não aparece.
- Painel de colunas (`ColumnsPanel`): seção "Fixas" no topo da lista, botão de alfinete em cada linha e "Restaurar colunas" volta também às `defaultPinned`.
- Visual: célula fixa com fundo de superfície (inclusive na linha selecionada e no hover), cabeçalho fixo acima das demais (`z-index`) e sombra de divisão à direita da última fixa só quando a tabela rolou na horizontal (`scrollLeft > 0`).
- Anúncio em `aria-live`: "Coluna X fixada" / "Coluna X solta".

**Implementação:** `viewLayout` já conhece a largura de cada coluna colocada; ele passa a devolver também o deslocamento `left` acumulado de cada fixa, aplicado como `position: sticky; left: var(--bt-pin-left)` na célula do cabeçalho e das linhas. A coluna de seleção (item 2) soma ao deslocamento.

### 2. Seleção de linhas

```ts
type TableSelection<Row> = {
  /** Chaves (`rowKey`) selecionadas. Estado controlado pela tela. */
  selected: ReadonlySet<string>
  onChange: (next: Set<string>) => void
  /** Texto do checkbox para leitor de tela. Padrão: "Selecionar linha". */
  label?: (row: Row) => string
}

type TableProps<Row> = {
  // …
  selection?: TableSelection<Row>
}
```

Comportamento (o mesmo da Geral, `GeralTable.tsx:184` e `useGeral.ts:454`):

- Coluna de checkbox de 40px na extrema esquerda, sempre fixa (não é coluna de dados, não aparece no painel de colunas e não conta para o limite de 50%).
- Checkbox do cabeçalho: marcado quando todas as linhas carregadas (`rows`) estão selecionadas, parcial quando algumas, e alterna entre todas e nenhuma. Vale para as linhas carregadas, não para o total do servidor.
- Clique na linha (fora de link, botão, campo e menu): sozinho substitui a seleção pela linha; Ctrl/Cmd alterna a linha; Shift seleciona o intervalo desde a âncora (último clique sem Shift), na ordem de `rows`. A âncora fica dentro do `Table`.
- Esc com o foco na tabela limpa a seleção.
- Com `selection`, a linha deixa de ser `<button>`: o `Table` usa `role="grid"`, `aria-multiselectable` e `aria-selected` em cada linha, e classe `is-selected`.
- Abrir o registro com seleção ligada: duplo clique na linha, Enter com a linha focada, o chevron (botão próprio) e o item "Abrir" do menu. Sem `selection`, o clique simples continua abrindo, como hoje.
- O `Table` não remove da seleção as linhas que somem depois de filtrar ou recarregar; a tela decide (a Geral limpa ao trocar de visão).

### 3. Clique direito sobre a seleção

```ts
rowActions?: (row: Row, selection: Row[]) => MenuAction[]
```

- Clique direito numa linha fora da seleção: a seleção vira só essa linha (`onChange`) e o menu abre com `selection = [row]`.
- Clique direito numa linha selecionada: a seleção fica como está e o menu recebe todas as linhas selecionadas que estão em `rows`.
- Ctrl+clique direito e clique direito em campo ou célula em edição continuam com o menu do navegador (`wantsNativeMenu`, que já existe).
- Sem `selection`, `selection` é sempre `[row]`. Quem já passa `rowActions(row)` não precisa mudar nada.

A barra de ações em lote continua na tela (a Geral tem a dela); o DS só entrega a seleção.

### 4. Encaixes para rolagem infinita

Dois encaixes que a Geral usa e que valem para qualquer lista longa:

- `scrollRef?: Ref<HTMLDivElement>`: o contêiner de rolagem (`.bt-table__scroll`), raiz do observador que carrega mais linhas.
- `afterRows?: ReactNode`: conteúdo logo depois da última linha, dentro da rolagem (o sentinela de "carregar mais").

A virtualização continua no shell (`apps/shell/src/app/VirtualTable.tsx`) por enquanto; as colunas fixas precisam funcionar com os espaçadores `--vt-before`/`--vt-after` que ela usa.

## O que fica na Geral

Colunas vindas dos metadados do Dataverse (`attributes`, `cellKind`, `formatCell`), edição na célula (`gr-cell--editing`), visão em cards e as ações em lote (Voucher, Copiar, Gerar OP, Disparar, Liberar para o portal…).

## Testes no DS

- `config`: fixar e desafixar movem para o fim do bloco / logo depois; título primeiro do seu bloco; ocultar solta; `normalizeConfig` preserva `pinned: true` e descarta outros valores; visão sem `pinned` abre igual; "Restaurar" volta às `defaultPinned`.
- Layout: deslocamentos `left` acumulados, com e sem a coluna de seleção; limite de 50% desabilita "Fixar coluna"; até 820px sem fixas.
- Seleção: clique sozinho, Ctrl/Cmd, Shift com e sem âncora, cabeçalho em três estados, Esc, cliques em controles internos não selecionam, duplo clique e Enter abrem.
- Menu: linha fora da seleção vira a seleção; linha dentro mantém; `rowActions` antigo de um argumento continua funcionando; Ctrl+clique direito abre o menu nativo.
- Acessibilidade: `role="grid"`, `aria-multiselectable`, `aria-selected`, rótulos dos checkboxes, anúncios de fixar.

## Ordem de entrega

1. **PR no DS (1.19.0):** itens 1 a 4, com os testes acima e a página de documentação do `Table` atualizada (§10.9). Nenhuma tela muda até passar as props novas.
2. **Shell, listas que já usam `Table`:** atualizar a dependência; ligar `onTogglePin` em todas as listas com visão (o botão de fixar não depende de seleção); ligar `selection` só onde houver ação em lote definida. Pagantes e OPs primeiro, depois de decidir quais ações em lote elas têm.
3. **Geral:** trocar a `GeralTable` pelo `Table` e apagar o grid próprio. A coluna `cr40f_id` entra com `defaultPinned` para a visão padrão ficar como hoje. Pontos a conferir antes: a Geral guarda as colunas no formato próprio (`ColumnPrefs`, convertido para `ViewConfig` em `useGeralViewState.ts`) e o grid dela grava larguras e ordem por `onResize`/`onMove`; o `pinned` precisa entrar nessa conversão, e a edição na célula precisa caber em `column.cell`. Teste lado a lado: Shift, menu, larguras salvas, colunas fixas e rolagem com muitas linhas.

## Fora do escopo

Colunas fixas à direita, seleção de todas as linhas do servidor ("selecionar os 2.340"), virtualização dentro do DS.
