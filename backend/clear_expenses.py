#!/usr/bin/env python3
"""
Script to clear all data from the expenses table
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
        # Get current count
        count_result = connection.execute(text("SELECT COUNT(*) FROM expenses"))
        current_count = count_result.scalar()
        print(f"Current expenses in table: {current_count}")
        
        if current_count > 0:
            # Clear the table
            connection.execute(text("TRUNCATE TABLE expenses"))
            connection.commit()
            print("✅ Expenses table cleared successfully!")
            
            # Verify
            count_result = connection.execute(text("SELECT COUNT(*) FROM expenses"))
            new_count = count_result.scalar()
            print(f"Expenses remaining: {new_count}")
        else:
            print("ℹ️  Table is already empty")
            
except Exception as e:
    print(f"❌ Error: {str(e)}")
    sys.exit(1)

print("✅ Done!")
