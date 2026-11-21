using System;
using System.IO;
using System.Linq;
using Liandan.Kernel;

namespace Liandan.Verification
{
    public static class MathBits
    {
        public static int Run(string path, TextWriter output)
        {
            using var stream = File.OpenRead(path);
            using var reader = new BinaryReader(stream);
            if (!reader.ReadBytes(8).SequenceEqual(System.Text.Encoding.ASCII.GetBytes("JSMATH02")) || stream.Length <= 8 || (stream.Length - 8) % 80 != 0)
                throw new InvalidDataException("数学对拍文件头或长度错误");
            string[] names = { "Math.pow", "**", "log", "log2", "log10", "exp", "优化 x ** 2", "优化 x ** 0.5" };
            const string nanLabel = "NaN 位型不同，JS 观察不到";
            const string numericLabel = "真正的数值不同";
            var sameBits = new int[names.Length];
            var nanDifferences = new int[names.Length];
            var numericDifferences = new int[names.Length];
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
                    if (actual == expected)
                    {
                        sameBits[index]++;
                        return;
                    }
                    bool bothNaN = IsNaNBits(expected) && IsNaNBits(actual);
                    if (bothNaN ? ++nanDifferences[index] <= 3 : ++numericDifferences[index] <= 4)
                        output.WriteLine($"{names[index]} {(bothNaN ? nanLabel : numericLabel)}：x={x:R} ({BitConverter.DoubleToInt64Bits(x):x16}) y={y:R} ({BitConverter.DoubleToInt64Bits(y):x16}) JS={expected:x16} C#={actual:x16}");
                }
            }
            for (int i = 0; i < names.Length; i++)
                output.WriteLine($"{names[i]}：按位一致 {sameBits[i]}/{count}；{nanLabel} {nanDifferences[i]}/{count}；{numericLabel} {numericDifferences[i]}/{count}");
            return numericDifferences.Any(n => n != 0) ? 1 : 0;
        }

        private static bool IsNaNBits(long bits) => (bits & long.MaxValue) > 0x7ff0000000000000L;
    }
}
