using Cr40f.Financeiro.Plugin;
using Xunit;

public class SmokeTests
{
    [Fact]
    public void SnapshotVazioNaoQuebra()
    {
        var op = new OpSnapshot { Id = System.Guid.NewGuid(), Status = Codigos.OpAberta };
        Assert.Empty(op.Pagantes);
    }
}
