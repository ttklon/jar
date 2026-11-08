---
id: "npm:net-snmp"
kind: "npm"
category: "network-admin"
package: "net-snmp"
version: "3.29.2"
url: "https://www.npmjs.com/package/net-snmp"
homepage: "https://github.com/markabrahams/node-net-snmp#readme"
license: "MIT"
summary: "JavaScript implementation of the Simple Network Management Protocol (SNMP)"
fetched_at: "2026-11-08T12:43:21Z"
---

# npm: net-snmp@3.29.2

**Description:** JavaScript implementation of the Simple Network Management Protocol (SNMP)

**Homepage:** https://github.com/markabrahams/node-net-snmp#readme

**License:** MIT

## Dependencies

- asn1-ber@^1.2.1
- smart-buffer@^4.1.0

## Peer dependencies

- none

## README (from registry)

# net-snmp

This module implements versions 1, 2c and 3 of the [Simple Network Management
Protocol (SNMP)][SNMP].

*Read this in other languages: [English](README.md), [简体中文](README.cn.md).*

This module is installed using [node package manager (npm)][npm]:

```bash
npm install net-snmp
```

It is loaded using the `require()` function:

```js
var snmp = require ("net-snmp");
```

# Quick Start

Sessions to remote hosts can then be created and used to perform SNMP requests
and send SNMP traps or informs:

```js
var session = snmp.createSession ("127.0.0.1", "public");

var oids = ["1.3.6.1.2.1.1.5.0", "1.3.6.1.2.1.1.6.0"];

session.get (oids, function (error, varbinds) {
    if (error) {
        console.error (error);
    } else {
        for (var i = 0; i < varbinds.length; i++) {
            if (snmp.isVarbindError (varbinds[i])) {
                console.error (snmp.varbindError (varbinds[i]));
            } else {
                console.log (varbinds[i].oid + " = " + varbinds[i].value);
            }
        }
    }
    session.close ();
});

session.trap (snmp.TrapType.LinkDown, function (error) {
    if (error) {
        console.error (error);
    }
});
```

[SNMP]: http://en.wikipedia.org/wiki/Simple_Network_Management_Protocol "SNMP"
[npm]: https://npmjs.org/ "npm"

# Applications

RFC 3413 describes five types of SNMP applications:

 1. Command Generator Applications &mdash; which initiate read or write requests
 2. Command Responder Applications &mdash; which respond to received read or write requests
 3. Notification Originator Applications &mdash; which generate notifications (traps or informs)
 4. Notification Receiver Applications &mdash; which receive notifications (traps or informs)
 5. Proxy Forwarder Applications &mdash; which forward SNMP messages

This library provides support for all of the above applications, with the documentation
for each shown in this table:

| Application | Common Use | Documentation |
| ----------- | ---------- | ------------- |
| Command Generator | NMS / SNMP tools | [Application: Command & Notification Generator](#application-command--notification-generator) |
| Command Responder | SNMP agents | [Application: SNMP Agent](#application-snmp-agent) |
| Notification Originator | SNMP agents / NMS-to-NMS notifications | [Application: Command & Notification Generator](#application-command--notification-generator) |
| Notification Receiver | NMS | [Application: Notification Receiver](#application-notification-receiver) |
| Proxy Forwarder | SNMP agents | [Agent Forwarder Module](#agent-forwarder-module) |

# Features

 * Support for all SNMP versions: SNMPv1, SNMPv2c and SNMPv3
 * SNMPv3 message authentication using MD5 or SHA, and privacy using DES or AES encryption
 * Community-based and user-based authorization
 * SNMP initiator for all relevant protocol operations: Get, GetNext, GetBulk, Set, Trap, Inform
 * Convenience methods for MIB "walking", subtree collection, table and table column collection
 * SNMPv3 context support
 * Notification receiver for traps and informs
 * MIB parsing and MIB module store
 * Translation between numeric and named OIDs
 * SNMP agent with MIB management for both scalar and tabular data
 * Agent table index support for non-integer keys, foreign keys, composite keys and table augmentation
 * Agent support for "RowStatus" protocol-based creation and deletion of table rows
 * Agent support for these MIB constraints: MAX-ACCESS, integer ranges, string sizes, integer enumerations
 * SNMP proxy forwarder for agent
 * AgentX subagent
 * IPv4 and IPv6

# Standards Compliance

This module aims to be fully compliant with the following RFCs:

 * [1098][1098] - A Simple Network Management Protocol (version 1)
 * [1155][1155] - Structure and Identification of Management Information
 * [2571][2571] - Agent Extensibility (AgentX) Protocol Version 1
 * [2578][2578] - Structure of Management Information Version 2 (SMIv2)
 * [3413][3413] - Simple Network Management Protocol (SNMP) Applications
 * [3414][3414] - User-based Security Model (USM) for version 3 of the
 Simple Network Management Protocol (SNMPv3)
 * [3416][3416] - Version 2 of the Protocol Operations for the Simple
Network Management Protocol (SNMP)
 * [3417][3417] - Transport Mappings for the Simple Network Management
Protocol (SNMP)
 * [3826][3826] - The Advanced Encryption Standard (AES) Cipher Algorithm
in the SNMP User-based Security Model

[1155]: https://tools.ietf.org/rfc/rfc1155.txt "RFC 1155"
[1098]: https://tools.ietf.org/rfc/rfc1098.txt "RFC 1098"
[2571]: https://tools.ietf.org/rfc/rfc2578.txt "RFC 2571"
[2578]: https://tools.ietf.org/rfc/rfc2578.txt "RFC 2578"
[3413]: https://tools.ietf.org/rfc/rfc3413.txt "RFC 3413"
[3414]: https://tools.ietf.org/rfc/rfc3414.txt "RFC 3414"
[3416]: https://tools.ietf.org/rfc/rfc3416.txt "RFC 3416"
[3417]: https://tools.ietf.org/rfc/rfc3417.txt "RFC 3417"
[3826]: https://tools.ietf.org/rfc/rfc3826.txt "RFC 3826"

# Constants

The following sections describe constants exported and used by this module.

## snmp.Version1, snmp.Version2c, snmp.Version3

These constants are used to specify which of version supported by this module
should be used.

## snmp.ErrorStatus

This object contains constants for all valid values the error-status field in
response PDUs can hold.  If when parsing a PDU the error-index field contains
a value not defined in this object the constant `snmp.ErrorStatus.GeneralError`
will be used instead of the value in the error-status field.  The following
constants are defined in this object:

 * `NoError`
 * `TooBig`
 * `NoSuchName`
 * `BadValue`
 * `ReadOnly`
 * `GeneralError`
 * `NoAccess`
 * `WrongType`
 * `WrongLength`
 * `WrongEncoding`
 * `WrongValue`
 * `NoCreation`
 * `InconsistentValue`
 * `ResourceUnavailable`
 * `CommitFailed`
 * `UndoFailed`
 * `AuthorizationError`
 * `NotWritable`
 * `InconsistentName`

Only the first six of these - `NoError` through `GeneralError` - are defined by
SNMPv1.  The agent produces error statuses using the full SNMPv2 set regardless
of the version of the request, then translates them when responding to an
SNMPv1 request, using the mapping given in RFC 2089 section 2.1 (repeated in
RFC 3584 section 4.4).  So an SNMPv1 manager sees `NoSuchName` where an SNMPv2c
or SNMPv3 manager would see `NoAccess`, `NoCreation`, `NotWritable`,
`InconsistentName` or `AuthorizationError`; `BadValue` in place of `WrongType`,
`WrongLength`, `WrongEncoding`, `WrongValue` or `InconsistentValue`; and
`GeneralError` in place of `ResourceUnavailable`, `CommitFailed` or
`UndoFailed`.  `ReadOnly` is listed for completeness, since SNMPv1 defines it,
but no conformant agent generates it - see RFC 1908 section 3.1.2.

## snmp.ObjectType

This object contains constants used to specify syntax for varbind objects,
e.g.:

```js
var varbind = {
    oid: "1.3.6.1.2.1.1.4.0",
    type: snmp.ObjectType.OctetString,
    value: "user.name@domain.name"
};
```

The following constants are defined in this object:

 * `Boolean`
 * `Integer`
 * `OctetString`
 * `Null`
 * `OID`
 * `IpAddress`
 * `Counter`
 * `Gauge`
 * `TimeTicks`
 * `Opaque`
 * `Integer32`
 * `Counter32`
 * `Gauge32`
 * `Unsigned32`
 * `Counter64`
 * `NoSuchObject`
 * `NoSuchInstance`
 * `EndOfMibView`

## snmp.TrapType

This object contains constants used to specify a type of SNMP trap.  These
constants are passed to the `trap()` and `inform()` methods exposed by the
`Session` class.  The following constants are defined in this object:

 * `ColdStart`
 * `WarmStart`
 * `LinkDown`
 * `LinkUp`
 * `AuthenticationFailure`
 * `EgpNeighborLoss`
 * `EnterpriseSpecific`

## snmp.PduType

This object contains constants used to identify the SNMP PDU types specified
in RFC 3416.  The values, along with their numeric codes, are:

 * `160 - GetRequest`
 * `161 - GetNextRequest`
 * `162 - GetResponse`
 * `163 - SetRequest`
 * `164 - Trap`
 * `165 - GetBulkRequest`
 * `166 - InformRequest`
 * `167 - TrapV2`
 * `168 - Report`

## snmp.SecurityLevel

This object contains constants to specify the security of an SNMPv3 message as per
RFC 3414:
 * `noAuthNoPriv` - for no message authentication or encryption
 * `authNoPriv` - for message authentication and no encryption
 * `authPriv` - for message authentication and encryption

## snmp.AuthProtocols

This object contains constants to select a supported digest algorithm for SNMPv3
messages that require authentication:
 * `md5` - for HMAC-MD5 message authentication
 * `sha` - for HMAC-SHA-1 message authentication
 * `sha224` - for HMAC-SHA-224 message authentication
 * `sha256` - for HMAC-SHA-256 message authentication
 * `sha384` - for HMAC-SHA-384 message authentication
 * `sha512` - for HMAC-SHA-512 message authentication

MD5 and SHA (actually SHA-1) are the hash algorithms specified in the original
SNMPv3 User-Based Security Model RFC (RFC 3414); the other four were added later
in RFC 7860.

## snmp.PrivProtocols

This object contains constants to select a supported encryption algorithm for
SNMPv3 messages that require privacy:
 * `des` - for DES encryption (CBC-DES)
 * `aes` - for 128-bit AES encryption (CFB-AES-128)
 * `aes256b` - for 256-bit AES encryption (CFB-AES-256) with "Blumenthal" key localization
 * `aes256r` - for 256-bit AES encryption (CFB-AES-256) with "Reeder" key localization

DES is the sole encryption algorithm specified in the original SNMPv3 User-Based
Security Model RFC (RFC 3414); 128-bit AES for SNMPv3 was added later in RFC 3826.
256-bit AES has *not* been standardized, and as such comes with two varieties of key
localization.  Cisco and a number of other vendors commonly use the "Reeder" key
localization variant.  Other encryption algorithms are not supported.

### Compatibility note on DES and recent Node.js versions

When using SNMPv3 with DES as the privacy protocol (`snmp.PrivProtocols.des`) on Node.js v17 or later, you may encounter the following error:

```
"error": {
        "library": "digital envelope routines",
        "reason": "unsupported",
        "code": "ERR_OSSL_EVP_UNSUPPORTED",
        "message": "error:0308010C:digital envelope routines::unsupported",
        "stack": ["Error: error:0308010C:digital envelope routines::unsupported",
           "at Cipheriv.createCipherBase (node:internal/crypto/cipher:121:19)",
        ...
}
```

This occurs because newer versions of Node.js have deprecated support for the DES algorithm in OpenSSL for security reasons. 

**Workaround:**
If you need to communicate with legacy devices that only support DES for SNMPv3, you can run Node.js with the `--openssl-legacy-provider` flag:

```bash
node --openssl-legacy-provider your-app.js
```

Whenever possible, it's recommended to use more secure encryption methods like AES (`snmp.PrivProtocols.aes`) instead of DES.


## snmp.AgentXPduType

The Agent Extensibility (AgentX) Protocol specifies these PDUs in RFC 2741:
 * `1 - Open`
 * `2 - Close`
 * `3 - Register`
 * `4 - Unregister`
 * `5 - Get`
 * `6 - GetNext`
 * `7 - GetBulk`
 * `8 - TestSet`
 * `9 - CommitSet`
 * `10 - UndoSet`
 * `11 - CleanupSet`
 * `12 - Notify`
 * `13 - Ping`
 * `14 - IndexAllocate`
 * `15 - IndexDeallocate`
 * `16 - AddAgentCaps`
 * `17 - RemoveAgentCaps`
 * `18 - Response`

## snmp.AccessControlModelType

 * `None` - no access control for defined communities and users
 * `Simple` - simple access control of levels "read-only" or "read-write" for defined communites and users

## snmp.AccessLevel

- `None` - no access granted to the community or user
- `ReadOnly` - read-only access granted to the community or user
- `ReadWrite` - read-write access granted to the community or user

## snmp.MaxAccess
- `0 - not-accessible`
- `1 - accessible-for-notify`
- `2 - read-only`
- `3 - read-write`
- `4 - read-create`

## snmp.RowStatus
Status values
- `1 - active`
- `2 - notInService`
- `3 - notReady`

Actions
- `4 - createAndGo`
- `5 - createAndWait`
- `6 - destroy`

## snmp.ResponseInvalidCode
- `1 -  EIp4AddressSize`
- `2 -  EUnknownObjectType`
- `3 -  EUnknownPduType`
- `4 -  ECouldNotDecrypt`
- `5 -  EAuthFailure`
- `6 -  EReqResOidNoMatch`
- `7 -  (no longer used)`
- `8 -  EOutOfOrder`
- `9 -  EVersionNoMatch`
- `10 -  ECommunityNoMatch`
- `11 -  EUnexpectedReport`
- `12 -  EResponseNotHandled`
- `13 -  EUnexpectedResponse`
- `14 -  ENotInTimeWindow`

## snmp.OidFormat
- `oid - oid`
- `path - path`
- `module - module`

# OID Strings & Varbinds

Some parts of this module accept simple OID strings, e.g.:

```js
var oid = "1.3.6.1.2.1.1.5.0";
```

Other parts take an OID string, it's type and value.  This is collectively
referred to as a varbind, and is specified as an object, e.g.:

```js
var varbind = {
    oid: "1.3.6.1.2.1.1.5.0",
    type: snmp.ObjectType.OctetString,
    value: new Buffer ("host1")
};
```

The `type` parameter is one of the constants defined in the `snmp.ObjectType`
object.

The JavaScript `true` and `false` keywords are used for the values of varbinds
with type `Boolean`.

All integer based types are specified as expected (this includes `Integer`,
`Counter`, `Gauge`, `TimeTicks`, `Integer32`, `Counter32`, `Gauge32`, and
`Unsigned32`), e.g. `-128` or `100`.

Since JavaScript does not offer full 64 bit integer support objects with type
`Counter64` cannot be supported in the same way as other integer types,
instead [Node.js][nodejs] `Buffer` objects are used.  Users are responsible for
producing (i.e. for `set()` requests) and consuming (i.e. the varbinds passed
to callback functions) `Buffer` objects.  That is, this module does not work
with 64 bit integers, it simply treats them as opaque `Buffer` objects.

Dotted decimal strings are used for the values of varbinds with type `OID`,
e.g. `1.3.6.1.2.1.1.5.0`.

Dotted quad formatted strings are used for the values of varbinds with type
`IpAddress`, e.g. `192.168.1.1`.

[Node.js][nodejs] `Buffer` objects are used for the values of varbinds with
type `Opaque` and `OctetString`.  For varbinds with type `OctetString` this
module will accept JavaScript strings, but will always give back `Buffer`
objects.

The `NoSuchObject`, `NoSuchInstance` and `EndOfMibView` types are used to
indicate an error condition.  Currently there is no reason for users of this
module to to build varbinds using these types.

[nodejs]: http://nodejs.org "Node.js"

# Callback Functions & Error Handling

Most of the request methods exposed by this module require a mandatory
callback function.  This function is called once a request has been processed.
This could be because an error occurred when processing the request, a trap
has been dispatched or a successful response was received.

The first parameter to every callback is an error object.  In the case no
error occurred this parameter will be "null" indicating no error, e.g.:

```js
function responseCb (error, varbinds) {
    if (error) {
        console.error (error);
    } else {
        // no error, do something with varbinds
    }
}
```

When defined, the `error` parameter is always an instance of the `Error` class,
or a sub-class described in one of the sub-sections contained in this section.

The semantics of error handling is slightly different between SNMP version
1 and subsequent versions 2c and 3.  In SNMP version 1 if an error occurs when
calculating the value for one OID the request as a whole will fail, i.e. no
OIDs will have a value.

This failure manifests itself within the error-status and error-index fields
of the response.  When the error-status field in the response is non-zero,
i.e. not `snmp.ErrorStatus.NoError` the `callback` will be called with `error`
defined detailing the error.

Requests made with SNMP version 1 can simply assume all OIDs have a value when
no error object is passed to the `callback`, i.e.:

```js
var oids = ["1.3.6.1.2.1.1.5.0", "1.3.6.1.2.1.1.6.0"];

session.get (oids, function (error, varbinds) {
    if (error) {
        console.error (error.toString ());
    } else {
        var sysName = varbinds[0].value; // this WILL have a value
    }
});
```

In SNMP versions 2c and 3, instead of using the error-status and error-index
fields of the response to signal an error, the value for the varbind placed in the
response for an OID will have an object syntax describing an error.  The
error-status and error-index fields of the response will indicate the request
was successul, i.e. `snmp.ErrorStatus.NoError`.

This changes the way in which error checking is performed in the `callback`.
When using SNMP version 2c each varbind must be checked to see if its value
was computed and returned successfully:

```js
var oids = ["1.3.6.1.2.1.1.5.0", "1.3.6.1.2.1.1.6.0"];

session.get (oids, function (error, varbinds) {
    if (error) {
        console.error (error.toString ());
    } else {
        if (varbinds[0].type != snmp.ErrorStatus.NoSuchObject
                && varbinds[0].type != snmp.ErrorStatus.NoSuchInstance
                && varbinds[0].type != snmp.ErrorStatus.EndOfMibView) {
            var sysName = varbinds[0].value;
        } else {
            console.error (snmp.ObjectType[varbinds[0].type] + ": "
                    + varbinds[0].oid);
        }
    }
});
```

This module exports two functions and promotes a specifc pattern to make error
checking a little simpler.  Firstly, regardless of version in use varbinds can
always be checked.  This results in a generic `callback` that can be used for
both versions.

The `isVarbindError()` function can be used to determine if a varbind has an
error condition.  This function takes a single `varbind` parameter and returns
`true` if the varbind has an error condition, otherwise `false`.  The exported
`varbindError()` function can then be used to obtain the error string
describing the error, which will include the OID for the varbind:

```js
session.get (oids, function (error, varbinds) {
    if (error) {
        console.error (error.toString ());
    } else {
        if (snmp.isVarbindError (varbinds[0])) {
            console.error (snmp.varbindError (varbinds[0]));
        } else {
            var sysName = varbinds[0].value;
        }
    }
});
```

If the `varbindError` function is called with a varbind for which
`isVarbindError` would return false, the string `NotAnError` will be returned
appended with the related OID.

The sections following defines the error classes used by this module.

## snmp.RequestFailedError

This error indicates a remote host failed to process a request.  The exposed
`message` attribute will contain a detailed error message.  This error also
exposes a `status` attribute which contains the error-index value from a
response.  This will be one of the constants defined in the
`snmp.ErrorStatus` object.

## snmp.RequestInvalidError

This error indicates a failure to render a request message before it could be
sent.  The error can also indicate that a parameter provided was invalid.
The exposed `message` attribute will contain a detailed error message.

## snmp.RequestTimedOutError

This error states that no response was received for a particular request.  The
exposed `message` attribute will contain the value `Request timed out`.

## snmp.ResponseInvalidError

This error indicates a failure to parse a response message. The
exposed `message` attribute will contain a detailed error message, and
as a sub-class of Error, its `toString()` method will yield that
`message` attribute.

An error of this class will always additionally include a `code`
attribute (one of the values in `ResponseInvalidCode`); and in some
cases, also have an `info` attribute which provides `code`-specific
supplemental information. An authentication error, for example -- code
`ResponseInvalidCode.EAuthFailure` -- will contain a map in `info`
with the attempted authentication data which failed to authenticate.

## snmp.ProcessingError

If a receiver or an agent receives a packet it is unable to decode,
then it will produce a `ProcessingError` containing:
* `rinfo` information on the origin of the packet,
* a `buffer` containing the packet contents, and
* an `error` containing the original error encountered during processing.

# Application: Command & Notification Generator

This library provides a `Session` class to provide support for building
"Command Generator" and "Notification Originator" SNMP applications.

All SNMP requests are made using an instance of the `Session` class.  This
module exports two functions that are used to create instances of the
`Session` class:

 * `createSession()` - for v1 and v2c sessions
 * `createV3Session()` - for v3 sessions

## snmp.createSession ([target], [community], [options])

The `createSession()` function instantiates and returns an instance of the
`Session` class for SNMPv1 or SNMPv2c:

```js
// Default options
var options = {
    port: 161,
    retries: 1,
    timeout: 5000,
    backoff: 1.0,
    transport: "udp4",
    trapPort: 162,
    version: snmp.Version1,
    backwardsGetNexts: true,
    reportOidMismatchErrors: false,
    idBitsSize: 32,
    dgramModule: dgram,
    strictIntRangeChecks: false
};

var session = snmp.createSession ("127.0.0.1", "public", options);
```

The optional `target` parameter defaults to `127.0.0.1`.  The optional
`community` parameter defaults to `public`.  The optional `options` parameter
is an object, and can contain the following items:

 * `port` - UDP port to send requests too, defaults to `161`
 * `retries` - Number of times to re-send a request, defaults to `1`
 * `sourceAddress` - IP address from which SNMP requests should originate,
   there is no default for this option, the operating system will select an
   appropriate source address when the SNMP request is sent
 * `sourcePort` - UDP port from which SNMP requests should originate, defaults
   to an ephemeral port selected by the operation system
 * `timeout` - Number of milliseconds to wait for a response before re-trying
   or failing, defaults to `5000`
 * `backoff` - The factor by which to increase the `timeout` for every retry, defaults to `1` for
   no increase
 * `transport` - Specify the transport to use, can be either `udp4` or `udp6`,
   defaults to `udp4`
 * `trapPort` - UDP port to send traps and informs too, defaults to `162`
 * `version` - Either `snmp.Version1` or `snmp.Version2c`, defaults to
   `snmp.Version1`
 * `backwardsGetNexts` - boolean to allow GetNext operations to retrieve lexicographically
   preceding OIDs, defaults to `true`
 * `reportOidMismatchErrors` - boolean to allow error reporting of OID mismatches between
   requests and responses, defaults to `false`
 * `idBitsSize` - Either `16` or `32`, defaults to `32`.  Used to reduce the size
    of the generated id for compatibility with some older devices.
 * `dgramModule` – A module that is interface-compatible with the Node.js [`dgram`](https://nodejs.org/api/dgram.html) module.
    This can be used to extend or override the default UDP socket behavior by supplying
    a custom or wrapped implementation of `dgram`.
 * `strictIntRangeChecks` - boolean to enable min/max range checks in `readInt32` and `readUint32`.
   When set to `true`, out-of-range values will throw, otherwise they will be logged via debug if `debug` is enabled.
   Note that the option is toggled at module level when a session is created. If you create multiple sessions 
   with conflicting settings, the most recently created session’s setting will apply process-wide.
         

When a session has been finished with it should be closed:

```js
session.close ();
```

## snmp.createV3Session (target, user, [options])

The `createV3Session()` function instantiates and returns an instance of the
same `Session` class as `createSession()`, only instead initialized for SNMPv3:

```js
// Default options for v3
var options = {
    port: 161,
    retries: 1,
    timeout: 5000,
    transport: "udp4",
    trapPort: 162,
    version: snmp.Version3,
    engineID: "8000B98380XXXXXXXXXXXXXXXXXXXXXXXX", // where the X's are random hex digits
    backwardsGetNexts: true,
    reportOidMismatchErrors: false,
    idBitsSize: 32,
    context: "",
    strictIntRangeChecks: false
};

// Example user
var user = {
    name: "blinkybill",
    level: snmp.SecurityLevel.authPriv,
    authProtocol: snmp.AuthProtocols.sha,
    authKey: "madeahash",
    privProtocol: snmp.PrivProtocols.des,
    privKey: "privycouncil"
};

var session = snmp.createV3Session ("127.0.0.1", user, options);
```

The `target` and `user` parameters are mandatory.  The optional `options` parameter
has the same meaning as for the `createSession()` call.  The one additional field
in the options parameter is the `context` field, which adds an SNMPv3 context to
the session.

The `user` object must contain a `name` and `level` field.  The `level` field can
take these values from the `snmp.SecurityLevel` object:
 * `snmp.SecurityLevel.noAuthNoPriv` - for no message authentication or encryption
 * `snmp.SecurityLevel.authNoPriv` - for message authentication and no encryption
 * `snmp.SecurityLevel.authPriv` - for message authentication and encryption

The meaning of these are as per RFC3414.  If the `level` supplied is `authNoPriv` or
`authPriv`, then the `authProtocol` and `authKey` fields must also be present.  The
`authProtocol` field can take values from the `snmp.AuthProtocols` object:
 * `snmp.AuthProtocols.md5` - for MD5 message authentication
 * `snmp.AuthProtocols.sha` - for SHA message authentication

If the `level` supplied is `authPriv`, then the `privProtocol` and `privKey` fields
must also be present.  The `privProtocol` field can take values from the
`snmp.PrivProtocols` object:
 * `snmp.PrivProtocols.des` - for DES encryption
 * `snmp.PrivProtocols.aes` - for AES encryption

Once a v3 session is created, the same set of `session` methods are available as
for v1 and v2c.

## session.on ("close", callback)

The `close` event is emitted by the session when the session's underlying UDP
socket is closed.

No arguments are passed to the callback.

Before this event is emitted all outstanding requests are cancelled, resulting
in the failure of each outstanding request.  The error passed back through to
each request will be an instance of the `Error` class with the errors
`message` attribute set to `Socket forcibly closed`.

The following example prints a message to the console when a session's
underlying UDP socket is closed:

```js
session.on ("close", function () {
    console.log ("socket closed");
});
```

## session.on ("error", callback)

The `error` event is emitted by the session when the session's underlying UDP
socket emits an error.

The following arguments will be passed to the `callback` function:

 * `error` - An instance of the `Error` class, the exposed `message` attribute
   will contain a detailed error message.

The following example prints a message to the console when an error occurs
with a session's underlying UDP socket, the session is then closed:

```js
session.on ("error", function (error) {
    console.log (error.toString ());
    session.close ();
});
```

## session.close ()

The `close()` method closes the sessions underlying UDP socket.  This will
result in the `close` event being emitted by the sessions underlying UDP
socket which is passed through to the session, resulting in the session also
emitting a `close` event.

The following example closes a sessions underlying UDP socket:

```js
session.close ();
```

## session.get (oids, callback)

The `get()` method fetches the value for one or more OIDs.

The `oids` parameter is an array of OID strings.  The `callback` function is
called once the request is complete.  The following arguments will be passed
to the `callback` function:

 * `error` - Instance of the `Error` class or a sub-class, or `null` if no
   error occurred
 * `varbinds` - Array of varbinds, will not be provided if an error occurred

The varbind in position N in the `varbinds` array will correspond to the OID
in position N in the `oids` array in the request.

Each varbind must be checked for an error condition using the
`snmp.isVarbindError()` function when using SNMP version 2c.

The following example fetches values for the sysName (`1.3.6.1.2.1.1.5.0`) and
sysLocation (`1.3.6.1.2.1.1.6.0`) OIDs:

```js
var oids = ["1.3.6.1.2.1.1.5.0", "1.3.6.1.2.1.1.6.0"];

session.get (oids, function (error, varbinds) {
    if (error) {
        console.error (error.toString ());
    } else {
        for (var i = 0; i < varbinds.length; i++) {
            // for version 1 we can assume all OIDs were successful
            console.log (varbinds[i].oid + "|" + varbinds[i].value);
        
            // for version 2c we must check each OID for an error condition
            if (snmp.isVarbindError (varbinds[i]))
                console.error (snmp.varbindError (varbinds[i]));
            else
                console.log (varbinds[i].oid + "|" + varbinds[i].value);
        }
    }
});
```

## session.getBulk (oids, [nonRepeaters], [maxRepetitions], callback)

The `getBulk()` method fetches the value for the OIDs lexicographically
following one or more OIDs in the MIB tree.

The `oids` parameter is an array of OID strings.  The optional `nonRepeaters`
parameter specifies the number of OIDs in the `oids` parameter for which only
1 varbind should be returned, and defaults to `0`.  For each remaining OID
in the `oids` parameter the optional `maxRepetitions` parameter specifies how
many OIDs lexicographically following an OID for which varbinds should be
fetched, and defaults to `20`.

The `callback` function is called once the request is complete.  The following
arguments will be passed to the `callback` function:

 * `error` - Instance of the `Error` class or a sub-class, or `null` if no
   error occurred
 * `varbinds` - Array of varbinds, will not be provided if an error occurred

The varbind in position N in the `varbinds` array will correspond to the OID
in position N in the `oids` array in the request.

For for the first `nonRepeaters` items in `varbinds` each item will be a
single varbind.  For all remaining items in `varbinds` each item will be an
array of varbinds - this makes it easy to tie response varbinds with requested
OIDs since response varbinds are grouped and placed in the same position in
`varbinds`.

Each varbind must be checked for an error condition using the
`snmp.isVarbindError()` function when using SNMP version 2c.

The following example fetches values for the OIDs following the sysContact
(`1.3.6.1.2.1.1.4.0`) and sysName (`1.3.6.1.2.1.1.5.0`) OIDs, and up to the
first 20 OIDs in the ifDescr (`1.3.6.1.2.1.2.2.1.2`) and ifType
(`1.3.6.1.2.1.2.2.1.3`) columns from the ifTable (`1.3.6.1.2.1.2.2`) table:

```js
var oids = [
    "1.3.6.1.2.1.1.4.0",
    "1.3.6.1.2.1.1.5.0",
    "1.3.6.1.2.1.2.2.1.2",
    "1.3.6.1.2.1.2.2.1.3"
];

var nonRepeaters = 2;

session.getBulk (oids, nonRepeaters, function (error, varbinds) {
    if (error) {
        console.error (error.toString ());
    } else {
        // step through the non-repeaters which are single varbinds
        for (var i = 0; i < nonRepeaters; i++) {
            if (i >= varbinds.length)
                break;

            if (snmp.isVarbindError (varbinds[i]))
                console.error (snmp.varbindError (varbinds[i]));
            else
                console.log (varbinds[i].oid + "|" + varbinds[i].value);
        }

        // then step through the repeaters which are varbind arrays
        for (var i = nonRepeaters; i < varbinds.length; i++) {
            for (var j = 0; j < varbinds[i].length; j++) {
                if (snmp.isVarbindError (varbinds[i][j]))
                    console.error (snmp.varbindError (varbinds[i][j]));
                else
                    console.log (varbinds[i][j].oid + "|"
                    		+ varbinds[i][j].value);
            }
        }
    }
});
```

## session.getNext (oids, callback)

The `getNext()` method fetches the value for the OIDs lexicographically
following one or more OIDs in the MIB tree.

The `oids` parameter is an array of OID strings.  The `callback` function is
called once the request is complete.  The following arguments will be passed
to the `callback` function:

 * `error` - Instance of the `Error` class or a sub-class, or `null` if no
   error occurred
 * `varbinds` - Array of varbinds, will not be provided if an error occurred

The varbind in position N in the `varbinds` array will correspond to the OID
in position N in the `oids` array in the request.

Each varbind must be checked for an error condition using the
`snmp.isVarbindError()` function when using SNMP version 2c.

The following example fetches values for the next OIDs following the
sysObjectID (`1.3.6.1.2.1.1.1.0`) and sysName (`1.3.6.1.2.1.1.4.0`) OIDs:

```js
var oids = [
    "1.3.6.1.2.1.1.1.0",
    "1.3.6.1.2.1.1.4.0"
];

session.getNext (oids, function (error, varbinds) {
    if (error) {
        console.error (error.toString ());
    } else {
        for (var i = 0; i < varbinds.length; i++) {
            // for version 1 we can assume all OIDs were successful
            console.log (varbinds[i].oid + "|" + varbinds[i].value);
        
            // for version 2c we must check each OID for an error condition
            if (snmp.isVarbindError (varbinds[i]))
                console.error (snmp.varbindError (varbinds[i]));
            else
                console.log (varbinds[i].oid + "|" + varbinds[i].value);
        }
    }
});
```

## session.inform (typeOrOid, [varbinds], [options], callback)

The `inform()` method sends a SNMP inform.

The `typeOrOid` parameter can be one of two types; one of the constants
defined in the `snmp.TrapType` object (excluding the
`snmp.TrapType.EnterpriseSpecific` constant), or an OID string.

The first varbind to be placed in the request message will be for the
`sysUptime.0` OID (`1.3.6.1.2.1.1.3.0`).  The value for this varbind will
be the value returned by the `process.uptime ()` function multiplied by 100
(this can be overridden by providing `upTime` in the optional `options`
parameter, as documented below).

This will be followed by a second varbind for the `snmpTrapOID.0` OID
(`1.3.6.1.6.3.1.1.4.1.0`).  The value for this will depend on the `typeOrOid`
parameter. If a constant is specified the trap OID for the constant will be
used as supplied for the varbinds value, otherwise the OID string specified
will be used as is for the value of the varbind.

The optional `varbinds` parameter is an array of varbinds to include in the
inform request, and defaults to the empty array `[]`.

The optional `options` parameter is an object, and can contain the following
items:

 * `upTime` - Value of the `sysUptime.0` OID (`1.3.6.1.2.1.1.3.0`) in the
   inform, defaults to the value returned by the `process.uptime ()` function
   multiplied by 100

The `callback` function is called once a response to the inform request has
been received, or an error occurred.  The following arguments will be passed
to the `callback` function:

 * `error` - Instance of the `Error` class or a sub-class, or `null` if no
   error occurred
 * `varbinds` - Array of varbinds, will not be provided if an error occurred

The varbind in position N in the `varbinds` array will correspond to the
varbind in position N in the `varbinds` array in the request.  The remote host
should echo back varbinds and their values as specified in the request, and
the `varbinds` array will contain each varbind as sent back by the remote host.

Normally there is no reason to use the contents of the `varbinds` parameter
since the varbinds are as they were sent in the request.

The following example sends a generic cold-start inform to a remote host,
it does not include any varbinds:

```js
session.inform (snmp.TrapType.ColdStart, function (error) {
    if (error)
        console.error (error);
});
```

The following example sends an enterprise specific inform to a remote host,
and includes two enterprise specific varbinds:

```js
var informOid = "1.3.6.1.4.1.2000.1";

var varbinds = [
    {
        oid: "1.3.6.1.4.1.2000.2",
        type: snmp.ObjectType.OctetString,
        value: "Periodic hardware self-check"
    },
    {
        oid: "1.3.6.1.4.1.2000.3",
        type: snmp.ObjectType.OctetString,
        value: "hardware-ok"
    }
];

// Override sysUpTime, specfiying it as 10 seconds...
var options = {upTime: 1000};
session.inform (informOid, varbinds, options, function (error) {
    if (error)
        console.error (error);
});
```

## session.set (varbinds, callback)

The `set()` method sets the value of one or more OIDs.

The `varbinds` parameter is an array of varbind objects. The `callback`
function is called once the request is complete.  The following arguments will
be passed to the `callback` function:

 * `error` - Instance of the `Error` class or a sub-class, or `null` if no
   error occurred
 * `varbinds` - Array of varbinds, will not be provided if an error occurred

The varbind in position N in the `varbinds` array will correspond to the
varbind in position N in the `varbinds` array in the request.  The remote host
should echo back varbinds and their values as specified in the request unless
an error occurred.  The `varbinds` array will contain each varbind as sent
back by the remote host.

Each varbind must be checked for an error condition using the
`snmp.isVarbindError()` function when using SNMP version 2c.

The following example sets the value of the sysName (`1.3.6.1.2.1.1.4.0`) and
sysLocation (`1.3.6.1.2.1.1.6.0`) OIDs:

```js
var varbinds = [
    {
        oid: "1.3.6.1.2.1.1.5.0",
        type: snmp.ObjectType.OctetString,
        value: "host1"
    }, {
        oid: "1.3.6.1.2.1.1.6.0",
        type: snmp.ObjectType.OctetString,
        value: "somewhere"
    }
];

session.set (varbinds, function (error, varbinds) {
    if (error) {
        console.error (error.toString ());
    } else {
        for (var i = 0; i < varbinds.length; i++) {
            // for version 1 we can assume all OIDs were successful
            console.log (varbinds[i].oid + "|" + varbinds[i].value);
        
            // for version 2c we must check each OID for an error condition
            if (snmp.isVarbindError (varbinds[i]))
                console.error (snmp.varbindError (varbinds[i]));
            else
                console.log (varbinds[i].oid + "|" + varbinds[i].value);
        }
    }
});
```

## session.subtree (oid, [maxRepetitions], feedCallback, doneCallback)

The `subtree()` method fetches the value for all OIDs lexicographically
following a specified OID in the MIB tree which have the specified OID as
their base.  For example, the OIDs sysName (`1.3.6.1.2.1.1.5.0`) and
sysLocation (`1.3.6.1.2.1.1.6.0`) both have the same base system
(`1.3.6.1.2.1.1`) OID.

For SNMP version 1 repeated `get()` calls are made until the one of the
returned OIDs does not use the specified OID as its base.  For SNMP version
2c repeated `getBulk()` calls are made until the one of the returned OIDs
does no used the specified OID as its base.

The `oid` parameter is an OID string.  The optional `maxRepetitions` parameter
is passed to `getBulk()` requests when SNMP version 2c is being used.

This method will not call a single callback once all OID values are fetched.
Instead the `feedCallback` function will be called each time a response is
received from the remote host.  The following arguments will be passed to the
`feedCallback` function:

 * `varbinds` - Array of varbinds, and will contain at least one varbind

Each varbind must be checked for an error condition using the
`snmp.isVarbindError()` function when using SNMP version 2c.

Once at least one of the returned OIDs does not use the specified OID as its
base, or an error has occurred, the `doneCallback` function will be called.
The following arguments will be passed to the `doneCallback` function:

 * `error` - Instance of the `Error` class or a sub-class, or `null` if no
   error occurred

Once the `doneCallback` function has been called the request is complete and
the `feedCallback` function will no longer be called.

If the `feedCallback` function returns a `true` value when called no more
`get()` or `getBulk()` method calls will be made and the `doneCallback` will
be called.

The following example fetches all OIDS under the system (`1.3.6.1.2.1.1`) OID:

```js
var oid = "1.3.6.1.2.1.1";

function doneCb (error) {
    if (error)
        console.error (error.toString ());
}

function feedCb (varbinds) {
    for (var i = 0; i < varbinds.length; i++) {
        if (snmp.isVarbindError (varbinds[i]))
            console.error (snmp.varbindError (varbinds[i]));
        else
            console.log (varbinds[i].oid + "|" + varbinds[i].value);
    }
}

var maxRepetitions = 20;

// The maxRepetitions argument is optional, and will be ignored unless using
// SNMP verison 2c
session.subtree (oid, maxRepetitions, feedCb, doneCb);
```

## session.table (oid, [maxRepetitions], callback)

The `table()` method fetches the value for all OIDs lexicographically
following a specified OID in the MIB tree which have the specified OID as
their base, much like the `subtree()` method.

This method is designed to fetch conceptual tables, for example the ifTable
(`1.3.6.1.2.1.2.2`) table.  The values for returned varbinds will be structured
into objects to represent conceptual rows.  Each row is then placed into an
object with the rows index being the key, e.g.:

```js
var table = {
    // Rows keyed by ifIndex (1 and 2 are shown)
    1: {
        // ifDescr (column 2) and ifType (columnd 3) are shown
        2: "interface-1",
        3: 6,
        ...
    },
    2: {
        2: "interface-2",
        3: 6,
        ...
    },
    ...
}
```

Internally this method calls the `subtree()` method to obtain the subtree of
the specified table.

The `oid` parameter is an OID string.  If an OID string is passed which does
not represent a table the resulting object produced to hold table data will be
empty, i.e. it will contain no indexes and rows.  The optional
`maxRepetitions` parameter is passed to the `subtree()` request.

The `callback` function will be called once the entire table has been fetched.
The following arguments will be passed to the `callback` function:

 * `error` - Instance of the `Error` class or a sub-class, or `null` if no
   error occurred
 * `table` - Object containing object references representing conceptual
   rows keyed by index (e.g. for the ifTable table rows are keyed by ifIndex),
   each row object will contain values keyed by column number, will not be
   provided if an error occurred

If an error occurs with any varbind returned by `subtree()` no table will be
passed to the `callback` function.  The reason for failure, and the related
OID string (as returned from a call to the `snmp.varbindError()` function),
will be passed to the `callback` function in the `error` argument as an
instance of the `RequestFailedError` class.

The following example fetches the ifTable (`1.3.6.1.2.1.2.2`) table:

```js
var oid = "1.3.6.1.2.1.2.2";

function sortInt (a, b) {
    if (a > b)
        return 1;
    else if (b > a)
        return -1;
    else
        return 0;
}

function responseCb (error, table) {
    if (error) {
        console.error (error.toString ());
    } else {
        // This code is purely used to print rows out in index order,
        // ifIndex's are integers so we'll sort them numerically using
        // the sortInt() function above
        var indexes = [];
        for (index in table)
            indexes.push (parseInt (index));
        indexes.sort (sortInt);
        
        // Use the sorted indexes we've calculated to walk through each
        // row in order
        for (var i = 0; i < indexes.length; i++) {
            // Like indexes we sort by column, so use the same trick here,
            // some rows may not have the same columns as other rows, so
            // we calculate this per row
            var columns = [];
            for (column in table[indexes[i]])
                columns.push (parseInt (column));
            columns.sort (sortInt);
            
            // Print index, then each column indented under the index
            console.log ("row for index = " + indexes[i]);
            for (var j = 0; j < columns.length; j++) {
                console.log ("   column " + columns[j] + " = "
                        + table[indexes[i]][columns[j]]);
            }
        }
    }
}

var maxRepetitions = 20;

// The maxRepetitions argument is optional, and will be ignored unless using
// SNMP verison 2c
session.table (oid, maxRepetitions, responseCb);
```

## session.tableColumns (oid, columns, [maxRepetitions], callback)

The `tableColumns()` method implements the same interface as the `table()`
method.  However, only the columns specified in the `columns` parameter will
be in the resulting table.

This method should be used when only selected columns are required, and
will be many times faster than the `table()` method since a much smaller
amount of data will be fetched.

The following example fetches the ifTable (`1.3.6.1.2.1.2.2`) table, and
specifies that only the ifDescr (`1.3.6.1.2.1.2.2.1.2`) and ifPhysAddress
(`1.3.6.1.2.1.2.2.1.6`) columns should actually be fetched:

```js
var oid = "1.3.6.1.2.1.2.2";
var columns = [2, 6];

function sortInt (a, b) {
    if (a > b)
        return 1;
    else if (b > a)
        return -1;
    else
        return 0;
}

function responseCb (error, table) {
    if (error) {
        console.error (error.toString ());
    } else {
        // This code is purely used to print rows out in index order,
        // ifIndex's are integers so we'll sort them numerically using
        // the sortInt() function above
        var indexes = [];
        for (index in table)
            indexes.push (parseInt (index));
        indexes.sort (sortInt);
        
        // Use the sorted indexes we've calculated to walk through each
        // row in order
        for (var i = 0; i < indexes.length; i++) {
            // Like indexes we sort by column, so use the same trick here,
            // some rows may not have the same columns as other rows, so
            // we calculate this per row
            var columns = [];
            for (column in table[indexes[i]])
                columns.push (parseInt (column));
            columns.sort (sortInt);
            
            // Print index, then each column indented under the index
            console.log ("row for index = " + indexes[i]);
            for (var j = 0; j < columns.length; j++) {
                console.log ("   column " + columns[j] + " = "
                        + table[indexes[i]][columns[j]]);
            }
        }
    }
}

var maxRepetitions = 20;

// The maxRepetitions argument is optional, and will be ignored unless using
// SNMP verison 2c
session.tableColumns (oid, columns, maxRepetitions, responseCb);
```

## session.trap (typeOrOid, [varbinds], [agentAddrOrOptions], callback)

The `trap()` method sends a SNMP trap.

The `typeOrOid` parameter can be one of two types; one of the constants
defined in the `snmp.TrapType` object (excluding the
`snmp.TrapType.EnterpriseSpecific` constant), or an OID string.

For SNMP version 1 when a constant is specified the following fields are set in
the trap:

 * The enterprise field is set to the OID `1.3.6.1.4.1`
 * The generic-trap field is set to the constant specified
 * The specific-trap field is set to 0

When an OID string is specified the following fields are set in the trap:

 * The final decimal is stripped from the OID string and set in the
   specific-trap field
 * The remaining OID string is set in the enterprise field
 * The generic-trap field is set to the constant
   `snmp.TrapType.EnterpriseSpecific`

In both cases the time-stamp field in the trap PDU is set to the value
returned by the `process.uptime ()` function multiplied by `100`.

SNMP version 2c messages are quite different in comparison with version 1.
The version 2c trap has a much simpler format, simply a sequence of varbinds.
The first varbind to be placed in the trap message will be for the
`sysUptime.0` OID (`1.3.6.1.2.1.1.3.0`).  The value for this varbind will
be the value returned by the `process.uptime ()` function multiplied by 100
(this can be overridden by providing `upTime` in the optional `options`
parameter, as documented below).

This will be followed by a second varbind for the `snmpTrapOID.0` OID
(`1.3.6.1.6.3.1.1.4.1.0`).  The value for this will depend on the `typeOrOid`
parameter.  If a constant is specified the trap OID for the constant
will be used as supplied for the varbinds value, otherwise the OID string
specified will be used as is for the value of the varbind.

The optional `varbinds` parameter is an array of varbinds to include in the
trap, and defaults to the empty array `[]`.

The optional `agentAddrOrOptions` parameter can be one of two types; one is
the IP address used to populate the agent-addr field for SNMP version 1 type
traps, and defaults to `127.0.0.1`, or an object, and can contain the
following items:

 * `agentAddr` - IP address used to populate the agent-addr field for SNMP
   version 1 type traps, and defaults to `127.0.0.1`
 * `upTime` - Value of the `sysUptime.0` OID (`1.3.6.1.2.1.1.3.0`) in the
   trap, defaults to the value returned by the `process.uptime ()` function
   multiplied by 100

**NOTE** When using SNMP version 2c the `agentAddr` parameter is ignored if
specified since version 2c trap messages do not have an agent-addr field.

The `callback` function is called once the trap has been sent, or an error
occurred.  The following arguments will be passed to the `callback` function:

 * `error` - Instance of the `Error` class or a sub-class, or `null` if no
   error occurred

The following example sends an enterprise specific trap to a remote host using
a SNMP version 1 trap, and includes the sysName (`1.3.6.1.2.1.1.5.0`) varbind
in the trap.  Before the trap is sent the `agentAddr` field is calculated using
DNS to resolve the hostname of the local host:

```js
var enterpriseOid = "1.3.6.1.4.1.2000.1"; // made up, but it may be valid

var varbinds = [
    {
        oid: "1.3.6.1.2.1.1.5.0",
        type: snmp.ObjectType.OctetString,
        value: "host1"
    }
];

dns.lookup (os.hostname (), function (error, agentAddress) {
    if (error) {
        console.error (error);
    } else {
        // Override sysUpTime, specfiying it as 10 seconds...
        var options = {agentAddr: agentAddress, upTime: 1000};
        session.trap (enterpriseOid, varbinds, agentAddress,
                function (error) {
            if (error)
                console.error (error);
        });
    }
});
```

The following example sends a generic link-down trap to a remote host using a
SNMP version 1 trap, it does not include any varbinds or specify the
`agentAddr` parameter:

```js
session.trap (snmp.TrapType.LinkDown, function (error) {
    if (error)
        console.error (error);
});
```

The following example sends an enterprise specific trap to a remote host using
a SNMP version 2c trap, and includes two enterprise specific varbinds:

```js
var trapOid = "1.3.6.1.4.1.2000.1";

var varbinds = [
    {
        oid: "1.3.6.1.4.1.2000.2",
        type: snmp.ObjectType.OctetString,
        value: "Hardware health status changed"
    },
    {
        oid: "1.3.6.1.4.1.2000.3",
        type: snmp.ObjectType.OctetString,
        value: "status-error"
    }
];

// version 2c should have been specified when creating the session
session.trap (trapOid, varbinds, function (error) {
    if (error)
        console.error (error);
});
```

## session.walk (oid, [maxRepetitions], feedCallback, doneCallback)

The `walk()` method fetches the value for all OIDs lexicographically following
a specified OID in the MIB tree.

For SNMP version 1 repeated `get()` calls are made until the end of the MIB
tree is reached.  For SNMP version 2c repeated `getBulk()` calls are made
until the end of the MIB tree is reached.

The `oid` parameter is an OID string.  The optional `maxRepetitions` parameter
is passed to `getBulk()` requests when SNMP version 2c is being used.

This method will not call a single callback once all OID values are fetched.
Instead the `feedCallback` function will be called each time a response is
received from the remote host.  The following arguments will be passed to the
`feedCallback` function:

 * `varbinds` - Array of varbinds, and will contain at least one varbind

Each varbind must be checked for an error condition using the
`snmp.isVarbindError()` function when using SNMP version 2c.

Once the end of the MIB tree has been reached, or an error has occurred, the
`doneCallback` function will be called.  The following arguments will be
passed to the `doneCallback` function:

 * `error` - Instance of the `Error` class or a sub-class, or `null` if no
   error occurred

Once the `doneCallback` function has been called the request is complete and
the `feedCallback` function will no longer be called.

If the `feedCallback` function returns a `true` value when called no more
`get()` or `getBulk()` method calls will be made and the `doneCallback` will
be called.

The following example walks to the end of the MIB tree starting from the
ifTable (`1.3.6.1.2.1.2.2`) OID:

```js
var oid = "1.3.6.1.2.1.2.2";

function doneCb (error) {
    if (error)
        console.error (error.toString ());
}

function feedCb (varbinds) {
    for (var i = 0; i < varbinds.length; i++) {
        if (snmp.isVarbindError (varbinds[i]))
            console.error (snmp.varbindError (varbinds[i]));
        else
            console.log (varbinds[i].oid + "|" + varbinds[i].value);
    }
}

var maxRepetitions = 20;

// The maxRepetitions argument is optional, and will be ignored unless using
// SNMP verison 2c
session.walk (oid, maxRepetitions, feedCb, doneCb);
```

# Application: Notification Receiver

RFC 3413 classifies a "Notification Receiver" SNMP application that receives
"Notification-Class" PDUs. Notifications include both SNMP traps and informs.
This library is able to receive all types of notification PDU:

 * `Trap-PDU` (original v1 trap PDUs, which are now considered obselete)
 * `Trapv2-PDU` (unacknowledged notifications)
 * `InformRequest-PDU` (same format as `Trapv2-PDU` but with message acknowledgement)

The library provides a `Receiver` class for receiving SNMP notifications. This
module exports the `createReceiver()` function, which creates a new `Receiver`
instance.

The receiver creates an `Authorizer` instance to control incoming access.  More
detail on this is found below in the [Authorizer Module](#authorizer-module) section
below.

## snmp.createReceiver (options, callback)

The `createReceiver()` function instantiates and returns an instance of the `Receiver`
class:

```js
// Default options
var options = {
    port: 162,
    disableAuthorization: false,
    includeAuthentication: false,
    accessControlModelType: snmp.AccessControlModelType.None,
    engineID: "8000B98380XXXXXXXXXXXXXXXXXXXXXXXX", // where the X's are random hex digits
    address: null,
    transport: "udp4"
};

var callback = function (error, notification) {
    if ( error ) {
        console.error (error);
    } else {
        console.log (JSON.stringify(notification, null, 2));
    }
};

receiver = snmp.createReceiver (options, callback);
```

The `options` and `callback` parameters are mandatory.  The `options` parameter is
an object, possibly empty, and can contain the following fields:

 * `port` - the port to listen for notifications on - defaults to 162.  Note that binding to
 port 162 on some systems requires the receiver process to be run with administrative
 privilege.  If this is not possible then choose a port greater than 1024.
 * `disableAuthorization` - disables local authorization for all community-based
 notifications received and for those user-based notifications received with no
 message authentication or privacy (noAuthNoPriv) - defaults to false
 * `engineID` - the engineID used for SNMPv3 communications, given as a hex string -
 defaults to a system-generated engineID containing elements of random
 * `transport` - the transport family to use - defaults to `udp4`
 * `address` - the IP address to bind to - default to `null`, which means bind to all IP
 addresses
 * `includeAuthentication` - adds the community (v1/2c) or user name (v3) information
 to the notification callback - defaults to `false`
 * `sockets` - an array of objects containing triples of `transport`, `address` and `port` that
 can be used to specify multiple socket listeners.  This option overrides any individual
 `transport`, `address` and `port` options.

The `callback` parameter is a callback function of the form
`function (error, notification)`.  On an error condition, the `notification`
parameter is set to `null`.  Where the error was produced while processing a
received packet - such as an authorization failure for a community or user
not in the receiver's local authorization lists - the error will include an
`rinfo` attribute containing the sender socket details of the offending packet.
On successful reception of a notification, the error
parameter is set to `null`, and the `notification` parameter is set as an object
with the notification PDU details in the `pdu` field and the sender socket details
in the `rinfo` field.  For example:

```json
{
    "pdu": {
        "type": 166,
        "id": 45385686,
        "varbinds": [
            {
                "oid": "1.3.6.1.2.1.1.3.0",
                "type": 67,
                "value": 5
            },
            {
                "oid": "1.3.6.1.6.3.1.1.4.1.0",
                "type": 6,
                "value": "1.3.6.1.6.3.1.1.5.2"
            }
        ],
        "scoped": false
    },
    "rinfo": {
        "address": "127.0.0.1",
        "family": "IPv4",
        "port": 43162,
        "size": 72
    }
}
```

## receiver.getAuthorizer ()

Returns the receiver's `Authorizer` instance, used to control access
to the receiver.  See the `Authorizer` section for further details.

## receiver.close (callback)

Closes the receiver's listening socket(s), ending the operation of the receiver.  The optionnal
`callback` parameter is a callback function of the form `function (socket)`, which will be
called once for each socket that the receiver is listening on, after the socket is closed.
The `socket` argument will be given as an object triple of `address`, `family` and `port`.

# Application: SNMP Agent

The SNMP agent responds to all four "request class" PDUs relevant to a Command Responder
application:

 * **GetRequest** - request exactly matched OID instances
 * **GetNextRequest** - request lexicographically "next" OID instances in the MIB tree
 * **GetBulkRequest** - request a series of "next" OID instances in the MIB tree
 * **SetRequest** - set values for specified OIDs

The agent sends a **GetResponse** PDU to all four request PDU types, in conformance with RFC 3416.

The agent - like the notification receiver - maintains an `Authorizer` instance
to control access to the agent, details of which are in the [Authorizer Module](#authorizer-module)
section below.

The central data structure that the agent maintains is a `Mib` instance, the API of which is
detailed in the [Mib Module](#mib-module) section below.  The agent allows the MIB to be queried
and manipulated through the API, as well as queried and manipulated through the SNMP interface with
the above four request-class PDUs.

The agent also supports SNMP proxy forwarder applications with its singleton `Forwarder` instance,
which is documented in the [Forwarder Module](#forwarder-module) section below.

## snmp.createAgent (options, callback, mib)

The `createAgent()` function instantiates and returns an instance of the `Agent`
class:

```js
// Default options
var options = {
    port: 161,

