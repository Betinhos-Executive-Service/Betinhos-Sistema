import { formatBRL, type BarraEvolucao } from "../../lib/gastosRelatorio";

// Gráficos em SVG próprio (o build é single-file, sem biblioteca). Cores do app: navy #001a3d sobre trilho #e2e8f0.
const NAVY = "#001a3d";
const TRILHO = "#e2e8f0";
const TEXTO = "#0f172a";
const TEXTO_SUAVE = "#64748b";
const LARGURA = 320;

/** Colunas da evolução (semana ou mês): valor acima da coluna, rótulo embaixo. */
export function GraficoEvolucao({ barras, tipo }: { barras: BarraEvolucao[]; tipo: "semana" | "mes" }) {
  const altura = 168;
  const base = 138;
  const topo = 24;
  const maximo = Math.max(...barras.map((barra) => barra.total), 1);
  const passo = LARGURA / barras.length;
  const larguraColuna = Math.min(40, passo * 0.6);
  const resumo = barras.map((barra) => `${tipo === "semana" ? "semana de " : ""}${barra.rotulo}: ${formatBRL(barra.total)}`).join("; ");
  const curto = (valor: number) => (valor >= 1000 ? `${Math.round(valor / 100) / 10}k`.replace(".", ",") : String(Math.round(valor)));
  return (
    <svg className="gr-chart" viewBox={`0 0 ${LARGURA} ${altura}`} role="img" aria-label={`Evolução ${tipo === "semana" ? "por semana" : "por mês"}. ${resumo}.`}>
      <line x1="0" y1={base} x2={LARGURA} y2={base} stroke={TRILHO} strokeWidth="1" />
      {barras.map((barra, i) => {
        const centro = passo * i + passo / 2;
        const alturaColuna = barra.total > 0 ? Math.max(3, Math.round(((base - topo) * barra.total) / maximo)) : 0;
        return (
          <g key={barra.chave}>
            {alturaColuna ? <rect x={centro - larguraColuna / 2} y={base - alturaColuna} width={larguraColuna} height={alturaColuna} rx="4" fill={NAVY} /> : null}
            {barra.total > 0 ? <text x={centro} y={base - alturaColuna - 5} fontSize="11" fontWeight="800" fill={TEXTO} textAnchor="middle">{curto(barra.total)}</text> : null}
            <text x={centro} y={base + 17} fontSize="11.5" fontWeight="700" fill={TEXTO_SUAVE} textAnchor="middle">{barra.rotulo}</text>
          </g>
        );
      })}
    </svg>
  );
}
