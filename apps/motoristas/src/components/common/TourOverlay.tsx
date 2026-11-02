import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  fitSpotlight,
  missingRequiredSteps,
  placeTourCard,
  resolveTourSteps,
  sameBox,
  spotlightBox,
  tourProgressLabel,
  type TourBox,
  type TourChapter,
  type TourCloseReason,
  type TourStep
} from "../../app/tour";
import { findTourTarget } from "../../app/tourDom";
import { ActionButton } from "./ActionButton";

type TourOverlayProps = {
  chapter: TourChapter;
  onClose: (reason: TourCloseReason) => void;
};

const MEASURE_WINDOW_MS = 800;
const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function measure(element: HTMLElement): TourBox {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

// Tour guiado com spotlight: escurece a tela, recorta o elemento real do passo e posiciona o cartão
// abaixo ou acima dele. Passo sem elemento alvo é um cartão centralizado. Modal (role=dialog); fecha com
// Pular/Concluir ou Esc (o Voltar do celular só vira Esc fora do Início, onde o backGuard atua).
export function TourOverlay({ chapter, onClose }: TourOverlayProps) {
  const titleId = useId();
  const textId = useId();
  const cardRef = useRef<HTMLElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Quem abriu o tour (ex.: o botão "?") recebe o foco de volta ao fechar.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => () => {
    if (opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true });
  }, [opener]);

  // O overlay nasce com `key={chapter.id}`: o capítulo não muda, então os passos são resolvidos uma vez só.
  const [{ visibleSteps, skippedRequired }] = useState(() => {
    const hasTarget = (candidate: TourStep) => Boolean(findTourTarget(candidate));
    return { visibleSteps: resolveTourSteps(chapter.steps, hasTarget), skippedRequired: missingRequiredSteps(chapter.steps, hasTarget) };
  });
  const [index, setIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<TourBox | null>(null);
  const [cardHeight, setCardHeight] = useState(0);

  const total = visibleSteps.length;
  const step: TourStep | undefined = visibleSteps[index];
  const isLast = index === total - 1;

  // Sem nenhum passo na tela não há o que mostrar: fecha sem marcar como visto.
  useEffect(() => {
    if (total === 0) onCloseRef.current("indisponivel");
  }, [total]);

  // Mede o elemento do passo antes da primeira pintura (sem salto do cartão), rola até ele e acompanha
  // a rolagem/animações por um curto período, depois só em scroll/resize. Elemento sumiu: avança sem erro.
  useLayoutEffect(() => {
    if (!step) return;
    if (!step.target) return;
    const element = findTourTarget(step);
    if (!element) {
      if (index + 1 < total) setIndex(index + 1);
      else onCloseRef.current("concluido");
      return;
    }

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    element.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });

    let current = element;
    const update = () => {
      // Só procura de novo se o elemento saiu da tela (a lista re-renderizou); senão apenas mede.
      if (!current.isConnected) current = findTourTarget(step) ?? current;
      const next = spotlightBox(measure(current), { width: window.innerWidth, height: window.innerHeight });
      setSpotlight((previous) => (sameBox(previous, next) ? previous : next));
      // Girar a tela ou redimensionar muda a quebra de linha do texto: remede o cartão junto com o destaque.
      if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
    };
    update();

    const startedAt = performance.now();
    let frame = 0;
    const tick = () => {
      update();
      if (performance.now() - startedAt < MEASURE_WINDOW_MS) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);

    window.addEventListener("scroll", update, { capture: true, passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
    };
  }, [index, step, total]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [index, total]);

  // Foco só depois da medição: enquanto o cartão está invisível (visibility: hidden) o botão não aceita foco.
  const cardReady = cardHeight > 0;
  useEffect(() => {
    if (cardReady) nextRef.current?.focus({ preventScroll: true });
  }, [index, cardReady]);

  // Teclado: Esc pula, setas navegam, Tab fica preso no cartão.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current("pulado");
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((current) => Math.min(current + 1, total - 1));
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((current) => Math.max(current - 1, 0));
        return;
      }
      if (event.key !== "Tab" || !cardRef.current) return;
      const focusable = [...cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !cardRef.current.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [total]);

  if (!step) return null;

  // Toda mudança de viewport passa por update() e já re-renderiza; basta ler a altura atual aqui.
  const activeSpotlight = step.target ? spotlight : null;
  const placement = placeTourCard(activeSpotlight, cardHeight, window.innerHeight);
  const visibleSpotlight = fitSpotlight(activeSpotlight, placement);
  const advance = () => {
    if (isLast) onClose("concluido");
    else setIndex(index + 1);
  };

  return (
    <div
      className="tour-root"
      data-tour-chapter={chapter.id}
      data-tour-step={step.id}
      data-tour-total={total}
      data-tour-skipped={skippedRequired.join(",") || undefined}
    >
      <div className={`tour-backdrop ${visibleSpotlight ? "" : "tour-backdrop--dim"}`.trim()} aria-hidden="true">
        {visibleSpotlight ? (
          <div
            className="tour-spotlight"
            style={{ top: visibleSpotlight.top, left: visibleSpotlight.left, width: visibleSpotlight.width, height: visibleSpotlight.height }}
          />
        ) : null}
      </div>
      <section
        ref={cardRef}
        className={`tour-card tour-card--${placement.side} ${cardHeight ? "" : "tour-card--measuring"}`.trim()}
        style={{ top: placement.top }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
      >
        <div className="tour-card-progress" aria-live="polite">
          {tourProgressLabel(index, total)} · {chapter.title}
        </div>
        <h2 id={titleId} className="tour-card-title">{step.title}</h2>
        <div id={textId} className="tour-card-text">
          {step.text.map((paragraph, position) => <p key={position}>{paragraph}</p>)}
        </div>
        <div className="tour-card-actions">
          {isLast ? null : <ActionButton className="tour-skip" variant="ghost" label="Pular" onClick={() => onClose("pulado")} />}
          {index > 0 ? <ActionButton className="tour-back" variant="secondary" label="Voltar" onClick={() => setIndex(index - 1)} /> : null}
          <ActionButton buttonRef={nextRef} className="tour-next" variant="primary" label={isLast ? "Concluir" : "Próximo"} onClick={advance} />
        </div>
      </section>
    </div>
  );
}
