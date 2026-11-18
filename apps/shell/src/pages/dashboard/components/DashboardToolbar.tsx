import { useEffect, useState } from 'react'
import { Button, Input, PageToolbar, SegmentedControl, Select } from '@betinhos/ui'
import { X } from 'lucide-react'
import type { OpcoesFiltro } from '../domain/base'
import { atalho } from '../domain/periodo'
import type { Atalho, Filtros } from '../domain/types'
import { useMedia } from '../../operacional/useMedia'
import { MEDIA_MOBILE } from './Linhas'

type Rapido = 'esteMes' | 'esteTrimestre' | 'esteAno' | 'personalizado'
const RAPIDOS: { value: Rapido; label: string }[] = [
  { value: 'esteMes', label: 'Mês' }, { value: 'esteTrimestre', label: 'Trimestre' }, { value: 'esteAno', label: 'Ano' }, { value: 'personalizado', label: 'Personalizado' },
]
/** Os demais atalhos (hoje, 7 e 30 dias, mês e ano anteriores) continuam valendo pela URL e aparecem como "Personalizado", com as datas à vista. */
const rapidoDe = (a: Atalho): Rapido => (a === 'esteMes' || a === 'esteTrimestre' || a === 'esteAno' ? a : 'personalizado')
const DATA = /^\d{4}-\d{2}-\d{2}$/

type Props = { periodoAqui?: boolean; filtros: Filtros; opcoes: OpcoesFiltro; now: Date; onChange: (f: Filtros) => void }

/** Período em botões rápidos: Mês, Trimestre e Ano até hoje; "Personalizado" abre as datas na barra de filtros. */
export function PeriodoRapido({ filtros, now, onChange, fullWidth }: Omit<Props, 'opcoes' | 'periodoAqui'> & { fullWidth?: boolean }) {
  const escolher = (v: Rapido) => onChange(v === 'personalizado' ? { ...filtros, atalho: 'personalizado' } : { ...filtros, atalho: v, ...atalho(v, now) })
  return <SegmentedControl aria-label="Período" size="compact" fullWidth={fullWidth} options={RAPIDOS} value={rapidoDe(filtros.atalho)} onChange={escolher} />
}

/**
 * Barra de filtros (DS §10.2.2): período num seletor único (as datas aparecem só no "Personalizado"),
 * depois os segmentos e "Limpar filtros". Tudo cabe numa linha no desktop.
 */
export function DashboardToolbar({ periodoAqui = false, filtros, opcoes, now, onChange }: Props) {
  const mobile = useMedia(MEDIA_MOBILE)
  const [rascunho, setRascunho] = useState({ inicio: filtros.inicio, fim: filtros.fim })
  useEffect(() => setRascunho({ inicio: filtros.inicio, fim: filtros.fim }), [filtros.inicio, filtros.fim])
  const invalido = rascunho.inicio > rascunho.fim
  const datas = (proximo: { inicio: string; fim: string }) => {
    setRascunho(proximo)
    if (DATA.test(proximo.inicio) && DATA.test(proximo.fim) && proximo.inicio <= proximo.fim) onChange({ ...filtros, atalho: 'personalizado', ...proximo })
  }
  const segmentos = filtros.status.length + filtros.clientes.length + filtros.motoristas.length + filtros.tipos.length
  const tamanho = mobile ? 'default' : 'compact'
  return (
    <PageToolbar
      variant="filters"
      label="Filtros do dashboard"
      className="dash-filtros"
      start={<>
        {periodoAqui ? <PeriodoRapido filtros={filtros} now={now} onChange={onChange} fullWidth={mobile} /> : null}
        {rapidoDe(filtros.atalho) === 'personalizado' ? (
          <div className="dash-datas">
            <Input type="date" size={tamanho} aria-label="Início" value={rascunho.inicio} invalid={invalido} onChange={(e) => datas({ ...rascunho, inicio: e.target.value })} />
            <Input type="date" size={tamanho} aria-label="Fim" value={rascunho.fim} invalid={invalido} onChange={(e) => datas({ ...rascunho, fim: e.target.value })} />
            {invalido ? <span className="dash-erro" role="alert">O início precisa ser antes do fim.</span> : null}
          </div>
        ) : null}
        <div className="dash-segmentos">
          <Select multiple size={tamanho} aria-label="Status" placeholder="+ Status" clearable className="dash-chip dash-chip--status" searchable={false} options={opcoes.status} value={filtros.status} onChange={(v) => onChange({ ...filtros, status: v })} />
          <Select multiple size={tamanho} aria-label="Cliente" placeholder="+ Cliente" clearable className="dash-chip dash-chip--cliente" options={opcoes.clientes} value={filtros.clientes} onChange={(v) => onChange({ ...filtros, clientes: v })} />
          <Select multiple size={tamanho} aria-label="Motorista" placeholder="+ Motorista" clearable className="dash-chip dash-chip--motorista" options={opcoes.motoristas} value={filtros.motoristas} onChange={(v) => onChange({ ...filtros, motoristas: v })} />
          <Select multiple size={tamanho} aria-label="Tipo de veículo" placeholder="+ Tipo de veículo" clearable className="dash-chip dash-chip--tipo" searchable={false} options={opcoes.tipos} value={filtros.tipos} onChange={(v) => onChange({ ...filtros, tipos: v })} />
        </div>
      </>}
      end={segmentos ? <Button variant="ghost" size={mobile ? 'default' : 'compact'} icon={<X size={16} />} onClick={() => onChange({ ...filtros, status: [], clientes: [], motoristas: [], tipos: [] })}>Limpar filtros</Button> : undefined}
    />
  )
}
