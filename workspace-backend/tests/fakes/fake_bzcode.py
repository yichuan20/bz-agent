#!/usr/bin/env python3
"""Fake bzcode — a deterministic stub that speaks the stdio protocol.

Integration tests spawn this exactly like the real binary (``--stdio --resume <id>``),
so the pool exercises its real spawn/read/framing path without a real bzcode. It is
driven entirely by stdin, so tests are not timing-dependent — nothing is emitted until
a message arrives.

Behavior, keyed off the incoming client message:

* ``{"type": "user", "content": "..."}`` — a normal turn:
    status running → assistant → result(success, usage) → status idle
* ``{"type": "user", "content": "/perm"}`` — a turn that requests permission:
    status running → prompt(permission) → (waits for the reply) → assistant →
    result → status idle. Used to test yolo auto-approve.
* ``{"type": "user", "subtype": "permission", ...}`` — a permission reply: resume the
    paused turn (assistant → result → idle).
* ``{"type": "user", "content": "/huge"}`` — emit one line larger than the 16 MB
    reader limit (to test the oversized-line drain), then a normal turn.
* ``{"type": "user", "content": "/authfail"}`` — write an auth keyword to stderr.
* ``{"type": "user", "content": "/exit"}`` — exit the process (test dead handling).
* ``{"type": "setMode", "mode": "..."}`` — acknowledge on stderr (no stdout).

On startup it emits a ``session`` message advertising modes/commands, mirroring real
bzcode.
"""

from __future__ import annotations

import json
import sys

_SESSION = {
    "type": "session",
    "sessionId": "fake",
    "workingDir": ".",
    "modes": ["default", "plan", "yolo"],
    "commands": [{"name": "clear"}, {"name": "help"}],
    "isLoggedIn": True,
}


def emit(obj: dict) -> None:
    """Write one protocol message to stdout, newline-framed, flushed."""
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def normal_turn(text: str = "hello") -> None:
    emit({"type": "status", "status": "running"})
    emit({"type": "assistant", "content": [{"type": "text", "text": f"echo: {text}"}]})
    emit({"type": "result", "status": "success", "usage": {"inputTokens": 3, "outputTokens": 5}})
    emit({"type": "status", "status": "idle"})


def main() -> None:
    emit(_SESSION)
    emit({"type": "status", "status": "idle"})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue

        mtype = msg.get("type")
        if mtype == "setMode":
            sys.stderr.write(f"setMode -> {msg.get('mode')}\n")
            sys.stderr.flush()
            continue

        if mtype == "abort":
            emit({"type": "result", "status": "aborted"})
            emit({"type": "status", "status": "idle"})
            continue

        if mtype != "user":
            continue

        # A permission/input reply resumes a paused turn.
        if msg.get("subtype") == "permission":
            emit({"type": "assistant", "content": [{"type": "text", "text": "approved"}]})
            emit({"type": "result", "status": "success"})
            emit({"type": "status", "status": "idle"})
            continue

        content = msg.get("content", "")
        if content == "/perm":
            emit({"type": "status", "status": "running"})
            emit(
                {
                    "type": "prompt",
                    "requestId": "req-1",
                    "subtype": "permission",
                    "tool": "Bash",
                    "input": {"command": "ls"},
                }
            )
            # Wait for the reply loop iteration to resume the turn.
            continue
        if content == "/huge":
            sys.stdout.write("x" * (17 * 1024 * 1024) + "\n")
            sys.stdout.flush()
            normal_turn("after-huge")
            continue
        if content == "/authfail":
            sys.stderr.write("Error: invalid_token (401)\n")
            sys.stderr.flush()
            continue
        if content == "/exit":
            return
        normal_turn(str(content))


if __name__ == "__main__":
    main()
