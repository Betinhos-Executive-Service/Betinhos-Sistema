import { useState } from 'react'
import type { Source } from './data/source'
import type { useConciliacao } from './useConciliacao'
import type { Transacao } from './domain/types'
import { CartaoDrawer, type CartaoTarget } from '../../cartoes/components/Cartoes'
import { TransacaoDrawer } from './components/TransacaoDrawer'

type Props = { data: ReturnType<typeof useConciliacao>; source: Source; abertaId: string | null; onClose: () => void; onAbrirDespesa?: (id: string) => void }

/** Drawer da compra (aberto pela fila ou pela ficha da despesa) e o cadastro de cartão que ele pode pedir. */
export function CompraDrawers({ data, source, abertaId, onClose, onAbrirDespesa }: Props) {
  const [cartaoTarget, setCartaoTarget] = useState<CartaoTarget>(null)
  const aberta = abertaId ? data.transacoes.find((t) => t.id === abertaId) ?? null : null
  const cadastrarDe = (t: Transacao) => {
    onClose()
    setCartaoTarget({ mode: 'create', inicial: { conta: t.conta, final: t.final, inicio: t.dataCompra } })
  }
  return (
    <>
      <TransacaoDrawer transacao={aberta} cartoes={data.cartoes} source={source} onClose={onClose} onSaved={data.upsertTransacao} onCadastrarCartao={cadastrarDe} onAbrirDespesa={onAbrirDespesa} />
      <CartaoDrawer target={cartaoTarget} onClose={() => setCartaoTarget(null)} cartoes={data.cartoes} motoristas={data.motoristas} source={source} onSaved={data.upsertCartao} />
    </>
  )
}
