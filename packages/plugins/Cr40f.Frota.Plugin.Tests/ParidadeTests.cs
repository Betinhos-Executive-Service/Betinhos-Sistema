using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using Cr40f.Frota.Plugin;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

[DataContract]
public sealed class FixtureParidade
{
    [DataMember(Name = "hoje")] public string Hoje { get; set; } = "";
    [DataMember(Name = "agora")] public string Agora { get; set; } = "";
    [DataMember(Name = "veiculos")] public List<Veiculo> Veiculos { get; set; } = new();
    [DataMember(Name = "manutencoes")] public List<Manutencao> Manutencoes { get; set; } = new();
    [DataMember(Name = "itens")] public List<ItemPlano> Itens { get; set; } = new();
    [DataMember(Name = "baselines")] public List<Baseline> Baselines { get; set; } = new();
    [DataMember(Name = "esperado")] public List<string> Esperado { get; set; } = new();

    public static string Caminho(params string[] partes) => Path.Combine(new[] { AppDomain.CurrentDomain.BaseDirectory }.Concat(partes).ToArray());
    public static FixtureParidade Carregar() => Json.Ler<FixtureParidade>(File.ReadAllText(Caminho("Fixtures", "paridade.json")));
}

public class ParidadeTests
{
    [Fact]
    public void Mesmas_pendencias_do_shell()
    {
        var f = FixtureParidade.Carregar();
        var agora = DateTime.Parse(f.Agora, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal);
        var dados = new DadosFrota { Veiculos = f.Veiculos, Manutencoes = f.Manutencoes, Itens = f.Itens, Baselines = f.Baselines };
        var resultado = Regras.Avaliar(dados, f.Hoje, agora);
        Assert.Equal(f.Esperado, resultado.Pendencias.Select(p => $"{p.Tipo}|{p.Id}").OrderBy(s => s, StringComparer.Ordinal).ToList());
        Assert.Equal(resultado.Pendencias.Count, resultado.Total);
    }

    [Fact]
    public void Textos_para_email_e_agente()
    {
        var f = FixtureParidade.Carregar();
        var dados = new DadosFrota { Veiculos = f.Veiculos, Manutencoes = f.Manutencoes, Itens = f.Itens, Baselines = f.Baselines };
        var p = Regras.Avaliar(dados, f.Hoje, new DateTime(2026, 10, 20, 12, 0, 0, DateTimeKind.Utc)).Pendencias;
        var reinc = p.Single(x => x.Id == "reinc:v3:100000007");
        Assert.Equal("3ª vez: Pastilhas de freio", reinc.Titulo);
        Assert.Contains("120 dias", reinc.Detalhe);
        Assert.Contains("causa raiz", reinc.Detalhe);
        Assert.Contains("12 meses", p.Single(x => x.Id == "reinc:v4:100000002").Detalhe);
        Assert.Equal("Aguardando aprovação há 3 dias", p.Single(x => x.Id == "p1").Detalhe);
        Assert.Equal("Aprovada sem data há 6 dias", p.Single(x => x.Id == "p2").Detalhe);
        Assert.StartsWith("Vencida: vencida há 1.000 km", p.Single(x => x.Id == "v1:i-oleo").Detalhe);
        Assert.Equal("Última leitura do Infleet há 49 h", p.Single(x => x.Id == "hod:v2").Detalhe);
    }

    [Fact]
    public void Catalogo_igual_ao_json_do_shell()
    {
        var json = File.ReadAllText(FixtureParidade.Caminho("..", "..", "..", "..", "..", "..", "apps", "shell", "src", "pages", "frota", "domain", "manutencaoCatalogo.json"));
        var catalogo = Json.Ler<CatalogoJson>(json);
        Assert.Equal(catalogo.Servicos.ToDictionary(s => s.Value, s => s.Label), Catalogo.Servicos.ToDictionary(k => k.Key, k => k.Value));
    }
}

[DataContract]
public sealed class CatalogoJson
{
    [DataMember(Name = "servicos")] public List<ServicoJson> Servicos { get; set; } = new();
}

[DataContract]
public sealed class ServicoJson
{
    [DataMember(Name = "value")] public int Value { get; set; }
    [DataMember(Name = "label")] public string Label { get; set; } = "";
}
