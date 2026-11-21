using Liandan.Kernel;

internal static class MathBits
{
    internal static int Run(string path)
    {
        using var stream = File.OpenRead(path);
        using var reader = new BinaryReader(stream);
        if (!reader.ReadBytes(8).SequenceEqual("JSMATH02"u8.ToArray()) || stream.Length <= 8 || (stream.Length - 8) % 80 != 0)
            throw new InvalidDataException("数学对拍文件头或长度错误");
        string[] names = { "Math.pow", "**", "log", "log2", "log10", "exp", "优化 x ** 2", "优化 x ** 0.5" };
        var differences = new int[names.Length];
        int count = 0;
        while (stream.Position < stream.Length)
        {
            double x = reader.ReadDouble(), y = reader.ReadDouble();
            double pow = JsMath.Pow(x, y);
            Check(0, pow);
            Check(1, pow);
            Check(2, JsMath.Log(x));
            Check(3, JsMath.Log2(x));
            Check(4, JsMath.Log10(x));
            Check(5, JsMath.Exp(x));
            Check(6, x * x);
            Check(7, JsMath.HalfPower(x));
            count++;

            void Check(int index, double result)
            {
                long expected = reader.ReadInt64(), actual = BitConverter.DoubleToInt64Bits(result);
                if (actual == expected) return;
                if (++differences[index] <= 4)
                    Console.WriteLine($"{names[index]} x={x:R} ({BitConverter.DoubleToInt64Bits(x):x16}) y={y:R} ({BitConverter.DoubleToInt64Bits(y):x16}) JS={expected:x16} C#={actual:x16}");
            }
        }
        for (int i = 0; i < names.Length; i++)
            Console.WriteLine($"{names[i]} 不一致 {differences[i]}/{count} ({(double)differences[i] / count:P6})");
        return differences.Any(n => n != 0) ? 1 : 0;
    }
}
