// Porte de Tela Planner/src/pdfPagination.js (sem mudança de comportamento).
export interface PdfRange {
  top: number
  bottom: number
}

// Coordinates are canvas pixels. Boundaries may only fall outside protected content.
export function paginatePdf(height: number, pageHeight: number, protectedRanges: PdfRange[]): PdfRange[] {
  const ranges = protectedRanges.map(({ top, bottom }) => ({ top: Math.max(0, top), bottom: Math.min(height, bottom) })).filter(({ top, bottom }) => bottom > top)
  const pages: PdfRange[] = []
  let top = 0
  while (top < height) {
    let bottom = Math.min(height, top + pageHeight)
    let collision: PdfRange | undefined
    while ((collision = ranges.find((range) => range.top < bottom && range.bottom > bottom))) {
      bottom = collision.top
    }
    if (bottom <= top) throw new Error('Um elemento do documento excede a altura de uma página A4. Reduza esse elemento para gerar o PDF sem cortes.')
    pages.push({ top, bottom })
    top = bottom
  }
  return pages
}
