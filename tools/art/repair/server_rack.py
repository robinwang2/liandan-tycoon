import sys
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import Panels, cut, material, run


def build(shell):
    # 切到原格栅之后，但不贯穿机身；侧柱、顶底横梁和背面都留在原 UV 上。
    cut(shell, [(0,-.303),(0,.303),(2,.095),(2,1.94),(1,-.24)],
        lambda point: abs(point.x)<.303 and .095<point.z<1.94 and point.y<-.24, 9800)
    panels = Panels()
    dark = material('Panel', '34444e', metal=.38); steel = material('Steel', '53636c', metal=.62)
    black = material('Vent', '10181d'); tray = material('Tray', '516673', metal=.42)
    leds = [material('M_server_rack_LED_'+name, color, 2.6) for name,color in [('Amber','e8b34b'),('Mint','65dcb8')]]
    # 行间保留实体台阶；盘位和槽只画可见正面，把远级预算留给外壳。
    def plate(pos, depth, center_z, width, span, mat):
        panels.add([(pos+col*width/2,depth,center_z+edge*span/2)
                    for col,edge in [(-1,-1),(1,-1),(1,1),(-1,1)]], [(0,1,2,3)], mat)

    panels.box((0,-.435,1.018), (.614,.026,1.856), black)
    for row in range(12):
        height = .19+row*.15
        panels.box((0,-.451,height), (.57,.014,.13), dark if row%3 else steel)
        for disk in range(4):
            pos = -.19+disk*.125
            plate(pos,-.468,height,.108,.09,tray)
            for slot in range(4):
                plate(pos,-.472,height-.025+slot*.016,.066,.004,black)
        for side in [-.27,.27]: panels.box((side,-.463,height), (.013,.035,.08), steel)
        for index, mat in enumerate(leds): panels.box((.19+index*.025,-.478,height), (.012,.008,.008), mat)
    panels.finish('Front')
    return dict(rows=12, baysPerRow=4, slotsPerBay=4, rowPitchMeters=.15, diskPitchMeters=.125, leds=24)


run(build, (.7,1,2.1))
