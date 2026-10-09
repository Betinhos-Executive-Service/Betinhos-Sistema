import { Button, useToast } from '@betinhos/ui'
import { Copy } from 'lucide-react'

/* "Copiar tabela": os valores do card em TSV (colunas por tabulação), prontos para colar na planilha. */

/** Tabela a copiar: cabeçalho e linhas já formatados em pt-BR (como aparecem no card). */
export type TabelaCopiavel = { colunas: string[]; linhas: string[][] }
/** Coluna da cópia: cabeçalho e o texto da célula. */
export type ColunaCopia<R> = readonly [cabecalho: string, celula: (r: R) => string | number]

/** Monta a tabela copiável a partir das linhas do card. Números crus viram texto pt-BR. */
export function tabelaCopia<R>(rows: readonly R[], colunas: readonly ColunaCopia<R>[]): TabelaCopiavel {
  const texto = (v: string | number) => (typeof v === 'number' ? v.toLocaleString('pt-BR') : v)
  return { colunas: colunas.map(([c]) => c), linhas: rows.map((r) => colunas.map(([, celula]) => texto(celula(r)))) }
}

/** TSV: tabulação entre colunas, quebra de linha entre linhas; espaço fixo vira espaço comum e tab/quebra dentro da célula viram espaço. */
export function paraTsv({ colunas, linhas }: TabelaCopiavel) {
  const limpa = (s: string) => s.replace(/[\t\r\n]+/g, ' ').replace(/[  ]/g, ' ').trim()
  return [colunas, ...linhas].map((linha) => linha.map(limpa).join('\t')).join('\n')
}

/** Copia texto: `navigator.clipboard` quando disponível; senão (iframe sem permissão, http), um textarea temporário e `execCommand`. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {
    // Cai no método antigo abaixo.
  }
  const area = document.createElement('textarea')
  area.value = texto
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  // Dentro de um Drawer/Dialog modal, só a camada superior recebe foco e seleção.
  const destino = document.querySelector('dialog[open]') ?? document.body
  destino.appendChild(area)
  area.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  area.remove()
  return ok
}

/** Botão "Copiar tabela" do rodapé do card, com toast do DS: sucesso transitório ou erro com o próximo passo. */
export function BotaoCopiar({ tabela, nome }: { tabela: TabelaCopiavel; nome: string }) {
  const toast = useToast()
  const avisar = (ok: boolean) => {
    try {
      toast(ok
        ? { tone: 'success', message: 'Tabela copiada.' }
        : { tone: 'danger', message: 'Não foi possível copiar a tabela. Selecione os valores na tabela e copie com Ctrl+C.' })
    } catch {
      // Fora do ToastProvider (testes de componente): a cópia já aconteceu.
    }
  }
  return (
    <Button variant="ghost" size="compact" icon={<Copy size={14} aria-hidden="true" />} onClick={() => void copiarTexto(paraTsv(tabela)).then(avisar)}>
      Copiar tabela{' '}<span className="dash-sr">{nome}</span>
    </Button>
  )
}
