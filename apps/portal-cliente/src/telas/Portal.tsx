import { useState } from 'react'
import type { Modulo, Pedido, Sessao } from '../domain/types'
import { MeusServicos } from './MeusServicos'
import { Pedir } from './Pedir'
import { Servicos } from './Servicos'
import { Topo } from './Topo'

/**
 * Depois do login: cabeçalho fixo e os módulos do cliente (Tenaris só valida; Latasa pede e acompanha).
 * Os módulos ficam montados e só o ativo aparece: trocar de aba no meio do pedido não perde o que foi digitado.
 * Depois de um pedido enviado, `versao` remonta Pedir (formulário limpo) e Meus serviços (lista recarregada).
 */
export function Portal({ sessao, onSair }: { sessao: Sessao; onSair: () => void }) {
  const { modulos } = sessao
  const [ativo, setAtivo] = useState<Modulo>(modulos[0])
  const [versao, setVersao] = useState(0)
  const [modelo, setModelo] = useState<Pedido | null>(null)
  const [repeticoes, setRepeticoes] = useState(0)
  const tem = (m: Modulo) => modulos.includes(m)
  const pedido = () => {
    setVersao((v) => v + 1)
    setModelo(null)
    if (tem('meus_servicos')) setAtivo('meus_servicos')
  }
  const repetir = (p: Pedido) => {
    setModelo(p)
    setRepeticoes((n) => n + 1)
    setAtivo('pedir')
  }
  return (
    <div className="pc-pagina">
      <Topo sessao={sessao} onSair={onSair} ativo={ativo} onModulo={setAtivo} />
      {tem('validar') && <div hidden={ativo !== 'validar'}><Servicos sessao={sessao} /></div>}
      {tem('pedir') && <div key={`pedir-${versao}-${repeticoes}`} hidden={ativo !== 'pedir'}><Pedir onPedido={pedido} modelo={modelo} onRepetirAnterior={tem('meus_servicos') ? () => setAtivo('meus_servicos') : undefined} /></div>}
      {tem('meus_servicos') && <div key={`meus-${versao}`} hidden={ativo !== 'meus_servicos'}><MeusServicos onPedir={tem('pedir') ? () => setAtivo('pedir') : undefined} onRepetir={tem('pedir') ? repetir : undefined} /></div>}
    </div>
  )
}
