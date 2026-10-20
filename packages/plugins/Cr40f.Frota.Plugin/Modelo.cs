using System.Collections.Generic;
using System.Runtime.Serialization;

namespace Cr40f.Frota.Plugin;

/// <summary>Códigos de choice, iguais a apps/shell/src/pages/frota/data/schema.ts.</summary>
public static class Codigos
{
    public const int Solicitado = 0, Aprovado = 202410001, Programado = 202410005, Realizado = 202410002, Reprovado = 100000002, Cancelado = 100000001;
    public const int VeiculoVendido = 202410000, VeiculoAtivo = 202410001, Proprio = 100000000;
    public const int AvisoKmPadrao = 1000, AvisoDiasPadrao = 30;
}

/// <summary>Limiares de apps/shell/src/pages/frota/domain/alertas.ts (LIMIARES).</summary>
public static class Limiares
{
    public const int ReincidenciaCurtaVezes = 3, ReincidenciaCurtaDias = 120;
    public const int ReincidenciaLongaVezes = 5, ReincidenciaLongaDias = 365;
    public const int PrioridadeGrauMinimo = 3, SolicitadoParadoDias = 2, AprovadoSemDataDias = 5;
    public const int HodometroHoras = 48, CustoJanelaDias = 90, CustoMinimoVeiculos = 3;
    public const decimal CustoFatorMediana = 1.5m;
}

[DataContract]
public sealed class Veiculo
{
    [DataMember(Name = "id")] public string Id { get; set; } = "";
    [DataMember(Name = "placa")] public string Placa { get; set; } = "";
    [DataMember(Name = "status")] public int? Status { get; set; }
    [DataMember(Name = "categoria")] public int? Categoria { get; set; }
    [DataMember(Name = "hodometro")] public decimal? Hodometro { get; set; }
    /// <summary>ISO UTC.</summary>
    [DataMember(Name = "hodometroEm")] public string? HodometroEm { get; set; }
}

[DataContract]
public sealed class Manutencao
{
    [DataMember(Name = "id")] public string Id { get; set; } = "";
    [DataMember(Name = "descricao")] public string Descricao { get; set; } = "";
    [DataMember(Name = "status")] public int? Status { get; set; }
    [DataMember(Name = "grau")] public int? Grau { get; set; }
    /// <summary>Dias yyyy-MM-dd já no fuso de São Paulo.</summary>
    [DataMember(Name = "agendarPara")] public string? AgendarPara { get; set; }
    [DataMember(Name = "dataManutencao")] public string? DataManutencao { get; set; }
    [DataMember(Name = "criadoEm")] public string CriadoEm { get; set; } = "";
    [DataMember(Name = "km")] public decimal? Km { get; set; }
    [DataMember(Name = "valor")] public decimal? Valor { get; set; }
    [DataMember(Name = "estabelecimento")] public string? Estabelecimento { get; set; }
    [DataMember(Name = "veiculoId")] public string? VeiculoId { get; set; }
    [DataMember(Name = "veiculoLabel")] public string? VeiculoLabel { get; set; }
    [DataMember(Name = "servicos")] public List<int> Servicos { get; set; } = new();
}

[DataContract]
public sealed class ItemPlano
{
    [DataMember(Name = "id")] public string Id { get; set; } = "";
    [DataMember(Name = "nome")] public string Nome { get; set; } = "";
    [DataMember(Name = "servico")] public int? Servico { get; set; }
    [DataMember(Name = "intervaloKm")] public decimal? IntervaloKm { get; set; }
    [DataMember(Name = "intervaloMeses")] public int? IntervaloMeses { get; set; }
    [DataMember(Name = "avisoKm")] public decimal AvisoKm { get; set; } = Codigos.AvisoKmPadrao;
    [DataMember(Name = "avisoDias")] public int AvisoDias { get; set; } = Codigos.AvisoDiasPadrao;
    [DataMember(Name = "ativo")] public bool Ativo { get; set; } = true;
}

[DataContract]
public sealed class Baseline
{
    [DataMember(Name = "veiculoId")] public string? VeiculoId { get; set; }
    [DataMember(Name = "itemId")] public string? ItemId { get; set; }
    [DataMember(Name = "km")] public decimal? Km { get; set; }
    [DataMember(Name = "data")] public string? Data { get; set; }
}

[DataContract]
public sealed class DadosFrota
{
    [DataMember(Name = "veiculos")] public List<Veiculo> Veiculos { get; set; } = new();
    [DataMember(Name = "manutencoes")] public List<Manutencao> Manutencoes { get; set; } = new();
    [DataMember(Name = "itens")] public List<ItemPlano> Itens { get; set; } = new();
    [DataMember(Name = "baselines")] public List<Baseline> Baselines { get; set; } = new();
}

/// <summary>Uma pendência proativa. `Id` segue o mesmo formato do shell (domain/pendencias.ts) para a paridade.</summary>
[DataContract]
public sealed class Pendencia
{
    [DataMember(Name = "tipo", Order = 1)] public string Tipo { get; set; } = "";
    [DataMember(Name = "id", Order = 2)] public string Id { get; set; } = "";
    [DataMember(Name = "veiculoId", Order = 3)] public string? VeiculoId { get; set; }
    [DataMember(Name = "placa", Order = 4)] public string? Placa { get; set; }
    [DataMember(Name = "titulo", Order = 5)] public string Titulo { get; set; } = "";
    [DataMember(Name = "detalhe", Order = 6)] public string Detalhe { get; set; } = "";
    [DataMember(Name = "manutencaoId", Order = 7)] public string? ManutencaoId { get; set; }
}

[DataContract]
public sealed class Resultado
{
    [DataMember(Name = "hoje", Order = 1)] public string Hoje { get; set; } = "";
    [DataMember(Name = "total", Order = 2)] public int Total { get; set; }
    [DataMember(Name = "pendencias", Order = 3)] public List<Pendencia> Pendencias { get; set; } = new();
}
