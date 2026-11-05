---
name: verificar-gastos
description: "Verifica a tela Registrar gasto: validação, carregamento do envio (salvando, foto X de N, enviado), lista Envios pendentes e o diário de envio assíncrono do DEV. Use após mudar src/screens/ExpenseScreen.tsx, src/components/common/ExpenseSendOverlay.tsx, src/lib/expense*.ts ou o envio de gasto em src/App.tsx, ou quando pedirem para testar gastos."
---
# Verificar gastos

## Cobre
- Código: `src/screens/ExpenseScreen.tsx`, `src/components/common/ExpenseSendOverlay.tsx` (só monta as etapas do gasto), `src/components/common/SendStepsOverlay.tsx` (carregamento genérico em etapas, também usado pelo checklist), `src/lib/expenseSubmission.ts`, `src/lib/expenseUploadState.ts`, `src/lib/expenses*.ts`, trecho de gastos em `src/App.tsx` (`submitExpenseAsync`, `runExpenseSubmission`, worker de segundo plano, `handleExpenseUploadAction`), estilos `.expense-uploads*` e `.expense-send-*` em `src/styles.css`.
- Testes: `tests/expenseUpload.test.ts`, `tests/expenses.test.ts`.
- Fluxo esperado no DEV: tocar em REGISTRAR → carregamento bloqueante só até as fotos serem aceitas (HTTP 202 do Flow) → "Gasto enviado" → Início. O processamento no OneDrive segue em segundo plano sem mensagem; só problemas aparecem (toast e "Envios pendentes").
- PROD usa o envio síncrono antigo (`usesAsyncExpenseUpload()` só é verdadeiro na URL do DEV).

## Preparar ambiente
- `npm test` e `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`.
- Dev server: `PORT=<porta livre> node scripts/dev-server.cjs` (ou `npm run dev`). Ele recompila `dist/` a cada mudança em `src/`; restaure `dist/` com `git checkout -- dist` antes do commit se não for publicar.
- Prévia local sem Dataverse: `http://127.0.0.1:<porta>/?dev=preview` (catálogo), card "Gastos" na seção OPERACAO.

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
7. Mudou `SendStepsOverlay` ou `ExpenseSendOverlay`? Prove que o gasto continua idêntico: compare o HTML do overlay antigo (`git show <base>:src/components/common/ExpenseSendOverlay.tsx`, salvo em `.verificacao/`) com o novo em todos os estados (`saving`/`uploading`/`done`/`error`, 0, 1 e N fotos) com `react-dom/server` `renderToStaticMarkup`, empacotando com `npx esbuild <entrada>.tsx --bundle --platform=node --jsx=automatic --loader:.svg=dataurl`. Esperado: 0 diferenças. Em 21/10/2026: 9 estados, 0 diferenças; sequência do passo 5 igual antes e depois.

## Gastos do cartão (despesas criadas pelo flow)
- Código: `src/lib/gastosCartao.ts` (filtro, mock, payload, duplicidade), `GastosCartaoScreen`, `GastoCartaoDuplicadoDialog` e `ExpenseScreen` com a prop `cartaoGasto`. Testes: `tests/gastosCartao.test.ts`.
- Pendente = `cr40f_origem` 100000002, `cr40f_statusoperacional` 100000001 (Precisa corrigir), `cr40f_conciliadacartao` true, do motorista logado. Completar é PATCH na despesa existente (nunca cria) e leva o status para 100000000; valor, data, forma e estabelecimento ficam somente leitura. No caminho assíncrono (DEV) o diário leva `existing: true` e `ensureExpenseSubmissionRemote` faz PATCH com `If-Match: *`.
- Na prévia (localhost) há 3 gastos de exemplo (`?mockGastosCartao=vazio|erro` para os outros estados). Passos: Início mostra a linha "Gastos do cartão · N para completar" (some com 0) → abrir a lista → abrir um item → ENVIAR sem descrição ou comprovante mostra erro. Atalhos: `?despesaId=<guid>` abre o gasto (id que não é pendente cai na lista) e `?gastosCartao=1` abre a lista. Dispense o tour ("Pular") antes de clicar.
- Entrada: o tile Gastos do Início abre o Relatório de gastos (`gastosRelatorio`), nunca a câmera nem a lista direto. Rodapé sempre com "Anexar despesa" (primário); com pendentes do cartão aparece "Completar (N)" à esquerda (secundário), que abre a lista `gastosCartao` (sem CTA de anexar). Voltar: lista → relatório; câmera sem captura → relatório; formulário → relatório (ou lista, se for gasto do cartão); relatório → Início. `concluirGastoCartao` sem pendentes leva ao relatório.
- Relatório: `src/lib/gastosRelatorio.ts`, `src/screens/GastosRelatorioScreen.tsx`, `src/components/gastos/GastosCharts.tsx`, `tests/gastosRelatorio.test.ts`. Lê `cr40f_despesaoperacional` do motorista (statecode 0, sem Cancelado) numa janela de 6 meses; trocar o chip (Mês atual, Mês anterior, 3 meses) recalcula local. Mock em localhost: `?mockGastosRelatorio=vazio|erro` e `?mockGastosCartao=vazio` (rodapé de 1 botão).
- Ordem da tela (05/11/2026): período; alerta de pendências (`.gr-alerta`, botão único só com Precisa corrigir ou Recusado: "N gastos precisam da sua atenção", "X para corrigir · Y recusados" e "Ver"; o toque seleciona Pendentes e rola até `.gr-despesas`; os gastos do cartão para completar ficam só no botão "Completar" da barra); "Suas médias": Preço por litro e Refeição média lado a lado (`.gr-kpi`, 2 colunas também a 390 px), sem gráfico, com semáforo em `data-semaforo` (verde/amarelo/vermelho) contra `METAS_GASTOS` (R$ 6,10/L com faixa amarela de 2%; R$ 42 por refeição com 5%; fixas no código até a tela do gestor no Sistema Betinhos gravar no Dataverse), texto "Meta ..." e a variação contra o período anterior em texto; sem dado ficam neutros com "Sem dados"; "Outras médias" (só café e lanche; consumo km/L, lavagem, estacionamento e pedágio saíram); "Médias por mês" (abas R$/L e Refeição, Chart.js 4.4.1 + datalabels 2.2.0, confira o `aria-label` do canvas); "Despesas" (`.gr-despesas`) com seletor Pendentes (n) / Todas (n): Pendentes = Precisa corrigir + Recusado (`ehPendente`), Todas = todas do período da mais recente para a mais antiga; sem pendência mostra "Nenhuma pendência neste período." com "Ver todas". O filtro e a aba do gráfico sobrevivem à troca de período. Gasto do cartão ainda para completar (id em `gastosCartaoPendentes`) aparece com selo "Completar" e o toque abre direto o formulário de completar (`abrirGastoCartao`); no mock os ids do relatório e do cartão não coincidem, então esse caminho só aparece com dados reais. Os outros abrem `DespesaDetalheDialog` (`.gr-detalhe`, painel de quase tela cheia, só leitura): comprovante(s) baixados pelo "Flow - Consultar Arquivo OneDrive" (variável `new_URLFlowConsultarArquivoOneDrive`, corpo `{id, nomeArquivo, origem?}` ou `{link, nomeArquivo}`, resposta `conteudoBase64`), mostrados como imagem (toque abre em tela cheia) ou link "Abrir arquivo" para PDF, e os dados com nomes dos lookups (forma de pagamento, cidade, veículo, serviço, descrição, status financeiro, origem, enviado em). Fecha no X, Esc e toque fora. No mock o comprovante é um SVG; `?mockComprovante=erro` simula a falha com "Tentar de novo". Não há mais rosca de status, sparkline, "Para você" nem "Últimas despesas". Alvos do tour: `.gr-destaques`, `.gr-alerta`, `.gr-evolucao` e `.gr-despesas`. No mock (`?` local, Mês atual) espera-se litro amarelo (R$ 6,13), refeição vermelha (R$ 44,40), Pendentes (3) e Todas (13); Mês anterior tem Pendentes (0).
- Verificar: chips recalculam as médias e o destaque do gráfico mensal (a aba escolhida se mantém); 0 a 4 insights (correção fica no alerta); variação só com base anterior; atalho "Ver pendentes do cartão"; rodapé com 1 e 2 botões; vazio com CTA; erro com "Tentar de novo"; 360px sem rolagem horizontal; console sem erros. A prévia real fica na raiz (`http://127.0.0.1:<porta>/`), não em `?dev=preview` (que é só o catálogo de componentes); dispense o tour ("Pular") a cada capítulo novo.
- km/L é estimativa (tanque cheio, trechos entre abastecimentos consecutivos por veículo, mínimo 2 trechos, faixa 3 a 30 km/L); sem veículo ou KM crescente, omite.
- Aviso de duplicidade: novo gasto com a mesma forma de pagamento do pendente (Cartão de crédito), mesmo valor (±R$ 0,05) e data informada de 1 dia antes a 2 dias depois da compra (mesma janela do flow) abre o diálogo "Completar este" / "Lançar mesmo assim"; Esc e toque fora só fecham.
- Não verificável fora do DEV: PATCH real, anexo e a leitura do motorista no Dataverse.

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
