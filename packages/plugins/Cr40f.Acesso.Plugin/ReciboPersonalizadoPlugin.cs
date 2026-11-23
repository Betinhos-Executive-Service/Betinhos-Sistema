using System;
using Cr40f.AppConfig;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Acesso.Plugin;

/// <summary>
/// Regra do recibo personalizado (fase B2 da configuração do App): o motorista só cria recibo em nome próprio com
/// services.personalReceipt ligado. Recibo criado por outra pessoa (gestão, conta de serviço) nunca é recusado.
/// </summary>
public sealed class ReciboPersonalizadoHandler
{
    public const string Mensagem = "Recibo personalizado não está disponível no seu App no momento. Procure o escritório.";

    private readonly AppConfigRepository _repo; private readonly Func<DateTime> _agoraUtc;
    public ReciboPersonalizadoHandler(AppConfigRepository repo, Func<DateTime> agoraUtc) { _repo = repo; _agoraUtc = agoraUtc; }

    /// <summary>motoristaDoRecibo = lookup cr40f_motorista do recibo (cr40f_funcionarios). Lança InvalidPluginExecutionException quando recusa.</summary>
    public void Executar(Guid chamador, Guid? motoristaDoRecibo)
    {
        if (motoristaDoRecibo is null || motoristaDoRecibo == Guid.Empty) return;
        var email = _repo.EmailDoUsuario(chamador);
        if (string.IsNullOrWhiteSpace(email)) return;
        var ficha = _repo.FichaPorEmail(email!);
        if (ficha is null || ficha.Id != motoristaDoRecibo.Value) return; // recibo de outra pessoa
        var publicada = _repo.LerPublicada();
        var ligado = AppConfigResolver.Resolver(AppConfigLegado.ChaveReciboPersonalizado, AppConfigConteudo.Ler(publicada?.Conteudo), _repo.PessoaDe(ficha), AppConfigResolver.HojeSaoPaulo(_agoraUtc())).Ligado;
        if (!ligado) throw new InvalidPluginExecutionException(Mensagem);
    }
}

/// <summary>Step síncrono (PreOperation) no Create de cr40f_recibos_v2. Serviço do sistema: as tabelas da configuração não dão leitura a papel algum.</summary>
public sealed class ReciboPersonalizadoPlugin : IPlugin
{
    public const string Tabela = "cr40f_recibos_v2";
    public const string ColunaMotorista = "cr40f_motorista";

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        if (context.MessageName != "Create" || context.PrimaryEntityName != Tabela) return;
        if (!context.InputParameters.Contains("Target") || context.InputParameters["Target"] is not Entity alvo) return;
        var motorista = alvo.GetAttributeValue<EntityReference>(ColunaMotorista)?.Id;
        try
        {
            new ReciboPersonalizadoHandler(new AppConfigRepository(factory.CreateOrganizationService(null)), () => DateTime.UtcNow).Executar(context.InitiatingUserId, motorista);
        }
        catch (InvalidPluginExecutionException) { throw; }
        catch (Exception erro)
        {
            // Recibo registra dinheiro já recebido: falha ao ler a configuração não pode impedir a gravação (falha aberta, só no trace).
            tracing.Trace("ReciboPersonalizado: leitura da configuração falhou, recibo liberado. {0}", erro);
        }
    }
}
