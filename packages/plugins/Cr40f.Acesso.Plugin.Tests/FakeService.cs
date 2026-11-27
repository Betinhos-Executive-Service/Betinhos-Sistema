using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Metadata.Query;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin.Tests;

/// <summary>Tabelas em memória: Create/Update/Retrieve e RetrieveMultiple com filtros Equal, In, Null, NotNull e GreaterEqual (and/or, sem join), paginado.</summary>
public sealed class FakeService : IOrganizationService
{
    private readonly Dictionary<string, List<Entity>> _tabelas = new();
    public List<QueryExpression> Consultas { get; } = new();
    public List<Entity> Criados { get; } = new();
    public List<Entity> Atualizados { get; } = new();

    public FakeService Com(params Entity[] linhas)
    {
        foreach (var linha in linhas)
        {
            if (!_tabelas.TryGetValue(linha.LogicalName, out var lista)) _tabelas[linha.LogicalName] = lista = new List<Entity>();
            lista.Add(linha);
        }
        return this;
    }

    /// <summary>Nome da tabela cujo Create deve falhar (simula usuário que o Dataverse ainda não aceita).</summary>
    public string? FalharCriacaoEm { get; set; }

    public Action<Entity>? AoCriar { get; set; }
    public Guid Create(Entity entity) { AoCriar?.Invoke(entity); if (entity.LogicalName == FalharCriacaoEm) throw new InvalidOperationException("Create recusado em " + entity.LogicalName);  if (entity.Id == Guid.Empty) entity.Id = Guid.NewGuid(); Carimbar(entity, true); Com(entity); Criados.Add(entity); return entity.Id; }
    public void Update(Entity entity) { Atualizados.Add(entity); var alvo = _tabelas[entity.LogicalName].Single(e => e.Id == entity.Id); foreach (var kv in entity.Attributes) alvo[kv.Key] = kv.Value; Carimbar(alvo, false); }

    private static int _relogio;
    /// <summary>Usuário que o WhoAmI devolve e que fica em createdby do histórico criado pelo serviço (o SYSTEM do plugin).</summary>
    public Guid SistemaId { get; } = Guid.NewGuid();
    /// <summary>Só nas tabelas da configuração do App: a plataforma carimba createdon/modifiedon, e a marca do rascunho e a ordem das exceções dependem deles.</summary>
    private void Carimbar(Entity e, bool criacao)
    {
        if (!e.LogicalName.StartsWith("cr40f_appconfig", StringComparison.Ordinal) && e.LogicalName != "cr40f_acessohistorico") return;
        var agora = new DateTime(2026, 11, 23, 12, 0, 0, DateTimeKind.Utc).AddSeconds(System.Threading.Interlocked.Increment(ref _relogio));
        if (criacao) e["createdon"] = agora;
        if (criacao && e.LogicalName == "cr40f_acessohistorico") e["createdby"] = new EntityReference("systemuser", SistemaId);
        e["modifiedon"] = agora;
    }
    public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) => _tabelas[entityName].Single(e => e.Id == id);

    public EntityCollection RetrieveMultiple(QueryBase query)
    {
        var expressao = (QueryExpression)query;
        Consultas.Add(expressao);
        var linhas = (_tabelas.TryGetValue(expressao.EntityName, out var lista) ? lista : new List<Entity>())
            .Where(e => Passa(e, expressao.Criteria, expressao.EntityName))
            .ToList();
        var pagina = expressao.PageInfo;
        if (pagina == null || pagina.Count <= 0) return new EntityCollection(linhas) { MoreRecords = false };
        var inicio = (Math.Max(pagina.PageNumber, 1) - 1) * pagina.Count;
        return new EntityCollection(linhas.Skip(inicio).Take(pagina.Count).ToList()) { MoreRecords = linhas.Count > inicio + pagina.Count };
    }

    /// <summary>Operador não simulado passa (como antes); and/or aninhados valem.</summary>
    private static bool Passa(Entity e, FilterExpression f, string tabela)
    {
        bool Condicao(ConditionExpression c)
        {
            var v = Valor(e, c.AttributeName, tabela);
            return c.Operator switch
            {
                ConditionOperator.Null => v is null,
                ConditionOperator.NotNull => v is not null,
                ConditionOperator.Equal => Igual(v, c.Values[0]),
                ConditionOperator.In => c.Values.Any(x => Igual(v, x)),
                ConditionOperator.GreaterEqual => v is DateTime d && c.Values[0] is DateTime limite && d >= limite,
                _ => true,
            };
        }
        var partes = f.Conditions.Select(Condicao).Concat(f.Filters.Select(sub => Passa(e, sub, tabela))).ToList();
        if (partes.Count == 0) return true;
        return f.FilterOperator == LogicalOperator.Or ? partes.Any(x => x) : partes.All(x => x);
    }

    /// <summary>Metadata simulada: tabela → coluna → IsSecured. Tabela fora daqui não existe.</summary>
    public Dictionary<string, Dictionary<string, bool>> Metadados { get; } = new(StringComparer.Ordinal);
    public FakeService Tabela(string tabela, params string[] colunas)
    {
        if (!Metadados.TryGetValue(tabela, out var c)) Metadados[tabela] = c = new Dictionary<string, bool>(StringComparer.Ordinal);
        foreach (var coluna in colunas) c[coluna] = c.TryGetValue(coluna, out var protegida) && protegida;
        return this;
    }
    public FakeService Protegida(string tabela, string coluna) { Tabela(tabela); Metadados[tabela][coluna] = true; return this; }
    /// <summary>Nome de exibição (DisplayName) da tabela na metadata.</summary>
    public Dictionary<string, string> Rotulos { get; } = new(StringComparer.Ordinal);

    private OrganizationResponse Metadata(RetrieveMetadataChangesRequest r)
    {
        static List<string>? Nomes(MetadataFilterExpression? f) =>
            f?.Conditions.FirstOrDefault(c => c.PropertyName == "LogicalName") is { } c
                ? (c.Value is string s ? new List<string> { s } : ((System.Collections.IEnumerable)c.Value).Cast<string>().ToList()) : null;
        var tabelas = Nomes(r.Query.Criteria);
        var colunas = Nomes(r.Query.AttributeQuery?.Criteria);
        var soProtegidas = r.Query.AttributeQuery?.Criteria?.Conditions.Any(c => c.PropertyName == "IsSecured") == true;
        var achadas = new EntityMetadataCollection();
        foreach (var kv in Metadados.Where(m => tabelas == null || tabelas.Contains(m.Key)))
        {
            var em = new EntityMetadata { LogicalName = kv.Key };
            if (Rotulos.TryGetValue(kv.Key, out var rotulo)) em.DisplayName = new Label(rotulo, 1046);
            var atributos = kv.Value.Where(c => (colunas == null || colunas.Contains(c.Key)) && (!soProtegidas || c.Value))
                .Select(c => (AttributeMetadata)new StringAttributeMetadata { LogicalName = c.Key, IsSecured = c.Value }).ToArray();
            typeof(EntityMetadata).GetProperty(nameof(EntityMetadata.Attributes))!.SetValue(em, atributos);
            achadas.Add(em);
        }
        var resposta = new RetrieveMetadataChangesResponse();
        resposta.Results["EntityMetadata"] = achadas;
        return resposta;
    }

    private static bool Igual(object? valor, object? condicao) =>
        valor is string a && condicao is string b ? string.Equals(a, b, StringComparison.OrdinalIgnoreCase) : Equals(valor, condicao);

    /// <summary>Privilégios que RetrieveRolePrivilegesRole devolve por papel.</summary>
    public Dictionary<Guid, Microsoft.Crm.Sdk.Messages.RolePrivilege[]> PrivilegiosDoPapel { get; } = new();

    private static object? Valor(Entity e, string atributo, string tabela)
    {
        if (atributo == tabela + "id" || atributo == "cr40f_funcionariosid") return e.Id;
        if (!e.Contains(atributo)) return null;
        return e[atributo] switch { OptionSetValue o => o.Value, EntityReference r => r.Id, string s => s.ToLowerInvariant(), var v => v };
    }

    public List<(string Tabela, Guid Id)> Excluidos { get; } = new();
    public void Delete(string entityName, Guid id) { _tabelas[entityName].RemoveAll(e => e.Id == id); Excluidos.Add((entityName, id)); }
    public List<Entity> Linhas(string tabela) => _tabelas.TryGetValue(tabela, out var lista) ? lista : new List<Entity>();
    public List<OrganizationRequest> Executados { get; } = new();
    /// <summary>Execute falha (simula SetState recusado pelo Dataverse).</summary>
    public bool FalharExecute { get; set; }
    /// <summary>Execute aceito sem efeito (simula systemuser que continua habilitado).</summary>
    public bool IgnorarExecute { get; set; }
    public OrganizationResponse Execute(OrganizationRequest request)
    {
        Executados.Add(request);
        if (FalharExecute) throw new InvalidOperationException("Execute recusado: " + request.RequestName);
        // SetState de systemuser: estado 1 = desabilitado.
        if (!IgnorarExecute && request is Microsoft.Crm.Sdk.Messages.SetStateRequest { EntityMoniker.LogicalName: "systemuser" } estado)
            _tabelas["systemuser"].Single(e => e.Id == estado.EntityMoniker.Id)["isdisabled"] = estado.State.Value == 1;
        // Membros de equipe: linhas de teammembership (systemuserid, teamid).
        if (request is Microsoft.Crm.Sdk.Messages.AddMembersTeamRequest entrar)
            foreach (var membro in entrar.MemberIds) Com(new Entity("teammembership", Guid.NewGuid()) { ["systemuserid"] = membro, ["teamid"] = entrar.TeamId });
        if (request is Microsoft.Crm.Sdk.Messages.RemoveMembersTeamRequest sair && _tabelas.TryGetValue("teammembership", out var membros))
            membros.RemoveAll(e => e.GetAttributeValue<Guid>("teamid") == sair.TeamId && sair.MemberIds.Contains(e.GetAttributeValue<Guid>("systemuserid")));
        if (request is RetrieveMetadataChangesRequest metadata) return Metadata(metadata);
        if (request is Microsoft.Crm.Sdk.Messages.WhoAmIRequest)
        {
            var quem = new Microsoft.Crm.Sdk.Messages.WhoAmIResponse();
            quem.Results["UserId"] = SistemaId;
            return quem;
        }
        if (request is Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest papel)
        {
            var resposta = new Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleResponse();
            resposta.Results["RolePrivileges"] = PrivilegiosDoPapel.TryGetValue(papel.RoleId, out var lista) ? lista : new Microsoft.Crm.Sdk.Messages.RolePrivilege[0];
            return resposta;
        }
        return new OrganizationResponse();
    }
    public List<(string Relacao, Guid Id, Guid Alvo)> Associados { get; } = new();
    public List<(string Relacao, Guid Id, Guid Alvo)> Desassociados { get; } = new();

    private static (string Tabela, string Coluna) Intersecao(string relacao) => relacao switch
    {
        "systemuserroles_association" => ("systemuserroles", "roleid"),
        "systemuserprofiles_association" => ("systemuserprofiles", "fieldsecurityprofileid"),
        _ => throw new NotSupportedException(relacao),
    };

    public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities)
    {
        var (tabela, coluna) = Intersecao(relationship.SchemaName);
        foreach (var alvo in relatedEntities)
        {
            Com(new Entity(tabela, Guid.NewGuid()) { ["systemuserid"] = entityId, [coluna] = alvo.Id });
            Associados.Add((relationship.SchemaName, entityId, alvo.Id));
        }
    }

    public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities)
    {
        var (tabela, coluna) = Intersecao(relationship.SchemaName);
        foreach (var alvo in relatedEntities)
        {
            if (_tabelas.TryGetValue(tabela, out var linhas))
                linhas.RemoveAll(e => e.GetAttributeValue<Guid>("systemuserid") == entityId && e.GetAttributeValue<Guid>(coluna) == alvo.Id);
            Desassociados.Add((relationship.SchemaName, entityId, alvo.Id));
        }
    }
}
