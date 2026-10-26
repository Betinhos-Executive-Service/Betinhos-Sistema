import type { ReactNode } from "react";
import type { FlagCode } from "../../lib/passengerContact";

// SVG inline 18x12: emoji de bandeira não aparece no Windows.
const FLAGS: Record<FlagCode, { label: string; svg: ReactNode }> = {
  BR: { label: "Português", svg: <><rect width="18" height="12" fill="#009C3B" /><path d="M9 1.5 16.5 6 9 10.5 1.5 6z" fill="#FFDF00" /><circle cx="9" cy="6" r="2.6" fill="#002776" /></> },
  US: { label: "Inglês", svg: <><rect width="18" height="12" fill="#B22234" /><path d="M0 1.4h18M0 3.2h18M0 5h18M0 6.8h18M0 8.6h18M0 10.4h18" stroke="#fff" strokeWidth=".9" /><rect width="8" height="6.4" fill="#3C3B6E" /></> },
  ES: { label: "Espanhol", svg: <><rect width="18" height="12" fill="#AA151B" /><rect y="3" width="18" height="6" fill="#F1BF00" /></> },
  FR: { label: "Francês", svg: <><rect width="18" height="12" fill="#fff" /><rect width="6" height="12" fill="#002395" /><rect x="12" width="6" height="12" fill="#ED2939" /></> },
  IT: { label: "Italiano", svg: <><rect width="18" height="12" fill="#fff" /><rect width="6" height="12" fill="#009246" /><rect x="12" width="6" height="12" fill="#CE2B37" /></> },
  DE: { label: "Alemão", svg: <><rect width="18" height="4" fill="#000" /><rect y="4" width="18" height="4" fill="#DD0000" /><rect y="8" width="18" height="4" fill="#FFCE00" /></> },
  JP: { label: "Japonês", svg: <><rect width="18" height="12" fill="#fff" /><circle cx="9" cy="6" r="3.6" fill="#BC002D" /></> },
  CN: { label: "Chinês", svg: <><rect width="18" height="12" fill="#DE2910" /><path d="M3.6 1.6l.7 2.1h2.2l-1.8 1.3.7 2.1-1.8-1.3-1.8 1.3.7-2.1L.7 3.7h2.2z" fill="#FFDE00" /></> }
};

export function LanguageFlag({ code, label }: { code: FlagCode; label?: string }) {
  const flag = FLAGS[code];
  const title = `Idioma: ${label || flag.label}`;
  return (
    <svg role="img" aria-label={title} width="18" height="12" viewBox="0 0 18 12" style={{ display: "inline-block", flex: "0 0 auto", marginRight: 6, verticalAlign: "-1px", borderRadius: 2, boxShadow: "0 0 0 0.5px rgba(0,0,0,.2)" }}>
      <title>{title}</title>
      {flag.svg}
    </svg>
  );
}
