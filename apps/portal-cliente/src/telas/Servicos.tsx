import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Checkbox, EmptyState, PageToolbar, SearchBox, SegmentedControl, Select, StatusBadge, Table, useToast, type TableColumn,
} from '@betinhos/ui'
import { CheckCheck, Download, Inbox, ListChecks, LogOut } from 'lucide-react'
import { useApi } from '../api/ApiContext'
import { brl, dataHora } from '../domain/formato'
import { podeAprovar, statusInfo } from '../domain/regras'
import type { Servico, Sessao } from '../domain/types'
import { exportarExcel } from '../excel/exportar'
import { Detalhe } from './Detalhe'
import { ABAS, contar, daAba, filtrarBase, mesesDisponiveis, type Aba } from './filtros'
import { calcularPrazo, type Prazo } from './prazo'
import './Servicos.css'

const ROTULO_ABA: Record<Aba, string> = { a_validar: 'A validar', em_duvida: 'Em dúvida', aprovados: 'Aprovados', todos: 'Todos' }
const VAZIO: Record<Aba, string> = {
  a_validar: 'Nada para validar por aqui.',
  em_duvida: 'Nenhuma dúvida aberta.',
  aprovados: 'Nenhum serviço aprovado ainda.',
  todos: 'Nenhum serviço liberado.',
}

export function Servicos({ sessao, onSair }: { sessao: Sessao; onSair: () => void }) {
  const api = useApi()
  const toast = useToast()
  const [servicos, setServicos] = useState<Servico[]>([])
  const [carga, setCarga] = useState<'carregando' | 'erro' | 'ok'>('carregando')
  const [aba, setAba] = useState<Aba>('a_validar')
  const [mes, setMes] = useState<string | null>(null)
  const [cr, setCr] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [aberto, setAberto] = useState<string | null>(null)
  const [aprovando, setAprovando] = useState(false)
  const [exportando, setExportando] = useState(false)

  const carregar = useCallback(async () => {
    setCarga('carregando')
    try {
      const lista = await api.listar()
      setServicos(lista)
      setMes((atual) => atual ?? mesesDisponiveis(lista)[0]?.value ?? null)
      setCarga('ok')
    } catch {
      setCarga('erro')
    }
  }, [api])

  useEffect(() => { void carregar() }, [carregar])

  const meses = useMemo(() => mesesDisponiveis(servicos), [servicos])
  const crs = useMemo(() => [...new Set(servicos.map((s) => s.cr))].sort().map((c) => ({ value: c, label: c })), [servicos])
  // Dias úteis restantes mudam com a lista, não com digitação ou seleção: calcula uma vez por carga.
  const prazos = useMemo(() => {
    const agora = new Date().toISOString()
    return new Map<string, Prazo>(servicos.map((s) => [s.id, calcularPrazo(s, agora)]))
  }, [servicos])
  const base = useMemo(() => filtrarBase(servicos, { mes, cr, busca }), [servicos, mes, cr, busca])
  const contagens = useMemo(() => contar(base), [base])
  const linhas = useMemo(() => daAba(base, aba), [base, aba])

  const selecionaveis = linhas.filter(podeAprovar)
  const marcados = selecionaveis.filter((s) => selecionados.has(s.id))
  const todosMarcados = selecionaveis.length > 0 && marcados.length === selecionaveis.length
  const servicoAberto = servicos.find((s) => s.id === aberto)
  const nomeMes = meses.find((m) => m.value === mes)?.label.toLowerCase()

  const atualizar = (novos: Servico[]) => {
    const porId = new Map(novos.map((s) => [s.id, s]))
    setServicos((lista) => lista.map((s) => porId.get(s.id) ?? s))
  }

  function alternar(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual)
      if (!novo.delete(id)) novo.add(id)
      return novo
    })
  }

  const alternarTodos = () => setSelecionados(todosMarcados ? new Set() : new Set(selecionaveis.map((s) => s.id)))

  async function aprovarSelecionados() {
    setAprovando(true)
    try {
      const aprovados = await api.aprovar(marcados.map((s) => s.id))
      atualizar(aprovados)
      setSelecionados(new Set())
      toast({ tone: 'success', message: aprovados.length === 1 ? '1 serviço aprovado.' : `${aprovados.length} serviços aprovados.` })
    } catch {
      toast({ tone: 'danger', message: 'Não foi possível aprovar agora. Nada foi alterado; tente de novo.' })
    } finally {
      setAprovando(false)
    }
  }

  async function exportar() {
    setExportando(true)
    try {
      await exportarExcel(linhas, `servicos-${sessao.cliente.toLowerCase()}-${mes ?? 'todos'}.xlsx`)
    } catch {
      toast({ tone: 'danger', message: 'Não foi possível gerar o Excel. Tente de novo.' })
    } finally {
      setExportando(false)
    }
  }

  const colunas: TableColumn<Servico>[] = [
    {
      key: 'servico',
      header: (
        <span className="pc-col-servico">
          <Checkbox
            ref={(el) => { if (el) el.indeterminate = marcados.length > 0 && !todosMarcados }}
            label={<span className="pc-sr">Selecionar todos os serviços que podem ser aprovados</span>}
            checked={todosMarcados}
            onChange={alternarTodos}
            disabled={selecionaveis.length === 0}
          />
          Serviço
        </span>
      ),
      width: 'minmax(190px, 1.1fr)',
      cell: (s) => (
        <span className="pc-col-servico">
          <Checkbox
            label={<span className="pc-sr">Selecionar {s.numero}</span>}
            checked={selecionados.has(s.id)}
            onChange={() => alternar(s.id)}
            disabled={!podeAprovar(s)}
          />
          <button type="button" className="pc-servico" onClick={() => setAberto(s.id)}>
            <span className="pc-servico__numero">{s.numero}</span>
            <span className="pc-servico__data">{dataHora(s.saida)}</span>
            {/* No card do mobile a coluna Trajeto some e o trajeto aparece aqui. */}
            <span className="pc-servico__trajeto">{s.origem} → {s.destino}</span>
          </button>
        </span>
      ),
    },
    { key: 'trajeto', header: 'Trajeto', width: 'minmax(220px, 1.6fr)', hideBelow: 'mobile', cell: (s) => <span className="pc-trajeto">{s.origem} → {s.destino}</span> },
    { key: 'passageiros', header: 'Passageiros', width: 'minmax(140px, 1fr)', hideBelow: 'compact', cell: (s) => s.passageiros.join(', ') },
    { key: 'cr', header: 'CR', width: 'minmax(120px, .8fr)', hideBelow: 'compact', cell: (s) => s.cr },
    {
      key: 'valor', header: 'Valor', width: '120px', align: 'end',
      cell: (s) => (
        <span className="pc-valor">
          {brl(s.valorTotal)}
          {s.valorAnterior != null && <span className="pc-valor__alterado">valor alterado</span>}
        </span>
      ),
    },
    {
      key: 'status', header: 'Situação', width: 'minmax(200px, 1.2fr)',
      cell: (s) => {
        const info = statusInfo(s.status)
        return (
          <span className="pc-situacao">
            <StatusBadge tone={info.tom} dot>{info.rotulo}</StatusBadge>
            <span className="pc-situacao__prazo">{prazos.get(s.id)?.texto}</span>
          </span>
        )
      },
    },
  ]

  return (
    <div className="pc-pagina">
      <header className="pc-topo">
        <p className="pc-marca">Betinhos Executive Service</p>
        <div className="pc-topo__usuario">
          <span className="pc-topo__nome">{sessao.nome} · {sessao.cliente}</span>
          <Button variant="ghost" size="compact" onClick={onSair} icon={<LogOut size={16} aria-hidden />}>Sair</Button>
        </div>
      </header>

      <main className="pc-conteudo">
        <div>
          <h1 className="pc-titulo">Serviços de {nomeMes ?? 'todos os meses'}</h1>
          <p className="pc-descricao">Confira cada serviço e aprove ou envie uma dúvida. Sem dúvida em 5 dias úteis após a liberação, o serviço é aprovado automaticamente.</p>
        </div>

        <SegmentedControl<Aba>
          className="pc-abas"
          value={aba}
          onChange={(v) => { setAba(v); setSelecionados(new Set()) }}
          options={ABAS.map((a) => ({ value: a, label: `${ROTULO_ABA[a]} · ${contagens[a]}` }))}
          aria-label="Situação dos serviços"
        />

        <PageToolbar
          variant="filters"
          label="Filtros"
          start={<>
            <Select value={mes} onChange={setMes} options={meses} placeholder="Todos os meses" clearable aria-label="Mês" className="pc-filtro" />
            <Select value={cr} onChange={setCr} options={crs} placeholder="Todos os CRs" clearable aria-label="Centro de resultado" className="pc-filtro" />
            <SearchBox value={busca} onChange={setBusca} placeholder="Buscar nº, pedido, passageiro ou trajeto" aria-label="Buscar serviços" className="pc-busca" />
          </>}
          end={<>
            {/* No mobile o cabeçalho da tabela (com o "selecionar todos") some. */}
            <Button variant="secondary" className="pc-todos-mobile" onClick={alternarTodos} disabled={!selecionaveis.length} icon={<ListChecks size={16} aria-hidden />}>
              {todosMarcados ? 'Limpar seleção' : 'Selecionar todos'}
            </Button>
            <Button variant="secondary" onClick={exportar} loading={exportando} disabled={!linhas.length} icon={<Download size={16} aria-hidden />}>Exportar Excel</Button>
          </>}
        />

        {carga === 'erro' ? (
          <Alert tone="danger" action={<Button variant="secondary" size="compact" onClick={() => void carregar()}>Tentar de novo</Button>}>
            Não foi possível carregar os serviços. Verifique a conexão e tente de novo.
          </Alert>
        ) : (
          <Table
            columns={colunas}
            rows={linhas}
            rowKey={(s) => s.id}
            loading={carga === 'carregando'}
            severity={(s) => (prazos.get(s.id)?.curto ? { tone: 'warning', label: 'Aprovação automática em breve' } : null)}
            empty={<EmptyState icon={<Inbox size={36} aria-hidden />} title={VAZIO[aba]}>{busca || cr ? 'Revise a busca ou o CR selecionado.' : 'Quando a Betinhos liberar novos serviços, eles aparecem aqui e você recebe o resumo diário por e-mail.'}</EmptyState>}
            footer={<span className="pc-rodape">Serviços: {linhas.length}</span>}
          />
        )}
      </main>

      {marcados.length > 0 && (
        <div className="pc-lote" role="region" aria-label="Aprovação em lote">
          <span className="pc-lote__resumo">
            <strong>{marcados.length} {marcados.length === 1 ? 'selecionado' : 'selecionados'}</strong> · {brl(marcados.reduce((t, s) => t + s.valorTotal, 0))}
          </span>
          <Button variant="ghost" onClick={() => setSelecionados(new Set())} disabled={aprovando}>Limpar seleção</Button>
          <Button onClick={aprovarSelecionados} loading={aprovando} icon={<CheckCheck size={16} aria-hidden />}>
            Aprovar {marcados.length === 1 ? '1 serviço' : `${marcados.length} serviços`}
          </Button>
        </div>
      )}

      {servicoAberto && (
        <Detalhe
          key={servicoAberto.id}
          servico={servicoAberto}
          prazo={prazos.get(servicoAberto.id)?.texto ?? ''}
          onFechar={() => setAberto(null)}
          onAtualizado={(s) => atualizar([s])}
        />
      )}
    </div>
  )
}
