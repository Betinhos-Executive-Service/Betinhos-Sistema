import { useEffect, useState } from 'react'
import { Button, Input, PageToolbar, Select } from '@betinhos/ui'
import { X } from 'lucide-react'
import type { OpcoesFiltro } from '../domain/base'
import { atalho } from '../domain/periodo'
import type { Atalho, Filtros } from '../domain/types'
import { useMedia } from '../../operacional/useMedia'
import { MEDIA_MOBILE } from './Linhas'

const ATALHOS: { value: Atalho; label: string }[] = [
  { value: 'hoje', label: 'Hoje' }, { value: 'ult7', label: 'Últimos 7 dias' }, { value: 'ult30', label: 'Últimos 30 dias' },
  { value: 'esteMes', label: 'Este mês' }, { value: 'mesAnt', label: 'Mês anterior' }, { value: 'esteAno', label: 'Este ano' },
  { value: 'anoAnt', label: 'Ano anterior' }, { value: 'personalizado', label: 'Personalizado' },
]
const DATA = /^\d{4}-\d{2}-\d{2}$/

type Props = { filtros: Filtros; opcoes: OpcoesFiltro; now: Date; onChange: (f: Filtros) => void }

/**
 * Barra de filtros (DS §10.2.2): período num seletor único (as datas aparecem só no "Personalizado"),
 * depois os segmentos e "Limpar filtros". Tudo cabe numa linha no desktop.
 */
export function DashboardToolbar({ filtros, opcoes, now, onChange }: Props) {
  const mobile = useMedia(MEDIA_MOBILE)
  const [rascunho, setRascunho] = useState({ inicio: filtros.inicio, fim: filtros.fim })
  useEffect(() => setRascunho({ inicio: filtros.inicio, fim: filtros.fim }), [filtros.inicio, filtros.fim])
  const invalido = rascunho.inicio > rascunho.fim
  const datas = (proximo: { inicio: string; fim: string }) => {
    setRascunho(proximo)
    if (DATA.test(proximo.inicio) && DATA.test(proximo.fim) && proximo.inicio <= proximo.fim) onChange({ ...filtros, ...proximo })
  }
  const escolher = (a: Atalho) => onChange(a === 'personalizado' ? { ...filtros, atalho: a } : { ...filtros, atalho: a, ...atalho(a, now) })
  const segmentos = filtros.status.length + filtros.clientes.length + filtros.motoristas.length + filtros.tipos.length
  const tamanho = mobile ? 'default' : 'compact'
  return (
    <PageToolbar
      variant="filters"
      label="Filtros do dashboard"
      className="dash-filtros"
      start={<>
        <Select size={tamanho} aria-label="Período" className="dash-periodo" searchable={false} clearable={false} options={ATALHOS} value={filtros.atalho} onChange={(v) => v && escolher(v as Atalho)} />
        {filtros.atalho === 'personalizado' ? (
          <div className="dash-datas">
            <Input type="date" size={tamanho} aria-label="Início" value={rascunho.inicio} invalid={invalido} onChange={(e) => datas({ ...rascunho, inicio: e.target.value })} />
            <Input type="date" size={tamanho} aria-label="Fim" value={rascunho.fim} invalid={invalido} onChange={(e) => datas({ ...rascunho, fim: e.target.value })} />
            {invalido ? <span className="dash-erro" role="alert">O início precisa ser antes do fim.</span> : null}
          </div>
        ) : null}
        <div className="dash-segmentos">
          <Select multiple size={tamanho} aria-label="Status" placeholder="Status" searchable={false} options={opcoes.status} value={filtros.status} onChange={(v) => onChange({ ...filtros, status: v })} />
          <Select multiple size={tamanho} aria-label="Cliente" placeholder="Cliente" options={opcoes.clientes} value={filtros.clientes} onChange={(v) => onChange({ ...filtros, clientes: v })} />
          <Select multiple size={tamanho} aria-label="Motorista" placeholder="Motorista" options={opcoes.motoristas} value={filtros.motoristas} onChange={(v) => onChange({ ...filtros, motoristas: v })} />
          <Select multiple size={tamanho} aria-label="Tipo de veículo" placeholder="Tipo de veículo" searchable={false} options={opcoes.tipos} value={filtros.tipos} onChange={(v) => onChange({ ...filtros, tipos: v })} />
        </div>
      </>}
      end={segmentos ? <Button variant="ghost" size={mobile ? 'default' : 'compact'} icon={<X size={16} />} onClick={() => onChange({ ...filtros, status: [], clientes: [], motoristas: [], tipos: [] })}>Limpar filtros</Button> : undefined}
    />
  )
}
