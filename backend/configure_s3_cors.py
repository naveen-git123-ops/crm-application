#!/usr/bin/env python3
"""
Script to configure AWS S3 CORS for file preview support
This allows images and PDFs to be previewed directly in the browser
"""
import boto3
import json
import sys
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

AWS_ACCESS_KEY = os.environ.get('AWS_ACCESS_KEY_ID')
AWS_SECRET_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY')
AWS_REGION = os.environ.get('AWS_S3_REGION', os.environ.get('AWS_REGION', 'us-east-1'))
S3_BUCKET = os.environ.get('AWS_S3_BUCKET_NAME', os.environ.get('S3_BUCKET_NAME'))

if not all([AWS_ACCESS_KEY, AWS_SECRET_KEY, S3_BUCKET]):
    print("❌ Missing required credentials in .env file:")
    print(f"   AWS_ACCESS_KEY_ID: {bool(AWS_ACCESS_KEY)}")
    print(f"   AWS_SECRET_ACCESS_KEY: {bool(AWS_SECRET_KEY)}")
    print(f"   S3_BUCKET_NAME: {bool(S3_BUCKET)}")
    sys.exit(1)

print(f"Configuring CORS for S3 bucket: {S3_BUCKET}")
print(f"Region: {AWS_REGION}")

try:
    # Create S3 client
    s3_client = boto3.client(
        's3',
        aws_access_key_id=AWS_ACCESS_KEY,
        aws_secret_access_key=AWS_SECRET_KEY,
        region_name=AWS_REGION
    )
    
    # Define CORS configuration
    cors_config = {
        'CORSRules': [
            {
                'AllowedOrigins': [
                    'http://localhost:3000',
                    'http://localhost:3001',
                    'https://api.resoline.com',
                    '*'  # Allow all origins for development; restrict in production
                ],
                'AllowedMethods': ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
                'AllowedHeaders': ['*'],
                'ExposeHeaders': ['ETag', 'x-amz-version-id'],
                'MaxAgeSeconds': 3000
            }
        ]
    }
    
    # Apply CORS configuration
    s3_client.put_bucket_cors(
        Bucket=S3_BUCKET,
        CORSConfiguration=cors_config
    )
    
    print("✅ CORS configuration applied successfully!")
    print("\nCORS Rules:")
    print(json.dumps(cors_config, indent=2))
    
    # Verify CORS was set
    try:
        current_cors = s3_client.get_bucket_cors(Bucket=S3_BUCKET)
        print("\n✅ Verification: CORS rules are now active on the bucket")
    except Exception as e:
        print(f"⚠️  Could not verify CORS configuration: {str(e)}")
    
except Exception as e:
    print(f"❌ Error configuring CORS: {str(e)}")
    print("\nMake sure your AWS credentials have permission to:")
    print("  - s3:PutBucketCors")
    print("  - s3:GetBucketCors")
    sys.exit(1)

print("\n✅ S3 bucket is now configured for file preview!")
print("Try uploading a receipt and viewing it in the expense dialog.")
