import { useMemo } from 'react'
import { RegistroDrawer } from '../../pages/frota/components/RegistroDrawer'
import type { DataSource } from '../../pages/frota/data/source'
import '../../pages/frota/frota.css'
import { useFrotaCarga } from '../../pages/frota/useFrotaCarga'
import { abrirGavetaRegistro, avisarRegistroAlterado } from '../registroAberto'
import { ComCarga, ComFonteFrota, existente, mensagem, type GavetaProps } from './comum'

/**
 * Multa (a mesma gaveta da Frota) por cima de outra lista. Lê as tabelas da Frota pela carga em cache da própria Frota
 * (de onde a gaveta tira infração, veículo e passo a passo); cada ação relê a carga da própria gaveta (o passo a passo depende dela) e avisa a lista de trás (`REGISTRO_ALTERADO`).
 */
export default function GavetaMulta({ host, id, onClose }: GavetaProps) {
  return (
    <ComFonteFrota host={host} rotulo="Multa" onClose={onClose}>
      {(source) => <GavetaMultaCarregada source={source} id={id} onClose={onClose} />}
    </ComFonteFrota>
  )
}

function GavetaMultaCarregada({ source, id, onClose }: { source: DataSource; id: string; onClose: () => void }) {
  const { result, fatal, reload } = useFrotaCarga(source)
  const estado = useMemo(() => {
    if (!result) return fatal ? { ok: false as const, erro: fatal } : null
    try {
      if (result.errors.multas) throw new Error(result.errors.multas)
      existente(result.data.multas.find((multa) => multa.id === id) ?? null, 'Multa')
      return { ok: true as const, dados: result.data }
    } catch (reason) {
      return { ok: false as const, erro: mensagem(reason) }
    }
  }, [result, fatal, id])
  return (
    <ComCarga carga={{ estado, tentarDeNovo: () => void reload() }} rotulo="Multa" onClose={onClose}>
      {(data) => (
        <RegistroDrawer
          source={source}
          kind="multa"
          id={id}
          data={data}
          onClose={onClose}
          onChanged={() => { void reload(); avisarRegistroAlterado('cr40f_multas', id) }}
          onOpenVeiculo={(veiculoId) => abrirGavetaRegistro('cr40f_veiculos', veiculoId)}
        />
      )}
    </ComCarga>
  )
}
