// Validações compartilhadas entre a página (navegador) e o Worker. Sem dependências.

export function soDigitos(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

// Telefone BR ou internacional: 10 a 15 dígitos (com DDI opcional).
export function telefoneValido(valor) {
  const n = soDigitos(valor).length;
  return n >= 10 && n <= 15;
}

// E-mail simples: algo@algo.algo, sem espaços.
export function emailValido(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(valor ?? "").trim());
}

// Máscara de digitação. Com "+" no início, trata como DDI livre; senão, formato BR (DD) 9XXXX-XXXX.
export function mascararTelefone(valor) {
  const texto = String(valor ?? "");
  const d = soDigitos(texto).slice(0, 15);
  if (texto.trim().startsWith("+")) {
    if (d.startsWith("55") && d.length > 2) return "+55 " + mascaraBr(d.slice(2));
    return d ? "+" + d : "+";
  }
  return mascaraBr(d.slice(0, 11));
}

function mascaraBr(d) {
  if (d.length <= 2) return d ? `(${d}` : "";
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const corte = resto.length >= 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte, 9)}`;
}

// Normaliza para envio: "+<dígitos>" com DDI; sem "+", assume Brasil (55).
export function telefoneParaEnvio(valor) {
  const texto = String(valor ?? "").trim();
  const d = soDigitos(texto);
  if (!d) return "";
  return texto.startsWith("+") ? "+" + d : "+55" + d;
}

// Versões mascaradas (iguais às do flow "ler"): só DDD e 4 últimos dígitos; e-mail com 2 letras + domínio.
export function telefoneOculto(valor) {
  const texto = String(valor ?? "").trim();
  const d = soDigitos(texto);
  if (d.length < 8) return texto ? "••••" : "";
  const fim = d.slice(-4);
  if (d.startsWith("55") && d.length >= 12) return `(${d.slice(2, 4)}) •••••-${fim}`;
  if (!texto.startsWith("+") && d.length <= 11) return `(${d.slice(0, 2)}) •••••-${fim}`;
  return `+••• ${fim}`;
}

export function emailOculto(valor) {
  const e = String(valor ?? "").trim();
  const at = e.indexOf("@");
  if (at < 1) return e ? "•••" : "";
  return e.slice(0, Math.min(2, at)) + "•••" + e.slice(at);
}
