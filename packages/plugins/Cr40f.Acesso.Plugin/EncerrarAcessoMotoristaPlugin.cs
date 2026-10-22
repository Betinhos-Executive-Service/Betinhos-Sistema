using System;
using System.Net;
using System.Net.Http;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Acesso.Plugin;

/// <summary>Custom API cr40f_EncerrarAcessoMotorista. Step síncrono com configuração não segura (ids/URLs) e segura (clientSecret).</summary>
public sealed class EncerrarAcessoMotoristaPlugin : IPlugin
{
    public const string Mensagem = "cr40f_EncerrarAcessoMotorista";
    private readonly string? _unsecure; private readonly string? _secure;
    public EncerrarAcessoMotoristaPlugin(string unsecureConfig, string secureConfig) { _unsecure = unsecureConfig; _secure = secureConfig; }

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            if (context.MessageName != Mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada pelo encerramento de acesso.");
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            // Serviço do sistema também na autorização: operador comum pode não ler systemuserroles/role.
            var sistema = factory.CreateOrganizationService(null);
            Autorizacao.Exigir(sistema, context.InitiatingUserId);
            var cfg = AcessoConfig.Parse(_unsecure, _secure);
            if (!(context.InputParameters.Contains("FuncionarioId") && context.InputParameters["FuncionarioId"] is Guid id && id != Guid.Empty))
                throw new AcessoException("FUNCIONARIO_NAO_ENCONTRADO", "Informe o funcionário.");
            var confirmacao = context.InputParameters.Contains("Confirmacao") && context.InputParameters["Confirmacao"] is string c ? c : "";
            var handler = new EncerrarAcessoHandler(new GraphGateway(cfg, GraphGateway.Compartilhado), new FuncionarioRepository(sistema), cfg, () => DateTime.UtcNow, m => tracing.Trace("{0}: {1}", Mensagem, m));
            context.OutputParameters["Etapas"] = handler.Executar(id, confirmacao).ToJson();
        }
        catch (AcessoException erro)
        {
            tracing.Trace("{0}: {1}", Mensagem, erro.Message);
            throw new InvalidPluginExecutionException(erro.Message + (erro.Data["Etapas"] is string etapas ? " | etapas=" + etapas : ""), erro);
        }
        catch (Exception erro)
        {
            tracing.Trace("{0}: {1}", Mensagem, erro);
            throw erro is InvalidPluginExecutionException ? erro : new InvalidPluginExecutionException("Não foi possível encerrar o acesso. " + erro.Message, erro);
        }
    }
}
