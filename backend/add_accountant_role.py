"""
Script to add the Accountant role to an existing database.
Run this if you already have roles in your database.
"""

import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, String, Integer, DateTime, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from pathlib import Path
import json
from datetime import datetime
import uuid

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable is not set")
    sys.exit(1)

# Create engine
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Define RoleModel
class RoleModel(Base):
    __tablename__ = "roles"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), unique=True, index=True)
    permissions = Column(String(1000))
    is_system = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.now)

try:
    db = SessionLocal()
    
    # Check if Accountant role already exists
    existing = db.query(RoleModel).filter(RoleModel.name == "Accountant").first()
    if existing:
        print("✓ Accountant role already exists")
        sys.exit(0)
    
    # Create Accountant role
    accountant_permissions = [
        "expenses",        # Can view and approve expenses
        "workspace",       # Can access workspace settings
        "documents",       # Can view documents
        "settings"         # Can view settings
    ]
    
    accountant_role = RoleModel(
        id=str(uuid.uuid4()),
        name="Accountant",
        permissions=json.dumps(accountant_permissions),
        is_system=0,
        created_at=datetime.now()
    )
    
    db.add(accountant_role)
    db.commit()
    
    print("✅ Accountant role created successfully!")
    print(f"   Permissions: {', '.join(accountant_permissions)}")
    print("\nYou can now create users with the Accountant role.")
    print("These users will be able to approve expenses at the first level (Accountant approval).")
    
except Exception as e:
    print(f"❌ Error: {str(e)}")
    db.rollback()
    sys.exit(1)
finally:
    db.close()
    engine.dispose()
