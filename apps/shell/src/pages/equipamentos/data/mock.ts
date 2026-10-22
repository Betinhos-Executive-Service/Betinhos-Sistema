import { STATUS } from '../domain/choices'
import { emptyEquipamento } from '../domain/form'
import type { Foto } from '../domain/fotos'
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

/** Mesmos ids e nomes do mock de Funcionários (aba da ficha); m6 é o desligado de lá, inativo aqui (selo). */
export function createMockPessoas(): Pessoa[] {
  return [
    { id: 'm1', nome: 'Carlos Alberto Teste', ativo: true },
    { id: 'm2', nome: 'Bruna Ficticia Lima', ativo: true },
    { id: 'm3', nome: 'Diego Exemplo Rocha', ativo: true },
    { id: 'm4', nome: 'Elaine Mock Duarte', ativo: true },
    { id: 'm5', nome: 'Fabio Demo Nunes', ativo: true },
    { id: 'm6', nome: 'Gustavo Amostra Pires', ativo: false },
  ]
}

/** Itens de exemplo: em uso, disponível, manutenção, baixado, responsável inativo (m6), tipo inativo e item sem série. */
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
    make(7, 'Celular plantão', 'Celular', 'Samsung A15', 'A15-90011', STATUS.emUso, 'm6', '2025-01-15', 1099),
    make(8, 'Impressora antiga', 'Impressora', 'HP LaserJet 1102w', 'HP1102-01', STATUS.baixado, null, '2019-08-01', 899),
    make(9, 'Pager da portaria', 'Pager', 'Motorola LX2', 'LX2-0042', STATUS.disponivel, null),
  ]
}

/** O mock grava as fotos como no DEV: `Equipamentos/DEV/<id>/<arquivo>`. */
export const MOCK_ENV = 'DEV'

/** Imagem de exemplo (SVG) para o `pnpm dev`: fundo liso, um retângulo e o nome; não depende de arquivo. */
function imagemExemplo(nome: string, texto: string, fundo: string, frente: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="${fundo}"/><rect x="170" y="120" width="300" height="190" rx="14" fill="${frente}"/><rect x="130" y="320" width="380" height="22" rx="8" fill="${frente}"/><text x="320" y="410" font-family="sans-serif" font-size="30" text-anchor="middle" fill="#1f2937">${texto}</text></svg>`
  return new File([svg], nome, { type: 'image/svg+xml' })
}

/**
 * Fotos de exemplo: Notebook do Financeiro com duas (capa a primeira) e Maquininha Carlos com uma.
 * `arquivos` faz o papel do SharePoint (caminho → imagem).
 */
export function createMockFotos(): { fotos: Foto[]; arquivos: Map<string, Blob> } {
  const arquivos = new Map<string, Blob>()
  const foto = (n: number, equipamento: number, nome: string, capa: boolean, dia: string, texto: string, fundo: string, frente: string): Foto => {
    const caminho = `Equipamentos/${MOCK_ENV}/${id(equipamento)}/${nome}`
    arquivos.set(caminho, imagemExemplo(nome, texto, fundo, frente))
    return { id: `ffffffff-0000-4000-8000-${String(n).padStart(12, '0')}`, equipamentoId: id(equipamento), nome, capa, criadoEm: new Date(`${dia}T12:00:00Z`), caminho }
  }
  const fotos = [
    foto(1, 1, 'notebook-frente.jpg', true, '2026-10-02', 'Notebook — frente', '#dbeafe', '#64748b'),
    foto(2, 1, 'notebook-etiqueta.jpg', false, '2026-10-03', 'Notebook — etiqueta', '#e0e7ff', '#94a3b8'),
    foto(3, 5, 'maquininha.jpg', true, '2026-10-04', 'Máquina de cartão', '#dcfce7', '#475569'),
  ]
  return { fotos, arquivos }
}
