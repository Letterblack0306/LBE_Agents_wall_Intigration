from __future__ import annotations

import argparse
import json
from pathlib import Path

from agent import open_database, utc_now, DATABASE_PATH


def main() -> None:
    parser = argparse.ArgumentParser(description="Import legacy partial JSONL and hash cache")
    parser.add_argument("--partial", default="state/workspace_trace.partial.jsonl")
    parser.add_argument("--cache", default="state/hash_cache.json")
    args = parser.parse_args()

    partial_path = Path(args.partial)
    cache_path = Path(args.cache)
    if not partial_path.exists():
        print(f"No partial file found: {partial_path}")
        return

    cache: dict = {}
    if cache_path.exists():
        try:
            payload = json.loads(cache_path.read_text(encoding="utf-8"))
            if isinstance(payload, dict) and isinstance(payload.get("entries"), dict):
                cache = payload["entries"]
        except Exception as exc:
            print(f"Hash cache could not be read; continuing without it: {exc}")

    connection = open_database()
    imported = skipped = 0
    try:
        with partial_path.open("r", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                    root = str(item["root"])
                    virtual = str(item["path"])
                    size = int(item.get("size", 0))
                    modified_ns = int(item.get("modified_ns", 0))
                    file_hash = item.get("sha256")
                    cached = cache.get(virtual)
                    if not file_hash and isinstance(cached, dict):
                        if (
                            int(cached.get("size", -1)) == size
                            and int(cached.get("modified_ns", -1)) == modified_ns
                        ):
                            file_hash = cached.get("sha256")

                    reason = str(item.get("skipped_hash_reason", ""))
                    if file_hash:
                        status = "imported"
                    elif reason == "file_too_large":
                        status = "too_large"
                    elif reason:
                        status = "unreadable"
                    else:
                        status = "unhashed"

                    now = utc_now()
                    connection.execute(
                        """
                        INSERT INTO files(
                            root,path,physical_path,size,modified_ns,sha256,hash_status,error,
                            first_seen_at,last_seen_at,last_seen_run
                        ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
                        ON CONFLICT(root,path) DO UPDATE SET
                            size=excluded.size,
                            modified_ns=excluded.modified_ns,
                            sha256=COALESCE(excluded.sha256,files.sha256),
                            hash_status=excluded.hash_status,
                            error=excluded.error,
                            last_seen_at=excluded.last_seen_at
                        """,
                        (
                            root, virtual, "", size, modified_ns, file_hash, status,
                            reason or None, now, now, "legacy-import",
                        ),
                    )
                    imported += 1
                    if imported % 1000 == 0:
                        connection.commit()
                        print(f"Imported {imported:,} records...")
                except Exception as exc:
                    skipped += 1
                    print(f"Skipped line {line_number}: {exc}")
        connection.commit()
        print(f"Imported: {imported:,}")
        print(f"Skipped:  {skipped:,}")
        print(f"Database: {DATABASE_PATH}")
        print("Now run: python .\\agent.py trace --resume")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
