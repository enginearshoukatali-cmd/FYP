import sqlite3
from datetime import datetime, timedelta

conn = sqlite3.connect("khanmigo_v3.db")
c = conn.cursor()

token = "mysecretteacher123"
role = "teacher"
expiry = datetime.now() + timedelta(days=7)

try:
    c.execute("INSERT INTO institution_invitations (token, role, institution_name, expires_at) VALUES (?, ?, 'System', ?)",
              (token, role, expiry))
    conn.commit()
    print(f"✅ Invitation Token Generated Successfully: {token}")
except Exception as e:
    print(f"❌ Error: {e}")
finally:
    conn.close()