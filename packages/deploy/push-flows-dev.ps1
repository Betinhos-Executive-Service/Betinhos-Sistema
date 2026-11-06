param(
  # Nomes das entradas de flows-dev.mjs, separados por virgula (hodometro,avaliacao). Vazio: nada a fazer.
  [string] $Flows = '',
  [string] $EnvironmentUrl = $env:DV_ENVIRONMENT_URL
)

# Publica no DEV os flows pedidos, pelo workflow Deploy (develop -> DEV). Cada entrada roda o seu
# provision-flow-*.ps1 num processo filho (az ja logado como conta de servico), com os argumentos obrigatorios vindos
# das variaveis FLOW_* do environment dev. So atualiza flow que JA existe no DEV: flow novo nasce com dono na conta de
# servico e nao liga (ConnectionAuthorizationFailed), entao a primeira publicacao e a mao. Antes de rodar o script
# confere pela Web API que todos os flows da entrada existem; se faltar, falha com a causa e nao roda o script. Depois
# confere que cada flow continua no estado (ligado/desligado) em que estava.
# Falha numa entrada nao impede as demais: no fim imprime o resumo, grava as causas no GITHUB_STEP_SUMMARY e sai com 1.
# Nunca imprime token nem URL de gatilho (a saida dos scripts e filtrada por sig=/Bearer).
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [Text.Encoding]::UTF8

if (-not $EnvironmentUrl) { throw 'DV_ENVIRONMENT_URL ausente.' }
$hostDev = ([Uri]$EnvironmentUrl).Host
if ($hostDev -ne 'org23b93544.crm2.dynamics.com') { throw "Somente DEV: $hostDev" }
$bloqueados = @(([string]$env:DV_BLOCKED_HOSTS).Split(@(',', ';', ' '), [StringSplitOptions]::RemoveEmptyEntries))
if ($bloqueados -contains $hostDev) { throw "Host bloqueado em DV_BLOCKED_HOSTS: $hostDev" }

$nomes = @($Flows.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if (-not $nomes.Count) { Write-Host '[flows] nada a publicar'; exit 0 }

$mjs = Join-Path $PSScriptRoot 'flows-dev.mjs'
$entradas = @((& node $mjs --descrever ($nomes -join ',') | ConvertFrom-Json))
if ($LASTEXITCODE -ne 0 -or $entradas.Count -ne $nomes.Count) { throw 'flows-dev.mjs nao descreveu as entradas pedidas.' }

$token = & az account get-access-token --resource "$($EnvironmentUrl.TrimEnd('/'))/" --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Token do Dataverse DEV indisponivel (az login da conta de servico).' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-Version' = '4.0'; 'OData-MaxVersion' = '4.0' }

function Limpar([string] $texto) { ($texto -replace 'sig=[^&\s"'']+', 'sig=***' -replace 'Bearer\s+[A-Za-z0-9._~+/=-]+', 'Bearer ***') }

# Devolve nome -> statecode dos flows da entrada. Lanca a causa se faltar flow ou houver duplicado.
function EstadoDosFlows($entrada) {
  $estado = @{}
  foreach ($nome in $entrada.flows) {
    $filtro = [Uri]::EscapeDataString("name eq '$($nome.Replace("'", "''"))' and category eq 5")
    $uri = "$($EnvironmentUrl.TrimEnd('/'))/api/data/v9.2/workflows?`$select=statecode&`$filter=$filtro"
    $achados = @((Invoke-RestMethod -Uri $uri -Headers $headers).value)
    if ($achados.Count -eq 0) { throw "flow novo: '$nome' nao existe no DEV; a primeira publicacao e a mao (provision-flow-$($entrada.nome).ps1 do checkout principal)" }
    if ($achados.Count -gt 1) { throw "flow duplicado no DEV: '$nome'" }
    $estado[$nome] = $achados[0].statecode
  }
  $estado
}

$resultados = @()
foreach ($e in $entradas) {
  Write-Host "::group::flow $($e.nome)"
  $inicio = Get-Date
  $causa = $null
  try {
    $argumentos = @()
    foreach ($a in $e.args) {
      $valor = [Environment]::GetEnvironmentVariable($a.variavel)
      if (-not $valor) { $causa = "variavel $($a.variavel) ausente no environment dev (argumento -$($a.flag))"; break }
      $argumentos += @("-$($a.flag)", $valor)
    }
    if (-not $causa) {
      $antes = EstadoDosFlows $e
      if ($e.apply) { $argumentos += '-Apply' }
      $caminho = Join-Path $PSScriptRoot $e.script
      # No 5.1, stderr do processo filho vira erro terminante com Stop: relaxa so nesta chamada para ler saida e codigo.
      $ErrorActionPreference = 'Continue'
      try {
        $saida = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $caminho @argumentos 2>&1 | ForEach-Object { Limpar "$_" })
        $codigo = $LASTEXITCODE
      } finally { $ErrorActionPreference = 'Stop' }
      $saida | ForEach-Object { Write-Host $_ }
      if ($codigo -ne 0) {
        # O 5.1 fecha o erro com "At ..." e linhas "+ ..." (CategoryInfo, FullyQualifiedErrorId): a causa vem antes delas.
        $ultima = @($saida | Where-Object { $_.Trim() -and $_ -notmatch '^\s*\+ |^At .+ char:\d+' } | Select-Object -Last 1)
        $causa = "$($e.script) saiu com codigo $codigo" + $(if ($ultima.Count) { ": $($ultima[0])" } else { '' })
      } else {
        $depois = EstadoDosFlows $e
        $mudaram = @($e.flows | Where-Object { $antes[$_] -ne $depois[$_] })
        if ($mudaram.Count) { $causa = "estado ligado/desligado mudou no DEV: $($mudaram -join ', ')" }
      }
    }
  } catch { $causa = Limpar $_.Exception.Message }
  if ($causa) { Write-Host "ERRO: $causa" }
  Write-Host '::endgroup::'
  $resultados += [pscustomobject]@{ nome = $e.nome; ok = (-not $causa); causa = $causa; segundos = [int]((Get-Date) - $inicio).TotalSeconds }
}

Write-Host '[flows] resumo'
foreach ($r in $resultados) { Write-Host ("  {0,-30} {1} ({2}s){3}" -f $r.nome, $(if ($r.ok) { 'ok' } else { 'FALHOU' }), $r.segundos, $(if ($r.causa) { " - $($r.causa)" } else { '' })) }

if ($env:GITHUB_STEP_SUMMARY) {
  $linhas = @('', '### Flows no DEV')
  foreach ($r in $resultados) { $linhas += $(if ($r.ok) { "- ok: ``$($r.nome)``" } else { "- **FALHOU** ``$($r.nome)``: $($r.causa)" }) }
  [IO.File]::AppendAllText($env:GITHUB_STEP_SUMMARY, (($linhas -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))
}

$falhas = @($resultados | Where-Object { -not $_.ok })
if ($falhas.Count) {
  Write-Host "::error title=Flows no DEV::$($falhas.Count) de $($resultados.Count) falharam: $(($falhas | ForEach-Object { $_.nome }) -join ', '). A tag flows-dev-publicado nao anda."
  exit 1
}
exit 0
