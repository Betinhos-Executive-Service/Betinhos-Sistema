// Ritmo do alarm do Durable Object `Viagem`: quando fazer a próxima leitura da Infleet.
// Alguém olhando (WebSocket), carro perto do alvo ou esperando no local → 15 s; só inscrição de aviso → 60 s
// a partir de 60 min antes do horário; ninguém olhando nem inscrito → sem alarm (o DO acorda por requisição).
export const RAPIDO_MS = 15000;
export const LENTO_MS = 60000;
export const LIMPEZA_MS = 24 * 3600000;
export const PERTO_M = 3000;
export const JANELA_MS = 60 * 60000;

export function proximoAlarme({ agoraMs, conectados = 0, inscricoes = 0, fase = null, distanciaAlvoM = null, horarioAgendado = null, encerrado = false }) {
  if (encerrado || fase === "concluido") return { emMs: agoraMs + LIMPEZA_MS, limpar: true };
  if (conectados > 0) return { emMs: agoraMs + RAPIDO_MS, limpar: false };
  if (inscricoes <= 0) return { emMs: null, limpar: false };
  if (fase === "no_local" || (Number.isFinite(distanciaAlvoM) && distanciaAlvoM < PERTO_M)) return { emMs: agoraMs + RAPIDO_MS, limpar: false };
  const horario = Date.parse(horarioAgendado);
  if (Number.isFinite(horario) && horario - agoraMs > JANELA_MS) return { emMs: horario - JANELA_MS, limpar: false };
  return { emMs: agoraMs + LENTO_MS, limpar: false };
}
