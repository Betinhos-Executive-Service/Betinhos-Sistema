import logoBetinhos from '../assets/logo-betinhos.webp'
import type { Marca } from '../domain/marcas'

/** Logo da Betinhos, com o do cliente ao lado quando há parceria. */
export function Parceria({ parceira, tamanho }: { parceira: Marca | null; tamanho: 'topo' | 'entrar' }) {
  return (
    <div className={`pc-parceria pc-parceria--${tamanho}`}>
      <img className="pc-parceria__betinhos" src={logoBetinhos} alt="Betinhos Executive Service" />
      {parceira && (
        <>
          <span className="pc-parceria__x" aria-hidden>×</span>
          <img className="pc-parceria__cliente" src={parceira.logo} alt={parceira.nome} />
        </>
      )}
    </div>
  )
}
