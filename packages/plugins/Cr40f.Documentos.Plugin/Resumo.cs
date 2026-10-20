using System.Collections.Generic;
using System.Runtime.Serialization;

namespace Cr40f.Documentos.Plugin;

[DataContract]
public sealed class Resumo
{
    [DataMember(Name = "hoje", Order = 0)] public string Hoje { get; set; } = "";
    [DataMember(Name = "categorias", Order = 1)] public List<ResumoCategoria> Categorias { get; set; } = new();
}

[DataContract]
public sealed class ResumoCategoria
{
    [DataMember(Name = "categoria", Order = 0)] public string Categoria { get; set; } = "";
    [DataMember(Name = "contagens", Order = 1)] public Contagens Contagens { get; set; } = new();
    [DataMember(Name = "urgentes", Order = 2)] public List<ItemUrgente> Urgentes { get; set; } = new();
}

[DataContract]
public sealed class Contagens
{
    [DataMember(Name = "vencido", Order = 0)] public int Vencido { get; set; }
    [DataMember(Name = "vence7", Order = 1)] public int Vence7 { get; set; }
    [DataMember(Name = "vence30", Order = 2)] public int Vence30 { get; set; }
    [DataMember(Name = "vence60", Order = 3)] public int Vence60 { get; set; }
    [DataMember(Name = "faltando", Order = 4)] public int Faltando { get; set; }
}

[DataContract]
public sealed class ItemUrgente
{
    [DataMember(Name = "dono", Order = 0)] public string Dono { get; set; } = "";
    [DataMember(Name = "detalhe", Order = 1)] public string Detalhe { get; set; } = "";
    [DataMember(Name = "tipo", Order = 2)] public string Tipo { get; set; } = "";
    [DataMember(Name = "validade", Order = 3)] public string? Validade { get; set; }
    [DataMember(Name = "estado", Order = 4)] public string Estado { get; set; } = "";
    [DataMember(Name = "dias", Order = 5)] public int? Dias { get; set; }
    [DataMember(Name = "quantidade", Order = 6)] public int Quantidade { get; set; } = 1;
}
