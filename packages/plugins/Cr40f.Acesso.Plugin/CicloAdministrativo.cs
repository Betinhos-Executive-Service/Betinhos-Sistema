using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin;

/// <summary>Peças comuns ao encerrar e ao reativar o acesso de um administrativo: o alvo, o JSON do cr40f_amplo e o último ciclo do histórico.</summary>
public static class CicloAdministrativo
{
    public const string Encerrar = "encerrar";
    public const string Reativar = "reativar";

    /// <summary>Equipe do Entra (2 grupo de segurança, 3 grupo do Office): a participação vem do grupo e não sai pelo Dataverse.</summary>
    public static bool EhEquipeDoEntra(Entity equipe) => (equipe.GetAttributeValue<OptionSetValue>("teamtype")?.Value ?? 0) is 2 or 3;

    /// <summary>systemuser de pessoa (não aplicação). Bloqueado também vale: o reativar parte dele.</summary>
    public static Entity Alvo(IOrganizationService s, Guid usuario)
    {
        Entity? e = null;
        if (usuario != Guid.Empty)
        {
            var q = new QueryExpression("systemuser") { ColumnSet = new ColumnSet("fullname", "isdisabled", "applicationid") };
            q.Criteria.AddCondition("systemuserid", ConditionOperator.Equal, usuario);
            e = s.RetrieveMultiple(q).Entities.FirstOrDefault();
        }
        if (e == null || e.GetAttributeValue<Guid?>("applicationid") != null)
            throw new AcessoException("USUARIO_INVALIDO", "Usuário não encontrado ou de aplicação.");
        return e;
    }

    public static string Nome(Entity alvo) => alvo.GetAttributeValue<string>("fullname") ?? "";

    /// <summary>Último encerrar ou reativar da pessoa gravado pelo próprio plugin (createdby = conta do plugin; linha de outra conta é ignorada).</summary>
    public static Dictionary<string, object?>? UltimoCiclo(IOrganizationService s, Guid usuario)
    {
        var plugin = ((WhoAmIResponse)s.Execute(new WhoAmIRequest())).UserId;
        var q = new QueryExpression("cr40f_acessohistorico") { ColumnSet = new ColumnSet("cr40f_amplo", "createdon", "createdby") };
        q.Criteria.AddCondition("cr40f_usuario", ConditionOperator.Equal, usuario);
        q.Criteria.AddCondition("cr40f_amplo", ConditionOperator.NotNull);
        q.Criteria.AddCondition("createdby", ConditionOperator.Equal, plugin);
        q.AddOrder("createdon", OrderType.Descending);
        return AcessoUniverso.Todos(s, q)
            .Where(e => e.GetAttributeValue<EntityReference>("createdby")?.Id == plugin && !string.IsNullOrEmpty(e.GetAttributeValue<string>("cr40f_amplo")))
            .OrderByDescending(e => e.GetAttributeValue<DateTime?>("createdon") ?? DateTime.MinValue)
            .Select(e => { try { return JsonLeve.Ler(e.GetAttributeValue<string>("cr40f_amplo")); } catch (Exception) { return null; } })
            .FirstOrDefault(r => Acao(r) is Encerrar or Reativar);
    }

    public static string? Acao(Dictionary<string, object?>? registro) => registro != null && registro.TryGetValue("acao", out var a) ? a as string : null;

    /// <summary>Itens {id, nome} de uma lista do registro; item sem id válido é ignorado.</summary>
    public static List<(Guid Id, string? Nome)> Itens(Dictionary<string, object?> registro, string campo)
    {
        var lista = registro.TryGetValue(campo, out var l) ? l as List<object?> : null;
        var itens = new List<(Guid, string?)>();
        foreach (var item in lista ?? new List<object?>())
            if (item is Dictionary<string, object?> d && Guid.TryParse(d.TryGetValue("id", out var id) ? id as string : null, out var g))
                itens.Add((g, d.TryGetValue("nome", out var n) ? n as string : null));
        return itens;
    }

    public static string Json(string acao, IEnumerable<(Guid Id, string? Nome)> papeis, IEnumerable<(Guid Id, string? Nome)> perfisColuna, IEnumerable<(Guid Id, string? Nome)> equipes) =>
        "{\"acao\":" + JsonLeve.Texto(acao) + ",\"papeis\":" + Lista(papeis) + ",\"perfisColuna\":" + Lista(perfisColuna) + ",\"equipes\":" + Lista(equipes) + "}";

    private static string Lista(IEnumerable<(Guid Id, string? Nome)> itens) =>
        "[" + string.Join(",", itens.Select(p => "{\"id\":" + JsonLeve.Texto(p.Id.ToString()) + ",\"nome\":" + JsonLeve.Texto(p.Nome) + "}")) + "]";

    /// <summary>Perfis da pessoa no formato do histórico (AcessoCatalogo.Json), pelos nomes dos papéis diretos.</summary>
    public static string PerfisJson(IOrganizationService s, Guid usuario) =>
        AcessoCatalogo.Json(AcessoCatalogo.DosPapeis(PapeisDoUsuario.IdsDiretos(s, usuario).Select(id => PapeisDoUsuario.NomeDoPapel(s, id)).Where(n => n != null).Select(n => n!)));

    public static string? NomeDe(IOrganizationService s, string tabela, Guid id)
    {
        var q = new QueryExpression(tabela) { ColumnSet = new ColumnSet("name") };
        q.Criteria.AddCondition(tabela + "id", ConditionOperator.Equal, id);
        return s.RetrieveMultiple(q).Entities.FirstOrDefault()?.GetAttributeValue<string>("name");
    }

    public static Entity? Equipe(IOrganizationService s, Guid id)
    {
        var q = new QueryExpression("team") { ColumnSet = new ColumnSet("name", "isdefault", "teamtype") };
        q.Criteria.AddCondition("teamid", ConditionOperator.Equal, id);
        return s.RetrieveMultiple(q).Entities.FirstOrDefault();
    }

    public static Guid Historico(IOrganizationService s, Entity alvo, Guid chamador, string antes, string depois, string amplo)
    {
        var nome = Nome(alvo);
        return s.Create(new Entity("cr40f_acessohistorico")
        {
            ["cr40f_name"] = nome.Length > 200 ? nome.Substring(0, 200) : nome,
            ["cr40f_usuario"] = new EntityReference("systemuser", alvo.Id),
            ["cr40f_alteradopor"] = new EntityReference("systemuser", chamador),
            ["cr40f_perfisantes"] = antes,
            ["cr40f_perfisdepois"] = depois,
            ["cr40f_amplo"] = amplo,
        });
    }
}
