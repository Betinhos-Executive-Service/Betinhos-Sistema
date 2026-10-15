import assert from "node:assert/strict";
import test from "node:test";
import { setTorch, stopStreamTracks, supportsTorch } from "../src/lib/cameraTorch.ts";

type FakeTrack = { calls: unknown[]; stopped: boolean; caps?: Record<string, unknown> | (() => never); fail?: boolean };

function fakeTrack(caps?: FakeTrack["caps"], fail = false) {
  const state: FakeTrack = { calls: [], stopped: false, caps, fail };
  const track = {
    kind: "video",
    getCapabilities: caps === undefined ? undefined : () => (typeof caps === "function" ? caps() : caps),
    applyConstraints: async (c: unknown) => {
      state.calls.push(c);
      if (fail) throw new Error("NotSupportedError");
    },
    stop: () => { state.stopped = true; }
  };
  return { track: track as unknown as MediaStreamTrack, state };
}

test("lanterna só aparece quando o track declara torch", () => {
  assert.equal(supportsTorch(fakeTrack({ torch: true }).track), true);
  assert.equal(supportsTorch(fakeTrack({ torch: false }).track), false);
  assert.equal(supportsTorch(fakeTrack({}).track), false);
  assert.equal(supportsTorch(fakeTrack(undefined).track), false);
  assert.equal(supportsTorch(fakeTrack(() => { throw new Error("x"); }).track), false);
  assert.equal(supportsTorch(null), false);
});

test("liga e desliga com advanced torch; falha devolve false", async () => {
  const ok = fakeTrack({ torch: true });
  assert.equal(await setTorch(ok.track, true), true);
  assert.equal(await setTorch(ok.track, false), true);
  assert.deepEqual(ok.state.calls, [{ advanced: [{ torch: true }] }, { advanced: [{ torch: false }] }]);
  const ruim = fakeTrack({ torch: true }, true);
  assert.equal(await setTorch(ruim.track, true), false);
  assert.equal(await setTorch(null, true), false);
});

test("ao parar a câmera (sair, trocar de câmera, capturar) desliga a lanterna antes de parar os tracks", () => {
  const video = fakeTrack({ torch: true });
  const audio = fakeTrack({});
  const stream = { getTracks: () => [video.track, audio.track], getVideoTracks: () => [video.track] } as unknown as MediaStream;
  stopStreamTracks(stream, true);
  assert.deepEqual(video.state.calls, [{ advanced: [{ torch: false }] }]);
  assert.equal(video.state.stopped, true);
  assert.equal(audio.state.stopped, true);

  const semLanterna = fakeTrack({ torch: true });
  stopStreamTracks({ getTracks: () => [semLanterna.track], getVideoTracks: () => [semLanterna.track] } as unknown as MediaStream, false);
  assert.deepEqual(semLanterna.state.calls, []);
  assert.equal(semLanterna.state.stopped, true);
  stopStreamTracks(null, true);
});
