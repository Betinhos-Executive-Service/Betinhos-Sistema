using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Xunit;

namespace Betinhos.DriverRecordSharing.Tests
{
    public sealed class TermoMultaCommandPluginTests
    {
        private const int Pendente = 100000000;
        private const int Assinado = 100000001;
        private const int Contestado = 100000002;
        private const int Expirado = 100000003;
        private const int Cancelado = 100000004;
        private const int Guia = 100000000;
        private const int Folha = 100000001;
        private const int MultaIndicada = 202410001;
        private const int MultaRecurso = 202410002;
        private static readonly DateTime Relogio = new DateTime(2026, 10, 22, 15, 4, 5, DateTimeKind.Utc);
        private const string AssinaturaValida = "[[[0.1,0.2],[0.3,0.4],[0.5,0.5]]]";

        // ---------- Upload em blocos ----------

        [Fact]
        public void BlockId_EhSeguroParaUrl_TamanhoFixo_EUnico()
        {
            var ids = Enumerable.Range(0, 10000).Select(TermoMultaCommandPlugin.BlockId).ToList();
            Assert.All(ids, id => Assert.True(id.IndexOfAny(new[] { '+', '/', '=' }) < 0, id));
            Assert.Single(ids.Select(id => id.Length).Distinct());
            Assert.Equal(ids.Count, ids.Distinct().Count());
        }

        // ---------- Enviar ----------

        [Fact]
        public void EnviarCriaTermoPendenteComTextoEvidenciasECompartilhamento()
        {
            var s = Cenario();

            var ctx = Run(s, "new_EnviarTermoMulta", s.Gestor, Acordo(s, Folha, 3, 100.00m));

            var termo = s.Rows("new_termomulta").Single();
            Assert.Equal(termo.Id, (Guid)ctx.OutputParameters["new_TermoId"]);
            Assert.Equal(Pendente, termo.GetAttributeValue<OptionSetValue>("new_status").Value);
            Assert.Equal(Relogio, termo.GetAttributeValue<DateTime>("new_enviadoem"));
            Assert.Equal(3, termo.GetAttributeValue<int>("new_parcelas"));
            Assert.Equal(100.00m, termo.GetAttributeValue<Money>("new_valortotal").Value);
            Assert.Equal(33.34m, termo.GetAttributeValue<Money>("new_valorparcela").Value);
            Assert.Equal("v1", termo.GetAttributeValue<string>("new_versaotexto"));
            var texto = termo.GetAttributeValue<string>("new_textotermo");
            Assert.Contains("Eu, João Motorista, CPF 123.456.789-00", texto);
            Assert.Contains("ABC1D23", texto);
            Assert.Contains("R$ 100,00", texto);
            Assert.Contains("Desconto em folha (3", texto);
            Assert.DoesNotContain("{", texto);
            var evid = termo.GetAttributeValue<string>("new_evidenciasjson");
            Assert.Contains("ABC1D23", evid);
            Assert.Contains("Avançar sinal", evid);
            Assert.Contains("\"infleet\"", evid);
            Assert.Equal(termo.Id, s.Multa.GetAttributeValue<EntityReference>("new_termovigente").Id);
            Assert.Contains(s.Grants, g => g.Item1 == termo.Id && g.Item2 == s.MotoristaUser.Id);
            Assert.Equal(s.Gestor, termo.GetAttributeValue<EntityReference>("new_enviadopor").Id);
        }

        [Fact]
        public void EnviarGravaErroDoInfleetESegue()
        {
            var s = Cenario();
            s.InfleetFalha = true;

            Run(s, "new_EnviarTermoMulta", s.Gestor, Acordo(s, Guia, 1, 100m));

            var evid = s.Rows("new_termomulta").Single().GetAttributeValue<string>("new_evidenciasjson");
            Assert.Contains("\"infleet\":{\"erro\":", evid.Replace(" ", ""));
        }

        [Theory]
        [InlineData("semMotorista", "A multa não tem motorista indicado.")]
        [InlineData("semAditivoData", "O motorista ainda não tem o aditivo de assinatura eletrônica registrado.")]
        [InlineData("semAditivoArquivo", "O motorista ainda não tem o aditivo de assinatura eletrônica registrado.")]
        [InlineData("termoPendente", "Já existe um termo pendente para esta multa.")]
        [InlineData("parcelas", "Escolha de 1 a 3 parcelas.")]
        [InlineData("competencia", "Competência inválida.")]
        [InlineData("valor", "Informe um valor maior que zero.")]
        [InlineData("recurso", "Há recurso pendente: o desconto só pode ser acordado depois do resultado.")]
        public void EnviarValidaComoValidarAcordo(string caso, string mensagem)
        {
            var s = Cenario();
            var p = Acordo(s, Folha, 2, 50m);
            switch (caso)
            {
                case "semMotorista": s.Multa.Attributes.Remove("cr40f_motorista"); break;
                case "semAditivoData": s.Motorista.Attributes.Remove("new_aditivoassinaturaem"); break;
                case "semAditivoArquivo": s.Motorista.Attributes.Remove("new_aditivoassinatura"); break;
                case "termoPendente": s.Add(new Entity("new_termomulta") { ["new_multa"] = s.Multa.ToEntityReference(), ["new_status"] = new OptionSetValue(Pendente) }); break;
                case "parcelas": p["new_Parcelas"] = 4; break;
                case "competencia": p["new_PrimeiraCompetencia"] = new DateTime(2026, 11, 2, 0, 0, 0, DateTimeKind.Utc); break;
                case "valor": p["new_ValorTotal"] = 0.01m; break;
                case "recurso": s.Multa["new_recursopendente"] = true; break;
            }

            var error = Assert.Throws<InvalidPluginExecutionException>(() => Run(s, "new_EnviarTermoMulta", s.Gestor, p));

            Assert.Equal(mensagem, error.Message);
        }

        [Fact]
        public void GuiaComRecursoPendentePodeSerEnviada()
        {
            var s = Cenario();
            s.Multa["new_recursopendente"] = true;

            Run(s, "new_EnviarTermoMulta", s.Gestor, Acordo(s, Guia, 1, 80m));

            Assert.Single(s.Rows("new_termomulta"));
        }

        [Fact]
        public void EnviarSemPushDisponivelNaoQuebraERegistraAviso()
        {
            var s = Cenario();
            Run(s, "new_EnviarTermoMulta", s.Gestor, Acordo(s, Guia, 1, 80m));
            Assert.Contains(s.Traces, t => t.Contains("push"));
        }

        [Fact]
        public void ParcelasDistribuemCentavosComoNoSistema()
        {
            var parcelas = TermoMultaCommandPlugin.CalcularParcelas(100.00m, 3, new DateTime(2026, 11, 1));
            Assert.Equal(new[] { 33.34m, 33.33m, 33.33m }, parcelas.Select(p => p.Valor));
            Assert.Equal(new[] { new DateTime(2026, 11, 1), new DateTime(2026, 12, 1), new DateTime(2027, 1, 1) }, parcelas.Select(p => p.Competencia));
            Assert.Equal(new[] { 0.34m, 0.33m, 0.33m }, TermoMultaCommandPlugin.CalcularParcelas(1.00m, 3, new DateTime(2026, 1, 1)).Select(p => p.Valor));
            Assert.Equal(new[] { 0.51m, 0.50m }, TermoMultaCommandPlugin.CalcularParcelas(1.005m, 2, new DateTime(2026, 1, 1)).Select(p => p.Valor));
        }

        // ---------- Assinar ----------

        [Fact]
        public void AssinarTermoDeOutroMotoristaEhRecusado()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Folha, 3, 100m);
            var outro = s.Add(new Entity("cr40f_funcionarios") { ["cr40f_emailmicrosoft"] = "outro@empresa.test", ["statecode"] = new OptionSetValue(0) });
            var outroUser = s.Add(new Entity("systemuser") { ["internalemailaddress"] = "outro@empresa.test", ["isdisabled"] = false });

            var error = Assert.Throws<InvalidPluginExecutionException>(() => Run(s, "new_AssinarTermoMulta", outroUser.Id, Assinatura(termo)));

            Assert.Equal("Este termo não é seu.", error.Message);
            Assert.Equal(Pendente, Status(termo));
        }

        [Fact]
        public void AssinarSemAditivoEhRecusado()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Folha, 3, 100m);
            s.Motorista.Attributes.Remove("new_aditivoassinatura");

            var error = Assert.Throws<InvalidPluginExecutionException>(() => Run(s, "new_AssinarTermoMulta", s.MotoristaUser.Id, Assinatura(termo)));

            Assert.Equal("O motorista ainda não tem o aditivo de assinatura eletrônica registrado.", error.Message);
        }

        [Fact]
        public void AssinarTermoJaAssinadoEhRecusado()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Folha, 3, 100m);
            termo["new_status"] = new OptionSetValue(Assinado);

            var error = Assert.Throws<InvalidPluginExecutionException>(() => Run(s, "new_AssinarTermoMulta", s.MotoristaUser.Id, Assinatura(termo)));

            Assert.Contains("não está mais pendente", error.Message);
        }

        [Theory]
        [InlineData("")]
        [InlineData("[]")]
        [InlineData("[[[0.1,0.2]]]")]
        public void AssinaturaVaziaEhRecusada(string json)
        {
            var s = Cenario();
            var termo = TermoPendente(s, Folha, 3, 100m);
            var p = Assinatura(termo);
            p["new_AssinaturaJson"] = json;

            Assert.Throws<InvalidPluginExecutionException>(() => Run(s, "new_AssinarTermoMulta", s.MotoristaUser.Id, p));
            Assert.Equal(Pendente, Status(termo));
        }

        [Fact]
        public void AssinarGravaRelogioDoServidorHashDoPdfMultaIndicadaETresParcelas()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Folha, 3, 100m);
            var p = Assinatura(termo);
            p["new_AssinadoEm"] = new DateTime(2020, 1, 1); // ignorado: o horário vem do servidor

            var ctx = Run(s, "new_AssinarTermoMulta", s.MotoristaUser.Id, p);

            Assert.Equal(Assinado, Status(termo));
            Assert.Equal(Relogio, termo.GetAttributeValue<DateTime>("new_assinadoem"));
            Assert.NotNull(s.UploadedPdf);
            Assert.StartsWith("%PDF-1.4", Encoding.ASCII.GetString(s.UploadedPdf, 0, 8));
            var hash = Sha256Hex.Of(s.UploadedPdf);
            Assert.Equal(hash, termo.GetAttributeValue<string>("new_hashpdf"));
            Assert.Equal(hash, (string)ctx.OutputParameters["new_HashPdf"]);
            Assert.Equal(AssinaturaValida, termo.GetAttributeValue<string>("new_assinaturajson"));
            Assert.Equal(-23.55m, termo.GetAttributeValue<decimal>("new_latitude"));
            Assert.False(termo.Contains("new_assinatura"));
            Assert.Equal(MultaIndicada, s.Multa.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
            var parcelas = s.Rows("new_parcelamultafolha").OrderBy(r => r.GetAttributeValue<int>("new_numero")).ToList();
            Assert.Equal(3, parcelas.Count);
            Assert.Equal(100m, parcelas.Sum(r => r.GetAttributeValue<Money>("new_valor").Value));
            Assert.Equal(33.34m, parcelas[0].GetAttributeValue<Money>("new_valor").Value);
            Assert.All(parcelas, r => Assert.Equal(100000000, r.GetAttributeValue<OptionSetValue>("new_status").Value));
            Assert.Equal(new DateTime(2027, 1, 1), parcelas[2].GetAttributeValue<DateTime>("new_competencia"));
        }

        [Fact]
        public void AssinarFolhaComRecursoPendenteEhRecusado()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Folha, 3, 100m);
            s.Multa["new_recursopendente"] = true;

            var error = Assert.Throws<InvalidPluginExecutionException>(() => Run(s, "new_AssinarTermoMulta", s.MotoristaUser.Id, Assinatura(termo)));

            Assert.Equal("Há recurso pendente: o desconto só pode ser acordado depois do resultado.", error.Message);
            Assert.Equal(Pendente, Status(termo));
            Assert.Empty(s.Rows("new_parcelamultafolha"));
        }

        [Fact]
        public void AssinarGuiaComRecursoPendenteNaoMudaStatusDaMulta()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Guia, 1, 100m);
            s.Multa["new_recursopendente"] = true;
            s.Multa["cr40f_status"] = new OptionSetValue(MultaRecurso);

            Run(s, "new_AssinarTermoMulta", s.MotoristaUser.Id, Assinatura(termo));

            Assert.Equal(Assinado, Status(termo));
            Assert.Equal(MultaRecurso, s.Multa.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
            Assert.Empty(s.Rows("new_parcelamultafolha"));
        }

        [Fact]
        public void SelfieBase64GrandeDemaisEhRecusadaAntesDeDecodificar()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Guia, 1, 100m);
            var p = Assinatura(termo);
            p["new_SelfieBase64"] = new string('A', 2000004);

            var error = Assert.Throws<InvalidPluginExecutionException>(() => Run(s, "new_AssinarTermoMulta", s.MotoristaUser.Id, p));

            Assert.Equal("A selfie deve ter até 1,5 MB.", error.Message);
        }

        [Fact]
        public void AssinarGuiaNaoGeraParcelas()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Guia, 1, 100m);

            Run(s, "new_AssinarTermoMulta", s.MotoristaUser.Id, Assinatura(termo));

            Assert.Empty(s.Rows("new_parcelamultafolha"));
        }

        [Fact]
        public void SelfieQueNaoEhJpegEhRecusada()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Guia, 1, 100m);
            var p = Assinatura(termo);
            p["new_SelfieBase64"] = Convert.ToBase64String(Encoding.ASCII.GetBytes("nao e jpeg"));

            Assert.Throws<InvalidPluginExecutionException>(() => Run(s, "new_AssinarTermoMulta", s.MotoristaUser.Id, p));
        }

        // ---------- Contestar / Cancelar / Expirar ----------

        [Fact]
        public void ContestarMarcaContestadoERecursoSemParcelas()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Folha, 3, 100m);

            Run(s, "new_ContestarTermoMulta", s.MotoristaUser.Id, new Dictionary<string, object> { ["new_TermoId"] = termo.Id, ["new_Motivo"] = "Não era eu dirigindo naquele dia." });

            Assert.Equal(Contestado, Status(termo));
            Assert.Equal(Relogio, termo.GetAttributeValue<DateTime>("new_assinadoem"));
            Assert.Equal("Não era eu dirigindo naquele dia.", termo.GetAttributeValue<string>("new_motivocontestacao"));
            Assert.Equal(MultaRecurso, s.Multa.GetAttributeValue<OptionSetValue>("cr40f_status").Value);
            Assert.True(s.Multa.GetAttributeValue<bool>("new_recursopendente"));
            Assert.Empty(s.Rows("new_parcelamultafolha"));
        }

        [Fact]
        public void ContestarComMotivoCurtoEhRecusado()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Folha, 3, 100m);
            Assert.Throws<InvalidPluginExecutionException>(() => Run(s, "new_ContestarTermoMulta", s.MotoristaUser.Id, new Dictionary<string, object> { ["new_TermoId"] = termo.Id, ["new_Motivo"] = "curto" }));
        }

        [Theory]
        [InlineData("new_CancelarTermoMulta", Cancelado)]
        [InlineData("new_ExpirarTermoMulta", Expirado)]
        public void CancelarEExpirarSoDePendente(string api, int esperado)
        {
            var s = Cenario();
            var termo = TermoPendente(s, Guia, 1, 100m);
            termo["new_enviadoem"] = Relogio.AddDays(-7);

            Assert.Equal(termo.Id, s.Multa.GetAttributeValue<EntityReference>("new_termovigente").Id);
            Run(s, api, s.Gestor, new Dictionary<string, object> { ["new_TermoId"] = termo.Id });
            Assert.Equal(esperado, Status(termo));
            Assert.Null(s.Multa.GetAttributeValue<EntityReference>("new_termovigente"));

            Assert.Throws<InvalidPluginExecutionException>(() => Run(s, api, s.Gestor, new Dictionary<string, object> { ["new_TermoId"] = termo.Id }));
        }

        [Fact]
        public void ExpirarDentroDoPrazoDeAssinaturaEhRecusado()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Guia, 1, 100m);
            termo["new_enviadoem"] = Relogio.AddDays(-7).AddMinutes(1);

            var error = Assert.Throws<InvalidPluginExecutionException>(() => Run(s, "new_ExpirarTermoMulta", s.Gestor, new Dictionary<string, object> { ["new_TermoId"] = termo.Id }));

            Assert.Equal("Este termo ainda está no prazo de assinatura.", error.Message);
            Assert.Equal(Pendente, Status(termo));
            Assert.Equal(termo.Id, s.Multa.GetAttributeValue<EntityReference>("new_termovigente").Id);
        }

        [Fact]
        public void CancelarDentroDoPrazoEhPermitido()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Guia, 1, 100m);

            Run(s, "new_CancelarTermoMulta", s.Gestor, new Dictionary<string, object> { ["new_TermoId"] = termo.Id });

            Assert.Equal(Cancelado, Status(termo));
        }

        // ---------- Trava ----------

        [Fact]
        public void UpdateDeTermoAssinadoPorUsuarioEhBloqueado()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Guia, 1, 100m);
            termo["new_status"] = new OptionSetValue(Assinado);

            var error = Assert.Throws<InvalidPluginExecutionException>(() => Guard(s, "Update", new Entity("new_termomulta", termo.Id) { ["new_status"] = new OptionSetValue(Pendente) }));

            Assert.Equal("Termo assinado não pode ser alterado nem excluído.", error.Message);
        }

        [Fact]
        public void UpdateSoDaCopiaEnviadaEhPermitidoParaQualquerUsuario()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Guia, 1, 100m);
            termo["new_status"] = new OptionSetValue(Assinado);

            AllowedGuard(s, "Update", new Entity("new_termomulta", termo.Id) { ["new_copiaenviadaem"] = Relogio, ["new_copiacanal"] = "whatsapp", ["new_termomultaid"] = termo.Id, ["modifiedon"] = Relogio, ["modifiedby"] = new EntityReference("systemuser", Guid.NewGuid()), ["exchangerate"] = 1m, ["timezoneruleversionnumber"] = 4 });
        }

        [Fact]
        public void UpdateDeTermoPendenteEhPermitido()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Guia, 1, 100m);
            AllowedGuard(s, "Update", new Entity("new_termomulta", termo.Id) { ["new_name"] = "x" });
        }

        // 1) Mesmo Pendente, ninguem fora do plugin muda status nem colunas de assinatura/envio.
        [Theory]
        [InlineData("new_status")]
        [InlineData("new_assinadoem")]
        [InlineData("new_hashpdf")]
        [InlineData("new_selfie")]
        [InlineData("new_assinaturajson")]
        [InlineData("new_assinatura")]
        [InlineData("new_pdf")]
        [InlineData("new_latitude")]
        [InlineData("new_longitude")]
        [InlineData("new_precisaogps")]
        [InlineData("new_dispositivo")]
        [InlineData("new_enviadoem")]
        [InlineData("new_motivocontestacao")]
        [InlineData("new_textotermo")]
        [InlineData("new_versaotexto")]
        [InlineData("new_evidenciasjson")]
        [InlineData("new_formapagamento")]
        [InlineData("new_parcelas")]
        [InlineData("new_valortotal")]
        [InlineData("new_valorparcela")]
        [InlineData("new_primeiracompetencia")]
        [InlineData("new_multa")]
        [InlineData("new_motorista")]
        [InlineData("new_ultimolembreteem")]
        [InlineData("new_enviadopor")]
        public void UpdateDeColunaProtegidaEmTermoPendenteEhBloqueado(string coluna)
        {
            var s = Cenario();
            var termo = TermoPendente(s, Guia, 1, 100m);

            var error = Assert.Throws<InvalidPluginExecutionException>(() => Guard(s, "Update", new Entity("new_termomulta", termo.Id) { [coluna] = "x" }));

            Assert.Equal("Termo assinado não pode ser alterado nem excluído.", error.Message);
        }

        [Fact]
        public void UpdateSoDaCopiaEmTermoPendenteEhPermitido()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Guia, 1, 100m);
            AllowedGuard(s, "Update", new Entity("new_termomulta", termo.Id) { ["new_copiaenviadaem"] = Relogio, ["new_copiacanal"] = "email" });
        }

        [Fact]
        public void CreateDeParcelaForaDoPluginEhBloqueado()
        {
            var s = Cenario();
            var error = Assert.Throws<InvalidPluginExecutionException>(() => Guard(s, "Create", new Entity("new_parcelamultafolha") { ["new_valor"] = new Money(1m) }));
            Assert.Equal("Parcela de multa só é criada pela assinatura do termo.", error.Message);
        }

        [Fact]
        public void CreateDeParcelaPeloPluginEhPermitido()
        {
            var s = Cenario();
            AllowedGuard(s, "Create", new Entity("new_parcelamultafolha") { ["new_valor"] = new Money(1m) }, new RemoteExecutionContext { MessageName = "new_AssinarTermoMulta" });
        }

        [Fact]
        public void DeleteDeTermoAssinadoEhBloqueado()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Guia, 1, 100m);
            termo["new_status"] = new OptionSetValue(Contestado);

            var error = Assert.Throws<InvalidPluginExecutionException>(() => Guard(s, "Delete", new EntityReference("new_termomulta", termo.Id)));

            Assert.Equal("Termo assinado não pode ser alterado nem excluído.", error.Message);
        }

        [Fact]
        public void GravacaoDoProprioPluginPassaPelaTrava()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Guia, 1, 100m);
            termo["new_status"] = new OptionSetValue(Assinado);
            var parent = new RemoteExecutionContext { MessageName = "new_AssinarTermoMulta" };
            parent.SharedVariables["termo_server_write"] = true;

            AllowedGuard(s, "Update", new Entity("new_termomulta", termo.Id) { ["new_hashpdf"] = "x" }, parent);
        }

        [Fact]
        public void VariavelCompartilhadaNoContextoRaizNaoLiberaTrava()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Guia, 1, 100m);
            termo["new_status"] = new OptionSetValue(Assinado);

            Assert.Throws<InvalidPluginExecutionException>(() => Guard(s, "Update", new Entity("new_termomulta", termo.Id) { ["new_hashpdf"] = "x" }, null, spoof: true));
        }

        [Theory]
        [InlineData(100000001, true)]
        [InlineData(100000002, true)]
        [InlineData(100000000, false)]
        public void ParcelaSoMudaDePrevistaParaDescontadaOuCancelada(int novo, bool permitido)
        {
            var s = Cenario();
            var parcela = s.Add(new Entity("new_parcelamultafolha") { ["new_status"] = new OptionSetValue(100000000) });
            var target = new Entity("new_parcelamultafolha", parcela.Id) { ["new_status"] = new OptionSetValue(novo) };
            if (permitido) AllowedGuard(s, "Update", target);
            else Assert.Throws<InvalidPluginExecutionException>(() => Guard(s, "Update", target));
        }

        [Fact]
        public void ParcelaNaoMudaValorNemEhExcluida()
        {
            var s = Cenario();
            var parcela = s.Add(new Entity("new_parcelamultafolha") { ["new_status"] = new OptionSetValue(100000000) });
            Assert.Throws<InvalidPluginExecutionException>(() => Guard(s, "Update", new Entity("new_parcelamultafolha", parcela.Id) { ["new_valor"] = new Money(1m) }));
            Assert.Throws<InvalidPluginExecutionException>(() => Guard(s, "Delete", new EntityReference("new_parcelamultafolha", parcela.Id)));
        }

        // ---------- Baixar PDF / Lembrar / Aditivo ----------

        private static Entity TermoAssinado(Scenario s)
        {
            var termo = TermoPendente(s, Guia, 1, 100m);
            Run(s, "new_AssinarTermoMulta", s.MotoristaUser.Id, Assinatura(termo));
            return termo;
        }

        [Fact]
        public void BaixarPdfDevolveBase64ParaODonoDoTermo()
        {
            var s = Cenario();
            var termo = TermoAssinado(s);

            var ctx = Run(s, "new_BaixarPdfTermoMulta", s.MotoristaUser.Id, new Dictionary<string, object> { ["new_TermoId"] = termo.Id });

            Assert.Equal(s.UploadedPdf, Convert.FromBase64String((string)ctx.OutputParameters["new_PdfBase64"]));
            Assert.Equal(termo.GetAttributeValue<string>("new_name") + ".pdf", (string)ctx.OutputParameters["new_NomeArquivo"]);
        }

        [Fact]
        public void BaixarPdfLiberadoParaQuemPodeCriarTermo()
        {
            var s = Cenario();
            var termo = TermoAssinado(s);
            s.Privilegiados.Add(s.Gestor);

            var ctx = Run(s, "new_BaixarPdfTermoMulta", s.Gestor, new Dictionary<string, object> { ["new_TermoId"] = termo.Id });

            Assert.Equal(s.UploadedPdf, Convert.FromBase64String((string)ctx.OutputParameters["new_PdfBase64"]));
        }

        [Fact]
        public void BaixarPdfDeOutroMotoristaEhNegado()
        {
            var s = Cenario();
            var termo = TermoAssinado(s);

            var error = Assert.Throws<InvalidPluginExecutionException>(() => Run(s, "new_BaixarPdfTermoMulta", s.Gestor, new Dictionary<string, object> { ["new_TermoId"] = termo.Id }));

            Assert.Equal("Este termo não é seu.", error.Message);
        }

        [Fact]
        public void BaixarPdfDeTermoSemPdfInformaQueAindaNaoFoiAssinado()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Guia, 1, 100m);

            var error = Assert.Throws<InvalidPluginExecutionException>(() => Run(s, "new_BaixarPdfTermoMulta", s.MotoristaUser.Id, new Dictionary<string, object> { ["new_TermoId"] = termo.Id }));

            Assert.Equal("Este termo ainda não tem PDF assinado.", error.Message);
        }

        [Fact]
        public void LembrarGravaHorarioDoServidorERecusaSegundoEm24Horas()
        {
            var s = Cenario();
            var termo = TermoPendente(s, Guia, 1, 100m);
            var p = new Dictionary<string, object> { ["new_TermoId"] = termo.Id };

            Run(s, "new_LembrarTermoMulta", s.Gestor, p);
            Assert.Equal(Relogio, termo.GetAttributeValue<DateTime>("new_ultimolembreteem"));

            var error = Assert.Throws<InvalidPluginExecutionException>(() => Run(s, "new_LembrarTermoMulta", s.Gestor, p));
            Assert.Equal("Já foi enviado um lembrete nas últimas 24 horas.", error.Message);

            termo["new_ultimolembreteem"] = Relogio.AddHours(-24);
            Run(s, "new_LembrarTermoMulta", s.Gestor, p);
            Assert.Equal(Relogio, termo.GetAttributeValue<DateTime>("new_ultimolembreteem"));
        }

        [Fact]
        public void LembrarSoAceitaTermoPendente()
        {
            var s = Cenario();
            var termo = TermoAssinado(s);

            var error = Assert.Throws<InvalidPluginExecutionException>(() => Run(s, "new_LembrarTermoMulta", s.Gestor, new Dictionary<string, object> { ["new_TermoId"] = termo.Id }));

            Assert.Equal("Só é possível lembrar termo pendente.", error.Message);
        }

        [Theory]
        [InlineData("comAditivo", true)]
        [InlineData("semData", false)]
        [InlineData("semArquivo", false)]
        [InlineData("naoMotorista", false)]
        public void ConsultarAditivoDevolveSoUmBooleano(string caso, bool esperado)
        {
            var s = Cenario();
            var user = s.MotoristaUser.Id;
            if (caso == "semData") s.Motorista.Attributes.Remove("new_aditivoassinaturaem");
            if (caso == "semArquivo") s.Motorista.Attributes.Remove("new_aditivoassinatura");
            if (caso == "naoMotorista") user = s.Gestor;

            var ctx = Run(s, "new_ConsultarAditivoMotorista", user, new Dictionary<string, object>());

            Assert.Equal(esperado, (bool)ctx.OutputParameters["new_TemAditivo"]);
            Assert.Single(ctx.OutputParameters);
        }

        private static void DuplicarFuncionario(Scenario s) =>
            s.Add(new Entity("cr40f_funcionarios") { ["cr40f_emailmicrosoft"] = "joao@empresa.test", ["statecode"] = new OptionSetValue(0) });

        [Fact]
        public void ConsultarAditivoComCadastroDuplicadoFalhaComMotivo()
        {
            var s = Cenario();
            DuplicarFuncionario(s);

            var error = Assert.Throws<InvalidPluginExecutionException>(() => Run(s, "new_ConsultarAditivoMotorista", s.MotoristaUser.Id, new Dictionary<string, object>()));

            Assert.Equal("Seu cadastro está duplicado. Procure o escritório.", error.Message);
            Assert.Contains(s.Traces, t => t.Contains("cadastro duplicado"));
        }

        [Fact]
        public void BaixarPdfComCadastroDuplicadoFalhaComMotivo()
        {
            var s = Cenario();
            var termo = TermoAssinado(s);
            DuplicarFuncionario(s);

            var error = Assert.Throws<InvalidPluginExecutionException>(() => Run(s, "new_BaixarPdfTermoMulta", s.MotoristaUser.Id, new Dictionary<string, object> { ["new_TermoId"] = termo.Id }));

            Assert.Equal("Seu cadastro está duplicado. Procure o escritório.", error.Message);
        }

        // ---------- Infra ----------

        private static int Status(Entity termo) => termo.GetAttributeValue<OptionSetValue>("new_status").Value;

        private static Dictionary<string, object> Acordo(Scenario s, int forma, int parcelas, decimal valor) => new Dictionary<string, object>
        {
            ["new_MultaId"] = s.Multa.Id,
            ["new_FormaPagamento"] = forma,
            ["new_Parcelas"] = parcelas,
            ["new_ValorTotal"] = valor,
            ["new_PrimeiraCompetencia"] = new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc),
        };

        private static Dictionary<string, object> Assinatura(Entity termo) => new Dictionary<string, object>
        {
            ["new_TermoId"] = termo.Id,
            ["new_SelfieBase64"] = Convert.ToBase64String(TinyJpeg()),
            ["new_AssinaturaJson"] = AssinaturaValida,
            ["new_Latitude"] = -23.55m,
            ["new_Longitude"] = -46.63m,
            ["new_PrecisaoGps"] = 12.5m,
            ["new_Dispositivo"] = "Mozilla/5.0 App Motoristas v2",
        };

        private static Entity TermoPendente(Scenario s, int forma, int parcelas, decimal valor)
        {
            Run(s, "new_EnviarTermoMulta", s.Gestor, Acordo(s, forma, parcelas, valor));
            return s.Rows("new_termomulta").Single();
        }

        private static RemoteExecutionContext Run(Scenario s, string message, Guid user, Dictionary<string, object> inputs)
        {
            var ctx = new RemoteExecutionContext { MessageName = message, InitiatingUserId = user, UserId = user, Depth = 1 };
            foreach (var input in inputs) ctx.InputParameters[input.Key] = input.Value;
            new TermoMultaCommandPlugin(() => Relogio, () => s).Execute(new Provider(ctx, s));
            return ctx;
        }

        private static void AllowedGuard(Scenario s, string message, object target, RemoteExecutionContext parent = null) =>
            Assert.Null(Record.Exception(() => Guard(s, message, target, parent)));

        private static void Guard(Scenario s, string message, object target, RemoteExecutionContext parent = null, bool spoof = false)
        {
            var name = target is Entity e ? e.LogicalName : ((EntityReference)target).LogicalName;
            var ctx = new RemoteExecutionContext { MessageName = message, PrimaryEntityName = name, InitiatingUserId = Guid.NewGuid(), Stage = 20, Depth = parent == null ? 1 : 2, ParentContext = parent };
            if (spoof) ctx.SharedVariables["termo_server_write"] = true;
            ctx.InputParameters["Target"] = target;
            new TermoMultaCommandPlugin(() => Relogio, () => s).Execute(new Provider(ctx, s));
        }

        private static byte[] TinyJpeg()
        {
            using (var bmp = new System.Drawing.Bitmap(4, 4))
            using (var ms = new System.IO.MemoryStream())
            {
                bmp.Save(ms, System.Drawing.Imaging.ImageFormat.Jpeg);
                return ms.ToArray();
            }
        }

        private static Scenario Cenario()
        {
            var s = new Scenario();
            var gestor = s.Add(new Entity("systemuser") { ["internalemailaddress"] = "gestor@empresa.test", ["isdisabled"] = false });
            s.Gestor = gestor.Id;
            s.Motorista = s.Add(new Entity("cr40f_funcionarios")
            {
                ["cr40f_nomecompleto"] = "João Motorista",
                ["cr40f_numerodocpf"] = "123.456.789-00",
                ["cr40f_emailmicrosoft"] = "joao@empresa.test",
                ["cr40f_telefonecorporativo"] = "(11) 90000-0003",
                ["new_aditivoassinaturaem"] = new DateTime(2026, 10, 1),
                ["new_aditivoassinatura"] = Guid.NewGuid(),
                ["statecode"] = new OptionSetValue(0),
            });
            s.MotoristaUser = s.Add(new Entity("systemuser") { ["internalemailaddress"] = "joao@empresa.test", ["isdisabled"] = false, ["fullname"] = "João" });
            var veiculo = s.Add(new Entity("cr40f_veiculos") { ["cr40f_placa"] = "ABC1D23" });
            var infracao = s.Add(new Entity("cr40f_infracaodetransito") { ["cr40f_codigodainfracao"] = "605-03", ["cr40f_descricaodainfracao"] = "Avançar sinal vermelho", ["cr40f_valordamulta"] = new Money(293.47m) });
            s.Multa = s.Add(new Entity("cr40f_multas")
            {
                ["cr40f_novacoluna"] = "Multa teste",
                ["cr40f_dataehorario"] = new DateTime(2026, 10, 10, 13, 0, 0, DateTimeKind.Utc),
                ["cr40f_localdainfracao"] = "Av. Paulista, 1000",
                ["cr40f_placa"] = veiculo.ToEntityReference(),
                ["cr40f_motorista"] = s.Motorista.ToEntityReference(),
                ["cr40f_codigodainfracao"] = infracao.ToEntityReference(),
                ["new_valorguia"] = new Money(293.47m),
                ["new_recursopendente"] = false,
                ["cr40f_status"] = new OptionSetValue(202410000),
            });
            s.Add(new Entity("new_textotermomulta") { ["new_versao"] = "v1", ["new_tipo"] = new OptionSetValue(100000000), ["new_vigente"] = true, ["new_texto"] = "Eu, {motorista}, CPF {cpf}, reconheço a infração {infracao} com o veículo {placa}, no valor de {valor}: {forma} ({parcelas} parcela(s))." });
            s.Add(new Entity("new_textotermomulta") { ["new_versao"] = "a1", ["new_tipo"] = new OptionSetValue(100000001), ["new_vigente"] = true, ["new_texto"] = "ADITIVO {motorista}" });
            return s;
        }

        private sealed class Provider : IServiceProvider, IOrganizationServiceFactory, ITracingService
        {
            private readonly IPluginExecutionContext ctx;
            private readonly Scenario service;
            public Provider(IPluginExecutionContext ctx, Scenario service) { this.ctx = ctx; this.service = service; }
            public object GetService(Type type)
            {
                if (type == typeof(IPluginExecutionContext)) return ctx;
                if (type == typeof(IOrganizationServiceFactory)) return this;
                if (type == typeof(ITracingService)) return this;
                return null;
            }
            public IOrganizationService CreateOrganizationService(Guid? userId) => service;
            public void Trace(string format, params object[] args) => service.Traces.Add(args == null || args.Length == 0 ? format : string.Format(format, args));
        }

        internal sealed class Scenario : IOrganizationService, ITermoInfleet
        {
            private readonly Dictionary<string, List<Entity>> tables = new Dictionary<string, List<Entity>>();
            public readonly List<Tuple<Guid, Guid>> Grants = new List<Tuple<Guid, Guid>>();
            public readonly List<string> Traces = new List<string>();
            public Guid Gestor;
            public Entity Motorista, MotoristaUser, Multa;
            public bool InfleetFalha;
            public byte[] UploadedPdf;
            public readonly HashSet<Guid> Privilegiados = new HashSet<Guid>();
            private readonly List<byte[]> blocks = new List<byte[]>();

            public List<Entity> Rows(string table)
            {
                if (!tables.TryGetValue(table, out var rows)) tables[table] = rows = new List<Entity>();
                return rows;
            }

            public Entity Add(Entity entity)
            {
                if (entity.Id == Guid.Empty) entity.Id = Guid.NewGuid();
                Rows(entity.LogicalName).Add(entity);
                return entity;
            }

            public Dictionary<string, object> Coletar(string placa, DateTime infracaoUtc)
            {
                if (InfleetFalha) throw new InfleetUnavailableException("Infleet fora do ar.");
                return new Dictionary<string, object> { ["veiculo"] = placa, ["viagens"] = new object[0] };
            }

            public Guid Create(Entity entity)
            {
                var copy = new Entity(entity.LogicalName, entity.Id == Guid.Empty ? Guid.NewGuid() : entity.Id);
                foreach (var a in entity.Attributes) copy[a.Key] = a.Value;
                Add(copy);
                return copy.Id;
            }

            public void Update(Entity entity)
            {
                var existing = Rows(entity.LogicalName).Single(r => r.Id == entity.Id);
                foreach (var a in entity.Attributes) existing[a.Key] = a.Value;
            }

            public Entity Retrieve(string entityName, Guid id, ColumnSet columnSet) =>
                Rows(entityName).SingleOrDefault(r => r.Id == id) ?? throw new InvalidOperationException("Registro inesperado: " + entityName);

            public EntityCollection RetrieveMultiple(QueryBase query)
            {
                var q = (QueryExpression)query;
                IEnumerable<Entity> rows = Rows(q.EntityName);
                foreach (var c in q.Criteria.Conditions)
                    rows = rows.Where(r => Matches(r, c));
                return new EntityCollection(rows.ToList());
            }

            private static bool Matches(Entity row, ConditionExpression c)
            {
                object Norm(object v) => v is OptionSetValue o ? o.Value : v is EntityReference e ? e.Id : (object)v;
                var value = Norm(row.Contains(c.AttributeName) ? row[c.AttributeName] : null);
                if (c.AttributeName == "statecode" && value == null) value = 0;
                switch (c.Operator)
                {
                    case ConditionOperator.Equal:
                        return Equals(value, Norm(c.Values[0])) || (value is string t && string.Equals(t, Convert.ToString(c.Values[0]), StringComparison.OrdinalIgnoreCase));
                    case ConditionOperator.In:
                        return c.Values.Select(Norm).Any(v => Equals(v, value));
                    default: throw new NotSupportedException(c.Operator.ToString());
                }
            }

            public OrganizationResponse Execute(OrganizationRequest request)
            {
                var response = new OrganizationResponse();
                switch (request.RequestName)
                {
                    case "GrantAccess":
                        var target = (EntityReference)request.Parameters["Target"];
                        var principal = (Microsoft.Crm.Sdk.Messages.PrincipalAccess)request.Parameters["PrincipalAccess"];
                        Grants.Add(Tuple.Create(target.Id, principal.Principal.Id));
                        return response;
                    case "InitializeFileBlocksUpload":
                        blocks.Clear();
                        response.Results["FileContinuationToken"] = "tok";
                        return response;
                    case "UploadBlock":
                        blocks.Add((byte[])request.Parameters["BlockData"]);
                        return response;
                    case "CommitFileBlocksUpload":
                        UploadedPdf = blocks.SelectMany(b => b).ToArray();
                        response.Results["FileId"] = Guid.NewGuid();
                        response.Results["FileSizeInBytes"] = (long)UploadedPdf.Length;
                        return response;
                    case "InitializeFileBlocksDownload":
                        if (UploadedPdf == null) throw new InvalidOperationException("No file attachment found");
                        response.Results["FileContinuationToken"] = "down";
                        response.Results["FileSizeInBytes"] = (long)UploadedPdf.Length;
                        response.Results["FileName"] = "x.pdf";
                        return response;
                    case "DownloadBlock":
                        var offset = (long)request.Parameters["Offset"];
                        var length = (long)request.Parameters["BlockLength"];
                        response.Results["Data"] = UploadedPdf.Skip((int)offset).Take((int)Math.Min(length, 7)).ToArray();
                        return response;
                    case "RetrieveUserPrivilegeByPrivilegeName":
                        var granted = Privilegiados.Contains((Guid)request.Parameters["UserId"]) && (string)request.Parameters["PrivilegeName"] == "prvCreatenew_TermoMulta";
                        response.Results["RolePrivileges"] = granted ? new[] { new Microsoft.Crm.Sdk.Messages.RolePrivilege() } : new Microsoft.Crm.Sdk.Messages.RolePrivilege[0];
                        return response;
                    default: throw new NotSupportedException(request.RequestName);
                }
            }

            public void Delete(string entityName, Guid id) => throw new NotSupportedException();
            public void Associate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
            public void Disassociate(string entityName, Guid entityId, Relationship relationship, EntityReferenceCollection relatedEntities) => throw new NotSupportedException();
        }
    }
}
