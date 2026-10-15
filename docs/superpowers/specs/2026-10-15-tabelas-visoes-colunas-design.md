# Tabelas: visões salvas e controle de colunas — design e plano

Data: 15/10/2026 · Branch: `claude/design-system-tables-columns-b6e807` · Status: aprovado; etapa 1 concluída (Design System 1.6.0, commit 73e1bb5 no Módulo Qualidade, branch design/1.6.0-visoes-colunas)

## Objetivo

Toda lista de registros do Sistema Betinhos passa a ter, obrigatoriamente:

1. **Colunas sob controle do usuário:** mostrar/ocultar, reordenar e ajustar largura.
2. **Visões salvas:** pessoais (só o dono vê) e públicas (todos veem; só gestores criam/alteram).
3. **Uma visão padrão em código** por tela, que nunca some e serve de "restaurar".

Hoje só a Geral tem isso (visões via `userquery`, colunas no `localStorage`). O `Table` do `@betinhos/ui` e o §10.9 do Design System não tratam o assunto.

## Decisões (15/10/2026)

| Tema | Decisão |
|---|---|
| Persistência | Tabela nova `cr40f_visaodetabela` no Dataverse, configuração em JSON. A Geral continua em `savedquery`/`userquery`, pela mesma interface. |
| Visão pública | Só gestores/admin criam, alteram ou excluem. Qualquer usuário cria visão pessoal. |
| Escopo obrigatório | Listas de registros: Geral, Pessoas, Despesas, Frota (Veículos, Registros), OPs, Pagantes, Infrações, Pendências (Financeiro e Documentos), Funcionários. Dispensadas: tabelas de resumo do Dashboard, drawers de detalhe e a tabela landscape do Operacional. |
| Interação | Arrastar no cabeçalho e no painel, com alternativa por teclado/botões; largura arrastando a borda do cabeçalho. No mobile (e pointer grosso), só pelo painel. |
| Página de lista | Sem `PageHeader`, descrição ou KPIs: o seletor de visão é o título e divide a linha com Colunas, Filtros, busca e ação primária; tabela logo abaixo (estilo grid nativo do model-driven). Pedido do Renan em 15/10/2026. |

Assumi: "controle de quais tabelas mostram" = quais **colunas** aparecem.

## 1. Regras no Design System (§10.9.1 novo) — publicado como 1.6.0

Texto final em `DESIGN_SYSTEM.md` §10.2, §10.9.1 e §11.2. Resumo do que foi proposto:

Editar no repo **Módulo Qualidade** e publicar com `npm run design:publish-parent` (arquivos em LF; sobe versão e changelog). Texto proposto:

- **Barra de visão** no `PageToolbar`, à esquerda: seletor de visão + estado "Alterada" quando a tela difere da visão salva. Ações: Salvar, Salvar como, Renomear, Excluir, Tornar pública (só gestor), Restaurar padrão.
- **Seletor** agrupa em "Padrão", "Públicas" e "Minhas", nessa ordem. Visão pública mostra ícone de grupo; nunca usa cor só para diferenciar.
- **Botão "Colunas"** (ícone `Columns3`, secundário) abre painel: `Drawer` à direita no desktop, `Sheet` no mobile. Cada item: alça de arraste, checkbox com rótulo, botões ↑/↓. Rodapé: "Restaurar colunas", "Cancelar", "Aplicar". Fechar com alteração pede "Descartar alterações?".
- **Coluna obrigatória:** a primeira coluna (título) não pode ser ocultada nem sair da primeira posição; sempre fica ao menos uma coluna visível.
- **Reordenar no cabeçalho:** só em pointer fino. Coluna arrastada fica com fundo `#FCFCFB`, borda azul de foco e sem sombra pesada; as outras deslizam 150 ms ease-out. `prefers-reduced-motion`: sem deslize.
- **Largura:** alça de 8 px na borda direita do cabeçalho, cursor `col-resize`, mínimo 90 px, máximo 1200 px. Duplo clique volta à largura padrão. Teclado: foco na alça + ←/→ (16 px).
- **Teclado no cabeçalho:** `Alt+←/→` move a coluna focada; anúncio em `aria-live` ("Coluna Cliente movida para a posição 3 de 8").
- **Mobile (< 820 px):** a tabela vira card (regra atual); o card usa as 3 primeiras colunas visíveis da visão.
- **Visão padrão** é definida no código da tela, não aparece como editável e é o destino de "Restaurar".
- **Última visão usada** por tela fica no navegador (`localStorage`) — conveniência, não dado.
- Sem gradiente, só tema claro, cores dos tokens existentes. Nenhum token novo, exceto se o arraste exigir (pedir aprovação).

## 2. Schema Dataverse (DEV)

Tabela `cr40f_visaodetabela` (propriedade: usuário/equipe), via `packages/deploy/provision-visoes.ps1` (mesmo padrão idempotente de `provision-documentos.ps1`, DRY RUN sem `-Apply`):

| Campo | Tipo | Uso |
|---|---|---|
| `cr40f_name` | texto 100 | nome da visão |
| `cr40f_tela` | texto 100 | id estável da lista (`pessoas`, `frota.veiculos`…) |
| `cr40f_publica` | sim/não | espelho para filtrar; a regra real é o dono |
| `cr40f_configuracao` | texto multilinha 20 000 | JSON versionado (abaixo) |
| `cr40f_ordem` | inteiro | ordem entre as públicas |

**Segurança sem plugin:** visão pública pertence à equipe **"Visões públicas"**. Para publicar é preciso o privilégio *Atribuir*, que só o perfil novo **"Gestor de visões"** tem (Write/Delete/Assign em nível organização). Perfis comuns: Create/Write/Delete em nível usuário, Read em organização.
Risco aceito: com Read em organização, uma visão pessoal pode ser lida via API por outro usuário (contém só layout/filtros, sem dado de negócio). A UI filtra por dono.

JSON da configuração:

```json
{ "v": 1, "columns": [{ "key": "nome", "visible": true, "width": 240 }], "sort": { "key": "nome", "dir": "asc" }, "filters": {} }
```

Colunas que sumirem do código são ignoradas; colunas novas entram no fim, visíveis só se forem visíveis na padrão.

## 3. Pacote `@betinhos/ui`

- **`TableColumn`** ganha `label: string` (texto do painel e do anúncio), `required?`, `defaultHidden?`, `minWidth?`. `width` passa a aceitar px salvo pelo usuário.
- **`Table`** ganha props opcionais `columnState` + `onColumnStateChange` (ordem, visibilidade, largura) e liga arraste/resize só quando recebe o callback — telas que não usam continuam iguais.
- **`ColumnsPanel`** (novo): substitui e generaliza o `ColumnsMenu` da Geral.
- **`ViewBar`** (novo): seletor + ações + "Alterada" + diálogos (generaliza o `ViewMenu` da Geral).
- **`useTableView(tela, padrão, store)`** (novo): carrega visões, aplica, detecta alteração, salva. Puro, testável.
- **Interface `ViewStore`** (`list/create/update/rename/remove/publish`), sem dependência de Dataverse.
- Demonstração em `ComponentsPage`.

Implementações de `ViewStore` no `apps/shell`: `dataverseViewStore` (tabela nova), `geralViewStore` (adapta `savedquery`/`userquery` atuais) e `mockViewStore` (modo navegador).
Permissão de gestor: checar o perfil do usuário uma vez por sessão (`systemuserroles`) e só mostrar "Tornar pública" quando houver.

## 4. Plano de execução

| # | Etapa | Entrega / prova |
|---|---|---|
| 1 | Regras §10.9.1 no Módulo Qualidade + publish-parent | PR no tela-qualidade; `validate-design-system` passa |
| 2 | `provision-visoes.ps1` + perfil "Gestor de visões" + equipe, em DEV | DRY RUN revisado; `-Apply`; metadata e pertencimento à solução conferidos |
| 3 | `useTableView`, `ViewStore`, regras de merge do JSON | testes unitários (colunas novas/removidas, coluna obrigatória, versão) |
| 4 | `Table` com arraste/resize/teclado, `ColumnsPanel`, `ViewBar` | testes de componente + navegador (clique, arraste, teclado, foco, mobile) |
| 5 | `dataverseViewStore` + `mockViewStore` | teste com mock; depois CRUD real no DEV |
| 6 | Geral migra para `ColumnsPanel`/`ViewBar` com `geralViewStore` e deixa o `PageHeader` | comportamento atual preservado (testes existentes passam) |
| 7 | Migrar as listas (sem `PageHeader`), uma por commit: Pessoas, Despesas, Frota, OPs, Pagantes, Infrações, Pendências ×2, Funcionários | cada uma com visão padrão igual às colunas de hoje |
| 8 | `pnpm push` no checkout principal (DEV), conferência autenticada | versão publicada informada |

Fora do escopo: visões compartilhadas com pessoas específicas, exportação, filtros novos nas listas que hoje não têm filtro (o JSON já comporta para depois).

## Riscos

- Arraste em grid CSS com `role="table"` precisa de cuidado com acessibilidade — mitigado pelo caminho de teclado e pelo painel.
- Perfis de segurança: conceder em DEV só; PROD fica para quando publicar a solução.
- `pnpm tokens` quebra em worktree (copiar `design-tokens.css` à mão, se houver token novo).
