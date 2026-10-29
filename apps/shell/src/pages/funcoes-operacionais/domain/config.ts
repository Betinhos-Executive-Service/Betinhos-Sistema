// Nomes de tabelas, entity sets, colunas, navegações e option sets usados pela tela (paridade com o WebResource
// new_telafuncoesoperacionais v1.0.173). Os rótulos de option set são o fallback quando a Web API não devolve
// a anotação FormattedValue.
export const CONFIG = {
  appName: "Funções Operacionais",
  ranges: {
    servicesStartOffsetDays: -7,
    servicesEndOffsetDays: 7
  },
  entities: {
    reserva: "cr40f_reservadeveculos",
    funcionario: "cr40f_funcionarios",
    veiculo: "cr40f_veiculos",
    servicoPassageiro: "cr40f_servicosporpassageiro",
    trocaCarro: "cr40f_trocasdecarro",
    posseVeiculo: "new_possedeveiculo",
    localBase: "new_localdebase"
  },
  entitySets: {
    reserva: "cr40f_reservadeveculoses",
    cliente: "cr40f_clientes1s",
    bancoDados: "cr40f_bancodedadoses",
    funcionario: "cr40f_funcionarioses",
    veiculo: "cr40f_veiculoses",
    servicoPassageiro: "cr40f_servicosporpassageiros",
    trocaCarro: "cr40f_trocasdecarros",
    posseVeiculo: "new_possedeveiculos",
    localBase: "new_localdebases"
  },
  fields: {
    reserva: {
      id: "cr40f_reservadeveculosid",
      readableId: "cr40f_id",
      dataSaida: "cr40f_dataehorriodesada",
      previsaoRetorno: "cr40f_horrioprevistoderetorno",
      statusOperacao: "cr40f_status",
      statusFaturamento: "cr40f_statusdefaturamento",
      tipoServico: "cr40f_tipodoservico",
      tipoVeiculo: "cr40f_tipodeveiculo",
      destino: "cr40f_destino",
      enderecoSaida: "cr40f_endereodesada",
      obsOperacao: "cr40f_obsdeoperao",
      obsInterna: "cr40f_observaointerna",
      paxView: "cr40f_passageirosetelefonedecontato",
      trajeto: "cr40f_trajeto",
      perfilPassageiro: "cr40f_perfildopassageiro",
      email: "cr40f_email",
      receber: "cr40f_receber",
      formaPagamento: "cr40f_formadepagamento",
      cotacao: "cr40f_cotao",
      cr: "cr40f_cr",
      categoriaItem: "new_categoriadoitem",
      finalizedAt: "new_datadefinalizacao",
      lookupCliente: "_cr40f_cliente_value",
      lookupSolicitante: "_cr40f_solicitante_value",
      lookupMotorista: "_cr40f_motorista_value",
      lookupVeiculo: "_cr40f_veiculo_value",
      lookupOt: "_cr40f_ot_value"
    },
    funcionario: {
      id: "cr40f_funcionariosid",
      nome: "cr40f_nomecompleto",
      apelido: "new_apelido",
      emailMicrosoft: "cr40f_emailmicrosoft",
      tipoVinculo: "cr40f_tipodevinculo"
    },
    veiculo: {
      id: "cr40f_veiculosid",
      modelo: "cr40f_modelo",
      cor: "cr40f_cor",
      placa: "cr40f_placa",
      status: "statuscode",
      propriedade: "new_propriedade",
      blindado: "new_blindado",
      fornecedorLocacao: "new_fornecedorlocacao",
      fimLocacao: "new_fimlocacao"
    },
    servicoPassageiro: {
      id: "cr40f_servicosporpassageiroid",
      ordem: "cr40f_ordemdeselecao",
      endereco: "new_enderecodesaidacolunaservicosporpassageiro",
      lookupGeral: "_cr40f_geral_value",
      lookupPassageiro: "_cr40f_bancodedados_value"
    },
    trocaCarro: {
      id: "cr40f_trocasdecarroid",
      inicioJanela: "cr40f_iniciodajaneladetroca",
      fimJanela: "cr40f_fimdajaneladetroca",
      status: "cr40f_statusdatroca",
      tipo: "new_tipodetroca",
      observacao: "cr40f_observacao",
      lookupMotorista1: "_cr40f_motorista1_value",
      lookupMotorista2: "_cr40f_motorista2_value",
      lookupVeiculo1: "_cr40f_veiculo1antesdatroca_value",
      lookupVeiculo2: "_cr40f_veiculo2antesdatroca_value",
      modoJanela: "new_mododajanela",
      local: "new_localdatroca",
      alertaJanela: "new_alertajanela",
      lookupM1DepoisDe: "_new_m1depoisde_value",
      lookupM1AntesDe: "_new_m1antesde_value",
      lookupM2DepoisDe: "_new_m2depoisde_value",
      lookupM2AntesDe: "_new_m2antesde_value",
      lookupLocalBase: "_new_localdebase_value"
    },
    posseVeiculo: {
      id: "new_possedeveiculoid",
      inicio: "new_iniciodaposse",
      fim: "new_fimdaposse",
      lookupMotorista: "_new_motorista_value",
      lookupVeiculo: "_new_veiculo_value",
      lookupLocalBase: "_new_localdebase_value"
    },
    localBase: {
      id: "new_localdebaseid",
      nome: "new_name",
      endereco: "new_endereco",
      linkMapa: "new_linkmapa"
    }
  },
  nav: {
    cliente: ["cr40f_Cliente"],
    solicitante: ["cr40f_Solicitante"],
    motorista: ["cr40f_Motorista"],
    veiculo: ["cr40f_Veiculo", "cr40f_veiculo"],
    servicoGeral: ["cr40f_Geral"],
    servicoPassageiro: ["cr40f_BancodeDados"],
    trocaMotorista1: ["cr40f_Motorista1"],
    trocaMotorista2: ["cr40f_Motorista2"],
    trocaVeiculo1: ["cr40f_Veiculo1AntesdaTroca"],
    trocaVeiculo2: ["cr40f_Veiculo2AntesdaTroca"],
    posseMotorista: ["new_Motorista"],
    posseVeiculo: ["new_Veiculo"],
    posseTroca: ["new_TrocadeCarroRelacionada"],
    reservaOt: ["cr40f_OT"]
  },
  choices: {
    statusOperacao: {
      202410002: "Cancelado",
      100000001: "Requer Análise",
      202410010: "Cancelado com Ressalvas",
      202410000: "Pré-reserva",
      202410004: "Solicitado",
      202410001: "Confirmado",
      202410005: "Programado",
      202410006: "Em Execução",
      202410008: "Concluído"
    } as Record<number, string>,
    statusFaturamento: {
      202410011: "Não Faturável",
      202410005: "Pendente",
      100000001: "Composição Realizada",
      202410000: "Cancelado Sem Taxa",
      202410002: "Cancelado Com Taxa",
      202410003: "Cortesia",
      202410004: "Permuta",
      202410006: "Pagante em Viagem",
      202410007: "Pagamento Pendente",
      202410012: "Pagamento Em Atraso",
      202410008: "Faturamento Mensal",
      202410010: "Pago"
    } as Record<number, string>,
    tipoServico: {
      202410000: "Guarulhos",
      202410001: "São Paulo",
      202410002: "Outras Cidades",
      202410003: "Vale do Paraíba",
      202410004: "Rio de Janeiro",
      202410005: "Pindamonhangaba",
      202410006: "São José dos Campos",
      202410007: "Congonhas",
      202410008: "Campinas",
      202410009: "Dentro de São Paulo",
      202410010: "Litoral",
      202410011: "Região dos Lagos",
      202410012: "Extrema",
      202410013: "Nova Odessa",
      202410014: "Baixada Santista",
      202410015: "Minas Gerais",
      202410016: "GPX"
    } as Record<number, string>,
    tipoVeiculo: {
      202410000: "Básico",
      202410001: "Executivo",
      202410002: "Blindado",
      202410003: "Van",
      202410004: "Van Blindado",
      202410005: "Spin",
      202410006: "Somente Motorista"
    } as Record<number, string>,
    formaPagamento: {
      202410000: "Cartão de crédito",
      202410001: "Pedido de compra",
      202410002: "Pix"
    } as Record<number, string>,
    categoriaItem: {
      100000000: "Serviço",
      100000001: "Manutenção",
      100000002: "Troca de Veículos"
    } as Record<number, string>,
    tipoTroca: {
      100000000: "Troca",
      100000001: "Devolução à base",
      100000002: "Retirada da base",
      100000003: "Repasse"
    } as Record<number, string>,
    propriedadeVeiculo: {
      100000000: "Próprio",
      100000001: "Alugado"
    } as Record<number, string>,
    statusTroca: {
      100000001: "Confirmada",
      202410000: "Programada",
      202410001: "Concluída",
      202410002: "Cancelada"
    } as Record<number, string>
  },
  views: {
    driver: "Trocar Motorista",
    clone: "Clonar Pedido",
    vehicle: "Trocar Carro"
  }
} as const;
