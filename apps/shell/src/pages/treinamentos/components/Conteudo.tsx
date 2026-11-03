import { memo } from 'react'
import { blocosDoConteudo, trechos } from '../domain/treinamentos'

const Trechos = ({ texto }: { texto: string }) => <>{trechos(texto).map((t, i) => (t.negrito ? <strong key={i}>{t.texto}</strong> : <span key={i}>{t.texto}</span>))}</>

/** Conteúdo do treinamento como o motorista lê: títulos, parágrafos e listas da marcação simples. */
export const Conteudo = memo(function Conteudo({ texto, className, nivel = 4 }: { texto: string; className?: string; nivel?: 3 | 4 }) {
  const blocos = blocosDoConteudo(texto)
  if (!blocos.length) return null
  const H = nivel === 3 ? 'h3' : 'h4'
  return (
    <div className={className}>
      {blocos.map((b, i) => {
        if (b.tipo === 'h') return <H key={i}><Trechos texto={b.texto} /></H>
        if (b.tipo === 'ul') return <ul key={i}>{b.itens.map((item, j) => <li key={j}><Trechos texto={item} /></li>)}</ul>
        return <p key={i}><Trechos texto={b.texto} /></p>
      })}
    </div>
  )
})
