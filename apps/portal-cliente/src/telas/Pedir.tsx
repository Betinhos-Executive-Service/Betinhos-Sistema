import { useState, type FormEvent } from 'react'
import { Alert, Button, Field, Input, PageHeader, Textarea, useToast } from '@betinhos/ui'
import { Plus, Send, X } from 'lucide-react'
import { useApi } from '../api/ApiContext'
import { ErroPortal } from '../api/PortalApi'
import { MAX_ENDERECO, MAX_NOME, MAX_PASSAGEIROS, MAX_TEXTO, normalizarPedido, validarPedido, type ErrosPedido } from '../domain/pedidos'
import { deLocalSaoPaulo, paraLocalSaoPaulo } from '../domain/regras'
import './Pedir.css'

/** Duplicado e recusa do servidor com motivo (ex.: saída que ficou no passado) mostram o motivo; o resto, aviso genérico. */
const GENERICO = 'Não foi possível enviar o pedido agora. Seus dados continuam aqui; tente de novo em instantes.'

/** Duplicado e erro de campo vindo do servidor têm texto próprio; o resto é o aviso genérico. */
function mensagemDoErro(err: unknown): string {
  if (!(err instanceof ErroPortal)) return GENERICO
  if (err.codigo === 'duplicado') return 'Este pedido já foi enviado há menos de um minuto. Confira em Meus serviços antes de pedir de novo.'
  return err.codigo === 'nao_permitido' && err.message !== err.codigo ? err.message : GENERICO
}

export function Pedir({ onPedido }: { onPedido: () => void }) {
  const api = useApi()
  const toast = useToast()
  const [passageiros, setPassageiros] = useState([''])
  const [origem, setOrigem] = useState('')
  const [destino, setDestino] = useState('')
  const [saida, setSaida] = useState('')
  const [observacao, setObservacao] = useState('')
  const [erros, setErros] = useState<ErrosPedido>({})
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const mudarPassageiro = (i: number, nome: string) => setPassageiros((xs) => xs.map((x, j) => (j === i ? nome : x)))

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const pedido = normalizarPedido({ passageiros, origem, destino, saida: deLocalSaoPaulo(saida), observacao })
    const novos = validarPedido(pedido, Date.now())
    setErros(novos)
    setErro(null)
    if (Object.keys(novos).length) return
    setEnviando(true)
    try {
      const criado = await api.pedir(pedido)
      toast({ tone: 'success', message: `Pedido ${criado.numero} enviado. A Betinhos vai programar e você acompanha por aqui.` })
      onPedido()
    } catch (err) {
      setErro(mensagemDoErro(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="pc-conteudo">
      <PageHeader title="Pedir serviço" description="Informe quem viaja, de onde, para onde e quando. A Betinhos confirma, programa o motorista e o voucher aparece em Meus serviços." />

      <form className="pc-pedir__form" onSubmit={enviar} noValidate>
        <fieldset className="pc-pedir__grupo">
          <legend className="pc-sr">Passageiros</legend>
          {passageiros.map((nome, i) => (
            <div key={i} className="pc-pedir__passageiro">
              <Field label={i === 0 ? 'Passageiro' : `Passageiro ${i + 1}`} error={i === 0 ? erros.passageiros : undefined} required={i === 0}>
                <Input value={nome} onChange={(e) => mudarPassageiro(i, e.target.value)} autoComplete="off" placeholder="Nome completo" size="touch" maxLength={MAX_NOME} invalid={i === 0 && !!erros.passageiros} />
              </Field>
              {i > 0 && (
                <Button type="button" variant="ghost" size="compact" aria-label={`Remover passageiro ${i + 1}`} onClick={() => setPassageiros((xs) => xs.filter((_, j) => j !== i))} icon={<X size={16} aria-hidden />} />
              )}
            </div>
          ))}
          {passageiros.length < MAX_PASSAGEIROS && (
            <Button type="button" variant="ghost" size="compact" className="pc-pedir__mais" onClick={() => setPassageiros((xs) => [...xs, ''])} icon={<Plus size={16} aria-hidden />}>
              Adicionar passageiro
            </Button>
          )}
        </fieldset>

        <Field label="Saída de" error={erros.origem} required>
          <Input value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="Endereço, empresa ou aeroporto" size="touch" maxLength={MAX_ENDERECO} invalid={!!erros.origem} />
        </Field>
        <Field label="Destino" error={erros.destino} required>
          <Input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Endereço, empresa ou aeroporto" size="touch" maxLength={MAX_ENDERECO} invalid={!!erros.destino} />
        </Field>
        <Field label="Data e hora da saída" error={erros.saida} hint="Horário de Brasília" required>
          <Input type="datetime-local" value={saida} min={paraLocalSaoPaulo(Date.now())} onChange={(e) => setSaida(e.target.value)} size="touch" invalid={!!erros.saida} className="pc-pedir__quando" />
        </Field>
        <Field label="Observação" error={erros.observacao} hint="Voo, bagagem, parada no caminho, centro de custo.">
          <Textarea rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={MAX_TEXTO} invalid={!!erros.observacao} placeholder="Opcional" />
        </Field>

        {erro && <Alert tone="danger">{erro}</Alert>}
        <Button type="submit" size="touch" loading={enviando} icon={<Send size={18} aria-hidden />} className="pc-pedir__enviar">Enviar pedido</Button>
      </form>
    </main>
  )
}
