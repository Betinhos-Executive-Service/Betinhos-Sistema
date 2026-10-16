# Listas com visões, colunas e filtros do Design System — plano

Data: 15/10/2026 · Branch: `claude/geral-visoes-filtros` · Base: `@betinhos/ui` 1.9.0 (DS §10.9.1 e §10.9.2)

## Objetivo

Toda lista de registros usa a anatomia do DS: seletor de visão como título (sem `PageHeader`), "Colunas", "Filtros", "Filtro rápido", busca e ação primária na mesma linha, chips de filtros ativos e a tabela com linha de filtro rápido. Começa pela Geral.

## Geral (fase A)

A Geral já tem visões (savedquery/userquery), colunas (ordem, ocultar, largura em localStorage), ordenação, filtros por coluna (E), busca e estado na URL, com componentes próprios. A grade (`GeralTable`) tem edição na célula, seleção e cards no mobile: **continua**, porque a `Table` do pacote não edita.

Decisões:

1. **Adaptador de visão.** `useGeralViewState` monta um `TableViewState` a partir do `useGeral` + preferências de coluna: visões do sistema → grupo "Públicas" (só leitura, ninguém publica por aqui), userqueries → "Minhas"; salvar/renomear/excluir chamam o que já existe. Com isso a Geral usa a `ViewBar` do pacote sem trocar o armazenamento.
2. **Filtros.** O `FilterSet` (um filtro por atributo, E) vira `TableFilters` do pacote: os por coluna vão para `quick`, e o avançado (grupos E/OU) passa a existir. A consulta usa `filtersToFetchXml` injetado no `<entity>` (no lugar do `injectFilters`); salvar visão grava os dois no FetchXML. A URL (`f=`) passa a codificar `TableFilters`, lendo também o formato antigo.
3. **Colunas.** `ColumnsMenu` sai; entra o `ColumnsPanel` da `ViewBar`. Largura e reordenação no cabeçalho continuam as da `GeralTable` (já seguem o DS). Chave `betinhos.geral.colunas.v1` preservada.
4. **Filtro rápido.** A `GeralTable` ganha a linha sob o cabeçalho usando `QuickFilterCell` do pacote, alinhada pelo `--gr-columns`. O menu ▾ da coluna mantém ordenar e ocultar; "Filtrar por…" foca a célula da linha rápida (ou abre o painel, se a linha estiver escondida).
5. **Cabeçalho.** Sai o `PageLayout`/`PageHeader`; "Atualizar", "Tabela/Cards", busca e comandos vão como filhos da `ViewBar`. O cabeçalho do celular (`useShellHeader`) continua com o título "Geral".
6. **Testes.** `GeralPage.test.tsx` é reescrito nas partes de visão, colunas e filtros para os textos do pacote ("Colunas", "Filtros", chips, menu de visão). Testes de domínio continuam.

Entregas: um commit por passo (adaptador → filtros/URL → colunas → linha rápida → cabeçalho → testes), PR único da Geral, verificação no navegador e `pnpm push` só depois do merge, da `main`, no checkout principal.

## Demais listas (fase B, depois da Geral)

Pessoas, Despesas, Frota (Veículos, Registros), OPs, Pagantes, Infrações, Pendências (Financeiro e Documentos) e Funcionários já usam a `Table` do pacote. Para cada uma:

- `dataverseViewStore` (tabela `cr40f_visaodetabela`, já provisionada no DEV) + `useTableView` + `useTableFilters`;
- a consulta recebe o `<filter>` gerado (ou OData equivalente, se a lista não usa FetchXML: conferir caso a caso);
- uma lista por commit; visão padrão igual às colunas de hoje.

## Riscos

- `GeralPage.test.tsx` é grande e lento (os testes de visão levam 25–44 s): rodar isolado durante a migração.
- Visões do sistema (savedquery) continuam só leitura: "Tornar pública" não aparece na Geral.
- Filtros avançados gravados numa userquery ficam no FetchXML: o model-driven também os enxerga.
