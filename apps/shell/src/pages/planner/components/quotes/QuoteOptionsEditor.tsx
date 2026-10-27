// Porte de Tela Planner/src/quotes/QuoteOptionsEditor.jsx (sem mudança de comportamento).
import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { FormMoneyInput, FormTextArea, FormTextInput } from './QuoteFields';
import { newQuoteOption, validateQuoteOption } from '../../domain/quoteScenarios';
import { isVanVehicle } from '../../domain/quoteDomain';

const CATEGORIES = [{ id: "car", label: "Carro", vehicleType: "Executivo" }, { id: "van", label: "Van", vehicleType: "Van" }];
const optionCategory = (option: any) => { const type = option.items?.[0]?.vehicleType || option.legacyVehicleType; return type ? (isVanVehicle(type) ? "van" : "car") : ""; };


export default function QuoteOptionsEditor({ option, options, index = 0, onChange, readOnly = false, accepted = false, sent = false, pendingDecision = false, selectable = false, selectedIds = [], onSelectionChange, headingActions, addLabel = "Nova opção", actionsInHeading = false }: any) {
  const removeOption = (item: any) => { onChange(options.filter((current: any) => current.id !== item.id)); onSelectionChange?.(selectedIds.filter((id: any) => id !== item.id)); };
  if (Array.isArray(options)) return <div className="quote-options-edit-list">
    {options.map((item, position) => <div className="quote-option-edit-group" key={item.id}>
      {selectable && <label className="quote-dialog-checkbox"><input type="checkbox" disabled={readOnly || !validateQuoteOption(item).valid} checked={selectedIds.includes(item.id)} onChange={(event) => onSelectionChange?.(event.target.checked ? [...selectedIds, item.id] : selectedIds.filter((id: any) => id !== item.id))} /><span>Incluir {item.name || `Opção ${position + 1}`} na proposta</span></label>}
      <QuoteOptionsEditor option={item} index={position} onChange={(updated: any) => onChange(options.map((current) => current.id === updated.id ? updated : current))} readOnly={readOnly} accepted={accepted} headingActions={!readOnly && options.length > 1 && actionsInHeading ? <button className="quote-option-remove" type="button" onClick={() => removeOption(item)}><Trash2 size={14} aria-hidden="true" />Remover opção</button> : undefined} />
      {!readOnly && options.length > 1 && !actionsInHeading && <button className="button button-quiet" type="button" onClick={() => removeOption(item)}>Remover opção</button>}
    </div>)}
    {!readOnly && <button className="button button-quiet" type="button" onClick={() => onChange([...options, newQuoteOption(options.length)])}><Plus size={14} />{addLabel}</button>}
  </div>;
  if (!option) return <p className="quote-options-empty">Selecione uma opção para editar.</p>;

  const update = (patch: any) => onChange?.({ ...option, ...patch, legacy: false });
  const updateText = (key: any, value: any) => update({ [key]: value });
  return <section className="quote-option-edit" aria-label={`Opção ${index + 1}`}>
    <header className="quote-option-edit-heading">
      <h3>{readOnly ? (accepted ? "Opção aceita" : sent ? `Opção ${index + 1} · enviada` : pendingDecision ? `Opção ${index + 1}` : "Opção encerrada") : `Opção ${index + 1}`}</h3>
      {headingActions}
    </header>
    <label className="quote-option-editor-field">Título da opção<FormTextInput value={option.name || ""} maxLength={100} readOnly={readOnly} onChange={(event: any) => updateText("name", event.target.value)} placeholder={`Opção ${index + 1}`} /></label>
    <fieldset className="quote-option-editor-field quote-option-category" disabled={readOnly}><legend>Veículo</legend>
      {CATEGORIES.map((category) => <label key={category.id}><input type="radio" name={`quote-option-category-${option.id}`} checked={optionCategory(option) === category.id} onChange={() => update({ items: [{ id: option.items?.[0]?.id || category.id, vehicleType: category.vehicleType, quantity: 1 }] })} /><span>{category.label}</span></label>)}
    </fieldset>
    <label className="quote-option-editor-field quote-option-editor-value">Valor total (BRL)<FormMoneyInput value={option.value || ""} readOnly={readOnly} onChange={(event: any) => updateText("value", event.target.value)} placeholder="A informar" /></label>
    <label className="quote-option-editor-field quote-option-editor-terms">Condição comercial<FormTextArea rows={3} maxLength={4000} value={option.commercialTerms || ""} readOnly={readOnly} onChange={(event: any) => updateText("commercialTerms", event.target.value)} placeholder="Prazo, pagamento e validade" /></label>
  </section>;
}
