using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Newtonsoft.Json;

namespace Cr40f.Financeiro.Plugin;

public sealed class SincronizarRequest
{
    [JsonProperty("modo")] public string Modo { get; set; } = "simular";
    [JsonProperty("origem")] public string Origem { get; set; } = "manual";

    public void Validate()
    {
        if (Modo != "simular" && Modo != "aplicar") throw new InvalidPluginExecutionException("modo deve ser 'simular' ou 'aplicar'.");
        if (Origem != "manual" && Origem != "automatico") throw new InvalidPluginExecutionException("origem deve ser 'manual' ou 'automatico'.");
    }
}

public sealed class MudancaDto
{
    [JsonProperty("entidade")] public string Entidade { get; set; } = "";
    [JsonProperty("id")] public Guid Id { get; set; }
    [JsonProperty("campo")] public string Campo { get; set; } = "";
    [JsonProperty("de")] public int? De { get; set; }
    [JsonProperty("para")] public int? Para { get; set; }
    [JsonProperty("limparLookup")] public bool LimparLookup { get; set; }
    [JsonProperty("motivo")] public string Motivo { get; set; } = "";

    public static MudancaDto From(Mudanca m) => new() { Entidade = m.Entidade, Id = m.Id, Campo = m.Campo, De = m.De, Para = m.Para, LimparLookup = m.LimparLookup, Motivo = m.Motivo };
}

public sealed class SincronizarResponse
{
    [JsonProperty("opId")] public Guid OpId { get; set; }
    [JsonProperty("modo")] public string Modo { get; set; } = "";
    [JsonProperty("mudancas")] public List<MudancaDto> Mudancas { get; } = new();
    [JsonProperty("aplicadas")] public bool Aplicadas { get; set; }
}

public sealed class FecharMesRequest
{
    [JsonProperty("clienteId")] public Guid ClienteId { get; set; }
    [JsonProperty("mes")] public string Mes { get; set; } = "";

    public void Validate()
    {
        if (ClienteId == Guid.Empty) throw new InvalidPluginExecutionException("clienteId é obrigatório.");
        FechamentoMensal.Janela(Mes ?? "");
    }
}

public sealed class FecharMesResponse
{
    [JsonProperty("opId")] public Guid OpId { get; set; }
    [JsonProperty("reservas")] public int Reservas { get; set; }
    [JsonProperty("valor")] public decimal Valor { get; set; }
}
