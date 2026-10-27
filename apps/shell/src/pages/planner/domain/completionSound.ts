// Porte de Tela Planner/src/completionSound.js (som curto ao concluir tarefa).
// No Tela Planner o áudio era servido em /sounds/task-completed.m4a; no shell ele entra pelo Vite
// (35 kB, abaixo do assetsInlineLimit): vira data URL dentro do chunk do Planner e funciona no WebResource.
import AUDIO_SOURCE from '../assets/task-completed.m4a?url'

type AudioContextConstructor = new () => AudioContext

let audioContext: AudioContext | undefined
let audioBufferPromise: Promise<AudioBuffer | undefined> | undefined

function getAudioContextConstructor(): AudioContextConstructor | undefined {
  const scope = globalThis as unknown as { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor }
  return scope.AudioContext || scope.webkitAudioContext
}

function loadCompletionAudio(): Promise<AudioBuffer | undefined> {
  if (audioBufferPromise) return audioBufferPromise

  audioBufferPromise = fetch(AUDIO_SOURCE)
    .then((response) => {
      if (!response.ok) throw new Error('Áudio de conclusão indisponível')
      return response.arrayBuffer()
    })
    .then((audioData) => (audioContext as AudioContext).decodeAudioData(audioData))
    .catch(() => {
      audioBufferPromise = undefined
      return undefined
    })

  return audioBufferPromise
}

export function prepareCompletionSound(): void {
  const AudioContextConstructor = getAudioContextConstructor()
  if (!AudioContextConstructor) return

  try {
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioContextConstructor()
      audioBufferPromise = undefined
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => undefined)
    }
    void loadCompletionAudio()
  } catch {
    audioContext = undefined
    audioBufferPromise = undefined
  }
}

export function playCompletionSound(): void {
  if (!audioContext || audioContext.state === 'closed') return

  void loadCompletionAudio().then((audioBuffer) => {
    if (!audioBuffer || !audioContext || audioContext.state === 'closed') return

    try {
      const source = audioContext.createBufferSource()
      const gain = audioContext.createGain()
      gain.gain.value = 1.5
      source.buffer = audioBuffer
      source.connect(gain)
      gain.connect(audioContext.destination)
      source.start()
    } catch {
      audioContext = undefined
      audioBufferPromise = undefined
    }
  })
}
