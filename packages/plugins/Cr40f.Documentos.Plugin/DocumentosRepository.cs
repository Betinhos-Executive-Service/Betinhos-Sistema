using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Documentos.Plugin;

public sealed class DadosDocumentos
{
    public List<TipoDoc> Tipos { get; } = new();
    public List<Dono> Donos { get; } = new();
    public List<DocEmitido> Docs { get; } = new();
}

public sealed class DocumentosRepository
{
    private readonly IOrganizationService _service;

    public DocumentosRepository(IOrganizationService service) => _service = service;

    public DadosDocumentos Carregar()
    {
        var dados = new DadosDocumentos();

        // Tipos inativos também vêm: o builder os ignora, como no shell.
        dados.Tipos.AddRange(Todos(Consulta("cr40f_tipodocumento", "cr40f_name", "cr40f_categoria", "cr40f_temvalidade", "cr40f_obrigatoriopara", "cr40f_ordem", "statecode")).Select(DataverseMapper.Tipo));

        var docs = Consulta("cr40f_documento", "cr40f_tipo", "cr40f_funcionario", "cr40f_veiculo", "cr40f_emissao", "cr40f_validade", "cr40f_situacao", "modifiedon");
        docs.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        docs.Criteria.AddCondition("cr40f_situacao", ConditionOperator.Equal, Codigos.SituacaoVigente);
        dados.Docs.AddRange(Todos(docs).Select(DataverseMapper.Documento));

        var funcionarios = Consulta("cr40f_funcionarios", "new_apelido", "cr40f_nomecompleto", "cr40f_funcao", "cr40f_status");
        funcionarios.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        dados.Donos.AddRange(Todos(funcionarios).Select(DataverseMapper.Funcionario));

        var veiculos = Consulta("cr40f_veiculos", "cr40f_placa", "cr40f_marca", "cr40f_modelo", "new_categoriadoveiculo", "cr40f_statusdoveiculo");
        veiculos.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        dados.Donos.AddRange(Todos(veiculos).Select(DataverseMapper.Veiculo));

        return dados;
    }

    private static QueryExpression Consulta(string tabela, params string[] colunas) => new(tabela)
    {
        ColumnSet = new ColumnSet(colunas),
        PageInfo = new PagingInfo { Count = 5000, PageNumber = 1 },
    };

    private IEnumerable<Entity> Todos(QueryExpression consulta)
    {
        while (true)
        {
            var pagina = _service.RetrieveMultiple(consulta);
            foreach (var linha in pagina.Entities) yield return linha;
            if (!pagina.MoreRecords) yield break;
            consulta.PageInfo.PageNumber++;
            consulta.PageInfo.PagingCookie = pagina.PagingCookie;
        }
    }
}
