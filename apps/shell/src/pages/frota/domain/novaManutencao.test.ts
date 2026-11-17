// apps/shell/src/pages/frota/domain/novaManutencao.test.ts
import { describe, expect, it } from 'vitest'
import { validarNova, valoresNovaIniciais } from './novaManutencao'

const hoje = '2026-11-18'

describe('nova manutenção', () => {
  it('exige veículo, descrição, grau e km', () => {
    const r = validarNova(valoresNovaIniciais(hoje), hoje)
    expect(r.input).toBeNull()
    expect(r.erros).toEqual({ veiculoId: 'Escolha o veículo', descricao: 'Descreva o problema', grau: 'Escolha o grau', km: 'Informe o km atual (número inteiro)' })
  })

  it('monta a manutenção Solicitada; tipo e quem pediu são opcionais; sem encaixe', () => {
    const r = validarNova({ ...valoresNovaIniciais(hoje), veiculoId: 'v1', descricao: ' Freio rangendo ', grau: '3', km: '85000' }, hoje)
    expect(r).toEqual({ erros: {}, input: { veiculoId: 'v1', descricao: 'Freio rangendo', grau: 3, tipo: null, km: 85000, solicitanteId: null }, encaixe: null })
  })

  it('com "já encaixar", devolve a janela e o comentário; janela inválida bloqueia', () => {
    const base = { ...valoresNovaIniciais(hoje), veiculoId: 'v1', descricao: 'Freio', grau: '4', tipo: '2', km: '85000', solicitanteId: 'f1', encaixar: true }
    expect(validarNova({ ...base, janela: { modo: 'semana', dia: hoje, semana: '2026-11-23', comentario: 'Levar cedo' } }, hoje)).toEqual({
      erros: {}, input: { veiculoId: 'v1', descricao: 'Freio', grau: 4, tipo: 2, km: 85000, solicitanteId: 'f1' }, encaixe: { janela: { inicio: '2026-11-23', fim: '2026-11-29' }, comentario: 'Levar cedo' },
    })
    const ruim = validarNova({ ...base, janela: { modo: 'dia', dia: '2026-11-10', semana: '2026-11-16', comentario: '' } }, hoje)
    expect(ruim.input).toBeNull()
    expect(ruim.erros).toEqual({ janela: { dia: 'A janela não pode terminar antes de hoje' } })
  })

  it('o km é inteiro (a coluna é número inteiro) e a descrição respeita o limite', () => {
    const base = { ...valoresNovaIniciais(hoje), veiculoId: 'v1', descricao: 'Freio', grau: '3' }
    for (const km of ['85200.5', '85.200', '0', '2147483648']) expect(validarNova({ ...base, km }, hoje).erros.km, km).toBe('Informe o km atual (número inteiro)')
    expect(validarNova({ ...base, km: '85200' }, hoje).input?.km).toBe(85200)
    expect(validarNova({ ...base, km: '1', descricao: 'x'.repeat(4001) }, hoje).erros.descricao).toBe('Máximo de 4000 caracteres')
  })
})
