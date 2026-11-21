"""检查修补机柜正面净空。坐标单位是米，正面朝 -Y。"""


def clipped_triangle(points, limits):
    # 逐平面裁剪整个三角形。跨越开口的大面即使三个顶点都在门框外也不能漏报。
    for axis, boundary, direction in limits:
        result = []
        previous = points[-1]
        for current in points:
            start = direction*(previous[axis]-boundary)
            end = direction*(current[axis]-boundary)
            if (start < 0) != (end < 0):
                result.append(previous.lerp(current, start/(start-end)))
            if end >= 0:
                result.append(current)
            previous = current
        if not result:
            return []
        points = result
    return points


def part(meshes, label):
    names = {label, *('SM_server_rack_'+label+'_LOD'+str(level) for level in range(3))}
    matches = [obj for obj in meshes if obj.name in names]
    if len(matches) != 1:
        raise ValueError('机柜净空检查需要唯一的 '+label+'，多级 FBX 请指定 --lod')
    return matches[0]


def triangles(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    world = [obj.matrix_world @ vertex.co for vertex in mesh.vertices]
    for face in mesh.loop_triangles:
        yield face, [world[index] for index in face.vertices]


def aperture(front):
    # 用 0.57 × 0.13 m 实体行板的最前表面作基准，不用更突出的 LED，避免漏掉挡在灯后的壳片。
    rows = []
    for _, points in triangles(front):
        low = [min(point[axis] for point in points) for axis in range(3)]
        high = [max(point[axis] for point in points) for axis in range(3)]
        if abs(high[0]-low[0]-.57)<.003 and abs(high[2]-low[2]-.13)<.002 and high[1]-low[1]<1e-5:
            rows.append((low,high))
    if not rows:
        raise ValueError('找不到机柜实体行板，无法定位净空')
    panel_y = min(low[1] for low,high in rows)
    rows = [(low,high) for low,high in rows if abs(low[1]-panel_y)<1e-5]
    if len({round(low[2],4) for low,high in rows}) != 12:
        raise ValueError('机柜前表面不是 12 行，不能跳过净空检查')
    x_min, z_min = (min(low[axis] for low,high in rows) for axis in (0,2))
    x_max, z_max = (max(high[axis] for low,high in rows) for axis in (0,2))
    depth = .05
    limits = [(0,x_min,1),(0,x_max,-1),(2,z_min,1),(2,z_max,-1),(1,panel_y-depth,1),(1,panel_y+1e-6,-1)]
    return limits, dict(panelYMeters=panel_y, depthMeters=depth, xMeters=[x_min,x_max], zMeters=[z_min,z_max])


def measure(meshes):
    limits, info = aperture(part(meshes,'Front'))
    shell = part(meshes,'Shell')
    hits = []
    for face, points in triangles(shell):
        if clipped_triangle(points, limits):
            hits.append(face.polygon_index)
    return dict(**info, shell=shell.name, intersectingTriangles=len(hits), polygonExamples=hits[:12])


def trim(meshes):
    # 只在规范化已烘焙到网格的世界坐标下调用；未侵入的面不参与开孔。
    import bmesh
    from mathutils import Vector
    shell = part(meshes,'Shell')
    limits, _ = aperture(part(meshes,'Front'))
    indices = {face.polygon_index for face,points in triangles(shell) if clipped_triangle(points,limits)}
    if not indices:
        return 0
    mesh = bmesh.new()
    mesh.from_mesh(shell.data)
    mesh.faces.ensure_lookup_table()
    inside = [mesh.faces[index] for index in indices]
    for axis, boundary, direction in limits:
        # 额外留出 0.1 mm，避免裁切边回读时因浮点舍入恰好接触禁入区。
        boundary -= direction*.0001
        normal = Vector((0,0,0)); normal[axis] = direction
        origin = Vector((0,0,0)); origin[axis] = boundary
        geom = set(inside) | {edge for face in inside for edge in face.edges} | {vert for face in inside for vert in face.verts}
        cut = bmesh.ops.bisect_plane(mesh, geom=list(geom), dist=1e-8, plane_co=origin, plane_no=normal)
        inside = [face for face in cut['geom'] if isinstance(face,bmesh.types.BMFace)
                  and direction*(face.calc_center_median()[axis]-boundary)>=0]
    bmesh.ops.delete(mesh, geom=inside, context='FACES')
    bmesh.ops.triangulate(mesh, faces=[face for face in mesh.faces if len(face.verts)>3])
    mesh.to_mesh(shell.data); mesh.free()
    return len(indices)
