import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button, EmptyState, PageToolbar, StatusBadge, Table } from '@betinhos/ui'
import { ItemPlanoDrawer } from '../components/ItemPlanoDrawer'
import { label } from '../data/schema'
import type { DataSource } from '../data/source'
import type { FrotaData, ItemPlano } from '../data/types'
import { SERVICOS_MANUT } from '../domain/manutencaoCatalogo'

const km = (n: number) => `${n.toLocaleString('pt-BR')} km`
const meses = (n: number) => `${n} ${n === 1 ? 'mês' : 'meses'}`
const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`
const juntar = (...partes: (string | null)[]) => partes.filter(Boolean).join(' · ') || '—'
const intervalo = (item: ItemPlano) => juntar(item.intervaloKm === null ? null : km(item.intervaloKm), item.intervaloMeses === null ? null : meses(item.intervaloMeses))
const aviso = (item: ItemPlano) => juntar(km(item.avisoKm), dias(item.avisoDias))

export function PlanoPreventivo({ data, source, onReload }: { data: FrotaData; source: DataSource; onReload: () => void }) {
  // undefined = drawer fechado; null = novo item.
  const [aberto, setAberto] = useState<ItemPlano | null | undefined>(undefined)
  const total = data.planoPreventivo.length

  return (
    <div className="frota-group">
      <PageToolbar
        label="Plano preventivo"
        start={<span className="frota-muted">{total} {total === 1 ? 'item' : 'itens'}</span>}
        end={<Button size="compact" icon={<Plus size={16} />} onClick={() => setAberto(null)}>Novo item</Button>}
      />
      <Table<ItemPlano>
        aria-label="Itens do plano preventivo"
        rows={data.planoPreventivo}
        rowKey={(item) => item.id}
        onRowClick={(item) => setAberto(item)}
        empty={<EmptyState compact align="start" title="Nenhum item no plano preventivo" />}
        columns={[
          { key: 'nome', header: 'Item', width: 'minmax(160px, 1.6fr)', cell: (item) => item.nome },
          { key: 'servico', header: 'Serviço', hideBelow: 'mobile', cell: (item) => label(SERVICOS_MANUT, item.servico) },
          { key: 'intervalo', header: 'Intervalo', cell: (item) => <span className="frota-nowrap">{intervalo(item)}</span> },
          { key: 'aviso', header: 'Aviso', hideBelow: 'compact', cell: (item) => <span className="frota-nowrap">{aviso(item)}</span> },
          { key: 'situacao', header: 'Situação', width: 'minmax(96px, .6fr)', cell: (item) => <StatusBadge tone={item.ativo ? 'success' : 'neutral'}>{item.ativo ? 'Ativo' : 'Inativo'}</StatusBadge> },
        ]}
      />
      {aberto !== undefined ? (
        <ItemPlanoDrawer
          key={aberto?.id ?? 'novo'}
          source={source}
          item={aberto}
          onClose={() => setAberto(undefined)}
          onSaved={() => { setAberto(undefined); onReload() }}
        />
      ) : null}
    </div>
  )
}
