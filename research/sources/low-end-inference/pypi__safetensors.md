---
id: "pypi:safetensors"
kind: "pypi"
category: "low-end-inference"
package: "safetensors"
version: "0.8.0"
url: "https://pypi.org/project/safetensors/"
requires_python: ">=3.10"
fetched_at: "2026-11-08T11:47:22Z"
---

# safetensors 0.8.0

**Summary:** 

**Install:** `pip install safetensors`

**Python:** >=3.10

## Distribution artifacts

- safetensors-0.8.0-cp310-abi3-macosx_10_12_x86_64.whl (0.5 MB)
- safetensors-0.8.0-cp310-abi3-macosx_11_0_arm64.whl (0.5 MB)
- safetensors-0.8.0-cp310-abi3-manylinux_2_17_aarch64.manylinux2014_aarch64.whl (0.5 MB)
- safetensors-0.8.0-cp310-abi3-manylinux_2_17_armv7l.manylinux2014_armv7l.whl (0.5 MB)
- safetensors-0.8.0-cp310-abi3-manylinux_2_17_ppc64le.manylinux2014_ppc64le.whl (0.6 MB)
- safetensors-0.8.0-cp310-abi3-manylinux_2_17_s390x.manylinux2014_s390x.whl (0.5 MB)
- safetensors-0.8.0-cp310-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (0.5 MB)
- safetensors-0.8.0-cp310-abi3-manylinux_2_31_riscv64.whl (0.5 MB)
- safetensors-0.8.0-cp310-abi3-manylinux_2_5_i686.manylinux1_i686.whl (0.5 MB)
- safetensors-0.8.0-cp310-abi3-musllinux_1_2_aarch64.whl (0.6 MB)
- safetensors-0.8.0-cp310-abi3-musllinux_1_2_armv7l.whl (0.8 MB)
- safetensors-0.8.0-cp310-abi3-musllinux_1_2_i686.whl (0.7 MB)

## Description

## Installation

```
pip install safetensors
```


## Usage

### Numpy

```python
from safetensors.numpy import save_file, load_file
import numpy as np

tensors = {
   "a": np.zeros((2, 2)),
   "b": np.zeros((2, 3), dtype=np.uint8)
}

save_file(tensors, "./model.safetensors")


# Now loading
loaded = load_file("./model.safetensors")
```

### Torch

```python
from safetensors.torch import save_file, load_file
import torch

tensors = {
   "a": torch.zeros((2, 2)),
   "b": torch.zeros((2, 3), dtype=torch.uint8)
}

save_file(tensors, "./model.safetensors")


# Now loading
loaded = load_file("./model.safetensors")
```

### Developing

```
# inside ./safetensors/bindings/python
pip install .[dev]
```
Should be enough to install this library locally.

### Testing

```
# inside ./safetensors/bindings/python
pip install .[dev]
pytest -sv tests/
```


