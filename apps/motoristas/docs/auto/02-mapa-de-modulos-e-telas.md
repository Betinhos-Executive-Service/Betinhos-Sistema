# 02. Mapa de módulos e telas

## Telas (tipo `Screen`, `src/types.ts`) e hash

O hash vem de `SCREEN_HASH_PATHS` em `src/app/navigation.ts` (há aliases em inglês/português). A renderização por `screen === "..."` está em `src/App.tsx` (aprox. linhas 3313–3990).

| `Screen` | Hash | Componente (`src/screens/`) | Para quê |
|---|---|---|---|
| `inicio` | `inicio` | `InitialScreen.tsx` | Home: tiles de módulos, pendências, atalho de recibo personalizado |
| `servicos` | `servicos` | `ServicesScreen.tsx` | Agenda (serviços, manutenções, trocas), busca |
| `detalhes` | `detalhes` | `DetailsScreen.tsx` | Detalhe do item; ações Cancelar/Receber/Voucher/Finalizar |
| `receber` | `receber` | `ReceiveScreen.tsx` | Comprovantes de recebimento (fotos/vídeo), resumo do QR |
| `cobrancaQr` | `cobranca-qr` | `QrChargeScreen.tsx` | Cobrança por QR (Stripe) |
| `reciboPersonalizado` | `recibo-personalizado` | `ReceiptScreen.tsx` (+ `ReceiptReadingScreen`, `ReceiptIllegibleScreen`) | Recibo em PDF para o cliente; leitura rápida do comprovante de gasto |
| `voucher` | `voucher` | `VoucherScreen.tsx` | Voucher (clientes que exigem) |
| `assinatura` | `assinatura` | `SignatureScreen.tsx` | Assinatura do voucher |
| `finalizar` | `finalizar` | `FinalizeScreen.tsx` | Finalização de serviço/manutenção/troca |
| `canceladoLocal` | `cancelado-local` | `LocalCancelScreen.tsx` | "Cancelado no local" (vai para Requer Análise) |
| `historico` / `detalhesHistorico` | `historico` / `detalhes-historico` | `HistoryScreen`, `HistoryDetailsScreen` | Concluídos recentes |
| `gastos` | `gastos` | `ExpenseScreen.tsx` | Registrar gasto (despesa operacional) |
| `fotoReceber`, `previewFotoReceber`, `fotoGasto`, `previewFotoGasto`, `fotoManutencao`, `previewFotoManutencao`, `fotoColisao`, `previewFotoColisao`, `fotoSolicitacaoManutencao`, `previewFotoSolicitacaoManutencao` | `foto-*`, `preview-foto-*` | `MediaCaptureScreen.tsx`, `MaintenancePhotoPreviewScreen.tsx` | Câmera e pré-visualização por contexto |
| `colisoesInicio` / `colisoes` | `colisoes` / `registro-colisao` | `CollisionStartScreen`, `CollisionScreen` | Registro de colisão |
| `solicitarManutencao` | `manutencao` | `MaintenanceRequestScreen.tsx` | Solicitar manutenção |
| `boasIdeias` | `boas-ideias` | `IdeasScreen.tsx` | Enviar/ver ideias |
| `meuCarro` | `meu-carro` | `MyVehicleScreen.tsx` | Carro atual (motorista terceiro escolhe) |
| `comunicados` | `comunicados` | `ComunicadosScreen.tsx` | Comunicados e ciência com assinatura |
| `checklists` | `checklists` | `ChecklistsScreen.tsx` | Checklist de vistoria |
| `multas` | `multas` | `TermosMultaScreen.tsx`, `TermoMultaDetalheScreen.tsx` | Termos de multa com assinatura eletrônica |
| `treinamentos` | `treinamentos` | `TreinamentosScreen.tsx` | Treinamentos (texto, vídeo, assinatura, quiz) |
| (sem `Screen`) | n/a | `ButtonPreviewScreen.tsx` | Pré-visualização de botões; **não confirmado** se é alcançável em produção |

Tiles da Home (`InitialScreen.tsx`): Serviços, Histórico, Comunicados, Checklist, Multas, Treinamentos, Manutenção, Gastos, Colisões, Boas ideias.

### Deep links (querystring ou `?data=` repassado pelo Dynamics) — `src/app/bootstrap.ts`

| Parâmetro | Abre |
|---|---|
| `servicoId` + `tipo` | Detalhe do serviço/manutenção/troca |
| `comunicadoId` | Comunicado (id do **destinatário**, tabela `new_comunicadodestinatario`, conforme o mapa do web resource de push) |
| `checklistId` | Checklist |
| `termoMultaId` | Termo de multa |
| `treinamentoParticipacaoId` | Treinamento |

`webresources/new_appmotoristas_push_redirect.js` produz esses parâmetros: o OnLoad dos forms de `new_comunicadodestinatario`, `new_checklistveiculo`, `cr40f_reservadeveculos`, `new_termomulta` e `cr40f_treinamentoparticipacao` leva ao web resource do App (guard de 15 s em `sessionStorage`, prefixo `betinhos:pushRedirect:`).

## Módulos `src/lib` (domínio)

| Arquivo | Responsabilidade |
|---|---|
| `dataverse.ts` (~4,4 mil linhas) | Runtime Xrm/fetch, CRUD, `loadRemoteStore` (agenda), finalizações, voucher, Flows, uploads, QR, trocas, resolução de carro |
| `fetchWebApi.ts` | Emula `Xrm.WebApi` por `fetch` na URL direta |
| `customApi.ts` | Executa Custom API não vinculada (`Xrm.WebApi.online.execute`) |
| `comunicados.ts`, `checklists.ts`, `checklistSend.ts`, `termosMulta.ts`, `treinamentos.ts` | Módulos de RH/operação, com mock local quando sem Dataverse |
| `collisions.ts` | Choices e rascunho de colisão |
| `expenses*.ts`, `expenseSubmission.ts`, `expenseUpload*.ts` | Despesas: tipos, referência, payload, upload legado × assíncrono |
| `qrCharge.ts`, `qrChargeMock.ts` | Cobrança por QR (Stripe via plugin) |
| `receipt*.ts`, `personalReceipt.ts` | Recibo personalizado (PDF, SVG, cache, idioma) |
| `receiveProofCheck.ts`, `detailMedia.ts`, `mediaDrafts.ts`, `mediaDraftStore.ts`, `photoOrientation.ts`, `camera*.ts` | Comprovantes, câmera e rascunhos em IndexedDB |
| `serviceVehicleInfleet*.ts`, `myVehicle.ts` | Carro do serviço (Infleet) e carro atual do motorista |
| `observacaoOrganizada.ts` | Cliente da Custom API `new_OrganizarObservacao` |
| `passengerPhoto.ts`, `passengerContact.ts`, `detailHtml.ts`, `mapLinks.ts`, `receiptLanguage.ts` | Detalhe do serviço |
| `appErrorLogger.ts`, `buildStamp.ts`, `pwa.ts`, `pwaManifest.ts` | Transversais |
| `ideas.ts`, `maintenanceFinalize.ts`, `localWorkflow.ts`, `remoteReadBatch.ts`, `fieldLookup.ts`, `currencyInput.ts`, `useDitado.ts` | Utilitários de domínio/UI |

## Módulos `src/app`

`navigation.ts` (hash, profundidade, motion, auto-refresh), `bootstrap.ts` (store local mock, deep links, rascunhos), `detailFlow.ts` (rota Receber/Voucher/Finalizar), `backGuard.ts`, `agendaVisibility.ts`, `overlayLayering.ts`, `cameraScroll.ts`, `tour.ts`/`tourChapters.ts`/`tourDom.ts` (tour guiado por capítulos).

## Regras de roteamento de serviço (`src/app/detailFlow.ts`)

- Exige o passo **Receber** quando é `SERVICO` e (ação `receber` presente, ou `cr40f_receber` verdadeiro, ou campo "Receber" = "Sim").
- Vai para **Voucher** quando o campo "Cliente" casa `/tenn?aris/i` (regra fixa no código).
- Receber pendente = falta comprovante, a menos que dispensado (QR pago no valor total); no modo remoto exige também que todos os comprovantes tenham sido enviados.
- Depois de QR pago: valor total → `voucher` ou `finalizar`; parcial → volta a `receber`.

## Permissões por motorista lidas do cadastro (`cr40f_funcionarios`)

| Campo | Efeito no app |
|---|---|
| `cr40f_gerarrecibopersonalizado` | Habilita o recibo personalizado |
| `cr40f_podecobrarqrcode` | Habilita cobrança por QR (a coluna pode não existir no ambiente: o app tolera e desativa) |
| `cr40f_tipodevinculo` (0 colaborador, 1 terceiro) | Terceiro: histórico de 45 dias (colaborador: 5 dias) e tela "Meu carro" |
