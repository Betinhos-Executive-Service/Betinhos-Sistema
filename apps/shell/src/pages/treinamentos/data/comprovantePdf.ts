import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { DadosComprovante } from '../domain/comprovante'
import { blocosDoConteudo } from '../domain/treinamentos'

const A4: [number, number] = [595.28, 841.89]
const MARGEM = 56
const LARGURA = A4[0] - MARGEM * 2
const COR = rgb(0.12, 0.12, 0.14)
const SUAVE = rgb(0.42, 0.42, 0.46)
// WinAnsi (Helvetica padrão): ASCII + Latin-1 (sem os controles C1) + aspas e travessões tipográficos. O resto (emoji etc.) sai.
const EXTRAS = new Set([...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'])
const codificavel = (c: string) => c === '\n' || (c >= ' ' && c <= '~') || (c >= ' ' && c <= 'ÿ') || EXTRAS.has(c)
export const paraWinAnsi = (texto: string) => [...texto].filter(codificavel).join('')

function quebrar(texto: string, font: PDFFont, size: number, max: number) {
  const linhas: string[] = []
  for (const paragrafo of texto.split('\n')) {
    let atual = ''
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra
      if (font.widthOfTextAtSize(tentativa, size) <= max) { atual = tentativa; continue }
      if (atual) linhas.push(atual)
      atual = ''
      // Palavra maior que a linha (URL longa): corta por caracteres.
      for (const c of palavra) {
        if (atual && font.widthOfTextAtSize(atual + c, size) > max) { linhas.push(atual); atual = '' }
        atual += c
      }
    }
    linhas.push(atual)
  }
  return linhas
}

/** Comprovante individual do treinamento concluído: dados, linha do tempo, versão lida (texto), identificador e assinatura. */
export async function gerarComprovantePdf(d: DadosComprovante): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(paraWinAnsi(`Comprovante · ${d.titulo} · ${d.funcionario}`))
  pdf.setAuthor('Betinhos Executive Service')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page: PDFPage = pdf.addPage(A4)
  let y = A4[1] - MARGEM

  const espaco = (altura: number) => { if (y - altura < MARGEM) { page = pdf.addPage(A4); y = A4[1] - MARGEM } }
  const texto = (conteudo: string, opts: { size?: number; negrito?: boolean; cor?: typeof COR; depois?: number } = {}) => {
    const size = opts.size ?? 10
    const f = opts.negrito ? bold : font
    for (const linha of quebrar(paraWinAnsi(conteudo), f, size, LARGURA)) {
      espaco(size + 4)
      page.drawText(linha, { x: MARGEM, y: y - size, size, font: f, color: opts.cor ?? COR })
      y -= size + 4
    }
    y -= opts.depois ?? 0
  }
  const campo = (rotulo: string, valor: string) => { if (valor) texto(`${rotulo}: ${valor}`) }

  texto('Comprovante de treinamento', { size: 18, negrito: true, depois: 6 })
  texto(d.titulo, { size: 13, negrito: true, depois: 8 })
  campo('Funcionário', d.funcionario)
  campo('Publicado em', d.publicadoEm)
  campo('Abriu no app', d.abertoEm)
  campo('Confirmou a leitura', d.confirmadoEm)
  campo('Assinou', d.assinadoEm)
  campo('Quiz', d.nota)
  campo('Concluiu', d.concluidoEm)
  y -= 8
  if (d.aviso) texto(d.aviso, { cor: SUAVE, depois: 6 })

  if (d.assinatura.length) {
    texto(`Assinatura${d.nomeAssinante ? ` de ${d.nomeAssinante}` : ''}`, { negrito: true })
    const w = 240
    const h = 90
    espaco(h + 8)
    const bx = MARGEM
    const by = y - h
    page.drawRectangle({ x: bx, y: by, width: w, height: h, borderColor: SUAVE, borderWidth: 0.5 })
    for (const traco of d.assinatura) {
      for (let i = 1; i < traco.length; i += 1) {
        const [x0, y0] = traco[i - 1]
        const [x1, y1] = traco[i]
        page.drawLine({ start: { x: bx + x0 * w, y: by + (1 - y0) * h }, end: { x: bx + x1 * w, y: by + (1 - y1) * h }, thickness: 1.2, color: COR })
      }
    }
    y = by - 12
  }

  texto(d.versao === 'lida' ? 'Conteúdo lido' : 'Conteúdo atual', { size: 12, negrito: true, depois: 4 })
  if (d.descricao) texto(d.descricao, { cor: SUAVE, depois: 4 })
  for (const bloco of blocosDoConteudo(d.conteudo)) {
    if (bloco.tipo === 'h') texto(bloco.texto, { negrito: true, size: 11, depois: 2 })
    else if (bloco.tipo === 'ul') bloco.itens.forEach((item) => texto(`• ${item.replace(/\*\*/g, '')}`))
    else texto(bloco.texto.replace(/\*\*/g, ''), { depois: 4 })
  }
  if (d.videoUrl) campo('Vídeo', d.videoUrl)
  if (d.anexos.length) campo('Anexos', d.anexos.join(', '))
  // Identificador do conteúdo gravado pelo app ao concluir; não é prova de integridade nem de autoria.
  if (d.hash) { y -= 6; texto(`Identificador do conteúdo lido (SHA-256): ${d.hash}`, { size: 8, cor: SUAVE }) }
  return pdf.save()
}
