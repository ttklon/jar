---
id: "github:python-openxml/python-docx"
kind: "github"
category: "office-automation"
repo: "python-openxml/python-docx"
url: "https://github.com/python-openxml/python-docx"
description: "Create and modify Word documents with Python"
stars: 5759
forks: 1332
language: "Python"
license: "MIT"
archived: false
pushed_at: "2026-08-01T14:59:42Z"
default_branch: "master"
fetched_at: "2026-11-08T12:31:02Z"
---

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
