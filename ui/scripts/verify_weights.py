"""Verify TF.js weights shard matches original .keras weights within float32 tolerance."""
import json
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KERAS_PATH = os.path.join(ROOT, 'public', 'echonext_final_model.keras')
OUT_DIR = os.path.join(ROOT, 'public', 'models', 'echonext')


def main() -> None:
    import tensorflow as tf
    m = tf.keras.models.load_model(KERAS_PATH)

    manifest = json.load(open(os.path.join(OUT_DIR, 'model.json'), encoding='utf-8'))
    weights_manifest = manifest['weightsManifest']
    buffer = bytearray()
    for group in weights_manifest:
        for p in group['paths']:
            with open(os.path.join(OUT_DIR, p), 'rb') as f:
                buffer += f.read()
    data = bytes(buffer)

    flat_names = []
    for group in weights_manifest:
        for w in group['weights']:
            flat_names.append((w['name'], w['shape'], w['dtype']))

    loc = {}
    off = 0
    for (name, shape, dtype) in flat_names:
        loc[name] = (off, shape, dtype)
        off += int(np.prod(shape)) * np.dtype(dtype).itemsize
    print('shard bytes expected:', off)

    worst = 0.0
    mismatches = []

    for layer in m.layers:
        for k, arr in enumerate(layer.get_weights()):
            tfjs_name = _tfjs_name(layer.name, k, layer.__class__.__name__, arr.ndim)
            entry = loc.get(tfjs_name)
            if entry is None:
                mismatches.append((layer.name, tfjs_name, 'NOT FOUND in TF.js'))
                continue
            offset, shape, dtype = entry
            n_el = int(np.prod(shape))
            raw = np.frombuffer(data, dtype=np.dtype(dtype), count=n_el, offset=offset)
            if tuple(shape) != tuple(arr.shape):
                mismatches.append((layer.name, tfjs_name, f'shape {shape} vs {arr.shape}'))
                continue
            diff = float(np.max(np.abs(raw.reshape(shape) - arr)))
            worst = max(worst, diff)
            if diff > 1e-5:
                mismatches.append((layer.name, tfjs_name, f'diff={diff:.3e}'))

    print('total weights consumed bytes:', len(data))
    print('worst max abs diff:', worst)
    if mismatches:
        for mm in mismatches:
            print('MISMATCH:', mm)
        sys.exit(1)
    print('ALL WEIGHTS MATCH')


def _tfjs_name(layer_name: str, k: int, cls: str, ndim: int) -> str:
    if cls == 'Conv2D':
        return f'{layer_name}/{"kernel" if k == 0 else "bias"}'
    if cls == 'BatchNormalization':
        return f'{layer_name}/{["gamma", "beta", "moving_mean", "moving_variance"][k]}'
    if cls == 'Dense':
        return f'{layer_name}/{"kernel" if k == 0 else "bias"}'
    raise ValueError(f'unhandled layer {cls}')


if __name__ == '__main__':
    sys.exit(main())
