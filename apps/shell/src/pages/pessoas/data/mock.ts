import { mockVolume } from '../../../app/mockVolume'
import { CLASSIFICACAO, IDIOMA, STATUS } from '../domain/choices'
import type { Cliente, Historico, Pessoa } from '../domain/types'

export const MOCK_CLIENTES: Cliente[] = [
  { id: '11111111-1111-4111-8111-111111111111', nome: 'Grupo Atlântico' },
  { id: '22222222-2222-4222-8222-222222222222', nome: 'Lumen Consultoria' },
  { id: '33333333-3333-4333-8333-333333333333', nome: 'Particular' },
]

const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`

function pessoa(n: number, nome: string, cliente: number | null, extra: Partial<Pessoa> = {}): Pessoa {
  const c = cliente == null ? null : MOCK_CLIENTES[cliente]
  return {
    id: id(n), nome, clienteId: c?.id ?? '', cliente: c?.nome ?? '', telefone: '', email: '',
    cargo: null, classificacao: CLASSIFICACAO.frequente, idioma: IDIOMA.portugues, status: STATUS.ativo, sexo: null, tipoVeiculo: null,
    departamento: '', cr: '', endereco: '', preferencias: '', nascimento: '', cadastro: '2026-01-10', ultimoServico: '', foto: '', criadoEm: new Date('2026-01-10T12:00:00Z'),
    ...extra,
  }
}

// Ids de cadastros novos no mock: contínuos entre aberturas da tela (o cache da lista guarda os já criados).
let seq = 100_000
export const nextMockId = () => id(++seq)

const NOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabriela', 'Hugo', 'Isabela', 'João', 'Larissa', 'Marcelo', 'Natália', 'Otávio', 'Paula', 'Rafael']
const SOBRENOMES = ['Almeida', 'Barbosa', 'Cardoso', 'Duarte', 'Esteves', 'Ferraz', 'Gomes', 'Holanda', 'Ibrahim', 'Jardim', 'Lacerda', 'Moraes', 'Nogueira', 'Orsini', 'Pacheco', 'Quintela']

/** Pessoas geradas para o `?volume=` do pnpm dev (desempenho com milhares de registros). */
function volume(total: number): Pessoa[] {
  return Array.from({ length: total }, (_, i) => {
    const nome = `${NOMES[i % NOMES.length]} ${SOBRENOMES[Math.floor(i / NOMES.length) % SOBRENOMES.length]} ${i + 1}`
    return pessoa(1000 + i, nome, i % 3, { telefone: `(11) 9${String(10_000_000 + i).slice(0, 4)}-${String(i).padStart(4, '0').slice(-4)}`, email: `pessoa${i + 1}@exemplo.com.br`, ultimoServico: i % 4 ? '' : '2026-09-15' })
  })
}

/** Dados de exemplo do `pnpm dev`: inclui duplicados por celular, e-mail e nome+cliente; `?volume=N` acrescenta N. */
export function createMockPessoas(extra = mockVolume()): Pessoa[] {
  return [...base(), ...volume(extra)]
}

function base(): Pessoa[] {
  return [
    pessoa(1, 'Mariana Albuquerque', 0, { telefone: '(11) 99812-4410', email: 'mariana@exemplo.com.br', cargo: 202410003, departamento: 'Diretoria', preferencias: 'Água sem gás, ar em 21 °C.', ultimoServico: '2026-10-05' }),
    pessoa(2, 'Ricardo Menezes', 0, { telefone: '(21) 98765-1200', email: 'ricardo@exemplo.com.br', classificacao: CLASSIFICACAO.solicitante, cargo: 202410004 }),
    pessoa(3, 'Helena Prado', 1, { email: 'helena@exemplo.com.br', idioma: IDIOMA.ingles }),
    pessoa(4, 'Paulo Tavares', 2, { telefone: '11 3456-7788', classificacao: CLASSIFICACAO.visitante, status: STATUS.inativo }),
    pessoa(5, 'Juliana Costa', 1, { telefone: '(11) 97777-0101', email: 'juliana@exemplo.com.br' }),
    pessoa(6, 'Mariana Albuquerque', 0, { telefone: '', email: '', classificacao: CLASSIFICACAO.visitante }),
    pessoa(7, 'Mari Albuquerque', null, { telefone: '+55 11 99812-4410' }),
    pessoa(8, 'Helena Prado Lima', 1, { email: 'HELENA@exemplo.com.br' }),
    pessoa(9, 'John Carter', 1, { telefone: '(11) 96666-2020', email: 'john@exemplo.com', idioma: IDIOMA.ingles, cargo: 202410000 }),
    pessoa(10, 'Grupo Congresso Saúde', 2, { classificacao: CLASSIFICACAO.grupo }),
  ]
}

export function mockHistorico(pessoaId: string, now: Date): Historico {
  const n = Number(pessoaId.slice(-2)) || 1
  const d = (dias: number, h = 9) => { const x = new Date(now); x.setDate(x.getDate() - dias); x.setHours(h, 0, 0, 0); return x }
  return {
    servicos: Array.from({ length: (n % 4) + 1 }, (_, i) => ({
      id: `${pessoaId}-s${i}`, codigo: `OS-${1700 + n * 5 + i}`, data: d(i * 20 - 3, 7 + i), destino: ['Aeroporto de Guarulhos', 'Av. Faria Lima, 3500', 'Hotel Unique', 'Congonhas'][i % 4],
      status: i === 0 ? 'Agendado' : 'Concluído', tipo: i % 2 ? 'Transfer' : 'Disposição', papeis: i === 1 ? ['Solicitante', 'Passageiro'] : ['Passageiro'],
    })),
    pagantes: n % 2 ? [{ id: `${pessoaId}-p1`, codigo: `PAG-${200 + n}`, op: `OP-${40 + n}`, valor: 1250, status: 'Pendente', criadoEm: d(10) }] : [],
  }
}
