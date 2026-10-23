using System;
using System.Net;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Acesso.Plugin;

/// <summary>Custom API cr40f_ReativarAcessoMotorista. Step síncrono com configuração não segura (ids/URLs) e segura (clientSecret).</summary>
public sealed class ReativarAcessoMotoristaPlugin : IPlugin
{
    public const string Mensagem = "cr40f_ReativarAcessoMotorista";
    private readonly string? _unsecure; private readonly string? _secure;
    public ReativarAcessoMotoristaPlugin(string unsecureConfig, string secureConfig) { _unsecure = unsecureConfig; _secure = secureConfig; }

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            if (context.MessageName != Mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada pela reativação de acesso.");
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            // Serviço do sistema também na autorização: operador comum pode não ler systemuserroles/role.
            var sistema = factory.CreateOrganizationService(null);
            Autorizacao.Exigir(sistema, context.InitiatingUserId);
            var cfg = AcessoConfig.Parse(_unsecure, _secure);
            if (!(context.InputParameters.Contains("FuncionarioId") && context.InputParameters["FuncionarioId"] is Guid id && id != Guid.Empty))
                throw new AcessoException("FUNCIONARIO_NAO_ENCONTRADO", "Informe o funcionário.");
            var handler = new ReativarAcessoHandler(new GraphGateway(cfg, GraphGateway.Compartilhado), new FuncionarioRepository(sistema), new UsuarioDataverseRepository(sistema),
                new PowerPlatformGateway(cfg, GraphGateway.Compartilhado), cfg, CadastrarAcessoMotoristaPlugin.RandomSeguro(), m => tracing.Trace("{0}: {1}", Mensagem, m));
            var saida = handler.Executar(id);
            context.OutputParameters["EmailMicrosoft"] = saida.EmailMicrosoft;
            context.OutputParameters["SenhaTemporaria"] = saida.SenhaTemporaria;
            context.OutputParameters["LinkApp"] = saida.LinkApp;
            context.OutputParameters["Etapas"] = saida.Etapas.ToJson();
        }
        catch (AcessoException erro)
        {
            tracing.Trace("{0}: {1}", Mensagem, erro.Message);
            throw new InvalidPluginExecutionException(erro.Message + (erro.Data["Etapas"] is string etapas ? " | etapas=" + etapas : ""), erro);
        }
        catch (Exception erro)
        {
            tracing.Trace("{0}: {1}", Mensagem, erro);
            throw erro is InvalidPluginExecutionException ? erro : new InvalidPluginExecutionException("Não foi possível reativar o acesso. " + erro.Message, erro);
        }
    }
}
