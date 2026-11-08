---
id: "pypi:semanticscholar"
kind: "pypi"
category: "academic-writing"
package: "semanticscholar"
version: "0.12.0"
url: "https://pypi.org/project/semanticscholar/"
home_page: "http://danielnsilva.com/semanticscholar"
license: "MIT"
requires_python: ">=3.10"
summary: "Unofficial Python client library for Semantic Scholar APIs."
fetched_at: "2026-11-08T12:31:02Z"
---

# semanticscholar 0.12.0

**Summary:** Unofficial Python client library for Semantic Scholar APIs.

**Install:** `pip install semanticscholar`

**Python:** >=3.10

## Distribution artifacts

- semanticscholar-0.12.0-py3-none-any.whl (0.0 MB)
- semanticscholar-0.12.0.tar.gz (0.0 MB)

## Description

# semanticscholar


Unofficial Python client library for [Semantic Scholar APIs](https://api.semanticscholar.org/).

## Main features

- Simplified access to the Semantic Scholar APIs
- Support for the Academic Graph, Recommendations, and Datasets APIs
- Typed responses
- Streamlined navigation of paginated responses
- Support for asynchronous requests

## Quickstart

### Installation

```console
pip install semanticscholar
```

See the [install](
https://semanticscholar.readthedocs.io/en/latest/install.html) page for more detailed installation instructions.

### Usage

```python
# First, import the client from semanticscholar module
from semanticscholar import SemanticScholar

# You'll need an instance of the client to request data from the API
sch = SemanticScholar()

# Get a paper by its ID
paper = sch.get_paper('10.1093/mind/lix.236.433')

# Print the paper title
print(paper.title)
```

Output:

```console
Computing Machinery and Intelligence
```

### What next?

- [Usage](https://semanticscholar.readthedocs.io/en/latest/usage.html) - See additional examples to learn how to use the library to fetch data from Semantic Scholar APIs.
- [Reference](https://semanticscholar.readthedocs.io/en/latest/reference.html) - Get the details of the classes and methods available in the library.
- [API Endpoints](https://semanticscholar.readthedocs.io/en/latest/api.html) - Check the supported SemanticScholar API endpoints and which methods implement them.

## Semantic Scholar API official docs

If you have concerns or feedback specific to this library, feel free to [open an issue](https://github.com/danielnsilva/semanticscholar/issues). However, the official documentation provides additional resources for broader API-related issues.

- For details on Semantic Scholar APIs capabilities and limits, [go to the official documentation](https://api.semanticscholar.org/api-docs/graph).
- The [Frequently Asked Questions](https://www.semanticscholar.org/faq) page also provides helpful content if you need a better understanding of data fetched from Semantic Scholar services.

## Contributing

As a volunteer-maintained open-source project, contributions of all forms are welcome! For more information, see the [Contributing Guidelines](https://github.com/danielnsilva/semanticscholar/blob/master/.github/CONTRIBUTING.md).

Please make sure to understand our [Contributor Covenant Code of Conduct](https://github.com/danielnsilva/semanticscholar/blob/master/.github/CODE_OF_CONDUCT.md) before you contribute. TL;DR: Be nice and respectful!

