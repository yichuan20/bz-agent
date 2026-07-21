"""bzcode stdio protocol vocabulary.

bzcode speaks newline-delimited JSON over stdio. This module centralizes the message
``type``/``subtype``/``status`` constants used on both sides of the bridge so the
dispatcher (parsing stdout) and the send-path (writing stdin) share one source of
truth. See ``stdio-bridge-protocol.md`` in the repo root for the full schema.

We keep parsing tolerant: bzcode may add fields or message types, so the dispatcher
switches on these known values and passes everything else through unchanged.
"""

from __future__ import annotations

from enum import StrEnum


class ServerMsg(StrEnum):
    """``type`` of messages bzcode emits on stdout (server → client)."""

    SESSION = "session"  # init: sessionId, workingDir, modes, commands, messages
    STATUS = "status"  # status: idle | running (+ optional mode/model)
    DELTA = "delta"  # streaming token chunk
    ASSISTANT = "assistant"  # a complete assistant message (content blocks)
    TOOL = "tool"  # tool lifecycle: running | done | error
    PROMPT = "prompt"  # needs a reply: permission | input
    RESULT = "result"  # turn finished: success | error | aborted
    SYSTEM = "system"  # out-of-band notice (e.g. auth-error) — injected by us


class ClientMsg(StrEnum):
    """``type`` of messages we write to bzcode stdin (client → server)."""

    USER = "user"  # a user turn, or a permission/input reply (via subtype)
    ABORT = "abort"  # cancel the running turn
    SET_MODE = "setMode"  # switch session mode (default | plan | yolo)


class Status(StrEnum):
    """``status`` field of a ``status`` message."""

    IDLE = "idle"  # agent free to accept input
    RUNNING = "running"  # agent working on a turn


class PromptSubtype(StrEnum):
    """``subtype`` of a ``prompt`` message (what kind of reply is needed)."""

    PERMISSION = "permission"  # approve/deny a tool use
    INPUT = "input"  # answer a question


class PermissionBehavior(StrEnum):
    """``behavior`` field of a permission reply (client → server)."""

    ALLOW = "allow"  # allow this one call
    DENY = "deny"  # refuse this call
    ALWAYS = "always"  # allow and don't ask again (used by yolo auto-approve)


class ResultStatus(StrEnum):
    """``status`` field of a ``result`` message."""

    SUCCESS = "success"
    ERROR = "error"
    ABORTED = "aborted"
