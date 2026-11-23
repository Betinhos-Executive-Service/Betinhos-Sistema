import { FASES, type Trilha as TrilhaDados } from '../domain/painel'

/** Trilha de 5 fases (Ideia → Fazendo → DEV → PROD → Prova): fases passadas cheias, a atual destacada. Leitor de tela recebe a descrição inteira. */
export function Trilha({ t }: { t: TrilhaDados }) {
  return (
    <span className="pj-trilha" role="img" aria-label={t.descricao}>
      {FASES.map((nome, i) => {
        const n = i + 1
        const estado = t.fase == null ? '' : n < t.fase ? ' is-feita' : n === t.fase ? ` is-atual pj-tom-${t.tom}` : ''
        return <span key={nome} className={`pj-trilha__fase${estado}`} aria-hidden="true">{nome}</span>
      })}
    </span>
  )
}
