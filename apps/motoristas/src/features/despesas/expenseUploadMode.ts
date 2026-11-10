export type ExpenseUploadMode = "async" | "legacy";

export type ExpenseUploadModeDependencies = {
  hasRuntime: () => boolean;
  resolveAsyncFlowUrl: () => Promise<string>;
  assertAsyncSchema: () => Promise<void>;
  warn: (message: string, data?: unknown) => void;
};

// The async SharePoint upload is enabled by configuration, never by environment URL:
// it runs wherever the async Flow URL is set and the attachment columns exist.
// Anything missing or failing here happens before any row is created, so the
// legacy OneDrive path stays safe as the fallback.
export async function decideExpenseUploadMode(deps: ExpenseUploadModeDependencies): Promise<ExpenseUploadMode> {
  if (!deps.hasRuntime()) return "legacy";
  try {
    const url = String(await deps.resolveAsyncFlowUrl() ?? "").trim();
    if (!url) return "legacy";
    await deps.assertAsyncSchema();
    return "async";
  } catch (error) {
    deps.warn("Envio assincrono de despesas indisponivel. Usando envio legado.", {
      error: error instanceof Error ? error.message : String(error)
    });
    return "legacy";
  }
}
