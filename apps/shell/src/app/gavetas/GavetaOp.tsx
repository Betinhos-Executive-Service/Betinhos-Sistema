import { useCallback, useMemo, useState } from 'react'
import { useToast } from '@betinhos/ui'
import { hrefFor } from '../../nav/useHashRoute'
import { createSource } from '../../pages/ops/data/source'
import { OP_STATUS } from '../../pages/ops/domain/status'
import type { Op } from '../../pages/ops/domain/types'
import { OpDrawer } from '../../pages/ops/components/OpDrawer'
import { CancelDialog } from '../../pages/ops/components/CancelDialog'
import '../../pages/pagantes/pagantes.css'
import '../../pages/pendencias/pendencias.css'
import '../../pages/ops/ops.css'
import { ComCarga, existente, mensagem, useCarga, type GavetaProps } from './comum'

export default function GavetaOp({ host, id, onClose }: GavetaProps) {
  const source = useMemo(() => createSource(host), [host])
  const toast = useToast()
  const carga = useCarga(useCallback(async () => {
    const [op, choices] = await Promise.all([source.get(id), source.choices()])
    return { op: existente(op, 'OP'), choices }
  }, [source, id]))
  const [alterada, setAlterada] = useState<Op | null>(null)
  const [version, setVersion] = useState(0)
  const [cancelar, setCancelar] = useState<Op | null>(null)
  const [busy, setBusy] = useState(false)

  async function confirmarCancelamento(op: Op) {
    if (busy) return
    setCancelar(null)
    setBusy(true)
    try {
      await source.cancel(op.id)
      setAlterada({ ...op, status: OP_STATUS.cancelada, alteradoEm: new Date() })
      setVersion((v) => v + 1)
      toast({ tone: 'success', message: `${op.codigo || 'OP'} cancelada.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível cancelar a ${op.codigo || 'OP'}. Nada foi alterado. ${mensagem(reason)}` })
    } finally {
      setBusy(false)
    }
  }

  // O Gerar Pagantes abre por cima da tela de OPs (`gerar=<id>`), como no botão da própria tela.
  function gerarPagantes(op: Op) {
    if (!source.pagantes.gerarPagantesUrl(op.id)) { toast({ tone: 'info', message: 'O Gerar Pagantes só abre dentro do Dataverse.' }); return }
    onClose()
    location.hash = hrefFor('ops', { gerar: op.id })
  }

  return (
    <ComCarga carga={carga} rotulo="OP" onClose={onClose}>
      {({ op, choices }) => (
        <>
          <OpDrawer op={alterada ?? op} onClose={onClose} choices={choices} source={source} version={version} busy={busy} onCancel={setCancelar} onGerarPagantes={gerarPagantes} />
          <CancelDialog op={cancelar} onClose={() => setCancelar(null)} onConfirm={(o) => void confirmarCancelamento(o)} />
        </>
      )}
    </ComCarga>
  )
}
