import { CAT_ITEM_SERVICO, CORTE_SEM_CLIENTE, CORTE_SEM_MOTORISTA, CORTE_SEM_VEICULO, MULTA_NOTIFICAR, SEM_CLIENTE, STATUS_SEM_MOTORISTA } from './codes'
import { soma } from './base'
import { brlS, dec, int, stL } from './format'
import { DIA_MS } from './periodo'
import type { AlertaItem, CardSecundario, Conjunto, Funcionario, Manutencao, Multa, Ocorrencia, Reserva, Veiculo } from './types'

export type Secundarios = { manutencoes: Manutencao[]; multas: Multa[]; ocorrencias: Ocorrencia[]; funcionarios: Funcionario[]; veiculos: Veiculo[]; indisponiveis: Conjunto[] }

/** `cnhWarn`: só status "ativo" e validade preenchida até 90 dias (sem validade não conta, como no código legado). */
export const cnhEmAtencao = (funcionarios: Funcionario[], nowMs: number) =>
  funcionarios.filter((f) => stL(f.statusLabel) === 'ativo' && Number.isFinite(f.cnhMs) && (f.cnhMs - nowMs) / DIA_MS <= 90)
export const multasPendentes = (multas: Multa[]) => multas.filter((m) => m.status === MULTA_NOTIFICAR)
const pctMultas = (multas: Multa[]) => (multas.length ? ((multasPendentes(multas).length / multas.length) * 100).toFixed(0) : '0')
const indisponivel = (id: string, rotulo: string): AlertaItem => ({ id, valor: '—', rotulo, status: 's/dado', tom: 'neutral' })

export function alertasOperacao(rv: Reserva[], s: Secundarios, nowMs: number): AlertaItem[] {
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
  ]
}

export function alertasQualidade(rv: Reserva[], nowMs: number): AlertaItem[] {
  const share = (n: number) => (rv.length ? `${dec((n / rv.length) * 100, 1)}% dos serviços` : 's/dado')
  const item = (id: string, rotulo: string, n: number): AlertaItem => ({ id, valor: int(n), rotulo, status: share(n), tom: n ? 'warn' : 'ok' })
  const ok = (r: Reserva) => Number.isFinite(r.saidaMs) && r.saidaMs <= nowMs
  const semVeiculo = rv.filter((r) => !stL(r.statusLabel).includes('cancel') && Boolean(r.motoristaId) && !r.veiculoId && ok(r) && r.saidaMs >= CORTE_SEM_VEICULO).length
  const semTipo = rv.filter((r) => !r.tipoVeiculoRaw).length
  const semMotorista = rv.filter((r) => !r.motoristaId && ok(r) && r.saidaMs >= CORTE_SEM_MOTORISTA && r.status != null && STATUS_SEM_MOTORISTA.has(r.status) && r.categoriaItem === CAT_ITEM_SERVICO).length
  const semCliente = rv.filter((r) => r.saidaRaw.slice(0, 10) >= CORTE_SEM_CLIENTE && r.cliente === SEM_CLIENTE).length
  return [
    item('semVeiculo', 'Sem veículo', semVeiculo),
    item('semTipoVeiculo', 'Sem tipo de veículo', semTipo),
    item('semMotorista', 'Sem motorista', semMotorista),
    item('semCliente', 'Sem cliente', semCliente),
  ]
}

export function cardsFrotaPessoas(rv: Reserva[], s: Secundarios, nowMs: number): CardSecundario[] {
  const fora = (c: Conjunto) => s.indisponiveis.includes(c)
  const semDado = (id: string, rotulo: string): CardSecundario => ({ id, rotulo, valor: '—', apoio: 's/dado', atencao: false })
  const fat = soma(rv)
  const custo = s.manutencoes.reduce((t, m) => t + (m.valor || 0), 0)
  const pctRec = fat > 0 ? (custo / fat) * 100 : 0
  const pend = multasPendentes(s.multas).length
  const cnh = cnhEmAtencao(s.funcionarios, nowMs).length
  const ativos = s.veiculos.filter((v) => { const k = stL(v.statusLabel); return k.includes('dispon') || k.includes('ativo') }).length
  return [
    fora('manutencoes') ? semDado('manutencoes', 'Manutenções') : { id: 'manutencoes', rotulo: 'Manutenções', valor: int(s.manutencoes.length), apoio: `${brlS(custo)} · ${dec(pctRec, 1)}% da receita`, atencao: pctRec > 10 },
    fora('multas') ? semDado('multas', 'Multas') : { id: 'multas', rotulo: 'Multas', valor: int(s.multas.length), apoio: `${int(pend)} pendentes · ${pctMultas(s.multas)}%`, atencao: pend > 0 },
    fora('funcionarios') ? semDado('cnh', 'CNH em atenção') : { id: 'cnh', rotulo: 'CNH em atenção', valor: int(cnh), apoio: cnh ? `${int(cnh)} em atenção` : 'OK', atencao: cnh > 0 },
    fora('veiculos') ? semDado('frota', 'Frota ativa') : { id: 'frota', rotulo: 'Frota ativa', valor: int(ativos), apoio: `Total: ${int(s.veiculos.length)}`, atencao: false },
  ]
}
