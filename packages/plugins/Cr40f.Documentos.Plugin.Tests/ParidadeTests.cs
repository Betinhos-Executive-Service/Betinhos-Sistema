using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using Cr40f.Documentos.Plugin;
using Xunit;

namespace Cr40f.Documentos.Plugin.Tests;

[DataContract]
public sealed class FixtureParidade
{
    [DataMember(Name = "hoje")] public string Hoje { get; set; } = "";
    [DataMember(Name = "tipos")] public List<TipoDoc> Tipos { get; set; } = new();
    [DataMember(Name = "donos")] public List<Dono> Donos { get; set; } = new();
    [DataMember(Name = "docs")] public List<DocEmitido> Docs { get; set; } = new();
    [DataMember(Name = "esperado")] public EsperadoParidade Esperado { get; set; } = new();

    public static FixtureParidade Carregar() =>
        Json.Ler<FixtureParidade>(File.ReadAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Fixtures", "paridade.json")));
}

[DataContract]
public sealed class EsperadoParidade
{
    [DataMember(Name = "pessoas")] public EsperadoCategoria Pessoas { get; set; } = new();
    [DataMember(Name = "frota")] public EsperadoCategoria Frota { get; set; } = new();
}

[DataContract]
public sealed class EsperadoCategoria
{
    [DataMember(Name = "contagens")] public Contagens Contagens { get; set; } = new();
    [DataMember(Name = "urgentes")] public List<string> Urgentes { get; set; } = new();
}

public class ParidadeTests
{
    [Theory]
    [InlineData("pessoas")]
    [InlineData("frota")]
    public void Mesmas_contagens_e_mesma_lista_urgente_do_shell(string categoria)
    {
        var fixture = FixtureParidade.Carregar();
        var resumo = ResumoBuilder.Montar(fixture.Tipos, fixture.Donos, fixture.Docs, fixture.Hoje);
        var atual = resumo.Categorias.Single(c => c.Categoria == categoria);
        var esperado = categoria == Categorias.Frota ? fixture.Esperado.Frota : fixture.Esperado.Pessoas;

        Assert.Equal(Json.Serializar(esperado.Contagens), Json.Serializar(atual.Contagens));
        Assert.Equal(esperado.Urgentes, atual.Urgentes.Select(u => $"{u.Dono}|{u.Tipo}|{u.Estado}|{u.Dias}").ToList());
    }
}
