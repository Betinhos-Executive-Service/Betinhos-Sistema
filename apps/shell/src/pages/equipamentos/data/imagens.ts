/** Estado de uma imagem no cache: blob URL pronta, `null` = não baixou (a tela mostra o ícone), `undefined` = ainda não pedida ou baixando. */
export type EstadoImagem = string | null | undefined

/**
 * Cache em memória das fotos baixadas do SharePoint, por caminho: cada arquivo é pedido uma vez enquanto a página
 * está aberta (a lista e o drawer compartilham) e vira blob URL. Falha também fica guardada, para rolar a lista
 * de volta não pedir de novo. `liberar` revoga tudo (ao sair da página).
 */
export function createCacheImagens(baixar: (caminho: string) => Promise<Blob>) {
  const prontas = new Map<string, string | null>()
  const pedidos = new Map<string, Promise<string | null>>()
  const revogar = (url: string | null | undefined) => { if (url) try { URL.revokeObjectURL(url) } catch { /* sem suporte */ } }

  return {
    estado: (caminho: string): EstadoImagem => prontas.get(caminho),

    /** Baixa (uma vez) e devolve a blob URL; `null` se o flow ou o navegador falharem. */
    pedir(caminho: string): Promise<string | null> {
      if (prontas.has(caminho)) return Promise.resolve(prontas.get(caminho)!)
      let pedido = pedidos.get(caminho)
      if (!pedido) {
        pedido = baixar(caminho).then((blob) => URL.createObjectURL(blob)).catch(() => null).then((url) => {
          pedidos.delete(caminho)
          prontas.set(caminho, url)
          return url
        })
        pedidos.set(caminho, pedido)
      }
      return pedido
    },

    /** Foto recém-enviada: usa o próprio arquivo, sem baixar de volta. */
    guardar(caminho: string, arquivo: Blob) {
      try {
        revogar(prontas.get(caminho))
        prontas.set(caminho, URL.createObjectURL(arquivo))
      } catch { /* sem blob URL, a imagem é baixada quando aparecer */ }
    },

    /** Foto excluída: solta a blob URL. */
    esquecer(caminho: string) {
      revogar(prontas.get(caminho))
      prontas.delete(caminho)
    },

    liberar() {
      for (const url of prontas.values()) revogar(url)
      prontas.clear()
      pedidos.clear()
    },
  }
}

export type CacheImagens = ReturnType<typeof createCacheImagens>
