---
id: "pypi:python-docx"
kind: "pypi"
category: "office-automation"
package: "python-docx"
version: "1.2.0"
url: "https://pypi.org/project/python-docx/"
license: "MIT"
requires_python: ">=3.9"
summary: "Create, read, and update Microsoft Word .docx files."
fetched_at: "2026-11-08T11:47:22Z"
---

# python-docx 1.2.0

**Summary:** Create, read, and update Microsoft Word .docx files.

**Install:** `pip install python-docx`

**Python:** >=3.9

## Distribution artifacts

- python_docx-1.2.0-py3-none-any.whl (0.2 MB)
- python_docx-1.2.0.tar.gz (5.5 MB)

## Description

# python-docx

*python-docx* is a Python library for reading, creating, and updating Microsoft Word 2007+ (.docx) files.

## Installation

```
pip install python-docx
```

## Example

```python
>>> from docx import Document

>>> document = Document()
>>> document.add_paragraph("It was a dark and stormy night.")
<docx.text.paragraph.Paragraph object at 0x10f19e760>
>>> document.save("dark-and-stormy.docx")

>>> document = Document("dark-and-stormy.docx")
>>> document.paragraphs[0].text
'It was a dark and stormy night.'
```

More information is available in the [python-docx documentation](https://python-docx.readthedocs.org/en/latest/)

