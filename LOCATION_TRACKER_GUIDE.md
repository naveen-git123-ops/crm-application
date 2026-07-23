# Location Tracker - Complete Setup Guide

## Overview
The Location Tracker Dashboard allows Admin and Manager users to track employee locations throughout their entire workday on Google Maps. It displays all punch-in and punch-out locations with timestamps and creates a visual path showing the employee's movements during the day.

## Features

### ✅ Real-time Location Visualization
- View all employee punch-in and punch-out locations on Google Maps
- See the complete route/path the employee took throughout the day
- Interactive markers with color coding:
  - **Green markers** = Punch-In locations
  - **Red markers** = Punch-Out locations
  - **Blue lines** = Travel route connecting all locations

### ✅ Flexible Filtering
- **Employee Selector**: Choose any employee from dropdown
- **Date Picker**: Select any past date to view historical location data
- **Real-time Updates**: Automatically loads location data for selected employee and date

### ✅ Detailed Location Information
- View punch times for each location
- Display exact GPS coordinates (latitude, longitude)
- Show timestamp of each punch event
- Interactive info windows with click-to-view details

### ✅ Location Table
- Complete tabular view of all locations for the day
- Sortable columns for easy reference
- Navigate directly to location on map by clicking table rows
- Includes latitude, longitude, time, and timestamp information

## Prerequisites

### Backend
- Python Flask server running
- SQLite database with attendance records containing location data
- Attendance records must have punch-in/out latitude and longitude from mobile app

### Frontend
- React 18+ or 19+
- @react-google-maps/api library
- Google Maps API key (free tier available)

### Google Maps API Setup

#### Step 1: Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a Project" > "New Project"
3. Name your project (e.g., "CRM Location Tracking")
4. Click "Create"

#### Step 2: Enable Maps API
1. In the Cloud Console, go to "APIs & Services" > "Library"
2. Search for "Maps JavaScript API"
3. Click on it and press "Enable"

#### Step 3: Create API Key
1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "API Key"
3. Copy your API key

#### Step 4: Restrict Your API Key (Recommended for Production)
1. In Credentials, click on your API key
2. Under "Application restrictions", select "HTTP referrers"
3. Add your domain(s) where the app runs
4. Under "API restrictions", select "Maps JavaScript API"
5. Save

#### Step 5: Add API Key to Frontend `.env`
```
REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

## Installation & Setup

### 1. Backend Setup

#### Add Location Tracking API Endpoint
The following endpoint is already added to `backend/server.py`:

```python
@api_router.get('/attendance/employee-locations')
def get_employee_locations(
    employee_id: str,
    date: Optional[str] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get employee's location history (punch-in/out locations) from attendance records."""
```

**Parameters:**
- `employee_id` (required): Employee ID to track
- `date` (optional): Date in format YYYY-MM-DD (defaults to today)

**Returns:**
```json
{
  "employee_id": "EMP001",
  "date": "2024-04-03",
  "locations": [
    {
      "id": "attendance_id_punch_in",
      "type": "punch_in",
      "latitude": 28.6139,
      "longitude": 77.2090,
      "time": "10:00:00",
      "timestamp": "2024-04-03T10:00:00",
      "date": "2024-04-03"
    },
    ...
  ],
  "total_locations": 4
}
```

### 2. Frontend Setup

#### Install Dependencies
```bash
cd frontend
npm install @react-google-maps/api --legacy-peer-deps
```

#### Environment Configuration
Update `frontend/.env`:
```
REACT_APP_BACKEND_URL=https://your-api-domain.com
REACT_APP_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY
```

#### Add Route to App.js
The route is already added:
```javascript
<Route
  path="/location-tracker"
  element={
    <ProtectedRoute requiredPermission="attendance">
      <Layout>
        <LocationTracker />
      </Layout>
    </ProtectedRoute>
  }
/>
```

#### Menu Item Added
The menu item "Location Tracker" is automatically added to the sidebar for Admin and Manager users with attendance permission.

## Usage

### For Admin/Manager

1. **Navigate to Location Tracker**
   - Click "Location Tracker" in the sidebar
   - Or go to `/location-tracker`

2. **Select Employee**
   - Choose an employee from the dropdown
   - Lists all active employees

3. **Select Date**
   - Pick the date you want to track
   - Can view any past date (up to today)
   - Default is today's date

4. **View Map**
   - Map automatically centers on first location
   - Green markers = Punch-In
   - Red markers = Punch-Out
   - Blue line connects all locations in order

5. **Interactive Features**
   - Click any marker to see details in popup
   - Click location in table to highlight on map
   - Zoom/pan map for better view
   - Street view available (Google Maps controls)

### Map Controls
- **Zoom**: Use mouse wheel or +/- buttons
- **Pan**: Click and drag
- **Map Type**: Toggle between Map/Satellite/Terrain view
- **Street View**: Available on specific locations

## API Response Examples

### Example 1: Employee with 4 punch events in a day
```json
{
  "employee_id": "EMP001",
  "date": "2024-04-03",
  "locations": [
    {
      "id": "att_123_punch_in",
      "type": "punch_in",
      "latitude": 28.6139,
      "longitude": 77.2090,
      "time": "10:00:00",
      "timestamp": "2024-04-03T10:00:00.000Z",
      "date": "2024-04-03"
    },
    {
      "id": "att_123_punch_out",
      "type": "punch_out",
      "latitude": 28.6159,
      "longitude": 77.2110,
      "time": "13:00:00",
      "timestamp": "2024-04-03T13:00:00.000Z",
      "date": "2024-04-03"
    },
    {
      "id": "att_124_punch_in",
      "type": "punch_in",
      "latitude": 28.6150,
      "longitude": 77.2100,
      "time": "14:00:00",
      "timestamp": "2024-04-03T14:00:00.000Z",
      "date": "2024-04-03"
    },
    {
      "id": "att_124_punch_out",
      "type": "punch_out",
      "latitude": 28.6140,
      "longitude": 77.2095,
      "time": "18:00:00",
      "timestamp": "2024-04-03T18:00:00.000Z",
      "date": "2024-04-03"
    }
  ],
  "total_locations": 4
}
```

### Example 2: Employee with no location data
```json
{
  "employee_id": "EMP002",
  "date": "2024-04-03",
  "locations": [],
  "total_locations": 0
}
```

## Data Requirements

For the Location Tracker to display location data, the following conditions must be met:

### In the Mobile App (Attendance Punch)
1. ✅ Employee enables location permission on their device
2. ✅ Device accurately captures GPS coordinates
3. ✅ Latitude and Longitude are stored in the database

### In the Database
The attendance records must have:
- `punch_in_lat` - Latitude of punch-in location
- `punch_in_lng` - Longitude of punch-in location
- `punch_out_lat` - Latitude of punch-out location (optional)
- `punch_out_lng` - Longitude of punch-out location (optional)
- `punch_in` - Time of punch-in
- `punch_out` - Time of punch-out
- `employee_id` - Employee identifier
- `date` - Date in YYYY-MM-DD format

## Access Control

### Permission Levels
- **Admin**: ✅ Full access to all employees' locations
- **Manager**: ✅ Full access to all employees' locations
- **Employee**: ❌ Cannot access Location Tracker
- **HR**: ✅ Can view (if has attendance permission)
- **Accountant**: ❌ Cannot access

### Permission Check
The Location Tracker checks:
1. User role must be Admin or Manager
2. User must have `attendance` permission
3. If not authorized, shows access denied message

## Troubleshooting

### Issue: Google Maps Not Loading
**Solution:**
1. Verify `REACT_APP_GOOGLE_MAPS_API_KEY` is set in `.env`
2. Confirm API key is enabled in Google Cloud Console
3. Check if requests are blocked by browser console errors
4. Verify CORS is properly configured

### Issue: No Location Data Showing
**Solution:**
1. Check if employee has location data in database
2. Verify punch-in/punch-out has latitude and longitude values
3. Try different date (may not have location data for selected date)
4. Check browser console for API errors

### Issue: Map Not Centering Properly
**Solution:**
1. Try selecting different employee
2. Reload the page
3. Clear browser cache
4. Try a different date with location data

### Issue: Locations Not Appearing as Markers
**Solution:**
1. Verify Google Maps API key is correct
2. Check latitude/longitude values are valid
3. Ensure locations are exact (within valid coordinate ranges)
4. Try zooming in/out on the map

## Performance Optimization

### For Large Number of Locations
1. The polyline automatically connects all locations
2. Markers are lazy-loaded on viewport
3. Consider limiting date range for historical data
4. Use pagination if more than 100 locations in a day

### Backend Optimization
The endpoint filters by:
- Single employee_id
- Single date
- Returns only non-null location coordinates

## Future Enhancements

Possible features to add:
1. **Real-time Tracking**: Live location updates during work hours
2. **Geofencing**: Set office boundaries and detect when employee leaves
3. **Route Complexity**: Show distance traveled
4. **Time Tracking**: Show time spent at each location
5. **Historical Reports**: Monthly movement patterns
6. **Export**: Download location data as KML or PDF
7. **Multiple Employees**: View multiple employees on same map
8. **Heatmaps**: Show high movement areas

## File Structure

```
frontend/
├── src/
│   ├── pages/
│   │   └── LocationTracker.js          # Main location tracker component
│   ├── components/
│   │   └── Layout.js                   # Updated with menu item
│   └── App.js                          # Updated with route
├── .env                                 # Contains GOOGLE_MAPS_API_KEY
└── package.json                        # Contains @react-google-maps/api

backend/
└── server.py                           # Contains /attendance/employee-locations endpoint
```

## Security Considerations

1. **API Key Protection**: Never commit API key to repository
   - Use `.env` files
   - Set environment variables in production
   - Use API key restrictions in Google Cloud

2. **Location Privacy**: Only authorized users can access
   - Token-based authentication required
   - Admin/Manager role required
   - API endpoint validates user permissions

3. **Location Data**: Consider privacy implications
   - Employee location tracking may require consent
   - Company privacy policy should address this
   - Consider GDPR/CCPA compliance

## Support & Debugging

### Enable Debug Logging
In LocationTracker.js:
```javascript
console.log('Loading locations:', locations);
console.log('Selected employee:', selectedEmployee);
console.log('Date:', date);
```

### API Testing
Test the backend endpoint:
```bash
curl -X GET "https://your-api/api/attendance/employee-locations?employee_id=EMP001&date=2024-04-03" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Browser DevTools
1. Open Chrome DevTools (F12)
2. Network tab: Check API requests
3. Console tab: Check for JavaScript errors
4. Application tab: Verify token is set

## Contact & Support
For issues with Location Tracker, please check:
1. Google Maps API documentation: https://developers.google.com/maps
2. React Google Maps documentation: https://react-google-maps-api-docs.netlify.app/
3. Backend API logs for errors
4. Browser console for errors
