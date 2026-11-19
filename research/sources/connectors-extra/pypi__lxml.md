---
id: "pypi:lxml"
kind: "pypi"
category: "connectors-extra"
package: "lxml"
version: "6.1.3"
url: "https://pypi.org/project/lxml/"
home_page: "https://lxml.de/"
license: "BSD-3-Clause"
requires_python: ">=3.8"
summary: "Powerful and Pythonic XML processing library combining libxml2/libxslt with the ElementTree API."
fetched_at: "2026-11-08T12:19:23Z"
---

# lxml 6.1.3

**Summary:** Powerful and Pythonic XML processing library combining libxml2/libxslt with the ElementTree API.

**Install:** `pip install lxml`

**Python:** >=3.8

## Distribution artifacts

- lxml-6.1.3-cp310-cp310-macosx_10_9_universal2.whl (8.2 MB)
- lxml-6.1.3-cp310-cp310-macosx_10_9_x86_64.whl (4.4 MB)
- lxml-6.1.3-cp310-cp310-manylinux2014_aarch64.manylinux_2_17_aarch64.whl (4.8 MB)
- lxml-6.1.3-cp310-cp310-manylinux2014_x86_64.manylinux_2_17_x86_64.whl (4.9 MB)
- lxml-6.1.3-cp310-cp310-manylinux_2_26_aarch64.manylinux_2_28_aarch64.whl (4.8 MB)
- lxml-6.1.3-cp310-cp310-manylinux_2_26_x86_64.manylinux_2_28_x86_64.whl (5.1 MB)
- lxml-6.1.3-cp310-cp310-manylinux_2_28_i686.whl (5.2 MB)
- lxml-6.1.3-cp310-cp310-manylinux_2_31_armv7l.whl (4.6 MB)
- lxml-6.1.3-cp310-cp310-manylinux_2_38_riscv64.manylinux_2_39_riscv64.whl (5.1 MB)
- lxml-6.1.3-cp310-cp310-musllinux_1_2_aarch64.whl (4.9 MB)
- lxml-6.1.3-cp310-cp310-musllinux_1_2_armv7l.whl (4.6 MB)
- lxml-6.1.3-cp310-cp310-musllinux_1_2_riscv64.whl (5.1 MB)

## Description

lxml is a Pythonic, mature binding for the libxml2 and libxslt libraries.
It provides safe and convenient access to these libraries using the
ElementTree API.

It extends the ElementTree API significantly to offer support for XPath,
RelaxNG, XML Schema, XSLT, C14N and much more.

To contact the project, go to the `project home page <https://lxml.de/>`_
or see our bug tracker at https://launchpad.net/lxml

In case you want to use the current in-development version of lxml,
you can get it from the github repository at
https://github.com/lxml/lxml .  Note that this requires Cython to
build the sources, see the build instructions on the project home page.


After an official release of a new stable series, bug fixes may become available at
https://github.com/lxml/lxml/tree/lxml-6.1 .
Running ``pip install https://github.com/lxml/lxml/archive/refs/heads/lxml-6.1.tar.gz``
will install the unreleased branch state as soon as a maintenance branch has been established.
Note that this requires Cython to be installed at an appropriate version for the build.

6.1.3 (2026-09-02)
==================

Bugs fixed
----------

* LP#2165901: External parameter entity parsing was allowed by default
  (with ``resolve_entities="internal"``).
  Issue found by Tomer Fichman.



