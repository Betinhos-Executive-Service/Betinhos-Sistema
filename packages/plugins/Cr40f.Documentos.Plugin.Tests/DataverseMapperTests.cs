using System;
using Cr40f.Documentos.Plugin;
using Microsoft.Xrm.Sdk;
using Xunit;

namespace Cr40f.Documentos.Plugin.Tests;

public class DataverseMapperTests
{
    [Fact]
    public void Tipo_le_multi_choice_categoria_e_estado()
    {
        var id = Guid.NewGuid();
        var e = new Entity("cr40f_tipodocumento", id)
        {
            ["cr40f_name"] = " Seguro ",
            ["cr40f_categoria"] = new OptionSetValue(Codigos.CategoriaFrota),
            ["cr40f_temvalidade"] = true,
            ["cr40f_obrigatoriopara"] = new OptionSetValueCollection { new OptionSetValue(100000002), new OptionSetValue(100000004) },
            ["cr40f_ordem"] = 2,
            ["statecode"] = new OptionSetValue(1),
        };

        var tipo = DataverseMapper.Tipo(e);

        Assert.Equal(id.ToString(), tipo.Id);
        Assert.Equal("Seguro", tipo.Nome);
        Assert.Equal(Categorias.Frota, tipo.Categoria);
        Assert.True(tipo.TemValidade);
        Assert.Equal(new[] { 100000002, 100000004 }, tipo.ObrigatorioPara);
        Assert.Equal(2, tipo.Ordem);
        Assert.False(tipo.Ativo);
    }

    [Fact]
    public void Funcionario_usa_apelido_rotulo_da_funcao_e_desligado()
    {
        var e = new Entity("cr40f_funcionarios", Guid.NewGuid())
        {
            ["new_apelido"] = "",
            ["cr40f_nomecompleto"] = "Ana Souza",
            ["cr40f_funcao"] = new OptionSetValue(Codigos.FuncaoMotorista),
            ["cr40f_status"] = new OptionSetValue(Codigos.FuncionarioDesligado),
        };
        e.FormattedValues["cr40f_funcao"] = "Motorista";

        var dono = DataverseMapper.Funcionario(e);

        Assert.Equal(Categorias.Pessoas, dono.Categoria);
        Assert.Equal("Ana Souza", dono.Nome);
        Assert.Equal("Motorista", dono.Detalhe);
        Assert.Equal(Codigos.ObrigMotorista, dono.ObrigKey);
        Assert.False(dono.Ativo);
    }

    [Fact]
    public void Veiculo_usa_placa_marca_modelo_e_vendido()
    {
        var e = new Entity("cr40f_veiculos", Guid.NewGuid())
        {
            ["cr40f_placa"] = "ABC1D23",
            ["cr40f_marca"] = "Toyota",
            ["cr40f_modelo"] = "Corolla",
            ["new_categoriadoveiculo"] = new OptionSetValue(Codigos.VeiculoProprio),
            ["cr40f_statusdoveiculo"] = new OptionSetValue(1),
        };

        var dono = DataverseMapper.Veiculo(e);

        Assert.Equal("ABC1D23", dono.Nome);
        Assert.Equal("Toyota Corolla", dono.Detalhe);
        Assert.Equal(Codigos.ObrigProprio, dono.ObrigKey);
        Assert.True(dono.Ativo);
    }

    [Fact]
    public void Documento_de_veiculo_com_datas_so_data()
    {
        var tipoId = Guid.NewGuid();
        var veiculoId = Guid.NewGuid();
        var e = new Entity("cr40f_documento", Guid.NewGuid())
        {
            ["cr40f_tipo"] = new EntityReference("cr40f_tipodocumento", tipoId),
            ["cr40f_veiculo"] = new EntityReference("cr40f_veiculos", veiculoId),
            ["cr40f_validade"] = new DateTime(2026, 12, 18),
            ["cr40f_situacao"] = new OptionSetValue(Codigos.SituacaoVigente),
            ["modifiedon"] = new DateTime(2026, 10, 1, 12, 0, 0, DateTimeKind.Utc),
        };

        var doc = DataverseMapper.Documento(e);

        Assert.Equal(tipoId.ToString(), doc.TipoId);
        Assert.Equal(veiculoId.ToString(), doc.DonoId);
        Assert.Equal(Categorias.Frota, doc.Categoria);
        Assert.Equal("2026-12-18", doc.Validade);
        Assert.Null(doc.Emissao);
        Assert.Equal("vigente", doc.Situacao);
        Assert.StartsWith("2026-10-01T12:00:00", doc.ModificadoEm);
    }
}
