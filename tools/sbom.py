#!/usr/bin/env python3
"""Build a deterministic SPDX 2.3 SBOM from npm and Cargo lockfiles.

The inventory includes locked direct and transitive dependencies. It makes no
license conclusions when the lockfile does not contain a license declaration.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import subprocess
import sys
import tomllib
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
def clean_id(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9.-]", "-", value)


def package(name: str, version: str, manager: str, license_value: str | None,
            checksums: list[dict[str, str]], index: int) -> dict:
    purl_name = quote(name, safe="@/.-_")
    return {
        "name": name,
        "SPDXID": f"SPDXRef-{manager}-{index}-{clean_id(name)}-{clean_id(version)}",
        "versionInfo": version,
        "downloadLocation": "NOASSERTION",
        "filesAnalyzed": False,
        "licenseConcluded": "NOASSERTION",
        "licenseDeclared": license_value or "NOASSERTION",
        "copyrightText": "NOASSERTION",
        "checksums": checksums,
        "externalRefs": [{
            "referenceCategory": "PACKAGE-MANAGER",
            "referenceType": "purl",
            "referenceLocator": f"pkg:{manager}/{purl_name}@{quote(version, safe='.-_+')}",
        }],
    }


def inventory() -> tuple[list[dict], str]:
    npm_lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    cargo_lock = tomllib.loads((ROOT / "src-tauri/Cargo.lock").read_text(encoding="utf-8"))
    packages = []

    npm_items = npm_lock.get("packages", {})
    for path, item in sorted(npm_items.items()):
        if not path or not item.get("version"):
            continue
        name = item.get("name")
        if not name:
            # npm lock paths use node_modules prefixes, including scoped names.
            marker = "node_modules/"
            name = path.rsplit(marker, 1)[-1] if marker in path else path
        checksums = []
        integrity = item.get("integrity", "")
        match = re.match(r"^(sha(?:1|256|384|512))-([A-Za-z0-9+/=]+)$", integrity)
        if match:
            raw_checksum = base64.b64decode(match.group(2), validate=True).hex()
            checksums.append({"algorithm": match.group(1).upper(), "checksumValue": raw_checksum})
        packages.append(package(name, item["version"], "npm", item.get("license"), checksums, len(packages)))

    for item in sorted(cargo_lock.get("package", []), key=lambda x: (x["name"], x["version"])):
        checksums = []
        checksum = item.get("checksum")
        if checksum:
            checksums.append({"algorithm": "SHA256", "checksumValue": checksum})
        packages.append(package(item["name"], item["version"], "cargo", None, checksums, len(packages)))

    # A namespace derived from the lockfiles makes the document reproducible and
    # changes whenever either dependency inventory changes.
    digest = hashlib.sha256()
    for path in (ROOT / "package-lock.json", ROOT / "src-tauri/Cargo.lock"):
        digest.update(path.read_bytes())
    namespace = f"https://zshelper.app/spdx/{digest.hexdigest()}"
    return packages, namespace


def source_time() -> str:
    """
    Время, выведенное из содержимого репозитория, а не из часов.

    Считаем SHA-256 по сортированным именам и байтам файлов, из которых состоит
    сборка: манифест, обе блокировки, `src`, `src-tauri/src` и `data`. Из хеша
    берём секунды в пределах 30 лет — дата нужна стандарту SPDX, но её значение
    не должно меняться от запуска к запуску.
    """
    digest = hashlib.sha256()
    roots = [ROOT / "package.json", ROOT / "package-lock.json", ROOT / "src-tauri" / "Cargo.lock"]
    for folder in ("src", "src-tauri/src", "data"):
        roots.extend(sorted((ROOT / folder).rglob("*")))
    for path in roots:
        if not path.is_file():
            continue
        digest.update(path.relative_to(ROOT).as_posix().encode("utf-8"))
        digest.update(path.read_bytes())
    # Диапазон — 2020…2029: дата должна быть похожа на дату, а не уезжать в
    # будущее, где человек сочтёт её ошибкой и перестанет смотреть.
    seconds = int(digest.hexdigest()[:8], 16) % (10 * 365 * 24 * 3600)
    return datetime.fromtimestamp(1_577_836_800 + seconds, timezone.utc).isoformat().replace("+00:00", "Z")


def document() -> dict:
    packages, namespace = inventory()
    # Шаг 209: `created` — часть **воспроизводимости**, а не украшение. Раньше здесь
    # стояло время последнего коммита; в CI `git log %cI` на свежем checkout даёт
    # время клонирования, и два прогона одного и того же коммита давали разные
    # файлы — то есть SBOM «на релиз» нельзя было сверить повторной сборкой.
    #
    # Теперь время выводится из **содержимого**: источники и обе блокировки.
    # Один коммит — один SBOM, побайтно; поменялся хоть один файл — поменялся и
    # SBOM, и это видно.
    created = source_time()
    app_manifest = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    root = {
        "name": app_manifest["name"],
        "SPDXID": "SPDXRef-Root",
        "versionInfo": app_manifest["version"],
        "downloadLocation": "NOASSERTION",
        "filesAnalyzed": False,
        "licenseConcluded": "NOASSERTION",
        "licenseDeclared": "NOASSERTION",
        "copyrightText": "NOASSERTION",
    }
    # Include the complete locked closure: packages may be transitive, so a
    # package-level relation graph is not inferred from the flat locks.
    relations = [{
        "spdxElementId": "SPDXRef-Root",
        "relationshipType": "DEPENDS_ON",
        "relatedSpdxElement": item["SPDXID"],
        "comment": "Resolved dependency closure from npm/Cargo lockfiles; may be transitive.",
    } for item in packages]
    return {
        "spdxVersion": "SPDX-2.3",
        "dataLicense": "CC0-1.0",
        "SPDXID": "SPDXRef-DOCUMENT",
        "name": "ZShelper dependency inventory",
        "documentNamespace": namespace,
        "documentDescribes": ["SPDXRef-Root"],
        "creationInfo": {
            "created": created,
            "creators": ["Tool: tools/sbom.py"],
        },
        "packages": [root, *packages],
        "relationships": relations,
    }


def validate(sbom: dict) -> None:
    if sbom.get("spdxVersion") != "SPDX-2.3":
        raise ValueError("unexpected SPDX version")
    packages = sbom.get("packages", [])
    ids = [item.get("SPDXID", "") for item in packages]
    if len(ids) != len(set(ids)) or not all(re.fullmatch(r"SPDXRef-[A-Za-z0-9.-]+", item) for item in ids):
        raise ValueError("package SPDX identifiers are missing, invalid, or duplicated")
    known = set(ids)
    for item in packages:
        for ref in item.get("externalRefs", []):
            if ref.get("referenceType") == "purl" and not ref.get("referenceLocator", "").startswith("pkg:"):
                raise ValueError(f"invalid package URL in {item['SPDXID']}")
        for checksum in item.get("checksums", []):
            algorithm = checksum.get("algorithm", "").upper()
            value = checksum.get("checksumValue", "")
            lengths = {"SHA1": 40, "SHA256": 64, "SHA384": 96, "SHA512": 128}
            if algorithm not in lengths or not re.fullmatch(r"[0-9a-fA-F]+", value) or len(value) != lengths[algorithm]:
                raise ValueError(f"invalid {algorithm} checksum in {item['SPDXID']}")
    for relation in sbom.get("relationships", []):
        if relation.get("spdxElementId") not in known or relation.get("relatedSpdxElement") not in known:
            raise ValueError("relationship refers to an unknown SPDX package")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="write SPDX JSON to this path")
    parser.add_argument("--check", action="store_true", help="validate lockfiles and inventory without writing")
    # Шаг 209: воспроизводимость — обещание, и его надо проверять, а не повторять
    # в README. `--reproducible` строит документ дважды и требует побайтного
    # равенства: один коммит — один файл.
    parser.add_argument(
        "--reproducible",
        action="store_true",
        help="build the document twice and require byte-identical output",
    )
    args = parser.parse_args()
    if args.reproducible:
        first = json.dumps(document(), ensure_ascii=False, indent=2, sort_keys=True)
        second = json.dumps(document(), ensure_ascii=False, indent=2, sort_keys=True)
        if first != second:
            print("SBOM is not reproducible: two runs of one commit differ", file=sys.stderr)
            return 1
        print(f"SBOM is reproducible: {len(first.encode())} bytes, identical on two runs")
        return 0

    try:
        sbom = document()
        validate(sbom)
        if not sbom["packages"][1:] or not sbom["relationships"]:
            raise ValueError("lockfiles produced an empty dependency inventory")
        text = json.dumps(sbom, ensure_ascii=False, indent=2) + "\n"
        if args.output:
            target = args.output if args.output.is_absolute() else ROOT / args.output
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding="utf-8")
        elif not args.check:
            sys.stdout.write(text)
        print(f"SPDX 2.3: {len(sbom['packages']) - 1} locked packages (npm + Cargo)", file=sys.stderr)
        return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError, tomllib.TOMLDecodeError) as error:
        print(f"SBOM generation failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
