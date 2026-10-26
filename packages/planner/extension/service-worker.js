import { parseActiveConversation } from "./whatsapp-parser.js";
import { DEFAULT_TRIAGE_ENDPOINT, requestTriage } from "./triage.js";
import { resolveWahaPhone } from "./waha.js";

const QUEUE_KEY = "betinhos.triage.queue.v1";
const SETTINGS_KEY = "betinhos.triage.settings.v1";
const DEBUG_KEY = "betinhos.triage.debug.v1";

async function debug(event, details = {}) {
  const entry = { at: new Date().toISOString(), event, details };
  console.info("[Betinhos Planner]", event, details);
  try {
    const stored = await chrome.storage.local.get(DEBUG_KEY);
    await chrome.storage.local.set({ [DEBUG_KEY]: [...(stored[DEBUG_KEY] || []), entry].slice(-80) });
  } catch (_) {}
}

async function readQueue() {
  const stored = await chrome.storage.local.get(QUEUE_KEY);
  return Array.isArray(stored[QUEUE_KEY]) ? stored[QUEUE_KEY] : [];
}

async function writeQueue(queue) {
  await chrome.storage.local.set({ [QUEUE_KEY]: queue.slice(-100) });
  await chrome.action.setBadgeText({ text: queue.length ? String(Math.min(queue.length, 99)) : "" });
}

async function triageActiveTab(tabId) {
  if (!tabId) { await debug("scan.no_active_tab"); throw new Error("Nenhuma aba ativa encontrada."); }
  await debug("scan.started", { tabId });
  const settings = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
  await debug("scan.requesting_conversation", { tabId });
  let response;
  try { response = await chrome.tabs.sendMessage(tabId, { type: "triage-active" }); }
  catch (error) { await debug("scan.conversation_failed", { message: error?.message || "unknown" }); throw new Error("Não consegui falar com o WhatsApp. Recarregue a aba do WhatsApp e tente novamente."); }
  await debug("scan.conversation_received", { messageCount: response?.messages?.length || 0, hasName: Boolean(response?.senderName), hasPhone: Boolean(response?.senderPhone) });
  if (!response.senderPhone && settings.wahaEnabled) {
    const senderPhone = await resolveWahaPhone({ endpoint: settings.wahaEndpoint, apiKey: settings.wahaApiKey, session: settings.wahaSession, chatId: response.chatId });
    if (senderPhone) {
      response = { ...response, senderPhone, phoneSource: "waha" };
      await debug("waha.phone_resolved", { chatId: response.chatId });
    } else {
      await debug("waha.phone_not_resolved", { chatId: response.chatId || "" });
    }
  }
  await debug("triage.requesting", { endpoint: settings.endpoint || DEFAULT_TRIAGE_ENDPOINT });
  let triage;
  try { triage = await requestTriage(settings.endpoint || DEFAULT_TRIAGE_ENDPOINT, response, settings.sessionToken || ""); }
  catch (error) { await debug("triage.failed", { message: error?.message || "unknown" }); throw error; }
  await debug("triage.received", { category: triage.classification?.category, priority: triage.classification?.priority });
  const queue = await readQueue();
  if (!queue.some((item) => item.requestId === triage.requestId)) queue.push({ ...triage, createdAt: new Date().toISOString(), status: "pending" });
  await writeQueue(queue);
  await debug("queue.updated", { size: queue.length, requestId: triage.requestId });
  await chrome.notifications.create(`triage-${triage.requestId}`, { type: "basic", iconUrl: "icon.svg", title: "Nova triagem no Planner", message: triage.classification?.summary || "Conversa aguardando revisão." });
  return triage;
}

async function approveIntake(item, sendResponse) {
  await debug("planner.approval_started", { requestId: item?.requestId });
  const tabs = await chrome.tabs.query({ url: ["https://*.dynamics.com/*"] });
  const plannerTab = tabs[0];
  if (!plannerTab?.id) { await debug("planner.not_found"); sendResponse({ ok: false, error: "Abra o Planner em uma aba antes de aprovar." }); return; }
  const nonce = (await chrome.storage.session.get("plannerNonce")).plannerNonce;
  if (!nonce) { await debug("planner.nonce_missing", { tabId: plannerTab.id }); sendResponse({ ok: false, error: "Planner ainda não está conectado à extensão." }); return; }
  const result = await chrome.tabs.sendMessage(plannerTab.id, { type: "planner-intake", payload: { type: "betinhos.whatsapp.bridge.intake", plannerNonce: nonce, payload: item } }).catch((error) => ({ error: error.message }));
  if (result?.error) { await debug("planner.send_failed", { message: result.error }); sendResponse({ ok: false, error: result.error }); return; }
  await debug("planner.intake_sent", { requestId: item?.requestId, tabId: plannerTab.id });
  sendResponse({ ok: true });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "scan-active" && (sender.tab?.id || message.tabId)) {
    triageActiveTab(sender.tab?.id || message.tabId).then((data) => sendResponse({ ok: true, data })).catch((error) => { void debug("scan.failed", { message: error?.message || "unknown" }); sendResponse({ ok: false, error: error.message }); });
    return true;
  }
  if (message.type === "queue") {
    readQueue().then((data) => sendResponse({ ok: true, data }));
    return true;
  }
  if (message.type === "settings") {
    chrome.storage.local.set({ [SETTINGS_KEY]: message.value || {} }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "triage-approve") {
    approveIntake(message.item, sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "planner-response") {
    const response = message.response || {};
    void debug("planner.response_received", { requestId: response.requestId, status: response.status });
    readQueue().then(async (queue) => {
      const next = queue.map((item) => item.requestId === response.requestId ? { ...item, status: response.status, plannerResponse: response } : item);
      await writeQueue(next.filter((item) => !["created", "updated", "duplicate"].includes(item.status)));
    }).catch(() => {});
  }
});

chrome.runtime.onInstalled.addListener(() => chrome.action.setBadgeText({ text: "" }));
