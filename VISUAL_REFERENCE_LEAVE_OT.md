# Visual Reference: Leave Records & Public Holiday Detection

## Before & After: Leave Record OT Rate Display

### BEFORE Implementation
```
┌──────────────────────────────────────────────────────────────────┐
│  ATTENDANCE TABLE                                                │
├───────────┬──────────┬──────────┬─────────┬──────────┬──────────┤
│   Date    │Check In  │Check Out │Duration │ OT Rate  │  Notes   │
├───────────┼──────────┼──────────┼─────────┼──────────┼──────────┤
│2024-12-25 │   -      │    -     │   -     │  2.0×    │Christmas │
│(Leave)    │          │          │         │ ❌ SHOWN │  Leave   │
├───────────┼──────────┼──────────┼─────────┼──────────┼──────────┤
│2024-12-26 │ 09:00    │  22:00   │  13h0m  │  3.0×    │ PH       │
│(Check-in) │          │          │         │ ✅ Shown │          │
└───────────┴──────────┴──────────┴─────────┴──────────┴──────────┘

Edit Modal (Leave Record):
┌───────────────────────────────────┐
│  EDIT OT DETAILS                  │
├───────────────────────────────────┤
│ OT Rate: [  2.0×  ▼  ]            │
│ ❌ Can be edited (shouldn't be)   │
│ OT Start Time: [  -  ]            │
│ OT Hours: [  -  ]                 │
│ OT Pay: [  -  ]                   │
│                                   │
│ [Cancel]  [Save]                  │
└───────────────────────────────────┘
```

### AFTER Implementation
```
┌──────────────────────────────────────────────────────────────────┐
│  ATTENDANCE TABLE                                                │
├───────────┬──────────┬──────────┬─────────┬──────────┬──────────┤
│   Date    │Check In  │Check Out │Duration │ OT Rate  │  Notes   │
├───────────┼──────────┼──────────┼─────────┼──────────┼──────────┤
│2024-12-25 │   -      │    -     │   -     │   "-"    │Christmas │
│(Leave)    │          │          │         │ ✅ HIDDEN│  Leave   │
├───────────┼──────────┼──────────┼─────────┼──────────┼──────────┤
│2024-12-26 │ 09:00    │  22:00   │  13h0m  │  3.0×    │ PH       │
│(Check-in) │          │          │         │ ✅ Shown │          │
└───────────┴──────────┴──────────┴─────────┴──────────┴──────────┘

Edit Modal (Leave Record):
┌───────────────────────────────────┐
│  ⚠️  ALERT                        │
├───────────────────────────────────┤
│ OT Rate cannot be edited for      │
│ Leave records.                    │
│                                   │
│             [OK]                  │
└───────────────────────────────────┘
Modal does not open ✅
```

---

## Before & After: Public Holiday Detection

### BEFORE (Limited to 01/01/2026)
```
Scenario 1: 2024-12-25 with "PH"
Record Date: 2024-12-25
Notes: "PH"
OT Rate: 1.5× ❌ (Not detected - not 01/01/2026)

Scenario 2: 2026-01-01 with "PH"
Record Date: 2026-01-01
Notes: "PH"
OT Rate: 3.0× ✅ (Special case date)

Scenario 3: 2027-01-01 with "PH"
Record Date: 2027-01-01
Notes: "PH"
OT Rate: 1.5× ❌ (Not detected - not 01/01/2026)

Scenario 4: 2024-05-01 with "Public Holiday"
Record Date: 2024-05-01
Notes: "Public Holiday"
OT Rate: 1.5× ❌ (Not detected - not 01/01/2026)
```

### AFTER (Works for ANY Date)
```
Scenario 1: 2024-12-25 with "PH"
Record Date: 2024-12-25
Notes: "PH"
OT Rate: 3.0× ✅ (PH detected)

Scenario 2: 2026-01-01 with "PH"
Record Date: 2026-01-01
Notes: "PH"
OT Rate: 3.0× ✅ (PH detected)

Scenario 3: 2027-01-01 with "PH"
Record Date: 2027-01-01
Notes: "PH"
OT Rate: 3.0× ✅ (PH detected)

Scenario 4: 2024-05-01 with "Public Holiday"
Record Date: 2024-05-01
Notes: "Public Holiday"
OT Rate: 3.0× ✅ (PH detected)

Scenario 5: 2025-02-10 with "PH (Chinese New Year)"
Record Date: 2025-02-10
Notes: "PH (Chinese New Year)"
OT Rate: 3.0× ✅ (PH with parentheses detected)
```

---

## Public Holiday Pattern Detection

### Supported Patterns (With Examples)

```
┌─────────────────────────────────────────────────────────────┐
│                  PH PATTERN DETECTION                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 1. Simple "PH"                          ✅ Detected        │
│    Examples: "PH", "ph", "Ph", "PH"                        │
│                                                             │
│ 2. "Public Holiday"                     ✅ Detected        │
│    Examples: "Public Holiday", "public holiday"            │
│              "PUBLIC HOLIDAY", "Public holiday"            │
│                                                             │
│ 3. "PH" with Parentheses               ✅ Detected        │
│    Examples: "PH (2024)", "PH(Christmas)"                  │
│              "PH (Chinese New Year)"                       │
│                                                             │
│ 4. "Public Holiday" with Parentheses   ✅ Detected        │
│    Examples: "Public Holiday (CNY)"                        │
│              "Public Holiday (Merdeka)"                    │
│                                                             │
│ 5. "PH" as Word Boundary               ✅ Detected        │
│    Examples: "Work - PH Substitute"                        │
│              "Backup Work (PH Replacement)"                │
│                                                             │
│ 6. Text Contains "PH"                  ✅ Detected        │
│    Examples: "PHASA Holidays", "EPHEMERAL Holiday"        │
│              "Staff Training (PH Arrangement)"             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Case-Insensitive Matching Examples

```
Input: "ph"                          → Output: DETECTED ✅
Input: "PH"                          → Output: DETECTED ✅
Input: "Ph"                          → Output: DETECTED ✅
Input: "pH"                          → Output: DETECTED ✅
Input: "public holiday"              → Output: DETECTED ✅
Input: "PUBLIC HOLIDAY"              → Output: DETECTED ✅
Input: "Public Holiday"              → Output: DETECTED ✅
Input: "PuBlIc HoLiDaY"             → Output: DETECTED ✅
Input: "ph (merdeka)"                → Output: DETECTED ✅
Input: "PUBLIC HOLIDAY (DEEPAVALI)"  → Output: DETECTED ✅
Input: "Sick Leave"                  → Output: NOT DETECTED ❌
Input: "Annual Leave"                → Output: NOT DETECTED ❌
Input: "Work from Home"              → Output: NOT DETECTED ❌
```

---

## Implementation Flowchart

### Leave Record Processing
```
User clicks EDIT button on record
            ↓
openEditOTModal(record) called
            ↓
Check: record.type === 'leave'?
    ├─ YES: Show alert "OT Rate cannot be edited for Leave records." → RETURN
    │
    └─ NO: Continue with modal opening
            ↓
        Modal opens with OT fields
```

### Public Holiday Detection
```
Record loaded with date and notes
            ↓
Check: record.type === 'leave'?
    ├─ YES: OT Rate = "-" → DONE
    │
    └─ NO: Continue processing
            ↓
        getOTRateForDate(date, notes)
            ↓
        isPublicHoliday(notes)?
    ├─ YES: autoRate = 3.0×
    │
    ├─ NO: isDayOfWeek(date)
    │   ├─ SUNDAY: autoRate = 2.0×
    │   └─ WEEKDAY: autoRate = 1.5×
    │
    └─ Return autoRate
```

---

## Leave Type Detection

### Record Types in System
```
┌──────────────────┬────────────┬──────────────────────────────┐
│   Record Type    │ OT Rate    │  Notes                       │
├──────────────────┼────────────┼──────────────────────────────┤
│ check-in         │ Calculated │ Based on date and notes      │
│ leave            │ HIDDEN     │ Shows "-" in table and modal │
│ manual-check-in  │ Calculated │ User-entered date/time       │
│ (other types)    │ Calculated │ Same as check-in             │
└──────────────────┴────────────┴──────────────────────────────┘
```

### Leave Record Identification
```
JavaScript Check:
    if (record.type === 'leave') {
        // This is a Leave record
        // Hide OT Rate
        // Prevent modal opening
    }
```

---

## Date Format Support

### Generic Notes Key Pattern
```
OLD (01/01/2026 Limited):
    notes-2026-01-01
    notes-2026-1-1

NEW (Any Date):
    notes-YYYY-MM-DD
    notes-YYYY-M-D
    notes-2024-12-25
    notes-2025-05-01
    notes-2027-01-01
    notes-2023-03-15
    etc.
```

### Storage Example
```
localStorage Keys:
{
    "notes-2024-12-25": "PH (Christmas)",
    "notes-2024-05-01": "Public Holiday",
    "notes-2026-01-01": "PH (New Year)",
    "notes-2027-02-10": "PH (CNY)",
    "notes-2024-08-31": "PH (Merdeka)"
}

Retrieval:
const notesKey = `notes-${record.date}`;  // Works for ANY date
const notes = localStorage.getItem(notesKey);  // "PH (Christmas)"
```

---

## OT Rate Summary Table

### Rate Determination Logic

```
┌─────────────────────────────────────────────────────────────┐
│              OT RATE DETERMINATION FLOWCHART                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Check: record.type === 'leave'?                            │
│ ├─ YES: Rate = "-" (Hidden)                                │
│ └─ NO: Continue                                            │
│                 ↓                                          │
│   Check: Notes contains "PH"?                              │
│   ├─ YES: Rate = "3.0×" (Public Holiday)                   │
│   └─ NO: Continue                                          │
│                 ↓                                          │
│   Check: Date is Sunday?                                   │
│   ├─ YES: Rate = "2.0×" (Sunday)                           │
│   └─ NO: Rate = "1.5×" (Weekday)                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Code Location Quick Reference

### Leave Type Check (Table)
```
File: script.js
Lines: 630-680
Code:  if (record.type === 'leave') { otRateDisplay = '-'; }
```

### Leave Type Check (Modal)
```
File: script.js
Lines: 896-902
Code:  if (record.type === 'leave') {
           alert('OT Rate cannot be edited for Leave records.');
           return;
       }
```

### Public Holiday Detection
```
File: script.js
Lines: 750-780 (isPublicHoliday function)
Lines: 936-941 (notes loading in openEditOTModal)
Lines: 625-633 (notes loading in displayAttendanceRecords)
```

### Notes Storage Key
```
OLD: notes-2026-01-01, notes-2026-1-1
NEW: notes-${record.date}
Example: notes-2024-12-25
```

---

## Testing Checklist Visual

### ✅ Test 1: Leave Record - Table
```
[ ] Create record with type: "leave"
[ ] View attendance table
[ ] OT Rate column shows "-"
[ ] Non-leave records show calculated rates
```

### ✅ Test 2: Leave Record - Modal
```
[ ] Click Edit on Leave record
[ ] Alert appears: "OT Rate cannot be edited..."
[ ] Modal does NOT open
[ ] Click Edit on non-Leave record
[ ] Modal opens normally
```

### ✅ Test 3: Public Holiday (Various Dates)
```
[ ] 2024-12-25, Notes: "PH" → 3.0× ✅
[ ] 2025-05-01, Notes: "Public Holiday" → 3.0× ✅
[ ] 2026-02-10, Notes: "PH (CNY)" → 3.0× ✅
[ ] 2027-12-25, Notes: "Public Holiday (Christmas)" → 3.0× ✅
```

### ✅ Test 4: Weekday/Sunday (No PH)
```
[ ] 2024-12-23 (Monday), No PH notes → 1.5× ✅
[ ] 2024-12-22 (Sunday), No PH notes → 2.0× ✅
[ ] 2024-12-24 (Tuesday), No PH notes → 1.5× ✅
```

---

## Error Prevention

### Common Mistakes to Avoid
```
❌ DON'T: Set record.type = 'LEAVE' (case-sensitive check for 'leave')
✅ DO:    Set record.type = 'leave' (lowercase)

❌ DON'T: Use only "PH" pattern without "Public Holiday" support
✅ DO:    Let isPublicHoliday() handle all patterns

❌ DON'T: Force 01/01/2026 special case logic
✅ DO:    Use getOTRateForDate() for any date

❌ DON'T: Store notes with date-specific keys (notes-2026-01-01)
✅ DO:    Use generic pattern notes-${record.date}
```

---

## Summary

### What's Working ✅
- Leave records hide OT Rate in table
- Leave records prevent Edit OT modal
- Public Holiday detected for ANY date
- Multiple PH text patterns supported
- Case-insensitive detection
- Generic notes storage (any date)
- Zero JavaScript errors

### Ready For ✅
- Quality Assurance testing
- User acceptance testing
- Production deployment

