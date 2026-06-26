#!/usr/bin/env python3
"""BM_CII v27 visual-review generator helper.

This helper is intentionally small and file-based: it post-processes an existing
v26 plant-only GLB to create an engineering-only v27 GLB with:
- valve stem height reduced by 2,
- handwheel moved down to the shortened stem top,
- plant-only/runtime-overlay-disable flags on scene and nodes,
- ordered property-panel/heatmap metadata fields on all component nodes.

It does not generate a Temp1 GLB.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path
from typing import Any

import numpy as np

COMPONENT_TYPE_SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
TYPE_COMPONENTS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}

DEFAULT_ENGINEERING_PROPERTIES = {
    'lineNo': 'BM_CII_Enriched_v10',
    'Line No': 'BM_CII_Enriched_v10',
    'wallThickness': 6.0,
    'Wall Thickness': 6.0,
    'materialName': 'A106 B',
    'Material': 'A106 B',
    'pressure': 2.0,
    'Pressure': 2.0,
    'hydroPressure': 5.0,
    'Hydro Pressure': 5.0,
    'materialThickness': 6.0,
    'Material Thickness': 6.0,
    'temp1': 350.0,
    'Temp1': 350.0,
    'temp2': '',
    'Temp2': '',
    'temp3': '',
    'Temp3': '',
    'plantOnlyMode': True,
    'disableRuntimeSupportOverlay': True,
}


def read_glb(path: Path) -> tuple[dict[str, Any], bytearray]:
    with path.open('rb') as fh:
        magic, version, length = struct.unpack('<III', fh.read(12))
        if magic != 0x46546C67 or version != 2:
            raise ValueError(f'{path} is not a GLB v2 file')
        chunks: list[tuple[int, bytearray]] = []
        while fh.tell() < length:
            clen, ctype = struct.unpack('<II', fh.read(8))
            chunks.append((ctype, bytearray(fh.read(clen))))
    json_chunk = next(data for ctype, data in chunks if ctype == 0x4E4F534A)
    bin_chunk = next(data for ctype, data in chunks if ctype == 0x004E4942)
    return json.loads(json_chunk.decode('utf-8').rstrip('\x00 \t\r\n')), bin_chunk


def write_glb(path: Path, gltf: dict[str, Any], bin_data: bytearray) -> None:
    json_bytes = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    json_bytes += b' ' * ((4 - len(json_bytes) % 4) % 4)
    bin_bytes = bytes(bin_data) + b'\x00' * ((4 - len(bin_data) % 4) % 4)
    total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    with path.open('wb') as fh:
        fh.write(struct.pack('<III', 0x46546C67, 2, total_len))
        fh.write(struct.pack('<II', len(json_bytes), 0x4E4F534A))
        fh.write(json_bytes)
        fh.write(struct.pack('<II', len(bin_bytes), 0x004E4942))
        fh.write(bin_bytes)


def accessor_array(gltf: dict[str, Any], bin_data: bytearray, accessor_index: int) -> tuple[np.ndarray, int, int, dict[str, Any]]:
    acc = gltf['accessors'][accessor_index]
    bv = gltf['bufferViews'][acc['bufferView']]
    comp = acc['componentType']
    comps = TYPE_COMPONENTS[acc['type']]
    if comp != 5126 or comps != 3:
        raise ValueError('v27 post-processor only supports FLOAT VEC3 POSITION accessors')
    offset = int(bv.get('byteOffset', 0)) + int(acc.get('byteOffset', 0))
    stride = int(bv.get('byteStride', comps * COMPONENT_TYPE_SIZE[comp]))
    count = int(acc['count'])
    arr = np.empty((count, 3), dtype=np.float32)
    for idx in range(count):
        start = offset + idx * stride
        arr[idx] = np.frombuffer(bin_data[start:start + 12], dtype='<f4', count=3)
    return arr, offset, stride, acc


def write_accessor(gltf: dict[str, Any], bin_data: bytearray, accessor_index: int, arr: np.ndarray) -> None:
    acc = gltf['accessors'][accessor_index]
    bv = gltf['bufferViews'][acc['bufferView']]
    offset = int(bv.get('byteOffset', 0)) + int(acc.get('byteOffset', 0))
    stride = int(bv.get('byteStride', 12))
    for idx, vec in enumerate(arr.astype('<f4')):
        start = offset + idx * stride
        bin_data[start:start + 12] = vec.tobytes()
    acc['min'] = [float(x) for x in arr.min(axis=0)]
    acc['max'] = [float(x) for x in arr.max(axis=0)]


def node_positions(gltf: dict[str, Any], bin_data: bytearray, node: dict[str, Any]) -> np.ndarray | None:
    mesh_index = node.get('mesh')
    if mesh_index is None:
        return None
    arrays = []
    for prim in gltf['meshes'][mesh_index].get('primitives', []):
        accessor_index = prim.get('attributes', {}).get('POSITION')
        if accessor_index is not None:
            arr, _, _, _ = accessor_array(gltf, bin_data, accessor_index)
            arrays.append(arr)
    return np.vstack(arrays) if arrays else None


def node_centroid(gltf: dict[str, Any], bin_data: bytearray, node: dict[str, Any]) -> np.ndarray | None:
    pts = node_positions(gltf, bin_data, node)
    if pts is None or len(pts) == 0:
        return None
    return pts.mean(axis=0)


def reduce_stems(gltf: dict[str, Any], bin_data: bytearray) -> int:
    nodes = gltf.get('nodes', [])
    by_name = {node.get('name', ''): node for node in nodes}
    changed = 0
    for name, node in list(by_name.items()):
        if not name.lower().endswith('-stem') or node.get('mesh') is None:
            continue
        prefix = name[:-5]
        handwheel = by_name.get(prefix + '-handwheel')
        stem_centroid = node_centroid(gltf, bin_data, node)
        handwheel_centroid = node_centroid(gltf, bin_data, handwheel) if handwheel else None
        if stem_centroid is None or handwheel_centroid is None:
            continue
        direction = handwheel_centroid - stem_centroid
        norm = float(np.linalg.norm(direction))
        if norm < 1e-9:
            pts = node_positions(gltf, bin_data, node)
            if pts is None:
                continue
            axis = int(np.argmax(pts.max(axis=0) - pts.min(axis=0)))
            direction = np.zeros(3, dtype=np.float32)
            direction[axis] = 1.0
        else:
            direction = direction / norm

        mesh = gltf['meshes'][node['mesh']]
        accessor_indices = [prim.get('attributes', {}).get('POSITION') for prim in mesh.get('primitives', [])]
        accessor_indices = [idx for idx in accessor_indices if idx is not None]
        arrays = [accessor_array(gltf, bin_data, idx)[0] for idx in accessor_indices]
        if not arrays:
            continue
        all_points = np.vstack(arrays)
        projection = all_points @ direction
        base = float(projection.min())
        height = float(projection.max() - base)
        if height <= 1e-9:
            continue

        for accessor_index, arr in zip(accessor_indices, arrays):
            p = arr @ direction
            perpendicular = arr - np.outer(p, direction)
            p2 = base + (p - base) * 0.5
            write_accessor(gltf, bin_data, accessor_index, perpendicular + np.outer(p2, direction))

        delta = -direction * (height * 0.5)
        if handwheel and handwheel.get('mesh') is not None:
            for prim in gltf['meshes'][handwheel['mesh']].get('primitives', []):
                accessor_index = prim.get('attributes', {}).get('POSITION')
                if accessor_index is None:
                    continue
                arr, _, _, _ = accessor_array(gltf, bin_data, accessor_index)
                write_accessor(gltf, bin_data, accessor_index, arr + delta)
        changed += 1
    return changed


def normalize_extras(gltf: dict[str, Any]) -> None:
    for scene in gltf.get('scenes', []):
        extras = dict(scene.get('extras') or {})
        extras.update({
            'schema': 'BM_CII_v27_properties_stem_overlay_fix',
            'plantOnlyMode': True,
            'disableRuntimeSupportOverlay': True,
            'technicalFix': 'stem-height-half-property-order-runtime-overlay-ready',
            'generatedVariant': 'engineering-only',
        })
        scene['extras'] = extras

    for node in gltf.get('nodes', []):
        extras = dict(node.get('extras') or {})
        name = node.get('name') or extras.get('name') or ''
        source_id = extras.get('sourceId') or extras.get('pcfId') or extras.get('id') or name
        for suffix in ['-body', '-body-a', '-body-b', '-flange', '-flange-a', '-flange-b', '-stem', '-handwheel', '-rigid']:
            if str(source_id).endswith(suffix):
                source_id = str(source_id)[:-len(suffix)]
        if source_id:
            extras['name'] = name or str(source_id)
            extras['pcfId'] = extras.get('pcfId') or source_id
            extras['id'] = extras.get('id') or source_id
            extras['sourceId'] = extras.get('sourceId') or source_id
            extras['refNo'] = extras.get('refNo') or source_id
        typ = extras.get('pcfType') or extras.get('type') or extras.get('sourceComponentType') or extras.get('componentKind')
        if typ:
            extras['pcfType'] = typ
            extras['type'] = typ
        bore = extras.get('bore') or extras.get('diameterMm') or extras.get('OutsideDiameter')
        if bore not in (None, ''):
            try:
                bore = float(bore)
            except Exception:
                pass
            extras['bore'] = bore
            extras['Bore'] = bore
        extras.update(DEFAULT_ENGINEERING_PROPERTIES)
        node['extras'] = extras


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()

    gltf, bin_data = read_glb(args.input)
    changed = reduce_stems(gltf, bin_data)
    normalize_extras(gltf)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    write_glb(args.output, gltf, bin_data)
    print(json.dumps({'output': str(args.output), 'sha256': hashlib.sha256(args.output.read_bytes()).hexdigest(), 'stemsAdjusted': changed}, indent=2))


if __name__ == '__main__':
    main()
