export function cleanText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

export function parseActiveConversation(documentRef = document) {
  const header = documentRef.querySelector("header [title], header span[dir='auto'], [data-testid='conversation-info-header-chat-title']");
  const senderName = cleanText(header?.getAttribute("title") || header?.textContent || "");
  const messageNodes = [...documentRef.querySelectorAll("[data-testid='msg-container'], .message-in, .message-out")];
  const messages = messageNodes.slice(-8).map((node) => ({
    text: cleanText(node.querySelector("span[dir='ltr'], .copyable-text span")?.textContent || node.textContent || ""),
    sentAt: node.querySelector("[data-pre-plain-text]")?.getAttribute("data-pre-plain-text") || new Date().toISOString(),
    direction: node.classList.contains("message-out") || node.querySelector("[data-testid='msg-meta']") ? "outbound" : "inbound",
  })).filter((message) => message.text);
  const values = [...documentRef.querySelectorAll("header [data-id], [data-testid='msg-container'][data-id], .message-in[data-id], .message-out[data-id]")]
    .map((node) => node.getAttribute("data-id") || "");
  const chatId = values.map((value) => value.match(/(\d+@(?:c\.us|lid))/i)?.[1] || "").find(Boolean) || "";
  const phone = chatId.replace(/@.*$/, "");
  return { senderName, senderPhone: phone, chatId, messages };
}

export function findUnreadConversationRows(documentRef = document) {
  return [...documentRef.querySelectorAll("[aria-label*='unread' i], [data-testid='icon-unread-count'], span[aria-label*='mensagem não lida' i]")]
    .map((node) => node.closest("[data-testid='cell-frame-container'], [role='listitem'], div[tabindex='-1']"))
    .filter(Boolean);
}
