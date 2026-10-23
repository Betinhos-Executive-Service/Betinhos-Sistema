using System.Globalization;
using System.Text;

namespace Cr40f.Cadastro.Plugin;

/// <summary>Escrita mínima de JSON sem dependências (sandbox do plugin).</summary>
public static class JsonLeve
{
    public static string Texto(string? valor)
    {
        if (valor is null) return "null";
        var sb = new StringBuilder("\"");
        foreach (var c in valor)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default: if (c < ' ') sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture)); else sb.Append(c); break;
            }
        }
        return sb.Append('"').ToString();
    }
}
