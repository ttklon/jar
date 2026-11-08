---
id: "pypi:pyperclip"
kind: "pypi"
category: "system-control"
package: "pyperclip"
version: "1.11.0"
url: "https://pypi.org/project/pyperclip/"
license: "BSD"
summary: "A cross-platform clipboard module for Python. (Only handles plain text for now.)"
fetched_at: "2026-11-08T11:47:22Z"
---

# pyperclip 1.11.0

**Summary:** A cross-platform clipboard module for Python. (Only handles plain text for now.)

**Install:** `pip install pyperclip`

**Python:** any

## Distribution artifacts

- pyperclip-1.11.0-py3-none-any.whl (0.0 MB)
- pyperclip-1.11.0.tar.gz (0.0 MB)

## Description

Pyperclip is a cross-platform Python module for copy and paste clipboard functions. It works with Python 2 and 3.

Install on Windows: `pip install pyperclip`

Install on Linux/macOS: `pip3 install pyperclip`

Al Sweigart al@inventwithpython.com
BSD License

Example Usage
=============

    >>> import pyperclip
    >>> pyperclip.copy('The text to be copied to the clipboard.')
    >>> pyperclip.paste()
    'The text to be copied to the clipboard.'


Currently only handles plaintext.

On Windows, no additional modules are needed.

On Mac, this module makes use of the pbcopy and pbpaste commands, which should come with the os.

On Linux, this module makes use of the xclip or xsel commands, which should come with the os. Otherwise run "sudo apt-get install xclip" or "sudo apt-get install xsel" (Note: xsel does not always seem to work.)

Otherwise on Linux, you will need the qtpy or PyQT5 modules installed.

Support
-------

If you find this project helpful and would like to support its development, [consider donating to its creator on Patreon](https://www.patreon.com/AlSweigart).

