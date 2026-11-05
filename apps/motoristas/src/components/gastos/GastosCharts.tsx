import { useEffect, useRef } from "react";
import {
  ArcElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartConfiguration
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import type { PontoTendencia } from "../../lib/gastosRelatorio";

// Mesmo Chart.js 4.4.1 + datalabels 2.2.0 do Dashboard Betinhos, com as opções visuais dele (opts0): tooltip escuro,
// grade #f0f0f0, eixos #94a3b8, entrada easeOutQuart com atraso por ponto. Cores do DS, sem gradiente.
Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Filler, Tooltip, DoughnutController, ArcElement, ChartDataLabels);
Chart.defaults.font.family = "Manrope, system-ui, sans-serif";
Chart.defaults.plugins.datalabels = { display: false };

const NAVY = "#001a3d";
const NAVY_AREA = "rgba(0,26,61,0.08)";
const FORA_DO_PERIODO = "#94a3b8";
const GRADE = "#f0f0f0";
const EIXO = "#94a3b8";
const ROTULO = "#475569";

const semMovimento = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const animacao = () => (semMovimento() ? false : {
  duration: 850,
  easing: "easeOutQuart" as const,
  delay: (ctx: { type: string; dataIndex: number }) => (ctx.type === "data" ? Math.min(ctx.dataIndex * 35, 280) : 0)
});
const TOOLTIP = {
  backgroundColor: "#0f172a", titleColor: "#ffffff", bodyColor: "#94a3b8", borderColor: "#172033", borderWidth: 1,
  padding: 12, cornerRadius: 8, displayColors: false, titleFont: { weight: 700, size: 12 }, bodyFont: { size: 11 }
};

/** Canvas do Chart.js com ciclo de vida do React: cria no mount e recria só quando os dados mudam (`chave`), sem reanimar a cada render. */
function ChartCanvas({ config, chave, altura, className, rotulo }: { config: ChartConfiguration<"line"> | ChartConfiguration<"doughnut">; chave: string; altura: number; className: string; rotulo?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = new Chart(ref.current, config);
    return () => chart.destroy();
    // A config tem funções (formatadores); os dados entram pela chave.
  }, [chave]);
  return (
    <div className={className} style={{ height: altura }}>
      <canvas ref={ref} role={rotulo ? "img" : undefined} aria-label={rotulo} aria-hidden={rotulo ? undefined : true} />
    </div>
  );
}

const pontosComValor = (pontos: PontoTendencia[]) => pontos.map((ponto) => ponto.valor);

/** Mini-gráfico de área da tendência mensal; decorativo (o valor e a variação estão em texto no cartão). */
export function Sparkline({ pontos }: { pontos: PontoTendencia[] }) {
  if (pontos.filter((ponto) => ponto.valor != null).length < 2) return null;
  const ultimoDoPeriodo = pontos.reduce((achado, ponto, i) => (ponto.noPeriodo && ponto.valor != null ? i : achado), -1);
  const config: ChartConfiguration<"line"> = {
    type: "line",
    data: {
      labels: pontos.map((ponto) => ponto.rotulo),
      datasets: [{
        data: pontosComValor(pontos), borderColor: NAVY, backgroundColor: NAVY_AREA, fill: true, tension: 0.4, borderWidth: 2, spanGaps: true,
        pointRadius: pontos.map((_, i) => (i === ultimoDoPeriodo ? 3 : 0)), pointBackgroundColor: NAVY
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: animacao(), events: [],
      layout: { padding: 4 },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false, grace: "15%" } }
    }
  };
  return <ChartCanvas className="gr-sparkline" altura={40} config={config} chave={JSON.stringify(pontos)} />;
}

/** Média mês a mês em linha com área (estilo do dashboard): valor sobre cada ponto; meses fora do período em cinza. */
export function GraficoMedias({ pontos, curto, longo, rotulo }: { pontos: PontoTendencia[]; curto: (valor: number) => string; longo: (valor: number) => string; rotulo: string }) {
  const cores = pontos.map((ponto) => (ponto.noPeriodo ? NAVY : FORA_DO_PERIODO));
  const resumo = pontos.map((ponto) => `${ponto.rotulo}: ${ponto.valor == null ? "sem dados" : longo(ponto.valor)}`).join("; ");
  const config: ChartConfiguration<"line"> = {
    type: "line",
    data: {
      labels: pontos.map((ponto) => ponto.rotulo),
      datasets: [{
        label: rotulo, data: pontosComValor(pontos), borderColor: NAVY, backgroundColor: NAVY_AREA, fill: true, tension: 0.4, borderWidth: 2.5, spanGaps: true,
        pointRadius: pontos.map((ponto) => (ponto.noPeriodo ? 5 : 4)), pointHoverRadius: 6,
        pointBackgroundColor: cores, pointBorderColor: "#ffffff", pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: animacao(),
      layout: { padding: { top: 22, left: 4, right: 12 } },
      plugins: {
        legend: { display: false },
        tooltip: { ...TOOLTIP, callbacks: { label: (item) => longo(Number(item.raw)) } },
        datalabels: {
          display: (ctx) => ctx.dataset.data[ctx.dataIndex] != null,
          anchor: "end", align: "top", offset: 4,
          color: (ctx) => (pontos[ctx.dataIndex]?.noPeriodo ? NAVY : ROTULO),
          font: (ctx) => ({ size: 11, weight: pontos[ctx.dataIndex]?.noPeriodo ? 800 : 600 }),
          formatter: (valor: number) => curto(valor)
        }
      },
      scales: {
        x: { ticks: { color: EIXO, font: { size: 11 } }, grid: { display: false }, border: { display: false } },
        y: { ticks: { color: EIXO, font: { size: 10 }, maxTicksLimit: 4, callback: (valor) => curto(Number(valor)) }, grid: { color: GRADE }, border: { display: false }, grace: "12%" }
      }
    }
  };
  return <ChartCanvas className="gr-chart" altura={200} config={config} chave={rotulo + JSON.stringify(pontos)} rotulo={`${rotulo} por mês. ${resumo}.`} />;
}

export type FatiaStatus = { rotulo: string; valor: number; cor: string };

/** Rosca dos status dos envios com o total no centro (o detalhe por status fica na legenda em texto ao lado). */
export function GraficoStatus({ fatias, total }: { fatias: FatiaStatus[]; total: number }) {
  const visiveis = fatias.filter((fatia) => fatia.valor > 0);
  const config: ChartConfiguration<"doughnut"> = {
    type: "doughnut",
    data: {
      labels: visiveis.map((fatia) => fatia.rotulo),
      datasets: [{ data: visiveis.map((fatia) => fatia.valor), backgroundColor: visiveis.map((fatia) => fatia.cor), borderColor: "#ffffff", borderWidth: 2, hoverOffset: 4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "68%", animation: semMovimento() ? false : { duration: 850, easing: "easeOutQuart" },
      plugins: { legend: { display: false }, tooltip: { ...TOOLTIP, callbacks: { label: (item) => `${item.label}: ${item.raw}` } } }
    }
  };
  return (
    <div className="gr-rosca">
      <ChartCanvas className="gr-rosca-canvas" altura={120} config={config} chave={JSON.stringify(visiveis)} />
      <span className="gr-rosca-centro" aria-hidden="true"><strong>{total}</strong><small>{total === 1 ? "gasto" : "gastos"}</small></span>
    </div>
  );
}
