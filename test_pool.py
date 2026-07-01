#!/usr/bin/env python3
"""Test script for agent pool: connect, send prompt, disconnect, check status."""

import asyncio
import json
import sys
import websockets

BASE = "localhost:18789"
WS_URL = f"ws://{BASE}/ws"
POOL_URL = f"http://{BASE}/api/pool/status"


async def send_prompt(cwd: str, session_id: str, mode: str, prompt: str):
    """Connect, wait for session message, send prompt, wait for 'running' status, disconnect."""
    url = f"{WS_URL}?cwd={cwd}&sessionId={session_id}&mode={mode}"
    print(f"[1] connecting to {url}")

    async with websockets.connect(url) as ws:
        # Wait for session message (bzcode ready)
        while True:
            raw = await ws.recv()
            msg = json.loads(raw)
            if msg.get("type") == "session":
                sid = msg.get("sessionId", session_id)
                n = len(msg.get("messages", []))
                print(f"[2] session ready  sessionId={sid}  history={n} messages")
                if sid != session_id:
                    print(f"    NOTE: server assigned a different ID than requested!")
                break

        # Send the prompt
        await ws.send(json.dumps({"type": "user", "content": prompt}))
        print(f"[3] sent prompt: {prompt!r}")

        # Wait until we see status=running (bzcode started processing)
        while True:
            raw = await ws.recv()
            msg = json.loads(raw)
            if msg.get("type") == "status" and msg.get("status") == "running":
                print("[4] bzcode is running — disconnecting now")
                break

    print(f"[5] WebSocket closed. bzcode should still be running in the pool.")
    print(f"")
    print(f"    Session ID: {sid}")
    print(f"    Check:      python test_pool.py status")
    print(f"    Reconnect:  python test_pool.py reconnect {cwd} {sid} {mode}")


async def check_status():
    """Hit /api/pool/status and print the result."""
    import urllib.request
    resp = urllib.request.urlopen(POOL_URL)
    data = json.loads(resp.read())
    agents = data.get("agents", [])
    if not agents:
        print("Pool is empty — no agents running.")
        return
    for a in agents:
        print(f"  session={a['sessionId']}  pid={a['pid']}  alive={a['alive']}  "
              f"ws={a['ws_attached']}  running={a['is_running']}  "
              f"idle={a['idle_seconds']}s")


async def reconnect(cwd: str, session_id: str, mode: str, prompt: str = ""):
    """Reconnect, optionally send a prompt, and collect output."""
    url = f"{WS_URL}?cwd={cwd}&sessionId={session_id}&mode={mode}"
    print(f"[1] reconnecting to {url}")

    async with websockets.connect(url) as ws:
        print("[2] connected — listening for messages (ctrl-c to stop)...\n")

        prompt_sent = False

        try:
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=30)
                msg = json.loads(raw)
                t = msg.get("type", "")

                if t == "session":
                    n = len(msg.get("messages", []))
                    print(f"  [session] {n} history messages")
                elif t == "status":
                    s = msg.get("status")
                    print(f"  [status] {s}")
                    # Send prompt once we see idle (agent ready for input)
                    if s == "idle" and prompt and not prompt_sent:
                        await ws.send(json.dumps({"type": "user", "content": prompt}))
                        print(f"  [sent] {prompt!r}")
                        prompt_sent = True
                elif t == "assistant":
                    text = msg.get("text", msg.get("content", ""))
                    if text:
                        print(f"  [assistant] {text[:200]}")
                elif t == "result":
                    print(f"  [result] done. tokens={msg.get('usage', {})}")
                elif t == "pong":
                    pass
                else:
                    preview = json.dumps(msg)[:150]
                    print(f"  [{t or '?'}] {preview}")
        except asyncio.TimeoutError:
            print("\n[timeout] no messages for 30s — agent is likely idle.")
        except KeyboardInterrupt:
            print("\n[interrupted]")


def usage():
    print("Usage:")
    print("  python test_pool.py send <cwd> <sessionId> <mode> <prompt>")
    print("  python test_pool.py status")
    print("  python test_pool.py reconnect <cwd> <sessionId> <mode> [prompt]")
    print()
    print("Example:")
    print('  python test_pool.py send /tmp "" general "list files in current dir"')
    print("  python test_pool.py status")
    print('  python test_pool.py reconnect /tmp bz-XXXX general "what was my last question?"')
    sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        usage()

    cmd = sys.argv[1]
    if cmd == "send" and len(sys.argv) >= 6:
        asyncio.run(send_prompt(sys.argv[2], sys.argv[3], sys.argv[4], " ".join(sys.argv[5:])))
    elif cmd == "status":
        asyncio.run(check_status())
    elif cmd == "reconnect" and len(sys.argv) >= 5:
        prompt = " ".join(sys.argv[5:]) if len(sys.argv) > 5 else ""
        asyncio.run(reconnect(sys.argv[2], sys.argv[3], sys.argv[4], prompt))
    else:
        usage()
