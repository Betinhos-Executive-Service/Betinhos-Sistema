using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Betinhos.DriverRecordSharing
{
    // Dados já validados que entram no PDF do termo assinado.
    public sealed class TermoPdfDados
    {
        public Guid TermoId;
        public string VersaoTexto;
        public string Texto;
        public string EvidenciasJson;
        public string Motorista;
        public string TelefoneCorporativo;
        public string Forma;
        public int Parcelas;
        public decimal ValorTotal;
        public IReadOnlyList<TermoMultaCommandPlugin.Parcela> ParcelasFolha;
        public byte[] Selfie;
        public IReadOnlyList<IReadOnlyList<double[]>> Assinatura;
        public decimal? Latitude;
        public decimal? Longitude;
        public decimal? PrecisaoGps;
        public string Dispositivo;
        public DateTime AssinadoEmUtc;
    }

    public static class TermoMultaDocumento
    {
        private static readonly CultureInfo PtBr = CultureInfo.GetCultureInfo("pt-BR");

        public static byte[] Build(TermoPdfDados d)
        {
            var pdf = new MiniPdf();
            pdf.Heading("Termo de responsabilidade por multa de trânsito");
            pdf.Paragraph(d.Texto ?? "");

            pdf.Heading("Dados da multa");
            pdf.Paragraph(d.EvidenciasJson ?? "", 8);

            pdf.Heading("Acordo");
            pdf.KeyValue("Forma de pagamento", d.Forma);
            pdf.KeyValue("Valor total", Brl(d.ValorTotal));
            pdf.KeyValue("Parcelas", d.Parcelas.ToString(CultureInfo.InvariantCulture));
            foreach (var p in d.ParcelasFolha ?? new List<TermoMultaCommandPlugin.Parcela>())
                pdf.KeyValue("Parcela " + p.Numero, Brl(p.Valor) + " na folha de " + p.Competencia.ToString("MM/yyyy", PtBr));

            pdf.Heading("Assinatura");
            pdf.KeyValue("Motorista", d.Motorista);
            pdf.KeyValue("Telefone corporativo", MascararTelefone(d.TelefoneCorporativo));
            pdf.Jpeg(d.Selfie, 160, 160);
            pdf.Strokes(d.Assinatura, 300, 100);
            var local = TimeZoneInfo.ConvertTimeFromUtc(d.AssinadoEmUtc, SaoPaulo());
            pdf.KeyValue("Assinado em (Brasília)", local.ToString("dd/MM/yyyy HH:mm:ss", PtBr));
            pdf.KeyValue("Assinado em (UTC)", d.AssinadoEmUtc.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture));
            pdf.KeyValue("Localização", d.Latitude.HasValue && d.Longitude.HasValue
                ? string.Format(CultureInfo.InvariantCulture, "{0:0.000000}, {1:0.000000} (precisão {2} m)", d.Latitude, d.Longitude, d.PrecisaoGps.HasValue ? d.PrecisaoGps.Value.ToString("0.#", CultureInfo.InvariantCulture) : "?")
                : "não informada");
            pdf.KeyValue("Dispositivo", string.IsNullOrWhiteSpace(d.Dispositivo) ? "não informado" : d.Dispositivo);
            pdf.KeyValue("ID do termo", d.TermoId.ToString("D"));
            pdf.KeyValue("Versão do texto", d.VersaoTexto);
            return pdf.ToBytes();
        }

        public static string Brl(decimal valor) => "R$ " + valor.ToString("N2", PtBr);

        // (11) 90000-0003 -> (11) 9****-1234
        public static string MascararTelefone(string telefone)
        {
            var digits = new string((telefone ?? "").Where(char.IsDigit).ToArray());
            if (digits.StartsWith("55") && digits.Length > 11) digits = digits.Substring(2);
            if (digits.Length < 10) return "não informado";
            return "(" + digits.Substring(0, 2) + ") " + digits[2] + "****-" + digits.Substring(digits.Length - 4);
        }

        private static TimeZoneInfo SaoPaulo()
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById("E. South America Standard Time"); }
            catch (TimeZoneNotFoundException) { return TimeZoneInfo.CreateCustomTimeZone("BRT", TimeSpan.FromHours(-3), "BRT", "BRT"); }
        }
    }
}
