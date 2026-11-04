using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.Serialization.Json;
using System.Text;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Protecao.Plugin;

// Classe e não record: record em net462 exige o polyfill IsExternalInit.
public sealed class Resultado
{
    public Resultado(IReadOnlyList<string> adicionados, IReadOnlyList<string> barrados) { Adicionados = adicionados; Barrados = barrados; }
    public IReadOnlyList<string> Adicionados { get; }
    public IReadOnlyList<string> Barrados { get; }
}

/// <summary>
/// Campos da reserva da Tenaris editados pela equipe ficam protegidos contra a sincronização.
/// A gravação da sincronização é reconhecida por trazer new_snapshotsharepoint (o Upsert_Geral do flow da Tenaris sempre manda).
/// </summary>
public static class ProtecaoCampos
{
    public const string Lista = "new_camposprotegidos";
    public const string Snapshot = "new_snapshotsharepoint";
    public static readonly string[] Monitorados =
    {
        "cr40f_destino", "cr40f_endereodesada", "cr40f_dataehorriodesada", "cr40f_obsdeoperao", "cr40f_horrioprevistoderetorno",
        "cr40f_status", "cr40f_trajeto", "cr40f_cr", "cr40f_idtenaris", "cr40f_tipodeveiculo",
    };
    static readonly string[] Vazio = new string[0];
    static readonly DataContractJsonSerializer LeitorSnapshot = new(typeof(Dictionary<string, string>), new DataContractJsonSerializerSettings { UseSimpleDictionaryFormat = true });

    public static Resultado Aplicar(Entity alvo, Entity? anterior)
    {
        var protegidos = LerLista(alvo.Contains(Lista) ? alvo.GetAttributeValue<string>(Lista) : anterior?.GetAttributeValue<string>(Lista));
        if (alvo.Contains(Snapshot))
        {
            var barrados = protegidos.Where(alvo.Contains).ToList();
            foreach (var campo in barrados) alvo.Attributes.Remove(campo);
            return new Resultado(Vazio, barrados);
        }
        var textoSnapshot = anterior?.GetAttributeValue<string>(Snapshot);
        if (string.IsNullOrWhiteSpace(textoSnapshot)) return new Resultado(Vazio, Vazio);
        var planilha = LerSnapshot(textoSnapshot!);
        var adicionados = Monitorados
            .Where(campo => alvo.Contains(campo) && !protegidos.Contains(campo))
            .Where(campo => !Igual(alvo[campo], planilha.TryGetValue(campo, out var texto) ? texto : Texto(anterior!.Contains(campo) ? anterior[campo] : null)))
            .ToList();
        if (adicionados.Count > 0) alvo[Lista] = string.Join(",", protegidos.Concat(adicionados));
        return new Resultado(adicionados, Vazio);
    }

    public static List<string> LerLista(string? texto) =>
        (texto ?? "").Split(',', ';').Select(nome => nome.Trim().ToLowerInvariant()).Where(nome => nome.Length > 0).Distinct().ToList();

    /// <summary>JSON plano campo → texto. Inválido vira vazio: cada campo passa a ser comparado com o valor anterior.</summary>
    static Dictionary<string, string> LerSnapshot(string json)
    {
        try
        {
            using var fluxo = new MemoryStream(Encoding.UTF8.GetBytes(json));
            return (Dictionary<string, string>?)LeitorSnapshot.ReadObject(fluxo) ?? new Dictionary<string, string>();
        }
        catch (Exception) { return new Dictionary<string, string>(); }
    }

    /// <summary>Valor do SDK no formato do snapshot: choice como número, data ISO UTC, lookup como id.</summary>
    static string? Texto(object? valor) => valor switch
    {
        null => null,
        OptionSetValue opcao => opcao.Value.ToString(CultureInfo.InvariantCulture),
        DateTime data => data.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture),
        EntityReference referencia => referencia.Id.ToString(),
        _ => Convert.ToString(valor, CultureInfo.InvariantCulture),
    };

    static bool Igual(object? valor, string? texto)
    {
        if (valor is DateTime data && !string.IsNullOrEmpty(texto))
            return DateTime.TryParse(texto, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var outra)
                && Math.Abs((data.ToUniversalTime() - outra).TotalMinutes) < 1;
        var atual = Texto(valor);
        return string.IsNullOrEmpty(texto) ? string.IsNullOrEmpty(atual) : string.Equals(atual, texto, StringComparison.Ordinal);
    }
}
