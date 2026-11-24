import type { Bootstrap } from "./tipos";

// Bootstrap injetado pelo Worker (src/pagina.mjs). Sem ele (build aberto direto), age como link ativo sem contatos.
export const BT: Bootstrap = window.__BT__ ?? { estado: "ativo", versao: "", cfg: { tomtom: false, telefone: null, whatsapp: null, aoVivo: false, vapid: null, completo: true } };
export const DEBUG = /[?&]debug=1(&|$)/.test(location.search);
export const INTERVALO_MS = 15000;
export const SEM_CONEXAO_MS = 60000;
export const POSICAO_VELHA_MIN = 15;
export const EASE_QUINT = "cubic-bezier(.23,1,.32,1)";
export const reduzMovimento = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
