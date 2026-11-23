// Resolução da configuração do App Motoristas (catálogo + regra de resolução + comparação de matrizes).
// ARQUIVO AUTÔNOMO: só usa a BCL (sem Xrm, sem JsonLeve, sem tipos do plugin), para ser copiado inteiro para outro assembly
// (Betinhos.DriverRecordSharing, na fase B), como já acontece com o SecretReader.cs. Mantenha-o assim.
// Paridade: packages/app-config (TypeScript) e este arquivo são conferidos contra packages/app-config/casos.json.
// Cópia idêntica em Betinhos.DriverRecordSharing/AppConfigResolver.cs (teste AppConfigCopiaTests); mude os dois juntos.
#nullable enable
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace Cr40f.AppConfig;

public sealed class ChaveCatalogo
{
    public string Chave { get; }
    public string Rotulo { get; }
    /// <summary>"modulo" ou "funcao".</summary>
    public string Tipo { get; }
    /// <summary>Chave do módulo pai (a função só vale com ele ligado); null nos módulos.</summary>
    public string? Pai { get; }
    /// <summary>Sempre ligada: não aceita desligar na matriz nem exceção.</summary>
    public bool Fixa { get; }
    public bool Sensivel { get; }
    public bool PadraoProprio { get; }
    public bool PadraoTerceiro { get; }
    public bool PadraoAdmin { get; }

    public ChaveCatalogo(string chave, string rotulo, string tipo, string? pai, bool fixa, bool sensivel, bool padraoProprio, bool padraoTerceiro, bool padraoAdmin)
    {
        Chave = chave; Rotulo = rotulo; Tipo = tipo; Pai = pai; Fixa = fixa; Sensivel = sensivel;
        PadraoProprio = padraoProprio; PadraoTerceiro = padraoTerceiro; PadraoAdmin = padraoAdmin;
    }

    public bool Padrao(string perfil) => perfil == AppConfigResolver.Terceiro ? PadraoTerceiro : PadraoProprio;
}

public static class AppConfigCatalogo
{
    public static readonly IReadOnlyList<ChaveCatalogo> Chaves = new List<ChaveCatalogo>
    {
        new("services", "Serviços", "modulo", null, true, false, true, true, true),
        new("comunicados", "Comunicados", "modulo", null, true, false, true, true, true),
        new("history", "Histórico", "modulo", null, false, false, true, true, true),
        new("checklists", "Checklists", "modulo", null, false, false, true, true, true),
        new("multas", "Multas", "modulo", null, false, true, false, false, true),
        new("treinamentos", "Treinamentos", "modulo", null, false, false, true, true, true),
        new("postosProximos", "Postos próximos", "modulo", null, false, false, true, true, true),
        new("maintenancePhoto", "Manutenção", "modulo", null, false, false, true, true, true),
        new("expenses", "Gastos", "modulo", null, false, false, true, true, true),
        new("collisions", "Colisões", "modulo", null, false, false, true, true, true),
        new("minhaNota", "Minha nota", "modulo", null, false, false, true, true, true),
        new("ideas", "Boas ideias", "modulo", null, false, false, true, true, true),
        new("services.qrCharge", "Cobrar por QR", "funcao", "services", false, true, false, false, true),
        new("services.personalReceipt", "Recibo personalizado", "funcao", "services", false, true, false, false, true),
    };

    public static ChaveCatalogo? Buscar(string? chave) => Chaves.FirstOrDefault(c => c.Chave == chave);
}

/// <summary>Valores por perfil da versão publicada. Administrador (piloto) não entra: é sempre tudo ligado.</summary>
public sealed class AppConfigMatriz
{
    public Dictionary<string, bool> Proprio { get; } = new();
    public Dictionary<string, bool> Terceiro { get; } = new();

    public Dictionary<string, bool> Do(string perfil) => perfil == AppConfigResolver.Terceiro ? Terceiro : Proprio;

    /// <summary>Sem nenhum valor nos dois perfis = nunca houve publicação: vale o padrão do catálogo.</summary>
    public bool Vazia => Proprio.Count == 0 && Terceiro.Count == 0;
}

public sealed class AppConfigExcecao
{
    public string Chave { get; set; } = "";
    public bool Ligado { get; set; }
    /// <summary>yyyy-MM-dd; vazia = sem validade. Vale até o fim desse dia (America/Sao_Paulo).</summary>
    public string? Validade { get; set; }
    /// <summary>Exceção encerrada (cr40f_encerradoem preenchido) nunca vale.</summary>
    public bool Encerrada { get; set; }
}

public sealed class AppConfigPessoa
{
    /// <summary>cr40f_tipodevinculo: 1 = Terceiro; 0, vazio ou qualquer outro valor = Próprio.</summary>
    public int? Vinculo { get; set; }
    public bool Piloto { get; set; }
    /// <summary>Mais recente por último: havendo duas vigentes para a mesma chave, vale a última.</summary>
    public List<AppConfigExcecao> Excecoes { get; } = new();
}

public sealed class AppConfigResolucao
{
    public bool Ligado { get; }
    /// <summary>fixa, excecao, piloto, perfil, padrao ou modulo-pai.</summary>
    public string Origem { get; }
    public AppConfigResolucao(bool ligado, string origem) { Ligado = ligado; Origem = origem; }
}

public sealed class AppConfigEfetiva
{
    public int? Versao { get; set; }
    public string Perfil { get; set; } = AppConfigResolver.Proprio;
    public bool Piloto { get; set; }
    public bool SemVinculo { get; set; }
    /// <summary>Na ordem do catálogo.</summary>
    public List<string> Ordem { get; } = new();
    public Dictionary<string, bool> Chaves { get; } = new();
    public Dictionary<string, string> Origens { get; } = new();

    public string ToJson()
    {
        var sb = new StringBuilder("{");
        sb.Append("\"versao\":").Append(Versao.HasValue ? Versao.Value.ToString(CultureInfo.InvariantCulture) : "null");
        sb.Append(",\"perfil\":\"").Append(Perfil).Append('"');
        sb.Append(",\"piloto\":").Append(Piloto ? "true" : "false");
        sb.Append(",\"semVinculo\":").Append(SemVinculo ? "true" : "false");
        sb.Append(",\"chaves\":{");
        for (var i = 0; i < Ordem.Count; i++) sb.Append(i > 0 ? "," : "").Append('"').Append(Ordem[i]).Append("\":").Append(Chaves[Ordem[i]] ? "true" : "false");
        sb.Append("},\"origens\":{");
        for (var i = 0; i < Ordem.Count; i++) sb.Append(i > 0 ? "," : "").Append('"').Append(Ordem[i]).Append("\":\"").Append(Origens[Ordem[i]]).Append('"');
        return sb.Append("}}").ToString();
    }
}

public sealed class AppConfigMudanca
{
    public string Chave { get; }
    public string Perfil { get; }
    public bool De { get; }
    public bool Para { get; }
    public AppConfigMudanca(string chave, string perfil, bool de, bool para) { Chave = chave; Perfil = perfil; De = de; Para = para; }
}

public sealed class AppConfigErro
{
    /// <summary>CHAVE_INVALIDA ou CHAVE_FIXA.</summary>
    public string Codigo { get; }
    public string Chave { get; }
    public string Perfil { get; }
    public AppConfigErro(string codigo, string chave, string perfil) { Codigo = codigo; Chave = chave; Perfil = perfil; }
}

public static class AppConfigResolver
{
    public const string Proprio = "proprio";
    public const string Terceiro = "terceiro";
    public static readonly string[] Perfis = { Proprio, Terceiro };

    public static string PerfilDoVinculo(int? vinculo) => vinculo == 1 ? Terceiro : Proprio;

    /// <summary>Vínculo vazio ou fora de 0/1: vale como Próprio, e a tela avisa.</summary>
    public static bool SemVinculo(int? vinculo) => vinculo != 0 && vinculo != 1;

    /// <summary>Valor de uma chave na matriz, sem pessoa. Matriz vazia ou ausente = padrão do catálogo; chave ausente numa matriz com conteúdo = ligada.</summary>
    public static AppConfigResolucao ValorNaMatriz(AppConfigMatriz? matriz, string perfil, ChaveCatalogo item)
    {
        if (item.Fixa) return new AppConfigResolucao(true, "fixa");
        if (matriz is null || matriz.Vazia) return new AppConfigResolucao(item.Padrao(perfil), "padrao");
        return new AppConfigResolucao(matriz.Do(perfil).TryGetValue(item.Chave, out var valor) ? valor : true, "perfil");
    }

    private static bool Vigente(AppConfigExcecao excecao, string hoje)
        => !excecao.Encerrada && (string.IsNullOrEmpty(excecao.Validade) || string.CompareOrdinal(excecao.Validade, hoje) >= 0);

    /// <summary>Ordem: chave fixa, exceção vigente, piloto, perfil pelo vínculo, e a função exige o módulo pai ligado. "hoje" (yyyy-MM-dd, America/Sao_Paulo) entra de fora.</summary>
    public static AppConfigResolucao Resolver(string chave, AppConfigMatriz? matriz, AppConfigPessoa? pessoa, string hoje)
    {
        var item = AppConfigCatalogo.Buscar(chave) ?? throw new ArgumentOutOfRangeException(nameof(chave), "Chave fora do catálogo: " + chave);
        var baseado = SemPai(item, matriz, pessoa, hoje);
        if (item.Pai is not null && baseado.Ligado && !Resolver(item.Pai, matriz, pessoa, hoje).Ligado) return new AppConfigResolucao(false, "modulo-pai");
        return baseado;
    }

    private static AppConfigResolucao SemPai(ChaveCatalogo item, AppConfigMatriz? matriz, AppConfigPessoa? pessoa, string hoje)
    {
        if (item.Fixa) return new AppConfigResolucao(true, "fixa");
        if (pessoa is not null)
        {
            var excecao = pessoa.Excecoes.LastOrDefault(e => e.Chave == item.Chave && Vigente(e, hoje));
            if (excecao is not null) return new AppConfigResolucao(excecao.Ligado, "excecao");
            if (pessoa.Piloto) return new AppConfigResolucao(true, "piloto");
        }
        return ValorNaMatriz(matriz, PerfilDoVinculo(pessoa?.Vinculo), item);
    }

    /// <summary>Configuração efetiva inteira de um motorista (o que o App recebe e o preview simula).</summary>
    public static AppConfigEfetiva Efetiva(AppConfigMatriz? matriz, AppConfigPessoa? pessoa, string hoje, int? versao)
    {
        var r = new AppConfigEfetiva { Versao = versao, Perfil = PerfilDoVinculo(pessoa?.Vinculo), Piloto = pessoa?.Piloto ?? false, SemVinculo = SemVinculo(pessoa?.Vinculo) };
        foreach (var item in AppConfigCatalogo.Chaves)
        {
            var x = Resolver(item.Chave, matriz, pessoa, hoje);
            r.Ordem.Add(item.Chave); r.Chaves[item.Chave] = x.Ligado; r.Origens[item.Chave] = x.Origem;
        }
        return r;
    }

    /// <summary>O que muda entre duas matrizes (valores resolvidos, não o JSON). Chaves fixas não mudam.</summary>
    public static List<AppConfigMudanca> Comparar(AppConfigMatriz? antes, AppConfigMatriz? depois)
    {
        var mudancas = new List<AppConfigMudanca>();
        foreach (var item in AppConfigCatalogo.Chaves)
        {
            if (item.Fixa) continue;
            foreach (var perfil in Perfis)
            {
                var de = ValorNaMatriz(antes, perfil, item).Ligado;
                var para = ValorNaMatriz(depois, perfil, item).Ligado;
                if (de != para) mudancas.Add(new AppConfigMudanca(item.Chave, perfil, de, para));
            }
        }
        return mudancas;
    }

    /// <summary>Chave fora do catálogo ou chave fixa desligada. Lista vazia = matriz aceita.</summary>
    public static List<AppConfigErro> Validar(AppConfigMatriz matriz)
    {
        var erros = new List<AppConfigErro>();
        foreach (var perfil in Perfis)
        {
            foreach (var par in matriz.Do(perfil))
            {
                var item = AppConfigCatalogo.Buscar(par.Key);
                if (item is null) erros.Add(new AppConfigErro("CHAVE_INVALIDA", par.Key, perfil));
                else if (item.Fixa && !par.Value) erros.Add(new AppConfigErro("CHAVE_FIXA", par.Key, perfil));
            }
        }
        return erros;
    }

    /// <summary>yyyy-MM-dd em America/Sao_Paulo. Sem horário de verão desde 2019; tenta o fuso do sistema e cai em UTC-3.</summary>
    public static string HojeSaoPaulo(DateTime agoraUtc)
    {
        var utc = DateTime.SpecifyKind(agoraUtc, DateTimeKind.Utc);
        foreach (var id in new[] { "E. South America Standard Time", "America/Sao_Paulo" })
        {
            try { return TimeZoneInfo.ConvertTimeFromUtc(utc, TimeZoneInfo.FindSystemTimeZoneById(id)).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture); }
            catch (TimeZoneNotFoundException) { }
            catch (InvalidTimeZoneException) { }
        }
        return utc.AddHours(-3).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }
}

/// <summary>
/// Transição sem perda (fase B2): a coluna legada da ficha vale uma exceção implícita "ligado" da chave equivalente,
/// só enquanto NÃO existe linha de exceção (vigente ou encerrada) dessa chave para a pessoa. Quem monta a pessoa chama aqui.
/// </summary>
public static class AppConfigLegado
{
    public const string ColunaCobrarQr = "cr40f_podecobrarqrcode";
    public const string ColunaReciboPersonalizado = "cr40f_gerarrecibopersonalizado";
    public const string ChaveCobrarQr = "services.qrCharge";
    public const string ChaveReciboPersonalizado = "services.personalReceipt";

    public static void Aplicar(AppConfigPessoa pessoa, bool podeCobrarQr, bool geraReciboPersonalizado)
    {
        Aplicar(pessoa, ChaveCobrarQr, podeCobrarQr);
        Aplicar(pessoa, ChaveReciboPersonalizado, geraReciboPersonalizado);
    }

    private static void Aplicar(AppConfigPessoa pessoa, string chave, bool colunaSim)
    {
        if (!colunaSim || pessoa.Excecoes.Any(e => e.Chave == chave)) return;
        pessoa.Excecoes.Insert(0, new AppConfigExcecao { Chave = chave, Ligado = true });
    }
}
