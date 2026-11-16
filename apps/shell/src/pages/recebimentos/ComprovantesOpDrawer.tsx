import { useEffect, useState } from 'react'
import { Alert, Button, Drawer, Sheet } from '@betinhos/ui'
import { BrandLoader } from '../../app/BrandLoader'
import type { ServicoOp } from '../pagantes/domain/types'
import '../pagantes/pagantes.css'
import './recebimentos.css'
import { ListaRecebimentos, resumoRecebimentos, useRecebimentos } from './ComprovantesRecebimento'
import type { RecebimentosSource } from './source'

export type OpAberta = { id: string; nome: string }

type Servicos = { lista: ServicoOp[] } | { erro: string } | null

/** Comprovantes da OP inteira, agrupados por serviço (só leitura): a lista de serviços vem antes, para o carregamento dos comprovantes já nascer com os ids. */
function Conteudo({ op, source, servicos }: { op: OpAberta; source: RecebimentosSource; servicos: (opId: string) => Promise<ServicoOp[]> }) {
  const [estado, setEstado] = useState<Servicos>(null)
  const [tentativa, setTentativa] = useState(0)
  useEffect(() => {
    let vivo = true
    setEstado(null)
    servicos(op.id).then(
      (lista) => { if (vivo) setEstado({ lista }) },
      (erro) => { if (vivo) setEstado({ erro: erro instanceof Error ? erro.message : String(erro) }) },
    )
    return () => { vivo = false }
  }, [servicos, op.id, tentativa])
  if (estado == null) return <BrandLoader variant="inline" size="sm" label="Carregando serviços" text="Carregando…" />
  if ('erro' in estado) {
    return <Alert tone="danger" title="Não foi possível carregar os serviços da OP">{estado.erro} <Button variant="ghost" size="compact" onClick={() => setTentativa((n) => n + 1)}>Tentar de novo</Button></Alert>
  }
  return <Comprovantes source={source} servicos={estado.lista} />
}

function Comprovantes({ source, servicos }: { source: RecebimentosSource; servicos: ServicoOp[] }) {
  const recebimentos = useRecebimentos(source, servicos.map((s) => s.id))
  return (
    <section className="pg-ficha__block" aria-label="Comprovantes de recebimento">
      <header className="pg-ficha__block-head">
        <h3>Comprovantes de recebimento</h3>
        <span className="pg-muted">{resumoRecebimentos(recebimentos.estado)}</span>
      </header>
      <ListaRecebimentos {...recebimentos} source={source} servicos={servicos} />
    </section>
  )
}

/** Drawer aberto pelo indicador da coluna Comprovantes das listas de OPs e Pagantes. */
export function ComprovantesOpDrawer({ op, source, servicos, mobile, onClose }: { op: OpAberta | null; source: RecebimentosSource; servicos: (opId: string) => Promise<ServicoOp[]>; mobile: boolean; onClose: () => void }) {
  const Painel = mobile ? Sheet : Drawer
  return (
    <Painel open={op != null} onClose={onClose} eyebrow="Recebimento" title={op?.nome ?? ''}>
      {op ? <div className="pg-ficha"><Conteudo key={op.id} op={op} source={source} servicos={servicos} /></div> : null}
    </Painel>
  )
}
