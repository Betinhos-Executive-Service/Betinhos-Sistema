// Porte de Tela Planner/src/quoteWord.js (sem mudança de comportamento).
import { buildQuoteRouteText, formatMoney, isVanVehicle, loadQuoteImages, QUOTE_ASSET_NAMES, quoteEmailNotes, quoteProposalSections, quoteSubject } from './quoteDomain'
import type { QuoteExportOptions, QuoteExportResult } from './quotePdf'
import type { QuoteInput, QuoteOptionData } from './types'

export async function createQuoteWord(quote: QuoteInput, { baseUrl = '', signal, fetcher, assets, html }: QuoteExportOptions = {}): Promise<QuoteExportResult> {
  if (html) {
    signal?.throwIfAborted?.()
    const body = String(html).replace(/^.*?<body[^>]*>|<\/body>.*$/gis, '')
    const wordStyles = '@page WordSection1{size:595.3pt 841.9pt;margin:0;mso-header-margin:0;mso-footer-margin:0}html,body{margin:0!important;padding:0!important}div.WordSection1{page:WordSection1;width:595.3pt}table.a4-sheet{width:595.3pt!important;max-width:595.3pt!important;min-height:841.9pt!important;table-layout:fixed!important}'
    const content = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="pt-BR"><head><meta charset="utf-8"><title>${quoteSubject(quote)}</title><style>${wordStyles}</style></head><body><div class="WordSection1">${body}</div></body></html>`
    return {
      blob: new Blob([content], { type: 'application/msword;charset=utf-8' }),
      filename: `${quoteSubject(quote).replace(/[<>:"/\\|?*]/g, '-') || 'Cotação'}.doc`,
    }
  }
  const artwork = assets || await loadQuoteImages(quote, { baseUrl, signal, fetcher })
  const { AlignmentType, Document, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = await import('docx')
  signal?.throwIfAborted?.()
  type Alignment = (typeof AlignmentType)[keyof typeof AlignmentType]
  interface ParagraphOptions { bold?: boolean; color?: string; size?: number; after?: number; align?: Alignment }
  const image = (name: string, maxWidth: number, maxHeight: number) => {
    const bytes = artwork.files[name] as Uint8Array
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const nativeWidth = view.getUint32(16)
    const nativeHeight = view.getUint32(20)
    const scale = Math.min(maxWidth / nativeWidth, maxHeight / nativeHeight)
    return new ImageRun({ data: bytes, type: 'png', transformation: { width: Math.round(nativeWidth * scale), height: Math.round(nativeHeight * scale) } })
  }
  const paragraph = (text: string, options: ParagraphOptions = {}) => new Paragraph({ children: [new TextRun({ text, bold: Boolean(options.bold), color: options.color || '171512', size: options.size || 22 })], spacing: { after: options.after ?? 120 }, alignment: options.align || AlignmentType.LEFT })
  const picture = (name: string, width: number, height: number) => new Paragraph({ children: [image(name, width, height)], alignment: AlignmentType.CENTER, spacing: { after: 100 } })
  const van = isVanVehicle(quote.vehicleType)
  const route = buildQuoteRouteText(quote)
  const notes = quoteEmailNotes(quote)
  const sections = quoteProposalSections(quote)
  const options: QuoteOptionData[] = quote.proposalOptions?.length ? quote.proposalOptions : quote.options || []
  const routeCell = new TableCell({ shading: { fill: '0A2F41' }, children: [paragraph('Roteiro do atendimento', { bold: true, color: 'FFFFFF' }), ...route.map((line) => paragraph(`• ${line}`, { color: 'FFFFFF' }))] })
  const doc = new Document({
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 360, right: 520, bottom: 360, left: 520 } } }, children: [
      picture(QUOTE_ASSET_NAMES.banner, 690, 110),
      paragraph(`Olá ${quote.clientContact || quote.client || 'cliente'},`, { size: 26 }),
      paragraph('A Betinhos Executive Service é uma empresa de traslados e serviços executivos presente no estado de São Paulo há mais de 37 anos e, ao longo dessas décadas, mantemos compromisso com Non Compliance, EHS e Safe Fleet.'),
      paragraph('Abaixo segue sua cotação no mesmo formato do material aprovado, com foco nas informações do atendimento e sem a assinatura final.'),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [
        new TableCell({ shading: { fill: '0A2F41' }, children: [picture(QUOTE_ASSET_NAMES.header, 310, 170)] }), routeCell,
      ] })] }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [
        new TableCell({ children: [picture(van ? QUOTE_ASSET_NAMES.vanVehicle : QUOTE_ASSET_NAMES.vehicle, 310, 180)] }),
        new TableCell({ children: [picture(van ? QUOTE_ASSET_NAMES.vanInfo : QUOTE_ASSET_NAMES.commitments, 310, 180)] }),
      ] })] }),
      ...(options.length ? options.flatMap((option) => [
        paragraph(option.name || 'Opção', { bold: true, size: 26 }),
        paragraph(`Total: ${formatMoney(option.value)}`, { bold: true, size: 28 }),
        ...[option.commercialTerms].filter((text): text is string => Boolean(text)).flatMap((text) => text.split('\n').map((line) => paragraph(line))),
      ]) : [paragraph('Com base nesse comprometimento, faço saber que o custo total é de', { bold: true, align: AlignmentType.CENTER, after: 80 }), paragraph(formatMoney(quote.value), { bold: true, size: 38, align: AlignmentType.CENTER, after: 80 })]),
      paragraph('Veja abaixo informações importantes para sua contratação', { bold: true, align: AlignmentType.CENTER }),
      ...sections.flatMap(({ title, text }) => [paragraph(`${title}:`, { bold: true, size: 25 }), ...text.split('\n').map((line) => paragraph(line || ' '))]),
      paragraph('OBSERVAÇÕES IMPORTANTES:', { bold: true, size: 25 }),
      ...notes.map((line) => paragraph(`• ${line}`)),
    ] }],
  })
  const blob = await Packer.toBlob(doc)
  signal?.throwIfAborted?.()
  return { blob, filename: `${quoteSubject(quote).replace(/[<>:"/\\|?*]/g, '-') || 'Cotação'}.docx` }
}

export function downloadQuoteWord({ blob, filename }: QuoteExportResult): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
