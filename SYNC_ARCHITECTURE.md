# Two-Way Sync Architecture Overview

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client Application)                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        index.html / script.js                     │  │
│  │                     (Attendance App Frontend)                     │  │
│  └────────────┬─────────────────────────────────────┬───────────────┘  │
│               │                                       │                  │
│               ▼                                       ▼                  │
│  ┌──────────────────────────┐         ┌─────────────────────────────┐  │
│  │    User Interface        │         │   Change Detection Hooks    │  │
│  ├──────────────────────────┤         ├─────────────────────────────┤  │
│  │ - Dashboard              │         │ localStorage.setItem()      │  │
│  │ - Attendance Table       │◄────────│ localStorage.removeItem()   │  │
│  │ - Settings               │         │ localStorage.clear()        │  │
│  │ - User Management        │         └────────┬────────────────────┘  │
│  │ - Profile               │                  │                        │
│  └──────────────────────────┘                  ▼                        │
│                 ▲                    ┌─────────────────────────────┐   │
│                 │                    │   Dirty Flags Manager       │   │
│                 │                    ├─────────────────────────────┤   │
│                 │                    │ users                       │   │
│                 │                    │ userAccess                  │   │
│                 │                    │ roleAccess                  │   │
│                 │                    │ appSettings                 │   │
│                 │                    │ appAssets                   │   │
│                 │                    │ attendance ◄────────────────┼─┐ │
│                 │                    └─────────┬────────────────────┘ │ │
│                 │                              │                      │ │
│                 └──────────────────────────────┼──────────────────────┘ │
│                                                │                        │
│  ┌──────────────────────────────────────┐     │                        │
│  │      localStorage (Per-User)         │     │                        │
│  ├──────────────────────────────────────┤     │                        │
│  │ attendance_Master_<timestamp> ◄──────┼─────┘                        │
│  │ ot_Master_<timestamp>                │                              │
│  │ notes_Master_<date>                  │                              │
│  │ otnotes_Master_<date>                │                              │
│  │ deletedRecords_Master                │                              │
│  │ users                                │                              │
│  │ userAccess                           │                              │
│  │ roleAccess                           │                              │
│  │ appSettings                          │                              │
│  │ theme_<userKey>                      │                              │
│  │ userPreferences_<userKey>            │                              │
│  └──────────────┬───────────────────────┘                              │
│                 │                                                       │
│                 ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │            Sync Engine (script.js)                               │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │                                                                   │  │
│  │  scheduleAppSync(reason)                                         │  │
│  │    ├─ Debounce: 1200ms                                           │  │
│  │    ├─ Check if dirty                                             │  │
│  │    └─ Trigger: syncAppWithDb()                                   │  │
│  │                                                                   │  │
│  │  syncAppWithDb(options)                                          │  │
│  │    ├─ PULL: GET /api/sync                                        │  │
│  │    ├─ MERGE:                                                     │  │
│  │    │  ├─ Dirty categories: Local wins (mergeAppWins)             │  │
│  │    │  └─ Clean categories: Server wins (mergeByLatestUpdatedAt)  │  │
│  │    ├─ APPLY: localStorage (raw methods, no re-trigger)           │  │
│  │    ├─ PUSH: POST /api/sync (if any dirty)                        │  │
│  │    └─ REFRESH: UI updates                                        │  │
│  │                                                                   │  │
│  │  Auto-Triggers:                                                  │  │
│  │    ├─ On focus event                                             │  │
│  │    ├─ On visibility change                                       │  │
│  │    ├─ Poll every 30 seconds (if visible)                         │  │
│  │    └─ On localStorage change (dirty flag)                        │  │
│  │                                                                   │  │
│  └────────────────────┬─────────────────────────────────────────────┘  │
│                       │                                                 │
└───────────────────────┼─────────────────────────────────────────────────┘
                        │
                        │ HTTP/HTTPS
                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Node.js/Express Server (3001)                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      API Endpoints                               │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │                                                                   │  │
│  │  GET /api/sync                                                   │  │
│  │    └─ Calls: fetchAllSync(pool)                                  │  │
│  │                                                                   │  │
│  │  POST /api/sync                                                  │  │
│  │    ├─ Calls: applySync(pool, payload)                            │  │
│  │    └─ Returns: Updated data after DB write                       │  │
│  │                                                                   │  │
│  │  GET /api/background                                             │  │
│  │  POST /api/background                                            │  │
│  │  POST /api/background/reset                                      │  │
│  │                                                                   │  │
│  │  GET /api/profile/:userId                                        │  │
│  │  POST /api/profile/:userId                                       │  │
│  │                                                                   │  │
│  └────────────────┬──────────────────────────────────────────────────┘  │
│                   │                                                      │
│                   ▼                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              Sync Functions (server.js)                          │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │                                                                   │  │
│  │  fetchAllSync(pool):                                             │  │
│  │    ├─ Query app_users                                            │  │
│  │    ├─ Query user_access                                          │  │
│  │    ├─ Query role_access                                          │  │
│  │    ├─ Query app_settings                                         │  │
│  │    ├─ Query app_assets                                           │  │
│  │    ├─ Query app_attendance_records                               │  │
│  │    ├─ Query app_attendance_deleted (tombstones)                  │  │
│  │    ├─ Query app_attendance_notes                                 │  │
│  │    ├─ Query app_ot_details                                       │  │
│  │    └─ Query app_ot_notes                                         │  │
│  │       └─ Parse JSON, filter, embed timestamps                   │  │
│  │                                                                   │  │
│  │  applySync(pool, payload):                                       │  │
│  │    ├─ Begin transaction (TX)                                     │  │
│  │    ├─ For each category:                                         │  │
│  │    │  ├─ DELETE old records                                      │  │
│  │    │  ├─ INSERT new records                                      │  │
│  │    │  ├─ Use last-write-wins if updated_at exists                │  │
│  │    │  └─ Parameterized queries (SQL injection prevention)        │  │
│  │    ├─ Commit TX (all-or-nothing)                                 │  │
│  │    └─ Return fetched data post-write                             │  │
│  │                                                                   │  │
│  │  withDb(action, overrides):                                      │  │
│  │    ├─ Create DB connection                                       │  │
│  │    ├─ Execute action                                             │  │
│  │    ├─ Handle errors                                              │  │
│  │    └─ Close connection                                           │  │
│  │                                                                   │  │
│  └────────────────┬──────────────────────────────────────────────────┘  │
│                   │                                                      │
│                   ▼                                                      │
└─────────────────────────────────────────────────────────────────────────┘
                    │
                    │ ODBC/TDS Protocol
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              SQL Server Database (PKNSB)                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ [app_users]              [user_access]     [role_access]        │  │
│  │ ├─ id (PK)               ├─ id             ├─ id                 │  │
│  │ ├─ userId                ├─ userId (FK)    ├─ role               │  │
│  │ ├─ username              ├─ settingsMenu   ├─ settingsMenu       │  │
│  │ ├─ email                 ├─ settingsPage   ├─ manualInOut        │  │
│  │ ├─ password              ├─ hideSignSv     ├─ shiftOLock         │  │
│  │ ├─ role                  ├─ updated_at     ├─ hideSignSv         │  │
│  │ ├─ status                                  ├─ updated_at         │  │
│  │ ├─ department                              │                      │  │
│  │ ├─ approver                                │                      │  │
│  │ ├─ basicSalary                             │                      │  │
│  │ └─ updated_at                              │                      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ [app_settings]           [app_assets]     [app_attendance_*]    │  │
│  │ ├─ key (PK)              ├─ key (PK)      ├─ userKey            │  │
│  │ ├─ value                 ├─ data_url      ├─ recordTimestamp    │  │
│  │ └─ updated_at            └─ updated_at    ├─ record_json        │  │
│  │                                           └─ updated_at         │  │
│  │                                                                   │  │
│  │ [user_profiles]          [app_attendance_deleted]               │  │
│  │ ├─ id (PK)               ├─ userKey       (Tombstones)          │  │
│  │ ├─ userId (FK, UQ)       ├─ recordTimestamp                     │  │
│  │ ├─ fullName              ├─ updated_at                          │  │
│  │ ├─ staffId                                                       │  │
│  │ ├─ department            [app_attendance_notes]                 │  │
│  │ ├─ approver              ├─ userKey                             │  │
│  │ ├─ basicSalary           ├─ date                                │  │
│  │ └─ updated_at            ├─ notes                               │  │
│  │                          └─ updated_at                          │  │
│  │                                                                   │  │
│  │ [app_ot_details]         [app_ot_notes]                         │  │
│  │ ├─ userKey               ├─ userKey                             │  │
│  │ ├─ recordTimestamp       ├─ date                                │  │
│  │ ├─ details_json          ├─ notes                               │  │
│  │ └─ updated_at            └─ updated_at                          │  │
│  │                                                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Sequence Diagram

### Single Device: Check-In to Database

```
Time  Browser                          Server                    Database
───────────────────────────────────────────────────────────────────────
0ms   User clicks "Check-In"
      │
10ms  saveAttendanceRecord()
      │ attendance_Master_<ts> ← localStorage.setItem()
      │ Hook fires
20ms  markAppSyncDirtyForKey()
      │ appSyncDirty.attendance = true
      │ scheduleAppSync() → setTimeout(1200ms)
      │
...   [Debounce period: 1-1.2 seconds]
      │
1200ms syncAppWithDb() executes
      ├─► GET /api/sync ──────────────────────────────────────────────►
      │                                   fetchAllSync()
      │                                   ├─ SELECT FROM app_users
      │                                   ├─ SELECT FROM app_roles
      │                                   ├─ SELECT FROM app_attendance_*
      │                                   ├─ Parse JSON
      │                                   ├─ Embed timestamps
      │                                   └─ Return 10 categories
      │                   ◄─────────────────────────────────────────────
1250ms Receive server data
      │ Merge locally:
      │ ├─ appSettings dirty? No → server wins
      │ ├─ users dirty? No → server wins
      │ └─ attendance dirty? Yes → local wins
      │
      │ Apply merged state
      │ └─ localStorage (raw methods, no re-trigger)
      │
      │ appSyncDirty.attendance = false (reset)
      │
      ├─► POST /api/sync ────────────────────────────────────────────►
      │   (attendance dirty, so included)                applySync()
      │                                                   ├─ BEGIN TX
      │                                                   ├─ DELETE old
      │                                                   ├─ INSERT new
      │                                                   ├─ COMMIT
      │                                                   └─ Fetch again
      │                   ◄─────────────────────────────────────────────
1300ms Receive updated data
      │ Update UI:
      │ ├─ loadSavedAttendanceData()
      │ ├─ updateDashboardSummaries()
      │ └─ refreshOtTables()
      │
1350ms ✓ Sync complete, ready for next change
```

### Multi-Device: Data Propagation

```
Time  Device A                  Server                    Device B
─────────────────────────────────────────────────────────────────────
0ms   User adds note
      │ setStoredNotesForDate("2026-02-02", "Meeting")
      │ localStorage dirty
10ms  scheduleAppSync()
      │ Debounce starts (1200ms)
      │
...   [Waiting 1.2 seconds]     [B polling every 30s]
      │                         Polls: GET /api/sync
1200ms syncAppWithDb()           ├─ Gets current server state
      │ Merge & apply            └─ No new data yet
      │                          
      ├─► POST /api/sync ──────►├─ Note saved to DB
      │   (attendance dirty)     │
1250ms                           Receives: Updated data
      │                          (includes new note)
      │                          ├─ localStorage updated
      │                          ├─ UI refreshed
      │                          └─ Note appears in table
      │
      ✓ Sync done              ✓ Auto-pulled within 30s
```

### Conflict Resolution: Last-Write-Wins

```
Device A                    Device B                    Server/DB
─────────────────────────────────────────────────────────────────
09:00 Check-in saved        09:00 Check-in (local)
      timestamp: 09:00      timestamp: 09:00
      updatedAt: 09:00:00   updatedAt: 09:00:00
      │                     │
09:01 Add OT details        09:01 Add note               [DB empty]
      otRate: 1.5x          notes: "Busy day"
      updatedAt: 09:01:00   updatedAt: 09:01:00
      │                     │
09:02 Sync A                09:02 Sync B
      ├─► POST record ──────────────────────────────►
      │   (timestamp: 09:01)  Record inserted
      │                       updatedAt: 09:01:00
      │                       │
      │   Sync B tries to post different version
      │   ◄─── POST record (timestamp: 09:01)
      │        But DB has updatedAt: 09:01:00
      │        Incoming updatedAt: 09:01:05
      │        INCOMING IS NEWER → Accept & overwrite
      │        (Device B's version wins!)
      │                       updatedAt: 09:01:05
      │                       │
09:03 Device A polls        ├─ Polls: GET /api/sync
      ├─ Receives B's version
      │ (newer timestamp)   └─ Gets B's version
      │ ◄─ Timestamp 09:01:05  (newer timestamp)
      │ localStorage updated
      │ UI shows B's note
      │ Note appears       ✓ Converged to B's data
                           ✓ No data loss
                           ✓ Consistent state
```

## Sync State Machine

```
                    ┌─────────────────────┐
                    │   Idle              │
                    │ (waiting for change) │
                    └──────────┬──────────┘
                               │
                       Change detected
                       (dirty flag set)
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Debouncing       │
                    │ (1200ms timer)      │
                    └──────────┬──────────┘
                               │
                     Timer expires or
                     forced sync called
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Syncing          │
                    │ (in progress)       │
                    └──────────┬──────────┘
                               │
                    ┌─ New change during sync?
                    │  └─ Yes: Set pending flag
                    │  └─ No: Continue
                    │
                    Fetch → Merge → Apply → Push
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Pending?          │
                    │ (check flag)        │
                    └──────────┬──────────┘
                               │
                        ┌──────┴──────┐
                        │             │
                       Yes            No
                        │             │
                        ▼             ▼
              Reschedule    ┌──────────────────┐
              sync NOW      │   Idle (reset)   │
                        └──────────────────┘
```

## Timestamp Resolution Strategy

```
Merge Logic:

For each item in merged set:
  ├─ If dirty (locally changed):
  │  └─ Use local version (app wins)
  │
  └─ If clean (not locally changed):
     ├─ Compare timestamps:
     │  ├─ local.updatedAt > remote.updatedAt?
     │  │  └─ Yes: Use local (newer)
     │  │
     │  └─ remote.updatedAt >= local.updatedAt?
     │     └─ Yes: Use remote (newer, DB wins for ties)
     │
     └─ If timestamps equal or missing:
        └─ Use remote (DB is source of truth)
```

## Error Recovery Flow

```
Network Error:
  └─ Sync fails
     ├─ Log error to console
     ├─ Preserve dirty flags
     ├─ DO NOT reset localStorage
     └─ Retry on next trigger (poll/focus/change)

DB Connection Error:
  └─ applySync() throws
     ├─ Rollback transaction
     ├─ Error response sent
     ├─ Client preserves dirty flags
     └─ Next sync attempt retries

Data Validation Error:
  └─ Invalid JSON in record_json
     ├─ Skip corrupted record
     ├─ Continue with valid records
     ├─ Log error
     └─ Data isn't lost (stays in DB)

Schema Missing:
  └─ ensureDatabaseAndSchema() on startup
     ├─ Create tables
     ├─ Add columns if needed
     ├─ Idempotent (safe to re-run)
     └─ Server continues running
```

## Performance Characteristics

```
Single Sync Cycle (typical):
  GET /api/sync: 100-200ms
  ├─ Network latency: 50ms
  ├─ DB fetch 10 categories: 40ms
  └─ JSON serialization: 10ms

  Merge logic: 10-50ms
  ├─ Compare arrays: 5ms
  ├─ Merge categories: 3ms
  └─ Timestamp comparisons: 2ms

  Apply locally: 50-100ms
  ├─ localStorage writes: 40ms
  ├─ UI refresh: 10ms
  └─ Event handlers: 50ms

  POST /api/sync (if dirty): 100-200ms
  ├─ Network latency: 50ms
  ├─ DB transaction: 50ms
  ├─ Insert/Update: 30ms
  └─ Fetch result: 20ms

Total: ~300-500ms per full sync

Optimizations possible:
  - Delta sync (only changed categories): -30%
  - WebSocket instead of polling: -50%
  - Batch operations: -20%
  - Connection pooling: -10%