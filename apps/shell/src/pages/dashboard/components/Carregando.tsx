import { Skeleton, Surface } from '@betinhos/ui'
import { KpisCarregando, type ColunasKpi } from './KpiCard'

/**
 * Blocos da aba na primeira carga: a grade de cards no formato final, com o título de cada bloco e o miolo ocupado.
 * Decorativos (`aria-hidden`): o estado de carga é anunciado pela linha de KPIs (`aria-busy` + "Carregando").
 */
export function BlocosCarregando({ titulos }: { titulos: readonly string[] }) {
  return (
    <div className="dash-grade" aria-hidden="true">
      {titulos.map((t) => (
        <Surface as="div" key={t} className="dash-card">
          <div className="dash-card__resumo">
            <span className="dash-card__titulo">{t}</span>
            <Skeleton height={26} width="40%" />
            <Skeleton height={14} width="64%" />
          </div>
          <Skeleton className="dash-card__esqueleto" shape="rect" width="auto" />
        </Surface>
      ))}
    </div>
  )
}

/** Primeira carga de qualquer aba: KPIs ocupados + blocos ocupados, no mesmo padrão em todas. */
export function AbaCarregando({ rotulo, kpis, colunas, blocos, serie = false }: { rotulo: string; kpis: readonly string[]; colunas: ColunasKpi; blocos: readonly string[]; serie?: boolean }) {
  return <>
    <KpisCarregando rotulo={rotulo} rotulos={kpis} colunas={colunas} serie={serie} />
    <BlocosCarregando titulos={blocos} />
  </>
}
