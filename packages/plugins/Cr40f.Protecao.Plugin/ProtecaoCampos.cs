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
/// Exceção (decisão do Renan, 26/11/2026): o cancelamento da sincronização, com o status protegido ou não, vira Requer
/// Análise quando o serviço está aberto, para o financeiro decidir a cobrança; fechado não muda. A Tenaris marca o
/// cancelamento como "Requer Análise" na planilha (nunca veio "Cancelado" nas execuções desde 21/10/2026); os dois contam.
/// Vale só quando o cancelamento é novo (o snapshot anterior não trazia nenhum dos dois). O status anterior fica em
/// cr40f_cancelamentocliente, que o flow de Requer Análise usa para avisar a gestão "Cancelado pela Tenaris";
/// Concluído não muda, mas grava a coluna.
/// </summary>
public static class ProtecaoCampos
{
    public const string Lista = "new_camposprotegidos";
    public const string Snapshot = "new_snapshotsharepoint";
    public const string Status = "cr40f_status";
    public const string CancelamentoCliente = "cr40f_cancelamentocliente";
    const int Cancelado = 202410002, RequerAnalise = 100000001, Concluido = 202410008;
    // Abertos: Pré-reserva, Solicitado, Confirmado, Programado, Em execução. Status novo fica barrado até entrar aqui.
    static readonly Dictionary<int, string> Abertos = new()
    {
        [202410000] = "Pré-reserva", [202410004] = "Solicitado", [202410001] = "Confirmado", [202410005] = "Programado", [202410006] = "Em Execução",
    };
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
            var canceladoPassa = false;
            if (CanceladoDaSincronizacao(alvo, anterior) is int atual && !PlanilhaJaCancelava(anterior))
            {
                if (Abertos.TryGetValue(atual, out var rotulo))
                {
                    canceladoPassa = true;
                    alvo[Status] = new OptionSetValue(RequerAnalise);
                    alvo[CancelamentoCliente] = rotulo;
                }
                else
                {
                    if (!protegidos.Contains(Status)) alvo.Attributes.Remove(Status); // fechado não muda; protegido sai em barrados
                    if (atual == Concluido) alvo[CancelamentoCliente] = "Concluído";
                }
            }
            var barrados = protegidos.Where(campo => alvo.Contains(campo) && !(canceladoPassa && campo == Status)).ToList();
            foreach (var campo in barrados) alvo.Attributes.Remove(campo);
            // Status que muda pela sincronização sem ser este cancelamento (ex.: status deixou de ser protegido) leva a marca embora.
            if (alvo.Contains(Status) && !alvo.Contains(CancelamentoCliente) && TemMarca(anterior)) alvo[CancelamentoCliente] = null;
            return new Resultado(Array.Empty<string>(), barrados);
        }
        // Status mudado fora da sincronização (equipe reabriu, financeiro decidiu): o cancelamento do cliente já foi tratado.
        if (alvo.Contains(Status) && TemMarca(anterior)) alvo[CancelamentoCliente] = null;
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

    /// <summary>Status atual quando a sincronização manda Cancelado ou Requer Análise. Só aberto passa (como Requer
    /// Análise); fechado (Concluído, Requer Análise ou cancelado) não volta. Sem status anterior (criação), nada muda
    /// aqui: protegido fica barrado, não protegido grava o que veio.</summary>
    static int? CanceladoDaSincronizacao(Entity alvo, Entity? anterior) =>
        alvo.GetAttributeValue<OptionSetValue>(Status)?.Value is Cancelado or RequerAnalise
            ? anterior?.GetAttributeValue<OptionSetValue>(Status)?.Value
            : null;

    static bool TemMarca(Entity? anterior) => !string.IsNullOrEmpty(anterior?.GetAttributeValue<string>(CancelamentoCliente));

    /// <summary>Uma vez só: a planilha repete o status em toda sincronização da linha; o snapshot anterior diz se já
    /// cancelava (a equipe que reabriu depois não é desfeita).</summary>
    static bool PlanilhaJaCancelava(Entity? anterior)
    {
        var texto = anterior?.GetAttributeValue<string>(Snapshot);
        return !string.IsNullOrWhiteSpace(texto)
            && LerSnapshot(texto!).TryGetValue(Status, out var status)
            && (status == Cancelado.ToString(CultureInfo.InvariantCulture) || status == RequerAnalise.ToString(CultureInfo.InvariantCulture));
    }

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
