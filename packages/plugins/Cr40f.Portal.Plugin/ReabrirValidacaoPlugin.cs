using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Cr40f.Portal.Plugin;

/// <summary>
/// Preço mudou depois de liberar: a validação do cliente volta para "Liberado", guarda o valor anterior e reinicia o prazo da tácita.
/// Step: composição Update pós-operação síncrono, sem filtro (new_valortotal é calculada e nunca vem no Update, como no
/// ValorOpPlugin), com imagem "pre" de new_valortotal só como atalho. Idempotente: compara o novo total com o valor liberado.
/// </summary>
public sealed class ReabrirValidacaoPlugin : IPlugin
{
    public const string ImagemAnterior = "pre";
    public const string Composicao = "cr40f_composicaodeprecos";
    public const string CpValor = "new_valortotal";
    public const string Reserva = "cr40f_reservadeveculos";
    public const string ReservaCpLookup = "new_composicaodepreco";
    public const string Validacao = "cr40f_validacaoservico";
    public const string ValReserva = "cr40f_reserva";
    public const string ValStatus = "cr40f_status";
    public const string ValValorLiberado = "cr40f_valorliberado";
    public const string ValValorAnterior = "cr40f_valoranterior";
    public const string ValPrazo = "cr40f_prazotacita";
    public const string ValLiberadoEm = "cr40f_liberadoem";
    public const string ValAprovadoEm = "cr40f_aprovadoem";
    public const string ValAprovadoPor = "cr40f_aprovadopor";
    // Valores de cr40f_status (provision-portal-cliente.ps1 e STATUS_VALIDACAO do shell).
    public const int StatusLiberado = 100000000;
    public const int StatusRetirado = 100000005;

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            Processar(context, factory.CreateOrganizationService(null), DateTime.UtcNow, tracing);
        }
        catch (Exception error)
        {
            tracing.Trace("Cr40f.Portal: {0}", error);
            throw error is InvalidPluginExecutionException ? error : new InvalidPluginExecutionException("Não foi possível reabrir a validação do cliente. " + error.Message, error);
        }
    }

    /// <summary>Quantas validações reabriu. Sai em Depth &gt; 1 (update em cadeia de outro plugin ou flow) e nunca grava na composição.</summary>
    public static int Processar(IPluginExecutionContext context, IOrganizationService service, DateTime agoraUtc, ITracingService? tracing = null)
    {
        if (context.Depth > 1 || context.MessageName != "Update" || context.PrimaryEntityName != Composicao) return 0;
        var total = service.Retrieve(Composicao, context.PrimaryEntityId, new ColumnSet(CpValor)).GetAttributeValue<Money>(CpValor)?.Value;
        if (total is null) return 0;
        // Atalho: a imagem traz o total antes do Update; igual, nada mudou. Sem a coluna na imagem, a comparação com o valor liberado decide.
        var anterior = context.PreEntityImages.Contains(ImagemAnterior) ? context.PreEntityImages[ImagemAnterior] : null;
        if (anterior != null && anterior.Contains(CpValor) && Centavos(anterior.GetAttributeValue<Money>(CpValor)?.Value) == Centavos(total)) return 0;
        return Reabrir(service, context.PrimaryEntityId, total.Value, agoraUtc, tracing);
    }

    public static int Reabrir(IOrganizationService service, Guid composicaoId, decimal total, DateTime agoraUtc, ITracingService? tracing = null)
    {
        // Uma consulta só: validações ativas cujas reservas usam esta composição (uma validação por reserva).
        var consulta = new QueryExpression(Validacao)
        {
            ColumnSet = new ColumnSet(ValStatus, ValValorLiberado),
            Criteria = { Conditions = { new ConditionExpression("statecode", ConditionOperator.Equal, 0) } },
        };
        consulta.AddLink(Reserva, ValReserva, Reserva + "id").LinkCriteria.AddCondition(ReservaCpLookup, ConditionOperator.Equal, composicaoId);
        DateTime? prazo = null;
        var reabertas = 0;
        foreach (var validacao in service.RetrieveMultiple(consulta).Entities)
        {
            var liberado = validacao.GetAttributeValue<Money>(ValValorLiberado)?.Value;
            if (validacao.GetAttributeValue<OptionSetValue>(ValStatus)?.Value == StatusRetirado || Centavos(liberado) == Centavos(total)) continue;
            prazo ??= DiasUteis.Somar(DiasUteis.HojeEmBrasilia(agoraUtc));
            service.Update(new Entity(Validacao, validacao.Id)
            {
                [ValValorAnterior] = liberado is null ? null : new Money(liberado.Value),
                [ValValorLiberado] = new Money(total),
                [ValStatus] = new OptionSetValue(StatusLiberado),
                [ValPrazo] = prazo,
                [ValLiberadoEm] = agoraUtc,
                [ValAprovadoEm] = null,
                [ValAprovadoPor] = null,
            });
            tracing?.Trace("Cr40f.Portal: validação {0} reaberta {1} → {2}, prazo {3:yyyy-MM-dd}", validacao.Id, liberado, total, prazo);
            reabertas++;
        }
        return reabertas;
    }

    static long? Centavos(decimal? valor) => valor is null ? null : (long)Math.Round(valor.Value * 100m, MidpointRounding.AwayFromZero);
}
