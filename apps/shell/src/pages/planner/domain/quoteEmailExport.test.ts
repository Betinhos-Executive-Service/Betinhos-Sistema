// Porte de Tela Planner/tests/quoteEmailExport.test.mjs (parte de domínio).
// Ficam fora: leitura dos PNGs em public/WebResources (artefato, fase 3) e os
// testes de rascunho Graph (mailGraph, portados junto com data/mailGraph).
import assert from 'node:assert/strict'
import { test } from 'vitest'
import { buildQuoteEmailHtml, copyQuoteToClipboard, loadQuoteImages, type ImageFetcher } from './quoteDomain'
import { createQuoteWord } from './quoteWord'
import { createQuotePdf } from './quotePdf'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9n0ZkAAAAASUVORK5CYII=', 'base64')
const quote = { code: 'COT-1007', client: 'Cliente', clientContact: 'Renan', origin: 'GRU', destination: 'Paulista', vehicleType: 'Executivo', value: 'R$ 1.000,00', notes: 'Pedido original do cliente', commercialTerms: 'Pagamento em 30 dias' }
const fetcher: ImageFetcher = async () => ({ ok: true, blob: async () => new Blob([png], { type: 'image/png' }) })

test('carrega todas as imagens e incorpora seus bytes no HTML copiado', async () => {
  const images = await loadQuoteImages(quote, { baseUrl: 'https://crm.example', fetcher })
  assert.equal(Object.keys(images.files).length, 4)
  const html = buildQuoteEmailHtml(quote, { baseUrl: 'https://crm.example', imageUrls: images.imageUrls })
  assert.equal((html.match(/src="data:image\/png;base64,/g) || []).length, 4)
  assert.doesNotMatch(html, /src="https:\/\/crm.example\/WebResources\//)
})

test('copia o HTML editado do preview sem reconstruir a proposta original', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const originalClipboardItem = Object.getOwnPropertyDescriptor(globalThis, 'ClipboardItem')
  let copied: MockClipboardItem | undefined
  class MockClipboardItem { data: Record<string, Blob>; constructor(data: Record<string, Blob>) { this.data = data } }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { write: async ([item]: MockClipboardItem[]) => { copied = item } } } })
  Object.defineProperty(globalThis, 'ClipboardItem', { configurable: true, value: MockClipboardItem })
  try {
    const html = '<!DOCTYPE html><html><body><p>Texto editado</p><img src="data:image/png;base64,abc"></body></html>'
    const text = 'Texto editado'
    const result = await copyQuoteToClipboard(quote, { html, text })
    assert.equal(result.html, html)
    assert.equal(result.text, text)
    assert.equal(await copied!.data['text/html']!.text(), html)
    assert.equal(await copied!.data['text/plain']!.text(), text)
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
    else Reflect.deleteProperty(globalThis, 'navigator')
    if (originalClipboardItem) Object.defineProperty(globalThis, 'ClipboardItem', originalClipboardItem)
    else Reflect.deleteProperty(globalThis, 'ClipboardItem')
  }
})

test('falha inteira se uma imagem não puder ser carregada', async () => {
  await assert.rejects(loadQuoteImages(quote, { fetcher: async () => ({ ok: false, blob: async () => new Blob() }) }), /Não foi possível carregar a imagem/)
})

test('Word contém conteúdo editável e quatro imagens incorporadas', async () => {
  const { blob, filename } = await createQuoteWord(quote, { fetcher })
  const archive = Buffer.from(await blob.arrayBuffer()).toString('latin1')
  assert.equal(filename, 'Cotação COT-1007 - Cliente.docx')
  assert.match(archive, /word\/document.xml/)
  assert.equal((archive.match(/word\/media\//g) || []).length >= 4, true)
})

test('Word pode usar exatamente o HTML exibido no preview', async () => {
  const html = '<!DOCTYPE html><html><body><table class="a4-sheet"><tr><td>Visual idêntico ao preview</td></tr></table></body></html>'
  const { blob, filename } = await createQuoteWord(quote, { html })
  assert.equal(filename, 'Cotação COT-1007 - Cliente.doc')
  assert.equal(blob.type, 'application/msword;charset=utf-8')
  const content = await blob.text()
  assert.match(content, /Visual idêntico ao preview/)
  assert.match(content, /@page WordSection1\{size:595\.3pt 841\.9pt;margin:0/)
  assert.match(content, /<div class="WordSection1">/)
})

test('cancelamento impede preparar Word após carregar imagens', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(createQuoteWord(quote, { signal: controller.signal, fetcher }), /AbortError/)
})

test('PDF usa os mesmos quatro assets e produz arquivo PDF', async () => {
  const result = await createQuotePdf(quote, { fetcher })
  assert.equal(result.filename, 'Cotação COT-1007 - Cliente.pdf')
  assert.equal(result.blob.type, 'application/pdf')
  assert.match(Buffer.from(await result.blob.arrayBuffer()).toString('latin1', 0, 8), /%PDF-1\./)
})
