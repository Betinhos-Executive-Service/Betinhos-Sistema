namespace Cr40f.Financeiro.Plugin;

/// <summary>
/// Composição de preço → status de faturamento da reserva (substitui o flow legado "Dar Baixa CP -> Status de Faturamento na Geral").
/// Só move entre Pendente e Composição Realizada: Pago, Pagamento Pendente, Faturamento Mensal, cancelados etc. nunca são sobrescritos.
/// </summary>
public static class ComposicaoFaturamento
{
    /// <summary>Novo status de faturamento da reserva, ou null quando não há nada a mudar.</summary>
    public static int? Novo(int? cpStatus, int? fatAtual)
    {
        if (cpStatus == Codigos.CpConcluida && (fatAtual is null || fatAtual == Codigos.ReservaFatPendente))
            return Codigos.ReservaFatComposicaoRealizada;
        if (cpStatus == Codigos.CpPendente && fatAtual == Codigos.ReservaFatComposicaoRealizada)
            return Codigos.ReservaFatPendente;
        return null;
    }
}
