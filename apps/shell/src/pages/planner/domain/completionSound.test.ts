import { expect, test } from 'vitest'

const g = globalThis as unknown as Record<string, unknown>

import { playCompletionSound, prepareCompletionSound } from "./completionSound";

test("prepara e toca o M4A curto de conclusão", async () => {
  const previousAudioContext = g.AudioContext;
  const previousWebkitAudioContext = g.webkitAudioContext;
  const previousFetch = g.fetch;
  const calls: unknown[] = [];

  class FakeAudioContext {
    state = "suspended";
    destination = {};

    resume() {
      calls.push("resume");
      this.state = "running";
      return Promise.resolve();
    }

    decodeAudioData(data: ArrayBuffer) {
      calls.push(["decodeAudioData", data.byteLength]);
      return Promise.resolve({ duration: 1 });
    }

    createBufferSource() {
      calls.push("createBufferSource");
      return {
        connect: () => undefined,
        start: () => calls.push("start"),
        buffer: undefined,
      };
    }

    createGain() {
      calls.push("createGain");
      return { gain: { value: 0 }, connect: () => undefined };
    }
  }

  g.AudioContext = FakeAudioContext;
  g.webkitAudioContext = undefined;
  g.fetch = async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8),
  });

  try {
    prepareCompletionSound();
    playCompletionSound();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls.filter((call) => call === "createBufferSource").length).toBe(1);
    expect(calls.filter((call) => call === "start").length).toBe(1);
    expect(calls.some((call) => Array.isArray(call) && call[0] === "decodeAudioData")).toBeTruthy();
    expect(calls.includes("resume")).toBeTruthy();
  } finally {
    g.AudioContext = previousAudioContext;
    g.webkitAudioContext = previousWebkitAudioContext;
    g.fetch = previousFetch;
  }
});
