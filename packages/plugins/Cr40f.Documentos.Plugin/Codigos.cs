namespace Cr40f.Documentos.Plugin;

/// <summary>Cópia de apps/shell/src/pages/documentos/domain/codes.ts. Mudou lá, muda aqui (o teste de paridade acusa).</summary>
public static class Codigos
{
    public const int CategoriaPessoas = 100000000;
    public const int CategoriaFrota = 100000001;
    public const int SituacaoVigente = 100000000;
    public const int SituacaoSubstituido = 100000001;

    public const int ObrigMotorista = 100000000;
    public const int ObrigAdministrativo = 100000001;
    public const int ObrigProprio = 100000002;
    public const int ObrigTerceiro = 100000003;
    public const int ObrigAluguel = 100000004;

    public const int FuncaoMotorista = 202410000;
    public const int FuncaoAdministrativo = 202410001;
    public const int VeiculoProprio = 100000000;
    public const int VeiculoTerceiro = 100000001;
    public const int VeiculoAluguel = 100000002;

    public const int FuncionarioDesligado = 1;
    public const int VeiculoVendido = 202410000;

    public static int? ObrigDeFuncao(int? funcao) => funcao switch
    {
        FuncaoMotorista => ObrigMotorista,
        FuncaoAdministrativo => ObrigAdministrativo,
        _ => null,
    };

    public static int? ObrigDeCategoriaVeiculo(int? categoria) => categoria switch
    {
        VeiculoProprio => ObrigProprio,
        VeiculoTerceiro => ObrigTerceiro,
        VeiculoAluguel => ObrigAluguel,
        _ => null,
    };
}
