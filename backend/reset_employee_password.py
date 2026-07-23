#!/usr/bin/env python3
"""
Script to reset an employee's password in the database
"""

import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os
from pathlib import Path
from dotenv import load_dotenv
import bcrypt

# Load environment variables from .env file
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Database configuration
DB_URL = os.environ.get('DATABASE_URL')
if not DB_URL:
    print("❌ ERROR: DATABASE_URL environment variable is not set")
    print("Please ensure .env file exists with DATABASE_URL configured")
    sys.exit(1)

def hash_password(password: str) -> str:
    """Hash password using bcrypt (same method as in server.py)"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def reset_employee_password(employee_name: str, new_password: str, force=False):
    """Reset password for an employee by name"""
    
    # Create engine
    engine = create_engine(DB_URL)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        # Find user by employee name
        user = session.execute(
            text("SELECT id, email, name, employee_id FROM users WHERE name = :name"),
            {"name": employee_name}
        ).fetchone()
        
        if not user:
            print(f"❌ ERROR: Employee '{employee_name}' not found in users table")
            session.close()
            return False
        
        user_id, email, name, emp_id = user
        print(f"\nFound User:")
        print(f"  Name: {name}")
        print(f"  Email: {email}")
        print(f"  Employee ID: {emp_id}")
        print(f"\n⚠️  About to reset password to: {new_password}")
        
        # Ask for confirmation unless force flag is set
        if not force:
            confirm = input(f"\nAre you sure you want to reset the password? (yes/no): ").strip().lower()
            if confirm != 'yes':
                print("❌ Password reset cancelled.")
                session.close()
                return False
        
        # Hash the new password using the same method as server.py
        hashed_password = hash_password(new_password)
        
        # Update the password in the database
        session.execute(
            text("UPDATE users SET password = :password WHERE id = :id"),
            {"password": hashed_password, "id": user_id}
        )
        session.commit()
        
        print(f"\n✅ Password successfully reset for {name}")
        print(f"   New password: {new_password}")
        print(f"   Hashed as: {hashed_password[:30]}...")
        
        session.close()
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        session.rollback()
        session.close()
        sys.exit(1)

if __name__ == '__main__':
    print("=" * 100)
    print("RESET EMPLOYEE PASSWORD")
    print("=" * 100)
    print()
    
    # Check command line arguments
    if len(sys.argv) < 3:
        print("Usage: python reset_employee_password.py <employee_name> <new_password> [--force]")
        print("\nExample: python reset_employee_password.py 'HIMANSHU SAMAL' 'Jaysamal'")
        print("Example: python reset_employee_password.py 'HIMANSHU SAMAL' 'Jaysamal' --force")
        sys.exit(1)
    
    employee_name = sys.argv[1]
    new_password = sys.argv[2]
    force = '--force' in sys.argv
    
    if force:
        print("(Running in FORCE mode - no confirmation required)\n")
    
    reset_employee_password(employee_name, new_password, force=force)
