import assert from 'node:assert/strict'
import { test } from 'vitest'
import { commitQuoteSend } from "./quoteSendBatch";

const operations = [
  { method: "POST", path: "/versions", body: { id: "version-1" } },
  { method: "PATCH", path: "/quotes(1)", etag: 'W/"10"', body: { sent: true } },
  { method: "PATCH", path: "/tasks(1)", body: { status: "done" } },
  { method: "POST", path: "/events", body: { field: "quote:sent" } },
];
test("versão, cotação, tarefa e histórico compartilham uma única changeset com ETag", async () => {
  await commitQuoteSend("https://dev/api/data/v9.2", operations, "attempt", async (url, request) => {
    assert.equal(url, "https://dev/api/data/v9.2/$batch");
    assert.equal(request.credentials, "include");
    assert.match(request.body, /If-Match: W\/"10"/);
    assert.equal((request.body.match(/Content-ID:/g) || []).length, 4);
    assert.equal((request.body.match(/--changeset_attempt--/g) || []).length, 1);
    return { ok: true, text: async () => "HTTP/1.1 201 Created\r\nHTTP/1.1 204 No Content\r\nHTTP/1.1 204 No Content\r\nHTTP/1.1 201 Created" };
  });
});
test("batch externo 200 não mascara erro interno, conflito ou resposta incompleta", async () => {
  for (const body of ["HTTP/1.1 400 Bad Request", "HTTP/1.1 201 Created", ""]) {
    await assert.rejects(commitQuoteSend("https://dev/api", operations, "attempt", async () => ({ ok: true, text: async () => body })), /Não foi possível confirmar/);
  }
  await assert.rejects(commitQuoteSend("https://dev/api", operations, "attempt", async () => ({ ok: true, text: async () => "HTTP/1.1 412 Precondition Failed" })), /alterada por outra pessoa/);
});
