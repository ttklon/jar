---
id: "pypi:pyjwt"
kind: "pypi"
category: "licensing-drm"
package: "PyJWT"
version: "2.15.1"
url: "https://pypi.org/project/PyJWT/"
requires_python: ">=3.9"
summary: "JSON Web Token implementation in Python"
fetched_at: "2026-11-08T13:14:43Z"
---

# PyJWT 2.15.1

**Summary:** JSON Web Token implementation in Python

**Install:** `pip install PyJWT`

**Python:** >=3.9

## Distribution artifacts

- pyjwt-2.15.1-py3-none-any.whl (0.0 MB)
- pyjwt-2.15.1.tar.gz (0.1 MB)

## Description

PyJWT
=====

.. image:: https://github.com/jpadilla/pyjwt/workflows/CI/badge.svg
   :target: https://github.com/jpadilla/pyjwt/actions?query=workflow%3ACI

.. image:: https://img.shields.io/pypi/v/pyjwt.svg
   :target: https://pypi.python.org/pypi/pyjwt

.. image:: https://codecov.io/gh/jpadilla/pyjwt/branch/master/graph/badge.svg
   :target: https://codecov.io/gh/jpadilla/pyjwt

.. image:: https://readthedocs.org/projects/pyjwt/badge/?version=stable
   :target: https://pyjwt.readthedocs.io/en/stable/

A Python implementation of `RFC 7519 <https://tools.ietf.org/html/rfc7519>`_. Original implementation was written by `@progrium <https://github.com/progrium>`_.

Sponsor
-------

.. |auth0-logo| image:: https://github.com/user-attachments/assets/ee98379e-ee76-4bcb-943a-e25c4ea6d174
   :width: 160px

+--------------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+
| |auth0-logo| | If you want to quickly add secure token-based authentication to Python projects, feel free to check Auth0's Python SDK and free plan at `auth0.com/signup <https://auth0.com/signup?utm_source=external_sites&utm_medium=pyjwt&utm_campaign=devn_signup>`_. |
+--------------+-----------------------------------------------------------------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+

Installing
----------

Install with **pip**:

.. code-block:: console

    $ pip install PyJWT


Usage
-----

.. code-block:: pycon

    >>> import jwt
    >>> encoded = jwt.encode({"some": "payload"}, "secret", algorithm="HS256")
    >>> print(encoded)
    eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzb21lIjoicGF5bG9hZCJ9.4twFt5NiznN84AWoo1d7KO1T_yoc0Z6XOpOVswacPZg
    >>> jwt.decode(encoded, "secret", algorithms=["HS256"])
    {'some': 'payload'}

Documentation
-------------

View the full docs online at https://pyjwt.readthedocs.io/en/stable/


Tests
-----

You can run tests from the project root after cloning with:

.. code-block:: console

    $ tox

