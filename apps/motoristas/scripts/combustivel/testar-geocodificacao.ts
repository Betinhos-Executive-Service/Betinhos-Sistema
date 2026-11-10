// Uso: node --experimental-strip-types scripts/combustivel/testar-geocodificacao.ts
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { brasilApiUrl, nominatimUrl, parseBrasilApi, parseNominatim, summarize, type Endereco, type Geo, type PostoRow } from "./geo.ts";

const dir = join(homedir(), ".betinhos", "combustivel");
const UA = "BetinhosAppMotoristas/1.0 (+https://betinhos.com.br)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

const cnpjs = [...new Set(readFileSync(join(dir, "cnpjs.csv"), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(",")[1]).filter(Boolean))];
const rows: Array<PostoRow & { endereco: Endereco | null }> = [];
for (const cnpj of cnpjs) {
  const br = await fetch(brasilApiUrl(cnpj), { headers: { "user-agent": UA } });
  const endereco = br.ok ? parseBrasilApi(await br.json()) : null;
  let geo: Geo | null = null;
  if (endereco) {
    await sleep(1100); // política do Nominatim: no máximo 1 req/s
    const nm = await fetch(nominatimUrl(endereco), { headers: { "user-agent": UA, "accept-language": "pt-BR" } });
    geo = nm.ok ? parseNominatim(await nm.json()) : null;
  }
  rows.push({ cnpj, brasilApi: Boolean(endereco), geo, endereco });
  await sleep(400);
}

writeFileSync(join(dir, "postos.csv"), ["cnpj,nome,logradouro,numero,bairro,municipio,uf,cep,lat,lon,precisao",
  ...rows.map((r) => [r.cnpj, r.endereco?.nome, r.endereco?.logradouro, r.endereco?.numero, r.endereco?.bairro, r.endereco?.municipio, r.endereco?.uf, r.endereco?.cep, r.geo?.lat, r.geo?.lon, r.geo?.precisao].map(csv).join(","))].join("\n"));

const geocoded = rows.filter((r) => r.geo);
const sample = [...geocoded].sort(() => Math.random() - 0.5).slice(0, 20);
writeFileSync(join(dir, "amostra.csv"), ["cnpj,nome,endereco,lat,lon,maps,conferido",
  ...sample.map((r) => [r.cnpj, r.endereco!.nome, `${r.endereco!.logradouro}, ${r.endereco!.numero} - ${r.endereco!.bairro}, ${r.endereco!.municipio}/${r.endereco!.uf}`, r.geo!.lat, r.geo!.lon,
    `https://www.google.com/maps/search/${encodeURIComponent(`${r.endereco!.nome} ${r.endereco!.logradouro} ${r.endereco!.numero} ${r.endereco!.municipio}`)}`, ""].map(csv).join(","))].join("\n"));

const s = summarize(rows);
const pct = (n: number) => (s.total ? `${Math.round((n / s.total) * 100)}%` : "0%");
writeFileSync(join(dir, "relatorio.md"), `# Fase 0 — cobertura\n\n- Postos distintos: ${s.total}\n- Encontrados na BrasilAPI: ${s.encontrados} (${pct(s.encontrados)})\n- Geocodificados: ${s.geocodificados} (${pct(s.geocodificados)})\n- Nível de rua: ${s.rua} (${pct(s.rua)})\n\nPróximo passo: preencher a coluna \`conferido\` de amostra.csv com "lat,lon" do Google Maps e rodar avaliar-amostra.ts.\n`);
console.log(`[combustivel] ${JSON.stringify(s)}`);
