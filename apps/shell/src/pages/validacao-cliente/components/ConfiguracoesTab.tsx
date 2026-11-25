import { useEffect, useMemo, useState } from 'react'
import { EmptyState, SearchBox, StatusBadge } from '@betinhos/ui'
import { Settings2 } from 'lucide-react'
import type { Source } from '../data/source'
import { MODULO_LABEL, quemEntra } from '../domain/config'
import type { Cliente, PortalConfig, Validador } from '../domain/types'
import { ConfigDrawer } from './ConfigDrawer'

type Props = {
  configs: PortalConfig[]; validadores: Validador[]; source: Source; mobile: boolean
  onSaved: (c: PortalConfig) => void; onValidadorSaved: (v: Validador) => void
}
type Filtro = 'todos' | 'liberados' | 'nao'

const FILTROS: { value: Filtro; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'liberados', label: 'Liberados' },
  { value: 'nao', label: 'Não liberados' },
]
const porNome = (a: PortalConfig, b: PortalConfig) => a.cliente.nome.localeCompare(b.cliente.nome, 'pt-BR')
const normaliza = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Aba Configurações: todos os clientes ativos; liberar o portal, módulos, e-mails e domínios de cada um. */
export function ConfiguracoesTab({ configs, validadores, source, mobile, onSaved, onValidadorSaved }: Props) {
  const [alvo, setAlvo] = useState<Cliente | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [editarIdentidade, setEditarIdentidade] = useState(false)
  useEffect(() => {
    let vivo = true
    source.podeEditarIdentidade().then((ok) => { if (vivo) setEditarIdentidade(ok) }).catch(() => { if (vivo) setEditarIdentidade(false) })
    return () => { vivo = false }
  }, [source])
  const configAlvo = alvo ? configs.find((c) => c.cliente.id === alvo.id) ?? null : null
  const usuarios = (id: string) => validadores.filter((v) => v.ativo && v.cliente.id === id).length

  const contas: Record<Filtro, number> = { todos: configs.length, liberados: configs.filter((c) => c.ligado).length, nao: configs.filter((c) => !c.ligado).length }
  const lista = useMemo(() => {
    const q = normaliza(busca.trim())
    return configs
      .filter((c) => (filtro === 'todos' || (filtro === 'liberados') === c.ligado) && (!q || normaliza(c.cliente.nome).includes(q)))
      .sort((a, b) => Number(b.ligado) - Number(a.ligado) || porNome(a, b))
  }, [configs, busca, filtro])

  return (
    <div className="vc-config">
      <p className="vc-muted">Cada cliente libera o portal, escolhe os módulos, os e-mails e os domínios que entram.</p>
      <div className="vc-config__topo">
        <SearchBox value={busca} onChange={setBusca} placeholder="Buscar cliente" aria-label="Buscar cliente" />
        <div className="vc-chips" role="group" aria-label="Filtro de clientes">
          {FILTROS.map((f) => (
            <button key={f.value} type="button" className="vc-chip" aria-pressed={filtro === f.value} onClick={() => setFiltro(f.value)}>
              {f.label} <span className="vc-num">· {contas[f.value]}</span>
            </button>
          ))}
        </div>
      </div>
      {lista.length ? (
        <ul className="vc-cfg-lista" aria-label="Clientes">
          {lista.map((c) => (
            <li key={c.cliente.id}>
              <button type="button" className="vc-cfg" onClick={() => setAlvo(c.cliente)}>
                <span className="vc-cfg__nome">{c.cliente.nome}</span>
                <span><StatusBadge tone={c.ligado ? 'success' : 'neutral'}>{c.ligado ? 'Liberado' : 'Não liberado'}</StatusBadge></span>
                <span className="vc-cfg__dado"><small>Módulos</small>{c.modulos.length ? c.modulos.map((m) => MODULO_LABEL[m]).join(', ') : 'Nenhum'}</span>
                <span className="vc-cfg__dado"><small>Quem entra</small>{quemEntra(c.dominios)}</span>
                <span className="vc-cfg__dado"><small>Usuários ativos</small><span className="vc-num">{usuarios(c.cliente.id)}</span></span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState className="surface" align="start" icon={<Settings2 size={36} />} title={configs.length ? 'Nenhum cliente nesta busca.' : 'Nenhum cliente ativo no cadastro.'}>
          {configs.length ? 'Limpe a busca ou troque o filtro.' : 'Cadastre o cliente para liberar o portal dele.'}
        </EmptyState>
      )}
      <ConfigDrawer cliente={alvo} config={configAlvo} outros={configs} validadores={validadores} source={source} mobile={mobile} editarIdentidade={editarIdentidade} onClose={() => setAlvo(null)} onSaved={onSaved} onValidadorSaved={onValidadorSaved} />
    </div>
  )
}
