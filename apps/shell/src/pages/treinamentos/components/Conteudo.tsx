import { memo } from 'react'
import { blocosDoConteudo, trechos } from '../domain/treinamentos'

const Trechos = ({ texto }: { texto: string }) => <>{trechos(texto).map((t, i) => (t.negrito ? <strong key={i}>{t.texto}</strong> : <span key={i}>{t.texto}</span>))}</>

/** Conteúdo do treinamento como o motorista lê: títulos, parágrafos e listas da marcação simples. */
export const Conteudo = memo(function Conteudo({ texto, className }: { texto: string; className?: string }) {
  const blocos = blocosDoConteudo(texto)
  if (!blocos.length) return null
  return (
    <div className={className}>
      {blocos.map((b, i) => {
        if (b.tipo === 'h') return <h4 key={i}><Trechos texto={b.texto} /></h4>
        if (b.tipo === 'ul') return <ul key={i}>{b.itens.map((item, j) => <li key={j}><Trechos texto={item} /></li>)}</ul>
        return <p key={i}><Trechos texto={b.texto} /></p>
      })}
    </div>
  )
})
