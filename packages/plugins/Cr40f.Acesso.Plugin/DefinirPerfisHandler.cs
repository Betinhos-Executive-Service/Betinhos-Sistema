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

        // Pedido ausente não pode virar "[]" (só o Base): só a lista vazia explícita retira as áreas.
        if (string.IsNullOrWhiteSpace(perfisJson)) throw new AcessoException("PERFIL_INVALIDO", "A lista de perfis é obrigatória (use [] para ficar só com o Base).");
        var pedido = AcessoCatalogo.LerPedido(perfisJson);
        var alvo = Alvo(usuario) ?? throw new AcessoException("USUARIO_INVALIDO", "Usuário não encontrado, desativado ou de aplicação.");
        var papeis = Catalogo("role", alvo.GetAttributeValue<EntityReference>("businessunitid")!.Id);
        var colunas = Catalogo("fieldsecurityprofile", null);
        var copias = CopiasNaFrota(alvo.GetAttributeValue<EntityReference>("businessunitid")!.Id, out var temFrota);
        var conhecidos = papeis.Concat(copias).ToList();
        var papeisAtuais = PapeisDoUsuario.IdsDiretos(_sistema, usuario);
        var antes = AcessoCatalogo.DosPapeis(conhecidos.Where(p => papeisAtuais.Contains(p.Value)).Select(p => p.Key).Distinct());
        if (antes.Acessos != pedido.Acessos && !admin)
            throw new AcessoException("SEM_PERMISSAO", "Só o Administrador do Sistema concede ou retira o perfil Administrador de acessos.");

        var papeisDesejados = AcessoCatalogo.Papeis(pedido);
        papeisDesejados.Add(AcessoCatalogo.Base);
        var colunasDesejadas = AcessoCatalogo.Papeis(pedido);
        var faltam = papeisDesejados.Where(n => !papeis.ContainsKey(n)).Concat(colunasDesejadas.Where(n => !colunas.ContainsKey(n))).Distinct().ToList();
        if (faltam.Count > 0)
            throw new AcessoException("PERFIL_INDISPONIVEL", "Perfil ainda não publicado neste ambiente: " + string.Join("; ", faltam) + ".");

        // Com a unidade Frota, Frota Operador/Gestor vão pela cópia do papel nela; sem a cópia, recusa em vez de cair no papel raiz.
        var faltamCopias = temFrota ? papeisDesejados.Where(n => NomesFrota.Contains(n) && !copias.ContainsKey(n)).ToList() : new List<string>();
        if (faltamCopias.Count > 0)
            throw new AcessoException("PERFIL_INDISPONIVEL", "Perfil ainda não copiado para a unidade Frota: " + string.Join("; ", faltamCopias) + ".");
        var querer = papeisDesejados.Select(n => copias.TryGetValue(n, out var c) ? c : papeis[n]).ToList();

        Ajustar(usuario, "systemuserroles_association", "role", conhecidos.Select(p => p.Value), papeisAtuais, querer);
        Ajustar(usuario, "systemuserprofiles_association", "fieldsecurityprofile", colunas.Values,
            PapeisDoUsuario.Ids(_sistema, "systemuserprofiles", "systemuserid", usuario, "fieldsecurityprofileid"), colunasDesejadas.Select(n => colunas[n]).ToList());

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
        if (e == null || e.GetAttributeValue<bool>("isdisabled") || e.GetAttributeValue<Guid?>("applicationid") != null
            || e.GetAttributeValue<EntityReference>("businessunitid") == null) return null;
        return e;
    }

    /// <summary>Nome → id dos registros da lista fixa (<see cref="AcessoCatalogo.Lista"/>) na tabela (papéis: só os da unidade de negócio do alvo). Nome repetido é recusado.</summary>
    private Dictionary<string, Guid> Catalogo(string tabela, Guid? unidade)
    {
        var q = new QueryExpression(tabela) { ColumnSet = new ColumnSet("name") };
        if (unidade is Guid id) q.Criteria.AddCondition("businessunitid", ConditionOperator.Equal, id);
        var mapa = new Dictionary<string, Guid>(StringComparer.Ordinal);
        foreach (var e in _sistema.RetrieveMultiple(q).Entities)
        {
            var nome = e.GetAttributeValue<string>("name");
            if (nome == null || !AcessoCatalogo.EhDoCatalogo(nome)) continue;
            if (mapa.ContainsKey(nome)) throw new AcessoException("PERFIL_INDISPONIVEL", "Há mais de um registro chamado " + nome + " neste ambiente.");
            mapa[nome] = e.Id;
        }
        return mapa;
    }

    private static readonly HashSet<string> NomesFrota = new(new[] { "operador", "gestor" }.Select(n => AcessoCatalogo.NomeDoPapel("frota", n)), StringComparer.Ordinal);

    /// <summary>Cópias dos papéis Frota na unidade "Frota" filha da unidade do alvo; vazio quando a unidade não existe.</summary>
    private Dictionary<string, Guid> CopiasNaFrota(Guid buAlvo, out bool temUnidade)
    {
        var q = new QueryExpression("businessunit") { ColumnSet = new ColumnSet("name", "isdisabled") };
        q.Criteria.AddCondition("parentbusinessunitid", ConditionOperator.Equal, buAlvo);
        var frotas = _sistema.RetrieveMultiple(q).Entities
            .Where(b => !b.GetAttributeValue<bool>("isdisabled") && string.Equals(b.GetAttributeValue<string>("name"), "Frota", StringComparison.OrdinalIgnoreCase))
            .ToList();
        if (frotas.Count > 1) throw new AcessoException("PERFIL_INDISPONIVEL", "Há mais de uma unidade Frota ativa neste ambiente.");
        temUnidade = frotas.Count == 1;
        if (!temUnidade) return new Dictionary<string, Guid>(StringComparer.Ordinal);
        return Catalogo("role", frotas[0].Id).Where(p => NomesFrota.Contains(p.Key)).ToDictionary(p => p.Key, p => p.Value, StringComparer.Ordinal);
    }

    /// <summary>Inclui o que falta e retira o que sobra, só entre os registros conhecidos (<paramref name="universo"/>).</summary>
    private void Ajustar(Guid usuario, string relacao, string tabela, IEnumerable<Guid> universo, List<Guid> atuais, List<Guid> querer)
    {
        var conhecidos = new HashSet<Guid>(universo);
        var incluir = querer.Where(id => !atuais.Contains(id)).Distinct().Select(id => new EntityReference(tabela, id)).ToList();
        var retirar = atuais.Where(id => conhecidos.Contains(id) && !querer.Contains(id)).Select(id => new EntityReference(tabela, id)).ToList();
        if (incluir.Count > 0) _sistema.Associate("systemuser", usuario, new Relationship(relacao), new EntityReferenceCollection(incluir));
        if (retirar.Count > 0) _sistema.Disassociate("systemuser", usuario, new Relationship(relacao), new EntityReferenceCollection(retirar));
    }
}
