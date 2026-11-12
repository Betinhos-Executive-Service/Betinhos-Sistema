---
name: verificar-composicao
description: "Verifica a Composição de Preço nativa do shell (#/composicao, apps/shell/src/pages/composicao/**): grade com fórmulas, seleção, Excel, Gerar OP, visões, cache do catálogo e carga paginada. Roteiro em mock (Playwright) e no DEV autenticado. Use após mudar qualquer arquivo da pasta."
---
# Verificar Composição de Preço (página nativa)

A rota antiga `#/new_telacomposicaopreco` (iframe do WebResource) continua no menu; esta skill cobre só `#/composicao`.

## 1. Testes
- `cd apps/shell && npx tsc --noEmit -p . && npx vitest run src/pages/composicao src/app 2>&1 | grep -E "Test Files|Tests |FAIL"` (425 testes verdes em 12/11/2026). Node 24: `NODE_OPTIONS=--no-experimental-webstorage` se `localStorage` vier `undefined`.

## 2. Mock (sem Dataverse)
- `cd apps/shell && npx vite --port 36472 --strictPort`; abrir `http://localhost:36472/#/composicao` (viewport 1440x800). Porta ocupada pelo próprio worktree: confira o PID (`ss -ltnp | grep 36472`, cwd em `/proc/<pid>/cwd`) e encerre pelo PID.
- `typeof window.Xrm === 'undefined'` e `tbody tr[data-row-id]` = 18 linhas (rodapé "Modo local · 18 registros de demonstração").
- Editar valor: foco em `[data-grid-cell="mock-1:cr40f_valorhoramotorista"]`, **F2** (ou duplo clique; Enter só desce), digitar `=100+50`, Enter: célula mostra `R$ 150,00` (com o selo ƒx) e o foco vai para `mock-2:cr40f_valorhoramotorista`. Texto sem `=` e não numérico ("abc") mantém o editor com o ícone de erro (mensagem no `title`/`aria-label`); Esc descarta; `=1/0` não grava.
- Selecionar 3 linhas (`tbody input[type=checkbox]`): o botão `[data-command=export]` vira "Extrair 3 para Excel"; o download `composicoes-<data>.xlsx` é um zip: `unzip -p arq.xlsx xl/worksheets/sheet1.xml | grep -o '<row r=' | wc -l` dá 7 (título, subtítulo, espaço, cabeçalho e **3 linhas de dados**). Rodapé da grade soma as 3.
- `[data-command=op]` fica habilitado com seleção (e desabilitado sem); Excluir idem. Não clique em Gerar OP/Excluir no DEV de outra pessoa.
- Menu de visões: `[aria-label="Selecionar view"]` abre o combobox com busca; no mock só existe "Padrão".
- Console sem erro nem aviso. Layout: sem rolagem horizontal da página em 1440, 1280 e 1024 px com a sidebar aberta; o título "Composição de preços" fica em uma linha (as ações descem para a segunda linha quando não cabem). As consultas `@container` valem pela largura da página (sidebar já descontada); as `@media` pelo viewport.
- Prova automatizada usada em 12/11/2026: playwright-core com Chromium headless; prints em `.verificacao/`.

## 3. DEV autenticado (só no checkout principal, com o Deploy da `develop`)
- Medir até a primeira linha: no console, `performance.getEntriesByType('resource').filter(r => r.name.includes('/api/data/'))`. Esperado: 1 consulta de página + 1 contagem, e nenhuma `EntityDefinitions` antes da primeira linha (catálogo vem do cache).
- Gerar OP com 3 selecionadas cria 1 OP (conferir `cr40f_ordemdepagamentos`, valores e composições vinculadas).
- Uma visão pessoal criada no web resource antigo aparece igual aqui (colunas, filtros, ordem e pins).
- Rolagem carrega 100 por vez até "Fim da lista".

## 4. Casos de borda
- Visão sem FetchXML (visão nativa): abre sem erro, filtros nativos conforme `nativeFiltersEditable`.
- Sem privilégio em tabela relacionada: o servidor devolve `0x80040220` ou 403; a página repete a consulta sem os links e avisa.
- 1.000+ linhas: rolagem fluida, contagem total certa, seleção e Excel só do que está selecionado.
- Cache do catálogo vencido: chave `localStorage` `tela-composicao-preco:catalog:v1:<url>` com 12 h; altere `savedAt` para 13 h atrás e recarregue: o catálogo é relido (aparecem consultas `EntityDefinitions`) e a chave é regravada.

## 5. Não verificável no mock
Dados reais, FetchXML e paginação do servidor, privilégios, auditoria (`audits`), Gerar OP e exclusão de verdade, visões do Dataverse, tempo até a primeira linha, cache do catálogo contra metadata real e a versão publicada.
