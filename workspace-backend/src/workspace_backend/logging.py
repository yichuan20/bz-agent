"""Structured logging setup.

Replaces the original server's ~100 ``print(..., file=sys.stderr)`` calls with the
stdlib ``logging`` module, configured once at startup. Level comes from ``LOG_LEVEL``.
Modules obtain a logger via ``logging.getLogger(__name__)``.
"""

from __future__ import annotations

import logging

_LOG_FORMAT = "%(asctime)s %(levelname)-7s %(name)s: %(message)s"
_DATE_FORMAT = "%Y-%m-%dT%H:%M:%S%z"

_configured = False


def configure_logging(level: str = "INFO") -> None:
    """Configure the root logger once. Idempotent across repeated calls."""
    global _configured
    resolved = logging.getLevelNamesMapping().get(level.upper(), logging.INFO)
    if _configured:
        logging.getLogger().setLevel(resolved)
        return
    logging.basicConfig(level=resolved, format=_LOG_FORMAT, datefmt=_DATE_FORMAT)
    _configured = True


def get_logger(name: str) -> logging.Logger:
    """Return a module logger. Thin wrapper so call sites don't import ``logging``."""
    return logging.getLogger(name)
