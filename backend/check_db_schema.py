import sqlite3

conn = sqlite3.connect('crm_db.sqlite3')
cursor = conn.cursor()
cursor.execute('PRAGMA table_info(tasks)')
columns = cursor.fetchall()

print("All columns in tasks table:")
for col in columns:
    print(f"  {col[1]}: {col[2]}")

# Check if completion_percentage exists
has_completion_pct = any('completion_percentage' in col[1] for col in columns)
print(f"\nCompletion percentage column exists: {has_completion_pct}")

conn.close()
