// Porte de Tela Planner/src/App.jsx (sem mudança de comportamento).
import { plannerPortalRoot } from './portalRoot'
import { DEFAULT_PERSONAL_TAG_COLOR, PERSONAL_TAG_COLORS, normalizePersonalTagIds } from '../domain/domain'
import { Plus, Trash2, X } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'



export function PersonalTagPicker({ tags = [], tasks = [], value = [], onChange, onCreate, showAllTags = false }: any) {
  const [visibleCount, setVisibleCount] = useState<any>(tags.length);
  const [isModalOpen, setIsModalOpen] = useState<any>(false);
  const [modalMode, setModalMode] = useState<any>("select");
  const [newTagName, setNewTagName] = useState<any>("");
  const [newTagColor, setNewTagColor] = useState<any>(DEFAULT_PERSONAL_TAG_COLOR);
  const pickerRef = useRef<any>(null);
  const inlineRef = useRef<any>(null);
  const moreRef = useRef<any>(null);
  const addRef = useRef<any>(null);
  const tagRefs = useRef<any>(new Map());
  const selectedIds = Array.isArray(value) ? value : [];
  const selected = new Set(selectedIds);
  const activeTags = tags.filter((tag: any) => !tag.archived);
  const recentTagOrder = new Map();
  [...tasks].sort((left, right) => String(left.updatedAt || left.createdAt || "").localeCompare(String(right.updatedAt || right.createdAt || ""))).forEach((task) => {
    normalizePersonalTagIds(task.personalTagIds).forEach((tagId) => recentTagOrder.set(tagId, task.updatedAt || task.createdAt || ""));
  });
  const recentTags = [...activeTags].sort((left, right) => {
    const rightUsed = recentTagOrder.get(right.id);
    const leftUsed = recentTagOrder.get(left.id);
    if (rightUsed || leftUsed) return String(rightUsed || "").localeCompare(String(leftUsed || ""));
    return left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" });
  });
  const orderedTags = recentTags;
  const selectedCount = activeTags.filter((tag: any) => selected.has(tag.id)).length;
  const tagSignature = orderedTags.map((tag) => `${tag.id}:${tag.name}`).join("|");
  const [selectedOverflow, setSelectedOverflow] = useState<any>(false);
  const visibleCountRef = useRef<any>(visibleCount);
  const selectedOverflowRef = useRef<any>(selectedOverflow);
  const updateVisibleCount = (next: any) => {
    if (visibleCountRef.current === next) return;
    visibleCountRef.current = next;
    setVisibleCount(next);
  };
  const updateSelectedOverflow = (next: any) => {
    if (selectedOverflowRef.current === next) return;
    selectedOverflowRef.current = next;
    setSelectedOverflow(next);
  };

  useLayoutEffect(() => {
    const picker = pickerRef.current;
    const inline = inlineRef.current;
    if (!picker || !inline || !activeTags.length) return undefined;
          if (showAllTags) {
            updateSelectedOverflow(false);
            updateVisibleCount(activeTags.length);
            return undefined;
          }

    const measure = () => {
      const pickerWidth = picker.getBoundingClientRect().width;
      if (!pickerWidth) return;
      const gap = Number.parseFloat(getComputedStyle(inline).columnGap || "7") || 7;
      const widths = orderedTags.map((tag) => tagRefs.current.get(tag.id)?.getBoundingClientRect().width || 0);
      const selectedWidths = widths.slice(0, selectedCount);
      const selectedWidth = selectedWidths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, selectedWidths.length - 1);
      const totalWidth = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, widths.length - 1);
      const addWidth = onCreate ? (addRef.current?.getBoundingClientRect().width || 34) : 0;
      const addGap = addWidth ? gap : 0;
      const availableWithoutMore = pickerWidth - addWidth - addGap;
      if (selectedOverflowRef.current && selectedWidth <= availableWithoutMore + 1) {
        updateSelectedOverflow(false);
        return;
      }
      if (selectedWidth > availableWithoutMore + 1) {
        updateSelectedOverflow(true);
        updateVisibleCount(selectedCount);
        return;
      }
      if (totalWidth <= availableWithoutMore + 1) {
        updateSelectedOverflow(false);
        updateVisibleCount(activeTags.length);
        return;
      }

      const moreWidth = moreRef.current?.getBoundingClientRect().width || 34;
      const availableWidth = Math.max(0, pickerWidth - addWidth - moreWidth - gap - addGap);
      if (selectedWidth > availableWidth + 1) {
        updateSelectedOverflow(true);
        updateVisibleCount(selectedCount);
        return;
      }
      updateSelectedOverflow(false);
      let usedWidth = 0;
      let count = selectedCount;
      selectedWidths.forEach((width, index) => {
        usedWidth += (index ? gap : 0) + width;
      });
      widths.slice(selectedCount).forEach((width) => {
        const nextWidth = usedWidth + (count ? gap : 0) + width;
        if (nextWidth <= availableWidth + 1) {
          usedWidth = nextWidth;
          count += 1;
        }
      });
      updateVisibleCount(count);
    };

    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(picker);
    return () => observer?.disconnect();
  }, [tagSignature, activeTags.length, onCreate, selectedCount, showAllTags]);

  const shownTags = orderedTags.slice(0, visibleCount);
  const displayTags = showAllTags ? orderedTags : orderedTags.filter((tag) => selected.has(tag.id));
  const hasMore = !showAllTags;
  const visibleUnselectedCount = Math.max(0, visibleCount - selectedCount);
  const showAddButton = showAllTags && onCreate;
  const toggleTag = (tagId: any) => onChange(selected.has(tagId) ? selectedIds.filter((id) => id !== tagId) : [...selectedIds, tagId]);

  const openCreateModal = () => {
    setModalMode("create");
    setIsModalOpen(true);
  };
  const createTag = (event: any) => {
    event.preventDefault();
    const name = newTagName.trim();
    if (!name || !onCreate) return;
    Promise.resolve(onCreate({ name, color: newTagColor })).then((success) => {
      if (success === false) return;
      setNewTagName("");
      setNewTagColor(DEFAULT_PERSONAL_TAG_COLOR);
      setModalMode("select");
    });
  };

  return (
    <>
      <div className={`personal-tag-picker ${showAllTags ? "show-all-tags" : "show-selected-only"} ${selectedOverflow ? "has-selected-overflow" : ""}`} ref={pickerRef} role="group" aria-label="Tags pessoais da tarefa">
        <div className="personal-tag-picker-inline" ref={inlineRef}>
          {displayTags.length ? displayTags.map((tag, index) => {
            const checked = selected.has(tag.id);
            return (
              <button
                className={`personal-tag-chip ${index < displayTags.length ? "" : "is-measured-hidden"} ${checked ? "is-selected" : ""}`}
                key={tag.id}
                ref={(node) => {
                  if (node) tagRefs.current.set(tag.id, node);
                  else tagRefs.current.delete(tag.id);
                }}
                type="button"
                onClick={() => toggleTag(tag.id)}
                aria-pressed={checked}
                style={{ "--personal-tag-color": tag.color }}
              >
                <span className="personal-tag-dot" aria-hidden="true" />
                {tag.name}
              </button>
            );
          }) : <span className="personal-tag-empty">{showAllTags ? "Crie sua primeira tag no gerenciador." : "Sem Tag selecionada"}</span>}
          {showAddButton && (
            <button className="personal-tag-add" ref={addRef} type="button" onClick={openCreateModal} aria-label="Adicionar tag" title="Adicionar tag">
              <Plus size={14} />
            </button>
          )}
          {hasMore && (
            <button
              className={`personal-tag-more ${[...selected].some((id) => !shownTags.some((tag) => tag.id === id)) ? "has-selected" : ""}`}
              ref={moreRef}
              type="button"
              onClick={() => { setModalMode("select"); setIsModalOpen(true); }}
              aria-label={`Escolher tags; ${activeTags.length - selectedCount} não selecionadas`}
              title="Escolher mais tags"
            >
              ...
            </button>
          )}
        </div>
      </div>
      {isModalOpen && typeof document !== "undefined" && document.body
        ? createPortal(
            <div
              className="personal-tags-modal-layer"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setIsModalOpen(false);
              }}
            >
              <section className="personal-tags-modal" role="dialog" aria-modal="true" aria-labelledby="personal-tags-modal-title">
                <header className="personal-tags-modal-header">
                  <div>
                    <span className="eyebrow">Personalização</span>
                    <h3 id="personal-tags-modal-title">{modalMode === "create" ? "Adicionar tag" : "Escolher tags"}</h3>
                  </div>
                  <button className="icon-button" type="button" onClick={() => setIsModalOpen(false)} aria-label="Fechar seleção de tags"><X size={17} /></button>
                </header>
                {modalMode === "create" ? (
                  <form className="personal-tags-modal-create" onSubmit={createTag}>
                    <label>
                      Nome da tag
                      <input autoFocus value={newTagName} onChange={(event) => setNewTagName(event.target.value.slice(0, 32))} maxLength={32} placeholder="Ex.: VIP" />
                    </label>
                    <div className="personal-tag-color-options" role="group" aria-label="Cor da nova tag">
                      {PERSONAL_TAG_COLORS.map((item) => (
                        <button key={item} className={`personal-tag-color ${newTagColor === item ? "is-selected" : ""}`} type="button" style={{ "--personal-tag-color": item }} onClick={() => setNewTagColor(item)} aria-label={`Usar cor ${item}`} aria-pressed={newTagColor === item} />
                      ))}
                    </div>
                    <footer className="personal-tags-modal-footer">
                      <button className="button button-quiet button-small" type="button" onClick={() => setModalMode("select")}>Voltar</button>
                      <button className="button button-primary button-small" type="submit" disabled={!newTagName.trim()}><Plus size={14} /> Criar tag</button>
                    </footer>
                  </form>
                ) : (
                  <>
                    <div className="personal-tags-modal-list" role="group" aria-label="Todas as tags pessoais">
                      {[...activeTags].sort((left, right) => left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" })).map((tag) => {
                        const checked = selected.has(tag.id);
                        return (
                          <button
                            className={`personal-tag-chip ${checked ? "is-selected" : ""}`}
                            key={tag.id}
                            type="button"
                            onClick={() => toggleTag(tag.id)}
                            aria-pressed={checked}
                            style={{ "--personal-tag-color": tag.color }}
                          >
                            <span className="personal-tag-dot" aria-hidden="true" />
                            {tag.name}
                          </button>
                        );
                      })}
                    </div>
                    <footer className="personal-tags-modal-footer">
                      <span>{selectedIds.length} selecionada{selectedIds.length === 1 ? "" : "s"}</span>
                      <div className="personal-tags-modal-footer-actions">
                        {onCreate && <button className="button button-secondary button-small" type="button" onClick={openCreateModal}><Plus size={14} /> Adicionar tag</button>}
                        <button className="button button-primary button-small" type="button" onClick={() => setIsModalOpen(false)}>Concluir</button>
                      </div>
                    </footer>
                  </>
                )}
              </section>
            </div>,
            plannerPortalRoot(),
          )
        : null}
    </>
  );
}

export function PersonalTagManager({ tags = [], onCreate, onUpdate, onArchive }: any) {
  const [name, setName] = useState<any>("");
  const [color, setColor] = useState<any>(DEFAULT_PERSONAL_TAG_COLOR);
  const [tagToDelete, setTagToDelete] = useState<any>(null);
  const activeTags = tags.filter((tag: any) => !tag.archived).sort((left: any, right: any) => left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }));
  const submit = (event: any) => {
    event.preventDefault();
    if (!name.trim()) return;
    Promise.resolve(onCreate({ name, color })).then(() => {
      setName("");
      setColor(DEFAULT_PERSONAL_TAG_COLOR);
    });
  };
  return (
    <div className="personal-tag-manager" aria-label="Gerenciar tags pessoais">
      <form className="personal-tag-create" onSubmit={submit}>
        <input value={name} onChange={(event) => setName(event.target.value.slice(0, 32))} maxLength={32} placeholder="Nova tag" aria-label="Nome da nova tag" />
        <div className="personal-tag-color-options" role="group" aria-label="Cor da nova tag">
          {PERSONAL_TAG_COLORS.map((item) => (
            <button key={item} className={`personal-tag-color ${color === item ? "is-selected" : ""}`} type="button" style={{ "--personal-tag-color": item }} onClick={() => setColor(item)} aria-label={`Usar cor ${item}`} aria-pressed={color === item} />
          ))}
        </div>
        <button className="button button-secondary button-small" type="submit" disabled={!name.trim()}><Plus size={14} /> Criar</button>
      </form>
      {activeTags.length ? (
        <div className="personal-tag-manager-list">
          {activeTags.map((tag: any) => (
            <div className="personal-tag-manager-row" key={tag.id}>
              <span className="personal-tag-dot personal-tag-manager-dot" style={{ "--personal-tag-color": tag.color }} aria-hidden="true" />
              <input className="personal-tag-badge" style={{ "--personal-tag-color": tag.color }} defaultValue={tag.name} maxLength={32} aria-label={`Nome da tag ${tag.name}`} onBlur={(event) => {
                if (event.target.value.trim() && event.target.value.trim() !== tag.name) onUpdate(tag.id, { name: event.target.value });
              }} />
              <div className="personal-tag-manager-actions">
                {tagToDelete?.id === tag.id ? (
                  <div className="subtask-remove-confirm" role="group" aria-label={`Confirmar exclusão de ${tag.name}`}>
                    <button className="button button-danger" type="button" onClick={() => { setTagToDelete(null); onArchive(tag.id); }}>Excluir</button>
                    <button className="button button-quiet" type="button" onClick={() => setTagToDelete(null)}>Cancelar</button>
                  </div>
                ) : (
                  <button className="subtask-delete" type="button" onClick={() => setTagToDelete(tag)} aria-label={`Excluir ${tag.name}`} title="Excluir tag">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : <div className="personal-tag-empty">Nenhuma tag pessoal criada.</div>}
    </div>
  );
}
