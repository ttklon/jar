---
id: "pypi:rarfile"
kind: "pypi"
category: "backup-archive"
package: "rarfile"
version: "4.5"
url: "https://pypi.org/project/rarfile/"
home_page: "https://github.com/markokr/rarfile"
license: "ISC"
requires_python: ">=3.10"
summary: "RAR archive reader for Python"
fetched_at: "2026-11-08T12:43:21Z"
---

# rarfile 4.5

**Summary:** RAR archive reader for Python

**Install:** `pip install rarfile`

**Python:** >=3.10

## Distribution artifacts

- rarfile-4.5-py3-none-any.whl (0.0 MB)
- rarfile-4.5.tar.gz (0.1 MB)

## Description

rarfile - RAR archive reader for Python
=======================================

This is Python module for RAR_ archive reading.
The interface follows the style of zipfile_.
Licensed under ISC_ license.

Features:

* Supports both RAR3 and RAR5 format archives.
* Supports multi volume archives.
* Supports Unicode filenames.
* Supports password-protected archives.
* Supports archive and file comments.
* Archive parsing and non-compressed files are handled in pure Python code.
* Compressed files are extracted by executing external tool:
  unrar_ (preferred), unar_, 7zip_ or bsdtar_.
* Works with Python 3.6+.

.. _RAR: https://en.wikipedia.org/wiki/RAR_%28file_format%29
.. _zipfile: https://docs.python.org/3/library/zipfile.html
.. _ISC: https://en.wikipedia.org/wiki/ISC_license
.. _bsdtar: https://github.com/libarchive/libarchive
.. _unrar: https://www.rarlab.com/
.. _unar: https://theunarchiver.com/command-line
.. _7zip: https://www.7-zip.org/

Backends:

+-------------+----------------------+-----------------------------------------------------+
| Backend     | Status               | Notes                                               |
+=============+======================+=====================================================+
| unrar_      | Supported            | * Recommended: full format support.                 |
|             |                      | * Non-free software, but free to use.               |
+-------------+----------------------+-----------------------------------------------------+
| unar_       | Supported            | * Not usable on Windows: last build is from 2013    |
|             |                      |   (v1.8.1) that does support output to stdout.      |
|             |                      | * Does not support RAR2 locked files.               |
|             |                      | * Does not support RAR5 Blake2 hash checking.       |
+-------------+----------------------+-----------------------------------------------------+
| 7zip_       | Supported            | * Requires ``7zip-rar`` package on Debian/Ubuntu.   |
+-------------+----------------------+-----------------------------------------------------+
| p7zip_      | Supported            | * Unmaintained?                                     |
|             |                      | * Requires ``p7zip-rar`` package on Debian/Ubuntu.  |
+-------------+----------------------+-----------------------------------------------------+
| bsdtar_     | Supported            | * Not recommended: limited RAR format support.      |
|             |                      | * Does not support multi-volume archives.           |
|             |                      | * Does not support solid archives.                  |
|             |                      | * Does not support password-protected archives.     |
|             |                      | * Does not support RARVM-based compression filters. |
+-------------+----------------------+-----------------------------------------------------+
| unrar-free_ | Supported            | * Supports output to stdout (v0.2.0).               |
|             |                      | * Based on libarchive so similar format support     |
|             |                      |   as ``bsdtar`` but supports multi-volume (v0.3.0). |
+-------------+----------------------+-----------------------------------------------------+

.. _p7zip: https://sourceforge.net/projects/p7zip/
.. _unrar-free: https://gitlab.com/bgermann/unrar-free

Links:

- `Documentation`_
- `Downloads`_
- `Git`_ repo

.. _Git: https://github.com/markokr/rarfile
.. _Downloads: https://pypi.org/project/rarfile/#files
.. _Documentation: https://rarfile.readthedocs.io/

