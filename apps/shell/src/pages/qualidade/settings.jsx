import React, { useEffect, useState } from "react";
import { Check, Database, LockKeyhole, Pencil, Plus, RefreshCw, Settings2, ShieldCheck, Trash2, X } from "lucide-react";
import { validateChoiceLabel } from "./domain";

export function SettingsView({ definitions, mockMode, saving, onRefresh, onCreate, onUpdate, onDelete }) {
  const [activeKey, setActiveKey] = useState(definitions[0]?.key || "category");
  const [newLabel, setNewLabel] = useState("");
  const [editing, setEditing] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [validation, setValidation] = useState("");
  const active = definitions.find((item) => item.key === activeKey) || definitions[0];

  useEffect(() => {
    if (!definitions.some((item) => item.key === activeKey)) setActiveKey(definitions[0]?.key || "");
  }, [definitions, activeKey]);

  if (!active) return null;

  const createOption = async () => {
    const message = validateChoiceLabel(newLabel, active.options);
    if (message) return setValidation(message);
    if (await onCreate(active.key, newLabel.trim())) {
      setNewLabel("");
      setValidation("");
    }
  };

  const updateOption = async () => {
    const message = validateChoiceLabel(editing.label, active.options, editing.value);
    if (message) return setValidation(message);
    if (await onUpdate(active.key, editing.value, editing.label.trim())) {
      setEditing(null);
      setValidation("");
    }
  };

  const deleteOption = async (option) => {
    if (await onDelete(active.key, option.value)) setConfirming(null);
  };

  return <section className="page-section settings-page">
    <div className="settings-title">
      <div><span>Administração do módulo</span><h1>Configurações</h1><p>Personalize listas usadas no registro e no tratamento dos erros.</p></div>
      <button className="secondary-button" onClick={onRefresh} disabled={saving}><RefreshCw size={17} className={saving ? "spin" : ""} />Sincronizar</button>
    </div>

    <div className="settings-layout">
      <aside className="settings-menu surface" aria-label="Tipos de configuração">
        <div className="settings-menu-head"><Settings2 size={18} /><div><strong>Choices do módulo</strong><span>{definitions.length} grupos</span></div></div>
        <nav>{definitions.map((item) => <button key={item.key} className={item.key === active.key ? "active" : ""} onClick={() => { setActiveKey(item.key); setEditing(null); setConfirming(null); setValidation(""); }}><span>{item.label}</span><small>{item.options.length}</small></button>)}</nav>
      </aside>

      <div className="settings-workspace surface">
        <header className="choice-header">
          <div className="choice-icon"><Database size={20} /></div>
          <div><span>{active.entity}.{active.attribute}</span><h2>{active.label}</h2><p>{active.description}</p></div>
          <div className={`source-badge ${mockMode ? "mock" : "live"}`}><span />{mockMode ? "Mock local" : "Dataverse"}</div>
        </header>

        {active.isManaged && <div className="settings-warning"><LockKeyhole size={18} /><div><strong>Componente gerenciado</strong><span>Este choice precisa ser alterado na solução de origem.</span></div></div>}
        {active.mode === "labels" && <div className="settings-note"><ShieldCheck size={18} /><div><strong>Fluxo protegido</strong><span>Você pode ajustar os nomes, mas os valores e a estrutura são preservados para manter as regras operacionais.</span></div></div>}

        {active.mode === "full" && !active.isManaged && <div className="choice-create">
          <div><strong>Nova opção</strong><span>O Dataverse define o valor numérico automaticamente.</span></div>
          <div className="choice-create-control"><input value={newLabel} maxLength="100" placeholder={`Adicionar em ${active.label.toLocaleLowerCase("pt-BR")}`} onChange={(event) => { setNewLabel(event.target.value); setValidation(""); }} onKeyDown={(event) => { if (event.key === "Enter") createOption(); }} /><button className="primary-button compact" onClick={createOption} disabled={saving}><Plus size={17} />Adicionar</button></div>
        </div>}

        {validation && <div className="choice-validation">{validation}</div>}

        <div className="choice-list">
          <div className="choice-list-head"><span>Opção</span><span>Valor Dataverse</span><span>Ações</span></div>
          {active.options.map((option) => <div className={`choice-row ${confirming === option.value ? "confirming" : ""}`} key={option.value}>
            <div className="choice-name">
              {editing?.value === option.value ? <input autoFocus value={editing.label} maxLength="100" onChange={(event) => { setEditing({ ...editing, label: event.target.value }); setValidation(""); }} onKeyDown={(event) => { if (event.key === "Enter") updateOption(); if (event.key === "Escape") setEditing(null); }} /> : <><strong>{option.label}</strong>{option.locked && <small><ShieldCheck size={13} />Protegida</small>}</>}
            </div>
            <code>{option.value}</code>
            <div className="choice-actions">
              {editing?.value === option.value ? <><button className="icon-button success" aria-label="Salvar nome" onClick={updateOption} disabled={saving}><Check size={17} /></button><button className="icon-button" aria-label="Cancelar edição" onClick={() => setEditing(null)}><X size={17} /></button></> : <>
                <button className="icon-button" aria-label={`Renomear ${option.label}`} title="Renomear" disabled={saving || active.isManaged} onClick={() => { setEditing({ value: option.value, label: option.label }); setConfirming(null); setValidation(""); }}><Pencil size={16} /></button>
                {active.mode === "full" && !option.locked && <button className="icon-button danger" aria-label={`Excluir ${option.label}`} title="Excluir" disabled={saving || active.isManaged} onClick={() => { setConfirming(option.value); setEditing(null); }}><Trash2 size={16} /></button>}
              </>}
            </div>
            {confirming === option.value && <div className="choice-confirm"><div><strong>Excluir “{option.label}”?</strong><span>A exclusão só continuará se nenhum registro estiver usando esta opção.</span></div><button className="danger-button" onClick={() => deleteOption(option)} disabled={saving}>Excluir</button><button className="text-button" onClick={() => setConfirming(null)}>Cancelar</button></div>}
          </div>)}
        </div>
      </div>
    </div>
  </section>;
}
