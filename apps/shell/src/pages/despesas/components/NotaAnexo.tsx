import { Fragment } from 'react'
import { StatusBadge } from '@betinhos/ui'
import type { NotaAnexo as Nota } from '../domain/types'

const MODELO: Record<string, string> = { '55': 'NF-e', '65': 'NFC-e', '59': 'CF-e SAT' }

/** CNPJ numérico ou alfanumérico: 12.ABC.345/01DE-35. */
export function formatarCnpj(texto: string) {
  const cnpj = texto.toUpperCase().replace(/[^0-9A-Z]/g, '')
  return /^[0-9A-Z]{14}$/.test(cnpj) ? `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}` : texto
}

/** Rótulo da situação. "Chave conferida" não é confirmação da SEFAZ: nunca dizer "Nota confirmada". */
export const ROTULO_NOTA: Record<Nota['situacao'], string> = { verificada: 'Chave conferida', 'nao-verificada': 'Nota não verificada', 'sem-nota': 'Sem nota fiscal' }
const TOM_NOTA = { verificada: 'success', 'nao-verificada': 'warning', 'sem-nota': 'neutral' } as const

/** Situação da nota fiscal do comprovante e, com a chave, o emitente, a UF, o modelo e o número. */
export function NotaDoAnexo({ nota }: { nota: Nota | null }) {
  if (!nota) return null
  const partes = nota.situacao === 'verificada'
    ? [nota.cnpj ? `CNPJ ${formatarCnpj(nota.cnpj)}` : '', nota.uf, [MODELO[nota.modelo] ?? (nota.modelo ? `Modelo ${nota.modelo}` : ''), nota.numero != null ? `nº ${nota.numero}` : ''].filter(Boolean).join(' ')].filter(Boolean)
    : []
  return (
    <span className="dsp-nota">
      <StatusBadge tone={TOM_NOTA[nota.situacao]}>{ROTULO_NOTA[nota.situacao]}</StatusBadge>
      {/* Cada parte inteira na linha (o CNPJ não quebra no meio); a quebra acontece só nos separadores. */}
      {partes.length ? <span className="dsp-nota__detalhe">{partes.map((parte, i) => <Fragment key={parte}>{i ? ' · ' : ''}<span className="dsp-nota__parte">{parte}</span></Fragment>)}</span> : null}
    </span>
  )
}
