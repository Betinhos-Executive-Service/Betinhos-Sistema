// HTML da página (sem JavaScript). Lista as cópias por tipo, da mais nova para a mais antiga.
const FUSO = 'America/Sao_Paulo'
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export const PADRAO = /^(diario|semanal|mensal)\/betinhos-prod-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})\.zip$/
const TITULOS = { diario: 'Diárias (últimos 7 dias)', semanal: 'Semanais (domingos, 8 semanas)', mensal: 'Mensais (dia 1, 12 meses)' }

export const tamanho = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`).replace('.', ',')

// [{ key, size }] → { diario: [{ chave, quando, tamanho }], ... }
export function agrupar(objetos) {
  const grupos = { diario: [], semanal: [], mensal: [] }
  for (const o of objetos) {
    const m = PADRAO.exec(o.key)
    if (!m) continue
    grupos[m[1]].push({ chave: o.key, carimbo: `${m[2]}${m[3]}${m[4]}${m[5]}${m[6]}`, quando: `${m[4]}/${m[3]}/${m[2]} às ${m[5]}:${m[6]}`, tamanho: tamanho(o.size) })
  }
  for (const g of Object.values(grupos)) g.sort((a, b) => b.carimbo.localeCompare(a.carimbo))
  return grupos
}

const CSS = `
:root{--bg:#f6f5f2;--card:#fff;--texto:#1c1c1a;--suave:#5f5e58;--borda:#dedcd5;--acento:#1f3a5f;--acento-txt:#fff;--aviso:#fff6e0;--aviso-borda:#e8cf8a}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--card:#1e1e1c;--texto:#ecebe6;--suave:#a5a39b;--borda:#34332f;--acento:#8fb3e0;--acento-txt:#10213a;--aviso:#2b2616;--aviso-borda:#5c4e22}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--texto);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 16px 24px}h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:1.05rem;margin:32px 0 8px}
.sub{color:var(--suave);margin:0 0 24px}.passos{background:var(--card);border:1px solid var(--borda);border-radius:12px;padding:16px 20px}
.passos ol{margin:8px 0 0;padding-left:20px}.passos li{margin:4px 0}.aviso{background:var(--aviso);border:1px solid var(--aviso-borda);border-radius:12px;padding:12px 16px;margin-top:16px}
ul.lista{list-style:none;margin:0;padding:0;background:var(--card);border:1px solid var(--borda);border-radius:12px}
ul.lista li{display:flex;align-items:center;gap:12px;padding:12px 16px;border-top:1px solid var(--borda)}ul.lista li:first-child{border-top:0}
.quando{flex:1;font-variant-numeric:tabular-nums}.tam{color:var(--suave);font-variant-numeric:tabular-nums}
a.baixar{background:var(--acento);color:var(--acento-txt);text-decoration:none;padding:8px 14px;border-radius:8px;font-weight:600;white-space:nowrap}
a.baixar:focus-visible{outline:3px solid var(--texto);outline-offset:2px}.vazio{color:var(--suave);padding:12px 16px}
.versao{text-align:right;padding:0 12px 8px;font-size:12px;color:var(--suave);pointer-events:none;user-select:none}
@media (max-width:480px){ul.lista li{flex-wrap:wrap}.quando{flex-basis:100%}}`

export function paginaHtml({ grupos, email, versao, agora = new Date() }) {
  const atualizado = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' }).format(agora)
  const secao = (classe) => {
    const itens = grupos[classe]
    const corpo = itens.length
      ? itens.map((i, n) => `<li><span class="quando">${esc(i.quando)}${n === 0 && classe === 'diario' ? ' · <strong>mais recente</strong>' : ''}</span><span class="tam">${esc(i.tamanho)}</span><a class="baixar" href="/baixar/${esc(i.chave)}" download>Baixar</a></li>`).join('')
      : '<li class="vazio">Nenhuma cópia ainda.</li>'
    return `<h2>${TITULOS[classe]}</h2><ul class="lista">${corpo}</ul>`
  }
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Backups Betinhos</title><style>${CSS}</style></head><body><main>
<h1>Backups do sistema</h1><p class="sub">Cópia diária dos dados do Sistema Betinhos, guardada fora da Microsoft. Entrou como ${esc(email)} · lista de ${esc(atualizado)}.</p>
<section class="passos" aria-label="Como abrir"><strong>Como abrir uma cópia</strong><ol>
<li>Baixe a cópia (a mais recente, salvo se precisar de um dia específico).</li>
<li>Abra o arquivo com o <strong>7-Zip</strong> (7-zip.org; o Windows sozinho não abre) e digite a senha dos backups, que fica no gerenciador de senhas.</li>
<li>Na pasta <strong>planilhas</strong>, abra a tabela que precisa (Serviços, Clientes, Passageiros…) no Excel.</li></ol>
<div class="aviso">São dados de clientes e passageiros (LGPD). Não encaminhe o arquivo, não salve em pendrive e apague do computador quando terminar. Cada download fica registrado.</div></section>
${secao('diario')}${secao('semanal')}${secao('mensal')}
</main><div class="versao" aria-hidden="true">${esc(versao)}</div></body></html>`
}
