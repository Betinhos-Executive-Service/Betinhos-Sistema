import assert from "node:assert/strict";
import test from "node:test";
import { buildManifest, stableAppPath } from "../src/lib/pwaManifest.ts";

test("stableAppPath remove o prefixo de versão do Dataverse", () => {
  assert.equal(stableAppPath("/%7B639000000000%7D/WebResources/new_app-motoristas-v2"), "/WebResources/new_app-motoristas-v2");
  assert.equal(stableAppPath("/WebResources/new_app-motoristas-v2"), "/WebResources/new_app-motoristas-v2");
});

test("manifest é instalável: standalone, start_url dentro do escopo e ícones 192/512/maskable", () => {
  const m = buildManifest("https://org.crm2.dynamics.com", "/%7B1%7D/WebResources/new_app-motoristas-v2", { icon192: "a", icon512: "b", iconMaskable512: "c" });
  assert.equal(m.display, "standalone");
  assert.equal(m.start_url, "https://org.crm2.dynamics.com/WebResources/new_app-motoristas-v2");
  assert.ok(m.start_url.startsWith(m.scope));
  assert.deepEqual(m.icons.map((i) => `${i.sizes}:${i.purpose}`), ["192x192:any", "512x512:any", "512x512:maskable"]);
});

test("escopo só do próprio app (não cobre o Sistema Betinhos) e nome com DEV no ambiente DEV", () => {
  const icons = { icon192: "a", icon512: "b", iconMaskable512: "c" };
  const dev = buildManifest("https://org23b93544.crm2.dynamics.com", "/WebResources/new_app-motoristas-v2", icons);
  assert.equal(dev.name, "App Betinhos Motoristas DEV");
  assert.equal(dev.short_name, "Motoristas DEV");
  assert.ok(!"https://org23b93544.crm2.dynamics.com/WebResources/cr40f_SistemaBetinhosLoader.html".startsWith(dev.scope));
  const prod = buildManifest("https://org.crm2.dynamics.com", "/WebResources/new_app-motoristas-v2", icons);
  assert.equal(prod.name, "App Betinhos Motoristas");
});
