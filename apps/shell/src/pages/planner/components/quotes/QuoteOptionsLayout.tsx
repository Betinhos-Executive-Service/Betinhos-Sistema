// Porte de Tela Planner/src/quotes/QuoteOptionsLayout.jsx (sem mudança de comportamento).
import React from "react";
import { CarFront } from "lucide-react";
import { formatMoney, parseQuoteMoney } from '../../domain/quoteDomain';
export default function QuoteOptionsLayout({ options, activeId, onActivate, children }: any) {
  const selectedId = options.some((option: any) => option.id === activeId) ? activeId : options[0]?.id;
  const chooseByKey = (event: any, index: any) => {
    let next;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (index + 1) % options.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = (index + options.length - 1) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    else return;
    event.preventDefault();
    onActivate?.(options[next].id);
    event.currentTarget.parentElement.children[next]?.focus();
  };

  if (!options.length) return children;
  return <div className="quote-options-workbench">
    <nav className="quote-option-navigation" role="tablist" aria-label="Opções da cotação" aria-orientation="vertical">
      {options.map((option: any, index: any) => <button key={option.id} id={`quote-option-tab-${option.id}`} type="button" role="tab" aria-selected={option.id === selectedId} aria-controls={`quote-option-${option.id}`} tabIndex={option.id === selectedId ? 0 : -1} onClick={() => onActivate?.(option.id)} onKeyDown={(event) => chooseByKey(event, index)}>
        <span className="quote-option-navigation-icon" aria-hidden="true"><CarFront size={20} /></span>
        <span className="quote-option-navigation-copy"><strong>{option.name || `Opção ${index + 1}`}</strong><span>{(parseQuoteMoney(option.value) as any) > 0 ? formatMoney(option.value) : "A informar"}</span></span>
      </button>)}
    </nav>
    {React.Children.map(children, (group: any) => React.isValidElement(group) && (group.props as any).className === "quote-options-cards"
      ? React.cloneElement(group, {}, React.Children.map((group.props as any).children, (card: any) => React.isValidElement(card)
        ? React.cloneElement(card as React.ReactElement<any>, { hidden: (card.props as any).id !== `quote-option-${selectedId}`, role: "tabpanel", "aria-labelledby": (card.props as any).id?.replace("quote-option-", "quote-option-tab-") })
        : card))
      : group)}
  </div>;
}
