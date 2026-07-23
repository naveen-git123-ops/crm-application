#!/usr/bin/env python3
"""
Seed the deployed CRM database via API calls
This bypasses the RDS connection issue by using the already-deployed API
"""
import requests
import json
from datetime import datetime
import warnings
warnings.filterwarnings('ignore', message='Unverified HTTPS request')

BASE_URL = "https://api.resoline.in"

# We'll need to create a bootstrap endpoint or use direct database access
# For now, let's document what needs to happen:

print("=" * 60)
print("CRM DATABASE SEEDING - DEPLOYMENT GUIDE")
print("=" * 60)
print()
print("ISSUE: RDS is not accessible from local machine")
print("SOLUTION: Run seed.py on the deployed EC2 instance")
print()
print("Steps:")
print("1. SSH into your EC2 instance:")
print("   ssh -i your-key-pair.pem ec2-user@your-ec2-public-ip")
print()
print("2. Navigate to backend directory:")
print("   cd /path/to/crm-application/backend")
print()
print("3. Run seed script:")
print("   python seed.py")
print()
print("4. Verify seeding by testing login:")
print("   curl -X POST https://api.resoline.in/api/auth/login \\")
print("     -H 'Content-Type: application/json' \\")
print("     -d '{\"email\":\"admin@resoline.in\",\"password\":\"admin123\"}'")
print()
print("=" * 60)

# Test if we can access the API
print("\n[Testing API connectivity...]")
try:
    response = requests.get(f"{BASE_URL}/api/employees", timeout=5, verify=False)
    if response.status_code in [200, 401, 403]:
        print(f"✅ API is responding (Status: {response.status_code})")
    else:
        print(f"⚠️ API returned unexpected status: {response.status_code}")
except Exception as e:
    print(f"❌ Cannot reach API: {e}")

print("\n[IMPORTANT] Admin credentials after seeding:")
print("  Email: admin@resoline.in")
print("  Password: admin123")
print("  Role: Admin")
