import { Download, FileWarning, Timer, Wallet, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, EmptyState, Input, MetricCard, PageToolbar, Surface, Table } from '@betinhos/ui'
import { useQueryPeriodo } from '../../../nav/queryState'
import { Bars } from '../components/Ui'
import { diaSP, formatBR } from '../data/dates'
import { brl, NAO_INFORMADO } from '../data/format'
import { GRAVIDADE, label, STATUS_OPTIONS, TIPO_REPARO } from '../data/schema'
import type { FrotaData } from '../data/types'
import { downloadCsv, toCsv } from '../domain/csv'
import { custoPorMesEmpilhado, custoPorVeiculo, FONTE_LABEL, type CustoVeiculo, type EntradaCusto } from '../domain/custoTotal'
import { centavos, contarPor, custoPor, multasNoPeriodo, multasPorMotorista, realizadas, tempoMedioDias, ultimos12Meses, type Custo, type Periodo } from '../domain/indicadores'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const mesLabel = (chave: string) => `${MESES[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`
const hint = (semValor: number) => (semValor > 0 ? `${semValor} sem valor` : undefined)
/** Grupo com manutenções, mas nenhuma com valor: o total zero não é um custo real. */
const todasSemValor = (item: { qtd: number; semValor: number }) => item.qtd > 0 && item.qtd === item.semValor
const barraCusto = (rotulo: string, item: Custo) => ({ label: rotulo, value: item.total, hint: hint(item.semValor), text: todasSemValor(item) ? NAO_INFORMADO : undefined })

type Ordem = 'total' | 'custoPorKm'

/** Ordem decrescente pela coluna escolhida; sem R$/km vai para o fim e o empate fica pela placa. */
function ordenar(linhas: CustoVeiculo[], ordem: Ordem) {
  return [...linhas].sort((a, b) => {
    const va = a[ordem]
    const vb = b[ordem]
    if (va === null || vb === null) return va === vb ? a.placa.localeCompare(b.placa) : va === null ? 1 : -1
    return vb - va || a.placa.localeCompare(b.placa)
  })
}

/** Botão de ordenação no cabeçalho da tabela; marca `aria-sort` na célula de cabeçalho (o `Table` não expõe a prop). */
function Ordenar({ rotulo, ativo, onClick }: { rotulo: string; ativo: boolean; onClick: () => void }) {
  return (
    <button type="button" className="frota-link" onClick={onClick} ref={(el) => { el?.closest('[role="columnheader"]')?.setAttribute('aria-sort', ativo ? 'descending' : 'none') }}>
      {rotulo}{ativo && <span aria-hidden="true"> ↓</span>}
    </button>
  )
}

export function linhasCsv(data: FrotaData, periodo: Periodo) {
  const rows = realizadas(data.manutencoes, periodo)
    .map((item) => ({ dia: diaSP(item.dataManutencao ?? item.criadoEm) ?? '', item }))
    .sort((a, b) => b.dia.localeCompare(a.dia))
    .map(({ dia, item }) => [formatBR(dia), item.veiculo?.label ?? '', item.descricao, label(TIPO_REPARO, item.tipo), item.estabelecimento ?? '', item.valor])
  return { headers: ['Data', 'Veículo', 'Descrição', 'Tipo de reparo', 'Estabelecimento', 'Valor'], rows }
}

export function Indicadores({ data, today }: { data: FrotaData; today: string }) {
  // Período na URL (#/frota?aba=indicadores&de=…&ate=…); sem datas, valem os últimos 12 meses.
  const padrao = useMemo(() => ultimos12Meses(today), [today])
  const [periodo, setPeriodo] = useQueryPeriodo('de', 'ate', padrao)
  const [ordem, setOrdem] = useState<Ordem>('total')
  const calc = useMemo(() => {
    // O ViewGate já bloqueia a aba quando manutenções, multas ou infrações falham; falhas de despesas e telemetria não chegam aqui.
    const entrada: EntradaCusto = { manutencoes: data.manutencoes, multas: data.multas, infracoes: data.infracoes, despesasCombustivel: data.despesasCombustivel, telemetriaKm: data.telemetriaKm, documentos: [], indisponiveis: {} }
    const porVeiculo = custoPorVeiculo(entrada, data.veiculos, periodo)
    // KPI na mesma base do gráfico por mês: inclui lançamentos sem veículo.
    const porMes = custoPorMesEmpilhado(entrada, periodo)
    const feitas = realizadas(data.manutencoes, periodo)
    const multas = multasNoPeriodo(data.multas, periodo)
    const infracoes = new Map(data.infracoes.map((item) => [item.id, item]))
    return {
      total: centavos(porMes.reduce((sum, item) => sum + item.total, 0)),
      qtd: feitas.length,
      tempo: tempoMedioDias(data.manutencoes, periodo),
      porMes,
      porVeiculo,
      porTipo: custoPor(data.manutencoes, periodo, (item) => label(TIPO_REPARO, item.tipo)),
      multas: multas.length,
      porMotorista: multasPorMotorista(data.multas, data.infracoes, periodo),
      porGravidade: contarPor(multas, (item) => (item.infracaoId ? label(GRAVIDADE, infracoes.get(item.infracaoId)?.gravidade ?? null) : 'Sem código de infração')),
      porStatus: contarPor(multas, (item) => label(STATUS_OPTIONS.multa, item.status, 'Sem status')),
    }
  }, [data, periodo])

  function exportar() {
    const { headers, rows } = linhasCsv(data, periodo)
    downloadCsv(`frota-manutencoes-${periodo.de}-a-${periodo.ate}.csv`, toCsv(headers, rows))
  }

  const inteiro = (value: number) => String(value)
  type PorMotorista = (typeof calc.porMotorista)[number]

  return (
    <div className="frota-indicadores">
      <PageToolbar
        label="Período"
        start={<>
          <span className="frota-muted">Período</span>
          <Input className="frota-data" size="compact" type="date" aria-label="De" value={periodo.de} max={periodo.ate} onChange={(event) => { const de = event.target.value; if (de && de <= periodo.ate) setPeriodo({ ...periodo, de }) }} />
          <Input className="frota-data" size="compact" type="date" aria-label="Até" value={periodo.ate} min={periodo.de} onChange={(event) => { const ate = event.target.value; if (ate && ate >= periodo.de) setPeriodo({ ...periodo, ate }) }} />
        </>}
        end={<Button variant="secondary" size="compact" icon={<Download size={16} />} onClick={exportar} disabled={calc.qtd === 0}>Exportar manutenções (CSV)</Button>}
      />

      <div className="frota-kpis frota-kpis--4" aria-label="Resumo">
        <MetricCard icon={<Wallet size={20} />} label="Custo total no período" value={brl(calc.total)} hint="manutenção + multas + combustível" />
        <MetricCard icon={<Wrench size={20} />} label="Manutenções realizadas" value={calc.qtd} />
        <MetricCard icon={<Timer size={20} />} label="Tempo médio entre solicitação e realização" value={calc.tempo === null ? NAO_INFORMADO : `${String(calc.tempo).replace('.', ',')} dias`} />
        <MetricCard icon={<FileWarning size={20} />} tone="warning" label="Multas no período" value={calc.multas} />
      </div>

      <Surface title="Custo total por mês"><Bars items={calc.porMes.map((m) => ({ label: mesLabel(m.chave), value: m.total, hint: `${brl(m.porFonte.manutencao)} manut. · ${brl(m.porFonte.multas)} multas · ${brl(m.porFonte.combustivel)} comb.` }))} format={brl} /></Surface>

      <div className="frota-cols">
        <Surface title="Custo por veículo" flush>
          <Table<CustoVeiculo>
            rows={ordenar(calc.porVeiculo, ordem)}
            rowKey={(item) => item.veiculoId}
            empty={<EmptyState compact align="start" title="Sem veículos" />}
            columns={[
              { key: 'veiculo', header: 'Veículo', width: 'minmax(110px, 1.2fr)', cell: (item) => item.placa || 'Sem placa' },
              { key: 'total', header: <Ordenar rotulo="Total" ativo={ordem === 'total'} onClick={() => setOrdem('total')} />, align: 'end', cell: (item) => <span className="frota-nowrap">{brl(item.total)}</span> },
              { key: 'custoPorKm', header: <Ordenar rotulo="R$/km" ativo={ordem === 'custoPorKm'} onClick={() => setOrdem('custoPorKm')} />, align: 'end', cell: (item) => <span className="frota-nowrap">{item.custoPorKm === null ? '—' : brl(item.custoPorKm)}</span> },
              { key: 'maiorFonte', header: 'Maior fonte', cell: (item) => (item.maiorFonte ? FONTE_LABEL[item.maiorFonte] : '—') },
            ]}
          />
        </Surface>
        <Surface title="Custo por tipo de reparo"><Bars items={calc.porTipo.map((item) => barraCusto(item.chave, item))} format={brl} /></Surface>
      </div>

      <Surface title="Multas por motorista" flush>
        <Table<PorMotorista>
          rows={calc.porMotorista}
          rowKey={(item) => item.motorista}
          empty={<EmptyState compact align="start" title="Sem multas no período" />}
          columns={[
            { key: 'motorista', header: 'Motorista', width: 'minmax(160px, 2fr)', cell: (item) => item.motorista },
            { key: 'qtd', header: 'Multas', align: 'end', cell: (item) => item.qtd },
            { key: 'valor', header: 'Valor (catálogo)', align: 'end', cell: (item) => <span className="frota-nowrap">{todasSemValor(item) ? NAO_INFORMADO : brl(item.valor)}{item.semValor > 0 && <span className="frota-muted"> · {item.semValor} sem valor</span>}</span> },
            { key: 'pontos', header: 'Pontos na CNH', align: 'end', hideBelow: 'mobile', cell: (item) => item.pontos },
          ]}
        />
      </Surface>

      <div className="frota-cols">
        <Surface title="Multas por gravidade"><Bars items={calc.porGravidade.map((item) => ({ label: item.chave, value: item.qtd }))} format={inteiro} /></Surface>
        <Surface title="Multas por status"><Bars items={calc.porStatus.map((item) => ({ label: item.chave, value: item.qtd }))} format={inteiro} /></Surface>
      </div>
    </div>
  )
}
