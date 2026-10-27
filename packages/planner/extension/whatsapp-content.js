const SCAN_DEBOUNCE_MS = 1200;
let lastUnreadCount = 0;
let scheduled = null;

function cleanText(value = "") { return String(value).replace(/\s+/g, " ").trim(); }
function phoneFromDom(documentRef) {
  const values = [...documentRef.querySelectorAll("header [data-id], [data-testid='msg-container'][data-id], .message-in[data-id], .message-out[data-id]")]
    .map((node) => node.getAttribute("data-id") || "");
  for (const value of values) {
    const match = value.match(/(?:^|_)(\d{10,15})@c\.us(?:_|$)/i) || value.match(/^(\d{10,15})@c\.us$/i);
    if (match) return match[1];
  }
  return "";
}
function parseActiveConversation(documentRef = document) {
  const header = documentRef.querySelector("header [title], header span[dir='auto'], [data-testid='conversation-info-header-chat-title']");
  const senderName = cleanText(header?.getAttribute("title") || header?.textContent || "");
  const messageNodes = [...documentRef.querySelectorAll("[data-testid='msg-container'], .message-in, .message-out")];
  const messages = messageNodes.slice(-8).map((node) => ({ text: cleanText(node.querySelector("span[dir='ltr'], .copyable-text span")?.textContent || node.textContent || ""), sentAt: node.querySelector("[data-pre-plain-text]")?.getAttribute("data-pre-plain-text") || new Date().toISOString(), direction: node.classList.contains("message-out") ? "outbound" : "inbound" })).filter((message) => message.text);
  const values = [...documentRef.querySelectorAll("header [data-id], [data-testid='msg-container'][data-id], .message-in[data-id], .message-out[data-id]")]
    .map((node) => node.getAttribute("data-id") || "");
  const chatId = values.map((value) => value.match(/(\d+@(?:c\.us|lid))/i)?.[1] || "").find(Boolean) || "";
  const phone = phoneFromDom(documentRef) || chatId.replace(/@.*$/, "");
  return { senderName, senderPhone: phone, chatId, messages };
}
function findUnreadConversationRows(documentRef = document) {
  return [...documentRef.querySelectorAll("[aria-label*='unread' i], [data-testid='icon-unread-count'], span[aria-label*='mensagem não lida' i]")].map((node) => node.closest("[data-testid='cell-frame-container'], [role='listitem'], div[tabindex='-1']")).filter(Boolean);
}

function sendRuntimeMessage(message) {
  try {
    const pending = chrome.runtime.sendMessage(message);
    pending?.catch?.(() => {});
  } catch (_) {}
}

function notifyScan() {
  if (scheduled) return;
  scheduled = setTimeout(() => {
    scheduled = null;
    const unreadCount = findUnreadConversationRows(document).length;
    if (unreadCount > lastUnreadCount) sendRuntimeMessage({ type: "scan-active" });
    lastUnreadCount = unreadCount;
  }, SCAN_DEBOUNCE_MS);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "triage-active") sendResponse(parseActiveConversation(document));
});

lastUnreadCount = findUnreadConversationRows(document).length;
new MutationObserver(notifyScan).observe(document.body, { childList: true, subtree: true });
