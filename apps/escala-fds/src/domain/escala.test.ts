import { describe, expect, it } from 'vitest'
import {
  aplicarPendencias, ausenciasDaSemana, ausenciasDosDias, chipAusencia, compromissosDoDia, descontarSalvas, diasDaSemana,
  planSave, recordKey, semPendencias, semanaDe, semanaLabel, situacaoDoDia, ultrapassaSemana,
  type Compromisso, type Dados, type Marcacao,
} from './escala'

const marc = (motoristaId: string, data: string, situacao: Marcacao['situacao']): Marcacao => ({ id: `${motoristaId}-${data}`, motoristaId, data, situacao })
const mapa = (list: Marcacao[]) => new Map(list.map((m) => [recordKey(m.motoristaId, m.data), m]))
const comp = (inicio: string, fim: string, diaInteiro = false, motivo: Compromisso['motivo'] = 'medico'): Compromisso =>
  ({ id: null, motoristaId: 'd', inicio, fim, diaInteiro, motivo, observacao: '', registradoEm: null })
const nova = { motoristaId: 'd', horaInicio: '08:00', horaFim: '12:00', motivo: 'medico' as const, observacao: '  Exame  ' }

describe('semana', () => {
  it('começa na segunda; domingo pertence à semana da segunda anterior', () => {
    expect(semanaDe(new Date(2026, 9, 13))).toBe('2026-10-12') // terça
    expect(semanaDe(new Date(2026, 9, 12))).toBe('2026-10-12') // segunda
    expect(semanaDe(new Date(2026, 9, 18))).toBe('2026-10-12') // domingo
  })

  it('lista os 7 dias e atravessa a virada de mês', () => {
    expect(diasDaSemana('2026-09-28')).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(semanaLabel('2026-10-12')).toBe('12/10 a 18/10')
  })
})

describe('situacaoDoDia', () => {
  it('usa a marcação do dia; Folga legada (null) e sem registro ficam desmarcados', () => {
    const marcacoes = mapa([marc('d', '2026-10-17', 'plantao'), marc('d', '2026-10-18', null)])
    expect(situacaoDoDia('d', '2026-10-17', marcacoes)).toBe('plantao')
    expect(situacaoDoDia('d', '2026-10-18', marcacoes)).toBeNull()
    expect(situacaoDoDia('b', '2026-10-17', marcacoes)).toBeNull()
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
})

describe('ausenciasDosDias', () => {
  it('dia todo junta dias seguidos e separa os soltos, em ordem', () => {
    const lista = ausenciasDosDias({ ...nova, dias: ['2026-10-16', '2026-10-12', '2026-10-13', '2026-10-14'], diaInteiro: true })
    expect(lista.map((c) => [c.inicio, c.fim])).toEqual([['2026-10-12T00:00', '2026-10-14T23:59'], ['2026-10-16T00:00', '2026-10-16T23:59']])
    expect(lista[0]).toMatchObject({ id: null, motoristaId: 'd', diaInteiro: true, motivo: 'medico', observacao: 'Exame', registradoEm: null })
  })

  it('dia todo junta dias seguidos na virada do mês', () => {
    const lista = ausenciasDosDias({ ...nova, dias: ['2026-09-30', '2026-10-01'], diaInteiro: true })
    expect(lista.map((c) => [c.inicio, c.fim])).toEqual([['2026-09-30T00:00', '2026-10-01T23:59']])
  })

  it('com horário, um registro por dia', () => {
    const lista = ausenciasDosDias({ ...nova, dias: ['2026-10-12', '2026-10-13'], diaInteiro: false })
    expect(lista.map((c) => [c.inicio, c.fim, c.diaInteiro])).toEqual([['2026-10-12T08:00', '2026-10-12T12:00', false], ['2026-10-13T08:00', '2026-10-13T12:00', false]])
  })
})

describe('chips da semana', () => {
  const segunda = '2026-10-12'

  it('filtra o que toca a semana, em ordem de início', () => {
    const antes = comp('2026-10-05T00:00', '2026-10-05T23:59', true)
    const ferias = comp('2026-10-09T00:00', '2026-10-13T23:59', true, 'ferias')
    const sabado = comp('2026-10-17T00:00', '2026-10-17T12:00')
    expect(ausenciasDaSemana([sabado, antes, ferias], segunda)).toEqual([ferias, sabado])
  })

  it('texto curto do chip', () => {
    expect(chipAusencia(comp('2026-10-13T00:00', '2026-10-13T23:59', true), segunda)).toBe('Ter · dia todo · Médico')
    expect(chipAusencia(comp('2026-10-17T00:00', '2026-10-17T12:00', false, 'pessoal'), segunda)).toBe('Sáb · até 12h · Pessoal')
    expect(chipAusencia(comp('2026-10-13T00:00', '2026-10-15T23:59', true), segunda)).toBe('Ter a Qui · Médico')
    expect(chipAusencia(comp('2026-10-16T00:00', '2026-10-25T23:59', true, 'ferias'), segunda)).toBe('Férias · 16/10 a 25/10')
  })

  it('avisa quando o registro passa da semana', () => {
    expect(ultrapassaSemana(comp('2026-10-16T00:00', '2026-10-25T23:59', true), segunda)).toBe(true)
    expect(ultrapassaSemana(comp('2026-10-13T00:00', '2026-10-13T23:59', true), segunda)).toBe(false)
  })
})

describe('pendências', () => {
  const dados: Dados = {
    motoristas: [{ id: 'd', nome: 'Danilo' }, { id: 'b', nome: 'Bruno' }],
    marcacoes: [marc('b', '2026-10-17', 'trabalha'), marc('d', '2026-10-18', null)],
    compromissos: [{ ...comp('2026-10-17T00:00', '2026-10-17T12:00'), id: 'c1' }],
  }

  it('aplica marcações e ausências para exibição', () => {
    const p = semPendencias()
    p.marcacoes.set('b|2026-10-17', null)
    p.marcacoes.set('d|2026-10-17', 'plantao')
    p.excluidos.add('c1')
    const view = aplicarPendencias(dados, p)
    expect(situacaoDoDia('b', '2026-10-17', view.marcacoes)).toBeNull()
    expect(situacaoDoDia('d', '2026-10-17', view.marcacoes)).toBe('plantao')
    expect(view.compromissos).toEqual([])
  })

  it('gera operações: criar, atualizar Folga legada, excluir ao desmarcar; ignora o que não muda', () => {
    const p = semPendencias()
    p.marcacoes.set('d|2026-10-17', 'plantao') // sem registro: cria
    p.marcacoes.set('d|2026-10-18', 'trabalha') // Folga legada: atualiza o mesmo registro
    p.marcacoes.set('b|2026-10-17', null) // desmarcar: exclui
    p.marcacoes.set('b|2026-10-18', null) // nada salvo: ignora
    p.novos.push(comp('2026-10-14T09:00', '2026-10-14T11:00'))
    p.excluidos.add('c1')
    const ops = planSave(dados, p)
    expect(ops.map((o) => o.tipo)).toEqual(['criarMarcacao', 'atualizarMarcacao', 'excluirMarcacao', 'criarCompromisso', 'excluirCompromisso'])
    expect(ops[1]).toMatchObject({ marcacao: { id: 'd-2026-10-18', situacao: 'trabalha' } })
    expect(ops[2]).toEqual({ tipo: 'excluirMarcacao', id: 'b-2026-10-17' })
  })
})

describe('descontarSalvas', () => {
  const dados: Dados = { motoristas: [], marcacoes: [marc('b', '2026-10-17', 'trabalha')], compromissos: [] }
  const lote = () => {
    const p = semPendencias()
    p.marcacoes.set('d|2026-10-17', 'plantao')
    p.novos.push(comp('2026-10-14T09:00', '2026-10-14T11:00'))
    return p
  }

  it('tira o lote gravado e preserva o que mudou durante a gravação', () => {
    const salvo = lote()
    const atual = descontarSalvas(salvo, salvo, dados)
    expect(atual.marcacoes.size + atual.novos.length).toBe(0)
    const mudou = lote()
    const durante = { ...mudou, marcacoes: new Map([['d|2026-10-17', 'trabalha' as const]]) }
    expect([...descontarSalvas(durante, mudou, dados).marcacoes]).toEqual([['d|2026-10-17', 'trabalha']])
  })

  it('na falha, mantém só o que não foi gravado', () => {
    const p = lote()
    const ops = planSave(dados, p)
    const atual = descontarSalvas(p, p, dados, ops.slice(0, 1))
    expect(atual.marcacoes.size).toBe(0)
    expect(atual.novos).toHaveLength(1)
  })
})
