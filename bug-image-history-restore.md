# Bug: Image messages missing when reloading chat history

## Summary

User messages that contain an image attachment are silently dropped when the web interface reloads an existing session's chat history. Only text-only messages are restored; any message that included an image (with or without accompanying text) disappears from the UI.

## Root cause

In `src/routes/_app/agent.tsx`, the `restoreHistory()` function at ~line 3275 converts raw server history into display items. User messages are stored in two shapes:

- **Plain text:** `{ role: "user", content: "some text" }`
- **Image + text (or image only):** `{ role: "user", content: [ {type:"text", text:"..."}, {type:"image", source:{type:"base64", mediaType:"image/png", data:"..."}} ] }`

Two places in `restoreHistory` checked only for the string form:

**1. `firstRealIdx` finder** — determines which message starts the real conversation (skipping the handshake):

```typescript
// BEFORE (broken): only inspects string content; array messages always return false
const firstRealIdx = history.findIndex(m => {
  if (m.role !== 'user' || m.isMeta) return false;
  if (typeof m.content === 'string') return m.content !== HANDSHAKE_TEXT;
  return false;  // ← array messages fall through as "not real"
});
```

If the first real message contained an image, `firstRealIdx` would be -1 and the entire history would be discarded.

**2. Main restoration loop** — builds the `restored` display item list:

```typescript
// BEFORE (broken): skips every non-string user message
for (const m of conversationHistory) {
  if (m.role !== 'user' || typeof m.content !== 'string') continue;  // ← drops image messages
  ...
}
```

Every user message with array content (i.e. any message with an image) was silently skipped.

## Fix

Both checks were updated to handle array content.

**1. `firstRealIdx` finder:**

```typescript
const firstRealIdx = history.findIndex(m => {
  if (m.role !== 'user' || m.isMeta) return false;
  if (typeof m.content === 'string') return m.content !== HANDSHAKE_TEXT;
  if (Array.isArray(m.content)) {
    return (m.content as Array<Record<string, unknown>>).some(
      b => b['type'] === 'text' || b['type'] === 'image'
    );
  }
  return false;
});
```

**2. Main restoration loop:**

```typescript
if (m.role === 'user') {
  let text: string;
  let attachments: AnyAttachment[] | undefined;

  if (typeof m.content === 'string') {
    text = m.content;
  } else if (Array.isArray(m.content)) {
    const blocks = m.content as Array<Record<string, unknown>>;
    // extract text from text blocks
    text = blocks
      .filter(b => b['type'] === 'text')
      .map(b => String(b['text'] ?? ''))
      .join('');
    // extract images from image blocks
    const imgBlocks = blocks.filter(b => b['type'] === 'image');
    if (imgBlocks.length) {
      attachments = imgBlocks.map(b => {
        const src = b['source'] as Record<string, unknown> | undefined;
        return {
          data:      String(src?.['data'] ?? ''),
          mediaType: String(src?.['mediaType'] ?? 'image/png'),
          name:      'image',
        } as AnyAttachment;
      });
    }
    // skip toolResult array messages (no text/image blocks → both empty)
    if (!text && !attachments?.length) continue;
  } else {
    continue;
  }
  ...
  restored.push({ id: uid(), kind: 'user', text: text || '(image)', attachments });
}
```

The `toolResult` messages (also array content but containing `{type:"toolResult"}` blocks) are safely skipped because they produce no text and no attachments, hitting the `if (!text && !attachments?.length) continue` guard.

## Affected file

`src/routes/_app/agent.tsx` — `restoreHistory()` function (~line 3275)

## Deployment

Fix included in `bz-agent-v0.3.0.zip` (frontend version 0.2.0, backend version 0.3.0).

## Note for mobile

The mobile app (`bz-vibes`) has its own chat history loading logic and needs the equivalent fix applied separately.
