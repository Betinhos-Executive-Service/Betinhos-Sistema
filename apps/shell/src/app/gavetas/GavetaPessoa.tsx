import { useCallback, useMemo, useState } from 'react'
import { createSource } from '../../pages/pessoas/data/source'
import type { Pessoa } from '../../pages/pessoas/domain/types'
import { PessoaDrawer, type DrawerTarget } from '../../pages/pessoas/components/PessoaDrawer'
import '../../pages/pessoas/pessoas.css'
import { ComCarga, existente, useCarga, type GavetaProps } from './comum'

// Sem a lista inteira não há como achar parecidos: a gaveta abre sem o aviso de duplicados.
const SEM_DUPLICADOS = new Map()

export default function GavetaPessoa({ host, id, onClose }: GavetaProps) {
  const source = useMemo(() => createSource(host), [host])
  const carga = useCarga(useCallback(async () => {
    const [pessoa, choices] = await Promise.all([source.get(id), source.choices()])
    return { pessoa: existente(pessoa, 'Pessoa'), choices }
  }, [source, id]))
  const [salva, setSalva] = useState<Pessoa | null>(null)
  const [target, setTarget] = useState<DrawerTarget>({ mode: 'view', id })
  return (
    <ComCarga carga={carga} rotulo="Pessoa" onClose={onClose}>
      {({ pessoa, choices }) => <PessoaDrawer target={target} onTarget={(t) => (t ? setTarget(t) : onClose())} list={[salva ?? pessoa]} dups={SEM_DUPLICADOS} choices={choices} source={source} onSaved={setSalva} />}
    </ComCarga>
  )
}
