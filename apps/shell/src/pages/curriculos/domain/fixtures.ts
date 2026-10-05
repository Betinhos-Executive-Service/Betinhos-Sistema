import type { Curriculo } from './types'

/** Currículo completo para testes; sobrescreva só o que importa. */
export function makeCurriculo(patch: Partial<Curriculo> = {}): Curriculo {
  return {
    id: 'x', nome: 'Candidato', cpf: '', email: '', telefone: '', whatsapp: '', cidade: '', estado: '', cargo: '',
    experiencia: '', ultimoCargo: '', ultimaEmpresa: '', pretensao: null, nota: null, indicadoPor: '',
    disponibilidade: null, cnh: null, origem: null, status: null, link: '', observacoes: '', criadoEm: null,
    ...patch,
  }
}
