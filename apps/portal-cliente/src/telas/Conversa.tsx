import { useRef } from 'react'
import { dataHora } from '../domain/formato'
import { motivoLabel } from '../domain/regras'
import type { Mensagem } from '../domain/types'

/** Conversa do serviço. Só as mensagens que chegam depois de abrir entram com animação. */
export function Conversa({ mensagens }: { mensagens: Mensagem[] }) {
  const iniciais = useRef(new Set(mensagens.map((m) => m.id)))
  if (!mensagens.length) return null
  return (
    <ol className="bt-stack pc-conversa" aria-label="Conversa sobre o serviço">
      {mensagens.map((m) => (
        <li key={m.id} className={`pc-msg pc-msg--${m.lado}${iniciais.current.has(m.id) ? '' : ' pc-msg--nova'}`}>
          <p className="pc-msg__autor">
            {m.lado === 'cliente' ? m.autor : 'Betinhos'}
            <span className="pc-msg__quando">{dataHora(m.criadaEm)}</span>
          </p>
          {m.motivo && <p className="pc-msg__motivo">Motivo: {motivoLabel(m.motivo)}</p>}
          <p className="pc-msg__texto">{m.texto}</p>
        </li>
      ))}
    </ol>
  )
}
