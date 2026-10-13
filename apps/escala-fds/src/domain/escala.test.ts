import { describe, expect, it } from 'vitest'
import {
  aplicarPendencias, compromissosDoDia, descontarSalvas, diasUteis, planSave, recordKey, semPendencias, situacaoDoDia, weekendOf,
  type Compromisso, type Dados, type Excecao, type Motorista,
} from './escala'

const danilo: Motorista = { id: 'd', nome: 'Danilo', padrao: { sab: 'plantao', dom: 'plantao' }, terceiro: false }
const bruno: Motorista = { id: 'b', nome: 'Bruno', padrao: { sab: null, dom: null }, terceiro: true }
const exc = (motoristaId: string, data: string, situacao: Excecao['situacao']): Excecao => ({ id: `${motoristaId}-${data}`, motoristaId, data, situacao })
const mapa = (list: Excecao[]) => new Map(list.map((e) => [recordKey(e.motoristaId, e.data), e]))
const comp = (inicio: string, fim: string, diaInteiro = false): Compromisso =>
  ({ id: null, motoristaId: 'd', inicio, fim, diaInteiro, motivo: 'medico', observacao: '', registradoEm: null })

describe('weekendOf', () => {
  it('leva dias úteis ao próximo sábado e domingo ao sábado anterior', () => {
    expect(weekendOf(new Date(2026, 9, 5))).toBe('2026-10-10')
    expect(weekendOf(new Date(2026, 9, 11))).toBe('2026-10-10')
  })
})

describe('diasUteis', () => {
  it('vai de segunda a sexta antes do sábado, inclusive na virada do mês', () => {
    expect(diasUteis('2026-10-17')).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'])
    expect(diasUteis('2026-10-03')).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
  })
})

describe('situacaoDoDia', () => {
  it('usa a exceção, senão o padrão, senão nada', () => {
    const excecoes = mapa([exc('d', '2026-10-11', 'folga')])
    expect(situacaoDoDia(danilo, '2026-10-10', excecoes)).toEqual({ situacao: 'plantao', origem: 'padrao' })
    expect(situacaoDoDia(danilo, '2026-10-11', excecoes)).toEqual({ situacao: 'folga', origem: 'excecao' })
    expect(situacaoDoDia(bruno, '2026-10-10', excecoes)).toEqual({ situacao: null, origem: null })
    expect(situacaoDoDia(danilo, '2026-10-07', excecoes).situacao).toBeNull()
  })
})

describe('compromissosDoDia', () => {
  it('descreve o trecho do dia ocupado', () => {
    const textos = (c: Compromisso, data: string) => compromissosDoDia([c], data).map((r) => r.texto)
    expect(textos(comp('2026-10-10T00:00', '2026-10-10T12:00'), '2026-10-10')).toEqual(['Indisponível até 12h'])
    expect(textos(comp('2026-10-10T14:30', '2026-10-10T23:59'), '2026-10-10')).toEqual(['Indisponível a partir das 14h30'])
    expect(textos(comp('2026-10-07T10:00', '2026-10-07T12:00'), '2026-10-07')).toEqual(['Indisponível das 10h às 12h'])
    expect(textos(comp('2026-10-07T00:00', '2026-10-07T23:59', true), '2026-10-08')).toEqual([])
  })

  it('período de vários dias ocupa os dias do meio inteiros', () => {
    const ferias = comp('2026-10-09T00:00', '2026-10-12T23:59', true)
    expect(compromissosDoDia([ferias], '2026-10-10')[0]).toMatchObject({ diaTodo: true, texto: 'Indisponível o dia todo' })
  })
})

describe('pendências', () => {
  const dados: Dados = { motoristas: [danilo, bruno], excecoes: [exc('b', '2026-10-10', 'trabalha')], compromissos: [{ ...comp('2026-10-10T00:00', '2026-10-10T12:00'), id: 'c1' }] }

  it('aplica exceções, padrões e compromissos para exibição', () => {
    const p = semPendencias()
    p.excecoes.set('b|2026-10-10', null)
    p.padroes.set('b', { sab: 'trabalha', dom: null })
    p.excluidos.add('c1')
    const view = aplicarPendencias(dados, p)
    expect(view.excecoes.size).toBe(0)
    expect(view.motoristas[1].padrao.sab).toBe('trabalha')
    expect(view.compromissos).toEqual([])
  })

  it('gera operações na ordem e ignora o que não muda', () => {
    const p = semPendencias()
    p.excecoes.set('b|2026-10-10', 'trabalha') // igual ao salvo
    p.excecoes.set('d|2026-10-11', 'folga')
    p.novos.push(comp('2026-10-14T09:00', '2026-10-14T11:00'))
    p.excluidos.add('c1')
    p.padroes.set('d', danilo.padrao) // igual ao salvo
    p.padroes.set('b', { sab: 'trabalha', dom: null })
    expect(planSave(dados, p).map((o) => o.tipo)).toEqual(['criarExcecao', 'criarCompromisso', 'excluirCompromisso', 'padrao'])
  })
})

describe('descontarSalvas', () => {
  const dados: Dados = { motoristas: [danilo, bruno], excecoes: [exc('b', '2026-10-10', 'trabalha')], compromissos: [] }
  const lote = () => {
    const p = semPendencias()
    p.excecoes.set('d|2026-10-10', 'folga')
    p.novos.push(comp('2026-10-14T09:00', '2026-10-14T11:00'))
    return p
  }

  it('tira o lote gravado e preserva o que mudou durante a gravação', () => {
    const salvo = lote()
    const atual = descontarSalvas(salvo, salvo, dados)
    expect(atual.excecoes.size + atual.novos.length).toBe(0)
    const mudou = lote()
    const durante = { ...mudou, excecoes: new Map([['d|2026-10-10', 'trabalha' as const]]) }
    expect([...descontarSalvas(durante, mudou, dados).excecoes]).toEqual([['d|2026-10-10', 'trabalha']])
  })

  it('na falha, mantém só o que não foi gravado', () => {
    const p = lote()
    const ops = planSave(dados, p)
    const atual = descontarSalvas(p, p, dados, ops.slice(0, 1))
    expect(atual.excecoes.size).toBe(0)
    expect(atual.novos).toHaveLength(1)
  })
})
