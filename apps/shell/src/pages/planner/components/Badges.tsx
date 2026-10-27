// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { STATUS_ICONS } from '../constants'
import { PRIORITIES, STATUSES, statusById } from '../domain/domain'
import { ClipboardList, EyeOff } from 'lucide-react'


export function Avatar({ name = "Sistema", small = false }: any) {
  const names = String(name || "Sistema")
    .split(/\s*,\s*/)
    .filter(Boolean);
  const initials = (value: any) =>
    value
      .split(" ")
      .map((part: any) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  if (names.length === 1)
    return (
      <span className={`avatar ${small ? "avatar-small" : ""}`} title={name}>
        {initials(names[0])}
      </span>
    );
  const visibleNames = names.slice(0, 2);
  return (
    <span
      className={`avatar avatar-stack ${small ? "avatar-stack-small" : ""}`}
      title={name}
      aria-label={`${names.length} responsáveis`}
    >
      {visibleNames.map((item, index) => (
        <span className="avatar avatar-stack-item" key={`${item}-${index}`}>
          {initials(item)}
        </span>
      ))}
      {names.length > visibleNames.length && (
        <span className="avatar avatar-stack-count">
          +{names.length - visibleNames.length}
        </span>
      )}
    </span>
  );
}

export function StatusBadge({ status }: any) {
  const item = statusById(status);
  return (
    <span className={`badge badge-${item.tone}`}>
      <span className="badge-dot" />
      {item.label}
    </span>
  );
}

export function StatusIcon({ status, ...props }: any) {
  const Icon = (STATUS_ICONS as any)[status] || ClipboardList;
  return <Icon {...props} />;
}

export function PriorityBadge({ priority }: any) {
  const item =
    PRIORITIES.find((entry) => entry.id === priority) || PRIORITIES[1];
  return <span className={`priority priority-${item.tone}`}>{item.label}</span>;
}

export function RestrictedVisibilityMark({ className = "" }: any) {
  return (
    <span
      className={`task-visibility-mark ${className}`.trim()}
      role="img"
      title="Visível somente para responsáveis e criador"
      aria-label="Tarefa oculta: visível somente para responsáveis e criador"
    >
      <EyeOff size={13} strokeWidth={2.2} aria-hidden="true" />
    </span>
  );
}

export function StatusPicker({ value, onChange }: any) {
  const selectedItem = STATUSES.find((item) => item.id === value) || STATUSES[0];
  return (
    <div className="status-picker" role="group" aria-label={`Status atual: ${selectedItem.label}`}>
      <div className="status-picker-options">
        {STATUSES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`status-option status-option-${item.tone}${value === item.id ? " is-selected" : ""}`}
            aria-label={item.label}
            aria-pressed={value === item.id}
            title={item.label}
            onClick={() => onChange(item.id)}
          >
            <StatusIcon status={item.id} size={18} strokeWidth={2.2} fill="none" stroke="currentColor" aria-hidden="true" />
          </button>
        ))}
      </div>
      <span className={`status-picker-current status-current-${selectedItem.tone}`}>{selectedItem.label}</span>
    </div>
  );
}
