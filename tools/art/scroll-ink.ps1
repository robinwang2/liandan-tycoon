# Bake four KaiTi glyph outlines in paper coordinates (1020 x 420).
# Web triangulates these contours. Blender rasterizes the same contours on the FBX paper.
param([string]$Text = '天道酬勤')
$ErrorActionPreference = 'Stop'
if ($Text.Length -ne 4) { throw 'The horizontal scroll has four character cells.' }
Add-Type -AssemblyName System.Drawing
$family = [Drawing.FontFamily]::new('楷体')
$contours = [Collections.Generic.List[object]]::new()
for ($i = 0; $i -lt 4; $i++) {
    $path = [Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddString($Text.Substring($i,1), $family, 0, 235, [Drawing.PointF]::Empty, [Drawing.StringFormat]::GenericTypographic)
    $path.Flatten($null, 0.55)
    $bounds = $path.GetBounds()
    $points = $path.PathPoints
    $types = $path.PathTypes
    $line = $null
    for ($j = 0; $j -lt $points.Length; $j++) {
        if (($types[$j] -band 7) -eq 0) {
            $line = [Collections.Generic.List[object]]::new()
            $contours.Add($line)
        }
        $x = [int][Math]::Round(143 + 243 * $i + $points[$j].X - $bounds.X - $bounds.Width / 2)
        $y = [int][Math]::Round(205 + $points[$j].Y - $bounds.Y - $bounds.Height / 2)
        $line.Add(@($x, $y))
    }
    $path.Dispose()
}
$family.Dispose()
$out = Join-Path $PSScriptRoot '../../src/scene3a/scroll-ink.json'
$art = [ordered]@{ text=$Text; width=1020; height=420; contours=$contours }
[IO.File]::WriteAllText($out, (($art | ConvertTo-Json -Depth 8 -Compress) + [char]10))
