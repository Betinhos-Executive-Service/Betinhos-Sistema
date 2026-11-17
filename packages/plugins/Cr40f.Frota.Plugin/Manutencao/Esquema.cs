namespace Cr40f.Frota.Plugin.Manutencao;

/// <summary>Manutenção (cr40f_manutencoes). Códigos iguais a apps/shell/src/pages/frota/data/schema.ts.</summary>
public static class M
{
    public const string Tabela = "cr40f_manutencoes";
    public const string Status = "cr40f_status", Veiculo = "cr40f_placa_carro", DataAprovacao = "cr40f_datadaaprovacao";
    public const string JanelaInicio = "cr40f_janelainicio", JanelaFim = "cr40f_janelafim", KmRealizado = "cr40f_kmrealizado";
    public const string ComentarioAoMotorista = "cr40f_comentariosaomotorista", ComentarioAprovador = "cr40f_comentariosdoaprovador";
    public const string DataManutencao = "cr40f_datamanutencao", Valor = "cr40f_valor", Estabelecimento = "cr40f_estabelecimento";
    public const string ServicoRealizado = "cr40f_servicorealizado", Pagamento = "cr40f_pagamento", RealizadoPor = "cr40f_realizado_por_nome";
    public const string ComentarioColaborador = "new_comentariosdocolaborador";
    public const string Servicos = "new_servicosmanutencao", Categorias = "new_categoriasmanutencao", Origem = "new_classificacaoorigem";
    public const string LinkNotaFiscal = "new_linkdanotafiscal", LinkFotoFinal1 = "new_linkdafotofinal1", LinkFotoFinal2 = "new_linkdafotofinal2", LinkFotoFinal3 = "new_linkdafotofinal3";

    public const int Solicitado = Codigos.Solicitado, Agendado = Codigos.Aprovado, Programado = Codigos.Programado;
    public const int Realizado = Codigos.Realizado, Reprovado = Codigos.Reprovado, Cancelado = Codigos.Cancelado;
    public const int PagamentoCartao = 202410000, PagamentoPedidoCompra = 202410001, PagamentoPix = 202410002, PagamentoDinheiro = 202410003;
    public const int OrigemManual = 100000001;
}

/// <summary>Linha da Geral (cr40f_reservadeveculos) que guarda só a programação da manutenção.</summary>
public static class G
{
    public const string Tabela = "cr40f_reservadeveculos";
    public const string Manutencao = "cr40f_om", Categoria = "new_categoriadoitem", Veiculo = "cr40f_veiculo", Motorista = "cr40f_motorista";
    public const string Saida = "cr40f_dataehorriodesada", Status = "cr40f_status", FoiProgramado = "new_foiprogramado";
    public const string DataFinalizacao = "new_datadefinalizacao", ObservacaoFinal = "new_observacaofinal";
    // Campos que a linha nova precisa para a Geral aceitá-la (iguais ao flow "Criar Serviço de Manutenção na Geral", descoberta).
    public const string StatusFaturamento = "cr40f_statusdefaturamento", TipoVeiculo = "cr40f_tipodeveiculo", TipoServico = "cr40f_tipodoservico";
    public const string Destino = "cr40f_destino", EnderecoSaida = "cr40f_endereodesada", Passageiros = "cr40f_passageirosetelefonedecontato";
    public const string Perfil = "cr40f_perfildopassageiro", ObsFaturamento = "new_observacaodefaturamento", Trajeto = "cr40f_trajeto";
    public const string ObsOperacao = "cr40f_obsdeoperao", ObsInterna = "cr40f_observaointerna";
    public const string TextoManutencao = "Manutenção de Veículo", TextoTrajeto = "Serviço de manutenção do veículo";
    public const int NaoFaturavel = 202410011, TipoVeiculoBasico = 202410000, TipoServicoManutencao = 202410006;
    // Origem do veículo da linha (new_origemveiculo): Manual = escolha do gestor, que o DriverRecordSharing respeita.
    public const string OrigemVeiculo = "new_origemveiculo";
    public const int OrigemVeiculoManual = 100000001;

    public const int CategoriaManutencao = 100000001;
    /// <summary>Status da linha encaixada e ainda não programada. Conferido na Tarefa 1 (descoberta).</summary>
    public const int StatusAProgramar = 202410001;
    public const int StatusProgramado = 202410005, StatusConcluido = 202410008, StatusCancelado = 202410002, StatusCanceladoComReservas = 202410010;
}

/// <summary>Despesa operacional ligada à manutenção. Campos iguais a apps/motoristas/src/features/despesas/expenses.payload.ts.</summary>
public static class D
{
    public const string Tabela = "cr40f_despesaoperacional", TabelaCategoria = "cr40f_categoriadespesaoperacional", TabelaForma = "cr40f_formapagamentodespesa", TabelaCidade = "cr40f_cidade";
    public const string Manutencao = "cr40f_manutencao", Nome = "cr40f_nome", DataGasto = "cr40f_datagasto", Valor = "cr40f_valor";
    public const string StatusOperacional = "cr40f_statusoperacional", StatusFinanceiro = "cr40f_statusfinanceiro", StatusAnexo = "cr40f_statusanexo", Origem = "cr40f_origem";
    public const string Observacao = "cr40f_observacao", Estabelecimento = "cr40f_estabelecimento";
    public const string Motorista = "cr40f_motorista", Categoria = "cr40f_categoria", Forma = "cr40f_formapagamento", Cidade = "cr40f_cidade", Veiculo = "cr40f_veiculo";
    public const int StatusInicial = 100000000, OrigemApp = 100000000, AnexoPendente = 100000001, AnexoEnviado = 100000002;
}
