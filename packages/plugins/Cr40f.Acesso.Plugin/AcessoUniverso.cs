using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata.Query;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin;

/// <summary>Um privilégio do ambiente: nome, tipo (Read, Create...; "Use" nos avulsos) e as tabelas a que se aplica (vazio = avulso).</summary>
public sealed class Privilegio
{
    public string Nome { get; set; } = "";
    public string Tipo { get; set; } = "";
    public List<string> Tabelas { get; set; } = new();
}

/// <summary>Todos os privilégios do ambiente, o nome lógico e o nome de exibição de cada tabela, em cache por 30 min.</summary>
public sealed class AcessoUniverso
{
    public static readonly TimeSpan Validade = TimeSpan.FromMinutes(30);
    private static readonly ConcurrentDictionary<Guid, (DateTime Lido, Lazy<AcessoUniverso> Universo)> Cache = new();

    public Dictionary<Guid, Privilegio> Privilegios { get; } = new();
    /// <summary>Nome lógico ou de conjunto (minúsculas) → nome lógico.</summary>
    public Dictionary<string, string> Tabelas { get; } = new(StringComparer.OrdinalIgnoreCase);
    private Dictionary<string, string> Rotulos { get; } = new(StringComparer.Ordinal);

    /// <summary>Nome de exibição da tabela pela metadata; sem ele, o nome lógico.</summary>
    public string Rotulo(string tabela) => Rotulos.TryGetValue(tabela, out var r) ? r : tabela;

    /// <summary>Uma leitura por organização por vez: quem chega durante a carga espera a mesma; falha não fica no cache.</summary>
    public static AcessoUniverso Obter(IOrganizationService s, Guid organizacao, DateTime agora)
    {
        (DateTime, Lazy<AcessoUniverso>) Nova() => (agora, new Lazy<AcessoUniverso>(() => Ler(s)));
        var item = Cache.AddOrUpdate(organizacao, _ => Nova(), (_, atual) => agora - atual.Lido < Validade ? atual : Nova());
        try { return item.Universo.Value; }
        catch
        {
            ((ICollection<KeyValuePair<Guid, (DateTime, Lazy<AcessoUniverso>)>>)Cache).Remove(new KeyValuePair<Guid, (DateTime, Lazy<AcessoUniverso>)>(organizacao, item));
            throw;
        }
    }

    private static readonly Dictionary<int, string> Tipos = new()
    {
        [1] = "Read", [2] = "Write", [4] = "Append", [16] = "AppendTo", [32] = "Create", [65536] = "Delete", [262144] = "Share", [524288] = "Assign",
    };

    private static AcessoUniverso Ler(IOrganizationService s)
    {
        var u = new AcessoUniverso();
        foreach (var p in Todos(s, new QueryExpression("privilege") { ColumnSet = new ColumnSet("name", "accessright") }))
            u.Privilegios[p.Id] = new Privilegio
            {
                Nome = p.GetAttributeValue<string>("name") ?? p.Id.ToString(),
                Tipo = Tipos.TryGetValue(p.GetAttributeValue<int?>("accessright") ?? 0, out var t) ? t : "Use",
            };
        foreach (var l in Todos(s, new QueryExpression("privilegeobjecttypecodes") { ColumnSet = new ColumnSet("privilegeid", "objecttypecode") }))
        {
            Guid? id = l.Contains("privilegeid") ? l["privilegeid"] switch { EntityReference r => r.Id, Guid g => g, _ => null } : null;
            var tabela = l.GetAttributeValue<string>("objecttypecode");
            if (id is Guid pid && u.Privilegios.TryGetValue(pid, out var priv) && !string.IsNullOrEmpty(tabela) && !priv.Tabelas.Contains(tabela)) priv.Tabelas.Add(tabela!);
        }
        foreach (var e in Todos(s, new QueryExpression("entity") { ColumnSet = new ColumnSet("logicalname", "entitysetname") }))
        {
            var logico = e.GetAttributeValue<string>("logicalname");
            if (string.IsNullOrEmpty(logico)) continue;
            u.Tabelas[logico!] = logico!;
            var conjunto = e.GetAttributeValue<string>("entitysetname");
            if (!string.IsNullOrEmpty(conjunto)) u.Tabelas[conjunto!] = logico!;
        }
        var consulta = new EntityQueryExpression { Properties = new MetadataPropertiesExpression("LogicalName", "DisplayName") };
        foreach (var em in ((RetrieveMetadataChangesResponse)s.Execute(new RetrieveMetadataChangesRequest { Query = consulta })).EntityMetadata)
        {
            var rotulo = em.DisplayName?.UserLocalizedLabel?.Label ?? em.DisplayName?.LocalizedLabels.FirstOrDefault()?.Label;
            if (!string.IsNullOrEmpty(em.LogicalName) && !string.IsNullOrWhiteSpace(rotulo)) u.Rotulos[em.LogicalName] = rotulo!;
        }
        return u;
    }

    /// <summary>Tabelas de dono usuário ou equipe (têm privilégio de atribuir).</summary>
    public IEnumerable<string> TabelasComDono() =>
        Privilegios.Values.Where(p => p.Tipo == "Assign").SelectMany(p => p.Tabelas).Distinct(StringComparer.Ordinal);

    public static List<Entity> Todos(IOrganizationService s, QueryExpression q)
    {
        q.PageInfo = new PagingInfo { Count = 5000, PageNumber = 1 };
        var linhas = new List<Entity>();
        while (true)
        {
            var pagina = s.RetrieveMultiple(q);
            linhas.AddRange(pagina.Entities);
            if (!pagina.MoreRecords) return linhas;
            q.PageInfo.PageNumber++;
            q.PageInfo.PagingCookie = pagina.PagingCookie;
        }
    }
}
