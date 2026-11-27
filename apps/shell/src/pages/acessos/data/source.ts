import { cleanId, odataString, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { LEGADOS, ehAdmin, ehAmplo, exigeAdminDoSistema, perfisDosPapeis } from '../../../app/acessos'
import { latenciaMock } from '../../../app/latenciaMock'
import { mockFalhaCarga, param } from '../../../app/mockVolume'
import { doAmplo, doPedido, erroDaApi, iguais, paraPedido, ultimaDoAmplo } from '../domain/perfis'
import { lerPrevia, lerUso, type Previa, type Uso } from '../domain/previa'
import { AcessoError, MENSAGENS_DO_CICLO, parseAcessoError, parseEtapas, type Etapa } from '../../funcionarios/data/acesso'
import type { Dados, Encerrado, Historico, PerfisPessoa, Pessoa } from '../domain/types'
import { MOCK_CARLOS, previaDeExemplo, usoDeExemplo } from './mockPrevia'

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  load: () => Promise<Dados>
  /** Troca os perfis da pessoa pela Custom API (única porta de escrita). Erro vem como `CODIGO: mensagem`. */
  definir: (usuarioId: string, perfis: PerfisPessoa, amplo?: Amplo) => Promise<void>
  /** Encerra o acesso de um administrativo (`cr40f_AcessoEncerrar`): `confirmacao` é o primeiro nome da pessoa. Devolve as etapas; recusa vira `AcessoError` com `codigo` (PROPRIO_ACESSO, ULTIMO_ADMIN, SEM_PERMISSAO, CONFIRMACAO_INVALIDA, JA_ENCERRADO...), a mensagem do servidor e as etapas já feitas. */
  encerrar: (usuarioId: string, confirmacao: string) => Promise<Etapa[]>
  /** Reativa com os perfis, as equipes e as colunas do último encerramento (`cr40f_AcessoReativar`); mesmos erros, mais NADA_A_REATIVAR. */
  reativar: (usuarioId: string) => Promise<Etapa[]>
  /** Quem está encerrado (conta bloqueada e último histórico `encerrar`), do mais recente ao mais antigo. Leitura à parte de `load`; lê só o histórico de encerramentos e as contas bloqueadas que aparecem nele. */
  encerrados: () => Promise<Encerrado[]>
  /** O encerramento de uma pessoa pelo e-mail da conta (a ficha só conhece o e-mail): `null` se a conta não está bloqueada por um encerramento. Lê só o histórico e o `isdisabled` dela. */
  encerramento: (email: string) => Promise<Encerrado | null>
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
const FICHAS = `cr40f_funcionarioses?$select=cr40f_emailmicrosoft,cr40f_funcionariosid&$filter=${encodeURIComponent('statecode eq 0 and cr40f_emailmicrosoft ne null')}`
const HISTORICO = `cr40f_acessohistoricos?$select=cr40f_acessohistoricoid,_cr40f_usuario_value,_cr40f_alteradopor_value,cr40f_perfisantes,cr40f_perfisdepois,cr40f_amplo,createdon&$orderby=${encodeURIComponent('createdon desc')}`

// "Encerrados": só as linhas de encerramento do histórico (o JSON do plugin não tem espaços), depois as contas bloqueadas dessas pessoas e o histórico inteiro delas.
const SO_ENCERRAMENTOS = `cr40f_acessohistoricos?$select=_cr40f_usuario_value&$filter=${encodeURIComponent(`contains(cr40f_amplo,'"acao":"encerrar"')`)}`
const PEDACO = 15
const pedacos = <T,>(itens: T[]) => Array.from({ length: Math.ceil(itens.length / PEDACO) }, (_, i) => itens.slice(i * PEDACO, (i + 1) * PEDACO))
const filtroOr = (campo: string, valores: string[], aspas = false) => encodeURIComponent(`(${valores.map((v) => (aspas ? `${campo} eq '${odataString(v)}'` : `${campo} eq ${v}`)).join(' or ')})`)

const minusculo = (v: unknown) => str(v).toLowerCase()

/** E-mail Microsoft (minúsculo) → id do funcionário (vazio quando a leitura não trouxe o id). */
function fichasPorEmail(fichas: Row[]) {
  const mapa = new Map<string, string>()
  for (const f of fichas) { const email = minusculo(f.cr40f_emailmicrosoft); const id = cleanId(str(f.cr40f_funcionariosid)); if (email && !mapa.has(email)) mapa.set(email, id) }
  return mapa
}

/** Monta a tela a partir das consultas. `fichas` são os e-mails Microsoft dos funcionários ativos; `null` = leitura falhou. O administrador costuma vir por equipe; os perfis, só dos papéis diretos. */
export function montar(usuarios: Row[], equipes: Row[], historico: Row[], euId: string, fichas: Row[] | null = null): Dados {
  const fichaPorEmail = fichasPorEmail(fichas ?? [])
  const adminsPorEquipe = new Set<string>()
  const amplosPorEquipe = new Set<string>()
  const equipesRestritas: string[] = []
  for (const equipe of equipes) {
    const papeis = nomes(equipe.teamroles_association)
    if (exigeAdminDoSistema(papeis)) equipesRestritas.push(cleanId(str(equipe.teamid)).toLowerCase())
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
  const pessoas: Pessoa[] = base.map((p) => ({ ...p, alteradoEm: ultima.get(p.id) ?? null, temFicha: fichaPorEmail.has(p.email.toLowerCase()), fichaId: fichaPorEmail.get(p.email.toLowerCase()) || null }))
  return { pessoas, historico: linhas, euId, equipesRestritas }
}

/** Cruza as contas bloqueadas com o histórico: a linha mais recente de cada pessoa tem de ser um encerramento (linha posterior de qualquer tipo invalida, como no servidor). `nomes` só dá os nomes de quem encerrou. */
export function montarEncerrados(desativados: Row[], nomes: Row[], historico: Row[], fichas: Row[] = []): Encerrado[] {
  const fichaPorEmail = fichasPorEmail(fichas)
  const nomePorId = new Map<string, string>()
  for (const u of [...nomes, ...desativados]) nomePorId.set(cleanId(str(u.systemuserid)), str(u.fullname))
  const quando = (h: Row) => date(h.createdon)?.getTime() ?? 0
  const ultima = new Map<string, Row>()
  // Ordena aqui em vez de confiar na ordem da API; empate fica com a primeira linha lida.
  for (const h of [...historico].sort((a, b) => quando(b) - quando(a))) { const id = cleanId(str(h._cr40f_usuario_value)); if (!ultima.has(id)) ultima.set(id, h) }
  const lista: Encerrado[] = []
  for (const u of desativados) {
    const id = cleanId(str(u.systemuserid))
    const h = ultima.get(id)
    const ciclo = h ? doAmplo(h.cr40f_amplo) : null
    if (!h || ciclo?.acao !== 'encerrar') continue
    lista.push({ id, nome: str(u.fullname), email: str(u.internalemailaddress), encerradoEm: date(h.createdon), encerradoPor: nomePorId.get(cleanId(str(h._cr40f_alteradopor_value))) ?? 'Usuário não listado', fichaId: fichaPorEmail.get(minusculo(u.internalemailaddress)) || null, ciclo, antes: doPedido(h.cr40f_perfisantes) })
  }
  return lista.sort((a, b) => (b.encerradoEm?.getTime() ?? 0) - (a.encerradoEm?.getTime() ?? 0))
}

/** Recusa do plugin (`CODIGO: mensagem | etapas=[...]`) como AcessoError, mantendo a mensagem do servidor (a tabela de mensagens do fluxo de motorista diz outra coisa em SEM_PERMISSAO). */
function recusa(reason: unknown): AcessoError {
  if (reason instanceof AcessoError) return reason
  const { codigo, mensagem } = erroDaApi(reason)
  // Estas duas trazem contagens e jargão do servidor; a tela diz o que fazer.
  return new AcessoError(codigo ?? 'DESCONHECIDO', codigo && MENSAGENS_DO_CICLO[codigo] ? MENSAGENS_DO_CICLO[codigo] : mensagem, parseAcessoError(reason).etapas)
}

type Cliente = { getAll: (caminho: string) => Promise<Row[]> }
/** Do histórico inteiro dos bloqueados, só o que a lista precisa: as linhas deles, os nomes de quem encerrou e as fichas (qualquer situação). */
async function lerEncerrados(client: Cliente, bloqueados: Row[]): Promise<Encerrado[]> {
  if (!bloqueados.length) return []
  const ids = bloqueados.map((u) => cleanId(str(u.systemuserid)))
  const historico = (await Promise.all(pedacos(ids).map((p) => client.getAll(`${HISTORICO}&$filter=${filtroOr('_cr40f_usuario_value', p)}`)))).flat()
  const autores = [...new Set(historico.map((h) => cleanId(str(h._cr40f_alteradopor_value))).filter((id) => id && !ids.includes(id)))]
  const emails = [...new Set(bloqueados.map((u) => str(u.internalemailaddress)).filter(Boolean))]
  const [nomes, fichas] = await Promise.all([
    Promise.all(pedacos(autores).map((p) => client.getAll(`systemusers?$select=fullname,systemuserid&$filter=${filtroOr('systemuserid', p)}`))).then((r) => r.flat()),
    Promise.all(pedacos(emails).map((p) => client.getAll(`cr40f_funcionarioses?$select=cr40f_emailmicrosoft,cr40f_funcionariosid&$filter=${filtroOr('cr40f_emailmicrosoft', p, true)}`))).then((r) => r.flat()).catch(() => [] as Row[]),
  ])
  return montarEncerrados(bloqueados, nomes, historico, fichas)
}

const comparavel = (v: string) => v.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, latenciaMock(ms)))

export const MOCK_EU = '11111111-1111-4111-8111-111111111111'
const MOCK_PESSOAS: Pessoa[] = [
  { id: MOCK_EU, nome: 'Ana Exemplo', email: 'ana@exemplo.test', perfis: { areas: {}, acessos: false }, admin: true, amplo: true, alteradoEm: null, temFicha: true },
  { id: '22222222-2222-4222-8222-222222222222', nome: 'Bruno Modelo', email: 'bruno@exemplo.test', perfis: { areas: { financeiro: 'operador' }, acessos: false }, admin: false, amplo: false, alteradoEm: new Date('2026-11-20T15:30:00Z'), temFicha: false },
  { id: '33333333-3333-4333-8333-333333333333', nome: 'Carla Amostra', email: 'carla@exemplo.test', perfis: { areas: { operacional: 'gestor', frota: 'operador' }, acessos: true }, admin: false, amplo: true, alteradoEm: new Date('2026-11-18T13:00:00Z'), temFicha: false },
  // Mesmo e-mail do funcionário m1 do mock de Funcionários, para a ficha de exemplo mostrar o editor.
  { id: MOCK_CARLOS, nome: 'Carlos Alberto Teste', email: 'carlos.teste@betinhos.onmicrosoft.com', perfis: { areas: { operacional: 'operador' }, acessos: false }, admin: false, amplo: true, alteradoEm: new Date('2026-11-21T12:00:00Z'), temFicha: true, fichaId: 'm1' },
  { id: '44444444-4444-4444-8444-444444444444', nome: 'Diego Teste', email: 'diego@exemplo.test', perfis: { areas: {}, acessos: false }, admin: false, amplo: false, alteradoEm: null, temFicha: false },
]

/** Pessoa de exemplo já encerrada (fictícia); fora de `MOCK_PESSOAS` porque a lista só traz contas ativas. */
export const MOCK_ENCERRADA: Pessoa = { id: '66666666-6666-4666-8666-666666666666', nome: 'Joana Encerrada Teste', email: 'joana.teste@betinhos.onmicrosoft.com', perfis: { areas: { operacional: 'operador' }, acessos: false }, admin: false, amplo: false, alteradoEm: new Date('2026-11-10T14:00:00Z'), temFicha: false, fichaId: 'm9' }

let seq = 0
function createMockSource(): Source {
  const pessoas = MOCK_PESSOAS.map((p) => ({ ...p }))
  const paraEncerrado = (e: { pessoa: Pessoa; quando: Date | null; por: string }): Encerrado => ({ id: e.pessoa.id, nome: e.pessoa.nome, email: e.pessoa.email, encerradoEm: e.quando, encerradoPor: e.por, fichaId: e.pessoa.fichaId ?? null, ciclo: { acao: 'encerrar', papeis: [{ id: 'papel-base', nome: 'Perfil - Base' }], perfisColuna: [], equipes: [] }, antes: e.pessoa.perfis })
  const encerradas: { pessoa: Pessoa; quando: Date | null; por: string }[] = [{ pessoa: { ...MOCK_ENCERRADA }, quando: MOCK_ENCERRADA.alteradoEm, por: 'Ana Exemplo' }]
  const historico: Historico[] = [
    { id: 'h-0', usuarioId: MOCK_ENCERRADA.id, usuario: MOCK_ENCERRADA.nome, alteradoPor: 'Ana Exemplo', antes: MOCK_ENCERRADA.perfis, depois: { areas: {}, acessos: false }, quando: MOCK_ENCERRADA.alteradoEm, amplo: { acao: 'encerrar', papeis: [{ id: 'papel-base', nome: 'Perfil - Base' }] } },
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
    async encerrar(usuarioId, confirmacao) {
      await wait(500)
      if (usuarioId === MOCK_EU) throw new AcessoError('PROPRIO_ACESSO', 'Ninguém encerra o próprio acesso.', [])
      if (encerradas.some((e) => e.pessoa.id === usuarioId)) throw new AcessoError('JA_ENCERRADO', 'O acesso desta pessoa já está encerrado.', [])
      const pessoa = pessoas.find((p) => p.id === usuarioId)
      if (!pessoa) throw new AcessoError('USUARIO_INVALIDO', 'Usuário não encontrado ou de aplicação.', [])
      if (param('falha') === 'salvar') throw new AcessoError('SEM_PERMISSAO', 'Falha simulada: sem permissão para encerrar.', [])
      if (comparavel(pessoa.nome.split(/\s+/)[0]) !== comparavel(confirmacao)) throw new AcessoError('CONFIRMACAO_INVALIDA', 'Digite o primeiro nome da pessoa para confirmar.', [{ etapa: 'confirmacao', estado: 'erro', detalhe: 'não confere' }])
      const quando = new Date()
      historico.unshift({ id: `h-novo-${++seq}`, usuarioId, usuario: pessoa.nome, alteradoPor: 'Ana Exemplo', antes: pessoa.perfis, depois: { areas: {}, acessos: false }, quando, amplo: { acao: 'encerrar', papeis: [{ id: 'papel-base', nome: 'Perfil - Base' }] } })
      pessoas.splice(pessoas.indexOf(pessoa), 1)
      encerradas.unshift({ pessoa: { ...pessoa, alteradoEm: quando }, quando, por: 'Ana Exemplo' })
      return [{ etapa: 'confirmacao', estado: 'feita', detalhe: 'ok' }, { etapa: 'papeis', estado: 'feita', detalhe: '1 retirado(s)' }, { etapa: 'perfisColuna', estado: 'pulada', detalhe: 'não tinha' }, { etapa: 'equipes', estado: 'pulada', detalhe: 'sem equipe com papel' }, { etapa: 'historico', estado: 'feita', detalhe: 'gravado' }, { etapa: 'bloqueio', estado: 'feita', detalhe: 'bloqueado no Dataverse' }]
    },
    async reativar(usuarioId) {
      await wait(500)
      if (usuarioId === MOCK_EU) throw new AcessoError('PROPRIO_ACESSO', 'Ninguém reativa o próprio acesso.', [])
      const i = encerradas.findIndex((e) => e.pessoa.id === usuarioId)
      if (i < 0) throw new AcessoError('NADA_A_REATIVAR', 'Não há encerramento de acesso a reativar para esta pessoa.', [])
      if (param('falha') === 'salvar') throw new AcessoError('SEM_PERMISSAO', 'Falha simulada: sem permissão para reativar.', [])
      const [{ pessoa }] = encerradas.splice(i, 1)
      const quando = new Date()
      historico.unshift({ id: `h-novo-${++seq}`, usuarioId, usuario: pessoa.nome, alteradoPor: 'Ana Exemplo', antes: { areas: {}, acessos: false }, depois: pessoa.perfis, quando, amplo: { acao: 'reativar', papeis: [{ id: 'papel-base', nome: 'Perfil - Base' }] } })
      pessoas.push({ ...pessoa, alteradoEm: quando })
      return [{ etapa: 'bloqueio', estado: 'feita', detalhe: 'desbloqueado no Dataverse' }, { etapa: 'papeis', estado: 'feita', detalhe: '1 reposto(s)' }, { etapa: 'historico', estado: 'feita', detalhe: 'gravado' }]
    },
    async encerrados() {
      await wait(200)
      return encerradas.map(paraEncerrado)
    },
    async encerramento(email) {
      await wait(200)
      if (param('falha') === 'encerramento') throw new Error('Falha simulada ao ler o encerramento.')
      const e = encerradas.find((x) => x.pessoa.email.toLowerCase() === email.trim().toLowerCase())
      return e ? paraEncerrado(e) : null
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
    async encerrar(usuarioId, confirmacao) {
      try {
        const r = await client.request<{ Etapas: string }>('cr40f_AcessoEncerrar', { method: 'POST', body: JSON.stringify({ Usuario: usuarioId, Confirmacao: confirmacao }) })
        return parseEtapas(r.Etapas)
      } catch (reason) { throw recusa(reason) }
    },
    async reativar(usuarioId) {
      try {
        const r = await client.request<{ Etapas: string }>('cr40f_AcessoReativar', { method: 'POST', body: JSON.stringify({ Usuario: usuarioId }) })
        return parseEtapas(r.Etapas)
      } catch (reason) { throw recusa(reason) }
    },
    async encerrados() {
      const linhas = await client.getAll(SO_ENCERRAMENTOS)
      const ids = [...new Set(linhas.map((l) => cleanId(str(l._cr40f_usuario_value))).filter(Boolean))]
      const bloqueados = (await Promise.all(pedacos(ids).map((p) => client.getAll(`systemusers?$select=fullname,internalemailaddress,systemuserid&$filter=${encodeURIComponent('isdisabled eq true and applicationid eq null and ')}${filtroOr('systemuserid', p)}`)))).flat()
      return lerEncerrados(client, bloqueados)
    },
    async encerramento(email) {
      const alvo = email.trim()
      if (!alvo) return null
      const contas = await client.getAll(`systemusers?$select=fullname,internalemailaddress,systemuserid&$filter=${encodeURIComponent(`isdisabled eq true and applicationid eq null and internalemailaddress eq '${odataString(alvo)}'`)}`)
      return (await lerEncerrados(client, contas))[0] ?? null
    },
    async previa(usuarioId, perfis, retirarAmplo, signal) {
      return lerPrevia((await pedirPrevia(usuarioId, perfis, retirarAmplo, undefined, signal)).Resultado)
    },
    async uso(usuarioId, perfis, retirarAmplo, tabelas, signal) {
      return lerUso((await pedirPrevia(usuarioId, perfis, retirarAmplo, tabelas, signal)).Resultado)
    },
  }
}
