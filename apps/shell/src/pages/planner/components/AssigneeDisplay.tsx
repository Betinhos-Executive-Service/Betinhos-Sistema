// Porte de Tela Planner/src/AssigneeDisplay.jsx (sem mudança de comportamento).
import React from "react";
import { TeamIcon } from './teamIcons';

function normalizeProfiles(value: any) {
  const values = Array.isArray(value) ? value : String(value || "Não atribuído").split(/\s*,\s*/);
  const profiles = values.map((item) => typeof item === "object"
    ? { id: item.id || item.userId || item.name, name: String(item.name || "").trim() }
    : { id: item, name: String(item || "").trim() })
    .filter((profile) => profile.name);
  const unique = [...new Map(profiles.map((profile) => [profile.id || profile.name, profile])).values()];
  return unique.length ? unique : [{ id: "unassigned", name: "Não atribuído" }];
}

export default function AssigneeDisplay({ value, small = false, team = null, teamName = "", primaryName = "", consultantNames = [] }: any) {
  if (team || teamName) {
    const label = team?.name || teamName || "Equipe responsável";
    return <span className="assignee-display assignee-display-team" title={`Equipe responsável: ${label}`} aria-label={`Equipe responsável: ${label}`}>
      <span className={`team-assignee-icon ${small ? "team-assignee-icon-small" : ""}`} aria-hidden="true"><TeamIcon name={team?.iconName} size={small ? 14 : 16} /></span>
      <span className="assignee-name">{label}</span>
    </span>;
  }
  const profiles = normalizeProfiles(value);
  const names = profiles.map((profile) => profile.name);
  const responsibilityNames = primaryName ? [primaryName, ...consultantNames] : names;
  const displayNames = responsibilityNames.map((name) => String(name || "").trim().split(/\s+/)[0]).filter(Boolean);
  const label = displayNames.join(" | ") || "Não atribuído";

  return <span className="assignee-display" title={label} aria-label={`Responsáveis: ${label}`}>
    <span className={`team-assignee-icon ${small ? "team-assignee-icon-small" : ""}`} aria-hidden="true"><TeamIcon name="users" size={small ? 14 : 16} /></span>
    <span className="assignee-name">
      {displayNames.length ? displayNames.map((name, index) => (
        <React.Fragment key={`${name}-${index}`}>
          {index > 0 && " | "}
          {index === 0 ? <strong className="assignee-primary-name">{name}</strong> : name}
        </React.Fragment>
      )) : label}
    </span>
  </span>;
}
