# Sync System - Quick Reference Card

## Add New Data Category to Sync

### Step 1: Add to Dirty Flags (script.js)
```javascript
const appSyncDirty = {
  // ... existing
  myNewCategory: false  // ← Add here
};
```

### Step 2: Mark Dirty When Data Changes
```javascript
// In your data save function
appSyncDirty.myNewCategory = true;
scheduleAppSync('my-new-category');
```

### Step 3: Add to fetchAllSync() (server.js)
```javascript
async function fetchAllSync(pool) {
  const [
    // ... existing
    myNewCategoryRes,  // ← Add here
  ] = await Promise.all([
    // ... existing
    pool.request().query('SELECT * FROM dbo.my_new_table'),
  ]);
  
  return {
    // ... existing
    myNewCategory: myNewCategoryRes.recordset || [],
  };
}
```

### Step 4: Add to applySync() (server.js)
```javascript
async function applySync(pool, payload = {}) {
  // ... existing code
  
  if (Array.isArray(payload.myNewCategory)) {
    await new sql.Request(tx)
      .query('DELETE FROM dbo.my_new_table;');
    
    for (const item of payload.myNewCategory) {
      // Insert logic
    }
  }
}
```

### Step 5: Merge in syncAppWithDb() (script.js)
```javascript
const mergedMyNewCategory = dirtySnapshot.myNewCategory
  ? mergeAppWins(localMyNewCategory, serverData.myNewCategory || [], keyFn)
  : serverData.myNewCategory || [];
```

## Debug Sync Issues

### Check Sync Status
```javascript
// Browser console
console.log({
  dirty: appSyncDirty,
  inProgress: appSyncInProgress,
  pending: appSyncPending,
  timerActive: appSyncTimer !== null
});
```

### View Last Sync Data
```javascript
// Show what's synced locally
console.log('Users:', JSON.parse(localStorage.getItem('users') || '[]'));
console.log('Settings:', JSON.parse(localStorage.getItem('appSettings') || '{}'));
```

### Force Sync Now
```javascript
// Override debounce, sync immediately
if (appSyncTimer) clearTimeout(appSyncTimer);
syncAppWithDb({ reason: 'debug-force' })
  .catch(err => console.error('Sync failed:', err));
```

### Check Server Connection
```javascript
// Test if server is reachable
fetch('/api/sync')
  .then(r => console.log('Server OK, status:', r.status))
  .catch(err => console.error('Server error:', err));
```

## Sync Configuration

### Change Debounce Time
```javascript
// In script.js, adjust this constant
const APP_SYNC_DEBOUNCE_MS = 1200;  // Default: 1.2 seconds
```

### Change Poll Interval
```javascript
// In script.js, adjust this constant
const APP_SYNC_POLL_MS = 30000;  // Default: 30 seconds
```

### Change Database Config
```javascript
// In server.js, set environment or edit DEFAULT_DB_CONFIG
const DEFAULT_DB_CONFIG = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'P@ssw0rd6151',
  server: process.env.DB_SERVER || 'localhost',
  port: Number(process.env.DB_PORT) || 1433,
  database: process.env.DB_NAME || 'PKNSB'
};
```

## Key Functions Reference

### Client-Side (script.js)
```javascript
// Initialize sync hooks on page load
installLocalStorageSyncHooks()

// Mark category dirty and schedule sync
markAppSyncDirtyForKey(key)

// Schedule debounced sync
scheduleAppSync(reason)

// Execute the actual sync
syncAppWithDb(options)

// Get current sync state
getStaffPortalAttendanceUiState()

// Get user key for namespacing
getAttendanceUserKey()

// Get notes storage key
getNotesStorageKey(dateString)

// Get OT storage key
getOTStorageKey(recordTimestamp)
```

### Server-Side (server.js)
```javascript
// Fetch all data from DB
fetchAllSync(pool)

// Apply synced data to DB
applySync(pool, payload)

// Execute DB operation with connection
withDb(action, overrides)

// Ensure DB schema exists
ensureDatabaseAndSchema()

// Get DB background settings
fetchBackgroundFromDb(pool)
```

## Data Key Formats

### Attendance Record Storage
```javascript
// Key format: attendance_<userKey>_<timestamp>
// Example: attendance_Master_1706776800000

const key = `${getAttendanceRecordKeyPrefix()}${record.timestamp}`;
localStorage.setItem(key, JSON.stringify({
  type: 'checkin',
  date: '2026-02-02',
  time: '09:00:00',
  timestamp: '2026-02-02T09:00:00.000Z',
  notes: 'Optional notes'
}));
```

### Notes Storage
```javascript
// Key format: notes_<userKey>_<YYYY-MM-DD>
// Example: notes_Master_2026-02-02

const key = getNotesStorageKey('2026-02-02');
localStorage.setItem(key, 'Daily notes text');

// Timestamp tracking (for conflict resolution)
const timestampKey = `notesUpdatedAt_${userKey}_${date}`;
localStorage.setItem(timestampKey, new Date().toISOString());
```

### OT Details Storage
```javascript
// Key format: ot_<userKey>_<recordTimestamp>
// Example: ot_Master_2026-02-02T09:00:00.000Z

const key = getOTStorageKey(recordTimestamp);
localStorage.setItem(key, JSON.stringify({
  otStartTime: '18:00',
  otRate: 1.5,
  otHours: 2.5,
  otPayAmount: 50.00
}));
```

## Conflict Resolution Rules

| Scenario | Rule | Result |
|----------|------|--------|
| Category dirty locally | App Wins | Local overwrites server |
| Category clean locally | Server Wins | Server overwrites local |
| Same record, different timestamps | Last-Write-Wins | Newer timestamp wins |
| Delete vs. Update | Delete Wins | Tombstone prevents resurrection |
| No server record | Create | New record inserted |
| No local record | Create | Pulled from server |

## Merge Functions

```javascript
// Local data takes precedence
mergeAppWins(localArr, remoteArr, keyFn)

// Newest timestamp wins
mergeByLatestUpdatedAt(localArr, remoteArr, keyFn, updatedAtFn)

// Normalize user access by userId (backward-compatible)
normalizeUserAccessByUserId(userAccessObj, users)

// Convert array to object keyed by field
arrayToObject(arr, keyField, valueField)

// Convert object to array
objectToArray(obj, keyField, valueField)
```

## HTTP Endpoints

### GET /api/sync
**Purpose**: Fetch all data from database  
**Response**:
```json
{
  "success": true,
  "data": {
    "users": [],
    "userAccess": [],
    "roleAccess": [],
    "appSettings": [],
    "appAssets": [],
    "attendanceRecords": [],
    "attendanceDeleted": [],
    "attendanceNotes": [],
    "otDetails": [],
    "otNotes": []
  }
}
```

### POST /api/sync
**Purpose**: Push merged data to database  
**Payload**: Same structure as GET response  
**Response**: Returns merged/synced data after DB write

### POST /api/test-connection
**Purpose**: Test database connectivity  
**Payload**:
```json
{
  "type": "sqlserver",
  "host": "localhost",
  "port": 1433,
  "name": "PKNSB",
  "user": "sa",
  "password": "..."
}
```

## Environment Variables

```bash
# Server configuration
PORT=3001
DB_USER=sa
DB_PASSWORD=P@ssw0rd6151
DB_SERVER=localhost
DB_PORT=1433
DB_NAME=PKNSB

# Optional: Logging
DEBUG=attendance-app:*
```

## Troubleshooting Commands

```javascript
// Browser Console

// See all localStorage keys
Object.keys(localStorage)

// See all users
JSON.parse(localStorage.getItem('users') || '[]')

// See all attendance records
const prefix = getAttendanceRecordKeyPrefix();
Array.from({length: localStorage.length}, (_, i) => localStorage.key(i))
  .filter(k => k.startsWith(prefix))
  .map(k => JSON.parse(localStorage.getItem(k)))

// See role access
JSON.parse(localStorage.getItem('roleAccess') || '{}')

// See user access
JSON.parse(localStorage.getItem('userAccess') || '{}')

// Monitor sync in real-time
setInterval(() => {
  if (appSyncInProgress || appSyncPending) {
    console.log('Sync:', {
      inProgress: appSyncInProgress,
      pending: appSyncPending,
      dirty: Object.entries(appSyncDirty).filter(([_, v]) => v)
    });
  }
}, 1000);
```

## Common Code Patterns

### Save New Data with Sync
```javascript
// 1. Save to localStorage
const data = { /* ... */ };
localStorage.setItem(key, JSON.stringify(data));

// 2. Mark category dirty (done automatically by hooks, but explicit here)
appSyncDirty.myCategory = true;
scheduleAppSync('save-new-data');

// 3. UI updates automatically when sync completes
// (syncAppWithDb() calls loadUsers(), renderAttendanceGraph(), etc.)
```

### Read Synced Data
```javascript
// Option 1: Raw localStorage (not recommended)
const data = JSON.parse(localStorage.getItem(key));

// Option 2: Through helper function
const users = JSON.parse(localStorage.getItem('users') || '[]');
const userAccess = JSON.parse(localStorage.getItem('userAccess') || '{}');

// Option 3: Query via function
const profile = getCurrentUserProfileForPdf();
```

### Handle Offline Changes
```javascript
// Changes are automatically stored locally
// No special handling needed

// On reconnect, sync happens automatically
// Watch the dirty flags to know when sync runs
if (Object.values(appSyncDirty).some(Boolean)) {
  console.log('Sync about to run...');
}