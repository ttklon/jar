---
id: "pypi:hidapi"
kind: "pypi"
category: "devices-peripherals"
package: "hidapi"
version: "0.15.0"
url: "https://pypi.org/project/hidapi/"
home_page: "https://github.com/trezor/cython-hidapi"
summary: "A Cython interface to the hidapi from https://github.com/libusb/hidapi"
fetched_at: "2026-11-08T12:43:21Z"
---

# hidapi 0.15.0

**Summary:** A Cython interface to the hidapi from https://github.com/libusb/hidapi

**Install:** `pip install hidapi`

**Python:** any

## Distribution artifacts

- hidapi-0.15.0-cp310-cp310-macosx_10_9_x86_64.whl (0.1 MB)
- hidapi-0.15.0-cp310-cp310-macosx_11_0_arm64.whl (0.1 MB)
- hidapi-0.15.0-cp310-cp310-manylinux2014_x86_64.manylinux_2_17_x86_64.whl (1.0 MB)
- hidapi-0.15.0-cp310-cp310-manylinux_2_28_aarch64.whl (1.5 MB)
- hidapi-0.15.0-cp310-cp310-manylinux_2_28_i686.whl (1.6 MB)
- hidapi-0.15.0-cp310-cp310-musllinux_1_2_aarch64.whl (0.6 MB)
- hidapi-0.15.0-cp310-cp310-musllinux_1_2_i686.whl (0.6 MB)
- hidapi-0.15.0-cp310-cp310-musllinux_1_2_x86_64.whl (0.6 MB)
- hidapi-0.15.0-cp310-cp310-win32.whl (0.1 MB)
- hidapi-0.15.0-cp310-cp310-win_amd64.whl (0.1 MB)
- hidapi-0.15.0-cp311-cp311-macosx_10_9_x86_64.whl (0.1 MB)
- hidapi-0.15.0-cp311-cp311-macosx_11_0_arm64.whl (0.1 MB)

## Description

cython-hidapi
=============

.. contents::

Description
-----------

A Cython interface to `HIDAPI <https://github.com/libusb/hidapi>`_ library.

This has been tested with:

* `TREZOR <https://trezor.io/>`_ Hardware Wallet
* the PIC18F4550 on the development board from CCS with their example program
* the Fine Offset WH3081 Weather Station

It works on Linux, Windows and macOS.

Software Dependencies
---------------------

* `Python <http://python.org>`_
* `Cython <http://cython.org>`_
* hidraw or libusb+libudev on Linux

License
-------

cython-hidapi may be used by one of three licenses as outlined in LICENSE.txt

Install
-------

::

    $ sudo apt-get install python-dev libusb-1.0-0-dev libudev-dev
    $ sudo pip install --upgrade setuptools
    $ sudo pip install hidapi

For other download options visit the `PyPi page <https://pypi.python.org/pypi/hidapi/>`_.

Build from source
-----------------

1. Download cython-hidapi archive::

    $ git clone --recursive https://github.com/trezor/cython-hidapi.git
    $ cd cython-hidapi

2. Build cython-hidapi extension module::

    $ python setup.py build

   On Linux, the hidraw API is now used by default, and the libusb API is not
   included. That is, --without-libusb is now the default behavior.
   To force the use of the libusb API instead, use the --with-libusb option::

    $ python setup.py build --with-libusb

   Or you can also use the environment variable::

    $ export HIDAPI_WITH_LIBUSB=1
    $ python setup.py build

3. Install cython-hidapi module into your Python distribution::

    $ sudo python setup.py install

   **Alternatively**, you can run pip directly, which will call the necessary build and install commands::

    $ pip install -e .

4. Test install::

    $ python
    >>> import hid
    >>>

5. Try example script::

    $ python try.py

Udev rules
----------

For correct functionality under Linux, you need to create a rule file similar
to `this one <https://raw.githubusercontent.com/trezor/trezor-common/master/udev/51-trezor.rules>`_
in your udev rules directory.

Also you might need to call ``udevadm control --reload-rules`` to reload the rules.

Documentation
-------------

Documentation can be built using Sphinx::

   $ cd docs && make html

The HTML output will be in ``docs/_build/html``.

The documentation is extracted from the code using ``autodoc``.

Note that the build output is used. So rebuilt the package before generating documentation.

Built documentation is also deployed to: `https://trezor.github.io/cython-hidapi/ <https://trezor.github.io/cython-hidapi/>`_.

