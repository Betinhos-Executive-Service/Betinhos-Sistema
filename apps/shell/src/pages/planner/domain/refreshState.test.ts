import { assert, test } from "vitest";
import { buildBackgroundRefreshPatch } from "./refreshState";

test("refresh em segundo plano mantém blocos atuais enquanto dados complementares carregam", () => {
  const patch = buildBackgroundRefreshPatch(
    {
      tasks: [{ id: "old-task", detailsLoaded: true, comments: [{ id: "comment" }] }],
      quotes: [{ id: "old-quote" }],
      quality: [{ id: "old-quality" }],
      notifications: [{ id: "old-notification" }],
      contacts: [{ id: "old-contact" }],
      loading: { core: false, quotes: false, quality: false },
    },
    {
      tasks: [{ id: "new-task" }],
      quotes: [],
      quality: [],
      notifications: [],
      loading: { core: false, quotes: true, quality: true },
    },
    {
      supplemental: { status: "rejected", reason: new Error("offline") },
      photos: { status: "pending" },
      contacts: { status: "rejected", reason: new Error("offline") },
    },
  );

  assert.deepEqual(patch.tasks, [{ id: "new-task" }]);
  assert.deepEqual(patch.quotes, undefined);
  assert.deepEqual(patch.quality, undefined);
  assert.deepEqual(patch.notifications, undefined);
  assert.deepEqual(patch.contacts, undefined);
  assert.strictEqual(patch.loading.quotes, false);
  assert.strictEqual(patch.loading.quality, false);
});

test("refresh aplica cada bloco somente depois que a resposta chega", () => {
  const patch = buildBackgroundRefreshPatch(
    {
      tasks: [{ id: "new-task", detailsLoaded: true, comments: [{ id: "comment" }] }],
      notifications: [{ id: "old-notification" }],
      loading: { core: false },
    },
    { tasks: [{ id: "new-task" }], quotes: [], quality: [], notifications: [] },
    {
      supplemental: {
        status: "fulfilled",
        value: {
          tasks: [{ id: "new-task" }],
          notifications: [],
          quotes: [{ id: "new-quote" }],
          quality: [{ id: "new-quality" }],
        },
      },
      photos: { status: "fulfilled", value: { loading: { photos: false } } },
      contacts: { status: "fulfilled", value: [{ id: "new-contact" }] },
    },
  );

  assert.deepEqual(patch.tasks, [{ id: "new-task", detailsLoaded: true, comments: [{ id: "comment" }] }]);
  assert.deepEqual(patch.quotes, [{ id: "new-quote" }]);
  assert.deepEqual(patch.quality, [{ id: "new-quality" }]);
  assert.deepEqual(patch.contacts, [{ id: "new-contact" }]);
  assert.deepEqual(patch.notifications, undefined);
  assert.strictEqual(patch.loading.photos, false);
});
