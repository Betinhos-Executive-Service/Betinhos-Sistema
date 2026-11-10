// Funções puras da Fase 0 (BrasilAPI + Nominatim). Sem rede aqui: quem chama faz o fetch.
export type Endereco = { nome: string; logradouro: string; numero: string; bairro: string; municipio: string; uf: string; cep: string };
export type Geo = { lat: number; lon: number; precisao: "rua" | "bairro" | "cidade" };
export type PostoRow = { cnpj: string; brasilApi: boolean; geo: Geo | null };
export type Resumo = { total: number; encontrados: number; geocodificados: number; rua: number };

const DV_WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const DV_WEIGHTS_2 = [6, ...DV_WEIGHTS_1];

function checkDigit(digits: string, weights: number[]) {
  const sum = weights.reduce((acc, w, i) => acc + Number(digits[i]) * w, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function normalizeCnpj(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return null;
  const ok = checkDigit(digits, DV_WEIGHTS_1) === Number(digits[12]) && checkDigit(digits, DV_WEIGHTS_2) === Number(digits[13]);
  return ok ? digits : null;
}

export const brasilApiUrl = (cnpj: string) => `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`;

const text = (value: unknown) => String(value ?? "").trim();

export function parseBrasilApi(body: unknown): Endereco | null {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!text(b.logradouro) || !text(b.municipio)) return null;
  return {
    nome: text(b.nome_fantasia) || text(b.razao_social),
    logradouro: [text(b.descricao_tipo_de_logradouro), text(b.logradouro)].filter(Boolean).join(" "),
    numero: text(b.numero),
    bairro: text(b.bairro),
    municipio: text(b.municipio),
    uf: text(b.uf),
    cep: text(b.cep).replace(/\D/g, "")
  };
}

export function nominatimUrl(e: Endereco): string {
  const params = new URLSearchParams({
    street: [e.numero, e.logradouro].filter(Boolean).join(" "),
    city: e.municipio,
    state: e.uf,
    postalcode: e.cep,
    countrycodes: "br",
    format: "jsonv2",
    limit: "1"
  });
  return `https://nominatim.openstreetmap.org/search?${params}`;
}

export function parseNominatim(body: unknown): Geo | null {
  const first = Array.isArray(body) ? (body[0] as Record<string, unknown> | undefined) : undefined;
  if (!first) return null;
  const lat = Number(first.lat);
  const lon = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const rank = Number(first.place_rank);
  const precisao = rank >= 26 ? "rua" : rank >= 16 ? "bairro" : "cidade";
  return { lat, lon, precisao };
}

export function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export function summarize(rows: PostoRow[]): Resumo {
  return {
    total: rows.length,
    encontrados: rows.filter((r) => r.brasilApi).length,
    geocodificados: rows.filter((r) => r.geo).length,
    rua: rows.filter((r) => r.geo?.precisao === "rua").length
  };
}

export function verdict(errorsMeters: number[]): { ok: boolean; share: number } {
  const share = errorsMeters.length ? errorsMeters.filter((m) => m < 300).length / errorsMeters.length : 0;
  return { ok: share >= 0.85, share: Math.round(share * 100) / 100 };
}

export function buildCnpjVisionRequest(base64: string, mediaType: "image/jpeg" | "image/png") {
  return {
    model: "claude-haiku-5-5",
    max_tokens: 100,
    tools: [{
      name: "ler_cnpj",
      description: "CNPJ do estabelecimento emissor do cupom fiscal de combustível.",
      input_schema: { type: "object", properties: { cnpj: { type: ["string", "null"] } }, required: ["cnpj"] }
    }],
    tool_choice: { type: "tool", name: "ler_cnpj" },
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: "Leia o CNPJ do emissor (posto). Se não estiver legível, devolva null. Não invente." }
      ]
    }]
  };
}

export function parseCnpjVisionResponse(body: unknown): string | null {
  const content = ((body ?? {}) as { content?: Array<{ type?: string; name?: string; input?: { cnpj?: unknown } }> }).content ?? [];
  const tool = content.find((c) => c.type === "tool_use" && c.name === "ler_cnpj");
  return normalizeCnpj(typeof tool?.input?.cnpj === "string" ? tool.input.cnpj : null);
}
