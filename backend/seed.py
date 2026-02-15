import bcrypt
import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from server import Base, UserModel, EmployeeModel

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")

# Configure based on database type
if DATABASE_URL.startswith('mysql'):
    # MySQL configuration
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=3600)
else:
    # PostgreSQL configuration
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=3600)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def seed_data():
    # Create all tables
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    try:
        # Check if admin exists
        existing_admin = db.query(UserModel).filter(UserModel.email == 'admin@resoline.in').first()
        
        if not existing_admin:
            # Create admin user
            hashed_pw = bcrypt.hashpw('admin123'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            admin_user = UserModel(
                id='admin-001',
                email='admin@resoline.in',
                password=hashed_pw,
                name='Admin User',
                role='Admin'
            )
            db.add(admin_user)
            db.commit()
            print('✓ Admin user created: admin@resoline.in / admin123')
        else:
            print('✓ Admin user already exists')
        
        # Create some sample employees
        emp_count = db.query(EmployeeModel).count()
        if emp_count == 0:
            sample_employees = [
                EmployeeModel(
                    id='emp-001',
                    employee_id='EMP0001',
                    name='John Doe',
                    email='john@glasshq.com',
                    phone='+91 9876543210',
                    department='Engineering',
                    job_role='Senior Developer',
                    joining_date='2024-01-15',
                    salary=80000,
                    status='Active',
                    address='Mumbai, India',
                    emergency_contact='+91 9876543211'
                ),
                EmployeeModel(
                    id='emp-002',
                    employee_id='EMP0002',
                    name='Jane Smith',
                    email='jane@glasshq.com',
                    phone='+91 9876543212',
                    department='HR',
                    job_role='HR Manager',
                    joining_date='2024-02-01',
                    salary=65000,
                    status='Active',
                    address='Bangalore, India',
                    emergency_contact='+91 9876543213'
                ),
                EmployeeModel(
                    id='emp-003',
                    employee_id='EMP0003',
                    name='Robert Chen',
                    email='robert@glasshq.com',
                    phone='+91 9876543214',
                    department='Marketing',
                    job_role='Marketing Lead',
                    joining_date='2024-03-10',
                    salary=70000,
                    status='Active',
                    address='Delhi, India',
                    emergency_contact='+91 9876543215'
                )
            ]
            db.add_all(sample_employees)
            db.commit()
            print(f'✓ Created {len(sample_employees)} sample employees')
        else:
            print(f'✓ {emp_count} employees already exist')
        
        print('✓ Database seeding completed!')
        
    finally:
        db.close()

if __name__ == '__main__':
    seed_data()
