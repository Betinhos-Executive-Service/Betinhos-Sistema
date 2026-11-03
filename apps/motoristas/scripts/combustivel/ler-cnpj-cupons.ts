// Uso: ANTHROPIC_API_KEY=... node --experimental-strip-types scripts/combustivel/ler-cnpj-cupons.ts
// Lê abastecimentos.csv, chama o Claude por cupom (1 por vez) e grava cnpjs.csv. Retoma de onde parou.
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, extname } from "node:path";
import { buildCnpjVisionRequest, parseCnpjVisionResponse } from "./geo.ts";

const dir = join(homedir(), ".betinhos", "combustivel");
const key = process.env.ANTHROPIC_API_KEY;
if (!key) throw new Error("Defina ANTHROPIC_API_KEY.");

const parseCsv = (file: string) => {
  const [head, ...lines] = readFileSync(file, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
  const cols = head.split(",").map((c) => c.replace(/"/g, ""));
  return lines.map((line) => {
    const values = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((v) => v.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'));
    return Object.fromEntries(cols.map((c, i) => [c, values[i] ?? ""]));
  });
};

const out = join(dir, "cnpjs.csv");
const done = new Set(existsSync(out) ? parseCsv(out).map((r) => r.despesaId) : []);
if (!existsSync(out)) appendFileSync(out, "despesaId,cnpj\n");

let lidos = 0;
let nulos = 0;
for (const row of parseCsv(join(dir, "abastecimentos.csv"))) {
  if (!row.arquivo || done.has(row.despesaId)) continue;
  const mediaType = extname(row.arquivo) === ".png" ? "image/png" : "image/jpeg";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(buildCnpjVisionRequest(readFileSync(row.arquivo).toString("base64"), mediaType))
  });
  const cnpj = response.ok ? parseCnpjVisionResponse(await response.json()) : null;
  if (!response.ok) console.error(`[combustivel] HTTP ${response.status} em ${row.despesaId}`);
  appendFileSync(out, `${row.despesaId},${cnpj ?? ""}\n`);
  cnpj ? lidos++ : nulos++;
}
console.log(`[combustivel] CNPJ lido: ${lidos}; sem CNPJ: ${nulos}; arquivo: ${out}`);
