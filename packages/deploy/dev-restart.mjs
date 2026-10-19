// Sobe o Vite na porta reservada. Se a porta já estiver ocupada por um dev server
// deste projeto, encerra o processo e sobe de novo. Se for outro serviço, falha.
import { execSync, spawn } from 'node:child_process'
import { resolve } from 'node:path'

const port = Number(process.argv[2])
const appDir = resolve(process.argv[3] ?? '.')
const projectRoot = resolve(appDir, '../..').toLowerCase()
if (!port) throw new Error('Uso: node dev-restart.mjs <porta> [diretorio-do-app]')

function pidsOnPort() {
  // netstat -ano, PowerShell e taskkill só existem no Windows. Fora dele (VM cloud, WSL) não há o que encerrar:
  // o --strictPort do Vite já falha com mensagem clara se a porta estiver ocupada.
  if (process.platform !== 'win32') return []
  let out = ''
  try { out = execSync('netstat -ano', { encoding: 'utf8' }) } catch { return [] }
  const pids = new Set()
  for (const line of out.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/)
    if (cols[0] === 'TCP' && cols[3] === 'LISTENING' && cols[1].endsWith(`:${port}`)) pids.add(Number(cols[4]))
  }
  return [...pids].filter((pid) => pid > 0)
}

function commandLine(pid) {
  try {
    return execSync(
      `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`,
      { encoding: 'utf8' },
    ).trim()
  } catch { return '' }
}

for (const pid of pidsOnPort()) {
  const cmd = commandLine(pid)
  const ours = cmd.toLowerCase().includes(projectRoot.replace(/\//g, '\\')) || /vite/i.test(cmd)
  if (!ours) {
    console.error(`Porta ${port} ocupada por outro serviço (PID ${pid}): ${cmd || 'comando desconhecido'}`)
    process.exit(1)
  }
  console.log(`Porta ${port} em uso pelo dev server (PID ${pid}). Encerrando...`)
  execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
}

for (let i = 0; i < 20 && pidsOnPort().length; i++) await new Promise((r) => setTimeout(r, 250))

const child = spawn(process.execPath, [resolve(appDir, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], { cwd: appDir, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
