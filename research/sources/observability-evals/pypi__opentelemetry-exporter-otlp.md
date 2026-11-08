---
id: "pypi:opentelemetry-exporter-otlp"
kind: "pypi"
category: "observability-evals"
package: "opentelemetry-exporter-otlp"
version: "1.45.2"
url: "https://pypi.org/project/opentelemetry-exporter-otlp/"
requires_python: ">=3.10"
summary: "OpenTelemetry Collector Exporters"
fetched_at: "2026-11-08T12:19:23Z"
---

# opentelemetry-exporter-otlp 1.45.2

**Summary:** OpenTelemetry Collector Exporters

**Install:** `pip install opentelemetry-exporter-otlp`

**Python:** >=3.10

## Distribution artifacts

- opentelemetry_exporter_otlp-1.45.2-py3-none-any.whl (0.0 MB)
- opentelemetry_exporter_otlp-1.45.2.tar.gz (0.0 MB)

## Description

OpenTelemetry Collector Exporters
=================================

|pypi|

.. |pypi| image:: https://badge.fury.io/py/opentelemetry-exporter-otlp.svg
   :target: https://pypi.org/project/opentelemetry-exporter-otlp/

This library is provided as a convenience to install all supported OpenTelemetry Collector Exporters. Currently it installs:

* opentelemetry-exporter-otlp-proto-grpc
* opentelemetry-exporter-otlp-proto-http

In the future, additional packages will be available:
* opentelemetry-exporter-otlp-json-http

To avoid unnecessary dependencies, users should install the specific package once they've determined their
preferred serialization and protocol method.

Installation
------------

::

     pip install opentelemetry-exporter-otlp


References
----------

* `OpenTelemetry Collector Exporter <https://opentelemetry-python.readthedocs.io/en/latest/exporter/otlp/otlp.html>`_
* `OpenTelemetry Collector <https://github.com/open-telemetry/opentelemetry-collector/>`_
* `OpenTelemetry <https://opentelemetry.io/>`_
* `OpenTelemetry Protocol Specification <https://github.com/open-telemetry/oteps/blob/main/text/0035-opentelemetry-protocol.md>`_

