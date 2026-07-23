# Vehicle Tracking System - Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### Step 1: Access the Vehicle Tracking Module
1. Login to your CRM application
2. Look for "Vehicle Tracking" in the left sidebar (new menu item with ⛽ icon)
3. Click to open the Vehicle Tracking page

### Step 2: Create Your First Vehicle (Admin Only)
1. Click the "Vehicle Management" tab
2. Click "Add New Vehicle" button
3. Fill in the details:
   - **Vehicle Name**: e.g., "Toyota Innova - DEL-001"
   - **Vehicle Type**: Select Car/Bike/Van/Truck
   - **Fuel Type**: Select Petrol/Diesel/Electric/Hybrid
   - **Registration Number**: e.g., "DL-01-AB-1234" (must be unique)
   - **Mileage**: e.g., "12.5" (km per liter)
4. Click "Create Vehicle"
5. Upload a photo of the vehicle (optional)

### Step 3: Employee Starts Vehicle Journey
1. Go to "Vehicle Usage" tab
2. Click "Start Vehicle Usage"
3. Fill in:
   - **Select Vehicle**: Choose from dropdown
   - **Start Meter Reading**: Current odometer reading (e.g., 45000)
   - **Notes**: Optional notes about the trip
4. System displays active vehicle info
5. **Take a meter reading photo** using the camera option

### Step 4: Complete the Journey
1. At trip end, click "Complete Usage"
2. Enter:
   - **End Meter Reading**: Final odometer reading (e.g., 45050)
   - **Notes**: Optional notes
3. **Take end meter reading photo**
4. System automatically calculates:
   - Distance: 50 km
   - Fuel used: 50/12.5 = 4 liters

### Step 5: Create Fuel Expense Claim
1. Go to "Fuel Claims" tab
2. Click "Create Fuel Claim"
3. Select the completed journey from dropdown
4. Set fuel price (default ₹100/liter)
5. Enter claimed amount (system shows expected cost)
6. Click "Create Claim"
7. System validates:
   - ✅ Expected cost: 4L × ₹100 = ₹400
   - ✅ Max allowed: ₹420 (with 5% margin)
   - ✅ If you claim ≤₹420: VALID
   - ❌ If you claim >₹420: INVALID with alert

---

## 📊 Key Features at a Glance

| Feature | Tab | What It Does |
|---------|-----|-------------|
| 📋 Vehicle Management | Tab 1 | Create vehicles, upload photos, track status |
| 🚗 Vehicle Usage | Tab 2 | Start/Complete journeys, capture meter photos |
| ⛽ Fuel Claims | Tab 3 | Create claims, validate amounts, track approvals |

---

## 💡 Tips & Tricks

### For Accurate Claims:
- Always photograph the meter reading clearly
- Record meter reading to exact numbers (no rounding)
- Fill in journey notes for transparency
- Claim fuel amounts based on actual consumption

### Validation Example:
```
Vehicle: Maruti Swift (18 km/liter)
Distance: 36 km
Fuel Used: 36 ÷ 18 = 2 liters
Fuel Price: ₹95/liter

Actual Cost: 2 × 95 = ₹190
Max Claimable: ₹190 × 1.05 = ₹199.50

✅ Claim ₹185: VALID
✅ Claim ₹199: VALID  
❌ Claim ₹210: INVALID (over-claimed)
```

---

## ⚠️ Important Notes

1. **Unique Registration Numbers**: Each vehicle must have a unique registration number
2. **Photo Evidence**: Both start and end meter photos are required
3. **Active Journeys**: Only one journey can be active per employee at a time
4. **Completed Required**: Journey must be completed before creating claims
5. **Validation**: Invalid claims can still be submitted but will be flagged for admin

---

## 🔧 API Information (For Developers)

### Base URL:
```
http://your-domain/api
```

### Sample cURL Commands:

**Create Vehicle:**
```bash
curl -X POST http://localhost:8000/api/vehicles \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vehicle_name": "Toyota Innova",
    "vehicle_type": "Car",
    "fuel_type": "Diesel",
    "registration_number": "DL-01-AB-1234",
    "milage": 12.5
  }'
```

**Start Usage:**
```bash
curl -X POST http://localhost:8000/api/vehicle-usage \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vehicle_id": "uuid-here",
    "employee_id": "EMP-001",
    "employee_name": "John Doe",
    "start_meter_reading": 45000,
    "notes": "Trip to office"
  }'
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Vehicle not showing in dropdown | Create vehicle first in Vehicle Management tab |
| Photo upload fails | Check S3 configuration or internet connection |
| Can't complete journey | Journey must have been started first |
| Claim validation failing | Check if claimed amount exceeds calculated consumption |
| Authorization error | Ensure you're logged in and token is valid |

---

## 📞 Support

For issues or feature requests:
1. Check logs in browser console (F12)
2. Verify API connectivity
3. Ensure all required fields are filled
4. Check date/time synchronization on device

---

## 🎯 Next Steps

1. ✅ Set up 2-3 test vehicles
2. ✅ Test complete journey flow
3. ✅ Test photo capture and upload
4. ✅ Test fuel claim validation
5. ✅ Test admin approval workflow
6. ✅ Train employees on usage

**System Ready! Start tracking vehicles now! 🎉**
