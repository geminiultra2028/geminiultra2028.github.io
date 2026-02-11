# Profile Persistence Fix

## Problem
Full Name and Staff ID entered on the Profiles page were not being saved after a page refresh. This was because when User Management synced data with the PKNSB database, it would overwrite the entire `users` array in localStorage, causing loss of any manually-entered profile data.

## Root Cause
The `/api/sync` endpoint in `server.js` performs a two-way merge between local and server data, with "app-wins" strategy for dirty data. However, when the `users` array gets synced, any profile-specific fields (name, staffId) that weren't part of the server response would be lost during the merge operation.

## Solution
Created a separate `user_profiles` table in the database to store profile-specific data independently from the main `app_users` table. This ensures profile data persists even when the users array is overwritten during sync.

## Changes Made

### 1. Database Schema (db/schema.sql)
**Added new table: `user_profiles`**
- Stores: fullName, staffId, department, approver, basicSalary
- Linked to app_users via userId foreign key
- Separate from app_users to prevent data loss during sync
- Each field has created_at and updated_at timestamps

```sql
CREATE TABLE [dbo].[user_profiles] (
    [id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [userId] NVARCHAR(50) NOT NULL UNIQUE,
    [fullName] NVARCHAR(255) NULL,
    [staffId] NVARCHAR(50) NULL,
    [department] NVARCHAR(100) NULL,
    [approver] NVARCHAR(100) NULL,
    [basicSalary] DECIMAL(18,2) NULL,
    [created_at] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    [updated_at] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_user_profiles_userId FOREIGN KEY ([userId]) REFERENCES [dbo].[app_users]([userId]) ON DELETE CASCADE
);
```

### 2. Backend API Endpoints (server.js)
**Added two new REST endpoints:**

#### GET /api/profile/:userId
- Retrieves user profile from the database
- Returns: fullName, staffId, department, approver, basicSalary, updated_at
- Response: `{ success: true, data: { ... } }`

#### POST /api/profile/:userId
- Saves or updates user profile in the database
- Accepts: fullName, staffId, department, approver, basicSalary
- Creates new record if doesn't exist, updates if exists
- Returns: Updated profile data from database

### 3. Frontend Profile Functions (script.js)

#### loadUserProfile() - Now Async
**Enhanced behavior:**
1. Loads basic user data from localStorage (from sync)
2. Fetches profile data from database `/api/profile` endpoint
3. Merges both sources (database data takes priority)
4. Populates form fields with merged data
5. Caches profile data in sessionStorage for sync contexts (PDF generation)

#### saveUserProfile() - Now Async
**Enhanced behavior:**
1. Validates all form inputs
2. **Saves to database first** (user_profiles table) - ensures persistence
3. Updates localStorage as fallback (for offline support)
4. Updates sessionStorage (currentUser)
5. Caches profile in sessionStorage (userProfileData)
6. Shows success/error messages

#### getCurrentUserProfileForPdf()
**Enhanced to support offline and cached data:**
1. Checks sessionStorage for cached userProfileData first
2. Falls back to currentUser in sessionStorage
3. Falls back to users array from localStorage
4. Ensures PDF generation works even during sync operations

#### initializeProfileForm()
**Updated to handle async operations:**
- loadUserProfile() calls are now wrapped with error handling
- Both initial load and cancel button reload are handled asynchronously

### 4. sessionStorage Usage
New key added: `userProfileData`
- Contains full profile object when loaded
- Used by PDF generation functions
- Persists profile data across sync operations
- Survives logout/login cycles (cleared on logout)

## Benefits

1. **Data Persistence**: Profile data now persists across sync operations and page refreshes
2. **Separate Storage**: User profiles are stored separately from synced user data
3. **Conflict-Free**: No more conflicts between manual entries and sync operations
4. **Offline Support**: localStorage acts as fallback when database is unavailable
5. **Cached Access**: sessionStorage caching ensures quick access for PDF generation
6. **Backward Compatible**: Works with existing user data in localStorage

## Migration Notes

- Existing users' profile data will be loaded from localStorage on first profile page access
- Data is automatically migrated to user_profiles table on first save
- No manual migration needed for existing data
- Old `name` field in app_users is still supported as fallback

## Testing Checklist

- [ ] Enter Full Name and Staff ID on Profiles page
- [ ] Click Save
- [ ] Refresh the page
- [ ] Verify Full Name and Staff ID are still displayed
- [ ] Trigger User Management sync
- [ ] Refresh the page again
- [ ] Verify profile data persists after sync
- [ ] Test PDF export includes correct name and staff ID
- [ ] Test in offline mode (localStorage fallback)

## API Error Handling

Both endpoints include comprehensive error handling:
- Returns 400 for invalid inputs
- Returns 500 for database errors
- Provides descriptive error messages
- Frontend shows user-friendly error notifications
