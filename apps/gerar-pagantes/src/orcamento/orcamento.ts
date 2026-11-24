import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { formatCurrency } from '../money'
import modeloUrl from './modelo-orcamento.docx?inline'

// Modelo do orçamento de Pedido de compra (Johnson&Johnson/Kenvue, via Ariba). O .docx traz os marcadores
// {{DATA}}, {{NOME}}, {{DIAS}} e {{VALOR}} no word/document.xml; o resto do papel timbrado fica como está.
export interface DadosOrcamento {
  nome: string
  valorCents: number
  inicio: string | null
  fim: string | null
  hoje?: Date
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

function hojeSp(hoje: Date) {
  const partes = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(hoje)
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? ''
  return { dia: valor('day'), mes: Number(valor('month')), ano: valor('year') }
}

export function diasDoServico(inicio: string | null, fim: string | null): string {
  if (!inicio) return fim ? dataBr(fim) : ''
  return !fim || fim.slice(0, 10) === inicio.slice(0, 10) ? dataBr(inicio) : `${dataBr(inicio)} a ${dataBr(fim)}`
}

export function nomeArquivoOrcamento(nome: string, hoje = new Date()): string {
  const { dia, mes } = hojeSp(hoje)
  const limpo = nome.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR')
  return `ORÇAMENTO ${limpo} - ${dia}-${String(mes).padStart(2, '0')}.docx`
}

export function preencherOrcamento(modelo: Uint8Array, dados: DadosOrcamento): Uint8Array {
  const arquivos = unzipSync(modelo)
  const { dia, mes, ano } = hojeSp(dados.hoje ?? new Date())
  const valores: Record<string, string> = {
    DATA: `${dia} de ${MESES[mes - 1]} de ${ano}`,
    NOME: dados.nome.trim(),
    DIAS: diasDoServico(dados.inicio, dados.fim),
    VALOR: formatCurrency(dados.valorCents)
  }
  const documento = strFromU8(arquivos['word/document.xml'])
  arquivos['word/document.xml'] = strToU8(documento.replace(/\{\{(DATA|NOME|DIAS|VALOR)\}\}/g, (_, chave: string) => escXml(valores[chave])))
  return zipSync(arquivos)
}

export async function baixarOrcamento(dados: DadosOrcamento): Promise<void> {
  const modelo = new Uint8Array(await (await fetch(modeloUrl)).arrayBuffer())
  const blob = new Blob([preencherOrcamento(modelo, dados) as Uint8Array<ArrayBuffer>], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivoOrcamento(dados.nome, dados.hoje)
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
