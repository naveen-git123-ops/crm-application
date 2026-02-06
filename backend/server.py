from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, String, Float, Integer, DateTime, func, cast
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.exc import IntegrityError
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
from calendar import monthrange
import jwt
import bcrypt
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import io
import uuid

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# SQLite Database Setup
DATABASE_URL = "sqlite:///./glasshq.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 168  # 7 days

# Create upload directory
UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

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

class AttendanceModel(Base):
    __tablename__ = "attendance"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String, index=True)
    employee_name = Column(String)
    date = Column(String, index=True)
    punch_in = Column(String, nullable=True)
    punch_out = Column(String, nullable=True)
    work_hours = Column(Float, default=0.0)
    status = Column(String, default='Present')
    created_at = Column(DateTime, default=datetime.now)

class LeaveModel(Base):
    __tablename__ = "leaves"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String, index=True)
    employee_name = Column(String)
    leave_type = Column(String)
    start_date = Column(String)
    end_date = Column(String)
    days = Column(Integer)
    reason = Column(String)
    status = Column(String, default='Pending')
    approver_id = Column(String, nullable=True)
    approver_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

class DocumentModel(Base):
    __tablename__ = "documents"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String, index=True)
    employee_name = Column(String)
    document_type = Column(String)
    file_name = Column(String)
    file_path = Column(String)
    expiry_date = Column(String, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.now)

# Create all tables
Base.metadata.create_all(bind=engine)

# ============= PYDANTIC MODELS =============

class UserRole(BaseModel):
    role: Literal['Admin', 'HR', 'Manager', 'Employee']

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: str
    role: Literal['Admin', 'HR', 'Manager', 'Employee']
    employee_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    employee_id: str
    role: Literal['Admin', 'HR', 'Manager', 'Employee'] = 'Employee'

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserDetails(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: EmailStr
    name: str
    role: Literal['Admin', 'HR', 'Manager', 'Employee']
    employee_id: Optional[str] = None
    created_at: datetime
    
    # Employee details (only for employees)
    phone: Optional[str] = None
    department: Optional[str] = None
    job_role: Optional[str] = None
    joining_date: Optional[str] = None
    salary: Optional[float] = None
    status: Optional[Literal['Active', 'Inactive']] = None
    profile_photo: Optional[str] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None

class Employee(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    employee_id: str
    name: str
    email: EmailStr
    phone: Optional[str] = None
    department: str
    job_role: str
    joining_date: str
    salary: float
    status: Literal['Active', 'Inactive'] = 'Active'
    profile_photo: Optional[str] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class EmployeeCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    department: str
    job_role: str
    joining_date: str
    salary: float
    address: Optional[str] = None
    emergency_contact: Optional[str] = None
    profile_photo: Optional[str] = None

class EmployeeUpdateProfile(BaseModel):
    phone: Optional[str] = None
    profile_photo: Optional[str] = None

class Attendance(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    employee_id: str
    employee_name: str
    date: str
    punch_in: Optional[str] = None
    punch_out: Optional[str] = None
    work_hours: float = 0.0
    status: Literal['Present', 'Absent', 'Late', 'Half Day'] = 'Present'
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AttendancePunch(BaseModel):
    employee_id: str
    action: Literal['punch_in', 'punch_out']

class AttendanceSummary(BaseModel):
    employee_id: str
    employee_name: str
    total_days: int
    present_days: int
    absent_days: int
    late_days: int
    half_day_days: int

class Leave(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    employee_id: str
    employee_name: str
    leave_type: Literal['Casual', 'Sick', 'Paid', 'WFH', 'Half Day']
    start_date: str
    end_date: str
    days: int
    reason: str
    status: Literal['Pending', 'Approved', 'Rejected'] = 'Pending'
    approver_id: Optional[str] = None
    approver_name: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LeaveCreate(BaseModel):
    employee_id: str
    employee_name: str
    leave_type: Literal['Casual', 'Sick', 'Paid', 'WFH', 'Half Day']
    start_date: str
    end_date: str
    days: int
    reason: str

class LeaveAction(BaseModel):
    status: Literal['Approved', 'Rejected']
    approver_id: str
    approver_name: str

class Document(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    employee_id: str
    employee_name: str
    document_type: str
    file_name: str
    file_path: str
    expiry_date: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DashboardStats(BaseModel):
    total_employees: int
    present_today: int
    absent_today: int
    pending_leaves: int
    total_departments: int

# ============= DEPENDENCY =============

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ============= HELPER FUNCTIONS =============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_access_token(user_id: str, email: str, role: str) -> str:
    expiration = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        'user_id': user_id,
        'email': email,
        'role': role,
        'exp': expiration
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = db.query(UserModel).filter(UserModel.id == payload['user_id']).first()
        if not user:
            raise HTTPException(status_code=401, detail='User not found')
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expired')
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Invalid token')

# ============= AUTH ROUTES =============

@api_router.post('/auth/register')
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    # Check if email is already registered
    existing_user = db.query(UserModel).filter(UserModel.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail='Email already registered')
    
    # Check if employee exists with the provided employee_id
    employee = db.query(EmployeeModel).filter(EmployeeModel.employee_id == user_data.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail='Employee ID not found. Please contact HR to get registered as an employee first.')
    
    # Check if this employee already has a registered user account
    existing_employee_user = db.query(UserModel).filter(UserModel.employee_id == user_data.employee_id).first()
    if existing_employee_user:
        raise HTTPException(status_code=400, detail='This employee ID is already registered. Please login instead.')
    
    # Verify that the email matches the employee's email
    if employee.email != user_data.email:
        raise HTTPException(status_code=400, detail='Email does not match the registered employee email.')
    
    hashed_pw = hash_password(user_data.password)
    new_user = UserModel(
        email=user_data.email,
        password=hashed_pw,
        name=user_data.name,
        role=user_data.role,
        employee_id=user_data.employee_id
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    token = create_access_token(new_user.id, new_user.email, new_user.role)
    
    # Prepare complete user details
    user_data = {
        'id': new_user.id,
        'email': new_user.email,
        'name': new_user.name,
        'role': new_user.role,
        'employee_id': new_user.employee_id,
        'created_at': new_user.created_at
    }
    
    # If user is an employee, fetch additional employee details
    if new_user.role == 'Employee' and new_user.employee_id:
        employee = db.query(EmployeeModel).filter(
            EmployeeModel.employee_id == new_user.employee_id
        ).first()
        
        if employee:
            user_data.update({
                'phone': employee.phone,
                'department': employee.department,
                'job_role': employee.job_role,
                'joining_date': employee.joining_date,
                'salary': employee.salary,
                'status': employee.status,
                'profile_photo': employee.profile_photo,
                'address': employee.address,
                'emergency_contact': employee.emergency_contact
            })
    
    return {'token': token, 'user': user_data}

@api_router.post('/auth/login')
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.password):
        raise HTTPException(status_code=401, detail='Invalid credentials')
    
    token = create_access_token(user.id, user.email, user.role)
    
    # Prepare complete user details
    user_data = {
        'id': user.id,
        'email': user.email,
        'name': user.name,
        'role': user.role,
        'employee_id': user.employee_id,
        'created_at': user.created_at
    }
    
    # If user is an employee, fetch additional employee details
    if user.role == 'Employee' and user.employee_id:
        employee = db.query(EmployeeModel).filter(
            EmployeeModel.employee_id == user.employee_id
        ).first()
        
        if employee:
            user_data.update({
                'phone': employee.phone,
                'department': employee.department,
                'job_role': employee.job_role,
                'joining_date': employee.joining_date,
                'salary': employee.salary,
                'status': employee.status,
                'profile_photo': employee.profile_photo,
                'address': employee.address,
                'emergency_contact': employee.emergency_contact
            })
    
    return {'token': token, 'user': user_data}

@api_router.get('/auth/me', response_model=UserDetails)
async def get_me(current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    # Base user details
    user_data = {
        'id': current_user.id,
        'email': current_user.email,
        'name': current_user.name,
        'role': current_user.role,
        'employee_id': current_user.employee_id,
        'created_at': current_user.created_at
    }
    
    # If user is an employee, fetch additional employee details
    if current_user.role == 'Employee' and current_user.employee_id:
        employee = db.query(EmployeeModel).filter(
            EmployeeModel.employee_id == current_user.employee_id
        ).first()
        
        if employee:
            user_data.update({
                'phone': employee.phone,
                'department': employee.department,
                'job_role': employee.job_role,
                'joining_date': employee.joining_date,
                'salary': employee.salary,
                'status': employee.status,
                'profile_photo': employee.profile_photo,
                'address': employee.address,
                'emergency_contact': employee.emergency_contact
            })
    
    return user_data

# ============= EMPLOYEE ROUTES =============

@api_router.post('/employees', response_model=Employee)
def create_employee(emp_data: EmployeeCreate, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ['Admin', 'HR']:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    max_emp_num = db.query(
        func.max(cast(func.substr(EmployeeModel.employee_id, 4), Integer))
    ).scalar()
    next_emp_num = (max_emp_num or 0) + 1
    emp_id = f'EMP{str(next_emp_num).zfill(4)}'
    
    new_employee = EmployeeModel(
        employee_id=emp_id,
        name=emp_data.name,
        email=emp_data.email,
        phone=emp_data.phone,
        department=emp_data.department,
        job_role=emp_data.job_role,
        joining_date=emp_data.joining_date,
        salary=emp_data.salary,
        address=emp_data.address,
        emergency_contact=emp_data.emergency_contact
    )
    db.add(new_employee)
    try:
        db.commit()
        db.refresh(new_employee)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail='Employee email or ID already exists')

    return new_employee

@api_router.get('/employees', response_model=List[Employee])
def get_employees(current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    employees = db.query(EmployeeModel).all()
    return employees

@api_router.get('/employees/{employee_id}', response_model=Employee)
def get_employee(employee_id: str, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    employee = db.query(EmployeeModel).filter(EmployeeModel.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail='Employee not found')
    return employee

@api_router.put('/employees/{employee_id}', response_model=Employee)
def update_employee(employee_id: str, emp_data: EmployeeCreate, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ['Admin', 'HR']:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    employee = db.query(EmployeeModel).filter(EmployeeModel.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail='Employee not found')
    
    for key, value in emp_data.model_dump().items():
        setattr(employee, key, value)
    db.commit()
    db.refresh(employee)
    
    return employee

@api_router.delete('/employees/{employee_id}')
def delete_employee(employee_id: str, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ['Admin', 'HR']:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    employee = db.query(EmployeeModel).filter(EmployeeModel.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail='Employee not found')
    
    db.delete(employee)
    db.commit()
    
    return {'message': 'Employee deleted successfully'}

@api_router.post('/employees/profile/photo-upload')
def upload_profile_photo(
    file: UploadFile = File(...),
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload profile photo for current employee"""
    try:
        # Find employee by email
        employee = db.query(EmployeeModel).filter(EmployeeModel.email == current_user.email).first()
        if not employee:
            raise HTTPException(status_code=404, detail='Employee record not found')
        
        # Create employee folder
        emp_folder = UPLOAD_DIR / employee.id
        emp_folder.mkdir(exist_ok=True)
        
        # Save file
        filename = f"profile_{uuid.uuid4()}{Path(file.filename).suffix}"
        filepath = emp_folder / filename
        
        with open(filepath, 'wb') as f:
            f.write(file.file.read())
        
        # Update employee profile_photo path
        photo_path = f"/uploads/{employee.id}/{filename}"
        employee.profile_photo = photo_path
        db.commit()
        db.refresh(employee)
        
        return {'photo_path': photo_path, 'message': 'Profile photo uploaded successfully'}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.put('/employees/profile/update')
def update_employee_profile(
    data: EmployeeUpdateProfile,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update employee profile (phone and profile photo) - self-service"""
    employee = db.query(EmployeeModel).filter(EmployeeModel.email == current_user.email).first()
    if not employee:
        raise HTTPException(status_code=404, detail='Employee record not found')
    
    if data.phone:
        employee.phone = data.phone
    if data.profile_photo:
        employee.profile_photo = data.profile_photo
    
    db.commit()
    db.refresh(employee)
    
    return employee

# ============= ATTENDANCE ROUTES =============

@api_router.post('/attendance/punch')
def punch_attendance(punch_data: AttendancePunch, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    employee = db.query(EmployeeModel).filter(EmployeeModel.employee_id == punch_data.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail='Employee not found')
    
    existing = db.query(AttendanceModel).filter(
        AttendanceModel.employee_id == punch_data.employee_id,
        AttendanceModel.date == today
    ).first()
    
    current_time = datetime.now(timezone.utc).strftime('%H:%M:%S')
    
    if punch_data.action == 'punch_in':
        if existing:
            raise HTTPException(status_code=400, detail='Already punched in today')
        
        status = 'Late' if int(current_time.split(':')[0]) > 9 else 'Present'
        new_attendance = AttendanceModel(
            employee_id=punch_data.employee_id,
            employee_name=employee.name,
            date=today,
            punch_in=current_time,
            status=status
        )
        db.add(new_attendance)
        db.commit()
        
        return {'message': 'Punched in successfully', 'attendance': new_attendance}
    
    else:  # punch_out
        if not existing:
            raise HTTPException(status_code=400, detail='No punch in record found')
        
        if existing.punch_out:
            raise HTTPException(status_code=400, detail='Already punched out today')
        
        punch_in_time = datetime.strptime(existing.punch_in, '%H:%M:%S')
        punch_out_time = datetime.strptime(current_time, '%H:%M:%S')
        work_hours = (punch_out_time - punch_in_time).total_seconds() / 3600
        
        existing.punch_out = current_time
        existing.work_hours = round(work_hours, 2)
        db.commit()
        
        return {'message': 'Punched out successfully', 'attendance': existing}

@api_router.get('/attendance', response_model=List[Attendance])
def get_attendance(month: Optional[str] = None, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(AttendanceModel)
    if month:
        query = query.filter(AttendanceModel.date.like(f'{month}%'))
    return query.order_by(AttendanceModel.date.desc()).all()

@api_router.get('/attendance/summary', response_model=List[AttendanceSummary])
def get_attendance_summary(month: str, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    year, month_num = [int(part) for part in month.split('-')]
    total_days = monthrange(year, month_num)[1]
    today = datetime.now(timezone.utc).date()
    if year == today.year and month_num == today.month:
        total_days = today.day

    employee_query = db.query(EmployeeModel)
    record_query = db.query(AttendanceModel).filter(
        AttendanceModel.date.like(f'{month}%')
    )

    if current_user.role == 'Employee':
        if not current_user.employee_id:
            raise HTTPException(status_code=404, detail='Employee record not found')
        employee_query = employee_query.filter(EmployeeModel.employee_id == current_user.employee_id)
        record_query = record_query.filter(AttendanceModel.employee_id == current_user.employee_id)

    employees = employee_query.all()
    records = record_query.all()

    summary_map = {
        emp.employee_id: {
            'employee_id': emp.employee_id,
            'employee_name': emp.name,
            'total_days': total_days,
            'present_days': 0,
            'absent_days': 0,
            'late_days': 0,
            'half_day_days': 0,
        }
        for emp in employees
    }

    for record in records:
        data = summary_map.get(record.employee_id)
        if not data:
            continue
        data['present_days'] += 1
        if record.status == 'Late':
            data['late_days'] += 1
        if record.status == 'Half Day':
            data['half_day_days'] += 1

    for data in summary_map.values():
        data['absent_days'] = max(data['total_days'] - data['present_days'], 0)

    return list(summary_map.values())

@api_router.get('/attendance/employee/{employee_id}', response_model=List[Attendance])
def get_employee_attendance(employee_id: str, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(AttendanceModel).filter(
        AttendanceModel.employee_id == employee_id
    ).order_by(AttendanceModel.date.desc()).all()

# ============= LEAVE ROUTES =============

@api_router.post('/leaves', response_model=Leave)
def create_leave(leave_data: LeaveCreate, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    new_leave = LeaveModel(
        employee_id=leave_data.employee_id,
        employee_name=leave_data.employee_name,
        leave_type=leave_data.leave_type,
        start_date=leave_data.start_date,
        end_date=leave_data.end_date,
        days=leave_data.days,
        reason=leave_data.reason
    )
    db.add(new_leave)
    db.commit()
    db.refresh(new_leave)
    
    return new_leave

@api_router.get('/leaves', response_model=List[Leave])
def get_leaves(
    status: Optional[str] = None,
    employee_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(LeaveModel)
    if status:
        query = query.filter(LeaveModel.status == status)
    if employee_id:
        query = query.filter(LeaveModel.employee_id == employee_id)
    return query.order_by(LeaveModel.created_at.desc()).all()

@api_router.put('/leaves/{leave_id}/action')
def update_leave_status(
    leave_id: str,
    action: LeaveAction,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in ['Admin', 'HR', 'Manager']:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    leave = db.query(LeaveModel).filter(LeaveModel.id == leave_id).first()
    if not leave:
        raise HTTPException(status_code=404, detail='Leave not found')
    
    leave.status = action.status
    leave.approver_id = action.approver_id
    leave.approver_name = action.approver_name
    db.commit()
    
    return leave

# ============= DOCUMENT ROUTES =============

@api_router.post('/documents/upload')
def upload_document(
    employee_id: str,
    employee_name: str,
    document_type: str,
    file: UploadFile = File(...),
    expiry_date: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    emp_folder = UPLOAD_DIR / employee_id
    emp_folder.mkdir(exist_ok=True)
    
    file_path = emp_folder / file.filename
    with open(file_path, 'wb') as f:
        f.write(file.file.read())
    
    new_document = DocumentModel(
        employee_id=employee_id,
        employee_name=employee_name,
        document_type=document_type,
        file_name=file.filename,
        file_path=str(file_path),
        expiry_date=expiry_date
    )
    db.add(new_document)
    db.commit()
    db.refresh(new_document)
    
    return new_document

@api_router.get('/documents', response_model=List[Document])
def get_documents(employee_id: Optional[str] = None, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(DocumentModel)
    if employee_id:
        query = query.filter(DocumentModel.employee_id == employee_id)
    return query.order_by(DocumentModel.uploaded_at.desc()).all()

@api_router.get('/documents/{document_id}/download')
def download_document(document_id: str, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    document = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail='Document not found')
    
    file_path = Path(document.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail='File not found')
    
    return FileResponse(file_path, filename=document.file_name)

# ============= PAYROLL ROUTES =============

@api_router.get('/payroll/payslip/{employee_id}')
def generate_payslip(
    employee_id: str,
    month: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    employee = db.query(EmployeeModel).filter(EmployeeModel.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail='Employee not found')
    
    attendance_records = db.query(AttendanceModel).filter(
        AttendanceModel.employee_id == employee_id,
        AttendanceModel.date.like(f'{month}%')
    ).all()
    
    working_days = len(attendance_records)
    total_hours = sum(rec.work_hours for rec in attendance_records)
    
    monthly_salary = employee.salary
    basic = monthly_salary * 0.5
    hra = monthly_salary * 0.2
    allowances = monthly_salary * 0.3
    
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    
    p.setFont('Helvetica-Bold', 20)
    p.drawString(50, height - 50, 'PAYSLIP')
    
    p.setFont('Helvetica', 12)
    p.drawString(50, height - 80, f'Employee: {employee.name}')
    p.drawString(50, height - 100, f'Employee ID: {employee.employee_id}')
    p.drawString(50, height - 120, f'Department: {employee.department}')
    p.drawString(50, height - 140, f'Month: {month}')
    
    y = height - 180
    p.drawString(50, y, 'Salary Breakdown:')
    y -= 30
    p.drawString(70, y, f'Basic Salary: ₹{basic:.2f}')
    y -= 20
    p.drawString(70, y, f'HRA: ₹{hra:.2f}')
    y -= 20
    p.drawString(70, y, f'Allowances: ₹{allowances:.2f}')
    y -= 30
    p.setFont('Helvetica-Bold', 12)
    p.drawString(70, y, f'Gross Salary: ₹{monthly_salary:.2f}')
    
    y -= 40
    p.setFont('Helvetica', 12)
    p.drawString(50, y, f'Working Days: {working_days}')
    y -= 20
    p.drawString(50, y, f'Total Hours: {total_hours:.2f}')
    
    p.showPage()
    p.save()
    
    buffer.seek(0)
    return FileResponse(
        io.BytesIO(buffer.getvalue()),
        media_type='application/pdf',
        filename=f'payslip_{employee.employee_id}_{month}.pdf'
    )

# ============= DASHBOARD ROUTES =============

@api_router.get('/dashboard/stats', response_model=DashboardStats)
def get_dashboard_stats(current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    total_employees = db.query(EmployeeModel).filter(EmployeeModel.status == 'Active').count()
    present_today = db.query(AttendanceModel).filter(AttendanceModel.date == today).count()
    pending_leaves = db.query(LeaveModel).filter(LeaveModel.status == 'Pending').count()
    
    employees = db.query(EmployeeModel).all()
    departments = set(emp.department for emp in employees)
    
    return DashboardStats(
        total_employees=total_employees,
        present_today=present_today,
        absent_today=max(0, total_employees - present_today),
        pending_leaves=pending_leaves,
        total_departments=len(departments)
    )

# ============= MIDDLEWARE & CONFIG =============

app.include_router(api_router)

# Mount static files for uploads
if UPLOAD_DIR.exists():
    app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=['*'],
    allow_headers=['*'],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
