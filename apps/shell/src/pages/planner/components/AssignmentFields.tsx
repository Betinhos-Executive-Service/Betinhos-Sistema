// Porte de Tela Planner/src/AssignmentFields.jsx (sem mudança de comportamento).
import React, { useMemo } from "react";
import { UserRound, Users } from "lucide-react";
import {
  responsibilityFromIds,
  resolveTaskAssignment,
} from '../domain/domain';
import SearchableSelect, {
  SearchableMultiSelect,
} from './SearchableSelect';

export function InputSelect({
  value,
  onChange,
  options,
  placeholder = "Selecione",
  disabled = false,
  multiple = Array.isArray(value),
}: any) {
  const normalizedOptions = useMemo(
    () =>
      options.map((option: any) =>
        typeof option === "string" ? { value: option, label: option } : option,
      ),
    [options],
  );
  const remoteSearch = options.find(
    (option: any) => typeof option?._remoteSearch === "function",
  )?._remoteSearch;
  return multiple ? (
    <SearchableMultiSelect
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      options={normalizedOptions}
    />
  ) : (
    <SearchableSelect
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      options={normalizedOptions}
      onQueryChange={remoteSearch}
    />
  );
}

export default function AssignmentFields({
  form,
  setForm,
  employees = [],
  teams = [],
}: any) {
  const assignmentMode = form.assignmentMode === "team" ? "team" : "people";
  const employeeById = new Map(
    employees.map((employee: any) => [String(employee.id), employee]),
  );
  const employeeOptions = employees
    .filter((employee: any) => employee?.id && employee?.name)
    .map((employee: any) => ({ value: employee.id, label: employee.name }));
  const teamOptions = teams.filter((team: any) => (team.memberIds || []).length > 0).map((team: any) => ({
    value: team.id,
    label: team.name,
    subtitle: String((team.memberIds || []).length) +
      ((team.memberIds || []).length === 1 ? " membro" : " membros"),
  }));
  const selectedTeamIds = Array.isArray(form.teamIds)
    ? form.teamIds
    : form.teamId
      ? [form.teamId]
      : [];
  const selectedTeams = teams.filter((team: any) =>
    selectedTeamIds.some((id: any) => String(id) === String(team.id)),
  );
  const primaryAssigneeId = form.primaryAssigneeId || form.assigneeId || form.assigneeIds?.[0] || "";
  const selectedConsultantIds = (form.consultantIds || (form.assigneeIds || []).filter((id: any) => String(id) !== String(primaryAssigneeId)))
    .filter((id: any) => String(id) !== String(primaryAssigneeId));
  const displayName = (id: any) => {
    const employee = employeeById.get(String(id)) as any;
    return employee?.apelido || employee?.name;
  };
  const primaryName = displayName(primaryAssigneeId) || "Não definido";
  const consultantNames = selectedConsultantIds
    .map(displayName)
    .filter(Boolean);
  const selectMode = (mode: any) => {
    setForm((current: any) => ({
      ...current,
      assignmentMode: mode === "team" ? "team" : "people",
      teamIds: [],
      teamNames: [],
      teamId: "",
      teamName: "",
      assigneeName: [],
      assigneeIds: [],
      primaryAssigneeId: "",
      consultantIds: [],
    }));
  };
  const selectTeam = (teamIds: any) => {
    const selectedIds = Array.isArray(teamIds)
      ? teamIds
      : teamIds
        ? [teamIds]
        : [];
    const selected = teams.filter((team: any) =>
      selectedIds.some((id) => String(id) === String(team.id)),
    );
    const assignment = resolveTaskAssignment({ assignmentMode: "team", teamIds: selectedIds }, teams, employees);
    setForm((current: any) => ({
      ...current,
      assignmentMode: "team",
      teamIds: selectedIds,
      teamNames: selected.map((team: any) => team.name),
      teamId: selectedIds[0] || "",
      teamName: selected.map((team: any) => team.name).join(", "),
      assigneeIds: assignment.assigneeIds,
      assigneeName: assignment.assigneeNames,
      primaryAssigneeId: assignment.primaryAssigneeId,
      consultantIds: assignment.consultantIds,
    }));
  };
  const commitPeople = (primaryId: any, consultantIds: any) => {
    const responsibility = responsibilityFromIds([primaryId, ...(consultantIds || [])], primaryId);
    const selectedNames = responsibility.assigneeIds.map((id) => (employeeById.get(String(id)) as any)?.name).filter(Boolean);
    setForm((current: any) => ({
      ...current,
      assignmentMode: "people",
      teamIds: [],
      teamNames: [],
      teamId: "",
      teamName: "",
      assigneeName: selectedNames,
      assigneeIds: responsibility.assigneeIds,
      primaryAssigneeId: responsibility.primaryAssigneeId,
      consultantIds: responsibility.consultantIds,
    }));
  };
  const selectPrimary = (id: any) => commitPeople(id, selectedConsultantIds);
  const selectConsultants = (ids: any) => commitPeople(primaryAssigneeId, Array.isArray(ids) ? ids : []);
  return (
    <div className="assignment-field">
      <div className="assignment-field-header">
        <span>{assignmentMode === "team" ? "Equipe" : "Responsável"}</span>
        <div
          className="assignment-mode"
          role="group"
          aria-label="Tipo de atribuição"
        >
          <button
            type="button"
            className={assignmentMode === "people" ? "is-selected" : ""}
            aria-label="Pessoas"
            title="Pessoas"
            aria-pressed={assignmentMode === "people"}
            onClick={() => selectMode("people")}
          >
            <UserRound size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={assignmentMode === "team" ? "is-selected" : ""}
            aria-label="Equipe"
            title="Equipe"
            aria-pressed={assignmentMode === "team"}
            onClick={() => selectMode("team")}
          >
            <Users size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      {assignmentMode === "team" ? (
        <>
          <label className="assignment-control">
            <span className="sr-only">Equipe</span>
            <InputSelect
              value={selectedTeamIds}
              onChange={selectTeam}
              options={teamOptions}
              placeholder={
                teams.length
                  ? "Selecione uma ou mais equipes"
                  : "Nenhuma equipe cadastrada"
              }
              disabled={!teams.length}
              multiple
            />
          </label>
          {selectedTeams.length > 0 && (primaryName !== "Não definido" || consultantNames.length > 0) && (
            <div
              className="assignment-summary"
              title={[
                primaryName !== "Não definido" && "Principal: " + primaryName,
                consultantNames.length > 0 && "Consultores: " + consultantNames.join(", "),
              ].filter(Boolean).join(" · ")}
            >
              <span className="assignment-stack" aria-hidden="true">
                {[primaryName !== "Não definido" ? primaryName : null, ...consultantNames]
                  .filter(Boolean)
                  .slice(0, 5)
                  .map((name: any, index: number) => (
                    <span key={name} className={"avatar avatar-small" + (index === 0 && primaryName !== "Não definido" ? " is-primary" : "")}>
                      {String(name).split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                    </span>
                  ))}
              </span>
              <span className="assignment-summary-text">
                {primaryName !== "Não definido" && <strong>{primaryName}</strong>}
                {consultantNames.length > 0 &&
                  (primaryName !== "Não definido" ? " e " : "") +
                    consultantNames.length +
                    (consultantNames.length === 1 ? " consultor" : " consultores")}
              </span>
            </div>
          )}
        </>
      ) : (
        <>
          <label className="assignment-control">
            <span className="sr-only">Responsável principal</span>
            <InputSelect
            value={primaryAssigneeId}
            onChange={selectPrimary}
            options={employeeOptions}
            placeholder="Escolha quem responde pela task"
          />
          </label>
          <label className="assignment-control">
            <span>Consultores</span>
            <InputSelect
              value={selectedConsultantIds}
              onChange={selectConsultants}
              options={employeeOptions.filter((option: any) => String(option.value) !== String(primaryAssigneeId))}
              placeholder={primaryAssigneeId ? "Adicione consultores" : "Escolha o principal primeiro"}
              disabled={!primaryAssigneeId}
              multiple
            />
          </label>
        </>
      )}
    </div>
  );
}
