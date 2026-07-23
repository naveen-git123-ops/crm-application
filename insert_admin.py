import sqlite3
import bcrypt
import uuid
from datetime import datetime

conn = sqlite3.connect('backend/crm_db.sqlite3')
hashed_pw = bcrypt.hashpw('admin123'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
admin_id = str(uuid.uuid4())
created_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

conn.execute("""
INSERT INTO users (id, email, password, name, role, employee_id, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
""", (admin_id, 'admin@resoline.in', hashed_pw, 'Admin User', 'Admin', None, created_at))
conn.commit()
conn.close()
print("Admin user inserted.")
