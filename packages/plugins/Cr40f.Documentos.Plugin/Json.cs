using System.IO;
using System.Runtime.Serialization.Json;
using System.Text;

namespace Cr40f.Documentos.Plugin;

/// <summary>DataContractJsonSerializer: vem com o .NET Framework, sem dependência extra no sandbox.</summary>
public static class Json
{
    public static string Serializar<T>(T valor)
    {
        var serializer = new DataContractJsonSerializer(typeof(T));
        using var stream = new MemoryStream();
        serializer.WriteObject(stream, valor);
        return Encoding.UTF8.GetString(stream.ToArray());
    }

    public static T Ler<T>(string json)
    {
        var serializer = new DataContractJsonSerializer(typeof(T));
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(json));
        return (T)serializer.ReadObject(stream);
    }
}
