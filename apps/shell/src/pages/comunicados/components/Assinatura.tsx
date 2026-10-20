import type { SignatureStrokes } from '../domain/comunicados'

/** Desenho da assinatura gravada pelo App Motoristas (traços em coordenadas 0–1 numa área 1000 × 400). */
export function Assinatura({ value }: { value: SignatureStrokes }) {
  return (
    <svg viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Assinatura registrada">
      {value.map((stroke, index) => (
        <polyline key={index} points={stroke.map(([x, y]) => `${Math.round(x * 1000)},${Math.round(y * 400)}`).join(' ')}
          fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  )
}
