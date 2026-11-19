---
id: "pypi:accessible-output2"
kind: "pypi"
category: "accessibility-api"
package: "accessible-output2"
version: "0.17"
url: "https://pypi.org/project/accessible-output2/"
summary: "Library to provide speech and braille output to a variety of different screen readers and other accessibility solutions."
fetched_at: "2026-11-08T12:43:21Z"
---

# accessible-output2 0.17

**Summary:** Library to provide speech and braille output to a variety of different screen readers and other accessibility solutions.

**Install:** `pip install accessible-output2`

**Python:** any

## Distribution artifacts

- accessible_output2-0.17-py2.py3-none-any.whl (0.8 MB)
- accessible_output2-0.17.tar.gz (0.8 MB)

## Description

Accessible Output 2: Make your app speak
==================================================

Accessible Output 2 is an MIT licensed library for speaking and brailling through multiple screen readers and other accessibility systems.

Accessible Output 2 makes selection of the appropriate speech and Braille output a snap, and also allows the programmer to select and use a specific output, for instance to force speaking through the Microsoft Speech API even if the user has a screen reader loaded.

.. code-block:: python

    >>> import accessible_output2.outputs.auto
    >>> o = accessible_output2.outputs.auto.Auto()
    >>> o.output("Some text") #attempts to both speak and braille the given text through the first available output
    >>> o.speak("Some other text", interrupt=True) #Speak some text through the output, without brailling it, and interrupt the currently-speaking text if any

Accessible Output 2 makes it simple to add spoken and brailled notifications to your applications on multiple platforms, facilitating accessibility for the visually impaired and also providing a nice alternative means of providing notifications to a sighted user.

Supported Outputs:
------------------
Speech:

- JAWS for Windows
- NVDA
- Window Eyes
- System Access
- Supernova and other Dolphin products
- PC Talker
- ZDSR
- Microsoft Speech API


Braille:

- JAWS for Windows
- NVDA
- Window Eyes
- System Access
- Supernova and other Dolphin products




