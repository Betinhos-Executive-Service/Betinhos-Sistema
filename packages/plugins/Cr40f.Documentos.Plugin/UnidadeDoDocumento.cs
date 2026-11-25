using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Documentos.Plugin;

/// <summary>Raiz e unidade "Frota" (filha direta da raiz, ativa, lida por nome). Frota nula = antes do corte ou desfeito.</summary>
public sealed class Unidades
{
    public const string NomeFrota = "Frota";
    public Guid Raiz { get; }
    public Guid? Frota { get; }
    public Unidades(Guid raiz, Guid? frota) { Raiz = raiz; Frota = frota; }

    public static Unidades Ler(IOrganizationService service)
    {
        var q = new QueryExpression("businessunit") { ColumnSet = new ColumnSet("name", "parentbusinessunitid", "isdisabled") };
        var bus = service.RetrieveMultiple(q).Entities;
        var raizes = bus.Where(b => b.GetAttributeValue<EntityReference?>("parentbusinessunitid") == null).ToList();
        if (raizes.Count != 1) throw new InvalidPluginExecutionException($"Unidade raiz não encontrada ({raizes.Count}).");
        var raiz = raizes[0].Id;
        var frotas = bus.Where(b =>
            b.GetAttributeValue<EntityReference?>("parentbusinessunitid")?.Id == raiz
            && !b.GetAttributeValue<bool>("isdisabled")
            && string.Equals(b.GetAttributeValue<string>("name"), NomeFrota, StringComparison.OrdinalIgnoreCase)).ToList();
        if (frotas.Count > 1) throw new InvalidPluginExecutionException("Há mais de uma unidade Frota ativa; corrija antes de gravar documentos.");
        return new Unidades(raiz, frotas.Count == 1 ? frotas[0].Id : (Guid?)null);
    }
}

public static class UnidadeDoDocumento
{
    static EntityReference? Campo(Entity alvo, Entity? antes, string nome)
        => alvo.Contains(nome) ? alvo.GetAttributeValue<EntityReference?>(nome) : antes?.GetAttributeValue<EntityReference?>(nome);

    /// <summary>Unidade a gravar em owningbusinessunit, ou null para não mexer.</summary>
    public static Guid? Decidir(string mensagem, Entity alvo, Entity? antes, Unidades unidades)
    {
        if (unidades.Frota == null) return null;
        var funcionario = Campo(alvo, antes, "cr40f_funcionario");
        var veiculo = Campo(alvo, antes, "cr40f_veiculo");
        Guid? destino = funcionario != null ? unidades.Raiz : veiculo != null ? unidades.Frota : (Guid?)null;
        if (destino == null) return null;
        if (mensagem == "Create" || alvo.Contains("ownerid")) return destino;
        var atual = antes?.GetAttributeValue<EntityReference?>("owningbusinessunit")?.Id;
        return atual == destino ? (Guid?)null : destino;
    }
}
