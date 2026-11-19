---
id: "pypi:hf-transfer"
kind: "pypi"
category: "perf-optimization"
package: "hf-transfer"
version: "0.1.9"
url: "https://pypi.org/project/hf-transfer/"
requires_python: ">=3.7"
summary: "Speed up file transfers with the Hugging Face Hub."
fetched_at: "2026-11-08T11:47:22Z"
---

# hf-transfer 0.1.9

**Summary:** Speed up file transfers with the Hugging Face Hub.

**Install:** `pip install hf-transfer`

**Python:** >=3.7

## Distribution artifacts

- hf_transfer-0.1.9-cp313-cp313t-macosx_10_12_x86_64.whl (1.3 MB)
- hf_transfer-0.1.9-cp313-cp313t-macosx_11_0_arm64.whl (1.3 MB)
- hf_transfer-0.1.9-cp313-cp313t-manylinux_2_17_aarch64.manylinux2014_aarch64.whl (3.6 MB)
- hf_transfer-0.1.9-cp313-cp313t-manylinux_2_17_armv7l.manylinux2014_armv7l.whl (2.9 MB)
- hf_transfer-0.1.9-cp313-cp313t-manylinux_2_17_i686.manylinux2014_i686.whl (3.4 MB)
- hf_transfer-0.1.9-cp313-cp313t-manylinux_2_17_ppc64le.manylinux2014_ppc64le.whl (3.2 MB)
- hf_transfer-0.1.9-cp313-cp313t-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (3.4 MB)
- hf_transfer-0.1.9-cp313-cp313t-musllinux_1_2_aarch64.whl (3.9 MB)
- hf_transfer-0.1.9-cp313-cp313t-musllinux_1_2_armv7l.whl (3.2 MB)
- hf_transfer-0.1.9-cp313-cp313t-musllinux_1_2_i686.whl (3.5 MB)
- hf_transfer-0.1.9-cp313-cp313t-musllinux_1_2_x86_64.whl (3.5 MB)
- hf_transfer-0.1.9-cp38-abi3-macosx_10_12_x86_64.whl (1.3 MB)

## Description

# HF Transfer

Speed up file transfers with the Hub.

# DISCLAIMER

This library is a power user tool, to go beyond `~500MB/s` on very high bandwidth
network, where Python cannot cap out the available bandwidth.

This is *not* meant to be a general usability tool.
It purposefully lacks progressbars and comes generally as-is.

Please file issues *only* if there's an issue on the underlying downloaded file.

## Contributing

```sh
python3 -m venv ~/.venv/hf_transfer
source ~/.venv/hf_transfer/bin/activate
pip install maturin
maturin develop
```

### `huggingface_hub`

If you are working on changes with `huggingface_hub`

```sh
git clone git@github.com:huggingface/huggingface_hub.git
# git clone https://github.com/huggingface/huggingface_hub.git

cd huggingface_hub
python3 -m pip install -e ".[quality]"
```

You can use the following test script:

```py
import os

# os.environ["HF_ENDPOINT"] = "http://localhost:5564"
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"

from huggingface_hub import HfApi, logging

logging.set_verbosity_debug()
hf = HfApi()
hf.upload_file(path_or_fileobj="/path/to/my/repo/some_file", path_in_repo="some_file", repo_id="my/repo", repo_type="model")
```



