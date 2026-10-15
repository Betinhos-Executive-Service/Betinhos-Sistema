using System;
using System.Linq;
using Cr40f.Documentos.Plugin;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Cr40f.Documentos.Plugin.Tests;

public class DocumentosResumoPluginTests
{
    [Fact]
    public void Gerar_le_o_dataverse_e_devolve_o_resumo()
    {
        var veiculo = new Entity("cr40f_veiculos", Guid.NewGuid())
        {
            ["cr40f_placa"] = "ABC1D23",
            ["new_categoriadoveiculo"] = new OptionSetValue(Codigos.VeiculoProprio),
            ["cr40f_statusdoveiculo"] = new OptionSetValue(1),
        };
        var seguro = new Entity("cr40f_tipodocumento", Guid.NewGuid())
        {
            ["cr40f_name"] = "Seguro",
            ["cr40f_categoria"] = new OptionSetValue(Codigos.CategoriaFrota),
            ["cr40f_temvalidade"] = true,
            ["cr40f_obrigatoriopara"] = new OptionSetValueCollection { new OptionSetValue(Codigos.ObrigProprio) },
            ["statecode"] = new OptionSetValue(0),
        };
        var service = new FakeService().Com(veiculo, seguro);

        var resumo = Json.Ler<Resumo>(DocumentosResumoPlugin.Gerar(service, "2026-10-19"));

        Assert.Equal("2026-10-19", resumo.Hoje);
        var frota = resumo.Categorias.Single(c => c.Categoria == Categorias.Frota);
        Assert.Equal(1, frota.Contagens.Faltando);
        Assert.Equal("ABC1D23|Seguro|faltando", string.Join("|", frota.Urgentes.Single().Dono, frota.Urgentes.Single().Tipo, frota.Urgentes.Single().Estado));
    }

    [Fact]
    public void Documentos_sao_lidos_so_ativos_e_vigentes()
    {
        var service = new FakeService();

        DocumentosResumoPlugin.Gerar(service, "2026-10-19");

        var consulta = service.Consultas.Single(q => q.EntityName == "cr40f_documento");
        Assert.Contains(consulta.Criteria.Conditions, c => c.AttributeName == "statecode" && c.Operator == ConditionOperator.Equal && (int)c.Values[0] == 0);
        Assert.Contains(consulta.Criteria.Conditions, c => c.AttributeName == "cr40f_situacao" && (int)c.Values[0] == Codigos.SituacaoVigente);
    }

    [Fact]
    public void Hoje_informado_vale_como_data()
    {
        Assert.Equal("2026-10-19", DocumentosResumoPlugin.ResolverHoje(new DateTime(2026, 10, 19, 0, 0, 0, DateTimeKind.Utc), DateTime.UtcNow));
    }

    [Fact]
    public void Sem_hoje_usa_a_data_de_brasilia()
    {
        // 02:00 UTC de 20/10 ainda é 19/10 em Brasília (UTC-3).
        Assert.Equal("2026-10-19", DocumentosResumoPlugin.ResolverHoje(null, new DateTime(2026, 10, 20, 2, 0, 0, DateTimeKind.Utc)));
    }
}
