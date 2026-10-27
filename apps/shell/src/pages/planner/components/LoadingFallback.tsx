// Porte de Tela Planner/src/LoadingFallback.jsx (sem mudança de comportamento).
const BAR = (className = "") => <span className={`skeleton-bar ${className}`} />;

function SkeletonHeader({ view }: any) {
  return (
    <div className="screen-skeleton-header">
      <div className="screen-skeleton-heading">
        {BAR("skeleton-eyebrow")}
        {BAR("skeleton-title")}
        {BAR("skeleton-description")}
      </div>
      {!["quality", "settings", "more"].includes(view) && (
        <div className="screen-skeleton-header-actions">{BAR("skeleton-control")}{BAR("skeleton-control short")}</div>
      )}
    </div>
  );
}

function SkeletonFilters({ compact = false }: any) {
  return (
    <div className="screen-skeleton-filters">
      {BAR("skeleton-search")}
      {BAR("skeleton-control")}
      {!compact && <>{BAR("skeleton-control")}{BAR("skeleton-control short")}</>}
    </div>
  );
}

function SkeletonMetrics({ count = 4 }: any) {
  return <div className="screen-skeleton-metrics">{Array.from({ length: count }, (_, index) => (
    <div className="screen-skeleton-metric" key={index}>{BAR("skeleton-icon")}
      <div>{BAR("skeleton-metric-label")}{BAR("skeleton-metric-value")}</div>
    </div>
  ))}</div>;
}

function SkeletonRows({ count = 5, table = false }: any) {
  return <div className={`screen-skeleton-rows${table ? " is-table" : ""}`}>
    {table && <div className="screen-skeleton-table-head">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div>}
    {Array.from({ length: count }, (_, index) => <div className="screen-skeleton-row" key={index}>
      <div className="skeleton-row-main">{BAR("skeleton-row-badge")}{BAR("skeleton-row-title")}{BAR("skeleton-row-detail")}</div>
      <div className="skeleton-row-meta">{BAR("skeleton-avatar")}{BAR("skeleton-row-meta-text")}{BAR("skeleton-row-chip")}</div>
    </div>)}
  </div>;
}

function SkeletonBoard({ columns = 4 }: any) {
  return <div className="skeleton-kanban-columns">{Array.from({ length: columns }, (_, column) => (
    <section className="screen-skeleton-column" key={column}>
      <div className="skeleton-column-heading">{BAR("skeleton-column-dot")}{BAR("skeleton-column-title")}{BAR("skeleton-column-count")}</div>
      <div className="skeleton-column-body">{Array.from({ length: column === 2 ? 2 : 3 }, (_, card) => (
        <div className="screen-skeleton-task" key={card}>
          <div>{BAR("skeleton-row-badge")}{BAR("skeleton-row-chip")}</div>
          {BAR("skeleton-row-title")}{BAR("skeleton-row-detail")}
          <div className="skeleton-task-footer">{BAR("skeleton-avatar")}{BAR("skeleton-row-meta-text")}{BAR("skeleton-row-chip")}</div>
        </div>
      ))}</div>
    </section>
  ))}</div>;
}

function SkeletonCalendar() {
  return <><div className="screen-skeleton-calendar-nav">{BAR("skeleton-control short")}{BAR("skeleton-calendar-month")}{BAR("skeleton-control short")}</div>
    <div className="screen-skeleton-days">{Array.from({ length: 7 }, (_, index) => <div key={index}>{BAR("skeleton-day-label")}{BAR("skeleton-day-number")}{BAR("skeleton-day-count")}</div>)}</div>
    <section className="screen-skeleton-panel">{BAR("skeleton-section-title")}<SkeletonRows count={3} /></section>
  </>;
}

function SkeletonSettings() {
  return <div className="screen-skeleton-settings">{Array.from({ length: 4 }, (_, index) => <section className="screen-skeleton-panel" key={index}>
    {BAR("skeleton-icon")}{BAR("skeleton-section-title")}{BAR("skeleton-row-detail")}{BAR("skeleton-row-detail short")}{BAR("skeleton-control")}
  </section>)}</div>;
}

export default function LoadingFallback({ label = "Carregando tela", view = "dashboard", quoteView = "kanban" }: any) {
  const metrics = ["dashboard", "team", "contacts", "quotes", "management"].includes(view);
  const filters = !["settings", "more", "management"].includes(view);
  const quoteKanban = view === "quotes" && quoteView !== "list";
  return (
    <div className={`screen-skeleton screen-skeleton-${view}`} role="status" aria-live="polite" aria-label={label}>
      <span className="screen-skeleton-label">{label}…</span>
      <div aria-hidden="true">
        <SkeletonHeader view={view} />
        {metrics && <SkeletonMetrics />}
        {view === "quotes" ? <section className="screen-skeleton-panel screen-skeleton-quotes-panel">
          <SkeletonFilters compact />
          {quoteKanban ? <SkeletonBoard columns={5} /> : <SkeletonRows table />}
        </section> : filters && <SkeletonFilters compact={view === "contacts"} />}
        {view === "board" ? <SkeletonBoard />
          : view === "quotes" ? null
          : view === "calendar" ? <SkeletonCalendar />
          : view === "settings" || view === "more" ? <SkeletonSettings />
          : view === "management" ? <div className="screen-skeleton-settings"><section className="screen-skeleton-panel">{BAR("skeleton-section-title")}<SkeletonRows count={3} /></section><section className="screen-skeleton-panel">{BAR("skeleton-section-title")}<SkeletonRows count={3} /></section></div>
          : <section className="screen-skeleton-panel">{["dashboard", "team"].includes(view) && BAR("skeleton-section-title")}<SkeletonRows count={view === "contacts" ? 4 : 5} table={["list", "quality", "quotes", "team"].includes(view)} /></section>}
      </div>
    </div>
  );
}
