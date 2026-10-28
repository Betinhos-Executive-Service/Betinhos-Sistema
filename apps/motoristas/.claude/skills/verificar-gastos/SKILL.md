---
name: verificar-gastos
description: "Verifica a tela Registrar gasto: validação, carregamento do envio (salvando, foto X de N, enviado), lista Envios pendentes e o diário de envio assíncrono do DEV. Use após mudar src/features/despesas/ExpenseScreen.tsx, src/features/despesas/ExpenseSendOverlay.tsx, src/features/despesas/expense*.ts ou o envio de gasto em src/App.tsx, ou quando pedirem para testar gastos."
---
# Verificar gastos

## Cobre
- Código: `src/features/despesas/ExpenseScreen.tsx`, `src/features/despesas/ExpenseSendOverlay.tsx` (só monta as etapas do gasto), `src/components/common/SendStepsOverlay.tsx` (carregamento genérico em etapas, também usado pelo checklist), `src/features/despesas/expenseSubmission.ts`, `src/features/despesas/expenseUploadState.ts`, `src/features/despesas/expenses*.ts`, trecho de gastos em `src/App.tsx` (`submitExpenseAsync`, `runExpenseSubmission`, worker de segundo plano, `handleExpenseUploadAction`), estilos `.expense-uploads*` e `.expense-send-*` em `src/styles.css`.
- Testes: `tests/expenseUpload.test.ts`, `tests/expenses.test.ts`.
- Fluxo esperado no DEV: tocar em REGISTRAR → carregamento bloqueante só até as fotos serem aceitas (HTTP 202 do Flow) → "Gasto enviado" → Início. O processamento no OneDrive segue em segundo plano sem mensagem; só problemas aparecem (toast e "Envios pendentes").
- PROD usa o envio síncrono antigo (`usesAsyncExpenseUpload()` só é verdadeiro na URL do DEV).

## Preparar ambiente
- `npm test` e `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`.
- Dev server: `PORT=<porta livre> node scripts/dev-server.cjs` (ou `npm run dev`). Ele recompila `dist/` a cada mudança em `src/`; restaure `dist/` com `git checkout -- dist` antes do commit se não for publicar.
- Prévia local sem Dataverse: `http://127.0.0.1:<porta>/?dev=preview`, card "Gastos" na seção OPERACAO.

## Roteiro
1. `npm test` → `ℹ fail 0`; os testes de `expenseUpload.test.ts` cobrem diário, nova tentativa, status (`describeExpenseSubmission`) e progresso (`{ phase: "creating" }`, `{ phase: "uploading", order, total }`).
2. `npx tsc ...` → sem saída.
3. Navegador interno em `?dev=preview` → clique no card "Gastos" → a tela "Registrar gasto" abre com a seção "ENVIOS PENDENTES" contendo:
   - "Abastecimento · R$ 245,90 · 19/10" / "Aguardando conexão para enviar." / botão "Enviar agora";
   - "Almoço · R$ 58,00 · 19/10" / "Comprovante não foi anexado." / botão "Tentar de novo".
4. Clique "Tentar de novo" → toast inline "Nova tentativa de comprovante mockada.".
5. Registre a sequência do `.expense-send-card` e clique "REGISTRAR" (rascunho de demonstração já válido, 2 fotos) com o script abaixo; depois leia `window.__seen`. Sequência esperada:
   - `is-saving | Enviando gasto | is-active:Salvando dados do gasto / is-pending:Enviar 2 fotos do comprovante`
   - `is-uploading | Enviando gasto | is-done:Dados do gasto salvos / is-active:Enviando foto 1 de 2`
   - `is-uploading | Enviando gasto | is-done:Dados do gasto salvos / is-active:Enviando foto 2 de 2`
   - `is-done | Gasto enviado | is-done:Dados do gasto salvos / is-done:2 fotos enviadas`
   - `sem overlay`
6. Screenshot em 390×844 (`resize_window` width 390, height 844) da lista de pendentes e do overlay.

Script (javascript_tool, já na prévia de Gastos). Não use laço com `setTimeout`/`await`: com o painel oculto os timers ficam lentos e o script estoura 45 s. O MutationObserver grava cada estado:
```js
window.__seen = [];
const snap = () => {
  const c = document.querySelector('.expense-send-card');
  const s = c ? c.className.replace('expense-send-card ', '') + ' | ' + c.querySelector('h2').textContent + ' | ' + [...c.querySelectorAll('.expense-send-step')].map(x => x.className.split(' ')[1] + ':' + x.textContent.replace(/(concluído|em andamento|aguardando)$/, '')).join(' / ') : 'sem overlay';
  if (window.__seen.at(-1) !== s) window.__seen.push(s);
};
new MutationObserver(snap).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'REGISTRAR').click();
```
Depois de uns 5 s: `window.__seen`.

Observação: `scroll_to` dentro da prévia rola o palco na horizontal e corta a borda esquerda do print; é da moldura da prévia, não da tela.
7. Mudou `SendStepsOverlay` ou `ExpenseSendOverlay`? Prove que o gasto continua idêntico: compare o HTML do overlay antigo (`git show <base>:src/features/despesas/ExpenseSendOverlay.tsx`, salvo em `.verificacao/`) com o novo em todos os estados (`saving`/`uploading`/`done`/`error`, 0, 1 e N fotos) com `react-dom/server` `renderToStaticMarkup`, empacotando com `npx esbuild <entrada>.tsx --bundle --platform=node --jsx=automatic --loader:.svg=dataurl`. Esperado: 0 diferenças. Em 21/10/2026: 9 estados, 0 diferenças; sequência do passo 5 igual antes e depois.

## Casos de borda
- O texto da etapa pendente (`.expense-send-step.is-pending`, `#94a3b8` sobre `#fcfcfb`) é apontado pelo axe como `color-contrast` serious enquanto aparece (só na fase `saving` do gasto). É o visual aprovado; mudar exige decisão do Renan porque altera o gasto.
- Sem conexão no envio: `runExpenseSubmission` retorna `false` → overlay `is-error` "Sem conexão agora" com botão "Entendi" (volta ao Início); o gasto fica no diário e o worker tenta de novo a cada 30 s e no evento `online`. Coberto por código; na prévia não há simulação de erro.
- Falha confirmada do Flow: o worker refaz até 2 vezes sozinho; depois disso aparece um toast e o item "Tentar de novo" em Envios pendentes.
- Comprovante não confirmado pelo servidor (linha ainda pendente): depois de 120 s o worker encerra a tentativa (`cancelUnclaimed`) e ela vira falha confirmada.
- Itens em processamento normal não aparecem na lista (filtro em `expenseUploadStatuses`).
- Diário antigo com um único envio: `normalizeStoredExpenseSubmissions` converte em lista (teste "fila restaura envio único legado e lista nova").
- Animações: o painel do navegador interno pode pausar animações quando está oculto; se o card aparecer translúcido no print, confira `document.getAnimations()` (currentTime 0 = timeline pausado, não é bug).

## Evidência obrigatória
- Saída de `npm test` e `tsc`.
- Sequência do script do passo 5 e screenshot 390×844 com o overlay e com Envios pendentes.
- Console sem erros (`read_console_messages` com `onlyErrors`).

## Limites
- O envio real (Dataverse, Custom API `new_ExpenseUploadTransition`, Flow assíncrono com 202) só existe no DEV e exige o app publicado no model-driven com login. PROD é somente leitura e usa o caminho síncrono.
- Teste autenticado no DEV: registrar um gasto de teste com 1 foto, conferir o carregamento, a volta ao Início e, no Dataverse DEV, a despesa e o anexo com status Enviado; cancelar o registro de QA depois.
