import { useMemo, useState } from 'react'
import { Alert, Button, StatusBadge } from '@betinhos/ui'
import { diaSP, formatBR } from '../data/dates'
import { PROPRIO, VEICULO } from '../data/schema'
import type { DataSource, LoadResult } from '../data/source'
import type { FrotaData, ItemPlano, Kind, Veiculo } from '../data/types'
import { ESTADO_LABEL, ESTADO_TONE, kmAtualDe, preventivasDoVeiculo, type Preventiva } from '../domain/preventiva'
import { BaselineDrawer } from './BaselineDrawer'

const km = (n: number) => `${n.toLocaleString('pt-BR')} km`
const horaSP = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

function linhaHodometro(veiculo: Veiculo, manutencoes: FrotaData['manutencoes']): string {
  if (veiculo.hodometro !== null) {
    const lido = veiculo.hodometroEm ? ` · lido em ${formatBR(diaSP(veiculo.hodometroEm))} ${horaSP(veiculo.hodometroEm)}` : ''
    return `Hodômetro: ${km(veiculo.hodometro)}${lido}`
  }
  const atual = kmAtualDe(veiculo, manutencoes)
  return atual.km !== null ? `Km estimado pela última manutenção: ${km(atual.km)}` : 'Sem km conhecido'
}

/** O que estiver negativo primeiro (km, depois dias); senão o que falta. */
function textoFaltam(p: Preventiva): string {
  if (p.estado === 'sem_base') return ''
  if (p.faltamKm !== null && p.faltamKm < 0) return `vencido há ${km(-p.faltamKm)}`
  if (p.faltamDias !== null && p.faltamDias < 0) return `vencido há ${-p.faltamDias} ${p.faltamDias === -1 ? 'dia' : 'dias'}`
  const partes = [p.faltamKm !== null ? km(p.faltamKm) : null, p.faltamDias !== null ? `${p.faltamDias} ${p.faltamDias === 1 ? 'dia' : 'dias'}` : null].filter(Boolean)
  return partes.length ? `faltam ${partes.join(' · ')}` : ''
}

/**
 * Botão de informar a última execução: sem base, ou quando a última execução não tem o dado que a regra do item pede.
 * Sem km conhecido do veículo a regra por km nunca é avaliada: o aviso aparece junto do botão (spec §5).
 */
function acoesUltima(p: Preventiva): { botao: boolean; semKm: boolean } {
  const precisaKm = p.item.intervaloKm !== null && (p.ultima === null || p.ultima.km === null)
  const precisaData = p.item.intervaloMeses !== null && (p.ultima === null || p.ultima.data === null)
  const semKm = p.kmAtual === null && p.item.intervaloKm !== null
  return { botao: p.estado === 'sem_base' || (p.ultima !== null && (precisaKm || precisaData)), semKm }
}

function textoUltima(p: Preventiva): string {
  if (!p.ultima) return ''
  return `Última: ${[p.ultima.data ? formatBR(p.ultima.data) : null, p.ultima.km !== null ? km(p.ultima.km) : null].filter(Boolean).join(' · ')}`
}

export function Preventivas({ data, veiculoId, today, source, errors, onOpen, onReload }: { data: FrotaData; veiculoId: string; today: string; source: DataSource; errors: LoadResult['errors']; onOpen: (kind: Kind, id: string) => void; onReload: () => void }) {
  const [baseline, setBaseline] = useState<ItemPlano | null>(null)
  const veiculo = data.veiculos.find((v) => v.id === veiculoId)
  const lista = useMemo(
    () => preventivasDoVeiculo({ veiculos: data.veiculos, manutencoes: data.manutencoes, itens: data.planoPreventivo, baselines: data.baselines }, veiculoId, today),
    [data.veiculos, data.manutencoes, data.planoPreventivo, data.baselines, veiculoId, today],
  )
  if (!veiculo) return null

  const alertas = ([['planoPreventivo', 'Plano preventivo'], ['baselines', 'Últimas execuções informadas']] as const)
    .filter(([key]) => errors[key])
    .map(([key, nome]) => <Alert key={key} tone="danger">Não foi possível carregar {nome}: {errors[key]}</Alert>)
  if (veiculo.status !== VEICULO.ATIVO || veiculo.categoria !== PROPRIO) {
    return <>{alertas}<p className="frota-muted">Plano preventivo vale só para veículos ativos e próprios.</p></>
  }

  return (
    <>
      {alertas}
      <p className="frota-muted">{linhaHodometro(veiculo, data.manutencoes)}</p>
      {lista.length === 0 ? (errors.planoPreventivo ? null : <p className="frota-muted">Nenhum item no plano preventivo.</p>) : (
        <ul className="frota-prev">
          {lista.map((p) => {
            const faltam = textoFaltam(p)
            const ultima = textoUltima(p)
            const acoes = acoesUltima(p)
            return (
              <li key={p.item.id}>
                <StatusBadge tone={ESTADO_TONE[p.estado]}>{ESTADO_LABEL[p.estado]}</StatusBadge>
                <strong>{p.item.nome}</strong>
                {faltam && <span>{faltam}</span>}
                {p.emAndamento && <span className="frota-muted">Em andamento</span>}
                {ultima && (p.ultima?.origem === 'manutencao' && p.ultima.manutencaoId
                  ? <button type="button" className="frota-link" onClick={() => onOpen('manutencao', p.ultima!.manutencaoId!)}>{ultima}</button>
                  : <span className="frota-muted">{ultima}</span>)}
                {acoes.semKm && <span className="frota-muted">Veículo sem km conhecido: a regra por km não é avaliada</span>}
                {acoes.botao && <Button size="compact" variant="secondary" onClick={() => setBaseline(p.item)}>Informar última execução</Button>}
              </li>
            )
          })}
        </ul>
      )}
      {baseline && (
        <BaselineDrawer
          source={source}
          veiculo={veiculo}
          item={baseline}
          today={today}
          onClose={() => setBaseline(null)}
          onSaved={() => { setBaseline(null); onReload() }}
        />
      )}
    </>
  )
}
