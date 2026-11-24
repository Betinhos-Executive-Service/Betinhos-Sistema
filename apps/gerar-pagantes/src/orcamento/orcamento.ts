import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import { formatCurrency } from '../money'
import timbradoUrl from './timbrado.png?inline'

// Orçamento de Pedido de compra (Johnson&Johnson/Kenvue, via Ariba) em PDF: o papel timbrado (timbrado.png,
// página A4 inteira do modelo .docx original) vai de fundo e o texto é escrito por cima.
export interface DadosOrcamento {
  nome: string
  cliente: string
  valorCents: number
  inicio: string | null
  fim: string | null
  hoje?: Date
}

/** Trecho de texto; `b` = negrito. */
export type Trecho = { t: string; b?: boolean }
/** Bloco do corpo: parágrafo com recuo opcional, item numerado ou linha pontilhada. */
export type Bloco = { trechos: Trecho[]; recuo?: number; marcador?: string; espacoAntes?: number } | { pontilhado: true }

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

function hojeSp(hoje: Date) {
  const partes = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(hoje)
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? ''
  return { dia: valor('day'), mes: Number(valor('month')), ano: valor('year') }
}

export function diasDoServico(inicio: string | null, fim: string | null): string {
  if (!inicio) return fim ? dataBr(fim) : ''
  return !fim || fim.slice(0, 10) === inicio.slice(0, 10) ? dataBr(inicio) : `${dataBr(inicio)} a ${dataBr(fim)}`
}

export function nomeArquivoOrcamento(nome: string, hoje = new Date()): string {
  const { dia, mes } = hojeSp(hoje)
  const limpo = nome.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR')
  return `ORÇAMENTO ${limpo} - ${dia}-${String(mes).padStart(2, '0')}.pdf`
}

/** O parágrafo do contrato (ICD_1574138) só vale para Johnson&Johnson/Kenvue. */
export const ehJohnson = (cliente: string) => /johnson|j\s*&\s*j|kenvue/i.test(cliente)

export function blocosDoOrcamento(dados: DadosOrcamento): Bloco[] {
  const { dia, mes, ano } = hojeSp(dados.hoje ?? new Date())
  const nome = dados.nome.trim()
  return [
    { trechos: [{ t: `São José dos Campos, ${dia} de ${MESES[mes - 1]} de ${ano}` }] },
    { trechos: [{ t: `Aos cuidados de: ${nome}`, b: true }], espacoAntes: 8 },
    { trechos: [{ t: 'Cliente: ', b: true }, { t: dados.cliente.trim() }], espacoAntes: 8 },
    { trechos: [{ t: 'Assunto: ', b: true }, { t: `Serviços prestados de transporte para equipe de ${nome}` }], espacoAntes: 8 },
    { pontilhado: true },
    ...(ehJohnson(dados.cliente) ? [{ trechos: [{ t: 'Cfe reportado, o contrato entre Betinhos e Johnson&Johnson/Kenvue está vigente, renovado por mais um período qual possui o ICD_1574138, assim sendo, os pedidos podem seguir o fluxo via Ariba, uma vez que somos cadastrados e estamos com o contrato ativo.' }] }] : []),
    { marcador: '1)', recuo: 18, espacoAntes: 14, trechos: [{ t: 'DOS SERVIÇOS', b: true }, { t: ': Serviços prestados de transporte para ' }, { t: `equipe de ${nome} nos dias ${diasDoServico(dados.inicio, dados.fim)}`, b: true }] },
    { marcador: '2)', recuo: 18, trechos: [{ t: 'DOS VALORES', b: true }, { t: ': Para o atendimento ao item 1 acima, formalizamos o valor total de ' }, { t: formatCurrency(dados.valorCents), b: true }] },
    { trechos: [{ t: 'sendo possível o pagamento via Ariba.' }] },
    { marcador: '3)', recuo: 18, espacoAntes: 14, trechos: [{ t: 'CONSIDERAÇÕES FINAIS', b: true }] },
    { recuo: 22, espacoAntes: 12, trechos: [{ t: '• BETINHO\'S LOCADORA AUTOMOVEIS LTDA (50002753LAM) / CNPJ: 07.108.241/0001-06' }] },
    { recuo: 22, trechos: [{ t: '• Lei complementar 16.01' }] },
    { recuo: 18, espacoAntes: 14, trechos: [{ t: 'Sem mais.' }] }
  ]
}

// Helvetica padrão só codifica WinAnsi: caractere fora dele perde o acento ou vira "?".
function seguro(texto: string, fonte: PDFFont): string {
  return [...texto].map((c) => {
    for (const tentativa of [c, c.normalize('NFD').replace(/[̀-ͯ]/g, '')]) {
      try { fonte.encodeText(tentativa); return tentativa } catch { /* tenta a próxima */ }
    }
    return '?'
  }).join('')
}

// A4 em pontos; posição do timbrado e margens do modelo .docx (página 595 × 842).
const PAGINA = { l: 595.28, a: 841.89 }
const TIMBRADO = { x: 21, y: 21, l: 561.5, a: 803.3 }
const ESQ = 105, DIR = 545, TOPO = 690, TAM = 10.5, ENTRELINHA = 14.5

export async function gerarPdfOrcamento(timbrado: Uint8Array, dados: DadosOrcamento): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(nomeArquivoOrcamento(dados.nome, dados.hoje).replace(/\.pdf$/, ''))
  const pagina = pdf.addPage([PAGINA.l, PAGINA.a])
  pagina.drawImage(await pdf.embedPng(timbrado), { x: TIMBRADO.x, y: TIMBRADO.y, width: TIMBRADO.l, height: TIMBRADO.a })
  const fontes = { n: await pdf.embedFont(StandardFonts.Helvetica), b: await pdf.embedFont(StandardFonts.HelveticaBold) }
  const cor = rgb(0.13, 0.13, 0.13)
  let y = TOPO

  for (const bloco of blocosDoOrcamento(dados)) {
    if ('pontilhado' in bloco) {
      y -= 12
      for (let x = ESQ; x < DIR; x += 2.4) pagina.drawRectangle({ x, y, width: 1.2, height: 1.2, color: cor })
      y -= 22
      continue
    }
    y -= bloco.espacoAntes ?? 0
    const inicio = ESQ + (bloco.recuo ?? 0)
    if (bloco.marcador) pagina.drawText(bloco.marcador, { x: ESQ, y, size: TAM, font: fontes.n, color: cor })
    let x = inicio
    for (const trecho of bloco.trechos) {
      const fonte = trecho.b ? fontes.b : fontes.n
      for (const palavra of seguro(trecho.t, fonte).split(/(?<= )/)) {
        const largura = fonte.widthOfTextAtSize(palavra, TAM)
        if (x > inicio && x + fonte.widthOfTextAtSize(palavra.trimEnd(), TAM) > DIR) { y -= ENTRELINHA; x = inicio }
        pagina.drawText(palavra, { x, y, size: TAM, font: fonte, color: cor })
        x += largura
      }
    }
    y -= ENTRELINHA
  }
  return pdf.save()
}

/** Abre o PDF numa aba nova. A aba é aberta já no clique (antes do await) para o bloqueador de pop-up não barrar. */
export async function abrirOrcamento(dados: DadosOrcamento): Promise<void> {
  const aba = window.open('', '_blank')
  try {
    const timbrado = new Uint8Array(await (await fetch(timbradoUrl)).arrayBuffer())
    const pdf = await gerarPdfOrcamento(timbrado, dados)
    const url = URL.createObjectURL(new Blob([pdf as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }))
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000)
    if (aba) { aba.location.href = url; return }
    // Pop-up bloqueado: baixa o PDF.
    const link = document.createElement('a')
    link.href = url
    link.download = nomeArquivoOrcamento(dados.nome, dados.hoje)
    document.body.append(link)
    link.click()
    link.remove()
  } catch (error) {
    aba?.close()
    throw error
  }
}
