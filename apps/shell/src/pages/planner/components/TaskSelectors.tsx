// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { BOARD_SORT_OPTIONS, TASK_VIEW_ITEMS } from '../constants'
import { readQuoteViewPreference } from '../domain/quoteViewPreference'
import LoadingFallback from './LoadingFallback'
import { ArrowDownUp, Check, ChevronDown, UserRound, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'


export function TaskViewSelector({ active, onSelect }: any) {
  return (
    <div
      className="task-view-selector"
      aria-label="Modo de visualização das tarefas"
    >
      {TASK_VIEW_ITEMS.map(([id, label, Icon]: any) => (
        <button
          key={id}
          className={
            active === id ? "task-view-button active" : "task-view-button"
          }
          type="button"
          onClick={() => onSelect(id)}
          aria-label={label}
          aria-pressed={active === id}
          title={label}
        >
          <Icon size={17} strokeWidth={active === id ? 2.3 : 2} />
        </button>
      ))}
    </div>
  );
}

export function BoardSortSelector({ sort, onChange }: any) {
  const [open, setOpen] = useState<any>(false);
  const rootRef = useRef<any>(null);
  const activeOption = BOARD_SORT_OPTIONS.find(([key]: any) => key === sort.key) || BOARD_SORT_OPTIONS[0];
  const activeDirection = sort.direction === "desc" ? activeOption[3] : activeOption[2];

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event: any) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: any) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const select = (key: any) => {
    onChange({ key, direction: key === sort.key ? sort.direction : "asc" });
    setOpen(false);
  };

  const invert = () => onChange({ ...sort, direction: sort.direction === "asc" ? "desc" : "asc" });

  return (
    <div className="board-sort-selector" ref={rootRef}>
      <button className="board-sort-trigger" type="button" aria-haspopup="menu" aria-expanded={open} aria-controls="board-sort-menu" onClick={() => setOpen((current: any) => !current)} title={`Ordenar por ${activeOption[1]}: ${activeDirection}`}>
        <ArrowDownUp size={15} aria-hidden="true" />
        <span>Ordenar: {activeOption[1]}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && <div className="board-sort-menu" id="board-sort-menu" role="menu" aria-label="Ordenar cards">
        <div className="board-sort-menu-heading">
          <div><strong>Ordenar cards</strong><span>Escolha o critério da fila</span></div>
          <span className="board-sort-current">{activeOption[1]}</span>
        </div>
        {BOARD_SORT_OPTIONS.map(([key, label, ascLabel, descLabel]: any) => {
          const selected = key === sort.key;
          const directionLabel = selected && sort.direction === "desc" ? descLabel : ascLabel;
          return <button key={key} className={`board-sort-option${selected ? " active" : ""}`} type="button" role="menuitemradio" aria-checked={selected} onClick={() => select(key)}>
            <span>{label}</span><small>{directionLabel}</small>{selected && <Check size={14} aria-hidden="true" />}
          </button>;
        })}
        <div className="board-sort-menu-footer">
          <button className="board-sort-invert" type="button" onClick={invert} aria-label={`Inverter ordem: ${activeDirection}`}>
            <ArrowDownUp size={14} aria-hidden="true" />
            <span>Inverter ordem</span>
            <small>{activeDirection}</small>
          </button>
        </div>
      </div>}
    </div>
  );
}

export function TaskScopeSelector({ active, onSelect, disabled = false }: any) {
  return (
    <div className="task-scope-selector" aria-label="Escopo das tarefas">
      <button
        className={
          active === "all" ? "task-scope-button active" : "task-scope-button"
        }
        type="button"
        onClick={() => onSelect("all")}
        aria-pressed={active === "all"}
      >
        <Users size={14} />
        Todas
      </button>
      <button
        className={
          active === "mine" ? "task-scope-button active" : "task-scope-button"
        }
        type="button"
        onClick={() => onSelect("mine")}
        aria-pressed={active === "mine"}
        disabled={disabled}
        title={
          disabled ? "Usuário atual não identificado" : "Filtrar minhas tarefas"
        }
      >
        <UserRound size={14} />
        Minhas
      </button>
    </div>
  );
}

export function DataLoadingView({ loading, error, view }: any) {
  const stage = loading?.core
    ? "Carregando tarefas e responsáveis"
    : loading?.quotes || loading?.quality
      ? "Preparando dados complementares"
      : "Finalizando conexão";
  return <LoadingFallback label={error || stage} view={view} quoteView={readQuoteViewPreference()} />;
}
