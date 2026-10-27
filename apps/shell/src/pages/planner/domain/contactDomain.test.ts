import { expect, test } from 'vitest'
import {
  buildLinkedTaskInput,
  canTransitionContactStatus,
  contactPermissions,
  contactStats,
  filterContacts,
  normalizeContact,
  sortContacts,
  validateContact,
} from "./contactDomain";

const contact = (overrides = {}) => normalizeContact({
  id: "c-1",
  subject: "Retorno do embarque",
  senderName: "Cliente",
  senderPhone: "+55 11 98888-0000",
  channel: "whatsapp",
  receivedAt: "2026-09-03T10:00:00Z",
  lastMessageAt: "2026-09-03T10:00:00Z",
  priority: "medium",
  status: "new",
  ownerEmployeeId: "e-1",
  ownerName: "Renan",
  ...overrides,
});

test("normaliza defaults e valida o contrato do caso", () => {
  const normalized = normalizeContact({ subject: "  Assunto  ", senderName: "Cliente" });
  expect(normalized.subject).toBe("Assunto");
  expect(normalized.priority).toBe("medium");
  expect(normalized.status).toBe("new");
  expect(validateContact({ ...normalized, senderPhone: "+55 11 98888-0000" }).allowed).toBe(true);
  expect(normalizeContact({ ...normalized, message: "Pedido recebido" }).lastMessage).toBe("Pedido recebido");
  expect(validateContact({ ...normalized, subject: "" }).allowed).toBe(false);
});

test("expõe transições operacionais de status", () => {
  expect(canTransitionContactStatus("new", "in_progress")).toBe(true);
  expect(canTransitionContactStatus("waiting", "done")).toBe(true);
  expect(canTransitionContactStatus("resolved", "done")).toBe(true);
  expect(canTransitionContactStatus("archived", "in_progress")).toBe(true);
});

test("filtra por mensagem, canal, status, prioridade e responsável", () => {
  const contacts = [contact(), contact({ id: "c-2", senderPhone: "", senderEmail: "ana@example.com", status: "waiting", priority: "high", ownerEmployeeId: "e-2", lastMessage: "Anexo da nota fiscal" })];
  expect(filterContacts(contacts, { query: "nota fiscal" }).length).toBe(1);
  expect(filterContacts(contacts, { channel: ["email"], status: ["waiting"], priority: ["high"], owner: ["e-2"] }).length).toBe(1);
  expect(filterContacts([contact({ status: "archived" })]).length).toBe(0);
  expect(filterContacts([contact({ status: "archived" })], { includeArchived: true }).length).toBe(1);
});

test("ordena por prioridade, prazo e mensagem mais recente", () => {
  const contacts = [
    contact({ id: "low", priority: "low", dueDate: "2026-09-03", lastMessageAt: "2026-09-03T12:00:00Z" }),
    contact({ id: "high", priority: "high", dueDate: "2026-09-05", lastMessageAt: "2026-09-03T09:00:00Z" }),
    contact({ id: "medium-late", priority: "medium", dueDate: "2026-09-06", lastMessageAt: "2026-09-03T13:00:00Z" }),
    contact({ id: "medium-early", priority: "medium", dueDate: "2026-09-04", lastMessageAt: "2026-09-03T08:00:00Z" }),
  ];
  expect(sortContacts(contacts, "2026-09-01").map((item) => item.id)).toStrictEqual(["high", "medium-early", "medium-late", "low"]);
});

test("calcula indicadores, permissões e task vinculada", () => {
  const contacts = [contact(), contact({ id: "c-2", status: "in_progress" }), contact({ id: "c-3", status: "waiting", dueDate: "2026-09-02" }), contact({ id: "c-4", status: "archived" })];
  expect(contactStats(contacts, "2026-09-03")).toStrictEqual({ total: 3, new: 1, inProgress: 1, waiting: 1, overdue: 1 });
  expect(contactPermissions(contacts[0], { employeeId: "e-1" }).canTransfer).toBe(true);
  expect(contactPermissions(contacts[0], { employeeId: "e-2" }).canEdit).toBe(false);
  expect(contactPermissions(contacts[0], { employeeId: "e-2", isManager: true }).canArchive).toBe(true);
  expect(buildLinkedTaskInput(contacts[0])).toStrictEqual({ title: "Retorno do embarque", description: "", priority: "medium", dueDate: "", assignmentMode: "people", teamIds: [], teamNames: [], teamId: "", teamName: "", assigneeIds: ["e-1"], assigneeNames: ["Renan"], assigneeName: ["Renan"], contactId: "c-1", sourceType: "contact", sourceId: "c-1", sourceLabel: "Caso de atendimento" });
});

test("preserva múltiplos responsáveis e permite filtrar qualquer pessoa selecionada", () => {
  const shared = contact({
    assigneeIds: ["e-1", "e-2"],
    assigneeNames: ["Renan", "Marina"],
    assigneeName: ["Renan", "Marina"],
  });
  expect(shared.assigneeIds).toStrictEqual(["e-1", "e-2"]);
  expect(filterContacts([shared], { owner: ["e-2"] }).length).toBe(1);
  expect(contactPermissions(shared, { employeeId: "e-2" }).canEdit).toBe(true);
  expect(buildLinkedTaskInput(shared).assigneeIds).toStrictEqual(["e-1", "e-2"]);
  expect(buildLinkedTaskInput(shared).assigneeName).toStrictEqual(["Renan", "Marina"]);
});

test("exige telefone ou e-mail e mantém a observação de aguardando", () => {
  const noContact = contact({ senderPhone: "", senderEmail: "" });
  const email = contact({ senderPhone: "", senderEmail: "ana@example.com", status: "waiting" });
  const phone = contact({ senderPhone: "+55 11 99999-0000", senderEmail: "" });
  expect(validateContact(noContact).allowed).toBe(false);
  expect(validateContact(email).allowed).toBe(true);
  expect(validateContact(phone).allowed).toBe(true);
  expect(validateContact({ ...email, senderEmail: "", senderPhone: "" }).allowed).toBe(false);
  expect(email.waitingNote).toBe("Esperando resposta");
});

test("oculta concluídos por padrão e prioriza vencidos na ordenação", () => {
  const overdue = contact({ id: "overdue", priority: "low", dueDate: "2026-09-02" });
  const urgent = contact({ id: "urgent", priority: "high", dueDate: "2026-09-05" });
  const done = contact({ id: "done", status: "done", dueDate: "2026-09-01" });
  expect(sortContacts([urgent, overdue], "2026-09-03").map((item) => item.id)).toStrictEqual(["overdue", "urgent"]);
  expect(filterContacts([done]).length).toBe(0);
  expect(filterContacts([done], { includeCompleted: true }).length).toBe(1);
});
