// Normaliza os textos de endereço da operação com o Haiku, uma vez por link. Só limpa texto:
// status, etapas e ETA são regra fixa no Worker. Qualquer falha devolve null (caminho antigo).
const MODELO = "claude-haiku-5-5";
const TIPOS = new Set(["saida", "parada", "destino"]);

const PROMPT = `Você recebe endereços digitados pela operação de uma empresa de transporte executivo (São Paulo, Vale do Paraíba, Campinas, Rio de Janeiro e outras cidades).
Devolva cada etapa só com o que serve para geocodificar e um rótulo curto para o cliente.
Campos: "local" = nome do estabelecimento (hotel, empresa, aeroporto) ou null; "logradouro" = tipo e nome da rua por extenso
com o número ("Avenida Presidente Juscelino Kubitschek, 2041") ou null; "cidade" e "uf" (sigla) ou null; "rotulo" = local ou "rua, número".
Nunca inclua bairro, apto, bloco, sala, conjunto, nome de passageiro, telefone, número de voo nem observação.
Escreva tudo por extenso (Av. → Avenida, R. → Rua, Pres. → Presidente, Dr. → Doutor, Aerop. → Aeroporto).
Aeroporto usa o nome oficial (Aeroporto Internacional de Guarulhos, Aeroporto de Congonhas, Aeroporto Internacional de Viracopos).
Não invente endereço. Se algum endereço estiver incompleto ou ambíguo, confianca = "baixa".
Use o que você sabe de lugares conhecidos (hotéis, aeroportos, rodoviárias, shoppings, hospitais, sedes de empresas) para completar
cidade e uf quando for óbvio. Nunca invente número de rua: se o texto não traz o número, deixe sem número ou use só o local.
Cidade: preencha só quando o texto da etapa, o campo "trajeto" (ex.: "São José dos Campos → Guarulhos") ou o endereço de saída a indicarem,
ou quando o lugar for conhecido. Nunca assuma São Paulo por padrão: endereço sem cidade que o trajeto/saída não esclareça fica com cidade e uf null e confianca = "baixa".
Uma rua sem cidade costuma estar na mesma cidade da saída; use o "trajeto" para saber qual é a do destino.
Rodoviária usa o nome oficial do terminal; shopping usa o nome do shopping.

Exemplos (texto da etapa → campos devolvidos):
1. "Aerop. GRU T3 - LATAM 3456" → local "Aeroporto Internacional de Guarulhos", logradouro null, cidade "Guarulhos", uf "SP", rotulo "Aeroporto de Guarulhos – Terminal 3"
2. "CGH" → local "Aeroporto de Congonhas", logradouro null, cidade "São Paulo", uf "SP", rotulo "Aeroporto de Congonhas"
3. "Viracopos - Azul 4021" → local "Aeroporto Internacional de Viracopos", logradouro null, cidade "Campinas", uf "SP", rotulo "Aeroporto de Viracopos"
4. "SDU" → local "Aeroporto Santos Dumont", logradouro null, cidade "Rio de Janeiro", uf "RJ", rotulo "Aeroporto Santos Dumont"; "Galeão T2" → local "Aeroporto Internacional do Rio de Janeiro/Galeão", logradouro null, cidade "Rio de Janeiro", uf "RJ", rotulo "Aeroporto do Galeão – Terminal 2"
5. "Hotel Unique - Av. Brig. Luís Antônio, 4700 - Jd Paulista" → local "Hotel Unique", logradouro "Avenida Brigadeiro Luís Antônio, 4700", cidade "São Paulo", uf "SP", rotulo "Hotel Unique"
6. "Kenvue JK - Av. Pres. Juscelino Kubitschek, 2041 - São Paulo/SP" → local "Kenvue", logradouro "Avenida Presidente Juscelino Kubitschek, 2041", cidade "São Paulo", uf "SP", rotulo "Kenvue"
7. "Marcos Teixeira - Rua Pamplona, 129, apto 172" → local null, logradouro "Rua Pamplona, 129", cidade null, uf null, rotulo "Rua Pamplona, 129"
8. "Rio de Janeiro - Ritz Leblon" → local "Hotel Ritz Leblon", logradouro null, cidade "Rio de Janeiro", uf "RJ", rotulo "Ritz Leblon"
9. "1. Ana Souza - Golden Tulip Av. São João, 2200 São José dos Campos (12) 99999-0000" → local "Golden Tulip", logradouro "Avenida São João, 2200", cidade "São José dos Campos", uf "SP", rotulo "Golden Tulip"
10. "Rodoviária Tietê" → local "Terminal Rodoviário Tietê", logradouro null, cidade "São Paulo", uf "SP", rotulo "Rodoviária Tietê"; "Shopping Iguatemi Campinas" → local "Shopping Iguatemi Campinas", logradouro null, cidade "Campinas", uf "SP", rotulo "Shopping Iguatemi Campinas"`;

const textoOuNulo = { type: ["string", "null"] };
const FERRAMENTA = {
  name: "enderecos",
  description: "Etapas do serviço em ordem: uma saída, paradas e um destino.",
  input_schema: {
    type: "object",
    required: ["etapas", "confianca"],
    properties: {
      etapas: { type: "array", items: { type: "object", required: ["tipo", "local", "logradouro", "cidade", "uf", "rotulo"], properties: {
        tipo: { enum: ["saida", "parada", "destino"] }, local: textoOuNulo, logradouro: textoOuNulo, cidade: textoOuNulo, uf: textoOuNulo, rotulo: { type: "string" } } } },
      confianca: { enum: ["alta", "baixa"] }
    }
  }
};

const CAMPOS = ["local", "logradouro", "cidade", "uf"];
const campoOk = (v) => v == null || (typeof v === "string" && v.length <= 200);
const preenchido = (v) => typeof v === "string" && v.trim() !== "";

/** Consulta montada no código: com estabelecimento "local, cidade, uf"; senão "logradouro, cidade, uf". */
export function montarConsulta(e) {
  return [e.local?.trim() || e.logradouro?.trim(), e.cidade?.trim(), e.uf?.trim()].filter(Boolean).join(", ");
}

function valido(r) {
  const e = r?.etapas;
  if (!Array.isArray(e) || e.length < 2 || e.length > 10 || !["alta", "baixa"].includes(r.confianca)) return false;
  if (e.some((x) => !x || typeof x !== "object")) return false;
  if (e[0].tipo !== "saida" || e.at(-1).tipo !== "destino") return false;
  return e.every((x, i) => TIPOS.has(x.tipo) && CAMPOS.every((k) => campoOk(x[k])) && (preenchido(x.local) || preenchido(x.logradouro))
    && typeof x.rotulo === "string" && x.rotulo.length <= 200 && (i === 0 || i === e.length - 1 || x.tipo === "parada"));
}

const etapaLimpa = (x) => {
  const c = Object.fromEntries(CAMPOS.map((k) => [k, preenchido(x[k]) ? x[k].trim() : null]));
  return { tipo: x.tipo, ...c, rotulo: x.rotulo.trim(), consulta: montarConsulta(c) };
};

const REGIAO = "Serviços normalmente em São Paulo capital, Grande SP, Vale do Paraíba, Campinas e Rio de Janeiro.";
// Bloco fixo (instruções + exemplos) na frente e marcado para cache; nada variável no system.
export const SYSTEM = [{ type: "text", text: PROMPT, cache_control: { type: "ephemeral" } }];
export const USO = ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"];
const podeRepetir = (motivo) => motivo === "timeout" || motivo === "http_429" || /^http_5\d\d$/.test(motivo);

/** Mensagem do usuário: contexto do serviço (opcional) + os textos crus em JSON. */
export function mensagemUsuario(textos, contexto = {}, falhas = null) {
  return [
    contexto.titulo && `Serviço: ${contexto.titulo}`,
    contexto.tipoServico && `Tipo de serviço: ${contexto.tipoServico}`,
    contexto.horarioAgendado && `Horário agendado: ${contexto.horarioAgendado}`,
    REGIAO,
    `Endereços: ${JSON.stringify(textos)}`,
    falhas && `Reanálise: na primeira leitura estas etapas não foram encontradas no mapa (rótulo e consulta tentados): ${JSON.stringify(falhas)}.
Devolva de novo todas as etapas, na mesma ordem, propondo para as que falharam uma alternativa (nome oficial do local, logradouro ou cidade diferentes)
que um geocodificador encontre. Mantenha as que não falharam.`
  ].filter(Boolean).join("\n");
}

/** Uma chamada à API de mensagens com ferramenta forçada: { input, usage } ou { motivo, usage? }. Também usada pela avaliação. */
export async function chamarFerramenta(corpo, { chave, fetch, timeoutMs, validar = valido }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-api-key": chave, "anthropic-version": "2023-06-01" },
      body: corpo
    });
    if (!res.ok) return { motivo: `http_${res.status}` };
    const j = await res.json().catch(() => null);
    if (!j) return { motivo: "json_invalido" };
    const usage = j.usage ?? {};
    const input = j.stop_reason === "refusal" ? null : j.content?.find?.((c) => c.type === "tool_use")?.input;
    if (!input) return { motivo: "recusa", usage };
    return validar(input) ? { input, usage } : { motivo: "json_invalido", usage };
  } catch {
    return { motivo: ctrl.signal.aborted ? "timeout" : "rede" };
  } finally { clearTimeout(timer); }
}

/**
 * Normaliza com no máximo 1 nova tentativa (só timeout/429/5xx) e só se ela couber antes de `prazo`.
 * Devolve { etapas, confianca, fonte, ia } ou, em falha, só { ia }. `ia` nunca leva texto de endereço.
 */
export async function normalizarEnderecos(textos, { chave, fetch = globalThis.fetch, timeoutMs = 12000, contexto, prazo = Infinity, agora = Date.now, effort = "low", falhas = null, maxTentativas = 2 } = {}) {
  const inicio = +agora();
  const ia = { ok: false, motivo: null, ms: 0, tentativas: 0, ...Object.fromEntries(USO.map((k) => [k, 0])) };
  const fim = (r) => {
    ia.ms = +agora() - inicio;
    console.log(JSON.stringify({ evento: "ia_normalizar", ...ia }));
    return { ...r, ia };
  };
  if (!chave) { ia.motivo = "sem_chave"; return fim({}); }
  const corpo = JSON.stringify({
    model: MODELO, max_tokens: 1024, system: SYSTEM, tools: [FERRAMENTA], tool_choice: { type: "tool", name: "enderecos" },
    output_config: { effort },
    messages: [{ role: "user", content: mensagemUsuario(textos, contexto, falhas) }]
  });
  for (;;) {
    ia.tentativas++;
    const r = await chamarFerramenta(corpo, { chave, fetch, timeoutMs });
    for (const k of USO) ia[k] += Number(r.usage?.[k]) || 0;
    if (r.input) {
      ia.ok = true;
      return fim({ etapas: r.input.etapas.map(etapaLimpa), confianca: r.input.confianca, fonte: "haiku" });
    }
    ia.motivo = r.motivo;
    if (ia.tentativas >= maxTentativas || !podeRepetir(r.motivo) || +agora() + timeoutMs > prazo) return fim({});
  }
}
