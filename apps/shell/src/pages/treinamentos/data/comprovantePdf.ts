import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib'
import type { DadosComprovante } from '../domain/comprovante'
import { blocosDoConteudo } from '../domain/treinamentos'
import { desenharAssinatura, paraWinAnsi, quebrar } from '../../../lib/pdf/texto'

export { paraWinAnsi }

const A4: [number, number] = [595.28, 841.89]
const MARGEM = 56
const LARGURA = A4[0] - MARGEM * 2
const COR = rgb(0.12, 0.12, 0.14)
const SUAVE = rgb(0.42, 0.42, 0.46)

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
    // Mesma proporção 1000 × 400 da tela; o título não fica sozinho no fim da página.
    const w = 250
    const h = 100
    espaco(h + 24)
    texto(`Assinatura${d.nomeAssinante ? ` de ${d.nomeAssinante}` : ''}`, { negrito: true })
    const by = y - h
    desenharAssinatura(page, d.assinatura, MARGEM, by, w, h, COR, SUAVE)
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
