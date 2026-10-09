/** Códigos de option set e datas de corte usados pelo legado (Dashboard.html L10206, L10403, L13661–13687). */
export const CAT_ITEM_SERVICO = 100000000
export const CP_PENDENTE = 100000000
export const CP_CONCLUIDA = 100000001
export const FAT_PAGO = 202410010
export const FAT_PAGANTE_EM_VIAGEM = 202410006
export const FAT_MENSAL = 202410008
export const MULTA_NOTIFICAR = 202410000
/** Confirmado, Programado e Concluído: o alerta "Sem motorista" só olha estes. */
export const STATUS_SEM_MOTORISTA: ReadonlySet<number> = new Set([202410001, 202410005, 202410008])
export const VEICULO_PROPRIO = '100000000'
export const VEICULO_TERCEIRO = '100000001'
/** Datas de corte dos alertas de qualidade, fixadas pela operação no legado. */
export const CORTE_SEM_CLIENTE = '2026-04-01'
export const CORTE_SEM_MOTORISTA = Date.parse('2026-04-10T00:00:00-03:00')
export const CORTE_SEM_VEICULO = Date.parse('2026-06-01T00:00:00-03:00')
/** Trimestre em que o CSV legado substitui o Dataverse. */
export const CSV_2026_INICIO = '2026-01-01'
export const CSV_2026_FIM = '2026-03-31'
export const SEM_MOTORISTA = 'Sem motorista'
export const SEM_CLIENTE = 'Sem cliente'
export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const
export const MESES_TITULO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'] as const
