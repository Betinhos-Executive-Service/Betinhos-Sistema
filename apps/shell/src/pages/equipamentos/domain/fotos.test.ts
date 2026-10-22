// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ajustesAoExcluir, ajustesCapa, aplicarAjustes, arquivosColados, caminhoDaCapa, capaEfetiva, editavel, nasceCapa, nomeArquivoFoto, nomeFoto, ordenarFotos, validarFoto, type Foto } from './fotos'
import { iconeTipo } from './cadastros'
import { capasPath, fotoPayload, fotosPath, mapCapas, mapFoto } from '../data/queries'
import { createCacheImagens } from '../data/imagens'
import { createSource, documentoDaFoto } from '../data/source'
import type { Host } from '../../../host'

const foto = (id: string, dia: number, capa = false, over: Partial<Foto> = {}): Foto =>
  ({ id, equipamentoId: 'e1', nome: `${id}.jpg`, capa, criadoEm: new Date(Date.UTC(2026, 9, dia)), caminho: `Equipamentos/DEV/e1/${id}.jpg`, ...over })
const arquivo = (nome: string, type: string, size = 10) => {
  const f = new File(['x'], nome, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('capa das fotos', () => {
  it('a primeira foto do item vira capa; as seguintes não', () => {
    expect(nasceCapa([])).toBe(true)
    expect(nasceCapa([foto('a', 1, true)])).toBe(false)
  })

  it('ordem de envio: mais antiga primeiro; sem data vai para o fim', () => {
    expect(ordenarFotos([foto('c', 3), foto('x', 0, false, { criadoEm: null }), foto('a', 1), foto('b', 2)]).map((f) => f.id)).toEqual(['a', 'b', 'c', 'x'])
  })

  it('capa efetiva: a marcada; sem marcada, a mais antiga; com duas marcadas, a mais antiga delas', () => {
    expect(capaEfetiva([foto('a', 1), foto('b', 2, true)])?.id).toBe('b')
    expect(capaEfetiva([foto('b', 2), foto('a', 1)])?.id).toBe('a')
    expect(capaEfetiva([foto('c', 3, true), foto('b', 2, true), foto('a', 1)])?.id).toBe('b')
    expect(capaEfetiva([])).toBeNull()
  })

  it('definir como capa marca a nova antes de desmarcar a antiga e deixa só uma', () => {
    const fotos = [foto('a', 1, true), foto('b', 2), foto('c', 3)]
    const ajustes = ajustesCapa(fotos, 'b')
    expect(ajustes).toEqual([{ id: 'b', capa: true }, { id: 'a', capa: false }])
    expect(aplicarAjustes(fotos, ajustes).filter((f) => f.capa).map((f) => f.id)).toEqual(['b'])
  })

  it('definir a capa atual não grava nada; com duas marcadas, desmarca a sobra', () => {
    expect(ajustesCapa([foto('a', 1, true), foto('b', 2)], 'a')).toEqual([])
    expect(ajustesCapa([foto('a', 1, true), foto('b', 2, true)], 'a')).toEqual([{ id: 'b', capa: false }])
  })

  it('excluir a capa promove a mais antiga restante', () => {
    const fotos = [foto('c', 3), foto('a', 1, true), foto('b', 2)]
    expect(ajustesAoExcluir(fotos, 'a')).toEqual([{ id: 'b', capa: true }])
  })

  it('excluir outra foto não mexe na capa; excluir a última não deixa ajuste', () => {
    expect(ajustesAoExcluir([foto('a', 1, true), foto('b', 2)], 'b')).toEqual([])
    expect(ajustesAoExcluir([foto('a', 1, true)], 'a')).toEqual([])
  })

  it('excluir em item sem capa marcada marca a que a tela já mostrava como capa', () => {
    expect(ajustesAoExcluir([foto('a', 1), foto('b', 2), foto('c', 3)], 'c')).toEqual([{ id: 'a', capa: true }])
  })

  it('capa da lista: o caminho da capa marcada; sem marcada, ícone do tipo (null)', () => {
    expect(caminhoDaCapa([foto('a', 1), foto('b', 2, true)])).toBe('Equipamentos/DEV/e1/b.jpg')
    expect(caminhoDaCapa([foto('a', 1)])).toBeNull()
    expect(caminhoDaCapa([])).toBeNull()
  })
})

describe('arquivos de foto', () => {
  it('aceita PNG, JPG, GIF e BMP até 5 MB', () => {
    expect(validarFoto(arquivo('a.png', 'image/png'))).toBeNull()
    expect(validarFoto(arquivo('a.jpg', 'image/jpeg', 5 * 1024 * 1024))).toBeNull()
    expect(validarFoto(arquivo('a.pdf', 'application/pdf'))).toBe('Use PNG, JPG, GIF ou BMP.')
    expect(validarFoto(arquivo('a.webp', 'image/webp'))).toBe('Use PNG, JPG, GIF ou BMP.')
    expect(validarFoto(arquivo('a.png', 'image/png', 5 * 1024 * 1024 + 1))).toBe('A imagem deve ter até 5 MB.')
  })

  it('nome: mantém o do arquivo; imagem colada ganha data e hora', () => {
    const quando = new Date(2026, 9, 21, 9, 5, 7)
    expect(nomeFoto(arquivo('etiqueta.jpg', 'image/jpeg'), quando)).toBe('etiqueta.jpg')
    expect(nomeFoto(arquivo('image.png', 'image/png'), quando)).toBe('Foto colada 2026-10-21 09h05m07s.png')
    expect(nomeFoto(arquivo('', 'image/jpeg'), quando)).toBe('Foto colada 2026-10-21 09h05m07s.jpg')
    expect(nomeFoto(arquivo(`${'a'.repeat(250)}.png`, 'image/png'), quando)).toHaveLength(200)
  })

  it('nome no SharePoint: sem caracteres que o flow recusa e sem sobrescrever outra foto do item', () => {
    const quando = new Date(2026, 9, 21, 9, 5, 7)
    expect(nomeArquivoFoto(arquivo('frente/verso.jpg', 'image/jpeg'), [], quando)).toBe('frente_verso.jpg')
    expect(nomeArquivoFoto(arquivo('a.png', 'image/png'), ['A.png', 'a (2).png'], quando)).toBe('a (3).png')
    expect(nomeArquivoFoto(arquivo('image.png', 'image/png'), [], quando)).toBe('Foto colada 2026-10-21 09h05m07s.png')
  })

  const clipboard = (items: { kind: string; type: string; file?: File }[], types: string[]) =>
    ({ items: items.map((i) => ({ kind: i.kind, type: i.type, getAsFile: () => i.file ?? null })), types } as unknown as DataTransfer)

  it('Ctrl+V: imagem vira foto; texto colado num campo fica no campo', () => {
    const png = arquivo('image.png', 'image/png')
    expect(arquivosColados(clipboard([{ kind: 'file', type: 'image/png', file: png }], ['Files']), false)).toEqual([png])
    expect(arquivosColados(clipboard([{ kind: 'file', type: 'image/png', file: png }], ['Files']), true)).toEqual([png])
    expect(arquivosColados(clipboard([{ kind: 'string', type: 'text/plain' }], ['text/plain']), true)).toBeNull()
    expect(arquivosColados(clipboard([{ kind: 'string', type: 'text/plain' }], ['text/plain']), false)).toBeNull()
    // Imagem copiada de página web vem com texto junto: no campo, vale o texto.
    expect(arquivosColados(clipboard([{ kind: 'string', type: 'text/plain' }, { kind: 'file', type: 'image/png', file: png }], ['text/plain', 'Files']), true)).toBeNull()
    expect(arquivosColados(null, false)).toBeNull()
  })

  it('campo editável: input de texto, textarea e contenteditable; botão não', () => {
    const el = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild }
    expect(editavel(el('<input name="descricao">'))).toBe(true)
    expect(editavel(el('<input type="date">'))).toBe(true)
    expect(editavel(el('<textarea></textarea>'))).toBe(true)
    expect(editavel(el('<input type="checkbox">'))).toBe(false)
    expect(editavel(el('<button>x</button>'))).toBe(false)
    expect(editavel(window)).toBe(false)
  })
})

describe('ícone do tipo sem foto', () => {
  it('pelo nome do tipo, sem diferenciar acento; desconhecido usa o genérico', () => {
    expect(iconeTipo('Notebook')).toBe('notebook')
    expect(iconeTipo('Máquina de cartão')).toBe('cartao')
    expect(iconeTipo('IMPRESSORA')).toBe('impressora')
    expect(iconeTipo('Pager')).toBe('outro')
    expect(iconeTipo('')).toBe('outro')
  })
})

describe('fotos no Dataverse', () => {
  it('mapeia a linha: nome, capa, data e o caminho do arquivo no SharePoint (sem imagem)', () => {
    const f = mapFoto({
      cr40f_fotoequipamentoid: '{AAAA-1}', cr40f_name: 'frente.jpg', _cr40f_equipamento_value: 'E1', cr40f_capa: true,
      cr40f_caminho: '/Documentos Compartilhados/Equipamentos/DEV/e1/frente.jpg', createdon: '2026-10-21T12:00:00Z',
    })
    expect(f).toEqual({ id: 'aaaa-1', equipamentoId: 'e1', nome: 'frente.jpg', capa: true, caminho: '/Documentos Compartilhados/Equipamentos/DEV/e1/frente.jpg', criadoEm: new Date('2026-10-21T12:00:00Z') })
  })

  it('sem nome: "Foto"; sem caminho: vazio', () => {
    expect(mapFoto({ cr40f_fotoequipamentoid: 'x', cr40f_caminho: null })).toMatchObject({ nome: 'Foto', capa: false, caminho: '' })
  })

  it('consultas: fotos do item por data; capas só as marcadas; nenhuma pede imagem ao Dataverse', () => {
    expect(decodeURIComponent(fotosPath('s', '{E1}'))).toContain('$filter=_cr40f_equipamento_value eq e1&$orderby=createdon asc')
    expect(decodeURIComponent(capasPath('s'))).toContain('$select=_cr40f_equipamento_value,cr40f_caminho,createdon&$filter=cr40f_capa eq true&$orderby=createdon asc')
    expect(fotosPath('s', 'e1') + capasPath('s')).not.toContain('imagem')
  })

  it('capas: a primeira marcada de cada item vale (mais antiga), sem caminho é ignorada', () => {
    const capas = mapCapas([
      { _cr40f_equipamento_value: 'E1', cr40f_caminho: 'p/a.jpg' },
      { _cr40f_equipamento_value: 'e1', cr40f_caminho: 'p/b.jpg' },
      { _cr40f_equipamento_value: 'e2', cr40f_caminho: null },
    ])
    expect([...capas]).toEqual([['e1', 'p/a.jpg']])
  })

  it('registro: nome, capa, caminho e lookup por @odata.bind', () => {
    expect(fotoPayload('cr40f_equipamentos', '{E1}', 'a.png', true, 'Equipamentos/DEV/e1/a.png')).toEqual({
      cr40f_name: 'a.png', cr40f_capa: true, cr40f_caminho: 'Equipamentos/DEV/e1/a.png', 'cr40f_Equipamento@odata.bind': '/cr40f_equipamentos(e1)',
    })
  })

  it('caminho com "/" vai como caminho para os flows; sem "/", como id do arquivo', () => {
    expect(documentoDaFoto('Equipamentos/DEV/e1/a.JPG')).toMatchObject({ id: '', caminho: 'Equipamentos/DEV/e1/a.JPG', nome: 'a.JPG', mimeType: 'image/jpeg' })
    expect(documentoDaFoto('01ABCDEF', 'b.png')).toMatchObject({ id: '01ABCDEF', caminho: '', nome: 'b.png', mimeType: 'image/png' })
  })
})

describe('fonte do Dataverse (fotos no SharePoint)', () => {
  afterEach(() => vi.unstubAllGlobals())
  const SETS: Record<string, string> = { cr40f_equipamento: 'cr40f_equipamentos', cr40f_tipoequipamento: 'cr40f_tipoequipamentos', cr40f_funcionarios: 'cr40f_funcionarioses', cr40f_fotoequipamento: 'cr40f_fotoequipamentos' }
  const FLOWS: Record<string, string> = {
    new_URLFlowsalvararquivosSharePoint: 'https://flow/salvar', new_URLFlowConsultarArquivosSharePoint: 'https://flow/consultar',
    new_URLFlowExcluirArquivoSharePoint: 'https://flow/excluir', new_URLFlowListarArquivosSharePoint: 'https://flow/listar',
  }
  /** Variáveis de ambiente com as URLs dos flows, lidas pelo client (como o store de Funcionários lê pelo Xrm). */
  const envGetAll = async (path: string) => {
    if (path.startsWith('environmentvariabledefinitions')) {
      const nome = /schemaname eq '([^']+)'/.exec(path)?.[1] ?? ''
      return FLOWS[nome] ? [{ environmentvariabledefinitionid: nome, defaultvalue: FLOWS[nome] }] : []
    }
    if (path.startsWith('environmentvariablevalues')) return []
    return null
  }
  /** Host simulado no DEV; `semFotos` tira a tabela de fotos da metadata (ambiente antes do provision). */
  function host(client: Record<string, unknown>, semFotos = false) {
    const metadata = { entities: async (names: string[]) => new Map(names.filter((n) => !(semFotos && n === 'cr40f_fotoequipamento')).map((n) => [n, { entitySetName: SETS[n] }])) }
    const getAll = client.getAll as ((p: string) => Promise<unknown[]>) | undefined
    return { mode: 'dataverse', clientUrl: 'https://org23b93544.crm2.dynamics.com', client: { apiUrl: 'https://org/api/data/v9.2', ...client, getAll: async (p: string) => (await envGetAll(p)) ?? (getAll ? getAll(p) : []) }, metadata } as unknown as Host
  }
  /** fetch dos flows: responde por URL e guarda as chamadas. */
  function flows(respostas: Partial<Record<string, (body: Record<string, unknown>) => unknown>>) {
    const chamadas: { flow: string; body: Record<string, unknown> }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const flow = url.split('/').pop()!
      const body = JSON.parse(String(init?.body ?? '{}'))
      chamadas.push({ flow, body })
      const r = respostas[flow]
      const json = r ? r(body) : { sucesso: true }
      return new Response(JSON.stringify(json), { status: (json as { sucesso?: boolean }).sucesso ? 200 : 400 })
    }))
    return chamadas
  }
  const png = () => new File(['oi'], 'a.png', { type: 'image/png' })

  it('envia o arquivo pelo flow Salvar na pasta Equipamentos/DEV/<id> e depois cria o registro com o caminho', async () => {
    const chamadas = flows({ salvar: (b) => ({ sucesso: true, id: 'F1', caminhoSharePoint: `/Documentos Compartilhados/${b.caminhoCompleto}/${b.nomeArquivo}` }) })
    const create = vi.fn(async () => 'ABC')
    const f = await createSource(host({ create })).addFoto('{E1}', png(), 'a.png', true)
    expect(chamadas.map((c) => c.flow)).toEqual(['salvar'])
    expect(chamadas[0].body).toMatchObject({ caminhoCompleto: 'Equipamentos/DEV/e1', nomeArquivo: 'a.png', conteudoBase64: btoa('oi'), mimeType: 'image/png', metadados: { tarefaId: 'e1', origem: 'TELA_EQUIPAMENTOS' } })
    const caminho = '/Documentos Compartilhados/Equipamentos/DEV/e1/a.png'
    expect(create).toHaveBeenCalledWith('cr40f_fotoequipamentos', { cr40f_name: 'a.png', cr40f_capa: true, cr40f_caminho: caminho, 'cr40f_Equipamento@odata.bind': '/cr40f_equipamentos(e1)' })
    expect(f).toMatchObject({ id: 'abc', equipamentoId: 'e1', nome: 'a.png', capa: true, caminho })
  })

  it('flow Salvar sem caminho: guarda o id do arquivo', async () => {
    flows({ salvar: () => ({ sucesso: true, id: '01XYZ' }) })
    const create = vi.fn(async () => 'abc')
    await createSource(host({ create })).addFoto('e1', png(), 'a.png', false)
    expect(create).toHaveBeenCalledWith('cr40f_fotoequipamentos', expect.objectContaining({ cr40f_caminho: '01XYZ' }))
  })

  it('falha no flow Salvar: erro do flow e nenhum registro criado', async () => {
    flows({ salvar: () => ({ sucesso: false, erro: 'Pasta sem permissão.' }) })
    const create = vi.fn(async () => 'abc')
    await expect(createSource(host({ create })).addFoto('e1', png(), 'a.png', true)).rejects.toThrow('Pasta sem permissão.')
    expect(create).not.toHaveBeenCalled()
  })

  it('falha no registro: o arquivo enviado é excluído e vale o erro do Dataverse', async () => {
    const chamadas = flows({ salvar: () => ({ sucesso: true, id: 'F1', caminhoSharePoint: 'Equipamentos/DEV/e1/a.png' }) })
    const create = vi.fn(async () => { throw new Error('Sem privilégio prvCreate.') })
    await expect(createSource(host({ create })).addFoto('e1', png(), 'a.png', true)).rejects.toThrow('Sem privilégio prvCreate.')
    expect(chamadas.map((c) => c.flow)).toEqual(['salvar', 'excluir'])
    expect(chamadas[1].body).toMatchObject({ id: 'F1', fileLocator: 'F1', caminhoSharePoint: 'Equipamentos/DEV/e1/a.png', nomeArquivo: 'a.png', tarefaId: 'e1' })
  })

  it('excluir: apaga o arquivo e depois o registro; falha no arquivo mantém o registro', async () => {
    const chamadas = flows({})
    const remove = vi.fn(async () => undefined)
    const source = createSource(host({ remove }))
    await source.deleteFoto(foto('f2', 1, false, { caminho: 'Equipamentos/DEV/e1/f2.jpg' }))
    expect(chamadas).toEqual([{ flow: 'excluir', body: expect.objectContaining({ caminhoSharePoint: 'Equipamentos/DEV/e1/f2.jpg', nomeArquivo: 'f2.jpg', tarefaId: 'e1' }) }])
    expect(remove).toHaveBeenCalledWith('cr40f_fotoequipamentos', 'f2')
    flows({ excluir: () => ({ sucesso: false, erro: 'Arquivo bloqueado.' }) })
    remove.mockClear()
    await expect(source.deleteFoto(foto('f3', 1))).rejects.toThrow('Arquivo bloqueado.')
    expect(remove).not.toHaveBeenCalled()
  })

  it('capa: PATCH só em cr40f_capa', async () => {
    const update = vi.fn(async () => undefined)
    await createSource(host({ update })).setFotoCapa('f1', true)
    expect(update).toHaveBeenCalledWith('cr40f_fotoequipamentos', 'f1', { cr40f_capa: true })
  })

  it('baixar: flow Consultar com o caminho devolve a imagem', async () => {
    const chamadas = flows({ consultar: () => ({ sucesso: true, conteudoBase64: btoa('PNG'), mimeType: 'image/png' }) })
    const blob = await createSource(host({})).baixarFoto('Equipamentos/DEV/e1/a.png')
    expect(chamadas[0]).toEqual({ flow: 'consultar', body: expect.objectContaining({ caminhoSharePoint: 'Equipamentos/DEV/e1/a.png', nomeArquivo: 'a.png' }) })
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe(3)
  })

  it('lista com o caminho das capas; sem a tabela de fotos, carrega sem capas e só as fotos do item dão erro', async () => {
    const linhas: Record<string, unknown[]> = {
      cr40f_equipamentos: [{ cr40f_equipamentoid: 'e1', cr40f_name: 'Notebook' }, { cr40f_equipamentoid: 'e2', cr40f_name: 'Mouse' }],
      cr40f_fotoequipamentos: [{ _cr40f_equipamento_value: 'e1', cr40f_caminho: 'Equipamentos/DEV/e1/a.png' }],
    }
    const getAll = async (path: string) => linhas[path.split('?')[0]] ?? []
    const com = await createSource(host({ getAll })).load()
    expect(com.equipamentos.map((e) => [e.id, e.capa])).toEqual([['e1', 'Equipamentos/DEV/e1/a.png'], ['e2', null]])
    const semTabela = createSource(host({ getAll }, true))
    expect((await semTabela.load()).equipamentos.map((e) => e.capa)).toEqual([null, null])
    await expect(semTabela.fotos('e1')).rejects.toThrow('Tabela cr40f_fotoequipamento não encontrada na metadata.')
  })
})

describe('cache das imagens', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('baixa cada caminho uma vez, guarda falhas, usa o arquivo enviado e revoga ao liberar', async () => {
    let n = 0
    const criar = vi.fn(() => `blob:${++n}`)
    const revogar = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: criar, revokeObjectURL: revogar }))
    const baixar = vi.fn(async (c: string) => { if (c === 'ruim') throw new Error('404'); return new Blob(['x']) })
    const cache = createCacheImagens(baixar)
    expect(cache.estado('a')).toBeUndefined()
    const [u1, u2] = await Promise.all([cache.pedir('a'), cache.pedir('a')])
    expect([u1, u2, cache.estado('a')]).toEqual(['blob:1', 'blob:1', 'blob:1'])
    await cache.pedir('a')
    expect(await cache.pedir('ruim')).toBeNull()
    await cache.pedir('ruim')
    expect(baixar.mock.calls.map((c) => c[0])).toEqual(['a', 'ruim'])
    cache.guardar('novo', new Blob(['y']))
    expect(cache.estado('novo')).toBe('blob:2')
    cache.esquecer('novo')
    expect(revogar).toHaveBeenCalledWith('blob:2')
    cache.liberar()
    expect(revogar).toHaveBeenCalledWith('blob:1')
    expect(cache.estado('a')).toBeUndefined()
  })
})
