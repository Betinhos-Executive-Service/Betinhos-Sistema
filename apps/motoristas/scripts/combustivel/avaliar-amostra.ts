// Uso: node --experimental-strip-types scripts/combustivel/avaliar-amostra.ts
import { appendFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { haversineMeters, verdict } from "./geo.ts";

const dir = join(homedir(), ".betinhos", "combustivel");
const lines = readFileSync(join(dir, "amostra.csv"), "utf8").trim().split(/\r?\n/).slice(1);
const errors = lines.map((line) => {
  const cells = line.match(/"([^"]|"")*"/g)!.map((c) => c.slice(1, -1).replace(/""/g, '"'));
  const [lat, lon, conferido] = [Number(cells[3]), Number(cells[4]), cells[6]];
  const [cLat, cLon] = conferido.split(",").map((v) => Number(v.trim()));
  if (!Number.isFinite(cLat) || !Number.isFinite(cLon)) throw new Error(`Amostra sem conferência: ${cells[0]}`);
  return Math.round(haversineMeters({ lat, lon }, { lat: cLat, lon: cLon }));
});
const v = verdict(errors);
const text = `\n## Precisão (amostra de ${errors.length})\n\n- Erros (m): ${errors.sort((a, b) => a - b).join(", ")}\n- < 300 m: ${Math.round(v.share * 100)}%\n- Veredito: **${v.ok ? "APROVADO" : "REPROVADO"}** (critério ≥ 85% < 300 m)\n`;
appendFileSync(join(dir, "relatorio.md"), text);
console.log(text);
