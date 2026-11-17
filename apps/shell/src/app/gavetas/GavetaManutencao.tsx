import { useMemo } from 'react'
import { Alert, Drawer } from '@betinhos/ui'
import { GavetaManutencao } from '../../pages/frota/components/GavetaManutencao'
import { createFrotaSource } from '../../pages/frota/data/hostSource'
import '../../pages/frota/frota.css'
import { abrirGavetaRegistro } from '../registroAberto'
import { mensagem, type GavetaProps } from './comum'

/**
 * Gaveta única da manutenção (a mesma da Frota) por cima de outra lista. É a que a linha de manutenção da Geral abre
 * no plano 3 e a que o link do lookup `cr40f_om` abre em qualquer lista. A fonte é a da Frota no mesmo `host`, então
 * gravar aqui também vence o cache da tela Frota. O hospedeiro (`GavetaRegistro`) já traz o `ToastProvider` que a
 * gaveta usa para os avisos; o `hoje` é o da própria gaveta (hoje em São Paulo).
 */
export default function GavetaManutencaoAdaptador({ host, id, onClose }: GavetaProps) {
  const fonte = useMemo(() => {
    try { return { source: createFrotaSource(host), erro: null } } catch (reason) { return { source: null, erro: mensagem(reason) } }
  }, [host])
  if (!fonte.source) {
    return (
      <Drawer open eyebrow="Manutenção" title="Não foi possível abrir" onClose={onClose}>
        <Alert tone="danger" title="Não foi possível abrir a manutenção">{fonte.erro}</Alert>
      </Drawer>
    )
  }
  return <GavetaManutencao source={fonte.source} id={id} onClose={onClose} onChanged={() => undefined} onOpenVeiculo={(veiculoId) => abrirGavetaRegistro('cr40f_veiculos', veiculoId)} />
}
