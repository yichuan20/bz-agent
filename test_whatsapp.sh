#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Simulate a Twilio WhatsApp webhook — no real phone needed.
#
#  Usage:
#    chmod +x test_whatsapp.sh
#    ./test_whatsapp.sh "hello, what is 2+2?"
#
#  What happens:
#    1. A fake Twilio POST hits /whatsapp/incoming
#    2. The server spawns (or reuses) a bzcode process in ./whatsapp/
#    3. The response would normally go back to Twilio — check server logs.
#
#  To also see what would be sent back to WhatsApp, watch the server logs:
#    journalctl -u bz-agent-server -f
#    # OR if running in the foreground, just watch stdout/stderr
# ─────────────────────────────────────────────────────────────

API="http://localhost:5081"
FROM="whatsapp:+15550001234"   # fake sender number
MSG="${1:-hello, what files are in the current directory?}"

echo "Simulating WhatsApp message from $FROM:"
echo "  \"$MSG\""
echo ""

RESPONSE=$(curl -sf -X POST "$API/whatsapp/incoming" \
  --data-urlencode "From=$FROM" \
  --data-urlencode "Body=$MSG" \
  --data-urlencode "NumMedia=0" \
  --data-urlencode "MessageSid=SMtest$(date +%s)")

echo "Webhook response (TwiML): $RESPONSE"
echo ""
echo "→ The actual bzcode reply will be sent via Twilio to $FROM"
echo "  (no real SMS sent since TWILIO_FROM may be a sandbox number)"
echo ""
echo "Watch server logs for [whatsapp] lines:"
echo "  tail -f /tmp/bz-agent-server.log  (if redirected)"
echo "  OR: journalctl -u bz-agent-server -f"
