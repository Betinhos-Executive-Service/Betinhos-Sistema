// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { countInlineImages, noteIsPlain, sanitizeNoteHtml, textToNoteHtml, type SafeNode } from './notes'

const origin = 'https://org.crm2.dynamics.com'

function flat(nodes: SafeNode[]): string {
  return nodes.map((node) => (node.type === 'text' ? node.text : `<${node.tag}${Object.entries(node.attrs).map(([k, v]) => ` ${k}="${v}"`).join('')}>${flat(node.children)}</${node.tag}>`)).join('')
}

describe('textToNoteHtml', () => {
  it('gera parágrafos no formato da timeline e escapa HTML', () => {
    const html = textToNoteHtml('Linha <1>\n\nLinha & 2')
    expect(html).toContain('class="ck-content" data-wrapper="true"')
    expect(html).toContain('<p style="margin: 0;">Linha &lt;1&gt;</p><p style="margin: 0;">&nbsp;</p><p style="margin: 0;">Linha &amp; 2</p>')
    expect(textToNoteHtml('   ')).toBe('')
  })
})

describe('noteIsPlain', () => {
  it('reconhece nota com formatação ou imagem', () => {
    expect(noteIsPlain(textToNoteHtml('texto simples'))).toBe(true)
    expect(noteIsPlain('<p>com <b>negrito</b></p>')).toBe(false)
    expect(noteIsPlain('<p><img src="/api/data/v9.0/x"></p>')).toBe(false)
    expect(countInlineImages('<p><img src="a"><img src="b"></p>')).toBe(2)
  })
})

describe('sanitizeNoteHtml', () => {
  it('mantém texto, formatação e imagens do Dataverse', () => {
    const html = '<div class="ck-content"><p style="color:red">Oi <b>você</b></p><p><img style="width:1279px" src="/api/data/v9.0/msdyn_richtextfiles(1)/msdyn_imageblob/$value?size=full"></p></div>'
    expect(flat(sanitizeNoteHtml(html, origin))).toBe(`<div><p>Oi <b>você</b></p><p><img src="${origin}/api/data/v9.0/msdyn_richtextfiles(1)/msdyn_imageblob/$value?size=full" alt=""></img></p></div>`)
  })

  it('remove scripts, handlers, links perigosos e imagens externas', () => {
    const html = '<p onclick="x()">a<script>alert(1)</script><a href="javascript:alert(1)">link</a><img src="https://evil.com/x.png" onerror="alert(1)"><iframe src="x"></iframe></p>'
    expect(flat(sanitizeNoteHtml(html, origin))).toBe('<p>alink</p>')
  })
})

describe('anexos no SharePoint', () => {
  const anexo = { nome: 'foto <1>.png', caminho: '/Documentos Compartilhados/Funcionarios/DEV/f1/Anotacoes/foto <1>.png', id: '%252fx', mime: 'image/png', tamanho: 70 }

  it('grava link e lê de volta separando do corpo', async () => {
    const { buildNoteHtml, extractSpAnexos, noteIsPlain } = await import('./notes')
    const html = buildNoteHtml('Avaria no carro', [anexo])
    expect(html).toContain('href="https://betinhos.sharepoint.com/sites/BetinhosGestoInterna/Documentos%20Compartilhados/Funcionarios/DEV/f1/Anotacoes/foto%20%3C1%3E.png"')
    const { corpo, anexos } = extractSpAnexos(html)
    expect(anexos).toEqual([anexo])
    expect(corpo).toContain('Avaria no carro')
    expect(corpo).not.toContain('SharePoint')
    expect(noteIsPlain(corpo)).toBe(true)
  })

  it('reconhece link editado na timeline nativa sem os atributos data-sp', async () => {
    const { extractSpAnexos } = await import('./notes')
    const html = '<div><p>Oi</p><p><a href="https://betinhos.sharepoint.com/sites/BetinhosGestoInterna/Documentos%20Compartilhados/F/a.png">Anexo no SharePoint: a.png</a></p></div>'
    expect(extractSpAnexos(html).anexos[0]).toMatchObject({ nome: 'a.png', caminho: '/Documentos Compartilhados/F/a.png', id: '' })
  })

  it('acrescenta anexo a nota existente sem alterar o conteúdo', async () => {
    const { appendAnexos, textToNoteHtml } = await import('./notes')
    const original = textToNoteHtml('texto original')
    const html = appendAnexos(original, [anexo])
    expect(html.startsWith(original.slice(0, -6))).toBe(true)
    expect(html).toContain('data-sp-anexo="true"')
    expect(appendAnexos('', [anexo])).toContain('ck-content')
  })
})
