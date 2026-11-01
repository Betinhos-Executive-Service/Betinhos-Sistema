import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Dialog, Drawer, Field, Select, Upload, useToast, type UploadFile } from '@betinhos/ui'
import { ImportacaoParcial, type Source } from '../data/source'
import { ACEITA, TAMANHO_MAX, lerArquivo, type Tabela } from '../domain/arquivo'
import { fmtData, fmtLitros, fmtMoeda } from '../domain/formato'
import { lerLinhas, prepararImportacao, type Resultado } from '../domain/importacao'
import { CAMPOS, CAMPO_ROTULO, OBRIGATORIOS, faltamNoMapeamento, mapeamentoInicial, salvarMapeamento, type Campo, type Mapeamento } from '../domain/mapeamento'
import { OPERADORAS, ORIGEM_ROTULO, type Abastecimento, type Motorista, type Operadora, type Veiculo } from '../domain/types'

type Props = {
  open: boolean
  onClose: () => void
  source: Source
  veiculos: Veiculo[]
  motoristas: Motorista[]
  /** Chaves dos abastecimentos já na base (deduplicação). */
  existentes: Set<string>
  onImportado: (criados: Abastecimento[]) => void
  onVerPendencias: () => void
}

type Arquivo = { file: File; tabela: Tabela }
type Progresso = { feitos: number; total: number }
type Concluido = Omit<Resultado, 'novos'> & { criados: number; erro: string | null }
const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const OPERADORA_OPTIONS = OPERADORAS.map((o) => ({ value: o, label: ORIGEM_ROTULO[o] }))
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/**
 * Importação em três passos: arquivo e operadora → mapeamento de colunas (salvo por operadora) com prévia e
 * contagem → gravação com progresso e resumo. Fechar com arquivo carregado pede confirmação; gravando, não fecha.
 */
export function ImportarDrawer({ open, onClose, source, veiculos, motoristas, existentes, onImportado, onVerPendencias }: Props) {
  const toast = useToast()
  const [operadora, setOperadora] = useState<Operadora>('ctf')
  const [arquivo, setArquivo] = useState<Arquivo | null>(null)
  const [lendo, setLendo] = useState(false)
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)
  const [mapeamento, setMapeamento] = useState<Mapeamento>({})
  const [lembrar, setLembrar] = useState(true)
  const [progresso, setProgresso] = useState<Progresso | null>(null)
  const [concluido, setConcluido] = useState<Concluido | null>(null)
  const [pendingExit, setPendingExit] = useState(false)

  useEffect(() => { if (!open) { setArquivo(null); setErroArquivo(null); setProgresso(null); setConcluido(null) } }, [open])

  const cabecalho = arquivo?.tabela.cabecalho ?? []
  const faltam = useMemo(() => faltamNoMapeamento(mapeamento, cabecalho), [mapeamento, cabecalho])
  const lidas = useMemo(() => (arquivo && !faltam.length ? lerLinhas(cabecalho, arquivo.tabela.linhas, mapeamento) : []), [arquivo, cabecalho, mapeamento, faltam])
  // A tela só carrega os últimos meses; o arquivo pode ser mais antigo. As chaves do intervalo do arquivo vêm do
  // servidor antes de liberar a importação (sem elas a reimportação duplicaria ou travaria na chave alternativa).
  const periodo = useMemo(() => {
    const dias = lidas.flatMap((l) => (l.data ? [l.data.getTime()] : []))
    return dias.length ? { de: Math.min(...dias), ate: Math.max(...dias) } : null
  }, [lidas])
  const [remotas, setRemotas] = useState<{ chave: string; chaves: string[] } | { chave: string; erro: string } | null>(null)
  const chavePeriodo = periodo ? `${periodo.de}-${periodo.ate}` : null
  useEffect(() => {
    if (!periodo || !chavePeriodo) return
    let vivo = true
    source.chaves(new Date(periodo.de), new Date(periodo.ate)).then(
      (chaves) => { if (vivo) setRemotas({ chave: chavePeriodo, chaves }) },
      (reason) => { if (vivo) setRemotas({ chave: chavePeriodo, erro: reasonText(reason) }) },
    )
    return () => { vivo = false }
  }, [source, periodo, chavePeriodo])
  const conferido = remotas && remotas.chave === chavePeriodo ? remotas : null
  const conferindo = Boolean(periodo) && !conferido
  const jaGravadas = useMemo(() => new Set([...existentes, ...(conferido && 'chaves' in conferido ? conferido.chaves : [])]), [existentes, conferido])
  const resultado = useMemo(() => (arquivo && !faltam.length && !conferindo && !(conferido && 'erro' in conferido) ? prepararImportacao({ linhas: lidas, origem: operadora, arquivo: arquivo.file.name, existentes: jaGravadas, veiculos, motoristas }) : null), [arquivo, lidas, faltam, conferindo, conferido, operadora, jaGravadas, veiculos, motoristas])

  async function escolher(added: File[]) {
    const file = added[0]
    if (!file) return
    setLendo(true)
    setErroArquivo(null)
    try {
      const tabela = await lerArquivo(file)
      setArquivo({ file, tabela })
      setMapeamento(mapeamentoInicial(source.kv, operadora, tabela.cabecalho).mapeamento)
    } catch (reason) {
      setErroArquivo(reasonText(reason))
    } finally { setLendo(false) }
  }

  function trocarOperadora(valor: string | null) {
    const o = (valor ?? 'ctf') as Operadora
    setOperadora(o)
    if (arquivo) setMapeamento(mapeamentoInicial(source.kv, o, arquivo.tabela.cabecalho).mapeamento)
  }

  async function importar() {
    if (!resultado || !arquivo) return
    if (lembrar) salvarMapeamento(source.kv, operadora, mapeamento)
    setProgresso({ feitos: 0, total: resultado.novos.length })
    let criados: Abastecimento[] = []
    let erro: string | null = null
    try {
      criados = await source.importar(resultado.novos, (feitos) => setProgresso({ feitos, total: resultado.novos.length }))
    } catch (reason) {
      erro = reasonText(reason)
      if (reason instanceof ImportacaoParcial) criados = reason.criados
    }
    // Falha no meio: o que entrou fica; o resumo diz quantos e o erro.
    if (criados.length) onImportado(criados)
    setProgresso(null)
    setConcluido({ criados: criados.length, duplicados: resultado.duplicados, pendentes: resultado.pendentes, invalidas: resultado.invalidas, erro })
    if (!erro) toast({ tone: 'success', message: criados.length ? `${plural(criados.length, 'abastecimento importado', 'abastecimentos importados')} do ${ORIGEM_ROTULO[operadora]}.` : 'Nenhum abastecimento novo neste arquivo.' })
  }

  function close() {
    if (progresso) return
    if (arquivo && !concluido) { setPendingExit(true); return }
    onClose()
  }

  const etapa = concluido ? 'resultado' : arquivo ? 'mapear' : 'arquivo'
  const files: UploadFile[] = arquivo ? [{ name: arquivo.file.name, size: arquivo.file.size, type: arquivo.file.type }] : []
  const footer = etapa === 'resultado'
    ? <>{concluido!.pendentes > 0 ? <Button variant="secondary" onClick={() => { onClose(); onVerPendencias() }}>Ver pendências</Button> : null}<Button onClick={onClose}>Fechar</Button></>
    : etapa === 'mapear'
      ? <>
        <Button variant="secondary" disabled={Boolean(progresso)} onClick={() => setArquivo(null)}>Trocar arquivo</Button>
        <Button loading={Boolean(progresso)} disabled={!resultado || !resultado.novos.length} onClick={() => void importar()}>
          {resultado?.novos.length ? `Importar ${plural(resultado.novos.length, 'abastecimento', 'abastecimentos')}` : 'Importar'}
        </Button>
      </>
      : <Button variant="secondary" onClick={onClose}>Cancelar</Button>

  return (
    <>
      <Drawer open={open} onClose={close} size="wide" eyebrow="Abastecimento" title="Importar extrato" footer={footer}>
        {etapa !== 'resultado' ? (
          <div className="ab-form">
            <Field label="Operadora" hint="O mapeamento de colunas fica salvo por operadora neste navegador.">
              <Select aria-label="Operadora" options={OPERADORA_OPTIONS} value={operadora} onChange={trocarOperadora} searchable={false} clearable={false} disabled={Boolean(progresso)} />
            </Field>
            {etapa === 'arquivo' ? (
              <>
                <Upload aria-label="Arquivo do extrato" files={files} onChange={(_, added) => void escolher(added)} accept={ACEITA} maxFiles={1} maxSize={TAMANHO_MAX} disabled={lendo}
                  label="Arraste o extrato ou escolha o arquivo" hint="CSV (ponto e vírgula ou vírgula) ou XLSX até 10 MB; a primeira linha com os títulos das colunas." />
                {lendo ? <p className="ab-muted" role="status">Lendo o arquivo…</p> : null}
                {erroArquivo ? <Alert tone="danger" title="Não foi possível ler o arquivo">{erroArquivo}</Alert> : null}
              </>
            ) : null}
          </div>
        ) : null}
        {etapa === 'mapear' && arquivo ? (
          <MapearColunas arquivo={arquivo} mapeamento={mapeamento} onChange={setMapeamento} faltam={faltam} lidas={lidas} resultado={resultado} lembrar={lembrar} onLembrar={setLembrar} operadora={operadora} progresso={progresso} conferindo={conferindo} erroConferencia={conferido && 'erro' in conferido ? conferido.erro : null} />
        ) : null}
        {etapa === 'resultado' && concluido ? <ResumoImportacao c={concluido} arquivo={arquivo?.file.name ?? ''} /> : null}
      </Drawer>
      <Dialog open={pendingExit} onClose={() => setPendingExit(false)} title="Descartar importação?"
        actions={<>
          <Button variant="secondary" onClick={() => setPendingExit(false)}>Continuar</Button>
          <Button variant="danger" onClick={() => { setPendingExit(false); onClose() }}>Descartar</Button>
        </>}>
        O arquivo foi lido, mas nada foi importado ainda.
      </Dialog>
    </>
  )
}

type MapearProps = {
  arquivo: Arquivo; mapeamento: Mapeamento; onChange: (m: Mapeamento) => void; faltam: Campo[]
  lidas: ReturnType<typeof lerLinhas>; resultado: Resultado | null; lembrar: boolean; onLembrar: (v: boolean) => void; operadora: Operadora; progresso: Progresso | null
  conferindo: boolean; erroConferencia: string | null
}

function MapearColunas({ arquivo, mapeamento, onChange, faltam, lidas, resultado, lembrar, onLembrar, operadora, progresso, conferindo, erroConferencia }: MapearProps) {
  const opcoes = arquivo.tabela.cabecalho.map((c) => ({ value: c, label: c }))
  const previa = lidas.slice(0, 5)
  return (
    <div className="ab-form">
      <p className="ab-muted">{arquivo.file.name} · {plural(arquivo.tabela.linhas.length, 'linha', 'linhas')} · {plural(arquivo.tabela.cabecalho.length, 'coluna', 'colunas')}</p>
      <fieldset className="ab-mapa" disabled={Boolean(progresso)}>
        <legend>Colunas do arquivo</legend>
        {CAMPOS.map((campo) => (
          <Field key={campo} label={CAMPO_ROTULO[campo]} required={OBRIGATORIOS.includes(campo)} error={faltam.includes(campo) ? 'Escolha a coluna' : undefined}>
            <Select aria-label={CAMPO_ROTULO[campo]} options={opcoes} value={mapeamento[campo] && arquivo.tabela.cabecalho.includes(mapeamento[campo]!) ? mapeamento[campo]! : null}
              onChange={(v) => onChange({ ...mapeamento, [campo]: v ?? undefined })} placeholder="Não vem no arquivo" searchable={opcoes.length > 8} />
          </Field>
        ))}
      </fieldset>
      <Checkbox label={`Lembrar este mapeamento para ${ORIGEM_ROTULO[operadora]}`} checked={lembrar} onChange={(e) => onLembrar(e.currentTarget.checked)} disabled={Boolean(progresso)} />
      {previa.length ? (
        <section aria-label="Prévia das primeiras linhas" className="ab-previa">
          <table>
            <thead><tr><th>Data</th><th>Placa</th><th>Motorista</th><th>Litros</th><th>Valor</th><th>Odômetro</th></tr></thead>
            <tbody>
              {previa.map((l) => (
                <tr key={l.linha}><td>{fmtData(l.data)}</td><td>{l.placa || '—'}</td><td>{l.motorista || '—'}</td><td>{fmtLitros(l.litros)}</td><td>{fmtMoeda(l.valor)}</td><td>{l.odometro ?? '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      {conferindo ? <p className="ab-muted" role="status">Conferindo no Dataverse o que o arquivo já tem gravado…</p> : null}
      {erroConferencia ? <Alert tone="danger" title="Não foi possível conferir os já importados">{erroConferencia} Por segurança a importação fica bloqueada; troque o arquivo e tente de novo.</Alert> : null}
      {resultado ? (
        <Alert tone={resultado.novos.length ? 'info' : 'warning'} title={resultado.novos.length ? `${plural(resultado.novos.length, 'abastecimento novo', 'abastecimentos novos')} para importar` : 'Nada novo para importar'}>
          <ul className="ab-lista-resumo">
            <li>{plural(resultado.duplicados, 'linha já importada', 'linhas já importadas')} (ignoradas)</li>
            <li>{plural(resultado.pendentes, 'linha com placa sem cadastro', 'linhas com placa sem cadastro')} (entram na fila de pendências)</li>
            <li>{plural(resultado.invalidas.length, 'linha inválida', 'linhas inválidas')}{resultado.invalidas.length ? `: ${resultado.invalidas.slice(0, 5).map((i) => `linha ${i.linha} ${i.motivo}`).join('; ')}${resultado.invalidas.length > 5 ? '…' : ''}` : ''}</li>
          </ul>
        </Alert>
      ) : null}
      {progresso ? <p className="ab-muted" role="status" aria-live="polite">Gravando {progresso.feitos} de {progresso.total}…</p> : null}
    </div>
  )
}

function ResumoImportacao({ c, arquivo }: { c: Concluido; arquivo: string }) {
  return (
    <div className="ab-form">
      {c.erro ? <Alert tone="danger" title="A importação parou no meio">{c.erro} {c.criados ? `Os ${c.criados} primeiros entraram; importe o arquivo de novo para gravar o restante (os já gravados são ignorados).` : ''}</Alert> : null}
      <Alert tone={c.criados ? 'success' : 'info'} title={c.criados ? `${plural(c.criados, 'abastecimento importado', 'abastecimentos importados')}` : 'Nenhum abastecimento novo'}>
        <ul className="ab-lista-resumo">
          <li>Arquivo: {arquivo}</li>
          <li>{plural(c.duplicados, 'linha já importada', 'linhas já importadas')} (ignoradas)</li>
          <li>{plural(c.pendentes, 'linha sem veículo cadastrado', 'linhas sem veículo cadastrado')}</li>
          <li>{plural(c.invalidas.length, 'linha inválida', 'linhas inválidas')}</li>
        </ul>
      </Alert>
    </div>
  )
}
