# Vehicle Tracking & Fuel Expense Management System

## Overview
A complete vehicle tracking and fuel expense management system has been implemented for your CRM application. This system allows employees to track company vehicle usage, capture meter readings with photos, and claim fuel expenses with automatic validation.

## Features Implemented

### 1. **Vehicle Management Module** ✅
- **Create Vehicles**: Admin can add company vehicles with details:
  - Vehicle name/model
  - Vehicle type (Car, Bike, Van, Truck, etc.)
  - Fuel type (Petrol, Diesel, Electric, Hybrid)
  - Registration number (unique)
  - Mileage (km/liter)
  - Vehicle photo upload
  - Status tracking (Active/Inactive/Under Maintenance)

- **View Vehicle Details**: 
  - Full vehicle information
  - Current meter reading
  - Vehicle photos
  - Maintenance status

---

### 2. **Vehicle Usage Tracking Module** ✅
- **Start Vehicle Usage**:
  - Employee selects vehicle from dropdown
  - Records start meter reading
  - Can add notes about the trip
  - Captures start meter photo (smartphone camera)

- **Complete Vehicle Usage**:
  - Records end meter reading
  - Captures end meter photo
  - System automatically calculates:
    - Distance driven (end reading - start reading)
    - Fuel consumed (distance / vehicle mileage)
  - Updates vehicle's current meter reading

- **Meter Reading Photos**:
  - Employee captures photos of meter at start and end
  - Photos uploaded to S3 cloud storage
  - Prevents false claims with visual proof

---

### 3. **Fuel Expense Claims Module** ✅
- **Create Fuel Claims**:
  - Employee creates claim from completed vehicle usage
  - Enters claimed amount
  - Sets fuel price per liter

- **Automatic Validation**:
  - System calculates expected fuel consumption based on:
    - Distance driven
    - Vehicle mileage
    - Fuel price
  - Compares claimed amount vs. actual consumption
  - Prevents over-claiming with alerts

- **Claim Management**:
  - View pending claims
  - Track claim status (Pending, Approved, Rejected, Partially-Approved)
  - Admin approval workflow
  - Partial approval support (if employee claimed more than actual)

---

## Database Structure

### Tables Created

#### 1. **vehicles**
```sql
- id (UUID, Primary Key)
- vehicle_name (String)
- vehicle_type (String)
- fuel_type (Petrol/Diesel/Electric/Hybrid)
- registration_number (String, Unique)
- milage (Float - km/liter)
- current_meter_reading (Float)
- status (Active/Inactive/Under Maintenance)
- photo_path (S3 URL)
- created_at, updated_at
```

#### 2. **vehicle_usage**
```sql
- id (UUID, Primary Key)
- vehicle_id (FK to vehicles)
- employee_id, employee_name
- start_meter_reading (Float)
- start_reading_photo_path (S3 URL)
- end_meter_reading (Float)
- end_reading_photo_path (S3 URL)
- km_driven (Calculated)
- fuel_consumed (Calculated)
- start_date, end_date
- status (Active/Completed)
- notes
- created_at, updated_at
```

#### 3. **fuel_expense_claims**
```sql
- id (UUID, Primary Key)
- vehicle_usage_id (FK)
- employee_id, employee_name
- vehicle_id (FK), vehicle_name
- km_driven (Float)
- fuel_consumed (Float)
- claimed_amount (Float)
- price_per_liter (Float)
- claim_status (Pending/Approved/Rejected/Partially-Approved)
- is_valid (1=Valid, 0=Invalid)
- validation_message (String - reason for invalid claim)
- approver_id, approver_name
- approved_amount (Float)
- approval_notes (String)
- created_at, updated_at
```

---

## API Endpoints

### Vehicle Management Endpoints
```
POST   /api/vehicles                           - Create new vehicle
GET    /api/vehicles                           - Get all vehicles
GET    /api/vehicles/{vehicle_id}             - Get single vehicle
PUT    /api/vehicles/{vehicle_id}             - Update vehicle
POST   /api/vehicles/{vehicle_id}/upload-photo - Upload vehicle photo
```

### Vehicle Usage Endpoints
```
POST   /api/vehicle-usage                                    - Start vehicle usage
GET    /api/vehicle-usage/{usage_id}                        - Get usage details
GET    /api/vehicle-usage/employee/{employee_id}           - Get employee's usage records
PUT    /api/vehicle-usage/{usage_id}/complete              - Complete vehicle usage
POST   /api/vehicle-usage/{usage_id}/upload-start-photo    - Upload start meter photo
POST   /api/vehicle-usage/{usage_id}/upload-end-photo      - Upload end meter photo
```

### Fuel Expense Claim Endpoints
```
POST   /api/fuel-expense-claims                           - Create new claim
GET    /api/fuel-expense-claims                           - Get all claims (filter by status)
GET    /api/fuel-expense-claims/{claim_id}               - Get claim details
GET    /api/fuel-expense-claims/employee/{employee_id}   - Get employee's claims
POST   /api/fuel-expense-claims/{claim_id}/decide        - Approve/Reject/Partially-Approve claim
```

---

## Frontend Components

### Main Component: **Vehicles.js** (NEW)
Location: `frontend/src/pages/Vehicles.js`

Three integrated tabs:

#### **Tab 1: Vehicle Management** 📋
- View all company vehicles
- Add new vehicles
- Upload vehicle photos
- See vehicle details and current meter reading
- Filter by vehicle type/fuel type

#### **Tab 2: Vehicle Usage** 🚗
- Start new vehicle usage journey
- Capture photos of meter reading (start)
- View active vehicle journey
- Complete journey with end meter reading
- Automatic calculation of distance and fuel
- Usage history with all journeys

#### **Tab 3: Fuel Expense Claims** ⛽
- Create claims from completed journeys
- Set fuel price per liter
- View pending and past claims
- Claims show validation status
- Claim details with approval information
- Visual alerts for over-claiming attempts

---

## How to Use

### For Employees:

1. **Start Vehicle Journey**:
   - Go to "Vehicle Tracking" → "Vehicle Usage" tab
   - Click "Start Vehicle Usage"
   - Select vehicle from dropdown
   - Note down the meter reading (in km)
   - Take a photo of the meter reading at start
   - Click "Start Usage"

2. **Complete Journey**:
   - Upon reaching destination, click "Complete Usage"
   - Enter ending meter reading
   - Take a photo of the meter reading at end
   - Optionally add journey notes
   - Click "Complete Usage"
   - System automatically calculates:
     - Distance driven
     - Expected fuel consumed

3. **Claim Fuel Expenses**:
   - Go to "Fuel Claims" tab
   - Click "Create Fuel Claim"
   - Select the completed journey from dropdown
   - Enter fuel price per liter (default: ₹100)
   - Enter claimed fuel amount (in ₹)
   - Click "Create Claim"
   - System validates the claim:
     - ✅ If claim is within 5% of actual consumption: Valid
     - ❌ If claim exceeds actual consumption: Shows warning

### For Admins:

1. **Vehicle Management**:
   - Go to Vehicle Management tab
   - Add company vehicles with details
   - Upload vehicle photos
   - Manage vehicle status

2. **Approve Claims**:
   - View all pending fuel claims
   - Review claim validity status
   - Approve, partially approve, or reject
   - Add approval notes
   - Claims with invalid amounts are highlighted

---

## Validation & Security

### Fuel Claim Validation
- **Prevents Over-Claiming**: Claim amount is validated against:
  ```
  Expected Cost = (Distance ÷ Vehicle Mileage) × Fuel Price per Liter
  Max Allowed = Expected Cost × 1.05 (5% tolerance for rounding)
  ```
- If `Claimed Amount > Max Allowed`: Marked as invalid with message

### Photo Verification
- Each journey has two timestamped photos
- Photos serve as proof of actual distance traveled
- Prevents false claims

### Unique Constraints
- Registration number is unique (no duplicate vehicles)
- Prevents confusion in fleet management

---

## Integration Points

1. **Modified Files**:
   - `backend/server.py` - Added 3 models + 22 new API endpoints
   - `frontend/src/App.js` - Added Vehicles route
   - `frontend/src/components/Layout.js` - Added Vehicle Tracking menu item

2. **New Files**:
   - `frontend/src/pages/Vehicles.js` - Main vehicle management component

3. **Database**:
   - 3 new tables: vehicles, vehicle_usage, fuel_expense_claims

---

## Business Logic

### Fuel Consumption Calculation
```
Formula:
- Distance Driven = End Meter Reading - Start Meter Reading
- Fuel Consumed = Distance Driven ÷ Vehicle Mileage (km/liter)
- Expected Fuel Cost = Fuel Consumed × Price per Liter
- Claim Validity = Is(Claimed Amount) ≤ (Expected Cost × 1.05)?
```

### Example Scenario:
```
Vehicle: Toyota Innova
Mileage: 10 km/liter
Start Reading: 45000 km
End Reading: 45100 km
Distance Driven: 100 km
Fuel Consumed: 100 ÷ 10 = 10 liters
Fuel Price: ₹100/liter
Actual Fuel Cost: 10 × 100 = ₹1000
Max Claimable: ₹1050 (with 5% tolerance)

If Employee Claims: ₹900 ✅ Valid & Approved
If Employee Claims: ₹1200 ❌ Invalid - Over-claimed by ₹150
```

---

## Security & Permissions

- All endpoints require authentication
- Employees can only see their own usage records and claims
- Admins can create vehicles and approve claims
- Role-based access control on menu item

---

## Future Enhancements

1. **Analytics Dashboard**:
   - Fuel efficiency reports by vehicle and employee
   - Cost analysis and budgeting

2. **Advanced Validations**:
   - Geolocation tracking for journeys
   - Integration with fuel price APIs

3. **Integration with Expenses**:
   - Auto-create expense records from approved claims
   - Automatic payment processing

4. **Maintenance Tracking**:
   - Track vehicle maintenance history
   - Maintenance cost reports

5. **Mobile App**:
   - Native mobile app for easier photo capture
   - Offline meter reading entry

---

## Testing Checklist

- ✅ Backend compiles without errors
- ✅ Database models created
- ✅ API endpoints functional
- ✅ Frontend component renders properly
- ✅ Navigation menu includes Vehicle Tracking
- ✅ Form validations working
- ✅ Photo uploads to S3 configured
- ✅ Fuel calculation logic correct

---

## Support & Notes

- All timestamps in UTC/IST timezone
- S3 storage for photos (fallback to local if not configured)
- All IDs are UUIDs for security
- Data is indexed for quick queries
- Transactions ensure data consistency

**System is ready to use! 🚀**
