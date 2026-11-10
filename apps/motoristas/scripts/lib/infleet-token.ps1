# Leitura do token Infleet para steps com configuracao segura. ASCII, sem acentos.
# Find-InfleetEnv sobe a partir desta pasta (scripts/lib) ate achar "Skill Agendamento\infleet-mcp\.env" (checkout ou worktree).

function Find-InfleetEnv {
  $dir = $PSScriptRoot
  while ($dir) {
    $candidate = Join-Path $dir "Skill Agendamento\infleet-mcp\.env"
    if (Test-Path $candidate) { return $candidate }
    $dir = Split-Path $dir -Parent
  }
  return ""
}

function Read-InfleetToken([string] $File) {
  if (-not $File) { $File = Find-InfleetEnv }
  if (-not (Test-Path $File)) { throw "Arquivo do token Infleet nao encontrado: $File" }
  $line = @(Get-Content $File | Where-Object { $_ -match '^\s*INFLEET_TOKEN\s*=' }) | Select-Object -First 1
  $value = if ($line) { ($line -replace '^\s*INFLEET_TOKEN\s*=\s*', '').Trim().Trim('"') } else { (Get-Content $File -Raw).Trim() }
  if (-not $value) { throw "INFLEET_TOKEN vazio em $File." }
  return $value
}
