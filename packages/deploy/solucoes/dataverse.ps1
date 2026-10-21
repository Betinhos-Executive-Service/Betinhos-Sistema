# Conexao com a Web API do Dataverse para os scripts de solucoes (dot-source).
# Token: client credentials se DV_CLIENT_SECRET estiver no ambiente (CI); senao MSAL.PS com cache em disco.
# Mensagens sem acento: o Windows PowerShell 5.1 le .ps1 sem BOM como ANSI.

$script:ClientIdPadrao = "51f81489-12ee-4a9e-aaae-a2591f45987d"

function Write-Step([string] $Message) { Write-Host "[solucoes] $Message" }

function Connect-Dataverse([string] $EnvironmentUrl, [string[]] $HostsPermitidos) {
  $base = $EnvironmentUrl.TrimEnd("/")
  $hostName = ([Uri] $base).Host.ToLowerInvariant()
  if ($HostsPermitidos -and ($HostsPermitidos -notcontains $hostName)) { throw "Host $hostName nao permitido aqui (permitidos: $($HostsPermitidos -join ', '))." }
  $secret = [Environment]::GetEnvironmentVariable("DV_CLIENT_SECRET")
  if ($secret) {
    $body = @{ grant_type = "client_credentials"; client_id = $env:DV_CLIENT_ID; client_secret = $secret; scope = "$base/.default" }
    $token = (Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$($env:DV_TENANT_ID)/oauth2/v2.0/token" -Body $body).access_token
  }
  else {
    Import-Module MSAL.PS -ErrorAction Stop
    $client = New-MsalClientApplication -ClientId $script:ClientIdPadrao -TenantId "organizations" -RedirectUri ([Uri] "http://localhost")
    Enable-MsalTokenCacheOnDisk -PublicClientApplication $client
    $scope = "$base/user_impersonation"
    $token = try { (Get-MsalToken -PublicClientApplication $client -Scopes $scope -Silent).AccessToken } catch { (Get-MsalToken -PublicClientApplication $client -Scopes $scope).AccessToken }
  }
  if (-not $token) { throw "Falha ao obter token para $hostName." }
  return @{
    Api = "$base/api/data/v9.2"; Url = $base; Host = $hostName
    Headers = @{ Authorization = "Bearer $token"; Accept = "application/json"; "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"; Prefer = "odata.maxpagesize=5000" }
  }
}

function Read-DvAll($Dv, [string] $Path) {
  $items = @()
  $uri = "$($Dv.Api)/$Path"
  while ($uri) {
    $page = Invoke-RestMethod -Method Get -Uri $uri -Headers $Dv.Headers
    $items += @($page.value)
    $next = $page.PSObject.Properties['@odata.nextLink']
    $uri = if ($next) { $next.Value } else { $null }
  }
  return $items
}

function Invoke-DvAction($Dv, [string] $Name, $Body) {
  return Invoke-RestMethod -Method Post -Uri "$($Dv.Api)/$Name" -Headers $Dv.Headers -Body (ConvertTo-Json -InputObject $Body -Depth 12) -ContentType "application/json; charset=utf-8"
}

function Write-JsonFile([string] $Path, $Value) {
  [IO.File]::WriteAllText($Path, (ConvertTo-Json -InputObject $Value -Depth 12), (New-Object Text.UTF8Encoding $false))
}

function Read-JsonFile([string] $Path) { return ([IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8) | ConvertFrom-Json) }
