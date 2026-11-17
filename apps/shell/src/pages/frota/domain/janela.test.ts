import { describe, expect, it } from 'vitest'
import { MANUT } from '../data/schema'
import { atrasada, fimDaJanela, janelaDoDia, janelaValida, lerJanela, modoDe, rotuloJanela, segundaDe, semanaDe, semanasAPartirDe, somarDias, valoresJanelaIniciais } from './janela'

describe('janela do encaixe', () => {
  it('a semana vai de segunda a domingo, inclusive quando o dia é domingo', () => {
    expect(segundaDe('2026-11-18')).toBe('2026-11-16') // quarta
    expect(segundaDe('2026-11-16')).toBe('2026-11-16') // segunda
    expect(segundaDe('2026-11-22')).toBe('2026-11-16') // domingo
    expect(semanaDe('2026-11-22')).toEqual({ inicio: '2026-11-16', fim: '2026-11-22' })
    expect(somarDias('2026-12-30', 3)).toBe('2027-01-02')
  })

  it('valida como o servidor (Ciclo.ValidarJanela): um dia, ou segunda a domingo', () => {
    expect(janelaValida(janelaDoDia('2026-11-18'))).toBe(true)
    expect(janelaValida({ inicio: '2026-11-16', fim: '2026-11-22' })).toBe(true)
    expect(janelaValida({ inicio: '2026-11-17', fim: '2026-11-23' })).toBe(false) // terça a segunda
    expect(janelaValida({ inicio: '2026-11-16', fim: '2026-11-20' })).toBe(false) // segunda a sexta
    expect(janelaValida({ inicio: '18/11/2026', fim: '18/11/2026' })).toBe(false)
  })

  it('oferece a semana de hoje e as seguintes, com rótulo legível', () => {
    expect(semanasAPartirDe('2026-11-18', 3).map((s) => s.inicio)).toEqual(['2026-11-16', '2026-11-23', '2026-11-30'])
    expect(rotuloJanela({ inicio: '2026-11-16', fim: '2026-11-22' })).toBe('Semana de 16/11 a 22/11/2026')
    expect(rotuloJanela(janelaDoDia('2026-11-18'))).toBe('18/11/2026')
    expect(modoDe({ inicio: '2026-11-16', fim: '2026-11-22' })).toBe('semana')
    expect(modoDe(janelaDoDia('2026-11-18'))).toBe('dia')
  })

  it('atrasada: janela vencida em Agendado ou Programado; sem janela, a data antiga de agendamento', () => {
    const hoje = '2026-11-18'
    const m = (status: number, janelaFim: string | null, agendarPara: string | null = null) => ({ status, janelaFim, agendarPara })
    expect(atrasada(m(MANUT.AGENDADO, '2026-11-17'), hoje)).toBe(true)
    expect(atrasada(m(MANUT.PROGRAMADO, '2026-11-17'), hoje)).toBe(true)
    expect(atrasada(m(MANUT.AGENDADO, '2026-11-18'), hoje)).toBe(false) // vence hoje: ainda não está atrasada
    expect(atrasada(m(MANUT.SOLICITADO, '2026-11-01'), hoje)).toBe(false)
    expect(atrasada(m(MANUT.REALIZADO, '2026-11-01'), hoje)).toBe(false)
    expect(atrasada(m(MANUT.PROGRAMADO, null, '2026-11-10'), hoje)).toBe(true) // registro antigo
    expect(fimDaJanela({ janelaFim: '2026-11-22', agendarPara: '2026-11-10' })).toBe('2026-11-22')
  })

  it('valores iniciais: a semana de hoje; com janela gravada, ela', () => {
    expect(valoresJanelaIniciais(null, '2026-11-18', null)).toEqual({ modo: 'semana', dia: '2026-11-18', semana: '2026-11-16', comentario: '' })
    expect(valoresJanelaIniciais(janelaDoDia('2026-11-25'), '2026-11-18', 'Levar cedo')).toEqual({ modo: 'dia', dia: '2026-11-25', semana: '2026-11-23', comentario: 'Levar cedo' })
    expect(valoresJanelaIniciais({ inicio: '2026-11-23', fim: '2026-11-29' }, '2026-11-18', null)).toEqual({ modo: 'semana', dia: '2026-11-23', semana: '2026-11-23', comentario: '' })
  })

  it('reagendar com a janela já vencida abre com hoje (mesmo modo), nunca com a janela vencida; janela que termina hoje ou depois fica', () => {
    const hoje = '2026-11-18'
    expect(valoresJanelaIniciais({ inicio: '2026-11-09', fim: '2026-11-15' }, hoje, 'Levar cedo')).toEqual({ modo: 'semana', dia: hoje, semana: '2026-11-16', comentario: 'Levar cedo' })
    expect(valoresJanelaIniciais(janelaDoDia('2026-11-10'), hoje, null)).toEqual({ modo: 'dia', dia: hoje, semana: '2026-11-16', comentario: '' })
    expect(valoresJanelaIniciais({ inicio: '2026-11-16', fim: '2026-11-22' }, hoje, null)).toMatchObject({ modo: 'semana', semana: '2026-11-16' }) // semana corrente vale
    expect(valoresJanelaIniciais(janelaDoDia(hoje), hoje, null)).toMatchObject({ modo: 'dia', dia: hoje }) // vence hoje: ainda vale
  })

  it('lê dia ou semana; recusa janela que já passou e comentário longo', () => {
    const base = { modo: 'semana' as const, dia: '2026-11-18', semana: '2026-11-23', comentario: ' ok ' }
    expect(lerJanela(base, '2026-11-18', 100)).toEqual({ erros: {}, janela: { inicio: '2026-11-23', fim: '2026-11-29' }, comentario: 'ok' })
    expect(lerJanela({ ...base, modo: 'dia', dia: '2026-11-20', comentario: '' }, '2026-11-18', 100)).toEqual({ erros: {}, janela: { inicio: '2026-11-20', fim: '2026-11-20' }, comentario: null })
    expect(lerJanela({ ...base, semana: '2026-11-16' }, '2026-11-18', 100).janela).toEqual({ inicio: '2026-11-16', fim: '2026-11-22' }) // semana corrente vale
    expect(lerJanela({ ...base, modo: 'dia', dia: '' }, '2026-11-18', 100).erros).toEqual({ dia: 'Escolha o dia' })
    expect(lerJanela({ ...base, modo: 'dia', dia: '2026-11-17' }, '2026-11-18', 100).erros).toEqual({ dia: 'A janela não pode terminar antes de hoje' })
    expect(lerJanela({ ...base, semana: '2026-11-09' }, '2026-11-18', 100).erros).toEqual({ semana: 'A janela não pode terminar antes de hoje' })
    expect(lerJanela({ ...base, semana: '' }, '2026-11-18', 100).erros).toEqual({ semana: 'Escolha a semana' })
    expect(lerJanela({ ...base, comentario: 'x'.repeat(101) }, '2026-11-18', 100).erros).toEqual({ comentario: 'Máximo de 100 caracteres' })
  })
})
