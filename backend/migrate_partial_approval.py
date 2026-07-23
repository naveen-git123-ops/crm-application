#!/usr/bin/env python3
"""
Script to add partial approval columns to expenses table
"""
import os
import sys
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get database URL from environment
DATABASE_URL = os.environ.get('DATABASE_URL')

if not DATABASE_URL:
    print("❌ DATABASE_URL not found in .env file")
    sys.exit(1)

print(f"Connecting to database...")

try:
    engine = create_engine(DATABASE_URL)
    
    with engine.connect() as connection:
        statements = [
            ("ALTER TABLE expenses ADD COLUMN accountant_approved_amount FLOAT NULL", 
             "Amount approved by Accountant (null if fully rejected or fully approved)"),
            ("ALTER TABLE expenses ADD COLUMN accountant_approval_reason VARCHAR(500) NULL", 
             "Reason for partial approval or rejection"),
        ]
        
        for sql, description in statements:
            try:
                print(f"\nExecuting: {sql}")
                print(f"  Description: {description}")
                connection.execute(text(sql))
                connection.commit()
                print(f"  ✓ Success")
            except Exception as e:
                if "Duplicate column" in str(e):
                    print(f"  ⓘ Column already exists")
                else:
                    print(f"  ✗ Error: {str(e)}")
                connection.rollback()
        
        print("\n✅ Database migration completed successfully!")
            
except Exception as e:
    print(f"❌ Error: {str(e)}")
    sys.exit(1)
