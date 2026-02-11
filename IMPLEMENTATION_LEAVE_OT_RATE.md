# Implementation Guide: Leave OT Rate & Public Holiday Detection

## Overview
This guide provides visual diagrams and detailed explanations of the implementation.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        displayAttendanceRecords()                        │
│                   (Display Attendance Table Records)                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────────┐
                    │  Get record.type                  │
                    └───────────────────────────────────┘
                                    │
                 ┌──────────────────┴──────────────────┐
                 │                                     │
                 ▼                                     ▼
        ┌──────────────────┐              ┌──────────────────────────┐
        │  type === 'leave'│              │  type === 'check-in'     │
        └──────────────────┘              │  (or other types)        │
                 │                        └──────────────────────────┘
                 ▼                                     │
        ┌──────────────────┐                          ▼
        │ otRateDisplay    │              ┌──────────────────────────┐
        │      = "-"       │              │  Get date & notes from   │
        │                  │              │  record or localStorage  │
        │ Skip OT fields   │              └──────────────────────────┘
        │ No modal access  │                          │
        └──────────────────┘                          ▼
                                         ┌──────────────────────────┐
                                         │ Call getOTRateForDate()  │
                                         │ with date & notes        │
                                         └──────────────────────────┘
                                                      │
                                                      ▼
                                         ┌──────────────────────────┐
                                         │ isPublicHoliday(notes)?  │
                                         └──────────────────────────┘
                                                      │
                                    ┌─────────────────┴─────────────────┐
                                    │                                   │
                                    ▼                                   ▼
                            ┌──────────────┐                  ┌──────────────┐
                            │   PH Found   │                  │  No PH Found │
                            │ autoRate:3.0×│                  │   (weekday?) │
                            └──────────────┘                  └──────────────┘
                                    │                                   │
                                    └─────────────┬─────────────────────┘
                                                  ▼
                                      ┌──────────────────────┐
                                      │ Display OT Rate in   │
                                      │ Table (3.0× or other)│
                                      └──────────────────────┘
```

---

## Flow Diagram: Leave Record Detection

```
Record Loaded
     │
     ▼
Check: record.type === 'leave' ?
     │
     ├─── YES ───────────────────────────────────────────┐
     │                                                   │
     └─── NO ────────────┐                              │
                         │                              │
                         ▼                              ▼
                  Calculate OT Rate          OT Rate = "-"
                  (weekday/sunday/PH)        No OT fields shown
                  Based on notes             No modal allowed
```

---

## isPublicHoliday() Pattern Matching Flowchart

```
Notes = "PH (Merdeka Day)"
     │
     ▼
Convert to lowercase: "ph (merdeka day)"
     │
     ├─ Starts with "ph"? ──────────────────► YES ─────┐
     │                                                  │
     ├─ Starts with "public holiday"? ──── NO          │
     │                                                  │
     ├─ Contains " ph "? ──────────────────► YES ──────┤
     │                                                  │
     ├─ Matches /\bph\s*\([^\)]*\)/ ? ──── YES ──────┤
     │   (PH with parentheses)                         │
     │                                                  │
     ├─ Matches /\bpublic holiday\b/ ? ─── NO          │
     │                                                  │
     └─ Other patterns?                                │
                                                       ▼
                                            isPublicHoliday = TRUE
                                            autoRate = 3.0×
```

---

## Data Flow: Notes Storage & Retrieval

### Old Flow (01/01/2026 Limited)
```
Record: date="2026-01-01", notes="PH"
     │
     ├─ Load record.notes ──► "PH"
     │
     ├─ Special case for 2026-01-01? ──► YES
     │  └─ Try keys: notes-2026-01-01, notes-2026-1-1
     │  └─ Force 3.0× if PH found
     │
     └─ Result: 3.0× ✅ (But only for this date!)
```

### New Flow (ANY Date)
```
Record: date="2024-12-25", notes="PH"
     │
     ├─ Load record.notes ──► "PH"
     │
     ├─ Notes empty? 
     │  ├─ NO ──► Use record.notes
     │  └─ YES ──► Try key: notes-2024-12-25
     │
     ├─ Call getOTRateForDate(date, notes)
     │  └─ Call isPublicHoliday(notes)
     │  └─ Detects "PH" ──► Returns 3.0×
     │
     └─ Result: 3.0× ✅ (Works for ANY date!)
```

---

## Code Change Detail: displayAttendanceRecords()

### Before (Lines 630-680)
```javascript
let otStartDisplay = '-';
let otEndDisplay = '-';
let otRateDisplay = '-';

if (otData) {
    otStartDisplay = otData.otStartTime || '-';
    otEndDisplay = record.checkOutTime || '-';
    // ... calculate duration
    otRateDisplay = otData.otRate ? `${otData.otRate}×` : `${autoRate}×`;
} else {
    otRateDisplay = `${autoRate}×`;
}
```

**Problem:** OT Rate displayed for ALL records, including Leave

### After (Lines 630-680)
```javascript
let otStartDisplay = '-';
let otEndDisplay = '-';
let otRateDisplay = '-';

// Hide OT fields for Leave records
if (record.type === 'leave') {
    // For Leave records, don't show OT data
    otRateDisplay = '-';
} else if (otData) {
    otStartDisplay = otData.otStartTime || '-';
    otEndDisplay = record.checkOutTime || '-';
    // ... calculate duration
    otRateDisplay = otData.otRate ? `${otData.otRate}×` : `${autoRate}×`;
} else {
    // No saved OT data, but show auto-detected rate
    otRateDisplay = `${autoRate}×`;
}
```

**Solution:** Check `record.type === 'leave'` and set OT Rate to "-"

---

## Code Change Detail: openEditOTModal()

### Before (Lines 896-910)
```javascript
function openEditOTModal(record) {
    const modal = document.getElementById('editOTModal');
    if (!modal) {
        console.error('Edit OT modal not found');
        return;
    }
    // ... proceed with opening modal
}
```

**Problem:** Modal opens for Leave records (user shouldn't edit OT for leave)

### After (Lines 896-910)
```javascript
function openEditOTModal(record) {
    // Prevent opening OT modal for Leave records
    if (record.type === 'leave') {
        alert('OT Rate cannot be edited for Leave records.');
        return;  // EXIT function here
    }

    const modal = document.getElementById('editOTModal');
    if (!modal) {
        console.error('Edit OT modal not found');
        return;
    }
    // ... proceed with opening modal
}
```

**Solution:** Add early return check for Leave type before any modal operations

---

## Code Change Detail: Notes Loading (Removed Date Limits)

### Before (Lines 935-950)
```javascript
let notesToUse = record.notes;
if (!notesToUse && (record.date.includes('2026-01-01') || record.date.includes('2026-1-1'))) {
    console.log(`[openEditOTModal] Special case: 01/01/2026 detected`);
    const altKey1 = `notes-2026-01-01`;
    const altKey2 = `notes-2026-1-1`;
    notesToUse = localStorage.getItem(altKey1) || localStorage.getItem(altKey2) || '';
}

const autoRate = getOTRateForDate(record.date, notesToUse);

// Special case for 01/01/2026 - always use auto-detected rate if it's 3.0x
if ((record.date.includes('2026-01-01') || record.date.includes('2026-1-1')) && autoRate === 3.0) {
    if (otRate) {
        otRate.value = "3.0";
    }
    // ... force 3.0× logic
} else {
    // Normal handling
    if (otRate && savedOTData && savedOTData.otRate) {
        // ... other logic
    }
}
```

**Problem:** Logic limited to 01/01/2026; doesn't work for other dates

### After (Lines 935-972)
```javascript
let notesToUse = record.notes;
if (!notesToUse) {
    const notesKey = `notes-${record.date}`;
    notesToUse = localStorage.getItem(notesKey) || '';
}

const autoRate = getOTRateForDate(record.date, notesToUse);
// ... rate labels

if (otRate) {
    otRate.value = String(autoRate);
    otRate.dataset.autoRate = autoRate;
}

const savedOTData = JSON.parse(localStorage.getItem(`ot_${record.timestamp}`) || 'null');

// Load saved rate if it exists, otherwise use auto-detected
if (otRate && savedOTData && savedOTData.otRate) {
    otRate.value = String(savedOTData.otRate);
    if (otRateNote) {
        otRateNote.textContent = `Saved rate: ${savedOTData.otRate}×`;
    }
} else if (otRateNote) {
    otRateNote.textContent = `Suggested: ${autoRate}×${rateLabel}`;
}
```

**Solution:** Use generic `notes-${record.date}` key; remove date-specific checks; uniform handling

---

## Data Structure: Record Object

```javascript
{
    timestamp: "1692345600000",      // Unique record ID
    date: "2024-12-25",              // Record date (YYYY-MM-DD)
    checkInTime: "09:00",            // Check-in time
    checkOutTime: "18:00",           // Check-out time
    time: "09:00-18:00",             // Time range
    notes: "PH (Christmas)",         // Notes field - parsed for "PH"
    type: "leave",                   // "leave", "check-in", "manual-check-in", etc.
    
    // When type === 'leave':
    // - OT Rate MUST be hidden (show "-")
    // - openEditOTModal() should return early
    // - No OT calculations performed
}
```

---

## isPublicHoliday() Function Details

**Location:** `script.js` lines 750-780

**Input:** `notes` (string from Notes field)

**Process:**
1. Convert to lowercase for case-insensitive matching
2. Check multiple patterns:
   - Starts with "ph"
   - Starts with "public holiday"
   - Contains "ph"
   - Contains "public holiday"
   - Matches regex `/\bph\s*\([^\)]*\)/` (PH with parentheses)
   - Matches regex `/\bpublic holiday\s*\([^\)]*\)/` (Public Holiday with parentheses)
   - Matches regex `/\bph\b/` (PH as whole word)
   - Matches regex `/\bpublic holiday\b/` (Public Holiday as whole word)

**Output:** `true` if any pattern matches, `false` otherwise

**Examples:**
```javascript
isPublicHoliday("PH")                           → true  ✅
isPublicHoliday("ph")                           → true  ✅
isPublicHoliday("Public Holiday")               → true  ✅
isPublicHoliday("public holiday")               → true  ✅
isPublicHoliday("PH (2024)")                    → true  ✅
isPublicHoliday("Public Holiday (Chinese New Year)") → true  ✅
isPublicHoliday("Work - PH Substitute")         → true  ✅
isPublicHoliday("Annual Leave")                 → false ❌
isPublicHoliday("Sick Leave")                   → false ❌
isPublicHoliday("")                             → false ❌
```

---

## Test Case: Leave Record Processing

### Input
```javascript
record = {
    timestamp: "1701004800000",
    date: "2024-12-25",
    checkInTime: "09:00",
    checkOutTime: "18:00",
    notes: "Christmas Leave",
    type: "leave"  // <-- KEY INDICATOR
}
```

### Table Display Processing
```
displayAttendanceRecords()
├─ record.type === 'leave'? YES
├─ otRateDisplay = '-'
├─ Skip OT calculations
└─ Table shows:
   Date: 2024-12-25
   Check In: 09:00
   Check Out: 18:00
   OT Rate: "-"  ✅
```

### Edit Modal Processing
```
openEditOTModal(record)
├─ record.type === 'leave'? YES
├─ alert('OT Rate cannot be edited for Leave records.')
├─ return  (STOP EXECUTION)
└─ Modal DOES NOT open  ✅
```

---

## Test Case: Public Holiday Detection

### Input
```javascript
record = {
    timestamp: "1703001600000",
    date: "2024-12-25",
    notes: "PH",
    type: "check-in"  // NOT leave
}
```

### Processing
```
displayAttendanceRecords()
├─ record.type === 'leave'? NO
├─ Get notes: "PH"
├─ Call getOTRateForDate("2024-12-25", "PH")
│  ├─ Call isPublicHoliday("PH")
│  │  ├─ notesLower = "ph"
│  │  ├─ startsWithPh = true ✅
│  │  └─ return true
│  └─ autoRate = 3.0
├─ otRateDisplay = '3.0×'
└─ Table shows: OT Rate: "3.0×"  ✅
```

---

## Validation Checklist

- [x] Leave type check in displayAttendanceRecords()
- [x] Leave type check in openEditOTModal() with alert
- [x] Generic notes-${date} key pattern (no date limits)
- [x] isPublicHoliday() handles multiple patterns
- [x] Removed 01/01/2026 special cases
- [x] No JavaScript errors
- [x] Backward compatible with existing data

---

## Summary

| Feature | Status | Location | Impact |
|---------|--------|----------|--------|
| Hide OT for Leave in table | ✅ Done | Lines 630-680 | Low risk |
| Hide OT for Leave in modal | ✅ Done | Lines 896-902 | Low risk |
| Remove date limit | ✅ Done | Lines 625-641, 935-972 | Medium risk |
| Support PH patterns | ✅ Existing | Lines 750-780 | No change |

All changes are **safe, backward compatible, and tested**.
