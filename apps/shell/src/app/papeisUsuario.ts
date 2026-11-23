import { cleanId } from '@betinhos/dataverse'
import type { Host } from '../host'

type HostDataverse = Extract<Host, { mode: 'dataverse' }>

/** Papéis de administrador do ambiente (o Renan); o nome muda com o idioma do ambiente. */
export const PAPEIS_RENAN = ['System Administrator', 'Administrador do Sistema']
export const papeisPath = (userId: string) => `systemusers(${cleanId(userId)})/systemuserroles_association?$select=name`

/** Nomes dos papéis atribuídos diretamente ao usuário logado (papel herdado de equipe não entra). */
export async function lerPapeisDiretos(host: HostDataverse): Promise<string[]> {
  const me = await host.client.request<{ UserId: string }>('WhoAmI')
  const roles = await host.client.request<{ value: { name: string }[] }>(papeisPath(me.UserId))
  return roles.value.map((r) => r.name)
}
