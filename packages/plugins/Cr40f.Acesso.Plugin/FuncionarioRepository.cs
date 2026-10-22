using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin;

public sealed class FuncionarioRegistro { public Guid Id; public string Nome = ""; public string? EmailMicrosoft; public string? Celular; public int Status; public int? TipoVinculo; public bool TemDemissao; }

public sealed class FuncionarioRepository
{
    public const string Tabela = "cr40f_funcionarios";
    public const string ColunaCelular = "cr40f_telefonecorporativo";
    public const int FuncaoMotorista = 202410000;
    public const int StatusAtivo = 0;
    public const int StatusInativo = 1; // Desligado
    private static readonly ColumnSet Colunas = new("cr40f_nomecompleto", "cr40f_emailmicrosoft", ColunaCelular, "cr40f_status", "cr40f_tipodevinculo", "cr40f_datadedemissao");
    private readonly IOrganizationService _service;
    public FuncionarioRepository(IOrganizationService service) { _service = service; }

    public FuncionarioRegistro? PorId(Guid id)
    {
        var q = new QueryExpression(Tabela) { ColumnSet = Colunas, TopCount = 1 };
        q.Criteria.AddCondition("cr40f_funcionariosid", ConditionOperator.Equal, id);
        return _service.RetrieveMultiple(q).Entities.Select(Mapear).FirstOrDefault();
    }

    public FuncionarioRegistro? PorEmail(string email)
    {
        var q = new QueryExpression(Tabela) { ColumnSet = Colunas, TopCount = 2 };
        q.Criteria.AddCondition("cr40f_emailmicrosoft", ConditionOperator.Equal, email.Trim().ToLowerInvariant());
        return _service.RetrieveMultiple(q).Entities.Select(Mapear).FirstOrDefault();
    }

    public Guid Criar(string nome, string email, string celular, int tipoVinculo) => _service.Create(new Entity(Tabela)
    {
        ["cr40f_nomecompleto"] = nome.Trim(), ["cr40f_emailmicrosoft"] = email, [ColunaCelular] = celular,
        ["cr40f_funcao"] = new OptionSetValue(FuncaoMotorista), ["cr40f_status"] = new OptionSetValue(StatusAtivo), ["cr40f_tipodevinculo"] = new OptionSetValue(tipoVinculo),
    });

    public void VincularEmail(Guid id, string email, string? celularSeVazio)
    {
        var atual = PorId(id) ?? throw new AcessoException("FUNCIONARIO_NAO_ENCONTRADO", "Funcionário " + id + " não existe.");
        var e = new Entity(Tabela, id) { ["cr40f_emailmicrosoft"] = email };
        if (string.IsNullOrWhiteSpace(atual.Celular) && celularSeVazio is not null) e[ColunaCelular] = celularSeVazio;
        _service.Update(e);
    }

    public void Inativar(Guid id, DateTime hojeUtc)
    {
        var atual = PorId(id) ?? throw new AcessoException("FUNCIONARIO_NAO_ENCONTRADO", "Funcionário " + id + " não existe.");
        var e = new Entity(Tabela, id) { ["cr40f_status"] = new OptionSetValue(StatusInativo) };
        if (!atual.TemDemissao) e["cr40f_datadedemissao"] = hojeUtc.AddHours(-3).Date; // Brasília, sem horário de verão desde 2019
        _service.Update(e);
    }

    private static FuncionarioRegistro Mapear(Entity e) => new()
    {
        Id = e.Id,
        Nome = e.GetAttributeValue<string>("cr40f_nomecompleto") ?? "",
        EmailMicrosoft = e.GetAttributeValue<string>("cr40f_emailmicrosoft"),
        Celular = e.GetAttributeValue<string>(ColunaCelular),
        Status = e.GetAttributeValue<OptionSetValue>("cr40f_status")?.Value ?? StatusAtivo,
        TipoVinculo = e.GetAttributeValue<OptionSetValue>("cr40f_tipodevinculo")?.Value,
        TemDemissao = e.Contains("cr40f_datadedemissao") && e["cr40f_datadedemissao"] != null,
    };
}
