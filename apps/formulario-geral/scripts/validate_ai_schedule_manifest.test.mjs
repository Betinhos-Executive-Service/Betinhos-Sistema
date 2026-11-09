import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifest } from "./validate_ai_schedule_manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "docs", "power-platform", "ai_schedule_solution_manifest.json"), "utf8"));

const unresolved = validateManifest(manifest);
assert.equal(unresolved.ok, false);
assert.ok(unresolved.errors.some((error) => error.includes("PREENCHER_PUBLISHER")));

const resolved = {
  solution: { name: "BetinhosDEV", publisher: "BetinhosPublisher", environment: "DEV" },
  sessionTable: {
    logicalName: "cr40f_conversaiaagendamento", entitySetName: "cr40f_conversaiaagendamentos", primaryNameAttribute: "cr40f_name",
    columns: [{ logicalName: "cr40f_status", type: "Choice" }, { logicalName: "cr40f_versaoentrada", type: "WholeNumber" }]
  },
  reservationTable: {
    logicalName: "cr40f_reservadeveculos", entitySetName: "cr40f_reservadeveculoses", primaryNameAttribute: "cr40f_id",
    requiredAdditions: [
      { logicalName: "cr40f_conversaoiaagendamento", type: "Lookup", target: "cr40f_conversaiaagendamento" },
      { logicalName: "cr40f_iaordinalservico", type: "WholeNumber" }
    ],
    alternateKey: { name: "cr40f_ak_conversaia_ordinal", columns: ["cr40f_conversaoiaagendamento", "cr40f_iaordinalservico"], status: "published" }
  },
  connector: { name: "Betinhos DeepSeek", connectionReference: "cr40f_deepseek_connection" }
};
const metadata = {
  tables: [
    { logicalName: resolved.sessionTable.logicalName, entitySetName: resolved.sessionTable.entitySetName, primaryNameAttribute: resolved.sessionTable.primaryNameAttribute, attributes: [{ logicalName: "cr40f_status", type: "Picklist" }, { logicalName: "cr40f_versaoentrada", type: "Integer" }] },
    { logicalName: resolved.reservationTable.logicalName, entitySetName: resolved.reservationTable.entitySetName, primaryNameAttribute: resolved.reservationTable.primaryNameAttribute, attributes: [{ logicalName: "cr40f_conversaoiaagendamento", type: "Lookup", targets: ["cr40f_conversaiaagendamento"] }, { logicalName: "cr40f_iaordinalservico", type: "Integer" }] }
  ]
};
assert.deepEqual(validateManifest(resolved, metadata), { ok: true, errors: [] });

const cli = spawnSync(process.execPath, [
  path.join(root, "scripts", "validate_ai_schedule_manifest.mjs"),
  "--metadata", path.join(root, "arquivo-inexistente-metadata.json")
], { encoding: "utf8" });
assert.equal(cli.status, 1);
assert.match(cli.stdout, /arquivo de metadata não encontrado/);

console.log("validate_ai_schedule_manifest.test: ok");
