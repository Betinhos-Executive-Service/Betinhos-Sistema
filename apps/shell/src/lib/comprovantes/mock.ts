import { mimeDoArquivo, type Arquivo, type Comprovante } from './arquivo'

const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

/** Conteúdo fictício gerado no navegador (cupom em SVG ou PDF mínimo), sem link nem dado real. */
export function createMockArquivo(anexo: Comprovante): Arquivo {
  // Como o flow, devolve o nome do OneDrive (com extensão) mesmo quando o Dataverse gravou sem.
  if (!/\.[a-z0-9]+$/i.test(anexo.nome)) anexo = { ...anexo, nome: `${anexo.nome}.jpg` }
  const mime = mimeDoArquivo(anexo.nome, null)
  if (mime === 'application/pdf') {
    const pdf = [
      '%PDF-1.4',
      '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
      '4 0 obj<</Length 52>>stream', 'BT /F1 18 Tf 40 100 Td (Nota fiscal - exemplo) Tj ET', 'endstream endobj',
      '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj', 'trailer<</Root 1 0 R>>', '%%EOF',
    ].join('\n')
    return { nome: anexo.nome, mime, url: `data:application/pdf;base64,${btoa(pdf)}` }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="520" viewBox="0 0 360 520"><rect width="360" height="520" fill="#ffffff"/><rect x="24" y="24" width="312" height="472" fill="none" stroke="#E2E8F0" stroke-width="2"/><text x="180" y="80" font-family="Manrope, sans-serif" font-size="20" font-weight="700" text-anchor="middle" fill="#001A3D">CUPOM FISCAL</text><text x="180" y="112" font-family="Manrope, sans-serif" font-size="14" text-anchor="middle" fill="#64748B">${esc(anexo.nome)}</text>${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="48" y="${160 + i * 40}" width="${180 - i * 12}" height="10" fill="#E2E8F0"/><rect x="262" y="${160 + i * 40}" width="50" height="10" fill="#E2E8F0"/>`).join('')}<text x="48" y="440" font-family="Manrope, sans-serif" font-size="18" font-weight="700" fill="#0F172A">TOTAL</text><text x="312" y="440" font-family="Manrope, sans-serif" font-size="18" font-weight="700" text-anchor="end" fill="#0F172A">R$ —</text></svg>`
  return { nome: anexo.nome, mime: 'image/svg+xml', url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` }
}
