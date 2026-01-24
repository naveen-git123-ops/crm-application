from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import io
import uuid

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

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

# ============= MODELS =============

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
    role: Literal['Admin', 'HR', 'Manager', 'Employee'] = 'Employee'

class UserLogin(BaseModel):
    email: EmailStr
    password: str

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

class Leave(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    employee_id: str
    employee_name: str
    leave_type: Literal['Casual', 'Sick', 'Paid', 'WFH']
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
    leave_type: Literal['Casual', 'Sick', 'Paid', 'WFH']
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

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({'id': payload['user_id']}, {'_id': 0, 'password': 0})
        if not user:
            raise HTTPException(status_code=401, detail='User not found')
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expired')
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Invalid token')

# ============= AUTH ROUTES =============

@api_router.post('/auth/register')
async def register(user_data: UserCreate):
    existing = await db.users.find_one({'email': user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail='Email already registered')
    
    hashed_pw = hash_password(user_data.password)
    user = User(
        email=user_data.email,
        name=user_data.name,
        role=user_data.role
    )
    
    doc = user.model_dump()
    doc['password'] = hashed_pw
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.users.insert_one(doc)
    
    token = create_access_token(user.id, user.email, user.role)
    return {'token': token, 'user': user}

@api_router.post('/auth/login')
async def login(credentials: UserLogin):
    user_doc = await db.users.find_one({'email': credentials.email})
    if not user_doc or not verify_password(credentials.password, user_doc['password']):
        raise HTTPException(status_code=401, detail='Invalid credentials')
    
    user_doc.pop('_id', None)
    user_doc.pop('password', None)
    
    token = create_access_token(user_doc['id'], user_doc['email'], user_doc['role'])
    return {'token': token, 'user': user_doc}

@api_router.get('/auth/me')
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

# ============= EMPLOYEE ROUTES =============

@api_router.post('/employees', response_model=Employee)
async def create_employee(emp_data: EmployeeCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['Admin', 'HR']:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    # Generate employee ID
    count = await db.employees.count_documents({})
    emp_id = f'EMP{str(count + 1).zfill(4)}'
    
    employee = Employee(
        employee_id=emp_id,
        **emp_data.model_dump()
    )
    
    doc = employee.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.employees.insert_one(doc)
    
    return employee

@api_router.get('/employees', response_model=List[Employee])
async def get_employees(current_user: dict = Depends(get_current_user)):
    employees = await db.employees.find({}, {'_id': 0}).to_list(1000)
    return employees

@api_router.get('/employees/{employee_id}', response_model=Employee)
async def get_employee(employee_id: str, current_user: dict = Depends(get_current_user)):
    employee = await db.employees.find_one({'id': employee_id}, {'_id': 0})
    if not employee:
        raise HTTPException(status_code=404, detail='Employee not found')
    return employee

@api_router.put('/employees/{employee_id}', response_model=Employee)
async def update_employee(employee_id: str, emp_data: EmployeeCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['Admin', 'HR']:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    result = await db.employees.update_one(
        {'id': employee_id},
        {'$set': emp_data.model_dump()}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Employee not found')
    
    updated = await db.employees.find_one({'id': employee_id}, {'_id': 0})
    return updated

@api_router.delete('/employees/{employee_id}')
async def delete_employee(employee_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['Admin', 'HR']:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    result = await db.employees.delete_one({'id': employee_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Employee not found')
    
    return {'message': 'Employee deleted successfully'}

# ============= ATTENDANCE ROUTES =============

@api_router.post('/attendance/punch')
async def punch_attendance(punch_data: AttendancePunch, current_user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    # Get employee
    employee = await db.employees.find_one({'id': punch_data.employee_id}, {'_id': 0})
    if not employee:
        raise HTTPException(status_code=404, detail='Employee not found')
    
    # Check existing attendance
    existing = await db.attendance.find_one({
        'employee_id': punch_data.employee_id,
        'date': today
    })
    
    current_time = datetime.now(timezone.utc).strftime('%H:%M:%S')
    
    if punch_data.action == 'punch_in':
        if existing:
            raise HTTPException(status_code=400, detail='Already punched in today')
        
        attendance = Attendance(
            employee_id=punch_data.employee_id,
            employee_name=employee['name'],
            date=today,
            punch_in=current_time,
            status='Late' if int(current_time.split(':')[0]) > 9 else 'Present'
        )
        
        doc = attendance.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        await db.attendance.insert_one(doc)
        
        return {'message': 'Punched in successfully', 'attendance': attendance}
    
    else:  # punch_out
        if not existing:
            raise HTTPException(status_code=400, detail='No punch in record found')
        
        if existing.get('punch_out'):
            raise HTTPException(status_code=400, detail='Already punched out today')
        
        # Calculate work hours
        punch_in_time = datetime.strptime(existing['punch_in'], '%H:%M:%S')
        punch_out_time = datetime.strptime(current_time, '%H:%M:%S')
        work_hours = (punch_out_time - punch_in_time).total_seconds() / 3600
        
        await db.attendance.update_one(
            {'id': existing['id']},
            {'$set': {'punch_out': current_time, 'work_hours': round(work_hours, 2)}}
        )
        
        updated = await db.attendance.find_one({'id': existing['id']}, {'_id': 0})
        return {'message': 'Punched out successfully', 'attendance': updated}

@api_router.get('/attendance', response_model=List[Attendance])
async def get_attendance(month: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if month:
        query['date'] = {'$regex': f'^{month}'}
    
    attendance = await db.attendance.find(query, {'_id': 0}).sort('date', -1).to_list(1000)
    return attendance

@api_router.get('/attendance/employee/{employee_id}', response_model=List[Attendance])
async def get_employee_attendance(employee_id: str, current_user: dict = Depends(get_current_user)):
    attendance = await db.attendance.find(
        {'employee_id': employee_id},
        {'_id': 0}
    ).sort('date', -1).to_list(1000)
    return attendance

# ============= LEAVE ROUTES =============

@api_router.post('/leaves', response_model=Leave)
async def create_leave(leave_data: LeaveCreate, current_user: dict = Depends(get_current_user)):
    leave = Leave(**leave_data.model_dump())
    
    doc = leave.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.leaves.insert_one(doc)
    
    return leave

@api_router.get('/leaves', response_model=List[Leave])
async def get_leaves(
    status: Optional[str] = None,
    employee_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if status:
        query['status'] = status
    if employee_id:
        query['employee_id'] = employee_id
    
    leaves = await db.leaves.find(query, {'_id': 0}).sort('created_at', -1).to_list(1000)
    return leaves

@api_router.put('/leaves/{leave_id}/action')
async def update_leave_status(
    leave_id: str,
    action: LeaveAction,
    current_user: dict = Depends(get_current_user)
):
    if current_user['role'] not in ['Admin', 'HR', 'Manager']:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    result = await db.leaves.update_one(
        {'id': leave_id},
        {'$set': {
            'status': action.status,
            'approver_id': action.approver_id,
            'approver_name': action.approver_name
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Leave not found')
    
    updated = await db.leaves.find_one({'id': leave_id}, {'_id': 0})
    return updated

# ============= DOCUMENT ROUTES =============

@api_router.post('/documents/upload')
async def upload_document(
    employee_id: str,
    employee_name: str,
    document_type: str,
    file: UploadFile = File(...),
    expiry_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    # Create employee folder
    emp_folder = UPLOAD_DIR / employee_id
    emp_folder.mkdir(exist_ok=True)
    
    # Save file
    file_path = emp_folder / file.filename
    with open(file_path, 'wb') as f:
        content = await file.read()
        f.write(content)
    
    # Create document record
    document = Document(
        employee_id=employee_id,
        employee_name=employee_name,
        document_type=document_type,
        file_name=file.filename,
        file_path=str(file_path),
        expiry_date=expiry_date
    )
    
    doc = document.model_dump()
    doc['uploaded_at'] = doc['uploaded_at'].isoformat()
    await db.documents.insert_one(doc)
    
    return document

@api_router.get('/documents', response_model=List[Document])
async def get_documents(employee_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if employee_id:
        query['employee_id'] = employee_id
    
    documents = await db.documents.find(query, {'_id': 0}).sort('uploaded_at', -1).to_list(1000)
    return documents

@api_router.get('/documents/{document_id}/download')
async def download_document(document_id: str, current_user: dict = Depends(get_current_user)):
    document = await db.documents.find_one({'id': document_id}, {'_id': 0})
    if not document:
        raise HTTPException(status_code=404, detail='Document not found')
    
    file_path = Path(document['file_path'])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail='File not found')
    
    return FileResponse(file_path, filename=document['file_name'])

# ============= PAYROLL ROUTES =============

@api_router.get('/payroll/payslip/{employee_id}')
async def generate_payslip(
    employee_id: str,
    month: str,
    current_user: dict = Depends(get_current_user)
):
    # Get employee
    employee = await db.employees.find_one({'id': employee_id}, {'_id': 0})
    if not employee:
        raise HTTPException(status_code=404, detail='Employee not found')
    
    # Get attendance for the month
    attendance_records = await db.attendance.find({
        'employee_id': employee_id,
        'date': {'$regex': f'^{month}'}
    }, {'_id': 0}).to_list(1000)
    
    working_days = len(attendance_records)
    total_hours = sum(rec.get('work_hours', 0) for rec in attendance_records)
    
    # Calculate salary
    monthly_salary = employee['salary']
    basic = monthly_salary * 0.5
    hra = monthly_salary * 0.2
    allowances = monthly_salary * 0.3
    
    # Generate PDF
    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    
    # Header
    p.setFont('Helvetica-Bold', 20)
    p.drawString(50, height - 50, 'PAYSLIP')
    
    p.setFont('Helvetica', 12)
    p.drawString(50, height - 80, f'Employee: {employee["name"]}')
    p.drawString(50, height - 100, f'Employee ID: {employee["employee_id"]}')
    p.drawString(50, height - 120, f'Department: {employee["department"]}')
    p.drawString(50, height - 140, f'Month: {month}')
    
    # Salary breakdown
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
    
    # Attendance
    y -= 40
    p.setFont('Helvetica', 12)
    p.drawString(50, y, f'Working Days: {working_days}')
    y -= 20
    p.drawString(50, y, f'Total Hours: {total_hours:.2f}')
    
    p.showPage()
    p.save()
    
    buffer.seek(0)
    return FileResponse(
        io.BytesIO(buffer.read()),
        media_type='application/pdf',
        filename=f'payslip_{employee["employee_id"]}_{month}.pdf'
    )

# ============= DASHBOARD ROUTES =============

@api_router.get('/dashboard/stats', response_model=DashboardStats)
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    total_employees = await db.employees.count_documents({'status': 'Active'})
    present_today = await db.attendance.count_documents({'date': today})
    pending_leaves = await db.leaves.count_documents({'status': 'Pending'})
    
    # Get unique departments
    employees = await db.employees.find({}, {'_id': 0, 'department': 1}).to_list(1000)
    departments = set(emp['department'] for emp in employees)
    
    return DashboardStats(
        total_employees=total_employees,
        present_today=present_today,
        absent_today=max(0, total_employees - present_today),
        pending_leaves=pending_leaves,
        total_departments=len(departments)
    )

# ============= MIDDLEWARE & CONFIG =============

app.include_router(api_router)

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

@app.on_event('shutdown')
async def shutdown_db_client():
    client.close()