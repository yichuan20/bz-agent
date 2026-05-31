import asyncio
import json

try:
    import websockets
except ImportError:
    raise SystemExit("Missing dependency: pip install websockets")


async def main():
    async with websockets.connect("ws://localhost:8765") as ws:
        session = json.loads(await ws.recv())
        print(f"session: {session.get('sessionId')} | dir: {session.get('workingDir')}\n")

        await ws.send(json.dumps({"type": "user", "content": "pwd"}))

        while True:
            msg = json.loads(await ws.recv())
            msg_type = msg.get("type")

            if msg_type == "delta":
                if msg.get("field") != "signature" and msg.get("blockType") != "toolUse":
                    print(msg.get("content", ""), end="", flush=True)
            elif msg_type == "assistant":
                print()
            elif msg_type == "tool":
                status = msg.get("status")
                if status == "running":
                    print(f"[tool running] {msg.get('name')}: {json.dumps(msg.get('input'))}")
                elif status == "done":
                    print(f"[tool done] {msg.get('content', '').strip()}")
                elif status == "error":
                    print(f"[tool error] {msg.get('message')}")
            elif msg_type == "prompt":
                subtype = msg.get("subtype")
                if subtype == "permission":
                    print(f"[permission] auto-allowing: {msg.get('tool')} {json.dumps(msg.get('input'))}")
                    await ws.send(json.dumps({
                        "type": "user",
                        "subtype": "permission",
                        "requestId": msg.get("requestId"),
                        "behavior": "allow",
                    }))
            elif msg_type == "status":
                print(f"[status] {msg.get('status')}")
                if msg.get("status") == "idle":
                    break
            elif msg_type == "result":
                print(f"[result] {msg.get('status')}")
            else:
                print(f"[{msg_type}] {json.dumps(msg)}")


asyncio.run(main())
