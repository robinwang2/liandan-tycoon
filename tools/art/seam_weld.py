"""把导入器沿 UV/硬边拆开的对边缝合，保留 Blender 的面角数据。"""
from collections import defaultdict, Counter

import bmesh


def stitch_boundaries(bm):
    pairs = defaultdict(list)
    piece = bm.verts.layers.float.get('_PIECE')
    for edge in bm.edges:
        if edge.is_boundary:
            loop = edge.link_loops[0]
            a, b = loop.vert, loop.link_loop_next.vert
            key = tuple(sorted((tuple(a.co), tuple(b.co))))
            pairs[(a[piece] if piece is not None else None, key)].append((a, b))
    parent = {}

    def root(vertex):
        while vertex in parent:
            vertex = parent[vertex]
        return vertex

    for sides in pairs.values():
        if len(sides) != 2:
            continue
        (a, b), (d, c) = sides
        if a.co != c.co or b.co != d.co:
            continue
        for v, w in ((a, c), (b, d)):
            v, w = root(v), root(w)
            if v != w:
                parent[v] = w

    # 同位的叠层、T 接头仍可共用一条几何线。只保留不会造成三面共边的合并。
    targets = {v: root(v) for v in parent}
    counts = Counter()
    for edge in bm.edges:
        a, b = (targets.get(v, v) for v in edge.verts)
        counts[tuple(sorted((a.index, b.index)))] += len(edge.link_faces)
    blocked = {i for ends, count in counts.items() if count > 2 for i in ends}
    targets = {v: w for v, w in targets.items() if w.index not in blocked}
    if targets:
        bmesh.ops.weld_verts(bm, targetmap=targets)
    return len(targets)
