using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Cadastro.Plugin;

/// <summary>Status de cr40f_linkcadastro.cr40f_status.</summary>
public static class StatusLink
{
    public const int Ativo = 1, UsadoParcialmente = 2, Expirado = 3, Revogado = 4;
}

/// <summary>Gera o link público de cadastro: valida escopo, revoga links anteriores e grava só o hash do token.</summary>
public sealed class GerarLinkCadastroHandler
{
    public const string BaseLink = "https://cadastro.betinhos.com.br/#t=";
    public static readonly TimeSpan Validade = TimeSpan.FromHours(36);
    // Choices de cr40f_reservadeveculos.cr40f_status (metadata DEV 08/10/2026): Cancelado, Cancelado com Ressalvas.
    public static readonly int[] StatusCancelado = { 202410002, 202410010 };

    private readonly IOrganizationService _usuario;
    private readonly IOrganizationService _sistema;
    private readonly Func<DateTime> _agoraUtc;
    private readonly Func<byte[]> _bytesToken;

    public GerarLinkCadastroHandler(IOrganizationService usuario, IOrganizationService sistema, Func<DateTime>? agoraUtc = null, Func<byte[]>? bytesToken = null)
    {
        _usuario = usuario; _sistema = sistema;
        _agoraUtc = agoraUtc ?? (() => DateTime.UtcNow);
        _bytesToken = bytesToken ?? BytesAleatorios;
    }

    public string Executar(string? reservaIdTexto, string? passageiroIdTexto)
    {
        if (!Guid.TryParse(reservaIdTexto, out var reservaId) || reservaId == Guid.Empty) return Erro("Serviço inválido.");
        Guid? passageiroId = null;
        if (!string.IsNullOrWhiteSpace(passageiroIdTexto))
        {
            if (!Guid.TryParse(passageiroIdTexto, out var p) || p == Guid.Empty) return Erro("Passageiro inválido.");
            passageiroId = p;
        }

        Entity reserva;
        try
        {
            // Serviço do usuário iniciador: só gera link quem consegue ler a reserva.
            reserva = _usuario.Retrieve("cr40f_reservadeveculos", reservaId, new ColumnSet("cr40f_status", "cr40f_passageiro1", "cr40f_passageiro2", "cr40f_passageiro3", "cr40f_passageiro4"));
        }
        catch (Exception)
        {
            return Erro("Serviço não encontrado ou você não tem acesso a ele.");
        }

        var status = reserva.GetAttributeValue<OptionSetValue>("cr40f_status")?.Value;
        if (status is int s && StatusCancelado.Contains(s)) return Erro("Serviço cancelado não aceita link de cadastro.");

        var ids = IdsPassageiros(reserva);
        if (ids.Count == 0) return Erro("Este serviço não tem passageiros.");
        if (passageiroId is Guid alvo)
        {
            if (!ids.Contains(alvo)) return Erro("Passageiro não pertence a este serviço.");
            ids = new List<Guid> { alvo };
        }

        // Uma consulta só; passageiro excluído some da lista em vez de derrubar a geração.
        var qp = new QueryExpression("cr40f_bancodedados") { ColumnSet = new ColumnSet("cr40f_nomedopassageiro", "cr40f_telefone", "cr40f_email", "new_linkdafoto") };
        qp.Criteria.AddCondition("cr40f_bancodedadosid", ConditionOperator.In, ids.Cast<object>().ToArray());
        var porId = _sistema.RetrieveMultiple(qp).Entities.ToDictionary(e => e.Id);
        var pessoas = ids.Where(porId.ContainsKey).Select(id => porId[id]).ToList();
        if (pessoas.Count == 0) return Erro("Este serviço não tem passageiros.");

        RevogarAnteriores(reservaId, passageiroId);

        var token = Base64Url(_bytesToken());
        var expira = _agoraUtc().ToUniversalTime().Add(Validade);
        var link = new Entity("cr40f_linkcadastro")
        {
            ["cr40f_name"] = "Link de cadastro " + (passageiroId is null ? "do serviço" : "do passageiro") + " até " + expira.ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture) + " UTC",
            ["cr40f_reserva"] = new EntityReference("cr40f_reservadeveculos", reservaId),
            ["cr40f_tokenhash"] = Sha256Hex(token),
            ["cr40f_expiraem"] = expira,
            ["cr40f_status"] = new OptionSetValue(StatusLink.Ativo),
            ["cr40f_envios"] = 0,
        };
        if (passageiroId is Guid pid) link["cr40f_passageiro"] = new EntityReference("cr40f_bancodedados", pid);
        _sistema.Create(link);

        var sb = new StringBuilder("{\"ok\":true,\"link\":").Append(JsonLeve.Texto(BaseLink + token))
            .Append(",\"expiraEm\":").Append(JsonLeve.Texto(expira.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture)))
            .Append(",\"passageiros\":[");
        for (var i = 0; i < pessoas.Count; i++)
        {
            var p = pessoas[i];
            if (i > 0) sb.Append(',');
            sb.Append("{\"id\":").Append(JsonLeve.Texto(p.Id.ToString("D")))
              .Append(",\"nome\":").Append(JsonLeve.Texto(p.GetAttributeValue<string>("cr40f_nomedopassageiro")))
              .Append(",\"foto\":").Append(JsonLeve.Texto(p.GetAttributeValue<string>("new_linkdafoto")))
              .Append(",\"telefone\":").Append(JsonLeve.Texto(p.GetAttributeValue<string>("cr40f_telefone")))
              .Append(",\"email\":").Append(JsonLeve.Texto(p.GetAttributeValue<string>("cr40f_email")))
              .Append('}');
        }
        return sb.Append("]}").ToString();
    }

    /// <summary>Filhos cr40f_servicosporpassageiro (por cr40f_ordemdeselecao); sem filhos, lookups passageiro1..4. Sem duplicatas.</summary>
    private List<Guid> IdsPassageiros(Entity reserva)
    {
        var q = new QueryExpression("cr40f_servicosporpassageiro") { ColumnSet = new ColumnSet("cr40f_bancodedados", "cr40f_ordemdeselecao") };
        q.Criteria.AddCondition("cr40f_geral", ConditionOperator.Equal, reserva.Id);
        q.AddOrder("cr40f_ordemdeselecao", OrderType.Ascending);
        var filhos = _sistema.RetrieveMultiple(q).Entities
            .OrderBy(e => e.GetAttributeValue<int?>("cr40f_ordemdeselecao") ?? int.MaxValue)
            .Select(e => e.GetAttributeValue<EntityReference>("cr40f_bancodedados")?.Id)
            .ToList();
        var origem = filhos.Count > 0 ? filhos : Enumerable.Range(1, 4).Select(n => reserva.GetAttributeValue<EntityReference>("cr40f_passageiro" + n)?.Id).ToList();
        return origem.Where(id => id is Guid g && g != Guid.Empty).Select(id => id!.Value).Distinct().ToList();
    }

    private void RevogarAnteriores(Guid reservaId, Guid? passageiroId)
    {
        var q = new QueryExpression("cr40f_linkcadastro") { ColumnSet = new ColumnSet("cr40f_status", "cr40f_passageiro") };
        q.Criteria.AddCondition("cr40f_reserva", ConditionOperator.Equal, reservaId);
        q.Criteria.AddCondition("cr40f_status", ConditionOperator.In, StatusLink.Ativo, StatusLink.UsadoParcialmente);
        foreach (var anterior in _sistema.RetrieveMultiple(q).Entities)
        {
            var st = anterior.GetAttributeValue<OptionSetValue>("cr40f_status")?.Value;
            if (st != StatusLink.Ativo && st != StatusLink.UsadoParcialmente) continue;
            if (anterior.GetAttributeValue<EntityReference>("cr40f_passageiro")?.Id != passageiroId) continue;
            _sistema.Update(new Entity("cr40f_linkcadastro", anterior.Id) { ["cr40f_status"] = new OptionSetValue(StatusLink.Revogado) });
        }
    }

    public static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    /// <summary>SHA-256 do token (UTF-8) em hex minúsculo; o Worker calcula igual.</summary>
    public static string Sha256Hex(string token)
    {
        using var sha = SHA256.Create();
        return string.Concat(sha.ComputeHash(Encoding.UTF8.GetBytes(token)).Select(b => b.ToString("x2")));
    }

    public static string Erro(string mensagem) => "{\"ok\":false,\"erro\":" + JsonLeve.Texto(mensagem) + "}";

    private static byte[] BytesAleatorios()
    {
        var bytes = new byte[32];
        using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes);
        return bytes;
    }
}
