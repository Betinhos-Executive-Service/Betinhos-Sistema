import { useMemo } from 'react'
import { createDocsSource } from '../../pages/documentos/data/source'
import { FichaVeiculoCentral } from '../../pages/documentos/components/FichaCentral'
import type { GavetaProps } from './comum'

/** Ficha do veículo por cima da lista (a mesma da Frota e da central de documentos), inclusive de veículo inativo. */
export default function GavetaVeiculo({ host, id, onClose }: GavetaProps) {
  const docs = useMemo(() => { try { return createDocsSource(host) } catch { return null } }, [host])
  return <FichaVeiculoCentral host={host} docs={docs} id={id} onClose={onClose} onChanged={() => undefined} />
}
