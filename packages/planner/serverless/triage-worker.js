const CATEGORIES = new Set(["orcamento", "reserva", "duvida", "reclamacao", "follow_up", "outro"]);
const PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

const corsHeaders = (env) => ({
  "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

function json(data, status, env) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(env) } });
}

function promptFor(input) {
  return `Classifique esta conversa de atendimento executivo. Responda SOMENTE JSON válido com category, priority, summary, nextAction, dueDate e confidence. category deve ser uma destas: orcamento, reserva, duvida, reclamacao, follow_up, outro. priority: low, medium, high ou urgent. dueDate só pode existir se houver prazo explícito na conversa; caso contrário null. Não invente dados.\n\nNome: ${input.senderName}\nTelefone: ${input.senderPhone}\nMensagens:\n${input.messages.map((message) => `[${message.direction}] ${message.text}`).join("\n")}`;
}

function parseClassification(value) {
  const result = typeof value === "string" ? JSON.parse(value) : value;
  const confidence = Number(result.confidence);
  return {
    category: CATEGORIES.has(result.category) ? result.category : "outro",
    priority: PRIORITIES.has(result.priority) ? result.priority : "medium",
    summary: String(result.summary || "").trim().slice(0, 500),
    nextAction: String(result.nextAction || "").trim().slice(0, 500),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(result.dueDate || "")) ? result.dueDate : null,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(env) });
    if (request.method !== "POST" || new URL(request.url).pathname !== "/v1/triage") return json({ error: "Not found" }, 404, env);
    if (env.TRIAGE_TOKEN && request.headers.get("Authorization") !== `Bearer ${env.TRIAGE_TOKEN}`) return json({ error: "Unauthorized" }, 401, env);
    if (!env.DEEPSEEK_API_KEY) return json({ error: "DEEPSEEK_API_KEY não configurada." }, 503, env);
    const input = await request.json().catch(() => null);
    if (!input?.senderPhone || !Array.isArray(input.messages) || !input.messages.length) return json({ error: "Payload de conversa inválido." }, 400, env);
    const upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: env.DEEPSEEK_MODEL || "deepseek-flash", temperature: 0.1, response_format: { type: "json_object" }, messages: [{ role: "system", content: "Você é um classificador operacional. Nunca invente prazo ou informação." }, { role: "user", content: promptFor(input) }] }),
    });
    const body = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return json({ error: body.error?.message || "DeepSeek indisponível." }, 502, env);
    try {
      return json({ data: parseClassification(body.choices?.[0]?.message?.content || "{}") }, 200, env);
    } catch {
      return json({ error: "DeepSeek retornou classificação inválida." }, 502, env);
    }
  },
};
