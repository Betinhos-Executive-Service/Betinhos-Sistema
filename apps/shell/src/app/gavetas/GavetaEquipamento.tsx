import { useCallback, useMemo, useState } from 'react'
import { createSource } from '../../pages/equipamentos/data/source'
import type { Equipamento } from '../../pages/equipamentos/domain/types'
import { EquipamentoDrawer, type DrawerTarget } from '../../pages/equipamentos/components/EquipamentoDrawer'
import '../../pages/equipamentos/equipamentos.css'
import { ComCarga, existente, useCarga, type GavetaProps } from './comum'

export default function GavetaEquipamento({ host, id, onClose }: GavetaProps) {
  const source = useMemo(() => createSource(host), [host])
  // A fonte carrega equipamentos, tipos e responsáveis numa ida só (tabelas pequenas): a gaveta usa a mesma carga.
  const carga = useCarga(useCallback(async () => {
    const dados = await source.load()
    return { ...dados, equipamento: existente(dados.equipamentos.find((e) => e.id === id) ?? null, 'Equipamento') }
  }, [source, id]))
  const [salvo, setSalvo] = useState<Equipamento | null>(null)
  const [target, setTarget] = useState<DrawerTarget>({ mode: 'view', id })
  return (
    <ComCarga carga={carga} rotulo="Equipamento" onClose={onClose}>
      {({ equipamento, tipos, pessoas }) => {
        const atual = salvo ?? equipamento
        return <EquipamentoDrawer target={target} onTarget={(t) => (t ? setTarget(t) : onClose())} list={[atual]} tipos={tipos} pessoas={pessoas} source={source} onSaved={setSalvo} onCapa={(_, capa) => setSalvo({ ...atual, capa })} />
      }}
    </ComCarga>
  )
}
