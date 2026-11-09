import React from "react";
import * as ReactDOM from "react-dom";
import App from "./App";
import { DataProvider } from "./app/DataProvider";
import { AppErrorBoundary } from "./app/AppErrorBoundary";
import { adaptadorDataverse } from "./data/dataverse/adaptador";
import { installGlobalAppErrorLogger } from "./shared/appErrorLogger";
import { installPwa } from "./lib/pwa";

installGlobalAppErrorLogger();
installPwa();

try {
  (ReactDOM as { render: (node: React.ReactNode, container: HTMLElement) => void }).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <DataProvider adaptador={adaptadorDataverse}>
          <App />
        </DataProvider>
      </AppErrorBoundary>
    </React.StrictMode>,
    document.getElementById("root") as HTMLElement
  );
} catch (error) {
  (window as Window & { __APP_REPORT_ERROR?: (error: unknown, context?: Record<string, unknown>) => void }).__APP_REPORT_ERROR?.(error, {
    severity: "critical",
    source: "main.render",
    phase: "bootstrap"
  });
  throw error;
}
