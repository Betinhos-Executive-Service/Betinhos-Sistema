import { cleanId, type DataverseClient } from '@betinhos/dataverse'
import type { Host } from '../host'
import { param } from './mockVolume'

/** Perfis de acesso da pessoa. O shell usa para esconder o que ela não alcança; quem barra de verdade é o Dataverse. */

export const AREAS = ['operacional', 'financeiro', 'frota', 'rh'] as const
export type Area = (typeof AREAS)[number]
export type Nivel = 'operador' | 'gestor'
export type Perfil = Area | 'acessos'
export type PerfisDeArea = Partial<Record<Area, Nivel>>
export type Acessos = { admin: boolean; areas: PerfisDeArea; acessos: boolean }

export const AREA_LABEL: Record<Area, string> = { operacional: 'Operacional', financeiro: 'Financeiro', frota: 'Frota', rh: 'RH' }
export const NIVEL_LABEL: Record<Nivel, string> = { operador: 'Operador', gestor: 'Gestor' }
export const PERFIL_LABEL: Record<Perfil, string> = { ...AREA_LABEL, acessos: 'Administrador de acessos' }

export const TODOS: Acessos = { admin: true, areas: { operacional: 'gestor', financeiro: 'gestor', frota: 'gestor', rh: 'gestor' }, acessos: true }
export const NENHUM: Acessos = { admin: false, areas: {}, acessos: false }

const ADMINS = ['Administrador do Sistema', 'System Administrator']
const PAPEL_ACESSOS = 'Perfil - Administrador de acessos'

export const nomeDoPapel = (area: Area, nivel: Nivel) => `Perfil - ${AREA_LABEL[area]} - ${NIVEL_LABEL[nivel]}`
export const ehAdmin = (nomes: string[]) => nomes.some((n) => ADMINS.includes(n))

/** Só os papéis `Perfil - ...`, sem o atalho do administrador (é o que a tela de Acessos mostra por pessoa). */
export function perfisDosPapeis(nomes: string[]): { areas: PerfisDeArea; acessos: boolean } {
  const areas: PerfisDeArea = {}
  for (const area of AREAS) {
    if (nomes.includes(nomeDoPapel(area, 'gestor'))) areas[area] = 'gestor'
    else if (nomes.includes(nomeDoPapel(area, 'operador'))) areas[area] = 'operador'
  }
  return { areas, acessos: nomes.includes(PAPEL_ACESSOS) }
}

export function lerPapeis(nomes: string[]): Acessos {
  return ehAdmin(nomes) ? TODOS : { admin: false, ...perfisDosPapeis(nomes) }
}

export function temPerfil(a: Acessos, perfil: Perfil, nivel: Nivel = 'operador'): boolean {
  if (a.admin) return true
  if (perfil === 'acessos') return a.acessos
  const tem = a.areas[perfil]
  return tem != null && (nivel === 'operador' || tem === 'gestor')
}

export const temAlgum = (a: Acessos, perfis: readonly Perfil[] | undefined) => !perfis || perfis.some((p) => temPerfil(a, p))
export const semModulos = (a: Acessos) => !a.admin && !a.acessos && AREAS.every((area) => !a.areas[area])

type Linhas<T> = { value: T[] }

/** Nomes dos papéis da pessoa: os diretos e os herdados das equipes (o administrador costuma vir por equipe). */
export async function nomesDosPapeis(client: DataverseClient, userId?: string): Promise<string[]> {
  const uid = userId ?? cleanId((await client.request<{ UserId: string }>('WhoAmI')).UserId)
  const [diretos, equipes] = await Promise.all([
    client.request<Linhas<{ name: string }>>(`systemusers(${uid})/systemuserroles_association?$select=name`),
    client.request<Linhas<{ teamid: string }>>(`systemusers(${uid})/teammembership_association?$select=teamid`),
  ])
  // Equipe ilegível conta como sem papéis; falha no WhoAmI, nos papéis diretos ou na lista de equipes continua sendo erro.
  const deEquipe = await Promise.allSettled(equipes.value.map((e) => client.request<Linhas<{ name: string }>>(`teams(${e.teamid})/teamroles_association?$select=name`)))
  const herdados = deEquipe.flatMap((r) => (r.status === 'fulfilled' ? r.value.value : []))
  return [...diretos.value, ...herdados].map((r) => r.name)
}

/** `?acessos=financeiro:operador,rh:gestor,acessos` | `nenhum` | `erro`; sem o parâmetro, todos os perfis. */
export function acessosDoMock(texto: string | null): Acessos {
  if (!texto) return TODOS
  if (texto === 'nenhum') return NENHUM
  if (texto === 'erro') throw new Error('Falha simulada ao ler os acessos.')
  const areas: PerfisDeArea = {}
  let acessos = false
  for (const parte of texto.split(',')) {
    const [perfil, nivel] = parte.trim().split(':')
    if (perfil === 'acessos') acessos = true
    else if ((AREAS as readonly string[]).includes(perfil)) areas[perfil as Area] = nivel === 'gestor' ? 'gestor' : 'operador'
  }
  return { admin: false, areas, acessos }
}

export async function carregarAcessos(host: Host): Promise<Acessos> {
  if (host.mode === 'mock') return acessosDoMock(param('acessos'))
  return lerPapeis(await nomesDosPapeis(host.client))
}
