using System;
using System.Globalization;
using System.IO;
using Liandan.Verification;
using UnityEngine;

namespace Liandan.ProbeTools
{
    // 只有探针场景挂载这个组件，普通场景可以照常启动。
    public sealed class Probe : MonoBehaviour
    {
        private void Start() => Application.Quit(Run());

        public static int Run()
        {
            var culture = CultureInfo.CurrentCulture;
            try
            {
                CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;
                string[] args = Environment.GetCommandLineArgs();
                string result = Path.GetFullPath(Argument(args, "-resultFile"));
                using var output = new StringWriter(CultureInfo.InvariantCulture);
                bool passed = false;
                try
                {
                    string root = Argument(args, "-repoRoot");
                    string bits = Argument(args, "-mathBits");
                    int parity = Verification.Parity.Run(new[] { "parity",
                        Path.Combine(root, "tools/parity/baseline.json"), "--seeds", "3" },
                        Path.Combine(root, "src/data/tables"), output, output);
                    int math = MathBits.Run(bits, output);
                    passed = parity == 0 && math == 0;
                }
                catch (Exception ex) { output.WriteLine(ex); }

                output.WriteLine(passed ? "对拍通过" : "对拍失败");
                string report = output.ToString();
                Debug.Log(report);
                Directory.CreateDirectory(Path.GetDirectoryName(result));
                File.WriteAllText(result, report);
                return passed ? 0 : 1;
            }
            catch (Exception ex)
            {
                Debug.LogException(ex);
                return 1;
            }
            finally { CultureInfo.CurrentCulture = culture; }
        }

        private static string Argument(string[] args, string name)
        {
            int index = Array.IndexOf(args, name);
            if (index < 0 || index + 1 >= args.Length)
                throw new ArgumentException("缺少命令行参数 " + name);
            return args[index + 1];
        }
    }
}
