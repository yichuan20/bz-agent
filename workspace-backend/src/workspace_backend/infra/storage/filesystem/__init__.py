"""Filesystem implementations of the domain storage ports.

These live under ``$BZ_HOME`` and ``server_data/`` and speak bzcode's own on-disk
layout (``sessions/{id}.jsonl``, ``sessions/{id}/meta.json``, ``api_keys.json``).
When the Postgres milestone lands, a sibling package implements the same ports.
"""
