using System;
using System.Text;

namespace Betinhos.DriverRecordSharing
{
    /// <summary>
    /// Aditivo do contrato para assinatura no gov.br (spec fase 3, seção 5.5). O PDF não leva data nem ID aleatório,
    /// então regenerar com o mesmo texto e funcionário dá os mesmos bytes; o assinador do ITI faz atualização
    /// incremental, então o arquivo assinado começa com esses bytes.
    /// </summary>
    public static class AditivoPdf
    {
        /// <summary>false = confere só o dicionário de assinatura (recuo se o gov.br reescrever o arquivo).</summary>
        public const bool ExigirIntegridade = true;
        public const int MaxBytes = 5 * 1024 * 1024;

        public static byte[] Gerar(string texto, string versao, Guid funcionarioId)
        {
            var pdf = new MiniPdf();
            pdf.Heading("Aditivo ao contrato de trabalho");
            pdf.Paragraph(texto ?? "");
            pdf.Heading("Identificação");
            pdf.KeyValue("Versão do texto", versao ?? "");
            pdf.KeyValue("Funcionário (ID)", funcionarioId.ToString("D"));
            pdf.Paragraph("Assine este arquivo no gov.br (assinador.iti.br) sem alterar o conteúdo.", 8);
            return pdf.ToBytes();
        }

        public static string Conferir(byte[] assinado, byte[] gerado)
        {
            if (assinado.Length > MaxBytes) return "O PDF passa de 5 MB.";
            if (assinado.Length < 5 || Encoding.ASCII.GetString(assinado, 0, 5) != "%PDF-") return "Envie o PDF assinado.";
            if (ExigirIntegridade && !ComecaCom(assinado, gerado))
                return "Este PDF não é o aditivo gerado para este funcionário com o texto vigente. Gere o aditivo de novo e peça a assinatura.";
            // A assinatura tem de estar na parte acrescentada: um /Type /Sig já no PDF gerado não conta.
            var inicio = ExigirIntegridade ? gerado.Length : 0;
            var texto = Encoding.ASCII.GetString(assinado, inicio, assinado.Length - inicio);
            var temSig = texto.Contains("/ByteRange") && (texto.Contains("/Type /Sig") || texto.Contains("/Type/Sig"));
            if (!temSig) return "Este PDF não tem assinatura digital. Assine no gov.br e envie o arquivo que o gov.br devolveu.";
            return null;
        }

        private static bool ComecaCom(byte[] a, byte[] prefixo)
        {
            if (a.Length < prefixo.Length) return false;
            for (var i = 0; i < prefixo.Length; i++) if (a[i] != prefixo[i]) return false;
            return true;
        }
    }
}
