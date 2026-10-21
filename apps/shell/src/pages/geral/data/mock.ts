import type { ChoiceOption, Row } from '@betinhos/dataverse'
import { formatDateTime, formatMoney, TZ } from '../domain/format'
import { searchConditions } from '../domain/search'
import { ENTITY, ID_ATTRIBUTE, type AttributeInfo, type AttributeMap, type LookupBind, type LookupOption, type Page, type Sort, type View } from '../domain/types'

const F = '@OData.Community.Display.V1.FormattedValue'
const DAY = 24 * 3_600_000

const STATUS: ChoiceOption[] = [
  { value: 202410001, label: 'Confirmado' }, { value: 202410002, label: 'Cancelado' }, { value: 100000001, label: 'Requer Análise' },
  { value: 202410005, label: 'Programado' }, { value: 202410006, label: 'Em Execução' }, { value: 202410008, label: 'Concluído' },
]
const FATURAMENTO: ChoiceOption[] = [{ value: 202410005, label: 'Pendente' }, { value: 202410010, label: 'Pago' }, { value: 202410011, label: 'Não Faturável' }]
const TIPO: ChoiceOption[] = [{ value: 202410001, label: 'Executivo' }, { value: 202410000, label: 'Básico' }, { value: 202410002, label: 'Blindado' }]
const SIM_NAO: ChoiceOption[] = [{ value: 1, label: 'Sim' }, { value: 0, label: 'Não' }]

const lookupId = (group: number, n: number) => `bbbbbbbb-000${group}-4000-8000-${String(n).padStart(12, '0')}`
const options = (group: number, names: string[]): LookupOption[] => names.map((nome, i) => ({ id: lookupId(group, i + 1), nome }))

export const MOCK_LOOKUPS: Record<string, LookupOption[]> = {
  cr40f_motorista: options(1, ['Carlos Lima', 'Ana Souza', 'Bruno Dias', 'Teste']),
  cr40f_veiculo: options(2, ['ABC1D23 · Corolla', 'DEF4G56 · Camry', 'GHI7J89 · Q5 Blindado', 'JKL0M12 · Spin']),
  cr40f_cliente: options(3, ['Tenaris', 'Grupo Atlântico', 'Particular']),
  cr40f_solicitante: options(4, ['Marina Alves', 'Paulo Reis', 'Renata Faria', 'Diego Torres']),
}

/** Relação de cada lookup mock (navigation property e entity set), no formato de `Source.lookupBind`. */
export const MOCK_BINDS: Record<string, LookupBind> = {
  cr40f_motorista: { nav: 'cr40f_Motorista', set: 'cr40f_funcionarioses' },
  cr40f_veiculo: { nav: 'cr40f_Veiculo', set: 'cr40f_veiculoses' },
  cr40f_cliente: { nav: 'cr40f_Cliente', set: 'cr40f_clientes1s' },
  cr40f_solicitante: { nav: 'cr40f_Solicitante', set: 'cr40f_solicitanteses' },
}

const info = (logicalName: string, type: string, label: string, extra: Partial<AttributeInfo> = {}): [string, AttributeInfo] =>
  [logicalName, { logicalName, type, label, updatable: true, targets: [], options: [], ...extra }]

export const MOCK_ATTRIBUTES: AttributeMap = new Map([
  info('cr40f_id', 'String', 'ID', { updatable: false }),
  info('cr40f_status', 'Picklist', 'Status de Operação', { options: STATUS }),
  info('cr40f_statusdefaturamento', 'Picklist', 'Status de faturamento', { options: FATURAMENTO }),
  info('cr40f_dataehorriodesada', 'DateTime', 'Data e horário de saída'),
  info('cr40f_motorista', 'Lookup', 'Motorista', { targets: ['cr40f_funcionarios'] }),
  info('cr40f_veiculo', 'Lookup', 'Veículo', { targets: ['cr40f_veiculos'] }),
  info('cr40f_tipodeveiculo', 'Picklist', 'Tipo de veículo', { options: TIPO }),
  info('cr40f_cliente', 'Lookup', 'Cliente', { targets: ['cr40f_clientes1'] }),
  info('cr40f_solicitante', 'Lookup', 'Solicitante', { targets: ['cr40f_solicitantes'] }),
  info('cr40f_trajeto', 'String', 'Trajeto'),
  info('cr40f_cotao', 'Money', 'Cotação'),
  info('cr40f_receber', 'Boolean', 'Receber', { options: SIM_NAO }),
  info('cr40f_observaointerna', 'Memo', 'Observação interna'),
  info('createdon', 'DateTime', 'Criado em', { updatable: false }),
])

const AGENDA_COLS = [
  'cr40f_id', 'cr40f_status', 'cr40f_statusdefaturamento', 'cr40f_dataehorriodesada', 'cr40f_motorista', 'cr40f_veiculo',
  'cr40f_tipodeveiculo', 'cr40f_cliente', 'cr40f_trajeto', 'cr40f_cotao', 'cr40f_receber', 'cr40f_observaointerna',
]
const HOJE_COLS = ['cr40f_id', 'cr40f_dataehorriodesada', 'cr40f_status', 'cr40f_motorista', 'cr40f_veiculo', 'cr40f_cliente', 'cr40f_trajeto', 'cr40f_cotao']
const SEM_MOTORISTA_COLS = ['cr40f_id', 'cr40f_dataehorriodesada', 'cr40f_status', 'cr40f_cliente', 'cr40f_solicitante', 'cr40f_trajeto', 'cr40f_tipodeveiculo', 'cr40f_cotao']

const ACTIVE = '<condition attribute="statecode" operator="eq" value="0" />'
const fetch = (cols: string[], conditions: string, order = '<order attribute="cr40f_dataehorriodesada" descending="false" />') =>
  `<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false"><entity name="${ENTITY}">${cols.map((c) => `<attribute name="${c}" />`).join('')}${order}<filter type="and">${ACTIVE}${conditions}</filter></entity></fetch>`
const layout = (cols: string[]) =>
  `<grid name="resultset" jump="cr40f_id" select="1" icon="1" preview="1"><row name="result" id="${ID_ATTRIBUTE}">${cols.map((c) => `<cell name="${c}" width="${c === 'cr40f_trajeto' ? 240 : c === 'cr40f_observaointerna' ? 220 : 140}" />`).join('')}</row></grid>`

export function createMockViews(): View[] {
  return [
    { id: 'mock-agenda', nome: '🗓️Agenda', grupo: 'sistema', padrao: true, fetchxml: fetch(AGENDA_COLS, ''), layoutxml: layout(AGENDA_COLS) },
    { id: 'mock-hoje', nome: 'Hoje', grupo: 'sistema', padrao: false, fetchxml: fetch(HOJE_COLS, '<condition attribute="cr40f_dataehorriodesada" operator="today" />'), layoutxml: layout(HOJE_COLS) },
    { id: 'mock-sem-motorista', nome: 'Sem motorista', grupo: 'sistema', padrao: false, fetchxml: fetch(SEM_MOTORISTA_COLS, '<condition attribute="cr40f_motorista" operator="null" />'), layoutxml: layout(SEM_MOTORISTA_COLS) },
  ]
}

const TRAJETOS = ['GRU → Hotel Unique', 'Hotel Fasano → CGH', 'Escritório Faria Lima → GRU', 'VCP → Alphaville', 'Residência → Evento Jockey', 'GRU → Hotel Tivoli', 'Santos → Aeroporto de Viracopos']
const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** `YYYY-MM-DD` no calendário de São Paulo. */
const spDay = (d: Date) => DIA.format(d)

/** Quantidade de reservas do mock (OS-1000…OS-1219): dá para testar as páginas de 50, 100 e 200 linhas. */
export const MOCK_ROW_COUNT = 220

/** As 60 primeiras reservas (OS-1000…OS-1059) vão de hoje-2 a hoje+20 dias e as demais seguem na mesma densidade, depois delas; a OS-1013 cai um dia depois de `now` para ficar entre as primeiras da Agenda. */
export function createMockRows(now: Date): Row[] {
  const [year, month, day] = spDay(now).split('-').map(Number)
  const rows: Row[] = []
  for (let i = 0; i < MOCK_ROW_COUNT; i += 1) {
    const offset = i === 13 ? 1 : -2 + Math.floor((i * 22) / 59)
    // 06:00–20:45 em São Paulo: o dia UTC da ISO coincide com o dia local.
    const date = new Date(Date.UTC(year, month - 1, day + offset, 6 + ((i * 7) % 15) + 3, (i * 15) % 60)).toISOString()
    const row: Row = {
      [ID_ATTRIBUTE]: `aaaaaaaa-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      cr40f_id: `OS-${1000 + i}`,
      statecode: 0,
      statuscode: 1,
      cr40f_dataehorriodesada: date,
      [`cr40f_dataehorriodesada${F}`]: formatDateTime(date),
      createdon: new Date(Date.parse(date) - 5 * DAY).toISOString(),
      cr40f_trajeto: TRAJETOS[i % TRAJETOS.length],
      cr40f_cotao: 300 + i * 47.5,
      [`cr40f_cotao${F}`]: formatMoney(300 + i * 47.5),
      cr40f_receber: i % 3 !== 0,
      [`cr40f_receber${F}`]: i % 3 !== 0 ? 'Sim' : 'Não',
      cr40f_observaointerna: i % 4 === 0 ? 'Confirmar placa do veículo com o motorista.' : null,
      cr40f_passageirosetelefonedecontato: `Passageiro ${i + 1} (11) 9${String(10000000 + i * 137).slice(0, 8)}`,
      cr40f_endereodesada: 'Av. Brigadeiro Faria Lima, 1000',
      cr40f_destino: 'Aeroporto de Guarulhos',
      cr40f_obsdeoperao: null,
      cr40f_perfildopassageiro: null,
    }
    row[`createdon${F}`] = formatDateTime(String(row.createdon))
    const choice = (key: string, list: ChoiceOption[], pick: number) => {
      const option = list[pick % list.length]
      row[key] = option.value
      row[`${key}${F}`] = option.label
    }
    choice('cr40f_status', STATUS, i * 5)
    choice('cr40f_statusdefaturamento', FATURAMENTO, i * 2)
    choice('cr40f_tipodeveiculo', TIPO, i)
    const lookup = (attribute: string, pick: number | null) => {
      const option = pick == null ? null : MOCK_LOOKUPS[attribute][pick % MOCK_LOOKUPS[attribute].length]
      row[`_${attribute}_value`] = option?.id ?? null
      if (option) row[`_${attribute}_value${F}`] = option.nome
    }
    lookup('cr40f_motorista', i % 5 === 2 ? null : i)
    lookup('cr40f_veiculo', i + 1)
    lookup('cr40f_cliente', i * 2)
    lookup('cr40f_solicitante', i * 3)
    // OS-1004 já tem OP gerada: cobre o caso "com OP" do comando Gerar OP.
    if (i === 4) row._cr40f_financeiro_value = 'cccccccc-0001-4000-8000-000000000004'
    rows.push(row)
  }
  return rows
}

export type MockFetchOptions = { page: number; pageSize: number; sort: Sort; query: string; quickFind: string[]; now: Date }

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Chave do valor na linha: lookup vem como `_x_value`. */
const keyOf = (attribute: string) => (MOCK_ATTRIBUTES.get(attribute)?.type === 'Lookup' ? `_${attribute}_value` : attribute)
const shown = (row: Row, key: string) => String(row[`${key}${F}`] ?? row[key] ?? '')

/** Padrão `like` do Dataverse em RegExp: `%` e `_` são curingas e `[x]` escapa o caractere. */
const literal = (char: string) => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function likeRegex(pattern: string) {
  let source = ''
  const text = fold(pattern)
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '[' && text[i + 2] === ']') { source += literal(text[i + 1]); i += 2 }
    else if (char === '%') source += '.*'
    else if (char === '_') source += '.'
    else source += literal(char)
  }
  return new RegExp(`^${source}$`, 's')
}

function likeMatches(row: Row, attribute: string, pattern: string) {
  const key = keyOf(attribute)
  const regex = likeRegex(pattern)
  return [shown(row, key), String(row[key] ?? '')].some((text) => regex.test(fold(text)))
}

const isEmpty = (raw: unknown) => raw == null || raw === ''
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
/** Segunda-feira da semana (segunda a domingo) do dia `YYYY-MM-DD`. */
const weekStart = (day: string) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7))
const dayOf = (raw: unknown) => (typeof raw === 'string' && !Number.isNaN(Date.parse(raw)) ? spDay(new Date(raw)) : null)
const numberOf = (raw: unknown) => (typeof raw === 'number' ? raw : typeof raw === 'string' && raw !== '' ? Number(raw) : NaN)

/** `true`/`false` quando o mock sabe avaliar a condição; `null` quando o operador é desconhecido (ignorado). */
function condition(el: Element, row: Row, now: Date): boolean | null {
  const attribute = el.getAttribute('attribute') ?? ''
  const value = el.getAttribute('value') ?? ''
  const raw = row[keyOf(attribute)]
  const day = dayOf(raw)
  const today = spDay(now)
  const equals = () => {
    if (typeof raw === 'boolean') return (raw ? '1' : '0') === value || String(raw) === value
    if (typeof raw === 'number' && value !== '') return raw === Number(value)
    return String(raw) === value
  }
  const listed = () => Array.from(el.children).some((c) => c.tagName === 'value' && String(c.textContent).toLowerCase() === String(raw).toLowerCase())
  // Valor `AAAA-MM-DD` compara pelo dia (como o Dataverse faz com data); senão, como número.
  const isDayValue = /^\d{4}-\d{2}-\d{2}$/.test(value)
  switch (el.getAttribute('operator')) {
    case 'eq': return equals()
    // Como no SQL, `ne` e `not-in` não devolvem vazios.
    case 'ne': return !isEmpty(raw) && !equals()
    case 'ge': return numberOf(raw) >= Number(value)
    case 'le': return numberOf(raw) <= Number(value)
    case 'gt': return isDayValue ? day != null && day > value : numberOf(raw) > Number(value)
    case 'lt': return isDayValue ? day != null && day < value : numberOf(raw) < Number(value)
    case 'in': return !isEmpty(raw) && listed()
    case 'not-in': return !isEmpty(raw) && !listed()
    case 'on': return day === value
    case 'null': return isEmpty(raw)
    case 'not-null': return !isEmpty(raw)
    case 'like': return likeMatches(row, attribute, value)
    // Como no SQL, `not-like` não devolve vazios.
    case 'not-like': return !isEmpty(raw) && !likeMatches(row, attribute, value)
    case 'today': return day === today
    case 'tomorrow': return day === addDays(today, 1)
    case 'yesterday': return day === addDays(today, -1)
    case 'this-week': return day != null && day >= weekStart(today) && day <= addDays(weekStart(today), 6)
    case 'this-month': return day != null && day.slice(0, 7) === today.slice(0, 7)
    case 'last-month': return day != null && day.slice(0, 7) === addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7)
    case 'on-or-after': return day != null && day >= value
    case 'on-or-before': return day != null && day <= value
    case 'last-x-days': return day != null && day >= addDays(today, -Number(value)) && day <= today
    case 'next-x-days': return day != null && day >= today && day <= addDays(today, Number(value))
    // Sem limite superior: o mock não precisa do horizonte da visão real.
    case 'next-x-years': return typeof raw === 'string' && Date.parse(raw) >= now.getTime()
    default: return null
  }
}

function filter(el: Element, row: Row, now: Date): boolean | null {
  const results = Array.from(el.children).flatMap((child) => {
    const result = child.tagName === 'condition' ? condition(child, row, now) : child.tagName === 'filter' ? filter(child, row, now) : null
    return result == null ? [] : [result]
  })
  if (!results.length) return null
  return el.getAttribute('type') === 'or' ? results.some(Boolean) : results.every(Boolean)
}

const sortValue = (row: Row, attribute: string): string | number => {
  const key = keyOf(attribute)
  if (MOCK_ATTRIBUTES.get(attribute)?.type === 'Lookup') return fold(shown(row, key))
  const value = row[key]
  return typeof value === 'number' || typeof value === 'string' ? value : ''
}

/** Simula só o que o mock precisa do FetchXML: condições da raiz, busca, `<order>` da raiz e paginação. */
export function applyMockFetch(rows: Row[], fetchxml: string, { page, pageSize, sort, query, quickFind, now }: MockFetchOptions): Page {
  const doc = new DOMParser().parseFromString(fetchxml, 'text/xml')
  const entity = Array.from(doc.documentElement.children).find((c) => c.tagName === 'entity')
  if (!entity || doc.getElementsByTagName('parsererror').length) throw new Error('FetchXML da visão inválido.')
  const roots = Array.from(entity.children).filter((c) => c.tagName === 'filter')
  // Mesmas condições que o FetchXML real leva.
  const search = searchConditions(query, quickFind)

  const filtered = rows.filter((row) =>
    roots.every((root) => filter(root, row, now) !== false)
    && (!search.length || search.some(({ attribute, value }) => likeMatches(row, attribute, value))))

  const order = Array.from(entity.children).find((c) => c.tagName === 'order')
  const orderAttribute = order?.getAttribute('attribute')
  const by = sort ?? (orderAttribute ? { attribute: orderAttribute, descending: order?.getAttribute('descending') === 'true' } : null)
  const sorted = by
    ? [...filtered].sort((a, b) => {
      const x = sortValue(a, by.attribute)
      const y = sortValue(b, by.attribute)
      const result = x < y ? -1 : x > y ? 1 : String(a.cr40f_id).localeCompare(String(b.cr40f_id))
      return by.descending ? -result : result
    })
    : filtered

  const start = (page - 1) * pageSize
  return { rows: sorted.slice(start, start + pageSize), cookie: null, more: start + pageSize < sorted.length, total: sorted.length }
}
