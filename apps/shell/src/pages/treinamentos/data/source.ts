import { chunk, cleanId, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { getDataverseEnvironmentLabel } from '../../funcionarios/data/dataverse'
import { createSharePointDocs, sanitizeFileName, uniqueName, type EnvVarApi } from '../../funcionarios/data/sharepoint'
import { ESTADO, draftPayload, isPublicado, mapFuncionario, mapParticipacao, mapTreinamento, validarRascunho, type Anexo, type Funcionario, type Participacao, type Treinamento } from '../domain/treinamentos'
import type { Linha } from '../domain/lista'
import { createMockSource } from './mock'

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  treinamentos: () => Promise<Linha[]>
  /** Funcionários ativos e desligados (o painel mostra quem saiu depois de publicado). */
  funcionarios: () => Promise<Funcionario[]>
  participacoes: (treinamentoId: string) => Promise<Participacao[]>
  /** Cria ou atualiza o rascunho; devolve o id. */
  salvar: (draft: Treinamento) => Promise<string>
  excluir: (id: string) => Promise<void>
  /** Grava só a lista de anexos (o arquivo já está no SharePoint); vale para rascunho e publicado. */
  salvarAnexos: (id: string, anexos: Anexo[]) => Promise<void>
  /** Cria as participações que faltam para `alvos` e marca como publicado. Repetir não duplica. */
  publicar: (treinamento: Treinamento, alvos: Pick<Funcionario, 'id' | 'nome'>[]) => Promise<void>
  /** Arquivo vai para o SharePoint (`Treinamentos/<id>`); a lista de anexos é gravada pelo `salvar`. */
  enviarAnexo: (treinamentoId: string, file: File, existentes: Anexo[]) => Promise<Anexo>
  excluirAnexo: (treinamentoId: string, anexo: Anexo) => Promise<void>
  abrirAnexo: (anexo: Anexo) => Promise<{ nome: string; blob: Blob }>
}

export const ANEXO_ROOT = 'Treinamentos'
const ENTITIES = { treinamento: 'cr40f_treinamento', participacao: 'cr40f_treinamentoparticipacao', funcionario: 'cr40f_funcionarios' } as const
type Sets = Record<keyof typeof ENTITIES, string>

const TREINAMENTO_SELECT = 'cr40f_treinamentoid,cr40f_name,cr40f_descricao,cr40f_conteudo,cr40f_videourl,cr40f_anexosjson,cr40f_publicotipo,cr40f_publicojson,cr40f_exigeassinatura,cr40f_exigequiz,cr40f_notaminima,cr40f_quizjson,cr40f_validade,cr40f_estado,cr40f_publicadoem,createdon'
const PARTICIPACAO_SELECT = 'cr40f_treinamentoparticipacaoid,_cr40f_treinamento_value,_cr40f_funcionario_value,cr40f_abertoem,cr40f_confirmadoem,cr40f_assinadoem,cr40f_nomeassinante,cr40f_assinaturajson,cr40f_nota,cr40f_aprovado,cr40f_tentativas,cr40f_concluidoem'
const FUNCIONARIO_SELECT = 'cr40f_funcionariosid,cr40f_nomecompleto,new_apelido,cr40f_funcao,cr40f_status'

function participacaoPayload(sets: Pick<Sets, 'treinamento' | 'funcionario'>, treinamento: Treinamento, funcionario: Pick<Funcionario, 'id' | 'nome'>): Row {
  return {
    cr40f_name: `${treinamento.titulo} · ${funcionario.nome}`.slice(0, 200),
    'cr40f_Treinamento@odata.bind': `/${sets.treinamento}(${cleanId(treinamento.id)})`,
    'cr40f_Funcionario@odata.bind': `/${sets.funcionario}(${cleanId(funcionario.id)})`,
  }
}

const documentoDoAnexo = (anexo: Anexo) => ({ id: anexo.caminho, nome: anexo.nome, caminho: anexo.caminho, tamanho: anexo.tamanho, modificadoEm: null, mimeType: anexo.mime || null })

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
    return { treinamento: get(ENTITIES.treinamento), participacao: get(ENTITIES.participacao), funcionario: get(ENTITIES.funcionario) }
  }).catch((error) => { sets = null; throw error }))

  // Os flows do SharePoint leem a URL em variáveis de ambiente; o store de Funcionários lê pelo formato do Xrm.WebApi.
  const envVars: EnvVarApi = { retrieveMultipleRecords: async (entity, options = '') => ({ entities: await client.getAll(`${entity}s${options}`) }) }
  const sharepoint = createSharePointDocs(envVars, getDataverseEnvironmentLabel(host.clientUrl), ANEXO_ROOT, 'TELA_TREINAMENTOS')

  const participacoes = async (treinamentoId: string) => {
    const s = await entitySets()
    const rows = await client.getAll(`${s.participacao}?$select=${PARTICIPACAO_SELECT}&$filter=_cr40f_treinamento_value eq ${cleanId(treinamentoId)}&$orderby=createdon asc`)
    return rows.map(mapParticipacao)
  }
  const funcionarios = async () => {
    const s = await entitySets()
    const rows = await client.getAll(`${s.funcionario}?$select=${FUNCIONARIO_SELECT}&$filter=statecode eq 0&$orderby=cr40f_nomecompleto asc`)
    return rows.map(mapFuncionario)
  }

  return {
    mock: false,
    async treinamentos() {
      const s = await entitySets()
      const rows = await client.getAll(`${s.treinamento}?$select=${TREINAMENTO_SELECT}&$orderby=createdon desc`)
      return rows.map((row) => ({ ...mapTreinamento(row), criadoEm: String(row.createdon ?? '') }))
    },
    funcionarios,
    participacoes,
    async salvar(draft) {
      const error = validarRascunho(draft)
      if (error) throw new Error(error)
      if (isPublicado(draft)) throw new Error('Treinamento publicado não pode ser editado.')
      const s = await entitySets()
      if (draft.id) {
        // O estado vem do Dataverse, não da cópia aberta na tela: outra aba pode ter publicado e o rascunho antigo não pode reabrir nem sobrescrever o publicado.
        const [atual] = await client.getAll(`${s.treinamento}?$select=cr40f_estado&$filter=cr40f_treinamentoid eq ${cleanId(draft.id)}`)
        if (atual && Number(atual.cr40f_estado) === ESTADO.publicado) throw new Error('Este treinamento já foi publicado e não pode ser editado. Atualize a lista.')
        // Na edição o estado não entra no PATCH: só a publicação o muda.
        const { cr40f_estado: _estado, ...payload } = draftPayload(draft)
        await client.update(s.treinamento, draft.id, payload)
        return cleanId(draft.id)
      }
      return cleanId(await client.create(s.treinamento, draftPayload(draft)))
    },
    async excluir(id) {
      await client.remove((await entitySets()).treinamento, id)
    },
    async salvarAnexos(id, anexos) {
      await client.update((await entitySets()).treinamento, id, { cr40f_anexosjson: JSON.stringify(anexos) })
    },
    async publicar(treinamento, alvos) {
      const s = await entitySets()
      const jaTem = new Set((await participacoes(treinamento.id)).map((p) => p.funcionarioId))
      const novos = alvos.filter((f) => !jaTem.has(cleanId(f.id)))
      // Em lotes paralelos: dezenas de motoristas sem N round-trips em série.
      for (const lote of chunk(novos, 5)) await Promise.all(lote.map((f) => client.create(s.participacao, participacaoPayload(s, treinamento, f))))
      await client.update(s.treinamento, treinamento.id, { cr40f_estado: ESTADO.publicado, cr40f_publicadoem: new Date().toISOString() })
    },
    async enviarAnexo(treinamentoId, file, existentes) {
      const nome = uniqueName(sanitizeFileName(file.name), existentes.map((a) => a.nome))
      const doc = await sharepoint.enviar(cleanId(treinamentoId), file, nome)
      return { nome, caminho: doc.caminho || doc.id, tamanho: file.size, mime: file.type || 'application/octet-stream' }
    },
    excluirAnexo: (treinamentoId, anexo) => sharepoint.excluir(cleanId(treinamentoId), documentoDoAnexo(anexo)),
    abrirAnexo: (anexo) => sharepoint.abrir(documentoDoAnexo(anexo)),
  }
}
