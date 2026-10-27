// Porte de Tela Planner/src/MentionableField.jsx (sem mudança de comportamento).
import { plannerPortalRoot } from './portalRoot'
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ALL_MENTION = { id: "__all__", name: "Todos", token: "all", subtitle: "Mencionar todos" };

function normalize(value: any) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function mentionSearchText(employee: any) {
  return [employee?.name, employee?.apelido, employee?.mentionSearchText].filter(Boolean).join(" ");
}

function mentionLabel(employee: any) {
  return employee?.apelido || employee?.name || "Sem nome";
}

function sortMentionPeople(people: any, query: any) {
  const normalizedQuery = normalize(query);
  return [...people].sort((left, right) => {
    const leftSearch = normalize(mentionSearchText(left));
    const rightSearch = normalize(mentionSearchText(right));
    const startsWithDifference =
      Number(!leftSearch.startsWith(normalizedQuery)) -
      Number(!rightSearch.startsWith(normalizedQuery));
    if (startsWithDifference) return startsWithDifference;
    return normalize(mentionLabel(left)).localeCompare(
      normalize(mentionLabel(right)),
      "pt-BR",
      { sensitivity: "base" },
    );
  });
}

export function getMentionContext(value: any, caret = String(value || "").length) {
  const beforeCaret = String(value || "").slice(0, caret);
  const match = beforeCaret.match(/(?:^|[^\p{L}\p{N}_])@([^\s@]*)$/u);
  if (!match) return null;
  return { start: (match.index as any) + match[0].lastIndexOf("@"), query: match[1] };
}

export function MentionableField({ value, onChange, employees = [], multiline = false, onSubmit, className = "", placeholder, ariaLabel, rows, ...props }: any) {
  const inputRef = useRef<any>(null);
  const [caret, setCaret] = useState<any>(String(value || "").length);
  const [activeIndex, setActiveIndex] = useState<any>(0);
  const context = getMentionContext(value, caret);
  const suggestions = useMemo(() => {
    if (!context) return [];
    const query = normalize(context.query);
    const people = sortMentionPeople(
      employees.filter((employee: any) => normalize(mentionSearchText(employee)).includes(query)),
      query,
    );
    const globalMatches = !query || "all".includes(query) || "todos".includes(query);
    return globalMatches ? [ALL_MENTION, ...people] : people;
  }, [context?.query, employees]);

  useEffect(() => setActiveIndex(0), [context?.query]);

  const updateCaret = (event: any) => {
    const nextCaret = event.target.selectionStart ?? event.target.value.length;
    setCaret(nextCaret);
    onChange(event.target.value);
  };

  const insertMention = (mention: any) => {
    if (!context) return;
    const token = mention.token || mentionLabel(mention);
    const nextValue = `${String(value).slice(0, context.start)}@${token} ${String(value).slice(caret)}`;
    onChange(nextValue);
    const nextCaret = context.start + token.length + 2;
    setCaret(nextCaret);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const handleKeyDown = (event: any) => {
    if (suggestions.length && event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((current: any) => (current + 1) % suggestions.length); return; }
    if (suggestions.length && event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((current: any) => (current - 1 + suggestions.length) % suggestions.length); return; }
    if (suggestions.length && (event.key === "Tab" || event.key === "Enter")) { event.preventDefault(); insertMention(suggestions[activeIndex] || suggestions[0]); return; }
    if (event.key === "Enter" && !event.shiftKey && onSubmit) { event.preventDefault(); onSubmit(); }
  };

  const Field = multiline ? "textarea" : "input";
  return <div className={`mentionable-field ${className}`}>
    <Field ref={inputRef} value={value} onChange={updateCaret} onClick={(event) => setCaret((event.target as any).selectionStart ?? value.length)} onKeyUp={(event) => setCaret((event.target as any).selectionStart ?? value.length)} onKeyDown={handleKeyDown} placeholder={placeholder} aria-label={ariaLabel} aria-autocomplete="list" aria-expanded={suggestions.length > 0} rows={rows} {...props} />
    {suggestions.length > 0 && <div className="mention-suggestions" role="listbox" aria-label="Pessoas para mencionar">{suggestions.map((mention, index) => <button type="button" className={`mention-suggestion ${index === activeIndex ? "is-active" : ""}`} key={mention.id || mention.name} aria-selected={index === activeIndex} onMouseDown={(event) => event.preventDefault()} onClick={() => insertMention(mention)}><MentionAvatar name={mentionLabel(mention)} small /><span>{mentionLabel(mention)}</span></button>)}</div>}
  </div>;
}

export function MentionAvatar({ name, small }: any) {
  return <span className={`avatar ${small ? "avatar-small" : ""}`}>{String(name || "?").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>;
}

export function GlobalMentionController({ employees = [] }: any) {
  const [active, setActive] = useState<any>(null);
  const [index, setIndex] = useState<any>(0);
  const refresh = () => {
    const element = document.activeElement;
    if (!element || !["INPUT", "TEXTAREA"].includes(element.tagName) || (element as any).readOnly || (element as any).disabled) { setActive(null); return; }
    const context = getMentionContext((element as any).value, (element as any).selectionStart ?? (element as any).value.length);
    if (!context) { setActive(null); return; }
    const query = normalize(context.query);
    const people = sortMentionPeople(
      employees.filter((employee: any) => normalize(mentionSearchText(employee)).includes(query)),
      query,
    );
    const suggestions = (!query || "all".includes(query) || "todos".includes(query)) ? [ALL_MENTION, ...people] : people;
    setActive({ element, context, suggestions, rect: element.getBoundingClientRect() });
  };
  useEffect(() => {
    document.addEventListener("input", refresh, true); document.addEventListener("keyup", refresh, true); document.addEventListener("click", refresh, true);
    return () => { document.removeEventListener("input", refresh, true); document.removeEventListener("keyup", refresh, true); document.removeEventListener("click", refresh, true); };
  });
  useEffect(() => {
    const onKeyDown = (event: any) => {
      if (!active?.suggestions.length || event.target !== active.element) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setIndex((current: any) => (current + (event.key === "ArrowDown" ? 1 : -1) + active.suggestions.length) % active.suggestions.length); }
      if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); const mention = active.suggestions[index] || active.suggestions[0]; const { element, context } = active; const caret = element.selectionStart ?? element.value.length; const token = mention.token || mentionLabel(mention); const next = `${element.value.slice(0, context.start)}@${token} ${element.value.slice(caret)}`; const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set; setter?.call(element, next); element.dispatchEvent(new Event("input", { bubbles: true })); element.focus(); const nextCaret = context.start + token.length + 2; element.setSelectionRange(nextCaret, nextCaret); setActive(null); }
    };
    document.addEventListener("keydown", onKeyDown, true); return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [active, index]);
  if (!active?.suggestions.length || typeof document === "undefined") return null;
  return createPortal(<div className="mention-suggestions mention-suggestions-global" style={{ top: active.rect.bottom + 7, left: active.rect.left, width: active.rect.width }} role="listbox" aria-label="Pessoas para mencionar">{active.suggestions.map((mention: any, itemIndex: any) => <button type="button" className={`mention-suggestion ${itemIndex === index ? "is-active" : ""}`} key={mention.id || mention.name} onMouseDown={(event) => event.preventDefault()} onClick={() => { active.element.focus(); active.element.setSelectionRange(active.context.start, active.context.start + active.context.query.length + 1); active.element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); }}><MentionAvatar name={mentionLabel(mention)} small /><span>{mentionLabel(mention)}</span></button>)}</div>, plannerPortalRoot());
}

export function useMentionController(employees: any = []) {
  useEffect(() => {
    let active: any = null;
    let index = 0;
    const menu = document.createElement("div");
    menu.className = "mention-suggestions mention-suggestions-global";
    menu.setAttribute("role", "listbox");
    plannerPortalRoot().appendChild(menu);
    const close = () => { active = null; menu.replaceChildren(); menu.hidden = true; };
    const positionMenu: any = () => {
      if (!active) return;
      const rect = active.element.getBoundingClientRect();
      const gap = 7;
      const viewportPadding = 8;
      menu.hidden = false;
      const menuHeight = Math.min(menu.scrollHeight, 260);
      const menuWidth = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
      const isOutsideViewport = rect.bottom < viewportPadding || rect.top > window.innerHeight - viewportPadding;
      if (isOutsideViewport) {
        menu.hidden = true;
        return;
      }
      const hasRoomBelow = rect.bottom + gap + menuHeight <= window.innerHeight - viewportPadding;
      const top = hasRoomBelow ? rect.bottom + gap : Math.max(viewportPadding, rect.top - gap - menuHeight);
      const left = Math.min(Math.max(viewportPadding, rect.left), window.innerWidth - menuWidth - viewportPadding);
      menu.hidden = false;
      menu.style.top = `${top}px`;
      menu.style.left = `${left}px`;
      menu.style.width = `${menuWidth}px`;
    };
    const refresh = () => {
      const element = document.activeElement;
      if (!element || !["INPUT", "TEXTAREA"].includes(element.tagName) || (element as any).readOnly || (element as any).disabled || element.closest<any>(".mentionable-field")) return close();
      const context = getMentionContext((element as any).value, (element as any).selectionStart ?? (element as any).value.length);
      if (!context) return close();
      const query = normalize(context.query);
      const people = sortMentionPeople(
        employees.filter((employee: any) => normalize(mentionSearchText(employee)).includes(query)),
        query,
      );
      const suggestions = (!query || "all".includes(query) || "todos".includes(query)) ? [ALL_MENTION, ...people] : people;
      if (!suggestions.length) return close();
      active = { element, context, suggestions }; index = Math.min(index, suggestions.length - 1);
      menu.replaceChildren(...suggestions.map((mention, itemIndex) => { const button = document.createElement("button"); button.type = "button"; button.className = `mention-suggestion ${itemIndex === index ? "is-active" : ""}`; button.textContent = mentionLabel(mention); button.setAttribute("aria-selected", itemIndex === index ? "true" : "false"); button.onmousedown = (event) => event.preventDefault(); button.onclick = () => choose(mention); return button; }));
      positionMenu();
    };
    const choose: any = (mention: any) => { if (!active) return; const { element, context } = active; const caret = element.selectionStart ?? element.value.length; const token = mention.token || mentionLabel(mention); const next = `${element.value.slice(0, context.start)}@${token} ${element.value.slice(caret)}`; const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set; setter?.call(element, next); element.dispatchEvent(new Event("input", { bubbles: true })); element.focus(); const nextCaret = context.start + token.length + 2; element.setSelectionRange(nextCaret, nextCaret); close(); };
    const onKeyDown: any = (event: any) => { if (!active || event.target !== active.element || !active.suggestions.length) return; if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); index = (index + (event.key === "ArrowDown" ? 1 : -1) + active.suggestions.length) % active.suggestions.length; refresh(); } else if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); choose(active.suggestions[index]); } };
    document.addEventListener("input", refresh, true); document.addEventListener("keyup", refresh, true); document.addEventListener("click", refresh, true); document.addEventListener("keydown", onKeyDown, true); window.addEventListener("scroll", positionMenu, true); window.addEventListener("resize", positionMenu);
    return () => { document.removeEventListener("input", refresh, true); document.removeEventListener("keyup", refresh, true); document.removeEventListener("click", refresh, true); document.removeEventListener("keydown", onKeyDown, true); window.removeEventListener("scroll", positionMenu, true); window.removeEventListener("resize", positionMenu); menu.remove(); };
  }, [employees]);
}
