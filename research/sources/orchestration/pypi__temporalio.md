---
id: "pypi:temporalio"
kind: "pypi"
category: "orchestration"
package: "temporalio"
version: "1.35.0"
url: "https://pypi.org/project/temporalio/"
requires_python: ">=3.10"
summary: "Temporal.io Python SDK"
fetched_at: "2026-11-08T11:20:04Z"
---

# temporalio 1.35.0

**Summary:** Temporal.io Python SDK

**Install:** `pip install temporalio`

**Python:** >=3.10

## Distribution artifacts

- temporalio-1.35.0-cp310-abi3-macosx_10_12_x86_64.whl (13.3 MB)
- temporalio-1.35.0-cp310-abi3-macosx_11_0_arm64.whl (12.9 MB)
- temporalio-1.35.0-cp310-abi3-manylinux_2_17_aarch64.manylinux2014_aarch64.whl (13.3 MB)
- temporalio-1.35.0-cp310-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (13.7 MB)
- temporalio-1.35.0-cp310-abi3-musllinux_1_2_aarch64.whl (13.3 MB)
- temporalio-1.35.0-cp310-abi3-musllinux_1_2_x86_64.whl (13.8 MB)
- temporalio-1.35.0-cp310-abi3-win_amd64.whl (14.6 MB)
- temporalio-1.35.0.tar.gz (2.7 MB)

## Description

![Temporal Python SDK](https://assets.temporal.io/w/py.png)

[![Python 3.10+](https://img.shields.io/pypi/pyversions/temporalio.svg?style=for-the-badge)](https://pypi.org/project/temporalio)
[![PyPI](https://img.shields.io/pypi/v/temporalio.svg?style=for-the-badge)](https://pypi.org/project/temporalio)
[![MIT](https://img.shields.io/pypi/l/temporalio.svg?style=for-the-badge)](LICENSE)

[Temporal](https://temporal.io/) is a distributed, scalable, durable, and highly available orchestration engine used to
execute asynchronous, long-running business logic in a scalable and resilient way.

"Temporal Python SDK" is the framework for authoring workflows and activities using the Python programming language.

Also see:
* [Application Development Guide](https://docs.temporal.io/application-development?lang=python) - Once you've tried our
  [Quick Start](#quick-start), check out our guide on how to use Temporal in your Python applications, including
  information around Temporal core concepts.
* [Python Code Samples](https://github.com/temporalio/samples-python)
* [API Documentation](https://python.temporal.io) - Complete Temporal Python SDK Package reference.

In addition to features common across all Temporal SDKs, the Python SDK also has the following interesting features:

**Type Safe**

This library uses the latest typing and MyPy support with generics to ensure all calls can be typed. For example,
starting a workflow with an `int` parameter when it accepts a `str` parameter would cause MyPy to fail.

**Different Activity Types**

The activity worker has been developed to work with `async def`, threaded, and multiprocess activities. Threaded activities are the initial recommendation, and further guidance can be found in [the docs](https://docs.temporal.io/develop/python/python-sdk-sync-vs-async).

**Custom `asyncio` Event Loop**

The workflow implementation basically turns `async def` functions into workflows backed by a distributed, fault-tolerant
event loop. This means task management, sleep, cancellation, etc have all been developed to seamlessly integrate with
`asyncio` concepts.

See the [blog post](https://temporal.io/blog/durable-distributed-asyncio-event-loop) introducing the Python SDK for an
informal introduction to the features and their implementation.

---

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Contents**

- [Quick Start](#quick-start)
  - [Installation](#installation)
  - [Implementing a Workflow](#implementing-a-workflow)
  - [Running a Workflow](#running-a-workflow)
  - [Next Steps](#next-steps)
- [Usage](#usage)
    - [Client](#client)
      - [Data Conversion](#data-conversion)
        - [Pydantic Support](#pydantic-support)
        - [Custom Type Data Conversion](#custom-type-data-conversion)
        - [External Storage](#external-storage)
          - [Driver Selection](#driver-selection)
          - [Built-in Drivers](#built-in-drivers)
          - [Custom Drivers](#custom-drivers)
    - [Workers](#workers)
    - [Workflows](#workflows)
      - [Definition](#definition)
      - [Running](#running)
      - [Invoking Activities](#invoking-activities)
      - [Invoking Child Workflows](#invoking-child-workflows)
      - [Timers](#timers)
      - [Conditions](#conditions)
      - [Asyncio and Determinism](#asyncio-and-determinism)
      - [Asyncio Cancellation](#asyncio-cancellation)
      - [Workflow Utilities](#workflow-utilities)
      - [Exceptions](#exceptions)
      - [Signal and update handlers](#signal-and-update-handlers)
      - [External Workflows](#external-workflows)
      - [Testing](#testing)
        - [Automatic Time Skipping](#automatic-time-skipping)
        - [Manual Time Skipping](#manual-time-skipping)
        - [Mocking Activities](#mocking-activities)
      - [Workflow Sandbox](#workflow-sandbox)
        - [How the Sandbox Works](#how-the-sandbox-works)
        - [Avoiding the Sandbox](#avoiding-the-sandbox)
        - [Customizing the Sandbox](#customizing-the-sandbox)
          - [Passthrough Modules](#passthrough-modules)
          - [Invalid Module Members](#invalid-module-members)
        - [Debugging Workflows with `breakpoint()` / `pdb`](#debugging-workflows-with-breakpoint--pdb)
        - [Known Sandbox Issues](#known-sandbox-issues)
          - [Global Import/Builtins](#global-importbuiltins)
          - [Sandbox is not Secure](#sandbox-is-not-secure)
          - [Sandbox Performance](#sandbox-performance)
          - [Extending Restricted Classes](#extending-restricted-classes)
          - [Certain Standard Library Calls on Restricted Objects](#certain-standard-library-calls-on-restricted-objects)
          - [is_subclass of ABC-based Restricted Classes](#is_subclass-of-abc-based-restricted-classes)
    - [Activities](#activities)
      - [Definition](#definition-1)
      - [Types of Activities](#types-of-activities)
        - [Synchronous Activities](#synchronous-activities)
          - [Synchronous Multithreaded Activities](#synchronous-multithreaded-activities)
          - [Synchronous Multiprocess/Other Activities](#synchronous-multiprocessother-activities)
        - [Asynchronous Activities](#asynchronous-activities)
      - [Activity Context](#activity-context)
        - [Heartbeating and Cancellation](#heartbeating-and-cancellation)
        - [Worker Shutdown](#worker-shutdown)
      - [Testing](#testing-1)
    - [Interceptors](#interceptors)
    - [Nexus](#nexus)
    - [Plugins](#plugins)
      - [Usage](#usage-1)
      - [Plugin Implementations](#plugin-implementations)
      - [Advanced Plugin Implementations](#advanced-plugin-implementations)
        - [Client Plugins](#client-plugins)
        - [Worker Plugins](#worker-plugins)
    - [Workflow Replay](#workflow-replay)
    - [Observability](#observability)
      - [Metrics](#metrics)
      - [OpenTelemetry Tracing](#opentelemetry-tracing)
      - [OpenTelemetry Metrics](#opentelemetry-metrics)
    - [Protobuf 3.x vs 4.x](#protobuf-3x-vs-4x)
    - [Known Compatibility Issues](#known-compatibility-issues)
      - [gevent Patching](#gevent-patching)
- [Development](#development)
    - [Building](#building)
      - [Prepare](#prepare)
      - [Build](#build)
      - [Use](#use)
      - [FIPS Compliance (Experimental)](#fips-compliance-experimental)
    - [Local SDK development environment](#local-sdk-development-environment)
      - [Testing](#testing-2)
      - [Proto Generation and Testing](#proto-generation-and-testing)
    - [Style](#style)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# Quick Start

We will guide you through the Temporal basics to create a "hello, world!" script on your machine. It is not intended as
one of the ways to use Temporal, but in reality it is very simplified and decidedly not "the only way" to use Temporal.
For more information, check out the docs references in "Next Steps" below the quick start.

## Installation

Install the `temporalio` package from [PyPI](https://pypi.org/project/temporalio).

These steps can be followed to use with a virtual environment and `pip`:

* [Create a virtual environment](https://packaging.python.org/en/latest/tutorials/installing-packages/#creating-virtual-environments)
* Update `pip` - `python -m pip install -U pip`
  * Needed because older versions of `pip` may not pick the right wheel
* Install Temporal SDK - `python -m pip install temporalio`

The SDK is now ready for use. To build from source, see "Building" near the end of this documentation.

**NOTE: This README is for the current branch and not necessarily what's released on `PyPI`.**

## Implementing a Workflow

Create the following in `activities.py`:

```python
from temporalio import activity

@activity.defn
def say_hello(name: str) -> str:
    return f"Hello, {name}!"
```

Create the following in `workflows.py`:

```python
from datetime import timedelta
from temporalio import workflow

# Import our activity, passing it through the sandbox
with workflow.unsafe.imports_passed_through():
    from activities import say_hello

@workflow.defn
class SayHello:
    @workflow.run
    async def run(self, name: str) -> str:
        return await workflow.execute_activity(
            say_hello, name, schedule_to_close_timeout=timedelta(seconds=5)
        )
```

Create the following in `run_worker.py`:

```python
import asyncio
import concurrent.futures
from temporalio.client import Client
from temporalio.worker import Worker

# Import the activity and workflow from our other files
from activities import say_hello
from workflows import SayHello

async def main():
    # Create client connected to server at the given address
    client = await Client.connect("localhost:7233")

    # Run the worker
    with concurrent.futures.ThreadPoolExecutor(max_workers=100) as activity_executor:
        worker = Worker(
          client,
          task_queue="my-task-queue",
          workflows=[SayHello],
          activities=[say_hello],
          activity_executor=activity_executor,
        )
        await worker.run()

if __name__ == "__main__":
    asyncio.run(main())
```

Assuming you have a [Temporal server running on localhost](https://docs.temporal.io/docs/server/quick-install/), this
will run the worker:

    python run_worker.py

## Running a Workflow

Create the following script at `run_workflow.py`:

```python
import asyncio
from temporalio.client import Client

# Import the workflow from the previous code
from workflows import SayHello

async def main():
    # Create client connected to server at the given address
    client = await Client.connect("localhost:7233")

    # Execute a workflow
    result = await client.execute_workflow(SayHello.run, "my name", id="my-workflow-id", task_queue="my-task-queue")

    print(f"Result: {result}")

if __name__ == "__main__":
    asyncio.run(main())
```

Assuming you have `run_worker.py` running from before, this will run the workflow:

    python run_workflow.py

The output will be:

    Result: Hello, my-name!

## Next Steps

Temporal can be implemented in your code in many different ways, to suit your application's needs. The links below will
give you much more information about how Temporal works with Python:

* [Code Samples](https://github.com/temporalio/samples-python) - If you want to start with some code, we have provided
  some pre-built samples.
* [Application Development Guide](https://docs.temporal.io/application-development?lang=python) Our Python specific
  Developer's Guide will give you much more information on how to build with Temporal in your Python applications than
  our SDK README ever could (or should).
* [API Documentation](https://python.temporal.io) - Full Temporal Python SDK package documentation.

---

# Usage

From here, you will find reference documentation about specific pieces of the Temporal Python SDK that were built around
Temporal concepts. *This section is not intended as a how-to guide* -- For more how-to oriented information, check out
the links in the [Next Steps](#next-steps) section above.

### Client

A client can be created and used to start a workflow like so:

```python
from temporalio.client import Client

async def main():
    # Create client connected to server at the given address and namespace
    client = await Client.connect("localhost:7233", namespace="my-namespace")

    # Start a workflow
    handle = await client.start_workflow(MyWorkflow.run, "some arg", id="my-workflow-id", task_queue="my-task-queue")

    # Wait for result
    result = await handle.result()
    print(f"Result: {result}")
```

Some things to note about the above code:

* A `Client` does not have an explicit "close"
* To enable TLS, the `tls` argument to `connect` can be set to `True` or a `TLSConfig` object
* A single positional argument can be passed to `start_workflow`. If there are multiple arguments, only the
  non-type-safe form of `start_workflow` can be used (i.e. the one accepting a string workflow name) and it must be in
  the `args` keyword argument.
* The `handle` represents the workflow that was started and can be used for more than just getting the result
* Since we are just getting the handle and waiting on the result, we could have called `client.execute_workflow` which
  does the same thing
* Clients can have many more options not shown here (e.g. data converters and interceptors)
* A string can be used instead of the method reference to call a workflow by name (e.g. if defined in another language)
* Clients do not work across forks

Clients also provide a shallow copy of their config for use in making slightly different clients backed by the same
connection. For instance, given the `client` above, this is how to have a client in another namespace:

```python
config = client.config()
config["namespace"] = "my-other-namespace"
other_ns_client = Client(**config)
```

#### Data Conversion

Data converters are used to convert raw Temporal payloads to/from actual Python types. A custom data converter of type
`temporalio.converter.DataConverter` can be set via the `data_converter` parameter of the `Client` constructor. Data
converters are a combination of payload converters, external storage, payload codecs, and failure converters. Payload
converters convert Python values to/from serialized bytes. External payload storage optionally stores and retrieves payloads
to/from external storage services using drivers. Payload codecs convert bytes to bytes (e.g. for compression or encryption).
Failure converters convert exceptions to/from serialized failures.

The default data converter supports converting multiple types including:

* `None`
* `bytes`
* `google.protobuf.message.Message` - As JSON when encoding, but has ability to decode binary proto from other languages
* Anything that can be converted to JSON including:
  * Anything that [`json.dump`](https://docs.python.org/3/library/json.html#json.dump) supports natively
  * [dataclasses](https://docs.python.org/3/library/dataclasses.html)
  * Iterables including ones JSON dump may not support by default, e.g. `set`
  * [IntEnum, StrEnum](https://docs.python.org/3/library/enum.html) based enumerates, including enums that mix in `int` or `str`
  * [UUID](https://docs.python.org/3/library/uuid.html)
  * `datetime.datetime`

To use pydantic model instances, see [Pydantic Support](#pydantic-support).

`datetime.date` and `datetime.time` can only be used with the Pydantic data converter.

Although workflows, updates, signals, and queries can all be defined with multiple input parameters, users are strongly
encouraged to use a single `dataclass` or Pydantic model parameter, so that fields with defaults can be easily added
without breaking compatibility. Similar advice applies to return values.

Classes with generics may not have the generics properly resolved. The current implementation does not have generic
type resolution. Users should use concrete types.

##### Pydantic Support

To use Pydantic model instances, install Pydantic and set the Pydantic data converter when creating client instances:

```python
from temporalio.contrib.pydantic import pydantic_data_converter

client = Client(data_converter=pydantic_data_converter, ...)
```

This data converter supports conversion of all types supported by Pydantic to and from JSON.

In addition to Pydantic models, these include all `json.dump`-able types, various non-`json.dump`-able standard library
types such as dataclasses, types from the datetime module, sets, UUID, etc, and custom types composed of any of these.

Pydantic v1 is not supported by this data converter. If you are not yet able to upgrade from Pydantic v1, see
https://github.com/temporalio/samples-python/tree/main/pydantic_converter/v1 for limited v1 support.


##### Custom Type Data Conversion

For converting from JSON, the workflow/activity type hint is taken into account to convert to the proper type. Care has
been taken to support all common typings including `Optional`, `Union`, all forms of iterables and mappings, `NewType`,
etc in addition to the regular JSON values mentioned before.

Data converters contain a reference to a payload converter class that is used to convert to/from payloads/values. This
is a class and not an instance because it is instantiated on every workflow run inside the sandbox. The payload
converter is usually a `CompositePayloadConverter` which contains a multiple `EncodingPayloadConverter`s it uses to try
to serialize/deserialize payloads. Upon serialization, each `EncodingPayloadConverter` is tried until one succeeds. The
`EncodingPayloadConverter` provides an "encoding" string serialized onto the payload so that, upon deserialization, the
specific `EncodingPayloadConverter` for the given "encoding" is used.

The default data converter uses the `DefaultPayloadConverter` which is simply a `CompositePayloadConverter` with a known
set of default `EncodingPayloadConverter`s. To implement a custom encoding for a custom type, a new
`EncodingPayloadConverter` can be created for the new type. For example, to support `IPv4Address` types:

```python
class IPv4AddressEncodingPayloadConverter(EncodingPayloadConverter):
    @property
    def encoding(self) -> str:
        return "text/ipv4-address"

    def to_payload(self, value: Any) -> Optional[Payload]:
        if isinstance(value, ipaddress.IPv4Address):
            return Payload(
                metadata={"encoding": self.encoding.encode()},
                data=str(value).encode(),
            )
        else:
            return None

    def from_payload(self, payload: Payload, type_hint: Optional[Type] = None) -> Any:
        assert not type_hint or type_hint is ipaddress.IPv4Address
        return ipaddress.IPv4Address(payload.data.decode())

class IPv4AddressPayloadConverter(CompositePayloadConverter):
    def __init__(self) -> None:
        # Just add ours as first before the defaults
        super().__init__(
            IPv4AddressEncodingPayloadConverter(),
            *DefaultPayloadConverter.default_encoding_payload_converters,
        )

my_data_converter = dataclasses.replace(
    DataConverter.default,
    payload_converter_class=IPv4AddressPayloadConverter,
)
```

Imports are left off for brevity.

This is good for many custom types. However, sometimes you want to override the behavior of the just the existing JSON
encoding payload converter to support a new type. It is already the last encoding data converter in the list, so it's
the fall-through behavior for any otherwise unknown type. Customizing the existing JSON converter has the benefit of
making the type work in lists, unions, etc.

The `JSONPlainPayloadConverter` uses the Python [json](https://docs.python.org/3/library/json.html) library with an
advanced JSON encoder by default and a custom value conversion method to turn `json.load`ed values to their type hints.
The conversion can be customized for serialization with a custom `json.JSONEncoder` and deserialization with a custom
`JSONTypeConverter`. For example, to support `IPv4Address` types in existing JSON conversion:

```python
class IPv4AddressJSONEncoder(AdvancedJSONEncoder):
    def default(self, o: Any) -> Any:
        if isinstance(o, ipaddress.IPv4Address):
            return str(o)
        return super().default(o)
class IPv4AddressJSONTypeConverter(JSONTypeConverter):
    def to_typed_value(
        self, hint: Type, value: Any
    ) -> Union[Optional[Any], JSONTypeConverterUnhandled]:
        if issubclass(hint, ipaddress.IPv4Address):
            return ipaddress.IPv4Address(value)
        return JSONTypeConverter.Unhandled

class IPv4AddressPayloadConverter(CompositePayloadConverter):
    def __init__(self) -> None:
        # Replace default JSON plain with our own that has our encoder and type
        # converter
        json_converter = JSONPlainPayloadConverter(
            encoder=IPv4AddressJSONEncoder,
            custom_type_converters=[IPv4AddressJSONTypeConverter()],
        )
        super().__init__(
            *[
                c if not isinstance(c, JSONPlainPayloadConverter) else json_converter
                for c in DefaultPayloadConverter.default_encoding_payload_converters
            ]
        )

my_data_converter = dataclasses.replace(
    DataConverter.default,
    payload_converter_class=IPv4AddressPayloadConverter,
)
```

Now `IPv4Address` can be used in type hints including collections, optionals, etc.

##### External Storage

⚠️ **External storage support is currently at an experimental release stage.** ⚠️

External storage allows large payloads to be offloaded to an external storage service (such as Amazon S3) rather than stored inline in workflow history. This is useful when workflows or activities work with data that would otherwise exceed Temporal's payload size limits.

External storage is configured via the `external_storage` parameter on `DataConverter`.  It should be configured on the `Client` both for clients of your workflow as well as on the worker -- anywhere large payloads may be uploaded or downloaded.

A `StorageDriver` handles uploading and downloading payloads. Temporal provides [built-in drivers](#built-in-drivers) for common storage solutions, or you may implement a [custom driver](#custom-drivers). Here's an example using the built-in `S3StorageDriver` with the SDK's `aioboto3` client:

```python
import aioboto3
import dataclasses
from temporalio.client import Client
from temporalio.envconfig import ClientConfig
from temporalio.contrib.aws.s3driver import S3StorageDriver
from temporalio.contrib.aws.s3driver.aioboto3 import new_aioboto3_client
from temporalio.converter import DataConverter
from temporalio.converter import ExternalStorage

client_config = ClientConfig.load_client_connect_config()

session = aioboto3.Session()
async with session.client("s3") as s3_client:
    driver = S3StorageDriver(
        client=new_aioboto3_client(s3_client),
        bucket="my-bucket",
    )
    client = await Client.connect(
        **client_config,
        data_converter=dataclasses.replace(
            DataConverter.default,
            external_storage=ExternalStorage(drivers=[driver]),
        ),
    )
```

See the [S3 driver README](temporalio/contrib/aws/s3driver/) for further details.

Some things to note about external storage:

* Only payloads that meet or exceed `ExternalStorage.payload_size_threshold` (default 256 KiB) are offloaded. Smaller payloads are stored inline as normal.
* External storage applies transparently to all payloads, whether they are workflow inputs/outputs, activity inputs/outputs, signal inputs, query outputs, update inputs/outputs, or failure details.
* The `DataConverter`'s `payload_codec` (if configured) is applied to the payload *before* it is handed to the storage driver, so the driver always stores encoded bytes. The reference payload written to workflow history is not encoded by the `DataConverter` codec.
* Setting `ExternalStorage.payload_size_threshold` to `0` causes every payload to be considered for external storage regardless of size.

###### Driver Selection

When multiple storage backends are needed, list all drivers in `ExternalStorage.drivers` and provide a `driver_selector` to control which driver stores new payloads. Any driver in the list not chosen for storing is still available for retrieval, which is useful when migrating between storage backends.

```python
from temporalio.converter import ExternalStorage

options = ExternalStorage(
    drivers=[hot_driver, cold_driver],
    driver_selector=lambda context, payload: (
        hot_driver if payload.ByteSize() < 5 * 1024 * 1024 else cold_driver
    ),
)
```

For more complex selection logic, use a plain callable that reads from the `StorageDriverStoreContext`:

```python
import temporalio.converter
from temporalio.api.common.v1 import Payload

def feature_flag_is_on(workflow_id: str | None) -> bool:
    """Check whether external storage is enabled for this workflow via a feature flag service."""
    return workflow_id is not None and len(workflow_id) % 2 == 0

def feature_flag_selector(
    context: temporalio.converter.StorageDriverStoreContext, _payload: Payload
) -> temporalio.converter.StorageDriver | None:
    workflow_id = (
        context.target.id
        if isinstance(context.target, temporalio.converter.StorageDriverWorkflowInfo)
        else None
    )
    return my_driver if feature_flag_is_on(workflow_id) else None

options = ExternalStorage(
    drivers=[my_driver],
    driver_selector=feature_flag_selector,
)
```

Some things to note about driver selection:

* A `driver_selector` is required when more than one driver is registered. With a single driver, `driver_selector` may be omitted and that driver is used for all store operations.
* Returning `None` from a selector leaves the payload stored inline in workflow history rather than offloading it.
* The driver instance returned by the selector must be one of the instances registered in `ExternalStorage.drivers`. If it is not, an error is raised.

###### Built-in Drivers

- **[GCS Storage Driver](temporalio/contrib/gcp/gcsdriver/)**: ⚠️ **Experimental** ⚠️ Google Cloud Storage driver. Ships with a gcloud-aio-storage client adapter, or bring your own by subclassing `GCSStorageDriverClient`.
- **[S3 Storage Driver](temporalio/contrib/aws/s3driver/)**: ⚠️ **Experimental** ⚠️ Amazon S3 driver. Ships with an aioboto3 client, or bring your own by subclassing `S3StorageDriverClient`.

###### Custom Drivers

Implement `temporalio.converter.StorageDriver` to integrate with an external storage system:

```python
from collections.abc import Sequence
from temporalio.converter import StorageDriver, StorageDriverClaim, StorageDriverRetrieveContext, StorageDriverStoreContext
from temporalio.api.common.v1 import Payload

class MyDriver(StorageDriver):
    def __init__(self, driver_name: str | None = None):
        self._driver_name = driver_name or "my-org:driver:my-driver"

    def name(self) -> str:
        return self._driver_name

    async def store(
        self, context: StorageDriverStoreContext, payloads: Sequence[Payload]
    ) -> list[StorageDriverClaim]:
        claims = []
        for payload in payloads:
            key = await my_storage.put(payload.SerializeToString())
            claims.append(StorageDriverClaim(claim_data={"key": key}))
        return claims

    async def retrieve(
        self, context: StorageDriverRetrieveContext, claims: Sequence[StorageDriverClaim]
    ) -> list[Payload]:
        payloads = []
        for claim in claims:
            data = await my_storage.get(claim.claim_data["key"])
            p = Payload()
            p.ParseFromString(data)
            payloads.append(p)
        return payloads
```

Some things to note about implementing a custom driver:

* `StorageDriver.name()` must return a string that is unique among all drivers in `ExternalStorage.drivers`. This name is embedded in the reference payload stored in workflow history and used to look up the correct driver during retrieval — changing it after payloads have been stored will break retrieval.
* `StorageDriver.type()` is automatically implemented to return the name of the class. This can be overridden in subclasses but must remain consistent across all instances of the subclass.
* Use `StorageDriverStoreContext.target` inside `store()` when you need workflow or activity identity (namespace, workflow ID, activity ID, etc.) to choose where or how to store payloads.

### Workers

Workers host workflows and/or activities. Here's how to run a worker:

```python
import asyncio
import logging
from temporalio.client import Client
from temporalio.worker import Worker
# Import your own workflows and activities
from my_workflow_package import MyWorkflow, my_activity

async def run_worker(stop_event: asyncio.Event):
    # Create client connected to server at the given address
    client = await Client.connect("localhost:7233", namespace="my-namespace")

    # Run the worker until the event is set
    worker = Worker(client, task_queue="my-task-queue", workflows=[MyWorkflow], activities=[my_activity])
    async with worker:
        await stop_event.wait()
```

Some things to note about the above code:

* This creates/uses the same client that is used for starting workflows
* While this example accepts a stop event and uses `async with`, `run()` and `shutdown()` may be used instead
* Workers can have many more options not shown here (e.g. data converters and interceptors)

### Workflows

#### Definition

Workflows are defined as classes decorated with `@workflow.defn`. The method invoked for the workflow is decorated with
`@workflow.run`. Methods for signals, queries, and updates are decorated with `@workflow.signal`, `@workflow.query`
and `@workflow.update` respectively. Here's an example of a workflow:

```python
import asyncio
from datetime import timedelta
from temporalio import workflow

# Pass the activities through the sandbox
with workflow.unsafe.imports_passed_through():
    from .my_activities import GreetingInfo, create_greeting_activity

@workflow.defn
class GreetingWorkflow:
    def __init__(self) -> None:
        self._current_greeting = "<unset>"
        self._greeting_info = GreetingInfo()
        self._greeting_info_update = asyncio.Event()
        self._complete = asyncio.Event()

    @workflow.run
    async def run(self, name: str) -> str:
        self._greeting_info.name = name
        while True:
            # Store greeting
            self._current_greeting = await workflow.execute_activity(
                create_greeting_activity,
                self._greeting_info,
                start_to_close_timeout=timedelta(seconds=5),
            )
            workflow.logger.debug("Greeting set to %s", self._current_greeting)

            # Wait for salutation update or complete signal (this can be
            # cancelled)
            await asyncio.wait(
                [
                    asyncio.create_task(self._greeting_info_update.wait()),
                    asyncio.create_task(self._complete.wait()),
                ],
                return_when=asyncio.FIRST_COMPLETED,
            )
            if self._complete.is_set():
                return self._current_greeting
            self._greeting_info_update.clear()

    @workflow.signal
    async def update_salutation(self, salutation: str) -> None:
        self._greeting_info.salutation = salutation
        self._greeting_info_update.set()

    @workflow.signal
    async def complete_with_greeting(self) -> None:
        self._complete.set()

    @workflow.query
    def current_greeting(self) -> str:
        return self._current_greeting

    @workflow.update
    def set_and_get_greeting(self, greeting: str) -> str:
      old = self._current_greeting
      self._current_greeting = greeting
      return old

```

This assumes there's an activity in `my_activities.py` like:

```python
from dataclasses import dataclass
from temporalio import workflow

@dataclass
class GreetingInfo:
    salutation: str = "Hello"
    name: str = "<unknown>"

@activity.defn
def create_greeting_activity(info: GreetingInfo) -> str:
    return f"{info.salutation}, {info.name}!"
```

Some things to note about the above workflow code:

* Workflows run in a sandbox by default.
  * Users are encouraged to define workflows in files with no side effects or other complicated code or unnecessary
    imports to other third party libraries.
  * Non-standard-library, non-`temporalio` imports should usually be "passed through" the sandbox. See the
    [Workflow Sandbox](#workflow-sandbox) section for more details.
* This workflow continually updates the queryable current greeting when signalled and can complete with the greeting on
  a different signal
* Workflows are always classes and must have a single `@workflow.run` which is an `async def` function
* Workflow code must be deterministic. This means no `set` iteration, threading, no randomness, no external calls to
  processes, no network IO, and no global state mutation. All code must run in the implicit `asyncio` event loop and be
  deterministic. Also see the [Asyncio and Determinism](#asyncio-and-determinism) section later.
* `@activity.defn` is explained in a later section. For normal simple string concatenation, this would just be done in
  the workflow. The activity is for demonstration purposes only.
* `workflow.execute_activity(create_greeting_activity, ...` is actually a typed signature, and MyPy will fail if the
  `self._greeting_info` parameter is not a `GreetingInfo`

Here are the decorators that can be applied:

* `@workflow.defn` - Defines a workflow class
  * Must be defined on the class given to the worker (ignored if present on a base class)
  * Can have a `name` param to customize the workflow name, otherwise it defaults to the unqualified class name
  * Can have `dynamic=True` which means all otherwise unhandled workflows fall through to this. If present, cannot have
    `name` argument, and run method must accept a single parameter of `Sequence[temporalio.common.RawValue]` type. The
    payload of the raw value can be converted via `workflow.payload_converter().from_payload`.
* `@workflow.run` - Defines the primary workflow run method
  * Must be defined on the same class as `@workflow.defn`, not a base class (but can _also_ be defined on the same
    method of a base class)
  * Exactly one method name must have this decorator, no more or less
  * Must be defined on an `async def` method
  * The method's arguments are the workflow's arguments
  * The first parameter must be `self`, followed by positional arguments. Best practice is to only take a single
    argument that is an object/dataclass of fields that can be added to as needed.
* `@workflow.init` - Specifies that the `__init__`  method accepts the workflow's arguments.
  * If present, may only be applied to the `__init__` method, the parameters of which must then be identical to those of
    the `@workflow.run` method.
  * The purpose of this decorator is to allow operations involving workflow arguments to be performed in the `__init__`
    method, before any signal or update handler has a chance to execute.
* `@workflow.signal` - Defines a method as a signal
  * Can be defined on an `async` or non-`async` method at any point in the class hierarchy, but if the decorated method
    is overridden, then the override must also be decorated.
  * The method's arguments are the signal's arguments.
  * Return value is ignored.
  * May mutate workflow state, and make calls to other workflow APIs like starting activities, etc.
  * Can have a `name` param to customize the signal name, otherwise it defaults to the unqualified method name.
  * Can have `dynamic=True` which means all otherwise unhandled signals fall through to this. If present, cannot have
    `name` argument, and method parameters must be `self`, a string signal name, and a
    `Sequence[temporalio.common.RawValue]`.
  * Non-dynamic method can only have positional arguments. Best practice is to only take a single argument that is an
    object/dataclass of fields that can be added to as needed.
  * See [Signal and update handlers](#signal-and-update-handlers) below
* `@workflow.update` - Defines a method as an update
  * Can be defined on an `async` or non-`async` method at any point in the class hierarchy, but if the decorated method
    is overridden, then the override must also be decorated.
  * May accept input and return a value
  * The method's arguments are the update's arguments.
  * May be `async` or non-`async`
  * May mutate workflow state, and make calls to other workflow APIs like starting activities, etc.
  * Also accepts the `name` and `dynamic` parameters like signal, with the same semantics.
  * Update handlers may optionally define a validator method by decorating it with `@update_handler_method.validator`.
    To reject an update before any events are written to history, throw an exception in a validator. Validators cannot
    be `async`, cannot mutate workflow state, and return nothing.
  * See [Signal and update handlers](#signal-and-update-handlers) below
* `@workflow.query` - Defines a method as a query
  * Should return a value
  * Should not be `async`
  * Temporal queries should never mutate anything in the workflow or call any calls that would mutate the workflow
  * Also accepts the `name` and `dynamic` parameters like signal and update, with the same semantics.

#### Running

To start a locally-defined workflow from a client, you can simply reference its method like so:

```python
from temporalio.client import Client
from my_workflow_package import GreetingWorkflow

async def create_greeting(client: Client) -> str:
    # Start the workflow
    handle = await client.start_workflow(GreetingWorkflow.run, "my name", id="my-workflow-id", task_queue="my-task-queue")
    # Change the salutation
    await handle.signal(GreetingWorkflow.update_salutation, "Aloha")
    # Tell it to complete
    await handle.signal(GreetingWorkflow.complete_with_greeting)
    # Wait and return result
    return await handle.result()
```

Some things to note about the above code:

* This uses the `GreetingWorkflow` from the previous section
* The result of calling this function is `"Aloha, my name!"`
* `id` and `task_queue` are required for running a workflow
* `client.start_workflow` is typed, so MyPy would fail if `"my name"` were something besides a string
* `handle.signal` is typed, so MyPy would fail if `"Aloha"` were something besides a string or if we provided a
  parameter to the parameterless `complete_with_greeting`
* `handle.result` is typed to the workflow itself, so MyPy would fail if we said this `create_greeting` returned
  something besides a string

#### Invoking Activities

* Activities are started with non-async `workflow.start_activity()` which accepts either an activity function reference
  or a string name.
* A single argument to the activity is positional. Multiple arguments are not supported in the type-safe form of
  start/execute activity and must be supplied via the `args` keyword argument.
* Activity options are set as keyword arguments after the activity arguments. At least one of `start_to_close_timeout`
  or `schedule_to_close_timeout` must be provided.
* The result is an activity handle which is an `asyncio.Task` and supports basic task features
* An async `workflow.execute_activity()` helper is provided which takes the same arguments as
  `workflow.start_activity()` and `await`s on the result. This should be used in most cases unless advanced task
  capabilities are needed.
* Local activities work very similarly except the functions are `workflow.start_local_activity()` and
  `workflow.execute_local_activity()`
* Activities can be methods of a class. Invokers should use `workflow.start_activity_method()`,
  `workflow.execute_activity_method()`, `workflow.start_local_activity_method()`, and
  `workflow.execute_local_activity_method()` instead.
* Activities can callable classes (i.e. that define `__call__`). Invokers should use `workflow.start_activity_class()`,
  `workflow.execute_activity_class()`, `workflow.start_local_activity_class()`, and
  `workflow.execute_local_activity_class()` instead.

#### Invoking Child Workflows

* Child workflows are started with async `workflow.start_child_workflow()` which accepts either a workflow run method
  reference or a string name. The arguments to the workflow are positional.
* A single argument to the child workflow is positional. Multiple arguments are not supported in the type-safe form of
  start/execute child workflow and must be supplied via the `args` keyword argument.
* Child workflow options are set as keyword arguments after the arguments. At least `id` must be provided.
* The `await` of the start does not complete until the start has been accepted by the server
* The result is a child workflow handle which is an `asyncio.Task` and supports basic task features. The handle also has
  some child info and supports signalling the child workflow
* An async `workflow.execute_child_workflow()` helper is provided which takes the same arguments as
  `workflow.start_child_workflow()` and `await`s on the result. This should be used in most cases unless advanced task
  capabilities are needed.

#### Timers

* A timer is represented by normal `asyncio.sleep()` or a `workflow.sleep()` call
* Timers are also implicitly started on any `asyncio` calls with timeouts (e.g. `asyncio.wait_for`)
* Timers are Temporal server timers, not local ones, so sub-second resolution rarely has value
* Calls that use a specific point in time, e.g. `call_at` or `timeout_at`, should be based on the current loop time
  (i.e. `workflow.time()`) and not an actual point in time. This is because fixed times are translated to relative ones
  by subtracting the current loop time which may not be the actual current time.

#### Conditions

* `workflow.wait_condition` is an async function that doesn't return until a provided callback returns true
* A `timeout` can optionally be provided which will throw a `asyncio.TimeoutError` if reached (internally backed by
  `asyncio.wait_for` which uses a timer)

#### Asyncio and Determinism

Workflows must be deterministic. Workflows are backed by a custom
[asyncio](https://docs.python.org/3/library/asyncio.html) event loop. This means many of the common `asyncio` calls work
as normal. Some asyncio features are disabled such as:

* Thread related calls such as `to_thread()`, `run_coroutine_threadsafe()`, `loop.run_in_executor()`, etc
* Calls that alter the event loop such as `loop.close()`, `loop.stop()`, `loop.run_forever()`,
  `loop.set_task_factory()`, etc
* Calls that use anything external such as networking, subprocesses, disk IO, etc

Also, there are some `asyncio` utilities that internally use `set()` which can make them non-deterministic from one
worker to the next. Therefore the following `asyncio` functions have `workflow`-module alternatives that are
deterministic:

* `asyncio.as_completed()` - use `workflow.as_completed()`
* `asyncio.wait()` - use `workflow.wait()`

#### Asyncio Cancellation

Cancellation is done using `asyncio` [task cancellation](https://docs.python.org/3/library/asyncio-task.html#task-cancellation).
This means that tasks are requested to be cancelled but can catch the
[`asyncio.CancelledError`](https://docs.python.org/3/library/asyncio-exceptions.html#asyncio.CancelledError), thus
allowing them to perform some cleanup before allowing the cancellation to proceed (i.e. re-raising the error), or to
deny the cancellation entirely. It also means that
[`asyncio.shield()`](https://docs.python.org/3/library/asyncio-task.html#shielding-from-cancellation) can be used to
protect tasks against cancellation.

The following tasks, when cancelled, perform a Temporal cancellation:

* Activities - when the task executing an activity is cancelled, a cancellation request may be sent to the activity
  depending on cancellation type
* Child workflows - when the task starting or executing a child workflow is cancelled, a cancellation request may be
  sent to cancel the child workflow depending on cancellation type
* Nexus operations - when the task starting or executing a Nexus operation is cancelled, a cancellation request may be
  sent to cancel the Nexus operation depending on cancellation type
* Timers - when the task executing a timer is cancelled (whether started via sleep or timeout), the timer is cancelled

When the workflow itself is requested to cancel, `Task.cancel` is called on the main workflow task. Therefore,
`asyncio.CancelledError` can be caught in order to handle the cancel gracefully.

Workflows follow `asyncio` cancellation rules exactly which can cause confusion among Python developers. Cancelling a
task doesn't always cancel the thing it created. For example, given
`task = asyncio.create_task(workflow.start_child_workflow(...`, calling `task.cancel` does not cancel the child
workflow, it only cancels the starting of it, which has no effect if it has already started. However, cancelling the
result of `handle = await workflow.start_child_workflow(...` or
`task = asyncio.create_task(workflow.execute_child_workflow(...` _does_ cancel the child workflow.

Also, due to Temporal rules, a cancellation request is a state not an event. Therefore, repeated cancellation requests
are not delivered, only the first. If the workflow chooses swallow a cancellation, it cannot be requested again.

#### Workflow Utilities

While running in a workflow, in addition to features documented elsewhere, the following items are available from the
`temporalio.workflow` package:

* `continue_as_new()` - Async function to stop the workflow immediately and continue as new
* `info()` - Returns information about the current workflow
* `logger` - A logger for use in a workflow (properly skips logging on replay)
* `now()` - Returns the "current time" from the workflow's perspective

#### Exceptions

* Workflows/updates can raise exceptions to fail the workflow or the "workflow task" (i.e. suspend the workflow
  in a retrying state).
* Exceptions that are instances of `temporalio.exceptions.FailureError` will fail the workflow with that exception
  * For failing the workflow explicitly with a user exception, use `temporalio.exceptions.ApplicationError`. This can
    be marked non-retryable or include details as needed.
  * Other exceptions that come from activity execution, child execution, cancellation, etc are already instances of
    `FailureError` and will fail the workflow when uncaught.
* Update handlers are special: an instance of `temporalio.exceptions.FailureError` raised in an update handler will fail
  the update instead of failing the workflow.
* All other exceptions fail the "workflow task" which means the workflow will continually retry until the workflow is
  fixed. This is helpful for bad code or other non-predictable exceptions. To actually fail the workflow, use an
  `ApplicationError` as mentioned above.

This default can be changed by providing a list of exception types to `workflow_failure_exception_types` when creating a
`Worker` or `failure_exception_types` on the `@workflow.defn` decorator. If a workflow-thrown exception is an instance
of any type in either list, it will fail the workflow (or update) instead of the workflow task. This means a value of
`[Exception]` will cause every exception to fail the workflow instead of the workflow task. Also, as a special case, if
`temporalio.workflow.NondeterminismError` (or any superclass of it) is set, non-deterministic exceptions will fail the
workflow. WARNING: These settings are experimental.

#### Signal and update handlers

Signal and update handlers are defined using decorated methods as shown in the example [above](#definition). Client code
sends signals and updates using `workflow_handle.signal`, `workflow_handle.execute_update`, or
`workflow_handle.start_update`. When the workflow receives one of these requests, it starts an `asyncio.Task` executing
the corresponding handler method with the argument(s) from the request.

The handler methods may be `async def` and can do all the async operations described above (e.g. invoking activities and
child workflows, and waiting on timers and conditions). Notice that this means that handler tasks will be executing
concurrently with respect to each other and the main workflow task. Use
[asyncio.Lock](https://docs.python.org/3/library/asyncio-sync.html#lock) and
[asyncio.Semaphore](https://docs.python.org/3/library/asyncio-sync.html#semaphore) if necessary.

Your main workflow task may finish as a result of successful completion, cancellation, continue-as-new, or failure. You
should ensure that all in-progress signal and update handler tasks have finished before this happens; if you do not, you
will see a warning (the warning can be disabled via the `workflow.signal`/`workflow.update` decorators). One way to
ensure that handler tasks have finished is to wait on the `workflow.all_handlers_finished` condition:
```python
await workflow.wait_condition(workflow.all_handlers_finished)
```
#### External Workflows

* `workflow.get_external_workflow_handle()` inside a workflow returns a handle to interact with another workflow
* `workflow.get_external_workflow_handle_for()` can be used instead for a type safe handle
* `await handle.signal()` can be called on the handle to signal the external workflow
* `await handle.cancel()` can be called on the handle to send a cancel to the external workflow

#### Testing

Workflow testing can be done in an integration-test fashion against a real server, however it is hard to simulate
timeouts and other long time-based code. Using the time-skipping workflow test environment can help there.

The time-skipping `temporalio.testing.WorkflowEnvironment` can be created via the static async `start_time_skipping()`.
This internally downloads the Temporal time-skipping test server to a temporary directory if it doesn't already exist,
then starts the test server which has special APIs for skipping time.

**NOTE:** The time-skipping test environment does not work on ARM. The SDK will try to download the x64 binary on macOS
for use with the Intel emulator, but for Linux or Windows ARM there is no proper time-skipping test server at this time.

##### Automatic Time Skipping

Anytime a workflow result is waited on, the time-skipping server automatically advances to the next event it can. To
manually advance time before waiting on the result of a workflow, the `WorkflowEnvironment.sleep` method can be used.

Here's a simple example of a workflow that sleeps for 24 hours:

```python
import asyncio
from temporalio import workflow

@workflow.defn
class WaitADayWorkflow:
    @workflow.run
    async def run(self) -> str:
        await asyncio.sleep(24 * 60 * 60)
        return "all done"
```

An integration test of this workflow would be way too slow. However the time-skipping server automatically skips to the
next event when we wait on the result. Here's a test for that workflow:

```python
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

async def test_wait_a_day_workflow():
    async with await WorkflowEnvironment.start_time_skipping() as env:
        async with Worker(env.client, task_queue="tq1", workflows=[WaitADayWorkflow]):
            assert "all done" == await env.client.execute_workflow(WaitADayWorkflow.run, id="wf1", task_queue="tq1")
```

That test will run almost instantly. This is because by calling `execute_workflow` on our client, we have asked the
environment to automatically skip time as much as it can (basically until the end of the workflow or until an activity
is run).

To disable automatic time-skipping while waiting for a workflow result, run code inside a
`with env.auto_time_skipping_disabled():` block.

##### Manual Time Skipping

Until a workflow is waited on, all time skipping in the time-skipping environment is done manually via
`WorkflowEnvironment.sleep`.

Here's workflow that waits for a signal or times out:

```python
import asyncio
from temporalio import workflow

@workflow.defn
class SignalWorkflow:
    def __init__(self) -> None:
        self.signal_received = False

    @workflow.run
    async def run(self) -> str:
        # Wait for signal or timeout in 45 seconds
        try:
            await workflow.wait_condition(lambda: self.signal_received, timeout=45)
            return "got signal"
        except asyncio.TimeoutError:
            return "got timeout"

    @workflow.signal
    def some_signal(self) -> None:
        self.signal_received = True
```

To test a normal signal, you might:

```python
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

async def test_signal_workflow():
    async with await WorkflowEnvironment.start_time_skipping() as env:
        async with Worker(env.client, task_queue="tq1", workflows=[SignalWorkflow]):
            # Start workflow, send signal, check result
            handle = await env.client.start_workflow(SignalWorkflow.run, id="wf1", task_queue="tq1")
            await handle.signal(SignalWorkflow.some_signal)
            assert "got signal" == await handle.result()
```

But how would you test the timeout part? Like so:

```python
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

async def test_signal_workflow_timeout():
    async with await WorkflowEnvironment.start_time_skipping() as env:
        async with Worker(env.client, task_queue="tq1", workflows=[SignalWorkflow]):
            # Start workflow, advance time past timeout, check result
            handle = await env.client.start_workflow(SignalWorkflow.run, id="wf1", task_queue="tq1")
            await env.sleep(50)
            assert "got timeout" == await handle.result()
```

Also, the current time of the workflow environment can be obtained via the async `WorkflowEnvironment.get_current_time`
method.

##### Mocking Activities

Activities are just functions decorated with `@activity.defn`. Simply write different ones and pass those to the worker
to have different activities called during the test.

#### Workflow Sandbox

By default workflows are run in a sandbox to help avoid non-deterministic code. If a call that is known to be
non-deterministic is performed, an exception will be thrown in the workflow which will "fail the task" which means the
workflow will not progress until fixed.

The sandbox is not foolproof and non-determinism can still occur. It is simply a best-effort way to catch bad code
early. Users are encouraged to define their workflows in files with no other side effects.

The sandbox offers a mechanism to "pass through" modules from outside the sandbox. By default this already includes all
standard library modules and Temporal modules. **For performance and behavior reasons, users are encouraged to pass
through all modules whose calls will be deterministic.** In particular, this advice extends to modules containing the
activities to be referenced in workflows, and modules containing dataclasses and Pydantic models, which can be
particularly expensive to import. See "Passthrough Modules" below on how to do this.


##### How the Sandbox Works

The sandbox is made up of two components that work closely together:

* Global state isolation
* Restrictions preventing known non-deterministic library calls

Global state isolation is performed by using `exec`. Upon workflow start, and every time that the workflow is replayed,
the file that the workflow is defined in is re-imported into a new sandbox created for that workflow run. In order to
keep the sandbox performant, not all modules are re-imported in this way: instead, a known set of "passthrough modules"
are obtained as references to the already-imported module _outside_ the sandbox. These modules should be side-effect
free on import and, if they make any non-deterministic calls, then these should be restricted by sandbox restriction
rules. By default the entire Python standard library, `temporalio`, and a couple of other modules are "passed through"
in this way from outside of the sandbox. To update this list, see "Customizing the Sandbox".

Restrictions preventing known non-deterministic library calls are achieved using proxy objects on modules wrapped around
the custom importer set in the sandbox. Many restrictions apply at workflow import time and workflow run time, while
some restrictions only apply at workflow run time. A default set of restrictions is included that prevents most
dangerous standard library calls. However it is known in Python that some otherwise-non-deterministic invocations, like
reading a file from disk via `open` or using `os.environ`, are done as part of importing modules. To customize what is
and isn't restricted, see "Customizing the Sandbox".

##### Avoiding the Sandbox

There are three increasingly-scoped ways to avoid the sandbox. Users are discouraged from avoiding the sandbox if
possible, except for passing through safe modules, which is recommended.

To remove restrictions around a particular block of code, use `with temporalio.workflow.unsafe.sandbox_unrestricted():`.
The workflow will still be running in the sandbox, but no restrictions for invalid library calls will be applied.

To run an entire workflow outside of a sandbox, set `sandboxed=False` on the `@workflow.defn` decorator when defining
it. This will run the entire workflow outside of the sandbox which means it can share global state and other bad
things.

To disable the sandbox entirely for a worker, set the `Worker` init's `workflow_runner` keyword argument to
`temporalio.worker.UnsandboxedWorkflowRunner()`. This value is defaulted to
`temporalio.worker.workflow_sandbox.SandboxedWorkflowRunner()` so by changing it to the unsandboxed runner, the sandbox
will not be used at all.

##### Customizing the Sandbox

⚠️ WARNING: APIs in the `temporalio.worker.workflow_sandbox` module are not yet considered stable and may change in
future releases.

When creating the `Worker`, the `workflow_runner` is defaulted to
`temporalio.worker.workflow_sandbox.SandboxedWorkflowRunner()`. The `SandboxedWorkflowRunner`'s init accepts a
`restrictions` keyword argument that is defaulted to `SandboxRestrictions.default`. The `SandboxRestrictions` dataclass
is immutable and contains three fields that can be customized, but only two have notable value. See below.

###### Passthrough Modules

By default the sandbox completely reloads non-standard-library and non-Temporal modules for every workflow run. To make
the sandbox quicker and use less memory when importing known-side-effect-free modules, they can be marked
as passthrough modules.

**For performance and behavior reasons, users are encouraged to pass through all third party modules whose calls will be
deterministic.** In particular, this advice extends to modules containing the activities to be referenced in workflows,
and modules containing dataclasses and Pydantic models, which can be particularly expensive to import.

One way to pass through a module is at import time in the workflow file using the `imports_passed_through` context
manager like so:

```python
# my_workflow_file.py

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    import pydantic

@workflow.defn
class MyWorkflow:
    ...
```

Alternatively, this can be done at worker creation time by customizing the runner's restrictions. For example:

```python
my_worker = Worker(
  ...,
  workflow_runner=SandboxedWorkflowRunner(
    restrictions=SandboxRestrictions.default.with_passthrough_modules("pydantic")
  )
)
```

In both of these cases, now the `pydantic` module will be passed through from outside of the sandbox instead of
being reloaded for every workflow run.

If users are sure that no imports they use in workflow files will ever need to be sandboxed (meaning all calls within
are deterministic and never mutate shared, global state), the `passthrough_all_modules` option can be set on the
restrictions or the `with_passthrough_all_modules` helper can by used, for example:

```python
my_worker = Worker(
  ...,
  workflow_runner=SandboxedWorkflowRunner(
    restrictions=SandboxRestrictions.default.with_passthrough_all_modules()
  )
)
```

Note, some calls from the module may still be checked for invalid calls at runtime for certain builtins.

###### Invalid Module Members

`SandboxRestrictions.invalid_module_members` contains a root matcher that applies to all module members. This already
has a default set which includes things like `datetime.date.today()` which should never be called from a workflow. To
remove this restriction:

```python
my_restrictions = dataclasses.replace(
    SandboxRestrictions.default,
    inv
