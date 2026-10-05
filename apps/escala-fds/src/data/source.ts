import { cleanId, createClient, createMetadata, getHostXrm, isLocalHost, type Row } from '@betinhos/dataverse'
import {
  MOTIVO_VALUE, STATUS_VALUE, addDays, motivoFromValue, statusFromValue, toKey, weekendOf,
  type Motorista, type Operacao, type Registro,
} from '../domain/escala'

export const ENTITIES = { escala: 'cr40f_escalafds', funcionario: 'cr40f_funcionarios' } as const
/** Navegação do lookup cr40f_motorista criado por schema/provision-escala-fds.ps1. */
const NAV_MOTORISTA = 'cr40f_Motorista'

export type Dados = { motoristas: Motorista[]; registros: Registro[] }
/** Janela carregada: do início do ano (ou 8 semanas antes) até `fim`. */
export type Janela = { inicio: string; fim: string }

export type Source = {
  mock: boolean
  load: (janela: Janela) => Promise<Dados>
  save: (ops: Operacao[]) => Promise<void>
}

/** Janela que cobre o rodízio do fim de semana `sabado` e 26 semanas à frente. */
export function janelaPara(sabado: string): Janela {
  const ano = `${sabado.slice(0, 4)}-01-01`
  const oitoSemanas = addDays(sabado, -7 * 8)
  return { inicio: oitoSemanas < ano ? oitoSemanas : ano, fim: addDays(sabado, 7 * 26) }
}

const text = (row: Row, field: string) => String(row[`${field}@OData.Community.Display.V1.FormattedValue`] ?? row[field] ?? '').trim()

export function mapRegistro(row: Row): Registro | null {
  const status = statusFromValue(row.cr40f_status)
  const motoristaId = typeof row._cr40f_motorista_value === 'string' ? cleanId(row._cr40f_motorista_value) : ''
  const data = typeof row.cr40f_data === 'string' ? row.cr40f_data.slice(0, 10) : ''
  if (!status || !motoristaId || !data) return null
  return { id: cleanId(String(row.cr40f_escalafdsid)), motoristaId, data, status, motivo: motivoFromValue(row.cr40f_motivo), observacao: String(row.cr40f_observacao ?? '') }
}

export function registroPayload(r: Registro, funcionarioSet: string, nome: string) {
  return {
    cr40f_name: `${nome} · ${r.data.split('-').reverse().join('/')}`.slice(0, 100),
    cr40f_data: r.data,
    cr40f_status: STATUS_VALUE[r.status],
    cr40f_motivo: r.motivo ? MOTIVO_VALUE[r.motivo] : null,
    cr40f_observacao: r.observacao || null,
    [`${NAV_MOTORISTA}@odata.bind`]: `/${funcionarioSet}(${cleanId(r.motoristaId)})`,
  }
}

function createDataverseSource(): Source {
  const hostXrm = getHostXrm()
  const clientUrl = (hostXrm?.Utility?.getGlobalContext().getClientUrl() ?? location.origin).replace(/\/+$/, '')
  const client = createClient(clientUrl)
  const metadata = createMetadata(client)
  let sets: Promise<{ escala: string; funcionario: string }> | null = null
  const entitySets = () => (sets ??= metadata.entities(Object.values(ENTITIES)).then((info) => {
    const set = (name: string) => {
      const value = info.get(name)?.entitySetName
      if (!value) throw new Error(`Tabela ${name} não encontrada. Rode o provisionamento do schema.`)
      return value
    }
    return { escala: set(ENTITIES.escala), funcionario: set(ENTITIES.funcionario) }
  }).catch((error) => { sets = null; throw error }))
  const nomes = new Map<string, string>()

  return {
    mock: false,
    async load({ inicio, fim }) {
      const s = await entitySets()
      const filter = `cr40f_data ge ${inicio} and cr40f_data le ${fim} and statecode eq 0`
      const [funcionarios, linhas] = await Promise.all([
        client.getAll(`${s.funcionario}?$select=cr40f_funcionariosid,cr40f_nomecompleto,new_apelido,cr40f_funcao&$filter=statecode eq 0&$orderby=cr40f_nomecompleto asc`),
        client.getAll(`${s.escala}?$select=cr40f_escalafdsid,_cr40f_motorista_value,cr40f_data,cr40f_status,cr40f_motivo,cr40f_observacao&$filter=${encodeURIComponent(filter)}`),
      ])
      const motoristas = funcionarios
        .filter((row) => /motorista/i.test(text(row, 'cr40f_funcao')))
        .map((row) => ({ id: cleanId(String(row.cr40f_funcionariosid)), nome: text(row, 'new_apelido') || text(row, 'cr40f_nomecompleto') }))
      for (const m of motoristas) nomes.set(m.id, m.nome)
      return { motoristas, registros: linhas.map(mapRegistro).filter((r): r is Registro => r !== null) }
    },
    async save(ops) {
      const s = await entitySets()
      // Sequencial: a falha aponta exatamente o que parou; o que já foi gravado aparece no recarregamento.
      for (const op of ops) {
        if (op.tipo === 'excluir') await client.remove(s.escala, op.id)
        else if (op.tipo === 'criar') await client.create(s.escala, registroPayload(op.registro, s.funcionario, nomes.get(op.registro.motoristaId) ?? ''))
        else await client.update(s.escala, op.registro.id, registroPayload(op.registro, s.funcionario, nomes.get(op.registro.motoristaId) ?? ''))
      }
    },
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function createMockSource(): Source {
  const motoristas: Motorista[] = ['Adriano', 'Bruno Lima', 'Carlos Souza', 'Diego', 'Edson Ramos', 'Fábio', 'Gilberto', 'Henrique Alves'].map((nome, i) => ({ id: `m${i + 1}`, nome }))
  const hoje = weekendOf(new Date())
  let seq = 0
  const registros: Registro[] = []
  const push = (motoristaId: string, data: string, status: Registro['status'], motivo: Registro['motivo'] = null, observacao = '') =>
    registros.push({ id: `r${++seq}`, motoristaId, data, status, motivo, observacao })
  for (let w = 1; w <= 12; w++) {
    const sabado = addDays(hoje, -7 * w)
    motoristas.forEach((m, i) => {
      if ((i + w) % 3 === 0) push(m.id, sabado, 'trabalha')
      if ((i + w) % 4 === 0) push(m.id, addDays(sabado, 1), 'plantao')
    })
  }
  push('m1', hoje, 'trabalha')
  push('m2', hoje, 'plantao')
  push('m3', addDays(hoje, 1), 'indisponivel', 'medico', 'Consulta às 10h')
  push('m5', addDays(hoje, 7), 'indisponivel', 'ferias', 'Férias até o fim do mês')
  push('m4', toKey(new Date()), 'indisponivel', 'pessoal', '')

  return {
    mock: true,
    async load({ inicio, fim }) {
      await wait(300)
      return structuredClone({ motoristas, registros: registros.filter((r) => r.data >= inicio && r.data <= fim) })
    },
    async save(ops) {
      await wait(500)
      for (const op of ops) {
        if (op.tipo === 'excluir') registros.splice(registros.findIndex((r) => r.id === op.id), 1)
        else if (op.tipo === 'criar') registros.push({ ...op.registro, id: `r${++seq}` })
        else Object.assign(registros.find((r) => r.id === op.registro.id) ?? {}, op.registro)
      }
    },
  }
}

export const createSource = (): Source => (isLocalHost() ? createMockSource() : createDataverseSource())
