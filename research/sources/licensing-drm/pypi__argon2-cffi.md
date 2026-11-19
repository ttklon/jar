---
id: "pypi:argon2-cffi"
kind: "pypi"
category: "licensing-drm"
package: "argon2-cffi"
version: "25.1.0"
url: "https://pypi.org/project/argon2-cffi/"
requires_python: ">=3.8"
summary: "Argon2 for Python"
fetched_at: "2026-11-08T13:14:43Z"
---

# argon2-cffi 25.1.0

**Summary:** Argon2 for Python

**Install:** `pip install argon2-cffi`

**Python:** >=3.8

## Distribution artifacts

- argon2_cffi-25.1.0-py3-none-any.whl (0.0 MB)
- argon2_cffi-25.1.0.tar.gz (0.0 MB)

## Description

# *argon2-cffi*: Argon2 for Python


[Argon2](https://github.com/p-h-c/phc-winner-argon2) won the [Password Hashing Competition](https://www.password-hashing.net/) and *argon2-cffi* is the simplest way to use it in Python:

```pycon
>>> from argon2 import PasswordHasher
>>> ph = PasswordHasher()
>>> hash = ph.hash("correct horse battery staple")
>>> hash  # doctest: +SKIP
'$argon2id$v=19$m=65536,t=3,p=4$MIIRqgvgQbgj220jfp0MPA$YfwJSVjtjSU0zzV/P3S9nnQ/USre2wvJMjfCIjrTQbg'
>>> ph.verify(hash, "correct horse battery staple")
True
>>> ph.check_needs_rehash(hash)
False
>>> ph.verify(hash, "Tr0ub4dor&3")
Traceback (most recent call last):
  ...
argon2.exceptions.VerifyMismatchError: The password does not match the supplied hash

```
<!-- end short -->

## Project Links

- [**PyPI**](https://pypi.org/project/argon2-cffi/)
- [**GitHub**](https://github.com/hynek/argon2-cffi)
- [**Documentation**](https://argon2-cffi.readthedocs.io/)
- [**Changelog**](https://github.com/hynek/argon2-cffi/blob/main/CHANGELOG.md)
- [**Funding**](https://hynek.me/say-thanks/)
- The low-level Argon2 CFFI bindings are maintained in the separate [*argon2-cffi-bindings*](https://github.com/hynek/argon2-cffi-bindings) project.

## Release Information

### Added

- Official support for Python 3.13 and 3.14.
  No code changes were necessary.


### Removed

- Python 3.7 is not supported anymore.
  [#186](https://github.com/hynek/argon2-cffi/pull/186)


### Changed

- `argon2.PasswordHasher.check_needs_rehash()` now also accepts bytes like the rest of the API.
  [#174](https://github.com/hynek/argon2-cffi/pull/174)

- Improved parameter compatibility handling for Pyodide / WebAssembly environments.
  [#190](https://github.com/hynek/argon2-cffi/pull/190)


---

[Full Changelog →](https://github.com/hynek/argon2-cffi/blob/main/CHANGELOG.md)


## Credits

*argon2-cffi* is maintained by [Hynek Schlawack](https://hynek.me/).

The development is kindly supported by my employer [Variomedia AG](https://www.variomedia.de/), *argon2-cffi* [Tidelift subscribers](https://tidelift.com/?utm_source=lifter&utm_medium=referral&utm_campaign=hynek), and my amazing [GitHub Sponsors](https://github.com/sponsors/hynek).


## *argon2-cffi* for Enterprise

Available as part of the [Tidelift Subscription](https://tidelift.com/?utm_source=lifter&utm_medium=referral&utm_campaign=hynek).

The maintainers of *argon2-cffi* and thousands of other packages are working with Tidelift to deliver commercial support and maintenance for the open-source packages you use to build your applications.
Save time, reduce risk, and improve code health, while paying the maintainers of the exact packages you use.

