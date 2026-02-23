"""
Migration script to add completion_percentage column to tasks table
"""
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

# Get database URL from environment
DATABASE_URL = os.getenv('DATABASE_URL')

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable not set")

print(f"Connecting to database: {DATABASE_URL}")

try:
    engine = create_engine(DATABASE_URL)
    
    with engine.connect() as connection:
        # Check if column already exists
        try:
            result = connection.execute(text(
                "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
                "WHERE TABLE_NAME = 'tasks' AND COLUMN_NAME = 'completion_percentage'"
            ))
            
            if result.fetchone():
                print("✓ Column 'completion_percentage' already exists in tasks table")
            else:
                # Column doesn't exist, add it
                print("Adding 'completion_percentage' column to tasks table...")
                connection.execute(text(
                    "ALTER TABLE tasks ADD COLUMN completion_percentage INT DEFAULT 0"
                ))
                connection.commit()
                print("✓ Column 'completion_percentage' added successfully!")
                
        except Exception as e:
            print(f"Error checking/adding column: {e}")
            raise
            
except Exception as e:
    print(f"✗ Error connecting to database: {e}")
    raise

print("\n✓ Migration completed successfully!")
