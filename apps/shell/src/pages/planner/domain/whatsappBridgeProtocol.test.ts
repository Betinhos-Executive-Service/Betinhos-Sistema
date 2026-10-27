import { expect, test } from 'vitest'

type Rec = Record<string, unknown>
const g = globalThis as unknown as Rec
import { WHATSAPP_BRIDGE, installPlannerBridge } from "./whatsappBridge";

function fakeWindow() {
  const listeners = new Map<string, (event: Rec) => unknown>();
  const messages: Array<{ message: Rec; origin: string }> = [];
  const value: Rec & { dispatch: (data: Rec, origin?: string) => Promise<unknown>; messages: typeof messages } = {
    location: { origin: "https://planner.example" },
    postMessage(message: Rec, origin: string) { messages.push({ message, origin }); },
    addEventListener(type: string, listener: (event: Rec) => unknown) { listeners.set(type, listener); },
    removeEventListener(type: string) { listeners.delete(type); },
    async dispatch(data: Rec, origin = "https://planner.example") { return listeners.get("message")?.({ source: value, origin, data }); },
    messages,
  };
  return value;
}

function intake() {
  return {
    requestId: "wa-r-1",
    conversationKey: "5511999990000",
    senderName: "Ana",
    senderPhone: "+55 (11) 99999-0000",
    messages: [{ text: "Preciso de orçamento", sentAt: "2026-09-11T10:00:00Z", direction: "inbound" }],
    classification: { category: "orcamento", priority: "high", summary: "Solicitação de orçamento" },
  };
}

test("bridge responde handshake e rejeita origem incorreta", async () => {
  const previous = g.window;
  const current = fakeWindow();
  g.window = current;
  const dispose = installPlannerBridge({ onIntake: async () => ({ status: "created", contactId: "c-1", taskId: "t-1" }) });
  await current.dispatch({ type: WHATSAPP_BRIDGE.hello, clientNonce: "client-1" });
  expect(current.messages[0].message.type).toBe(WHATSAPP_BRIDGE.ready);
  const nonce = current.messages[0].message.plannerNonce;
  await current.dispatch({ type: WHATSAPP_BRIDGE.intake, plannerNonce: nonce, payload: intake() }, "https://evil.example");
  expect(current.messages.length).toBe(1);
  await current.dispatch({ type: WHATSAPP_BRIDGE.intake, plannerNonce: nonce, payload: intake() });
  expect(current.messages.at(-1)!.message.status).toBe("created");
  dispose();
  g.window = previous;
});
