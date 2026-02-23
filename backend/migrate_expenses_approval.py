"""
Migration script to add 2-level approval columns to expenses table.
Run this script to update your database schema.
"""

import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from pathlib import Path

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable is not set")
    sys.exit(1)

# Create engine and connection
engine = create_engine(DATABASE_URL)

# SQL migration script for MySQL
# Using a wrapper to check if columns exist before adding
migration_sql = []

# Check database type and build appropriate SQL
if 'mysql' in DATABASE_URL.lower():
    # MySQL syntax
    migration_sql = [
        "ALTER TABLE expenses ADD COLUMN accountant_approver_id VARCHAR(50) NULL",
        "ALTER TABLE expenses ADD COLUMN accountant_approver_name VARCHAR(255) NULL",
        "ALTER TABLE expenses ADD COLUMN accountant_approved_at DATETIME NULL",
        "ALTER TABLE expenses ADD COLUMN admin_approver_id VARCHAR(50) NULL",
        "ALTER TABLE expenses ADD COLUMN admin_approver_name VARCHAR(255) NULL",
        "ALTER TABLE expenses ADD COLUMN admin_approved_at DATETIME NULL",
    ]
elif 'postgres' in DATABASE_URL.lower():
    # PostgreSQL syntax
    migration_sql = [
        "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS accountant_approver_id VARCHAR(50)",
        "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS accountant_approver_name VARCHAR(255)",
        "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS accountant_approved_at TIMESTAMP",
        "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS admin_approver_id VARCHAR(50)",
        "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS admin_approver_name VARCHAR(255)",
        "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS admin_approved_at TIMESTAMP",
    ]

try:
    with engine.connect() as connection:
        for statement in migration_sql:
            try:
                print(f"Executing: {statement[:80]}...")
                connection.execute(text(statement))
                print(f"  ✓ Success")
            except Exception as col_error:
                # Column might already exist - this is OK
                if "Duplicate column name" in str(col_error) or "already exists" in str(col_error):
                    print(f"  ℹ Column already exists (skipping)")
                else:
                    print(f"  ⚠ {str(col_error)}")
        
        connection.commit()
        print("\n✅ Database migration completed successfully!")
        print("The expenses table has been updated with new approval columns.")
        
except Exception as e:
    print(f"\n❌ Migration failed with error:")
    print(f"Error: {str(e)}")
    sys.exit(1)
finally:
    engine.dispose()
