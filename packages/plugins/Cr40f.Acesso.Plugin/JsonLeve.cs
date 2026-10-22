using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Xml;
using System.Xml.Linq;

namespace Cr40f.Acesso.Plugin;

/// <summary>JSON mínimo para as respostas do Graph: objetos viram Dictionary, listas viram List, escalares viram string/bool/decimal.</summary>
public static class JsonLeve
{
    public static Dictionary<string, object?> Ler(string json)
    {
        using var reader = JsonReaderWriterFactory.CreateJsonReader(Encoding.UTF8.GetBytes(json), XmlDictionaryReaderQuotas.Max);
        var raiz = XElement.Load(reader);
        return (Dictionary<string, object?>)Converter(raiz)!;
    }

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

    private static object? Converter(XElement el)
    {
        var tipo = (string?)el.Attribute("type") ?? "string";
        switch (tipo)
        {
            case "object":
                var dic = new Dictionary<string, object?>();
                foreach (var filho in el.Elements()) dic[NomeChave(filho)] = Converter(filho);
                return dic;
            case "array":
                var lista = new List<object?>();
                foreach (var filho in el.Elements()) lista.Add(Converter(filho));
                return lista;
            case "boolean": return (bool)el;
            case "number": return decimal.Parse(el.Value, CultureInfo.InvariantCulture);
            case "null": return null;
            default: return el.Value;
        }
    }

    // Chaves com caracteres fora do nome XML vêm como <a:item item="chave">.
    private static string NomeChave(XElement el) => (string?)el.Attribute("item") ?? el.Name.LocalName;
}
