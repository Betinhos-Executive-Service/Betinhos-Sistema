using Microsoft.Crm.Sdk.Messages;

namespace Betinhos.DriverRecordSharing
{
    internal static class PluginConfig
    {
        public const string CreateMessage = "Create";
        public const string UpdateMessage = "Update";
        public const string DeleteMessage = "Delete";
        public const string PreImageAlias = "pre";
        public const string TargetParameterName = "Target";
        public const string ExchangeLifecycleAuthorizedVariable = "Betinhos.ExchangeLifecycleAuthorized";
        public const string ExchangeLifecycleReasonParameter = "new_Motivo";
        public const string ExchangeExpectedVersionParameter = "new_VersaoEsperada";
        public const string ExchangeLifecycleEffectiveAtParameter = "new_DataEfetiva";
        public const string ExchangeManualCompletionReason = "new_motivodeconclusaomanual";
        public const string ExchangeCancellationReason = "new_motivodecancelamento";
        public const string ExchangeReversalReason = "new_motivodereversao";
        public const string ExchangeOriginalReversalLookup = "cr40f_new_trocaoriginalrevertida";
        public const string ExchangeRevertedFlag = "new_revertida";
        public const string ExchangeActionExecutorLookup = "new_executadopor";
        public const string RevertCompensationOutput = "new_TrocaCompensatoriaId";
        public const string VersionNumber = "versionnumber";

        public const string ServiceTable = "cr40f_reservadeveculos";
        public const string ServicePrimaryId = "cr40f_reservadeveculosid";
        public const string ServiceDriverLookup = "cr40f_motorista";
        public const string ServiceMaintenanceLookup = "cr40f_om";
        public const string ServiceRequesterLookup = "cr40f_solicitante";
        public const string ServiceStartDate = "cr40f_dataehorriodesada";
        public const string ServiceEndDate = "cr40f_horrioprevistoderetorno";
        public const string ServiceVehicleLookup = "cr40f_veiculo";
        public const string ServiceVehicleOrigin = "new_origemveiculo";
        public const int ServiceVehicleOriginAutomatic = 100000000;
        public const int ServiceVehicleOriginManual = 100000001;
        public const int ServiceVehicleOriginInfleet = 100000002;
        public const int ServiceVehicleOriginDriverChosen = 100000003;
        public const string ServiceVehicleInfleetShare = "new_percentualveiculoinfleet";
        public const string ServiceVehicleInfleetEvidence = "new_evidenciaveiculoinfleet";
        public const string EmployeeInfleetDriverId = "new_infleetdriverid";
        public const string VehiclePlate = "cr40f_placa";
        public const string VehicleModel = "cr40f_modelo";
        public const string VehicleColor = "cr40f_cor";
        public const string VehicleNormalizedPlate = "new_placanormalizada";
        public const string VehicleCode = "cr40f_id";
        public const string VehicleBrand = "cr40f_marca";
        public const string VehicleManufactureYear = "cr40f_anodefabricacao";
        public const string VehicleModelYear = "cr40f_anodemodelo";
        public const string VehicleOwnership = "new_propriedade";
        public const string VehicleCategory = "new_categoriadoveiculo";
        public const string VehicleStatus = "cr40f_statusdoveiculo";
        public const string VehicleInfleetId = "new_infleetvehicleid";
        public const string VehicleInfleetSyncedAt = "new_ultimasincronizacaoinfleet";
        public const string VehicleNotes = "cr40f_comentariosextras";
        public const int VehicleStatusActive = 202410001;
        public const int VehicleCategoryOwn = 100000000;
        public const int VehicleCategoryThirdParty = 100000001;
        public const int VehicleCategoryRental = 100000002;
        public const int VehicleOwnershipOwn = 100000000;
        public const int VehicleOwnershipRented = 100000001;
        public const string EmployeeLinkType = "cr40f_tipodevinculo";
        public const int EmployeeLinkTypeThirdParty = 1;
        public const string EmployeeCurrentVehicle = "cr40f_veiculoatual";
        public const string EmployeeCurrentVehicleSince = "new_veiculoatualdesde";
        public const string EmployeeCurrentVehicleOrigin = "new_origemveiculoatual";
        public const int EmployeeCurrentVehicleOriginInfleet = 100000000;
        public const string EmployeeFullName = "cr40f_nomecompleto";
        public const string EmployeeCorporatePhone = "cr40f_telefonecorporativo";
        public const string EmployeePhoto = "cr40f_foto";
        public const string ServiceCustomDeparture = "new_enderecodesaidapersonalizado";
        public const string ServiceReturnDeparture = "cr40f_enderecodesaida1";
        public const string PassengerDatabaseDeparture = "cr40f_enderecodesaida";
        public const string ServicePassengerOrder = "cr40f_ordemdeselecao";
        public const string ServicePassengerDepartureAddress = "new_enderecodesaidacolunaservicosporpassageiro";
        public const string EnvSharePointList = "new_URLFlowListarArquivosSharePoint";
        public const string EnvSharePointQuery = "new_URLFlowConsultarArquivosSharePoint";
        public const string DevOrganizationName = "org23b93544";
        public const string ServiceTrackingLink = "new_linkacompanhamento";
        public const string ServiceTrackingLinkExpiresAt = "new_linkacompanhamentoexpiraem";
        public const string ServiceCode = "cr40f_id";
        public const string ServiceDepartureAddress = "cr40f_endereodesada";
        public const string ServiceDestinationAddress = "cr40f_destino";
        public const string ServiceRoute = "cr40f_trajeto";
        public const string ServiceProgrammedFlag = "new_foiprogramado";
        public const string ServiceDriverViewedAt = "new_visualizacaodomotorista";
        public const string ServiceExchangeLookup = "cr40f_ot";
        public const string ServicePassengerViewField = "cr40f_passageirosetelefonedecontato";
        public const string ServiceAddressViewField = "cr40f_endereodesada";
        public const string ServiceDestinationViewField = "cr40f_destino";
        public const string ServiceOperationNotesField = "cr40f_obsdeoperao";
        public const string ServiceCategory = "new_categoriadoitem";
        public const string ServiceStatus = "cr40f_status";
        public const string ServiceFinalizedAt = "new_datadefinalizacao";
        public const string ServiceBillingStatus = "cr40f_statusdefaturamento";
        public const int ServiceBillingStatusNotBillable = 202410011;
        public const int ServiceCategoryExchange = 100000002;
        public const int ServiceStatusCanceled = 202410002;
        public const int ServiceStatusCanceledWithReservations = 202410010;
        public const int ServiceStatusConfirmed = 202410001;
        public const int ServiceStatusCompleted = 202410008;
        public const int ServiceStatusProgrammed = 202410005;
        public const int ServiceStatusPreReservation = 202410000;
        public const int ServiceStatusRequested = 202410004;
        // Serviço que ainda não começou: o carro da posse pode ser preenchido (terceiro) ou limpo (colaborador).
        public static readonly int[] ServiceNotStartedStatuses = { ServiceStatusPreReservation, ServiceStatusRequested, ServiceStatusConfirmed, ServiceStatusProgrammed };
        public static readonly int[] ServiceBackfillCategories = { 100000000, 100000001 };
        public const int EmployeeBackfillDaysBack = 45;
        public const int ServiceVehicleSyncDaysBack = 1;
        public const int ServiceVehicleSyncDaysAhead = 90;

        public const string MaintenanceTable = "cr40f_manutencoes";
        public const string MaintenancePrimaryId = "cr40f_manutencoesid";

        public const string EmployeeTable = "cr40f_funcionarios";
        public const string EmployeePrimaryId = "cr40f_funcionariosid";
        public const string EmployeeName = "cr40f_nomecompleto";
        public const string EmployeeMicrosoftEmail = "cr40f_emailmicrosoft";
        public const string EmployeeDismissalDate = "cr40f_datadedemissao";

        public const string UserTable = "systemuser";
        public const string UserPrimaryId = "systemuserid";
        public const string UserFullName = "fullname";
        public const string UserInternalEmail = "internalemailaddress";
        public const string UserIsDisabled = "isdisabled";

        public const string DriverNoticeTable = "new_avisomotorista";
        public const string DriverNoticeName = "new_name";
        public const string DriverNoticeService = "new_reserva";
        public const string DriverNoticeEmployee = "new_funcionario";
        public const string DriverNoticeKindColumn = "new_tipo";
        public const string DriverNoticeSituation = "new_situacao";
        public const string DriverNoticeDeadline = "new_prazovisualizacao";
        public const string DriverNoticeKey = "new_chaveidempotencia";
        public const int DriverNoticePending = 100000000;
        public const int DriverNoticeSent = 100000001;
        public const int DriverNoticeFailed = 100000002;
        public const int DriverNoticeNoApp = 100000003;
        public const int DriverNoticeCanceled = 100000005;

        public const string AppLogTable = "new_appmotoristaslog";
        public const string AppLogName = "new_name";
        public const string AppLogOccurredAt = "new_occurredat";
        public const string AppLogSeverity = "new_severity";
        public const string AppLogSource = "new_source";
        public const string AppLogAction = "new_action";
        public const string AppLogPhase = "new_phase";
        public const string AppLogComponent = "new_component";
        public const string AppLogDetailId = "new_detailid";
        public const string AppLogDetailType = "new_detailtype";
        public const string AppLogMessage = "new_message";
        public const string AppLogStack = "new_stack";
        public const string AppLogErrorName = "new_errorname";
        public const string AppLogErrorCode = "new_errorcode";
        public const string AppLogAppName = "new_appname";
        public const string AppLogPayloadJson = "new_payloadjson";
        public const string AppLogRawJson = "new_rawjson";

        public const string ServicePassengerTable = "cr40f_servicosporpassageiro";
        public const string ServicePassengerPrimaryId = "cr40f_servicosporpassageiroid";
        public const string ServicePassengerServiceLookup = "cr40f_geral";
        public const string ServicePassengerPassengerLookup = "cr40f_bancodedados";

        public const string ReceiptTable = "cr40f_recibos_v2";
        public const string ReceiptPrimaryId = "cr40f_recibos_v2id";
        public const string ReceiptDriverLookup = "cr40f_motorista";
        public const string ReceiptServiceLookup = "cr40f_reserva";

        public const string QuoteRequestTable = "cr40f_pedidodecotacao";
        public const string QuoteRequestPrimaryId = "cr40f_pedidodecotacaoid";
        public const string QuoteRequestLastSyncOrigin = "cr40f_origemultimasincronizacao";
        public const string QuoteRequestLastSyncOriginManual = "Manual";
        public const string QuoteRequestStatus = "cr40f_statuscotacao";
        public const string QuoteRequestDeadline = "cr40f_prazoresponder";
        public const string QuoteRequestQuotedValue = "cr40f_valorcotado";
        public const string QuoteRequestCommercialTerms = "cr40f_condicaocomercial";
        public const string QuoteRequestCustomerReplySent = "cr40f_respostaenviadacliente";
        public const string QuoteRequestCompany = "cr40f_clienteempresa";
        public const string QuoteRequestContact = "cr40f_contatocliente";
        public const string QuoteRequestWhatsappPhone = "cr40f_telefonewhatsapp";
        public const string QuoteRequestCustomerEmail = "cr40f_emailcliente";
        public const string QuoteRequestOrigin = "cr40f_origem";
        public const string QuoteRequestDestination = "cr40f_destino";
        public const string QuoteRequestServiceDate = "cr40f_datahoraservico";
        public const string QuoteRequestPassengerCount = "cr40f_quantidadepassageiros";
        public const string QuoteRequestNotes = "cr40f_observacoespedido";
        public const string QuoteRequestPriority = "cr40f_prioridade";

        public const string ExchangeTable = "cr40f_trocasdecarro";
        public const string VehicleTable = "cr40f_veiculos";
        public const string ExchangePrimaryId = "cr40f_trocasdecarroid";
        public const string ExchangeBusinessId = "cr40f_id";
        public const string ExchangeDriver1Lookup = "cr40f_motorista1";
        public const string ExchangeDriver2Lookup = "cr40f_motorista2";
        public const string ExchangeVehicle1Lookup = "cr40f_veiculo1antesdatroca";
        public const string ExchangeVehicle2Lookup = "cr40f_veiculo2antesdatroca";
        public const string ExchangeStartDate = "cr40f_iniciodajaneladetroca";
        public const string ExchangeEndDate = "cr40f_fimdajaneladetroca";
        public const string ExchangeStatus = "cr40f_statusdatroca";
        public const string ExchangeType = "new_tipodetroca";
        public const string ExchangeObservation = "cr40f_observacao";
        public const string ExchangeIdempotencyKey = "new_idempotencykey";
        public const string ExchangeRequestHash = "new_requesthash";
        public const string ExchangeDriver1Completed = "new_concluidomotorista1";
        public const string ExchangeDriver2Completed = "new_concluidomotorista2";
        public const string ExchangeDriver1Observation = "new_observacaodomotorista1";
        public const string ExchangeDriver2Observation = "new_observacaodomotorista2";
        public const string ExchangeWindowMode = "new_mododajanela";
        public const string ExchangeDriver1AfterLookup = "new_m1depoisde";
        public const string ExchangeDriver1BeforeLookup = "new_m1antesde";
        public const string ExchangeDriver2AfterLookup = "new_m2depoisde";
        public const string ExchangeDriver2BeforeLookup = "new_m2antesde";
        public const string ExchangeLocation = "new_localdatroca";
        public const string ExchangeWindowAlert = "new_alertajanela";
        public const string ExchangeDriver1OutOfWindowReason = "new_motivoforadajanelamotorista1";
        public const string ExchangeDriver2OutOfWindowReason = "new_motivoforadajanelamotorista2";
        public const string ExchangeOutOfWindowReasonParameter = "new_MotivoForaDaJanela";
        public const string ExchangeUnboundCommandMessage = "new_ExecutarComandoTroca";
        public const int ExchangeStatusCanceled = 202410002;
        public const int ExchangeStatusCompleted = 202410001;
        public const int ExchangeStatusProgrammed = 202410000;
        public const int ExchangeStatusConfirmed = 100000001;
        public const int ExchangeTypeSwap = 100000000;
        public const int ExchangeTypeReturnToBase = 100000001;
        public const int ExchangeTypeTakeFromBase = 100000002;
        public const int ExchangeTypeHandoff = 100000003;
        public const string ExchangeBaseLocationLookup = "new_localdebase";
        public const string BaseLocationTable = "new_localdebase";

        public const string VehiclePossessionTable = "new_possedeveiculo";
        public const string VehiclePossessionPrimaryId = "new_possedeveiculoid";
        public const string VehiclePossessionDriverLookup = "new_motorista";
        public const string VehiclePossessionVehicleLookup = "new_veiculo";
        public const string VehiclePossessionStartDate = "new_iniciodaposse";
        public const string VehiclePossessionEndDate = "new_fimdaposse";
        public const string VehiclePossessionExchangeLookup = "new_trocadecarrorelacionada";
        public const string VehiclePossessionBaseLocationLookup = "new_localdebase";
        public const string VehiclePossessionOpenDriverKey = "new_chavemotoristaposseaberta";
        public const string VehiclePossessionOpenVehicleKey = "new_chaveveiculoposseaberta";

        public const string CollisionTable = "cr40f_colisao_v2";
        public const string CollisionPrimaryId = "cr40f_colisao_v2id";
        public const string CollisionDriverLookup = "cr40f_motorista";

        public const string PassengerTable = "cr40f_bancodedados";
        public const string PassengerPrimaryId = "cr40f_bancodedadosid";
        public const string PassengerName = "cr40f_nomedopassageiro";
        public const string PassengerPhone = "cr40f_telefone";

        public static readonly AccessRights ServiceAccessRights =
            AccessRights.ReadAccess |
            AccessRights.WriteAccess |
            AccessRights.AppendAccess |
            AccessRights.AppendToAccess;

        public static readonly AccessRights AssignedRecordAccessRights = ServiceAccessRights;
        public static readonly AccessRights MaintenanceAccessRights = AssignedRecordAccessRights;
        public static readonly AccessRights ServicePassengerAccessRights = AccessRights.ReadAccess;
        public static readonly AccessRights PassengerAccessRights = AccessRights.ReadAccess;
        public static readonly AccessRights EmployeeSelfAccessRights =
            AccessRights.ReadAccess |
            AccessRights.AppendToAccess;
        public static readonly AccessRights EmployeeContactAccessRights = AccessRights.ReadAccess;
    }
}
