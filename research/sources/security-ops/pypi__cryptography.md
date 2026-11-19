---
id: "pypi:cryptography"
kind: "pypi"
category: "security-ops"
package: "cryptography"
version: "50.0.2"
url: "https://pypi.org/project/cryptography/"
requires_python: "!=3.9.0,!=3.9.1,>=3.9"
summary: "cryptography is a package which provides cryptographic recipes and primitives to Python developers."
fetched_at: "2026-11-08T12:43:21Z"
---

# cryptography 50.0.2

**Summary:** cryptography is a package which provides cryptographic recipes and primitives to Python developers.

**Install:** `pip install cryptography`

**Python:** !=3.9.0,!=3.9.1,>=3.9

## Distribution artifacts

- cryptography-50.0.2-cp311-abi3-macosx_11_0_arm64.whl (3.7 MB)
- cryptography-50.0.2-cp311-abi3-manylinux2014_aarch64.manylinux_2_17_aarch64.whl (4.5 MB)
- cryptography-50.0.2-cp311-abi3-manylinux2014_x86_64.manylinux_2_17_x86_64.whl (4.5 MB)
- cryptography-50.0.2-cp311-abi3-manylinux_2_28_aarch64.whl (4.5 MB)
- cryptography-50.0.2-cp311-abi3-manylinux_2_28_ppc64le.whl (5.1 MB)
- cryptography-50.0.2-cp311-abi3-manylinux_2_28_x86_64.whl (4.5 MB)
- cryptography-50.0.2-cp311-abi3-manylinux_2_31_armv7l.whl (4.2 MB)
- cryptography-50.0.2-cp311-abi3-manylinux_2_34_aarch64.whl (4.5 MB)
- cryptography-50.0.2-cp311-abi3-manylinux_2_34_ppc64le.whl (5.1 MB)
- cryptography-50.0.2-cp311-abi3-manylinux_2_34_x86_64.whl (4.5 MB)
- cryptography-50.0.2-cp311-abi3-musllinux_1_2_aarch64.whl (4.6 MB)
- cryptography-50.0.2-cp311-abi3-musllinux_1_2_x86_64.whl (4.8 MB)

## Description

pyca/cryptography
=================

.. image:: https://img.shields.io/pypi/v/cryptography.svg
    :target: https://pypi.org/project/cryptography/
    :alt: Latest Version

.. image:: https://readthedocs.org/projects/cryptography/badge/?version=latest
    :target: https://cryptography.io
    :alt: Latest Docs

.. image:: https://github.com/pyca/cryptography/actions/workflows/ci.yml/badge.svg
    :target: https://github.com/pyca/cryptography/actions/workflows/ci.yml?query=branch%3Amain

``cryptography`` is a package which provides cryptographic recipes and
primitives to Python developers. Our goal is for it to be your "cryptographic
standard library". It supports Python 3.9+ and PyPy3 7.3.11+.

``cryptography`` includes both high level recipes and low level interfaces to
common cryptographic algorithms such as symmetric ciphers, message digests, and
key derivation functions. For example, to encrypt something with
``cryptography``'s high level symmetric encryption recipe:

.. code-block:: pycon

    >>> from cryptography.fernet import Fernet
    >>> # Put this somewhere safe!
    >>> key = Fernet.generate_key()
    >>> f = Fernet(key)
    >>> token = f.encrypt(b"A really secret message. Not for prying eyes.")
    >>> token
    b'...'
    >>> f.decrypt(token)
    b'A really secret message. Not for prying eyes.'

You can find more information in the `documentation`_.

You can install ``cryptography`` with:

.. code-block:: console

    $ pip install cryptography

For full details see `the installation documentation`_.

Discussion
~~~~~~~~~~

If you run into bugs, you can file them in our `issue tracker`_.

We maintain a `cryptography-dev`_ mailing list for development discussion.

You can also join ``#pyca`` on ``irc.libera.chat`` to ask questions or get
involved.

Security
~~~~~~~~

Need to report a security issue? Please consult our `security reporting`_
documentation.


.. _`documentation`: https://cryptography.io/
.. _`the installation documentation`: https://cryptography.io/en/latest/installation/
.. _`issue tracker`: https://github.com/pyca/cryptography/issues
.. _`cryptography-dev`: https://mail.python.org/mailman/listinfo/cryptography-dev
.. _`security reporting`: https://cryptography.io/en/latest/security/


