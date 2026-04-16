from sqlalchemy import text
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, status, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, String, Float, Integer, DateTime, func, cast, ForeignKey
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
import json
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import boto3
from botocore.exceptions import ClientError
import pandas as pd
from openpyxl import load_workbook

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Attendance business rules use local wall-clock time (default: India).
# Set ATTENDANCE_TIMEZONE in .env e.g. Asia/Kolkata, Asia/Dubai
ATTENDANCE_TZ_NAME = os.environ.get('ATTENDANCE_TIMEZONE', 'Asia/Kolkata')


def attendance_local_now() -> datetime:
    """Current time in the configured attendance timezone (for punch-in/out thresholds)."""
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo(ATTENDANCE_TZ_NAME))
    except Exception:
        ist = timezone(timedelta(hours=5, minutes=30))
        return datetime.now(ist)


def attendance_local_date_str() -> str:
    return attendance_local_now().strftime('%Y-%m-%d')


# Database Setup - MySQL or PostgreSQL
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
Base = declarative_base()

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 168  # 7 days

# Create upload directory
UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)

# AWS S3 Configuration
AWS_ACCESS_KEY = os.environ.get('AWS_ACCESS_KEY_ID')
AWS_SECRET_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY')
AWS_REGION = os.environ.get('AWS_S3_REGION', os.environ.get('AWS_REGION', 'us-east-1'))
S3_BUCKET_NAME = os.environ.get('AWS_S3_BUCKET_NAME', os.environ.get('S3_BUCKET_NAME'))
USE_S3 = AWS_ACCESS_KEY and AWS_SECRET_KEY and S3_BUCKET_NAME

# Initialize S3 client if credentials provided
if USE_S3:
    s3_client = boto3.client(
        's3',
        aws_access_key_id=AWS_ACCESS_KEY,
        aws_secret_access_key=AWS_SECRET_KEY,
        region_name=AWS_REGION
    )
else:
    s3_client = None

api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Register API router with FastAPI app
app.include_router(api_router)

# ============= DATABASE MODELS =============

class UserModel(Base):
    __tablename__ = "users"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, index=True)
    password = Column(String(255))
    name = Column(String(255))
    role = Column(String(50))
    employee_id = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.now)


# Role definitions: name + which screens (permissions) the role can access. Admin is system and cannot be edited/deleted.
class RoleModel(Base):
    __tablename__ = "roles"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), unique=True, index=True)
    permissions = Column(String(1000))  # JSON array of permission keys, e.g. ["dashboard","leads","employees",...]
    is_system = Column(Integer, default=0)  # 1 = Admin only, cannot edit/delete
    created_at = Column(DateTime, default=datetime.now)


class EmployeeModel(Base):
    __tablename__ = "employees"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String(50), unique=True, index=True)
    name = Column(String(255))
    email = Column(String(255), unique=True, index=True)
    phone = Column(String(20), nullable=True)
    department = Column(String(100))
    job_role = Column(String(100))
    joining_date = Column(String(10))
    salary = Column(Float)
    status = Column(String(50), default='Active')
    profile_photo = Column(String(500), nullable=True)
    address = Column(String(500), nullable=True)
    emergency_contact = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.now)

class AttendanceModel(Base):
    __tablename__ = "attendance"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String(50), index=True)
    employee_name = Column(String(255))
    date = Column(String(10), index=True)
    punch_in = Column(String(8), nullable=True)
    punch_out = Column(String(8), nullable=True)
    work_hours = Column(Float, default=0.0)
    total_work_hours = Column(Float, default=0.0)  # Sum of all sessions
    status = Column(String(50), default='Present')
    created_at = Column(DateTime, default=datetime.now)
    # Location & tour (office vs official travel)
    punch_in_lat = Column(Float, nullable=True)
    punch_in_lng = Column(Float, nullable=True)
    punch_out_lat = Column(Float, nullable=True)
    punch_out_lng = Column(Float, nullable=True)
    is_tour = Column(Integer, default=0)
    tour_approval_status = Column(String(50), nullable=True)  # 'pending', 'approved', 'rejected'
    is_active_session = Column(Integer, default=0)  # 1 if currently punched in


class AttendanceSessionModel(Base):
    __tablename__ = "attendance_sessions"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    attendance_id = Column(String(36), ForeignKey('attendance.id'), index=True)
    session_number = Column(Integer, default=1)
    punch_in = Column(String(8), nullable=False)
    punch_out = Column(String(8), nullable=True)
    work_hours = Column(Float, default=0.0)
    punch_in_lat = Column(Float, nullable=True)
    punch_in_lng = Column(Float, nullable=True)
    punch_out_lat = Column(Float, nullable=True)
    punch_out_lng = Column(Float, nullable=True)
    is_tour = Column(Integer, default=0)
    tour_approval_status = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class LatePunchInRequestModel(Base):
    __tablename__ = "late_punch_in_requests"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    attendance_id = Column(String(36), ForeignKey('attendance.id'), index=True)
    employee_id = Column(String(50), index=True)
    employee_name = Column(String(255))
    punch_in_time = Column(String(8))  # HH:MM:SS
    minutes_late = Column(Integer)  # how many minutes after 10:30
    status = Column(String(50), default='Pending')  # 'Pending', 'Approved', 'Rejected'
    approver_id = Column(String(50), nullable=True)
    approver_name = Column(String(255), nullable=True)
    approval_reason = Column(String(500), nullable=True)
    punch_in_date = Column(String(10), index=True)
    requested_at = Column(DateTime, default=datetime.now)
    approved_at = Column(DateTime, nullable=True)


class LatePunchOutRequestModel(Base):
    __tablename__ = "late_punch_out_requests"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    attendance_id = Column(String(36), ForeignKey('attendance.id'), index=True)
    employee_id = Column(String(50), index=True)
    employee_name = Column(String(255))
    punch_out_time = Column(String(8))  # HH:MM:SS
    minutes_late = Column(Integer)  # how many minutes after 7 PM (19:00)
    status = Column(String(50), default='Pending')  # 'Pending', 'Approved', 'Rejected'
    approver_id = Column(String(50), nullable=True)
    approver_name = Column(String(255), nullable=True)
    approval_reason = Column(String(500), nullable=True)
    punch_out_date = Column(String(10), index=True)
    requested_at = Column(DateTime, default=datetime.now)
    approved_at = Column(DateTime, nullable=True)




class SettingsModel(Base):
    __tablename__ = "settings"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    config_key = Column(String(255), unique=True, index=True)
    value = Column(String(1000), nullable=True)

class LeaveModel(Base):
    __tablename__ = "leaves"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String(50), index=True)
    employee_name = Column(String(255))
    leave_type = Column(String(50))
    start_date = Column(String(10))
    end_date = Column(String(10))
    days = Column(Integer)
    reason = Column(String(500))
    attachment_path = Column(String(500), nullable=True)
    status = Column(String(50), default='Pending')
    approver_id = Column(String(50), nullable=True)
    approver_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.now)


class LeavePolicyModel(Base):
    __tablename__ = "leave_policy"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    paid_leaves_per_year = Column(Integer, default=12)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class GovernmentHolidayModel(Base):
    __tablename__ = "government_holidays"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    date = Column(String(10), index=True)  # YYYY-MM-DD
    name = Column(String(255))
    description = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.now)


class DocumentModel(Base):
    __tablename__ = "documents"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String(50), index=True)
    employee_name = Column(String(255))
    document_type = Column(String(100))
    file_name = Column(String(255))
    file_path = Column(String(500))
    expiry_date = Column(String(10), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.now)

class ExpenseModel(Base):
    __tablename__ = "expenses"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String(50), index=True)
    employee_name = Column(String(255))
    amount = Column(Float)
    category = Column(String(100))
    description = Column(String(500))
    receipt_path = Column(String(500), nullable=True)
    attachment_path_1 = Column(String(500), nullable=True)
    attachment_path_2 = Column(String(500), nullable=True)
    status = Column(String(50), default='Pending')
    # First level approval (Accountant)
    accountant_approver_id = Column(String(50), nullable=True)
    accountant_approver_name = Column(String(255), nullable=True)
    accountant_approved_at = Column(DateTime, nullable=True)
    accountant_approved_amount = Column(Float, nullable=True)  # For partial approvals
    accountant_approval_reason = Column(String(500), nullable=True)  # For partial approval/rejection reason
    # Second level approval (Admin)
    admin_approver_id = Column(String(50), nullable=True)
    admin_approver_name = Column(String(255), nullable=True)
    admin_approved_at = Column(DateTime, nullable=True)
    # Keep old fields for backward compatibility
    approver_id = Column(String(50), nullable=True)
    approver_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.now)

class DailyWorkLogModel(Base):
    __tablename__ = "daily_work_logs"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    employee_id = Column(String(50), index=True)
    employee_name = Column(String(255))
    log_date = Column(String(10), index=True)
    summary = Column(String(2000))
    created_at = Column(DateTime, default=datetime.now)

class CustomerModel(Base):
    __tablename__ = "customers"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    customer_id = Column(String(50), unique=True, index=True)
    company_name = Column(String(255), index=True)
    gst_number = Column(String(50), nullable=True)
    contact_person_name = Column(String(255))
    phone = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    address_line = Column(String(500), nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    pincode = Column(String(20), nullable=True)
    country = Column(String(100), nullable=True, default='India')
    status = Column(String(50), default='Active')
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

class CustomerContactModel(Base):
    __tablename__ = "customer_contacts"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    customer_id = Column(String(36), ForeignKey('customers.id'), index=True)
    contact_person_name = Column(String(255))
    designation = Column(String(255), nullable=True)
    phone = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    is_primary = Column(Integer, default=0)  # 0 or 1
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

class CustomerAddressModel(Base):
    __tablename__ = "customer_addresses"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    customer_id = Column(String(36), ForeignKey('customers.id'), index=True)
    address_line = Column(String(500))
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    pincode = Column(String(20), nullable=True)
    country = Column(String(100), nullable=True, default='India')
    is_primary = Column(Integer, default=0)  # 0 or 1
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

class TaskModel(Base):
    __tablename__ = "tasks"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id = Column(String(50), unique=True, index=True)
    title = Column(String(255), index=True)
    description = Column(String(1000), nullable=True)
    priority = Column(String(50), default='Medium')  # Low, Medium, High
    assigned_to_employee_id = Column(String(50), index=True)
    assigned_to_name = Column(String(255))
    created_by_employee_id = Column(String(50), nullable=True)
    created_by_name = Column(String(255), nullable=True)
    due_date = Column(String(50), index=True)  # YYYY-MM-DD
    status = Column(String(50), default='Pending', index=True)  # Pending, In Progress, Completed, Overdue, Approval Pending
    estimated_time_minutes = Column(Integer, nullable=True)  # Estimated time in minutes
    actual_time_minutes = Column(Integer, nullable=True)  # Actual time spent in minutes
    attachment_path = Column(String(500), nullable=True)
    completion_notes = Column(String(1000), nullable=True)
    completion_percentage = Column(Integer, default=0)  # 0-100, percentage of completion
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

class TaskApprovalModel(Base):
    __tablename__ = "task_approvals"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id = Column(String(50), index=True)
    request_type = Column(String(100))  # carry_forward, others in future
    requested_by_employee_id = Column(String(50))
    requested_by_name = Column(String(255))
    requested_at = Column(DateTime, default=datetime.now)
    reason = Column(String(500), nullable=True)
    status = Column(String(50), default='Pending')  # Pending, Approved, Rejected
    approver_id = Column(String(50), nullable=True)
    approver_name = Column(String(255), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approval_comment = Column(String(500), nullable=True)
    new_due_date = Column(String(50), nullable=True)  # When approved, shifts to this date
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

class TaskCommentModel(Base):
    __tablename__ = "task_comments"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id = Column(String(50), index=True)
    author_employee_id = Column(String(50))
    author_name = Column(String(255))
    content = Column(String(2000))
    created_at = Column(DateTime, default=datetime.now, index=True)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

class TaskTimeLogModel(Base):
    __tablename__ = "task_time_logs"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id = Column(String(50), index=True)
    logged_by_employee_id = Column(String(50))
    logged_by_name = Column(String(255))
    time_spent_minutes = Column(Integer)  # Time in minutes
    description = Column(String(500), nullable=True)  # What work was done
    log_date = Column(String(50), default=lambda: datetime.now().strftime('%Y-%m-%d'))
    created_at = Column(DateTime, default=datetime.now, index=True)

class TaskAttachmentModel(Base):
    __tablename__ = "task_attachments"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id = Column(String(50), index=True)
    uploaded_by_employee_id = Column(String(50))
    uploaded_by_name = Column(String(255))
    file_name = Column(String(255))
    file_url = Column(String(500))  # S3 URL or local path
    file_size = Column(Integer, nullable=True)  # File size in bytes
    file_type = Column(String(50), nullable=True)  # e.g., 'pdf', 'image', 'document'
    created_at = Column(DateTime, default=datetime.now, index=True)

class LeadModel(Base):
    __tablename__ = "leads"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    contact_name = Column(String(255), index=True)
    company = Column(String(255), index=True)
    email = Column(String(255), index=True)
    phone = Column(String(20), nullable=True)
    source = Column(String(100), default='Other')
    status = Column(String(50), default='New', index=True)
    value = Column(Float, nullable=True)
    notes = Column(String(1000), nullable=True)
    assigned_to_employee_id = Column(String(50), nullable=True, index=True)
    assigned_to_name = Column(String(255), nullable=True)
    created_by_employee_id = Column(String(50), nullable=True, index=True)
    created_by_name = Column(String(255), nullable=True)
    category = Column(String(100), nullable=True)
    sub_category = Column(String(100), nullable=True)
    contacts = Column(String(2000), nullable=True)  # JSON string: list of {name, designation, email, number}
    negotiation_price = Column(Float, nullable=True)  # Price during negotiation phase
    negotiation_terms = Column(String(500), nullable=True)  # Terms and conditions during negotiation
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

class LeadActivityModel(Base):
    __tablename__ = "lead_activities"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    lead_id = Column(String(36), index=True)
    activity_type = Column(String(100))
    summary = Column(String(500))
    created_by_id = Column(String(50), nullable=True)
    created_by_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.now)

class LeadStatusHistoryModel(Base):
    __tablename__ = "lead_status_history"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    lead_id = Column(String(36), index=True)
    old_status = Column(String(50))
    new_status = Column(String(50))
    changed_by_employee_id = Column(String(50), nullable=True, index=True)
    changed_by_name = Column(String(255), nullable=True)
    change_comment = Column(String(500), nullable=True)
    changed_at = Column(DateTime, default=datetime.now, index=True)

class LeadReminderModel(Base):
    __tablename__ = "lead_reminders"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    lead_id = Column(String(36), index=True)
    reminder_datetime = Column(DateTime, nullable=False, index=True)
    description = Column(String(500), nullable=False)
    is_completed = Column(String(50), default='False')
    created_by_id = Column(String(50), nullable=True)
    created_by_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.now)

class LeadAttachmentModel(Base):
    __tablename__ = "lead_attachments"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    lead_id = Column(String(36), index=True)
    file_url = Column(String(500), nullable=False)  # S3 URL
    file_name = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=True)  # e.g., 'image/png', 'application/pdf'
    file_size = Column(Integer, nullable=True)  # in bytes
    uploaded_by_id = Column(String(50), nullable=True)
    uploaded_by_name = Column(String(255), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.now)

class OrderModel(Base):
    __tablename__ = "orders"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id = Column(String(50), unique=True, index=True)  # Unique order number
    lead_id = Column(String(36), index=True)  # Link to the won lead
    customer_name = Column(String(255), index=True)
    contact_person = Column(String(255), nullable=True)
    contact_number = Column(String(20), nullable=True)
    mail_id = Column(String(255), nullable=True)
    offer_no = Column(String(100), nullable=True)
    offer_date = Column(DateTime, nullable=True)
    product = Column(String(255), nullable=True)
    cust_supply_po_value = Column(Float, nullable=True)
    cust_po_no = Column(String(100), nullable=True)
    po_date = Column(DateTime, nullable=True)
    order_copy_received_date = Column(DateTime, nullable=True)
    payment_terms = Column(String(255), nullable=True)
    advance_payment = Column(Float, nullable=True)
    delivery_committed = Column(DateTime, nullable=True)
    vendor_po_no = Column(String(100), nullable=True)
    vendor_name = Column(String(255), nullable=True)
    vendor_po_date = Column(DateTime, nullable=True)
    vendor_po_value = Column(Float, nullable=True)
    resoline_tax_invoice_no = Column(String(100), nullable=True)
    resoline_invoice_date = Column(DateTime, nullable=True)
    invoice_amount = Column(Float, nullable=True)
    vendor_invoice_no = Column(String(100), nullable=True)
    vendor_dispatch_lr_no = Column(String(100), nullable=True)
    vendor_dispatch_transport = Column(String(255), nullable=True)
    material_check = Column(String(50), nullable=True)  # Status
    customer_dispatch_details = Column(String(500), nullable=True)
    material_received_by_cust = Column(DateTime, nullable=True)
    installation_successful = Column(String(50), default='Pending')  # Pending/Completed
    installation_service_report_no = Column(String(100), nullable=True)
    service_report_date = Column(DateTime, nullable=True)
    service_charges = Column(Float, nullable=True)
    final_payment_due = Column(Float, nullable=True)
    final_payment_date = Column(DateTime, nullable=True)
    subscription_start_date = Column(DateTime, nullable=True)
    subscription_end_date = Column(DateTime, nullable=True)
    subscription_status = Column(String(50), default='Active')  # Active/Expiring Soon/Expired
    renewal_reminder_sent = Column(String(50), default='False')
    remarks = Column(String(500), nullable=True)  # REMARK/STATUS
    order_status = Column(String(50), default='Open')  # Open/In Progress/Completed/Cancelled
    offer_copy_path = Column(String(500), nullable=True)  # Path to uploaded offer copy
    order_copy_path = Column(String(500), nullable=True)  # Path to uploaded order copy
    estimation = Column(Float, nullable=True)  # Estimation value (similar to story points)
    subscription_reminder_sent_30 = Column(String(50), default='False')  # 30 days before
    subscription_reminder_sent_7 = Column(String(50), default='False')  # 7 days before
    subscription_reminder_sent_1 = Column(String(50), default='False')  # 1 day before
    assigned_to_employee_id = Column(String(50), nullable=True, index=True)
    assigned_to_name = Column(String(255), nullable=True)
    created_by_employee_id = Column(String(50), nullable=True)
    created_by_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

class OrderActivityModel(Base):
    __tablename__ = "order_activities"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id = Column(String(36), index=True)  # Link to Order
    activity_type = Column(String(100))  # Update/Status Change/Renewal Reminder/Note
    summary = Column(String(500))
    details = Column(String(2000), nullable=True)  # JSON for additional details
    created_by_id = Column(String(50), nullable=True)
    created_by_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.now)

class SubscriptionReminderModel(Base):
    __tablename__ = "subscription_reminders"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id = Column(String(36), index=True)
    reminder_date = Column(DateTime, nullable=False)
    reminder_type = Column(String(100))  # 30days_before/7days_before/on_expiry
    is_sent = Column(String(50), default='False')
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

# ============= VEHICLE TRACKING MODELS =============

class VehicleModel(Base):
    __tablename__ = "vehicles"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    vehicle_name = Column(String(255), index=True)
    vehicle_type = Column(String(100))  # Car, Bike, Van, Truck, etc.
    fuel_type = Column(String(50))  # Petrol, Diesel, Electric, Hybrid
    registration_number = Column(String(50), unique=True, index=True)
    milage = Column(Float)  # km/liter or km/charge for electric
    current_meter_reading = Column(Float, nullable=True)  # Latest meter reading in km
    status = Column(String(50), default='Active')  # Active, Inactive, Under Maintenance
    photo_path = Column(String(500), nullable=True)  # Photo of the vehicle
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

class VehicleUsageModel(Base):
    __tablename__ = "vehicle_usage"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    vehicle_id = Column(String(36), ForeignKey('vehicles.id'), index=True, nullable=True)
    employee_id = Column(String(50), index=True)
    employee_name = Column(String(255))
    start_meter_reading = Column(Float)  # Starting km reading
    start_reading_photo_path = Column(String(500), nullable=True)  # Photo of meter at start
    end_meter_reading = Column(Float, nullable=True)  # Ending km reading
    end_reading_photo_path = Column(String(500), nullable=True)  # Photo of meter at end
    km_driven = Column(Float, nullable=True)  # Calculated distance (end - start)
    fuel_consumed = Column(Float, nullable=True)  # Calculated based on km_driven / milage
    own_vehicle_type = Column(String(100), nullable=True)  # Car, Bike, Van, etc. when using own vehicle
    own_vehicle_milage = Column(Float, nullable=True)  # Mileage when using own vehicle (km/liter)
    start_date = Column(DateTime, default=datetime.now)
    end_date = Column(DateTime, nullable=True)
    status = Column(String(50), default='Active')  # Active, Completed
    is_claimed = Column(Integer, default=0)  # 1 = already claimed in a fuel expense claim, 0 = not claimed
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

class FuelExpenseClaimModel(Base):
    __tablename__ = "fuel_expense_claims"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    vehicle_usage_id = Column(String(36), ForeignKey('vehicle_usage.id'), index=True)
    employee_id = Column(String(50), index=True)
    employee_name = Column(String(255))
    vehicle_id = Column(String(36), ForeignKey('vehicles.id'), index=True)
    vehicle_name = Column(String(255))
    km_driven = Column(Float)  # KM driven for this claim
    fuel_consumed = Column(Float)  # Fuel consumed based on milage
    claimed_amount = Column(Float)  # Amount claimed by employee
    price_per_liter = Column(Float)  # Current fuel price (Petrol rate, etc.)
    claim_status = Column(String(50), default='Pending')  # Pending, Approved, Rejected, Partially-Approved
    is_valid = Column(Integer, default=1)  # 1 = Valid (claim matches actual consumption), 0 = Invalid
    validation_message = Column(String(500), nullable=True)  # Message about validation
    approver_id = Column(String(50), nullable=True)
    approver_name = Column(String(255), nullable=True)
    approved_amount = Column(Float, nullable=True)  # Amount finally approved
    approval_notes = Column(String(500), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

class CGWFlowMetreModel(Base):
    __tablename__ = "cgw_flow_metres"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    inventory_id = Column(String(50), unique=True, index=True)
    customer_id = Column(String(36), ForeignKey('customers.id'), index=True)
    customer_name = Column(String(255), index=True)
    location = Column(String(500), nullable=True)
    contact_person = Column(String(255), nullable=True)
    equipment_name = Column(String(255), nullable=True)
    flowmeter_details = Column(String(1000), nullable=True)
    product_code = Column(String(100), nullable=True)
    model_no = Column(String(100), nullable=True)
    system_mobile_number = Column(String(20), nullable=True)
    person_mobile_number = Column(String(20), nullable=True)
    email_id = Column(String(255), nullable=True)
    date_of_commissioning = Column(String(10), nullable=True)  # YYYY-MM-DD
    url_link = Column(String(500), nullable=True)
    user_id = Column(String(100), nullable=True)
    password = Column(String(255), nullable=True)
    status = Column(String(50), default='Active')  # Active, Inactive, Maintenance
    renewal_date = Column(String(10), nullable=True)  # YYYY-MM-DD
    review = Column(String(1000), nullable=True)
    calibration_certificate = Column(String(500), nullable=True)  # File URL
    remarks = Column(String(1000), nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

# Create all tables
Base.metadata.create_all(bind=engine)

def migrate_leads_add_created_by():
    """Add created_by_employee_id, created_by_name to leads if missing (for Sales ownership)."""
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            r = conn.execute(text("PRAGMA table_info(leads)"))
            cols = [row[1] for row in r.fetchall()]
            if 'created_by_employee_id' not in cols:
                conn.execute(text("ALTER TABLE leads ADD COLUMN created_by_employee_id VARCHAR"))
            if 'created_by_name' not in cols:
                conn.execute(text("ALTER TABLE leads ADD COLUMN created_by_name VARCHAR"))
            conn.commit()
        except Exception:
            pass

migrate_leads_add_created_by()

def migrate_attendance_location_and_tour():
    """Add location and tour columns to attendance if missing."""
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            r = conn.execute(text("PRAGMA table_info(attendance)"))
            cols = [row[1] for row in r.fetchall()]
            adds = [
                ('punch_in_lat', 'FLOAT'), ('punch_in_lng', 'FLOAT'),
                ('punch_out_lat', 'FLOAT'), ('punch_out_lng', 'FLOAT'),
                ('is_tour', 'INTEGER'), ('tour_approval_status', 'TEXT'),
            ]
            for col, typ in adds:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE attendance ADD COLUMN {col} {typ}"))
            conn.commit()
        except Exception:
            pass

migrate_attendance_location_and_tour()

def migrate_attendance_sessions_table():
    """Create attendance_sessions table if missing."""
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            # Check if table exists (works for both MySQL and SQLite)
            try:
                r = conn.execute(text("SHOW TABLES LIKE 'attendance_sessions'"))
                if not r.fetchone():
                    # Create the table for MySQL
                    conn.execute(text("""
                        CREATE TABLE attendance_sessions (
                            id VARCHAR(36) PRIMARY KEY,
                            attendance_id VARCHAR(36) NOT NULL,
                            session_number INTEGER DEFAULT 1,
                            punch_in VARCHAR(10),
                            punch_out VARCHAR(10),
                            work_hours FLOAT DEFAULT 0.0,
                            punch_in_lat FLOAT,
                            punch_in_lng FLOAT,
                            punch_out_lat FLOAT,
                            punch_out_lng FLOAT,
                            is_tour INTEGER DEFAULT 0,
                            tour_approval_status VARCHAR(50),
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY(attendance_id) REFERENCES attendance(id),
                            INDEX idx_attendance_sessions_attendance_id (attendance_id)
                        )
                    """))
            except:
                # Try SQLite syntax as fallback
                r = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='attendance_sessions'"))
                if not r.fetchone():
                    conn.execute(text("""
                        CREATE TABLE attendance_sessions (
                            id VARCHAR PRIMARY KEY,
                            attendance_id VARCHAR NOT NULL,
                            session_number INTEGER DEFAULT 1,
                            punch_in VARCHAR NOT NULL,
                            punch_out VARCHAR,
                            work_hours FLOAT DEFAULT 0.0,
                            punch_in_lat FLOAT,
                            punch_in_lng FLOAT,
                            punch_out_lat FLOAT,
                            punch_out_lng FLOAT,
                            is_tour INTEGER DEFAULT 0,
                            tour_approval_status VARCHAR,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY(attendance_id) REFERENCES attendance(id)
                        )
                    """))
                    conn.execute(text("CREATE INDEX idx_attendance_sessions_attendance_id ON attendance_sessions(attendance_id)"))
            conn.commit()
        except Exception as e:
            print(f"Migration error for attendance_sessions: {e}")

migrate_attendance_sessions_table()

def migrate_attendance_new_columns():
    """Add new columns to attendance if missing."""
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            # Try MySQL approach first
            try:
                r = conn.execute(text("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='attendance' AND TABLE_SCHEMA=DATABASE()"))
                cols = [row[0] for row in r.fetchall()]
            except:
                # Fall back to SQLite
                r = conn.execute(text("PRAGMA table_info(attendance)"))
                cols = [row[1] for row in r.fetchall()]
            
            new_cols = [
                ('total_work_hours', 'FLOAT DEFAULT 0.0'),
                ('is_active_session', 'INTEGER DEFAULT 0'),
            ]
            for col, typ in new_cols:
                col_name = col.split()[0]
                if col_name not in cols:
                    try:
                        conn.execute(text(f"ALTER TABLE attendance ADD COLUMN {col} {typ}"))
                        print(f"Added column {col_name} to attendance table")
                    except Exception as alter_err:
                        print(f"Could not add column {col_name}: {alter_err}")
            conn.commit()
        except Exception as e:
            print(f"Migration error for attendance new columns: {e}")

migrate_attendance_new_columns()

def migrate_leads_add_category_and_contacts():
    """Add category, sub_category, and contacts columns to leads if missing (for new Leads UI)."""
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            r = conn.execute(text("PRAGMA table_info(leads)"))
            cols = [row[1] for row in r.fetchall()]
            if 'category' not in cols:
                conn.execute(text("ALTER TABLE leads ADD COLUMN category VARCHAR"))
            if 'sub_category' not in cols:
                conn.execute(text("ALTER TABLE leads ADD COLUMN sub_category VARCHAR"))
            if 'contacts' not in cols:
                conn.execute(text("ALTER TABLE leads ADD COLUMN contacts TEXT"))
            conn.commit()
        except Exception:
            pass

def migrate_leads_add_negotiation_fields():
    """Add negotiation_price and negotiation_terms columns to leads if missing."""
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            r = conn.execute(text("PRAGMA table_info(leads)"))
            cols = [row[1] for row in r.fetchall()]
            if 'negotiation_price' not in cols:
                conn.execute(text("ALTER TABLE leads ADD COLUMN negotiation_price FLOAT"))
            if 'negotiation_terms' not in cols:
                conn.execute(text("ALTER TABLE leads ADD COLUMN negotiation_terms TEXT"))
            conn.commit()
        except Exception:
            pass

def migrate_orders_add_attachments_and_estimation():
    """Add offer_copy_path, order_copy_path, estimation and subscription reminder tracking columns to orders if missing."""
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            r = conn.execute(text("PRAGMA table_info(orders)"))
            cols = [row[1] for row in r.fetchall()]
            if 'offer_copy_path' not in cols:
                conn.execute(text("ALTER TABLE orders ADD COLUMN offer_copy_path VARCHAR"))
            if 'order_copy_path' not in cols:
                conn.execute(text("ALTER TABLE orders ADD COLUMN order_copy_path VARCHAR"))
            if 'estimation' not in cols:
                conn.execute(text("ALTER TABLE orders ADD COLUMN estimation FLOAT"))
            if 'subscription_reminder_sent_30' not in cols:
                conn.execute(text("ALTER TABLE orders ADD COLUMN subscription_reminder_sent_30 VARCHAR DEFAULT 'False'"))
            if 'subscription_reminder_sent_7' not in cols:
                conn.execute(text("ALTER TABLE orders ADD COLUMN subscription_reminder_sent_7 VARCHAR DEFAULT 'False'"))
            if 'subscription_reminder_sent_1' not in cols:
                conn.execute(text("ALTER TABLE orders ADD COLUMN subscription_reminder_sent_1 VARCHAR DEFAULT 'False'"))
            conn.commit()
        except Exception:
            pass

migrate_leads_add_negotiation_fields()
migrate_orders_add_attachments_and_estimation()

migrate_leads_add_category_and_contacts()

def migrate_lead_status_history():
    """Create lead_status_history table if missing."""
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            r = conn.execute(text("PRAGMA table_info(lead_status_history)"))
            # Table exists, no need to create
            r.fetchall()
        except Exception:
            # Table doesn't exist, it will be created by Base.metadata.create_all()
            pass

migrate_lead_status_history()

def migrate_customers():
    """Create customers table if missing."""
    from sqlalchemy import text
    with engine.connect() as conn:
        try:
            r = conn.execute(text("PRAGMA table_info(customers)"))
            # Table exists, no need to create
            r.fetchall()
        except Exception:
            # Table doesn't exist, it will be created by Base.metadata.create_all()
            pass

migrate_customers()

def migrate_vehicle_usage_is_claimed():
    """Add is_claimed column to vehicle_usage if missing."""
    from sqlalchemy import text, inspect
    try:
        # Use SQLAlchemy inspector to check for columns (works with all DB types)
        inspector = inspect(engine)
        existing_columns = [col['name'] for col in inspector.get_columns('vehicle_usage')]
        if 'is_claimed' not in existing_columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE vehicle_usage ADD COLUMN is_claimed INTEGER DEFAULT 0"))
                conn.commit()
    except Exception as e:
        print(f"Migration error for vehicle_usage is_claimed: {e}")

migrate_vehicle_usage_is_claimed()

def migrate_vehicle_usage_own_vehicle():
    """Add own_vehicle_type and own_vehicle_milage columns to vehicle_usage if missing."""
    from sqlalchemy import text, inspect
    try:
        inspector = inspect(engine)
        existing_columns = [col['name'] for col in inspector.get_columns('vehicle_usage')]
        with engine.connect() as conn:
            if 'own_vehicle_type' not in existing_columns:
                conn.execute(text("ALTER TABLE vehicle_usage ADD COLUMN own_vehicle_type VARCHAR(100) NULL"))
            if 'own_vehicle_milage' not in existing_columns:
                conn.execute(text("ALTER TABLE vehicle_usage ADD COLUMN own_vehicle_milage FLOAT NULL"))
            conn.commit()
    except Exception as e:
        print(f"Migration error for vehicle_usage own vehicle fields: {e}")

migrate_vehicle_usage_own_vehicle()

def migrate_expenses_add_attachments():
    """Add attachment_path_1 and attachment_path_2 columns to expenses if missing."""
    from sqlalchemy import text, inspect
    try:
        # Use SQLAlchemy inspector to check for columns (works with all DB types)
        inspector = inspect(engine)
        existing_columns = [col['name'] for col in inspector.get_columns('expenses')]
        
        new_cols = [
            ('attachment_path_1', 'VARCHAR(500)'),
            ('attachment_path_2', 'VARCHAR(500)'),
        ]
        
        with engine.connect() as conn:
            for col, typ in new_cols:
                col_name = col.split()[0]
                if col_name not in existing_columns:
                    try:
                        conn.execute(text(f"ALTER TABLE expenses ADD COLUMN {col} {typ}"))
                        conn.commit()
                        print(f"Added column {col_name} to expenses table")
                    except Exception as alter_err:
                        print(f"Could not add column {col_name}: {alter_err}")
                        conn.rollback()
    except Exception as e:
        print(f"Migration error for expenses attachments: {e}")

migrate_expenses_add_attachments()

def migrate_leaves_add_attachment():
    """Add attachment_path column to leaves if missing."""
    from sqlalchemy import text, inspect
    try:
        inspector = inspect(engine)
        existing_columns = [col['name'] for col in inspector.get_columns('leaves')]
        
        if 'attachment_path' not in existing_columns:
            with engine.connect() as conn:
                try:
                    conn.execute(text("ALTER TABLE leaves ADD COLUMN attachment_path VARCHAR(500) NULL"))
                    conn.commit()
                    print("Added column attachment_path to leaves table")
                except Exception as alter_err:
                    print(f"Could not add column attachment_path: {alter_err}")
                    conn.rollback()
    except Exception as e:
        print(f"Migration error for leaves attachment: {e}")

migrate_leaves_add_attachment()

# Seed default roles (Admin cannot be edited/deleted; others can)
DEFAULT_PERMISSION_KEYS = [
    "dashboard", "leads", "employees", "attendance", "leaves", "expenses",
    "roles", "workspace", "idcards", "documents", "settings", "holidays", "tasks", "customers", "vehicles"
]

def seed_roles_if_needed():
    db = SessionLocal()
    try:
        if db.query(RoleModel).first() is not None:
            return
        # Only create Admin role with full permissions (hardcoded, system role)
        # All other roles are managed dynamically through the UI
        admin_role = RoleModel(
            name="Admin", 
            permissions=json.dumps(DEFAULT_PERMISSION_KEYS), 
            is_system=1
        )
        db.add(admin_role)
        db.commit()
    finally:
        db.close()

def ensure_admin_has_all_permissions():
    """Ensure Admin role has all available permissions"""
    db = SessionLocal()
    try:
        admin_role = db.query(RoleModel).filter(RoleModel.name == "Admin").first()
        if admin_role:
            try:
                current_perms = json.loads(admin_role.permissions) if admin_role.permissions else []
            except:
                current_perms = []
            
            # Update admin role to have all permissions
            if set(current_perms) != set(DEFAULT_PERMISSION_KEYS):
                admin_role.permissions = json.dumps(DEFAULT_PERMISSION_KEYS)
                db.commit()
    finally:
        db.close()

seed_roles_if_needed()
ensure_admin_has_all_permissions()

# ============= PYDANTIC MODELS =============

class UserRole(BaseModel):
    role: Literal['Admin', 'Accountant', 'HR', 'Manager', 'Employee']

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: str
    role: Literal['Admin', 'Accountant', 'HR', 'Manager', 'Employee']
    employee_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    employee_id: str
    role: str = 'Employee'

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserDetails(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: EmailStr
    name: str
    role: str
    permissions: Optional[List[str]] = None
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

class CustomerContact(BaseModel):
    model_config = ConfigDict(extra="ignore", from_attributes=True)
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str
    contact_person_name: str
    designation: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_primary: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None

class CustomerContactCreate(BaseModel):
    contact_person_name: str
    designation: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_primary: Optional[int] = 0

class CustomerAddress(BaseModel):
    model_config = ConfigDict(extra="ignore", from_attributes=True)
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str
    address_line: str
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: str = 'India'
    is_primary: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None

class CustomerAddressCreate(BaseModel):
    address_line: str
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: str = 'India'
    is_primary: Optional[int] = 0

class Customer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str
    company_name: str
    gst_number: Optional[str] = None
    contact_person_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address_line: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: str = 'India'
    status: Literal['Active', 'Inactive'] = 'Active'
    contacts: Optional[List[CustomerContact]] = None
    addresses: Optional[List[CustomerAddress]] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CustomerCreateUpdate(BaseModel):
    company_name: str
    gst_number: Optional[str] = None
    contact_person_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address_line: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: str = 'India'
    status: Literal['Active', 'Inactive'] = 'Active'
    contacts: Optional[List[CustomerContactCreate]] = None
    addresses: Optional[List[CustomerAddressCreate]] = None

class Task(BaseModel):
    model_config = ConfigDict(extra="ignore", from_attributes=True)
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    task_id: str
    title: str
    description: Optional[str] = None
    priority: Literal['Low', 'Medium', 'High'] = 'Medium'
    assigned_to_employee_id: str
    assigned_to_name: str
    created_by_employee_id: Optional[str] = None
    created_by_name: Optional[str] = None
    due_date: str
    status: Literal['Pending', 'In Progress', 'Completed', 'Overdue', 'Approval Pending'] = 'Pending'
    estimated_time_minutes: Optional[int] = None
    actual_time_minutes: Optional[int] = None
    attachment_path: Optional[str] = None
    completion_notes: Optional[str] = None
    completion_percentage: int = 0
    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    assigned_to_employee_id: str
    due_date: str  # YYYY-MM-DD
    estimated_time_hours: Optional[float] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to_employee_id: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[Literal['Pending', 'In Progress', 'Completed', 'Overdue', 'Approval Pending']] = None
    # Keep API in hours but store in minutes
    estimated_time_hours: Optional[float] = None
    actual_time_minutes: Optional[int] = None
    completion_notes: Optional[str] = None
    completion_percentage: Optional[int] = None

class TaskApproval(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    task_id: str
    request_type: str
    requested_by_employee_id: str
    requested_by_name: str
    requested_at: datetime
    reason: Optional[str] = None
    status: Literal['Pending', 'Approved', 'Rejected'] = 'Pending'
    approver_id: Optional[str] = None
    approver_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    approval_comment: Optional[str] = None
    new_due_date: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TaskComment(BaseModel):
    model_config = ConfigDict(extra="ignore", from_attributes=True)
    id: str
    task_id: str
    author_employee_id: str
    author_name: str
    content: str
    created_at: datetime
    updated_at: Optional[datetime] = None

class TaskCommentCreate(BaseModel):
    content: str

class TaskTimeLog(BaseModel):
    model_config = ConfigDict(extra="ignore", from_attributes=True)
    id: str
    task_id: str
    logged_by_employee_id: str
    logged_by_name: str
    time_spent_minutes: int
    description: Optional[str] = None
    log_date: str
    created_at: datetime

class TaskTimeLogCreate(BaseModel):
    time_spent_minutes: int
    description: Optional[str] = None
    log_date: str

class TaskAttachment(BaseModel):
    model_config = ConfigDict(extra="ignore", from_attributes=True)
    id: str
    task_id: str
    uploaded_by_employee_id: str
    uploaded_by_name: str
    file_name: str
    file_url: str
    file_size: Optional[int] = None
    file_type: Optional[str] = None
    created_at: datetime

class TaskApprovalRequest(BaseModel):
    reason: Optional[str] = None

class TaskBoardColumn(BaseModel):
    """Model for a column in the Kanban board"""
    status: str
    tasks: List[Task]
    count: int

class TaskBoardView(BaseModel):
    """Model for the full Kanban board view"""
    columns: List[TaskBoardColumn]
    total_tasks: int
    user_tasks: int

class TaskStatusChange(BaseModel):
    """Model for changing task status"""
    status: Literal['Pending', 'In Progress', 'Completed', 'Overdue', 'Approval Pending']
    completion_notes: Optional[str] = None
    actual_time_minutes: Optional[int] = None

class TaskApprovalAction(BaseModel):
    status: Literal['Approved', 'Rejected']
    approval_comment: Optional[str] = None

class EmployeeDashboardStats(BaseModel):
    """Stats for an employee in dashboard"""
    name: str
    employee_id: str
    total_tasks: int
    pending: int
    in_progress: int
    completed: int
    overdue: int
    avg_completion_percentage: float

class TaskDashboard(BaseModel):
    """Model for task dashboard view"""
    total_tasks: int
    pending_count: int
    in_progress_count: int
    completed_count: int
    overdue_count: int
    employees: List[EmployeeDashboardStats]
    tasks: Optional[List[Task]] = None

class AttendanceSession(BaseModel):
    model_config = ConfigDict(extra="ignore", from_attributes=True)
    id: str
    session_number: int
    punch_in: str
    punch_out: Optional[str] = None
    work_hours: float = 0.0
    punch_in_lat: Optional[float] = None
    punch_in_lng: Optional[float] = None
    punch_out_lat: Optional[float] = None
    punch_out_lng: Optional[float] = None
    is_tour: Optional[int] = None
    tour_approval_status: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Attendance(BaseModel):
    model_config = ConfigDict(extra="ignore", from_attributes=True)
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    employee_id: str
    employee_name: Optional[str] = None
    date: str
    punch_in: Optional[str] = None
    punch_out: Optional[str] = None
    work_hours: float = 0.0
    total_work_hours: float = 0.0
    status: Literal['Present', 'Absent', 'Late', 'Half Day', 'Leave', 'Pending Approval', 'Incomplete'] = 'Present'
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_tour: Optional[int] = None
    tour_approval_status: Optional[str] = None
    is_active_session: Optional[int] = None
    sessions: Optional[List[AttendanceSession]] = None

class LatePunchInRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", from_attributes=True)
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    attendance_id: str
    employee_id: str
    employee_name: str
    punch_in_time: str
    minutes_late: int
    status: Literal['Pending', 'Approved', 'Rejected'] = 'Pending'
    approver_id: Optional[str] = None
    approver_name: Optional[str] = None
    approval_reason: Optional[str] = None
    punch_in_date: str
    requested_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    approved_at: Optional[datetime] = None

class LatePunchOutRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", from_attributes=True)
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    attendance_id: str
    employee_id: str
    employee_name: str
    punch_out_time: str
    minutes_late: int
    status: Literal['Pending', 'Approved', 'Rejected'] = 'Pending'
    approver_id: Optional[str] = None
    approver_name: Optional[str] = None
    approval_reason: Optional[str] = None
    punch_out_date: str
    requested_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    approved_at: Optional[datetime] = None

class AttendancePunch(BaseModel):
    employee_id: str
    action: Literal['punch_in', 'punch_out']
    latitude: Optional[float] = None
    longitude: Optional[float] = None

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
    attachment_path: Optional[str] = None
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
    attachment_path: Optional[str] = None

class LeavePolicyUpdate(BaseModel):
    paid_leaves_per_year: int

class LeaveAction(BaseModel):
    status: Literal['Approved', 'Rejected']
    approver_id: str
    approver_name: str


class GovernmentHoliday(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    date: str
    name: str
    description: Optional[str] = None
    created_at: Optional[datetime] = None


class GovernmentHolidayCreate(BaseModel):
    date: str
    name: str
    description: Optional[str] = None


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

class Expense(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    employee_id: str
    employee_name: str
    amount: float
    category: str
    description: str
    receipt_path: Optional[str] = None
    attachment_path_1: Optional[str] = None
    attachment_path_2: Optional[str] = None
    status: Literal['Pending', 'Partially-Approved', 'Accountant-Approved', 'Approved', 'Rejected'] = 'Pending'
    # First level approval (Accountant)
    accountant_approver_id: Optional[str] = None
    accountant_approver_name: Optional[str] = None
    accountant_approved_at: Optional[datetime] = None
    accountant_approved_amount: Optional[float] = None  # Partial approval amount
    accountant_approval_reason: Optional[str] = None  # Reason for partial approval/rejection
    # Second level approval (Admin)
    admin_approver_id: Optional[str] = None
    admin_approver_name: Optional[str] = None
    admin_approved_at: Optional[datetime] = None
    # Keep old fields for backward compatibility
    approver_id: Optional[str] = None
    approver_name: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ExpenseCreate(BaseModel):
    employee_id: str
    employee_name: str
    amount: float
    category: str
    description: str

class ExpenseAction(BaseModel):
    status: Literal['Partially-Approved', 'Accountant-Approved', 'Approved', 'Rejected']
    approver_id: str
    approver_name: str
    approved_amount: Optional[float] = None  # For partial approval only
    approval_reason: Optional[str] = None  # For partial approval/rejection reason

class DailyWorkLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    employee_id: str
    employee_name: str
    log_date: str
    summary: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DailyWorkLogCreate(BaseModel):
    employee_id: str
    employee_name: str
    log_date: str
    summary: str


class UserRoleUpdate(BaseModel):
    role: str  # must exist in roles table


class AdminPasswordResetRequest(BaseModel):
    # Admin can set a new password for any user (no email verification flow).
    new_password: str = Field(min_length=6, max_length=255)

class RoleCreate(BaseModel):
    name: str
    permissions: List[str]

class RoleUpdate(BaseModel):
    name: Optional[str] = None
    permissions: Optional[List[str]] = None

class Lead(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    contact_name: str
    company: str
    email: str
    phone: Optional[str] = None
    source: str = 'Other'
    status: str = 'New'
    value: Optional[float] = None
    notes: Optional[str] = None
    assigned_to_employee_id: Optional[str] = None
    assigned_to_name: Optional[str] = None
    created_by_employee_id: Optional[str] = None
    created_by_name: Optional[str] = None
    category: Optional[str] = None
    sub_category: Optional[str] = None
    contacts: Optional[list] = None  # List of dicts: {name, designation, email, number}
    negotiation_price: Optional[float] = None  # Price during negotiation phase
    negotiation_terms: Optional[str] = None  # Terms and conditions during negotiation
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None

class LeadCreate(BaseModel):
    contact_name: str
    company: str
    email: EmailStr
    phone: Optional[str] = None
    source: Literal['Website', 'Referral', 'Cold Call', 'Social Media', 'Partner', 'Exhibition', 'Other'] = 'Other'
    status: Literal['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'] = 'New'
    value: Optional[float] = None
    notes: Optional[str] = None
    assigned_to_employee_id: Optional[str] = None
    assigned_to_name: Optional[str] = None
    category: Optional[str] = None
    sub_category: Optional[str] = None
    contacts: Optional[list] = None  # List of dicts: {name, designation, email, number}

class LeadUpdate(BaseModel):
    model_config = ConfigDict(extra='ignore')
    contact_name: Optional[str] = None
    company: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    source: Optional[Literal['Website', 'Referral', 'Cold Call', 'Social Media', 'Partner', 'Exhibition', 'Other']] = None
    status: Optional[Literal['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost']] = None
    value: Optional[float] = None
    notes: Optional[str] = None
    assigned_to_employee_id: Optional[str] = None
    assigned_to_name: Optional[str] = None
    category: Optional[str] = None
    sub_category: Optional[str] = None
    contacts: Optional[list] = None  # List of dicts: {name, designation, email, number}
    negotiation_price: Optional[float] = None  # Price during negotiation phase
    negotiation_terms: Optional[str] = None  # Terms and conditions during negotiation
    status_change_comment: Optional[str] = None  # Comment when status changes (required if status is changing)

class LeadActivity(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    activity_type: Literal['Call', 'Email', 'Meeting', 'Note'] = 'Note'
    summary: str
    created_by_id: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LeadActivityCreate(BaseModel):
    activity_type: Literal['Call', 'Email', 'Meeting', 'Note'] = 'Note'
    summary: str

class LeadStatusHistory(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    old_status: str
    new_status: str
    changed_by_employee_id: Optional[str] = None
    changed_by_name: Optional[str] = None
    change_comment: Optional[str] = None
    changed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LeadStatusHistoryCreate(BaseModel):
    old_status: str
    new_status: str
    change_comment: str

class LeadReminder(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lead_id: str
    reminder_datetime: datetime
    description: str
    is_completed: str = 'False'
    created_by_id: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LeadReminderCreate(BaseModel):
    reminder_datetime: datetime
    description: str

class LeadStats(BaseModel):
    total: int
    by_status: dict

class Order(BaseModel):
    id: str
    order_id: str
    lead_id: str
    customer_name: str
    contact_person: Optional[str] = None
    contact_number: Optional[str] = None
    mail_id: Optional[str] = None
    offer_no: Optional[str] = None
    offer_date: Optional[datetime] = None
    product: Optional[str] = None
    cust_supply_po_value: Optional[float] = None
    cust_po_no: Optional[str] = None
    po_date: Optional[datetime] = None
    order_copy_received_date: Optional[datetime] = None
    payment_terms: Optional[str] = None
    advance_payment: Optional[float] = None
    delivery_committed: Optional[datetime] = None
    vendor_po_no: Optional[str] = None
    vendor_name: Optional[str] = None
    vendor_po_date: Optional[datetime] = None
    vendor_po_value: Optional[float] = None
    resoline_tax_invoice_no: Optional[str] = None
    resoline_invoice_date: Optional[datetime] = None
    invoice_amount: Optional[float] = None
    vendor_invoice_no: Optional[str] = None
    vendor_dispatch_lr_no: Optional[str] = None
    vendor_dispatch_transport: Optional[str] = None
    material_check: Optional[str] = None
    customer_dispatch_details: Optional[str] = None
    material_received_by_cust: Optional[datetime] = None
    installation_successful: str = 'Pending'
    installation_service_report_no: Optional[str] = None
    service_report_date: Optional[datetime] = None
    service_charges: Optional[float] = None
    final_payment_due: Optional[float] = None
    final_payment_date: Optional[datetime] = None
    subscription_start_date: Optional[datetime] = None
    subscription_end_date: Optional[datetime] = None
    subscription_status: str = 'Active'
    renewal_reminder_sent: str = 'False'
    remarks: Optional[str] = None
    order_status: str = 'Open'
    offer_copy_path: Optional[str] = None
    order_copy_path: Optional[str] = None
    estimation: Optional[float] = None
    subscription_reminder_sent_30: str = 'False'
    subscription_reminder_sent_7: str = 'False'
    subscription_reminder_sent_1: str = 'False'
    assigned_to_employee_id: Optional[str] = None
    assigned_to_name: Optional[str] = None
    created_by_employee_id: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class OrderCreate(BaseModel):
    lead_id: str
    customer_name: str
    contact_person: Optional[str] = None
    contact_number: Optional[str] = None
    mail_id: Optional[str] = None
    offer_no: Optional[str] = None
    offer_date: Optional[datetime] = None
    product: Optional[str] = None
    cust_supply_po_value: Optional[float] = None
    cust_po_no: Optional[str] = None
    po_date: Optional[datetime] = None
    offer_copy_path: Optional[str] = None
    order_copy_path: Optional[str] = None
    estimation: Optional[float] = None
    subscription_start_date: Optional[datetime] = None
    subscription_end_date: Optional[datetime] = None
    assigned_to_employee_id: Optional[str] = None
    assigned_to_name: Optional[str] = None

class OrderUpdate(BaseModel):
    customer_name: Optional[str] = None
    contact_person: Optional[str] = None
    contact_number: Optional[str] = None
    mail_id: Optional[str] = None
    offer_no: Optional[str] = None
    offer_date: Optional[datetime] = None
    product: Optional[str] = None
    cust_supply_po_value: Optional[float] = None
    cust_po_no: Optional[str] = None
    po_date: Optional[datetime] = None
    offer_copy_path: Optional[str] = None
    order_copy_path: Optional[str] = None
    estimation: Optional[float] = None
    order_copy_received_date: Optional[datetime] = None
    payment_terms: Optional[str] = None
    advance_payment: Optional[float] = None
    delivery_committed: Optional[datetime] = None
    vendor_po_no: Optional[str] = None
    vendor_name: Optional[str] = None
    vendor_po_date: Optional[datetime] = None
    vendor_po_value: Optional[float] = None
    resoline_tax_invoice_no: Optional[str] = None
    resoline_invoice_date: Optional[datetime] = None
    invoice_amount: Optional[float] = None
    vendor_invoice_no: Optional[str] = None
    vendor_dispatch_lr_no: Optional[str] = None
    vendor_dispatch_transport: Optional[str] = None
    material_check: Optional[str] = None
    customer_dispatch_details: Optional[str] = None
    material_received_by_cust: Optional[datetime] = None
    installation_successful: Optional[str] = None
    installation_service_report_no: Optional[str] = None
    service_report_date: Optional[datetime] = None
    service_charges: Optional[float] = None
    final_payment_due: Optional[float] = None
    final_payment_date: Optional[datetime] = None
    subscription_start_date: Optional[datetime] = None
    subscription_end_date: Optional[datetime] = None
    subscription_reminder_sent_30: Optional[str] = None
    subscription_reminder_sent_7: Optional[str] = None
    subscription_reminder_sent_1: Optional[str] = None
    order_status: Optional[str] = None
    remarks: Optional[str] = None
    assigned_to_employee_id: Optional[str] = None
    assigned_to_name: Optional[str] = None

class OrderActivity(BaseModel):
    id: str
    order_id: str
    activity_type: str
    summary: str
    details: Optional[str] = None
    created_by_id: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class OrderActivityCreate(BaseModel):
    order_id: str
    activity_type: str
    summary: str
    details: Optional[str] = None

class SubscriptionReminder(BaseModel):
    id: str
    order_id: str
    reminder_date: datetime
    reminder_type: str
    is_sent: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class DashboardStats(BaseModel):
    total_employees: int
    present_today: int
    absent_today: int
    pending_leaves: int
    total_departments: int

# ============= VEHICLE TRACKING PYDANTIC MODELS =============

class Vehicle(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_name: str
    vehicle_type: str
    fuel_type: str
    registration_number: str
    milage: float
    current_meter_reading: Optional[float] = None
    status: str = 'Active'
    photo_path: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None

class VehicleCreate(BaseModel):
    vehicle_name: str
    vehicle_type: str
    fuel_type: Literal['Petrol', 'Diesel', 'Electric', 'Hybrid']
    registration_number: str
    milage: float
    status: str = 'Active'

class VehicleUsage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_id: Optional[str] = None
    employee_id: str
    employee_name: str
    start_meter_reading: float
    start_reading_photo_path: Optional[str] = None
    end_meter_reading: Optional[float] = None
    end_reading_photo_path: Optional[str] = None
    km_driven: Optional[float] = None
    fuel_consumed: Optional[float] = None
    own_vehicle_type: Optional[str] = None
    own_vehicle_milage: Optional[float] = None
    start_date: datetime
    end_date: Optional[datetime] = None
    status: str = 'Active'
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class VehicleUsageCreate(BaseModel):
    vehicle_id: Optional[str] = None
    employee_id: str
    employee_name: str
    start_meter_reading: float
    own_vehicle_type: Optional[str] = None
    own_vehicle_milage: Optional[float] = None
    notes: Optional[str] = None

class VehicleUsageUpdate(BaseModel):
    end_meter_reading: float
    notes: Optional[str] = None

class FuelExpenseClaim(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_usage_id: str
    employee_id: str
    employee_name: str
    vehicle_id: str
    vehicle_name: str
    km_driven: float
    fuel_consumed: float
    claimed_amount: float
    price_per_liter: float
    claim_status: str = 'Pending'
    is_valid: int = 1
    validation_message: Optional[str] = None
    approver_id: Optional[str] = None
    approver_name: Optional[str] = None
    approved_amount: Optional[float] = None
    approval_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FuelExpenseClaimCreate(BaseModel):
    vehicle_usage_id: str
    claimed_amount: float
    price_per_liter: float = 100.0  # Default price

class FuelExpenseClaimAction(BaseModel):
    claim_status: Literal['Approved', 'Rejected', 'Partially-Approved']
    approver_id: str
    approver_name: str
    approved_amount: Optional[float] = None
    approval_notes: Optional[str] = None

class CGWFlowMetre(BaseModel):
    model_config = ConfigDict(extra="ignore", from_attributes=True)
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    inventory_id: str
    customer_id: str
    customer_name: str
    location: Optional[str] = None
    contact_person: Optional[str] = None
    equipment_name: Optional[str] = None
    flowmeter_details: Optional[str] = None
    product_code: Optional[str] = None
    model_no: Optional[str] = None
    system_mobile_number: Optional[str] = None
    person_mobile_number: Optional[str] = None
    email_id: Optional[str] = None
    date_of_commissioning: Optional[str] = None
    url_link: Optional[str] = None
    user_id: Optional[str] = None
    password: Optional[str] = None
    status: Literal['Active', 'Inactive', 'Maintenance'] = 'Active'
    renewal_date: Optional[str] = None
    review: Optional[str] = None
    calibration_certificate: Optional[str] = None
    remarks: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None

class CGWFlowMetreCreate(BaseModel):
    customer_id: str
    customer_name: str
    location: Optional[str] = None
    contact_person: Optional[str] = None
    equipment_name: Optional[str] = None
    flowmeter_details: Optional[str] = None
    product_code: Optional[str] = None
    model_no: Optional[str] = None
    system_mobile_number: Optional[str] = None
    person_mobile_number: Optional[str] = None
    email_id: Optional[str] = None
    date_of_commissioning: Optional[str] = None
    url_link: Optional[str] = None
    user_id: Optional[str] = None
    password: Optional[str] = None
    status: Literal['Active', 'Inactive', 'Maintenance'] = 'Active'
    renewal_date: Optional[str] = None
    review: Optional[str] = None
    remarks: Optional[str] = None

class CGWFlowMetreUpdate(BaseModel):
    location: Optional[str] = None
    contact_person: Optional[str] = None
    equipment_name: Optional[str] = None
    flowmeter_details: Optional[str] = None
    product_code: Optional[str] = None
    model_no: Optional[str] = None
    system_mobile_number: Optional[str] = None
    person_mobile_number: Optional[str] = None
    email_id: Optional[str] = None
    date_of_commissioning: Optional[str] = None
    url_link: Optional[str] = None
    user_id: Optional[str] = None
    password: Optional[str] = None
    status: Optional[Literal['Active', 'Inactive', 'Maintenance']] = None
    renewal_date: Optional[str] = None
    review: Optional[str] = None
    remarks: Optional[str] = None

# ============= DEPENDENCY =============

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ============= S3 HELPER FUNCTIONS =============

def upload_to_s3(file_content: bytes, filename: str, folder: str = 'uploads') -> Optional[str]:
    """
    Upload file to S3 bucket and return the public URL.
    If S3 is not configured, falls back to local storage.
    """
    if not USE_S3 or not s3_client:
        # Fallback to local storage
        return None
    
    try:
        # Create S3 key with folder prefix
        s3_key = f"{folder}/{uuid.uuid4()}/{filename}"
        
        # Upload to S3
        s3_client.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=s3_key,
            Body=file_content,
            ContentType='application/octet-stream'
        )
        
        # Generate public URL
        s3_url = f"https://{S3_BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{s3_key}"
        return s3_url
    
    except ClientError as e:
        logging.error(f"S3 upload error: {str(e)}")
        return None

def delete_from_s3(file_url: str) -> bool:
    """
    Delete file from S3 bucket.
    Extracts the S3 key from the public URL.
    """
    if not USE_S3 or not s3_client or not file_url:
        return False
    
    try:
        # Extract S3 key from URL
        if S3_BUCKET_NAME in file_url:
            s3_key = file_url.split(f"{S3_BUCKET_NAME}.s3")[1]
            if s3_key.startswith('.').replace('.s3.', '/').startswith('/'):
                # Clean up the key
                s3_key = s3_key.split('/')[-1]
                s3_key = '/'.join(file_url.split('/')[-3:])
            else:
                s3_key = '/'.join(file_url.split('/')[-3:])
            
            s3_client.delete_object(
                Bucket=S3_BUCKET_NAME,
                Key=s3_key
            )
            return True
    except ClientError as e:
        logging.error(f"S3 delete error: {str(e)}")
    
    return False

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

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    try:
        token = credentials.credentials
        # Allow small clock skew between client and server when validating expiry
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            leeway=300,  # 5 minutes grace period
        )
        user = db.query(UserModel).filter(UserModel.id == payload['user_id']).first()
        if not user:
            raise HTTPException(status_code=401, detail='User not found')
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expired')
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Invalid token')

def require_permission(permission: str):
    """Dependency for checking user has specific permission"""
    def verify_permission(current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
        if current_user.role == 'Admin':
            return current_user  # Admins have all permissions
        
        # Get role permissions from database
        role = db.query(RoleModel).filter(RoleModel.name == current_user.role).first()
        if not role:
            raise HTTPException(status_code=403, detail='Role not found')
        
        permissions = json.loads(role.permissions) if isinstance(role.permissions, str) else role.permissions
        if permission not in permissions:
            raise HTTPException(status_code=403, detail=f'Permission "{permission}" denied')
        
        return current_user
    return verify_permission



# ============= HEALTH CHECK ROUTES =============

@api_router.get('/db-check')
def db_check():
    """Check database connectivity"""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            return {"db": "connected", "status": "ok"}
    except Exception as e:
        return {"db": "disconnected", "status": "error", "message": str(e)}

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
    
    role_name = user_data.role.strip()
    if not db.query(RoleModel).filter(RoleModel.name == role_name).first():
        raise HTTPException(status_code=400, detail='Invalid role name.')

    hashed_pw = hash_password(user_data.password)
    new_user = UserModel(
        email=user_data.email,
        password=hashed_pw,
        name=user_data.name,
        role=role_name,
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
    
    user_data['permissions'] = get_permissions_for_role(db, new_user.role)
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
    
    user_data['permissions'] = get_permissions_for_role(db, user.role)
    return {'token': token, 'user': user_data}

@api_router.get('/auth/me', response_model=UserDetails)
def get_me(current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
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
    
    user_data['permissions'] = get_permissions_for_role(db, current_user.role)
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
        
        # Read file content
        file_content = file.file.read()
        filename = f"profile_{uuid.uuid4()}{Path(file.filename).suffix}"
        
        # Upload to S3 (required, no local fallback)
        photo_path = upload_to_s3(file_content, filename, folder='profile_photos')
        
        if not photo_path:
            raise HTTPException(
                status_code=503,
                detail='File upload service is temporarily unavailable. Please try again in a few moments.'
            )
        
        # Update employee profile_photo path
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

# ============= OFFICE LOCATION & DISTANCE =============
OFFICE_RADIUS_METRES = 50

def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance in metres between two (lat, lon) points."""
    import math
    R = 6371000  # Earth radius in metres
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def get_office_location(db: Session):
    """Return (lat, lng) from settings or env. None if not configured."""
    row_lat = db.query(SettingsModel).filter(SettingsModel.config_key == 'office_lat').first()
    row_lng = db.query(SettingsModel).filter(SettingsModel.config_key == 'office_lng').first()
    if row_lat and row_lng:
        try:
            return float(row_lat.value), float(row_lng.value)
        except (TypeError, ValueError):
            pass
    lat_env = os.environ.get('OFFICE_LAT')
    lng_env = os.environ.get('OFFICE_LNG')
    if lat_env is not None and lng_env is not None:
        try:
            return float(lat_env), float(lng_env)
        except ValueError:
            pass
    return None

def is_within_office(db: Session, lat: float, lng: float) -> bool:
    office = get_office_location(db)
    if office is None:
        return True  # No office set: allow without location check (e.g. admin override)
    dist = _haversine_m(office[0], office[1], lat, lng)
    return dist <= OFFICE_RADIUS_METRES

# ============= CUSTOMERS =============

@api_router.post('/customers', response_model=Customer)
def create_customer(cust_data: CustomerCreateUpdate, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    
    max_cust_num = db.query(
        func.max(cast(func.substr(CustomerModel.customer_id, 5), Integer))
    ).scalar()
    next_cust_num = (max_cust_num or 0) + 1
    cust_id = f'CUST{str(next_cust_num).zfill(5)}'
    
    new_customer = CustomerModel(
        customer_id=cust_id,
        company_name=cust_data.company_name,
        gst_number=cust_data.gst_number,
        contact_person_name=cust_data.contact_person_name,
        phone=cust_data.phone,
        email=cust_data.email,
        address_line=cust_data.address_line,
        city=cust_data.city,
        state=cust_data.state,
        pincode=cust_data.pincode,
        country=cust_data.country,
        status=cust_data.status
    )
    db.add(new_customer)
    try:
        db.commit()
        db.refresh(new_customer)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail='Customer already exists')
    
    # Add contacts
    if cust_data.contacts:
        for contact in cust_data.contacts:
            new_contact = CustomerContactModel(
                customer_id=new_customer.id,
                contact_person_name=contact.contact_person_name,
                designation=contact.designation,
                phone=contact.phone,
                email=contact.email,
                is_primary=contact.is_primary
            )
            db.add(new_contact)
    
    # Add addresses
    if cust_data.addresses:
        for address in cust_data.addresses:
            new_address = CustomerAddressModel(
                customer_id=new_customer.id,
                address_line=address.address_line,
                city=address.city,
                state=address.state,
                pincode=address.pincode,
                country=address.country,
                is_primary=address.is_primary
            )
            db.add(new_address)
    
    db.commit()
    db.refresh(new_customer)
    
    # Load relationships for response
    new_customer.contacts = db.query(CustomerContactModel).filter(CustomerContactModel.customer_id == new_customer.id).all()
    new_customer.addresses = db.query(CustomerAddressModel).filter(CustomerAddressModel.customer_id == new_customer.id).all()
    
    return new_customer

@api_router.get('/customers', response_model=List[Customer])
def get_customers(current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    customers = db.query(CustomerModel).filter(CustomerModel.status == 'Active').all()
    
    # Attach contacts and addresses
    for customer in customers:
        customer.contacts = db.query(CustomerContactModel).filter(CustomerContactModel.customer_id == customer.id).all()
        customer.addresses = db.query(CustomerAddressModel).filter(CustomerAddressModel.customer_id == customer.id).all()
    
    return customers

@api_router.get('/customers/{customer_id}', response_model=Customer)
def get_customer(customer_id: str, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    customer = db.query(CustomerModel).filter(CustomerModel.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail='Customer not found')
    
    # Attach contacts and addresses
    customer.contacts = db.query(CustomerContactModel).filter(CustomerContactModel.customer_id == customer.id).all()
    customer.addresses = db.query(CustomerAddressModel).filter(CustomerAddressModel.customer_id == customer.id).all()
    
    return customer

@api_router.put('/customers/{customer_id}', response_model=Customer)
def update_customer(customer_id: str, cust_data: CustomerCreateUpdate, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    
    customer = db.query(CustomerModel).filter(CustomerModel.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail='Customer not found')
    
    # Update basic customer fields
    basic_fields = ['company_name', 'gst_number', 'contact_person_name', 'phone', 'email', 'address_line', 'city', 'state', 'pincode', 'country', 'status']
    for field in basic_fields:
        if hasattr(cust_data, field):
            setattr(customer, field, getattr(cust_data, field))
    
    customer.updated_at = datetime.now()
    db.commit()
    db.refresh(customer)
    
    # Delete and recreate contacts
    if cust_data.contacts is not None:
        db.query(CustomerContactModel).filter(CustomerContactModel.customer_id == customer.id).delete()
        for contact in cust_data.contacts:
            new_contact = CustomerContactModel(
                customer_id=customer.id,
                contact_person_name=contact.contact_person_name,
                designation=contact.designation,
                phone=contact.phone,
                email=contact.email,
                is_primary=contact.is_primary
            )
            db.add(new_contact)
    
    # Delete and recreate addresses
    if cust_data.addresses is not None:
        db.query(CustomerAddressModel).filter(CustomerAddressModel.customer_id == customer.id).delete()
        for address in cust_data.addresses:
            new_address = CustomerAddressModel(
                customer_id=customer.id,
                address_line=address.address_line,
                city=address.city,
                state=address.state,
                pincode=address.pincode,
                country=address.country,
                is_primary=address.is_primary
            )
            db.add(new_address)
    
    db.commit()
    db.refresh(customer)
    
    # Load relationships for response
    customer.contacts = db.query(CustomerContactModel).filter(CustomerContactModel.customer_id == customer.id).all()
    customer.addresses = db.query(CustomerAddressModel).filter(CustomerAddressModel.customer_id == customer.id).all()
    
    return customer

@api_router.get('/customers/{customer_id}/contacts', response_model=List[CustomerContact])
def get_customer_contacts(customer_id: str, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    customer = db.query(CustomerModel).filter(CustomerModel.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail='Customer not found')
    
    contacts = db.query(CustomerContactModel).filter(CustomerContactModel.customer_id == customer_id).all()
    return contacts

@api_router.delete('/customers/{customer_id}')
def delete_customer(customer_id: str, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    
    customer = db.query(CustomerModel).filter(CustomerModel.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail='Customer not found')
    
    db.delete(customer)
    db.commit()
    
    return {'message': 'Customer deleted successfully'}

# ============= CGW FLOW METRE INVENTORY =============

@api_router.post('/cgw-flow-metres', response_model=CGWFlowMetre)
def create_cgw_flow_metre(data: CGWFlowMetreCreate, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ['Admin', 'HR']:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    # Generate inventory_id
    max_inv_num = db.query(
        func.max(cast(func.substr(CGWFlowMetreModel.inventory_id, 4), Integer))
    ).scalar()
    next_inv_num = (max_inv_num or 0) + 1
    inv_id = f'INV{str(next_inv_num).zfill(4)}'
    
    new_item = CGWFlowMetreModel(
        inventory_id=inv_id,
        customer_id=data.customer_id,
        customer_name=data.customer_name,
        location=data.location,
        contact_person=data.contact_person,
        equipment_name=data.equipment_name,
        flowmeter_details=data.flowmeter_details,
        telemetric_system=data.telemetric_system,
        system_mobile_number=data.system_mobile_number,
        person_mobile_number=data.person_mobile_number,
        email_id=data.email_id,
        date_of_commissioning=data.date_of_commissioning,
        url_link=data.url_link,
        user_id=data.user_id,
        password=data.password,
        status=data.status,
        renewal_date=data.renewal_date,
        review=data.review,
        remarks=data.remarks
    )
    db.add(new_item)
    try:
        db.commit()
        db.refresh(new_item)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail='Inventory item already exists')
    
    return new_item

@api_router.get('/cgw-flow-metres', response_model=List[CGWFlowMetre])
def get_cgw_flow_metres(current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.query(CGWFlowMetreModel).all()
    return items

@api_router.get('/cgw-flow-metres/{inventory_id}', response_model=CGWFlowMetre)
def get_cgw_flow_metre(inventory_id: str, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.query(CGWFlowMetreModel).filter(CGWFlowMetreModel.id == inventory_id).first()
    if not item:
        raise HTTPException(status_code=404, detail='Inventory item not found')
    return item

@api_router.get('/cgw-flow-metres/customer/{customer_id}', response_model=List[CGWFlowMetre])
def get_cgw_by_customer(customer_id: str, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.query(CGWFlowMetreModel).filter(CGWFlowMetreModel.customer_id == customer_id).all()
    return items

@api_router.put('/cgw-flow-metres/{inventory_id}', response_model=CGWFlowMetre)
def update_cgw_flow_metre(inventory_id: str, data: CGWFlowMetreUpdate, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ['Admin', 'HR']:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    item = db.query(CGWFlowMetreModel).filter(CGWFlowMetreModel.id == inventory_id).first()
    if not item:
        raise HTTPException(status_code=404, detail='Inventory item not found')
    
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    
    return item

@api_router.delete('/cgw-flow-metres/{inventory_id}')
def delete_cgw_flow_metre(inventory_id: str, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ['Admin', 'HR']:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    item = db.query(CGWFlowMetreModel).filter(CGWFlowMetreModel.id == inventory_id).first()
    if not item:
        raise HTTPException(status_code=404, detail='Inventory item not found')
    
    db.delete(item)
    db.commit()
    
    return {'message': 'Inventory item deleted successfully'}

@api_router.post('/cgw-flow-metres/{inventory_id}/upload-certificate')
def upload_calibration_certificate(
    inventory_id: str,
    file: UploadFile = File(...),
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in ['Admin', 'HR']:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    item = db.query(CGWFlowMetreModel).filter(CGWFlowMetreModel.id == inventory_id).first()
    if not item:
        raise HTTPException(status_code=404, detail='Inventory item not found')
    
    # Upload to S3 or local storage
    try:
        file_data = file.file.read()
        file_name = f"certificates/{inventory_id}/{file.filename}"
        
        if USE_S3:
            s3_client.put_object(
                Bucket=S3_BUCKET_NAME,
                Key=file_name,
                Body=file_data,
                ContentType=file.content_type
            )
            file_url = f"s3://{S3_BUCKET_NAME}/{file_name}"
        else:
            cert_path = UPLOAD_DIR / file_name
            cert_path.parent.mkdir(parents=True, exist_ok=True)
            with open(cert_path, 'wb') as f:
                f.write(file_data)
            file_url = f"uploads/{file_name}"
        
        item.calibration_certificate = file_url
        item.updated_at = datetime.now(timezone.utc)
        db.commit()
        
        return {'file_url': file_url, 'message': 'Certificate uploaded successfully'}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Upload failed: {str(e)}')

@api_router.post('/cgw-flow-metres/import/excel')
def import_cgw_from_excel(
    file: UploadFile = File(...),
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Import CGW Flow Metre items from Excel file"""
    if current_user.role not in ['Admin', 'HR']:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    try:
        # Read Excel file
        contents = file.file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        # Column mapping from Excel headers to database fields
        column_mapping = {
            'CUSTOMER NAME': 'customer_name',
            'LOCATION': 'location',
            'CONTACT PERSON': 'contact_person',
            'NAME OF EQUIPMENT': 'equipment_name',
            'FLOWMETER/PIEZOMETER DETAILS': 'flowmeter_details',
            'TELEMETRIC SYSTEM': 'telemetric_system',
            'SYSTEM MOBILE NUMBER': 'system_mobile_number',
            'PERSON MOBILE NUMBER': 'person_mobile_number',
            'EMAIL ID': 'email_id',
            'DATE OF COMMISSONING': 'date_of_commissioning',
            'URL LINK': 'url_link',
            'USER ID': 'user_id',
            'PASSWORD': 'password',
            'STATUS': 'status',
            'RENEWAL DATE WILL BE': 'renewal_date',
            'REVIEW': 'review',
            'CALIBARATION CERTIFICATE': 'calibration_certificate',
            'REMARKS': 'remarks'
        }
        
        # Normalize column names (strip whitespace)
        df.columns = df.columns.str.strip()
        
        imported_count = 0
        failed_count = 0
        errors = []
        
        for index, row in df.iterrows():
            try:
                # Get or verify customer exists
                customer_name = str(row.get('CUSTOMER NAME', '')).strip()
                if not customer_name:
                    errors.append(f"Row {index + 2}: Missing customer name")
                    failed_count += 1
                    continue
                
                # Find customer by name
                customer = db.query(CustomerModel).filter(
                    CustomerModel.company_name == customer_name
                ).first()
                
                if not customer:
                    errors.append(f"Row {index + 2}: Customer '{customer_name}' not found in database")
                    failed_count += 1
                    continue
                
                # Generate inventory_id
                max_inv_num = db.query(
                    func.max(cast(func.substr(CGWFlowMetreModel.inventory_id, 4), Integer))
                ).scalar()
                next_inv_num = (max_inv_num or 0) + 1
                inv_id = f'INV{str(next_inv_num).zfill(4)}'
                
                # Prepare data
                data = {
                    'inventory_id': inv_id,
                    'customer_id': customer.id,
                    'customer_name': customer_name,
                    'location': str(row.get('LOCATION', '')).strip() or None,
                    'contact_person': str(row.get('CONTACT PERSON', '')).strip() or None,
                    'equipment_name': str(row.get('NAME OF EQUIPMENT', '')).strip() or None,
                    'flowmeter_details': str(row.get('FLOWMETER/PIEZOMETER DETAILS', '')).strip() or None,
                    'telemetric_system': str(row.get('TELEMETRIC SYSTEM', '')).strip() or None,
                    'system_mobile_number': str(row.get('SYSTEM MOBILE NUMBER', '')).strip() or None,
                    'person_mobile_number': str(row.get('PERSON MOBILE NUMBER', '')).strip() or None,
                    'email_id': str(row.get('EMAIL ID', '')).strip() or None,
                    'date_of_commissioning': str(row.get('DATE OF COMMISSONING', '')).strip() or None,
                    'url_link': str(row.get('URL LINK', '')).strip() or None,
                    'user_id': str(row.get('USER ID', '')).strip() or None,
                    'password': str(row.get('PASSWORD', '')).strip() or None,
                    'status': str(row.get('STATUS', 'Active')).strip() or 'Active',
                    'renewal_date': str(row.get('RENEWAL DATE WILL BE', '')).strip() or None,
                    'review': str(row.get('REVIEW', '')).strip() or None,
                    'calibration_certificate': str(row.get('CALIBARATION CERTIFICATE', '')).strip() or None,
                    'remarks': str(row.get('REMARKS', '')).strip() or None
                }
                
                # Create new item
                new_item = CGWFlowMetreModel(**data)
                db.add(new_item)
                imported_count += 1
                
            except Exception as e:
                errors.append(f"Row {index + 2}: {str(e)}")
                failed_count += 1
                continue
        
        # Commit all items at once
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=400, detail=f'Database error: {str(e)}')
        
        return {
            'message': 'Import completed',
            'imported': imported_count,
            'failed': failed_count,
            'errors': errors if errors else []
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f'Import failed: {str(e)}')

# ============= TASKS =============

@api_router.post('/tasks', response_model=Task)
def create_task(task_data: TaskCreate, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    # Any authenticated user can create tasks (no role restrictions)
    
    # Validate due date is not in the past
    due_date_obj = datetime.strptime(task_data.due_date, '%Y-%m-%d')
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    if due_date_obj < today:
        raise HTTPException(status_code=400, detail='Due date cannot be in the past')
    
    # Generate task_id
    max_task_num = db.query(
        func.max(cast(func.substr(TaskModel.task_id, 5), Integer))
    ).scalar()
    next_task_num = (max_task_num or 0) + 1
    task_id = f'TASK{str(next_task_num).zfill(5)}'
    
    # Verify assigned employee exists and get their employee_id
    # task_data.assigned_to_employee_id could be either the employee's id (UUID) or employee_id (human-readable)
    employee = db.query(EmployeeModel).filter(
        (EmployeeModel.id == task_data.assigned_to_employee_id) |
        (EmployeeModel.employee_id == task_data.assigned_to_employee_id)
    ).first()
    if not employee:
        raise HTTPException(status_code=404, detail='Assigned employee not found')
    
    # Convert estimated time from hours (API) to minutes (DB)
    estimated_minutes = None
    if task_data.estimated_time_hours is not None:
        try:
            estimated_minutes = int(task_data.estimated_time_hours * 60)
        except (TypeError, ValueError):
            estimated_minutes = None

    new_task = TaskModel(
        task_id=task_id,
        title=task_data.title,
        description=task_data.description,
        # Priority is no longer part of the create API; default DB value will be used
        assigned_to_employee_id=employee.employee_id,  # Use human-readable employee_id
        assigned_to_name=employee.name,
        created_by_employee_id=current_user.employee_id,
        created_by_name=current_user.name,
        due_date=task_data.due_date,
        estimated_time_minutes=estimated_minutes,
        status='Pending'
    )
    
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    
    return new_task

@api_router.post('/tasks/{task_id}/upload-attachment')
def upload_task_attachment(
    task_id: str,
    file: UploadFile = File(...),
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload attachment to S3 for a task"""
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    
    # Check authorization - only manager/admin or task assignee can upload
    is_assignee = task.assigned_to_employee_id == current_user.employee_id
    is_creator = task.created_by_employee_id == current_user.employee_id
    is_admin = current_user.role in ['Admin', 'Manager']
    
    if not (is_assignee or is_creator or is_admin):
        raise HTTPException(status_code=403, detail='Not authorized to upload attachment for this task')
    
    try:
        # Read file content
        file_content = file.file.read()
        filename = file.filename or 'attachment'
        
        # Upload to S3 (required, no local fallback)
        attachment_url = upload_to_s3(file_content, filename, folder='tasks')
        
        if not attachment_url:
            raise HTTPException(
                status_code=503,
                detail='File upload service is temporarily unavailable. Please try again in a few moments.'
            )
        
        # Delete old attachment from S3 if it exists
        if task.attachment_path:
            delete_from_s3(task.attachment_path)
        
        task.attachment_path = attachment_url
        db.commit()
        db.refresh(task)
        
        return {'attachment_url': attachment_url, 'message': 'Attachment uploaded successfully'}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get('/tasks/board', response_model=TaskBoardView)
def get_tasks_board(
    search: Optional[str] = None,
    employee_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get tasks grouped by status for Kanban board view."""
    # Define the order of statuses
    status_order = ['Pending', 'In Progress', 'Completed', 'Overdue']
    
    # Auto-update overdue tasks
    today = datetime.now().strftime('%Y-%m-%d')
    overdue_tasks = db.query(TaskModel).filter(
        (TaskModel.due_date < today) &
        (TaskModel.status != 'Completed') &
        (TaskModel.status != 'Overdue')
    ).all()
    
    for task in overdue_tasks:
        task.status = 'Overdue'
    
    db.commit()
    
    # Build base query
    query = db.query(TaskModel)
    
    # If employee, filter to own tasks
    if current_user.role == 'Employee':
        query = query.filter(TaskModel.assigned_to_employee_id == current_user.employee_id)
    # If admin/manager with employee filter, apply it
    elif employee_id:
        query = query.filter(TaskModel.assigned_to_employee_id == employee_id)
    
    # Apply search filter
    if search:
        query = query.filter(
            (TaskModel.title.ilike(f'%{search}%')) |
            (TaskModel.description.ilike(f'%{search}%'))
        )
    
    all_tasks = query.all()
    
    # Count user's assigned tasks
    user_task_count = len([t for t in all_tasks if t.assigned_to_employee_id == current_user.employee_id])
    
    # Group tasks by status and convert to Pydantic models
    columns = []
    for status in status_order:
        status_tasks_models = [t for t in all_tasks if t.status == status]
        # Convert SQLAlchemy models to Pydantic models
        status_tasks = [Task.model_validate(t) for t in status_tasks_models]
        column = TaskBoardColumn(
            status=status,
            tasks=status_tasks,
            count=len(status_tasks)
        )
        columns.append(column)
    
    return TaskBoardView(
        columns=columns,
        total_tasks=len(all_tasks),
        user_tasks=user_task_count
    )

@api_router.get('/tasks/dashboard', response_model=TaskDashboard)
def get_tasks_dashboard(
    employee_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get task dashboard with statistics for all employees or specific employee."""
    # Check permission - only admin/manager can view dashboard
    if current_user.role not in ['Admin', 'Manager']:
        raise HTTPException(status_code=403, detail='Not authorized to view dashboard')
    
    # Auto-update overdue tasks
    today = datetime.now().strftime('%Y-%m-%d')
    overdue_tasks = db.query(TaskModel).filter(
        (TaskModel.due_date < today) &
        (TaskModel.status != 'Completed') &
        (TaskModel.status != 'Overdue')
    ).all()
    
    for task in overdue_tasks:
        task.status = 'Overdue'
    
    db.commit()
    
    # Get all tasks
    all_tasks = db.query(TaskModel).all()
    
    # Count tasks by status
    pending_count = len([t for t in all_tasks if t.status == 'Pending'])
    in_progress_count = len([t for t in all_tasks if t.status == 'In Progress'])
    completed_count = len([t for t in all_tasks if t.status == 'Completed'])
    overdue_count = len([t for t in all_tasks if t.status == 'Overdue'])
    
    # Get unique employees and their stats
    employees_data = {}
    for task in all_tasks:
        emp_id = task.assigned_to_employee_id
        if emp_id not in employees_data:
            employees_data[emp_id] = {
                'employee_id': emp_id,
                'name': task.assigned_to_name,
                'total': 0,
                'pending': 0,
                'in_progress': 0,
                'completed': 0,
                'overdue': 0,
                'completion_percentages': []
            }
        
        employees_data[emp_id]['total'] += 1
        if task.status == 'Pending':
            employees_data[emp_id]['pending'] += 1
        elif task.status == 'In Progress':
            employees_data[emp_id]['in_progress'] += 1
        elif task.status == 'Completed':
            employees_data[emp_id]['completed'] += 1
        elif task.status == 'Overdue':
            employees_data[emp_id]['overdue'] += 1
        
        employees_data[emp_id]['completion_percentages'].append(task.completion_percentage or 0)
    
    # Build employee stats list
    employee_stats = []
    for emp_id, data in employees_data.items():
        avg_completion = sum(data['completion_percentages']) / len(data['completion_percentages']) if data['completion_percentages'] else 0
        employee_stats.append(EmployeeDashboardStats(
            name=data['name'],
            employee_id=emp_id,
            total_tasks=data['total'],
            pending=data['pending'],
            in_progress=data['in_progress'],
            completed=data['completed'],
            overdue=data['overdue'],
            avg_completion_percentage=avg_completion
        ))
    
    # Sort by name
    employee_stats.sort(key=lambda x: x.name)
    
    # If specific employee filter is applied, get their tasks
    filtered_tasks = None
    if employee_id:
        filtered_tasks = [Task.model_validate(t) for t in all_tasks if t.assigned_to_employee_id == employee_id]
    
    return TaskDashboard(
        total_tasks=len(all_tasks),
        pending_count=pending_count,
        in_progress_count=in_progress_count,
        completed_count=completed_count,
        overdue_count=overdue_count,
        employees=employee_stats,
        tasks=filtered_tasks
    )

@api_router.get('/tasks', response_model=List[Task])
def get_tasks(
    filter_type: Optional[str] = None,  # today, tomorrow, overdue, completed, my_tasks
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get tasks. Employees see their own tasks; Managers/Admins see all or filtered tasks."""
    # Auto-update overdue tasks
    today = datetime.now().strftime('%Y-%m-%d')
    overdue_tasks = db.query(TaskModel).filter(
        (TaskModel.due_date < today) &
        (TaskModel.status != 'Completed') &
        (TaskModel.status != 'Overdue')
    ).all()
    
    for task in overdue_tasks:
        task.status = 'Overdue'
    
    db.commit()
    
    query = db.query(TaskModel)
    
    # If employee, filter to own tasks
    if current_user.role == 'Employee':
        query = query.filter(TaskModel.assigned_to_employee_id == current_user.employee_id)
    
    # Apply filter
    tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
    
    if filter_type == 'today':
        query = query.filter(TaskModel.due_date == today)
    elif filter_type == 'tomorrow':
        query = query.filter(TaskModel.due_date == tomorrow)
    elif filter_type == 'overdue':
        query = query.filter(
            (TaskModel.due_date < today) &
            (TaskModel.status.in_(['Pending', 'In Progress', 'Overdue']))
        )
    elif filter_type == 'completed':
        query = query.filter(TaskModel.status == 'Completed')
    
    tasks = query.order_by(TaskModel.due_date, TaskModel.priority.desc()).all()
    
    return tasks

@api_router.get('/tasks/{task_id}', response_model=Task)
def get_task(task_id: str, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    
    # Check permission to view
    if current_user.role == 'Employee' and task.assigned_to_employee_id != current_user.employee_id:
        raise HTTPException(status_code=403, detail='Not authorized to view this task')
    
    return task

@api_router.put('/tasks/{task_id}', response_model=Task)
def update_task(task_id: str, task_data: TaskUpdate, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    
    # Allow updates by: Admin, Manager, creator, or assignee
    is_creator = task.created_by_employee_id == current_user.employee_id
    is_assignee = task.assigned_to_employee_id == current_user.employee_id
    is_admin_or_manager = current_user.role in ['Admin', 'Manager']
    
    if not (is_admin_or_manager or is_creator or is_assignee):
        raise HTTPException(status_code=403, detail='Not authorized to update this task')
    
    # Update fields
    if task_data.title is not None:
        task.title = task_data.title
    if task_data.description is not None:
        task.description = task_data.description
    if task_data.assigned_to_employee_id is not None:
        employee = db.query(EmployeeModel).filter(
            (EmployeeModel.id == task_data.assigned_to_employee_id) |
            (EmployeeModel.employee_id == task_data.assigned_to_employee_id)
        ).first()
        if not employee:
            raise HTTPException(status_code=404, detail='Assigned employee not found')
        task.assigned_to_employee_id = employee.employee_id  # Use human-readable employee_id
        task.assigned_to_name = employee.name
    if task_data.due_date is not None:
        task.due_date = task_data.due_date
    if task_data.status is not None:
        task.status = task_data.status
        if task_data.status == 'Completed':
            task.completed_at = datetime.now()
    # Convert estimated time from hours (API) to minutes (DB)
    if task_data.estimated_time_hours is not None:
        try:
            task.estimated_time_minutes = int(task_data.estimated_time_hours * 60)
        except (TypeError, ValueError):
            task.estimated_time_minutes = None
    if task_data.actual_time_minutes is not None:
        task.actual_time_minutes = task_data.actual_time_minutes
    if task_data.completion_notes is not None:
        task.completion_notes = task_data.completion_notes
    if task_data.completion_percentage is not None:
        task.completion_percentage = task_data.completion_percentage
    
    task.updated_at = datetime.now()
    db.commit()
    db.refresh(task)
    
    return task

@api_router.delete('/tasks/{task_id}')
def delete_task(task_id: str, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    
    # Allow deletion by: Admin, Manager, or the creator of the task
    is_creator = task.created_by_employee_id == current_user.employee_id
    is_admin_or_manager = current_user.role in ['Admin', 'Manager']
    
    if not (is_admin_or_manager or is_creator):
        raise HTTPException(status_code=403, detail='Not authorized to delete this task')
    
    db.delete(task)
    db.commit()
    
    return {'message': 'Task deleted successfully'}

@api_router.put('/tasks/{task_id}/status')
def change_task_status(
    task_id: str,
    status_data: TaskStatusChange,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Quick status change endpoint for Kanban board drag-and-drop."""
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    
    # Check permission - assignee can update their own task, manager/admin can update any
    is_assignee = task.assigned_to_employee_id == current_user.employee_id
    is_admin_or_manager = current_user.role in ['Admin', 'Manager']
    
    if not (is_assignee or is_admin_or_manager):
        raise HTTPException(status_code=403, detail='Not authorized to update this task')
    
    # Update status
    task.status = status_data.status
    if status_data.status == 'Completed':
        task.completed_at = datetime.now()
    if status_data.completion_notes is not None:
        task.completion_notes = status_data.completion_notes
    if status_data.actual_time_minutes is not None:
        task.actual_time_minutes = status_data.actual_time_minutes
    
    task.updated_at = datetime.now()
    db.commit()
    db.refresh(task)
    
    return task

@api_router.post('/tasks/{task_id}/mark-in-progress')
def mark_task_in_progress(task_id: str, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    """Employee marks task as In Progress"""
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    
    if task.assigned_to_employee_id != current_user.employee_id:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    task.status = 'In Progress'
    task.updated_at = datetime.now()
    db.commit()
    db.refresh(task)
    
    return task

@api_router.post('/tasks/{task_id}/complete')
def complete_task(task_id: str, completion_data: TaskUpdate, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    """Employee marks task as Completed"""
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    
    if task.assigned_to_employee_id != current_user.employee_id:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    task.status = 'Completed'
    if completion_data.completion_notes:
        task.completion_notes = completion_data.completion_notes
    if completion_data.actual_time_minutes:
        task.actual_time_minutes = completion_data.actual_time_minutes
    task.completed_at = datetime.now()
    task.updated_at = datetime.now()
    db.commit()
    db.refresh(task)
    
    return task

@api_router.post('/tasks/{task_id}/update-completion')
def update_task_completion(task_id: str, completion_data: TaskUpdate, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    """Employee updates task completion notes and hours - can be called at any time"""
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    
    if task.assigned_to_employee_id != current_user.employee_id:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    # Allow updating notes and hours for assigned tasks
    if completion_data.completion_notes is not None:
        task.completion_notes = completion_data.completion_notes
    if completion_data.actual_time_minutes is not None:
        task.actual_time_minutes = completion_data.actual_time_minutes
    
    task.updated_at = datetime.now()
    db.commit()
    db.refresh(task)
    
    return task

@api_router.post('/tasks/{task_id}/request-carryforward')
def request_task_carryforward(task_id: str, approval_data: TaskApprovalRequest, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    """Employee requests to carry forward task to next day"""
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    
    if task.assigned_to_employee_id != current_user.employee_id:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    # Check if already has pending approval
    existing_approval = db.query(TaskApprovalModel).filter(
        TaskApprovalModel.task_id == task_id,
        TaskApprovalModel.status == 'Pending'
    ).first()
    if existing_approval:
        raise HTTPException(status_code=400, detail='Task already has a pending approval request')
    
    task.status = 'Approval Pending'
    
    approval = TaskApprovalModel(
        task_id=task_id,
        request_type='carry_forward',
        requested_by_employee_id=current_user.employee_id,
        requested_by_name=current_user.name,
        reason=approval_data.reason
    )
    
    task.updated_at = datetime.now()
    db.add(approval)
    db.commit()
    db.refresh(task)
    
    return task

@api_router.get('/tasks/approvals/pending', response_model=List[TaskApproval])
def get_pending_approvals(current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get pending task approvals for manager"""
    if current_user.role not in ['Admin', 'Manager']:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    approvals = db.query(TaskApprovalModel).filter(
        TaskApprovalModel.status == 'Pending'
    ).order_by(TaskApprovalModel.requested_at.desc()).all()
    
    return approvals

@api_router.post('/task-approvals/{approval_id}/decide')
def decide_task_approval(approval_id: str, decision: TaskApprovalAction, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    """Approve or reject task carryforward request"""
    if current_user.role not in ['Admin', 'Manager']:
        raise HTTPException(status_code=403, detail='Not authorized')
    
    approval = db.query(TaskApprovalModel).filter(TaskApprovalModel.id == approval_id).first()
    if not approval:
        raise HTTPException(status_code=404, detail='Approval request not found')
    
    task = db.query(TaskModel).filter(TaskModel.id == approval.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    
    approval.status = decision.status
    approval.approver_id = current_user.id
    approval.approver_name = current_user.name
    approval.approved_at = datetime.now()
    approval.approval_comment = decision.approval_comment
    
    if decision.status == 'Approved':
        # Shift due date to next day
        current_due_date = datetime.strptime(task.due_date, '%Y-%m-%d')
        new_due_date = (current_due_date + timedelta(days=1)).strftime('%Y-%m-%d')
        
        task.due_date = new_due_date
        task.status = 'Pending'
        approval.new_due_date = new_due_date
    else:  # Rejected
        task.status = 'Overdue'
    
    task.updated_at = datetime.now()
    db.commit()
    
    return {'message': f'Task approval {decision.status.lower()}', 'approval': approval}

# ============= TASK COMMENTS =============

@api_router.get('/tasks/{task_id}/comments', response_model=List[TaskComment])
def get_task_comments(
    task_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all comments for a task"""
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    
    comments = db.query(TaskCommentModel).filter(
        TaskCommentModel.task_id == task.task_id
    ).order_by(TaskCommentModel.created_at.desc()).all()
    
    return [TaskComment.model_validate(c) for c in comments]

@api_router.post('/tasks/{task_id}/comments', response_model=TaskComment)
def add_task_comment(
    task_id: str,
    comment: TaskCommentCreate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a comment to a task"""
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    
    new_comment = TaskCommentModel(
        task_id=task.task_id,
        author_employee_id=current_user.employee_id,
        author_name=current_user.name,
        content=comment.content
    )
    
    db.add(new_comment)
    db.commit()
    db.refresh(new_comment)
    
    return TaskComment.model_validate(new_comment)

# ============= TASK TIME LOGS =============

@api_router.get('/tasks/{task_id}/time-logs', response_model=List[TaskTimeLog])
def get_task_time_logs(
    task_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all time logs for a task"""
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    
    logs = db.query(TaskTimeLogModel).filter(
        TaskTimeLogModel.task_id == task.task_id
    ).order_by(TaskTimeLogModel.created_at.desc()).all()
    
    return [TaskTimeLog.model_validate(log) for log in logs]

@api_router.post('/tasks/{task_id}/time-logs', response_model=TaskTimeLog)
def add_task_time_log(
    task_id: str,
    time_log: TaskTimeLogCreate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Log time spent on a task"""
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    
    new_log = TaskTimeLogModel(
        task_id=task.task_id,
        logged_by_employee_id=current_user.employee_id,
        logged_by_name=current_user.name,
        time_spent_minutes=time_log.time_spent_minutes,
        description=time_log.description,
        log_date=time_log.log_date
    )
    
    db.add(new_log)
    db.commit()
    db.refresh(new_log)
    
    return TaskTimeLog.model_validate(new_log)

# ============= TASK ATTACHMENTS =============

@api_router.get('/tasks/{task_id}/attachments', response_model=List[TaskAttachment])
def get_task_attachments(
    task_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all attachments for a task"""
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    
    attachments = db.query(TaskAttachmentModel).filter(
        TaskAttachmentModel.task_id == task.task_id
    ).order_by(TaskAttachmentModel.created_at.desc()).all()
    
    return [TaskAttachment.model_validate(att) for att in attachments]

@api_router.post('/tasks/{task_id}/attachments')
def add_task_attachment(
    task_id: str,
    file: UploadFile = File(...),
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload an attachment to a task"""
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    
    try:
        # Read file content
        file_content = file.file.read()
        filename = file.filename or 'attachment'
        
        # Upload to S3 (required, no local fallback)
        attachment_url = upload_to_s3(file_content, filename, folder='task_attachments')
        
        if not attachment_url:
            raise HTTPException(
                status_code=503,
                detail='File upload service is temporarily unavailable. Please try again in a few moments.'
            )
        
        # Determine file type
        file_ext = filename.split('.')[-1].lower() if '.' in filename else 'unknown'
        
        new_attachment = TaskAttachmentModel(
            task_id=task.task_id,
            uploaded_by_employee_id=current_user.employee_id,
            uploaded_by_name=current_user.name,
            file_name=filename,
            file_url=attachment_url,
            file_size=len(file_content),
            file_type=file_ext
        )
        
        db.add(new_attachment)
        db.commit()
        db.refresh(new_attachment)
        
        return TaskAttachment.model_validate(new_attachment)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.delete('/tasks/{task_id}/attachments/{attachment_id}')
def delete_task_attachment(
    task_id: str,
    attachment_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an attachment from a task"""
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    
    attachment = db.query(TaskAttachmentModel).filter(
        TaskAttachmentModel.id == attachment_id,
        TaskAttachmentModel.task_id == task.task_id
    ).first()
    if not attachment:
        raise HTTPException(status_code=404, detail='Attachment not found')
    
    db.delete(attachment)
    db.commit()
    
    return {'message': 'Attachment deleted successfully'}

# ============= ATTENDANCE ROUTES =============


def finalize_stale_attendance_without_punch_out(db: Session) -> None:
    """Past calendar days with punch in but no punch out → Incomplete. Records with no punch_in → Absent."""
    today_str = attendance_local_date_str()
    stale = db.query(AttendanceModel).filter(
        AttendanceModel.date < today_str,
        AttendanceModel.punch_out.is_(None),
    ).all()
    changed = False
    for rec in stale:
        if rec.status == 'Leave':
            continue
        # If they have a punch_in but no punch_out, they started work but didn't finish → Incomplete
        # If they have NO punch_in, they didn't work at all → Absent
        if rec.punch_in is not None:
            # Has punch_in but no punch_out: keep as Incomplete (don't mark as Absent)
            if rec.status != 'Incomplete':
                rec.status = 'Incomplete'
                rec.is_active_session = 0
                changed = True
        else:
            # No punch_in and no punch_out: truly absent
            rec.status = 'Absent'
            rec.is_active_session = 0
            changed = True
    if changed:
        db.commit()


@api_router.post('/attendance/punch')
def punch_attendance(punch_data: AttendancePunch, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    finalize_stale_attendance_without_punch_out(db)
    today = attendance_local_date_str()
    
    employee = db.query(EmployeeModel).filter(EmployeeModel.employee_id == punch_data.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail='Employee not found')
    
    existing = db.query(AttendanceModel).filter(
        AttendanceModel.employee_id == punch_data.employee_id,
        AttendanceModel.date == today
    ).first()
    
    current_time = attendance_local_now().strftime('%H:%M:%S')
    office = get_office_location(db)
    # Roles that can manage attendance from the grid (Admin, HR, Accountant)
    # should not be forced to send location for punch in/out.
    is_admin_hr_or_accountant = current_user.role in ['Admin', 'HR', 'Accountant']
    # Employees must send location when office is configured
    if office is not None and not is_admin_hr_or_accountant:
        if punch_data.latitude is None or punch_data.longitude is None:
            raise HTTPException(
                status_code=400,
                detail='Location is required. Please enable location access to punch in/out.'
            )
    # Determine if this punch is at office or tour (only when location is provided and office is set)
    at_office = True
    if office is not None and punch_data.latitude is not None and punch_data.longitude is not None:
        at_office = is_within_office(db, punch_data.latitude, punch_data.longitude)
    
    if punch_data.action == 'punch_in':
        if existing:
            # If they already have an active session, don't allow another punch in
            if existing.is_active_session == 1:
                raise HTTPException(status_code=400, detail='Already punched in today')
            # New session after a previous punch-out: update session start time and late rules
            hour, minute = int(current_time.split(':')[0]), int(current_time.split(':')[1])
            is_late = hour > 10 or (hour == 10 and minute > 30)
            minutes_late = 0
            if is_late:
                late_threshold = datetime.strptime('10:30:00', '%H:%M:%S')
                punch_time = datetime.strptime(current_time, '%H:%M:%S')
                minutes_late = int((punch_time - late_threshold).total_seconds() / 60)
            existing.punch_in = current_time
            existing.punch_in_lat = punch_data.latitude
            existing.punch_in_lng = punch_data.longitude
            existing.is_tour = 1 if not at_office else 0
            existing.tour_approval_status = 'pending' if not at_office else None
            existing.is_active_session = 1
            existing.status = 'Late' if is_late else 'Incomplete'
            db.commit()
            db.refresh(existing)
            if is_late:
                pending_in = db.query(LatePunchInRequestModel).filter(
                    LatePunchInRequestModel.attendance_id == existing.id,
                    LatePunchInRequestModel.status == 'Pending',
                ).first()
                if not pending_in:
                    late_request = LatePunchInRequestModel(
                        attendance_id=existing.id,
                        employee_id=punch_data.employee_id,
                        employee_name=employee.name,
                        punch_in_time=current_time,
                        minutes_late=minutes_late,
                        punch_in_date=today,
                        status='Pending'
                    )
                    db.add(late_request)
                    db.commit()
            return {
                'message': 'Punched in again successfully (new session)' if at_office else 'Recorded as Tour (official travel). Pending approval from Admin/Manager.',
                'attendance': existing,
                'is_tour': not at_office,
                'is_new_session': True,
                'is_late': is_late,
                'minutes_late': minutes_late if is_late else None,
            }
        
        # First punch in of the day
        hour, minute = int(current_time.split(':')[0]), int(current_time.split(':')[1])
        is_late = hour > 10 or (hour == 10 and minute > 30)
        
        # Calculate minutes late if applicable
        minutes_late = 0
        if is_late:
            late_threshold = datetime.strptime('10:30:00', '%H:%M:%S')
            punch_time = datetime.strptime(current_time, '%H:%M:%S')
            minutes_late = int((punch_time - late_threshold).total_seconds() / 60)
        
        # On-time punch-in: day not complete until punch-out (before 7 PM) and approvals
        status = 'Late' if is_late else 'Incomplete'
        
        new_attendance = AttendanceModel(
            employee_id=punch_data.employee_id,
            employee_name=employee.name,
            date=today,
            punch_in=current_time,
            status=status,
            punch_in_lat=punch_data.latitude,
            punch_in_lng=punch_data.longitude,
            is_tour=1 if not at_office else 0,
            tour_approval_status='pending' if not at_office else None,
            is_active_session=1,
        )
        db.add(new_attendance)
        db.commit()
        db.refresh(new_attendance)
        
        # If late punch-in, create approval request
        if is_late:
            late_request = LatePunchInRequestModel(
                attendance_id=new_attendance.id,
                employee_id=punch_data.employee_id,
                employee_name=employee.name,
                punch_in_time=current_time,
                minutes_late=minutes_late,
                punch_in_date=today,
                status='Pending'
            )
            db.add(late_request)
            db.commit()
        
        return {
            'message': 'Punched in successfully. Waiting for admin approval due to late punch-in.' if is_late else 'Punched in successfully' if at_office else 'Recorded as Tour (official travel). Pending approval from Admin/Manager.',
            'attendance': new_attendance,
            'is_tour': not at_office,
            'is_new_session': False,
            'is_late': is_late,
            'minutes_late': minutes_late if is_late else None,
        }
    
    else:  # punch_out
        if not existing:
            raise HTTPException(status_code=400, detail='No punch in record found')
        if existing.is_active_session == 0:
            raise HTTPException(status_code=400, detail='Not currently punched in')
        
        # Check if work log has been submitted for today (for employees only, not admin)
        if current_user.role == 'Employee':
            work_log_exists = db.query(DailyWorkLogModel).filter(
                DailyWorkLogModel.employee_id == current_user.employee_id,
                DailyWorkLogModel.log_date == today
            ).first()
            if not work_log_exists:
                raise HTTPException(
                    status_code=400, 
                    detail='Work log submission is mandatory before punch out. Please submit your work summary first.'
                )
        
        # Check if punch-out is after 7 PM (19:00)
        hour, minute = int(current_time.split(':')[0]), int(current_time.split(':')[1])
        is_late_punch_out = hour > 19 or (hour == 19 and minute > 0)
        minutes_late_out = 0
        if is_late_punch_out:
            late_threshold = datetime.strptime('19:00:00', '%H:%M:%S')
            punch_out_time_parsed = datetime.strptime(current_time, '%H:%M:%S')
            minutes_late_out = int((punch_out_time_parsed - late_threshold).total_seconds() / 60)
        
        # Find the session number for this session
        last_session = db.query(AttendanceSessionModel).filter(
            AttendanceSessionModel.attendance_id == existing.id
        ).order_by(AttendanceSessionModel.session_number.desc()).first()
        
        session_number = (last_session.session_number + 1) if last_session else 1
        
        # Calculate this session's work hours
        punch_in_time = datetime.strptime(existing.punch_in, '%H:%M:%S')
        punch_out_time = datetime.strptime(current_time, '%H:%M:%S')
        work_hours = (punch_out_time - punch_in_time).total_seconds() / 3600
        
        # Create session record
        new_session = AttendanceSessionModel(
            attendance_id=existing.id,
            session_number=session_number,
            punch_in=existing.punch_in,
            punch_out=current_time,
            work_hours=round(work_hours, 2),
            punch_in_lat=existing.punch_in_lat,
            punch_in_lng=existing.punch_in_lng,
            punch_out_lat=punch_data.latitude,
            punch_out_lng=punch_data.longitude,
            is_tour=existing.is_tour,
            tour_approval_status=existing.tour_approval_status,
        )
        db.add(new_session)
        
        # Update attendance record - set status based on late punch-out
        existing.punch_out = current_time
        existing.work_hours = round(work_hours, 2)
        existing.punch_out_lat = punch_data.latitude
        existing.punch_out_lng = punch_data.longitude
        existing.is_active_session = 0  # Mark as not active
        
        # Late punch-out → admin approval required (any prior day status except already-absent)
        if is_late_punch_out:
            existing.status = 'Pending Approval'
        else:
            # Punch-out on time: mark present only when the day was completed within rules
            if existing.status == 'Incomplete':
                existing.status = 'Present'
            # If status was Late (late punch-in pending), keep Late until admin approves punch-in
            elif existing.status == 'Present':
                existing.status = 'Present'
        
        # Calculate total work hours from all sessions
        all_sessions = db.query(AttendanceSessionModel).filter(
            AttendanceSessionModel.attendance_id == existing.id
        ).all()
        total_hours = sum(s.work_hours for s in all_sessions) + round(work_hours, 2)
        existing.total_work_hours = round(total_hours, 2)
        
        # If punch out is outside office, ensure record is marked as tour if not already
        if not at_office and existing.is_tour != 1:
            existing.is_tour = 1
            existing.tour_approval_status = 'pending'
        
        db.commit()
        db.refresh(existing)
        
        # If late punch-out, create approval request
        if is_late_punch_out:
            late_out_request = LatePunchOutRequestModel(
                attendance_id=existing.id,
                employee_id=punch_data.employee_id,
                employee_name=employee.name,
                punch_out_time=current_time,
                minutes_late=minutes_late_out,
                punch_out_date=today,
                status='Pending'
            )
            db.add(late_out_request)
            db.commit()
        
        return {
            'message': 'Punched out successfully. Waiting for admin approval due to late punch-out.' if is_late_punch_out else 'Punched out successfully' if at_office else 'Punch out recorded as Tour. Pending approval from Admin/Manager.',
            'attendance': existing,
            'is_tour': not at_office,
            'session_number': session_number,
            'session_work_hours': round(work_hours, 2),
            'total_work_hours': existing.total_work_hours,
            'can_punch_in_again': True,
            'is_late_punch_out': is_late_punch_out,
            'minutes_late_out': minutes_late_out if is_late_punch_out else None,
        }



@api_router.get('/attendance/today')
def get_today_attendance(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get today's attendance with all sessions for current user."""
    finalize_stale_attendance_without_punch_out(db)
    today = attendance_local_date_str()
    existing = db.query(AttendanceModel).filter(
        AttendanceModel.employee_id == current_user.employee_id,
        AttendanceModel.date == today
    ).first()
    
    if not existing:
        return {
            'attendance': None,
            'sessions': [],
            'total_work_hours': 0.0,
            'is_punched_in': False,
        }
    
    # Get all sessions
    sessions = db.query(AttendanceSessionModel).filter(
        AttendanceSessionModel.attendance_id == existing.id
    ).order_by(AttendanceSessionModel.session_number).all()
    
    session_list = [
        {
            'id': s.id,
            'session_number': s.session_number,
            'punch_in': s.punch_in,
            'punch_out': s.punch_out,
            'work_hours': s.work_hours,
            'punch_in_lat': s.punch_in_lat,
            'punch_in_lng': s.punch_in_lng,
            'punch_out_lat': s.punch_out_lat,
            'punch_out_lng': s.punch_out_lng,
            'is_tour': s.is_tour,
        }
        for s in sessions
    ]
    
    return {
        'attendance': {
            'id': existing.id,
            'employee_id': existing.employee_id,
            'employee_name': existing.employee_name,
            'date': existing.date,
            'punch_in': existing.punch_in,
            'punch_out': existing.punch_out,
            'work_hours': existing.work_hours,
            'total_work_hours': existing.total_work_hours,
            'status': existing.status,
            'is_active_session': existing.is_active_session,
        },
        'sessions': session_list,
        'total_work_hours': existing.total_work_hours,
        'is_punched_in': existing.is_active_session == 1,
    }

@api_router.get('/settings/office-location')
def get_office_location_api(current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return office lat/lng if set. Admin, HR, Manager only (so employees cannot see exact coordinates)."""
    if current_user.role not in ['Admin', 'HR', 'Manager']:
        raise HTTPException(status_code=403, detail='Not allowed')
    loc = get_office_location(db)
    if loc is None:
        return {'latitude': None, 'longitude': None, 'configured': False}
    return {'latitude': loc[0], 'longitude': loc[1], 'configured': True}


class OfficeLocationUpdate(BaseModel):
    latitude: float
    longitude: float


@api_router.put('/settings/office-location')
def set_office_location_api(
    body: OfficeLocationUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Set office location (e.g. from Admin's current location). Admin only."""
    try:
        if current_user.role != 'Admin':
            raise HTTPException(status_code=403, detail='Only Admin can set office location')
        
        # Update or create latitude setting
        lat_row = db.query(SettingsModel).filter(SettingsModel.config_key == 'office_lat').first()
        if lat_row:
            lat_row.value = str(body.latitude)
        else:
            lat_row = SettingsModel(config_key='office_lat', value=str(body.latitude))
            db.add(lat_row)
        
        # Update or create longitude setting
        lng_row = db.query(SettingsModel).filter(SettingsModel.config_key == 'office_lng').first()
        if lng_row:
            lng_row.value = str(body.longitude)
        else:
            lng_row = SettingsModel(config_key='office_lng', value=str(body.longitude))
            db.add(lng_row)
        
        db.commit()
        return {'message': 'Office location updated', 'latitude': body.latitude, 'longitude': body.longitude}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f'Error setting office location: {str(e)}')


@api_router.get('/attendance/tour-pending')
def get_tour_pending(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List attendance records marked as tour that are pending approval. Admin and Manager only."""
    if current_user.role not in ['Admin', 'Manager']:
        raise HTTPException(status_code=403, detail='Only Admin and Manager can view tour requests')
    records = db.query(AttendanceModel).filter(
        AttendanceModel.is_tour == 1,
        AttendanceModel.tour_approval_status == 'pending',
    ).order_by(AttendanceModel.date.desc(), AttendanceModel.punch_in.desc()).all()
    return [
        {
            'id': r.id,
            'employee_id': r.employee_id,
            'employee_name': r.employee_name,
            'date': r.date,
            'punch_in': r.punch_in,
            'punch_out': r.punch_out,
            'work_hours': r.work_hours,
            'status': r.status,
            'punch_in_lat': getattr(r, 'punch_in_lat', None),
            'punch_in_lng': getattr(r, 'punch_in_lng', None),
        }
        for r in records
    ]


class TourApproveAction(BaseModel):
    attendance_id: str
    status: Literal['approved', 'rejected']


class LatePunchInApproveAction(BaseModel):
    request_id: str
    status: Literal['Approved', 'Rejected']
    reason: Optional[str] = None


class RegularizeAttendanceRequest(BaseModel):
    employee_id: str
    date: str


@api_router.post('/attendance/tour-approve')
def approve_tour(
    body: TourApproveAction,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Approve or reject a tour punch. Admin and Manager only."""
    if current_user.role not in ['Admin', 'Manager']:
        raise HTTPException(status_code=403, detail='Only Admin and Manager can approve tour requests')
    rec = db.query(AttendanceModel).filter(
        AttendanceModel.id == body.attendance_id,
        AttendanceModel.is_tour == 1,
        AttendanceModel.tour_approval_status == 'pending',
    ).first()
    if not rec:
        raise HTTPException(status_code=404, detail='Tour request not found or already processed')
    rec.tour_approval_status = body.status
    db.commit()
    return {'message': f'Tour {body.status}', 'attendance_id': rec.id}


@api_router.get('/attendance/employee-locations')
def get_employee_locations(
    employee_id: str,
    date: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get employee's location history (punch-in/out locations) from attendance records. Admin/Manager only."""
    if current_user.role not in ['Admin', 'Manager']:
        raise HTTPException(status_code=403, detail='Only Admin and Manager can view employee locations')
    
    # Fetch all attendance records for the employee with location data
    query = db.query(AttendanceModel).filter(AttendanceModel.employee_id == employee_id)
    
    if date:
        query = query.filter(AttendanceModel.date == date)
    else:
        # Default to today if no date specified
        from datetime import date as date_type
        today = date_type.today().strftime('%Y-%m-%d')
        query = query.filter(AttendanceModel.date == today)
    
    records = query.order_by(AttendanceModel.created_at.desc()).all()
    
    locations = []
    for record in records:
        # Collect all location points for this record
        if record.punch_in_lat and record.punch_in_lng:
            locations.append({
                'id': f"{record.id}_punch_in",
                'type': 'punch_in',
                'latitude': record.punch_in_lat,
                'longitude': record.punch_in_lng,
                'time': record.punch_in,
                'timestamp': record.created_at.isoformat() if record.created_at else None,
                'date': record.date
            })
        
        if record.punch_out_lat and record.punch_out_lng:
            locations.append({
                'id': f"{record.id}_punch_out",
                'type': 'punch_out',
                'latitude': record.punch_out_lat,
                'longitude': record.punch_out_lng,
                'time': record.punch_out,
                'timestamp': record.updated_at.isoformat() if record.updated_at else None,
                'date': record.date
            })
    
    return {
        'employee_id': employee_id,
        'date': date or today,
        'locations': locations,
        'total_locations': len(locations)
    }


@api_router.get('/attendance/late-punch-in-requests')
def get_late_punch_in_requests(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
    status: str = 'Pending'
):
    """Get pending late punch-in requests. Admin only."""
    if current_user.role != 'Admin':
        raise HTTPException(status_code=403, detail='Only Admin can view late punch-in requests')
    
    requests = db.query(LatePunchInRequestModel).filter(
        LatePunchInRequestModel.status == status
    ).order_by(LatePunchInRequestModel.requested_at.desc()).all()
    
    return [LatePunchInRequest.model_validate(r) for r in requests]


@api_router.post('/attendance/late-punch-in-approve')
def approve_late_punch_in(
    body: LatePunchInApproveAction,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Approve or reject a late punch-in request. Admin only."""
    if current_user.role != 'Admin':
        raise HTTPException(status_code=403, detail='Only Admin can approve late punch-in requests')
    
    request_id = body.request_id
    status = body.status  # 'Approved' or 'Rejected'
    reason = body.reason or ''
    
    late_request = db.query(LatePunchInRequestModel).filter(
        LatePunchInRequestModel.id == request_id
    ).first()
    
    if not late_request:
        raise HTTPException(status_code=404, detail='Late punch-in request not found')
    
    if late_request.status != 'Pending':
        raise HTTPException(status_code=400, detail='Request already processed')
    
    # Update the request
    late_request.status = status
    late_request.approver_id = current_user.id
    late_request.approver_name = current_user.name
    late_request.approval_reason = reason
    late_request.approved_at = datetime.now(timezone.utc)
    
    # Update the attendance record
    attendance = db.query(AttendanceModel).filter(
        AttendanceModel.id == late_request.attendance_id
    ).first()
    
    if not attendance:
        raise HTTPException(status_code=404, detail='Attendance record not found')
    
    if status == 'Approved':
        attendance.status = 'Present'
        message = 'Late punch-in approved. Employee marked as Present.'
    else:
        attendance.status = 'Absent'
        message = 'Late punch-in rejected. Employee marked as Absent.'
    
    db.commit()
    
    return {
        'message': message,
        'request_id': request_id,
        'attendance_id': attendance.id,
        'new_status': attendance.status
    }


@api_router.get('/attendance/late-punch-out-requests')
def get_late_punch_out_requests(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
    status: str = 'Pending'
):
    """Get late punch-out requests. Admin only."""
    if current_user.role != 'Admin':
        raise HTTPException(status_code=403, detail='Only Admin can view late punch-out requests')
    
    requests = db.query(LatePunchOutRequestModel).filter(
        LatePunchOutRequestModel.status == status
    ).order_by(LatePunchOutRequestModel.requested_at.desc()).all()
    
    return [LatePunchOutRequest.model_validate(r) for r in requests]


@api_router.post('/attendance/late-punch-out-approve')
def approve_late_punch_out(
    body: LatePunchInApproveAction,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Approve or reject a late punch-out request. Admin only."""
    if current_user.role != 'Admin':
        raise HTTPException(status_code=403, detail='Only Admin can approve late punch-out requests')
    
    request_id = body.request_id
    status = body.status  # 'Approved' or 'Rejected'
    reason = body.reason or ''
    
    late_request = db.query(LatePunchOutRequestModel).filter(
        LatePunchOutRequestModel.id == request_id
    ).first()
    
    if not late_request:
        raise HTTPException(status_code=404, detail='Late punch-out request not found')
    
    if late_request.status != 'Pending':
        raise HTTPException(status_code=400, detail='Request already processed')
    
    # Update the request
    late_request.status = status
    late_request.approver_id = current_user.id
    late_request.approver_name = current_user.name
    late_request.approval_reason = reason
    late_request.approved_at = datetime.now(timezone.utc)
    
    # Update the attendance record
    attendance = db.query(AttendanceModel).filter(
        AttendanceModel.id == late_request.attendance_id
    ).first()
    
    if not attendance:
        raise HTTPException(status_code=404, detail='Attendance record not found')
    
    if status == 'Approved':
        attendance.status = 'Present'
        message = 'Late punch-out approved. Employee marked as Present.'
    else:
        attendance.status = 'Absent'
        message = 'Late punch-out rejected. Employee marked as Absent.'
    
    db.commit()
    
    return {
        'message': message,
        'request_id': request_id,
        'attendance_id': attendance.id,
        'new_status': attendance.status
    }


@api_router.post('/attendance/regularize')
def regularize_attendance(
    body: RegularizeAttendanceRequest,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Regularize attendance for an employee on a specific date. Admin only."""
    if current_user.role != 'Admin':
        raise HTTPException(status_code=403, detail='Only Admin can regularize attendance')
    
    employee_id = body.employee_id
    date = body.date
    
    if not employee_id or not date:
        raise HTTPException(status_code=400, detail='Employee ID and date are required')
    
    employee = db.query(EmployeeModel).filter(EmployeeModel.employee_id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail='Employee not found')
    
    # Check if already exists
    existing = db.query(AttendanceModel).filter(
        AttendanceModel.employee_id == employee_id,
        AttendanceModel.date == date
    ).first()
    
    if existing:
        # Update existing record
        existing.punch_in = '10:00:00'
        existing.punch_out = '18:00:00'
        existing.status = 'Present'
        existing.work_hours = 8.0
        existing.is_active_session = 0
        existing.employee_name = employee.name
        db.commit()
        return {'message': 'Attendance regularized successfully', 'attendance_id': existing.id}
    else:
        # Create new record
        new_record = AttendanceModel(
            id=str(uuid.uuid4()),
            employee_id=employee_id,
            employee_name=employee.name,
            date=date,
            punch_in='10:00:00',
            punch_out='18:00:00',
            status='Present',
            work_hours=8.0,
            is_active_session=0,
            is_tour=0
        )
        db.add(new_record)
        db.commit()
        return {'message': 'Attendance regularized successfully', 'attendance_id': new_record.id}


@api_router.get('/attendance', response_model=List[Attendance])
def get_attendance(
    month: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    finalize_stale_attendance_without_punch_out(db)
    query = db.query(AttendanceModel)
    if month:
        query = query.filter(AttendanceModel.date.like(f'{month}%'))
    if start_date:
        query = query.filter(AttendanceModel.date >= start_date)
    if end_date:
        query = query.filter(AttendanceModel.date <= end_date)
    
    records = query.order_by(AttendanceModel.date.desc()).all()
    
    # Ensure all records have employee_name populated
    for record in records:
        if not record.employee_name:
            emp = db.query(EmployeeModel).filter(EmployeeModel.employee_id == record.employee_id).first()
            if emp:
                record.employee_name = emp.name
    
    # Get approved leaves and add them to records if not already present
    leave_query = db.query(LeaveModel).filter(LeaveModel.status == 'Approved')
    if month:
        # Filter leaves that overlap with the month
        year, month_num = [int(part) for part in month.split('-')]
        month_start = f'{year}-{month_num:02d}-01'
        month_end = f'{year}-{month_num:02d}-{monthrange(year, month_num)[1]:02d}'
        leave_query = leave_query.filter(
            LeaveModel.start_date <= month_end,
            LeaveModel.end_date >= month_start
        )
    
    if start_date:
        leave_query = leave_query.filter(LeaveModel.end_date >= start_date)
    if end_date:
        leave_query = leave_query.filter(LeaveModel.start_date <= end_date)
    
    approved_leaves = leave_query.all()
    
    # Create a set of (employee_id, date) tuples for existing records
    existing_records = set((r.employee_id, r.date) for r in records)
    
    # For each approved leave, add attendance records with status='Leave' for dates without records
    for leave in approved_leaves:
        current = datetime.strptime(leave.start_date, '%Y-%m-%d').date()
        end = datetime.strptime(leave.end_date, '%Y-%m-%d').date()
        
        while current <= end:
            date_str = current.isoformat()
            
            # Only add if this (employee_id, date) doesn't already have a record
            if (leave.employee_id, date_str) not in existing_records:
                # Create a virtual attendance record for the leave
                leave_record = AttendanceModel(
                    id=str(uuid.uuid4()),
                    employee_id=leave.employee_id,
                    employee_name=leave.employee_name,
                    date=date_str,
                    punch_in=None,
                    punch_out=None,
                    status='Leave',
                    work_hours=0.0,
                    total_work_hours=0.0,
                    is_tour=0,
                    is_active_session=0,
                    created_at=datetime.now(timezone.utc)
                )
                records.append(leave_record)
                existing_records.add((leave.employee_id, date_str))
            
            current += timedelta(days=1)
    
    return sorted(records, key=lambda x: x.date, reverse=True)

@api_router.get('/attendance/summary', response_model=List[AttendanceSummary])
def get_attendance_summary(month: str, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    finalize_stale_attendance_without_punch_out(db)
    year, month_num = [int(part) for part in month.split('-')]
    total_days = monthrange(year, month_num)[1]
    today = attendance_local_now().date()
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

    # Government holidays and Sundays in this month: exclude from absent count
    month_start = f'{year}-{month_num:02d}-01'
    month_end = f'{year}-{month_num:02d}-{total_days:02d}'
    holiday_dates = set(
        row.date for row in db.query(GovernmentHolidayModel).filter(
            GovernmentHolidayModel.date >= month_start,
            GovernmentHolidayModel.date <= month_end
        ).all()
    )
    # Count Sundays
    sundays = 0
    for day in range(1, total_days + 1):
        dt = datetime(year, month_num, day)
        if dt.weekday() == 6:
            sundays += 1
    holiday_count = len(holiday_dates)
    working_days = max(0, total_days - holiday_count - sundays)

    for record in records:
        data = summary_map.get(record.employee_id)
        if not data:
            continue
        # Tour punches count as present only when approved
        if getattr(record, 'is_tour', 0) == 1 and getattr(record, 'tour_approval_status', None) != 'approved':
            continue  # pending or rejected tour: do not count as present
        st = record.status
        # Only fully approved / completed days count as present
        if st == 'Present':
            data['present_days'] += 1
        elif st == 'Late':
            # Late punch-in pending admin approval — not counted as present until approved
            data['late_days'] += 1
        elif st == 'Half Day':
            data['present_days'] += 1
            data['half_day_days'] += 1
        # Incomplete, Pending Approval, Absent, Leave: do not increment present

    for data in summary_map.values():
        data['absent_days'] = max(working_days - data['present_days'], 0)

    return list(summary_map.values())

@api_router.get('/attendance/employee/{employee_id}', response_model=List[Attendance])
def get_employee_attendance(employee_id: str, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(AttendanceModel).filter(
        AttendanceModel.employee_id == employee_id
    ).order_by(AttendanceModel.date.desc()).all()


# Late login threshold: 10:30
ATTENDANCE_LATE_HOUR, ATTENDANCE_LATE_MINUTE = 10, 30


@api_router.get('/attendance/late-details')
def get_late_login_details(
    start_date: str,
    end_date: str,
    employee_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all late punch-ins in date range. Admin and HR only."""
    if current_user.role not in ['Admin', 'HR']:
        raise HTTPException(status_code=403, detail='Only Admin and HR can view late login details')
    query = db.query(AttendanceModel).filter(
        AttendanceModel.status == 'Late',
        AttendanceModel.date >= start_date,
        AttendanceModel.date <= end_date,
        AttendanceModel.punch_in.isnot(None)
    )
    if employee_id:
        query = query.filter(AttendanceModel.employee_id == employee_id)
    records = query.order_by(AttendanceModel.date.desc()).all()
    result = []
    for r in records:
        if not r.punch_in:
            continue
        parts = r.punch_in.split(':')
        h, m = int(parts[0]), int(parts[1]) if len(parts) > 1 else 0
        minutes_late = (h - ATTENDANCE_LATE_HOUR) * 60 + (m - ATTENDANCE_LATE_MINUTE)
        if minutes_late < 0:
            minutes_late = 0
        result.append({
            'id': r.id,
            'employee_id': r.employee_id,
            'employee_name': r.employee_name,
            'date': r.date,
            'punch_in': r.punch_in,
            'minutes_late': minutes_late,
        })
    return result


@api_router.get('/attendance/report')
def get_attendance_report(
    start_date: str,
    end_date: str,
    employee_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Full attendance report: each day in range × each employee. No punch = Absent, except on government holidays = Holiday. Admin/HR see all; Employee sees self."""
    from datetime import date as date_type
    start = date_type(*[int(x) for x in start_date.split('-')])
    end = date_type(*[int(x) for x in end_date.split('-')])
    if start > end:
        raise HTTPException(status_code=400, detail='start_date must be before or equal to end_date')
    employees = db.query(EmployeeModel).filter(EmployeeModel.status == 'Active')
    if current_user.role == 'Employee':
        if not current_user.employee_id:
            raise HTTPException(status_code=404, detail='Employee record not found')
        employees = employees.filter(EmployeeModel.employee_id == current_user.employee_id)
    elif employee_id:
        employees = employees.filter(EmployeeModel.employee_id == employee_id)
    employees = employees.all()
    records_by_key = {}
    for rec in db.query(AttendanceModel).filter(
        AttendanceModel.date >= start_date,
        AttendanceModel.date <= end_date
    ).all():
        key = (rec.date, rec.employee_id)
        records_by_key[key] = rec
    # Government holidays in range: no punch on these dates = Holiday, not Absent
    holiday_dates = set(
        row.date for row in db.query(GovernmentHolidayModel).filter(
            GovernmentHolidayModel.date >= start_date,
            GovernmentHolidayModel.date <= end_date
        ).all()
    )
    report = []
    d = start
    while d <= end:
        date_str = d.strftime('%Y-%m-%d')
        is_holiday = date_str in holiday_dates
        is_sunday = d.weekday() == 6
        for emp in employees:
            key = (date_str, emp.employee_id)
            rec = records_by_key.get(key)
            if rec:
                report.append({
                    'date': date_str,
                    'employee_id': emp.employee_id,
                    'employee_name': rec.employee_name or emp.name,
                    'punch_in': rec.punch_in,
                    'punch_out': rec.punch_out,
                    'work_hours': rec.work_hours,
                    'status': rec.status,
                    'is_tour': getattr(rec, 'is_tour', 0) == 1,
                    'tour_approval_status': getattr(rec, 'tour_approval_status', None),
                })
            else:
                report.append({
                    'date': date_str,
                    'employee_id': emp.employee_id,
                    'employee_name': emp.name,
                    'punch_in': None,
                    'punch_out': None,
                    'work_hours': 0,
                    'status': 'Holiday' if (is_holiday or is_sunday) else 'Absent',
                })
        d += timedelta(days=1)
    report.sort(key=lambda x: (x['date'], x['employee_id']), reverse=True)
    return report




# ============= LEAVE ROUTES =============

@api_router.post('/leaves')
def create_leave(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
    employee_id: str = Form(...),
    employee_name: str = Form(...),
    leave_type: str = Form(...),
    start_date: str = Form(...),
    end_date: str = Form(...),
    days: int = Form(...),
    reason: str = Form(...),
    file: Optional[UploadFile] = File(None),
):
    """Create a new leave request with optional file attachment."""
    try:
        attachment_path = None
        
        # Handle file upload if provided
        if file and file.filename:
            try:
                file_content = file.file.read()
                file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'bin'
                new_filename = f"leaves_{uuid.uuid4()}.{file_extension}"
                
                # Try to upload to S3
                attachment_path = upload_to_s3(file_content, new_filename, folder='leaves')
                
                # If S3 upload failed or not configured, save locally
                if not attachment_path:
                    upload_folder = UPLOAD_DIR / 'leaves'
                    upload_folder.mkdir(exist_ok=True)
                    file_path = upload_folder / new_filename
                    with open(file_path, 'wb') as f:
                        f.write(file_content)
                    attachment_path = f"/uploads/leaves/{new_filename}"
            except Exception as e:
                logging.error(f"File upload error: {str(e)}")
        
        # Convert days to integer if it's a string
        days_int = int(days) if isinstance(days, str) else days
        
        new_leave = LeaveModel(
            employee_id=employee_id,
            employee_name=employee_name,
            leave_type=leave_type,
            start_date=start_date,
            end_date=end_date,
            days=days_int,
            reason=reason,
            attachment_path=attachment_path
        )
        db.add(new_leave)
        db.commit()
        db.refresh(new_leave)
        
        return Leave.model_validate(new_leave)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logging.error(f"Error creating leave: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create leave request")

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


# --------------- Leave policy (admin) and balance ---------------
def _get_or_create_policy(db: Session):
    policy = db.query(LeavePolicyModel).first()
    if not policy:
        policy = LeavePolicyModel(paid_leaves_per_year=12)
        db.add(policy)
        db.commit()
        db.refresh(policy)
    return policy


@api_router.get('/leave-policy')
def get_leave_policy(current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    policy = _get_or_create_policy(db)
    return {"paid_leaves_per_year": policy.paid_leaves_per_year}


@api_router.put('/leave-policy')
def update_leave_policy(
    body: LeavePolicyUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != 'Admin':
        raise HTTPException(status_code=403, detail='Only Admin can update leave policy')
    if body.paid_leaves_per_year < 0:
        raise HTTPException(status_code=400, detail='paid_leaves_per_year must be non-negative')
    policy = _get_or_create_policy(db)
    policy.paid_leaves_per_year = body.paid_leaves_per_year
    db.commit()
    db.refresh(policy)
    return {"paid_leaves_per_year": policy.paid_leaves_per_year}


@api_router.get('/leave-balance')
def get_leave_balance(
    employee_id: Optional[str] = None,
    year: Optional[int] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from datetime import datetime as dt
    y = year or dt.now().year
    eid = employee_id or current_user.employee_id
    if not eid:
        return {"allowed": 0, "taken": 0, "pending": 0, "balance": 0}
    if eid != current_user.employee_id and current_user.role not in ('Admin', 'HR', 'Manager'):
        raise HTTPException(status_code=403, detail='Not authorized to view other employee balance')
    policy = _get_or_create_policy(db)
    allowed = policy.paid_leaves_per_year
    leaves = db.query(LeaveModel).filter(LeaveModel.employee_id == eid).all()
    def in_year(d):
        return d and (d.startswith(str(y)) if isinstance(d, str) else str(y) in str(d))
    taken = sum(l.days or 0 for l in leaves if l.status == 'Approved' and in_year(l.start_date))
    pending = sum(l.days or 0 for l in leaves if l.status == 'Pending' and in_year(l.start_date))
    balance = max(0, allowed - taken)
    return {"allowed": allowed, "taken": taken, "pending": pending, "balance": balance, "year": y}


# ============= GOVERNMENT HOLIDAYS =============
# All authenticated users can list; only Admin/HR can add or delete.

@api_router.get('/government-holidays', response_model=List[GovernmentHoliday])
def list_government_holidays(
    year: Optional[int] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all government holidays. Optional year filter (YYYY)."""
    query = db.query(GovernmentHolidayModel).order_by(GovernmentHolidayModel.date.asc())
    if year is not None:
        query = query.filter(GovernmentHolidayModel.date >= f'{year}-01-01', GovernmentHolidayModel.date <= f'{year}-12-31')
    return query.all()


@api_router.post('/government-holidays', response_model=GovernmentHoliday)
def create_government_holiday(
    body: GovernmentHolidayCreate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a government holiday. Admin and HR only."""
    if current_user.role not in ('Admin', 'HR'):
        raise HTTPException(status_code=403, detail='Only Admin and HR can add government holidays')
    # Validate date format YYYY-MM-DD
    if len(body.date) != 10 or body.date[4] != '-' or body.date[7] != '-':
        raise HTTPException(status_code=400, detail='Date must be YYYY-MM-DD')
    existing = db.query(GovernmentHolidayModel).filter(GovernmentHolidayModel.date == body.date).first()
    if existing:
        raise HTTPException(status_code=400, detail=f'A holiday already exists on {body.date}')
    row = GovernmentHolidayModel(date=body.date, name=body.name.strip(), description=(body.description or '').strip() or None)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@api_router.delete('/government-holidays/{holiday_id}')
def delete_government_holiday(
    holiday_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a government holiday. Admin and HR only."""
    if current_user.role not in ('Admin', 'HR'):
        raise HTTPException(status_code=403, detail='Only Admin and HR can delete government holidays')
    row = db.query(GovernmentHolidayModel).filter(GovernmentHolidayModel.id == holiday_id).first()
    if not row:
        raise HTTPException(status_code=404, detail='Holiday not found')
    db.delete(row)
    db.commit()
    return {'message': 'Holiday deleted'}


# ============= DOCUMENT ROUTES =============

@api_router.post('/documents/upload')
def upload_document(
    employee_id: str = Form(...),
    employee_name: str = Form(...),
    document_type: str = Form(...),
    file: UploadFile = File(...),
    expiry_date: Optional[str] = Form(None),
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    can_upload_any = current_user.role in ['Admin', 'HR', 'Manager']
    if not can_upload_any and str(employee_id).strip() != str(current_user.employee_id or '').strip():
        raise HTTPException(status_code=403, detail='You can only upload documents for yourself')
    
    # Read file content
    file_content = file.file.read()
    safe_name = file.filename or 'document'
    filename = f"{document_type}_{uuid.uuid4()}{Path(safe_name).suffix or '.pdf'}"
    
    # Upload to S3 (required, no local fallback)
    file_path = upload_to_s3(file_content, filename, folder='documents')
    
    if not file_path:
        raise HTTPException(
            status_code=503,
            detail='File upload service is temporarily unavailable. Please try again in a few moments.'
        )
    
    new_document = DocumentModel(
        employee_id=str(employee_id).strip(),
        employee_name=employee_name or '',
        document_type=document_type,
        file_name=safe_name,
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
    can_view_all = current_user.role in ['Admin', 'HR', 'Manager']
    if can_view_all:
        if employee_id:
            query = query.filter(DocumentModel.employee_id == employee_id)
    else:
        if not current_user.employee_id:
            return []
        query = query.filter(DocumentModel.employee_id == current_user.employee_id)
    return query.order_by(DocumentModel.uploaded_at.desc()).all()

@api_router.get('/documents/{document_id}/download')
def download_document(document_id: str, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    document = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail='Document not found')
    can_view_all = current_user.role in ['Admin', 'HR', 'Manager']
    if not can_view_all and str(document.employee_id) != str(current_user.employee_id or ''):
        raise HTTPException(status_code=403, detail='Not authorized to download this document')
    file_path = Path(document.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail='File not found')
    return FileResponse(file_path, filename=document.file_name)

@api_router.get('/files/stream')
def stream_file(file_url: str, current_user: UserModel = Depends(get_current_user)):
    """Stream file from S3 for preview (images, PDFs, etc.)"""
    from urllib.parse import urlparse
    from fastapi.responses import Response
    
    if not file_url:
        raise HTTPException(status_code=400, detail='file_url parameter is required')
    
    # Validate it's an S3 URL (security check)
    if S3_BUCKET_NAME not in file_url:
        raise HTTPException(status_code=400, detail='Invalid file URL - only S3 URLs are supported')
    
    try:
        # Parse the S3 URL properly
        # URL format: https://bucket-name.s3.region.amazonaws.com/key/path/file.ext
        parsed_url = urlparse(file_url)
        
        # Extract the path and remove leading slash
        s3_key = parsed_url.path.lstrip('/')
        
        if not s3_key:
            raise HTTPException(status_code=400, detail='Could not extract file key from URL')
        
        logging.info(f"Streaming S3 file: s3://{S3_BUCKET_NAME}/{s3_key}")
        
        # Check if S3 is configured
        if not s3_client or not USE_S3:
            raise HTTPException(status_code=503, detail='File service is unavailable')
        
        # Get object from S3
        response = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=s3_key)
        file_content = response['Body'].read()
        
        # Determine content type from file extension or S3 metadata
        content_type = response.get('ContentType', 'application/octet-stream')
        filename = s3_key.split('/')[-1]
        
        # Return with proper headers for inline display
        return Response(
            content=file_content,
            media_type=content_type,
            headers={
                "Content-Disposition": f"inline; filename=\"{filename}\"",
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*"
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error streaming file from S3: {str(e)}")
        raise HTTPException(status_code=500, detail=f'Error retrieving file: {str(e)}')

# ============= EXPENSE ROUTES =============

@api_router.post('/expenses', response_model=Expense)
def create_expense(expense_data: ExpenseCreate, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    # Receipt is now compulsory, so we'll validate it through frontend
    # and require it to be uploaded in the next step
    new_expense = ExpenseModel(
        employee_id=expense_data.employee_id,
        employee_name=expense_data.employee_name,
        amount=expense_data.amount,
        category=expense_data.category,
        description=expense_data.description
    )
    db.add(new_expense)
    db.commit()
    db.refresh(new_expense)
    return new_expense

@api_router.post('/expenses/{expense_id}/receipt')
def upload_expense_receipt(
    expense_id: str,
    file: UploadFile = File(...),
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expense = db.query(ExpenseModel).filter(ExpenseModel.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail='Expense not found')
    if expense.employee_id != current_user.employee_id and current_user.role not in ['Admin', 'HR', 'Accountant']:
        raise HTTPException(status_code=403, detail='Not authorized to upload receipt for this expense')
    
    # Read file content
    file_content = file.file.read()
    filename = f"receipt_{uuid.uuid4()}{Path(file.filename).suffix or '.jpg'}"
    
    # Upload to S3 (required, no local fallback)
    receipt_path = upload_to_s3(file_content, filename, folder='expenses')
    
    if not receipt_path:
        raise HTTPException(
            status_code=503,
            detail='File upload service is temporarily unavailable. Please try again in a few moments.'
        )
    
    expense.receipt_path = receipt_path
    db.commit()
    db.refresh(expense)
    return {'receipt_path': receipt_path, 'message': 'Receipt uploaded successfully'}

@api_router.post('/expenses/{expense_id}/attachment')
def upload_expense_attachment(
    expense_id: str,
    file: UploadFile = File(...),
    attachment_index: int = Form(...),  # 1 or 2 for optional attachments
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload optional attachments (1 or 2) to S3 for an expense"""
    if attachment_index not in [1, 2]:
        raise HTTPException(status_code=400, detail='attachment_index must be 1 or 2')
    
    expense = db.query(ExpenseModel).filter(ExpenseModel.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail='Expense not found')
    if expense.employee_id != current_user.employee_id and current_user.role not in ['Admin', 'HR', 'Accountant']:
        raise HTTPException(status_code=403, detail='Not authorized to upload attachment for this expense')
    
    # Read file content
    file_content = file.file.read()
    filename = f"attachment_{attachment_index}_{uuid.uuid4()}{Path(file.filename).suffix or '.jpg'}"
    
    # Upload to S3
    attachment_path = upload_to_s3(file_content, filename, folder='expenses')
    
    if not attachment_path:
        raise HTTPException(
            status_code=503,
            detail='File upload service is temporarily unavailable. Please try again in a few moments.'
        )
    
    # Update the appropriate attachment field
    if attachment_index == 1:
        expense.attachment_path_1 = attachment_path
    elif attachment_index == 2:
        expense.attachment_path_2 = attachment_path
    
    db.commit()
    db.refresh(expense)
    
    return {
        f'attachment_path_{attachment_index}': attachment_path,
        'message': f'Optional attachment {attachment_index} uploaded successfully'
    }

@api_router.get('/expenses', response_model=List[Expense])
def get_expenses(
    status: Optional[str] = None,
    employee_id: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(ExpenseModel)
    # Accountant can see all expenses (for approval)
    # Admin, HR, Manager can see all expenses
    # Employee can only see their own expenses
    if current_user.role not in ['Admin', 'HR', 'Manager', 'Accountant']:
        query = query.filter(ExpenseModel.employee_id == current_user.employee_id)
    elif employee_id:
        query = query.filter(ExpenseModel.employee_id == employee_id)
    if status:
        query = query.filter(ExpenseModel.status == status)
    return query.order_by(ExpenseModel.created_at.desc()).all()

@api_router.put('/expenses/{expense_id}/action', response_model=Expense)
def update_expense_status(
    expense_id: str,
    action: ExpenseAction,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expense = db.query(ExpenseModel).filter(ExpenseModel.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail='Expense not found')
    
    # Check if expense has receipt attached
    if not expense.receipt_path:
        raise HTTPException(status_code=400, detail='Expense cannot be approved without a receipt attachment')
    
    # Handle approval based on user role and current expense status
    if action.status == 'Rejected':
        # Any approver (Accountant or Admin) can reject at any time
        if current_user.role not in ['Admin', 'Accountant']:
            raise HTTPException(status_code=403, detail='Only Admin or Accountant can reject expenses')
        expense.status = 'Rejected'
        expense.approver_id = action.approver_id
        expense.approver_name = action.approver_name
        # Store rejection reason if provided
        if action.approval_reason:
            expense.accountant_approval_reason = action.approval_reason
    
    elif action.status == 'Partially-Approved':
        # Only Accountant can partially approve from Pending
        if current_user.role != 'Accountant':
            raise HTTPException(status_code=403, detail='Only Accountant can partially approve expenses')
        if expense.status != 'Pending':
            raise HTTPException(status_code=400, detail='Expense must be in Pending status for partial approval')
        
        # Validate approved amount
        if not action.approved_amount or action.approved_amount <= 0:
            raise HTTPException(status_code=400, detail='Approved amount must be greater than 0')
        if action.approved_amount > expense.amount:
            raise HTTPException(status_code=400, detail='Approved amount cannot exceed total expense amount')
        if not action.approval_reason or action.approval_reason.strip() == '':
            raise HTTPException(status_code=400, detail='Reason is required for partial approval')
        
        expense.status = 'Partially-Approved'
        expense.accountant_approver_id = action.approver_id
        expense.accountant_approver_name = action.approver_name
        expense.accountant_approved_at = datetime.now(timezone.utc)
        expense.accountant_approved_amount = action.approved_amount
        expense.accountant_approval_reason = action.approval_reason
    
    elif action.status == 'Accountant-Approved':
        # Only Accountant can approve to Accountant-Approved from Pending
        if current_user.role != 'Accountant':
            raise HTTPException(status_code=403, detail='Only Accountant can approve expenses at first level')
        if expense.status != 'Pending':
            raise HTTPException(status_code=400, detail='Expense must be in Pending status for accountant approval')
        expense.status = 'Accountant-Approved'
        expense.accountant_approver_id = action.approver_id
        expense.accountant_approver_name = action.approver_name
        expense.accountant_approved_at = datetime.now(timezone.utc)
        expense.accountant_approved_amount = None  # Fully approved, no partial amount
    
    elif action.status == 'Approved':
        # Only Admin can approve to Approved from Accountant-Approved or Partially-Approved
        if current_user.role != 'Admin':
            raise HTTPException(status_code=403, detail='Only Admin can approve expenses at second level')
        if expense.status not in ['Accountant-Approved', 'Partially-Approved']:
            raise HTTPException(status_code=400, detail='Expense must be in Accountant-Approved or Partially-Approved status for admin approval')
        expense.status = 'Approved'
        expense.admin_approver_id = action.approver_id
        expense.admin_approver_name = action.approver_name
        expense.admin_approved_at = datetime.now(timezone.utc)
    
    else:
        raise HTTPException(status_code=400, detail='Invalid approval status')
    
    db.commit()
    db.refresh(expense)
    return expense


@api_router.get('/expenses/summary-by-employee')
def get_expenses_summary_by_employee(
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Admin only: total approved/rejected/pending expenses per employee for salary compensation."""
    if current_user.role != 'Admin':
        raise HTTPException(status_code=403, detail='Only Admin can view expense summary')
    from datetime import datetime as dt
    now = dt.now()
    y = year if year is not None else now.year
    m = month if month is not None else now.month
    all_expenses = db.query(ExpenseModel).all()
    # Filter by created_at year/month
    def in_month(exp):
        if not getattr(exp, 'created_at', None):
            return True
        d = exp.created_at
        return d.year == y and d.month == m
    by_employee = {}
    for exp in all_expenses:
        if not in_month(exp):
            continue
        eid = exp.employee_id or 'unknown'
        name = exp.employee_name or 'Unknown'
        if eid not in by_employee:
            by_employee[eid] = {'employee_id': eid, 'employee_name': name, 'total_approved': 0.0, 'total_rejected': 0.0, 'total_pending': 0.0}
        amt = float(exp.amount or 0)
        
        if exp.status == 'Approved':
            # Fully approved amount
            by_employee[eid]['total_approved'] += amt
        elif exp.status == 'Partially-Approved':
            # Approved amount goes to approved
            partial_amt = float(exp.accountant_approved_amount or 0)
            by_employee[eid]['total_approved'] += partial_amt
            # Unapproved amount is counted as rejected
            by_employee[eid]['total_rejected'] += (amt - partial_amt)
        elif exp.status == 'Rejected':
            by_employee[eid]['total_rejected'] += amt
        else:
            # Pending and Accountant-Approved both count as pending
            by_employee[eid]['total_pending'] += amt
    result = list(by_employee.values())
    result.sort(key=lambda x: (x['employee_name'].lower(), x['employee_id']))
    return {'month': m, 'year': y, 'employees': result}


# ============= USERS / ROLES ROUTES =============

@api_router.get('/users', response_model=List[UserDetails])
def get_users(current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != 'Admin':
        raise HTTPException(status_code=403, detail='Only Admin can access user/role management')
    users = db.query(UserModel).all()
    result = []
    for u in users:
        data = {
            'id': u.id,
            'email': u.email,
            'name': u.name,
            'role': u.role,
            'employee_id': u.employee_id,
            'created_at': u.created_at,
            'phone': None,
            'department': None,
            'job_role': None,
            'joining_date': None,
            'salary': None,
            'status': None,
            'profile_photo': None,
            'address': None,
            'emergency_contact': None
        }
        if u.employee_id:
            emp = db.query(EmployeeModel).filter(EmployeeModel.employee_id == u.employee_id).first()
            if emp:
                data.update({
                    'phone': emp.phone,
                    'department': emp.department,
                    'job_role': emp.job_role,
                    'joining_date': emp.joining_date,
                    'salary': emp.salary,
                    'status': emp.status,
                    'profile_photo': emp.profile_photo,
                    'address': emp.address,
                    'emergency_contact': emp.emergency_contact
                })
        result.append(data)
    return result

@api_router.put('/users/{user_id}/role', response_model=UserDetails)
def update_user_role(
    user_id: str,
    payload: UserRoleUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != 'Admin':
        raise HTTPException(status_code=403, detail='Only Admin can change user roles')
    role_row = db.query(RoleModel).filter(RoleModel.name == payload.role.strip()).first()
    if not role_row:
        raise HTTPException(status_code=400, detail='Invalid role name')
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    user.role = payload.role.strip()
    db.commit()
    db.refresh(user)
    user_data = {
        'id': user.id,
        'email': user.email,
        'name': user.name,
        'role': user.role,
        'employee_id': user.employee_id,
        'created_at': user.created_at,
        'phone': None,
        'department': None,
        'job_role': None,
        'joining_date': None,
        'salary': None,
        'status': None,
        'profile_photo': None,
        'address': None,
        'emergency_contact': None
    }
    if user.employee_id:
        emp = db.query(EmployeeModel).filter(EmployeeModel.employee_id == user.employee_id).first()
        if emp:
            user_data.update({
                'phone': emp.phone,
                'department': emp.department,
                'job_role': emp.job_role,
                'joining_date': emp.joining_date,
                'salary': emp.salary,
                'status': emp.status,
                'profile_photo': emp.profile_photo,
                'address': emp.address,
                'emergency_contact': emp.emergency_contact
            })
    return user_data


@api_router.post('/users/{user_id}/reset-password')
def admin_reset_user_password(
    user_id: str,
    payload: AdminPasswordResetRequest,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Admin-only: set a new password for any user (no verification flow)."""
    if current_user.role != 'Admin':
        raise HTTPException(status_code=403, detail='Only Admin can reset user passwords')

    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    new_password = (payload.new_password or '').strip()
    if not new_password:
        raise HTTPException(status_code=400, detail='new_password is required')

    user.password = hash_password(new_password)
    db.commit()
    return {'message': 'Password reset successfully'}


# --------------- Role CRUD (create/edit/delete roles; Admin role protected) ---------------
def get_permissions_for_role(db: Session, role_name: str) -> List[str]:
    """Get list of permissions for a given role from the database"""
    r = db.query(RoleModel).filter(RoleModel.name == role_name).first()
    if not r:
        return []
    perms = []
    if r.permissions:
        try:
            perms = json.loads(r.permissions)
        except Exception:
            perms = []
    return perms


def _role_to_dict(r: RoleModel):
    perms = []
    if r.permissions:
        try:
            perms = json.loads(r.permissions)
        except Exception:
            perms = []
    return {
        "id": r.id,
        "name": r.name,
        "permissions": perms,
        "is_system": bool(r.is_system),
    }


@api_router.get('/roles')
def list_roles(current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != 'Admin':
        raise HTTPException(status_code=403, detail='Only Admin can manage roles')
    roles = db.query(RoleModel).order_by(RoleModel.name).all()
    return [_role_to_dict(r) for r in roles]


@api_router.get('/roles/permission-keys')
def get_permission_keys(current_user: UserModel = Depends(get_current_user)):
    if current_user.role != 'Admin':
        raise HTTPException(status_code=403, detail='Only Admin can access')
    return {"permission_keys": DEFAULT_PERMISSION_KEYS}


@api_router.post('/roles')
def create_role(
    payload: RoleCreate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != 'Admin':
        raise HTTPException(status_code=403, detail='Only Admin can create roles')
    existing = db.query(RoleModel).filter(RoleModel.name == payload.name.strip()).first()
    if existing:
        raise HTTPException(status_code=400, detail='Role name already exists')
    valid = set(DEFAULT_PERMISSION_KEYS)
    perms = [p for p in payload.permissions if p in valid]
    role = RoleModel(
        name=payload.name.strip(),
        permissions=json.dumps(perms),
        is_system=0
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return _role_to_dict(role)


@api_router.put('/roles/{role_id}')
def update_role(
    role_id: str,
    payload: RoleUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != 'Admin':
        raise HTTPException(status_code=403, detail='Only Admin can update roles')
    role = db.query(RoleModel).filter(RoleModel.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail='Role not found')
    if role.is_system or role.name == 'Admin':
        raise HTTPException(status_code=400, detail='Admin role cannot be edited')
    if payload.name is not None:
        name = payload.name.strip()
        if name != role.name:
            other = db.query(RoleModel).filter(RoleModel.name == name).first()
            if other:
                raise HTTPException(status_code=400, detail='Role name already exists')
            role.name = name
    if payload.permissions is not None:
        valid = set(DEFAULT_PERMISSION_KEYS)
        role.permissions = json.dumps([p for p in payload.permissions if p in valid])
    db.commit()
    db.refresh(role)
    return _role_to_dict(role)


@api_router.delete('/roles/{role_id}')
def delete_role(
    role_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != 'Admin':
        raise HTTPException(status_code=403, detail='Only Admin can delete roles')
    role = db.query(RoleModel).filter(RoleModel.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail='Role not found')
    if role.is_system or role.name == 'Admin':
        raise HTTPException(status_code=400, detail='Admin role cannot be deleted')
    count = db.query(UserModel).filter(UserModel.role == role.name).count()
    if count > 0:
        raise HTTPException(status_code=400, detail=f'Cannot delete: {count} user(s) have this role. Reassign them first.')
    db.delete(role)
    db.commit()
    return {"message": "Role deleted"}


# ============= DAILY WORK LOG ROUTES =============

@api_router.post('/daily-work-logs', response_model=DailyWorkLog)
def create_daily_work_log(
    data: DailyWorkLogCreate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if data.employee_id != current_user.employee_id and current_user.role not in ['Admin', 'HR', 'Manager']:
        raise HTTPException(status_code=403, detail='Not authorized to submit work log for another employee')
    existing = db.query(DailyWorkLogModel).filter(
        DailyWorkLogModel.employee_id == data.employee_id,
        DailyWorkLogModel.log_date == data.log_date
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail='Work log already submitted for this date')
    new_log = DailyWorkLogModel(
        employee_id=data.employee_id,
        employee_name=data.employee_name,
        log_date=data.log_date,
        summary=data.summary
    )
    db.add(new_log)
    db.commit()
    db.refresh(new_log)
    return new_log

@api_router.get('/daily-work-logs', response_model=List[DailyWorkLog])
def get_daily_work_logs(
    employee_id: Optional[str] = None,
    month: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(DailyWorkLogModel)
    if current_user.role not in ['Admin', 'HR', 'Manager']:
        query = query.filter(DailyWorkLogModel.employee_id == current_user.employee_id)
    elif employee_id:
        query = query.filter(DailyWorkLogModel.employee_id == employee_id)
    if month:
        query = query.filter(DailyWorkLogModel.log_date.like(f'{month}%'))
    return query.order_by(DailyWorkLogModel.log_date.desc()).all()

@api_router.get('/daily-work-logs/check-today')
def check_today_work_log(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check if user has submitted work log for today"""
    today = datetime.now().strftime('%Y-%m-%d')
    existing = db.query(DailyWorkLogModel).filter(
        DailyWorkLogModel.employee_id == current_user.employee_id,
        DailyWorkLogModel.log_date == today
    ).first()
    return {'has_logged_today': existing is not None, 'today': today}

# ============= LEADS ROUTES (Admin, Manager, Sales) =============

def require_leads_access(current_user: UserModel = Depends(get_current_user)):
    """Allow Admin, Manager, or Sales to access leads (list, create, view)."""
    if current_user.role not in ['Admin', 'Manager', 'Sales']:
        raise HTTPException(status_code=403, detail='You do not have access to leads')
    return current_user

def can_edit_lead(lead: LeadModel, current_user: UserModel) -> bool:
    """Admin/Manager can edit any lead; Sales can edit only leads they created."""
    if current_user.role in ['Admin', 'Manager']:
        return True
    if current_user.role == 'Sales':
        return lead.created_by_employee_id and str(lead.created_by_employee_id) == str(current_user.employee_id or '')
    return False

@api_router.get('/leads', response_model=List[Lead])
def get_leads(
    status: Optional[str] = None,
    source: Optional[str] = None,
    assigned_to_employee_id: Optional[str] = None,
    current_user: UserModel = Depends(require_leads_access),
    db: Session = Depends(get_db)
):
    query = db.query(LeadModel)
    if status:
        query = query.filter(LeadModel.status == status)
    if source:
        query = query.filter(LeadModel.source == source)
    if assigned_to_employee_id:
        query = query.filter(LeadModel.assigned_to_employee_id == assigned_to_employee_id)
    leads = query.order_by(LeadModel.updated_at.desc()).all()
    # Deserialize contacts JSON for API response
    for lead in leads:
        if hasattr(lead, 'contacts') and lead.contacts:
            try:
                lead.contacts = json.loads(lead.contacts)
            except Exception:
                lead.contacts = []
    return leads

@api_router.get('/leads/stats', response_model=LeadStats)
def get_lead_stats(
    current_user: UserModel = Depends(require_leads_access),
    db: Session = Depends(get_db)
):
    leads = db.query(LeadModel).all()
    by_status = {}
    for lead in leads:
        by_status[lead.status] = by_status.get(lead.status, 0) + 1
    return LeadStats(total=len(leads), by_status=by_status)


@api_router.get('/leads/dashboard-report')
def get_leads_dashboard_report(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lead report for dashboard: by status, monthly trend, by assignee. Admin, HR, Manager only."""
    if current_user.role not in ['Admin', 'HR', 'Manager']:
        return {
            'total': 0,
            'by_status': {},
            'monthly': [],
            'by_assignee': [],
            'total_value_won': 0,
        }
    leads = db.query(LeadModel).all()
    by_status = {}
    for lead in leads:
        by_status[lead.status] = by_status.get(lead.status, 0) + 1
    # Last 6 months count (newest first)
    from datetime import date as date_type
    today = date_type.today()
    monthly = []
    for i in range(6):
        # i=0 -> current month, i=1 -> last month, ...
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        month_str = f'{y}-{m:02d}'
        count = sum(1 for lead in leads if lead.created_at and lead.created_at.strftime('%Y-%m') == month_str)
        monthly.append({'month': month_str, 'count': count})
    monthly.reverse()
    # By assignee (assigned_to_employee_id / assigned_to_name)
    assignee_map = {}
    for lead in leads:
        key = (lead.assigned_to_employee_id or 'Unassigned', lead.assigned_to_name or 'Unassigned')
        if key not in assignee_map:
            assignee_map[key] = {'total': 0, 'Won': 0, 'Lost': 0, 'pipeline': 0}
        assignee_map[key]['total'] += 1
        if lead.status == 'Won':
            assignee_map[key]['Won'] += 1
        elif lead.status == 'Lost':
            assignee_map[key]['Lost'] += 1
        else:
            assignee_map[key]['pipeline'] += 1
    by_assignee = [
        {
            'employee_id': eid,
            'employee_name': name,
            'total': data['total'],
            'won': data['Won'],
            'lost': data['Lost'],
            'pipeline': data['pipeline'],
        }
        for (eid, name), data in assignee_map.items()
    ]
    by_assignee.sort(key=lambda x: -x['total'])
    total_value_won = sum((lead.value or 0) for lead in leads if lead.status == 'Won')
    return {
        'total': len(leads),
        'by_status': by_status,
        'monthly': monthly,
        'by_assignee': by_assignee,
        'total_value_won': round(total_value_won, 2),
    }


@api_router.post('/leads', response_model=Lead)
def create_lead(
    data: LeadCreate,
    current_user: UserModel = Depends(require_leads_access),
    db: Session = Depends(get_db)
):
    new_lead = LeadModel(
        contact_name=data.contact_name,
        company=data.company,
        email=data.email,
        phone=data.phone,
        source=data.source,
        status=data.status,
        value=data.value,
        notes=data.notes,
        assigned_to_employee_id=data.assigned_to_employee_id,
        assigned_to_name=data.assigned_to_name,
        created_by_employee_id=current_user.employee_id,
        created_by_name=current_user.name,
        category=getattr(data, 'category', None),
        sub_category=getattr(data, 'sub_category', None),
        contacts=json.dumps(data.contacts) if getattr(data, 'contacts', None) is not None else None
    )
    db.add(new_lead)
    db.commit()
    db.refresh(new_lead)
    # Deserialize contacts for response
    if new_lead.contacts:
        try:
            new_lead.contacts = json.loads(new_lead.contacts)
        except Exception:
            new_lead.contacts = []
    return new_lead

@api_router.get('/leads/{lead_id}', response_model=Lead)
def get_lead(
    lead_id: str,
    current_user: UserModel = Depends(require_leads_access),
    db: Session = Depends(get_db)
):
    lead = db.query(LeadModel).filter(LeadModel.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    # Deserialize contacts JSON for API response
    if hasattr(lead, 'contacts') and lead.contacts:
        try:
            lead.contacts = json.loads(lead.contacts)
        except Exception:
            lead.contacts = []
    return lead

@api_router.put('/leads/{lead_id}', response_model=Lead)
def update_lead(
    lead_id: str,
    data: LeadUpdate,
    current_user: UserModel = Depends(require_leads_access),
    db: Session = Depends(get_db)
):
    lead = db.query(LeadModel).filter(LeadModel.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    if not can_edit_lead(lead, current_user):
        raise HTTPException(status_code=403, detail='You can only edit leads created by you')
    
    update_data = data.model_dump(exclude_unset=True)
    
    # Track if status is being changed
    old_status = lead.status
    new_status = update_data.get('status')
    status_changed = new_status is not None and new_status != old_status
    
    # Require comment if status is being changed
    if status_changed and not update_data.get('status_change_comment'):
        raise HTTPException(status_code=400, detail='Status change comment is required')
    
    # Handle contacts as JSON string
    if 'contacts' in update_data:
        update_data['contacts'] = json.dumps(update_data['contacts']) if update_data['contacts'] is not None else None
    
    # Remove status_change_comment from update_data (it's not a column on LeadModel)
    status_comment = update_data.pop('status_change_comment', None)
    
    for key, value in update_data.items():
        setattr(lead, key, value)
    lead.updated_at = datetime.now(timezone.utc)
    
    # Create status history record if status changed
    if status_changed:
        history = LeadStatusHistoryModel(
            lead_id=lead_id,
            old_status=old_status,
            new_status=new_status,
            changed_by_employee_id=current_user.employee_id,
            changed_by_name=current_user.name,
            change_comment=status_comment
        )
        db.add(history)
    
    db.commit()
    db.refresh(lead)
    # Deserialize contacts for response
    if lead.contacts:
        try:
            lead.contacts = json.loads(lead.contacts)
        except Exception:
            lead.contacts = []
    return lead

@api_router.delete('/leads/{lead_id}')
def delete_lead(
    lead_id: str,
    current_user: UserModel = Depends(require_leads_access),
    db: Session = Depends(get_db)
):
    lead = db.query(LeadModel).filter(LeadModel.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    if not can_edit_lead(lead, current_user):
        raise HTTPException(status_code=403, detail='You can only delete leads created by you')
    db.query(LeadActivityModel).filter(LeadActivityModel.lead_id == lead_id).delete()
    db.delete(lead)
    db.commit()
    return {'message': 'Lead deleted'}

@api_router.get('/leads/{lead_id}/activities', response_model=List[LeadActivity])
def get_lead_activities(
    lead_id: str,
    current_user: UserModel = Depends(require_leads_access),
    db: Session = Depends(get_db)
):
    return db.query(LeadActivityModel).filter(LeadActivityModel.lead_id == lead_id).order_by(LeadActivityModel.created_at.desc()).all()

@api_router.post('/leads/{lead_id}/activities', response_model=LeadActivity)
def add_lead_activity(
    lead_id: str,
    data: LeadActivityCreate,
    current_user: UserModel = Depends(require_leads_access),
    db: Session = Depends(get_db)
):
    lead = db.query(LeadModel).filter(LeadModel.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    if not can_edit_lead(lead, current_user):
        raise HTTPException(status_code=403, detail='You can only add comments/activities to leads created by you')
    activity = LeadActivityModel(
        lead_id=lead_id,
        activity_type=data.activity_type,
        summary=data.summary,
        created_by_id=current_user.id,
        created_by_name=current_user.name
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity

@api_router.get('/leads/{lead_id}/status-history', response_model=List[LeadStatusHistory])
def get_lead_status_history(
    lead_id: str,
    current_user: UserModel = Depends(require_leads_access),
    db: Session = Depends(get_db)
):
    """Get all status change history for a lead, ordered by most recent first."""
    return db.query(LeadStatusHistoryModel).filter(
        LeadStatusHistoryModel.lead_id == lead_id
    ).order_by(LeadStatusHistoryModel.changed_at.desc()).all()

@api_router.get('/leads/{lead_id}/reminders', response_model=List[LeadReminder])
def get_lead_reminders(
    lead_id: str,
    current_user: UserModel = Depends(require_leads_access),
    db: Session = Depends(get_db)
):
    """Get all reminders for a lead, ordered by reminder date."""
    return db.query(LeadReminderModel).filter(LeadReminderModel.lead_id == lead_id).order_by(LeadReminderModel.reminder_datetime.asc()).all()

@api_router.post('/leads/{lead_id}/reminders', response_model=LeadReminder)
def add_lead_reminder(
    lead_id: str,
    data: LeadReminderCreate,
    current_user: UserModel = Depends(require_leads_access),
    db: Session = Depends(get_db)
):
    """Create a reminder for a lead."""
    lead = db.query(LeadModel).filter(LeadModel.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    if not can_edit_lead(lead, current_user):
        raise HTTPException(status_code=403, detail='You can only add reminders to leads created by you')
    
    reminder = LeadReminderModel(
        lead_id=lead_id,
        reminder_datetime=data.reminder_datetime,
        description=data.description,
        is_completed='False',
        created_by_id=current_user.id,
        created_by_name=current_user.name
    )
    db.add(reminder)
    db.commit()
    db.refresh(reminder)
    return reminder

@api_router.delete('/leads/{lead_id}/reminders/{reminder_id}')
def delete_lead_reminder(
    lead_id: str,
    reminder_id: str,
    current_user: UserModel = Depends(require_leads_access),
    db: Session = Depends(get_db)
):
    """Delete a reminder for a lead."""
    lead = db.query(LeadModel).filter(LeadModel.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    if not can_edit_lead(lead, current_user):
        raise HTTPException(status_code=403, detail='You can only delete reminders from leads created by you')
    
    reminder = db.query(LeadReminderModel).filter(
        LeadReminderModel.id == reminder_id,
        LeadReminderModel.lead_id == lead_id
    ).first()
    if not reminder:
        raise HTTPException(status_code=404, detail='Reminder not found')
    
    db.delete(reminder)
    db.commit()
    return {'message': 'Reminder deleted'}

# ============= EMAIL HELPER FUNCTIONS =============

def send_email(to_email: str, subject: str, body: str, is_html: bool = False) -> bool:
    """Send an email using SMTP configuration from environment variables."""
    try:
        smtp_server = os.environ.get('SMTP_SERVER', '')
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        smtp_username = os.environ.get('SMTP_USERNAME', '')
        smtp_password = os.environ.get('SMTP_PASSWORD', '')
        sender_email = os.environ.get('SENDER_EMAIL', '')
        sender_name = os.environ.get('SENDER_NAME', 'CRM Application')
        
        # Check if email configuration is properly set
        if not all([smtp_server, smtp_username, smtp_password, sender_email]):
            missing_configs = []
            if not smtp_server:
                missing_configs.append('SMTP_SERVER')
            if not smtp_username:
                missing_configs.append('SMTP_USERNAME')
            if not smtp_password:
                missing_configs.append('SMTP_PASSWORD')
            if not sender_email:
                missing_configs.append('SENDER_EMAIL')
            error_msg = f'Email configuration not properly set. Missing: {", ".join(missing_configs)}'
            logging.warning(error_msg)
            return False
        
        # Create message
        msg = MIMEMultipart('alternative')
        msg['From'] = f'{sender_name} <{sender_email}>'
        msg['To'] = to_email
        msg['Subject'] = subject
        
        # Add body
        if is_html:
            part = MIMEText(body, 'html')
        else:
            part = MIMEText(body, 'plain')
        msg.attach(part)
        
        # Send email
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_username, smtp_password)
            server.send_message(msg)
        
        logging.info(f'Email sent successfully to {to_email}')
        return True
    except smtplib.SMTPAuthenticationError as e:
        logging.error(f'SMTP Authentication Failed: Check SMTP_USERNAME and SMTP_PASSWORD in .env file. Error: {str(e)}')
        return False
    except smtplib.SMTPException as e:
        logging.error(f'SMTP Error while sending email to {to_email}: {str(e)}')
        return False
    except Exception as e:
        logging.error(f'Failed to send email to {to_email}: {str(e)}')
        return False

def calculate_subscription_status(subscription_end_date: Optional[datetime]) -> str:
    """Calculate subscription status based on end date."""
    if not subscription_end_date:
        return 'Active'
    
    today = datetime.now()
    days_until_expiry = (subscription_end_date.date() - today.date()).days
    
    if days_until_expiry <= 0:
        return 'Expired'
    elif days_until_expiry <= 60:
        return 'Expiring Soon'
    else:
        return 'Active'

# ============= EMAIL TEST ENDPOINT =============

class TestEmailRequest(BaseModel):
    recipient_email: EmailStr

@api_router.post('/test-email')
def test_email(
    request: TestEmailRequest,
    current_user: UserModel = Depends(get_current_user)
):
    """Test email configuration by sending a test email."""
    test_subject = "CRM Application - Email Configuration Test"
    test_body = f"""
Hello {current_user.name},

This is a test email from the CRM Application to verify your email configuration is working correctly.

If you received this email, your SMTP settings are configured properly!

Test Details:
- Sent by: {current_user.email}
- Recipient: {request.recipient_email}
- Timestamp: {datetime.now().isoformat()}

Best regards,
CRM Application Team
"""
    
    email_sent = send_email(request.recipient_email, test_subject, test_body, is_html=False)
    
    if email_sent:
        return {
            'status': 'success',
            'message': f'Test email sent successfully to {request.recipient_email}',
            'recipient': request.recipient_email
        }
    else:
        return {
            'status': 'failed',
            'message': f'Failed to send test email. Please check .env file configuration and server logs.',
            'recipient': request.recipient_email,
            'help': 'Make sure SMTP_SERVER, SMTP_USERNAME, SMTP_PASSWORD, and SENDER_EMAIL are properly set in .env file'
        }

# ============= ORDER ROUTES =============

def _enrich_order_with_lead_info(order: OrderModel, db: Session) -> dict:
    """Helper function to merge order with current lead contact information and calculate subscription status."""
    # Calculate subscription status dynamically
    subscription_status = calculate_subscription_status(order.subscription_end_date)
    
    order_dict = {
        'id': order.id,
        'order_id': order.order_id,
        'lead_id': order.lead_id,
        'customer_name': order.customer_name,
        'contact_person': order.contact_person,
        'contact_number': order.contact_number,
        'mail_id': order.mail_id,
        'offer_no': order.offer_no,
        'offer_date': order.offer_date,
        'product': order.product,
        'cust_supply_po_value': order.cust_supply_po_value,
        'cust_po_no': order.cust_po_no,
        'po_date': order.po_date,
        'order_copy_received_date': order.order_copy_received_date,
        'payment_terms': order.payment_terms,
        'advance_payment': order.advance_payment,
        'delivery_committed': order.delivery_committed,
        'vendor_po_no': order.vendor_po_no,
        'vendor_name': order.vendor_name,
        'vendor_po_date': order.vendor_po_date,
        'vendor_po_value': order.vendor_po_value,
        'resoline_tax_invoice_no': order.resoline_tax_invoice_no,
        'resoline_invoice_date': order.resoline_invoice_date,
        'invoice_amount': order.invoice_amount,
        'vendor_invoice_no': order.vendor_invoice_no,
        'vendor_dispatch_lr_no': order.vendor_dispatch_lr_no,
        'vendor_dispatch_transport': order.vendor_dispatch_transport,
        'material_check': order.material_check,
        'customer_dispatch_details': order.customer_dispatch_details,
        'material_received_by_cust': order.material_received_by_cust,
        'installation_successful': order.installation_successful,
        'installation_service_report_no': order.installation_service_report_no,
        'service_report_date': order.service_report_date,
        'service_charges': order.service_charges,
        'final_payment_due': order.final_payment_due,
        'final_payment_date': order.final_payment_date,
        'subscription_start_date': order.subscription_start_date,
        'subscription_end_date': order.subscription_end_date,
        'subscription_status': subscription_status,  # Dynamically calculated
        'renewal_reminder_sent': order.renewal_reminder_sent,
        'remarks': order.remarks,
        'order_status': order.order_status,
        'offer_copy_path': order.offer_copy_path,
        'order_copy_path': order.order_copy_path,
        'estimation': order.estimation,
        'subscription_reminder_sent_30': order.subscription_reminder_sent_30,
        'subscription_reminder_sent_7': order.subscription_reminder_sent_7,
        'subscription_reminder_sent_1': order.subscription_reminder_sent_1,
        'assigned_to_employee_id': order.assigned_to_employee_id,
        'assigned_to_name': order.assigned_to_name,
        'created_by_employee_id': order.created_by_employee_id,
        'created_by_name': order.created_by_name,
        'created_at': order.created_at,
        'updated_at': order.updated_at,
    }
    
    # Fetch current lead info and override contact fields with lead's current data
    if order.lead_id:
        lead = db.query(LeadModel).filter(LeadModel.id == order.lead_id).first()
        if lead:
            order_dict['contact_person'] = lead.contact_name
            order_dict['contact_number'] = lead.phone
            order_dict['mail_id'] = lead.email
    
    return order_dict

@api_router.get('/orders', response_model=List[Order])
def get_orders(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
    status: Optional[str] = None,
    lead_id: Optional[str] = None
):
    """Get all orders with optional filtering."""
    query = db.query(OrderModel)
    
    if status:
        query = query.filter(OrderModel.order_status == status)
    if lead_id:
        query = query.filter(OrderModel.lead_id == lead_id)
    
    orders = query.order_by(OrderModel.created_at.desc()).all()
    # Enrich each order with current lead contact information
    enriched_orders = [_enrich_order_with_lead_info(order, db) for order in orders]
    return enriched_orders

@api_router.get('/orders/search/expiring', response_model=List[Order])
def get_expiring_subscriptions(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
    days: int = 30
):
    """Get orders with subscriptions expiring within specified days."""
    from datetime import timedelta
    future_date = datetime.now() + timedelta(days=days)
    
    orders = db.query(OrderModel).filter(
        OrderModel.subscription_status != 'Expired',
        OrderModel.subscription_end_date <= future_date,
        OrderModel.subscription_end_date >= datetime.now()
    ).all()
    # Enrich each order with current lead contact information
    enriched_orders = [_enrich_order_with_lead_info(order, db) for order in orders]
    return enriched_orders

@api_router.post('/orders', response_model=Order)
def create_order(
    order_data: OrderCreate,
    current_user: UserModel = Depends(require_leads_access),
    db: Session = Depends(get_db)
):
    """Create a new order from a won lead."""
    # Verify the lead exists and is won
    lead = db.query(LeadModel).filter(LeadModel.id == order_data.lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail='Lead not found')
    if lead.status != 'Won':
        raise HTTPException(status_code=400, detail='Order can only be created for Won leads')
    
    # Generate unique order ID
    order_number = f"ORD-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"
    
    # Auto-populate contact info from lead if not provided
    contact_person = order_data.contact_person or lead.contact_name
    contact_number = order_data.contact_number or lead.phone
    mail_id = order_data.mail_id or lead.email
    
    new_order = OrderModel(
        order_id=order_number,
        lead_id=order_data.lead_id,
        customer_name=order_data.customer_name,
        contact_person=contact_person,
        contact_number=contact_number,
        mail_id=mail_id,
        offer_no=order_data.offer_no,
        offer_date=order_data.offer_date,
        product=order_data.product,
        cust_supply_po_value=order_data.cust_supply_po_value,
        cust_po_no=order_data.cust_po_no,
        po_date=order_data.po_date,
        offer_copy_path=order_data.offer_copy_path,
        order_copy_path=order_data.order_copy_path,
        estimation=order_data.estimation,
        subscription_start_date=order_data.subscription_start_date,
        subscription_end_date=order_data.subscription_end_date,
        assigned_to_employee_id=order_data.assigned_to_employee_id or current_user.employee_id,
        assigned_to_name=order_data.assigned_to_name or current_user.name,
        created_by_employee_id=current_user.employee_id,
        created_by_name=current_user.name
    )
    
    # Calculate subscription status if subscription end date is provided
    if order_data.subscription_end_date:
        new_order.subscription_status = calculate_subscription_status(order_data.subscription_end_date)
    
    db.add(new_order)
    db.commit()
    db.refresh(new_order)
    
    # Create activity log
    activity = OrderActivityModel(
        order_id=new_order.id,
        activity_type='Order Creation',
        summary=f'Order {order_number} created',
        created_by_id=current_user.id,
        created_by_name=current_user.name
    )
    db.add(activity)
    db.commit()
    
    # Return enriched order with current lead contact information
    enriched_order = _enrich_order_with_lead_info(new_order, db)
    return enriched_order

@api_router.get('/orders/{order_id}', response_model=Order)
def get_order(
    order_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific order by ID."""
    order = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail='Order not found')
    # Enrich order with current lead contact information
    enriched_order = _enrich_order_with_lead_info(order, db)
    return enriched_order

@api_router.put('/orders/{order_id}', response_model=Order)
def update_order(
    order_id: str,
    order_data: OrderUpdate,
    current_user: UserModel = Depends(require_leads_access),
    db: Session = Depends(get_db)
):
    """Update an order."""
    order = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail='Order not found')
    
    # Update the fields that were provided
    update_data = order_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(order, field, value)
    
    order.updated_at = datetime.now()
    
    # Check subscription status
    if order.subscription_end_date:
        today = datetime.now()
        days_until_expiry = (order.subscription_end_date.date() - today.date()).days
        
        if days_until_expiry <= 0:
            order.subscription_status = 'Expired'
        elif days_until_expiry <= 30:
            order.subscription_status = 'Expiring Soon'
        else:
            order.subscription_status = 'Active'
    
    db.commit()
    db.refresh(order)
    
    # Create activity log
    activity = OrderActivityModel(
        order_id=order.id,
        activity_type='Order Update',
        summary='Order information updated',
        created_by_id=current_user.id,
        created_by_name=current_user.name
    )
    db.add(activity)
    db.commit()
    
    # Return enriched order with current lead contact information
    enriched_order = _enrich_order_with_lead_info(order, db)
    return enriched_order

@api_router.get('/orders/{order_id}/activities', response_model=List[OrderActivity])
def get_order_activities(
    order_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all activities for an order."""
    activities = db.query(OrderActivityModel).filter(
        OrderActivityModel.order_id == order_id
    ).order_by(OrderActivityModel.created_at.desc()).all()
    return activities

@api_router.post('/orders/{order_id}/activities', response_model=OrderActivity)
def add_order_activity(
    order_id: str,
    activity_data: OrderActivityCreate,
    current_user: UserModel = Depends(require_leads_access),
    db: Session = Depends(get_db)
):
    """Add an activity to an order."""
    order = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail='Order not found')
    
    new_activity = OrderActivityModel(
        order_id=order_id,
        activity_type=activity_data.activity_type,
        summary=activity_data.summary,
        details=activity_data.details,
        created_by_id=current_user.id,
        created_by_name=current_user.name
    )
    
    db.add(new_activity)
    db.commit()
    db.refresh(new_activity)
    return new_activity

@api_router.post('/orders/{order_id}/send-renewal-reminder')
def send_renewal_reminder(
    order_id: str,
    current_user: UserModel = Depends(require_leads_access),
    db: Session = Depends(get_db)
):
    """Send a renewal reminder for an order subscription."""
    order = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail='Order not found')
    
    if not order.subscription_end_date:
        raise HTTPException(status_code=400, detail='Order has no subscription end date')
    
    # Create activity log for renewal reminder
    activity = OrderActivityModel(
        order_id=order_id,
        activity_type='Renewal Reminder',
        summary=f'Subscription renewal reminder sent to {order.customer_name}',
        created_by_id=current_user.id,
        created_by_name=current_user.name
    )
    
    order.renewal_reminder_sent = 'True'
    
    db.add(activity)
    db.commit()
    
    return {'message': 'Renewal reminder sent successfully', 'order_id': order_id}

@api_router.post('/orders/{order_id}/send-subscription-reminder')
def send_subscription_reminder(
    order_id: str,
    reminder_data: dict,
    current_user: UserModel = Depends(require_leads_access),
    db: Session = Depends(get_db)
):
    """Send a subscription renewal reminder email with specified days before expiry."""
    order = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail='Order not found')
    
    if not order.subscription_end_date:
        raise HTTPException(status_code=400, detail='Order has no subscription end date')
    
    days_before = reminder_data.get('days_before', 30)
    email = reminder_data.get('email')
    contact_name = reminder_data.get('contact_name', 'Customer')
    end_date = reminder_data.get('end_date')
    
    if not email:
        raise HTTPException(status_code=400, detail='Email is required')
    
    # Format the email body
    end_date_obj = datetime.fromisoformat(end_date.split('T')[0]) if isinstance(end_date, str) else order.subscription_end_date
    email_body = f"""
Dear {contact_name},

This is a friendly reminder that your subscription for Order {order.order_id} will expire in {days_before} days.

Subscription Details:
- Order ID: {order.order_id}
- End Date: {end_date_obj.strftime('%Y-%m-%d')}
- Customer: {order.customer_name}

Please contact our support team if you'd like to renew your subscription.

Best regards,
Sales Team
"""
    
    # Log the reminder activity
    activity = OrderActivityModel(
        order_id=order_id,
        activity_type='Subscription Reminder',
        summary=f'{days_before}-day subscription renewal reminder sent to {email}',
        details=json.dumps({
            'email': email,
            'days_before': days_before,
            'sent_at': datetime.now().isoformat()
        }),
        created_by_id=current_user.id,
        created_by_name=current_user.name
    )
    
    # Update the appropriate reminder_sent flag
    if days_before == 30:
        order.subscription_reminder_sent_30 = 'True'
    elif days_before == 7:
        order.subscription_reminder_sent_7 = 'True'
    elif days_before == 1:
        order.subscription_reminder_sent_1 = 'True'
    
    db.add(activity)
    db.commit()
    db.refresh(order)
    
    # Send the email
    subject = f"Subscription Renewal Reminder - Order {order.order_id}"
    email_sent = send_email(email, subject, email_body, is_html=False)
    
    if email_sent:
        return {
            'message': f'Subscription reminder email sent successfully to {email}',
            'order_id': order_id,
            'days_before': days_before,
            'email': email,
            'status': 'sent'
        }
    else:
        return {
            'message': f'Failed to send subscription reminder email to {email}. Please check email configuration.',
            'order_id': order_id,
            'days_before': days_before,
            'email': email,
            'status': 'failed'
        }


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

# ============= VEHICLE TRACKING ROUTES =============

# Create a new vehicle
@api_router.post('/vehicles', response_model=Vehicle)
def create_vehicle(
    data: VehicleCreate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new vehicle (Admin only)"""
    # Check if registration number already exists
    existing = db.query(VehicleModel).filter(VehicleModel.registration_number == data.registration_number).first()
    if existing:
        raise HTTPException(status_code=400, detail='Vehicle with this registration number already exists')
    
    vehicle = VehicleModel(
        vehicle_name=data.vehicle_name,
        vehicle_type=data.vehicle_type,
        fuel_type=data.fuel_type,
        registration_number=data.registration_number,
        milage=data.milage,
        status=data.status
    )
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle

# Get all vehicles
@api_router.get('/vehicles', response_model=List[Vehicle])
def get_vehicles(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all vehicles"""
    vehicles = db.query(VehicleModel).all()
    return vehicles

# ============= FUEL PRICE SETTINGS =============

@api_router.get('/vehicles/fuel-price')
def get_fuel_price(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current fuel price per liter"""
    try:
        fuel_price = db.query(SettingsModel).filter(SettingsModel.config_key == 'fuel_price_per_liter').first()
        if fuel_price:
            return {'fuel_price_per_liter': float(fuel_price.value)}
        return {'fuel_price_per_liter': 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Error fetching fuel price: {str(e)}')


class FuelPriceUpdate(BaseModel):
    fuel_price_per_liter: float


@api_router.put('/vehicles/fuel-price')
def update_fuel_price(
    body: FuelPriceUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update fuel price per liter (Admin only)"""
    try:
        if current_user.role != 'Admin':
            raise HTTPException(status_code=403, detail='Only Admin can update fuel price')
        
        fuel_price = db.query(SettingsModel).filter(SettingsModel.config_key == 'fuel_price_per_liter').first()
        if fuel_price:
            fuel_price.value = str(body.fuel_price_per_liter)
        else:
            fuel_price = SettingsModel(config_key='fuel_price_per_liter', value=str(body.fuel_price_per_liter))
            db.add(fuel_price)
        
        db.commit()
        return {
            'message': 'Fuel price updated successfully',
            'fuel_price_per_liter': body.fuel_price_per_liter
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f'Error updating fuel price: {str(e)}')

# ============= VEHICLE DETAIL ROUTES =============

# Get single vehicle
@api_router.get('/vehicles/{vehicle_id}', response_model=Vehicle)
def get_vehicle(
    vehicle_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get single vehicle details"""
    vehicle = db.query(VehicleModel).filter(VehicleModel.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail='Vehicle not found')
    return vehicle

# Update vehicle
@api_router.put('/vehicles/{vehicle_id}', response_model=Vehicle)
def update_vehicle(
    vehicle_id: str,
    data: VehicleCreate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update vehicle details"""
    vehicle = db.query(VehicleModel).filter(VehicleModel.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail='Vehicle not found')
    
    vehicle.vehicle_name = data.vehicle_name
    vehicle.vehicle_type = data.vehicle_type
    vehicle.fuel_type = data.fuel_type
    vehicle.milage = data.milage
    vehicle.status = data.status
    
    db.commit()
    db.refresh(vehicle)
    return vehicle

# Upload vehicle photo
@api_router.post('/vehicles/{vehicle_id}/upload-photo')
def upload_vehicle_photo(
    vehicle_id: str,
    file: UploadFile = File(...),
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload vehicle photo"""
    vehicle = db.query(VehicleModel).filter(VehicleModel.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail='Vehicle not found')
    
    try:
        file_content = file.file.read()
        filename = f"vehicle_{uuid.uuid4()}{Path(file.filename).suffix}"
        photo_path = upload_to_s3(file_content, filename, folder='vehicle_photos')
        
        if not photo_path:
            raise HTTPException(status_code=503, detail='File upload service unavailable')
        
        vehicle.photo_path = photo_path
        db.commit()
        db.refresh(vehicle)
        
        return {'photo_path': photo_path, 'message': 'Vehicle photo uploaded successfully'}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ============= VEHICLE USAGE ROUTES =============

# Start vehicle usage
@api_router.post('/vehicle-usage', response_model=VehicleUsage)
def start_vehicle_usage(
    data: VehicleUsageCreate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Employee starts using a vehicle or own vehicle - records start meter reading"""
    # If using own vehicle, validate own_vehicle fields
    if not data.vehicle_id:
        if not data.own_vehicle_type or not data.own_vehicle_milage:
            raise HTTPException(status_code=400, detail='For own vehicle, vehicle type and mileage are required')
        if data.own_vehicle_milage <= 0 or data.own_vehicle_milage > 100:
            raise HTTPException(status_code=400, detail='Invalid mileage. Must be between 0.1 and 100 km/liter')
    else:
        # For company vehicles, verify vehicle exists
        vehicle = db.query(VehicleModel).filter(VehicleModel.id == data.vehicle_id).first()
        if not vehicle:
            raise HTTPException(status_code=404, detail='Vehicle not found')
    
    # Validate meter reading - should be reasonable (max 1 million km for a vehicle)
    if data.start_meter_reading < 0 or data.start_meter_reading > 1000000:
        raise HTTPException(status_code=400, detail='Invalid meter reading. Must be between 0 and 1,000,000 km')
    
    usage = VehicleUsageModel(
        vehicle_id=data.vehicle_id,
        employee_id=data.employee_id,
        employee_name=data.employee_name,
        start_meter_reading=data.start_meter_reading,
        own_vehicle_type=data.own_vehicle_type,
        own_vehicle_milage=data.own_vehicle_milage,
        notes=data.notes
    )
    db.add(usage)
    db.commit()
    db.refresh(usage)
    return usage

# Get all vehicle usage records
@api_router.get('/vehicle-usage', response_model=List[VehicleUsage])
def get_all_vehicle_usage(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all vehicle usage records - admins see all, others see their own. Excludes already claimed journeys."""
    if current_user.role in ['Admin', 'Manager']:
        usages = db.query(VehicleUsageModel).filter(VehicleUsageModel.is_claimed == 0).order_by(VehicleUsageModel.start_date.desc()).all()
    else:
        usages = db.query(VehicleUsageModel).filter(
            VehicleUsageModel.employee_id == current_user.employee_id,
            VehicleUsageModel.is_claimed == 0
        ).order_by(VehicleUsageModel.start_date.desc()).all()
    return usages

# Get last vehicle usage for tracking
@api_router.get('/vehicle-usage/vehicle/{vehicle_id}/last')
def get_last_vehicle_usage(
    vehicle_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get last usage of a vehicle (by any employee) - useful for tracking if vehicle was properly returned"""
    # Get the most recent usage (completed or ongoing)
    last_usage = db.query(VehicleUsageModel).filter(
        VehicleUsageModel.vehicle_id == vehicle_id
    ).order_by(VehicleUsageModel.start_date.desc()).first()
    
    if not last_usage:
        return {'message': 'No previous usage found'}
    
    return {
        'id': last_usage.id,
        'employee_id': last_usage.employee_id,
        'employee_name': last_usage.employee_name,
        'start_meter_reading': last_usage.start_meter_reading,
        'end_meter_reading': last_usage.end_meter_reading,
        'start_date': last_usage.start_date.isoformat() if last_usage.start_date else None,
        'end_date': last_usage.end_date.isoformat() if last_usage.end_date else None,
        'status': last_usage.status,
        'km_driven': last_usage.km_driven,
        'notes': last_usage.notes
    }

# Upload start meter reading photo
@api_router.post('/vehicle-usage/{usage_id}/upload-start-photo')
def upload_start_reading_photo(
    usage_id: str,
    file: UploadFile = File(...),
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload photo of meter reading at start of journey"""
    usage = db.query(VehicleUsageModel).filter(VehicleUsageModel.id == usage_id).first()
    if not usage:
        raise HTTPException(status_code=404, detail='Vehicle usage record not found')
    
    try:
        file_content = file.file.read()
        filename = f"meter_start_{uuid.uuid4()}{Path(file.filename).suffix}"
        photo_path = upload_to_s3(file_content, filename, folder='meter_readings')
        
        if not photo_path:
            raise HTTPException(status_code=503, detail='File upload service unavailable')
        
        usage.start_reading_photo_path = photo_path
        db.commit()
        db.refresh(usage)
        
        return {'photo_path': photo_path, 'message': 'Start reading photo uploaded'}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Complete vehicle usage
@api_router.put('/vehicle-usage/{usage_id}/complete', response_model=VehicleUsage)
def complete_vehicle_usage(
    usage_id: str,
    data: VehicleUsageUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Employee completes vehicle usage - records end meter reading"""
    usage = db.query(VehicleUsageModel).filter(VehicleUsageModel.id == usage_id).first()
    if not usage:
        raise HTTPException(status_code=404, detail='Vehicle usage record not found')
    
    # Determine vehicle mileage (own vehicle or company vehicle)
    vehicle = None
    if usage.own_vehicle_milage:
        milage = usage.own_vehicle_milage
    else:
        vehicle = db.query(VehicleModel).filter(VehicleModel.id == usage.vehicle_id).first()
        if not vehicle:
            raise HTTPException(status_code=404, detail='Vehicle not found')
        milage = vehicle.milage
    
    # Validate meter reading
    if data.end_meter_reading < 0 or data.end_meter_reading > 1000000:
        raise HTTPException(status_code=400, detail='Invalid meter reading. Must be between 0 and 1,000,000 km')
    
    if data.end_meter_reading < usage.start_meter_reading:
        raise HTTPException(status_code=400, detail='End meter reading must be greater than or equal to start meter reading')
    
    # Calculate KM driven and fuel consumed
    km_driven = data.end_meter_reading - usage.start_meter_reading
    fuel_consumed = km_driven / milage
    
    usage.end_meter_reading = data.end_meter_reading
    usage.km_driven = km_driven
    usage.fuel_consumed = fuel_consumed
    usage.status = 'Completed'
    usage.end_date = datetime.now(timezone.utc)
    if data.notes:
        usage.notes = data.notes
    
    # Update vehicle's current meter reading only for company vehicles
    if vehicle:
        vehicle.current_meter_reading = data.end_meter_reading
    
    db.commit()
    db.refresh(usage)
    return usage

# Complete vehicle usage (PATCH alternative endpoint for frontend)
@api_router.patch('/vehicle-usage/{usage_id}', response_model=VehicleUsage)
def complete_vehicle_usage_patch(
    usage_id: str,
    data: VehicleUsageUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Employee completes vehicle usage - records end meter reading (PATCH alternative)"""
    usage = db.query(VehicleUsageModel).filter(VehicleUsageModel.id == usage_id).first()
    if not usage:
        raise HTTPException(status_code=404, detail='Vehicle usage record not found')
    
    # Determine vehicle mileage (own vehicle or company vehicle)
    vehicle = None
    if usage.own_vehicle_milage:
        milage = usage.own_vehicle_milage
    else:
        vehicle = db.query(VehicleModel).filter(VehicleModel.id == usage.vehicle_id).first()
        if not vehicle:
            raise HTTPException(status_code=404, detail='Vehicle not found')
        milage = vehicle.milage
    
    # Validate meter reading
    if data.end_meter_reading < 0 or data.end_meter_reading > 1000000:
        raise HTTPException(status_code=400, detail='Invalid meter reading. Must be between 0 and 1,000,000 km')
    
    if data.end_meter_reading < usage.start_meter_reading:
        raise HTTPException(status_code=400, detail='End meter reading must be greater than or equal to start meter reading')
    
    # Calculate KM driven and fuel consumed
    km_driven = data.end_meter_reading - usage.start_meter_reading
    fuel_consumed = km_driven / milage
    
    usage.end_meter_reading = data.end_meter_reading
    usage.km_driven = km_driven
    usage.fuel_consumed = fuel_consumed
    usage.status = 'Completed'
    usage.end_date = datetime.now(timezone.utc)
    if data.notes:
        usage.notes = data.notes
    
    # Update vehicle's current meter reading only for company vehicles
    if vehicle:
        vehicle.current_meter_reading = data.end_meter_reading
    
    db.commit()
    db.refresh(usage)
    return usage

# Upload end meter reading photo
@api_router.post('/vehicle-usage/{usage_id}/upload-end-photo')
def upload_end_reading_photo(
    usage_id: str,
    file: UploadFile = File(...),
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload photo of meter reading at end of journey"""
    usage = db.query(VehicleUsageModel).filter(VehicleUsageModel.id == usage_id).first()
    if not usage:
        raise HTTPException(status_code=404, detail='Vehicle usage record not found')
    
    try:
        file_content = file.file.read()
        filename = f"meter_end_{uuid.uuid4()}{Path(file.filename).suffix}"
        photo_path = upload_to_s3(file_content, filename, folder='meter_readings')
        
        if not photo_path:
            raise HTTPException(status_code=503, detail='File upload service unavailable')
        
        usage.end_reading_photo_path = photo_path
        db.commit()
        db.refresh(usage)
        
        return {'photo_path': photo_path, 'message': 'End reading photo uploaded'}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Get vehicle usage by ID
@api_router.get('/vehicle-usage/{usage_id}', response_model=VehicleUsage)
def get_vehicle_usage(
    usage_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get vehicle usage details"""
    usage = db.query(VehicleUsageModel).filter(VehicleUsageModel.id == usage_id).first()
    if not usage:
        raise HTTPException(status_code=404, detail='Vehicle usage record not found')
    return usage

# Get all vehicle usage records for employee
@api_router.get('/vehicle-usage/employee/{employee_id}')
def get_employee_vehicle_usage(
    employee_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all vehicle usage records for an employee"""
    usages = db.query(VehicleUsageModel).filter(VehicleUsageModel.employee_id == employee_id).all()
    return usages

# ============= FUEL EXPENSE CLAIM ROUTES =============

# Create fuel expense claim
@api_router.post('/fuel-expense-claims', response_model=FuelExpenseClaim)
def create_fuel_expense_claim(
    data: FuelExpenseClaimCreate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a fuel expense claim from vehicle usage"""
    # Get the vehicle usage record
    usage = db.query(VehicleUsageModel).filter(VehicleUsageModel.id == data.vehicle_usage_id).first()
    if not usage:
        raise HTTPException(status_code=404, detail='Vehicle usage record not found')
    
    if usage.is_claimed:
        raise HTTPException(status_code=400, detail='This journey has already been claimed')
    
    if usage.status != 'Completed':
        raise HTTPException(status_code=400, detail='Vehicle usage must be completed before claiming')
    
    # Get vehicle details (company or own vehicle)
    if usage.own_vehicle_type:
        # Own vehicle case
        vehicle_name = f"Own Vehicle - {usage.own_vehicle_type} ({usage.employee_name})"
    else:
        # Company vehicle case
        vehicle = db.query(VehicleModel).filter(VehicleModel.id == usage.vehicle_id).first()
        if not vehicle:
            raise HTTPException(status_code=404, detail='Vehicle not found')
        vehicle_name = vehicle.vehicle_name
    
    # Validate claim amount against fuel consumed
    actual_fuel_cost = usage.fuel_consumed * data.price_per_liter
    max_claimable = actual_fuel_cost * 1.05  # Allow 5% tolerance
    
    is_valid = 1
    validation_message = None
    
    if data.claimed_amount > max_claimable:
        is_valid = 0
        validation_message = f'Claimed amount (₹{data.claimed_amount}) exceeds calculated fuel cost (₹{actual_fuel_cost:.2f}). Max claimable: ₹{max_claimable:.2f}'
    
    claim = FuelExpenseClaimModel(
        vehicle_usage_id=data.vehicle_usage_id,
        employee_id=usage.employee_id,
        employee_name=usage.employee_name,
        vehicle_id=usage.vehicle_id,
        vehicle_name=vehicle_name,
        km_driven=usage.km_driven,
        fuel_consumed=usage.fuel_consumed,
        claimed_amount=data.claimed_amount,
        price_per_liter=data.price_per_liter,
        is_valid=is_valid,
        validation_message=validation_message
    )
    db.add(claim)
    
    # Mark the usage record as claimed
    usage.is_claimed = 1
    
    db.commit()
    db.refresh(claim)
    return claim

# Get fuel expense claims for employee
@api_router.get('/fuel-expense-claims/employee/{employee_id}')
def get_employee_fuel_claims(
    employee_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all fuel expense claims for an employee"""
    claims = db.query(FuelExpenseClaimModel).filter(FuelExpenseClaimModel.employee_id == employee_id).all()
    return claims

# Get all fuel expense claims (for approval)
@api_router.get('/fuel-expense-claims')
def get_fuel_claims(
    status: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get fuel expense claims - admins see all, others see their own (filter by status if provided)"""
    # Get fuel price for calculations
    fuel_price_row = db.query(SettingsModel).filter(SettingsModel.config_key == 'fuel_price_per_liter').first()
    fuel_price_per_liter = float(fuel_price_row.value) if fuel_price_row else 0
    
    query = db.query(FuelExpenseClaimModel)
    
    # Filter by employee for non-admin users
    if current_user.role not in ['Admin', 'Manager', 'HR']:
        query = query.filter(FuelExpenseClaimModel.employee_id == current_user.employee_id)
    
    if status:
        query = query.filter(FuelExpenseClaimModel.claim_status == status)
    else:
        # If no status specified, include both Approved and Partially-Approved
        query = query.filter(FuelExpenseClaimModel.claim_status.in_(['Approved', 'Partially-Approved']))
    
    # Filter by month and year if provided
    if month and year:
        start_date = datetime(year, month, 1, 0, 0, 0)
        if month == 12:
            end_date = datetime(year + 1, 1, 1, 0, 0, 0)
        else:
            end_date = datetime(year, month + 1, 1, 0, 0, 0)
        query = query.filter(FuelExpenseClaimModel.created_at >= start_date)
        query = query.filter(FuelExpenseClaimModel.created_at < end_date)
    
    claims = query.order_by(FuelExpenseClaimModel.created_at.desc()).all()
    
    # Format with calculated fuel cost and over/under claimed indicator
    result = []
    for claim in claims:
        calculated_cost = (claim.fuel_consumed or 0) * fuel_price_per_liter
        difference = (claim.claimed_amount or 0) - calculated_cost
        claim_type = 'Over-Claimed' if difference > 0 else ('Under-Claimed' if difference < 0 else 'Exact')
        
        result.append({
            'id': claim.id,
            'employee_id': claim.employee_id,
            'employee_name': claim.employee_name,
            'vehicle_name': claim.vehicle_name,
            'vehicle_id': claim.vehicle_id,
            'km_driven': claim.km_driven,
            'fuel_consumed': claim.fuel_consumed,
            'claimed_amount': claim.claimed_amount,
            'price_per_liter': claim.price_per_liter,
            'calculated_fuel_cost': round(calculated_cost, 2),
            'difference': round(difference, 2),
            'claim_type': claim_type,
            'claim_status': claim.claim_status,
            'approved_amount': claim.approved_amount if claim.approved_amount is not None else (claim.claimed_amount if claim.claim_status in ['Approved', 'Partially-Approved'] else 0),
            'is_valid': claim.is_valid,
            'approver_name': claim.approver_name,
            'approval_notes': claim.approval_notes,
            'created_at': claim.created_at.isoformat() if claim.created_at else None,
            'approved_at': claim.approved_at.isoformat() if claim.approved_at else None
        })
    
    return result

# Get single fuel claim
@api_router.get('/fuel-expense-claims/{claim_id}', response_model=FuelExpenseClaim)
def get_fuel_claim(
    claim_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get single fuel claim details"""
    claim = db.query(FuelExpenseClaimModel).filter(FuelExpenseClaimModel.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail='Fuel claim not found')
    return claim

# Get all claims for approval grid (Admin & Accountant only)
@api_router.get('/fuel-expense-claims-approval')
def get_all_claims_for_approval(
    status: str = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all claims with calculated fuel cost for approval dashboard"""
    if current_user.role not in ['Admin', 'Accountant']:
        raise HTTPException(status_code=403, detail='Only Admin and Accountant can view approval dashboard')
    
    # Get fuel price for calculations
    fuel_price_row = db.query(SettingsModel).filter(SettingsModel.config_key == 'fuel_price_per_liter').first()
    fuel_price_per_liter = float(fuel_price_row.value) if fuel_price_row else 0
    
    query = db.query(FuelExpenseClaimModel)
    
    # Filter by status if provided
    if status and status != 'All':
        query = query.filter(FuelExpenseClaimModel.claim_status == status)
    
    claims = query.all()
    
    # Sort by date (newest first)
    claims = sorted(claims, key=lambda x: x.created_at, reverse=True) if claims else []
    
    # Format with calculated fuel cost
    result = []
    for claim in claims:
        calculated_cost = (claim.fuel_consumed or 0) * fuel_price_per_liter
        difference = (claim.claimed_amount or 0) - calculated_cost
        
        result.append({
            'id': claim.id,
            'employee_id': claim.employee_id,
            'employee_name': claim.employee_name,
            'vehicle_name': claim.vehicle_name,
            'vehicle_id': claim.vehicle_id,
            'km_driven': claim.km_driven,
            'fuel_consumed': claim.fuel_consumed,
            'claimed_amount': claim.claimed_amount,
            'price_per_liter': claim.price_per_liter,
            'calculated_fuel_cost': round(calculated_cost, 2),
            'difference': round(difference, 2),
            'claim_status': claim.claim_status,
            'approved_amount': claim.approved_amount,
            'is_valid': claim.is_valid,
            'approver_name': claim.approver_name,
            'approval_notes': claim.approval_notes,
            'created_at': claim.created_at.isoformat() if claim.created_at else None,
            'approved_at': claim.approved_at.isoformat() if claim.approved_at else None
        })
    
    return result

# Approve/Reject fuel expense claim
@api_router.post('/fuel-expense-claims/{claim_id}/decide')
def decide_fuel_claim(
    claim_id: str,
    data: FuelExpenseClaimAction,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Approve, Reject, or Partially-Approve a fuel expense claim - Admin & Accountant only"""
    # Only Admin and Accountant can approve claims
    if current_user.role not in ['Admin', 'Accountant']:
        raise HTTPException(status_code=403, detail='Only Admin and Accountant can approve claims')
    
    claim = db.query(FuelExpenseClaimModel).filter(FuelExpenseClaimModel.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail='Fuel claim not found')
    
    if data.claim_status == 'Partially-Approved' and data.approved_amount is None:
        raise HTTPException(status_code=400, detail='approved_amount required for partial approval')
    
    claim.claim_status = data.claim_status
    claim.approver_id = data.approver_id
    claim.approver_name = data.approver_name
    claim.approval_notes = data.approval_notes
    claim.approved_at = datetime.now(timezone.utc)
    
    if data.claim_status == 'Approved':
        claim.approved_amount = claim.claimed_amount
    elif data.claim_status == 'Partially-Approved':
        claim.approved_amount = data.approved_amount
    
    db.commit()
    db.refresh(claim)
    return claim

# ============= VEHICLE SUMMARY & ANALYTICS ENDPOINTS =============

# Get vehicle tracking dashboard summary (for admin)
@api_router.get('/vehicles/dashboard/summary')
def get_vehicle_dashboard_summary(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get vehicle tracking summary for admin dashboard"""
    # Only Admin and Manager can access dashboard
    if current_user.role not in ['Admin', 'Manager']:
        raise HTTPException(status_code=403, detail='Only Admin and Manager can access vehicle dashboard')
    
    # Total metrics
    total_vehicles = db.query(VehicleModel).count()
    active_vehicles = db.query(VehicleModel).filter(VehicleModel.status == 'Active').count()
    total_usages = db.query(VehicleUsageModel).count()
    completed_usages = db.query(VehicleUsageModel).filter(VehicleUsageModel.status == 'Completed').count()
    
    # Fuel expenses
    all_claims = db.query(FuelExpenseClaimModel).all()
    total_claims = len(all_claims)
    approved_claims = [c for c in all_claims if c.claim_status == 'Approved']
    total_approved_amount = sum(c.approved_amount or c.claimed_amount for c in approved_claims)
    pending_claims = [c for c in all_claims if c.claim_status == 'Pending']
    total_pending_amount = sum(c.claimed_amount for c in pending_claims)
    invalid_claims = [c for c in all_claims if not c.is_valid]
    
    # Total distance and fuel
    total_km = sum(u.km_driven or 0 for u in db.query(VehicleUsageModel).all())
    total_fuel = sum(u.fuel_consumed or 0 for u in db.query(VehicleUsageModel).all())
    
    # Get fuel price
    fuel_price_row = db.query(SettingsModel).filter(SettingsModel.config_key == 'fuel_price_per_liter').first()
    fuel_price_per_liter = float(fuel_price_row.value) if fuel_price_row else 0
    
    return {
        'total_vehicles': total_vehicles,
        'active_vehicles': active_vehicles,
        'total_journeys': total_usages,
        'completed_journeys': completed_usages,
        'total_km_driven': round(total_km, 2),
        'total_fuel_used': round(total_fuel, 2),
        'total_claims': total_claims,
        'approved_claims': len(approved_claims),
        'pending_claims': len(pending_claims),
        'invalid_claims': len(invalid_claims),
        'total_approved_amount': round(total_approved_amount, 2),
        'total_pending_amount': round(total_pending_amount, 2),
        'fuel_price_per_liter': fuel_price_per_liter,
        'calculated_fuel_cost': round(total_fuel * fuel_price_per_liter, 2)
    }

# Get employee-wise vehicle usage summary
@api_router.get('/vehicles/dashboard/employee-summary')
def get_employee_vehicle_summary(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get vehicle usage and expenses by employee"""
    # Only Admin and Manager can access dashboard
    if current_user.role not in ['Admin', 'Manager']:
        raise HTTPException(status_code=403, detail='Only Admin and Manager can access vehicle dashboard')
    
    usages = db.query(VehicleUsageModel).all()
    claims = db.query(FuelExpenseClaimModel).all()
    
    # Get fuel price
    fuel_price_row = db.query(SettingsModel).filter(SettingsModel.config_key == 'fuel_price_per_liter').first()
    fuel_price_per_liter = float(fuel_price_row.value) if fuel_price_row else 0
    
    # Group by employee - initialize with usages
    employee_data = {}
    for usage in usages:
        if usage.employee_id not in employee_data:
            employee_data[usage.employee_id] = {
                'employee_name': usage.employee_name,
                'total_journeys': 0,
                'total_km': 0,
                'total_fuel': 0,
                'vehicles_used': set(),
                'total_claimed': 0,
                'total_approved': 0,
                'pending_amount': 0,
                'invalid_claims': 0
            }
        
        employee_data[usage.employee_id]['total_journeys'] += 1
        employee_data[usage.employee_id]['total_km'] += usage.km_driven or 0
        employee_data[usage.employee_id]['total_fuel'] += usage.fuel_consumed or 0
        employee_data[usage.employee_id]['vehicles_used'].add(usage.vehicle_id)
    
    # Add claim information and ensure all employees with claims are included
    for claim in claims:
        if claim.employee_id not in employee_data:
            employee_data[claim.employee_id] = {
                'employee_name': claim.employee_name,
                'total_journeys': 0,
                'total_km': 0,
                'total_fuel': 0,
                'vehicles_used': set(),
                'total_claimed': 0,
                'total_approved': 0,
                'pending_amount': 0,
                'invalid_claims': 0
            }
        
        employee_data[claim.employee_id]['total_claimed'] += claim.claimed_amount
        if claim.claim_status == 'Approved':
            employee_data[claim.employee_id]['total_approved'] += claim.approved_amount or claim.claimed_amount
        elif claim.claim_status == 'Pending':
            employee_data[claim.employee_id]['pending_amount'] += claim.claimed_amount
        if not claim.is_valid:
            employee_data[claim.employee_id]['invalid_claims'] += 1
    
    # Convert to list and format
    result = []
    for emp_id, data in employee_data.items():
        total_fuel = data['total_fuel']
        calculated_fuel_cost = total_fuel * fuel_price_per_liter
        result.append({
            'employee_id': emp_id,
            'employee_name': data['employee_name'],
            'total_journeys': data['total_journeys'],
            'total_km': round(data['total_km'], 2),
            'total_fuel': round(data['total_fuel'], 2),
            'vehicles_used_count': len(data['vehicles_used']),
            'total_claimed_amount': round(data['total_claimed'], 2),
            'total_approved_amount': round(data['total_approved'], 2),
            'pending_amount': round(data['pending_amount'], 2),
            'invalid_claims_count': data['invalid_claims'],
            'calculated_fuel_cost': round(calculated_fuel_cost, 2),
            'fuel_price_per_liter': fuel_price_per_liter
        })
    
    return sorted(result, key=lambda x: x['total_km'], reverse=True)

# Get vehicle-wise usage summary
@api_router.get('/vehicles/dashboard/vehicle-summary')
def get_vehicle_usage_summary(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get vehicle usage statistics"""
    # Only Admin and Manager can access dashboard
    if current_user.role not in ['Admin', 'Manager']:
        raise HTTPException(status_code=403, detail='Only Admin and Manager can access vehicle dashboard')
    
    vehicles = db.query(VehicleModel).all()
    usages = db.query(VehicleUsageModel).all()
    
    # Get fuel price
    fuel_price_row = db.query(SettingsModel).filter(SettingsModel.config_key == 'fuel_price_per_liter').first()
    fuel_price_per_liter = float(fuel_price_row.value) if fuel_price_row else 0
    
    vehicle_data = {}
    for vehicle in vehicles:
        vehicle_data[vehicle.id] = {
            'vehicle_name': vehicle.vehicle_name,
            'vehicle_type': vehicle.vehicle_type,
            'fuel_type': vehicle.fuel_type,
            'registration_number': vehicle.registration_number,
            'milage': vehicle.milage,
            'total_journeys': 0,
            'total_km': 0,
            'total_fuel_used': 0,
            'employees_used': set(),
            'current_meter_reading': vehicle.current_meter_reading or 0,
            'status': vehicle.status
        }
    
    for usage in usages:
        if usage.vehicle_id in vehicle_data:
            vehicle_data[usage.vehicle_id]['total_journeys'] += 1
            vehicle_data[usage.vehicle_id]['total_km'] += usage.km_driven or 0
            vehicle_data[usage.vehicle_id]['total_fuel_used'] += usage.fuel_consumed or 0
            vehicle_data[usage.vehicle_id]['employees_used'].add(usage.employee_id)
    
    result = []
    for v_id, data in vehicle_data.items():
        total_fuel = data['total_fuel_used']
        calculated_fuel_cost = total_fuel * fuel_price_per_liter
        result.append({
            'vehicle_id': v_id,
            'vehicle_name': data['vehicle_name'],
            'vehicle_type': data['vehicle_type'],
            'fuel_type': data['fuel_type'],
            'registration_number': data['registration_number'],
            'milage': data['milage'],
            'total_journeys': data['total_journeys'],
            'total_km': round(data['total_km'], 2),
            'total_fuel_used': round(data['total_fuel_used'], 2),
            'calculated_fuel_cost': round(calculated_fuel_cost, 2),
            'fuel_price_per_liter': fuel_price_per_liter,
            'employees_used_count': len(data['employees_used']),
            'current_meter_reading': round(data['current_meter_reading'], 1),
            'status': data['status']
        })
    
    return sorted(result, key=lambda x: x['total_journeys'], reverse=True)

# Get claim status overview
@api_router.get('/vehicles/dashboard/claim-status')
def get_claim_status_overview(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get claims grouped by status"""
    # Only Admin and Manager can access dashboard
    if current_user.role not in ['Admin', 'Manager']:
        raise HTTPException(status_code=403, detail='Only Admin and Manager can access vehicle dashboard')
    
    claims = db.query(FuelExpenseClaimModel).all()
    
    status_summary = {
        'Pending': {'count': 0, 'total_amount': 0},
        'Approved': {'count': 0, 'total_amount': 0},
        'Rejected': {'count': 0, 'total_amount': 0},
        'Partially-Approved': {'count': 0, 'total_amount': 0}
    }
    
    for claim in claims:
        status = claim.claim_status
        if status in status_summary:
            status_summary[status]['count'] += 1
            status_summary[status]['total_amount'] += claim.approved_amount or claim.claimed_amount
    
    return status_summary

# ============= DASHBOARD ROUTES =============

@api_router.get('/dashboard/stats', response_model=DashboardStats)
def get_dashboard_stats(current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    today = attendance_local_date_str()
    
    total_employees = db.query(EmployeeModel).filter(EmployeeModel.status == 'Active').count()
    present_today = db.query(AttendanceModel).filter(
        AttendanceModel.date == today,
        AttendanceModel.status != 'Absent',
    ).count()
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

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
