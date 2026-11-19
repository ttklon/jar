---
id: "pypi:pyarrow"
kind: "pypi"
category: "perf-optimization"
package: "pyarrow"
version: "26.0.1"
url: "https://pypi.org/project/pyarrow/"
requires_python: ">=3.11"
summary: "Python library for Apache Arrow"
fetched_at: "2026-11-08T12:19:23Z"
---

# pyarrow 26.0.1

**Summary:** Python library for Apache Arrow

**Install:** `pip install pyarrow`

**Python:** >=3.11

## Distribution artifacts

- pyarrow-26.0.1-cp311-cp311-macosx_12_0_arm64.whl (35.6 MB)
- pyarrow-26.0.1-cp311-cp311-macosx_12_0_x86_64.whl (37.9 MB)
- pyarrow-26.0.1-cp311-cp311-manylinux_2_28_aarch64.whl (49.4 MB)
- pyarrow-26.0.1-cp311-cp311-manylinux_2_28_x86_64.whl (52.5 MB)
- pyarrow-26.0.1-cp311-cp311-musllinux_1_2_aarch64.whl (52.9 MB)
- pyarrow-26.0.1-cp311-cp311-musllinux_1_2_x86_64.whl (55.9 MB)
- pyarrow-26.0.1-cp311-cp311-win_amd64.whl (27.7 MB)
- pyarrow-26.0.1-cp312-cp312-macosx_12_0_arm64.whl (35.6 MB)
- pyarrow-26.0.1-cp312-cp312-macosx_12_0_x86_64.whl (37.9 MB)
- pyarrow-26.0.1-cp312-cp312-manylinux_2_28_aarch64.whl (49.4 MB)
- pyarrow-26.0.1-cp312-cp312-manylinux_2_28_x86_64.whl (52.5 MB)
- pyarrow-26.0.1-cp312-cp312-musllinux_1_2_aarch64.whl (52.9 MB)

## Description

<!---
  Licensed to the Apache Software Foundation (ASF) under one
  or more contributor license agreements.  See the NOTICE file
  distributed with this work for additional information
  regarding copyright ownership.  The ASF licenses this file
  to you under the Apache License, Version 2.0 (the
  "License"); you may not use this file except in compliance
  with the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing,
  software distributed under the License is distributed on an
  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
  KIND, either express or implied.  See the License for the
  specific language governing permissions and limitations
  under the License.
-->

## Python library for Apache Arrow

[![pypi](https://img.shields.io/pypi/v/pyarrow.svg)](https://pypi.org/project/pyarrow/) [![conda-forge](https://anaconda.org/conda-forge/pyarrow/badges/version.svg)](https://anaconda.org/conda-forge/pyarrow)

This library provides a Python API for functionality provided by the Arrow C++
libraries, along with tools for Arrow integration and interoperability with
pandas, NumPy, and other software in the Python ecosystem.

## Installing

Across platforms, you can install a recent version of pyarrow with the conda
package manager:

```shell
conda install pyarrow -c conda-forge
```

On Linux, macOS, and Windows, you can also install binary wheels from PyPI with
pip:

```shell
pip install pyarrow
```

If you encounter any issues importing the pip wheels on Windows, you may need
to install the latest [Visual C++ Redistributable for Visual Studio][3].

## Development

See [Python Development][2] in the documentation subproject.

### Building the documentation

See [documentation build instructions][1] in the documentation subproject.

[1]: https://github.com/apache/arrow/blob/main/docs/source/developers/documentation.rst
[2]: https://arrow.apache.org/docs/developers/python/index.html
[3]: https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170#latest-microsoft-visual-c-redistributable-version

