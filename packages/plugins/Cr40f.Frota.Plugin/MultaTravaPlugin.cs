using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin;

/// <summary>
/// Trava das multas (spec §5.3): pre-operation síncrono em Create e Update de cr40f_multas. Campo de passo só muda vindo da
/// cr40f_PassoMulta, conferida no ParentContext (o cliente não monta o contexto pai). Modo pela variável cr40f_MultasTravaModo:
/// "travar" recusa; qualquer outro valor (padrão "observar") só escreve no trace o que recusaria e de onde veio.
/// Correção de dados por administrador: bypass nativo de lógica customizada (BypassCustomPluginExecution).
/// </summary>
public sealed class MultaTravaPlugin : IPlugin
{
    public const string ModoVariavel = "cr40f_MultasTravaModo";

    public static readonly HashSet<string> CamposDePasso = new(StringComparer.OrdinalIgnoreCase)
    {
        "cr40f_status", "cr40f_responsavel", "cr40f_motivoempresa", "cr40f_canalindicacao", "cr40f_datadeavisoaocondutor", "cr40f_datadeindicacao",
        "cr40f_aceiteem", "cr40f_pagaem", "cr40f_acertoem", "cr40f_encerradaem", "cr40f_canceladaem", "cr40f_valorpago",
        "cr40f_competenciadesconto", "cr40f_motivocancelamento", "cr40f_contestadaem", "cr40f_aceitedeclaradoem", "cr40f_ultimolembreteaceiteem",
    };

    public static readonly IReadOnlyDictionary<string, string> CamposDasApisDoTermo = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["cr40f_aceitedeclaradoem"] = "new_DeclararAceiteMulta",
        ["cr40f_ultimolembreteaceiteem"] = "new_LembrarAceiteMulta",
    };

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        if (!(context.InputParameters.Contains("Target") && context.InputParameters["Target"] is Entity alvo)) return;
        var system = factory.CreateOrganizationService(null);
        var recusas = Avaliar(context, alvo, system);
        if (recusas.Count == 0) return;
        var travar = string.Equals(Variaveis.Ler(system, ModoVariavel)?.Trim(), "travar", StringComparison.OrdinalIgnoreCase);
        tracing.Trace("{0} multa {1} ({2}): {3} | origem: {4}", travar ? "Recusada" : "Recusaria", alvo.Id, context.MessageName, string.Join(" | ", recusas), Origem(context));
        if (travar) throw new InvalidPluginExecutionException(recusas[0]);
    }

    public static List<string> Avaliar(IPluginExecutionContext context, Entity alvo, IOrganizationService system)
    {
        var recusas = new List<string>();
        if (context.MessageName == "Create")
        {
            var auto = alvo.GetAttributeValue<string>("cr40f_novacoluna")?.Trim();
            if (string.IsNullOrEmpty(auto)) recusas.Add("Informe o número do auto de infração.");
            else if (AutoExiste(system, auto!)) recusas.Add($"Já existe multa com o auto {auto}.");
            if (!string.IsNullOrEmpty(auto)) alvo["cr40f_novacoluna"] = auto; // grava cortado, para a checagem de duplicata achar o valor depois
            var passos = alvo.Attributes.Where(a => a.Key != "cr40f_status" && CamposDePasso.Contains(a.Key) && a.Value != null).Select(a => a.Key).OrderBy(k => k, StringComparer.Ordinal).ToList();
            if (passos.Count > 0 && !VemDoPasso(context)) recusas.Add(Mensagem(passos));
            // Toda multa nova começa na etapa 1, nos dois modos (não é recusa: é o ponto de partida do passo a passo).
            alvo["cr40f_status"] = new OptionSetValue(MultaCodigos.Identificar);
            return recusas;
        }
        if (VemDoPasso(context)) return recusas;
        var pre = context.PreEntityImages.Contains("pre") ? context.PreEntityImages["pre"] : null;
        var mudou = alvo.Attributes
            .Where(a => CamposDePasso.Contains(a.Key) && !(CamposDasApisDoTermo.TryGetValue(a.Key, out var api) && TemPai(context, api)) && !MesmoValor(a.Value, pre != null && pre.Contains(a.Key) ? pre[a.Key] : null))
            .Select(a => a.Key).OrderBy(k => k, StringComparer.Ordinal).ToList();
        if (mudou.Count > 0) recusas.Add(Mensagem(mudou));
        return recusas;
    }

    public static bool VemDoPasso(IPluginExecutionContext context)
    {
        return TemPai(context, PassoMultaPlugin.Mensagem);
    }

    public static bool TemPai(IPluginExecutionContext context, params string[] mensagens)
    {
        for (var pai = context.ParentContext; pai != null; pai = pai.ParentContext)
            if (mensagens.Contains(pai.MessageName)) return true;
        return false;
    }

    private static string Mensagem(IEnumerable<string> campos) =>
        $"Os campos de passo da multa só mudam pelo passo a passo do Sistema Betinhos ({string.Join(", ", campos)}).";

    private static string Origem(IPluginExecutionContext context)
    {
        var cadeia = new List<string>();
        for (var pai = context.ParentContext; pai != null; pai = pai.ParentContext) cadeia.Add(pai.MessageName);
        return (cadeia.Count == 0 ? "gravação direta" : "dentro de " + string.Join(" < ", cadeia)) + $", usuário {context.InitiatingUserId}";
    }

    private static bool AutoExiste(IOrganizationService system, string auto)
    {
        var q = new QueryExpression(MultaMapper.Tabela) { ColumnSet = new ColumnSet(false), TopCount = 1 };
        q.Criteria.AddCondition("cr40f_novacoluna", ConditionOperator.Equal, auto);
        return system.RetrieveMultiple(q).Entities.Count > 0;
    }

    private static bool MesmoValor(object? novo, object? antigo) => (novo, antigo) switch
    {
        (null, null) => true,
        (OptionSetValue a, OptionSetValue b) => a.Value == b.Value,
        (EntityReference a, EntityReference b) => a.Id == b.Id,
        (Money a, Money b) => a.Value == b.Value,
        _ => Equals(novo, antigo),
    };
}
