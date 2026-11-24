import { useEffect, useState } from 'react'
import { Alert, Button, Dialog, EmptyState, SearchBox, StatusBadge } from '@betinhos/ui'
import { Plus, Settings2 } from 'lucide-react'
import type { Source } from '../data/source'
import { MODULO_LABEL, quemEntra } from '../domain/config'
import type { Cliente, PortalConfig, Validador } from '../domain/types'
import { ConfigDrawer } from './ConfigDrawer'

type Props = { configs: PortalConfig[]; validadores: Validador[]; source: Source; mobile: boolean; onSaved: (c: PortalConfig) => void }

/** Aba Configurações: portal ligado, módulos e quem entra, por cliente. */
export function ConfiguracoesTab({ configs, validadores, source, mobile, onSaved }: Props) {
  const [alvo, setAlvo] = useState<Cliente | null>(null)
  const [buscando, setBuscando] = useState(false)
  const lista = [...configs].sort((a, b) => a.cliente.nome.localeCompare(b.cliente.nome, 'pt-BR'))
  const configAlvo = alvo ? configs.find((c) => c.cliente.id === alvo.id) ?? null : null
  const usuarios = (id: string) => validadores.filter((v) => v.ativo && v.cliente.id === id).length

  return (
    <div className="vc-config">
      <div className="vc-config__topo">
        <p className="vc-muted">Cada cliente liga o portal, escolhe os módulos e define quem entra.</p>
        <Button icon={<Plus size={16} />} onClick={() => setBuscando(true)}>Cliente</Button>
      </div>
      {lista.length ? (
        <ul className="vc-cfg-lista" aria-label="Clientes com portal">
          {lista.map((c) => (
            <li key={c.cliente.id}>
              <button type="button" className="vc-cfg" onClick={() => setAlvo(c.cliente)}>
                <span className="vc-cfg__nome">{c.cliente.nome}</span>
                <span><StatusBadge tone={c.ligado ? 'success' : 'neutral'}>{c.ligado ? 'Ligado' : 'Desligado'}</StatusBadge></span>
                <span className="vc-cfg__dado"><small>Módulos</small>{c.modulos.length ? c.modulos.map((m) => MODULO_LABEL[m]).join(', ') : 'Nenhum'}</span>
                <span className="vc-cfg__dado"><small>Quem entra</small>{quemEntra(c.dominios)}</span>
                <span className="vc-cfg__dado"><small>Usuários ativos</small><span className="vc-num">{usuarios(c.cliente.id)}</span></span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState className="surface" align="start" icon={<Settings2 size={36} />} title="Nenhum cliente com portal configurado.">Use "+ Cliente" para ligar o portal de um cliente.</EmptyState>
      )}
      <BuscarCliente open={buscando} source={source} onClose={() => setBuscando(false)} onEscolher={(c) => { setBuscando(false); setAlvo(c) }} />
      <ConfigDrawer cliente={alvo} config={configAlvo} outros={configs} source={source} mobile={mobile} onClose={() => setAlvo(null)} onSaved={onSaved} />
    </div>
  )
}

function BuscarCliente({ open, source, onClose, onEscolher }: { open: boolean; source: Source; onClose: () => void; onEscolher: (c: Cliente) => void }) {
  const [texto, setTexto] = useState('')
  const [achados, setAchados] = useState<Cliente[] | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { if (!open) setTexto('') }, [open])

  useEffect(() => {
    const q = texto.trim()
    if (!open || q.length < 2) { setAchados(null); setErro(null); setCarregando(false); return }
    let live = true
    setCarregando(true)
    const timer = setTimeout(() => {
      source.buscarClientes(q)
        .then((r) => { if (live) { setAchados(r); setErro(null) } })
        .catch((reason) => { if (live) { setAchados(null); setErro(reason instanceof Error ? reason.message : String(reason)) } })
        .finally(() => { if (live) setCarregando(false) })
    }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [texto, open, source])

  return (
    <Dialog open={open} onClose={onClose} title="Adicionar cliente" actions={<Button variant="secondary" onClick={onClose}>Fechar</Button>}>
      <div className="vc-export">
        <SearchBox value={texto} onChange={setTexto} loading={carregando} placeholder="Nome do cliente (ao menos 2 letras)" aria-label="Buscar cliente no cadastro" autoFocus />
        {erro ? <Alert tone="danger" title="Não foi possível buscar">{erro}</Alert> : null}
        {achados && !achados.length ? <p className="vc-muted">Nenhum cliente com esse nome no cadastro.</p> : null}
        {achados?.length ? (
          <ul className="vc-cfg-busca">
            {achados.map((c) => <li key={c.id}><button type="button" className="vc-cfg-busca__item" onClick={() => onEscolher(c)}>{c.nome}</button></li>)}
          </ul>
        ) : null}
      </div>
    </Dialog>
  )
}
