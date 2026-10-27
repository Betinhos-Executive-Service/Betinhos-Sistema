// Porte de Tela Planner/src/SearchableSelect.jsx (sem mudança de comportamento).
import { plannerPortalRoot } from './portalRoot'
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { preservePanelScroll } from '../domain/selectScroll';

export function normalizeSearchText(value: any) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function searchTokens(value: any) {
  return String(value || "")
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizedSearchMatches(normalizedText: any, normalizedQuery: any, queryTokens: any) {
  if (!normalizedQuery) return true;
  if (!normalizedText) return false;
  if (normalizedText.includes(normalizedQuery)) return true;
  const tokens = queryTokens || searchTokens(normalizedQuery);
  return (
    tokens.length > 0 && tokens.every((token: any) => normalizedText.includes(token))
  );
}

export function searchableTextMatches(text: any, query: any) {
  const normalizedText = normalizeSearchText(text);
  const normalizedQuery = normalizeSearchText(query);
  return (normalizedSearchMatches as any)(normalizedText, normalizedQuery);
}

function shouldAutofocusSearch() {
  try {
    return !(
      window.matchMedia?.("(pointer: coarse)")?.matches ||
      window.matchMedia?.("(hover: none)")?.matches
    );
  } catch (_: any) {
    return true;
  }
}

function viewportMetrics() {
  const visual = window.visualViewport;
  return {
    width: Math.floor(
      visual?.width ||
        window.innerWidth ||
        document.documentElement.clientWidth ||
        0,
    ),
    height: Math.floor(
      visual?.height ||
        window.innerHeight ||
        document.documentElement.clientHeight ||
        0,
    ),
    offsetLeft: Math.floor(visual?.offsetLeft || 0),
    offsetTop: Math.floor(visual?.offsetTop || 0),
  };
}

function referenceIsHidden(element: any, rect: any, viewport: any) {
  const viewportTop = viewport.offsetTop;
  const viewportBottom = viewport.offsetTop + viewport.height;
  const viewportLeft = viewport.offsetLeft;
  const viewportRight = viewport.offsetLeft + viewport.width;
  if (
    rect.bottom <= viewportTop ||
    rect.top >= viewportBottom ||
    rect.right <= viewportLeft ||
    rect.left >= viewportRight
  )
    return true;

  let ancestor = element.parentElement;
  while (ancestor && ancestor !== document.body) {
    const style = window.getComputedStyle(ancestor);
    const clipsContent = `${style.overflow} ${style.overflowX} ${style.overflowY}`.match(
      /(?:auto|scroll|hidden|clip)/,
    );
    if (clipsContent) {
      const ancestorRect = ancestor.getBoundingClientRect();
      if (
        rect.bottom <= ancestorRect.top ||
        rect.top >= ancestorRect.bottom ||
        rect.right <= ancestorRect.left ||
        rect.left >= ancestorRect.right
      )
        return true;
    }
    if (style.position === "fixed") break;
    ancestor = ancestor.parentElement;
  }
  return false;
}

function focusAdjacentControl(trigger: any, direction: any) {
  const scope = trigger?.closest(
    "form, .dashboard-filters, .filter-surface, .form-stack, .quote-v3-drawer-body",
  );
  if (!scope) return;
  const controls = [
    ...scope.querySelectorAll(
      "input:not([type='hidden']), textarea, [data-searchable-select-trigger], button:not([type='submit'])",
    ),
  ].filter(
    (control) =>
      !control.disabled &&
      control.tabIndex >= 0 &&
      control.offsetParent !== null &&
      !control.closest("[hidden]"),
  );
  const currentIndex = controls.indexOf(trigger);
  const nextIndex =
    currentIndex >= 0
      ? currentIndex + direction
      : direction > 0
        ? 0
        : controls.length - 1;
  controls[Math.max(0, Math.min(controls.length - 1, nextIndex))]?.focus();
}

let selectSequence = 0;
const CUSTOM_SELECT_OPEN_EVENT = "betinhos:custom-select-open";

export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = "Selecione",
  disabled = false,
  required = false,
  clearable = true,
  multiple = false,
  className = "",
  variant = "",
  displayPrefix = "",
  icon = null,
  name,
  "aria-label": ariaLabel,
  onQueryChange,
}: any) {
  const rootRef = useRef<any>(null);
  const triggerRef = useRef<any>(null);
  const panelRef = useRef<any>(null);
  const panelScrollTopRef = useRef<any>(0);
  const positionFrameRef = useRef<any>(0);
  const searchRef = useRef<any>(null);
  const optionRefs = useRef<any>([]);
  const suppressFocusRef = useRef<any>(false);
  const focusSearchOnOpenRef = useRef<any>(true);
  const focusOptionOnOpenRef = useRef<any>(false);
  const initialHighlightRef = useRef<any>(null);
  const [open, setOpen] = useState<any>(false);
  const [hasOpened, setHasOpened] = useState<any>(false);
  const [query, setQuery] = useState<any>("");
  const [highlightedIndex, setHighlightedIndex] = useState<any>(0);
  const [panelId] = useState<any>(() => {
    selectSequence += 1;
    return `custom-options-${selectSequence}`;
  });

  const normalizedOptions = useMemo(
    () =>
      options.map((option: any) => ({
        value: String(option?.value ?? ""),
        label: String(option?.label ?? ""),
        subtitle: option?.subtitle ? String(option.subtitle) : "",
        color: option?.color ? String(option.color) : "",
        search: String(option?.search ?? ""),
        searchText: normalizeSearchText(
          `${option?.label ?? ""} ${option?.search ?? ""}`,
        ),
        disabled: Boolean(option?.disabled),
      })),
    [options],
  );
  const selectedValues = useMemo(
    () =>
      multiple
        ? [...new Set((Array.isArray(value) ? value : []).map(String))]
        : [String(value ?? "")],
    [multiple, value],
  );
  const selectedValueSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const selectedOptions = useMemo(
    () => normalizedOptions.filter((option: any) => selectedValueSet.has(option.value)),
    [normalizedOptions, selectedValueSet],
  );
  const selectedOption = selectedOptions[0];
  const normalizedQuery = useMemo(() => normalizeSearchText(query), [query]);
  const queryTokens = useMemo(
    () => searchTokens(normalizedQuery),
    [normalizedQuery],
  );
  const selectableOptions = useMemo(
    () => normalizedOptions.filter((option: any) => option.value !== ""),
    [normalizedOptions],
  );
  const enabledSelectableOptions = useMemo(
    () => selectableOptions.filter((option: any) => !option.disabled),
    [selectableOptions],
  );
  const visibleOptions = useMemo(() => {
    if (!normalizedQuery) return selectableOptions;
    return selectableOptions.filter((option: any) =>
      normalizedSearchMatches(option.searchText, normalizedQuery, queryTokens),
    );
  }, [normalizedQuery, queryTokens, selectableOptions]);
  const hasEmptyOption = useMemo(
    () => normalizedOptions.some((option: any) => option.value === ""),
    [normalizedOptions],
  );
  const canClear =
    clearable &&
    !required &&
    !disabled &&
    (multiple
      ? selectedValues.length > 0
      : hasEmptyOption && String(value ?? "") !== "");

  const updatePosition = useCallback(() => {
    if (!open || !triggerRef.current || !panelRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewport = viewportMetrics();
    const safeInset = 8;
    if (referenceIsHidden(triggerRef.current, rect, viewport)) {
      setOpen(false);
      optionRefs.current = [];
      return;
    }
    const availableWidth = Math.max(120, viewport.width - safeInset * 2);
    const width = Math.max(
      120,
      Math.min(availableWidth, Math.max(140, Math.ceil(rect.width || 120))),
    );
    const maxHeight = Math.min(
      260,
      Math.max(120, Math.floor(viewport.height * 0.42)),
    );
    const viewportBottom = viewport.offsetTop + viewport.height;
    const viewportRight = viewport.offsetLeft + viewport.width;
    const spaceBelow = viewportBottom - rect.bottom - safeInset;
    const spaceAbove = rect.top - viewport.offsetTop - safeInset;
    const menuHeight = Math.min(
      maxHeight,
      Math.max(80, panelRef.current.scrollHeight || 0),
    );
    const showAbove =
      spaceBelow < Math.min(maxHeight, 180) && spaceAbove > spaceBelow;
    const top = showAbove
      ? Math.max(
          viewport.offsetTop + safeInset,
          rect.top - menuHeight - safeInset,
        )
      : Math.min(
          viewportBottom - menuHeight - safeInset,
          rect.bottom + safeInset,
        );
    const left = Math.max(
      viewport.offsetLeft + safeInset,
      Math.min(rect.left, viewportRight - width - safeInset),
    );
    panelRef.current.style.left = `${left}px`;
    panelRef.current.style.top = `${Math.max(viewport.offsetTop + safeInset, top)}px`;
    panelRef.current.style.width = `${width}px`;
    panelRef.current.style.maxHeight = `${maxHeight}px`;
  }, [open]);

  const schedulePosition = useCallback(() => {
    if (positionFrameRef.current) return;
    positionFrameRef.current = window.requestAnimationFrame(() => {
      positionFrameRef.current = 0;
      updatePosition();
    });
  }, [updatePosition]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();
    return undefined;
  }, [open, query, visibleOptions.length, updatePosition]);

  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  useEffect(() => {
    if (!open) return undefined;
    const closeWhenAnotherSelectOpens = (event: any) => {
      if (event.detail !== panelId) {
        setOpen(false);
        optionRefs.current = [];
      }
    };
    const closeIfOutside = (event: any) => {
      if (
        rootRef.current?.contains(event.target) ||
        panelRef.current?.contains(event.target)
      )
        return;
      setOpen(false);
    };
    const reposition = (event: any) => {
      if (event.target === panelRef.current) return;
      schedulePosition();
    };
    const closeOnEscape = (event: any) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener(CUSTOM_SELECT_OPEN_EVENT, closeWhenAnotherSelectOpens);
    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("focusin", closeIfOutside);
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    return () => {
      window.removeEventListener(CUSTOM_SELECT_OPEN_EVENT, closeWhenAnotherSelectOpens);
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("focusin", closeIfOutside);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
      if (positionFrameRef.current) {
        window.cancelAnimationFrame(positionFrameRef.current);
        positionFrameRef.current = 0;
      }
    };
  }, [open, schedulePosition]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return undefined;
    }
    const selectedIndex = visibleOptions.findIndex((option: any) =>
      selectedValueSet.has(option.value),
    );
    const nextHighlightedIndex =
      initialHighlightRef.current ?? Math.max(0, selectedIndex);
    setHighlightedIndex(nextHighlightedIndex);
    initialHighlightRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      if (focusOptionOnOpenRef.current) {
        focusOptionOnOpenRef.current = false;
        optionRefs.current[
          Math.max(0, nextHighlightedIndex)
        ]?.focus();
      } else if (focusSearchOnOpenRef.current && shouldAutofocusSearch())
        searchRef.current?.focus();
      else triggerRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const openSelect = (
    focusSearch = true,
    initialHighlight: any = null,
    focusOption = false,
  ) => {
    if (disabled) return;
    panelScrollTopRef.current = 0;
    if (panelRef.current) panelRef.current.scrollTop = 0;
    window.dispatchEvent(
      new CustomEvent(CUSTOM_SELECT_OPEN_EVENT, { detail: panelId }),
    );
    focusSearchOnOpenRef.current = focusSearch;
    focusOptionOnOpenRef.current = focusOption;
    initialHighlightRef.current = initialHighlight;
    setHasOpened(true);
    setQuery("");
    setOpen(true);
  };

  const closeSelect = () => {
    setOpen(false);
    optionRefs.current = [];
  };

  const selectOption = (option: any) => {
    if (disabled || option.disabled) return;
    if (multiple) {
      preservePanelScroll(
        panelRef.current,
        panelScrollTopRef.current,
        () =>
          onChange(
            selectedValueSet.has(option.value)
              ? selectedValues.filter((value) => value !== option.value)
              : [...selectedValues, option.value],
          ),
        window.requestAnimationFrame,
      );
      return;
    }
    onChange(option.value);
    closeSelect();
    suppressFocusRef.current = true;
    triggerRef.current?.focus();
    window.setTimeout(() => {
      suppressFocusRef.current = false;
    }, 0);
  };
  const allOptionsSelected =
    multiple &&
    enabledSelectableOptions.length > 0 &&
    enabledSelectableOptions.every((option: any) =>
      selectedValueSet.has(option.value),
    );
  const toggleAllOptions = () =>
    preservePanelScroll(
      panelRef.current,
      panelScrollTopRef.current,
      () =>
        onChange(
          allOptionsSelected
            ? []
            : enabledSelectableOptions.map((option: any) => option.value),
        ),
      window.requestAnimationFrame,
    );

  const moveHighlight = (direction: any) => {
    if (!visibleOptions.length) return;
    const activeElement = document.activeElement;
    const currentIndex = optionRefs.current.indexOf(activeElement);
    const baseIndex = currentIndex >= 0 ? currentIndex : highlightedIndex;
    const nextIndex =
      (baseIndex + direction + visibleOptions.length) % visibleOptions.length;
    setHighlightedIndex(nextIndex);
    window.requestAnimationFrame(() => optionRefs.current[nextIndex]?.focus());
  };

  const handleTriggerKeyDown = (event: any) => {
    if (event.key === "Tab") {
      closeSelect();
      return;
    }
    if ([" ", "Enter", "ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      if (!open) {
        openSelect(
          false,
          event.key === "ArrowUp"
            ? Math.max(0, visibleOptions.length - 1)
            : null,
          event.key === "ArrowDown" || event.key === "ArrowUp",
        );
        return;
      }
      if (event.key === "ArrowDown") moveHighlight(1);
      if (event.key === "ArrowUp") moveHighlight(-1);
      if (event.key === "Enter" || event.key === " ") {
        const option = visibleOptions[highlightedIndex];
        if (option) selectOption(option);
      }
    }
  };

  const handleSearchKeyDown = (event: any) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter") {
      const option = visibleOptions[highlightedIndex] || visibleOptions[0];
      if (option) {
        event.preventDefault();
        selectOption(option);
      }
    } else if (event.key === "Tab") {
      event.preventDefault();
      closeSelect();
      focusAdjacentControl(triggerRef.current, event.shiftKey ? -1 : 1);
    }
  };

  const triggerLabel = displayPrefix + (multiple
    ? selectedOptions.length
      ? selectedOptions.length === 1
        ? selectedOptions[0].label
        : `${selectedOptions[0].label} e mais ${selectedOptions.length - 1}`
      : placeholder
    : selectedOption?.label || placeholder);
  const rootClass = [
    "custom-select",
    variant && `custom-select--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const panelClass = [
    "custom-select-panel",
    variant && `custom-select-panel--${variant}`,
    visibleOptions.length === 0 && "is-empty",
    open && "is-open",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={rootRef} className={`${rootClass}${open ? " is-open" : ""}`}>
      <select
        className="custom-select-native"
        name={name}
        multiple={multiple}
        value={multiple ? selectedValues : String(value ?? "")}
        disabled={disabled}
        required={required}
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) =>
          onChange(
            multiple
              ? [...event.target.selectedOptions].map((option) => option.value)
              : event.target.value,
          )
        }
      >
        {normalizedOptions.map((option: any) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
      <button
        ref={triggerRef}
        type="button"
        className="custom-select-trigger"
        data-searchable-select-trigger="true"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        onPointerDown={() => {
          suppressFocusRef.current = true;
          window.setTimeout(() => {
            suppressFocusRef.current = false;
          }, 0);
        }}
        onPointerCancel={() => {
          suppressFocusRef.current = false;
        }}
        onFocus={() => {
          if (
            !suppressFocusRef.current &&
            !open &&
            !disabled &&
            shouldAutofocusSearch()
          )
            openSelect(true);
        }}
        onClick={() => {
          if (open) closeSelect();
          else openSelect(true);
          suppressFocusRef.current = false;
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        {icon}
        <span
          className={`custom-select-value${(multiple ? selectedValues.length === 0 : String(value ?? "") === "") ? " is-placeholder" : ""}`}
        >
          {multiple && selectedOptions.length > 0 ? (
            <span className="custom-select-multiple-value">
              {selectedOptions[0].color && (
                <span className="custom-select-selected-dot" style={{ "--custom-select-option-color": selectedOptions[0].color }} aria-hidden="true" />
              )}
              <span className="custom-select-multiple-primary">
                {selectedOptions[0].label}
              </span>
              {selectedOptions.length > 1 && (
                <span className="custom-select-multiple-count">
                  + {selectedOptions.length - 1} selecionado{selectedOptions.length > 2 ? "s" : ""}
                </span>
              )}
            </span>
          ) : (
            triggerLabel
          )}
        </span>
        <span
          className="custom-select-clear"
          role="button"
          tabIndex={canClear ? 0 : -1}
          aria-label="Limpar seleção"
          hidden={!canClear}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onChange(multiple ? [] : "");
            closeSelect();
            triggerRef.current?.focus();
          }}
          onKeyDown={(event) => {
            if (["Enter", " "].includes(event.key)) {
              event.preventDefault();
              event.stopPropagation();
              onChange(multiple ? [] : "");
              closeSelect();
              triggerRef.current?.focus();
            }
          }}
        />
        <span className="custom-select-caret" aria-hidden="true" />
      </button>
      {hasOpened &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            className={panelClass}
            role="listbox"
            aria-multiselectable={multiple || undefined}
            aria-hidden={!open}
            onScroll={(event) => {
              panelScrollTopRef.current = event.currentTarget.scrollTop;
            }}
          >
            <div className="custom-select-search-row">
              <input
                ref={searchRef}
                className="custom-select-search"
                type="text"
                value={query}
                placeholder="Pesquisar"
                autoComplete="off"
                spellCheck="false"
                aria-label="Pesquisar opção"
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                  setQuery(event.target.value);
                  onQueryChange?.(event.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
              />
              {multiple && enabledSelectableOptions.length > 0 && (
                <button
                  type="button"
                  className="custom-select-multiple-action"
                  onClick={toggleAllOptions}
                  aria-label={
                    allOptionsSelected ? "Limpar seleção" : "Selecionar todos"
                  }
                  title={
                    allOptionsSelected ? "Limpar seleção" : "Selecionar todos"
                  }
                >
                  {allOptionsSelected ? "Limpar" : "Todos"}
                </button>
              )}
            </div>
            <div className="custom-select-options">
              {visibleOptions.map((option: any, index: any) => (
                <button
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  key={option.value}
                  type="button"
                  className={`custom-select-option${multiple ? " custom-select-option--multiple" : ""}${index === highlightedIndex ? " is-active" : ""}${selectedValueSet.has(option.value) ? " is-selected" : ""}`}
                  style={option.color ? { "--custom-select-option-color": option.color } : undefined}
                  role="option"
                  aria-selected={selectedValueSet.has(option.value)}
                  tabIndex={-1}
                  disabled={option.disabled}
                  onClick={() => selectOption(option)}
                >
                  {multiple && (
                    <span className="custom-select-option-check" aria-hidden="true" />
                  )}
                  {option.color && (
                    <span className="custom-select-option-color" style={{ "--custom-select-option-color": option.color }} aria-hidden="true" />
                  )}
                  {option.subtitle ? (
                    <>
                      <span className="custom-select-option-name">
                        {option.label}
                      </span>
                      <span className="custom-select-option-subtitle">
                        {option.subtitle}
                      </span>
                    </>
                  ) : (
                    option.label
                  )}
                </button>
              ))}
            </div>
            {!visibleOptions.length && (
              <div className="custom-select-no-results" aria-live="polite">
                Nenhuma opção encontrada
              </div>
            )}
          </div>,
          plannerPortalRoot(),
        )}
    </div>
  );
}

export function SearchableMultiSelect(props: any) {
  return <SearchableSelect {...props} multiple />;
}
