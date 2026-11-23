import { FASES, type Trilha as TrilhaDados } from '../domain/painel'

/**
 * Trilha de 5 fases (Ideia → Fazendo → DEV → PROD → Prova): fases passadas cheias, a atual destacada com o rótulo curto.
 * `grande` (painel) escreve o nome de cada fase nas células. Leitor de tela recebe a descrição inteira.
 */
export function Trilha({ t, grande = false }: { t: TrilhaDados; grande?: boolean }) {
  return (
    <span className={`pj-trilha${grande ? ' pj-trilha--grande' : ''}`} role="img" aria-label={t.descricao}>
      {FASES.map((nome, i) => {
        const n = i + 1
        const estado = t.fase == null ? '' : n < t.fase ? ' is-feita' : n === t.fase ? ` is-atual pj-tom-${t.tom}` : ''
        const texto = grande ? (n === t.fase && t.rotulo !== nome ? `${nome} · ${t.rotulo}` : nome) : n === t.fase ? t.rotulo : ''
        return <span key={nome} className={`pj-trilha__fase${estado}`} aria-hidden="true">{texto}</span>
      })}
    </span>
  )
}
