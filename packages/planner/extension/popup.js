const SETTINGS_KEY = "betinhos.triage.settings.v1";
const DEBUG_KEY = "betinhos.triage.debug.v1";
const DEFAULT_TRIAGE_ENDPOINT = "http://127.0.0.1:8765";
const endpoint = document.querySelector("#endpoint");
const sessionToken = document.querySelector("#sessionToken");
const wahaEnabled = document.querySelector("#wahaEnabled");
const wahaEndpoint = document.querySelector("#wahaEndpoint");
const wahaSession = document.querySelector("#wahaSession");
const wahaApiKey = document.querySelector("#wahaApiKey");
const queue = document.querySelector("#queue");
const status = document.querySelector("#status");
const debugLog = document.querySelector("#debugLog");

async function renderDebug() {
  const stored = await chrome.storage.local.get(DEBUG_KEY);
  const entries = stored[DEBUG_KEY] || [];
  debugLog.textContent = entries.length ? entries.map((entry) => `${new Date(entry.at).toLocaleTimeString()}  ${entry.event}${entry.details && Object.keys(entry.details).length ? `  ${JSON.stringify(entry.details)}` : ""}`).join("\n") : "Nenhum evento ainda.";
}

async function render() {
  const stored = await chrome.storage.local.get([SETTINGS_KEY, "betinhos.triage.queue.v1"]);
  endpoint.value = stored[SETTINGS_KEY]?.endpoint || DEFAULT_TRIAGE_ENDPOINT;
  sessionToken.value = stored[SETTINGS_KEY]?.sessionToken || "";
  wahaEnabled.checked = Boolean(stored[SETTINGS_KEY]?.wahaEnabled);
  wahaEndpoint.value = stored[SETTINGS_KEY]?.wahaEndpoint || "http://127.0.0.1:3000";
  wahaSession.value = stored[SETTINGS_KEY]?.wahaSession || "default";
  wahaApiKey.value = stored[SETTINGS_KEY]?.wahaApiKey || "";
  queue.replaceChildren(...(stored["betinhos.triage.queue.v1"] || []).map((item) => {
    const row = document.createElement("li");
    row.append(`${item.classification?.priority || "medium"} · ${item.classification?.summary || item.senderName} `);
    const approve = document.createElement("button");
    approve.type = "button";
    approve.textContent = "Enviar";
    approve.addEventListener("click", async () => {
      try {
        const result = await chrome.runtime.sendMessage({ type: "triage-approve", item });
        await render();
        status.textContent = result?.ok ? "Enviado ao Planner." : result?.error || "Falha ao enviar.";
      } catch (error) { status.textContent = error?.message || "Falha ao enviar."; }
    });
    row.append(approve);
    return row;
  }));
  status.textContent = `Fila de triagem · ${queue.children.length}`;
}

document.querySelector("#save").addEventListener("click", async () => {
  await chrome.storage.local.set({ [SETTINGS_KEY]: {
    endpoint: endpoint.value.trim(),
    sessionToken: sessionToken.value.trim(),
    wahaEnabled: wahaEnabled.checked,
    wahaEndpoint: wahaEndpoint.value.trim(),
    wahaSession: wahaSession.value.trim(),
    wahaApiKey: wahaApiKey.value.trim(),
  } });
  status.textContent = "Configuração salva.";
});
document.querySelector("#scan").addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await chrome.runtime.sendMessage({ type: "scan-active", tabId: tab?.id });
    await render();
    await renderDebug();
    status.textContent = result?.ok ? "Triagem adicionada." : result?.error || "Não foi possível classificar.";
  } catch (error) { status.textContent = error?.message || "Não foi possível classificar."; await renderDebug(); }
});
document.querySelector("#refreshDebug").addEventListener("click", renderDebug);
render();
renderDebug();
