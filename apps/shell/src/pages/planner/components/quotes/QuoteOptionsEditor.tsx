// Card de uma opção de preço (V3): título, veículo, valor e condição, com os campos do Design System.
import React from "react";
import { Copy, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Menu, SegmentedControl, StatusBadge, Textarea } from "@betinhos/ui";
import { newQuoteOption, validateQuoteOption } from '../../domain/quoteScenarios';
import { formatMoney, isVanVehicle, parseQuoteMoney } from '../../domain/quoteDomain';

const CATEGORIES = [{ value: "car", label: "Carro", vehicleType: "Executivo" }, { value: "van", label: "Van", vehicleType: "Van" }];
const optionCategory = (option: any) => { const type = option.items?.[0]?.vehicleType || option.legacyVehicleType; return type ? (isVanVehicle(type) ? "van" : "car") : "car"; };

// Com `options` (lista), desenha a grade de cards e o botão de adicionar; com `option`, um card só.
export default function QuoteOptionsEditor({ option, options, index = 0, onChange, onDuplicate, onRemove, readOnly = false, addLabel = "Adicionar opção" }: any) {
  if (Array.isArray(options)) return <div className="quote-flow__options">
    {options.map((item: any, position: number) => <QuoteOptionsEditor key={item.id} option={item} index={position} readOnly={readOnly}
      onChange={(updated: any) => onChange(options.map((current: any) => current.id === updated.id ? updated : current))}
      onRemove={!readOnly && options.length > 1 ? (removed: any) => onChange(options.filter((current: any) => current.id !== removed.id)) : undefined} />)}
    {!readOnly && <button className="quote-flow__option quote-flow__option--add" type="button" onClick={() => onChange([...options, newQuoteOption(options.length)])}><Plus size={20} aria-hidden="true" />{addLabel}</button>}
  </div>;
  const update = (patch: any) => onChange?.({ ...option, ...patch, legacy: false });
  const validation = validateQuoteOption(option);
  const priced = parseQuoteMoney(option.value) > 0;
  return <article id={`quote-option-${option.id}`} className="quote-flow__option" aria-label={`Opção ${index + 1}`}>
    <header className="quote-flow__option-head">
      <strong>Opção {index + 1}</strong>
      {readOnly ? null : validation.valid ? <StatusBadge tone="success">Pronta</StatusBadge> : <StatusBadge tone="neutral">{priced ? "Falta o título" : "Falta o valor"}</StatusBadge>}
      {!readOnly && (onDuplicate || onRemove) && <Menu trigger={(props) => <Button {...props} variant="ghost" size="compact" icon={<MoreHorizontal size={16} />} aria-label={`Ações da opção ${index + 1}`} />} actions={[
        ...(onDuplicate ? [{ id: "duplicate", label: "Duplicar opção", icon: <Copy size={14} />, onSelect: () => onDuplicate(option) }] : []),
        ...(onRemove ? [{ id: "remove", label: "Remover opção", icon: <Trash2 size={14} />, tone: "danger" as const, onSelect: () => onRemove(option) }] : []),
      ]} />}
    </header>
    <Field label="Título da opção"><Input value={option.name || ""} maxLength={100} readOnly={readOnly} onChange={(event: any) => update({ name: event.target.value })} placeholder={`Ex.: Sedan executivo · transfer`} /></Field>
    <Field label="Veículo"><SegmentedControl aria-label="Veículo" fullWidth value={optionCategory(option)} disabled={readOnly} options={CATEGORIES.map(({ value, label }) => ({ value, label }))} onChange={(value: string) => { const category = CATEGORIES.find((item) => item.value === value)!; update({ items: [{ id: option.items?.[0]?.id || category.value, vehicleType: category.vehicleType, quantity: 1 }] }); }} /></Field>
    <Field label="Valor total"><Input className="quote-flow__money" prefix="R$" inputMode="decimal" value={String(option.value ?? "").replace(/^R\$\s?/, "")} readOnly={readOnly} onChange={(event: any) => update({ value: event.target.value })} onBlur={() => { if (priced) update({ value: formatMoney(option.value).replace(/^R\$\s?/, "") }); }} placeholder="0,00" /></Field>
    <Field label="Condição comercial desta opção"><Textarea rows={3} maxLength={4000} value={option.commercialTerms || ""} readOnly={readOnly} onChange={(event: any) => update({ commercialTerms: event.target.value })} placeholder="Prazo, pagamento e validade" /></Field>
  </article>;
}
