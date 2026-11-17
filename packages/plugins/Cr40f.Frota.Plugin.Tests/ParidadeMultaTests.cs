using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using Cr40f.Frota.Plugin;
using Xunit;

namespace Cr40f.Frota.Plugin.Tests;

[DataContract]
public sealed class FixtureMultas
{
    [DataMember(Name = "hoje")] public string Hoje { get; set; } = "";
    [DataMember(Name = "avaliacoes")] public List<CasoAvaliacao> Avaliacoes { get; set; } = new();
    [DataMember(Name = "validacoes")] public List<CasoValidacao> Validacoes { get; set; } = new();
    [DataMember(Name = "aplicacoes")] public List<CasoAplicacao> Aplicacoes { get; set; } = new();

    public static FixtureMultas Carregar() => Json.Ler<FixtureMultas>(File.ReadAllText(FixtureParidade.Caminho("Fixtures", "multa-etapas.json")));
}

[DataContract]
public sealed class CasoAvaliacao
{
    [DataMember(Name = "nome")] public string Nome { get; set; } = "";
    [DataMember(Name = "multa")] public MultaEstado Multa { get; set; } = new();
    [DataMember(Name = "etapa")] public string Etapa { get; set; } = "";
    [DataMember(Name = "pendentes")] public List<string> Pendentes { get; set; } = new();
    [DataMember(Name = "proximoPasso")] public string ProximoPasso { get; set; } = "";
    [DataMember(Name = "proximoPrazo")] public string? ProximoPrazo { get; set; }
    [DataMember(Name = "prazoVencido")] public bool PrazoVencido { get; set; }
    [DataMember(Name = "aguardandoPenalidade")] public bool AguardandoPenalidade { get; set; }
}

[DataContract]
public sealed class CasoValidacao
{
    [DataMember(Name = "nome")] public string Nome { get; set; } = "";
    [DataMember(Name = "multa")] public MultaEstado Multa { get; set; } = new();
    [DataMember(Name = "passo")] public string Passo { get; set; } = "";
    [DataMember(Name = "dados")] public DadosPasso? Dados { get; set; }
    [DataMember(Name = "erro")] public string? Erro { get; set; }
}

[DataContract]
public sealed class CasoAplicacao
{
    [DataMember(Name = "nome")] public string Nome { get; set; } = "";
    [DataMember(Name = "multa")] public MultaEstado Multa { get; set; } = new();
    [DataMember(Name = "passo")] public string Passo { get; set; } = "";
    [DataMember(Name = "dados")] public DadosPasso? Dados { get; set; }
    [DataMember(Name = "mudancas")] public List<string> Mudancas { get; set; } = new();
}

public class ParidadeMultaTests
{
    private static string Linha(string nome, string etapa, IEnumerable<string> pendentes, string passo, string? prazo, bool vencido, bool penalidade)
        => $"{nome} | {etapa} | {string.Join(",", pendentes)} | {passo} | {prazo ?? "null"} | {vencido} | {penalidade}";

    [Fact]
    public void Avalia_igual_ao_shell()
    {
        var f = FixtureMultas.Carregar();
        Assert.NotEmpty(f.Avaliacoes);
        foreach (var c in f.Avaliacoes)
        {
            var s = MultaEtapas.Avaliar(c.Multa, f.Hoje);
            Assert.Equal(Linha(c.Nome, c.Etapa, c.Pendentes, c.ProximoPasso, c.ProximoPrazo, c.PrazoVencido, c.AguardandoPenalidade),
                Linha(c.Nome, s.Etapa, s.Pendentes, s.ProximoPasso, s.ProximoPrazo, s.PrazoVencido, s.AguardandoPenalidade));
        }
    }

    [Fact]
    public void Valida_igual_ao_shell()
    {
        var f = FixtureMultas.Carregar();
        Assert.NotEmpty(f.Validacoes);
        foreach (var c in f.Validacoes)
            Assert.Equal($"{c.Nome}: {c.Erro ?? "ok"}", $"{c.Nome}: {MultaEtapas.Validar(c.Multa, c.Passo, c.Dados ?? new DadosPasso(), f.Hoje) ?? "ok"}");
    }

    [Fact]
    public void Aplica_igual_ao_shell()
    {
        var f = FixtureMultas.Carregar();
        Assert.NotEmpty(f.Aplicacoes);
        foreach (var c in f.Aplicacoes)
        {
            var dados = c.Dados ?? new DadosPasso();
            Assert.Null(MultaEtapas.Validar(c.Multa, c.Passo, dados, f.Hoje));
            var depois = MultaEtapas.Aplicar(c.Multa, c.Passo, dados, f.Hoje);
            var mudancas = MultaEtapas.Mudancas(c.Multa, depois).Select(m => $"{m.Key}={MultaEtapas.Formatar(m.Value)}").OrderBy(x => x, StringComparer.Ordinal);
            Assert.Equal($"{c.Nome}: {string.Join(" ", c.Mudancas)}", $"{c.Nome}: {string.Join(" ", mudancas)}");
        }
    }

    [Fact]
    public void Todo_passo_tem_rotulo()
    {
        Assert.All(Passos.Todos, p => Assert.True(MultaEtapas.RotuloPasso.ContainsKey(p), p));
    }

    [Fact]
    public void Aplicar_nao_muda_o_estado_de_entrada()
    {
        var antes = new MultaEstado { Status = MultaCodigos.Identificar };
        MultaEtapas.Aplicar(antes, Passos.DefinirResponsavel, new DadosPasso { Responsavel = "empresa" }, "2026-11-17");
        Assert.Equal(MultaCodigos.Identificar, antes.Status);
        Assert.Null(antes.Responsavel);
    }
}
