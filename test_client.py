import asyncio
import json

try:
    import websockets
except ImportError:
    raise SystemExit("Missing dependency: pip install websockets")


async def main():
    async with websockets.connect("ws://localhost:8765") as ws:
        # Wait for the session init message
        session = json.loads(await ws.recv())
        print(f"session: {session.get('sessionId')} | dir: {session.get('workingDir')}\n")

        # Send "hi"
        await ws.send(json.dumps({"type": "user", "content": "hi"}))

        # Print all responses until idle
        while True:
            msg = json.loads(await ws.recv())
            msg_type = msg.get("type")

            if msg_type == "delta":
                # Print streaming tokens inline without newlines
                if msg.get("field") != "signature" and msg.get("blockType") != "toolUse":
                    print(msg.get("content", ""), end="", flush=True)
            elif msg_type == "assistant":
                print()  # newline after streaming
            elif msg_type == "status":
                print(f"[status] {msg.get('status')}")
                if msg.get("status") == "idle":
                    break
            elif msg_type == "result":
                print(f"[result] {msg.get('status')}")
            elif msg_type == "prompt":
                if msg.get("subtype") == "permission":
                    print(f"[permission] auto-allowing: {msg.get('tool')}")
                    await ws.send(json.dumps({
                        "type": "user",
                        "subtype": "permission",
                        "requestId": msg.get("requestId"),
                        "behavior": "allow",
                    }))
            else:
                print(f"[{msg_type}] {json.dumps(msg)}")


asyncio.run(main())
