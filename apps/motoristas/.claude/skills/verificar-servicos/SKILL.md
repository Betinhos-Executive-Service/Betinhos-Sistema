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
   - Botões Voltar/Copiar têm 44×44; telefone do passageiro abre "Contato do passageiro" com Ligar e WhatsApp; Esc fecha.
   - A pílula "Mais detalhes abaixo" aparece e some após o primeiro scroll.
3. Voltar do navegador/celular (`history.back()`): detalhe → Serviços → Início, sem sair do app.
4. Detalhe → "Receber": a tela mostra "Valor a receber R$ 380,00" e a orientação de cobrança.
5. "+" com câmera negada → "Câmera indisponível" + texto em português com "Permitir" e botão "Tentar de novo"; nenhum aviso "Permission denied". Libere a câmera e toque "Tentar de novo" → preview ao vivo.
6. Tirar foto → "Confirmar" → miniatura "Ver comprovante 1". Abrir → "Apagar foto" → diálogo "Apagar foto?" com foco em Cancelar; Esc e toque fora fecham.
7. "FINALIZAR" com observação já escrita no detalhe → título "Confira sua observação", botões "Enviar sem observação" e "Confirmar".
8. `#voucher?serviceId=10241&type=SERVICO` → "Usar 14:30 (agendado)" preenche o horário; "Limpar formulário" fica desabilitado sem dados e, com dados, pede "Limpar o voucher?". Pedágio "12,5" vira "12,50" ao sair do campo.
9. `#finalizar?serviceId=76&type=MANUTENCAO` → sem ícone de apagar até haver foto; "VALOR (R$)" ignora letras ("1.250,9abc" → "1250,90"); com foto, o ícone "Apagar fotos" pede "Apagar 1 foto?" e mantém os textos.
10. `#cancelado-local?serviceId=10241&type=SERVICO` → "Limpar texto" desabilitado vazio; com texto pede "Apagar o texto?". "Cliquei errado" volta ao detalhe.
11. `#historico` → busca "zzz inexistente" mostra `Nenhum serviço encontrado para "zzz inexistente".`

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
