// Porte de Tela Planner/src/DateInput.jsx (sem mudança de comportamento).
import React, { forwardRef } from "react";

const MAX_DATE = "9999-12-31";
const MAX_DATE_TIME = "9999-12-31T23:59";

export const DateInput = forwardRef<any, any>(function DateInput({ type = "date", value = "", onInput, onChange, ...props }: any, ref) {
  const restoreOverlongYear = (event: any) => {
    if (!/^\d{5,}-/.test(event.currentTarget.value)) return false;
    event.currentTarget.value = value || "";
    return true;
  };

  return <input
    {...props}
    ref={ref}
    type={type}
    max={type === "datetime-local" ? MAX_DATE_TIME : MAX_DATE}
    value={value}
    onInput={(event) => { if (!restoreOverlongYear(event)) onInput?.(event); }}
    onChange={(event) => { if (!restoreOverlongYear(event)) onChange?.(event); }}
  />;
});
