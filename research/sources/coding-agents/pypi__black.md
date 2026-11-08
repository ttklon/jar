---
id: "pypi:black"
kind: "pypi"
category: "coding-agents"
package: "black"
version: "26.10.1"
url: "https://pypi.org/project/black/"
requires_python: ">=3.10"
summary: "The uncompromising code formatter."
fetched_at: "2026-11-08T12:19:23Z"
---

# black 26.10.1

**Summary:** The uncompromising code formatter.

**Install:** `pip install black`

**Python:** >=3.10

## Distribution artifacts

- black-26.10.1-cp310-cp310-macosx_10_9_x86_64.whl (2.0 MB)
- black-26.10.1-cp310-cp310-macosx_11_0_arm64.whl (1.9 MB)
- black-26.10.1-cp310-cp310-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl (1.9 MB)
- black-26.10.1-cp310-cp310-win_amd64.whl (1.5 MB)
- black-26.10.1-cp310-cp310-win_arm64.whl (1.4 MB)
- black-26.10.1-cp311-cp311-macosx_10_9_x86_64.whl (2.0 MB)
- black-26.10.1-cp311-cp311-macosx_11_0_arm64.whl (1.9 MB)
- black-26.10.1-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl (1.9 MB)
- black-26.10.1-cp311-cp311-win_amd64.whl (1.5 MB)
- black-26.10.1-cp311-cp311-win_arm64.whl (1.4 MB)
- black-26.10.1-cp312-cp312-macosx_10_13_x86_64.whl (2.1 MB)
- black-26.10.1-cp312-cp312-macosx_11_0_arm64.whl (1.9 MB)

## Description

[![Black Logo](https://raw.githubusercontent.com/psf/black/main/docs/_static/logo2-readme.png)](https://black.readthedocs.io/en/stable/)

<h2 align="center">The Uncompromising Code Formatter</h2>

<p align="center">
<a href="https://github.com/psf/black/actions"><img alt="Actions Status" src="https://github.com/psf/black/workflows/Test/badge.svg"></a>
<a href="https://black.readthedocs.io/en/stable/?badge=stable"><img alt="Documentation Status" src="https://readthedocs.org/projects/black/badge/?version=stable"></a>
<a href="https://coveralls.io/github/psf/black?branch=main"><img alt="Coverage Status" src="https://coveralls.io/repos/github/psf/black/badge.svg?branch=main"></a>
<a href="https://github.com/psf/black/blob/main/LICENSE"><img alt="License: MIT" src="https://black.readthedocs.io/en/latest/_static/license.svg"></a>
<a href="https://pypi.org/project/black/"><img alt="PyPI" src="https://img.shields.io/pypi/v/black"></a>
<a href="https://pypi.org/project/black"><img alt="Supported Python Versions" src="https://img.shields.io/pypi/pyversions/black?color=brightgreen"></a>
<a href="https://pepy.tech/project/black"><img alt="Downloads" src="https://static.pepy.tech/badge/black"></a>
<a href="https://anaconda.org/conda-forge/black/"><img alt="conda-forge" src="https://img.shields.io/conda/dn/conda-forge/black.svg?label=conda-forge"></a>
<a href="https://github.com/psf/black"><img alt="Code style: black" src="https://img.shields.io/badge/code%20style-black-000000.svg"></a>
</p>

> “Any color you like.”

_Black_ is the uncompromising Python code formatter. By using it, you agree to cede
control over minutiae of hand-formatting. In return, _Black_ gives you speed,
determinism, and freedom from `pycodestyle` nagging about formatting. You will save time
and mental energy for more important matters.

Blackened code looks the same regardless of the project you're reading. Formatting
becomes transparent after a while and you can focus on the content instead.

_Black_ makes code review faster by producing the smallest diffs possible.

Watch the [PyCon 2019 talk](https://youtu.be/esZLCuWs_2Y) to learn more.

---

**[Read the documentation on ReadTheDocs!](https://black.readthedocs.io/en/stable)**

---

## Installation and usage

### Installation

_Black_ can be installed by running `pip install black`. It requires Python 3.10+ to
run. If you want to format Jupyter Notebooks, install with
`pip install "black[jupyter]"`.

If you want to run _Black_ without installing Python, download one of the
PyInstaller-built standalone executables from the
[latest GitHub release](https://github.com/psf/black/releases/latest).

### Usage

To get started right away with sensible defaults:

```sh
black {source_file_or_directory}
```

You can run _Black_ as a package if running it as a script doesn't work:

```sh
python -m black {source_file_or_directory}
```

Further information can be found in our docs:

- [Usage and Configuration](https://black.readthedocs.io/en/stable/usage_and_configuration/index.html)

_Black_ is already [successfully used](https://github.com/psf/black#used-by) by many
projects, small and big. _Black_ has a comprehensive test suite, with efficient parallel
tests, and our own auto formatting and parallel Continuous Integration runner. Now that
we have become stable, you should not expect large formatting changes in the future.
Stylistic changes will mostly be responses to bug reports and support for new Python
syntax. For more information please refer to
[The Black Code Style](https://black.readthedocs.io/en/stable/the_black_code_style/index.html).

Also, as a safety measure which slows down processing, _Black_ will check that the
reformatted code still produces a valid AST that is effectively equivalent to the
original (see the
[Pragmatism](https://black.readthedocs.io/en/stable/the_black_code_style/current_style.html#ast-before-and-after-formatting)
section for details). If you're feeling confident, use `--fast`.

## The _Black_ code style

_Black_ is a PEP 8 compliant opinionated formatter. _Black_ reformats entire files in
place. Style configuration options are deliberately limited and rarely added. It doesn't
take previous formatting into account (see
[Pragmatism](https://black.readthedocs.io/en/stable/the_black_code_style/current_style.html#pragmatism)
for exceptions).

Our documentation covers the current _Black_ code style, but planned changes to it are
also documented. They're both worth taking a look at:

- [The _Black_ Code Style: Current style](https://black.readthedocs.io/en/stable/the_black_code_style/current_style.html)
- [The _Black_ Code Style: Future style](https://black.readthedocs.io/en/stable/the_black_code_style/future_style.html)

Changes to the _Black_ code style are bound by the Stability Policy:

- [The _Black_ Code Style: Stability Policy](https://black.readthedocs.io/en/stable/the_black_code_style/index.html#stability-policy)

Please refer to this document before submitting an issue. What seems like a bug might be
intended behaviour.

### Pragmatism

Early versions of _Black_ used to be absolutist in some respects. They took after its
initial author. This was fine at the time as it made the implementation simpler and
there were not many users anyway. Not many edge cases were reported. As a mature tool,
_Black_ does make some exceptions to rules it otherwise holds.

- [The _Black_ code style: Pragmatism](https://black.readthedocs.io/en/stable/the_black_code_style/current_style.html#pragmatism)

Please refer to this document before submitting an issue just like with the document
above. What seems like a bug might be intended behaviour.

## Configuration

_Black_ is able to read project-specific default values for its command line options
from a `pyproject.toml` file. This is especially useful for specifying custom
`--include` and `--exclude`/`--force-exclude`/`--extend-exclude` patterns for your
project.

You can find more details in our documentation:

- [The basics: Configuration via a file](https://black.readthedocs.io/en/stable/usage_and_configuration/the_basics.html#configuration-via-a-file)

And if you're looking for more general configuration documentation:

- [Usage and Configuration](https://black.readthedocs.io/en/stable/usage_and_configuration/index.html)

**Pro-tip**: If you're asking yourself "Do I need to configure anything?" the answer is
"No". _Black_ is all about sensible defaults. Applying those defaults will have your
code in compliance with many other _Black_ formatted projects.

## Used by

The following notable open-source projects trust _Black_ with enforcing a consistent
code style: pytest, tox, Pyramid, Django, Django Channels, Hypothesis, attrs,
SQLAlchemy, Poetry, PyPA applications (Warehouse, Bandersnatch, Pipenv, virtualenv),
pandas, Pillow, Twisted, LocalStack, every Datadog Agent Integration, Home Assistant,
Zulip, Kedro, OpenOA, FLORIS, ORBIT, WOMBAT, and many more.

The following organizations use _Black_: Dropbox, KeepTruckin, Lyft, Mozilla, Quora,
Duolingo, QuantumBlack, Tesla, Archer Aviation.

Are we missing anyone? Let us know.

## Testimonials

**Mike Bayer**, creator of [`SQLAlchemy`](https://www.sqlalchemy.org/):

> I can't think of any single tool in my entire programming career that has given me a
> bigger productivity increase by its introduction. I can now do refactorings in about
> 1% of the keystrokes that it would have taken me previously when we had no way for
> code to format itself.

**Dusty Phillips**,
[writer](https://www.amazon.com/stores/Dusty-Phillips/author/B00HSYG5BO):

> _Black_ is opinionated so you don't have to be.

**Hynek Schlawack**, creator of [`attrs`](https://www.attrs.org/), core developer of
Twisted and CPython:

> An auto-formatter that doesn't suck is all I want for Xmas!

**Carl Meyer**, [Django](https://www.djangoproject.com/) core developer:

> At least the name is good.

**Kenneth Reitz**, creator of [`requests`](https://requests.readthedocs.io/en/stable/)
and [pipenv](https://pipenv.pypa.io/en/stable/):

> This vastly improves the formatting of our code. Thanks a ton!

## Show your style

Use the badge in your project's README.md:

```md
[![Code style: black](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black)
```

Using the badge in README.rst:

```rst
.. image:: https://img.shields.io/badge/code%20style-black-000000.svg
    :target: https://github.com/psf/black
```

Looks like this:
[![Code style: black](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black)

## License

MIT

## Contributing

Welcome! Happy to see you willing to make the project better. You can get started by
reading this:

- [Contributing: The basics](https://black.readthedocs.io/en/latest/contributing/the_basics.html)

You can also take a look at the rest of the contributing docs or talk with the
developers:

- [Contributing documentation](https://black.readthedocs.io/en/latest/contributing/index.html)
- [Chat on Discord](https://discord.gg/RtVdv86PrH)

## Change log

The log has become rather long. It moved to its own file.

See [CHANGES](https://black.readthedocs.io/en/latest/change_log.html).

## Authors

The author list is quite long nowadays, so it lives in its own file.

See [AUTHORS.md](./AUTHORS.md)

## Code of Conduct

Everyone participating in the _Black_ project, and in particular in the issue tracker,
pull requests, and social media activity, is expected to treat other people with respect
and more generally to follow the guidelines articulated in the
[Python Community Code of Conduct](https://www.python.org/psf/codeofconduct/).

At the same time, humor is encouraged. In fact, basic familiarity with Monty Python's
Flying Circus is expected. We are not savages.

And if you _really_ need to slap somebody, do it with a fish while dancing.
# Change Log

## Version 26.10.1

### Highlights

This release fixes a security issue in Black's bundled GitHub Action. Repositories that
use the action are encouraged to update to the latest version of Black immediately. This
update is received automatically when using `psf/black@stable`, and is independent of
the version of Black installed by the action.

When the GitHub Action reads version specifiers from `tool.black.required-version`, it
now only accepts released versions of Black, as it already did for `black` requirements
in dependency lists. Other values, such as URL references, are now rejected. This issue
has been registered as `GHSA-cg8m-r9f2-5wm2`; a CVE identifier is pending.

### Stable style

- Fix a long Jupyter notebook assignment magic (for example `x = !ls -la`) being wrapped
  in parentheses, which IPython can no longer run; such cells are now left unchanged
  (#5481)
- Keep repeated lines outside the selected `--line-ranges` unchanged (#5436)
- Fix `--line-ranges` formatting lines that follow a statement when formatting joins or
  re-indents that statement (#5484)
- Fix `--line-ranges` crashing with an internal error when an unselected statement has a
  `# fmt: skip` comment on the last line before a closing bracket (#5477)
- Prevent moving an encoding declaration (for example `# -*- coding: latin-1 -*-`) onto
  the first two lines of a file (#5487)
- Fix adding an extra trailing blank line inside a multi-line module docstring when its
  last line is near the line length limit (#5494)

### Preview style

- Do not split short expressions on delimiters (such as binary operators, comparisons,
  or comprehensions) inside brackets when preceded by a standalone comment (#5455)
- Fix the unstable `string_processing` feature removing backslash-newline sequences from
  raw strings, which changed their value (#5482)
- Avoid adding unnecessary parentheses around unbreakable right-hand side expressions in
  assignments (such as annotated assignments or subscript targets) (#5473)
- Parenthesize expressions with parameter comments when they exceed the line length
  under `--preview` (#5442)
- Fix `wrap_long_dict_values_in_parens` dropping the parentheses around a right-hand
  side that contains a dictionary, leaving a line over the length limit (#5492)
- Fix the unstable `string_processing` feature adding a space after `*` or `**` in a PEP
  695 type parameter (`* Ts = ...`) when it splits a string in the parameter's default
  (#5504)
- Avoid unnecessary line splits of trailers (such as indexing/subscripts) when an
  earlier bracket split exceeds the line length only due to a trailing comment (#5498)

### Configuration

- Add `--cache-dir` to configure the cache directory from the command line (#5433)
- Don't cache a file as formatted after formatting or checking it with `--line-ranges`,
  which made a later full `black --check` pass and `black` skip the unformatted lines
  (#5476)
- Respect a `.gitignore` that starts with a UTF-8 byte order mark. The mark became part
  of the first pattern, so that pattern never matched and Black formatted files that git
  ignores (#5497)

### Performance

- Avoid quadratic runtime when splitting very long lines with many trailing bracket
  pairs (such as consecutive subscripts) (#5475)

### Integrations

- Fix the GitHub Action crashing on dependency-group includes when `use_pyproject` is
  enabled (#5479)
- When the GitHub Action reads version specifiers from `tool.black.required-version`, it
  now only accepts released versions of Black, as it already did for `black`
  requirements in dependency lists. Other values, such as URL references, are now
  rejected. (#5510)

## Version 26.10.0

### Stable style

- `--line-ranges` no longer inserts an empty line after a docstring when the range
  covers only the docstring itself (#5312)
- Fix `# fmt: skip` on a bracketed ternary turning the surrounding tuple into a call
  (#5464)
- Fix crash when `# fmt: skip` is placed on a one-line function or class with PEP 695
  type parameters (#5429)
- Fix an inline comment after the closing bracket of optional parentheses being moved
  inside the parentheses when the parenthesized expression contains own-line comments
  (#5395)
- Fix unparseable output when `# fmt: skip` is placed on a bracket of an `if`, `while`,
  `for`, or `with` header (#5401, #5405)
- Fix crash when formatting parenthesized expressions with multiple inline comments and
  `# fmt: skip` (#5414)
- Fix parsing Jupyter notebook assignment magics when non-ASCII characters appear
  earlier on the line (#5381)
- Preserve blank lines that come immediately before a `# fmt: on` comment (#5300)
- Keep the parentheses around the target of an annotated assignment (e.g.
  `(x): int = 5`), which prevent CPython from including the name in `__annotations__`
  (#5321)
- Stop treating a t-string in docstring position as a docstring (e.g. `t"  spam  "` as
  the first statement of a module, class or function) (#5287)
- Fix unparseable output for a t-string whose replacement field contains a quote (e.g.
  `t'\'{a["b"]}\''`) (#5265)
- Fix unparseable output for a triple-quoted string whose body ends in an
  already-escaped double quote (e.g. `'''\'''\"'''`) (#5262)
- Fix `--skip-magic-trailing-comma` dropping the trailing comma from a split
  single-element tuple used as a lambda parameter default (#5246)
- Fix unstable formatting when an inline comment sits on optional parentheses (e.g. a
  parenthesized assert message) (#5241)
- Fix `--skip-magic-trailing-comma` dropping the trailing comma of a one-element
  subscript (`a[x,]`) when the line is long enough to be split and contains a power
  operator (#5272)
- Fix crash when a standalone comment sits between tokens of a comprehension or lambda
  (#5144)
- Fix inline comments on a bracket inside a comprehension being dropped (#5330)
- Respect the magic trailing comma in a PEP 695 type parameter list containing a
  `*TypeVarTuple` or `**ParamSpec` (#5244)
- Fix crash when a comment-only `# fmt: off`/`# fmt: on` block is followed by a `with`
  statement after another standalone comment (#5189)
- Fix a crash when splitting `case case if ...` match patterns at very small line
  lengths (#5147)
- Fix multiline docstring indentation when leading tabs are used inside indented
  docstrings (#5148)
- Respect `# fmt: skip` on a line that opens a bracket (e.g.
  `from x import (  # fmt: skip`) when a standalone comment is among the bracket's
  contents (#5161)
- Fix an AST safety error when separate `# type: ignore` comments in a parenthesized
  attribute chain were merged onto one physical line (#5297)
- Preserve comments and blank lines outside requested ranges when formatting with
  `--line-ranges` (#5175)
- Fix crash when `# fmt: skip` is used on one-line `async def`, `async with`, and
  `async for` statements containing a semicolon (#5311)
- Stop converting form feeds or other similar characters in docstrings into newlines
  (#5461)
- Fix `--skip-source-first-line` turning the skipped line's CRLF ending into `\r\r\n`
  when reformatting a file with CRLF line endings (#5438)

### Preview style

#### New preview features

- Add missing blank lines after classes whose last method has an ellipsis body (#5439)
- Split only the brackets holding a magic trailing comma when more trailers follow them
  (e.g. stop splitting inside the `[2]` of `[1,][2](3)`) (#5448)
- Keep dictionary keys containing operators together on one line when the value can be
  wrapped onto a new line instead (#5435)
- Remove redundant parentheses around individual variables in unpacking targets (e.g.
  `for (x), (y) in points:` becomes `for x, y in points:`) (#5416)
- Normalize uppercase `T` prefixes on t-strings to lowercase (#5425)
- Remove redundant parentheses around generator expressions (#5304, #5369)
- Preserve two blank lines before a top-level class starting inside a `# fmt: off` block
  after an import (#5238)
- Fix unnecessary parentheses around short right-hand expressions in indexed assignments
  (e.g. `x[key] = expr`) (#5095)
- Parenthesize tuple expressions in `yield` statements for consistency with function
  calls and returns (#5170)
- Stop splitting between a variable and its operator (`not in`, `==`, `is`, ...) when
  the right-hand side is a bracketed expression, and instead split inside the brackets
  (#5135)
- In `.pyi` stub files, enforce a blank line after a function or method that has a
  docstring-only body when another comment or statement follows it (#5158)

#### Updates to existing preview features

- Fix crash in stub files when `# fmt: skip` is placed on a function in a group of
  same-name decorated functions (e.g. `@overload`s or a property setter) (#5430)
- Keep the parentheses around a lambda used as the iterable of a comprehension (e.g.
  `[x for x in (lambda: 0) if x]`) (#5176, #5200)

#### Updates to existing unstable features

- Do not treat multi-line expressions with merged strings and trailing `# type: ignore`
  comments as single-line unsplittable expressions (#5466)
- Fix duplicated inline comment when stripping the parentheses around a string or
  merging a backslash-continued string on the same line (#5449)
- Split long stringified return annotations even when the function has parameters
  (#5427)
- Don't hug brackets when doing so would join two `# type: ignore` comments onto one
  line (#5271)
- Fix a crash when `# type: ignore` is lost during formatting of a long parenthesized
  string (#5329)
- Fix only the first part of an implicitly concatenated unmergeable string (e.g.
  `r"..." r"..."`) being wrapped in parentheses (#5434)

### Configuration

- Add support for `NO_COLOR` environment variable to disable ANSI output (#5129)
- Remove spurious target version warning when runtime version is included in a
  `--target-version` flag (#5167)
- Fix `--force-exclude` not excluding files whose path contains `..` (e.g.
  `black ../generated/file.py` run from a subdirectory) (#5471)
- Fall back to the default configuration, with a warning, when the given sources share
  no common project root (e.g. they are on different drives on Windows) instead of
  crashing (#5386)
- Fix loading a stale cached `pyproject.toml` path when `--code` is used from different
  working directories in the same process (#5152)
- Add validation for `--line-ranges` values (#5107)
- Ignore empty cache files instead of raising an `EOFError` (#5192)
- Reject non-string `include` and `force-exclude` values in `pyproject.toml` (#5193)
- Validate `BLACK_NUM_WORKERS` values and report invalid values as usage errors instead
  of crashing (#5211)
- Ignore permission errors when reading cache (#5258)

### Packaging

- Reduce the size of Linux standalone binaries by stripping debug symbols during the
  PyInstaller release build (#5223)
- Black is now released using GitHub
  [Immutable Releases](https://docs.github.com/code-security/concepts/supply-chain-security/immutable-releases)
  (#5296)

### Performance

- Fix superlinear runtime growth with the number of input files (#5450)
- Improve performance on strings containing many consecutive backslashes (#5163)
- Improve performance on files with many `# fmt: skip`/`# fmt: off`/`# fmt: on` comments
  (#5169, #5190, #5232)
- Improve performance on long calls and collections (#5177)
- Improve performance on multiline strings inside large collections (e.g. a dict literal
  with triple-quoted strings as values) (#5188)
- Improve performance on files with many soft keywords (e.g. `match`/`case` blocks)
  (#5186)
- Improve performance on long semicolon-separated statements (in the stable style) and
  large dict literals (in `--preview`) (#5184)
- Improve performance of `--line-ranges` on files with many sibling blocks (a long
  `if`/`elif` chain, a `match` with many cases, or many top-level definitions) (#5213)
- Improve performance on deeply nested bracketed expressions (#5171, #5242)
- Improve performance on lists and subscripts holding one long expression without
  operators (e.g. a long run of implicitly concatenated strings inside `[]`) (#5239)
- Improve performance on deeply chained operations (e.g. a long `a ** b ** c ** ...`
  chain) (#5235)
- Improve performance on long `if`/`elif` chains and other compound statements with many
  clauses (#5322)
- Improve performance of `string_processing`:
  - when merging implicitly concatenated f-strings containing long string literals
    (#5165)
  - when merging long implicitly concatenated strings (#5173, #5194)
  - when rewriting large nodes (e.g. `"%s ..." % (a, b, c, ...)`) (#5178, #5199, #5220)
  - when splitting long string literals (#5183)

### Output

- Report parser failures using editor-friendly `path:line:column` locations (#5237)
- Fix crash when writing formatted code or diffs to a `sys.stdout` that has no `buffer`
  attribute (e.g. in Jupyter notebooks) (#5411)
- Report parse failures on Black's own output as internal errors (#5383)

### _Blackd_

- Return HTTP 400 instead of 500 when the `X-Python-Variant` header is empty or has an
  empty entry (e.g. a trailing comma) (#5428)
- Allow optional whitespace around comma-separated versions and `pyi` in the
  `X-Python-Variant` header (#5441)

### Integrations

- Remove unused `migrate-black` script (#5319)
- Support PEP 440 version specifiers in `tool.black.required-version` for the GitHub
  Action (#5399)
- Add outputs (`is_formatted`, `change_count`, `same_count`, `failure_count`) to GitHub
  Action runs (#5408)

### Documentation

- Document `vim-python-pep8-indent`, which provides an `indentexpr` for Black-style
  insert-mode indentation (#5288)

## Version 26.5.1

### Stable style

- Fix unstable formatting of annotated assignments whose subscript annotation contains
  an inline comment (e.g. `x: list[  # pyright: ignore[...]`) (#5130)
- Preserve inline comments (including `# type: ignore`) immediately before a
  `# fmt: skip` line, avoiding AST equivalence failures (#5139)

### Packaging

- Correct the version in the published executables (#5137)

### Documentation

- Add Neovim integration guide covering conform.nvim, ALE, and simple command approaches
  (#5124)

## Version 26.5.0

### Highlights

- Add support for unpacking in comprehensions (PEP 798) and for lazy imports (PEP 810),
  both new syntactic features in Python 3.15 (#5048)
- Python 3.15 is now supported. Compiled wheels are not yet provided for Python 3.15, so
  performance may be slower than on existing Python versions. Wheels will be provided
  once Python 3.15 is later in its release cycle. (#5127)

### Stable style

- Fix `# fmt: skip` being ignored in nested `if` expressions with parenthesized `in`
  clauses (#4903)
- Add syntactic support for Python 3.15 (#5048)
- Fix crash when an f-string follows a `# fmt: off` comment inside brackets (#5097)
- Preserve multiline compound statement headers when `# fmt: skip` is placed on the
  colon line (#5117)

### Preview style

- Improve heuristics around whether blank lines should appear before, within and after
  groups of same-name decorated functions (such as `@overload` groups) in `.pyi` stub
  files (#5021)
- Fix blank lines being removed between a function and a decorated class in `.pyi` stub
  files (#5092)
- Prevent string merger from creating unsplittable long lines when a pragma comment
  (e.g. `# type: ignore`) follows the closing bracket (#5096)

### Packaging

- Run CI on 3.15 (#5127)

### Output

- Improve parse error readability by showing multi-line output with an error pointer.
  (#5068)
- Add `SourceASTParseError` to distinguish source parse failures from internal safety
  errors, improving error reporting when Black's lenient parser accepts input that
  `ast.parse()` rejects (#5080)

### _Blackd_

- Return HTTP 400 (Bad Request) for source parse failures instead of HTTP 500, keeping
  HTTP 500 only for genuine internal safety errors (#5080)

### Integrations

- Added documentation for doctest formatting tools and updated the integrations index to
  match (#4916)

### Documentation

- Use "Version X.Y.Z" headings in changelog for stable permalink anchors on ReadTheDocs
  (#5063)
- Note in the editor integrations that the SublimeText `sublack` plugin is archived and
  unmaintained (#5082)

## Version 26.3.1

### Stable style

- Prevent Jupyter notebook magic masking collisions from corrupting cells by using
  exact-length placeholders for short magics and aborting if a placeholder can no longer
  be unmasked safely (#5038)

### Configuration

- Always hash cache filename components derived from `--python-cell-magics` so custom
  magic names cannot affect cache paths (#5038)

### _Blackd_

- Disable browser-originated requests by default, add configurable origin allowlisting
  and request body limits, and bound executor submissions to improve backpressure
  (#5039)

## Version 26.3.0

### Stable style

- Don't double-decode input, causing non-UTF-8 files to be corrupted (#4964)
- Fix crash on standalone comment in lambda default arguments (#4993)
- Preserve parentheses when `# type: ignore` comments would be merged with other
  comments on the same line, preventing AST equivalence failures (#4888)

### Preview style

- Fix bug where `if` guards in `case` blocks were incorrectly split when the pattern had
  a trailing comma (#4884)
- Fix `string_processing` crashing on unassigned long string literals with trailing
  commas (one-item tuples) (#4929)
- Simplify implementation of the power operator "hugging" logic (#4918)

### Packaging

- Fix shutdown errors in PyInstaller builds on macOS by disabling multiprocessing in
  frozen environments (#4930)

### Performance

- Introduce winloop for windows as an alternative to uvloop (#4996)
- Remove deprecated function `uvloop.install()` in favor of `uvloop.new_event_loop()`
  (#4996)
- Rename `maybe_install_uvloop` function to `maybe_use_uvloop` to simplify loop
  installation and creation of either a uvloop/winloop eventloop or default eventloop
  (#4996)

### Output

- Emit a clear warning when the target Python version is newer than the running Python
  version, since AST safety checks cannot parse newer syntax. Also replace the
  misleading "INTERNAL ERROR" message with an actionable error explaining the version
  mismatch (#4983)

### _Blackd_

- Introduce winloop to be used when windows in use which enables blackd to run faster on
  windows when winloop is installed. (#4996)

### Integrations

- Remove unused gallery script (#5030)
- Harden parsing of `black` requirements in the GitHub Action when `use_pyproject` is
  enabled so that only version specifiers are accepted and direct references such as
  `black @ https://...` are rejected. Users should upgrade to the latest version of the
  action as soon as possible. This update is received automatically when using
  `psf/black@stable`, and is independent of the version of Black installed by the
  action. (#5031)

### Documentation

- Expand preview style documentation with detailed examples for `wrap_comprehension_in`,
  `simplify_power_operator_hugging`, and `wrap_long_dict_values_in_parens` features
  (#4987)
- Add detailed documentation for formatting Jupyter Notebooks (#5009)

## Version 26.1.0

### Highlights

Introduces the 2026 stable style (#4892), stabilizing the following changes:

- `always_one_newline_after_import`: Always force one blank line after import
  statements, except when the line after the import is a comment or an import statement
  (#4489)
- `fix_fmt_skip_in_one_liners`: Fix `# fmt: skip` behavior on one-liner declarations,
  such as `def foo(): return "mock" # fmt: skip`, where previously the declaration would
  have been incorrectly collapsed (#4800)
- `fix_module_docstring_detection`: Fix module docstrings being treated as normal
  strings if preceded by comments (#4764)
- `fix_type_expansion_split`: Fix type expansions split in generic functions (#4777)
- `multiline_string_handling`: Make expressions involving multiline strings more compact
  (#1879)
- `normalize_cr_newlines`: Add `\r` style newlines to the potential newlines to
  normalize file newlines both from and to (#4710)
- `remove_parens_around_except_types`: Remove parentheses around multiple exception
  types in `except` and `except*` without `as` (#4720)
- `remove_parens_from_assignment_lhs`: Remove unnecessary parentheses from the left-hand
  side of assignments while preserving magic trailing commas and intentional multiline
  formatting (#4865)
- `standardize_type_comments`: Format type comments which have zero or more spaces
  between `#` and `type:` or between `type:` and value to `# type: (value)` (#4645)

The following change was not in any previous stable release:

- Regenerated the `_width_table.py` and added tests for the Khmer language (#4253)

This release also bumps `pathspec` to v1 and fixes inconsistencies with Git's
`.gitignore` logic (#4958). Now, files will be ignored if a pattern matches them, even
if the parent directory is directly unignored. For example, Black would previously
format `exclude/not_this/foo.py` with this `.gitignore`:

```
exclude/
!exclude/not_this/
```

Now, `exclude/not_this/foo.py` will remain ignored. To ensure `exclude/not_this/` and
all of its children are included in formatting (and in Git), use this `.gitignore`:

```
*/exclude/*
!*/exclude/not_this/
```

This new behavior matches Git. The leading `*/` are only necessary if you wish to ignore
matching subdirectories (like the previous behavior did), and not just matching root
directories.

### Output

- Explicitly shutdown the multiprocessing manager when run in diff mode too (#4952)

### Integrations

- Upgraded PyPI upload workflow to use Trusted Publishing (#4611)

## Version 25.12.0

### Highlights

- Black no longer supports running with Python 3.9 (#4842)

### Stable style

- Fix bug where comments preceding `# fmt: off`/`# fmt: on` blocks were incorrectly
  removed, particularly affecting Jupytext's `# %% [markdown]` comments (#4845)
- Fix crash when multiple `# fmt: skip` comments are used in a multi-part if-clause, on
  string literals, or on dictionary entries with long lines (#4872)
- Fix possible crash when `fmt: ` directives aren't on the top level (#4856)

### Preview style

- Fix `fmt: skip` skipping the line after instead of the line it's on (#4855)
- Remove unnecessary parentheses from the left-hand side of assignments while preserving
  magic trailing commas and intentional multiline formatting (#4865)
- Fix `fix_fmt_skip_in_one_liners` crashing on `with` statements (#4853)
- Fix `fix_fmt_skip_in_one_liners` crashing on annotated parameters (#4854)
- Fix new lines being added after imports with `# fmt: skip` on them (#4894)

### Packaging

- Releases now include arm64 Windows binaries and wheels (#4814)

### Integrations

- Add `output-file` input to GitHub Action `psf/black` to write formatter output to a
  file for artifact capture and log cleanliness (#4824)

## Version 25.11.0

### Highlights

- Enable base 3.14 support (#4804)
- Add support for the new Python 3.14 t-string syntax introduced by PEP 750 (#4805)

### Stable style

- Fix bug where comments between `# fmt: off` and `# fmt: on` were reformatted (#4811)
- Comments containing fmt directives now preserve their exact formatting instead of
  being normalized (#4811)

### Preview style

- Move `multiline_string_handling` from `--unstable` to `--preview` (#4760)
- Fix bug where module docstrings would be treated as normal strings if preceded by
  comments (#4764)
- Fix bug where python 3.12 generics syntax split line happens weirdly (#4777)
- Standardize type comments to form `# type: <value>` (#4645)
- Fix `fix_fmt_skip_in_one_liners` preview feature to respect `# fmt: skip` for compound
  statements with semicolon-separated bodies (#4800)

### Configuration

- Add `no_cache` option to control caching behavior. (#4803)

### Packaging

- Releases now include arm64 Linux binaries (#4773)

### Output

- Write unchanged content to stdout when excluding formatting from stdin using pipes
  (#4610)

### _Blackd_

- Implemented BlackDClient. This simple python client allows to easily send formatting
  requests to blackd (#4774)

### Integrations

- Enable 3.14 base CI (#4804)
- Enhance GitHub Action `psf/black` to support the `required-version` major-version-only
  "stability" format when using pyproject.toml (#4770)
- Improve error message for vim plugin users. It now handles independently vim version
- Vim: Warn on unsupported Vim and Python versions independently (#4772)
- Vim: Print the import paths when importing black fails (#4675)
- Vim: Fix handling of virtualenvs that have a different Python version (#4675)

## Version 25.9.0

### Highlights

- Remove support for pre-python 3.7 `await/async` as soft keywords/variable names
  (#4676)

### Stable style

- Fix crash while formatting a long `del` statement containing tuples (#4628)
- Fix crash while formatting expressions using the walrus operator in complex `with`
  statements (#4630)
- Handle `# fmt: skip` followed by a comment at the end of file (#4635)
- Fix crash when a tuple appears in the `as` clause of a `with` statement (#4634)
- Fix crash when tuple is used as a context manager inside a `with` statement (#4646)
- Fix crash when formatting a `\` followed by a `\r` followed by a comment (#4663)
- Fix crash on a `\\r\n` (#4673)
- Fix crash on `await ...` (where `...` is a literal `Ellipsis`) (#4676)
- Fix crash on parenthesized expression inside a type parameter bound (#4684)
- Fix crash when using line ranges excluding indented single line decorated items
  (#4670)

### Preview style

- Fix a bug where one-liner functions/conditionals marked with `# fmt: skip` would still
  be formatted (#4552)
- Improve `multiline_string_handling` with ternaries and dictionaries (#4657)
- Fix a bug where `string_processing` would not split f-strings directly after
  expressions (#4680)
- Wrap the `in` clause of comprehensions across lines if necessary (#4699)
- Remove parentheses around multiple exception types in `except` and `except*` without
  `as`. (#4720)
- Add `\r` style newlines to the potential newlines to normalize file newlines both from
  and to (#4710)

### Parser

- Rewrite tokenizer to improve performance and compliance (#4536)
- Fix bug where certain unusual expressions (e.g., lambdas) were not accepted in type
  parameter bounds and defaults. (#4602)

### Performance

- Avoid using an extra process when running with only one worker (#4734)

### Integrations

- Fix the version check in the vim file to reject Python 3.8 (#4567)
- Enhance GitHub Action `psf/black` to read Black version from an additional section in
  pyproject.toml: `[project.dependency-groups]` (#4606)
- Build gallery docker image with python3-slim and reduce image size (#4686)

### Documentation

- Add FAQ entry for windows emoji not displaying (#4714)

## Version 25.1.0

### Highlights

This release introduces the new 2025 stable style (#4558), stabilizing the following
changes:

- Normalize casing of Unicode escape characters in strings to lowercase (#2916)
- Fix inconsistencies in whether certain strings are detected as docstrings (#4095)
- Consistently add trailing commas to typed function parameters (#4164)
- Remove redundant parentheses in if guards for case blocks (#4214)
- Add parentheses to if clauses in case blocks when the line is too long (#4269)
- Whitespace before `# fmt: skip` comments is no longer normalized (#4146)
- Fix line length computation for certain expressions that involve the power operator
  (#4154)
- Check if there is a newline before the terminating quotes of a docstring (#4185)
- Fix type annotation spacing between `*` and more complex type variable tuple (#4440)

The following changes were not in any previous release:

- Remove parentheses around sole list items (#4312)
- Generic function definitions are now formatted more elegantly: parameters are split
  over multiple lines first instead of type parameter definitions (#4553)

### Stable style

- Fix formatting cells in IPython notebooks with magic methods and starting or trailing
  empty lines (#4484)
- Fix crash when formatting `with` statements containing tuple generators/unpacking
  (#4538)

### Preview style

- Fix/remove string merging changing f-string quotes on f-strings with internal quotes
  (#4498)
- Collapse multiple empty lines after an import into one (#4489)
- Prevent `string_processing` and `wrap_long_dict_values_in_parens` from removing
  parentheses around long dictionary values (#4377)
- Move `wrap_long_dict_values_in_parens` from the unstable to preview style (#4561)

### Packaging

- Store license identifier inside the `License-Expression` metadata field, see
  [PEP 639](https://peps.python.org/pep-0639/). (#4479)

### Performance

- Speed up the `is_fstring_start` function in Black's tokenizer (#4541)

### Integrations

- If using stdin with `--stdin-filename` set to a force excluded path, stdin won't be
  formatted. (#4539)

## Version 24.10.0

### Highlights

- Black is now officially tested with Python 3.13 and provides Python 3.13
  mypyc-compiled wheels. (#4436) (#4449)
- Black will issue an error when used with Python 3.12.5, due to an upstream memory
  safety issue in Python 3.12.5 that can cause Black's AST safety checks to fail. Please
  use Python 3.12.6 or Python 3.12.4 instead. (#4447)
- Black no longer supports running with Python 3.8 (#4452)

### Stable style

- Fix crashes involving comments in parenthesised return types or `X | Y` style unions.
  (#4453)
- Fix skipping Jupyter cells with unknown `%%` magic (#4462)

### Preview style

- Fix type annotation spacing between * and more complex type variable tuple (i.e.
  `def fn(*args: *tuple[*Ts, T]) -> None: pass`) (#4440)

### Caching

- Fix bug where the cache was shared between runs with and without `--unstable` (#4466)

### Packaging

- Upgrade version of mypyc used to 1.12 beta (#4450) (#4449)
- `blackd` now requires a newer version of aiohttp. (#4451)

### Output

- Added Python target version information on parse error (#4378)
- Add information about Black version to internal error messages (#4457)

## Version 24.8.0

### Stable style

- Fix crash when `# fmt: off` is used before a closing parenthesis or bracket. (#4363)

### Packaging

- Packaging metadata updated: docs are explicitly linked, the issue tracker is now also
  linked. This improves the PyPI listing for Black. (#4345)

### Parser

- Fix regression where Black failed to parse a multiline f-string containing another
  multiline string (#4339)
- Fix regression where Black failed to parse an escaped single quote inside an f-string
  (#4401)
- Fix bug with Black incorrectly parsing empty lines with a backslash (#4343)
- Fix bugs with Black's tokenizer not handling `\{` inside f-strings very well (#4422)
- Fix incorrect line numbers in the tokenizer for certain tokens within f-strings
  (#4423)

### Performance

- Improve performance when a large directory is listed in `.gitignore` (#4415)

### _Blackd_

- Fix blackd (and all extras installs) for docker container (#4357)

## Version 24.4.2

This is a bugfix release to fix two regressions in the new f-string parser introduced in
24.4.1.

### Parser

- Fix regression where certain complex f-strings failed to parse (#4332)

### Performance

- Fix bad performance on certain complex string literals (#4331)

## Version 24.4.1

### Highlights

- Add support for the new Python 3.12 f-string syntax introduced by PEP 701 (#3822)

### Stable style

- Fix crash involving indented dummy functions containing newlines (#4318)

### Parser

- Add support for type parameter defaults, a new syntactic feature added to Python 3.13
  by PEP 696 (#4327)

### Integrations

- Github Action now works even when `git archive` is skipped (#4313)

## Version 24.4.0

### Stable style

- Fix unwanted crashes caused by AST equivalency check (#4290)

### Preview style

- `if` guards in `case` blocks are now wrapped in parentheses when the line is too long.
  (#4269)
- Stop moving multiline strings to a new line unless inside brackets (#4289)

### Integrations

- Add a new option `use_pyproject` to the GitHub Action `psf/black`. This will read the
  Black version from `pyproject.toml`. (#4294)

## Version 24.3.0

### Highlights

This release is a milestone: it fixes Black's first CVE security vulnerability. If you
run Black on untrusted input, or if you habitually put thousands of leading tab
characters in your docstrings, you are strongly encouraged to upgrade immediately to fix
[CVE-2024-21503](https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2024-21503).

This release also fixes a bug in Black's AST safety check that allowed Black to make
incorrect changes to certain f-strings that are valid in Python 3.12 and higher.

### Stable style

- Don't move comments along with delimiters, which could cause crashes (#4248)
- Strengthen AST safety check to catch more unsafe changes to strings. Previous versions
  of Black would incorrectly format the contents of certain unusual f-strings containing
  nested strings with the same quote type. Now, Black will crash on such strings until
  support for the new f-string syntax is implemented. (#4270)
- Fix a bug where line-ranges exceeding the last code line would not work as expected
  (#4273)

### Performance

- Fix catastrophic performance on docstrings that contain large numbers of leading tab
  characters. This fixes
  [CVE-2024-21503](https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2024-21503).
  (#4278)

### Documentation

- Note what happens when `--check` is used with `--quiet` (#4236)

## Version 24.2.0

### Stable style

- Fixed a bug where comments where mistakenly removed along with redundant parentheses
  (#4218)

### Preview style

- Move the `hug_parens_with_braces_and_square_brackets` feature to the unstable style
  due to an outstanding crash and proposed formatting tweaks (#4198)
- Fixed a bug where base expressions caused inconsistent formatting of \*\* in ternary
  expression (#4154)
- Checking for newline before adding one on docstring that is almost at the line limit
  (#4185)
- Remove redundant parentheses in `case` statement `if` guards (#4214).

### Configuration

- Fix issue where _Black_ would ignore input files in the presence of symlinks (#4222)
- _Black_ now ignores `pyproject.toml` that is missing a `tool.black` section when
  discovering project root and configuration. Since _Black_ continues to use version
  control as an indicator of project root, this is expected to primarily change behavior
  for users in a monorepo setup (desirably). If you wish to preserve previous behavior,
  simply add an empty `[tool.black]` to the previously discovered `pyproject.toml`
  (#4204)

### Output

- Black will swallow any `SyntaxWarning`s or `DeprecationWarning`s produced by the `ast`
  module when performing equivalence checks (#4189)

### Integrations

- Add a JSONSchema and provide a validate-pyproject entry-point (#4181)

## Version 24.1.1

Bugfix release to fix a bug that made Black unusable on certain file systems with strict
limits on path length.

### Preview style

- Consistently add trailing comma on typed parameters (#4164)

### Configuration

- Shorten the length of the name of the cache file to fix crashes on file systems that
  do not support long paths (#4176)

## Version 24.1.0

### Highlights

This release introduces the new 2024 stable style (#4106), stabilizing the following
changes:

- Add parentheses around `if`-`else` expressions (#2278)
- Dummy class and function implementations consisting only of `...` are formatted more
  compactly (#3796)
- If an assignment statement is too long, we now prefer splitting on the right-hand side
  (#3368)
- Hex codes in Unicode escape sequences are now standardized to lowercase (#2916)
- Allow empty first lines at the beginning of most blocks (#3967, #4061)
- Add parentheses around long type annotations (#3899)
- Enforce newline after module docstrings (#3932, #4028)
- Fix incorrect magic trailing comma handling in return types (#3916)
- Remove blank lines before class docstrings (#3692)
- Wrap multiple context managers in parentheses if combined in a single `with` statement
  (#3489)
- Fix bug in line length calculations for power operations (#3942)
- Add trailing commas to collection literals even if there's a comment after the last
  entry (#3393)
- When using `--skip-magic-trailing-comma` or `-C`, trailing commas are stripped from
  subscript expressions with more than 1 element (#3209)
- Add extra blank lines in stubs in a few cases (#3564, #3862)
- Accept raw strings as docstrings (#3947)
- Split long lines in case blocks (#4024)
- Stop removing spaces from walrus operators within subscripts (#3823)
- Fix incorrect formatting of certain async statements (#3609)
- Allow combining `# fmt: skip` with other comments (#3959)

There are already a few improvements in the `--preview` style, which are slated for the
2025 stable style. Try them out and
[share your feedback](https://github.com/psf/black/issues). In the past, the preview
style has included some features that we were not able to stabilize. This year, we're
adding a separate `--unstable` style for features with known problems. Now, the
`--preview` style only includes features that we actually expect to make it into next
year's stable style.

### Stable style

Several bug fixes were made in features that are moved to the stable style in this
release:

- Fix comment handling when parenthesising conditional expressions (#4134)
- Fix bug where spaces were not added around parenthesized walruses in subscripts,
  unlike other binary operators (#4109)
- Remove empty lines before docstrings in async functions (#4132)
- Address a missing case in the change to allow empty lines at the beginning of all
  blocks, except immediately before a docstring (#4130)
- For stubs, fix logic to enforce empty line after nested classes with bodies (#4141)

### Preview style

- Add `--unstable` style, covering preview features that have known problems that would
  block them from going into the stable style. Also add the `--enable-unstable-feature`
  flag; for example, use
  `--enable-unstable-feature hug_parens_with_braces_and_square_brackets` to apply this
  preview feature throughout 2024, even if a later Black release downgrades the feature
  to unstable (#4096)
- Format module docstrings the same as class and function docstrings (#4095)
- Fix crash when using a walrus in a dictionary (#4155)
- Fix unnecessary parentheses when wrapping long dicts (#4135)
- Stop normalizing spaces before `# fmt: skip` comments (#4146)

### Configuration

- Print warning when configuration in `pyproject.toml` contains an invalid key (#4165)
- Fix symlink handling, properly ignoring symlinks that point outside of root (#4161)
- Fix cache mtime logic that resulted in false positive cache hits (#4128)
- Remove the long-deprecated `--experimental-string-processing` flag. This feature can
  currently be enabled with `--preview --enable-unstable-feature string_processing`.
  (#4096)

### Integrations

- Revert the change to run Black's pre-commit integration only on specific git hooks
  (#3940) for better compatibility with older versions of pre-commit (#4137)

## Version 23.12.1

### Packaging

- Fixed a bug that included dependencies from the `d` extra by default (#4108)

## Version 23.12.0

### Highlights

It's almost 2024, which means it's time for a new edition of _Black_'s stable style!
Together with this release, we'll put out an alpha release 24.1a1 showcasing the draft
2024 stable style, which we'll finalize in the January release. Please try it out and
[share your feedback](https://github.com/psf/black/issues/4042).

This release (23.12.0) will still produce the 2023 style. Most but not all of the
changes in `--preview` mode will be in the 2024 stable style.

### Stable style

- Fix bug where `# fmt: off` automatically dedents when used with the `--line-ranges`
  option, even when it is not within the specified line range. (#4084)
- Fix feature detection for parenthesized context managers (#4104)

### Preview style

- Prefer more equal signs before a break when splitting chained assignments (#4010)
- Standalone form feed characters at the module level are no longer removed (#4021)
- Additional cases of immediately nested tuples, lists, and dictionaries are now
  indented less (#4012)
- Allow empty lines at the beginning of all blocks, except immediately before a
  docstring (#4060)
- Fix crash in preview mode when using a short `--line-length` (#4086)
- Keep suites consisting of only an ellipsis on their own lines if they are not
  functions or class definitions (#4066) (#4103)

### Configuration

- `--line-ranges` now skips _Black_'s internal stability check in `--safe` mode. This
  avoids a crash on rare inputs that have many unformatted same-content lines. (#4034)

### Packaging

- Upgrade to mypy 1.7.1 (#4049) (#4069)
- Faster compiled wheels are now available for CPython 3.12 (#4070)

### Integrations

- Enable 3.12 CI (#4035)
- Build docker images in parallel (#4054)
- Build docker images with 3.12 (#4055)

## Version 23.11.0

### Highlights

- Support formatting ranges of lines with the new `--line-ranges` command-line option
  (#4020)

### Stable style

- Fix crash on formatting bytes strings that look like docstrings (#4003)
- Fix crash when whitespace followed a backslash before newline in a docstring (#4008)
- Fix standalone comments inside complex blocks crashing Black (#4016)
- Fix crash on formatting code like `await (a ** b)` (#3994)
- No longer treat leading f-strings as docstrings. This matches Python's behaviour and
  fixes a crash (#4019)

### Preview style

- Multiline dicts and lists that are the sole argument to a function are now indented
  less (#3964)
- Multiline unpacked dicts and lists as the sole argument to a function are now also
  indented less (#3992)
- In f-string debug expressions, quote types that are visible in the final string are
  now preserved (#4005)
- Fix a bug where long `case` blocks were not split into multiple lines. Also enable
  general trailing comma rules on `case` blocks (#4024)
- Keep requiring two empty lines between module-level docstring and first function or
  class definition (#4028)
- Add support for single-line format skip with other comments on the same line (#3959)

### Configuration

- Consistently apply force exclusion logic before resolving symlinks (#4015)
- Fix a bug in the matching of absolute path names in `--include` (#3976)

### Performance

- Fix mypyc builds on arm64 on macOS (#4017)

### Integrations

- Black's pre-commit integration will now run only on git hooks appropriate for a code
  formatter (#3940)

## Version 23.10.1

### Highlights

- Maintenance release to get a fix out for GitHub Action edge case (#3957)

### Preview style

- Fix merging implicit multiline strings that have inline comments (#3956)
- Allow empty first line after block open before a comment or compound statement (#3967)

### Packaging

- Change Dockerfile to hatch + compile black (#3965)

### Integrations

- The summary output for GitHub workflows is now suppressible using the `summary`
  parameter. (#3958)
- Fix the action failing when Black check doesn't pass (#3957)

### Documentation

- It is known Windows documentation CI is broken
  https://github.com/psf/black/issues/3968

## Version 23.10.0

### Stable style

- Fix comments getting removed from inside parenthesized strings (#3909)

### Preview style

- Fix long lines with power operators getting split before the line length (#3942)
- Long type hints are now wrapped in parentheses and properly indented when split across
  multiple lines (#3899)
- Magic trailing commas are now respected in return types. (#3916)
- Require one empty line after module-level docstrings. (#3932)
- Treat raw triple-quoted strings as docstrings (#3947)

### Configuration

- Fix cache versioning logic when `BLACK_CACHE_DIR` is set (#3937)

### Parser

- Fix bug where attributes named `type` were not accepted inside `match` statements
  (#3950)
- Add support for PEP 695 type aliases containing lambdas and other unusual expressions
  (#3949)

### Output

- Black no longer attempts to provide special errors for attempting to format Python 2
  code (#3933)
- Black will more consistently print stacktraces on internal errors in verbose mode
  (#3938)

### Integrations

- The action output displayed in the job summary is now wrapped in Markdown (#3914)

## Version 23.9.1

Due to various issues, the previous release (23.9.0) did not include compiled mypyc
wheels, which make Black significantly faster. These issues have now been fixed, and
this release should come with compiled wheels once again.

There will be no wheels for Python 3.12 due to a bug in mypyc. We will provide 3.12
wheels in a future release as soon as the mypyc bug is fixed.

### Packaging

- Upgrade to mypy 1.5.1 (#3864)

### Performance

- Store raw tuples instead of NamedTuples in Black's cache, improving performance and
  decreasing the size of the cache (#3877)

## Version 23.9.0

### Preview style

- More concise formatting for dummy implementations (#3796)
- In stub files, add a blank line between a statement with a body (e.g an
  `if sys.version_info > (3, x):`) and a function definition on the same level (#3862)
- Fix a bug whereby spaces were removed from walrus operators within subscript(#3823)

### Configuration

- Black now applies exclusion and ignore logic before resolving symlinks (#3846)

### Performance

- Avoid importing `IPython` if notebook cells do not contain magics (#3782)
- Improve caching by comparing file hashes as fallback for mtime and size (#3821)

### _Blackd_

- Fix an issue in `blackd` with single character input (#3558)

### Integrations

- Black now has an
  [official pre-commit mirror](https://github.com/psf/black-pre-commit-mirror). Swapping
  `https://github.com/psf/black` to `https://github.com/psf/black-pre-commit-mirror` in
  your `.pre-commit-config.yaml` will make Black about 2x faster (#3828)
- The `.black.env` folder specified by `ENV_PATH` will now be removed on the completion
  of the GitHub Action (#3759)

## Version 23.7.0

### Highlights

- Runtime support for Python 3.7 has been removed. Formatting 3.7 code will still be
  supported until further notice (#3765)

### Stable style

- Fix a bug where an illegal trailing comma was added to return type annotations using
  PEP 604 unions (#3735)
- Fix several bugs and crashes where comments in stub files were removed or mishandled
  under some circumstances (#3745)
- Fix a crash with multi-line magic comments like `type: ignore` within parentheses
  (#3740)
- Fix error in AST validation when _Black_ removes trailing whitespace in a type comment
  (#3773)

### Preview style

- Implicitly concatenated strings used as function args are no longer wrapped inside
  parentheses (#3640)
- Remove blank lines between a class definition and its docstring (#3692)

### Configuration

- The `--workers` argument to _Black_ can now be specified via the `BLACK_NUM_WORKERS`
  environment variable (#3743)
- `.pytest_cache`, `.ruff_cache` and `.vscode` are now excluded by default (#3691)
- Fix _Black_ not honouring `pyproject.toml` settings when running `--stdin-filename`
  and the `pyproject.toml` found isn't in the current working directory (#3719)
- _Black_ will now error if `exclude` and `extend-exclude` have invalid data types in
  `pyproject.toml`, instead of silently doing the wrong thing (#3764)

### Packaging

- Upgrade mypyc from 0.991 to 1.3 (#3697)
- Remove patching of Click that mitigated errors on Python 3.6 with `LANG=C` (#3768)

### Parser

- Add support for the new PEP 695 syntax in Python 3.12 (#3703)

### Performance

- Speed up _Black_ significantly when the cache is full (#3751)
- Avoid importing `IPython` in a case where we wouldn't need it (#3748)

### Output

- Use aware UTC datetimes internally, avoids deprecation warning on Python 3.12 (#3728)
- Change verbose logging to exactly mirror _Black_'s logic for source discovery (#3749)

### _Blackd_

- The `blackd` argument parser now shows the default values for options in their help
  text (#3712)

### Integrations

- Black is now tested with
  [`PYTHONWARNDEFAULTENCODING = 1`](https://docs.python.org/3/library/io.html#io-encoding-warning)
  (#3763)
- Update GitHub Action to display black output in the job summary (#3688)

### Documentation

- Add a CITATION.cff file to the root of the repository, containing metadata on how to
  cite this software (#3723)
- Update the _classes_ and _exceptions_ documentation in Developer reference to match
  the latest code base (#3755)

## Version 23.3.0

### Highlights

This release fixes a longstanding confusing behavior in Black's GitHub action, where the
version of the action did not determine the version of Black being run (issue #3382). In
addition, there is a small bug fix around imports and a number of improvements to the
preview style.

Please try out the
[preview style](https://black.readthedocs.io/en/stable/the_black_code_style/future_style.html#preview-style)
with `black --preview` and tell us your feedback. All changes in the preview style are
expected to become part of Black's stable style in January 2024.

### Stable style

- Import lines with `# fmt: skip` and `# fmt: off` no longer have an extra blank line
  added when they are right after another import line (#3610)

### Preview style

- Add trailing commas to collection literals even if there's a comment after the last
  entry (#3393)
- `async def`, `async for`, and `async with` statements are now formatted consistently
  compared to their non-async version. (#3609)
- `with` statements that contain two context managers will be consistently wrapped in
  parentheses (#3589)
- Let string splitters respect [East Asian Width](https://www.unicode.org/reports/tr11/)
  (#3445)
- Now long string literals can be split after East Asian co
