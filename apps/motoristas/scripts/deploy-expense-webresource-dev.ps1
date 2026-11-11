$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$OutputEncoding=[Console]::OutputEncoding
$root=Split-Path $PSScriptRoot -Parent
Set-Location $root
$taskPython=Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$token=az account get-access-token --resource https://org23b93544.crm2.dynamics.com/ --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Login Azure CLI DEV indisponivel.' }
function Request([string]$method,[string]$path,$body=$null) {
  for($attempt=1;$attempt -le 3;$attempt++) {
    try {
      $env:APP_EXPENSE_DEV_TOKEN=$token
      $serialized=if($null -ne $body){$body|ConvertTo-Json -Depth 50 -Compress}else{''}
      $response=$serialized|& $taskPython (Join-Path $PSScriptRoot 'expense-upload-dv.py') $method $path
      if($LASTEXITCODE -ne 0){throw "DEV: operacao $method sem confirmacao."}
      return $response|ConvertFrom-Json
    } catch { if($method -ne 'GET' -or $attempt -eq 3){throw};Start-Sleep -Seconds 2 }
    finally {Remove-Item Env:APP_EXPENSE_DEV_TOKEN -ErrorAction SilentlyContinue}
  }
}
if((Request GET WhoAmI).OrganizationId -ne '7e5f59f4-efce-f011-89f6-000d3ac0a3e1'){throw 'Organizacao DEV divergente.'}
$solution=@((Request GET "solutions?`$select=solutionid&`$filter=uniquename eq 'AppBetinhos'").value)
$rows=@((Request GET "webresourceset?`$select=webresourceid,content&`$filter=name eq 'new_app-motoristas-v2'").value)
if($solution.Count -ne 1 -or $rows.Count -ne 1){throw 'Alvo DEV ausente ou ambiguo.'}
$id=$rows[0].webresourceid
$componentPath="solutioncomponents?`$select=solutioncomponentid&`$filter=_solutionid_value eq $($solution[0].solutionid) and componenttype eq 61 and objectid eq $id"
if(-not @((Request GET $componentPath).value).Count){
  Request POST AddSolutionComponent @{ComponentId=$id;ComponentType=61;SolutionUniqueName='AppBetinhos';AddRequiredComponents=$false}|Out-Null
  if(-not @((Request GET $componentPath).value).Count){throw 'WebResource fora de AppBetinhos.'}
}
$file=Join-Path $root 'dist/webresource-app-motoristas.html'
$bytes=[IO.File]::ReadAllBytes($file)
$content=[Convert]::ToBase64String($bytes)
if($rows[0].content -ne $content){
  $backupDir=Join-Path $root '.dev-backups'
  [IO.Directory]::CreateDirectory($backupDir)|Out-Null
  $backup=Join-Path $backupDir 'expense-upload-before.html'
  if(-not (Test-Path $backup)){[IO.File]::WriteAllBytes($backup,[Convert]::FromBase64String($rows[0].content))}
  try { Request PATCH "webresourceset($id)" @{content=$content}|Out-Null }
  catch { if((Request GET "webresourceset($id)?`$select=content").content -ne $content){throw} }
}
Request POST PublishXml @{ParameterXml="<importexportxml><webresources><webresource>$id</webresource></webresources></importexportxml>"}|Out-Null
if((Request GET "webresourceset($id)?`$select=content").content -ne $content){throw 'Conteudo remoto diverge.'}
$hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes))
Write-Output "DEV WebResource publicado, pertencimento AppBetinhos confirmado, SHA256=$hash"
