import type { CSSProperties } from 'react'
import { corLegivel } from '../domain/config'

type Props = { nome: string; cor: string; logo: string | null }

/** Prévia da tela de entrada e do topo do portal com a identidade do formulário, antes de salvar. */
export function PrevisaoMarca({ nome, cor, logo }: Props) {
  const legivel = corLegivel(cor.trim())
  const estilo = (legivel ? { '--vc-marca': legivel } : undefined) as CSSProperties | undefined
  const exibido = nome.trim() || 'Nome do cliente'
  return (
    <div className="vc-previa" style={estilo} aria-label="Prévia da identidade no portal">
      <figure className="vc-previa__peca">
        <figcaption>Entrada</figcaption>
        <div className="vc-previa__login">
          <div className="vc-previa__marcas">
            <span className="vc-previa__betinhos">Betinhos</span>
            {logo ? <img className="vc-previa__logo" src={logo} alt={`Logo de ${exibido}`} /> : null}
          </div>
          <strong>Portal do cliente</strong>
          <span className="vc-previa__campo">nome@empresa.com.br</span>
          <span className="vc-previa__botao">Entrar</span>
        </div>
      </figure>
      <figure className="vc-previa__peca">
        <figcaption>Topo depois do login</figcaption>
        <div className="vc-previa__topo">
          <span className="vc-previa__betinhos">Betinhos</span>
          {logo ? <img className="vc-previa__logo vc-previa__logo--topo" src={logo} alt="" /> : null}
          <span className="vc-previa__nome">{exibido}</span>
        </div>
      </figure>
      {cor.trim() && !legivel ? <p className="vc-muted">Cor sem contraste suficiente: a prévia mostra a cor padrão.</p> : null}
    </div>
  )
}
