import { useCallback, useMemo, useState } from 'react'
import type { AlvoGaveta } from '../../nav/queryState'
import { createSource } from '../../pages/clientes/data/source'
import type { Cliente } from '../../pages/clientes/domain/types'
import { ClienteDrawer } from '../../pages/clientes/components/ClienteDrawer'
import '../../pages/clientes/clientes.css'
import { ComCarga, existente, useCarga, type GavetaProps } from './comum'

export default function GavetaCliente({ host, id, onClose }: GavetaProps) {
  const source = useMemo(() => createSource(host), [host])
  const carga = useCarga(useCallback(async () => existente(await source.get(id), 'Cliente'), [source, id]))
  const [salvo, setSalvo] = useState<Cliente | null>(null)
  const [target, setTarget] = useState<AlvoGaveta>({ mode: 'view', id })
  return (
    <ComCarga carga={carga} rotulo="Cliente" onClose={onClose}>
      {(c) => <ClienteDrawer target={target} onTarget={(t) => (t ? setTarget(t) : onClose())} list={[salvo ?? c]} source={source} onSaved={setSalvo} />}
    </ComCarga>
  )
}
