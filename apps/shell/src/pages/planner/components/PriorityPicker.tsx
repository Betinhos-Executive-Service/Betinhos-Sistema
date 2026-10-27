// Porte de Tela Planner/src/PriorityPicker.jsx (sem mudança de comportamento).
import React from "react";
import { Flag } from "lucide-react";
import { PRIORITIES } from '../domain/domain';

export default function PriorityPicker({ value, onChange, includeUrgent = false }: any) {
  const options = includeUrgent ? PRIORITIES : PRIORITIES.filter((item) => item.id !== "urgent");
  const selectedItem = options.find((item) => item.id === value) || options[0];
  return <div className="priority-picker" role="radiogroup" aria-label={`Prioridade: ${selectedItem.label}`}>
    <div className="priority-picker-options" style={includeUrgent ? { gridTemplateColumns: "repeat(4, minmax(0, 1fr))" } : undefined}>
      {options.map((item) => {
        const isSelected = selectedItem.id === item.id;
        return <button key={item.id} type="button" role="radio" className={`priority-option priority-option-${item.tone}${isSelected ? " is-selected" : ""}`} aria-label={item.label} aria-checked={isSelected} tabIndex={isSelected ? 0 : -1} title={item.label} onClick={() => onChange(item.id)} onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault();
          const buttons = [...(event.currentTarget.parentElement?.querySelectorAll<any>('[role="radio"]') || [])];
          const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
          const nextIndex = (buttons.indexOf(event.currentTarget) + direction + buttons.length) % buttons.length;
          onChange(options[nextIndex].id);
          buttons[nextIndex]?.focus();
        }}>
          <Flag size={18} strokeWidth={2.2} aria-hidden="true" />
        </button>;
      })}
    </div>
    <span className={`priority-picker-current priority-current-${selectedItem.tone}`}>{selectedItem.label}</span>
  </div>;
}
