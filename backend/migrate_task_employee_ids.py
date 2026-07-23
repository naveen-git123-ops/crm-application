#!/usr/bin/env python3
"""
Migration script to fix task employee IDs
This script converts any task assigned_to_employee_id and created_by_employee_id 
from UUID format to human-readable employee_id format.

Run this script after deploying the task assignment fixes.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Database setup
DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=3600)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db_models():
    """Import models after database is configured"""
    from server import TaskModel, EmployeeModel
    return TaskModel, EmployeeModel

def migrate_task_ids():
    """Migrate task employee IDs from UUID to human-readable format"""
    db = SessionLocal()
    try:
        TaskModel, EmployeeModel = get_db_models()
        
        # Get all tasks
        tasks = db.query(TaskModel).all()
        print(f"Found {len(tasks)} tasks to check")
        
        migrated_count = 0
        error_count = 0
        
        for task in tasks:
            try:
                # Check assigned_to_employee_id
                if task.assigned_to_employee_id:
                    # Try to find if it's a UUID that needs conversion
                    employee = db.query(EmployeeModel).filter(
                        EmployeeModel.id == task.assigned_to_employee_id
                    ).first()
                    
                    if employee:
                        # Found by UUID, update to employee_id
                        old_value = task.assigned_to_employee_id
                        task.assigned_to_employee_id = employee.employee_id
                        print(f"Task {task.task_id}: Updated assigned_to from {old_value[:8]}... to {employee.employee_id}")
                        migrated_count += 1
                    else:
                        # Check if it's already in the correct format
                        employee_check = db.query(EmployeeModel).filter(
                            EmployeeModel.employee_id == task.assigned_to_employee_id
                        ).first()
                        
                        if not employee_check:
                            print(f"⚠️  Task {task.task_id}: assigned_to_employee_id '{task.assigned_to_employee_id}' not found in employees")
                            error_count += 1
                
                # Check created_by_employee_id  
                if task.created_by_employee_id:
                    employee = db.query(EmployeeModel).filter(
                        EmployeeModel.id == task.created_by_employee_id
                    ).first()
                    
                    if employee:
                        # Found by UUID, update to employee_id
                        old_value = task.created_by_employee_id
                        task.created_by_employee_id = employee.employee_id
                        print(f"Task {task.task_id}: Updated created_by from {old_value[:8]}... to {employee.employee_id}")
                        migrated_count += 1
                    else:
                        # Check if it's already in the correct format
                        employee_check = db.query(EmployeeModel).filter(
                            EmployeeModel.employee_id == task.created_by_employee_id
                        ).first()
                        
                        if not employee_check:
                            print(f"⚠️  Task {task.task_id}: created_by_employee_id '{task.created_by_employee_id}' not found in employees")
                            error_count += 1
                            
            except Exception as e:
                print(f"❌ Error processing task {task.task_id}: {e}")
                error_count += 1
        
        # Commit all changes
        db.commit()
        print(f"\n✅ Migration complete!")
        print(f"   • Migrated: {migrated_count} fields")
        print(f"   • Errors: {error_count}")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Migration failed: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    print("Starting task employee ID migration...")
    migrate_task_ids()
