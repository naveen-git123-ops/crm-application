#!/usr/bin/env python3
"""
RDS Database Initialization Script
Standalone script to initialize CRM RDS PostgreSQL database
No dependencies on server.py imports

Usage:
    python init_rds.py

Author: DevOps
Date: 2026-02-14
"""

import os
import sys
import json
import uuid
from pathlib import Path
from dotenv import load_dotenv
import warnings
import bcrypt

# Suppress deprecation warnings
warnings.filterwarnings('ignore', category=DeprecationWarning)

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# SQLAlchemy imports
from sqlalchemy import create_engine, Column, String, Float, Integer, DateTime, func, cast
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy import text
from datetime import datetime

# Initialize Base
Base = declarative_base()

# ============= DATABASE MODELS =============

class UserModel(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True)
    password = Column(String)
    name = Column(String)
    role = Column(String)
    employee_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.now)


class RoleModel(Base):
    __tablename__ = "roles"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, unique=True, index=True)
    permissions = Column(String)  # JSON array of permission keys
    is_system = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.now)


class EmployeeModel(Base):
    __tablename__ = "employees"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String, unique=True, index=True)
    name = Column(String)
    email = Column(String, unique=True, index=True)
    phone = Column(String, nullable=True)
    department = Column(String)
    job_role = Column(String)
    joining_date = Column(String)
    salary = Column(Float)
    status = Column(String, default='Active')
    profile_photo = Column(String, nullable=True)
    address = Column(String, nullable=True)
    emergency_contact = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.now)


class LeavePolicyModel(Base):
    __tablename__ = "leave_policy"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    paid_leaves_per_year = Column(Integer, default=12)
    created_at = Column(DateTime, default=datetime.now)


# ============= UTILITY FUNCTIONS =============

def hash_password(password: str) -> str:
    """Hash password using bcrypt"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode(), salt).decode()


def get_engine_and_session():
    """Create SQLAlchemy engine and session for RDS PostgreSQL"""
    DATABASE_URL = os.environ.get('DATABASE_URL')
    
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL not found in .env file")
    
    # PostgreSQL with connection pooling
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=3600)
    
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return engine, SessionLocal


# ============= SETUP FUNCTIONS =============

def verify_connection(engine):
    """Verify database connection"""
    print("[*] Verifying database connection...")
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("✅ Database connection successful!")
        return True
    except Exception as e:
        print(f"❌ Cannot connect to database: {e}")
        print("\n🔧 Troubleshooting RDS Connection:")
        print("  1. ✓ RDS instance is running (check AWS RDS Console)")
        print("  2. ✓ Security Group allows port 5432 from EC2")
        print("  3. ✓ DATABASE_URL format: postgresql://user:password@host:port/dbname")
        print("  4. ✓ RDS password URL-encoded if it has special characters")
        print("  5. ✓ No Network ACLs blocking TCP 5432")
        print(f"\nError details: {type(e).__name__}: {str(e)}")
        return False


def create_tables(engine):
    """Create all database tables"""
    print("[*] Creating database tables...")
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ Database tables created successfully!")
        return True
    except Exception as e:
        print(f"❌ Error creating tables: {e}")
        import traceback
        traceback.print_exc()
        return False


def check_existing_data(SessionLocal):
    """Check if database already initialized"""
    print("[*] Checking existing data...")
    try:
        db = SessionLocal()
        user_count = db.query(UserModel).count()
        role_count = db.query(RoleModel).count()
        emp_count = db.query(EmployeeModel).count()
        db.close()
        
        if user_count > 0 or role_count > 0 or emp_count > 0:
            print(f"⚠️  Database already has data:")
            print(f"    • Users: {user_count}")
            print(f"    • Roles: {role_count}")
            print(f"    • Employees: {emp_count}")
            return True
        return False
    except Exception as e:
        print(f"ℹ️  Tables exist but are empty (first run)")
        return False


def seed_roles(SessionLocal):
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


def seed_admin_user(SessionLocal):
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


def seed_sample_employees(SessionLocal):
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


def seed_leave_policy(SessionLocal):
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
    print("=" * 70)
    print("CRM DATABASE SETUP - RDS PostgreSQL")
    print("=" * 70)
    print()
    
    # Check environment
    print("[*] Checking environment variables...")
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        print("❌ DATABASE_URL not found in .env")
        return False
    print(f"✅ DATABASE_URL configured")
    print()
    
    # Get engine and session
    try:
        engine, SessionLocal = get_engine_and_session()
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    
    # Verify connection
    if not verify_connection(engine):
        return False
    print()
    
    # Create tables
    if not create_tables(engine):
        return False
    print()
    
    # Check if already initialized
    if check_existing_data(SessionLocal):
        print("ℹ️  Database already initialized - skipping data population")
        print()
        return True
    
    print()
    
    # Seed data
    if not seed_roles(SessionLocal):
        return False
    print()
    
    if not seed_admin_user(SessionLocal):
        return False
    print()
    
    if not seed_sample_employees(SessionLocal):
        return False
    print()
    
    if not seed_leave_policy(SessionLocal):
        return False
    print()
    
    # Success
    print("=" * 70)
    print("✅ DATABASE SETUP COMPLETED SUCCESSFULLY!")
    print("=" * 70)
    print()
    print("RDS Database initialized with:")
    print("  ✓ All tables created")
    print("  ✓ 4 Roles configured (Admin, HR, Manager, Employee)")
    print("  ✓ Admin user created")
    print("  ✓ 3 Sample employees added")
    print("  ✓ Leave policy configured (12 leaves/year)")
    print()
    print("Default Login Credentials:")
    print("  Email: admin@resoline.in")
    print("  Password: admin123")
    print()
    print("Next Steps:")
    print("  1. Change admin password in production")
    print("  2. Start backend: uvicorn server:app --host 0.0.0.0 --port 8000")
    print("  3. API: https://api.resoline.com/api/auth/login")
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
