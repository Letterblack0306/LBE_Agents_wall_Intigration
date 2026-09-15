from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class SearchConfig:
    database_path: Path
    table: str | None
    id_column: str | None
    path_column: str | None
    content_column: str | None
    hash_column: str | None
    workspace_column: str | None
    classification_column: str | None
    max_results_default: int
    excluded_path_tokens: tuple[str, ...]


def load_config(path: str | Path) -> SearchConfig:
    config_path = Path(path).resolve()
    raw: dict[str, Any] = json.loads(config_path.read_text(encoding="utf-8"))

    database_path = Path(raw["database_path"])
    if not database_path.is_absolute():
        database_path = (config_path.parent / database_path).resolve()

    return SearchConfig(
        database_path=database_path,
        table=raw.get("table"),
        id_column=raw.get("id_column"),
        path_column=raw.get("path_column"),
        content_column=raw.get("content_column"),
        hash_column=raw.get("hash_column"),
        workspace_column=raw.get("workspace_column"),
        classification_column=raw.get("classification_column"),
        max_results_default=int(raw.get("max_results_default", 10)),
        excluded_path_tokens=tuple(
            token.lower()
            for token in raw.get(
                "excluded_path_tokens",
                [
                    "/.cep-dev/",
                    "\\\\.cep-dev\\\\",
                    "/archive/",
                    "\\\\archive\\\\",
                    "/backup/",
                    "\\\\backup\\\\",
                    "/dist/",
                    "\\\\dist\\\\",
                    "/build/",
                    "\\\\build\\\\",
                    "/release/",
                    "\\\\release\\\\",
                    "/node_modules/",
                    "\\\\node_modules\\\\",
                ],
            )
        ),
    )
