// Porte de Tela Planner/src/quotes/QuoteOptionsComparison.jsx (sem mudança de comportamento).
import React from "react";
import { Copy, FileText, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { newQuoteOption, validateQuoteOption } from '../../domain/quoteScenarios';
import QuoteOptionsEditor from './QuoteOptionsEditor';
import QuoteOptionsLayout from './QuoteOptionsLayout';

export default function QuoteOptionsComparison({ options = [], activeId, readOnly = false, accepted = false, sent = false, onActivate, onAdd, onDuplicate, onRemove, onChange, onGenerate, onDecision, saving = false, contextContent }: any) {
  const add = () => onAdd?.(newQuoteOption(options.length));
  return <section className="quote-options-comparison" aria-label="Comparação das opções">
    {contextContent}
    <section className="quote-commercial-workspace" aria-label="Opções da cotação">
    <header className="quote-commercial-header"><div><h2>Opções da cotação</h2><p>{options.length} {options.length === 1 ? "opção" : "opções"}{readOnly ? " · Proposta registrada" : " · Título e valor deixam a cotação pronta para enviar"}</p></div>{!readOnly && <div className="quote-commercial-header-actions"><button className="button button-secondary" type="button" disabled={saving} onClick={add}><Plus size={15} />Nova opção</button>{onGenerate && <button className="button button-primary" type="button" disabled={saving || !options.some((option: any) => validateQuoteOption(option).valid)} onClick={() => onGenerate()}><FileText size={15} />Montar proposta</button>}</div>}</header>
    <QuoteOptionsLayout options={options} activeId={activeId} onActivate={onActivate}>
    {options.length > 0 ? <div className="quote-options-cards">{options.map((option: any, index: any) => <article id={`quote-option-${option.id}`} className={`quote-comparison-card${option.id === activeId ? " is-active" : ""}`} key={option.id || index} onFocusCapture={() => onActivate?.(option.id)}>
      <QuoteOptionsEditor option={option} index={index} readOnly={readOnly} accepted={accepted} sent={sent} pendingDecision={Boolean(onDecision)} onChange={onChange}
        headingActions={!readOnly && <details className="quote-option-menu"><summary aria-label={`Ações de ${option.name || `opção ${index + 1}`}`}><MoreHorizontal size={17} /></summary><div><button type="button" onClick={() => onDuplicate?.(option)}><Copy size={14} />Duplicar opção</button><button type="button" onClick={() => onRemove?.(option)}><Trash2 size={14} />Remover opção</button></div></details>}
        />
      {!readOnly && !validateQuoteOption(option).valid && <small className="quote-comparison-state">{Object.values(validateQuoteOption(option).errors)[0]}</small>}
      {onDecision && <div className="quote-option-decisions" role="group" aria-label={`Decisão do cliente sobre ${option.name}`}>
        <button className="button button-primary" type="button" disabled={saving} onClick={() => onDecision(option.id, "Aceita pelo cliente")}>Cliente selecionou</button>
        <button className="button button-secondary" type="button" disabled={saving} onClick={() => onDecision(option.id, "Perdida")}>Cliente recusou</button>
        <button className="button button-secondary" type="button" disabled={saving} onClick={() => onDecision(option.id, "Cancelada")}>Cliente cancelou</button>
      </div>}
    </article>)}</div> : <p className="quote-options-empty">Nenhuma opção cadastrada.</p>}
    </QuoteOptionsLayout>
    </section>
  </section>;
}
