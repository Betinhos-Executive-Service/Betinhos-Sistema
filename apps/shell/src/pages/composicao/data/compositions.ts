export const moneyFields = [
  { key: 'cr40f_valorhoramotorista', label: 'Hora motorista' },
  { key: 'cr40f_valortempodeespera', label: 'Tempo de espera' },
  { key: 'cr40f_valordadiaria', label: 'Diária' },
  { key: 'new_valorlocacao', label: 'Locação' },
  { key: 'cr40f_valoradequacaoderota', label: 'Adequação de rota' },
  { key: 'cr40f_valoradequacaoderotaporkmrodado', label: 'Adequação por km' },
  { key: 'cr40f_valordesviosentrecidades', label: 'Desvios entre cidades' },
  { key: 'cr40f_valorpassageirosadicionais', label: 'Passageiros adicionais' },
  { key: 'cr40f_valorcombustivel', label: 'Combustível' },
  { key: 'cr40f_valorrepasseterceiro', label: 'Repasse a terceiros' },
  { key: 'new_valorpassagens', label: 'Passagens' },
  { key: 'new_valorestacionamento', label: 'Estacionamento' },
  { key: 'new_valorpedagios', label: 'Pedágios' },
  { key: 'cr40f_valorarcometropolitano', label: 'Arco Metropolitano' },
  { key: 'cr40f_valorayrtonsenna', label: 'Ayrton Senna' },
  { key: 'cr40f_valorrodoanel', label: 'Rodoanel' },
  { key: 'new_ajuste', label: 'Ajuste' },
  { key: 'new_subtotal', label: 'Subtotal', writable: false },
  { key: 'new_valortotal', label: 'Total', writable: false },
] as const

export type MoneyField = (typeof moneyFields)[number]['key']
export type DecimalString = string

export type CellFormula = {
  expression: string
  engineVersion: 1
  rowVersion?: string
}

export type CellInput =
  | { kind: 'literal'; value: DecimalString }
  | { kind: 'formula'; expression: string }

export type ApplyCellInputResult = {
  rowId: string
  rowVersion: string
  updatedValues: Partial<Record<MoneyField, DecimalString>>
  formulas: Partial<Record<MoneyField, CellFormula | null>>
}

export function isWritableMoneyField(field: MoneyField) {
  const definition = moneyFields.find(({ key }) => key === field)
  return !definition || !('writable' in definition) || definition.writable !== false
}

export type Composition = {
  id: string
  viewFields?: Record<string, unknown>
  clientId: string | null
  serviceId: string | null
  client: string
  clientRegistration: string
  clientAddress: string
  route: string
  departureAt: string
  status: 'Pendente' | 'Concluído'
  serviceStatus: string
  serviceType: string
  vehicleType: string
  passengers: string[]
  values: Record<MoneyField, DecimalString>
  formulas: Partial<Record<MoneyField, CellFormula>>
  rowVersion: string
}

const sampleRecords = [
  ['Aurora Logística', 'Alphaville → Guarulhos', '2026-09-22T08:00:00-03:00'],
  ['Horizonte Sistemas', 'Campinas → Congonhas', '2026-09-21T14:30:00-03:00'],
  ['NorteSul Consultoria', 'Faria Lima → Viracopos', '2026-09-20T06:45:00-03:00'],
  ['Estação Executiva', 'Santos → Avenida Paulista', '2026-09-19T10:15:00-03:00'],
  ['Ponte Alta Eventos', 'Guarulhos → Expo Center Norte', '2026-09-18T17:00:00-03:00'],
  ['Rota Clara Tecnologia', 'Jundiaí → Congonhas', '2026-09-17T09:20:00-03:00'],
  ['Vale Sereno Partners', 'Moema → Barueri', '2026-09-16T07:10:00-03:00'],
  ['Cais Central', 'Congonhas → Pinheiros', '2026-09-15T12:40:00-03:00'],
  ['Pátio Verde Serviços', 'Brooklin → Guarulhos', '2026-09-14T08:25:00-03:00'],
  ['Rumo Certo Projetos', 'Osasco → Congonhas', '2026-09-13T16:50:00-03:00'],
  ['Ponto Leste Executiva', 'Tatuapé → Barueri', '2026-09-12T07:35:00-03:00'],
  ['Sete Colinas Engenharia', 'Santo André → Viracopos', '2026-09-11T11:05:00-03:00'],
  ['Orbe Consultoria', 'Pinheiros → Campinas', '2026-09-10T13:15:00-03:00'],
  ['Praça Nova Soluções', 'Itaim → Guarulhos', '2026-09-09T08:40:00-03:00'],
  ['Via Nobre Serviços', 'Mogi das Cruzes → Congonhas', '2026-09-08T15:10:00-03:00'],
  ['Pórtico Azul', 'Vila Olímpia → Jundiaí', '2026-09-07T07:50:00-03:00'],
  ['Campo Aberto Gestão', 'Santo Amaro → Campinas', '2026-09-06T11:35:00-03:00'],
  ['Lume Centro Empresarial', 'Guarulhos → Brooklin', '2026-09-05T18:05:00-03:00'],
] as const

/** Clientes das três últimas linhas no mock de Clientes: o link de cliente abre a ficha dele por cima da grade. */
const MOCK_CLIENTE_IDS = ['55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777']

export const initialCompositions: Composition[] = sampleRecords.map(
  ([client, route, departureAt], index) => {
    const values = {} as Record<MoneyField, DecimalString>
    moneyFields.forEach(({ key }, fieldIndex) => {
      const value = key === 'new_ajuste' ? (index % 2 ? -25 : 0) : 35 + (index + 1) * 17 + fieldIndex * 11.5
      values[key] = value.toFixed(2)
    })
    values.new_subtotal = (920 + (index + 1) * 73.5).toFixed(2)
    values.new_valortotal = (1180 + (index + 1) * 91).toFixed(2)
    return { id: `mock-${index + 1}`, clientId: MOCK_CLIENTE_IDS[index - (sampleRecords.length - MOCK_CLIENTE_IDS.length)] ?? null, serviceId: null, client, clientRegistration: '', clientAddress: '', route, departureAt, status: index % 2 ? 'Concluído' as const : 'Pendente' as const, viewFields: { new_status: index % 2 ? 2 : 1, 'new_status@OData.Community.Display.V1.FormattedValue': index % 2 ? 'Concluído' : 'Pendente' }, serviceStatus: '', serviceType: '', vehicleType: '', passengers: [], values, formulas: {}, rowVersion: `mock-${index + 1}-0` }
  },
)
