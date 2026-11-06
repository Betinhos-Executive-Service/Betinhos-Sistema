namespace Betinhos.DriverRecordSharing
{
    // Nomes lógicos do relatório de combustível (fonte única para os plugins).
    // Colunas da despesa (cr40f_valor é Money; cr40f_litros decimal; cr40f_kminformado inteiro; cr40f_datagasto data e hora; cr40f_modelo do veículo é texto) confirmadas em scripts/provision-relatorio-combustivel.ps1, scripts/import-despesas-operacionais-csv.ps1 e src/lib/dataverse.ts.
    // Lookups da despesa confirmados em scripts/import-despesas-operacionais-csv.ps1; confirmados na metadata do DEV em 2026-11-03. A categoria do relatório é "Abastecimento", nome do DEV; no PROD ela se chama "Combustível".
    public static class FuelSchema
    {
        public const string Despesa = "cr40f_despesaoperacional";
        public const string DespesaMotorista = "cr40f_motorista";
        public const string DespesaCategoria = "cr40f_categoria";
        public const string DespesaVeiculo = "cr40f_veiculo";
        public const string DespesaStatus = "cr40f_statusoperacional";
        public const string DespesaCnpjLido = "cr40f_iacnpjlido"; // Gravado pelo flow de IA das despesas.
        public const string Categoria = "cr40f_categoriadespesaoperacional";
        public const string CategoriaNome = "cr40f_nome";
        public const string CategoriaCombustivel = "Abastecimento";
        // Só o ranking aceita os dois nomes: ampliar CategoriaCombustivel ligaria no PROD o cálculo que grava colunas que não existem lá.
        public static readonly string[] CategoriasRanking = { CategoriaCombustivel, "Combustível" };
        public const string Veiculo = "cr40f_veiculos";
        public const string VeiculoModelo = "cr40f_modelo";
        public const string Funcionario = "cr40f_funcionarios";

        public const string Posto = "new_postocombustivel";
        public const string Resumo = "new_resumocombustivelmensal";
        public const string Avaliacao = "new_avaliacaoposto";

        public const int StatusGeoPendente = 100000000, StatusGeoGeocodificado = 100000001, StatusGeoManual = 100000002;
        public const int StatusDespesaEnviado = 100000000, StatusDespesaPrecisaCorrigir = 100000001, StatusDespesaValidado = 100000002;
        public const int ComparacaoSemCnpj = 100000000, ComparacaoPostoPendente = 100000001, ComparacaoSemReferencia = 100000002, ComparacaoComparado = 100000003;

        public const string EnvApiKey = "new_AnthropicKeyCombustivel";
        public const string ApiRelatorio = "new_ObterRelatorioCombustivel";
        public const string ApiRanking = "new_ObterRankingPostos";
        public const string ApiInsights = "new_GerarInsightsCombustivel";
        public const string ApiAvaliar = "new_AvaliarPosto";
    }
}
