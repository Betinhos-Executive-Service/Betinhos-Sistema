param(
  [string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/",
  [switch] $Apply
)

# Composicao de Preco (cr40f_composicaodeprecos): desde a migration 20261123-1500-total-soma-ajuste, new_valortotal soma
# new_ajuste. Na formula classica, Add com operando nulo da nulo, entao toda linha com Ajuste vazio ficou com Total vazio
# (tela mostra R$ 0,00). Em 26/11/2026: 1578 linhas com Ajuste nulo no PROD (347 com Subtotal > 0), todas criadas ate
# 10/04/2026; as mais novas nascem com 0 pela regra de negocio "Ajuste" (Null -> 0, escopo Entidade).
# A formula nao tem como tratar nulo: o Dataverse recusa SelectFirstNonNull com mais de um parametro e nao deixa tirar
# atividades. A correcao e o dado: new_ajuste = 0 onde estiver nulo, o mesmo que a regra faz nas linhas novas.
# A gravacao pula plugins, regras e flows (MSCRM.BypassBusinessLogicExecution e SuppressCallbackRegistrationExpanderJob):
# o valor da OP, a validacao do portal e a Geral nao mudam, porque o Total volta ao que era antes de 23/11.
# Idempotente (so le as linhas com Ajuste nulo). Somente DEV; o PROD recebeu a mesma gravacao no hotfix de 26/11/2026.
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

$set = "cr40f_composicaodeprecoses"
$filtro = "new_ajuste eq null"

function Get-Nulos() { return @((Invoke-Dv "GET" "${set}?`$select=cr40f_composicaodeprecosid&`$top=1000&`$filter=$([uri]::EscapeDataString($filtro))").value) }

$nulos = @(Get-Nulos)
if ($nulos.Count -eq 0) { Write-Step "Nenhuma composicao com Ajuste nulo; nada a gravar." }
elseif (-not $Apply) { Write-Step "DRY RUN gravaria new_ajuste = 0 em $($nulos.Count)$(if ($nulos.Count -eq 1000) { '+' }) composicoes. Use -Apply para aplicar."; return }

$total = 0
for ($rodada = 1; $nulos.Count -gt 0; $rodada++) {
  if ($rodada -gt 100) { throw "Ainda ha composicoes com Ajuste nulo depois de 100 rodadas." }
  $limite = "batch_" + [guid]::NewGuid().ToString("N")
  $partes = foreach ($linha in $nulos) {
    "--$limite`r`nContent-Type: application/http`r`nContent-Transfer-Encoding: binary`r`n`r`n" +
    "PATCH $script:DvApi/$set($($linha.cr40f_composicaodeprecosid)) HTTP/1.1`r`nContent-Type: application/json`r`nIf-Match: *`r`n" +
    "MSCRM.BypassBusinessLogicExecution: CustomSync,CustomAsync`r`nMSCRM.SuppressCallbackRegistrationExpanderJob: true`r`n`r`n{`"new_ajuste`":0}`r`n"
  }
  $corpo = ($partes -join "") + "--$limite--`r`n"
  $headers = @{ Authorization = "Bearer $script:DvToken"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"; Prefer = "odata.continue-on-error" }
  $resposta = Invoke-WebRequest -Method POST -Uri "$script:DvApi/`$batch" -Headers $headers -ContentType "multipart/mixed; boundary=$limite" -Body ([Text.Encoding]::UTF8.GetBytes($corpo)) -UseBasicParsing
  # pwsh 7 devolve multipart/mixed como byte[]; sem decodificar, a regex de erro nunca casaria.
  $texto = if ($resposta.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($resposta.Content) } else { [string] $resposta.Content }
  $erros = ([regex]::Matches($texto, "HTTP/1.1 [45]\d\d")).Count
  if ($erros -gt 0) { throw "Lote $rodada com $erros erro(s): $(([regex]::Match($texto, '\"message\":\"[^\"]*\"')).Value)" }
  $total += $nulos.Count
  Write-Step "Lote ${rodada}: $($nulos.Count) composicoes com Ajuste 0."
  $antes = $nulos.Count
  $nulos = @(Get-Nulos)
  if ($nulos.Count -ge $antes -and $antes -lt 1000) { throw "Lote $rodada sem efeito: $($nulos.Count) composicoes continuam com Ajuste nulo." }
}

$vazios = @(Get-Rows $set "cr40f_composicaodeprecosid" "new_subtotal gt 0 and new_valortotal eq null")
# So avisa: Total vazio aqui vem de outra parcela nula, nao do Ajuste, e travar faria a migration repetir em todo Deploy.
if ($vazios.Count -gt 0) { Write-Step "ATENCAO: $($vazios.Count) composicoes com Subtotal > 0 e Total vazio por outra parcela nula (nao o Ajuste)." }
else { Write-Step "OK: $total composicoes com Ajuste 0; nenhuma com Subtotal > 0 e Total vazio." }
