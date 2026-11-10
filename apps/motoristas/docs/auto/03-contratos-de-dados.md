# 03. Contratos de dados (Dataverse, Custom APIs, Flows)

Fonte: `src/lib/dataverse.ts` (constante `DATAVERSE`, `ENTITY_SET_TO_ENTITY_NAME`, `*_SELECT`), `src/lib/*.ts` e `plugins/`. Prefixo atual `cr40f_`; prefixo `new_` para colunas/tabelas mais novas. **Os nomes lógicos abaixo são os que o código usa**; metadata real do Dataverse não foi consultada (sem acesso), então a existência/tipo de cada coluna no ambiente é **não confirmado**. Há um índice de schema versionado em `docs/dataverse-schema-index.json` e o script `scripts/audit-dataverse-selects.cjs`; nenhum dos dois foi executado/conferido aqui.

## 1. Tabelas usadas (entity set → nome lógico)

| Chave em `DATAVERSE` | Entity set | Nome lógico | Uso |
|---|---|---|---|
| `geral` | `cr40f_reservadeveculoses` | `cr40f_reservadeveculos` | Reserva/serviço ("Geral"): agenda, voucher, finalização |
| `funcionarios` | `cr40f_funcionarioses` | `cr40f_funcionarios` | Motorista logado e destinatários |
| `veiculos` | `cr40f_veiculoses` | `cr40f_veiculos` | Frota |
| `clientes` | `cr40f_clientes1s` | `cr40f_clientes1` | Clientes |
| `bancoDeDados` | `cr40f_bancodedadoses` | `cr40f_bancodedados` | Passageiros (cadastro) |
| `servicosPorPassageiro` | `cr40f_servicosporpassageiros` | `cr40f_servicosporpassageiro` | Passageiros por serviço |
| `manutencoes` | `cr40f_manutencoeses` | `cr40f_manutencoes` | Manutenções |
| `fotosManutencao` | `new_fotomanutencao` | `new_fotomanutencao` | Fotos de manutenção |
| `trocas` | `cr40f_trocasdecarros` | `cr40f_trocasdecarro` | Trocas de carro |
| `posseVeiculos` | `new_possedeveiculos` | `new_possedeveiculo` | Posse de veículo |
| `locaisBase` | `new_localdebases` | `new_localdebase` | Locais de base das trocas |
| `anexosRecebimento` | `cr40f_anexorecebimento_v2s` | `cr40f_anexorecebimento_v2` | Comprovantes de recebimento |
| `despesasOperacionais` | `cr40f_despesaoperacionals` | `cr40f_despesaoperacional` | Gastos |
| `anexosDespesasOperacionais` | `cr40f_anexodespesaoperacionals` | `cr40f_anexodespesaoperacional` | Comprovantes de gasto |
| `categoriasDespesasOperacionais` | `cr40f_categoriadespesaoperacionals` | `cr40f_categoriadespesaoperacional` | Categorias de gasto |
| `formasPagamentoDespesas` | `cr40f_formapagamentodespesas` | `cr40f_formapagamentodespesa` | Formas de pagamento |
| `cidades` | `cr40f_cidades` | `cr40f_cidade` | Cidades do gasto |
| `colisoes` / `anexosColisoes` | `cr40f_colisao_v2s` / `cr40f_anexocolisao_v2s` | `cr40f_colisao_v2` / `cr40f_anexocolisao_v2` | Colisões e anexos |
| `recibos` | `cr40f_recibos_v2s` | `cr40f_recibos_v2` | Recibo personalizado |
| `boasIdeias` | `cr40f_boasideiases` | `cr40f_boasideias` | Boas ideias |
| `comunicados` / `comunicadoDestinatarios` | `new_comunicadomotoristas` / `new_comunicadodestinatarios` | `new_comunicadomotorista` / `new_comunicadodestinatario` | Comunicados |
| `checklistVeiculos` | `new_checklistveiculos` | `new_checklistveiculo` | Checklist de vistoria |
| `termosMulta` | `new_termomultas` | `new_termomulta` | Termos de multa |
| `treinamentos` / `treinamentoParticipacoes` | `cr40f_treinamentos` / `cr40f_treinamentoparticipacaos` | `cr40f_treinamento` / `cr40f_treinamentoparticipacao` | Treinamentos (provisionados pelo Sistema Betinhos) |
| `systemusers` | `systemusers` | `systemuser` | Usuários (lista para destinatários de comunicado) |
| (log) | n/a | `new_appmotoristaslog` | Log de erros do app (via pacote `@betinhos-executive-service/ui`) |
| (config) | `environmentvariabledefinitions` / `environmentvariablevalues` | n/a | URLs dos Flows |

Aliases de entity set tolerados: `cr40f_reservadeveculoes`→`cr40f_reservadeveculoses`, `cr40f_funcionarioes`→`cr40f_funcionarioses`.

## 2. Choices (valores numéricos usados no código)

| Choice | Valores | Arquivo |
|---|---|---|
| `new_categoriadoitem` (Geral) | serviço 100000000, manutenção 100000001, troca 100000002 | `dataverse.ts` |
| `cr40f_status` (Geral) | requer análise 100000001, concluído 202410008. Outros valores (ex.: Programado/Confirmado/Cancelado) **não confirmado** no front | `dataverse.ts` |
| `cr40f_statusdatroca` | programada 202410000, confirmada 100000001, concluída 202410001 | `dataverse.ts` |
| `new_tipodetroca` | troca 100000000, devolução à base 100000001, retirada na base 100000002, repasse 100000003 | `dataverse.ts` |
| `new_mododajanela` | "entre" = 100000001 (outro valor = fixa, **não confirmado** o número) | `dataverse.ts` |
| `new_origemveiculo` (Geral) | automático 100000000, manual 100000001 | `dataverse.ts` |
| `new_origemveiculoatual` (funcionário) | motorista escolheu = 100000001 | `myVehicle.ts` |
| `cr40f_tipodevinculo` | colaborador 0, terceiro 1 | `dataverse.ts` |
| `cr40f_statusdoveiculo` | ativo 202410001 | `dataverse.ts` |
| `new_categoriadoveiculo` | próprio 100000000, aluguel 100000002 | `dataverse.ts` |
| `cr40f_status` (manutenção) | realizado 202410002 | `dataverse.ts` |
| `cr40f_pagamento` (manutenção) | cartão 202410000, pedido de compra/dinheiro 202410001, pix 202410002 | `dataverse.ts` |
| `cr40f_status_geracao` (recibo) | gerado 100000000, salvo no OneDrive 100000001, falha 100000002 | `dataverse.ts` |
| `new_idioma` (recibo) | PT 100000000, EN 100000001, ES 100000002 | `dataverse.ts` |
| Anexo de recebimento | `cr40f_status`=100000001, `cr40f_tipo`=100000000, `cr40f_tipomidia` foto 100000000 / vídeo 100000001 | `uploadReceiveProofRemote` |
| Despesa | `cr40f_statusoperacional`=100000000, `cr40f_statusfinanceiro`=100000000, `cr40f_origem`=100000000, `cr40f_statusanexo` = 100000001 (com fotos) ou 100000000 | `expenses.payload.ts` |
| Anexo de despesa (`cr40f_status`) | pendente 100000000, enviado 100000001, falhou 100000002, processando 100000004 | `expenseUploadState.ts`, `ExpenseUploadCommand.cs` |
| Colisão `cr40f_statusoperacional` | enviado 100000000, em análise 100000001, resolvido 100000002, cancelado 100000003 | `collisions.ts` |
| Colisão `cr40f_statusanexo` | sem anexo 100000000, enviando 100000001, completo 100000002, falhou 100000003, parcial 100000004 | `collisions.ts` |
| Tipo de anexo de colisão | cena 100000000, dano Betinhos 100000001, dano terceiro (CNH) 100000002, documento do terceiro 100000003, extra/vídeo 100000004 | `collisions.ts`, `dataverse.ts` |
| Ideia `cr40f_status` | nova 100000000, em avaliação 100000001, aprovada 100000002, implementada 100000003 | `ideas.ts` |
| Comunicado `new_tipo` | informativo 100000000, ciência 100000001 | `comunicados.ts` |
| Comunicado `new_escopo` | todos 100000000, selecionados 100000001 | `comunicados.ts` |
| Comunicado `new_estado` | rascunho 100000000, disparado 100000001 | `comunicados.ts` |
| Destinatário `new_pushstatus` | pendente 100000000, enviado 100000001, falhou 100000002 | `comunicados.ts` |
| Checklist `new_estado` | aguardando motorista 100000000, pendente 100000001, concluído 100000002, cancelado 100000003 | `checklists.ts` |
| Checklist `new_origem` | quinzenal 100000000, manual 100000001, troca 100000002 | `checklists.ts` |
| Termo `new_status` | pendente 100000000, assinado 100000001, contestado 100000002, expirado 100000003 | `termosMulta.ts` |
| Termo `new_formapagamento` | guia 100000000, folha 100000001 | `termosMulta.ts` |
| Treinamento `cr40f_estado` | publicado 100000001 | `treinamentos.ts` |

## 3. Colunas lidas por consulta principal

- **Geral (agenda)** — `GERAL_SELECT`: `cr40f_reservadeveculosid, cr40f_id, cr40f_dataehorriodesada, cr40f_horrioprevistoderetorno, cr40f_trajeto, cr40f_passageirosetelefonedecontato, cr40f_endereodesada, cr40f_destino, cr40f_obsdeoperao, cr40f_perfildopassageiro, cr40f_receber, _cr40f_cliente_value, _cr40f_solicitante_value, _cr40f_veiculo_value, _cr40f_motorista_value, _cr40f_om_value, _cr40f_ot_value, cr40f_status, new_categoriadoitem, new_foiprogramado, new_datadefinalizacao, new_visualizacaodomotorista, new_rascunhovoucher, new_observacaofinal, new_origemveiculo, modifiedon`. Serviços acrescentam `cr40f_valor_a_receber`. `cr40f_om` aponta a manutenção, `cr40f_ot` a troca.
- **Manutenção** — `MAINTENANCE_SELECT`: `cr40f_manutencoesid, cr40f_id, cr40f_descricao, cr40f_comentariosaomotorista, cr40f_graudamanutencao, cr40f_tipodoreparo, cr40f_status, cr40f_servicorealizado, cr40f_estabelecimento, cr40f_valor, cr40f_pagamento, _cr40f_placa_carro_value, _cr40f_realizado_por_nome_value, new_comentariosdocolaborador, cr40f_foto01, cr40f_linkdaevidencia, cr40f_foto03, new_linkdanotafiscal, new_linkdafotofinal1..3`.
- **Troca** — `EXCHANGE_SELECT`: `cr40f_trocasdecarroid, cr40f_id, cr40f_iniciodajaneladetroca, cr40f_fimdajaneladetroca, _cr40f_motorista1_value, _cr40f_motorista2_value, _cr40f_veiculo1antesdatroca_value, _cr40f_veiculo2antesdatroca_value, cr40f_observacao, cr40f_statusdatroca, new_tipodetroca, new_concluidomotorista1/2, new_observacaodomotorista1/2, new_mododajanela, new_localdatroca, _new_m1depoisde_value, _new_m1antesde_value, _new_m2depoisde_value, _new_m2antesde_value, _new_localdebase_value`.
- **Funcionário (login)**: `cr40f_funcionariosid, cr40f_nomecompleto, cr40f_emailmicrosoft, _cr40f_veiculoatual_value, cr40f_tipodevinculo, cr40f_gerarrecibopersonalizado, cr40f_podecobrarqrcode` com filtro `cr40f_status eq 0 and cr40f_emailmicrosoft eq '<email>'`.
- **Checklist**: `new_checklistveiculoid, new_name, _new_motorista_value, _new_veiculo_value, new_estado, new_origem, _new_entreguepor_value, new_trocadetectadaem, new_solicitadoem, new_concluidoem, new_odometroinfleet, new_itensjson, new_respostasjson, createdon`.
- **Destinatário de comunicado**: `new_comunicadodestinatarioid, _new_comunicado_value, _new_motorista_value, new_titulo, new_corpo, new_tipo, new_enviadoem, new_abertoem, new_lidoem, new_cienteem, new_nomeassinante, new_observacao, new_assinaturajson, new_pushstatus, new_pusherro`.
- **Termo de multa**: `new_termomultaid, new_name, new_status, new_textotermo, new_versaotexto, new_evidenciasjson, new_formapagamento, new_parcelas, new_valortotal, new_valorparcela, new_primeiracompetencia, new_enviadoem, new_assinadoem, new_hashpdf, new_motivocontestacao`.
- **Treinamento / participação**: ver `TREINAMENTO_SELECT`/`PARTICIPACAO_SELECT` em `src/lib/treinamentos.ts` (`cr40f_name, cr40f_descricao, cr40f_conteudo, cr40f_videourl, cr40f_anexosjson, cr40f_exigeassinatura, cr40f_exigequiz, cr40f_notaminima, cr40f_quizjson, cr40f_validade, cr40f_publicadoem, cr40f_editadoem` e `cr40f_abertoem, cr40f_confirmadoem, cr40f_assinadoem, cr40f_nomeassinante, cr40f_assinaturajson, cr40f_nota, cr40f_aprovado, cr40f_tentativas, cr40f_respostasjson, cr40f_concluidoem`).

### Janela da agenda (`loadRemoteStore`)

- Serviços pendentes: `cr40f_dataehorriodesada le agora+3 dias`, motorista = logado, `new_foiprogramado eq true`, categoria serviço, `cr40f_status ne concluído`, `_cr40f_om_value eq null and _cr40f_ot_value eq null`.
- Manutenções: mesma janela, categoria manutenção, `om ne null`, `ot eq null`; lê a `cr40f_manutencoes` ligada e descarta as já realizadas.
- Trocas: `cr40f_iniciodajaneladetroca le agora+3 dias`, motorista1 ou motorista2 = logado, status Programada.
- Histórico: concluídos nos últimos **5 dias** (colaborador) ou **45 dias** (terceiro), até agora+3 h; trocas concluídas na mesma janela.

## 4. Payloads de escrita (resumo fiel ao código)

| Operação | Tabela | Campos escritos |
|---|---|---|
| Visualização | Geral | `new_visualizacaodomotorista` = agora |
| Finalizar serviço | Geral | `cr40f_status`=concluído, `new_datadefinalizacao`, `new_observacaofinal` (prefixo "OBS do motorista:" mesclado), patch de veículo (`buildFinalizeServiceVehiclePatch`) |
| Cancelado no local | Geral | `new_observacaofinal` = "Obs do Motorista: <motivo>", `cr40f_status`=requer análise, `new_datadefinalizacao` |
| Rascunho de voucher | Geral | `new_rascunhovoucher` = JSON (`hora_saida, min_saida, espera_ini_*, espera_fim_*, desvio, obs, pedagio, estacionamento, combustivel, hospedagem, outros`) |
| Voucher concluído | Geral | `new_rascunhovoucher`=null, status concluído, `new_datadefinalizacao`, patch de veículo; o link vem em `new_linkdovoucher` (gravado pelo Flow) |
| Finalizar manutenção | Manutenção | `cr40f_datamanutencao, cr40f_estabelecimento, cr40f_valor, new_comentariosdocolaborador, cr40f_servicorealizado, cr40f_pagamento, cr40f_Realizado_por_nome@odata.bind` + links de fotos (`new_linkdanotafiscal`, `new_linkdafotofinal1..3`) e linhas em `new_fotomanutencao` (`new_name, new_tipofoto, new_origem, new_link, new_caminho, new_nomearquivo, new_ordem, new_Manutencao@odata.bind`) |
| Solicitar manutenção | Manutenção | `cr40f_descricao, cr40f_kmatual, cr40f_graudamanutencao, cr40f_Placa_Carro@odata.bind, cr40f_Solicitado_por@odata.bind`, opcionais `cr40f_agendarpara, cr40f_comentariosaomotorista` (+ fotos nos campos `cr40f_foto01, cr40f_linkdaevidencia, cr40f_foto03`) |
| Confirmar troca | Custom API `new_ConfirmarTrocaMotorista` (ligada à troca) | `new_Motivo`, `new_VersaoEsperada` (ETag), opcional `new_MotivoForaDaJanela` |
| Comprovante de recebimento | Anexo recebimento | `cr40f_name, cr40f_nome, cr40f_nomearquivo, cr40f_urlsharepoint, cr40f_sharelink, cr40f_dataenvio, cr40f_ordem, cr40f_status, cr40f_tipo, cr40f_tipomidia` + lookups reserva e enviado-por (navigation property resolvida em runtime) |
| Despesa | Despesa operacional | `cr40f_nome, cr40f_datagasto, cr40f_valor, cr40f_statusoperacional, cr40f_statusfinanceiro, cr40f_statusanexo, cr40f_origem, cr40f_observacao`, opcionais `cr40f_kminformado, cr40f_litros, cr40f_estabelecimento`, lookups motorista/categoria/forma/cidade e opcionais veículo/reserva/manutenção. Modo async acrescenta `new_uploadexpectedcount` e, nos anexos, `new_uploadattemptid`, `new_uploadrunid`, `new_uploaderror`, `cr40f_mimetype`, `cr40f_driveitemid` |
| Colisão | Colisão v2 | `cr40f_datahora, cr40f_descricao, cr40f_houveterceiro, cr40f_local, cr40f_name/nome, cr40f_statusanexo, cr40f_statusoperacional, cr40f_terceiro{documento,nome,observacao,placa,seguradora,telefone,veiculo}, cr40f_tipoocorrencia` (valores: `eu_bati`, `bateram_em_mim`) |
| Recibo | Recibo v2 | `cr40f_name, cr40f_id_operacao, cr40f_pagante, cr40f_cliente, new_idioma, cr40f_valor_total_texto, cr40f_valor_total, cr40f_metodo_pagamento, cr40f_periodo, cr40f_trajetos, cr40f_observacoes, cr40f_mime_type, cr40f_status_geracao, cr40f_modelo_json, cr40f_gerado_em, cr40f_data_emissao`; depois `cr40f_id_pagamento, cr40f_nome_arquivo, cr40f_caminho_onedrive`; em falha `cr40f_erro`. O identificador sai de `new_id` (autonumeração) |
| Ideia | Boas ideias | `cr40f_name, cr40f_detalhes, cr40f_status` = nova |
| Treinamento | Participação | `cr40f_abertoem, cr40f_confirmadoem, cr40f_assinadoem, cr40f_nomeassinante, cr40f_assinaturajson, cr40f_nota, cr40f_aprovado, cr40f_tentativas, cr40f_respostasjson, cr40f_concluidoem` |
| Carro atual (terceiro) | Funcionário | `cr40f_VeiculoAtual@odata.bind`, `new_veiculoatualdesde`, `new_origemveiculoatual`=100000001 |

## 5. Custom APIs chamadas pelo app (não vinculadas, exceto indicado)

| API | Parâmetros de entrada | Retorno | Cliente |
|---|---|---|---|
| `new_AbrirComunicadoMotorista` | `new_DestinatarioId` | n/d | `comunicados.ts` |
| `new_RegistrarCienciaComunicado` | `new_DestinatarioId`, `new_AssinaturaJson` (≤100.000 caracteres), `new_Observacao` (≤1.000) | n/d | `comunicados.ts` |
| `new_DispararComunicadoMotorista`, `new_ReenviarPushComunicado` | `new_ComunicadoId` / destinatário | n/d | `comunicados.ts` (uso de gestão) |
| `new_ConcluirChecklistVeiculo` | `new_ChecklistId`, `new_RespostasJson` | n/d | `checklists.ts` |
| `new_AssinarTermoMulta` | `new_TermoId`, assinatura, selfie, GPS (`new_Latitude`, `new_Longitude`, `new_PrecisaoGps`), `new_Dispositivo` | `new_HashPdf` | `termosMulta.ts` |
| `new_ContestarTermoMulta` | `new_TermoId`, `new_Motivo` | n/d | `termosMulta.ts` |
| `new_BaixarPdfTermoMulta` | `new_TermoId` | `new_PdfBase64`, `new_NomeArquivo` | `termosMulta.ts` |
| `new_ConsultarAditivoMotorista` | nenhum | `new_TemAditivo` | `termosMulta.ts` |
| `new_ObterFotoPassageiro` | `new_ReservaId`, `new_PassageiroId` | `new_FotoJson` | `passengerPhoto.ts` |
| `new_ResolverVeiculoDoServico` | `new_ReservaId` | `new_ResultadoJson` | `dataverse.ts` |
| `new_OrganizarObservacao` | `new_Texto` | `new_ResultadoJson` (`ok, topicos, motivo, ms`) | `dataverse.ts` |
| `new_CobrancaQR` (POST em `/api/data/v9.2/new_CobrancaQR`) | `new_Command` = JSON `{acao: criar|consultar|cancelar|resumo, ...}` | `new_Result` (JSON) | `dataverse.ts` |
| `new_ExpenseUploadTransition` | `new_Command` = JSON (`attachmentId, attemptId, runId, action`) | `new_Result` (`applied, status, stale`) | `dataverse.ts` |
| `new_ConfirmarTrocaMotorista` | ver acima (vinculada a `cr40f_trocasdecarro`) | n/d | `dataverse.ts` |

Outras Custom APIs existem no backend e **não** são chamadas pelo front: `new_EnviarTermoMulta`, `new_CancelarTermoMulta`, `new_ExpirarTermoMulta`, `new_LembrarTermoMulta`, `new_SolicitarChecklistVeiculo`, `new_ReatribuirChecklistVeiculo`, `new_ProcessarChecklistsVeiculos`, `new_GerarLinkAcompanhamento`, `new_SincronizarVeiculoAtual`, e o ciclo de troca (`new_RegistrarTrocaDeCarro`, `new_AtualizarTrocaDeCarro`, `new_ConcluirTrocaDeCarro`, `new_CancelarTrocaDeCarro`, `new_ReverterTrocaDeCarro`, usadas pelo web resource `new_exchange_lifecycle_commands.js` e pela Tela Operacional). Evidência: nomes nos plugins e em `docs/exchange-lifecycle-commandbar.md`/`system_architecture.md`.

## 6. Plugins (`plugins/DriverRecordSharing`, assembly `Betinhos.DriverRecordSharing`, net462)

| Classe | Papel (pelo nome/README/código) |
|---|---|
| `ServiceDriverSharePlugin` + `DataverseAccessHelper`, `DriverResolver` | Concede/mantém/revoga acesso do motorista ao registro (reserva, passageiros, manutenção ligada, troca Programada). Exige Pre Image nos steps Update. Falha com `Ref` = `correlationid` no `plugintracelog` |
| `ServiceVehicleSynchronizer`, `ServiceExchangeSynchronizer`, `ServicePassengerViewSynchronizer` | Carro do serviço pela posse, alinhamento de status Geral↔Troca, recálculo do campo VIEW de passageiros |
| `ExchangeLifecycleCommandPlugin` + `Exchange*` | Ciclo de vida de trocas (registrar, atualizar, confirmar, concluir, cancelar, reverter), com validação de janela/conflito e cadeia de posse |
| `ChecklistCommandPlugin`, `HandoverChecklistPlugin` | Checklist de vistoria e checklist disparado por troca detectada pela Infleet |
| `ComunicadoCommandPlugin` | Abrir, assinar, disparar comunicado |
| `TermoMultaCommandPlugin`, `TermoMultaDocumento`, `MiniPdf` | Termo de multa com assinatura eletrônica e PDF |
| `TreinamentoCommandPlugin` | Lembretes/comando de treinamentos |
| `QrChargePlugin`, `StripeCheckoutGateway`, `QrChargeRules` | Cobrança por QR no Stripe; revalida permissão, reserva e saldo; chave na configuração segura do step |
| `OrganizeObservationPlugin`, `ObservationOrganizer`, `ObservationApiKey` | Organiza a observação do motorista via API Anthropic; chave na configuração segura do step ou na variável de ambiente `new_AnthropicKeyObservacaoMotorista` |
| `ResolveServiceVehiclePlugin`, `SyncCurrentVehiclePlugin`, `InfleetGateway`, `CurrentVehicleSyncPlanner` | Carro por rastreador Infleet (GraphQL) |
| `GenerateTrackingLinkPlugin`, `RevokeTrackingLinkPlugin` | Link de acompanhamento (Worker externo; URL via configuração segura do step) |
| `VehiclePhotoGateway` | Foto do passageiro via Flows de SharePoint (variáveis `new_URLFlowListarArquivosSharePoint`, `new_URLFlowConsultarArquivosSharePoint`) |
| `plugins/ExpenseUpload` → `ExpenseUploadCommand` | `new_ExpenseUploadTransition`: transições pendente/processando/enviado/falhou, com `attemptId` para descartar tentativas antigas |

Steps recomendados no README do plugin: Geral, Funcionários e Trocas **síncronos**; Passageiros, Posse, Colisão e Recibo **assíncronos**; `PostOperation`, `Server`; Update com Pre Image. O registro real dos steps no Dataverse é **não confirmado** (sem consulta).

## 7. Flows HTTP (URL lida de variável de ambiente do Dataverse, com reserva em `window.__APP_FLOW_ENV`)

| Chave interna (`FLOW_URLS`) | Variável Dataverse (schema) | Variável de build (fallback) | Payload enviado |
|---|---|---|---|
| `gerarVoucher` | `new_FlowURLFlowGerarVoucherAppMotoristasv2` | `VITE_FLOW_GERAR_VOUCHER_URL` | `text` (id da reserva), `text_1` (assinatura base64), `text_2` (desvio), `text_5..text_15` (horários, espera, pedágio, estacionamento, combustível, hospedagem, outros, observação, horário final, timestamp ISO) |
| `salvarFotosManutencao` (usado também por checklist, recebimento, colisão, recibo) | `new_FlowURLFlowSalvarArquivosOnedrive` | `VITE_FLOW_SALVAR_FOTOS_MANUTENCAO_URL` | `caminhoCompleto, nomeArquivo, conteudoBase64, mimeType, metadados`; resposta precisa trazer link (`shareLink`/`link`/`webUrl`/`url`/`fileLink`/`sharedLink`) |
| `enviarReciboCliente` | `new_FlowURLFlowEnviarReciboCliente` | `VITE_FLOW_ENVIAR_RECIBO_CLIENTE_URL` | `emailCliente, assuntoEmail, corpoEmail, emailSubject, emailBody, linkRecibo, nomeArquivo, mimeType, conteudoBase64, reciboGuid, idPagamento, idOperacao, cliente, pagante, valorTotal, dataEmissao, metodoPagamento, detailId, modelo` (`sendReceiptEmailRemote`) |
| `quickRead` | `new_FlowURLDespesaLeituraRapida` | `VITE_FLOW_LEITURA_RAPIDA_URL` | `{imagemBase64, mime: "image/jpeg", categorias, formasPagamento}`; nunca lança, falha vira `{ok:false}` |
| `expenseAsync` | `new_FlowURLDespesaAsync` | `VITE_FLOW_DESPESA_ASYNC_URL` | `{attachmentId, attemptId, conteudoBase64}`; espera HTTP **202** |

Atenção: o build só embute no HTML as duas URLs `VITE_FLOW_GERAR_VOUCHER_URL` e `VITE_FLOW_SALVAR_FOTOS_MANUTENCAO_URL` (`window.__APP_FLOW_ENV`). As demais variáveis `VITE_*` são citadas no código, mas **não chegam ao bundle** pelo script de build atual.

Pastas OneDrive/SharePoint gravadas (prefixo `DEV/` quando o `clientUrl` é exatamente o DEV `org23b93544`): `Manutenções/<modelo - placa>/<id>`, `Recebimentos/<reserva>`, `Recibos/<cliente>/<identificador>`, `Checklists/<placa>/<data id8>`.
