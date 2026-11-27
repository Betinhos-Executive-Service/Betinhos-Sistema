using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin;

/// <summary>Define os perfis de uma pessoa: troca os papéis "Perfil - *" e os perfis de coluna de mesmo nome e grava o histórico.
/// O Administrador do Sistema também retira ou devolve o acesso amplo legado (Administrador do Sistema e papéis antigos diretos).</summary>
public sealed class DefinirPerfisHandler
{
    private readonly IOrganizationService _sistema;

    public DefinirPerfisHandler(IOrganizationService sistema) { _sistema = sistema; }

    public string Executar(Guid chamador, Guid usuario, string? perfisJson, bool retirarAmplo = false, bool devolverAmplo = false)
    {
        var admin = AcessoPrevisao.Autorizar(_sistema, chamador);
        if ((retirarAmplo || devolverAmplo) && !admin)
            throw new AcessoException("SEM_PERMISSAO", "Só o Administrador do Sistema retira ou devolve o acesso amplo.");
        if (retirarAmplo && devolverAmplo) throw new AcessoException("PEDIDO_INVALIDO", "Retirar e devolver o acesso amplo no mesmo pedido.");
        if (chamador == usuario) throw new AcessoException("PROPRIO_ACESSO", "Ninguém altera o próprio acesso.");

        var plano = AcessoPrevisao.Planejar(_sistema, admin, usuario, perfisJson);
        // Custom API síncrona: falha em Ajustar desfaz a retirada junto (transação do Dataverse).
        var amplo = retirarAmplo ? Retirar(usuario) : devolverAmplo ? Devolver(usuario) : null;

        Ajustar(usuario, "systemuserroles_association", "role", plano.PapeisConhecidos, plano.PapeisAtuais, plano.PapeisQuerer);
        Ajustar(usuario, "systemuserprofiles_association", "fieldsecurityprofile", plano.ColunasConhecidas, plano.ColunasAtuais, plano.ColunasQuerer);

        var jsonAntes = AcessoCatalogo.Json(plano.Antes);
        var jsonDepois = AcessoCatalogo.Json(plano.Pedido);
        Guid? historico = null;
        if (jsonAntes != jsonDepois || amplo != null)
        {
            var nome = plano.Alvo.GetAttributeValue<string>("fullname") ?? "";
            var linha = new Entity("cr40f_acessohistorico")
            {
                ["cr40f_name"] = nome.Length > 200 ? nome.Substring(0, 200) : nome,
                ["cr40f_usuario"] = new EntityReference("systemuser", usuario),
                ["cr40f_alteradopor"] = new EntityReference("systemuser", chamador),
                ["cr40f_perfisantes"] = jsonAntes,
                ["cr40f_perfisdepois"] = jsonDepois,
            };
            if (amplo != null) linha["cr40f_amplo"] = amplo;
            historico = _sistema.Create(linha);
        }
        return "{\"antes\":" + jsonAntes + ",\"depois\":" + jsonDepois + ",\"amplo\":" + (amplo ?? "null")
            + ",\"historico\":" + (historico is Guid h ? JsonLeve.Texto(h.ToString()) : "null") + "}";
    }

    /// <summary>Tira os papéis amplos diretos (nunca de equipe). Tirar o Administrador do Sistema que deixa menos de 2 é desfeito e recusado.
    /// Sem papel amplo direto não há retirada: devolve nulo e nada vai para cr40f_amplo.</summary>
    private string? Retirar(Guid usuario)
    {
        var papeis = PapeisDoUsuario.IdsDiretos(_sistema, usuario)
            .Select(id => (Id: id, Nome: PapeisDoUsuario.NomeDoPapel(_sistema, id)))
            .Where(p => AcessoCatalogo.EhAmplo(p.Nome)).ToList();
        if (papeis.Count == 0) return null;
        var refs = new EntityReferenceCollection(papeis.Select(p => new EntityReference("role", p.Id)).ToList());
        _sistema.Disassociate("systemuser", usuario, new Relationship("systemuserroles_association"), refs);
        if (papeis.Any(p => AcessoCatalogo.EhAdminDoSistema(new[] { p.Nome! })) && AdminsDiretos() < 2)
        {
            _sistema.Associate("systemuser", usuario, new Relationship("systemuserroles_association"), refs);
            throw new AcessoException("ULTIMO_ADMIN", "Sobrariam menos de 2 pessoas com Administrador do Sistema direto.");
        }
        return Amplo("retirar", papeis);
    }

    /// <summary>Repõe os papéis amplos da última retirada da pessoa que ainda existem e ela não tem.
    /// Só vale linha que o próprio plugin gravou (createdby = conta do plugin): o histórico aceita criação por outras contas e uma linha forjada daria qualquer papel.
    /// Retirada sem papéis (gravada antes de o Retirar parar de registrá-la) é pulada.</summary>
    private string Devolver(Guid usuario)
    {
        var plugin = ((WhoAmIResponse)_sistema.Execute(new WhoAmIRequest())).UserId;
        var q = new QueryExpression("cr40f_acessohistorico") { ColumnSet = new ColumnSet("cr40f_amplo", "createdon", "createdby") };
        q.Criteria.AddCondition("cr40f_usuario", ConditionOperator.Equal, usuario);
        q.Criteria.AddCondition("cr40f_amplo", ConditionOperator.NotNull);
        q.Criteria.AddCondition("createdby", ConditionOperator.Equal, plugin);
        q.AddOrder("createdon", OrderType.Descending);
        static List<object?> Papeis(Dictionary<string, object?> r) => (r.TryGetValue("papeis", out var l) ? l as List<object?> : null) ?? new List<object?>();
        var registro = AcessoUniverso.Todos(_sistema, q)
            .Where(e => e.GetAttributeValue<EntityReference>("createdby")?.Id == plugin && !string.IsNullOrEmpty(e.GetAttributeValue<string>("cr40f_amplo")))
            .OrderByDescending(e => e.GetAttributeValue<DateTime?>("createdon") ?? DateTime.MinValue)
            .Select(e => { try { return JsonLeve.Ler(e.GetAttributeValue<string>("cr40f_amplo")); } catch (Exception) { return null; } })
            .FirstOrDefault(r => r != null && !(Equals(r.TryGetValue("acao", out var x) ? x : null, "retirar") && Papeis(r).Count == 0));
        if (registro == null || !Equals(registro.TryGetValue("acao", out var a) ? a : null, "retirar"))
            throw new AcessoException("NADA_A_DEVOLVER", "Não há retirada de acesso amplo a devolver para esta pessoa.");

        var atuais = PapeisDoUsuario.IdsDiretos(_sistema, usuario);
        var repor = new List<(Guid Id, string? Nome)>();
        foreach (var item in Papeis(registro))
        {
            if (item is not Dictionary<string, object?> p || !Guid.TryParse(p.TryGetValue("id", out var id) ? id as string : null, out var roleId)) continue;
            var nome = PapeisDoUsuario.NomeDoPapel(_sistema, roleId);
            if (AcessoCatalogo.EhAmplo(nome) && !atuais.Contains(roleId) && !repor.Any(r => r.Id == roleId)) repor.Add((roleId, nome));
        }
        if (repor.Count > 0)
            _sistema.Associate("systemuser", usuario, new Relationship("systemuserroles_association"),
                new EntityReferenceCollection(repor.Select(r => new EntityReference("role", r.Id)).ToList()));
        return Amplo("devolver", repor);
    }

    private int AdminsDiretos()
    {
        var pessoas = new HashSet<Guid>();
        foreach (var nome in AcessoCatalogo.NomesAdminDoSistema)
        {
            var q = new QueryExpression("role") { ColumnSet = new ColumnSet("name") };
            q.Criteria.AddCondition("name", ConditionOperator.Equal, nome);
            foreach (var papel in AcessoUniverso.Todos(_sistema, q))
                pessoas.UnionWith(PapeisDoUsuario.Ids(_sistema, "systemuserroles", "roleid", papel.Id, "systemuserid"));
        }
        // Mesmo filtro do administrativos() do corte: ativa, accessmode 0 (leitura-gravação), não aplicação.
        return pessoas.Count(id =>
        {
            var q = new QueryExpression("systemuser") { ColumnSet = new ColumnSet("isdisabled", "accessmode", "applicationid") };
            q.Criteria.AddCondition("systemuserid", ConditionOperator.Equal, id);
            var u = _sistema.RetrieveMultiple(q).Entities.FirstOrDefault();
            return u != null && !u.GetAttributeValue<bool>("isdisabled") && (u.GetAttributeValue<OptionSetValue>("accessmode")?.Value ?? 0) == 0
                && u.GetAttributeValue<Guid?>("applicationid") == null;
        });
    }

    private static string Amplo(string acao, IEnumerable<(Guid Id, string? Nome)> papeis) =>
        "{\"acao\":" + JsonLeve.Texto(acao) + ",\"papeis\":["
        + string.Join(",", papeis.Select(p => "{\"id\":" + JsonLeve.Texto(p.Id.ToString()) + ",\"nome\":" + JsonLeve.Texto(p.Nome) + "}")) + "]}";

    /// <summary>Inclui o que falta e retira o que sobra, só entre os registros conhecidos (<paramref name="conhecidos"/>).</summary>
    private void Ajustar(Guid usuario, string relacao, string tabela, ICollection<Guid> conhecidos, List<Guid> atuais, List<Guid> querer)
    {
        var incluir = querer.Where(id => !atuais.Contains(id)).Distinct().Select(id => new EntityReference(tabela, id)).ToList();
        var retirar = atuais.Where(id => conhecidos.Contains(id) && !querer.Contains(id)).Select(id => new EntityReference(tabela, id)).ToList();
        if (incluir.Count > 0) _sistema.Associate("systemuser", usuario, new Relationship(relacao), new EntityReferenceCollection(incluir));
        if (retirar.Count > 0) _sistema.Disassociate("systemuser", usuario, new Relationship(relacao), new EntityReferenceCollection(retirar));
    }
}
