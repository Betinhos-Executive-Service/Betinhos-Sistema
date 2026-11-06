# Trava entre repositorios: uma linha de cr40f_travapublicacao por ambiente (dev, test, prod) com dono e validade.
# O grupo de concurrency do GitHub so vale dentro de um repositorio; o Sistema e o app-motoristas-v2 publicam nos mesmos
# ambientes. A chave alternativa em cr40f_name impede duas linhas; o If-Match impede dois donos ao tomar trava vencida.
# Trava de run que morreu vence sozinha. So funcoes (dot-source): recebe $Dv com Api e Headers.
# Copiada em scripts/trava.ps1 do app-motoristas-v2: mudou aqui, mude la.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$script:TravaSet = "cr40f_travapublicacaos"

function Get-LinhaTrava($Dv, [string] $Chave) {
  $uri = "$($Dv.Api)/$($script:TravaSet)?`$select=cr40f_travapublicacaoid,cr40f_name,cr40f_dono,cr40f_expiraem&`$filter=cr40f_name eq '$Chave'"
  $linhas = @((Invoke-RestMethod -Method Get -Uri $uri -Headers $Dv.Headers).value)
  if ($linhas.Count -eq 0) { return $null }
  return $linhas[0]
}

function Test-TravaLivre($Linha, [string] $Dono, [DateTimeOffset] $Agora) {
  if ($null -eq $Linha -or $Linha.cr40f_dono -eq $Dono -or -not $Linha.cr40f_expiraem) { return $true }
  return [DateTimeOffset]::Parse([string] $Linha.cr40f_expiraem, [Globalization.CultureInfo]::InvariantCulture) -le $Agora
}

function Set-LinhaTrava($Dv, $Linha, [hashtable] $Campos) {
  $corpo = ConvertTo-Json -InputObject $Campos -Compress
  if ($null -eq $Linha) {
    Invoke-RestMethod -Method Post -Uri "$($Dv.Api)/$($script:TravaSet)" -Headers $Dv.Headers -Body $corpo -ContentType "application/json; charset=utf-8" | Out-Null
    return
  }
  $headers = $Dv.Headers.Clone(); $headers["If-Match"] = $Linha.'@odata.etag'
  Invoke-RestMethod -Method Patch -Uri "$($Dv.Api)/$($script:TravaSet)($($Linha.cr40f_travapublicacaoid))" -Headers $headers -Body $corpo -ContentType "application/json; charset=utf-8" | Out-Null
}

# Devolve $true se a trava ficou com $Dono. Perder a corrida (POST duplicado ou etag velha) devolve $false; outro erro sobe.
function Enter-TravaUmaVez($Dv, [string] $Chave, [string] $Dono, [int] $Minutos) {
  $agora = [DateTimeOffset]::UtcNow
  $linha = Get-LinhaTrava $Dv $Chave
  if (-not (Test-TravaLivre $linha $Dono $agora)) { return $false }
  $campos = @{ cr40f_dono = $Dono; cr40f_expiraem = $agora.AddMinutes($Minutos).ToString("yyyy-MM-ddTHH:mm:ssZ") }
  if ($null -eq $linha) { $campos.cr40f_name = $Chave }
  try { Set-LinhaTrava $Dv $linha $campos }
  catch {
    $depois = Get-LinhaTrava $Dv $Chave
    if ($null -ne $depois -and $depois.cr40f_dono -ne $Dono) { return $false }
    throw
  }
  return $true
}

function Enter-Trava($Dv, [string] $Chave, [string] $Dono, [int] $Minutos, [int] $EsperaSegundos, [int] $IntervaloSegundos = 15) {
  $limite = (Get-Date).AddSeconds($EsperaSegundos)
  while (-not (Enter-TravaUmaVez $Dv $Chave $Dono $Minutos)) {
    if ((Get-Date) -ge $limite) {
      $linha = Get-LinhaTrava $Dv $Chave
      throw "Trava $Chave ocupada por $($linha.cr40f_dono) ate $($linha.cr40f_expiraem)."
    }
    Write-Host "[trava] $Chave ocupada; esperando"
    Start-Sleep -Seconds $IntervaloSegundos
  }
}

# Solta so a propria trava: se ela venceu e outro run a tomou, nao mexe.
function Exit-Trava($Dv, [string] $Chave, [string] $Dono) {
  $linha = Get-LinhaTrava $Dv $Chave
  if ($null -eq $linha -or $linha.cr40f_dono -ne $Dono) { return $false }
  Set-LinhaTrava $Dv $linha @{ cr40f_expiraem = [DateTimeOffset]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ") }
  return $true
}
