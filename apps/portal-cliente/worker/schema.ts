import type { StatusPedido } from '../src/domain/types'

// Nomes lógicos no Dataverse. `cr40f_validacaoservico` e `cr40f_clientes1.cr40f_portalhabilitado` seguem
// packages/deploy/provision-portal-cliente.ps1, assim como validador, mensagem, código e dispositivo (conferidos na
// metadata do DEV em 28/10/2026).

export const SET = {
  validacao: 'cr40f_validacaoservicos',
  validador: 'cr40f_validadorclientes',
  mensagem: 'cr40f_mensagemvalidacaos',
  codigo: 'cr40f_codigoacessos',
  dispositivo: 'cr40f_dispositivoconfiavels',
  cliente: 'cr40f_clientes1s',
  reserva: 'cr40f_reservadeveculoses',
} as const

/** Choice múltipla cr40f_clientes1.cr40f_portalmodulos (provision-portal-cliente.ps1). */
export const MODULO_DV = { validar: 100000000, pedir: 100000001, meus_servicos: 100000002 } as const

/** cr40f_status da reserva (metadata DEV 08/10/2026) → situação vista pelo solicitante. */
export const RESERVA_SOLICITADO = 202410004
export const PEDIDO_STATUS: Record<number, StatusPedido> = {
  [RESERVA_SOLICITADO]: 'solicitado',
  202410000: 'em_analise', // Pré-reserva
  100000001: 'em_analise', // Requer Análise
  202410001: 'confirmado',
  202410005: 'programado',
  202410006: 'em_execucao',
  202410008: 'concluido',
  202410002: 'cancelado',
  202410010: 'cancelado', // Cancelado com Ressalvas
}

export const CLIENTE_CAMPOS = ['cr40f_clientes1id', 'cr40f_nomedocliente', 'cr40f_portalhabilitado', 'cr40f_portalmodulos', 'cr40f_portaldominios']

/**
 * Colunas da reserva lidas pelos módulos Pedir e Meus serviços. O que o cliente digitou fica em `cr40f_portalpedido` (JSON),
 * coluna só do portal: passageiros e observação internas são da operação (plugins e shell as reescrevem).
 */
export const PEDIDO_CAMPOS = [
  'cr40f_reservadeveculosid', 'cr40f_id', 'cr40f_status', 'cr40f_dataehorriodesada', 'cr40f_endereodesada', 'cr40f_destino',
  'cr40f_portalpedido', 'new_linkdovoucher', 'new_categoriadoveiculo', 'createdon',
]

/** Choice cr40f_status da validação (ordem do provision). */
export const STATUS_DV = {
  liberado: 100000000,
  em_duvida: 100000001,
  respondido: 100000002,
  aprovado: 100000003,
  aprovado_tacito: 100000004,
  retirado: 100000005,
} as const

export const LADO_DV = { cliente: 100000000, betinhos: 100000001 } as const

export const MOTIVO_DV = { espera: 100000000, km_rota: 100000001, valor: 100000002, passageiro: 100000003, outro: 100000004 } as const

/** Navigation property do lookup cr40f_Reserva (schema name) e do lookup legado da composição na reserva. */
export const NAV = { reserva: 'cr40f_Reserva', composicao: 'new_composicaodepreco', validacao: 'cr40f_Validacao', validador: 'cr40f_Validador', cliente: 'cr40f_Cliente', portalUsuario: 'cr40f_PortalUsuario' }

export const RESERVA_CAMPOS = [
  'cr40f_id', 'cr40f_idtenaris', 'cr40f_cr', 'cr40f_dataehorriodesada', 'cr40f_endereodesada', 'cr40f_destino',
  'new_linkdovoucher', 'new_categoriadoveiculo',
  '_cr40f_solicitante_value', '_cr40f_passageiro1_value', '_cr40f_passageiro2_value', '_cr40f_passageiro3_value', '_cr40f_passageiro4_value',
]

/** Linhas do preço (metadata do DEV, 28/10/2026); o repasse a terceiro é custo e não aparece para o cliente. */
export const COMPOSICAO_LINHAS: Array<[campo: string, rotulo: string]> = [
  ['cr40f_valorhoramotorista', 'Hora motorista'], ['cr40f_valordadiaria', 'Diária'], ['cr40f_valortempodeespera', 'Espera'],
  ['new_valorpedagios', 'Pedágios'], ['cr40f_valorrodoanel', 'Rodoanel'], ['cr40f_valorayrtonsenna', 'Ayrton Senna'], ['cr40f_valorarcometropolitano', 'Arco Metropolitano'],
  ['new_valorestacionamento', 'Estacionamento'], ['cr40f_valorcombustivel', 'Combustível'], ['cr40f_valorpassageirosadicionais', 'Passageiros adicionais'],
  ['cr40f_valoradequacaoderota', 'Adequação de rota'], ['cr40f_valordesviosentrecidades', 'Desvios entre cidades'], ['new_valorlocacao', 'Locação'],
  ['new_valorpassagens', 'Passagens'], ['new_ajuste', 'Ajuste'],
]

export const VALIDACAO_CAMPOS = [
  'cr40f_validacaoservicoid', 'cr40f_status', 'cr40f_liberadoem', 'cr40f_observacao', 'cr40f_valorliberado', 'cr40f_valoranterior',
  'cr40f_prazotacita', 'cr40f_aprovadoem', 'cr40f_aprovadopor', '_cr40f_cliente_value',
]
