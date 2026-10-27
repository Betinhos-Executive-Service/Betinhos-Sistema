// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { PRIORITY_OPTIONS, TASK_FILTER_STATUS_OPTIONS } from '../constants'
import { buildAssigneeOptions } from '../domain/domain'
import { createDefaultFilters } from '../pageHelpers'
import { SearchableMultiSelect } from './SearchableSelect'
import { ChevronDown, ListFilter, Plus, RotateCcw, Search, X } from 'lucide-react'
import { memo, useMemo, useState } from 'react'


export const FilterBar = memo(function FilterBar({
  filters,
  setFilters,
  onCreate,
  employees = [],
  teams = [],
  personalTags = [],
}: any) {
  const [expanded, setExpanded] = useState<any>(false);
  const assigneeOptions = useMemo(
    () => buildAssigneeOptions(employees),
    [employees],
  );
  const teamOptions = useMemo(
    () => teams.map((team: any) => ({ value: team.name, label: team.name })),
    [teams],
  );
  const activeFilterCount = [
    filters.query?.trim(),
    filters.assignee?.length,
    filters.status?.length,
    filters.priority?.length,
    Array.isArray(filters.team) ? filters.team.length : filters.team,
    filters.personalTag?.length,
  ].filter(Boolean).length;
  return (
    <div className={`filter-bar ${expanded ? "is-expanded" : "is-collapsed"}`}>
      <button
        className="filter-toggle"
        type="button"
        onClick={() => setExpanded((value: any) => !value)}
        aria-expanded={expanded}
      >
        <ListFilter size={15} />
        <span>Filtros</span>
        {activeFilterCount > 0 && <b>{activeFilterCount}</b>}
        <ChevronDown size={15} />
      </button>
      <div className="search-field filter-search">
        <Search size={16} />
        <input
          value={filters.query}
          onChange={(event) =>
            setFilters((current: any) => ({ ...current, query: event.target.value }))
          }
          placeholder="Buscar tarefas, cotações, qualidade ou pessoas"
        />
        {filters.query && (
          <button
            className="search-field-clear"
            type="button"
            aria-label="Limpar busca"
            title="Limpar busca"
            onClick={() => setFilters((current: any) => ({ ...current, query: "" }))}
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="filter-bar-content">
        <SearchableMultiSelect
          value={filters.assignee}
          onChange={(value: any) =>
            setFilters((current: any) => ({ ...current, assignee: value }))
          }
          placeholder="Todos os responsáveis"
          options={assigneeOptions.map((name) => ({
            value: name,
            label: name,
          }))}
        />
        <SearchableMultiSelect
          value={filters.status}
          onChange={(value: any) =>
            setFilters((current: any) => ({ ...current, status: value }))
          }
          placeholder="Todos os status"
          options={TASK_FILTER_STATUS_OPTIONS}
        />
        <SearchableMultiSelect
          value={filters.priority}
          onChange={(value: any) =>
            setFilters((current: any) => ({ ...current, priority: value }))
          }
          placeholder="Todas as prioridades"
          options={PRIORITY_OPTIONS}
        />
        <SearchableMultiSelect
          value={Array.isArray(filters.team) ? filters.team : filters.team ? [filters.team] : []}
          onChange={(value: any) =>
            setFilters((current: any) => ({ ...current, team: value }))
          }
          placeholder="Todas as equipes"
          options={teamOptions}
        />
        <SearchableMultiSelect
          className="personal-tag-filter-select"
          value={filters.personalTag || []}
          onChange={(value: any) => setFilters((current: any) => ({ ...current, personalTag: value }))}
          placeholder="Minhas tags"
          options={personalTags.filter((tag: any) => !tag.archived).map((tag: any) => ({ value: tag.id, label: tag.name, color: tag.color }))}
        />
        {activeFilterCount > 0 && (
          <button
            className="button button-quiet"
            type="button"
            onClick={() => setFilters(createDefaultFilters())}
          >
            <RotateCcw size={15} />
            Limpar filtros
          </button>
        )}
        <button
          className="button button-primary"
          type="button"
          onClick={onCreate}
        >
          <Plus size={16} />
          Nova tarefa
        </button>
      </div>
    </div>
  );
});
