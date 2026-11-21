import sys
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import Panels, Vector, cut, material, run


def build(shell):
    # 固定 2 cm 采样网格，只测从正面打到的显示区域，不把背板厚度算作起伏。
    depths = []
    for column in range(-52,53):
        for row in range(-29,30):
            hit, point, _, _ = shell.ray_cast(Vector((column*.02,-1,.665+row*.02)), Vector((0,1,0)))
            if hit: depths.append(point.y)
    cut(shell, [(1,-.08)], lambda point: point.y<-.08, 8100)
    bezel = Panels(); bezel.box((0,-.109,.65), (2.2,.076,1.3), material('Bezel','19232a',metal=.38)); bezel.finish('Bezel')
    display = Panels()
    display.add([(x,-.15,z) for x,z in [(-1.065,.06),(1.065,.06),(1.065,1.27),(-1.065,1.27)]],
                [(0,1,2,3)], material('M_tv_wall_Screen','254156',.85))
    mesh = display.finish('Screen').data
    uv = mesh.uv_layers.new(name='UV0')
    for coord, pair in zip(uv.uv, [(0,0),(1,0),(1,1),(0,1)]): coord.vector = pair
    return dict(sourceScreenDepthRangeMeters=max(depths)-min(depths), sourceScreenSamples=len(depths))


run(build, (2.2,.15,1.3), wall=True)
