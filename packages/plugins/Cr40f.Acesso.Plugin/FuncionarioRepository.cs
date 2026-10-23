using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Acesso.Plugin;

public sealed class FuncionarioRegistro { public Guid Id; public string Nome = ""; public string? EmailMicrosoft; public string? Celular; }

public sealed class FuncionarioRepository
{
    public const string Tabela = "cr40f_funcionarios";
    public const string ColunaCelular = "cr40f_telefonecorporativo";
    public const int FuncaoMotorista = 202410000;
    public const int StatusAtivo = 0;
    private static readonly ColumnSet Colunas = new("cr40f_nomecompleto", "cr40f_emailmicrosoft", ColunaCelular);
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

    /// <summary>
    /// Funcionário sem e-mail Microsoft com o mesmo nome: sobra de cadastro que ficou com a liberação pendente.
    /// Só motorista ativo (o que Criar grava): homônimo desligado ou de outra função não é reaproveitado.
    /// </summary>
    public FuncionarioRegistro? SemEmailPorNome(string nome)
    {
        var q = new QueryExpression(Tabela) { ColumnSet = Colunas, TopCount = 2 };
        q.Criteria.AddCondition("cr40f_nomecompleto", ConditionOperator.Equal, nome.Trim().ToLowerInvariant());   // Equal do Dataverse ignora caixa
        q.Criteria.AddCondition("cr40f_emailmicrosoft", ConditionOperator.Null);
        q.Criteria.AddCondition("cr40f_funcao", ConditionOperator.Equal, FuncaoMotorista);
        q.Criteria.AddCondition("cr40f_status", ConditionOperator.Equal, StatusAtivo);
        var achados = _service.RetrieveMultiple(q).Entities.Select(Mapear).ToList();
        return achados.Count == 1 ? achados[0] : null;   // homônimos ambíguos: não adivinha
    }

    /// <summary>email null: liberação do systemuser pendente; o e-mail é gravado quando o Dataverse liberar.</summary>
    public Guid Criar(string nome, string? email, string celular, int tipoVinculo)
    {
        var e = new Entity(Tabela)
        {
            ["cr40f_nomecompleto"] = nome.Trim(), [ColunaCelular] = celular,
            ["cr40f_funcao"] = new OptionSetValue(FuncaoMotorista), ["cr40f_status"] = new OptionSetValue(StatusAtivo), ["cr40f_tipodevinculo"] = new OptionSetValue(tipoVinculo),
        };
        if (email is not null) e["cr40f_emailmicrosoft"] = email;
        return _service.Create(e);
    }

    public void VincularEmail(Guid id, string email, string? celularSeVazio)
    {
        var atual = PorId(id) ?? throw new AcessoException("FUNCIONARIO_NAO_ENCONTRADO", "Funcionário " + id + " não existe.");
        var e = new Entity(Tabela, id) { ["cr40f_emailmicrosoft"] = email };
        if (string.IsNullOrWhiteSpace(atual.Celular) && celularSeVazio is not null) e[ColunaCelular] = celularSeVazio;
        _service.Update(e);
    }

    private static FuncionarioRegistro Mapear(Entity e) => new()
    {
        Id = e.Id,
        Nome = e.GetAttributeValue<string>("cr40f_nomecompleto") ?? "",
        EmailMicrosoft = e.GetAttributeValue<string>("cr40f_emailmicrosoft"),
        Celular = e.GetAttributeValue<string>(ColunaCelular),
    };
}
