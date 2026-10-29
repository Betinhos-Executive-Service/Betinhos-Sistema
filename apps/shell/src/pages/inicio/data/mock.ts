import { comunicadoDeLinha, diaSaoPaulo, dadosFinanceiro, indicadoresGestao, indicadoresOperacao, indicadoresTi, montarTarefas, noticiaDeLinha } from '../domain/inicio'
import type { DadosVisao } from '../domain/types'
import type { Source } from './source'

// Dados de demonstração (pnpm dev, sem Dataverse): linhas no formato da Web API que passam pelas mesmas regras do domínio.

export const USUARIO_MOCK = 'mock-user'
const OUTRO = 'outro-user'

/** Horário de São Paulo (UTC−3, sem horário de verão desde 2019), qualquer que seja o fuso da máquina. */
const dia = (now: Date, offset: number, hora: number, minuto = 0) => {
  const [y, m, d] = diaSaoPaulo(now).split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + offset, hora + 3, minuto)).toISOString()
}
const ymd = (now: Date, offset: number) => dia(now, offset, 12).slice(0, 10)

function tarefas(now: Date) {
  const t = (id: string, titulo: string, prazo: number, status: number, prioridade: number, dono: string) => ({ cr40f_plannertarefaid: id, cr40f_titulo: titulo, cr40f_prazo: ymd(now, prazo), cr40f_status: status, cr40f_prioridade: prioridade, _cr40f_cr40f_funcionarioresponsavel_value: dono })
  const rows = [
    t('demo-overdue-1', 'Confirmar briefing do aeroporto GRU', -3, 100000002, 100000003, 'f-eu'),
    t('demo-overdue-2', 'Enviar comprovante do serviço 4821', -1, 100000001, 100000002, 'f-eu'),
    t('demo-overdue-3', 'Validar motorista reserva de Congonhas', -5, 100000000, 100000002, 'f-outro'),
    t('demo-today-1', 'Conferir conexão Dataverse', 0, 100000000, 100000001, 'f-eu'),
    t('demo-today-2', 'Revisar reservas executivas de hoje', 0, 100000001, 100000002, 'f-outro'),
    t('demo-today-3', 'Enviar confirmação ao passageiro', 0, 100000000, 100000001, 'f-eu'),
    t('demo-next-1', 'Preparar escala do fim de semana', 3, 100000000, 100000001, 'f-eu'),
  ]
  const funcionarios = [{ cr40f_funcionariosid: 'f-eu', _cr40f_usuariodataverse_value: USUARIO_MOCK }, { cr40f_funcionariosid: 'f-outro', _cr40f_usuariodataverse_value: OUTRO }]
  return montarTarefas(rows, [], funcionarios, now)
}

function reservas(now: Date) {
  const r = (id: string, codigo: string, offset: number, hora: number, minuto: number, extra: Record<string, unknown> = {}) => ({ cr40f_reservadeveculosid: id, cr40f_id: codigo, cr40f_dataehorriodesada: dia(now, offset, hora, minuto), cr40f_status: 100000001, cr40f_statusdefaturamento: 100000000, _cr40f_motorista_value: 'm1', _cr40f_veiculo_value: 'v1', cr40f_Motorista: { cr40f_tipodevinculo: 0 }, ...extra })
  return [
    r('r1', 'Transfer aeroporto GRU', 0, 8, 30, { cr40f_trajeto: 'GRU → Faria Lima' }),
    r('r2', 'Serviço executivo 4821', 0, 14, 0, { cr40f_trajeto: 'Atendimento · Cliente', _cr40f_motorista_value: null }),
    r('r3', 'Reserva 4822', 0, 17, 10, { _cr40f_veiculo_value: null }),
    r('r4', 'Reserva 4823', 0, 17, 40, { cr40f_statusdefaturamento: 100000001 }),
    r('r5', 'Reserva 4825', 0, 17, 50),
    r('r6', 'Reserva 4826', 0, 19, 0),
    r('r7', 'Hotel Fasano → Congonhas', 1, 7, 15, { cr40f_trajeto: 'São Paulo · Executivo' }),
    r('r8', 'Reserva executiva 4824', 1, 16, 45, { cr40f_trajeto: 'Operação · Pré-serviço' }),
  ]
}

function visao(v: DadosVisao['visao'], now: Date): DadosVisao {
  const todas = reservas(now)
  const hoje = todas.filter((r) => diaSaoPaulo(new Date(r.cr40f_dataehorriodesada)) === diaSaoPaulo(now))
  const inicio = new Date(now); inicio.setHours(0, 0, 0, 0)
  if (v === 'operacao') return { visao: v, indicadores: indicadoresOperacao(hoje), aReceber: [], erro: null }
  if (v === 'financeiro') {
    const passageiros = [
      { _cr40f_geral_value: 'r1', '_cr40f_bancodedados_value@OData.Community.Display.V1.FormattedValue': 'Camila Nogueira' },
      { _cr40f_geral_value: 'r7', '_cr40f_bancodedados_value@OData.Community.Display.V1.FormattedValue': 'Ricardo Mendes' },
    ]
    const caixa = [{ cr40f_data: inicio.toISOString(), cr40f_valor: 1200 }, { cr40f_data: inicio.toISOString(), cr40f_valor: 800 }, { cr40f_data: inicio.toISOString(), cr40f_valor: -300 }]
    return { visao: v, ...dadosFinanceiro({ reservas: hoje, aReceber: todas, passageiros, caixa }, now, inicio), erro: null }
  }
  if (v === 'ti_marketing') {
    return { visao: v, indicadores: indicadoresTi({ async: [{ statuscode: 31 }, { statuscode: 20 }, { statuscode: 20 }, { statuscode: 0 }, { statuscode: 10 }], leads: Array.from({ length: 8 }, () => ({})), campanhas: [{}, {}] }), aReceber: [], erro: null }
  }
  const precos = [{ cr40f_composicaodeprecosid: 'p1', new_valortotal: 46000, new_status: 100000001 }, { cr40f_composicaodeprecosid: 'p2', new_valortotal: 38000, new_status: 100000001 }]
  const reservasDoMes = [
    { cr40f_status: 202410008, cr40f_statusdefaturamento: 202410010, _new_composicaodepreco_value: 'p1', cr40f_dataehorriodesada: dia(now, -1, 9) },
    { cr40f_status: 202410008, cr40f_statusdefaturamento: 100000000, _new_composicaodepreco_value: 'p2', cr40f_dataehorriodesada: dia(now, -1, 10) },
    { cr40f_status: 100000001, cr40f_statusdefaturamento: 100000000, _new_composicaodepreco_value: 'p2', cr40f_dataehorriodesada: dia(now, 1, 10) },
  ]
  return { visao: v, indicadores: indicadoresGestao({ reservasDoMes, precos, tarefasAtrasadas: 3 }, now), aReceber: [], erro: null }
}

const NOTICIAS = [
  { t: 'Operação em foco', r: 'Acompanhe os sinais que podem impactar a rotina de transporte executivo.', tema: 100000001, rel: 100000001 },
  { t: 'Aeroportos ampliam janelas de embarque', r: 'Mudanças na operação dos terminais reforçam a importância do briefing antes da saída.', tema: 100000000, rel: 100000000 },
  { t: 'Clientes executivos priorizam previsibilidade', r: 'Pontualidade, comunicação e confirmação antecipada seguem como sinais fortes de confiança.', tema: 100000002, rel: 100000000 },
  { t: 'Checklist de saída ganha nova revisão', r: 'Atualização operacional reúne os pontos essenciais para reduzir exceções durante o serviço.', tema: 100000001, rel: 100000000 },
]

export function createMockSource(): Source {
  return {
    mock: true,
    usuarioId: async () => USUARIO_MOCK,
    primeiroNome: async () => 'Renan',
    compartilhados: async (now) => ({
      comunicados: [comunicadoDeLinha({ cr40f_comunicadohomeid: 'demo-notice-1', cr40f_titulo: 'Janela de operação especial', cr40f_conteudo: 'Atenção redobrada para embarques no aeroporto entre 17h e 20h.', cr40f_prioridade: 100000001 })],
      tarefas: tarefas(now),
      erro: null,
    }),
    visao: async (v, now) => visao(v, now),
    noticias: async (now) => NOTICIAS.map((n, i) => noticiaDeLinha({
      cr40f_noticiaexternaid: `demo-news-${i + 1}`, cr40f_titulo: n.t, cr40f_resumo: n.r, cr40f_url: 'https://www.betinhos.com.br', cr40f_tema: n.tema, cr40f_relevancia: n.rel,
      cr40f_publicado_em: new Date(now.getTime() - i * 3600000).toISOString(), '_cr40f_fonte_value@OData.Community.Display.V1.FormattedValue': i % 2 ? 'Radar Betinhos' : 'Betinhos',
    })),
  }
}
