import { GavetaManutencao } from '../../pages/frota/components/GavetaManutencao'
import '../../pages/frota/frota.css'
import { abrirGavetaRegistro, avisarRegistroAlterado } from '../registroAberto'
import { ComFonteFrota, type GavetaProps } from './comum'

/**
 * Gaveta única da manutenção (a mesma da Frota) por cima de outra lista. É a que a linha de manutenção da Geral abre
 * (plano 3) e a que o link do lookup `cr40f_om` abre em qualquer lista. A fonte é a da Frota no mesmo `host`, então
 * gravar aqui também vence o cache da tela Frota; cada ação avisa a lista de trás (`REGISTRO_ALTERADO`), que relê.
 * A própria tela Frota não passa por aqui (abre a gaveta com o `onChanged` dela), então não recarrega duas vezes.
 * O hospedeiro (`GavetaRegistro`) já traz o `ToastProvider` que a gaveta usa para os avisos; o `hoje` é o da própria
 * gaveta (hoje em São Paulo).
 */
export default function GavetaManutencaoAdaptador({ host, id, onClose }: GavetaProps) {
  return (
    <ComFonteFrota host={host} rotulo="Manutenção" onClose={onClose}>
      {(source) => <GavetaManutencao source={source} id={id} onClose={onClose} onChanged={() => avisarRegistroAlterado('cr40f_manutencoes', id)} onOpenVeiculo={(veiculoId) => abrirGavetaRegistro('cr40f_veiculos', veiculoId)} />}
    </ComFonteFrota>
  )
}
