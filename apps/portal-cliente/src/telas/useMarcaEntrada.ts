import { useEffect, useState } from 'react'
import { useApi } from '../api/ApiContext'
import { DOMINIOS_PUBLICOS_MARCA, type Marca } from '../domain/marca'
import { dominioDe } from '../domain/pedidos'

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ESPERA_MARCA_MS = 450

/**
 * Marca da tela de entrada: a do link (`?c=`) e, enquanto a pessoa digita, a do domínio do e-mail (com espera para não
 * consultar a cada tecla). Domínio público não consulta. Sem resposta nova, mantém a marca atual: não pisca.
 */
export function useMarcaEntrada(chave: string | null, email: string): Marca | null {
  const api = useApi()
  const [doLink, setDoLink] = useState<Marca | null>(null)
  const [doEmail, setDoEmail] = useState<{ dominio: string; marca: Marca | null } | null>(null)
  const dominio = EMAIL_VALIDO.test(email.trim()) ? dominioDe(email.trim().toLowerCase()) : ''

  useEffect(() => {
    if (!chave) return
    const ctl = new AbortController()
    api.marca({ chave }, ctl.signal).then(setDoLink).catch(() => {})
    return () => ctl.abort()
  }, [api, chave])

  useEffect(() => {
    if (!dominio || DOMINIOS_PUBLICOS_MARCA.includes(dominio)) {
      setDoEmail(null)
      return
    }
    const ctl = new AbortController()
    const t = setTimeout(() => {
      api.marca({ email: email.trim().toLowerCase() }, ctl.signal).then((marca) => setDoEmail({ dominio, marca })).catch(() => {})
    }, ESPERA_MARCA_MS)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
    // A consulta é por domínio: trocar só o início do e-mail não consulta de novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, dominio])

  return (doEmail?.dominio === dominio ? doEmail.marca : null) ?? doLink
}
