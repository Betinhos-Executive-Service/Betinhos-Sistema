// data/source.ts
import { cleanId, getHostXrm, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { getDataverseEnvironmentLabel } from '../../funcionarios/data/dataverse'
import { toDataverseDate, todaySP } from '../../funcionarios/data/dates'
import { dateBehaviorsPath, toDateBehaviors, type DateBehavior, type DateBehaviorsResponse } from '../../funcionarios/data/patch'
import { createSharePointDocs } from '../../funcionarios/data/sharepoint'
import type { XrmHost } from '../../funcionarios/data/xrm'
import { SITUACAO_CODE } from '../domain/codes'
import { nomeArquivo, prefixoArquivo, RAIZ, subpastaDoc } from '../domain/nomes'
import type { Arquivo, Categoria, DocEmitido, DocsData, TipoDoc } from '../domain/types'
import { createMockData } from './mock'
import {
  ENTITIES, destinatarioPayload, destinatariosPath, docPayload, documentosPath, funcionariosPath, mapDestinatario, mapDoc,
  mapFuncionarioDono, mapTipo, mapVeiculoDono, tipoPayload, tiposPath, veiculosPath, type EntitySets, type TipoInput,
} from './queries'
import { salvarDocumento, type SalvarDocInput, type SalvarDocResult } from './salvar'

export type DocsSource = {
  mock: boolean
  carregar(): Promise<DocsData>
  arquivos(doc: DocEmitido): Promise<Arquivo[]>
  abrirArquivo(arq: Arquivo): Promise<{ nome: string; blob: Blob }>
  salvarDocumento(input: SalvarDocInput): Promise<SalvarDocResult>
  enviarArquivo(doc: DocEmitido, file: File): Promise<Arquivo>
  excluirArquivo(doc: DocEmitido, arq: Arquivo): Promise<void>
  salvarTipo(tipo: TipoInput, id?: string): Promise<string>
  adicionarDestinatario(categoria: Categoria, funcionarioId: string, nome: string): Promise<string>
  removerDestinatario(id: string): Promise<void>
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Evento que o badge de "Documentos" no menu escuta para recarregar depois de um salvamento. */
export const DOCUMENTOS_ALTERADOS = 'documentos:alterados'
const avisarAlteracao = () => { if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new CustomEvent(DOCUMENTOS_ALTERADOS)) }
/** Só avisa o menu quando a gravação deu certo. */
const comAviso = async <T>(gravar: Promise<T>): Promise<T> => { const r = await gravar; avisarAlteracao(); return r }

/** Arquivos da versão vigente: a pasta do tipo guarda também as versões antigas, separadas pelo prefixo `código_data_`. */
export const doVigente = (doc: Pick<DocEmitido, 'validade' | 'emissao'>, codigo: string, lista: Arquivo[]) => {
  const prefixo = prefixoArquivo(codigo, doc.validade ?? doc.emissao)
  return lista.filter((a) => a.nome.startsWith(prefixo))
}

/** Código do tipo do documento: último trecho da pasta; sem pasta, o código do tipo na lista carregada. */
export function codigoDoDoc(doc: Pick<DocEmitido, 'pasta' | 'tipoId'>, tipos: Pick<TipoDoc, 'id' | 'codigo'>[] | null): string {
  const daPasta = doc.pasta.split('/').filter(Boolean).pop()
  if (daPasta) return daPasta
  const doTipo = tipos?.find((t) => t.id === doc.tipoId)?.codigo
  if (doTipo) return doTipo
  throw new Error('Não foi possível identificar a pasta do documento. Recarregue a lista e tente de novo.')
}

export function createMockDocsSource(hoje = todaySP()): DocsSource {
  const data = createMockData(hoje)
  const arquivos = new Map<string, Arquivo[]>()
  const blobs = new Map<string, Blob>()
  let seq = 0
  const novoId = () => `m-${++seq}`
  // Como no SharePoint: uma pasta por dono + tipo, com todas as versões juntas.
  const pastaDe = (doc: DocEmitido) => `${doc.donoId}/${codigoDoDoc(doc, data.tipos)}`
  const guardar = (doc: DocEmitido, file: File, nome: string): Arquivo => {
    const arq: Arquivo = { id: novoId(), nome, caminho: `${doc.pasta}/${nome}`, tamanho: file.size, modificadoEm: new Date().toISOString(), mimeType: file.type || null }
    arquivos.set(pastaDe(doc), [arq, ...(arquivos.get(pastaDe(doc)) ?? [])])
    blobs.set(arq.id, file)
    return arq
  }
  return {
    mock: true,
    async carregar() { await wait(250); return structuredClone(data) },
    async arquivos(doc) { await wait(150); return doVigente(doc, codigoDoDoc(doc, data.tipos), arquivos.get(pastaDe(doc)) ?? []) },
    async abrirArquivo(arq) { return { nome: arq.nome, blob: blobs.get(arq.id) ?? new Blob([]) } },
    async salvarDocumento(input) {
      await wait(300)
      return comAviso(salvarDocumento({
        envLabel: 'DEV',
        async criar(novo) {
          const id = novoId()
          data.docs.push({ id, tipoId: novo.tipoId, donoId: novo.donoId, categoria: novo.categoria, numero: novo.numero, emissao: novo.emissao, validade: novo.validade, situacao: 'vigente', pasta: novo.pasta, observacao: novo.observacao, ultimoMarco: null, modificadoEm: new Date().toISOString() })
          return id
        },
        async enviar(doc, file, nome) { return guardar(doc, file, nome) },
        async substituir(id) { const d = data.docs.find((x) => x.id === id); if (d) d.situacao = 'substituido' },
        async dualWrite() { /* sem ficha no mock */ },
      }, input))
    },
    async enviarArquivo(doc, file) {
      await wait(200)
      const arq = guardar(doc, file, nomeArquivo(codigoDoDoc(doc, data.tipos), doc.validade ?? doc.emissao, file.name))
      avisarAlteracao()
      return arq
    },
    async excluirArquivo(doc, arq) {
      await wait(150)
      arquivos.set(pastaDe(doc), (arquivos.get(pastaDe(doc)) ?? []).filter((a) => a.id !== arq.id))
      blobs.delete(arq.id)
      avisarAlteracao()
    },
    async salvarTipo(tipo, id) {
      await wait(200)
      if (id) { Object.assign(data.tipos.find((x) => x.id === id) ?? {}, tipo); avisarAlteracao(); return id }
      const novo = novoId(); data.tipos.push({ ...tipo, id: novo, ativo: true }); avisarAlteracao(); return novo
    },
    async adicionarDestinatario(categoria, funcionarioId, nome) { await wait(150); const id = novoId(); data.destinatarios.push({ id, categoria, funcionarioId, nome }); return id },
    async removerDestinatario(id) { await wait(150); data.destinatarios = data.destinatarios.filter((d) => d.id !== id) },
  }
}

export function createDocsSource(host: Host): DocsSource {
  if (host.mode === 'mock') return createMockDocsSource()
  const xrm = (getHostXrm() ?? window.Xrm) as XrmHost | undefined
  if (!xrm?.WebApi) throw new Error('A API do Dataverse não está disponível nesta janela')
  const envLabel = getDataverseEnvironmentLabel(host.clientUrl)
  const sp = { pessoas: createSharePointDocs(xrm.WebApi, envLabel, RAIZ.pessoas), frota: createSharePointDocs(xrm.WebApi, envLabel, RAIZ.frota) }
  let cache: DocsData | null = null

  let sets: Promise<EntitySets> | null = null
  const entitySets = () => (sets ??= host.metadata.entities(Object.values(ENTITIES)).then((info) => {
    const get = (name: string) => {
      const value = info.get(name)?.entitySetName
      if (!value) throw new Error(`Tabela ${name} não encontrada na metadata. Rode packages/deploy/provision-documentos.ps1 neste ambiente.`)
      return value
    }
    return { tipo: get(ENTITIES.tipo), documento: get(ENTITIES.documento), destinatario: get(ENTITIES.destinatario), funcionario: get(ENTITIES.funcionario), veiculo: get(ENTITIES.veiculo) }
  }).catch((error) => { sets = null; throw error }))

  const subpasta = (doc: DocEmitido) => subpastaDoc(codigoDoDoc(doc, cache?.tipos ?? null))
  const enviar = async (doc: DocEmitido, file: File, nome: string) => sp[doc.categoria].enviar(doc.donoId, file, nome, subpasta(doc))

  // Mesmo mecanismo de Funcionários: o formato das datas da ficha vem do DateTimeBehavior da metadata, nunca chutado.
  let behaviors: Promise<Record<string, DateBehavior>> | null = null
  const dateBehaviors = () => (behaviors ??= host.client.request<DateBehaviorsResponse>(dateBehaviorsPath(ENTITIES.funcionario)).then(toDateBehaviors)
    .catch((error) => { behaviors = null; throw error }))
  const dualWrite = async (funcionarioId: string, payload: Record<string, string | null>) => {
    const [s, b] = await Promise.all([entitySets(), dateBehaviors()])
    const datas = Object.fromEntries(Object.entries(payload).map(([campo, dia]) => [campo, toDataverseDate(dia, b[campo])]))
    await host.client.update(s.funcionario, funcionarioId, datas as Row)
  }

  return {
    mock: false,
    async carregar() {
      const s = await entitySets()
      const [tipos, docs, destinatarios, funcionarios, veiculos] = await Promise.all([
        host.client.getAll(tiposPath(s.tipo)), host.client.getAll(documentosPath(s.documento)), host.client.getAll(destinatariosPath(s.destinatario)),
        host.client.getAll(funcionariosPath(s.funcionario)), host.client.getAll(veiculosPath(s.veiculo)),
      ])
      cache = {
        tipos: tipos.map(mapTipo), docs: docs.map(mapDoc), destinatarios: destinatarios.map(mapDestinatario),
        donos: [...funcionarios.map(mapFuncionarioDono), ...veiculos.map(mapVeiculoDono)],
      }
      return cache
    },
    arquivos: async (doc) => doVigente(doc, codigoDoDoc(doc, cache?.tipos ?? null), await sp[doc.categoria].listar(doc.donoId, subpasta(doc))),
    abrirArquivo: (arq) => sp.pessoas.abrir(arq),
    async salvarDocumento(input) {
      const s = await entitySets()
      return comAviso(salvarDocumento({
        envLabel,
        criar: async (novo) => cleanId(await host.client.create(s.documento, docPayload(novo, s))),
        enviar,
        substituir: (id) => host.client.update(s.documento, id, { cr40f_situacao: SITUACAO_CODE.substituido } as Row),
        dualWrite,
      }, input))
    },
    enviarArquivo: async (doc, file) => comAviso(enviar(doc, file, nomeArquivo(codigoDoDoc(doc, cache?.tipos ?? null), doc.validade ?? doc.emissao, file.name))),
    excluirArquivo: (doc, arq) => comAviso(sp[doc.categoria].excluir(doc.donoId, arq)),
    async salvarTipo(tipo, id) {
      const s = await entitySets()
      if (id) { await comAviso(host.client.update(s.tipo, id, tipoPayload(tipo))); return id }
      return cleanId(await comAviso(host.client.create(s.tipo, tipoPayload(tipo))))
    },
    async adicionarDestinatario(categoria, funcionarioId, nome) {
      const s = await entitySets()
      return cleanId(await host.client.create(s.destinatario, destinatarioPayload(categoria, funcionarioId, nome, s)))
    },
    async removerDestinatario(id) {
      const s = await entitySets()
      await host.client.update(s.destinatario, id, { statecode: 1, statuscode: 2 })
    },
  }
}
