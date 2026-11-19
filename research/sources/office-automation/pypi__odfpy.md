---
id: "pypi:odfpy"
kind: "pypi"
category: "office-automation"
package: "odfpy"
version: "1.4.1"
url: "https://pypi.org/project/odfpy/"
home_page: "https://github.com/eea/odfpy"
summary: "Python API and tools to manipulate OpenDocument files"
fetched_at: "2026-11-08T11:47:22Z"
---

# odfpy 1.4.1

**Summary:** Python API and tools to manipulate OpenDocument files

**Install:** `pip install odfpy`

**Python:** any

## Distribution artifacts

- odfpy-1.4.1-py2.7.egg (0.3 MB)
- odfpy-1.4.1.tar.gz (0.7 MB)

## Description


Odfpy is a library to read and write OpenDocument v. 1.2 files.
The main focus has been to prevent the programmer from creating invalid
documents. It has checks that raise an exception if the programmer adds
an invalid element, adds an attribute unknown to the grammar, forgets to
add a required attribute or adds text to an element that doesn't allow it.

These checks and the API itself were generated from the RelaxNG
schema, and then hand-edited. Therefore the API is complete and can
handle all ODF constructions.

In addition to the API, there are a few scripts:

- csv2odf - Create OpenDocument spreadsheet from comma separated values
- mailodf - Email ODF file as HTML archive
- odf2xhtml - Convert ODF to (X)HTML
- odf2mht - Convert ODF to HTML archive
- odf2xml - Create OpenDocument XML file from OD? package
- odfimgimport - Import external images
- odflint - Check ODF file for problems
- odfmeta - List or change the metadata of an ODF file
- odfoutline - Show outline of OpenDocument
- odfuserfield - List or change the user-field declarations in an ODF file
- xml2odf - Create OD? package from OpenDocument in XML form

The source code is at https://github.com/eea/odfpy

Visit https://github.com/eea/odfpy/wiki for documentation and examples.

The code at https://joinup.ec.europa.eu/software/odfpy/home is obsolete.
