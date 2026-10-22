using System;
using System.Net;
using System.Security.Cryptography;
using Microsoft.Xrm.Sdk;

namespace Cr40f.Acesso.Plugin;

/// <summary>Custom API cr40f_CadastrarAcessoMotorista. Step síncrono com configuração não segura (ids/URLs) e segura (clientSecret).</summary>
public sealed class CadastrarAcessoMotoristaPlugin : IPlugin
{
    public const string Mensagem = "cr40f_CadastrarAcessoMotorista";
    private readonly string? _unsecure; private readonly string? _secure;
    public CadastrarAcessoMotoristaPlugin(string unsecureConfig, string secureConfig) { _unsecure = unsecureConfig; _secure = secureConfig; }

    public void Execute(IServiceProvider serviceProvider)
    {
        var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
        var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
        try
        {
            if (context.MessageName != Mensagem) throw new InvalidPluginExecutionException("Mensagem não suportada pelo cadastro de acesso.");
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            // Serviço do sistema também na autorização: operador comum pode não ler systemuserroles/role.
            var sistema = factory.CreateOrganizationService(null);
            Autorizacao.Exigir(sistema, context.InitiatingUserId);
            var cfg = AcessoConfig.Parse(_unsecure, _secure);
            var entrada = new CadastroEntrada
            {
                NomeCompleto = Texto(context, "NomeCompleto"), Celular = Texto(context, "Celular"), EmailPessoal = TextoOuNulo(context, "EmailPessoal"), PrefixoEmail = TextoOuNulo(context, "PrefixoEmail"),
                TipoVinculo = context.InputParameters.Contains("TipoVinculo") && context.InputParameters["TipoVinculo"] is int tv ? tv : 1,
                FuncionarioId = context.InputParameters.Contains("FuncionarioId") && context.InputParameters["FuncionarioId"] is Guid g && g != Guid.Empty ? g : null,
            };
            var handler = new CadastrarAcessoHandler(new GraphGateway(cfg, GraphGateway.Compartilhado), new FuncionarioRepository(sistema), cfg, RandomSeguro(), m => tracing.Trace("{0}: {1}", Mensagem, m));
            var saida = handler.Executar(entrada);
            context.OutputParameters["EmailMicrosoft"] = saida.EmailMicrosoft;
            context.OutputParameters["SenhaTemporaria"] = saida.SenhaTemporaria;
            context.OutputParameters["FuncionarioId"] = saida.FuncionarioId.ToString("D");
            context.OutputParameters["UsuarioEntraId"] = saida.UsuarioEntraId;
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
            throw erro is InvalidPluginExecutionException ? erro : new InvalidPluginExecutionException("Não foi possível cadastrar o acesso. " + erro.Message, erro);
        }
    }

    /// <summary>Semente criptográfica: new Random() sozinho é previsível para senha.</summary>
    private static Random RandomSeguro()
    {
        var bytes = new byte[4];
        using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes);
        return new Random(BitConverter.ToInt32(bytes, 0));
    }

    private static string Texto(IPluginExecutionContext c, string nome) => TextoOuNulo(c, nome) ?? "";
    private static string? TextoOuNulo(IPluginExecutionContext c, string nome) => c.InputParameters.Contains(nome) && c.InputParameters[nome] is string s && s.Length > 0 ? s : null;
}
