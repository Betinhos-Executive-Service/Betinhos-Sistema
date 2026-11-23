using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin;

/// <summary>Define os perfis de uma pessoa: troca os papéis "Perfil - *" e os perfis de coluna de mesmo nome e grava o histórico.</summary>
public sealed class DefinirPerfisHandler
{
    private readonly IOrganizationService _sistema;

    public DefinirPerfisHandler(IOrganizationService sistema) { _sistema = sistema; }

    public string Executar(Guid chamador, Guid usuario, string? perfisJson)
    {
        var papeisDoChamador = PapeisDoUsuario.Nomes(_sistema, chamador);
        var admin = AcessoCatalogo.EhAdminDoSistema(papeisDoChamador);
        if (!admin && !papeisDoChamador.Contains(AcessoCatalogo.AdminAcessos))
            throw new AcessoException("SEM_PERMISSAO", "Só o Administrador de acessos altera perfis.");
        if (chamador == usuario) throw new AcessoException("PROPRIO_ACESSO", "Ninguém altera o próprio acesso.");

        var pedido = AcessoCatalogo.LerPedido(perfisJson);
        var alvo = Alvo(usuario) ?? throw new AcessoException("USUARIO_INVALIDO", "Usuário não encontrado, desativado ou de aplicação.");
        var papeis = Catalogo("role", alvo.GetAttributeValue<EntityReference>("businessunitid").Id);
        var colunas = Catalogo("fieldsecurityprofile", null);
        var papeisAtuais = PapeisDoUsuario.IdsDiretos(_sistema, usuario);
        var antes = AcessoCatalogo.DosPapeis(papeis.Where(p => papeisAtuais.Contains(p.Value)).Select(p => p.Key));
        if (antes.Acessos != pedido.Acessos && !admin)
            throw new AcessoException("SEM_PERMISSAO", "Só o Administrador do Sistema concede ou retira o perfil Administrador de acessos.");

        var papeisDesejados = AcessoCatalogo.Papeis(pedido);
        papeisDesejados.Add(AcessoCatalogo.Base);
        var colunasDesejadas = AcessoCatalogo.PerfisDeColuna(pedido);
        var faltam = papeisDesejados.Where(n => !papeis.ContainsKey(n)).Concat(colunasDesejadas.Where(n => !colunas.ContainsKey(n))).Distinct().ToList();
        if (faltam.Count > 0)
            throw new AcessoException("PERFIL_INDISPONIVEL", "Perfil ainda não publicado neste ambiente: " + string.Join("; ", faltam) + ".");

        Ajustar(usuario, "systemuserroles_association", "role", papeis, papeisAtuais, papeisDesejados);
        Ajustar(usuario, "systemuserprofiles_association", "fieldsecurityprofile", colunas,
            PapeisDoUsuario.Ids(_sistema, "systemuserprofiles", "systemuserid", usuario, "fieldsecurityprofileid"), colunasDesejadas);

        var jsonAntes = AcessoCatalogo.Json(antes);
        var jsonDepois = AcessoCatalogo.Json(pedido);
        Guid? historico = null;
        if (jsonAntes != jsonDepois)
        {
            var nome = alvo.GetAttributeValue<string>("fullname") ?? "";
            historico = _sistema.Create(new Entity("cr40f_acessohistorico")
            {
                ["cr40f_name"] = nome.Length > 200 ? nome.Substring(0, 200) : nome,
                ["cr40f_usuario"] = new EntityReference("systemuser", usuario),
                ["cr40f_alteradopor"] = new EntityReference("systemuser", chamador),
                ["cr40f_perfisantes"] = jsonAntes,
                ["cr40f_perfisdepois"] = jsonDepois,
            });
        }
        return "{\"antes\":" + jsonAntes + ",\"depois\":" + jsonDepois + ",\"historico\":" + (historico is Guid h ? JsonLeve.Texto(h.ToString()) : "null") + "}";
    }

    private Entity? Alvo(Guid usuario)
    {
        if (usuario == Guid.Empty) return null;
        var q = new QueryExpression("systemuser") { ColumnSet = new ColumnSet("isdisabled", "applicationid", "businessunitid", "fullname") };
        q.Criteria.AddCondition("systemuserid", ConditionOperator.Equal, usuario);
        var e = _sistema.RetrieveMultiple(q).Entities.FirstOrDefault();
        if (e == null || e.GetAttributeValue<bool>("isdisabled") || e.GetAttributeValue<Guid?>("applicationid") != null) return null;
        return e;
    }

    /// <summary>Nome → id dos registros "Perfil - *" da tabela (papéis: só os da unidade de negócio do alvo).</summary>
    private Dictionary<string, Guid> Catalogo(string tabela, Guid? unidade)
    {
        var q = new QueryExpression(tabela) { ColumnSet = new ColumnSet("name") };
        if (unidade is Guid id) q.Criteria.AddCondition("businessunitid", ConditionOperator.Equal, id);
        var mapa = new Dictionary<string, Guid>(StringComparer.Ordinal);
        foreach (var e in _sistema.RetrieveMultiple(q).Entities)
        {
            var nome = e.GetAttributeValue<string>("name");
            if (nome != null && AcessoCatalogo.EhDoCatalogo(nome)) mapa[nome] = e.Id;
        }
        return mapa;
    }

    /// <summary>Inclui o que falta e retira o que sobra, só entre os registros do catálogo.</summary>
    private void Ajustar(Guid usuario, string relacao, string tabela, Dictionary<string, Guid> catalogo, List<Guid> atuais, List<string> desejados)
    {
        var querer = desejados.Select(n => catalogo[n]).ToList();
        var incluir = querer.Where(id => !atuais.Contains(id)).Select(id => new EntityReference(tabela, id)).ToList();
        var retirar = catalogo.Values.Where(id => atuais.Contains(id) && !querer.Contains(id)).Select(id => new EntityReference(tabela, id)).ToList();
        if (incluir.Count > 0) _sistema.Associate("systemuser", usuario, new Relationship(relacao), new EntityReferenceCollection(incluir));
        if (retirar.Count > 0) _sistema.Disassociate("systemuser", usuario, new Relationship(relacao), new EntityReferenceCollection(retirar));
    }
}
