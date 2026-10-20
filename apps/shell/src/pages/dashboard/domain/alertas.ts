import { CAT_ITEM_SERVICO, CORTE_SEM_CLIENTE, CORTE_SEM_MOTORISTA, CORTE_SEM_VEICULO, MULTA_NOTIFICAR, SEM_CLIENTE, STATUS_SEM_MOTORISTA } from './codes'
import { dec, int, stL } from './format'
import { DIA_MS } from './periodo'
import { JANELA_DIAS } from '../../documentos/domain/vencimento'
import { alertaScore, type ResultadoScore } from './score'
import type { AlertaItem, Conjunto, Funcionario, Manutencao, Multa, Ocorrencia, Reserva, Veiculo } from './types'

export type Secundarios = { manutencoes: Manutencao[]; multas: Multa[]; ocorrencias: Ocorrencia[]; funcionarios: Funcionario[]; veiculos: Veiculo[]; indisponiveis: Conjunto[] }

/** `cnhWarn`: só status "ativo" e validade preenchida até a janela única de documentos (60 dias; sem validade não conta, como no código legado). */
export const cnhEmAtencao = (funcionarios: Funcionario[], nowMs: number) =>
  funcionarios.filter((f) => stL(f.statusLabel) === 'ativo' && Number.isFinite(f.cnhMs) && (f.cnhMs - nowMs) / DIA_MS <= JANELA_DIAS)
export const multasPendentes = (multas: Multa[]) => multas.filter((m) => m.status === MULTA_NOTIFICAR)
const pctMultas = (multas: Multa[]) => (multas.length ? ((multasPendentes(multas).length / multas.length) * 100).toFixed(0) : '0')
const indisponivel = (id: string, rotulo: string): AlertaItem => ({ id, valor: '—', rotulo, status: 's/dado', tom: 'neutral' })

/** `score`: resultado de `scoreMotoristas` já filtrado pelo período; vira s/dado se algum conjunto do Infleet não carregou. */
export function alertasOperacao(rv: Reserva[], s: Secundarios, nowMs: number, score: ResultadoScore): AlertaItem[] {
  const fora = (c: Conjunto) => s.indisponiveis.includes(c)
  const cnh = cnhEmAtencao(s.funcionarios, nowMs).length
  const pend = multasPendentes(s.multas).length
  const oco = s.ocorrencias.length
  return [
    fora('funcionarios') ? indisponivel('cnh', 'CNH') : { id: 'cnh', valor: int(cnh), rotulo: 'CNH', status: cnh ? 'Atenção' : 'OK', tom: cnh ? 'danger' : 'ok' },
    fora('multas') ? indisponivel('multas', 'Multas') : { id: 'multas', valor: int(pend), rotulo: 'Multas', status: `${pctMultas(s.multas)}% pendentes`, tom: pend ? 'danger' : 'ok' },
    fora('ocorrencias') ? indisponivel('ocorrencias', 'Ocorrências') : {
      id: 'ocorrencias', valor: int(oco), rotulo: 'Ocorrências',
      status: rv.length && oco ? `${dec((oco / rv.length) * 100, 1)}% dos serviços · 1 a cada ${int(Math.round(rv.length / oco))}` : 's/dado',
      tom: oco ? 'danger' : 'ok',
    },
    alertaScore(score, fora('viagens') || fora('eventos') || fora('telemetria')),
  ]
}

const jaSaiu = (r: Reserva, nowMs: number) => Number.isFinite(r.saidaMs) && r.saidaMs <= nowMs
/** Regras dos alertas de qualidade (também listadas no drill-down): mesmas datas de corte do legado. */
export const QUALIDADE = {
  semVeiculo: (r: Reserva, nowMs: number) => !stL(r.statusLabel).includes('cancel') && Boolean(r.motoristaId) && !r.veiculoId && jaSaiu(r, nowMs) && r.saidaMs >= CORTE_SEM_VEICULO,
  semTipoVeiculo: (r: Reserva) => !r.tipoVeiculoRaw,
  semMotorista: (r: Reserva, nowMs: number) =>
    !r.motoristaId && jaSaiu(r, nowMs) && r.saidaMs >= CORTE_SEM_MOTORISTA && r.status != null && STATUS_SEM_MOTORISTA.has(r.status) && r.categoriaItem === CAT_ITEM_SERVICO,
  semCliente: (r: Reserva) => r.saidaRaw.slice(0, 10) >= CORTE_SEM_CLIENTE && r.cliente === SEM_CLIENTE,
} as const
export type AlertaQualidade = keyof typeof QUALIDADE

export function alertasQualidade(rv: Reserva[], nowMs: number): AlertaItem[] {
  const share = (n: number) => (rv.length ? `${dec((n / rv.length) * 100, 1)}% dos serviços` : 's/dado')
  const item = (id: string, rotulo: string, n: number): AlertaItem => ({ id, valor: int(n), rotulo, status: share(n), tom: n ? 'warn' : 'ok' })
  const conta = (id: AlertaQualidade) => rv.filter((r) => QUALIDADE[id](r, nowMs)).length
  const semVeiculo = conta('semVeiculo')
  const semTipo = conta('semTipoVeiculo')
  const semMotorista = conta('semMotorista')
  const semCliente = conta('semCliente')
  return [
    item('semVeiculo', 'Sem veículo', semVeiculo),
    item('semTipoVeiculo', 'Sem tipo de veículo', semTipo),
    item('semMotorista', 'Sem motorista', semMotorista),
    item('semCliente', 'Sem cliente', semCliente),
  ]
}
