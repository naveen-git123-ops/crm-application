import json
import os
import time
import urllib.request
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv(Path(__file__).resolve().parent / ".env")
token = os.environ["TELEGRAM_BOT_TOKEN"]
base = f"https://api.telegram.org/bot{token}"

def tg(method, body=None):
    url = f"{base}/{method}"
    if body is None:
        with urllib.request.urlopen(url, timeout=25) as r:
            return json.loads(r.read().decode())
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode())

print("=== getMe ===")
print(json.dumps(tg("getMe"), indent=2))

print("\n=== getWebhookInfo ===")
info = tg("getWebhookInfo")
print(json.dumps(info, indent=2))

print("\n=== POST webhook health ===")
t0 = time.time()
payload = json.dumps({"update_id": 1}).encode()
req = urllib.request.Request(
    "https://api.resoline.in/api/telegram/webhook",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        print("ok", r.status, r.read().decode(), f"took {time.time()-t0:.2f}s")
except Exception as e:
    print("FAIL", type(e).__name__, e, f"after {time.time()-t0:.2f}s")

print("\n=== sendMessage to Pritam ===")
print(json.dumps(tg("sendMessage", {"chat_id": "1232642486", "text": "Bot can message you. Reply with /punchin now — testing delivery."}), indent=2)[:500])

print("\n=== EMP0018 attendance today ===")
engine = create_engine(os.environ["DATABASE_URL"])
with engine.connect() as c:
    rows = c.execute(text(
        "SELECT date, punch_in, punch_out, is_active_session FROM attendance "
        "WHERE employee_id='EMP0018' AND date=DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+05:30'), '%Y-%m-%d')"
    )).mappings().all()
    # also explicit date
    rows2 = c.execute(text(
        "SELECT date, punch_in, punch_out, is_active_session FROM attendance "
        "WHERE employee_id='EMP0018' AND date='2026-08-05'"
    )).mappings().all()
    print("ist-ish:", [dict(r) for r in rows])
    print("2026-08-05:", [dict(r) for r in rows2])
