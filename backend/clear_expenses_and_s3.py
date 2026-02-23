"""
Script to clear all expenses from database and associated receipts from S3
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import boto3
from botocore.exceptions import ClientError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Database Setup
DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=3600)
Session = sessionmaker(bind=engine)

# S3 Setup
USE_S3 = os.environ.get('USE_S3', 'true').lower() == 'true'
S3_BUCKET_NAME = os.environ.get('AWS_S3_BUCKET_NAME') or os.environ.get('S3_BUCKET_NAME')
S3_REGION = os.environ.get('AWS_S3_REGION') or os.environ.get('S3_REGION', 'ap-south-1')
AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY')

s3_client = None
if USE_S3 and S3_BUCKET_NAME and AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
    s3_client = boto3.client(
        's3',
        region_name=S3_REGION,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY
    )

def delete_from_s3(file_url: str) -> bool:
    """Delete file from S3 bucket"""
    if not USE_S3 or not s3_client or not file_url:
        return False
    
    try:
        # Extract S3 key from URL
        if S3_BUCKET_NAME in file_url:
            # Handle S3 URL format: https://bucket.s3.region.amazonaws.com/path/to/file
            # Extract the path after the bucket part
            s3_key = file_url.split(f"{S3_BUCKET_NAME}.s3")[1]
            if s3_key.startswith('.'):
                # Format: .region.amazonaws.com/path
                s3_key = s3_key.split('/')[-1] if '/' in s3_key else s3_key
                s3_key = '/'.join(file_url.split('/')[-3:])
            else:
                # Fallback format extraction
                s3_key = '/'.join(file_url.split('/')[-3:])
            
            print(f"  Deleting from S3: {s3_key}")
            s3_client.delete_object(
                Bucket=S3_BUCKET_NAME,
                Key=s3_key
            )
            return True
    except ClientError as e:
        print(f"  ⚠️ Error deleting from S3: {str(e)}")
        return False
    except Exception as e:
        print(f"  ⚠️ Unexpected error: {str(e)}")
        return False

def clear_expenses():
    """Clear all expenses and associated S3 files"""
    session = Session()
    try:
        # Get all expenses
        expenses = session.query(text('*')).from_statement(
            text('SELECT * FROM expenses')
        ).all()
        
        # Alternative: Using raw SQL
        result = session.execute(text('SELECT id, receipt_path FROM expenses'))
        expenses = result.fetchall()
        
        if not expenses:
            print("✅ No expenses found to clear")
            return
        
        print(f"\n📋 Found {len(expenses)} expense(s)")
        print("=" * 60)
        
        # Delete each expense's receipt from S3
        deleted_count = 0
        for expense in expenses:
            expense_id, receipt_path = expense
            print(f"\n🗑️  Processing expense: {expense_id}")
            
            if receipt_path:
                print(f"   Receipt path: {receipt_path}")
                if delete_from_s3(receipt_path):
                    deleted_count += 1
                    print(f"   ✅ Deleted from S3")
                else:
                    print(f"   ⚠️  Failed to delete from S3 (may not exist)")
            else:
                print(f"   ℹ️  No receipt attached")
        
        # Clear the expenses table
        print(f"\n" + "=" * 60)
        print(f"🗑️  Clearing expenses table...")
        session.execute(text('DELETE FROM expenses'))
        session.commit()
        print(f"✅ Cleared {len(expenses)} expense record(s) from database")
        print(f"✅ Deleted {deleted_count} file(s) from S3")
        
        print("\n" + "=" * 60)
        print("🎉 Expenses and S3 files cleared successfully!")
        
    except Exception as e:
        session.rollback()
        print(f"\n❌ Error: {str(e)}")
        raise
    finally:
        session.close()

if __name__ == '__main__':
    print("\n" + "=" * 60)
    print("EXPENSE CLEANUP - Database & S3")
    print("=" * 60)
    
    confirm = input("\n⚠️  This will delete ALL expenses and their S3 receipts. Continue? (yes/no): ").strip().lower()
    
    if confirm == 'yes':
        clear_expenses()
    else:
        print("❌ Operation cancelled")
