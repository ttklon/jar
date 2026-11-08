---
id: "pypi:av"
kind: "pypi"
category: "media-production"
package: "av"
version: "19.0.2"
url: "https://pypi.org/project/av/"
requires_python: ">=3.12"
summary: "Pythonic bindings for FFmpeg's libraries."
fetched_at: "2026-11-08T11:47:22Z"
---

# av 19.0.2

**Summary:** Pythonic bindings for FFmpeg's libraries.

**Install:** `pip install av`

**Python:** >=3.12

## Distribution artifacts

- av-19.0.2-cp312-abi3-macosx_11_0_x86_64.whl (21.6 MB)
- av-19.0.2-cp312-abi3-macosx_14_0_arm64.whl (17.7 MB)
- av-19.0.2-cp312-abi3-manylinux_2_28_aarch64.whl (31.2 MB)
- av-19.0.2-cp312-abi3-manylinux_2_28_x86_64.whl (33.4 MB)
- av-19.0.2-cp312-abi3-manylinux_2_31_armv7l.whl (42.4 MB)
- av-19.0.2-cp312-abi3-musllinux_1_2_aarch64.whl (32.2 MB)
- av-19.0.2-cp312-abi3-musllinux_1_2_x86_64.whl (34.3 MB)
- av-19.0.2-cp312-abi3-win_amd64.whl (26.8 MB)
- av-19.0.2-cp312-abi3-win_arm64.whl (19.7 MB)
- av-19.0.2-cp314-cp314t-macosx_11_0_x86_64.whl (21.9 MB)
- av-19.0.2-cp314-cp314t-macosx_14_0_arm64.whl (18.0 MB)
- av-19.0.2-cp314-cp314t-manylinux_2_28_aarch64.whl (34.8 MB)

## Description

PyAV
====

PyAV is a Pythonic binding for the [FFmpeg][ffmpeg] libraries. We aim to provide all the power and control of the underlying library, but manage the gritty details as much as possible.

---

[![GitHub Test Status][github-tests-badge]][github-tests] [![Documentation][docs-badge]][docs] [![Python Package Index][pypi-badge]][pypi] [![Conda Forge][conda-badge]][conda]

PyAV is for direct and precise access to your media via containers, streams, packets, codecs, and frames. It exposes a few transformations of that data, and helps you get your data to/from other packages (e.g. NumPy and Pillow).

This power does come with some responsibility as working with media is horrendously complicated and PyAV can't abstract it away or make all the best decisions for you. If the `ffmpeg` command does the job without you bending over backwards, PyAV is likely going to be more of a hindrance than a help.

But where you can't work without it, PyAV is a critical tool.


Installation
------------

PyAV requires Python 3.12 or later. Binary wheels are provided on [PyPI][pypi] for Linux, macOS, and Windows with FFmpeg bundled. You can install these wheels by running:

```bash
pip install av
```

Another way of installing PyAV is via [conda-forge][conda-forge]:

```bash
conda install av -c conda-forge
```

See the [Conda install][conda-install] docs to get started with Miniconda.


Alternative Installation Methods
--------------------------------

Due to the complexity of the dependencies, PyAV is not always the easiest Python package to install from source. This release supports FFmpeg 9.x. To build the source distribution against an existing FFmpeg installation on Linux or macOS, run:

> [!WARNING]
> FFmpeg's development files and `pkg-config` must be available on your system.

```bash
pip install av --no-binary av
```


Installing from source
----------------------

On Linux or macOS, build PyAV from a Git checkout with:

```bash
git clone https://github.com/PyAV-Org/PyAV.git
cd PyAV
source scripts/activate.sh

# Build ffmpeg from source. You can skip this step if ffmpeg 8.x is already installed.
./scripts/build-deps

# Build PyAV
make

# Testing
make test

# Install globally
deactivate
pip install .
```

On Windows, use a Conda environment and the FFmpeg development files maintained by the PyAV project:

```powershell
git clone https://github.com/PyAV-Org/PyAV.git
cd PyAV
conda create --name pyav-dev --channel conda-forge python=3.12 cython setuptools numpy pillow pytest
conda activate pyav-dev
$ffmpegDir = Join-Path $env:CONDA_PREFIX "Library"
python scripts\fetch-vendor.py --config-file scripts\ffmpeg-latest.json $ffmpegDir
python setup.py build_ext --inplace --ffmpeg-dir=$ffmpegDir
python -m pytest
```

---

Have fun, [read the docs][docs], [come chat with us][discuss], and good luck!



[conda-badge]: https://img.shields.io/conda/vn/conda-forge/av.svg?colorB=CCB39A
[conda]: https://anaconda.org/conda-forge/av
[docs-badge]: https://img.shields.io/badge/docs-on%20pyav.basswood.io-blue.svg
[docs]: https://pyav.basswood.io
[pypi-badge]: https://img.shields.io/pypi/v/av.svg?colorB=CCB39A
[pypi]: https://pypi.org/project/av
[discuss]: https://github.com/PyAV-Org/PyAV/discussions

[github-tests-badge]: https://github.com/PyAV-Org/PyAV/workflows/tests/badge.svg
[github-tests]: https://github.com/PyAV-Org/PyAV/actions?workflow=tests
[github]: https://github.com/PyAV-Org/PyAV

[ffmpeg]: https://ffmpeg.org/
[conda-forge]: https://conda-forge.github.io/
[conda-install]: https://docs.conda.io/projects/conda/en/latest/user-guide/install/index.html

