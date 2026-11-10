import { cleanId } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { draftPayload, isDisparado, mapComunicado, mapDestinatario, mapMotoristas, validateDraft, type Comunicado, type Destinatario, type Motorista } from '../domain/comunicados'
import { createMockSource } from './mock'

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  comunicados: () => Promise<Comunicado[]>
  destinatarios: (comunicadoId: string) => Promise<Destinatario[]>
  /** Destinatários de um motorista (id do cadastro em `cr40f_funcionarios`), do mais recente ao mais antigo. */
  destinatariosDoMotorista: (motoristaId: string) => Promise<Destinatario[]>
  /** Nome de quem está no sistema, para o rodapé do PDF de evidência. Sem nome (ou falha de leitura) vira `null`; nunca bloqueia o PDF. */
  quemSou: () => Promise<string | null>
  motoristas: () => Promise<Motorista[]>
  /** Cria ou atualiza o rascunho; devolve o id. */
  salvar: (draft: Comunicado) => Promise<string>
  excluir: (id: string) => Promise<void>
  /** Custom API `new_DispararComunicadoMotorista`: cria destinatários e enfileira o push. */
  disparar: (id: string) => Promise<void>
  /** Custom API `new_ReenviarPushComunicado`: reenvio após falha ou lembrete. */
  reenviar: (destinatarioId: string) => Promise<void>
}

const ENTITIES = { comunicado: 'new_comunicadomotorista', destinatario: 'new_comunicadodestinatario', funcionario: 'cr40f_funcionarios', usuario: 'systemuser' } as const
type Sets = Record<keyof typeof ENTITIES, string>

const DESTINATARIO_SELECT = '$select=new_comunicadodestinatarioid,_new_comunicado_value,_new_motorista_value,new_enviadoem,new_abertoem,new_lidoem,new_cienteem,new_nomeassinante,new_observacao,new_assinaturajson,new_evidenciaaberturajson,new_evidenciacienciajson,new_pushstatus,new_pusherro'

export function createSource(host: Host): Source {
  if (host.mode === 'mock') return createMockSource()
  const { client } = host
  let sets: Promise<Sets> | null = null
  const entitySets = () => (sets ??= host.metadata.entities(Object.values(ENTITIES)).then((info) => {
    const get = (name: string) => {
      const value = info.get(name)?.entitySetName
      if (!value) throw new Error(`Tabela ${name} não encontrada na metadata.`)
      return value
    }
    return { comunicado: get(ENTITIES.comunicado), destinatario: get(ENTITIES.destinatario), funcionario: get(ENTITIES.funcionario), usuario: get(ENTITIES.usuario) }
  }).catch((error) => { sets = null; throw error }))

  let nomeUsuario: Promise<string | null> | null = null

  const action = (name: string, body: Record<string, string>) => client.request(name, { method: 'POST', body: JSON.stringify(body) }).then(() => undefined)

  return {
    mock: false,
    async comunicados() {
      const s = await entitySets()
      const rows = await client.getAll(`${s.comunicado}?$select=new_comunicadomotoristaid,new_titulo,new_corpo,new_tipo,new_escopo,new_alvosjson,new_estado,new_disparadoem&$orderby=createdon desc`)
      return rows.map(mapComunicado)
    },
    async destinatarios(comunicadoId) {
      const s = await entitySets()
      const rows = await client.getAll(`${s.destinatario}?${DESTINATARIO_SELECT}&$filter=_new_comunicado_value eq ${cleanId(comunicadoId)}&$orderby=new_enviadoem desc`)
      return rows.map(mapDestinatario)
    },
    async destinatariosDoMotorista(motoristaId) {
      const s = await entitySets()
      const rows = await client.getAll(`${s.destinatario}?${DESTINATARIO_SELECT}&$filter=_new_motorista_value eq ${cleanId(motoristaId)}&$orderby=new_enviadoem desc`)
      return rows.map(mapDestinatario)
    },
    // Cache do que deu certo; em erro, a próxima chamada tenta de novo.
    quemSou() {
      return (nomeUsuario ??= (async () => {
        const s = await entitySets()
        const me = await client.request<{ UserId: string }>('WhoAmI')
        const user = await client.request<{ fullname?: string | null; internalemailaddress?: string | null }>(`${s.usuario}(${cleanId(me.UserId)})?$select=fullname,internalemailaddress`)
        return user.fullname?.trim() || user.internalemailaddress?.trim() || null
      })().catch(() => { nomeUsuario = null; return null }))
    },
    async motoristas() {
      const s = await entitySets()
      const [employees, users] = await Promise.all([
        client.getAll(`${s.funcionario}?$select=cr40f_funcionariosid,cr40f_nomecompleto,cr40f_emailmicrosoft,cr40f_tipodevinculo&$filter=cr40f_status eq 0 and statecode eq 0`),
        client.getAll(`${s.usuario}?$select=systemuserid,internalemailaddress&$filter=isdisabled eq false`),
      ])
      return mapMotoristas(employees, users)
    },
    async salvar(draft) {
      const error = validateDraft(draft)
      if (error) throw new Error(error)
      if (isDisparado(draft)) throw new Error('Comunicado já disparado não pode ser editado.')
      const s = await entitySets()
      if (draft.id) {
        await client.update(s.comunicado, draft.id, draftPayload(draft))
        return cleanId(draft.id)
      }
      return cleanId(await client.create(s.comunicado, draftPayload(draft)))
    },
    async excluir(id) {
      await client.remove((await entitySets()).comunicado, id)
    },
    disparar: (id) => action('new_DispararComunicadoMotorista', { new_ComunicadoId: cleanId(id) }),
    reenviar: (id) => action('new_ReenviarPushComunicado', { new_DestinatarioId: cleanId(id) }),
  }
}
