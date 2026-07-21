#!/usr/bin/env python3
"""
db.py — PostgreSQL management script for bzcode agents.

Requires: asyncpg  (pip install asyncpg)

Usage:
  python db.py list-tables
  python db.py describe <table>
  python db.py create-table <table> [col:type ...]
  python db.py drop-table <table>
  python db.py insert <table> col=value [col=value ...]
  python db.py query <table> [--filter col=value] [--limit N] [--offset N] [--order col] [--dir asc|desc]
  python db.py update <table> <id> col=value [col=value ...]
  python db.py delete <table> <id>

All output is JSON so agents can parse it easily.

Connection env vars (defaults match docker-compose.yml):
  BZ_DB_HOST      localhost
  BZ_DB_PORT      5432
  BZ_DB_NAME      bz_agent
  BZ_DB_USER      bz_agent
  BZ_DB_PASSWORD  bz_agent_secret

Every table created here automatically gets:
  id         BIGSERIAL PRIMARY KEY
  created_at TIMESTAMPTZ DEFAULT NOW()

Allowed column types:
  text  varchar  integer  bigint  smallint  boolean  float
  numeric  jsonb  json  uuid  date  timestamptz  timestamp  bytea

Examples:
  python db.py create-table tasks title:text done:boolean priority:integer
  python db.py insert tasks title="fix the bug" done=false priority=1
  python db.py query tasks --filter done=false --limit 20 --order priority --dir asc
  python db.py update tasks 3 done=true
  python db.py delete tasks 3
  python db.py drop-table tasks
"""

import argparse
import asyncio
import json
import os
import re
import sys

try:
    import asyncpg
except ImportError:
    sys.exit("Missing dependency: pip install asyncpg")

# ── Config ────────────────────────────────────────────────────────────────────

DB_CONFIG = dict(
    host=os.environ.get("BZ_DB_HOST", "localhost"),
    port=int(os.environ.get("BZ_DB_PORT", "5432")),
    database=os.environ.get("BZ_DB_NAME", "bz_agent"),
    user=os.environ.get("BZ_DB_USER", "bz_agent"),
    password=os.environ.get("BZ_DB_PASSWORD", "bz_agent_secret"),
)

ALLOWED_TYPES = {
    "text",
    "varchar",
    "integer",
    "int",
    "bigint",
    "smallint",
    "boolean",
    "bool",
    "float",
    "double precision",
    "numeric",
    "real",
    "jsonb",
    "json",
    "uuid",
    "date",
    "timestamptz",
    "timestamp",
    "bytea",
}

IDENT_RE = re.compile(r"^[a-z][a-z0-9_]{0,62}$")


# ── Helpers ───────────────────────────────────────────────────────────────────


def out(data):
    print(json.dumps(data, indent=2, default=str))


def die(msg, code=1):
    print(json.dumps({"error": msg}), file=sys.stderr)
    sys.exit(code)


def safe_ident(name):
    if not IDENT_RE.match(name):
        die(f"Invalid identifier: {name!r}  (must match [a-z][a-z0-9_]{{0,62}})")
    return f'"{name}"'


def safe_type(t):
    base = t.strip().lower().split("(")[0].strip()
    if base not in ALLOWED_TYPES:
        die(f"Disallowed column type: {t!r}\nAllowed: {', '.join(sorted(ALLOWED_TYPES))}")
    return t.strip()


def coerce(value):
    if value.lower() in ("true", "false"):
        return value.lower() == "true"
    try:
        return int(value)
    except ValueError:
        pass
    try:
        return float(value)
    except ValueError:
        pass
    try:
        parsed = json.loads(value)
        if not isinstance(parsed, str):
            return parsed
    except ValueError, json.JSONDecodeError:
        pass
    return value


def parse_kv(pairs):
    result = {}
    for pair in pairs:
        if "=" not in pair:
            die(f"Expected col=value, got: {pair!r}")
        col, _, val = pair.partition("=")
        result[col.strip()] = coerce(val)
    return result


# ── Commands ──────────────────────────────────────────────────────────────────


async def cmd_list_tables(_args):
    conn = await asyncpg.connect(**DB_CONFIG)
    try:
        rows = await conn.fetch("""
            SELECT
                t.table_name,
                json_agg(
                    json_build_object(
                        'name',     c.column_name,
                        'type',     c.data_type,
                        'nullable', c.is_nullable = 'YES',
                        'default',  c.column_default
                    ) ORDER BY c.ordinal_position
                ) AS columns
            FROM information_schema.tables t
            JOIN information_schema.columns c
              ON c.table_name = t.table_name AND c.table_schema = t.table_schema
            WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
            GROUP BY t.table_name
            ORDER BY t.table_name
        """)
        out({"tables": [{"name": r["table_name"], "columns": json.loads(r["columns"])} for r in rows]})
    finally:
        await conn.close()


async def cmd_describe(args):
    conn = await asyncpg.connect(**DB_CONFIG)
    try:
        rows = await conn.fetch(
            """
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
            ORDER BY ordinal_position
        """,
            args.table,
        )
        if not rows:
            die(f"Table {args.table!r} not found")
        out({"table": args.table, "columns": [dict(r) for r in rows]})
    finally:
        await conn.close()


async def cmd_create_table(args):
    tbl = safe_ident(args.table)
    col_defs = [
        "id         BIGSERIAL PRIMARY KEY",
        "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    ]
    for spec in args.columns:
        if ":" not in spec:
            die(f"Column spec must be col:type — got: {spec!r}")
        col_name, _, col_type = spec.partition(":")
        col_defs.append(f"{safe_ident(col_name)} {safe_type(col_type)}")

    sep = ",\n  "
    ddl = f"CREATE TABLE IF NOT EXISTS {tbl} (\n  {sep.join(col_defs)}\n)"
    conn = await asyncpg.connect(**DB_CONFIG)
    try:
        await conn.execute(ddl)
        out({"ok": True, "table": args.table, "ddl": ddl})
    finally:
        await conn.close()


async def cmd_drop_table(args):
    tbl = safe_ident(args.table)
    conn = await asyncpg.connect(**DB_CONFIG)
    try:
        await conn.execute(f"DROP TABLE IF EXISTS {tbl}")
        out({"ok": True, "dropped": args.table})
    finally:
        await conn.close()


async def cmd_insert(args):
    tbl = safe_ident(args.table)
    data = parse_kv(args.values)
    if not data:
        die("Provide at least one col=value pair")

    cols = [safe_ident(k) for k in data]
    vals = list(data.values())
    ph = ", ".join(f"${i + 1}" for i in range(len(vals)))
    sql = f"INSERT INTO {tbl} ({', '.join(cols)}) VALUES ({ph}) RETURNING *"

    conn = await asyncpg.connect(**DB_CONFIG)
    try:
        row = await conn.fetchrow(sql, *vals)
        out({"inserted": dict(row)})
    finally:
        await conn.close()


async def cmd_query(args):
    tbl = safe_ident(args.table)

    where_parts, params = [], []
    for f in args.filter or []:
        if "=" not in f:
            die(f"--filter must be col=value — got: {f!r}")
        col, _, val = f.partition("=")
        where_parts.append(f"{safe_ident(col)} = ${len(params) + 1}")
        params.append(coerce(val))

    where = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""
    order = safe_ident(args.order)
    direction = "DESC" if args.dir.upper() == "DESC" else "ASC"
    limit = min(max(1, args.limit), 1000)
    offset = max(0, args.offset)

    conn = await asyncpg.connect(**DB_CONFIG)
    try:
        rows = await conn.fetch(
            f"SELECT * FROM {tbl} {where} ORDER BY {order} {direction} "
            f"LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}",
            *params,
            limit,
            offset,
        )
        total = await conn.fetchval(f"SELECT COUNT(*) FROM {tbl} {where}", *params)
        out({"rows": [dict(r) for r in rows], "total": total, "limit": limit, "offset": offset})
    finally:
        await conn.close()


async def cmd_update(args):
    tbl = safe_ident(args.table)
    row_id = args.id
    data = parse_kv(args.values)
    if not data:
        die("Provide at least one col=value pair")

    keys = list(data.keys())
    vals = list(data.values())
    sets = ", ".join(f"{safe_ident(k)} = ${i + 1}" for i, k in enumerate(keys))
    sql = f"UPDATE {tbl} SET {sets} WHERE id = ${len(vals) + 1} RETURNING *"

    conn = await asyncpg.connect(**DB_CONFIG)
    try:
        row = await conn.fetchrow(sql, *vals, row_id)
        if row is None:
            die(f"Row id={row_id} not found in {args.table!r}")
        out({"updated": dict(row)})
    finally:
        await conn.close()


async def cmd_delete(args):
    tbl = safe_ident(args.table)
    row_id = args.id

    conn = await asyncpg.connect(**DB_CONFIG)
    try:
        row = await conn.fetchrow(f"DELETE FROM {tbl} WHERE id = $1 RETURNING id", row_id)
        if row is None:
            die(f"Row id={row_id} not found in {args.table!r}")
        out({"deleted": row_id})
    finally:
        await conn.close()


# ── CLI ───────────────────────────────────────────────────────────────────────

DISPATCH = {
    "list-tables": cmd_list_tables,
    "describe": cmd_describe,
    "create-table": cmd_create_table,
    "drop-table": cmd_drop_table,
    "insert": cmd_insert,
    "query": cmd_query,
    "update": cmd_update,
    "delete": cmd_delete,
}


def build_parser():
    p = argparse.ArgumentParser(
        prog="db.py",
        description="Manage the local Docker PostgreSQL database.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = p.add_subparsers(dest="cmd", metavar="command")
    sub.required = True

    sub.add_parser("list-tables", help="List all tables")

    s = sub.add_parser("describe", help="Show columns of a table")
    s.add_argument("table")

    s = sub.add_parser("create-table", help="Create a table  (id + created_at added automatically)")
    s.add_argument("table")
    s.add_argument("columns", nargs="*", metavar="col:type")

    s = sub.add_parser("drop-table", help="Drop a table permanently")
    s.add_argument("table")

    s = sub.add_parser("insert", help="Insert a row")
    s.add_argument("table")
    s.add_argument("values", nargs="+", metavar="col=value")

    s = sub.add_parser("query", help="Query rows")
    s.add_argument("table")
    s.add_argument("--filter", action="append", metavar="col=value")
    s.add_argument("--limit", type=int, default=50)
    s.add_argument("--offset", type=int, default=0)
    s.add_argument("--order", default="id")
    s.add_argument("--dir", default="desc", choices=["asc", "desc", "ASC", "DESC"])

    s = sub.add_parser("update", help="Update a row by id")
    s.add_argument("table")
    s.add_argument("id", type=int)
    s.add_argument("values", nargs="+", metavar="col=value")

    s = sub.add_parser("delete", help="Delete a row by id")
    s.add_argument("table")
    s.add_argument("id", type=int)

    return p


def main():
    args = build_parser().parse_args()
    try:
        asyncio.run(DISPATCH[args.cmd](args))
    except asyncpg.PostgresError as exc:
        die(f"Database error: {exc}")
    except OSError as exc:
        die(f"Cannot connect to database: {exc}")


if __name__ == "__main__":
    main()
