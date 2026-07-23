# Late Punch-In Approval Feature

## Overview
Implements an approval workflow for employees who punch in after 10:30 AM. Late punch-ins require admin approval before the employee is marked as Present. If rejected, the employee is marked as Absent.

## How It Works

### Employee Flow
1. Employee punches in after 10:30 AM
2. System detects late punch-in and calculates minutes late
3. Attendance status is set to "Pending Approval" (not "Present" or "Late")
4. Employee can see their punch-in but status shows as pending approval
5. Once admin approves/rejects, status updates accordingly

### Admin Flow
1. Admin navigates to "Late Punch-In Approvals" tab in Attendance page
2. Views all pending late punch-in requests sorted by date
3. For each request, sees:
   - Employee name and ID
   - Punch-in date and time
   - Minutes late from 10:30 AM
   - Request timestamp
4. Can approve (mark as Present) or reject (mark as Absent)
5. List updates in real-time

## Database Schema

### `late_punch_in_requests` Table
```sql
- id (UUID, Primary Key)
- attendance_id (Foreign Key → attendance.id)
- employee_id (Indexed)
- employee_name
- punch_in_time (HH:MM:SS format)
- minutes_late (Integer - minutes after 10:30)
- status (Enum: Pending, Approved, Rejected)
- approver_id (UUID - Admin who approved/rejected)
- approver_name (Admin's name)
- approval_reason (Optional text)
- punch_in_date (YYYY-MM-DD)
- requested_at (Timestamp when created)
- approved_at (Timestamp when approved/rejected)
```

## API Endpoints

### 1. Get Pending Late Punch-In Requests
**GET** `/api/attendance/late-punch-in-requests`
- Query param: `status=Pending` (can be Approved, Rejected)
- Auth: Admin only
- Returns: Array of LatePunchInRequest objects

### 2. Approve/Reject Late Punch-In
**POST** `/api/attendance/late-punch-in-approve`
- Body:
  ```json
  {
    "request_id": "uuid",
    "status": "Approved" or "Rejected",
    "reason": "optional reason text"
  }
  ```
- Auth: Admin only
- Updates attendance status based on decision
- Returns: Confirmation message and new attendance status

### 3. Punch-In with Late Detection
**POST** `/api/attendance/punch`
- When punch_in action after 10:30 AM:
  - Sets attendance status to "Pending Approval"
  - Creates LatePunchInRequest record automatically
  - Returns `is_late: true` and `minutes_late: X`

## Frontend Components

### Attendance Page Changes
- New tab: "Late Punch-In Approvals" (Admin only)
- Displays table with pending requests
- Approve/Reject buttons for each request
- Refresh button to fetch latest requests
- Loading state during operations
- Success/error toast notifications

## Status Workflow

```
Punch In (after 10:30 AM)
    ↓
Status: "Pending Approval"
Late Request Created (Status: Pending)
    ↓
Admin Reviews
    ↓
    ├→ Approve
    │    ├→ Attendance Status: "Present"
    │    └→ Request Status: "Approved"
    │
    └→ Reject
         ├→ Attendance Status: "Absent"
         └→ Request Status: "Rejected"
```

## Testing Steps

1. **Create a late punch-in:**
   - Login as employee
   - Click "Punch In" after 10:30 AM
   - Observe status shows "Pending Approval"

2. **View as Admin:**
   - Login as Admin
   - Go to Attendance → "Late Punch-In Approvals" tab
   - See the pending request with employee details

3. **Approve:**
   - Click "Approve" button
   - Attendance status changes to "Present"
   - Request moves to history

4. **Reject:**
   - Create another late punch-in
   - Click "Reject" button
   - Attendance status changes to "Absent"
   - Request moves to history

## Important Notes

- Late punch-in is defined as: punch_in_time > 10:30:00
- Only punches after 10:30:00 trigger the approval flow
- Early punches (before or at 10:30) are marked as "Present" immediately
- Approval can only happen once per late punch-in request
- Admin can view approval history by filtering status in API query

## Future Enhancements

- Bulk approval of multiple late punch-ins
- Approval deadline (auto-approve if not reviewed within X hours)
- Customizable late time threshold (not hardcoded to 10:30)
- Email notifications to employees on approval/rejection
- Approval reason tracking for auditing
