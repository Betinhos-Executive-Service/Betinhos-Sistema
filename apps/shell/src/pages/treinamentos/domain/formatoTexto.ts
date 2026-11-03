/** Conversão entre o texto gravado (# título, - item, **negrito**) e o HTML do editor visual. Uma linha do texto = um bloco. */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((p) => (/^\*\*[^*]+\*\*$/.test(p) ? `<strong>${esc(p.slice(2, -2))}</strong>` : esc(p))).join('')

export function textoParaHtml(texto: string): string {
  const out: string[] = []
  let lista = false
  const fechar = () => { if (lista) { out.push('</ul>'); lista = false } }
  for (const linha of texto.replace(/\r\n/g, '\n').split('\n')) {
    const item = /^\s*[-*•]\s+(.*)$/.exec(linha)
    const titulo = /^\s*#{1,3}\s*(\S.*)$/.exec(linha)
    if (item) { if (!lista) { out.push('<ul>'); lista = true } out.push(`<li>${inline(item[1])}</li>`); continue }
    fechar()
    if (titulo) out.push(`<h3>${inline(titulo[1])}</h3>`)
    else out.push(linha.trim() ? `<p>${inline(linha)}</p>` : '<p><br></p>')
  }
  fechar()
  return out.join('')
}

function emTexto(no: Node): string {
  if (no.nodeType === 3) return (no.textContent ?? '').replace(/ /g, ' ')
  if (!(no instanceof HTMLElement)) return ''
  if (no.tagName === 'BR') return ''
  const dentro = Array.from(no.childNodes).map(emTexto).join('')
  if (no.tagName === 'STRONG' || no.tagName === 'B') return dentro.trim() ? `**${dentro}**` : dentro
  return dentro
}

export function htmlParaTexto(raiz: HTMLElement): string {
  const linhas: string[] = []
  const bloco = (el: HTMLElement) => {
    const tag = el.tagName
    if (tag === 'UL' || tag === 'OL') { el.querySelectorAll(':scope > li').forEach((li) => linhas.push(`- ${emTexto(li).replace(/\n/g, ' ')}`)); return }
    if (/^H[1-6]$/.test(tag)) { linhas.push(`# ${emTexto(el).replace(/\n/g, ' ')}`); return }
    if (tag === 'P' || tag === 'DIV') {
      const filhosBloco = Array.from(el.children).some((c) => /^(P|DIV|UL|OL|H[1-6])$/.test(c.tagName))
      if (filhosBloco) { Array.from(el.children).forEach((c) => bloco(c as HTMLElement)); return }
      linhas.push(emTexto(el).replace(/\n/g, ' '))
      return
    }
    linhas.push(emTexto(el))
  }
  raiz.childNodes.forEach((n) => {
    if (n.nodeType === 3) { if ((n.textContent ?? '').trim()) linhas.push(emTexto(n)) } else if (n instanceof HTMLElement) bloco(n)
  })
  return linhas.join('\n')
}
