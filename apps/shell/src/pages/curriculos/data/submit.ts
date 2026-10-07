import type { Row } from '@betinhos/dataverse'
import { payloadSignature } from '../domain/form'
import { clearPending, nextStep, readPending, writePending, type KV } from '../domain/submission'
import { linkPatch } from './mutations'

export type SubmitDeps = {
  create: (payload: Row) => Promise<string>
  update: (id: string, payload: Row) => Promise<void>
  upload: (recordId: string, file: File, payload: Row) => Promise<string>
  kv: KV
  uploadEnabled: boolean
}

export type SubmitResult = { recordId: string; link: string | null; message: string; uploadFailed: boolean }

/**
 * Cadastro novo sem duplicar: cria uma vez, envia o arquivo e grava o link.
 * Upload que falha depois de criar não lança; deixa a pendência para o próximo "Salvar" com o mesmo payload.
 */
export async function submitNew(deps: SubmitDeps, payload: Row, file: File | null): Promise<SubmitResult> {
  const signature = payloadSignature(payload)
  const pending = readPending(deps.kv)
  const step = nextStep(pending, signature, file != null)

  if (step === 'need-file' && pending) {
    throw new Error(`Este cadastro já foi criado e aguarda o arquivo "${pending.fileName}". Anexe o arquivo para concluir sem duplicar o registro.`)
  }
  if (step === 'link' && pending?.webUrl) {
    await deps.update(pending.recordId, linkPatch(pending.webUrl))
    clearPending(deps.kv)
    return { recordId: pending.recordId, link: pending.webUrl, message: 'Cadastro retomado e link gravado sem duplicar o registro.', uploadFailed: false }
  }

  const resumed = step === 'upload' && pending != null
  const recordId = resumed ? pending.recordId : await deps.create(payload)
  const toUpload = file && deps.uploadEnabled ? file : null
  if (!toUpload) {
    clearPending(deps.kv)
    return { recordId, link: null, message: file ? 'Currículo registrado. Envio de arquivo indisponível neste ambiente.' : 'Currículo registrado.', uploadFailed: false }
  }
  if (!resumed) writePending(deps.kv, { recordId, signature, phase: 'record-created', fileName: toUpload.name })

  let webUrl: string
  try {
    webUrl = await deps.upload(recordId, toUpload, payload)
  } catch {
    return { recordId, link: null, message: 'Currículo registrado, mas o envio do arquivo falhou. Salve de novo com o mesmo arquivo para concluir sem duplicar.', uploadFailed: true }
  }
  if (webUrl) {
    writePending(deps.kv, { recordId, signature, phase: 'upload-completed', fileName: toUpload.name, webUrl })
    await deps.update(recordId, linkPatch(webUrl))
  }
  clearPending(deps.kv)
  const message = resumed ? 'Cadastro concluído sem duplicar o registro.'
    : webUrl ? 'Currículo registrado e arquivo anexado.' : 'Currículo registrado; o envio do arquivo não devolveu o link.'
  return { recordId, link: webUrl || null, message, uploadFailed: false }
}

/** Registro existente: PATCH só do que mudou e, com arquivo, upload e link. */
export async function saveExisting(deps: SubmitDeps, id: string, changes: Row, file: File | null, fullPayload: Row): Promise<Omit<SubmitResult, 'recordId'>> {
  if (Object.keys(changes).length) await deps.update(id, changes)
  if (!file) return { link: null, message: 'Alterações salvas.', uploadFailed: false }
  if (!deps.uploadEnabled) return { link: null, message: 'Alterações salvas. Envio de arquivo indisponível neste ambiente.', uploadFailed: false }
  let webUrl: string
  try {
    webUrl = await deps.upload(id, file, fullPayload)
  } catch {
    return { link: null, message: 'Alterações salvas, mas o envio do arquivo falhou. Anexe de novo e salve para tentar outra vez.', uploadFailed: true }
  }
  if (webUrl) await deps.update(id, linkPatch(webUrl))
  return { link: webUrl || null, message: webUrl ? 'Alterações salvas e arquivo anexado.' : 'Alterações salvas; o envio do arquivo não devolveu o link.', uploadFailed: false }
}
