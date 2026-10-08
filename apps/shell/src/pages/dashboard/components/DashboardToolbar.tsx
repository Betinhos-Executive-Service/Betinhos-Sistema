import { useEffect, useState } from 'react'
import { Button, Input, PageToolbar, Select } from '@betinhos/ui'
import { X } from 'lucide-react'
import type { OpcoesFiltro } from '../domain/base'
import { atalho } from '../domain/periodo'
import type { Atalho, Filtros } from '../domain/types'

const ATALHOS: { value: Atalho; label: string }[] = [
  { value: 'hoje', label: 'Hoje' }, { value: 'ult7', label: 'Últimos 7 dias' }, { value: 'ult30', label: 'Últimos 30 dias' },
  { value: 'esteMes', label: 'Este mês' }, { value: 'mesAnt', label: 'Mês anterior' }, { value: 'esteAno', label: 'Este ano' },
  { value: 'anoAnt', label: 'Ano anterior' }, { value: 'personalizado', label: 'Personalizado' },
]
const DATA = /^\d{4}-\d{2}-\d{2}$/

type Props = { filtros: Filtros; opcoes: OpcoesFiltro; now: Date; onChange: (f: Filtros) => void }

export function DashboardToolbar({ filtros, opcoes, now, onChange }: Props) {
  const [rascunho, setRascunho] = useState({ inicio: filtros.inicio, fim: filtros.fim })
  useEffect(() => setRascunho({ inicio: filtros.inicio, fim: filtros.fim }), [filtros.inicio, filtros.fim])
  const invalido = rascunho.inicio > rascunho.fim
  const datas = (proximo: { inicio: string; fim: string }) => {
    setRascunho(proximo)
    if (DATA.test(proximo.inicio) && DATA.test(proximo.fim) && proximo.inicio <= proximo.fim) onChange({ ...filtros, ...proximo })
  }
  const segmentos = filtros.status.length + filtros.clientes.length + filtros.motoristas.length + filtros.tipos.length
  return (
    <PageToolbar
      variant="filters"
      label="Filtros do dashboard"
      start={<>
        <Select aria-label="Período" searchable={false} clearable={false} options={ATALHOS} value={filtros.atalho}
          onChange={(v) => { const a = (v ?? 'esteAno') as Atalho; onChange(a === 'personalizado' ? { ...filtros, atalho: a } : { ...filtros, atalho: a, ...atalho(a, now) }) }} />
        {filtros.atalho === 'personalizado' ? <>
          <Input type="date" aria-label="Início" value={rascunho.inicio} invalid={invalido} onChange={(e) => datas({ ...rascunho, inicio: e.target.value })} />
          <Input type="date" aria-label="Fim" value={rascunho.fim} invalid={invalido} onChange={(e) => datas({ ...rascunho, fim: e.target.value })} />
          {invalido ? <span className="dash-erro" role="alert">O início precisa ser antes do fim.</span> : null}
        </> : null}
        <Select multiple aria-label="Status" placeholder="Status" searchable={false} options={opcoes.status} value={filtros.status} onChange={(v) => onChange({ ...filtros, status: v })} />
        <Select multiple aria-label="Cliente" placeholder="Cliente" options={opcoes.clientes} value={filtros.clientes} onChange={(v) => onChange({ ...filtros, clientes: v })} />
        <Select multiple aria-label="Motorista" placeholder="Motorista" options={opcoes.motoristas} value={filtros.motoristas} onChange={(v) => onChange({ ...filtros, motoristas: v })} />
        <Select multiple aria-label="Tipo de veículo" placeholder="Tipo de veículo" searchable={false} options={opcoes.tipos} value={filtros.tipos} onChange={(v) => onChange({ ...filtros, tipos: v })} />
      </>}
      end={segmentos ? <Button variant="ghost" icon={<X size={16} />} onClick={() => onChange({ ...filtros, status: [], clientes: [], motoristas: [], tipos: [] })}>Limpar filtros</Button> : undefined}
    />
  )
}
