---
name: verificar-servicos
description: "Verifica o fluxo principal do motorista no App Motoristas: Início, Serviços, detalhe, Receber (câmera e comprovante), Finalizar, Voucher, Cancelado no local, Histórico e o Voltar do celular. Use após mudar src/App.tsx, src/app/**, src/components/**, src/screens das telas de serviço ou src/styles.css, ou quando pedirem para testar o fluxo de serviço."
---
# Verificar fluxo de serviços

## Cobre
- Código: `src/App.tsx`, `src/app/**` (navegação, `backGuard.ts`, `cameraScroll.ts`), `src/components/**`, `src/data/mockData.ts`, `src/styles.css`, telas `Initial`, `Services`, `Details`, `History*`, `Receive`, `Finalize`, `Voucher`, `Signature`, `LocalCancel`, `MediaCapture`, `MaintenancePhotoPreview`.
- Rotas (hash): `#inicio`, `#servicos`, `#detalhes?serviceId=…&type=…`, `#receber`, `#foto-receber`, `#preview-foto-receber`, `#finalizar`, `#voucher`, `#assinatura`, `#cancelado-local`, `#historico`.

## Preparar ambiente
- Dev server: `node scripts/dev-server.cjs` com `PORT=31877` (configuração `app-motoristas-ux-audit` em `.claude/launch.json`; no navegador interno use `preview_start`). O servidor recompila `dist/` a cada mudança em `src/` (~15 s).
- URL: `http://localhost:31877/webresource-app-motoristas.html#inicio`. Sem `Xrm` o app entra em modo mock (`src/data/mockData.ts`); nada é gravado no Dataverse.
- Antes de começar: `localStorage.clear()` e recarregar, para não herdar serviços finalizados em testes anteriores.
- Ao terminar: `git checkout -- dist/` (o dev server reescreve `dist/` sem subir versão; `dist/` só muda no build de publicação).

## Roteiro automatizado (preferido)
`node scripts/qa/verify-ux-flows.cjs .verificacao/<data>-<branch> servicos`
Usa Chrome headless com user agent Android (ativa a câmera ao vivo) e câmera simulada por canvas (`window.__cameraMode = "deny"` simula permissão negada). Todas as linhas devem sair `OK`; prints vão para a pasta indicada.

## Roteiro manual (navegador interno, viewport mobile 375×812)
1. Início → canto inferior direito mostra `v<versão> · dd/mm/aaaa HH:mm` (`.build-stamp`, sem capturar toque).
2. Toque em "Serviços" → card "Base Betinhos -> Aeroporto de Guarulhos" → detalhe `#10240`.
   - Botões Voltar/Copiar têm 44×44; passageiros com dados (`detail.passengers`) aparecem em linhas com atalhos Ligar/WhatsApp e ficha (seção abaixo); telefone em HTML legado abre "Contato do passageiro" com Ligar e WhatsApp; Esc fecha.
   - A pílula "Mais detalhes abaixo" aparece e some após o primeiro scroll.
3. Voltar do navegador/celular (`history.back()`): detalhe → Serviços → Início, sem sair do app.
4. Detalhe → "Receber": a tela mostra "Valor a receber R$ 380,00" e a orientação de cobrança.
5. "+" com câmera negada → "Câmera indisponível" + texto em português com "Permitir" e botão "Tentar de novo"; nenhum aviso "Permission denied". Libere a câmera e toque "Tentar de novo" → preview ao vivo.
6. Tirar foto → "Confirmar" → miniatura "Ver comprovante 1". Abrir → "Apagar foto" → diálogo "Apagar foto?" com foco em Cancelar; Esc e toque fora fecham.
7. "FINALIZAR" com observação já escrita no detalhe → título "Confira sua observação", botões "Enviar sem observação" e "Confirmar".
8. `#voucher?serviceId=10241&type=SERVICO` → Horário Inicial sem atalho "Usar … (agendado)"; "Limpar formulário" fica desabilitado sem dados e, com dados, pede "Limpar o voucher?". Pedágio "12,5" vira "12,50" ao sair do campo.
9. `#finalizar?serviceId=76&type=MANUTENCAO` → sem ícone de apagar até haver foto; "VALOR (R$)" ignora letras ("1.250,9abc" → "1250,90"); com foto, o ícone "Apagar fotos" pede "Apagar 1 foto?" e mantém os textos.
10. `#cancelado-local?serviceId=10241&type=SERVICO` → "Limpar texto" desabilitado vazio; com texto pede "Apagar o texto?". "Cliquei errado" volta ao detalhe.
11. `#historico` → busca "zzz inexistente" mostra `Nenhum serviço encontrado para "zzz inexistente".`
12. Topo de Serviços (mock): "Comunicados pendentes" (2) e "Checklist do veículo" (1) como avisos compactos `button.notice-compact`, 56 px cada, superfície #fcfcfb sem sombra (não parecem card de serviço); o primeiro card de serviço começa perto de y=322 (antes y=647). Medir: `[...document.querySelectorAll('.notice-compact')].map(e=>e.getBoundingClientRect().height)`. Os avisos não têm `.agenda-card`/`.agenda-hit`: `document.querySelector(".agenda-card .agenda-hit")` em Serviços já cai no primeiro serviço. Detalhes do aviso em `verificar-comunicados` e `verificar-checklists-app`.

## Confirmação depois de finalizar (modo Dataverse, 28/10/2026)
- Depois de gravar a finalização, `finalizeSelected` recarrega a agenda (`loadRemoteStore`, 8 s por tentativa) e tenta de novo uma vez. A finalização já está salva: tempo esgotado **nunca** devolve o serviço à galeria. Depois de 2 falhas o motorista vê "O serviço foi finalizado, mas a agenda não atualizou. Não finalize de novo: feche e abra o app para conferir." e o log `confirm-agenda-after-finalize` sai com `attempts: 2, restoredToAgenda: false`.
- Antes disso o app devolvia o serviço e mandava finalizar de novo (64 casos, 18 motoristas, 07–28/10/2026), embora a OS estivesse Concluído.
- A carga busca o Geral das trocas só pelos ids de troca do motorista (`_cr40f_ot_value eq …`); teste em `tests/loadRemoteStorePerformance.test.ts`. No mock esse caminho não roda (`remoteMode` falso): conferir no DEV, finalizando um serviço e olhando que nenhum log novo `confirm-agenda-after-finalize` aparece com `restoredToAgenda: true`.
- Falha já existente no roteiro automatizado (na `main` também, 28/10/2026): "Finalizar: confirma a observação já escrita".

## Passageiros no detalhe (lista com foto e ficha, 26/10/2026)
`src/components/details/PassengerContacts.tsx` substitui a antiga faixa de avatares do topo (`PassengerAvatars`). Só aparece quando `detail.passengers` vem preenchido; senão a seção "Passageiros e Telefones de Contato" continua no HTML antigo (`DetailsField`).
- `#detalhes?serviceId=10241&type=SERVICO` (Programado no mock; apague `app-motoristas-local-v1` do localStorage se o mock salvo atrapalhar), 375×812: nenhum `.passenger-avatars`; seção com 2 `.passenger-row`: Ana Paula (foto de retrato em canvas, `naturalWidth` 320) e Roberto (inicial "R"); cada linha com bandeira SVG do idioma ao lado do nome (`aria-label` "Idioma: …"; `languageFlagCode` em `src/lib/passengerContact.ts`, SVGs em `LanguageFlag.tsx`; DEV só tem Português/Inglês/Espanhol), telefone e botões 44×44 Ligar/WhatsApp; `document.documentElement.scrollWidth - innerWidth` = 0.
- Tocar na linha abre `.passenger-sheet` (sheet de baixo): foto grande ou inicial 120 px, bandeira + nome, Telefone, botões "Ligar" e "WhatsApp". Fecha com X, Esc e toque fora.
- Regra da foto e privacidade em `src/lib/passengerPhoto.ts` (só Programado, `new_ObterFotoPassageiro`, 2 chamadas simultâneas, blob URL revogado no `dispose`). Links em `src/lib/passengerContact.ts` (WhatsApp com mensagem vindo do Dataverse tem prioridade). Testes: `tests/passengerContact.test.ts`, `tests/passengerPhoto.test.ts`.
- `cr40f_bancodedados` não tem campo de nacionalidade (metadata DEV 26/10/2026: só `cr40f_idioma`); a ficha mostra o Idioma. Foto real só no DEV com serviço Programado.

## Cobrança por QR code (Stripe, modo mock)
Spec: `docs/superpowers/specs/2026-10-21-cobranca-stripe-qr-design.md`. Em localhost o botão aparece sempre; o mock (`src/lib/qrChargeMock.ts`) paga 5 s depois de gerar (`?mockPagaEm=<s>` muda), simula recusa com `?mockRecusa=1` e guarda as cobranças no `sessionStorage` (recarregar mantém o pago para o `resumo`).
- **Roteiro automatizado (preferido):** `node scripts/qa/verify-qr-charge.cjs .verificacao/<data>-qr` com o dev server no ar (375×812, Chrome headless). Todas as linhas `OK` (35 em 22/10/2026); prints dos 5 passos, QR, confirmação, finalizar, recarregado, retomar e parcial na pasta.
- Roteiro manual equivalente:
  1. `#receber?serviceId=10240&type=SERVICO` → "Cobrar por QR code" (some no 10241, R$ 0,00). Enquanto o resumo carrega, o botão mostra "Conferindo cobranças".
  2. Passo 1 de 5 "Valor da cobrança" com `380,00` e foco no campo; 500 → "O valor não pode passar de R$ 380,00."; Enter avança.
  3. Passo 2 "Quem vai pagar": opções grandes (1º passageiro marcado); tocar numa pessoa avança; "Outra pessoa" abre o nome com foco; vazio → "Informe quem vai pagar."
  4. Passo 3 "E-mail para o recibo": teclado de e-mail; `x@mail` → "Confira o e-mail."; Voltar e avançar preserva nome e e-mail; "Pular" segue sem e-mail.
  5. Passo 4 "Idioma do passageiro": Português / English / Español, pré-selecionado pela bandeira; tocar escolhe e avança.
  6. Passo 5 revisão: valor, pagante, e-mail ou "Sem e-mail", idioma; tocar num item volta ao passo e "Confirmar/Continuar" volta direto à revisão. "Gerar QR code" → "Aguardando pagamento." e painel no idioma (ex.: "Payment for your service").
  7. Confirmação: check animado, "Pagamento confirmado", R$, "Pago por", "Horário dd/mm/aaaa HH:mm", "Recibo Enviado para …" (só com e-mail). Não avança sozinha; nenhum texto sobre "liberar o passageiro".
  8. Total → "Continuar" vai para `#finalizar` sem pedir foto. Recarregar `#receber?serviceId=10240…` → quadro com "Já pago por QR <nome> R$ 380,00", "Tudo recebido" (verde) e "Comprovante opcional", sem botão de QR.
  9. Parcial (200) → "Continuar" volta ao Recebimento: quadro "Total do serviço R$ 380,00 / Já pago por QR <nome> R$ 200,00 / Falta receber R$ 180,00" e aviso "Envie o comprovante do restante (R$ 180,00)."; FINALIZAR sem foto pede comprovante; o QR novo vem com `180,00`.
  10. Retomar: com `?mockPagaEm=9`, gerar e sair pelo Voltar do cabeçalho → "Retomar cobrança" → abre o mesmo QR e confirma.
  11. `?mockRecusa=1`: "Pagamento recusado: …" e o QR continua. Recarregar em `#cobranca-qr` volta ao Recebimento.
  12. Confiabilidade da confirmação (a tela nunca decide "pago" nem "expirou" sozinha; só o plugin/Stripe). Ganchos na query string antes do hash; para trocar a URL com hash no navegador interno use `navigate` e depois `location.reload()`:
      - `?mockExpira=3&mockPagaEm=999` (ou com `mockOffline=4`, que segura o pagamento): ao zerar a contagem o texto do `.qr-charge-help` vira "Prazo encerrando; conferindo com o Stripe." e o polling continua (não mostra "expirou" pelo relógio do celular); só 2 min após o prazo sem resposta do plugin (`EXPIRY_GRACE_MS`) a tela encerra com "O QR code expirou… Se o passageiro chegou a pagar antes do prazo, a confirmação aparece em Recebimento."
      - `?mockOffline=4`: após 3 consultas seguidas sem rede (~9 s) aparece `.qr-charge-alert.is-warning` "Sem conexão: o app não consegue conferir o pagamento desde HH:mm:ss…"; na consulta que volta, o aviso some e vira pago (`navigator.vibrate([120,80,120])` 1 vez).
      - Segundo plano: `Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); document.dispatchEvent(new Event('visibilitychange'))` → não vira pago enquanto escondido; `hidden=false` + evento → "Pagamento confirmado" em < 0,5 s (consulta imediata, sem esperar 3 s).
      - Erro de negócio do plugin na consulta (`{erro}`, ex.: pagamento em processamento no banco) aparece como mensagem (`.qr-charge-alert.is-danger`) e não conta como "sem conexão" (`QrChargeRefusal` em `src/lib/qrCharge.ts`); resposta de outra sessão é descartada; consulta pendurada por mais de 10 s conta como falha (`POLL_TIMEOUT_MS`).
      - O mock só vale em `localhost`: fora dele, sem `Xrm.WebApi`, a cobrança falha com erro, nunca simula "pago".
- Cliques por script não contam como gesto: o console mostra "Blocked call to navigator.vibrate" — esperado (o roteiro ignora); em toque real vibra.
- O navegador interno do Claude com o painel oculto pode tirar print desalinhado (layout cortado à direita) desta tela; confira pelo DOM (`getBoundingClientRect`) ou use o roteiro headless.
- Lógica pura: `tests/qrCharge.test.ts` e `tests/qrChargeSummary.test.ts` (resumo, reidratação, rota pós-pagamento, passos, horário, mock). Plugin (`QrChargePlugin`, ações `criar`/`resumo`/`consultar`/`cancelar`/`sincronizar`): `plugins/DriverRecordSharing.Tests/QrChargePluginTests.cs` (`dotnet test --filter "FullyQualifiedName~QrCharge"`). Stripe real, webhook (Flow "Flow Webhook Stripe | Cobrança QR"), `resumo` no Dataverse e Apple/Google Pay não são verificáveis no mock.

## Quadro de valores e conferência do comprovante por IA (22/10/2026)
Tela "Enviar comprovante" (`src/screens/ReceiveScreen.tsx`, lógica pura em `src/lib/receiveProofCheck.ts`).
- O total vem de `getReceivableCents(detail)` (`cr40f_valor_a_receber` do registro). No Dataverse o campo do detalhe se chama "Receber" ("Sim - R$ 180,00"), não "Valor a receber": por isso o bloco antigo, que procurava esse rótulo, nunca aparecia fora do mock.
- Estados: sem QR pago → só "Valor a receber R$ X"; parcial → quadro "Total do serviço / Já pago por QR + nome do pagante (sem horário) / Falta receber" em destaque, aviso amarelo "Envie o comprovante do restante" e foto obrigatória; quitado → "Tudo recebido" verde `#147A4B` e "Comprovante opcional" (sem asterisco).
- Conferência por IA: cada foto anexada vai para a leitura rápida dos gastos (`runQuickReadPipeline` → Flow `new_FlowURLDespesaLeituraRapida`, só o `valor` é usado). No FINALIZAR o botão mostra "CONFERINDO"; se a soma lida cobre o que falta, segue direto; valor menor, ilegível, falha ou sem internet → popup "Você recebeu os R$ X que faltavam?" com "Ainda não" (fecha, foco inicial) e "Sim, recebi tudo" (finaliza). Nunca bloqueia.
- Mock: `?mockLeitura=ok` lê R$ 51,90 (popup); `&mockLeituraValor=280` lê R$ 280 (segue direto); `?mockLeitura=ilegivel` (popup). Sem `mockLeitura` em localhost não há conferência.
- **Roteiro automatizado:** `node scripts/qa/verify-receive-summary.cjs .verificacao/<data>-comprovante` (16 linhas `OK` em 22/10/2026). Semeia o QR pago no `sessionStorage` do mock (100 ou 380 de 380), limpa `localStorage` e IndexedDB por cenário e gera prints `1-sem-pagamento`, `2-parcial`, `3-popup-valor-menor`, `5-popup-ilegivel`, `6-quitado`.
- No DEV (URL direta `/WebResources/new_app-motoristas-v2`): OS-1949 (R$ 180, R$ 100 pagos por QR) mostra o quadro parcial; OS-1948 (R$ 150, sem QR) mostra só "Valor a receber". Leitura real de foto de maquininha/dinheiro só no aparelho.

## Rolagem ao voltar da câmera (todos os formulários com foto)
- `src/app/cameraScroll.ts` (`useCameraScroll(chave)`): o `ref` vai no `.finalize-scroll` (o contêiner que rola; o `window` não rola) e `remember(ancora)` é chamado antes de abrir a câmera ou a prévia. Na volta, a posição é restaurada quando a altura estabiliza (quadro de animação com reserva por timer) e o bloco `data-scroll-anchor` da foto é trazido com o critério de `block: "nearest"`. Se o formulário aparecer por um instante e sair antes de terminar, a posição volta para a memória; mesmo assim, a câmera deve ficar na tela até a foto estar pronta para a prévia (o checklist só fecha a câmera depois de reduzir a foto), senão a restauração pode terminar no formulário relâmpago e a posição se perde. Chaves: `gastos`, `colisoes`, `solicitarManutencao`, `receber:<id>`, `finalizar:<id>`, `checklist:<id>`. A restauração (`restoreScroll`) e a ligação ao formulário (`createCameraScroll`) aceitam contêiner e quadros falsos e têm teste próprio. Testes puros em `tests/cameraScroll.test.ts`.
- Roteiro: `node scripts/qa/verify-camera-scroll.cjs .verificacao/camera-scroll depois` com o dev server no ar (`APP_MOTORISTAS_URL`, padrão `http://127.0.0.1:45127`). A foto de teste é 4000×3000 (cerca de 2,3 MB, `FOTO=LxA` muda), para a redução levar tempo de verdade. Mede, em 375×812, checklist, gastos, solicitar manutenção (4 fotos antes para rolar), colisões, receber (9 fotos antes) e finalizar manutenção: `antesDaCamera` e `depoisDaCamera` iguais (ou poucos px a mais para mostrar a miniatura nova) e "miniatura visível". Antes da correção todos voltavam a 0.
- No navegador interno, as trocas de tela (câmera, prévia) só avançam com o painel em foco: intercale `computer screenshot`/`wait` entre os passos (`browser_batch`) e use o input nativo (`input[type=file][accept="image/*"]` + `DataTransfer` com `new File`, que tem data atual; arquivo antigo é recusado com "Arquivos antigos da galeria não são aceitos").

## Casos de borda
- Fila: finalizar fora de ordem mostra "Conclua os itens anteriores da fila antes de prosseguir." (modo remoto).
- Câmera negada, ocupada (NotReadableError) e ausente têm mensagens próprias (`src/lib/cameraErrors.ts`, coberto por `tests/cameraErrors.test.ts`).
- Durante envio (`submitState` ≠ idle) os botões Voltar e Limpar ficam desabilitados e o Voltar do celular não navega.

## Evidência obrigatória
- Prints de detalhe, câmera negada, finalizar, voucher e manutenção (gerados pelo roteiro) e `resultado.txt` com todas as linhas `OK`.
- Console sem erros/avisos e rede sem 4xx/5xx (o 404 de `/favicon.ico` do servidor local é ruído conhecido).

## Limites
- Gravação real no Dataverse/Flow, upload ao SharePoint e envio de voucher só em DEV autenticado (`npm run push`), nunca em PROD.
- O Voltar físico do Android dentro do Power Apps precisa ser conferido no aparelho; o headless só prova o comportamento do histórico do navegador.
- Abrir discador/WhatsApp (`tel:`/`wa.me`) não é exercitado; o roteiro para no diálogo de escolha.

## Foto do passageiro no detalhe (26/10/2026)
- Código: `src/lib/passengerPhoto.ts`, `src/components/details/PassengerAvatars.tsx`; teste `tests/passengerPhoto.test.ts`.
- A foto só é pedida com o serviço Programado (`cr40f_status` 202410005), pela Custom API `new_ObterFotoPassageiro` (`executeCustomApi`, `{new_ReservaId, new_PassageiroId}` → `new_FotoJson`). Se a API negar, falhar ou devolver JSON inválido, aparece só a inicial, sem mensagem de erro. A imagem fica em memória como blob URL, revogada ao sair da tela; são no máximo 2 chamadas simultâneas.
- Mock (375 px): o serviço 10241 mostra a foto da Ana e o "R" do Roberto; tocar no avatar amplia a foto, e X, Esc ou toque fora fecham. Se a agenda mock antiga aparecer, apague `app-motoristas-local-v1` do localStorage.
- DEV: entre como o motorista de um serviço Programado com passageiro com foto e veja a foto. Mude o status para Em Execução e reabra: só a inicial.

## Resumo da Observação final (ícones por tópico)
- Prévia `/?dev=preview` em 390×844: clique `Finalizar Serviço` (lista), digite no textarea, `Gerar resumo`. No modo mock cada frase vira um tópico; confira que todo `li` em `.observation-review-topics` tem `svg path` (a classe `is-<tipo>` vem de `topicKind`, que nunca devolve nulo; sem palavra-chave = `is-outros`). Teste unitário: `tests/observacaoOrganizada.test.ts`.
