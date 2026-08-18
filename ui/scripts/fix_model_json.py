"""Post-process tfjs-converter model.json topology into tfjs-layers-compatible (Keras 2 style).

The tfjs Python converter (even 4.x) leaves Keras 3 artifacts in the layer configs
(DTypePolicy wrappers, module/registered_name, input_axes/output_axes, batch_shape on
InputLayer) that tfjs-layers rejects. This rewrites model_config in place.

Usage:
    python fix_model_json.py                         # fix both hfdetect + echonext
    python fix_model_json.py path/to/model.json      # fix a specific file
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DEFAULT_TARGETS = [
    os.path.join(ROOT, 'public', 'models', 'hfdetect', 'model.json'),
    os.path.join(ROOT, 'public', 'models', 'echonext', 'model.json'),
]

DROPPED_KEYS = {
    'module', 'registered_name', 'input_axes', 'output_axes', 'optional',
    'quantization_config', 'renorm', 'renorm_clipping', 'renorm_momentum',
    'groups', 'synchronized',
}


def clean_config(obj):
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k in DROPPED_KEYS:
                continue
            if k == 'dtype' and isinstance(v, dict) and v.get('class_name') == 'DTypePolicy':
                out[k] = v['config']['name']
                continue
            out[k] = clean_config(v)
        return out
    if isinstance(obj, list):
        return [clean_config(x) for x in obj]
    return obj


def fix_input_layers(layers):
    """Recursively fix batch_shape -> batch_input_shape in all InputLayers,
    including those inside nested Functional sub-models."""
    for layer in layers:
        cfg = layer.get('config')
        if layer.get('class_name') == 'InputLayer' and isinstance(cfg, dict):
            if 'batch_shape' in cfg and 'batch_input_shape' not in cfg:
                cfg['batch_input_shape'] = cfg.pop('batch_shape')
        # Recurse into nested Functional sub-models
        if isinstance(cfg, dict) and layer.get('class_name') == 'Functional':
            nested_layers = cfg.get('layers', [])
            if nested_layers:
                fix_input_layers(nested_layers)


def fix_top_level_batch_input_shape(mc):
    """Sync the top-level batchInputShape with the first InputLayer's actual shape.

    Keras 3 sometimes writes a stale batchInputShape at the Functional config level
    (e.g. [null,224,224,3] when the real input is 160x160). tfjs-layers uses this
    value, so it must match the InputLayer.
    """
    layers = mc.get('config', {}).get('layers', [])
    for layer in layers:
        if layer.get('class_name') == 'InputLayer':
            cfg = layer.get('config', {})
            shape = cfg.get('batch_input_shape') or cfg.get('batchInputShape')
            if shape:
                mc['config']['batchInputShape'] = shape
            break


def fix_inbound_nodes(layers):
    """Recursively convert Keras 3 inbound_nodes (dict with args/kwargs)
    to tfjs-layers format (array: [layer_name, node_index, tensor_index]).
    Handles both single-input and multi-input (Add, Concatenate) layers.
    Also recurse into nested Functional sub-models."""
    for layer in layers:
        inbound = layer.get('inbound_nodes', [])
        if isinstance(inbound, list):
            for i, node in enumerate(inbound):
                if isinstance(node, dict) and 'args' in node:
                    # Keras 3 format: extract keras_history from args
                    args = node.get('args', [])
                    if args and isinstance(args[0], list):
                        # Multi-input layer (e.g., Add, Concatenate):
                        # args = [[tensor1, tensor2, ...]]
                        connections = []
                        for tensor in args[0]:
                            if isinstance(tensor, dict):
                                hist = tensor.get('config', {}).get('keras_history', [])
                                if len(hist) == 3:
                                    connections.append(list(hist))
                        if connections:
                            inbound[i] = connections
                    elif args and isinstance(args[0], dict):
                        # Single-input layer:
                        # args = [tensor]
                        hist = args[0].get('config', {}).get('keras_history', [])
                        if len(hist) == 3:
                            inbound[i] = list(hist)
                elif isinstance(node, dict) and not node:
                    # Empty dict -> empty array
                    inbound[i] = []
        # Recurse into nested Functional sub-models
        cfg = layer.get('config')
        if isinstance(cfg, dict) and layer.get('class_name') == 'Functional':
            nested_layers = cfg.get('layers', [])
            if nested_layers:
                fix_inbound_nodes(nested_layers)


def fix(path: str) -> None:
    d = json.load(open(path, encoding='utf-8'))
    tp = d['modelTopology']
    mc = tp.get('model_config')
    if not mc:
        raise SystemExit(f'no model_config found in {path}')
    layers = mc['config']['layers']
    # InputLayer: batch_shape -> batch_input_shape (tfjs-layers requirement).
    # Recursively fix all InputLayers including nested Functional sub-models.
    fix_input_layers(layers)
    # Sync top-level batchInputShape with the first InputLayer's actual shape.
    fix_top_level_batch_input_shape(mc)
    # Convert Keras 3 inbound_nodes dict format to tfjs-layers array format.
    fix_inbound_nodes(layers)
    for layer in layers:
        cfg = layer.get('config')
        if isinstance(cfg, dict):
            for k in [k for k in cfg if k in DROPPED_KEYS]:
                cfg.pop(k)
            cfg['dtype'] = clean_config(cfg.get('dtype'))
            for ikey in ('kernel_initializer', 'bias_initializer',
                         'gamma_initializer', 'beta_initializer'):
                if ikey in cfg:
                    cfg[ikey] = clean_config(cfg[ikey])
    mc['config'] = clean_config(mc['config'])
    json.dump(d, open(path, 'w', encoding='utf-8'), indent=2)
    print('patched', path)


def main() -> None:
    targets = DEFAULT_TARGETS
    if len(sys.argv) > 1:
        targets = [os.path.abspath(a) for a in sys.argv[1:]]

    for path in targets:
        if not os.path.exists(path):
            print(f'skipped (not found): {path}')
            continue
        fix(path)
        d = json.load(open(path, encoding='utf-8'))
        layers = d['modelTopology']['model_config']['config']['layers']
        for layer in layers:
            if layer.get('class_name') == 'InputLayer':
                print(f'  first InputLayer config: {json.dumps(layer["config"], indent=4)}')
                break
        top_shape = d['modelTopology']['model_config']['config'].get('batchInputShape')
        print(f'  top-level batchInputShape: {top_shape}')


if __name__ == '__main__':
    sys.exit(main())
