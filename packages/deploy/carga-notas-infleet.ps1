param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [string] $De = "",            # AAAA-MM-DD: ultimo dia da carga; vazio = anteontem (ontem vem da rodada diaria)
  [int] $MaxMeses = 36,
  [switch] $Prod                # obrigatorio para o PROD; so com pedido explicito do Renan
)
# Carga retroativa de new_notamotorista: chama new_SincronizarNotasInfleet para tras, mes a mes.
# Para cada mes: uma chamada com Meses=1, Dias=0 (linha do mes) e chamadas de ate 15 dias com Meses=0 (linhas Dia).
# Para depois de 2 meses seguidos sem linha gravada ou em MaxMeses. Idempotente (upsert pela chave).
# Rode do checkout principal na develop, depois do Deploy publicar o assembly e do registro da Custom API.
# Uso: pwsh -NoProfile -File packages/deploy/carga-notas-infleet.ps1 [-De 2026-11-17] [-EnvironmentUrl <prod> -Prod]
$ErrorActionPreference = "Stop"
$hostAlvo = ([Uri]$EnvironmentUrl).Host
if ($hostAlvo -ne "org23b93544.crm2.dynamics.com" -and -not ($Prod -and $hostAlvo -eq "orgf261ae8e.crm2.dynamics.com")) { throw "Ambiente recusado: $hostAlvo (PROD exige -Prod)." }
$api = "https://$hostAlvo/api/data/v9.2/new_SincronizarNotasInfleet"

# O token dura cerca de 1 h e a carga leva mais: renova a cada 30 min.
$script:token = $null
$script:tokenEm = [datetime]::MinValue
function Get-Token {
  if (-not $script:token -or ((Get-Date) - $script:tokenEm).TotalMinutes -gt 30) {
    $t = & az account get-access-token --resource "https://$hostAlvo/" --query accessToken -o tsv
    if ($LASTEXITCODE -ne 0 -or -not $t) { throw "Sem token do Dataverse (az login)." }
    $script:token = $t; $script:tokenEm = Get-Date
  }
  return $script:token
}

# Ate vai como data e hora ao meio-dia UTC: o dia continua o mesmo em Sao Paulo, sem deslocar por fuso.
function Chamar([int] $Meses, [int] $Dias, [datetime] $Ate) {
  $dia = $Ate.ToString("yyyy-MM-dd")
  $corpo = @{ Meses = $Meses; Dias = $Dias; Ate = "${dia}T12:00:00Z" } | ConvertTo-Json -Compress
  $res = $null
  for ($t = 1; $t -le 3 -and -not $res; $t++) {
    try {
      $r = Invoke-RestMethod -Method Post -Uri $api -Headers @{ Authorization = "Bearer $(Get-Token)"; "OData-Version" = "4.0" } -ContentType "application/json" -Body $corpo -TimeoutSec 180
      $res = $r.new_Result | ConvertFrom-Json
    } catch { if ($t -eq 3) { throw }; Start-Sleep -Seconds (10 * $t) }
  }
  if ($res.incompleto) { throw "Rodada incompleta em Ate=$dia Dias=$Dias; reduza a janela." }
  if (@($res.falhas).Count) { Write-Host "  aviso: $(@($res.falhas).Count) motorista(s) com falha neste trecho" }
  return [int]$res.gravadas
}

$fim = if ($De) { [datetime]::ParseExact($De, "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture) } else { (Get-Date).Date.AddDays(-2) }
$vazios = 0
for ($k = 0; $k -lt $MaxMeses -and $vazios -lt 2; $k++) {
  $inicioMes = (Get-Date -Year $fim.Year -Month $fim.Month -Day 1).Date.AddMonths(-$k)
  $ultimo = if ($k -eq 0) { $fim } else { $inicioMes.AddMonths(1).AddDays(-1) }
  $gravadas = Chamar 1 0 $ultimo
  $dia = $ultimo
  while ($dia -ge $inicioMes) {
    $n = [Math]::Min(15, ($dia - $inicioMes).Days + 1)
    $gravadas += Chamar 0 $n $dia
    $dia = $dia.AddDays(-$n)
  }
  Write-Host ("{0:yyyy-MM}: {1} linhas" -f $inicioMes, $gravadas)
  $vazios = if ($gravadas -eq 0) { $vazios + 1 } else { 0 }
}
