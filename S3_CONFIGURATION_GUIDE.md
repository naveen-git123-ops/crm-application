# S3 Configuration Guide - REQUIRED

The CRM application **requires AWS S3** (or compatible service) for all file uploads. This is mandatory for production use.

**Note:** Local file storage is NOT supported. All uploads must go to S3.

## Why S3 is Required

In professional applications:
- ✅ Scalable and reliable storage
- ✅ Consistent file access across servers
- ✅ Automatic backup and redundancy
- ✅ Easy disaster recovery
- ✅ Production-grade security

## Features Using S3

The following file uploads **require S3**:
- ✅ Expense receipts
- ✅ Employee profile photos
- ✅ Documents
- ✅ Task attachments
- ✅ All other file uploads

**If S3 is not configured or connection fails:**
- ❌ Upload will fail with error: "File upload service is temporarily unavailable. Please try again in a few moments."
- ❌ Files will NOT be stored locally
- ❌ User will need to retry after service is available

## Setup Instructions

### 1. Get AWS Credentials

1. Log in to your [AWS Console](https://console.aws.amazon.com/)
2. Go to **IAM** → **Users** → Create a new user or use existing one
3. Attach policy: **AmazonS3FullAccess** or create custom policy with S3 permissions
4. Generate **Access Key ID** and **Secret Access Key**
5. Save these credentials securely

### 2. Create S3 Bucket

1. Go to **S3** in AWS Console
2. Click **Create Bucket**
3. Enter bucket name (e.g., `crm-application-files`)
4. Choose Region (e.g., `us-east-1`)
5. Keep default settings, click **Create**

### 3. Configure .env File

Add the following to your `.env` file in the `backend/` directory:

```env
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_REGION=us-east-1
S3_BUCKET_NAME=crm-application-files
```

**Example with real values:**
```env
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=ap-south-1
S3_BUCKET_NAME=my-crm-files-bucket
```

### 4. Install Dependencies

If not already installed, add boto3 to your requirements:

```bash
pip install boto3
```

### 5. Restart Backend Server

After updating the `.env` file, restart the backend server:

```bash
# Stop the current uvicorn server (Ctrl+C)
# Then restart it
uvicorn server:app --reload
```

## Verification

After setup, you can verify S3 is working by:

1. **Upload a file** through the UI (expense receipt, profile photo, document)
2. **Should succeed** - file uploaded to S3
3. **If it fails** - will show error: "File upload service is temporarily unavailable"
4. **Check AWS Console** - browse your S3 bucket, files should appear in folders:
   - `expenses/`
   - `documents/`
   - `profile_photos/`
   - `tasks/`
   - `task_attachments/`

## Troubleshooting

### Upload Fails with "File upload service is temporarily unavailable"

This means S3 connection failed. Possible causes:

**1. S3 is not configured**
```env
# Check if these are in your .env file:
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-bucket
```

**2. Invalid credentials**
- Verify Access Key ID and Secret Access Key in `.env`
- Check they match your AWS IAM user

**3. Insufficient permissions**
- Ensure IAM user has `s3:PutObject` permission
- Check bucket policy allows uploads

**4. Bucket doesn't exist or region mismatch**
- Verify bucket name is correct
- Verify region in `.env` matches bucket region
- Use `aws s3 ls` to list buckets if configured locally

**5. Network connectivity**
- Check internet connection
- Check firewall/proxy settings
- Verify AWS endpoint is reachable

## S3 Bucket Policies

### Optional: Make Uploads Publicly Accessible

If you want users to access files directly without your server:

1. In S3 Console → Your Bucket → **Permissions** → **Bucket Policy**
2. Add this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::crm-application-files/*"
    }
  ]
}
```

3. Unblock public access if needed

## Cost Estimation

**AWS S3 Pricing:**
- Storage: ~$0.023 per GB per month
- Requests: $0.0004 per 10,000 PUT requests
- Requests: $0.0004 per 10,000 GET requests
- Data transfer out: ~$0.09 per GB

**Example:** 1000 files × 2MB each = ~2GB storage ≈ $0.046/month + request costs

## Security Best Practices

1. ✅ Use separate IAM user for S3 access (not root account)
2. ✅ Rotate access keys periodically
3. ✅ Use least privilege permissions (not full S3 access if possible)
4. ✅ Enable encryption at rest in S3 bucket
5. ✅ Use versioning for important documents
6. ✅ Set bucket lifecycle policies to delete old files

## Alternative: MinIO (Self-Hosted S3-Compatible)

If you want S3 functionality with self-hosted infrastructure:

1. Install MinIO
2. Update `.env`:
   ```env
   AWS_S3_ENDPOINT_URL=http://localhost:9000
   AWS_ACCESS_KEY_ID=minioadmin
   AWS_SECRET_ACCESS_KEY=minioadmin
   AWS_REGION=us-east-1
   S3_BUCKET_NAME=crm-files
   ```

This uses the same S3 code with self-hosted object storage!

---

## Getting Help

**Setup Issues?**
- Check AWS S3 documentation: https://docs.aws.amazon.com/s3/
- Check boto3 documentation: https://boto3.amazonaws.com/v1/documentation/api/latest/index.html
- Check MinIO docs if using MinIO: https://docs.min.io/

**Support:**
- Review logs in application for detailed error messages
- Ensure all 4 env variables are set correctly
- Test AWS credentials with: `aws s3 ls` (if AWS CLI installed)
