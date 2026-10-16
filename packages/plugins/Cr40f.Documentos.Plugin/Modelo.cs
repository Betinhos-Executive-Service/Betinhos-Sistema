using System.Runtime.Serialization;

namespace Cr40f.Documentos.Plugin;

public static class Categorias
{
    public const string Pessoas = "pessoas";
    public const string Frota = "frota";
    public static readonly string[] Todas = { Pessoas, Frota };
}

public static class Status
{
    public const string Vencido = "vencido";
    public const string Vence7 = "vence7";
    public const string Vence30 = "vence30";
    public const string Vence60 = "vence60";
    public const string Ok = "ok";
    public const string SemValidade = "semValidade";
    public const string Faltando = "faltando";
}

/// <summary>Mesmos nomes de campo do TipoDoc do shell (o fixture de paridade usa os dois).</summary>
[DataContract]
public sealed class TipoDoc
{
    [DataMember(Name = "id")] public string Id { get; set; } = "";
    [DataMember(Name = "nome")] public string Nome { get; set; } = "";
    [DataMember(Name = "categoria")] public string Categoria { get; set; } = Categorias.Pessoas;
    [DataMember(Name = "temValidade")] public bool TemValidade { get; set; }
    [DataMember(Name = "obrigatorioPara")] public int[] ObrigatorioPara { get; set; } = new int[0];
    [DataMember(Name = "ordem")] public int Ordem { get; set; }
    [DataMember(Name = "ativo")] public bool Ativo { get; set; } = true;
}

[DataContract]
public sealed class Dono
{
    [DataMember(Name = "id")] public string Id { get; set; } = "";
    [DataMember(Name = "categoria")] public string Categoria { get; set; } = Categorias.Pessoas;
    [DataMember(Name = "nome")] public string Nome { get; set; } = "";
    [DataMember(Name = "detalhe")] public string Detalhe { get; set; } = "";
    [DataMember(Name = "obrigKey")] public int? ObrigKey { get; set; }
    [DataMember(Name = "ativo")] public bool Ativo { get; set; } = true;
}

/// <summary>Datas em yyyy-MM-dd; ModificadoEm em ISO 8601.</summary>
[DataContract]
public sealed class DocEmitido
{
    [DataMember(Name = "id")] public string Id { get; set; } = "";
    [DataMember(Name = "tipoId")] public string TipoId { get; set; } = "";
    [DataMember(Name = "donoId")] public string DonoId { get; set; } = "";
    [DataMember(Name = "categoria")] public string Categoria { get; set; } = Categorias.Pessoas;
    [DataMember(Name = "emissao")] public string? Emissao { get; set; }
    [DataMember(Name = "validade")] public string? Validade { get; set; }
    [DataMember(Name = "situacao")] public string Situacao { get; set; } = "vigente";
    [DataMember(Name = "modificadoEm")] public string? ModificadoEm { get; set; }
}

public sealed class Pendencia
{
    public Pendencia(Dono dono, TipoDoc tipo, DocEmitido? doc, string estado, int? dias)
    {
        Dono = dono;
        Tipo = tipo;
        Doc = doc;
        Estado = estado;
        Dias = dias;
    }

    public Dono Dono { get; }
    public TipoDoc Tipo { get; }
    public DocEmitido? Doc { get; }
    public string Estado { get; }
    public int? Dias { get; }
}
