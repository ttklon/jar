---
id: "pypi:hypothesis"
kind: "pypi"
category: "coding-agents"
package: "hypothesis"
version: "6.170.15"
url: "https://pypi.org/project/hypothesis/"
requires_python: ">=3.11"
summary: "The property-based testing library for Python"
fetched_at: "2026-11-08T12:19:23Z"
---

# hypothesis 6.170.15

**Summary:** The property-based testing library for Python

**Install:** `pip install hypothesis`

**Python:** >=3.11

## Distribution artifacts

- hypothesis-6.170.15-cp311-abi3-macosx_10_12_x86_64.whl (0.8 MB)
- hypothesis-6.170.15-cp311-abi3-macosx_11_0_arm64.whl (0.8 MB)
- hypothesis-6.170.15-cp311-abi3-manylinux1_i686.manylinux_2_5_i686.whl (1.1 MB)
- hypothesis-6.170.15-cp311-abi3-manylinux2014_aarch64.manylinux_2_17_aarch64.whl (1.1 MB)
- hypothesis-6.170.15-cp311-abi3-manylinux2014_armv7l.manylinux_2_17_armv7l.whl (1.1 MB)
- hypothesis-6.170.15-cp311-abi3-manylinux2014_ppc64le.manylinux_2_17_ppc64le.whl (1.1 MB)
- hypothesis-6.170.15-cp311-abi3-manylinux2014_s390x.manylinux_2_17_s390x.whl (1.1 MB)
- hypothesis-6.170.15-cp311-abi3-manylinux2014_x86_64.manylinux_2_17_x86_64.whl (1.1 MB)
- hypothesis-6.170.15-cp311-abi3-manylinux_2_31_riscv64.whl (1.1 MB)
- hypothesis-6.170.15-cp311-abi3-musllinux_1_2_aarch64.whl (1.2 MB)
- hypothesis-6.170.15-cp311-abi3-musllinux_1_2_armv7l.whl (1.4 MB)
- hypothesis-6.170.15-cp311-abi3-musllinux_1_2_i686.whl (1.3 MB)

## Description

<div align="center">
  <img src="https://raw.githubusercontent.com/HypothesisWorks/hypothesis/master/brand/dragonfly-rainbow.svg" width="300">
</div>

# Hypothesis

* [Website](https://hypothesis.works/)
* [Documentation](https://hypothesis.readthedocs.io/en/latest/)
* [Source code](https://github.com/hypothesisWorks/hypothesis/)
* [Contributing](https://github.com/HypothesisWorks/hypothesis/blob/master/CONTRIBUTING.rst)
* [Community](https://hypothesis.readthedocs.io/en/latest/community.html)

Hypothesis is the property-based testing library for Python. With Hypothesis, you write tests which should pass for all inputs in whatever range you describe, and let Hypothesis randomly choose which of those inputs to check - including edge cases you might not have thought about. For example:

```python
from hypothesis import given, strategies as st


@given(st.lists(st.integers()))
def test_matches_builtin(ls):
    assert sorted(ls) == my_sort(ls)
```

This randomized testing can catch bugs and edge cases that you didn't think of and wouldn't have found. In addition, when Hypothesis does find a bug, it doesn't just report any failing test case — it reports the simplest possible one. This makes property-based tests a powerful tool for debugging, as well as testing.

For instance,

```python
def my_sort(ls):
    return sorted(set(ls))
```

fails with the simplest possible failing test case:

```
Failing test case: test_matches_builtin(ls=[0, 0])
```

### Installation

To install Hypothesis:

```
pip install hypothesis
```

There are also [optional extras available](https://hypothesis.readthedocs.io/en/latest/extras.html).


