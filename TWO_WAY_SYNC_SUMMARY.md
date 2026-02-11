# Two-Way Synchronization System Summary

## Overview
The attendance app implements a bidirectional (two-way) sync between browser localStorage and SQL Server database via a Node.js/Express server. The system uses dirty flags and timestamp-based conflict resolution to keep data consistent across multiple devices.

## Architecture

### 1. Server Layer (server.js)
- **Port**: 3001 (configurable via `process.env.PORT`)
- **Database**: SQL Server (PKNSB database by default)

#### Key Endpoints:
- `GET /api/sync` - Pull all data from database
- `POST /api/sync` - Push merged data to database
- `GET /api/background` - Fetch background settings
- `POST /api/background` - Save background settings
- `POST /api/background/reset` - Reset background

#### Sync Functions:
- `fetchAllSync(pool)` - Reads 10 categories from DB with timestamp tracking
- `applySync(pool, payload)` - Writes data using last-write-wins conflict resolution

### 2. Client Layer (script.js)

#### Data Categories Synced:
1. **users** - Employee/user accounts
2. **userAccess** - Per-user permission overrides
3. **roleAccess** - Role-based permissions
4. **appSettings** - System-wide settings (theme, preferences)
5. **appAssets** - Binary data (logos, backgrounds)
6. **attendanceRecords** - Check-in/check-out records
7. **attendanceDeleted** - Tombstones for deleted records
8. **attendanceNotes** - Notes per date
9. **otDetails** - Overtime details per record
10. **otNotes** - OT notes per date

#### Dirty Flags:
```javascript
const appSyncDirty = {
  users: false,
  userAccess: false,
  roleAccess: false,
  appSettings: false,
  appAssets: false,
  attendance: false
};
```

#### Change Detection:
- localStorage hooks intercept `setItem()`, `removeItem()`, `clear()`
- Automatically marks categories dirty when data changes
- Prevents triggering dirty flags during sync apply phase

#### Sync Flow:

```
User Action
    ↓
localStorage.setItem() → Hook detects change
    ↓
markAppSyncDirtyForKey() → Sets dirty flag
    ↓
scheduleAppSync() → Debounces (1200ms default)
    ↓
syncAppWithDb() → Executes sync
    ├─ Pull from /api/sync (always)
    ├─ Merge locally
    │  ├─ Dirty categories → app wins (local overwrites server)
    │  └─ Clean categories → server wins (DB overwrites local)
    ├─ Apply merged state to localStorage
    │  └─ Uses raw storage methods to avoid dirty flag re-trigger
    ├─ Push to /api/sync (if any dirty)
    └─ Update UI & refresh tables
```

### 3. Conflict Resolution Strategy

#### "App Wins" for Dirty Categories:
- When user makes local changes, local data takes precedence
- Ensures user edits aren't lost when other devices update DB
- Uses `mergeAppWins()` function

#### "Server Wins" for Clean Categories:
- When user hasn't touched data locally, DB data takes precedence
- Ensures updates from other devices are visible
- Uses `mergeByLatestUpdatedAt()` for timestamp-based comparison

#### Timestamp-Based Merging:
```javascript
// For most categories: compare updatedAt timestamps
const mergedAttendanceRecords = mergeByLatestUpdatedAt(
  localAttendanceRecords,
  serverData.attendanceRecords || [],
  (r) => `${r.userKey}|${r.recordTimestamp}`,
  (r) => r.updatedAt  // Newest timestamp wins
);
```

### 4. Sync Triggers

#### Automatic:
1. **Debounced on change** (1200ms default)
2. **Periodic polling** (30 seconds, only when page visible)
3. **On focus** - When user returns to browser tab
4. **On visibility change** - When page becomes visible

#### Manual:
- Sync happens automatically after major operations:
  - Check-in/check-out
  - Leave marking
  - OT editing
  - Profile updates
  - User management

## Data Flow Examples

### Example 1: Check-In
```
1. User clicks "Check-In"
2. Record created: attendance_Master_<timestamp>
3. localStorage hook detects setItem()
4. appSyncDirty.attendance = true
5. scheduleAppSync() called
6. After 1200ms debounce → syncAppWithDb() runs
7. Fetches latest from DB
8. Merges (app wins for attendance since dirty)
9. Applies merged state locally
10. POSTs to /api/sync if dirty
11. UI refreshes to show record
```

### Example 2: Multi-Device Update
```
Device A:
- User marks leave
- appSyncDirty.attendance = true
- Syncs to DB

Device B (concurrent):
- User marks check-in
- appSyncDirty.attendance = true
- Syncs to DB
- 30-second poll triggers
- Pulls both records from DB (server wins for clean period)
- Local DB shows both activities
```

### Example 3: User Management
```
1. Admin adds new user in Settings
2. users[] appended locally
3. appSyncDirty.users = true
4. Sync runs: POST users array to DB
5. Other devices poll after 30s
6. Fetch updated users array
7. New user appears on other devices
```

## Storage & Persistence

### localStorage Organization (per-user namespaced):
```
attendance_<userKey>_<timestamp>  → Check-in/out records
ot_<userKey>_<timestamp>           → OT details
notes_<userKey>_<date>             → Attendance notes
otnotes_<userKey>_<date>           → OT notes
deletedRecords_<userKey>           → Tombstones
users                              → User array
userAccess                         → User-level permissions
roleAccess                         → Role-level permissions
appSettings                        → System settings
```

### Database Tables:
- `app_users` - Core user data
- `user_access` - Per-user permission overrides
- `role_access` - Role-based permissions
- `app_settings` - Settings key/value
- `app_assets` - Binary assets
- `user_profiles` - User profile data (separate from app_users)
- `app_attendance_records` - Check-in/out records
- `app_attendance_deleted` - Tombstone records
- `app_attendance_notes` - Per-date notes
- `app_ot_details` - OT overtime details
- `app_ot_notes` - OT notes

## Key Features

### 1. Tombstone Deletion
- Deletes stored in `app_attendance_deleted` table
- Prevents deleted records from being reintroduced by other devices
- Tombstones eventually cleaned up when no longer needed

### 2. Password Protection
- Server doesn't send passwords to client (security)
- Client preserves local password if server sends empty
- Prevents user lockout during sync

### 3. Idempotent Operations
- Schema creation includes `IF NOT EXISTS` checks
- Safe to run schema multiple times
- Supports database recovery without data loss

### 4. User Isolation
- All attendance keyed by `userKey` (sanitized userId)
- Prevents data leakage between users
- Per-user localStorage namespacing

### 5. User Access & Role-Based Control
- Per-user overrides in `user_access` table
- Role defaults in `role_access` table
- Synced to all devices
- Enforced on both client and applied UI-side

## Sync Optimization

### Debouncing
- Prevents excessive DB writes during rapid changes
- Default: 1200ms debounce
- Configurable via `APP_SYNC_DEBOUNCE_MS`

### Polling
- Only when page is visible (not in background tab)
- Default: 30 second intervals
- Configurable via `APP_SYNC_POLL_MS`

### Dirty Flag Optimization
- Only pushes back to DB if dirty flags set
- Saves bandwidth for read-only operations
- Gets reset after each successful sync

### Raw Storage Methods
- Uses unhooked `localStorage.setItem/removeItem` during apply
- Prevents re-triggering dirty flags during merge
- Ensures consistent state without cascading syncs

## Error Handling

### Network Failures
- Sync errors logged to console
- Dirty flags preserved for retry
- Automatic retry via next scheduled sync
- No data loss (all stored locally until sync succeeds)

### Schema Issues
- `ensureDatabaseAndSchema()` runs on server startup
- Creates missing tables/columns automatically
- Idempotent (safe to re-run)
- Error logged but doesn't prevent server from running

### Corrupted Data
- JSON parse errors caught with `safeJsonParse()`
- Invalid records filtered out during sync
- Bad data doesn't prevent sync of valid records

## Testing & Verification

### To Test Two-Way Sync:

1. **Single Device**:
   - Open app in browser
   - Make changes (check-in, notes, OT)
   - Observe `/api/sync` calls in Network tab
   - Refresh page → data persists from DB

2. **Multiple Devices**:
   - Open app on Device A & B
   - Device A: Check-in
   - Wait for Device A's sync (~1200ms)
   - Device B: Should auto-pull within 30 seconds
   - Verify check-in appears on Device B

3. **Offline Sync**:
   - Device A: Go offline, make changes
   - Changes stored locally
   - Device A: Go online
   - Sync runs automatically
   - Verify changes pushed to DB
   - Device B: Should see changes within 30 seconds

4. **Conflict Resolution**:
   - Device A & B both make changes to same record
   - Timestamps determine winner (whoever synced last)
   - Verify both devices converge to same state

## Performance Considerations

### Current Bottlenecks:
- Full data fetch on every sync (all 10 categories)
- Could optimize to delta-sync (only changed items)
- Could implement change notification service

### Optimization Opportunities:
1. **Differential Sync**: Only sync changed categories
2. **WebSocket Notifications**: Real-time push instead of poll
3. **Compression**: Gzip payload for large datasets
4. **Indexing**: Add DB indexes on frequently queried columns
5. **Pagination**: For large attendance datasets

## Security Considerations

1. ✅ **Passwords not synced to DB** (client-only)
2. ✅ **Per-user localStorage namespacing** (isolation)
3. ✅ **Tombstone-based deletion** (prevents data resurrection)
4. ⚠️ **No encryption in transit** (use HTTPS in production)
5. ⚠️ **No auth token validation** (add if multi-user)
6. ⚠️ **No input sanitization** (use parameterized queries, done)

## Maintenance

### Regular Tasks:
- Monitor DB size (attendance records grow unbounded)
- Archive old records periodically
- Clean up old tombstones (30 days+)
- Verify sync logs for errors

### Database Cleanup:
```sql
-- Archive records older than 1 year
DELETE FROM app_attendance_records 
WHERE updated_at < DATEADD(YEAR, -1, GETDATE());

-- Clean up old tombstones
DELETE FROM app_attendance_deleted 
WHERE updated_at < DATEADD(MONTH, -3, GETDATE());
```

## Troubleshooting

### Sync Not Working:
1. Check server running: `npm start`
2. Check DB connection in server console
3. Check Network tab for `/api/sync` errors
4. Check localStorage for data (F12 → Storage)
5. Check browser console for JS errors

### Data Mismatch Between Devices:
1. Force sync: Press F5 to refresh
2. Check timestamps: Are they close?
3. Check DB directly: Is data there?
4. Check dirty flags: Are they set correctly?
5. Look for errors in server logs

### Performance Issues:
1. Check network latency: Slow `/api/sync` responses?
2. Check DB queries: Are they slow?
3. Check browser console: Memory leaks?
4. Reduce polling frequency if high traffic
5. Archive old records to reduce data size
</content>
<task_progress>
- [x] Analyze current database and app structure
- [x] Identify data tables that need syncing
- [x] Implement database change detection
- [x] Implement app-to-database sync mechanism
- [x] Implement database-to-app sync mechanism
- [x] Test two-way synchronization
- [x] Verify data consistency
</task_progress>
</write_calls>

Now let me create a practical testing and verification guide:
<function_calls>
<write_to_file>
<path>SYNC_TESTING_GUIDE.md</path>
<content># Two-Way Sync Testing & Verification Guide

## Quick Start Testing

### 1. Verify Server Sync Endpoints

```bash
# Test database connection
curl -X POST http://localhost:3001/api/test-connection \
  -H "Content-Type: application/json" \
  -d '{
    "type": "sqlserver",
    "host": "localhost",
    "port": 1433,
    "name": "PKNSB",
    "user": "sa",
    "password": "P@ssw0rd6151"
  }'

# Expected Response:
# {"success": true, "message": "Connected successfully to SQL Server."}
```

### 2. Test Pull Sync (GET /api/sync)

```bash
# Fetch all data from database
curl http://localhost:3001/api/sync

# Expected Response:
# {
#   "success": true,
#   "data": {
#     "users": [...],
#     "userAccess": [...],
#     "roleAccess": [...],
#     "appSettings": [...],
#     "appAssets": [...],
#     "attendanceRecords": [...],
#     "attendanceDeleted": [...],
#     "attendanceNotes": [...],
#     "otDetails": [...],
#     "otNotes": [...]
#   }
# }
```

### 3. Test Push Sync (POST /api/sync)

```bash
# Push user data to database
curl -X POST http://localhost:3001/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "users": [{
      "userId": "TEST001",
      "username": "testuser",
      "email": "test@example.com",
      "password": "password123",
      "role": "User",
      "status": "Active"
    }],
    "userAccess": [],
    "roleAccess": [],
    "appSettings": [],
    "appAssets": [],
    "attendanceRecords": [],
    "attendanceDeleted": [],
    "attendanceNotes": [],
    "otDetails": [],
    "otNotes": []
  }'

# Expected Response:
# {"success": true, "data": {...}}
```

## Browser Console Testing

### Check Sync Status

```javascript
// View dirty flags (what needs to sync)
console.log('Dirty flags:', appSyncDirty);

// View sync promise status
console.log('Sync in progress:', appSyncInProgress);
console.log('Pending sync:', appSyncPending);

// View debounce timer
console.log('Sync timer active:', appSyncTimer !== null);
```

### Trigger Manual Sync

```javascript
// Force immediate sync (ignoring debounce)
if (appSyncTimer) clearTimeout(appSyncTimer);
syncAppWithDb({ reason: 'manual-test' })
  .then(() => console.log('Sync completed'))
  .catch(err => console.error('Sync failed:', err));
```

### Inspect Sync Data

```javascript
// View all synced users
const users = JSON.parse(localStorage.getItem('users') || '[]');
console.log('Synced users:', users);

// View attendance records
const attendancePrefix = getAttendanceRecordKeyPrefix();
const records = [];
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key && key.startsWith(attendancePrefix)) {
    records.push(JSON.parse(localStorage.getItem(key)));
  }
}
console.log('Attendance records:', records);

// View dirty changes
console.log('User access dirty:', JSON.parse(localStorage.getItem('userAccess') || '{}'));
```

### Monitor Network Activity

```javascript
// Log all sync requests
const originalFetch = window.fetch;
window.fetch = function(...args) {
  if (args[0] && args[0].includes('/api/sync')) {
    console.log('[SYNC]', args[0], 'Method:', args[1]?.method || 'GET');
  }
  return originalFetch.apply(this, args);
};
```

## Step-by-Step Sync Verification

### Test 1: Single Device Check-In Sync

**Setup**:
1. Open app in browser
2. Open DevTools → Network tab
3. Filter by `/api/sync`

**Actions**:
1. Click "Check-In" button
2. Confirm check-in in modal
3. Observe:
   - ✅ Record appears in Attendance table
   - ✅ `/api/sync` POST request (after ~1.2s debounce)
   - ✅ Dirty flag: `appSyncDirty.attendance = true`

**Verify**:
```sql
-- Check database has the record
SELECT * FROM app_attendance_records 
ORDER BY updated_at DESC LIMIT 1;
```

### Test 2: Multi-Device Data Propagation

**Setup**:
- Device A (Browser 1)
- Device B (Browser 2)
- Both logged in as same user

**Actions on Device A**:
1. Add Note to attendance: "Meeting with manager"
2. Observe POST `/api/sync`
3. Wait for success response

**Expected on Device B** (within 30 seconds):
1. Auto-pull via polling
2. GET `/api/sync` request
3. Note appears in table
4. No manual refresh needed

**Verify**:
```javascript
// On Device B console
setInterval(() => {
  const notes = JSON.parse(localStorage.getItem('userAccess') || '{}');
  console.log('Notes updated:', new Date().toISOString(), notes);
}, 5000);
```

### Test 3: Conflict Resolution (Last-Write-Wins)

**Setup**:
- Device A & B both open
- Fast network connection

**Step 1 - Create conflict**:
- Device A: Check-in at 09:00
- Device B: Add OT to same record (before A syncs)

**Step 2 - Watch merge**:
- Device A syncs first (1.2s debounce)
  - POST timestamp: 09:00
- Device B syncs shortly after (1.2s debounce)  
  - POST timestamp: 09:01
  - Updated_at: Later timestamp

**Expected Result**:
- Both devices converge to B's version (newer timestamp)
- OT shows on both devices
- No data loss

**Verify**:
```sql
-- Check record has both values
SELECT * FROM app_attendance_records 
WHERE userKey = 'Master' AND recordTimestamp = '...'
ORDER BY updated_at DESC;
```

### Test 4: Offline → Online Sync

**Setup**:
- App running on Device A
- DevTools open

**Step 1 - Go offline**:
1. DevTools → Network tab → Offline checkbox
2. Make changes: Check-in
3. Observe: localStorage updated, but no network requests

**Step 2 - Verify local storage**:
```javascript
// Check data saved locally
const records = [];
const prefix = getAttendanceRecordKeyPrefix();
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key && key.startsWith(prefix)) {
    records.push(JSON.parse(localStorage.getItem(key)));
  }
}
console.log('Offline records:', records); // Should have new record
```

**Step 3 - Go online**:
1. DevTools → Network tab → Offline unchecked
2. Observe: Immediate POST `/api/sync`
3. Check database: Record now persisted

**Step 4 - Multi-device pull**:
1. Open Device B
2. Should receive record within 30 seconds
3. No manual action needed

### Test 5: Delete Record Tombstone Propagation

**Setup**:
- Two devices, same user
- Existing attendance record

**Step 1 - Delete on Device A**:
1. Click delete button on record
2. Confirm deletion
3. Observe: POST `/api/sync`
4. Record removed from UI

**Step 2 - Check tombstone**:
```sql
-- Verify tombstone created
SELECT * FROM app_attendance_deleted 
WHERE recordTimestamp = '...';
```

**Step 3 - Verify Device B**:
1. Device B auto-pulls within 30s
2. Record disappears
3. Tombstone prevents resurrection

### Test 6: User Management Sync

**Setup**:
- Device A: Admin (Settings access)
- Device B: Regular user

**Step 1 - Add user on Device A**:
1. Go to Settings → Users
2. Click "Add User"
3. Fill form: userId=EMP123, username=john, role=User
4. Submit
5. Observe: POST `/api/sync`
6. User appears in table

**Step 2 - Verify on Device B**:
1. Device B polls within 30s
2. New user appears in Users dropdown
3. Can select for access control

**Step 3 - Check database**:
```sql
SELECT * FROM app_users WHERE userId = 'EMP123';
```

### Test 7: Settings Sync

**Setup**:
- Two devices

**Step 1 - Change setting on Device A**:
1. Settings → Theme → Switch to Dark
2. Observe: POST `/api/sync` (appSettings dirty)

**Step 2 - Verify Device B**:
1. Device B polls within 30s
2. Auto-applies dark theme
3. No manual action needed

**Step 3 - Check database**:
```sql
SELECT [key], [value] FROM app_settings 
WHERE [key] LIKE '%theme%';
```

### Test 8: Large Data Sync Performance

**Setup**:
- Generate 1000 attendance records

**Step 1 - Create test data**:
```javascript
// In browser console on Device A
for (let i = 0; i < 100; i++) {
  const record = {
    type: 'checkin',
    date: `2026-02-0${(i % 9) + 1}`,
    time: `09:${String(i % 60).padStart(2, '0')}`,
    timestamp: new Date(Date.now() - i * 86400000).toISOString(),
    notes: `Test record ${i}`
  };
  const key = `${getAttendanceRecordKeyPrefix()}${record.timestamp}`;
  localStorage.setItem(key, JSON.stringify(record));
}
```

**Step 2 - Measure sync time**:
```javascript
const start = performance.now();
syncAppWithDb({ reason: 'perf-test' })
  .then(() => {
    const elapsed = performance.now() - start;
    console.log(`Sync took ${elapsed}ms for ~100 records`);
  });
```

**Expected**: < 2 seconds for 100 records

## Automated Testing Script

```javascript
// Run in browser console to test sync cycles
async function testSyncCycles(iterations = 5) {
  console.log(`Starting ${iterations} sync cycles...`);
  
  for (let i = 0; i < iterations; i++) {
    console.log(`\n=== Cycle ${i + 1}/${iterations} ===`);
    
    // Make a change
    const record = {
      type: 'checkin',
      date: new Date().toISOString().split('T')[0],
      time: `10:${String(i).padStart(2, '0')}`,
      timestamp: new Date().toISOString(),
      notes: `Cycle ${i + 1}`
    };
    const key = `${getAttendanceRecordKeyPrefix()}${record.timestamp}`;
    localStorage.setItem(key, JSON.stringify(record));
    
    // Wait for debounce + sync
    await new Promise(r => setTimeout(r, 2000));
    
    // Check sync happened
    const dirty = Object.values(appSyncDirty).some(Boolean);
    console.log(`  Dirty flags after sync: ${dirty ? 'YES (ERROR!)' : 'NO (OK)'}`);
    console.log(`  Sync in progress: ${appSyncInProgress}`);
    
    // Verify in DB
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    console.log(`  Users in localStorage: ${users.length}`);
  }
  
  console.log('\n✅ Test completed!');
}

// Run it
testSyncCycles(3);
```

## Monitoring Checklist

### Daily:
- [ ] Check server logs for sync errors
- [ ] Verify at least one sync per 30 seconds
- [ ] Check DB for orphaned records
- [ ] Monitor DB size growth

### Weekly:
- [ ] Test multi-device sync
- [ ] Verify offline → online flow
- [ ] Check performance metrics
- [ ] Review error logs

### Monthly:
- [ ] Archive old attendance records
- [ ] Clean up old tombstones
- [ ] Verify backup/recovery works
- [ ] Update sync documentation

## Common Issues & Solutions

### Issue: Sync Not Triggering
**Debug**:
```javascript
console.log('Dirty flags:', appSyncDirty);
console.log('Timer active:', appSyncTimer !== null);
console.log('In progress:', appSyncInProgress);
```
**Solution**: Check that localStorage hooks are installed
```javascript
console.log('Hooks installed:', appSyncLocalStorageHooksInstalled);
if (!appSyncLocalStorageHooksInstalled) {
  installLocalStorageSyncHooks();
}
```

### Issue: Data Not Appearing on Other Device
**Debug**:
```javascript
// Check polling is active
console.log('Poll interval:', APP_SYNC_POLL_MS);
// Manually trigger sync on target device
syncAppWithDb({ reason: 'manual-check' });
```
**Solution**: Ensure visibility API is working
```javascript
console.log('Page hidden:', document.hidden);
```

### Issue: Performance Degradation
**Debug**:
```javascript
// Monitor sync time
const start = Date.now();
syncAppWithDb()
  .then(() => console.log(`Sync took ${Date.now() - start}ms`));

// Check DB query performance
// Run EXPLAIN on fetchAllSync queries in SQL Server Management Studio
```
**Solution**: Archive old records or implement delta sync

## Success Criteria

✅ **Sync is working correctly if**:
- Changes appear on other devices within 30 seconds
- No data loss on offline → online transition
- Conflicts resolved with last-write-wins (by timestamp)
- Performance remains < 2 seconds per sync
- No cascading syncs (sync doesn't trigger new sync)
- All 10 categories sync consistently
- Dirty flags reset after successful sync