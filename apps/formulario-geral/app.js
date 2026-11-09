(() => {
  "use strict";

  const CONFIG = {
    entities: {
      reserva: "cr40f_reservadeveculos",
      passageiro: "cr40f_bancodedados",
      cliente: "cr40f_clientes1",
      funcionario: "cr40f_funcionarios",
      veiculo: "cr40f_veiculos",
      trocaCarro: "cr40f_trocasdecarro",
      servicoPassageiro: "cr40f_servicosporpassageiro",
      financeiro: "cr40f_financeiro",
      posseVeiculo: "new_possedeveiculo",
      log: "new_appmotoristaslog"
    },
    entitySets: {
      reserva: "cr40f_reservadeveculoses",
      passageiro: "cr40f_bancodedadoses",
      cliente: "cr40f_clientes1s",
      funcionario: "cr40f_funcionarioses",
      veiculo: "cr40f_veiculoses",
      trocaCarro: "cr40f_trocasdecarros",
      servicoPassageiro: "cr40f_servicosporpassageiros",
      financeiro: "cr40f_financeiros",
      posseVeiculo: "new_possedeveiculos"
    },
    fields: {
      reserva: {
        id: "cr40f_reservadeveculosid",
        readableId: "cr40f_id",
        status: "cr40f_status",
        statusFaturamento: "cr40f_statusdefaturamento",
        dataSaida: "cr40f_dataehorriodesada",
        previsaoRetorno: "cr40f_horrioprevistoderetorno",
        tipoServico: "cr40f_tipodoservico",
        tipoVeiculo: "cr40f_tipodeveiculo",
        destino: "cr40f_destino",
        enderecoView: "cr40f_endereodesada",
        enderecoPersonalizado: "new_enderecodesaidapersonalizado",
        obsOperacao: "cr40f_obsdeoperao",
        obsInterna: "cr40f_observaointerna",
        obsFinal: "new_observacaofinal",
        perfilPassageiro: "cr40f_perfildopassageiro",
        email: "cr40f_email",
        paxView: "cr40f_passageirosetelefonedecontato",
        trajeto: "cr40f_trajeto",
        cotacao: "cr40f_cotao",
        valorReceber: "cr40f_valor_a_receber",
        receber: "cr40f_receber",
        cr: "cr40f_cr",
        formaPagamento: "cr40f_formadepagamento",
        idTenaris: "cr40f_idtenaris",
        idExterno: "new_idexterno",
        veiculo: "cr40f_veiculo",
        origemVeiculo: "new_origemveiculo"
      },
      passageiro: {
        id: "cr40f_bancodedadosid",
        nome: "cr40f_nomedopassageiro",
        telefone: "cr40f_telefone",
        enderecoSaida: "cr40f_enderecodesaida",
        preferencias: "cr40f_preferenciasdopassageiro",
        email: "cr40f_email",
        cr: "cr40f_cr",
        cargo: "cr40f_cargo",
        nascimento: "cr40f_datadenascimento",
        sexo: "cr40f_sexo",
        idioma: "cr40f_idioma",
        departamento: "cr40f_departamento",
        cadastro: "cr40f_datadecadastro",
        ultimoServico: "cr40f_datadoultimoservico",
        classificacao: "cr40f_classificacao",
        status: "cr40f_status",
        tipoVeiculo: "new_tipodoveiculo",
        fotoUrl: "new_linkdafoto"
      },
      cliente: {
        id: "cr40f_clientes1id",
        nome: "cr40f_nomedocliente"
      },
      funcionario: {
        id: "cr40f_funcionariosid",
        nome: "cr40f_nomecompleto",
        apelido: "new_apelido"
      },
      veiculo: {
        id: "cr40f_veiculosid",
        modelo: "cr40f_modelo",
        cor: "cr40f_cor",
        placa: "cr40f_placa"
      },
      trocaCarro: {
        id: "cr40f_trocasdecarroid",
        dataHoraTroca: "cr40f_dataehorariodatroca",
        inicioJanela: "cr40f_iniciodajaneladetroca",
        fimJanela: "cr40f_fimdajaneladetroca",
        statusTroca: "cr40f_statusdatroca",
        motorista1: "_cr40f_motorista1_value",
        motorista2: "_cr40f_motorista2_value",
        veiculo1: "_cr40f_veiculo1antesdatroca_value",
        veiculo2: "_cr40f_veiculo2antesdatroca_value",
        tipoTroca: "new_tipodetroca"
      },
      servicoPassageiro: {
        id: "cr40f_servicosporpassageiroid",
        ordem: "cr40f_ordemdeselecao",
        endereco: "new_enderecodesaidacolunaservicosporpassageiro"
      },
      financeiro: {
        id: "cr40f_financeiroid",
        label: "cr40f_idfinanceiro"
      }
    },
    nav: {
      cliente: "cr40f_Cliente",
      solicitante: "cr40f_Solicitante",
      motorista: "cr40f_Motorista",
      veiculo: "cr40f_Veiculo",
      financeiro: "cr40f_Financeiro",
      servicoGeral: "cr40f_Geral",
      servicoBancoDados: "cr40f_BancodeDados"
    },
    importDefaults: {
      clienteId: "",
      clienteLabel: "Embraer"
    }
  };

  const URL_PARAMS = new URLSearchParams(window.location.search);
  const AI_DRAFT_CONFIG = (() => {
    const configured = window.__FORMULARIO_IA_DRAFT_CONFIG;
    if (!configured || typeof configured !== "object" || !configured.entity) return null;
    return {
      entity: String(configured.entity),
      entitySet: String(configured.entitySet || `${configured.entity}s`),
      reviewedByBind: String(configured.reviewedByBind || ""),
      fields: configured.fields && typeof configured.fields === "object" ? configured.fields : {},
      statusValues: configured.statusValues && typeof configured.statusValues === "object" ? configured.statusValues : {},
      statusLabels: configured.statusLabels && typeof configured.statusLabels === "object" ? configured.statusLabels : {}
    };
  })();
  const AI_CONVERSATION_CONFIG = (() => {
    const configured = window.__FORMULARIO_IA_CONVERSATION_CONFIG;
    if (!configured || typeof configured !== "object" || !configured.entity) return null;
    return {
      entity: String(configured.entity),
      entitySet: String(configured.entitySet || `${configured.entity}s`),
      fields: configured.fields && typeof configured.fields === "object" ? configured.fields : {},
      statusValues: configured.statusValues && typeof configured.statusValues === "object" ? configured.statusValues : {}
    };
  })();
  const AI_CONVERSATION_CORE = window.AIScheduleConversationCore || null;
  const AI_CONVERSATION_MOCK_KEY = "formulario_geral_mock_ai_conversations_v1";
  const AI_CONVERSATION_LOCAL_KEY = "formulario_geral_local_ai_conversations_v1";
  const AI_CONVERSATION_LOCAL_RESERVATIONS_KEY = "formulario_geral_local_ai_reservations_v1";
  const AI_CONVERSATION_SESSION_KEY = "formulario_geral_dataverse_ai_session_v1";
  const AI_CONVERSATION_MAX_INPUT_LENGTH = 12000;
  const QUERY_MOCK_MODE = (URL_PARAMS.get("mock") === "1" || URL_PARAMS.get("mockData") === "1");
  const AI_CONVERSATION_LOCAL_MODE = !QUERY_MOCK_MODE && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const AI_CONVERSATION_LOCAL_ENDPOINT = URL_PARAMS.get("aiEndpoint") || "/api/ai-schedule";
  const MOCK_STORE_KEY = "formulario_geral_mock_db_v1";
  const MOCK_AI_DRAFTS_KEY = "formulario_geral_mock_ai_drafts_v2";
  const DRAFT_STORE_KEY = "formulario_geral_draft_v1";
  const APP_ERROR_LOG_APP_NAME = "Tela Formulario Geral";
  const APP_ERROR_LOG_LEGACY_QUEUE_KEY = "formulario_geral_error_log_queue_v1";
  const PASSENGER_RECENCY_KEY = "formulario_geral_passenger_recency_v1";
  const XLSX_SOURCE_ELEMENT_ID = "xlsxLibrarySource";
  const XLSX_DROP_CLASS_NAMES = ["is-import-dragging", "is-import-drag-invalid", "is-import-drag-blocked"];
  const BRAND_LOGO_WEBRESOURCE = "cr40f_LogoBetinhosB";
  const MAX_FREQUENT_SERVICE_DAYS = 90;
  const MAX_FREQUENT_SERVICE_RECORDS = 120;
  const SUCCESS_OS_PREVIEW_LIMIT = 5;
  let silentValidationReveal = false;
  let validationRefreshTimer = 0;
  const INITIAL_PASSENGER_LOOKUP_LIMIT = 5000;
  const AI_DRAFT_OPTIONAL_KEYS = new Set(["missingFields", "reviewJson", "reviewedAt", "reviewedBy", "matchCandidates", "partialIds"]);
  const PASSENGER_PHOTO_FLOW_URL_DEV = "https://25a2ab78cf07ee41a124457aa2c29a.ea.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/293ac35160b04517814dba9cd65367e5/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=_LO4SdhQdi2DjpGBp9kBqAXxBDRw5QgaKYmzf1hvXxs";
  const PASSENGER_PHOTO_FLOW_URL_PROD = "https://6847878f5a6fe08baed6d7119975e3.e1.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/a0a24686b4d04443b83b6f281ca0fede/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=PT75nHGbRYJ78_oudaGod_rpV_z3_1FDnklPYsQT3Ek";
  const PASSENGER_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
  const PT_BR_LOCALE = "pt-BR";
  const IMPORT_XLSX_STATUS_OPERATION_MAP = Object.freeze({
    "agendado": "Confirmado",
    "aguardando faturamento": "Confirmado",
    "em analise financeira": "Confirmado",
    "em execucao": "Confirmado",
    "lancamentos financeiros recusados": "Confirmado",
    "recusado pela central": "Cancelado"
  });
  const IMPORT_XLSX_AUTO_IGNORE_STATUSES = Object.freeze(new Set([
    "aguardando prestador"
  ]));

  const FALLBACK = buildFallbackChoices();

  function buildFallbackChoices() {
    return {
      statusOperacao: [
        { value: 202410002, label: "Cancelado" },
        { value: 100000001, label: "Requer Analise" },
        { value: 202410010, label: "Cancelado com Ressalvas" },
        { value: 202410000, label: "Pre-reserva" },
        { value: 202410004, label: "Solicitado" },
        { value: 202410001, label: "Confirmado" },
        { value: 202410005, label: "Programado" },
        { value: 202410006, label: "Em Execucao" },
        { value: 202410008, label: "Concluido" }
      ],
      statusFaturamento: [
        { value: 202410011, label: "Nao Faturavel" },
        { value: 202410005, label: "Pendente" },
        { value: 100000001, label: "Composicao Realizada" },
        { value: 202410000, label: "Cancelado Sem Taxa" },
        { value: 202410002, label: "Cancelado Com Taxa" },
        { value: 202410003, label: "Cortesia" },
        { value: 202410004, label: "Permuta" },
        { value: 202410006, label: "Pagante em Viagem" },
        { value: 202410007, label: "Pagamento Pendente" },
        { value: 202410012, label: "Pagamento Em Atraso" },
        { value: 202410008, label: "Faturamento Mensal" },
        { value: 202410010, label: "Pago" }
      ],
      tipoServico: [
        { value: 202410000, label: "Guarulhos" },
        { value: 202410001, label: "Sao Paulo" },
        { value: 202410002, label: "Outras Cidades" },
        { value: 202410003, label: "Vale do Paraiba" },
        { value: 202410004, label: "Rio de Janeiro" },
        { value: 202410005, label: "Pindamonhangaba" },
        { value: 202410006, label: "Sao Jose dos Campos" },
        { value: 202410007, label: "Congonhas" },
        { value: 202410008, label: "Campinas" },
        { value: 202410009, label: "Dentro de Sao Paulo" },
        { value: 202410010, label: "Litoral" },
        { value: 202410011, label: "Regiao dos Lagos" },
        { value: 202410012, label: "Extrema" },
        { value: 202410013, label: "Nova Odessa" },
        { value: 202410014, label: "Baixada Santista" },
        { value: 202410015, label: "Minas Gerais" },
        { value: 202410016, label: "GPX" }
      ],
      tipoVeiculo: [
        { value: 202410000, label: "Basico" },
        { value: 202410001, label: "Executivo" },
        { value: 202410002, label: "Blindado" },
        { value: 202410003, label: "Van" },
        { value: 202410004, label: "Van Blindado" },
        { value: 202410005, label: "Spin" },
        { value: 202410006, label: "Somente Motorista" }
      ],
      formaPagamento: [
        { value: 202410000, label: "Cartao de credito" },
        { value: 202410001, label: "Pedido de compra" },
        { value: 202410002, label: "Pix" }
      ],
      bdStatus: [
        { value: 202410000, label: "Ativo" },
        { value: 202410001, label: "Inativo" }
      ],
      bdClassificacao: [
        { value: 202410000, label: "Passageiro Frequente" },
        { value: 202410001, label: "Visitante" },
        { value: 202410002, label: "Solicitante" },
        { value: 202410003, label: "Grupo" },
        { value: 202410004, label: "Lead" }
      ],
      bdSexo: [
        { value: 202410000, label: "Masculino" },
        { value: 202410001, label: "Feminino" }
      ],
      bdIdioma: [
        { value: 202410000, label: "Portugues" },
        { value: 202410001, label: "Ingles" },
        { value: 202410002, label: "Espanhol" }
      ],
      bdCargo: [
        { value: 202410000, label: "C-Level" },
        { value: 202410001, label: "Presidente" },
        { value: 202410002, label: "Vice Presidente" },
        { value: 202410003, label: "Diretor" },
        { value: 202410004, label: "Assistente Executiva" },
        { value: 202410005, label: "Gerente" },
        { value: 202410006, label: "Supervisor" },
        { value: 202410007, label: "Analista" },
        { value: 202410008, label: "Comprador" },
        { value: 202410009, label: "Engenheiro" },
        { value: 100000001, label: "Conselheiro" }
      ],
      bdTipoVeiculo: [
        { value: 202410000, label: "Basico" },
        { value: 202410001, label: "Executivo" },
        { value: 202410002, label: "Blindado" },
        { value: 202410003, label: "Van" },
        { value: 202410004, label: "Van Blindado" },
        { value: 202410005, label: "Spin" },
        { value: 202410006, label: "Somente Motorista" }
      ],
      simple: []
    };
  }

  const $ = (id) => document.getElementById(id);

  const el = {
    brandLogo: $("brandLogo"),
    loading: $("loadingOverlay"),
    success: $("successOverlay"),
    successMessage: $("successMessage"),
    generateVoucher: $("generateVoucher"),
    closeSuccess: $("closeSuccess"),
    toastStack: $("toastStack"),
    saveButton: $("saveButton"),
    saveButtonText: $("saveButtonText"),
    closeRwButton: $("closeRwButton"),
    recordIdBox: $("recordIdBox"),
    recordIdText: $("recordIdText"),
    globalImportHistoryActions: $("globalImportHistoryActions"),
    importXlsxButton: $("importXlsxButton"),
    xlsxImportInput: $("xlsxImportInput"),
    importDropOverlay: $("importDropOverlay"),
    importDropOverlayCard: document.querySelector("#importDropOverlay .import-drop-overlay-card"),
    importDropOverlayTitle: document.querySelector("#importDropOverlay .import-drop-overlay-title"),
    importDropOverlayHint: document.querySelector("#importDropOverlay .import-drop-overlay-hint"),
    importReviewTitle: $("importReviewTitle"),
    importReviewSummary: $("importReviewSummary"),
    importReviewEmpty: $("importReviewEmpty"),
    importReviewStats: $("importReviewStats"),
    importReviewIssues: $("importReviewIssues"),
    importReviewPrograms: $("importReviewPrograms"),
    content: document.querySelector(".content"),
    tabs: [...document.querySelectorAll(".tab")],
    panels: [...document.querySelectorAll(".panel")],
    statusOperacao: $("statusOperacao"),
    statusFaturamento: $("statusFaturamento"),
    saidaData: $("saidaData"),
    saidaHora: $("saidaHora"),
    saidaMinuto: $("saidaMinuto"),
    retPrevDateTime: $("retPrevDateTime"),
    retPrevHora: $("retPrevHora"),
    retPrevMinuto: $("retPrevMinuto"),
    cliente: $("cliente"),
    solicitante: $("solicitante"),
    tipoServico: $("tipoServico"),
    tipoVeiculo: $("tipoVeiculo"),
    motorista: $("motorista"),
    veiculo: $("veiculo"),
    motoristaVeiculoAtual: $("motoristaVeiculoAtual"),
    trajeto: $("trajeto"),
    observacao: $("observacao"),
    receber: $("receber"),
    cotacao: $("cotacao"),
    valorReceber: $("valorReceber"),
    op: $("op"),
    opWrap: $("opWrap"),
    formaPagamento: $("formaPagamento"),
    cr: $("cr"),
    passengerRows: $("passengerRows"),
    passengerEmpty: $("passengerEmpty"),
    passengerBlock: document.querySelector(".passenger-block"),
    toggleEnderecoPersonalizado: $("toggleEnderecoPersonalizado"),
    addPassenger: $("addPassenger"),
    passengerPickerOverlay: $("passengerPickerOverlay"),
    passengerPickerSearch: $("passengerPickerSearch"),
    passengerPickerResults: $("passengerPickerResults"),
    passengerPickerClose: $("passengerPickerClose"),
    passengerPickerCreateShortcut: $("passengerPickerCreateShortcut"),
    passengerPickerCancel: $("passengerPickerCancel"),
    customAddressWrap: $("customAddressWrap"),
    enderecoPersonalizado: $("enderecoPersonalizado"),
    destino: $("destino"),
    bdNome: $("bdNome"),
    bdTelefone: $("bdTelefone"),
    bdEndereco: $("bdEndereco"),
    bdEmail: $("bdEmail"),
    bdClassificacao: $("bdClassificacao"),
    bdCliente: $("bdCliente"),
    bdSexo: $("bdSexo"),
    bdIdioma: $("bdIdioma"),
    bdCr: $("bdCr"),
    bdDepartamento: $("bdDepartamento"),
    bdCargo: $("bdCargo"),
    bdNascimento: $("bdNascimento"),
    bdPreferencias: $("bdPreferencias"),
    bdTipoVeiculo: $("bdTipoVeiculo"),
    bdPhotoDrop: $("bdPhotoDrop"),
    bdPhotoInput: $("bdPhotoInput"),
    bdPhotoClear: $("bdPhotoClear"),
    bdPhotoPreview: $("bdPhotoPreview"),
    bdPhotoMeta: $("bdPhotoMeta"),
    passengerEditOverlay: $("passengerEditOverlay"),
    passengerEditTitle: $("passengerEditTitle"),
    passengerEditStatus: $("passengerEditStatus"),
    passengerEditFields: $("passengerEditFields"),
    passengerEditToggle: $("passengerEditToggle"),
    passengerEditClose: $("passengerEditClose"),
    passengerMatchOverlay: $("passengerMatchOverlay"),
    passengerMatchSummary: $("passengerMatchSummary"),
    passengerMatchList: $("passengerMatchList"),
    passengerMatchCancel: $("passengerMatchCancel"),
    passengerMatchContinue: $("passengerMatchContinue"),
    passengerMatchUseSelected: $("passengerMatchUseSelected"),
    activationGuardOverlay: $("activationGuardOverlay"),
    activationGuardList: $("activationGuardList"),
    activationGuardReview: $("activationGuardReview"),
    activationGuardSkip: $("activationGuardSkip"),
    activationGuardActivate: $("activationGuardActivate"),
    receberGuardOverlay: $("receberGuardOverlay"),
    receberGuardText: $("receberGuardText"),
    receberGuardReview: $("receberGuardReview"),
    receberGuardConfirm: $("receberGuardConfirm"),
    returnReceiveScopeOverlay: $("returnReceiveScopeOverlay"),
    returnReceiveScopeReview: $("returnReceiveScopeReview"),
    returnReceiveScopeLast: $("returnReceiveScopeLast"),
    returnReceiveScopeAll: $("returnReceiveScopeAll"),
    clearAllFormsOverlay: $("clearAllFormsOverlay"),
    clearAllFormsCancel: $("clearAllFormsCancel"),
    clearAllFormsConfirm: $("clearAllFormsConfirm"),
    passengerPhotoPreviewOverlay: $("passengerPhotoPreviewOverlay"),
    passengerPhotoPreviewImage: $("passengerPhotoPreviewImage"),
    passengerPhotoPreviewFallback: $("passengerPhotoPreviewFallback"),
    passengerPhotoPreviewFrame: $("passengerPhotoPreviewFrame"),
    passengerPhotoPreviewOpenLink: $("passengerPhotoPreviewOpenLink"),
    passengerPhotoPreviewEyebrow: $("passengerPhotoPreviewEyebrow"),
    passengerPhotoPreviewMeta: $("passengerPhotoPreviewMeta"),
    passengerPhotoPreviewOk: $("passengerPhotoPreviewOk"),
    passengerPhotoPreviewCancel: $("passengerPhotoPreviewCancel"),
    createPassenger: $("createPassenger"),
    agendarRetorno: $("agendarRetorno"),
    receberRetorno: $("receberRetorno"),
    retornoData: $("retornoData"),
    retornoHora: $("retornoHora"),
    retornoMinuto: $("retornoMinuto"),
    retornoEndereco: $("retornoEndereco"),
    retornoDestino: $("retornoDestino"),
    retornoObservacao: $("retornoObservacao"),
    repetirServico: $("repetirServico"),
    frequenteInicio: $("frequenteInicio"),
    frequenteFim: $("frequenteFim"),
    frequenteTipo: $("frequenteTipo"),
    contabilizarFds: $("contabilizarFds"),
    tabImport: $("tabImport"),
    tabAi: $("tabAi"),
    aiDraftSummary: $("aiDraftSummary"),
    aiDraftSetup: $("aiDraftSetup"),
    aiDraftRefresh: $("aiDraftRefresh"),
    aiDraftSearch: $("aiDraftSearch"),
    aiDraftStatusFilter: $("aiDraftStatusFilter"),
    aiDraftEnvironment: $("aiDraftEnvironment"),
    aiDraftSeed: $("aiDraftSeed"),
    aiDraftList: $("aiDraftList"),
    aiDraftDetail: $("aiDraftDetail"),
    aiDraftMeta: $("aiDraftMeta"),
    aiDraftTitle: $("aiDraftTitle"),
    aiDraftStatus: $("aiDraftStatus"),
    aiDraftWarnings: $("aiDraftWarnings"),
    aiDraftFields: $("aiDraftFields"),
    aiDraftCandidates: $("aiDraftCandidates"),
    aiDraftReadiness: $("aiDraftReadiness"),
    aiDraftBody: $("aiDraftBody"),
    aiDraftSourceMeta: $("aiDraftSourceMeta"),
    aiDraftAttachmentNote: $("aiDraftAttachmentNote"),
    aiDraftSourceEmailTab: $("aiDraftSourceEmailTab"),
    aiDraftSourceAlertsTab: $("aiDraftSourceAlertsTab"),
    aiDraftSourceEmailPanel: $("aiDraftSourceEmailPanel"),
    aiDraftSourceAlertsPanel: $("aiDraftSourceAlertsPanel"),
    aiDraftAlertCount: $("aiDraftAlertCount"),
    aiDraftAlertList: $("aiDraftAlertList"),
    aiDraftApproveHint: $("aiDraftApproveHint"),
    aiDraftApprove: $("aiDraftApprove"),
    aiDraftOpenForm: $("aiDraftOpenForm"),
    aiDraftResume: $("aiDraftResume"),
    aiDraftDiscard: $("aiDraftDiscard"),
    aiConversationEnvironment: $("aiConversationEnvironment"),
    aiConversationIdentity: $("aiConversationIdentity"),
    aiConversationProgress: $("aiConversationProgress"),
    aiConversationToggle: $("aiConversationToggle"),
    aiConversationThread: $("aiConversationThread"),
    aiConversationWorkspace: $("aiConversationWorkspace"),
    aiConversationServiceList: $("aiConversationServiceList"),
    aiConversationServiceCount: $("aiConversationServiceCount"),
    aiConversationSave: $("aiConversationSave"),
    aiConversationStartOver: $("aiConversationStartOver"),
    aiConversationSetup: $("aiConversationSetup"),
    aiConversationRefresh: $("aiConversationRefresh"),
    aiConversationStatus: $("aiConversationStatus"),
    aiConversationMessages: $("aiConversationMessages"),
    aiConversationInput: $("aiConversationInput"),
    aiConversationNew: $("aiConversationNew"),
    aiConversationSend: $("aiConversationSend"),
    aiConversationReadiness: $("aiConversationReadiness"),
    aiConversationProposalTitle: $("aiConversationProposalTitle"),
    aiConversationProposalSubtitle: $("aiConversationProposalSubtitle"),
    aiConversationIdentityFields: $("aiConversationIdentityFields"),
    aiConversationProposalCards: $("aiConversationProposalCards"),
    aiConversationMissing: $("aiConversationMissing"),
    aiConversationWarnings: $("aiConversationWarnings"),
    aiConversationConfirmHint: $("aiConversationConfirmHint"),
    aiConversationConfirm: $("aiConversationConfirm"),
    aiConversationVoucher: $("aiConversationVoucher"),
    aiConversationResume: $("aiConversationResume"),
    tabBd: $("tabBd"),
    tabReturn: $("tabReturn"),
    tabRepeat: $("tabRepeat")
  };

  const state = {
    xrm: getXrm(),
    recordId: getRecordIdFromUrl(),
    isNew: true,
    currentTab: "details",
    obsAtual: "motorista",
    retObsAtual: "motorista",
    loading: false,
    record: null,
    passageiros: [],
    clientes: [],
    motoristas: [],
    veiculos: [],
    motoristaVeiculoAtualPorId: {},
    motoristaVeiculoAtualVeiculoIdPorId: {},
    trocasCarro: [],
    veiculoResumoPorId: {},
    vehicleOriginManual: false,
    ordensPagamento: [],
    relacoes: [],
    passengerSelectionRecency: [],
    bdPassengerPhotoDraft: null,
    selectedPassengers: [],
    scheduleDrafts: [],
    enderecoRascunho: [],
    enderecoPersonalizadoAtivo: false,
    obs: { motorista: "", interna: "", final: "", passageiro: "" },
    obsRet: { motorista: "", interna: "", final: "", passageiro: "" },
    options: {
      statusOperacao: FALLBACK.statusOperacao,
      statusFaturamento: FALLBACK.statusFaturamento,
      tipoServico: [],
      tipoVeiculo: [],
      formaPagamento: [],
      bdStatus: [],
      bdClassificacao: [],
      bdSexo: [],
      bdIdioma: [],
      bdCargo: [],
      bdTipoVeiculo: []
    },
    mockMode: false,
    passengerRowSeq: 0,
    scheduleDraftSeq: 0,
    pendingSaveContext: null,
    lastSuccessVoucher: null,
    importReview: null,
    importReviewFilter: "all",
    aiDrafts: [],
    selectedAiDraft: null,
    aiDraftFilter: "active",
    aiDraftSearch: "",
    aiDraftReview: null,
    aiDraftIdentityOverrides: {},
    aiDraftLoading: false,
    aiDraftSourceTab: "email",
    aiConversation: null,
    aiConversationSelectedService: 0,
    aiConversationReviewDirty: false,
    aiConversationThreadTouched: false,
    aiConversationLoading: false,
    aiConversationPollingTimer: null,
    aiConversationPollStartedAt: 0,
    aiConversationPollAttempts: 0,
    saveLog: [],
    draftTimer: null,
    draftRestoring: false,
    lastDraftSavedAt: null,
    draftCommonEdited: false,
    globalHistory: {
      undo: [],
      redo: [],
      pending: null
    },
    activationDraftEditState: {
      return: false,
      repeat: false
    },
    activationGuardDrafts: [],
    importDraftEditState: {
      common: false,
      retorno: false
    },
    errorLoggingInstalled: false
  };
  const customSelectRoots = new WeakMap();
  let activeCustomSelect = null;
  let customSelectSeq = 0;
  let activePassengerPreview = null;
  let passengerPreviewPositionRaf = null;
  let passengerPreviewCloseTimer = null;
  const passengerRowHoverSuppressTimers = new WeakMap();
  let passengerPickerTargetOrder = null;
  let passengerPickerSearchTimer = null;
  let passengerPickerSearchSeq = 0;
  let suppressPassengerPickerOpenOnFocus = false;
  let activePassengerEditId = "";
  let activeImportedPassengerEditRef = null;
  let activePassengerEditPhotoDraft = null;
  let passengerEditEnabled = false;
  let passengerEditStatusTimer = null;
  const passengerEditSaveTimers = new Map();
  let passengerMatchResolve = null;
  let passengerMatchCandidates = [];
  let passengerMatchContext = null;
  let clearAllFormsConfirmationResolve = null;
  let passengerPhotoPreviewResolve = null;
  let passengerPhotoPreviewPreviousFocus = null;
  let activePassengerPhotoHoverZoom = null;
  const passengerPhotoImageCache = new Map();
  const passengerPhotoFlowCache = new Map();
  let passengerPhotoConsultarFlowUrlPromise = null;
  // Cache persistente (IndexedDB) das fotos baixadas pelo flow: chave = URL + modifiedon do passageiro.
  const PASSENGER_PHOTO_IDB = { name: "tfg-foto-pax", fotos: "fotos", meta: "meta", maxEntries: 200, maxBytes: 30 * 1024 * 1024 };
  const PASSENGER_PHOTO_THUMB_MAX = 160;
  const PASSENGER_PHOTO_FLOW_CONCURRENCY = 3;
  const passengerPhotoVersionByUrl = new Map();
  const passengerPhotoFlowQueue = [];
  let passengerPhotoFlowActive = 0;
  let passengerPhotoIdbPromise = null;
  const importPassengerCreateLocks = new Map();
  const importedTrechoTimestampCache = new WeakMap();
  const IMPORT_REVIEW_HISTORY_LIMIT = 80;
  const GLOBAL_HISTORY_LIMIT = 80;
  let isRestoringImportHistory = false;
  let isRestoringGlobalHistory = false;
  let xlsxLibraryLoadPromise = null;
  let xlsxImportDragDepth = 0;
  let xlsxDropOverlayState = "";
  let contentTouchStartY = 0;
  let contentTouchPull = 0;
  let ptBrDateLocaleObserver = null;

  state.mockMode = QUERY_MOCK_MODE || state.xrm === null;

  async function init() {
    state.isNew = !state.recordId;
    syncViewportMetrics();
    setLoading(true);
    applyBrandLogo();
    enforceDocumentPtBrLocale();
    enforcePtBrDateLocale();
    installPtBrDateLocaleObserver();
    bindStaticEvents();
    populateTimeSelects();
    loadPassengerSelectionRecency();
    await loadReferenceData();
    await loadAiDrafts();
    await loadAiConversation();
    await loadCurrentRecord();
    hydrateForm();
    renderAll();
    clearDraftSnapshot(false);
    initializeCustomSelects();
    syncDateTimeFieldRowWidths();
    setLoading(false);
    if (!getValidPassengerRows().length) {
      addPassengerRow();
    } else {
      focusInitialCommonFormField();
    }
    if (state.mockMode) {
      toast(AI_CONVERSATION_LOCAL_MODE ? "Localhost ativo: a aba Agendar por IA usa o proxy DeepSeek." : "Modo local ativo: dados mock gerados para teste completo da experiência.", "warning", 7000);
      return;
    }
  }

  function getXrm() {
    const scopes = [window.parent, window, window.opener].filter(Boolean);
    for (const scope of scopes) {
      try {
        if (scope.Xrm && scope.Xrm.WebApi) return scope.Xrm;
      } catch (_) {
        continue;
      }
    }
    return null;
  }

  // Logger compartilhado (@betinhos-executive-service/ui error-logger, vendor/betinhos-error-logger.iife.js).
  // Wrapper fino: mantém o que o pacote não faz (console.error, toast de erro, registro em edição e aba atual).
  function getErrorLogger() {
    return window.BetinhosErrorLogger || null;
  }

  function installAppErrorLogging() {
    if (state.errorLoggingInstalled) return;
    state.errorLoggingInstalled = true;
    const logger = getErrorLogger();
    if (!logger) return;

    migrateLegacyErrorLogQueue();
    const codeVersion = document.getElementById("codeVersionText")?.textContent?.trim() || "";
    logger.installErrorLogger({
      appName: APP_ERROR_LOG_APP_NAME,
      appVersion: codeVersion ? `v${codeVersion}` : "",
      builtAt: window.__FORMULARIO_BUILD__?.builtAt || "",
      getScreen: () => state.currentTab || ""
    });

    const originalConsoleError = console.error?.bind(console);
    console.error = (...args) => {
      if (originalConsoleError) originalConsoleError(...args);
      void reportAppError(args[0] instanceof Error ? args[0] : args.map(describeConsoleArg).join(" | ") || "console.error", {
        source: "console.error",
        action: "console.error",
        phase: "runtime",
        severity: "error"
      });
    };
  }

  function describeConsoleArg(item) {
    if (item instanceof Error) return item.message || item.name || "Error";
    if (item && typeof item === "object") return String(item.message || item.errorMessage || item.statusText || safeJson(item));
    return String(item ?? "");
  }

  async function reportAppError(error, details = {}) {
    if (state.mockMode) return "skipped";
    const logger = getErrorLogger();
    if (!logger) return "skipped";
    return logger.logAppError(error, {
      detailId: state.recordId || "",
      detailType: state.isNew ? "novo" : "edicao",
      ...details
    });
  }

  // Fila da cópia antiga (até v1.15.10): passa os itens pendentes para a fila do pacote, que reenvia.
  function migrateLegacyErrorLogQueue() {
    try {
      const legacy = JSON.parse(localStorage.getItem(APP_ERROR_LOG_LEGACY_QUEUE_KEY) || "[]");
      localStorage.removeItem(APP_ERROR_LOG_LEGACY_QUEUE_KEY);
      if (!Array.isArray(legacy) || !legacy.length) return;
      const key = `betinhos-error-log-queue-v1:${APP_ERROR_LOG_APP_NAME}`;
      const current = JSON.parse(localStorage.getItem(key) || "[]");
      localStorage.setItem(key, JSON.stringify([...(Array.isArray(current) ? current : []), ...legacy].slice(-50)));
    } catch (_) {
      /* ignore logging storage failure */
    }
  }

  function safeJson(value) {
    try {
      return JSON.stringify(value, (_key, item) => {
        if (item instanceof Error) {
          return {
            name: item.name,
            message: item.message,
            stack: item.stack,
            code: item.code || item.errorCode || ""
          };
        }
        if (typeof item === "function") return `[Function ${item.name || "anonymous"}]`;
        return item;
      });
    } catch (error) {
      return String(value || "");
    }
  }

  function closeWebResourceToGeral() {
    clearDraftSnapshot(false);
    // Aberto em iframe pelo Sistema Betinhos (?host=shell): quem fecha é o shell, avisado por mensagem.
    if (URL_PARAMS.get("host") === "shell" && window.parent !== window) {
      window.parent.postMessage({ type: "betinhos:formulario-geral:fechar" }, window.location.origin);
      return;
    }
    const xrm = state.xrm || getXrm();
    if (xrm?.Navigation?.navigateTo) {
      setLoading(true);
      xrm.Navigation.navigateTo({
        pageType: "entitylist",
        entityName: CONFIG.entities.reserva
      }, { target: 1 }).catch((error) => {
        console.warn("Falha ao voltar para Geral", error);
        setLoading(false);
        fallbackCloseWebResource();
      });
      return;
    }
    fallbackCloseWebResource();
  }

  function fallbackCloseWebResource() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    try {
      window.close();
    } catch (_) {
      toast("Não foi possível fechar automaticamente.", "warning", 5000);
    }
  }

  function focusInitialCommonFormField() {
    if (state.currentTab !== "details" || !el.saidaData || el.saidaData.disabled) return;
    window.setTimeout(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      focusField(el.saidaData);
    }, 0);
  }

  function getRecordIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const direct = getUrlParam(params, ["id", "recordId", "recordid", "entityId", "entityid", "ids", "recordIds", "selectedIds"]);
    if (direct) return findGuidInValue(direct) || cleanGuid(direct);
    const data = getUrlParam(params, ["data"]);
    if (!data) return getRecordIdFromHostContext();
    const directGuid = findGuidInValue(data);
    if (directGuid) return directGuid;
    try {
      const decoded = parseLaunchDataParam(data);
      return findRecordIdInLaunchData(decoded) || getRecordIdFromHostContext();
    } catch (_) {
      return getRecordIdFromHostContext();
    }
  }

  function getUrlParam(params, names) {
    for (const name of names) {
      const exact = params.get(name);
      if (exact) return exact;
    }
    const wanted = new Set(names.map((name) => name.toLowerCase()));
    for (const [key, value] of params.entries()) {
      if (wanted.has(String(key).toLowerCase()) && value) return value;
    }
    return "";
  }

  function parseLaunchDataParam(data) {
    const raw = String(data || "");
    const candidates = [raw];
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded && decoded !== raw) candidates.push(decoded);
    } catch (_) {
    }
    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch (_) {
      }
    }
    return raw;
  }

  function findRecordIdInLaunchData(value) {
    if (!value) return "";
    if (typeof value === "string") return findGuidInValue(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findRecordIdInLaunchData(item);
        if (found) return found;
      }
      return "";
    }
    if (typeof value !== "object") return "";

    const priorityKeys = [
      "id",
      "Id",
      "recordId",
      "recordid",
      "recordID",
      "entityId",
      "entityid",
      "ids",
      "recordIds",
      "selectedIds",
      "selectedItemIds",
      "selectedItemReferences",
      "SelectedItemReferences"
    ];
    for (const key of priorityKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const found = findRecordIdInLaunchData(value[key]);
        if (found) return found;
      }
    }
    for (const item of Object.values(value)) {
      const found = findRecordIdInLaunchData(item);
      if (found) return found;
    }
    return "";
  }

  function findGuidInValue(value) {
    const match = String(value || "").match(/[({]?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[)}]?/i);
    return match ? cleanGuid(match[0]) : "";
  }

  function getRecordIdFromHostContext() {
    const scopes = [window, window.parent, window.top, window.opener].filter(Boolean);
    for (const scope of scopes) {
      try {
        const formId = scope.Xrm?.Page?.data?.entity?.getId?.();
        const cleanFormId = findGuidInValue(formId);
        if (cleanFormId) return cleanFormId;

        const pageContext = scope.Xrm?.Utility?.getPageContext?.();
        const contextId = findRecordIdInLaunchData(pageContext?.input || pageContext);
        if (contextId) return contextId;
      } catch (_) {
      }
    }
    return "";
  }

  function shouldAutofocusSearchInputs() {
    try {
      const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches;
      const noHover = window.matchMedia?.("(hover: none)")?.matches;
      if (coarsePointer || noHover) return false;
    } catch (_) {
    }
    return true;
  }

  function shouldOpenCustomSelectOnFocus(select) {
    if (shouldKeepCustomSelectClosedOnFocus(select)) return false;
    return shouldAutofocusSearchInputs();
  }

  function isMobilePassengerPreviewDisabled() {
    try {
      const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches;
      const noHover = window.matchMedia?.("(hover: none)")?.matches;
      const mobileWidth = window.matchMedia?.("(max-width: 760px)")?.matches;
      return !!(coarsePointer || noHover || mobileWidth);
    } catch (_) {
      return currentViewportMetrics().width <= 760;
    }
  }

  function currentViewportMetrics() {
    const visual = window.visualViewport;
    const width = Math.floor(visual?.width || window.innerWidth || document.documentElement.clientWidth || 0);
    const height = Math.floor(visual?.height || window.innerHeight || document.documentElement.clientHeight || 0);
    const offsetLeft = Math.floor(visual?.offsetLeft || 0);
    const offsetTop = Math.floor(visual?.offsetTop || 0);
    return { width, height, offsetLeft, offsetTop };
  }

  function syncViewportMetrics() {
    const metrics = currentViewportMetrics();
    if (metrics.height > 0) {
      document.documentElement.style.setProperty("--app-viewport-height", `${metrics.height}px`);
    }
    document.documentElement.classList.toggle("is-ios-viewport", /iPad|iPhone|iPod/.test(navigator.userAgent || ""));
    repositionOpenCustomSelectPanels();
    repositionPassengerPreview();
  }

  function resolveEnvironmentBaseUrl() {
    if (state.xrm?.Utility?.getGlobalContext) {
      try {
        return state.xrm.Utility.getGlobalContext().getClientUrl();
      } catch (_) {
      }
    }
    const origin = window.location.origin || "";
    if (/^https:\/\/[^/]+\.crm\d*\.dynamics\.com$/i.test(origin)) return origin;
    return "";
  }

  function buildBrandLogoUrl() {
    const baseUrl = resolveEnvironmentBaseUrl();
    return baseUrl ? `${baseUrl}/WebResources/${BRAND_LOGO_WEBRESOURCE}` : "";
  }

  function applyBrandLogo() {
    const logo = el.brandLogo;
    if (!logo) return;
    const logoUrl = buildBrandLogoUrl();
    if (!logoUrl) return;

    logo.hidden = false;
    logo.src = logoUrl;
    logo.addEventListener("error", () => {
      logo.hidden = true;
    }, { once: true });
  }

  function cleanGuid(value) {
    return String(value || "").replace(/[{}]/g, "").trim();
  }

  function loadPassengerSelectionRecency() {
    const stored = readPassengerSelectionRecency();
    state.passengerSelectionRecency = stored;
  }

  function readPassengerSelectionRecency() {
    try {
      const raw = window.localStorage.getItem(PASSENGER_RECENCY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      const normalized = parsed.map((item) => cleanGuid(item).toLowerCase()).filter(Boolean);
      return Array.from(new Set(normalized)).slice(0, 20);
    } catch (_) {
      return [];
    }
  }

  function persistPassengerSelectionRecency() {
    try {
      window.localStorage.setItem(PASSENGER_RECENCY_KEY, JSON.stringify(state.passengerSelectionRecency));
    } catch (_) {
      // noop
    }
  }

  function touchPassengerSelectionRecency(passengerId) {
    const id = cleanGuid(passengerId).toLowerCase();
    if (!id) return;
    const recents = state.passengerSelectionRecency.filter((item) => item !== id);
    recents.unshift(id);
    state.passengerSelectionRecency = recents.slice(0, 20);
    persistPassengerSelectionRecency();
  }

  function getPassengerSelectionRecencyIndex(passengerId) {
    const id = cleanGuid(passengerId).toLowerCase();
    if (!id) return Number.MAX_SAFE_INTEGER;
    const index = state.passengerSelectionRecency.indexOf(id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  }

  function hydratePassengerSelectionRecencyFromRows(rows) {
    if (!Array.isArray(rows)) return;
    rows.forEach((row) => {
      touchPassengerSelectionRecency(row?.guid);
    });
  }

  function handleTextareaResizePointerDown(event) {
    const target = event.target?.closest?.("textarea, .passenger-address");
    if (!target || target.disabled || target.readOnly) return;
    if (event.pointerType === "mouse") return;
    if (window.matchMedia && !window.matchMedia("(pointer: coarse)").matches) return;

    const rect = target.getBoundingClientRect();
    const resizeZone = 22;
    if ((rect.bottom - event.clientY) > resizeZone) return;

    event.preventDefault();
    const computed = window.getComputedStyle(target);
    const minHeight = parseFloat(computed.minHeight) || 48;
    const maxHeight = Math.max(minHeight, Math.floor(window.innerHeight * 0.72));
    const startY = event.clientY;
    const startHeight = rect.height;
    target.classList.add("is-touch-resizing");
    target.style.height = `${Math.round(startHeight)}px`;

    const move = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      moveEvent.preventDefault();
      const nextHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + moveEvent.clientY - startY));
      target.style.height = `${Math.round(nextHeight)}px`;
    };
    const stop = (upEvent) => {
      if (upEvent.pointerId !== event.pointerId) return;
      target.classList.remove("is-touch-resizing");
      document.removeEventListener("pointermove", move, { capture: true });
      document.removeEventListener("pointerup", stop, { capture: true });
      document.removeEventListener("pointercancel", stop, { capture: true });
    };

    document.addEventListener("pointermove", move, { capture: true, passive: false });
    document.addEventListener("pointerup", stop, { capture: true });
    document.addEventListener("pointercancel", stop, { capture: true });
  }

  function bindStaticEvents() {
    el.tabs.forEach((button) => {
      button?.addEventListener("click", () => setTab(button.dataset.tab));
    });
    document.addEventListener("pointerdown", handleTextareaResizePointerDown, { capture: true, passive: false });
    el.generateVoucher?.addEventListener("click", openSuccessVoucher);
    el.closeSuccess?.addEventListener("click", closeWebResourceToGeral);
    el.closeRwButton?.addEventListener("click", closeWebResourceToGeral);
    el.saveButton?.addEventListener("click", saveForm);
    el.globalImportHistoryActions?.addEventListener("click", handleGlobalImportHistoryAction);
    el.importXlsxButton?.addEventListener("click", openXlsxImportPicker);
    el.aiDraftRefresh?.addEventListener("click", loadAiDrafts);
    el.aiDraftSearch?.addEventListener("input", (event) => { state.aiDraftSearch = event.target.value || ""; renderAiDrafts(); });
    el.aiDraftStatusFilter?.addEventListener("change", (event) => { state.aiDraftFilter = event.target.value || "active"; renderAiDrafts(); });
    el.aiDraftSeed?.addEventListener("click", seedMockAiDrafts);
    el.aiDraftList?.addEventListener("click", handleAiDraftListClick);
    el.aiDraftFields?.addEventListener("change", handleAiDraftCandidateChange);
    el.aiDraftCandidates?.addEventListener("change", handleAiDraftCandidateChange);
    [el.aiDraftSourceEmailTab, el.aiDraftSourceAlertsTab].forEach((tab) => tab?.addEventListener("click", () => setAiDraftSourceTab(tab.dataset.aiSourceTab)));
    el.aiDraftApprove?.addEventListener("click", approveSelectedAiDraft);
    el.aiDraftOpenForm?.addEventListener("click", openSelectedAiDraftInForm);
    el.aiDraftResume?.addEventListener("click", resumeSelectedAiDraft);
    el.aiDraftDiscard?.addEventListener("click", discardSelectedAiDraft);
    el.aiConversationRefresh?.addEventListener("click", loadAiConversation);
    el.aiConversationToggle?.addEventListener("click", () => {
      state.aiConversationThreadTouched = true;
      const open = el.aiConversationThread.hidden;
      el.aiConversationThread.hidden = !open;
      el.aiConversationToggle.setAttribute("aria-expanded", String(open));
      el.aiConversationToggle.firstChild.textContent = open ? "Ocultar conversa " : "Ver conversa ";
    });
    el.aiConversationInput?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      if (!state.aiConversationLoading) submitAiConversationInput();
    });
    el.aiConversationServiceList?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-ai-service-index]");
      if (!button) return;
      state.aiConversationSelectedService = Number(button.dataset.aiServiceIndex);
      renderAiConversation();
    });
    el.aiConversationProposalCards?.addEventListener("change", updateAiConversationField);
    el.aiConversationProposalCards?.addEventListener("input", updateAiConversationField);
    el.aiConversationIdentityFields?.addEventListener("change", updateAiConversationIdentity);
    el.aiConversationSave?.addEventListener("click", saveAiConversationReview);
    el.aiConversationNew?.addEventListener("click", startNewAiConversation);
    el.aiConversationStartOver?.addEventListener("click", startNewAiConversation);
    el.aiConversationSend?.addEventListener("click", submitAiConversationInput);
    el.aiConversationConfirm?.addEventListener("click", confirmAiConversation);
    el.aiConversationVoucher?.addEventListener("click", openAiConversationVoucher);
    el.aiConversationResume?.addEventListener("click", resumeAiConversation);
    el.aiConversationMissing?.addEventListener("click", openAiRegistrationProposal);
    el.xlsxImportInput?.addEventListener("change", handleXlsxImportFile);
    document.addEventListener("dragenter", handleXlsxImportDragEnter);
    document.addEventListener("dragover", handleXlsxImportDragOver);
    document.addEventListener("dragleave", handleXlsxImportDragLeave);
    document.addEventListener("drop", handleXlsxImportDrop);
    el.importReviewStats?.addEventListener("click", handleImportReviewFilterAction);
    el.importReviewPrograms?.addEventListener("click", handleImportFieldCopy);
    el.importReviewPrograms?.addEventListener("click", handleImportReviewAction);
    el.importReviewPrograms?.addEventListener("keydown", handleImportReviewKeyboardNavigation);
    el.importReviewPrograms?.addEventListener("input", handleImportReviewInput);
    el.importReviewPrograms?.addEventListener("change", handleImportReviewInput);
    el.importReviewPrograms?.addEventListener("focusout", handleImportReviewFocusOut);
    el.importReviewPrograms?.addEventListener("pointerover", handlePassengerPreviewEnter);
    el.importReviewPrograms?.addEventListener("pointerout", handlePassengerPreviewLeave);
    el.importReviewPrograms?.addEventListener("focusin", handlePassengerPreviewFocusIn);
    el.importReviewPrograms?.addEventListener("focusout", handlePassengerPreviewFocusOut);
    document.addEventListener("keydown", handleImportHistoryShortcut);
    el.createPassenger?.addEventListener("click", createPassenger);
    el.passengerEditToggle?.addEventListener("click", togglePassengerEditMode);
    bindLinkCadastro();
    el.passengerEditClose?.addEventListener("click", closePassengerEditPopup);
    el.passengerEditOverlay?.addEventListener("click", (event) => {
      if (event.target === el.passengerEditOverlay) {
        closePassengerEditPopup();
      }
    });
    el.passengerMatchCancel?.addEventListener("click", () => resolvePassengerMatchReview({ action: "cancel" }));
    el.passengerMatchContinue?.addEventListener("click", () => resolvePassengerMatchReview({ action: "continue" }));
    el.passengerMatchUseSelected?.addEventListener("click", () => {
      const passengerId = passengerMatchContext?.selectedPassengerId || "";
      if (!passengerId) return;
      resolvePassengerMatchReview({ action: "use-existing", passengerId });
    });
    el.passengerMatchList?.addEventListener("click", handlePassengerMatchListAction);
    el.passengerMatchList?.addEventListener("keydown", handlePassengerMatchListAction);
    el.passengerMatchOverlay?.addEventListener("click", (event) => {
      if (event.target === el.passengerMatchOverlay) {
        resolvePassengerMatchReview({ action: "cancel" });
      }
    });
    el.passengerMatchOverlay?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || el.passengerMatchOverlay.hidden) return;
      resolvePassengerMatchReview({ action: "cancel" });
    });
    el.activationGuardReview?.addEventListener("click", () => resolveActivationGuard("review"));
    el.activationGuardSkip?.addEventListener("click", () => resolveActivationGuard("skip"));
    el.activationGuardActivate?.addEventListener("click", () => resolveActivationGuard("activate"));
    el.receberGuardReview?.addEventListener("click", () => resolveReceberGuard(false));
    el.receberGuardConfirm?.addEventListener("click", () => resolveReceberGuard(true));
    el.receberGuardOverlay?.addEventListener("click", (event) => {
      if (event.target === el.receberGuardOverlay) resolveReceberGuard(false);
    });
    el.receberGuardOverlay?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || el.receberGuardOverlay.hidden) return;
      resolveReceberGuard(false);
    });
    el.returnReceiveScopeReview?.addEventListener("click", () => resolveReturnReceiveScope("review"));
    el.returnReceiveScopeLast?.addEventListener("click", () => resolveReturnReceiveScope("last"));
    el.returnReceiveScopeAll?.addEventListener("click", () => resolveReturnReceiveScope("all"));
    el.clearAllFormsCancel?.addEventListener("click", () => resolveClearAllFormsConfirmation(false));
    el.clearAllFormsConfirm?.addEventListener("click", () => resolveClearAllFormsConfirmation(true));
    el.passengerPhotoPreviewOk?.addEventListener("click", () => resolvePassengerPhotoPreview(true));
    el.passengerPhotoPreviewCancel?.addEventListener("click", () => resolvePassengerPhotoPreview(false));
    el.activationGuardOverlay?.addEventListener("click", (event) => {
      if (event.target === el.activationGuardOverlay) {
        resolveActivationGuard("review");
      }
    });
    el.returnReceiveScopeOverlay?.addEventListener("click", (event) => {
      if (event.target === el.returnReceiveScopeOverlay) {
        resolveReturnReceiveScope("review");
      }
    });
    el.clearAllFormsOverlay?.addEventListener("click", (event) => {
      if (event.target === el.clearAllFormsOverlay) {
        resolveClearAllFormsConfirmation(false);
      }
    });
    el.passengerPhotoPreviewOverlay?.addEventListener("click", (event) => {
      if (event.target === el.passengerPhotoPreviewOverlay) {
        resolvePassengerPhotoPreview(false);
      }
    });
    el.activationGuardOverlay?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || el.activationGuardOverlay.hidden) return;
      resolveActivationGuard("review");
    });
    el.returnReceiveScopeOverlay?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || el.returnReceiveScopeOverlay.hidden) return;
      resolveReturnReceiveScope("review");
    });
    el.clearAllFormsOverlay?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || el.clearAllFormsOverlay.hidden) return;
      resolveClearAllFormsConfirmation(false);
    });
    el.passengerPhotoPreviewOverlay?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || el.passengerPhotoPreviewOverlay.hidden) return;
      resolvePassengerPhotoPreview(false);
    });
    el.passengerEditFields?.addEventListener("input", handlePassengerEditInput);
    el.passengerEditFields?.addEventListener("change", handlePassengerEditInput);
    const markPassengerEditEmptySignals = () => requestAnimationFrame(applyPassengerEditEmptySignals);
    el.passengerEditFields?.addEventListener("input", markPassengerEditEmptySignals);
    el.passengerEditFields?.addEventListener("change", markPassengerEditEmptySignals);
    el.passengerEditFields?.addEventListener("click", (event) => {
      if (event.target.closest(".custom-select-option") || event.target.closest(".custom-select-search")) {
        setTimeout(markPassengerEditEmptySignals, 0);
      }
    });
    const passengerEditObserver = new MutationObserver(() => {
      if (!el.passengerEditOverlay.hidden) markPassengerEditEmptySignals();
    });
    const passengerEditFieldsObserver = new MutationObserver(() => {
      if (!el.passengerEditOverlay.hidden) markPassengerEditEmptySignals();
    });
    passengerEditObserver.observe(el.passengerEditOverlay, { attributes: true, attributeFilter: ["hidden"] });
    passengerEditFieldsObserver.observe(el.passengerEditFields, { childList: true, subtree: true });
    markPassengerEditEmptySignals();
    el.addPassenger?.addEventListener("click", addPassengerRow);
    el.passengerEmpty?.addEventListener("click", addPassengerRow);
    el.bdPhotoDrop?.addEventListener("click", handleBdPassengerPhotoBlockClick);
    el.bdPhotoDrop?.addEventListener("keydown", handleBdPassengerPhotoBlockKeydown);
    el.bdPhotoInput?.addEventListener("change", handleBdPassengerPhotoFileChange);
    el.bdPhotoClear?.addEventListener("click", clearBdPassengerPhotoDraft);
    document.addEventListener("paste", handlePassengerPhotoGlobalPaste);
    el.bdPhotoDrop?.addEventListener("dragover", handlePassengerPhotoDragOver);
    el.bdPhotoDrop?.addEventListener("dragleave", handlePassengerPhotoDragLeave);
    el.bdPhotoDrop?.addEventListener("drop", handleBdPassengerPhotoDrop);
    el.passengerEditFields?.addEventListener("click", handlePassengerEditPhotoAction);
    el.passengerEditFields?.addEventListener("pointerover", handlePassengerEditPhotoHover);
    el.passengerEditFields?.addEventListener("pointerout", handlePassengerEditPhotoHoverLeave);
    el.passengerEditFields?.addEventListener("change", handlePassengerEditPhotoFileChange);
    el.passengerRows?.addEventListener("pointerdown", handlePassengerRowPointerDown);
    el.passengerRows?.addEventListener("click", handlePassengerRowAction);
    el.passengerRows?.addEventListener("input", handlePassengerRowInput);
    el.passengerRows?.addEventListener("pointerover", handlePassengerPreviewEnter);
    el.passengerRows?.addEventListener("pointerout", handlePassengerPreviewLeave);
    el.passengerRows?.addEventListener("focusin", handlePassengerPreviewFocusIn);
    el.passengerRows?.addEventListener("focusout", handlePassengerPreviewFocusOut);
    el.passengerPickerClose?.addEventListener("click", closePassengerPicker);
    el.passengerPickerCreateShortcut?.addEventListener("click", openPassengerCreateShortcut);
    el.passengerPickerCancel?.addEventListener("click", closePassengerPicker);
    el.passengerPickerOverlay?.addEventListener("click", (event) => {
      if (event.target === el.passengerPickerOverlay) {
        closePassengerPicker();
      }
    });
    el.passengerPickerSearch?.addEventListener("input", schedulePassengerPickerSearch);
    el.passengerPickerSearch?.addEventListener("keydown", handlePassengerPickerKeydown);
    el.passengerPickerResults?.addEventListener("click", handlePassengerPickerAction);
    el.passengerPickerResults?.addEventListener("keydown", handlePassengerPickerKeydown);
    el.addPassenger?.addEventListener("focus", () => {
      if (suppressPassengerPickerOpenOnFocus || el.addPassenger.disabled) return;
      addPassengerRow();
    });
    el.toggleEnderecoPersonalizado?.addEventListener("click", toggleEnderecoPersonalizado);
    el.cliente?.addEventListener("change", () => {
      applyStatusFaturamentoDefault();
      renderStatusFaturamento();
    });
    el.motorista?.addEventListener("change", () => {
      renderMotoristaVehicleHint();
      clearAutomaticVehicleOnMotoristaChange();
    });
    el.veiculo?.addEventListener("change", markVehicleManual);
    el.destino?.addEventListener("input", syncReturnDefaults);
    el.retornoEndereco?.addEventListener("input", () => {
      el.retornoEndereco.dataset.auto = "0";
    });
    el.retornoDestino?.addEventListener("input", () => {
      el.retornoDestino.dataset.auto = "0";
    });
    el.enderecoPersonalizado?.addEventListener("input", () => {
      state.customAddressText = el.enderecoPersonalizado.value;
    });
    el.agendarRetorno?.addEventListener("change", () => {
      syncReturnDefaults();
      renderTabBadges();
    });
    el.repetirServico?.addEventListener("change", renderTabBadges);
    el.saidaData?.addEventListener("change", () => {
      syncLegacyTimePartsFromDateTime(el.saidaData, el.saidaHora, el.saidaMinuto);
      syncRepeatDefaultDates();
      syncReturnDefaults();
      renderMotoristaVehicleHint();
      clearAutomaticVehicleOnMotoristaChange();
    });
    el.retornoData?.addEventListener("change", () => {
      syncLegacyTimePartsFromDateTime(el.retornoData, el.retornoHora, el.retornoMinuto);
    });
    el.retPrevDateTime?.addEventListener("change", () => {
      syncLegacyTimePartsFromDateTime(el.retPrevDateTime, el.retPrevHora, el.retPrevMinuto);
    });
    document.querySelectorAll("[data-obs]").forEach((button) => {
      button?.addEventListener("click", () => switchObs(button.dataset.obs, false));
    });
    document.querySelectorAll("[data-ret-obs]").forEach((button) => {
      button?.addEventListener("click", () => switchObs(button.dataset.retObs, true));
    });
    document?.addEventListener("click", handleGlobalCustomSelectClick);
    document?.addEventListener("focusin", handleGlobalCustomSelectFocusIn);
    document?.addEventListener("keydown", handleGlobalCustomSelectKeydown);
    document?.addEventListener("scroll", handleGlobalCustomSelectScroll, { capture: true });
    document?.addEventListener("scroll", repositionPassengerPreview, { capture: true });
    window?.addEventListener("resize", repositionOpenCustomSelectPanels);
    window?.addEventListener("resize", repositionPassengerPreview);
    window?.addEventListener("resize", syncPassengerNameColumnWidth);
    window?.addEventListener("resize", syncDateTimeFieldRowWidths);
    window?.addEventListener("resize", syncViewportMetrics);
    window.visualViewport?.addEventListener("resize", syncViewportMetrics);
    window.visualViewport?.addEventListener("scroll", syncViewportMetrics);
    bindContentScrollBoundaryFeedback();
    bindInputFormatters();
    const appRoot = $("app");
    appRoot?.addEventListener("focusin", handleGlobalHistoryBeforeChange, true);
    appRoot?.addEventListener("pointerdown", handleGlobalHistoryBeforeChange, true);
    appRoot?.addEventListener("keydown", handleCommonFormTabNavigation, true);
    appRoot?.addEventListener("keydown", handleGlobalHistoryBeforeChange, true);
    appRoot?.addEventListener("input", handleOperationalInput);
    appRoot?.addEventListener("change", handleOperationalInput);
  }

  function bindContentScrollBoundaryFeedback() {
    const scroller = el.content;
    if (!scroller || scroller.dataset.scrollBoundaryFeedback === "1") return;
    scroller.dataset.scrollBoundaryFeedback = "1";

    scroller.addEventListener("touchstart", (event) => {
      contentTouchStartY = event.touches?.[0]?.clientY || 0;
      contentTouchPull = 0;
    }, { passive: true });

    scroller.addEventListener("touchmove", (event) => {
      const currentY = event.touches?.[0]?.clientY || contentTouchStartY;
      const deltaY = currentY - contentTouchStartY;
      if (deltaY < -8 && isScrollAtEnd(scroller)) {
        contentTouchPull = Math.max(contentTouchPull, Math.abs(deltaY));
        triggerContentScrollStretch("end", contentTouchPull);
      } else if (deltaY > 8 && isScrollAtStart(scroller)) {
        contentTouchPull = Math.max(contentTouchPull, deltaY);
        triggerContentScrollStretch("start", contentTouchPull);
      }
    }, { passive: true });

    scroller.addEventListener("touchend", resetContentScrollStretch, { passive: true });
    scroller.addEventListener("touchcancel", resetContentScrollStretch, { passive: true });
  }

  function isScrollAtStart(scroller) {
    return scroller.scrollTop <= 1;
  }

  function isScrollAtEnd(scroller) {
    return scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
  }

  function triggerContentScrollStretch(position, force = 24) {
    const scroller = el.content;
    if (!scroller) return;
    const pull = Math.min(1, Math.max(0.18, Math.abs(force) / 180));
    const distance = Math.round(4 + pull * 13);
    const scale = (1 + pull * 0.026).toFixed(3);
    scroller.classList.add("is-scroll-stretching");
    scroller.style.setProperty("--scroll-stretch-y", `${position === "start" ? distance : -distance}px`);
    scroller.style.setProperty("--scroll-stretch-scale", scale);
    scroller.style.setProperty("--scroll-stretch-origin", position === "start" ? "top" : "bottom");
  }

  function resetContentScrollStretch() {
    const scroller = el.content;
    if (!scroller) return;
    contentTouchPull = 0;
    scroller.classList.remove("is-scroll-stretching");
    scroller.style.setProperty("--scroll-stretch-y", "0px");
    scroller.style.setProperty("--scroll-stretch-scale", "1");
  }

  function bindInputFormatters() {
    bindPhoneInput(el.bdTelefone);
    bindFormattedInput(el.bdEmail, normalizeEmail);
    bindFormattedInput(el.bdCr, normalizeCodeValue);
    bindFormattedInput(el.cr, normalizeCodeValue);
    bindCurrencyInput(el.cotacao);
    bindCurrencyInput(el.valorReceber);
    document.querySelectorAll("input[id*='cpf' i], input[name*='cpf' i]").forEach((input) => {
      bindFormattedInput(input, formatCpf);
      input.addEventListener("blur", () => {
        if (input.value.trim() && !isValidCpf(input.value)) {
          revealInvalidField(input, "CPF invalido.");
        } else {
          clearFieldValidation(input);
        }
      });
    });
    el.bdEmail?.addEventListener("blur", () => validateEmailControl(el.bdEmail, { tab: "bd" }));
  }

  function bindPhoneInput(input) {
    if (!input || input.dataset.phoneReady === "1") return;
    input.dataset.phoneReady = "1";
    input.addEventListener("input", () => {
      const next = formatPhoneNumber(input.value);
      if (input.value !== next) input.value = next;
      clearFieldValidation(input);
    });
    input.addEventListener("blur", () => {
      input.value = formatPhoneNumber(input.value);
      validatePhoneControl(input);
    });
  }

  function bindFormattedInput(input, formatter) {
    if (!input || input.dataset.formatterReady === "1") return;
    input.dataset.formatterReady = "1";
    input.addEventListener("input", () => {
      const next = formatter(input.value);
      if (input.value !== next) input.value = next;
    });
    input.addEventListener("blur", () => {
      const next = formatter(input.value);
      if (input.value !== next) input.value = next;
    });
  }

  function bindCurrencyInput(input) {
    if (!input || input.dataset.currencyReady === "1") return;
    input.dataset.currencyReady = "1";
    input.addEventListener("input", () => {
      const next = sanitizeCurrencyInput(input.value);
      if (input.value !== next) input.value = next;
    });
    input.addEventListener("blur", () => {
      input.value = formatCurrencyDisplayValue(input.value);
    });
  }

  function addClassIfPresent(node, className) {
    const token = String(className || "").trim();
    if (node?.classList && token) node.classList.add(token);
  }

  function initializeCustomSelects() {
    document.querySelectorAll("select").forEach((select) => {
      if (select.hidden || select.dataset.nativeSelect === "true") return;
      ensureCustomSelect(select);
      refreshCustomSelect(select);
    });
  }

  function ensureCustomSelect(select) {
    if (!select || select.tagName !== "SELECT" || select.hidden || select.dataset.nativeSelect === "true" || select.dataset.customSelectReady === "1") return;
    const wrapper = document.createElement("div");
    wrapper.className = "custom-select";
    addClassIfPresent(wrapper, `custom-select--${select.dataset.selectVariant || ""}`);

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "custom-select-trigger";
    trigger.setAttribute("aria-expanded", "false");

    const triggerText = document.createElement("span");
    triggerText.className = "custom-select-value";

    const clearButton = document.createElement("span");
    clearButton.role = "button";
    clearButton.tabIndex = -1;
    clearButton.className = "custom-select-clear";
    clearButton.setAttribute("aria-label", "Limpar seleção");
    clearButton.hidden = true;

    const triggerCaret = document.createElement("span");
    triggerCaret.className = "custom-select-caret";
    trigger.append(triggerText, clearButton, triggerCaret);

    const panel = document.createElement("div");
    panel.className = "custom-select-panel";
    addClassIfPresent(panel, `custom-select-panel--${select.dataset.selectVariant || ""}`);
    if (select.closest(".status-select")) {
      panel.classList.add("is-status");
    }
    panel.setAttribute("role", "listbox");
    if (select.multiple) panel.setAttribute("aria-multiselectable", "true");
    panel.dataset.customSelectPanel = "";
    panel.tabIndex = -1;

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "custom-select-search";
    searchInput.placeholder = "Pesquisar";
    searchInput.autocomplete = "off";
    searchInput.spellcheck = false;
    searchInput.tabIndex = -1;
    searchInput.setAttribute("aria-label", "Pesquisar opção");

    const optionsContainer = document.createElement("div");
    optionsContainer.className = "custom-select-options";

    const noResults = document.createElement("div");
    noResults.className = "custom-select-no-results";
    noResults.textContent = "Nenhuma opção encontrada";
    noResults.hidden = true;
    noResults.setAttribute("aria-live", "polite");

    const parent = select.parentNode;
    if (!parent) return;

    customSelectSeq += 1;
    panel.id = `custom-options-${customSelectSeq}`;
    trigger.setAttribute("aria-controls", panel.id);

    select.classList.add("custom-select-native");
    select.dataset.customSelectReady = "1";
    select.tabIndex = -1;
    parent.insertBefore(wrapper, select);
    wrapper.append(select, trigger, panel);

    const state = {
      select,
      wrapper,
      trigger,
      triggerText,
      clearButton,
      panel,
      searchInput,
      optionsContainer,
      noResults,
      suppressOpenOnFocus: false
    };
    customSelectRoots.set(select, state);

    const onNativeChange = () => refreshCustomSelect(select);
    select?.addEventListener("change", onNativeChange);

    trigger?.addEventListener("pointerdown", () => {
      state.suppressOpenOnFocus = true;
      window.setTimeout(() => {
        state.suppressOpenOnFocus = false;
      }, 0);
    });

    trigger?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (select.disabled) return;
      toggleCustomSelect(select);
    });

    trigger?.addEventListener("focus", () => {
      if (state.suppressOpenOnFocus) return;
      if (select.disabled || !shouldOpenCustomSelectOnFocus(select)) return;
      openCustomSelect(select, { focusSearch: true, focusTrigger: false });
    });

    trigger?.addEventListener("keydown", (event) => {
      if (event.key === "Tab") {
        closeCustomSelect(select);
        return;
      }
      if (event.key === " " || event.key === "Enter" || event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        if (!select.disabled) {
          openCustomSelect(select, { focusSearch: false });
          if (event.key === "ArrowDown") focusCustomSelectOption(select, "next");
        }
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        if (!select.disabled) {
          openCustomSelect(select, { focusSearch: false });
          focusCustomSelectOption(select, "previous");
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeCustomSelect(select);
      }
    });

    clearButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearCustomSelectValue(select);
    });

    clearButton?.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        clearCustomSelectValue(select);
      }
    });

    searchInput?.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    searchInput?.addEventListener("input", () => {
      renderCustomSelectOptions(select, state.searchInput.value);
    });

    searchInput?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCustomSelect(select);
      }
      if (event.key === "Tab") {
        event.preventDefault();
        closeCustomSelect(select);
        focusAdjacentFormControl(state.trigger, event.shiftKey ? -1 : 1);
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        focusCustomSelectOption(select, event.key === "ArrowDown" ? "next" : "previous");
        return;
      }
      if (event.key === "Enter") {
        const active = state.optionsContainer.querySelector(".custom-select-option.is-active")
          || state.optionsContainer.querySelector(".custom-select-option");
        if (active) {
          event.preventDefault();
          active.click();
        }
      }
    });

    panel.append(searchInput, optionsContainer, noResults);

    refreshCustomSelect(select);
  }

  function refreshCustomSelect(select) {
    const state = customSelectRoots.get(select);
    if (!state) return;

    const { select: nativeSelect, triggerText, trigger, clearButton, panel } = state;
    const options = Array.from(nativeSelect.options || []);
    const selectedOption = options.find((option) => option.value === nativeSelect.value)
      || options.find((option) => option.selected)
      || options[0];

    const selectedOptions = nativeSelect.multiple ? options.filter((option) => option.selected) : [];
    if (nativeSelect.multiple) {
      triggerText.textContent = selectedOptions.length
        ? selectedOptions.map((option) => option.textContent.trim()).join(", ")
        : nativeSelect.dataset.placeholderLabel || "Selecione";
    } else setCustomSelectTriggerDisplay(triggerText, selectedOption, nativeSelect);
    trigger.removeAttribute("title");
    triggerText.classList.toggle("is-placeholder", nativeSelect.multiple ? !selectedOptions.length : !selectedOption || selectedOption.value === "");
    if (clearButton) {
      clearButton.hidden = !isCustomSelectClearable(nativeSelect);
    }
    trigger.disabled = nativeSelect.disabled;
    if (state.wrapper.classList.contains("is-open")) {
      renderCustomSelectOptions(select, state.searchInput?.value || "");
    } else {
      state.optionsContainer.textContent = "";
      state.noResults.hidden = true;
      panel.classList.remove("is-empty");
    }
    panel.classList.toggle("is-disabled", nativeSelect.disabled);
    syncReturnPreviewTimeSelectWidths(nativeSelect);
  }

  function renderCustomSelectOptions(select, filterValue = "") {
    const state = customSelectRoots.get(select);
    if (!state) return;

    const {
      panel,
      optionsContainer,
      noResults,
      triggerText,
      select: nativeSelect
    } = state;

    const options = Array.from(nativeSelect.options || []).filter((option) => shouldRenderCustomSelectOption(option));
    const query = normalize(filterValue).trim();
    optionsContainer.innerHTML = "";
    noResults.hidden = true;

    const normalizedSelectedValue = String(nativeSelect.value || "");
    const hasMatches = options.some((option) => {
      const optionText = normalize(`${option.textContent || ""} ${option.dataset.search || ""}`);
      if (!query) return true;
      if (!optionText) return false;
      return searchableTextMatches(optionText, query);
    });

    if (!hasMatches) {
      panel.classList.add("is-empty");
      noResults.hidden = false;
      return;
    }

    panel.classList.remove("is-empty");
    options.forEach((option) => {
      const optionText = option.textContent;
      const normalizedOptionText = normalize(`${optionText} ${option.dataset.search || ""}`);
      if (query && !searchableTextMatches(normalizedOptionText, query)) return;

      const button = document.createElement("button");
      button.type = "button";
      button.tabIndex = -1;
      button.role = "option";
      button.className = "custom-select-option";
      addClassIfPresent(button, `custom-select-option--${nativeSelect.dataset.selectVariant || ""}`);
      button.dataset.value = option.value || "";
      renderCustomSelectOptionContent(button, option);
      if (nativeSelect.multiple ? option.selected : String(option.value) === normalizedSelectedValue) {
        button.classList.add("is-active");
        button.setAttribute("aria-selected", "true");
      } else {
        button.setAttribute("aria-selected", "false");
      }

      button?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (nativeSelect.disabled || option.disabled) return;
        if (nativeSelect.multiple) option.selected = !option.selected;
        else nativeSelect.value = button.dataset.value;
        const eventChange = new Event("change", { bubbles: true });
        nativeSelect.dispatchEvent(eventChange);
        const eventInput = new Event("input", { bubbles: true });
        nativeSelect.dispatchEvent(eventInput);
        if (nativeSelect.multiple) {
          state.searchInput?.focus();
          return;
        }
        closeCustomSelect(nativeSelect);
        setCustomSelectTriggerDisplay(triggerText, option, nativeSelect);
        state.suppressOpenOnFocus = true;
        state.trigger?.focus();
        window.setTimeout(() => {
          state.suppressOpenOnFocus = false;
        }, 0);
      });

      button?.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          focusCustomSelectOption(nativeSelect, event.key === "ArrowDown" ? "next" : "previous");
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          button.click();
          return;
        }
        if (event.key === "Tab") {
          event.preventDefault();
          closeCustomSelect(nativeSelect);
          focusAdjacentFormControl(state.trigger, event.shiftKey ? -1 : 1);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeCustomSelect(nativeSelect);
          state.trigger?.focus();
        }
      });

      optionsContainer.appendChild(button);
    });
  }

  function shouldKeepCustomSelectClosedOnFocus(select) {
    return Boolean(select?.closest?.(".topbar, .import-review-panel, .passenger-edit-overlay"));
  }

  function focusCustomSelectOption(select, direction = "next") {
    const state = customSelectRoots.get(select);
    if (!state) return;
    const options = Array.from(state.optionsContainer.querySelectorAll(".custom-select-option"));
    if (!options.length) return;
    const currentIndex = options.indexOf(document.activeElement);
    const activeIndex = options.findIndex((item) => item.classList.contains("is-active"));
    const fallbackIndex = direction === "previous" ? options.length - 1 : 0;
    const baseIndex = currentIndex >= 0 ? currentIndex : activeIndex;
    const nextIndex = baseIndex >= 0
      ? (baseIndex + (direction === "previous" ? -1 : 1) + options.length) % options.length
      : fallbackIndex;
    options[nextIndex]?.focus();
  }

  function focusAdjacentFormControl(anchor, direction = 1) {
    const controls = getTabOrderedFormControls(anchor);
    if (!controls.length) { anchor?.focus(); return; }
    const currentIndex = controls.indexOf(anchor);
    const nextIndex = currentIndex >= 0
      ? currentIndex + direction
      : (direction > 0 ? 0 : controls.length - 1);
    const next = controls[Math.max(0, Math.min(controls.length - 1, nextIndex))];
    const target = next || anchor;
    if (target === anchor) {
      const custom = getCustomSelectState(anchor?.closest?.(".custom-select"));
      if (custom) {
        custom.suppressOpenOnFocus = true;
        window.setTimeout(() => { custom.suppressOpenOnFocus = false; }, 0);
      }
    }
    target?.focus();
  }

  function handleCommonFormTabNavigation(event) {
    if (event.key !== "Tab" || event.defaultPrevented) return;
    const panel = getKeyboardFormPanel(event.target);
    if (!panel) return;
    if (panel.id === "tab-panel-ai-schedule") return;
    if (event.target.closest(".custom-select-panel")) return;
    const controls = getTabOrderedFormControls(panel);
    const current = resolveTabOrderedControl(event.target);
    const currentIndex = controls.indexOf(current);
    if (currentIndex < 0) return;
    event.preventDefault();
    closeAllCustomSelects();
    const nextIndex = event.shiftKey ? currentIndex - 1 : currentIndex + 1;
    const next = controls[Math.max(0, Math.min(controls.length - 1, nextIndex))];
    if (next && next !== current) next.focus();
  }

  function resolveTabOrderedControl(target) {
    if (!target) return null;
    const custom = target.closest?.(".custom-select");
    if (custom) return custom.querySelector(".custom-select-trigger");
    return target;
  }

  function getKeyboardFormPanel(anchor = null) {
    const panel = anchor?.closest?.("#tab-panel-details, #tab-panel-bd, #tab-panel-return, #tab-panel-repeat, #tab-panel-ai-schedule");
    if (panel?.classList?.contains("is-active")) return panel;
    return document.querySelector("#tab-panel-details.is-active, #tab-panel-bd.is-active, #tab-panel-return.is-active, #tab-panel-repeat.is-active, #tab-panel-ai-schedule.is-active");
  }

  function getTabOrderedFormControls(anchor = null) {
    const panel = getKeyboardFormPanel(anchor);
    if (!panel) return [];
    const selector = panel.id === "tab-panel-ai-schedule"
      ? "input:not([type='hidden']), textarea, button"
      : "input:not([type='hidden']), " +
        "textarea, " +
        ".custom-select-trigger, " +
        "#addPassenger, " +
        "#passengerEmpty, " +
        "#createPassenger";
    return Array.from(panel.querySelectorAll(selector)).filter((control) => {
      if (!(control instanceof HTMLElement)) return false;
      if (control.disabled || control.hidden || control.tabIndex < 0) return false;
      if (control.closest("[hidden], .custom-select-panel, .custom-select-clear")) return false;
      if (control.offsetParent === null) return false;
      return true;
    });
  }

  function shouldRenderCustomSelectOption(option) {
    if (!option) return false;
    return option.value !== "";
  }

  function isCustomSelectClearable(select) {
    if (!select || select.disabled || select.required || select.getAttribute("aria-required") === "true") return false;
    if (select.closest(".status-select")) return false;
    if (!select.value) return false;
    return Array.from(select.options || []).some((option) => option.value === "");
  }

  function clearCustomSelectValue(select) {
    if (!isCustomSelectClearable(select)) return;
    select.value = "";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    select.dispatchEvent(new Event("input", { bubbles: true }));
    refreshCustomSelect(select);
    closeCustomSelect(select);
  }

  function syncReturnPreviewTimeSelectWidths(select) {
    const group = select?.closest?.(".time-group--return-preview");
    if (!group) return;

    window.requestAnimationFrame(() => {
      const states = Array.from(group.querySelectorAll("select"))
        .map((item) => customSelectRoots.get(item))
        .filter(Boolean);
      if (!states.length) return;

      const maxWidth = states.reduce((largest, state) => {
        const trigger = state.trigger;
        const triggerText = state.triggerText;
        const clearButton = state.clearButton;
        if (!trigger || !triggerText) return largest;

        const style = window.getComputedStyle(trigger);
        const textStyle = window.getComputedStyle(triggerText);
        const paddingX = parseFloat(style.paddingLeft || "0") + parseFloat(style.paddingRight || "0");
        const borderX = parseFloat(style.borderLeftWidth || "0") + parseFloat(style.borderRightWidth || "0");
        const gap = parseFloat(style.columnGap || style.gap || "0") || 0;
        const visibleClearWidth = clearButton && !clearButton.hidden ? clearButton.offsetWidth : 0;
        const visibleClearGap = visibleClearWidth ? gap : 0;
        const caretWidth = state.trigger.querySelector(".custom-select-caret")?.offsetWidth || 0;
        const textWidth = measureTextWidth(triggerText.textContent || "", textStyle.font);
        const needed = textWidth + paddingX + borderX + caretWidth + visibleClearWidth + gap + visibleClearGap + 6;
        return Math.max(largest, Math.ceil(needed));
      }, 0);

      if (maxWidth > 0) {
        group.style.setProperty("--return-preview-select-width", `${maxWidth}px`);
        states.forEach((state) => {
          [state.wrapper, state.trigger].forEach((element) => {
            if (!element) return;
            element.style.width = `${maxWidth}px`;
            element.style.minWidth = `${maxWidth}px`;
            element.style.maxWidth = `${maxWidth}px`;
          });
        });
      }
    });
  }

  function measureTextWidth(text, font) {
    if (!measureTextWidth.canvas) {
      measureTextWidth.canvas = document.createElement("canvas");
    }
    const context = measureTextWidth.canvas.getContext("2d");
    if (!context) return Math.ceil(String(text || "").length * 8);
    context.font = font || "14px sans-serif";
    return Math.ceil(context.measureText(String(text || "")).width);
  }

  function toggleCustomSelect(select) {
    const state = customSelectRoots.get(select);
    if (!state) return;
    const isOpen = state.wrapper.classList.contains("is-open");
    if (isOpen) {
      closeCustomSelect(select);
    } else {
      openCustomSelect(select);
    }
  }

  function openCustomSelect(select, options = {}) {
    const state = customSelectRoots.get(select);
    if (!state || select.disabled) return;

    if (activeCustomSelect && activeCustomSelect !== state.wrapper) {
      closeCustomSelect(activeCustomSelect);
    }
    if (state.panel.parentElement !== document.body) {
      document.body.appendChild(state.panel);
    }
    state.wrapper.classList.add("is-open");
    state.panel.classList.add("is-open");
    if (state.searchInput) {
      state.searchInput.value = "";
      renderCustomSelectOptions(select, "");
      if (options.focusSearch === true || (options.focusSearch !== false && shouldAutofocusSearchInputs())) {
        window.setTimeout(() => state.searchInput.focus(), 10);
      }
    }
    updateCustomSelectPanelPosition(state);
    activeCustomSelect = state.wrapper;
    state.trigger.setAttribute("aria-expanded", "true");
    if (options.focusTrigger !== false) state.trigger.focus();
  }

  function updateCustomSelectPanelPosition(state) {
    if (!state || !state.wrapper.classList.contains("is-open")) return;
    const rect = state.trigger.getBoundingClientRect();
    const viewport = currentViewportMetrics();
    const viewportHeight = viewport.height;
    const viewportWidth = viewport.width;
    const viewportTop = viewport.offsetTop;
    const viewportLeft = viewport.offsetLeft;
    const viewportBottom = viewportTop + viewportHeight;
    const viewportRight = viewportLeft + viewportWidth;
    const safeInset = 8;
    const availableWidth = Math.max(120, viewportWidth - safeInset * 2);
    const minWidth = 140;
    const desiredWidth = Math.max(minWidth, Math.ceil(rect.width || state.trigger.offsetWidth || 120));
    const width = Math.max(120, Math.min(availableWidth, desiredWidth));
    const maxHeight = Math.min(260, Math.max(120, Math.floor(viewportHeight * 0.42)));
    const spaceBelow = viewportBottom - rect.bottom - safeInset;
    const spaceAbove = rect.top - viewportTop - safeInset;
    const menuHeight = Math.min(maxHeight, Math.max(80, state.panel.scrollHeight || 0));
    const showAbove = spaceBelow < Math.min(maxHeight, 180) && spaceAbove > spaceBelow;
    const top = showAbove
      ? Math.max(viewportTop + safeInset, rect.top - menuHeight - safeInset)
      : Math.min(viewportBottom - menuHeight - safeInset, rect.bottom + safeInset);

    const safeLeft = Math.max(viewportLeft + safeInset, Math.min(rect.left, viewportRight - width - safeInset));

    state.panel.style.left = `${safeLeft}px`;
    state.panel.style.top = `${Math.max(viewportTop + safeInset, top)}px`;
    state.panel.style.width = `${width}px`;
    state.panel.style.maxHeight = `${maxHeight}px`;
  }

  function closeCustomSelect(selectOrWrapper) {
    const state = getCustomSelectState(selectOrWrapper);
    const wrapper = state?.wrapper;
    if (!state || !wrapper) return;
    const trigger = wrapper.querySelector(".custom-select-trigger");
    wrapper.classList.remove("is-open");
    state.panel.classList.remove("is-open");
    state.optionsContainer.textContent = "";
    state.noResults.hidden = true;
    state.panel.classList.remove("is-empty");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    if (activeCustomSelect === wrapper) activeCustomSelect = null;
  }

  function getCustomSelectState(target) {
    if (!target) return null;
    if (target.tagName === "SELECT") return customSelectRoots.get(target);
    if (target.nodeType === 1 && target.classList?.contains("custom-select")) return customSelectRoots.get(target.querySelector(".custom-select-native"));
    return null;
  }

  function closeAllCustomSelects() {
    document.querySelectorAll(".custom-select.is-open").forEach((wrapper) => {
      closeCustomSelect(wrapper);
    });
  }

  function handleGlobalCustomSelectClick(event) {
    if (event.target.closest(".custom-select")) return;
    if (event.target.closest(".custom-select-panel")) return;
    closeAllCustomSelects();
  }

  function handleGlobalCustomSelectFocusIn(event) {
    if (event.target.closest(".custom-select")) return;
    if (event.target.closest(".custom-select-panel")) return;
    closeAllCustomSelects();
  }

  function handleGlobalCustomSelectScroll() {
    if (!document.querySelector(".custom-select.is-open")) return;
    repositionOpenCustomSelectPanels();
  }

  function handleGlobalCustomSelectKeydown(event) {
    if (event.key !== "Escape") return;
    closeAllCustomSelects();
  }

  let customSelectPositionRaf = null;
  function repositionOpenCustomSelectPanels() {
    if (customSelectPositionRaf) return;
    customSelectPositionRaf = requestAnimationFrame(() => {
      customSelectPositionRaf = null;
      document.querySelectorAll(".custom-select.is-open").forEach((wrapper) => {
        const native = wrapper.querySelector("select.custom-select-native");
        if (!native) return;
        const state = customSelectRoots.get(native);
        updateCustomSelectPanelPosition(state);
      });
    });
  }

  async function loadReferenceData() {
    await Promise.all([
      loadChoices(CONFIG.entities.reserva, CONFIG.fields.reserva.status, "statusOperacao", FALLBACK.statusOperacao),
      loadChoices(CONFIG.entities.reserva, CONFIG.fields.reserva.statusFaturamento, "statusFaturamento", FALLBACK.statusFaturamento),
      loadChoices(CONFIG.entities.reserva, CONFIG.fields.reserva.tipoServico, "tipoServico", FALLBACK.tipoServico),
      loadChoices(CONFIG.entities.reserva, CONFIG.fields.reserva.tipoVeiculo, "tipoVeiculo", FALLBACK.tipoVeiculo),
      loadChoices(CONFIG.entities.reserva, CONFIG.fields.reserva.formaPagamento, "formaPagamento", FALLBACK.formaPagamento),
      loadChoices(CONFIG.entities.passageiro, CONFIG.fields.passageiro.status, "bdStatus", FALLBACK.bdStatus),
      loadChoices(CONFIG.entities.passageiro, CONFIG.fields.passageiro.classificacao, "bdClassificacao", FALLBACK.bdClassificacao),
      loadChoices(CONFIG.entities.passageiro, CONFIG.fields.passageiro.sexo, "bdSexo", FALLBACK.bdSexo),
      loadChoices(CONFIG.entities.passageiro, CONFIG.fields.passageiro.idioma, "bdIdioma", FALLBACK.bdIdioma),
      loadChoices(CONFIG.entities.passageiro, CONFIG.fields.passageiro.cargo, "bdCargo", FALLBACK.bdCargo),
      loadChoices(CONFIG.entities.passageiro, CONFIG.fields.passageiro.tipoVeiculo, "bdTipoVeiculo", FALLBACK.bdTipoVeiculo),
      loadLookups()
    ]);
  }

  async function loadChoices(entity, attribute, targetKey, fallback) {
    if (!state.xrm || state.mockMode) {
      state.options[targetKey] = fallback;
      return;
    }
    try {
      const clientUrl = state.xrm.Utility.getGlobalContext().getClientUrl();
      const url = [
        clientUrl,
        "/api/data/v9.2/EntityDefinitions(LogicalName='",
        entity,
        "')/Attributes(LogicalName='",
        attribute,
        "')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)"
      ].join("");
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0"
        }
      });
      if (!response.ok) throw new Error(`Metadata ${entity}.${attribute}: ${response.status}`);
      const data = await response.json();
      const options = (data.OptionSet?.Options || [])
        .map((item) => ({
          value: item.Value,
          label: item.Label?.UserLocalizedLabel?.Label || String(item.Value)
        }))
        .filter((item) => item.value !== null && item.value !== undefined);
      state.options[targetKey] = options.length ? options : fallback;
    } catch (error) {
      console.warn(error);
      state.options[targetKey] = fallback;
    }
  }

  async function loadLookups() {
    if (!state.xrm || state.mockMode) {
      loadMockLookups();
      return;
    }

    const f = CONFIG.fields;
    const [clientes, passageiros, motoristas, ops, possesVeiculo, veiculos, trocasCarro] = await Promise.all([
      retrieveAll(CONFIG.entities.cliente, `?$select=${f.cliente.id},${f.cliente.nome}&$orderby=${f.cliente.nome} asc&$top=5000`),
      retrieveAll(CONFIG.entities.passageiro, `?$select=${passengerSelectFields()}&$orderby=${f.passageiro.nome} asc&$top=${INITIAL_PASSENGER_LOOKUP_LIMIT}`),
      retrieveAll(CONFIG.entities.funcionario, `?$select=${f.funcionario.id},${f.funcionario.nome},${f.funcionario.apelido}&$orderby=${f.funcionario.apelido} asc,${f.funcionario.nome} asc&$top=5000`),
      retrieveAll(CONFIG.entities.financeiro, `?$select=${f.financeiro.id},${f.financeiro.label},createdon&$orderby=createdon desc&$top=500`),
      loadMotoristaCurrentVehicles(),
      loadVehicleCatalog(),
      loadTrocasCarro()
    ]);
    state.veiculoResumoPorId = mapVehicleSummariesById(veiculos);
    const currentVehicleState = mapMotoristaCurrentVehicles(possesVeiculo);
    state.motoristaVeiculoAtualPorId = currentVehicleState.labelsByDriver;
    state.motoristaVeiculoAtualVeiculoIdPorId = currentVehicleState.vehicleIdsByDriver;
    state.trocasCarro = mapTrocasCarro(trocasCarro);

    state.passageiros = uniquePassengersById(passageiros.map(mapPassageiro))
      .sort((a, b) => (a.label || "").localeCompare(b.label || "", "pt-BR"));
    state.clientes = sortByLabel(clientes.map((r) => ({
      id: r[f.cliente.id],
      label: r[f.cliente.nome] || "(cliente)"
    })));
    state.motoristas = sortByLabel(motoristas.map((r) => ({
      id: r[f.funcionario.id],
      label: r[f.funcionario.apelido] || r[f.funcionario.nome] || "(motorista)",
      nomeCompleto: r[f.funcionario.nome] || "",
      search: [r[f.funcionario.apelido], r[f.funcionario.nome]].filter(Boolean).join(" "),
      veiculoAtualLabel: state.motoristaVeiculoAtualPorId[cleanGuid(r[f.funcionario.id]).toLowerCase()] || ""
    })));
    state.veiculos = sortByLabel(veiculos.map((r) => ({
      id: r[f.veiculo.id],
      label: formatVehicleSummary(r) || "(veículo)"
    })));
    state.ordensPagamento = ops.map((r) => ({
      id: r[f.financeiro.id],
      label: r[f.financeiro.label] || r[f.financeiro.id]
    }));
  }

  function passengerSelectFields() {
    const f = CONFIG.fields.passageiro;
    return [
      f.id,
      f.nome,
      f.telefone,
      f.email,
      f.enderecoSaida,
      f.preferencias,
      f.cr,
      f.status,
      f.classificacao,
      f.sexo,
      f.idioma,
      f.cargo,
      f.nascimento,
      f.ultimoServico,
      f.departamento,
      f.tipoVeiculo,
      f.fotoUrl,
      "modifiedon",
      "_cr40f_cliente_value"
    ].join(",");
  }

  async function searchPassengersServer(term, limit = 25) {
    const search = String(term || "").trim();
    if (!state.xrm || state.mockMode) {
      return searchPassengersLocal(search, limit);
    }

    const f = CONFIG.fields.passageiro;
    if (!normalize(search)) {
      const rows = await retrieveAll(
        CONFIG.entities.passageiro,
        `?$select=${passengerSelectFields()}&$orderby=${f.nome} asc&$top=${limit}`
      );
      return mergePassengerRecords(rows.map(mapPassageiro));
    }

    const digits = onlyDigits(search);
    const filters = [];
    const textFilter = buildPassengerServerSearchFilter(search, [f.nome, f.email, f.telefone, f.cr]);
    if (textFilter) filters.push(textFilter);
    if (digits.length >= 4) {
      filters.push(`contains(${f.telefone},'${escapeODataString(digits.slice(-4))}')`);
    }
    if (digits.length >= 8) {
      filters.push(`contains(${f.telefone},'${escapeODataString(digits.slice(-8))}')`);
    }
    if (digits.length >= 4 && digits !== search) {
      filters.push(`contains(${f.telefone},'${escapeODataString(digits)}')`);
    }

    const rows = await retrieveAll(
      CONFIG.entities.passageiro,
      `?$select=${passengerSelectFields()}&$filter=${filters.join(" or ")}&$orderby=${f.nome} asc&$top=${limit}`
    );
    return mergePassengerRecords(rows.map(mapPassageiro));
  }

  async function loadMotoristaCurrentVehicles() {
    if (!state.xrm || state.mockMode) return [];
    return retrieveAll(
      CONFIG.entities.posseVeiculo,
      "?$select=_new_motorista_value,_new_veiculo_value,new_iniciodaposse,new_fimdaposse,statecode,modifiedon&$filter=statecode eq 0&$orderby=new_iniciodaposse desc,modifiedon desc&$top=5000"
    );
  }

  async function loadVehicleCatalog() {
    if (!state.xrm || state.mockMode) return [];
    const f = CONFIG.fields.veiculo;
    return retrieveAll(
      CONFIG.entities.veiculo,
      `?$select=${f.id},${f.modelo},${f.cor},${f.placa}&$top=5000`
    );
  }

  async function loadTrocasCarro() {
    if (!state.xrm || state.mockMode) return [];
    const f = CONFIG.fields.trocaCarro;
    return retrieveAll(
      CONFIG.entities.trocaCarro,
      `?$select=${f.id},${f.dataHoraTroca},${f.inicioJanela},${f.fimJanela},${f.statusTroca},${f.tipoTroca},${f.motorista1},${f.motorista2},${f.veiculo1},${f.veiculo2},statecode,modifiedon&$filter=statecode eq 0 and ${f.statusTroca} ne 202410002&$orderby=${f.dataHoraTroca} asc,${f.inicioJanela} asc,modifiedon asc&$top=5000`
    );
  }

  function mapVehicleSummariesById(vehicles) {
    return Object.fromEntries((vehicles || []).map((vehicle) => [
      cleanGuid(vehicle[CONFIG.fields.veiculo.id]).toLowerCase(),
      formatVehicleSummary(vehicle)
    ]));
  }

  function mapMotoristaCurrentVehicles(rows) {
    const labelsByDriver = {};
    const vehicleIdsByDriver = {};
    (rows || []).forEach((row) => {
      const motoristaId = cleanGuid(row._new_motorista_value).toLowerCase();
      const veiculoId = cleanGuid(row._new_veiculo_value).toLowerCase();
      const veiculoLabel = state.veiculoResumoPorId[veiculoId] || "";
      if (!motoristaId || !veiculoLabel) return;
      if (!labelsByDriver[motoristaId] || row.new_fimdaposse === null || row.new_fimdaposse === undefined) {
        labelsByDriver[motoristaId] = veiculoLabel;
        vehicleIdsByDriver[motoristaId] = veiculoId;
      }
    });
    return { labelsByDriver, vehicleIdsByDriver };
  }

  function mapTrocasCarro(rows) {
    const f = CONFIG.fields.trocaCarro;
    return (rows || [])
      .map((row) => ({
        id: cleanGuid(row[f.id]),
        motorista1: cleanGuid(row[f.motorista1]).toLowerCase(),
        motorista2: cleanGuid(row[f.motorista2]).toLowerCase(),
        veiculo1: cleanGuid(row[f.veiculo1]).toLowerCase(),
        veiculo2: cleanGuid(row[f.veiculo2]).toLowerCase(),
        status: Number(row[f.statusTroca] ?? ""),
        tipo: Number(row[f.tipoTroca] ?? ""),
        effectiveAt: row[f.dataHoraTroca] || row[f.inicioJanela] || "",
        startWindow: row[f.inicioJanela] || "",
        endWindow: row[f.fimJanela] || ""
      }))
      .filter((row) => row.effectiveAt)
      .sort((a, b) => String(a.effectiveAt).localeCompare(String(b.effectiveAt)));
  }

  function formatVehicleSummary(vehicle) {
    if (!vehicle) return "";
    const f = CONFIG.fields.veiculo;
    const modelo = String(vehicle[f.modelo] || "").trim();
    const cor = String(vehicle[f.cor] || "").trim();
    const placa = String(vehicle[f.placa] || "").trim();
    const modeloCor = [modelo, cor].filter(Boolean).join(" ");
    if (modeloCor && placa) return `${modeloCor} - ${placa}`;
    return modeloCor || placa;
  }

  function currentMotoristaVehicleLabel() {
    const veiculoId = currentMotoristaVehicleId();
    return veiculoId ? state.veiculoResumoPorId[veiculoId] || "" : "";
  }

  function currentMotoristaVehicleId() {
    const motoristaId = cleanGuid(el.motorista?.value || "").toLowerCase();
    if (!motoristaId) return "";
    const serviceDateTime = combineDateTime(el.saidaData?.value, el.saidaHora?.value, el.saidaMinuto?.value);
    return predictedMotoristaVehicleId(motoristaId, serviceDateTime);
  }

  function predictedMotoristaVehicleLabel(motoristaId, serviceDateTime) {
    const veiculoId = predictedMotoristaVehicleId(motoristaId, serviceDateTime);
    return veiculoId ? state.veiculoResumoPorId[veiculoId] || "" : "";
  }

  function predictedMotoristaVehicleId(motoristaId, serviceDateTime) {
    if (!motoristaId) return "";
    let veiculoId = state.motoristaVeiculoAtualVeiculoIdPorId[motoristaId] || "";
    if (!serviceDateTime || !(serviceDateTime instanceof Date) || Number.isNaN(serviceDateTime.getTime())) {
      return veiculoId;
    }
    state.trocasCarro.forEach((troca) => {
      const effectiveAt = parseDateTimeInputValue(normalizeDateTimeRangeValue(troca.effectiveAt));
      if (!effectiveAt || effectiveAt > serviceDateTime) return;
      veiculoId = applyTrocaToMotoristaVehicle(motoristaId, veiculoId, troca);
    });
    return veiculoId;
  }

  function applyTrocaToMotoristaVehicle(motoristaId, currentVehicleId, troca) {
    if (!troca || troca.status === 202410002) return currentVehicleId;
    if (troca.tipo === 100000000) {
      if (troca.motorista1 && sameId(troca.motorista1, motoristaId)) return troca.veiculo2 || "";
      if (troca.motorista2 && sameId(troca.motorista2, motoristaId)) return troca.veiculo1 || "";
      return currentVehicleId;
    }
    if (troca.tipo === 100000001) {
      if (troca.motorista1 && sameId(troca.motorista1, motoristaId)) return "";
      if (troca.motorista2 && sameId(troca.motorista2, motoristaId)) return "";
      return currentVehicleId;
    }
    if (troca.tipo === 100000002) {
      if (troca.motorista1 && sameId(troca.motorista1, motoristaId)) return troca.veiculo1 || currentVehicleId;
      if (troca.motorista2 && sameId(troca.motorista2, motoristaId)) return troca.veiculo2 || currentVehicleId;
      return currentVehicleId;
    }
    return currentVehicleId;
  }

  function renderMotoristaVehicleHint() {
    if (!el.motoristaVeiculoAtual) return;
    const label = currentMotoristaVehicleLabel();
    el.motoristaVeiculoAtual.hidden = !label;
    el.motoristaVeiculoAtual.textContent = label;
  }

  function markVehicleManual() {
    // Em serviço novo, limpar o carro devolve a decisão ao servidor (não manda origem Manual sem carro).
    state.vehicleOriginManual = !state.isNew || !!el.veiculo.value;
  }

  // O carro só é definido pela escolha manual; o automático fica com o servidor (posse só para terceiro, Infleet na finalização).
  function clearAutomaticVehicleOnMotoristaChange() {
    if (state.vehicleOriginManual || !state.isNew) return;
    setSelectValue(el.veiculo, "");
  }

  function buildPassengerServerSearchFilter(search, fields) {
    const tokens = searchTokens(search);
    const cleanFields = (fields || []).filter(Boolean);
    if (!tokens.length || !cleanFields.length) return "";
    return tokens
      .map((token) => `(${cleanFields.map((field) => `contains(${field},'${escapeODataString(token)}')`).join(" or ")})`)
      .join(" and ");
  }

  function searchPassengersLocal(term, limit = 25) {
    const query = normalize(term);
    const digits = onlyDigits(term);
    const rows = state.passageiros.filter((passenger) => {
      if (!query && !digits) return true;
      const haystack = normalize([
        passenger.label,
        passenger.telefone,
        passenger.email,
        passenger.clienteLabel,
        passenger.cr,
        passenger.departamento
      ].filter(Boolean).join(" "));
      return searchableTextMatches(haystack, query) || (digits && onlyDigits(passenger.telefone).includes(digits));
    });
    return rows.slice(0, limit);
  }

  async function ensurePassengersByIds(ids) {
    const requested = Array.from(new Set((ids || []).map(cleanGuid).filter(Boolean)));
    const missing = requested.filter((id) => !state.passageiros.some((passenger) => sameId(passenger.id, id)));
    if (!missing.length) return [];
    if (!state.xrm || state.mockMode) {
      return state.passageiros.filter((passenger) => requested.some((id) => sameId(id, passenger.id)));
    }

    const f = CONFIG.fields.passageiro;
    const batches = [];
    for (let index = 0; index < missing.length; index += 20) {
      batches.push(missing.slice(index, index + 20));
    }
    const rows = [];
    for (const batch of batches) {
      const filter = batch.map((id) => `${f.id} eq ${id}`).join(" or ");
      rows.push(...await retrieveAll(CONFIG.entities.passageiro, `?$select=${passengerSelectFields()}&$filter=${filter}`));
    }
    return mergePassengerRecords(rows.map(mapPassageiro));
  }

  function mergePassengerRecords(records) {
    const merged = [];
    records.forEach((passenger) => {
      if (!passenger?.id) return;
      const index = state.passageiros.findIndex((item) => sameId(item.id, passenger.id));
      if (index >= 0) {
        state.passageiros[index] = { ...state.passageiros[index], ...passenger };
        merged.push(state.passageiros[index]);
        return;
      }
      state.passageiros.push(passenger);
      merged.push(passenger);
    });
    state.passageiros.sort((a, b) => (a.label || "").localeCompare(b.label || "", "pt-BR"));
    return merged;
  }

  function escapeODataString(value) {
    return String(value || "").replace(/'/g, "''");
  }

  function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function sortByLabel(rows) {
    return [...(rows || [])].sort((a, b) => (a.label || "").localeCompare(b.label || "", "pt-BR", { sensitivity: "base" }));
  }

  function getCustomSelectDisplayText(option, select = null) {
    if (!option) return "";
    if (option.value === "" && select?.dataset?.placeholderLabel) {
      return select.dataset.placeholderLabel;
    }
    return option.textContent.trim();
  }

  function renderCustomSelectOptionContent(button, option) {
    if (option.dataset?.subtitle) {
      const name = document.createElement("span");
      name.className = "custom-select-option-name";
      name.textContent = option.textContent.trim();
      const subtitle = document.createElement("span");
      subtitle.className = "custom-select-option-subtitle";
      subtitle.textContent = option.dataset.subtitle;
      button.append(name, subtitle);
      return;
    }
    button.textContent = option.textContent;
  }

  function setCustomSelectTriggerDisplay(triggerText, option, select) {
    triggerText.innerHTML = "";
    if (!option) {
      triggerText.textContent = "Selecione";
      return;
    }
    triggerText.textContent = getCustomSelectDisplayText(option, select) || "Selecione";
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeCodeValue(value) {
    return String(value || "").trimStart().replace(/\s+/g, " ").toUpperCase();
  }

  function normalizePassengerDisplayName(value) {
    const text = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return "";
    const smallWords = new Set(["da", "de", "do", "das", "dos", "e"]);
    const romanNumerals = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i;

    return text
      .split(" ")
      .filter(Boolean)
      .map((part, index) => {
        const lowerPart = part.toLowerCase();
        if (index > 0 && smallWords.has(lowerPart)) return lowerPart;
        if (romanNumerals.test(lowerPart)) return lowerPart.toUpperCase();
        return lowerPart.replace(/(^|[-'])\p{L}/gu, (chunk) => chunk.toUpperCase());
      })
      .join(" ");
  }

  const PHONE_MAX_LENGTH = 32;

  function sanitizePhoneText(value) {
    return String(value || "")
      .replace(/[^\d+\-()./ #*xX]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, PHONE_MAX_LENGTH);
  }

  function formatPhoneNumber(value) {
    return sanitizePhoneText(value);
  }

  function parsePhoneNumber(value) {
    const formatted = formatPhoneNumber(value);
    const digits = onlyDigits(formatted);
    if (!formatted) return emptyPhoneResult();
    return {
      formatted,
      e164: "",
      digits,
      countryCode: "",
      countryName: "",
      national: digits,
      isInternational: false,
      isValid: true,
      message: ""
    };
  }

  function parsePhoneNumberForInput(value) {
    return parsePhoneNumber(value);
  }

  function parsePhoneNumberForSelectedCountry(value) {
    return parsePhoneNumber(value);
  }

  function phoneStorageValue(value) {
    return sanitizePhoneText(value);
  }

  function resetPhoneControl() {
    if (el.bdTelefone) {
      el.bdTelefone.value = "";
    }
  }

  function emptyPhoneResult() {
    return {
      formatted: "",
      e164: "",
      digits: "",
      countryCode: "",
      countryName: "",
      national: "",
      isInternational: false,
      isValid: true,
      message: ""
    };
  }

  function formatCpf(value) {
    const digits = onlyDigits(value).slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  function isValidCpf(value) {
    const digits = onlyDigits(value);
    if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
    const calculateDigit = (length) => {
      const sum = digits
        .slice(0, length)
        .split("")
        .reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
      const rest = (sum * 10) % 11;
      return rest === 10 ? 0 : rest;
    };
    return calculateDigit(9) === Number(digits[9]) && calculateDigit(10) === Number(digits[10]);
  }

  function loadMockLookups() {
    state.clientes = [
      { id: "cliente-embraer", label: "Embraer" },
      { id: "cliente-tenaris", label: "Tenaris" },
      { id: "cliente-demo", label: "Cliente Demo" },
      { id: "cliente-betalabs", label: "Beta Labs" },
      { id: "cliente-holding", label: "Holding Sul" }
    ];
    state.passageiros = [
      {
        id: "pax-1",
        label: "Maria Souza",
        telefone: "(11) 99999-0000",
        email: "maria@example.com",
        endereco: "Av. Paulista, 1000 - São Paulo/SP",
        preferencias: "Sem janela na volta",
        cr: "CR001",
        clienteId: "cliente-demo",
        tipoVeiculo: "Sedan",
        status: 30,
        classificacao: 40,
        sexo: 51,
        idioma: 60,
        cargo: 70,
        nascimento: "",
        departamento: "Diretoria"
      },
      {
        id: "pax-2",
        label: "Carlos Mendes",
        telefone: "(11) 98888-2222",
        email: "carlos.mendes@example.com",
        endereco: "Rua Oscar Freire, 250 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        cr: "CR002",
        clienteId: "cliente-betalabs",
        tipoVeiculo: "SUV",
        status: 30,
        classificacao: 42,
        sexo: 50,
        idioma: 60,
        cargo: 72,
        nascimento: "",
        departamento: "Compras"
      },
      {
        id: "pax-3",
        label: "Juliana Lima",
        telefone: "(11) 97777-3333",
        email: "juliana.lima@example.com",
        endereco: "Alameda Santos, 700 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        preferencias: "Ar ligado leve",
        cr: "CR003",
        clienteId: "cliente-holding",
        tipoVeiculo: "VAN",
        status: 30,
        classificacao: 41,
        sexo: 51,
        idioma: 61,
        cargo: 73,
        nascimento: "",
        departamento: "Operacoes"
      },
      {
        id: "pax-3",
        label: "Juliana Lima",
        telefone: "(11) 97777-3333",
        email: "juliana.lima@example.com",
        endereco: "Alameda Santos, 700 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        preferencias: "Ar ligado leve",
        cr: "CR003",
        clienteId: "cliente-holding",
        tipoVeiculo: "VAN",
        status: 30,
        classificacao: 41,
        sexo: 51,
        idioma: 61,
        cargo: 73,
        nascimento: "",
        departamento: "Operacoes"
      },
      {
        id: "pax-3",
        label: "Juliana Lima",
        telefone: "(11) 97777-3333",
        email: "juliana.lima@example.com",
        endereco: "Alameda Santos, 700 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        preferencias: "Ar ligado leve",
        cr: "CR003",
        clienteId: "cliente-holding",
        tipoVeiculo: "VAN",
        status: 30,
        classificacao: 41,
        sexo: 51,
        idioma: 61,
        cargo: 73,
        nascimento: "",
        departamento: "Operacoes"
      },
      {
        id: "pax-3",
        label: "Juliana Lima",
        telefone: "(11) 97777-3333",
        email: "juliana.lima@example.com",
        endereco: "Alameda Santos, 700 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        preferencias: "Ar ligado leve",
        cr: "CR003",
        clienteId: "cliente-holding",
        tipoVeiculo: "VAN",
        status: 30,
        classificacao: 41,
        sexo: 51,
        idioma: 61,
        cargo: 73,
        nascimento: "",
        departamento: "Operacoes"
      },
      {
        id: "pax-3",
        label: "Juliana Lima",
        telefone: "(11) 97777-3333",
        email: "juliana.lima@example.com",
        endereco: "Alameda Santos, 700 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        preferencias: "Ar ligado leve",
        cr: "CR003",
        clienteId: "cliente-holding",
        tipoVeiculo: "VAN",
        status: 30,
        classificacao: 41,
        sexo: 51,
        idioma: 61,
        cargo: 73,
        nascimento: "",
        departamento: "Operacoes"
      },
      {
        id: "pax-3",
        label: "Juliana Lima",
        telefone: "(11) 97777-3333",
        email: "juliana.lima@example.com",
        endereco: "Alameda Santos, 700 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        preferencias: "Ar ligado leve",
        cr: "CR003",
        clienteId: "cliente-holding",
        tipoVeiculo: "VAN",
        status: 30,
        classificacao: 41,
        sexo: 51,
        idioma: 61,
        cargo: 73,
        nascimento: "",
        departamento: "Operacoes"
      },
      {
        id: "pax-3",
        label: "Juliana Lima",
        telefone: "(11) 97777-3333",
        email: "juliana.lima@example.com",
        endereco: "Alameda Santos, 700 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        preferencias: "Ar ligado leve",
        cr: "CR003",
        clienteId: "cliente-holding",
        tipoVeiculo: "VAN",
        status: 30,
        classificacao: 41,
        sexo: 51,
        idioma: 61,
        cargo: 73,
        nascimento: "",
        departamento: "Operacoes"
      },
      {
        id: "pax-3",
        label: "Juliana Lima",
        telefone: "(11) 97777-3333",
        email: "juliana.lima@example.com",
        endereco: "Alameda Santos, 700 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        preferencias: "Ar ligado leve",
        cr: "CR003",
        clienteId: "cliente-holding",
        tipoVeiculo: "VAN",
        status: 30,
        classificacao: 41,
        sexo: 51,
        idioma: 61,
        cargo: 73,
        nascimento: "",
        departamento: "Operacoes"
      },
      {
        id: "pax-3",
        label: "Juliana Lima",
        telefone: "(11) 97777-3333",
        email: "juliana.lima@example.com",
        endereco: "Alameda Santos, 700 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        preferencias: "Ar ligado leve",
        cr: "CR003",
        clienteId: "cliente-holding",
        tipoVeiculo: "VAN",
        status: 30,
        classificacao: 41,
        sexo: 51,
        idioma: 61,
        cargo: 73,
        nascimento: "",
        departamento: "Operacoes"
      },
      {
        id: "pax-3",
        label: "Juliana Lima",
        telefone: "(11) 97777-3333",
        email: "juliana.lima@example.com",
        endereco: "Alameda Santos, 700 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        preferencias: "Ar ligado leve",
        cr: "CR003",
        clienteId: "cliente-holding",
        tipoVeiculo: "VAN",
        status: 30,
        classificacao: 41,
        sexo: 51,
        idioma: 61,
        cargo: 73,
        nascimento: "",
        departamento: "Operacoes"
      },
      {
        id: "pax-3",
        label: "Juliana Lima",
        telefone: "(11) 97777-3333",
        email: "juliana.lima@example.com",
        endereco: "Alameda Santos, 700 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        preferencias: "Ar ligado leve",
        cr: "CR003",
        clienteId: "cliente-holding",
        tipoVeiculo: "VAN",
        status: 30,
        classificacao: 41,
        sexo: 51,
        idioma: 61,
        cargo: 73,
        nascimento: "",
        departamento: "Operacoes"
      },
      {
        id: "pax-3",
        label: "Juliana Lima",
        telefone: "(11) 97777-3333",
        email: "juliana.lima@example.com",
        endereco: "Alameda Santos, 700 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        preferencias: "Ar ligado leve",
        cr: "CR003",
        clienteId: "cliente-holding",
        tipoVeiculo: "VAN",
        status: 30,
        classificacao: 41,
        sexo: 51,
        idioma: 61,
        cargo: 73,
        nascimento: "",
        departamento: "Operacoes"
      },
      {
        id: "pax-3",
        label: "Juliana Lima",
        telefone: "(11) 97777-3333",
        email: "juliana.lima@example.com",
        endereco: "Alameda Santos, 700 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        preferencias: "Ar ligado leve",
        cr: "CR003",
        clienteId: "cliente-holding",
        tipoVeiculo: "VAN",
        status: 30,
        classificacao: 41,
        sexo: 51,
        idioma: 61,
        cargo: 73,
        nascimento: "",
        departamento: "Operacoes"
      },
      {
        id: "pax-3",
        label: "Juliana Lima",
        telefone: "(11) 97777-3333",
        email: "juliana.lima@example.com",
        endereco: "Alameda Santos, 700 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        preferencias: "Ar ligado leve",
        cr: "CR003",
        clienteId: "cliente-holding",
        tipoVeiculo: "VAN",
        status: 30,
        classificacao: 41,
        sexo: 51,
        idioma: 61,
        cargo: 73,
        nascimento: "",
        departamento: "Operacoes"
      },
      {
        id: "pax-3",
        label: "Juliana Lima",
        telefone: "(11) 97777-3333",
        email: "juliana.lima@example.com",
        endereco: "Alameda Santos, 700 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        preferencias: "Ar ligado leve",
        cr: "CR003",
        clienteId: "cliente-holding",
        tipoVeiculo: "VAN",
        status: 30,
        classificacao: 41,
        sexo: 51,
        idioma: 61,
        cargo: 73,
        nascimento: "",
        departamento: "Operacoes"
      },
      {
        id: "pax-3",
        label: "Juliana Lima",
        telefone: "(11) 97777-3333",
        email: "juliana.lima@example.com",
        endereco: "Alameda Santos, 700 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        preferencias: "Ar ligado leve",
        cr: "CR003",
        clienteId: "cliente-holding",
        tipoVeiculo: "VAN",
        status: 30,
        classificacao: 41,
        sexo: 51,
        idioma: 61,
        cargo: 73,
        nascimento: "",
        departamento: "Operacoes"
      },
      {
        id: "pax-3",
        label: "Juliana Lima",
        telefone: "(11) 97777-3333",
        email: "juliana.lima@example.com",
        endereco: "Alameda Santos, 700 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        preferencias: "Ar ligado leve",
        cr: "CR003",
        clienteId: "cliente-holding",
        tipoVeiculo: "VAN",
        status: 30,
        classificacao: 41,
        sexo: 51,
        idioma: 61,
        cargo: 73,
        nascimento: "",
        departamento: "Operacoes"
      },
      {
        id: "pax-3",
        label: "Juliana Lima",
        telefone: "(11) 97777-3333",
        email: "juliana.lima@example.com",
        endereco: "Alameda Santos, 700 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        preferencias: "Ar ligado leve",
        cr: "CR003",
        clienteId: "cliente-holding",
        tipoVeiculo: "VAN",
        status: 30,
        classificacao: 41,
        sexo: 51,
        idioma: 61,
        cargo: 73,
        nascimento: "",
        departamento: "Operacoes"
      },
      {
        id: "pax-3",
        label: "Juliana Lima",
        telefone: "(11) 97777-3333",
        email: "juliana.lima@example.com",
        endereco: "Alameda Santos, 700 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        preferencias: "Ar ligado leve",
        cr: "CR003",
        clienteId: "cliente-holding",
        tipoVeiculo: "VAN",
        status: 30,
        classificacao: 41,
        sexo: 51,
        idioma: 61,
        cargo: 73,
        nascimento: "",
        departamento: "Operacoes"
      },
      {
        id: "pax-3",
        label: "Juliana Lima",
        telefone: "(11) 97777-3333",
        email: "juliana.lima@example.com",
        endereco: "Alameda Santos, 700 - São Paulo/SP",
        preferencias: "Silêncio no trajeto",
        preferencias: "Ar ligado leve",
        cr: "CR003",
        clienteId: "cliente-holding",
        tipoVeiculo: "VAN",
        status: 30,
        classificacao: 41,
        sexo: 51,
        idioma: 61,
        cargo: 73,
        nascimento: "",
        departamento: "Operacoes"
      }
    ];
    const storedPassengers = getMockDb().passageiros;
    state.passageiros = uniquePassengersById([...state.passageiros, ...storedPassengers].map(normalizeMockPassengerChoices));
    state.motoristas = [
      { id: "mot-1", label: "Carlos Motorista" },
      { id: "mot-2", label: "Rafael Costa" },
      { id: "mot-3", label: "Patricia Lima" }
    ];
    state.ordensPagamento = [
      { id: "op-1", label: "OP-1012" },
      { id: "op-2", label: "OP-1099" },
      { id: "op-3", label: "OP-1134" }
    ];
  }

  function normalizeMockPassengerChoices(passenger) {
    const classificacaoMap = {
      40: 202410000,
      41: 202410001,
      42: 202410002,
      43: 202410003
    };
    const sexoMap = {
      50: 202410000,
      51: 202410001
    };
    const idiomaMap = {
      60: 202410000,
      61: 202410001,
      62: 202410002
    };
    const cargoMap = {
      70: 202410000,
      71: 202410003,
      72: 202410005,
      73: 202410006,
      74: 202410004
    };
    const tipoVeiculoMap = {
      SEDAN: 202410000,
      SUV: 202410001,
      VAN: 202410003
    };
    return {
      ...passenger,
      status: 202410001,
      classificacao: classificacaoMap[passenger.classificacao] ?? passenger.classificacao,
      sexo: sexoMap[passenger.sexo] ?? passenger.sexo,
      idioma: idiomaMap[passenger.idioma] ?? passenger.idioma,
      cargo: cargoMap[passenger.cargo] ?? passenger.cargo,
      tipoVeiculo: tipoVeiculoMap[String(passenger.tipoVeiculo || "").toUpperCase()] ?? passenger.tipoVeiculo
    };
  }

  function uniquePassengersById(rows) {
    const seen = new Set();
    return rows.filter((passenger) => {
      const id = cleanGuid(passenger?.id).toLowerCase();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function getMockDb() {
    try {
      const raw = localStorage.getItem(MOCK_STORE_KEY);
      if (!raw) {
        return { reservas: [], relacoes: [], passageiros: [] };
      }
      const parsed = JSON.parse(raw);
      return {
        reservas: Array.isArray(parsed?.reservas) ? parsed.reservas : [],
        relacoes: Array.isArray(parsed?.relacoes) ? parsed.relacoes : [],
        passageiros: Array.isArray(parsed?.passageiros) ? parsed.passageiros : []
      };
    } catch (error) {
      console.warn("Falha ao ler mock db", error);
      return { reservas: [], relacoes: [], passageiros: [] };
    }
  }

  function setMockDb(next) {
    localStorage.setItem(MOCK_STORE_KEY, JSON.stringify({
      reservas: Array.isArray(next?.reservas) ? next.reservas : [],
      relacoes: Array.isArray(next?.relacoes) ? next.relacoes : [],
      passageiros: Array.isArray(next?.passageiros) ? next.passageiros : []
    }));
  }

  function persistMockPassengerRecord(passenger) {
    if (state.xrm && !state.mockMode) return passenger;
    const cleanPassengerId = cleanGuid(passenger?.id || "");
    if (!cleanPassengerId) return passenger;
    const db = getMockDb();
    const now = new Date().toISOString();
    const record = {
      ...passenger,
      id: cleanPassengerId,
      updatedOn: now
    };
    const index = db.passageiros.findIndex((item) => sameId(item.id, cleanPassengerId));
    if (index >= 0) {
      db.passageiros[index] = {
        ...db.passageiros[index],
        ...record
      };
    } else {
      db.passageiros.push({
        ...record,
        createdOn: now
      });
    }
    db.passageiros = uniquePassengersById(db.passageiros);
    setMockDb(db);
    return record;
  }

  function getMockRecordById(recordId) {
    return getMockDb().reservas.find((item) => sameId(item[CONFIG.fields.reserva.id], recordId));
  }

  function getMockRelations(recordId) {
    return getMockDb().relacoes.filter((item) => sameId(item.reservaId, recordId));
  }

  function upsertMockRecord(payload, id) {
    const db = getMockDb();
    const recordId = cleanGuid(id || `mock-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`);
    const readable = payload[CONFIG.fields.reserva.readableId] || `R-${recordId.slice(-6).toUpperCase()}`;
    const saved = {
      ...state.record,
      ...payload,
      [CONFIG.fields.reserva.id]: recordId,
      [CONFIG.fields.reserva.readableId]: readable,
      updatedOn: new Date().toISOString()
    };
    const idx = db.reservas.findIndex((item) => sameId(item[CONFIG.fields.reserva.id], recordId));
    if (idx >= 0) {
      db.reservas[idx] = saved;
    } else {
      db.reservas.push({ ...saved, createdOn: new Date().toISOString() });
    }
    setMockDb(db);
    state.record = db.reservas[idx >= 0 ? idx : db.reservas.length - 1];
    return { id: recordId };
  }

  function replaceMockRelations(reservaId, passengers, includeAddress) {
    const db = getMockDb();
    const relationPassengers = uniquePassengerRelationItems(passengers);
    db.relacoes = db.relacoes.filter((item) => !sameId(item.reservaId, reservaId));
    for (const item of relationPassengers) {
      db.relacoes.push({
        reservaId,
        ordem: Number(item.ordem),
        passageiroId: cleanGuid(item.guid || ""),
        passageiroLabel: item.passageiro?.label || "(passageiro)",
        passageiroTelefone: item.telefone || "",
        endereco: includeAddress ? item.enderecoSaidaBD || "" : ""
      });
    }
    setMockDb(db);
  }

  function hydrateMockCurrentRecord(recordId) {
    const record = getMockRecordById(recordId);
    if (!record) {
      toast(`Registro ${recordId} não encontrado no mock db. Abrindo como novo`, "warning", 5000);
      state.isNew = true;
      state.recordId = "";
      state.selectedPassengers = [];
      state.enderecoRascunho = [];
      return;
    }

    const f = CONFIG.fields.reserva;
    const relations = getMockRelations(recordId);
    state.record = record;
    state.relacoes = relations;
    state.enderecoPersonalizadoAtivo = !!record[f.enderecoPersonalizado] || relations.every((item) => !item.endereco);
    state.selectedPassengers = relations.length
      ? relations.map((rel, index) => {
        const pax = state.passageiros.find((item) => sameId(item.id, rel.passageiroId)) || {
            id: rel.passageiroId,
            label: rel.passageiroLabel || "(passageiro)",
            telefone: rel.passageiroTelefone || "",
            endereco: "",
            preferencias: "",
            email: "",
            cr: "",
            tipoVeiculo: ""
          };
          return {
            rowKey: nextPassengerRowKey(),
            ordem: Number(rel.ordem || index + 1),
            passageiro: pax,
            guid: pax.id,
            telefone: pax.telefone || "",
            enderecoEditado: state.enderecoPersonalizadoAtivo ? "" : (rel.endereco || pax.endereco || "")
          };
        })
      : [];
    hydratePassengerSelectionRecencyFromRows(state.selectedPassengers);
    state.enderecoRascunho = state.selectedPassengers.map((item) => ({
      ordem: item.ordem,
      endereco: item.enderecoEditado || ""
    }));
  }

  function mapPassageiro(record) {
    const f = CONFIG.fields.passageiro;
    const clienteLookup = "_cr40f_cliente_value";
    const passenger = {
      id: record[f.id],
      label: record[f.nome] || record[`${clienteLookup}@OData.Community.Display.V1.FormattedValue`] || "(passageiro)",
      telefone: formatPhoneNumber(record[f.telefone] || ""),
      email: record[f.email] || "",
      endereco: record[f.enderecoSaida] || "",
      preferencias: record[f.preferencias] || "",
      cr: record[f.cr] || "",
      status: record[f.status] || "",
      classificacao: record[f.classificacao] || "",
      sexo: record[f.sexo] || "",
      idioma: record[f.idioma] || "",
      cargo: record[f.cargo] || "",
      nascimento: record[f.nascimento] || "",
      ultimoServico: record[f.ultimoServico] || "",
      departamento: record[f.departamento] || "",
      tipoVeiculo: record[f.tipoVeiculo] || "",
      fotoUrl: normalizePassengerPhotoUrl(record[f.fotoUrl]),
      tipoVeiculoLabel: record[`${f.tipoVeiculo}@OData.Community.Display.V1.FormattedValue`] || "",
      clienteId: record[clienteLookup] || "",
      clienteLabel: record[`${clienteLookup}@OData.Community.Display.V1.FormattedValue`] || ""
    };
    if (passenger.fotoUrl && record.modifiedon) passengerPhotoVersionByUrl.set(passenger.fotoUrl, String(record.modifiedon));
    if (passenger.fotoUrl || isPassengerPhotoDebugEnabled()) debugPassengerPhoto("record:map", {
      passengerId: passenger.id,
      passengerName: passenger.label,
      hasRawUrl: !!record[f.fotoUrl],
      rawUrl: record[f.fotoUrl] || "",
      normalizedUrl: passenger.fotoUrl || ""
    });
    return passenger;
  }

  function buildMockAiDrafts() {
    const now = new Date();
    const iso = (minutes) => new Date(now.getTime() - minutes * 60000).toISOString();
    const extraction = (overrides = {}) => JSON.stringify({ isServiceRequest: true, client: "Cliente Demo", clientId: "cliente-demo", requester: "Maria Souza", requesterId: "pax-1", passengers: [{ id: "pax-1", name: "Maria Souza", phone: "(11) 99999-0000", email: "maria@example.com" }], legs: [], warnings: [], missingFields: [], matchCandidates: {}, confidence: 0.94, extractorVersion: "mock-1.0.0", ...overrides });
    const leg = (overrides = {}) => JSON.stringify({ ordinal: 1, type: "ida", date: "2026-09-16", time: "09:30", origin: "Av. Paulista, 1000", destination: "Aeroporto de Guarulhos", route: "São Paulo / Guarulhos", notes: "", ...overrides });
    const row = (id, subject, status, overrides = {}) => ({ cr40f_solicitacaoiaagendamentoid: id, cr40f_identificadormensagem: `mock-message-${id}`, cr40f_conversationid: overrides.conversationId || `mock-conversation-${id}`, cr40f_assunto: subject, cr40f_remetente: overrides.sender || "operacao@betinhos.local", cr40f_recebimento: iso(overrides.minutes ?? 30), cr40f_corponormalizado: overrides.body || "Solicitação de transporte para teste local.", cr40f_extracaojson: overrides.extractionJson ?? extraction(overrides.extraction || {}), cr40f_ordemtrecho: overrides.ordinal || 1, cr40f_tipotrecho: overrides.legType || "ida", cr40f_trechojson: leg(overrides.leg || {}), cr40f_status: status, cr40f_statusname: ({ 100000000: "Pendente", 100000001: "Pronto", 100000002: "Bloqueado", 100000003: "Agendado", 100000004: "Descartado", 100000005: "Erro" })[status], cr40f_alertas: overrides.warnings || "", cr40f_camposfaltantes: overrides.missingFields || "", cr40f_matchcandidatos: overrides.matchCandidates ? JSON.stringify(overrides.matchCandidates) : "", cr40f_idscriadosparcialmente: overrides.partialIds || "", cr40f_confianca: overrides.confidence ?? 0.94, cr40f_versaoextrator: "mock-1.0.0", cr40f_possuianexos: !!overrides.hasAttachments });
    return [
      row("mock-pending", "Pedido novo — identidade não confirmada", 100000000, { extraction: { clientId: "", requesterId: "", passengers: [{ name: "Pessoa Nova", phone: "(11) 98888-1111" }], matchCandidates: {} }, warnings: "Cliente e passageiro aguardam confirmação.", minutes: 8 }),
      row("mock-ready-1", "Transferência executiva — ida e retorno", 100000001, { conversationId: "mock-roundtrip", leg: { date: "2026-09-18", time: "07:00", origin: "J&J São José dos Campos", destination: "GRU" }, minutes: 16 }),
      row("mock-ready-2", "Transferência executiva — ida e retorno", 100000001, { conversationId: "mock-roundtrip", ordinal: 2, legType: "retorno", leg: { ordinal: 2, type: "retorno", date: "2026-09-20", time: "18:30", origin: "GRU", destination: "J&J São José dos Campos" }, minutes: 16 }),
      row("mock-ambiguous", "Solicitação com nomes parecidos", 100000002, { extraction: { clientId: "", requesterId: "", passengers: [{ id: "", name: "Carlos", phone: "" }], matchCandidates: { client: [{ id: "cliente-demo", name: "Cliente Demo", score: 3, reasons: ["nome aproximado"] }, { id: "cliente-tenaris", name: "Tenaris", score: 3, reasons: ["nome aproximado"] }], requester: [], passengers: [[{ id: "pax-1", name: "Carlos Mendes", score: 2, reasons: ["nome parcialmente coincidente"] }, { id: "pax-2", name: "Carlos Mendes Filho", score: 2, reasons: ["nome parcialmente coincidente"] }]] } }, warnings: "Correspondência ambígua: confirme os registros.", minutes: 25 }),
      row("mock-vague", "Data e horário a confirmar", 100000002, { extraction: { legs: [] }, leg: { date: "", time: "", origin: "São Paulo", destination: "Campinas", vagueDate: true, vagueTime: true }, warnings: "Data e horário informados de forma vaga.", minutes: 38 }),
      row("mock-error", "Falha de sincronização PROD", 100000005, { warnings: "Ambiente PROD: tabela não encontrada (404). DEV não foi interrompido.", minutes: 52 }),
      row("mock-graph-timeout", "Outlook indisponível", 100000005, { warnings: "Microsoft Graph: timeout ao ler a pasta. Nenhum rascunho novo foi alterado.", body: "Cenário de teste: indisponibilidade temporária do Outlook/Graph.", minutes: 58 }),
      row("mock-token-expired", "Token expirado", 100000005, { warnings: "Autenticação do Outlook expirada. Reautentique antes da próxima execução.", body: "Cenário de teste: refresh token ausente ou expirado.", minutes: 62 }),
      row("mock-json-invalid", "Extração inválida", 100000005, { extractionJson: "{ \"isServiceRequest\": true,", warnings: "JSON da extração inválido; o trecho precisa ser reprocessado.", minutes: 66 }),
      row("mock-partial", "Criação parcial — retomar", 100000005, { warnings: "Reserva criada, mas uma relação de passageiro falhou. Retomar usa os IDs já criados.", partialIds: JSON.stringify({ reservationId: "mock-reserva-parcial-001", relationIds: [] }), minutes: 68 }),
      row("mock-attachments", "Pedido com anexo não analisado", 100000001, { hasAttachments: true, warnings: "Há anexo neste e-mail; o MVP não interpreta anexos.", body: "Solicitação de transporte. [Anexo presente — não analisado]", minutes: 72 }),
      row("mock-relative-date", "Data relativa resolvida", 100000001, { leg: { date: "2026-09-10", time: "14:00", origin: "Hotel Unique", destination: "GRU", notes: "‘Amanhã’ resolvido pelo recebimento em America/Sao_Paulo." }, body: "Pode ser amanhã às 14h, do Hotel Unique para GRU.", minutes: 75 }),
      row("mock-multi-1", "Vários serviços no mesmo e-mail", 100000001, { conversationId: "mock-multi-service", ordinal: 1, leg: { date: "2026-09-22", time: "08:00", origin: "Congonhas", destination: "Escritório Faria Lima" }, minutes: 80 }),
      row("mock-multi-2", "Vários serviços no mesmo e-mail", 100000001, { conversationId: "mock-multi-service", ordinal: 2, legType: "ida", leg: { ordinal: 2, date: "2026-09-23", time: "08:00", origin: "Congonhas", destination: "Escritório Faria Lima" }, minutes: 80 }),
      row("mock-multi-3", "Vários serviços no mesmo e-mail", 100000001, { conversationId: "mock-multi-service", ordinal: 3, legType: "retorno", leg: { ordinal: 3, type: "retorno", date: "2026-09-23", time: "18:00", origin: "Escritório Faria Lima", destination: "Congonhas" }, minutes: 80 }),
      row("mock-scheduled", "Já agendado — somente leitura", 100000003, { minutes: 70 }),
      row("mock-discarded", "Descartado pelo operador", 100000004, { minutes: 90 })
    ];
  }

  function getMockAiDrafts() {
    try {
      const parsed = JSON.parse(localStorage.getItem(MOCK_AI_DRAFTS_KEY) || "null");
      return Array.isArray(parsed) && parsed.length ? parsed : buildMockAiDrafts();
    } catch { return buildMockAiDrafts(); }
  }

  function setMockAiDrafts(rows) { localStorage.setItem(MOCK_AI_DRAFTS_KEY, JSON.stringify(rows)); }

  function seedMockAiDrafts() {
    setMockAiDrafts(buildMockAiDrafts());
    state.aiDrafts = getMockAiDrafts();
    state.selectedAiDraft = null;
    renderAiDrafts();
    toast("Exemplos de solicitações IA restaurados.", "success");
  }

  function updateMockAiDraftStatus(draft, status, extra = {}) {
    const rows = getMockAiDrafts().map((row) => aiDraftId(row) === aiDraftId(draft) ? { ...row, cr40f_status: status, cr40f_statusname: ({ 100000000: "Pendente", 100000001: "Pronto", 100000002: "Bloqueado", 100000003: "Agendado", 100000004: "Descartado", 100000005: "Erro" })[status], ...extra } : row);
    setMockAiDrafts(rows);
    state.aiDrafts = rows;
  }

  async function retrieveAll(entity, options) {
    if (!state.xrm) return [];
    const rows = [];
    let query = options.startsWith("?") ? options : `?${options}`;
    while (query) {
      const result = await state.xrm.WebApi.retrieveMultipleRecords(entity, query);
      rows.push(...(result.entities || []));
      query = result.nextLink ? `?${result.nextLink.split("?")[1]}` : "";
    }
    return rows;
  }

  async function loadCurrentRecord() {
    if (!state.recordId) {
      state.selectedPassengers = [emptyPassenger(1)];
      state.enderecoRascunho = [{ ordem: 1, endereco: "" }];
      return;
    }
    state.isNew = false;
    if (!state.xrm || state.mockMode) {
      hydrateMockCurrentRecord(state.recordId);
      return;
    }

    const f = CONFIG.fields.reserva;
    const select = [
      f.id,
      f.readableId,
      f.enderecoView,
      f.enderecoPersonalizado,
      f.destino,
      f.status,
      f.statusFaturamento,
      f.dataSaida,
      f.previsaoRetorno,
      f.tipoServico,
      f.tipoVeiculo,
      f.obsOperacao,
      f.obsInterna,
      f.obsFinal,
      f.perfilPassageiro,
      f.email,
      f.paxView,
      f.trajeto,
      f.cotacao,
      f.valorReceber,
      f.receber,
      f.cr,
      f.formaPagamento,
      f.origemVeiculo,
      "_cr40f_cliente_value",
      "_cr40f_solicitante_value",
      "_cr40f_motorista_value",
      "_cr40f_veiculo_value",
      "_cr40f_financeiro_value"
    ].join(",");

    const [record, relacoes] = await Promise.all([
      state.xrm.WebApi.retrieveRecord(CONFIG.entities.reserva, state.recordId, `?$select=${select}`),
      retrieveAll(
        CONFIG.entities.servicoPassageiro,
        `?$select=${CONFIG.fields.servicoPassageiro.id},${CONFIG.fields.servicoPassageiro.ordem},${CONFIG.fields.servicoPassageiro.endereco},_cr40f_bancodedados_value&$filter=_cr40f_geral_value eq ${state.recordId}&$orderby=${CONFIG.fields.servicoPassageiro.ordem} asc`
      )
    ]);
    state.record = record;
    state.relacoes = relacoes;
    await ensurePassengersByIds([
      state.record._cr40f_solicitante_value,
      ...state.relacoes.map((rel) => rel._cr40f_bancodedados_value)
    ]);

    const hasCustom = !!state.record[f.enderecoPersonalizado];
    const hasRelations = state.relacoes.length > 0;
    const anyRelationAddress = state.relacoes.some((r) => !!r[CONFIG.fields.servicoPassageiro.endereco]);
    state.enderecoPersonalizadoAtivo = hasCustom || (hasRelations && !anyRelationAddress);

    state.selectedPassengers = state.relacoes.length
      ? state.relacoes.map((rel, index) => {
          const paxId = rel._cr40f_bancodedados_value;
          const pax = state.passageiros.find((item) => sameId(item.id, paxId)) || {
            id: paxId,
            label: rel["_cr40f_bancodedados_value@OData.Community.Display.V1.FormattedValue"] || "(passageiro)",
            telefone: "",
            endereco: "",
            preferencias: "",
            email: "",
            cr: "",
            tipoVeiculo: ""
          };
          return {
            rowKey: nextPassengerRowKey(),
            ordem: Number(rel[CONFIG.fields.servicoPassageiro.ordem] || index + 1),
            passageiro: pax,
            guid: pax.id,
            telefone: pax.telefone || "",
            enderecoEditado: state.enderecoPersonalizadoAtivo ? "" : (rel[CONFIG.fields.servicoPassageiro.endereco] || pax.endereco || "")
          };
        })
      : [emptyPassenger(1)];
    hydratePassengerSelectionRecencyFromRows(state.selectedPassengers);

    state.enderecoRascunho = state.selectedPassengers.map((item) => ({
      ordem: item.ordem,
      endereco: item.enderecoEditado || ""
    }));
    return;
  }

  function hydrateForm() {
    const r = state.record || {};
    const f = CONFIG.fields.reserva;
    updateSaveButtonText();
    document.documentElement.classList.toggle("is-editing-service", !state.isNew);
    el.tabImport.hidden = !state.isNew;
    el.tabBd.hidden = false;
    el.tabReturn.hidden = !state.isNew;
    el.tabRepeat.hidden = !state.isNew;
    if (el.importXlsxButton) el.importXlsxButton.hidden = !state.isNew;
    if (el.xlsxImportInput) el.xlsxImportInput.disabled = !state.isNew;
    el.opWrap.hidden = state.isNew;
    el.recordIdBox.hidden = state.isNew;
    el.recordIdText.textContent = r[f.readableId] || "";

    const saida = r[f.dataSaida] ? new Date(r[f.dataSaida]) : null;
    const prevRet = r[f.previsaoRetorno] ? new Date(r[f.previsaoRetorno]) : null;
    setDateTimeFields(saida, el.saidaData, el.saidaHora, el.saidaMinuto, true);
    setDateTimeFields(prevRet, el.retPrevDateTime, el.retPrevHora, el.retPrevMinuto, true);

    setSelectValue(el.statusOperacao, r[f.status], findOptionValue("statusOperacao", "Confirmado"));
    setSelectValue(el.statusFaturamento, r[f.statusFaturamento], findOptionValue("statusFaturamento", "Pendente"));
    setSelectValue(el.tipoServico, r[f.tipoServico]);
    setSelectValue(el.tipoVeiculo, r[f.tipoVeiculo]);
    setSelectValue(el.formaPagamento, r[f.formaPagamento]);
    setSelectValue(el.cliente, r._cr40f_cliente_value);
    setSelectValue(el.solicitante, r._cr40f_solicitante_value);
    setSelectValue(el.motorista, r._cr40f_motorista_value);
    setSelectValue(el.veiculo, r._cr40f_veiculo_value);
    setSelectValue(el.op, r._cr40f_financeiro_value);
    state.vehicleOriginManual = Number(r[f.origemVeiculo]) === 100000001;

    el.trajeto.value = r[f.trajeto] || "";
    el.destino.value = r[f.destino] || "";
    el.cotacao.value = formatCurrencyDisplayValue(r[f.cotacao] ?? "");
    el.valorReceber.value = formatCurrencyDisplayValue(r[f.valorReceber] ?? "");
    el.cr.value = normalizeCodeValue(r[f.cr] || "");
    el.receber.checked = !!r[f.receber];
    setFieldValue(el.receberRetorno, false);
    state.obs.motorista = r[f.obsOperacao] || "";
    state.obs.interna = r[f.obsInterna] || "";
    state.obs.final = r[f.obsFinal] || "";
    state.obs.passageiro = r[f.perfilPassageiro] || "";
    el.observacao.value = state.obs.motorista;

    if (state.enderecoPersonalizadoAtivo) {
      el.enderecoPersonalizado.value = r[f.enderecoPersonalizado] || r[f.enderecoView] || composeEnderecoCompleto();
    }

    syncRepeatDefaultDates();
    syncReturnDefaults();
    applyPassengerDefaults(false);
    applyStatusFaturamentoDefault();
  }

  function renderAll() {
    renderChoiceSelect(el.statusOperacao, state.options.statusOperacao);
    renderStatusFaturamento();
    renderChoiceSelect(el.tipoServico, sortByLabel(state.options.tipoServico));
    renderChoiceSelect(el.tipoVeiculo, state.options.tipoVeiculo);
    renderChoiceSelect(el.formaPagamento, state.options.formaPagamento);
    renderLookupSelect(el.cliente, sortByLabel(state.clientes));
    renderLookupSelect(el.bdCliente, sortByLabel(state.clientes));
    renderLookupSelect(el.solicitante, state.passageiros);
    renderLookupSelect(el.motorista, sortByLabel(state.motoristas));
    renderLookupSelect(el.veiculo, state.veiculos);
    renderLookupSelect(el.op, state.ordensPagamento);
    renderChoiceSelect(el.bdClassificacao, state.options.bdClassificacao);
    renderChoiceSelect(el.bdSexo, state.options.bdSexo);
    renderChoiceSelect(el.bdIdioma, state.options.bdIdioma);
    renderChoiceSelect(el.bdCargo, state.options.bdCargo);
    renderChoiceSelect(el.bdTipoVeiculo, state.options.bdTipoVeiculo);
    hydrateForm();
    renderMotoristaVehicleHint();
    renderScheduleDrafts();
    renderPassengers();
    renderTabBadges();
    renderImportReview();
    renderGlobalImportHistoryControls();
    renderAiDrafts();
    renderAiConversation();
  }

  function aiDraftConfig() {
    return AI_DRAFT_CONFIG;
  }

  function aiDraftValue(row, key) {
    const field = aiDraftConfig()?.fields?.[key];
    return field ? row?.[field] : "";
  }

  function aiDraftStatusLabel(row) {
    const field = aiDraftConfig()?.fields?.status;
    const formatted = field ? row?.[`${field}@OData.Community.Display.V1.FormattedValue`] : "";
    if (formatted) return formatted;
    const raw = aiDraftValue(row, "status");
    const labels = aiDraftConfig()?.statusLabels || {};
    return labels[String(raw)] || String(raw || "Pendente");
  }

  function aiDraftStatusTone(row) {
    const label = normalize(aiDraftStatusLabel(row));
    if (label.startsWith("agendad")) return "done";
    if (label.startsWith("pront")) return "ready";
    if (label.startsWith("bloquead")) return "blocked";
    if (label.startsWith("erro")) return "error";
    if (label.startsWith("descartad")) return "muted";
    return "pending";
  }

  function aiDraftId(row) {
    return aiDraftValue(row, "id") || row?.["@odata.etag"] || "";
  }

  function aiDraftEnvironmentLabel() {
    const url = String(state.xrm?.Utility?.getGlobalContext?.().getClientUrl?.() || "").toLowerCase();
    if (url.includes("org23b93544")) return "DEV";
    if (url.includes("orgf261ae8e")) return "PROD";
    return url ? "ambiente atual" : "local";
  }

  function parseAiDraftJson(row, key) {
    try { return JSON.parse(aiDraftValue(row, key) || "{}"); } catch { return {}; }
  }

  function aiDraftExtractionForRow(row) {
    const extraction = parseAiDraftJson(row, "extractionJson");
    const overrides = state.aiDraftIdentityOverrides[aiDraftId(row)] || {};
    if (overrides.clientId) extraction.clientId = overrides.clientId;
    if (overrides.requesterId) extraction.requesterId = overrides.requesterId;
    extraction.passengers = (extraction.passengers || []).map((passenger, index) => ({ ...passenger, id: overrides[`passenger:${index}`] || passenger.id || "" }));
    return extraction;
  }

  function handleAiDraftCandidateChange(event) {
    const select = event.target.closest("[data-ai-identity]");
    const draft = state.selectedAiDraft;
    if (!select || !draft) return;
    const key = select.dataset.aiIdentity;
    const id = select.value || "";
    const draftKey = aiDraftId(draft);
    state.aiDraftIdentityOverrides[draftKey] = { ...(state.aiDraftIdentityOverrides[draftKey] || {}), [key]: id };
    renderAiDraftDetail();
  }

  function aiDraftCandidateGroups(draft, extraction) {
    const candidates = extraction.matchCandidates || parseAiDraftJson(draft, "matchCandidates");
    return {
      client: Array.isArray(candidates?.client) ? candidates.client : [],
      requester: Array.isArray(candidates?.requester) ? candidates.requester : [],
      passengers: Array.isArray(candidates?.passengers) ? candidates.passengers : []
    };
  }

  function aiDraftIdentityState(id, name, items) {
    if (id) return { label: "Confirmado", tone: "confirmed" };
    if (!name) return { label: "Não informado", tone: "missing" };
    if (items.length > 1) return { label: "Múltiplos candidatos", tone: "warning" };
    if (items.length === 1) return { label: "Confirmação pendente", tone: "warning" };
    return { label: "Não encontrado", tone: "danger" };
  }

  function appendAiDraftField(label, value, identityKey = "", identityState = null) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    const valueNode = document.createElement("span");
    valueNode.className = "ai-field-value";
    valueNode.textContent = value || "Não informado";
    dd.appendChild(valueNode);
    if (identityState) {
      const stateNode = document.createElement("span");
      stateNode.className = `ai-field-state ai-field-state--${identityState.tone}`;
      stateNode.textContent = identityState.label;
      dd.appendChild(stateNode);
    }
    if (identityKey) {
      const slot = document.createElement("span");
      slot.className = "ai-inline-candidate-slot";
      slot.dataset.aiIdentitySlot = identityKey;
      dd.appendChild(slot);
    }
    el.aiDraftFields.append(dt, dd);
  }

  function renderAiDraftCandidates(draft, extraction) {
    if (!el.aiDraftCandidates || !el.aiDraftFields) return;
    const candidates = aiDraftCandidateGroups(draft, extraction);
    const overrides = state.aiDraftIdentityOverrides[aiDraftId(draft)] || {};
    el.aiDraftCandidates.replaceChildren();
    const add = (key, items, fallbackId) => {
      if (!Array.isArray(items) || items.length === 0) return;
      const slot = el.aiDraftFields.querySelector(`[data-ai-identity-slot="${key}"]`);
      if (!slot) return;
      const label = document.createElement("label");
      label.className = "ai-inline-candidate";
      const caption = document.createElement("span");
      caption.textContent = items.length > 1 ? "Escolha o registro correto" : "Confirme a sugestão";
      const select = document.createElement("select");
      select.dataset.aiIdentity = key;
      select.setAttribute("aria-label", caption.textContent);
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Selecionar registro";
      select.appendChild(empty);
      items.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.id || "";
        option.textContent = `${item.name || "Registro"}${item.reasons?.length ? ` — ${item.reasons.join(", ")}` : ""}`;
        select.appendChild(option);
      });
      select.value = overrides[key] || fallbackId || "";
      label.append(caption, select);
      slot.appendChild(label);
    };
    add("clientId", candidates.client, extraction.clientId);
    add("requesterId", candidates.requester, extraction.requesterId);
    candidates.passengers.forEach((items, index) => add(`passenger:${index}`, items, extraction.passengers?.[index]?.id));
    el.aiDraftCandidates.hidden = true;
  }

  function aiDraftReadiness(draft, extraction, leg) {
    const reasons = [];
    const status = aiDraftStatusLabel(draft);
    if (!aiDraftId(draft)) reasons.push("Rascunho sem identificador");
    if (!["Pendente", "Pronto"].includes(status)) reasons.push(`Status ${status.toLowerCase()}`);
    if (!extraction.clientId) reasons.push("confirme o cliente");
    if (!extraction.requesterId) reasons.push("confirme o solicitante");
    if (!(extraction.passengers || []).length) reasons.push("informe ao menos um passageiro");
    if ((extraction.passengers || []).some((passenger) => !passenger?.id)) reasons.push("confirme todos os passageiros");
    if (!leg.date) reasons.push("informe a data");
    if (!leg.time) reasons.push("informe o horário");
    if (!leg.origin) reasons.push("informe a origem");
    if (!leg.destination) reasons.push("informe o destino");
    return { ready: reasons.length === 0, reasons };
  }

  function renderAiDraftAlerts(draft, extraction) {
    if (!el.aiDraftAlertList) return;
    const alerts = [];
    const warningText = aiDraftValue(draft, "warnings");
    if (warningText) alerts.push(...String(warningText).split(/\r?\n|;\s*/).map((item) => item.trim()).filter(Boolean));
    const missingFields = extraction.missingFields || String(aiDraftValue(draft, "missingFields") || "").split(",").map((item) => item.trim()).filter(Boolean);
    missingFields.forEach((field) => alerts.push(`Campo faltante: ${field}`));
    const candidates = aiDraftCandidateGroups(draft, extraction);
    if (candidates.client.length > 1) alerts.push("Cliente com múltiplos candidatos.");
    if (candidates.requester.length > 1) alerts.push("Solicitante com múltiplos candidatos.");
    candidates.passengers.forEach((items, index) => { if (items.length > 1) alerts.push(`Passageiro ${index + 1} com múltiplos candidatos.`); });
    const partial = aiDraftValue(draft, "partialIds");
    if (partial) alerts.push("Criação parcial registrada. Use Retomar para continuar sem duplicar.");
    el.aiDraftAlertList.replaceChildren();
    if (!alerts.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Nenhum alerta para esta solicitação.";
      el.aiDraftAlertList.appendChild(empty);
    } else {
      alerts.forEach((message) => {
        const item = document.createElement("p");
        item.className = "ai-alert-item";
        item.textContent = message;
        el.aiDraftAlertList.appendChild(item);
      });
    }
    el.aiDraftAlertCount.hidden = !alerts.length;
    el.aiDraftAlertCount.textContent = String(alerts.length);
  }

  function setAiDraftSourceTab(tab) {
    state.aiDraftSourceTab = tab === "alerts" ? "alerts" : "email";
    const isEmail = state.aiDraftSourceTab === "email";
    [el.aiDraftSourceEmailTab, el.aiDraftSourceAlertsTab].forEach((button) => {
      if (!button) return;
      const active = isEmail === (button.dataset.aiSourceTab === "email");
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    if (el.aiDraftSourceEmailPanel) el.aiDraftSourceEmailPanel.hidden = !isEmail;
    if (el.aiDraftSourceAlertsPanel) el.aiDraftSourceAlertsPanel.hidden = isEmail;
  }

  function aiDraftSearchText(row) {
    const extraction = parseAiDraftJson(row, "extractionJson");
    const leg = parseAiDraftJson(row, "legJson");
    return normalize([
      aiDraftValue(row, "subject"), aiDraftValue(row, "sender"), extraction.client,
      extraction.requester, ...(extraction.passengers || []).map((item) => item?.name || item),
      leg.origin, leg.destination, leg.route
    ].filter(Boolean).join(" "));
  }

  function aiDraftVisibleRows() {
    const filter = state.aiDraftFilter || "active";
    const search = normalize(state.aiDraftSearch || "");
    return (state.aiDrafts || []).filter((row) => {
      const status = aiDraftStatusLabel(row);
      const statusMatch = filter === "all" || (filter === "active" ? ["Pendente", "Bloqueado", "Erro"].includes(status) : status === filter);
      return statusMatch && (!search || aiDraftSearchText(row).includes(search));
    });
  }

  function groupAiDraftRows(rows) {
    const groups = new Map();
    rows.forEach((row) => {
      const key = aiDraftValue(row, "conversationId") || aiDraftValue(row, "stableMessageId") || aiDraftId(row);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return [...groups.values()].sort((left, right) => String(aiDraftValue(right[0], "receivedAt") || "").localeCompare(String(aiDraftValue(left[0], "receivedAt") || "")));
  }

  async function loadAiDrafts() {
    if (!el.aiDraftList) return;
    const config = aiDraftConfig();
    if (!config) {
      el.aiDraftSetup.hidden = false;
      el.aiDraftSetup.textContent = "A aba está pronta. Configure window.__FORMULARIO_IA_DRAFT_CONFIG com a tabela e os campos lógicos criados na solução DEV.";
      el.aiDraftList.replaceChildren();
      el.aiDraftDetail.hidden = true;
      return;
    }
    if (state.mockMode) {
      if (el.aiDraftEnvironment) el.aiDraftEnvironment.textContent = "Ambiente: local mock";
      if (el.aiDraftSeed) el.aiDraftSeed.hidden = false;
      state.aiDrafts = getMockAiDrafts();
      renderAiDrafts();
      return;
    }
    if (!state.xrm) {
      el.aiDraftSetup.hidden = false;
      el.aiDraftSetup.textContent = "Solicitações IA ficam disponíveis quando o Web Resource estiver aberto dentro do Dataverse.";
      return;
    }
    if (el.aiDraftEnvironment) el.aiDraftEnvironment.textContent = `Ambiente: ${aiDraftEnvironmentLabel()}`;
    const select = [...new Set(Object.entries(config.fields).filter(([key]) => !AI_DRAFT_OPTIONAL_KEYS.has(key)).map(([, value]) => value).filter((value) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value))))].join(",");
    state.aiDraftLoading = true;
    try {
      const result = await state.xrm.WebApi.retrieveMultipleRecords(config.entity, `?$select=${select}&$orderby=createdon desc&$top=100`);
      state.aiDrafts = result.entities || [];
      renderAiDrafts();
    } catch (error) {
      state.aiDrafts = [];
      el.aiDraftSetup.hidden = false;
      el.aiDraftSetup.textContent = `Não foi possível carregar solicitações IA: ${error.message || "erro de conexão"}`;
    } finally {
      state.aiDraftLoading = false;
    }
  }

  function renderAiDrafts() {
    if (!el.aiDraftList) return;
    const drafts = aiDraftVisibleRows();
    const total = (state.aiDrafts || []).length;
    if (state.selectedAiDraft && !drafts.some((row) => aiDraftId(row) === aiDraftId(state.selectedAiDraft))) state.selectedAiDraft = null;
    el.aiDraftSummary.textContent = drafts.length ? `${drafts.length} trecho(s) em ${groupAiDraftRows(drafts).length} solicitação(ões). Aprovação individual, sem criação automática.` : (total ? "Nenhum item corresponde ao filtro." : "Nenhuma solicitação pendente.");
    el.aiDraftList.replaceChildren();
    if (!state.selectedAiDraft && el.aiDraftDetail) el.aiDraftDetail.hidden = true;
    groupAiDraftRows(drafts).forEach((group) => {
      const section = document.createElement("section");
      section.className = "ai-draft-group";
      const heading = document.createElement("h3");
      heading.className = "ai-draft-group-title";
      heading.textContent = aiDraftValue(group[0], "subject") || "Solicitação sem assunto";
      const meta = document.createElement("p");
      meta.className = "muted";
      meta.textContent = `${aiDraftValue(group[0], "sender") || "Remetente não informado"} · ${group.length} trecho(s)`;
      section.append(heading, meta);
      group.sort((left, right) => Number(aiDraftValue(left, "ordinal") || 0) - Number(aiDraftValue(right, "ordinal") || 0)).forEach((draft) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `ai-draft-item${state.selectedAiDraft && aiDraftId(state.selectedAiDraft) === aiDraftId(draft) ? " is-selected" : ""}`;
        button.dataset.aiDraftId = aiDraftId(draft);
        const title = document.createElement("strong");
        const leg = parseAiDraftJson(draft, "legJson");
        title.textContent = `${aiDraftValue(draft, "legType") || "Trecho"} · ${leg.origin || "origem?"} → ${leg.destination || "destino?"}`;
        const itemMeta = document.createElement("span");
        itemMeta.textContent = aiDraftStatusLabel(draft);
        itemMeta.dataset.tone = aiDraftStatusTone(draft);
        button.append(title, itemMeta);
        section.appendChild(button);
      });
      el.aiDraftList.appendChild(section);
    });
    if (state.selectedAiDraft) renderAiDraftDetail();
  }

  function aiConversationConfig() {
    return AI_CONVERSATION_CONFIG;
  }

  function aiConversationCore() {
    return AI_CONVERSATION_CORE;
  }

  function aiConversationStatusLabel(status) {
    const labels = {
      DRAFT: "Rascunho",
      WAITING_AI: "Interpretando",
      WAITING_USER: "Aguardando dados",
      READY: "Pronto para confirmar",
      SCHEDULING: "Registrando",
      PARTIAL: "Registro parcial",
      SCHEDULED: "Solicitação criada",
      ERROR: "Erro",
      CANCELLED: "Cancelado"
    };
    return labels[String(status || "DRAFT").toUpperCase()] || String(status || "Rascunho");
  }

  function aiConversationStoreRead(key = AI_CONVERSATION_MOCK_KEY) {
    try { return JSON.parse(window.localStorage.getItem(key) || "null"); } catch (_) { return null; }
  }

  function aiConversationStoreWrite(session, key = AI_CONVERSATION_MOCK_KEY) {
    try { window.localStorage.setItem(key, JSON.stringify(session)); } catch (_) { /* modo local sem persistencia */ }
  }

  function aiConversationSessionStorageKey() {
    try {
      const context = state.xrm?.Utility?.getGlobalContext?.();
      const userId = cleanGuid(context?.userSettings?.userId).toLowerCase();
      const environment = String(context?.getClientUrl?.() || "").replace(/\/$/, "").toLowerCase();
      return userId && environment ? `${AI_CONVERSATION_SESSION_KEY}:${environment}:${userId}` : "";
    } catch (_) { return ""; }
  }

  function aiConversationStoredSessionId() {
    try {
      const key = aiConversationSessionStorageKey();
      const id = key ? cleanGuid(window.localStorage.getItem(key)) : "";
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : "";
    } catch (_) { return ""; }
  }

  function aiConversationRememberSession(id = "") {
    try {
      const key = aiConversationSessionStorageKey();
      if (!key) return;
      if (id) window.localStorage.setItem(key, cleanGuid(id));
      else window.localStorage.removeItem(key);
    } catch (_) { /* sessão continua em memória */ }
  }

  function aiConversationLocalReservationsRead() {
    try {
      const value = JSON.parse(window.localStorage.getItem(AI_CONVERSATION_LOCAL_RESERVATIONS_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) { return []; }
  }

  function aiConversationLocalReservationsWrite(records) {
    try { window.localStorage.setItem(AI_CONVERSATION_LOCAL_RESERVATIONS_KEY, JSON.stringify(records)); } catch (_) { /* modo local sem persistencia */ }
  }

  function aiConversationCreateLocalReservations(session) {
    if (!AI_CONVERSATION_CORE?.buildLocalReservationRecords) return [];
    const existing = aiConversationLocalReservationsRead();
    const created = AI_CONVERSATION_CORE.buildLocalReservationRecords({ session, existingRecords: existing });
    const byKey = new Map(existing.map((record) => [record.idempotencyKey, record]));
    created.forEach((record) => byKey.set(record.idempotencyKey, record));
    aiConversationLocalReservationsWrite(Array.from(byKey.values()));
    return created;
  }

  function aiConversationMessage(role, content) {
    return { role, content: String(content || ""), at: new Date().toISOString() };
  }

  function aiConversationField(configKey) {
    return aiConversationConfig()?.fields?.[configKey] || "";
  }

  function aiConversationPayloadValue(payload, key, value) {
    const field = aiConversationField(key);
    if (field && value !== undefined && value !== null) payload[field] = value;
  }

  function aiConversationStatusValue(status) {
    const configured = aiConversationConfig()?.statusValues?.[status];
    return configured ?? status;
  }

  function aiConversationStatusFromRow(value) {
    const config = aiConversationConfig();
    const raw = value == null ? "" : String(value).toUpperCase();
    if (Object.prototype.hasOwnProperty.call(config?.statusValues || {}, raw)) return raw;
    const match = Object.entries(config?.statusValues || {}).find(([, option]) => String(option) === String(value));
    return match ? match[0] : raw || "DRAFT";
  }

  function aiConversationEntityId(row) {
    return cleanGuid(row?.[aiConversationField("id")] || row?.id || row?.cr40f_conversaiaagendamentoid || "");
  }

  function aiConversationRowToSession(row) {
    if (!row) return null;
    const parseJson = (value, fallback) => {
      try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
    };
    const read = (key) => row[aiConversationField(key)] ?? row[key];
    const proposal = parseJson(read("proposalJson"), row.proposal || {});
    const messages = parseJson(read("messagesJson"), row.messages || []);
    const core = aiConversationCore();
    const normalized = core ? core.normalizeSession({
      id: aiConversationEntityId(row),
      status: aiConversationStatusFromRow(read("status")),
      inputVersion: read("inputVersion"),
      processedVersion: read("processedVersion"),
      confirmationRequested: read("confirmationRequested") === true || read("confirmationRequested") === 1,
      confirmationVersion: read("confirmationVersion"),
      originalText: read("originalText"),
      proposal,
      messages,
      createdReservationIds: parseJson(read("createdReservationIds"), row.createdReservationIds || []),
      error: read("error")
    }) : null;
    if (!normalized) return { id: aiConversationEntityId(row), status: "DRAFT", messages, proposal };
    const resolvedProposal = aiConversationResolveLocalProposal(normalized.proposal || {}, "", [], { preserveResolvedIds: true });
    const resolvedValidation = core.validateProposal(resolvedProposal);
    return {
      ...normalized,
      status: normalized.status === "WAITING_USER" && resolvedValidation.ready ? "READY" : normalized.status,
      proposal: resolvedValidation.normalized,
      missing: resolvedValidation.missing,
      warnings: resolvedValidation.warnings,
      ready: resolvedValidation.ready
    };
  }

  function aiConversationIdentityByLabel(collection, label) {
    const needle = normalize(String(label || ""));
    if (!needle) return null;
    const exact = (collection || []).find((item) => normalize(item?.label || item?.nome || item?.name) === needle);
    return exact ? { id: exact.id || exact.guid || "", name: exact.label || exact.nome || exact.name || "" } : null;
  }

  function aiConversationOptionByLabel(collection, value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const numeric = /^\d+$/.test(raw) ? Number(raw) : null;
    const match = (collection || []).find((item) => numeric !== null ? Number(item.value) === numeric : normalize(item.label) === normalize(raw));
    return match ? { value: match.value, name: match.label } : null;
  }

  // O modelo sugere rótulos; somente o catálogo carregado no app pode fornecer
  // os valores reais de choice/lookup. IDs recebidos da IA nunca são aceitos
  // sem correspondência local exata.
  function aiConversationResolveLocalChoice(collection, option, options = {}) {
    if (!option) return option;
    const label = option.name || option.label || "";
    const rawValue = option.value ?? option.id;
    const match = (collection || []).find((item) => {
      const sameValue = rawValue !== null && rawValue !== undefined && rawValue !== ""
        && String(item.value) === String(rawValue);
      return sameValue || normalize(item.label) === normalize(label);
    });
    return match
      ? { value: match.value, id: String(match.value), name: match.label, label: match.label }
      : { ...option, value: options.preserveResolvedIds && rawValue !== null && rawValue !== undefined && rawValue !== "" ? rawValue : null, id: options.preserveResolvedIds && rawValue ? String(rawValue) : "", name: label, label };
  }

  function aiConversationChoiceHasContext(message, history, kind) {
    const current = normalize(message);
    const context = normalize([...(history || []).map((item) => item?.content || ""), message].join("\n"));
    if (/(?:^|[.;,]\s*)e\s+[a-z]/i.test(current)) return true;
    if (kind === "vehicle") return /veiculo|carro|van|blindado|tipo\s+de\s+veiculo/i.test(context);
    return /servico|transfer|trecho|tipo\s+de\s+servico/i.test(context);
  }

  function aiConversationChoiceHint(collection, message, history, kind) {
    if (!aiConversationChoiceHasContext(message, history, kind)) return null;
    const needle = normalize(message);
    if (!needle) return null;
    const matches = (collection || []).filter((item) => {
      const label = normalize(item.label);
      return label && needle.includes(label);
    });
    return matches.length === 1 ? { value: matches[0].value, id: String(matches[0].value), name: matches[0].label, label: matches[0].label } : null;
  }

  function aiConversationResolveLocalIdentity(collection, identity, options = {}) {
    if (!identity) return identity;
    const label = identity.name || identity.label || "";
    const match = (collection || []).find((item) => normalize(item.label || item.nome || item.name) === normalize(label));
    return match
      ? { ...identity, id: match.id || match.guid || "", name: match.label || match.nome || match.name || label }
      : { ...identity, id: options.preserveResolvedIds && identity.id ? identity.id : "", name: label };
  }

  function aiConversationResolveLocalProposal(proposal, message = "", history = [], options = {}) {
    const core = aiConversationCore();
    const normalized = core ? core.normalizeProposal(proposal || {}) : (proposal || {});
    return {
      ...normalized,
      client: aiConversationResolveLocalIdentity(state.clientes, normalized.client, options),
      requester: aiConversationResolveLocalIdentity(state.passageiros, normalized.requester, options),
      passengers: (normalized.passengers || []).map((passenger) => aiConversationResolveLocalIdentity(state.passageiros, passenger, options)),
      services: (normalized.services || []).map((service) => ({
        ...service,
        passengers: (service.passengers || []).map((passenger) => aiConversationResolveLocalIdentity(state.passageiros, passenger, options)),
        serviceType: aiConversationResolveLocalChoice(state.options.tipoServico, service.serviceType, options)?.value
          ? aiConversationResolveLocalChoice(state.options.tipoServico, service.serviceType, options)
          : aiConversationChoiceHint(state.options.tipoServico, message, history, "service") || aiConversationResolveLocalChoice(state.options.tipoServico, service.serviceType, options),
        vehicleType: aiConversationResolveLocalChoice(state.options.tipoVeiculo, service.vehicleType, options)?.value
          ? aiConversationResolveLocalChoice(state.options.tipoVeiculo, service.vehicleType, options)
          : aiConversationChoiceHint(state.options.tipoVeiculo, message, history, "vehicle") || aiConversationResolveLocalChoice(state.options.tipoVeiculo, service.vehicleType, options)
      }))
    };
  }

  function aiConversationChoiceCandidates(collection, message, history, kind) {
    if (!aiConversationChoiceHasContext(message, history, kind)) return [];
    const needle = normalize(message);
    if (!needle) return [];
    return (collection || []).filter((item) => {
      const label = normalize(item.label);
      return label && needle.includes(label);
    }).map((item) => item.label).filter(Boolean).slice(0, 5);
  }

  function localSaoPauloDate(offsetDays = 0) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date()).reduce((acc, item) => ({ ...acc, [item.type]: item.value }), {});
    const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offsetDays));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  function parseLocalAiConversationText(rawText, previousProposal = {}) {
    const core = aiConversationCore();
    if (!core) return { proposal: {}, validation: { ready: false, missing: ["core"], warnings: [] } };
    const raw = String(rawText || "").trim();
    if (raw.startsWith("{")) {
      try {
        const proposal = core.normalizeProposal(JSON.parse(raw));
        return { proposal, validation: core.validateProposal(proposal) };
      } catch (_) {
        return { proposal: {}, validation: { ready: false, missing: ["JSON válido"], warnings: [] } };
      }
    }
    const valueOf = (key) => {
      const match = raw.match(new RegExp(`(?:^|\\n)\\s*${key}\\s*:\\s*(.+?)(?=\\n|$)`, "i"));
      return match ? match[1].trim() : "";
    };
    const previous = core.normalizeProposal(previousProposal || {});
    const previousService = previous.services?.[0] || {};
    const clientLabel = valueOf("cliente");
    const requesterLabel = valueOf("solicitante");
    const passengerLabel = valueOf("passageiro(?:s)?");
    const clientFromAnswer = !clientLabel && !previous.client?.id ? aiConversationIdentityByLabel(state.clientes, raw) : null;
    const requesterFromAnswer = !requesterLabel && !previous.requester?.id ? aiConversationIdentityByLabel(state.passageiros, raw) : null;
    const passengerFromAnswer = !passengerLabel && !previous.passengers?.some((item) => item?.id) ? aiConversationIdentityByLabel(state.passageiros, raw) : null;
    const routeMatch = raw.match(/\b([A-Za-zÀ-ÿ]{2,20})\s+(?:para|p\/|→|->)\s+([A-Za-zÀ-ÿ]{2,30})/i);
    const timeMatch = raw.match(/\b(?:às|as|a)\s*(\d{1,2})(?::(\d{2}))?\s*(?:h|horas)?\b/i) || raw.match(/\b(\d{1,2}:\d{2})\b/);
    const explicitDate = valueOf("data");
    const naturalDate = /\bamanh[ãa]\b/i.test(raw) ? localSaoPauloDate(1) : /\bhoje\b/i.test(raw) ? localSaoPauloDate(0) : "";
    const passengerTail = routeMatch ? raw.slice(routeMatch.index + routeMatch[0].length) : "";
    const naturalPassengers = passengerTail
      .split(/[;|]/)
      .map((part) => part.replace(/^\s*[-–—]\s*/, "").replace(/\s+-\s+(?:\+?[\d ()-]+|indeterminado).*$/i, "").trim())
      .filter((name) => name.length >= 4 && !/^(?:e|com|para|às|as)$/i.test(name))
      .map((name) => aiConversationIdentityByLabel(state.passageiros, name) || { name });
    const nextService = {
      ...previousService,
      date: core.normalizeDate(explicitDate) || previousService.date || naturalDate,
      time: core.normalizeTime(valueOf("hora") || (timeMatch ? (timeMatch[2] ? `${timeMatch[1]}:${timeMatch[2]}` : timeMatch[1]) : "")) || previousService.time,
      serviceType: aiConversationOptionByLabel(state.options.tipoServico, valueOf("(?:serviço|servico)")) || previousService.serviceType || aiConversationOptionByLabel(state.options.tipoServico, raw),
      vehicleType: aiConversationOptionByLabel(state.options.tipoVeiculo, valueOf("(?:veículo|veiculo)")) || previousService.vehicleType || aiConversationOptionByLabel(state.options.tipoVeiculo, raw),
      origin: valueOf("origem") || previousService.origin || routeMatch?.[1] || "",
      destination: valueOf("destino") || previousService.destination || routeMatch?.[2] || "",
      route: valueOf("trajeto") || previousService.route || (routeMatch ? `${routeMatch[1]} → ${routeMatch[2]}` : ""),
      notes: valueOf("(?:observação|observacao)") || previousService.notes || ""
    };
    const explicitPassengers = passengerLabel
      ? passengerLabel.split(/[,;]\s*/).map((item) => aiConversationIdentityByLabel(state.passageiros, item) || { name: item })
      : [];
    const proposal = {
      ...previous,
      intent: "schedule",
      client: aiConversationIdentityByLabel(state.clientes, clientLabel) || clientFromAnswer || (clientLabel ? { name: clientLabel } : previous.client),
      requester: aiConversationIdentityByLabel(state.passageiros, requesterLabel) || requesterFromAnswer || (requesterLabel ? { name: requesterLabel } : previous.requester),
      passengers: explicitPassengers.length ? explicitPassengers : previous.passengers?.length ? previous.passengers : passengerFromAnswer ? [passengerFromAnswer] : naturalPassengers,
      services: previous.services?.length ? [nextService, ...previous.services.slice(1)] : [nextService]
    };
    const validation = core.validateProposal(proposal);
    return { proposal, validation };
  }

  function aiConversationSummary(session) {
    const proposal = session?.proposal || {};
    const service = proposal.services?.[0] || {};
    const when = [service.date, service.time].filter(Boolean).join(" às ");
    const route = [service.origin, service.destination].filter(Boolean).join(" → ");
    return [
      proposal.client?.name ? `Cliente: ${proposal.client.name}` : "Cliente: pendente",
      proposal.passengers?.length ? `Passageiro(s): ${proposal.passengers.map((item) => item.name || "sem nome").join(", ")}` : "Passageiro(s): pendente",
      when ? `Quando: ${when}` : "Quando: pendente",
      route ? `Rota: ${route}` : "Rota: pendente",
      proposal.services?.length > 1 ? `Serviços: ${proposal.services.length}` : "Serviço: 1"
    ].join("\n");
  }

  function aiConversationFirstQuestion(missing) {
    const first = String(missing?.[0] || "");
    const serviceMatch = /^services\[(\d+)\]\.(.+)$/.exec(first);
    const labels = {
      client: "Qual é o cliente da solicitação?",
      "client.id": "Selecione o cliente cadastrado na revisão.",
      "client.registrationConfirmation": "O cliente não está cadastrado. Confirme o cadastro separado antes de continuar.",
      requester: "Quem é o solicitante?",
      "requester.id": "Selecione o solicitante cadastrado na revisão.",
      "requester.registrationConfirmation": "O solicitante não está cadastrado. Confirme o cadastro separado antes de continuar.",
      passengers: "Qual é o passageiro?",
      "passengers.id": "Selecione o passageiro cadastrado no serviço.",
      "passengers.registrationConfirmation": "Há passageiro sem cadastro. Confirme o cadastro separado antes de continuar.",
      services: "Qual serviço deve ser agendado?",
      "services[0].date": "Qual é a data do serviço? Use AAAA-MM-DD.",
      "services[0].time": "Qual é o horário do serviço? Use HH:MM.",
      "services[0].serviceType": "Qual é o tipo de serviço? Não vou inferir.",
      "services[0].vehicleType": "Qual é o tipo de veículo? Não vou inferir.",
      "services[0].origin": "Qual é a origem?",
      "services[0].destination": "Qual é o destino?",
      "services[0].passengers": "Qual passageiro participa deste serviço?"
    };
    const key = serviceMatch ? `services[0].${serviceMatch[2]}` : first;
    const question = labels[key] || "Revise os campos destacados e complete os dados pendentes.";
    return serviceMatch ? `Serviço ${Number(serviceMatch[1]) + 1}: ${question}` : question;
  }

  function openAiRegistrationProposal(event) {
    const button = event.target.closest("[data-ai-registration-name]");
    if (!button) return;
    const name = String(button.dataset.aiRegistrationName || "").trim();
    if (!name) return;
    setTab("bd");
    if (el.bdNome) {
      el.bdNome.value = name;
      el.bdNome.focus();
      el.bdNome.select?.();
    }
    toast(`Cadastro separado aberto para ${name}. Salve e depois atualize a conversa antes de confirmar.`, "warning", 8000);
  }

  async function loadAiConversation() {
    if (!el.aiConversationMessages) return;
    if (state.aiConversationReviewDirty) { toast("Salve a revisão antes de atualizar a conversa.", "warning"); return; }
    if (state.aiConversationPollingTimer) clearTimeout(state.aiConversationPollingTimer);
    state.aiConversationPollingTimer = null;
    if (!aiConversationCore()) {
      showAiConversationSetup("Core de conversa não carregado no Web Resource.");
      return;
    }
    if (AI_CONVERSATION_LOCAL_MODE) {
      clearAiConversationSetup();
      if (el.aiConversationEnvironment) el.aiConversationEnvironment.textContent = "Ambiente: localhost · proxy DeepSeek";
      state.aiConversation = aiConversationRowToSession(aiConversationStoreRead(AI_CONVERSATION_LOCAL_KEY)) || {
        id: `local-${Date.now()}`, status: "DRAFT", inputVersion: 0, processedVersion: 0,
        originalText: "", messages: [{ role: "assistant", content: "Cole a solicitação do cliente. Eu organizo os dados para sua revisão." }], proposal: {}, missing: ["services"], warnings: [], ready: false
      };
      renderAiConversation();
      return;
    }
    if (state.mockMode) {
      clearAiConversationSetup();
      if (el.aiConversationEnvironment) el.aiConversationEnvironment.textContent = "Ambiente: local demonstrativo";
      state.aiConversation = aiConversationRowToSession(aiConversationStoreRead()) || {
        id: `mock-${Date.now()}`, status: "DRAFT", inputVersion: 0, processedVersion: 0,
        originalText: "", messages: [{ role: "assistant", content: "Cole a solicitação do cliente para começar." }], proposal: {}, missing: ["services"], warnings: [], ready: false
      };
      renderAiConversation();
      return;
    }
    if (!aiConversationConfig() || !state.xrm) {
      showAiConversationSetup("A aba está pronta. Publique a tabela de sessão e abra o Web Resource dentro do Dataverse para habilitar o agendamento assíncrono.");
      return;
    }
    if (el.aiConversationEnvironment) el.aiConversationEnvironment.textContent = `Ambiente: ${aiDraftEnvironmentLabel()}`;
    const sessionId = aiConversationStoredSessionId();
    if (!sessionId) {
      clearAiConversationSetup();
      state.aiConversation ||= { id: "", status: "DRAFT", inputVersion: 0, processedVersion: 0, messages: [], proposal: {}, missing: ["services"], warnings: [], ready: false };
      renderAiConversation();
      return;
    }
    try {
      const config = aiConversationConfig();
      const select = [...new Set(Object.values(config.fields).filter((value) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value))))].join(",");
      const row = await state.xrm.WebApi.retrieveRecord(config.entity, sessionId, `?$select=${select}`);
      state.aiConversation = aiConversationRowToSession(row);
      state.aiConversationPollStartedAt = 0;
      state.aiConversationPollAttempts = 0;
      clearAiConversationSetup();
      renderAiConversation();
      if (["WAITING_AI", "SCHEDULING"].includes(state.aiConversation?.status)) scheduleAiConversationPoll(1500);
    } catch (error) {
      if (Number(error.status) === 404) {
        aiConversationRememberSession();
        state.aiConversation = { id: "", status: "DRAFT", inputVersion: 0, processedVersion: 0, messages: [], proposal: {}, missing: ["services"], warnings: [], ready: false };
        clearAiConversationSetup();
        renderAiConversation();
        return;
      }
      showAiConversationSetup(`Sessão de agendamento indisponível neste ambiente: ${error.message || "erro de conexão"}`);
      state.aiConversation = state.aiConversation || { id: "", status: "ERROR", inputVersion: 0, processedVersion: 0, messages: [], proposal: {}, missing: ["setup"], warnings: [], ready: false, error: error.message || "erro" };
      renderAiConversation();
    }
  }

  function showAiConversationSetup(message) {
    if (!el.aiConversationSetup) return;
    el.aiConversationSetup.hidden = false;
    el.aiConversationSetup.textContent = message;
  }

  function clearAiConversationSetup() {
    if (!el.aiConversationSetup) return;
    el.aiConversationSetup.hidden = true;
    el.aiConversationSetup.textContent = "";
  }

  function aiConversationDisplayDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
  }

  function renderAiConversationServiceFields(service, proposal, missing) {
    const index = state.aiConversationSelectedService;
    const root = el.aiConversationProposalCards;
    const addField = (label, key, type = "text", options = null) => {
      const field = document.createElement("label");
      const path = `services[${index}].${key}`;
      const isMissing = missing.some((item) => item === path || item.startsWith(`${path}.`));
      field.className = `field ai-schedule-field${key === "passengers" ? " is-wide" : ""}${isMissing ? " is-missing" : ""}`;
      const caption = document.createElement("span"); caption.textContent = label;
      const input = options ? document.createElement("select") : document.createElement("input");
      input.dataset.aiField = key;
      input.setAttribute("aria-label", label);
      if (isMissing) input.setAttribute("aria-invalid", "true");
      input.disabled = state.aiConversationLoading || ["WAITING_AI", "SCHEDULED", "SCHEDULING"].includes(String(state.aiConversation?.status || "").toUpperCase());
      if (key === "passengers") {
        input.multiple = true;
        input.dataset.placeholderLabel = "Selecione passageiros";
      }
      if (options) {
        if (key !== "passengers") { const blank = document.createElement("option"); blank.value = ""; blank.textContent = "Selecione"; input.appendChild(blank); }
        options.forEach((option) => {
          const item = document.createElement("option"); item.value = String(option.value ?? option.id ?? ""); item.textContent = option.label || option.name || ""; input.appendChild(item);
        });
      } else input.type = type;
      const value = key === "passengers" ? (service.passengers?.[0]?.id || proposal.passengers?.[0]?.id || "")
        : key === "serviceType" || key === "vehicleType" ? String(service[key]?.value ?? service[key]?.id ?? "") : service[key] || "";
      if (key === "passengers") {
        const selected = service.passengers?.length ? service.passengers : proposal.passengers || [];
        Array.from(input.options).forEach((option) => { option.selected = selected.some((item) => sameId(item.id, option.value)); });
      } else input.value = value;
      field.append(caption, input);
      if (isMissing) {
        const hint = document.createElement("span");
        hint.id = `ai-schedule-hint-${index}-${key}`;
        hint.className = "ai-schedule-field-hint";
        hint.textContent = `Informe ${label.toLowerCase()} para continuar.`;
        input.setAttribute("aria-describedby", hint.id);
        field.appendChild(hint);
      }
      root.appendChild(field);
    };
    const addHeading = (title) => {
      const heading = document.createElement("h4");
      heading.className = "ai-schedule-fields-heading";
      heading.textContent = title;
      root.appendChild(heading);
    };
    addHeading("Data e trajeto");
    addField("Data", "date", "date");
    addField("Horário", "time", "time");
    addField("Origem", "origin");
    addField("Destino", "destination");
    addHeading("Configuração do serviço");
    addField("Tipo de serviço", "serviceType", "text", state.options.tipoServico);
    addField("Veículo", "vehicleType", "text", state.options.tipoVeiculo);
    addField("Passageiros", "passengers", "text", state.passageiros.map((item) => ({ value: item.id, label: item.label })));
  }

  function renderAiConversationIdentities(proposal, missing) {
    const root = el.aiConversationIdentityFields;
    root.replaceChildren();
    const heading = document.createElement("h4");
    heading.textContent = "Dados da solicitação";
    root.appendChild(heading);
    [["client", "Cliente", state.clientes], ["requester", "Solicitante", state.passageiros]].forEach(([key, label, collection]) => {
      const field = document.createElement("label");
      const isMissing = missing.some((item) => item === key || item.startsWith(`${key}.`));
      field.className = `field ai-schedule-field${isMissing ? " is-missing" : ""}`;
      const caption = document.createElement("span"); caption.textContent = label;
      const select = document.createElement("select");
      select.dataset.aiIdentity = key;
      if (isMissing) select.setAttribute("aria-invalid", "true");
      select.disabled = state.aiConversationLoading || ["WAITING_AI", "SCHEDULED", "SCHEDULING"].includes(String(state.aiConversation?.status || "").toUpperCase());
      const blank = document.createElement("option"); blank.value = ""; blank.textContent = `Selecione ${label.toLowerCase()} cadastrado`;
      select.appendChild(blank);
      collection.forEach((item) => {
        const option = document.createElement("option"); option.value = item.id; option.textContent = item.label;
        select.appendChild(option);
      });
      select.value = collection.some((item) => sameId(item.id, proposal[key]?.id)) ? proposal[key].id : "";
      field.append(caption, select);
      if (proposal[key]?.name && !select.value) {
        const hint = document.createElement("small");
        hint.textContent = `Identificado como “${proposal[key].name}”; selecione o cadastro correspondente.`;
        field.appendChild(hint);
      }
      root.appendChild(field);
    });
  }

  function updateAiConversationIdentity(event) {
    const select = event.target.closest("[data-ai-identity]");
    const session = state.aiConversation;
    if (!select || !session?.proposal?.services?.length || state.aiConversationLoading || ["WAITING_AI", "SCHEDULED", "SCHEDULING"].includes(String(session.status || "").toUpperCase())) return;
    const key = select.dataset.aiIdentity;
    const collection = key === "client" ? state.clientes : state.passageiros;
    const selected = collection.find((item) => sameId(item.id, select.value));
    const proposal = { ...session.proposal, [key]: selected ? { id: selected.id, name: selected.label } : null };
    proposal.missingFields = (proposal.missingFields || []).filter((path) => path !== key && !path.startsWith(`${key}.`));
    state.aiConversation = { ...session, proposal };
    state.aiConversationReviewDirty = true;
    renderAiConversation();
  }

  function updateAiConversationField(event) {
    const input = event.target.closest("[data-ai-field]");
    if (!input || (event.type === "input" && input.tagName === "SELECT")) return;
    const session = state.aiConversation;
    const index = state.aiConversationSelectedService;
    if (!session?.proposal?.services?.[index] || state.aiConversationLoading || ["WAITING_AI", "SCHEDULED", "SCHEDULING"].includes(String(session.status || "").toUpperCase())) return;
    const key = input.dataset.aiField;
    const proposal = { ...session.proposal, services: session.proposal.services.map((item) => ({ ...item })) };
    const service = proposal.services[index];
    if (key === "passengers") {
      service.passengers = Array.from(input.selectedOptions).map((option) => state.passageiros.find((item) => sameId(item.id, option.value))).filter(Boolean).map((item) => ({ id: item.id, name: item.label }));
      if (proposal.services.every((item) => item.passengers?.length)) {
        proposal.passengers = proposal.services.flatMap((item) => item.passengers)
          .filter((passenger, position, all) => all.findIndex((item) => sameId(item.id, passenger.id)) === position);
      }
    } else if (key === "serviceType" || key === "vehicleType") {
      const collection = key === "serviceType" ? state.options.tipoServico : state.options.tipoVeiculo;
      const option = collection.find((item) => String(item.value) === input.value);
      service[key] = option ? { value: option.value, id: String(option.value), name: option.label, label: option.label } : null;
    } else service[key] = input.value;
    proposal.missingFields = (proposal.missingFields || []).filter((path) => path !== `services[${index}].${key}`
      && !(key === "passengers" && proposal.services.every((item) => item.passengers?.length) && (path === "passengers" || path.startsWith("passengers."))));
    state.aiConversation = { ...session, proposal };
    state.aiConversationReviewDirty = true;
    updateAiConversationProgress(2, String(session.status || "DRAFT").toUpperCase());
    if (event.type === "change" && (key === "serviceType" || key === "vehicleType")) renderAiConversation();
    else {
      el.aiConversationSave.disabled = false;
      el.aiConversationSave.hidden = false;
      el.aiConversationConfirm.disabled = true;
      el.aiConversationConfirm.hidden = true;
      el.aiConversationConfirmHint.textContent = "Revisão não salva. Salve antes de confirmar.";
      const validation = aiConversationCore()?.validateProposal(proposal);
      if (validation) {
        const pending = validation.missing.length;
        el.aiConversationReadiness.textContent = pending ? `${pending} pendência${pending === 1 ? "" : "s"}` : "Pronto para salvar";
        el.aiConversationReadiness.classList.toggle("is-ready", !pending);
        el.aiConversationReadiness.classList.toggle("is-blocked", Boolean(pending));
        const fieldPath = `services[${index}].${key}`;
        const fieldMissing = validation.missing.some((path) => path === fieldPath || path.startsWith(`${fieldPath}.`));
        input.closest(".ai-schedule-field")?.classList.toggle("is-missing", fieldMissing);
        if (fieldMissing) input.setAttribute("aria-invalid", "true");
        else input.removeAttribute("aria-invalid");
        const serviceIssues = validation.missing.filter((path) => path.startsWith(`services[${index}].`));
        const serviceButton = el.aiConversationServiceList.querySelector(`[data-ai-service-index="${index}"]`);
        const badge = serviceButton?.querySelector(".ai-schedule-service-status");
        if (badge) {
          badge.textContent = serviceIssues.length ? `${serviceIssues.length} pendência${serviceIssues.length === 1 ? "" : "s"}` : "Pronto";
          badge.classList.toggle("is-pending", Boolean(serviceIssues.length));
        }
        if (serviceButton) {
          const current = proposal.services[index];
          const date = `${current.date ? aiConversationDisplayDate(current.date) : "Data pendente"}  •  ${current.time || "Horário pendente"}`;
          const route = `${current.origin || "Origem pendente"} → ${current.destination || "Destino pendente"}`;
          const passengers = (current.passengers?.length ? current.passengers : proposal.passengers || []).map((item) => item.name).filter(Boolean).join(", ") || "Passageiro pendente";
          serviceButton.title = [date, route, passengers].join(" · ");
        }
      }
    }
  }

  async function saveAiConversationReview() {
    const session = state.aiConversation;
    if (!session?.proposal?.services?.length || !state.aiConversationReviewDirty || ["WAITING_AI", "SCHEDULED", "SCHEDULING"].includes(String(session.status || "").toUpperCase())) return;
    const validation = aiConversationCore().validateProposal(session.proposal);
    const next = { ...session, proposal: validation.normalized, missing: validation.missing, warnings: validation.warnings, error: "", status: validation.ready ? "READY" : "WAITING_USER" };
    state.aiConversationLoading = true;
    renderAiConversation();
    try {
      if (AI_CONVERSATION_LOCAL_MODE) aiConversationStoreWrite(next, AI_CONVERSATION_LOCAL_KEY);
      else if (state.mockMode) aiConversationStoreWrite(next);
      else {
        const config = aiConversationConfig();
        if (!config || !state.xrm || !session.id) throw new Error("Sessão Dataverse indisponível.");
        const payload = {};
        aiConversationPayloadValue(payload, "proposalJson", JSON.stringify(validation.normalized));
        aiConversationPayloadValue(payload, "missingFields", validation.missing.join(", "));
        aiConversationPayloadValue(payload, "status", aiConversationStatusValue(next.status));
        await state.xrm.WebApi.updateRecord(config.entity, session.id, payload);
      }
      state.aiConversation = next;
      state.aiConversationReviewDirty = false;
      clearAiConversationSetup();
      toast("Revisão salva.", "success");
    } catch (error) { toast(`Não foi possível salvar a revisão: ${error.message || "erro"}`, "error", 8000); }
    finally { state.aiConversationLoading = false; renderAiConversation(); }
  }

  function resetAiScheduleSelects() {
    [el.aiConversationIdentityFields, el.aiConversationProposalCards].forEach((root) => {
      root.querySelectorAll("select.custom-select-native").forEach((select) => {
        const custom = customSelectRoots.get(select);
        if (!custom) return;
        closeCustomSelect(select);
        custom.panel.remove();
        customSelectRoots.delete(select);
      });
    });
  }

  function initializeAiScheduleSelects() {
    [el.aiConversationIdentityFields, el.aiConversationProposalCards].forEach((root) => {
      root.querySelectorAll("select").forEach((select) => ensureCustomSelect(select));
    });
  }

  function updateAiConversationProgress(activeStep, status) {
    el.aiConversationProgress.querySelectorAll("[data-ai-step]").forEach((step) => {
      const number = Number(step.dataset.aiStep);
      step.dataset.state = status === "SCHEDULED" || number < activeStep ? "complete" : number === activeStep ? "current" : "upcoming";
      if (number === activeStep && status !== "SCHEDULED") step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
    });
  }

  function renderAiConversation() {
    if (!el.aiConversationMessages) return;
    const session = state.aiConversation || { status: "DRAFT", messages: [], proposal: {}, missing: ["services"], warnings: [], ready: false };
    const status = String(session.status || "DRAFT").toUpperCase();
    const isSimulation = state.mockMode || AI_CONVERSATION_LOCAL_MODE;
    el.aiConversationStatus.textContent = status === "SCHEDULED" && isSimulation ? "Simulação concluída" : aiConversationStatusLabel(status);
    el.aiConversationStatus.className = `status-pill ai-conversation-status-${status.toLowerCase()}`;
    const messageScrollTop = el.aiConversationMessages.scrollTop;
    const followLatestMessage = el.aiConversationMessages.scrollHeight - messageScrollTop - el.aiConversationMessages.clientHeight < 48;
    el.aiConversationMessages.hidden = false;
    el.aiConversationMessages.replaceChildren();
    (session.messages || []).forEach((message) => {
      const item = document.createElement("div");
      item.className = `ai-message ai-message-${message.role === "user" ? "user" : "assistant"}`;
      item.textContent = message.content || "";
      el.aiConversationMessages.appendChild(item);
    });
    const validation = aiConversationCore()?.validateProposal(session.proposal || {}) || { ready: false, missing: ["core"], warnings: [] };
    const assistantMessage = String(validation.normalized?.assistantMessage || "").trim();
    if (assistantMessage && !(session.messages || []).some((message) => message.role === "assistant" && message.content === assistantMessage)) {
      const item = document.createElement("div");
      item.className = "ai-message ai-message-assistant";
      item.textContent = assistantMessage;
      el.aiConversationMessages.appendChild(item);
    }
    if (!el.aiConversationMessages.childElementCount) {
      const empty = document.createElement("p");
      empty.className = "ai-conversation-empty";
      empty.textContent = "Cole a solicitação do cliente para começar.";
      el.aiConversationMessages.appendChild(empty);
    }
    el.aiConversationMessages.scrollTop = followLatestMessage ? el.aiConversationMessages.scrollHeight : messageScrollTop;
    const proposal = validation.normalized || {};
    const missing = validation.missing || [];
    const countLabel = `${missing.length} pendência${missing.length === 1 ? "" : "s"}`;
    const retryFailedSchedule = status === "ERROR" && Number(session.confirmationVersion || 0) > 0
      && Number(session.confirmationVersion) === Number(session.inputVersion);
    const canConfirm = validation.ready && (["READY", "PARTIAL"].includes(status) || retryFailedSchedule);
    const showConfirm = canConfirm && !state.aiConversationReviewDirty;
    el.aiConversationReadiness.textContent = status === "SCHEDULED" ? (state.mockMode || AI_CONVERSATION_LOCAL_MODE ? "Simulação concluída" : "Solicitação criada")
      : status === "SCHEDULING" ? "Registrando" : status === "WAITING_AI" ? "Interpretando"
      : status === "PARTIAL" ? "Registro parcial" : status === "ERROR" ? "Precisa de atenção"
      : !proposal.services?.length ? "Aguardando dados"
      : validation.ready && state.aiConversationReviewDirty ? "Pronto para salvar"
      : showConfirm ? "Pronto para confirmar" : validation.ready ? "Dados completos" : countLabel;
    el.aiConversationReadiness.className = `ai-readiness ${status === "SCHEDULED" || showConfirm ? "is-ready" : "is-blocked"}`;
    el.aiConversationIdentity.textContent = [proposal.client?.name && `Cliente: ${proposal.client.name}`, proposal.requester?.name && `Solicitante: ${proposal.requester.name}`].filter(Boolean).join("  •  ");
    el.aiConversationServiceList.replaceChildren();
    const services = proposal.services || [];
    const activeStep = status === "SCHEDULED" || status === "SCHEDULING" || showConfirm ? 3 : services.length ? 2 : 1;
    updateAiConversationProgress(activeStep, status);
    el.aiConversationWorkspace.hidden = false;
    if (!services.length && !state.aiConversationThreadTouched) {
      el.aiConversationThread.hidden = false;
      el.aiConversationToggle.setAttribute("aria-expanded", "true");
      el.aiConversationToggle.firstChild.textContent = "Ocultar conversa ";
    }
    if (state.aiConversationSelectedService >= services.length) state.aiConversationSelectedService = 0;
    el.aiConversationServiceCount.textContent = services.length ? `${services.length} serviço${services.length === 1 ? "" : "s"} identificado${services.length === 1 ? "" : "s"}` : "Aguardando pedido";
    if (!services.length) { const empty = document.createElement("p"); empty.className = "ai-schedule-empty-list"; empty.textContent = "Nenhum serviço identificado"; el.aiConversationServiceList.appendChild(empty); }
    services.forEach((service, index) => {
      const issues = missing.filter((path) => path.startsWith(`services[${index}].`));
      const button = document.createElement("button");
      button.type = "button";
      button.className = `ai-schedule-service${index === state.aiConversationSelectedService ? " is-selected" : ""}`;
      button.dataset.aiServiceIndex = String(index);
      button.setAttribute("aria-current", index === state.aiConversationSelectedService ? "true" : "false");
      const head = document.createElement("span"); head.className = "ai-schedule-service-head";
      const title = document.createElement("strong"); title.textContent = `Serviço ${index + 1}`;
      const badge = document.createElement("span"); badge.className = `ai-schedule-service-status${issues.length ? " is-pending" : ""}`;
      badge.textContent = status === "SCHEDULED" ? "Solicitado" : issues.length ? `${issues.length} pendência${issues.length === 1 ? "" : "s"}` : "Pronto";
      head.append(title, badge);
      const date = document.createElement("span"); date.className = "ai-schedule-service-meta"; date.textContent = `${service.date ? aiConversationDisplayDate(service.date) : "Data pendente"}  •  ${service.time || "Horário pendente"}`;
      const route = document.createElement("span"); route.className = "ai-schedule-service-meta"; route.textContent = `${service.origin || "Origem pendente"} → ${service.destination || "Destino pendente"}`;
      const pax = document.createElement("span"); pax.className = "ai-schedule-service-meta"; pax.textContent = (service.passengers?.length ? service.passengers : proposal.passengers || []).map((item) => item.name).filter(Boolean).join(", ") || "Passageiro pendente";
      button.title = [date.textContent, route.textContent, pax.textContent].join(" · ");
      button.append(head, date, route, pax); el.aiConversationServiceList.appendChild(button);
    });
    resetAiScheduleSelects();
    el.aiConversationProposalCards.replaceChildren();
    const selected = services[state.aiConversationSelectedService];
    el.aiConversationProposalTitle.textContent = selected ? `Serviço ${state.aiConversationSelectedService + 1}` : "Revisão do pedido";
    el.aiConversationProposalSubtitle.textContent = selected ? "Revise e complete os dados do serviço." : "Confira os dados depois de enviar a solicitação.";
    el.aiConversationIdentityFields.hidden = !selected;
    if (selected) renderAiConversationIdentities(proposal, missing);
    if (selected) renderAiConversationServiceFields(selected, proposal, missing);
    else {
      const empty = document.createElement("div");
      empty.className = "ai-schedule-empty";
      const title = document.createElement("h4"); title.textContent = "Nenhum serviço para revisar";
      const description = document.createElement("p"); description.textContent = "Envie o pedido na conversa. Os serviços identificados aparecerão aqui para conferência.";
      empty.append(title, description);
      el.aiConversationProposalCards.appendChild(empty);
    }
    initializeAiScheduleSelects();
    el.aiConversationMissing.hidden = !missing.length || !services.length;
    el.aiConversationMissing.replaceChildren();
    const question = missing.length ? aiConversationFirstQuestion(missing) : "Confira a proposta e confirme para registrar.";
    if (missing.length) {
      el.aiConversationMissing.append(document.createTextNode(question));
      const registrations = [proposal.client, proposal.requester, ...(proposal.passengers || [])]
        .filter((identity) => identity?.proposedRegistration?.requiresConfirmation && identity.name);
      registrations.forEach((identity) => {
        const action = document.createElement("button");
        action.type = "button";
        action.className = "text-action primary";
        action.dataset.aiRegistrationName = identity.name;
        action.textContent = `Abrir cadastro: ${identity.name}`;
        el.aiConversationMissing.append(document.createElement("br"), action);
      });
    }
    const warningMessages = [...(validation.warnings || session.warnings || [])];
    if (["ERROR", "PARTIAL"].includes(status) && session.error) warningMessages.unshift(session.error);
    el.aiConversationWarnings.hidden = !warningMessages.length;
    el.aiConversationWarnings.textContent = warningMessages.join(" ");
    el.aiConversationConfirm.disabled = !showConfirm || state.aiConversationLoading;
    el.aiConversationConfirm.textContent = status === "SCHEDULED" ? "Concluído"
      : status === "PARTIAL" ? "Concluir serviços pendentes"
      : retryFailedSchedule ? "Tentar registrar novamente"
      : isSimulation ? `Simular ${services.length} agendamento${services.length === 1 ? "" : "s"}`
      : services.length ? `Confirmar e registrar ${services.length} serviço${services.length === 1 ? "" : "s"}` : "Confirmar e registrar";
    el.aiConversationSave.disabled = !state.aiConversationReviewDirty || state.aiConversationLoading;
    el.aiConversationSave.hidden = !services.length || !state.aiConversationReviewDirty || status === "SCHEDULED";
    el.aiConversationConfirm.hidden = !showConfirm;
    el.aiConversationStartOver.hidden = status !== "SCHEDULED";
    el.aiConversationSend.disabled = state.aiConversationLoading || ["WAITING_AI", "SCHEDULED", "SCHEDULING"].includes(status);
    el.aiConversationInput.disabled = state.aiConversationLoading || ["WAITING_AI", "SCHEDULED", "SCHEDULING"].includes(status);
    el.aiConversationThread.setAttribute("aria-busy", String(state.aiConversationLoading || status === "WAITING_AI"));
    const hasCreatedReservations = ["SCHEDULED", "PARTIAL"].includes(status) && (session.createdReservationIds || []).length > 0;
    el.aiConversationVoucher.hidden = !hasCreatedReservations;
    el.aiConversationVoucher.textContent = status === "PARTIAL" ? "Ver serviços criados" : "Abrir voucher";
    el.aiConversationResume.hidden = status !== "ERROR" || showConfirm;
    el.aiConversationConfirmHint.textContent = status === "SCHEDULED"
      ? (AI_CONVERSATION_LOCAL_MODE ? "Confirmação registrada no localhost; simulação local criada. Abra o voucher para revisar." : state.mockMode ? "Simulação local concluída. Nenhum registro foi criado no Dataverse." : "Solicitação registrada com status Solicitado. Abra o voucher para revisar.")
      : status === "SCHEDULING" ? "Registro em andamento. Aguarde o resultado."
      : status === "PARTIAL" ? "Alguns serviços foram criados. Confira o erro e conclua os restantes."
      : status === "ERROR" ? "Não foi possível concluir. Confira o erro e tente novamente."
      : state.aiConversationReviewDirty ? "Revisão não salva. Salve antes de confirmar."
      : status === "WAITING_AI" ? "Interpretando a solicitação. Aguarde a resposta da IA."
      : !services.length ? "Cole a solicitação na conversa para começar."
      : missing.length ? `${countLabel} no total. Resolva as pendências para confirmar o agendamento.`
      : isSimulation ? "Dados prontos. A confirmação cria apenas uma simulação local."
      : "Todos os serviços prontos para confirmação humana.";
  }

  function startNewAiConversation() {
    if (["WAITING_AI", "SCHEDULING"].includes(String(state.aiConversation?.status || "").toUpperCase())) {
      toast("Aguarde o processamento antes de iniciar outra solicitação.", "warning");
      return;
    }
    const hasCurrentRequest = (state.aiConversation?.messages || []).some((message) => message.role === "user")
      || Boolean(state.aiConversation?.proposal?.services?.length);
    if (hasCurrentRequest && String(state.aiConversation?.status || "").toUpperCase() !== "SCHEDULED") {
      const prompt = state.aiConversationReviewDirty
        ? "Descartar as alterações não salvas e iniciar outra solicitação?"
        : "Iniciar outra solicitação? A conversa atual deixará de aparecer nesta aba.";
      if (!window.confirm(prompt)) return;
    }
    if (state.aiConversationPollingTimer) clearTimeout(state.aiConversationPollingTimer);
    state.aiConversationPollingTimer = null;
    state.aiConversationPollStartedAt = 0;
    state.aiConversationPollAttempts = 0;
    aiConversationRememberSession();
    clearAiConversationSetup();
    state.aiConversationReviewDirty = false;
    state.aiConversationSelectedService = 0;
    state.aiConversationThreadTouched = false;
    el.aiConversationThread.hidden = false;
    el.aiConversationToggle.setAttribute("aria-expanded", "true");
    el.aiConversationToggle.firstChild.textContent = "Ocultar conversa ";
    const local = AI_CONVERSATION_LOCAL_MODE;
    state.aiConversation = { id: `${local ? "local" : "mock"}-${Date.now()}`, status: "DRAFT", inputVersion: 0, processedVersion: 0, originalText: "", messages: [{ role: "assistant", content: "Cole a solicitação do cliente. Eu organizo os dados para sua revisão." }], proposal: {}, missing: ["services"], warnings: [], ready: false };
    if (el.aiConversationInput) el.aiConversationInput.value = "";
    if (local) aiConversationStoreWrite(state.aiConversation, AI_CONVERSATION_LOCAL_KEY);
    else if (state.mockMode) aiConversationStoreWrite(state.aiConversation);
    renderAiConversation();
    el.aiConversationInput?.focus();
  }

  async function submitLocalAiConversationInput(message, current) {
    const nextVersion = Number(current.inputVersion || 0) + 1;
    const messages = [...(current.messages || []), aiConversationMessage("user", message)];
    state.aiConversationLoading = true;
    state.aiConversation = { ...current, status: "WAITING_AI", inputVersion: nextVersion, originalText: current.originalText || message, messages };
    renderAiConversation();
    try {
      const response = await fetch(AI_CONVERSATION_LOCAL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          message,
          previousProposal: current.proposal || {},
          messages,
          referenceData: {
            serviceTypeCandidates: aiConversationChoiceCandidates(state.options.tipoServico, message, current.messages, "service"),
            vehicleTypeCandidates: aiConversationChoiceCandidates(state.options.tipoVeiculo, message, current.messages, "vehicle")
          }
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Proxy local retornou HTTP ${response.status}.`);
      const proposal = aiConversationResolveLocalProposal(body.proposal || body, message, current.messages);
      const validation = AI_CONVERSATION_CORE.validateProposal(proposal);
      const assistant = proposal.assistantMessage || (validation.ready ? "Entendi a solicitação. Confira a proposta e confirme para agendar." : proposal.question || aiConversationFirstQuestion(validation.missing));
      const next = {
        ...current,
        id: current.id || `local-${Date.now()}`,
        originalText: current.originalText || message,
        inputVersion: nextVersion,
        processedVersion: nextVersion,
        status: validation.ready ? "READY" : "WAITING_USER",
        confirmationRequested: validation.ready,
        confirmationVersion: 0,
        proposal,
        missing: validation.missing,
        warnings: validation.warnings,
        model: body.model || "",
        attempts: Number(body.attempts || 1),
        messages: [...messages, aiConversationMessage("assistant", assistant)]
      };
      state.aiConversation = next;
      aiConversationStoreWrite(next, AI_CONVERSATION_LOCAL_KEY);
      clearAiConversationSetup();
      if (el.aiConversationInput) el.aiConversationInput.value = "";
    } catch (error) {
      const failed = { ...state.aiConversation, status: "ERROR", error: error.message || "Falha no proxy local.", messages: [...messages, aiConversationMessage("assistant", `Não consegui interpretar agora: ${error.message || "falha no proxy local."}`)] };
      state.aiConversation = failed;
      aiConversationStoreWrite(failed, AI_CONVERSATION_LOCAL_KEY);
      showAiConversationSetup(`DeepSeek local indisponível: ${error.message || "verifique o servidor e DEEPSEEK_API_KEY."}`);
    } finally {
      state.aiConversationLoading = false;
      renderAiConversation();
    }
  }

  async function submitAiConversationInput() {
    if (state.aiConversationLoading) return;
    if (["WAITING_AI", "SCHEDULING", "SCHEDULED"].includes(String(state.aiConversation?.status || "").toUpperCase())) return;
    if (state.aiConversationReviewDirty) { toast("Salve a revisão antes de enviar outra mensagem.", "warning"); return; }
    const message = String(el.aiConversationInput?.value || "").trim();
    if (!message) { toast("Cole a mensagem do cliente antes de interpretar.", "error"); return; }
    if (message.length > AI_CONVERSATION_MAX_INPUT_LENGTH) {
      toast(`A mensagem excede o limite de ${AI_CONVERSATION_MAX_INPUT_LENGTH} caracteres.`, "error", 7000);
      return;
    }
    const current = state.aiConversation || { id: "", inputVersion: 0, messages: [] };
    const currentValidation = AI_CONVERSATION_CORE?.validateProposal(current.proposal || {});
    if (AI_CONVERSATION_CORE?.isExplicitConfirmation(message, { awaitingConfirmation: current.status === "READY" && currentValidation?.ready === true, confirmationRequested: current.confirmationRequested === true, version: current.inputVersion, confirmedVersion: current.confirmationVersion })) {
      await confirmAiConversation(); return;
    }
    if (AI_CONVERSATION_LOCAL_MODE) {
      await submitLocalAiConversationInput(message, current);
      return;
    }
    if (state.mockMode) {
      const parsed = parseLocalAiConversationText(message, current.proposal || {});
      const next = { ...current, originalText: current.originalText || message, inputVersion: Number(current.inputVersion || 0) + 1, processedVersion: Number(current.inputVersion || 0) + 1, confirmationRequested: parsed.validation.ready, confirmationVersion: 0, proposal: parsed.validation.normalized, status: parsed.validation.ready ? "READY" : "WAITING_USER", missing: parsed.validation.missing, warnings: parsed.validation.warnings, messages: [...(current.messages || []), aiConversationMessage("user", message), aiConversationMessage("assistant", parsed.validation.ready ? `Entendi a solicitação. Confira a proposta e confirme para agendar.\n\n${aiConversationSummary({ proposal: parsed.validation.normalized })}` : aiConversationFirstQuestion(parsed.validation.missing))] };
      state.aiConversation = next;
      aiConversationStoreWrite(next);
      clearAiConversationSetup();
      if (el.aiConversationInput) el.aiConversationInput.value = "";
      renderAiConversation();
      return;
    }
    const config = aiConversationConfig();
    if (!config || !state.xrm) { showAiConversationSetup("Sessão não configurada no Dataverse; o texto não foi enviado."); return; }
    const nextVersion = Number(current.inputVersion || 0) + 1;
    const messages = [...(current.messages || []), aiConversationMessage("user", message)];
    const payload = {};
    aiConversationPayloadValue(payload, "name", `Agendamento IA ${new Date().toISOString()}`);
    aiConversationPayloadValue(payload, "originalText", current.originalText || message);
    aiConversationPayloadValue(payload, "messagesJson", JSON.stringify(messages));
    aiConversationPayloadValue(payload, "inputVersion", nextVersion);
    aiConversationPayloadValue(payload, "confirmationRequested", false);
    aiConversationPayloadValue(payload, "confirmationVersion", 0);
    aiConversationPayloadValue(payload, "status", aiConversationStatusValue("WAITING_AI"));
    state.aiConversationLoading = true;
    try {
      const created = current.id && !String(current.id).startsWith("mock-")
        ? await state.xrm.WebApi.updateRecord(config.entity, current.id, payload).then(() => ({ id: current.id }))
        : await state.xrm.WebApi.createRecord(config.entity, payload);
      state.aiConversation = { ...current, id: cleanGuid(created.id), inputVersion: nextVersion, status: "WAITING_AI", originalText: current.originalText || message, messages };
      aiConversationRememberSession(state.aiConversation.id);
      clearAiConversationSetup();
      if (el.aiConversationInput) el.aiConversationInput.value = "";
      renderAiConversation();
      scheduleAiConversationPoll(1500);
    } catch (error) {
      showAiConversationSetup(`Não foi possível criar a sessão: ${error.message || "erro de conexão"}`);
    } finally { state.aiConversationLoading = false; }
  }

  async function confirmAiConversation() {
    if (state.aiConversationLoading) return;
    const session = state.aiConversation;
    const validation = aiConversationCore()?.validateProposal(session?.proposal || {});
    const status = String(session?.status || "").toUpperCase();
    const retryFailedSchedule = status === "ERROR" && Number(session?.confirmationVersion || 0) > 0
      && Number(session.confirmationVersion) === Number(session.inputVersion);
    if (!session || !(status === "READY" || status === "PARTIAL" || retryFailedSchedule) || !validation?.ready || state.aiConversationReviewDirty) {
      toast("Aguarde a interpretação e salve a revisão antes de confirmar.", "warning");
      return;
    }
    state.aiConversationLoading = true;
    renderAiConversation();
    if (AI_CONVERSATION_LOCAL_MODE) {
      const records = aiConversationCreateLocalReservations(session);
      state.aiConversation = {
        ...session,
        status: "SCHEDULED",
        confirmationRequested: false,
        confirmationVersion: session.inputVersion,
        createdReservationIds: records.map((record) => record.id),
        messages: [...(session.messages || []), aiConversationMessage("user", "Confirmo. Pode agendar."), aiConversationMessage("assistant", "Confirmação recebida no localhost. Simulação local criada; nenhuma reserva real foi gravada no Dataverse.")]
      };
      state.lastSuccessVoucher = AI_CONVERSATION_CORE.buildLocalVoucher({ session: state.aiConversation, reservations: records });
      aiConversationStoreWrite(state.aiConversation, AI_CONVERSATION_LOCAL_KEY);
      state.aiConversationLoading = false;
      renderAiConversation();
      toast("Confirmação local registrada. Voucher de simulação disponível.", "warning", 7000);
      return;
    }
    if (state.mockMode) {
      state.aiConversation = { ...session, status: "SCHEDULED", confirmationRequested: false, confirmationVersion: session.inputVersion, messages: [...(session.messages || []), aiConversationMessage("user", "Confirmo os dados. Pode registrar a solicitação."), aiConversationMessage("assistant", "Simulação local concluída. Nenhum registro foi criado no Dataverse.")] };
      aiConversationStoreWrite(state.aiConversation); renderAiConversation();
      state.aiConversationLoading = false;
      toast("Simulação local concluída. Nenhum registro Dataverse foi criado.", "warning", 7000);
      return;
    }
    const config = aiConversationConfig();
    if (!config || !state.xrm || !session.id) { state.aiConversationLoading = false; renderAiConversation(); showAiConversationSetup("A sessão precisa estar publicada no Dataverse antes da confirmação."); return; }
    const payload = {};
    aiConversationPayloadValue(payload, "proposalJson", JSON.stringify(validation.normalized));
    aiConversationPayloadValue(payload, "missingFields", "");
    aiConversationPayloadValue(payload, "status", aiConversationStatusValue("SCHEDULING"));
    aiConversationPayloadValue(payload, "confirmationRequested", false);
    aiConversationPayloadValue(payload, "confirmationVersion", session.inputVersion);
    aiConversationPayloadValue(payload, "messagesJson", JSON.stringify([...(session.messages || []), aiConversationMessage("user", "Confirmo os dados. Pode registrar a solicitação.")]));
    try {
      await state.xrm.WebApi.updateRecord(config.entity, session.id, payload);
      state.aiConversation = { ...session, proposal: validation.normalized, status: "SCHEDULING", confirmationVersion: session.inputVersion };
      clearAiConversationSetup();
      renderAiConversation();
      scheduleAiConversationPoll(1500);
    } catch (error) { toast(`Não foi possível confirmar: ${error.message || "erro de conexão"}`, "error", 8000); }
    finally { state.aiConversationLoading = false; renderAiConversation(); }
  }

  async function resumeAiConversation() {
    await loadAiConversation();
    if (!el.aiConversationSetup.hidden) return;
    const session = state.aiConversation;
    if (session?.status !== "ERROR") return;
    const retryText = session.originalText || [...(session.messages || [])].reverse().find((item) => item.role === "user")?.content;
    if (retryText && !session.proposal?.services?.length) {
      el.aiConversationInput.value = retryText;
      await submitAiConversationInput();
    } else {
      el.aiConversationWorkspace?.scrollIntoView({ block: "start", behavior: "smooth" });
      toast("Revise o erro e os dados do serviço. Salve as correções para tentar novamente.", "warning", 7000);
    }
  }

  async function openAiConversationVoucher() {
    const session = state.aiConversation;
    const reservationIds = [...new Set((session?.createdReservationIds || []).map(cleanGuid).filter(Boolean))];
    if (AI_CONVERSATION_LOCAL_MODE) {
      const records = aiConversationLocalReservationsRead().filter((record) => reservationIds.includes(cleanGuid(record.id)));
      if (!records.length || !AI_CONVERSATION_CORE?.buildLocalVoucher) {
        toast("Não há simulação local disponível para esta sessão.", "warning", 7000);
        return;
      }
      state.lastSuccessVoucher = AI_CONVERSATION_CORE.buildLocalVoucher({ session, reservations: records });
      openSuccessVoucher();
      return;
    }
    if (!reservationIds.length || !state.xrm || state.mockMode) {
      toast("O voucher só fica disponível depois que o fluxo DEV registrar as reservas reais.", "warning", 7000);
      return;
    }
    const f = CONFIG.fields.reserva;
    const select = [f.id, f.readableId, f.dataSaida, f.tipoServico, f.tipoVeiculo, f.destino, f.enderecoView, f.enderecoPersonalizado, f.trajeto, f.obsFinal, f.status]
      .filter(Boolean).join(",");
    try {
      const rows = await Promise.all(reservationIds.map((id) => state.xrm.WebApi.retrieveRecord(CONFIG.entities.reserva, id, `?$select=${select}`)));
      const generatedAt = new Date();
      const proposal = session.proposal || {};
      const passengerSummary = (proposal.passengers || []).map((item) => item.name).filter(Boolean).join("\n") || "Não informado";
      const services = rows.map((row, index) => {
        const date = row[f.dataSaida] ? new Date(row[f.dataSaida]) : null;
        const proposalService = proposal.services?.[index] || {};
        const operationStatus = optionLabel("statusOperacao", row[f.status]);
        return {
          typeLabel: operationStatus === "Solicitado" ? "Serviço solicitado" : operationStatus === "Confirmado" ? "Serviço confirmado" : "Serviço registrado",
          shortId: String(row[f.readableId] || row[f.id] || reservationIds[index]).slice(-6).toUpperCase(),
          scheduledAt: date && !Number.isNaN(date.getTime()) ? formatDateTime(date) : `${proposalService.date || "Não informado"} ${proposalService.time || ""}`.trim(),
          sortTime: date && !Number.isNaN(date.getTime()) ? date.getTime() : index,
          serviceType: optionLabel("tipoServico", row[f.tipoServico]) || proposalService.serviceType?.label || proposalService.serviceType?.name || "Não informado",
          vehicleType: optionLabel("tipoVeiculo", row[f.tipoVeiculo]) || proposalService.vehicleType?.label || proposalService.vehicleType?.name || "A confirmar",
          requester: proposal.requester?.name || "Não informado",
          passengerSummary,
          route: String(row[f.trajeto] || `${row[f.enderecoView] || row[f.enderecoPersonalizado] || ""} / ${row[f.destino] || ""}`).trim(),
          origin: String(row[f.enderecoPersonalizado] || row[f.enderecoView] || proposalService.origin || "Não informado").trim(),
          destination: String(row[f.destino] || proposalService.destination || "Não informado").trim(),
          note: String(row[f.obsFinal] || proposal.observations || "").trim()
        };
      }).sort((left, right) => left.sortTime - right.sortTime).map((item, index) => ({ ...item, order: index + 1 }));
      state.lastSuccessVoucher = {
        reference: buildVoucherReference(generatedAt, services.length),
        issuedAtLabel: formatVoucherIssuedAt(generatedAt),
        client: proposal.client?.name || "Não informado",
        requester: proposal.requester?.name || "Não informado",
        serviceType: services[0]?.serviceType || "Não informado",
        vehicleType: services[0]?.vehicleType || "A confirmar",
        status: String(session.status || "").toUpperCase() === "PARTIAL" ? "Parcial" : optionLabel("statusOperacao", rows[0]?.[f.status]) || "Solicitado",
        operationCode: "",
        costCenter: "",
        passengerSummary,
        passengerCount: proposal.passengers?.length || 0,
        preferenceSummary: proposal.observations || "",
        services
      };
      openSuccessVoucher();
    } catch (error) {
      toast(`Não foi possível montar o voucher das reservas criadas: ${error.message || "erro de consulta"}`, "error", 8000);
    }
  }

  function scheduleAiConversationPoll(delay = 2000) {
    if (state.aiConversationPollingTimer) clearTimeout(state.aiConversationPollingTimer);
    if (state.mockMode || !state.aiConversation?.id || String(state.aiConversation.id).startsWith("mock-")) return;
    const sessionId = state.aiConversation.id;
    if (!state.aiConversationPollStartedAt) state.aiConversationPollStartedAt = Date.now();
    if (Date.now() - state.aiConversationPollStartedAt > 45000 || state.aiConversationPollAttempts >= 8) {
      showAiConversationSetup("A sessão ainda está em processamento. Use Atualizar para tentar novamente; o polling automático foi encerrado.");
      return;
    }
    state.aiConversationPollAttempts += 1;
    state.aiConversationPollingTimer = setTimeout(async () => {
      state.aiConversationPollingTimer = null;
      if (state.aiConversation?.id !== sessionId) return;
      try {
        const config = aiConversationConfig();
        const row = await state.xrm.WebApi.retrieveRecord(config.entity, sessionId);
        if (state.aiConversation?.id !== sessionId) return;
        const next = aiConversationRowToSession(row);
        if (!next) throw new Error("Resposta vazia do Dataverse.");
        state.aiConversation = next;
        clearAiConversationSetup();
        renderAiConversation();
        if (["WAITING_AI", "SCHEDULING"].includes(String(next?.status || "").toUpperCase())) scheduleAiConversationPoll(Math.min(delay * 2, 10000));
        else { state.aiConversationPollStartedAt = 0; state.aiConversationPollAttempts = 0; }
      } catch (error) {
        if (state.aiConversation?.id !== sessionId) return;
        if (state.aiConversationPollAttempts >= 8 || Date.now() - state.aiConversationPollStartedAt > 45000) {
          showAiConversationSetup(`Atualização da sessão falhou: ${error.message || "erro"}. Use Atualizar para tentar novamente.`);
        } else scheduleAiConversationPoll(Math.min(delay * 2, 10000));
      }
    }, delay);
  }

  function handleAiDraftListClick(event) {
    const item = event.target.closest("[data-ai-draft-id]");
    if (!item) return;
    state.selectedAiDraft = state.aiDrafts.find((draft) => aiDraftId(draft) === item.dataset.aiDraftId) || null;
    state.aiDraftSourceTab = "email";
    renderAiDrafts();
  }

  function renderAiDraftDetail() {
    const draft = state.selectedAiDraft;
    if (!draft || !el.aiDraftDetail) return;
    el.aiDraftDetail.hidden = false;
    el.aiDraftTitle.textContent = aiDraftValue(draft, "subject") || "Solicitação sem assunto";
    el.aiDraftMeta.textContent = [aiDraftValue(draft, "sender"), aiDraftValue(draft, "receivedAt")].filter(Boolean).join(" · ");
    el.aiDraftStatus.textContent = aiDraftStatusLabel(draft);
    el.aiDraftStatus.dataset.tone = aiDraftStatusTone(draft);
    const leg = parseAiDraftJson(draft, "legJson");
    const extraction = aiDraftExtractionForRow(draft);
    const candidates = aiDraftCandidateGroups(draft, extraction);
    const confidence = Number(aiDraftValue(draft, "confidence"));
    el.aiDraftFields.replaceChildren();
    const clientState = aiDraftIdentityState(extraction.clientId, extraction.client, candidates.client);
    const requesterState = aiDraftIdentityState(extraction.requesterId, extraction.requester, candidates.requester);
    appendAiDraftField("Cliente", extraction.client, "clientId", clientState);
    appendAiDraftField("Solicitante", extraction.requester, "requesterId", requesterState);
    (extraction.passengers || []).forEach((passenger, index) => {
      const items = candidates.passengers[index] || [];
      const passengerState = aiDraftIdentityState(passenger?.id, passenger?.name, items);
      appendAiDraftField(`Passageiro${(extraction.passengers || []).length > 1 ? ` ${index + 1}` : ""}`, passenger?.name, `passenger:${index}`, passengerState);
    });
    appendAiDraftField("Data e hora", [leg.date, leg.time].filter(Boolean).join(" · "));
    appendAiDraftField("Origem", leg.origin);
    appendAiDraftField("Destino", leg.destination);
    appendAiDraftField("Tipo do trecho", aiDraftValue(draft, "legType") || leg.type);
    appendAiDraftField("Confiança", Number.isFinite(confidence) && confidence > 0 ? `${Math.round((confidence <= 1 ? confidence : confidence / 100) * 100)}% (informativa)` : "Não informada");
    renderAiDraftCandidates(draft, extraction);
    const readiness = aiDraftReadiness(draft, extraction, leg);
    el.aiDraftReadiness.textContent = readiness.ready ? "Pronto para agendar" : `${readiness.reasons.length} pendência(s)`;
    el.aiDraftReadiness.className = `ai-readiness ${readiness.ready ? "is-ready" : "is-blocked"}`;
    el.aiDraftWarnings.hidden = !aiDraftValue(draft, "warnings");
    el.aiDraftWarnings.textContent = aiDraftValue(draft, "warnings") || "";
    if (el.aiDraftSourceMeta) el.aiDraftSourceMeta.textContent = [aiDraftValue(draft, "sender") ? `De: ${aiDraftValue(draft, "sender")}` : "", aiDraftValue(draft, "subject") ? `Assunto: ${aiDraftValue(draft, "subject")}` : ""].filter(Boolean).join("\n");
    if (el.aiDraftBody) el.aiDraftBody.textContent = aiDraftValue(draft, "body") || "Texto original removido conforme política de retenção.";
    if (el.aiDraftAttachmentNote) {
      el.aiDraftAttachmentNote.hidden = !aiDraftValue(draft, "hasAttachments");
      el.aiDraftAttachmentNote.textContent = aiDraftValue(draft, "hasAttachments") ? "Anexos presentes — não analisados no MVP." : "";
    }
    renderAiDraftAlerts(draft, extraction);
    setAiDraftSourceTab(state.aiDraftSourceTab);
    const status = aiDraftStatusLabel(draft);
    el.aiDraftApprove.disabled = !readiness.ready;
    el.aiDraftApproveHint.textContent = readiness.ready ? "" : `Aprovação bloqueada: ${readiness.reasons.slice(0, 2).join("; ")}.`;
    el.aiDraftDiscard.disabled = ["Agendado", "Descartado"].includes(status) || !aiDraftId(draft);
    el.aiDraftOpenForm.disabled = ["Agendado", "Descartado"].includes(status) || !aiDraftId(draft);
    const hasPartialIds = !!aiDraftValue(draft, "partialIds") || !!draft?.cr40f_idscriadosparcialmente;
    el.aiDraftResume.hidden = status !== "Erro" || !hasPartialIds;
  }

  function parseAiLeg(draft) {
    try { return JSON.parse(aiDraftValue(draft, "legJson") || "{}"); } catch { return {}; }
  }

  function applyAiDraftToForm(draft, extraction, leg) {
    setSelectValue(el.cliente, extraction.clientId);
    setSelectValue(el.solicitante, extraction.requesterId);
    setFieldValue(el.saidaData, leg.date || "");
    const [hour = "", minute = ""] = String(leg.time || "").split(":");
    setSelectValue(el.saidaHora, hour); setSelectValue(el.saidaMinuto, minute);
    setSelectValue(el.tipoServico, leg.serviceTypeValue || findOptionValue("tipoServico", leg.serviceType || extraction.serviceType || ""));
    setSelectValue(el.tipoVeiculo, leg.vehicleTypeValue || findOptionValue("tipoVeiculo", leg.vehicleType || extraction.vehicleType || ""));
    setFieldValue(el.trajeto, leg.route || `${leg.origin || ""} / ${leg.destination || ""}`);
    setFieldValue(el.enderecoPersonalizado, leg.origin || "");
    setFieldValue(el.destino, leg.destination || "");
    setFieldValue(el.observacao, [extraction.observations, leg.notes].filter(Boolean).join("\n"));
    state.enderecoPersonalizadoAtivo = true;
    state.selectedPassengers = (extraction.passengers || []).filter((item) => item?.id).map((item, index) => ({ rowKey: nextPassengerRowKey(), ordem: index + 1, passageiro: getPassengerById(item.id), guid: item.id, telefone: getPassengerById(item.id)?.telefone || "", enderecoEditado: "" }));
    setSelectValue(el.statusOperacao, 202410004);
    renderPassengers();
    clearValidationStates();
    state.aiDraftReview = { draftId: aiDraftId(draft), extraction, leg, openedAt: new Date().toISOString() };
  }

  async function saveAiDraftReview(draft) {
    const config = aiDraftConfig();
    if (!config?.fields?.reviewJson || !state.xrm || !draft || !state.aiDraftReview) return;
    const context = state.xrm.Utility.getGlobalContext?.();
    const userId = String(context?.userSettings?.userId || "").replace(/[{}]/g, "");
    const payload = { sourceExtractionVersion: aiDraftValue(draft, "extractorVersion") || "", clientId: el.cliente?.value || "", requesterId: el.solicitante?.value || "", passengers: (state.selectedPassengers || []).map((item) => item.guid).filter(Boolean), legs: [{ ...state.aiDraftReview.leg, date: el.saidaData?.value || state.aiDraftReview.leg.date, time: `${el.saidaHora?.value || ""}:${el.saidaMinuto?.value || ""}`, origin: el.enderecoPersonalizado?.value || state.aiDraftReview.leg.origin, destination: el.destino?.value || state.aiDraftReview.leg.destination }], editedFields: ["cliente", "solicitante", "passageiros", "data", "hora", "rota", "observacao"], reviewedAt: new Date().toISOString(), reviewedBy: userId };
    const update = { [config.fields.reviewJson]: JSON.stringify(payload) };
    if (config.fields.reviewedAt) update[config.fields.reviewedAt] = payload.reviewedAt;
    if (config.reviewedByBind && userId) update[`${config.reviewedByBind}@odata.bind`] = `/systemusers(${userId})`;
    try {
      await state.xrm.WebApi.updateRecord(config.entity, aiDraftId(draft), update);
    } catch (error) {
      console.warn("Não foi possível salvar a revisão do rascunho IA; a extração original foi preservada.", error);
      toast("Revisão local aplicada. O campo de auditoria ainda não está publicado neste ambiente.", "warning", 7000);
    }
  }

  async function openSelectedAiDraftInForm() {
    const draft = state.selectedAiDraft;
    if (!draft || !aiDraftConfig() || (!state.xrm && !state.mockMode) || !state.isNew) { toast("Abra um formulário novo no Dataverse para revisar uma solicitação IA.", "error"); return; }
    const extraction = aiDraftExtractionForRow(draft);
    const leg = parseAiDraftJson(draft, "legJson");
    await ensurePassengersByIds((extraction.passengers || []).map((item) => item.id));
    applyAiDraftToForm(draft, extraction, leg);
    setTab("details");
    toast("Solicitação carregada no formulário. Revise e depois aprove.", "success", 6000);
  }

  async function approveSelectedAiDraft() {
    const draft = state.selectedAiDraft;
    if (!draft || !aiDraftConfig() || (!state.xrm && !state.mockMode) || !state.isNew) {
      toast("Abra um formulário novo no Dataverse para aprovar uma solicitação IA.", "error");
      return;
    }
    let extraction;
    try { extraction = aiDraftExtractionForRow(draft); } catch { toast("JSON da extração inválido.", "error"); return; }
    const leg = parseAiLeg(draft);
    if (!extraction.clientId || !extraction.requesterId || !(extraction.passengers || []).every((item) => item?.id)) {
      toast("Aprovação bloqueada: cliente, solicitante e passageiros precisam estar confirmados no Dataverse.", "error", 8000);
      return;
    }
    await ensurePassengersByIds(extraction.passengers.map((item) => item.id));
    const missing = extraction.passengers.filter((item) => !getPassengerById(item.id));
    if (missing.length) { toast("Aprovação bloqueada: passageiro não encontrado.", "error"); return; }
    if (!state.aiDraftReview || state.aiDraftReview.draftId !== aiDraftId(draft)) applyAiDraftToForm(draft, extraction, leg);
    await saveAiDraftReview(draft);
    const before = state.lastSuccessVoucher;
    await saveForm();
    if (state.lastSuccessVoucher && state.lastSuccessVoucher !== before) {
      const field = aiDraftConfig().fields.status;
      if (state.mockMode) updateMockAiDraftStatus(draft, aiDraftConfig().statusValues?.scheduled ?? 100000003, { cr40f_reservacriada: state.recordId || "" });
      else await state.xrm.WebApi.updateRecord(aiDraftConfig().entity, aiDraftId(draft), { [field]: aiDraftConfig().statusValues?.scheduled ?? 100000003 });
      await loadAiDrafts();
      toast("Trecho aprovado e reserva criada com status Solicitado.", "success");
    }
  }

  async function discardSelectedAiDraft() {
    const draft = state.selectedAiDraft;
    const config = aiDraftConfig();
    if (!draft || !config || (!state.xrm && !state.mockMode)) return;
    const field = config.fields.status;
    if (state.mockMode) updateMockAiDraftStatus(draft, config.statusValues?.discarded ?? 100000004);
    else await state.xrm.WebApi.updateRecord(config.entity, aiDraftId(draft), { [field]: config.statusValues?.discarded ?? 100000004 });
    await loadAiDrafts();
  }

  async function markAiDraftFailure(error) {
    const config = aiDraftConfig();
    const draft = state.selectedAiDraft;
    if (!config?.fields?.status || !draft || (!state.xrm && !state.mockMode) || !aiDraftId(draft)) return;
    const update = { [config.fields.status]: config.statusValues?.error ?? 100000005 };
    if (config.fields.partialIds) update[config.fields.partialIds] = JSON.stringify({ reservationId: state.recordId || "", saveLog: state.saveLog || [], error: error?.message || "Erro desconhecido" });
    try { if (state.mockMode) updateMockAiDraftStatus(draft, config.statusValues?.error ?? 100000005, { cr40f_idscriadosparcialmente: update[config.fields.partialIds] || "" }); else await state.xrm.WebApi.updateRecord(config.entity, aiDraftId(draft), update); } catch (updateError) { console.warn("Falha ao registrar erro do rascunho IA", updateError); }
  }

  async function resumeSelectedAiDraft() {
    await openSelectedAiDraftInForm();
    if (state.selectedAiDraft) await approveSelectedAiDraft();
  }

  function renderStatusFaturamento() {
    const current = el.statusFaturamento.value;
    renderChoiceSelect(el.statusFaturamento, state.options.statusFaturamento);
    setSelectValue(el.statusFaturamento, current || el.statusFaturamento.dataset.defaultValue || findOptionValue("statusFaturamento", "Pendente"));
  }

  function renderChoiceSelect(select, options) {
    if (!select) return;
    const previous = select.value;
    select.innerHTML = '<option value=""></option>';
    options.forEach((item) => {
      const option = document.createElement("option");
      option.value = String(item.value);
      option.textContent = item.label;
      select.appendChild(option);
    });
    if (previous) select.value = previous;
    if (!select.hidden) {
      ensureCustomSelect(select);
      refreshCustomSelect(select);
    }
  }

  function renderLookupSelect(select, rows) {
    if (!select) return;
    const isSolicitante = select === el.solicitante;
    const isPersonClient = isSolicitante || select.dataset.selectVariant === "person-client";
    if (isPersonClient) {
      select.dataset.selectVariant = "person-client";
    }
    const lookupRows = isSolicitante ? sortByLabel(rows) : rows;
    const previous = select.value;
    select.innerHTML = '<option value=""></option>';
    lookupRows.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      if (isPersonClient && item.clienteLabel) option.dataset.subtitle = item.clienteLabel;
      if (item.disabled) option.disabled = true;
      option.dataset.search = [item.search, item.clienteLabel].filter(Boolean).join(" ");
      select.appendChild(option);
    });
    if (previous) select.value = previous;
    if (!select.hidden) {
      ensureCustomSelect(select);
      if (isPersonClient) {
        const custom = customSelectRoots.get(select);
        custom?.wrapper?.classList.add("custom-select--person-client");
        custom?.panel?.classList.add("custom-select-panel--person-client");
      }
      refreshCustomSelect(select);
    }
    if (select === el.motorista) renderMotoristaVehicleHint();
  }

  function getPassengerById(passengerId) {
    return state.passageiros.find((item) => sameId(item.id, passengerId)) || null;
  }

  function getPassengerEditFields() {
    const f = CONFIG.fields.passageiro;
    return [
      { key: "label", label: "Nome do passageiro", kind: "text", required: true, span: "wide", stateKey: "label", payloadField: f.nome, inputType: "text" },
      { key: "telefone", label: "Telefone", kind: "text", stateKey: "telefone", payloadField: f.telefone, inputType: "tel" },
      { key: "email", label: "Email", kind: "text", span: "wide", stateKey: "email", payloadField: f.email, inputType: "email" },
      { key: "endereco", label: "Endereço de saída", kind: "textarea", span: "wide", stateKey: "endereco", payloadField: f.enderecoSaida },
      { key: "clienteId", label: "Cliente", kind: "lookup", required: true, stateKey: "clienteId", navName: CONFIG.nav.cliente, entitySet: CONFIG.entitySets.cliente, rowsKey: "clientes" },
      { key: "classificacao", label: "Classificação", kind: "choice", required: true, stateKey: "classificacao", payloadField: f.classificacao, optionsKey: "bdClassificacao" },
      { key: "idioma", label: "Idioma", kind: "choice", required: true, stateKey: "idioma", payloadField: f.idioma, optionsKey: "bdIdioma" },
      { key: "sexo", label: "Sexo", kind: "choice", stateKey: "sexo", payloadField: f.sexo, optionsKey: "bdSexo" },
      { key: "cargo", label: "Cargo", kind: "choice", stateKey: "cargo", payloadField: f.cargo, optionsKey: "bdCargo" },
      { key: "departamento", label: "Departamento", kind: "text", stateKey: "departamento", payloadField: f.departamento, inputType: "text" },
      { key: "cr", label: "CR", kind: "text", stateKey: "cr", payloadField: f.cr, inputType: "text" },
      { key: "nascimento", label: "Data de nascimento", kind: "date", stateKey: "nascimento", payloadField: f.nascimento },
      { key: "preferencias", label: "Perfil do passageiro", kind: "textarea", span: "wide", stateKey: "preferencias", payloadField: f.preferencias },
      { key: "tipoVeiculo", label: "Tipo de veículo", kind: "choice", stateKey: "tipoVeiculo", payloadField: f.tipoVeiculo, optionsKey: "bdTipoVeiculo" },
      { key: "fotoUrl", label: "Foto do passageiro", kind: "photo", span: "wide", stateKey: "fotoUrl", payloadField: f.fotoUrl }
    ];
  }

  function getPassengerEditField(fieldKey) {
    return getPassengerEditFields().find((field) => field.key === fieldKey) || null;
  }

  function getImportedPassengerEditFields() {
    return [
      { key: "nome", label: "Nome do passageiro", kind: "text", required: true, span: "wide", stateKey: "nome", inputType: "text" },
      { key: "telefone", label: "Telefone", kind: "text", stateKey: "telefone", inputType: "tel" },
      { key: "email", label: "Email", kind: "text", span: "wide", stateKey: "email", inputType: "email" }
    ];
  }

  function getImportedPassengerEditField(fieldKey) {
    return getImportedPassengerEditFields().find((field) => field.key === fieldKey) || null;
  }

  function getImportedSolicitanteEditFields() {
    return getImportedPassengerEditFields().map((field) => (
      field.key === "nome" ? { ...field, label: "Nome do solicitante" } : field
    ));
  }

  function getImportedSolicitanteEditField(fieldKey) {
    return getImportedSolicitanteEditFields().find((field) => field.key === fieldKey) || null;
  }

  function openPassengerEdit(passengerOrId) {
    const passenger = typeof passengerOrId === "object"
      ? passengerOrId
      : getPassengerById(passengerOrId);
    const passengerId = cleanGuid(passenger?.id || passengerOrId);
    if (!passenger || !passengerId) {
      toast("Passageiro não encontrado para edição.", "error");
      return;
    }
    if (!getPassengerById(passengerId)) {
      toast("Passageiro fora da lista local. Recarregue a tela antes de editar.", "error", 6000);
      return;
    }

    if (activeImportedPassengerEditRef) {
      flushPassengerEditSaves();
      activeImportedPassengerEditRef = null;
    }
    if (activePassengerEditId && !sameId(activePassengerEditId, passengerId)) {
      flushPassengerEditSaves(activePassengerEditId);
      clearActivePassengerEditPhotoDraft(activePassengerEditId);
    }
    activePassengerEditId = passengerId;
    clearActivePassengerEditPhotoDraft();
    passengerEditEnabled = false;
    preloadPassengerPhoto(passenger, "edit-open");
    renderPassengerEditHeader(passenger);
    renderPassengerEditFields(passenger);
    setPassengerEditMode(false);
    el.passengerEditOverlay.hidden = false;
  }

  function openImportedPassengerEdit(programacao, trechoKey, passengerIndex) {
    const cleanIndex = Number(passengerIndex);
    const trecho = findImportedTrecho(programacao, trechoKey);
    const passenger = trecho?.passageiros?.[cleanIndex] || null;
    if (!passenger) {
      toast("Passageiro importado não encontrado.", "error", 5000);
      return;
    }
    if (trecho.duplicatedRecordIds?.length) {
      toast("Serviço repetido não permite editar passageiro nesta tela.", "warning", 6000);
      return;
    }

    const passengerId = cleanGuid(passenger.passageiroId || "");
    if (passengerId) {
      const existing = importedResolvedPassenger(passenger);
      if (existing && !getPassengerById(passengerId)) mergePassengerRecords([existing]);
      openPassengerEdit(passengerId);
      return;
    }

    if (activePassengerEditId || activeImportedPassengerEditRef) {
      flushPassengerEditSaves(activePassengerEditId);
    }
    clearActivePassengerEditPhotoDraft(activePassengerEditId);
    activePassengerEditId = "";
    activeImportedPassengerEditRef = {
      programacao,
      trechoKey,
      passengerIndex: cleanIndex
    };
    passengerEditEnabled = false;
    renderPassengerEditHeader(importedPassengerPreviewRecord(passenger));
    renderImportedPassengerEditFields(passenger);
    setPassengerEditMode(false);
    if (el.passengerEditOverlay) el.passengerEditOverlay.hidden = false;
  }

  function openImportedSolicitanteEdit(programacao, trechoKey) {
    const trecho = findImportedTrecho(programacao, trechoKey);
    if (!trecho) {
      toast("Solicitante importado não encontrado.", "error", 5000);
      return;
    }
    if (trecho.duplicatedRecordIds?.length) {
      toast("Serviço repetido não permite editar solicitante nesta tela.", "warning", 6000);
      return;
    }

    const rows = importedSolicitanteLookupRows(trecho);
    const selectedValue = resolveImportedSolicitanteSelectValue(trecho, rows);
    if (!selectedValue) {
      toast("Adicione um solicitante antes de editar.", "warning", 5000);
      return;
    }

    if (!isImportedSolicitanteTempId(selectedValue)) {
      openPassengerEdit(selectedValue);
      return;
    }

    const draft = importedSolicitanteEditableRecord(trecho, selectedValue, rows);
    if (!draft.nome) {
      toast("Solicitante importado sem nome.", "error", 5000);
      return;
    }

    syncImportedSolicitanteDraft(trecho, draft);
    if (activePassengerEditId || activeImportedPassengerEditRef) {
      flushPassengerEditSaves(activePassengerEditId);
    }
    clearActivePassengerEditPhotoDraft(activePassengerEditId);
    activePassengerEditId = "";
    activeImportedPassengerEditRef = {
      programacao,
      trechoKey,
      target: "solicitante"
    };
    passengerEditEnabled = false;
    renderPassengerEditHeader(importedSolicitantePreviewRecord(trecho, trecho.solicitanteRecordId, rows));
    renderImportedSolicitanteEditFields(trecho);
    setPassengerEditMode(false);
    if (el.passengerEditOverlay) el.passengerEditOverlay.hidden = false;
  }

  function renderPassengerEditHeader(passenger, preserveStatus = false) {
    if (el.passengerEditTitle) {
      el.passengerEditTitle.textContent = passenger.label || "Passageiro sem nome";
    }
    if (!preserveStatus) {
      setPassengerEditStatus("", "");
    }
  }

  function renderPassengerEditFields(passenger) {
    renderPassengerEditFieldsWithSchema(getPassengerEditFields(), passenger);
  }

  function renderImportedPassengerEditFields(passenger) {
    renderPassengerEditFieldsWithSchema(getImportedPassengerEditFields(), passenger);
  }

  function renderImportedSolicitanteEditFields(trecho) {
    renderPassengerEditFieldsWithSchema(getImportedSolicitanteEditFields(), importedSolicitanteEditableRecord(trecho));
  }

  function renderPassengerEditFieldsWithSchema(fields, passenger) {
    if (!el.passengerEditFields) return;
    el.passengerEditFields.innerHTML = "";
    const layout = resolvePassengerEditLayout(fields);
    fields.forEach((field, index) => {
      const row = document.createElement("div");
      row.className = "passenger-edit-field";
      row.classList.toggle("is-wide", layout[index] === "wide");
      row.classList.toggle("is-multiline", field.kind === "textarea");
      row.classList.toggle("is-photo", field.kind === "photo");
      row.dataset.fieldKey = field.key;

      const head = document.createElement("div");
      head.className = "passenger-edit-field-head";

      const label = document.createElement("span");
      label.textContent = field.required ? `${field.label} *` : field.label;

      head.append(label);

      const control = buildPassengerEditControl(field, passenger);

      row.append(head, control);
      el.passengerEditFields.appendChild(row);

      if (control.tagName === "SELECT") {
        ensureCustomSelect(control);
        refreshCustomSelect(control);
      }
    });
  }

  function resolvePassengerEditLayout(fields) {
    const layout = Array(fields.length).fill("single");
    let pendingSingleIndex = null;

    fields.forEach((field, index) => {
      if (field.span === "wide") {
        if (pendingSingleIndex !== null) {
          layout[pendingSingleIndex] = "wide";
          pendingSingleIndex = null;
        }
        layout[index] = "wide";
        return;
      }

      if (pendingSingleIndex === null) {
        pendingSingleIndex = index;
        return;
      }

      layout[pendingSingleIndex] = "single";
      layout[index] = "single";
      pendingSingleIndex = null;
    });

    if (pendingSingleIndex !== null) {
      layout[pendingSingleIndex] = "wide";
    }

    return layout;
  }

  function buildPassengerEditControl(field, passenger) {
    let control;
    if (field.kind === "textarea") {
      control = document.createElement("textarea");
      control.rows = 3;
      control.readOnly = true;
    } else if (field.kind === "photo") {
      control = buildPassengerPhotoControl(passenger);
    } else if (field.kind === "choice" || field.kind === "lookup") {
      control = document.createElement("select");
      control.disabled = true;
      fillPassengerEditSelect(control, field);
    } else {
      control = document.createElement("input");
      control.type = field.kind === "date" ? "date" : (field.inputType || "text");
      applyPtBrDateLocale(control);
      if (field.inputType === "tel") control.inputMode = "tel";
      if (field.inputType === "email") control.autocomplete = "email";
      control.readOnly = true;
    }

    const rawValue = getPassengerEditValue(passenger, field);
    const value = field.key === "telefone" ? formatPhoneNumber(rawValue) : rawValue;
    control.classList.add("passenger-edit-control");
    control.dataset.passengerEditControl = field.key;
    control.dataset.savedValue = field.key === "telefone" ? phoneStorageValue(rawValue) : value;
    if (field.kind !== "photo") control.value = value;
    return control;
  }

  function buildPassengerPhotoControl(passenger) {
    const passengerId = cleanGuid(passenger?.id || activePassengerEditId);
    const draftState = getActivePassengerEditPhotoDraft(passengerId);
    const draft = draftState?.draft || null;
    const photoUrl = normalizePassengerPhotoUrl(passenger?.fotoUrl);
    const previewCandidates = draft?.previewDataUrl ? [draft.previewDataUrl] : passengerPhotoPreviewCandidates(photoUrl);
    const hasPhoto = previewCandidates.length > 0;
    const wrap = document.createElement("div");
    wrap.className = "passenger-photo-field passenger-photo-edit";
    wrap.classList.toggle("has-photo", hasPhoto);
    wrap.classList.toggle("has-draft", !!draft);
    wrap.tabIndex = 0;
    wrap.dataset.passengerPhotoDrop = "edit";

    const body = document.createElement("div");
    body.className = "passenger-photo-body";

    const icon = document.createElement("div");
    icon.className = "passenger-photo-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 3.5 7.8 7.7l1.4 1.4L11 7.3V15h2V7.3l1.8 1.8 1.4-1.4L12 3.5ZM5 14v4.2c0 .5.2.9.5 1.3.4.3.8.5 1.3.5h10.4c.5 0 .9-.2 1.3-.5.3-.4.5-.8.5-1.3V14h-2v4H7v-4H5Z"></path></svg>';

    const preview = document.createElement("img");
    preview.className = "passenger-photo-preview";
    preview.alt = hasPhoto ? (draft ? "Prévia da nova foto do passageiro" : "Foto atual do passageiro") : "";
    preview.hidden = !hasPhoto;
    if (hasPhoto) {
      preview.dataset.previewIndex = "0";
      preview.dataset.previewCandidates = JSON.stringify(previewCandidates);
      setPassengerPhotoImageSource(preview, previewCandidates[0], "edit-field");
    }
    preview.dataset.photoEditControl = "true";
    preview._passengerPhotoEditControl = wrap;

    const copy = document.createElement("div");
    copy.className = "passenger-photo-copy";
    const title = document.createElement("strong");
    title.textContent = draft ? draft.fileName : (photoUrl ? "Foto cadastrada." : "Sem foto cadastrada.");
    const hint = document.createElement("span");
    hint.textContent = draft
      ? formatPassengerEditPhotoDraftMeta(draftState)
      : (photoUrl ? "Desbloqueie para substituir." : "Desbloqueie para anexar ou cole com Ctrl+V.");
    copy.append(title, hint);
    body.append(icon, preview, copy);

    const actions = document.createElement("div");
    actions.className = "passenger-photo-actions";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.hidden = true;
    input.dataset.passengerPhotoFile = "edit";
    actions.append(input);
    body.append(actions);
    wrap.append(body);
    return wrap;
  }

  function markPassengerPhotoControlEmpty(control) {
    if (!control?.dataset || control.dataset.passengerEditControl !== "fotoUrl") return;
    control.classList.remove("has-photo");
    control.classList.remove("has-draft");
    const preview = control.querySelector(".passenger-photo-preview");
    if (preview) {
      preview.hidden = true;
      preview.removeAttribute("src");
      preview.alt = "";
    }
    const title = control.querySelector(".passenger-photo-copy strong");
    const savedValue = normalizePassengerPhotoUrl(control.dataset.savedValue);
    if (title) title.textContent = savedValue ? "Foto cadastrada." : "Sem foto cadastrada.";
    const hint = control.querySelector(".passenger-photo-copy span");
    if (hint) {
      hint.textContent = savedValue
        ? "Preview indisponivel para este link. Desbloqueie para substituir."
        : "Desbloqueie para anexar ou cole com Ctrl+V.";
    }
    applyPassengerEditEmptySignals();
  }

  function fillPassengerEditSelect(select, field) {
    select.innerHTML = '<option value=""></option>';
    const rows = field.kind === "lookup"
      ? state[field.rowsKey] || []
      : state.options[field.optionsKey] || [];
    rows.forEach((item) => {
      const option = document.createElement("option");
      option.value = String(item.value ?? item.id ?? "");
      option.textContent = item.label || "";
      select.appendChild(option);
    });
  }

  function getPassengerEditValue(passenger, field) {
    const raw = passenger?.[field.stateKey] ?? "";
    if (field.key === "fotoUrl") return normalizePassengerPhotoUrl(raw);
    if (field.kind === "date" && raw) return String(raw).slice(0, 10);
    return raw === null || raw === undefined ? "" : String(raw);
  }

  function normalizePassengerPhotoUrl(value) {
    const url = String(value || "").trim();
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(url)) return url;
    return "";
  }

  // Extrai o caminho na biblioteca a partir de um link de compartilhamento do SharePoint
  // (https://betinhos.sharepoint.com/:i:/r/sites/BetinhosGestoInterna/<caminho>), no formato
  // aceito pelo GetFileContentByPath do flow "Consultar Arquivos Sharepoint" (relativo ao site, com "/").
  function passengerPhotoSharePointLibraryPath(value) {
    try {
      const parsed = new URL(String(value || "").trim());
      if (parsed.hostname.toLowerCase() !== "betinhos.sharepoint.com") return "";
      const match = parsed.pathname.match(/^\/:[a-z]:\/r\/sites\/BetinhosGestoInterna\/(.+)$/i);
      if (!match?.[1]) return "";
      const path = match[1].split("/").map((part) => decodeURIComponent(part)).join("/");
      return /^Documentos Compartilhados\//i.test(path) ? `/${path}` : "";
    } catch (_) {
      return "";
    }
  }

  async function resolveConsultarArquivosFlowUrl() {
    if (!passengerPhotoConsultarFlowUrlPromise) {
      passengerPhotoConsultarFlowUrlPromise = (async () => {
        if (!state.xrm?.WebApi) return "";
        const schemaName = "new_URLFlowConsultarArquivosSharePoint";
        const definitions = await state.xrm.WebApi.retrieveMultipleRecords("environmentvariabledefinition", `?$select=environmentvariabledefinitionid,defaultvalue&$filter=schemaname eq '${schemaName}'`);
        const definition = definitions.entities?.[0];
        if (!definition) return "";
        const values = await state.xrm.WebApi.retrieveMultipleRecords("environmentvariablevalue", `?$select=value&$filter=_environmentvariabledefinitionid_value eq ${definition.environmentvariabledefinitionid}`);
        return String(values.entities?.[0]?.value || definition.defaultvalue || "").trim();
      })().catch((error) => {
        passengerPhotoConsultarFlowUrlPromise = null;
        throw error;
      });
    }
    return passengerPhotoConsultarFlowUrlPromise;
  }

  // Baixa a foto pelo flow (uma chamada por URL; promessa compartilhada) e devolve data URL.
  function fetchPassengerPhotoViaFlow(value) {
    const url = normalizePassengerPhotoUrl(value);
    const caminhoSharePoint = passengerPhotoSharePointLibraryPath(url);
    if (!caminhoSharePoint) return null;
    const cached = passengerPhotoFlowCache.get(url);
    if (cached) return cached.promise;
    const entry = { status: "loading", dataUrl: "", thumbDataUrl: "", promise: null };
    entry.promise = (async () => {
      const cacheKey = passengerPhotoCacheKey(url, passengerPhotoVersionByUrl.get(url));
      const stored = await readPassengerPhotoIdb(cacheKey);
      if (stored?.full) {
        entry.status = "loaded";
        entry.dataUrl = stored.full;
        entry.thumbDataUrl = stored.thumb || "";
        debugPassengerPhoto("cache:hit-idb", { src: url, hasThumb: !!entry.thumbDataUrl });
        return entry.dataUrl;
      }
      const flowUrl = await resolveConsultarArquivosFlowUrl();
      if (!flowUrl) throw new Error("Variável new_URLFlowConsultarArquivosSharePoint sem valor.");
      const nomeArquivo = caminhoSharePoint.split("/").pop() || "";
      const { response, body } = await runPassengerPhotoFlowTask(async () => {
        const res = await fetch(flowUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: caminhoSharePoint, fileLocator: "", caminhoSharePoint, nomeArquivo })
        });
        return { response: res, body: await res.json().catch(() => ({})) };
      });
      if (!response.ok || !body?.conteudoBase64) throw new Error(body?.erro || `Flow retornou HTTP ${response.status}.`);
      const mime = /^image\//i.test(String(body.mimeType || "")) ? body.mimeType : "image/jpeg";
      const fullDataUrl = `data:${mime};base64,${body.conteudoBase64}`;
      debugPassengerPhoto("flow:loaded", { src: url, caminhoSharePoint });
      entry.thumbDataUrl = await buildPassengerPhotoThumb(fullDataUrl);
      if (entry.thumbDataUrl) debugPassengerPhoto("thumb:ready", { src: url, bytes: entry.thumbDataUrl.length });
      entry.status = "loaded";
      entry.dataUrl = fullDataUrl;
      writePassengerPhotoIdb(cacheKey, fullDataUrl, entry.thumbDataUrl);
      return entry.dataUrl;
    })().catch((error) => {
      entry.status = "failed";
      debugPassengerPhoto("flow:failed", { src: url, caminhoSharePoint, error: String(error?.message || error) });
      return "";
    });
    passengerPhotoFlowCache.set(url, entry);
    return entry.promise;
  }

  function passengerPhotoCacheKey(url, version) {
    const cleanUrl = String(url || "").trim();
    if (!cleanUrl) return "";
    return `${cleanUrl}|${String(version || "").trim()}`;
  }

  // Remove as entradas mais antigas (savedAt) até caber em maxEntries e maxBytes.
  function passengerPhotoEvictionKeys(entries, maxEntries, maxBytes) {
    const sorted = [...(entries || [])].sort((a, b) => (Number(a.savedAt) || 0) - (Number(b.savedAt) || 0));
    let count = sorted.length;
    let bytes = sorted.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
    const keys = [];
    for (const item of sorted) {
      if (count <= maxEntries && bytes <= maxBytes) break;
      keys.push(item.key);
      count -= 1;
      bytes -= Number(item.bytes) || 0;
    }
    return keys;
  }

  function openPassengerPhotoIdb() {
    if (!passengerPhotoIdbPromise) {
      passengerPhotoIdbPromise = new Promise((resolve) => {
        try {
          if (!window.indexedDB) return resolve(null);
          const request = window.indexedDB.open(PASSENGER_PHOTO_IDB.name, 1);
          request.onupgradeneeded = () => {
            request.result.createObjectStore(PASSENGER_PHOTO_IDB.fotos, { keyPath: "key" });
            request.result.createObjectStore(PASSENGER_PHOTO_IDB.meta, { keyPath: "key" });
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
          request.onblocked = () => resolve(null);
        } catch (_) {
          resolve(null);
        }
      });
    }
    return passengerPhotoIdbPromise;
  }

  function passengerPhotoIdbResult(request) {
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  async function readPassengerPhotoIdb(key) {
    try {
      const db = key ? await openPassengerPhotoIdb() : null;
      if (!db) return null;
      return (await passengerPhotoIdbResult(db.transaction(PASSENGER_PHOTO_IDB.fotos, "readonly").objectStore(PASSENGER_PHOTO_IDB.fotos).get(key))) || null;
    } catch (_) {
      return null;
    }
  }

  async function writePassengerPhotoIdb(key, full, thumb) {
    try {
      const db = key && full ? await openPassengerPhotoIdb() : null;
      if (!db) return;
      const tx = db.transaction([PASSENGER_PHOTO_IDB.fotos, PASSENGER_PHOTO_IDB.meta], "readwrite");
      const fotos = tx.objectStore(PASSENGER_PHOTO_IDB.fotos);
      const meta = tx.objectStore(PASSENGER_PHOTO_IDB.meta);
      fotos.put({ key, full, thumb: thumb || "" });
      meta.put({ key, savedAt: Date.now(), bytes: full.length + (thumb || "").length });
      const all = (await passengerPhotoIdbResult(meta.getAll())) || [];
      passengerPhotoEvictionKeys(all, PASSENGER_PHOTO_IDB.maxEntries, PASSENGER_PHOTO_IDB.maxBytes).forEach((oldKey) => {
        fotos.delete(oldKey);
        meta.delete(oldKey);
      });
    } catch (error) {
      debugPassengerPhoto("cache:idb-write-failed", { error: String(error?.message || error) });
    }
  }

  function buildPassengerPhotoThumb(dataUrl) {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const width = img.naturalWidth || 1;
            const height = img.naturalHeight || 1;
            const scale = Math.min(1, PASSENGER_PHOTO_THUMB_MAX / Math.max(width, height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", 0.8));
          } catch (_) {
            resolve("");
          }
        };
        img.onerror = () => resolve("");
        img.src = dataUrl;
      } catch (_) {
        resolve("");
      }
    });
  }

  function runPassengerPhotoFlowTask(task) {
    return new Promise((resolve, reject) => {
      passengerPhotoFlowQueue.push({ task, resolve, reject });
      pumpPassengerPhotoFlowQueue();
    });
  }

  function pumpPassengerPhotoFlowQueue() {
    while (passengerPhotoFlowActive < PASSENGER_PHOTO_FLOW_CONCURRENCY && passengerPhotoFlowQueue.length) {
      const job = passengerPhotoFlowQueue.shift();
      passengerPhotoFlowActive += 1;
      Promise.resolve()
        .then(job.task)
        .then(job.resolve, job.reject)
        .finally(() => {
          passengerPhotoFlowActive -= 1;
          pumpPassengerPhotoFlowQueue();
        });
    }
  }

  // Miniatura gerada a partir da imagem completa (por URL do SharePoint ou pelo data URL completo).
  function passengerPhotoThumbFor(src) {
    const direct = passengerPhotoFlowCache.get(src);
    if (direct?.thumbDataUrl) return direct.thumbDataUrl;
    if (!/^data:image\//i.test(src)) return "";
    for (const entry of passengerPhotoFlowCache.values()) {
      if (entry.dataUrl === src && entry.thumbDataUrl) return entry.thumbDataUrl;
    }
    return "";
  }

  function isPassengerPhotoThumbSurface(surface) {
    return /^header/.test(String(surface || ""));
  }

  function passengerPhotoPreviewCandidates(value) {
    const url = normalizePassengerPhotoUrl(value);
    if (!url) return [];
    if (/^data:image\//i.test(url)) return [url];
    const flowDataUrl = passengerPhotoFlowCache.get(url)?.dataUrl || "";
    const candidates = flowDataUrl ? [flowDataUrl, url] : [url];
    const pathUrl = passengerPhotoPathUrl(url);
    if (pathUrl) candidates.push(pathUrl);
    if (pathUrl) {
      const sharePointPreview = passengerPhotoSharePointPreviewUrl(pathUrl);
      if (sharePointPreview) candidates.push(sharePointPreview);
      const sharePointDownload = passengerPhotoSharePointDownloadUrl(pathUrl);
      if (sharePointDownload) candidates.push(sharePointDownload);
    }
    const downloadable = passengerPhotoDownloadUrl(url);
    if (downloadable) candidates.push(downloadable);
    const unique = [...new Set(candidates)].filter((candidate) => passengerPhotoImageCache.get(candidate)?.status !== "failed");
    const cached = bestCachedPassengerPhotoCandidate(unique);
    const ordered = cached ? [cached, ...unique.filter((candidate) => candidate !== cached)] : unique;
    debugPassengerPhoto("candidates", { source: url, cached: cached || "", candidates: ordered });
    return ordered;
  }

  function bestCachedPassengerPhotoCandidate(candidates) {
    return (candidates || []).find((candidate) => passengerPhotoImageCache.get(candidate)?.status === "loaded") || "";
  }

  function setPassengerPhotoImageSource(img, src, surface = "image") {
    const url = normalizePassengerPhotoUrl(src);
    if (!img || !url) return;
    const cached = passengerPhotoImageCache.get(url);
    const current = img.currentSrc || img.src || "";
    const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    debugPassengerPhoto(cached?.status === "loaded" ? "render:cache-hit" : "render:cache-miss", {
      surface,
      src: url,
      status: cached?.status || "not-cached",
      sameSrc: current === url,
      complete: !!cached?.image?.complete,
      naturalWidth: cached?.image?.naturalWidth || cached?.width || 0,
      naturalHeight: cached?.image?.naturalHeight || cached?.height || 0
    });
    if (current === url) return;
    img.dataset.photoSrcToken = token;
    const flowEntry = passengerPhotoFlowCache.get(url);
    const flowPromise = flowEntry?.status === "failed" ? null : fetchPassengerPhotoViaFlow(url);
    img.classList.remove("is-loaded");
    img.onload = () => {
      if (img.dataset.photoSrcToken !== token) return;
      img.classList.add("is-loaded");
      passengerPhotoImageCache.set(url, {
        status: "loaded",
        image: img,
        loadedAt: Date.now(),
        width: img.naturalWidth || 0,
        height: img.naturalHeight || 0
      });
      debugPassengerPhoto("render:loaded", {
        surface,
        src: url,
        width: img.naturalWidth || 0,
        height: img.naturalHeight || 0
      });
    };
    img.onerror = () => {
      if (img.dataset.photoSrcToken !== token) return;
      markPassengerPhotoCandidateFailed(url, surface);
      if (surface === "viewer" || surface === "viewer-retry") {
        handlePassengerPhotoPreviewImageError();
        return;
      }
      if (surface === "edit-field" || surface === "edit-field-retry") {
        advancePassengerPhotoPreview(img, img._passengerPhotoEditControl || null);
        return;
      }
      advancePassengerPhotoImageElement(img);
    };
    const useThumb = isPassengerPhotoThumbSurface(surface);
    if (!flowPromise) {
      img.src = (useThumb && passengerPhotoThumbFor(url)) || url;
      return;
    }
    flowPromise.then((dataUrl) => {
      if (img.dataset.photoSrcToken !== token) return;
      if (dataUrl) passengerPhotoImageCache.set(url, { status: "loaded", image: img, loadedAt: Date.now() });
      img.src = (dataUrl && useThumb && passengerPhotoThumbFor(url)) || dataUrl || url;
    });
  }

  function markPassengerPhotoCandidateFailed(src, surface = "image") {
    const url = normalizePassengerPhotoUrl(src);
    if (!url) return;
    const cached = passengerPhotoImageCache.get(url);
    if (cached?.status === "loaded") return;
    passengerPhotoImageCache.set(url, {
      ...(cached || {}),
      status: "failed",
      failedAt: Date.now()
    });
    debugPassengerPhoto("render:failed", { surface, src: url });
  }

  function preloadPassengerPhoto(passenger, reason = "manual") {
    const url = normalizePassengerPhotoUrl(passenger?.fotoUrl);
    if (!url || /^data:image\//i.test(url)) return;
    // Fotos do SharePoint: busca em segundo plano pelo flow (fila com concorrência limitada + IndexedDB).
    if (passengerPhotoFlowCache.get(url)?.status !== "failed" && fetchPassengerPhotoViaFlow(url)) {
      debugPassengerPhoto("preload:flow", { reason, passengerId: passenger?.id || "", src: url });
      return;
    }
    const candidates = passengerPhotoPreviewCandidates(url);
    if (!candidates.length) return;
    debugPassengerPhoto("preload:start", {
      reason,
      passengerId: passenger?.id || "",
      passengerName: passenger?.label || passenger?.nome || "",
      candidates
    });
    preloadPassengerPhotoCandidate(candidates[0], passenger, reason);
  }

  function preloadPassengerPhotoCandidate(src, passenger, reason) {
    const url = normalizePassengerPhotoUrl(src);
    if (!url) return;
    const cached = passengerPhotoImageCache.get(url);
    if (cached?.status === "loaded" || cached?.status === "loading") {
      debugPassengerPhoto("preload:cache-hit", {
        reason,
        passengerId: passenger?.id || "",
        src: url,
        status: cached.status
      });
      return;
    }
    const img = new Image();
    passengerPhotoImageCache.set(url, {
      status: "loading",
      image: img,
      startedAt: Date.now(),
      passengerId: passenger?.id || "",
      passengerName: passenger?.label || passenger?.nome || ""
    });
    img.onload = () => {
      passengerPhotoImageCache.set(url, {
        status: "loaded",
        image: img,
        loadedAt: Date.now(),
        width: img.naturalWidth || 0,
        height: img.naturalHeight || 0,
        passengerId: passenger?.id || "",
        passengerName: passenger?.label || passenger?.nome || ""
      });
      debugPassengerPhoto("preload:loaded", {
        reason,
        passengerId: passenger?.id || "",
        src: url,
        width: img.naturalWidth || 0,
        height: img.naturalHeight || 0
      });
    };
    img.onerror = () => {
      passengerPhotoImageCache.set(url, {
        status: "failed",
        image: img,
        failedAt: Date.now(),
        passengerId: passenger?.id || "",
        passengerName: passenger?.label || passenger?.nome || ""
      });
      debugPassengerPhoto("preload:failed", {
        reason,
        passengerId: passenger?.id || "",
        src: url
      });
    };
    img.src = url;
  }

  function passengerPhotoPathUrl(url) {
    try {
      const parsed = new URL(url, window.location.href);
      const host = parsed.hostname.toLowerCase();
      if (!host.includes("sharepoint.com") && !host.includes("onedrive.com")) return "";
      const marker = parsed.pathname.match(/^\/:[a-z]:\/r(\/.+)$/i);
      if (!marker?.[1]) return "";
      return `${parsed.origin}${marker[1]}`;
    } catch (_) {
      return "";
    }
  }

  function passengerPhotoDownloadUrl(url) {
    try {
      const parsed = new URL(url, window.location.href);
      const host = parsed.hostname.toLowerCase();
      if (!host.includes("sharepoint.com") && !host.includes("onedrive.com")) return "";
      parsed.searchParams.set("download", "1");
      return parsed.toString();
    } catch (_) {
      return "";
    }
  }

  function passengerPhotoSharePointPreviewUrl(url) {
    try {
      const parsed = new URL(url, window.location.href);
      const host = parsed.hostname.toLowerCase();
      if (!host.includes("sharepoint.com")) return "";
      const path = parsed.pathname.match(/^\/:[a-z]:\/r(\/.+)$/i)?.[1] || parsed.pathname;
      if (!path || path.includes("/_layouts/")) return "";
      return `${parsed.origin}/_layouts/15/getpreview.ashx?path=${encodeURIComponent(path)}`;
    } catch (_) {
      return "";
    }
  }

  function passengerPhotoSharePointDownloadUrl(url) {
    try {
      const parsed = new URL(url, window.location.href);
      const host = parsed.hostname.toLowerCase();
      if (!host.includes("sharepoint.com")) return "";
      const path = parsed.pathname.match(/^\/:[a-z]:\/r(\/.+)$/i)?.[1] || parsed.pathname;
      if (!path || path.includes("/_layouts/")) return "";
      return `${parsed.origin}/_layouts/download.aspx?SourceUrl=${encodeURIComponent(`${parsed.origin}${path}`)}`;
    } catch (_) {
      return "";
    }
  }

  function passengerPhotoFrameUrl(value) {
    const url = normalizePassengerPhotoUrl(value);
    if (!url || /^data:image\//i.test(url)) return "";
    try {
      const parsed = new URL(url, window.location.href);
      const host = parsed.hostname.toLowerCase();
      if (!host.includes("sharepoint.com") && !host.includes("onedrive.com")) return url;
      parsed.searchParams.set("web", "1");
      parsed.searchParams.delete("download");
      return parsed.toString();
    } catch (_) {
      return url;
    }
  }

  function advancePassengerPhotoPreview(preview, control) {
    let candidates = [];
    try {
      candidates = JSON.parse(preview?.dataset?.previewCandidates || "[]");
    } catch (_) {
      candidates = [];
    }
    const nextIndex = Number(preview?.dataset?.previewIndex || "0") + 1;
    markPassengerPhotoCandidateFailed(preview?.currentSrc || preview?.src || "", "edit-field");
    if (preview && candidates[nextIndex]) {
      preview.dataset.previewIndex = String(nextIndex);
      debugPassengerPhoto("edit-field:retry", { nextSrc: candidates[nextIndex], nextIndex, candidates });
      setPassengerPhotoImageSource(preview, candidates[nextIndex], "edit-field-retry");
      return;
    }
    debugPassengerPhoto("edit-field:fallback-empty", { candidates });
    markPassengerPhotoControlEmpty(control);
  }

  function getActivePassengerEditPhotoDraft(passengerId = activePassengerEditId) {
    const cleanPassengerId = cleanGuid(passengerId);
    if (!cleanPassengerId || !activePassengerEditPhotoDraft?.passengerId) return null;
    return sameId(activePassengerEditPhotoDraft.passengerId, cleanPassengerId) ? activePassengerEditPhotoDraft : null;
  }

  function setActivePassengerEditPhotoDraft(passengerId, draft, options = {}) {
    const cleanPassengerId = cleanGuid(passengerId);
    if (!cleanPassengerId || !draft) {
      activePassengerEditPhotoDraft = null;
      return;
    }
    activePassengerEditPhotoDraft = {
      passengerId: cleanPassengerId,
      draft,
      uploading: options.uploading !== false,
      saved: !!options.saved,
      failed: !!options.failed
    };
  }

  function clearActivePassengerEditPhotoDraft(passengerId = "") {
    if (!activePassengerEditPhotoDraft) return;
    if (!passengerId) {
      activePassengerEditPhotoDraft = null;
      return;
    }
    if (sameId(activePassengerEditPhotoDraft.passengerId, cleanGuid(passengerId))) {
      activePassengerEditPhotoDraft = null;
    }
  }

  function formatPassengerEditPhotoDraftMeta(draftState) {
    const draft = draftState?.draft;
    if (!draft) return "Desbloqueie para anexar ou cole com Ctrl+V.";
    const kb = Math.max(1, Math.ceil((draft.fileSize || 0) / 1024));
    if (draftState?.failed) return `${kb} KB - Falha no upload. Cole ou anexe outra imagem.`;
    if (draftState?.saved) return `${kb} KB - Foto salva no Dataverse.`;
    if (draftState?.uploading) return `${kb} KB - Enviando foto...`;
    return `${kb} KB - Foto pronta para salvar.`;
  }

  function togglePassengerEditMode() {
    setPassengerEditMode(!passengerEditEnabled);
  }

  function setPassengerEditMode(enabled) {
    passengerEditEnabled = !!enabled;
    if (el.passengerEditOverlay) {
      el.passengerEditOverlay.dataset.editing = passengerEditEnabled ? "true" : "false";
    }
    if (el.passengerEditToggle) {
      el.passengerEditToggle.classList.toggle("is-active", passengerEditEnabled);
      el.passengerEditToggle.setAttribute("aria-pressed", String(passengerEditEnabled));
      el.passengerEditToggle.setAttribute("aria-label", passengerEditEnabled ? "Bloquear edição" : "Habilitar edição");
    }
    el.passengerEditFields?.querySelectorAll("[data-passenger-edit-control]").forEach((control) => {
      if (control.dataset.passengerEditControl === "fotoUrl") {
        control.querySelectorAll("button, input").forEach((item) => {
          item.disabled = !passengerEditEnabled;
        });
        control.classList.toggle("is-disabled", !passengerEditEnabled);
        return;
      }
      if (control.tagName === "SELECT") {
        control.disabled = !passengerEditEnabled;
        refreshCustomSelect(control);
      } else {
        control.readOnly = !passengerEditEnabled;
      }
    });
  }

  function handlePassengerEditInput(event) {
    const control = event.target.closest("[data-passenger-edit-control]");
    if (!control || !el.passengerEditFields.contains(control)) return;
    if (control.dataset.passengerEditControl === "fotoUrl") return;
    if (control.disabled || control.readOnly) return;
    formatPassengerEditControl(control.dataset.passengerEditControl, control);
    const delay = event.type === "input" && control.tagName !== "SELECT" ? 550 : 0;
    schedulePassengerEditSave(control.dataset.passengerEditControl, control, delay);
  }

  function formatPassengerEditControl(fieldKey, control) {
    if (!control) return;
    if (fieldKey === "telefone") control.value = formatPhoneNumber(control.value);
    if (fieldKey === "email") control.value = normalizeEmail(control.value);
    if (fieldKey === "cr" || fieldKey === "centroCusto") control.value = normalizeCodeValue(control.value);
  }

  function schedulePassengerEditSave(fieldKey, control, delay) {
    const existing = passengerEditSaveTimers.get(fieldKey);
    if (existing) window.clearTimeout(existing.timer);
    const importedRef = activeImportedPassengerEditRef ? { ...activeImportedPassengerEditRef } : null;
    const passengerId = activePassengerEditId;
    setPassengerFieldStatus(control, "saving");
    setPassengerEditStatus("Salvando...", "saving");
    const timer = window.setTimeout(() => {
      passengerEditSaveTimers.delete(fieldKey);
      if (importedRef) {
        saveImportedPassengerEditField(fieldKey, control, importedRef);
      } else {
        savePassengerEditField(fieldKey, control, passengerId);
      }
    }, delay);
    passengerEditSaveTimers.set(fieldKey, { timer, fieldKey, control, importedRef, passengerId });
  }

  function flushPassengerEditSaves(passengerId) {
    const entries = [...passengerEditSaveTimers.values()];
    passengerEditSaveTimers.clear();
    entries.forEach((entry) => window.clearTimeout(entry.timer));
    entries.forEach((entry) => {
      if (entry.importedRef) {
        saveImportedPassengerEditField(entry.fieldKey, entry.control, entry.importedRef);
      } else {
        savePassengerEditField(entry.fieldKey, entry.control, passengerId || entry.passengerId);
      }
    });
  }

  async function savePassengerEditField(fieldKey, control, passengerId) {
    const field = getPassengerEditField(fieldKey);
    const cleanPassengerId = cleanGuid(passengerId || activePassengerEditId);
    const index = state.passageiros.findIndex((item) => sameId(item.id, cleanPassengerId));
    if (!field || index < 0) return;

    const value = readPassengerEditControlValue(control, field);
    if (field.required && !value) {
      setPassengerFieldStatus(control, "error");
      setPassengerEditStatus("Campo obrigatorio.", "error");
      return;
    }
    if (field.key === "telefone" && value && !parsePhoneNumber(value).isValid) {
      setPassengerFieldStatus(control, "error");
      setPassengerEditStatus(parsePhoneNumber(value).message || "Telefone invalido.", "error");
      return;
    }
    if (field.key === "email" && value && !control.checkValidity()) {
      setPassengerFieldStatus(control, "error");
      setPassengerEditStatus("Email invalido.", "error");
      return;
    }
    if (value === (control.dataset.savedValue || "")) {
      setPassengerFieldStatus(control, "");
      setPassengerEditStatus("", "");
      return;
    }

    try {
      const payload = buildPassengerEditPayload(field, value);
      if (state.xrm && !state.mockMode) {
        await state.xrm.WebApi.updateRecord(CONFIG.entities.passageiro, cleanPassengerId, payload);
      }

      const updatedPassenger = applyPassengerFieldToState(cleanPassengerId, field, value);
      if (updatedPassenger) persistMockPassengerRecord(updatedPassenger);
      control.dataset.savedValue = value;
      if (field.key === "telefone") control.value = formatPhoneNumber(value);
      setPassengerFieldStatus(control, "saved");
      setPassengerEditStatus("Atualizado.", "saved");
      if (updatedPassenger) renderPassengerEditHeader(updatedPassenger, true);
      refreshPassengerDependentViews(cleanPassengerId);
    } catch (error) {
      console.error(error);
      setPassengerFieldStatus(control, "error");
      setPassengerEditStatus(`Falha ao atualizar ${field.label}.`, "error");
      toast(`Falha ao salvar ${field.label}. ${error.message || ""}`, "error", 8000);
    }
  }

  function saveImportedPassengerEditField(fieldKey, control, ref) {
    if (ref?.target === "solicitante") {
      saveImportedSolicitanteEditField(fieldKey, control, ref);
      return;
    }
    const field = getImportedPassengerEditField(fieldKey);
    const trecho = findImportedTrecho(ref?.programacao, ref?.trechoKey);
    const passenger = trecho?.passageiros?.[Number(ref?.passengerIndex)] || null;
    if (!field || !trecho || !passenger) return;

    const value = readPassengerEditControlValue(control, field);
    if (field.required && !value) {
      setPassengerFieldStatus(control, "error");
      setPassengerEditStatus("Campo obrigatorio.", "error");
      return;
    }
    if (field.key === "telefone" && value && !parsePhoneNumber(value).isValid) {
      setPassengerFieldStatus(control, "error");
      setPassengerEditStatus(parsePhoneNumber(value).message || "Telefone invalido.", "error");
      return;
    }
    if (field.key === "email" && value && !control.checkValidity()) {
      setPassengerFieldStatus(control, "error");
      setPassengerEditStatus("Email invalido.", "error");
      return;
    }
    if (value === (control.dataset.savedValue || "")) {
      setPassengerFieldStatus(control, "");
      setPassengerEditStatus("", "");
      return;
    }

    const previousIdentity = importedPassengerIdentityKey(passenger);
    captureImportReviewHistory(`Editar passageiro importado: ${field.label}`);
    markImportedReviewPending(trecho);
    passenger[field.stateKey] = value;
    if (["nome", "telefone", "email", "centroCusto"].includes(field.key)) {
      passenger.passageiroId = "";
      passenger.passageiroLabel = "";
      passenger.matchCandidates = [];
      passenger.matchStatus = "create-new";
      passenger.matchMessage = "Dados revisados. Ao salvar, o sistema revalida duplicidade antes de criar.";
    }
    syncImportedSolicitanteFromPassenger(trecho, passenger, previousIdentity);
    control.dataset.savedValue = value;
    if (field.key === "telefone") control.value = formatPhoneNumber(value);
    setPassengerFieldStatus(control, "saved");
    setPassengerEditStatus("Atualizado.", "saved");
    renderPassengerEditHeader(importedPassengerPreviewRecord(passenger), true);
  }

  function saveImportedSolicitanteEditField(fieldKey, control, ref) {
    const field = getImportedSolicitanteEditField(fieldKey);
    const trecho = findImportedTrecho(ref?.programacao, ref?.trechoKey);
    if (!field || !trecho) return;

    const value = readPassengerEditControlValue(control, field);
    if (field.required && !value) {
      setPassengerFieldStatus(control, "error");
      setPassengerEditStatus("Campo obrigatorio.", "error");
      return;
    }
    if (field.key === "telefone" && value && !parsePhoneNumber(value).isValid) {
      setPassengerFieldStatus(control, "error");
      setPassengerEditStatus(parsePhoneNumber(value).message || "Telefone invalido.", "error");
      return;
    }
    if (field.key === "email" && value && !control.checkValidity()) {
      setPassengerFieldStatus(control, "error");
      setPassengerEditStatus("Email invalido.", "error");
      return;
    }
    if (value === (control.dataset.savedValue || "")) {
      setPassengerFieldStatus(control, "");
      setPassengerEditStatus("", "");
      return;
    }

    const previousIdentity = importedSolicitanteIdentityKey(trecho);
    captureImportReviewHistory(`Editar solicitante importado: ${field.label}`);
    markImportedReviewPending(trecho);
    const next = {
      ...importedSolicitanteEditableRecord(trecho),
      [field.stateKey]: value
    };
    syncImportedSolicitanteDraft(trecho, next);
    syncImportedPassengerFromSolicitante(trecho, next, previousIdentity);
    control.dataset.savedValue = value;
    if (field.key === "telefone") control.value = formatPhoneNumber(value);
    setPassengerFieldStatus(control, "saved");
    setPassengerEditStatus("Atualizado.", "saved");
    renderPassengerEditHeader(importedSolicitantePreviewRecord(trecho), true);
  }

  function readPassengerEditControlValue(control, field) {
    if (!control) return "";
    if (field.kind === "text" || field.kind === "textarea") {
      if (field.key === "telefone") return phoneStorageValue(control.value);
      if (field.key === "email") return normalizeEmail(control.value);
      if (field.key === "cr" || field.key === "centroCusto") return normalizeCodeValue(control.value);
      if (field.key === "label" || field.key === "nome") return normalizePassengerDisplayName(control.value);
      return control.value.trim();
    }
    return control.value || "";
  }

  function buildPassengerEditPayload(field, value) {
    const payload = {};
    if (field.kind === "lookup") {
      payload[`${field.navName}@odata.bind`] = value
        ? `/${field.entitySet}(${cleanGuid(value)})`
        : null;
      return payload;
    }
    if (field.kind === "choice") {
      payload[field.payloadField] = value === "" ? null : (Number.isFinite(Number(value)) ? Number(value) : value);
      return payload;
    }
    if (field.kind === "date") {
      payload[field.payloadField] = value || null;
      return payload;
    }
    payload[field.payloadField] = value;
    return payload;
  }

  function applyPassengerFieldToState(passengerId, field, value) {
    const index = state.passageiros.findIndex((item) => sameId(item.id, passengerId));
    if (index < 0) return null;

    const stateValue = field.key === "telefone" ? formatPhoneNumber(value) : value;
    const updatedPassenger = {
      ...state.passageiros[index],
      [field.stateKey]: stateValue
    };
    if (field.key === "clienteId") {
      updatedPassenger.clienteLabel = state.clientes.find((item) => sameId(item.id, value))?.label || "";
    }
    if (field.key === "tipoVeiculo") {
      updatedPassenger.tipoVeiculoLabel = optionLabel("bdTipoVeiculo", value);
    }

    state.passageiros[index] = updatedPassenger;
    state.passageiros.sort((a, b) => (a.label || "").localeCompare(b.label || "", "pt-BR"));
    state.selectedPassengers = state.selectedPassengers.map((item) => (
      sameId(item.guid, passengerId)
        ? {
            ...item,
            passageiro: updatedPassenger,
            telefone: updatedPassenger.telefone,
            enderecoEditado: getDraftAddress(item.ordem) || updatedPassenger.endereco || ""
          }
        : item
    ));
    return updatedPassenger;
  }

  function refreshPassengerDependentViews(passengerId) {
    const currentSolicitante = el.solicitante.value;
    renderLookupSelect(el.solicitante, state.passageiros);
    setSelectValue(el.solicitante, currentSolicitante);
    renderPassengers();
    renderRiskPanel();
    markDraftDirty();
  }

  function setPassengerEditStatus(text, status) {
    if (!el.passengerEditStatus) return;
    if (passengerEditStatusTimer) {
      window.clearTimeout(passengerEditStatusTimer);
      passengerEditStatusTimer = null;
    }
    el.passengerEditStatus.textContent = text || "";
    el.passengerEditStatus.dataset.status = status || "";
    if (status === "saved") {
      passengerEditStatusTimer = window.setTimeout(() => {
        passengerEditStatusTimer = null;
        if (el.passengerEditStatus?.dataset.status === "saved") {
          setPassengerEditStatus("", "");
        }
      }, 1400);
    }
  }

  function setPassengerFieldStatus(control, status) {
    const row = control?.closest?.(".passenger-edit-field");
    if (!row) return;
    row.classList.remove("is-saving", "is-saved", "is-error");
    addClassIfPresent(row, `is-${status || ""}`);
    if (status === "saved") {
      window.setTimeout(() => {
        if (row.isConnected) row.classList.remove("is-saved");
      }, 1200);
    }
  }

  function closePassengerEditPopup() {
    const shouldRefreshImportReview = !!activeImportedPassengerEditRef;
    if (activePassengerEditId || activeImportedPassengerEditRef) {
      flushPassengerEditSaves(activePassengerEditId);
    }
    clearActivePassengerEditPhotoDraft(activePassengerEditId);
    closeAllCustomSelects();
    if (el.passengerEditOverlay) el.passengerEditOverlay.hidden = true;
    if (el.passengerEditFields) el.passengerEditFields.replaceChildren();
    activePassengerEditId = "";
    activeImportedPassengerEditRef = null;
    passengerEditEnabled = false;
    setPassengerEditStatus("", "");
    if (shouldRefreshImportReview) renderImportReviewPreservingGallery();
  }

  function renderScheduleDrafts() {
    if (!el.scheduleDraftRows) return;
    if (!state.isNew) {
      el.scheduleDraftRows.innerHTML = "";
      return;
    }

    const existingRows = new Map(
      [...el.scheduleDraftRows.children].map((row) => [row.dataset.scheduleKey, row])
    );
    const keepRows = [];
    const activeKeys = new Set();

    state.scheduleDrafts.forEach((item, index) => {
      if (!item.key) item.key = nextScheduleDraftKey();
      const row = existingRows.get(item.key) || buildScheduleDraftRow(item);
      hydrateScheduleDraftRow(row, item, index);
      keepRows.push(row);
      activeKeys.add(item.key);
    });

    [...el.scheduleDraftRows.children].forEach((row) => {
      if (!activeKeys.has(row.dataset.scheduleKey)) row.remove();
    });

    keepRows.forEach((row) => el.scheduleDraftRows.appendChild(row));
    el.scheduleDraftRows.classList.toggle("is-empty", state.scheduleDrafts.length === 0);
    syncDateTimeFieldRowWidths();
  }

  function buildScheduleDraftRow(item) {
    const row = document.createElement("div");
    row.className = "schedule-draft";
    row.dataset.scheduleKey = item.key;
    row.innerHTML = `
      <div class="schedule-draft-head">
        <strong data-schedule-title></strong>
        <div class="schedule-actions">
          <button type="button" class="text-action" data-schedule-action="copy">Copiar principal</button>
          <button type="button" class="remove-row" data-schedule-action="remove" title="Remover agendamento">X</button>
        </div>
      </div>
      <div class="schedule-draft-grid">
        <label class="field span-2 required datetime-field">
          <span>Data e horário</span>
          <div class="inline-time">
            <input type="datetime-local" lang="pt-BR" data-schedule-field="dataHora" step="300">
            <input type="hidden" data-schedule-field="data">
            <input type="hidden" data-schedule-field="hora">
            <input type="hidden" data-schedule-field="minuto">
          </div>
        </label>
        <label class="field datetime-field">
          <span>Hr prev retorno</span>
          <div class="inline-time">
            <input type="datetime-local" lang="pt-BR" data-schedule-field="retPrevDateTime" step="300">
            <input type="hidden" data-schedule-field="retPrevHora">
            <input type="hidden" data-schedule-field="retPrevMinuto">
          </div>
        </label>
        <label class="field required">
          <span>Tipo serviço</span>
          <select data-schedule-field="tipoServico"></select>
        </label>
        <label class="field required">
          <span>Tipo veículo</span>
          <select data-schedule-field="tipoVeiculo"></select>
        </label>
        <label class="field">
          <span>Motorista</span>
          <select data-schedule-field="motorista"></select>
        </label>
        <label class="field span-2 required">
          <span>Trajeto</span>
          <input type="text" data-schedule-field="trajeto" autocomplete="off">
        </label>
        <label class="field span-2 required">
          <span>Destino</span>
          <textarea rows="3" data-schedule-field="destino"></textarea>
        </label>
        <label class="field span-2">
          <span>Observação motorista</span>
          <textarea rows="3" data-schedule-field="obsMotorista"></textarea>
        </label>
      </div>
    `;
    return row;
  }

  function hydrateScheduleDraftRow(row, item, index) {
    row.dataset.scheduleKey = item.key;
    syncScheduleDateTimeFields(item);
    row.querySelector("[data-schedule-title]").textContent = `Agendamento ${index + 2}`;
    setScheduleInput(row, "dataHora", item.dataHora);
    setScheduleInput(row, "data", item.data);
    setScheduleInput(row, "hora", item.hora);
    setScheduleInput(row, "minuto", item.minuto);
    setScheduleInput(row, "retPrevDateTime", item.retPrevDateTime);
    setScheduleInput(row, "retPrevHora", item.retPrevHora);
    setScheduleInput(row, "retPrevMinuto", item.retPrevMinuto);
    fillScheduleOptions(row, "tipoServico", state.options.tipoServico, item.tipoServico);
    fillScheduleOptions(row, "tipoVeiculo", state.options.tipoVeiculo, item.tipoVeiculo);
    fillScheduleLookup(row, "motorista", state.motoristas, item.motorista);
    setScheduleInput(row, "trajeto", item.trajeto);
    setScheduleInput(row, "destino", item.destino);
    setScheduleInput(row, "obsMotorista", item.obsMotorista);
  }

  function fillScheduleOptions(row, field, options, value) {
    const select = row.querySelector(`[data-schedule-field="${field}"]`);
    if (!select) return;
    select.innerHTML = '<option value=""></option>';
    options.forEach((item) => {
      const option = document.createElement("option");
      option.value = String(item.value);
      option.textContent = item.label;
      select.appendChild(option);
    });
    select.value = value ? String(value) : "";
    ensureCustomSelect(select);
    refreshCustomSelect(select);
  }

  function fillScheduleLookup(row, field, rows, value) {
    const select = row.querySelector(`[data-schedule-field="${field}"]`);
    if (!select) return;
    select.innerHTML = '<option value=""></option>';
    rows.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      select.appendChild(option);
    });
    select.value = value || "";
    ensureCustomSelect(select);
    refreshCustomSelect(select);
  }

  function setScheduleInput(row, field, value) {
    const input = row.querySelector(`[data-schedule-field="${field}"]`);
    if (input) input.value = value || "";
  }

  function renderPassengers() {
    scheduleValidationRefresh();
    const passengerTotal = state.selectedPassengers.length;
    const hasUnfilledPassenger = state.selectedPassengers.some((item) => !item.passageiro || !item.guid);
    const hasCandidates = getAvailablePassengers().length > 0;
    const previousRects = new Map(
      [...el.passengerRows.children]
        .filter((row) => row.dataset.rowKey)
        .map((row) => [row.dataset.rowKey, row.getBoundingClientRect()])
    );
    if (el.passengerEmpty) {
      el.passengerEmpty.hidden = passengerTotal > 0;
    }
    if (el.passengerBlock) {
      el.passengerBlock.classList.toggle("is-shared-address", state.enderecoPersonalizadoAtivo);
    }
    el.customAddressWrap.hidden = !state.enderecoPersonalizadoAtivo;
    if (el.toggleEnderecoPersonalizado) {
      el.toggleEnderecoPersonalizado.textContent = state.enderecoPersonalizadoAtivo ? "Endereço por passageiro" : "Endereço único";
      el.toggleEnderecoPersonalizado.title = state.enderecoPersonalizadoAtivo ? "Usar endereço por passageiro" : "Usar endereço único para todos";
      el.toggleEnderecoPersonalizado.setAttribute(
        "aria-label",
        state.enderecoPersonalizadoAtivo ? "Usar endereço por passageiro" : "Usar endereço único para todos"
      );
      el.toggleEnderecoPersonalizado.setAttribute("aria-pressed", String(state.enderecoPersonalizadoAtivo));
    }
    if (el.addPassenger) {
      el.addPassenger.textContent = "+";
      el.addPassenger.setAttribute("aria-label", "Adicionar passageiro");
      el.addPassenger.disabled = !hasCandidates;
      el.addPassenger.title = hasUnfilledPassenger
        ? "Selecionar passageiro pendente."
        : (hasCandidates
          ? "Adicionar novo passageiro"
          : "Sem passageiros disponíveis para adicionar.");
    }
    sortPassengers();

    const existingRows = new Map(
      [...el.passengerRows.children].map((row) => [row.dataset.rowKey, row])
    );
    const keepRows = [];
    const activeKeys = new Set();

    state.selectedPassengers.forEach((item, index) => {
      if (!item.rowKey) item.rowKey = nextPassengerRowKey();
      const row = existingRows.get(item.rowKey) || buildPassengerRow(item);
      hydratePassengerRow(row, item, index);
      keepRows.push(row);
      activeKeys.add(item.rowKey);

      if (!row.isConnected) {
        row.classList.add("is-enter");
      }
    });

    [...el.passengerRows.children].forEach((row) => {
      if (!activeKeys.has(row.dataset.rowKey)) {
        closePassengerPreview(row.querySelector(".row-title-wrap"));
        row.remove();
      }
    });

    keepRows.forEach((row, index) => {
      row.style.setProperty("--row-index", String(index));
      el.passengerRows.appendChild(row);
    });
    animatePassengerRowReflow(previousRects, keepRows);

    if (state.enderecoPersonalizadoAtivo && !el.enderecoPersonalizado.value) {
      el.enderecoPersonalizado.value = composeEnderecoCompleto();
    }
    syncPassengerNameColumnWidth();
    syncReturnDefaults();
  }

  function syncPassengerNameColumnWidth() {
    const PASSENGER_NAME_MAX_WIDTH = 320;
    if (!el.passengerRows) return;
    const labels = [...el.passengerRows.querySelectorAll(".row-label")];
    const targets = [el.passengerRows].filter(Boolean);
    targets.forEach((target) => target.style.removeProperty("--passenger-name-width"));

    if (!labels.length) return;

    // Sem a variável, a coluna fica "auto" e cada rótulo mede o natural (número + nome completo).
    // Teto de 320 px para o endereço não ficar espremido; nome maior aparece com reticências e inteiro na dica.
    const maxWidth = Math.min(PASSENGER_NAME_MAX_WIDTH, Math.max(
      ...labels.map((label) => {
        const title = label.querySelector(".row-title");
        const overflow = title ? Math.max(0, title.scrollWidth - title.clientWidth) : 0;
        return Math.ceil(label.getBoundingClientRect().width + overflow);
      })
    ));
    if (!Number.isFinite(maxWidth) || maxWidth <= 0) return;

    targets.forEach((target) => target.style.setProperty("--passenger-name-width", `${maxWidth}px`));
  }

  function syncImportedPassengerNameColumnWidths() {
    if (!el.importReviewPrograms) return;
    const IMPORT_PASSENGER_BLOCK_MAX_WIDTH = 340;
    const lists = [...el.importReviewPrograms.querySelectorAll(".import-passengers")];
    lists.forEach((list) => {
      list.style.removeProperty("--import-passenger-name-width");
      list.style.removeProperty("--import-passenger-block-width");
      const trechoCard = list.closest(".import-trecho");
      trechoCard?.style.removeProperty("--import-passenger-block-width");
      const labels = [...list.querySelectorAll(".import-passenger-row .row-label")];
      if (!labels.length) return;

      const measuredRows = labels
        .map((label) => {
          const title = label.querySelector(".row-title");
          if (!title) return null;
          const titleStyles = window.getComputedStyle(title);
          return {
            label,
            textWidth: measureImportedPassengerTextWidth(title.textContent || "", titleStyles),
            titleStyles
          };
        })
        .filter(Boolean);
      if (!measuredRows.length) return;

      const widestRow = measuredRows.reduce((widest, current) => (
        current.textWidth > widest.textWidth ? current : widest
      ), measuredRows[0]);
      const row = widestRow.label.closest(".import-passenger-row");
      const titleWrap = widestRow.label.querySelector(".row-title-wrap");
      const rowStyles = row ? window.getComputedStyle(row) : null;
      const labelStyles = window.getComputedStyle(widestRow.label);
      const titleWrapStyles = titleWrap ? window.getComputedStyle(titleWrap) : null;
      const listStyles = window.getComputedStyle(list);
      const measuredContentWidth = Math.ceil(
        widestRow.textWidth
        + horizontalBoxWidth(rowStyles)
        + horizontalBoxWidth(labelStyles)
        + horizontalBoxWidth(titleWrapStyles)
        + horizontalBoxWidth(widestRow.titleStyles)
        + horizontalBoxWidth(listStyles)
      );
      if (!Number.isFinite(measuredContentWidth) || measuredContentWidth <= 0) return;

      const blockWidth = Math.min(measuredContentWidth, IMPORT_PASSENGER_BLOCK_MAX_WIDTH);
      list.style.setProperty("--import-passenger-block-width", `${blockWidth}px`);
      list.style.setProperty("--import-passenger-name-width", `${Math.max(0, blockWidth)}px`);
      trechoCard?.style.setProperty("--import-passenger-block-width", `${blockWidth}px`);
    });
  }

  function horizontalBoxWidth(styles) {
    if (!styles) return 0;
    return cssPixelValue(styles.paddingLeft)
      + cssPixelValue(styles.paddingRight)
      + cssPixelValue(styles.borderLeftWidth)
      + cssPixelValue(styles.borderRightWidth);
  }

  function cssPixelValue(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function measureImportedPassengerTextWidth(text, styles) {
    const probe = document.createElement("span");
    probe.textContent = text || "";
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.whiteSpace = "nowrap";
    probe.style.pointerEvents = "none";
    probe.style.fontFamily = styles?.fontFamily || "inherit";
    probe.style.fontSize = styles?.fontSize || "13px";
    probe.style.fontWeight = styles?.fontWeight || "670";
    probe.style.letterSpacing = styles?.letterSpacing || "normal";
    document.body.appendChild(probe);
    const width = Math.ceil(probe.getBoundingClientRect().width);
    probe.remove();
    return width;
  }

  function buildPassengerRow(item) {
    const row = document.createElement("div");
    row.className = "passenger-row";
    row.dataset.rowKey = item.rowKey;
    row.dataset.ordem = String(item.ordem);

    const label = document.createElement("div");
    label.className = "row-label";
    const rowIndex = document.createElement("span");
    rowIndex.className = "row-index";
    rowIndex.textContent = String(item.ordem).padStart(2, "0");
    rowIndex.setAttribute("aria-hidden", "true");

    const titleWrap = document.createElement("span");
    titleWrap.className = "row-title-wrap";
    const rowTitle = document.createElement("button");
    rowTitle.type = "button";
    rowTitle.className = "row-title passenger-name-button";
    rowTitle.dataset.passengerAction = "open-record";
    rowTitle.textContent = "Passageiro sem seleção";

    const rowPreview = document.createElement("div");
    rowPreview.className = "passenger-preview";
    rowPreview.setAttribute("role", "status");
    rowPreview.setAttribute("aria-live", "polite");
    rowPreview.setAttribute("aria-hidden", "true");

    titleWrap.append(rowTitle, rowPreview);
    label.append(rowIndex, titleWrap);

    const addressField = document.createElement("label");
    addressField.className = "field address-cell";
    addressField.innerHTML = "<span>Endereço de saída</span>";
    const addressInput = document.createElement("textarea");
    addressInput.placeholder = "Endereço de saída";
    addressInput.rows = 2;
    addressInput.wrap = "soft";
    addressInput.className = "passenger-address";
    addressInput.dataset.passengerField = "address";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-row";
    remove.textContent = "X";
    remove.title = "Remover passageiro";
    remove.setAttribute("aria-label", "Remover passageiro");

    addressField.appendChild(addressInput);
    row.append(label, addressField, remove);
    return row;
  }

  function hydratePassengerRow(row, item, index = 0) {
    const label = row.querySelector(".row-label");
    const addressInput = row.querySelector(".passenger-address");
    const addressLabel = addressInput.closest("label");
    const remove = row.querySelector(".remove-row");
    const rowIndex = label.querySelector(".row-index");
    const rowTitle = label.querySelector(".row-title");
    const rowPreview = row.querySelector(".passenger-preview");
    const addressField = addressInput.closest(".field");
    const hasPassenger = !!item.passageiro && !!item.guid;

    row.dataset.rowKey = item.rowKey;
    row.dataset.ordem = String(item.ordem);
    row.style.setProperty("--row-index", String(index));
    const selectedName = item.passageiro?.label || "";
    if (hasPassenger) preloadPassengerPhoto(item.passageiro, "row-render");
    if (rowIndex) {
      rowIndex.textContent = String(item.ordem).padStart(2, "0");
    }
    if (rowTitle) {
      // Nome completo: com vários "TESTE"/"Ana" no cadastro, só o primeiro nome não identifica o passageiro.
      rowTitle.textContent = selectedName || "Selecionar passageiro";
      rowTitle.title = selectedName || (hasPassenger ? "Registro do passageiro" : "Selecione o passageiro pelo botão Adicionar");
      rowTitle.setAttribute(
        "aria-label",
        selectedName
          ? `Abrir registro: ${selectedName}`
          : "Selecione o passageiro pelo botão Adicionar"
      );
      rowTitle.disabled = false;
      rowTitle.setAttribute("aria-disabled", String(!hasPassenger));
      rowTitle.dataset.passengerId = item.guid || "";
      rowTitle.title = hasPassenger
        ? `Abrir registro: ${selectedName}`
        : "Selecione o passageiro pelo botão Adicionar";
    }
    renderPassengerPreview(rowPreview, item.passageiro || null);
    const addressLabelText = addressLabel.querySelector("span");
    if (addressLabelText) {
      addressLabelText.textContent = "Endereço de saída";
    }
    addressInput.value = getDraftAddress(item.ordem) || item.enderecoEditado || "";
    addressInput.disabled = state.enderecoPersonalizadoAtivo;
    if (addressField) {
      addressField.hidden = state.enderecoPersonalizadoAtivo;
    }
    remove.hidden = false;
    row.classList.remove("is-leave");
    row.classList.remove("is-enter");
    row.classList.toggle("is-shared-address", state.enderecoPersonalizadoAtivo);
    row.classList.toggle("is-incomplete", !item.passageiro);
  }

  function animatePassengerRowExit(row) {
    if (!row?.isConnected) return;
    const rect = row.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ghost = row.cloneNode(true);
    const sourceFields = row.querySelectorAll("input, textarea, select");
    const ghostFields = ghost.querySelectorAll("input, textarea, select");
    sourceFields.forEach((field, index) => {
      const ghostField = ghostFields[index];
      if (!ghostField) return;
      if ("value" in ghostField) ghostField.value = field.value;
      if ("checked" in ghostField) ghostField.checked = field.checked;
    });
    ghost.classList.remove("is-enter", "is-leave");
    ghost.style.position = "fixed";
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.margin = "0";
    ghost.style.boxSizing = "border-box";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "2147483646";
    document.body.appendChild(ghost);

    const animation = ghost.animate(
      [
        { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)", filter: "blur(0)" },
        { opacity: 0, transform: "translate3d(18px, -4px, 0) scale(0.985)", filter: "blur(1px)" }
      ],
      { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" }
    );
    animation.addEventListener("finish", () => ghost.remove(), { once: true });
    window.setTimeout(() => ghost.remove(), 320);
  }

  function animatePassengerRowReflow(previousRects, rows) {
    rows.forEach((row, index) => {
      if (!row?.isConnected || row.classList.contains("is-enter")) return;
      const previousRect = previousRects.get(row.dataset.rowKey);
      if (!previousRect) return;
      const nextRect = row.getBoundingClientRect();
      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

      row.animate(
        [
          { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
          { transform: "translate3d(0, 0, 0)" }
        ],
        {
          duration: 260,
          delay: Math.min(index, 3) * 18,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)"
        }
      );
    });
  }

  function handlePassengerRowAction(event) {
    const openRecord = event.target.closest("[data-passenger-action='open-record']");
    if (openRecord) {
      const row = openRecord.closest(".passenger-row");
      if (!row) return;
      suppressPassengerRowHover(row);
      const ordem = Number(row.dataset.ordem);
      if (Number.isNaN(ordem)) return;
      const item = state.selectedPassengers.find((selected) => selected.ordem === ordem);
      if (!item || !item.passageiro) {
        openPassengerPicker(ordem);
        return;
      }
      openPassengerEdit(item.passageiro);
      return;
    }

    const remove = event.target.closest(".remove-row");
    if (!remove) return;
    const row = remove.closest(".passenger-row");
    if (!row) return;
    const ordem = Number(row.dataset.ordem);
    if (Number.isNaN(ordem)) return;
    removePassengerRow(ordem, row);
  }

  function handlePassengerRowPointerDown(event) {
    const openRecord = event.target.closest("[data-passenger-action='open-record']");
    if (!openRecord) return;
    const row = openRecord.closest(".passenger-row");
    if (!row) return;
    suppressPassengerRowHover(row);
  }

  function handlePassengerRowInput(event) {
    const input = event.target.closest("[data-passenger-field='address']");
    if (!input) return;
    const row = input.closest(".passenger-row");
    if (!row) return;
    const ordem = Number(row.dataset.ordem);
    if (Number.isNaN(ordem)) return;
    setDraftAddress(ordem, input.value);
  }

  function handlePassengerPreviewEnter(event) {
    if (isMobilePassengerPreviewDisabled()) return;
    const wrap = event.target.closest(".row-title-wrap");
    if (!isPassengerPreviewHost(wrap)) return;
    if (event.relatedTarget && wrap.contains(event.relatedTarget)) return;
    clearPassengerPreviewCloseTimer();
    openPassengerPreview(wrap);
  }

  function handlePassengerPreviewLeave(event) {
    const wrap = event.target.closest(".row-title-wrap");
    if (!isPassengerPreviewHost(wrap)) return;
    if (event.relatedTarget && wrap.contains(event.relatedTarget)) return;
    if (activePassengerPreview?.portal.contains(event.relatedTarget)) return;
    schedulePassengerPreviewClose(wrap);
  }

  function handlePassengerPreviewFocusIn(event) {
    if (isMobilePassengerPreviewDisabled()) return;
    const wrap = event.target.closest(".row-title-wrap");
    if (!isPassengerPreviewHost(wrap)) return;
    openPassengerPreview(wrap);
  }

  function handlePassengerPreviewFocusOut(event) {
    const wrap = event.target.closest(".row-title-wrap");
    if (!isPassengerPreviewHost(wrap)) return;
    window.setTimeout(() => {
      if (!wrap.contains(document.activeElement)) {
        closePassengerPreview(wrap);
      }
    }, 0);
  }

  function isPassengerPreviewHost(wrap) {
    if (!wrap) return false;
    const host = wrap.closest(".passenger-rows, .import-passengers");
    if (!host) return false;
    return host === el.passengerRows || !!el.importReviewPrograms?.contains(host);
  }

  function ensurePassengerPreviewPortal() {
    let portal = document.getElementById("passengerPreviewPortal");
    if (portal) return portal;
    portal = document.createElement("div");
    portal.id = "passengerPreviewPortal";
    portal.className = "passenger-preview passenger-preview-floating";
    portal.setAttribute("role", "status");
    portal.setAttribute("aria-live", "polite");
    portal.setAttribute("aria-hidden", "true");
    portal?.addEventListener("pointerenter", clearPassengerPreviewCloseTimer);
    portal?.addEventListener("pointerleave", () => schedulePassengerPreviewClose());
    portal?.addEventListener("click", async (event) => {
      const photoButton = event.target.closest("[data-passenger-preview-photo]");
      if (photoButton) {
        const data = passengerPhotoViewerDataFromElement(photoButton);
        if (data) {
          closePassengerPreview();
          openPassengerPhotoViewer(data);
        }
        return;
      }
      const valueEl = event.target.closest(".passenger-preview-value");
      if (!valueEl) return;
      const value = valueEl.dataset.copyValue || valueEl.textContent || "";
      try {
        await copyTextToClipboard(value);
        showCopyNotice(valueEl, "Copiado!");
      } catch (error) {
        showCopyNotice(valueEl, "Falha ao copiar.", true);
      }
    });
    portal?.addEventListener("pointerover", (event) => {
      const photoButton = event.target.closest("[data-passenger-preview-photo]");
      if (!photoButton) return;
      const data = passengerPhotoViewerDataFromElement(photoButton);
      if (data) openPassengerPhotoHoverZoom(photoButton, data);
    });
    portal?.addEventListener("pointerout", (event) => {
      const photoButton = event.target.closest("[data-passenger-preview-photo]");
      if (!photoButton || photoButton.contains(event.relatedTarget)) return;
      closePassengerPhotoHoverZoom();
    });
    document.body.appendChild(portal);
    return portal;
  }

  function openPassengerPreview(wrap) {
    if (isMobilePassengerPreviewDisabled()) return;
    const source = wrap.querySelector(".passenger-preview");
    const anchor = wrap.querySelector(".row-title") || wrap;
    if (anchor.disabled) return;
    if (!source || !source.childNodes.length) return;
    const portal = ensurePassengerPreviewPortal();
    closeAllCustomSelects();
    document.body.appendChild(portal);
    portal.replaceChildren(...Array.from(source.childNodes).map((node) => node.cloneNode(true)));
    portal.classList.toggle("is-comparison", !!portal.querySelector(".passenger-compare-grid"));
    portal.classList.add("is-open");
    portal.setAttribute("aria-hidden", "false");
    activePassengerPreview = { wrap, anchor, portal };
    updatePassengerPreviewPosition();
  }

  function closePassengerPreview(wrap = null) {
    if (!activePassengerPreview) return;
    if (wrap && activePassengerPreview.wrap !== wrap) return;
    clearPassengerPreviewCloseTimer();
    clearCopyNotice();
    activePassengerPreview.portal.classList.remove("is-open");
    activePassengerPreview.portal.setAttribute("aria-hidden", "true");
    activePassengerPreview = null;
  }

  function schedulePassengerPreviewClose(wrap = null) {
    clearPassengerPreviewCloseTimer();
    passengerPreviewCloseTimer = window.setTimeout(() => {
      closePassengerPreview(wrap);
    }, 120);
  }

  function clearPassengerPreviewCloseTimer() {
    if (!passengerPreviewCloseTimer) return;
    window.clearTimeout(passengerPreviewCloseTimer);
    passengerPreviewCloseTimer = null;
  }

  function suppressPassengerRowHover(row) {
    if (!row) return;
    closePassengerPreview(row.querySelector(".row-title-wrap"));
    row.classList.add("is-opening-record");
    const currentTimer = passengerRowHoverSuppressTimers.get(row);
    if (currentTimer) {
      window.clearTimeout(currentTimer);
    }
    const release = () => {
      const activeTimer = passengerRowHoverSuppressTimers.get(row);
      if (activeTimer) {
        window.clearTimeout(activeTimer);
      }
      passengerRowHoverSuppressTimers.delete(row);
      row.classList.remove("is-opening-record");
      row.removeEventListener("pointerleave", release);
      row.removeEventListener("pointercancel", release);
    };
    row.addEventListener("pointerleave", release, { once: true });
    row.addEventListener("pointercancel", release, { once: true });
    const timer = window.setTimeout(release, 600);
    passengerRowHoverSuppressTimers.set(row, timer);
  }

  function repositionPassengerPreview() {
    if (isMobilePassengerPreviewDisabled()) {
      closePassengerPreview();
      return;
    }
    if (!activePassengerPreview || passengerPreviewPositionRaf) return;
    passengerPreviewPositionRaf = requestAnimationFrame(() => {
      passengerPreviewPositionRaf = null;
      updatePassengerPreviewPosition();
    });
  }

  function updatePassengerPreviewPosition() {
    if (!activePassengerPreview) return;
    const { anchor, portal } = activePassengerPreview;
    if (!anchor.isConnected) {
      closePassengerPreview();
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const viewport = currentViewportMetrics();
    const viewportWidth = viewport.width;
    const viewportHeight = viewport.height;
    const viewportTop = viewport.offsetTop;
    const viewportLeft = viewport.offsetLeft;
    const viewportBottom = viewportTop + viewportHeight;
    const viewportRight = viewportLeft + viewportWidth;
    const gap = 8;
    const safeGap = 10;
    const preferredWidth = portal.classList.contains("is-comparison") ? 560 : 360;
    const width = Math.min(preferredWidth, Math.max(280, viewportWidth - safeGap * 2));
    const height = Math.min(portal.scrollHeight || 120, viewportHeight - safeGap * 2);
    const spaceBelow = viewportBottom - rect.bottom;
    const spaceAbove = rect.top - viewportTop;
    const showAbove = spaceBelow < gap + height && spaceAbove > spaceBelow;
    const top = showAbove
      ? Math.max(viewportTop + safeGap, rect.top - height - gap)
      : Math.min(viewportBottom - height - safeGap, rect.bottom + gap);
    const left = Math.max(viewportLeft + safeGap, Math.min(rect.left, viewportRight - width - safeGap));

    portal.style.width = `${width}px`;
    portal.style.left = `${left}px`;
    portal.style.top = `${Math.max(viewportTop + safeGap, top)}px`;
  }

  function renderPassengerPreview(container, passenger) {
    if (!container) return;
    container.replaceChildren();
    if (!passenger) {
      const empty = document.createElement("p");
      empty.className = "passenger-preview-empty";
      empty.textContent = "Sem informações disponíveis.";
      container.appendChild(empty);
      return;
    }
    const previewValue = (value, optionsKey) => {
      const raw = (value || "").toString().trim();
      if (!raw) return "";
      return optionsKey ? optionLabel(optionsKey, raw) || raw : raw;
    };
    const hasPhotoHeader = !!normalizePassengerPhotoUrl(passenger?.fotoUrl);
    const rows = [
      ["Nome", passenger.label],
      ["Telefone", passenger.telefone],
      ["Email", passenger.email],
      ["Cliente", passenger.clienteLabel],
      ["Cargo", previewValue(passenger.cargo, "bdCargo")],
      ["Dpto", passenger.departamento],
      ["CR", passenger.cr],
      ["Origem", passenger.origem],
      ["Destino", passenger.destino],
      ["Status", passenger.importStatus],
      ["Preferências", passenger.preferencias],
      ["Tipo de veículo", passenger.tipoVeiculoLabel || previewValue(passenger.tipoVeiculo, "bdTipoVeiculo")],
      ["Endereço", passenger.endereco],
      ["Idioma", previewValue(passenger.idioma, "bdIdioma")],
      ["Sexo", previewValue(passenger.sexo, "bdSexo")],
      ["Classificação", previewValue(passenger.classificacao, "bdClassificacao")]
    ].filter(([label, value]) => {
      if (hasPhotoHeader && (label === "Nome" || label === "Cliente")) return false;
      return (value || "").toString().trim();
    });
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "passenger-preview-empty";
      empty.textContent = "Sem informações adicionais.";
      const photoHeader = buildPassengerPreviewPhotoHeader(passenger);
      if (photoHeader) container.appendChild(photoHeader);
      container.appendChild(empty);
      return;
    }
    const list = document.createElement("div");
    list.className = "passenger-preview-list";
    const photoHeader = buildPassengerPreviewPhotoHeader(passenger);
    if (photoHeader) container.appendChild(photoHeader);
    rows.forEach(([label, value]) => {
      const line = document.createElement("div");
      line.className = "passenger-preview-line";
      const key = document.createElement("span");
      key.className = "passenger-preview-key";
      key.textContent = label;
      const valueEl = document.createElement("button");
      valueEl.type = "button";
      valueEl.className = "passenger-preview-value";
      valueEl.textContent = value;
      valueEl.dataset.copyValue = value;
      valueEl.title = `Copiar ${label}`;
      valueEl.setAttribute("aria-label", `Copiar ${label}`);
      valueEl.addEventListener("click", async (event) => {
        try {
          await copyTextToClipboard(value);
          showCopyNotice(event.currentTarget, "Copiado!");
        } catch (error) {
          showCopyNotice(event.currentTarget, "Falha ao copiar.", true);
        }
      });
      line.append(key, valueEl);
      list.appendChild(line);
    });
    container.appendChild(list);
  }

  function buildPassengerPreviewPhotoHeader(passenger) {
    if (!normalizePassengerPhotoUrl(passenger?.fotoUrl)) return null;
    const data = photoViewerDataFromPassenger(passenger);
    if (!data?.src) return null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "passenger-preview-photo-header";
    button.dataset.passengerPreviewPhoto = "true";
    hydratePassengerPhotoViewerDataset(button, data);
    button.title = "Ver foto";
    button.setAttribute("aria-label", "Ver foto do passageiro");
    const avatar = document.createElement("span");
    avatar.className = "passenger-preview-photo-avatar";
    const initial = document.createElement("span");
    initial.className = "passenger-preview-photo-initial";
    initial.setAttribute("aria-hidden", "true");
    initial.textContent = (String(data.passengerName || "").trim().charAt(0) || "?").toUpperCase();
    const img = document.createElement("img");
    img.alt = `Foto de ${data.passengerName || "passageiro"}`;
    hydratePassengerPhotoImageElement(img, data, "header");
    avatar.append(initial, img);
    const text = document.createElement("span");
    text.className = "passenger-preview-photo-text";
    const name = document.createElement("strong");
    name.textContent = data.passengerName || "Passageiro";
    const client = document.createElement("small");
    client.textContent = data.clientName || "Cliente não informado";
    text.append(name, client);
    button.append(avatar, text);
    return button;
  }

  function renderImportedPassengerComparisonPreview(container, passenger, existing) {
    if (!container) return;
    container.replaceChildren();
    const importClient = getImportClient();
    const rows = [
      ["Nome", normalizePassengerDisplayName(passenger.nome || passenger.passageiroLabel) || "", normalizePassengerDisplayName(existing?.label) || ""],
      ["Telefone", formatPhoneNumber(passenger.telefone || ""), formatPhoneNumber(existing?.telefone || "")],
      ["Email", passenger.email || "", existing?.email || ""],
      ["Cliente", importClient?.label || CONFIG.importDefaults.clienteLabel || "", existing?.clienteLabel || ""]
    ].filter(([, importedValue, registeredValue]) => [importedValue, registeredValue].some((value) => (value || "").toString().trim()));

    const shell = document.createElement("section");
    shell.className = "passenger-simple-compare";

    rows.forEach(([label, importedValue, registeredValue]) => {
      const state = passengerCompareState(importedValue, registeredValue);
      const row = document.createElement("div");
      row.className = `passenger-simple-compare-row is-${state.tone}`;
      const main = document.createElement("div");
      main.className = "passenger-simple-compare-main";
      const field = document.createElement("strong");
      field.textContent = label;
      const result = document.createElement("span");
      result.className = `passenger-simple-compare-result is-${state.tone}`;
      result.textContent = state.label;
      main.append(field, result);

      const values = document.createElement("div");
      values.className = "passenger-simple-compare-values";
      if (state.tone === "same") {
        values.appendChild(buildPassengerCompareValue(importedValue || registeredValue || "Vazio", state.tone, ""));
      } else {
        values.append(
          buildPassengerCompareValue(importedValue || "Vazio", state.tone, "XLSX"),
          buildPassengerCompareValue(registeredValue || "Vazio", state.tone, "BD")
        );
      }
      row.append(main, values);
      shell.appendChild(row);
    });

    container.appendChild(shell);
  }

  function passengerCompareState(left, right) {
    const leftValue = String(left || "").trim();
    const rightValue = String(right || "").trim();
    if (!leftValue && !rightValue) return { tone: "empty", label: "Vazio nos dois" };
    if (!leftValue) return { tone: "missing-left", label: "Sem dado no XLSX" };
    if (!rightValue) return { tone: "missing-right", label: "Ausente no cadastro" };
    if (normalize(leftValue) === normalize(rightValue)) return { tone: "same", label: "Igual" };
    return { tone: "different", label: "Diferente" };
  }

  function buildPassengerCompareValue(value, tone, sourceLabel = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `passenger-preview-value passenger-simple-compare-value is-${tone}`;
    if (sourceLabel) {
      const source = document.createElement("span");
      source.className = "passenger-simple-compare-source";
      source.textContent = sourceLabel;
      const text = document.createElement("b");
      text.textContent = value;
      button.append(source, text);
    } else {
      button.textContent = value;
    }
    button.dataset.copyValue = value;
    button.title = "Copiar valor";
    button.setAttribute("aria-label", "Copiar valor");
    button.addEventListener("click", async (event) => {
      try {
        await copyTextToClipboard(value);
        showCopyNotice(event.currentTarget, "Copiado!");
      } catch (error) {
        showCopyNotice(event.currentTarget, "Falha ao copiar.", true);
      }
    });
    return button;
  }

  function buildImportedPassengerSourceCard(passenger) {
    const importClient = getImportClient();
    const card = document.createElement("section");
    card.className = "passenger-match-imported";
    const source = document.createElement("span");
    source.className = "passenger-match-imported-source";
    source.textContent = "Veio do XLSX";
    const name = document.createElement("strong");
    name.textContent = normalizePassengerDisplayName(passenger.nome || passenger.passageiroLabel) || "Passageiro sem nome";
    const meta = document.createElement("span");
    meta.textContent = [
      formatPhoneNumber(passenger.telefone || ""),
      passenger.email || "",
      importClient?.label || CONFIG.importDefaults.clienteLabel || ""
    ].filter(Boolean).join(" | ") || "Sem contato no XLSX";
    card.append(source, name, meta);
    return card;
  }

  function renderTabBadges() {
    syncActivationSwitchLabels();
    el.tabImport?.classList.toggle("is-marked", !!state.importReview);
    renderActivationTabBadge(el.tabReturn, {
      label: "Retorno",
      active: !!el.agendarRetorno.checked,
      pending: hasInactiveReturnDraft()
    });
    renderActivationTabBadge(el.tabRepeat, {
      label: "Repetir",
      active: !!el.repetirServico.checked,
      pending: hasInactiveRepeatDraft()
    });
  }

  function syncActivationSwitchLabels() {
    syncActivationSwitchLabel(el.agendarRetorno);
    syncActivationSwitchLabel(el.repetirServico);
  }

  function syncActivationSwitchLabel(input) {
    const label = input?.closest?.(".activation-switch");
    const text = label?.querySelector?.("span");
    if (!text) return;
    text.textContent = input.checked ? "Ativado" : "Desativado";
  }

  function renderActivationTabBadge(tab, options) {
    if (!tab) return;
    const active = !!options.active;
    const pending = !active && !!options.pending;
    tab.classList.toggle("is-marked", active);
    tab.classList.toggle("is-pending", pending);
    const suffix = active ? " ativo" : (pending ? " com dados não ativados" : "");
    tab.setAttribute("aria-label", `${options.label}${suffix}`);
    tab.title = pending ? `${options.label}: dados preenchidos sem ativar` : options.label;
  }

  function handleOperationalInput(event) {
    if (state.draftRestoring) return;
    const target = event.target;
    if (isImportReviewInteractionTarget(target)) return;
    if (target?.classList?.contains("custom-select-search")) return;
    if (target === el.passengerPickerSearch) return;
    if (target?.closest?.("#passengerEditOverlay")) return;

    clearFieldValidation(target);
    scheduleValidationRefresh();
    captureObsState({
      includeDerivedPassengerPreferences: !(event.type === "input" && isTextEditingTarget(target))
    });
    markActivationDraftEdited(target);
    if (target === el.motorista || target === el.saidaData || target === el.saidaHora || target === el.saidaMinuto) {
      renderMotoristaVehicleHint();
    }
    renderTabBadges();
    renderRiskPanel();
    markDraftDirty({ touchCommon: !isActivationGuardField(target) });
    if (event.type !== "input" || !isTextEditingTarget(target)) {
      commitGlobalHistoryChange(globalHistoryLabelFromTarget(target));
    }
  }

  function isImportReviewInteractionTarget(target) {
    if (!target?.closest) return false;
    return !!target.closest("#importReviewPrograms, #importReviewStats");
  }

  function markActivationDraftEdited(target) {
    if (!target || target === el.agendarRetorno || target === el.repetirServico) return;
    if (isReturnActivationField(target)) state.activationDraftEditState.return = true;
    if (isRepeatActivationField(target)) state.activationDraftEditState.repeat = true;
  }

  function isActivationGuardField(target) {
    return (
      target === el.agendarRetorno ||
      target === el.repetirServico ||
      isReturnActivationField(target) ||
      isRepeatActivationField(target)
    );
  }

  function isReturnActivationField(target) {
    return (
      target === el.retornoData ||
      target === el.retornoHora ||
      target === el.retornoMinuto ||
      target === el.retornoEndereco ||
      target === el.retornoDestino ||
      target === el.retornoObservacao ||
      target?.closest?.("#tab-panel-return")
    );
  }

  function isRepeatActivationField(target) {
    return (
      target === el.frequenteInicio ||
      target === el.frequenteFim ||
      target === el.frequenteTipo ||
      target === el.contabilizarFds ||
      target?.closest?.("#tab-panel-repeat")
    );
  }

  function hasInactiveReturnDraft() {
    return state.isNew && !el.agendarRetorno.checked && state.activationDraftEditState.return && hasReturnDraftContent();
  }

  function hasInactiveRepeatDraft() {
    return state.isNew && !el.repetirServico.checked && state.activationDraftEditState.repeat && hasRepeatDraftContent();
  }

  function hasReturnDraftContent() {
    return [
      el.retornoData?.value,
      el.retornoEndereco?.value,
      el.retornoDestino?.value,
      el.retornoObservacao?.value,
      ...Object.values(state.obsRet || {})
    ].some((value) => String(value || "").trim());
  }

  function hasRepeatDraftContent() {
    return [
      el.frequenteInicio?.value,
      el.frequenteFim?.value,
      el.frequenteTipo?.value
    ].some((value) => String(value || "").trim()) || el.contabilizarFds.checked === false;
  }

  function renderRiskPanel() {
  }

  function collectOperationalRisks(context = buildSaveContext()) {
    const risks = [];
    const statusLabel = optionLabel("statusOperacao", el.statusOperacao.value);
    const isTroca = statusLabel === "Troca de Veículos";

    if (!el.cliente.value) risks.push("Cliente vazio.");
    if (!el.solicitante.value) risks.push("Solicitante vazio.");
    if (!el.motorista.value) risks.push("Motorista vazio. A operação precisará programar manualmente.");
    if (!context.dataHoraPrincipal) risks.push("Data e horário de saída incompletos.");
    if (!context.trajeto && !isTroca) risks.push("Trajeto vazio.");
    if (!el.destino.value.trim() && !isTroca) risks.push("Destino vazio.");
    if (!context.colOrdemPassageiros.length && !isTroca) risks.push("Nenhum passageiro selecionado.");
    if (hasDuplicatePassengers()) risks.push("Passageiro duplicado na lista.");
    if (state.enderecoPersonalizadoAtivo && !el.enderecoPersonalizado.value.trim() && !isTroca) risks.push("Endereço único ativo, mas vazio.");
    if (!state.enderecoPersonalizadoAtivo && context.colOrdemPassageiros.some((item) => !item.enderecoSaidaBD) && !isTroca) risks.push("Há passageiro sem endereço de saída.");
    if (el.agendarRetorno.checked && !context.dataHoraRetorno) risks.push("Retorno ativo sem data/hora completa.");
    if (el.agendarRetorno.checked && context.dataHoraRetorno && context.dataHoraPrincipal && context.dataHoraRetorno < context.dataHoraPrincipal) risks.push("Data de retorno anterior à saída.");
    if (el.repetirServico.checked && (!el.frequenteInicio.value || !el.frequenteFim.value)) risks.push("Serviço frequente ativo sem período completo.");
    if (el.repetirServico.checked && datesAreInverted(el.frequenteInicio.value, el.frequenteFim.value)) risks.push("Período frequente com data final anterior à inicial.");
    if (el.repetirServico.checked) {
      const frequentPeriodError = validateFrequentServicePeriod();
      if (frequentPeriodError) risks.push(frequentPeriodError);
    }

    return risks;
  }

  function renderSaveLog() {
  }

  function clearSaveLog() {
    state.saveLog = [];
    renderSaveLog();
  }

  function addSaveLog(type, title, detail) {
    state.saveLog.push({
      type,
      title,
      detail,
      at: new Date().toISOString()
    });
    renderSaveLog();
  }

  function openReviewBeforeSave(context) {
    return performSave();
  }

  function closeReviewOverlay(clearContext) {
    if (clearContext) state.pendingSaveContext = null;
  }

  function renderReviewSummary(context) {
    if (!el.reviewSummaryList) return;
    const rows = [
      ["Status", optionLabel("statusOperacao", el.statusOperacao.value) || "Não informado"],
      ["Saída", context.dataHoraPrincipal ? formatDateTime(context.dataHoraPrincipal) : "Não informado"],
      ["Cliente", selectedText(el.cliente) || "Não informado"],
      ["Solicitante", selectedText(el.solicitante) || "Não informado"],
      ["Motorista", selectedText(el.motorista) || "Não informado"],
      ["Trajeto", context.trajeto || "Não informado"],
      ["Destino", el.destino.value.trim() || "Não informado"],
      ["Passageiros", String(context.colOrdemPassageiros.length)],
      ["Retorno", el.agendarRetorno.checked ? "Sim" : "Não"],
      ["Frequente", el.repetirServico.checked ? "Sim" : "Não"]
    ];

    el.reviewSummaryList.innerHTML = "";
    rows.forEach(([label, value]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      el.reviewSummaryList.append(term, description);
    });
  }

  function renderReviewRisks(context) {
    if (!el.reviewRiskList) return;
    const risks = collectOperationalRisks(context);
    el.reviewRiskList.innerHTML = "";

    if (!risks.length) {
      const item = document.createElement("li");
      item.textContent = "Sem risco operacional crítico detectado.";
      el.reviewRiskList.appendChild(item);
      return;
    }

    risks.forEach((risk) => {
      const item = document.createElement("li");
      item.textContent = risk;
      el.reviewRiskList.appendChild(item);
    });
  }

  function markDraftDirty(options = {}) {
    if (state.draftRestoring) return;
    const config = {
      touchCommon: true,
      ...options
    };
    if (config.touchCommon) state.draftCommonEdited = true;
    if (state.draftTimer) window.clearTimeout(state.draftTimer);
    renderDraftStatus("Salvando dados locais...");
    state.draftTimer = window.setTimeout(() => {
      state.draftTimer = null;
      saveDraftSnapshot();
    }, 400);
    if (state.currentTab === "import") renderImportReview();
  }

  function saveDraftSnapshot() {
    if (state.draftRestoring) return;
    try {
      captureObsState();
      const snapshot = createDraftSnapshot();
      window.localStorage.setItem(DRAFT_STORE_KEY, JSON.stringify(snapshot));
      state.lastDraftSavedAt = snapshot.updatedAt;
      renderDraftStatus();
    } catch (error) {
      console.warn("Falha ao salvar dados locais", error);
      renderDraftStatus("Dados locais não salvos.");
    }
  }

  function cloneGlobalHistoryValue(value) {
    return JSON.parse(JSON.stringify(value ?? null));
  }

  function importReviewRowCount(review) {
    if (typeof review?.rowsCount === "number" && Number.isFinite(review.rowsCount)) {
      return Math.max(0, review.rowsCount);
    }
    return Array.isArray(review?.rows) ? review.rows.length : 0;
  }

  function cloneImportReviewForGlobalHistory(review) {
    if (!review) return null;
    return {
      fileName: review.fileName || "",
      rowsCount: importReviewRowCount(review),
      programs: cloneGlobalHistoryValue(review.programs || []),
      selectedProgramacao: review.selectedProgramacao || "",
      selectedTrechoKey: review.selectedTrechoKey || "",
      editingTrechoKey: review.editingTrechoKey || "",
      createdAt: review.createdAt || "",
      history: { undo: [], redo: [] }
    };
  }

  function createGlobalHistorySnapshot(options = {}) {
    captureObsState({
      includeDerivedPassengerPreferences: options.includeDerivedPassengerPreferences !== false
    });
    const draft = createDraftSnapshot();
    draft.updatedAt = "";
    const importReview = cloneImportReviewForGlobalHistory(state.importReview);
    return {
      draft,
      importReview,
      importReviewFilter: normalizeImportReviewFilter(state.importReviewFilter),
      currentTab: state.currentTab
    };
  }

  function areGlobalHistorySnapshotsEqual(a, b) {
    return JSON.stringify(a || null) === JSON.stringify(b || null);
  }

  function globalHistoryCanTrack() {
    return !state.draftRestoring && !isRestoringGlobalHistory && !state.loading;
  }

  function shouldTrackGlobalHistoryTarget(target) {
    if (!target) return false;
    if (target.closest?.("#loadingOverlay, #successOverlay, #passengerPickerOverlay, #activationGuardOverlay, #clearAllFormsOverlay")) return false;
    if (isImportReviewInteractionTarget(target)) return false;
    if (target.closest?.(".custom-select-search")) return false;
    if (target === el.passengerPickerSearch) return false;
    if (target.closest?.("#passengerEditOverlay") && !activeImportedPassengerEditRef) return false;
    return !!target.closest?.(
      "input, textarea, select, button, [data-passenger-action], [data-import-action], [data-import-filter], [data-schedule-action], [data-obs], [data-ret-obs], .custom-select-option"
    );
  }

  function captureGlobalHistoryBeforeMutation(label = "Alteração", options = {}) {
    if (!globalHistoryCanTrack()) return;
    state.globalHistory.pending = {
      label,
      snapshot: createGlobalHistorySnapshot(options)
    };
  }

  function handleGlobalHistoryBeforeChange(event) {
    if (!globalHistoryCanTrack()) return;
    const target = event.target;
    if (!shouldTrackGlobalHistoryTarget(target)) return;
    const isTextTarget = isTextEditingTarget(target);
    if (event.type === "pointerdown" && isTextTarget) return;
    if (event.type === "keydown") {
      if (!isGlobalHistoryMutationKey(event) || !isTextTarget) return;
      if (state.globalHistory.pending?.textTarget === target) return;
    }
    if (event.type === "focusin" && !isTextTarget) return;
    captureGlobalHistoryBeforeMutation(
      globalHistoryLabelFromTarget(target),
      isTextTarget ? { includeDerivedPassengerPreferences: false } : {}
    );
    if (isTextTarget) state.globalHistory.pending.textTarget = target;
  }

  function isGlobalHistoryMutationKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    const key = String(event.key || "");
    if (key.length === 1) return true;
    return ["Backspace", "Delete", "Enter", " ", "Spacebar"].includes(key);
  }

  function globalHistoryLabelFromTarget(target) {
    if (target?.closest?.("[data-import-action], [data-import-field], [data-import-passenger-field]")) return "Alterar importação";
    if (target?.closest?.("[data-passenger-action], [data-passenger-field]")) return "Alterar passageiro";
    if (target?.closest?.("[data-schedule-action], [data-schedule-field]")) return "Alterar agendamento";
    if (target?.closest?.("[data-obs]")) return "Trocar observação";
    if (target?.closest?.("[data-ret-obs]")) return "Trocar observação do retorno";
    if (target?.id === "globalImportHistoryActions" || target?.closest?.("#globalImportHistoryActions")) return "";
    const label = target?.closest?.("label")?.querySelector?.("span, legend")?.textContent?.trim();
    return label ? `Editar ${label}` : "Alteração";
  }

  function commitGlobalHistoryChange(label = "") {
    if (state.draftRestoring || isRestoringGlobalHistory) return;
    const pending = state.globalHistory.pending;
    if (!pending?.snapshot) return;
    const current = createGlobalHistorySnapshot();
    if (areGlobalHistorySnapshotsEqual(pending.snapshot, current)) {
      state.globalHistory.pending = null;
      return;
    }
    const undo = state.globalHistory.undo;
    const last = undo[undo.length - 1]?.snapshot;
    if (!areGlobalHistorySnapshotsEqual(last, pending.snapshot)) {
      undo.push({ label: label || pending.label || "Alteração", snapshot: pending.snapshot });
      if (undo.length > GLOBAL_HISTORY_LIMIT) undo.shift();
    }
    state.globalHistory.redo = [];
    state.globalHistory.pending = null;
    renderGlobalImportHistoryControls();
  }

  async function restoreGlobalHistorySnapshot(snapshot) {
    if (!snapshot?.draft) return;
    isRestoringGlobalHistory = true;
    state.draftRestoring = true;
    try {
      closePassengerPicker();
      closePassengerEditPopup();
      closeImportedPassengerPopupWithoutSave();
      closeAllCustomSelects();
      await applyDraftSnapshotToForm(snapshot.draft, { restoreTab: false });
      state.importReview = cloneGlobalHistoryValue(snapshot.importReview);
      state.importReviewFilter = normalizeImportReviewFilter(snapshot.importReviewFilter);
      renderScheduleDrafts();
      renderPassengers();
      renderTabBadges();
      renderRiskPanel();
      renderImportReview();
      setTab(state.isNew ? (snapshot.currentTab || snapshot.draft.currentTab || "details") : "details");
      renderGlobalImportHistoryControls();
    } finally {
      state.draftRestoring = false;
      isRestoringGlobalHistory = false;
      saveDraftSnapshot();
    }
  }

  async function undoGlobalHistoryChange() {
    const history = state.globalHistory;
    if (!history.undo.length) {
      toast("Nada para desfazer.", "warning", 2500);
      return false;
    }
    const current = createGlobalHistorySnapshot();
    const previous = history.undo.pop();
    history.redo.push({ label: previous.label, snapshot: current });
    await restoreGlobalHistorySnapshot(previous.snapshot);
    toast(`Desfeito: ${previous.label || "alteração"}.`, "success", 2600);
    return true;
  }

  async function redoGlobalHistoryChange() {
    const history = state.globalHistory;
    if (!history.redo.length) {
      toast("Nada para refazer.", "warning", 2500);
      return false;
    }
    const current = createGlobalHistorySnapshot();
    const next = history.redo.pop();
    history.undo.push({ label: next.label, snapshot: current });
    if (history.undo.length > GLOBAL_HISTORY_LIMIT) history.undo.shift();
    await restoreGlobalHistorySnapshot(next.snapshot);
    toast(`Refeito: ${next.label || "alteração"}.`, "success", 2600);
    return true;
  }

  function createDraftSnapshot() {
    syncAllDateTimeInputs();
    return {
      version: 1,
      recordId: state.recordId || "",
      updatedAt: new Date().toISOString(),
      currentTab: state.currentTab,
      obsAtual: state.obsAtual,
      retObsAtual: state.retObsAtual,
      enderecoPersonalizadoAtivo: state.enderecoPersonalizadoAtivo,
      activationDraftEditState: { ...state.activationDraftEditState },
      fields: {
        statusOperacao: el.statusOperacao.value,
        statusFaturamento: el.statusFaturamento.value,
        saidaData: el.saidaData.value,
        saidaHora: el.saidaHora.value,
        saidaMinuto: el.saidaMinuto.value,
        retPrevDateTime: el.retPrevDateTime?.value || "",
        retPrevHora: el.retPrevHora.value,
        retPrevMinuto: el.retPrevMinuto.value,
        cliente: el.cliente.value,
        solicitante: el.solicitante.value,
        tipoServico: el.tipoServico.value,
        tipoVeiculo: el.tipoVeiculo.value,
        motorista: el.motorista.value,
        veiculo: el.veiculo.value,
        vehicleOriginManual: state.vehicleOriginManual,
        trajeto: el.trajeto.value,
        observacao: el.observacao.value,
        receber: el.receber.checked,
        cotacao: el.cotacao.value,
        valorReceber: el.valorReceber.value,
        op: el.op.value,
        formaPagamento: el.formaPagamento.value,
        cr: el.cr.value,
        enderecoPersonalizado: el.enderecoPersonalizado.value,
        destino: el.destino.value,
        agendarRetorno: el.agendarRetorno.checked,
        receberRetorno: !!el.receberRetorno?.checked,
        retornoData: el.retornoData.value,
        retornoHora: el.retornoHora.value,
        retornoMinuto: el.retornoMinuto.value,
        retornoEndereco: el.retornoEndereco.value,
        retornoDestino: el.retornoDestino.value,
        retornoObservacao: el.retornoObservacao.value,
        repetirServico: el.repetirServico.checked,
        frequenteInicio: el.frequenteInicio.value,
        frequenteFim: el.frequenteFim.value,
        frequenteTipo: el.frequenteTipo.value,
        contabilizarFds: el.contabilizarFds.checked
      },
      obs: { ...state.obs },
      obsRet: { ...state.obsRet },
      selectedPassengers: state.selectedPassengers.map((item) => ({
        ordem: item.ordem,
        guid: item.guid,
        telefone: item.telefone,
        enderecoEditado: item.enderecoEditado
      })),
      enderecoRascunho: state.enderecoRascunho.map((item) => ({ ...item })),
      scheduleDrafts: []
    };
  }

  async function restoreDraftSnapshot() {
    const snapshot = readDraftSnapshot();
    if (!snapshot) {
      state.draftCommonEdited = false;
      state.activationDraftEditState = { return: false, repeat: false };
      state.importDraftEditState = { common: false, retorno: false };
      renderDraftStatus();
      return;
    }
    if ((snapshot.recordId || "") !== (state.recordId || "")) {
      state.draftCommonEdited = false;
      state.activationDraftEditState = { return: false, repeat: false };
      state.importDraftEditState = { common: false, retorno: false };
      renderDraftStatus();
      return;
    }

    state.draftRestoring = true;
    try {
      await ensurePassengersByIds((snapshot.selectedPassengers || []).map((item) => item.guid));
      const fields = snapshot.fields || {};
      setSelectValue(el.statusOperacao, fields.statusOperacao || "");
      setSelectValue(el.statusFaturamento, fields.statusFaturamento || "");
      setFieldValue(el.saidaData, dateTimeLocalFromParts(fields.saidaData, fields.saidaHora, fields.saidaMinuto) || fields.saidaData);
      setSelectValue(el.saidaHora, fields.saidaHora || "");
      setSelectValue(el.saidaMinuto, fields.saidaMinuto || "");
      setFieldValue(el.retPrevDateTime, fields.retPrevDateTime || dateTimeLocalFromParts(fields.saidaData, fields.retPrevHora, fields.retPrevMinuto));
      setSelectValue(el.retPrevHora, fields.retPrevHora || "");
      setSelectValue(el.retPrevMinuto, fields.retPrevMinuto || "");
      setSelectValue(el.cliente, fields.cliente || "");
      setSelectValue(el.solicitante, fields.solicitante || "");
      setSelectValue(el.tipoServico, fields.tipoServico || "");
      setSelectValue(el.tipoVeiculo, fields.tipoVeiculo || "");
      setSelectValue(el.motorista, fields.motorista || "");
      setSelectValue(el.veiculo, fields.veiculo || "");
      state.vehicleOriginManual = !!fields.vehicleOriginManual;
      clearAutomaticVehicleOnMotoristaChange();
      setFieldValue(el.trajeto, fields.trajeto);
      setFieldValue(el.receber, fields.receber);
      setFieldValue(el.cotacao, formatCurrencyDisplayValue(fields.cotacao));
      setFieldValue(el.valorReceber, formatCurrencyDisplayValue(fields.valorReceber));
      setSelectValue(el.op, fields.op || "");
      setSelectValue(el.formaPagamento, fields.formaPagamento || "");
      setFieldValue(el.cr, fields.cr);
      setFieldValue(el.enderecoPersonalizado, fields.enderecoPersonalizado);
      setFieldValue(el.destino, fields.destino);
      setFieldValue(el.agendarRetorno, fields.agendarRetorno);
      setFieldValue(el.receberRetorno, fields.receberRetorno);
      setFieldValue(el.retornoData, dateTimeLocalFromParts(fields.retornoData, fields.retornoHora, fields.retornoMinuto) || fields.retornoData);
      setSelectValue(el.retornoHora, fields.retornoHora || "");
      setSelectValue(el.retornoMinuto, fields.retornoMinuto || "");
      setFieldValue(el.retornoEndereco, fields.retornoEndereco);
      el.retornoEndereco.dataset.auto = fields.retornoEndereco ? "0" : "";
      setFieldValue(el.retornoDestino, fields.retornoDestino);
      el.retornoDestino.dataset.auto = fields.retornoDestino ? "0" : "";
      setFieldValue(el.repetirServico, fields.repetirServico);
      setFieldValue(el.frequenteInicio, fields.frequenteInicio);
      setFieldValue(el.frequenteFim, fields.frequenteFim);
      setSelectValue(el.frequenteTipo, fields.frequenteTipo || "");
      setFieldValue(el.contabilizarFds, fields.contabilizarFds);

      state.obs = { ...state.obs, ...(snapshot.obs || {}) };
      state.obsRet = { ...state.obsRet, ...(snapshot.obsRet || {}) };
      state.obsAtual = snapshot.obsAtual || "motorista";
      state.retObsAtual = snapshot.retObsAtual || "motorista";
      state.activationDraftEditState = {
        return: !fields.agendarRetorno && hasReturnDraftContent(),
        repeat: !fields.repetirServico && hasRepeatDraftContent()
      };
      state.enderecoPersonalizadoAtivo = !!snapshot.enderecoPersonalizadoAtivo;
      state.scheduleDrafts = [];
      state.enderecoRascunho = Array.isArray(snapshot.enderecoRascunho) ? snapshot.enderecoRascunho.map((item) => ({ ...item })) : [];
      state.selectedPassengers = restoreDraftPassengers(snapshot.selectedPassengers || []);
      state.draftCommonEdited = hasCommonDraftContent(snapshot);
      state.importDraftEditState = { common: false, retorno: false };
      hydratePassengerSelectionRecencyFromRows(state.selectedPassengers);

      el.observacao.value = state.obs[state.obsAtual] || fields.observacao || "";
      el.retornoObservacao.value = state.obsRet[state.retObsAtual] || fields.retornoObservacao || "";

      renderScheduleDrafts();
      renderPassengers();
      renderTabBadges();
      renderRiskPanel();
      renderDraftStatus();
      setTab(state.isNew ? (snapshot.currentTab || "details") : "details");
    } catch (error) {
      console.warn("Falha ao restaurar dados locais", error);
      state.draftCommonEdited = false;
      renderDraftStatus("Dados locais inválidos.");
    } finally {
      state.draftRestoring = false;
    }
  }

  async function applyDraftSnapshotToForm(snapshot, options = {}) {
    const config = { restoreTab: true, ...options };
    await ensurePassengersByIds((snapshot.selectedPassengers || []).map((item) => item.guid));
    const fields = snapshot.fields || {};
    setSelectValue(el.statusOperacao, fields.statusOperacao || "");
    setSelectValue(el.statusFaturamento, fields.statusFaturamento || "");
    setFieldValue(el.saidaData, dateTimeLocalFromParts(fields.saidaData, fields.saidaHora, fields.saidaMinuto) || fields.saidaData);
    setSelectValue(el.saidaHora, fields.saidaHora || "");
    setSelectValue(el.saidaMinuto, fields.saidaMinuto || "");
    setFieldValue(el.retPrevDateTime, fields.retPrevDateTime || dateTimeLocalFromParts(fields.saidaData, fields.retPrevHora, fields.retPrevMinuto));
    setSelectValue(el.retPrevHora, fields.retPrevHora || "");
    setSelectValue(el.retPrevMinuto, fields.retPrevMinuto || "");
    setSelectValue(el.cliente, fields.cliente || "");
    setSelectValue(el.solicitante, fields.solicitante || "");
    setSelectValue(el.tipoServico, fields.tipoServico || "");
    setSelectValue(el.tipoVeiculo, fields.tipoVeiculo || "");
    setSelectValue(el.motorista, fields.motorista || "");
    setSelectValue(el.veiculo, fields.veiculo || "");
    state.vehicleOriginManual = !!fields.vehicleOriginManual;
    clearAutomaticVehicleOnMotoristaChange();
    setFieldValue(el.trajeto, fields.trajeto);
    setFieldValue(el.receber, fields.receber);
    setFieldValue(el.cotacao, formatCurrencyDisplayValue(fields.cotacao));
    setFieldValue(el.valorReceber, formatCurrencyDisplayValue(fields.valorReceber));
    setSelectValue(el.op, fields.op || "");
    setSelectValue(el.formaPagamento, fields.formaPagamento || "");
    setFieldValue(el.cr, fields.cr);
    setFieldValue(el.enderecoPersonalizado, fields.enderecoPersonalizado);
    setFieldValue(el.destino, fields.destino);
    setFieldValue(el.agendarRetorno, fields.agendarRetorno);
    setFieldValue(el.receberRetorno, fields.receberRetorno);
    setFieldValue(el.retornoData, dateTimeLocalFromParts(fields.retornoData, fields.retornoHora, fields.retornoMinuto) || fields.retornoData);
    setSelectValue(el.retornoHora, fields.retornoHora || "");
    setSelectValue(el.retornoMinuto, fields.retornoMinuto || "");
    setFieldValue(el.retornoEndereco, fields.retornoEndereco);
    el.retornoEndereco.dataset.auto = fields.retornoEndereco ? "0" : "";
    setFieldValue(el.retornoDestino, fields.retornoDestino);
    el.retornoDestino.dataset.auto = fields.retornoDestino ? "0" : "";
    setFieldValue(el.retornoObservacao, fields.retornoObservacao);
    setFieldValue(el.repetirServico, fields.repetirServico);
    setFieldValue(el.frequenteInicio, fields.frequenteInicio);
    setFieldValue(el.frequenteFim, fields.frequenteFim);
    setSelectValue(el.frequenteTipo, fields.frequenteTipo || "");
    setFieldValue(el.contabilizarFds, fields.contabilizarFds);

    state.obs = { motorista: "", interna: "", final: "", passageiro: "", ...(snapshot.obs || {}) };
    state.obsRet = { motorista: "", interna: "", final: "", passageiro: "", ...(snapshot.obsRet || {}) };
    state.obsAtual = snapshot.obsAtual || "motorista";
    state.retObsAtual = snapshot.retObsAtual || "motorista";
    state.activationDraftEditState = snapshot.activationDraftEditState
      ? {
          return: !!snapshot.activationDraftEditState.return,
          repeat: !!snapshot.activationDraftEditState.repeat
        }
      : { return: false, repeat: false };
    state.enderecoPersonalizadoAtivo = !!snapshot.enderecoPersonalizadoAtivo;
    state.scheduleDrafts = Array.isArray(snapshot.scheduleDrafts) ? snapshot.scheduleDrafts.map((item) => ({ ...item })) : [];
    state.enderecoRascunho = Array.isArray(snapshot.enderecoRascunho) ? snapshot.enderecoRascunho.map((item) => ({ ...item })) : [];
    state.selectedPassengers = restoreDraftPassengers(snapshot.selectedPassengers || []);
    state.draftCommonEdited = hasCommonDraftContent(snapshot);
    state.importDraftEditState = { common: false, retorno: false };
    hydratePassengerSelectionRecencyFromRows(state.selectedPassengers);

    el.observacao.value = state.obs[state.obsAtual] || fields.observacao || "";
    el.retornoObservacao.value = state.obsRet[state.retObsAtual] || fields.retornoObservacao || "";

    renderScheduleDrafts();
    renderPassengers();
    renderTabBadges();
    renderRiskPanel();
    renderDraftStatus();
    if (config.restoreTab) setTab(state.isNew ? (snapshot.currentTab || "details") : "details");
  }

  function restoreDraftPassengers(rows) {
    return rows
      .map((item, index) => {
        const passenger = state.passageiros.find((pax) => sameId(pax.id, item.guid));
        if (!passenger) return null;
        return {
          rowKey: nextPassengerRowKey(),
          ordem: Number(item.ordem) || index + 1,
          passageiro: passenger,
          guid: passenger.id,
          telefone: item.telefone || passenger.telefone || "",
          enderecoEditado: item.enderecoEditado || passenger.endereco || ""
        };
      })
      .filter(Boolean);
  }

  function clearDraftSnapshot(showToast) {
    if (state.draftTimer) {
      window.clearTimeout(state.draftTimer);
      state.draftTimer = null;
    }
    try {
      window.localStorage.removeItem(DRAFT_STORE_KEY);
    } catch (error) {
      console.warn("Falha ao remover dados locais", error);
    }
    state.draftCommonEdited = false;
    state.importDraftEditState = { common: false, retorno: false };
    state.lastDraftSavedAt = null;
    renderDraftStatus();
    if (showToast) toast("Dados locais removidos.", "success", 2500);
  }

  function renderDraftStatus(forcedText = "") {
  }

  function readDraftSnapshot() {
    try {
      const raw = window.localStorage.getItem(DRAFT_STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function setFieldValue(element, value) {
    if (!element) return;
    if (element.type === "checkbox") {
      element.checked = !!value;
      return;
    }
    element.value = value ?? "";
  }

  function selectedText(select) {
    return select?.selectedOptions?.[0]?.textContent?.trim() || "";
  }

  function formatTime(value) {
    const date = parseDateTimeInputValue(value) || new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(PT_BR_LOCALE, {
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function populateTimeSelects() {
    const hours = ["", ...Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"))];
    const hoursRequired = hours.slice(1);
    const minutes = ["", "00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
    const minutesRequired = minutes.slice(1);
    fillOptions(el.saidaHora, hoursRequired);
    fillOptions(el.saidaMinuto, minutesRequired);
    el.retPrevHora.dataset.placeholderLabel = "00";
    el.retPrevMinuto.dataset.placeholderLabel = "00";
    fillOptions(el.retPrevHora, hours);
    fillOptions(el.retPrevMinuto, minutes);
    fillOptions(el.retornoHora, hoursRequired);
    fillOptions(el.retornoMinuto, minutesRequired);
  }

  function fillOptions(select, values) {
    if (!select || !select.options) return;
    select.innerHTML = "";
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  function setTab(tab) {
    if ((tab === "import" || tab === "return" || tab === "repeat") && !state.isNew) {
      toast("Importação, retorno e serviços frequentes só na criação.", "error");
      return;
    }
    state.currentTab = tab;
    document.body.classList.toggle("is-ai-schedule-tab", tab === "ai-schedule");
    el.tabs.forEach((button) => {
      const isActive = button.dataset.tab === tab;
      button.classList.toggle("is-active", isActive);
      button.toggleAttribute("aria-current", isActive);
    });
    el.panels.forEach((panel) => {
      const active = panel.dataset.panel === tab;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
    if (tab === "return") syncReturnDefaults();
    updateSaveButtonText();
  }

  function updateSaveButtonText() {
    if (!el.saveButtonText) return;
    const text = state.isNew
      ? isImportSaveMode()
        ? "Agendar serviços importados"
        : "Agendar serviços"
      : "Salvar edições";
    el.saveButtonText.textContent = text;
  }

  function switchObs(next, isReturn) {
    captureGlobalHistoryBeforeMutation(isReturn ? "Trocar observação do retorno" : "Trocar observação");
    if (isReturn) {
      state.obsRet[state.retObsAtual] = el.retornoObservacao.value;
      state.retObsAtual = next;
      el.retornoObservacao.value = state.obsRet[next] || "";
      document.querySelectorAll("[data-ret-obs]").forEach((button) => {
        const isActive = button.dataset.retObs === next;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", String(isActive));
      });
      return;
    }
    state.obs[state.obsAtual] = el.observacao.value;
    state.obsAtual = next;
    el.observacao.value = next === "passageiro" ? composePreferencias() : state.obs[next] || "";
    document.querySelectorAll("[data-obs]").forEach((button) => {
      const isActive = button.dataset.obs === next;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });
    requestAnimationFrame(() => {
      el.observacao?.focus();
      el.observacao?.setSelectionRange?.(el.observacao.value.length, el.observacao.value.length);
    });
    commitGlobalHistoryChange("Trocar observação");
  }

  function emptyPassenger(ordem) {
    return {
      rowKey: nextPassengerRowKey(),
      ordem,
      passageiro: null,
      guid: "",
      telefone: "",
      enderecoEditado: ""
    };
  }

  function nextPassengerRowKey() {
    state.passengerRowSeq += 1;
    return `px-${state.passengerRowSeq}-${Date.now().toString(36)}`;
  }

  function nextScheduleDraftKey() {
    state.scheduleDraftSeq += 1;
    return `svc-${state.scheduleDraftSeq}-${Date.now().toString(36)}`;
  }

  function mainScheduleSnapshot() {
    return {
      key: nextScheduleDraftKey(),
      dataHora: el.saidaData.value,
      data: datePartFromInputValue(el.saidaData.value),
      hora: el.saidaHora.value,
      minuto: el.saidaMinuto.value,
      retPrevDateTime: el.retPrevDateTime?.value || "",
      retPrevHora: el.retPrevHora.value,
      retPrevMinuto: el.retPrevMinuto.value,
      tipoServico: el.tipoServico.value,
      tipoVeiculo: el.tipoVeiculo.value,
      motorista: el.motorista.value,
      trajeto: el.trajeto.value.trim(),
      destino: el.destino.value.trim(),
      obsMotorista: state.obsAtual === "motorista" ? el.observacao.value : state.obs.motorista
    };
  }

  function addScheduleDraft() {
    state.scheduleDrafts = [];
  }

  function handleScheduleDraftAction(event) {
    const button = event.target.closest("[data-schedule-action]");
    if (!button) return;
    const row = button.closest(".schedule-draft");
    if (!row) return;
    const key = row.dataset.scheduleKey;
    const action = button.dataset.scheduleAction;

    if (action === "remove") {
      captureGlobalHistoryBeforeMutation("Remover agendamento");
      state.scheduleDrafts = state.scheduleDrafts.filter((item) => item.key !== key);
      renderScheduleDrafts();
      renderRiskPanel();
      markDraftDirty();
      commitGlobalHistoryChange("Remover agendamento");
      return;
    }

    if (action === "copy") {
      const current = state.scheduleDrafts.find((item) => item.key === key);
      if (!current) return;
      captureGlobalHistoryBeforeMutation("Copiar agendamento principal");
      Object.assign(current, mainScheduleSnapshot(), { key });
      renderScheduleDrafts();
      renderRiskPanel();
      markDraftDirty();
      toast("Dados do principal copiados", "success", 2500);
      commitGlobalHistoryChange("Copiar agendamento principal");
    }
  }

  function handleScheduleDraftChange(event) {
    const field = event.target.closest("[data-schedule-field]");
    if (!field) return;
    const row = field.closest(".schedule-draft");
    if (!row) return;
    const item = state.scheduleDrafts.find((draft) => draft.key === row.dataset.scheduleKey);
    if (!item) return;
    const fieldName = field.dataset.scheduleField;
    item[fieldName] = field.value;
    if (fieldName === "dataHora") {
      item.data = datePartFromInputValue(field.value);
      item.hora = timePartFromInputValue(field.value).split(":")[0] || "";
      item.minuto = timePartFromInputValue(field.value).split(":")[1] || "";
    }
    if (fieldName === "retPrevDateTime") {
      item.retPrevHora = timePartFromInputValue(field.value).split(":")[0] || "";
      item.retPrevMinuto = timePartFromInputValue(field.value).split(":")[1] || "";
    }
  }

  function sortPassengers() {
    state.selectedPassengers.sort((a, b) => a.ordem - b.ordem);
  }

  function getAvailablePassengers() {
    return getAvailablePassengersFrom(state.passageiros);
  }

  function getAvailablePassengersFrom(rows) {
    const usedIds = new Set(
      state.selectedPassengers
        .map((item) => cleanGuid(item.guid || ""))
        .filter(Boolean)
        .map((id) => id.toLowerCase())
    );
    return (rows || [])
      .filter((pax) => !usedIds.has(cleanGuid(pax.id).toLowerCase()))
      .slice()
      .sort((a, b) => {
        const aIndex = getPassengerSelectionRecencyIndex(a.id);
        const bIndex = getPassengerSelectionRecencyIndex(b.id);
        if (aIndex !== bIndex) return aIndex - bIndex;
        return (a.label || "").localeCompare(b.label || "", "pt-BR");
      });
  }

  async function openPassengerPicker(targetOrder = null) {
    const normalizedOrder = Number(targetOrder);
    passengerPickerTargetOrder = Number.isFinite(normalizedOrder) && normalizedOrder > 0 ? normalizedOrder : null;
    if (!el.passengerPickerOverlay || !el.passengerPickerSearch || !el.passengerPickerResults) return;
    el.passengerPickerSearch.value = "";
    renderPassengerPickerResults();
    el.passengerPickerOverlay.hidden = false;
    requestAnimationFrame(() => {
      if (el.passengerPickerSearch) el.passengerPickerSearch.focus();
    });
  }

  function closePassengerPicker() {
    passengerPickerTargetOrder = null;
    if (!el.passengerPickerOverlay) return;
    el.passengerPickerOverlay.hidden = true;
    if (el.passengerPickerSearch) el.passengerPickerSearch.value = "";
    if (el.passengerPickerResults) {
      el.passengerPickerResults.textContent = "";
      el.passengerPickerResults.scrollTop = 0;
    }
  }

  function schedulePassengerPickerSearch() {
    if (passengerPickerSearchTimer) window.clearTimeout(passengerPickerSearchTimer);
    passengerPickerSearchTimer = window.setTimeout(() => {
      passengerPickerSearchTimer = null;
      renderPassengerPickerResults();
    }, 250);
  }

  async function renderPassengerPickerResults() {
    if (!el.passengerPickerSearch || !el.passengerPickerResults) return;
    const query = el.passengerPickerSearch.value.trim();
    const searchSeq = ++passengerPickerSearchSeq;
    renderPassengerPickerHint(query ? "Pesquisando passageiros..." : "Carregando Banco de Dados...");
    let list = [];
    try {
      list = getAvailablePassengersFrom(await searchPassengersServer(query, 30));
    } catch (error) {
      console.error(error);
      renderPassengerPickerHint("Falha ao pesquisar passageiros. Tente novamente.");
      return;
    }
    if (searchSeq !== passengerPickerSearchSeq) return;
    el.passengerPickerResults.innerHTML = "";
    if (!list.length) {
      renderPassengerPickerHint("Nenhum passageiro encontrado.");
      return;
    }
    list.forEach((pax) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "passenger-picker-item";
      item.dataset.passengerAction = "add-passenger";
      item.dataset.passengerId = pax.id;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");
      item.tabIndex = -1;

      const head = document.createElement("strong");
      head.className = "passenger-picker-name";
      head.textContent = pax.label || "Passageiro sem nome";

      const meta = document.createElement("span");
      meta.className = "passenger-picker-meta";
      meta.textContent = [pax.telefone, pax.email].filter(Boolean).join(" • ");
      if (!meta.textContent) {
        meta.textContent = "Sem contatos";
      }
      const subtitle = document.createElement("small");
      subtitle.className = "passenger-picker-id";
      subtitle.textContent = pax.clienteLabel || "-";
      // Telefone e e-mail ajudam a distinguir homônimos (a busca já aceita os dois).
      item.append(head, meta, subtitle);
      el.passengerPickerResults.appendChild(item);
    });
    const first = el.passengerPickerResults.querySelector(".passenger-picker-item");
    if (first) {
      first.classList.add("is-active");
      first.setAttribute("aria-selected", "true");
    }
  }

  function renderPassengerPickerHint(message) {
    if (!el.passengerPickerResults) return;
    el.passengerPickerResults.innerHTML = "";
    const empty = document.createElement("p");
    empty.className = "passenger-picker-empty";
    empty.textContent = message;
    el.passengerPickerResults.appendChild(empty);
  }

  function handlePassengerPickerAction(event) {
    const action = event.target.closest("[data-passenger-action='add-passenger']");
    if (!action) return;
    const passengerId = action.dataset.passengerId;
    if (!passengerId) return;
    addPassengerFromId(passengerId);
  }

  function handlePassengerPickerKeydown(event) {
    if (!el.passengerPickerOverlay || el.passengerPickerOverlay.hidden) return;
    if (event.key === "Escape") {
      closePassengerPicker();
      event.preventDefault();
      return;
    }
    if (event.key === "Enter") {
      const first = el.passengerPickerResults.querySelector(".passenger-picker-item.is-active") || el.passengerPickerResults.querySelector("[data-passenger-action='add-passenger']");
      if (first) {
        event.preventDefault();
        addPassengerFromId(first.dataset.passengerId);
      }
      return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...el.passengerPickerResults.querySelectorAll("[data-passenger-action='add-passenger']")];
    if (!items.length) return;
    event.preventDefault();
    let current = items.findIndex((item) => item.classList.contains("is-active"));
    if (current < 0) {
      current = items.indexOf(document.activeElement);
    }
    let next = 0;
    if (event.key === "ArrowDown") {
      next = current >= items.length - 1 ? 0 : current + 1;
    } else {
      next = current <= 0 ? items.length - 1 : current - 1;
    }
    items.forEach((item, index) => {
      item.classList.toggle("is-active", index === next);
      item.setAttribute("aria-selected", String(index === next));
    });
    items[next].focus();
    items[next].scrollIntoView({ block: "nearest" });
  }

  function addPassengerFromId(passengerId) {
    const selected = state.passageiros.find((item) => sameId(item.id, passengerId)) || null;
    if (!selected) {
      toast("Passageiro não encontrado para seleção.", "error");
      closePassengerPicker();
      return;
    }
    const alreadyAdded = state.selectedPassengers.some((item) => sameId(item.guid, selected.id));
    if (alreadyAdded) {
      toast("Esse passageiro já está na lista.", "warning", 2500);
      closePassengerPicker();
      renderPassengers();
      return;
    }
    captureGlobalHistoryBeforeMutation("Adicionar passageiro");
    const targetOrder = Number(passengerPickerTargetOrder);
    const targetIndex = Number.isFinite(targetOrder)
      ? state.selectedPassengers.findIndex((item) => item.ordem === targetOrder && (!item.passageiro || !item.guid))
      : -1;
    passengerPickerTargetOrder = null;
    if (targetIndex >= 0) {
      const current = state.selectedPassengers[targetIndex];
      state.selectedPassengers[targetIndex] = {
        ...current,
        passageiro: selected,
        guid: selected.id,
        telefone: selected.telefone || "",
        enderecoEditado: state.enderecoPersonalizadoAtivo ? "" : selected.endereco || ""
      };
      if (!state.enderecoPersonalizadoAtivo) {
        setDraftAddress(current.ordem, selected.endereco || "");
      }
    } else {
      const nextOrder = Math.max(0, ...state.selectedPassengers.map((item) => item.ordem)) + 1;
      state.selectedPassengers.push({
        rowKey: nextPassengerRowKey(),
        ordem: nextOrder,
        passageiro: selected,
        guid: selected.id,
        telefone: selected.telefone || "",
        enderecoEditado: state.enderecoPersonalizadoAtivo ? "" : selected.endereco || ""
      });
      if (!state.enderecoPersonalizadoAtivo) {
        setDraftAddress(nextOrder, selected.endereco || "");
        state.enderecoRascunho.push({ ordem: nextOrder, endereco: selected.endereco || "" });
      }
    }
    touchPassengerSelectionRecency(selected.id);
    preloadPassengerPhoto(selected, "selected");
    applySelectedPassengerClientDefault(selected);
    applyPassengerDefaults(true);
    const currentSolicitante = el.solicitante.value;
    renderLookupSelect(el.solicitante, state.passageiros);
    setSelectValue(el.solicitante, currentSolicitante || selected.id);
    closePassengerPicker();
    renderPassengers();
    renderRiskPanel();
    markDraftDirty();
    commitGlobalHistoryChange("Adicionar passageiro");
    suppressPassengerPickerOpenOnFocus = true;
    requestAnimationFrame(() => {
      el.addPassenger?.focus({ preventScroll: true });
      window.setTimeout(() => {
        suppressPassengerPickerOpenOnFocus = false;
      }, 0);
    });
    toast(`${selected.label || "Passageiro"} adicionado.`, "success", 2200);
  }

  function addPassengerRow() {
    const pendingPassenger = state.selectedPassengers.find((item) => !item.passageiro || !item.guid);
    if (pendingPassenger) {
      openPassengerPicker(pendingPassenger.ordem);
      return;
    }
    openPassengerPicker();
  }

  function removePassengerRow(ordem, row = null) {
    captureGlobalHistoryBeforeMutation("Remover passageiro");
    if (row) {
      closePassengerPreview(row.querySelector(".row-title-wrap"));
      animatePassengerRowExit(row);
    }
    state.selectedPassengers = state.selectedPassengers.filter((item) => item.ordem !== ordem);
    state.enderecoRascunho = state.enderecoRascunho.filter((item) => item.ordem !== ordem);
    reindexPassengers();
    renderPassengers();
    applyPassengerDefaults(false);
    renderRiskPanel();
    markDraftDirty();
    commitGlobalHistoryChange("Remover passageiro");
    toast(`Passageiro ${ordem} removido`, "success", 3000);
  }

  function reindexPassengers() {
    sortPassengers();
    state.selectedPassengers = state.selectedPassengers.map((item, index) => ({ ...item, ordem: index + 1 }));
    state.enderecoRascunho = state.selectedPassengers.map((item) => ({
      ordem: item.ordem,
      endereco: getDraftAddress(item.ordem) || item.enderecoEditado || ""
    }));
  }

  function toggleEnderecoPersonalizado() {
    captureGlobalHistoryBeforeMutation("Alternar endereço dos passageiros");
    if (state.enderecoPersonalizadoAtivo) {
      state.selectedPassengers = state.selectedPassengers.map((item) => ({
        ...item,
        enderecoEditado: getDraftAddress(item.ordem) || item.passageiro?.endereco || ""
      }));
      state.enderecoRascunho = state.selectedPassengers.map((item) => ({
        ordem: item.ordem,
        endereco: item.enderecoEditado || ""
      }));
      state.enderecoPersonalizadoAtivo = false;
    } else {
      el.enderecoPersonalizado.value = composeEnderecoCompleto();
      state.enderecoPersonalizadoAtivo = true;
    }
    renderPassengers();
    renderRiskPanel();
    markDraftDirty();
    commitGlobalHistoryChange("Alternar endereço dos passageiros");
  }

  function setDraftAddress(ordem, endereco) {
    const item = state.enderecoRascunho.find((row) => row.ordem === ordem);
    if (item) item.endereco = endereco;
    else state.enderecoRascunho.push({ ordem, endereco });
  }

  function getDraftAddress(ordem) {
    return state.enderecoRascunho.find((row) => row.ordem === ordem)?.endereco || "";
  }

  function applySelectedPassengerClientDefault(passenger) {
    if (el.cliente?.value || !passenger?.clienteId) return;
    setSelectValue(el.cliente, passenger.clienteId);
    if (!el.cliente.value && passenger.clienteLabel) {
      setSelectValue(el.cliente, findOptionValue("cliente", passenger.clienteLabel));
    }
    if (!el.cliente.value) return;
    applyStatusFaturamentoDefault();
    renderStatusFaturamento();
  }

  function applyPassengerDefaults(force) {
    const selected = state.selectedPassengers.map((item) => item.passageiro).filter(Boolean);
    const firstVehicle = selected.find((p) => p.tipoVeiculo || p.tipoVeiculoLabel);
    const vehicleValue = firstVehicle
      ? firstVehicle.tipoVeiculo || findOptionValue("tipoVeiculo", firstVehicle.tipoVeiculoLabel)
      : "";
    const firstCr = selected.find((p) => p.cr)?.cr || "";
    if ((force || !el.tipoVeiculo.value) && vehicleValue) {
      setSelectValue(el.tipoVeiculo, vehicleValue);
      if (!el.tipoVeiculo.value && firstVehicle?.tipoVeiculoLabel) {
        setSelectValue(el.tipoVeiculo, findOptionValue("tipoVeiculo", firstVehicle.tipoVeiculoLabel));
      }
    }
    if ((force || !el.cr.value) && firstCr) el.cr.value = firstCr;
  }

  function applyStatusFaturamentoDefault() {
    if (!state.isNew && state.record) return;
    const cliente = state.clientes.find((item) => sameId(item.id, el.cliente.value));
    const name = (cliente?.label || "").toLowerCase();
    const mensal = ["tenaris", "embraer", "eldorado", "latazza"].some((term) => name.includes(term));
    const label = mensal ? "Faturamento Mensal" : "Pendente";
    el.statusFaturamento.dataset.defaultValue = findOptionValue("statusFaturamento", label) || "";
    if (!el.statusFaturamento.value) el.statusFaturamento.value = el.statusFaturamento.dataset.defaultValue;
  }

  function syncRepeatDefaultDates() {
    const saidaDate = datePartFromInputValue(el.saidaData.value);
    if (saidaDate) {
      if (!el.frequenteInicio.value) el.frequenteInicio.value = saidaDate;
      if (!el.frequenteFim.value) el.frequenteFim.value = saidaDate;
      if (!el.retornoData.value) {
        el.retornoData.value = el.saidaData.value;
        syncLegacyTimePartsFromDateTime(el.retornoData, el.retornoHora, el.retornoMinuto);
      }
    }
  }

  function openPassengerCreateShortcut() {
    closePassengerPicker();
    setTab("bd");
    requestAnimationFrame(() => {
      el.bdNome?.focus();
      el.bdNome?.select?.();
    });
  }

  function syncReturnDefaults() {
    if (!el.retornoEndereco.value || el.retornoEndereco.dataset.auto === "1") {
      el.retornoEndereco.value = el.destino.value || "";
      el.retornoEndereco.dataset.auto = "1";
    }
    const inverted = composeEnderecoCompletoInvertido();
    if (!el.retornoDestino.value || el.retornoDestino.dataset.auto === "1") {
      el.retornoDestino.value = inverted;
      el.retornoDestino.dataset.auto = "1";
    }
  }

  function resolvePassengerPhotoFlowUrl() {
    const runtimeUrl = String(state.xrm?.Utility?.getGlobalContext?.()?.getClientUrl?.() || window.location.href || "").toLowerCase();
    if (runtimeUrl.includes("orgf261ae8e.crm2.dynamics.com")) return PASSENGER_PHOTO_FLOW_URL_PROD;
    return PASSENGER_PHOTO_FLOW_URL_DEV;
  }

  function currentUserName() {
    try {
      return state.xrm?.Utility?.getGlobalContext?.()?.userSettings?.userName || "";
    } catch (error) {
      return "";
    }
  }

  function isSupportedPassengerPhoto(file) {
    return !!file && /^image\/(png|jpe?g|webp|gif)$/i.test(file.type || "");
  }

  function passengerPhotoFileName(file, passengerName = "passageiro") {
    const ext = String(file?.name || "").split(".").pop() || String(file?.type || "image/jpeg").split("/").pop() || "jpg";
    const safeName = normalizePassengerDisplayName(passengerName || "passageiro")
      .replace(/[\\/:*?#"<>|]/g, "-")
      .trim() || "passageiro";
    return `${safeName} - foto.${ext.toLowerCase()}`;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Falha ao ler imagem."));
      reader.readAsDataURL(file);
    });
  }

  async function preparePassengerPhotoDraft(file, passengerName = "") {
    if (!isSupportedPassengerPhoto(file)) throw new Error("Use imagem JPG, PNG, WebP ou GIF.");
    if (file.size > PASSENGER_PHOTO_MAX_BYTES) throw new Error("Imagem acima de 5 MB.");
    const dataUrl = await readFileAsDataUrl(file);
    const base64 = dataUrl.includes(",") ? dataUrl.split(",").pop() : "";
    if (!base64) throw new Error("Imagem sem Base64 válido.");
    return {
      file,
      fileName: passengerPhotoFileName(file, passengerName),
      mimeType: file.type || "image/jpeg",
      fileSize: file.size || 0,
      base64,
      previewDataUrl: dataUrl
    };
  }

  function imageFileFromClipboardData(clipboardData) {
    const items = [...(clipboardData?.items || [])];
    const imageItem = items.find((item) => String(item.type || "").startsWith("image/"));
    return imageItem?.getAsFile?.() || null;
  }

  async function setBdPassengerPhotoDraft(file) {
    try {
      const draft = await preparePassengerPhotoDraft(file, el.bdNome?.value || "");
      const confirmed = await openPassengerPhotoPreview(draft, {
        label: normalizePassengerDisplayName(el.bdNome?.value || ""),
        clienteLabel: el.bdCliente?.selectedOptions?.[0]?.textContent || ""
      });
      if (!confirmed) return;
      state.bdPassengerPhotoDraft = draft;
      renderBdPassengerPhotoDraft();
      toast("Foto pronta para upload ao cadastrar.", "success", 2500);
    } catch (error) {
      toast(error.message || "Falha ao preparar foto.", "error", 5000);
    }
  }

  function openPassengerPhotoPreview(draft, passenger = null) {
    if (!draft?.previewDataUrl || !el.passengerPhotoPreviewOverlay) return Promise.resolve(true);
    if (passengerPhotoPreviewResolve) resolvePassengerPhotoPreview(false);
    passengerPhotoPreviewPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPassengerPhotoPreviewMode("confirm");
    if (el.passengerPhotoPreviewEyebrow) el.passengerPhotoPreviewEyebrow.textContent = "Foto do passageiro";
    if (el.passengerPhotoPreviewTitle) el.passengerPhotoPreviewTitle.textContent = passengerPhotoTitleFromPassenger(passenger);
    if (el.passengerPhotoPreviewImage) {
      setPassengerPhotoImageSource(el.passengerPhotoPreviewImage, draft.previewDataUrl, "confirm");
    }
    if (el.passengerPhotoPreviewMeta) {
      el.passengerPhotoPreviewMeta.textContent = `${draft.fileName} - ${Math.ceil((draft.fileSize || 0) / 1024)} KB`;
    }
    el.passengerPhotoPreviewOverlay.hidden = false;
    window.setTimeout(() => el.passengerPhotoPreviewOk?.focus(), 0);
    return new Promise((resolve) => {
      passengerPhotoPreviewResolve = resolve;
    });
  }

  function setPassengerPhotoPreviewMode(mode) {
    const dialog = el.passengerPhotoPreviewOverlay?.querySelector(".passenger-photo-preview-dialog");
    if (!dialog) return;
    dialog.dataset.photoPreviewMode = mode;
    dialog.classList.toggle("is-view-only", mode === "view");
    if (el.passengerPhotoPreviewOk) el.passengerPhotoPreviewOk.hidden = mode === "view";
  }

  function openPassengerPhotoViewer(data) {
    if (!data?.src || !el.passengerPhotoPreviewOverlay) {
      debugPassengerPhoto("viewer:blocked", { reason: "missing-src-or-overlay", data });
      return false;
    }
    if (passengerPhotoPreviewResolve) resolvePassengerPhotoPreview(false);
    closePassengerPhotoHoverZoom();
    passengerPhotoPreviewPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPassengerPhotoPreviewMode("view");
    if (el.passengerPhotoPreviewEyebrow) {
      el.passengerPhotoPreviewEyebrow.textContent = "";
    }
    if (el.passengerPhotoPreviewTitle) {
      el.passengerPhotoPreviewTitle.textContent = passengerPhotoViewerTitle(data);
    }
    if (el.passengerPhotoPreviewImage) {
      const candidates = data.candidates?.length ? data.candidates : passengerPhotoPreviewCandidates(data.url || data.src);
      debugPassengerPhoto("viewer:open", {
        passengerName: data.passengerName || "",
        src: data.src,
        url: data.url || "",
        candidates
      });
      el.passengerPhotoPreviewImage.hidden = false;
      el.passengerPhotoPreviewImage.dataset.previewIndex = "0";
      el.passengerPhotoPreviewImage.dataset.previewCandidates = JSON.stringify(candidates);
      el.passengerPhotoPreviewImage.dataset.fallbackUrl = data.url || data.src;
      setPassengerPhotoImageSource(el.passengerPhotoPreviewImage, candidates[0] || data.src, "viewer");
    }
    hidePassengerPhotoLinkFallback();
    renderPassengerPhotoViewerMeta(data);
    el.passengerPhotoPreviewOverlay.hidden = false;
    window.setTimeout(() => el.passengerPhotoPreviewCancel?.focus(), 0);
    return true;
  }

  function handlePassengerPhotoPreviewImageError() {
    const preview = el.passengerPhotoPreviewImage;
    if (!preview || el.passengerPhotoPreviewOverlay?.hidden) return;
    let candidates = [];
    try {
      candidates = JSON.parse(preview.dataset.previewCandidates || "[]");
    } catch (_) {
      candidates = [];
    }
    const nextIndex = Number(preview.dataset.previewIndex || "0") + 1;
    markPassengerPhotoCandidateFailed(preview.currentSrc || preview.src || "", "viewer");
    debugPassengerPhoto("viewer:image-error", {
      failedSrc: preview.currentSrc || preview.src || "",
      nextIndex,
      candidates
    });
    if (candidates[nextIndex]) {
      debugPassengerPhoto("viewer:retry", { nextSrc: candidates[nextIndex], nextIndex });
      preview.dataset.previewIndex = String(nextIndex);
      setPassengerPhotoImageSource(preview, candidates[nextIndex], "viewer-retry");
      return;
    }
    showPassengerPhotoLinkFallback(preview.dataset.fallbackUrl || preview.src || "");
  }

  function showPassengerPhotoLinkFallback(url) {
    const frameUrl = passengerPhotoFrameUrl(url);
    debugPassengerPhoto("viewer:fallback", {
      url,
      frameUrl,
      openLink: normalizePassengerPhotoUrl(url) || ""
    });
    if (el.passengerPhotoPreviewImage) {
      el.passengerPhotoPreviewImage.hidden = true;
      el.passengerPhotoPreviewImage.removeAttribute("src");
    }
    if (el.passengerPhotoPreviewFallback) el.passengerPhotoPreviewFallback.hidden = false;
    if (el.passengerPhotoPreviewFrame) {
      el.passengerPhotoPreviewFrame.hidden = !frameUrl;
      el.passengerPhotoPreviewFrame.src = frameUrl || "about:blank";
    }
    if (el.passengerPhotoPreviewOpenLink) {
      el.passengerPhotoPreviewOpenLink.href = normalizePassengerPhotoUrl(url) || "#";
    }
    return true;
  }

  function hidePassengerPhotoLinkFallback() {
    if (el.passengerPhotoPreviewFallback) el.passengerPhotoPreviewFallback.hidden = true;
    if (el.passengerPhotoPreviewFrame) {
      el.passengerPhotoPreviewFrame.removeAttribute("src");
    }
    if (el.passengerPhotoPreviewOpenLink) {
      el.passengerPhotoPreviewOpenLink.href = "#";
    }
  }

  function renderPassengerPhotoViewerMeta(data) {
    if (!el.passengerPhotoPreviewMeta) return;
    el.passengerPhotoPreviewMeta.textContent = passengerPhotoViewerMetaText(data);
  }

  function passengerPhotoViewerMetaText(data) {
    return [
      passengerPhotoDisplayFileName(data),
      formatPhotoFileSize(data.fileSize),
      formatPhotoSavedAt(data.savedAt)
    ].filter(Boolean).join(" - ");
  }

  function passengerPhotoViewerTitle(data) {
    return normalizePassengerDisplayName(
      data?.passengerName ||
        passengerNameFromPhotoUrl(data?.url || data?.src || "") ||
        getPassengerById(activePassengerEditId)?.label ||
        ""
    ) || "Passageiro";
  }

  function passengerPhotoTitleFromPassenger(passenger) {
    return normalizePassengerDisplayName(
      passenger?.label ||
        passenger?.nome ||
        passengerNameFromPhotoUrl(passenger?.fotoUrl || "") ||
        getPassengerById(activePassengerEditId)?.label ||
        ""
    ) || "Passageiro";
  }

  function passengerNameFromPhotoUrl(value) {
    const url = normalizePassengerPhotoUrl(value);
    if (!url) return "";
    const candidates = passengerPhotoPreviewCandidates(url);
    const passenger = state.passageiros.find((item) => {
      const photoUrl = normalizePassengerPhotoUrl(item?.fotoUrl || "");
      if (!photoUrl) return false;
      const itemCandidates = passengerPhotoPreviewCandidates(photoUrl);
      return itemCandidates.some((candidate) => candidates.includes(candidate));
    });
    return normalizePassengerDisplayName(passenger?.label || passenger?.nome || "");
  }

  function resolvePassengerPhotoPreview(confirmed) {
    const resolve = passengerPhotoPreviewResolve;
    passengerPhotoPreviewResolve = null;
    if (el.passengerPhotoPreviewOverlay) el.passengerPhotoPreviewOverlay.hidden = true;
    setPassengerPhotoPreviewMode("confirm");
    if (el.passengerPhotoPreviewEyebrow) el.passengerPhotoPreviewEyebrow.textContent = "Foto do passageiro";
    hidePassengerPhotoLinkFallback();
    if (el.passengerPhotoPreviewImage) {
      el.passengerPhotoPreviewImage.removeAttribute("src");
      el.passengerPhotoPreviewImage.hidden = false;
    }
    if (passengerPhotoPreviewPreviousFocus?.isConnected) {
      passengerPhotoPreviewPreviousFocus.focus();
    }
    passengerPhotoPreviewPreviousFocus = null;
    if (resolve) resolve(!!confirmed);
  }

  function renderBdPassengerPhotoDraft() {
    const draft = state.bdPassengerPhotoDraft;
    if (el.bdPhotoPreview) {
      el.bdPhotoPreview.hidden = !draft;
      el.bdPhotoPreview.src = draft?.previewDataUrl || "";
      el.bdPhotoPreview.alt = draft ? "Prévia da foto do passageiro" : "";
    }
    if (el.bdPhotoMeta) {
      el.bdPhotoMeta.textContent = draft ? `${draft.fileName} - ${Math.ceil((draft.fileSize || 0) / 1024)} KB` : "JPG, PNG ou WebP até 5 MB";
    }
    if (el.bdPhotoDrop) el.bdPhotoDrop.classList.toggle("has-photo", !!draft);
    if (el.bdPhotoClear) el.bdPhotoClear.hidden = !draft;
  }

  function clearBdPassengerPhotoDraft() {
    state.bdPassengerPhotoDraft = null;
    if (el.bdPhotoInput) el.bdPhotoInput.value = "";
    renderBdPassengerPhotoDraft();
  }

  async function handleBdPassengerPhotoFileChange(event) {
    const file = event.target.files?.[0] || null;
    try {
      if (file) await setBdPassengerPhotoDraft(file);
    } finally {
      event.target.value = "";
    }
  }

  function handleBdPassengerPhotoBlockClick(event) {
    if (event.target.closest("#bdPhotoClear")) return;
    el.bdPhotoInput?.click();
  }

  function handleBdPassengerPhotoBlockKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    el.bdPhotoInput?.click();
  }

  function handlePassengerPhotoDragOver(event) {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    event.preventDefault();
    event.currentTarget.classList.add("is-dragging");
  }

  function handlePassengerPhotoDragLeave(event) {
    event.currentTarget.classList.remove("is-dragging");
  }

  function handleBdPassengerPhotoDrop(event) {
    const file = event.dataTransfer?.files?.[0] || null;
    if (!file) return;
    event.preventDefault();
    event.currentTarget.classList.remove("is-dragging");
    setBdPassengerPhotoDraft(file);
  }

  function isPassengerCreatePanelActive() {
    return !!el.bdPhotoDrop?.closest(".panel")?.classList.contains("is-active");
  }

  function handlePassengerPhotoGlobalPaste(event) {
    const file = imageFileFromClipboardData(event.clipboardData);
    if (!file) return;

    if (el.passengerEditOverlay && !el.passengerEditOverlay.hidden) {
      event.preventDefault();
      if (!passengerEditEnabled) {
        toast("Desbloqueie a edição para trocar a foto do passageiro.", "warning", 5000);
        return;
      }
      handlePassengerEditPhotoDraft(file);
      return;
    }

    if (isPassengerCreatePanelActive()) {
      event.preventDefault();
      setBdPassengerPhotoDraft(file);
    }
  }

  async function uploadPassengerPhoto(passenger, draft) {
    const flowUrl = resolvePassengerPhotoFlowUrl();
    if (!flowUrl) throw new Error("URL do Flow de foto não configurada.");
    const passengerId = cleanGuid(passenger?.id || "");
    const passengerName = normalizePassengerDisplayName(passenger?.label || passenger?.nome || "");
    const clientName = String(passenger?.clienteLabel || "").trim();
    const payload = {
      curriculoId: passengerId,
      passengerId,
      externalId: passengerId,
      fileName: draft.fileName,
      mimeType: draft.mimeType,
      fileSize: draft.fileSize,
      base64: draft.base64,
      candidateName: passengerName,
      passengerName,
      clientName,
      uploadedBy: currentUserName(),
      uploadedAt: new Date().toISOString()
    };
    const response = await fetch(flowUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Flow retornou HTTP ${response.status}.`);
    const result = await response.json().catch(() => ({}));
    const webUrl = String(
      result.downloadUrl ||
        result.directUrl ||
        result.previewUrl ||
        result.imageUrl ||
        result.webUrl ||
        result.url ||
        result.link ||
        ""
    ).trim();
    if (!webUrl) throw new Error("Flow não retornou webUrl.");
    return webUrl;
  }

  async function savePassengerPhotoLink(passengerId, photoUrl) {
    const cleanPassengerId = cleanGuid(passengerId || "");
    if (!cleanPassengerId || !photoUrl) return null;
    const payload = { [CONFIG.fields.passageiro.fotoUrl]: photoUrl };
    if (state.xrm && !state.mockMode) {
      await state.xrm.WebApi.updateRecord(CONFIG.entities.passageiro, cleanPassengerId, payload);
    }
    const field = getPassengerEditField("fotoUrl");
    return applyPassengerFieldToState(cleanPassengerId, field, photoUrl);
  }

  async function uploadAndSavePassengerPhoto(passenger, draft) {
    const photoUrl = await uploadPassengerPhoto(passenger, draft);
    const updatedPassenger = await savePassengerPhotoLink(passenger.id, photoUrl);
    if (updatedPassenger) persistMockPassengerRecord(updatedPassenger);
    preloadPassengerPhoto(updatedPassenger || { ...passenger, fotoUrl: photoUrl }, "photo-upload");
    return { photoUrl, updatedPassenger };
  }

  async function handlePassengerEditPhotoDraft(file) {
    if (!passengerEditEnabled) {
      toast("Habilite a edição antes de trocar a foto.", "warning", 4000);
      return;
    }
    const passengerId = cleanGuid(activePassengerEditId);
    const passenger = getPassengerById(passengerId);
    if (!passenger) {
      toast("Passageiro não encontrado para foto.", "error", 5000);
      return;
    }
    try {
      const draft = await preparePassengerPhotoDraft(file, passenger.label || "");
      const confirmed = await openPassengerPhotoPreview(draft, passenger);
      if (!confirmed) return;
      setActivePassengerEditPhotoDraft(passengerId, draft, { uploading: true });
      renderPassengerEditFields(passenger);
      setPassengerEditMode(true);
      setPassengerEditStatus("Enviando foto...", "saving");
      const { updatedPassenger } = await uploadAndSavePassengerPhoto(passenger, draft);
      setActivePassengerEditPhotoDraft(passengerId, draft, { uploading: false, saved: true });
      setPassengerEditStatus("Foto atualizada.", "saved");
      renderPassengerEditFields(updatedPassenger || getPassengerById(passengerId));
      setPassengerEditMode(true);
      refreshPassengerDependentViews(passengerId);
    } catch (error) {
      console.error(error);
      setActivePassengerEditPhotoDraft(
        passengerId,
        activePassengerEditPhotoDraft?.draft || null,
        { uploading: false, failed: true }
      );
      renderPassengerEditFields(getPassengerById(passengerId) || passenger);
      setPassengerEditMode(true);
      setPassengerEditStatus("Falha ao salvar foto.", "error");
      toast(error.message || "Falha ao salvar foto.", "error", 8000);
    }
  }

  function handlePassengerEditPhotoAction(event) {
    const wrap = event.target.closest("[data-passenger-edit-control='fotoUrl']");
    if (!wrap) return;
    if (!passengerEditEnabled) {
      if (openLockedPassengerEditPhotoViewer(wrap)) return;
      toast("Desbloqueie a edição para trocar a foto do passageiro.", "warning", 5000);
      return;
    }
    wrap.querySelector("[data-passenger-photo-file]")?.click();
  }

  function handlePassengerEditPhotoHover(event) {
    const wrap = event.target.closest("[data-passenger-edit-control='fotoUrl']");
    if (!wrap || passengerEditEnabled) return;
    const data = photoViewerDataFromPassenger(getPassengerById(activePassengerEditId), wrap);
    if (!data?.src) return;
    openPassengerPhotoHoverZoom(wrap, data);
  }

  function handlePassengerEditPhotoHoverLeave(event) {
    const wrap = event.target.closest("[data-passenger-edit-control='fotoUrl']");
    if (!wrap || wrap.contains(event.relatedTarget)) return;
    closePassengerPhotoHoverZoom();
  }

  function openLockedPassengerEditPhotoViewer(wrap) {
    return openPassengerPhotoViewer(photoViewerDataFromPassenger(getPassengerById(activePassengerEditId), wrap));
  }

  function photoViewerDataFromPassenger(passenger, control = null) {
    const draft = getActivePassengerEditPhotoDraft(passenger?.id || activePassengerEditId)?.draft || null;
    const savedUrl = normalizePassengerPhotoUrl(control?.dataset?.savedValue || passenger?.fotoUrl || "");
    const candidates = draft?.previewDataUrl ? [draft.previewDataUrl] : passengerPhotoPreviewCandidates(savedUrl);
    const src = candidates[0] || "";
    if (!src) {
      debugPassengerPhoto("viewer:data-missing", {
        passengerId: passenger?.id || activePassengerEditId || "",
        passengerName: passenger?.label || passenger?.nome || "",
        hasDraft: !!draft,
        savedUrl
      });
      return null;
    }
    return {
      src,
      url: savedUrl || src,
      candidates,
      passengerName: normalizePassengerDisplayName(passenger?.label || passenger?.nome || "") || passengerNameFromPhotoUrl(savedUrl || src),
      clientName: String(passenger?.clienteLabel || "").trim(),
      fileName: draft?.fileName || fileNameFromPhotoUrl(savedUrl || src),
      fileSize: draft?.fileSize || "",
      savedAt: draft ? new Date().toISOString() : ""
    };
  }

  function hydratePassengerPhotoViewerDataset(element, data) {
    element.dataset.photoSrc = data.src || "";
    element.dataset.photoUrl = data.url || data.src || "";
    element.dataset.photoCandidates = JSON.stringify(data.candidates || []);
    element.dataset.photoPassengerName = data.passengerName || "";
    element.dataset.photoClientName = data.clientName || "";
    element.dataset.photoFileName = data.fileName || "";
    element.dataset.photoFileSize = data.fileSize || "";
    element.dataset.photoSavedAt = data.savedAt || "";
  }

  function passengerPhotoViewerDataFromElement(element) {
    if (!element?.dataset?.photoSrc) return null;
    return {
      src: element.dataset.photoSrc,
      url: element.dataset.photoUrl || element.dataset.photoSrc,
      candidates: parsePassengerPhotoCandidates(element.dataset.photoCandidates),
      passengerName: element.dataset.photoPassengerName || "",
      clientName: element.dataset.photoClientName || "",
      fileName: element.dataset.photoFileName || "",
      fileSize: element.dataset.photoFileSize || "",
      savedAt: element.dataset.photoSavedAt || ""
    };
  }

  function ensurePassengerPhotoHoverZoom() {
    let zoom = document.getElementById("passengerPhotoHoverZoom");
    if (zoom) return zoom;
    zoom = document.createElement("div");
    zoom.id = "passengerPhotoHoverZoom";
    zoom.className = "passenger-photo-hover-zoom";
    zoom.setAttribute("aria-hidden", "true");
    const img = document.createElement("img");
    img.alt = "";
    zoom.appendChild(img);
    document.body.appendChild(zoom);
    return zoom;
  }

  function openPassengerPhotoHoverZoom(anchor, data) {
    if (!data?.src || isMobilePassengerPreviewDisabled()) return;
    const zoom = ensurePassengerPhotoHoverZoom();
    const img = zoom.querySelector("img");
    if (img) hydratePassengerPhotoImageElement(img, data, "hover");
    zoom.classList.add("is-open");
    zoom.setAttribute("aria-hidden", "false");
    activePassengerPhotoHoverZoom = { anchor, zoom };
    updatePassengerPhotoHoverZoomPosition();
  }

  function closePassengerPhotoHoverZoom() {
    if (!activePassengerPhotoHoverZoom) return;
    const { zoom } = activePassengerPhotoHoverZoom;
    zoom.classList.remove("is-open");
    zoom.setAttribute("aria-hidden", "true");
    const img = zoom.querySelector("img");
    if (img) img.removeAttribute("src");
    activePassengerPhotoHoverZoom = null;
  }

  function updatePassengerPhotoHoverZoomPosition() {
    if (!activePassengerPhotoHoverZoom) return;
    const { anchor, zoom } = activePassengerPhotoHoverZoom;
    if (!anchor?.isConnected) {
      closePassengerPhotoHoverZoom();
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const viewport = currentViewportMetrics();
    const size = Math.min(260, Math.max(180, viewport.width - 24));
    const gap = 10;
    const left = Math.min(viewport.offsetLeft + viewport.width - size - gap, Math.max(viewport.offsetLeft + gap, rect.right + gap));
    const top = Math.min(viewport.offsetTop + viewport.height - size - gap, Math.max(viewport.offsetTop + gap, rect.top));
    zoom.style.width = `${size}px`;
    zoom.style.height = `${size}px`;
    zoom.style.left = `${left}px`;
    zoom.style.top = `${top}px`;
  }

  function parsePassengerPhotoCandidates(value) {
    try {
      const parsed = JSON.parse(value || "[]");
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }

  function hydratePassengerPhotoImageElement(img, data, surface) {
    const candidates = data?.candidates?.length ? data.candidates : passengerPhotoPreviewCandidates(data?.url || data?.src);
    img.dataset.previewIndex = "0";
    img.dataset.previewCandidates = JSON.stringify(candidates);
    img.dataset.photoSurface = surface || "";
    img.dataset.fallbackUrl = data?.url || data?.src || "";
    setPassengerPhotoImageSource(img, candidates[0] || data?.src || "", surface || "image");
  }

  function advancePassengerPhotoImageElement(img) {
    if (!img) return;
    let candidates = [];
    try {
      candidates = JSON.parse(img.dataset.previewCandidates || "[]");
    } catch (_) {
      candidates = [];
    }
    const nextIndex = Number(img.dataset.previewIndex || "0") + 1;
    markPassengerPhotoCandidateFailed(img.currentSrc || img.src || "", img.dataset.photoSurface || "image");
    debugPassengerPhoto(`${img.dataset.photoSurface || "image"}:image-error`, {
      failedSrc: img.currentSrc || img.src || "",
      nextIndex,
      candidates
    });
    if (candidates[nextIndex]) {
      debugPassengerPhoto(`${img.dataset.photoSurface || "image"}:retry`, {
        nextSrc: candidates[nextIndex],
        nextIndex
      });
      img.dataset.previewIndex = String(nextIndex);
      setPassengerPhotoImageSource(img, candidates[nextIndex], `${img.dataset.photoSurface || "image"}-retry`);
      return;
    }
    debugPassengerPhoto(`${img.dataset.photoSurface || "image"}:fallback-unavailable`, {
      url: img.dataset.fallbackUrl || ""
    });
  }

  function fileNameFromPhotoUrl(value) {
    const url = String(value || "").trim();
    if (!url || /^data:image\//i.test(url)) return "";
    try {
      const parsed = new URL(url, window.location.href);
      const queryName = ["file", "filename", "name", "title"]
        .map((key) => parsed.searchParams.get(key))
        .find((entry) => String(entry || "").trim());
      if (queryName) {
        const cleanQueryName = decodeURIComponent(String(queryName).trim());
        return isOpaquePhotoFileName(cleanQueryName) ? "" : cleanQueryName;
      }
      const pathName = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
      return isOpaquePhotoFileName(pathName) ? "" : pathName;
    } catch (_) {
      return "";
    }
  }

  function isOpaquePhotoFileName(value) {
    const clean = String(value || "").trim();
    if (!clean) return false;
    if (/\.[a-z0-9]{2,8}$/i.test(clean)) return false;
    return /^[a-z0-9_-]{20,}$/i.test(clean);
  }

  function photoFileNameFromContentDisposition(value) {
    const header = String(value || "").trim();
    if (!header) return "";
    const utfMatch = header.match(/filename\*=([^;]+)/i);
    if (utfMatch) {
      const raw = utfMatch[1].trim().replace(/^utf-8''/i, "").replace(/^["']|["']$/g, "");
      try {
        const decoded = decodeURIComponent(raw);
        return isOpaquePhotoFileName(decoded) ? "" : decoded;
      } catch (_) {
        debugPassengerPhoto("metadata:filename-decode-fail", { raw });
      }
    }
    const quotedMatch = header.match(/filename\s*=\s*"([^"]+)"/i);
    const plainMatch = header.match(/filename\s*=\s*([^;]+)/i);
    const fileName = (quotedMatch?.[1] || plainMatch?.[1] || "").trim().replace(/^["']|["']$/g, "");
    return isOpaquePhotoFileName(fileName) ? "" : fileName;
  }

  function passengerPhotoDisplayFileName(data) {
    const fileName = String(data?.fileName || "").trim();
    if (fileName && !isOpaquePhotoFileName(fileName)) return fileName;
    return fileNameFromPhotoUrl(data?.url || data?.src || "") || String(data?.clientName || "").trim();
  }

  function formatPhotoFileSize(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  function formatPhotoSavedAt(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  async function loadPassengerPhotoLinkMetadata(data, callback) {
    debugPassengerPhoto("metadata:head:skipped", {
      reason: "sharepoint-cors",
      url: data?.url || ""
    });
    callback?.(data);
  }

  function isPassengerPhotoDebugEnabled() {
    try {
      return /(?:^|[?&])tfgdebug=1/i.test(window.location.search) || window.localStorage?.getItem("tfg:debug-foto") === "1";
    } catch (_) {
      return false;
    }
  }

  function debugPassengerPhoto(eventName, payload = {}) {
    try {
      console.info("[TFG foto pax]", eventName, payload);
    } catch (_) {
      // noop
    }
  }

  async function handlePassengerEditPhotoFileChange(event) {
    if (!event.target.matches("[data-passenger-photo-file]")) return;
    const file = event.target.files?.[0] || null;
    try {
      if (file) await handlePassengerEditPhotoDraft(file);
    } finally {
      event.target.value = "";
    }
  }

  async function createPassenger() {
    clearValidationStates();
    el.bdNome.value = normalizePassengerDisplayName(el.bdNome.value);
    el.bdTelefone.value = formatPhoneNumber(el.bdTelefone.value);
    el.bdEmail.value = normalizeEmail(el.bdEmail.value);
    el.bdCr.value = normalizeCodeValue(el.bdCr.value);
    const required = [
      [el.bdNome.value.trim(), "'Nome do Passageiro' é obrigatório."],
      [el.bdCliente.value, "'Cliente' é obrigatório."],
      [el.bdIdioma.value, "'Idioma' é obrigatório."],
      [el.bdClassificacao.value, "'Classificação' é obrigatório."]
    ];
    const requiredControls = [el.bdNome, el.bdCliente, el.bdIdioma, el.bdClassificacao];
    const missingIndex = required.findIndex(([value]) => !value);
    const missing = missingIndex >= 0 ? required[missingIndex] : null;
    if (missing) {
      toast(missing[1], "error");
      revealInvalidField(requiredControls[missingIndex], missing[1], { tab: "bd" });
      return;
    }

    if (!validatePhoneControl(el.bdTelefone, { tab: "bd" })) {
      toast("'Telefone' inválido.", "error");
      return;
    }

    if (!validateEmailControl(el.bdEmail, { tab: "bd" })) {
      toast("'Email' inválido.", "error");
      return;
    }

    if (state.bdPassengerPhotoDraft && !resolvePassengerPhotoFlowUrl()) {
      toast("Configure a URL do Flow de foto antes de cadastrar com imagem.", "error", 7000);
      revealInvalidField(el.bdPhotoDrop, "URL do Flow de foto não configurada.", { tab: "bd" });
      return;
    }

    const duplicateCandidates = await findPassengerDuplicateCandidates(readPassengerCreateCandidate());
    if (duplicateCandidates.length) {
      const decision = await openPassengerMatchReview(duplicateCandidates);
      if (decision.action === "cancel") return;
    }

    setLoading(true);
    try {
      const payload = {
        [CONFIG.fields.passageiro.nome]: el.bdNome.value.trim(),
        [CONFIG.fields.passageiro.telefone]: phoneStorageValue(el.bdTelefone.value),
        [CONFIG.fields.passageiro.enderecoSaida]: el.bdEndereco.value.trim(),
        [CONFIG.fields.passageiro.preferencias]: el.bdPreferencias.value.trim(),
        [CONFIG.fields.passageiro.email]: el.bdEmail.value.trim(),
        [CONFIG.fields.passageiro.cr]: el.bdCr.value.trim(),
        [CONFIG.fields.passageiro.departamento]: el.bdDepartamento.value.trim(),
        [CONFIG.fields.passageiro.cadastro]: new Date().toISOString().slice(0, 10)
      };
      setChoice(payload, CONFIG.fields.passageiro.status, getActivePassengerStatusValue());
      setChoice(payload, CONFIG.fields.passageiro.cargo, el.bdCargo.value);
      setChoice(payload, CONFIG.fields.passageiro.sexo, el.bdSexo.value);
      setChoice(payload, CONFIG.fields.passageiro.idioma, el.bdIdioma.value);
      setChoice(payload, CONFIG.fields.passageiro.classificacao, el.bdClassificacao.value);
      setChoice(payload, CONFIG.fields.passageiro.tipoVeiculo, el.bdTipoVeiculo.value);
      if (el.bdNascimento.value) payload[CONFIG.fields.passageiro.nascimento] = el.bdNascimento.value;
      bindLookup(payload, CONFIG.nav.cliente, CONFIG.entitySets.cliente, el.bdCliente.value);

      let created;
      if (state.xrm && !state.mockMode) {
        created = await state.xrm.WebApi.createRecord(CONFIG.entities.passageiro, payload);
      } else {
        created = { id: `local-${Date.now()}` };
      }

      const newPassenger = {
        id: cleanGuid(created.id),
        ...passengerFormState()
      };
      if (state.bdPassengerPhotoDraft) {
        try {
          const { photoUrl } = await uploadAndSavePassengerPhoto(newPassenger, state.bdPassengerPhotoDraft);
          newPassenger.fotoUrl = photoUrl;
        } catch (photoError) {
          console.error(photoError);
          toast(`Passageiro criado, mas a foto não foi salva. ${photoError.message || ""}`, "warning", 9000);
        }
      }
      state.passageiros.push(newPassenger);
      persistMockPassengerRecord(newPassenger);
      state.passageiros.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
      clearPassengerCreateForm();
      renderLookupSelect(el.solicitante, state.passageiros);
      renderPassengers();
      renderRiskPanel();
      markDraftDirty();
      setTab("details");
      toast(`Cadastro criado para ${newPassenger.label}${newPassenger.fotoUrl ? " com foto" : ""}!`, "success");
    } catch (error) {
      console.error(error);
      toast(`Falha ao cadastrar passageiro. ${error.message || ""}`, "error", 9000);
    } finally {
      setLoading(false);
    }
  }

  function clearPassengerCreateForm() {
    [
      el.bdNome,
      el.bdTelefone,
      el.bdEndereco,
      el.bdEmail,
      el.bdCr,
      el.bdDepartamento,
      el.bdNascimento,
      el.bdPreferencias
    ].forEach((input) => {
      setFieldValue(input, "");
    });
    [el.bdClassificacao, el.bdCliente, el.bdSexo, el.bdIdioma, el.bdCargo, el.bdTipoVeiculo].forEach((select) => {
      setSelectValue(select, "");
    });
    resetPhoneControl();
    clearBdPassengerPhotoDraft();
    clearValidationStates();
  }

  function passengerFormState() {
    return {
      label: el.bdNome.value.trim(),
      telefone: el.bdTelefone.value.trim(),
      email: el.bdEmail.value.trim(),
      endereco: el.bdEndereco.value.trim(),
      preferencias: el.bdPreferencias.value.trim(),
      cr: el.bdCr.value.trim(),
      clienteId: el.bdCliente.value,
      clienteLabel: state.clientes.find((item) => sameId(item.id, el.bdCliente.value))?.label || "",
      status: getActivePassengerStatusValue(),
      classificacao: el.bdClassificacao.value,
      sexo: el.bdSexo.value,
      idioma: el.bdIdioma.value,
      cargo: el.bdCargo.value,
      nascimento: el.bdNascimento.value,
      departamento: el.bdDepartamento.value.trim(),
      tipoVeiculo: el.bdTipoVeiculo.value,
      fotoUrl: ""
    };
  }

  function getActivePassengerStatusValue() {
    const active = (state.options.bdStatus || []).find((option) => normalize(option.label) === "ativo");
    if (active) return active.value;
    return FALLBACK.bdStatus[0]?.value || "";
  }

  function readPassengerCreateCandidate() {
    return {
      ...passengerFormState(),
      clienteLabel: state.clientes.find((item) => sameId(item.id, el.bdCliente.value))?.label || ""
    };
  }

  async function findPassengerDuplicateCandidates(candidate) {
    const terms = passengerDuplicateSearchTerms(candidate);
    const rows = [];
    rows.push(...await searchPassengerDuplicateClientPool(candidate.clienteId));
    for (const term of terms) {
      try {
        rows.push(...await searchPassengersServer(term, 20));
      } catch (error) {
        console.warn("Falha ao verificar duplicidade de passageiro", error);
      }
    }

    state.passageiros.forEach((passenger) => rows.push(passenger));
    const uniqueRows = [];
    const seen = new Set();
    rows.forEach((passenger) => {
      const id = cleanGuid(passenger?.id).toLowerCase();
      if (!id || seen.has(id)) return;
      seen.add(id);
      uniqueRows.push(passenger);
    });

    return uniqueRows
      .map((passenger) => scorePassengerCandidate(candidate, passenger))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  async function searchPassengerDuplicateClientPool(clientId) {
    const cleanClientId = cleanGuid(clientId);
    if (!cleanClientId) return [];
    if (!state.xrm || state.mockMode) {
      return state.passageiros.filter((passenger) => sameId(passenger.clienteId, cleanClientId)).slice(0, 100);
    }
    if (!isGuid(cleanClientId)) return [];

    try {
      const f = CONFIG.fields.passageiro;
      const rows = await retrieveAll(
        CONFIG.entities.passageiro,
        `?$select=${passengerSelectFields()}&$filter=_cr40f_cliente_value eq ${cleanClientId}&$orderby=${f.nome} asc&$top=100`
      );
      return rows.map(mapPassageiro);
    } catch (error) {
      console.warn("Falha ao buscar passageiros do mesmo cliente", error);
      return [];
    }
  }

  function passengerDuplicateSearchTerms(candidate) {
    const terms = [];
    const email = String(candidate.email || "").trim();
    const phone = onlyDigits(candidate.telefone);
    const cr = String(candidate.cr || "").trim();
    const name = normalizeName(candidate.label);
    const emailLocal = email.split("@")[0] || "";

    if (email) terms.push(email);
    if (emailLocal.length >= 3) terms.push(emailLocal);
    if (phone.length >= 4) terms.push(phone.slice(-4));
    if (cr) terms.push(cr);
    if (name) {
      terms.push(candidate.label);
      const tokens = name.split(" ").filter((token) => token.length >= 3);
      if (tokens[0]) terms.push(tokens[0]);
      if (tokens.length > 1) terms.push(tokens[tokens.length - 1]);
    }

    return Array.from(new Set(
      terms
        .map((term) => String(term || "").trim())
        .filter((term) => normalize(term).length > 0)
    )).slice(0, 5);
  }

  function scorePassengerCandidate(candidate, passenger) {
    const reasons = [];
    let score = 0;
    const candidatePhone = onlyDigits(candidate.telefone);
    const passengerPhone = onlyDigits(passenger.telefone);
    const candidateEmail = normalize(candidate.email);
    const passengerEmail = normalize(passenger.email);
    const candidateMissingContact = !candidatePhone && !candidateEmail;
    const sameClient = candidate.clienteId && passenger.clienteId && sameId(candidate.clienteId, passenger.clienteId);
    const similarity = nameSimilarity(candidate.label, passenger.label);

    if (candidatePhone && passengerPhone && phoneNumbersMatch(candidatePhone, passengerPhone)) {
      score += sameClient ? 70 : 55;
      reasons.push("Telefone igual");
    } else if (candidatePhone && passengerPhone && phoneNumbersNearlyMatch(candidatePhone, passengerPhone) && (sameClient || similarity >= 0.78)) {
      score += sameClient ? 35 : 25;
      reasons.push("Telefone parecido");
    }
    if (candidateEmail && passengerEmail && candidateEmail === passengerEmail) {
      score += sameClient ? 70 : 55;
      reasons.push("Email igual");
    } else if (candidateEmail && passengerEmail && emailsProbablySame(candidateEmail, passengerEmail) && (sameClient || similarity >= 0.78)) {
      score += sameClient ? 35 : 25;
      reasons.push("Email parecido");
    }

    if (normalizeName(candidate.label) && normalizeName(candidate.label) === normalizeName(passenger.label)) {
      score += 50;
      reasons.push("Nome igual");
      reasons.push("Nome quase igual");
    } else if (similarity >= 0.92) {
      score += 50;
      reasons.push("Nome quase igual");
    } else if (similarity >= 0.84) {
      score += sameClient ? 40 : 35;
      reasons.push("Nome muito parecido");
    } else if (similarity >= 0.74 && sameClient) {
      score += 30;
      reasons.push("Nome parecido no mesmo cliente");
    }
    if (sameClient) {
      score += 15;
      reasons.push("Mesmo cliente");
    }
    if (candidate.cr && passenger.cr && normalize(candidate.cr) === normalize(passenger.cr)) {
      score += 20;
      reasons.push("CR igual");
    }
    if (candidate.departamento && passenger.departamento && normalize(candidate.departamento) === normalize(passenger.departamento)) {
      score += 10;
      reasons.push("Mesmo departamento");
    }

    const candidateIsEmbraer = normalize(candidate.clienteLabel || candidate.clienteNome) === "embraer";
    const passengerIsEmbraer = normalize(passenger.clienteLabel || passenger.clienteNome) === "embraer";
    const embraerPhoneOnlyDuplicate = candidateIsEmbraer
      && passengerIsEmbraer
      && reasons.includes("Telefone igual")
      && reasons.every((reason) => ["Telefone igual", "Mesmo cliente"].includes(reason));
    if (embraerPhoneOnlyDuplicate) return null;

    const strongContactMatch = reasons.includes("Telefone igual") || reasons.includes("Email igual");
    if (!strongContactMatch && score < 45) return null;
    return {
      passenger,
      score,
      reasons: Array.from(new Set(reasons)),
      candidateMissingContact
    };
  }

  function phoneNumbersMatch(left, right) {
    if (left === right) return true;
    const leftComparable = left.length >= 8 ? left.slice(-8) : left;
    const rightComparable = right.length >= 8 ? right.slice(-8) : right;
    return leftComparable.length >= 8 && leftComparable === rightComparable;
  }

  function phoneNumbersNearlyMatch(left, right) {
    const leftComparable = left.length >= 8 ? left.slice(-8) : left;
    const rightComparable = right.length >= 8 ? right.slice(-8) : right;
    if (leftComparable.length < 8 || rightComparable.length < 8 || leftComparable.length !== rightComparable.length) return false;
    return hammingDistance(leftComparable, rightComparable) === 1;
  }

  function emailsProbablySame(left, right) {
    const a = splitEmail(left);
    const b = splitEmail(right);
    if (!a.local || !b.local || !a.domain || !b.domain) return false;
    const sameLocal = stringSimilarity(a.local, b.local) >= 0.88;
    const sameDomain = stringSimilarity(a.domain, b.domain) >= 0.88;
    return sameLocal && sameDomain;
  }

  function splitEmail(value) {
    const parts = normalize(value).split("@");
    return {
      local: parts[0] || "",
      domain: parts[1] || ""
    };
  }

  function nameSimilarity(left, right) {
    const a = normalizeName(left);
    const b = normalizeName(right);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const editScore = stringSimilarity(a, b);
    const aTokens = a.split(" ").filter(Boolean);
    const bTokens = b.split(" ").filter(Boolean);
    const aSet = new Set(aTokens);
    const bSet = new Set(bTokens);
    const overlap = [...aSet].filter((token) => bSet.has(token)).length;
    const exactTokenScore = overlap / Math.max(aSet.size, bSet.size, 1);
    const fuzzyTokenScore = tokenFuzzyNameScore(aTokens, bTokens);
    return Math.max(editScore, exactTokenScore, fuzzyTokenScore);
  }

  function normalizeName(value) {
    return normalize(value)
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\b(sr|sra|dr|dra|mr|mrs|ms)\b/g, " ")
      .replace(/\b(de|da|do|das|dos|e|y|the)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenFuzzyNameScore(leftTokens, rightTokens) {
    if (!leftTokens.length || !rightTokens.length) return 0;
    const usedRight = new Set();
    let total = 0;
    let strongMatches = 0;

    leftTokens.forEach((leftToken) => {
      let bestIndex = -1;
      let bestScore = 0;
      rightTokens.forEach((rightToken, index) => {
        if (usedRight.has(index)) return;
        const score = stringSimilarity(leftToken, rightToken);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });
      if (bestIndex >= 0) usedRight.add(bestIndex);
      total += bestScore;
      if (bestScore >= 0.78) strongMatches += 1;
    });

    const size = Math.max(leftTokens.length, rightTokens.length, 1);
    const average = total / size;
    const coverage = strongMatches / size;
    return (average * 0.7) + (coverage * 0.3);
  }

  function stringSimilarity(left, right) {
    const a = String(left || "");
    const b = String(right || "");
    if (!a || !b) return 0;
    if (a === b) return 1;
    return 1 - (damerauLevenshteinDistance(a, b) / Math.max(a.length, b.length));
  }

  function hammingDistance(left, right) {
    if (left.length !== right.length) return Infinity;
    let distance = 0;
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) distance += 1;
    }
    return distance;
  }

  function damerauLevenshteinDistance(left, right) {
    const rows = left.length + 1;
    const cols = right.length + 1;
    const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
    for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

    for (let i = 1; i < rows; i += 1) {
      for (let j = 1; j < cols; j += 1) {
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
        if (
          i > 1 &&
          j > 1 &&
          left[i - 1] === right[j - 2] &&
          left[i - 2] === right[j - 1]
        ) {
          matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
        }
      }
    }

    return matrix[left.length][right.length];
  }

  function levenshteinDistance(left, right) {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i += 1) {
      let last = i - 1;
      previous[0] = i;
      for (let j = 1; j <= right.length; j += 1) {
        const current = previous[j];
        previous[j] = left[i - 1] === right[j - 1]
          ? last
          : Math.min(previous[j - 1], previous[j], last) + 1;
        last = current;
      }
    }
    return previous[right.length];
  }

  function openPassengerMatchReview(candidates, options = {}) {
    if (!candidates.length || !el.passengerMatchOverlay || !el.passengerMatchList) {
      return Promise.resolve({ action: "continue" });
    }
    if (passengerMatchResolve) {
      passengerMatchResolve({ action: "cancel" });
      passengerMatchResolve = null;
    }
    passengerMatchCandidates = candidates;
    passengerMatchContext = {
      mode: options.mode || "create",
      title: options.title || "Passageiro encontrado",
      summary: options.summary || `${candidates.length} cadastro${candidates.length === 1 ? "" : "s"} parecido${candidates.length === 1 ? "" : "s"}.`,
      eyebrow: options.eyebrow || "Duplicidade",
      continueLabel: options.continueLabel || "Criar novo",
      cancelLabel: options.cancelLabel || "Revisar",
      useSelectedLabel: options.useSelectedLabel || "Usar selecionado",
      importedPassenger: options.importedPassenger || null,
      selectedPassengerId: cleanGuid(options.selectedPassengerId || candidates[0]?.passenger?.id || "")
    };
    renderPassengerMatchList(candidates);
    el.passengerMatchOverlay.hidden = false;
    el.passengerMatchOverlay.querySelector(".passenger-match-dialog")?.classList.toggle("is-import-review", passengerMatchContext.mode === "import");
    requestAnimationFrame(() => {
      el.passengerMatchOverlay.querySelector(".passenger-match-dialog")?.focus();
    });
    return new Promise((resolve) => {
      passengerMatchResolve = resolve;
    });
  }

  function renderPassengerMatchList(candidates) {
    el.passengerMatchList.innerHTML = "";
    const context = passengerMatchContext || {};
    const isImportMode = context.mode === "import" && !!context.importedPassenger;
    const isSelectionMode = isPassengerMatchSelectionMode(context);
    const title = document.getElementById("passengerMatchTitle");
    const eyebrow = el.passengerMatchOverlay?.querySelector(".passenger-picker-eyebrow");
    if (eyebrow) eyebrow.textContent = context.eyebrow || "Duplicidade";
    if (title) title.textContent = context.title || "Passageiro encontrado";
    if (el.passengerMatchSummary) el.passengerMatchSummary.textContent = context.summary || "";
    if (el.passengerMatchCancel) el.passengerMatchCancel.textContent = context.cancelLabel || "Revisar";
    if (el.passengerMatchContinue) el.passengerMatchContinue.textContent = context.continueLabel || "Criar novo";
    if (el.passengerMatchUseSelected) {
      el.passengerMatchUseSelected.hidden = !isSelectionMode;
      el.passengerMatchUseSelected.disabled = !context.selectedPassengerId;
      el.passengerMatchUseSelected.textContent = context.useSelectedLabel || "Usar selecionado";
    }
    const questionSearchKey = "Certeza que este nao e o passageiro desejado?";
    if (isImportMode) {
      el.passengerMatchList.appendChild(buildImportedPassengerSourceCard(context.importedPassenger));
    }
    candidates.forEach((candidate, index) => {
      const passenger = candidate.passenger;
      const isSelected = sameId(passenger.id, context.selectedPassengerId);
      const item = document.createElement("article");
      item.className = "passenger-match-item";
      item.classList.toggle("is-import-option", isImportMode);
      item.classList.toggle("is-selected", isSelectionMode && isSelected);
      if (isSelectionMode) {
        item.dataset.passengerMatchAction = "select-candidate";
        item.dataset.passengerId = passenger.id;
        item.tabIndex = 0;
        item.setAttribute("role", "radio");
        item.setAttribute("aria-checked", isSelected ? "true" : "false");
      }
      item.dataset.questionKey = questionSearchKey;
      item.style.setProperty("--match-index", index);

      const main = document.createElement("div");
      main.className = "passenger-match-main";
      const reasonMap = getPassengerMatchReasonMap(candidate.reasons);
      const top = document.createElement("div");
      top.className = "passenger-match-top";
      const titleMain = document.createElement("div");
      titleMain.className = "passenger-match-title-main";
      const title = document.createElement("strong");
      title.className = "passenger-match-name";
      title.append(document.createTextNode(passenger.label || "Passageiro sem nome"));
      if (reasonMap.has("nome")) {
        title.classList.add("is-match");
        const titleReason = document.createElement("span");
        titleReason.className = "passenger-match-field-reason";
        titleReason.textContent = reasonMap.get("nome");
        title.appendChild(titleReason);
      }
      const badges = document.createElement("div");
      badges.className = "passenger-match-badges";
      badges.append(
        buildPassengerMatchBadge(index === 0 ? "Mais parecido" : `Opcao ${index + 1}`, index === 0 ? "top" : "neutral")
      );
      if (isSelectionMode && isSelected) {
        badges.appendChild(buildPassengerMatchBadge("Selecionado", "selected"));
      }
      if (!isImportMode) {
        badges.appendChild(buildPassengerMatchBadge(passengerMatchStrengthLabel(candidate.score), passengerMatchStrengthTone(candidate.score)));
      }
      titleMain.append(title, badges);
      top.appendChild(titleMain);

      const meta = document.createElement("div");
      meta.className = "passenger-match-meta";
      const details = [
        ["cliente", "Cliente", passenger.clienteLabel],
        ["telefone", "Telefone", passenger.telefone],
        ["email", "Email", passenger.email],
        ...(isImportMode ? [] : [["cr", "CR", passenger.cr]]),
        ["departamento", "Departamento", passenger.departamento]
      ].filter(([, , value]) => Boolean(value));

      if (!isImportMode && details.length) {
        details.forEach(([key, label, value]) => {
          const detail = document.createElement("span");
          detail.className = "passenger-match-detail";
          detail.classList.toggle("is-match", reasonMap.has(key));
          const detailLabel = document.createElement("small");
          detailLabel.textContent = label;
          const detailValue = document.createElement("b");
          detailValue.textContent = value;
          detailValue.title = value;
          detail.append(detailLabel, detailValue);
          if (reasonMap.has(key)) {
            const reason = document.createElement("span");
            reason.className = "passenger-match-field-reason";
            reason.textContent = reasonMap.get(key);
            detail.appendChild(reason);
          }
          meta.appendChild(detail);
        });
      } else if (!isImportMode) {
        const emptyDetail = document.createElement("span");
        emptyDetail.className = "passenger-match-empty";
        emptyDetail.textContent = "Sem contato cadastrado";
        meta.appendChild(emptyDetail);
      }

      const reasons = buildPassengerMatchReasonChips(candidate.reasons || []);
      main.appendChild(top);
      if (!isImportMode) {
        main.appendChild(meta);
        if (reasons) main.appendChild(reasons);
      }
      if (isImportMode) {
        const compare = document.createElement("div");
        compare.className = "passenger-match-import-compare";
        renderImportedPassengerComparisonPreview(compare, context.importedPassenger, passenger);
        main.appendChild(compare);
      }
      item.append(main);
      el.passengerMatchList.appendChild(item);
    });
  }

  function handlePassengerMatchListAction(event) {
    const action = event.target.closest("[data-passenger-match-action]");
    if (!action) return;
    if (action.dataset.passengerMatchAction === "select-candidate") {
      if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      if (passengerMatchContext) {
        passengerMatchContext.selectedPassengerId = cleanGuid(action.dataset.passengerId || "");
        renderPassengerMatchList(passengerMatchCandidates || []);
      }
      return;
    }
    if (action.dataset.passengerMatchAction === "use-existing") {
      resolvePassengerMatchReview({
        action: "use-existing",
        passengerId: action.dataset.passengerId || ""
      });
    }
  }

  function isPassengerMatchSelectionMode(context = passengerMatchContext || {}) {
    return context.mode === "import";
  }

  function buildPassengerMatchReasonChips(reasons = []) {
    const uniqueReasons = Array.from(new Set(reasons.filter(Boolean))).slice(0, 4);
    if (!uniqueReasons.length) return null;
    const wrap = document.createElement("div");
    wrap.className = "passenger-match-reasons";
    uniqueReasons.forEach((reason) => {
      const chip = document.createElement("span");
      chip.className = "passenger-match-chip";
      chip.textContent = reason;
      wrap.appendChild(chip);
    });
    return wrap;
  }

  function buildPassengerMatchBadge(label, tone = "neutral") {
    const badge = document.createElement("span");
    badge.className = `passenger-match-badge is-${tone}`;
    badge.textContent = label;
    return badge;
  }

  function passengerMatchStrengthLabel(score = 0) {
    if (score >= 120) return "Sinal forte";
    if (score >= 80) return "Sinal medio";
    return "Sinal fraco";
  }

  function passengerMatchStrengthTone(score = 0) {
    if (score >= 120) return "strong";
    if (score >= 80) return "medium";
    return "weak";
  }

  function getPassengerMatchReasonMap(reasons) {
    const fields = new Map();
    (reasons || []).forEach((reason) => {
      const text = normalize(reason);
      if (text.includes("nome")) fields.set("nome", reason);
      if (text.includes("telefone")) fields.set("telefone", reason);
      if (text.includes("email") || text.includes("e-mail")) fields.set("email", reason);
      if (text.includes("cliente")) fields.set("cliente", reason);
      if (text.includes("cr")) fields.set("cr", reason);
      if (text.includes("departamento")) fields.set("departamento", reason);
    });
    return fields;
  }

  async function ensureXlsxLibrary() {
    if (window.XLSX) return window.XLSX;
    if (xlsxLibraryLoadPromise) return xlsxLibraryLoadPromise;

    const source = document.getElementById(XLSX_SOURCE_ELEMENT_ID);
    const inlineSource = source?.textContent || "";
    if (inlineSource.trim()) {
      xlsxLibraryLoadPromise = new Promise((resolve, reject) => {
        try {
          const script = document.createElement("script");
          script.text = inlineSource;
          document.head.appendChild(script);
          if (window.XLSX) {
            resolve(window.XLSX);
          } else {
            reject(new Error("Biblioteca XLSX nao inicializou."));
          }
        } catch (error) {
          reject(error);
        }
      }).catch((error) => {
        xlsxLibraryLoadPromise = null;
        throw error;
      });
      return xlsxLibraryLoadPromise;
    }

    xlsxLibraryLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "vendor/xlsx.full.min.js";
      script.async = true;
      script.onload = () => {
        if (window.XLSX) {
          resolve(window.XLSX);
        } else {
          reject(new Error("Biblioteca XLSX nao inicializou."));
        }
      };
      script.onerror = () => reject(new Error("Falha ao carregar vendor/xlsx.full.min.js."));
      document.head.appendChild(script);
    }).catch((error) => {
      xlsxLibraryLoadPromise = null;
      throw error;
    });
    return xlsxLibraryLoadPromise;
  }

  function isXlsxFile(file) {
    const name = String(file?.name || "").toLowerCase();
    return Boolean(file) && name.endsWith(".xlsx");
  }

  function eventHasFiles(event) {
    return [...(event.dataTransfer?.types || [])].includes("Files");
  }

  function getDroppedXlsxFile(event) {
    return [...(event.dataTransfer?.files || [])].find(isXlsxFile) || null;
  }

  function canStartXlsxImport() {
    if (!window.XlsxImportCore) {
      return { ok: false, message: "Leitor XLSX não carregado. Verifique os scripts do web resource.", type: "invalid" };
    }
    if (!state.isNew) {
      return { ok: false, message: "Importação XLSX só cria novos serviços. Abra uma tela nova para importar.", type: "blocked" };
    }
    if (state.isNew && hasPrimaryDraftChanges()) {
      return { ok: false, message: "Finalize o agendamento principal antes de importar novos serviços.", type: "blocked" };
    }
    if (hasImportedServicesDraft()) {
      return { ok: false, message: "Já existe uma importação em revisão. Limpe o formulário antes de enviar outro XLSX.", type: "blocked" };
    }
    return { ok: true, message: "Solte o arquivo XLSX para importar", type: "ready" };
  }

  function updateXlsxDropOverlay(type = "ready", message = "Solte o arquivo XLSX para importar") {
    const classType = type === "blocked" ? "blocked" : type === "invalid" ? "invalid" : "ready";
    const nextState = `${classType}|${message}`;
    if (xlsxDropOverlayState === nextState && el.importDropOverlay && !el.importDropOverlay.hidden) return;
    xlsxDropOverlayState = nextState;
    document.body.classList.remove(...XLSX_DROP_CLASS_NAMES);
    el.importDropOverlayCard?.classList.remove("is-ready", "is-invalid", "is-blocked");

    document.body.classList.add("is-import-dragging", `is-import-drag-${classType}`);
    el.importDropOverlayCard?.classList.add(`is-${classType}`);
    if (el.importDropOverlay) el.importDropOverlay.hidden = false;
    if (el.importDropOverlayTitle) el.importDropOverlayTitle.textContent = message;
    if (el.importDropOverlayHint) {
      el.importDropOverlayHint.textContent = classType === "ready"
        ? "Ao soltar, a revisão de importação abre automaticamente."
        : "Use um arquivo .xlsx em uma tela nova e sem rascunho preenchido.";
    }
  }

  function hideXlsxDropOverlay() {
    xlsxImportDragDepth = 0;
    xlsxDropOverlayState = "";
    document.body.classList.remove(...XLSX_DROP_CLASS_NAMES);
    el.importDropOverlayCard?.classList.remove("is-ready", "is-invalid", "is-blocked");
    if (el.importDropOverlay) el.importDropOverlay.hidden = true;
  }

  function previewXlsxDrop(event, options = {}) {
    const guard = canStartXlsxImport();
    if (!guard.ok) {
      updateXlsxDropOverlay(guard.type, guard.message);
      return guard;
    }
    if (options.validateFile && event.dataTransfer?.files?.length && !getDroppedXlsxFile(event)) {
      const invalid = { ok: false, message: "Arquivo inválido. Solte um .xlsx.", type: "invalid" };
      updateXlsxDropOverlay(invalid.type, invalid.message);
      return invalid;
    }
    updateXlsxDropOverlay("ready", "Solte o arquivo XLSX para importar");
    return guard;
  }

  function handleXlsxImportDragEnter(event) {
    if (!eventHasFiles(event)) return;
    event.preventDefault();
    xlsxImportDragDepth += 1;
    previewXlsxDrop(event);
  }

  function handleXlsxImportDragOver(event) {
    if (!eventHasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = canStartXlsxImport().ok ? "copy" : "none";
  }

  function handleXlsxImportDragLeave(event) {
    if (!eventHasFiles(event)) return;
    event.preventDefault();
    xlsxImportDragDepth = Math.max(0, xlsxImportDragDepth - 1);
    if (xlsxImportDragDepth === 0) hideXlsxDropOverlay();
  }

  async function handleXlsxImportDrop(event) {
    if (!eventHasFiles(event)) return;
    event.preventDefault();
    const file = getDroppedXlsxFile(event);
    const guard = previewXlsxDrop(event, { validateFile: true });
    hideXlsxDropOverlay();
    if (!guard.ok) {
      toast(guard.message, guard.type === "invalid" ? "error" : "warning", 7000);
      return;
    }
    if (!file) {
      toast("Arquivo inválido. Solte um .xlsx.", "error", 7000);
      return;
    }
    await processXlsxImportFile(file);
  }

  async function openXlsxImportPicker() {
    const guard = canStartXlsxImport();
    if (!guard.ok) {
      toast(guard.message, guard.type === "invalid" ? "error" : "warning", 8000);
      return;
    }
    setLoading(true);
    try {
      await ensureXlsxLibrary();
      el.xlsxImportInput?.click();
    } catch (error) {
      console.error(error);
      toast(error.message || "Falha ao carregar leitor XLSX.", "error", 8000);
    } finally {
      setLoading(false);
    }
  }

  async function handleXlsxImportFile(event) {
    const file = event.target?.files?.[0];
    if (!file) return;
    if (!isXlsxFile(file)) {
      toast("Arquivo inválido. Selecione um .xlsx.", "error", 7000);
      event.target.value = "";
      return;
    }
    await processXlsxImportFile(file);
    event.target.value = "";
  }

  async function processXlsxImportFile(file) {
    setLoading(true);
    try {
      await ensureXlsxLibrary();
      const rows = await readXlsxPassengersRows(file);
      const review = await buildImportReview(rows, file.name);
      applyImportedExternalStatusRules(review);
      state.importReview = review;
      state.importReviewFilter = importReviewFilters().ALL;
      renderImportReview();
      renderTabBadges();
      setTab("import");
      notifyImportedAutoIgnoredExternalStatuses(review);
      notifyUnknownImportedExternalStatuses(review);
      requestAnimationFrame(() => document.getElementById("tab-panel-import")?.scrollIntoView({ block: "start" }));
    } catch (error) {
      console.error(error);
      toast(error.message || "Falha ao importar XLSX.", "error", 9000);
    } finally {
      setLoading(false);
    }
  }

  async function readXlsxPassengersRows(file) {
    if (!window.XLSX) throw new Error("Biblioteca XLSX não carregada.");
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: "array", cellDates: false });
    const sheetName = workbook.SheetNames.find((name) => normalize(name) === "passengers") || workbook.SheetNames[0];
    if (!sheetName) throw new Error("A planilha não contém abas.");
    const sheet = workbook.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const missing = window.XlsxImportCore.validateImportHeaders(headers);
    if (missing.length) {
      throw new Error(`Planilha fora do padrão. Colunas ausentes: ${missing.join(", ")}.`);
    }
    return rows;
  }

  async function buildImportReview(rows, fileName) {
    const normalizedRows = window.XlsxImportCore.normalizeImportedRows(rows);
    const programs = window.XlsxImportCore.buildImportPrograms(normalizedRows);
    await resolveImportedPassengerMatches(programs);
    await checkImportedProgramDuplicates(programs);
    return {
      fileName,
      rows: normalizedRows,
      rowsCount: normalizedRows.length,
      programs,
      history: { undo: [], redo: [] },
      createdAt: new Date().toISOString()
    };
  }

  function cloneImportReviewValue(value) {
    return JSON.parse(JSON.stringify(value ?? null));
  }

  function importReviewHistory() {
    if (!state.importReview) return null;
    if (!state.importReview.history) {
      state.importReview.history = { undo: [], redo: [] };
    }
    if (!Array.isArray(state.importReview.history.undo)) state.importReview.history.undo = [];
    if (!Array.isArray(state.importReview.history.redo)) state.importReview.history.redo = [];
    return state.importReview.history;
  }

  function createImportReviewSnapshot() {
    const review = state.importReview;
    if (!review) return null;
    return {
      programs: cloneImportReviewValue(review.programs || []),
      selectedProgramacao: review.selectedProgramacao || "",
      selectedTrechoKey: review.selectedTrechoKey || "",
      editingTrechoKey: review.editingTrechoKey || "",
      filter: normalizeImportReviewFilter(state.importReviewFilter)
    };
  }

  function areImportReviewSnapshotsEqual(a, b) {
    return JSON.stringify(a || null) === JSON.stringify(b || null);
  }

  function captureImportReviewHistory(label = "Alteração", options = {}) {
    if (!state.importReview || isRestoringImportHistory) return;
    captureGlobalHistoryBeforeMutation(label, options);
    window.setTimeout(() => commitGlobalHistoryChange(label), 0);
    const history = importReviewHistory();
    const snapshot = createImportReviewSnapshot();
    if (!history || !snapshot) return;
    const last = history.undo[history.undo.length - 1]?.snapshot;
    if (areImportReviewSnapshotsEqual(last, snapshot)) return;
    history.undo.push({ label, snapshot });
    if (history.undo.length > IMPORT_REVIEW_HISTORY_LIMIT) history.undo.shift();
    history.redo = [];
    renderGlobalImportHistoryControls();
  }

  function restoreImportReviewSnapshot(snapshot) {
    if (!state.importReview || !snapshot) return;
    state.importReview.programs = cloneImportReviewValue(snapshot.programs || []);
    state.importReview.selectedProgramacao = snapshot.selectedProgramacao || "";
    state.importReview.selectedTrechoKey = snapshot.selectedTrechoKey || "";
    state.importReview.editingTrechoKey = snapshot.editingTrechoKey || "";
    state.importReviewFilter = normalizeImportReviewFilter(snapshot.filter);
  }

  function closeImportedPassengerPopupWithoutSave() {
    if (!activeImportedPassengerEditRef) return;
    closeAllCustomSelects();
    if (el.passengerEditOverlay) el.passengerEditOverlay.hidden = true;
    if (el.passengerEditFields) el.passengerEditFields.replaceChildren();
    activeImportedPassengerEditRef = null;
    passengerEditEnabled = false;
    setPassengerEditStatus("", "");
  }

  function flushImportedPassengerEditBeforeHistory() {
    if (!activeImportedPassengerEditRef) return;
    flushPassengerEditSaves();
    closeImportedPassengerPopupWithoutSave();
  }

  function undoImportReviewChange() {
    if (!state.importReview) {
      toast("Sem histórico da importação para desfazer.", "warning", 2800);
      return false;
    }
    flushImportedPassengerEditBeforeHistory();
    const history = importReviewHistory();
    if (!history?.undo?.length) {
      toast("Nada para voltar na importação.", "warning", 3000);
      return false;
    }
    const current = createImportReviewSnapshot();
    const previous = history.undo.pop();
    if (current) history.redo.push({ label: previous.label, snapshot: current });
    isRestoringImportHistory = true;
    restoreImportReviewSnapshot(previous.snapshot);
    isRestoringImportHistory = false;
    showImportTabForHistoryFocus();
    renderImportReviewPreservingGallery();
    notifyImportHistoryToast("Voltou", previous, focusImportHistoryTarget(previous.snapshot));
    renderGlobalImportHistoryControls();
    return true;
  }

  function redoImportReviewChange() {
    if (!state.importReview) {
      toast("Sem histórico da importação para refazer.", "warning", 2800);
      return false;
    }
    flushImportedPassengerEditBeforeHistory();
    const history = importReviewHistory();
    if (!history?.redo?.length) {
      toast("Nada para avançar na importação.", "warning", 3000);
      return false;
    }
    const current = createImportReviewSnapshot();
    const next = history.redo.pop();
    if (current) history.undo.push({ label: next.label, snapshot: current });
    isRestoringImportHistory = true;
    restoreImportReviewSnapshot(next.snapshot);
    isRestoringImportHistory = false;
    showImportTabForHistoryFocus();
    renderImportReviewPreservingGallery();
    notifyImportHistoryToast("Avançou", next, focusImportHistoryTarget(next.snapshot));
    renderGlobalImportHistoryControls();
    return true;
  }

  function notifyImportHistoryToast(actionLabel, entry, focusLabel = "") {
    const label = String(entry?.label || "").trim();
    const focus = focusLabel ? ` Foco: ${focusLabel}.` : "";
    toast(label ? `${actionLabel}: ${label}.${focus}` : `${actionLabel} uma alteração.${focus}`, "success", 3200);
  }

  function showImportTabForHistoryFocus() {
    if (!state.importReview) return;
    state.currentTab = "import";
    el.tabs.forEach((button) => {
      const isActive = button.dataset.tab === "import";
      button.classList.toggle("is-active", isActive);
      button.toggleAttribute("aria-current", isActive);
    });
    el.panels.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === "import"));
  }

  function focusImportHistoryTarget(snapshot) {
    const programacao = snapshot?.selectedProgramacao || state.importReview?.selectedProgramacao || "";
    const trechoKey = snapshot?.selectedTrechoKey || state.importReview?.selectedTrechoKey || "";
    const trecho = findImportedTrecho(programacao, trechoKey);
    const focusLabel = importHistoryFocusLabel(programacao, trecho);
    window.requestAnimationFrame(() => {
      const target = findImportHistoryFocusElement(programacao, trechoKey);
      if (!target) return;
      if (!target.matches?.("button, input, select, textarea, [tabindex]")) target.tabIndex = -1;
      target.scrollIntoView?.({ block: "center", inline: "nearest" });
      target.focus?.({ preventScroll: true });
    });
    return focusLabel;
  }

  function importHistoryFocusLabel(programacao, trecho) {
    if (!programacao && !trecho) return "Importação";
    const when = trecho ? [formatDateInputForDisplay(trecho.dataIso), trecho.horario || "--:--"].filter(Boolean).join(" ") : "";
    return [programacao, when].filter(Boolean).join(" · ") || "Importação";
  }

  function findImportHistoryFocusElement(programacao, trechoKey) {
    if (!el.importReviewPrograms) return null;
    const programSelector = escapeAttributeSelectorValue(programacao);
    const trechoSelector = escapeAttributeSelectorValue(trechoKey);
    return el.importReviewPrograms.querySelector(
      `.import-service-row[data-programacao="${programSelector}"][data-trecho-key="${trechoSelector}"], ` +
      `.import-inspector [data-programacao="${programSelector}"][data-trecho-key="${trechoSelector}"], ` +
      ".import-inspector, .import-service-list"
    );
  }

  function escapeAttributeSelectorValue(value) {
    if (window.CSS?.escape) return window.CSS.escape(String(value || ""));
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\a ");
  }

  function isTextEditingTarget(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = String(target.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return false;
  }

  function captureImportReviewHistoryForEditSession(target, label) {
    if (!target) return;
    if (target.dataset.importHistoryCaptured === "1") return;
    captureImportReviewHistory(label, { includeDerivedPassengerPreferences: false });
    target.dataset.importHistoryCaptured = "1";
  }

  function handleImportReviewFocusOut(event) {
    const target = event.target;
    if (!target?.dataset?.importHistoryCaptured) return;
    delete target.dataset.importHistoryCaptured;
  }

  function shouldHandleImportHistoryShortcut(event) {
    if (event.altKey) return false;
    const key = String(event.key || "").toLowerCase();
    const command = event.ctrlKey || event.metaKey;
    const undo = command && key === "z" && !event.shiftKey;
    const redo = command && (key === "y" || (key === "z" && event.shiftKey));
    if (!undo && !redo) return false;
    if (isTextEditingTarget(event.target)) return false;
    return true;
  }

  function handleImportHistoryShortcut(event) {
    if (!shouldHandleImportHistoryShortcut(event)) return;
    const key = String(event.key || "").toLowerCase();
    const command = event.ctrlKey || event.metaKey;
    const undo = command && key === "z" && !event.shiftKey;
    const redo = command && (key === "y" || (key === "z" && event.shiftKey));
    if (!undo && !redo) return;
    event.preventDefault();
    if (undo) undoGlobalHistoryChange();
    if (redo) redoGlobalHistoryChange();
  }

  function importReviewStatuses() {
    return window.XlsxImportCore?.IMPORT_REVIEW_STATUSES || {
      PENDING: "pending",
      CONFIRMED: "confirmed",
      BLOCKED: "blocked",
      IGNORED: "ignored",
      SAVED: "saved"
    };
  }

  function importReviewFilters() {
    return {
      ALL: "all",
      VALIDATED: "validated",
      PENDING: "pending",
      IGNORED: "ignored"
    };
  }

  function normalizeImportReviewFilter(value) {
    const filters = importReviewFilters();
    return Object.values(filters).includes(value) ? value : filters.ALL;
  }

  function normalizeImportedReviewStatus(trecho) {
    const statuses = importReviewStatuses();
    if (trecho?.savedRecordId && trecho.reviewStatus !== statuses.IGNORED) return statuses.SAVED;
    return Object.values(statuses).includes(trecho?.reviewStatus) ? trecho.reviewStatus : statuses.PENDING;
  }

  function importedTrechoExternalStatuses(trecho) {
    const fromTrecho = Array.isArray(trecho?.statusExternos) ? trecho.statusExternos : [];
    const fromLines = Array.isArray(trecho?.linhasImportadas)
      ? trecho.linhasImportadas.map((line) => line?.statusExterno)
      : [];
    return Array.from(new Set([...fromTrecho, ...fromLines]
      .map((status) => String(status || "").trim())
      .filter(Boolean)));
  }

  function importedExternalStatusKey(status) {
    return normalize(status).replace(/\s+/g, " ");
  }

  function applyImportedExternalStatusRules(review) {
    const statuses = importReviewStatuses();
    const unknown = new Set();
    (review?.programs || []).forEach((program) => {
      (program.trechos || []).forEach((trecho) => {
        const externalStatuses = importedTrechoExternalStatuses(trecho);
        trecho.unknownStatusExternos = [];
        const shouldIgnore = externalStatuses.some((status) => IMPORT_XLSX_AUTO_IGNORE_STATUSES.has(importedExternalStatusKey(status)));
        if (shouldIgnore && normalizeImportedReviewStatus(trecho) !== statuses.SAVED) {
          trecho.reviewStatus = statuses.IGNORED;
          trecho.reviewBlockReason = "Ignorado automaticamente: status XLSX Aguardando prestador.";
          trecho.autoIgnoredByExternalStatus = true;
        }
        externalStatuses.forEach((status) => {
          const key = importedExternalStatusKey(status);
          if (!IMPORT_XLSX_STATUS_OPERATION_MAP[key] && !IMPORT_XLSX_AUTO_IGNORE_STATUSES.has(key)) {
            unknown.add(status);
            trecho.unknownStatusExternos.push(status);
          }
        });
      });
    });
    review.unknownStatusExternos = Array.from(unknown).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function notifyImportedAutoIgnoredExternalStatuses(review) {
    const count = (review?.programs || []).reduce((total, program) => (
      total + (program.trechos || []).filter((trecho) => trecho.autoIgnoredByExternalStatus).length
    ), 0);
    if (!count) return;
    toast(`${count} serviço(s) com status XLSX Aguardando prestador foram ignorados automaticamente.`, "warning", 14000);
  }

  function notifyUnknownImportedExternalStatuses(review) {
    const unknown = review?.unknownStatusExternos || [];
    if (!unknown.length) return;
    toast(`Status XLSX desconhecido: ${unknown.join(", ")}. Fale com o Dev. Estes serviços serão assumidos como Confirmado.`, "warning", 14000);
  }

  function resolveImportedOperationStatusLabel(trecho) {
    const overrideLabel = optionLabel("statusOperacao", trecho?.statusOperacaoValue);
    if (overrideLabel) return overrideLabel;
    const externalStatuses = importedTrechoExternalStatuses(trecho);
    for (const status of externalStatuses) {
      const key = importedExternalStatusKey(status);
      if (IMPORT_XLSX_STATUS_OPERATION_MAP[key]) return IMPORT_XLSX_STATUS_OPERATION_MAP[key];
    }
    return "Confirmado";
  }

  function resolveImportedOperationStatusValue(trecho) {
    return trecho?.statusOperacaoValue
      || findOptionValue("statusOperacao", resolveImportedOperationStatusLabel(trecho))
      || findOptionValue("statusOperacao", "Confirmado")
      || "";
  }

  function importedDataverseStatusHint(trecho) {
    const external = importedTrechoExternalStatuses(trecho);
    const converted = resolveImportedOperationStatusLabel(trecho);
    if (!external.length) return `Sem status Embraer. Envia como ${converted}.`;
    return `Embraer: ${external.join(", ")} -> Dataverse: ${converted}.`;
  }

  function markImportedReviewPending(trecho) {
    const statuses = importReviewStatuses();
    const status = normalizeImportedReviewStatus(trecho);
    if (status !== statuses.CONFIRMED && status !== statuses.BLOCKED && status !== statuses.SAVED) return;
    if (status === statuses.SAVED) trecho.savedRecordId = "";
    window.XlsxImportCore?.markImportedTrechoPending?.(trecho);
    if (!window.XlsxImportCore?.markImportedTrechoPending && trecho) {
      trecho.reviewStatus = statuses.PENDING;
      trecho.reviewBlockReason = "";
    }
  }

  function summarizeCurrentImportTrechos(trechos) {
    if (window.XlsxImportCore?.summarizeImportReviewTrechos) {
      return window.XlsxImportCore.summarizeImportReviewTrechos(trechos);
    }
    const statuses = importReviewStatuses();
    const counts = { pending: 0, confirmed: 0, blocked: 0, ignored: 0, saved: 0 };
    const saveableTrechos = [];
    (trechos || []).forEach((trecho) => {
      const status = normalizeImportedReviewStatus(trecho);
      counts[status] += 1;
      if (status === statuses.CONFIRMED) saveableTrechos.push(trecho);
    });
    const canScheduleConfirmed = saveableTrechos.length > 0 && counts.pending === 0 && counts.blocked === 0;
    return {
      counts,
      saveableTrechos,
      canScheduleConfirmed,
      blockedReason: canScheduleConfirmed ? "" : (counts.pending ? `${counts.pending} trecho(s) pendente(s) de revisão.` : "Nenhum trecho confirmado para agendar.")
    };
  }

  function collectImportReviewRenderMetrics(programs) {
    const statuses = importReviewStatuses();
    const trechos = [];
    const counts = {
      all: 0,
      validated: 0,
      pending: 0,
      ignored: 0,
      duplicated: 0
    };
    (programs || []).forEach((program) => {
      (program?.trechos || []).forEach((trecho) => {
        trechos.push(trecho);
        counts.all += 1;
        const status = normalizeImportedReviewStatus(trecho);
        if (status === statuses.CONFIRMED || status === statuses.SAVED) {
          counts.validated += 1;
        } else if (status === statuses.IGNORED) {
          counts.ignored += 1;
        } else {
          counts.pending += 1;
        }
        if (trecho.duplicatedRecordIds?.length) counts.duplicated += 1;
      });
    });
    return {
      trechos,
      counts
    };
  }

  async function resolveImportedPassengerMatches(programs) {
    const cache = new Map();
    const importClient = getImportClient();
    for (const trecho of programs.flatMap((program) => program.trechos)) {
      for (const passenger of trecho.passageiros) {
        const key = normalize([
          passenger.nome,
          passenger.telefone,
          passenger.email,
          passenger.centroCusto,
          importClient?.id || ""
        ].filter(Boolean).join("|"));
        if (!cache.has(key)) {
          const candidate = importedPassengerCandidate(passenger, importClient);
          const matches = await findPassengerDuplicateCandidates(candidate);
          cache.set(key, matches);
        }
        const candidates = cache.get(key) || [];
        const selected = selectImportedExistingMatch(candidates, importClient);
        passenger.matchCandidates = candidates;
        if (!passenger.nome) {
          passenger.matchStatus = "invalid";
          passenger.matchMessage = "Nome vazio.";
        } else if (selected) {
          mergePassengerRecords([selected.passenger]);
          passenger.matchMessage = "Cadastro existente selecionado automaticamente.";
          applyExistingPassengerToImportedPassenger(passenger, selected.passenger, passenger.matchMessage);
        } else if (candidates.length) {
          passenger.matchStatus = "ambiguous";
          passenger.matchMessage = "Cadastro parecido encontrado.";
        } else {
          passenger.matchStatus = "create-new";
          passenger.matchMessage = "Será criado no Banco de Dados.";
        }
      }
    }
  }

  function importedPassengerCandidate(passenger, importClient = getImportClient()) {
    return {
      label: passenger.nome || "",
      telefone: passenger.telefone || "",
      email: passenger.email || "",
      cr: "",
      departamento: "",
      clienteId: importClient?.id || "",
      clienteLabel: importClient?.label || CONFIG.importDefaults.clienteLabel || ""
    };
  }

  function getImportClient() {
    const configuredId = cleanGuid(CONFIG.importDefaults.clienteId || "");
    const configuredLabel = CONFIG.importDefaults.clienteLabel || "Embraer";
    if (configuredId) {
      const existing = state.clientes.find((cliente) => sameId(cliente.id, configuredId));
      return {
        id: configuredId,
        label: existing?.label || configuredLabel
      };
    }
    const wanted = normalize(configuredLabel);
    return state.clientes.find((cliente) => normalize(cliente.label) === wanted)
      || state.clientes.find((cliente) => normalize(cliente.label).includes(wanted))
      || null;
  }

  function requireImportClient() {
    const importClient = getImportClient();
    if (!importClient?.id) {
      throw new Error("Cliente Embraer não encontrado. Configure CONFIG.importDefaults.clienteId com o GUID real do Dataverse.");
    }
    return importClient;
  }

  function selectImportedExistingMatch(candidates, importClient = getImportClient()) {
    return (candidates || []).find((candidate) => {
      const reasons = (candidate.reasons || []).map(normalize);
      const sameClient = importClient?.id && candidate.passenger?.clienteId && sameId(candidate.passenger.clienteId, importClient.id);
      if (importClient?.id && !sameClient) return false;
      const exactContact = reasons.includes("telefone igual") || reasons.includes("email igual");
      const exactName = reasons.includes("nome quase igual");
      const identicalNameWithoutImportedContact = candidate.candidateMissingContact && reasons.includes("nome igual");
      return sameClient && ((exactName && exactContact) || identicalNameWithoutImportedContact);
    }) || null;
  }

  async function checkImportedProgramDuplicates(programs) {
    const ids = Array.from(new Set((programs || []).map((program) => program.programacao).filter(Boolean)));
    const candidateMap = new Map();
    if (!ids.length) return candidateMap;
    const tenarisIdField = importedReservaTenarisIdField();

    if (!state.xrm || state.mockMode) {
      const db = getMockDb();
      ids.forEach((programacao) => {
        const rows = db.reservas
          .filter((item) => String(item[tenarisIdField] || item[CONFIG.fields.reserva.idExterno] || item.programacao || "") === programacao)
          .map(importedDuplicateCandidateFromReserva);
        if (rows.length) candidateMap.set(programacao, rows);
      });
    } else {
      const f = CONFIG.fields.reserva;
      for (let index = 0; index < ids.length; index += 15) {
        const batch = ids.slice(index, index + 15);
        const filter = batch.map((id) => `${tenarisIdField} eq '${escapeODataString(id)}'`).join(" or ");
        try {
          const select = [f.id, tenarisIdField, f.idExterno, f.dataSaida, f.trajeto, f.enderecoView, f.destino, f.paxView].join(",");
          const rows = await retrieveAll(CONFIG.entities.reserva, `?$select=${select}&$filter=${filter}`);
          rows.forEach((row) => {
            const key = row[tenarisIdField] || row[f.idExterno];
            if (!candidateMap.has(key)) candidateMap.set(key, []);
            candidateMap.get(key).push(importedDuplicateCandidateFromReserva(row));
          });
        } catch (error) {
          console.warn("Falha ao validar duplicidade de serviço importado", error);
          toast("Não consegui validar duplicidade dos serviços importados. Confirme os campos da reserva no Dataverse.", "warning", 9000);
          break;
        }
      }
    }

    programs.forEach((program) => {
      const candidates = candidateMap.get(program.programacao) || [];
      const exactIds = [];
      const hasAnyExistingServiceInPg = candidates.length > 0;
      program.trechos.forEach((trecho) => {
        const matches = candidates
          .map((candidate) => scoreImportedTrechoDuplicate(trecho, candidate))
          .filter((match) => match.level)
          .sort((a, b) => b.score - a.score);
        const exactMatches = matches.filter((match) => match.level === "exact");
        const possibleMatches = matches.filter((match) => match.level === "possible");
        const strongPossibleMatches = possibleMatches.filter(isStrongImportedPossibleDuplicateMatch);
        const weakPossibleMatches = possibleMatches.filter((match) => !isStrongImportedPossibleDuplicateMatch(match));
        const autoIgnoredMatches = hasAnyExistingServiceInPg
          ? [...candidates].map((candidate) => ({
            recordId: candidate.recordId || "",
            score: 999,
            level: "exact",
            reasons: ["mesma PG (ID Tenaris já existe no Dataverse)"]
          }))
          : [...exactMatches, ...strongPossibleMatches].sort((a, b) => b.score - a.score);
        trecho.duplicateMatches = autoIgnoredMatches;
        trecho.possibleDuplicateMatches = weakPossibleMatches;
        trecho.duplicatedRecordIds = autoIgnoredMatches.map((match) => match.recordId).filter(Boolean);
        exactIds.push(...trecho.duplicatedRecordIds);
        if (trecho.duplicatedRecordIds.length) {
          const statuses = importReviewStatuses();
          const status = normalizeImportedReviewStatus(trecho);
          if (status !== statuses.IGNORED && status !== statuses.SAVED) {
            trecho.reviewStatus = statuses.IGNORED;
            trecho.reviewBlockReason = hasAnyExistingServiceInPg
              ? "Serviço ignorado automaticamente: já existe serviço com esta PG (ID Tenaris) no Dataverse."
              : `Serviço repetido provável: ${formatImportedDuplicateMatch(exactMatches[0] || strongPossibleMatches[0])}.`;
            trecho.autoIgnoredByDuplicate = true;
          }
        } else {
          trecho.autoIgnoredByDuplicate = false;
        }
      });
      program.duplicatedRecordIds = Array.from(new Set(exactIds));
    });
    return candidateMap;
  }

  function importedDuplicateCandidateFromReserva(row) {
    const f = CONFIG.fields.reserva;
    const tenarisIdField = importedReservaTenarisIdField();
    return {
      recordId: cleanGuid(row?.[f.id] || row?.id || row?.recordId || ""),
      programacao: row?.[tenarisIdField] || row?.[f.idExterno] || row?.programacao || "",
      dataSaida: row?.[f.dataSaida] || row?.dataSaida || "",
      trajeto: row?.[f.trajeto] || row?.trajeto || "",
      enderecoView: row?.[f.enderecoView] || row?.enderecoView || "",
      destino: row?.[f.destino] || row?.destino || "",
      paxView: row?.[f.paxView] || row?.paxView || ""
    };
  }

  function scoreImportedTrechoDuplicate(trecho, candidate) {
    return window.XlsxImportCore?.scoreImportedTrechoDuplicate?.(trecho, candidate) || {
      recordId: candidate?.recordId || candidate?.id || "",
      score: 0,
      level: "",
      reasons: []
    };
  }

  function importedReservaTenarisIdField() {
    return CONFIG.fields.reserva.idExterno;
  }

  function isStrongImportedPossibleDuplicateMatch(match) {
    if (!match || match.level !== "possible") return false;
    const reasons = match.reasons || [];
    const hasTimeSignal = reasons.includes("mesmo horario") || reasons.includes("horario proximo");
    const hasPassengerSignal = reasons.includes("mesmos passageiros") || reasons.includes("passageiros parecidos");
    const hasRouteSignal = reasons.includes("mesmo destino")
      || reasons.includes("destino parecido")
      || reasons.includes("trajeto parecido")
      || reasons.includes("mesmo endereco de saida")
      || reasons.includes("endereco de saida parecido");
    return (match.score >= 62 && hasTimeSignal && hasPassengerSignal) || (hasTimeSignal && hasPassengerSignal && hasRouteSignal);
  }

  function renderImportReview() {
    renderGlobalImportHistoryControls();
    const review = state.importReview;
    const importedPrograms = review?.programs || [];
    const metrics = collectImportReviewRenderMetrics(importedPrograms);
    const trechos = metrics.trechos;
    const activeFilter = normalizeImportReviewFilter(state.importReviewFilter);
    state.importReviewFilter = activeFilter;
    const visiblePrograms = getImportProgramsByReviewFilter(importedPrograms, activeFilter);
    const reviewState = summarizeCurrentImportTrechos(trechos);
    const rowCount = importReviewRowCount(review);
    const hasImportData = importedPrograms.length > 0 && rowCount > 0;
    if (!el.importReviewPrograms) return;

    if (!hasImportData) {
      if (el.importReviewEmpty) el.importReviewEmpty.hidden = false;
      if (el.importReviewSummary) el.importReviewSummary.textContent = "Importe um XLSX para revisar serviços por PG e trecho.";
      el.importReviewStats?.replaceChildren();
      el.importReviewIssues?.replaceChildren();
      if (el.importReviewIssues) el.importReviewIssues.hidden = true;
      el.importReviewPrograms.replaceChildren();
      return;
    }
    if (el.importReviewEmpty) el.importReviewEmpty.hidden = true;
    const importClient = getImportClient();
    const summary = [];

    if (hasImportData) {
      summary.push(`${rowCount} linha(s)`);
      summary.push(`${review.programs.length} PG(s)`);
      summary.push(`${metrics.counts.all} trecho(s)`);
      summary.push(`${reviewState.counts.confirmed} confirmado(s)`);
      summary.push(`${reviewState.counts.pending} pendente(s)`);
      summary.push(`${reviewState.counts.blocked} bloqueado(s)`);
      summary.push(`${reviewState.counts.ignored} ignorado(s)`);
      summary.push(`Cliente: ${importClient?.label || CONFIG.importDefaults.clienteLabel}`);
      renderImportReviewFilters({
        all: metrics.counts.all,
        validated: metrics.counts.validated,
        pending: metrics.counts.pending,
        ignored: metrics.counts.ignored
      }, activeFilter);
      renderImportGlobalIssues(trechos);
    } else {
      el.importReviewStats?.replaceChildren();
      el.importReviewIssues?.replaceChildren();
      if (el.importReviewIssues) el.importReviewIssues.hidden = true;
    }
    summary.push(`Arquivo: ${review.fileName}.`);
    if (metrics.counts.duplicated) summary.push(`${metrics.counts.duplicated} serviços repetidos.`);
    el.importReviewSummary.textContent = summary.join("  ");

    el.importReviewPrograms.replaceChildren();
    if (hasImportData) {
      el.importReviewPrograms.appendChild(buildImportWorkbench(visiblePrograms, {
        activeFilter
      }));
    }
    initializeImportReviewControls();
    syncDateTimeFieldRowWidths();
    syncImportedPassengerNameColumnWidths();
  }

  function initializeImportReviewControls() {
    el.importReviewPrograms?.querySelectorAll("select").forEach((select) => {
      ensureCustomSelect(select);
      refreshCustomSelect(select);
    });
  }

  function getImportProgramsByReviewFilter(programs, filter) {
    const filters = importReviewFilters();
    if (filter === filters.ALL) return sortImportProgramsByServiceDateTime(programs || []);
    if (filter === filters.PENDING) return getImportProgramsForReview(programs);
    return sortImportProgramsByServiceDateTime((programs || []).map((program) => {
      const trechos = (program.trechos || []).filter((trecho) => {
        const status = normalizeImportedReviewStatus(trecho);
        if (filter === filters.VALIDATED) return isValidatedImportedTrecho(trecho);
        if (filter === filters.IGNORED) return status === importReviewStatuses().IGNORED;
        return false;
      });
      return { ...program, trechos };
    }).filter((program) => program.trechos.length > 0));
  }

  function getImportProgramsForReview(programs) {
    const statuses = importReviewStatuses();
    return sortImportProgramsByServiceDateTime((programs || []).map((program) => {
      const trechos = (program.trechos || []).filter(
        (trecho) => {
          const status = normalizeImportedReviewStatus(trecho);
          return status !== statuses.CONFIRMED && status !== statuses.SAVED && status !== statuses.IGNORED;
        }
      );
      return {
        ...program,
        trechos
      };
    }).filter((program) => program.trechos.length > 0));
  }

  function sortImportProgramsByServiceDateTime(programs) {
    return [...(programs || [])]
      .map((program) => {
        const sortedTrechos = sortImportedTrechosByServiceDateTime(program?.trechos || []);
        return {
          program: {
            ...program,
            trechos: sortedTrechos
          },
          firstServiceTimestamp: importedTrechoServiceTimestamp(sortedTrechos[0])
        };
      })
      .sort((a, b) => compareImportProgramsByFirstServiceDateTime(
        a.program,
        b.program,
        a.firstServiceTimestamp,
        b.firstServiceTimestamp
      ))
      .map((entry) => entry.program);
  }

  function sortImportedTrechosByServiceDateTime(trechos) {
    return [...(trechos || [])].sort((a, b) => compareImportedTrechosByServiceDateTime(a, b));
  }

  function compareImportProgramsByFirstServiceDateTime(programA, programB, firstA = importProgramFirstServiceTimestamp(programA), firstB = importProgramFirstServiceTimestamp(programB)) {
    if (firstA !== firstB) return firstA - firstB;
    return String(programA?.programacao || "").localeCompare(String(programB?.programacao || ""), "pt-BR");
  }

  function importProgramFirstServiceTimestamp(program) {
    return importedTrechoServiceTimestamp((program?.trechos || [])[0]);
  }

  function compareImportedTrechosByServiceDateTime(trechoA, trechoB) {
    const stampA = importedTrechoServiceTimestamp(trechoA);
    const stampB = importedTrechoServiceTimestamp(trechoB);
    if (stampA !== stampB) return stampA - stampB;
    return String(trechoA?.key || "").localeCompare(String(trechoB?.key || ""), "pt-BR");
  }

  function importedTrechoServiceTimestamp(trecho) {
    if (!trecho) return Number.POSITIVE_INFINITY;
    const cacheKey = `${trecho.dataIso || ""}|${trecho.horario || ""}`;
    const cached = importedTrechoTimestampCache.get(trecho);
    if (cached?.key === cacheKey) return cached.value;
    const localDateTime = importedTrechoDateTimeLocal(trecho);
    const parsed = parseDateTimeInputValue(localDateTime);
    const value = parsed ? parsed.getTime() : Number.POSITIVE_INFINITY;
    importedTrechoTimestampCache.set(trecho, { key: cacheKey, value });
    return value;
  }

  function isValidatedImportedTrecho(trecho) {
    const statuses = importReviewStatuses();
    const status = normalizeImportedReviewStatus(trecho);
    return status === statuses.CONFIRMED || status === statuses.SAVED;
  }

  function getValidatedImportTrechos(programs) {
    return (programs || []).flatMap((program) => (
      (program.trechos || [])
        .filter(isValidatedImportedTrecho)
        .map((trecho) => ({ program, trecho }))
    ));
  }

  function getIgnoredImportTrechos(programs) {
    const statuses = importReviewStatuses();
    return (programs || []).flatMap((program) => (
      (program.trechos || [])
        .filter((trecho) => normalizeImportedReviewStatus(trecho) === statuses.IGNORED)
        .map((trecho) => ({ program, trecho }))
    ));
  }

  function hasText(value) {
    if (typeof value === "boolean") return value;
    if (Array.isArray(value) || typeof value === "object") return false;
    return String(value ?? "").trim().length > 0;
  }

  function hasCommonDraftContent(snapshot) {
    if (!snapshot) return false;
    if (state.draftCommonEdited) return true;
    const fields = snapshot?.fields || {};
    const hasPassengers = (snapshot?.selectedPassengers || []).some((item) => item?.passageiro || item?.guid || hasText(item?.telefone) || hasText(item?.enderecoEditado));
    const hasAddressDraft = (snapshot?.enderecoRascunho || []).some((item) => hasText(item?.endereco));
    const hasLookupDraft = hasText(fields.cliente) || hasText(fields.solicitante) || hasText(fields.motorista);
    return hasPassengers || hasAddressDraft || hasLookupDraft || hasText(fields.trajeto) || hasText(fields.destino) || hasText(fields.observacao)
      || hasText(fields.tipoServico) || hasText(fields.tipoVeiculo) || hasText(fields.formaPagamento) || hasText(fields.cr) || hasText(fields.cotacao) || hasText(fields.valorReceber);
  }

  function renderImportReviewFilters(counts, activeFilter) {
    if (!el.importReviewStats) return;
    const filters = importReviewFilters();
    el.importReviewStats.replaceChildren(
      buildImportReviewFilterButton("Todos", filters.ALL, counts.all, activeFilter),
      buildImportReviewFilterButton("Validados", filters.VALIDATED, counts.validated, activeFilter),
      buildImportReviewFilterButton("Pendentes", filters.PENDING, counts.pending, activeFilter),
      buildImportReviewFilterButton("Ignorados", filters.IGNORED, counts.ignored, activeFilter)
    );
  }

  function renderGlobalImportHistoryControls() {
    if (!el.globalImportHistoryActions) return;
    const history = state.globalHistory;
    const buttons = [
      buildImportHistoryButton(
        "Desfazer",
        "undo",
        !(history?.undo?.length),
        "Ctrl+Z",
        history?.undo?.length ? "Desfazer última alteração do app (Ctrl+Z)" : "Nada para desfazer neste formulário"
      ),
      buildImportHistoryButton(
        "Refazer",
        "redo",
        !(history?.redo?.length),
        "Ctrl+Y / Ctrl+Shift+Z",
        history?.redo?.length ? "Refazer última alteração do app (Ctrl+Y ou Ctrl+Shift+Z)" : "Nada para refazer neste formulário"
      )
    ];
    if (state.isNew) {
      buttons.push(buildImportHistoryButton("Limpar", "clear", false, "", "Apagar todos os dados do formulário e recomeçar"));
    }
    el.globalImportHistoryActions.replaceChildren(...buttons);
  }

  function buildImportHistoryButton(label, action, disabled, shortcut, tooltip) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `import-history-button import-history-button--${action}`;
    button.dataset.importHistoryAction = action;
    button.disabled = !!disabled;
    button.title = tooltip || (shortcut ? `${label} (${shortcut})` : label);
    button.setAttribute("aria-label", tooltip || label);
    if (shortcut) button.setAttribute("aria-keyshortcuts", shortcut);
    button.innerHTML = `${importHistoryIconSvg(action)}<span class="import-history-label">${label}</span>${shortcut ? `<kbd class="import-history-shortcut">${shortcut}</kbd>` : ""}`;
    return button;
  }

  function importHistoryIconSvg(action) {
    const path = action === "undo"
      ? '<path d="M9 14 4 9l5-5"></path><path d="M4 9h10a6 6 0 0 1 0 12h-1"></path>'
      : action === "redo"
        ? '<path d="m15 14 5-5-5-5"></path><path d="M20 9H10a6 6 0 0 0 0 12h1"></path>'
        : '<path d="M9 6a3 3 0 0 1 6 0"></path><path d="M4 8h16"></path><path d="M7 11v6a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3v-6"></path>';
    return `<svg class="import-history-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
  }

  async function clearAllFormsCompletely() {
    if (!state.isNew) {
      renderGlobalImportHistoryControls();
      toast("Limpar formulário só está disponível em novo serviço.", "warning", 5000);
      return;
    }
    const approved = await requestClearAllFormsConfirmation();
    if (!approved) return;
    setLoading(true);
    try {
      if (el.passengerPickerOverlay && !el.passengerPickerOverlay.hidden) {
        closePassengerPicker();
      }
      if (el.activationGuardOverlay && !el.activationGuardOverlay.hidden) {
        closeActivationGuard();
      }
      closeImportedPassengerPopupWithoutSave();
      closePassengerPreview();
      if (el.passengerMatchOverlay && !el.passengerMatchOverlay.hidden) {
        resolvePassengerMatchReview({ action: "cancel" });
      }
      state.pendingSaveContext = null;
      state.importReview = null;
      state.importReviewFilter = importReviewFilters().ALL;
      state.importDraftEditState = { common: false, retorno: false };
      state.activationDraftEditState = { return: false, repeat: false };
      state.activationGuardDrafts = [];
      state.scheduleDrafts = [];
      state.draftCommonEdited = false;
      state.record = null;
      state.relacoes = [];
      state.enderecoPersonalizadoAtivo = false;
      state.selectedPassengers = [emptyPassenger(1)];
      state.enderecoRascunho = [{ ordem: 1, endereco: "" }];
      state.obs = { motorista: "", interna: "", final: "", passageiro: "" };
      state.obsRet = { motorista: "", interna: "", final: "", passageiro: "" };
      state.obsAtual = "motorista";
      state.retObsAtual = "motorista";
      state.globalHistory = { undo: [], redo: [], pending: null };
      passengerMatchCandidates = [];
      if (el.xlsxImportInput) el.xlsxImportInput.value = "";
      clearSaveLog();
      clearDraftSnapshot(false);

      clearPassengerCreateForm();
      closePassengerPicker();
      closePassengerEditPopup();
      clearValidationStates();
      hydrateForm();
      setFieldValue(el.agendarRetorno, false);
      setFieldValue(el.repetirServico, false);
      setFieldValue(el.retornoData, "");
      setSelectValue(el.retornoHora, "");
      setSelectValue(el.retornoMinuto, "");
      setFieldValue(el.retornoEndereco, "");
      el.retornoEndereco.dataset.auto = "";
      setFieldValue(el.retornoDestino, "");
      el.retornoDestino.dataset.auto = "";
      setFieldValue(el.retornoObservacao, "");
      setFieldValue(el.frequenteInicio, "");
      setFieldValue(el.frequenteFim, "");
      setSelectValue(el.frequenteTipo, "");
      setFieldValue(el.enderecoPersonalizado, "");
      setFieldValue(el.contabilizarFds, true);
      renderImportReview();
      renderGlobalImportHistoryControls();
      renderScheduleDrafts();
      renderPassengers();
      renderRiskPanel();
      renderTabBadges();
      setTab("details");
      renderDraftStatus("Formulário limpo.");
      toast("Dados removidos. Formulário reaberto do zero.", "success", 4500);
    } catch (error) {
      console.error(error);
      toast(error.message || "Falha ao limpar o formulário.", "error", 9000);
    } finally {
      setLoading(false);
    }
  }

  function requestClearAllFormsConfirmation() {
    if (!el.clearAllFormsOverlay || !el.clearAllFormsCancel || !el.clearAllFormsConfirm) return Promise.resolve(true);
    return new Promise((resolve) => {
      clearAllFormsConfirmationResolve = resolve;
      el.clearAllFormsOverlay.hidden = false;
      requestAnimationFrame(() => {
        el.clearAllFormsCancel?.focus();
      });
    });
  }

  function resolveClearAllFormsConfirmation(confirmed) {
    const resolve = clearAllFormsConfirmationResolve;
    clearAllFormsConfirmationResolve = null;
    if (el.clearAllFormsOverlay) el.clearAllFormsOverlay.hidden = true;
    resolve?.(!!confirmed);
  }

  function handleGlobalImportHistoryAction(event) {
    const button = event.target.closest("[data-import-history-action]");
    if (!button || !el.globalImportHistoryActions?.contains(button)) return;
    const action = button.dataset.importHistoryAction;
    if (action === "undo") return undoGlobalHistoryChange();
    if (action === "redo") return redoGlobalHistoryChange();
    if (action === "clear") return clearAllFormsCompletely();
  }

  function buildImportReviewFilterButton(label, filter, count, activeFilter) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "import-filter";
    button.classList.toggle("is-active", filter === activeFilter);
    button.dataset.importFilter = filter;
    button.setAttribute("aria-pressed", String(filter === activeFilter));
    const text = document.createElement("span");
    text.className = "import-filter-label";
    text.textContent = label;
    const value = document.createElement("span");
    value.className = "import-filter-count";
    value.textContent = String(count || 0);
    button.append(text, value);
    return button;
  }

  function renderImportGlobalIssues(trechos) {
    if (!el.importReviewIssues) return;
    const issues = [];
    if (!getImportClient()?.id) issues.push("Cliente Embraer não encontrado. Configure CONFIG.importDefaults.clienteId ou cadastre Embraer.");
    const duplicated = trechos.filter((trecho) => trecho.duplicatedRecordIds?.length);
    const possible = trechos.filter((trecho) => !trecho.duplicatedRecordIds?.length && trecho.possibleDuplicateMatches?.length);
    if (duplicated.length) issues.push(`${duplicated.length} serviço(s) repetido(s) por horário, trajeto, endereço, destino ou passageiros. Não edite nem salve por aqui.`);
    if (possible.length) issues.push(`${possible.length} serviço(s) parecido(s) com registros existentes. Revise antes de confirmar.`);
    const ambiguous = trechos.reduce((total, trecho) => total + trecho.passageiros.filter((pax) => pax.matchStatus === "ambiguous").length, 0);
    if (ambiguous) issues.push(`${ambiguous} passageiro(s) precisam de decisão de duplicidade.`);
    el.importReviewIssues.hidden = issues.length === 0;
    el.importReviewIssues.replaceChildren(...issues.map((issue) => {
      const item = document.createElement("p");
      item.textContent = issue;
      return item;
    }));
  }

  function ensureSelectedImportedTrecho(programs) {
    const trechos = (programs || []).flatMap((program) => (
      (program.trechos || []).map((trecho) => ({ program, trecho }))
    ));
    if (!trechos.length) return null;
    const currentProgram = state.importReview?.selectedProgramacao || "";
    const currentKey = state.importReview?.selectedTrechoKey || "";
    const selected = trechos.find((item) => item.program.programacao === currentProgram && item.trecho.key === currentKey)
      || trechos.find((item) => normalizeImportedReviewStatus(item.trecho) !== importReviewStatuses().IGNORED)
      || trechos[0];
    state.importReview.selectedProgramacao = selected.program.programacao;
    state.importReview.selectedTrechoKey = selected.trecho.key;
    return selected;
  }

  function importedTrechoEditKey(programacao, trechoKey) {
    return `${programacao || ""}||${trechoKey || ""}`;
  }

  function currentImportedTrechoEditKey() {
    return importedTrechoEditKey(state.importReview?.selectedProgramacao, state.importReview?.selectedTrechoKey);
  }

  function isImportedTrechoEditing(programacao, trechoKey) {
    return state.importReview?.editingTrechoKey === importedTrechoEditKey(programacao, trechoKey);
  }

  function setImportedTrechoEditMode(programacao, trechoKey, enabled) {
    if (!state.importReview) return;
    state.importReview.editingTrechoKey = enabled ? importedTrechoEditKey(programacao, trechoKey) : "";
  }

  function isSplitImportedTrecho(trecho) {
    return !!trecho?.splitGroupId || trecho?.originStatus === "Split" || trecho?.importOrigin === "split";
  }

  function isDraftImportedTrecho(trecho) {
    return isSplitImportedTrecho(trecho);
  }

  function importOperationalDecisions() {
    return window.XlsxImportCore?.IMPORT_OPERATIONAL_DECISIONS || {
      PENDING: "pending",
      KEEP_WAITING: "keep-waiting",
      SPLIT: "split",
      SPLIT_DRAFT: "split-draft",
      MANUAL_REVIEW: "manual-review"
    };
  }

  function importOperationalModes() {
    return window.XlsxImportCore?.IMPORT_OPERATIONAL_MODES || {
      SINGLE: "single",
      WAITING: "waiting",
      MULTI_PICKUP: "multi-pickup",
      INDEPENDENT_SERVICES: "independent-services",
      SEPARABLE: "separable",
      MANUAL_REVIEW: "manual-review",
      SPLIT_RETURN: "split-return"
    };
  }

  function applyImportedOperationalDecision(trecho, decision) {
    if (window.XlsxImportCore?.applyImportOperationalDecision) {
      return window.XlsxImportCore.applyImportOperationalDecision(trecho, decision);
    }
    const decisions = importOperationalDecisions();
    trecho.operationalDecision = decision;
    const decisionIssue = window.XlsxImportCore?.OPERATIONAL_DECISION_ISSUE || "Decidir se motorista fica a disposicao ou separar ida/busca.";
    trecho.pendencias = (trecho.pendencias || []).filter((issue) => issue !== decisionIssue);
    if (decision === decisions.MANUAL_REVIEW) trecho.pendencias.push(decisionIssue);
    markImportedReviewPending(trecho);
    return trecho;
  }

  function findImportProgram(programacao) {
    return state.importReview?.programs?.find((program) => program.programacao === programacao) || null;
  }

  function splitImportedTrechoForReview(programacao, trecho) {
    const program = findImportProgram(programacao);
    if (!program || !trecho) return null;
    const clone = window.XlsxImportCore?.splitImportedTrecho
      ? window.XlsxImportCore.splitImportedTrecho(program, trecho)
      : createLocalSplitImportedTrecho(program, trecho);
    if (!clone) return null;
    state.importReview.selectedProgramacao = program.programacao;
    state.importReview.selectedTrechoKey = clone.key;
    setImportedTrechoEditMode(program.programacao, clone.key, true);
    return clone;
  }

  function importedSplitGroupMembers(trecho) {
    const splitGroupId = String(trecho?.splitGroupId || "").trim();
    if (!splitGroupId) return [];
    return collectImportedTrechos(state.importReview).filter((item) => String(item?.splitGroupId || "").trim() === splitGroupId);
  }

  function isCompleteImportedSplitGroup(trecho) {
    const members = importedSplitGroupMembers(trecho);
    if (members.length !== 2) return false;
    const roles = new Set(members.map((item) => item?.splitRole).filter(Boolean));
    return roles.size === 2 && roles.has("outbound") && roles.has("return")
      && members.every((item) => item.programacao === trecho.programacao);
  }

  function isAuthorizedImportedSplitSibling(trecho, candidate) {
    if (!isCompleteImportedSplitGroup(trecho)) return false;
    const sibling = importedSplitGroupMembers(trecho).find((item) => item !== trecho && item.splitRole !== trecho.splitRole);
    return !!sibling?.savedRecordId
      && sameId(candidate?.recordId || candidate?.id, sibling.savedRecordId);
  }

  function importedSplitGroupPendingMembers(trecho) {
    return importedSplitGroupMembers(trecho).filter((item) => normalizeImportedReviewStatus(item) !== importReviewStatuses().SAVED);
  }

  function createLocalSplitImportedTrecho(program, source) {
    const splitKey = nextSplitImportedTrechoKey(program);
    const splitGroupId = String(source?.splitGroupId || `${program?.programacao || source?.programacao || ""}|split-group|${splitKey.split("|").pop()}`);
    source.retornoPrevistoDataIso = "";
    source.retornoPrevistoHorario = "";
    source.splitGroupId = splitGroupId;
    source.splitRole = "outbound";
    applyImportedOperationalDecision(source, importOperationalDecisions().SPLIT);
    markImportedReviewPending(source);
    const key = splitKey;
    const clone = {
      key,
      programacao: program?.programacao || source?.programacao || "",
      solicitacoes: Array.from(new Set(source?.solicitacoes || [])),
      sourceRows: [],
      data: "",
      dataIso: "",
      horario: "",
      origem: "",
      destino: "",
      destinos: [],
      cidadeOrigem: "",
      cidadeDestino: "",
      solicitanteNome: source?.solicitanteNome || "",
      tipoServicoSugerido: source?.tipoServicoSugerido || "",
      tipoVeiculoSugerido: source?.tipoVeiculoSugerido || "",
      tipoServicoValue: source?.tipoServicoValue || "",
      tipoVeiculoValue: source?.tipoVeiculoValue || "",
      motoristaNome: "",
      retornoPrevistoDataIso: "",
      retornoPrevistoHorario: "",
      trajetoCidades: "",
      origemPrincipal: "",
      destinoPrincipal: "",
      linhasImportadas: [],
      passageiros: (source?.passageiros || []).map((passenger) => ({
        ...passenger,
        sourceRow: "",
        origem: "",
        destino: "",
        horario: ""
      })),
      observacoes: Array.from(new Set(source?.observacoes || [])),
      observacaoOperacional: source?.observacaoOperacional || "",
      observacoesFormulario: source?.observacoesFormulario ? { ...source.observacoesFormulario } : null,
      observacaoAtual: source?.observacaoAtual || "motorista",
      pendencias: [],
      reviewStatus: importReviewStatuses().PENDING,
      reviewBlockReason: "",
      savedRecordId: "",
      duplicatedRecordIds: [],
      splitGroupId,
      splitRole: "return",
      importOrigin: "split",
      originStatus: "Split",
      operationalMode: "split-return",
      operationalDecision: importOperationalDecisions().SPLIT_DRAFT,
      operationalSuggestion: "Busca separada",
      operationalConfidence: "baixa",
      operationalReason: "Rascunho criado para completar a busca separada."
    };
    program.trechos.push(clone);
    program.pendencias = Array.from(new Set(program.trechos.flatMap((item) => item.pendencias || [])));
    return clone;
  }

  function nextSplitImportedTrechoKey(program) {
    const programacao = program?.programacao || "";
    const keys = new Set((program?.trechos || []).map((trecho) => String(trecho.key || "")));
    let sequence = 1;
    while (keys.has(`${programacao}|split|${sequence}`)) {
      sequence += 1;
    }
    return `${programacao}|split|${sequence}`;
  }

  function createImportPassengerDraft(trecho) {
    return {
      sourceRow: "",
      nome: "",
      telefone: "",
      email: "",
      documento: "",
      centroCusto: "",
      solicitanteNome: trecho?.solicitanteNome || "",
      horario: trecho?.horario || "",
      passageiroId: "",
      passageiroLabel: "",
      matchStatus: "create-new",
      matchCandidates: []
    };
  }

  function renderImportReviewPreservingGallery(scrollTop = null) {
    commitGlobalHistoryChange("Alterar importação");
    const list = el.importReviewPrograms?.querySelector(".import-service-list");
    const nextScrollTop = scrollTop ?? list?.scrollTop ?? 0;
    renderImportReview();
    requestAnimationFrame(() => {
      const nextList = el.importReviewPrograms?.querySelector(".import-service-list");
      if (nextList) nextList.scrollTop = nextScrollTop;
    });
  }

  function buildImportWorkbench(programs, options = {}) {
    const selected = ensureSelectedImportedTrecho(programs);
    const shell = document.createElement("div");
    shell.className = "import-workbench";

    const list = document.createElement("section");
    list.className = "import-service-list";
    list.setAttribute("aria-label", "Serviços importados");
    (programs || []).forEach((program) => {
      const group = document.createElement("article");
      group.className = "import-service-group";
      group.dataset.programacao = program.programacao;
      const title = document.createElement("div");
      title.className = "import-service-group-title";
      const titleText = document.createElement("div");
      titleText.className = "import-service-group-title-text";
      const strong = document.createElement("strong");
      strong.textContent = program.programacao;
      const meta = document.createElement("span");
      meta.textContent = `${program.trechos.length} serviço(s) · ${program.solicitacoes.join(", ") || "sem ST"}`;
      titleText.append(strong, meta);
      title.append(titleText);
      group.appendChild(title);
      program.trechos.forEach((trecho, index) => {
        const isSelected = selected?.program.programacao === program.programacao && selected?.trecho.key === trecho.key;
        group.appendChild(buildImportServiceListItem(program, trecho, index, isSelected));
      });
      list.appendChild(group);
    });
    if (!list.children.length) {
      list.appendChild(buildImportServiceListEmpty(options.activeFilter));
    }

    const inspector = document.createElement("aside");
    inspector.className = "import-inspector";
    inspector.setAttribute("aria-label", "Inspector do serviço importado");
    if (selected) {
      const isDuplicated = !!selected.trecho.duplicatedRecordIds?.length;
      const isSplit = isSplitImportedTrecho(selected.trecho);
      inspector.classList.toggle("is-duplicated", isDuplicated);
      const isEditing = !isDuplicated && isImportedTrechoEditing(selected.program.programacao, selected.trecho.key);
      const inspectorHead = document.createElement("div");
      inspectorHead.className = "import-inspector-head";
      const reviewStatus = normalizeImportedReviewStatus(selected.trecho);
      const statusMeta = importedTrechoReviewMeta(selected.trecho, importedTrechoIssues(selected.trecho));
      addClassIfPresent(inspector, `is-${reviewStatus || ""}`);
      const title = document.createElement("div");
      const eyebrow = document.createElement("span");
      const statusLabels = importReviewStatuses();
      const isAutoIgnoredDuplicate = isImportedDuplicateAutoIgnored(selected.trecho);
      eyebrow.textContent = isDuplicated
        ? isAutoIgnoredDuplicate
          ? "Duplicata ignorada automaticamente"
          : "Serviço bloqueado"
        : isSplit
          ? "Serviço Split"
          : isEditing
            ? "Edição habilitada"
            : reviewStatus === statusLabels.CONFIRMED
              ? "Serviço validado"
              : reviewStatus === statusLabels.SAVED
                ? "Serviço salvo"
                : reviewStatus === statusLabels.IGNORED
                  ? "Serviço ignorado"
                  : reviewStatus === statusLabels.BLOCKED
                    ? "Serviço bloqueado"
                    : "Conferência bloqueada";
      const strong = document.createElement("strong");
      strong.textContent = `${selected.program.programacao} · ${formatDateInputForDisplay(selected.trecho.dataIso)} ${selected.trecho.horario || "--:--"}`;
      title.append(eyebrow, strong);
      const statusBadge = document.createElement("span");
      statusBadge.className = `import-inspector-status import-badge ${isDuplicated ? "danger" : statusMeta.tone}`;
      statusBadge.textContent = isAutoIgnoredDuplicate ? "Duplicata automática" : isDuplicated ? "Bloqueado" : statusMeta.label;
      statusBadge.setAttribute("aria-label", `Status do serviço: ${statusBadge.textContent}`);
      title.appendChild(statusBadge);
      const actions = document.createElement("div");
      actions.className = "import-inspector-actions";
      if (isDuplicated) actions.classList.add("duplicado");
      const canEditSelectedTrecho = canEditImportedTrechoStatus(reviewStatus) && !isDuplicated;
      const editToggle = canEditSelectedTrecho
        ? buildImportEditToggle(selected.program.programacao, selected.trecho.key, isEditing, false)
        : null;
      const reviewActions = buildImportInspectorReviewActions(selected.program.programacao, selected.trecho.key, selected.trecho, normalizeImportedReviewStatus(selected.trecho), isDuplicated);
      actions.append(...[editToggle, ...reviewActions].filter(Boolean));
      inspectorHead.append(title, actions);
      inspector.append(inspectorHead);
      const ignoredReasonNotice = buildImportIgnoredReasonNotice(selected.trecho);
      if (ignoredReasonNotice) inspector.appendChild(ignoredReasonNotice);
      inspector.append(buildImportTrechoCard(selected.program, selected.trecho, selected.program.trechos.indexOf(selected.trecho), {
        editable: isEditing
      }));
    } else {
      const empty = document.createElement("div");
      empty.className = "import-inspector-empty";
      const strong = document.createElement("strong");
      strong.textContent = "Nenhum serviço neste filtro";
      const span = document.createElement("span");
      span.textContent = "Use Todos, Validados, Pendentes ou Ignorados para trocar a galeria.";
      empty.append(strong, span);
      inspector.appendChild(empty);
    }

    shell.append(list, inspector);
    return shell;
  }

  function canEditImportedTrechoStatus(reviewStatus) {
    const statuses = importReviewStatuses();
    return reviewStatus !== statuses.CONFIRMED
      && reviewStatus !== statuses.IGNORED
      && reviewStatus !== statuses.SAVED;
  }

  function buildImportServiceListEmpty(activeFilter) {
    const empty = document.createElement("div");
    empty.className = "import-service-list-empty";
    const strong = document.createElement("strong");
    strong.textContent = activeFilter === importReviewFilters().PENDING ? "Sem pendências" : "Nenhum item neste filtro";
    const span = document.createElement("span");
    span.textContent = "Use os filtros acima para trocar a visão da importação.";
    empty.append(strong, span);
    return empty;
  }

  function buildImportEditToggle(programacao, trechoKey, isEditing, disabled = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-button passenger-edit-toggle import-edit-toggle";
    button.classList.toggle("is-active", !!isEditing);
    button.dataset.importAction = "toggle-edit";
    button.dataset.programacao = programacao;
    button.dataset.trechoKey = trechoKey;
    button.setAttribute("aria-pressed", String(!!isEditing));
    button.disabled = !!disabled;
    button.title = disabled ? "Serviço já existe no sistema. Edite pelo sistema." : "";
    button.setAttribute("aria-label", disabled ? "Serviço bloqueado por duplicidade" : isEditing ? "Bloquear edição do serviço" : "Habilitar edição do serviço");
    button.innerHTML = `
      <svg class="passenger-edit-icon-edit" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 16.5V20h3.5L18.06 9.44l-3.5-3.5L4 16.5Zm15.71-9.71a1 1 0 0 0 0-1.42l-1.08-1.08a1 1 0 0 0-1.42 0l-.86.86 3.5 3.5.86-.86Z"></path>
      </svg>
      <svg class="passenger-edit-icon-lock" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2Zm-7-2a2 2 0 0 1 4 0v2h-4V7Zm3 8.73V17h-2v-1.27a2 2 0 1 1 2 0Z"></path>
      </svg>
    `;
    return button;
  }

  function buildImportServiceListItem(program, trecho, index, isSelected) {
    const issues = importedTrechoIssues(trecho);
    const status = importedTrechoReviewMeta(trecho, issues);
    const isDuplicated = !!trecho.duplicatedRecordIds?.length;
    const isAutoIgnoredDuplicate = isImportedDuplicateAutoIgnored(trecho);
    const isSplit = isSplitImportedTrecho(trecho);
    const ignoredReason = getImportedIgnoredReason(trecho);
    const wrap = document.createElement("div");
    wrap.className = "import-service-row-wrap";
    wrap.dataset.programacao = program.programacao;
    wrap.dataset.trechoKey = trecho.key;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "import-service-row";
    button.classList.toggle("is-selected", !!isSelected);
    button.classList.toggle("is-duplicated", isDuplicated);
    button.classList.toggle("is-waiting", importedTrechoHasReturn(trecho) && !isDraftImportedTrecho(trecho));
    button.classList.toggle("is-split", isSplit);
    addClassIfPresent(button, `is-${normalizeImportedReviewStatus(trecho) || ""}`);
    button.dataset.importAction = "select-trecho";
    button.dataset.programacao = program.programacao;
    button.dataset.trechoKey = trecho.key;
    button.setAttribute("aria-current", isSelected ? "true" : "false");
    button.setAttribute("aria-label", `${isSelected ? "Selecionado. " : ""}${importedTrechoServiceListTimeLabel(trecho)}. Status: ${isAutoIgnoredDuplicate ? "Duplicata automática (ignorado automaticamente)" : isDuplicated ? "Não editar" : status.label}.${ignoredReason ? ` Motivo: ${ignoredReason}.` : ""}`);

    const main = document.createElement("span");
    main.className = "import-service-main";
    const title = document.createElement("strong");
    title.textContent = importedTrechoServiceListTimeLabel(trecho);
    const meta = document.createElement("span");
    meta.textContent = composeImportTrajeto(trecho) || trecho.destino || "rota pendente";
    main.append(title, meta);

    const side = document.createElement("span");
    side.className = "import-service-side";
    const badge = document.createElement("span");
    badge.className = `import-badge ${isDuplicated ? "danger" : trecho.possibleDuplicateMatches?.length ? "warning" : status.tone}`;
    badge.textContent = isAutoIgnoredDuplicate
      ? "Duplicata automática"
      : isDuplicated
        ? "Não editar"
        : trecho.possibleDuplicateMatches?.length
          ? "Parecido"
          : status.label;
    side.append(badge);
    button.append(main, side);
    wrap.append(button);
    if (ignoredReason) {
      const reason = document.createElement("div");
      reason.className = "import-ignored-reason-strip";
      reason.setAttribute("aria-label", `Motivo do serviço ignorado: ${ignoredReason}`);
      const label = document.createElement("span");
      label.textContent = "Motivo";
      const text = document.createElement("strong");
      text.textContent = ignoredReason;
      reason.append(label, text);
      wrap.appendChild(reason);
    }
    return wrap;
  }

  function buildImportProgramCard(program) {
    const card = document.createElement("article");
    card.className = "import-program";
    card.dataset.programacao = program.programacao;
    const head = document.createElement("header");
    head.className = "import-program-head";
    const title = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = program.programacao;
    const meta = document.createElement("span");
    meta.textContent = `${program.trechos.length} trecho(s) · ${program.solicitacoes.join(", ") || "sem ST"}`;
    title.append(strong, meta);
    const status = document.createElement("span");
    status.className = program.duplicatedRecordIds?.length ? "import-badge danger" : "import-badge";
    status.textContent = program.duplicatedRecordIds?.length ? "Serviço repetido" : "Novo";
    head.append(title, status);
    card.appendChild(head);
    program.trechos.forEach((trecho, index) => card.appendChild(buildImportTrechoCard(program, trecho, index)));
    return card;
  }

  function buildImportTrechoCard(program, trecho, index, options = {}) {
    const card = document.createElement("section");
    card.className = "import-trecho";
    card.classList.toggle("is-saved", !!trecho.savedRecordId);
    const isDuplicated = !!trecho.duplicatedRecordIds?.length;
    const isSplitLinked = isCompleteImportedSplitGroup(trecho);
    const reviewStatus = normalizeImportedReviewStatus(trecho);
    const isEditing = !!options.editable && !isDuplicated;
    addClassIfPresent(card, `is-${reviewStatus || ""}`);
    card.classList.toggle("is-duplicated", isDuplicated);
    card.classList.toggle("is-split-linked", isSplitLinked);
    card.classList.toggle("is-editing", isEditing);
    card.classList.toggle("is-locked", !isEditing);
    card.dataset.programacao = program.programacao;
    card.dataset.trechoKey = trecho.key;
    const issues = importedTrechoIssues(trecho);
    const displayIssues = importedTrechoDisplayIssues(trecho, issues);

    const head = document.createElement("header");
    head.className = "import-trecho-head";
    const title = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = `Serviço ${index + 1}`;
    const meta = document.createElement("span");
    meta.textContent = `${formatDateInputForDisplay(trecho.dataIso)} ${trecho.horario || "--:--"} · ${trecho.passageiros.length} passageiro(s)`;
    title.append(strong, meta);
    const badge = document.createElement("span");
    const reviewMeta = importedTrechoReviewMeta(trecho, issues);
    badge.className = `import-badge ${reviewMeta.tone}`;
    badge.textContent = reviewMeta.label;
    head.append(title, badge);
    if (isSplitLinked) {
      const splitBadge = document.createElement("span");
      splitBadge.className = "import-badge manual";
      splitBadge.textContent = "Split vinculado";
      splitBadge.setAttribute("aria-label", "Split vinculado: ida e retorno pertencem ao mesmo grupo de salvamento");
      head.appendChild(splitBadge);
    }

    const duplicateLock = buildImportDuplicateLockNotice(trecho);

    const fieldStack = document.createElement("div");
    fieldStack.className = "import-hot-grid import-editor-stack";
    fieldStack.append(
      buildImportedDataverseStatusField(trecho),
      buildImportInput("Data e hora", "dataHora", importedTrechoDateTimeLocal(trecho), "datetime-local"),
      buildImportInput("Horário previsto de retorno", "retornoPrevisto", importedTrechoReturnDateTimeLocal(trecho), "datetime-local"),
      buildImportSelect("Tipo do serviço", "tipoServicoValue", sortByLabel(state.options.tipoServico), trecho.tipoServicoValue || findOptionValue("tipoServico", trecho.tipoServicoSugerido)),
      buildImportSelect("Tipo do veículo", "tipoVeiculoValue", state.options.tipoVeiculo, trecho.tipoVeiculoValue || findOptionValue("tipoVeiculo", trecho.tipoVeiculoSugerido)),
      buildImportTextarea("Endereço de saída", "origem", trecho.origem),
      buildImportTextarea("Destino", "destino", trecho.destino),
      buildImportTextarea("Trajeto", "trajetoCidades", trecho.trajetoCidades || composeImportTrajeto(trecho)),
      buildImportObservationField(trecho)
    );

    const passengerList = document.createElement("div");
    passengerList.className = "import-passengers";
    const passengerHead = document.createElement("div");
    passengerHead.className = "import-passengers-head";
    const passengerTitle = document.createElement("strong");
    passengerTitle.textContent = "Passageiros";
    const isPassengerPickerOpen = !!trecho.passengerPickerOpen && isEditing;
    const addPassengerButton = buildImportAction("+", "add-import-passenger", !isEditing);
    addPassengerButton.className = "import-add-inline-button import-add-passenger-button";
    addPassengerButton.title = isEditing ? "Adicionar passageiro ao serviço" : "Habilite edição para adicionar passageiro.";
    addPassengerButton.setAttribute("aria-label", "Adicionar passageiro ao serviço");
    passengerHead.append(passengerTitle, addPassengerButton);
    passengerList.appendChild(passengerHead);
    if (isPassengerPickerOpen) {
      const picker = document.createElement("div");
      picker.className = "import-passenger-add-picker";
      picker.appendChild(buildImportPassengerAddSelect(trecho));
      passengerList.appendChild(picker);
    }
    if (!trecho.passageiros.length && !isPassengerPickerOpen) {
      const emptyPassenger = document.createElement("p");
      emptyPassenger.className = "import-passenger-empty";
      emptyPassenger.textContent = "Nenhum passageiro.";
      passengerList.appendChild(emptyPassenger);
    }
    trecho.passageiros.forEach((passenger, passengerIndex) => {
      passengerList.appendChild(buildImportPassengerRow(passenger, passengerIndex, {
        editable: isEditing
      }));
    });
    const solicitanteSection = buildImportSolicitanteSection(trecho, {
      editable: isEditing
    });
    passengerList.appendChild(solicitanteSection);

    const issueList = document.createElement("div");
    issueList.className = "import-trecho-issues";
    issueList.hidden = displayIssues.length === 0;
    issueList.replaceChildren(...displayIssues.map((issue) => {
      const item = document.createElement("span");
      item.textContent = issue;
      return item;
    }));

    const actions = document.createElement("footer");
    actions.className = "import-trecho-actions";
    if (reviewStatus === importReviewStatuses().SAVED) {
      actions.append(buildImportAction("Salvo", "noop", true));
    } else if (isDuplicated) {
      actions.append(buildImportAction("Bloqueado", "noop", true));
    }

    const blocks = [head];
    if (duplicateLock) blocks.push(duplicateLock);
    blocks.push(fieldStack, passengerList, issueList, actions);
    card.append(...blocks);
    setImportedTrechoControlsMode(card, isEditing);
    return card;
  }

  function buildImportedDataverseStatusField(trecho) {
    const field = buildImportSelect("Status Dataverse", "statusOperacaoValue", state.options.statusOperacao, resolveImportedOperationStatusValue(trecho));
    field.classList.add("import-dataverse-status-field");
    const hint = document.createElement("small");
    hint.className = "import-field-hint";
    hint.textContent = importedDataverseStatusHint(trecho);
    field.appendChild(hint);
    return field;
  }

  function buildImportInspectorReviewActions(programacao, trechoKey, trecho, reviewStatus, isDuplicated = false) {
    const statuses = importReviewStatuses();
    const attachContext = (button) => {
      button.classList.add("import-inspector-review-action");
      button.dataset.programacao = programacao;
      button.dataset.trechoKey = trechoKey;
      return button;
    };
    if (reviewStatus === statuses.SAVED) {
      return [attachContext(buildImportAction("Salvo", "noop", true))];
    }
    if (reviewStatus === statuses.IGNORED || reviewStatus === statuses.CONFIRMED) {
      return [attachContext(buildImportAction("Revisar", "review-pending"))];
    }
    const splitButton = canShowImportedSplitAction(trecho, reviewStatus, isDuplicated)
      ? attachContext(buildImportAction("Separar ida/busca", "split-trecho"))
      : null;
    if (splitButton) {
      splitButton.classList.add("secondary-action");
      splitButton.title = "Criar segunda OS rascunho na mesma PG.";
    }
    const validateButton = attachContext(buildImportAction("Validar", "confirm-review", !!isDuplicated));
    validateButton.title = isDuplicated ? "Serviço já existe no sistema. Validação bloqueada." : "Validar este serviço importado.";
    const ignoreButton = attachContext(buildImportAction("Ignorar", "ignore-trecho"));
    ignoreButton.title = "Ignorar este serviço na importação.";
    return [splitButton, validateButton, ignoreButton].filter(Boolean);
  }

  function buildImportIgnoredReasonNotice(trecho) {
    const reasonText = getImportedIgnoredReason(trecho);
    if (!reasonText) return null;
    const notice = document.createElement("div");
    notice.className = "import-ignored-reason-notice";
    notice.setAttribute("role", "note");
    const eyebrow = document.createElement("span");
    eyebrow.textContent = "Motivo fixo";
    const strong = document.createElement("strong");
    strong.textContent = reasonText;
    const detail = document.createElement("p");
    detail.textContent = "Este serviço não será salvo enquanto estiver ignorado.";
    notice.append(eyebrow, strong, detail);
    return notice;
  }

  function canShowImportedSplitAction(trecho, reviewStatus = normalizeImportedReviewStatus(trecho), isDuplicated = false) {
    const statuses = importReviewStatuses();
    const modes = importOperationalModes();
    const decisions = importOperationalDecisions();
    const currentDecision = trecho.operationalDecision || "";
    return reviewStatus === statuses.PENDING
      && !isDuplicated
      && !isDraftImportedTrecho(trecho)
      && currentDecision !== decisions.SPLIT
      && currentDecision !== decisions.SPLIT_DRAFT
      && trecho?.operationalMode !== modes.MULTI_PICKUP
      && trecho?.operationalMode !== modes.INDEPENDENT_SERVICES
      && importedTrechoHasReturn(trecho);
  }

  function importedTrechoHasReturn(trecho) {
    return !!(trecho?.retornoPrevistoHorario || trecho?.retornoPrevistoDataIso);
  }

  function importedTrechoWindowLabel(trecho) {
    const saida = trecho?.horario || "--:--";
    const retorno = trecho?.retornoPrevistoHorario || "";
    if (retorno && retorno !== saida) return `${saida} → ${retorno}`;
    return saida;
  }

  function importedTrechoServiceListTimeLabel(trecho) {
    const date = formatDateInputForDisplay(trecho?.dataIso);
    const window = importedTrechoWindowLabel(trecho);
    return [date, window].filter(Boolean).join(" · ");
  }

  function importedTrechoReturnLabel(trecho) {
    if (!importedTrechoHasReturn(trecho)) return "Sem retorno previsto";
    return formatImportedTrechoDateTimeLabel(trecho?.retornoPrevistoDataIso || trecho?.dataIso, trecho?.retornoPrevistoHorario);
  }

  function formatImportedTrechoDateTimeLabel(dataIso, horario) {
    return `${formatDateInputForDisplay(dataIso)} ${horario || "--:--"}`.trim();
  }

  function importPassengerCountLabel(count) {
    const total = Number(count) || 0;
    return `${total} ${total === 1 ? "pax" : "pax"}`;
  }

  function buildImportDuplicateLockNotice(trecho) {
    if (!trecho.duplicatedRecordIds?.length) return null;
    const notice = document.createElement("div");
    notice.className = "import-duplicate-lock";
    notice.setAttribute("role", "alert");
    const strong = document.createElement("strong");
    strong.textContent = "Não edite este serviço";
    const span = document.createElement("span");
    span.textContent = `${formatImportedDuplicateMatch(trecho.duplicateMatches?.[0])}. Clique em qualquer campo para copiar a informação. Edite somente o registro original.`;
    notice.append(strong, span);
    return notice;
  }

  function setImportedTrechoControlsMode(card, isEditing) {
    card.querySelectorAll("[data-import-field], [data-import-passenger-field], [data-import-observation-text], [data-import-obs-type]").forEach((control) => {
      if (control.hasAttribute("data-import-obs-type")) {
        control.disabled = false;
        return;
      }
      if (control.hasAttribute("data-import-observation-text")) {
        control.readOnly = !isEditing;
        return;
      }
      if (control.tagName === "SELECT" || control.tagName === "BUTTON") {
        control.disabled = !isEditing;
      } else {
        control.readOnly = !isEditing;
      }
    });
  }

  function importedTrechoReviewMeta(trecho, issues = []) {
    const statuses = importReviewStatuses();
    const status = normalizeImportedReviewStatus(trecho);
    if (isImportedDuplicateAutoIgnored(trecho)) return { label: "Duplicata automática", tone: "danger" };
    if (trecho.duplicatedRecordIds?.length) return { label: "Não editável", tone: "danger" };
    if (status === statuses.SAVED) return { label: "Salvo", tone: "success" };
    if (status === statuses.IGNORED) return { label: "Ignorado", tone: "danger" };
    if (status === statuses.CONFIRMED) return { label: "Confirmado", tone: "success" };
    if (status === statuses.BLOCKED) return { label: "Bloqueado", tone: "danger" };
    if (isSplitImportedTrecho(trecho)) return { label: "Split", tone: "manual" };
    if (issues.length) return { label: "Pendente", tone: "warning" };
    return { label: "Pendente", tone: "warning" };
  }

  function importedTrechoDisplayIssues(trecho, issues = []) {
    const statuses = importReviewStatuses();
    const status = normalizeImportedReviewStatus(trecho);
    const output = [...issues];
    if (trecho.duplicatedRecordIds?.length) {
      output.unshift(`Serviço repetido provável: ${formatImportedDuplicateMatch(trecho.duplicateMatches?.[0])}. Sem edição e sem salvamento pela importação.`);
    } else if (trecho.possibleDuplicateMatches?.length) {
      output.unshift(`Possível duplicidade: ${formatImportedDuplicateMatch(trecho.possibleDuplicateMatches[0])}. Revise antes de confirmar.`);
    }
    if (status === statuses.BLOCKED && trecho.reviewBlockReason) {
      output.unshift(`Bloqueado: ${trecho.reviewBlockReason}`);
    }
    const ignoredReason = getImportedIgnoredReason(trecho);
    if (ignoredReason) {
      output.unshift(`Ignorado: ${ignoredReason}`);
    }
    return Array.from(new Set(output));
  }

  function getImportedIgnoredReason(trecho) {
    const statuses = importReviewStatuses();
    if (normalizeImportedReviewStatus(trecho) !== statuses.IGNORED) return "";
    if (trecho?.reviewBlockReason) return trecho.reviewBlockReason;
    if (isImportedDuplicateAutoIgnored(trecho)) return "Serviço repetido provável no Dataverse.";
    if (trecho?.autoIgnoredByExternalStatus) return "Status XLSX Aguardando prestador.";
    return "Ignorado manualmente na revisão.";
  }

  function isImportedDuplicateAutoIgnored(trecho) {
    return !!(trecho?.duplicatedRecordIds?.length
      && normalizeImportedReviewStatus(trecho) === importReviewStatuses().IGNORED
      && trecho?.autoIgnoredByDuplicate);
  }

  function formatImportedDuplicateMatch(match) {
    if (!match) return "Serviço repetido provável";
    const reasons = (match.reasons || []).filter(Boolean).slice(0, 4).join(", ");
    return reasons ? `Serviço repetido provável por ${reasons}` : "Serviço repetido provável";
  }

  function buildImportInput(label, field, value, type = "text", wide = false) {
    const wrap = document.createElement("label");
    const typeClass = String(type || "text").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    wrap.className = `field import-field is-${typeClass}${wide ? " span-2 is-wide" : ""}`;
    wrap.dataset.importInputType = type;
    wrap.dataset.importCopy = "1";
    wrap.dataset.copyLabel = label;
    const span = document.createElement("span");
    span.textContent = label;
    const input = document.createElement("input");
    input.type = type;
    applyPtBrDateLocale(input);
    if (type === "datetime-local") input.step = "300";
    input.value = value ?? "";
    input.dataset.importField = field;
    if (type === "number") input.step = "0.01";
    wrap.append(span, input);
    return wrap;
  }

  function buildImportTextarea(label, field, value, options = {}) {
    const wrap = document.createElement("label");
    wrap.className = "field import-field span-2 is-wide is-textarea";
    if (options.obs) wrap.classList.add("obs-field");
    wrap.dataset.importInputType = "textarea";
    wrap.dataset.importCopy = "1";
    wrap.dataset.copyLabel = label;
    const span = document.createElement("span");
    span.textContent = label;
    const textarea = document.createElement("textarea");
    textarea.rows = 2;
    if (options.obs) {
      textarea.placeholder = "Ex.: preferir veículo com água, sem paradas, rota direta.";
    }
    textarea.value = value ?? "";
    textarea.dataset.importField = field;
    wrap.append(span, textarea);
    return wrap;
  }

  function buildImportObservationField(trecho) {
    const obs = ensureImportedObservationState(trecho);
    const current = obs.current || "motorista";
    const wrap = document.createElement("div");
    wrap.className = "field import-field span-2 is-wide is-textarea obs-field";
    wrap.dataset.importInputType = "textarea";
    wrap.dataset.importCopy = "1";
    wrap.dataset.copyLabel = "Observação";
    const span = document.createElement("span");
    span.textContent = "Observação operacional";
    const segmented = document.createElement("div");
    segmented.className = "segmented";
    segmented.setAttribute("role", "tablist");
    segmented.setAttribute("aria-label", "Tipo de observação importada");
    [
      ["motorista", "Mot"],
      ["interna", "Interna"],
      ["final", "Final"],
      ["passageiro", "Pref Pax"]
    ].forEach(([key, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `seg${current === key ? " is-active" : ""}`;
      button.dataset.importAction = "switch-import-obs";
      button.dataset.importObsType = key;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(current === key));
      button.textContent = label;
      segmented.appendChild(button);
    });
    const textarea = document.createElement("textarea");
    textarea.rows = 2;
    textarea.placeholder = "Ex.: preferir veículo com água, sem paradas, rota direta.";
    textarea.value = obs[current] || "";
    textarea.dataset.importObservationText = "1";
    wrap.append(span, segmented, textarea);
    return wrap;
  }

  function ensureImportedObservationState(trecho) {
    const current = ["motorista", "interna", "final", "passageiro"].includes(trecho?.observacaoAtual)
      ? trecho.observacaoAtual
      : "motorista";
    const existing = trecho?.observacoesFormulario || {};
    const obs = {
      motorista: existing.motorista ?? trecho?.observacaoOperacional ?? importedMotoristaObservationFromXlsx(trecho),
      interna: existing.interna ?? trecho?.observacaoInterna ?? importedDefaultInternalObservation(trecho),
      final: existing.final ?? trecho?.observacaoFinal ?? "",
      passageiro: existing.passageiro ?? trecho?.observacaoPassageiro ?? composeImportedTrechoPreferencias(trecho),
      current
    };
    if (!String(obs.passageiro || "").trim()) {
      obs.passageiro = composeImportedTrechoPreferencias(trecho);
    }
    if (trecho) {
      trecho.observacoesFormulario = obs;
      trecho.observacaoAtual = current;
      syncImportedObservationFields(trecho);
    }
    return obs;
  }

  function syncImportedObservationFields(trecho) {
    const obs = trecho?.observacoesFormulario || {};
    trecho.observacaoOperacional = obs.motorista || "";
    trecho.observacaoInterna = obs.interna || "";
    trecho.observacaoFinal = obs.final || "";
    trecho.observacaoPassageiro = obs.passageiro || "";
  }

  function importedMotoristaObservationFromXlsx(trecho) {
    if (!trecho) return "";
    if (!Object.prototype.hasOwnProperty.call(trecho, "observacaoOperacionalXlsx")) {
      trecho.observacaoOperacionalXlsx = trecho.observacaoOperacional || "";
    }
    return String(trecho.observacaoOperacionalXlsx || "");
  }

  function importedDefaultInternalObservation(trecho) {
    if (!trecho?.programacao) return "";
    if (isSplitImportedTrecho(trecho)) return `Serviço criado por Split na PG: ${trecho.programacao}.`;
    return String(trecho.programacao || "").trim();
  }

  function composeImportedTrechoPreferencias(trecho) {
    return (trecho?.passageiros || [])
      .map((passenger) => {
        const record = importedResolvedPassenger(passenger);
        const preferencias = String(record?.preferencias || passenger?.preferencias || "").trim();
        if (!preferencias) return "";
        const label = normalizePassengerDisplayName(record?.label || passenger?.passageiroLabel || passenger?.nome) || "Passageiro";
        return `${firstName(label) || label} - ${preferencias}`;
      })
      .filter(Boolean)
      .join(";\n");
  }

  function buildImportSelect(label, field, options, value) {
    const wrap = document.createElement("label");
    wrap.className = "field required import-field is-select";
    wrap.dataset.importInputType = "select";
    wrap.dataset.importCopy = "1";
    wrap.dataset.copyLabel = label;
    const span = document.createElement("span");
    span.textContent = label;
    const select = document.createElement("select");
    select.required = true;
    select.setAttribute("aria-required", "true");
    select.dataset.importField = field;
    select.innerHTML = '<option value=""></option>';
    (options || []).forEach((optionRow) => {
      const option = document.createElement("option");
      option.value = String(optionRow.value);
      option.textContent = optionRow.label;
      select.appendChild(option);
    });
    select.value = value ? String(value) : "";
    wrap.append(span, select);
    return wrap;
  }

  function buildImportSolicitanteSection(trecho, options = {}) {
    const isEditable = !!options.editable;
    const rows = importedSolicitanteLookupRows(trecho);
    const selectedValue = resolveImportedSolicitanteSelectValue(trecho, rows);
    const selectedRow = rows.find((row) => String(row.id) === String(selectedValue)) || null;
    const isLinkedSolicitante = !!selectedValue && !isImportedSolicitanteTempId(selectedValue);
    const hasSolicitante = !!selectedValue && !!selectedRow;
    const isPickerOpen = !!trecho.solicitantePickerOpen && isEditable && !hasSolicitante;
    const statusLabel = importedSolicitanteStatusLabel(selectedValue, selectedRow);
    const displayName = normalizePassengerDisplayName(selectedRow?.label) || selectedRow?.label || "Solicitante";
    const section = document.createElement("section");
    section.className = "import-solicitante-section";
    section.setAttribute("aria-label", "Solicitante");

    const head = document.createElement("div");
    head.className = "import-passengers-head import-solicitante-head";
    const title = document.createElement("strong");
    title.textContent = "Solicitante";
    head.appendChild(title);
    if (!hasSolicitante && isEditable && !isPickerOpen) {
      const addButton = buildImportAction("+", "add-import-solicitante");
      addButton.className = "import-add-inline-button import-add-solicitante-button";
      addButton.title = "Adicionar solicitante ao serviço";
      addButton.setAttribute("aria-label", "Adicionar solicitante ao serviço");
      head.appendChild(addButton);
    }

    section.appendChild(head);

    if (!hasSolicitante && !isPickerOpen) {
      const empty = document.createElement("p");
      empty.className = "import-passenger-empty import-solicitante-empty";
      empty.textContent = "Sem solicitante.";
      section.appendChild(empty);
      return section;
    }

    if (isPickerOpen) {
      const picker = document.createElement("div");
      picker.className = "import-solicitante-picker";
      picker.appendChild(buildImportSolicitanteSelect(trecho, rows, ""));
      section.appendChild(picker);
      return section;
    }

    const row = document.createElement("div");
    row.className = `import-passenger import-solicitante-row import-passenger-row passenger-row is-${isLinkedSolicitante ? "use-existing" : "create-new"}`;
    row.classList.toggle("is-locked", !isEditable);
    row.setAttribute("aria-label", "Solicitante");
    row.dataset.importSolicitante = "1";

    const label = document.createElement("div");
    label.className = "row-label";
    const rowIndex = document.createElement("span");
    rowIndex.className = "row-index";
    rowIndex.textContent = "S";
    rowIndex.setAttribute("aria-hidden", "true");

    const titleWrap = document.createElement("span");
    titleWrap.className = "row-title-wrap";
    const rowTitle = document.createElement("button");
    rowTitle.type = "button";
    rowTitle.className = "row-title passenger-name-button import-passenger-name-button import-solicitante-name-button";
    rowTitle.dataset.importAction = "open-import-solicitante";
    rowTitle.textContent = displayName;
    rowTitle.title = isLinkedSolicitante ? "Editar cadastro do solicitante" : "Editar dados antes de salvar";
    rowTitle.setAttribute("aria-label", isLinkedSolicitante ? `Editar ${displayName}` : `Editar dados importados de ${displayName}`);
    const statusDot = document.createElement("span");
    statusDot.className = "import-passenger-status-dot import-solicitante-status-dot";
    statusDot.title = statusLabel;
    statusDot.setAttribute("aria-label", statusLabel);
    const rowPreview = document.createElement("div");
    rowPreview.className = "passenger-preview";
    rowPreview.setAttribute("role", "status");
    rowPreview.setAttribute("aria-live", "polite");
    rowPreview.setAttribute("aria-hidden", "true");
    renderPassengerPreview(rowPreview, importedSolicitantePreviewRecord(trecho, selectedValue, rows));
    titleWrap.append(rowTitle, statusDot, rowPreview);
    label.append(rowIndex, titleWrap);

    const control = document.createElement("div");
    control.className = "import-passenger-decision import-passenger-compact-actions import-solicitante-actions";
    const status = document.createElement("strong");
    status.textContent = statusLabel;
    control.appendChild(status);
    if (isEditable) {
      const removeButton = buildImportRemoveButton("remove-import-solicitante", "Remover solicitante");
      removeButton.classList.add("import-solicitante-remove");
      control.appendChild(removeButton);
    }
    row.append(label);
    if (control.querySelector("button")) row.append(control);
    section.appendChild(row);
    return section;
  }

  function buildImportSolicitanteSelect(trecho, lookupRows = null, selectedValue = null) {
    const wrap = document.createElement("label");
    wrap.className = "field required import-solicitante-field is-select";
    wrap.dataset.importInputType = "select";
    wrap.dataset.importCopy = "1";
    wrap.dataset.copyLabel = "Solicitante";
    const span = document.createElement("span");
    span.textContent = "Solicitante";
    const select = document.createElement("select");
    select.dataset.importField = "solicitanteRecordId";
    select.dataset.selectVariant = "person-client";
    select.dataset.placeholderLabel = "Selecionar solicitante";
    wrap.append(span, select);
    const rows = lookupRows || importedSolicitanteLookupRows(trecho);
    renderLookupSelect(select, rows);
    const resolvedValue = selectedValue ?? resolveImportedSolicitanteSelectValue(trecho, rows);
    setSelectValue(select, resolvedValue);
    return wrap;
  }

  function buildImportPassengerAddSelect(trecho, lookupRows = null) {
    const wrap = document.createElement("label");
    wrap.className = "field required import-solicitante-field import-passenger-add-field is-select";
    wrap.dataset.importInputType = "select";
    wrap.dataset.importCopy = "1";
    wrap.dataset.copyLabel = "Passageiro";
    const span = document.createElement("span");
    span.textContent = "Passageiro";
    const select = document.createElement("select");
    select.dataset.importField = "passengerRecordIdToAdd";
    select.dataset.selectVariant = "person-client";
    select.dataset.placeholderLabel = "Selecionar passageiro";
    wrap.append(span, select);
    const rows = lookupRows || importedSolicitanteLookupRows(trecho);
    renderLookupSelect(select, rows);
    setSelectValue(select, "");
    return wrap;
  }

  function importedTrechoHasSolicitante(trecho) {
    const rows = importedSolicitanteLookupRows(trecho);
    const selectedValue = resolveImportedSolicitanteSelectValue(trecho, rows);
    return !!selectedValue && rows.some((row) => String(row.id) === String(selectedValue));
  }

  function importedSolicitanteLookupRows(trecho) {
    const existingRows = sortByLabel(state.passageiros);
    const existingNames = new Set(existingRows.map((row) => normalize(row.label)).filter(Boolean));
    const importedRows = importedSolicitanteCandidateRows(trecho)
      .filter((row) => !existingNames.has(normalize(row.label)));
    return [...importedRows, ...existingRows];
  }

  function importedSolicitanteCandidateRows(trecho = null) {
    const candidates = new Map();
    const importClientLabel = getImportClient()?.label || CONFIG.importDefaults.clienteLabel || "Cliente da importação";
    const addCandidate = (person = {}, sourceLabel = "Pendente de cadastro no XLSX") => {
      const name = normalizePassengerDisplayName(person.nome || person.label || person.solicitanteNome);
      const key = normalize(name);
      if (!key || candidates.has(key)) return;
      candidates.set(key, {
        id: importedSolicitanteTempId(name),
        label: name,
        clienteLabel: person.clienteLabel || importClientLabel,
        search: [name, person.telefone, person.email, person.centroCusto, sourceLabel].filter(Boolean).join(" "),
        sourcePerson: {
          nome: name,
          telefone: person.telefone || "",
          email: person.email || "",
          centroCusto: person.centroCusto || importedTrechoCr(trecho) || ""
        }
      });
    };

    if (trecho?.removedSolicitanteNome) addCandidate({ nome: trecho.removedSolicitanteNome }, "Removido deste serviço");
    if (trecho?.solicitanteNome) addCandidate({ nome: trecho.solicitanteNome, centroCusto: importedTrechoCr(trecho) }, "Importado da planilha");

    const programs = state.importReview?.programs || [];
    programs.forEach((program) => {
      (program?.trechos || []).forEach((item) => {
        if (item?.solicitanteNome) {
          addCandidate({ nome: item.solicitanteNome, centroCusto: importedTrechoCr(item) }, "Solicitante do XLSX");
        }
        (item?.passageiros || []).forEach((passenger) => {
          if (passenger?.matchStatus === "use-existing" && passenger?.passageiroId) return;
          addCandidate(passenger, "Passageiro do XLSX");
        });
      });
    });

    return sortByLabel(Array.from(candidates.values()));
  }

  function resolveImportedSolicitanteSelectValue(trecho, rows) {
    if (trecho?.solicitanteRecordId) return trecho.solicitanteRecordId;
    const importedName = String(trecho?.solicitanteRecordLabel || trecho?.solicitanteNome || "").trim();
    if (!importedName) return "";
    const existing = resolvePassengerByName(importedName);
    if (existing) return existing.id;
    return rows.find((row) => row.id === importedSolicitanteTempId(importedName))?.id || "";
  }

  function importedSolicitanteTempId(name) {
    return `__imported_solicitante__:${normalize(name)}`;
  }

  function isImportedSolicitanteTempId(value) {
    return String(value || "").startsWith("__imported_solicitante__:");
  }

  function importedSolicitantePersonFromValue(value, rows = [], trecho = null) {
    const row = rows.find((item) => String(item.id) === String(value)) || null;
    if (!row) return null;
    if (!isImportedSolicitanteTempId(value)) {
      const existing = getPassengerById(value);
      return existing ? {
        id: existing.id,
        label: existing.label,
        nome: existing.label,
        telefone: existing.telefone || "",
        email: existing.email || "",
        centroCusto: existing.cr || ""
      } : null;
    }
    return {
      ...(row.sourcePerson || {}),
      nome: row.sourcePerson?.nome || row.label,
      label: row.label,
      centroCusto: row.sourcePerson?.centroCusto || importedTrechoCr(trecho) || ""
    };
  }

  function importedPersonNameKey(person = {}) {
    return normalize(normalizePassengerDisplayName(
      person.nome || person.label || person.passageiroLabel || person.solicitanteNome || ""
    ));
  }

  function importedPassengerIdentityKey(passenger = {}) {
    const id = cleanGuid(passenger.passageiroId || passenger.id || "");
    if (id) return `id:${id.toLowerCase()}`;
    const name = importedPersonNameKey(passenger);
    return name ? `name:${name}` : "";
  }

  function importedSolicitanteIdentityKey(trecho, selectedValue = null, rows = null) {
    const lookupRows = rows || importedSolicitanteLookupRows(trecho);
    const value = selectedValue ?? resolveImportedSolicitanteSelectValue(trecho, lookupRows);
    if (!value) return "";
    if (!isImportedSolicitanteTempId(value)) {
      const id = cleanGuid(value);
      return id ? `id:${id.toLowerCase()}` : "";
    }
    const row = lookupRows.find((item) => String(item.id) === String(value)) || null;
    const draft = trecho?.solicitantePessoaImportada || {};
    const name = importedPersonNameKey({
      nome: draft.nome || row?.sourcePerson?.nome || row?.label || trecho?.solicitanteRecordLabel || trecho?.solicitanteNome
    });
    return name ? `name:${name}` : "";
  }

  function importedPassengerMatchesIdentity(passenger, identity) {
    if (!passenger || !identity) return false;
    return importedPassengerIdentityKey(passenger) === identity
      || (identity.startsWith("name:") && `name:${importedPersonNameKey(passenger)}` === identity);
  }

  function importedPassengerDraftRecord(passenger = {}) {
    const nome = normalizePassengerDisplayName(passenger.nome || passenger.label || passenger.passageiroLabel);
    return {
      nome,
      label: nome,
      telefone: passenger.telefone || "",
      email: passenger.email || "",
      centroCusto: ""
    };
  }

  function applyExistingPassengerToImportedPassenger(passenger, existing, message = "") {
    if (!passenger || !existing) return passenger;
    const label = normalizePassengerDisplayName(existing.label || passenger.passageiroLabel || passenger.nome);
    passenger.matchStatus = "use-existing";
    passenger.matchMessage = message || "Cadastro existente vinculado. Banco de Dados não será atualizado.";
    passenger.passageiroId = existing.id || passenger.passageiroId || "";
    passenger.passageiroLabel = label;
    passenger.nome = label;
    passenger.telefone = existing.telefone || "";
    passenger.email = existing.email || "";
    passenger.centroCusto = "";
    passenger.preferencias = existing.preferencias || "";
    return passenger;
  }

  function createImportPassengerFromSelectedPerson(trecho, value, rows = null) {
    const lookupRows = rows || importedSolicitanteLookupRows(trecho);
    const selected = importedSolicitantePersonFromValue(value, lookupRows, trecho);
    if (!selected) return null;
    const passenger = createImportPassengerDraft(trecho);
    const name = normalizePassengerDisplayName(selected.nome || selected.label);
    passenger.nome = name;
    passenger.telefone = selected.telefone || "";
    passenger.email = selected.email || "";
    passenger.centroCusto = "";
    passenger.matchCandidates = [];
    if (!isImportedSolicitanteTempId(value)) {
      passenger.matchStatus = "use-existing";
      applyExistingPassengerToImportedPassenger(
        passenger,
        getPassengerById(selected.id || value) || {
          id: selected.id || value,
          label: selected.label || name,
          telefone: selected.telefone || "",
          email: selected.email || "",
          cr: ""
        },
        "Cadastro existente vinculado. Banco de Dados não será atualizado."
      );
      return passenger;
    }
    passenger.matchStatus = "create-new";
    passenger.passageiroId = "";
    passenger.passageiroLabel = "";
    passenger.matchMessage = "Criar novo com nome, telefone, email e cliente.";
    return passenger;
  }

  function linkedImportedPassengerForSolicitante(trecho, selectedValue = null, rows = null, identityOverride = "") {
    const identity = identityOverride || importedSolicitanteIdentityKey(trecho, selectedValue, rows);
    if (!identity) return null;
    return (trecho?.passageiros || []).find((passenger) => importedPassengerMatchesIdentity(passenger, identity)) || null;
  }

  function importedSolicitanteStatusLabel(value, row = null) {
    if (!value) return "Solicitante pendente";
    const label = normalizePassengerDisplayName(row?.label) || row?.label || "solicitante";
    return isImportedSolicitanteTempId(value)
      ? "Criar novo solicitante"
      : `Usar existente: ${label}`;
  }

  function importedSolicitanteEditableRecord(trecho, selectedValue = null, rows = null) {
    const lookupRows = rows || importedSolicitanteLookupRows(trecho);
    const value = selectedValue ?? resolveImportedSolicitanteSelectValue(trecho, lookupRows);
    const selected = importedSolicitantePersonFromValue(value, lookupRows, trecho) || {};
    const linkedPassenger = linkedImportedPassengerForSolicitante(trecho, value, lookupRows);
    const linked = linkedPassenger && (!value || isImportedSolicitanteTempId(value))
      ? importedPassengerDraftRecord(linkedPassenger)
      : {};
    const draft = trecho?.solicitantePessoaImportada || {};
    const nome = normalizePassengerDisplayName(
      linked.nome || draft.nome || selected.nome || selected.label || trecho?.solicitanteRecordLabel || trecho?.solicitanteNome
    );
    return {
      nome,
      label: nome,
      telefone: linked.telefone || draft.telefone || selected.telefone || "",
      email: linked.email || draft.email || selected.email || "",
      centroCusto: ""
    };
  }

  function syncImportedSolicitanteDraft(trecho, draft, linkedPassenger = null) {
    if (!trecho) return;
    const nome = normalizePassengerDisplayName(draft?.nome || draft?.label);
    const linkedPassengerId = cleanGuid(linkedPassenger?.passageiroId || linkedPassenger?.id || "");
    if (linkedPassengerId) {
      trecho.solicitantePessoaImportada = null;
      trecho.solicitanteNome = nome || linkedPassenger?.passageiroLabel || linkedPassenger?.label || "";
      trecho.solicitanteRecordLabel = nome || linkedPassenger?.passageiroLabel || linkedPassenger?.label || "";
      trecho.solicitanteRecordId = linkedPassengerId;
      return;
    }
    trecho.solicitantePessoaImportada = {
      nome,
      telefone: draft?.telefone || "",
      email: draft?.email || "",
      centroCusto: ""
    };
    trecho.solicitanteNome = nome;
    trecho.solicitanteRecordLabel = nome;
    trecho.solicitanteRecordId = nome ? importedSolicitanteTempId(nome) : "";
  }

  function syncImportedSolicitanteFromPassenger(trecho, passenger, previousIdentity = "") {
    if (!trecho || !passenger) return false;
    const rows = importedSolicitanteLookupRows(trecho);
    const solicitanteIdentity = importedSolicitanteIdentityKey(trecho, null, rows);
    const matchesPrevious = previousIdentity && solicitanteIdentity === previousIdentity;
    const matchesCurrent = importedPassengerMatchesIdentity(passenger, solicitanteIdentity);
    if (!matchesPrevious && !matchesCurrent) return false;
    syncImportedSolicitanteDraft(trecho, importedPassengerDraftRecord(passenger), passenger);
    return true;
  }

  function syncImportedPassengerFromSolicitante(trecho, draft, previousIdentity = "") {
    if (!trecho || !draft) return false;
    const rows = importedSolicitanteLookupRows(trecho);
    const currentIdentity = importedSolicitanteIdentityKey(trecho, null, rows);
    const passenger = (trecho.passageiros || []).find((item) => (
      (previousIdentity && importedPassengerMatchesIdentity(item, previousIdentity))
      || importedPassengerMatchesIdentity(item, currentIdentity)
    ));
    if (!passenger) return false;
    passenger.nome = normalizePassengerDisplayName(draft.nome || draft.label);
    passenger.telefone = draft.telefone || "";
    passenger.email = draft.email || "";
    passenger.centroCusto = "";
    passenger.passageiroId = "";
    passenger.passageiroLabel = "";
    passenger.matchCandidates = [];
    passenger.matchStatus = "create-new";
    passenger.matchMessage = "Dados revisados no mesmo registro do solicitante. Ao salvar, o sistema revalida duplicidade antes de criar.";
    return true;
  }

  function resolvePassengerByName(name) {
    const normalizedName = normalize(name);
    if (!normalizedName) return null;
    return state.passageiros.find((passenger) => normalize(passenger.label) === normalizedName) || null;
  }

  function buildImportPassengerRow(passenger, index, options = {}) {
    const isEditable = !!options.editable;
    const isExistingPassenger = !!cleanGuid(passenger.passageiroId || "");
    const displayName = normalizePassengerDisplayName(passenger.nome || passenger.passageiroLabel) || "Passageiro";
    const row = document.createElement("div");
    row.className = `import-passenger import-passenger-row passenger-row is-${passenger.matchStatus || "pending"}`;
    row.classList.toggle("is-locked", !isEditable);
    row.dataset.passengerIndex = String(index);

    const label = document.createElement("div");
    label.className = "row-label";
    const rowIndex = document.createElement("span");
    rowIndex.className = "row-index";
    rowIndex.textContent = String(index + 1).padStart(2, "0");
    rowIndex.setAttribute("aria-hidden", "true");
    const titleWrap = document.createElement("span");
    titleWrap.className = "row-title-wrap";
    const rowTitle = document.createElement("button");
    rowTitle.type = "button";
    rowTitle.className = "row-title passenger-name-button import-passenger-name-button";
    rowTitle.dataset.importAction = "open-import-passenger";
    rowTitle.textContent = displayName;
    rowTitle.title = isExistingPassenger ? "Editar cadastro do passageiro" : "Editar dados antes de salvar";
    rowTitle.setAttribute("aria-label", isExistingPassenger ? `Editar ${displayName}` : `Editar dados importados de ${displayName}`);
    const statusDot = document.createElement("span");
    statusDot.className = "import-passenger-status-dot";
    statusDot.title = importedPassengerStatusLabel(passenger);
    statusDot.setAttribute("aria-label", importedPassengerStatusLabel(passenger));
    const rowPreview = document.createElement("div");
    rowPreview.className = "passenger-preview";
    rowPreview.setAttribute("role", "status");
    rowPreview.setAttribute("aria-live", "polite");
    rowPreview.setAttribute("aria-hidden", "true");
    const compareRecord = importedPassengerExistingCompareRecord(passenger);
    if (compareRecord) {
      renderImportedPassengerComparisonPreview(rowPreview, passenger, compareRecord);
    } else {
      renderPassengerPreview(rowPreview, importedPassengerPreviewRecord(passenger));
    }
    titleWrap.append(rowTitle, statusDot, rowPreview);
    label.append(rowIndex, titleWrap);

    const decision = document.createElement("div");
    decision.className = "import-passenger-decision import-passenger-compact-actions";
    const status = document.createElement("strong");
    status.textContent = importedPassengerStatusLabel(passenger);
    decision.appendChild(status);
    if (isEditable) {
      const removeButton = buildImportRemoveButton("remove-import-passenger", `Remover ${displayName}`);
      removeButton.classList.add("import-passenger-remove");
      decision.appendChild(removeButton);
    }
    if (passenger.matchStatus === "ambiguous" && passenger.matchCandidates?.length) {
      const reviewButton = document.createElement("button");
      reviewButton.type = "button";
      reviewButton.className = "text-action primary import-passenger-match-cta";
      reviewButton.dataset.importAction = "open-passenger-match-review";
      reviewButton.textContent = "Validar";
      reviewButton.title = "Abrir a validação completa deste passageiro importado.";
      decision.appendChild(reviewButton);
    }

    row.append(label);
    if (decision.querySelector("button")) {
      row.append(decision);
    }
    return row;
  }

  async function openImportedPassengerMatchReview(trecho, passenger) {
    if (!trecho || !passenger?.matchCandidates?.length) return;
    const displayName = normalizePassengerDisplayName(passenger.nome || passenger.passageiroLabel) || "Passageiro importado";
    const decision = await openPassengerMatchReview(passenger.matchCandidates, {
      mode: "import",
      eyebrow: "Passageiro parecido",
      title: displayName,
      summary: "Selecione o cadastro verdadeiro ou crie um novo.",
      cancelLabel: "Fechar",
      continueLabel: "Criar novo",
      useSelectedLabel: "Usar selecionado",
      importedPassenger: passenger
    });
    if (decision.action === "cancel") return;

    const previousIdentity = importedPassengerIdentityKey(passenger);
    if (decision.action === "use-existing") {
      const candidate = passenger.matchCandidates.find((item) => sameId(item.passenger.id, decision.passengerId));
      if (!candidate) return;
      captureImportReviewHistory("Vincular passageiro existente");
      markImportedReviewPending(trecho);
      mergePassengerRecords([candidate.passenger]);
      applyExistingPassengerToImportedPassenger(
        passenger,
        candidate.passenger,
        "Cadastro existente vinculado. Banco de Dados não será atualizado."
      );
      syncImportedSolicitanteFromPassenger(trecho, passenger, previousIdentity);
      renderImportReviewPreservingGallery();
      return;
    }

    if (decision.action === "continue") {
      captureImportReviewHistory("Criar novo passageiro");
      markImportedReviewPending(trecho);
      passenger.matchStatus = "create-new";
      passenger.passageiroId = "";
      passenger.passageiroLabel = "";
      passenger.matchMessage = "Criar novo com nome, telefone, email e cliente.";
      syncImportedSolicitanteFromPassenger(trecho, passenger, previousIdentity);
      renderImportReviewPreservingGallery();
    }
  }

  function importedPassengerPreviewRecord(passenger) {
    const existing = importedResolvedPassenger(passenger);
    const importClient = getImportClient();
    return {
      ...(existing || {}),
      id: existing?.id || passenger.passageiroId || "",
      label: normalizePassengerDisplayName(existing?.label || passenger.passageiroLabel || passenger.nome) || "Passageiro",
      telefone: existing?.telefone || passenger.telefone || "",
      email: existing?.email || passenger.email || "",
      clienteLabel: existing?.clienteLabel || importClient?.label || CONFIG.importDefaults.clienteLabel || "",
      cargo: existing?.cargo || "",
      departamento: existing?.departamento || "",
      cr: "",
      preferencias: existing?.preferencias || "",
      tipoVeiculoLabel: existing?.tipoVeiculoLabel || "",
      endereco: existing?.endereco || "",
      importStatus: importedPassengerStatusLabel(passenger),
      idioma: existing?.idioma || "",
      sexo: existing?.sexo || "",
      classificacao: existing?.classificacao || ""
    };
  }

  function buildImportAction(label, action, disabled = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = action === "save-trecho" || action === "confirm-review" ? "primary-action" : "secondary-action";
    button.dataset.importAction = action;
    button.textContent = label;
    button.disabled = !!disabled;
    return button;
  }

  function importedSolicitantePreviewRecord(trecho, selectedValue = null, rows = null) {
    const lookupRows = rows || importedSolicitanteLookupRows(trecho);
    const value = selectedValue ?? resolveImportedSolicitanteSelectValue(trecho, lookupRows);
    const existing = value && !isImportedSolicitanteTempId(value) ? getPassengerById(value) : null;
    const draft = importedSolicitanteEditableRecord(trecho, value, lookupRows);
    const importClient = getImportClient();
    return {
      ...(existing || {}),
      id: existing?.id || value || "",
      label: normalizePassengerDisplayName(existing?.label || draft.label || draft.nome) || "Solicitante",
      telefone: existing?.telefone || draft.telefone || "",
      email: existing?.email || draft.email || "",
      clienteLabel: existing?.clienteLabel || importClient?.label || CONFIG.importDefaults.clienteLabel || "",
      cargo: existing?.cargo || "",
      departamento: existing?.departamento || "",
      cr: "",
      preferencias: existing?.preferencias || "",
      tipoVeiculoLabel: existing?.tipoVeiculoLabel || "",
      endereco: existing?.endereco || "",
      importStatus: importedSolicitanteStatusLabel(value, lookupRows.find((row) => String(row.id) === String(value))),
      idioma: existing?.idioma || "",
      sexo: existing?.sexo || "",
      classificacao: existing?.classificacao || ""
    };
  }

  function importedPassengerExistingCompareRecord(passenger) {
    if (passenger.matchStatus !== "ambiguous") return null;
    return passenger.matchCandidates?.[0]?.passenger || null;
  }

  function buildImportRemoveButton(action, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "import-row-remove-button";
    button.dataset.importAction = action;
    button.title = label;
    button.setAttribute("aria-label", label);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("import-row-remove-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M7 7l10 10M17 7L7 17");
    svg.appendChild(path);
    button.appendChild(svg);
    return button;
  }

  function importedPassengerStatusLabel(passenger) {
    if (passenger.matchStatus === "use-existing") return `Usar existente: ${passenger.passageiroLabel}`;
    if (passenger.matchStatus === "create-new") return "Criar novo passageiro";
    if (passenger.matchStatus === "ambiguous") return "Confirmar se é o mesmo passageiro";
    if (passenger.matchStatus === "invalid") return passenger.matchMessage || "Inválido";
    return passenger.matchMessage || "Pendente";
  }

  function importedTrechoIssues(trecho) {
    const issues = [...(trecho?.pendencias || [])];
    if (!getImportClient()?.id) issues.push("Cliente Embraer ausente.");
    if (!trecho.dataIso) issues.push("Data inválida.");
    if (!trecho.horario) issues.push("Horário vazio.");
    if (!trecho.destino) issues.push("Destino vazio.");
    if (!resolveImportOption("tipoServico", trecho.tipoServicoValue, trecho.tipoServicoSugerido)) issues.push("Tipo de serviço sem mapeamento.");
    if (!resolveImportOption("tipoVeiculo", trecho.tipoVeiculoValue, trecho.tipoVeiculoSugerido)) issues.push("Tipo de veículo sem mapeamento.");
    if (!trecho.passageiros.length) issues.push("Nenhum passageiro informado.");
    trecho.passageiros.forEach((passenger) => {
      if (!String(passenger.nome || "").trim()) issues.push("Passageiro sem nome.");
      if (passenger.matchStatus === "ambiguous") issues.push(`Decidir passageiro: ${passenger.nome}.`);
      if (passenger.matchStatus === "invalid") issues.push(`Passageiro inválido na linha ${passenger.sourceRow}.`);
    });
    return Array.from(new Set(issues));
  }

  async function handleImportFieldCopy(event) {
    const copyTarget = event.target.closest("[data-import-copy]");
    if (!copyTarget || event.target.closest("[data-import-action]")) return;
    const trechoCard = copyTarget.closest(".import-trecho");
    if (!trechoCard || (!trechoCard.classList.contains("is-locked") && !trechoCard.classList.contains("is-duplicated"))) return;
    const control = copyTarget.querySelector("[data-import-field], [data-import-passenger-field], [data-import-observation-text]");
    const value = importCopyControlValue(control);
    if (!value) return;
    try {
      await copyTextToClipboard(value);
      showImportFieldCopyFeedback(copyTarget);
    } catch (error) {
      console.warn("Falha ao copiar campo importado", error);
      showImportFieldCopyFeedback(copyTarget, "Não copiou");
    }
  }

  function importCopyControlValue(control) {
    if (!control) return "";
    if (control.tagName === "SELECT") {
      return control.selectedOptions?.[0]?.textContent?.trim() || control.value || "";
    }
    return String(control.value || "").trim();
  }

  function showImportFieldCopyFeedback(target, message = "Copiado") {
    target.dataset.copyFeedback = message;
    target.classList.add("is-copied");
    window.clearTimeout(target._importCopyTimer);
    target._importCopyTimer = window.setTimeout(() => {
      target.classList.remove("is-copied");
      delete target.dataset.copyFeedback;
    }, 1100);
  }

  function handleImportReviewFilterAction(event) {
    const historyButton = event.target.closest("[data-import-history-action]");
    if (historyButton && state.importReview) {
      if (historyButton.dataset.importHistoryAction === "undo") undoImportReviewChange();
      if (historyButton.dataset.importHistoryAction === "redo") redoImportReviewChange();
      return;
    }
    const button = event.target.closest("[data-import-filter]");
    if (!button || !state.importReview) return;
    state.importReviewFilter = normalizeImportReviewFilter(button.dataset.importFilter);
    renderImportReviewPreservingGallery(0);
  }

  function handleImportReviewKeyboardNavigation(event) {
    if (!shouldHandleImportReviewKeyboardNavigation(event)) return;
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const rows = visibleImportServiceRows();
    if (!rows.length) return;
    const currentIndex = currentImportServiceRowIndex(rows, event.target);
    const nextIndex = Math.max(0, Math.min(rows.length - 1, currentIndex + direction));
    if (nextIndex === currentIndex) return;
    const nextRow = rows[nextIndex];
    event.preventDefault();
    selectImportedTrechoFromKeyboard(nextRow);
  }

  function shouldHandleImportReviewKeyboardNavigation(event) {
    if (!state.importReview) return false;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return false;
    if (isTextEditingTarget(event.target)) return false;
    return !!event.target.closest("#importReviewPrograms");
  }

  function visibleImportServiceRows() {
    return [...(el.importReviewPrograms?.querySelectorAll(".import-service-row[data-programacao][data-trecho-key]") || [])];
  }

  function currentImportServiceRowIndex(rows, target) {
    const focusedRow = target?.closest?.(".import-service-row[data-programacao][data-trecho-key]");
    if (focusedRow) {
      const focusedIndex = rows.indexOf(focusedRow);
      if (focusedIndex >= 0) return focusedIndex;
    }
    const currentProgramacao = state.importReview?.selectedProgramacao || "";
    const currentTrechoKey = state.importReview?.selectedTrechoKey || "";
    const selectedIndex = rows.findIndex((row) => (
      row.dataset.programacao === currentProgramacao && row.dataset.trechoKey === currentTrechoKey
    ));
    return selectedIndex >= 0 ? selectedIndex : 0;
  }

  function selectImportedTrechoFromKeyboard(row) {
    if (!row || !state.importReview) return;
    const programacao = row.dataset.programacao || "";
    const trechoKey = row.dataset.trechoKey || "";
    const listScrollTop = row.closest(".import-service-list")?.scrollTop ?? 0;
    state.importReview.selectedProgramacao = programacao;
    state.importReview.selectedTrechoKey = trechoKey;
    renderImportReviewPreservingGallery(listScrollTop);
    requestAnimationFrame(() => {
      focusImportedServiceRow(programacao, trechoKey);
    });
  }

  function focusImportedServiceRow(programacao, trechoKey) {
    const programSelector = escapeAttributeSelectorValue(programacao);
    const trechoSelector = escapeAttributeSelectorValue(trechoKey);
    const row = el.importReviewPrograms?.querySelector(
      `.import-service-row[data-programacao="${programSelector}"][data-trecho-key="${trechoSelector}"]`
    );
    if (!row) return;
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function handleImportReviewAction(event) {
    const action = event.target.closest("[data-import-action]");
    if (!action) return;
    const trechoCard = action.closest("[data-trecho-key]");
    const passengerRow = action.closest("[data-passenger-index]");
    const trecho = trechoCard ? findImportedTrecho(trechoCard.dataset.programacao, trechoCard.dataset.trechoKey) : null;
    if (!trecho) return;

    if (action.dataset.importAction === "switch-import-obs") {
      const next = action.dataset.importObsType || "motorista";
      const obs = ensureImportedObservationState(trecho);
      const textarea = trechoCard.querySelector("[data-import-observation-text]");
      obs[obs.current || "motorista"] = textarea?.value || "";
      obs.current = next;
      trecho.observacaoAtual = next;
      syncImportedObservationFields(trecho);
      trechoCard.querySelectorAll("[data-import-obs-type]").forEach((button) => {
        const isActive = button.dataset.importObsType === next;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", String(isActive));
      });
      if (textarea) {
        textarea.value = obs[next] || "";
        textarea.readOnly = !isImportedTrechoEditing(trechoCard.dataset.programacao, trechoCard.dataset.trechoKey);
        requestAnimationFrame(() => {
          textarea.focus();
          textarea.setSelectionRange?.(textarea.value.length, textarea.value.length);
        });
      }
      return;
    }
    if (action.dataset.importAction === "noop") {
      return;
    }
    if (action.dataset.importAction === "select-trecho") {
      const listScrollTop = action.closest(".import-service-list")?.scrollTop ?? 0;
      state.importReview.selectedProgramacao = trechoCard.dataset.programacao;
      state.importReview.selectedTrechoKey = trechoCard.dataset.trechoKey;
      setImportedTrechoEditMode(trechoCard.dataset.programacao, trechoCard.dataset.trechoKey, isDraftImportedTrecho(trecho));
      renderImportReviewPreservingGallery(listScrollTop);
      return;
    }
    if (action.dataset.importAction === "toggle-edit") {
      if (trecho.duplicatedRecordIds?.length) {
        toast("Serviço já existe no sistema. Edite pelo sistema.", "warning", 6000);
        return;
      }
      const programacao = trechoCard.dataset.programacao;
      const trechoKey = trechoCard.dataset.trechoKey;
      const enable = !isImportedTrechoEditing(programacao, trechoKey);
      setImportedTrechoEditMode(programacao, trechoKey, enable);
      renderImportReviewPreservingGallery();
      if (enable) {
        requestAnimationFrame(() => {
          el.importReviewPrograms?.querySelector(".import-inspector [data-import-field], .import-inspector [data-import-passenger-field], .import-inspector [data-import-observation-text]")?.focus();
        });
      }
      return;
    }
    if (action.dataset.importAction === "split-trecho") {
      if (normalizeImportedReviewStatus(trecho) !== importReviewStatuses().PENDING) {
        toast("Separar ida/busca só é permitido enquanto o serviço está pendente.", "warning", 5000);
        return;
      }
      if (!canShowImportedSplitAction(trecho, normalizeImportedReviewStatus(trecho), !!trecho.duplicatedRecordIds?.length)) {
        toast("Separar ida/busca indisponível para este serviço.", "warning", 5000);
        return;
      }
      if (trecho.duplicatedRecordIds?.length) {
        toast("Serviço já existe no sistema. Edite pelo sistema.", "warning", 6000);
        return;
      }
      if (isDraftImportedTrecho(trecho)) {
        toast("Split disponível apenas no serviço importado original.", "warning", 5000);
        return;
      }
      const modes = importOperationalModes();
      const cannotSplitInterpretedPg = trecho.operationalMode === modes.MULTI_PICKUP
        || trecho.operationalMode === modes.INDEPENDENT_SERVICES
        || !importedTrechoHasReturn(trecho);
      if (cannotSplitInterpretedPg) {
        toast("Split indisponível para esta interpretação da PG.", "warning", 5000);
        return;
      }
      const listScrollTop = el.importReviewPrograms?.querySelector(".import-service-list")?.scrollTop ?? 0;
      captureImportReviewHistory("Separar ida/busca");
      const clone = splitImportedTrechoForReview(trechoCard.dataset.programacao, trecho);
      renderImportReviewPreservingGallery(listScrollTop);
      requestAnimationFrame(() => {
        el.importReviewPrograms?.querySelector(".import-inspector [data-import-field]")?.focus();
      });
      toast(clone ? "Busca separada criada. Revise os dados pré-preenchidos." : "Não consegui criar Split.", clone ? "success" : "error", 6000);
      return;
    }
    if (action.dataset.importAction === "confirm-review") {
      if (trecho.duplicatedRecordIds?.length) {
        toast("Serviço já existe no sistema. Para editar, acesse o serviço no sistema.", "warning", 7000);
        return;
      }
      const issues = importedTrechoIssues(trecho);
      captureImportReviewHistory("Validar serviço");
      window.XlsxImportCore?.confirmImportedTrechoReview?.(trecho, issues);
      if (!window.XlsxImportCore?.confirmImportedTrechoReview) {
        const statuses = importReviewStatuses();
        trecho.reviewStatus = issues.length ? statuses.BLOCKED : statuses.CONFIRMED;
        trecho.reviewBlockReason = issues[0] || "";
      }
      if (issues.length) {
        toast(`Não validado: ${issues[0]}`, "error", 8000);
      } else {
        toast("Serviço validado. Ele será incluído ao salvar a importação.", "success", 4500);
      }
      setImportedTrechoEditMode(trechoCard.dataset.programacao, trechoCard.dataset.trechoKey, false);
      renderImportReviewPreservingGallery();
      return;
    }
    if (action.dataset.importAction === "ignore-trecho") {
      captureImportReviewHistory("Ignorar serviço");
      window.XlsxImportCore?.ignoreImportedTrechoReview?.(trecho, "Ignorado manualmente na revisão.");
      if (!window.XlsxImportCore?.ignoreImportedTrechoReview) {
        trecho.reviewStatus = importReviewStatuses().IGNORED;
        trecho.reviewBlockReason = "Ignorado manualmente na revisão.";
        trecho.autoIgnoredByDuplicate = false;
      }
      setImportedTrechoEditMode(trechoCard.dataset.programacao, trechoCard.dataset.trechoKey, false);
      renderImportReviewPreservingGallery();
      toast("Serviço ignorado. Ele não será salvo nesta importação.", "error", 4500);
      return;
    }
    if (action.dataset.importAction === "review-pending") {
      captureImportReviewHistory("Revisar novamente");
      window.XlsxImportCore?.markImportedTrechoPending?.(trecho);
      if (!window.XlsxImportCore?.markImportedTrechoPending) {
        trecho.reviewStatus = importReviewStatuses().PENDING;
        trecho.reviewBlockReason = "";
        trecho.autoIgnoredByDuplicate = false;
      }
      state.importReview.selectedProgramacao = trechoCard.dataset.programacao;
      state.importReview.selectedTrechoKey = trechoCard.dataset.trechoKey;
      setImportedTrechoEditMode(trechoCard.dataset.programacao, trechoCard.dataset.trechoKey, false);
      renderImportReviewPreservingGallery();
      return;
    }
    if (action.dataset.importAction === "save-trecho") {
      if (isSplitImportedTrecho(trecho)) {
        saveImportedSplitGroup(trecho);
      } else {
        saveImportedTrecho(trecho);
      }
      return;
    }
    if (action.dataset.importAction === "add-import-passenger") {
      if (!isImportedTrechoEditing(trechoCard.dataset.programacao, trechoCard.dataset.trechoKey)) {
        toast("Habilite a edição pelo ícone de lápis antes de alterar o serviço.", "warning", 5000);
        return;
      }
      trecho.solicitantePickerOpen = false;
      trecho.passengerPickerOpen = true;
      renderImportReviewPreservingGallery();
      return;
    }
    if (action.dataset.importAction === "add-import-solicitante") {
      if (!isImportedTrechoEditing(trechoCard.dataset.programacao, trechoCard.dataset.trechoKey)) {
        toast("Habilite a edição pelo ícone de lápis antes de alterar o serviço.", "warning", 5000);
        return;
      }
      trecho.passengerPickerOpen = false;
      trecho.solicitantePickerOpen = true;
      renderImportReviewPreservingGallery();
      return;
    }
    if (action.dataset.importAction === "open-import-solicitante") {
      openImportedSolicitanteEdit(trechoCard.dataset.programacao, trechoCard.dataset.trechoKey);
      return;
    }
    if (action.dataset.importAction === "remove-import-solicitante") {
      if (!isImportedTrechoEditing(trechoCard.dataset.programacao, trechoCard.dataset.trechoKey)) {
        toast("Habilite a edição pelo ícone de lápis antes de alterar o serviço.", "warning", 5000);
        return;
      }
      captureImportReviewHistory("Remover solicitante");
      markImportedReviewPending(trecho);
      trecho.removedSolicitanteNome = trecho.solicitanteRecordLabel || trecho.solicitanteNome || trecho.removedSolicitanteNome || "";
      trecho.solicitanteRecordId = "";
      trecho.solicitanteRecordLabel = "";
      trecho.solicitanteNome = "";
      trecho.solicitantePessoaImportada = null;
      trecho.solicitantePickerOpen = false;
      renderImportReviewPreservingGallery();
      return;
    }
    if (passengerRow) {
      const passengerIndex = Number(passengerRow.dataset.passengerIndex);
      const passenger = trecho.passageiros[passengerIndex];
      if (!passenger) return;
      if (action.dataset.importAction === "open-passenger-match-review") {
        openImportedPassengerMatchReview(trecho, passenger);
        return;
      }
      if (action.dataset.importAction === "open-import-passenger") {
        openImportedPassengerEdit(trechoCard.dataset.programacao, trechoCard.dataset.trechoKey, passengerIndex);
        return;
      }
      if (action.dataset.importAction === "use-existing-passenger") {
        const candidate = passenger.matchCandidates.find((item) => sameId(item.passenger.id, action.dataset.passengerId));
        if (!candidate) return;
        const previousIdentity = importedPassengerIdentityKey(passenger);
        captureImportReviewHistory("Vincular passageiro existente");
        markImportedReviewPending(trecho);
        mergePassengerRecords([candidate.passenger]);
        applyExistingPassengerToImportedPassenger(
          passenger,
          candidate.passenger,
          "Cadastro existente vinculado. Banco de Dados não será atualizado."
        );
        syncImportedSolicitanteFromPassenger(trecho, passenger, previousIdentity);
        renderImportReviewPreservingGallery();
        return;
      }
      if (action.dataset.importAction === "create-new-passenger") {
        const previousIdentity = importedPassengerIdentityKey(passenger);
      captureImportReviewHistory("Criar novo passageiro");
      markImportedReviewPending(trecho);
      passenger.matchStatus = "create-new";
      passenger.passageiroId = "";
      passenger.passageiroLabel = "";
      passenger.matchMessage = "Criar novo com nome, telefone, email e cliente.";
      syncImportedSolicitanteFromPassenger(trecho, passenger, previousIdentity);
      renderImportReviewPreservingGallery();
      return;
      }
      if (!isImportedTrechoEditing(trechoCard.dataset.programacao, trechoCard.dataset.trechoKey)) {
        toast("Habilite a edição pelo ícone de lápis antes de alterar o serviço.", "warning", 5000);
        return;
      }
      if (action.dataset.importAction === "remove-import-passenger") {
        captureImportReviewHistory("Remover passageiro");
        markImportedReviewPending(trecho);
        trecho.passageiros.splice(passengerIndex, 1);
        trecho.destino = composeImportPassengerDestinations(trecho);
      }
      renderImportReviewPreservingGallery();
    }
  }

  function handleImportReviewInput(event) {
    const trechoCard = event.target.closest("[data-trecho-key]");
    if (!trechoCard) return;
    const trecho = findImportedTrecho(trechoCard.dataset.programacao, trechoCard.dataset.trechoKey);
    if (!trecho) return;
    if (trecho.duplicatedRecordIds?.length) {
      event.preventDefault();
      toast("Serviço repetido não permite edição nesta tela.", "warning", 6000);
      return;
    }
    const passengerRow = event.target.closest("[data-passenger-index]");
    const passengerField = event.target.dataset.importPassengerField;
    if (!isImportedTrechoEditing(trechoCard.dataset.programacao, trechoCard.dataset.trechoKey)) {
      event.preventDefault();
      return;
    }

    if (event.target.dataset.importObservationText) {
      const obs = ensureImportedObservationState(trecho);
      const current = obs.current || "motorista";
      if (String(obs[current] ?? "") === String(event.target.value ?? "")) return;
      captureImportReviewHistoryForEditSession(event.target, "Editar observação do serviço");
      markImportedReviewPending(trecho);
      obs[current] = event.target.value;
      syncImportedObservationFields(trecho);
      return;
    }

    if (passengerRow && passengerField) {
      const passenger = trecho.passageiros[Number(passengerRow.dataset.passengerIndex)];
      if (!passenger) return;
      if (String(passenger[passengerField] ?? "") === String(event.target.value ?? "")) return;
      captureImportReviewHistoryForEditSession(event.target, "Editar passageiro do serviço");
      markImportedReviewPending(trecho);
      passenger[passengerField] = event.target.value;
      if (["nome", "telefone", "email"].includes(passengerField)) {
        passenger.passageiroId = "";
        passenger.passageiroLabel = "";
        passenger.matchCandidates = [];
        passenger.matchStatus = "create-new";
        passenger.matchMessage = "Dados revisados. Ao salvar, o sistema revalida duplicidade antes de criar.";
      }
      if (passengerField === "destino") {
        trecho.destino = composeImportPassengerDestinations(trecho);
        const destinoField = trechoCard.querySelector('[data-import-field="destino"]');
        if (destinoField) destinoField.value = trecho.destino;
      }
      return;
    }

    const field = event.target.dataset.importField;
    if (!field) return;
    const value = event.target.value;
    if (field === "passengerRecordIdToAdd") {
      if (!value) return;
      const passengerRows = importedSolicitanteLookupRows(trecho);
      const passenger = createImportPassengerFromSelectedPerson(trecho, value, passengerRows);
      if (!passenger) return;
      const passengerIdentity = importedPassengerIdentityKey(passenger);
      if (passengerIdentity && (trecho.passageiros || []).some((item) => importedPassengerMatchesIdentity(item, passengerIdentity))) {
        setSelectValue(event.target, "");
        toast("Passageiro já está neste serviço.", "warning", 4000);
        return;
      }
      captureImportReviewHistory("Adicionar passageiro");
      markImportedReviewPending(trecho);
      trecho.passageiros.push(passenger);
      trecho.passengerPickerOpen = false;
      renderImportReviewPreservingGallery();
      return;
    }
    const solicitanteRows = field === "solicitanteRecordId" ? importedSolicitanteLookupRows(trecho) : null;
    const currentValue = field === "dataHora"
      ? importedTrechoDateTimeLocal(trecho)
      : field === "retornoPrevisto"
        ? importedTrechoReturnDateTimeLocal(trecho)
        : field === "solicitanteRecordId"
          ? resolveImportedSolicitanteSelectValue(trecho, solicitanteRows || [])
          : field === "statusOperacaoValue"
            ? resolveImportedOperationStatusValue(trecho)
          : String(trecho[field] ?? "");
    if (String(currentValue ?? "") === String(value ?? "")) return;
    if (event.type === "input" && isTextEditingTarget(event.target)) {
      captureImportReviewHistoryForEditSession(event.target, "Editar campo do serviço");
    } else {
      captureImportReviewHistory("Editar campo do serviço");
    }
    markImportedReviewPending(trecho);
    if (field === "dataHora") {
      trecho.dataIso = datePartFromInputValue(value);
      trecho.horario = timePartFromInputValue(value);
      if (event.type === "change") {
        window.setTimeout(renderImportReview, 0);
      }
      return;
    }
    if (field === "retornoPrevisto") {
      trecho.retornoPrevistoDataIso = datePartFromInputValue(value);
      trecho.retornoPrevistoHorario = timePartFromInputValue(value);
      if (event.type === "change") {
        window.setTimeout(renderImportReview, 0);
      }
      return;
    }
    if (field === "solicitanteRecordId") {
      const selected = importedSolicitantePersonFromValue(value, solicitanteRows || [], trecho);
      trecho.solicitanteRecordId = value || "";
      trecho.solicitanteRecordLabel = selected?.label || selected?.nome || "";
      trecho.solicitanteNome = selected?.nome || selected?.label || "";
      trecho.solicitantePessoaImportada = isImportedSolicitanteTempId(value) && selected ? {
        nome: selected.nome || selected.label || "",
        telefone: selected.telefone || "",
        email: selected.email || "",
        centroCusto: ""
      } : null;
      const linkedPassenger = linkedImportedPassengerForSolicitante(trecho, value, solicitanteRows || []);
      if (linkedPassenger) {
        syncImportedSolicitanteDraft(trecho, importedPassengerDraftRecord(linkedPassenger), linkedPassenger);
      }
      trecho.solicitantePickerOpen = false;
      trecho.passengerPickerOpen = false;
      if (event.type === "change") {
        window.setTimeout(renderImportReview, 0);
      }
      return;
    }
    trecho[field] = value;
    if (event.type === "change") {
      window.setTimeout(renderImportReview, 0);
    }
  }

  function findImportedTrecho(programacao, trechoKey) {
    const program = state.importReview?.programs?.find((item) => item.programacao === programacao);
    return program?.trechos.find((trecho) => trecho.key === trechoKey) || null;
  }

  function importedResolvedPassenger(passenger) {
    if (passenger.matchStatus !== "use-existing" || !passenger.passageiroId) return null;
    const importClient = getImportClient();
    return state.passageiros.find((item) => sameId(item.id, passenger.passageiroId)) || {
      id: passenger.passageiroId,
      label: passenger.passageiroLabel || passenger.nome,
      telefone: passenger.telefone || "",
      email: passenger.email || "",
      endereco: "",
      preferencias: "",
      cr: passenger.centroCusto || "",
      clienteId: importClient?.id || "",
      clienteLabel: importClient?.label || CONFIG.importDefaults.clienteLabel || ""
    };
  }

  async function saveImportedTrecho(trecho, options = {}) {
    if (normalizeImportedReviewStatus(trecho) !== importReviewStatuses().CONFIRMED) {
      toast("Confirme a revisão individual antes de salvar este trecho.", "warning", 7000);
      return null;
    }
    const issues = importedTrechoIssues(trecho);
    if (issues.length) {
      toast(`Resolva antes de salvar: ${issues[0]}`, "error", 8000);
      return null;
    }
    if (trecho.duplicatedRecordIds?.length) {
      toast("Serviço repetido provável. A importação não cria outro registro com horário, trajeto, endereço, destino e passageiros parecidos.", "error", 9000);
      return null;
    }
    if (isSplitImportedTrecho(trecho)) {
      const pendingMembers = importedSplitGroupPendingMembers(trecho);
      if (!isCompleteImportedSplitGroup(trecho)) {
        toast("Split incompleto. Ida e retorno precisam permanecer vinculados.", "warning", 8000);
        return null;
      }
      if (pendingMembers.some((item) => normalizeImportedReviewStatus(item) !== importReviewStatuses().CONFIRMED || importedTrechoIssues(item).length)) {
        toast("Valide ida e retorno do Split antes de salvar.", "warning", 8000);
        return null;
      }
    }
    const existingReservas = await findExistingImportedReservasByProgramacao(trecho.programacao);
    const existingReserva = existingReservas.find((candidate) => !isAuthorizedImportedSplitSibling(trecho, candidate)) || null;
    if (existingReserva) {
      markImportedTrechoAsDuplicate(trecho, existingReserva, "Serviço ignorado automaticamente: já existe serviço com esta PG (ID Tenaris) no Dataverse.");
      toast("Serviço já existe no Dataverse. A importação bloqueou a criação duplicada.", "error", 9000);
      renderImportReview();
      return null;
    }
    const manageLoading = !options.skipLoading;
    if (manageLoading) setLoading(true);
    let createdReservaId = "";
    try {
      const context = await buildImportedSaveContext(trecho);
      const payload = buildImportedReservaPayload(trecho, context);
      const saved = await saveReserva(payload);
      createdReservaId = saved.id;
      await replacePassengerRelations(saved.id, context.colOrdemPassageiros, context, true);
      await updatePassengersLastServiceDate(context.colOrdemPassageiros, context.dataHoraPrincipal);
      window.XlsxImportCore?.markImportedTrechoSaved?.(trecho, saved.id);
      if (!window.XlsxImportCore?.markImportedTrechoSaved) {
        trecho.savedRecordId = saved.id;
        trecho.reviewStatus = importReviewStatuses().SAVED;
        trecho.reviewBlockReason = "";
      }
      trecho.duplicatedRecordIds = Array.from(new Set([...(trecho.duplicatedRecordIds || []), saved.id]));
      if (!options.silentSuccess) {
        toast(`Trecho ${trecho.programacao} salvo.`, "success", 5000);
        renderImportReview();
      }
      return saved;
    } catch (error) {
      console.error(error);
      if (isDataverseDuplicateKeyError(error)) {
        const duplicates = await findExistingImportedReservasByProgramacao(trecho.programacao);
        const duplicate = duplicates.find((candidate) => !isAuthorizedImportedSplitSibling(trecho, candidate)) || null;
        if (duplicate) {
          markImportedTrechoAsDuplicate(trecho, duplicate, "Serviço ignorado automaticamente: o Dataverse recusou criação duplicada desta PG.");
          renderImportReview();
        }
      }
      if (createdReservaId && state.xrm && !state.mockMode) {
        try {
          await state.xrm.WebApi.deleteRecord(CONFIG.entities.reserva, createdReservaId);
        } catch (cleanupError) {
          console.warn("Falha ao desfazer reserva importada incompleta", cleanupError);
        }
      }
      toast(error.message || "Falha ao salvar trecho importado.", "error", 9000);
      return null;
    } finally {
      if (manageLoading) setLoading(false);
    }
  }

  async function saveImportedSplitGroup(trecho) {
    const pending = importedSplitGroupPendingMembers(trecho);
    if (!isCompleteImportedSplitGroup(trecho)) {
      toast("Split incompleto. Ida e retorno precisam permanecer vinculados.", "warning", 8000);
      return;
    }
    if (pending.some((item) => normalizeImportedReviewStatus(item) !== importReviewStatuses().CONFIRMED || importedTrechoIssues(item).length)) {
      toast("Valide ida e retorno do Split antes de salvar.", "warning", 8000);
      return;
    }
    setLoading(true);
    try {
      const results = await runImportedSaveQueue(pending);
      const failedCount = results.filter((result) => !result).length;
      if (failedCount) {
        toast("Split parcialmente salvo. Corrija o trecho que falhou e tente novamente.", "warning", 9000);
      } else {
        showSuccess("Split salvo: ida e retorno agendados.");
      }
      renderImportReview();
      renderTabBadges();
    } catch (error) {
      console.error(error);
      toast(error.message || "Falha ao salvar Split.", "error", 9000);
    } finally {
      setLoading(false);
    }
  }

  async function findExistingImportedReservasByProgramacao(programacao) {
    const id = String(programacao || "").trim();
    if (!id) return [];
    const f = CONFIG.fields.reserva;
    const idField = importedReservaTenarisIdField();
    if (!state.xrm || state.mockMode) {
      return getMockDb().reservas
        .filter((item) => String(item[idField] || item[f.idExterno] || item.programacao || "") === id)
        .map(importedDuplicateCandidateFromReserva);
    }
    const select = [f.id, idField, f.idExterno, f.dataSaida, f.trajeto, f.enderecoView, f.destino, f.paxView].join(",");
    const filter = `${idField} eq '${escapeODataString(id)}'`;
    const rows = await retrieveAll(CONFIG.entities.reserva, `?$select=${select}&$filter=${filter}`);
    return rows.map(importedDuplicateCandidateFromReserva);
  }

  function markImportedTrechoAsDuplicate(trecho, duplicate, reason) {
    const recordId = cleanGuid(duplicate?.recordId || duplicate?.id || "");
    const match = {
      recordId,
      score: 999,
      level: "exact",
      reasons: ["mesma PG (ID Tenaris já existe no Dataverse)"]
    };
    trecho.duplicateMatches = [match];
    trecho.possibleDuplicateMatches = [];
    trecho.duplicatedRecordIds = recordId ? [recordId] : [];
    trecho.reviewStatus = importReviewStatuses().IGNORED;
    trecho.reviewBlockReason = reason;
    trecho.autoIgnoredByDuplicate = true;
  }

  async function buildImportedSaveContext(trecho) {
    const importClient = requireImportClient();
    const colOrdemPassageiros = [];
    for (let index = 0; index < trecho.passageiros.length; index += 1) {
      const passenger = trecho.passageiros[index];
      const record = await ensureImportedPassengerRecord(passenger);
      colOrdemPassageiros.push({
        passageiro: record,
        ordem: index + 1,
        guid: record.id,
        enderecoSaidaBD: passenger.origem || trecho.origem || ""
      });
    }
    const solicitanteRecord = await ensureImportedSolicitanteRecord(trecho, colOrdemPassageiros);
    const dataHoraPrincipal = combineDateTime(trecho.dataIso, ...String(trecho.horario || "").split(":"));
    const retornoPrevisto = combineDateTime(
      trecho.retornoPrevistoDataIso || trecho.dataIso,
      ...String(trecho.retornoPrevistoHorario || "").split(":")
    );
    return {
      importClient,
      solicitanteRecord: solicitanteRecord || colOrdemPassageiros[0]?.passageiro || null,
      dataHoraPrincipal,
      retornoPrevisto,
      trajeto: composeImportTrajeto(trecho),
      enderecoCompleto: trecho.origem || colOrdemPassageiros.map((item) => `${item.ordem}. ${firstName(item.passageiro.label)} - ${item.enderecoSaidaBD || "indeterminado"}`).join(";\n"),
      passageirosTelefones: colOrdemPassageiros.map((item) => `${item.passageiro.label} - ${item.passageiro.telefone || "indeterminado"}`).join(";\n"),
      preferencias: "",
      emailPassageiro: "",
      colOrdemPassageiros,
      enderecoPersonalizadoAtivo: false
    };
  }

  async function ensureImportedPassengerRecord(passenger) {
    if (passenger.matchStatus === "use-existing" && passenger.passageiroId) {
      const existing = importedResolvedPassenger(passenger);
      if (existing) {
        mergePassengerRecords([existing]);
        return existing;
      }
    }
    if (passenger.matchStatus === "ambiguous") {
      const selected = selectImportedExistingMatch(passenger.matchCandidates, getImportClient());
      if (selected) {
        mergePassengerRecords([selected.passenger]);
        applyExistingPassengerToImportedPassenger(passenger, selected.passenger, "Cadastro existente vinculado. Banco de Dados não será atualizado.");
        return selected.passenger;
      }
      throw new Error(`Decida o passageiro ${passenger.nome} antes de salvar.`);
    }
    const existing = await findImportedExistingPerson(passenger);
    if (existing) {
      applyExistingPassengerToImportedPassenger(passenger, existing, "Cadastro existente vinculado. Banco de Dados não será atualizado.");
      return existing;
    }
    return createImportedPassenger(passenger);
  }

  async function createImportedPassenger(passenger) {
    const record = await createImportedPersonRecord(passenger);
    passenger.matchStatus = "use-existing";
    passenger.passageiroId = record.id;
    passenger.passageiroLabel = record.label;
    return record;
  }

  async function ensureImportedSolicitanteRecord(trecho, colOrdemPassageiros = []) {
    if (trecho.solicitanteRecordId) {
      if (!isImportedSolicitanteTempId(trecho.solicitanteRecordId)) {
        const existing = state.passageiros.find((passenger) => sameId(passenger.id, trecho.solicitanteRecordId));
        if (existing) return existing;
      }
    }
    const linkedPassenger = linkedImportedPassengerForSolicitante(trecho);
    const linkedPassengerIndex = linkedPassenger ? trecho.passageiros.indexOf(linkedPassenger) : -1;
    const linkedPassengerRecord = linkedPassengerIndex >= 0 ? colOrdemPassageiros[linkedPassengerIndex]?.passageiro : null;
    if (linkedPassengerRecord) {
      trecho.solicitanteRecordId = linkedPassengerRecord.id;
      trecho.solicitanteRecordLabel = linkedPassengerRecord.label;
      trecho.solicitantePessoaImportada = null;
      return linkedPassengerRecord;
    }
    const selected = isImportedSolicitanteTempId(trecho.solicitanteRecordId)
      ? importedSolicitantePersonFromValue(trecho.solicitanteRecordId, importedSolicitanteLookupRows(trecho), trecho)
      : null;
    const nome = String(selected?.nome || selected?.label || trecho.solicitanteRecordLabel || trecho.solicitanteNome || "").trim();
    if (!nome) return null;
    const person = {
      nome,
      telefone: selected?.telefone || trecho.solicitantePessoaImportada?.telefone || "",
      email: selected?.email || trecho.solicitantePessoaImportada?.email || "",
      origem: "",
      centroCusto: "",
      matchStatus: "create-new",
      passageiroId: "",
      passageiroLabel: ""
    };
    const existing = await findImportedExistingPerson(person);
    const record = existing || await createImportedPersonRecord(person);
    trecho.solicitanteRecordId = record.id;
    trecho.solicitanteRecordLabel = record.label;
    return record;
  }

  async function findImportedExistingPerson(person) {
    const importClient = requireImportClient();
    const matches = await findPassengerDuplicateCandidates(importedPassengerCandidate(person, importClient));
    const selected = selectImportedExistingMatch(matches, importClient);
    if (!selected) return null;
    mergePassengerRecords([selected.passenger]);
    return selected.passenger;
  }

  async function findImportedExistingPersonFromDuplicateError(person, error) {
    const byId = await findImportedDuplicatePassengerByErrorId(error);
    if (byId) return byId;
    return findImportedExistingPersonByExactName(person);
  }

  async function findImportedDuplicatePassengerByErrorId(error) {
    const id = extractDuplicatePassengerId(error);
    if (!id || !state.xrm || state.mockMode) return null;
    try {
      const record = await state.xrm.WebApi.retrieveRecord(
        CONFIG.entities.passageiro,
        id,
        `?$select=${passengerSelectFields()}`
      );
      const passenger = mapPassageiro(record);
      mergePassengerRecords([passenger]);
      return passenger;
    } catch (retrieveError) {
      console.warn("Falha ao recuperar passageiro duplicado pelo ID do erro.", retrieveError);
      return null;
    }
  }

  async function findImportedExistingPersonByExactName(person) {
    const name = normalizePassengerDisplayName(person?.nome || "");
    if (!name) return null;
    const importClient = requireImportClient();
    const f = CONFIG.fields.passageiro;
    const rows = await retrieveAll(
      CONFIG.entities.passageiro,
      `?$select=${passengerSelectFields()}&$filter=${f.nome} eq '${escapeODataString(name)}'&$top=10`
    );
    const passengers = mergePassengerRecords(rows.map(mapPassageiro));
    return passengers.find((passenger) => sameId(passenger.clienteId, importClient.id))
      || passengers.find((passenger) => normalizePassengerDisplayName(passenger.label) === name)
      || null;
  }

  function extractDuplicatePassengerId(error) {
    const text = [
      error?.message,
      error?.details,
      error?.raw,
      error?.responseText,
      safeJson(error)
    ].filter(Boolean).join(" ");
    const normalizedEntity = normalize(text);
    if (!normalizedEntity.includes(normalize(CONFIG.entities.passageiro))) return "";
    const idField = CONFIG.fields.passageiro.id;
    const fieldPattern = new RegExp(`${idField}[\\s\\S]{0,500}?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})`, "i");
    const fieldMatch = text.match(fieldPattern);
    if (fieldMatch) return cleanGuid(fieldMatch[1]);
    const idMatch = text.match(/<Id>\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*<\/Id>/i)
      || text.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
    return idMatch ? cleanGuid(idMatch[1]) : "";
  }

  async function createImportedPersonRecord(person) {
    const importClient = requireImportClient();
    const key = normalize([
      person.nome,
      person.telefone,
      person.email,
      importClient.id
    ].join("|"));
    if (importPassengerCreateLocks.has(key)) return importPassengerCreateLocks.get(key);
    const promise = (async () => {
      const payload = {
        [CONFIG.fields.passageiro.nome]: normalizePassengerDisplayName(person.nome),
        [CONFIG.fields.passageiro.telefone]: phoneStorageValue(person.telefone || ""),
        [CONFIG.fields.passageiro.email]: normalizeEmail(person.email || "")
      };
      setChoice(payload, CONFIG.fields.passageiro.status, getActivePassengerStatusValue());
      bindLookup(payload, CONFIG.nav.cliente, CONFIG.entitySets.cliente, importClient.id);

      let created;
      if (state.xrm && !state.mockMode) {
        try {
          created = await state.xrm.WebApi.createRecord(CONFIG.entities.passageiro, payload);
        } catch (error) {
          if (isDataverseDuplicateKeyError(error)) {
            const existing = await findImportedExistingPerson(person)
              || await findImportedExistingPersonFromDuplicateError(person, error);
            if (existing) return existing;
          }
          throw error;
        }
      } else {
        created = { id: `import-pax-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}` };
      }
      const record = {
        id: cleanGuid(created.id),
        label: normalizePassengerDisplayName(person.nome),
        telefone: formatPhoneNumber(person.telefone || ""),
        email: normalizeEmail(person.email || ""),
        endereco: "",
        preferencias: "",
        cr: "",
        status: getActivePassengerStatusValue(),
        ultimoServico: "",
        clienteId: importClient.id,
        clienteLabel: importClient.label
      };
      mergePassengerRecords([record]);
      persistMockPassengerRecord(record);
      return record;
    })();
    importPassengerCreateLocks.set(key, promise);
    try {
      return await promise;
    } finally {
      importPassengerCreateLocks.delete(key);
    }
  }

  function buildImportedReservaPayload(trecho, context) {
    const f = CONFIG.fields.reserva;
    const importObs = ensureImportedObservationState(trecho);
    const tenarisIdField = importedReservaTenarisIdField();
    const payload = {
      [tenarisIdField]: trecho.programacao,
      [f.enderecoView]: context.enderecoCompleto,
      [f.destino]: trecho.destino || "",
      [f.dataSaida]: context.dataHoraPrincipal.toISOString(),
      [f.obsOperacao]: importObs.motorista || "",
      [f.obsInterna]: importObs.interna || (isSplitImportedTrecho(trecho)
        ? `Serviço criado por Split na PG: ${trecho.programacao}.`
        : importedDefaultInternalObservation(trecho)),
      [f.obsFinal]: importObs.final || "",
      [f.perfilPassageiro]: importObs.passageiro || "",
      [f.email]: "",
      [f.trajeto]: context.trajeto,
      [f.paxView]: context.passageirosTelefones,
      [f.receber]: false,
      [f.cr]: importedTrechoCr(trecho)
    };
    setChoice(payload, f.status, resolveImportedOperationStatusValue(trecho));
    setChoice(payload, f.statusFaturamento, el.statusFaturamento.value || findOptionValue("statusFaturamento", "Pendente"));
    setChoice(payload, f.tipoServico, resolveImportOption("tipoServico", trecho.tipoServicoValue, trecho.tipoServicoSugerido));
    setChoice(payload, f.tipoVeiculo, resolveImportOption("tipoVeiculo", trecho.tipoVeiculoValue, trecho.tipoVeiculoSugerido));
    setChoice(payload, f.formaPagamento, el.formaPagamento.value);
    if (context.retornoPrevisto) payload[f.previsaoRetorno] = context.retornoPrevisto.toISOString();
    bindLookup(payload, CONFIG.nav.cliente, CONFIG.entitySets.cliente, context.importClient.id);
    bindLookup(payload, CONFIG.nav.solicitante, CONFIG.entitySets.passageiro, context.solicitanteRecord?.id || context.colOrdemPassageiros[0]?.guid);
    const motorista = findMotoristaByName(trecho.motoristaNome);
    const motoristaId = motorista?.id || el.motorista.value;
    bindLookup(payload, CONFIG.nav.motorista, CONFIG.entitySets.funcionario, motoristaId);
    return payload;
  }

  function resolveImportOption(key, explicitValue, suggestedLabel) {
    if (explicitValue && state.options[key]?.some((item) => String(item.value) === String(explicitValue))) {
      return explicitValue;
    }
    if (suggestedLabel) return findOptionValue(key, suggestedLabel);
    return "";
  }

  function composeImportTrajeto(trecho) {
    if (trecho?.trajetoCidades) return trecho.trajetoCidades;
    return [trecho.cidadeOrigem, trecho.cidadeDestino].filter(Boolean).join(" / ") || [trecho.origem, trecho.destino].filter(Boolean).join(" / ");
  }

  function importedTrechoCr(trecho) {
    if (!trecho) return "";
    if (String(trecho.importedServiceCr || "").trim()) return String(trecho.importedServiceCr).trim();
    const value = String(trecho.programacao || "").trim();
    trecho.importedServiceCr = value;
    return value;
  }

  function isDataverseDuplicateKeyError(error) {
    const text = [
      error?.message,
      error?.errorCode,
      error?.code,
      error?.details,
      safeJson(error)
    ].filter(Boolean).join(" ");
    const normalized = normalize(text);
    return normalized.includes("duplicate")
      || normalized.includes("duplicad")
      || normalized.includes("chave de entidade")
      || normalized.includes("entity key")
      || normalized.includes("valores exclusivos")
      || normalized.includes("unique");
  }

  function composeImportPassengerDestinations(trecho) {
    const passageiros = trecho?.passageiros || [];
    const uniqueDestinos = [];
    passageiros.forEach((passenger) => {
      const destino = String(passenger.destino || "").trim();
      const key = normalize(destino);
      if (key && !uniqueDestinos.some((item) => normalize(item) === key)) {
        uniqueDestinos.push(destino);
      }
    });
    if (uniqueDestinos.length <= 1) return uniqueDestinos[0] || "";
    return passageiros.map((passenger, index) => {
      const destino = String(passenger.destino || "").trim();
      const nome = firstName(passenger.nome) || `Passageiro ${index + 1}`;
      return `${index + 1}. ${nome} - ${destino || "destino não informado"}`;
    }).join(";\n");
  }

  function findMotoristaByName(name) {
    const wanted = normalize(name);
    if (!wanted) return null;
    return state.motoristas.find((motorista) => {
      const searchable = normalize([motorista.label, motorista.nomeCompleto, motorista.search].filter(Boolean).join(" "));
      return searchable.includes(wanted) || wanted.includes(searchable);
    }) || null;
  }

  function formatDateInputForDisplay(value) {
    if (!value) return "sem data";
    const [year, month, day] = datePartFromInputValue(value).split("-");
    return year && month && day ? `${day}/${month}/${year}` : value;
  }

  function resolvePassengerMatchReview(result) {
    const resolve = passengerMatchResolve;
    passengerMatchResolve = null;
    if (resolve) resolve(result || { action: "cancel" });
    if (el.passengerMatchOverlay) el.passengerMatchOverlay.hidden = true;
    el.passengerMatchOverlay?.querySelector(".passenger-match-dialog")?.classList.remove("is-import-review");
    passengerMatchContext = null;
  }

  async function saveForm() {
    captureObsState();
    if (isImportSaveMode()) {
      return performImportedServicesSave();
    }

    const context = buildSaveContext();
    clearValidationStates();
    return proceedSaveContext(context);
  }

  function isImportSaveMode() {
    return state.currentTab === "import" && !!state.importReview?.programs?.length;
  }

  function collectImportedTrechos(review = state.importReview) {
    return (review?.programs || []).flatMap((program) => (program?.trechos || []));
  }

  function summarizeImportTrechoStatuses(trechos = []) {
    const statuses = importReviewStatuses();
    const counts = {
      pending: 0,
      confirmed: 0,
      blocked: 0,
      ignored: 0,
      saved: 0,
      total: 0
    };
    (trechos || []).forEach((trecho) => {
      const status = normalizeImportedReviewStatus(trecho);
      if (Object.prototype.hasOwnProperty.call(counts, status)) {
        counts[status] += 1;
      } else {
        counts.pending += 1;
      }
      counts.total += 1;
    });
    return counts;
  }

  function hasPrimaryDraftChanges() {
    if (!state.isNew) return true;
    if (state.draftCommonEdited) return true;
    if (state.scheduleDrafts?.length) return true;
    if (state.activationDraftEditState?.return || state.activationDraftEditState?.repeat) return true;
    if ((state.selectedPassengers || []).some((item) => item?.passageiro || item?.guid || hasText(item?.telefone) || hasText(item?.enderecoEditado))) return true;
    if ((state.enderecoRascunho || []).some((item) => hasText(item?.endereco))) return true;

    const snapshot = createDraftSnapshot();
    return hasCommonDraftContent(snapshot);
  }

  function hasImportedServicesDraft() {
    return !!state.importReview?.programs?.length;
  }

  async function performImportedServicesSave() {
    if (!state.importReview?.programs?.length) {
      toast("Importe um XLSX antes de agendar serviços importados.", "warning", 7000);
      return;
    }

    const trechos = collectImportedTrechos(state.importReview);
    const counts = summarizeImportTrechoStatuses(trechos);
    const statuses = importReviewStatuses();
    if (!counts.total) {
      toast("Nenhum serviço importado para agendar.", "warning", 5000);
      return;
    }

    if (counts.ignored === counts.total) {
      toast("Todos os serviços importados estão ignorados. Revise ou remova os itens antes de agendar.", "warning", 7000);
      return;
    }

    if (counts.pending || counts.blocked) {
      const parts = [];
      if (counts.pending) parts.push(`${counts.pending} pendente(s)`);
      if (counts.blocked) parts.push(`${counts.blocked} bloqueado(s)`);
      toast(`Validação incompleta dos serviços importados: ${parts.join(" e ")}. ${counts.ignored ? `${counts.ignored} ignorado(s). ` : ""}Confirme ou descarte os itens antes de agendar.`, "warning", 8000);
      return;
    }

    const confirmedTrechos = trechos.filter((trecho) => normalizeImportedReviewStatus(trecho) === statuses.CONFIRMED);
    const validatedTrechos = confirmedTrechos.filter((trecho) => !importedTrechoIssues(trecho).length);
    if (!validatedTrechos.length) {
      toast("Não há serviços importados confirmados com validação completa.", "warning", 7000);
      return;
    }

    if (activeImportedPassengerEditRef) {
      flushImportedPassengerEditBeforeHistory();
    }

    setLoading(true);
    state.pendingSaveContext = null;
    clearSaveLog();

    try {
      const results = await runImportedSaveQueue(validatedTrechos);
      const savedCount = results.filter(Boolean).length;
      const failedCount = results.length - savedCount;

      if (!savedCount) {
        toast("Falha ao agendar serviços importados. Verifique os erros e tente novamente.", "error", 9000);
        return;
      }

      if (failedCount) {
        toast(`${savedCount} serviço(s) agendado(s). ${failedCount} serviço(s) falharam.`, "warning", 8000);
      } else {
        showSuccess(savedCount === 1 ? "1 serviço importado!" : `${savedCount} serviços importados!`);
      }
      renderImportReview();
      renderTabBadges();
    } catch (error) {
      console.error(error);
      toast(error.message || "Falha ao agendar serviços importados.", "error", 9000);
    } finally {
      setLoading(false);
    }
  }

  async function runImportedSaveQueue(trechos) {
    const results = new Array(trechos.length).fill(null);
    const processed = new Set();
    for (let index = 0; index < trechos.length; index += 1) {
      if (processed.has(index)) continue;
      const current = trechos[index];
      if (isCompleteImportedSplitGroup(current)) {
        const group = importedSplitGroupPendingMembers(current)
          .filter((member) => trechos.includes(member))
          .sort((left, right) => (left.splitRole === "outbound" ? -1 : right.splitRole === "outbound" ? 1 : 0));
        for (const member of group) {
          const memberIndex = trechos.indexOf(member);
          processed.add(memberIndex);
          results[memberIndex] = await saveImportedTrecho(member, {
            silentSuccess: true,
            skipLoading: true
          });
          if (!results[memberIndex]) break;
        }
        continue;
      }
      processed.add(index);
      results[index] = await saveImportedTrecho(current, {
        silentSuccess: true,
        skipLoading: true
      });
    }
    return results;
  }

  function proceedSaveContext(context, options = {}) {
    const validation = validateContext(context);
    if (validation) {
      const validationErrors = collectValidationErrors(context);
      state.pendingSaveContext = null;
      toast(formatValidationSummary(validationErrors), "error", validationErrors.length > 1 ? 9000 : 7000);
      markValidationErrorsSilently(validationErrors.slice(1));
      focusInvalidField(validation);
      return;
    }

    if (!options.skipActivationGuard) {
      const inactiveDrafts = collectInactiveActivationDrafts();
      if (inactiveDrafts.length) {
        state.pendingSaveContext = context;
        openActivationGuard(inactiveDrafts);
        return;
      }
    }

    if (!options.skipReceberGuard) {
      const receberMessage = getReceberMismatchMessage();
      if (receberMessage) {
        state.pendingSaveContext = context;
        openReceberGuard(receberMessage);
        return;
      }
    }

    if (!options.skipReturnReceiveScope && shouldAskReturnReceiveScope(context)) {
      state.pendingSaveContext = context;
      openReturnReceiveScope();
      return;
    }

    state.pendingSaveContext = context;
      return openReviewBeforeSave(context);
  }

  function collectInactiveActivationDrafts() {
    const drafts = [];
    if (hasInactiveReturnDraft()) {
      drafts.push({
        type: "return",
        tab: "return",
        label: "Retorno",
        detail: "Campos de retorno preenchidos, mas a chave Ativado está desligada."
      });
    }
    if (hasInactiveRepeatDraft()) {
      drafts.push({
        type: "repeat",
        tab: "repeat",
        label: "Repetir",
        detail: "Campos de repetição preenchidos, mas a chave Ativado está desligada."
      });
    }
    return drafts;
  }

  function openActivationGuard(drafts) {
    if (!el.activationGuardOverlay || !el.activationGuardList) {
      proceedSaveContext(state.pendingSaveContext || buildSaveContext(), { skipActivationGuard: true });
      return;
    }
    state.activationGuardDrafts = drafts;
    el.activationGuardList.innerHTML = "";
    drafts.forEach((draft) => {
      const item = document.createElement("article");
      item.className = "activation-guard-item";
      const dot = document.createElement("span");
      dot.className = "activation-guard-dot";
      dot.setAttribute("aria-hidden", "true");
      const text = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = draft.label;
      const detail = document.createElement("span");
      detail.textContent = draft.detail;
      text.append(title, detail);
      item.append(dot, text);
      el.activationGuardList.appendChild(item);
    });
    el.activationGuardOverlay.hidden = false;
    requestAnimationFrame(() => {
      el.activationGuardActivate?.focus();
    });
  }

  function closeActivationGuard() {
    if (el.activationGuardOverlay) el.activationGuardOverlay.hidden = true;
    state.activationGuardDrafts = [];
  }

  // Receber ligado sem valor, ou valor preenchido com Receber desligado: pede confirmação.
  function getReceberMismatchMessage() {
    const receber = !!el.receber?.checked;
    const temValor = (parseNumber(el.valorReceber?.value) || 0) > 0;
    if (receber && !temValor) return "A opção Receber está ativada, mas o Valor a receber está vazio. Confirma que é isso mesmo?";
    if (!receber && temValor) return "Há Valor a receber preenchido, mas a opção Receber está desativada. Confirma que é isso mesmo?";
    return "";
  }

  function openReceberGuard(message) {
    if (!el.receberGuardOverlay) {
      resolveReceberGuard(true);
      return;
    }
    el.receberGuardText.textContent = message;
    el.receberGuardOverlay.hidden = false;
    requestAnimationFrame(() => {
      el.receberGuardReview?.focus();
    });
  }

  function resolveReceberGuard(confirmed) {
    const context = state.pendingSaveContext || buildSaveContext();
    if (el.receberGuardOverlay) el.receberGuardOverlay.hidden = true;
    if (!confirmed) {
      state.pendingSaveContext = null;
      setTab("details");
      (el.receber?.checked ? el.valorReceber : el.receber)?.focus();
      return;
    }
    proceedSaveContext(context, { skipActivationGuard: true, skipReceberGuard: true });
  }

  function shouldAskReturnReceiveScope(context) {
    if (!state.isNew || !el.receberRetorno?.checked || !el.repetirServico.checked) return false;
    if (el.frequenteTipo.value !== "Ida e retorno") return false;
    if (context.receberRetornoScope) return false;
    return collectReturnReceiveTimestamps(context).length > 0;
  }

  function openReturnReceiveScope() {
    if (!el.returnReceiveScopeOverlay) {
      resolveReturnReceiveScope("all");
      return;
    }
    el.returnReceiveScopeOverlay.hidden = false;
    requestAnimationFrame(() => {
      el.returnReceiveScopeAll?.focus();
    });
  }

  function closeReturnReceiveScope() {
    if (el.returnReceiveScopeOverlay) el.returnReceiveScopeOverlay.hidden = true;
  }

  function resolveReturnReceiveScope(action) {
    const context = state.pendingSaveContext || buildSaveContext();
    closeReturnReceiveScope();

    if (action === "review") {
      state.pendingSaveContext = null;
      setTab("return");
      return;
    }

    context.receberRetornoScope = action === "last" ? "last" : "all";
    context.receberRetornoUltimoTimestamp = resolveLastReturnReceiveTimestamp(context);
    proceedSaveContext(context, { skipReturnReceiveScope: true });
  }

  function resolveLastReturnReceiveTimestamp(context) {
    const timestamps = collectReturnReceiveTimestamps(context);
    return timestamps.length ? timestamps[timestamps.length - 1] : null;
  }

  function collectReturnReceiveTimestamps(context) {
    const timestamps = [];
    const pushDate = (date) => {
      if (!date || Number.isNaN(date.getTime())) return;
      timestamps.push(date.getTime());
    };

    if (el.agendarRetorno.checked) pushDate(context.dataHoraRetorno);

    if (el.repetirServico.checked && (el.frequenteTipo.value === "Retorno" || el.frequenteTipo.value === "Ida e retorno")) {
      const dates = generateFrequentDates(el.frequenteInicio.value, el.frequenteFim.value, el.contabilizarFds.checked);
      const retornoTime = el.retornoHora.value && el.retornoMinuto.value
        ? timeFromParts(el.retornoHora.value, el.retornoMinuto.value)
        : { hours: 18, minutes: 0 };
      const originalRetorno = context.dataHoraRetorno?.getTime();
      dates.forEach((date) => {
        const dataRetorno = withClock(date, retornoTime.hours, retornoTime.minutes);
        if (originalRetorno && dataRetorno.getTime() === originalRetorno) return;
        pushDate(dataRetorno);
      });
    }

    return Array.from(new Set(timestamps)).sort((a, b) => a - b);
  }

  function maxServiceResultDate(results) {
    return (results || [])
      .map((item) => item?.data)
      .filter((date) => date && !Number.isNaN(date.getTime?.()))
      .sort((a, b) => b.getTime() - a.getTime())[0] || null;
  }

  function resolveActivationGuard(action) {
    const drafts = [...(state.activationGuardDrafts || [])];
    const context = state.pendingSaveContext || buildSaveContext();
    closeActivationGuard();

    if (action === "review") {
      state.pendingSaveContext = null;
      const first = drafts[0];
      if (first?.tab) setTab(first.tab);
      return;
    }

    if (action === "activate") {
      drafts.forEach((draft) => {
        if (draft.type === "return") el.agendarRetorno.checked = true;
        if (draft.type === "repeat") el.repetirServico.checked = true;
      });
      renderTabBadges();
      proceedSaveContext(buildSaveContext());
      return;
    }

    proceedSaveContext(context, { skipActivationGuard: true });
  }

  async function performSave() {
    const context = state.pendingSaveContext || buildSaveContext();
    closeReviewOverlay(false);
    clearSaveLog();
    state.lastSuccessVoucher = null;
    addSaveLog("success", "Validação concluída", "Campos obrigatórios aprovados.");
    setLoading(true);
    try {
      const results = [];

      if (state.isNew) {
        addSaveLog("info", "Criando principal", formatDateTime(context.dataHoraPrincipal));
        const principal = await saveReserva(buildReservaPayload(context, "principal", context.dataHoraPrincipal));
        results.push({ tipo: "Principal", data: context.dataHoraPrincipal, result: principal });
        addSaveLog("success", "Principal salvo", principal.id);
        addSaveLog("info", "Vinculando passageiros", `${context.colOrdemPassageiros.length} passageiro(s).`);
        await replacePassengerRelations(principal.id, context.colOrdemPassageiros, context, true);
        addSaveLog("success", "Passageiros vinculados", "Principal.");

        if (el.repetirServico.checked) {
          addSaveLog("info", "Criando recorrência", "Gerando serviços frequentes.");
          const frequent = await createFrequentServices(context);
          results.push(...frequent);
          addSaveLog("success", "Recorrência salva", `${frequent.length} serviço(s).`);
        }

        if (el.agendarRetorno.checked) {
          addSaveLog("info", "Criando retorno", formatDateTime(context.dataHoraRetorno));
          const retorno = await saveReserva(buildReservaPayload(context, "retorno", context.dataHoraRetorno));
          results.push({ tipo: "Retorno", data: context.dataHoraRetorno, result: retorno });
          await replacePassengerRelations(retorno.id, context.colOrdemPassageiros, context, false);
          addSaveLog("success", "Retorno salvo", retorno.id);
        }
      } else {
        if (el.agendarRetorno.checked || el.repetirServico.checked) {
      throw new Error("Agendamento de retorno e serviços frequentes só na criação.");
        }
        addSaveLog("info", "Atualizando reserva", state.recordId);
        const updated = await saveReserva(buildReservaPayload(context, "edicao", context.dataHoraPrincipal), state.recordId);
        addSaveLog("info", "Recriando vínculos", `${context.colOrdemPassageiros.length} passageiro(s).`);
        await replacePassengerRelations(state.recordId, context.colOrdemPassageiros, context, true, true);
        results.push({ tipo: "Edição", data: context.dataHoraPrincipal, result: updated });
        addSaveLog("success", "Edição salva", state.recordId);
      }

      await updatePassengersLastServiceDate(context.colOrdemPassageiros, maxServiceResultDate(results));
      const total = results.length;
      const readableIds = await fetchReservaReadableIds(results.slice(0, SUCCESS_OS_PREVIEW_LIMIT).map((item) => item.result?.id));
      const message = buildSaveSuccessMessage(state.isNew, total, readableIds);
      addSaveLog("success", "Fluxo concluído", message);
      state.lastSuccessVoucher = buildSuccessVoucherSnapshot(context, results);
      showSuccess(message);
      clearDraftSnapshot(false);
      state.pendingSaveContext = null;
      resetAfterSuccess();
    } catch (error) {
      console.error(error);
      addSaveLog("error", "Falha no salvamento", error.message || "Erro desconhecido.");
      await markAiDraftFailure(error);
      toast(error.message || "Falha ao salvar formulário.", "error", 9000);
    } finally {
      setLoading(false);
    }
  }

  // Número legível da OS (autonumber cr40f_id) para o operador informar ao cliente logo após salvar.
  async function fetchReservaReadableIds(ids) {
    const field = CONFIG.fields.reserva.readableId;
    const validIds = (ids || []).map((id) => cleanGuid(id || "")).filter(Boolean);
    if (!field || !validIds.length || !state.xrm || state.mockMode) return [];
    try {
      const rows = await Promise.all(validIds.map((id) => state.xrm.WebApi.retrieveRecord(CONFIG.entities.reserva, id, `?$select=${field}`)));
      return rows.map((row) => String(row?.[field] || "").trim()).filter(Boolean);
    } catch (error) {
      addSaveLog("info", "Número da OS indisponível", error?.message || "Falha ao consultar o número da OS.");
      return [];
    }
  }

  function buildSaveSuccessMessage(isNew, total, readableIds = []) {
    if (!readableIds.length) {
      return isNew
        ? (total === 1 ? "Serviço criado com sucesso" : `${total} serviços criados com sucesso!`)
        : "Serviço editado com sucesso!";
    }
    const shown = readableIds.join(", ");
    const rest = total > readableIds.length ? ` e mais ${total - readableIds.length}` : "";
    if (!isNew) return `Serviço ${shown} editado com sucesso!`;
    return total === 1
      ? `Serviço ${shown} criado com sucesso`
      : `${total} serviços criados com sucesso: ${shown}${rest}.`;
  }

  function captureObsState(options = {}) {
    const config = {
      includeDerivedPassengerPreferences: true,
      ...options
    };
    state.obs[state.obsAtual] = el.observacao.value;
    state.obsRet[state.retObsAtual] = el.retornoObservacao.value;
    if (!config.includeDerivedPassengerPreferences) return;
    const preferencias = composePreferencias();
    state.obs.passageiro = preferencias;
    state.obsRet.passageiro = preferencias;
  }

  function buildSaveContext() {
    syncAllDateTimeInputs();
    const dataHoraPrincipal = combineDateTime(el.saidaData.value, el.saidaHora.value, el.saidaMinuto.value);
    const retPrev = buildRetornoPrevisto(dataHoraPrincipal);
    const dataHoraRetorno = combineDateTime(el.retornoData.value, el.retornoHora.value, el.retornoMinuto.value);
    const colOrdemPassageiros = getValidPassengerRows().map((item) => ({
      passageiro: item.passageiro,
      ordem: item.ordem,
      guid: item.guid,
      enderecoSaidaBD: getDraftAddress(item.ordem) || item.enderecoEditado || ""
    }));
    const additionalSchedules = [];

    return {
      dataHoraPrincipal,
      dataHoraRetorno,
      retornoPrevisto: retPrev,
      trajeto: el.trajeto.value.trim(),
      enderecoCompleto: composeEnderecoCompleto(),
      enderecoCompletoInvertido: composeEnderecoCompletoInvertido(),
      passageirosTelefones: composePassageirosTelefones(),
      preferencias: composePreferencias(),
      emailPassageiro: firstPassengerValue("email"),
      colOrdemPassageiros,
      additionalSchedules
    };
  }

  function buildAdditionalScheduleContexts(mainDateTime) {
    return state.scheduleDrafts.map((item, index) => {
      const dataHora = combineDateTime(item.data, item.hora, item.minuto);
      return {
        index,
        dataHora,
        retornoPrevisto: buildScheduleRetornoPrevisto(item, dataHora || mainDateTime),
        tipoServico: item.tipoServico || "",
        tipoVeiculo: item.tipoVeiculo || "",
        motorista: item.motorista || "",
        trajeto: String(item.trajeto || "").trim(),
        destino: String(item.destino || "").trim(),
        obsMotorista: String(item.obsMotorista || "").trim()
      };
    });
  }

  function buildScheduleRetornoPrevisto(item, baseDateTime) {
    const explicitRetorno = parseDateTimeInputValue(item?.retPrevDateTime);
    if (explicitRetorno) return explicitRetorno;
    if (!baseDateTime || !item.retPrevHora || !item.retPrevMinuto || !item.hora || !item.minuto) return null;
    const saidaTime = timeFromParts(item.hora, item.minuto);
    const retornoTime = timeFromParts(item.retPrevHora, item.retPrevMinuto);
    const base = new Date(baseDateTime);
    if (retornoTime.minutesTotal < saidaTime.minutesTotal) base.setDate(base.getDate() + 1);
    return withClock(base, retornoTime.hours, retornoTime.minutes);
  }

  function validateContext(context) {
    return collectValidationErrors(context)[0] || "";
  }

  // Todas as pendências de uma vez, na mesma ordem de antes (a primeira continua recebendo o foco).
  function collectValidationErrors(context) {
    const statusLabel = optionLabel("statusOperacao", el.statusOperacao.value);
    const isTroca = statusLabel === "Troca de Veículos";
    const errors = [];
    const check = (failed, message) => { if (failed) errors.push(message); };
    check(!context.dataHoraPrincipal || !el.saidaHora.value || !el.saidaMinuto.value, "'Data e horário de saída' são obrigatórios.");
    check(!el.tipoServico.value && !isTroca, "'Tipo do Serviço' é obrigatório.");
    check(!el.tipoVeiculo.value && !isTroca, "'Tipo do Veículo' é obrigatório.");
    check(!context.trajeto && !isTroca, "'Trajeto' (Cidade de origem/destino) é obrigatório.");
    check(context.colOrdemPassageiros.length === 0 && !isTroca, "É obrigatório selecionar pelo menos um passageiro.");
    check(!context.enderecoCompleto && !isTroca, "'Endereço de saída' é obrigatório.");
    check(!el.destino.value.trim() && !isTroca, "'Destino' é obrigatório.");
    check(!el.cliente.value, "'Cliente' é obrigatório.");
    check(!el.solicitante.value, "'Solicitante' é obrigatório.");
    check(el.agendarRetorno.checked && !el.retornoData.value, "'Data de retorno' é obrigatória.");
    check(el.agendarRetorno.checked && !el.retornoEndereco.value.trim(), "'Endereço de Saída - Retorno' é obrigatório.");
    check(el.agendarRetorno.checked && !el.retornoDestino.value.trim(), "'Destino - Retorno' é obrigatório.");
    check(el.agendarRetorno.checked && context.dataHoraRetorno && context.dataHoraPrincipal && context.dataHoraRetorno < context.dataHoraPrincipal, "Data de retorno nao pode ser anterior a saida.");
    check(el.repetirServico.checked && (!el.frequenteInicio.value || !el.frequenteFim.value), "'Data de início e fim - Serviços Frequentes' são obrigatórios.");
    check(el.repetirServico.checked && datesAreInverted(el.frequenteInicio.value, el.frequenteFim.value), "'Data final' não pode ser anterior à data inicial.");
    const frequentPeriodError = validateFrequentServicePeriod();
    check(!!frequentPeriodError, frequentPeriodError);
    check(el.repetirServico.checked && !el.frequenteTipo.value, "'Tipo de Serviço Frequente' é obrigatório.");
    check(hasDuplicatePassengers(), "Erro: passageiro duplicado na lista. Remova as duplicatas.");
    return errors;
  }

  function formatValidationSummary(errors) {
    if (errors.length <= 1) return errors[0] || "";
    const labels = errors.map((message) => {
      const quoted = String(message).match(/'([^']+)'/);
      if (quoted) return quoted[1];
      return /passageiro/i.test(message) && /selecionar/i.test(message) ? "Passageiro" : String(message).replace(/\.$/, "");
    });
    return `Revise ${errors.length} campos: ${labels.join(", ")}.`;
  }

  // Depois de uma tentativa de salvar, tira a marca de campos que ficaram válidos sem digitação
  // direta (ex.: Solicitante e Passageiros ao escolher o passageiro). Só age se já houver marcas.
  function scheduleValidationRefresh() {
    if (!document.querySelector(".is-invalid")) return;
    window.clearTimeout(validationRefreshTimer);
    validationRefreshTimer = window.setTimeout(refreshValidationMarks, 150);
  }

  function refreshValidationMarks() {
    if (!document.querySelector(".is-invalid")) return;
    const errors = collectValidationErrors(buildSaveContext());
    clearValidationStates();
    markValidationErrorsSilently(errors);
  }

  function markValidationErrorsSilently(messages) {
    silentValidationReveal = true;
    try {
      messages.forEach((message) => {
        revealInvalidFieldByMessage(normalize(String(message || "")).replace(/\s+/g, " "), message);
      });
    } finally {
      silentValidationReveal = false;
    }
  }

  function validateFrequentServicePeriod() {
    if (!el.repetirServico.checked || !el.frequenteInicio.value || !el.frequenteFim.value) return "";
    const days = dateRangeDays(el.frequenteInicio.value, el.frequenteFim.value);
    if (days > MAX_FREQUENT_SERVICE_DAYS) {
      return `Periodo frequente muito grande. Limite: ${MAX_FREQUENT_SERVICE_DAYS} dias.`;
    }
    const dates = generateFrequentDates(el.frequenteInicio.value, el.frequenteFim.value, el.contabilizarFds.checked);
    const multiplier = el.frequenteTipo.value === "Ida e retorno" ? 2 : 1;
    if (dates.length * multiplier > MAX_FREQUENT_SERVICE_RECORDS) {
      return `Periodo frequente muito grande. Limite: ${MAX_FREQUENT_SERVICE_RECORDS} servicos.`;
    }
    return "";
  }

  function dateRangeDays(startValue, endValue) {
    const start = parseDateInputValue(startValue);
    const end = parseDateInputValue(endValue);
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  }

  function datesAreInverted(startValue, endValue) {
    const start = parseDateInputValue(startValue);
    const end = parseDateInputValue(endValue);
    return !!(start && end && end < start);
  }

  function buildReservaPayload(context, kind, dataHora, scheduleOverride = null) {
    const f = CONFIG.fields.reserva;
    const isReturn = kind === "retorno" || kind === "frequenteRetorno";
    const retornoPrevisto = scheduleOverride ? scheduleOverride.retornoPrevisto : context.retornoPrevisto;
    const trajeto = scheduleOverride ? scheduleOverride.trajeto : context.trajeto;
    const destino = scheduleOverride ? scheduleOverride.destino : el.destino.value.trim();
    const payload = {
      [f.enderecoView]: isReturn ? el.retornoEndereco.value.trim() : context.enderecoCompleto,
      [f.destino]: isReturn ? el.retornoDestino.value.trim() : destino,
      [f.dataSaida]: dataHora.toISOString(),
      [f.obsOperacao]: isReturn ? state.obsRet.motorista : (scheduleOverride?.obsMotorista ?? state.obs.motorista),
      [f.obsInterna]: isReturn ? state.obsRet.interna : state.obs.interna,
      [f.obsFinal]: isReturn ? state.obsRet.final : state.obs.final,
      [f.perfilPassageiro]: context.preferencias,
      [f.email]: context.emailPassageiro || "",
      [f.trajeto]: isReturn ? invertTrajeto(context.trajeto) : trajeto,
      [f.paxView]: context.passageirosTelefones,
      [f.cotacao]: parseNumber(el.cotacao.value),
      [f.valorReceber]: parseNumber(el.valorReceber.value),
      [f.receber]: resolveReceberPayloadValue(context, kind, dataHora),
      [f.cr]: normalizeCodeValue(el.cr.value)
    };

    if (!isReturn && retornoPrevisto) payload[f.previsaoRetorno] = retornoPrevisto.toISOString();
    if (!isReturn) payload[f.enderecoPersonalizado] = state.enderecoPersonalizadoAtivo ? el.enderecoPersonalizado.value.trim() : null;
    if (isReturn) payload["cr40f_enderecodesaida1"] = el.retornoEndereco.value.trim();

    setChoice(payload, f.status, el.statusOperacao.value);
    setChoice(payload, f.statusFaturamento, el.statusFaturamento.value);
    setChoice(payload, f.tipoServico, scheduleOverride ? scheduleOverride.tipoServico : el.tipoServico.value);
    setChoice(payload, f.tipoVeiculo, scheduleOverride ? scheduleOverride.tipoVeiculo : el.tipoVeiculo.value);
    setChoice(payload, f.formaPagamento, el.formaPagamento.value);

    bindLookup(payload, CONFIG.nav.cliente, CONFIG.entitySets.cliente, el.cliente.value);
    bindLookup(payload, CONFIG.nav.solicitante, CONFIG.entitySets.passageiro, el.solicitante.value);
    bindLookup(payload, CONFIG.nav.motorista, CONFIG.entitySets.funcionario, scheduleOverride ? scheduleOverride.motorista : el.motorista.value);
    bindManualVehicleLookup(payload);
    bindLookup(payload, CONFIG.nav.financeiro, CONFIG.entitySets.financeiro, el.op.value);
    return payload;
  }

  function resolveReceberPayloadValue(context, kind, dataHora) {
    const isReturn = kind === "retorno" || kind === "frequenteRetorno";
    if (!isReturn) return !!el.receber.checked;
    if (!el.receberRetorno?.checked) return false;
    if (context.receberRetornoScope !== "last") return true;
    const timestamp = dataHora?.getTime?.();
    return timestamp === context.receberRetornoUltimoTimestamp;
  }

  async function createFrequentServices(context) {
    const frequentPeriodError = validateFrequentServicePeriod();
    if (frequentPeriodError) {
      throw new Error(frequentPeriodError);
    }
    if (datesAreInverted(el.frequenteInicio.value, el.frequenteFim.value)) {
      throw new Error("Data final não pode ser anterior a data inicial para serviços frequentes.");
    }
    const results = [];
    const dates = generateFrequentDates(el.frequenteInicio.value, el.frequenteFim.value, el.contabilizarFds.checked);
    const tipo = el.frequenteTipo.value;
    const principalTime = context.dataHoraPrincipal.getTime();

    if (tipo === "Ida" || tipo === "Ida e retorno") {
      for (const date of dates) {
        const dataIda = withTime(date, context.dataHoraPrincipal);
        if (dataIda.getTime() === principalTime) continue;
        const payload = buildReservaPayload(context, "frequenteIda", dataIda);
        delete payload[CONFIG.fields.reserva.previsaoRetorno];
        const retornoPrev = buildRecurringRetornoPrevisto(context, dataIda);
        if (retornoPrev) payload[CONFIG.fields.reserva.previsaoRetorno] = retornoPrev.toISOString();
        const saved = await saveReserva(payload);
        results.push({ tipo: "Ida", data: dataIda, result: saved });
        await replacePassengerRelations(saved.id, context.colOrdemPassageiros, context, true);
      }
    }

    if (tipo === "Retorno" || tipo === "Ida e retorno") {
      const retornoTime = el.retornoHora.value && el.retornoMinuto.value
        ? timeFromParts(el.retornoHora.value, el.retornoMinuto.value)
        : { hours: 18, minutes: 0 };
      const originalRetorno = context.dataHoraRetorno?.getTime();
      for (const date of dates) {
        const dataRetorno = withClock(date, retornoTime.hours, retornoTime.minutes);
        if (originalRetorno && dataRetorno.getTime() === originalRetorno) continue;
        const payload = buildReservaPayload(context, "frequenteRetorno", dataRetorno);
        const saved = await saveReserva(payload);
        results.push({ tipo: "Retorno", data: dataRetorno, result: saved });
        await replacePassengerRelations(saved.id, context.colOrdemPassageiros, context, false);
      }
    }

    return results;
  }

  async function saveReserva(payload, id) {
    if (!state.xrm || state.mockMode) {
      const saved = upsertMockRecord(payload, id);
      state.recordId = saved.id;
      return { id: saved.id };
    }
    if (id) {
      await state.xrm.WebApi.updateRecord(CONFIG.entities.reserva, id, payload);
      return { id };
    }
    const created = await state.xrm.WebApi.createRecord(CONFIG.entities.reserva, payload);
    return { id: cleanGuid(created.id) };
  }

  function buildPassengerRelationPayload(reservaId, item, context, includeAddress, includeLookups) {
    const payload = {
      [CONFIG.fields.servicoPassageiro.ordem]: item.ordem
    };
    if (includeLookups) {
      bindLookup(payload, CONFIG.nav.servicoGeral, CONFIG.entitySets.reserva, reservaId);
      bindLookup(payload, CONFIG.nav.servicoBancoDados, CONFIG.entitySets.passageiro, item.guid);
    }
    if (includeAddress) {
      const sharedAddress = context?.enderecoPersonalizadoAtivo ?? state.enderecoPersonalizadoAtivo;
      payload[CONFIG.fields.servicoPassageiro.endereco] = sharedAddress ? "" : (item.enderecoSaidaBD || "");
    }
    return payload;
  }

  function uniquePassengerRelationItems(passengers) {
    const byPassengerId = new Map();
    (passengers || []).forEach((item) => {
      const passengerId = cleanGuid(item?.guid || item?.passageiro?.id || "");
      if (!passengerId) return;
      const existing = byPassengerId.get(passengerId);
      if (!existing) {
        byPassengerId.set(passengerId, {
          ...item,
          guid: passengerId
        });
        return;
      }
      const currentAddress = String(existing.enderecoSaidaBD || "").trim();
      const nextAddress = String(item.enderecoSaidaBD || "").trim();
      if (nextAddress && !currentAddress.includes(nextAddress)) {
        existing.enderecoSaidaBD = [currentAddress, nextAddress].filter(Boolean).join(" / ");
      }
    });
    return Array.from(byPassengerId.values()).map((item, index) => ({
      ...item,
      ordem: index + 1
    }));
  }

  async function replacePassengerRelations(reservaId, passengers, context, includeAddress, removeExisting) {
    const relationPassengers = uniquePassengerRelationItems(passengers);
    if (!relationPassengers.length) return;
    if (!state.xrm || state.mockMode) {
      replaceMockRelations(reservaId, relationPassengers, includeAddress);
      return;
    }

    if (removeExisting) {
      const existing = await retrieveAll(
        CONFIG.entities.servicoPassageiro,
        `?$select=${CONFIG.fields.servicoPassageiro.id},_cr40f_bancodedados_value&$filter=_cr40f_geral_value eq ${reservaId}`
      );
      const existingByPassengerId = new Map();
      existing.forEach((row) => {
        const passengerId = cleanGuid(row._cr40f_bancodedados_value);
        if (!passengerId) return;
        if (!existingByPassengerId.has(passengerId)) {
          existingByPassengerId.set(passengerId, []);
        }
        existingByPassengerId.get(passengerId).push(row);
      });

      const usedRelationIds = new Set();
      await Promise.all(relationPassengers.map((item) => {
        const passengerId = cleanGuid(item.guid);
        const bucket = passengerId ? existingByPassengerId.get(passengerId) : null;
        const current = bucket?.shift();
        if (!current) {
          return state.xrm.WebApi.createRecord(
            CONFIG.entities.servicoPassageiro,
            buildPassengerRelationPayload(reservaId, item, context, includeAddress, true)
          );
        }
        const relationId = cleanGuid(current[CONFIG.fields.servicoPassageiro.id]);
        usedRelationIds.add(relationId);
        return state.xrm.WebApi.updateRecord(
          CONFIG.entities.servicoPassageiro,
          relationId,
          buildPassengerRelationPayload(reservaId, item, context, includeAddress, false)
        );
      }));

      await Promise.all(existing
        .filter((row) => !usedRelationIds.has(cleanGuid(row[CONFIG.fields.servicoPassageiro.id])))
        .map((row) => state.xrm.WebApi.deleteRecord(
          CONFIG.entities.servicoPassageiro,
          row[CONFIG.fields.servicoPassageiro.id]
        )));
      return;
    }

    await Promise.all(relationPassengers.map((item) => (
      state.xrm.WebApi.createRecord(
        CONFIG.entities.servicoPassageiro,
        buildPassengerRelationPayload(reservaId, item, context, includeAddress, true)
      )
    )));
  }

  async function updatePassengersLastServiceDate(passengers, serviceDate) {
    const dateOnly = dateOnlyValue(serviceDate);
    if (!dateOnly) return;
    const uniquePassengers = uniquePassengerRelationItems(passengers);
    if (!uniquePassengers.length) return;
    await Promise.all(uniquePassengers.map((item) => updatePassengerLastServiceDate(item.guid, dateOnly)));
  }

  async function updatePassengerLastServiceDate(passengerId, dateOnly) {
    const cleanPassengerId = cleanGuid(passengerId);
    if (!cleanPassengerId || !dateOnly) return;
    const passenger = getPassengerById(cleanPassengerId);
    const existingDate = state.xrm && !state.mockMode
      ? await retrievePassengerLastServiceDate(cleanPassengerId, passenger?.ultimoServico || "")
      : passenger?.ultimoServico || "";
    if (!shouldReplaceLastServiceDate(existingDate, dateOnly)) return;

    if (state.xrm && !state.mockMode) {
      await state.xrm.WebApi.updateRecord(CONFIG.entities.passageiro, cleanPassengerId, {
        [CONFIG.fields.passageiro.ultimoServico]: dateOnly
      });
    }
    const index = state.passageiros.findIndex((item) => sameId(item.id, cleanPassengerId));
    if (index >= 0) {
      state.passageiros[index] = { ...state.passageiros[index], ultimoServico: dateOnly };
      persistMockPassengerRecord(state.passageiros[index]);
    }
  }

  async function retrievePassengerLastServiceDate(passengerId, fallback = "") {
    try {
      const record = await state.xrm.WebApi.retrieveRecord(
        CONFIG.entities.passageiro,
        passengerId,
        `?$select=${CONFIG.fields.passageiro.ultimoServico}`
      );
      return record[CONFIG.fields.passageiro.ultimoServico] || fallback || "";
    } catch (error) {
      console.warn("Falha ao consultar Data do Último Serviço do passageiro.", error);
      return fallback || "";
    }
  }

  function shouldReplaceLastServiceDate(existingDate, nextDate) {
    if (!nextDate) return false;
    if (!existingDate) return true;
    const existing = parseDateInputValue(existingDate);
    const next = parseDateInputValue(nextDate);
    if (!next) return false;
    if (!existing) return true;
    return next.getTime() > existing.getTime();
  }

  function dateOnlyValue(date) {
    if (!date || Number.isNaN(date.getTime?.())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function setChoice(payload, field, value) {
    if (value === "" || value === null || value === undefined) return;
    const numeric = Number(value);
    payload[field] = Number.isFinite(numeric) ? numeric : value;
  }

  function bindLookup(payload, navName, entitySet, id) {
    if (!id) return;
    payload[`${navName}@odata.bind`] = `/${entitySet}(${cleanGuid(id)})`;
  }

  function clearLookup(payload, navName) {
    payload[`${navName}@odata.bind`] = null;
  }

  function bindManualVehicleLookup(payload) {
    if (!state.vehicleOriginManual) return;
    setChoice(payload, CONFIG.fields.reserva.origemVeiculo, 100000001);
    if (el.veiculo.value) bindLookup(payload, CONFIG.nav.veiculo, CONFIG.entitySets.veiculo, el.veiculo.value);
    else clearLookup(payload, CONFIG.nav.veiculo);
  }

  function resetAfterSuccess() {
    if (!state.isNew) return;
    state.enderecoPersonalizadoAtivo = false;
    state.selectedPassengers = [];
    state.scheduleDrafts = [];
    state.enderecoRascunho = [];
    state.activationDraftEditState = { return: false, repeat: false };
    state.obs = { motorista: "", interna: "", final: "", passageiro: "" };
    state.obsRet = { motorista: "", interna: "", final: "", passageiro: "" };
    state.obsAtual = "motorista";
    state.retObsAtual = "motorista";
    [
      el.trajeto,
      el.observacao,
      el.cotacao,
      el.valorReceber,
      el.cr,
      el.destino,
      el.retornoEndereco,
      el.retornoDestino,
      el.retornoObservacao,
      el.retornoData,
      el.retPrevDateTime,
      el.frequenteInicio,
      el.frequenteFim,
      el.enderecoPersonalizado
    ].forEach((input) => {
      setFieldValue(input, "");
    });
    [
      el.tipoServico,
      el.tipoVeiculo,
      el.motorista,
      el.formaPagamento,
      el.cliente,
      el.solicitante,
      el.op,
      el.retornoHora,
      el.retornoMinuto,
      el.frequenteTipo
    ].forEach((select) => {
      setSelectValue(select, "");
    });
    [el.agendarRetorno, el.repetirServico, el.receber, el.receberRetorno].forEach((input) => {
      setFieldValue(input, false);
    });
    setFieldValue(el.contabilizarFds, true);
    clearPassengerCreateForm();
    closePassengerPicker();
    closePassengerEditPopup();
    clearValidationStates();
    hydrateForm();
    renderScheduleDrafts();
    renderPassengers();
    renderRiskPanel();
    renderTabBadges();
    setTab("details");
  }

  function buildRetornoPrevisto(baseDateTime) {
    const explicitRetorno = parseDateTimeInputValue(el.retPrevDateTime?.value);
    if (explicitRetorno) return explicitRetorno;
    if (!baseDateTime || !el.retPrevHora.value || !el.retPrevMinuto.value) return null;
    const saidaTime = timeFromParts(el.saidaHora.value, el.saidaMinuto.value);
    const retornoTime = timeFromParts(el.retPrevHora.value, el.retPrevMinuto.value);
    const base = new Date(baseDateTime);
    if (retornoTime.minutesTotal < saidaTime.minutesTotal) base.setDate(base.getDate() + 1);
    return withClock(base, retornoTime.hours, retornoTime.minutes);
  }

  function buildRecurringRetornoPrevisto(context, baseDateTime) {
    if (!baseDateTime || !el.retPrevHora.value || !el.retPrevMinuto.value) return null;
    const saidaTime = timeFromParts(el.saidaHora.value, el.saidaMinuto.value);
    const retornoTime = timeFromParts(el.retPrevHora.value, el.retPrevMinuto.value);
    const base = new Date(baseDateTime);
    const explicitRetorno = parseDateTimeInputValue(el.retPrevDateTime?.value);
    let dayOffsetApplied = false;
    if (explicitRetorno && context?.dataHoraPrincipal) {
      const principalDay = new Date(context.dataHoraPrincipal);
      const retornoDay = new Date(explicitRetorno);
      principalDay.setHours(0, 0, 0, 0);
      retornoDay.setHours(0, 0, 0, 0);
      const dayOffset = Math.round((retornoDay.getTime() - principalDay.getTime()) / 86400000);
      if (dayOffset > 0) {
        base.setDate(base.getDate() + dayOffset);
        dayOffsetApplied = true;
      }
    }
    if (!dayOffsetApplied && retornoTime.minutesTotal < saidaTime.minutesTotal) {
      base.setDate(base.getDate() + 1);
    }
    return withClock(base, retornoTime.hours, retornoTime.minutes);
  }

  function combineDateTime(dateValue, hourValue, minuteValue) {
    const parsed = parseDateTimeInputValue(dateValue);
    if (parsed) return parsed;
    if (!dateValue || hourValue === "" || minuteValue === "") return null;
    const date = parseDateInputValue(dateValue);
    if (!date) return null;
    return withClock(date, Number(hourValue), Number(minuteValue));
  }

  function setDateTimeFields(date, dateInput, hourSelect, minuteSelect, allowBlank = false) {
    if (!dateInput) return;
    dateInput.value = date && !Number.isNaN(date.getTime()) ? toDateTimeLocalInput(date) : "";
    setTimeFields(date, hourSelect, minuteSelect, allowBlank);
  }

  function setTimeFields(date, hourSelect, minuteSelect, allowBlank) {
    if (!date || Number.isNaN(date.getTime())) {
      hourSelect.value = allowBlank ? "" : "00";
      minuteSelect.value = allowBlank ? "" : "00";
      return;
    }
    hourSelect.value = String(date.getHours()).padStart(2, "0");
    minuteSelect.value = String(Math.min(55, Math.floor(date.getMinutes() / 5) * 5)).padStart(2, "0");
  }

  function timeFromParts(hour, minute) {
    const hours = Number(hour || 0);
    const minutes = Number(minute || 0);
    return { hours, minutes, minutesTotal: hours * 60 + minutes };
  }

  function withTime(date, timeSource) {
    return withClock(date, timeSource.getHours(), timeSource.getMinutes());
  }

  function withClock(date, hours, minutes) {
    const next = new Date(date);
    next.setHours(hours, minutes, 0, 0);
    return next;
  }

  function generateFrequentDates(startValue, endValue, includeWeekends) {
    const start = parseDateInputValue(startValue);
    const end = parseDateInputValue(endValue);
    const dates = [];
    if (!start || !end) return dates;
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const day = date.getDay();
      if (includeWeekends || (day !== 0 && day !== 6)) dates.push(new Date(date));
    }
    return dates;
  }

  function composeEnderecoCompleto() {
    if (state.enderecoPersonalizadoAtivo) return el.enderecoPersonalizado.value.trim();
    return getValidPassengerRows()
      .sort((a, b) => a.ordem - b.ordem)
      .map((item) => `${item.ordem}. ${firstName(item.passageiro?.label) || `Passageiro ${item.ordem}`} - ${getDraftAddress(item.ordem) || item.enderecoEditado || "indeterminado"}`)
      .join(";\n");
  }

  function composeEnderecoCompletoInvertido() {
    const rows = getValidPassengerRows().sort((a, b) => b.ordem - a.ordem);
    const total = rows.length;
    return rows
      .map((item, index) => {
        const ordemExibicao = index + 1;
        return `${ordemExibicao}. ${firstName(item.passageiro?.label) || `Passageiro ${total - index}`} - ${getDraftAddress(item.ordem) || item.enderecoEditado || "indeterminado"}`;
      })
      .join(";\n");
  }

  function composePassageirosTelefones() {
    return getValidPassengerRows()
      .sort((a, b) => a.ordem - b.ordem)
      .map((item) => `${item.passageiro.label} - ${item.telefone || item.passageiro.telefone || "indeterminado"}`)
      .join(";\n");
  }

  function composePreferencias() {
    return getValidPassengerRows()
      .sort((a, b) => a.ordem - b.ordem)
      .filter((item) => (item.passageiro?.preferencias || "").trim())
      .map((item) => `${firstName(item.passageiro.label) || item.passageiro.label} - ${item.passageiro.preferencias.trim()}`)
      .join(";\n");
  }

  function firstPassengerValue(key) {
    const row = getValidPassengerRows().find((item) => item.passageiro?.[key]);
    return row?.passageiro?.[key] || "";
  }

  function getValidPassengerRows() {
    return state.selectedPassengers.filter((item) => item.guid && item.passageiro);
  }

  function hasDuplicatePassengers() {
    const ids = getValidPassengerRows().map((item) => cleanGuid(item.guid).toLowerCase());
    return new Set(ids).size !== ids.length;
  }

  function invertTrajeto(trajeto) {
    const parts = String(trajeto || "").split(" / ").map((part) => part.trim()).filter(Boolean);
    return parts.length >= 2 ? parts.reverse().join(" / ") : trajeto;
  }

  function firstName(name) {
    return String(name || "").trim().split(/\s+/)[0] || "";
  }

  function setSelectValue(select, value, fallback = "") {
    if (!select) return;
    if (!select.options) {
      select.value = value ?? fallback ?? "";
      if (select === el.motorista) renderMotoristaVehicleHint();
      return;
    }
    const stringValue = value === null || value === undefined ? "" : String(value);
    if (stringValue && [...select.options].some((option) => option.value === stringValue)) {
      select.value = stringValue;
      refreshCustomSelect(select);
      if (select === el.motorista) renderMotoristaVehicleHint();
      return;
    }
    select.value = fallback && [...select.options].some((option) => option.value === String(fallback)) ? String(fallback) : "";
    refreshCustomSelect(select);
    if (select === el.motorista) renderMotoristaVehicleHint();
  }

  function focusInvalidField(message) {
    const text = normalize(String(message || "")).replace(/\s+/g, " ");
    const revealed = revealInvalidFieldByMessage(text, message);
    if (revealed) return;
    if (text.includes("agendamento")) {
      focusField(el.scheduleDraftRows);
      return;
    }
    if (text.includes("horário") && text.includes("saída")) {
      focusField(el.saidaData);
      return;
    }
    if (text.includes("tipo do serviço")) {
      focusField(el.tipoServico);
      return;
    }
    if (text.includes("tipo do veiculo")) {
      focusField(el.tipoVeiculo);
      return;
    }
    if (text.includes("trajeto")) {
      focusField(el.trajeto);
      return;
    }
    if (text.includes("pelo menos um passageiro")) {
      if (el.addPassenger) {
        el.addPassenger.focus();
      } else {
        focusField(el.passengerRows);
      }
      return;
    }
    if (text.includes("endereço de saída")) {
      if (el.enderecoPersonalizadoAtivo && el.enderecoPersonalizado) {
        focusField(el.enderecoPersonalizado);
      } else if (state.selectedPassengers?.length) {
        focusField(el.passengerRows);
      } else {
        focusField(el.trajeto);
      }
      return;
    }
    if (text.includes("destino")) {
      focusField(el.destino);
      return;
    }
    if (text.includes("data de retorno") || text.includes("destino - retorno")) {
      focusField(el.retornoData);
      return;
    }
    if (text.includes("data de início") || text.includes("data de fim")) {
      focusField(el.frequenteInicio);
      return;
    }
    if (text.includes("tipo de serviço frequente") || text.includes("tipo de serviço frequente")) {
      focusField(el.frequenteTipo);
      return;
    }
  }

  function revealInvalidFieldByMessage(text, message) {
    if (text.includes("agendamento")) {
      revealInvalidField(el.scheduleDraftRows, message, { tab: "repeat" });
      return true;
    }
    if (text.includes("horario") && text.includes("saida")) {
      revealInvalidField(el.saidaData, message, { related: [el.saidaHora, el.saidaMinuto] });
      return true;
    }
    if (text.includes("tipo do servico")) {
      revealInvalidField(el.tipoServico, message);
      return true;
    }
    if (text.includes("tipo do veiculo")) {
      revealInvalidField(el.tipoVeiculo, message);
      return true;
    }
    if (text.includes("trajeto")) {
      revealInvalidField(el.trajeto, message);
      return true;
    }
    if (text.includes("pelo menos um passageiro")) {
      revealInvalidField(el.passengerBlock || el.passengerRows || el.addPassenger, message);
      return true;
    }
    if (text.includes("endereco de saida")) {
      if (state.enderecoPersonalizadoAtivo && el.enderecoPersonalizado) {
        revealInvalidField(el.enderecoPersonalizado, message);
        return true;
      }
      if (state.selectedPassengers?.length) {
        const row = [...(el.passengerRows?.querySelectorAll(".passenger-row") || [])]
          .find((item) => {
            const ordem = Number(item.dataset.ordem || 0);
            const selected = state.selectedPassengers.find((passenger) => passenger.ordem === ordem);
            return selected && !(getDraftAddress(ordem) || selected.enderecoEditado || "");
          });
        revealInvalidField(row?.querySelector(".passenger-address") || el.passengerRows, message);
        return true;
      }
      revealInvalidField(el.trajeto, message);
      return true;
    }
    if (text.includes("data de retorno")) {
      revealInvalidField(el.retornoData, message, { tab: "return", related: [el.retornoHora, el.retornoMinuto] });
      return true;
    }
    if (text.includes("destino - retorno")) {
      revealInvalidField(el.retornoDestino, message, { tab: "return" });
      return true;
    }
    if (text.includes("destino")) {
      revealInvalidField(el.destino, message);
      return true;
    }
    if (text.includes("cliente")) {
      revealInvalidField(el.cliente, message);
      return true;
    }
    if (text.includes("solicitante")) {
      revealInvalidField(el.solicitante, message);
      return true;
    }
    if (text.includes("data de inicio") || text.includes("data de fim")) {
      revealInvalidField(el.frequenteInicio, message, { tab: "repeat", related: [el.frequenteFim] });
      return true;
    }
    if (text.includes("data final")) {
      revealInvalidField(el.frequenteFim, message, { tab: "repeat", related: [el.frequenteInicio] });
      return true;
    }
    if (text.includes("tipo de servico frequente")) {
      revealInvalidField(el.frequenteTipo, message, { tab: "repeat" });
      return true;
    }
    return false;
  }

  function revealInvalidField(element, message, options = {}) {
    const target = element || document.querySelector(".panel.is-active .field");
    const related = [target, ...(options.related || [])].filter(Boolean);
    if (silentValidationReveal) {
      related.forEach((item) => markFieldInvalid(item, message));
      return;
    }
    const tab = options.tab || tabForElement(target);
    if (tab && state.currentTab !== tab) setTab(tab);
    related.forEach((item) => markFieldInvalid(item, message));
    window.setTimeout(() => {
      const scrollTarget = getValidationShell(target);
      scrollTarget?.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "nearest" });
      window.setTimeout(() => focusField(target), 180);
    }, 40);
  }

  function markFieldInvalid(element, message) {
    if (!element) return;
    const shell = getValidationShell(element);
    if (shell) {
      shell.classList.add("is-invalid");
      shell.dataset.validationMessage = message || "Campo obrigatorio.";
    }
    const control = getValidationControl(element);
    control?.setAttribute?.("aria-invalid", "true");
    const custom = customSelectRoots.get(control);
    custom?.trigger?.setAttribute("aria-invalid", "true");
  }

  function clearFieldValidation(element) {
    if (!element) return;
    const shell = getValidationShell(element);
    shell?.classList?.remove("is-invalid");
    if (shell?.dataset) delete shell.dataset.validationMessage;
    const control = getValidationControl(element);
    control?.removeAttribute?.("aria-invalid");
    const custom = customSelectRoots.get(control);
    custom?.trigger?.removeAttribute("aria-invalid");
  }

  function clearValidationStates() {
    document.querySelectorAll(".is-invalid").forEach((item) => {
      item.classList.remove("is-invalid");
      if (item.dataset) delete item.dataset.validationMessage;
    });
    document.querySelectorAll("[aria-invalid='true']").forEach((item) => item.removeAttribute("aria-invalid"));
  }

  function getValidationShell(element) {
    if (!element) return null;
    return element.closest?.(".field, .passenger-row, .passenger-block, .schedule-draft") || element;
  }

  function getValidationControl(element) {
    if (!element) return null;
    if (element.matches?.("input, select, textarea, button")) return element;
    return element.querySelector?.("input, select, textarea, button") || null;
  }

  function tabForElement(element) {
    return element?.closest?.(".panel")?.dataset?.panel || "";
  }

  function focusField(element) {
    if (!element) return;
    const state = customSelectRoots.get(element);
    if (state && state.trigger) {
      state.trigger.focus();
      return;
    }
    try {
      element.focus();
      return;
    } catch (_) {
      // noop
    }
  }

  function applyPassengerEditEmptySignals() {
    if (!el.passengerEditFields || !el.passengerEditFields.childElementCount) return;
    const rows = el.passengerEditFields.querySelectorAll(".passenger-edit-field");
    rows.forEach((row) => {
      const controls = row.querySelectorAll(
        "input.passenger-edit-control:not([type='checkbox']), " +
          "textarea.passenger-edit-control, " +
          "select.passenger-edit-control, " +
          "[data-passenger-edit-control='fotoUrl'], " +
          ".custom-select-trigger"
      );
      if (!controls.length) return;
      let allEmpty = true;
      controls.forEach((control) => {
        const empty = isPassengerEditControlEmpty(control);
        control.classList.toggle("is-empty", empty);
        if (!empty) allEmpty = false;
      });
      row.classList.toggle("is-empty", allEmpty);
    });
  }

  function isPassengerEditControlEmpty(control) {
    if (control.matches(".custom-select-trigger")) {
      const root = control.closest(".custom-select");
      const source = root ? root.querySelector("select") : null;
      if (!source) return false;
      return String(source.value || "").trim().length === 0;
    }
    if (!control) return true;
    if (control.dataset?.passengerEditControl === "fotoUrl") {
      return !normalizePassengerPhotoUrl(control.dataset.savedValue);
    }
    if (control.tagName === "SELECT") {
      return String(control.value || "").trim().length === 0;
    }
    return String(control.value || "").trim().length === 0;
  }

  function findOptionValue(key, label) {
    const wanted = normalize(label);
    return state.options[key].find((item) => normalize(item.label) === wanted)?.value || "";
  }

  function optionLabel(key, value) {
    return state.options[key].find((item) => String(item.value) === String(value))?.label || "";
  }

  // Link de cadastro (Custom API new_GerarLinkCadastro)
  let linkCadastroAtual = null;

  function bindLinkCadastro() {
    const overlay = document.getElementById("linkCadastroOverlay");
    document.getElementById("linkCadastroButton")?.addEventListener("click", () => abrirLinkCadastro(""));
    document.getElementById("passengerEditLinkCadastro")?.addEventListener("click", () => {
      if (!activePassengerEditId) {
        toast("Abra um passageiro do serviço para gerar o link dele.", "error");
        return;
      }
      abrirLinkCadastro(activePassengerEditId);
    });
    document.getElementById("linkCadastroClose")?.addEventListener("click", fecharLinkCadastro);
    overlay?.addEventListener("click", (event) => {
      if (event.target === overlay) fecharLinkCadastro();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && overlay && !overlay.hidden) {
        event.stopPropagation();
        fecharLinkCadastro();
      }
    }, true);
    document.getElementById("linkCadastroCopy")?.addEventListener("click", async () => {
      if (!linkCadastroAtual?.link) return;
      try {
        await copyTextToClipboard(linkCadastroAtual.link);
        toast("Link de cadastro copiado.", "success", 3000);
      } catch (_) {
        toast("Não foi possível copiar o link.", "error");
      }
    });
    document.getElementById("linkCadastroWhatsapp")?.addEventListener("click", () => {
      if (!linkCadastroAtual?.link) return;
      const texto = `Olá! Para agilizar o seu serviço com a Betinhos, preencha os dados dos passageiros neste link: ${linkCadastroAtual.link}\nVale até ${formatarValidadeLink(linkCadastroAtual.expiraEm)}.`;
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
    });
  }

  function fecharLinkCadastro() {
    const overlay = document.getElementById("linkCadastroOverlay");
    if (overlay) overlay.hidden = true;
    linkCadastroAtual = null;
  }

  function formatarValidadeLink(iso) {
    const data = new Date(iso);
    if (Number.isNaN(data.getTime())) return "";
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
    }).format(data).replace(",", "");
  }

  async function chamarGerarLinkCadastro(reservaId, passageiroId) {
    if (state.mockMode || !state.xrm) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const fotoMock = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#cbd5e1"/><circle cx="20" cy="16" r="7" fill="#64748b"/><rect x="8" y="26" width="24" height="12" rx="6" fill="#64748b"/></svg>');
      const todos = [
        { id: "00000000-0000-0000-0000-000000000001", nome: "Ana Souza", foto: fotoMock, telefone: "(11) 98888-7777", email: "ana@exemplo.com" },
        { id: "00000000-0000-0000-0000-000000000002", nome: "Bruno Lima", foto: "", telefone: "", email: "" }
      ];
      return {
        ok: true,
        link: `https://cadastro.exemplo.workers.dev/c/mock-${Date.now().toString(36)}`,
        expiraEm: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        passageiros: passageiroId ? todos.slice(0, 1) : todos
      };
    }
    const body = { new_ReservaId: cleanGuid(reservaId) };
    if (passageiroId) body.new_PassageiroId = cleanGuid(passageiroId);
    const clientUrl = state.xrm.Utility.getGlobalContext().getClientUrl();
    const response = await fetch(`${clientUrl}/api/data/v9.2/new_GerarLinkCadastro`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0"
      },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `Falha ao gerar o link (${response.status}).`);
    try {
      return JSON.parse(data.new_LinkJson || "{}");
    } catch (_) {
      throw new Error("Resposta inválida ao gerar o link.");
    }
  }

  function renderLinkCadastro(resultado) {
    const corpo = document.getElementById("linkCadastroBody");
    const validade = document.getElementById("linkCadastroValidade");
    const ok = resultado?.ok === true && !!resultado.link;
    linkCadastroAtual = ok ? resultado : null;
    document.getElementById("linkCadastroCopy").disabled = !ok;
    document.getElementById("linkCadastroWhatsapp").disabled = !ok;
    corpo.replaceChildren();
    if (!ok) {
      validade.textContent = "";
      const erro = document.createElement("p");
      erro.className = "link-cadastro-erro";
      erro.textContent = resultado?.erro || "Não foi possível gerar o link.";
      corpo.appendChild(erro);
      return;
    }
    validade.textContent = `Vale até ${formatarValidadeLink(resultado.expiraEm)}`;
    const url = document.createElement("p");
    url.className = "link-cadastro-url";
    url.textContent = resultado.link;
    corpo.appendChild(url);
    const passageiros = Array.isArray(resultado.passageiros) ? resultado.passageiros : [];
    if (passageiros.some((p) => p.foto || p.telefone || p.email)) {
      const aviso = document.createElement("p");
      aviso.className = "link-cadastro-aviso";
      aviso.textContent = "A solicitante poderá substituir os dados já cadastrados.";
      corpo.appendChild(aviso);
    }
    const lista = document.createElement("ul");
    lista.className = "link-cadastro-lista";
    passageiros.forEach((p) => {
      const item = document.createElement("li");
      item.className = "link-cadastro-item";
      const thumb = document.createElement(p.foto ? "img" : "span");
      thumb.className = "link-cadastro-thumb";
      if (p.foto) {
        thumb.src = p.foto;
        thumb.alt = "";
      } else {
        thumb.textContent = String(p.nome || "?").trim().charAt(0).toUpperCase();
      }
      const info = document.createElement("div");
      const nome = document.createElement("strong");
      nome.textContent = p.nome || "Passageiro sem nome";
      const dados = document.createElement("span");
      dados.textContent = [p.telefone, p.email].filter(Boolean).join(" · ") || "Sem telefone e e-mail";
      info.append(nome, dados);
      item.append(thumb, info);
      lista.appendChild(item);
    });
    corpo.appendChild(lista);
  }

  async function abrirLinkCadastro(passageiroId) {
    if (!state.recordId) {
      toast("Salve o serviço antes de gerar o link de cadastro.", "error", 5000);
      return;
    }
    const overlay = document.getElementById("linkCadastroOverlay");
    document.getElementById("linkCadastroTitle").textContent = passageiroId ? "Link de cadastro do passageiro" : "Link de cadastro";
    document.getElementById("linkCadastroValidade").textContent = "Gerando link...";
    document.getElementById("linkCadastroCopy").disabled = true;
    document.getElementById("linkCadastroWhatsapp").disabled = true;
    document.getElementById("linkCadastroBody").replaceChildren();
    overlay.hidden = false;
    overlay.querySelector(".dialog")?.focus();
    try {
      renderLinkCadastro(await chamarGerarLinkCadastro(state.recordId, passageiroId));
    } catch (error) {
      renderLinkCadastro({ ok: false, erro: error?.message || "Não foi possível gerar o link." });
    }
  }

  async function copyTextToClipboard(value) {
    const text = String(value || "").trim();
    if (!text) return;
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (error) {
        console.warn("Clipboard API indisponível, usando fallback", error);
      }
    }
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "readonly");
    input.style.position = "fixed";
    input.style.opacity = "0";
    input.style.pointerEvents = "none";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) throw new Error("Fallback de cópia recusado pelo navegador.");
  }

  function clearCopyNotice() {
    document.querySelectorAll(".copy-notice").forEach((node) => node.remove());
  }

  function showCopyNotice(anchor, message, isError = false) {
    if (!anchor?.getBoundingClientRect) return;
    clearCopyNotice();
    const range = document.createRange();
    range.selectNodeContents(anchor);
    const rects = [...range.getClientRects()].filter((item) => item.width || item.height);
    const textRect = rects[rects.length - 1] || anchor.getBoundingClientRect();
    const notice = document.createElement("div");
    notice.className = `copy-notice${isError ? " is-error" : ""}`;
    notice.textContent = message;
    document.body.appendChild(notice);

    const gap = 6;
    const width = notice.offsetWidth || 72;
    const height = notice.offsetHeight || 22;
    const preferredLeft = textRect.right + gap;
    const fallbackLeft = textRect.left - width - gap;
    const left = preferredLeft + width + 12 <= window.innerWidth
      ? preferredLeft
      : Math.max(12, fallbackLeft);
    const top = Math.max(12, Math.min(textRect.top + (textRect.height - height) / 2, window.innerHeight - height - 12));

    notice.style.left = `${left}px`;
    notice.style.top = `${top}px`;

    requestAnimationFrame(() => {
      notice.classList.add("is-visible");
    });

    window.setTimeout(() => {
      if (!notice.isConnected) return;
      notice.classList.remove("is-visible");
      window.setTimeout(() => notice.remove(), 180);
    }, 900);
  }

  function sameId(a, b) {
    return cleanGuid(a).toLowerCase() === cleanGuid(b).toLowerCase();
  }

  function syncAllDateTimeInputs() {
    syncLegacyTimePartsFromDateTime(el.saidaData, el.saidaHora, el.saidaMinuto);
    syncLegacyTimePartsFromDateTime(el.retornoData, el.retornoHora, el.retornoMinuto);
    syncLegacyTimePartsFromDateTime(el.retPrevDateTime, el.retPrevHora, el.retPrevMinuto);
  }

  function syncDateTimeFieldRowWidths() {
    const containers = [...document.querySelectorAll(".form-grid")];
    containers.forEach((container) => {
      const items = [...container.children]
        .filter((node) => node instanceof HTMLElement)
        .filter((node) => !node.hidden && node.offsetParent !== null);

      items.forEach((node) => node.classList.remove("is-row-alone"));
      if (!items.length) return;

      const rows = [];
      items.forEach((node) => {
        const top = node.offsetTop;
        const row = rows.find((entry) => Math.abs(entry.top - top) <= 2);
        if (row) {
          row.items.push(node);
          return;
        }
        rows.push({ top, items: [node] });
      });

      rows.forEach((row) => {
        if (row.items.length !== 1) return;
        const [onlyItem] = row.items;
        if (!onlyItem.classList.contains("datetime-field")) return;
        onlyItem.classList.add("is-row-alone");
      });
    });
  }

  function syncLegacyTimePartsFromDateTime(dateTimeInput, hourInput, minuteInput) {
    const date = parseDateTimeInputValue(dateTimeInput?.value);
    if (!date) {
      if (hourInput) hourInput.value = "";
      if (minuteInput) minuteInput.value = "";
      return;
    }
    if (hourInput) hourInput.value = String(date.getHours()).padStart(2, "0");
    if (minuteInput) minuteInput.value = String(Math.min(55, Math.floor(date.getMinutes() / 5) * 5)).padStart(2, "0");
  }

  function applyPtBrDateLocale(input) {
    if (!input) return input;
    if (!ptBrDateInputType(input)) return input;
    input.lang = PT_BR_LOCALE;
    input.setAttribute("lang", PT_BR_LOCALE);
    input.autocomplete = "off";
    input.setAttribute("autocomplete", "off");
    input.spellcheck = false;
    input.setAttribute("data-locale", PT_BR_LOCALE);
    return input;
  }

  function enforceDocumentPtBrLocale() {
    document.documentElement.lang = PT_BR_LOCALE;
    document.documentElement.setAttribute("lang", PT_BR_LOCALE);
    document.body?.setAttribute("lang", PT_BR_LOCALE);
  }

  function enforcePtBrDateLocale(root = document) {
    root.querySelectorAll?.('input[type="date"], input[type="datetime-local"]').forEach((input) => {
      applyPtBrDateLocale(input);
    });
  }

  function installPtBrDateLocaleObserver() {
    if (ptBrDateLocaleObserver || !document?.body || typeof MutationObserver !== "function") return;
    ptBrDateLocaleObserver = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes?.forEach((node) => {
          if (node?.nodeType !== 1) return;
          if (ptBrDateInputType(node)) applyPtBrDateLocale(node);
          enforcePtBrDateLocale(node);
        });
      });
    });
    ptBrDateLocaleObserver.observe(document.body, { childList: true, subtree: true });
  }

  function ptBrDateInputType(input) {
    const type = String(input?.getAttribute?.("type") || input?.type || "").toLowerCase();
    return type === "date" || type === "datetime-local" ? type : "";
  }

  function isValidLocalDateParts(year, month, day, hour = 0, minute = 0) {
    if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return false;
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(hour, minute, 0, 0);
    return date.getFullYear() === year
      && date.getMonth() === month - 1
      && date.getDate() === day
      && date.getHours() === hour
      && date.getMinutes() === minute;
  }

  function isPtBrDateValueInRange(value, input, type) {
    const comparable = type === "date" ? value.slice(0, 10) : normalizeDateTimeRangeValue(value);
    const min = input.getAttribute("min");
    const max = input.getAttribute("max");
    if (min && comparable < (type === "date" ? min.slice(0, 10) : normalizeDateTimeRangeValue(min))) return false;
    if (max && comparable > (type === "date" ? max.slice(0, 10) : normalizeDateTimeRangeValue(max))) return false;
    return true;
  }

  function normalizeDateTimeRangeValue(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    return text.includes("T") ? text.slice(0, 16) : `${text.slice(0, 10)}T00:00`;
  }

  function parseDateTimeInputValue(value) {
    const text = String(value || "").trim();
    if (!text || !text.includes("T")) return null;
    const [datePart, timePart = ""] = text.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour = 0, minute = 0] = timePart.split(":").map(Number);
    if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
    if (!isValidLocalDateParts(year, month, day, hour, minute)) return null;
    const date = new Date(year, month - 1, day, hour, minute, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function parseDateInputValue(value) {
    const datePart = datePartFromInputValue(value);
    const [year, month, day] = datePart.split("-").map(Number);
    if (![year, month, day].every(Number.isFinite)) return null;
    if (!isValidLocalDateParts(year, month, day)) return null;
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function datePartFromInputValue(value) {
    const text = String(value || "").trim();
    return text.includes("T") ? text.slice(0, 10) : text;
  }

  function timePartFromInputValue(value) {
    const text = String(value || "").trim();
    if (!text.includes("T")) return text;
    return text.slice(11, 16);
  }

  function dateTimeLocalFromParts(dateValue, hourValue, minuteValue) {
    const datePart = datePartFromInputValue(dateValue);
    if (!datePart || !hourValue || !minuteValue) return "";
    return `${datePart}T${String(hourValue).padStart(2, "0")}:${String(minuteValue).padStart(2, "0")}`;
  }

  function importedTrechoDateTimeLocal(trecho) {
    return dateTimeLocalFromParts(trecho?.dataIso, ...String(trecho?.horario || "").split(":"));
  }

  function importedTrechoReturnDateTimeLocal(trecho) {
    return dateTimeLocalFromParts(
      trecho?.retornoPrevistoDataIso || trecho?.dataIso,
      ...String(trecho?.retornoPrevistoHorario || "").split(":")
    );
  }

  function syncScheduleDateTimeFields(item) {
    if (!item) return;
    item.dataHora = item.dataHora || dateTimeLocalFromParts(item.data, item.hora, item.minuto);
    item.data = datePartFromInputValue(item.dataHora || item.data);
    const [hour = "", minute = ""] = timePartFromInputValue(item.dataHora || "").split(":");
    if (hour) item.hora = hour;
    if (minute) item.minuto = minute;
    item.retPrevDateTime = item.retPrevDateTime || dateTimeLocalFromParts(item.data || datePartFromInputValue(item.dataHora), item.retPrevHora, item.retPrevMinuto);
    const [retHour = "", retMinute = ""] = timePartFromInputValue(item.retPrevDateTime || "").split(":");
    if (retHour) item.retPrevHora = retHour;
    if (retMinute) item.retPrevMinuto = retMinute;
  }

  function isGuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanGuid(value));
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function searchTokens(value) {
    return normalize(value)
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter(Boolean);
  }

  function searchableTextMatches(text, query) {
    const normalizedText = normalize(text);
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return true;
    if (!normalizedText) return false;
    if (normalizedText.includes(normalizedQuery)) return true;
    const textTokens = searchTokens(normalizedText);
    const queryTokens = searchTokens(normalizedQuery);
    if (!queryTokens.length) return true;
    return queryTokens.every((queryToken) => (
      normalizedText.includes(queryToken)
        || textTokens.some((textToken) => textToken.startsWith(queryToken) || textToken.includes(queryToken))
    ));
  }

  function parseNumber(value) {
    if (value === "" || value === null || value === undefined) return null;
    const raw = String(value)
      .replace(/[^\d,.-]/g, "")
      .trim();
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const hasDecimalSeparator = decimalSeparator === ","
      ? lastComma >= 0
      : lastDot >= 0 && raw.length - lastDot - 1 !== 3;
    const cleaned = hasDecimalSeparator
      ? raw
        .replace(new RegExp(`\\${decimalSeparator === "," ? "." : ","}`, "g"), "")
        .replace(decimalSeparator, ".")
      : raw.replace(/[.,]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function sanitizeCurrencyInput(value) {
    return String(value || "")
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(/(,.*),/g, "$1")
      .replace(/(\..*)\./g, "$1");
  }

  function formatCurrencyDisplayValue(value) {
    const parsed = parseNumber(value);
    if (parsed === null) return "";
    return parsed.toLocaleString(PT_BR_LOCALE, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function validateEmailControl(input, options = {}) {
    if (!input || !input.value.trim()) {
      clearFieldValidation(input);
      return true;
    }
    if (input.checkValidity()) {
      clearFieldValidation(input);
      return true;
    }
    revealInvalidField(input, "Informe um email valido.", options);
    return false;
  }

  function validatePhoneControl(input, options = {}) {
    if (!input || !input.value.trim()) {
      clearFieldValidation(input);
      return true;
    }
    const parsed = parsePhoneNumber(input.value);
    input.value = parsed.formatted;
    clearFieldValidation(input);
    return true;
  }

  function toDateInput(date) {
    if (!date || Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function toDateTimeLocalInput(date) {
    if (!date || Number.isNaN(date.getTime())) return "";
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(Math.min(55, Math.floor(date.getMinutes() / 5) * 5)).padStart(2, "0");
    return `${toDateInput(date)}T${hours}:${minutes}`;
  }

  function formatDateTime(date) {
    return new Intl.DateTimeFormat(PT_BR_LOCALE, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function formatVoucherIssuedAt(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(PT_BR_LOCALE, {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function selectDisplayLabel(select, fallback = "") {
    if (!select) return fallback;
    const option = select.options?.[select.selectedIndex];
    const label = String(option?.textContent || option?.label || "").trim();
    if (label && option?.value) return label;
    return String(fallback || "").trim();
  }

  function buildVoucherReference(date, count) {
    const pad = (value) => String(value).padStart(2, "0");
    return `VC-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}-${count}`;
  }

  function voucherServiceKindLabel(tipo) {
    if (tipo === "Principal") return "Serviço principal";
    if (tipo === "Retorno") return "Retorno";
    if (tipo === "Ida") return "Recorrência ida";
    if (tipo === "Edição") return "Serviço confirmado";
    return "Serviço confirmado";
  }

  function buildVoucherServiceSnapshot(context, item, shared) {
    const isReturn = item.tipo === "Retorno";
    const note = String(isReturn ? state.obsRet.final : state.obs.final).trim();
    const recordId = cleanGuid(item.result?.id || "");
    return {
      typeLabel: voucherServiceKindLabel(item.tipo),
      shortId: recordId ? recordId.slice(-6).toUpperCase() : "",
      scheduledAt: formatDateTime(item.data),
      sortTime: item.data instanceof Date ? item.data.getTime() : 0,
      serviceType: shared.serviceType,
      vehicleType: shared.vehicleType,
      requester: shared.requester,
      passengerSummary: shared.passengerSummary,
      route: String(isReturn ? invertTrajeto(context.trajeto) : context.trajeto).trim() || shared.serviceType,
      origin: String(isReturn ? shared.returnOrigin : shared.origin).trim() || "Não informado",
      destination: String(isReturn ? shared.returnDestination : shared.destination).trim() || "Não informado",
      note
    };
  }

  function buildSuccessVoucherSnapshot(context, results) {
    const generatedAt = new Date();
    const passengerRows = [...(context.colOrdemPassageiros || [])].sort((a, b) => a.ordem - b.ordem);
    const passengerNames = passengerRows
      .map((item) => normalizePassengerDisplayName(item.passageiro?.label || `Passageiro ${item.ordem}`))
      .filter(Boolean);
    const passengerSummary = passengerNames.length ? passengerNames.join("\n") : "Não informado";
    const shared = {
      client: selectDisplayLabel(el.cliente, "Não informado"),
      requester: selectDisplayLabel(el.solicitante, passengerNames[0] || "Não informado"),
      serviceType: optionLabel("tipoServico", el.tipoServico.value) || "Não informado",
      vehicleType: optionLabel("tipoVeiculo", el.tipoVeiculo.value) || "A confirmar",
      status: optionLabel("statusOperacao", el.statusOperacao.value) || "Confirmado",
      operationCode: selectDisplayLabel(el.op, ""),
      costCenter: normalizeCodeValue(el.cr.value) || "",
      passengerSummary,
      preferenceSummary: String(context.preferencias || "").trim(),
      origin: String(context.enderecoCompleto || "").trim(),
      destination: String(el.destino.value || "").trim(),
      returnOrigin: String(el.retornoEndereco.value || el.destino.value || "").trim(),
      returnDestination: String(el.retornoDestino.value || context.enderecoCompletoInvertido || context.enderecoCompleto || "").trim()
    };
    const services = [...results]
      .map((item) => buildVoucherServiceSnapshot(context, item, shared))
      .sort((a, b) => a.sortTime - b.sortTime)
      .map((item, index) => ({ ...item, order: index + 1 }));

    return {
      reference: buildVoucherReference(generatedAt, services.length),
      issuedAtLabel: formatVoucherIssuedAt(generatedAt),
      client: shared.client,
      requester: shared.requester,
      serviceType: shared.serviceType,
      vehicleType: shared.vehicleType,
      status: shared.status,
      operationCode: shared.operationCode,
      costCenter: shared.costCenter,
      passengerSummary,
      passengerCount: passengerNames.length,
      preferenceSummary: shared.preferenceSummary,
      services
    };
  }

  function chunkVoucherItems(items, size) {
    const output = [];
    for (let index = 0; index < items.length; index += size) {
      output.push(items.slice(index, index + size));
    }
    return output;
  }

  function escapeVoucherHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderVoucherInfoLine(label, value) {
    return `<div class="voucher-info-line">
      <span>${escapeVoucherHtml(label)}</span>
      <strong>${escapeVoucherHtml(value || "Não informado")}</strong>
    </div>`;
  }

  function renderVoucherServiceRow(service) {
    const noteHtml = service.note
      ? `<div class="voucher-service-note">
          <span>Observações</span>
          <p>${escapeVoucherHtml(service.note)}</p>
        </div>`
      : "";
    return `<article class="voucher-itinerary-item">
      <div class="voucher-itinerary-index">${String(service.order).padStart(2, "0")}</div>
      <div class="voucher-itinerary-body">
        <header class="voucher-itinerary-head">
          <div>
            <strong>${escapeVoucherHtml(service.typeLabel)}</strong>
            <span>${escapeVoucherHtml(service.shortId ? `Ref. ${service.shortId}` : "Confirmação")}</span>
          </div>
          <time>${escapeVoucherHtml(service.scheduledAt || "Não informado")}</time>
        </header>
        <div class="voucher-route-panel">
          <div>
            <span>Origem</span>
            <p>${escapeVoucherHtml(service.origin || "Não informado")}</p>
          </div>
          <div class="voucher-route-arrow" aria-hidden="true"></div>
          <div>
            <span>Destino</span>
            <p>${escapeVoucherHtml(service.destination || "Não informado")}</p>
          </div>
        </div>
        <div class="voucher-itinerary-details">
          <div><span>Passageiro(s)</span><strong>${escapeVoucherHtml(service.passengerSummary || "Não informado")}</strong></div>
          <div><span>Trajeto</span><strong>${escapeVoucherHtml(service.route || "Não informado")}</strong></div>
          <div><span>Tipo / veículo</span><strong>${escapeVoucherHtml(`${service.serviceType} / ${service.vehicleType}`)}</strong></div>
          <div><span>Solicitante</span><strong>${escapeVoucherHtml(service.requester || "Não informado")}</strong></div>
        </div>
        ${noteHtml}
      </div>
    </article>`;
  }

  function renderVoucherServiceSummary(services, status) {
    const first = services[0];
    if (!first) return "";
    const last = services[services.length - 1];
    const period = services.length === 1
      ? first.scheduledAt
      : `${first.scheduledAt} - ${last.scheduledAt}`;
    const routeList = services
      .map((service) => service.route)
      .filter(Boolean)
      .filter((route, index, list) => list.indexOf(route) === index)
      .join("; ");
    return `<section class="voucher-description">
      <span>Resumo executivo</span>
      <h2>${status === "Solicitado" ? "Transporte solicitado" : status === "Confirmado" ? "Transporte confirmado" : "Transporte registrado"}</h2>
      <p>Serviço(s) terrestre(s) programado(s) para <strong>${escapeVoucherHtml(period)}</strong>.</p>
      <p>${escapeVoucherHtml(routeList || first.route || "Não informado")}</p>
    </section>`;
  }

  function buildSuccessVoucherHtml(voucher) {
    const firstPageServices = voucher.services.slice(0, 4);
    const continuationPages = chunkVoucherItems(voucher.services.slice(4), 5);
    const isConfirmed = voucher.status === "Confirmado";
    const isRequested = voucher.status === "Solicitado";
    const documentTitle = isRequested ? "Serviço solicitado" : isConfirmed ? "Serviço confirmado" : "Serviço registrado";
    const preferenceBlock = voucher.preferenceSummary
      ? `<div class="voucher-observation">
          <span>Perfil / preferências informadas:</span>
          <p>${escapeVoucherHtml(voucher.preferenceSummary)}</p>
        </div>`
      : "";
    const firstPage = `<section class="voucher-page">
      <header class="voucher-topbar">
        <div class="voucher-brand-block">
          <div class="voucher-brand-mark" aria-hidden="true">B</div>
          <div>
            <strong>BETINHOS</strong>
            <span>Executive Service</span>
          </div>
        </div>
        <div class="voucher-document-title">
          <span>${isRequested ? "Solicitação executiva" : isConfirmed ? "Confirmação executiva" : "Registro operacional"}</span>
          <h1>${documentTitle}</h1>
        </div>
      </header>
      <main class="voucher-page-body">
        <section class="voucher-summary-panel">
          <div class="voucher-summary-main">
            <span>Cliente / solicitante</span>
            <strong>${escapeVoucherHtml(voucher.client)}</strong>
            <p>${escapeVoucherHtml(voucher.requester)}</p>
          </div>
          <div class="voucher-summary-meta">
            <div><span>Referência</span><strong>${escapeVoucherHtml(voucher.reference)}</strong></div>
            <div><span>Emissão</span><strong>${escapeVoucherHtml(voucher.issuedAtLabel)}</strong></div>
            <div><span>Status</span><strong>${escapeVoucherHtml(voucher.status)}</strong></div>
            <div><span>Serviços</span><strong>${escapeVoucherHtml(String(voucher.services.length))}</strong></div>
          </div>
        </section>
        ${renderVoucherServiceSummary(voucher.services, voucher.status)}
        <section class="voucher-service-stack">
          ${firstPageServices.map(renderVoucherServiceRow).join("")}
        </section>
        ${preferenceBlock}
      </main>
      <footer class="voucher-footer">
        <p>${isConfirmed ? "Documento de confirmação operacional." : "Documento de solicitação operacional. Consulte o status antes de operar."} Valores, cobrança e forma de pagamento constam apenas no recibo ou faturamento oficial.</p>
        <div class="voucher-contact-grid">
          <span>Júnior de Paula</span><strong>Concierge (Bilingual)</strong><span>+55 12 99723 6961</span><span>junior@betinhos.com.br</span>
          <span>Deborah Keila</span><strong>Operations Manager</strong><span>+55 12 99615 9093</span><span>deborah.keila@betinhos.com.br</span>
          <span>Juliana Rodrigues</span><strong>Finance Manager</strong><span>+55 12 99615 9085</span><span>financeiro@betinhos.com.br</span>
        </div>
      </footer>
    </section>`;
    const nextPages = continuationPages.map((chunk, index) => `<section class="voucher-page voucher-page-continuation">
      <header class="voucher-continuation-head">
        <div class="voucher-brand-block">
          <div class="voucher-brand-mark" aria-hidden="true">B</div>
          <div>
            <strong>BETINHOS</strong>
            <span>Executive Service</span>
          </div>
        </div>
        <div class="voucher-document-title">
          <span>${escapeVoucherHtml(voucher.reference)} - Página ${index + 2}</span>
          <h1>Continuação</h1>
        </div>
      </header>
      <div class="voucher-page-body">
        <section class="voucher-service-stack">
          ${chunk.map(renderVoucherServiceRow).join("")}
        </section>
      </div>
      <footer class="voucher-footer">
        <p>Documento gerado automaticamente pelo formulário operacional Betinhos.</p>
      </footer>
    </section>`).join("");
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeVoucherHtml(voucher.reference)} - Voucher Betinhos</title>
  <style>
    :root {
      --navy: #06182f;
      --gold: #b98e43;
      --gold-soft: #d7bd7c;
      --ink: #101820;
      --muted: #6d7480;
      --blue-strip: #eaf1fa;
      --line: #bfc8d2;
      --soft-line: #dfe6ef;
      --paper: #fefefe;
      --shell: #d8e0e9;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: var(--shell);
      color: var(--ink);
      font-family: "Manrope", "Segoe UI", Arial, sans-serif;
    }
    body { padding: 20px; }
    .voucher-toolbar {
      width: min(210mm, 100%);
      margin: 0 auto 12px;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .voucher-toolbar button {
      min-height: 34px;
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 8px 14px;
      font: inherit;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .02em;
      cursor: pointer;
      transition: transform 140ms ease, opacity 140ms ease;
    }
    .voucher-toolbar button:hover {
      transform: translateY(-1px);
      opacity: .9;
    }
    .voucher-print {
      background: var(--navy);
      color: #f7f9fc;
    }
    .voucher-close {
      background: #f7f9fc;
      color: var(--navy);
    }
    .voucher-document {
      display: grid;
      gap: 18px;
    }
    .voucher-page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: var(--paper);
      border: 1px solid #0a1b31;
      box-shadow: 0 18px 42px rgba(6, 24, 47, .18);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .voucher-topbar,
    .voucher-continuation-head {
      min-height: 72px;
      padding: 11px 36px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--navy);
      color: #f7f9fc;
    }
    .voucher-topbar h1,
    .voucher-continuation-head strong {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 31px;
      font-weight: 400;
      line-height: 1;
      letter-spacing: .01em;
    }
    .voucher-continuation-head span {
      color: #d9e4f1;
      font-size: 12px;
      font-weight: 800;
    }
    .voucher-brand-mark {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      border: 2px solid var(--gold);
      display: grid;
      place-items: center;
      color: var(--gold-soft);
      font-family: Georgia, "Times New Roman", serif;
      font-size: 34px;
      font-weight: 800;
      box-shadow: inset 0 0 0 2px rgba(255,255,255,.16);
    }
    .voucher-brand-block {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 210px;
    }
    .voucher-brand-block strong {
      display: block;
      color: #f7f9fc;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 22px;
      font-weight: 500;
      line-height: .96;
    }
    .voucher-brand-block span {
      display: block;
      margin-top: 3px;
      color: #cbd6e2;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .16em;
      text-transform: uppercase;
    }
    .voucher-document-title {
      display: grid;
      gap: 5px;
      justify-items: end;
      text-align: right;
    }
    .voucher-document-title span {
      color: var(--gold-soft);
      font-size: 10px;
      font-weight: 900;
      letter-spacing: .18em;
      text-transform: uppercase;
    }
    .voucher-document-title h1 {
      margin: 0;
      color: #f7f9fc;
      font-size: 25px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: 0;
    }
    .voucher-ribbon {
      min-height: 28px;
      padding: 0 34px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      background: var(--blue-strip);
      color: #536170;
      font-size: 11px;
      font-weight: 600;
    }
    .voucher-ribbon strong,
    .voucher-ribbon span:last-child {
      color: var(--navy);
      font-weight: 900;
    }
    .voucher-page-body {
      flex: 1;
      padding: 26px 34px 18px;
      display: grid;
      align-content: start;
      gap: 16px;
      background:
        linear-gradient(90deg, rgba(185,142,67,.14) 0 2px, transparent 2px 100%) 34px 24px / calc(100% - 68px) 1px no-repeat,
        var(--paper);
    }
    .voucher-summary-panel {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(300px, .95fr);
      gap: 22px;
      align-items: stretch;
      padding: 16px 18px;
      border: 1px solid var(--line);
      background: #f7f9fc;
    }
    .voucher-summary-main {
      display: grid;
      align-content: center;
      gap: 6px;
    }
    .voucher-summary-main span,
    .voucher-summary-meta span,
    .voucher-description span,
    .voucher-itinerary-details span,
    .voucher-route-panel span,
    .voucher-service-note span {
      color: #758191;
      font-size: 9px;
      font-weight: 900;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    .voucher-summary-main strong {
      color: #081a31;
      font-size: 19px;
      font-weight: 900;
      line-height: 1.12;
    }
    .voucher-summary-main p {
      margin: 0;
      color: #334255;
      font-size: 13px;
      font-weight: 750;
    }
    .voucher-summary-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      border-left: 1px solid var(--soft-line);
      padding-left: 18px;
      gap: 12px 18px;
    }
    .voucher-summary-meta div {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .voucher-summary-meta strong {
      color: #081a31;
      font-size: 12px;
      font-weight: 900;
      line-height: 1.25;
      word-break: break-word;
    }
    .voucher-party-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(260px, .9fr);
      gap: 30px;
      align-items: start;
    }
    .voucher-party-primary {
      display: grid;
      gap: 2px;
      padding-top: 1px;
      font-size: 13px;
      line-height: 1.18;
    }
    .voucher-party-primary strong {
      font-size: 14px;
      line-height: 1.16;
    }
    .voucher-party-primary span {
      font-weight: 800;
    }
    .voucher-info-panel {
      display: grid;
      gap: 2px;
      font-size: 11px;
    }
    .voucher-info-line {
      display: grid;
      grid-template-columns: 1fr 1.15fr;
      gap: 14px;
      align-items: baseline;
    }
    .voucher-info-line span {
      color: #87909b;
      text-align: right;
      line-height: 1.15;
    }
    .voucher-info-line strong {
      color: #001a33;
      text-align: right;
      font-weight: 900;
      line-height: 1.15;
    }
    .voucher-description {
      margin-top: 2px;
      display: grid;
      gap: 5px;
    }
    .voucher-description h2 {
      margin: 0;
      color: #081a31;
      font-size: 18px;
      font-weight: 900;
    }
    .voucher-description p {
      margin: 0;
      font-size: 12px;
      font-weight: 650;
      line-height: 1.45;
    }
    .voucher-service-stack {
      display: grid;
      gap: 12px;
    }
    .voucher-itinerary-item {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr);
      gap: 12px;
      break-inside: avoid;
    }
    .voucher-itinerary-index {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border: 1px solid var(--line);
      background: var(--navy);
      color: #f7f9fc;
      font-size: 13px;
      font-weight: 900;
      font-variant-numeric: tabular-nums;
    }
    .voucher-itinerary-body {
      min-width: 0;
      border: 1px solid var(--line);
      background: #ffffff;
    }
    .voucher-itinerary-head {
      min-height: 42px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 9px 12px;
      border-bottom: 1px solid var(--soft-line);
    }
    .voucher-itinerary-head strong {
      display: block;
      color: #081a31;
      font-size: 13px;
      font-weight: 900;
    }
    .voucher-itinerary-head div span {
      display: block;
      margin-top: 2px;
      color: #758191;
      font-size: 10px;
      font-weight: 750;
    }
    .voucher-itinerary-head time {
      color: #081a31;
      font-size: 12px;
      font-weight: 900;
      white-space: nowrap;
    }
    .voucher-route-panel {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr);
      gap: 12px;
      padding: 12px;
      background: #f7f9fc;
      border-bottom: 1px solid var(--soft-line);
    }
    .voucher-route-panel p {
      margin: 4px 0 0;
      color: #172333;
      font-size: 11px;
      font-weight: 780;
      line-height: 1.35;
      white-space: pre-line;
    }
    .voucher-route-arrow {
      position: relative;
      align-self: center;
      height: 1px;
      background: var(--gold);
    }
    .voucher-route-arrow::after {
      content: "";
      position: absolute;
      right: 0;
      top: 50%;
      width: 7px;
      height: 7px;
      border-top: 1px solid var(--gold);
      border-right: 1px solid var(--gold);
      transform: translateY(-50%) rotate(45deg);
    }
    .voucher-itinerary-details {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 14px;
      padding: 12px;
    }
    .voucher-itinerary-details div {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .voucher-itinerary-details strong {
      color: #172333;
      font-size: 11px;
      font-weight: 780;
      line-height: 1.35;
      white-space: pre-line;
    }
    .voucher-service-note {
      margin: 0 12px 12px;
      padding: 9px 10px;
      background: #fbf7ed;
      border: 1px solid #e2d4ae;
    }
    .voucher-service-note p {
      margin: 4px 0 0;
      color: #4d5968;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.4;
      white-space: pre-line;
    }
    .voucher-service-block {
      border: 1px solid var(--line);
      break-inside: avoid;
    }
    .voucher-service-title-row {
      min-height: 30px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      padding: 6px 8px;
      background: var(--blue-strip);
      border-bottom: 1px solid var(--line);
      font-size: 12px;
    }
    .voucher-service-title-row strong {
      color: #001a33;
      font-weight: 900;
    }
    .voucher-service-title-row span {
      color: #001a33;
      font-weight: 900;
      white-space: nowrap;
    }
    .voucher-service-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 11px;
    }
    .voucher-service-table th,
    .voucher-service-table td {
      padding: 6px 8px;
      border-top: 1px solid var(--soft-line);
      vertical-align: top;
      line-height: 1.35;
    }
    .voucher-service-table tr:first-child th,
    .voucher-service-table tr:first-child td {
      border-top: 0;
    }
    .voucher-service-table th {
      width: 118px;
      color: #778290;
      text-align: left;
      font-weight: 700;
    }
    .voucher-service-table td {
      font-weight: 800;
      white-space: pre-line;
    }
    .voucher-service-note-row span {
      display: block;
      color: #778290;
      font-weight: 700;
      margin-bottom: 2px;
    }
    .voucher-observation {
      margin-top: 1px;
      font-size: 11px;
      color: #6f7a86;
    }
    .voucher-observation span {
      display: block;
      margin-bottom: 4px;
      font-weight: 800;
    }
    .voucher-observation p {
      margin: 0;
      white-space: pre-line;
      line-height: 1.4;
    }
    .voucher-footer {
      margin-top: auto;
      padding: 14px 28px 16px;
      display: grid;
      gap: 10px;
      border-top: 1px solid var(--soft-line);
      background: #f7f9fc;
      color: var(--ink);
    }
    .voucher-affiliations {
      display: grid;
      grid-template-columns: 1fr 1.1fr 1fr;
      align-items: end;
      gap: 22px;
      min-height: 112px;
    }
    .voucher-nla {
      font-size: 37px;
      font-weight: 950;
      line-height: .82;
      letter-spacing: -.06em;
    }
    .voucher-nla span {
      display: block;
      margin-top: 3px;
      font-size: 8px;
      font-weight: 800;
      letter-spacing: 0;
      line-height: 1.1;
    }
    .voucher-brand-lockup {
      display: grid;
      justify-items: center;
      gap: 0;
      font-family: Georgia, "Times New Roman", serif;
      color: #111820;
      text-align: center;
    }
    .voucher-brand-lockup span {
      width: 42px;
      height: 42px;
      border: 2px solid var(--gold);
      border-radius: 50%;
      display: grid;
      place-items: center;
      color: var(--gold);
      font-size: 28px;
      font-weight: 900;
      line-height: 1;
    }
    .voucher-brand-lockup strong {
      font-size: 28px;
      font-weight: 500;
      line-height: .9;
    }
    .voucher-brand-lockup small {
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 9px;
      letter-spacing: .08em;
    }
    .voucher-recognized {
      justify-self: end;
      width: 126px;
      display: grid;
      justify-items: center;
      gap: 3px;
      font-size: 8px;
      text-align: center;
      color: #111820;
    }
    .voucher-recognized strong {
      width: 58px;
      height: 58px;
      border: 2px solid #111820;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 20px;
    }
    .voucher-recognized span {
      font-size: 8px;
      font-weight: 700;
    }
    .voucher-footer p {
      margin: 0;
      padding: 0;
      border-top: 0;
      color: #566272;
      font-size: 10px;
      text-align: left;
    }
    .voucher-contact-grid {
      display: grid;
      grid-template-columns: 1fr 1.25fr 1.1fr 1.55fr;
      gap: 4px 16px;
      padding-top: 10px;
      border-top: 1px solid #c7d0dc;
      font-size: 9.5px;
      line-height: 1.25;
      align-items: center;
    }
    .voucher-contact-grid strong {
      color: #064bb0;
      font-weight: 500;
    }
    @media print {
      @page {
        size: A4 portrait;
        margin: 0;
      }
      html, body {
        background: #fff;
        padding: 0;
      }
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .voucher-toolbar {
        display: none !important;
      }
      .voucher-document {
        gap: 0;
      }
      .voucher-page {
        margin: 0;
        box-shadow: none;
        page-break-after: always;
      }
      .voucher-page:last-child {
        page-break-after: auto;
      }
    }
  </style>
</head>
<body>
  <div class="voucher-toolbar">
    <button type="button" class="voucher-close" onclick="window.close()">Fechar</button>
    <button type="button" class="voucher-print" onclick="window.print()">Imprimir / Salvar PDF</button>
  </div>
  <main class="voucher-document">
    ${firstPage}
    ${nextPages}
  </main>
</body>
</html>`;
  }

  function setLoading(value) {
    state.loading = value;
    el.loading.hidden = !value;
    el.saveButton.disabled = value;
  }

  function openSuccessVoucher() {
    const voucher = state.lastSuccessVoucher;
    if (!voucher?.services?.length) {
      toast("Não há serviços salvos para gerar o voucher.", "warning", 5000);
      return;
    }
    const popup = window.open("", "_blank", "width=1160,height=920");
    if (!popup) {
      toast("Permita pop-ups para abrir o voucher.", "warning", 7000);
      return;
    }
    popup.document.open();
    popup.document.write(buildSuccessVoucherHtml(voucher));
    popup.document.close();
  }

  function showSuccess(message) {
    el.successMessage.textContent = message;
    if (el.generateVoucher) {
      const hasVoucher = !!state.lastSuccessVoucher?.services?.length;
      el.generateVoucher.hidden = !hasVoucher;
      el.generateVoucher.disabled = !hasVoucher;
    }
    el.success.hidden = false;
  }

  function getSelectedText() {
    return String(window.getSelection?.().toString() || "").trim();
  }

  function toast(message, type = "info", timeout = 5000, anchor = null) {
    if (type === "error") {
      void reportAppError(message, {
        source: "toast",
        phase: "ui-feedback",
        severity: "error"
      });
    }
    const item = document.createElement("div");
    item.className = `toast ${type}`;

    const msg = document.createElement("span");
    msg.className = "toast-message";
    msg.textContent = message;

    const close = document.createElement("button");
    close.className = "toast-close";
    close.type = "button";
    close.setAttribute("aria-label", "Fechar notificação");
    close.textContent = "×";
    close?.addEventListener("click", (event) => {
      event.stopPropagation();
      item.remove();
    });
    item.addEventListener("click", () => {
      if (getSelectedText()) return;
      item.remove();
    });

    item.append(msg, close);
    if (anchor && Number.isFinite(anchor.clientX) && Number.isFinite(anchor.clientY)) {
      item.classList.add("toast-floating");
      item.style.left = `${Math.max(12, anchor.clientX + 14)}px`;
      item.style.top = `${Math.max(12, anchor.clientY - 18)}px`;
      document.body.appendChild(item);
    } else {
      el.toastStack.appendChild(item);
    }
    window.setTimeout(() => item.remove(), timeout);
  }

  installAppErrorLogging();

  init().catch((error) => {
    console.error(error);
    setLoading(false);
    toast(error.message || "Falha ao iniciar formulário.", "error", 9000);
  });
})();
