// Movimento do carro no mapa: funções puras, sem fechamento, embutidas na página por String(fn) e
// testadas em Node. Posições são { lat, lon }; ângulos em graus (0 = norte, sentido horário).
export function rumo(a, b) {
  var r = Math.PI / 180, la1 = a.lat * r, la2 = b.lat * r, dl = (b.lon - a.lon) * r;
  var y = Math.sin(dl) * Math.cos(la2), x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dl);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function metrosEntre(a, b) {
  var r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * 6371000 * Math.asin(Math.sqrt(s));
}

export function interpolar(a, b, t) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
}

/** Menor giro (−180..180] para ir de `de` a `para`; evita a volta inteira ao cruzar o norte. */
export function giro(de, para) {
  var d = ((para - de) % 360 + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

/**
 * Como levar o carro de `de` (exibido) a `para` (nova posição): desliza durante o intervalo entre atualizações,
 * salta quando não há de onde partir, quando a aba ficou escondida (posições perdidas), quando o pulo é
 * grande demais para ser trajeto (> 3 km) ou quando o usuário prefere menos movimento. Pulos de GPS parado
 * (< 5 m) não mexem o carro nem o rumo; o rumo só muda com deslocamento acima de 8 m (ruído do GPS).
 */
export function planoDeMovimento(de, para, opts) {
  opts = opts || {};
  if (!de) return { modo: "saltar", duracaoMs: 0, rumo: null };
  var d = metrosEntre(de, para);
  if (d < 5) return { modo: "parado", duracaoMs: 0, rumo: null };
  var novoRumo = d >= 8 ? rumo(de, para) : null;
  if (opts.oculto || opts.reduzMovimento || d > 3000) return { modo: "saltar", duracaoMs: 0, rumo: novoRumo };
  var ms = Number(opts.intervaloMs) || 15000;
  return { modo: "deslizar", duracaoMs: Math.min(20000, Math.max(2000, ms)), rumo: novoRumo };
}

/**
 * Rumo do carro pela rota que falta (coords [lon, lat], começando perto do carro): aponta para o ponto da rota
 * a uns 30 m à frente do vértice mais próximo. null se não há rota ou o carro está a mais de 150 m dela.
 */
export function rumoDaRota(pos, coords) {
  if (!pos || !coords || coords.length < 2) return null;
  var melhor = -1, menor = Infinity, n = Math.min(coords.length, 400);
  for (var i = 0; i < n; i++) {
    var d = metrosEntre(pos, { lat: coords[i][1], lon: coords[i][0] });
    if (d < menor) { menor = d; melhor = i; }
  }
  if (menor > 150) return null;
  for (var j = melhor; j < coords.length; j++) {
    var p = { lat: coords[j][1], lon: coords[j][0] };
    if (metrosEntre(pos, p) >= 30) return rumo(pos, p);
  }
  return null;
}

/** Rumo pelo caminho já feito (coords [lon, lat]): do ponto ~20 m antes do último até o último. */
export function rumoDoPercorrido(coords) {
  if (!coords || coords.length < 2) return null;
  var fim = { lat: coords[coords.length - 1][1], lon: coords[coords.length - 1][0] };
  for (var i = coords.length - 2; i >= 0; i--) {
    var p = { lat: coords[i][1], lon: coords[i][0] };
    if (metrosEntre(p, fim) >= 20) return rumo(p, fim);
  }
  return null;
}

/** Texto curto de idade: "agora", "45 s", "2 min", "1 h 05". */
export function idadeTexto(ms) {
  if (!(ms >= 0)) return "";
  var s = Math.round(ms / 1000);
  if (s < 15) return "agora";
  if (s < 60) return s + " s";
  var m = Math.floor(s / 60);
  if (m < 60) return m + " min";
  var h = Math.floor(m / 60), r = m % 60;
  return h + " h" + (r ? " " + (r < 10 ? "0" : "") + r : "");
}

/**
 * Projeção de `pos` na linha (coords [lon, lat]) em metros locais. Um trecho posterior só ganha de um anterior se
 * estiver 10 m mais perto: num retorno a volta passa a poucos metros da ida e o carro continua na ida.
 */
export function projetarNaLinha(pos, coords) {
  if (!pos || !coords || coords.length < 2) return null;
  var kx = 111320 * Math.cos(pos.lat * Math.PI / 180), ky = 111320;
  var melhor = null, acum = 0;
  for (var i = 0; i < coords.length - 1; i++) {
    var ax = (coords[i][0] - pos.lon) * kx, ay = (coords[i][1] - pos.lat) * ky;
    var bx = (coords[i + 1][0] - pos.lon) * kx, by = (coords[i + 1][1] - pos.lat) * ky;
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, seg = Math.sqrt(l2);
    var t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    var px = ax + t * dx, py = ay + t * dy, d = Math.sqrt(px * px + py * py);
    if (!melhor || d < melhor.distancia - 10) melhor = { indice: i, lon: pos.lon + px / kx, lat: pos.lat + py / ky, distancia: d, metrosAntes: acum + t * seg };
    acum += seg;
  }
  melhor.total = acum;
  return melhor;
}

/** Posição do carro desenhada sobre a rota quando o GPS está a até `maxM` dela; senão a posição crua. */
export function carroNaRota(pos, coords, maxM) {
  var r = projetarNaLinha(pos, coords);
  return r && r.distancia <= maxM ? { lat: r.lat, lon: r.lon } : pos;
}

/**
 * ETA que não pula: variação acima de max(3 min, 25 %) do mostrado só entra se a leitura seguinte confirmar
 * (ficar perto da pendente). Devolve o que mostrar e a pendente.
 */
export function etaEstavel(mostrado, pendente, novo) {
  if (!novo) return { mostrar: null, pendente: null };
  if (!mostrado) return { mostrar: novo, pendente: null };
  // Sem função interna: o bundler do wrangler (keepNames) a envolveria em __name(), que não existe na página.
  if (Math.abs(novo.minutos - mostrado.minutos) <= Math.max(3, mostrado.minutos * 0.25)) return { mostrar: novo, pendente: null };
  if (pendente && Math.abs(novo.minutos - pendente.minutos) <= Math.max(3, pendente.minutos * 0.25)) return { mostrar: novo, pendente: null };
  return { mostrar: mostrado, pendente: novo };
}
