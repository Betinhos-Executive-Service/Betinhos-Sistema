// Nomes lógicos no Dataverse. `cr40f_validacaoservico` e `cr40f_clientes1.cr40f_portalhabilitado` seguem
// packages/deploy/provision-portal-cliente.ps1. As outras tabelas novas (validador, mensagem, código, dispositivo)
// e as colunas da composição estão marcadas CONFIRMAR: ajuste aqui quando o schema estiver no DEV.

export const SET = {
  validacao: 'cr40f_validacaoservicos',
  validador: 'cr40f_validadorclientes', // CONFIRMAR
  mensagem: 'cr40f_mensagemvalidacaos', // CONFIRMAR
  codigo: 'cr40f_codigoacessos', // CONFIRMAR
  dispositivo: 'cr40f_dispositivoconfiavels', // CONFIRMAR
  cliente: 'cr40f_clientes1s',
} as const

/** Choice cr40f_status da validação (ordem do provision). */
export const STATUS_DV = {
  liberado: 100000000,
  em_duvida: 100000001,
  respondido: 100000002,
  aprovado: 100000003,
  aprovado_tacito: 100000004,
  retirado: 100000005,
} as const

export const LADO_DV = { cliente: 100000000, betinhos: 100000001 } as const // CONFIRMAR

export const MOTIVO_DV = { espera: 100000000, km_rota: 100000001, valor: 100000002, passageiro: 100000003, outro: 100000004 } as const // CONFIRMAR

/** Navigation property do lookup cr40f_Reserva (schema name) e do lookup legado da composição na reserva. */
export const NAV = { reserva: 'cr40f_Reserva', composicao: 'new_composicaodepreco', validacao: 'cr40f_Validacao', validador: 'cr40f_Validador', cliente: 'cr40f_Cliente' }

export const RESERVA_CAMPOS = [
  'cr40f_id', 'cr40f_idtenaris', 'cr40f_cr', 'cr40f_dataehorriodesada', 'cr40f_endereodesada', 'cr40f_destino',
  'new_linkdovoucher', 'new_categoriadoveiculo',
  '_cr40f_solicitante_value', '_cr40f_passageiro1_value', '_cr40f_passageiro2_value', '_cr40f_passageiro3_value', '_cr40f_passageiro4_value',
]

/** Linhas do preço na ordem do Excel da Juliana. CONFIRMAR os nomes na metadata de cr40f_composicaodeprecos. */
export const COMPOSICAO_LINHAS: Array<[campo: string, rotulo: string]> = [
  ['new_horamotorista', 'Hora motorista'],
  ['new_diaria', 'Diária'],
  ['new_espera', 'Espera'],
  ['new_pedagios', 'Pedágios'],
  ['new_estacionamento', 'Estacionamento'],
  ['new_ajuste', 'Ajuste'],
]

export const VALIDACAO_CAMPOS = [
  'cr40f_validacaoservicoid', 'cr40f_status', 'cr40f_liberadoem', 'cr40f_observacao', 'cr40f_valorliberado', 'cr40f_valoranterior',
  'cr40f_prazotacita', 'cr40f_aprovadoem', 'cr40f_aprovadopor', '_cr40f_cliente_value',
]
