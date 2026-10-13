// data/source.ts
import { cleanId, getHostXrm, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { getDataverseEnvironmentLabel } from '../../funcionarios/data/dataverse'
import { todaySP } from '../../funcionarios/data/dates'
import { createSharePointDocs } from '../../funcionarios/data/sharepoint'
import type { XrmHost } from '../../funcionarios/data/xrm'
import { SITUACAO_CODE } from '../domain/codes'
import { RAIZ, subpastaDoc } from '../domain/nomes'
import type { Arquivo, Categoria, DocEmitido, DocsData } from '../domain/types'
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
  salvarTipo(tipo: TipoInput, id?: string): Promise<string>
  adicionarDestinatario(categoria: Categoria, funcionarioId: string, nome: string): Promise<string>
  removerDestinatario(id: string): Promise<void>
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const codigoDoTipo = (data: DocsData, tipoId: string) => data.tipos.find((t) => t.id === tipoId)?.codigo ?? 'OUTROS'

export function createMockDocsSource(hoje = todaySP()): DocsSource {
  const data = createMockData(hoje)
  const arquivos = new Map<string, Arquivo[]>()
  const blobs = new Map<string, Blob>()
  let seq = 0
  const novoId = () => `m-${++seq}`
  const guardar = (doc: DocEmitido, file: File, nome: string): Arquivo => {
    const arq: Arquivo = { id: novoId(), nome, caminho: `${doc.pasta}/${nome}`, tamanho: file.size, modificadoEm: new Date().toISOString(), mimeType: file.type || null }
    arquivos.set(doc.id, [arq, ...(arquivos.get(doc.id) ?? [])])
    blobs.set(arq.id, file)
    return arq
  }
  return {
    mock: true,
    async carregar() { await wait(250); return structuredClone(data) },
    async arquivos(doc) { await wait(150); return [...(arquivos.get(doc.id) ?? [])] },
    async abrirArquivo(arq) { return { nome: arq.nome, blob: blobs.get(arq.id) ?? new Blob([]) } },
    async salvarDocumento(input) {
      await wait(300)
      return salvarDocumento({
        envLabel: 'DEV',
        async criar(novo) {
          const id = novoId()
          data.docs.push({ id, tipoId: novo.tipoId, donoId: novo.donoId, categoria: novo.categoria, numero: novo.numero, emissao: novo.emissao, validade: novo.validade, situacao: 'vigente', pasta: novo.pasta, observacao: novo.observacao, ultimoMarco: null, modificadoEm: new Date().toISOString() })
          return id
        },
        async enviar(doc, file, nome) { return guardar(doc, file, nome) },
        async substituir(id) { const d = data.docs.find((x) => x.id === id); if (d) d.situacao = 'substituido' },
        async dualWrite() { /* sem ficha no mock */ },
      }, input)
    },
    async enviarArquivo(doc, file) { await wait(200); return guardar(doc, file, file.name) },
    async salvarTipo(tipo, id) {
      await wait(200)
      if (id) { Object.assign(data.tipos.find((x) => x.id === id) ?? {}, tipo); return id }
      const novo = novoId(); data.tipos.push({ ...tipo, id: novo, ativo: true }); return novo
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

  const enviar = async (doc: DocEmitido, file: File, nome: string) => {
    const codigo = cache ? codigoDoTipo(cache, doc.tipoId) : doc.pasta.split('/').pop() ?? 'OUTROS'
    return sp[doc.categoria].enviar(doc.donoId, file, nome, subpastaDoc(codigo))
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
    async arquivos(doc) {
      const codigo = cache ? codigoDoTipo(cache, doc.tipoId) : 'OUTROS'
      return sp[doc.categoria].listar(doc.donoId, subpastaDoc(codigo))
    },
    abrirArquivo: (arq) => sp.pessoas.abrir(arq),
    async salvarDocumento(input) {
      const s = await entitySets()
      return salvarDocumento({
        envLabel,
        criar: async (novo) => cleanId(await host.client.create(s.documento, docPayload(novo, s))),
        enviar,
        substituir: (id) => host.client.update(s.documento, id, { cr40f_situacao: SITUACAO_CODE.substituido } as Row),
        dualWrite: (funcionarioId, payload) => host.client.update(s.funcionario, funcionarioId, payload as Row),
      }, input)
    },
    enviarArquivo: (doc, file) => enviar(doc, file, file.name),
    async salvarTipo(tipo, id) {
      const s = await entitySets()
      if (id) { await host.client.update(s.tipo, id, tipoPayload(tipo)); return id }
      return cleanId(await host.client.create(s.tipo, tipoPayload(tipo)))
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
