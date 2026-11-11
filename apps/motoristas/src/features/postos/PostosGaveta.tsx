import { ChevronUp } from "lucide-react";
import { useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { comFriccao, posicaoAposArrasto, posicaoAposToque, type Gaveta, type PosicaoGaveta } from "./postosProximos";

type Props = {
  gaveta: Gaveta;
  posicao: PosicaoGaveta;
  onPosicao: (posicao: PosicaoGaveta) => void;
  titulo: ReactNode;
  contagem: string;
  /** Acima da borda da gaveta, acompanhando-a (o cartão do posto). */
  acima: ReactNode;
  children: ReactNode;
};

/** Passou disto (px) é arrasto; menos que isso é toque no puxador. */
const LIMIAR_ARRASTO = 6;
const ORDEM: readonly PosicaoGaveta[] = ["recolhida", "meio", "aberta"];

type Arrasto = { id: number; inicioY: number; inicioDeslocamento: number; ultimoY: number; ultimoT: number; velocidade: number; moveu: boolean; deslocamento: number };

/** Gaveta (bottom sheet) com 3 posições. O arrasto é do puxador, com pointer capture; só `transform` anima (nunca a altura). */
export function PostosGaveta({ gaveta, posicao, onPosicao, titulo, contagem, acima, children }: Props) {
  const raiz = useRef<HTMLDivElement | null>(null);
  const arrasto = useRef<Arrasto | null>(null);
  const aplicar = (deslocamento: number) => { if (raiz.current) raiz.current.style.transform = `translate3d(0, ${deslocamento}px, 0)`; };

  useLayoutEffect(() => { aplicar(gaveta.deslocamento[posicao]); }, [gaveta, posicao]);

  const aoPressionar = (evento: PointerEvent<HTMLDivElement>) => {
    if (evento.pointerType === "mouse" && evento.button !== 0) return;
    evento.currentTarget.setPointerCapture(evento.pointerId);
    const inicioDeslocamento = gaveta.deslocamento[posicao];
    arrasto.current = { id: evento.pointerId, inicioY: evento.clientY, inicioDeslocamento, ultimoY: evento.clientY, ultimoT: evento.timeStamp, velocidade: 0, moveu: false, deslocamento: inicioDeslocamento };
  };

  const aoMover = (evento: PointerEvent<HTMLDivElement>) => {
    const atual = arrasto.current;
    if (!atual || atual.id !== evento.pointerId) return;
    const distancia = evento.clientY - atual.inicioY;
    if (!atual.moveu && Math.abs(distancia) < LIMIAR_ARRASTO) return;
    if (!atual.moveu) raiz.current?.classList.add("is-arrastando");
    atual.moveu = true;
    const dt = evento.timeStamp - atual.ultimoT;
    if (dt > 0) atual.velocidade = 0.6 * ((evento.clientY - atual.ultimoY) / dt) + 0.4 * atual.velocidade;
    atual.ultimoY = evento.clientY;
    atual.ultimoT = evento.timeStamp;
    atual.deslocamento = comFriccao(atual.inicioDeslocamento + distancia, 0, gaveta.deslocamento.recolhida);
    aplicar(atual.deslocamento);
  };

  const soltar = (evento: PointerEvent<HTMLDivElement>, cancelado: boolean) => {
    const atual = arrasto.current;
    if (!atual || atual.id !== evento.pointerId) return;
    arrasto.current = null;
    raiz.current?.classList.remove("is-arrastando");
    // Quem parou de mexer antes de soltar não tem flick: a velocidade vale só se o último movimento foi recente.
    const velocidade = evento.timeStamp - atual.ultimoT < 80 ? atual.velocidade : 0;
    const destino = cancelado ? posicao : atual.moveu ? posicaoAposArrasto(atual.deslocamento, velocidade, gaveta) : posicaoAposToque(posicao);
    aplicar(gaveta.deslocamento[destino]);
    onPosicao(destino);
  };

  const aoTeclar = (evento: KeyboardEvent<HTMLDivElement>) => {
    // Enter/Espaço alternam como o toque; as setas chegam às três posições (o toque sozinho não recolhe).
    const indice = ORDEM.indexOf(posicao);
    const destino = evento.key === "ArrowUp" ? ORDEM[Math.min(indice + 1, ORDEM.length - 1)] : evento.key === "ArrowDown" ? ORDEM[Math.max(indice - 1, 0)] : evento.key === "Enter" || evento.key === " " ? posicaoAposToque(posicao) : null;
    if (!destino) return;
    evento.preventDefault();
    onPosicao(destino);
  };

  return (
    <div ref={raiz} className="pp-gaveta" data-posicao={posicao} style={{ height: gaveta.total }}>
      <div className="pp-gaveta-acima">{acima}</div>
      <section className="pp-gaveta-folha" aria-labelledby="pp-lista-titulo">
        <div className="pp-gaveta-puxador" role="button" tabIndex={0} aria-expanded={posicao !== "recolhida"} aria-label="Lista dos postos mais próximos" onPointerDown={aoPressionar} onPointerMove={aoMover} onPointerUp={(e) => soltar(e, false)} onPointerCancel={(e) => soltar(e, true)} onKeyDown={aoTeclar}>
          <span className="pp-gaveta-alca" aria-hidden="true" />
          <span className="pp-gaveta-cabeca">
            <span className="pp-gaveta-titulo" id="pp-lista-titulo">{titulo}</span>
            <span className="pp-lista-total">{contagem}</span>
            <ChevronUp className="pp-gaveta-seta" aria-hidden="true" />
          </span>
        </div>
        <div className="pp-gaveta-corpo" {...(posicao === "recolhida" ? { inert: "" } : {})}>{children}</div>
      </section>
    </div>
  );
}
