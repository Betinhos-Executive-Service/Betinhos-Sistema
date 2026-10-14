import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Host } from '../../../host'
import type { DocEmitido, Dono, TipoDoc } from '../domain/types'
import { ENTITIES } from './queries'
import { codigoDoDoc, createDocsSource, createMockDocsSource, DOCUMENTOS_ALTERADOS } from './source'

afterEach(() => { vi.unstubAllGlobals() })

describe('createMockDocsSource', () => {
  it('renovar troca o vigente e mantém o histórico', async () => {
    const source = createMockDocsSource('2026-10-13')
    const antes = await source.carregar()
    const cnh = antes.tipos.find((t) => t.codigo === 'CNH')!
    const ana = antes.donos.find((d) => d.nome === 'Ana')!
    const anterior = antes.docs.find((d) => d.donoId === ana.id && d.tipoId === cnh.id && d.situacao === 'vigente')!
    const r = await source.salvarDocumento({ tipo: cnh, dono: ana, anterior, numero: '9', emissao: '2026-10-13', validade: '2031-10-13', observacao: '', arquivos: [new File(['x'], 'cnh.pdf')] })
    expect(r.enviados).toHaveLength(1)
    const depois = await source.carregar()
    const daAna = depois.docs.filter((d) => d.donoId === ana.id && d.tipoId === cnh.id)
    expect(daAna.filter((d) => d.situacao === 'vigente').map((d) => d.validade)).toEqual(['2031-10-13'])
    expect(daAna.filter((d) => d.situacao === 'substituido')).toHaveLength(2)
    expect(await source.arquivos(r.doc)).toHaveLength(1)
  })

  it('destinatários: adicionar e remover', async () => {
    const source = createMockDocsSource('2026-10-13')
    const novo = await source.adicionarDestinatario('frota', 'f-bruno', 'Bruno')
    expect((await source.carregar()).destinatarios.map((d) => d.nome)).toContain('Bruno')
    await source.removerDestinatario(novo)
    expect((await source.carregar()).destinatarios.map((d) => d.nome)).not.toContain('Bruno')
  })

  it('enviarArquivo nomeia como o salvarDocumento (código_validade_original, sanitizado)', async () => {
    const source = createMockDocsSource('2026-10-13')
    const data = await source.carregar()
    const cnh = data.tipos.find((t) => t.codigo === 'CNH')!
    const bruno = data.donos.find((d) => d.nome === 'Bruno')!
    const doc = data.docs.find((d) => d.donoId === bruno.id && d.tipoId === cnh.id)!
    const arq = await source.enviarArquivo(doc, new File(['x'], 'frente/verso.pdf'))
    expect(arq.nome).toBe(`CNH_${doc.validade}_frente_verso.pdf`)
    expect((await source.arquivos(doc)).map((a) => a.nome)).toEqual([arq.nome])
  })
})

describe('excluirArquivo', () => {
  it('mock: remove o arquivo da pasta e avisa o menu', async () => {
    const dispatchEvent = vi.fn((_: Event) => true)
    vi.stubGlobal('window', { dispatchEvent })
    const source = createMockDocsSource('2026-10-13')
    const data = await source.carregar()
    const cnh = data.tipos.find((t) => t.codigo === 'CNH')!
    const bruno = data.donos.find((d) => d.nome === 'Bruno')!
    const doc = data.docs.find((d) => d.donoId === bruno.id && d.tipoId === cnh.id)!
    const a = await source.enviarArquivo(doc, new File(['a'], 'a.pdf'))
    const b = await source.enviarArquivo(doc, new File(['b'], 'b.pdf'))
    dispatchEvent.mockClear()
    await source.excluirArquivo(doc, a)
    expect((await source.arquivos(doc)).map((x) => x.nome)).toEqual([b.nome])
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    expect(dispatchEvent.mock.calls[0][0].type).toBe(DOCUMENTOS_ALTERADOS)
  })
})

describe('createMockDocsSource: arquivos do vigente', () => {
  it('lista só os arquivos com o prefixo do vigente; versões antigas na mesma pasta ficam de fora', async () => {
    const source = createMockDocsSource('2026-10-13')
    const data = await source.carregar()
    const cnh = data.tipos.find((t) => t.codigo === 'CNH')!
    const ana = data.donos.find((d) => d.nome === 'Ana')!
    const anterior = data.docs.find((d) => d.donoId === ana.id && d.tipoId === cnh.id && d.situacao === 'vigente')!
    const velho = await source.enviarArquivo(anterior, new File(['v'], 'antiga.pdf'))
    expect((await source.arquivos(anterior)).map((a) => a.nome)).toEqual([velho.nome])
    const r = await source.salvarDocumento({ tipo: cnh, dono: ana, anterior, numero: '', emissao: null, validade: '2031-10-13', observacao: '', arquivos: [new File(['n'], 'nova.pdf')] })
    expect((await source.arquivos(r.doc)).map((a) => a.nome)).toEqual(['CNH_2031-10-13_nova.pdf'])
  })
})

/** Host do Dataverse falso: metadata, Web API e o flow do SharePoint respondem em memória. */
function hostFalso(behaviors: Record<string, string>, arquivos: { nomeArquivo: string }[] = []) {
  const update = vi.fn(async () => undefined)
  const request = vi.fn(async (path: string) => {
    if (path.includes("EntityDefinitions(LogicalName='cr40f_funcionarios')/Attributes/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata")) {
      return { value: Object.entries(behaviors).map(([LogicalName, Value]) => ({ LogicalName, DateTimeBehavior: { Value } })) }
    }
    throw new Error(`request inesperado: ${path}`)
  })
  const client = { apiUrl: 'https://org23b93544.crm2.dynamics.com/api/data/v9.2', request, getAll: vi.fn(async () => []), create: vi.fn(async () => '{D-NOVO}'), update, remove: vi.fn() }
  const sets = new Map(Object.values(ENTITIES).map((n) => [n, { logicalName: n, entitySetName: `${n}s`, label: n }]))
  const host = { mode: 'dataverse', clientUrl: 'https://org23b93544.crm2.dynamics.com', client, metadata: { entities: async () => sets }, insideModelDriven: false, appId: async () => undefined } as unknown as Host
  const dispatchEvent = vi.fn((_: Event) => true)
  const webApi = {
    retrieveMultipleRecords: async (entity: string) => (entity === 'environmentvariabledefinition'
      ? { entities: [{ environmentvariabledefinitionid: 'ev-1', defaultvalue: 'https://flow.exemplo/listar' }] }
      : { entities: [] }),
  }
  vi.stubGlobal('window', { Xrm: { WebApi: webApi }, dispatchEvent })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ sucesso: true, arquivos }) })))
  return { host, update, request, dispatchEvent }
}

const TIPO = (codigo: string, extra: Partial<TipoDoc> = {}): TipoDoc => ({ id: `t-${codigo}`, codigo, nome: codigo, categoria: 'pessoas', temValidade: true, validadePadraoMeses: null, obrigatorioPara: [], ordem: 1, ativo: true, ...extra })
const ANA: Dono = { id: 'f-ana', categoria: 'pessoas', nome: 'Ana', detalhe: 'Motorista', obrigKey: 100000000, ativo: true, email: '' }
const DOC = (extra: Partial<DocEmitido>): DocEmitido => ({ id: 'd-1', tipoId: 't-CNH', donoId: 'f-ana', categoria: 'pessoas', numero: '', emissao: null, validade: '2031-05-10', situacao: 'vigente', pasta: 'Funcionarios/DEV/f-ana/Documentos/CNH', observacao: '', ultimoMarco: null, modificadoEm: null, ...extra })

describe('createDocsSource (Dataverse)', () => {
  it('dual-write grava as datas da ficha no formato do DateTimeBehavior lido da metadata', async () => {
    const { host, update, request } = hostFalso({ cr40f_validadedacnh: 'UserLocal', cr40f_datadoaso: 'DateOnly' })
    const source = createDocsSource(host)
    await source.salvarDocumento({ tipo: TIPO('CNH'), dono: ANA, anterior: null, numero: '', emissao: null, validade: '2031-10-13', observacao: '', arquivos: [] })
    await source.salvarDocumento({ tipo: TIPO('ASO', { validadePadraoMeses: 12 }), dono: ANA, anterior: null, numero: '', emissao: '2026-10-10', validade: '2027-10-10', observacao: '', arquivos: [] })
    expect(update).toHaveBeenCalledWith('cr40f_funcionarioss', 'f-ana', { cr40f_validadedacnh: '2031-10-13T03:00:00Z' })
    expect(update).toHaveBeenCalledWith('cr40f_funcionarioss', 'f-ana', { cr40f_datadoaso: '2026-10-10' })
    expect(request.mock.calls.filter(([p]) => String(p).includes('DateTimeAttributeMetadata'))).toHaveLength(1)
  })

  it('metadata indisponível: o documento fica salvo e a ficha vira aviso, sem chutar o formato', async () => {
    const { host, update, request } = hostFalso({})
    request.mockRejectedValueOnce(new Error('Metadata indisponível (500)'))
    const r = await createDocsSource(host).salvarDocumento({ tipo: TIPO('CNH'), dono: ANA, anterior: null, numero: '', emissao: null, validade: '2031-10-13', observacao: '', arquivos: [] })
    expect(r.doc.id).toBe('d-novo')
    expect(r.avisos).toEqual(['A ficha do funcionário não foi atualizada: Metadata indisponível (500)'])
    expect(update).not.toHaveBeenCalled()
  })

  it('arquivos do vigente: filtra pelo prefixo código_data_ e ignora versões antigas da pasta', async () => {
    const { host } = hostFalso({}, [{ nomeArquivo: 'CNH_2031-05-10_frente.pdf' }, { nomeArquivo: 'CNH_2026-05-10_frente.pdf' }, { nomeArquivo: 'outro.pdf' }])
    const source = createDocsSource(host)
    expect((await source.arquivos(DOC({}))).map((a) => a.nome)).toEqual(['CNH_2031-05-10_frente.pdf'])
  })

  it('arquivos de documento sem validade usam a emissão e, sem datas, sem-data', async () => {
    const { host } = hostFalso({}, [{ nomeArquivo: 'RG_2020-01-02_rg.pdf' }, { nomeArquivo: 'RG_sem-data_rg.pdf' }])
    const source = createDocsSource(host)
    const rg = { pasta: 'Funcionarios/DEV/f-ana/Documentos/RG', tipoId: 't-RG', validade: null }
    expect((await source.arquivos(DOC({ ...rg, emissao: '2020-01-02' }))).map((a) => a.nome)).toEqual(['RG_2020-01-02_rg.pdf'])
    expect((await source.arquivos(DOC({ ...rg, emissao: null }))).map((a) => a.nome)).toEqual(['RG_sem-data_rg.pdf'])
  })

  it('avisa o menu (documentos:alterados) depois de salvar documento e tipo', async () => {
    const { host, dispatchEvent } = hostFalso({ cr40f_validadedacnh: 'DateOnly' })
    const source = createDocsSource(host)
    await source.salvarDocumento({ tipo: TIPO('CNH'), dono: ANA, anterior: null, numero: '', emissao: null, validade: '2031-10-13', observacao: '', arquivos: [] })
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    expect(dispatchEvent.mock.calls[0][0].type).toBe(DOCUMENTOS_ALTERADOS)
    await source.salvarTipo({ codigo: 'X', nome: 'X', categoria: 'pessoas', temValidade: false, validadePadraoMeses: null, obrigatorioPara: [], ordem: 1 })
    expect(dispatchEvent).toHaveBeenCalledTimes(2)
  })
})

describe('createDocsSource (Dataverse): excluirArquivo', () => {
  it('chama o flow de exclusão do SharePoint com o dono e o arquivo e avisa o menu', async () => {
    const { host, dispatchEvent } = hostFalso({})
    const source = createDocsSource(host)
    const arq = { id: 'sp-1', nome: 'CNH_2031-05-10_frente.pdf', caminho: 'Funcionarios/DEV/f-ana/Documentos/CNH/CNH_2031-05-10_frente.pdf', tamanho: 1, modificadoEm: null, mimeType: null }
    await source.excluirArquivo(DOC({}), arq)
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const corpo = JSON.parse(String((fetchMock.mock.calls.at(-1)![1] as RequestInit).body))
    expect(corpo).toMatchObject({ fileLocator: 'sp-1', caminhoSharePoint: arq.caminho, nomeArquivo: arq.nome, tarefaId: 'f-ana' })
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    expect(dispatchEvent.mock.calls[0][0].type).toBe(DOCUMENTOS_ALTERADOS)
  })
})

describe('createMockDocsSource: aviso ao menu', () => {
  it('dispara documentos:alterados ao salvar documento, enviar arquivo e salvar tipo; falha não dispara', async () => {
    const dispatchEvent = vi.fn((_: Event) => true)
    vi.stubGlobal('window', { dispatchEvent })
    const source = createMockDocsSource('2026-10-13')
    const data = await source.carregar()
    const cnh = data.tipos.find((t) => t.codigo === 'CNH')!
    const ana = data.donos.find((d) => d.nome === 'Ana')!
    const r = await source.salvarDocumento({ tipo: cnh, dono: ana, anterior: null, numero: '', emissao: null, validade: '2031-10-13', observacao: '', arquivos: [] })
    await source.enviarArquivo(r.doc, new File(['x'], 'a.pdf'))
    await source.salvarTipo({ codigo: 'Y', nome: 'Y', categoria: 'pessoas', temValidade: false, validadePadraoMeses: null, obrigatorioPara: [], ordem: 9 })
    expect(dispatchEvent).toHaveBeenCalledTimes(3)
    await expect(source.enviarArquivo({ ...r.doc, pasta: '', tipoId: 'inexistente' }, new File(['x'], 'b.pdf'))).rejects.toThrow()
    expect(dispatchEvent).toHaveBeenCalledTimes(3)
  })
})

describe('codigoDoDoc', () => {
  const tipos = [{ id: 't1', codigo: 'ASO' }]
  it('usa o último trecho da pasta quando existe', () => {
    expect(codigoDoDoc({ pasta: 'Funcionarios/DEV/ana/Documentos/CNH', tipoId: 't1' }, tipos)).toBe('CNH')
  })
  it('sem pasta, usa o código do tipo na lista carregada', () => {
    expect(codigoDoDoc({ pasta: '', tipoId: 't1' }, tipos)).toBe('ASO')
  })
  it('sem pasta e sem tipo conhecido, falha com mensagem clara', () => {
    expect(() => codigoDoDoc({ pasta: '', tipoId: 'x' }, tipos)).toThrow('Não foi possível identificar a pasta do documento')
    expect(() => codigoDoDoc({ pasta: '', tipoId: 't1' }, null)).toThrow('Não foi possível identificar a pasta do documento')
  })
})
