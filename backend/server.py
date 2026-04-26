from sqlalchemy import text
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, status, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, String, Float, Integer, DateTime, Text, func, cast, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.exc import IntegrityError
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal, Any, Dict, Tuple
from collections import defaultdict
from datetime import datetime, timezone, timedelta, date
from calendar import monthrange
import jwt
import bcrypt
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import io
import uuid
import json
import re
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import boto3
from botocore.exceptions import ClientError
import pandas as pd
from openpyxl import load_workbook

app = FastAPI()

# CORS
# NOTE: Browsers do NOT allow `allow_origins=["*"]` together with `allow_credentials=True`.
# We use Authorization headers (Bearer tokens), so we can safely allow credentials while
# specifying explicit origins.
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://resoline.in",
    "https://www.resoline.in",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    # Allow any resoline.in subdomain (e.g. crm.resoline.in, staging.resoline.in)
    allow_origin_regex=r"^https?://([a-z0-9-]+\.)*resoline\.in$",
    # We authenticate via Authorization headers (Bearer tokens), not cookies.
    # Keeping credentials disabled avoids wildcard/credential pitfalls and is sufficient.
    allow_credentials=False,
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

# api_router is mounted once at the bottom of this file after all routes are defined.

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
    employee_reason = Column(String(500), nullable=True)
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
    employee_reason = Column(String(500), nullable=True)
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
    # JSON array: [{"id": "...", "file_name": "...", "url": "/uploads/... or https://..."}]
    attachments_json = Column(Text, nullable=True)
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
    flow_meter_make = Column(String(100), nullable=True)
    flow_meter_size = Column(String(200), nullable=True)
    flow_meter_serial = Column(String(200), nullable=True)
    calibration_valid_from = Column(String(10), nullable=True)
    calibration_valid_to = Column(String(10), nullable=True)
    telemetry_applicable = Column(String(10), nullable=True)
    telemetry_company = Column(String(50), nullable=True)
    telemetry_company_other = Column(String(200), nullable=True)
    telemetry_communication_via = Column(String(50), nullable=True)
    telemetry_sim_provider = Column(String(50), nullable=True)
    telemetry_sim_provider_other = Column(String(200), nullable=True)
    telemetry_sim_number = Column(String(100), nullable=True)
    telemetry_sim_valid_from = Column(String(10), nullable=True)
    telemetry_sim_valid_to = Column(String(10), nullable=True)
    telemetry_product_code = Column(String(100), nullable=True)
    telemetry_serial_number = Column(String(200), nullable=True)
    telemetry_portal_url = Column(String(500), nullable=True)
    telemetry_username = Column(String(200), nullable=True)
    telemetry_password = Column(String(255), nullable=True)
    telemetry_valid_from = Column(String(10), nullable=True)
    telemetry_valid_to = Column(String(10), nullable=True)
    telemetry_uploaded_previous_year = Column(String(10), nullable=True)
    telemetry_previous_serial = Column(String(200), nullable=True)
    telemetry_previous_data_available = Column(String(10), nullable=True)
    telemetry_previous_data_from = Column(String(10), nullable=True)
    telemetry_previous_data_to = Column(String(10), nullable=True)
    # JSON blob for per-inventory piezometer details (wizard step 4); schema TBD
    piezometer_details_json = Column(Text, nullable=True)
    remarks = Column(String(1000), nullable=True)
    noc_document_url = Column(String(1000), nullable=True)
    noc_project_name = Column(String(500), nullable=True)
    noc_project_address = Column(String(1000), nullable=True)
    noc_communication_address = Column(String(1000), nullable=True)
    noc_no = Column(String(200), nullable=True)
    noc_application_no = Column(String(200), nullable=True)
    noc_project_status = Column(String(100), nullable=True)  # existing_ground_water | new_ground_water
    noc_type = Column(String(50), nullable=True)  # new | renewal
    noc_valid_from = Column(String(10), nullable=True)  # YYYY-MM-DD
    noc_valid_upto = Column(String(10), nullable=True)  # YYYY-MM-DD
    noc_permitted_m3_per_day = Column(String(100), nullable=True)
    noc_permitted_m3_per_year = Column(String(100), nullable=True)
    noc_existing_bw_count = Column(String(100), nullable=True)
    noc_total_proposed_bw_count = Column(String(100), nullable=True)
    noc_flowmeter_applicable = Column(String(10), nullable=True)  # yes | no
    noc_flowmeter_count = Column(String(100), nullable=True)
    noc_piezometer_applicable = Column(String(10), nullable=True)  # yes | no
    noc_piezometer_count = Column(String(100), nullable=True)
    noc_bhuneer_user_id = Column(String(200), nullable=True)
    noc_bhuneer_password = Column(String(255), nullable=True)
    noc_nocap_user_id = Column(String(200), nullable=True)
    noc_nocap_password = Column(String(255), nullable=True)
    # JSON: {"flow_meter":[{id,file_name,url}], "telemetry":[...], ...}
    cgw_attachments_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class AppSettingModel(Base):
    """Key/value application settings (e.g. CGW renewal digest recipient)."""
    __tablename__ = 'app_settings'
    key = Column(String(100), primary_key=True)
    value = Column(String(2000), nullable=True)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


# Create all tables
Base.metadata.create_all(bind=engine)

SETTING_CGW_DIGEST_EMAIL = 'cgw_renewal_digest_email'
SETTING_CGW_DIGEST_ENABLED = 'cgw_renewal_digest_enabled'


def app_setting_get(db: Session, key: str) -> Optional[str]:
    row = db.query(AppSettingModel).filter(AppSettingModel.key == key).first()
    return row.value if row else None


def app_setting_set(db: Session, key: str, value: Optional[str]):
    """Persist a setting; value None clears to empty string."""
    v = value if value is not None else ''
    row = db.query(AppSettingModel).filter(AppSettingModel.key == key).first()
    now = datetime.now(timezone.utc)
    if row:
        row.value = v
        row.updated_at = now
    else:
        db.add(AppSettingModel(key=key, value=v, updated_at=now))
    db.commit()


def parse_cgw_renewal_date(raw) -> Optional[date]:
    """Parse renewal_date from DB (YYYY-MM-DD, DD/MM/YYYY, etc.)."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', s)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    m = re.match(r'^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$', s)
    if m:
        try:
            d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
            return date(y, mo, d)
        except ValueError:
            return None
    try:
        return datetime.strptime(s[:10], '%Y-%m-%d').date()
    except ValueError:
        pass
    try:
        t = datetime.fromisoformat(s.replace('Z', '+00:00'))
        return t.date()
    except ValueError:
        return None

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

def migrate_late_punch_reason_columns():
    """Add employee_reason column to late punch request tables if missing."""
    from sqlalchemy import text, inspect
    with engine.connect() as conn:
        try:
            inspector = inspect(engine)
            in_cols = [col['name'] for col in inspector.get_columns('late_punch_in_requests')]
            out_cols = [col['name'] for col in inspector.get_columns('late_punch_out_requests')]

            if 'employee_reason' not in in_cols:
                conn.execute(text("ALTER TABLE late_punch_in_requests ADD COLUMN employee_reason VARCHAR(500) NULL"))
            if 'employee_reason' not in out_cols:
                conn.execute(text("ALTER TABLE late_punch_out_requests ADD COLUMN employee_reason VARCHAR(500) NULL"))
            conn.commit()
        except Exception:
            pass

migrate_late_punch_reason_columns()

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


def migrate_customer_attachments_json():
    """Add attachments_json (multiple PDF metadata) to customers if missing."""
    from sqlalchemy import text, inspect
    try:
        inspector = inspect(engine)
        existing_columns = [col['name'] for col in inspector.get_columns('customers')]
        if 'attachments_json' not in existing_columns:
            with engine.connect() as conn:
                if DATABASE_URL.startswith('mysql'):
                    conn.execute(text('ALTER TABLE customers ADD COLUMN attachments_json TEXT NULL'))
                else:
                    conn.execute(text('ALTER TABLE customers ADD COLUMN attachments_json TEXT NULL'))
                conn.commit()
                print('Added column attachments_json to customers table')
    except Exception as e:
        print(f'Migration error for customer attachments_json: {e}')


migrate_customer_attachments_json()


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

def migrate_cgw_flow_metres_product_columns():
    """Add product_code/model_no to cgw_flow_metres and backfill from telemetric_system."""
    from sqlalchemy import text, inspect
    try:
        inspector = inspect(engine)
        existing_columns = [col['name'] for col in inspector.get_columns('cgw_flow_metres')]

        with engine.connect() as conn:
            if 'product_code' not in existing_columns:
                try:
                    conn.execute(text("ALTER TABLE cgw_flow_metres ADD COLUMN product_code VARCHAR(100) NULL"))
                    conn.commit()
                except Exception as alter_err:
                    print(f"Could not add column product_code: {alter_err}")
                    conn.rollback()

            if 'model_no' not in existing_columns:
                try:
                    conn.execute(text("ALTER TABLE cgw_flow_metres ADD COLUMN model_no VARCHAR(100) NULL"))
                    conn.commit()
                except Exception as alter_err:
                    print(f"Could not add column model_no: {alter_err}")
                    conn.rollback()

            # Preserve previously imported data that lived in the old single column.
            if 'telemetric_system' in existing_columns:
                try:
                    conn.execute(text("""
                        UPDATE cgw_flow_metres
                        SET product_code = telemetric_system
                        WHERE (product_code IS NULL OR product_code = '')
                          AND telemetric_system IS NOT NULL
                          AND telemetric_system <> ''
                    """))
                    conn.commit()
                except Exception as update_err:
                    print(f"Could not backfill product_code from telemetric_system: {update_err}")
                    conn.rollback()
    except Exception as e:
        print(f"Migration error for cgw_flow_metres product columns: {e}")

migrate_cgw_flow_metres_product_columns()


def migrate_cgw_flow_metres_noc_columns():
    """Add NOC PDF + metadata columns to cgw_flow_metres if missing."""
    from sqlalchemy import text, inspect
    try:
        inspector = inspect(engine)
        existing = {col['name'] for col in inspector.get_columns('cgw_flow_metres')}
        specs = [
            ('noc_document_url', 'VARCHAR(1000) NULL'),
            ('noc_project_name', 'VARCHAR(500) NULL'),
            ('noc_project_address', 'VARCHAR(1000) NULL'),
            ('noc_communication_address', 'VARCHAR(1000) NULL'),
            ('noc_no', 'VARCHAR(200) NULL'),
            ('noc_application_no', 'VARCHAR(200) NULL'),
            ('noc_project_status', 'VARCHAR(100) NULL'),
            ('noc_type', 'VARCHAR(50) NULL'),
            ('noc_valid_from', 'VARCHAR(10) NULL'),
            ('noc_valid_upto', 'VARCHAR(10) NULL'),
            ('noc_permitted_m3_per_day', 'VARCHAR(100) NULL'),
            ('noc_permitted_m3_per_year', 'VARCHAR(100) NULL'),
            ('noc_existing_bw_count', 'VARCHAR(100) NULL'),
            ('noc_total_proposed_bw_count', 'VARCHAR(100) NULL'),
            ('noc_flowmeter_applicable', 'VARCHAR(10) NULL'),
            ('noc_flowmeter_count', 'VARCHAR(100) NULL'),
            ('noc_piezometer_applicable', 'VARCHAR(10) NULL'),
            ('noc_piezometer_count', 'VARCHAR(100) NULL'),
            ('noc_bhuneer_user_id', 'VARCHAR(200) NULL'),
            ('noc_bhuneer_password', 'VARCHAR(255) NULL'),
            ('noc_nocap_user_id', 'VARCHAR(200) NULL'),
            ('noc_nocap_password', 'VARCHAR(255) NULL'),
        ]
        for col_name, ddl in specs:
            if col_name in existing:
                continue
            with engine.connect() as conn:
                if DATABASE_URL.startswith('mysql'):
                    conn.execute(text(f'ALTER TABLE cgw_flow_metres ADD COLUMN {col_name} {ddl}'))
                else:
                    conn.execute(text(f'ALTER TABLE cgw_flow_metres ADD COLUMN {col_name} {ddl}'))
                conn.commit()
            existing.add(col_name)
            print(f'Added column {col_name} to cgw_flow_metres')
    except Exception as e:
        print(f'Migration error for cgw_flow_metres NOC columns: {e}')


migrate_cgw_flow_metres_noc_columns()


def migrate_cgw_flow_metres_attachments_json():
    """Add cgw_attachments_json for multi-file S3 attachments per inventory row."""
    from sqlalchemy import text, inspect
    try:
        inspector = inspect(engine)
        existing = {col['name'] for col in inspector.get_columns('cgw_flow_metres')}
        if 'cgw_attachments_json' in existing:
            return
        with engine.connect() as conn:
            if DATABASE_URL.startswith('mysql'):
                conn.execute(text('ALTER TABLE cgw_flow_metres ADD COLUMN cgw_attachments_json LONGTEXT NULL'))
            else:
                conn.execute(text('ALTER TABLE cgw_flow_metres ADD COLUMN cgw_attachments_json TEXT NULL'))
            conn.commit()
        print('Added column cgw_attachments_json to cgw_flow_metres')
    except Exception as e:
        print(f'Migration error for cgw_flow_metres cgw_attachments_json: {e}')


migrate_cgw_flow_metres_attachments_json()


def migrate_cgw_flow_metres_flow_metre_details_columns():
    """Add flow metre / calibration / telemetry detail columns to cgw_flow_metres if missing."""
    from sqlalchemy import text, inspect
    try:
        inspector = inspect(engine)
        existing = {col['name'] for col in inspector.get_columns('cgw_flow_metres')}
        specs = [
            ('flow_meter_make', 'VARCHAR(100) NULL'),
            ('flow_meter_size', 'VARCHAR(200) NULL'),
            ('flow_meter_serial', 'VARCHAR(200) NULL'),
            ('calibration_valid_from', 'VARCHAR(10) NULL'),
            ('calibration_valid_to', 'VARCHAR(10) NULL'),
            ('telemetry_applicable', 'VARCHAR(10) NULL'),
            ('telemetry_company', 'VARCHAR(50) NULL'),
            ('telemetry_company_other', 'VARCHAR(200) NULL'),
            ('telemetry_communication_via', 'VARCHAR(50) NULL'),
            ('telemetry_sim_provider', 'VARCHAR(50) NULL'),
            ('telemetry_sim_provider_other', 'VARCHAR(200) NULL'),
            ('telemetry_sim_number', 'VARCHAR(100) NULL'),
            ('telemetry_sim_valid_from', 'VARCHAR(10) NULL'),
            ('telemetry_sim_valid_to', 'VARCHAR(10) NULL'),
            ('telemetry_product_code', 'VARCHAR(100) NULL'),
            ('telemetry_serial_number', 'VARCHAR(200) NULL'),
            ('telemetry_valid_from', 'VARCHAR(10) NULL'),
            ('telemetry_valid_to', 'VARCHAR(10) NULL'),
            ('telemetry_uploaded_previous_year', 'VARCHAR(10) NULL'),
            ('telemetry_previous_serial', 'VARCHAR(200) NULL'),
            ('telemetry_previous_data_available', 'VARCHAR(10) NULL'),
            ('telemetry_previous_data_from', 'VARCHAR(10) NULL'),
            ('telemetry_previous_data_to', 'VARCHAR(10) NULL'),
        ]
        for col_name, ddl in specs:
            if col_name in existing:
                continue
            with engine.connect() as conn:
                if DATABASE_URL.startswith('mysql'):
                    conn.execute(text(f'ALTER TABLE cgw_flow_metres ADD COLUMN {col_name} {ddl}'))
                else:
                    conn.execute(text(f'ALTER TABLE cgw_flow_metres ADD COLUMN {col_name} {ddl}'))
                conn.commit()
            existing.add(col_name)
            print(f'Added column {col_name} to cgw_flow_metres')
    except Exception as e:
        print(f'Migration error for cgw_flow_metres flow metre details: {e}')


migrate_cgw_flow_metres_flow_metre_details_columns()


def migrate_cgw_flow_metres_piezometer_details_json():
    """Add piezometer_details_json to cgw_flow_metres if missing."""
    from sqlalchemy import text, inspect
    try:
        inspector = inspect(engine)
        existing = {col['name'] for col in inspector.get_columns('cgw_flow_metres')}
        if 'piezometer_details_json' in existing:
            return
        ddl = 'LONGTEXT NULL' if DATABASE_URL.startswith('mysql') else 'TEXT NULL'
        with engine.connect() as conn:
            conn.execute(text(f'ALTER TABLE cgw_flow_metres ADD COLUMN piezometer_details_json {ddl}'))
            conn.commit()
        print('Added column piezometer_details_json to cgw_flow_metres')
    except Exception as e:
        print(f'Migration error for piezometer_details_json: {e}')


migrate_cgw_flow_metres_piezometer_details_json()


def migrate_cgw_flow_metres_telemetry_portal_columns():
    """Add telemetry portal URL / login columns to cgw_flow_metres if missing."""
    from sqlalchemy import text, inspect
    try:
        inspector = inspect(engine)
        existing = {col['name'] for col in inspector.get_columns('cgw_flow_metres')}
        specs = [
            ('telemetry_portal_url', 'VARCHAR(500) NULL'),
            ('telemetry_username', 'VARCHAR(200) NULL'),
            ('telemetry_password', 'VARCHAR(255) NULL'),
        ]
        for col_name, ddl in specs:
            if col_name in existing:
                continue
            with engine.connect() as conn:
                if DATABASE_URL.startswith('mysql'):
                    conn.execute(text(f'ALTER TABLE cgw_flow_metres ADD COLUMN {col_name} {ddl}'))
                else:
                    conn.execute(text(f'ALTER TABLE cgw_flow_metres ADD COLUMN {col_name} {ddl}'))
                conn.commit()
            existing.add(col_name)
            print(f'Added column {col_name} to cgw_flow_metres')
    except Exception as e:
        print(f'Migration error for telemetry portal columns: {e}')


migrate_cgw_flow_metres_telemetry_portal_columns()

# Seed default roles (Admin cannot be edited/deleted; others can)
DEFAULT_PERMISSION_KEYS = [
    "dashboard", "leads", "employees", "attendance", "monthly-report", "leaves", "expenses",
    "roles", "workspace", "idcards", "documents", "settings", "holidays", "tasks", "customers", "cgw-flow-metre", "vehicles"
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


def migrate_grant_monthly_report_to_employee_role():
    """Ensure the Employee role includes monthly-report (new screen); other roles stay as configured in DB."""
    db = SessionLocal()
    try:
        emp = db.query(RoleModel).filter(RoleModel.name == 'Employee').first()
        if not emp or not emp.permissions:
            return
        try:
            perms = json.loads(emp.permissions) if isinstance(emp.permissions, str) else list(emp.permissions or [])
        except Exception:
            perms = []
        if 'monthly-report' not in perms:
            perms.append('monthly-report')
            emp.permissions = json.dumps(perms)
            db.commit()
    finally:
        db.close()


migrate_grant_monthly_report_to_employee_role()

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
    status: Literal['Active', 'Inactive'] = 'Active'
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


class CustomerAttachment(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: str
    file_name: str
    url: str


class Customer(BaseModel):
    # Required so FastAPI/Pydantic read ORM-only fields set on the instance (e.g. attachments, contacts).
    model_config = ConfigDict(extra="ignore", from_attributes=True)
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
    attachments: Optional[List[CustomerAttachment]] = None
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


def _punch_time_to_minutes(value: Optional[str]) -> Optional[int]:
    """Parse HH:MM or HH:MM:SS to minutes since midnight; None if invalid."""
    if not value or not isinstance(value, str):
        return None
    parts = value.strip().split(':')
    if len(parts) < 2:
        return None
    try:
        h = int(parts[0])
        m = int(parts[1])
        return h * 60 + m
    except ValueError:
        return None


class LatePunchInRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", from_attributes=True)
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    attendance_id: str
    employee_id: str
    employee_name: str
    punch_in_time: str
    minutes_late: int
    status: Literal['Pending', 'Approved', 'Rejected'] = 'Pending'
    employee_reason: Optional[str] = None
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
    employee_reason: Optional[str] = None
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
    late_reason: Optional[str] = None

class AttendanceSummary(BaseModel):
    employee_id: str
    employee_name: str
    total_days: int
    present_days: int
    absent_days: int
    late_days: int
    half_day_days: int

class Leave(BaseModel):
    model_config = ConfigDict(extra="ignore", from_attributes=True)
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


class UserEmailUpdate(BaseModel):
    email: EmailStr


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

class CgwFileAttachment(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: str
    file_name: str
    url: str


CGW_MEDIA_ATTACHMENT_KEYS = (
    'flow_meter',
    'telemetry',
    'bw_geo_flowmeter',
    'service_report',
    'calibration_certificate',
    'tax_invoice',
    'telemetry_excel_prior',
    'telemetry_service_prior',
    'piezometer_bw',
    'piezometer_calibration',
    'piezometer_telemetry',
    'piezometer_excel_prior',
    'piezometer_service_report',
    'water_quality_certificate',
    'cte',
    'cto',
    'rwss_watco_phed_noc',
    'approval_letter',
    'rain_water_harvesting_data',
    'additional_doc',
)


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
    status: Optional[str] = 'Active'
    renewal_date: Optional[str] = None
    review: Optional[str] = None
    calibration_certificate: Optional[str] = None
    flow_meter_make: Optional[str] = None
    flow_meter_size: Optional[str] = None
    flow_meter_serial: Optional[str] = None
    calibration_valid_from: Optional[str] = None
    calibration_valid_to: Optional[str] = None
    telemetry_applicable: Optional[str] = None
    telemetry_company: Optional[str] = None
    telemetry_company_other: Optional[str] = None
    telemetry_communication_via: Optional[str] = None
    telemetry_sim_provider: Optional[str] = None
    telemetry_sim_provider_other: Optional[str] = None
    telemetry_sim_number: Optional[str] = None
    telemetry_sim_valid_from: Optional[str] = None
    telemetry_sim_valid_to: Optional[str] = None
    telemetry_product_code: Optional[str] = None
    telemetry_serial_number: Optional[str] = None
    telemetry_portal_url: Optional[str] = None
    telemetry_username: Optional[str] = None
    telemetry_password: Optional[str] = None
    telemetry_valid_from: Optional[str] = None
    telemetry_valid_to: Optional[str] = None
    telemetry_uploaded_previous_year: Optional[str] = None
    telemetry_previous_serial: Optional[str] = None
    telemetry_previous_data_available: Optional[str] = None
    telemetry_previous_data_from: Optional[str] = None
    telemetry_previous_data_to: Optional[str] = None
    piezometer_details_json: Optional[str] = None
    remarks: Optional[str] = None
    noc_document_url: Optional[str] = None
    noc_project_name: Optional[str] = None
    noc_project_address: Optional[str] = None
    noc_communication_address: Optional[str] = None
    noc_no: Optional[str] = None
    noc_application_no: Optional[str] = None
    noc_project_status: Optional[str] = None
    noc_type: Optional[str] = None
    noc_valid_from: Optional[str] = None
    noc_valid_upto: Optional[str] = None
    noc_permitted_m3_per_day: Optional[str] = None
    noc_permitted_m3_per_year: Optional[str] = None
    noc_existing_bw_count: Optional[str] = None
    noc_total_proposed_bw_count: Optional[str] = None
    noc_flowmeter_applicable: Optional[str] = None
    noc_flowmeter_count: Optional[str] = None
    noc_piezometer_applicable: Optional[str] = None
    noc_piezometer_count: Optional[str] = None
    noc_bhuneer_user_id: Optional[str] = None
    noc_bhuneer_password: Optional[str] = None
    noc_nocap_user_id: Optional[str] = None
    noc_nocap_password: Optional[str] = None
    cgw_attachments: Optional[Dict[str, List[CgwFileAttachment]]] = None
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
    status: Optional[str] = 'Active'
    renewal_date: Optional[str] = None
    review: Optional[str] = None
    remarks: Optional[str] = None
    flow_meter_make: Optional[str] = None
    flow_meter_size: Optional[str] = None
    flow_meter_serial: Optional[str] = None
    calibration_valid_from: Optional[str] = None
    calibration_valid_to: Optional[str] = None
    telemetry_applicable: Optional[str] = None
    telemetry_company: Optional[str] = None
    telemetry_company_other: Optional[str] = None
    telemetry_communication_via: Optional[str] = None
    telemetry_sim_provider: Optional[str] = None
    telemetry_sim_provider_other: Optional[str] = None
    telemetry_sim_number: Optional[str] = None
    telemetry_sim_valid_from: Optional[str] = None
    telemetry_sim_valid_to: Optional[str] = None
    telemetry_product_code: Optional[str] = None
    telemetry_serial_number: Optional[str] = None
    telemetry_portal_url: Optional[str] = None
    telemetry_username: Optional[str] = None
    telemetry_password: Optional[str] = None
    telemetry_valid_from: Optional[str] = None
    telemetry_valid_to: Optional[str] = None
    telemetry_uploaded_previous_year: Optional[str] = None
    telemetry_previous_serial: Optional[str] = None
    telemetry_previous_data_available: Optional[str] = None
    telemetry_previous_data_from: Optional[str] = None
    telemetry_previous_data_to: Optional[str] = None
    piezometer_details_json: Optional[str] = None

class CGWFlowMetreEquipmentLine(BaseModel):
    equipment_name: Optional[str] = None
    flowmeter_details: Optional[str] = None
    product_code: Optional[str] = None
    model_no: Optional[str] = None
    flow_meter_make: Optional[str] = None
    flow_meter_size: Optional[str] = None
    flow_meter_serial: Optional[str] = None
    calibration_valid_from: Optional[str] = None
    calibration_valid_to: Optional[str] = None
    telemetry_applicable: Optional[str] = None
    telemetry_company: Optional[str] = None
    telemetry_company_other: Optional[str] = None
    telemetry_communication_via: Optional[str] = None
    telemetry_sim_provider: Optional[str] = None
    telemetry_sim_provider_other: Optional[str] = None
    telemetry_sim_number: Optional[str] = None
    telemetry_sim_valid_from: Optional[str] = None
    telemetry_sim_valid_to: Optional[str] = None
    telemetry_product_code: Optional[str] = None
    telemetry_serial_number: Optional[str] = None
    telemetry_portal_url: Optional[str] = None
    telemetry_username: Optional[str] = None
    telemetry_password: Optional[str] = None
    telemetry_valid_from: Optional[str] = None
    telemetry_valid_to: Optional[str] = None
    telemetry_uploaded_previous_year: Optional[str] = None
    telemetry_previous_serial: Optional[str] = None
    telemetry_previous_data_available: Optional[str] = None
    telemetry_previous_data_from: Optional[str] = None
    telemetry_previous_data_to: Optional[str] = None
    piezometer_details_json: Optional[str] = None

class CGWFlowMetreBulkCreate(BaseModel):
    customer_id: str
    customer_name: str
    location: Optional[str] = None
    contact_person: Optional[str] = None
    system_mobile_number: Optional[str] = None
    person_mobile_number: Optional[str] = None
    email_id: Optional[str] = None
    date_of_commissioning: Optional[str] = None
    url_link: Optional[str] = None
    user_id: Optional[str] = None
    password: Optional[str] = None
    status: Optional[str] = 'Active'
    renewal_date: Optional[str] = None
    review: Optional[str] = None
    remarks: Optional[str] = None
    equipments: List[CGWFlowMetreEquipmentLine] = Field(default_factory=list)

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
    status: Optional[str] = None
    renewal_date: Optional[str] = None
    review: Optional[str] = None
    remarks: Optional[str] = None
    noc_document_url: Optional[str] = None
    noc_project_name: Optional[str] = None
    noc_project_address: Optional[str] = None
    noc_communication_address: Optional[str] = None
    noc_no: Optional[str] = None
    noc_application_no: Optional[str] = None
    noc_project_status: Optional[str] = None
    noc_type: Optional[str] = None
    noc_valid_from: Optional[str] = None
    noc_valid_upto: Optional[str] = None
    noc_permitted_m3_per_day: Optional[str] = None
    noc_permitted_m3_per_year: Optional[str] = None
    noc_existing_bw_count: Optional[str] = None
    noc_total_proposed_bw_count: Optional[str] = None
    noc_flowmeter_applicable: Optional[str] = None
    noc_flowmeter_count: Optional[str] = None
    noc_piezometer_applicable: Optional[str] = None
    noc_piezometer_count: Optional[str] = None
    noc_bhuneer_user_id: Optional[str] = None
    noc_bhuneer_password: Optional[str] = None
    noc_nocap_user_id: Optional[str] = None
    noc_nocap_password: Optional[str] = None
    flow_meter_make: Optional[str] = None
    flow_meter_size: Optional[str] = None
    flow_meter_serial: Optional[str] = None
    calibration_valid_from: Optional[str] = None
    calibration_valid_to: Optional[str] = None
    telemetry_applicable: Optional[str] = None
    telemetry_company: Optional[str] = None
    telemetry_company_other: Optional[str] = None
    telemetry_communication_via: Optional[str] = None
    telemetry_sim_provider: Optional[str] = None
    telemetry_sim_provider_other: Optional[str] = None
    telemetry_sim_number: Optional[str] = None
    telemetry_sim_valid_from: Optional[str] = None
    telemetry_sim_valid_to: Optional[str] = None
    telemetry_product_code: Optional[str] = None
    telemetry_serial_number: Optional[str] = None
    telemetry_portal_url: Optional[str] = None
    telemetry_username: Optional[str] = None
    telemetry_password: Optional[str] = None
    telemetry_valid_from: Optional[str] = None
    telemetry_valid_to: Optional[str] = None
    telemetry_uploaded_previous_year: Optional[str] = None
    telemetry_previous_serial: Optional[str] = None
    telemetry_previous_data_available: Optional[str] = None
    telemetry_previous_data_from: Optional[str] = None
    telemetry_previous_data_to: Optional[str] = None
    piezometer_details_json: Optional[str] = None

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
    Upload file to S3 and return the public URL when credentials and bucket are set.
    If S3 is not configured, save under UPLOAD_DIR and return a /uploads/... URL (same mount as StaticFiles).
    """
    if not USE_S3 or not s3_client:
        try:
            parts = [p for p in str(folder).replace('\\', '/').split('/') if p and p not in ('..', '.')]
            safe_folder = '/'.join(parts) if parts else 'uploads'
            dest_dir = UPLOAD_DIR / safe_folder.replace('/', os.sep)
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest_path = dest_dir / Path(filename).name
            with open(dest_path, 'wb') as out:
                out.write(file_content)
            return f'/uploads/{safe_folder}/{Path(filename).name}'
        except OSError as e:
            logging.error('Local file upload error: %s', e)
            return None

    try:
        # Create S3 key with folder prefix
        s3_key = f"{folder}/{uuid.uuid4()}/{filename}"
        
        ext = Path(filename).suffix.lower()
        if ext == '.pdf':
            content_type = 'application/pdf'
        elif ext in ('.png',):
            content_type = 'image/png'
        elif ext in ('.jpg', '.jpeg'):
            content_type = 'image/jpeg'
        elif ext == '.gif':
            content_type = 'image/gif'
        elif ext == '.webp':
            content_type = 'image/webp'
        else:
            content_type = 'application/octet-stream'
        # Upload to S3
        s3_client.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=s3_key,
            Body=file_content,
            ContentType=content_type,
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

    # Block login for users linked to an inactive employee profile.
    if user.employee_id:
        employee = db.query(EmployeeModel).filter(
            EmployeeModel.employee_id == user.employee_id
        ).first()
        if employee and employee.status == 'Inactive':
            raise HTTPException(status_code=403, detail='Your employee account is inactive. Please contact HR/Admin.')
    
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
        status=emp_data.status,
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

def _customer_attachments_from_db(customer: CustomerModel) -> List[dict]:
    raw = getattr(customer, 'attachments_json', None)
    if raw is None or raw == '':
        return []
    if isinstance(raw, list):
        return raw if all(isinstance(x, dict) for x in raw) else []
    if isinstance(raw, dict):
        return [raw] if raw.get('id') and raw.get('url') else []
    if isinstance(raw, (bytes, bytearray)):
        try:
            raw = raw.decode('utf-8')
        except Exception:
            return []
    if not isinstance(raw, str):
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _customer_delete_attachment_files(items: List[dict]) -> None:
    for item in items:
        url = (item or {}).get('url') or ''
        if url.startswith('/uploads/'):
            rel = url.replace('/uploads/', '', 1)
            fp = UPLOAD_DIR / rel
            try:
                if fp.is_file():
                    fp.unlink()
            except Exception as ex:
                logging.warning('Could not delete local customer attachment %s: %s', fp, ex)
        elif url and USE_S3:
            try:
                delete_from_s3(url)
            except Exception:
                pass


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
    new_customer.attachments = _customer_attachments_from_db(new_customer)
    
    return new_customer

@api_router.get('/customers', response_model=List[Customer])
def get_customers(current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    customers = db.query(CustomerModel).filter(CustomerModel.status == 'Active').all()
    
    # Attach contacts and addresses
    for customer in customers:
        customer.contacts = db.query(CustomerContactModel).filter(CustomerContactModel.customer_id == customer.id).all()
        customer.addresses = db.query(CustomerAddressModel).filter(CustomerAddressModel.customer_id == customer.id).all()
        customer.attachments = _customer_attachments_from_db(customer)
    
    return customers

@api_router.get('/customers/{customer_id}', response_model=Customer)
def get_customer(customer_id: str, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    customer = db.query(CustomerModel).filter(CustomerModel.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail='Customer not found')
    
    # Attach contacts and addresses
    customer.contacts = db.query(CustomerContactModel).filter(CustomerContactModel.customer_id == customer.id).all()
    customer.addresses = db.query(CustomerAddressModel).filter(CustomerAddressModel.customer_id == customer.id).all()
    customer.attachments = _customer_attachments_from_db(customer)
    
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
    customer.attachments = _customer_attachments_from_db(customer)

    return customer


@api_router.post('/customers/{customer_id}/attachments', response_model=List[CustomerAttachment])
def upload_customer_pdf_attachment(
    customer_id: str,
    file: UploadFile = File(...),
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload one PDF to S3 and append URL to customer.attachments_json (same pattern as /documents/upload)."""
    customer = db.query(CustomerModel).filter(CustomerModel.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail='Customer not found')
    if not file.filename:
        raise HTTPException(status_code=400, detail='No file provided')
    fn_lower = file.filename.lower()
    if not fn_lower.endswith('.pdf'):
        raise HTTPException(status_code=400, detail='Only PDF files are allowed')

    file_content = file.file.read()
    if len(file_content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail='PDF must be 25 MB or smaller')

    safe_base = Path(file.filename).name.replace('..', '_').replace('/', '_') or 'document.pdf'
    new_filename = f'customer_{uuid.uuid4().hex}.pdf'

    # S3 required (no local fallback) — same as document upload
    attachment_url = upload_to_s3(file_content, new_filename, folder='customers')
    if not attachment_url:
        raise HTTPException(
            status_code=503,
            detail='File upload service is temporarily unavailable. Please try again in a few moments.',
        )

    items = _customer_attachments_from_db(customer)
    att_id = str(uuid.uuid4())
    items.append({'id': att_id, 'file_name': safe_base, 'url': attachment_url})
    customer.attachments_json = json.dumps(items)
    customer.updated_at = datetime.now()
    flag_modified(customer, 'attachments_json')
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logging.exception('Failed to persist customer NOC metadata for %s', customer_id)
        raise HTTPException(status_code=500, detail='Could not save attachment to customer record') from e
    db.refresh(customer)
    return [CustomerAttachment.model_validate(x) for x in items]


@api_router.delete('/customers/{customer_id}/attachments/{attachment_id}', response_model=List[CustomerAttachment])
def delete_customer_pdf_attachment(
    customer_id: str,
    attachment_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    customer = db.query(CustomerModel).filter(CustomerModel.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail='Customer not found')
    items = _customer_attachments_from_db(customer)
    removed = [x for x in items if x.get('id') == attachment_id]
    if not removed:
        raise HTTPException(status_code=404, detail='Attachment not found')
    _customer_delete_attachment_files(removed)
    new_items = [x for x in items if x.get('id') != attachment_id]
    customer.attachments_json = json.dumps(new_items) if new_items else None
    customer.updated_at = datetime.now()
    flag_modified(customer, 'attachments_json')
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logging.exception('Failed to persist customer NOC delete for %s', customer_id)
        raise HTTPException(status_code=500, detail='Could not update customer attachments') from e
    db.refresh(customer)
    return [CustomerAttachment.model_validate(x) for x in new_items]


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
    _customer_delete_attachment_files(_customer_attachments_from_db(customer))
    
    db.delete(customer)
    db.commit()
    
    return {'message': 'Customer deleted successfully'}

# ============= CGW FLOW METRE INVENTORY =============

_CGW_MEDIA_ALLOWED_EXT = frozenset({'.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif'})
_CGW_MEDIA_EXCEL_EXT = frozenset({'.xlsx', '.xls', '.csv'})


def _cgw_media_allowed_extensions_for_category(category: str) -> frozenset:
    if category in ('telemetry_excel_prior', 'piezometer_excel_prior'):
        return _CGW_MEDIA_EXCEL_EXT
    if category == 'additional_doc':
        return _CGW_MEDIA_ALLOWED_EXT | _CGW_MEDIA_EXCEL_EXT
    return _CGW_MEDIA_ALLOWED_EXT


def _cgw_media_buckets_empty() -> Dict[str, List[dict]]:
    return {k: [] for k in CGW_MEDIA_ATTACHMENT_KEYS}


def _cgw_media_buckets_from_stored_json(item: CGWFlowMetreModel) -> Dict[str, List[dict]]:
    buckets = _cgw_media_buckets_empty()
    raw = getattr(item, 'cgw_attachments_json', None)
    if not raw:
        return buckets
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
        if isinstance(data, dict):
            for k in CGW_MEDIA_ATTACHMENT_KEYS:
                v = data.get(k)
                if isinstance(v, list):
                    buckets[k] = [x for x in v if isinstance(x, dict) and x.get('id') and x.get('url')]
    except Exception:
        pass
    return buckets


def _cgw_media_buckets_for_api(item: CGWFlowMetreModel) -> Dict[str, List[dict]]:
    """Stored JSON plus legacy single calibration_certificate URL for API display."""
    buckets = _cgw_media_buckets_from_stored_json(item)
    if not buckets['calibration_certificate']:
        leg = (getattr(item, 'calibration_certificate', None) or '').strip()
        if leg:
            buckets['calibration_certificate'] = [
                {'id': 'legacy-calibration', 'file_name': 'Legacy calibration file', 'url': leg}
            ]
    return buckets


def _hydrate_cgw_flow_metre_attachments(item: CGWFlowMetreModel) -> None:
    setattr(item, 'cgw_attachments', _cgw_media_buckets_for_api(item))


def _cgw_persist_media_buckets(item: CGWFlowMetreModel, buckets: Dict[str, List[dict]]) -> None:
    clean = {k: [x for x in buckets.get(k, []) if x.get('id') != 'legacy-calibration'] for k in CGW_MEDIA_ATTACHMENT_KEYS}
    has_any = any(len(clean[k]) > 0 for k in CGW_MEDIA_ATTACHMENT_KEYS)
    item.cgw_attachments_json = json.dumps(clean) if has_any else None
    flag_modified(item, 'cgw_attachments_json')


def _cgw_delete_stored_attachment_file(url: str) -> None:
    if not url:
        return
    if url.startswith('/uploads/'):
        rel = url.replace('/uploads/', '', 1)
        fp = UPLOAD_DIR / rel
        try:
            if fp.is_file():
                fp.unlink()
        except Exception as ex:
            logging.warning('Could not delete local CGW attachment %s: %s', fp, ex)
    elif USE_S3 and S3_BUCKET_NAME and S3_BUCKET_NAME in url:
        try:
            delete_from_s3(url)
        except Exception:
            pass


@api_router.post('/cgw-flow-metres/bulk', response_model=List[CGWFlowMetre])
def create_cgw_flow_metres_bulk(
    data: CGWFlowMetreBulkCreate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in ['Admin', 'HR']:
        raise HTTPException(status_code=403, detail='Not authorized')

    if not data.equipments:
        raise HTTPException(status_code=400, detail='At least one equipment row is required')

    max_inv_num = db.query(
        func.max(cast(func.substr(CGWFlowMetreModel.inventory_id, 4), Integer))
    ).scalar()
    next_inv_num = (max_inv_num or 0) + 1

    new_items: List[CGWFlowMetreModel] = []
    for eq in data.equipments:
        inv_id = f'INV{str(next_inv_num).zfill(4)}'
        next_inv_num += 1

        new_items.append(CGWFlowMetreModel(
            inventory_id=inv_id,
            customer_id=data.customer_id,
            customer_name=data.customer_name,
            location=data.location,
            contact_person=data.contact_person,
            equipment_name=eq.equipment_name,
            flowmeter_details=eq.flowmeter_details,
            product_code=eq.product_code,
            model_no=eq.model_no,
            flow_meter_make=eq.flow_meter_make,
            flow_meter_size=eq.flow_meter_size,
            flow_meter_serial=eq.flow_meter_serial,
            calibration_valid_from=eq.calibration_valid_from,
            calibration_valid_to=eq.calibration_valid_to,
            telemetry_applicable=eq.telemetry_applicable,
            telemetry_company=eq.telemetry_company,
            telemetry_company_other=eq.telemetry_company_other,
            telemetry_communication_via=eq.telemetry_communication_via,
            telemetry_sim_provider=eq.telemetry_sim_provider,
            telemetry_sim_provider_other=eq.telemetry_sim_provider_other,
            telemetry_sim_number=eq.telemetry_sim_number,
            telemetry_sim_valid_from=eq.telemetry_sim_valid_from,
            telemetry_sim_valid_to=eq.telemetry_sim_valid_to,
            telemetry_product_code=eq.telemetry_product_code,
            telemetry_serial_number=eq.telemetry_serial_number,
            telemetry_portal_url=eq.telemetry_portal_url,
            telemetry_username=eq.telemetry_username,
            telemetry_password=eq.telemetry_password,
            telemetry_valid_from=eq.telemetry_valid_from,
            telemetry_valid_to=eq.telemetry_valid_to,
            telemetry_uploaded_previous_year=eq.telemetry_uploaded_previous_year,
            telemetry_previous_serial=eq.telemetry_previous_serial,
            telemetry_previous_data_available=eq.telemetry_previous_data_available,
            telemetry_previous_data_from=eq.telemetry_previous_data_from,
            telemetry_previous_data_to=eq.telemetry_previous_data_to,
            piezometer_details_json=eq.piezometer_details_json,
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
        ))

    db.add_all(new_items)
    try:
        db.commit()
        for item in new_items:
            db.refresh(item)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail='One or more inventory items already exist')

    for it in new_items:
        _hydrate_cgw_flow_metre_attachments(it)
    return new_items

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
        # UI sends `product_code` + `model_no`; the DB does not have `telemetric_system`.
        product_code=data.product_code,
        model_no=data.model_no,
        flow_meter_make=data.flow_meter_make,
        flow_meter_size=data.flow_meter_size,
        flow_meter_serial=data.flow_meter_serial,
        calibration_valid_from=data.calibration_valid_from,
        calibration_valid_to=data.calibration_valid_to,
        telemetry_applicable=data.telemetry_applicable,
        telemetry_company=data.telemetry_company,
        telemetry_company_other=data.telemetry_company_other,
        telemetry_communication_via=data.telemetry_communication_via,
        telemetry_sim_provider=data.telemetry_sim_provider,
        telemetry_sim_provider_other=data.telemetry_sim_provider_other,
        telemetry_sim_number=data.telemetry_sim_number,
        telemetry_sim_valid_from=data.telemetry_sim_valid_from,
        telemetry_sim_valid_to=data.telemetry_sim_valid_to,
        telemetry_product_code=data.telemetry_product_code,
        telemetry_serial_number=data.telemetry_serial_number,
        telemetry_portal_url=data.telemetry_portal_url,
        telemetry_username=data.telemetry_username,
        telemetry_password=data.telemetry_password,
        telemetry_valid_from=data.telemetry_valid_from,
        telemetry_valid_to=data.telemetry_valid_to,
        telemetry_uploaded_previous_year=data.telemetry_uploaded_previous_year,
        telemetry_previous_serial=data.telemetry_previous_serial,
        telemetry_previous_data_available=data.telemetry_previous_data_available,
        telemetry_previous_data_from=data.telemetry_previous_data_from,
        telemetry_previous_data_to=data.telemetry_previous_data_to,
        piezometer_details_json=data.piezometer_details_json,
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

    _hydrate_cgw_flow_metre_attachments(new_item)
    return new_item

@api_router.get('/cgw-flow-metres', response_model=List[CGWFlowMetre])
def get_cgw_flow_metres(current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.query(CGWFlowMetreModel).all()
    for it in items:
        _hydrate_cgw_flow_metre_attachments(it)
    return items

@api_router.get('/cgw-flow-metres/{inventory_id}', response_model=CGWFlowMetre)
def get_cgw_flow_metre(inventory_id: str, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.query(CGWFlowMetreModel).filter(CGWFlowMetreModel.id == inventory_id).first()
    if not item:
        raise HTTPException(status_code=404, detail='Inventory item not found')
    _hydrate_cgw_flow_metre_attachments(item)
    return item

@api_router.get('/cgw-flow-metres/customer/{customer_id}', response_model=List[CGWFlowMetre])
def get_cgw_by_customer(customer_id: str, current_user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.query(CGWFlowMetreModel).filter(CGWFlowMetreModel.customer_id == customer_id).all()
    for it in items:
        _hydrate_cgw_flow_metre_attachments(it)
    return items


@api_router.get('/cgw-flow-metres/customer/{customer_id}/telemetry-serial-options')
def cgw_telemetry_serial_options(
    customer_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Distinct telemetry serial values for this customer (for prior-year serial dropdown)."""
    rows = db.query(CGWFlowMetreModel).filter(CGWFlowMetreModel.customer_id == customer_id).all()
    found: set = set()
    for it in rows:
        for col in ('telemetry_serial_number', 'telemetry_previous_serial'):
            v = (getattr(it, col, None) or '').strip()
            if v:
                found.add(v)
    return {'serials': sorted(found)}


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

    _hydrate_cgw_flow_metre_attachments(item)
    return item


@api_router.post('/cgw-flow-metres/{inventory_id}/media-attachments', response_model=CGWFlowMetre)
def cgw_upload_media_attachment(
    inventory_id: str,
    category: str = Form(...),
    file: UploadFile = File(...),
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Append one photo/PDF to the given attachment bucket (S3 required)."""
    if current_user.role not in ['Admin', 'HR']:
        raise HTTPException(status_code=403, detail='Not authorized')
    if not USE_S3 or not s3_client:
        raise HTTPException(
            status_code=503,
            detail='S3 must be configured to upload CGW flow metre attachments.',
        )
    if category not in CGW_MEDIA_ATTACHMENT_KEYS:
        raise HTTPException(
            status_code=400,
            detail=f'Invalid category. Use one of: {", ".join(CGW_MEDIA_ATTACHMENT_KEYS)}',
        )

    item = db.query(CGWFlowMetreModel).filter(CGWFlowMetreModel.id == inventory_id).first()
    if not item:
        raise HTTPException(status_code=404, detail='Inventory item not found')
    if not file.filename:
        raise HTTPException(status_code=400, detail='No file provided')

    ext = Path(file.filename).suffix.lower()
    allowed_ext = _cgw_media_allowed_extensions_for_category(category)
    if ext not in allowed_ext:
        if category in ('telemetry_excel_prior', 'piezometer_excel_prior'):
            detail = 'Allowed file types for Excel upload: XLSX, XLS, CSV'
        else:
            detail = 'Allowed file types: PDF, JPG, JPEG, PNG, WEBP, GIF'
        raise HTTPException(status_code=400, detail=detail)

    file_content = file.file.read()
    if len(file_content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail='File must be 25 MB or smaller')

    safe_base = Path(file.filename).name.replace('..', '_').replace('/', '_') or f'file{ext}'
    new_filename = f'{inventory_id}_{uuid.uuid4().hex}_{safe_base}'
    file_url = upload_to_s3(file_content, new_filename, folder='cgw_media')
    if not file_url:
        raise HTTPException(
            status_code=503,
            detail='File upload service is temporarily unavailable. Please try again in a few moments.',
        )

    buckets = _cgw_media_buckets_from_stored_json(item)
    if category == 'calibration_certificate' and (getattr(item, 'calibration_certificate', None) or '').strip():
        item.calibration_certificate = None
    buckets[category].append({'id': str(uuid.uuid4()), 'file_name': safe_base, 'url': file_url})
    _cgw_persist_media_buckets(item, buckets)
    item.updated_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logging.exception('Failed to save CGW media attachment for %s', inventory_id)
        raise HTTPException(status_code=500, detail='Could not save attachment metadata') from e
    db.refresh(item)
    _hydrate_cgw_flow_metre_attachments(item)
    return item


@api_router.delete('/cgw-flow-metres/{inventory_id}/media-attachments/{category}/{attachment_id}', response_model=CGWFlowMetre)
def cgw_delete_media_attachment(
    inventory_id: str,
    category: str,
    attachment_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ['Admin', 'HR']:
        raise HTTPException(status_code=403, detail='Not authorized')
    if category not in CGW_MEDIA_ATTACHMENT_KEYS:
        raise HTTPException(status_code=400, detail='Invalid category')

    item = db.query(CGWFlowMetreModel).filter(CGWFlowMetreModel.id == inventory_id).first()
    if not item:
        raise HTTPException(status_code=404, detail='Inventory item not found')

    if attachment_id == 'legacy-calibration':
        item.calibration_certificate = None
        item.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(item)
        _hydrate_cgw_flow_metre_attachments(item)
        return item

    buckets = _cgw_media_buckets_from_stored_json(item)
    lst = buckets.get(category) or []
    removed = None
    kept = []
    for x in lst:
        if x.get('id') == attachment_id:
            removed = x
        else:
            kept.append(x)
    if not removed:
        raise HTTPException(status_code=404, detail='Attachment not found')
    buckets[category] = kept
    _cgw_delete_stored_attachment_file((removed or {}).get('url') or '')
    _cgw_persist_media_buckets(item, buckets)
    item.updated_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logging.exception('Failed to delete CGW media attachment for %s', inventory_id)
        raise HTTPException(status_code=500, detail='Could not update attachments') from e
    db.refresh(item)
    _hydrate_cgw_flow_metre_attachments(item)
    return item


def _cgw_norm_form_str(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


@api_router.post('/cgw-flow-metres/{inventory_id}/noc', response_model=CGWFlowMetre)
def upload_or_update_cgw_noc(
    inventory_id: str,
    file: Optional[UploadFile] = File(None),
    project_name: Optional[str] = Form(None),
    project_address: Optional[str] = Form(None),
    communication_address: Optional[str] = Form(None),
    noc_no: Optional[str] = Form(None),
    application_no: Optional[str] = Form(None),
    project_status: Optional[str] = Form(None),
    noc_type: Optional[str] = Form(None),
    valid_from: Optional[str] = Form(None),
    valid_upto: Optional[str] = Form(None),
    permitted_m3_per_day: Optional[str] = Form(None),
    permitted_m3_per_year: Optional[str] = Form(None),
    existing_bw_count: Optional[str] = Form(None),
    total_proposed_bw_count: Optional[str] = Form(None),
    flowmeter_applicable: Optional[str] = Form(None),
    flowmeter_count: Optional[str] = Form(None),
    piezometer_applicable: Optional[str] = Form(None),
    piezometer_count: Optional[str] = Form(None),
    bhuneer_user_id: Optional[str] = Form(None),
    bhuneer_password: Optional[str] = Form(None),
    nocap_user_id: Optional[str] = Form(None),
    nocap_password: Optional[str] = Form(None),
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload or replace NOC PDF and/or save NOC metadata for one CGW inventory row (multipart, same pattern as documents/upload)."""
    if current_user.role not in ['Admin', 'HR']:
        raise HTTPException(status_code=403, detail='Not authorized')

    item = db.query(CGWFlowMetreModel).filter(CGWFlowMetreModel.id == inventory_id).first()
    if not item:
        raise HTTPException(status_code=404, detail='Inventory item not found')

    existing_url = (getattr(item, 'noc_document_url', None) or '').strip()
    has_file = bool(file and file.filename)
    if has_file:
        fn_lower = file.filename.lower()
        if not fn_lower.endswith('.pdf'):
            raise HTTPException(status_code=400, detail='Only PDF files are allowed')
        file_content = file.file.read()
        if len(file_content) > 25 * 1024 * 1024:
            raise HTTPException(status_code=400, detail='PDF must be 25 MB or smaller')
        safe_base = Path(file.filename).name.replace('..', '_').replace('/', '_') or 'noc.pdf'
        new_filename = f'cgw_noc_{uuid.uuid4().hex}.pdf'
        doc_url = upload_to_s3(file_content, new_filename, folder='cgw_noc')
        if not doc_url:
            raise HTTPException(
                status_code=503,
                detail='File upload service is temporarily unavailable. Please try again in a few moments.',
            )
        item.noc_document_url = doc_url
        flag_modified(item, 'noc_document_url')
    elif not existing_url:
        raise HTTPException(status_code=400, detail='Upload a NOC PDF first, or use an existing row that already has a NOC document.')

    item.noc_project_name = _cgw_norm_form_str(project_name)
    item.noc_project_address = _cgw_norm_form_str(project_address)
    item.noc_communication_address = _cgw_norm_form_str(communication_address)
    item.noc_no = _cgw_norm_form_str(noc_no)
    item.noc_application_no = _cgw_norm_form_str(application_no)
    item.noc_project_status = _cgw_norm_form_str(project_status)
    item.noc_type = _cgw_norm_form_str(noc_type)
    item.noc_valid_from = _cgw_norm_form_str(valid_from)
    item.noc_valid_upto = _cgw_norm_form_str(valid_upto)
    item.noc_permitted_m3_per_day = _cgw_norm_form_str(permitted_m3_per_day)
    item.noc_permitted_m3_per_year = _cgw_norm_form_str(permitted_m3_per_year)
    item.noc_existing_bw_count = _cgw_norm_form_str(existing_bw_count)
    item.noc_total_proposed_bw_count = _cgw_norm_form_str(total_proposed_bw_count)
    item.noc_flowmeter_applicable = _cgw_norm_form_str(flowmeter_applicable)
    fm_app = (item.noc_flowmeter_applicable or '').lower()
    item.noc_flowmeter_count = _cgw_norm_form_str(flowmeter_count) if fm_app == 'yes' else None
    item.noc_piezometer_applicable = _cgw_norm_form_str(piezometer_applicable)
    pz_app = (item.noc_piezometer_applicable or '').lower()
    item.noc_piezometer_count = _cgw_norm_form_str(piezometer_count) if pz_app == 'yes' else None
    item.noc_bhuneer_user_id = _cgw_norm_form_str(bhuneer_user_id)
    item.noc_bhuneer_password = _cgw_norm_form_str(bhuneer_password)
    _nocap_uid = _cgw_norm_form_str(nocap_user_id)
    item.noc_nocap_user_id = _nocap_uid.lower() if _nocap_uid else None
    item.noc_nocap_password = _cgw_norm_form_str(nocap_password)
    for attr in (
        'noc_project_name', 'noc_project_address', 'noc_communication_address',
        'noc_no', 'noc_application_no', 'noc_project_status', 'noc_type',
        'noc_valid_from', 'noc_valid_upto',
        'noc_permitted_m3_per_day', 'noc_permitted_m3_per_year',
        'noc_existing_bw_count', 'noc_total_proposed_bw_count',
        'noc_flowmeter_applicable', 'noc_flowmeter_count',
        'noc_piezometer_applicable', 'noc_piezometer_count',
        'noc_bhuneer_user_id', 'noc_bhuneer_password', 'noc_nocap_user_id', 'noc_nocap_password',
    ):
        flag_modified(item, attr)
    item.updated_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logging.exception('Failed to save CGW NOC for %s', inventory_id)
        raise HTTPException(status_code=500, detail='Could not save NOC data') from e
    db.refresh(item)
    _hydrate_cgw_flow_metre_attachments(item)
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


class CGWRenewalDigestSettingsResponse(BaseModel):
    notification_email: Optional[str] = None
    enabled: bool = False
    schedule_timezone: str = ATTENDANCE_TZ_NAME


class CGWRenewalDigestSettingsUpdate(BaseModel):
    notification_email: Optional[str] = None
    enabled: Optional[bool] = None


@api_router.get('/settings/cgw-renewal-digest', response_model=CGWRenewalDigestSettingsResponse)
def get_cgw_renewal_digest_settings(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ['Admin', 'HR']:
        raise HTTPException(status_code=403, detail='Not authorized')
    email = (app_setting_get(db, SETTING_CGW_DIGEST_EMAIL) or '').strip() or None
    en = (app_setting_get(db, SETTING_CGW_DIGEST_ENABLED) or '0').strip().lower()
    enabled = en in ('1', 'true', 'yes', 'on')
    return CGWRenewalDigestSettingsResponse(
        notification_email=email,
        enabled=enabled,
        schedule_timezone=ATTENDANCE_TZ_NAME,
    )


@api_router.put('/settings/cgw-renewal-digest', response_model=CGWRenewalDigestSettingsResponse)
def update_cgw_renewal_digest_settings(
    data: CGWRenewalDigestSettingsUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ['Admin', 'HR']:
        raise HTTPException(status_code=403, detail='Not authorized')
    payload = data.model_dump(exclude_unset=True)
    if 'notification_email' in payload:
        cleaned = (payload['notification_email'] or '').strip()
        if cleaned:
            try:
                from pydantic import TypeAdapter
                TypeAdapter(EmailStr).validate_python(cleaned)
            except Exception:
                raise HTTPException(status_code=422, detail='Invalid notification email address')
            app_setting_set(db, SETTING_CGW_DIGEST_EMAIL, cleaned)
        else:
            app_setting_set(db, SETTING_CGW_DIGEST_EMAIL, '')
    if 'enabled' in payload and payload['enabled'] is not None:
        app_setting_set(db, SETTING_CGW_DIGEST_ENABLED, '1' if payload['enabled'] else '0')
    return get_cgw_renewal_digest_settings(current_user=current_user, db=db)


@api_router.post('/settings/cgw-renewal-digest/run-now')
def run_cgw_renewal_digest_now(current_user: UserModel = Depends(get_current_user)):
    """Manually trigger the digest (Admin/HR).

    Does not require "Enable daily digest" so you can test SMTP and recipient settings.
    If there are no past-due rows, still sends a short verification email when SMTP is OK.
    """
    if current_user.role not in ['Admin', 'HR']:
        raise HTTPException(status_code=403, detail='Not authorized')
    result = run_cgw_renewal_digest_job(require_enabled=False, send_empty_digest=True)
    return result


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
        # Read Excel file. This workbook uses a two-row header where
        # "TELEMETRIC SYSTEM" expands into PRODUCT CODE / MODEL NO.
        contents = file.file.read()
        df = pd.read_excel(io.BytesIO(contents))
        df.columns = [str(col).strip() for col in df.columns]
        df = df.rename(columns={
            'Unnamed: 7': 'MODEL NO',
            'Unnamed: 20': 'EXTRA_NOTES',
        })

        # Drop the second header row embedded inside the sheet body.
        if not df.empty and str(df.iloc[0].get('TELEMETRIC SYSTEM', '')).strip().upper() == 'PRODUCT CODE':
            df = df.iloc[1:].copy()

        inherited_columns = [
            'SL NO',
            'CUSTOMER NAME',
            'LOCATION',
            'CONTACT PERSON',
            'SYSTEM MOBILE NUMBER',
            'PERSON MOBILE NUMBER',
            'EMAIL ID',
            'DATE OF COMMISSONING',
            'URL LINK',
            'USER ID',
            'PASSWORD',
            'STATUS',
            'RENEWAL DATE WILL BE',
            'REVIEW',
            'CALIBARATION CERTIFICATE',
        ]
        for col in inherited_columns:
            if col in df.columns:
                df[col] = df[col].ffill()

        def clean_cell(value):
            if pd.isna(value):
                return None
            text_value = str(value).strip()
            return text_value or None

        def clean_date(value):
            if pd.isna(value):
                return None
            if isinstance(value, pd.Timestamp):
                return value.strftime('%Y-%m-%d')
            text_value = str(value).strip()
            if not text_value:
                return None
            parsed = pd.to_datetime(text_value, errors='coerce')
            if pd.isna(parsed):
                return text_value
            return parsed.strftime('%Y-%m-%d')

        def normalize_status(value: Optional[str]) -> str:
            """
            Excel has values like 'ACTIVE', 'INACTIVE', '3 INACTIVE', notes, etc.
            Normalize to the UI-friendly values.
            """
            if not value:
                return 'Active'
            s = str(value).strip().lower()
            if 'inactive' in s:
                return 'Inactive'
            if 'maint' in s:
                return 'Maintenance'
            if 'active' in s:
                return 'Active'
            return str(value).strip() or 'Active'

        max_inv_num = db.query(
            func.max(cast(func.substr(CGWFlowMetreModel.inventory_id, 4), Integer))
        ).scalar()
        next_inv_num = (max_inv_num or 0) + 1

        max_cust_num = db.query(
            func.max(cast(func.substr(CustomerModel.customer_id, 5), Integer))
        ).scalar()
        next_cust_num = (max_cust_num or 0) + 1
        
        imported_count = 0
        failed_count = 0
        errors = []
        
        for index, row in df.iterrows():
            try:
                customer_name = clean_cell(row.get('CUSTOMER NAME'))
                if not customer_name:
                    errors.append(f"Row {index + 2}: Missing customer name")
                    failed_count += 1
                    continue
                
                customer = db.query(CustomerModel).filter(
                    CustomerModel.company_name == customer_name
                ).first()

                if not customer:
                    customer = CustomerModel(
                        customer_id=f'CUST{str(next_cust_num).zfill(5)}',
                        company_name=customer_name,
                        contact_person_name=clean_cell(row.get('CONTACT PERSON')) or customer_name,
                        phone=clean_cell(row.get('PERSON MOBILE NUMBER')),
                        email=clean_cell(row.get('EMAIL ID')),
                        address_line=clean_cell(row.get('LOCATION')),
                        status='Active'
                    )
                    next_cust_num += 1
                    db.add(customer)
                    db.flush()

                inv_id = f'INV{str(next_inv_num).zfill(4)}'
                next_inv_num += 1
                
                data = {
                    'inventory_id': inv_id,
                    'customer_id': customer.id,
                    'customer_name': customer_name,
                    'location': clean_cell(row.get('LOCATION')),
                    'contact_person': clean_cell(row.get('CONTACT PERSON')),
                    'equipment_name': clean_cell(row.get('NAME OF EQUIPMENT')),
                    'flowmeter_details': clean_cell(row.get('FLOWMETER/PIEZOMETER DETAILS')),
                    'product_code': clean_cell(row.get('TELEMETRIC SYSTEM')),
                    'model_no': clean_cell(row.get('MODEL NO')),
                    'system_mobile_number': clean_cell(row.get('SYSTEM MOBILE NUMBER')),
                    'person_mobile_number': clean_cell(row.get('PERSON MOBILE NUMBER')),
                    'email_id': clean_cell(row.get('EMAIL ID')),
                    'date_of_commissioning': clean_date(row.get('DATE OF COMMISSONING')),
                    'url_link': clean_cell(row.get('URL LINK')),
                    'user_id': clean_cell(row.get('USER ID')),
                    'password': clean_cell(row.get('PASSWORD')),
                    'status': normalize_status(clean_cell(row.get('STATUS'))),
                    'renewal_date': clean_date(row.get('RENEWAL DATE WILL BE')),
                    'review': clean_cell(row.get('REVIEW')),
                    'calibration_certificate': clean_cell(row.get('CALIBARATION CERTIFICATE')),
                    'remarks': clean_cell(row.get('REMARKS')) or clean_cell(row.get('EXTRA_NOTES')),
                }

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
            late_reason_in = (punch_data.late_reason or '').strip()
            if is_late and not late_reason_in:
                raise HTTPException(status_code=400, detail='Reason is required for late punch-in before approval can be requested')
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
                        employee_reason=late_reason_in,
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
        
        late_reason_first = (punch_data.late_reason or '').strip()
        if is_late and not late_reason_first:
            raise HTTPException(status_code=400, detail='Reason is required for late punch-in before approval can be requested')
        
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
                employee_reason=late_reason_first,
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
        late_reason_out = (punch_data.late_reason or '').strip()
        if is_late_punch_out and not late_reason_out:
            raise HTTPException(status_code=400, detail='Reason is required for late punch-out before approval can be requested')
        
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
                employee_reason=late_reason_out,
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
    status: str = 'pending',
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List attendance tour requests by approval status. Admin and Manager only."""
    if current_user.role not in ['Admin', 'Manager']:
        raise HTTPException(status_code=403, detail='Only Admin and Manager can view tour requests')
    normalized = (status or 'pending').strip().lower()
    if normalized == 'all':
        records = db.query(AttendanceModel).filter(
            AttendanceModel.is_tour == 1,
        ).order_by(AttendanceModel.date.desc(), AttendanceModel.punch_in.desc()).all()
    else:
        if normalized not in {'pending', 'approved', 'rejected'}:
            raise HTTPException(status_code=400, detail='Invalid status. Use Pending, Approved, Rejected, or All')
        records = db.query(AttendanceModel).filter(
            AttendanceModel.is_tour == 1,
            AttendanceModel.tour_approval_status == normalized,
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
            'tour_approval_status': r.tour_approval_status,
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
    action: Literal['present', 'absent'] = 'present'


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
    """Get punch-in/out GPS points for an employee on a given day (attendance row + per-session coords). Admin only."""
    if current_user.role != 'Admin':
        raise HTTPException(status_code=403, detail='Only Admin can view employee locations')

    effective_date = (date or '').strip() or attendance_local_date_str()

    records = (
        db.query(AttendanceModel)
        .filter(
            AttendanceModel.employee_id == employee_id,
            AttendanceModel.date == effective_date,
        )
        .order_by(AttendanceModel.created_at.asc())
        .all()
    )

    locations: List[Dict[str, Any]] = []

    def _ts(dt):
        if dt and hasattr(dt, 'isoformat'):
            return dt.isoformat()
        return None

    for record in records:
        sessions = (
            db.query(AttendanceSessionModel)
            .filter(AttendanceSessionModel.attendance_id == record.id)
            .order_by(AttendanceSessionModel.session_number.asc())
            .all()
        )

        session_points: List[Dict[str, Any]] = []
        for ses in sessions:
            if ses.punch_in_lat is not None and ses.punch_in_lng is not None:
                session_points.append(
                    {
                        'id': f'{ses.id}_session_in',
                        'type': 'punch_in',
                        'latitude': float(ses.punch_in_lat),
                        'longitude': float(ses.punch_in_lng),
                        'time': ses.punch_in,
                        'timestamp': _ts(getattr(ses, 'created_at', None)),
                        'date': record.date,
                        'session_number': ses.session_number,
                    }
                )
            if ses.punch_out_lat is not None and ses.punch_out_lng is not None and ses.punch_out:
                session_points.append(
                    {
                        'id': f'{ses.id}_session_out',
                        'type': 'punch_out',
                        'latitude': float(ses.punch_out_lat),
                        'longitude': float(ses.punch_out_lng),
                        'time': ses.punch_out,
                        'timestamp': _ts(getattr(ses, 'updated_at', None) or getattr(ses, 'created_at', None)),
                        'date': record.date,
                        'session_number': ses.session_number,
                    }
                )

        if session_points:
            locations.extend(session_points)
        else:
            if record.punch_in_lat is not None and record.punch_in_lng is not None:
                locations.append(
                    {
                        'id': f'{record.id}_punch_in',
                        'type': 'punch_in',
                        'latitude': float(record.punch_in_lat),
                        'longitude': float(record.punch_in_lng),
                        'time': record.punch_in,
                        'timestamp': _ts(record.created_at),
                        'date': record.date,
                    }
                )
            if record.punch_out_lat is not None and record.punch_out_lng is not None and record.punch_out:
                locations.append(
                    {
                        'id': f'{record.id}_punch_out',
                        'type': 'punch_out',
                        'latitude': float(record.punch_out_lat),
                        'longitude': float(record.punch_out_lng),
                        'time': record.punch_out,
                        'timestamp': _ts(record.created_at),
                        'date': record.date,
                    }
                )

    def _time_key(loc: Dict[str, Any]) -> str:
        t = loc.get('time') or '00:00:00'
        if isinstance(t, str) and len(t) >= 5:
            return t
        return '99:99:99'

    locations.sort(key=_time_key)

    return {
        'employee_id': employee_id,
        'date': effective_date,
        'locations': locations,
        'total_locations': len(locations),
    }


def _serialize_late_punch_in_request(r: LatePunchInRequestModel) -> dict:
    """Plain dict so employee_reason is always present in JSON for approval screens."""
    ra = r.requested_at
    aa = r.approved_at
    return {
        'id': r.id,
        'attendance_id': r.attendance_id,
        'employee_id': r.employee_id,
        'employee_name': r.employee_name or '',
        'punch_in_time': r.punch_in_time,
        'minutes_late': r.minutes_late if r.minutes_late is not None else 0,
        'status': r.status,
        'employee_reason': (getattr(r, 'employee_reason', None) or '').strip() or None,
        'approver_id': r.approver_id,
        'approver_name': r.approver_name,
        'approval_reason': r.approval_reason,
        'punch_in_date': r.punch_in_date,
        'requested_at': ra.isoformat() if hasattr(ra, 'isoformat') else ra,
        'approved_at': aa.isoformat() if aa and hasattr(aa, 'isoformat') else aa,
    }


def _serialize_late_punch_out_request(r: LatePunchOutRequestModel) -> dict:
    ra = r.requested_at
    aa = r.approved_at
    return {
        'id': r.id,
        'attendance_id': r.attendance_id,
        'employee_id': r.employee_id,
        'employee_name': r.employee_name or '',
        'punch_out_time': r.punch_out_time,
        'minutes_late': r.minutes_late if r.minutes_late is not None else 0,
        'status': r.status,
        'employee_reason': (getattr(r, 'employee_reason', None) or '').strip() or None,
        'approver_id': r.approver_id,
        'approver_name': r.approver_name,
        'approval_reason': r.approval_reason,
        'punch_out_date': r.punch_out_date,
        'requested_at': ra.isoformat() if hasattr(ra, 'isoformat') else ra,
        'approved_at': aa.isoformat() if aa and hasattr(aa, 'isoformat') else aa,
    }


@api_router.get('/attendance/late-punch-in-requests')
def get_late_punch_in_requests(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
    status: str = 'Pending'
):
    """Get late punch-in requests (default pending). Admin and HR."""
    if current_user.role not in ('Admin', 'HR'):
        raise HTTPException(status_code=403, detail='Only Admin or HR can view late punch-in requests')
    
    requests = db.query(LatePunchInRequestModel).filter(
        LatePunchInRequestModel.status == status
    ).order_by(LatePunchInRequestModel.requested_at.desc()).all()
    
    return [_serialize_late_punch_in_request(r) for r in requests]


@api_router.post('/attendance/late-punch-in-approve')
def approve_late_punch_in(
    body: LatePunchInApproveAction,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Approve or reject a late punch-in request. Admin and HR."""
    if current_user.role not in ('Admin', 'HR'):
        raise HTTPException(status_code=403, detail='Only Admin or HR can approve late punch-in requests')
    
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
    """Get late punch-out requests (default pending). Admin and HR."""
    if current_user.role not in ('Admin', 'HR'):
        raise HTTPException(status_code=403, detail='Only Admin or HR can view late punch-out requests')
    
    requests = db.query(LatePunchOutRequestModel).filter(
        LatePunchOutRequestModel.status == status
    ).order_by(LatePunchOutRequestModel.requested_at.desc()).all()
    
    return [_serialize_late_punch_out_request(r) for r in requests]


@api_router.post('/attendance/late-punch-out-approve')
def approve_late_punch_out(
    body: LatePunchInApproveAction,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Approve or reject a late punch-out request. Admin and HR."""
    if current_user.role not in ('Admin', 'HR'):
        raise HTTPException(status_code=403, detail='Only Admin or HR can approve late punch-out requests')
    
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
    action = (body.action or 'present').lower()
    
    if not employee_id or not date:
        raise HTTPException(status_code=400, detail='Employee ID and date are required')
    if action not in ['present', 'absent']:
        raise HTTPException(status_code=400, detail='Invalid action. Use present or absent')
    
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
        if action == 'present':
            existing.punch_in = '10:00:00'
            existing.punch_out = '18:00:00'
            existing.status = 'Present'
            existing.work_hours = 8.0
            existing.total_work_hours = 8.0
        else:
            existing.punch_in = None
            existing.punch_out = None
            existing.status = 'Absent'
            existing.work_hours = 0.0
            existing.total_work_hours = 0.0
        existing.is_active_session = 0
        existing.is_tour = 0
        existing.tour_approval_status = None
        existing.employee_name = employee.name
        db.commit()
        return {'message': f'Attendance marked {action} successfully', 'attendance_id': existing.id}
    else:
        # Create new record
        if action == 'present':
            punch_in = '10:00:00'
            punch_out = '18:00:00'
            status = 'Present'
            work_hours = 8.0
            total_work_hours = 8.0
        else:
            punch_in = None
            punch_out = None
            status = 'Absent'
            work_hours = 0.0
            total_work_hours = 0.0
        new_record = AttendanceModel(
            id=str(uuid.uuid4()),
            employee_id=employee_id,
            employee_name=employee.name,
            date=date,
            punch_in=punch_in,
            punch_out=punch_out,
            status=status,
            work_hours=work_hours,
            total_work_hours=total_work_hours,
            is_active_session=0,
            is_tour=0
        )
        db.add(new_record)
        db.commit()
        return {'message': f'Attendance marked {action} successfully', 'attendance_id': new_record.id}


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
    if current_user.role == 'Employee':
        if not current_user.employee_id:
            raise HTTPException(status_code=403, detail='Employee ID not linked to your account')
        query = query.filter(AttendanceModel.employee_id == current_user.employee_id)
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
    if current_user.role == 'Employee' and current_user.employee_id:
        leave_query = leave_query.filter(LeaveModel.employee_id == current_user.employee_id)
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


@api_router.get('/attendance/monthly-report')
def get_attendance_monthly_report(
    month: str,
    employee_id: Optional[str] = None,
    current_user: UserModel = Depends(require_permission('monthly-report')),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Monthly attendance with per-day sessions (first in / last out),
    late-login flag (first non-tour punch after 10:30), and tour markers.
    Requires ``monthly-report`` permission. Non-admins always see their own linked ``employee_id`` only.
    Admins may pass ``employee_id`` (business employee id) to view any employee's report.
    """
    finalize_stale_attendance_without_punch_out(db)
    try:
        parts = month.split('-')
        if len(parts) != 2:
            raise ValueError('bad')
        year, month_num = int(parts[0]), int(parts[1])
        if month_num < 1 or month_num > 12:
            raise ValueError('bad')
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail='Invalid month; use YYYY-MM')

    requested = (employee_id or '').strip()
    if current_user.role == 'Admin':
        if requested:
            emp_row = db.query(EmployeeModel).filter(EmployeeModel.employee_id == requested).first()
            if not emp_row:
                raise HTTPException(status_code=404, detail='Employee not found')
            emp_id = requested
        elif current_user.employee_id:
            emp_id = current_user.employee_id
        else:
            raise HTTPException(
                status_code=400,
                detail='Select an employee (pass employee_id), or link an employee profile to your admin account.',
            )
    else:
        if not current_user.employee_id:
            raise HTTPException(status_code=403, detail='Employee profile not linked to your account')
        if requested and requested != current_user.employee_id:
            raise HTTPException(status_code=403, detail='You can only view your own monthly report')
        emp_id = current_user.employee_id
    query = db.query(AttendanceModel).filter(
        AttendanceModel.employee_id == emp_id,
        AttendanceModel.date.like(f'{month}%'),
    )
    records = query.order_by(AttendanceModel.date.asc()).all()

    for record in records:
        if not record.employee_name:
            emp = db.query(EmployeeModel).filter(EmployeeModel.employee_id == record.employee_id).first()
            if emp:
                record.employee_name = emp.name

    leave_query = db.query(LeaveModel).filter(
        LeaveModel.status == 'Approved',
        LeaveModel.employee_id == emp_id,
    )
    month_start = f'{year}-{month_num:02d}-01'
    month_end = f'{year}-{month_num:02d}-{monthrange(year, month_num)[1]:02d}'
    leave_query = leave_query.filter(
        LeaveModel.start_date <= month_end,
        LeaveModel.end_date >= month_start,
    )
    approved_leaves = leave_query.all()
    existing_records = set((r.employee_id, r.date) for r in records)
    for leave in approved_leaves:
        current = datetime.strptime(leave.start_date, '%Y-%m-%d').date()
        end = datetime.strptime(leave.end_date, '%Y-%m-%d').date()
        while current <= end:
            date_str = current.isoformat()
            if (leave.employee_id, date_str) not in existing_records:
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
                    created_at=datetime.now(timezone.utc),
                )
                records.append(leave_record)
                existing_records.add((leave.employee_id, date_str))
            current += timedelta(days=1)

    records = sorted(records, key=lambda x: x.date)
    attendance_ids = [r.id for r in records if getattr(r, 'id', None)]
    session_map: Dict[str, List[AttendanceSessionModel]] = defaultdict(list)
    if attendance_ids:
        sess_rows = (
            db.query(AttendanceSessionModel)
            .filter(AttendanceSessionModel.attendance_id.in_(attendance_ids))
            .order_by(AttendanceSessionModel.session_number.asc())
            .all()
        )
        for s in sess_rows:
            session_map[s.attendance_id].append(s)

    late_threshold = 10 * 60 + 30
    days_out: List[Dict[str, Any]] = []
    total_work_sum = 0.0
    worked_days = 0
    late_login_days = 0
    tour_days_approved = 0

    for record in records:
        sessions = session_map.get(record.id, [])
        first_punch_in = None
        last_punch_out = None
        if sessions:
            first_punch_in = sessions[0].punch_in
            for s in reversed(sessions):
                if s.punch_out:
                    last_punch_out = s.punch_out
                    break
            if last_punch_out is None:
                last_punch_out = record.punch_out
        else:
            first_punch_in = record.punch_in
            last_punch_out = record.punch_out

        first_office = next((s for s in sessions if (s.is_tour or 0) != 1), None)
        late_login = False
        if first_office and first_office.punch_in:
            pm = _punch_time_to_minutes(first_office.punch_in)
            if pm is not None and pm > late_threshold:
                late_login = True
        elif not sessions and record.punch_in and (record.is_tour or 0) != 1:
            pm = _punch_time_to_minutes(record.punch_in)
            if pm is not None and pm > late_threshold:
                late_login = True

        has_tour = (record.is_tour or 0) == 1 or any((s.is_tour or 0) == 1 for s in sessions)
        tour_approved = False
        if (record.is_tour or 0) == 1 and (record.tour_approval_status or '') == 'approved':
            tour_approved = True
        if not tour_approved:
            tour_approved = any(
                (s.is_tour or 0) == 1 and (s.tour_approval_status or '') == 'approved' for s in sessions
            )
        tour_pending_or_other = bool(has_tour and not tour_approved)

        tw_raw = float(record.total_work_hours or 0.0)
        wh = float(record.work_hours or 0.0)
        # Keep worked_days aligned with Attendance Grid / Summary "present-day" logic:
        counts_as_worked_day = (record.status == 'Present') or (has_tour and tour_approved)
        # Regularized Present rows historically could have work_hours set but total_work_hours still 0.
        if tw_raw > 0:
            hours_for_day = tw_raw
        elif counts_as_worked_day:
            hours_for_day = wh
        else:
            hours_for_day = tw_raw
        total_work_sum += hours_for_day

        if counts_as_worked_day:
            worked_days += 1

        if late_login:
            late_login_days += 1
        if has_tour and tour_approved:
            tour_days_approved += 1

        session_payload = [
            {
                'id': s.id,
                'session_number': s.session_number,
                'punch_in': s.punch_in,
                'punch_out': s.punch_out,
                'work_hours': float(s.work_hours or 0.0),
                'is_tour': s.is_tour,
                'tour_approval_status': s.tour_approval_status,
            }
            for s in sessions
        ]

        days_out.append(
            {
                'date': record.date,
                'first_punch_in': first_punch_in,
                'last_punch_out': last_punch_out,
                'total_work_hours': hours_for_day,
                'status': record.status,
                'is_tour_day': has_tour,
                'tour_approved': tour_approved,
                'tour_pending_or_other': tour_pending_or_other,
                'tour_approval_status': record.tour_approval_status,
                'late_login': late_login,
                'sessions': session_payload,
            }
        )

    avg_hours = round(total_work_sum / worked_days, 2) if worked_days else 0.0

    display_name = None
    if records:
        display_name = records[0].employee_name
    if not display_name:
        emp_lookup = db.query(EmployeeModel).filter(EmployeeModel.employee_id == emp_id).first()
        if emp_lookup:
            display_name = emp_lookup.name

    return {
        'month': month,
        'employee_id': emp_id,
        'employee_name': display_name,
        'days': days_out,
        'avg_hours_per_worked_day': avg_hours,
        'total_work_hours': round(total_work_sum, 2),
        'worked_days': worked_days,
        'late_login_days': late_login_days,
        'tour_days_approved': tour_days_approved,
    }


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
    from urllib.parse import urlparse
    from fastapi.responses import Response

    document = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail='Document not found')
    can_view_all = current_user.role in ['Admin', 'HR', 'Manager']
    if not can_view_all and str(document.employee_id) != str(current_user.employee_id or ''):
        raise HTTPException(status_code=403, detail='Not authorized to download this document')

    raw_path = str(document.file_path or '').strip()
    if not raw_path:
        raise HTTPException(status_code=404, detail='File not found')

    # New uploads are stored in S3 URL form; older rows may still point to local filesystem.
    if raw_path.startswith('http://') or raw_path.startswith('https://'):
        if not s3_client or not USE_S3:
            raise HTTPException(status_code=503, detail='File service is unavailable')
        if not S3_BUCKET_NAME or S3_BUCKET_NAME not in raw_path:
            raise HTTPException(status_code=400, detail='Invalid file URL')
        try:
            parsed_url = urlparse(raw_path)
            s3_key = parsed_url.path.lstrip('/')
            if not s3_key:
                raise HTTPException(status_code=404, detail='File not found')
            obj = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=s3_key)
            file_content = obj['Body'].read()
            content_type = obj.get('ContentType', 'application/octet-stream')
            filename_for_type = str(document.file_name or '').lower()
            if filename_for_type.endswith('.pdf'):
                content_type = 'application/pdf'
            return Response(
                content=file_content,
                media_type=content_type,
                headers={
                    'Content-Disposition': f'inline; filename="{document.file_name or "document"}"',
                    'Cache-Control': 'no-store',
                    'Access-Control-Allow-Origin': '*',
                },
            )
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=404, detail='File not found')

    file_path = Path(raw_path)
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
        # Legacy NOC/media uploads used application/octet-stream; PDFs need application/pdf for iframe preview
        if filename.lower().endswith('.pdf'):
            content_type = 'application/pdf'

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


@api_router.put('/users/{user_id}/email', response_model=UserDetails)
def update_user_email(
    user_id: str,
    payload: UserEmailUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != 'Admin':
        raise HTTPException(status_code=403, detail='Only Admin can change user email')

    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    new_email = str(payload.email).strip().lower()
    if not new_email:
        raise HTTPException(status_code=400, detail='Email is required')

    existing = db.query(UserModel).filter(func.lower(UserModel.email) == new_email).first()
    if existing and existing.id != user.id:
        raise HTTPException(status_code=400, detail='Email already registered')

    user.email = new_email
    if user.employee_id:
        emp = db.query(EmployeeModel).filter(EmployeeModel.employee_id == user.employee_id).first()
        if emp:
            emp.email = new_email

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail='Email already exists')

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
    user_data['permissions'] = get_permissions_for_role(db, user.role)
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

def smtp_env_status() -> Tuple[bool, List[str]]:
    """Return (all_required_set, list_of_missing_env_names)."""
    checks = [
        ('SMTP_SERVER', os.environ.get('SMTP_SERVER', '').strip()),
        ('SMTP_USERNAME', os.environ.get('SMTP_USERNAME', '').strip()),
        ('SMTP_PASSWORD', os.environ.get('SMTP_PASSWORD', '').strip()),
        ('SENDER_EMAIL', os.environ.get('SENDER_EMAIL', '').strip()),
    ]
    missing = [name for name, val in checks if not val]
    return (len(missing) == 0, missing)


def send_email(to_email: str, subject: str, body: str, is_html: bool = False) -> Tuple[bool, Optional[str]]:
    """Send an email using SMTP configuration from environment variables.

    Returns (success, error_message). On success error_message is None.
    """
    try:
        smtp_ready, missing = smtp_env_status()
        if not smtp_ready:
            error_msg = f'Missing or empty env: {", ".join(missing)}'
            logging.warning('Email not sent — %s', error_msg)
            return False, error_msg

        smtp_server = os.environ.get('SMTP_SERVER', '').strip()
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        smtp_username = os.environ.get('SMTP_USERNAME', '').strip()
        smtp_password = os.environ.get('SMTP_PASSWORD', '').strip()
        sender_email = os.environ.get('SENDER_EMAIL', '').strip()
        sender_name = os.environ.get('SENDER_NAME', 'CRM Application')

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
        return True, None
    except smtplib.SMTPAuthenticationError as e:
        err = f'SMTP authentication failed: {e}'
        logging.error('SMTP Authentication Failed: %s', err)
        return False, err
    except smtplib.SMTPException as e:
        err = f'SMTP error: {e}'
        logging.error('SMTP error to %s: %s', to_email, err)
        return False, err
    except Exception as e:
        err = f'{type(e).__name__}: {e}'
        logging.error('Failed to send email to %s: %s', to_email, err)
        return False, err


def run_cgw_renewal_digest_job(
    require_enabled: bool = True,
    send_empty_digest: bool = False,
) -> Dict[str, Any]:
    """Send one email listing CGW rows whose renewal date is before today (attendance timezone).

    Scheduled job: require_enabled=True, send_empty_digest=False (no email if nothing past-due).
    Manual "Send digest now": require_enabled=False, send_empty_digest=True (still need recipient;
    sends a short note if there are zero past-due rows so you can verify SMTP).
    """
    out: Dict[str, Any] = {
        'email_sent': False,
        'past_due_count': 0,
        'recipient': None,
        'skipped_reason': None,
        'smtp_ready': False,
        'missing_smtp_env': [],
        'send_error': None,
        'message': '',
    }
    db = SessionLocal()
    try:
        smtp_ok, missing = smtp_env_status()
        out['smtp_ready'] = smtp_ok
        out['missing_smtp_env'] = missing
        if not smtp_ok:
            out['skipped_reason'] = 'smtp_not_configured'
            out['message'] = (
                'No email was sent because SMTP is not configured on the server. '
                f'Set these in the backend .env: {", ".join(missing)}.'
            )
            logging.warning('CGW digest: %s', out['message'])
            return out

        enabled_raw = (app_setting_get(db, SETTING_CGW_DIGEST_ENABLED) or '').strip().lower()
        enabled = enabled_raw in ('1', 'true', 'yes', 'on')
        to_email = (app_setting_get(db, SETTING_CGW_DIGEST_EMAIL) or '').strip()
        out['recipient'] = to_email or None

        if require_enabled and not enabled:
            out['skipped_reason'] = 'digest_disabled'
            out['message'] = (
                'Daily digest is disabled in CGW settings, so the scheduled job will not send. '
                'Turn on "Enable daily digest" or use "Send digest now" (which does not require that toggle).'
            )
            logging.info('CGW digest skipped: digest_disabled (cron)')
            return out

        if not to_email:
            out['skipped_reason'] = 'no_recipient'
            out['message'] = (
                'No notification email is configured. Save a recipient address under '
                '"Notification email (digest recipient)" on the CGW Flow Metre page.'
            )
            logging.info('CGW digest skipped: no_recipient')
            return out

        today = attendance_local_now().date()
        rows = db.query(CGWFlowMetreModel).all()
        past: List[CGWFlowMetreModel] = []
        for r in rows:
            if not r.renewal_date or not str(r.renewal_date).strip():
                continue
            rd = parse_cgw_renewal_date(r.renewal_date)
            if rd and rd < today:
                past.append(r)
        out['past_due_count'] = len(past)

        if not past:
            if not send_empty_digest:
                out['skipped_reason'] = 'no_past_due_rows'
                out['message'] = (
                    f'No past-due renewals as of {today.isoformat()} ({ATTENDANCE_TZ_NAME}), so no email was sent. '
                    'Renewal must be strictly before today in that timezone.'
                )
                logging.info('CGW digest: no past-due rows')
                return out
            subject = f'[CRM] CGW renewal digest — no past-due rows — {today.isoformat()}'
            body = (
                f'There are no CGW flow metre rows with renewal date before {today.isoformat()} '
                f'({ATTENDANCE_TZ_NAME}).\n\n'
                f'This message was sent because you used "Send digest now" to verify email delivery.\n'
            )
            ok, err = send_email(to_email, subject, body, is_html=False)
            out['email_sent'] = ok
            out['send_error'] = err
            out['message'] = (
                f'Verification email sent to {to_email} (no past-due rows to list).'
                if ok else (err or 'SMTP send failed')
            )
            if ok:
                logging.info('CGW digest empty summary sent to %s', to_email)
            else:
                logging.warning('CGW digest empty send failed: %s', err)
            return out

        past.sort(key=lambda x: (parse_cgw_renewal_date(x.renewal_date) or date.min, (x.customer_name or ''), (x.inventory_id or '')))
        body_lines = [
            f'CGW Flow Metre — past-due renewals ({len(past)} line(s))',
            f'As of: {today.isoformat()} ({ATTENDANCE_TZ_NAME})',
            '',
            'Follow up with each customer using the contact details below.',
            '',
        ]
        for r in past:
            body_lines.append('---')
            body_lines.append(f'Inventory ID: {r.inventory_id or "—"}')
            body_lines.append(f'Customer: {r.customer_name or "—"}')
            body_lines.append(f'Contact person: {r.contact_person or "—"}')
            body_lines.append(f'Person mobile: {r.person_mobile_number or "—"}')
            body_lines.append(f'System mobile: {r.system_mobile_number or "—"}')
            body_lines.append(f'Email: {r.email_id or "—"}')
            body_lines.append(f'Location: {r.location or "—"}')
            body_lines.append(f'Renewal date (past due): {r.renewal_date}')
            body_lines.append(f'Equipment: {r.equipment_name or "—"}')
            body_lines.append(f'Flowmeter / details: {r.flowmeter_details or "—"}')
            body_lines.append(f'Status: {r.status or "—"}')
            body_lines.append(f'Remarks: {r.remarks or "—"}')
        body = '\n'.join(body_lines)
        subject = f'[CRM] CGW past-due renewals ({len(past)}) — {today.isoformat()}'
        ok, err = send_email(to_email, subject, body, is_html=False)
        out['email_sent'] = ok
        out['send_error'] = err
        out['message'] = (
            f'Digest sent to {to_email} with {len(past)} past-due row(s).'
            if ok else (err or 'SMTP send failed')
        )
        if ok:
            logging.info('CGW renewal digest sent to %s (%d rows)', to_email, len(past))
        else:
            logging.warning('CGW renewal digest send failed to %s: %s', to_email, err)
        return out
    except Exception as e:
        logging.exception('CGW renewal digest job failed: %s', e)
        out['send_error'] = str(e)
        out['message'] = f'Digest job error: {e}'
        return out
    finally:
        db.close()


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
    
    email_sent, send_err = send_email(request.recipient_email, test_subject, test_body, is_html=False)

    if email_sent:
        return {
            'status': 'success',
            'message': f'Test email sent successfully to {request.recipient_email}',
            'recipient': request.recipient_email
        }
    return {
        'status': 'failed',
        'message': send_err or 'Failed to send test email. Check server logs.',
        'recipient': request.recipient_email,
        'help': 'Set SMTP_SERVER, SMTP_PORT (optional, default 587), SMTP_USERNAME, SMTP_PASSWORD, and SENDER_EMAIL in the backend .env',
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
    email_sent, send_err = send_email(email, subject, email_body, is_html=False)

    if email_sent:
        return {
            'message': f'Subscription reminder email sent successfully to {email}',
            'order_id': order_id,
            'days_before': days_before,
            'email': email,
            'status': 'sent'
        }
    return {
        'message': send_err or f'Failed to send subscription reminder email to {email}.',
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
    # Always bind usage to the authenticated user to avoid ID mismatches that
    # later prevent fetching/completing the same active journey.
    effective_employee_id = current_user.employee_id or current_user.id
    effective_employee_name = current_user.name

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
        employee_id=effective_employee_id,
        employee_name=effective_employee_name,
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
        effective_employee_id = current_user.employee_id or current_user.id
        usages = db.query(VehicleUsageModel).filter(
            VehicleUsageModel.employee_id == effective_employee_id,
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

_cgw_digest_scheduler = None


def _start_cgw_renewal_digest_scheduler():
    """Fire `run_cgw_renewal_digest_job` every day at 09:00 in ATTENDANCE_TIMEZONE."""
    global _cgw_digest_scheduler
    if _cgw_digest_scheduler is not None:
        return
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger
    except ImportError:
        logger.warning('APScheduler is not installed; CGW renewal morning digest is disabled')
        return
    try:
        from zoneinfo import ZoneInfo
        sched_tz = ZoneInfo(ATTENDANCE_TZ_NAME)
    except Exception:
        sched_tz = timezone(timedelta(hours=5, minutes=30))
    _cgw_digest_scheduler = BackgroundScheduler(timezone=sched_tz)
    _cgw_digest_scheduler.add_job(
        run_cgw_renewal_digest_job,
        CronTrigger(hour=9, minute=0, timezone=sched_tz),
        id='cgw_renewal_digest_daily',
        replace_existing=True,
    )
    _cgw_digest_scheduler.start()
    logger.info('CGW past-due renewal digest scheduled daily at 09:00 (%s)', ATTENDANCE_TZ_NAME)


@app.on_event('startup')
def _cgw_digest_scheduler_startup():
    _start_cgw_renewal_digest_scheduler()


@app.on_event('shutdown')
def _cgw_digest_scheduler_shutdown():
    global _cgw_digest_scheduler
    if _cgw_digest_scheduler is not None:
        _cgw_digest_scheduler.shutdown(wait=False)
        _cgw_digest_scheduler = None
