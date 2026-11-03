import { chunk, cleanId, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { getDataverseEnvironmentLabel } from '../../funcionarios/data/dataverse'
import { createSharePointDocs, sanitizeFileName, uniqueName, type EnvVarApi } from '../../funcionarios/data/sharepoint'
import { ESTADO, PUSH, anexoDaPasta, draftPayload, edicaoPublicadoPayload, isConcluida, isOrfa, isPublicado, mapFuncionario, mapParticipacao, mapTreinamento, validarComConteudo, validarRascunho, type Anexo, type Funcionario, type Participacao, type Treinamento } from '../domain/treinamentos'
import type { Linha } from '../domain/lista'
import { contarProgresso, type ProgressoConta } from '../domain/tabela'
import { createMockSource } from './mock'

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  treinamentos: () => Promise<Linha[]>
  /** Funcionários ativos e desligados (o painel mostra quem saiu depois de publicado). */
  funcionarios: () => Promise<Funcionario[]>
  participacoes: (treinamentoId: string) => Promise<Participacao[]>
  /** Conclusões por treinamento (uma consulta leve, só id do treinamento e `concluidoem`) para o progresso da lista. */
  progresso: () => Promise<Record<string, ProgressoConta>>
  /** Cria ou atualiza o rascunho; devolve o id. */
  salvar: (draft: Treinamento) => Promise<string>
  /** Publicado: grava conteúdo, anexos e validade (+ editadoem). Quiz, assinatura e público não mudam; participações intactas. */
  salvarPublicado: (item: Treinamento) => Promise<void>
  excluir: (id: string) => Promise<void>
  /** Grava só a lista de anexos (o arquivo já está no SharePoint); vale para rascunho e publicado. No publicado (`publicado = true`) carimba também `editadoem`. */
  salvarAnexos: (id: string, anexos: Anexo[], publicado?: boolean) => Promise<void>
  /** Cria as participações que faltam para `alvos`, remove as órfãs de uma tentativa anterior e marca como publicado. Repetir não duplica. */
  publicar: (treinamento: Treinamento, alvos: Pick<Funcionario, 'id' | 'nome'>[]) => Promise<void>
  /** Arquivo vai para o SharePoint (`Treinamentos/<id>`); a lista de anexos é gravada pelo `salvar`. */
  enviarAnexo: (treinamentoId: string, file: File, existentes: Anexo[]) => Promise<Anexo>
  excluirAnexo: (treinamentoId: string, anexo: Anexo) => Promise<void>
  abrirAnexo: (anexo: Anexo) => Promise<{ nome: string; blob: Blob }>
  /** Custom API cr40f_LembrarTreinamento: reenfileira o push dos pendentes (ou de uma participação), no máximo 1 a cada 24 h. */
  lembrar: (treinamentoId: string, participacaoId?: string) => Promise<{ enfileirados: number; ignorados: number }>
}

export const ANEXO_ROOT = 'Treinamentos'
const ENTITIES = { treinamento: 'cr40f_treinamento', participacao: 'cr40f_treinamentoparticipacao', funcionario: 'cr40f_funcionarios' } as const
type Sets = Record<keyof typeof ENTITIES, string>

const TREINAMENTO_SELECT = 'cr40f_treinamentoid,cr40f_name,cr40f_descricao,cr40f_conteudo,cr40f_videourl,cr40f_anexosjson,cr40f_publicotipo,cr40f_publicojson,cr40f_exigeassinatura,cr40f_exigequiz,cr40f_notaminima,cr40f_quizjson,cr40f_validade,cr40f_estado,cr40f_publicadoem,cr40f_editadoem,createdon'
const PARTICIPACAO_SELECT = 'cr40f_treinamentoparticipacaoid,_cr40f_treinamento_value,_cr40f_funcionario_value,cr40f_abertoem,cr40f_confirmadoem,cr40f_assinadoem,cr40f_nomeassinante,cr40f_assinaturajson,cr40f_nota,cr40f_aprovado,cr40f_tentativas,cr40f_concluidoem,cr40f_pushstatus,cr40f_pusherro,cr40f_lembradoem,cr40f_conteudosnapshot,cr40f_conteudohash'
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
    async progresso() {
      const s = await entitySets()
      const rows = await client.getAll(`${s.participacao}?$select=_cr40f_treinamento_value,cr40f_concluidoem`)
      return contarProgresso(rows.map((r) => ({ treinamentoId: cleanId(String(r._cr40f_treinamento_value ?? '')), concluida: Boolean(r.cr40f_concluidoem) })))
    },
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
    async salvarPublicado(item) {
      const error = validarComConteudo(item)
      if (error) throw new Error(error)
      const s = await entitySets()
      const [atual] = await client.getAll(`${s.treinamento}?$select=cr40f_estado&$filter=cr40f_treinamentoid eq ${cleanId(item.id)}`)
      if (!atual || Number(atual.cr40f_estado) !== ESTADO.publicado) throw new Error('Este treinamento não está publicado. Atualize a lista.')
      await client.update(s.treinamento, item.id, edicaoPublicadoPayload(item))
    },
    async excluir(id) {
      await client.remove((await entitySets()).treinamento, id)
    },
    async salvarAnexos(id, anexos, publicado = false) {
      await client.update((await entitySets()).treinamento, id, { cr40f_anexosjson: JSON.stringify(anexos), ...(publicado ? { cr40f_editadoem: new Date().toISOString() } : {}) })
    },
    async publicar(treinamento, alvos) {
      const s = await entitySets()
      const existentes = await participacoes(treinamento.id)
      const jaTem = new Set(existentes.map((p) => p.funcionarioId))
      const alvoIds = new Set(alvos.map((f) => cleanId(f.id)))
      const novos = alvos.filter((f) => !jaTem.has(cleanId(f.id)))
      for (const lote of chunk(existentes.filter((p) => isOrfa(p, alvoIds)), 5)) await Promise.all(lote.map((p) => client.remove(s.participacao, p.id)))
      // Em lotes paralelos: dezenas de motoristas sem N round-trips em série.
      const criadas: string[] = []
      for (const lote of chunk(novos, 5)) criadas.push(...await Promise.all(lote.map((f) => client.create(s.participacao, participacaoPayload(s, treinamento, f)))))
      await client.update(s.treinamento, treinamento.id, { cr40f_estado: ESTADO.publicado, cr40f_publicadoem: new Date().toISOString() })
      // O flow Push Treinamentos observa Pendente. Só depois de publicar: se o PATCH falhar, ninguém recebe push de treinamento em rascunho.
      // Participação sem status vinda de uma publicação interrompida também entra (a nova tentativa chega aqui).
      const semPush = existentes.filter((p) => p.pushStatus == null && !isConcluida(p) && alvoIds.has(p.funcionarioId)).map((p) => p.id)
      for (const lote of chunk([...criadas, ...semPush], 5)) await Promise.all(lote.map((id) => client.update(s.participacao, id, { cr40f_pushstatus: PUSH.pendente })))
    },
    async enviarAnexo(treinamentoId, file, existentes) {
      const nome = uniqueName(sanitizeFileName(file.name), existentes.map((a) => a.nome))
      const doc = await sharepoint.enviar(cleanId(treinamentoId), file, nome)
      return { nome, caminho: doc.caminho || doc.id, tamanho: file.size, mime: file.type || 'application/octet-stream' }
    },
    async excluirAnexo(treinamentoId, anexo) {
      // A cópia de reciclagem herda arquivos do original: tira da lista sem apagar o arquivo do outro treinamento.
      if (!anexoDaPasta(anexo, treinamentoId)) return
      await sharepoint.excluir(cleanId(treinamentoId), documentoDoAnexo(anexo))
    },
    abrirAnexo: (anexo) => sharepoint.abrir(documentoDoAnexo(anexo)),
    async lembrar(treinamentoId, participacaoId) {
      const body: Record<string, string> = { cr40f_TreinamentoId: cleanId(treinamentoId) }
      if (participacaoId) body.cr40f_ParticipacaoId = cleanId(participacaoId)
      const out = await client.request<{ cr40f_Enfileirados?: number; cr40f_Ignorados?: number }>('cr40f_LembrarTreinamento', { method: 'POST', body: JSON.stringify(body) })
      return { enfileirados: Number(out?.cr40f_Enfileirados ?? 0), ignorados: Number(out?.cr40f_Ignorados ?? 0) }
    },
  }
}
