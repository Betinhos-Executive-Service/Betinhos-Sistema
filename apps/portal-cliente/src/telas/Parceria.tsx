import logoBetinhos from '../assets/logo-betinhos.webp'
import type { Marca } from '../domain/marca'

/** Logo da Betinhos, com o do cliente ao lado quando há logo cadastrado (entra com uma animação suave). */
export function Parceria({ parceira, tamanho }: { parceira: Marca | null; tamanho: 'topo' | 'entrar' }) {
  return (
    <div className={`pc-parceria pc-parceria--${tamanho}`}>
      <img className="pc-parceria__betinhos" src={logoBetinhos} alt="Betinhos Executive Service" />
      {parceira ? (
        <>
          <span className="pc-parceria__divisor" aria-hidden />
          <img key={parceira.logoUrl} className="pc-parceria__cliente" src={parceira.logoUrl} alt={parceira.nome} />
        </>
      ) : null}
    </div>
  )
}
