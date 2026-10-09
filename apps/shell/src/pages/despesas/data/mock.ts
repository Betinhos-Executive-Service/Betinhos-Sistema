import { ANEXO, FINANCEIRO, OPERACIONAL } from '../domain/status'
import type { Anexo, Despesa } from '../domain/types'

const CATEGORIAS = [['cat-1', 'Combustível'], ['cat-2', 'Pedágio'], ['cat-3', 'Estacionamento'], ['cat-4', 'Alimentação'], ['cat-5', 'Hospedagem'], ['cat-6', 'Lavagem']] as const
const FORMAS = [['fp-1', 'Cartão empresa'], ['fp-2', 'Pix motorista'], ['fp-3', 'Tag CTF'], ['fp-4', 'Dinheiro motorista']] as const
const MOTORISTAS = [['mot-1', 'Carlos Oliveira'], ['mot-2', 'Ana Ribeiro'], ['mot-3', 'Marcos Lima'], ['mot-4', 'Juliana Souza']] as const
const VEICULOS = [['vei-1', 'Mercedes S500 · FJK-2B19'], ['vei-2', 'Toyota Corolla Cross · RTA-4C21']] as const
const LOCAIS = ['Posto Shell Faria Lima', 'Ecovias Imigrantes', 'Estapar GRU T3', 'Restaurante Frango Assado', 'Hotel Ibis Campinas', 'Lava Rápido Itaim']

/** ~30 despesas de exemplo do `pnpm dev`, cobrindo todos os status e alertas. */
export function createMockDespesas(now: Date): Despesa[] {
  return Array.from({ length: 30 }, (_, i): Despesa => {
    const n = i + 1
    const c = i % CATEGORIAS.length
    const data = new Date(now)
    data.setDate(data.getDate() - i * 4)
    data.setHours(8 + (i % 10), 20, 0, 0)
    const [motoristaId, motorista] = MOTORISTAS[i % MOTORISTAS.length]
    const [veiculoId, veiculo] = VEICULOS[i % VEICULOS.length]
    const [formaId, forma] = FORMAS[i % FORMAS.length]
    const operacional = i === 2 || i === 9 ? OPERACIONAL.corrigir : i === 5 ? OPERACIONAL.recusado : i === 0 || i === 7 ? OPERACIONAL.enviado : i === 13 ? OPERACIONAL.cancelado : OPERACIONAL.validado
    const financeiro = i === 13 ? FINANCEIRO.cancelado : forma.includes('motorista') ? (i < 12 ? FINANCEIRO.aguardando : FINANCEIRO.pago) : FINANCEIRO.naoReembolsavel
    return {
      id: `mock-desp-${n}`,
      nome: `${CATEGORIAS[c][1]} · ${motorista.split(' ')[0]}`,
      data,
      valor: [212.4, 38.9, 64, 57.5, 289, 45][c] + (i % 3) * 7.35,
      estabelecimento: LOCAIS[c],
      categoriaId: CATEGORIAS[c][0], categoria: CATEGORIAS[c][1],
      formaId, forma,
      motoristaId, motorista,
      veiculoId, veiculo,
      reservaId: i % 3 === 0 ? `mock-res-${n}` : '', reserva: i % 3 === 0 ? `R-${10230 + n}` : '',
      manutencaoId: '', manutencao: '',
      cidade: i % 2 ? 'São Paulo' : 'Guarulhos',
      statusOperacional: operacional,
      statusFinanceiro: financeiro,
      statusAnexo: i === 4 ? ANEXO.falhou : i === 1 ? ANEXO.enviando : i % 5 === 3 ? ANEXO.sem : ANEXO.completo,
      origem: i > 25 ? 100000003 : 100000000,
      km: c === 0 ? 48210 + i * 130 : null,
      litros: c === 0 ? 41.2 : null,
      observacao: i === 2 ? 'Abasteci antes de buscar o passageiro no aeroporto.' : '',
      observacaoInterna: i === 2 ? 'Foto do cupom ilegível; pedir nova foto.' : '',
      protocolo: `DESP-${String(5000 + n)}`,
      possivelDuplicidade: i === 6 || i === 11,
      latitude: c === 0 ? -23.5868 : null,
      longitude: c === 0 ? -46.6823 : null,
      criadoEm: data,
      criadoPor: 'App Motoristas',
      alteradoEm: data,
      alteradoPor: 'App Motoristas',
    }
  })
}

export function createMockAnexos(d: Despesa): Anexo[] {
  if (d.statusAnexo === ANEXO.sem) return []
  const base = { enviadoEm: d.criadoEm, enviadoPor: d.motorista }
  const comprovante: Anexo = { id: `${d.id}-a1`, nome: `cupom-${d.protocolo.toLowerCase()}.jpg`, tipo: 100000000, status: d.statusAnexo === ANEXO.falhou ? 100000002 : 100000001, url: d.statusAnexo === ANEXO.falhou ? null : 'https://example.com/comprovante.jpg', ...base }
  return d.categoria === 'Combustível'
    ? [comprovante, { id: `${d.id}-a2`, nome: 'painel-km.jpg', tipo: 100000001, status: 100000001, url: 'https://example.com/painel.jpg', ...base }]
    : [comprovante]
}
