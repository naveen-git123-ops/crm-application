#!/usr/bin/env python3
"""
Database Setup Script for CRM Application
This script should be run on the EC2 instance to initialize the RDS database

Usage:
    python setup_database.py

Author: DevOps
Date: 2026-02-14
"""

import os
import sys
import json
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from server import (
    Base, engine, SessionLocal,
    UserModel, EmployeeModel, RoleModel, LeavePolicyModel,
    hash_password
)

def create_tables():
    """Create all database tables"""
    print("[*] Creating database tables...")
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ Database tables created successfully!")
        return True
    except Exception as e:
        print(f"❌ Error creating tables: {e}")
        return False

def seed_roles():
    """Seed default roles"""
    print("[*] Seeding default roles...")
    db = SessionLocal()
    try:
        # Check if roles already exist
        existing_roles = db.query(RoleModel).count()
        if existing_roles > 0:
            print(f"⚠️  Roles already exist ({existing_roles} found), skipping...")
            return True
        
        DEFAULT_PERMISSION_KEYS = [
            "dashboard", "leads", "employees", "attendance", "leaves", "expenses",
            "roles", "workspace", "idcards", "documents", "settings", "holidays"
        ]
        
        roles = [
            RoleModel(
                name="Admin",
                permissions=json.dumps(DEFAULT_PERMISSION_KEYS),
                is_system=1
            ),
            RoleModel(
                name="HR",
                permissions=json.dumps([
                    "employees", "attendance", "leaves", "expenses", 
                    "workspace", "idcards", "documents", "settings", "holidays"
                ]),
                is_system=0
            ),
            RoleModel(
                name="Manager",
                permissions=json.dumps([
                    "leads", "employees", "attendance", "leaves", "expenses",
                    "workspace", "idcards", "documents", "settings", "holidays"
                ]),
                is_system=0
            ),
            RoleModel(
                name="Employee",
                permissions=json.dumps([
                    "attendance", "leaves", "expenses",
                    "workspace", "documents", "settings", "holidays"
                ]),
                is_system=0
            ),
        ]
        
        for role in roles:
            db.add(role)
        
        db.commit()
        print(f"✅ Created {len(roles)} roles")
        return True
    except Exception as e:
        print(f"❌ Error seeding roles: {e}")
        db.rollback()
        return False
    finally:
        db.close()

def seed_admin_user():
    """Create default admin user"""
    print("[*] Creating admin user...")
    db = SessionLocal()
    try:
        # Check if admin already exists
        admin = db.query(UserModel).filter(UserModel.email == "admin@resoline.in").first()
        if admin:
            print("⚠️  Admin user already exists, skipping...")
            return True
        
        # Create admin employee first
        admin_employee = db.query(EmployeeModel).filter(
            EmployeeModel.employee_id == "EMP0001"
        ).first()
        
        if not admin_employee:
            admin_employee = EmployeeModel(
                employee_id="EMP0001",
                name="Admin User",
                email="admin@resoline.in",
                department="Management",
                job_role="Administrator",
                joining_date="2024-01-01",
                salary=100000.0,
                status="Active"
            )
            db.add(admin_employee)
            db.commit()
        
        # Create admin user
        admin_user = UserModel(
            email="admin@resoline.in",
            password=hash_password("admin123"),
            name="Admin User",
            role="Admin",
            employee_id="EMP0001"
        )
        db.add(admin_user)
        db.commit()
        
        print("[✓] Admin user created:")
        print(f"    Email: admin@resoline.in")
        print(f"    Password: admin123")
        print(f"    Role: Admin")
        return True
    except Exception as e:
        print(f"❌ Error creating admin user: {e}")
        db.rollback()
        return False
    finally:
        db.close()

def seed_sample_employees():
    """Create sample employee records"""
    print("[*] Creating sample employees...")
    db = SessionLocal()
    try:
        existing_count = db.query(EmployeeModel).count()
        if existing_count > 1:
            print(f"⚠️  Employees already exist ({existing_count} found), skipping...")
            return True
        
        sample_employees = [
            {
                "employee_id": "EMP0002",
                "name": "John Doe",
                "email": "john.doe@resoline.in",
                "department": "Sales",
                "job_role": "Sales Executive",
                "joining_date": "2024-01-15",
                "salary": 50000.0,
            },
            {
                "employee_id": "EMP0003",
                "name": "Jane Smith",
                "email": "jane.smith@resoline.in",
                "department": "HR",
                "job_role": "HR Manager",
                "joining_date": "2024-01-10",
                "salary": 60000.0,
            },
            {
                "employee_id": "EMP0004",
                "name": "Mike Johnson",
                "email": "mike.johnson@resoline.in",
                "department": "Operations",
                "job_role": "Operations Manager",
                "joining_date": "2024-01-05",
                "salary": 55000.0,
            },
        ]
        
        for emp_data in sample_employees:
            employee = EmployeeModel(**emp_data)
            db.add(employee)
        
        db.commit()
        print(f"✅ Created {len(sample_employees)} sample employees")
        return True
    except Exception as e:
        print(f"❌ Error creating sample employees: {e}")
        db.rollback()
        return False
    finally:
        db.close()

def seed_leave_policy():
    """Create default leave policy"""
    print("[*] Creating leave policy...")
    db = SessionLocal()
    try:
        existing = db.query(LeavePolicyModel).first()
        if existing:
            print("⚠️  Leave policy already exists, skipping...")
            return True
        
        policy = LeavePolicyModel(paid_leaves_per_year=12)
        db.add(policy)
        db.commit()
        print("✅ Leave policy created (12 paid leaves per year)")
        return True
    except Exception as e:
        print(f"❌ Error creating leave policy: {e}")
        db.rollback()
        return False
    finally:
        db.close()

def main():
    """Main setup flow"""
    print("=" * 60)
    print("CRM DATABASE SETUP")
    print("=" * 60)
    print()
    
    # Verify database connection
    print("[*] Verifying database connection...")
    try:
        with engine.connect() as conn:
            conn.execute("SELECT 1")
        print("✅ Database connection successful!")
    except Exception as e:
        print(f"❌ Cannot connect to database: {e}")
        print("\nMake sure:")
        print("  1. RDS instance is running")
        print("  2. Security group allows inbound traffic on port 5432")
        print("  3. DATABASE_URL in .env is correct")
        return False
    
    print()
    
    # Step 1: Create tables
    if not create_tables():
        return False
    print()
    
    # Step 2: Seed roles
    if not seed_roles():
        return False
    print()
    
    # Step 3: Create admin user
    if not seed_admin_user():
        return False
    print()
    
    # Step 4: Create sample employees
    if not seed_sample_employees():
        return False
    print()
    
    # Step 5: Create leave policy
    if not seed_leave_policy():
        return False
    print()
    
    print("=" * 60)
    print("✅ DATABASE SETUP COMPLETED SUCCESSFULLY!")
    print("=" * 60)
    print()
    print("You can now login with:")
    print("  Email: admin@resoline.in")
    print("  Password: admin123")
    print()
    print("API Endpoint: https://api.resoline.in/api/auth/login")
    print()
    
    return True

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
