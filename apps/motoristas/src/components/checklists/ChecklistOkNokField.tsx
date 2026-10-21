import { useState } from "react";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { FieldError, TextAreaControl } from "../common/FormFields";
import { PhotoAddButton } from "../common/PhotoAddButton";
import { SystemIcon } from "../icons/SystemIcon";
import { CHECKLIST_MAX_FOTOS_POR_ITEM, CHECKLIST_MAX_OBSERVACAO, type ChecklistDraft, type ChecklistItem } from "../../lib/checklists";

type Props = {
  item: ChecklistItem;
  draft: ChecklistDraft;
  domId: string;
  error?: string;
  disabled: boolean;
  onChoose: (valor: "ok" | "nok") => void;
  onToggleProblem: (problema: string) => void;
  onObservation: (texto: string) => void;
  onAddPhoto: () => void;
  onOpenPhoto: (photoId: string, dataUrl: string) => void;
};

// Item OK / Não OK: OK basta tocar; Não OK pede foto, problema e observação opcional.
export function ChecklistOkNokField({ item, draft, domId, error, disabled, onChoose, onToggleProblem, onObservation, onAddPhoto, onOpenPhoto }: Props) {
  const valor = draft.valores[item.chave] ?? "";
  const fotos = draft.fotos[item.chave] ?? [];
  const problemas = draft.problemas?.[item.chave] ?? [];
  const observacao = draft.observacoes?.[item.chave] ?? "";
  const errorId = `${domId}-error`;
  const [confirmOk, setConfirmOk] = useState(false);
  // Voltar para OK descarta o que foi registrado no Não OK; pede confirmação só quando há algo a perder.
  const hasNokData = fotos.length > 0 || problemas.length > 0 || observacao.trim().length > 0;
  const chooseOk = () => (valor === "nok" && hasNokData ? setConfirmOk(true) : onChoose("ok"));
  return (
    <section id={domId} tabIndex={-1} data-scroll-anchor={item.chave} className={`collision-evidence-group checklist-oknok ${error ? "is-invalid" : ""} ${valor ? `is-${valor}` : ""}`} aria-describedby={error ? errorId : undefined}>
      <div className="collision-evidence-group-head">
        <div>
          <strong>{item.rotulo}{item.obrigatorio ? <span className="form-field-required" aria-hidden="true"> *</span> : null}</strong>
          {item.instrucao ? <p className="checklist-instruction">{item.instrucao}</p> : null}
        </div>
      </div>
      <div className="checklist-oknok-choice" role="group" aria-label={item.rotulo}>
        <button type="button" className="is-ok" aria-pressed={valor === "ok"} disabled={disabled} onClick={chooseOk}>
          <SystemIcon name="check" />OK
        </button>
        <button type="button" className="is-nok" aria-pressed={valor === "nok"} disabled={disabled} onClick={() => onChoose("nok")}>
          <SystemIcon name="warning" />Não OK
        </button>
      </div>
      {valor === "nok" ? (
        <div className="checklist-oknok-detail">
          <p className="checklist-oknok-label">Qual o problema?</p>
          <div className="checklist-oknok-chips" role="group" aria-label={`Problemas: ${item.rotulo}`}>
            {item.opcoesProblema.map((opcao) => (
              <button key={opcao} type="button" aria-pressed={problemas.includes(opcao)} disabled={disabled} onClick={() => onToggleProblem(opcao)}>{opcao}</button>
            ))}
          </div>
          <div className="collision-evidence-strip">
            {fotos.map((photo, index) => (
              <button type="button" className="collision-evidence-thumb" key={photo.id} disabled={disabled} onClick={() => onOpenPhoto(photo.id, photo.dataUrl)} aria-label={`Ver foto do problema ${index + 1}: ${item.rotulo}`}>
                <img src={photo.dataUrl} alt={`Problema ${index + 1}: ${item.rotulo}`} />
                <small>{index + 1}</small>
              </button>
            ))}
            {fotos.length < CHECKLIST_MAX_FOTOS_POR_ITEM ? <PhotoAddButton disabled={disabled} onClick={onAddPhoto} ariaLabel={`Tirar foto do problema: ${item.rotulo}`} label={fotos.length ? "Adicionar" : "Tirar foto"} /> : null}
          </div>
          <TextAreaControl className="checklist-oknok-note" aria-label={`Observação: ${item.rotulo}`} rows={2} maxLength={CHECKLIST_MAX_OBSERVACAO} placeholder="Observação (opcional)" value={observacao} disabled={disabled} onChange={(event) => onObservation(event.target.value)} />
        </div>
      ) : null}
      <FieldError error={error} id={errorId} />
      {confirmOk ? (
        <ConfirmDialog title="Marcar como OK?" message="As fotos, os problemas e a observação deste item serão descartados." confirmLabel="Marcar OK" cancelLabel="Continuar editando" onCancel={() => setConfirmOk(false)} onConfirm={() => { setConfirmOk(false); onChoose("ok"); }} />
      ) : null}
    </section>
  );
}
