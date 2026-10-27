import { expect, test } from 'vitest'
import {
  maskSensitiveText,
  messageFingerprint,
  normalizeWhatsAppIntake,
  normalizeTriageResult,
  validateWhatsAppIntake,
} from "./whatsappBridge";

test("mascara dados pessoais e financeiros antes da triagem", () => {
  expect(maskSensitiveText("CPF 123.456.789-09 e cartão 4111111111111111")).toBe("CPF [CPF] e cartão [DADO_FINANCEIRO]");
  expect(maskSensitiveText("ana@example.com")).toBe("[EMAIL]");
});

test("fingerprint é determinístico e normaliza telefone", () => {
  expect(messageFingerprint({ senderPhone: "+55 (11) 99999-0000", text: "Oi", sentAt: "2026-09-11T10:00:00Z" })).toBe(messageFingerprint({ senderPhone: "5511999990000", text: "Oi", sentAt: "2026-09-11T10:00:00Z" }));
});

test("normaliza urgência e limita a resposta da IA", () => {
  const result = normalizeTriageResult({ category: "inexistente", priority: "urgent", confidence: 2, summary: " x ", dueDate: "2026-09-11" });
  expect(result).toStrictEqual({ category: "outro", priority: "urgent", summary: "x", nextAction: "", dueDate: "2026-09-11", confidence: 1 });
});

test("valida intake mínimo e mantém somente últimas oito mensagens", () => {
  const messages = Array.from({ length: 10 }, (_, index) => ({ text: `Mensagem ${index}`, direction: "inbound", sentAt: String(index) }));
  const validation = validateWhatsAppIntake({ requestId: "r-1", conversationKey: "c-1", senderName: "Ana", senderPhone: "5511999990000", messages, classification: { summary: "Pedido", priority: "medium" } });
  expect(validation.allowed).toBe(true);
  expect(validation.value!.messages.length).toBe(8);
  expect(validation.value!.messages[0].text).toBe("Mensagem 2");
  expect(normalizeWhatsAppIntake({ classification: {} }).source).toBe("whatsapp-web");
});
