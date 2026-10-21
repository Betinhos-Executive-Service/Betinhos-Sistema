---
name: verificar-checklists-app
description: "Verifica a tela do checklist de vistoria no App Motoristas: tile do Início, destaque em Serviços, formulário com fotos/KM/texto/OK-Não OK, rascunho no aparelho, envio e checklist enviado. Use após mudar src/lib/checklists.ts, src/screens/ChecklistsScreen.tsx, src/components/checklists/**, src/checklists.css ou a ligação em App.tsx/InitialScreen/ServicesScreen."
---
# Verificar checklist no App Motoristas

## Cobre
- Código: `src/lib/checklists.ts`, `src/lib/checklistSend.ts` (etapas do carregamento), `src/components/common/SendStepsOverlay.tsx`, `src/app/cameraScroll.ts`, `src/screens/ChecklistsScreen.tsx`, `src/components/checklists/ChecklistAgendaCard.tsx`, `src/components/checklists/ChecklistOkNokField.tsx`, `src/checklists.css`, `uploadChecklistPhotoRemote` em `src/lib/dataverse.ts`, ligação em `src/App.tsx`, `src/screens/InitialScreen.tsx`, `src/screens/ServicesScreen.tsx`, `src/app/navigation.ts`, `src/app/bootstrap.ts` (`getInitialChecklistId`).
- Testes: `tests/checklistSend.test.ts`, `tests/cameraScroll.test.ts`, `tests/checklists.test.ts` (inclui `mapChecklist` com `new_entreguepor`/`new_trocadetectadaem` e `checklistCardTexto`).
- Rotas: `#inicio` (tile Checklist), `#servicos` (seção "Checklist do veículo"), `#checklists`.

## Preparar ambiente
- Worktree sem `node_modules`: crie uma junção para o `node_modules` do checkout principal (mesmas dependências) — `New-Item -ItemType Junction -Path node_modules -Target "<checkout principal>\node_modules"`.
- Gates: `npm test` e `node node_modules/typescript/bin/tsc --noEmit --noUnusedLocals --noUnusedParameters`.
- Servidor: `.claude/launch.json` (local, ignorado) com `node scripts/dev-server.cjs` e `PORT=44961` (reservada em `C:\Users\mendo\.codex\dev-ports.json`). `preview_start` → `http://localhost:44961`. Em localhost o checklist roda em mock: 1 pendente de troca (origem Troca, entregue por Carlos Andrade; ABC1D23, KM 45210; 9 itens, o último é "Pneus", OK / Não OK com Murcho, Careca, Furado, Outro) e 1 enviado. O mock é em memória: recarregar volta ao pendente; o rascunho fica no IndexedDB (`app-motoristas-media-drafts`, chave `checklist:<id>`).
- O dev server reescreve `dist/`; ao terminar, `git checkout -- dist/index.html dist/webresource-app-motoristas.html` (não commitar build local).
- No DEV autenticado, o modelo padrão é o "Vistoria rápida" do seed (`seed-checklist-modelo-teste.ps1 -SubstituirPadrao`, área `verificar-checklists-backend`): 14 itens, 4 fotos, 9 OK / Não OK com opções próprias (Pneus: Murcho, Careca, Furado, Outro; Estepe: Faltando, Estepe murcho, Outro...) e Observações. A "Quilometragem" e o "Combustível" numéricos só existem no mock local.
- Viewport: preset `mobile` (375×812); volte a `desktop` no fim.

## Roteiro
1. Início → tile "Checklist" mostra "Vistoria do veículo • 1 pendente".
2. Serviços → seção "Checklist do veículo" com card "RECEBIMENTO DO CARRO · Veículo ABC1D23 · entregue por Carlos Andrade" (a descrição quebra em 2 linhas a 375 px, sem corte nem rolagem horizontal; sem entregador, mostre "entregue por: não identificado": troque temporariamente `entreguePorNome` do pendente do mock para "" e reverta; quinzenal/manual: "VISTORIA QUINZENAL"/"SOLICITADO PELA OPERAÇÃO", cobertos por `checklistCardTexto` em teste); tocar abre o formulário; a seta Voltar retorna a Serviços.
3. Formulário: resumo "1 de 9 itens preenchidos · progresso salvo neste aparelho"; Quilometragem já vem 45210.
4. Fotos: a câmera ao vivo é bloqueada no painel. Use o input nativo do `MediaCaptureScreen`: após tocar em `button[aria-label="Tirar foto: <item>"]`, preencha `input[type=file]` via `DataTransfer` com um JPEG gerado em canvas e dispare `change`. Prévia "A foto está legível?" → Confirmar. A miniatura deve ter no máximo 1600 px no maior lado.
5. "Enviar checklist" incompleto → "Revise N itens destacados.", rola até o primeiro e mostra "Tire a foto para continuar.".
6. Recarregue a página, volte pelo tile e reabra: fotos e valores continuam.
7. Digite "45.218" no KM, "meio tanque" em Combustível e uma observação com acentos; enviar → só Combustível fica inválido com "Informe só números. Ex.: 75.".
8. Corrija para 75 e envie → abre o carregamento em etapas (mesmo padrão do gasto, `SendStepsOverlay`): "Enviando checklist", etapa "Enviando foto N de M" (M conta todas as fotos; numa nova tentativa começa nas já enviadas) e "Registrar checklist" pendente, barra `scaleX((1+enviadas)/(M+2))`; depois "Registrando checklist", "Checklist enviado / Obrigado pela vistoria." por ~1,1 s (a lista atualiza em paralelo) e volta para a lista com "Checklist enviado. Obrigado pela vistoria." e "Para fazer 0". O leitor de tela ouve a etapa pelo `liveText` do `SendStepsOverlay` (`span.expense-send-sr[aria-live]`). Durante o carregamento o `section.main-panel` do formulário fica `inert` e o Voltar do celular não navega (o diálogo recebe Esc e ignora, igual ao gasto). Roteiro automatizado: `node scripts/qa/verify-checklist-send.cjs .verificacao/checklist-send sucesso` (e `REDUCED=1` para `prefers-reduced-motion`: sem animação de entrada, barra sem transição).
9. Abra o enviado → 45.218 km, 75 %, observação e "Ver foto 1" em cada item de foto. O IndexedDB não tem mais `checklist:<id>`. No Início o selo "pendente" sumiu.
10. OK / Não OK (item "Pneus", fim do formulário):
    - Tocar "Não OK" abre "Qual o problema?", chips, "Tirar foto" e "Observação (opcional)". Enviar sem foto → "Tire a foto do problema." sob o item (o `section` ganha `aria-describedby` para o erro).
    - Foto: `button[aria-label="Tirar foto do problema: Pneus"]` + o mesmo input nativo do passo 4. Com foto e sem chip → "Escolha o problema.". Escolher chip limpa o erro.
    - Com foto, chip ou observação, tocar "OK" abre "Marcar como OK?" com foco em "Continuar editando". Esc e toque fora fecham sem perder nada; "Marcar OK" zera fotos, chips e observação. Sem dado registrado, OK troca direto.
    - Recarregar mantém Não OK + chips (rascunho no IndexedDB).
    - Enviar completo → "Enviando foto N de 6" (5 fotos puras + a do Não OK: a fila usa `checklistPhotoItems`).
    - Enviado: Pneus é o primeiro bloco, borda rosada, selo "Não OK", problemas separados por " · ", observação e "Ver foto 1". No enviado antigo do mock, Pneus mostra "OK" em texto neutro, na ordem do modelo.
    - Mais de 10 problemas: marcar o 11º chip é recusado (`toggleChecklistProblema`): o chip fica sem marcar e "Escolha até 10 problemas." aparece sob o item na hora; desmarcar libera e o aviso some. O mock tem só 4 opções: para provar no navegador, aumente temporariamente `opcoesProblema` de "Pneus" em `mockItens` (src/lib/checklists.ts) para 12 e reverta depois.
    - Contador "N de M itens": Não OK só conta com foto e problema; Não OK sozinho (ou só com chips, sem foto) não sobe o "1 de 9". OK conta.
    - O servidor local responde em `http://127.0.0.1:<porta>` (em `localhost` o painel pode cair em outro servidor via IPv6 e mostrar "not found"). Worktree novo: o primeiro build do dev server leva alguns segundos.
11. axe-core (cdnjs 4.10.2) no formulário e na lista → 0 Critical/Serious (o `page-has-heading-one` moderado é padrão do app inteiro).
12. Erro forçado no mock: `?mockChecklistFalha=foto` derruba um envio de foto sim, outro não (prova a retomada); `?mockChecklistFalha=registro` derruba o registro final (`mockChecklistFailure` em `src/lib/checklists.ts`). Esperado: "Checklist não enviado" com a causa + "Seu progresso e as fotos já enviadas continuam salvos neste aparelho.", foco em "Tentar de novo"; "Tentar de novo" continua da foto que falhou; "Voltar e revisar" fecha e devolve o formulário editável com as miniaturas; recarregar e enviar sem o parâmetro pula as fotos já enviadas ("9 fotos enviadas" direto). `node scripts/qa/verify-checklist-send.cjs .verificacao/checklist-send foto` e `... registro`.
13. Rolagem ao voltar da câmera: role até o meio, "Tirar foto: Lateral esquerda", confirme → o formulário volta na mesma posição com a miniatura nova visível; abrir uma foto existente e voltar também preserva. Detalhes em `verificar-servicos` ("Rolagem ao voltar da câmera").

## Casos de borda
- JSON de itens/respostas inválido vira lista vazia (teste).
- Motorista sem id não consulta o Dataverse (teste).
- Erro da Custom API mostra a mensagem do plugin e mantém o rascunho; fotos já enviadas não são reenviadas (links guardados em `enviadas`).

## Evidência obrigatória
- Saída de `npm test` e do `tsc`, screenshots do formulário, do envio e do enviado, leitura do console (só o 404 do `favicon.ico` do servidor local é esperado).

## Limites
- No painel do navegador, clique por coordenada às vezes não chega ao `.agenda-hit` dos cards; use `find`/`read_page` (ref) ou `document.querySelector(".agenda-hit").click()`. Screenshots podem expirar com o painel oculto: repita.
- Câmera ao vivo, upload ao OneDrive e Custom API real só no DEV autenticado (celular); o roteiro local cobre o mock.
