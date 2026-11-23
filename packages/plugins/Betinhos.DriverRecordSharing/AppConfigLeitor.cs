using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Web.Script.Serialization;
using Cr40f.AppConfig;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Betinhos.DriverRecordSharing
{
    /// <summary>
    /// Leitura da configuração do App Motoristas (fase B2): versão publicada, linhas de exceção/piloto da pessoa e colunas legadas
    /// da ficha, resolvidas pelo mesmo AppConfigResolver do Cr40f.Acesso.Plugin (arquivo idêntico). Sempre com o serviço do sistema.
    /// </summary>
    public sealed class AppConfigLeitor
    {
        public const string TabelaVersao = "cr40f_appconfigversao";
        public const string TabelaPessoa = "cr40f_appconfigpessoa";
        private const int Publicada = 100000001, TipoExcecao = 100000000, TipoPiloto = 100000001;
        public const string ChaveMultas = "multas";
        public const string ChaveCobrarQr = AppConfigLegado.ChaveCobrarQr;
        public const string ChaveReciboPersonalizado = AppConfigLegado.ChaveReciboPersonalizado;
        public const string ChaveChecklists = "checklists";
        public const string ChavePostosProximos = "postosProximos";
        public const string ChaveMinhaNota = "minhaNota";

        private readonly IOrganizationService system;
        private readonly Func<DateTime> utcNow;

        public AppConfigLeitor(IOrganizationService system, Func<DateTime> utcNow)
        {
            this.system = system ?? throw new ArgumentNullException(nameof(system));
            this.utcNow = utcNow ?? throw new ArgumentNullException(nameof(utcNow));
        }

        /// <summary>A chave está ligada para este funcionário agora? A ficha precisa existir (quem chama já a resolveu).</summary>
        public bool Ligado(Guid funcionarioId, string chave)
        {
            var ficha = system.Retrieve(PluginConfig.EmployeeTable, funcionarioId,
                new ColumnSet("cr40f_tipodevinculo", AppConfigLegado.ColunaCobrarQr, AppConfigLegado.ColunaReciboPersonalizado));
            var pessoa = PessoaDe(funcionarioId, ficha);
            return AppConfigResolver.Resolver(chave, Matriz(out _), pessoa, AppConfigResolver.HojeSaoPaulo(utcNow())).Ligado;
        }

        // Ponto único que monta a pessoa: linhas da tabela (abertas e encerradas, filtradas em memória) mais o legado da ficha.
        private AppConfigPessoa PessoaDe(Guid funcionarioId, Entity ficha)
        {
            var pessoa = new AppConfigPessoa { Vinculo = ficha.GetAttributeValue<OptionSetValue>("cr40f_tipodevinculo")?.Value };
            var query = new QueryExpression(TabelaPessoa) { ColumnSet = new ColumnSet("cr40f_tipo", "cr40f_chave", "cr40f_ligado", "cr40f_validade", "cr40f_encerradoem", "createdon") };
            query.Criteria.AddCondition("cr40f_funcionario", ConditionOperator.Equal, funcionarioId);
            foreach (var linha in system.RetrieveMultiple(query).Entities.OrderBy(e => e.GetAttributeValue<DateTime?>("createdon") ?? DateTime.MinValue))
            {
                var encerrada = linha.GetAttributeValue<DateTime?>("cr40f_encerradoem") != null;
                var tipo = linha.GetAttributeValue<OptionSetValue>("cr40f_tipo")?.Value;
                if (tipo == TipoPiloto) { if (!encerrada) pessoa.Piloto = true; }
                else if (tipo == TipoExcecao)
                {
                    var validade = linha.GetAttributeValue<DateTime?>("cr40f_validade");
                    pessoa.Excecoes.Add(new AppConfigExcecao
                    {
                        Chave = linha.GetAttributeValue<string>("cr40f_chave") ?? "",
                        Ligado = linha.GetAttributeValue<bool>("cr40f_ligado"),
                        Validade = validade.HasValue ? validade.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : null,
                        Encerrada = encerrada,
                    });
                }
            }
            AppConfigLegado.Aplicar(pessoa, ficha.GetAttributeValue<bool>(AppConfigLegado.ColunaCobrarQr), ficha.GetAttributeValue<bool>(AppConfigLegado.ColunaReciboPersonalizado));
            return pessoa;
        }

        /// <summary>Versão publicada mais recente. Sem publicação (ou conteúdo vazio/inválido) = matriz vazia: vale o padrão do catálogo.</summary>
        private AppConfigMatriz Matriz(out int? versao)
        {
            versao = null;
            var query = new QueryExpression(TabelaVersao) { ColumnSet = new ColumnSet("cr40f_numero", "cr40f_conteudo") };
            query.Criteria.AddCondition("cr40f_estado", ConditionOperator.Equal, Publicada);
            var linha = system.RetrieveMultiple(query).Entities.OrderByDescending(e => e.GetAttributeValue<int?>("cr40f_numero") ?? 0).FirstOrDefault();
            var matriz = new AppConfigMatriz();
            if (linha == null) return matriz;
            versao = linha.GetAttributeValue<int?>("cr40f_numero");
            var json = linha.GetAttributeValue<string>("cr40f_conteudo");
            if (string.IsNullOrWhiteSpace(json)) return matriz;
            var raiz = new JavaScriptSerializer().DeserializeObject(json) as Dictionary<string, object>;
            if (raiz == null) return matriz;
            foreach (var perfil in AppConfigResolver.Perfis)
            {
                var valores = raiz.TryGetValue(perfil, out var bruto) ? bruto as Dictionary<string, object> : null;
                if (valores == null) continue;
                foreach (var par in valores) if (par.Value is bool ligado) matriz.Do(perfil)[par.Key] = ligado;
            }
            return matriz;
        }
    }
}
