import type { CSSProperties } from "react";
import type { PontoTendencia } from "../../lib/gastosRelatorio";

// Gráficos em SVG próprio (o build é single-file, sem biblioteca). Cores do DS: navy-900 (período) e slate-400 (fora dele) sobre trilho slate-200.
const NAVY = "#001a3d";
const FORA_DO_PERIODO = "#94a3b8";
const TRILHO = "#e2e8f0";
const TEXTO = "#0f172a";
const TEXTO_SUAVE = "#64748b";

/** Mini-gráfico de linha da tendência mensal; decorativo (o valor e a variação estão em texto no cartão). */
export function Sparkline({ pontos }: { pontos: PontoTendencia[] }) {
  const largura = 120;
  const altura = 32;
  const margem = 4;
  const comValor = pontos.flatMap((ponto, i) => (ponto.valor == null ? [] : [{ i, valor: ponto.valor }]));
  if (comValor.length < 2) return null;
  const valores = comValor.map((ponto) => ponto.valor);
  const minimo = Math.min(...valores);
  const faixa = Math.max(...valores) - minimo;
  const passo = (largura - margem * 2) / Math.max(pontos.length - 1, 1);
  // Série constante fica no meio, não colada na base.
  const xy = comValor.map((ponto) => [margem + ponto.i * passo, faixa ? altura - margem - ((ponto.valor - minimo) / faixa) * (altura - margem * 2) : altura / 2] as const);
  // O ponto marcado é o último mês do período escolhido (em "Mês anterior", não o mês atual).
  const marcaveis = xy.filter((_, k) => pontos[comValor[k].i].noPeriodo);
  const [ultimoX, ultimoY] = marcaveis.length ? marcaveis[marcaveis.length - 1] : xy[xy.length - 1];
  return (
    <svg className="gr-sparkline" viewBox={`0 0 ${largura} ${altura}`} aria-hidden="true" focusable="false">
      <polyline points={xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ultimoX} cy={ultimoY} r="3" fill={NAVY} />
    </svg>
  );
}

/** Colunas da média mês a mês: valor acima, mês embaixo; meses fora do período escolhido ficam em cinza. */
export function GraficoMedias({ pontos, curto, longo, rotulo }: { pontos: PontoTendencia[]; curto: (valor: number) => string; longo: (valor: number) => string; rotulo: string }) {
  const largura = 320;
  const altura = 168;
  const base = 138;
  const topo = 24;
  const maximo = Math.max(...pontos.map((ponto) => ponto.valor ?? 0), 1);
  const passo = largura / Math.max(pontos.length, 1);
  const larguraColuna = Math.min(36, passo * 0.56);
  const resumo = pontos.map((ponto) => `${ponto.rotulo}: ${ponto.valor == null ? "sem dados" : longo(ponto.valor)}`).join("; ");
  return (
    <svg className="gr-chart" viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label={`${rotulo} por mês. ${resumo}.`}>
      <line x1="0" y1={base} x2={largura} y2={base} stroke={TRILHO} strokeWidth="1" />
      {pontos.map((ponto, i) => {
        const centro = passo * i + passo / 2;
        const alturaColuna = ponto.valor ? Math.max(3, Math.round(((base - topo) * ponto.valor) / maximo)) : 0;
        return (
          <g key={ponto.chave}>
            {alturaColuna ? (
              <rect className="gr-barra" style={{ "--i": i } as CSSProperties} x={centro - larguraColuna / 2} y={base - alturaColuna} width={larguraColuna} height={alturaColuna} rx="4" fill={ponto.noPeriodo ? NAVY : FORA_DO_PERIODO} />
            ) : null}
            <text x={centro} y={base - alturaColuna - 6} fontSize="11" fontWeight="800" fill={ponto.valor == null ? TEXTO_SUAVE : TEXTO} textAnchor="middle">{ponto.valor == null ? "–" : curto(ponto.valor)}</text>
            <text x={centro} y={base + 17} fontSize="11.5" fontWeight={ponto.noPeriodo ? 800 : 600} fill={ponto.noPeriodo ? TEXTO : TEXTO_SUAVE} textAnchor="middle">{ponto.rotulo}</text>
          </g>
        );
      })}
    </svg>
  );
}
