import { IA_DECISAO, IA_STATUS, IA_VAZIA, type AnaliseIA } from '../domain/ia'
import { ANEXO, FINANCEIRO, OPERACIONAL } from '../domain/status'
import { mimeDoArquivo } from '../domain/arquivo'
import type { Anexo, Arquivo, Despesa } from '../domain/types'

const CATEGORIAS = [['cat-1', 'Combustível'], ['cat-2', 'Pedágio'], ['cat-3', 'Estacionamento'], ['cat-4', 'Alimentação'], ['cat-5', 'Hospedagem'], ['cat-6', 'Lavagem']] as const
const FORMAS = [['fp-1', 'Cartão empresa'], ['fp-2', 'Pix motorista'], ['fp-3', 'Tag CTF'], ['fp-4', 'Dinheiro motorista']] as const
const MOTORISTAS = [['mot-1', 'Carlos Oliveira'], ['mot-2', 'Ana Ribeiro'], ['mot-3', 'Marcos Lima'], ['mot-4', 'Juliana Souza']] as const
const VEICULOS = [['vei-1', 'Mercedes S500 · FJK-2B19'], ['vei-2', 'Toyota Corolla Cross · RTA-4C21']] as const
/** Análise da IA de exemplo: suspeita (2, 9), processando (0), erro (7), sem análise (13 em diante) e validada no resto. */
function mockIA(i: number, valor: number, data: Date): AnaliseIA {
  if (i >= 13) return IA_VAZIA
  if (i === 0) return { ...IA_VAZIA, status: IA_STATUS.processando }
  if (i === 7) return { ...IA_VAZIA, status: IA_STATUS.erro, motivos: ['Comprovante ilegível para download (timeout no SharePoint).'] }
  const corrigir = i === 2 || i === 9
  const dia = data.toISOString().slice(0, 10)
  return {
    status: IA_STATUS.concluida,
    decisao: corrigir ? IA_DECISAO.corrigir : IA_DECISAO.validar,
    motivos: corrigir ? ['Valor do cupom diverge do lançado.', 'Cupom com data diferente da data do gasto.'] : ['Comprovante legível e coerente com o lançamento.'],
    valorLido: corrigir ? valor + 12.5 : valor,
    dataLida: dia, cnpjLido: '12.345.678/0001-90', estabelecimentoLido: 'Estabelecimento lido no cupom',
    confianca: corrigir ? 0.72 : 0.95, modelo: 'claude-mock', analisadaEm: data,
  }
}

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
    const valor = [212.4, 38.9, 64, 57.5, 289, 45][c] + (i % 3) * 7.35
    const financeiro = i === 13 ? FINANCEIRO.cancelado : forma.includes('motorista') ? (i < 12 ? FINANCEIRO.aguardando : FINANCEIRO.pago) : FINANCEIRO.naoReembolsavel
    return {
      id: `mock-desp-${n}`,
      nome: `${CATEGORIAS[c][1]} · ${motorista.split(' ')[0]}`,
      data,
      valor,
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
      ia: mockIA(i, valor, data),
    }
  })
}

export function createMockAnexos(d: Despesa): Anexo[] {
  if (d.statusAnexo === ANEXO.sem) return []
  const base = { enviadoEm: d.criadoEm, enviadoPor: d.motorista }
  const falhou = d.statusAnexo === ANEXO.falhou
  const comprovante: Anexo = {
    id: `${d.id}-a1`, nome: d.categoria === 'Hospedagem' ? `nota-${d.protocolo.toLowerCase()}.pdf` : `cupom-${d.protocolo.toLowerCase()}.jpg`,
    tipo: 100000000, status: falhou ? 100000002 : 100000001, url: falhou ? null : 'https://example.com/comprovante', driveItemId: falhou ? '' : `drive-${d.id}-1`, ...base,
  }
  // Comprovante antigo do App Motoristas: só o link, e o nome sem extensão.
  if (d.categoria === 'Lavagem') return [{ ...comprovante, nome: 'comprovante-1', driveItemId: '', url: 'https://example.com/compartilhado' }]
  return d.categoria === 'Combustível'
    ? [comprovante, { id: `${d.id}-a2`, nome: 'painel-km.jpg', tipo: 100000001, status: 100000001, url: 'https://example.com/painel', driveItemId: `drive-${d.id}-2`, ...base }]
    : [comprovante]
}

const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

/** Cupom desenhado em SVG (imagem) ou PDF mínimo, como data URL: o mock não depende de blob. */
export function createMockArquivo(anexo: Anexo): Arquivo {
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
