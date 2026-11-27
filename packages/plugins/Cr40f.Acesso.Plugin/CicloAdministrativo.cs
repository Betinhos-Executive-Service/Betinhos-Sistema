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

    /// <summary>systemuser de pessoa: não de aplicação, interativo (accessmode 0; SYSTEM e INTEGRATION não são) e com conta do Entra.
    /// Bloqueado também vale: o reativar parte dele.</summary>
    public static Entity Alvo(IOrganizationService s, Guid usuario)
    {
        Entity? e = null;
        if (usuario != Guid.Empty)
        {
            var q = new QueryExpression("systemuser") { ColumnSet = new ColumnSet("fullname", "isdisabled", "applicationid", "accessmode", "azureactivedirectoryobjectid", "businessunitid") };
            q.Criteria.AddCondition("systemuserid", ConditionOperator.Equal, usuario);
            e = s.RetrieveMultiple(q).Entities.FirstOrDefault();
        }
        if (e == null || e.GetAttributeValue<Guid?>("applicationid") != null
            || e.GetAttributeValue<OptionSetValue>("accessmode")?.Value != 0
            || (e.GetAttributeValue<Guid?>("azureactivedirectoryobjectid") ?? Guid.Empty) == Guid.Empty)
            throw new AcessoException("USUARIO_INVALIDO", "Usuário não encontrado, de aplicação, não interativo ou sem conta do Entra.");
        return e;
    }

    public static string Nome(Entity alvo) => alvo.GetAttributeValue<string>("fullname") ?? "";

    /// <summary>Último encerrar ou reativar da pessoa gravado pelo próprio plugin (createdby = conta do plugin; linha de outra conta é ignorada),
    /// e se ele é a última linha do plugin para a pessoa (linha depois dele, mesmo com cr40f_amplo vazio, como um DefinirPerfis comum, deixa falso).
    /// cr40f_amplo ilegível para tudo: pular deixaria um reativar ilegível ressuscitar o encerramento anterior.</summary>
    public static (Dictionary<string, object?>? Registro, bool UltimaLinha) UltimoCiclo(IOrganizationService s, Guid usuario)
    {
        var plugin = ((WhoAmIResponse)s.Execute(new WhoAmIRequest())).UserId;
        var q = new QueryExpression("cr40f_acessohistorico") { ColumnSet = new ColumnSet("cr40f_amplo", "createdon", "createdby") };
        q.Criteria.AddCondition("cr40f_usuario", ConditionOperator.Equal, usuario);
        q.Criteria.AddCondition("createdby", ConditionOperator.Equal, plugin);
        q.AddOrder("createdon", OrderType.Descending);
        var linhas = AcessoUniverso.Todos(s, q)
            .Where(e => e.GetAttributeValue<EntityReference>("createdby")?.Id == plugin)
            .OrderByDescending(e => e.GetAttributeValue<DateTime?>("createdon") ?? DateTime.MinValue)
            .ToList();
        for (var i = 0; i < linhas.Count; i++)
        {
            var json = linhas[i].GetAttributeValue<string>("cr40f_amplo");
            if (string.IsNullOrWhiteSpace(json)) continue;
            Dictionary<string, object?> registro;
            try { registro = JsonLeve.Ler(json); }
            catch (Exception) { throw new AcessoException("HISTORICO_ILEGIVEL", "O histórico de acesso desta pessoa tem um registro ilegível; corrija-o antes de encerrar ou reativar."); }
            if (Acao(registro) is Encerrar or Reativar) return (registro, i == 0);
        }
        return (null, false);
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

    /// <summary>Limite do cr40f_amplo (memo de 4000).</summary>
    public const int LimiteAmplo = 4000;

    /// <summary>JSON do cr40f_amplo: {"acao","papeis","perfisColuna","equipes"}, itens {"id","nome"}. Passando de 4000, os itens ficam só {"id"};
    /// se ainda passar, recusa (HISTORICO_GRANDE) — chamar antes de qualquer gravação.</summary>
    public static string Amplo(string acao, IEnumerable<(Guid Id, string? Nome)> papeis, IEnumerable<(Guid Id, string? Nome)> perfisColuna, IEnumerable<(Guid Id, string? Nome)> equipes)
    {
        var json = Json(acao, papeis, perfisColuna, equipes);
        if (json.Length > LimiteAmplo) json = Json(acao, papeis, perfisColuna, equipes, comNomes: false);
        if (json.Length > LimiteAmplo)
            throw new AcessoException("HISTORICO_GRANDE", "Esta pessoa tem papéis, perfis de coluna e equipes demais para caber no histórico (" + json.Length + " de " + LimiteAmplo + " caracteres); nada foi alterado. Tire parte das equipes ou papéis antes de encerrar.");
        return json;
    }

    public static string Json(string acao, IEnumerable<(Guid Id, string? Nome)> papeis, IEnumerable<(Guid Id, string? Nome)> perfisColuna, IEnumerable<(Guid Id, string? Nome)> equipes, bool comNomes = true) =>
        "{\"acao\":" + JsonLeve.Texto(acao) + ",\"papeis\":" + Lista(papeis, comNomes) + ",\"perfisColuna\":" + Lista(perfisColuna, comNomes) + ",\"equipes\":" + Lista(equipes, comNomes) + "}";

    private static string Lista(IEnumerable<(Guid Id, string? Nome)> itens, bool comNomes) =>
        "[" + string.Join(",", itens.Select(p => "{\"id\":" + JsonLeve.Texto(p.Id.ToString()) + (comNomes ? ",\"nome\":" + JsonLeve.Texto(p.Nome) : "") + "}")) + "]";

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

    /// <summary>Equipe que o plugin não mexe: do Entra ou a padrão da unidade de negócio (toda pessoa da unidade é membro).</summary>
    public static string? MotivoEquipeIntocavel(Entity equipe) =>
        EhEquipeDoEntra(equipe) ? "grupo do Entra: peça à TI" : equipe.GetAttributeValue<bool>("isdefault") ? "equipe padrão da unidade de negócio" : null;

    public static Entity? Papel(IOrganizationService s, Guid id)
    {
        var q = new QueryExpression("role") { ColumnSet = new ColumnSet("name", "businessunitid") };
        q.Criteria.AddCondition("roleid", ConditionOperator.Equal, id);
        return s.RetrieveMultiple(q).Entities.FirstOrDefault();
    }

    /// <summary>Papel amplo ou Administrador de acessos: só o Administrador do Sistema tira ou devolve.</summary>
    public static bool SoAdminDoSistema(string? papel) => AcessoCatalogo.EhAmplo(papel) || papel == AcessoCatalogo.AdminAcessos;

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
