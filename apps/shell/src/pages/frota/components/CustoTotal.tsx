import { Input } from '@betinhos/ui'
import { useMemo } from 'react'
import { brl, NAO_INFORMADO } from '../data/format'
import type { LoadResult } from '../data/source'
import type { FrotaData } from '../data/types'
import { custoTotalVeiculo, FONTE_LABEL, FONTES, type EntradaCusto, type ParcelaCusto } from '../domain/custoTotal'
import type { Periodo } from '../domain/indicadores'

const registros = (qtd: number) => `${qtd} ${qtd === 1 ? 'registro' : 'registros'}`

function textoParcela(parcela: ParcelaCusto) {
  if (parcela.indisponivel) return 'Indisponível'
  if (parcela.qtd === 0) return `— · ${registros(0)}`
  if (parcela.qtd === parcela.semValor) return NAO_INFORMADO
  return `${brl(parcela.valor)} · ${registros(parcela.qtd)}`
}

/** Custo total do veículo no período: manutenção, multas, combustível e documentos, com R$/km pela telemetria. */
export function CustoTotal({ data, errors, veiculoId, periodo, onPeriodo }: { data: FrotaData; errors: LoadResult['errors']; veiculoId: string; periodo: Periodo; onPeriodo: (p: Periodo) => void }) {
  const custo = useMemo(() => {
    const entrada: EntradaCusto = {
      manutencoes: data.manutencoes,
      multas: data.multas,
      infracoes: data.infracoes,
      despesasCombustivel: data.despesasCombustivel,
      telemetriaKm: data.telemetriaKm,
      // Documentos (IPVA e seguro) ficam vazios até a branch de Documentos ser mesclada (spec §9.4).
      documentos: [],
      indisponiveis: { combustivel: !!errors.despesasCombustivel, telemetria: !!errors.telemetriaKm, manutencao: !!errors.manutencoes, multas: !!errors.multas || !!errors.infracoes, documentos: false },
    }
    return custoTotalVeiculo(entrada, veiculoId, periodo)
  }, [data.manutencoes, data.multas, data.infracoes, data.despesasCombustivel, data.telemetriaKm, errors.despesasCombustivel, errors.telemetriaKm, errors.manutencoes, errors.multas, errors.infracoes, veiculoId, periodo])

  return (
    <>
      <div className="frota-cluster">
        <Input className="frota-data" size="compact" type="date" aria-label="De" value={periodo.de} max={periodo.ate} onChange={(event) => { const de = event.target.value; if (de && de <= periodo.ate) onPeriodo({ ...periodo, de }) }} />
        <Input className="frota-data" size="compact" type="date" aria-label="Até" value={periodo.ate} min={periodo.de} onChange={(event) => { const ate = event.target.value; if (ate && ate >= periodo.de) onPeriodo({ ...periodo, ate }) }} />
      </div>
      <p className="frota-kpi">
        <strong>{brl(custo.total)}</strong>
        <span>{custo.custoPorKm === null ? 'R$/km indisponível (sem telemetria no período)' : `${brl(custo.custoPorKm)} por km · ${(custo.kmRodado ?? 0).toLocaleString('pt-BR')} km rodados`}</span>
      </p>
      <dl className="frota-detail">
        {FONTES.map((fonte) => {
          const parcela = custo.porFonte[fonte]
          const comValor = !parcela.indisponivel && parcela.qtd > parcela.semValor
          return [
            <dt key={`${fonte}-dt`}>{FONTE_LABEL[fonte]}</dt>,
            <dd key={`${fonte}-dd`}>{textoParcela(parcela)}{comValor && parcela.semValor > 0 && <> · <span className="frota-muted">{parcela.semValor} sem valor</span></>}</dd>,
          ]
        })}
      </dl>
      {custo.despesasManutencaoSemVinculo > 0 && <p className="frota-muted">{custo.despesasManutencaoSemVinculo} {custo.despesasManutencaoSemVinculo === 1 ? 'despesa de manutenção sem vínculo com uma manutenção (não somada)' : 'despesas de manutenção sem vínculo com uma manutenção (não somadas)'}</p>}
    </>
  )
}
