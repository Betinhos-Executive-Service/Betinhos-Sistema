using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Frota.Plugin;

/// <summary>Carrega as tabelas da frota e converte para o modelo, com as regras de apps/shell/src/pages/frota/data/mappers.ts.</summary>
public sealed class FrotaRepository
{
    private readonly IOrganizationService _service;

    public FrotaRepository(IOrganizationService service) => _service = service;

    public DadosFrota Carregar(string hoje)
    {
        var dados = new DadosFrota();

        var veiculos = Consulta("cr40f_veiculos", "cr40f_placa", "cr40f_statusdoveiculo", "new_categoriadoveiculo", "cr40f_hodometro", "cr40f_hodometroem");
        veiculos.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        dados.Veiculos.AddRange(Todos(veiculos).Select(Mapper.Veiculo));

        // Reincidência olha 12 meses; preventiva precisa da última execução, que pode ser mais antiga: sem corte por data.
        var manut = Consulta("cr40f_manutencoes", "cr40f_descricao", "cr40f_status", "cr40f_graudamanutencao", "cr40f_agendarpara", "cr40f_datamanutencao", "createdon", "cr40f_kmatual", "cr40f_valor", "cr40f_estabelecimento", "cr40f_placa_carro", "new_servicosmanutencao");
        manut.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        dados.Manutencoes.AddRange(Todos(manut).Select(Mapper.Manutencao));

        dados.Itens.AddRange(Todos(Consulta("cr40f_itemplanopreventivo", "cr40f_name", "cr40f_servico", "cr40f_intervalokm", "cr40f_intervalomeses", "cr40f_avisokm", "cr40f_avisodias", "statecode")).Select(Mapper.Item));
        dados.Baselines.AddRange(Todos(Consulta("cr40f_baselinepreventiva", "cr40f_veiculo", "cr40f_item", "cr40f_km", "cr40f_data")).Select(Mapper.Baseline));
        return dados;
    }

    private static QueryExpression Consulta(string tabela, params string[] colunas) => new(tabela)
    {
        ColumnSet = new ColumnSet(colunas),
        PageInfo = new PagingInfo { Count = 5000, PageNumber = 1 },
    };

    private IEnumerable<Entity> Todos(QueryExpression consulta)
    {
        while (true)
        {
            var pagina = _service.RetrieveMultiple(consulta);
            foreach (var linha in pagina.Entities) yield return linha;
            if (!pagina.MoreRecords) yield break;
            consulta.PageInfo.PageNumber++;
            consulta.PageInfo.PagingCookie = pagina.PagingCookie;
        }
    }
}

public static class Mapper
{
    public static Veiculo Veiculo(Entity e) => new()
    {
        Id = e.Id.ToString(),
        Placa = e.GetAttributeValue<string>("cr40f_placa") ?? "",
        Status = e.GetAttributeValue<OptionSetValue>("cr40f_statusdoveiculo")?.Value,
        Categoria = e.GetAttributeValue<OptionSetValue>("new_categoriadoveiculo")?.Value,
        Hodometro = Numero(e, "cr40f_hodometro"),
        HodometroEm = e.GetAttributeValue<DateTime?>("cr40f_hodometroem")?.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture),
    };

    public static Manutencao Manutencao(Entity e)
    {
        var veiculo = e.GetAttributeValue<EntityReference>("cr40f_placa_carro");
        return new Manutencao
        {
            Id = e.Id.ToString(),
            Descricao = e.GetAttributeValue<string>("cr40f_descricao") ?? "",
            Status = e.GetAttributeValue<OptionSetValue>("cr40f_status")?.Value,
            Grau = e.GetAttributeValue<OptionSetValue>("cr40f_graudamanutencao")?.Value,
            AgendarPara = Dia(e, "cr40f_agendarpara"),
            DataManutencao = Dia(e, "cr40f_datamanutencao"),
            CriadoEm = Dia(e, "createdon") ?? "1900-01-01",
            Km = Numero(e, "cr40f_kmatual"),
            Valor = e.GetAttributeValue<Money>("cr40f_valor")?.Value ?? Numero(e, "cr40f_valor"),
            Estabelecimento = e.GetAttributeValue<string>("cr40f_estabelecimento"),
            VeiculoId = veiculo?.Id.ToString(),
            VeiculoLabel = veiculo?.Name,
            Servicos = e.GetAttributeValue<OptionSetValueCollection>("new_servicosmanutencao")?.Select(o => o.Value).ToList() ?? new List<int>(),
        };
    }

    public static ItemPlano Item(Entity e) => new()
    {
        Id = e.Id.ToString(),
        Nome = e.GetAttributeValue<string>("cr40f_name") ?? "",
        Servico = e.GetAttributeValue<OptionSetValue>("cr40f_servico")?.Value ?? e.GetAttributeValue<int?>("cr40f_servico"),
        IntervaloKm = Numero(e, "cr40f_intervalokm"),
        IntervaloMeses = e.GetAttributeValue<int?>("cr40f_intervalomeses"),
        AvisoKm = Numero(e, "cr40f_avisokm") ?? Codigos.AvisoKmPadrao,
        AvisoDias = e.GetAttributeValue<int?>("cr40f_avisodias") ?? Codigos.AvisoDiasPadrao,
        Ativo = e.GetAttributeValue<OptionSetValue>("statecode")?.Value is null or 0,
    };

    public static Baseline Baseline(Entity e) => new()
    {
        VeiculoId = e.GetAttributeValue<EntityReference>("cr40f_veiculo")?.Id.ToString(),
        ItemId = e.GetAttributeValue<EntityReference>("cr40f_item")?.Id.ToString(),
        Km = Numero(e, "cr40f_km"),
        Data = Dia(e, "cr40f_data"),
    };

    /// <summary>Inteiro, decimal ou double (o tipo da coluna varia entre tabelas antigas e novas).</summary>
    private static decimal? Numero(Entity e, string campo) => e.Contains(campo) ? e[campo] switch
    {
        int i => i, decimal d => d, double x => (decimal)x, Money m => m.Value, _ => null,
    } : null;

    /// <summary>
    /// Dia em São Paulo. Data sem hora (meia-noite UTC, colunas "Somente data") fica como está; data e hora volta 3 h
    /// (Brasília sem horário de verão desde 2019), como o diaSP do shell.
    /// </summary>
    public static string? Dia(Entity e, string campo)
    {
        var valor = e.GetAttributeValue<DateTime?>(campo);
        if (valor is not DateTime d) return null;
        var utc = d.Kind == DateTimeKind.Local ? d.ToUniversalTime() : d;
        var dia = utc.TimeOfDay == TimeSpan.Zero ? utc : utc.AddHours(-3);
        return dia.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }
}
