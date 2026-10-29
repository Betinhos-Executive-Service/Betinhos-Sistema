import { test } from "vitest";
import assert from "node:assert/strict";
import { preservePanelScroll } from "./selectScroll.js";

test("restaura scroll do painel após alterar seleção", () => {
  const panel = { scrollTop: 184 };
  const frames = [];
  let changed = false;

  preservePanelScroll(
    panel,
    0,
    () => {
      changed = true;
      panel.scrollTop = 0;
    },
    (callback) => frames.push(callback),
  );

  assert.equal(changed, true);
  assert.equal(panel.scrollTop, 0);
  frames.shift()();
  assert.equal(panel.scrollTop, 184);
});
