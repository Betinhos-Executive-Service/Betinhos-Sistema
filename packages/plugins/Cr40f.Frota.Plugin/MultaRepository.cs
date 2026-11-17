using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin;

/// <summary>cr40f_multas ↔ MultaEstado. Datas de passo gravadas ao meio-dia UTC: o dia é o mesmo em São Paulo nas colunas
/// "Somente data" (novas) e "Fuso do usuário" (cr40f_datadeavisoaocondutor e cr40f_datadeindicacao, antigas).</summary>
public static class MultaMapper
{
    public const string Tabela = "cr40f_multas";

    public static readonly string[] Colunas =
    {
        "cr40f_novacoluna", "cr40f_placa", "cr40f_status", "cr40f_responsavel", "cr40f_motorista", "cr40f_motivoempresa", "cr40f_dataparaindicar",
        "cr40f_datadeavisoaocondutor", "cr40f_canalindicacao", "cr40f_datadeindicacao", "cr40f_indicado", "cr40f_aceiteem", "cr40f_vencimento",
        "cr40f_pagaem", "cr40f_valorpago", "cr40f_competenciadesconto", "cr40f_acertoem", "cr40f_encerradaem", "cr40f_canceladaem",
        "cr40f_motivocancelamento", "new_recursopendente",
    };

    /// <summary>Campo de MultaEstado (MultaEtapas.Mudancas) → coluna de cr40f_multas.</summary>
    public static readonly IReadOnlyDictionary<string, string> Coluna = new Dictionary<string, string>
    {
        ["status"] = "cr40f_status", ["responsavel"] = "cr40f_responsavel", ["motoristaId"] = "cr40f_motorista", ["motivoEmpresa"] = "cr40f_motivoempresa",
        ["dataAviso"] = "cr40f_datadeavisoaocondutor", ["canal"] = "cr40f_canalindicacao", ["dataIndicacao"] = "cr40f_datadeindicacao",
        ["indicado"] = "cr40f_indicado", ["aceiteEm"] = "cr40f_aceiteem", ["pagaEm"] = "cr40f_pagaem", ["valorPago"] = "cr40f_valorpago",
        ["competencia"] = "cr40f_competenciadesconto", ["acertoEm"] = "cr40f_acertoem", ["encerradaEm"] = "cr40f_encerradaem",
        ["canceladaEm"] = "cr40f_canceladaem", ["motivoCancelamento"] = "cr40f_motivocancelamento", ["recursoPendente"] = "new_recursopendente",
    };

    public static MultaEstado Estado(Entity e) => new()
    {
        Status = Opcao(e, "cr40f_status"),
        Responsavel = Opcao(e, "cr40f_responsavel"),
        MotoristaId = e.GetAttributeValue<EntityReference>("cr40f_motorista")?.Id.ToString(),
        MotivoEmpresa = Opcao(e, "cr40f_motivoempresa"),
        DataParaIndicar = Mapper.Dia(e, "cr40f_dataparaindicar"),
        DataAviso = Mapper.Dia(e, "cr40f_datadeavisoaocondutor"),
        Canal = Opcao(e, "cr40f_canalindicacao"),
        DataIndicacao = Mapper.Dia(e, "cr40f_datadeindicacao"),
        Indicado = e.Contains("cr40f_indicado") ? e.GetAttributeValue<bool>("cr40f_indicado") : null,
        AceiteEm = Mapper.Dia(e, "cr40f_aceiteem"),
        Vencimento = Mapper.Dia(e, "cr40f_vencimento"),
        PagaEm = Mapper.Dia(e, "cr40f_pagaem"),
        ValorPago = e.GetAttributeValue<Money>("cr40f_valorpago")?.Value,
        Competencia = Mapper.Dia(e, "cr40f_competenciadesconto"),
        AcertoEm = Mapper.Dia(e, "cr40f_acertoem"),
        EncerradaEm = Mapper.Dia(e, "cr40f_encerradaem"),
        CanceladaEm = Mapper.Dia(e, "cr40f_canceladaem"),
        MotivoCancelamento = e.GetAttributeValue<string>("cr40f_motivocancelamento"),
        RecursoPendente = e.Contains("new_recursopendente") ? e.GetAttributeValue<bool>("new_recursopendente") : null,
    };

    public static Entity Gravacao(Guid id, IEnumerable<KeyValuePair<string, object?>> mudancas)
    {
        var e = new Entity(Tabela, id);
        foreach (var m in mudancas)
        {
            e[Coluna[m.Key]] = m.Key switch
            {
                "motoristaId" => m.Value is string s && Guid.TryParse(s, out var g) ? new EntityReference("cr40f_funcionarios", g) : null,
                "valorPago" => m.Value is decimal d ? new Money(d) : null,
                "indicado" or "recursoPendente" or "motivoCancelamento" => m.Value,
                _ => m.Value switch { int i => new OptionSetValue(i), string dia => DataGravada(dia), _ => null },
            };
        }
        return e;
    }

    public static DateTime DataGravada(string dia) =>
        DateTime.SpecifyKind(DateTime.ParseExact(dia, "yyyy-MM-dd", CultureInfo.InvariantCulture).AddHours(12), DateTimeKind.Utc);

    private static int? Opcao(Entity e, string coluna) => e.GetAttributeValue<OptionSetValue>(coluna)?.Value;
}

/// <summary>Multa aberta com o que o e-mail e a tarefa mostram.</summary>
public sealed class MultaResumo
{
    public Guid Id { get; set; }
    public string Auto { get; set; } = "";
    public string? Placa { get; set; }
    public string? Motorista { get; set; }
    public MultaEstado Estado { get; set; } = new();

    public static MultaResumo De(Entity e) => new()
    {
        Id = e.Id,
        Auto = e.GetAttributeValue<string>("cr40f_novacoluna") ?? "sem número",
        Placa = e.GetAttributeValue<EntityReference>("cr40f_placa")?.Name,
        Motorista = e.GetAttributeValue<EntityReference>("cr40f_motorista")?.Name,
        Estado = MultaMapper.Estado(e),
    };
}

public sealed class MultaRepository
{
    private readonly IOrganizationService _service;
    public MultaRepository(IOrganizationService service) => _service = service;

    /// <summary>Etapas 1 a 4, ativas (statecode 0), inclusive as antigas sem tarefa.</summary>
    public List<MultaResumo> Abertas()
    {
        var q = new QueryExpression(MultaMapper.Tabela) { ColumnSet = new ColumnSet(MultaMapper.Colunas), PageInfo = new PagingInfo { Count = 5000, PageNumber = 1 } };
        q.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        q.Criteria.AddCondition("cr40f_status", ConditionOperator.In, MultaCodigos.Identificar, MultaCodigos.Indicar, MultaCodigos.Pagar, MultaCodigos.Acertar);
        return Paginas.Todas(_service, q).Select(MultaResumo.De).ToList();
    }
}

public static class Paginas
{
    public static IEnumerable<Entity> Todas(IOrganizationService service, QueryExpression consulta)
    {
        while (true)
        {
            var pagina = service.RetrieveMultiple(consulta);
            foreach (var linha in pagina.Entities) yield return linha;
            if (!pagina.MoreRecords || consulta.PageInfo == null) yield break;
            consulta.PageInfo.PageNumber++;
            consulta.PageInfo.PagingCookie = pagina.PagingCookie;
        }
    }
}
