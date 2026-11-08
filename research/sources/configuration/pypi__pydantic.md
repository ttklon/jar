---
id: "pypi:pydantic"
kind: "pypi"
category: "configuration"
package: "pydantic"
version: "2.14.3"
url: "https://pypi.org/project/pydantic/"
requires_python: ">=3.10"
summary: "Data validation using Python type hints"
fetched_at: "2026-11-08T12:31:02Z"
---

# pydantic 2.14.3

**Summary:** Data validation using Python type hints

**Install:** `pip install pydantic`

**Python:** >=3.10

## Distribution artifacts

- pydantic-2.14.3-py3-none-any.whl (0.5 MB)
- pydantic-2.14.3.tar.gz (0.9 MB)

## Description

# Pydantic Validation

[![CI](https://img.shields.io/github/actions/workflow/status/pydantic/pydantic/ci.yml?branch=main&logo=github&label=CI)](https://github.com/pydantic/pydantic/actions?query=event%3Apush+branch%3Amain+workflow%3ACI)
[![Coverage](https://coverage-badge.samuelcolvin.workers.dev/pydantic/pydantic.svg)](https://coverage-badge.samuelcolvin.workers.dev/redirect/pydantic/pydantic)
[![pypi](https://img.shields.io/pypi/v/pydantic.svg)](https://pypi.python.org/pypi/pydantic)
[![CondaForge](https://img.shields.io/conda/v/conda-forge/pydantic.svg)](https://anaconda.org/conda-forge/pydantic)
[![downloads](https://static.pepy.tech/badge/pydantic/month)](https://pepy.tech/project/pydantic)
[![versions](https://img.shields.io/pypi/pyversions/pydantic.svg)](https://github.com/pydantic/pydantic)
[![license](https://img.shields.io/github/license/pydantic/pydantic.svg)](https://github.com/pydantic/pydantic/blob/main/LICENSE)
[![Pydantic v2](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/pydantic/pydantic/main/docs/badge/v2.json)](https://pydantic.dev/docs/validation/latest/get-started/contributing/#badges)
[![llms.txt](https://img.shields.io/badge/llms.txt-green)](https://pydantic.dev/docs/validation/latest/llms.txt)

Data validation using Python type hints.

Fast and extensible, Pydantic plays nicely with your linters/IDE/brain.
Define how data should be in pure, canonical Python 3.10+; validate it with Pydantic.

## Pydantic Logfire :fire:

We've launched Pydantic Logfire to help you monitor your applications.
[Learn more](https://pydantic.dev/logfire/?utm_source=pydantic_validation)

## Pydantic V1.10 vs. V2

Pydantic V2 is a ground-up rewrite that offers many new features, performance improvements, and some breaking changes compared to Pydantic V1.

If you're using Pydantic V1 you may want to look at the
[pydantic V1.10 Documentation](https://pydantic.dev/docs/validation/1.10/overview/) or,
[`1.10.X-fixes` git branch](https://github.com/pydantic/pydantic/tree/1.10.X-fixes). Pydantic V2 also ships with the latest version of Pydantic V1 built in so that you can incrementally upgrade your code base and projects: `from pydantic import v1 as pydantic_v1`.

## Help

See [documentation](https://pydantic.dev/docs/validation/latest/get-started/) for more details.

## Installation

Install using `pip install -U pydantic` or `conda install pydantic -c conda-forge`.
For more installation options to make Pydantic even faster,
see the [Install](https://pydantic.dev/docs/validation/latest/get-started/install/) section in the documentation.

## A Simple Example

```python
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

class User(BaseModel):
    id: int
    name: str = 'John Doe'
    signup_ts: Optional[datetime] = None
    friends: list[int] = []

external_data = {'id': '123', 'signup_ts': '2017-06-01 12:22', 'friends': [1, '2', b'3']}
user = User(**external_data)
print(user)
#> User id=123 name='John Doe' signup_ts=datetime.datetime(2017, 6, 1, 12, 22) friends=[1, 2, 3]
print(user.id)
#> 123
```

## Contributing

For guidance on setting up a development environment and how to make a
contribution to Pydantic, see
[Contributing to Pydantic](https://pydantic.dev/docs/validation/latest/get-started/contributing/).

## Reporting a Security Vulnerability

See our [security policy](https://github.com/pydantic/pydantic/security/policy).

## Changelog

<!-- markdownlint-disable no-bare-urls -->
<!-- markdownlint-disable descriptive-link-text -->
<!-- markdownlint-disable-next-line first-line-heading -->

## v2.14.3 (2026-11-04)

[GitHub release](https://github.com/pydantic/pydantic/releases/tag/v2.14.3)

### What's Changed

#### Packaging

* Build wheels for GraalPy 3.13 by [@msimacek](https://github.com/msimacek) in [#14136](https://github.com/pydantic/pydantic/pull/14136).

  The previous v2.14.2 release published GraalPy 3.11 wheels, which were not working due to a PyO3 version bump. A CI workflow issue
  made it so that the wheel wasn't tested before publishing. This is now fixed: starting in v2.14.3, we no longer publish GraalPy 3.11
  wheels, and GraalPy 3.13 wheels are now published together with the existing 3.12 one.

#### Performance

* Improve schema generation for fixed type handlers by [@alexmojaki](https://github.com/alexmojaki) in [#14130](https://github.com/pydantic/pydantic/pull/14130)
* Skip general schema dispatch for builtin scalars by [@alexmojaki](https://github.com/alexmojaki) in [#14141](https://github.com/pydantic/pydantic/pull/14141)
* Skip annotation handler setup when annotations are empty by [@alexmojaki](https://github.com/alexmojaki) in [#14149](https://github.com/pydantic/pydantic/pull/14149)
* Fix quadratic serialization time with per-index `include`/`exclude` on sequences by [@Viicos](https://github.com/Viicos) in [#14160](https://github.com/pydantic/pydantic/pull/14160)
* Avoid type lookups when checking for `None` during serialization by [@Viicos](https://github.com/Viicos) in [#14167](https://github.com/pydantic/pydantic/pull/14167)
* Improve performance of model serialization by [@Viicos](https://github.com/Viicos) in [#14171](https://github.com/pydantic/pydantic/pull/14171)
* Improve performance of dict serialization by [@Viicos](https://github.com/Viicos) in [#14172](https://github.com/pydantic/pydantic/pull/14172)
* Improve performance of type inference during serialization by [@Viicos](https://github.com/Viicos) in [#14173](https://github.com/pydantic/pydantic/pull/14173)
* Avoid cloning the field name when using the default value during validation by [@Viicos](https://github.com/Viicos) in [#14175](https://github.com/pydantic/pydantic/pull/14175)
* Do not evaluate `model_config` annotations by [@Viicos](https://github.com/Viicos) in [#14195](https://github.com/pydantic/pydantic/pull/14195)
* Avoid slow runtime `Protocol` check when expanding `GroupedMetadata` annotations by [@Viicos](https://github.com/Viicos) in [#14196](https://github.com/pydantic/pydantic/pull/14196)
* Use a lightweight `@contextmanager` implementation internally by [@Viicos](https://github.com/Viicos) in [#14199](https://github.com/pydantic/pydantic/pull/14199)

#### Fixes

* Fix various issues about GC tracking in `pydantic-core` by [@Viicos](https://github.com/Viicos) in [#13819](https://github.com/pydantic/pydantic/pull/13819)
* Include `null` in serialization JSON Schema for `unless-none` field serializers by [@Kropiunig](https://github.com/Kropiunig) in [#13848](https://github.com/pydantic/pydantic/pull/13848)
* Fix `RecursionError` when copying or unpickling models with `defer_build` by [@Viicos](https://github.com/Viicos) in [#14115](https://github.com/pydantic/pydantic/pull/14115)
* Remove dead `default_factory` check in unsupported `Field()` attribute by [@owtaylor](https://github.com/owtaylor) in [#14129](https://github.com/pydantic/pydantic/pull/14129)
* Disallow non string extra keys during validation by [@Viicos](https://github.com/Viicos) in [#14135](https://github.com/pydantic/pydantic/pull/14135)
* Fix deeply nested data being reported as a cyclic reference by [@Viicos](https://github.com/Viicos) in [#14164](https://github.com/pydantic/pydantic/pull/14164)

### New Contributors

* [@owtaylor](https://github.com/owtaylor) made their first contribution in [#14129](https://github.com/pydantic/pydantic/pull/14129)

## v2.14.2 (2026-10-29)

[GitHub release](https://github.com/pydantic/pydantic/releases/tag/v2.14.2)

### What's Changed

#### Packaging

* Bump PyO3 to 0.30.1, jiter to 0.18.0, use `PyFrozenDict` by [@Viicos](https://github.com/Viicos) in [#14003](https://github.com/pydantic/pydantic/pull/14003)
* Bump speedate to v0.18.0 by [@Viicos](https://github.com/Viicos) in [#14007](https://github.com/pydantic/pydantic/pull/14007)
* Publish `pydantic-core` wheels for PyPy 8.0 (`pp80` ABI) by [@Viicos](https://github.com/Viicos) in [#14083](https://github.com/pydantic/pydantic/pull/14083)

#### Performance

* Avoid Python tuple allocation during model fields validation by [@Viicos](https://github.com/Viicos) in [#13955](https://github.com/pydantic/pydantic/pull/13955)
* Lazily call repr of values during nested union serialization by [@Viicos](https://github.com/Viicos) in [#14082](https://github.com/pydantic/pydantic/pull/14082)
* Skip decorator field checks when no field decorators exist by [@alexmojaki](https://github.com/alexmojaki) in [#14111](https://github.com/pydantic/pydantic/pull/14111)
* Avoid heap allocation for small JSON model field buffers by [@alexmojaki](https://github.com/alexmojaki) in [#14113](https://github.com/pydantic/pydantic/pull/14113)

#### Fixes

* Make JSON validation by iteration consistent with Python approach by [@davidhewitt](https://github.com/davidhewitt) in [#13275](https://github.com/pydantic/pydantic/pull/13275).

  JSON validation now handles field lookup and extra data the same way as Python validation. In particular, keys that only match an
  unused alias or field name are now treated as extra data, instead of being silently dropped:

    ```python
    from pydantic import BaseModel, ConfigDict
    from pydantic.alias_generators import to_camel


    class Page(BaseModel):
        model_config = ConfigDict(extra='forbid', alias_generator=to_camel)

        page_size: int = 10


    Page.model_validate_json('{"page_size": 50}')
    # Before: Page(page_size=10)
    # After: ValidationError (extra_forbidden)
    ```

  See the [pull request](https://github.com/pydantic/pydantic/pull/13275) for the full list of behavior changes.

* Fix unpickling of generic classes defined in separate module by [@Viicos](https://github.com/Viicos) in [#13994](https://github.com/pydantic/pydantic/pull/13994)
* Support explicit `by_alias` overriding `validate_by_alias` in validation JSON schemas by [@Viicos](https://github.com/Viicos) in [#13997](https://github.com/pydantic/pydantic/pull/13997)
* Fix mypy plugin crash on deferred empty model by [@ilevkivskyi](https://github.com/ilevkivskyi) in [#14027](https://github.com/pydantic/pydantic/pull/14027)
* Fix infinite recursion when validating an invalid default with `PydanticUseDefault` by [@Viicos](https://github.com/Viicos) in [#14028](https://github.com/pydantic/pydantic/pull/14028)
* Implement recursion guard for `validate_strings()` by [@Viicos](https://github.com/Viicos) in [#14029](https://github.com/pydantic/pydantic/pull/14029)
* Support named tuples in `Sequence` serialization by [@Viicos](https://github.com/Viicos) in [#14033](https://github.com/pydantic/pydantic/pull/14033)
* Take `preserve_empty_path` into account in URL types equality by [@Viicos](https://github.com/Viicos) in [#14035](https://github.com/pydantic/pydantic/pull/14035)
* Fix pickling of `PydanticCustomError` and `ValidationError`s containing custom errors by [@Viicos](https://github.com/Viicos) in [#14051](https://github.com/pydantic/pydantic/pull/14051)
* Do not extract attribute docstrings from nested classes and functions by [@Viicos](https://github.com/Viicos) in [#14052](https://github.com/pydantic/pydantic/pull/14052)
* Fix forward annotations evaluation and type variables substitution when rebuilding parametrized generic models by [@Viicos](https://github.com/Viicos) in [#14054](https://github.com/pydantic/pydantic/pull/14054)
* Fix `Self` resolution in parametrized generics by [@Viicos](https://github.com/Viicos) in [#14065](https://github.com/pydantic/pydantic/pull/14065)
* Ignore extra data matching a field name in `TypedDict` and dataclasses with `extra=allow` by [@Viicos](https://github.com/Viicos) in [#14090](https://github.com/pydantic/pydantic/pull/14090)
* Check mapping `max_length` constraint during validation by [@Viicos](https://github.com/Viicos) in [#14092](https://github.com/pydantic/pydantic/pull/14092)
* Fix deep copy of self-referential models by [@Viicos](https://github.com/Viicos) in [#14116](https://github.com/pydantic/pydantic/pull/14116)

## v2.14.1 (2026-10-11)

[GitHub release](https://github.com/pydantic/pydantic/releases/tag/v2.14.1)

### What's Changed

#### Performance

* Avoid Python tuple allocation during model fields validation by [@Viicos](https://github.com/Viicos) in [#13955](https://github.com/pydantic/pydantic/pull/13955)
* Avoid unnecessary extra dict allocation in model validation by [@Viicos](https://github.com/Viicos) in [#13956](https://github.com/pydantic/pydantic/pull/13956)

#### Fixes

* Fix `arguments-v3` schema with variadic keywords by [@Viicos](https://github.com/Viicos) in [#13954](https://github.com/pydantic/pydantic/pull/13954)
* Fix `TypeError` on `ForwardRef` on Python 3.10.0 by [@Viicos](https://github.com/Viicos) in [#13964](https://github.com/pydantic/pydantic/pull/13964)
* Support `closed` and `extra_items` via inheritance in `TypedDict` by [@Viicos](https://github.com/Viicos) in [#13967](https://github.com/pydantic/pydantic/pull/13967)
* Enforce the `max_digits` whole-digits limit in the Python `Decimal` validator by [@Viicos](https://github.com/Viicos) in [#13972](https://github.com/pydantic/pydantic/pull/13972)
* Reject out-of-range int inputs for `timedelta` by [@Viicos](https://github.com/Viicos) in [#13973](https://github.com/pydantic/pydantic/pull/13973)
* Support named tuples in `Sequence` validation by [@Viicos](https://github.com/Viicos) in [#13978](https://github.com/pydantic/pydantic/pull/13978)

## v2.14.0 (2026-10-08)

[GitHub release](https://github.com/pydantic/pydantic/releases/tag/v2.14.0)

### What's Changed

The highlights of the v2.14 release are available in the [blog post](https://pydantic.dev/articles/pydantic-v2-14-release).
Several minor changes (considered non-breaking changes according to our [versioning policy](https://pydantic.dev/docs/validation/2.14/get-started/version-policy/#pydantic-v2))
are also included in this release. Make sure to look into them before upgrading.

This release drops support for Python 3.9 and adds support for Python 3.15.

#### New Features

* Add support for `multiple_of` constraint in `fraction` and `timedelta` core schemas by [@Viicos](https://github.com/Viicos) in [#13873](https://github.com/pydantic/pydantic/pull/13873)
* Add `__namespace__` parameter to `create_model()` by [@Viicos](https://github.com/Viicos) in [#13895](https://github.com/pydantic/pydantic/pull/13895)

#### Changes

* Add an `ordered-dict` core schema by [@Viicos](https://github.com/Viicos) in [#13796](https://github.com/pydantic/pydantic/pull/13796)
* Add a `counter` core schema by [@Viicos](https://github.com/Viicos) in [#13824](https://github.com/pydantic/pydantic/pull/13824)
* Do not mutate `model_config` attribute by [@Viicos](https://github.com/Viicos) in [#13825](https://github.com/pydantic/pydantic/pull/13825)
* Reject newlines in `NameEmail` validation by [@Viicos](https://github.com/Viicos) in [#13897](https://github.com/pydantic/pydantic/pull/13897)

#### Fixes

* Call enum constructors in both validation modes by [@Viicos](https://github.com/Viicos) in [#13792](https://github.com/pydantic/pydantic/pull/13792)
* Fix documentation examples not raising and remove unused `string_sub_type` unused error code by [@Viicos](https://github.com/Viicos) in [#13821](https://github.com/pydantic/pydantic/pull/13821)
* Catch `OverflowError` during `ByteSize` validation by [@Viicos](https://github.com/Viicos) in [#13850](https://github.com/pydantic/pydantic/pull/13850)
* Require `multiple_of` constraints to be positive by [@Viicos](https://github.com/Viicos) in [#13862](https://github.com/pydantic/pydantic/pull/13862)
* Always pop field name and model type stacks during schema generation by [@saquibjawedbit](https://github.com/saquibjawedbit) in [#13859](https://github.com/pydantic/pydantic/pull/13859)
* Handle `TypeError` gracefully during docstring extraction by [@Viicos](https://github.com/Viicos) in [#13874](https://github.com/pydantic/pydantic/pull/13874)
* Fix config propagation of stdlib dataclasses and `TypedDict`s in JSON Schema by [@Viicos](https://github.com/Viicos) in [#13891](https://github.com/pydantic/pydantic/pull/13891)
* Don't apply `ser_json_timedelta` to all datetime types in serialization inference by [@Viicos](https://github.com/Viicos) in [#13892](https://github.com/pydantic/pydantic/pull/13892)
* Encode JSON Schema defaults with a consistent configuration by [@Viicos](https://github.com/Viicos) in [#13893](https://github.com/pydantic/pydantic/pull/13893)
* Propagate `init` and `kw_only=False` from `Field()` to stdlib dataclass fields by [@Viicos](https://github.com/Viicos) in [#13898](https://github.com/pydantic/pydantic/pull/13898)
* Respect propagated extra config in the JSON Schema of stdlib dataclasses by [@Viicos](https://github.com/Viicos) in [#13899](https://github.com/pydantic/pydantic/pull/13899)
* Handle OS errors during `ZoneInfo` validation by [@Viicos](https://github.com/Viicos) in [#13912](https://github.com/pydantic/pydantic/pull/13912)
* Handle exceptions during `Decimal` validation by [@Viicos](https://github.com/Viicos) in [#13940](https://github.com/pydantic/pydantic/pull/13940)
* Rebuild incomplete types during serialization inference by [@Viicos](https://github.com/Viicos) in [#13922](https://github.com/pydantic/pydantic/pull/13922)
* Reject large exponents in `Fraction` validation by [@Viicos](https://github.com/Viicos) in [#13944](https://github.com/pydantic/pydantic/pull/13944)
* Avoid validating URL prefix multiple times in multi host URLs by [@Viicos](https://github.com/Viicos) in [#13945](https://github.com/pydantic/pydantic/pull/13945)

### New Contributors

* [@saquibjawedbit](https://github.com/saquibjawedbit) made their first contribution in [#13859](https://github.com/pydantic/pydantic/pull/13859)

## v2.14.0b2 (2026-09-09)

[GitHub release](https://github.com/pydantic/pydantic/releases/tag/v2.14.0b2)

### What's Changed

This pre-release adds full support for Python 3.15 specific features, such as support for [`frozendict`](https://docs.python.org/3.15/library/stdtypes.html#frozendict),
making use of [`TypeForm`](https://docs.python.org/3.15/library/typing.html#typing.TypeForm) and stabilizing the
[`MISSING` sentinel](https://pydantic.dev/docs/validation/latest/concepts/types/#missing-sentinel) type.

#### New Features

* Allow any `CoreSchema` to be used as serialization by [@Viicos](https://github.com/Viicos) in [#13680](https://github.com/pydantic/pydantic/pull/13680)
* Add support for [`frozendict`](https://docs.python.org/3.15/library/stdtypes.html#frozendict) type by [@Viicos](https://github.com/Viicos) in [#13634](https://github.com/pydantic/pydantic/pull/13634)
* Allow `dict`, `frozendict` and `frozenset` as `defaultdict` default factories by [@Viicos](https://github.com/Viicos) in [#13623](https://github.com/pydantic/pydantic/pull/13623)
* Add support for [`TypeForm`](https://docs.python.org/3.15/library/typing.html#typing.TypeForm) by [@Viicos](https://github.com/Viicos) in [#13459](https://github.com/pydantic/pydantic/pull/13459).

  This adds support for static type checking where a type form is expected. For instance, type adapters:

    ```python
    from pydantic import TypeAdapter

    ta = TypeAdapter(int | str)
    assert_type(ta.validate_python(1), int | str)
    ```

* Add support for lazy imports by [@Viicos](https://github.com/Viicos) in [#13776](https://github.com/pydantic/pydantic/pull/13776)
* Stabilize `MISSING` sentinel by [@Viicos](https://github.com/Viicos) in [#13782](https://github.com/pydantic/pydantic/pull/13782).

  The [`MISSING` sentinel](https://pydantic.dev/docs/validation/dev/concepts/types/#missing-sentinel) is no longer experimental, and can be imported
  as `from pydantic import MISSING`.

#### Changes

* Take `ser_json_temporal` into account when generating JSON Schema by [@shashiKundur1](https://github.com/shashiKundur1) in [#13665](https://github.com/pydantic/pydantic/pull/13665)
* Use the field name in `__signature__` when `validate_by_alias` is`False` by [@jaideeppyne](https://github.com/jaideeppyne) in [#13730](https://github.com/pydantic/pydantic/pull/13730)
* Add a `deque` core schema by [@Viicos](https://github.com/Viicos) in [#13757](https://github.com/pydantic/pydantic/pull/13757)
* Do not mention `MISSING` as a valid value in validation errors by [@Viicos](https://github.com/Viicos) in [#13779](https://github.com/pydantic/pydantic/pull/13779)
* Refactor `Decimal` JSON Schema `pattern` constraint by [@Viicos](https://github.com/Viicos) in [#13672](https://github.com/pydantic/pydantic/pull/13672)

#### Performance

* Refactor type references logic by [@Viicos](https://github.com/Viicos) in [#13643](https://github.com/pydantic/pydantic/pull/13643)
* Improve performance of `GenerateSchema.generate_schema()` dispatching by [@Viicos](https://github.com/Viicos) in [#13614](https://github.com/pydantic/pydantic/pull/13614)
* Move schema gathering logic to `pydantic-core` by [@Viicos](https://github.com/Viicos) in [#13725](https://github.com/pydantic/pydantic/pull/13725)
* Improve performance of `FieldInfo` construction by [@Viicos](https://github.com/Viicos) in [#13726](https://github.com/pydantic/pydantic/pull/13726)

#### Fixes

* Fix support for callable discriminators with PEP 695 type aliases by [@Viicos](https://github.com/Viicos) in [#13604](https://github.com/pydantic/pydantic/pull/13604)
* Preserve `re.Pattern` instance for compiled patterns in the experimental pipeline by [@soma0212](https://github.com/soma0212) in [#13611](https://github.com/pydantic/pydantic/pull/13611)
* Fix missing GC traversal on some `pydantic-core` struct fields by [@Viicos](https://github.com/Viicos) in [#13624](https://github.com/pydantic/pydantic/pull/13624)
* Fix missing GC traversal in `pydantic-core` for `GeneralFieldsSerializer` by [@Viicos](https://github.com/Viicos) in [#13629](https://github.com/pydantic/pydantic/pull/13629)
* Fix JSON schema discriminator mapping keys for `bool` discriminators by [@remi-fongaufier](https://github.com/remi-fongaufier) in [#13632](https://github.com/pydantic/pydantic/pull/13632)
* Fix application of other constraints in the pipeline API by [@Viicos](https://github.com/Viicos) in [#13659](https://github.com/pydantic/pydantic/pull/13659)
* Support bare `None` annotation for discriminated unions by [@Viicos](https://github.com/Viicos) in [#13667](https://github.com/pydantic/pydantic/pull/13667)
* Respect runtime alias validation configuration when wrap validators are present by [@Viicos](https://github.com/Viicos) in [#13668](https://github.com/pydantic/pydantic/pull/13668)
* Exclude computed fields with `exclude_if` from JSON Schema required fields by [@Bishwas-py](https://github.com/Bishwas-py) in [#13563](https://github.com/pydantic/pydantic/pull/13563)
* Use config of `TypeAdapter` in JSON Schema generation by [@Viicos](https://github.com/Viicos) in [#13676](https://github.com/pydantic/pydantic/pull/13676)
* Support `populate_by_name` in `@validate_call` by [@Viicos](https://github.com/Viicos) in [#13691](https://github.com/pydantic/pydantic/pull/13691)
* Allow `None` to serialize against secret fields by [@Viicos](https://github.com/Viicos) in [#13699](https://github.com/pydantic/pydantic/pull/13699)
* Do not drop include/exclude if serializer wasn't called by [@Viicos](https://github.com/Viicos) in [#13702](https://github.com/pydantic/pydantic/pull/13702)
* Don't apply serialization temporal formats to validation JSON schemas by [@MLuc24](https://github.com/MLuc24) in [#13711](https://github.com/pydantic/pydantic/pull/13711)
* Reflect `str_min_length` and `str_max_length` config in the JSON schema by [@MLuc24](https://github.com/MLuc24) in [#13714](https://github.com/pydantic/pydantic/pull/13714)
* Treat a class attribute set to `None` as existing when assigning with `extra='allow'` by [@Kropiunig](https://github.com/Kropiunig) in [#13718](https://github.com/pydantic/pydantic/pull/13718)
* Use the field name in validation JSON schemas when `validate_by_alias` is `False` by [@MLuc24](https://github.com/MLuc24) in [#13717](https://github.com/pydantic/pydantic/pull/13717)
* Do not rely on normalization to validate decimals by [@Viicos](https://github.com/Viicos) in [#13742](https://github.com/pydantic/pydantic/pull/13742)
* Handle any exception when trying to compute JSON Schema default by [@Viicos](https://github.com/Viicos) in [#13741](https://github.com/pydantic/pydantic/pull/13741)
* Fix Mypy plugin crash with import cycle by [@Viicos](https://github.com/Viicos) in [#13767](https://github.com/pydantic/pydantic/pull/13767)
* Fix supported constraints for types of `datetime` module by [@Viicos](https://github.com/Viicos) in [#13768](https://github.com/pydantic/pydantic/pull/13768)
* Fix inconsistencies between constraints and core schemas allowed values by [@Viicos](https://github.com/Viicos) in [#13772](https://github.com/pydantic/pydantic/pull/13772)
* Allow `self` to be used as a parameter with `@validate_call` by [@Viicos](https://github.com/Viicos) in [#13773](https://github.com/pydantic/pydantic/pull/13773)
* Fix race conditions in freethreaded build by [@Viicos](https://github.com/Viicos) in [#13785](https://github.com/pydantic/pydantic/pull/13785)

### New Contributors

* [@soma0212](https://github.com/soma0212) made their first contribution in [#13611](https://github.com/pydantic/pydantic/pull/13611)
* [@remi-fongaufier](https://github.com/remi-fongaufier) made their first contribution in [#13632](https://github.com/pydantic/pydantic/pull/13632)
* [@shashiKundur1](https://github.com/shashiKundur1) made their first contribution in [#13665](https://github.com/pydantic/pydantic/pull/13665)
* [@MLuc24](https://github.com/MLuc24) made their first contribution in [#13711](https://github.com/pydantic/pydantic/pull/13711)
* [@jaideeppyne](https://github.com/jaideeppyne) made their first contribution in [#13730](https://github.com/pydantic/pydantic/pull/13730)

## v2.14.0b1 (2026-08-06)

[GitHub release](https://github.com/pydantic/pydantic/releases/tag/v2.14.0b1)

### What's Changed

This is the first beta release of the 2.14 version, providing some new features and performance improvements for model builds.

This release is the first to provide initial support for Python 3.15, although not all 3.15 specific features are supported yet.

#### Packaging

* Add agent skills by [@Viicos](https://github.com/Viicos) in [#13193](https://github.com/pydantic/pydantic/pull/13193)

#### New Features

* Add support for `EllipsisType` by [@Viicos](https://github.com/Viicos) in [#13484](https://github.com/pydantic/pydantic/pull/13484)
* Add initial support for Python 3.15 by [@Viicos](https://github.com/Viicos) in [#13587](https://github.com/pydantic/pydantic/pull/13587)

#### Changes

* Populate `__slots__` from generic class during parameterization by [@Viicos](https://github.com/Viicos) in [#13243](https://github.com/pydantic/pydantic/pull/13243)
* Avoid using explicit `Any` in the Mypy plugin by [@Viicos](https://github.com/Viicos) in [#13196](https://github.com/pydantic/pydantic/pull/13196)
* Support `Fraction` type in `pydantic-core` by [@Viicos](https://github.com/Viicos) in [#13339](https://github.com/pydantic/pydantic/pull/13339)
* Use constant-time comparison for `SecretStr` and `SecretBytes` types by [@Viicos](https://github.com/Viicos) in [#13518](https://github.com/pydantic/pydantic/pull/13518)
* Fix application of constraints in pipeline API by [@Viicos](https://github.com/Viicos) in [#13516](https://github.com/pydantic/pydantic/pull/13516)
* Optimize type lookup logic in core schema generation by [@Viicos](https://github.com/Viicos) in [#13573](https://github.com/pydantic/pydantic/pull/13573)
* Add a `named-tuple` core schema by [@Viicos](https://github.com/Viicos) in [#13505](https://github.com/pydantic/pydantic/pull/13505)
* Raise explicit `TypeError` on invalid `index_key` serialization wrap handler by [@Viicos](https://github.com/Viicos) in [#13506](https://github.com/pydantic/pydantic/pull/13506)

#### Performance

* Cache `ModelPrivateAttr.default_factory_takes_validated_data` property by [@Viicos](https://github.com/Viicos) in [#13390](https://github.com/pydantic/pydantic/pull/13390)
* Introduce micro-optimizations for model class building by [@dmontagu](https://github.com/dmontagu) in [#13540](https://github.com/pydantic/pydantic/pull/13540)
* Try `Format.VALUE` before `FORWARDREF` when evaluating annotations in `ModelMetaclass` by [@Viicos](https://github.com/Viicos) in [#13584](https://github.com/pydantic/pydantic/pull/13584)
* Optimize type lookup logic in core schema generation by [@Viicos](https://github.com/Viicos) in [#13573](https://github.com/pydantic/pydantic/pull/13573)
* Avoid exponential core schema traversal in `gather_schemas_for_cleaning()` by [@dmontagu](https://github.com/dmontagu) in [#13523](https://github.com/pydantic/pydantic/pull/13523)

#### Fixes

* Validate falsy `AliasGenerator` outputs by [@jiyujie2006](https://github.com/jiyujie2006) in [#13248](https://github.com/pydantic/pydantic/pull/13248)
* Do not resolve recursive `'definitions-ref'` schemas in schema cleaning by [@Viicos](https://github.com/Viicos) in [#13276](https://github.com/pydantic/pydantic/pull/13276)
* Fix missing `max_length` check on lazy iteration validation by [@davidhewitt](https://github.com/davidhewitt) in [#13278](https://github.com/pydantic/pydantic/pull/13278)
* Handle missing errors with default factories taking validated data by [@Viicos](https://github.com/Viicos) in [#13291](https://github.com/pydantic/pydantic/pull/13291)
* Recognise `WindowsPath` as a schema type by [@davidhewitt](https://github.com/davidhewitt) in [#13326](https://github.com/pydantic/pydantic/pull/13326)
* Fix application of nested operators in pipeline API by [@Viicos](https://github.com/Viicos) in [#13363](https://github.com/pydantic/pydantic/pull/13363)
* Fix type variable substitution in `__pydantic_extra__` by [@Viicos](https://github.com/Viicos) in [#13391](https://github.com/pydantic/pydantic/pull/13391)
* Fix `json_schema_extra` dict being dropped when a callable follows it in `Annotated` by [@Srivatsa03](https://github.com/Srivatsa03) in [#13374](https://github.com/pydantic/pydantic/pull/13374)
* Skip `RootModel.__init__()` in Mypy plugin by [@Viicos](https://github.com/Viicos) in [#13441](https://github.com/pydantic/pydantic/pull/13441)
* Defer placeholders in Mypy plugin by [@Viicos](https://github.com/Viicos) in [#13442](https://github.com/pydantic/pydantic/pull/13442)
* Do not ignore timezone offset when using `'seconds'/'milliseconds'` `temporal_mode` by [@Viicos](https://github.com/Viicos) in [#13436](https://github.com/pydantic/pydantic/pull/13436)
* Make model rebuilding logic thread safe by [@Viicos](https://github.com/Viicos) in [#13438](https://github.com/pydantic/pydantic/pull/13438)
* Fix `Interval` zero bounds silently dropped in pipeline API by [@pctablet505](https://github.com/pctablet505) in [#13452](https://github.com/pydantic/pydantic/pull/13452)
* Sync `RootModel.model_dump()` signature with its parent by [@Viicos](https://github.com/Viicos) in [#13456](https://github.com/pydantic/pydantic/pull/13456)
* Return `NotImplemented` from URL ordering comparisons with foreign types by [@chinesepowered](https://github.com/chinesepowered) in [#13495](https://github.com/pydantic/pydantic/pull/13495)
* Don't error on unhashable generic arguments on generic Pydantic models by [@Viicos](https://github.com/Viicos) in [#13515](https://github.com/pydantic/pydantic/pull/13515)
* Fix population of `SerializationInfo.exclude_computed_fields` by [@Viicos](https://github.com/Viicos) in [#13560](https://github.com/pydantic/pydantic/pull/13560)
* Fix serialization of `ValidateAs` by [@Viicos](https://github.com/Viicos) in [#13487](https://github.com/pydantic/pydantic/pull/13487)
* Allow reuse of validators when plugins are set by [@Viicos](https://github.com/Viicos) in [#13535](https://github.com/pydantic/pydantic/pull/13535)
* Avoid double-wrapping polymorphism trampoline for model serializers by [@davidhewitt](https://github.com/davidhewitt) in [#13552](https://github.com/pydantic/pydantic/pull/13552)
* Add `AllowInfNan` type to the field metadata gathering by [@mberdyshev](https://github.com/mberdyshev) in [#13586](https://github.com/pydantic/pydantic/pull/13586)

### New Contributors

* [@jiyujie2006](https://github.com/jiyujie2006) made their first contribution in [#13248](https://github.com/pydantic/pydantic/pull/13248)
* [@pctablet505](https://github.com/pctablet505) made their first contribution in [#13452](https://github.com/pydantic/pydantic/pull/13452)
* [@LuShadowX](https://github.com/LuShadowX) made their first contribution in [#13503](https://github.com/pydantic/pydantic/pull/13503)
* [@mberdyshev](https://github.com/mberdyshev) made their first contribution in [#13586](https://github.com/pydantic/pydantic/pull/13586)

## v2.14.0a1 (2026-05-22)

[GitHub release](https://github.com/pydantic/pydantic/releases/tag/v2.14.0a1)

### What's Changed

#### Packaging

* Add PyEmscripten platform tag support by [@Viicos](https://github.com/Viicos), [@greateggsgreg](https://github.com/greateggsgreg) and [@sinaatalay](https://github.com/sinaatalay) in [#13199](https://github.com/pydantic/pydantic/pull/13199):
  `pydantic-core` now has a 3.14 wheel published with the [`pyemscripten_2026_0` platform tag](https://pyodide.org/en/latest/development/abi/314.html).
  Note that this wheel can only be used with [Pyodide 314.0](https://github.com/pyodide/pyodide/issues/6233) and greater, still in development.
  It is recommended to wait for the final 314.0 release (and for Pydantic to publish a new wheel in a future 2.14 release).

#### Changes

* Accept `None` in `MultiHostUrl.build()`'s `hosts` parameter by [@Viicos](https://github.com/Viicos) in [#13068](https://github.com/pydantic/pydantic/pull/13068)
* Drop support for Python 3.9 by [@Viicos](https://github.com/Viicos) in [#13070](https://github.com/pydantic/pydantic/pull/13070)
* Remove support for `eval_type_backport()` by [@Viicos](https://github.com/Viicos) in [#13133](https://github.com/pydantic/pydantic/pull/13133)
* Only deepcopy non-updated fields in `model_copy()` by [@connorcarpenter15](https://github.com/connorcarpenter15) in [#13087](https://github.com/pydantic/pydantic/pull/13087)

#### Fixes

* Add Mypy plugin workaround for dynamic models defined in functions by [@ilevkivskyi](https://github.com/ilevkivskyi) in [#13177](https://github.com/pydantic/pydantic/pull/13177)
* Fallback to `create_model()` overload definition when `__base__` is set to a type variable in the Mypy plugin by [@cyphercodes](https://github.com/cyphercodes) in [#13146](https://github.com/pydantic/pydantic/pull/13146)

### New Contributors

* [@ilevkivskyi](https://github.com/ilevkivskyi) made their first contribution in [#13177](https://github.com/pydantic/pydantic/pull/13177)
* [@cyphercodes](https://github.com/cyphercodes) made their first contribution in [#13146](https://github.com/pydantic/pydantic/pull/13146)
* [@connorcarpenter15](https://github.com/connorcarpenter15) made their first contribution in [#13087](https://github.com/pydantic/pydantic/pull/13087)

## v2.13.4 (2026-05-06)

[GitHub release](https://github.com/pydantic/pydantic/releases/tag/v2.13.4)

### What's Changed

#### Packaging

* Bump libc from 0.2.155 to 0.2.185 by [@Viicos](https://github.com/Viicos) in [#13109](https://github.com/pydantic/pydantic/pull/13109)
* Adapt `pydantic-core` linker flags on macOS by [@washingtoneg](https://github.com/washingtoneg) and [@Viicos](https://github.com/Viicos) in [#13147](https://github.com/pydantic/pydantic/pull/13147)

#### Fixes

* Preserve `RootModel` core metadata by [@Viicos](https://github.com/Viicos) in [#13129](https://github.com/pydantic/pydantic/pull/13129)

## v2.13.3 (2026-04-20)

[GitHub release](https://github.com/pydantic/pydantic/releases/tag/v2.13.3)

### What's Changed

#### Fixes

* Handle `AttributeError` subclasses with `from_attributes` by [@Viicos](https://github.com/Viicos) in [#13096](https://github.com/pydantic/pydantic/pull/13096)

## v2.13.2 (2026-04-17)

[GitHub release](https://github.com/pydantic/pydantic/releases/tag/v2.13.2)

### What's Changed

#### Fixes

* Fix `ValidationInfo.field_name` missing with `model_validate_json()` by [@Viicos](https://github.com/Viicos) in [#13084](https://github.com/pydantic/pydantic/pull/13084)

## v2.13.1 (2026-04-15)

[GitHub release](https://github.com/pydantic/pydantic/releases/tag/v2.13.1)

### What's Changed

#### Fixes

* Fix `ValidationInfo.data` missing with `model_validate_json()` by [@davidhewitt](https://github.com/davidhewitt) in [#13079](https://github.com/pydantic/pydantic/pull/13079)

## v2.13.0 (2026-04-13)

[GitHub release](https://github.com/pydantic/pydantic/releases/tag/v2.13.0)

The highlights of the v2.13 release are available in the [blog post](https://pydantic.dev/articles/pydantic-v2-13-release).
Several minor changes (considered non-breaking changes according to our [versioning policy](https://pydantic.dev/docs/validation/2.13/get-started/version-policy/#pydantic-v2))
are also included in this release. Make sure to look into them before upgrading.

This release contains the updated `pydantic.v1` namespace, matching version 1.10.26 which includes support for Python 3.14.

### What's Changed

See the beta releases for all changes sinces 2.12.

#### New Features

* Allow default factories of private attributes to take validated model data by [@Viicos](https://github.com/Viicos) in [#13013](https://github.com/pydantic/pydantic/pull/13013)

#### Changes

* Warn when serializing fixed length tuples with too few items by [@arvindsaripalli](https://github.com/arvindsaripalli) in [#13016](https://github.com/pydantic/pydantic/pull/13016)

#### Fixes

* Change type of `Any` when synthesizing `_build_sources` for  `BaseSettings.__init__()` signature in the mypy plugin by [@Viicos](https://github.com/Viicos) in [#13049](https://github.com/pydantic/pydantic/pull/13049)
* Fix model equality when using runtime `extra` configuration by [@Viicos](https://github.com/Viicos) in [#13062](https://github.com/pydantic/pydantic/pull/13062)

#### Packaging

* Add zizmor for GitHub Actions workflow linting by [@Viicos](https://github.com/Viicos) in [#13039](https://github.com/pydantic/pydantic/pull/13039)
* Update jiter to v0.14.0 to fix a segmentation fault on musl Linux by [@Viicos](https://github.com/Viicos) in [#13064](https://github.com/pydantic/pydantic/pull/13064)

### New Contributors

* [@arvindsaripalli](https://github.com/arvindsaripalli) made their first contribution in [#13016](https://github.com/pydantic/pydantic/pull/13016)

## v2.13.0b3 (2026-03-31)

[GitHub release](https://github.com/pydantic/pydantic/releases/tag/v2.13.0b3)

### What's Changed

#### New Features

* Add `ascii_only` option to `StringConstraints` by [@ai-man-codes](https://github.com/ai-man-codes) in [#12907](https://github.com/pydantic/pydantic/pull/12907)
* Support `exclude_if` in computed fields by [@andresliszt](https://github.com/andresliszt) in [#12748](https://github.com/pydantic/pydantic/pull/12748)
* Push down constraints in unions involving `MISSING` sentinel by [@Viicos](https://github.com/Viicos) in [#12908](https://github.com/pydantic/pydantic/pull/12908)

#### Changes

* Track extra fields set after init in `model_fields_set` by [@navalprakhar](https://github.com/navalprakhar) in [#12817](https://github.com/pydantic/pydantic/pull/12817)
* Do not include annotations that are not part of named tuple fields by [@galuszkak](https://github.com/galuszkak) in [#12951](https://github.com/pydantic/pydantic/pull/12951)
* No longer fall back to trying all union members when the variant selected by discriminator fails to serialize by [@navalprakhar](https://github.com/navalprakhar) in [#12825](https://github.com/pydantic/pydantic/pull/12825)

#### Fixes

* Support discriminator metadata outside union type alias by [@Viicos](https://github.com/Viicos) in [#12785](https://github.com/pydantic/pydantic/pull/12785)
* Respect `extras_schema` when only `extra_fields_behavior` is set on the config in JSON Schema generation for typed dictionaries by [@Viicos](https://github.com/Viicos) in [#12810](https://github.com/pydantic/pydantic/pull/12810)
* Ensure `__pydantic_private__` is set in `model_construct()` with user-defined `model_post_init()` by [@nightcityblade](https://github.com/nightcityblade) in [#12816](https://github.com/pydantic/pydantic/pull/12816)
* Handle all schema generation errors in `InstanceOf` by [@Viicos](https://github.com/Viicos) in [#12705](https://github.com/pydantic/pydantic/pull/12705)
* Allow dynamic models created with `create_model()` to be used as annotations in the Mypy plugin by [@Br1an67](https://github.com/Br1an67) in [#12879](https://github.com/pydantic/pydantic/pull/12879)
* Check for `PlaceholderNode` in Mypy plugin by [@Viicos](https://github.com/Viicos) in [#12929](https://github.com/pydantic/pydantic/pull/12929)
* Try other branches in smart union in case of omit errors by [@mikeedjones](https://github.com/mikeedjones) in [#12758](https://github.com/pydantic/pydantic/pull/12758)
* Patch unset attributes with `MISSING` during model serialization with `exclude_unset` by [@davidhewitt](https://github.com/davidhewitt) in [#12905](https://github.com/pydantic/pydantic/pull/12905)
* Ensure custom `__init__()` is called when using `model_validate_strings()` by [@siewcapital](https://github.com/siewcapital) in [#12897](https://github.com/pydantic/pydantic/pull/12897)

#### Packaging

* Add riscv64 build target for manylinux by [@boosterl](https://github.com/boosterl) in [#12723](https://github.com/pydantic/pydantic/pull/12723)

### New Contributors

* [@kelsonbrito50](https://github.com/kelsonbrito50) made their first contribution in [#12860](https://github.com/pydantic/pydantic/pull/12860)
* [@boosterl](https://github.com/boosterl) made their first contribution in [#12723](https://github.com/pydantic/pydantic/pull/12723)
* [@adityagiri3600](https://github.com/adityagiri3600) made their first contribution in [#12868](https://github.com/pydantic/pydantic/pull/12868)
* [@navalprakhar](https://github.com/navalprakhar) made their first contribution in [#12817](https://github.com/pydantic/pydantic/pull/12817)
* [@Br1an67](https://github.com/Br1an67) made their first contribution in [#12879](https://github.com/pydantic/pydantic/pull/12879)
* [@rmorshea](https://github.com/rmorshea) made their first contribution in [#12910](https://github.com/pydantic/pydantic/pull/12910)
* [@N3XT3R1337](https://github.com/N3XT3R1337) made their first contribution in [#12922](https://github.com/pydantic/pydantic/pull/12922)
* [@ai-man-codes](https://github.com/ai-man-codes) made their first contribution in [#12907](https://github.com/pydantic/pydantic/pull/12907)
* [@Yume05-dev](https://github.com/Yume05-dev) made their first contribution in [#12953](https://github.com/pydantic/pydantic/pull/12953)
* [@galuszkak](https://github.com/galuszkak) made their first contribution in [#12951](https://github.com/pydantic/pydantic/pull/12951)
* [@siewcapital](https://github.com/siewcapital) made their first contribution in [#12897](https://github.com/pydantic/pydantic/pull/12897)

## v2.13.0b2 (2026-02-24)

[GitHub release](https://github.com/pydantic/pydantic/releases/tag/v2.13.0b2)

### What's Changed

#### Fixes

* Fix backported V1 namespace by [@Viicos](https://github.com/Viicos) in [#12855](https://github.com/pydantic/pydantic/pull/12855)
* Allow any type form to be used in `validate_as()` by [@bledden](https://github.com/bledden) in [#12846](https://github.com/pydantic/pydantic/pull/12846)
* Fix walrus operator precedence in `UrlConstraints.__get_pydantic_core_schema__()` by [@bysiber](https://github.com/bysiber) in [#12826](https://github.com/pydantic/pydantic/pull/12826)

### New Contributors

* [@bledden](https://github.com/bledden) made their first contribution in [#12846](https://github.com/pydantic/pydantic/pull/12846)
* [@bysiber](https://github.com/bysiber) made their first contribution in [#12827](https://github.com/pydantic/pydantic/pull/12827)

## v2.13.0b1 (2026-02-23)

[GitHub release](https://github.com/pydantic/pydantic/releases/tag/v2.13.0b1)

This is the first beta release of the 2.13 version, mainly providing bug fixes and performance improvements
for validation and serialization.

Notable changes include:

* Add a new `polymorphic_serialization` option, solving issues with `serialize_as_any` introduced in 2.12.
* Latest V1.10.26 release under the `pydantic.v1` namespace. This version includes support for Python 3.14.
* The [`pydantic-core`](https://github.com/pydantic/pydantic-core/) repository was merged inside the main `pydantic` one.

### What's Changed

#### New Features

* Add `polymorphic_serialization` option by [@davidhewitt](https://github.com/davidhewitt) in [#12518](https://github.com/pydantic/pydantic/pull/12518)
* Support Root models with `Literal` root types as discriminator field types by [@YassinNouh21](https://github.com/YassinNouh21) in [#12680](https://github.com/pydantic/pydantic/pull/12680)

#### Changes

* Migrate `pydantic-core` CI by [@Viicos](https://github.com/Viicos) in [#12752](https://github.com/pydantic/pydantic/pull/12752)
* Import `pydantic-core` into pydantic by [@davidhewitt](https://github.com/davidhewitt) in [#12481](https://github.com/pydantic/pydantic/pull/12481)
* Backport V1 changes up to v1.10.26 by [@Viicos](https://github.com/Viicos) in [#12663](https://github.com/pydantic/pydantic/pull/12663)
* Use the `complex()` constructor unconditionally when validating `complex` Python data by [@tanmaymunjal](https://github.com/tanmaymunjal) in [#12498](https://github.com/pydantic/pydantic/pull/12498)
* Add support for three-tuple input for `Decimal` by [@tanmaymunjal](https://github.com/tanmaymunjal) in [#12500](https://github.com/pydantic/pydantic/pull/12500)
* Align `@field_serializer` logic with `@field_validator` by [@Viicos](https://github.com/Viicos) in [#12577](https://github.com/pydantic/pydantic/pull/12577)
* Make `PydanticUserError` a `RuntimeError` instead of a `TypeError` by [@poliakovva](https://github.com/poliakovva) in [#12579](https://github.com/pydantic/pydantic/pull/12579)
* Remove redundant serialization attempts in nested unions by [@davidhewitt](https://github.com/davidhewitt) in [#12604](https://github.com/pydantic/pydantic/pull/12604)
* Copy `root` value when making root model shallow copies by [@YassinNouh21](https://github.com/YassinNouh21) in [#12679](https://github.com/pydantic/pydantic/pull/12679)
* Ensure deterministic JSON schema defaults by sorting sets by [@drshvik](https://github.com/drshvik) in [#12760](https://github.com/pydantic/pydantic/pull/12760)

#### Performance

* Refactor `DecoratorInfos.build()` implementation by [@Viicos](https://github.com/Viicos) in [#12536](https://github.com/pydantic/pydantic/pull/12536)
* Cache compiled regex in `pydantic-core` by [@Viicos](https://github.com/Viicos) in [#12549](https://github.com/pydantic/pydantic/pull/12549)
* Optimize creation of `Literal` validators by [@davidhewitt](https://github.com/davidhewitt) in [#12569](https://github.com/pydantic/pydantic/pull/12569)
* Optimize implementation of `LookupKey` by [@davidhewitt](https://github.com/davidhewitt) in [#12571](https://github.com/pydantic/pydantic/pull/12571)
* Use python strings for field names by [@davidhewitt](https://github.com/davidhewitt) in [#12631](https://github.com/pydantic/pydantic/pull/12631)
* Optimize datetime formatting code by [@davidhewitt](https://github.com/davidhewitt) in [#12626](https://github.com/pydantic/pydantic/pull/12626)
* Validate JSON model data by iteration by [@davidhewitt](https://github.com/davidhewitt) in [#12550](https://github.com/pydantic/pydantic/pull/12550)
* Optimize annotations evaluation of Pydantic models by [@Viicos](https://github.com/Viicos) in [#12681](https://github.com/pydantic/pydantic/pull/12681)
* Optimize `FieldInfo._copy()` by [@Viicos](https://github.com/Viicos) in [#12727](https://github.com/pydantic/pydantic/pull/12727)

#### Fixes

* Fix `FieldInfo` rebuilding when parameterizing generic models with an `Annotated` type by [@Viicos](https://github.com/Viicos) in [#12463](https://github.com/pydantic/pydantic/pull/12463)
* Fix nested model schema deduplication in JSON schema generation by [@marwan-alloreview](https://github.com/marwan-alloreview) in [#12494](https://github.com/pydantic/pydantic/pull/12494)
* Fix `InitVar` being ignored when using with the `pydantic.Field()` function by [@Viicos](https://github.com/Viicos) in [#12495](https://github.com/pydantic/pydantic/pull/12495)
* Fix support for enums with `NamedTuple` as values by [@Viicos](https://github.com/Viicos) in [#12506](https://github.com/pydantic/pydantic/pull/12506)
* Do not delete mock validator/serializer in `rebuild_dataclass()` by [@Viicos](https://github.com/Viicos) in [#12513](https://github.com/pydantic/pydantic/pull/12513)
* Require test suite to pass with free threading, switch back to global generic types cache by [@davidhewitt](https://github.com/davidhewitt) in [#12537](https://github.com/pydantic/pydantic/pull/12537)
* Refactor `__pydantic_extra__` annotation handling by [@Viicos](https://github.com/Viicos) in [#12563](https://github.com/pydantic/pydantic/pull/12563)
* Do not add claim of UUID "safety" provision by [@davidhewitt](https://github.com/davidhewitt) in [#12567](https://github.com/pydantic/pydantic/pull/12567)
* Use Python hash to perform lookup in tagged union serializer by [@davidhewitt](https://github.com/davidhewitt) in [#12594](https://github.com/pydantic/pydantic/pull/12594)
* Do not emit serialization warning `MISSING` sentinel is present in a nested model by [@Viicos](https://github.com/Viicos) in [#12635](https://github.com/pydantic/pydantic/pull/12635)
* Do not eagerly evaluate annotations in signature logic by [@Viicos](https://github.com/Viicos) in [#12660](https://github.com/pydantic/pydantic/pull/12660)
* Fix serialization of typed dict unions when `exclude_none` is set by [@davidhewitt](https://github.com/davidhewitt) in [#12677](https://github.com/pydantic/pydantic/pull/12677)
* Do not reuse prebuilt serializers/validators on rebuilds by [@lmmx](https://github.com/lmmx) in [#12689](https://github.com/pydantic/pydantic/pull/12689)
* Fix type annotation of `field_definitions` in `create_model()` by [@lehmann-hqs](https://github.com/lehmann-hqs) in [#12734](https://github.com/pydantic/pydantic/pull/12734)
* Fix incorrect dataclass constructor signature when overriding class `kw_only` with `Field()` by [@jfadia](https://github.com/jfadia) in [#12741](https://github.com/pydantic/pydantic/pull/12741)
* Use `typing.Union` when replacing types under Python 3.14 by [@Viicos](https://github.com/Viicos) in [#12733](https://github.com/pydantic/pydantic/pull/12733)
* Improve ImportString error when internal imports fail by [@tsembp](https://github.com/tsembp) in [#12740](https://github.com/pydantic/pydantic/pull/12740)
* Fix serializing complex numbers with negative zero imaginary part by [@lhnwrk](https://github.com/lhnwrk) in [#12770](https://github.com/pydantic/pydantic/pull/12770)
* Preserve custom docstrings on stdlib dataclasses in JSON schema by [@nightcityblade](https://github.com/nightcityblade) in [#12815](https://github.com/pydantic/pydantic/pull/12815)

#### Packaging

* Bump Rust url dependency from 2.5.4 to 2.5.7 in `pydantic-core` by [@dependabot](https://github.com/dependabot)[bot] in [#12508](https://github.com/pydantic/pydantic/pull/12508)
* Bump Rust minimum version to 1.88, use edition 2024 by [@davidhewitt](https://github.com/davidhewitt) and [@Viicos](https://github.com/Viicos) in [#12551](https://github.com/pydantic/pydantic/pull/12551) and [#12752](https://github.com/pydantic/pydantic/pull/12752)
* Bump PyO3 to 0.28, jiter to 0.13 by [@davidhewitt](https://github.com/davidhewitt) in [#12767](https://github.com/pydantic/pydantic/pull/12767)

### New Contributors

* [@marwan-alloreview](https://github.com/marwan-alloreview) made their first contribution in [#12494](https://github.com/pydantic/pydantic/pull/12494)
* [@tanmaymunjal](https://github.com/tanmaymunjal) made their first contribution in [#12498](https://github.com/pydantic/pydantic/pull/12498)
* [@poliakovva](https://github.com/poliakovva) made their first contribution in [#12579](https://github.com/pydantic/pydantic/pull/12579)
* [@lehmann-hqs](https://github.com/lehmann-hqs) made their first contribution in [#12734](https://github.com/pydantic/pydantic/pull/12734)
* [@jfadia](https://github.com/jfadia) made their first contribution in [#12741](https://github.com/pydantic/pydantic/pull/12741)
* [@tsembp](https://github.com/tsembp) made their first contribution in [#12740](https://github.com/pydantic/pydantic/pull/12740)
* [@drshvik](https://github.com/drshvik) made their first contribution in [#12760](https://github.com/pydantic/pydantic/pull/12760)
* [@lhnwrk](https://github.com/lhnwrk) made their first contribution in [#12770](https://github.com/pydantic/pydantic/pull/12770)
* [@nightcityblade](https://github.com/nightcityblade) made their first contribution in [#12815](https://github.com/pydantic/pydantic/pull/12811)

## v2.12.5 (2025-11-26)

[GitHub release](https://github.com/pydantic/pydantic/releases/tag/v2.12.5)

This is the fifth 2.12 patch release, addressing an issue with the `MISSING` sentinel and providing several documentation improvements.

The next 2.13 minor release will be published in a couple weeks, and will include a new *polymorphic serialization* feature addressing
the remaining unexpected changes to the *serialize as any* behavior.

* Fix pickle error when using `model_construct()` on a model with `MISSING` as a default value by [@ornariece](https://github.com/ornariece) in [#12522](https://github.com/pydantic/pydantic/pull/12522).
* Several updates to the documentation by [@Viicos](https://github.com/Viicos).

## v2.12.4 (2025-11-05)

[GitHub release](https://github.com/pydantic/pydantic/releases/tag/v2.12.4)

This is the fourth 2.12 patch release, fixing more regressions, and reverting a change in the `build()` method
of the [`AnyUrl` and Dsn types](https://pydantic.dev/docs/validation/latest/api/pydantic/networks/).

This patch release also fixes an issue with the serialization of IP address types, when `serialize_as_any` is used. The next patch release
will try to address the remaining issues with *serialize as any* behavior by introducing a new *polymorphic serialization* feature, that
should be used in most cases in place of *serialize as any*.

* Fix issue with forward references in parent `TypedDict` classes by [@Viicos](https://github.com/Viicos) in [#12427](https://github.com/pydantic/pydantic/pull/12427).

    This issue is only relevant on Python 3.14 and greater.

* Exclude fields with `exclude_if` from JSON Schema required fields by [@Viicos](https://github.com/Viicos) in [#12430](https://github.com/pydantic/pydantic/pull/12430)
* Revert URL percent-encoding of credentials in the `build()` method
  of the [`AnyUrl` and Dsn types](https://pydantic.dev/docs/validation/latest/api/pydantic/networks/) by [@davidhewitt](https://github.com/davidhewitt) in
  [pydantic-core#1833](https://github.com/pydantic/pydantic-core/pull/1833).

    This was initially considered as a bugfix, but caused regressions and as such was fully reverted. The next release will include
    an opt-in option to percent-encode components of the URL.

* Add type inference for IP address types by [@davidhewitt](https://github.com/davidhewitt) in [pydantic-core#1868](https://github.com/pydantic/pydantic-core/pull/1868).

    The 2.12 changes to the `serialize_as_any` behavior made it so that IP address types could not properly serialize to JSON.

* Avoid getting default values from defaultdict by [@davidhewitt](https://github.com/davidhewitt) in [pydantic-core#1853](https://github.com/pydantic/pydantic-core/pull/1853).

    This fixes a subtle regression in the validation behavior of the [`collections.defaultdict`](https://docs.python.org/3/library/collections.html#collections.defaultdict)
    type.

* Fix issue with field serializers on nested typed dictionaries by [@davidhewitt](https://github.com/davidhewitt) in [pydantic-core#1879](https://github.com/pydantic/pydantic-core/pull/1879).
* Add more `pydantic-core` builds for the three-threaded version of Python 3.14 by [@davidhewitt](https://github.com/davidhewitt) in [pydantic-core#1864](https://github.com/pydantic/pydantic-core/pull/1864).

## v2.12.3 (2025-10-17)

[GitHub release](https://github.com/pydantic/pydantic/releases/tag/v2.12.3)

### What's Changed

This is the third 2.12 patch release, fixing issues related to the `FieldInfo` class, and reverting a change to the supported
[*after* model validator](https://pydantic.dev/docs/validation/latest/concepts/validators/#model-validators) function signatures.

* Raise a warning when an invalid after model validator function signature is raised by [@Viicos](https://github.com/Viicos) in [#12414](https://github.com/pydantic/pydantic/pull/12414).
  Starting in 2.12.0, using class methods for *after* model validators raised an error, but the error wasn't raised concistently. We decided
  to emit a deprecation warning instead.
* Add [`FieldInfo.asdict()`](https://pydantic.dev/docs/validation/latest/api/pydantic/fields/#pydantic.fields.FieldInfo.asdict) method, improve documentation around `FieldInfo` by [@Viicos](https://github.com/Viicos) in [#12411](https://github.com/pydantic/pydantic/pull/12411).
  This also add back support for mutations on `FieldInfo` classes, that are reused as `Annotated` metadata. **However**, note that this is still
  *not* a supported pattern. Instead, please refer to the [added example](https://pydantic.dev/docs/validation/latest/examples/dynamic_models/) in the documentation.

The [blog post](https://pydantic.dev/articles/pydantic-v2-12-release#changes) section on changes was also updated to document the changes related to `serialize_as_any`.

## v2.12.2 (2025-10-14)

[GitHub release](https://github.com/pydantic/pydantic/releases/tag/v2.12.2)

### What's Changed

#### Fixes

* Release a new `pydantic-core` version, as a corrupted CPython 3.10 `manylinux2014_aarch64` wheel got uploaded ([pydantic-core#1843](https://github.com/pydantic/pydantic-core/pull/1843)).
* Fix issue with recursive generic models with a parent model class by [@Viicos](https://github.com/Viicos) in [#12398](https://github.com/pydantic/pydantic/pull/12398)

## v2.12.1 (2025-10-13)

[GitHub release](https://github.com/pydantic/pydantic/releases/tag/v2.12.1)

### What's Changed

This is the first 2.12 patch release, addressing most (but not all yet) regressions from the initial 2.12.0 release.

#### Fixes

* Do not evaluate annotations when inspecting validators and serializers by [@Viicos](https://github.com/Viicos) in [#12355](https://github.com/pydantic/pydantic/pull/12355)
* Make sure `None` is converted as `NoneType` in Python 3.14 by [@Viicos](https://github.com/Viicos) in [#12370](https://github.com/pydantic/pydantic/pull/12370)
* Backport V1 runtime warning when using Python 3.14 by [@Viicos](https://github.com/Viicos) in [#12367](https://github.com/pydantic/pydantic/pull/12367)
* Fix error message for invalid validator signatures by [@Viicos](https://github.com/Viicos) in [#12366](https://github.com/pydantic/pydantic/pull/12366)
* Populate field name in `ValidationInfo` for validation of default value by [@Viicos](https://github.com/Viicos) in [pydantic-core#1826](https://github.com/pydantic/pydantic-core/pull/1826)
* Encode credentials in `MultiHostUrl` builder by [@willswire](https://github.com/willsw
