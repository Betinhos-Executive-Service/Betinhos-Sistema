import { mockServicos } from '../pagantes/data/mock'
import type { FinanceiroServico, Recebimento } from './domain'

const MOTORISTAS = ['Carlos Souza', 'Marcos Lima', 'Paulo Reis']
/** Quantos comprovantes cada serviço fictício tem (pelo id): metade sem nenhum, um com 3 fotos e 1 vídeo, um com PDF. */
const QUANTIDADES = [0, 0, 1, 2, 4, 5, 0, 3]

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

/** Comprovantes fictícios do serviço, sem link nem dado real (o arquivo é gerado no navegador). */
export function mockRecebimentos(reservaId: string): Recebimento[] {
  const id = reservaId.toLowerCase()
  const h = hash(id)
  const n = QUANTIDADES[h % QUANTIDADES.length]
  const base = new Date(2026, 10, 12, 9, 0)
  return Array.from({ length: n }, (_, i) => {
    const midia = i === 3 ? 'video' : i === 4 ? 'pdf' : 'foto'
    const falhou = n === 2 && i === 1
    const nome = midia === 'video' ? `recebimento-${i + 1}.mp4` : midia === 'pdf' ? `recibo-${i + 1}.pdf` : `recebimento-${i + 1}.jpg`
    return {
      id: `${id}-rec-${i + 1}`,
      nome,
      url: falhou ? null : `https://example.com/recebimento/${id}/${i + 1}`,
      midia,
      reservaId: id,
      ordem: i + 1,
      enviadoEm: new Date(base.getTime() + i * 60_000),
      motorista: MOTORISTAS[h % MOTORISTAS.length],
      tipo: i === 2 ? 'Foto complementar' : 'Comprovante',
      status: falhou ? 100000002 : 100000001,
      statusTexto: falhou ? 'Falhou' : 'Enviado',
    }
  })
}

const FORMAS = ['Cartão de crédito', 'Pix', 'Pedido de compra', '']

/** Valor e forma fictícios, estáveis pelo id do serviço. */
export function mockFinanceiro(reservaId: string): FinanceiroServico {
  const h = hash(reservaId.toLowerCase())
  return { valorAReceber: h % 5 ? 180 + (h % 900) : null, receber: h % 3 ? true : h % 2 ? false : null, formaPagamento: FORMAS[h % FORMAS.length] }
}

/** Comprovantes por OP fictícia: a soma dos serviços de exemplo dela (os mesmos da ficha); OP sem nenhum fica de fora. */
export function mockContagemPorOp(opIds: string[]) {
  const contagem = new Map<string, number>()
  for (const id of opIds) {
    const n = mockServicos(id, new Date()).reduce((soma, s) => soma + mockRecebimentos(s.id).length, 0)
    if (n > 0) contagem.set(id.toLowerCase(), n)
  }
  return contagem
}
