"""Convert EfficientNetV2B0 HF Detection model (.keras) to TensorFlow.js LayersModel format.

Bypasses tensorflowjs's __init__ to avoid tensorflow_decision_forests import on Windows.
"""
import os
import sys
import zipfile

import numpy as np
import tensorflow as tf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIP_PATH = os.path.join(ROOT, 'model-src', 'hf_non-hf.zip')
OUT_DIR = os.path.join(ROOT, 'public', 'models', 'hfdetect')


def find_keras_model(extract_dir: str) -> str:
    """Find the .keras model file in extracted directory."""
    for root, dirs, files in os.walk(extract_dir):
        for f in files:
            if f.endswith('.keras'):
                return os.path.join(root, f)
    raise FileNotFoundError(f'No .keras file found in {extract_dir}')


def main() -> None:
    # Extract zip if needed
    extract_dir = os.path.join(ROOT, 'model-src', '_hf_non-hf_extracted')
    if not os.path.exists(extract_dir) or not any(
        f.endswith('.keras')
        for _, _, files in os.walk(extract_dir)
        for f in files
    ):
        os.makedirs(extract_dir, exist_ok=True)
        print(f'Extracting {ZIP_PATH}...')
        with zipfile.ZipFile(ZIP_PATH, 'r') as zf:
            zf.extractall(extract_dir)
        print('Extracted.')

    keras_path = find_keras_model(extract_dir)
    print(f'Loading model from: {keras_path}')
    model = tf.keras.models.load_model(keras_path)
    model.summary()

    # Sanity: single forward pass on a random input matching (224, 224, 3).
    x = np.random.default_rng(0).standard_normal((1, 224, 224, 3)).astype(np.float32)
    y = model.predict(x, verbose=0)
    print('sanity predict shape:', y.shape, 'value:', y[0, 0])

    os.makedirs(OUT_DIR, exist_ok=True)

    # Directly import the keras converter to avoid tensorflow_decision_forests
    from tensorflowjs.converters import save_keras_model
    save_keras_model(model, OUT_DIR)

    # Apply fix for Keras 3 artifacts in model.json
    model_json_path = os.path.join(OUT_DIR, 'model.json')
    if os.path.exists(model_json_path):
        sys.path.insert(0, os.path.join(ROOT, 'scripts'))
        from fix_model_json import fix
        fix(model_json_path)

    print('saved to', OUT_DIR)
    for f in sorted(os.listdir(OUT_DIR)):
        print('  ', f, os.path.getsize(os.path.join(OUT_DIR, f)))


if __name__ == '__main__':
    sys.exit(main())
