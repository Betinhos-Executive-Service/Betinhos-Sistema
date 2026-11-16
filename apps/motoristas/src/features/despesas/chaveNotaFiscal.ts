// Chave de acesso da nota fiscal (NF-e 55, NFC-e 65, CF-e SAT 59): normalização, validação, decomposição, leitura do QR
// e extração do PDF. Puro (sem DOM além do DecompressionStream no PDF). As mesmas regras estão no ChaveNotaFiscal.cs do
// plugin Betinhos.DriverRecordSharing, que é o bloqueio que vale; aqui é o aviso antecipado.
//
// Posições (0-based): UF 0-1, AAMM 2-5, CNPJ 6-19, modelo 20-21, DV 43. NF-e/NFC-e: série 22-24, número 25-33.
// CF-e SAT: número de série do SAT 22-30, número do cupom 31-36.
// DV em módulo 11 com pesos 2..9 da direita para a esquerda; cada posição vale o código ASCII − 48 (CNPJ alfanumérico).

export const MODELOS_NOTA = { "55": "NF-e", "65": "NFC-e", "59": "CF-e SAT" } as const;
export type ModeloNota = keyof typeof MODELOS_NOTA;

export const UF_IBGE: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
  "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
  "31": "MG", "32": "ES", "33": "RJ", "35": "SP",
  "41": "PR", "42": "SC", "43": "RS",
  "50": "MS", "51": "MT", "52": "GO", "53": "DF"
};

export type ChaveDecomposta = {
  chave: string;
  ufCodigo: string;
  uf: string;
  /** AAMM da emissão, como na chave. */
  aamm: string;
  cnpj: string;
  modelo: ModeloNota;
  serie: string;
  numero: string;
};

export type ResultadoChave = { ok: true; nota: ChaveDecomposta } | { ok: false; erro: string };

const valor = (letra: string) => letra.charCodeAt(0) - 48;

function modulo11(texto: string, pesos: (indiceDaDireita: number) => number) {
  let soma = 0;
  for (let i = 0; i < texto.length; i++) soma += valor(texto[texto.length - 1 - i]) * pesos(i);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** DV da chave: pesos 2..9 repetidos, da direita para a esquerda, sobre as 43 primeiras posições. */
export function dvDaChave(chave43: string) {
  return modulo11(chave43, (i) => 2 + (i % 8));
}

/** 12 posições do CNPJ + os 2 DV (para montar dados fictícios no mock). */
export function completarCnpj(base12: string) {
  const dv1 = modulo11(base12, (i) => 2 + (i % 8));
  return `${base12}${dv1}${modulo11(base12 + dv1, (i) => 2 + (i % 8))}`;
}

/** CNPJ (numérico ou alfanumérico): 12 posições + 2 DV numéricos; pesos 2..9 da direita, como no cálculo da Receita. */
export function cnpjValido(cnpj: string) {
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj) || /^0+$/.test(cnpj)) return false;
  const dv1 = modulo11(cnpj.slice(0, 12), (i) => 2 + (i % 8));
  const dv2 = modulo11(cnpj.slice(0, 12) + dv1, (i) => 2 + (i % 8));
  return cnpj.endsWith(`${dv1}${dv2}`);
}

/** Tira espaços, pontos, hífens e barras; maiúsculas. Não valida. */
export function normalizarChave(texto: string) {
  return (texto ?? "").toUpperCase().replace(/[\s.\-/]/g, "");
}

const FORMATO = /^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$/;

export function validarChave(texto: string): ResultadoChave {
  const chave = normalizarChave(texto);
  if (chave.length !== 44) return { ok: false, erro: `A chave tem 44 números. Esta tem ${chave.length}.` };
  if (!FORMATO.test(chave)) return { ok: false, erro: "A chave tem letra fora do lugar. Confira os números." };
  if (dvDaChave(chave.slice(0, 43)) !== Number(chave[43])) return { ok: false, erro: "Chave inválida: algum número foi digitado errado. Confira de novo." };
  const ufCodigo = chave.slice(0, 2);
  const uf = UF_IBGE[ufCodigo];
  if (!uf) return { ok: false, erro: "Chave inválida: o estado da nota não existe." };
  const aamm = chave.slice(2, 6);
  const mes = Number(aamm.slice(2));
  if (mes < 1 || mes > 12) return { ok: false, erro: "Chave inválida: o mês de emissão não existe." };
  const modelo = chave.slice(20, 22);
  if (!(modelo in MODELOS_NOTA)) return { ok: false, erro: "Esta chave não é de nota fiscal (NF-e, NFC-e ou cupom SAT)." };
  const cnpj = chave.slice(6, 20);
  if (!cnpjValido(cnpj)) return { ok: false, erro: "Chave inválida: o CNPJ do emitente não confere." };
  const sat = modelo === "59";
  return {
    ok: true,
    nota: {
      chave, ufCodigo, uf, aamm, cnpj, modelo: modelo as ModeloNota,
      serie: sat ? chave.slice(22, 31) : chave.slice(22, 25),
      numero: String(Number(sat ? chave.slice(31, 37) : chave.slice(25, 34)))
    }
  };
}

/** Mês da chave confere com a data da despesa (AAAA-MM-DD). No 1º e no último dia aceita também o mês vizinho. */
export function mesDaChaveConfere(aamm: string, dataDespesa: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataDespesa ?? "");
  if (!m || !/^\d{4}$/.test(aamm)) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const indice = (a: number, mm: number) => a * 12 + (mm - 1);
  const daChave = indice(2000 + Number(aamm.slice(0, 2)), Number(aamm.slice(2)));
  const daDespesa = indice(ano, mes);
  if (daChave === daDespesa) return true;
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return (dia === 1 && daChave === daDespesa - 1) || (dia === ultimoDia && daChave === daDespesa + 1);
}

const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function mesPorExtenso(aamm: string) {
  return `${NOMES_MES[Number(aamm.slice(2)) - 1] ?? "?"} de 20${aamm.slice(0, 2)}`;
}

/** Validação completa para a despesa: chave válida e do mês da despesa. */
export function conferirChaveDaDespesa(texto: string, dataDespesa: string): ResultadoChave {
  const resultado = validarChave(texto);
  if (!resultado.ok) return resultado;
  if (!mesDaChaveConfere(resultado.nota.aamm, dataDespesa)) {
    return { ok: false, erro: `Esta nota é de ${mesPorExtenso(resultado.nota.aamm)}, e o gasto está em outro mês. Confira se pegou o cupom certo ou a data do gasto.` };
  }
  return resultado;
}

/**
 * Texto lido do QR ou do código de barras → chave. Aceita a URL da NFC-e (parâmetro `p`, versões 2 e 3: a chave é o
 * primeiro campo antes de `|`), o QR do SAT (chave|data|valor|...), o Code 128 do DANFE (só a chave) e prefixos "NFe"/"CFe".
 */
export function chaveDoCodigo(texto: string): string | null {
  const bruto = (texto ?? "").trim();
  if (!bruto) return null;
  let conteudo = bruto;
  const p = /[?&]p=([^&#\s]+)/i.exec(bruto);
  if (p) {
    try { conteudo = decodeURIComponent(p[1]); } catch { conteudo = p[1]; }
  }
  const primeiro = conteudo.split("|")[0].replace(/^(NFE|CFE)/i, "");
  const resultado = validarChave(primeiro);
  return resultado.ok ? resultado.nota.chave : null;
}

/** Primeira chave válida num texto qualquer (com ou sem espaços entre os grupos). */
export function chaveNoTexto(texto: string): string | null {
  for (const trecho of (texto ?? "").toUpperCase().match(/[0-9A-Z](?:[ .]?[0-9A-Z])*/g) ?? []) {
    const corrido = trecho.replace(/[ .]/g, "");
    for (let i = 0; i + 44 <= corrido.length; i++) {
      const candidata = corrido.slice(i, i + 44);
      if (!/^\d{6}/.test(candidata)) continue;
      const resultado = validarChave(candidata);
      if (resultado.ok) return resultado.nota.chave;
    }
  }
  return null;
}

// ---------- PDF ----------

const latin1 = (bytes: Uint8Array) => {
  let texto = "";
  for (let i = 0; i < bytes.length; i += 0x8000) texto += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return texto;
};

async function inflar(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const fluxo = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(fluxo).arrayBuffer());
  } catch {
    return null;
  }
}

/** Strings de um content stream: literais (…) com escapes e hexadecimais <…>, na ordem em que aparecem. */
export function textosDoConteudo(conteudo: string) {
  const pedacos: string[] = [];
  for (let i = 0; i < conteudo.length; i++) {
    const c = conteudo[i];
    if (c === "(") {
      let nivel = 1, texto = "";
      for (i++; i < conteudo.length && nivel > 0; i++) {
        const d = conteudo[i];
        if (d === "\\") { const e = conteudo[++i]; texto += /[0-7]/.test(e ?? "") ? String.fromCharCode(parseInt(conteudo.slice(i, i + 3).match(/^[0-7]{1,3}/)![0], 8)) : e === "n" ? "\n" : e ?? ""; continue; }
        if (d === "(") nivel++;
        if (d === ")" && --nivel === 0) break;
        texto += d;
      }
      pedacos.push(texto);
    } else if (c === "<" && conteudo[i + 1] !== "<") {
      const fim = conteudo.indexOf(">", i);
      if (fim < 0) break;
      const hex = conteudo.slice(i + 1, fim).replace(/\s/g, "");
      if (/^[0-9A-Fa-f]*$/.test(hex)) pedacos.push((hex.match(/../g) ?? []).map((h) => String.fromCharCode(parseInt(h, 16))).join(""));
      i = fim;
    }
  }
  return pedacos;
}

/** Procura a chave no texto do PDF: fluxos descomprimidos (FlateDecode) e o texto solto. Fica com a primeira válida. */
export async function chaveDoPdf(bytes: Uint8Array): Promise<string | null> {
  const bruto = latin1(bytes);
  const textos: string[] = [bruto];
  const regex = /(?<!end)stream\r?\n/g;
  let achado: RegExpExecArray | null;
  while ((achado = regex.exec(bruto))) {
    const inicio = achado.index + achado[0].length;
    const fim = bruto.indexOf("endstream", inicio);
    if (fim < 0) break;
    const antes = bruto.slice(Math.max(0, achado.index - 400), achado.index);
    const dicionario = antes.slice(antes.lastIndexOf("<<"));
    // /Length direto dá o tamanho exato; sem ele (ou indireto), tira a quebra de linha antes do endstream.
    const tamanho = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dicionario);
    let final = tamanho && inicio + Number(tamanho[1]) <= fim ? inicio + Number(tamanho[1]) : fim;
    while (!tamanho && final > inicio && (bytes[final - 1] === 0x0a || bytes[final - 1] === 0x0d)) final--;
    const corpo = bytes.subarray(inicio, final);
    const conteudo = /\/FlateDecode/.test(dicionario) ? await inflar(corpo) : corpo;
    if (conteudo) {
      const texto = latin1(conteudo);
      const pedacos = textosDoConteudo(texto);
      textos.push(pedacos.join(""), pedacos.join(" "), texto);
    }
    regex.lastIndex = fim;
  }
  for (const texto of textos) {
    const chave = chaveNoTexto(texto);
    if (chave) return chave;
  }
  return null;
}

// ---------- formatação ----------

export function formatarCnpj(cnpj: string) {
  return /^[0-9A-Z]{14}$/.test(cnpj) ? `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}` : cnpj;
}

/** Chave em grupos de 4, como no DANFE. */
export function formatarChave(chave: string) {
  return (chave.match(/.{1,4}/g) ?? []).join(" ");
}

// ---------- nota do comprovante (estado no app) ----------

export type OrigemChave = "qr" | "codigo-barras" | "pdf" | "leitura-rapida" | "digitada";
export type NotaDoComprovante =
  | { situacao: "verificada"; chave: string; origem: OrigemChave }
  | { situacao: "nao-verificada" }
  | { situacao: "sem-nota" };

/** Valores das choices da migration 20261116-2100-chave-nota-fiscal.ps1 (a ordem é o contrato). */
export const ORIGEM_CHAVE_VALOR: Record<OrigemChave, number> = { qr: 100000000, "codigo-barras": 100000001, pdf: 100000002, "leitura-rapida": 100000003, digitada: 100000004 };
export const SITUACAO_NOTA_VALOR: Record<NotaDoComprovante["situacao"], number> = { verificada: 100000000, "nao-verificada": 100000001, "sem-nota": 100000002 };

/** Campos da nota no anexo da despesa. A decomposição é refeita pelo plugin; o app manda para o caso sem plugin. */
export function camposDaNota(nota: NotaDoComprovante | undefined): Record<string, unknown> {
  if (!nota) return {};
  if (nota.situacao !== "verificada") return { cr40f_situacaonota: SITUACAO_NOTA_VALOR[nota.situacao] };
  const r = validarChave(nota.chave);
  if (!r.ok) return {};
  return {
    cr40f_chaveacesso: r.nota.chave,
    cr40f_origemchave: ORIGEM_CHAVE_VALOR[nota.origem],
    cr40f_situacaonota: SITUACAO_NOTA_VALOR.verificada
  };
}

/** Pelo menos um comprovante da despesa passou por um dos quatro caminhos. */
export function despesaTemNota(notas: Array<NotaDoComprovante | undefined>) {
  return notas.some(Boolean);
}

/**
 * Erro do campo Comprovantes no envio: nenhum comprovante passou pelos quatro caminhos, ou uma chave conferida não é
 * do mês da data do gasto (a data pode ter mudado depois da leitura). Vazio = pode enviar.
 */
export function validarNotasDaDespesa(notas: Array<NotaDoComprovante | undefined>, dataDespesa: string) {
  if (!notas.length) return "";
  if (!despesaTemNota(notas)) return "Informe a nota fiscal de um comprovante: leia o código, digite a chave ou diga que não tem nota.";
  for (const [indice, nota] of notas.entries()) {
    if (nota?.situacao !== "verificada") continue;
    const r = conferirChaveDaDespesa(nota.chave, dataDespesa);
    if (!r.ok) return `Comprovante ${indice + 1}: ${r.erro}`;
  }
  return "";
}

/** Texto curto da nota no formulário. */
export function resumoDaNota(nota: NotaDoComprovante | undefined) {
  if (!nota) return "Nota fiscal não informada";
  if (nota.situacao === "nao-verificada") return "Nota não verificada";
  if (nota.situacao === "sem-nota") return "Sem nota fiscal";
  const r = validarChave(nota.chave);
  return r.ok ? `Chave conferida · ${MODELOS_NOTA[r.nota.modelo]} ${r.nota.numero} · ${r.nota.uf}` : "Chave conferida";
}
