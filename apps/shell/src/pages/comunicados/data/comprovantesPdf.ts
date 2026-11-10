import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib'
import { desenharAssinatura, paraWinAnsi, quebrar } from '../../../lib/pdf/texto'
import { hashConteudo, tituloComprovante, type ModoPdf, type Par } from '../domain/comprovante'
import { COMUNICADO_TIPO, formatDate, parseSignature, plural } from '../domain/comunicados'

const A4: [number, number] = [595.28, 841.89]
const MARGEM = 56
const LARGURA = A4[0] - MARGEM * 2
const COR = rgb(0.12, 0.12, 0.14)
const SUAVE = rgb(0.42, 0.42, 0.46)

export type DadosPdf = { modo: ModoPdf; alvo: string; pares: Par[]; geradoPor: string; geradoEm: Date; versao: string }

const NOTA = 'Assinatura registrada pelo App Motoristas com a conta Microsoft do motorista; datas do servidor.'
const AVISO_HASH = 'O identificador é calculado na geração deste PDF a partir do título e do texto do comunicado; não é prova de integridade nem de autoria.'

/** PDF de evidência: capa com o resumo e um comprovante por par (motorista × comunicado), cada um em página nova. */
export async function gerarComprovantesPdf({ modo, alvo, pares, geradoPor, geradoEm, versao }: DadosPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(paraWinAnsi(`Comprovantes de comunicados · ${alvo}`))
  pdf.setAuthor('Betinhos Executive Service')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page!: PDFPage
  let y = 0

  const novaPagina = () => { page = pdf.addPage(A4); y = A4[1] - MARGEM }
  const espaco = (altura: number) => { if (y - altura < MARGEM) novaPagina() }
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

  // Data da conclusão: ciência assinada (Ciência) ou leitura confirmada (Informativo); a leitura anterior à assinatura não conta.
  const datas = pares.map((p) => (p.comunicado.tipo === COMUNICADO_TIPO.ciencia ? p.destinatario.cienteEm : p.destinatario.lidoEm)).filter((v): v is string => Boolean(v)).sort((a, b) => Date.parse(a) - Date.parse(b))
  // Em "por comunicado" todos os comprovantes têm o mesmo conteúdo: calcula o SHA-256 uma vez.
  const hashes = new Map<string, Promise<string>>()
  const hashDe = ({ titulo, corpo }: { titulo: string; corpo: string }) => {
    const chave = `${titulo}\n${corpo}`
    if (!hashes.has(chave)) hashes.set(chave, hashConteudo(titulo, corpo))
    return hashes.get(chave)
  }
  const geracao = formatDate(geradoEm.toISOString())

  novaPagina()
  texto('Comprovantes de comunicados', { size: 18, negrito: true, depois: 6 })
  texto(modo === 'comunicado' ? 'Geração por comunicado' : 'Geração por motorista', { cor: SUAVE, depois: 8 })
  campo(modo === 'comunicado' ? 'Comunicado' : 'Motorista', alvo)
  campo('Comprovantes neste arquivo', String(pares.length))
  if (datas.length) {
    const [inicio, fim] = [formatDate(datas[0]), formatDate(datas[datas.length - 1])]
    campo('Período das conclusões', inicio === fim ? inicio : `${inicio} a ${fim}`)
  }
  campo('Gerado por', geradoPor)
  campo('Gerado em', geracao)
  y -= 8
  texto(`Cada comprovante começa em uma página nova e pode ser lido sozinho. Entram apenas ${plural(pares.length, 'a conclusão', 'as conclusões')} registradas: ciência assinada (Ciência) ou leitura confirmada (Informativo); pendentes ficam de fora.`, { cor: SUAVE })

  for (const { comunicado, destinatario: d, motorista } of pares) {
    const ciencia = comunicado.tipo === COMUNICADO_TIPO.ciencia
    novaPagina()
    texto(tituloComprovante(comunicado.tipo), { size: 18, negrito: true, depois: 10 })

    texto('Comunicado', { size: 11, negrito: true, depois: 2 })
    texto(comunicado.titulo, { size: 12, negrito: true })
    campo('Tipo', ciencia ? 'Ciência (assinatura obrigatória)' : 'Informativo (confirmação de leitura)')
    y -= 6

    texto('Motorista', { size: 11, negrito: true, depois: 2 })
    campo('Nome no cadastro', motorista)
    if (ciencia) campo('Assinante registrado', d.nomeAssinante)
    y -= 6

    texto('Linha do tempo (horário de Brasília, relógio do servidor)', { size: 11, negrito: true, depois: 2 })
    campo('Disparado', formatDate(comunicado.disparadoEm))
    campo('Enviado', formatDate(d.enviadoEm || null))
    campo('Aberto', formatDate(d.abertoEm))
    campo('Lido', formatDate(d.lidoEm))
    if (ciencia) campo('Ciência', formatDate(d.cienteEm))
    y -= 6

    if (ciencia) {
      const traces = parseSignature(d.assinaturaJson)
      const w = 250
      const h = 100
      espaco(h + 24)
      texto('Assinatura', { size: 11, negrito: true, depois: 2 })
      if (traces.length) {
        // Mesma proporção 1000 × 400 da tela.
        const by = y - h
        desenharAssinatura(page, traces, MARGEM, by, w, h, COR, SUAVE)
        y = by - 10
      } else {
        texto('Assinatura não disponível no registro.', { cor: SUAVE })
      }
      if (d.observacao) campo('Observação do motorista', d.observacao)
      y -= 6
    }

    texto('Texto integral do comunicado', { size: 11, negrito: true, depois: 2 })
    texto(comunicado.corpo, { depois: 6 })

    texto('Identificação', { size: 11, negrito: true, depois: 2 })
    campo('ID do comunicado', comunicado.id)
    campo('ID do destinatário', d.id)
    texto(`Identificador do conteúdo disparado (SHA-256): ${await hashDe(comunicado)}`, { size: 8, cor: SUAVE })
    texto(AVISO_HASH, { size: 7, cor: SUAVE, depois: 6 })
    texto(NOTA, { size: 8, cor: SUAVE })
  }

  const paginas = pdf.getPages()
  paginas.forEach((p, i) => {
    p.drawText(paraWinAnsi(`Gerado por ${geradoPor} em ${geracao} · Sistema Betinhos v${versao}`), { x: MARGEM, y: 30, size: 7.5, font, color: SUAVE })
    const rotulo = `Página ${i + 1}/${paginas.length}`
    p.drawText(rotulo, { x: A4[0] - MARGEM - font.widthOfTextAtSize(rotulo, 7.5), y: 30, size: 7.5, font, color: SUAVE })
  })
  return pdf.save()
}
