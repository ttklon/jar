---
id: "pypi:quantlib"
kind: "pypi"
category: "business-finance"
package: "QuantLib"
version: "1.44"
url: "https://pypi.org/project/QuantLib/"
home_page: "https://www.quantlib.org"
license: "BSD-3-Clause"
summary: "Python bindings for the QuantLib library"
fetched_at: "2026-11-08T12:43:21Z"
---

# QuantLib 1.44

**Summary:** Python bindings for the QuantLib library

**Install:** `pip install QuantLib`

**Python:** any

## Distribution artifacts

- quantlib-1.44-cp314-cp314t-macosx_10_15_x86_64.whl (16.0 MB)
- quantlib-1.44-cp314-cp314t-macosx_11_0_arm64.whl (14.8 MB)
- quantlib-1.44-cp314-cp314t-manylinux_2_24_aarch64.manylinux_2_28_aarch64.whl (18.9 MB)
- quantlib-1.44-cp314-cp314t-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl (20.0 MB)
- quantlib-1.44-cp314-cp314t-musllinux_1_2_aarch64.whl (20.5 MB)
- quantlib-1.44-cp314-cp314t-musllinux_1_2_i686.whl (25.8 MB)
- quantlib-1.44-cp314-cp314t-musllinux_1_2_x86_64.whl (21.5 MB)
- quantlib-1.44-cp314-cp314t-win32.whl (11.9 MB)
- quantlib-1.44-cp314-cp314t-win_amd64.whl (12.9 MB)
- quantlib-1.44-cp315-cp315t-macosx_10_15_x86_64.whl (16.0 MB)
- quantlib-1.44-cp315-cp315t-macosx_11_0_arm64.whl (14.8 MB)
- quantlib-1.44-cp315-cp315t-manylinux_2_24_aarch64.manylinux_2_28_aarch64.whl (18.9 MB)

## Description


QuantLib (https://www.quantlib.org/) is a free/open-source C++ library
for financial quantitative analysts and developers, aimed at providing
a comprehensive software framework for quantitative finance.

QuantLib is Non-Copylefted Free Software and OSI Certified Open Source Software.

Free-threading wheels are also provided, and we did build the wheels
with some configuration options that make it possible to use them
using some limited multi-threading. In particular:

- the globals in the library are per-thread; most notably,
  the evaluation date and the stored index fixings;

- there is code in place to prevent the garbage collector
  to interfere with notifications inside the library.

Note, though, that the underlying C++ library is not thread-safe and
any complex attempt at multi-threading will probably fail. We suggest
to avoid sharing objects and state across threads; each thread should
have its set of objects, evaluation date etc.

