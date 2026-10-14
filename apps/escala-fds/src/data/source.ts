import { cleanId, createClient, createMetadata, getHostXrm, isLocalHost, type Row } from '@betinhos/dataverse'
import {
  MOTIVO_VALUE, SITUACAO_VALUE, addDays, motivoFromValue, semanaDe, situacaoFromValue, toKey, toLocal,
  type Compromisso, type Dados, type Marcacao, type Motorista, type Operacao, type Situacao,
} from '../domain/escala'

export const ENTITIES = { escala: 'cr40f_escalafds', compromisso: 'cr40f_compromissofds', funcionario: 'cr40f_funcionarios' } as const
/** Navegação dos lookups cr40f_motorista criados por schema/provision-escala-fds.ps1. */
const NAV_MOTORISTA = 'cr40f_Motorista'

/** Semana carregada: segunda a domingo. */
export type Janela = { inicio: string; fim: string }

export type Source = {
  mock: boolean
  load: (janela: Janela) => Promise<Dados>
  save: (ops: Operacao[]) => Promise<void>
}

export const janelaPara = (segunda: string): Janela => ({ inicio: segunda, fim: addDays(segunda, 6) })

const text = (row: Row, field: string) => String(row[`${field}@OData.Community.Display.V1.FormattedValue`] ?? row[field] ?? '').trim()
const lookupId = (value: unknown) => (typeof value === 'string' && value ? cleanId(value) : '')
const local = (iso: unknown) => (typeof iso === 'string' && iso ? toLocal(new Date(iso)) : '')

/** Folga e Indisponível (legado) chegam com `situacao: null`: aparecem desmarcados e o registro é reaproveitado ao marcar. */
export function mapMarcacao(row: Row): Marcacao | null {
  const motoristaId = lookupId(row._cr40f_motorista_value)
  const data = typeof row.cr40f_data === 'string' ? row.cr40f_data.slice(0, 10) : ''
  if (!motoristaId || !data) return null
  return { id: cleanId(String(row.cr40f_escalafdsid)), motoristaId, data, situacao: situacaoFromValue(row.cr40f_status) }
}

export function mapCompromisso(row: Row): Compromisso | null {
  const motoristaId = lookupId(row._cr40f_motorista_value)
  const inicio = local(row.cr40f_inicio)
  const fim = local(row.cr40f_fim)
  if (!motoristaId || !inicio || !fim) return null
  return {
    id: cleanId(String(row.cr40f_compromissofdsid)), motoristaId, inicio, fim,
    diaInteiro: row.cr40f_diainteiro === true, motivo: motivoFromValue(row.cr40f_motivo) ?? 'outro',
    observacao: String(row.cr40f_observacao ?? ''), registradoEm: typeof row.createdon === 'string' ? toKey(new Date(row.createdon)) : null,
  }
}

const bind = (funcionarioSet: string, motoristaId: string) => ({ [`${NAV_MOTORISTA}@odata.bind`]: `/${funcionarioSet}(${cleanId(motoristaId)})` })
const dataBr = (key: string) => key.split('-').reverse().join('/')

export function marcacaoPayload(m: Marcacao & { situacao: Situacao }, funcionarioSet: string, nome: string) {
  return { cr40f_name: `${nome} · ${dataBr(m.data)}`.slice(0, 100), cr40f_data: m.data, cr40f_status: SITUACAO_VALUE[m.situacao], ...bind(funcionarioSet, m.motoristaId) }
}

export function compromissoPayload(c: Compromisso, funcionarioSet: string, nome: string) {
  return {
    cr40f_name: `${nome} · ${dataBr(c.inicio.slice(0, 10))}`.slice(0, 100),
    cr40f_inicio: new Date(c.inicio).toISOString(),
    cr40f_fim: new Date(c.fim).toISOString(),
    cr40f_diainteiro: c.diaInteiro,
    cr40f_motivo: MOTIVO_VALUE[c.motivo],
    cr40f_observacao: c.observacao || null,
    ...bind(funcionarioSet, c.motoristaId),
  }
}

function createDataverseSource(): Source {
  const hostXrm = getHostXrm()
  const clientUrl = (hostXrm?.Utility?.getGlobalContext().getClientUrl() ?? location.origin).replace(/\/+$/, '')
  const client = createClient(clientUrl)
  const metadata = createMetadata(client)
  let sets: Promise<Record<keyof typeof ENTITIES, string>> | null = null
  const entitySets = () => (sets ??= metadata.entities(Object.values(ENTITIES)).then((info) => {
    const set = (name: string) => {
      const value = info.get(name)?.entitySetName
      if (!value) throw new Error(`Tabela ${name} não encontrada. Rode o provisionamento do schema.`)
      return value
    }
    return { escala: set(ENTITIES.escala), compromisso: set(ENTITIES.compromisso), funcionario: set(ENTITIES.funcionario) }
  }).catch((error) => { sets = null; throw error }))
  const nomes = new Map<string, string>()

  return {
    mock: false,
    async load({ inicio, fim }) {
      const s = await entitySets()
      const escalaFilter = `cr40f_data ge ${inicio} and cr40f_data le ${fim} and statecode eq 0`
      // Ausências que cruzam a semana (inclui férias que começaram antes).
      const compromissoFilter = `cr40f_inicio le ${fim}T23:59:59Z and cr40f_fim ge ${inicio}T00:00:00Z and statecode eq 0`
      const [funcionarios, marcacoes, compromissos] = await Promise.all([
        // Motoristas (função 202410000) com status Ativo (0).
        client.getAll(`${s.funcionario}?$select=cr40f_funcionariosid,cr40f_nomecompleto,new_apelido&$filter=${encodeURIComponent('statecode eq 0 and cr40f_funcao eq 202410000 and cr40f_status eq 0')}&$orderby=new_apelido asc`),
        client.getAll(`${s.escala}?$select=cr40f_escalafdsid,_cr40f_motorista_value,cr40f_data,cr40f_status&$filter=${encodeURIComponent(escalaFilter)}`),
        client.getAll(`${s.compromisso}?$select=cr40f_compromissofdsid,_cr40f_motorista_value,cr40f_inicio,cr40f_fim,cr40f_diainteiro,cr40f_motivo,cr40f_observacao,createdon&$filter=${encodeURIComponent(compromissoFilter)}&$orderby=cr40f_inicio asc`),
      ])
      const motoristas: Motorista[] = funcionarios.map((row) => ({
        id: cleanId(String(row.cr40f_funcionariosid)),
        nome: text(row, 'new_apelido') || text(row, 'cr40f_nomecompleto'),
      }))
      for (const m of motoristas) nomes.set(m.id, m.nome)
      return {
        motoristas,
        marcacoes: marcacoes.map(mapMarcacao).filter((m): m is Marcacao => m !== null),
        compromissos: compromissos.map(mapCompromisso).filter((c): c is Compromisso => c !== null),
      }
    },
    async save(ops) {
      const s = await entitySets()
      const nome = (id: string) => nomes.get(id) ?? ''
      // Sequencial: a falha aponta o que parou; o que já foi gravado aparece no recarregamento.
      for (const op of ops) {
        if (op.tipo === 'criarMarcacao') await client.create(s.escala, marcacaoPayload(op.marcacao, s.funcionario, nome(op.marcacao.motoristaId)))
        else if (op.tipo === 'atualizarMarcacao') await client.update(s.escala, op.marcacao.id, marcacaoPayload(op.marcacao, s.funcionario, nome(op.marcacao.motoristaId)))
        else if (op.tipo === 'excluirMarcacao') await client.remove(s.escala, op.id)
        else if (op.tipo === 'criarCompromisso') await client.create(s.compromisso, compromissoPayload(op.compromisso, s.funcionario, nome(op.compromisso.motoristaId)))
        else await client.remove(s.compromisso, op.id)
      }
    },
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function createMockSource(): Source {
  const nomes = ['Danilo', 'Adriano', 'Bruno Lima', 'Carlos Souza', 'Diego', 'Edson Ramos', 'Fábio', 'Gilberto']
  const motoristas: Motorista[] = nomes.map((nome, i) => ({ id: `m${i + 1}`, nome }))
  const hoje = toKey(new Date())
  const segunda = semanaDe(new Date())
  const sab = addDays(segunda, 5)
  const dom = addDays(segunda, 6)
  let seq = 0
  const marcacoes: Marcacao[] = [
    { id: `e${++seq}`, motoristaId: 'm1', data: sab, situacao: 'plantao' },
    { id: `e${++seq}`, motoristaId: 'm1', data: dom, situacao: 'plantao' },
    { id: `e${++seq}`, motoristaId: 'm2', data: sab, situacao: 'trabalha' },
    { id: `e${++seq}`, motoristaId: 'm3', data: dom, situacao: null }, // Folga legada: aparece desmarcada
  ]
  const compromissos: Compromisso[] = []
  const c = (motoristaId: string, inicio: string, fim: string, diaInteiro: boolean, motivo: Compromisso['motivo'], observacao: string) =>
    compromissos.push({ id: `c${++seq}`, motoristaId, inicio, fim, diaInteiro, motivo, observacao, registradoEm: hoje })
  c('m1', `${sab}T00:00`, `${sab}T12:00`, false, 'pessoal', 'Livre de manhã')
  c('m4', `${dom}T00:00`, `${dom}T23:59`, true, 'medico', 'Exame')
  c('m5', `${addDays(hoje, 2)}T10:00`, `${addDays(hoje, 2)}T12:00`, false, 'medico', 'Consulta')
  c('m3', `${addDays(segunda, 1)}T00:00`, `${addDays(segunda, 1)}T23:59`, true, 'pessoal', 'Mudança')
  c('m6', `${addDays(segunda, 4)}T00:00`, `${addDays(segunda, 12)}T23:59`, true, 'ferias', 'Férias')

  return {
    mock: true,
    async load({ inicio, fim }) {
      await wait(300)
      return structuredClone({
        motoristas,
        marcacoes: marcacoes.filter((m) => m.data >= inicio && m.data <= fim),
        compromissos: compromissos.filter((x) => x.inicio.slice(0, 10) <= fim && x.fim.slice(0, 10) >= inicio),
      })
    },
    async save(ops) {
      await wait(500)
      for (const op of ops) {
        if (op.tipo === 'criarMarcacao') marcacoes.push({ ...op.marcacao, id: `e${++seq}` })
        else if (op.tipo === 'atualizarMarcacao') Object.assign(marcacoes.find((m) => m.id === op.marcacao.id) ?? {}, op.marcacao)
        else if (op.tipo === 'excluirMarcacao') marcacoes.splice(marcacoes.findIndex((m) => m.id === op.id), 1)
        else if (op.tipo === 'criarCompromisso') compromissos.push({ ...op.compromisso, id: `c${++seq}`, registradoEm: toKey(new Date()) })
        else compromissos.splice(compromissos.findIndex((x) => x.id === op.id), 1)
      }
    },
  }
}

export const createSource = (): Source => (isLocalHost() ? createMockSource() : createDataverseSource())
