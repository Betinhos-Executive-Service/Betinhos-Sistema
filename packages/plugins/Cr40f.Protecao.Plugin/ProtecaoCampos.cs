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
    public const string Status = "cr40f_status";
    /// <summary>Cancelado em cr40f_reservadeveculos.cr40f_status, o valor que a Tenaris manda.</summary>
    public const int Cancelado = 202410002;
    /// <summary>Cancelado e Cancelado com Ressalvas.</summary>
    static readonly int[] JaCancelados = { Cancelado, 202410010 };
    public static readonly string[] Monitorados =
    {
        "cr40f_destino", "cr40f_endereodesada", "cr40f_dataehorriodesada", "cr40f_obsdeoperao", "cr40f_horrioprevistoderetorno",
        "cr40f_status", "cr40f_trajeto", "cr40f_cr", "cr40f_idtenaris", "cr40f_tipodeveiculo",
    };
    static readonly DataContractJsonSerializer LeitorSnapshot = new(typeof(Dictionary<string, string>), new DataContractJsonSerializerSettings { UseSimpleDictionaryFormat = true });

    public static Resultado Aplicar(Entity alvo, Entity? anterior)
    {
        var protegidos = LerLista(alvo.Contains(Lista) ? alvo.GetAttributeValue<string>(Lista) : anterior?.GetAttributeValue<string>(Lista));
        if (alvo.Contains(Snapshot))
        {
            if (CancelamentoDaTenaris(alvo, anterior, protegidos))
            {
                protegidos.Remove(Status);
                alvo[Lista] = protegidos.Count > 0 ? string.Join(",", protegidos) : null;
            }
            var barrados = protegidos.Where(alvo.Contains).ToList();
            foreach (var campo in barrados) alvo.Attributes.Remove(campo);
            return new Resultado(Array.Empty<string>(), barrados);
        }
        var textoSnapshot = anterior?.GetAttributeValue<string>(Snapshot);
        if (string.IsNullOrWhiteSpace(textoSnapshot)) return new Resultado(Array.Empty<string>(), Array.Empty<string>());
        var planilha = LerSnapshot(textoSnapshot!);
        var adicionados = Monitorados
            .Where(campo => alvo.Contains(campo) && !protegidos.Contains(campo))
            .Where(campo => !Igual(alvo[campo], planilha.TryGetValue(campo, out var texto) ? texto : Texto(anterior!.GetAttributeValue<object>(campo))))
            .ToList();
        if (adicionados.Count > 0) alvo[Lista] = string.Join(",", protegidos.Concat(adicionados));
        return new Resultado(adicionados, Array.Empty<string>());
    }

    /// <summary>
    /// Exceção à trava (pedido do Renan, 25/11/2026): Cancelado vindo da Tenaris passa por cima do status editado pela equipe
    /// e o status sai da lista. Se a reserva já está cancelada (Cancelado ou Cancelado com Ressalvas), o status da equipe fica.
    /// </summary>
    static bool CancelamentoDaTenaris(Entity alvo, Entity? anterior, List<string> protegidos) =>
        protegidos.Contains(Status)
        && alvo.GetAttributeValue<OptionSetValue>(Status)?.Value == Cancelado
        && !JaCancelados.Contains(anterior?.GetAttributeValue<OptionSetValue>(Status)?.Value ?? 0);

    static List<string> LerLista(string? texto) =>
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
