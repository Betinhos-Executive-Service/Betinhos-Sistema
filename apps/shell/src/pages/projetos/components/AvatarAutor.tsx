import { autorLabel } from '../domain/choices'
import { siglaAutor } from '../domain/painel'

/** Avatar do autor: R (Renan), G (Gestor), IA (Agente). */
export function AvatarAutor({ autor }: { autor: number }) {
  const sigla = siglaAutor(autor)
  return <span className={`pj-av pj-av--${sigla.toLowerCase()}`} title={autorLabel(autor)} aria-hidden="true">{sigla}</span>
}
