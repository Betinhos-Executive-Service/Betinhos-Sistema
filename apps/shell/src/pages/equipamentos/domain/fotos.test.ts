// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { ajustesAoExcluir, ajustesCapa, aplicarAjustes, arquivosColados, capaEfetiva, editavel, miniaturaDaCapa, nasceCapa, nomeFoto, ordenarFotos, validarFoto, type Foto } from './fotos'
import { iconeTipo } from './cadastros'
import { capasPath, fotoPayload, fotosPath, mapCapas, mapFoto } from '../data/queries'
import { createSource } from '../data/source'
import type { Host } from '../../../host'

const foto = (id: string, dia: number, capa = false, over: Partial<Foto> = {}): Foto =>
  ({ id, equipamentoId: 'e1', nome: `${id}.jpg`, capa, criadoEm: new Date(Date.UTC(2026, 9, dia)), miniatura: `data:${id}`, url: null, ...over })
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

  it('miniatura da lista: só a capa marcada; sem marcada, ícone do tipo (null)', () => {
    expect(miniaturaDaCapa([foto('a', 1), foto('b', 2, true)])).toBe('data:b')
    expect(miniaturaDaCapa([foto('a', 1)])).toBeNull()
    expect(miniaturaDaCapa([])).toBeNull()
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
  const api = 'https://org.crm2.dynamics.com/api/data/v9.2'
  it('mapeia a linha: miniatura em base64, imagem grande por $value?size=full com o id da imagem', () => {
    const f = mapFoto({
      cr40f_fotoequipamentoid: '{AAAA-1}', cr40f_name: 'frente.jpg', _cr40f_equipamento_value: 'E1', cr40f_capa: true,
      cr40f_imagem: 'QUJD', cr40f_imagemid: 'IMG-9', createdon: '2026-10-21T12:00:00Z',
    }, api, 'cr40f_fotoequipamentos')
    expect(f).toMatchObject({ id: 'aaaa-1', equipamentoId: 'e1', nome: 'frente.jpg', capa: true, miniatura: 'data:image/jpeg;base64,QUJD' })
    expect(f.url).toBe(`${api}/cr40f_fotoequipamentos(aaaa-1)/cr40f_imagem/$value?size=full&v=img-9`)
    expect(f.criadoEm?.toISOString()).toBe('2026-10-21T12:00:00.000Z')
  })

  it('sem imagem: sem miniatura nem url; sem nome, "Foto"', () => {
    expect(mapFoto({ cr40f_fotoequipamentoid: 'x', cr40f_imagem: null, cr40f_imagemid: null }, api, 's')).toMatchObject({ nome: 'Foto', capa: false, miniatura: null, url: null })
  })

  it('consultas: fotos do item por data; capas só as marcadas', () => {
    expect(decodeURIComponent(fotosPath('s', '{E1}'))).toContain('$filter=_cr40f_equipamento_value eq e1&$orderby=createdon asc')
    expect(decodeURIComponent(capasPath('s'))).toContain('$filter=cr40f_capa eq true&$orderby=createdon asc')
  })

  it('capas: a primeira marcada de cada item vale (mais antiga), sem imagem é ignorada', () => {
    const capas = mapCapas([
      { _cr40f_equipamento_value: 'E1', cr40f_imagem: 'AAA' },
      { _cr40f_equipamento_value: 'e1', cr40f_imagem: 'BBB' },
      { _cr40f_equipamento_value: 'e2', cr40f_imagem: null },
    ])
    expect([...capas]).toEqual([['e1', 'data:image/jpeg;base64,AAA']])
  })

  it('criação: imagem em base64 no mesmo POST e lookup por @odata.bind', () => {
    expect(fotoPayload('cr40f_equipamentos', '{E1}', 'a.png', true, 'QUJD')).toEqual({
      cr40f_name: 'a.png', cr40f_capa: true, cr40f_imagem: 'QUJD', 'cr40f_Equipamento@odata.bind': '/cr40f_equipamentos(e1)',
    })
  })
})

describe('fonte do Dataverse (fotos)', () => {
  const SETS: Record<string, string> = { cr40f_equipamento: 'cr40f_equipamentos', cr40f_tipoequipamento: 'cr40f_tipoequipamentos', cr40f_funcionarios: 'cr40f_funcionarioses', cr40f_fotoequipamento: 'cr40f_fotoequipamentos' }
  /** Host simulado; `semFotos` tira a tabela de fotos da metadata (ambiente antes do provision). */
  function host(client: Record<string, unknown>, semFotos = false) {
    const metadata = { entities: async (names: string[]) => new Map(names.filter((n) => !(semFotos && n === 'cr40f_fotoequipamento')).map((n) => [n, { entitySetName: SETS[n] }])) }
    return { mode: 'dataverse', client: { apiUrl: 'https://org/api/data/v9.2', ...client }, metadata } as unknown as Host
  }

  it('envia a foto num POST só, com a imagem em base64, e relê a miniatura', async () => {
    const create = vi.fn(async () => 'ABC')
    const request = vi.fn(async (_path: string) => ({ cr40f_fotoequipamentoid: 'abc', cr40f_name: 'a.png', _cr40f_equipamento_value: 'e1', cr40f_capa: true, cr40f_imagem: 'TUlO', cr40f_imagemid: 'i1', createdon: '2026-10-21T12:00:00Z' }))
    const source = createSource(host({ create, request }))
    const f = await source.addFoto('E1', new File(['oi'], 'a.png', { type: 'image/png' }), 'a.png', true)
    expect(create).toHaveBeenCalledWith('cr40f_fotoequipamentos', { cr40f_name: 'a.png', cr40f_capa: true, cr40f_imagem: btoa('oi'), 'cr40f_Equipamento@odata.bind': '/cr40f_equipamentos(e1)' })
    expect(request.mock.calls[0][0]).toMatch(/^cr40f_fotoequipamentos\(abc\)\?\$select=/)
    expect(f).toMatchObject({ id: 'abc', miniatura: 'data:image/jpeg;base64,TUlO', capa: true })
  })

  it('foto gravada com releitura que falha entra sem miniatura (não diz que não foi enviada)', async () => {
    const source = createSource(host({ create: async () => 'abc', request: async () => { throw new Error('rede') } }))
    await expect(source.addFoto('e1', new File(['oi'], 'a.png', { type: 'image/png' }), 'a.png', false)).resolves.toMatchObject({ id: 'abc', nome: 'a.png', miniatura: null, url: null })
  })

  it('capa: PATCH só em cr40f_capa; excluir: DELETE da foto', async () => {
    const update = vi.fn(async () => undefined)
    const remove = vi.fn(async () => undefined)
    const source = createSource(host({ update, remove }))
    await source.setFotoCapa('f1', true)
    await source.deleteFoto('f2')
    expect(update).toHaveBeenCalledWith('cr40f_fotoequipamentos', 'f1', { cr40f_capa: true })
    expect(remove).toHaveBeenCalledWith('cr40f_fotoequipamentos', 'f2')
  })

  it('lista com as capas; sem a tabela de fotos, carrega sem capas e só as fotos do item dão erro', async () => {
    const linhas: Record<string, unknown[]> = {
      cr40f_equipamentos: [{ cr40f_equipamentoid: 'e1', cr40f_name: 'Notebook' }, { cr40f_equipamentoid: 'e2', cr40f_name: 'Mouse' }],
      cr40f_fotoequipamentos: [{ _cr40f_equipamento_value: 'e1', cr40f_imagem: 'QQ==' }],
    }
    const getAll = async (path: string) => linhas[path.split('?')[0]] ?? []
    const com = await createSource(host({ getAll })).load()
    expect(com.equipamentos.map((e) => [e.id, e.capa])).toEqual([['e1', 'data:image/jpeg;base64,QQ=='], ['e2', null]])
    const semTabela = createSource(host({ getAll }, true))
    expect((await semTabela.load()).equipamentos.map((e) => e.capa)).toEqual([null, null])
    await expect(semTabela.fotos('e1')).rejects.toThrow('Tabela cr40f_fotoequipamento não encontrada na metadata.')
  })
})
