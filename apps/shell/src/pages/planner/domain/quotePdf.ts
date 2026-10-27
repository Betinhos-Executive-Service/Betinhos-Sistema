// Porte de Tela Planner/src/quotePdf.js (sem mudança de comportamento).
import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage } from 'pdf-lib'
import { paginatePdf, type PdfRange } from './pdfPagination'
import { buildQuoteRouteText, formatMoney, isVanVehicle, loadQuoteImages, QUOTE_ASSET_NAMES, quoteEmailNotes, quoteProposalSections, quoteSubject, type ImageFetcher, type QuoteImages } from './quoteDomain'
import type { QuoteInput, QuoteOptionData } from './types'

interface RenderedPage {
  bytes: Uint8Array
  width: number
  height: number
}

async function renderHtmlToPng(html: string, signal?: AbortSignal): Promise<RenderedPage[]> {
  signal?.throwIfAborted?.()
  const { default: html2canvas } = await import('html2canvas')
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none'
  document.body.appendChild(frame)
  try {
    await new Promise((resolve, reject) => {
      frame.onload = resolve
      frame.onerror = () => reject(new Error('Não foi possível preparar o PDF.'))
      frame.srcdoc = html
    })
    const source = frame.contentDocument as Document
    source.body.style.removeProperty('zoom')
    const sheet = source.querySelector<HTMLElement>('.a4-sheet') || source.body
    await Promise.all([...source.images].map((item) => item.decode().catch(() => {})))
    await source.fonts?.ready
    const height = Math.max(1123, sheet.scrollHeight)
    frame.style.height = `${height}px`
    const origin = sheet.getBoundingClientRect().top
    const pageHeight = 842 * 794 / 595
    const protectedRanges: PdfRange[] = []
    const protect = (rect: DOMRect) => {
      if (rect.height > 0) protectedRanges.push({ top: Math.max(0, Math.floor((rect.top - origin) * 2) - 2), bottom: Math.ceil((rect.bottom - origin) * 2) + 2 })
    }
    for (const element of sheet.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, img, svg')) {
      const rect = element.getBoundingClientRect()
      if (rect.height < pageHeight - 2 || element.matches('img, svg')) protect(rect)
    }
    // Edited HTML can contain bare text or paragraphs longer than one page.
    const walker = source.createTreeWalker(sheet, 4)
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (!node.textContent?.trim() || node.parentElement?.closest('style, script')) continue
      const range = source.createRange()
      range.selectNodeContents(node)
      for (const rect of range.getClientRects()) protect(rect)
    }
    signal?.throwIfAborted?.()
    const canvas = await html2canvas(sheet, { scale: 2, useCORS: true, backgroundColor: '#d9d9d9', logging: false, width: 794, height, windowWidth: 794, windowHeight: height })
    const pages: RenderedPage[] = []
    for (const { top, bottom } of paginatePdf(canvas.height, Math.floor(842 * canvas.width / 595), protectedRanges)) {
      const slice = source.createElement('canvas')
      slice.width = canvas.width
      slice.height = bottom - top
      slice.getContext('2d')?.drawImage(canvas, 0, top, canvas.width, slice.height, 0, 0, canvas.width, slice.height)
      const blob = await new Promise<Blob>((resolve, reject) => slice.toBlob((result) => result ? resolve(result) : reject(new Error('Não foi possível renderizar o PDF.')), 'image/png'))
      pages.push({ bytes: new Uint8Array(await blob.arrayBuffer()), width: slice.width, height: slice.height })
    }
    return pages
  } finally {
    frame.remove()
  }
}

function wrap(text: unknown, max: number): string[] {
  const words = String(text || '').replace(/[→↔]/g, '->').replace(/[—–]/g, '-').split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if ((line + ' ' + word).trim().length > max && line) { lines.push(line); line = word } else line = `${line} ${word}`.trim()
  }
  if (line) lines.push(line)
  return lines
}

function fitImage(page: PDFPage, image: PDFImage, x: number, y: number, maxWidth: number, maxHeight: number): void {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height)
  const width = image.width * scale
  const height = image.height * scale
  page.drawImage(image, { x: x + (maxWidth - width) / 2, y: y + (maxHeight - height) / 2, width, height })
}

export interface QuoteExportOptions {
  baseUrl?: string
  signal?: AbortSignal
  fetcher?: ImageFetcher
  assets?: Pick<QuoteImages, 'files'>
  html?: string
}

export interface QuoteExportResult {
  blob: Blob
  filename: string
}

function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
}

export async function createQuotePdf(quote: QuoteInput, { baseUrl = '', signal, fetcher, assets, html }: QuoteExportOptions = {}): Promise<QuoteExportResult> {
  if (html && typeof DOMParser !== 'undefined') {
    const pdf = await PDFDocument.create()
    const renderedPages = await renderHtmlToPng(html, signal)
    for (const rendered of renderedPages) {
      signal?.throwIfAborted?.()
      const screenshot = await pdf.embedPng(rendered.bytes)
      const renderedHeight = rendered.height * 595 / rendered.width
      const page = pdf.addPage([595, 842])
      page.drawImage(screenshot, { x: 0, y: 842 - renderedHeight, width: 595, height: renderedHeight })
    }
    const bytes = await pdf.save()
    return { blob: pdfBlob(bytes), filename: `${quoteSubject(quote).replace(/[<>:"/\\|?*]/g, '-') || 'Cotação'}.pdf` }
  }
  const artwork = assets || await loadQuoteImages(quote, { baseUrl, signal, fetcher })
  signal?.throwIfAborted?.()
  const pdf = await PDFDocument.create()
  let page = pdf.addPage([595, 842])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const navy = rgb(0.04, 0.18, 0.25)
  page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(0.85, 0.85, 0.85) })
  const image = async (name: string) => pdf.embedPng(artwork.files[name] as Uint8Array)
  let y = 810
  const banner = await image(QUOTE_ASSET_NAMES.banner)
  fitImage(page, banner, 0, y - 58, 595, 58); y -= 78
  page.drawText(`Olá ${quote.clientContact || quote.client || 'cliente'},`, { x: 32, y, size: 13, font: bold, color: navy }); y -= 24
  for (const line of wrap('A Betinhos Executive Service é uma empresa de traslados e serviços executivos presente no estado de São Paulo há mais de 37 anos, com compromisso com Non Compliance, EHS e Safe Fleet.', 88)) { page.drawText(line, { x: 32, y, size: 9, font, color: rgb(0.09, 0.08, 0.07) }); y -= 14 }
  y -= 8
  page.drawRectangle({ x: 0, y: y - 105, width: 595, height: 105, color: navy })
  const header = await image(QUOTE_ASSET_NAMES.header); fitImage(page, header, 25, y - 92, 240, 85)
  page.drawText('Roteiro do atendimento', { x: 300, y: y - 26, size: 11, font: bold, color: rgb(1, 1, 1) })
  let routeY = y - 45
  for (const line of buildQuoteRouteText(quote)) { page.drawText(`• ${String(line).replace(/[→↔]/g, '->').replace(/[—–]/g, '-')}`, { x: 300, y: routeY, size: 9, font, color: rgb(1, 1, 1) }); routeY -= 14 }
  y -= 130
  const van = isVanVehicle(quote.vehicleType)
  const vehicle = await image(van ? QUOTE_ASSET_NAMES.vanVehicle : QUOTE_ASSET_NAMES.vehicle)
  const info = await image(van ? QUOTE_ASSET_NAMES.vanInfo : QUOTE_ASSET_NAMES.commitments)
  fitImage(page, vehicle, 28, y - 120, 260, 110); fitImage(page, info, 307, y - 120, 260, 110); y -= 145
  const options: QuoteOptionData[] = quote.proposalOptions?.length ? quote.proposalOptions : quote.options || []
  if (!options.length) {
    page.drawRectangle({ x: 0, y: y - 68, width: 595, height: 68, color: navy })
    page.drawText('Custo total', { x: 32, y: y - 25, size: 11, font: bold, color: rgb(1, 1, 1) })
    page.drawText(formatMoney(quote.value), { x: 32, y: y - 50, size: 19, font: bold, color: rgb(1, 1, 1) }); y -= 96
  }
  const ensureSpace = (needed = 45) => {
    if (y >= needed) return
    page = pdf.addPage([595, 842])
    page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(0.85, 0.85, 0.85) })
    y = 810
  }
  for (const option of options) {
    for (const text of [option.name || 'Opção', `Total: ${formatMoney(option.value)}`, option.commercialTerms].filter(Boolean)) {
      for (const line of wrap(text, 88)) { ensureSpace(45); page.drawText(line, { x: 32, y, size: 10, font, color: navy }); y -= 14 }
    }
    y -= 12
  }
  for (const { title, text } of quoteProposalSections(quote)) {
    ensureSpace(); page.drawText(`${title}:`, { x: 32, y, size: 11, font: bold, color: navy }); y -= 18
    for (const paragraph of text.split('\n')) {
      for (const line of wrap(paragraph || ' ', 88)) { ensureSpace(28); page.drawText(line, { x: 32, y, size: 8, font, color: rgb(0.09, 0.08, 0.07) }); y -= 11 }
      y -= 4
    }
    y -= 6
  }
  ensureSpace()
  page.drawText('OBSERVAÇÕES IMPORTANTES:', { x: 32, y, size: 11, font: bold, color: navy }); y -= 18
  for (const note of quoteEmailNotes(quote)) { for (const line of wrap(`• ${note}`, 88)) { ensureSpace(28); page.drawText(line, { x: 32, y, size: 8, font, color: rgb(0.09, 0.08, 0.07) }); y -= 11 } }
  const bytes = await pdf.save()
  return { blob: pdfBlob(bytes), filename: `${quoteSubject(quote).replace(/[<>:"/\\|?*]/g, '-') || 'Cotação'}.pdf` }
}

export function downloadQuotePdf(result: QuoteExportResult): void {
  const url = URL.createObjectURL(result.blob); const anchor = document.createElement('a')
  anchor.href = url; anchor.download = result.filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000)
}
