// 月结使用的正数域按 Node v24.18.1 的 deps/v8/src/base/ieee754.cc 移植。
// Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
// Developed at SunSoft, a Sun Microsystems, Inc. business.
// Permission to use, copy, modify, and distribute this software is freely
// granted, provided that this notice is preserved.
// Copyright 2016 the V8 project authors. All rights reserved.
using System;

namespace Liandan.Kernel
{
    internal static class JsMath
    {
        private static int High(double x) => (int)(BitConverter.DoubleToInt64Bits(x) >> 32);
        private static double WithHigh(double x, int word) =>
            BitConverter.Int64BitsToDouble(((long)word << 32) | (BitConverter.DoubleToInt64Bits(x) & 0xffffffffL));
        private static double Head(double x) => WithHigh(0, High(x));

        // 归约到 1 附近，保留二进制指数；拆分的高低项须按原括号求和。
        private static double Reduce(double x, out int k, out int mantissa)
        {
            int h = High(x);
            k = (h >> 20) - 1023;
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
            if (!(x >= 1) || double.IsInfinity(x)) return Math.Log(x, 2);
            double f = Reduce(x, out int k, out _);
            double s = f / (2 + f), half = 0.5 * f * f;
            double hi = Head(f - half), lo = (f - hi) - half + s * (half + LogSeries(s));
            double high = hi * 1.44269504072144627571;
            double low = (lo + hi) * 1.67517131648865118353e-10 + lo * 1.44269504072144627571;
            double sum = k + high;
            low += (k - sum) + high;
            return low + sum;
        }
        private static double NaturalLog(double x)
        {
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
            if (!(x >= 1) || double.IsInfinity(x)) return Math.Log10(x);
            int high = High(x), k = (high >> 20) - 1023;
            double reduced = WithHigh(x, (high & 0xfffff) | 0x3ff00000);
            double tail = k * 3.69423907715893078616e-13 + 0.434294481903251816668 * NaturalLog(reduced);
            return tail + k * 0.301029995663611771306;
        }

        internal static double Pow(double x, double y) => Math.Pow(x, y);
    }
}
