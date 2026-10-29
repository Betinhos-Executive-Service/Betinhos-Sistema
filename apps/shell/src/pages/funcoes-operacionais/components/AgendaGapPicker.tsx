import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "./Icon";
import type { Service } from "../domain/types";
import { formatTime, parseDate } from "../domain/utils";

// Linha do tempo do dia de um motorista. Serviços são pontos fixos; entre eles há um "Trocar aqui".
// Intervalo i fica entre services[i - 1] ("depois de") e services[i] ("antes de").
type AgendaGapPickerProps = {
  idPrefix: string;
  driverLabel: string;
  placeholder?: string;
  services?: Service[];
  afterId?: string;
  beforeId?: string;
  disabled?: boolean;
  invalid?: boolean;
  nowValue?: Date;
  onSelect: (afterId: string, beforeId: string) => void;
};

type Gap = { index: number; afterId: string; beforeId: string; label: string; past: boolean };

export function AgendaGapPicker({
  idPrefix,
  driverLabel,
  placeholder = "",
  services = [],
  afterId = "",
  beforeId = "",
  disabled = false,
  invalid = false,
  nowValue = new Date(),
  onSelect
}: AgendaGapPickerProps) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const suppressClick = useRef(false);

  const gaps: Gap[] = Array.from({ length: services.length + 1 }, (_, index) => {
    const after = services[index - 1] || null;
    const before = services[index] || null;
    const beforeAt = before ? parseDate(before.dataSaida) : null;
    const label = after && before
      ? `Entre ${formatTime(after.dataSaida)} e ${formatTime(before.dataSaida)}`
      : before
        ? `Antes das ${formatTime(before.dataSaida)}`
        : after
          ? `Depois das ${formatTime(after.dataSaida)}`
          : "A qualquer hora do dia";
    return { index, afterId: after?.id || "", beforeId: before?.id || "", label, past: !!beforeAt && beforeAt <= nowValue };
  });
  const selectedIndex = gaps.findIndex((gap) => gap.afterId === afterId && gap.beforeId === beforeId && (!!afterId || !!beforeId || services.length === 0));
  const selectedGap = selectedIndex >= 0 ? gaps[selectedIndex] : null;
  const firstOpenIndex = gaps.findIndex((gap) => !gap.past);

  function choose(gap: Gap) {
    if (disabled || gap.past) return;
    onSelect(gap.afterId, gap.beforeId);
  }

  function gapIndexAt(x: number, y: number): number | null {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>(`[data-gap-owner="${idPrefix}"]`);
    if (!element) return null;
    const index = Number(element.dataset.gapIndex);
    return Number.isFinite(index) ? index : null;
  }

  function startDrag(event: ReactPointerEvent<HTMLElement>) {
    if (disabled) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ponteiro sintético (teste) não pode ser capturado; o arraste segue pelos eventos do marcador.
    }
    setDragging(true);
    setDragOverIndex(selectedIndex);
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!dragging) return;
    const index = gapIndexAt(event.clientX, event.clientY);
    if (index !== null && !gaps[index].past) setDragOverIndex(index);
  }

  function endDrag() {
    if (!dragging) return;
    setDragging(false);
    // O clique que encerra o arraste não pode reselecionar o intervalo de origem.
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0);
    if (dragOverIndex !== null && dragOverIndex !== selectedIndex) choose(gaps[dragOverIndex]);
    setDragOverIndex(null);
  }

  function moveByKeyboard(event: ReactKeyboardEvent, gap: Gap) {
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    let next = gap.index + step;
    while (gaps[next] && gaps[next].past) next += step;
    if (!gaps[next]) return;
    choose(gaps[next]);
    document.getElementById(`${idPrefix}-gap-${next}`)?.focus();
  }

  return (
    <div className={`timeline-picker ${invalid ? "is-invalid" : ""} ${dragging ? "is-dragging" : ""} ${disabled && !placeholder ? "is-disabled" : ""}`}>
      <div className="timeline-picker__header">
        <strong>{driverLabel}</strong>
        {!placeholder && <span>{services.length ? `${services.length} ${services.length === 1 ? "serviço" : "serviços"} no dia` : "Sem serviços no dia"}</span>}
      </div>

      {placeholder ? (
        <p className="timeline-picker__result">{placeholder}</p>
      ) : (
        <>
          <ol className="timeline" role="radiogroup" aria-label={`Quando ${driverLabel || "o motorista"} troca o carro`}>
            {gaps.map((gap) => {
              const checked = selectedIndex === gap.index;
              const target = dragging && dragOverIndex === gap.index && !checked;
              const service = services[gap.index];
              const done = service ? (parseDate(service.dataSaida) || nowValue) <= nowValue : false;
              return [
                !gap.past && (
                  <li key={`gap-${gap.index}`} className="timeline__item timeline__item--gap">
                    <button
                      id={`${idPrefix}-gap-${gap.index}`}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      aria-label={`Trocar ${gap.label.toLowerCase()}`}
                      tabIndex={checked || (selectedIndex < 0 && gap.index === firstOpenIndex) ? 0 : -1}
                      className={`timeline-gap ${checked ? "is-checked" : ""} ${target ? "is-target" : ""}`}
                      data-gap-owner={idPrefix}
                      data-gap-index={gap.index}
                      disabled={disabled}
                      onClick={() => { if (!suppressClick.current) choose(gap); }}
                      onKeyDown={(event) => moveByKeyboard(event, gap)}
                    >
                      {checked ? (
                        <span
                          className={`timeline-gap__pill ${dragging ? "is-origin" : ""}`}
                          role="presentation"
                          title="Arraste para outro intervalo"
                          onPointerDown={startDrag}
                          onPointerMove={moveDrag}
                          onPointerUp={endDrag}
                          onPointerCancel={endDrag}
                        ><Icon name="swap" />Troca · {gap.label}</span>
                      ) : target ? (
                        <span className="timeline-gap__pill"><Icon name="swap" />Soltar aqui</span>
                      ) : (
                        <span className="timeline-gap__cta">Trocar aqui</span>
                      )}
                    </button>
                  </li>
                ),
                service && (
                  <li key={`service-${service.id}`} className={`timeline__item timeline__item--service ${done ? "is-done" : ""}`}>
                    <span className="timeline-service__time">{formatTime(service.dataSaida)}</span>
                    <span className="timeline-service__body">
                      <strong>{service.readableId}</strong>
                      <span>{service.trajeto || service.destino || "Serviço"}</span>
                    </span>
                  </li>
                )
              ];
            })}
          </ol>

          <p className={`timeline-picker__result ${selectedGap ? "is-set" : ""}`} aria-live="polite">
            {selectedGap ? `Troca ${selectedGap.label.charAt(0).toLowerCase() + selectedGap.label.slice(1)}.` : "Toque em “Trocar aqui” no intervalo livre."}
          </p>
        </>
      )}
    </div>
  );
}
