---
id: "github:zerotier/ZeroTierOne"
kind: "github"
category: "network-admin"
repo: "zerotier/ZeroTierOne"
url: "https://github.com/zerotier/ZeroTierOne"
description: "A Smart Ethernet Switch for Earth"
stars: 17239
forks: 1992
language: "C++"
license: "NOASSERTION"
topics:
  - "decentralization"
  - "networking"
  - "peer-to-peer"
  - "sd-wan"
  - "sdn"
  - "virtual-network"
  - "vpn"
archived: false
pushed_at: "2026-09-03T17:04:55Z"
default_branch: "dev"
fetched_at: "2026-11-08T12:43:21Z"
---

# ZeroTier - Global Area Networking

## Quick Links

* [ZeroTier Documentation](https://docs.zerotier.com) - **Start here for downloads, installation, and usage**
* [How to build](build.md) - **Build instructions and platform requirements**
* [Corporate Site](https://www.zerotier.com/)
* [Downloads](https://www.zerotier.com/download/)
* [Service API Reference](service/README.md)
* [Network Controller](nonfree/controller/README.md)
* [Commercial Support](https://www.zerotier.com/contact)
* [License Information](#license)

## About

ZeroTier is a smart programmable Ethernet switch for planet Earth. It allows all networked devices, VMs, containers, and applications to communicate as if they all reside in the same physical data center or cloud region.

This is accomplished by combining a cryptographically addressed and secure peer-to-peer network (termed VL1) with an Ethernet emulation layer somewhat similar to VXLAN (termed VL2). Our VL2 Ethernet virtualization layer includes advanced enterprise SDN features like fine grained access control rules for network micro-segmentation and security monitoring.

All ZeroTier traffic is encrypted end-to-end using secret keys that only you control. Most traffic flows peer-to-peer, though we offer free (but slow) relaying for users who cannot establish peer-to-peer connections.

Apps for Android and iOS are available for free in the Google Play and Apple app stores.

For repository layout, build instructions, platform requirements, and information about running ZeroTier, see [build.md](build.md).

## License

See [LICENSE-MPL.txt](LICENSE-MPL.txt) for all code in node/, osdep/. service/, and everywhere else except ext/ and nonfree/.

See [nonfree/LICENSE.md](nonfree/LICENSE.md) for all non-free ("source available") portions of this repository.

Code in ext/ is external code included for build convenience or backward compatibility and retains its original license.
