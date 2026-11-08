---
id: "pypi:pefile"
kind: "pypi"
category: "code-signing-msix"
package: "pefile"
version: "2024.8.26"
url: "https://pypi.org/project/pefile/"
home_page: "https://github.com/erocarrera/pefile"
license: "MIT"
requires_python: ">=3.6.0"
summary: "Python PE parsing module"
fetched_at: "2026-11-08T13:14:43Z"
---

# pefile 2024.8.26

**Summary:** Python PE parsing module

**Install:** `pip install pefile`

**Python:** >=3.6.0

## Distribution artifacts

- pefile-2024.8.26-py3-none-any.whl (0.1 MB)
- pefile-2024.8.26.tar.gz (0.1 MB)

## Description

pefile, Portable Executable reader module

All the PE file basic structures are available with their default names as
attributes of the instance returned.

Processed elements such as the import table are made available with lowercase
names, to differentiate them from the upper case basic structure names.

pefile has been tested against many edge cases such as corrupted and malformed
PEs as well as malware, which often attempts to abuse the format way beyond its
standard use. To the best of my knowledge most of the abuse is handled
gracefully.

Copyright (c) 2005-2024 Ero Carrera <ero.carrera@gmail.com>

