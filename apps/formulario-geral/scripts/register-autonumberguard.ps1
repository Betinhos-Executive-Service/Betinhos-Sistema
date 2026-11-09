# Registra (ou atualiza) o plugin Betinhos.AutoNumberGuard e o step Create/PreValidation
# em cada tabela protegida (ver $steps), dentro da solução informada. Idempotente.
# Uso: .\scripts\register-autonumberguard.ps1 -OrgUrl https://org23b93544.crm2.dynamics.com
param(
    [Parameter(Mandatory = $true)][string]$OrgUrl,
    [string]$Solution = 'AppBetinhos'
)

$ErrorActionPreference = 'Stop'
$OrgUrl = $OrgUrl.TrimEnd('/')
$api = "$OrgUrl/api/data/v9.2"
$dll = Join-Path $PSScriptRoot '..\power-platform\plugins\AutoNumberGuard\bin\Release\net462\Betinhos.AutoNumberGuard.dll'
if (-not (Test-Path $dll)) { throw "DLL não encontrada: $dll. Rode dotnet build -c Release antes." }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Token: MSAL.PS com cache em disco (mesmo client dos scripts do Planner); az CLI como alternativa.
$token = $null
if (Get-Module -ListAvailable MSAL.PS) {
    Import-Module MSAL.PS
    $client = New-MsalClientApplication -ClientId '51f81489-12ee-4a9e-aaae-a2591f45987d' -TenantId 'organizations' -RedirectUri ([Uri] 'http://localhost')
    Enable-MsalTokenCacheOnDisk -PublicClientApplication $client
    try { $token = (Get-MsalToken -PublicClientApplication $client -Scopes "$OrgUrl/user_impersonation" -Silent).AccessToken }
    catch { $token = (Get-MsalToken -PublicClientApplication $client -Scopes "$OrgUrl/user_impersonation" -DeviceCode).AccessToken }
}
if (-not $token) { $token = az account get-access-token --resource $OrgUrl --query accessToken -o tsv }
if (-not $token) { throw 'Sem token para o ambiente (MSAL.PS ou az CLI).' }
$headers = @{
    Authorization  = "Bearer $token"
    Accept         = 'application/json'
    'Content-Type' = 'application/json; charset=utf-8'
}
# PROD: AppBetinhos é gerenciada. Registra fora da solução, com os IDs do DEV, para o próximo import adotá-los.
$sol = (Invoke-RestMethod -Uri "$api/solutions?`$select=ismanaged&`$filter=uniquename eq '$Solution'" -Headers $headers).value
if ($sol -and -not $sol[0].ismanaged) { $headers['MSCRM.SolutionUniqueName'] = $Solution }
else { Write-Host "Solução $Solution gerenciada ou ausente: registro fora da solução com IDs do DEV." }

function Get-Dv([string]$path) {
    for ($i = 1; $i -le 4; $i++) {
        try { return (Invoke-RestMethod -Uri "$api/$path" -Headers $headers -TimeoutSec 120).value }
        catch { if ($i -eq 4) { throw }; Start-Sleep -Seconds (3 * $i) }
    }
}
function Send-Dv([string]$method, [string]$path, $body) {
    $json = $body | ConvertTo-Json -Depth 5
    $resp = Invoke-WebRequest -Method $method -Uri "$api/$path" -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($json)) -UseBasicParsing
    $entityId = $resp.Headers['OData-EntityId']
    if ($entityId) { return ([regex]::Match($entityId, '\(([0-9a-f-]{36})\)')).Groups[1].Value }
}

$assemblyName = [Reflection.AssemblyName]::GetAssemblyName($dll)
$token16 = ($assemblyName.GetPublicKeyToken() | ForEach-Object { $_.ToString('x2') }) -join ''
$content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($dll))
$name = $assemblyName.Name

# 1. Assembly
$existing = Get-Dv "pluginassemblies?`$select=pluginassemblyid&`$filter=name eq '$name'"
if ($existing) {
    $assemblyId = $existing[0].pluginassemblyid
    Send-Dv 'PATCH' "pluginassemblies($assemblyId)" @{ content = $content; version = $assemblyName.Version.ToString() } | Out-Null
    Write-Host "Assembly atualizado: $assemblyId"
} else {
    $assemblyId = Send-Dv 'POST' 'pluginassemblies' @{
        name = $name; content = $content; isolationmode = 2; sourcetype = 0
        culture = 'neutral'; version = $assemblyName.Version.ToString(); publickeytoken = $token16
    }
    Write-Host "Assembly criado: $assemblyId"
}

# 2. Tipo do plugin
$typeName = 'Betinhos.AutoNumberGuard.ReservaAutoNumberGuardPlugin'
$type = Get-Dv "plugintypes?`$select=plugintypeid&`$filter=typename eq '$typeName'"
if ($type) { $typeId = $type[0].plugintypeid } else {
    $typeId = Send-Dv 'POST' 'plugintypes' @{
        typename = $typeName; name = $typeName; friendlyname = 'Reserva - guarda da numeração automática'
        'pluginassemblyid@odata.bind' = "/pluginassemblies($assemblyId)"
    }
}
Write-Host "Plugin type: $typeId"

# 3. Steps Create / PreValidation / síncrono (um por tabela)
$messageId = (Get-Dv "sdkmessages?`$select=sdkmessageid&`$filter=name eq 'Create'")[0].sdkmessageid
$steps = @(
    # Id = ID do step no DEV (AppBetinhos); reutilizado ao criar em PROD.
    @{ Entity = 'cr40f_reservadeveculos'; Name = 'Betinhos.AutoNumberGuard - Reserva Create PreValidation'; Format = 'OS-<número>'; Id = '90243a98-d5bd-f111-a05b-7ced8da8c473' },
    @{ Entity = 'cr40f_servicosporpassageiro'; Name = 'Betinhos.AutoNumberGuard - Servico por Passageiro Create PreValidation'; Format = '<número>'; Id = '122f8b46-b3c1-f111-aaaf-7ced8da8c473' },
    @{ Entity = 'cr40f_manutencoes'; Name = 'Betinhos.AutoNumberGuard - Manutencao Create PreValidation'; Format = 'OM-<número>'; Id = '5d0c7e2a-4f1b-4c8e-9a3d-6b2e8f1c7a40' },
    @{ Entity = 'cr40f_composicaodeprecos'; Name = 'Betinhos.AutoNumberGuard - Composicao de Precos Create PreValidation'; Format = 'CP-<número>'; Id = '13066358-e2bc-4ebb-97bb-47ad20e635a0' },
    @{ Entity = 'cr40f_financeiro'; Name = 'Betinhos.AutoNumberGuard - Financeiro Create PreValidation'; Format = 'OP-<número>'; Id = '0de2f16b-199e-4931-93ce-32019bb83e3b' },
    @{ Entity = 'cr40f_pagantes'; Name = 'Betinhos.AutoNumberGuard - Pagantes Create PreValidation'; Format = 'PAG-<número>'; Id = 'fd80dcd4-0ddc-4a2f-aa2b-ffde5c923ac4' },
    @{ Entity = 'cr40f_trocasdecarro'; Name = 'Betinhos.AutoNumberGuard - Troca de Carro Create PreValidation'; Format = 'OT-<número>'; Id = 'e1893191-e6ca-4d8e-a3b5-c28bd65f17cc' },
    @{ Entity = 'new_possedeveiculo'; Name = 'Betinhos.AutoNumberGuard - Posse de Veiculo Create PreValidation'; Format = 'PV-<número>'; Id = '007928c3-048a-4717-8379-6db409be6884' },
    @{ Entity = 'new_marketing'; Name = 'Betinhos.AutoNumberGuard - Marketing Create PreValidation'; Format = 'MKT-<número>'; Id = '303c938d-d324-4ac4-86c5-35156e7de189' },
    @{ Entity = 'new_centraldenotificacoes'; Name = 'Betinhos.AutoNumberGuard - Central de Notificacoes Create PreValidation'; Format = 'NOT-<número>'; Id = 'b1d2f7f1-027a-4131-96b9-ca8a54bbe900' }
)
foreach ($s in $steps) {
    $filterId = (Get-Dv "sdkmessagefilters?`$select=sdkmessagefilterid&`$filter=_sdkmessageid_value eq $messageId and primaryobjecttypecode eq '$($s.Entity)'")[0].sdkmessagefilterid
    $step = @(Get-Dv "sdkmessageprocessingsteps?`$select=sdkmessageprocessingstepid&`$filter=name eq '$($s.Name)'")
    if ($step.Count -gt 1) { Write-Warning "Step duplicado em $($s.Entity): $(($step | ForEach-Object { $_.sdkmessageprocessingstepid }) -join ', '). Mantenha só $($s.Id)." }
    if ($step) { $stepId = $step[0].sdkmessageprocessingstepid } else {
        $stepId = Send-Dv 'POST' 'sdkmessageprocessingsteps' @{
            sdkmessageprocessingstepid = $s.Id
            name = $s.Name; description = "Remove o número enviado ($($s.Format)) para a numeração automática gerar o valor."
            stage = 10; mode = 0; rank = 1; supporteddeployment = 0
            'sdkmessageid@odata.bind'            = "/sdkmessages($messageId)"
            'sdkmessagefilterid@odata.bind'      = "/sdkmessagefilters($filterId)"
            'eventhandler_plugintype@odata.bind' = "/plugintypes($typeId)"
        }
    }
    Write-Host "Step $($s.Entity): $stepId"
}
