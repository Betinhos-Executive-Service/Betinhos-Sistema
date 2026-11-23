// HTML da página (sem JavaScript), no visual do Design System Betinhos (tokens copiados como variáveis CSS; fontes e logo
// em public/estatico). Uma coluna: a cópia mais recente com os botões de baixar; cópias anteriores e downloads recolhidos.
// Cada execução grava dois arquivos com o mesmo carimbo: o completo e a planilha de operação (betinhos-prod-operacao-*).
const FUSO = 'America/Sao_Paulo'
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export const PADRAO = /^(diario|semanal|mensal)\/betinhos-prod-(operacao-)?(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})\.zip$/
// Roda todo dia às 03:23; dois dias sem cópia nova = parou.
const PARADO_MS = 48 * 3600_000
const ETIQUETA = { diario: '', semanal: 'Semanal', mensal: 'Mensal' }

export const tamanho = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`).replace('.', ',')

export function haQuanto(ms) {
  const min = Math.max(0, Math.round(ms / 60_000))
  if (min < 60) return min <= 1 ? 'agora há pouco' : `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `há ${h} h`
  return `há ${Math.round(h / 24)} dias`
}

// [{ key, size }] → { diario: [{ chave, operacao, ms, quando, tamanho, bytes }], ... }. O carimbo do nome é hora de Brasília (UTC−3).
export function agrupar(objetos) {
  const grupos = { diario: [], semanal: [], mensal: [] }
  for (const o of objetos) {
    const m = PADRAO.exec(o.key)
    if (!m) continue
    const [, classe, operacao, a, me, d, h, mi] = m
    grupos[classe].push({ chave: o.key, operacao: Boolean(operacao), ms: Date.UTC(+a, me - 1, +d, +h + 3, +mi), quando: `${d}/${me}/${a} às ${h}:${mi}`, tamanho: tamanho(o.size), bytes: o.size })
  }
  for (const g of Object.values(grupos)) g.sort((x, y) => y.ms - x.ms)
  return grupos
}

// A mesma execução pode estar em diario/, semanal/ e mensal/, em dois arquivos: na lista aparece uma vez, com as
// etiquetas juntas e um link para cada arquivo ({ completo, operacao }, cada um { chave, tamanho } ou ausente).
function unicas(grupos) {
  const porCarimbo = new Map()
  for (const [classe, itens] of Object.entries(grupos)) {
    for (const i of itens) {
      const e = porCarimbo.get(i.ms) ?? { ms: i.ms, quando: i.quando, etiquetas: new Set() }
      porCarimbo.set(i.ms, e)
      if (ETIQUETA[classe]) e.etiquetas.add(ETIQUETA[classe])
      e[i.operacao ? 'operacao' : 'completo'] ??= { chave: i.chave, tamanho: i.tamanho }
    }
  }
  return [...porCarimbo.values()].sort((x, y) => y.ms - x.ms)
}

const icone = (d) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`
const BAIXAR = icone('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>')
const PLANILHA = icone('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/>')
const ALERTA = icone('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>')

const CSS = `
@font-face{font-family:Manrope;font-weight:400 800;font-display:swap;src:url(/estatico/manrope-latin.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2212}
@font-face{font-family:Manrope;font-weight:400 800;font-display:swap;src:url(/estatico/manrope-latin-ext.woff2) format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1E9F,U+20A0-20AB,U+20AD-20C0}
@font-face{font-family:"Centabel Book";font-display:swap;src:url(/estatico/centabel-book.ttf) format("truetype")}
:root{--brand:#001a3d;--acao:#2159d2;--acao-hover:#1a49ad;--acao-suave:#edf3ff;--canvas:#f0f0f0;--superficie:#fff;
--texto:#0f172a;--texto-2:#64748b;--texto-3:#94a3b8;--borda:#e2e8f0;--sucesso:#147a4b;--perigo:#c12f45;--perigo-suave:#fff0f3;
--sombra:0 8px 24px rgba(0,26,61,.045);--r-md:10px;--r-lg:12px;--r-xl:17px;--sans:Manrope,"Segoe UI",system-ui,sans-serif;--display:"Centabel Book",Georgia,serif}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--canvas);color:var(--texto);font:400 14px/1.54 var(--sans);font-variant-numeric:tabular-nums}
.ic{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.topo{background:var(--brand);color:#fff}
.topo-in,main,.rodape{max-width:640px;margin:0 auto;padding-left:16px;padding-right:16px}
.topo-in{padding-top:12px;padding-bottom:12px;display:flex;align-items:center;gap:12px}
.topo img{width:32px;height:32px;border-radius:8px}
.topo .nome{font:400 20px/1 var(--display);letter-spacing:.2px}
.topo .quem{margin-left:auto;font-size:12px;color:#c9d4e6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
main{padding-top:24px;display:grid;gap:12px}
.cartao{background:var(--superficie);border:1px solid var(--borda);border-radius:var(--r-xl);box-shadow:var(--sombra)}
.principal{padding:24px;display:grid;gap:16px}
.status{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;color:var(--sucesso)}
.status::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor}
.status.nada{color:var(--texto-2)}
.rotulo{font:800 11px/1.27 var(--sans);letter-spacing:.8px;text-transform:uppercase;color:var(--texto-2)}
.data{font:800 clamp(24px,6vw,30px)/1.2 var(--sans);letter-spacing:-.4px;margin:2px 0 0}
.meta{color:var(--texto-2);margin:2px 0 0}
.alerta{display:flex;gap:10px;align-items:flex-start;background:var(--perigo-suave);color:var(--perigo);border-radius:var(--r-lg);padding:12px 14px;font-weight:600;margin:0}
.botao{display:flex;align-items:center;justify-content:center;gap:8px;background:var(--acao);color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:12px 20px;border-radius:var(--r-md);min-height:48px}
.botao:hover{background:var(--acao-hover)}
.botao.sec{background:var(--superficie);color:var(--acao);border:1px solid var(--borda);font-size:15px}.botao.sec:hover{background:var(--acao-suave)}
.botoes{display:grid;gap:8px}
a:focus-visible,summary:focus-visible{outline:3px solid var(--acao);outline-offset:2px}
.como{margin:0;color:var(--texto-2);font-size:13px}.como b{color:var(--texto)}.como a{color:var(--acao)}
details{padding:0 8px}
summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;padding:14px 8px;font-weight:700;min-height:48px}
summary::-webkit-details-marker{display:none}
summary::after{content:"";width:8px;height:8px;border:solid var(--texto-2);border-width:0 2px 2px 0;transform:rotate(45deg);margin:-4px 6px 0}
details[open] summary::after{transform:rotate(225deg);margin-top:4px}
summary .n{color:var(--texto-2);font-weight:500;margin-left:6px;margin-right:auto}
.lista{list-style:none;margin:0;padding:0 0 8px}
.lista li{display:flex;align-items:center;gap:8px;padding:4px 0 4px 8px;border-top:1px solid var(--borda)}
.lista .q{flex:1;min-width:0}.lista .t{color:var(--texto-2);font-size:12px}
.tag{font-size:11px;font-weight:700;color:var(--texto-2);background:var(--canvas);border-radius:999px;padding:1px 8px;margin-left:6px}
.lista a{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:var(--r-md);color:var(--acao)}
.lista a:hover{background:var(--acao-suave)}
.lista .vazio{color:var(--texto-3);padding:10px 8px}
.quem-baixou li{display:block;padding:8px;font-size:13px}.quem-baixou small{display:block;color:var(--texto-2);font-size:12px}
.rodape{padding-top:16px;padding-bottom:16px;color:var(--texto-2);font-size:12px;line-height:1.5}
.rodape p{margin:0 0 4px}.versao{color:var(--texto-3);font-size:11px;pointer-events:none;user-select:none}
@media (max-width:520px){.principal{padding:18px}.topo .quem{display:none}}`

const fmtData = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// "mensal/betinhos-prod-20261101-0323.zip" → "cópia de 01/11/2026 às 03:23"; com operacao-, "planilha de operação de ...".
const nomeCopia = (chave) => {
  const m = PADRAO.exec(chave ?? '')
  return m ? `${m[2] ? 'planilha de operação' : 'cópia'} de ${m[5]}/${m[4]}/${m[3]} às ${m[6]}:${m[7]}` : String(chave ?? '')
}

function principal(maisNova, agora) {
  if (!maisNova) {
    return `<section class="cartao principal" aria-label="Última cópia"><span class="status nada">Aguardando a primeira cópia</span>
<div><div class="rotulo">Última cópia</div><p class="data">Nenhuma cópia ainda</p><p class="meta">O backup roda todo dia às 03:23.</p></div></section>`
  }
  const idade = agora - maisNova.ms
  const parou = idade > PARADO_MS
  return `<section class="cartao principal" aria-label="Última cópia">
${parou ? `<p class="alerta" role="alert">${ALERTA}<span>Backup parado: nenhuma cópia nova ${esc(haQuanto(idade))}. Avise o Renan.</span></p>` : '<span class="status">Backup em dia</span>'}
<div><div class="rotulo">Última cópia</div><p class="data">${esc(maisNova.quando)}</p><p class="meta">${esc(haQuanto(idade))}</p></div>
<div class="botoes">${maisNova.operacao ? `<a class="botao" href="/baixar/${esc(maisNova.operacao.chave)}" download>${PLANILHA}Baixar planilha de operação</a>` : ''}
${maisNova.completo ? `<a class="botao${maisNova.operacao ? ' sec' : ''}" href="/baixar/${esc(maisNova.completo.chave)}" download>${BAIXAR}Baixar backup completo · ${esc(maisNova.completo.tamanho)}</a>` : ''}</div>
<p class="como">Abra com o <b>7-Zip</b> (<a href="https://7-zip.org" rel="noreferrer">7-zip.org</a>) e a senha dos backups do gerenciador de senhas. A <b>planilha de operação</b> traz os serviços de hoje em diante, os dos últimos 60 dias e os contatos; o <b>completo</b> tem todas as tabelas na pasta <b>planilhas</b>.</p>
</section>`
}

function anteriores(itens) {
  const linhas = itens.length
    ? itens.map((i) => `<li><span class="q">${esc(i.quando)}${[...i.etiquetas].map((e) => `<span class="tag">${e}</span>`).join('')}</span>${i.completo ? `<span class="t">${esc(i.completo.tamanho)}</span>` : ''}${
      i.operacao ? `<a href="/baixar/${esc(i.operacao.chave)}" download aria-label="Baixar planilha de operação de ${esc(i.quando)}" title="Planilha de operação">${PLANILHA}</a>` : ''}${
      i.completo ? `<a href="/baixar/${esc(i.completo.chave)}" download aria-label="Baixar backup completo de ${esc(i.quando)}" title="Backup completo">${BAIXAR}</a>` : ''}</li>`).join('')
    : '<li class="vazio">Nenhuma outra cópia.</li>'
  return `<details class="cartao"><summary>Cópias anteriores<span class="n">${itens.length}</span></summary><ul class="lista">${linhas}</ul></details>`
}

function quemBaixou(downloads) {
  const linhas = downloads.length
    ? downloads.map((d) => `<li>${esc(d.email)}<small>${esc(fmtData.format(d.ms).replace(',', ' às'))} · ${esc(nomeCopia(d.chave))}</small></li>`).join('')
    : '<li class="vazio">Ninguém baixou ainda.</li>'
  return `<details class="cartao"><summary>Quem baixou<span class="n">${downloads.length}</span></summary><ul class="lista quem-baixou">${linhas}</ul></details>`
}

export function paginaHtml({ grupos, email, versao, downloads = [], agora = Date.now() }) {
  const [maisNova, ...resto] = unicas(grupos)
  const uso = Object.values(grupos).flat().reduce((s, i) => s + i.bytes, 0)
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Backups Betinhos</title><link rel="icon" href="/estatico/logo-b.webp"><style>${CSS}</style></head><body>
<header class="topo"><div class="topo-in"><img src="/estatico/logo-b.webp" alt="Betinhos" width="32" height="32"><span class="nome">Backups</span><span class="quem">${esc(email)}</span></div></header>
<main>
${principal(maisNova, agora)}
${anteriores(resto)}
${quemBaixou(downloads)}
</main>
<footer class="rodape"><p>Dados de clientes e passageiros (LGPD): não encaminhe o arquivo e apague do computador quando terminar. Cada download fica registrado.</p>
<p>Espaço usado: ${uso ? tamanho(uso) : '0 MB'} de 10 GB gratuitos.</p><div class="versao" aria-hidden="true">${esc(versao)}</div></footer></body></html>`
}
