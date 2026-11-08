"""Русские названия доменов реестра — один источник для генераторов.

Импортируется генераторами (build_ecosystem), чтобы подписи доменов не разъезжались
между docs/ACTIONS.md, AGENTS.md и каталогом умений. Источник — DOMAIN_TITLES в
tools/actions.py; здесь только импорт, без дублирования данных.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from actions import DOMAIN_TITLES as TITLES  # noqa: E402

__all__ = ["TITLES"]
