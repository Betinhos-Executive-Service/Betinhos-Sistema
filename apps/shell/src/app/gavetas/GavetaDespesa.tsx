import { useCallback, useMemo, useState } from 'react'
import { useToast } from '@betinhos/ui'
import { createSource } from '../../pages/despesas/data/source'
import { MENSAGEM_DECISAO, aplicarDecisao, type Decisao } from '../../pages/despesas/domain/decisao'
import type { Despesa } from '../../pages/despesas/domain/types'
import { DespesaDrawer } from '../../pages/despesas/components/DespesaDrawer'
import '../../pages/pagantes/pagantes.css'
import '../../pages/despesas/despesas.css'
import { ComCarga, existente, mensagem, useCarga, type GavetaProps } from './comum'

/** Ficha da despesa por cima de outra lista; a compra do cartão vinculada só aparece na tela Despesas (fila da conciliação). */
export default function GavetaDespesa({ host, id, onClose }: GavetaProps) {
  const source = useMemo(() => createSource(host), [host])
  const toast = useToast()
  const carga = useCarga(useCallback(async () => {
    const [despesa, choices] = await Promise.all([source.get(id), source.choices()])
    return { despesa: existente(despesa, 'Despesa'), choices }
  }, [source, id]))
  const [decidida, setDecidida] = useState<Despesa | null>(null)

  const decidir = useCallback(async (d: Despesa, tipo: Decisao, motivo: string) => {
    try {
      await source.decidir(d.id, tipo, motivo)
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível gravar a decisão. ${mensagem(reason)}${tipo === 'validar' ? '' : ' O motivo digitado foi mantido.'}` })
      return false
    }
    setDecidida(aplicarDecisao(d, tipo, motivo))
    toast({ tone: 'success', message: MENSAGEM_DECISAO[tipo] })
    return true
  }, [source, toast])

  return (
    <ComCarga carga={carga} rotulo="Despesa" onClose={onClose}>
      {({ despesa, choices }) => <DespesaDrawer despesa={decidida ?? despesa} onClose={onClose} choices={choices} source={source} version={0} onDecidir={decidir} />}
    </ComCarga>
  )
}
