import { Plus } from 'lucide-react'
import { useMemo } from 'react'
import { Button, EmptyState, Input, PageToolbar, SearchBox, SegmentedControl, Table, TableTitle } from '@betinhos/ui'
import { lerOpcao, useQueryTexto } from '../../../nav/queryState'
import { patchHashQuery, useHashQuery } from '../../../nav/useHashRoute'
import { useNotify } from '../components/Toasts'
import { SelectFilter, StatusBadge } from '../components/Ui'
import { formatBR } from '../data/dates'
import { KIND_LABEL, STATUS_OPTIONS } from '../data/schema'
import type { DataSource } from '../data/source'
import type { FrotaData, Kind, Ref } from '../data/types'
import { errorMessage } from '../data/xrm'
import { linhas, type Linha } from '../domain/linhas'
import { CATEGORIAS_MANUT } from '../domain/manutencaoCatalogo'

const PLURAL: Record<Kind, string> = { manutencao: 'Manutenções', multa: 'Multas', colisao: 'Colisões' }
const PESSOA: Record<Kind, string> = { manutencao: 'Solicitante', multa: 'Motorista', colisao: 'Motorista' }
const EXTRA: Record<Kind, string> = { manutencao: 'Valor / grau', multa: 'Valor', colisao: 'Terceiro' }

function opcoes(refs: (Ref | null)[]) {
  const mapa = new Map(refs.filter((item): item is Ref => item !== null && item.label !== '').map((item) => [item.id, item.label]))
  return [...mapa.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
}

const categoriasTexto = (valores: number[]) => valores.map((value) => CATEGORIAS_MANUT.find((option) => option.value === value)?.label).filter(Boolean).join(' · ')

export function Registros({ kinds, data, source, onOpen, onReload }: { kinds: Kind[]; data: FrotaData; source: DataSource; onOpen: (kind: Kind, id: string) => void; onReload: () => void }) {
  const notify = useNotify()
  // Filtros na URL (#/frota?aba=manutencoes&q=…&status=…&veiculo=…&de=…); a troca de aba limpa todos.
  const kind = lerOpcao(useHashQuery(), 'tipo', kinds, kinds[0])
  const [busca, setBusca] = useQueryTexto('q')
  const [status, setStatus] = useQueryTexto('status')
  const [veiculo, setVeiculo] = useQueryTexto('veiculo')
  const [pessoa, setPessoa] = useQueryTexto('pessoa')
  const [categoria, setCategoria] = useQueryTexto('categoria')
  const [de, setDe] = useQueryTexto('de')
  const [ate, setAte] = useQueryTexto('ate')

  const todas = useMemo(() => linhas(kind, data), [kind, data])
  const opcoesVeiculo = useMemo(() => opcoes(todas.map((linha) => linha.veiculo)), [todas])
  const opcoesPessoa = useMemo(() => opcoes(todas.map((linha) => linha.pessoa)), [todas])
  const veiculoEfetivo = opcoesVeiculo.some((opcao) => opcao.value === veiculo) ? veiculo : ''
  const pessoaEfetiva = opcoesPessoa.some((opcao) => opcao.value === pessoa) ? pessoa : ''
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return todas.filter((linha) =>
      (!termo || [linha.titulo, linha.veiculo?.label, linha.pessoa?.label].some((valor) => valor?.toLowerCase().includes(termo)))
      && (!status || String(linha.status) === status)
      && (!veiculoEfetivo || linha.veiculo?.id === veiculoEfetivo)
      && (!pessoaEfetiva || linha.pessoa?.id === pessoaEfetiva)
      && (!categoria || linha.categorias.includes(Number(categoria)))
      && (!de || (linha.dia !== null && linha.dia >= de))
      && (!ate || (linha.dia !== null && linha.dia <= ate)))
  }, [todas, busca, status, veiculoEfetivo, pessoaEfetiva, categoria, de, ate])

  function trocar(next: Kind) {
    patchHashQuery({ tipo: next === kinds[0] ? null : next, status: null, veiculo: null, pessoa: null, categoria: null })
  }

  async function novo() {
    try {
      await source.openForm(kind)
    } catch (reason) {
      notify('error', errorMessage(reason))
      return
    }
    onReload()
  }

  return (
    <div className="frota-lista">
      <PageToolbar
        start={<>
          {kinds.length > 1 && <SegmentedControl size="compact" aria-label="Tipo de registro" options={kinds.map((item) => ({ value: item, label: PLURAL[item] }))} value={kind} onChange={trocar} />}
          <SearchBox className="frota-busca" size="compact" aria-label="Buscar registro" placeholder="Buscar descrição, placa ou pessoa" value={busca} onChange={setBusca} />
          <SelectFilter label="Status" allLabel="Todos os status" options={STATUS_OPTIONS[kind].map((option) => ({ value: String(option.value), label: option.label }))} value={status} onChange={setStatus} />
          <SelectFilter label="Veículo" allLabel="Todos os veículos" options={opcoesVeiculo} value={veiculoEfetivo} onChange={setVeiculo} />
          <SelectFilter label={PESSOA[kind]} allLabel="Todas as pessoas" options={opcoesPessoa} value={pessoaEfetiva} onChange={setPessoa} />
          {kind === 'manutencao' && <SelectFilter label="Categoria" allLabel="Todas as categorias" options={CATEGORIAS_MANUT.map((option) => ({ value: String(option.value), label: option.label }))} value={categoria} onChange={setCategoria} />}
          <Input className="frota-data" size="compact" type="date" aria-label="De" value={de} onChange={(event) => setDe(event.target.value)} />
          <Input className="frota-data" size="compact" type="date" aria-label="Até" value={ate} onChange={(event) => setAte(event.target.value)} />
        </>}
        end={<>
          <span className="frota-muted">{visiveis.length} de {todas.length}</span>
          <Button size="compact" variant="action" icon={<Plus size={16} />} onClick={() => void novo()}>Novo registro</Button>
        </>}
      />
      <Table<Linha>
        rows={visiveis}
        rowKey={(linha) => linha.id}
        onRowClick={(linha) => onOpen(linha.kind, linha.id)}
        empty={<EmptyState compact align="start" title={`Nenhum registro de ${KIND_LABEL[kind].toLowerCase()} com estes filtros`} />}
        columns={[
          { key: 'descricao', header: 'Descrição', width: 'minmax(180px, 2fr)', cell: (linha) => <TableTitle title={linha.titulo} meta={linha.categorias.length > 0 ? categoriasTexto(linha.categorias) : undefined} /> },
          { key: 'data', header: 'Data', width: 'minmax(92px, .6fr)', cell: (linha) => <span className="frota-nowrap">{formatBR(linha.dia)}</span> },
          { key: 'veiculo', header: 'Veículo', width: 'minmax(90px, .7fr)', hideBelow: 'mobile', cell: (linha) => <span className="frota-nowrap">{linha.veiculo?.label || '—'}</span> },
          { key: 'pessoa', header: PESSOA[kind], hideBelow: 'mobile', cell: (linha) => linha.pessoa?.label || '—' },
          { key: 'extra', header: EXTRA[kind], hideBelow: 'compact', cell: (linha) => <span className="frota-nowrap">{linha.extra}</span> },
          { key: 'status', header: 'Status', width: 'minmax(110px, .8fr)', cell: (linha) => <StatusBadge kind={linha.kind} value={linha.status} /> },
        ]}
      />
    </div>
  )
}
