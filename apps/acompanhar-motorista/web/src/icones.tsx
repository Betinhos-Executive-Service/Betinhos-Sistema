import type { ReactNode } from "react";

const Svg = ({ children, w = 2 }: { children: ReactNode; w?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
export const Telefone = () => <Svg><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></Svg>;
export const Mensagem = () => <Svg><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" /></Svg>;
export const Relogio = () => <Svg><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></Svg>;
export const Centro = () => <Svg><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></Svg>;
export const Compartilhar = () => <Svg><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" /></Svg>;
export const Pino = () => <Svg><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></Svg>;
export const Check = () => <Svg><path d="M20 6 9 17l-5-5" /></Svg>;
export const Carregando = () => <Svg><path d="M21 12a9 9 0 1 1-6.2-8.6" /></Svg>;
export const Estrela = () => <Svg><path d="M11.5 2.3a.6.6 0 0 1 1 0l2.7 5.6 6.1.9a.6.6 0 0 1 .3 1l-4.4 4.3 1 6.1a.6.6 0 0 1-.8.6L12 17.9l-5.4 2.9a.6.6 0 0 1-.8-.6l1-6.1-4.4-4.3a.6.6 0 0 1 .3-1l6.1-.9z" /></Svg>;
export const Fechar = () => <Svg><path d="M18 6 6 18M6 6l12 12" /></Svg>;
export const Ampliar = () => <Svg><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></Svg>;
export const Sino = () => <Svg><path d="M10.3 21a2 2 0 0 0 3.4 0" /><path d="M3.3 15.3A1 1 0 0 0 4 17h16a1 1 0 0 0 .7-1.7C19.4 14 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.4 6-2.7 7.3" /></Svg>;
export const Fechado = () => <Svg><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></Svg>;
export const Rota = () => <Svg><path d="M3 11l19-9-9 19-2-8-8-2z" /></Svg>;
export const Aviso = () => <Svg><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></Svg>;
export const Camera = () => <Svg><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="3" /></Svg>;
export const Galeria = () => <Svg><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></Svg>;
