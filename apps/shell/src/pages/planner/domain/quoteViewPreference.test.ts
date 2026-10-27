import assert from 'node:assert/strict'
import { test } from 'vitest'
import { readQuoteViewPreference, saveQuoteViewPreference } from "./quoteViewPreference";

test("visualização de cotações usa Kanban sem preferência válida e preserva Lista", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
  assert.equal(readQuoteViewPreference(storage), "kanban");
  saveQuoteViewPreference("list", storage);
  assert.equal(readQuoteViewPreference(storage), "list");
  saveQuoteViewPreference("kanban", storage);
  assert.equal(readQuoteViewPreference(storage), "kanban");
  saveQuoteViewPreference("invalid", storage);
  assert.equal(readQuoteViewPreference(storage), "kanban");
  values.set("betinhos-quotes-hybrid-v3-view", "invalid");
  assert.equal(readQuoteViewPreference(storage), "kanban");
});
