// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  comunicadoDeLinha, dadosFinanceiro, diasUteisAteFimDoMes, estadoDaTarefa, indicadoresGestao, indicadoresOperacao, indicadoresTi,
  metaDeReceita, montarTarefas, noticiaDeLinha, prazoDaTarefa, primeiroNome, tarefasVisiveis, textoPlano, urlSegura,
} from './inicio'
import { dailyMessages, getDailyMessageIndex } from './frases/frases'

// 29/10/2026, 15h em São Paulo (18h UTC): meio do dia, sem virada de data em nenhum fuso razoável.
const NOW = new Date('2026-10-29T18:00:00Z')
const FMT = '@OData.Community.Display.V1.FormattedValue'
const valorDe = (ids: { id: string; valor: string; detalhe: string }[], id: string) => ids.find((i) => i.id === id)!

describe('Planner', () => {
  it('prazo: atrasada (ontem e N dias), hoje, próximo e sem prazo, no dia de São Paulo', () => {
    expect(prazoDaTarefa('2026-10-28T00:00:00Z', NOW)).toEqual({ prazo: 'atrasada', prazoLabel: 'Venceu ontem' })
    expect(prazoDaTarefa('2026-10-25', NOW)).toEqual({ prazo: 'atrasada', prazoLabel: '4 dias atrasada' })
    expect(prazoDaTarefa('2026-10-29T23:00:00Z', NOW)).toEqual({ prazo: 'hoje', prazoLabel: 'Vence hoje' })
    expect(prazoDaTarefa('2026-11-02', NOW)).toEqual({ prazo: 'outro', prazoLabel: 'Próximo prazo' })
    expect(prazoDaTarefa(null, NOW)).toEqual({ prazo: 'outro', prazoLabel: 'Sem prazo' })
    // 01h UTC do dia 30 ainda é dia 29 em São Paulo.
    expect(prazoDaTarefa('2026-10-29', new Date('2026-10-30T01:00:00Z')).prazo).toBe('hoje')
  })

  it('estado: status bloqueado ou prioridade urgente é crítico; em andamento ou alta, atenção', () => {
    expect(estadoDaTarefa(100000002, 100000001)).toBe('Crítico')
    expect(estadoDaTarefa(100000000, 100000003)).toBe('Crítico')
    expect(estadoDaTarefa(100000001, 100000001)).toBe('Atenção')
    expect(estadoDaTarefa(100000000, 100000002)).toBe('Atenção')
    expect(estadoDaTarefa(100000000, 100000001)).toBe('Novo')
  })

  it('responsáveis: principal + tabela de responsáveis, traduzidos para systemuser, sem repetição; "Minhas" filtra pelo usuário', () => {
    const tarefas = montarTarefas(
      [
        { cr40f_plannertarefaid: '{T1}', cr40f_titulo: 'Briefing', cr40f_prazo: '2026-10-28', cr40f_status: 100000000, cr40f_prioridade: 100000003, _cr40f_cr40f_funcionarioresponsavel_value: 'F1' },
        { cr40f_plannertarefaid: 't2', cr40f_titulo: '', cr40f_prazo: '2026-10-29', _cr40f_cr40f_funcionarioresponsavel_value: 'f9' },
      ],
      [{ _cr40f_tarefa_value: 't1', _cr40f_funcionario_value: 'f2' }, { _cr40f_tarefa_value: 't1', _cr40f_funcionario_value: 'f1' }],
      [{ cr40f_funcionariosid: 'f1', _cr40f_usuariodataverse_value: '{U1}' }, { cr40f_funcionariosid: 'f2', _cr40f_usuariodataverse_value: 'u2' }],
      NOW,
    )
    expect(tarefas[0]).toMatchObject({ titulo: 'Briefing', responsaveis: ['u2', 'u1'], prioridade: 'Crítica', estado: 'Crítico', prazo: 'atrasada' })
    expect(tarefas[1]).toMatchObject({ titulo: 'Tarefa sem título', responsaveis: [], prazo: 'hoje' })
    expect(tarefasVisiveis(tarefas, 'minhas', 'U1').map((t) => t.titulo)).toEqual(['Briefing'])
    expect(tarefasVisiveis(tarefas, 'minhas', '')).toEqual([])
    expect(tarefasVisiveis(tarefas, 'todas', '')).toHaveLength(2)
  })
})

describe('comunicado e notícias', () => {
  it('prioridade do comunicado', () => {
    expect(comunicadoDeLinha({ cr40f_comunicadohomeid: 'c', cr40f_titulo: 'T', cr40f_conteudo: 'C', cr40f_prioridade: 100000002 })).toEqual({ id: 'c', titulo: 'T', corpo: 'C', prioridade: 'critical' })
    expect(comunicadoDeLinha({ cr40f_prioridade: 100000001 }).prioridade).toBe('attention')
    expect(comunicadoDeLinha({}).prioridade).toBe('info')
  })

  it('notícia: tema e relevância pelas opções, URL completa primeiro, fonte do lookup', () => {
    expect(noticiaDeLinha({ cr40f_noticiaexternaid: 'n', cr40f_titulo: 'T', cr40f_resumo: '<p>R</p>', cr40f_url: 'https://a', cr40f_urlcompleta: 'https://b', cr40f_tema: 100000002, cr40f_relevancia: 100000001, cr40f_publicado_em: 'x', [`_cr40f_fonte_value${FMT}`]: 'Folha' }))
      .toEqual({ id: 'n', titulo: 'T', resumo: '<p>R</p>', url: 'https://b', fonte: 'Folha', tema: 'Cliente', prioridade: 'Alta', publicadoEm: 'x' })
    expect(noticiaDeLinha({ cr40f_url: 'https://a' })).toMatchObject({ url: 'https://a', fonte: 'Fonte homologada', tema: 'Operação', prioridade: 'Normal' })
  })

  it('só http(s) vira link; resumo em HTML vira texto', () => {
    expect(urlSegura('javascript:alert(1)')).toBeUndefined()
    expect(urlSegura('https://x.com')).toBe('https://x.com')
    expect(textoPlano('<b>Olá</b>\n  <script>x</script>mundo')).toBe('Olá xmundo')
  })
})

describe('indicadores', () => {
  const saida = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 29, h + 3, m)).toISOString()

  it('Operação: total, sem motorista, próprio sem veículo e janela de pico (empate fica com a hora mais cedo)', () => {
    const r = (h: number, extra: Record<string, unknown> = {}) => ({ cr40f_dataehorriodesada: saida(h), _cr40f_motorista_value: 'm', _cr40f_veiculo_value: 'v', cr40f_Motorista: { cr40f_tipodevinculo: 0 }, ...extra })
    const ind = indicadoresOperacao([
      r(8), r(8, { _cr40f_motorista_value: null }), r(17, { _cr40f_veiculo_value: null }),
      r(17, { _cr40f_veiculo_value: null, cr40f_Motorista: { cr40f_tipodevinculo: 1 } }), r(23),
    ])
    expect(ind.map((i) => [i.id, i.valor])).toEqual([['services_today', '05'], ['without_driver', '01'], ['without_vehicle', '01'], ['peak_hour', '08h–09h']])
    expect(valorDe(ind, 'peak_hour').detalhe).toBe('2 saídas no período')
    expect(ind[0]!.destino).toEqual({ rota: 'geral' })
    expect(indicadoresOperacao([]).at(-1)).toMatchObject({ valor: '--', detalhe: 'nenhuma saída hoje' })
  })

  it('Financeiro: pendentes de composição, recebimentos do dia, dias úteis e serviços a receber com passageiros', () => {
    const inicio = new Date(NOW); inicio.setHours(0, 0, 0, 0)
    const hoje = inicio.toISOString()
    const { indicadores, aReceber } = dadosFinanceiro({
      reservas: [{ cr40f_status: 100000001, cr40f_statusdefaturamento: 100000000 }, { cr40f_status: 100000001, cr40f_statusdefaturamento: 100000001 }, { cr40f_status: 1 }],
      aReceber: [
        { cr40f_reservadeveculosid: 'B', cr40f_id: 'R2', cr40f_dataehorriodesada: saida(16), cr40f_destino: 'CGH' },
        { cr40f_reservadeveculosid: 'a', cr40f_id: 'R1', cr40f_dataehorriodesada: saida(8, 30), cr40f_trajeto: 'GRU → Faria Lima' },
      ],
      passageiros: [
        { _cr40f_geral_value: '{A}', [`_cr40f_bancodedados_value${FMT}`]: 'Ana' },
        { _cr40f_geral_value: 'a', [`_cr40f_bancodedados_value${FMT}`]: 'Ana' },
        { _cr40f_geral_value: 'a', [`_cr40f_bancodedados_value${FMT}`]: 'Bia' },
      ],
      caixa: [{ cr40f_data: hoje, cr40f_valor: 10 }, { cr40f_data: hoje, cr40f_valor: -5 }, { cr40f_data: '2020-01-01', cr40f_valor: 10 }],
    }, NOW, inicio)
    expect(indicadores.map((i) => i.valor)).toEqual(['01', '01', String(diasUteisAteFimDoMes(NOW)).padStart(2, '0')])
    expect(aReceber).toEqual([
      { id: 'a', titulo: 'R1', data: '29/10', hora: '08:30', saida: saida(8, 30), passageiro: 'Ana, Bia', rota: 'GRU → Faria Lima' },
      { id: 'B', titulo: 'R2', data: '29/10', hora: '16:00', saida: saida(16), passageiro: 'Pax não informado', rota: 'CGH' },
    ])
  })

  it('dias úteis até o fim do mês contam o próprio dia', () => {
    expect(diasUteisAteFimDoMes(new Date(2026, 9, 29, 12))).toBe(2) // qui 29 e sex 30; sáb 31 não conta
    expect(diasUteisAteFimDoMes(new Date(2026, 9, 31, 12))).toBe(0)
  })

  it('TI: falhas (31, 32, 40) separadas das demais; leads e campanhas vão para a lista nativa', () => {
    const ind = indicadoresTi({ async: [{ statuscode: 31 }, { statuscode: 40 }, { statuscode: 20 }], leads: [{}], campanhas: [] })
    expect(ind.map((i) => i.valor)).toEqual(['02', '01', '01', '00'])
    expect(ind[2]!.destino).toEqual({ entidade: 'lead' })
  })

  it('meta: 50/40/10 dos três anos anteriores +13%; sem histórico, indisponível', () => {
    expect(metaDeReceita(2026, 0)).toBe(Math.round((336469.65 * 0.5 + 213816.57 * 0.4 + 148127.05 * 0.1) * 1.13))
    expect(metaDeReceita(2030, 0)).toBe(0)
  })

  it('Gestão: receita produzida × meta, agendados × ticket médio, KPI de recebimento e tarefas atrasadas', () => {
    const ind = indicadoresGestao({
      precos: [{ cr40f_composicaodeprecosid: 'P1', new_valortotal: 1000, new_status: 100000001 }, { cr40f_composicaodeprecosid: 'p2', new_valortotal: 3000, new_status: 100000000 }],
      reservasDoMes: [
        { cr40f_status: 202410008, cr40f_statusdefaturamento: 202410010, _new_composicaodepreco_value: 'p1', cr40f_dataehorriodesada: '2026-10-02T12:00:00Z' },
        { cr40f_status: 1, [`cr40f_status${FMT}`]: 'Realizado', cr40f_statusdefaturamento: 202410006, _new_composicaodepreco_value: 'p2', cr40f_dataehorriodesada: '2026-10-03T12:00:00Z' },
        { cr40f_status: 1, cr40f_statusdefaturamento: 1, _new_composicaodepreco_value: 'p2', cr40f_dataehorriodesada: '2026-10-30T12:00:00Z' },
        { cr40f_status: 1, [`cr40f_status${FMT}`]: 'Cancelado', cr40f_dataehorriodesada: '2026-10-30T12:00:00Z' },
      ],
      tarefasAtrasadas: 7,
    }, NOW)
    const receita = valorDe(ind, 'revenue_vs_goal')
    expect(receita.detalhe).toMatch(/^1% da meta de R\$/)
    expect(valorDe(ind, 'scheduled_revenue').detalhe).toMatch(/^1 serviços × ticket médio R\$\s?1\smil$/)
    expect(valorDe(ind, 'receipts_kpi').detalhe).toMatch(/^25% da base de R\$\s?4\smil$/)
    expect(valorDe(ind, 'overdue_tasks').valor).toBe('07')
  })

  it('primeiro nome do apelido', () => {
    expect(primeiroNome('  Renan Mendonça ')).toBe('Renan')
    expect(primeiroNome(undefined)).toBe('')
  })
})

describe('frase do dia', () => {
  it('365 frases únicas e uma por dia do ano', () => {
    expect(new Set(dailyMessages.map((m) => m.text)).size).toBe(365)
    expect(getDailyMessageIndex('2026-01-01')).toBe(0)
    expect(getDailyMessageIndex('2026-12-31')).toBe(364)
  })
})
