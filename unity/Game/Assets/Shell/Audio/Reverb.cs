using System;
using System.Collections.Generic;

namespace Liandan.Sound
{
    // 无附加延迟的分段卷积。前 64 点直接求和，尾部按 64 到 2048 点分块，
    // 用实部、虚部分别存左右脉冲响应，一次逆变换同时得到两个声道。
    internal sealed class Reverb
    {
        private const int Head = 64;
        private readonly double[] history = new double[Head], left, right;
        private readonly Stage[] stages;
        private int cursor;
        internal Reverb(float[][] impulse, int rate)
        {
            int length = impulse[0].Length;
            double energy = 0;
            foreach (var channel in impulse) foreach (double sample in channel) energy += sample * sample;
            double scale = .00125 * 44100 / rate / Math.Max(.000125, Math.Sqrt(energy / (2 * length)));
            left = new double[Head]; right = new double[Head];
            for (int i = 0; i < Head; i++) { left[i] = impulse[0][i] * scale; right[i] = impulse[1][i] * scale; }
            var parts = new List<Stage>();
            for (int size = Head; size < length; size *= 2)
            {
                int end = size == 2048 ? length : Math.Min(2 * size, length);
                parts.Add(new Stage(size, end, impulse, scale));
                if (end == length) break;
            }
            stages = parts.ToArray();
        }
        internal void Process(double input, out double l, out double r)
        {
            l = r = 0; history[cursor] = input;
            for (int j = 0; j < Head; j++)
            {
                double x = history[(cursor - j) & (Head - 1)]; l += left[j] * x; r += right[j] * x;
            }
            cursor = (cursor + 1) & (Head - 1);
            foreach (var stage in stages) stage.Process(input, ref l, ref r);
        }

        private sealed class Stage
        {
            private readonly int size, count;
            private readonly double[][] hReal, hImag, xReal, xImag;
            private readonly double[] real, imag, tailL, tailR, cos, sin;
            private int index, block;
            internal Stage(int size, int end, float[][] ir, double scale)
            {
                this.size = size; int n = 2 * size;
                count = (end - 1) / size;
                real = new double[n]; imag = new double[n]; tailL = new double[size]; tailR = new double[size];
                cos = new double[size]; sin = new double[size];
                for (int j = 0; j < size; j++) { cos[j] = Math.Cos(-Math.PI * j / size); sin[j] = Math.Sin(-Math.PI * j / size); }
                hReal = new double[count][]; hImag = new double[count][]; xReal = new double[count][]; xImag = new double[count][];
                for (int p = 0; p < count; p++)
                {
                    var hr = hReal[p] = new double[n]; var hi = hImag[p] = new double[n];
                    xReal[p] = new double[n]; xImag[p] = new double[n];
                    int offset = (p + 1) * size;
                    for (int j = 0; j < size && offset + j < end; j++)
                    { hr[j] = ir[0][offset + j] * scale; hi[j] = ir[1][offset + j] * scale; }
                    Transform(hr, hi, false);
                }
            }
            private void Transform(double[] a, double[] b, bool inverse)
            {
                int n = a.Length;
                for (int i = 1, j = 0; i < n; i++)
                {
                    int bit = n >> 1;
                    while ((j & bit) != 0) { j ^= bit; bit >>= 1; }
                    j ^= bit;
                    if (i < j) { (a[i], a[j]) = (a[j], a[i]); (b[i], b[j]) = (b[j], b[i]); }
                }
                for (int len = 2; len <= n; len *= 2)
                {
                    int half = len / 2, stride = n / len;
                    for (int start = 0; start < n; start += len)
                        for (int k = 0; k < half; k++)
                        {
                            int i = start + k, j = i + half;
                            double c = cos[k * stride], s = sin[k * stride] * (inverse ? -1 : 1);
                            double vr = a[j] * c - b[j] * s, vi = a[j] * s + b[j] * c;
                            a[j] = a[i] - vr; b[j] = b[i] - vi; a[i] += vr; b[i] += vi;
                        }
                }
            }
            internal void Process(double value, ref double l, ref double r)
            {
                l += real[index]; r += imag[index]; xReal[block][index] = value;
                if (++index < size) return;
                index = 0; int n = size * 2;
                Array.Clear(xReal[block], size, size); Array.Clear(xImag[block], 0, n);
                Transform(xReal[block], xImag[block], false);
                Array.Clear(real, 0, n); Array.Clear(imag, 0, n);
                for (int p = 0; p < count; p++)
                {
                    int prev = (block + count - p) % count;
                    var xr = xReal[prev]; var xi = xImag[prev]; var hr = hReal[p]; var hi = hImag[p];
                    for (int i = 0; i < n; i++)
                    {
                        real[i] += xr[i] * hr[i] - xi[i] * hi[i];
                        imag[i] += xr[i] * hi[i] + xi[i] * hr[i];
                    }
                }
                block = (block + 1) % count;
                Transform(real, imag, true);
                for (int j = 0; j < size; j++)
                {
                    real[j] = real[j] / n + tailL[j]; imag[j] = imag[j] / n + tailR[j];
                    tailL[j] = real[j + size] / n; tailR[j] = imag[j + size] / n;
                }
            }
        }
    }
}
