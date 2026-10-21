import { STATUS } from '../domain/choices'
import { emptyEquipamento } from '../domain/form'
import type { Equipamento, Pessoa, TipoEquipamento } from '../domain/types'

const id = (n: number) => `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`
const tid = (n: number) => `dddddddd-0000-4000-8000-${String(n).padStart(12, '0')}`

const TIPOS: [string, boolean][] = [
  ['Notebook', true], ['Monitor', true], ['Mouse', true], ['Teclado', true], ['Celular', true],
  ['Máquina de cartão', true], ['Impressora', true], ['Outro', true], ['Pager', false],
]

/** Tipos de exemplo; Pager inativo. */
export function createMockTipos(): TipoEquipamento[] {
  return TIPOS.map(([nome, ativo], i) => ({ id: tid(i + 1), nome, ativo }))
}

/** Mesmos ids e nomes do mock de Funcionários (aba da ficha); m5 fica inativo aqui para exercitar o selo. */
export function createMockPessoas(): Pessoa[] {
  return [
    { id: 'm1', nome: 'Carlos Alberto Teste', ativo: true },
    { id: 'm2', nome: 'Bruna Ficticia Lima', ativo: true },
    { id: 'm3', nome: 'Diego Exemplo Rocha', ativo: true },
    { id: 'm4', nome: 'Elaine Mock Duarte', ativo: true },
    { id: 'm5', nome: 'Fabio Demo Nunes', ativo: false },
  ]
}

/** Itens de exemplo: em uso, disponível, manutenção, baixado, responsável inativo e item sem série. */
export function createMockEquipamentos(): Equipamento[] {
  const tipos = createMockTipos()
  const pessoas = createMockPessoas()
  const make = (n: number, descricao: string, tipo: string, marcaModelo: string, numeroSerie: string, status: number, responsavelId: string | null, dataCompra: string | null = null, valorCompra: number | null = null): Equipamento => {
    const t = tipos.find((x) => x.nome === tipo)!
    return {
      ...emptyEquipamento(id(n)), descricao, tipoId: t.id, tipoNome: t.nome, marcaModelo, numeroSerie, status, responsavelId,
      responsavelNome: pessoas.find((p) => p.id === responsavelId)?.nome ?? '', dataCompra, valorCompra, modificadoEm: new Date('2026-10-01T12:00:00Z'),
    }
  }
  return [
    make(1, 'Notebook do Financeiro', 'Notebook', 'Dell Latitude 5440', 'DL5440-001', STATUS.emUso, 'm2', '2025-03-12', 5899.9),
    make(2, 'Notebook reserva', 'Notebook', 'Lenovo ThinkPad E14', 'TP-E14-778', STATUS.disponivel, null, '2024-11-04', 4299),
    make(3, 'Monitor 24" recepção', 'Monitor', 'LG 24MP400', 'LG24-3321', STATUS.emUso, 'm4', '2025-06-20', 799.9),
    make(4, 'Mouse sem fio', 'Mouse', 'Logitech M170', '', STATUS.emUso, 'm2'),
    make(5, 'Maquininha Carlos', 'Máquina de cartão', 'Stone S920', 'S920-55410', STATUS.emUso, 'm1'),
    make(6, 'Maquininha reserva', 'Máquina de cartão', 'Stone S920', 'S920-55411', STATUS.manutencao, null),
    make(7, 'Celular plantão', 'Celular', 'Samsung A15', 'A15-90011', STATUS.emUso, 'm5', '2025-01-15', 1099),
    make(8, 'Impressora antiga', 'Impressora', 'HP LaserJet 1102w', 'HP1102-01', STATUS.baixado, null, '2019-08-01', 899),
  ]
}
