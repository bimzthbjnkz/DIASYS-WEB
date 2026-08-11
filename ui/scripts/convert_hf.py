"""Convert hf_detection_model.keras to TensorFlow.js LayersModel format."""
import os
import sys

import numpy as np
import tensorflow as tf
import tensorflowjs as tfjs

from fix_model_json import fix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KERAS_PATH = os.path.join(ROOT, 'model-src', 'hf_detection_model.keras')
OUT_DIR = os.path.join(ROOT, 'public', 'models', 'hfdetect')


def main() -> None:
    model = tf.keras.models.load_model(KERAS_PATH)
    model.summary()

    # Sanity: single forward pass on a random input matching (32, 1000, 1).
    x = np.random.default_rng(0).standard_normal((1, 32, 1000, 1)).astype(np.float32)
    y = model.predict(x, verbose=0)
    print('sanity predict shape:', y.shape, 'value:', y[0, 0])

    os.makedirs(OUT_DIR, exist_ok=True)
    tfjs.converters.save_keras_model(model, OUT_DIR)
    fix(os.path.join(OUT_DIR, 'model.json'))
    print('saved to', OUT_DIR)
    for f in sorted(os.listdir(OUT_DIR)):
        print('  ', f, os.path.getsize(os.path.join(OUT_DIR, f)))


if __name__ == '__main__':
    sys.exit(main())
