# Prompt para rodar localmente: seleção, menu sobre a seleção e colunas fixas no Table do DS

Cole o bloco abaixo numa sessão local do Claude Code aberta na pasta que contém os dois checkouts (`betinhos-sistema` e `design-system-betinhos`).

```text
Tarefa: levar ao Table do Design System Betinhos (@betinhos-executive-service/ui) a seleção de linhas, o clique direito sobre a seleção e as colunas fixas escolhidas pelo usuário, e depois adotar no Sistema Betinhos. A especificação completa, com as decisões já confirmadas pelo Renan, está em:

  betinhos-sistema/docs/superpowers/specs/2026-11-11-table-ds-selecao-colunas-fixas.md

Ela está na branch claude/09870bc9-re50tv do betinhos-sistema. Se ainda não estiver na develop:
  cd betinhos-sistema && git fetch origin claude/09870bc9-re50tv && git show origin/claude/09870bc9-re50tv:docs/superpowers/specs/2026-11-11-table-ds-selecao-colunas-fixas.md

Leia a spec inteira antes de começar e siga-a. Se algo nela não fechar com o código, pare e me pergunte; não invente regra nova.

Decisões já tomadas (não reabrir):
- Nenhuma coluna é fixa por padrão; o usuário escolhe (menu do título e painel de colunas) e a escolha vai na visão salva como `pinned: true` em ViewColumnState. A tela pode declarar `defaultPinned` em ViewColumnDef.
- Colunas fixas sempre em bloco contínuo à esquerda. Fixar leva ao fim do bloco; desafixar leva para logo depois. Arrastar/Alt+setas só dentro do bloco. A coluna-título fica sempre visível e é a primeira do bloco em que estiver (única mudança na regra atual do `enforce`).
- Fixas ocupam no máximo 50% da largura visível; até 820px não há fixas.
- Com `selection` ligada: clique simples seleciona (sozinho substitui, Ctrl/Cmd alterna, Shift intervalo a partir da âncora); abrir vai para duplo clique, Enter, chevron e "Abrir" no menu. Sem `selection`, tudo como hoje.
- `rowActions(row, selection)`: clique direito fora da seleção seleciona só a linha; dentro mantém a seleção. Assinatura antiga de um argumento continua valendo.
- Tudo opcional e retrocompatível; versão minor 1.19.0. CONFIG_VERSION continua 1.

Referência de comportamento atual (copiar a lógica, não o código da Geral):
- betinhos-sistema/apps/shell/src/pages/geral/components/GeralTable.tsx (seleção, checkbox do cabeçalho com estado parcial, clique com modificadores na linha 184, coluna fixa via CSS em pages/geral/geral.css:56-59)
- betinhos-sistema/apps/shell/src/pages/geral/useGeral.ts:454 (intervalo com âncora, toggleAll)
- betinhos-sistema/apps/shell/src/pages/geral/GeralPage.tsx:545 (clique direito: fora da seleção vira a seleção, wantsNativeMenu)
- Table atual do DS: components/Table.tsx; modelo das visões: tableView/config.ts (normalizeConfig, moveVisibleColumn, resizeColumn, toggleColumn, enforce); tableView/ColumnMenu.tsx; tableView/ColumnsPanel.tsx.

FASE 1 — PR no design-system-betinhos
1. Leia o CLAUDE.md/README do design-system-betinhos para o fluxo de branch, testes, changelog, documentação (§10.9) e publicação no GitHub Packages. Siga o que estiver lá.
2. Crie uma branch a partir da branch padrão atualizada.
3. Implemente na ordem da spec, com commits separados:
   a. Modelo: `pinned`/`defaultPinned`, pinColumn/unpinColumn/pinnedColumns, normalizeConfig preservando `pinned: true`, ocultar solta, enforce com título primeiro do seu bloco, "Restaurar colunas" volta às defaultPinned. Testes puros primeiro.
   b. Layout e visual: viewLayout devolve o `left` acumulado das fixas (somando a coluna de seleção quando houver); sticky no cabeçalho e nas linhas; fundo de superfície também na linha selecionada e no hover; sombra só com scrollLeft > 0; limite de 50% (item desabilitado com dica; ao encolher a janela, as fixas da direita deixam de grudar sem mudar a visão); sem fixas até 820px; aria-live "Coluna X fixada"/"Coluna X solta".
   c. Interface: "Fixar coluna"/"Desafixar coluna" no ColumnMenu (props `pinned`, `onTogglePin`; sem callback o item some), seção "Fixas" e alfinete no ColumnsPanel.
   d. Seleção: prop `selection` ({ selected, onChange, label? }), coluna de checkbox de 40px sempre fixa à esquerda, cabeçalho em três estados sobre as linhas carregadas, modificadores, Esc limpa, role="grid" + aria-multiselectable + aria-selected + classe is-selected, linha deixa de ser <button>, duplo clique/Enter/chevron abrem.
   e. rowActions(row, selection) com a regra do clique direito e wantsNativeMenu.
   f. Encaixes `scrollRef` e `afterRows`.
4. Cubra todos os testes listados na seção "Testes no DS" da spec. Rode os testes, typecheck e build do DS e mostre a saída.
5. Atualize a documentação do Table (§10.9) e o changelog com as props novas e a mudança na regra do título.
6. Verifique no navegador (storybook/página de exemplos do DS, se existir): fixar/desafixar pelo menu e pelo painel, rolagem horizontal com sombra, limite de 50%, seleção com Ctrl e Shift, menu sobre a seleção, teclado. Tire prints.
7. Abra o PR no design-system-betinhos descrevendo o que mudou, a mudança na regra do título e o que foi verificado. Não publique a versão nem faça merge sem a minha aprovação.

FASE 2 — adoção no betinhos-sistema (só depois da 1.19.0 publicada)
1. Na develop atualizada do checkout principal, crie uma branch de feature (o PR vai para a develop, nunca para a main).
2. Suba @betinhos/ui para ^1.19.0 em apps/shell/package.json e atualize o pnpm-lock.yaml.
3. Ligue `onTogglePin` (fixar colunas) em todas as listas que já usam Table/VirtualTable com `view`. Confira que o VirtualTable (apps/shell/src/app/VirtualTable.tsx) continua certo com as fixas e os espaçadores --vt-before/--vt-after.
4. Não ligue `selection` em Pagantes nem OPs ainda: antes me pergunte quais ações em lote cada tela teria.
5. Inclua a spec (docs/superpowers/specs/2026-11-11-table-ds-selecao-colunas-fixas.md) neste PR, se ela ainda não estiver na develop.
6. Rode `pnpm typecheck` e `pnpm test` e use a skill verificar-shell. Verifique no navegador (`pnpm dev`, modo mock) fixar/desafixar e a visão salva voltando com as fixas.
7. Abra o PR para a develop. Não rode `pnpm push`; quem publica no DEV é o workflow Deploy depois do merge.

FASE 3 — trocar a GeralTable pelo Table (PR separado, depois da fase 2 no DEV)
- Só comece quando eu pedir. Pontos a resolver estão na seção "Ordem de entrega" da spec: ColumnPrefs/useGeralViewState precisam carregar `pinned`, `cr40f_id` com defaultPinned, edição na célula dentro de column.cell, teste lado a lado com dados do DEV.

Regras gerais:
- Não publique nada no PROD nem rode scripts que alterem o Dataverse (provision-*, push:plugin:*, sitemap:*).
- Commits e PRs em português, como o resto do repositório.
- Ao terminar cada fase, me diga o que foi feito, o que foi verificado (com a saída dos testes) e o que não foi verificado.
```
