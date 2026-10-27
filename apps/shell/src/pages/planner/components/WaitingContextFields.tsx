// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { TEAM_OPTIONS } from '../constants'
import { normalizeWaitingContext } from '../domain/domain'
import { InputSelect } from './AssignmentFields'
import { DateInput } from './DateInput'
import { ArrowUpRight, UserRound, Users } from 'lucide-react'


export function WaitingContextFields({ value, onChange, employees = [], teams = [], error = "" }: any) {
  const context = normalizeWaitingContext(value);
  const employeeOptions = employees
    .filter((employee: any) => employee?.id && employee?.name)
    .map((employee: any) => ({ value: employee.id, label: employee.name }));
  const targetOptions = context.onType === "team"
    ? (teams.length ? teams.map((team: any) => ({ value: team.id, label: team.name })) : TEAM_OPTIONS.map((team) => ({ value: team, label: team })))
    : employeeOptions;
  const update = (patch: any) => onChange({ ...context, ...patch });
  const selectTarget = (ids: any) => {
    const selectedIds = Array.isArray(ids) ? ids : ids ? [ids] : [];
    const selectedNames = selectedIds
      .map((id) => targetOptions.find((item: any) => String(item.value) === String(id))?.label)
      .filter(Boolean);
    update({ onIds: selectedIds, onNames: selectedNames, onId: selectedIds[0] || "", onName: selectedNames.join(", ") });
  };
  return (
    <section className="waiting-context" aria-labelledby="waiting-context-title">
      <div className="waiting-context-heading">
        <div>
          <span className="status-field-label">Contexto do retorno</span>
          <strong id="waiting-context-title">O que está sendo aguardado?</strong>
        </div>
        <span>O prazo do retorno é opcional; sem ele, entra na fila de acompanhamento</span>
      </div>
      <label>
        O que está sendo aguardado?
        <input
          value={context.subject}
          onChange={(event) => update({ subject: event.target.value })}
          placeholder="Ex.: confirmação da segunda van"
        />
      </label>
      <div className="waiting-context-grid">
        <div className="waiting-context-recipient-field">
          <div className="waiting-context-recipient-header">
            <span>{context.onType === "external" ? "Contato externo" : context.onType === "team" ? "Equipe responsável" : "Responsáveis"}</span>
            <div className="assignment-mode waiting-context-type-picker" role="group" aria-label="Tipo de destinatário">
            <button
              type="button"
              className={context.onType === "employee" ? "is-selected" : ""}
              aria-label="Funcionário"
              aria-pressed={context.onType === "employee"}
              title="Funcionário"
              onClick={() => update({ onType: "employee", onIds: [], onNames: [], onId: "", onName: "" })}
            >
              <UserRound size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={context.onType === "team" ? "is-selected" : ""}
              aria-label="Equipe"
              aria-pressed={context.onType === "team"}
              title="Equipe"
              onClick={() => update({ onType: "team", onIds: [], onNames: [], onId: "", onName: "" })}
            >
              <Users size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={context.onType === "external" ? "is-selected" : ""}
              aria-label="Externo"
              aria-pressed={context.onType === "external"}
              title="Cliente ou fornecedor"
              onClick={() => update({ onType: "external", onIds: [], onNames: [], onId: "", onName: "" })}
            >
              <ArrowUpRight size={15} aria-hidden="true" />
            </button>
            </div>
          </div>
          <label className="waiting-context-recipient-control">
            <span className="sr-only">{context.onType === "external" ? "Quem está sendo aguardado?" : "De quem?"}</span>
            {context.onType === "external" ? (
              <input
                value={context.onName}
                onChange={(event) => update({ onIds: [], onNames: event.target.value.split(",").map((item) => item.trim()).filter(Boolean), onId: "", onName: event.target.value })}
                placeholder="Ex.: cliente ou fornecedor"
              />
            ) : (
              <InputSelect
                value={context.onIds}
                onChange={selectTarget}
                options={targetOptions}
                placeholder={context.onType === "team" ? "Selecione uma ou mais equipes" : "Selecione uma ou mais pessoas"}
                multiple
              />
            )}
          </label>
        </div>
        <label className="waiting-context-deadline-field">
          Retorno previsto
          <DateInput
            type="date"
            value={context.expectedDate}
            onChange={(event: any) => update({ expectedDate: event.target.value })}
          />
        </label>
      </div>
      <label>
        Observação
        <textarea
          value={context.note}
          onChange={(event) => update({ note: event.target.value })}
          rows={2}
          placeholder="Adicione o último contexto da cobrança"
        />
      </label>
      {error && <div className="field-error" role="alert">{error}</div>}
    </section>
  );
}
