const WHATSAPP_BRIDGE = { hello: "betinhos.whatsapp.bridge.hello", ready: "betinhos.whatsapp.bridge.ready", response: "betinhos.whatsapp.bridge.response" };

function sendRuntimeMessage(message) {
  try {
    const pending = chrome.runtime.sendMessage(message);
    pending?.catch?.(() => {});
  } catch (_) {}
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "planner-intake") return;
  window.postMessage(message.payload, window.location.origin);
  sendResponse({ ok: true });
});

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== WHATSAPP_BRIDGE.ready) return;
  chrome.storage.session.set({ plannerNonce: event.data.plannerNonce || "" });
});

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== WHATSAPP_BRIDGE.response) return;
  sendRuntimeMessage({ type: "planner-response", response: event.data });
});

let helloTimer = null;
const sendHello = () => {
  window.postMessage({ type: WHATSAPP_BRIDGE.hello, clientNonce: crypto.randomUUID() }, window.location.origin);
  clearTimeout(helloTimer);
  helloTimer = setTimeout(sendHello, 30000);
};
sendHello();
window.addEventListener("focus", sendHello, { passive: true });
window.addEventListener("pageshow", sendHello, { passive: true });
