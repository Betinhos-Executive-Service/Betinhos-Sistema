import { DIA_MS, DIAS_TACITA, somarDiasUteis } from '../domain/regras'
import type { LinhaPreco, Mensagem, Servico, Status } from '../domain/types'

// Dados fictícios para o protótipo: nomes, pedidos e valores não vêm do Dataverse.
const CRS = ['501019604 · Manutenção', '501019611 · Engenharia', '501019720 · Comercial']
const ROTAS: [string, string][] = [
  ['Tenaris Confab, Pindamonhangaba', 'Aeroporto de Guarulhos (GRU)'],
  ['Aeroporto de Guarulhos (GRU)', 'Tenaris Confab, Pindamonhangaba'],
  ['Tenaris Confab, Pindamonhangaba', 'Aeroporto de Congonhas (CGH)'],
  ['Hotel Ibis, Taubaté', 'Tenaris Confab, Pindamonhangaba'],
  ['Tenaris Confab, Pindamonhangaba', 'Av. Paulista, 1000, São Paulo'],
  ['Tenaris Confab, Pindamonhangaba', 'Aeroporto de São José dos Campos (SJK)'],
]
const PASSAGEIROS = [
  'Carla Menezes', 'Rafael Duarte', 'Hiroshi Tanaka', 'Juliana Prado', 'Marco Antonelli', 'Fernanda Lopes',
  'Diego Ramírez', 'Patrícia Sato', 'Bruno Carvalho', 'Ana Beatriz Rocha', 'Lucas Ferreira', 'Mariana Vidal',
]
const SOLICITANTES = ['Paula Ribeiro', 'Eduardo Nogueira', 'Sônia Matos']
const VEICULOS = ['Sedan executivo', 'SUV executiva', 'Van executiva']

const PLANO: Status[] = [
  ...Array<Status>(14).fill('liberado'),
  ...Array<Status>(4).fill('em_duvida'),
  ...Array<Status>(3).fill('respondido'),
  ...Array<Status>(6).fill('aprovado'),
  ...Array<Status>(3).fill('aprovado_tacito'),
]

const DUVIDAS: { motivo: Mensagem['motivo']; cliente: string; betinhos?: string }[] = [
  { motivo: 'espera', cliente: 'Por que foram cobradas 2h de espera? O voo pousou no horário.', betinhos: 'O passageiro saiu do desembarque às 16h40, 1h55 depois do pouso, por causa da bagagem extraviada. A cobrança começa após 30 min de tolerância. Segue o registro de chegada no voucher.' },
  { motivo: 'km_rota', cliente: 'A rota não deveria ser pela Dutra direto? O km parece alto.', betinhos: 'A Dutra estava interditada no km 98 (acidente). O desvio pela Carvalho Pinto somou 34 km, cobrados no item Adequação de rota.' },
  { motivo: 'valor', cliente: 'O valor está diferente do contrato para este trecho.', betinhos: 'Corrigimos: era tarifa de SUV, mas o pedido foi de sedan. O valor já foi ajustado.' },
  { motivo: 'passageiro', cliente: 'O Rafael não viajou neste dia, confirmar quem estava no carro.' },
  { motivo: 'outro', cliente: 'Pode confirmar o centro de custo? Esta viagem foi da Engenharia.' },
]

function composicao(i: number): LinhaPreco[] {
  const base = [{ rotulo: 'Diária', valor: 680 + (i % 4) * 45 }, { rotulo: 'Pedágios', valor: 38.4 + (i % 3) * 12.2 }]
  if (i % 3 === 0) base.push({ rotulo: 'Tempo de espera', valor: 95 * (1 + (i % 2)) })
  if (i % 4 === 1) base.push({ rotulo: 'Estacionamento', valor: 42 })
  if (i % 5 === 2) base.push({ rotulo: 'Adequação de rota', valor: 118.5 })
  if (i % 7 === 3) base.push({ rotulo: 'Passageiro adicional', valor: 60 })
  return base
}

const somar = (linhas: LinhaPreco[]) => Math.round(linhas.reduce((t, l) => t + l.valor, 0) * 100) / 100

/** 30 serviços de um mês, com saídas e liberações relativas a `agora` para os prazos fazerem sentido em qualquer dia. */
export function gerarServicos(agora: Date): Servico[] {
  return PLANO.map((status, i) => {
    const liberadoEm = new Date(agora.getTime() - ((i * 7) % 9 + (status.startsWith('aprovado') ? 8 : 0)) * DIA_MS - (i % 5) * 3600_000)
    const saida = new Date(liberadoEm.getTime() - (1 + (i % 3)) * DIA_MS)
    const numero = `RV-${48210 + i * 3}`
    saida.setUTCHours(8 + (i % 10), (i * 13) % 60, 0, 0)
    const [origem, destino] = ROTAS[i % ROTAS.length]
    const linhas = composicao(i)
    const passageiros = [PASSAGEIROS[i % PASSAGEIROS.length], ...(i % 4 === 0 ? [PASSAGEIROS[(i + 5) % PASSAGEIROS.length]] : [])]
    const s: Servico = {
      id: `srv-${i + 1}`,
      numero,
      pedidoCliente: `TN-2026${10400 + i * 7}`,
      cr: CRS[i % CRS.length],
      saida: saida.toISOString(),
      origem,
      destino,
      passageiros,
      solicitante: SOLICITANTES[i % SOLICITANTES.length],
      veiculo: VEICULOS[i % VEICULOS.length],
      status,
      liberadoEm: liberadoEm.toISOString(),
      prazoTacito: somarDiasUteis(liberadoEm.toISOString(), DIAS_TACITA),
      valorTotal: somar(linhas),
      composicao: linhas,
      voucherUrl: i % 6 === 5 ? undefined : `https://exemplo.betinhos.com.br/voucher/${numero}.pdf`,
      mensagens: [],
    }
    if (i % 5 === 1) s.observacao = 'Passageiro pediu parada rápida na farmácia; sem cobrança adicional.'
    if (i === 2 || i === 9) {
      s.valorAnterior = Math.round((s.valorTotal + 140) * 100) / 100
      s.observacao = 'Valor corrigido: o pedido era de sedan e foi cobrado como SUV.'
    }
    if (status === 'em_duvida' || status === 'respondido') {
      const d = DUVIDAS[i % DUVIDAS.length]
      const aberta = new Date(liberadoEm.getTime() + 20 * 3600_000).toISOString()
      s.mensagens.push({ id: `${s.id}-m1`, lado: 'cliente', autor: 'Marcos Albuquerque', texto: d.cliente, motivo: d.motivo, criadaEm: aberta })
      if (status === 'respondido') {
        s.mensagens.push({
          id: `${s.id}-m2`, lado: 'betinhos', autor: 'Juliana · Financeiro Betinhos',
          texto: d.betinhos ?? 'Conferimos com a operação e está correto conforme o voucher.',
          criadaEm: new Date(new Date(aberta).getTime() + 2 * 3600_000).toISOString(),
        })
        s.prazoTacito = somarDiasUteis(s.mensagens[1].criadaEm, DIAS_TACITA)
      }
    }
    if (status === 'aprovado') {
      s.aprovadoPor = 'Marcos Albuquerque'
      s.aprovadoEm = new Date(liberadoEm.getTime() + 26 * 3600_000).toISOString()
    }
    if (status === 'aprovado_tacito') s.aprovadoEm = `${s.prazoTacito}T23:59:00-03:00`
    return s
  })
}
