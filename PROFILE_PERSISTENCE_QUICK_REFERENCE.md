# Quick Reference: Profile Persistence Implementation

## Files Modified
1. **db/schema.sql** - Added user_profiles table
2. **server.js** - Added GET/POST /api/profile endpoints
3. **script.js** - Enhanced profile load/save functions
4. PROFILE_PERSISTENCE_FIX.md - Full documentation (this folder)

## Key Data Flow

### On Page Load (Profiles Page)
```
initializeProfileForm()
  → loadUserProfile() [ASYNC]
    → Fetch from /api/profile/:userId
    → Merge with localStorage users data
    → Cache in sessionStorage.userProfileData
    → Populate form fields
```

### On Save (Form Submit)
```
saveUserProfile() [ASYNC]
  → POST /api/profile/:userId [Database First]
  → Update localStorage.users [Fallback]
  → Update sessionStorage.currentUser
  → Cache in sessionStorage.userProfileData
  → Refresh display
```

### On PDF Generation
```
getCurrentUserProfileForPdf()
  → Check sessionStorage.userProfileData [Cached Profile]
  → Fallback to sessionStorage.currentUser
  → Fallback to localStorage.users
  → Return profile object
```

## Storage Hierarchy

```
Database (Primary)
  └─ user_profiles table
      └─ Persistent across syncs
      └─ Survives app restarts

SessionStorage (Cached)
  ├─ currentUser [Basic user data]
  └─ userProfileData [Full profile cached]
      └─ Used by PDF generation
      └─ Cleared on logout

LocalStorage (Fallback)
  └─ users array [Synced data]
      └─ Profile fields preserved on load
      └─ Acts as offline fallback
```

## Database Schema

### user_profiles Table
| Column | Type | Notes |
|--------|------|-------|
| id | INT IDENTITY | Primary key |
| userId | NVARCHAR(50) UNIQUE | Foreign key to app_users |
| fullName | NVARCHAR(255) | User's display name |
| staffId | NVARCHAR(50) | Employee ID |
| department | NVARCHAR(100) | Department name |
| approver | NVARCHAR(100) | Manager/Approver name |
| basicSalary | DECIMAL(18,2) | Monthly salary |
| created_at | DATETIME2 | Creation timestamp |
| updated_at | DATETIME2 | Last update timestamp |

## API Endpoints

### GET /api/profile/:userId
Retrieves profile data from database
```javascript
fetch('/api/profile/USER123')
  .then(r => r.json())
  .then(json => console.log(json.data))
// Returns: { fullName, staffId, department, approver, basicSalary, updated_at }
```

### POST /api/profile/:userId
Saves profile data to database
```javascript
fetch('/api/profile/USER123', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fullName: 'John Doe',
    staffId: 'EMP001',
    department: 'Engineering',
    approver: 'Jane Smith',
    basicSalary: 5000
  })
})
.then(r => r.json())
.then(json => console.log(json.data))
// Returns: Saved profile data from database
```

## Important Notes

1. **Database is Source of Truth**: Profile data from user_profiles table takes priority
2. **Async Operations**: loadUserProfile() and saveUserProfile() are async
3. **Caching**: sessionStorage.userProfileData is used for sync contexts
4. **Fallback Support**: Works offline using localStorage as fallback
5. **Schema Migration**: Run schema.sql to create user_profiles table
6. **No Data Loss**: Existing data in localStorage is preserved on first load

## Troubleshooting

### Profile not saving
- Check browser console for fetch errors
- Verify database connection in server.js
- Ensure /api/profile endpoint is accessible
- Check user_profiles table exists in database

### Profile not loading after sync
- Clear sessionStorage.userProfileData
- Refresh page to reload from database
- Check database has user_profiles table
- Verify userId matches between tables

### PDF shows incorrect name
- Ensure sessionStorage.userProfileData is set
- Check getCurrentUserProfileForPdf() cache logic
- Verify profile page was accessed before PDF export

## Testing Commands

```javascript
// Check cached profile
console.log(JSON.parse(sessionStorage.getItem('userProfileData')))

// Check current user
console.log(JSON.parse(sessionStorage.getItem('currentUser')))

// Check localStorage users
console.log(JSON.parse(localStorage.getItem('users')))

// Manually trigger sync
await fetch('/api/sync', { method: 'POST', body: JSON.stringify({}) })

// Test API endpoint
fetch('/api/profile/USER123').then(r => r.json()).then(console.log)
```
