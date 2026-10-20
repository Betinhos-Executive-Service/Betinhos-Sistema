// Mascara dados pessoais antes de qualquer texto de erro chegar ao agente ou ao GitHub (LGPD).
// Conservador: prefere esconder demais a vazar. GUIDs ficam (são ids técnicos, sem dado pessoal).

const GUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi

const REGRAS = [
  [/\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/g, '[email]'],
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[cnpj]'],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf]'],
  // Telefones BR: +55, DDD com ou sem parênteses, 8 ou 9 dígitos.
  [/(\+?55\s?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g, '[telefone]'],
  [/\b\d{5}-?\d{3}\b/g, '[cep]'],
  // Placa antiga (ABC-1234) e Mercosul (ABC1D23).
  [/\b[A-Z]{3}-?\d[A-Z0-9]\d{2}\b/g, '[placa]'],
  // Tokens e segredos que possam aparecer em URL ou cabeçalho.
  [/\b(Bearer\s+)[\w.~+/-]+=*/gi, '$1[token]'],
  [/([?&](sig|code|token|access_token|api-key|key)=)[^&\s"']+/gi, '$1[segredo]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[token]'],
]

/** Campos JSON cujo valor é sempre pessoal, seja qual for o formato. */
const CAMPOS_PESSOAIS = /("(?:[\w]*?(?:nome|name|passageiro|cliente|motorista|endereco|address|telefone|phone|email|cpf|rg|cnh)[\w]*)"\s*:\s*)"[^"]*"/gi

export function mascarar(texto) {
  if (texto == null) return ''
  let s = String(texto)
  // Protege GUIDs para as regras numéricas não os confundirem com telefone/CPF.
  const guids = []
  s = s.replace(GUID, (g) => `\u0000${guids.push(g) - 1}\u0000`)
  s = s.replace(CAMPOS_PESSOAIS, '$1"[pessoal]"')
  for (const [re, troca] of REGRAS) s = s.replace(re, troca)
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => guids[Number(i)])
}
