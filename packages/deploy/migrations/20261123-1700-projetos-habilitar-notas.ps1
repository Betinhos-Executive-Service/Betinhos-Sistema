param([string] $EnvironmentUrl = "https://org23b93544.crm2.dynamics.com/", [switch] $Apply)
. "$PSScriptRoot\_dv.ps1"
Connect-Dv $EnvironmentUrl $PSCommandPath ([bool] $Apply)

# Projetos: habilita notas (anexos) em cr40f_projetoatualizacao.
# A tabela foi criada com HasNotes = true no POST (migrations 20261123-0845 e 20261123-1115), mas o Dataverse gravou
# HasNotes = false: sem a relacao cr40f_projetoatualizacao_Annotations a tela #/projetos nao carrega
# ("Could not find a property named 'cr40f_projetoatualizacao_Annotations'") e prints, videos e audios nao anexam.
# Notas nao se desligam depois de ligadas; por isso a migration so liga e confere.

$tabela = "cr40f_projetoatualizacao"
$relacao = "cr40f_projetoatualizacao_Annotations"
$path = "EntityDefinitions(LogicalName='$tabela')"

function Tem-Relacao {
  $r = @((Invoke-Dv "GET" "$path/OneToManyRelationships?`$select=SchemaName,ReferencingEntity").value | Where-Object { $_.ReferencingEntity -eq "annotation" })
  return $r.Count -gt 0
}

$meta = Invoke-Dv "GET" $path
if ($meta.HasNotes -and (Tem-Relacao)) { Write-Step "$tabela ja tem notas."; return }
if (-not $Apply) { Write-Step "DRY RUN habilitaria notas em $tabela (HasNotes = $($meta.HasNotes)). Use -Apply para aplicar."; return }

$meta.HasNotes = $true
$corpo = [ordered]@{ "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata" }
foreach ($p in $meta.PSObject.Properties) { if ($p.Name -notlike "@odata.*") { $corpo[$p.Name] = $p.Value } }
Invoke-Dv "PUT" "EntityDefinitions($($meta.MetadataId))" $corpo | Out-Null
Publish-Tabela $tabela

$depois = Invoke-Dv "GET" "$path`?`$select=HasNotes"
if (-not $depois.HasNotes) { throw "HasNotes nao persistiu em $tabela." }
if (-not (Tem-Relacao)) { throw "Relacao $relacao nao apareceu em $tabela depois de habilitar notas." }
Write-Step "OK: notas habilitadas em $tabela."
