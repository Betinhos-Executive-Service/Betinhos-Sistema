import type { Recebimento } from './domain'

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
    const nome = midia === 'video' ? `recebimento-${i + 1}.mp4` : midia === 'pdf' ? `recibo-${i + 1}.pdf` : `recebimento-${i + 1}.jpg`
    return {
      id: `${id}-rec-${i + 1}`,
      nome,
      url: `https://example.com/recebimento/${id}/${i + 1}`,
      midia,
      reservaId: id,
      ordem: i + 1,
      enviadoEm: new Date(base.getTime() + i * 60_000),
      motorista: MOTORISTAS[h % MOTORISTAS.length],
    }
  })
}
