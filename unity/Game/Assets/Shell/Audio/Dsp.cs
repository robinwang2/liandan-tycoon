using System;

namespace Liandan.Sound
{
    // 仅实现配方用到的自动化段。目标曲线从修改时的当前值继续，时间常数以秒计。
    internal struct Target
    {
        internal double Value;
        private double goal, decay;
        internal void Reset(double value) { Value = goal = value; decay = 0; }
        internal void Set(double value, double seconds, int rate)
        {
            if (goal==value) return;
            goal = value; decay = Math.Exp(-1 / (rate * seconds));
        }
        internal double Next()
        {
            double current = Value;
            Value = Math.Abs(Value - goal) < 1e-12 ? goal : goal + (Value - goal) * decay;
            return current;
        }
    }

    internal enum Filter { Lowpass, Highpass, Bandpass }
    internal struct Biquad
    {
        private double b0, b1, b2, a1, a2, z1, z2;
        internal void Tune(double hz, Filter type, double q, int rate)
        {
            double angle = 2 * Math.PI * Math.Min(rate * .499999, hz) / rate;
            double cos = Math.Cos(angle);
            double alpha = Math.Sin(angle) / (2 * (type == Filter.Bandpass ? q : Math.Pow(10, q / 20)));
            double inv = 1 / (1 + alpha);
            b0 = type == Filter.Bandpass ? alpha : type == Filter.Highpass ? (1 + cos) / 2 : (1 - cos) / 2;
            b1 = type == Filter.Bandpass ? 0 : type == Filter.Highpass ? -2 * b0 : 2 * b0;
            b2 = type == Filter.Bandpass ? -b0 : b0;
            b0 *= inv; b1 *= inv; b2 *= inv; a1 = -2 * cos * inv; a2 = (1 - alpha) * inv;
        }
        internal double Next(double x)
        {
            double y = b0 * x + z1;
            z1 = b1 * x - a1 * y + z2; z2 = b2 * x - a2 * y;
            return y;
        }
    }

    internal enum Wave { Sine, Triangle, Square, Sawtooth }

    // 周期波按正弦级数建表，频率越高可用的谐波越少。表只在初始化时构建。
    internal sealed class Oscillators
    {
        private const int Size = 4096, Levels = 11;
        private readonly float[][] tables = new float[4 * Levels][];
        internal Oscillators()
        {
            var sine = new double[Size];
            for (int i = 0; i < Size; i++) sine[i] = Math.Sin(2 * Math.PI * i / Size);
            for (int w = 0; w < 4; w++)
            {
                var sum = new double[Size]; int harmonic = 1;
                for (int level = 0; level < Levels; level++)
                {
                    for (; harmonic <= 1 << level; harmonic++)
                    {
                        bool odd = harmonic % 2 == 1;
                        double coef = (Wave)w switch {
                            Wave.Sine => harmonic == 1 ? 1 : 0,
                            Wave.Triangle => odd ? 8 * (harmonic % 4 == 1 ? 1 : -1) / (Math.PI * Math.PI * harmonic * harmonic) : 0,
                            Wave.Square => odd ? 4 / (Math.PI * harmonic) : 0,
                            _ => 2 * (odd ? 1 : -1) / (Math.PI * harmonic)
                        };
                        if (coef != 0) for (int i = 0; i < Size; i++) sum[i] += coef * sine[(i * harmonic) & (Size - 1)];
                    }
                    var table = tables[w * Levels + level] = new float[Size + 1];
                    for (int i = 0; i < Size; i++) table[i] = (float)sum[i];
                    table[Size] = table[0];
                }
                // 周期波归一化使用整个频段的同一系数。
                double max = 0; foreach (double v in sum) max = Math.Max(max, Math.Abs(v));
                for (int level = 0; level < Levels; level++)
                    for (int i = 0; i <= Size; i++) tables[w * Levels + level][i] /= (float)max;
            }
        }
        internal double Read(Wave wave, double phase, double step)
        {
            int level = 0;
            if (wave != Wave.Sine)
                while (level + 1 < Levels && (1 << (level + 1)) * step < .5) level++;
            var table = tables[(int)wave * Levels + level];
            double position = phase * Size; int i = (int)position;
            return table[i] + (table[i + 1] - table[i]) * (position - i);
        }
    }

    // 压缩器使用双声道联动、6ms 前视、硬拐点和静态补偿增益。
    internal sealed class Limiter
    {
        private readonly double[] left, right;
        private readonly double attackFrames, releaseFrames, detectorFrames, idleRelease;
        private readonly double threshold = Math.Pow(10, -8.0 / 20);
        private readonly double makeup = Math.Pow(10, 8.0 * .95 * .6 / 20);
        private int pos, division;
        private double gain = 1, detector, desired, envelope, largestAttack;
        internal Limiter(int rate)
        {
            left = new double[Math.Max(1,(int)(rate * .006))]; right = new double[left.Length];
            attackFrames=.003*rate; releaseFrames=.18*rate; detectorFrames=.0025*rate;
            idleRelease=Math.Pow(10,2/(20*detectorFrames))-1;
        }
        private void UpdateEnvelope()
        {
            desired=Math.Asin(detector)*2/Math.PI;
            double difference=desired>0?20*Math.Log10(gain/desired):1;
            if (desired>gain)
            {
                largestAttack=0;
                double x=(Math.Max(-12,Math.Min(0,difference))+12)/4;
                // 四个释放区间的默认值为 .09、.16、.42、.98。
                double zone=.09+x*(.00598875+x*(.050409513+x*(.012655417+x*.000946319)));
                envelope=Math.Pow(10,5/(20*releaseFrames*zone));
            }
            else
            {
                largestAttack=Math.Max(largestAttack,difference);
                envelope=1-Math.Pow(.25/Math.Max(.5,largestAttack),1/attackFrames);
            }
        }
        internal void Process(ref double l, ref double r)
        {
            double peak = Math.Max(Math.Abs(l), Math.Abs(r));
            double target = peak <= threshold ? 1 : Math.Pow(threshold / peak, .95);
            if (division==0) UpdateEnvelope();
            division=(division+1)&31;
            double relax=target>=.794328235 ? idleRelease : Math.Pow(1/target,1/detectorFrames)-1;
            detector=target<=detector?target:Math.Min(1,detector+(target-detector)*relax);
            gain=envelope<1?gain+(desired-gain)*envelope:Math.Min(1,gain*envelope);
            double dl = left[pos], dr = right[pos]; left[pos] = l; right[pos] = r;
            if (++pos == left.Length) pos = 0;
            double level=Math.Sin(gain*Math.PI/2)*makeup;
            l = dl * level; r = dr * level;
        }
    }
}
