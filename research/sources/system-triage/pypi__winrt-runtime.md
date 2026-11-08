---
id: "pypi:winrt-runtime"
kind: "pypi"
category: "system-triage"
package: "winrt-runtime"
version: "4.1.0"
url: "https://pypi.org/project/winrt-runtime/"
requires_python: ">=3.11"
summary: "The runtime that every PyWinRT projection package runs on"
fetched_at: "2026-11-08T12:31:02Z"
---

# winrt-runtime 4.1.0

**Summary:** The runtime that every PyWinRT projection package runs on

**Install:** `pip install winrt-runtime`

**Python:** >=3.11

## Distribution artifacts

- winrt_runtime-4.1.0-cp311-cp311-win32.whl (0.2 MB)
- winrt_runtime-4.1.0-cp311-cp311-win_amd64.whl (0.2 MB)
- winrt_runtime-4.1.0-cp311-cp311-win_arm64.whl (0.2 MB)
- winrt_runtime-4.1.0-cp312-cp312-win32.whl (0.2 MB)
- winrt_runtime-4.1.0-cp312-cp312-win_amd64.whl (0.2 MB)
- winrt_runtime-4.1.0-cp312-cp312-win_arm64.whl (0.2 MB)
- winrt_runtime-4.1.0-cp313-cp313-win32.whl (0.2 MB)
- winrt_runtime-4.1.0-cp313-cp313-win_amd64.whl (0.2 MB)
- winrt_runtime-4.1.0-cp313-cp313-win_arm64.whl (0.2 MB)
- winrt_runtime-4.1.0-cp314-cp314t-win32.whl (0.2 MB)
- winrt_runtime-4.1.0-cp314-cp314t-win_amd64.whl (0.3 MB)
- winrt_runtime-4.1.0-cp314-cp314t-win_arm64.whl (0.2 MB)

## Description

# winrt-runtime

This package provides the PyWinRT runtime including the `winrt.system` module.

Every PyWinRT package requires it, so pip installs it with any of them. Each
WinRT namespace is a package of its own, so install the package of each
namespace your code imports from, such as `winrt-Windows.Foundation`.

## For interop modules

Compiled code outside the runtime, such as the interop packages, exchanges
WinRT objects with it through the Python functions of `winrt.runtime.interop`
rather than a C ABI: `as_interface()` gives an interface of a projected object
as an interface pointer capsule, `wrap_interface()` makes a projected object of
one, and `hresult_error()` builds the exception that a failed call raises. An interface pointer capsule is named `"winrt.interface"`
and holds one reference, which its destructor releases.

