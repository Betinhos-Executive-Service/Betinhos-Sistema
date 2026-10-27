import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import {
  addContactAttachment,
  addContactNote,
  archiveContact,
  createContact,
  createTask,
  seedState,
  updateContact,
} from "./mock";

function withStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value) });
}

afterEach(() => { vi.unstubAllGlobals(); });

test("cria caso atribuído e mantém histórico de transferência, status e resolução", () => {
  withStorage();
  const initial = seedState();
  const created = createContact(initial, { subject: "Novo pedido", senderName: "Ana", senderEmail: "ana@example.com", channel: "email", ownerEmployeeId: "employee-renan", ownerName: "Renan Martins", actorEmployeeId: "employee-renan" });
  const item = created.contacts!.find((contact) => contact.subject === "Novo pedido");
  assert.equal(item!.priority, "medium");
  assert.equal(item!.status, "new");
  const transferred = updateContact(created, item!.id, { ownerEmployeeId: "employee-marina", ownerName: "Marina Alves", status: "done", resolutionOutcome: "Retorno enviado", actorEmployeeId: "employee-renan" });
  const updated = transferred.contacts!.find((contact) => contact.id === item!.id);
  assert.equal(updated!.ownerName, "Marina Alves");
  assert.equal(updated!.status, "new");
  assert.equal(updated!.resolutionOutcome, "Retorno enviado");
  assert.ok(updated!.history!.some((event) => event.type === "transfer"));
  assert.ok(updated!.history!.some((event) => event.type === "status"));
  assert.ok(updated!.history!.some((event) => event.type === "resolution"));
  assert.ok(transferred.notifications!.some((notification) => notification.contactId === item!.id && notification.recipientEmployeeId === "employee-marina"));
});

test("usa o usuário atual como responsável padrão na criação", () => {
  withStorage();
  const initial = seedState();
  const created = createContact(initial, { subject: "Pedido sem responsável explícito", senderName: "Joana", senderPhone: "+55 11 90000-0000", channel: "phone", actorEmployeeId: "employee-renan" });
  const item = created.contacts!.find((contact) => contact.subject === "Pedido sem responsável explícito");
  assert.equal(item!.ownerEmployeeId, "employee-renan");
  assert.deepEqual(item!.assigneeIds, ["employee-renan"]);
  assert.equal(item!.ownerName, "Renan Martins");
});

test("salva nota interna e vincula task criada ao caso", () => {
  withStorage();
  const initial = seedState();
  const contact = initial.contacts![0];
  const noted = addContactNote(initial, contact.id, "Cobrar retorno às 16h", { actorEmployeeId: "employee-renan", author: "Renan Martins" });
  assert.equal(noted.contacts!.find((item) => item.id === contact.id)!.notes!.at(-1)!.text, "Cobrar retorno às 16h");
  const linkedTask = noted.tasks.length;
  const next = createTask(noted, { title: "Acompanhar contato", contactId: contact.id, assigneeIds: ["employee-renan"], assigneeName: ["Renan Martins"] });
  const updatedContact = next.contacts!.find((item) => item.id === contact.id);
  assert.equal(next.tasks.length, linkedTask + 1);
  assert.ok(updatedContact!.linkedTaskIds!.includes(next.tasks.at(-1)!.id));
  assert.equal(next.tasks.at(-1)!.contactId, contact.id);
});

test("salva e remove anexo do caso no mock", () => {
  withStorage();
  const initial = seedState();
  const contact = initial.contacts![0];
  const added = addContactAttachment(initial, contact.id, { name: "comprovante.pdf", mimeType: "application/pdf", size: 2048, previewUrl: "data:application/pdf;base64,teste" });
  const updated = added.contacts!.find((item) => item.id === contact.id);
  assert.equal(updated!.attachments!.at(-1)!.name, "comprovante.pdf");
  assert.ok(updated!.history!.some((event) => event.type === "attachment"));
  assert.throws(() => addContactAttachment(initial, contact.id, { name: "grande.zip", size: 5 * 1024 * 1024 + 1 }), /5 MB/);
});

test("notifica todos os responsáveis quando o caso é compartilhado", () => {
  withStorage();
  const initial = seedState();
  const created = createContact(initial, {
    subject: "Pedido compartilhado",
    senderName: "Bruno",
    channel: "whatsapp",
    senderPhone: "+55 11 98888-0000",
    assignmentMode: "people",
    assigneeIds: ["employee-renan", "employee-marina"],
    assigneeName: ["Renan Martins", "Marina Alves"],
    ownerEmployeeId: "employee-renan",
    ownerName: "Renan Martins",
    actorEmployeeId: "employee-renan",
  });
  const item = created.contacts!.find((contact) => contact.subject === "Pedido compartilhado");
  assert.deepEqual(item!.assigneeIds, ["employee-renan", "employee-marina"]);
  assert.ok(created.notifications!.some((notification) => notification.contactId === item!.id && notification.recipientEmployeeId === "employee-marina"));
});

test("transfere para novo e arquiva com histórico", () => {
  withStorage();
  const initial = seedState();
  const contact = initial.contacts![0];
  const transferred = updateContact(initial, contact.id, { assigneeIds: ["employee-marina"], assigneeNames: ["Marina Alves"], ownerEmployeeId: "employee-marina", ownerName: "Marina Alves", actorEmployeeId: "employee-renan" });
  const moved = transferred.contacts!.find((item) => item.id === contact.id);
  assert.equal(moved!.status, "new");
  assert.ok(moved!.history!.some((event) => event.type === "transfer"));
  const archived = archiveContact(transferred, contact.id, { actorEmployeeId: "employee-renan", author: "Renan Martins" });
  const item = archived.contacts!.find((entry) => entry.id === contact.id);
  assert.ok(item!.archivedAt);
  assert.ok(item!.history!.some((event) => event.type === "archived"));
});
