// Geocodificação das etapas: limpa o texto da reserva (nome de passageiro, apto, abreviações), monta
// até 3 consultas e tenta TomTom → Photon → Nominatim, recusando resultado genérico ou longe demais.
// Também gera o rótulo público da etapa: o texto bruto da reserva nunca vai para a página.
import { distanciaMetros } from "./infleet.mjs";
import { areaDoLugar, caixaDoLugar } from "./local.mjs";

export const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const UF = /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/i;
const RUA = /^(rua|avenida|alameda|estrada|rodovia|praça|travessa|largo|marginal|viaduto|ladeira)\b/i;
// Só um pedaço com palavra de lugar vira estabelecimento/rótulo: o resto pode ser nome de pessoa.
const LUGAR = /(^|[\s(])(hotel|flat|aeroporto|shopping|terminal|hospital|cl[ií]nica|edif[ií]cio|condom[ií]nio|residencial|restaurante|escrit[oó]rio|clube|teatro|est[aá]dio|faculdade|universidade|col[eé]gio|escola|igreja|rodovi[aá]ria|porto|esta[cç][aã]o|museu|parque|centro de conven[cç][oõ]es|gru|cgh|vcp|sdu|gig)(?=$|[\s,.)])/i;
const RUA_NO_MEIO = /\s(rua|avenida|alameda|estrada|rodovia|praça|travessa|largo|marginal|viaduto|ladeira)\s/i;
// Códigos internos ("F300", "AA 963", "LA1234"): não são endereço.
const CODIGO = /\b([A-Z]\d{2,4}|[A-Z]{2}\s?\d{2,4})\b/g;
const COMPLEMENTO = /[,\s]*\b(?:apto|apartamento|ap|bloco|bl|sala|sl|conj|conjunto|cj)\b\.?\s*[\w/-]*/gi;

// Centros usados como viés da busca e para conferir a cidade do resultado.
const SP = { cidade: "São Paulo", uf: "SP", lat: -23.55, lon: -46.63 };
const CIDADES = Object.fromEntries([
  SP,
  { cidade: "Rio de Janeiro", uf: "RJ", lat: -22.91, lon: -43.2 },
  { cidade: "São José dos Campos", uf: "SP", lat: -23.19, lon: -45.88 },
  { cidade: "Campinas", uf: "SP", lat: -22.91, lon: -47.06 },
  { cidade: "Guarulhos", uf: "SP", lat: -23.46, lon: -46.53 },
  { cidade: "Sorocaba", uf: "SP", lat: -23.5, lon: -47.46 },
  { cidade: "Santos", uf: "SP", lat: -23.96, lon: -46.33 },
  { cidade: "Pindamonhangaba", uf: "SP", lat: -22.92, lon: -45.46 },
  { cidade: "Taubaté", uf: "SP", lat: -23.03, lon: -45.56 },
  { cidade: "Jundiaí", uf: "SP", lat: -23.19, lon: -46.88 },
  { cidade: "Barueri", uf: "SP", lat: -23.51, lon: -46.88 },
  { cidade: "Osasco", uf: "SP", lat: -23.53, lon: -46.79 },
  { cidade: "Santo André", uf: "SP", lat: -23.66, lon: -46.53 },
  { cidade: "São Bernardo do Campo", uf: "SP", lat: -23.69, lon: -46.56 },
  { cidade: "Belo Horizonte", uf: "MG", lat: -19.92, lon: -43.94 },
  { cidade: "Curitiba", uf: "PR", lat: -25.43, lon: -49.27 },
  { cidade: "Brasília", uf: "DF", lat: -15.79, lon: -47.88 },
].map((c) => [semAcento(c.cidade), c]));
export const cidadeConhecida = (nome) => CIDADES[semAcento(nome)] ?? null;

const ABREVIACOES = [
  [/\bAv\.?(?=\s)/gi, "Avenida"], [/\bR\.(?=\s)/g, "Rua"], [/\bAl\.(?=\s)/gi, "Alameda"], [/\bPres\.(?=\s)/gi, "Presidente"],
  [/\bDr\.(?=\s)/gi, "Doutor"], [/\bProf\.(?=\s)/gi, "Professor"], [/\bBrig\.(?=\s)/gi, "Brigadeiro"], [/\bEng\.(?=\s)/gi, "Engenheiro"],
  [/\bP[cç]a\.?(?=\s)/gi, "Praça"], [/\bP[cç]\.(?=\s)/gi, "Praça"], [/\bRod\.(?=\s)/gi, "Rodovia"], [/\bEstr\.(?=\s)/gi, "Estrada"],
  [/\bAerop\w*\.?(?=\s|$)/gi, "Aeroporto"],
];
export const expandirAbreviacoes = (s) => ABREVIACOES.reduce((t, [re, por]) => t.replace(re, por), String(s ?? ""));

// Lugares que a operação escreve abreviado ("Aerop. Guarulhos AA 963", "CGH", "GRU T3").
const AEROPORTO = /\b(aerop\w*\.?|airport)/i;
const LUGARES = [
  { quando: (s) => /\b(gru|cumbica)\b/i.test(s) || (AEROPORTO.test(s) && /guarulhos/i.test(s)), consulta: "Aeroporto Internacional de Guarulhos", rotulo: "Aeroporto de Guarulhos", cidade: "Guarulhos" },
  { quando: (s) => /\b(cgh|congonhas)\b/i.test(s), consulta: "Aeroporto de Congonhas, São Paulo", rotulo: "Aeroporto de Congonhas", cidade: "São Paulo" },
  { quando: (s) => /\b(vcp|viracopos)\b/i.test(s), consulta: "Aeroporto Internacional de Viracopos, Campinas", rotulo: "Aeroporto de Viracopos", cidade: "Campinas" },
  { quando: (s) => /\b(sdu|santos dumont)\b/i.test(s), consulta: "Aeroporto Santos Dumont, Rio de Janeiro", rotulo: "Aeroporto Santos Dumont", cidade: "Rio de Janeiro" },
  { quando: (s) => /\b(gig|gale[aã]o)\b/i.test(s), consulta: "Aeroporto do Galeão, Rio de Janeiro", rotulo: "Aeroporto do Galeão", cidade: "Rio de Janeiro" },
  // Embraer perto do aeroporto de SJC: a operação chama pelos prédios (F300, F11, F32, F46) ou pela avenida; os mapas não conhecem esses nomes.
  { quando: (s) => /\b(f300|f11|f32|f46|osires silva|faria lima)\b/i.test(s) && /embraer|\bf(300|11|32|46)\b|osires/i.test(s) || (/\bembraer\b/i.test(s) && !/gavi[aã]o|botucatu|sorocaba|eug[eê]nio de melo|belo horizonte|jacare[ií]/i.test(s)), consulta: "Embraer, Jardim do Lago, São José dos Campos", rotulo: "Embraer", cidade: "São José dos Campos", coord: { lat: -23.2324983, lon: -45.8519596 } },
  // Kenvue SJC (antiga fábrica da Johnson & Johnson, Band-Aid; Meditech no mesmo complexo), na Dutra: "Rodovia Presidente Dutra" sozinha cai em qualquer ponto da rodovia.
  { quando: (s) => /\b(kenvue|band[- ]?aid|johnson|j\s?&\s?j|medi?tech)\b/i.test(s) && !/s[aã]o paulo|campinas|guarulhos|rio de janeiro/i.test(s), consulta: "Kenvue, Rodovia Presidente Dutra, São José dos Campos", rotulo: "Kenvue", cidade: "São José dos Campos", coord: { lat: -23.236095, lon: -45.9252233 } },
];
export const lugarConhecido = (texto) => LUGARES.find((l) => l.quando(String(texto ?? ""))) ?? null;
export const lugaresConhecidos = (texto) => LUGARES.filter((l) => l.quando(String(texto ?? ""))).map((l) => l.consulta);

// Nome de pessoa antes de " - ": caixa alta sem número nem palavra de lugar ("FABIANA", "MUHIDINOV, RAKHIMOV").
const ehNome = (p) => !/\d/.test(p) && !LUGAR.test(p) && !RUA.test(p) && !cidadeConhecida(p) && p === p.toUpperCase() && /[A-ZÀ-Ý]{2}/.test(p);

/** Primeira linha sem horário, "N. Nome - ", nomes em caixa alta, apto/bloco/sala e códigos. */
export function limparTexto(texto) {
  let s = String(texto ?? "").split(/\r?\n|;/).map((l) => l.trim()).find(Boolean) ?? "";
  const numerada = /^\d+\.\s*/.test(s);
  s = s.replace(/^\d+\.\s*/, "").replace(/^\d{1,2}:\d{2}\s*-\s*/, "");
  let partes = s.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  // "1. Fulano - Hotel X - Rua Y": o primeiro pedaço da linha numerada é o passageiro.
  if (numerada && partes.length > 1 && !/\d/.test(partes[0]) && !LUGAR.test(partes[0]) && !RUA.test(expandirAbreviacoes(partes[0]))) partes.shift();
  while (partes.length > 1 && ehNome(partes[0])) partes.shift();
  return expandirAbreviacoes(partes.join(" - ")).replace(COMPLEMENTO, "").replace(CODIGO, "")
    .replace(/\s{2,}/g, " ").replace(/\s*,\s*(,\s*)+/g, ", ").replace(/[\s,]+$/, "").replace(/\s+-\s*$/, "").trim();
}

const pedacos = (s) => s.split(/\s+-\s+|,/).map((p) => p.trim()).filter(Boolean);

function cidadeDe(limpo) {
  const ps = pedacos(limpo);
  for (let i = ps.length - 1; i >= 0; i--) {
    const m = ps[i].match(/^([^\d/]+?)\s*\/\s*([A-Za-z]{2})$/); // "São Paulo/SP"
    if (m && UF.test(m[2])) return { cidade: m[1].trim(), uf: m[2].toUpperCase() };
  }
  const iUf = ps.findIndex((p, i) => i > 0 && UF.test(p)); // "Cidade, UF" e "Cidade - UF"
  if (iUf > 0 && !/\d/.test(ps[iUf - 1])) return { cidade: ps[iUf - 1], uf: ps[iUf].toUpperCase() };
  for (let i = ps.length - 1; i >= 0; i--) { const c = cidadeConhecida(ps[i]); if (c) return { cidade: c.cidade, uf: c.uf }; }
  // "- Bairro, Cidade" no fim.
  const ultima = limpo.split(/\s+-\s+/).at(-1) ?? "";
  const cps = ultima.split(",").map((p) => p.trim()).filter(Boolean);
  const fim = cps.at(-1);
  if (cps.length > 1 && fim && !/\d/.test(fim) && !RUA.test(fim)) return { cidade: fim, uf: null };
  return null;
}

/** Cidade e UF citadas no texto ou `null`. */
export const cidadeDoTexto = (texto) => cidadeDe(limparTexto(texto));

/** Campos para geocodificar: { local, logradouro, bairro, cidade, uf, lugar }. */
export function interpretarEndereco(texto) {
  const limpo = limparTexto(texto);
  const cid = cidadeDe(limpo);
  const lugar = LUGARES.find((l) => l.quando(String(texto ?? ""))) ?? null;
  const ehCidade = (p) => (cid && semAcento(p) === semAcento(cid.cidade)) || UF.test(p) || /^[^\d/]+\/[A-Za-z]{2}$/.test(p) || cidadeConhecida(p);
  // "Fabiana Rua X 12": corta o que vem antes da palavra de logradouro.
  const partes = limpo.split(/\s+-\s+/).map((p) => { const m = p.match(RUA_NO_MEIO); return (m ? p.slice(m.index + 1) : p).trim(); }).filter(Boolean);
  const iRua = partes.findIndex((p) => RUA.test(p) || /\d/.test(p));
  let logradouro = null, bairro = null;
  if (iRua >= 0) {
    const resto = partes.slice(iRua).flatMap((p) => p.split(",").map((x) => x.trim()).filter(Boolean));
    const rua = resto[0];
    const numero = /\d/.test(rua) ? null : resto.find((x) => /^\d+[A-Za-z]?$/.test(x));
    const segue = resto[1] && /^\d+[A-Za-z]?$/.test(resto[1]) ? resto[1] : null;
    logradouro = [rua, segue ?? numero].filter(Boolean).join(", ");
    bairro = resto.slice(1).find((x) => !/\d/.test(x) && !ehCidade(x)) ?? null;
  }
  const antes = partes.slice(0, iRua >= 0 ? iRua : partes.length).filter((p) => !ehCidade(p) && !ehNome(p));
  const local = antes.find((p) => LUGAR.test(p)) ?? null;
  // Sem rua nem palavra de lugar ("Rio de Janeiro - Ritz Leblon"): o pedaço só entra na consulta, nunca no rótulo.
  const termo = !local && iRua < 0 && !lugar ? antes[0] ?? null : null;
  return { local, termo, logradouro, bairro, cidade: cid?.cidade ?? lugar?.cidade ?? null, uf: cid?.uf ?? (lugar ? cidadeConhecida(lugar.cidade)?.uf : null) ?? null, lugar };
}

/** Rótulo público curto: lugar conhecido, estabelecimento ou "rua, número"; `null` se nada serve. */
export const rotuloDe = (c) => c?.lugar?.rotulo ?? c?.local ?? c?.logradouro ?? null;

/** Rótulo seguro para a página: limpa de novo (links antigos guardaram o texto bruto). */
export function rotuloSeguro(texto, padrao) {
  if (!texto) return padrao;
  return rotuloDe(interpretarEndereco(texto)) || padrao;
}

const juntar = (...xs) => [...new Set(xs.filter(Boolean))].join(", ");

/** Até 3 consultas, sem repetir a cidade: com estabelecimento "local, cidade, uf"; senão "logradouro, cidade, uf". */
export function candidatosDe(c) {
  const lista = [];
  if (c.lugar) lista.push(c.lugar.consulta);
  lista.push(c.local ? juntar(c.local, c.cidade, c.uf) : juntar(c.logradouro ?? c.termo, c.cidade, c.uf));
  if (c.local && c.logradouro) lista.push(juntar(c.logradouro, c.cidade, c.uf), juntar(c.local, c.logradouro, c.cidade));
  else if (c.logradouro && c.bairro) lista.push(juntar(c.logradouro, c.bairro, c.cidade, c.uf));
  return [...new Set(lista.filter((x) => x && x.length >= 4))].slice(0, 3);
}

export const candidatosEndereco = (texto) => candidatosDe(interpretarEndereco(texto));

export const SALTO_GEO_M = 600000;
const RAIO_CIDADE_M = 80000;

function aceitavel(h, c, ref, vizinho) {
  if (!h || !Number.isFinite(h.lat) || !Number.isFinite(h.lon)) return false;
  if (h.generico && (c.local || c.logradouro || c.lugar || c.termo)) return false;
  if (vizinho && distanciaMetros(vizinho.lat, vizinho.lon, h.lat, h.lon) > SALTO_GEO_M) return false;
  if (!c.cidade) {
    // Rua sem cidade: só vale perto da etapa vizinha (a avenida homônima de outra cidade não serve). Local/aeroporto/termo podem ser longe.
    if (vizinho && c.logradouro && !c.local && !c.lugar && !c.termo) return distanciaMetros(vizinho.lat, vizinho.lon, h.lat, h.lon) <= RAIO_CIDADE_M;
    return true;
  }
  if (h.cidade) { const a = semAcento(h.cidade), b = semAcento(c.cidade); return a.includes(b) || b.includes(a); }
  if (ref) return distanciaMetros(ref.lat, ref.lon, h.lat, h.lon) <= RAIO_CIDADE_M;
  return !h.nome || semAcento(h.nome).includes(semAcento(c.cidade));
}

const palavrasDaRua = (c) => semAcento(String(c.logradouro ?? "").split(",")[0].replace(RUA, "")).split(" ").filter((w) => w.length >= 4);
const citaRua = (h, c) => { const n = semAcento(h.rua ?? h.nome); return palavrasDaRua(c).some((w) => n.includes(w)); };

/** Viés da busca: centro da cidade citada; sem cidade, a etapa vizinha (ex.: o embarque); nunca assume São Paulo. */
export function pertoDe(c, vizinho = null) {
  const ref = c.cidade ? cidadeConhecida(c.cidade) : null;
  if (ref) return { lat: ref.lat, lon: ref.lon };
  if (!c.cidade && vizinho) return { lat: vizinho.lat, lon: vizinho.lon };
  return null;
}

/** Tenta cada provedor com até 3 variações. Devolve { lat, lon, area, fonte } ou null. */
export async function geocodificarCampos(c, provedores, { vizinho = null, prazo = null, agora = () => new Date() } = {}) {
  const esgotado = () => prazo != null && +agora() >= prazo;
  const ref = c.cidade ? cidadeConhecida(c.cidade) : null;
  const perto = pertoDe(c, vizinho);
  // Lugar com ponto fixo (ex.: Embraer SJC): não depende de provedor, que erra apelido de prédio.
  if (c.lugar?.coord) return { lat: c.lugar.coord.lat, lon: c.lugar.coord.lon, area: null, fonte: "fixo" };
  const consultas = candidatosDe(c);
  for (const prov of provedores) {
    for (const q of consultas) {
      if (prov.indisponivel) break;
      if (esgotado()) return null;
      let hits;
      try { hits = await prov(q, { perto }); } catch { continue; }
      const bons = (Array.isArray(hits) ? hits : hits ? [hits] : []).filter((x) => aceitavel(x, c, ref, vizinho));
      // Homônimos (dois "Hotel Fasano"): prefere o resultado que cita a rua do texto.
      const h = bons.find((x) => citaRua(x, c)) ?? bons[0];
      if (h) return { lat: h.lat, lon: h.lon, area: h.area ?? null, fonte: prov.nome ?? null };
    }
  }
  return null;
}

// ---------- Provedores: cada um devolve hits { lat, lon, area, generico, cidade, nome } ----------

const nomeado = (nome, fn) => Object.assign(fn, { nome });
export const TIMEOUT_GEO_MS = 4000;
const comTempo = (init = {}) => ({ ...init, signal: AbortSignal.timeout(TIMEOUT_GEO_MS) });
const GEO_GENERICO_TOMTOM = new Set(["Country", "CountrySubdivision", "CountrySecondarySubdivision", "CountryTertiarySubdivision", "Municipality", "MunicipalitySubdivision"]);
const RANK_TOMTOM = { "POI": 0, "Point Address": 0, "Address Range": 0, "Street": 1, "Cross Street": 1 };

export function hitTomTom(r) {
  const aeroporto = (r.poi?.categories ?? []).some((x) => /airport/i.test(x)) || (r.poi?.categorySet ?? []).some((x) => x.id === 7383);
  const vp = r.boundingBox ?? r.viewport;
  const area = aeroporto && vp ? caixaDoLugar(vp.btmRightPoint?.lat, vp.topLeftPoint?.lat, vp.topLeftPoint?.lon, vp.btmRightPoint?.lon) : null;
  return {
    lat: Number(r.position?.lat), lon: Number(r.position?.lon), area,
    generico: r.type === "Geography" && (!r.entityType || GEO_GENERICO_TOMTOM.has(r.entityType)),
    cidade: r.address?.municipality ?? null, rua: r.address?.streetName ?? null, nome: [r.poi?.name, r.address?.freeformAddress].filter(Boolean).join(", "),
    rank: RANK_TOMTOM[r.type] ?? 2, score: Number(r.score) || 0,
  };
}

export function provedorTomTom(chave, f = globalThis.fetch) {
  const prov = nomeado("tomtom", async (q, { perto } = {}) => {
    let url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json?key=${encodeURIComponent(chave)}&countrySet=BR&language=pt-BR&limit=5`;
    if (perto) url += `&lat=${perto.lat}&lon=${perto.lon}`;
    const res = await f(url, comTempo());
    // Cota estourada ou chave recusada: não insiste no resto da criação.
    if (res.status === 429 || res.status === 403) prov.indisponivel = true;
    if (!res.ok) throw new Error(`TomTom HTTP ${res.status}`);
    return ((await res.json()).results ?? []).map(hitTomTom).sort((a, b) => a.rank - b.rank || b.score - a.score);
  });
  return prov;
}

const PHOTON_GENERICO = new Set(["country", "state", "county", "city"]);
export function hitPhoton(ft) {
  const p = ft.properties ?? {};
  const [lon, lat] = ft.geometry?.coordinates ?? [];
  const e = p.extent; // [oeste, norte, leste, sul]
  const area = p.osm_value === "aerodrome" && Array.isArray(e) && e.length === 4 ? caixaDoLugar(e[3], e[1], e[0], e[2]) : null;
  return { lat: Number(lat), lon: Number(lon), area, generico: PHOTON_GENERICO.has(p.type), cidade: p.city ?? (p.type === "city" ? p.name : null), rua: p.street ?? null, nome: [p.name, p.street, p.district, p.city, p.state].filter(Boolean).join(", ") };
}

export function provedorPhoton(f = globalThis.fetch) {
  return nomeado("photon", async (q, { perto } = {}) => {
    let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`; // Photon recusa lang=pt (HTTP 400); sem lang usa os nomes locais
    if (perto) url += `&lat=${perto.lat}&lon=${perto.lon}`;
    const res = await f(url, comTempo({ headers: { "User-Agent": "betinhos-acompanhamento/1.0" } }));
    if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);
    return ((await res.json()).features ?? []).filter((ft) => ft.properties?.countrycode === "BR").map(hitPhoton);
  });
}

const NOMINATIM_GENERICO = new Set(["country", "state", "region", "county", "municipality", "city", "town", "village"]);
export function hitNominatim(hit) {
  const a = hit.address ?? {};
  return {
    lat: Number(hit.lat), lon: Number(hit.lon), area: areaDoLugar(hit),
    generico: NOMINATIM_GENERICO.has(hit.addresstype) || (hit.class === "boundary" && hit.type === "administrative") || /<UNKNOWN>/i.test(hit.display_name ?? ""),
    cidade: a.city ?? a.town ?? a.municipality ?? a.village ?? null, rua: a.road ?? null, nome: hit.display_name ?? "",
  };
}

export function provedorNominatim(f = globalThis.fetch) {
  return nomeado("nominatim", async (q) => {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=br&addressdetails=1&q=${encodeURIComponent(q)}`;
    const res = await f(url, comTempo({ headers: { "User-Agent": "betinhos-acompanhamento/1.0", "Accept-Language": "pt-BR" } }));
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    return (await res.json()).map(hitNominatim);
  });
}

/** Nominatim pede no máximo 1 req/s: espaça as chamadas em ≥1100 ms (com `esperar`/`agora` injetáveis). */
export function espacado(prov, { esperar, agora }, intervalo = 1100) {
  if (!esperar) return prov;
  let ultima = null;
  return nomeado(prov.nome, async (q, o) => {
    if (ultima !== null) { const falta = intervalo - (agora().getTime() - ultima); if (falta > 0) await esperar(falta); }
    try { return await prov(q, o); } finally { ultima = agora().getTime(); }
  });
}

/** Ordem de produção: TomTom (se houver chave) → Photon → Nominatim espaçado. */
export function provedoresPadrao(env, deps = {}) {
  const f = deps.fetch ?? globalThis.fetch;
  return [
    ...(env?.TOMTOM_KEY ? [provedorTomTom(env.TOMTOM_KEY, f)] : []),
    provedorPhoton(f),
    espacado(provedorNominatim(f), { esperar: deps.esperar ?? ((ms) => new Promise((r) => setTimeout(r, ms))), agora: deps.agora ?? (() => new Date()) }),
  ];
}
