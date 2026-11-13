---
name: verificar-composicao
description: "Verifica a Composição de Preço nativa do shell (#/composicao, apps/shell/src/pages/composicao/**): grade com fórmulas, seleção, Excel, Gerar OP, visões, cache do catálogo e carga paginada. Roteiro em mock (Playwright) e no DEV autenticado. Use após mudar qualquer arquivo da pasta."
---
# Verificar Composição de Preço (página nativa)

A rota antiga `#/new_telacomposicaopreco` (iframe do WebResource) continua no menu; esta skill cobre só `#/composicao`.

## 1. Testes
- `cd apps/shell && npx tsc --noEmit -p . && npx vitest run src/pages/composicao src/app 2>&1 | grep -E "Test Files|Tests |FAIL"` (425 testes verdes em 12/11/2026; a pasta composicao tem 56 arquivos/296 testes em 13/11/2026). Node 24: `NODE_OPTIONS=--no-experimental-webstorage` se `localStorage` vier `undefined`.

## 2. Mock (sem Dataverse)
- `cd apps/shell && npx vite --port 36472 --strictPort`; abrir `http://localhost:36472/#/composicao` (viewport 1440x800). Porta ocupada pelo próprio worktree: confira o PID (`ss -ltnp | grep 36472`, cwd em `/proc/<pid>/cwd`) e encerre pelo PID.
- `typeof window.Xrm === 'undefined'` e `tbody tr[data-row-id]` = 18 linhas (rodapé "Modo local · 18 registros de demonstração").
- Editar valor: foco em `[data-grid-cell="mock-1:cr40f_valorhoramotorista"]`, **F2** (ou duplo clique; Enter só desce), digitar `=100+50`, Enter: célula mostra `R$ 150,00` (com o selo ƒx) e o foco vai para `mock-2:cr40f_valorhoramotorista`. Texto sem `=` e não numérico ("abc") mantém o editor com o ícone de erro (mensagem no `title`/`aria-label`); Esc descarta; `=1/0` não grava.
- Linha de comando = `ViewBar` do DS (`[role=toolbar][aria-label="Comandos da composição de preços"]`, componente `CompositionCommandLine`): título é o seletor de visão (`button` "Visão: Todas as composições…", menu com Padrão/Públicas/Minhas, Salvar, Salvar como…, Renomear…, Tornar pública…, Restaurar padrão, Excluir visão…), depois Colunas, Filtros, Densidade, Auditoria, busca (`searchbox` "Buscar cliente ou trajeto"), "N registros", "⋮ Mais ações" (Extrair para Excel) e Atualizar.
- Selecionar 3 linhas (`tbody input[type=checkbox]`): aparecem "3 selecionadas", **Gerar OP** e **Excluir** (sem seleção não existem; no celular vão para a barra do rodapé). "⋮" passa a "Extrair 3 para Excel"; o download `composicoes-<data>.xlsx` é um zip: `unzip -p arq.xlsx xl/worksheets/sheet1.xml | grep -o '<row r=' | wc -l` dá 7 (título, subtítulo, espaço, cabeçalho e **3 linhas de dados**). Rodapé da grade soma as 3. "Limpar seleção" (✕) desmarca. Não clique em Gerar OP/Excluir no DEV de outra pessoa.
- Seleção não cobre Densidade nem Auditoria: em 1440/1280 todos ficam na linha (só ícone); em 1024 Colunas, Densidade e Auditoria vão para o "⋮" (comportamento do DS). Medir com `getBoundingClientRect` de `.bt-selection` contra `[aria-label="Densidade das linhas"]` e `[data-vb=audit] button`.
- Densidade: Confortável = linha de 44 px, Compacta (padrão) = 38 px, Mínima = 32 px (`tbody td` altura).
- Colunas (painel do DS): desmarcar "Data" e Aplicar tira a coluna da grade e o título mostra "Alterada". Filtros abre o painel do DS (Por coluna = colunas da grade; Avançado = todos os campos do catálogo, grupos E/OU em dois níveis).
- "Salvar como…" no mock grava no `localStorage` (`tela-composicao-preco:mock-views:v1`) e a visão vira o título.
- Filtros sem equivalente no DS (ex.: "não começa com") e os filtros originais de view nativa não editável aparecem no botão "Filtros da visão (N)" (diálogo só leitura; "Remover filtros só leitura" só para os da definição).
- Console sem erro nem aviso. Layout: sem rolagem horizontal da página em 1440, 1280 e 1024 px com a sidebar aberta; o título "Composição de preços" fica em uma linha (as ações descem para a segunda linha quando não cabem). As consultas `@container` valem pela largura da página (sidebar já descontada); as `@media` pelo viewport.
- Prova automatizada usada em 12/11/2026 e 13/11/2026 (ViewBar, 1440/1280/1024/390 com e sem seleção): playwright-core do `@playwright/cli` global com `executablePath` do `chromium_headless_shell` em `%LOCALAPPDATA%\ms-playwright` (a versão esperada pelo pacote pode não estar baixada); prints em `.verificacao/`.
- Testes de grade (teclado, gravação, fórmulas) trocam a `CompositionCommandLine` por stub: o painel de colunas do DS fica montado fechado e deixa as consultas por papel ~5x mais lentas no jsdom.

## 3. DEV autenticado (só no checkout principal, com o Deploy da `develop`)
- Medir até a primeira linha: no console, `performance.getEntriesByType('resource').filter(r => r.name.includes('/api/data/'))`. Esperado: 1 consulta de página + 1 contagem, e nenhuma `EntityDefinitions` antes da primeira linha (catálogo vem do cache).
- Gerar OP com 3 selecionadas cria 1 OP (conferir `cr40f_ordemdepagamentos`, valores e composições vinculadas).
- Uma visão pessoal criada no web resource antigo aparece igual aqui (colunas, filtros, ordem e pins). Salvar, Renomear, Excluir e Tornar pública (cria a savedquery e exclui a userquery) gravam em `userquery`/`savedquery` + `new_configuracaovisualizacaocomposicao`.
- Lookup e escolha no painel de filtros: opções e nomes vêm do Dataverse (`filter-options.ts`); chip mostra o nome, não o GUID.
- Rolagem carrega 100 por vez até "Fim da lista".

## 4. Casos de borda
- Visão sem FetchXML (visão nativa): abre sem erro, filtros nativos conforme `nativeFiltersEditable`.
- Sem privilégio em tabela relacionada: o servidor devolve `0x80040220` ou 403; a página repete a consulta sem os links e avisa.
- 1.000+ linhas: rolagem fluida, contagem total certa, seleção e Excel só do que está selecionado.
- Cache do catálogo vencido: chave `localStorage` `tela-composicao-preco:catalog:v1:<url>` com 12 h; altere `savedAt` para 13 h atrás e recarregue: o catálogo é relido (aparecem consultas `EntityDefinitions`) e a chave é regravada.

## 5. Não verificável no mock
Dados reais, FetchXML e paginação do servidor, privilégios, auditoria (`audits`), Gerar OP e exclusão de verdade, visões do Dataverse, tempo até a primeira linha, cache do catálogo contra metadata real e a versão publicada.
