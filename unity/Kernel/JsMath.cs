// 对数和自然指数沿用 V8 的 fdlibm 运算顺序。
// Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
// Developed at SunSoft, a Sun Microsystems, Inc. business.
// Permission to use, copy, modify, and distribute this software is freely
// granted, provided that this notice is preserved.
// Copyright 2016 the V8 project authors. All rights reserved.
using System;

namespace Liandan.Kernel
{
    internal static partial class JsMath
    {
        private static int High(double x) => (int)(BitConverter.DoubleToInt64Bits(x) >> 32);
        private static double WithHigh(double x, int word) =>
            BitConverter.Int64BitsToDouble(((long)word << 32) | (BitConverter.DoubleToInt64Bits(x) & 0xffffffffL));
        private static double Head(double x) => WithHigh(0, High(x));

        // 归约到 1 附近，保留二进制指数；拆分的高低项须按原括号求和。
        private static double Reduce(double x, out int k, out int mantissa)
        {
            int offset = Normalize(ref x);
            int h = High(x);
            k = (h >> 20) - 1023 + offset;
            mantissa = h & 0xfffff;
            int adjust = (mantissa + 0x95f64) & 0x100000;
            k += adjust >> 20;
            return WithHigh(x, mantissa | (adjust ^ 0x3ff00000)) - 1;
        }
        private static double LogSeries(double s)
        {
            double z = s * s, w = z * z;
            double even = w * (0.3999999999940941908 + w * (0.2222219843214978396 + w * 0.1531383769920937332));
            double odd = z * (0.6666666666666735130 + w * (0.2857142874366239149 + w * (0.1818357216161805012 + w * 0.1479819860511658591)));
            return odd + even;
        }
        internal static double Log2(double x)
        {
            if (!(x > 0) || double.IsInfinity(x)) return LogSpecial(x, DomainNaN);
            double f = Reduce(x, out int k, out _);
            double s = f / (2 + f), half = 0.5 * f * f;
            double hi = Head(f - half), lo = (f - hi) - half + s * (half + LogSeries(s));
            double high = hi * 1.44269504072144627571;
            double low = (lo + hi) * 1.67517131648865118353e-10 + lo * 1.44269504072144627571;
            double sum = k + high;
            low += (k - sum) + high;
            return low + sum;
        }
        internal static double Log(double x)
        {
            if (!(x > 0) || double.IsInfinity(x)) return LogSpecial(x, DomainNaN);
            const double lnHi = 6.93147180369123816490e-01, lnLo = 1.90821492927058770002e-10;
            double f = Reduce(x, out int k, out int h);
            if (((2 + h) & 0xfffff) < 3)
            {
                if (f == 0) return k * lnHi + k * lnLo;
                double r = f * f * (0.5 - 0.33333333333333333 * f);
                return k == 0 ? f - r : k * lnHi - ((r - k * lnLo) - f);
            }
            double s = f / (2 + f), series = LogSeries(s);
            if (((h - 0x6147a) | (0x6b851 - h)) > 0)
            {
                double half = 0.5 * f * f;
                return k == 0 ? f - (half - s * (half + series)) : k * lnHi - ((half - (s * (half + series) + k * lnLo)) - f);
            }
            return k == 0 ? f - s * (f - series) : k * lnHi - ((s * (f - series) - k * lnLo) - f);
        }
        internal static double Log10(double x)
        {
            if (!(x > 0) || double.IsInfinity(x)) return LogSpecial(x, QuietNaN);
            int offset = Normalize(ref x);
            int high = High(x), k = (high >> 20) - 1023 + offset;
            int adjust = k < 0 ? 1 : 0;
            k += adjust;
            double reduced = WithHigh(x, (high & 0xfffff) | ((1023 - adjust) << 20));
            double tail = k * 3.69423907715893078616e-13 + 0.434294481903251816668 * Log(reduced);
            return tail + k * 0.301029995663611771306;
        }

        private static readonly double QuietNaN = BitConverter.Int64BitsToDouble(0x7ff8000000000000);
        private static readonly double DomainNaN = BitConverter.Int64BitsToDouble(0x7ff0000000000001);

        private static double LogSpecial(double x, double negativeResult)
        {
            if (x == 0) return double.NegativeInfinity;
            return High(x) < 0 ? negativeResult : x + x;
        }

        private static int Normalize(ref double x)
        {
            if (High(x) >= 0x100000) return 0;
            x *= 18014398509481984.0;
            return -54;
        }

        internal static double Exp(double x)
        {
            if (double.IsNaN(x)) return x + x;
            if (x > 709.782712893384) return double.PositiveInfinity;
            if (x < -745.1332191019411) return 0;
            if (x == 1) return Math.E;
            int h = High(x) & int.MaxValue;
            if (h < 0x3e300000) return 1 + x;

            int k = 0;
            double hi = 0, lo = 0;
            if (h > 0x3fd62e42)
            {
                int sign = x < 0 ? -1 : 1;
                k = h < 0x3ff0a2b2 ? sign : (int)(1.4426950408889634 * x + sign * 0.5);
                hi = x - k * 0.6931471803691238;
                lo = k * 1.9082149292705877e-10;
                x = hi - lo;
            }
            double t = x * x;
            double c = x - t * (0.16666666666666602 + t * (-0.0027777777777015593 +
                t * (6.613756321437934e-5 + t * (-1.6533902205465252e-6 + t * 4.1381367970572385e-8))));
            if (k == 0) return 1 - ((x * c) / (c - 2) - x);
            double y = 1 - ((lo - (x * c) / (2 - c)) - hi);
            if (k == 1024) return y * WithHigh(0, 0x7fe00000) * 2;
            if (k >= -1021) return y * WithHigh(0, (k + 1023) << 20);
            return y * WithHigh(0, (k + 2023) << 20) * 9.332636185032189e-302;
        }

        // V8 的字面量半次幂会将负零转成正零，并对负无穷返回正无穷。
        internal static double HalfPower(double x) =>
            double.IsInfinity(x) ? double.PositiveInfinity : Math.Sqrt(0.0 + x);

        internal static double Pow(double x, double y)
        {
            if (double.IsNaN(y)) return QuietNaN;
            if (y == 0) return 1;
            if (double.IsNaN(x)) return QuietNaN;
            if (y == 2) return x * x;
            double ax = Math.Abs(x);
            if (y == 0.5) return HalfPower(x);
            if (double.IsInfinity(y))
            {
                if (ax == 1) return QuietNaN;
                return (ax > 1) == (y > 0) ? double.PositiveInfinity : 0;
            }
            bool odd = Math.Abs(y) < 9007199254740992.0 && y == Math.Truncate(y) && ((long)y & 1) != 0;
            if (ax == 0 || double.IsInfinity(ax))
            {
                double value = y < 0 ? 1 / ax : ax;
                return High(x) < 0 && odd ? -value : value;
            }
            if (x < 0 && y != Math.Truncate(y)) return double.NaN;
            if (ax == 1) return odd ? x : 1;
            if (Math.Abs(y) < 2.710505431213761e-20) return 1;
            if (Math.Abs(y) >= 9.223372036854776e18)
                return (ax > 1) == (y > 0) ? double.PositiveInfinity : 0;

            // 将 log(|x|) 拆成高低两项，保留与指数相乘时的尾数。
            double log = PowLog(ax, out double low);
            double product = y * log;
            double result = PowExp(product, Fma(y, low, Fma(y, log, -product)));
            return x < 0 && odd ? -result : result;
        }

        // netstandard2.1 的引用程序集没有 FusedMultiplyAdd；在提供它的运行时直接绑定。
        private static readonly Func<double, double, double, double> Fma =
            typeof(Math).GetMethod("FusedMultiplyAdd", new[] { typeof(double), typeof(double), typeof(double) })
                ?.CreateDelegate(typeof(Func<double, double, double, double>)) as Func<double, double, double, double>
                ?? SoftwareFma;

        // 调用方的乘数、加数都是有限值。用整数对齐尾数，只在最终结果舍入一次。
        private static double SoftwareFma(double x, double y, double add)
        {
            static System.Numerics.BigInteger Mantissa(double value, out int scale)
            {
                long bits = BitConverter.DoubleToInt64Bits(value);
                int exp = (int)((bits >> 52) & 2047);
                long m = bits & 0xfffffffffffffL;
                if (exp != 0) m |= 1L << 52;
                scale = Math.Max(1, exp) - 1075;
                return bits < 0 ? -m : m;
            }
            if (x == 0 || y == 0) return x * y + add;
            var product = Mantissa(x, out int ex) * Mantissa(y, out int ey);
            var c = Mantissa(add, out int ec);
            int scale = Math.Min(ex + ey, ec);
            var exact = (product << (ex + ey - scale)) + (c << (ec - scale));
            if (exact.IsZero) return 0;
            var mag = System.Numerics.BigInteger.Abs(exact);
            byte[] bytes = mag.ToByteArray(isUnsigned: true, isBigEndian: true);
            int length = 8 * (bytes.Length - 1);
            for (int top = bytes[0]; top != 0; top >>= 1) length++;
            int shift = Math.Max(length - 53, -1074 - scale);
            var rounded = shift <= 0 ? mag << -shift : mag >> shift;
            if (shift > 0)
            {
                var remainder = mag - (rounded << shift);
                var half = System.Numerics.BigInteger.One << (shift - 1);
                if (remainder > half || (remainder == half && !rounded.IsEven)) rounded++;
            }
            int exponent = scale + shift + 1075;
            long significand = (long)rounded;
            long bits = significand + ((long)(exponent - 1) << 52);
            return BitConverter.Int64BitsToDouble(bits | (exact.Sign < 0 ? long.MinValue : 0));
        }
        private static double PowLog(double x, out double low)
        {
            int adjust = Normalize(ref x);
            long bits = BitConverter.DoubleToInt64Bits(x);
            long delta = bits - 0x3fe6955500000000;
            int k = (int)(delta >> 52) + adjust, index = (int)((delta >> 45) & 127) * 3;
            long zb = bits - ((delta >> 52) << 52);
            double z = BitConverter.Int64BitsToDouble(zb);
            double r = Fma(PowLogTable[index], z, -1);
            double t = Fma(k, 0.6931471805598903, PowLogTable[index + 1]);
            double sum = t + r, ar = -0.5 * r, ar2 = ar * r, hi = sum + ar2;
            double p1 = Fma(r, 0.5000000000000007, -0.6666666666666679);
            double p2 = Fma(r, -0.6666666663487739, 0.7999999995323976);
            double p3 = Fma(r, 1.0000415263675542, -1.142909628459501);
            double poly = Fma(ar2, Fma(ar2, p3, p2), p1);
            double tail = Fma(k, 5.497923018708371e-14, PowLogTable[index + 2]) + ((t - sum) + r);
            tail += Fma(ar, r, -ar2);
            tail += (sum - hi) + ar2;
            tail = Fma(ar2 * r, poly, tail);
            double value = hi + tail;
            low = (hi - value) + tail;
            return value;
        }

        private static double PowExp(double hi, double lo)
        {
            if (Math.Abs(hi) < 5.551115123125783e-17) return 1 + hi;
            if (hi >= 1024) return double.PositiveInfinity;
            if (hi <= -1024) return 0;
            // 每个二进制指数再分成 256 段，取整常数的低 16 位参与舍入。
            long ki = BitConverter.DoubleToInt64Bits(Fma(hi, 369.3299304675746, 103079215104.5)) >> 16;
            int k = (int)ki, i = (k & 255) * 2;
            double r = Fma(k, 5.0411407304988844e-14, Fma(k, -0.0027076061741126978, hi)) + lo;
            double r2 = r * r;
            double tail = Fma(r2, Fma(r, 0.16666666666665886, 0.49999999999996786), PowExpTable[i] + r);
            tail = Fma(r2 * r2, Fma(r, 0.008333335853047663, 0.04166668084093659), tail);
            long bits = BitConverter.DoubleToInt64Bits(PowExpTable[i + 1]) + ((long)k << 44);
            if (hi >= 512)
            {
                double s = BitConverter.Int64BitsToDouble(bits - (1009L << 52));
                return Fma(s, tail, s) * WithHigh(0, (1023 + 1009) << 20);
            }
            if (hi <= -512)
            {
                double s = BitConverter.Int64BitsToDouble(bits + (1022L << 52));
                double part = s * tail, sum = s + part;
                if (sum < 1)
                {
                    double rounded = 1 + sum;
                    double error = ((s - sum) + part) + ((1 - rounded) + sum);
                    sum = (error + rounded) - 1;
                }
                return sum * WithHigh(0, 0x100000);
            }
            double scale = BitConverter.Int64BitsToDouble(bits);
            return Fma(scale, tail, scale);
        }
    }
}
