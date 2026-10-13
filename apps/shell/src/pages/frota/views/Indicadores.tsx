import { Download, FileWarning, Timer, Wallet, Wrench } from 'lucide-react'
import { useMemo } from 'react'
import { Button, EmptyState, Input, MetricCard, PageToolbar, Surface, Table } from '@betinhos/ui'
import { useQueryPeriodo } from '../../../nav/queryState'
import { Bars } from '../components/Ui'
import { diaSP, formatBR } from '../data/dates'
import { brl, NAO_INFORMADO } from '../data/format'
import { GRAVIDADE, label, STATUS_OPTIONS, TIPO_REPARO } from '../data/schema'
import type { FrotaData } from '../data/types'
import { downloadCsv, toCsv } from '../domain/csv'
import { contarPor, custoPor, custoPorMes, multasNoPeriodo, multasPorMotorista, realizadas, tempoMedioDias, ultimos12Meses, type Custo, type Periodo } from '../domain/indicadores'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const mesLabel = (chave: string) => `${MESES[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`
const hint = (semValor: number) => (semValor > 0 ? `${semValor} sem valor` : undefined)
/** Grupo com manutenções, mas nenhuma com valor: o total zero não é um custo real. */
const todasSemValor = (item: { qtd: number; semValor: number }) => item.qtd > 0 && item.qtd === item.semValor
const barraCusto = (rotulo: string, item: Custo) => ({ label: rotulo, value: item.total, hint: hint(item.semValor), text: todasSemValor(item) ? NAO_INFORMADO : undefined })

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
  const calc = useMemo(() => {
    const feitas = realizadas(data.manutencoes, periodo)
    const multas = multasNoPeriodo(data.multas, periodo)
    const infracoes = new Map(data.infracoes.map((item) => [item.id, item]))
    return {
      total: feitas.reduce((sum, item) => sum + (item.valor ?? 0), 0),
      qtd: feitas.length,
      semValor: feitas.filter((item) => item.valor === null).length,
      tempo: tempoMedioDias(data.manutencoes, periodo),
      porMes: custoPorMes(data.manutencoes, periodo),
      porVeiculo: custoPor(data.manutencoes, periodo, (item) => item.veiculo?.label || 'Sem veículo'),
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
        <MetricCard icon={<Wallet size={20} />} label="Custo de manutenção no período" value={todasSemValor(calc) ? NAO_INFORMADO : brl(calc.total)} hint={calc.semValor > 0 ? `${calc.semValor} sem valor informado` : undefined} />
        <MetricCard icon={<Wrench size={20} />} label="Manutenções realizadas" value={calc.qtd} />
        <MetricCard icon={<Timer size={20} />} label="Tempo médio entre solicitação e realização" value={calc.tempo === null ? NAO_INFORMADO : `${String(calc.tempo).replace('.', ',')} dias`} />
        <MetricCard icon={<FileWarning size={20} />} tone="warning" label="Multas no período" value={calc.multas} />
      </div>

      <Surface title="Custo de manutenção por mês"><Bars items={calc.porMes.map((item) => barraCusto(mesLabel(item.chave), item))} format={brl} /></Surface>

      <div className="frota-cols">
        <Surface title="Custo por veículo"><Bars items={calc.porVeiculo.map((item) => barraCusto(item.chave, item))} format={brl} /></Surface>
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
