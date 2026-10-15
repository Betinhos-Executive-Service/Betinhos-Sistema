using System.Collections.Generic;
using System.Linq;
using Cr40f.Documentos.Plugin;
using Xunit;

namespace Cr40f.Documentos.Plugin.Tests;

public class ResumoBuilderTests
{
    [Fact]
    public void Sem_dados_as_duas_categorias_aparecem_zeradas()
    {
        var resumo = ResumoBuilder.Montar(new List<TipoDoc>(), new List<Dono>(), new List<DocEmitido>(), "2026-10-19");

        Assert.Equal("2026-10-19", resumo.Hoje);
        Assert.Equal(new[] { "pessoas", "frota" }, resumo.Categorias.Select(c => c.Categoria));
        Assert.All(resumo.Categorias, c =>
        {
            Assert.Equal(0, c.Contagens.Vencido + c.Contagens.Vence7 + c.Contagens.Vence30 + c.Contagens.Vence60 + c.Contagens.Faltando);
            Assert.Empty(c.Urgentes);
        });
    }

    [Fact]
    public void Faltante_sai_com_validade_e_dias_nulos_e_detalhe_do_dono()
    {
        var tipo = new TipoDoc { Id = "t", Nome = "Seguro", Categoria = Categorias.Frota, TemValidade = true, ObrigatorioPara = new[] { Codigos.ObrigProprio }, Ativo = true };
        var dono = new Dono { Id = "v", Categoria = Categorias.Frota, Nome = "ABC1D23", Detalhe = "Toyota Corolla", ObrigKey = Codigos.ObrigProprio, Ativo = true };

        var item = ResumoBuilder.Montar(new[] { tipo }, new[] { dono }, new DocEmitido[0], "2026-10-19")
            .Categorias.Single(c => c.Categoria == Categorias.Frota).Urgentes.Single();

        Assert.Equal("ABC1D23", item.Dono);
        Assert.Equal("Toyota Corolla", item.Detalhe);
        Assert.Equal("Seguro", item.Tipo);
        Assert.Equal(Status.Faltando, item.Estado);
        Assert.Null(item.Validade);
        Assert.Null(item.Dias);
    }

    [Fact]
    public void Json_de_saida_segue_o_contrato_da_spec()
    {
        var tipo = new TipoDoc { Id = "t", Nome = "CNH", Categoria = Categorias.Pessoas, TemValidade = true, Ativo = true };
        var dono = new Dono { Id = "p", Categoria = Categorias.Pessoas, Nome = "Ana", Detalhe = "Motorista", ObrigKey = Codigos.ObrigMotorista, Ativo = true };
        var doc = new DocEmitido { Id = "d", TipoId = "t", DonoId = "p", Validade = "2026-10-15", Situacao = "vigente" };

        var json = Json.Serializar(ResumoBuilder.Montar(new[] { tipo }, new[] { dono }, new[] { doc }, "2026-10-19"));

        Assert.StartsWith("{\"hoje\":\"2026-10-19\",\"categorias\":[{\"categoria\":\"pessoas\",\"contagens\":{\"vencido\":1,\"vence7\":0,\"vence30\":0,\"vence60\":0,\"faltando\":0},\"urgentes\":[{\"dono\":\"Ana\",\"detalhe\":\"Motorista\",\"tipo\":\"CNH\",\"validade\":\"2026-10-15\",\"estado\":\"vencido\",\"dias\":-4,\"quantidade\":1}]}", json);
        Assert.Contains("{\"categoria\":\"frota\"", json);
    }

    [Fact]
    public void Faltantes_do_mesmo_dono_viram_uma_linha_com_quantidade()
    {
        var cnh = new TipoDoc { Id = "t1", Nome = "CNH", Ordem = 1, Categoria = Categorias.Pessoas, TemValidade = true, ObrigatorioPara = new[] { Codigos.ObrigMotorista }, Ativo = true };
        var aso = new TipoDoc { Id = "t2", Nome = "ASO", Ordem = 2, Categoria = Categorias.Pessoas, TemValidade = true, ObrigatorioPara = new[] { Codigos.ObrigMotorista }, Ativo = true };
        var dono = new Dono { Id = "p", Categoria = Categorias.Pessoas, Nome = "Alexandre", Detalhe = "Motorista", ObrigKey = Codigos.ObrigMotorista, Ativo = true };

        var cat = ResumoBuilder.Montar(new[] { cnh, aso }, new[] { dono }, new DocEmitido[0], "2026-10-19")
            .Categorias.Single(c => c.Categoria == Categorias.Pessoas);

        var item = cat.Urgentes.Single();
        Assert.Equal("Alexandre", item.Dono);
        Assert.Equal("CNH, ASO", item.Tipo);
        Assert.Equal(2, item.Quantidade);
        Assert.Equal(Status.Faltando, item.Estado);
        Assert.Equal(2, cat.Contagens.Faltando);
    }

    [Fact]
    public void Faltantes_de_donos_diferentes_saem_agrupados_na_ordem_do_nome()
    {
        var cnh = new TipoDoc { Id = "t1", Nome = "CNH", Ordem = 1, Categoria = Categorias.Pessoas, TemValidade = true, ObrigatorioPara = new[] { Codigos.ObrigMotorista }, Ativo = true };
        var aso = new TipoDoc { Id = "t2", Nome = "ASO", Ordem = 2, Categoria = Categorias.Pessoas, TemValidade = true, ObrigatorioPara = new[] { Codigos.ObrigMotorista }, Ativo = true };
        var bia = new Dono { Id = "b", Categoria = Categorias.Pessoas, Nome = "Bia", Detalhe = "Motorista", ObrigKey = Codigos.ObrigMotorista, Ativo = true };
        var ana = new Dono { Id = "a", Categoria = Categorias.Pessoas, Nome = "Ana", Detalhe = "Motorista", ObrigKey = Codigos.ObrigMotorista, Ativo = true };

        var urgentes = ResumoBuilder.Montar(new[] { cnh, aso }, new[] { bia, ana }, new DocEmitido[0], "2026-10-19")
            .Categorias.Single(c => c.Categoria == Categorias.Pessoas).Urgentes;

        Assert.Equal(new[] { "Ana", "Bia" }, urgentes.Select(u => u.Dono));
        Assert.All(urgentes, u => { Assert.Equal(2, u.Quantidade); Assert.Equal("CNH, ASO", u.Tipo); });
    }
}
