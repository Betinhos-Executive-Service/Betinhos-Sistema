import { cleanId, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { LEGADOS, ehAdmin, ehAmplo, perfisDosPapeis } from '../../../app/acessos'
import { latenciaMock } from '../../../app/latenciaMock'
import { mockFalhaCarga, param } from '../../../app/mockVolume'
import { doAmplo, doPedido, iguais, paraPedido, ultimaDoAmplo } from '../domain/perfis'
import { lerPrevia, lerUso, type Previa, type Uso } from '../domain/previa'
import type { Dados, Historico, PerfisPessoa, Pessoa } from '../domain/types'
import { MOCK_CARLOS, previaDeExemplo, usoDeExemplo } from './mockPrevia'

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  load: () => Promise<Dados>
  /** Troca os perfis da pessoa pela Custom API (única porta de escrita). Erro vem como `CODIGO: mensagem`. */
  definir: (usuarioId: string, perfis: PerfisPessoa, amplo?: Amplo) => Promise<void>
  /** O que a pessoa deixa de ter com este pedido (`cr40f_AcessoPrevia`, só leitura). */
  previa: (usuarioId: string, perfis: PerfisPessoa, retirarAmplo: boolean, signal?: AbortSignal) => Promise<Previa>
  /** Uso de 90 dias das tabelas (registros criados ou alterados pela pessoa), até 200 numa chamada. */
  uso: (usuarioId: string, perfis: PerfisPessoa, retirarAmplo: boolean, tabelas: string[], signal?: AbortSignal) => Promise<Uso[]>
}

/** Só o Administrador do Sistema usa; retirar e devolver não vão juntos. */
export type Amplo = { retirarAmplo?: boolean; devolverAmplo?: boolean }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const date = (v: unknown) => { if (typeof v !== 'string' || !v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d }
const nomes = (v: unknown) => (Array.isArray(v) ? (v as Row[]).map((r) => str(r.name)) : [])

// Só gente: sem conta de aplicação, sem usuário desativado e sem conta interna sem Entra.
const PESSOAS = `systemusers?$select=fullname,internalemailaddress,systemuserid&$filter=${encodeURIComponent('isdisabled eq false and applicationid eq null and azureactivedirectoryobjectid ne null')}&$expand=systemuserroles_association($select=name)&$orderby=fullname asc`
const EQUIPES = 'teams?$select=name&$expand=teamroles_association($select=name),teammembership_association($select=systemuserid)'
const FICHAS = `cr40f_funcionarioses?$select=cr40f_emailmicrosoft&$filter=${encodeURIComponent('statecode eq 0 and cr40f_emailmicrosoft ne null')}`
const HISTORICO = `cr40f_acessohistoricos?$select=cr40f_acessohistoricoid,_cr40f_usuario_value,_cr40f_alteradopor_value,cr40f_perfisantes,cr40f_perfisdepois,cr40f_amplo,createdon&$orderby=${encodeURIComponent('createdon desc')}`

const minusculo = (v: unknown) => str(v).toLowerCase()

/** Monta a tela a partir das consultas. `fichas` são os e-mails Microsoft dos funcionários ativos; `null` = leitura falhou. O administrador costuma vir por equipe; os perfis, só dos papéis diretos. */
export function montar(usuarios: Row[], equipes: Row[], historico: Row[], euId: string, fichas: Row[] | null = null): Dados {
  const comFicha = new Set((fichas ?? []).map((f) => minusculo(f.cr40f_emailmicrosoft)).filter(Boolean))
  const adminsPorEquipe = new Set<string>()
  const amplosPorEquipe = new Set<string>()
  for (const equipe of equipes) {
    const papeis = nomes(equipe.teamroles_association)
    if (!ehAmplo(papeis)) continue
    const admin = ehAdmin(papeis)
    for (const m of (Array.isArray(equipe.teammembership_association) ? (equipe.teammembership_association as Row[]) : [])) {
      const id = cleanId(str(m.systemuserid))
      amplosPorEquipe.add(id)
      if (admin) adminsPorEquipe.add(id)
    }
  }
  const nomePorId = new Map<string, string>()
  const base = usuarios.map((u) => {
    const id = cleanId(str(u.systemuserid))
    const papeis = nomes(u.systemuserroles_association)
    nomePorId.set(id, str(u.fullname))
    return { id, nome: str(u.fullname), email: str(u.internalemailaddress), perfis: perfisDosPapeis(papeis), admin: ehAdmin(papeis) || adminsPorEquipe.has(id), amplo: ehAmplo(papeis) || amplosPorEquipe.has(id) }
  })
  const quem = (id: string) => nomePorId.get(id) ?? 'Usuário não listado'
  const linhas: Historico[] = historico.map((h) => {
    const usuarioId = cleanId(str(h._cr40f_usuario_value))
    return { id: str(h.cr40f_acessohistoricoid), usuarioId, usuario: quem(usuarioId), alteradoPor: quem(cleanId(str(h._cr40f_alteradopor_value))), antes: doPedido(h.cr40f_perfisantes), depois: doPedido(h.cr40f_perfisdepois), quando: date(h.createdon), amplo: doAmplo(h.cr40f_amplo) }
  })
  // O histórico vem do mais novo para o mais velho: a primeira linha de cada pessoa é a última alteração.
  const ultima = new Map<string, Date | null>()
  for (const h of linhas) if (!ultima.has(h.usuarioId)) ultima.set(h.usuarioId, h.quando)
  const pessoas: Pessoa[] = base.map((p) => ({ ...p, alteradoEm: ultima.get(p.id) ?? null, temFicha: comFicha.has(p.email.toLowerCase()) }))
  return { pessoas, historico: linhas, euId }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, latenciaMock(ms)))

export const MOCK_EU = '11111111-1111-4111-8111-111111111111'
const MOCK_PESSOAS: Pessoa[] = [
  { id: MOCK_EU, nome: 'Ana Exemplo', email: 'ana@exemplo.test', perfis: { areas: {}, acessos: false }, admin: true, amplo: true, alteradoEm: null, temFicha: true },
  { id: '22222222-2222-4222-8222-222222222222', nome: 'Bruno Modelo', email: 'bruno@exemplo.test', perfis: { areas: { financeiro: 'operador' }, acessos: false }, admin: false, amplo: false, alteradoEm: new Date('2026-11-20T15:30:00Z'), temFicha: false },
  { id: '33333333-3333-4333-8333-333333333333', nome: 'Carla Amostra', email: 'carla@exemplo.test', perfis: { areas: { operacional: 'gestor', frota: 'operador' }, acessos: true }, admin: false, amplo: true, alteradoEm: new Date('2026-11-18T13:00:00Z'), temFicha: false },
  // Mesmo e-mail do funcionário m1 do mock de Funcionários, para a ficha de exemplo mostrar o editor.
  { id: MOCK_CARLOS, nome: 'Carlos Alberto Teste', email: 'carlos.teste@betinhos.onmicrosoft.com', perfis: { areas: { operacional: 'operador' }, acessos: false }, admin: false, amplo: true, alteradoEm: new Date('2026-11-21T12:00:00Z'), temFicha: true },
  { id: '44444444-4444-4444-8444-444444444444', nome: 'Diego Teste', email: 'diego@exemplo.test', perfis: { areas: {}, acessos: false }, admin: false, amplo: false, alteradoEm: null, temFicha: false },
]

let seq = 0
function createMockSource(): Source {
  const pessoas = MOCK_PESSOAS.map((p) => ({ ...p }))
  const historico: Historico[] = [
    { id: 'h-2', usuarioId: pessoas[1].id, usuario: pessoas[1].nome, alteradoPor: 'Ana Exemplo', antes: { areas: {}, acessos: false }, depois: pessoas[1].perfis, quando: pessoas[1].alteradoEm },
    { id: 'h-1', usuarioId: pessoas[2].id, usuario: pessoas[2].nome, alteradoPor: 'Ana Exemplo', antes: { areas: { operacional: 'operador' }, acessos: false }, depois: pessoas[2].perfis, quando: pessoas[2].alteradoEm },
  ]
  return {
    mock: true,
    async load() {
      await wait(300)
      if (mockFalhaCarga()) throw new Error('Falha simulada na carga.')
      return { pessoas: pessoas.map((p) => ({ ...p })), historico: [...historico], euId: MOCK_EU }
    },
    async definir(usuarioId, perfis, amplo) {
      await wait(400)
      if (usuarioId === MOCK_EU) throw new Error('PROPRIO_ACESSO: Ninguém altera o próprio acesso.')
      if (param('falha') === 'salvar') throw new Error('PERFIL_INDISPONIVEL: Perfil ainda não publicado neste ambiente: Perfil - Frota - Gestor.')
      const pessoa = pessoas.find((p) => p.id === usuarioId)
      if (!pessoa) throw new Error('USUARIO_INVALIDO: Usuário não encontrado ou desativado.')
      if (amplo?.retirarAmplo && amplo.devolverAmplo) throw new Error('PEDIDO_INVALIDO: Retirar e devolver o acesso amplo não vão juntos.')
      const mexeNoAmplo = !!(amplo?.retirarAmplo || amplo?.devolverAmplo)
      if (amplo?.devolverAmplo && ultimaDoAmplo(historico, usuarioId)?.amplo?.acao !== 'retirar') throw new Error('NADA_A_DEVOLVER: A última entrada de acesso amplo desta pessoa não é uma retirada.')
      if (iguais(pessoa.perfis, perfis) && !mexeNoAmplo) return
      const quando = new Date()
      const papeis = [{ id: 'papel-amplo', nome: LEGADOS[0] }]
      const registro: Historico['amplo'] = amplo?.retirarAmplo && (pessoa.amplo || pessoa.admin) ? { acao: 'retirar', papeis } : amplo?.devolverAmplo ? { acao: 'devolver', papeis } : null
      historico.unshift({ id: `h-novo-${++seq}`, usuarioId, usuario: pessoa.nome, alteradoPor: 'Ana Exemplo', antes: pessoa.perfis, depois: perfis, quando, amplo: registro })
      pessoa.perfis = perfis
      pessoa.alteradoEm = quando
      if (amplo?.retirarAmplo) { pessoa.amplo = false; pessoa.admin = false }
      if (amplo?.devolverAmplo) pessoa.amplo = true
    },
    async previa(usuarioId, perfis, retirarAmplo) {
      await wait(250)
      if (param('falha') === 'previa') throw new Error('Falha simulada ao calcular a prévia.')
      const pessoa = pessoas.find((p) => p.id === usuarioId)
      const previa = previaDeExemplo(pessoa?.perfis ?? { areas: {}, acessos: false }, perfis, !!pessoa?.admin, retirarAmplo)
      return retirarAmplo && pessoa?.id === MOCK_CARLOS ? { ...previa, admin: { antes: false, depois: false }, grupos: [{ nome: 'Equipe de exemplo (Entra)', perdeDonos: 12, limitado: false }] } : previa
    },
    async uso(_usuarioId, _perfis, _retirarAmplo, tabelas) {
      await wait(250)
      return usoDeExemplo(tabelas)
    },
  }
}

export function createSource(host: Host): Source {
  if (host.mode === 'mock') return createMockSource()
  const { client } = host
  const pedirPrevia = (usuarioId: string, perfis: PerfisPessoa, retirarAmplo: boolean, tabelas: string[] | undefined, signal?: AbortSignal) => {
    const corpo = { Usuario: usuarioId, Perfis: JSON.stringify(paraPedido(perfis)), ...(retirarAmplo ? { RetirarAmplo: true } : {}), ...(tabelas ? { Tabelas: JSON.stringify(tabelas) } : {}) }
    return client.request<{ Resultado: string }>('cr40f_AcessoPrevia', { method: 'POST', body: JSON.stringify(corpo), signal })
  }
  return {
    mock: false,
    async load() {
      // Sem leitura de funcionários (perfil sem acesso à tabela) a lista mostra todos: melhor mostrar a mais do que esconder alguém.
      const [eu, usuarios, equipes, historico, fichas] = await Promise.all([
        client.request<{ UserId: string }>('WhoAmI'),
        client.getAll(PESSOAS),
        client.getAll(EQUIPES),
        client.getAll(HISTORICO),
        client.getAll(FICHAS).catch(() => null),
      ])
      return montar(usuarios, equipes, historico, cleanId(eu.UserId), fichas)
    },
    async definir(usuarioId, perfis, amplo) {
      const corpo = { Usuario: usuarioId, Perfis: JSON.stringify(paraPedido(perfis)), ...(amplo?.retirarAmplo ? { RetirarAmplo: true } : {}), ...(amplo?.devolverAmplo ? { DevolverAmplo: true } : {}) }
      await client.request('cr40f_AcessoDefinirPerfis', { method: 'POST', body: JSON.stringify(corpo) })
    },
    async previa(usuarioId, perfis, retirarAmplo, signal) {
      return lerPrevia((await pedirPrevia(usuarioId, perfis, retirarAmplo, undefined, signal)).Resultado)
    },
    async uso(usuarioId, perfis, retirarAmplo, tabelas, signal) {
      return lerUso((await pedirPrevia(usuarioId, perfis, retirarAmplo, tabelas, signal)).Resultado)
    },
  }
}
