"""在同一个 FBX 世界坐标系里光栅化四向覆盖掩码，不受材质颜色和法线贴图影响。"""
import numpy as np


RESOLUTION = 512
MAX_INTERIOR_LOSS = .005
MIN_IOU = .90


def world_triangles(objects):
    parts = []
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        coords = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
        mesh.vertices.foreach_get('co', coords)
        matrix = np.asarray(obj.matrix_world)
        world = coords.reshape(-1, 3) @ matrix[:3, :3].T + matrix[:3, 3]
        faces = np.empty(len(mesh.loop_triangles) * 3, dtype=np.int32)
        mesh.loop_triangles.foreach_get('vertices', faces)
        parts.append(world[faces.reshape(-1, 3)])
    return np.concatenate(parts)


def coverage(triangles, axis, sign):
    # 投影到像素中心。只画朝向相机的面，四个方向也能检出单侧缺面。
    p = triangles[:, :, [axis, 2]].copy()
    p[:, :, 0] *= sign
    a, b = p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]
    p = p[a[:, 0] * b[:, 1] > a[:, 1] * b[:, 0]]
    p += RESOLUTION / 2 - .5
    # 每条扫描线只展开实际跨过它的三角形。每个区间对覆盖计数作 +1/-1。
    delta = np.zeros((RESOLUTION, RESOLUTION + 1), dtype=np.int32)
    for chunk in np.array_split(p, max(1, (len(p) + 1023) // 1024)):
        if not len(chunk):
            continue
        y = chunk[:, :, 1]
        first = np.clip(np.ceil(y.min(axis=1)).astype(int), 0, RESOLUTION)
        end = np.clip(np.ceil(y.max(axis=1)).astype(int), 0, RESOLUTION)
        counts = end - first
        idx = np.repeat(np.arange(len(chunk)), counts)
        rows = np.arange(len(idx)) + np.repeat(first - (np.cumsum(counts) - counts), counts)
        v = chunk[idx]
        w = np.roll(v, -1, axis=1)
        dy = w[:, :, 1] - v[:, :, 1]
        t = np.divide(rows[:, None] - v[:, :, 1], dy, out=np.zeros_like(dy), where=dy != 0)
        hits = (v[:, :, 1] > rows[:, None]) != (w[:, :, 1] > rows[:, None])
        x = v[:, :, 0] + t * (w[:, :, 0] - v[:, :, 0])
        left = np.where(hits, x, np.inf).min(axis=1)
        right = np.where(hits, x, -np.inf).max(axis=1)
        for col, value in ((left, 1), (right, -1)):
            np.add.at(delta, (rows, np.clip(np.ceil(col), 0, RESOLUTION).astype(int)), value)
    return np.cumsum(delta[:, :-1], axis=1) > 0


def compare(reference, candidate):
    ref, lod = world_triangles(reference), world_triangles(candidate)
    lo, hi = ref.min(axis=(0, 1)), ref.max(axis=(0, 1))
    scale = RESOLUTION / (1.12 * max(hi - lo))
    center = (lo + hi) / 2
    ref, lod = (ref - center) * scale, (lod - center) * scale
    views = {}
    for view, axis, sign in [('front', 0, 1), ('back', 0, -1), ('left', 1, -1), ('right', 1, 1)]:
        base, current = coverage(ref, axis, sign), coverage(lod, axis, sign)
        # 去掉基准轮廓两像素宽的边缘（也包括长椅本来就有的空隙边缘）。
        interior = np.zeros_like(base)
        windows = np.lib.stride_tricks.sliding_window_view(base, (5, 5))
        interior[2:-2, 2:-2] = windows.all(axis=(-2, -1))
        interior_count = int(interior.sum())
        union_count = int((base | current).sum())
        missing = int((interior & ~current).sum())
        views[view] = dict(referencePixels=int(base.sum()), lostPixels=int((base & ~current).sum()),
                           interiorPixels=interior_count, missingInteriorPixels=missing,
                           interiorLoss=missing / interior_count if interior_count else 0.,
                           iou=int((base & current).sum()) / union_count if union_count else 1.)
    return dict(resolution=RESOLUTION, edgeMarginPixels=2, maxInteriorLoss=MAX_INTERIOR_LOSS,
                minIoU=MIN_IOU, views=views)
