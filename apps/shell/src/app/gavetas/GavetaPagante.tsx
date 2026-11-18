import { useCallback, useMemo, useState } from 'react'
import { useToast } from '@betinhos/ui'
import { hrefFor } from '../../nav/useHashRoute'
import { createSource } from '../../pages/pagantes/data/source'
import { applyPatch, canGerarRecibo, statusPatch } from '../../pages/pagantes/domain/status'
import type { Pagante } from '../../pages/pagantes/domain/types'
import { PaganteDrawer } from '../../pages/pagantes/components/PaganteDrawer'
import { StatusDialog, type StatusRequest } from '../../pages/pagantes/components/Dialogs'
import '../../pages/pagantes/pagantes.css'
import { ComCarga, existente, mensagem, useCarga, type GavetaProps } from './comum'

export default function GavetaPagante({ host, id, onClose }: GavetaProps) {
  const source = useMemo(() => createSource(host), [host])
  const toast = useToast()
  const carga = useCarga(useCallback(async () => {
    const [pagante, choices] = await Promise.all([source.get(id), source.choices()])
    const p = existente(pagante, 'Pagante')
    // Contato é acessório (WhatsApp e e-mail do recibo): se falhar, a ficha abre sem ele, como na tela.
    const contatos = await source.contatos([p.pessoaId]).catch(() => new Map())
    return { p, choices, contatos }
  }, [source, id]))
  // A ficha troca de pagante pelo rateio da OP; a cópia aberta guarda também o que foi gravado aqui.
  const [aberto, setAberto] = useState<Pagante | null>(null)
  const [statusRequest, setStatusRequest] = useState<StatusRequest>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  async function confirmarStatus(enviarRecibo: boolean) {
    const request = statusRequest
    if (!request || busyId) return
    setStatusRequest(null)
    const { p, kind } = request
    const nome = p.pessoa || p.codigo
    const payload = statusPatch(kind, p, enviarRecibo)
    setBusyId(p.id)
    try {
      await source.update(p.id, payload)
      setAberto({ ...p, ...applyPatch(payload) })
      setVersion((v) => v + 1)
      const recibo = payload.cr40f_statusdorecibo != null ? ' O recibo entra na fila de envio.' : ''
      toast({ tone: 'success', message: kind === 'pago' ? `${nome} marcado como pago.${recibo}` : `Pagante ${p.codigo} cancelado.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível atualizar ${nome}. Nada foi alterado. ${mensagem(reason)}` })
    } finally {
      setBusyId(null)
    }
  }

  // A ficha é modal (top layer): o gerador de recibo abriria atrás dela, então ela fecha antes, como na tela.
  function gerarRecibo(p: Pagante) {
    if (busyId || !canGerarRecibo(p)) return
    onClose()
    source.gerarRecibo([p.id], () => undefined).catch((reason: unknown) => toast({ tone: 'danger', message: mensagem(reason) }))
  }

  // O Gerar Pagantes da OP abre por cima da tela de Pagantes (`gerar=<id da OP>`), como no botão da própria tela.
  function abrirOp(p: Pagante) {
    if (!source.gerarPagantesUrl(p.opId)) { toast({ tone: 'info', message: 'O Gerar Pagantes só abre dentro do Dataverse.' }); return }
    onClose()
    location.hash = hrefFor('pagantes', { gerar: p.opId })
  }

  return (
    <ComCarga carga={carga} rotulo="Pagante" onClose={onClose}>
      {({ p, choices, contatos }) => (
        <>
          <PaganteDrawer p={aberto ?? p} onClose={onClose} onOpen={setAberto} choices={choices} contatos={contatos} source={source} version={version}
            onStatus={(alvo, kind) => setStatusRequest({ p: alvo, kind })} onRecibo={gerarRecibo} onAbrirOp={abrirOp} busyId={busyId} />
          <StatusDialog request={statusRequest} contato={statusRequest ? contatos.get(statusRequest.p.pessoaId) : undefined} onClose={() => setStatusRequest(null)} onConfirm={(enviar) => void confirmarStatus(enviar)} />
        </>
      )}
    </ComCarga>
  )
}
