import { mockVolume } from '../../../app/mockVolume'
import type { ChoiceSet, Contato, Pagante, ServicoOp } from '../domain/types'
import { ETAPA, GERACAO_RECIBO, RECIBO, STATUS } from '../domain/status'
import { FALLBACK_CHOICES } from '../domain/choices'

export const MOCK_CHOICES: ChoiceSet = FALLBACK_CHOICES

const PESSOAS: (Contato & { id: string })[] = [
  { id: 'p1', nome: 'Mariana Albuquerque', telefone: '(11) 99812-4410', email: 'mariana@exemplo.com.br', cliente: 'Grupo Atlântico' },
  { id: 'p2', nome: 'Ricardo Menezes', telefone: '(21) 98765-1200', email: 'ricardo@exemplo.com.br', cliente: 'Grupo Atlântico' },
  { id: 'p3', nome: 'Helena Prado', telefone: '', email: 'helena@exemplo.com.br', cliente: 'Lumen Consultoria' },
  { id: 'p4', nome: 'Paulo Tavares', telefone: '11 3456-7788', email: '', cliente: 'Particular' },
  { id: 'p5', nome: 'Juliana Costa', telefone: '(11) 97777-0101', email: 'juliana@exemplo.com.br', cliente: 'Lumen Consultoria' },
]

const days = (now: Date, n: number, h = 10) => { const d = new Date(now); d.setDate(d.getDate() - n); d.setHours(h, 15, 0, 0); return d }

/** Dados de exemplo do `pnpm dev`: cobre todos os status e as falhas de envio. */
export function createMockPagantes(now: Date, extra = mockVolume()): Pagante[] {
  const make = (n: number, pessoa: number, op: number, valor: number, forma: number, status: number, extra: Partial<Pagante> = {}): Pagante => ({
    id: `mock-pag-${n}`, codigo: `PAG-${1200 + n}`,
    pessoaId: PESSOAS[pessoa].id, pessoa: PESSOAS[pessoa].nome,
    opId: `mock-op-${op}`, op: `OP-${400 + op}`,
    valor, forma, status, recibo: null,
    linkPagamento: forma === 202410001 ? '' : `https://cielolink.com.br/exemplo-${n}`, linkRecibo: '',
    ultimoLembrete: null, criadoEm: days(now, n * 3), alteradoEm: days(now, n * 3),
    link: { status: forma === 202410001 ? ETAPA.naoAplicavel : ETAPA.concluido, erro: '' },
    email: { status: ETAPA.concluido, erro: '', enviadoEm: days(now, n * 3, 11) },
    reciboGeracao: { status: null, erro: '' }, pagoEm: null,
    ...extra,
  })
  // `?volume=N` do pnpm dev: N pagantes a mais, ligados às OPs de volume (mesmos índices) e espalhados por 2 anos.
  const status = [STATUS.pendente, STATUS.pago, STATUS.autorizado, STATUS.expirado]
  const volume = Array.from({ length: extra }, (_, i) => make(1000 + i, i % PESSOAS.length, 100 + i, 200 + (i % 41) * 37.5, [202410000, 202410001, 202410002][i % 3], status[i % 4], {
    codigo: `PAG-${5000 + i}`, op: `OP-${2000 + i}`, criadoEm: days(now, Math.floor(i / 8) % 730), alteradoEm: days(now, Math.floor(i / 8) % 730),
  }))
  return [
    make(1, 0, 1, 1250, 202410002, STATUS.pendente, { ultimoLembrete: days(now, 1, 9) }),
    make(2, 1, 1, 1250, 202410000, STATUS.pago, { recibo: RECIBO.enviado, linkRecibo: 'https://onedrive.exemplo/recibo-2.pdf', alteradoEm: days(now, 2) }),
    make(3, 2, 2, 860.5, 202410000, STATUS.negado, { alteradoEm: days(now, 5) }),
    make(4, 3, 3, 2400, 202410002, STATUS.pendente, { link: { status: ETAPA.erro, erro: 'A Cielo recusou a criação do link: valor acima do limite.' }, email: { status: ETAPA.erro, erro: 'Falha no link impediu o e-mail.', enviadoEm: null }, linkPagamento: '' }),
    make(5, 4, 4, 540, 202410000, STATUS.autorizado, { recibo: RECIBO.gerado, reciboGeracao: { status: GERACAO_RECIBO.erro, erro: 'O Word não converteu o recibo em PDF.' } }),
    make(6, 0, 5, 980, 202410001, STATUS.pago, { alteradoEm: days(now, 15) }),
    make(7, 1, 6, 1320, 202410000, STATUS.expirado),
    make(8, 4, 7, 310, 202410002, STATUS.cancelado),
    make(9, 2, 8, 1999.9, 202410000, STATUS.aguardandoFacial),
    make(10, 3, 9, 760, 202410002, STATUS.naoFinalizado, { email: { status: ETAPA.erro, erro: 'Pessoa sem e-mail cadastrado.', enviadoEm: null } }),
    make(25, 0, 10, 4200, 202410000, STATUS.pago, { recibo: RECIBO.enviado, linkRecibo: 'https://onedrive.exemplo/recibo-25.pdf' }),
    make(40, 1, 11, 1500, 202410002, STATUS.pendente),
    // Casos reais de DEV: pagante antigo sem pessoa e sem OP; pendente com recibo emitido e sem link Cielo.
    make(12, 0, 0, 640, 202410001, STATUS.pendente, { pessoaId: '', pessoa: '', opId: '', op: '', linkPagamento: '', recibo: RECIBO.enviado, linkRecibo: 'https://onedrive.exemplo/recibo-12.pdf', link: { status: ETAPA.naoAplicavel, erro: '' }, email: { status: ETAPA.naoAplicavel, erro: '', enviadoEm: null } }),
    ...volume,
  ]
}

export const MOCK_CONTATOS = new Map(PESSOAS.map(({ id, ...c }) => [id, c]))

export function mockServicos(opId: string, now: Date): ServicoOp[] {
  const n = Number(opId.replace(/\D/g, '')) || 1
  return Array.from({ length: (n % 3) + 1 }, (_, i) => ({
    id: `${opId}-s${i}`, codigo: `${3100 + n * 10 + i}`, data: days(now, n * 3 + 2 - i, 7 + i * 3),
    destino: ['Aeroporto de Guarulhos', 'Av. Faria Lima, 3500', 'Hotel Unique'][i % 3], status: 'Concluído', valor: n === 1 ? 2500 / ((n % 3) + 1) : null,
  }))
}
