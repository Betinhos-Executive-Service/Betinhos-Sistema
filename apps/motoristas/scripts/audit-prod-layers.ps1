param(
  [string] $EnvironmentUrl = "https://orgf261ae8e.crm2.dynamics.com/",
  [string] $SolutionUniqueName = "AppBetinhos",
  [string] $OutFile = "",
  [switch] $DeviceCode
)

# Somente leitura. Lista componentes da solucao gerenciada cuja camada efetiva (topo) nao e a propria solucao:
# camada "Active" (publicacao direta no ambiente) ou outra solucao gerenciada importada por cima.
# Esses componentes nao recebem as mudancas dos proximos imports.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Import-Module MSAL.PS -ErrorAction Stop
$client = New-MsalClientApplication -ClientId "51f81489-12ee-4a9e-aaae-a2591f45987d" -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
Enable-MsalTokenCacheOnDisk -PublicClientApplication $client
$baseUrl = $EnvironmentUrl.TrimEnd("/")
$scope = "$baseUrl/user_impersonation"
$token = if ($DeviceCode) { (Get-MsalToken -PublicClientApplication $client -Scopes $scope -DeviceCode).AccessToken } else { try { (Get-MsalToken -PublicClientApplication $client -Scopes $scope -Silent).AccessToken } catch { (Get-MsalToken -PublicClientApplication $client -Scopes $scope).AccessToken } }
$api = "$baseUrl/api/data/v9.2"
$headers = @{ Authorization = "Bearer $token"; Accept = "application/json" }
function Read-Dv([string] $Path) { return Invoke-RestMethod -Method Get -Uri "$api/$Path" -Headers $headers }

$solutions = @((Read-Dv "solutions?`$select=solutionid,version&`$filter=uniquename eq '$SolutionUniqueName'").value)
if ($solutions.Count -ne 1) { throw "Solucao $SolutionUniqueName ausente ou duplicada em $baseUrl." }
$solutionId = $solutions[0].solutionid

# Tipos com camadas consultaveis que costumam receber publicacao direta.
$types = [ordered]@{ 61 = "WebResource"; 29 = "Workflow"; 91 = "PluginAssembly"; 92 = "SdkMessageProcessingStep"; 60 = "SystemForm"; 80 = "AppModule"; 62 = "SiteMap" }
$total = 0
$findings = @()
# GetEnumerator: num [ordered], $types[61] indexa pela posicao, nao pela chave.
foreach ($entry in $types.GetEnumerator()) {
  $type = $entry.Key; $typeName = $entry.Value
  $components = @((Read-Dv "solutioncomponents?`$select=objectid&`$filter=_solutionid_value eq $solutionId and componenttype eq $type").value)
  foreach ($component in $components) {
    $total++
    $layers = @((Read-Dv "msdyn_componentlayers?`$filter=(msdyn_componentid eq '$($component.objectid)' and msdyn_solutioncomponentname eq '$typeName')&`$select=msdyn_name,msdyn_order,msdyn_solutionname").value | Sort-Object msdyn_order)
    if ($layers.Count -eq 0 -or $layers[-1].msdyn_solutionname -eq $SolutionUniqueName) { continue }
    $findings += [pscustomobject]@{
      Tipo = $typeName
      Nome = $layers[-1].msdyn_name
      Id = $component.objectid
      Camadas = ($layers | ForEach-Object { $_.msdyn_solutionname }) -join " > "
    }
  }
}

Write-Output "[audit-prod-layers] $SolutionUniqueName $($solutions[0].version) em ${baseUrl}: $total componentes auditados; $($findings.Count) com camada acima da solucao."
$findings | Group-Object Tipo, Camadas | Sort-Object Count -Descending | ForEach-Object { Write-Output ("  {0,3} {1}" -f $_.Count, $_.Name) }
if ($OutFile) {
  $findings | Sort-Object Tipo, Nome | ConvertTo-Csv -NoTypeInformation -Delimiter ";" | Out-File -Encoding utf8 $OutFile
  Write-Output "[audit-prod-layers] detalhe: $OutFile"
}
return $findings
