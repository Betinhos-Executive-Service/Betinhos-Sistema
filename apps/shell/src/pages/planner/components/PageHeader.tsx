// Porte de Tela Planner/src/PageHeader.jsx (sem mudança de comportamento).
import React from "react";

export default function PageHeader({ eyebrow, title, description, action, children }: any) {
  return (
    <div className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="header-actions">
        {children}
        {action}
      </div>
    </div>
  );
}
