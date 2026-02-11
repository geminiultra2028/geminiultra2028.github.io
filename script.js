// Attendance App - Fixed Version
// This version fixes all reported issues

// Authentication Check - Redirect to login if not authenticated
function checkAuthentication() {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    if (isLoggedIn !== 'true') {
        // User is not authenticated, redirect to login
        window.location.href = 'login.html';
        return false;
    }

    return true;
}

function initializeTravelAllowanceFilters() {
    const periodEl = document.getElementById('travelPeriodType');
    const monthEl = document.getElementById('travelMonth');
    const monthGroup = document.getElementById('travelMonthGroup');
    const yearEl = document.getElementById('travelYear');

    const now = new Date();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentYear = String(now.getFullYear());

    populateYearOptions(yearEl, 2020, 2050);
    if (periodEl) periodEl.value = 'monthly';
    if (monthEl) monthEl.value = currentMonth;
    if (yearEl) yearEl.value = currentYear;

    const syncUi = () => {
        if (monthGroup && periodEl) {
            monthGroup.style.display = periodEl.value === 'yearly' ? 'none' : '';
        }
    };

    const rerender = () => {
        syncUi();
        renderTravelAllowanceTable();
    };

    const bind = (el) => {
        if (el && !el.dataset.travelBound) {
            el.dataset.travelBound = 'true';
            el.addEventListener('change', rerender);
        }
    };

    bind(periodEl);
    bind(monthEl);
    bind(yearEl);

    syncUi();
    renderTravelAllowanceTable();
}

let latestAttendanceRecords = [];

function parseOtRateValue(value) {
    const n = parseFloat(String(value).replace(/×$/, ''));
    if (Math.abs(n - 1.5) < 0.01) return 1.5;
    if (Math.abs(n - 2.0) < 0.01) return 2.0;
    if (Math.abs(n - 3.0) < 0.01) return 3.0;
    return null;
}

function parseOtHoursValue(otHours, otDuration) {
    const hoursNum = parseFloat(otHours);
    if (!Number.isNaN(hoursNum) && hoursNum > 0) return hoursNum;
    const s = String(otDuration || '').trim();
    if (!s || s === '-') return 0;
    const hMatch = s.match(/(\d+(?:\.\d+)?)\s*h/i);
    const mMatch = s.match(/(\d+)\s*m/i);
    if (hMatch) {
        const h = parseFloat(hMatch[1]) || 0;
        const m = mMatch ? (parseFloat(mMatch[1]) || 0) : 0;
        return h + m / 60;
    }
    const colon = s.match(/^(\d+)\s*:\s*(\d+)/);
    if (colon) {
        const h = parseInt(colon[1], 10) || 0;
        const m = parseInt(colon[2], 10) || 0;
        return h + m / 60;
    }
    const num = parseFloat(s);
    return Number.isFinite(num) ? num : 0;
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildOtRows(periodType, month, year) {
    const allRows = buildAttendanceExportRows();
    if (!Array.isArray(allRows)) return [];
    const y = String(year);
    const m = String(month).padStart(2, '0');
    const prefix = periodType === 'yearly' ? `${y}-` : `${y}-${m}`;

    return allRows
        .filter(r => r && typeof r.date === 'string' && r.date.startsWith(prefix))
        .filter(r => {
            const hasOt = String(r.otStart || '').trim() || String(r.otDuration || '').trim();
            return Boolean(hasOt);
        })
        .map(r => {
            const rate = parseOtRateValue(r.otRate) || getOTRateForDate(r.date, r.notes || '');
            const hours = parseOtHoursValue(r.otHours, r.otDuration);
            const notes = (getStoredOTNotesForDate(r.date) || r.notes || '').trim();
            return {
                ...r,
                rate,
                hours,
                notes
            };
        });
}

function renderOtFormTable() {
    const periodTypeEl = document.getElementById('otFormPeriodType');
    const monthEl = document.getElementById('otFormMonth');
    const yearEl = document.getElementById('otFormYear');
    const tbody = document.querySelector('#otFormTable tbody');
    if (!periodTypeEl || !monthEl || !yearEl || !tbody) return;

    const rows = buildOtRows(periodTypeEl.value || 'monthly', monthEl.value, yearEl.value);

    const html = rows.map(r => {
        const h15 = r.rate && Math.abs(r.rate - 1.5) < 0.01 ? r.hours.toFixed(2) : '';
        const h20 = r.rate && Math.abs(r.rate - 2.0) < 0.01 ? r.hours.toFixed(2) : '';
        const h30 = r.rate && Math.abs(r.rate - 3.0) < 0.01 ? r.hours.toFixed(2) : '';
        const notesValue = escapeHtml(r.notes || '');
        const otStart = escapeHtml(r.otStart || '');
        const otEnd = escapeHtml(r.otEnd || r.checkOut || '');
        const shift = escapeHtml(r.shift || '');
        const dateDisplay = escapeHtml(r.date || '-');
        const recordTsAttr = r.recordTimestamp ? `data-record-timestamp="${escapeHtml(r.recordTimestamp)}"` : '';

        return `
            <tr>
                <td>${dateDisplay}</td>
                <td>${otStart || '-'}</td>
                <td>${otEnd || '-'}</td>
                <td>${h15}</td>
                <td>${h20}</td>
                <td>${h30}</td>
                <td>${shift || '-'}</td>
                <td>
                    <input type="text" class="form-control ot-notes-input" data-date="${dateDisplay}" value="${notesValue}" placeholder="-" />
                </td>
                <td>
                    <button class="btn btn-sm btn-delete" data-action="delete-ot" ${recordTsAttr} title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = html || '<tr><td colspan="9" style="text-align:center; padding:12px;">No OT records for the selected period.</td></tr>';
}

function renderOtApprovalTable() {
    const periodTypeEl = document.getElementById('otApprovalPeriodType');
    const monthEl = document.getElementById('otApprovalMonth');
    const yearEl = document.getElementById('otApprovalYear');
    const tbody = document.querySelector('#otApprovalTable tbody');
    if (!periodTypeEl || !monthEl || !yearEl || !tbody) return;

    const rows = buildOtRows(periodTypeEl.value || 'monthly', monthEl.value, yearEl.value);
    const profile = getCurrentUserProfileForPdf();
    const displayName = profile.name || profile.username || profile.staffId || '-';

    const html = rows.map((r, idx) => {
        const notesValue = escapeHtml(r.notes || '');
        const otStart = escapeHtml(r.otStart || '');
        const otEnd = escapeHtml(r.otEnd || r.checkOut || '');
        const dateDisplay = escapeHtml(r.date || '-');
        const recordTsAttr = r.recordTimestamp ? `data-record-timestamp="${escapeHtml(r.recordTimestamp)}"` : '';
        return `
            <tr>
                <td>${idx + 1}</td>
                <td>${dateDisplay}</td>
                <td>${escapeHtml(displayName)}</td>
                <td>${otStart || '-'}</td>
                <td>${otEnd || '-'}</td>
                <td>
                    <input type="text" class="form-control ot-notes-input" data-date="${dateDisplay}" value="${notesValue}" placeholder="-" />
                </td>
                <td>
                    <button class="btn btn-sm btn-delete" data-action="delete-ot" ${recordTsAttr} title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = html || '<tr><td colspan="7" style="text-align:center; padding:12px;">No OT records for the selected period.</td></tr>';
}

function refreshOtTables() {
    renderOtFormTable();
    renderOtApprovalTable();
}

function bindOtNotesSync(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;

    table.addEventListener('keydown', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        if (!target.classList.contains('ot-notes-input')) return;
        if (e.key === 'Enter') {
            e.preventDefault();
            target.blur();
        }
    });

    table.addEventListener('blur', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (!target.classList.contains('ot-notes-input')) return;
        const date = target.dataset.date;
        if (!date) return;
        setStoredOTNotesForDate(date, target.value || '');
        refreshOtTables();
    }, true);

    table.addEventListener('click', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        const btn = target.closest('[data-action="delete-ot"]');
        if (!btn) return;
        const ts = btn.getAttribute('data-record-timestamp');
        if (ts) {
            deleteRecord(ts);
        }
    });
}

function initializeOtTables() {
    const now = new Date();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentYear = String(now.getFullYear());

    const formPeriodType = document.getElementById('otFormPeriodType');
    const formMonth = document.getElementById('otFormMonth');
    const formMonthGroup = document.getElementById('otFormMonthGroup');
    const formYear = document.getElementById('otFormYear');

    const approvalPeriodType = document.getElementById('otApprovalPeriodType');
    const approvalMonth = document.getElementById('otApprovalMonth');
    const approvalMonthGroup = document.getElementById('otApprovalMonthGroup');
    const approvalYear = document.getElementById('otApprovalYear');

    populateYearOptions(formYear, 2020, 2050);
    populateYearOptions(approvalYear, 2020, 2050);

    if (formPeriodType) formPeriodType.value = 'monthly';
    if (formMonth) formMonth.value = currentMonth;
    if (formYear) formYear.value = currentYear;

    if (approvalPeriodType) approvalPeriodType.value = 'monthly';
    if (approvalMonth) approvalMonth.value = currentMonth;
    if (approvalYear) approvalYear.value = currentYear;

    const syncUi = () => {
        if (formMonthGroup && formPeriodType) {
            formMonthGroup.style.display = formPeriodType.value === 'yearly' ? 'none' : '';
        }
        if (approvalMonthGroup && approvalPeriodType) {
            approvalMonthGroup.style.display = approvalPeriodType.value === 'yearly' ? 'none' : '';
        }
    };

    const bindFilter = (el, handler) => {
        if (el && !el.dataset.otBound) {
            el.dataset.otBound = 'true';
            el.addEventListener('change', handler);
        }
    };

    const rerender = () => {
        syncUi();
        refreshOtTables();
    };

    bindFilter(formPeriodType, rerender);
    bindFilter(formMonth, rerender);
    bindFilter(formYear, rerender);
    bindFilter(approvalPeriodType, rerender);
    bindFilter(approvalMonth, rerender);
    bindFilter(approvalYear, rerender);

    bindOtNotesSync('otFormTable');
    bindOtNotesSync('otApprovalTable');

    const otFormTabBtn = document.querySelector('[data-tab="ot-form-tab"]');
    if (otFormTabBtn && !otFormTabBtn.dataset.otBound) {
        otFormTabBtn.dataset.otBound = 'true';
        otFormTabBtn.addEventListener('click', rerender);
    }

    const otApprovalTabBtn = document.querySelector('[data-tab="ot-approval-tab"]');
    if (otApprovalTabBtn && !otApprovalTabBtn.dataset.otBound) {
        otApprovalTabBtn.dataset.otBound = 'true';
        otApprovalTabBtn.addEventListener('click', rerender);
    }

    rerender();
}

function sanitizePdfText(value) {
    const raw = String(value ?? '')
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Keep to basic ASCII for the built-in Base14 fonts.
    let out = '';
    for (let i = 0; i < raw.length; i++) {
        const code = raw.charCodeAt(i);
        out += code >= 32 && code <= 126 ? raw[i] : '?';
    }
    return out;
}

function pdfEscapeText(value) {
    return sanitizePdfText(value)
        .replaceAll('\\', '\\\\')
        .replaceAll('(', '\\(')
        .replaceAll(')', '\\)');
}

function createPdfWithTextTable({ title, columns, rows, generatedOn }) {
    const encoder = new TextEncoder();
    const fmt = (n) => {
        const s = Number(n).toFixed(3);
        return s.replace(/\.000$/, '').replace(/(\.\d*?)0+$/, '$1');
    };

    const pageWidth = 841.89; // A4 landscape width (pt)
    const pageHeight = 595.28; // A4 landscape height (pt)
    const margin = 24;

    const titleFontSize = 14;
    const metaFontSize = 9;
    const headerFontSize = 9;
    const cellFontSize = 8;

    const headerHeight = 18;
    const rowHeight = 16;
    const cellPadX = 4;

    const tableX = margin;
    const tableWidth = pageWidth - margin * 2;

    // Preferred column widths (pt). Notes column takes the remaining width.
    const preferred = {
        'Date': 60,
        'Check In': 45,
        'Check Out': 45,
        'Duration': 55,
        'OT Start': 45,
        'OT End': 45,
        'OT Duration': 55,
        'OT Rate': 40,
        'OT Pay (RM)': 55,
        'Shift': 45,
        'Notes': 0
    };

    let widths = columns.map(c => (Object.prototype.hasOwnProperty.call(preferred, c) ? preferred[c] : 0));
    let fixed = 0;
    const flexIdx = [];
    for (let i = 0; i < widths.length; i++) {
        if (widths[i] > 0) fixed += widths[i];
        else flexIdx.push(i);
    }
    const remaining = tableWidth - fixed;
    const perFlex = flexIdx.length ? Math.max(80, remaining / flexIdx.length) : 0;
    flexIdx.forEach(i => {
        widths[i] = perFlex;
    });

    // Scale down if we overflow.
    const totalW = widths.reduce((a, b) => a + b, 0);
    if (totalW > tableWidth) {
        const scale = tableWidth / totalW;
        widths = widths.map(w => w * scale);
    }

    const xStarts = [tableX];
    for (let i = 0; i < widths.length; i++) {
        xStarts.push(xStarts[i] + widths[i]);
    }

    // Pagination
    const titleY = pageHeight - margin;
    const metaY = titleY - 16;
    const tableTopY = metaY - 22;
    const availableHeight = tableTopY - margin;
    const rowsPerPage = Math.max(1, Math.floor((availableHeight - headerHeight) / rowHeight));
    const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage));
    // Calculate dynamic row height that fills the available space
    const dynamicRowHeight = rowsPerPage > 0 ? (availableHeight - headerHeight) / rowsPerPage : rowHeight;

    const approxCharWidth = cellFontSize * 0.5;
    const maxCharsByCol = widths.map(w => Math.max(1, Math.floor((w - cellPadX * 2) / approxCharWidth)));
    const truncate = (text, maxChars) => {
        const t = sanitizePdfText(text);
        if (t.length <= maxChars) return t;
        if (maxChars <= 3) return t.slice(0, maxChars);
        return t.slice(0, maxChars - 3) + '...';
    };

    const pageStreams = [];
    for (let p = 0; p < pageCount; p++) {
        const start = p * rowsPerPage;
        const pageRows = rows.slice(start, start + rowsPerPage);
        const rowCount = pageRows.length;

        const tableHeight = headerHeight + rowCount * dynamicRowHeight;
        const tableBottomY = tableTopY - tableHeight;

        let s = '';

        // Title
        s += 'BT\n/F2 ' + fmt(titleFontSize) + ' Tf\n0 0 0 rg\n1 0 0 1 ' + fmt(margin) + ' ' + fmt(titleY) + ' Tm\n(' + pdfEscapeText(title) + ') Tj\nET\n';

        // Meta
        const metaText = generatedOn ? `Generated on ${generatedOn.toLocaleString()}   Page ${p + 1} / ${pageCount}` : `Page ${p + 1} / ${pageCount}`;
        s += 'BT\n/F1 ' + fmt(metaFontSize) + ' Tf\n0.42 0.45 0.50 rg\n1 0 0 1 ' + fmt(margin) + ' ' + fmt(metaY) + ' Tm\n(' + pdfEscapeText(metaText) + ') Tj\nET\n';

        // Header background
        const headerY0 = tableTopY - headerHeight;
        s += '0.40 0.49 0.92 rg\n';
        s += fmt(tableX) + ' ' + fmt(headerY0) + ' ' + fmt(tableWidth) + ' ' + fmt(headerHeight) + ' re f\n';

        // Header text
        s += '0 0 0 rg\n';
        for (let c = 0; c < columns.length; c++) {
            const tx = xStarts[c] + cellPadX;
            const ty = headerY0 + 5;
            s += 'BT\n/F2 ' + fmt(headerFontSize) + ' Tf\n1 1 1 rg\n1 0 0 1 ' + fmt(tx) + ' ' + fmt(ty) + ' Tm\n(' + pdfEscapeText(columns[c]) + ') Tj\nET\n';
        }

        // Rows
        for (let r = 0; r < rowCount; r++) {
            const rowTop = headerY0 - r * dynamicRowHeight;
            const rowY0 = rowTop - dynamicRowHeight;

            // Alternate background (light gray)
            if (r % 2 === 0) {
                s += '0.98 0.98 0.99 rg\n';
                s += fmt(tableX) + ' ' + fmt(rowY0) + ' ' + fmt(tableWidth) + ' ' + fmt(dynamicRowHeight) + ' re f\n';
            }

            for (let c = 0; c < columns.length; c++) {
                const raw = pageRows[r][c] ?? '';
                const tx = xStarts[c] + cellPadX;
                const ty = rowY0 + 4;
                const t = truncate(raw, maxCharsByCol[c]);
                s += 'BT\n/F1 ' + fmt(cellFontSize) + ' Tf\n0 0 0 rg\n1 0 0 1 ' + fmt(tx) + ' ' + fmt(ty) + ' Tm\n(' + pdfEscapeText(t) + ') Tj\nET\n';
            }
        }

        // Grid (stroke)
        s += '0.86 0.87 0.89 RG\n0.5 w\n';
        // Outer border
        s += fmt(tableX) + ' ' + fmt(tableBottomY) + ' ' + fmt(tableWidth) + ' ' + fmt(tableHeight) + ' re S\n';

        // Vertical lines
        for (let i = 1; i < xStarts.length - 1; i++) {
            const vx = xStarts[i];
            const vTop = tableTopY;
            s += fmt(vx) + ' ' + fmt(tableBottomY) + ' m ' + fmt(vx) + ' ' + fmt(vTop) + ' l S\n';
        }

        // Horizontal lines (header + rows)
        s += fmt(tableX) + ' ' + fmt(headerY0) + ' m ' + fmt(tableX + tableWidth) + ' ' + fmt(headerY0) + ' l S\n';
        for (let r = 1; r <= rowCount; r++) {
            const hy = headerY0 - r * dynamicRowHeight;
            s += fmt(tableX) + ' ' + fmt(hy) + ' m ' + fmt(tableX + tableWidth) + ' ' + fmt(hy) + ' l S\n';
        }

        pageStreams.push(encoder.encode(s));
    }

    // Build PDF (uncompressed content streams)
    const chunks = [];
    let offset = 0;
    const addString = (str) => {
        const b = encoder.encode(str);
        chunks.push(b);
        offset += b.length;
    };
    const addBytes = (b) => {
        chunks.push(b);
        offset += b.length;
    };

    const firstPageId = 5;
    const firstContentId = firstPageId + pageCount;
    const lastObjId = firstContentId + pageCount - 1;
    const size = lastObjId + 1;
    const offsets = new Array(size).fill(0);

    addString('%PDF-1.3\n');

    // 1: Catalog
    offsets[1] = offset;
    addString('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    // 2: Pages
    offsets[2] = offset;
    const kids = Array.from({ length: pageCount }, (_, i) => `${firstPageId + i} 0 R`).join(' ');
    addString(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n`);

    // 3: Helvetica
    offsets[3] = offset;
    addString('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

    // 4: Helvetica-Bold
    offsets[4] = offset;
    addString('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n');

    // Page objects
    for (let i = 0; i < pageCount; i++) {
        const pageId = firstPageId + i;
        const contentId = firstContentId + i;
        offsets[pageId] = offset;
        addString(
            `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /MediaBox [0 0 ${fmt(pageWidth)} ${fmt(pageHeight)}] /Contents ${contentId} 0 R >>\nendobj\n`
        );
    }

    // Content streams
    for (let i = 0; i < pageCount; i++) {
        const contentId = firstContentId + i;
        const contentBytes = pageStreams[i];
        offsets[contentId] = offset;
        addString(`${contentId} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
        addBytes(contentBytes);
        addString('\nendstream\nendobj\n');
    }

    // xref
    const xrefOffset = offset;
    addString(`xref\n0 ${size}\n`);
    addString('0000000000 65535 f \n');

    const pad10 = (n) => String(n).padStart(10, '0');
    for (let i = 1; i <= lastObjId; i++) {
        addString(`${pad10(offsets[i])} 00000 n \n`);
    }

    // trailer
    addString('trailer\n');
    addString(`<< /Size ${size} /Root 1 0 R >>\n`);
    addString('startxref\n');
    addString(`${xrefOffset}\n`);
    addString('%%EOF\n');

    // concat
    const out = new Uint8Array(offset);
    let pos = 0;
    for (const c of chunks) {
        out.set(c, pos);
        pos += c.length;
    }
    return out;
}

// Verify authentication before running any dashboard code
if (!checkAuthentication()) {
    // Not authenticated. index.html already guards this case too, but we avoid throwing here
    // because it prevents the rest of the dashboard JS from initializing and makes the UI appear "dead".
}

// =============================
// Per-user Attendance Storage
// =============================
// Attendance data is persisted in localStorage. Because localStorage is shared across all users
// in the same browser/profile, we MUST namespace all attendance-related keys by the logged-in user.

function sanitizeStorageKeyPart(value) {
    return String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 64) || 'Master';
}

function getAttendanceUserKey() {
    try {
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        const rawKey = currentUser.userId || currentUser.username || 'Master';
        return sanitizeStorageKeyPart(rawKey);
    } catch (e) {
        return 'Master';
    }
}

function normalizeDateKey(dateString) {
    if (!dateString || typeof dateString !== 'string') return '';
    if (!dateString.includes('-')) return dateString;
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    const [y, m, d] = parts;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function getAttendanceRecordKeyPrefix() {
    return `attendance_${getAttendanceUserKey()}_`;
}

function getDeletedRecordsStorageKey() {
    return `deletedRecords_${getAttendanceUserKey()}`;
}

function normalizeDeletedRecordId(value) {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') {
        return String(value).trim();
    }
    if (typeof value === 'object') {
        // Common legacy shapes: { timestamp }, { key }, { id }
        if (value.timestamp != null) return String(value.timestamp).trim();
        if (value.recordTimestamp != null) return String(value.recordTimestamp).trim();
        if (value.key != null) return String(value.key).trim();
        if (value.id != null) return String(value.id).trim();
    }
    return '';
}

function getDeletedRecordIdSet(attendancePrefix) {
    const ids = new Set();

    const addArray = (arr) => {
        if (!Array.isArray(arr)) return;
        arr.forEach(entry => {
            const id = normalizeDeletedRecordId(entry);
            if (id) ids.add(id);

            if (entry && typeof entry === 'object') {
                // Some older builds stored the localStorage key under different fields.
                const candidates = [entry.key, entry.recordKey, entry.storageKey];
                candidates.forEach(c => {
                    const cid = normalizeDeletedRecordId(c);
                    if (cid) ids.add(cid);
                });
            }
        });
    };

    const addFromStorageKey = (storageKey) => {
        try {
            const raw = JSON.parse(localStorage.getItem(storageKey) || '[]');
            addArray(raw);
        } catch (e) {
            // ignore parse errors
        }
    };

    // Current per-user key
    addFromStorageKey(getDeletedRecordsStorageKey());
    // Legacy global key (older builds)
    addFromStorageKey('deletedRecords');

    // Some legacy deletes stored only the numeric suffix; add derived key forms too.
    Array.from(ids).forEach(id => {
        if (/^\d+$/.test(id)) {
            if (attendancePrefix) ids.add(`${attendancePrefix}${id}`);
            ids.add(`attendance_${id}`);
        }
    });

    return ids;
}

function getNotesStorageKey(dateString) {
    const normalized = normalizeDateKey(dateString);
    return `notes_${getAttendanceUserKey()}_${normalized}`;
}

function getStoredNotesForDate(dateString) {
    try {
        const normalized = normalizeDateKey(dateString);
        const scopedKey = getNotesStorageKey(normalized);
        const legacyKey1 = `notes-${dateString}`;
        const legacyKey2 = `notes-${normalized}`;
        return localStorage.getItem(scopedKey) || localStorage.getItem(legacyKey1) || localStorage.getItem(legacyKey2) || '';
    } catch (e) {
        return '';
    }
}

function setStoredNotesForDate(dateString, notes) {
    const key = getNotesStorageKey(dateString);
    const value = String(notes || '').trim();
    if (value) {
        localStorage.setItem(key, value);
    } else {
        localStorage.removeItem(key);
    }
}

function getOTNotesStorageKey(dateString) {
    const normalized = normalizeDateKey(dateString);
    return `otnotes_${getAttendanceUserKey()}_${normalized}`;
}

function getStoredOTNotesForDate(dateString) {
    try {
        const normalized = normalizeDateKey(dateString);
        const scopedKey = getOTNotesStorageKey(normalized);
        return localStorage.getItem(scopedKey) || '';
    } catch (e) {
        return '';
    }
}

function setStoredOTNotesForDate(dateString, notes) {
    const key = getOTNotesStorageKey(dateString);
    const value = String(notes || '').trim();
    if (value) {
        localStorage.setItem(key, value);
    } else {
        localStorage.removeItem(key);
    }
}

function getOTStorageKey(recordTimestamp) {
    return `ot_${getAttendanceUserKey()}_${recordTimestamp}`;
}

function migrateLegacyAttendanceStorageIfNeeded() {
    // Legacy behavior stored all users' attendance in global keys like:
    // - attendance_<epoch>
    // - deletedRecords
    // - ot_<timestamp>
    // - notes-<date>
    // We migrate those legacy keys ONLY into the Master user's namespace.
    const userKey = getAttendanceUserKey();
    if (userKey !== 'Master') return;

    const migrationFlag = 'attendanceMigration_v2_done';
    if (sessionStorage.getItem(migrationFlag) === 'true') return;

    const attendancePrefix = getAttendanceRecordKeyPrefix();
    const legacyAttendanceKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && /^attendance_\d+$/.test(key)) {
            legacyAttendanceKeys.push(key);
        }
    }

    // Move attendance_\d+ -> attendance_Master_\d+
    const migratedKeys = [];
    legacyAttendanceKeys.forEach(oldKey => {
        const suffix = oldKey.slice('attendance_'.length);
        const newKey = `${attendancePrefix}${suffix}`;
        if (localStorage.getItem(newKey) == null) {
            localStorage.setItem(newKey, localStorage.getItem(oldKey));
        }
        localStorage.removeItem(oldKey);
        migratedKeys.push(newKey);
    });

    // Move deletedRecords -> deletedRecords_Master (merge if both exist)
    try {
        const legacyDeleted = JSON.parse(localStorage.getItem('deletedRecords') || '[]');
        if (Array.isArray(legacyDeleted) && legacyDeleted.length) {
            const scopedKey = getDeletedRecordsStorageKey();
            const existing = JSON.parse(localStorage.getItem(scopedKey) || '[]');
            const merged = Array.from(new Set([...(Array.isArray(existing) ? existing : []), ...legacyDeleted]));
            localStorage.setItem(scopedKey, JSON.stringify(merged));
        }
    } catch (e) {
        // ignore parse errors
    }
    localStorage.removeItem('deletedRecords');

    // Move OT + Notes keys associated with migrated records
    migratedKeys.forEach(k => {
        try {
            const record = JSON.parse(localStorage.getItem(k) || 'null');
            if (!record) return;

            if (record.timestamp) {
                const legacyOtKey = `ot_${record.timestamp}`;
                const newOtKey = getOTStorageKey(record.timestamp);
                const legacyOtVal = localStorage.getItem(legacyOtKey);
                if (legacyOtVal != null && localStorage.getItem(newOtKey) == null) {
                    localStorage.setItem(newOtKey, legacyOtVal);
                }
                localStorage.removeItem(legacyOtKey);
            }

            if (record.date) {
                const normalizedDate = normalizeDateKey(record.date);
                const newNotesKey = getNotesStorageKey(record.date);
                const legacyKeys = [
                    `notes-${record.date}`,
                    `notes-${normalizedDate}`
                ];
                legacyKeys.forEach(legacyNotesKey => {
                    const legacyNotesVal = localStorage.getItem(legacyNotesKey);
                    if (legacyNotesVal != null && localStorage.getItem(newNotesKey) == null) {
                        localStorage.setItem(newNotesKey, legacyNotesVal);
                    }
                    localStorage.removeItem(legacyNotesKey);
                });
            }
        } catch (e) {
            // ignore per-record migration errors
        }
    });

    sessionStorage.setItem(migrationFlag, 'true');
}

// Initialize Clock
function startClock() {
    updateRealtimeClock();
    setInterval(updateRealtimeClock, 1000);
    console.log("Clock started");
}

// Start clock when DOM is ready
document.addEventListener('DOMContentLoaded', startClock);

// Summary View Type Handler
document.addEventListener('DOMContentLoaded', function() {
    // View Toggle Handler
    const monthlyViewBtn = document.getElementById('monthlyViewBtn');
    const yearlyViewBtn = document.getElementById('yearlyViewBtn');
    const monthlyViewSection = document.getElementById('monthlyViewSection');
    const yearlyViewSection = document.getElementById('yearlyViewSection');
    
    if (monthlyViewBtn && yearlyViewBtn && monthlyViewSection && yearlyViewSection) {
        monthlyViewBtn.addEventListener('click', function() {
            monthlyViewBtn.classList.add('active');
            yearlyViewBtn.classList.remove('active');
            monthlyViewSection.classList.add('active');
            yearlyViewSection.classList.remove('active');
        });
        
        yearlyViewBtn.addEventListener('click', function() {
            yearlyViewBtn.classList.add('active');
            monthlyViewBtn.classList.remove('active');
            yearlyViewSection.classList.add('active');
            monthlyViewSection.classList.remove('active');
        });
    }
    
    // Populate year dropdowns (2020 to 2050)
    const summaryYear = document.getElementById('summaryYear');
    const yearlyYear = document.getElementById('yearlyYear');
    
    const populateYearDropdown = (dropdown) => {
        if (dropdown) {
            for (let year = 2020; year <= 2050; year++) {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                
                // Set current year as default
                if (year === new Date().getFullYear()) {
                    option.selected = true;
                }
                
                dropdown.appendChild(option);
            }
        }
    };
    
    populateYearDropdown(summaryYear);
    populateYearDropdown(yearlyYear);
    
    // Set current month as default
    const summaryMonth = document.getElementById('summaryMonth');
    if (summaryMonth) {
        const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
        summaryMonth.value = currentMonth;
        
        summaryMonth.addEventListener('change', function() {
            const selectedMonth = this.value;
            const selectedYear = summaryYear ? summaryYear.value : new Date().getFullYear();
            console.log('Month changed to:', selectedMonth, 'Year:', selectedYear);

            // Keep calendar + summary + graph in sync with the selected month/year
            currentCalendarDate = new Date(parseInt(selectedYear, 10), parseInt(selectedMonth, 10) - 1, 1);
            renderCalendar(currentCalendarDate);
        });
    }
    
    if (summaryYear) {
        summaryYear.addEventListener('change', function() {
            const selectedMonth = summaryMonth ? summaryMonth.value : String(new Date().getMonth() + 1).padStart(2, '0');
            const selectedYear = this.value;
            console.log('Year changed to:', selectedYear, 'Month:', selectedMonth);

            // Keep calendar + summary + graph in sync with the selected month/year
            currentCalendarDate = new Date(parseInt(selectedYear, 10), parseInt(selectedMonth, 10) - 1, 1);
            renderCalendar(currentCalendarDate);
        });
    }
    
    // Yearly view handler
    if (yearlyYear) {
        yearlyYear.addEventListener('change', function() {
            calculateYearlySummary(this.value);
        });
        
        // Initialize yearly view with current year
        calculateYearlySummary(yearlyYear.value);
    }
});

// Render Yearly Summary
function renderYearlySummary(year) {
    const yearlySummaryGrid = document.getElementById('yearlySummaryGrid');
    if (!yearlySummaryGrid) return;
    
    yearlySummaryGrid.innerHTML = '';
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    monthNames.forEach((monthName, index) => {
        const monthCard = document.createElement('div');
        monthCard.className = 'month-card';
        monthCard.innerHTML = `
            <div class="month-card-header">${monthName} ${year}</div>
            <div class="month-card-item">
                <span class="month-card-label">Present</span>
                <span class="month-card-value">0</span>
            </div>
            <div class="month-card-item">
                <span class="month-card-label">MC</span>
                <span class="month-card-value">0</span>
            </div>
            <div class="month-card-item">
                <span class="month-card-label">EL</span>
                <span class="month-card-value">0</span>
            </div>
            <div class="month-card-item">
                <span class="month-card-label">AL</span>
                <span class="month-card-value">0</span>
            </div>
            <div class="month-card-item">
                <span class="month-card-label">Late</span>
                <span class="month-card-value">0</span>
            </div>
        `;
        yearlySummaryGrid.appendChild(monthCard);
    });
}

// Calendar Variables
let currentCalendarDate = new Date();

// Initialize Calendar
function initializeCalendar() {
    renderCalendar(currentCalendarDate);
    
    // Add event listeners for navigation
    const prevBtn = document.getElementById('prevMonthBtn');
    const nextBtn = document.getElementById('nextMonthBtn');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', function() {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
            renderCalendar(currentCalendarDate);
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', function() {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
            renderCalendar(currentCalendarDate);
        });
    }
}

// ========== EXPORT (CSV / PDF) ==========

function initializeExportFeatures() {
    const exportBtn = document.getElementById('exportBtn');
    const travelExportBtn = document.getElementById('travelExportBtn');
    const otFormExportBtn = document.getElementById('otFormExportBtn');
    const otApprovalExportBtn = document.getElementById('otApprovalExportBtn');

    const exportModal = document.getElementById('exportModal');
    const closeExportModal = document.getElementById('closeExportModal');
    const cancelExportBtn = document.getElementById('cancelExportBtn');
    const exportModalTitle = document.getElementById('exportModalTitle');

    const exportPeriodType = document.getElementById('exportPeriodType');
    const exportMonthGroup = document.getElementById('exportMonthGroup');
    const exportMonth = document.getElementById('exportMonth');
    const exportYear = document.getElementById('exportYear');

    const travelPeriodType = document.getElementById('travelPeriodType');
    const travelMonth = document.getElementById('travelMonth');
    const travelYear = document.getElementById('travelYear');

    const otFormPeriodType = document.getElementById('otFormPeriodType');
    const otFormMonth = document.getElementById('otFormMonth');
    const otFormYear = document.getElementById('otFormYear');

    const otApprovalPeriodType = document.getElementById('otApprovalPeriodType');
    const otApprovalMonth = document.getElementById('otApprovalMonth');
    const otApprovalYear = document.getElementById('otApprovalYear');

    if (!exportModal || !exportPeriodType || !exportYear) {
        return;
    }

    populateYearOptions(exportYear, 2020, 2050);

    const now = new Date();
    const nowYear = now.getFullYear();
    const boundedYear = Math.min(2050, Math.max(2020, nowYear));
    const defaultMonth = String(now.getMonth() + 1).padStart(2, '0');
    const defaultYear = String(boundedYear);

    let currentExportTarget = 'attendance';

    function setModalOpen(isOpen) {
        exportModal.style.display = isOpen ? 'block' : 'none';
    }

    function syncPeriodUI() {
        const type = exportPeriodType.value;
        const showMonth = type === 'monthly';
        if (exportMonthGroup) {
            exportMonthGroup.style.display = showMonth ? '' : 'none';
        }
    }

    function applyDefaultsFromSelectors(cfg) {
        const typeEl = cfg?.periodTypeEl;
        const monthEl = cfg?.monthEl;
        const yearEl = cfg?.yearEl;

        exportPeriodType.value = (typeEl && typeEl.value) ? typeEl.value : 'monthly';

        if (exportMonth) {
            exportMonth.value = (monthEl && monthEl.value) ? monthEl.value : defaultMonth;
        }

        exportYear.value = (yearEl && yearEl.value) ? yearEl.value : defaultYear;
        syncPeriodUI();
    }

    const exportTargets = {
        attendance: {
            label: 'Attendance',
            periodTypeEl: null,
            monthEl: null,
            yearEl: null,
            buildRows: () => buildAttendanceExportRows(),
            exportCsv: exportAttendanceAsCSV,
            exportPdf: exportAttendanceAsPDF
        },
        travel: {
            label: 'Travel Allowance',
            periodTypeEl: travelPeriodType,
            monthEl: travelMonth,
            yearEl: travelYear,
            buildRows: (period) => buildTravelExportRows(period),
            exportCsv: exportTravelAsCSV,
            exportPdf: exportTravelAsPDF
        },
        otForm: {
            label: 'OT Form',
            periodTypeEl: otFormPeriodType,
            monthEl: otFormMonth,
            yearEl: otFormYear,
            buildRows: (period) => buildOtFormExportRows(period),
            exportCsv: exportOtFormAsCSV,
            exportPdf: exportOtFormAsPDF
        },
        otApproval: {
            label: 'OT Approval',
            periodTypeEl: otApprovalPeriodType,
            monthEl: otApprovalMonth,
            yearEl: otApprovalYear,
            buildRows: (period) => buildOtApprovalExportRows(period),
            exportCsv: exportOtApprovalAsCSV,
            exportPdf: exportOtApprovalAsPDF
        }
    };

    function openExport(targetKey) {
        currentExportTarget = targetKey in exportTargets ? targetKey : 'attendance';
        const cfg = exportTargets[currentExportTarget];
        if (exportModalTitle && cfg?.label) {
            exportModalTitle.textContent = `Export ${cfg.label}`;
        }
        applyDefaultsFromSelectors(cfg);
        setModalOpen(true);
    }

    function registerExportButton(btn, targetKey) {
        if (!btn) return;
        btn.addEventListener('click', () => {
            openExport(targetKey);
        });
    }

    registerExportButton(exportBtn, 'attendance');
    registerExportButton(travelExportBtn, 'travel');
    registerExportButton(otFormExportBtn, 'otForm');
    registerExportButton(otApprovalExportBtn, 'otApproval');

    if (closeExportModal) {
        closeExportModal.addEventListener('click', () => setModalOpen(false));
    }
    if (cancelExportBtn) {
        cancelExportBtn.addEventListener('click', () => setModalOpen(false));
    }

    // Close when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === exportModal) {
            setModalOpen(false);
        }
    });

    exportPeriodType.addEventListener('change', syncPeriodUI);

    const formatButtons = exportModal.querySelectorAll('[data-export-format]');
    formatButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const format = btn.getAttribute('data-export-format');
            try {
                await runExport(format);
            } catch (err) {
                console.error('Export failed:', err);
                alert('Export failed. Please try again.');
            }
        });
    });

    function normalizePeriodFromModal() {
        const type = exportPeriodType.value || 'monthly';
        const year = parseInt(exportYear.value, 10);
        const month = exportMonth ? exportMonth.value : defaultMonth;
        const safeYear = (!year || year < 2020 || year > 2050) ? parseInt(defaultYear, 10) : year;
        return {
            type,
            year: safeYear,
            month
        };
    }

    async function runExport(format) {
        const cfg = exportTargets[currentExportTarget] || exportTargets.attendance;
        const period = normalizePeriodFromModal();

        if (!period.year || period.year < 2020 || period.year > 2050) {
            alert('Please select a valid year (2020–2050).');
            return;
        }

        const rows = typeof cfg.buildRows === 'function' ? cfg.buildRows(period) : [];
        if (!Array.isArray(rows) || rows.length === 0) {
            alert('No records found for the selected period.');
            return;
        }

        if (format === 'csv' && typeof cfg.exportCsv === 'function') {
            cfg.exportCsv(rows, period);
        } else if (format === 'pdf' && typeof cfg.exportPdf === 'function') {
            await cfg.exportPdf(rows, period);
        } else {
            alert('Unknown export format');
        }
    }
}

// ========== APP/DB SYNC (TWO-WAY, AUTO) ==========
//
// Goal: keep browser state (localStorage) and the SQL Server DB synchronized.
//
// Previous behavior: a single sync on page load + unconditional "app-wins" merge.
// That meant:
//   - App changes after load were NOT pushed to DB.
//   - DB changes after load were NOT pulled into the app.
//   - DB updates could also be overwritten if the app had stale local copies.
//
// New behavior:
//   - We track which *categories* changed locally (dirty flags).
//   - Any local change to a synced key schedules a debounced sync.
//   - We also poll + sync on focus/visibility so DB-side edits show up.
//   - During a sync run:
//       * For dirty categories: merge local over server (local wins) so local edits persist.
//       * For clean categories: server wins (DB is source of truth) so DB edits propagate.
//   - We only POST back to /api/sync when at least one category is dirty.

let appSyncPromise = Promise.resolve();

const APP_SYNC_DEBOUNCE_MS = 1200;
const APP_SYNC_POLL_MS = 30000;

const appSyncDirty = {
    users: false,
    userAccess: false,
    roleAccess: false,
    appSettings: false,
    appAssets: false,
    attendance: false
};

let appSyncTimer = null;
let appSyncInProgress = false;
let appSyncPending = false;
let appSyncApplyingLocal = false;

// localStorage is a Storage host object: assigning arbitrary properties can coerce values to
// strings and/or create real storage keys. Keep hook state + raw methods in normal JS vars.
let appSyncLocalStorageHooksInstalled = false;
let appSyncRawStorageSetItem = null;
let appSyncRawStorageRemoveItem = null;
let appSyncRawStorageClear = null;

function anyAppSyncDirty() {
    return Object.values(appSyncDirty).some(Boolean);
}

function scheduleAppSync(reason = 'unknown') {
    // If a sync is running, flag a follow-up. This avoids overlapping /api/sync calls.
    if (appSyncInProgress) {
        appSyncPending = true;
        return;
    }

    if (appSyncTimer) clearTimeout(appSyncTimer);
    appSyncTimer = setTimeout(() => {
        appSyncTimer = null;
        appSyncPromise = syncAppWithDb({ reason }).catch((err) => {
            console.error('Sync run failed:', err);
        });
    }, APP_SYNC_DEBOUNCE_MS);
}

function markAppSyncDirtyForKey(key) {
    if (!key) return;

    const k = String(key);
    let changed = false;

    if (k === 'users') {
        appSyncDirty.users = true;
        changed = true;
    } else if (k === 'userAccess') {
        appSyncDirty.userAccess = true;
        changed = true;
    } else if (k === 'roleAccess') {
        appSyncDirty.roleAccess = true;
        changed = true;
    } else if (
        k === 'appSettings'
        || k === 'databaseSettings'
        || k === 'loginBgType'
        || k === 'loginBgColor'
        || k.startsWith('theme_')
        || k.startsWith('userPreferences_')
    ) {
        appSyncDirty.appSettings = true;
        changed = true;
    } else if (
        k === 'companyLogo'
        || k === 'departmentLogo'
        || k === 'loginBgData'
    ) {
        appSyncDirty.appAssets = true;
        changed = true;
    } else if (
        k.startsWith('attendance_')
        || k.startsWith('deletedRecords_')
        || k.startsWith('notes_')
        || k.startsWith('otnotes_')
        || k.startsWith('ot_')
    ) {
        appSyncDirty.attendance = true;
        changed = true;
    }

    if (changed) {
        scheduleAppSync(`local-change:${k}`);
    }
}

function installLocalStorageSyncHooks() {
    try {
        const ls = window.localStorage;
        if (!ls) return;
        if (appSyncLocalStorageHooksInstalled && appSyncRawStorageSetItem && appSyncRawStorageRemoveItem) return;

        // Patch the Storage prototype (scoped to localStorage) because some browsers prevent
        // overriding localStorage.setItem/removeItem directly.
        const proto = Object.getPrototypeOf(ls);
        if (!proto) return;

        if (!appSyncRawStorageSetItem) appSyncRawStorageSetItem = proto.setItem;
        if (!appSyncRawStorageRemoveItem) appSyncRawStorageRemoveItem = proto.removeItem;
        if (!appSyncRawStorageClear) appSyncRawStorageClear = proto.clear;

        const rawSetItem = appSyncRawStorageSetItem;
        const rawRemoveItem = appSyncRawStorageRemoveItem;
        const rawClear = appSyncRawStorageClear;
        if (typeof rawSetItem !== 'function' || typeof rawRemoveItem !== 'function') return;

        const attendanceKeyRe = /^attendance_(.+)_(\d+)$/;
        const notesKeyRe = /^notes_(.+)_(\d{4}-\d{2}-\d{2})$/;
        const otNotesKeyRe = /^otnotes_(.+)_(\d{4}-\d{2}-\d{2})$/;
        const otKeyRe = /^ot_(.+)_(.+)$/;

        const nowIso = () => new Date().toISOString();

        proto.setItem = function(key, value) {
            if (this !== ls) return rawSetItem.call(this, key, value);
            let nextValue = value;

            const k = String(key || '');
            const now = nowIso();

            // Attendance records + OT details are JSON; embed updatedAt inside the payload.
            if (attendanceKeyRe.test(k) || otKeyRe.test(k)) {
                try {
                    const obj = JSON.parse(String(value || 'null'));
                    if (obj && typeof obj === 'object') {
                        obj.updatedAt = now;
                        nextValue = JSON.stringify(obj);
                    }
                } catch {
                    // ignore
                }
            }

            // Notes are stored as plain strings; keep an adjacent updatedAt key.
            const mNotes = k.match(notesKeyRe);
            if (mNotes) {
                const userKey = mNotes[1];
                const date = mNotes[2];
                rawSetItem.call(ls, `notesUpdatedAt_${userKey}_${date}`, now);
            }

            const mOtNotes = k.match(otNotesKeyRe);
            if (mOtNotes) {
                const userKey = mOtNotes[1];
                const date = mOtNotes[2];
                rawSetItem.call(ls, `otnotesUpdatedAt_${userKey}_${date}`, now);
            }

            rawSetItem.call(ls, key, nextValue);
            markAppSyncDirtyForKey(key);
        };

        proto.removeItem = function(key) {
            if (this !== ls) return rawRemoveItem.call(this, key);
            const k = String(key || '');
            const now = nowIso();

            // If code tries to remove a note key, convert it to an empty string so the "clear" action syncs.
            const mNotes = k.match(notesKeyRe);
            if (mNotes) {
                const userKey = mNotes[1];
                const date = mNotes[2];
                rawSetItem.call(ls, k, '');
                rawSetItem.call(ls, `notesUpdatedAt_${userKey}_${date}`, now);
                markAppSyncDirtyForKey(k);
                return;
            }

            const mOtNotes = k.match(otNotesKeyRe);
            if (mOtNotes) {
                const userKey = mOtNotes[1];
                const date = mOtNotes[2];
                rawSetItem.call(ls, k, '');
                rawSetItem.call(ls, `otnotesUpdatedAt_${userKey}_${date}`, now);
                markAppSyncDirtyForKey(k);
                return;
            }

            rawRemoveItem.call(ls, key);
            markAppSyncDirtyForKey(key);
        };

        proto.clear = function() {
            if (this !== ls) return rawClear.call(this);
            rawClear.call(ls);
            if (!appSyncApplyingLocal) {
                Object.keys(appSyncDirty).forEach((k) => {
                    appSyncDirty[k] = true;
                });
                scheduleAppSync('local-clear');
            }
        };

        appSyncLocalStorageHooksInstalled = true;
    } catch (e) {
        console.warn('Failed to install localStorage sync hooks:', e);
    }
}

installLocalStorageSyncHooks();

function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch (e) {
        console.warn('Failed to parse localStorage key', key, e);
        return fallback;
    }
}

function mergeAppWins(localArr = [], remoteArr = [], keyFn) {
    const map = new Map();
    (remoteArr || []).forEach(item => {
        const k = keyFn(item);
        if (k) map.set(k, item);
    });
    (localArr || []).forEach(item => {
        const k = keyFn(item);
        if (k) map.set(k, item);
    });
    return Array.from(map.values());
}

function parseUpdatedAtMs(value) {
    if (value == null) return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const raw = String(value).trim();
    if (!raw) return 0;
    if (/^\d+$/.test(raw)) {
        const n = Number(raw);
        return Number.isFinite(n) ? n : 0;
    }
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : 0;
}

function mergeByLatestUpdatedAt(localArr = [], remoteArr = [], keyFn, updatedAtFn) {
    const map = new Map();

    const consider = (item) => {
        if (!item) return;
        const k = keyFn(item);
        if (!k) return;

        const prev = map.get(k);
        if (!prev) {
            map.set(k, item);
            return;
        }

        const prevMs = parseUpdatedAtMs(updatedAtFn(prev));
        const nextMs = parseUpdatedAtMs(updatedAtFn(item));

        // Prefer the newer updatedAt; on ties, keep the existing (remote-first) value.
        if (nextMs > prevMs) {
            map.set(k, item);
        }
    };

    (remoteArr || []).forEach(consider);
    (localArr || []).forEach(consider);
    return Array.from(map.values());
}

// Normalize user-specific access rules to be keyed by app_users.userId.
// This avoids SQL FK issues when syncing to dbo.user_access (which references dbo.app_users.userId).
// It also migrates legacy username-keyed entries by matching users[].username -> users[].userId.
function normalizeUserAccessByUserId(userAccessObj = {}, users = []) {
    const out = {};
    const userIdSet = new Set();
    const userIdByUsername = new Map();

    (Array.isArray(users) ? users : []).forEach((u) => {
        if (!u) return;
        const userId = u.userId != null ? String(u.userId) : '';
        const username = u.username != null ? String(u.username) : '';
        if (userId) userIdSet.add(userId);
        if (userId && username) userIdByUsername.set(username.toLowerCase(), userId);
    });

    Object.entries(userAccessObj || {}).forEach(([rawKey, rawValue]) => {
        const key = String(rawKey || '').trim();
        if (!key) return;

        const value = (rawValue && typeof rawValue === 'object') ? rawValue : {};

        let userId = null;
        if (userIdSet.has(key)) {
            userId = key;
        } else {
            userId = userIdByUsername.get(key.toLowerCase()) || null;
        }
        if (!userId) return;

        const prev = out[userId] || {};
        out[userId] = { ...prev, ...value };
    });

    return out;
}

function arrayToObject(arr = [], keyField, valueField) {
    const obj = {};
    (arr || []).forEach(item => {
        const key = item && item[keyField];
        if (!key) return;
        obj[key] = valueField ? item[valueField] : { ...item };
    });
    return obj;
}

function objectToArray(obj = {}, keyField, valueField) {
    return Object.entries(obj).map(([k, v]) => {
        if (valueField) {
            return { [keyField]: k, [valueField]: v };
        }
        return { [keyField]: k, ...(typeof v === 'object' && v !== null ? v : { value: v }) };
    });
}

async function syncAppWithDb(options = {}) {
    if (appSyncInProgress) {
        appSyncPending = true;
        return;
    }
    appSyncInProgress = true;

    // Snapshot which categories were dirty at the start of this run.
    // Clear those flags now so any new edits during the async sync get re-marked.
    const dirtySnapshot = { ...appSyncDirty };
    Object.keys(dirtySnapshot).forEach((k) => {
        if (dirtySnapshot[k]) appSyncDirty[k] = false;
    });

    try {
        const localUsers = readJson('users', []);
        const localUserAccess = readJson('userAccess', {});
        const localRoleAccess = readJson('roleAccess', {});
        const localAppSettings = readJson('appSettings', {});

        // Extra "settings-like" keys that are stored separately in localStorage, but should sync.
        const extendedLocalAppSettings = { ...(localAppSettings || {}) };
        const dbSettingsRaw = localStorage.getItem('databaseSettings');
        if (dbSettingsRaw) extendedLocalAppSettings.databaseSettings = dbSettingsRaw;

        const bgType = localStorage.getItem('loginBgType');
        const bgColor = localStorage.getItem('loginBgColor');
        if (bgType) extendedLocalAppSettings.loginBgType = bgType;
        if (bgColor) extendedLocalAppSettings.loginBgColor = bgColor;

        // Theme + user preferences are per-user keys. We store them in appSettings as well,
        // so they can sync through the existing app_settings table.
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (k.startsWith('theme_') || k.startsWith('userPreferences_')) {
                const v = localStorage.getItem(k);
                if (v != null && v !== '') {
                    extendedLocalAppSettings[k] = v;
                }
            }
        }

        const localAssets = {
            companyLogo: localStorage.getItem('companyLogo') || '',
            departmentLogo: localStorage.getItem('departmentLogo') || '',
            // Used for both image and video backgrounds (data URL)
            loginBgData: localStorage.getItem('loginBgData') || ''
        };

        // Attendance + OT + notes are stored in localStorage under prefixed keys.
        const localAttendanceRecords = [];
        const localAttendanceDeleted = [];
        const localAttendanceNotes = [];
        const localOtDetails = [];
        const localOtNotes = [];

        const deletedByUser = new Map(); // userKey -> Set(recordTimestamp)

        const attendanceKeyRe = /^attendance_(.+)_(\d+)$/;
        const notesKeyRe = /^notes_(.+)_(\d{4}-\d{2}-\d{2})$/;
        const otNotesKeyRe = /^otnotes_(.+)_(\d{4}-\d{2}-\d{2})$/;
        const otKeyRe = /^ot_(.+)_(.+)$/;
        const deletedKeyRe = /^deletedRecords_(.+)$/;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;

            // Attendance records
            const mAttendance = key.match(attendanceKeyRe);
            if (mAttendance) {
                const userKey = mAttendance[1];
                let record = null;
                try {
                    record = JSON.parse(localStorage.getItem(key) || 'null');
                } catch {
                    record = null;
                }
                if (record && record.timestamp) {
                    // Avoid persisting the transient localStorage key inside the record payload.
                    if (record.key) {
                        try { delete record.key; } catch { /* ignore */ }
                    }
                    const updatedAt = (record && (record.updatedAt || record.updated_at || record.lastUpdated))
                        ? String(record.updatedAt || record.updated_at || record.lastUpdated)
                        : null;
                    localAttendanceRecords.push({
                        userKey,
                        recordTimestamp: String(record.timestamp),
                        record,
                        updatedAt
                    });
                }
                continue;
            }

            // Notes (used by Attendance + Travel Allowance)
            const mNotes = key.match(notesKeyRe);
            if (mNotes) {
                const userKey = mNotes[1];
                const date = mNotes[2];
                const notes = localStorage.getItem(key) || '';
                const updatedAt = localStorage.getItem(`notesUpdatedAt_${userKey}_${date}`) || null;
                localAttendanceNotes.push({ userKey, date, notes, updatedAt });
                continue;
            }

            // OT Notes (used by OT Form/Approval tables)
            const mOtNotes = key.match(otNotesKeyRe);
            if (mOtNotes) {
                const userKey = mOtNotes[1];
                const date = mOtNotes[2];
                const notes = localStorage.getItem(key) || '';
                const updatedAt = localStorage.getItem(`otnotesUpdatedAt_${userKey}_${date}`) || null;
                localOtNotes.push({ userKey, date, notes, updatedAt });
                continue;
            }

            // OT Details
            const mOt = key.match(otKeyRe);
            if (mOt) {
                const userKey = mOt[1];
                const recordTimestamp = mOt[2];
                let details = null;
                try {
                    details = JSON.parse(localStorage.getItem(key) || 'null');
                } catch {
                    details = null;
                }
                if (details) {
                    const updatedAt = (details && (details.updatedAt || details.updated_at || details.lastUpdated))
                        ? String(details.updatedAt || details.updated_at || details.lastUpdated)
                        : null;
                    localOtDetails.push({ userKey, recordTimestamp, details, updatedAt });
                }
                continue;
            }

            // Deleted records list (tombstones)
            const mDeleted = key.match(deletedKeyRe);
            if (mDeleted) {
                const userKey = mDeleted[1];
                let arr = [];
                try {
                    arr = JSON.parse(localStorage.getItem(key) || '[]');
                } catch {
                    arr = [];
                }
                const set = deletedByUser.get(userKey) || new Set();
                (Array.isArray(arr) ? arr : []).forEach((v) => {
                    if (v != null && String(v).trim()) set.add(String(v).trim());
                });
                deletedByUser.set(userKey, set);
                continue;
            }

            // Legacy deletedRecords -> treat as Master
            if (key === 'deletedRecords') {
                let arr = [];
                try {
                    arr = JSON.parse(localStorage.getItem(key) || '[]');
                } catch {
                    arr = [];
                }
                const set = deletedByUser.get('Master') || new Set();
                (Array.isArray(arr) ? arr : []).forEach((v) => {
                    if (v != null && String(v).trim()) set.add(String(v).trim());
                });
                deletedByUser.set('Master', set);
            }
        }

        deletedByUser.forEach((set, userKey) => {
            set.forEach((recordTimestamp) => {
                localAttendanceDeleted.push({ userKey, recordTimestamp, updatedAt: null });
            });
        });

        const pullRes = await fetch('/api/sync');
        if (!pullRes.ok) throw new Error('Sync pull failed');
        const pullJson = await pullRes.json().catch(() => ({}));
        const serverData = pullJson.data || {};

        const serverUsersRaw = Array.isArray(serverData.users) ? serverData.users : [];

        // Track deleted users as tombstones so they don't get reintroduced by a pull/merge.
        // We store deleted userIds in localStorage and filter them out during sync.
        let deletedUserIdsRaw = [];
        try {
            const parsed = JSON.parse(localStorage.getItem('deletedUsers') || '[]');
            deletedUserIdsRaw = Array.isArray(parsed) ? parsed : [];
        } catch {
            deletedUserIdsRaw = [];
        }

        const deletedUserIdSet = new Set(
            deletedUserIdsRaw
                .map((id) => String(id || '').trim().toLowerCase())
                .filter(Boolean)
        );

        // Once a deleted user no longer exists in the DB, drop the tombstone.
        const serverUserIdSetRaw = new Set(
            serverUsersRaw
                .map((u) => String((u && u.userId) || '').trim().toLowerCase())
                .filter(Boolean)
        );
        const cleanedDeletedUserIds = deletedUserIdsRaw.filter((id) =>
            serverUserIdSetRaw.has(String(id || '').trim().toLowerCase())
        );

        // Filter server + local views using tombstones.
        const serverUsers = deletedUserIdSet.size
            ? serverUsersRaw.filter((u) => !deletedUserIdSet.has(String((u && u.userId) || '').trim().toLowerCase()))
            : serverUsersRaw;

        const localUsersFiltered = deletedUserIdSet.size && Array.isArray(localUsers)
            ? localUsers.filter((u) => !deletedUserIdSet.has(String((u && u.userId) || '').trim().toLowerCase()))
            : localUsers;

        // If DB is empty but local has users, seed from local to avoid breaking login flows.
        const shouldSeedFromLocal = serverUsersRaw.length === 0 && Array.isArray(localUsersFiltered) && localUsersFiltered.length > 0;

        const usersDirty = Boolean(dirtySnapshot.users || shouldSeedFromLocal);
        const userAccessDirty = Boolean(dirtySnapshot.userAccess || shouldSeedFromLocal);
        const roleAccessDirty = Boolean(dirtySnapshot.roleAccess || shouldSeedFromLocal);
        const appSettingsDirty = Boolean(dirtySnapshot.appSettings || shouldSeedFromLocal);
        const appAssetsDirty = Boolean(dirtySnapshot.appAssets || shouldSeedFromLocal);
        const attendanceDirty = Boolean(dirtySnapshot.attendance || shouldSeedFromLocal);

        // Category-level merge:
        // - Dirty category => local wins (but include server rows so we don't accidentally drop remote-only items)
        // - Clean category => server wins
        const mergedUsers = usersDirty
            ? mergeAppWins(localUsersFiltered, serverUsers, (u) => (u.userId || u.username || '').toLowerCase())
            : serverUsers;

        const serverUserAccessObj = arrayToObject(serverData.userAccess || [], 'userId');
        const mergedUserAccess = userAccessDirty
            ? { ...(serverUserAccessObj || {}), ...(localUserAccess || {}) }
            : { ...(serverUserAccessObj || {}) };
        const mergedUserAccessByUserId = normalizeUserAccessByUserId(mergedUserAccess, mergedUsers);

        const serverRoleAccessObj = arrayToObject(serverData.roleAccess || [], 'role');
        const mergedRoleAccess = roleAccessDirty
            ? { ...(serverRoleAccessObj || {}), ...(localRoleAccess || {}) }
            : { ...(serverRoleAccessObj || {}) };

        const serverAppSettingsObj = arrayToObject(serverData.appSettings || [], 'key', 'value');
        const mergedAppSettings = appSettingsDirty
            ? { ...(serverAppSettingsObj || {}), ...(extendedLocalAppSettings || {}) }
            : { ...(serverAppSettingsObj || {}) };

        const serverAssetsObj = arrayToObject(serverData.appAssets || [], 'key', 'data_url');
        const mergedAssets = appAssetsDirty
            ? { ...(serverAssetsObj || {}), ...(localAssets || {}) }
            : { ...(serverAssetsObj || {}) };

        const mergedAttendanceRecords = mergeByLatestUpdatedAt(
            localAttendanceRecords,
            serverData.attendanceRecords || [],
            (r) => `${r.userKey}|${r.recordTimestamp}`,
            (r) => r.updatedAt
        );

        const mergedAttendanceDeleted = mergeByLatestUpdatedAt(
            localAttendanceDeleted,
            serverData.attendanceDeleted || [],
            (r) => `${r.userKey}|${r.recordTimestamp}`,
            (r) => r.updatedAt
        );

        const mergedAttendanceNotes = mergeByLatestUpdatedAt(
            localAttendanceNotes,
            serverData.attendanceNotes || [],
            (r) => `${r.userKey}|${r.date}`,
            (r) => r.updatedAt
        );

        const mergedOtDetails = mergeByLatestUpdatedAt(
            localOtDetails,
            serverData.otDetails || [],
            (r) => `${r.userKey}|${r.recordTimestamp}`,
            (r) => r.updatedAt
        );

        const mergedOtNotes = mergeByLatestUpdatedAt(
            localOtNotes,
            serverData.otNotes || [],
            (r) => `${r.userKey}|${r.date}`,
            (r) => r.updatedAt
        );

        // Delete wins over record existence (prevents resurrecting deleted rows across devices).
        const deletedKeySet = new Set(
            (mergedAttendanceDeleted || []).map((d) => `${d.userKey}|${d.recordTimestamp}`)
        );
        const filteredAttendanceRecords = (mergedAttendanceRecords || []).filter(
            (r) => !deletedKeySet.has(`${r.userKey}|${r.recordTimestamp}`)
        );
        const filteredOtDetails = (mergedOtDetails || []).filter(
            (r) => !deletedKeySet.has(`${r.userKey}|${r.recordTimestamp}`)
        );

        // Persist merged locally (suppress dirty tracking during apply).
        // Wrap in try/finally so we never leave appSyncApplyingLocal stuck "true" on errors.
        // NOTE: The server sync payload may intentionally omit/blank user passwords.
        // Passwords are used for client-side login, so we must never overwrite a non-empty local
        // password with an empty server value.
        const localPasswordByKey = new Map();
        (localUsers || []).forEach((u) => {
            if (!u) return;
            const pw = typeof u.password === 'string' ? u.password : '';
            if (!pw || pw.trim() === '') return;

            const userIdKey = String(u.userId || '').trim().toLowerCase();
            const usernameKey = String(u.username || '').trim().toLowerCase();

            if (userIdKey) localPasswordByKey.set(userIdKey, pw);
            if (usernameKey && !localPasswordByKey.has(usernameKey)) localPasswordByKey.set(usernameKey, pw);
        });

        const mergedUsersWithPasswords = (mergedUsers || []).map((u) => {
            if (!u) return u;
            const pw = typeof u.password === 'string' ? u.password : '';
            if (pw && pw.trim() !== '') return u;

            const userIdKey = String(u.userId || '').trim().toLowerCase();
            const usernameKey = String(u.username || '').trim().toLowerCase();

            const localPw = (userIdKey && localPasswordByKey.get(userIdKey))
                || (usernameKey && localPasswordByKey.get(usernameKey));

            return localPw ? { ...u, password: localPw } : u;
        });
        appSyncApplyingLocal = true;
        try {
        const rawSetItem = (key, value) => {
            try {
                if (typeof appSyncRawStorageSetItem === 'function') {
                    appSyncRawStorageSetItem.call(window.localStorage, key, value);
                    return;
                }
            } catch {
                // ignore
            }
            // Fallback (may be hooked): prefer not to hit this.
            window.localStorage.setItem(key, value);
        };

        const rawRemoveItem = (key) => {
            try {
                if (typeof appSyncRawStorageRemoveItem === 'function') {
                    appSyncRawStorageRemoveItem.call(window.localStorage, key);
                    return;
                }
            } catch {
                // ignore
            }
            // Fallback (may be hooked): prefer not to hit this.
            window.localStorage.removeItem(key);
        };

        rawSetItem('users', JSON.stringify(mergedUsersWithPasswords));
        rawSetItem('deletedUsers', JSON.stringify(cleanedDeletedUserIds));
        rawSetItem('userAccess', JSON.stringify(mergedUserAccessByUserId));
        rawSetItem('roleAccess', JSON.stringify(mergedRoleAccess));
        rawSetItem('appSettings', JSON.stringify(mergedAppSettings));
        if (mergedAssets.companyLogo) rawSetItem('companyLogo', mergedAssets.companyLogo); else rawRemoveItem('companyLogo');
        if (mergedAssets.departmentLogo) rawSetItem('departmentLogo', mergedAssets.departmentLogo); else rawRemoveItem('departmentLogo');
        if (mergedAssets.loginBgData) rawSetItem('loginBgData', mergedAssets.loginBgData); else rawRemoveItem('loginBgData');

        // Restore extra settings keys to their dedicated storage keys.
        if (mergedAppSettings.databaseSettings) rawSetItem('databaseSettings', mergedAppSettings.databaseSettings); else rawRemoveItem('databaseSettings');
        if (mergedAppSettings.loginBgType) rawSetItem('loginBgType', mergedAppSettings.loginBgType); else rawRemoveItem('loginBgType');
        if (mergedAppSettings.loginBgColor) rawSetItem('loginBgColor', mergedAppSettings.loginBgColor); else rawRemoveItem('loginBgColor');

        // Restore per-user theme + preferences keys (stored through appSettings).
        Object.keys(mergedAppSettings || {}).forEach((k) => {
            if (!k) return;
            if (k.startsWith('theme_') || k.startsWith('userPreferences_')) {
                const v = mergedAppSettings[k];
                if (v != null && v !== '') {
                    rawSetItem(k, String(v));
                } else {
                    rawRemoveItem(k);
                }
            }
        });

        // === Attendance / OT / Notes local persistence ===
        // 1) Index existing attendance keys by (userKey|recordTimestamp) so we can dedupe.
        const existingAttendanceKeysById = new Map();
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            const m = key.match(attendanceKeyRe);
            if (!m) continue;
            let record = null;
            try {
                record = JSON.parse(localStorage.getItem(key) || 'null');
            } catch {
                record = null;
            }
            const ts = record && record.timestamp ? String(record.timestamp) : '';
            if (!ts) continue;
            const id = `${m[1]}|${ts}`;
            const arr = existingAttendanceKeysById.get(id) || [];
            arr.push(key);
            existingAttendanceKeysById.set(id, arr);
        }

        // 2) Apply tombstones: remove attendance + OT detail keys.
        deletedKeySet.forEach((id) => {
            const keys = existingAttendanceKeysById.get(id) || [];
            keys.forEach((k) => rawRemoveItem(k));
            const parts = id.split('|');
            const userKey = parts[0];
            const recordTimestamp = parts.slice(1).join('|');
            if (userKey && recordTimestamp) {
                rawRemoveItem(`ot_${userKey}_${recordTimestamp}`);
            }
        });

        // 3) Persist deletedRecords_<userKey> lists.
        const mergedDeletedByUser = new Map();
        (mergedAttendanceDeleted || []).forEach((row) => {
            if (!row || !row.userKey || !row.recordTimestamp) return;
            const set = mergedDeletedByUser.get(row.userKey) || new Set();
            set.add(String(row.recordTimestamp));
            mergedDeletedByUser.set(row.userKey, set);
        });
        mergedDeletedByUser.forEach((set, userKey) => {
            rawSetItem(`deletedRecords_${userKey}`, JSON.stringify(Array.from(set)));
        });
        // Remove legacy global deletedRecords key (legacy data is kept in deletedRecords_Master)
        rawRemoveItem('deletedRecords');

        // 4) Upsert attendance records (dedupe by timestamp).
        (filteredAttendanceRecords || []).forEach((row) => {
            if (!row || !row.userKey || !row.recordTimestamp || !row.record) return;
            const id = `${row.userKey}|${row.recordTimestamp}`;
            const existingKeys = existingAttendanceKeysById.get(id) || [];
            existingKeys.forEach((k) => rawRemoveItem(k));

            const ms = Date.parse(String(row.recordTimestamp));
            const suffix = Number.isFinite(ms) ? String(ms) : String(Date.now());
            const storageKey = `attendance_${row.userKey}_${suffix}`;
            const recordPayload = (row.record && typeof row.record === 'object') ? { ...row.record } : row.record;
            if (recordPayload && typeof recordPayload === 'object') {
                if (row.updatedAt) recordPayload.updatedAt = row.updatedAt;
            }
            rawSetItem(storageKey, JSON.stringify(recordPayload));
        });

        // 5) Persist attendance notes.
        (mergedAttendanceNotes || []).forEach((n) => {
            if (!n || !n.userKey || !n.date) return;
            const key = `notes_${n.userKey}_${n.date}`;
            const raw = String(n.notes || '');
            rawSetItem(key, raw);
            const metaKey = `notesUpdatedAt_${n.userKey}_${n.date}`;
            if (n.updatedAt) rawSetItem(metaKey, String(n.updatedAt));
            else rawRemoveItem(metaKey);
        });

        // 6) Persist OT details.
        (filteredOtDetails || []).forEach((d) => {
            if (!d || !d.userKey || !d.recordTimestamp || !d.details) return;
            const key = `ot_${d.userKey}_${d.recordTimestamp}`;
            const detailsPayload = (d.details && typeof d.details === 'object') ? { ...d.details } : d.details;
            if (detailsPayload && typeof detailsPayload === 'object') {
                if (d.updatedAt) detailsPayload.updatedAt = d.updatedAt;
            }
            rawSetItem(key, JSON.stringify(detailsPayload));
        });

        // 7) Persist OT notes.
        (mergedOtNotes || []).forEach((n) => {
            if (!n || !n.userKey || !n.date) return;
            const key = `otnotes_${n.userKey}_${n.date}`;
            const raw = String(n.notes || '');
            rawSetItem(key, raw);
            const metaKey = `otnotesUpdatedAt_${n.userKey}_${n.date}`;
            if (n.updatedAt) rawSetItem(metaKey, String(n.updatedAt));
            else rawRemoveItem(metaKey);
        });

        } finally {
            appSyncApplyingLocal = false;
        }

        // Push merged state back to DB only when a category changed locally.
        const payload = {
            users: mergedUsers,
            userAccess: objectToArray(mergedUserAccessByUserId, 'userId'),
            roleAccess: objectToArray(mergedRoleAccess, 'role'),
            appSettings: objectToArray(mergedAppSettings, 'key', 'value'),
            appAssets: objectToArray(mergedAssets, 'key', 'data_url'),
            attendanceRecords: filteredAttendanceRecords,
            attendanceDeleted: mergedAttendanceDeleted,
            attendanceNotes: mergedAttendanceNotes,
            otDetails: filteredOtDetails,
            otNotes: mergedOtNotes
        };

        const shouldPush = shouldSeedFromLocal || Object.values(dirtySnapshot).some(Boolean);
        if (shouldPush) {
            const pushRes = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!pushRes.ok) throw new Error('Sync push failed');
        }

        // Refresh UI
        loadUsers();
        // Apply role rules first, then user-specific overrides/denies.
        applyRoleAccessControl();
        applyUserAccessControl();
        if (typeof loadSavedAttendanceData === 'function') loadSavedAttendanceData();
        if (typeof refreshOtTables === 'function') refreshOtTables();
        if (typeof updateDashboardSummaries === 'function') updateDashboardSummaries();
    } catch (err) {
        console.error('Sync error:', err);

        // If the run failed, restore the dirty snapshot so changes get retried.
        Object.keys(dirtySnapshot || {}).forEach((k) => {
            if (dirtySnapshot[k]) appSyncDirty[k] = true;
        });
    }

    appSyncInProgress = false;
    if (appSyncPending || anyAppSyncDirty()) {
        appSyncPending = false;
        scheduleAppSync('pending');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // If login.html performed an emergency reset (e.g., Master Admin recovery),
    // force the initial sync to treat users as dirty so the DB is updated.
    try {
        if (localStorage.getItem('forceUsersSync') === '1') {
            appSyncDirty.users = true;
            appSyncDirty.userAccess = true;
            localStorage.removeItem('forceUsersSync');
        }
    } catch {
        // ignore
    }

    appSyncPromise = syncAppWithDb({ reason: 'init' }).catch(err => console.error('Sync init failed:', err));

    // Poll so DB-side edits are reflected without a full page refresh.
    setInterval(() => {
        if (document.hidden) return;
        scheduleAppSync('poll');
    }, APP_SYNC_POLL_MS);

    // Also sync when the tab gains focus / becomes visible.
    window.addEventListener('focus', () => scheduleAppSync('focus'));
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) scheduleAppSync('visible');
    });
});

document.addEventListener('DOMContentLoaded', function() {
    initializeExportFeatures();
});

function populateYearOptions(selectEl, startYear, endYear) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    for (let y = startYear; y <= endYear; y++) {
        const opt = document.createElement('option');
        opt.value = String(y);
        opt.textContent = String(y);
        selectEl.appendChild(opt);
    }
}

function normalizeISODate(dateString) {
    if (!dateString || typeof dateString !== 'string') return '';
    if (!dateString.includes('-')) return dateString;
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    const [y, m, d] = parts;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function buildAttendanceExportRows() {
    const attendancePrefix = getAttendanceRecordKeyPrefix();
    const deletedIds = getDeletedRecordIdSet(attendancePrefix);

    // Load all raw attendance records from localStorage
    const rawRecords = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(attendancePrefix)) {
            let record = null;
            try {
                record = JSON.parse(localStorage.getItem(key));
            } catch (e) {
                record = null;
            }
            if (!record) continue;

            const recordId = normalizeDeletedRecordId(record.timestamp);
            const isDeleted = (recordId && deletedIds.has(recordId))
                || deletedIds.has(key)
                || record.isDeleted === true
                || record.deleted === true;
            if (isDeleted) continue;
            rawRecords.push(record);
        }
    }

    // Group by date (same model used by displayAttendanceRecords)
    const byDate = {};
    rawRecords.forEach(record => {
        const date = normalizeISODate(record.date || '-');
        if (!byDate[date]) {
            byDate[date] = {
                checkInTime: null,
                checkOutTime: null,
                type: record.type,
                leaveType: record.leaveType,
                timestamp: record.timestamp,
                notes: record.notes || '',
                shiftType: record.shiftType || '',
                checkoutDate: normalizeISODate(record.checkoutDate || '')
            };
        }

        if (record.type === 'checkin' || record.type === 'shift_checkin' || record.type === 'manual_checkin') {
            byDate[date].checkInTime = record.time;
            byDate[date].type = record.type;
            byDate[date].timestamp = record.timestamp;
            if (record.notes) byDate[date].notes = record.notes;
            if (record.shiftType) byDate[date].shiftType = record.shiftType;
        }

        if (record.checkoutTime) {
            byDate[date].checkOutTime = record.checkoutTime;
            if (record.checkoutDate) {
                byDate[date].checkoutDate = normalizeISODate(record.checkoutDate);
            }
            if (record.notes) byDate[date].notes = record.notes;
            if (record.shiftType) byDate[date].shiftType = record.shiftType;
        }

        if (record.type === 'leave') {
            byDate[date].type = 'leave';
            byDate[date].leaveType = record.leaveType;
            byDate[date].timestamp = record.timestamp;
            if (record.notes) byDate[date].notes = record.notes;
            if (record.shiftType) byDate[date].shiftType = record.shiftType;
        }
    });

    const rows = Object.keys(byDate)
        .filter(d => d && d !== '-')
        .sort((a, b) => {
            const ra = byDate[a] || {};
            const rb = byDate[b] || {};
            const aDisplay = (ra.type === 'shift_checkin' && ra.checkOutTime && ra.checkoutDate) ? ra.checkoutDate : a;
            const bDisplay = (rb.type === 'shift_checkin' && rb.checkOutTime && rb.checkoutDate) ? rb.checkoutDate : b;
            return new Date(aDisplay) - new Date(bDisplay);
        })
        .map(date => {
            const record = byDate[date];

            const isOvernightShift = record.type === 'shift_checkin';
            const hasCheckout = Boolean(record.checkOutTime);
            const checkoutDate = String(record.checkoutDate || '').trim();
            const displayDate = (isOvernightShift && hasCheckout && checkoutDate) ? checkoutDate : date;

            // Duration
            let duration = '';
            if (record.checkInTime && record.checkOutTime) {
                const checkInParts = record.checkInTime.split(':');
                const checkOutParts = record.checkOutTime.split(':');

                const checkInDate = new Date();
                checkInDate.setHours(parseInt(checkInParts[0], 10), parseInt(checkInParts[1], 10), 0);

                const checkOutDate = new Date();
                checkOutDate.setHours(parseInt(checkOutParts[0], 10), parseInt(checkOutParts[1], 10), 0);

                if (checkOutDate < checkInDate) {
                    checkOutDate.setDate(checkOutDate.getDate() + 1);
                }

                const diffMs = checkOutDate - checkInDate;
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                duration = `${diffHours}h ${diffMinutes}m`;
            }

            // Notes: single source of truth is the per-date Notes store (shared with Travel Allowance).
            // For overnight shifts, the UI may display the checkout date, so we also check notes stored under that date.
            const storedNotesPrimary = getStoredNotesForDate(date);
            const storedNotesSecondary = displayDate !== date ? getStoredNotesForDate(displayDate) : '';
            const baseNotes = (storedNotesPrimary && storedNotesPrimary.trim() !== '')
                ? storedNotesPrimary
                : ((storedNotesSecondary && storedNotesSecondary.trim() !== '') ? storedNotesSecondary : (record.notes || ''));
            let notesDisplay = String(baseNotes || '').trim();
            if (record.type === 'leave') {
                const leaveTypeMap = {
                    'medical': 'MC',
                    'annual': 'AL',
                    'emergency': 'EL',
                    'compassionate': 'CL',
                    'public': 'PH'
                };
                const leaveTypeDisplay = leaveTypeMap[record.leaveType] || record.leaveType || 'N/A';
                const codeUpper = String(leaveTypeDisplay).toUpperCase();
                const notesUpper = notesDisplay.toUpperCase();
                if (!notesDisplay) {
                    notesDisplay = leaveTypeDisplay;
                } else if (codeUpper && !notesUpper.startsWith(codeUpper)) {
                    notesDisplay = `${leaveTypeDisplay} (${notesDisplay})`;
                }
            }

            const hasAnyTime = Boolean(record.checkInTime || record.checkOutTime);

            // If there is NO attendance time record for the day, suppress auto-disqualifier flags like
            // LATE/HALFDAY so they don't appear as "no record but LATE" in exports.
            if (!hasAnyTime && record.type !== 'leave' && /^(LATE|HALFDAY)(\b|\s|\(|$)/i.test(notesDisplay)) {
                notesDisplay = '';
            }

            // Shift display
            let shiftDisplay = 'Normal';
            if (record.type === 'shift_checkin') {
                shiftDisplay = 'Shift B';
            } else if (record.type === 'leave') {
                shiftDisplay = 'Leave';
            } else if (record.shiftType && record.shiftType !== 'Normal') {
                shiftDisplay = `Shift ${record.shiftType}`;
            }

            // OT fields
            const otData = JSON.parse(localStorage.getItem(getOTStorageKey(record.timestamp)) || 'null');
            const autoRate = getOTRateForDate(displayDate, notesDisplay);

            let otStart = '';
            let otEnd = '';
            let otDuration = '';
            let otRate = '';
            let otPay = '';
            let otHoursValue = '';

            if (record.type === 'leave') {
                otRate = '';
            } else if (otData) {
                otStart = otData.otStartTime || '';
                otEnd = record.checkOutTime || '';
                otHoursValue = otData.otHours || '';

                if (otData.otStartTime && record.checkOutTime) {
                    const otStartParts = otData.otStartTime.split(':');
                    const otEndParts = record.checkOutTime.split(':');

                    const otStartDate = new Date();
                    otStartDate.setHours(parseInt(otStartParts[0], 10), parseInt(otStartParts[1], 10), 0);

                    const otEndDate = new Date();
                    otEndDate.setHours(parseInt(otEndParts[0], 10), parseInt(otEndParts[1], 10), 0);

                    if (otEndDate < otStartDate) {
                        otEndDate.setDate(otEndDate.getDate() + 1);
                    }

                    const otDiffMs = otEndDate - otStartDate;
                    const otDiffHours = otDiffMs / (1000 * 60 * 60);
                    const roundedOTHours = roundOTDuration(otDiffHours);

                    const hours = Math.floor(roundedOTHours);
                    const minutes = Math.round((roundedOTHours - hours) * 60);
                    otDuration = `${hours}h ${minutes}m`;
                }

                otRate = otData.otRate ? `${otData.otRate}×` : `${autoRate}×`;
                otPay = otData.otPayAmount ? `${parseFloat(otData.otPayAmount).toFixed(2)}` : '';
            } else {
                otRate = `${autoRate}×`;
            }

            return {
                date: displayDate,
                checkIn: record.checkInTime || '',
                checkOut: record.checkOutTime || '',
                duration,
                otStart,
                otEnd,
                otDuration,
                otRate,
                otPay,
                otHours: otHoursValue,
                shift: shiftDisplay,
                notes: notesDisplay,
                recordTimestamp: record.timestamp || ''
            };
        });

    return rows;
}

function filterExportRows(rows, period) {
    if (!Array.isArray(rows)) return [];
    const yearPrefix = `${period.year}-`;
    if (period.type === 'monthly') {
        const ymPrefix = `${period.year}-${period.month}`;
        return rows.filter(r => r.date && r.date.startsWith(ymPrefix));
    }
    // yearly + yearly_all_months: whole year
    return rows.filter(r => r.date && r.date.startsWith(yearPrefix));
}

function csvEscape(value) {
    const s = String(value ?? '');
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
}

function downloadTextFile(content, filename, mimeType) {
    const element = document.createElement('a');
    element.setAttribute('href', `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`);
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

function exportAttendanceAsCSV(allRows, period) {
    const rows = filterExportRows(allRows, period);
    const filename = `attendance_${period.type}_${period.year}${period.type === 'monthly' ? '_' + period.month : ''}.csv`;

    const header = [
        'Date',
        'Check In',
        'Check Out',
        'Duration',
        'OT Start',
        'OT End',
        'OT Duration',
        'OT Rate',
        'OT Pay (RM)',
        'Shift',
        'Notes'
    ];

    let csv = header.map(csvEscape).join(',') + '\n';
    rows.forEach(r => {
        const line = [
            r.date,
            r.checkIn,
            r.checkOut,
            r.duration,
            r.otStart,
            r.otEnd,
            r.otDuration,
            r.otRate,
            r.otPay,
            r.shift,
            r.notes
        ].map(csvEscape).join(',');
        csv += line + '\n';
    });

    downloadTextFile(csv, filename, 'text/csv');
}

async function exportAttendanceAsPDF(allRows, period) {
    const rows = filterExportRows(allRows, period);
    if (!rows.length) {
        alert('No records found for the selected period.');
        return;
    }

    // PDF Layout Requirements (Staff Portal – Attendance):
    // - Match the provided layout design (portrait).
    // - Logos loaded from Settings → Upload Logo for PDF Export:
    //   - Company Logo (localStorage: companyLogo)
    //   - Department Logo (localStorage: departmentLogo)
    // - Signature section follows Profiles:
    //   - Applicant: Department + user's full name
    //   - Approved by: Head of Department + Approver name

    const generatedOn = new Date();
    const filename = `attendance_${period.type}_${period.year}${period.type === 'monthly' ? '_' + period.month : ''}.pdf`;

    const profile = getCurrentUserProfileForPdf();
    const periodLabel = formatAttendancePdfPeriod(period);

    // Use higher pixel height to keep logos sharp when scaled in the PDF.
    const [companyLogo, departmentLogo] = await Promise.all([
        loadStoredLogoAsJpeg('companyLogo', 220),
        loadStoredLogoAsJpeg('departmentLogo', 220)
    ]);

    const pdfColumns = [
        'Date',
        'Check In',
        'Check Out',
        'Duration',
        'OT Start',
        'OT End',
        'OT Duration',
        'Shift',
        'Notes'
    ];

    const pdfRows = buildAttendancePdfTableRows(rows);
    const targetAttendanceRows = 31;
    while (pdfRows.length < targetAttendanceRows) {
        pdfRows.push(new Array(pdfColumns.length).fill(''));
    }

    const pdfBytes = createPdfWithAttendanceLayout({
        companyName: 'PERCETAKAN KESELAMATAN NASIONAL SDN BHD.',
        companyNo: '(Company No : 166151-T)',
        reportTitle: 'ATTENDANCE',
        profileName: profile.name,
        profileDepartment: profile.department,
        profileStaffId: profile.staffId,
        approverName: profile.approver,
        periodLabel,
        columns: pdfColumns,
        rows: pdfRows,
        generatedOn,
        companyLogo,
        departmentLogo: null,
        companyHeaderCentered: true,
        titleFontSize: 14,
        companyFontSize: 12,
        companyNoFontSize: 9,
        infoFontSize: 9,
        headerFontSize: 11.9,
        cellFontSize: 10.5,
        headerHeight: 28,
        rowHeight: 22.4,
        headerColor: [0.19, 0.29, 0.70],
        headerTextColor: [1, 1, 1],
        gridColor: [0.7, 0.7, 0.7],
        gridLineWidth: 0.6,
        outerBorderWidth: 0.8,
        columnWidths: [70, 55, 55, 55, 55, 55, 55, 55, 100],
        signatureTopY: 141,
        signatureDashY: 48.4,
        // Two-column signature block to match the provided sample layout
        signatureFixedTwoColumn: true,
        signatureStaticPlacement: true,
        signatureBlockWidth: 230,
        signatureGap: 80,
        signatureStartX: 24,
        signatureLabels: ['Applicant :', 'Approved by :'],
        signatureLabelAlign: 'left',
        signatureLabelPosition: 'above',
        signatureLabelOffset: 88,
        signatureApproverDepartmentPosition: 'below',
        signatureApproverDeptOffset: 14.4,
        signatureApplicantDeptOffset: 15.1,
        signatureNameAlign: 'left',
        signatureNamePadding: 0,
        showSignatureNames: true,
        showSignatureDepartment: true,
        forceSinglePage: true,
        minScaleFactor: 0.55
    });

    downloadBlobFile(new Blob([pdfBytes], { type: 'application/pdf' }), filename);
}

function buildTravelExportRows(period) {
    const now = new Date();
    const pType = period?.type || 'monthly';
    const year = Number(period?.year || now.getFullYear());
    const month = String(period?.month || String(now.getMonth() + 1).padStart(2, '0')).padStart(2, '0');

    const formatIso = (d) => {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const formatTime12h = (value) => {
        const s = String(value || '').trim();
        if (!s) return '-';
        if (/\b(am|pm)\b/i.test(s)) return s;
        const m = s.match(/^(\d{1,2})\s*:\s*(\d{2})$/);
        if (!m) return s;
        let h = parseInt(m[1], 10);
        const min = m[2];
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        if (h === 0) h = 12;
        return `${h}:${min} ${ampm}`;
    };

    const filtered = filterTravelRecords(latestAttendanceRecords || [], {
        periodType: pType,
        month,
        year: String(year)
    });

    const grouped = groupAttendanceRecordsByDate(filtered);

    const startDate = pType === 'yearly'
        ? new Date(year, 0, 1)
        : new Date(year, parseInt(month, 10) - 1, 1);
    const endDate = pType === 'yearly'
        ? new Date(year, 11, 31)
        : new Date(year, parseInt(month, 10), 0);

    const out = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const date = formatIso(d);
        const record = grouped[date] || {};
        const storedNotes = getStoredNotesForDate(date);
        const baseNotes = (storedNotes && storedNotes.trim() !== '') ? storedNotes : (record.notes || '');
        const leaveCode = record.type === 'leave' ? getLeaveTypeCode(record.leaveType) : '';
        const isPublicHoliday = leaveCode === 'PH';
        let effectiveNotes = String(baseNotes || '').trim();

        // If there is no attendance record for the date, do not show Notes (even if a legacy Notes entry exists).
        // Attendance record means: check-in/out times, or an explicit leave record.
        const hasAttendanceRecord = Boolean(record && (record.type === 'leave' || record.checkInTime || record.checkOutTime));
        if (!hasAttendanceRecord) {
            effectiveNotes = '';
        }
        if (record.type === 'leave') {
            if (isPublicHoliday) {
                if (effectiveNotes && !/^ph\b|^public holiday\b/i.test(effectiveNotes)) {
                    effectiveNotes = `PH (${effectiveNotes})`;
                } else if (!effectiveNotes) {
                    effectiveNotes = leaveCode || 'PH';
                }
            } else {
                effectiveNotes = leaveCode;
            }
        }

        const dayIndex = d.getDay();
        const isWeekend = dayIndex === 0 || dayIndex === 6;
        if ((isWeekend || record.type === 'leave') && /^late\b/i.test(effectiveNotes)) {
            effectiveNotes = '';
        }

        const hasAnyTime = Boolean(record.checkInTime || record.checkOutTime);

        // If there is NO attendance time record for the day, suppress auto-disqualifier flags like
        // LATE/HALFDAY so they don't appear on the Travel PDF as "no record but LATE".
        if (!hasAnyTime && record.type !== 'leave' && /^(LATE|HALFDAY)(\b|\s|\(|$)/i.test(effectiveNotes)) {
            effectiveNotes = '';
        }

        const allowance = hasAnyTime
            ? (shouldZeroTravelAllowance(date, effectiveNotes, record.type) ? 0 : 7)
            : 0;

        const checkIn = record.type === 'leave' ? '-' : formatTime12h(record.checkInTime);
        const checkOut = record.type === 'leave' ? '-' : formatTime12h(record.checkOutTime);

        out.push({
            date,
            day: getDayNameShort(date),
            checkIn,
            checkOut,
            allowance,
            notes: effectiveNotes
        });
    }

    return out;
}

function exportTravelAsCSV(rows, period) {
    const filename = `travel_allowance_${period.type}_${period.year}${period.type === 'monthly' ? '_' + period.month : ''}.csv`;
    const header = ['Date', 'Day', 'Check-In', 'Check-Out', 'Attendance Allowance', 'Notes'];

    const formatTravelDate = (isoDate) => {
        const m = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return isoDate || '';
        return `${m[3]}/${m[2]}/${m[1]}`;
    };

    let csv = header.map(csvEscape).join(',') + '\n';
    rows.forEach(r => {
        const line = [
            formatTravelDate(r.date),
            r.day,
            r.checkIn,
            r.checkOut,
            Number(r.allowance) > 0 ? `RM ${Number(r.allowance).toFixed(2)}` : '',
            r.notes || ''
        ].map(csvEscape).join(',');
        csv += line + '\n';
    });

    downloadTextFile(csv, filename, 'text/csv');
}

async function exportTravelAsPDF(rows, period) {
    if (!rows.length) {
        alert('No records found for the selected period.');
        return;
    }

    const formatTravelDate = (isoDate) => {
        const m = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return isoDate || '';
        return `${m[3]}/${m[2]}/${m[1]}`;
    };

    const generatedOn = new Date();
    const filename = `travel_allowance_${period.type}_${period.year}${period.type === 'monthly' ? '_' + period.month : ''}.pdf`;
    const profile = getCurrentUserProfileForPdf();
    const periodLabel = (formatAttendancePdfPeriod(period) || '').toUpperCase();
    const titlePrefix = String(period?.type || 'monthly').toUpperCase() === 'YEARLY' ? 'YEARLY' : 'MONTHLY';

    // Match the sample form: no logos.
    const companyLogo = null;
    const departmentLogo = null;

    const pdfColumns = ['Date', 'Day', 'Check-In', 'Check-Out', 'Attendance\nallowance', 'Notes'];
    const pdfRows = rows.map(r => {
        const allowanceText = Number(r.allowance) > 0 ? `RM ${Number(r.allowance).toFixed(2)}` : '';
        return [
            formatTravelDate(r.date),
            r.day || '',
            r.checkIn || '-',
            r.checkOut || '-',
            allowanceText,
            r.notes || ''
        ];
    });

    const rowBackgrounds = rows.map(r => {
        const day = String(r.day || '').toLowerCase();
        const note = String(r.notes || '').trim().toLowerCase();
        const isWeekend = day.startsWith('sat') || day.startsWith('sun');
        const isPublicHoliday = /^ph\b|^public holiday\b/.test(note);
        if (isWeekend || isPublicHoliday) {
            return [0.86, 0.86, 0.86];
        }
        return null;
    });

    const totalAllowance = rows.reduce((sum, r) => sum + (Number(r.allowance) || 0), 0);
    const totalRow = new Array(pdfColumns.length).fill('');
    totalRow[4] = `TOTAL : RM ${totalAllowance.toFixed(2)}`;
    const pdfRowsWithTotal = [...pdfRows, totalRow];
    rowBackgrounds.push(null);

    const pdfBytes = createPdfWithAttendanceLayout({
        companyName: 'PERCETAKAN KESELAMATAN NASIONAL SDN BHD',
        companyNo: '(Company No : 166151 - T)',
        reportTitle: `${titlePrefix} TRAVEL ALLOWANCE FORM`,
        profileName: profile.name,
        profileDepartment: '',
        profileStaffId: profile.staffId,
        approverName: '',
        periodLabel,
        columns: pdfColumns,
        rows: pdfRowsWithTotal,
        generatedOn,
        companyLogo,
        departmentLogo,
        companyHeaderCentered: true,
        titleFontSize: 18,
        titleOffsetPct: -0.03,
        companyFontSize: 11,
        companyNoFontSize: 9,
        infoFontSize: 9,
        headerFontSize: 9.9,
        cellFontSize: 8.8,
        headerHeight: 28.6,
        rowHeight: 16.5,
        signatureTopY: 140,
        signatureDashY: 70,
        signatureLabelPosition: 'below',
        signatureLabelAlign: 'center',
        gridColor: [0, 0, 0],
        gridLineWidth: 1,
        outerBorderWidth: 1,
        columnWidths: [90, 55, 85, 85, 110, 122],
        headerColor: [0.25, 0.25, 0.25],
        infoLineBlocks: [
            [
                { x: 24, text: `PERIOD : ${periodLabel}` }
            ],
            [
                { x: 24, text: `NAME : ${profile.name || ''}` },
                { x: 330, text: `ID STAFF : ${profile.staffId || ''}` }
            ]
        ],
        signatureLabels: ["Employee's Signature", "Head of Department's Signature"],
        showSignatureNames: false,
        rowBackgrounds,
        forceSinglePage: true
    });

    downloadBlobFile(new Blob([pdfBytes], { type: 'application/pdf' }), filename);
}

function buildOtFormExportRows(period) {
    const rows = buildOtRows(period?.type || 'monthly', period?.month, period?.year) || [];
    return rows.map(r => {
        const hoursVal = Number(r.hours) || 0;
        const h15Num = r.rate && Math.abs(r.rate - 1.5) < 0.01 ? hoursVal : 0;
        const h20Num = r.rate && Math.abs(r.rate - 2.0) < 0.01 ? hoursVal : 0;
        const h30Num = r.rate && Math.abs(r.rate - 3.0) < 0.01 ? hoursVal : 0;
        const fmtHours = (val) => val > 0 ? val.toFixed(2) : '';
        return {
            date: r.date,
            otStart: r.otStart || '',
            otEnd: r.otEnd || r.checkOut || '',
            h15: fmtHours(h15Num),
            h20: fmtHours(h20Num),
            h30: fmtHours(h30Num),
            h15Num,
            h20Num,
            h30Num,
            shift: r.shift || '',
            notes: r.notes || ''
        };
    });
}

function exportOtFormAsCSV(rows, period) {
    const filename = `ot_form_${period.type}_${period.year}${period.type === 'monthly' ? '_' + period.month : ''}.csv`;
    const header = [
        'Date',
        'Overtime Hours (Start OT)',
        'Overtime Hours (Check-Out)',
        'Total Working Hours 1.5x',
        'Total Working Hours 2.0x',
        'Total Working Hours 3.0x',
        'Shift',
        'Notes'
    ];
    let csv = header.map(csvEscape).join(',') + '\n';
    rows.forEach(r => {
        const line = [
            r.date,
            r.otStart,
            r.otEnd,
            r.h15,
            r.h20,
            r.h30,
            r.shift,
            r.notes
        ].map(csvEscape).join(',');
        csv += line + '\n';
    });
    downloadTextFile(csv, filename, 'text/csv');
}

async function exportOtFormAsPDF(rows, period) {
    if (!rows.length) {
        alert('No records found for the selected period.');
        return;
    }

    const generatedOn = new Date();
    const filename = `ot_form_${period.type}_${period.year}${period.type === 'monthly' ? '_' + period.month : ''}.pdf`;
    const profile = getCurrentUserProfileForPdf();
    const periodLabel = formatAttendancePdfPeriod(period);

    // Determine whether to hide the Supervisor signature based on user/role access flags.
    let hideSignSv = false;
    try {
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        const username = currentUser.username || '';
        const role = currentUser.role || '';
        const userAccess = JSON.parse(localStorage.getItem('userAccess') || '{}');
        const roleAccess = JSON.parse(localStorage.getItem('roleAccess') || '{}');
        const perUser = username && userAccess[username] ? userAccess[username].hideSignSv : undefined;
        const roleDefault = role && roleAccess[role] ? roleAccess[role].hideSignSv : undefined;
        hideSignSv = perUser !== undefined ? perUser : (roleDefault !== undefined ? roleDefault : false);
    } catch (e) {
        hideSignSv = false;
    }

    const totals = rows.reduce((acc, r) => {
        acc.h15 += Number(r.h15Num) || 0;
        acc.h20 += Number(r.h20Num) || 0;
        acc.h30 += Number(r.h30Num) || 0;
        return acc;
    }, { h15: 0, h20: 0, h30: 0 });

    const formatHours = (val) => {
        const n = Number(val) || 0;
        if (!n) return '';
        const fixed = n.toFixed(2);
        return fixed.replace(/\.00$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
    };

    const formatTime = (value) => {
        const raw = String(value || '').trim();
        if (!raw || raw === '-') return '';
        const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
        if (!m) return raw;
        return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
    };

    // Data column structure (header labels are provided via headerRows).
    const columns = ['Date', 'Start OT', 'Check-out', '1.5x', '2.0x', '3.0x', 'Shift', 'Notes'];

    // Two-row header: group headings + sub headings (matches the provided template).
    const headerRows = [
        [
            { text: 'Date', rowSpan: 2 },
            { text: 'Overtime Hours', colSpan: 2 },
            { text: 'Total Working Hours', colSpan: 3 },
            { text: 'Shift', rowSpan: 2 },
            { text: 'Notes', rowSpan: 2 }
        ],
        [
            { text: 'Start OT' },
            { text: 'Check-out' },
            { text: '1.5x' },
            { text: '2.0x' },
            { text: '3.0x' }
        ]
    ];

    const pdfRows = rows.map(r => [
        formatAttendancePdfDate(r.date),
        formatTime(r.otStart),
        formatTime(r.otEnd),
        formatHours(r.h15Num),
        formatHours(r.h20Num),
        formatHours(r.h30Num),
        r.shift || '',
        r.notes || ''
    ]);
    const targetOtFormRows = 29;
    while (pdfRows.length < targetOtFormRows) {
        pdfRows.push(new Array(columns.length).fill(''));
    }
    pdfRows.push([
        'Total',
        '',
        '',
        formatHours(totals.h15),
        formatHours(totals.h20),
        formatHours(totals.h30),
        '',
        ''
    ]);
    const rowBackgrounds = pdfRows.map((_, idx) => idx === pdfRows.length - 1 ? [0.92, 0.92, 0.92] : null);

    const infoLineBlocks = [
        [{ x: 24, text: `Name: ${profile.name || ''}` }],
        [{ x: 24, text: `Department: ${profile.department || ''}` }],
        [{ x: 24, text: `ID: ${profile.staffId || ''}` }],
        [{ x: 24, text: `Period : ${periodLabel || ''}` }]
    ];

    const pdfBytes = createPdfWithAttendanceLayout({
        companyName: 'PERCETAKAN KESELAMATAN NASIONAL SDN BHD',
        companyNo: '(Company No.: 166151-T)',
        reportTitle: 'OVERTIME CLAIM FORM',
        profileName: profile.name,
        profileDepartment: profile.department,
        profileStaffId: profile.staffId,
        approverName: '',
        periodLabel,
        columns,
        rows: pdfRows,
        generatedOn,
        companyLogo: null,
        departmentLogo: null,
        titleOffsetPct: -0.005,
        companyHeaderCentered: true,
        titleFontSize: 18,
        companyFontSize: 11,
        companyNoFontSize: 9,
        infoFontSize: 9,
        headerFontSize: 9,
        cellFontSize: 8,
        headerColor: [0.93, 0.93, 0.93],
        headerTextColor: [0, 0, 0],
        headerRows,
        headerRowHeights: [14, 14],
        headerHeight: 28,
        rowHeight: 16,
        gridColor: [0, 0, 0],
        gridLineWidth: 1,
        outerBorderWidth: 1,
        columnWidths: [80, 65, 65, 55, 55, 55, 55, 117],
        infoLineBlocks,
        signatureTopY: 200,
        signatureDashY: 55,
        signatureLabelPosition: 'below',
        signatureLabelAlign: 'center',
        signatureLabels: hideSignSv ? ['Employee / Date', 'Head of Department / Date'] : ['Employee / Date', 'Supervisor / Date', 'Head of Department / Date'],
        showSignatureNames: false,
        rowBackgrounds,
        forceSinglePage: true,
        footerBox: {
            leftTitle: 'Shift',
            rightTitle: 'Meal',
            leftLine: '(B) ____________________ X 10.00 = ____________________',
            rightLine: '____________________ X 8.50 = ____________________',
            transportLine: 'Transport: ________________________________',
            rowHeights: [18, 18, 27]
        }
    });

    downloadBlobFile(new Blob([pdfBytes], { type: 'application/pdf' }), filename);
}

function buildOtApprovalExportRows(period) {
    const rows = buildOtRows(period?.type || 'monthly', period?.month, period?.year) || [];
    const profile = getCurrentUserProfileForPdf();
    const displayName = profile.name || profile.username || profile.staffId || '-';
    return rows.map((r, idx) => {
        const start = r.otStart || '';
        const end = r.otEnd || r.checkOut || '';
        const otRange = start || end ? `${start || '-'} to ${end || '-'}` : '';
        return {
            index: idx + 1,
            date: r.date,
            name: displayName,
            otStart: start,
            checkOut: end,
            otRange,
            notes: r.notes || ''
        };
    });
}

function exportOtApprovalAsCSV(rows, period) {
    const filename = `ot_approval_${period.type}_${period.year}${period.type === 'monthly' ? '_' + period.month : ''}.csv`;
    const header = ['No.', 'Date', 'Name', 'Overtime Hours (Start/Check-Out)', 'Notes'];
    let csv = header.map(csvEscape).join(',') + '\n';
    rows.forEach(r => {
        const start = r.otStart || '';
        const end = r.checkOut || '';
        const otRange = r.otRange != null
            ? r.otRange
            : (start || end ? `${start || '-'} to ${end || '-'}` : '');
        const line = [
            r.index,
            r.date,
            r.name,
            otRange,
            r.notes
        ].map(csvEscape).join(',');
        csv += line + '\n';
    });
    downloadTextFile(csv, filename, 'text/csv');
}

async function exportOtApprovalAsPDF(rows, period) {
    if (!rows.length) {
        alert('No records found for the selected period.');
        return;
    }

    const generatedOn = new Date();
    const filename = `ot_approval_${period.type}_${period.year}${period.type === 'monthly' ? '_' + period.month : ''}.pdf`;
    const profile = getCurrentUserProfileForPdf();
    const periodLabel = formatAttendancePdfPeriod(period);

    const formatOtApprovalDate = (isoDate) => {
        const m = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return isoDate || '';
        return `${m[3]}/${m[2]}/${m[1]}`;
    };

    // Match the provided form: no logos.
    const companyLogo = null;
    const departmentLogo = null;

    // Leaf columns (table body)
    const pdfColumns = ['No.', 'Date', 'Name', 'Start OT', 'Check-out', 'Notes'];

    const pdfRows = rows.map(r => [
        String(r.index || ''),
        formatOtApprovalDate(r.date),
        r.name || '-',
        r.otStart || '-',
        r.checkOut || '-',
        r.notes || ''
    ]);
    const targetOtApprovalRows = 27;
    while (pdfRows.length < targetOtApprovalRows) {
        pdfRows.push(new Array(pdfColumns.length).fill(''));
    }

    // Two-row header with merged "Overtime Hours" group.
    const headerRows = [
        [
            { text: 'No.', rowSpan: 2 },
            { text: 'Date', rowSpan: 2 },
            { text: 'Name', rowSpan: 2 },
            { text: 'Overtime Hours', colSpan: 2 },
            { text: 'Notes', rowSpan: 2 }
        ],
        [
            { text: 'Start OT' },
            { text: 'Check-out' }
        ]
    ];

    const infoLineBlocks = [
        [{ x: 24, text: `Name: ${profile.name || ''}` }],
        [{ x: 24, text: `Department: ${profile.department || ''}` }],
        [{ x: 24, text: `ID Staff: ${profile.staffId || ''}` }],
        [{ x: 24, text: `Period : ${periodLabel || ''}` }]
    ];

    const footerNoteLines = [
        'Note: This form must be completed in duplicate - the original form must be submitted to the Human Resources Department',
        'and a copy must be sent to the Security Department.'
    ];

    const pdfBytes = createPdfWithAttendanceLayout({
        companyName: 'PERCETAKAN KESELAMATAN NASIONAL SDN BHD',
        companyNo: '(Company No.: 166151-T)',
        reportTitle: 'OVERTIME APPROVAL FORM',
        profileName: profile.name,
        profileDepartment: profile.department,
        profileStaffId: profile.staffId,
        approverName: profile.approver,
        periodLabel,
        columns: pdfColumns,
        rows: pdfRows,
        generatedOn,
        companyLogo,
        departmentLogo,
        companyHeaderCentered: true,
        titleOffsetPct: -0.013,
        titleFontSize: 20,
        companyFontSize: 11,
        companyNoFontSize: 9,
        infoFontSize: 9,
        headerFontSize: 9,
        cellFontSize: 8,
        headerColor: [0.93, 0.93, 0.93],
        headerTextColor: [0, 0, 0],
        headerRows,
        headerRowHeights: [14, 14],
        headerHeight: 28,
        rowHeight: 16,
        gridColor: [0, 0, 0],
        gridLineWidth: 1,
        outerBorderWidth: 1,
        columnWidths: [44, 82, 246, 60, 60, 55],
        infoLineBlocks,
        signatureLabels: ['Applicant:', 'Approved By:'],
        signatureLabelPosition: 'above',
        signatureLabelAlign: 'left',
        signatureTopY: 150,
        signatureLineY: null,
        signatureDashY: 66,
        signatureStaticPlacement: true,
        signatureFixedTwoColumn: true,
        signatureBlockWidth: 250,
        signatureGap: 64,
        signatureStartX: 24,
        signatureLabelOffset: 69,
        signatureLabelFontSize: 8.5,
        signatureInlineGap: 6,
        signatureDashPattern: [4, 2],
        signatureNameOffset: 18,
        signatureNameFontSize: 8,
        signatureNameAlign: 'left',
        signatureNamePadding: 2,
        showSignatureNames: true,
        showSignatureDepartment: false,
        footerNoteLines,
        footerNoteFontSize: 7.7,
        footerNoteBold: true,
        footerNoteStartY: 30,
        footerNoteGap: 9,
        forceSinglePage: true,
        minScaleFactor: 0.55
    });

    downloadBlobFile(new Blob([pdfBytes], { type: 'application/pdf' }), filename);
}

function getCurrentUserProfileForPdf() {
    const empty = { name: '', staffId: '', department: '', approver: '' };
    const currentUserRaw = sessionStorage.getItem('currentUser');
    if (!currentUserRaw) return empty;

    let user = {};
    try {
        user = JSON.parse(currentUserRaw) || {};
    } catch {
        return empty;
    }

    const userId = user.userId || user.username;

    // First check for saved profile (takes priority)
    try {
        const allProfiles = JSON.parse(localStorage.getItem('userProfiles') || '{}');
        const savedProfile = allProfiles[userId];
        if (savedProfile) {
            return {
                name: savedProfile.fullName || savedProfile.name || user.username || '',
                staffId: savedProfile.staffId || '',
                department: savedProfile.department || '',
                approver: savedProfile.approver || ''
            };
        }
    } catch (err) {
        console.warn('Failed to load saved profile:', err);
    }

    // Fallback to users array
    let fromUsers = null;
    try {
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        fromUsers = users.find(u =>
            u && (
                (user.id && u.id === user.id) ||
                (user.userId && u.userId === user.userId) ||
                (!user.userId && user.username && u.username === user.username)
            )
        ) || null;
    } catch {
        fromUsers = null;
    }

    const src = fromUsers || user;
    const profile = {
        name: src.name || src.username || '',
        staffId: src.staffId || '',
        department: src.department || '',
        approver: src.approver || ''
    };

    if (fromUsers) {
        try {
            sessionStorage.setItem('currentUser', JSON.stringify(fromUsers));
        } catch {
            // ignore storage write errors
        }
    }

    return profile;
}

function formatAttendancePdfPeriod(period) {
    const monthNames = {
        '01': 'January',
        '02': 'February',
        '03': 'March',
        '04': 'April',
        '05': 'May',
        '06': 'June',
        '07': 'July',
        '08': 'August',
        '09': 'September',
        '10': 'October',
        '11': 'November',
        '12': 'December'
    };

    if (period && period.type === 'monthly') {
        return `${monthNames[period.month] || period.month} ${period.year}`;
    }
    return period && period.year ? String(period.year) : '';
}

function formatAttendancePdfDate(isoDate) {
    const s = String(isoDate || '').trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return s;

    const year = m[1];
    const month = parseInt(m[2], 10);
    const day = m[3];

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mon = months[month - 1] || m[2];
    return `${mon} ${day}, ${year}`;
}

function buildAttendancePdfTableRows(rows) {
    const leaveCodeToName = {
        'AL': 'Annual Leave',
        'MC': 'Medical Leave',
        'EL': 'Emergency Leave',
        'CL': 'Compassionate Leave',
        'PH': 'Public Holiday'
    };

    const dash = (value) => {
        const t = String(value ?? '').trim();
        return t ? t : '-';
    };

    const extractLeaveCode = (notes) => {
        const t = String(notes ?? '').trim();
        const match = t.match(/^([A-Z]{2})\b/);
        return match ? match[1] : '';
    };

    return rows.map(r => {
        const dateCell = formatAttendancePdfDate(r.date);
        const isLeave = String(r.shift || '') === 'Leave';

        if (isLeave) {
            const code = extractLeaveCode(r.notes);
            const shortCode = code || 'Leave';
            const leaveName = leaveCodeToName[code] || 'Leave';
            return [
                dash(dateCell),
                dash('-'),
                '-',
                '-',
                '-',
                '-',
                '-',
                dash('Leave'),
                dash(r.notes)
            ];
        }

        // Keep Shift exactly as recorded (no replacement of 'Normal' with '-').
        const shiftCell = dash(r.shift);
        return [
            dash(dateCell),
            dash(r.checkIn),
            dash(r.checkOut),
            dash(r.duration),
            dash(r.otStart),
            dash(r.otEnd),
            dash(r.otDuration),
            shiftCell,
            dash(r.notes)
        ];
    });
}

async function loadStoredLogoAsJpeg(storageKey, targetHeightPx) {
    try {
        const src = localStorage.getItem(storageKey);
        if (!src) return null;

        const img = await loadImageElement(src);
        if (!img) return null;

        const targetH = Math.max(1, Math.round(Number(targetHeightPx) || 60));
        const naturalH = img.naturalHeight || targetH;
        const naturalW = img.naturalWidth || targetH;
        const scale = targetH / naturalH;
        const targetW = Math.max(1, Math.round(naturalW * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // JPEG has no alpha; flatten on white.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const bytes = await canvasToJpegBytes(canvas, 0.95);
        return { bytes, width: targetW, height: targetH };
    } catch {
        return null;
    }
}

function downloadBlobFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Give the browser a moment before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImageElement(src) {
    return new Promise((resolve) => {
        if (!src) {
            resolve(null);
            return;
        }
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

async function renderPdfReportToCanvas({ title, columns, rows, companyLogoSrc, deptLogoSrc, generatedOn, renderScale = 2 }) {
    const padding = 16;
    const headerHeight = 64;
    const metaLineGap = 16;
    const tableHeaderHeight = 30;
    const rowHeight = 24;
    const border = 1;
    const font = '12px Segoe UI';
    const titleFont = 'bold 16px Segoe UI';
    const metaFont = '12px Segoe UI';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Canvas context not available');
    }

    // Measure column widths
    ctx.font = font;
    const colWidths = columns.map((col, idx) => {
        let max = ctx.measureText(col).width;
        rows.forEach(r => {
            const v = r[idx] ?? '';
            max = Math.max(max, ctx.measureText(String(v)).width);
        });
        // add cell padding
        return Math.ceil(max + 20);
    });

    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const tableHeight = tableHeaderHeight + rows.length * rowHeight;

    const scale = Math.max(1, Math.min(3, Number(renderScale) || 1));
    const logicalWidth = Math.ceil(padding * 2 + tableWidth + border * 2);
    const logicalHeight = Math.ceil(padding * 2 + headerHeight + tableHeight + border * 2);

    // Increase pixel density for sharper output.
    canvas.width = Math.round(logicalWidth * scale);
    canvas.height = Math.round(logicalHeight * scale);
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = true;
    if (typeof ctx.imageSmoothingQuality === 'string') {
        ctx.imageSmoothingQuality = 'high';
    }

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);

    // Header: title + meta
    ctx.font = titleFont;
    ctx.fillStyle = '#111827';
    ctx.fillText(title, padding, padding + 20);

    ctx.font = metaFont;
    ctx.fillStyle = '#6b7280';
    ctx.fillText(`Generated on ${generatedOn.toLocaleString()}`, padding, padding + 20 + metaLineGap);

    // Logos (right-aligned)
    const [companyImg, deptImg] = await Promise.all([
        loadImageElement(companyLogoSrc),
        loadImageElement(deptLogoSrc)
    ]);
    const logos = [companyImg, deptImg].filter(Boolean);
    const logoMaxHeight = 44;
    const logoGap = 10;

    const logoSizes = logos.map(img => {
        const h = Math.min(logoMaxHeight, img.naturalHeight || logoMaxHeight);
        const scale = h / (img.naturalHeight || h);
        const w = (img.naturalWidth || h) * scale;
        return { img, w, h };
    });
    const totalLogoWidth = logoSizes.reduce((sum, s) => sum + s.w, 0) + Math.max(0, logoSizes.length - 1) * logoGap;
    let logoX = logicalWidth - padding - totalLogoWidth;
    const logoY = padding; // top aligned
    logoSizes.forEach(s => {
        try {
            ctx.drawImage(s.img, logoX, logoY, s.w, s.h);
        } catch (e) {
            // ignore draw failures
        }
        logoX += s.w + logoGap;
    });

    // Table origin
    const x0 = padding;
    const y0 = padding + headerHeight;

    // Header background
    ctx.fillStyle = '#667eea';
    ctx.fillRect(x0, y0, tableWidth, tableHeaderHeight);

    // Header text
    ctx.font = 'bold 12px Segoe UI';
    ctx.fillStyle = '#ffffff';
    let x = x0;
    for (let i = 0; i < columns.length; i++) {
        ctx.fillText(columns[i], x + 10, y0 + 20);
        x += colWidths[i];
    }

    // Rows
    ctx.font = font;
    for (let r = 0; r < rows.length; r++) {
        const y = y0 + tableHeaderHeight + r * rowHeight;
        ctx.fillStyle = r % 2 === 0 ? '#f9fafb' : '#ffffff';
        ctx.fillRect(x0, y, tableWidth, rowHeight);

        ctx.fillStyle = '#111827';
        let cx = x0;
        for (let c = 0; c < columns.length; c++) {
            const text = String(rows[r][c] ?? '');
            ctx.fillText(text, cx + 10, y + 16);
            cx += colWidths[c];
        }
    }

    // Grid lines
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;

    // Vertical
    let vx = x0;
    for (let i = 0; i <= columns.length; i++) {
        ctx.beginPath();
        ctx.moveTo(vx, y0);
        ctx.lineTo(vx, y0 + tableHeight);
        ctx.stroke();
        if (i < columns.length) vx += colWidths[i];
    }
    // Horizontal
    for (let i = 0; i <= rows.length + 1; i++) {
        const lineY = i === 0 ? y0 : (i === 1 ? y0 + tableHeaderHeight : y0 + tableHeaderHeight + (i - 1) * rowHeight);
        ctx.beginPath();
        ctx.moveTo(x0, lineY);
        ctx.lineTo(x0 + tableWidth, lineY);
        ctx.stroke();
    }

    return canvas;
}

function canvasToJpegBytes(canvas, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            async (blob) => {
                if (!blob) {
                    reject(new Error('Failed to create image blob'));
                    return;
                }
                const buf = await blob.arrayBuffer();
                resolve(new Uint8Array(buf));
            },
            'image/jpeg',
            quality
        );
    });
}

function createPdfWithAttendanceLayout({
    companyName,
    companyNo,
    reportTitle,
    profileName,
    profileDepartment,
    profileStaffId,
    approverName,
    periodLabel,
    columns,
    rows,
    generatedOn,
    companyLogo,
    departmentLogo,
    headerColor = [0.20, 0.35, 0.75],
    headerTextColor = [1, 1, 1],
    headerRows = null,
    headerRowHeights = null,
    infoLinesOverride = null,
    infoLineBlocks = null,
    signatureLabels = ['Applicant :', 'Approved by :'],
    signatureNames = null,
    signatureDepartments = null,
    signatureLabelPosition = 'above',
    signatureLabelAlign = 'left',
    signatureDashY = 80,
    signatureLineY = null,
    signatureFixedTwoColumn = false,
    signatureStaticPlacement = false,
    signatureLayout = 'auto',
    signatureBlockWidth = null,
    signatureStartX = null,
    signatureGap = null,
    signaturePositions = null,
    signatureLabelOffset = 0,
    signatureLabelFontSize = null,
    signatureInlineGap = 6,
    signatureDashPattern = null,
    signatureDashLineWidth = null,
    signatureLineWidth = null,
    signatureApproverDepartmentPosition = 'auto',
    signatureApproverDeptOffset = null,
    signatureApplicantDeptOffset = null,
    showSignatureNames = true,
    showSignatureDepartment = true,
    signatureNameOffset = 0,
    signatureNameFontSize = null,
    signatureNameAlign = 'center',
    signatureNamePadding = 0,
    footerNoteLines = null,
    footerNoteFontSize = 7,
    footerNoteBold = false,
    footerNoteStartY = 24,
    footerNoteGap = 10,
    footerBox = null,
    rowBackgrounds = null,
    companyHeaderCentered = false,
    columnWidths = null,
    titleOffsetPct = 0,
    titleFontSize = 16,
    companyFontSize = 13,
    companyNoFontSize = 9,
    infoFontSize = 9,
    headerFontSize = 8,
    cellFontSize = 7,
    headerHeight = 18,
    rowHeight = 16,
    signatureTopY = 170,
    forceSinglePage = false,
    minScaleFactor = 0.7,
    gridColor = [0.75, 0.75, 0.75],
    gridLineWidth = 0.5,
    outerBorderWidth = 0.5
}) {
    const encoder = new TextEncoder();
    const fmt = (n) => {
        const s = Number(n).toFixed(3);
        return s.replace(/\.000$/, '').replace(/(\.\d*?)0+$/, '$1');
    };

    const pageWidth = 595.28; // A4 portrait (pt)
    const pageHeight = 841.89;
    const margin = 20;
    const centerX = pageWidth / 2;

    const cellPadX = 3;

    const safeCompanyName = sanitizePdfText(companyName || '');
    const safeCompanyNo = sanitizePdfText(companyNo || '');
    const safeTitle = sanitizePdfText(reportTitle || 'ATTENDANCE');

    const safeName = sanitizePdfText(profileName || '') || '-';
    const rawDept = sanitizePdfText(profileDepartment || '');
    const safeDept = rawDept || '-';
    const safeStaffId = sanitizePdfText(profileStaffId || '') || '-';
    const safeApprover = sanitizePdfText(approverName || '') || '';
    const safePeriod = sanitizePdfText(periodLabel || '') || '-';
    const safeGenerated = generatedOn ? sanitizePdfText(generatedOn.toLocaleString()) : '';

    const tableX = margin;
    const tableWidth = pageWidth - margin * 2;

    // Column widths (supports non-attendance tables like Travel Allowance / OT forms)
    let widths = [];

    if (Array.isArray(columnWidths) && Array.isArray(columns) && columnWidths.length === columns.length) {
        widths = columnWidths.map(w => Number(w) || 0);
    } else if (Array.isArray(columns) && columns.length === 9) {
        // Default attendance layout: rebalance columns and guarantee a wider Notes column.
        const fixedWidths = [55, 55, 55, 55, 55, 55, 55, 55];
        const fixedSum = fixedWidths.reduce((a, b) => a + b, 0);
        widths = fixedWidths.slice();
        widths.push(Math.max(120, tableWidth - fixedSum)); // Notes (minimum 120pt)
    } else {
        const colCount = (Array.isArray(columns) && columns.length) ? columns.length : 1;
        const base = Math.floor(tableWidth / colCount);
        widths = new Array(colCount).fill(base);
        widths[widths.length - 1] = tableWidth - base * (colCount - 1);
    }

    // Scale to fit exactly within the table width.
    const totalW = widths.reduce((a, b) => a + b, 0);
    if (totalW > 0 && totalW !== tableWidth) {
        const scale = tableWidth / totalW;
        widths = widths.map(w => w * scale);
    }

    const xStarts = [tableX];
    for (let i = 0; i < widths.length; i++) {
        xStarts.push(xStarts[i] + widths[i]);
    }

    // Header layout
    const headerTopY = pageHeight - margin;
    const logoHeightPt = 50;
    const logoY = headerTopY - logoHeightPt;
    const logoGapPt = 10;

    const companyLogoSize = companyLogo && companyLogo.width && companyLogo.height
        ? { h: logoHeightPt, w: logoHeightPt * (companyLogo.width / companyLogo.height) }
        : null;
    const deptLogoSize = departmentLogo && departmentLogo.width && departmentLogo.height
        ? { h: logoHeightPt, w: logoHeightPt * (departmentLogo.width / departmentLogo.height) }
        : null;

    let logosTotalWidth = 0;
    if (companyLogoSize) logosTotalWidth += companyLogoSize.w;
    if (deptLogoSize) logosTotalWidth += deptLogoSize.w + (companyLogoSize ? logoGapPt : 0);
    const companyTextX = margin + (logosTotalWidth ? logosTotalWidth + 16 : 0);
    let companyNameX = companyTextX;
    let companyNoX = companyTextX;
    if (companyHeaderCentered) {
        const approxNameW = safeCompanyName.length * (companyFontSize * 0.6);
        const approxNoW = safeCompanyNo.length * (companyNoFontSize * 0.6);
        const headerOffset = -tableWidth * 0.01;
        companyNameX = Math.max(margin, centerX - approxNameW / 2 + headerOffset);
        companyNoX = Math.max(margin, centerX - approxNoW / 2 + headerOffset);
    }

    const companyNameY = headerTopY - 10;
    const companyNoY = companyNameY - 14;
    const titleY = logoY - 18;
    const lineY = titleY - 18;

    const infoStartY = lineY - 18;
    // Reduce info gap when there's limited space to allow more room for the table
    const baseInfoGap = 12;
    const infoGap = baseInfoGap;
    const defaultInfoLines = [
        `Name: ${safeName}`,
        `Department: ${safeDept}`,
        `ID: ${safeStaffId}`,
        `Period: ${safePeriod}`,
        `Generated: ${safeGenerated}`
    ];
    const infoLines = Array.isArray(infoLinesOverride) && infoLinesOverride.length
        ? infoLinesOverride.map((line) => sanitizePdfText(line || ''))
        : defaultInfoLines;

    const infoLineCount = (Array.isArray(infoLineBlocks) && infoLineBlocks.length) ? infoLineBlocks.length : infoLines.length;
    const tableTopY = infoStartY - infoGap * infoLineCount - 10;

    const rowsArr = Array.isArray(rows) ? rows : [];
    // Calculate available space for table (header + rows)
    const availableTableHeight = Math.max(headerHeight + rowHeight, tableTopY - signatureTopY);
    const availableForRows = availableTableHeight - headerHeight;
    // Calculate rows per page using the fixed rowHeight, then dynamically resize rows to fill the page
    let rowsPerPage = Math.max(1, Math.floor(availableForRows / rowHeight));
    let pageCount = Math.max(1, Math.ceil(rowsArr.length / rowsPerPage));
    if (forceSinglePage) {
        rowsPerPage = Math.max(1, rowsArr.length);
        pageCount = 1;
    }
    // Calculate dynamic row height that fills the available space
    const dynamicRowHeight = rowsPerPage > 0 ? availableForRows / rowsPerPage : rowHeight;

    // Calculate dynamic font sizes based on available row height
    // If rows are being compressed significantly, reduce font sizes proportionally
    const rowHeightRatio = dynamicRowHeight / rowHeight;
    const scaleFloor = Number.isFinite(minScaleFactor) ? minScaleFactor : 0.7;
    const maxCellScale = cellFontSize > 0
        ? Math.max(0.1, (dynamicRowHeight - 4) / cellFontSize)
        : 1;
    const maxHeaderScale = headerFontSize > 0
        ? Math.max(0.1, (headerHeight - 4) / headerFontSize)
        : 1;
    let scaleCeiling = Math.min(1.0, rowHeightRatio, maxCellScale, maxHeaderScale);
    if (!Number.isFinite(scaleCeiling) || scaleCeiling <= 0) scaleCeiling = rowHeightRatio || 1;
    const scaleFactor = forceSinglePage
        ? Math.max(0.1, scaleCeiling)
        : Math.min(1.0, Math.max(scaleFloor, scaleCeiling));
    const scaledHeaderFontSize = Math.round(headerFontSize * scaleFactor * 10) / 10;
    const scaledCellFontSize = Math.round(cellFontSize * scaleFactor * 10) / 10;

    const approxCharWidthHeader = scaledHeaderFontSize * 0.55;
    const approxCharWidthBody = scaledCellFontSize * 0.55;

    const maxCharsHeader = widths.map(w => Math.max(1, Math.floor((w - cellPadX * 2) / approxCharWidthHeader)));
    const maxCharsBody = widths.map(w => Math.max(1, Math.floor((w - cellPadX * 2) / approxCharWidthBody)));

    const truncate = (text, maxChars) => {
        const t = sanitizePdfText(text);
        if (t.length <= maxChars) return t;
        if (maxChars <= 3) return t.slice(0, maxChars);
        return t.slice(0, maxChars - 3) + '...';
    };

    const pageStreams = [];
    for (let p = 0; p < pageCount; p++) {
        const start = p * rowsPerPage;
        const pageRows = rowsArr.slice(start, start + rowsPerPage);
        const rowCount = pageRows.length;

        const tableHeight = headerHeight + rowCount * dynamicRowHeight;
        const tableBottomY = tableTopY - tableHeight;
        const headerY0 = tableTopY - headerHeight;

        let s = '';

        // Logos
        if (companyLogoSize) {
            const x = margin;
            const y = logoY;
            s += 'q\n' + fmt(companyLogoSize.w) + ' 0 0 ' + fmt(companyLogoSize.h) + ' ' + fmt(x) + ' ' + fmt(y) + ' cm\n/Im1 Do\nQ\n';
        }
        if (deptLogoSize) {
            const x = margin + (companyLogoSize ? (companyLogoSize.w + logoGapPt) : 0);
            const y = logoY;
            s += 'q\n' + fmt(deptLogoSize.w) + ' 0 0 ' + fmt(deptLogoSize.h) + ' ' + fmt(x) + ' ' + fmt(y) + ' cm\n/Im2 Do\nQ\n';
        }

        // Company header text
        if (safeCompanyName) {
            s += 'BT\n/F2 ' + fmt(companyFontSize) + ' Tf\n0 0 0 rg\n1 0 0 1 ' + fmt(companyNameX) + ' ' + fmt(companyNameY) + ' Tm\n(' + pdfEscapeText(safeCompanyName) + ') Tj\nET\n';
        }
        if (safeCompanyNo) {
            s += 'BT\n/F1 ' + fmt(companyNoFontSize) + ' Tf\n0 0 0 rg\n1 0 0 1 ' + fmt(companyNoX) + ' ' + fmt(companyNoY) + ' Tm\n(' + pdfEscapeText(safeCompanyNo) + ') Tj\nET\n';
        }

    // Report title (centered on page)
    const titleApproxWidth = safeTitle.length * (titleFontSize * 0.6);
    const titleOffset = tableWidth * titleOffsetPct;
    const titleX = Math.max(margin, centerX - titleApproxWidth / 2 + titleOffset);
        s += 'BT\n/F2 ' + fmt(titleFontSize) + ' Tf\n0 0 0 rg\n1 0 0 1 ' + fmt(titleX) + ' ' + fmt(titleY) + ' Tm\n(' + pdfEscapeText(safeTitle) + ') Tj\nET\n';

        // Thick line under title
        s += '0 0 0 RG\n2 w\n' + fmt(margin) + ' ' + fmt(lineY) + ' m ' + fmt(pageWidth - margin) + ' ' + fmt(lineY) + ' l S\n';

        // Info lines
        if (Array.isArray(infoLineBlocks) && infoLineBlocks.length) {
            for (let i = 0; i < infoLineBlocks.length; i++) {
                const y = infoStartY - i * infoGap;
                const blocks = Array.isArray(infoLineBlocks[i]) ? infoLineBlocks[i] : [];
                blocks.forEach((b) => {
                    if (!b) return;
                    const x = Number.isFinite(b.x) ? b.x : margin;
                    const text = sanitizePdfText(b.text || '');
                    s += 'BT\n/F1 ' + fmt(infoFontSize) + ' Tf\n0 0 0 rg\n1 0 0 1 ' + fmt(x) + ' ' + fmt(y) + ' Tm\n(' + pdfEscapeText(text) + ') Tj\nET\n';
                });
            }
        } else {
            for (let i = 0; i < infoLines.length; i++) {
                const y = infoStartY - i * infoGap;
                s += 'BT\n/F1 ' + fmt(infoFontSize) + ' Tf\n0 0 0 rg\n1 0 0 1 ' + fmt(margin) + ' ' + fmt(y) + ' Tm\n(' + pdfEscapeText(infoLines[i]) + ') Tj\nET\n';
            }
        }

    const headerRgb = (Array.isArray(headerColor) && headerColor.length === 3)
        ? headerColor.map((v) => Number.isFinite(v) ? v : 0)
        : [0.20, 0.35, 0.75];

    const headerTextRgb = (Array.isArray(headerTextColor) && headerTextColor.length === 3)
        ? headerTextColor.map((v) => Number.isFinite(v) ? v : 0)
        : [1, 1, 1];

    const hasHeaderRows = Array.isArray(headerRows) && headerRows.length;

    // Table header
    if (hasHeaderRows) {
        const headerRowCount = headerRows.length;
        const colCount = columns.length;

        // Compute per-row header heights that sum to headerHeight.
        let hHeights = [];
        if (Array.isArray(headerRowHeights) && headerRowHeights.length === headerRowCount) {
            const sum = headerRowHeights.reduce((a, b) => a + (Number(b) || 0), 0);
            if (sum > 0) {
                const scale = headerHeight / sum;
                hHeights = headerRowHeights.map((h) => (Number(h) || 0) * scale);
            }
        }
        if (!hHeights.length) {
            const each = headerHeight / headerRowCount;
            hHeights = new Array(headerRowCount).fill(each);
            hHeights[hHeights.length - 1] = headerHeight - each * (headerRowCount - 1);
        }

        // Row boundary Y coords: rowY[0] = top, rowY[last] = bottom.
        const rowY = [tableTopY];
        for (let i = 0; i < headerRowCount; i++) {
            rowY.push(rowY[i] - hHeights[i]);
        }

        // Place cells into a grid so we can draw merged-cell grid lines once.
        const cellId = Array.from({ length: headerRowCount }, () => new Array(colCount).fill(0));
        const cells = [];
        let nextId = 1;

        for (let r = 0; r < headerRowCount; r++) {
            const rowDef = Array.isArray(headerRows[r]) ? headerRows[r] : [];
            let cIdx = 0;
            for (const cell of rowDef) {
                while (cIdx < colCount && cellId[r][cIdx]) cIdx++;
                if (cIdx >= colCount) break;

                const cs = Math.max(1, Math.min(colCount - cIdx, Number(cell?.colSpan) || 1));
                const rs = Math.max(1, Math.min(headerRowCount - r, Number(cell?.rowSpan) || 1));
                const id = nextId++;

                for (let rr = r; rr < r + rs; rr++) {
                    for (let cc = cIdx; cc < cIdx + cs; cc++) {
                        cellId[rr][cc] = id;
                    }
                }

                cells.push({
                    id,
                    row: r,
                    col: cIdx,
                    rowSpan: rs,
                    colSpan: cs,
                    text: String(cell?.text ?? ''),
                    align: cell?.align || 'center'
                });

                cIdx += cs;
            }
        }

        // Any unassigned slots become empty 1x1 cells.
        for (let r = 0; r < headerRowCount; r++) {
            for (let c = 0; c < colCount; c++) {
                if (!cellId[r][c]) {
                    const id = nextId++;
                    cellId[r][c] = id;
                    cells.push({ id, row: r, col: c, rowSpan: 1, colSpan: 1, text: '', align: 'center' });
                }
            }
        }

        // Fill header background per cell (handles merged regions)
        for (const cell of cells) {
            const x0 = xStarts[cell.col];
            const x1 = xStarts[cell.col + cell.colSpan];
            const yTop = rowY[cell.row];
            const yBottom = rowY[cell.row + cell.rowSpan];
            const w = x1 - x0;
            const h = yTop - yBottom;
            s += fmt(headerRgb[0]) + ' ' + fmt(headerRgb[1]) + ' ' + fmt(headerRgb[2]) + ' rg\n';
            s += fmt(x0) + ' ' + fmt(yBottom) + ' ' + fmt(w) + ' ' + fmt(h) + ' re f\n';
        }

        // Header grid lines based on merged-cell structure (drawn once).
        // Draw lines BEFORE text so borders don't obscure header wording (especially merged group labels).
        const gridRgbHeader = (Array.isArray(gridColor) && gridColor.length === 3)
            ? gridColor.map((v) => Number.isFinite(v) ? v : 0)
            : [0.75, 0.75, 0.75];
        const innerWH = Number.isFinite(gridLineWidth) ? gridLineWidth : 0.5;
        s += fmt(gridRgbHeader[0]) + ' ' + fmt(gridRgbHeader[1]) + ' ' + fmt(gridRgbHeader[2]) + ' RG\n' + fmt(innerWH) + ' w\n';

        const drawHeaderVerticalLines = false;

        // Horizontal boundaries between header rows
        for (let r = 0; r < headerRowCount - 1; r++) {
            const y = rowY[r + 1];
            let segStart = null;
            for (let c = 0; c < colCount; c++) {
                const need = cellId[r][c] !== cellId[r + 1][c];
                if (need && segStart == null) segStart = c;
                if ((!need || c === colCount - 1) && segStart != null) {
                    const segEnd = need && c === colCount - 1 ? c + 1 : c;
                    const x0 = xStarts[segStart];
                    const x1 = xStarts[segEnd];
                    s += fmt(x0) + ' ' + fmt(y) + ' m ' + fmt(x1) + ' ' + fmt(y) + ' l S\n';
                    segStart = null;
                }
            }
        }

        // Vertical boundaries between columns (can be split by row spans)
        if (drawHeaderVerticalLines) {
            for (let c = 1; c < colCount; c++) {
                const x = xStarts[c];
                let segStart = null;
                for (let r = 0; r < headerRowCount; r++) {
                    const need = cellId[r][c - 1] !== cellId[r][c];
                    if (need && segStart == null) segStart = r;
                    if ((!need || r === headerRowCount - 1) && segStart != null) {
                        const segEnd = need && r === headerRowCount - 1 ? r + 1 : r;
                        const yTop = rowY[segStart];
                        const yBottom = rowY[segEnd];
                        s += fmt(x) + ' ' + fmt(yBottom) + ' m ' + fmt(x) + ' ' + fmt(yTop) + ' l S\n';
                        segStart = null;
                    }
                }
            }
        }

        // Header text (centered by default) - drawn after grid lines.
        for (const cell of cells) {
            const rawLabel = String(cell.text ?? '').trim();
            if (!rawLabel) continue;

            const x0 = xStarts[cell.col];
            const x1 = xStarts[cell.col + cell.colSpan];
            const yTop = rowY[cell.row];
            const yBottom = rowY[cell.row + cell.rowSpan];
            const w = x1 - x0;
            const h = yTop - yBottom;

            const maxChars = Math.max(1, Math.floor((w - cellPadX * 2) / approxCharWidthHeader));
            const parts = rawLabel.split('\n');
            const lineHeight = scaledHeaderFontSize + 2;
            const totalH = parts.length * lineHeight;
            const baseY = yBottom + Math.max(1, (h - totalH) / 2) + 2;

            for (let li = 0; li < parts.length; li++) {
                const t = truncate(parts[li], maxChars);
                const textW = t.length * approxCharWidthHeader;
                const cx = x0 + w / 2;
                let tx = cx - textW / 2;

                if (String(cell.align).toLowerCase() === 'left') {
                    tx = x0 + cellPadX;
                } else if (String(cell.align).toLowerCase() === 'right') {
                    tx = x1 - cellPadX - textW;
                } else {
                    tx = Math.max(x0 + cellPadX, Math.min(tx, x1 - cellPadX - textW));
                }

                // PDF coordinates increase upward; render the first label line on top.
                const ty = baseY + (parts.length - 1 - li) * lineHeight;
                s += 'BT\n/F2 ' + fmt(scaledHeaderFontSize) + ' Tf\n' + fmt(headerTextRgb[0]) + ' ' + fmt(headerTextRgb[1]) + ' ' + fmt(headerTextRgb[2]) + ' rg\n1 0 0 1 ' + fmt(tx) + ' ' + fmt(ty) + ' Tm\n(' + pdfEscapeText(t) + ') Tj\nET\n';
            }
        }
    } else {
        // Single-row header background
        s += fmt(headerRgb[0]) + ' ' + fmt(headerRgb[1]) + ' ' + fmt(headerRgb[2]) + ' rg\n';
        s += fmt(tableX) + ' ' + fmt(headerY0) + ' ' + fmt(tableWidth) + ' ' + fmt(headerHeight) + ' re f\n';

        // Table header text (supports multi-line labels with \n)
        for (let c = 0; c < columns.length; c++) {
            const rawLabel = String(columns[c] ?? '');
            const parts = rawLabel.split('\n');
            const lineHeight = scaledHeaderFontSize + 2;
            const totalH = parts.length * lineHeight;
            const baseY = headerY0 + Math.max(1, (headerHeight - totalH) / 2) + 2;

            for (let li = 0; li < parts.length; li++) {
                const t = truncate(parts[li], maxCharsHeader[c]);
                const textW = t.length * approxCharWidthHeader;
                const cx = xStarts[c] + widths[c] / 2;
                let tx = cx - textW / 2;
                tx = Math.max(xStarts[c] + cellPadX, Math.min(tx, xStarts[c] + widths[c] - cellPadX - textW));
                // PDF coordinates increase upward; render the first label line on top.
                const ty = baseY + (parts.length - 1 - li) * lineHeight;
                s += 'BT\n/F2 ' + fmt(scaledHeaderFontSize) + ' Tf\n' + fmt(headerTextRgb[0]) + ' ' + fmt(headerTextRgb[1]) + ' ' + fmt(headerTextRgb[2]) + ' rg\n1 0 0 1 ' + fmt(tx) + ' ' + fmt(ty) + ' Tm\n(' + pdfEscapeText(t) + ') Tj\nET\n';
            }
        }
    }

        // Table rows with optional background shading
        for (let r = 0; r < rowCount; r++) {
            const rowTop = headerY0 - r * dynamicRowHeight;
            const rowY0 = rowTop - dynamicRowHeight;
            const rowIndex = start + r;
            const bg = Array.isArray(rowBackgrounds) ? rowBackgrounds[rowIndex] : null;
            if (bg && bg.length === 3) {
                s += fmt(bg[0]) + ' ' + fmt(bg[1]) + ' ' + fmt(bg[2]) + ' rg\n';
                s += fmt(tableX) + ' ' + fmt(rowY0) + ' ' + fmt(tableWidth) + ' ' + fmt(dynamicRowHeight) + ' re f\n';
            }

            for (let c = 0; c < columns.length; c++) {
                const raw = (pageRows[r] && pageRows[r][c] != null) ? pageRows[r][c] : '';
                const t = truncate(raw, maxCharsBody[c]);
                const textW = t.length * approxCharWidthBody;
                const cx = xStarts[c] + widths[c] / 2;
                let tx = cx - textW / 2;
                tx = Math.max(xStarts[c] + cellPadX, Math.min(tx, xStarts[c] + widths[c] - cellPadX - textW));
                const ty = rowY0 + 4;
                s += 'BT\n/F1 ' + fmt(scaledCellFontSize) + ' Tf\n0 0 0 rg\n1 0 0 1 ' + fmt(tx) + ' ' + fmt(ty) + ' Tm\n(' + pdfEscapeText(t) + ') Tj\nET\n';
            }
        }

        // Grid
        const gridRgb = (Array.isArray(gridColor) && gridColor.length === 3)
            ? gridColor.map((v) => Number.isFinite(v) ? v : 0)
            : [0.75, 0.75, 0.75];
        const innerW = Number.isFinite(gridLineWidth) ? gridLineWidth : 0.5;
        const outerW = Number.isFinite(outerBorderWidth) ? outerBorderWidth : innerW;

        s += fmt(gridRgb[0]) + ' ' + fmt(gridRgb[1]) + ' ' + fmt(gridRgb[2]) + ' RG\n' + fmt(outerW) + ' w\n';
        s += fmt(tableX) + ' ' + fmt(tableBottomY) + ' ' + fmt(tableWidth) + ' ' + fmt(tableHeight) + ' re S\n';
        s += fmt(gridRgb[0]) + ' ' + fmt(gridRgb[1]) + ' ' + fmt(gridRgb[2]) + ' RG\n' + fmt(innerW) + ' w\n';

        for (let i = 1; i < xStarts.length - 1; i++) {
            const vx = xStarts[i];
            s += fmt(vx) + ' ' + fmt(tableBottomY) + ' m ' + fmt(vx) + ' ' + fmt(headerY0) + ' l S\n';
        }

        s += fmt(tableX) + ' ' + fmt(headerY0) + ' m ' + fmt(tableX + tableWidth) + ' ' + fmt(headerY0) + ' l S\n';
        for (let i = 1; i <= rowCount; i++) {
            const hy = headerY0 - i * dynamicRowHeight;
            s += fmt(tableX) + ' ' + fmt(hy) + ' m ' + fmt(tableX + tableWidth) + ' ' + fmt(hy) + ' l S\n';
        }

        // Signature section only on the last page.
        if (p === pageCount - 1) {
            // Optional footer box (e.g., Shift/Meal/Transport) directly under the main table.
            let footerBoxBottomY = null;
            if (footerBox && typeof footerBox === 'object') {
                const splitX = Number.isFinite(footerBox.splitX)
                    ? footerBox.splitX
                    : xStarts[Math.max(1, columns.length - 1)];

                const rowHeights = Array.isArray(footerBox.rowHeights) && footerBox.rowHeights.length
                    ? footerBox.rowHeights.map((h) => Number(h) || 0).filter((h) => h > 0)
                    : [18, 18, 18];

                const boxHeight = rowHeights.reduce((a, b) => a + b, 0);
                const boxTopY = tableBottomY;
                const boxBottomY = boxTopY - boxHeight;
                footerBoxBottomY = boxBottomY;

                const leftTitle = sanitizePdfText(footerBox.leftTitle || 'Shift');
                const rightTitle = sanitizePdfText(footerBox.rightTitle || 'Meal');
                const leftLine = sanitizePdfText(footerBox.leftLine || '');
                const rightLine = sanitizePdfText(footerBox.rightLine || '');
                const transportLine = sanitizePdfText(footerBox.transportLine || 'Transport:');

                const footerFontSize = Number.isFinite(footerBox.fontSize) ? footerBox.fontSize : infoFontSize;
                const footerTitleFontSize = Number.isFinite(footerBox.titleFontSize) ? footerBox.titleFontSize : footerFontSize;
                const footerPadX = 6;

                // Box border + internal lines
                s += fmt(gridRgb[0]) + ' ' + fmt(gridRgb[1]) + ' ' + fmt(gridRgb[2]) + ' RG\n' + fmt(outerW) + ' w\n';
                s += fmt(tableX) + ' ' + fmt(boxBottomY) + ' ' + fmt(tableWidth) + ' ' + fmt(boxHeight) + ' re S\n';

                // Horizontal separators
                let yCursor = boxTopY;
                for (let i = 0; i < rowHeights.length - 1; i++) {
                    yCursor -= rowHeights[i];
                    s += fmt(tableX) + ' ' + fmt(yCursor) + ' m ' + fmt(tableX + tableWidth) + ' ' + fmt(yCursor) + ' l S\n';
                }

                // Vertical split (Shift | Meal) for the top 2 rows only (transport spans full width)
                const splitBottomY = boxTopY - rowHeights[0] - rowHeights[1];
                s += fmt(splitX) + ' ' + fmt(splitBottomY) + ' m ' + fmt(splitX) + ' ' + fmt(boxTopY) + ' l S\n';

                // Helper to place centered text in a cell.
                const placeCentered = (text, x0, x1, y0, y1, fontSize, bold) => {
                    const t = sanitizePdfText(text || '');
                    if (!t) return;
                    const approxW = fontSize * 0.55;
                    const maxChars = Math.max(1, Math.floor((x1 - x0 - footerPadX * 2) / approxW));
                    const clipped = truncate(t, maxChars);
                    const textW = clipped.length * approxW;
                    const tx = Math.max(x0 + footerPadX, Math.min(x1 - footerPadX - textW, x0 + (x1 - x0 - textW) / 2));
                    const ty = y0 + Math.max(2, (y1 - y0 - fontSize) / 2) + 2;
                    const font = bold ? 'F2' : 'F1';
                    s += 'BT\n/' + font + ' ' + fmt(fontSize) + ' Tf\n0 0 0 rg\n1 0 0 1 ' + fmt(tx) + ' ' + fmt(ty) + ' Tm\n(' + pdfEscapeText(clipped) + ') Tj\nET\n';
                };

                const placeLeft = (text, x0, x1, y0, fontSize, bold) => {
                    const t = sanitizePdfText(text || '');
                    if (!t) return;
                    const approxW = fontSize * 0.55;
                    const maxChars = Math.max(1, Math.floor((x1 - x0 - footerPadX * 2) / approxW));
                    const clipped = truncate(t, maxChars);
                    const tx = x0 + footerPadX;
                    const ty = y0 + 4;
                    const font = bold ? 'F2' : 'F1';
                    s += 'BT\n/' + font + ' ' + fmt(fontSize) + ' Tf\n0 0 0 rg\n1 0 0 1 ' + fmt(tx) + ' ' + fmt(ty) + ' Tm\n(' + pdfEscapeText(clipped) + ') Tj\nET\n';
                };

                // Row 1: Titles
                const row0Top = boxTopY;
                const row0Bottom = boxTopY - rowHeights[0];
                placeCentered(leftTitle, tableX, splitX, row0Bottom, row0Top, footerTitleFontSize, true);
                placeCentered(rightTitle, splitX, tableX + tableWidth, row0Bottom, row0Top, footerTitleFontSize, true);

                // Row 2: Details
                const row1Top = row0Bottom;
                const row1Bottom = row1Top - rowHeights[1];
                placeLeft(leftLine, tableX, splitX, row1Bottom, footerFontSize, false);
                placeLeft(rightLine, splitX, tableX + tableWidth, row1Bottom, footerFontSize, false);

                // Row 3: Transport (full width)
                const row2Bottom = boxBottomY;
                placeLeft(transportLine, tableX, tableX + tableWidth, row2Bottom, footerFontSize, false);
            }

            // Signature blocks (support 2+ labels; defaults to 2)
            let dashY = Number.isFinite(signatureDashY) ? signatureDashY : adaptiveSignatureHeight * 0.8;
            const isSignatureStatic = signatureStaticPlacement === true;

            // Ensure signatures fit in available space unless a static placement is requested.
            const minSignatureDashY = margin + 16;
            if (isSignatureStatic) {
                dashY = Math.max(minSignatureDashY, dashY);
            } else {
                const maxSignatureDashY = (footerBoxBottomY != null) ? footerBoxBottomY - 20 : tableBottomY - 20;
                dashY = Math.max(minSignatureDashY, Math.min(maxSignatureDashY, dashY));
            }

            const metaY = Math.max(margin + 2, dashY - 18);
            const nameOffset = Number.isFinite(signatureNameOffset) ? signatureNameOffset : 0;
            const nameY = Math.max(margin, metaY - 16 + nameOffset);
            const approverDeptOffset = Number.isFinite(signatureApproverDeptOffset) ? signatureApproverDeptOffset : 12;
            const approverDeptY = String(signatureApproverDepartmentPosition).toLowerCase() === 'below'
                ? Math.max(margin + 2, dashY - approverDeptOffset)
                : metaY;
            const applicantDeptOffset = Number.isFinite(signatureApplicantDeptOffset) ? signatureApplicantDeptOffset : 18;
            const applicantDeptY = Math.max(margin + 2, dashY - applicantDeptOffset);

            const rawLabels = Array.isArray(signatureLabels) ? signatureLabels : [];
            const labels = rawLabels.length
                ? rawLabels.map((t) => sanitizePdfText(t || '')).filter(Boolean)
                : ['Applicant :', 'Approved by :'];

            // If fixed two-column layout is requested, force two blocks with static positions.
            const useFixedSig = signatureFixedTwoColumn === true;
            const sigCount = useFixedSig ? 2 : Math.max(1, labels.length);
            const availableW = pageWidth - margin * 2;
            const gap = useFixedSig
                ? (Number.isFinite(signatureGap) ? signatureGap : 30)
                : (Number.isFinite(signatureGap) ? signatureGap : 20);

            let blockWidth;
            let startX;
            let blockOffsets;

            if (useFixedSig) {
                // Match the provided sample: two wide lines anchored left/right with equal spacing.
                const totalGap = gap;
                const maxBlockWidth = (availableW - totalGap) / 2;
                blockWidth = Number.isFinite(signatureBlockWidth) && signatureBlockWidth > 0
                    ? signatureBlockWidth
                    : maxBlockWidth;
                blockWidth = Math.min(maxBlockWidth, blockWidth);
                if (!Number.isFinite(blockWidth) || blockWidth <= 0) {
                    blockWidth = maxBlockWidth;
                }
                startX = Number.isFinite(signatureStartX) ? signatureStartX : margin;
                blockOffsets = [0, blockWidth + gap];
            } else {
                blockWidth = (availableW - gap * (sigCount - 1)) / sigCount;
                if (!Number.isFinite(blockWidth) || blockWidth <= 0) blockWidth = 120;
                const maxBlockWidth = Math.max(100, Math.min(220, availableW / sigCount - gap));
                blockWidth = Math.min(maxBlockWidth, blockWidth);
                const totalSigW = blockWidth * sigCount + gap * (sigCount - 1);
                startX = margin + Math.max(0, (availableW - totalSigW) / 2);
                const sigOffset = Math.max(0, availableW * 0.04);
                blockOffsets = sigCount === 2 ? [-sigOffset, sigOffset] : new Array(sigCount).fill(0);
            }

            const inlineLineY = Number.isFinite(signatureLineY) ? signatureLineY : null;
            const isInlineLabel = signatureLabelPosition === 'inline' && Number.isFinite(inlineLineY);
            const baseLabelY = isInlineLabel
                ? inlineLineY
                : (signatureLabelPosition === 'below' ? (dashY - 16) : Math.max(margin, dashY - 20));
            const labelY = baseLabelY + (Number(signatureLabelOffset) || 0);
            const labelFontSize = Number.isFinite(signatureLabelFontSize)
                ? signatureLabelFontSize
                : Math.max(7, Math.round(8 * scaleFactor * 10) / 10);
            const approxLabelCharW = Math.max(1, labelFontSize * 0.5);
            const inlineGap = Number.isFinite(signatureInlineGap) ? signatureInlineGap : 6;
            const dashPattern = Array.isArray(signatureDashPattern)
                ? signatureDashPattern.map((n) => Number(n) || 0).filter((n) => n > 0)
                : [6, 3];
            const dashPatternStr = dashPattern.length ? `[${dashPattern.join(' ')}] 0 d\n` : '[] 0 d\n';
            const dashLineWidth = Number.isFinite(signatureDashLineWidth) ? signatureDashLineWidth : 1;
            const inlineLineWidth = Number.isFinite(signatureLineWidth) ? signatureLineWidth : 1;

            const blockXs = [];
            if (isInlineLabel) {
                s += '0 0 0 RG\n' + fmt(inlineLineWidth) + ' w\n[] 0 d\n';
                for (let i = 0; i < sigCount; i++) {
                    const baseX = useFixedSig ? startX : (startX + i * (blockWidth + gap));
                    const blockOffset = blockOffsets[i] || 0;
                    const blockX = baseX + blockOffset;
                    blockXs[i] = blockX;
                    const label = labels[i] || '';

                    const labelX = blockX;
                    if (label) {
                        s += 'BT\n/F1 ' + fmt(labelFontSize) + ' Tf\n0 0 0 rg\n1 0 0 1 ' + fmt(labelX) + ' ' + fmt(labelY) + ' Tm\n(' + pdfEscapeText(label) + ') Tj\nET\n';
                    }

                    const labelWidth = label ? label.length * approxLabelCharW : 0;
                    const minLineWidth = Math.max(12, blockWidth * 0.35);
                    const desiredStart = blockX + labelWidth + inlineGap;
                    const lineStartX = Math.min(blockX + blockWidth - minLineWidth, desiredStart);
                    if (blockX + blockWidth > lineStartX) {
                        s += fmt(lineStartX) + ' ' + fmt(inlineLineY) + ' m ' + fmt(blockX + blockWidth) + ' ' + fmt(inlineLineY) + ' l S\n';
                    }
                }
            } else {
                s += '0 0 0 RG\n' + fmt(dashLineWidth) + ' w\n' + dashPatternStr;
                for (let i = 0; i < sigCount; i++) {
                    const baseX = useFixedSig ? startX : (startX + i * (blockWidth + gap));
                    const blockOffset = blockOffsets[i] || 0;
                    const blockX = baseX + blockOffset;
                    blockXs[i] = blockX;
                    const label = labels[i] || '';

                    let labelX = blockX;
                    if (!useFixedSig) {
                        if (signatureLabelAlign === 'center') {
                            labelX = blockX + Math.max(0, (blockWidth - label.length * approxLabelCharW) / 2);
                        } else if (signatureLabelAlign === 'right') {
                            labelX = blockX + Math.max(0, blockWidth - label.length * approxLabelCharW);
                        }
                    }

                    if (label) {
                        s += 'BT\n/F1 ' + fmt(labelFontSize) + ' Tf\n0 0 0 rg\n1 0 0 1 ' + fmt(labelX) + ' ' + fmt(labelY) + ' Tm\n(' + pdfEscapeText(label) + ') Tj\nET\n';
                    }

                    s += fmt(blockX) + ' ' + fmt(dashY) + ' m ' + fmt(blockX + blockWidth) + ' ' + fmt(dashY) + ' l S\n';
                }
                s += '[] 0 d\n';
            }

            if (isInlineLabel) {
                s += '0 0 0 RG\n' + fmt(dashLineWidth) + ' w\n' + dashPatternStr;
                for (let i = 0; i < sigCount; i++) {
                    const blockX = blockXs[i] ?? startX;
                    s += fmt(blockX) + ' ' + fmt(dashY) + ' m ' + fmt(blockX + blockWidth) + ' ' + fmt(dashY) + ' l S\n';
                }
                s += '[] 0 d\n';
            }

            // Optional signature name rendering (kept for legacy 2-label exports).
            if (showSignatureNames) {
                const nameFontSize = Number.isFinite(signatureNameFontSize) ? signatureNameFontSize : 8;
                const nameAlign = String(signatureNameAlign || 'center').toLowerCase();
                const namePad = Number.isFinite(signatureNamePadding) ? signatureNamePadding : 0;
                const deptText = (showSignatureDepartment && rawDept)
                    ? `( ${sanitizePdfText(rawDept).toUpperCase()} )`
                    : '';
                const approverDeptText = showSignatureDepartment ? '( HEAD OF DEPARTMENT )' : '';
                const applicantName = safeName ? sanitizePdfText(safeName).toUpperCase() : '';
                const approverText = safeApprover ? sanitizePdfText(safeApprover).toUpperCase() : '';

                const firstX = blockXs[0] ?? startX;
                const lastX = blockXs[sigCount - 1] ?? startX;

                const resolveNameX = (text, baseX) => {
                    const raw = sanitizePdfText(text || '');
                    if (!raw) return baseX;
                    const approxWidth = raw.length * (nameFontSize * 0.5);
                    if (nameAlign === 'left') {
                        return baseX + namePad;
                    }
                    if (nameAlign === 'right') {
                        return baseX + Math.max(0, blockWidth - approxWidth - namePad);
                    }
                    return baseX + Math.max(0, (blockWidth - approxWidth) / 2);
                };

                if (deptText) {
                    const deptX = resolveNameX(deptText, firstX);
                    s += 'BT\n/F1 ' + fmt(nameFontSize) + ' Tf\n0 0 0 rg\n1 0 0 1 ' + fmt(deptX) + ' ' + fmt(applicantDeptY) + ' Tm\n(' + pdfEscapeText(deptText) + ') Tj\nET\n';
                }
                if (approverDeptText) {
                    const approverDeptX = resolveNameX(approverDeptText, lastX);
                    s += 'BT\n/F1 ' + fmt(nameFontSize) + ' Tf\n0 0 0 rg\n1 0 0 1 ' + fmt(approverDeptX) + ' ' + fmt(approverDeptY) + ' Tm\n(' + pdfEscapeText(approverDeptText) + ') Tj\nET\n';
                }
                if (applicantName) {
                    const nameX = resolveNameX(applicantName, firstX);
                    s += 'BT\n/F1 ' + fmt(nameFontSize) + ' Tf\n0 0 0 rg\n1 0 0 1 ' + fmt(nameX) + ' ' + fmt(nameY) + ' Tm\n(' + pdfEscapeText(applicantName) + ') Tj\nET\n';
                }

                if (approverText) {
                    const approverNameX = resolveNameX(approverText, lastX);
                    s += 'BT\n/F1 ' + fmt(nameFontSize) + ' Tf\n0 0 0 rg\n1 0 0 1 ' + fmt(approverNameX) + ' ' + fmt(nameY) + ' Tm\n(' + pdfEscapeText(approverText) + ') Tj\nET\n';
                }
            }

            // Optional footer note lines (below signatures)
            if (Array.isArray(footerNoteLines) && footerNoteLines.length) {
                const noteFontSize = Number.isFinite(footerNoteFontSize) ? footerNoteFontSize : 7;
                const noteFont = footerNoteBold ? 'F2' : 'F1';
                const noteX = margin;
                const noteStartY = Number.isFinite(footerNoteStartY) ? footerNoteStartY : 24;
                const noteGap = Number.isFinite(footerNoteGap) ? footerNoteGap : 10;
                for (let i = 0; i < footerNoteLines.length; i++) {
                    const line = sanitizePdfText(footerNoteLines[i] || '');
                    if (!line) continue;
                    const y = noteStartY - i * noteGap;
                    s += 'BT\n/' + noteFont + ' ' + fmt(noteFontSize) + ' Tf\n0 0 0 rg\n1 0 0 1 ' + fmt(noteX) + ' ' + fmt(y) + ' Tm\n(' + pdfEscapeText(line) + ') Tj\nET\n';
                }
            }
        }

        pageStreams.push(encoder.encode(s));
    }

    // Build PDF (uncompressed content streams)
    const chunks = [];
    let offset = 0;
    const addString = (str) => {
        const b = encoder.encode(str);
        chunks.push(b);
        offset += b.length;
    };
    const addBytes = (b) => {
        chunks.push(b);
        offset += b.length;
    };

    let nextObjId = 5;
    const companyImageId = companyLogo && companyLogo.bytes ? nextObjId++ : null;
    const deptImageId = departmentLogo && departmentLogo.bytes ? nextObjId++ : null;
    const firstPageId = nextObjId;
    const firstContentId = firstPageId + pageCount;
    const lastObjId = firstContentId + pageCount - 1;
    const size = lastObjId + 1;
    const offsets = new Array(size).fill(0);

    addString('%PDF-1.3\n');

    // 1: Catalog
    offsets[1] = offset;
    addString('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    // 2: Pages
    offsets[2] = offset;
    const kids = Array.from({ length: pageCount }, (_, i) => `${firstPageId + i} 0 R`).join(' ');
    addString(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n`);

    // 3: Helvetica
    offsets[3] = offset;
    addString('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

    // 4: Helvetica-Bold
    offsets[4] = offset;
    addString('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n');

    // Image XObjects (JPEG)
    if (companyImageId) {
        offsets[companyImageId] = offset;
        addString(`${companyImageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${companyLogo.width} /Height ${companyLogo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${companyLogo.bytes.length} >>\nstream\n`);
        addBytes(companyLogo.bytes);
        addString('\nendstream\nendobj\n');
    }
    if (deptImageId) {
        offsets[deptImageId] = offset;
        addString(`${deptImageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${departmentLogo.width} /Height ${departmentLogo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${departmentLogo.bytes.length} >>\nstream\n`);
        addBytes(departmentLogo.bytes);
        addString('\nendstream\nendobj\n');
    }

    // Page objects
    for (let i = 0; i < pageCount; i++) {
        const pageId = firstPageId + i;
        const contentId = firstContentId + i;
        offsets[pageId] = offset;

        let resources = '/Resources << /Font << /F1 3 0 R /F2 4 0 R >>';
        if (companyImageId || deptImageId) {
            resources += ' /XObject <<';
            if (companyImageId) resources += ` /Im1 ${companyImageId} 0 R`;
            if (deptImageId) resources += ` /Im2 ${deptImageId} 0 R`;
            resources += ' >>';
        }
        resources += ' >>';

        addString(
            `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R ${resources} /MediaBox [0 0 ${fmt(pageWidth)} ${fmt(pageHeight)}] /Contents ${contentId} 0 R >>\nendobj\n`
        );
    }

    // Content streams
    for (let i = 0; i < pageCount; i++) {
        const contentId = firstContentId + i;
        const contentBytes = pageStreams[i];
        offsets[contentId] = offset;
        addString(`${contentId} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
        addBytes(contentBytes);
        addString('\nendstream\nendobj\n');
    }

    // xref
    const xrefOffset = offset;
    addString(`xref\n0 ${size}\n`);
    addString('0000000000 65535 f \n');

    const pad10 = (n) => String(n).padStart(10, '0');
    for (let i = 1; i <= lastObjId; i++) {
        addString(`${pad10(offsets[i])} 00000 n \n`);
    }

    // trailer
    addString('trailer\n');
    addString(`<< /Size ${size} /Root 1 0 R >>\n`);
    addString('startxref\n');
    addString(`${xrefOffset}\n`);
    addString('%%EOF\n');

    // concat
    const out = new Uint8Array(offset);
    let pos = 0;
    for (const c of chunks) {
        out.set(c, pos);
        pos += c.length;
    }
    return out;
}

function createPdfWithJpegPages({ pages, pageWidth }) {
    const encoder = new TextEncoder();
    if (!Array.isArray(pages) || pages.length === 0) {
        throw new Error('No PDF pages provided');
    }

    const fmt = (n) => {
        // Keep it compact (PDF allows decimals)
        const s = Number(n).toFixed(3);
        return s.replace(/\.000$/, '').replace(/(\.\d*?)0+$/, '$1');
    };

    const chunks = [];
    let offset = 0;

    const addString = (s) => {
        const b = encoder.encode(s);
        chunks.push(b);
        offset += b.length;
    };
    const addBytes = (b) => {
        chunks.push(b);
        offset += b.length;
    };

    const pageCount = pages.length;
    const firstPageId = 3;
    const firstImageId = firstPageId + pageCount;
    const firstContentId = firstImageId + pageCount;
    const lastObjId = firstContentId + pageCount - 1;
    const size = lastObjId + 1; // include object 0
    const offsets = new Array(size).fill(0);

    // PDF Header
    addString('%PDF-1.3\n');

    // 1: Catalog
    offsets[1] = offset;
    addString('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    // 2: Pages tree
    offsets[2] = offset;
    const kids = Array.from({ length: pageCount }, (_, i) => `${firstPageId + i} 0 R`).join(' ');
    addString(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n`);

    // Page objects
    for (let i = 0; i < pageCount; i++) {
        const pageId = firstPageId + i;
        const imageId = firstImageId + i;
        const contentId = firstContentId + i;

        const imgW = pages[i].imageWidth;
        const imgH = pages[i].imageHeight;
        const drawH = imgH * (pageWidth / imgW);

        offsets[pageId] = offset;
        addString(
            `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 ${imageId} 0 R >> /ProcSet [/PDF /ImageC] >> /MediaBox [0 0 ${fmt(pageWidth)} ${fmt(drawH)}] /Contents ${contentId} 0 R >>\nendobj\n`
        );
    }

    // Image objects
    for (let i = 0; i < pageCount; i++) {
        const imageId = firstImageId + i;
        const imgW = pages[i].imageWidth;
        const imgH = pages[i].imageHeight;
        const jpegBytes = pages[i].jpegBytes;

        offsets[imageId] = offset;
        addString(
            `${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
        );
        addBytes(jpegBytes);
        addString('\nendstream\nendobj\n');
    }

    // Content streams (draw image)
    for (let i = 0; i < pageCount; i++) {
        const contentId = firstContentId + i;
        const imgW = pages[i].imageWidth;
        const imgH = pages[i].imageHeight;
        const drawH = imgH * (pageWidth / imgW);
        const content = `q\n${fmt(pageWidth)} 0 0 ${fmt(drawH)} 0 0 cm\n/Im0 Do\nQ\n`;
        const contentBytes = encoder.encode(content);

        offsets[contentId] = offset;
        addString(`${contentId} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
        addBytes(contentBytes);
        addString('\nendstream\nendobj\n');
    }

    // xref
    const xrefOffset = offset;
    addString(`xref\n0 ${size}\n`);
    addString('0000000000 65535 f \n');

    const pad10 = (n) => String(n).padStart(10, '0');
    for (let i = 1; i <= lastObjId; i++) {
        addString(`${pad10(offsets[i])} 00000 n \n`);
    }

    // trailer
    addString('trailer\n');
    addString(`<< /Size ${size} /Root 1 0 R >>\n`);
    addString('startxref\n');
    addString(`${xrefOffset}\n`);
    addString('%%EOF\n');

    // concat
    const out = new Uint8Array(offset);
    let pos = 0;
    for (const c of chunks) {
        out.set(c, pos);
        pos += c.length;
    }
    return out;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

// Render Calendar
function renderCalendar(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    // Update month display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthDisplay = document.getElementById('calendarMonth');
    if (monthDisplay) {
        monthDisplay.textContent = monthNames[month] + ' ' + year;
    }
    
    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    // Clear previous calendar
    const calendarDays = document.getElementById('calendarDays');
    if (!calendarDays) return;
    calendarDays.innerHTML = '';
    
    // Add days from previous month
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const dayElement = createDayElement(day, true);
        calendarDays.appendChild(dayElement);
    }
    
    // Add days of current month
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = day === today.getDate() && 
                        month === today.getMonth() && 
                        year === today.getFullYear();
        const dayElement = createDayElement(day, false, isToday);
        calendarDays.appendChild(dayElement);
    }
    
    // Add days from next month
    const totalCells = calendarDays.children.length;
    const remainingCells = 42 - totalCells; // 6 rows x 7 days
    for (let day = 1; day <= remainingCells; day++) {
        const dayElement = createDayElement(day, true);
        calendarDays.appendChild(dayElement);
    }

    // Keep dashboard summary + graph in sync with the calendar month
    if (typeof updateDashboardSummaries === 'function') {
        updateDashboardSummaries(String(month + 1).padStart(2, '0'), String(year));
    }
}

// Create Day Element
function createDayElement(day, isOtherMonth, isToday = false) {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'calendar-day';
    dayDiv.textContent = day;
    
    if (isOtherMonth) {
        dayDiv.classList.add('other-month');
    }
    
    if (isToday) {
        dayDiv.classList.add('today');
    }
    
    return dayDiv;
}

// =============================
// Dashboard Attendance Graph
// =============================

function getDashboardAttendanceCategoryForGraph(row) {
    const shift = String(row?.shift || '');
    const notes = String(row?.notes || '');

    if (shift === 'Leave') {
        if (/^\s*mc\b/i.test(notes)) return 'mc';
        if (/^\s*al\b/i.test(notes)) return 'al';
        if (/^\s*el\b/i.test(notes)) return 'el';
        return null;
    }

    if (/\bhalf\s*day\b/i.test(notes) || /\bhalfday\b/i.test(notes)) return 'halfday';
    if (/\blate\b/i.test(notes)) return 'late';

    return 'present';
}

function buildDashboardMonthlyCategoryCounts(year) {
    const yearNum = parseInt(String(year), 10);
    const emptyMonth = () => ({ present: 0, mc: 0, el: 0, al: 0, late: 0, halfday: 0 });
    const months = Array.from({ length: 12 }, emptyMonth);
    if (!yearNum) return months;

    const rows = (buildAttendanceExportRows() || []);

    rows.forEach(r => {
        const dateStr = String(r?.date || '');
        let recordYear = null;
        let recordMonth = null;

        const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) {
            recordYear = parseInt(m[1], 10);
            recordMonth = parseInt(m[2], 10);
        } else {
            const dt = new Date(dateStr);
            if (!Number.isNaN(dt.getTime())) {
                recordYear = dt.getFullYear();
                recordMonth = dt.getMonth() + 1;
            }
        }

        if (!recordYear || !recordMonth) return;
        if (recordYear !== yearNum) return;
        const monthIdx = recordMonth - 1;
        if (monthIdx < 0 || monthIdx > 11) return;

        const cat = getDashboardAttendanceCategoryForGraph(r);
        if (!cat) return;
        months[monthIdx][cat] += 1;
    });

    return months;
}

function roundUpNiceMax(value) {
    const v = Math.max(0, Number(value) || 0);
    if (v <= 5) return 5;
    if (v <= 10) return 10;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const scaled = v / pow;
    const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
    return step * pow;
}

function buildSmoothSvgPath(points) {
    if (!points || points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    const fmt = (n) => Number(n).toFixed(2);
    const d = [`M ${fmt(points[0].x)} ${fmt(points[0].y)}`];

    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] || points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;

        const c1x = p1.x + (p2.x - p0.x) / 6;
        const c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6;
        const c2y = p2.y - (p3.y - p1.y) / 6;

        d.push(`C ${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2.x)} ${fmt(p2.y)}`);
    }

    return d.join(' ');
}

function renderAttendanceGraph(month, year) {
    const container = document.getElementById('attendanceGraphBars');
    if (!container) return;

    // Year-at-a-glance chart (Jan–Dec). We highlight the selected month from the dashboard dropdown.
    container.innerHTML = '';

    const yearNum = parseInt(String(year), 10);
    const monthNum = parseInt(String(month), 10);
    const selectedMonthIndex = Number.isFinite(monthNum) ? monthNum - 1 : null;

    const months = buildDashboardMonthlyCategoryCounts(yearNum);
    const categories = [
        { key: 'present', label: 'Present' },
        { key: 'mc', label: 'MC' },
        { key: 'el', label: 'EL' },
        { key: 'al', label: 'AL' },
        { key: 'late', label: 'Late' },
        { key: 'halfday', label: 'Halfday' }
    ];

    let maxY = 0;
    let total = 0;
    months.forEach(m => {
        categories.forEach(c => {
            const v = Number(m?.[c.key] || 0);
            maxY = Math.max(maxY, v);
            total += v;
        });
    });

    const niceMaxY = roundUpNiceMax(maxY || 0);

    // SVG layout (viewBox units)
    const W = 720;
    const H = 260;
    const margin = { top: 16, right: 16, bottom: 32, left: 16 };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;
    const stepX = plotW / 11;

    const xAt = (i) => margin.left + stepX * i;
    const yAt = (v) => margin.top + plotH * (1 - (v / niceMaxY));

    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const svgParts = [];
    svgParts.push(`<svg class="attendance-graph-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Attendance line chart">`);

    // Selected-month highlight (behind grid/lines)
    if (selectedMonthIndex != null && selectedMonthIndex >= 0 && selectedMonthIndex <= 11) {
        const center = xAt(selectedMonthIndex);
        const start = Math.max(margin.left, center - stepX / 2);
        const end = Math.min(margin.left + plotW, center + stepX / 2);
        svgParts.push(`<rect class="attendance-chart-highlight" x="${start.toFixed(2)}" y="${margin.top}" width="${(end - start).toFixed(2)}" height="${plotH}" rx="8" />`);
    }

    // Gridlines
    const yGridCount = 4;
    for (let g = 0; g <= yGridCount; g++) {
        const yLine = margin.top + (plotH * g) / yGridCount;
        svgParts.push(`<line class="attendance-chart-grid" x1="${margin.left}" y1="${yLine.toFixed(2)}" x2="${(margin.left + plotW).toFixed(2)}" y2="${yLine.toFixed(2)}" />`);
    }
    for (let i = 0; i < 12; i++) {
        const xLine = xAt(i);
        svgParts.push(`<line class="attendance-chart-grid" x1="${xLine.toFixed(2)}" y1="${margin.top}" x2="${xLine.toFixed(2)}" y2="${(margin.top + plotH).toFixed(2)}" />`);
    }

    // Axis labels (months only; no numeric values)
    for (let i = 0; i < 12; i++) {
        const xLabel = xAt(i);
        svgParts.push(`<text class="attendance-chart-axis-label" x="${xLabel.toFixed(2)}" y="${(H - 10).toFixed(2)}" text-anchor="middle">${monthLabels[i]}</text>`);
    }

    if (!total) {
        const labelYear = yearNum || String(year || '');
        svgParts.push(`<text class="attendance-chart-empty" x="${(W / 2).toFixed(2)}" y="${(margin.top + plotH / 2).toFixed(2)}" text-anchor="middle">No attendance records for ${labelYear}</text>`);
        svgParts.push(`</svg>`);
        container.innerHTML = svgParts.join('');
        return;
    }

    // Lines + points
    categories.forEach(c => {
        const points = months.map((m, i) => ({
            x: xAt(i),
            y: yAt(Number(m?.[c.key] || 0))
        }));

        const d = buildSmoothSvgPath(points);
        svgParts.push(`<path class="attendance-chart-line ${c.key}" d="${d}" />`);

        points.forEach((p) => {
            svgParts.push(`<circle class="attendance-chart-point ${c.key}" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="3.5" />`);
        });
    });

    svgParts.push(`</svg>`);
    container.innerHTML = svgParts.join('');
}

// Initialize calendar on DOMContentLoaded
document.addEventListener('DOMContentLoaded', initializeCalendar);

// Realtime Clock Function
function updateRealtimeClock() {
    const clockDisplay = document.getElementById('realtimeClock');
    const dateDisplay = document.getElementById('realtimeDate');

    if (clockDisplay) {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        clockDisplay.textContent = `${hours}:${minutes}:${seconds}`;
    }

    if (dateDisplay) {
        const now = new Date();
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = days[now.getDay()];
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        dateDisplay.textContent = `${dayName}, ${day}/${month}/${year}`;
    }
}

// Sidebar Toggle
document.addEventListener('DOMContentLoaded', async function() {
    // Ensure the initial app↔DB sync completes before we render attendance-driven UI.
    try {
        await appSyncPromise;
    } catch (e) {
        // If sync fails, continue with local data.
    }

    const sidebarCollapse = document.getElementById('sidebarCollapse');
    const sidebar = document.getElementById('sidebar');

    if (!sidebar) {
        console.error('Sidebar element not found');
        return;
    }

    // Note: the sidebarCollapse click handler is defined in index.html (also manages sidebar footer).

    // Handle sidebar menu item clicks
    const navLinks = sidebar.querySelectorAll('a');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();

            // Get the section to show
            const sectionId = this.id.replace('sidebar', '').toLowerCase() + 'Section';
            const targetSection = document.getElementById(sectionId);

            // Check role-based access control for settings
            if (sectionId === 'settingsSection') {
                const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
                const userRole = currentUser.role;
                const roleAccess = JSON.parse(localStorage.getItem('roleAccess') || '{}');
                const currentRoleAccess = roleAccess[userRole] || {};

                // Block access if role doesn't have Settings Menu permission (Settings Menu controls Settings page access)
                if (currentRoleAccess.settingsMenu !== true) {
                    alert('Access Denied: Your role does not have permission to access the Settings page.');
                    return;
                }
            }

            // Remove active class from all links
            navLinks.forEach(l => l.parentElement.classList.remove('active'));

            // Add active class to clicked link
            this.parentElement.classList.add('active');

            if (targetSection) {
                // Hide all sections
                document.querySelectorAll('.page-section').forEach(section => {
                    section.classList.remove('active');
                });

                // Show target section
                targetSection.classList.add('active');
            }

            // Close sidebar on mobile
            // In this app/CSS, `sidebar.active` means the sidebar is hidden (margin-left:-250px).
            if (window.innerWidth < 768) {
                sidebar.classList.add('active');
            }

            if (typeof window.__updateSidebarFooterVisibility === 'function') {
                window.__updateSidebarFooterVisibility();
            }
        });
    });

    // Handle window resize
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            sidebar.classList.remove('active');
        }

        if (typeof window.__updateSidebarFooterVisibility === 'function') {
            window.__updateSidebarFooterVisibility();
        }
    });

    // Table interactions
    initializeTableFeatures();

    // Dashboard functionality - Initialize FIRST so dropdowns are set up
    initializeDashboard();

    // Migrate legacy global attendance storage into the Master user namespace before reading.
    migrateLegacyAttendanceStorageIfNeeded();

    // Load saved data from localStorage - This will use the dropdown values set by initializeDashboard
    loadSavedAttendanceData();

    // Initialize modals
    initializeModals();

    // Initialize GPS auto check-in (settings + user toggle)
    initializeGpsAutoCheckIn();

    // Initialize documents tabs
    initializeDocumentsTabs();

    // Initialize Reports page (tabs + renderers)
    initializeReportsPage();

    // Initialize language, theme, and logout
    initializeLanguageDropdown();
    initializeThemeToggle();
    initializeLogout();

    // Display profile name
    displayProfileName();

    // Initialize Settings page
    initializeSettingsPage();

    // Load saved preferences
    loadUserPreferences();

    // Initialize default role access control
    initializeDefaultRoleAccess();

    // Apply role-based access control
    applyRoleAccessControl();

    // Reset overnight shift state on page refresh
    sessionStorage.removeItem('overnightShiftState');

    // Reset Overnight Shift draft values on page refresh
    sessionStorage.removeItem('overnightShiftDraftDate');
    sessionStorage.removeItem('overnightShiftDraftCheckInTime');
    sessionStorage.removeItem('overnightShiftDraftCheckOutTime');
    sessionStorage.removeItem('overnightShiftDraftCheckOutDate');
    sessionStorage.removeItem('overnightShiftDraftNotes');
    sessionStorage.removeItem('overnightShiftDraftShiftType');

    // Reset Manual Check-in date and time on page refresh
    // This ensures the date and time fields show current date/time when page is closed or refreshed
    sessionStorage.removeItem('lastManualCheckInDate');
    sessionStorage.removeItem('lastManualCheckInTime');
});

// Table Features Initialization
function initializeTableFeatures() {
    const table = document.querySelector('.table');
    if (!table) return;

    // Add row hover effects
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        row.addEventListener('mouseenter', function() {
            this.classList.add('row-hover');
        });
        row.addEventListener('mouseleave', function() {
            this.classList.remove('row-hover');
        });
    });
}

// Load Saved Attendance Data
// Save Attendance Record
function saveAttendanceRecord(record) {
    const attendancePrefix = getAttendanceRecordKeyPrefix();
    // Check if this is a checkout and we need to update an existing record
    if (record.type === 'checkout') {
        // Find the most recent check-in record without a checkout time
        const allRecords = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(attendancePrefix)) {
                const rec = JSON.parse(localStorage.getItem(key));
                allRecords.push({ key, ...rec });
            }
        }

        // Sort by timestamp (newest first)
        allRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Find the most recent check-in without checkout time
        const checkInRecord = allRecords.find(r => 
            (r.type === 'checkin' || r.type === 'shift_checkin' || r.type === 'manual_checkin') && 
            !r.checkoutTime
        );

        if (checkInRecord) {
            // Update existing record with checkout time
            checkInRecord.checkoutTime = record.time;
            checkInRecord.checkoutDate = record.date;
            localStorage.setItem(checkInRecord.key, JSON.stringify(checkInRecord));

            // Persist notes (if any) to the per-date Notes store for cross-tab sync
            if (checkInRecord.date) {
                setStoredNotesForDate(checkInRecord.date, checkInRecord.notes || '');
            }

            // Reload attendance table to show updated record
            loadSavedAttendanceData();
            
            // Update dashboard summaries automatically (with slight delay to ensure data is processed)
            setTimeout(() => {
                console.log(`[saveAttendanceRecord-checkout] Calling updateDashboardSummaries after loadSavedAttendanceData`);
                updateDashboardSummaries();
            }, 100);

            // Show success message
            showNotification('Check-out time recorded successfully!', 'success');
            return;
        }
    }

    // Generate unique key for the record
    const recordKey = `${attendancePrefix}${Date.now()}`;

    // Save record to localStorage
    localStorage.setItem(recordKey, JSON.stringify(record));

    // Persist notes (if any) to the per-date Notes store for cross-tab sync
    if (record.date) {
        setStoredNotesForDate(record.date, record.notes || '');
    }

    // Reload attendance table to show new record
    loadSavedAttendanceData();

    // Update dashboard summaries automatically (with slight delay to ensure data is processed)
    setTimeout(() => {
        console.log(`[saveAttendanceRecord] Calling updateDashboardSummaries after loadSavedAttendanceData`);
        updateDashboardSummaries();
    }, 100);

    // Show success message
    showNotification('Record saved successfully!', 'success');
}

function loadSavedAttendanceData() {
    const attendancePrefix = getAttendanceRecordKeyPrefix();
    const deletedIds = getDeletedRecordIdSet(attendancePrefix);

    // Get all saved attendance records
    const allRecords = [];
    const keysToPurge = [];
    const otKeysToPurge = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(attendancePrefix)) {
            let record = null;
            try {
                record = JSON.parse(localStorage.getItem(key));
            } catch (e) {
                record = null;
            }
            if (!record) continue;

            const recordId = normalizeDeletedRecordId(record.timestamp);
            const isDeleted = (recordId && deletedIds.has(recordId))
                || deletedIds.has(key)
                || record.isDeleted === true
                || record.deleted === true;
            if (isDeleted) {
                keysToPurge.push(key);
                if (recordId) {
                    otKeysToPurge.push(getOTStorageKey(recordId));
                }
                continue;
            }

            allRecords.push(record);
        }
    }

    // Ensure deleted records are fully removed from storage so they never leak into exports.
    keysToPurge.forEach(k => localStorage.removeItem(k));
    otKeysToPurge.forEach(k => localStorage.removeItem(k));

    // Sort records by timestamp (newest first)
    allRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Cache for re-rendering (e.g., Travel Allowance filters)
    latestAttendanceRecords = allRecords;

    // Display records in table
    displayAttendanceRecords(allRecords);

    // Keep Travel Allowance in sync with Attendance records
    renderTravelAllowanceTable();
    
    // Update the dashboard summary with current month and year
    const summaryMonth = document.getElementById('summaryMonth');
    const summaryYear = document.getElementById('summaryYear');
    if (summaryMonth && summaryYear) {
        calculateMonthlySummary(summaryMonth.value, summaryYear.value);
    }
}

function groupAttendanceRecordsByDate(records) {
    const recordsByDate = {};
    (records || []).forEach(record => {
        const date = normalizeISODate(record.date || '-');
        if (!recordsByDate[date]) {
            recordsByDate[date] = {
                checkInTime: null,
                checkOutTime: null,
                type: record.type,
                leaveType: record.leaveType,
                timestamp: record.timestamp,
                notes: record.notes || '',
                shiftType: record.shiftType || '',
                checkoutDate: normalizeISODate(record.checkoutDate || '')
            };
        }

        // Update check-in time
        if (record.type === 'checkin' || record.type === 'shift_checkin' || record.type === 'manual_checkin') {
            recordsByDate[date].checkInTime = record.time;
            recordsByDate[date].type = record.type;
            recordsByDate[date].timestamp = record.timestamp;
            if (record.notes) {
                recordsByDate[date].notes = record.notes;
            }
            if (record.shiftType) {
                recordsByDate[date].shiftType = record.shiftType;
            }
        }

        // Update check-out time
        if (record.checkoutTime) {
            recordsByDate[date].checkOutTime = record.checkoutTime;
            if (record.checkoutDate) {
                recordsByDate[date].checkoutDate = normalizeISODate(record.checkoutDate);
            }
            if (record.notes) {
                recordsByDate[date].notes = record.notes;
            }
            if (record.shiftType) {
                recordsByDate[date].shiftType = record.shiftType;
            }
        }

        // For leave records
        if (record.type === 'leave') {
            recordsByDate[date].type = 'leave';
            recordsByDate[date].leaveType = record.leaveType;
            recordsByDate[date].timestamp = record.timestamp;
            if (record.notes) {
                recordsByDate[date].notes = record.notes;
            }
            if (record.shiftType) {
                recordsByDate[date].shiftType = record.shiftType;
            }
        }
    });
    return recordsByDate;
}

// Display Attendance Records in Table
function displayAttendanceRecords(records) {
    const attendanceTable = document.getElementById('attendanceTable');
    const tbody = attendanceTable ? attendanceTable.querySelector('tbody') : null;
    if (!tbody) return;

    tbody.innerHTML = '';

    // Filter records by selected month/year from the dateSelect dropdown
    const dateSelect = document.getElementById('dateSelect');
    const viewTypeSelect = document.getElementById('viewType');
    const now = new Date();
    const currentYear = now.getFullYear();
    
    let filteredRecords = records;
    
    if (dateSelect && viewTypeSelect) {
        const viewType = viewTypeSelect.value || 'monthly';
        const selectedValue = dateSelect.value;
        
        if (viewType === 'monthly') {
            const monthMap = {
                'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
                'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
                'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
            };
            const selectedMonth = monthMap[selectedValue];
            const ymPrefix = `${currentYear}-${selectedMonth}`;
            
            filteredRecords = (records || []).filter(r => {
                const date = normalizeISODate(r.date || '');
                if (!date) return false;
                // For overnight shifts, check both check-in and checkout dates
                if (date.startsWith(ymPrefix)) return true;
                const checkoutDate = normalizeISODate(r.checkoutDate || '');
                return checkoutDate && checkoutDate.startsWith(ymPrefix);
            });
        } else if (viewType === 'yearly') {
            const yPrefix = `${selectedValue}-`;
            filteredRecords = (records || []).filter(r => {
                const date = normalizeISODate(r.date || '');
                if (!date) return false;
                // For overnight shifts, check both check-in and checkout dates
                if (date.startsWith(yPrefix)) return true;
                const checkoutDate = normalizeISODate(r.checkoutDate || '');
                return checkoutDate && checkoutDate.startsWith(yPrefix);
            });
        }
    }

    // Group records by date to show check-in and check-out in same row
    const recordsByDate = groupAttendanceRecordsByDate(filteredRecords);

    // For Overnight Shift (type=shift_checkin), we want:
    // - On check-in: show the check-in date (record.date)
    // - On check-out: show the checkout date (record.checkoutDate)
    const getDisplayDateForAttendanceRow = (groupDate, groupedRecord) => {
        if (!groupedRecord) return groupDate;
        const isOvernightShift = groupedRecord.type === 'shift_checkin';
        const hasCheckout = Boolean(groupedRecord.checkOutTime);
        const checkoutDate = String(groupedRecord.checkoutDate || '').trim();

        if (isOvernightShift && hasCheckout && checkoutDate) {
            return checkoutDate;
        }
        return groupDate;
    };

    // Display each date's record in a single row
    // Sort dates in descending order (latest first, earliest at bottom)
    const sortedDates = Object.keys(recordsByDate).sort((a, b) => {
        const dateA = getDisplayDateForAttendanceRow(a, recordsByDate[a]);
        const dateB = getDisplayDateForAttendanceRow(b, recordsByDate[b]);
        return new Date(dateB) - new Date(dateA);  // Latest dates first
    });

    sortedDates.forEach(date => {
        const record = recordsByDate[date];
        const displayDate = getDisplayDateForAttendanceRow(date, record);
        const row = document.createElement('tr');

        // Format record type for display
        let typeDisplay = '-';
        if (record.type === 'checkin') {
            typeDisplay = 'Check-In';
        } else if (record.type === 'manual_checkin') {
            typeDisplay = 'Manual Check-In';
        } else if (record.type === 'shift_checkin') {
            typeDisplay = 'Shift Check-In';
        } else if (record.type === 'leave') {
            typeDisplay = 'Leave';
        }

        // Notes are primarily stored against the check-in date key. After checkout, the row may display
        // the checkout date, so we also check for notes stored under that date as a fallback.
        const storedNotesPrimary = getStoredNotesForDate(date);
        const storedNotesSecondary = displayDate !== date ? getStoredNotesForDate(displayDate) : '';
        const effectiveNotes = (storedNotesPrimary && storedNotesPrimary.trim() !== '')
            ? storedNotesPrimary
            : ((storedNotesSecondary && storedNotesSecondary.trim() !== '') ? storedNotesSecondary : (record.notes || ''));

        // Format notes for display
        let notesDisplay = effectiveNotes ? effectiveNotes : '-';

        // For leave records, show leave type in Notes column with optional notes
        if (record.type === 'leave') {
            const leaveTypeMap = {
                'medical': 'MC',
                'annual': 'AL',
                'emergency': 'EL',
                'compassionate': 'CL',
                'public': 'PH'
            };
            const leaveTypeDisplay = leaveTypeMap[record.leaveType] || record.leaveType || 'N/A';
            if (effectiveNotes) {
                notesDisplay = `${leaveTypeDisplay} (${effectiveNotes})`;
            } else {
                notesDisplay = leaveTypeDisplay;
            }
        }

        const hasAnyTime = Boolean(record.checkInTime || record.checkOutTime);
        if (!hasAnyTime && record.type !== 'leave' && /^(LATE|HALFDAY)(\b|\s|\(|$)/i.test(notesDisplay)) {
            notesDisplay = '-';
        }

        // Display shift type based on record type
        let shiftDisplay = 'Normal';
        if (record.type === 'shift_checkin') {
            shiftDisplay = 'Shift B';  // Overnight shifts always show as Shift B
        } else if (record.type === 'leave') {
            shiftDisplay = 'Leave';  // Leave records always show as Leave
        } else if (record.shiftType && record.shiftType !== 'Normal') {
            shiftDisplay = `Shift ${record.shiftType}`;
        }

        // Calculate duration from check-in and check-out
        let duration = '-';
        if (record.checkInTime && record.checkOutTime) {
            const checkInParts = record.checkInTime.split(':');
            const checkOutParts = record.checkOutTime.split(':');

            const checkInDate = new Date();
            checkInDate.setHours(parseInt(checkInParts[0]), parseInt(checkInParts[1]), 0);

            const checkOutDate = new Date();
            checkOutDate.setHours(parseInt(checkOutParts[0]), parseInt(checkOutParts[1]), 0);

            // If check-out is earlier than check-in, it's overnight
            if (checkOutDate < checkInDate) {
                checkOutDate.setDate(checkOutDate.getDate() + 1);
            }

            const diffMs = checkOutDate - checkInDate;
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

            duration = `${diffHours}h ${diffMinutes}m`;
        }

        // Retrieve OT data if it exists
        const otData = JSON.parse(localStorage.getItem(getOTStorageKey(record.timestamp)) || 'null');
        
        // Calculate auto-detected OT rate based on date and notes
        // Use the displayed date for OT rate detection so overnight shifts follow the date shown in the list.
        const autoRate = getOTRateForDate(displayDate, effectiveNotes);
        
        let otStartDisplay = '-';
        let otEndDisplay = '-';
        let otDurationDisplay = '-';
        let otRateDisplay = '-';
        let otPayDisplay = '-';
        
        // Hide OT fields for Leave records
        if (record.type === 'leave') {
            // For Leave records, don't show OT data
            otRateDisplay = '-';
        } else if (otData) {
            otStartDisplay = otData.otStartTime || '-';
            otEndDisplay = record.checkOutTime || '-';
            
            // Calculate OT duration if both start and end times exist
            if (otData.otStartTime && record.checkOutTime) {
                const otStartParts = otData.otStartTime.split(':');
                const otEndParts = record.checkOutTime.split(':');
                
                const otStartDate = new Date();
                otStartDate.setHours(parseInt(otStartParts[0]), parseInt(otStartParts[1]), 0);
                
                const otEndDate = new Date();
                otEndDate.setHours(parseInt(otEndParts[0]), parseInt(otEndParts[1]), 0);
                
                // If end is earlier than start, it's overnight
                if (otEndDate < otStartDate) {
                    otEndDate.setDate(otEndDate.getDate() + 1);
                }
                
                const otDiffMs = otEndDate - otStartDate;
                const otDiffHours = otDiffMs / (1000 * 60 * 60);
                
                // Apply rounding to nearest 30 minutes
                const roundedOTHours = roundOTDuration(otDiffHours);
                
                // Convert rounded hours to display format
                const hours = Math.floor(roundedOTHours);
                const minutes = Math.round((roundedOTHours - hours) * 60);
                otDurationDisplay = `${hours}h ${minutes}m`;
            }
            
            // Use saved rate if exists, otherwise use auto-detected rate
            otRateDisplay = otData.otRate ? `${otData.otRate}×` : `${autoRate}×`;
            otPayDisplay = otData.otPayAmount ? `RM ${parseFloat(otData.otPayAmount).toFixed(2)}` : '-';
        } else {
            // No saved OT data, but show auto-detected rate
            otRateDisplay = `${autoRate}×`;
        }
        
        row.innerHTML = `
            <td>${displayDate}</td>
            <td>${record.checkInTime || '-'}</td>
            <td>${record.checkOutTime || '-'}</td>
            <td>${duration}</td>
            <td>${otStartDisplay}</td>
            <td>${otEndDisplay}</td>
            <td>${otDurationDisplay}</td>
            <td>${otRateDisplay}</td>
            <td>${otPayDisplay}</td>
            <td>${shiftDisplay}</td>
            <td>${notesDisplay}</td>
            <td>
                <button class="btn btn-sm btn-edit" onclick="editRecord('${record.timestamp}')" title="Edit OT">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-delete" onclick="deleteRecord('${record.timestamp}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function parseLocalDateFromISO(dateString) {
    if (!dateString || typeof dateString !== 'string' || !dateString.includes('-')) return null;
    const parts = dateString.split('-');
    if (parts.length !== 3) return null;
    const [year, month, day] = parts;
    const y = parseInt(year, 10);
    const m = parseInt(String(month).padStart(2, '0'), 10);
    const d = parseInt(String(day).padStart(2, '0'), 10);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}

function getDayNameShort(dateString) {
    const date = parseLocalDateFromISO(dateString);
    if (!date) return '-';
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
}

function getLeaveTypeCode(leaveType) {
    const leaveTypeMap = {
        medical: 'MC',
        annual: 'AL',
        emergency: 'EL',
        compassionate: 'CL',
        public: 'PH'
    };
    return leaveTypeMap[leaveType] || leaveType || 'N/A';
}

function shouldZeroTravelAllowance(dateString, notes, recordType) {
    const date = parseLocalDateFromISO(dateString);
    const day = date ? date.getDay() : null;
    const isWeekend = day === 0 || day === 6;
    if (isWeekend) return true;
    if (recordType === 'leave') return true;

    const normalizedNotes = String(notes || '').trim().toUpperCase();
    if (!normalizedNotes) return false;
    return /^(LATE|HALFDAY|MC|EL|AL|PH|CL)(\b|\s|\(|$)/.test(normalizedNotes);
}

function getTravelFilterValues() {
    const periodEl = document.getElementById('travelPeriodType');
    const monthEl = document.getElementById('travelMonth');
    const yearEl = document.getElementById('travelYear');
    const now = new Date();
    const defaultMonth = String(now.getMonth() + 1).padStart(2, '0');
    const defaultYear = String(now.getFullYear());
    const periodType = periodEl && periodEl.value ? periodEl.value : 'monthly';
    const month = monthEl && monthEl.value ? monthEl.value : defaultMonth;
    const year = yearEl && yearEl.value ? yearEl.value : defaultYear;
    return { periodType, month, year };
}

function filterTravelRecords(records, { periodType, month, year }) {
    const ymPrefix = `${year}-${String(month).padStart(2, '0')}`;
    const yPrefix = `${year}-`;
    return (records || []).filter(r => {
        if (!r || !r.date) return false;
        const date = normalizeISODate(r.date);
        if (!date) return false;
        if (periodType === 'yearly') return date.startsWith(yPrefix);
        return date.startsWith(ymPrefix);
    });
}

function renderTravelAllowanceTable(records) {
    const table = document.getElementById('travelAllowanceTable');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const sourceRecords = Array.isArray(records) ? records : latestAttendanceRecords;
    const { periodType, month, year } = getTravelFilterValues();
    const filteredRecords = filterTravelRecords(sourceRecords, { periodType, month, year });

    tbody.innerHTML = '';

    const recordsByDate = groupAttendanceRecordsByDate(filteredRecords);
    const sortedDates = Object.keys(recordsByDate).sort((a, b) => new Date(b) - new Date(a));

    sortedDates.forEach(date => {
        const record = recordsByDate[date];
        const storedNotes = getStoredNotesForDate(date);
        const effectiveNotes = (storedNotes && storedNotes.trim() !== '') ? storedNotes : (record.notes || '');

        const allowance = shouldZeroTravelAllowance(date, effectiveNotes, record.type) ? 0 : 7;
        const allowanceDisplay = `RM ${allowance.toFixed(2)}`;

        const escapedNotes = String(effectiveNotes || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const inputHtml = `
            <input
                type="text"
                class="form-control travel-notes-input"
                data-date="${date}"
                value="${escapedNotes}"
                placeholder="-"
            />
        `;

        const leaveCode = record.type === 'leave' ? getLeaveTypeCode(record.leaveType) : '';
        const leaveCodeHtml = leaveCode ? `<span class="travel-leave-code">${leaveCode}</span>` : '';
        const notesBoxClass = leaveCode ? 'travel-notes-box has-leave-code' : 'travel-notes-box';

        // Keep the original input size, but place the leave code inside the input box as a prefix.
        let notesCellHtml = `
            <div class="${notesBoxClass}">
                ${leaveCodeHtml}
                ${inputHtml}
            </div>
        `;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${date}</td>
            <td>${getDayNameShort(date)}</td>
            <td>${record.checkInTime || '-'}</td>
            <td>${record.checkOutTime || '-'}</td>
            <td style="text-align:center; font-weight:600;">${allowanceDisplay}</td>
            <td>${notesCellHtml}</td>
        `;
        tbody.appendChild(row);
    });
}

function initializeTravelAllowanceNotesSync() {
    const table = document.getElementById('travelAllowanceTable');
    if (!table) return;

    // Enter should commit the edit.
    table.addEventListener('keydown', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        if (!target.classList.contains('travel-notes-input')) return;
        if (e.key === 'Enter') {
            e.preventDefault();
            target.blur();
        }
    });

    // Save on blur (use capture so it triggers even when DOM updates later).
    table.addEventListener('blur', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (!target.classList.contains('travel-notes-input')) return;

        const date = target.dataset.date;
        if (!date) return;

        const newNotes = String(target.value || '').trim();
        setStoredNotesForDate(date, newNotes);

        // Re-render both Attendance + Travel to reflect updated notes/allowance.
        loadSavedAttendanceData();
        showNotification('Notes updated successfully!', 'success');
    }, true);
}

document.addEventListener('DOMContentLoaded', function() {
    initializeTravelAllowanceNotesSync();
    initializeTravelAllowanceFilters();
});

// Edit Record
function editRecord(timestamp) {
    const attendancePrefix = getAttendanceRecordKeyPrefix();
    // Find the record with this timestamp
    const allRecords = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(attendancePrefix)) {
            const record = JSON.parse(localStorage.getItem(key));
            if (record.timestamp === timestamp) {
                // Load notes from localStorage if they exist
                const notesKey = getNotesStorageKey(record.date);
                let notesFromStorage = localStorage.getItem(notesKey);
                
                // Backward-compat: try legacy keys (pre per-user namespacing)
                if (!notesFromStorage) {
                    const normalized = normalizeDateKey(record.date);
                    const legacyKey1 = `notes-${record.date}`;
                    const legacyKey2 = `notes-${normalized}`;
                    notesFromStorage = localStorage.getItem(legacyKey1) || localStorage.getItem(legacyKey2);
                }
                
                if (notesFromStorage) {
                    record.notes = notesFromStorage;
                }
                allRecords.push({key, ...record});
            }
        }
    }

    if (allRecords.length === 0) {
        alert('Record not found');
        return;
    }

    const record = allRecords[0];
    openEditOTModal(record);
}

// Helper function to detect if a date is a public holiday from notes
function isPublicHoliday(notes) {
    if (!notes) {
        return false;
    }
    const notesLower = notes.toLowerCase().trim();
    // Check for various public holiday patterns
    const startsWithPh = notesLower.startsWith('ph');
    const startsWithPublicHoliday = notesLower.startsWith('public holiday');
    const includesPh = notesLower.includes('ph');
    const includesPublicHoliday = notesLower.includes('public holiday');
    const matchesPhWithParen = notesLower.match(/^ph\s*\([^)]*\)/);
    const matchesPublicHolidayWithParen = notesLower.match(/^public holiday\s*\([^)]*\)/);
    const matchesPhWord = notesLower.match(/\bph\b/);
    const matchesPublicHolidayWord = notesLower.match(/\bpublic holiday\b/);
    
    return startsWithPh || 
           startsWithPublicHoliday ||
           includesPh || 
           includesPublicHoliday ||
           !!matchesPhWithParen || 
           !!matchesPublicHolidayWithParen ||
           !!matchesPhWord ||
           !!matchesPublicHolidayWord;
}

// Helper function to get OT rate based on day of week and holiday status
function getOTRateForDate(dateString, notes) {
    console.log(`[getOTRateForDate] ENTRY - dateString: "${dateString}", notes: "${notes}"`);
    
    // Handle unpadded date format (2026-1-1) by converting to proper ISO format (2026-01-01)
    let formattedDate = dateString;
    if (dateString && dateString.includes('-')) {
        const parts = dateString.split('-');
        if (parts.length === 3) {
            const [year, month, day] = parts;
            formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
    }
    console.log(`[getOTRateForDate] Formatted date: "${formattedDate}"`);
    
    // If no notes provided, try to get from localStorage
    if (!notes || notes.trim() === '') {
        const scopedKey1 = getNotesStorageKey(formattedDate);
        const scopedKey2 = getNotesStorageKey(dateString);
        const legacyKey1 = `notes-${formattedDate}`;
        const legacyKey2 = `notes-${dateString}`;
        const fromStorage = localStorage.getItem(scopedKey1) || localStorage.getItem(scopedKey2) || localStorage.getItem(legacyKey1) || localStorage.getItem(legacyKey2) || '';
        console.log(`[getOTRateForDate] No notes passed, retrieved from storage [${scopedKey1}/${scopedKey2}]: "${fromStorage}"`);
        notes = fromStorage;
    }
    
    // Parse date manually to avoid timezone issues
    const parts = formattedDate.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    
    // Create date in local timezone
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];

    console.log(`[getOTRateForDate] Parsed - Year: ${year}, Month: ${month}, Day: ${day}`);
    console.log(`[getOTRateForDate] Day of week: ${dayOfWeek} (${dayName})`);
    console.log(`[getOTRateForDate] Final notes to check: "${notes}"`);

    // Check if it's a public holiday (highest priority)
    const isHolidayResult = isPublicHoliday(notes);
    console.log(`[getOTRateForDate] isPublicHoliday result: ${isHolidayResult}`);
    if (isHolidayResult) {
        console.log(`[getOTRateForDate] EXIT - Returning 3.0 (Public Holiday detected)`);
        return 3.0; // Public Holiday: 3.0×
    }

    // Sunday is 0
    if (dayOfWeek === 0) {
        console.log(`[getOTRateForDate] EXIT - Returning 2.0 (Sunday detected)`);
        return 2.0; // Sunday: 2.0×
    }

    // Monday-Saturday: 1.5×
    console.log(`[getOTRateForDate] EXIT - Returning 1.5 (Weekday default)`);
    return 1.5;
}

// Helper function to get day name
function getDayName(dateString) {
    // Handle unpadded date format (2026-1-1) by converting to proper ISO format (2026-01-01)
    let formattedDate = dateString;
    if (dateString && dateString.includes('-')) {
        const parts = dateString.split('-');
        if (parts.length === 3) {
            const [year, month, day] = parts;
            formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
    }
    
    // Parse date manually to avoid timezone issues
    const parts = formattedDate.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    
    // Create date in local timezone
    const date = new Date(year, month - 1, day);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
}

// Open Edit OT Modal
function openEditOTModal(record) {
    // Prevent opening OT modal for Leave records
    if (record.type === 'leave') {
        alert('OT Rate cannot be edited for Leave records.');
        return;
    }

    const modal = document.getElementById('editOTModal');
    if (!modal) {
        console.error('Edit OT modal not found');
        return;
    }

    // Get user's basic salary from current session (synced from profile)
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    const basicSalary = currentUser.basicSalary || 0;

    // Populate form fields
    const otDate = document.getElementById('otDate');
    const otCheckOut = document.getElementById('otCheckOut');
    const otStartTime = document.getElementById('otStartTime');
    const otBasicSalary = document.getElementById('otBasicSalary');
    const otRate = document.getElementById('otRate');
    const otRateNote = document.getElementById('otRateNote');
    const otHours = document.getElementById('otHours');
    const otPayAmount = document.getElementById('otPayAmount');

    if (otDate) {
        otDate.value = `${record.date} (${getDayName(record.date)})`;
    }

    if (otCheckOut) {
        otCheckOut.value = record.checkoutTime || record.time || '-';
    }

    if (otBasicSalary) {
        otBasicSalary.value = basicSalary;
    }

    // Set OT rate based on date - always auto-detect
    console.log(`[openEditOTModal] Record object:`, record);
    console.log(`[openEditOTModal] Record date: ${record.date}, notes: "${record.notes}"`);
    
    let notesToUse = record.notes;
    if (!notesToUse) {
        const notesKey = getNotesStorageKey(record.date);
        const storedNotes = localStorage.getItem(notesKey);
        console.log(`[openEditOTModal] No notes in record, checking localStorage key "${notesKey}": "${storedNotes}"`);
        notesToUse = storedNotes || '';
    } else {
        console.log(`[openEditOTModal] Notes found in record: "${notesToUse}"`);
    }
    
    console.log(`[openEditOTModal] Calling getOTRateForDate with date: "${record.date}", notes: "${notesToUse}"`);
    const autoRate = getOTRateForDate(record.date, notesToUse);
    console.log(`[openEditOTModal] Auto-detected rate: ${autoRate}`);
    
    let rateLabel = '';
    if (autoRate === 3.0) {
        rateLabel = ' (Public Holiday - Auto-detected)';
    } else if (autoRate === 2.0) {
        rateLabel = ' (Sunday - Auto-detected)';
    } else {
        rateLabel = ' (Weekday - Auto-detected)';
    }

    console.log(`[openEditOTModal] Setting otRate dropdown value to: "${autoRate.toFixed(1)}"`);
    console.log(`[openEditOTModal] otRate element found: ${!!otRate}, otRate.value before: "${otRate?.value}"`);
    
    if (otRate) {
        // Convert to string to match option values (use toFixed to preserve decimal)
        const rateValue = autoRate.toFixed(1);
        
        // Check if this rate option exists in the dropdown
        const optionExists = Array.from(otRate.options).some(option => option.value === rateValue);
        
        if (optionExists) {
            otRate.value = rateValue;
            console.log(`[openEditOTModal] Set otRate.value to: "${rateValue}" (option exists)`);
        } else {
            console.log(`[openEditOTModal] Rate option "${rateValue}" not found in dropdown`);
            // Default to 1.5x if the calculated rate is not in the dropdown
            otRate.value = "1.5";
        }
        
        otRate.dataset.recordTimestamp = record.timestamp;
        otRate.dataset.autoRate = autoRate; // Store the auto-detected rate
        console.log(`[openEditOTModal] Final otRate.value: "${otRate.value}"`);
    } else {
        console.log(`[openEditOTModal] ERROR: otRate element not found!`);
    }

    // Load previously saved OT data if it exists
    const savedOTData = JSON.parse(localStorage.getItem(getOTStorageKey(record.timestamp)) || localStorage.getItem(`ot_${record.timestamp}`) || 'null');

    // Load saved rate if it exists, otherwise use auto-detected
    if (otRate && savedOTData && savedOTData.otRate) {
        // Only use saved rate if it's different from auto-detected rate
        if (parseFloat(savedOTData.otRate).toFixed(1) !== autoRate.toFixed(1)) {
            otRate.value = parseFloat(savedOTData.otRate).toFixed(1); // Convert to string to match option value
            if (otRateNote) {
                otRateNote.textContent = `Saved rate: ${savedOTData.otRate}×`;
            }
        } else {
            // Saved rate matches auto-detected rate, show auto-detected message
            if (otRateNote) {
                otRateNote.textContent = `Suggested: ${autoRate}×${rateLabel}`;
            }
        }
    } else if (otRateNote) {
        // Show auto-detected rate message
        otRateNote.textContent = `Suggested: ${autoRate}×${rateLabel}`;
    }

    if (otStartTime) {
        if (savedOTData && savedOTData.otStartTime) {
            otStartTime.value = savedOTData.otStartTime;
        } else {
            otStartTime.value = '';
        }
    }

    if (otHours) {
        if (savedOTData && savedOTData.otHours) {
            otHours.value = savedOTData.otHours;
        } else {
            otHours.value = '';
        }
    }

    if (otPayAmount) {
        const savedHours = savedOTData && savedOTData.otHours != null ? parseFloat(savedOTData.otHours) : 0;
        if (savedOTData && savedOTData.otPayAmount && savedHours > 0) {
            otPayAmount.value = parseFloat(savedOTData.otPayAmount).toFixed(2);
        } else {
            otPayAmount.value = '';
        }
    }

    // Auto-calculate OT hours and pay if OT start time exists
    if (otStartTime && otStartTime.value) {
        calculateOTHours();
    }

    // Show modal
    modal.style.display = 'block';
}

// Round OT Duration to nearest 30 minutes
// Logic: if minutes >= 30, keep :30. If minutes < 30, round to :00
// Examples: 1:31 → 1:30, 1:29 → 1:00, 2:59 → 2:30, 2:05 → 2:00
function roundOTDuration(totalHours) {
    const hours = Math.floor(totalHours);
    const minutes = Math.round((totalHours - hours) * 60);
    
    console.log(`[roundOTDuration] Input: ${totalHours.toFixed(2)} hours (${hours}h ${minutes}m)`);
    
    // If minutes >= 30, keep the 30 minutes. If minutes < 30, round down to 0 minutes
    if (minutes >= 30) {
        const rounded = hours + 0.5;
        console.log(`[roundOTDuration] Minutes ${minutes} >= 30, rounding to ${rounded.toFixed(2)} (${hours}h 30m)`);
        return rounded;
    } else {
        console.log(`[roundOTDuration] Minutes ${minutes} < 30, rounding to ${hours.toFixed(2)} (${hours}h 0m)`);
        return hours;
    }
}

// Calculate OT Hours based on start time and checkout time
function calculateOTHours() {
    const otCheckOut = document.getElementById('otCheckOut');
    const otStartTime = document.getElementById('otStartTime');
    const otHours = document.getElementById('otHours');

    if (!otCheckOut || !otStartTime || !otHours) return;

    const checkOutText = otCheckOut.value;
    const startTime = otStartTime.value;

    if (!checkOutText || !startTime) return;

    // Parse checkout time (format: HH:MM)
    const checkOutParts = checkOutText.split(':');
    if (checkOutParts.length < 2) return;

    const checkOutHours = parseInt(checkOutParts[0]);
    const checkOutMinutes = parseInt(checkOutParts[1]);

    // Parse start time (format: HH:MM from input)
    const startParts = startTime.split(':');
    const startHours = parseInt(startParts[0]);
    const startMinutes = parseInt(startParts[1]);

    // Calculate duration
    const startDate = new Date();
    startDate.setHours(startHours, startMinutes, 0);

    const checkOutDate = new Date();
    checkOutDate.setHours(checkOutHours, checkOutMinutes, 0);

    // If checkout is earlier than start (overnight OT), add one day
    if (checkOutDate < startDate) {
        checkOutDate.setDate(checkOutDate.getDate() + 1);
    }

    const diffMs = checkOutDate - startDate;
    const hours = diffMs / (1000 * 60 * 60);
    
    // Apply rounding to nearest 30 minutes
    const roundedHours = roundOTDuration(hours);

    if (otHours) {
        otHours.value = roundedHours.toFixed(2);
        // Recalculate OT pay when hours change
        calculateOTPay();
    }
}

// Calculate OT Pay
function calculateOTPay() {
    const basicSalary = parseFloat(document.getElementById('otBasicSalary').value) || 0;
    const otHours = parseFloat(document.getElementById('otHours').value) || 0;
    const otRate = parseFloat(document.getElementById('otRate').value) || 0;
    const otPayAmount = document.getElementById('otPayAmount');

    if (!otPayAmount) return;

    if (!otHours) {
        otPayAmount.value = '';
        return;
    }

    if (basicSalary && otRate) {
        // Formula: (Basic Salary / 195) × OT Hours × OT Rate
        const otPay = (basicSalary / 195) * otHours * otRate;
        otPayAmount.value = otPay.toFixed(2);
    }
}

// Delete Record
function deleteRecord(timestamp) {
    const recordId = normalizeDeletedRecordId(timestamp);
    if (!recordId) {
        alert('Unable to delete: missing record identifier.');
        return;
    }

    if (confirm('Are you sure you want to delete this record?')) {
        // Add to deleted records list (normalized + de-duped)
        const deletedKey = getDeletedRecordsStorageKey();
        let deletedRecordsRaw = [];
        try {
            deletedRecordsRaw = JSON.parse(localStorage.getItem(deletedKey) || '[]');
        } catch (e) {
            deletedRecordsRaw = [];
        }
        const deletedRecords = Array.isArray(deletedRecordsRaw)
            ? deletedRecordsRaw.map(normalizeDeletedRecordId).filter(Boolean)
            : [];
        if (!deletedRecords.includes(recordId)) {
            deletedRecords.push(recordId);
        }
        localStorage.setItem(deletedKey, JSON.stringify(deletedRecords));

        // Fully remove the underlying record from storage so it cannot appear in exports.
        const attendancePrefix = getAttendanceRecordKeyPrefix();
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(attendancePrefix)) continue;
            try {
                const record = JSON.parse(localStorage.getItem(key));
                const ts = normalizeDeletedRecordId(record && record.timestamp);
                if (ts === recordId) {
                    keysToRemove.push(key);
                }
            } catch (e) {
                // ignore
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));

        // Remove OT data for this record (if any)
        try {
            localStorage.removeItem(getOTStorageKey(recordId));
        } catch (e) {
            // ignore
        }

        // Reload records without resetting overnight shift state
        loadSavedAttendanceData();

        // Refresh OT tables
        refreshOtTables();
        
        // Update dashboard summaries automatically (with slight delay to ensure data is processed)
        setTimeout(() => {
            console.log(`[deleteRecord] Calling updateDashboardSummaries after loadSavedAttendanceData`);
            updateDashboardSummaries();
        }, 100);
    }
}

// Show Notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // Add to page
    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Compute Monthly Summary Counts (pure: no DOM updates)
function getMonthlySummaryCounts(month, year) {
    // Force ensure month/year are strings with proper padding
    month = String(month).padStart(2, '0');
    year = String(year);

    // Initialize counters
    let presentCount = 0;
    let mcCount = 0;
    let elCount = 0;
    let alCount = 0;
    let lateCount = 0;

    // Get all attendance records
    const attendancePrefix = getAttendanceRecordKeyPrefix();
    const deletedRecords = JSON.parse(localStorage.getItem(getDeletedRecordsStorageKey()) || '[]');
    const allRecords = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(attendancePrefix)) {
            const record = JSON.parse(localStorage.getItem(key));
            // Skip deleted records
            if (!deletedRecords.includes(record.timestamp)) {
                allRecords.push(record);
            }
        }
    }

    // Filter records for the selected month and year
    const filteredRecords = allRecords.filter(record => {
        if (!record.date) return false;
        const recordDate = new Date(record.date);
        const recordMonth = String(recordDate.getMonth() + 1).padStart(2, '0');
        const recordYear = recordDate.getFullYear().toString();
        return recordMonth === month && recordYear === year;
    });

    // Group records by date
    const recordsByDate = {};
    filteredRecords.forEach(record => {
        const date = record.date || '-';
        if (!recordsByDate[date]) {
            recordsByDate[date] = {
                type: null, // Will be set based on actual records
                leaveType: null,
                notes: '',
                checkInTime: null,
                checkOutTime: null
            };
        }

        // Update check-in time
        if (record.type === 'checkin' || record.type === 'shift_checkin' || record.type === 'manual_checkin') {
            recordsByDate[date].checkInTime = record.time;
            recordsByDate[date].type = record.type; // Set type only when we have a check-in
            // Update notes if provided
            if (record.notes) {
                recordsByDate[date].notes = record.notes;
            }
        }

        // Update check-out time
        if (record.checkoutTime) {
            recordsByDate[date].checkOutTime = record.checkoutTime;
            // Update notes if provided
            if (record.notes) {
                recordsByDate[date].notes = record.notes;
            }
        }

        // For leave records
        if (record.type === 'leave') {
            recordsByDate[date].type = 'leave';
            recordsByDate[date].leaveType = record.leaveType;
            // Update notes if provided
            if (record.notes) {
                recordsByDate[date].notes = record.notes;
            }
        }
    });

    // Count based on notes and record type
    Object.values(recordsByDate).forEach(record => {
        const notes = record.notes ? record.notes.toLowerCase() : '';

        // Check if it's a leave record first
        if (record.type === 'leave') {
            if (record.leaveType === 'medical' || notes.includes('mc')) {
                mcCount++;
            } else if (record.leaveType === 'annual' || notes.includes('al')) {
                alCount++;
            } else if (record.leaveType === 'emergency' || notes.includes('el')) {
                elCount++;
            }
        }
        // For regular attendance records
        else if (record.checkInTime) {
            // Check if marked as late in notes
            if (notes.includes('late')) {
                lateCount++;
                presentCount++;
            } else {
                presentCount++;
            }
        }
    });

    return { presentCount, mcCount, elCount, alCount, lateCount };
}

// Calculate Monthly Summary (renders into dashboard summary boxes)
function calculateMonthlySummary(month, year) {
    const summary = getMonthlySummaryCounts(month, year);

    const totalPresentEl = document.getElementById('totalPresent');
    const totalMCEl = document.getElementById('totalMC');
    const totalELEl = document.getElementById('totalEL');
    const totalALEl = document.getElementById('totalAL');
    const totalLateEl = document.getElementById('totalLate');

    if (totalPresentEl) totalPresentEl.textContent = summary.presentCount;
    if (totalMCEl) totalMCEl.textContent = summary.mcCount;
    if (totalELEl) totalELEl.textContent = summary.elCount;
    if (totalALEl) totalALEl.textContent = summary.alCount;
    if (totalLateEl) totalLateEl.textContent = summary.lateCount;

    return summary;
}

// Auto-update Dashboard Summary (Monthly and Yearly)
// Defaults to the currently-selected dropdown values (does NOT force-reset to today's date)
function updateDashboardSummaries(month = null, year = null) {
    const summaryMonthEl = document.getElementById('summaryMonth');
    const summaryYearEl = document.getElementById('summaryYear');

    const now = new Date();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentYear = now.getFullYear().toString();

    const monthToUpdate = month ?? summaryMonthEl?.value ?? currentMonth;
    const yearToUpdate = year ?? summaryYearEl?.value ?? currentYear;

    // Only force-set dropdowns when caller explicitly passes month/year
    if (month != null && summaryMonthEl) summaryMonthEl.value = monthToUpdate;
    if (year != null && summaryYearEl) summaryYearEl.value = yearToUpdate;

    calculateMonthlySummary(monthToUpdate, yearToUpdate);

    // Yearly view should follow the Yearly dropdown if present; otherwise follow the monthly year
    const yearlyYearEl = document.getElementById('yearlyYear');
    const yearForYearly = yearlyYearEl?.value ?? yearToUpdate;
    calculateYearlySummary(yearForYearly);

    // Update the dashboard attendance graph (legend only; no numbers)
    if (typeof renderAttendanceGraph === 'function') {
        renderAttendanceGraph(monthToUpdate, yearToUpdate);
    }
}

// Calculate Yearly Summary
function calculateYearlySummary(year) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const yearlySummaryGrid = document.getElementById('yearlySummaryGrid');
    if (!yearlySummaryGrid) return;

    yearlySummaryGrid.innerHTML = '';

    monthNames.forEach((monthName, index) => {
        const month = String(index + 1).padStart(2, '0');
        const summary = getMonthlySummaryCounts(month, year);

        const monthCard = document.createElement('div');
        monthCard.className = 'month-card';
        monthCard.innerHTML = `
            <div class="month-card-header">${monthName} ${year}</div>
            <div class="month-card-item">
                <span class="month-card-label">Present</span>
                <span class="month-card-value">${summary.presentCount}</span>
            </div>
            <div class="month-card-item">
                <span class="month-card-label">MC</span>
                <span class="month-card-value">${summary.mcCount}</span>
            </div>
            <div class="month-card-item">
                <span class="month-card-label">EL</span>
                <span class="month-card-value">${summary.elCount}</span>
            </div>
            <div class="month-card-item">
                <span class="month-card-label">AL</span>
                <span class="month-card-value">${summary.alCount}</span>
            </div>
            <div class="month-card-item">
                <span class="month-card-label">Late</span>
                <span class="month-card-value">${summary.lateCount}</span>
            </div>
        `;
        yearlySummaryGrid.appendChild(monthCard);
    });
}

// Dashboard Initialization
function initializeDashboard() {
    // Calculate initial summary for current month and year
    const summaryMonth = document.getElementById('summaryMonth');
    const summaryYear = document.getElementById('summaryYear');
    if (summaryMonth && summaryYear) {
        calculateMonthlySummary(summaryMonth.value, summaryYear.value);
    }
    
    // Calculate initial yearly summary
    const yearlyYear = document.getElementById('yearlyYear');
    if (yearlyYear) {
        calculateYearlySummary(yearlyYear.value);
    }
    const checkInBtn = document.getElementById('checkInBtn');
    const manualCheckInBtn = document.getElementById('manualCheckInBtn');
    const markLeaveBtn = document.getElementById('markLeaveBtn');
    const markOvernightBtn = document.getElementById('markOvernightBtn');
    const recordTypeSelect = document.getElementById('recordType');

    // Check-In Button
    if (checkInBtn) {
        checkInBtn.addEventListener('click', function() {
            showCheckInModal();
        });
    }

    // Manual Check-In Button
    if (manualCheckInBtn) {
        manualCheckInBtn.addEventListener('click', function() {
            showManualCheckInModal();
        });
    }

    // Mark as Leave Button
    if (markLeaveBtn) {
        markLeaveBtn.addEventListener('click', function() {
            showLeaveModal();
        });
    }

    // Overnight Shift Button
    if (markOvernightBtn) {
        markOvernightBtn.addEventListener('click', function() {
            showOvernightModal();
        });
    }

    // Record View Selectors
    const viewTypeSelect = document.getElementById('viewType');
    const dateSelect = document.getElementById('dateSelect');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    if (viewTypeSelect) {
        // Set initial view to monthly
        viewTypeSelect.value = 'monthly';
        handleViewTypeChange('monthly');

        viewTypeSelect.addEventListener('change', function() {
            handleViewTypeChange(this.value);
        });
    }

    if (dateSelect) {
        dateSelect.addEventListener('change', function() {
            handleDateChange(this.value);
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', function(e) {
            e.preventDefault();
            navigateDate(-1);
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', function(e) {
            e.preventDefault();
            navigateDate(1);
        });
    }
}

// View Type Change Handler
function handleViewTypeChange(viewType) {
    const dateSelect = document.getElementById('dateSelect');
    const label = document.querySelector('#dateSelector label');

    if (viewType === 'monthly') {
        // Populate with months
        dateSelect.innerHTML = '';
        const months = [
            { value: 'jan', text: 'January' },
            { value: 'feb', text: 'February' },
            { value: 'mar', text: 'March' },
            { value: 'apr', text: 'April' },
            { value: 'may', text: 'May' },
            { value: 'jun', text: 'June' },
            { value: 'jul', text: 'July' },
            { value: 'aug', text: 'August' },
            { value: 'sep', text: 'September' },
            { value: 'oct', text: 'October' },
            { value: 'nov', text: 'November' },
            { value: 'dec', text: 'December' }
        ];

        months.forEach(month => {
            const option = document.createElement('option');
            option.value = month.value;
            option.textContent = month.text;
            dateSelect.appendChild(option);
        });

        label.textContent = 'Select Month:';

        // Default to current month (instead of January) so the table isn't empty on first load.
        const currentMonthIndex = new Date().getMonth(); // 0-11
        const currentMonthValue = months[currentMonthIndex]?.value;
        if (currentMonthValue) {
            dateSelect.value = currentMonthValue;
        }

        // Apply monthly filter
        handleDateChange(dateSelect.value);
    } else if (viewType === 'yearly') {
        // Populate with years from 2007 to 2050
        dateSelect.innerHTML = '';
        for (let year = 2007; year <= 2050; year++) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            dateSelect.appendChild(option);
        }

        label.textContent = 'Select Year:';

        // Set current year as default
        const currentYear = new Date().getFullYear();
        if (currentYear >= 2007 && currentYear <= 2050) {
            dateSelect.value = currentYear;
        } else {
            dateSelect.value = 2024; // Default to 2024 if current year is out of range
        }

        // Apply yearly filter
        handleDateChange(dateSelect.value);
    }
}

// Date Change Handler - handles both monthly and yearly filtering
function handleDateChange(value) {
    // Reload and re-filter the attendance data based on the selected month/year
    loadSavedAttendanceData();

    // Keep Staff Portal action buttons consistent with persisted attendance state.
    // This prevents the UI from resetting to default when a check-out is still pending.
    try {
        syncStaffPortalAttendanceButtonsFromStorage();
    } catch (e) {
        // ignore
    }
}

// Date Navigation - handles both monthly and yearly navigation
function navigateDate(direction) {
    const dateSelect = document.getElementById('dateSelect');
    const viewTypeSelect = document.getElementById('viewType');
    const viewType = viewTypeSelect ? viewTypeSelect.value : 'monthly';

    if (viewType === 'monthly') {
        // Monthly navigation
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const currentIndex = months.indexOf(dateSelect.value);
        const newIndex = (currentIndex + direction + months.length) % months.length;

        dateSelect.value = months[newIndex];
    } else if (viewType === 'yearly') {
        // Yearly navigation
        const currentIndex = parseInt(dateSelect.value);
        const newIndex = currentIndex + direction;

        if (newIndex >= 2007 && newIndex <= 2050) {
            dateSelect.value = newIndex;
        }
    }

    // Trigger change event to update records
    const event = new Event('change', { bubbles: true });
    dateSelect.dispatchEvent(event);
}

// Modal Functions
function showCheckInModal() {
    const modal = document.getElementById('checkInModal');
    const checkInTime = document.getElementById('checkInTime');
    const currentTime = document.getElementById('currentTime');

    if (modal) {
        // Get current date and time
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();

        // Update modal content
        if (checkInTime) {
            checkInTime.textContent = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
        }
        if (currentTime) {
            currentTime.textContent = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
        }

        // Restore the correct check-in / check-out button state from stored records.
        // This prevents the button from resetting after refresh or date changes.
        try {
            syncStaffPortalAttendanceButtonsFromStorage();
        } catch (e) {
            // ignore
        }

        modal.style.display = 'block';
    }
}

function showManualCheckInModal() {
    const modal = document.getElementById('manualCheckInModal');
    if (modal) {
        // Get current date and time
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();

        // Format date as YYYY-MM-DD for date input
        const currentDate = `${year}-${month}-${day}`;

        // Format time as HH:MM for time input
        const currentTime = `${hours}:${minutes}`;

        // Get the submit button to check if user is currently checked in
        const submitBtn = document.querySelector('#manualCheckInForm button[type="submit"]');
        const isCheckedIn = submitBtn ? submitBtn.dataset.checkedIn === 'true' : false;

        // Populate date and time fields
        const dateInput = document.getElementById('manualCheckInDate');
        const timeInput = document.getElementById('manualCheckInTime');

        // Check if there's a saved date/time from the last session (from sessionStorage)
        const savedManualDate = sessionStorage.getItem('lastManualCheckInDate');
        const savedManualTime = sessionStorage.getItem('lastManualCheckInTime');

        // Determine which date/time to show
        let dateToShow = currentDate;
        let timeToShow = currentTime;

        if (savedManualDate) {
            // If there's a saved date from this session, use it (user is continuing with same date)
            dateToShow = savedManualDate;
        }

        if (savedManualTime) {
            // If there's a saved time from this session, use it
            timeToShow = savedManualTime;
        }

        // Apply the date and time
        if (dateInput) {
            dateInput.value = dateToShow;
        }

        if (timeInput) {
            timeInput.value = timeToShow;
        }

        // Persist draft date/time while the user is still filling the form.
        // Only resets on page refresh (see DOMContentLoaded cleanup).
        if (dateInput && !dateInput.dataset.persistDraftBound) {
            const persistDate = () => {
                if (dateInput.value) {
                    sessionStorage.setItem('lastManualCheckInDate', dateInput.value);
                }
            };
            dateInput.addEventListener('change', persistDate);
            dateInput.addEventListener('input', persistDate);
            dateInput.dataset.persistDraftBound = 'true';
        }

        if (timeInput && !timeInput.dataset.persistDraftBound) {
            const persistTime = () => {
                if (timeInput.value) {
                    sessionStorage.setItem('lastManualCheckInTime', timeInput.value);
                }
            };
            timeInput.addEventListener('change', persistTime);
            timeInput.addEventListener('input', persistTime);
            timeInput.dataset.persistDraftBound = 'true';
        }

        // Ensure the current shown values are captured immediately.
        if (dateInput && dateInput.value) sessionStorage.setItem('lastManualCheckInDate', dateInput.value);
        if (timeInput && timeInput.value) sessionStorage.setItem('lastManualCheckInTime', timeInput.value);

        // Restore the correct check-in / check-out button state from stored records.
        try {
            syncStaffPortalAttendanceButtonsFromStorage();
        } catch (e) {
            // ignore
        }

        modal.style.display = 'block';
    }
}

function showLeaveModal() {
    const modal = document.getElementById('leaveModal');
    if (modal) {
        // Set current date
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const currentDate = `${year}-${month}-${day}`;

        // Set the date field
        const leaveDateInput = document.getElementById('leaveDate');
        if (leaveDateInput) {
            leaveDateInput.value = currentDate;

            // Reset button state when date is changed
            leaveDateInput.addEventListener('change', function() {
                const submitBtn = document.querySelector('#leaveForm button[type="submit"]');
                if (submitBtn) {
                    submitBtn.innerHTML = 'Submit Leave';
                    submitBtn.classList.remove('btn-completed');
                    submitBtn.disabled = false;
                }
            });
        }

        modal.style.display = 'block';
    }
}

function showOvernightModal() {
    const modal = document.getElementById('overnightModal');
    if (modal) {
        // Default date/time (used only when we have no saved state or draft)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const currentDate = `${year}-${month}-${day}`;

        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const currentTime = `${hours}:${minutes}`;

        const shiftDateInput = document.getElementById('shiftDate');
        const shiftCheckInTimeInput = document.getElementById('shiftCheckInTime');
        const shiftCheckOutDateInput = document.getElementById('shiftCheckOutDate');
        const shiftCheckOutTimeInput = document.getElementById('shiftCheckOutTime');
        const shiftNotesInput = document.getElementById('shiftNotes');

        // Get the saved state for this overnight shift (set on submit)
        const savedState = sessionStorage.getItem('overnightShiftState');
        const submitBtn = document.querySelector('#overnightForm button[type="submit"]');

        // Draft values (persist while user is still filling the form)
        const draftDate = sessionStorage.getItem('overnightShiftDraftDate');
        const draftCheckInTime = sessionStorage.getItem('overnightShiftDraftCheckInTime');
        const draftCheckOutTime = sessionStorage.getItem('overnightShiftDraftCheckOutTime');
        const draftCheckOutDate = sessionStorage.getItem('overnightShiftDraftCheckOutDate');
        const draftNotes = sessionStorage.getItem('overnightShiftDraftNotes');
        const draftShiftType = sessionStorage.getItem('overnightShiftDraftShiftType');

        const bindDraftPersistence = () => {
            if (shiftDateInput && !shiftDateInput.dataset.persistDraftBound) {
                const persist = () => {
                    if (shiftDateInput.value) sessionStorage.setItem('overnightShiftDraftDate', shiftDateInput.value);
                };
                shiftDateInput.addEventListener('change', persist);
                shiftDateInput.addEventListener('input', persist);
                shiftDateInput.dataset.persistDraftBound = 'true';
            }

            if (shiftCheckInTimeInput && !shiftCheckInTimeInput.dataset.persistDraftBound) {
                const persist = () => {
                    if (shiftCheckInTimeInput.value) sessionStorage.setItem('overnightShiftDraftCheckInTime', shiftCheckInTimeInput.value);
                };
                shiftCheckInTimeInput.addEventListener('change', persist);
                shiftCheckInTimeInput.addEventListener('input', persist);
                shiftCheckInTimeInput.dataset.persistDraftBound = 'true';
            }

            if (shiftCheckOutTimeInput && !shiftCheckOutTimeInput.dataset.persistDraftBound) {
                const persist = () => {
                    sessionStorage.setItem('overnightShiftDraftCheckOutTime', shiftCheckOutTimeInput.value || '');
                };
                shiftCheckOutTimeInput.addEventListener('change', persist);
                shiftCheckOutTimeInput.addEventListener('input', persist);
                shiftCheckOutTimeInput.dataset.persistDraftBound = 'true';
            }

            if (shiftCheckOutDateInput && !shiftCheckOutDateInput.dataset.persistDraftBound) {
                const persist = () => {
                    sessionStorage.setItem('overnightShiftDraftCheckOutDate', shiftCheckOutDateInput.value || '');
                };
                shiftCheckOutDateInput.addEventListener('change', persist);
                shiftCheckOutDateInput.addEventListener('input', persist);
                shiftCheckOutDateInput.dataset.persistDraftBound = 'true';
            }

            if (shiftNotesInput && !shiftNotesInput.dataset.persistDraftBound) {
                const persist = () => {
                    sessionStorage.setItem('overnightShiftDraftNotes', shiftNotesInput.value || '');
                };
                shiftNotesInput.addEventListener('change', persist);
                shiftNotesInput.addEventListener('input', persist);
                shiftNotesInput.dataset.persistDraftBound = 'true';
            }
        };
        
        if (savedState) {
            // Restore the previous state
            const state = JSON.parse(savedState);

            // Restore date/time that were previously selected (prevents resetting while processing)
            if (shiftDateInput) shiftDateInput.value = state.shiftDate || currentDate;
            if (shiftCheckInTimeInput) shiftCheckInTimeInput.value = state.shiftCheckInTime || currentTime;

            if (submitBtn) {
                submitBtn.innerHTML = state.buttonLabel;
                submitBtn.dataset.checkedIn = state.checkedIn;
                submitBtn.classList.remove('btn-checkout', 'btn-completed');
                if (state.buttonClass) {
                    submitBtn.classList.add(state.buttonClass);
                }
                submitBtn.disabled = state.disabled;
            }
            
            // Restore check-out time if exists
            if (state.shiftCheckOutTime) {
                if (shiftCheckOutTimeInput) shiftCheckOutTimeInput.value = state.shiftCheckOutTime;
            }

            // Restore check-out date if exists
            if (state.shiftCheckOutDate) {
                if (shiftCheckOutDateInput) shiftCheckOutDateInput.value = state.shiftCheckOutDate;
            }
            if (state.shiftNotes) {
                if (shiftNotesInput) shiftNotesInput.value = state.shiftNotes;
            }
            
            // Show check-out fields if in check-out phase
            if (state.checkedIn === 'true') {
                document.getElementById('checkOutDateGroup').style.display = 'block';
                document.getElementById('checkOutTimeGroup').style.display = 'block';
            } else {
                document.getElementById('checkOutDateGroup').style.display = 'none';
                document.getElementById('checkOutTimeGroup').style.display = 'none';
            }
            
            // Restore shift type selection
            if (state.shiftType) {
                modal.dataset.shiftType = state.shiftType;
                document.querySelectorAll('#overnightModal .btn-shift').forEach(btn => {
                    btn.classList.remove('selected');
                    if (btn.id === `shift${state.shiftType}OvernightBtn`) {
                        btn.classList.add('selected');
                    }
                });
            }

            // Ensure draft mirrors restored state (useful when user reopens without submitting again)
            if (shiftDateInput?.value) sessionStorage.setItem('overnightShiftDraftDate', shiftDateInput.value);
            if (shiftCheckInTimeInput?.value) sessionStorage.setItem('overnightShiftDraftCheckInTime', shiftCheckInTimeInput.value);
            if (shiftCheckOutTimeInput) sessionStorage.setItem('overnightShiftDraftCheckOutTime', shiftCheckOutTimeInput.value || '');
            if (shiftCheckOutDateInput) sessionStorage.setItem('overnightShiftDraftCheckOutDate', shiftCheckOutDateInput.value || '');
            if (shiftNotesInput) sessionStorage.setItem('overnightShiftDraftNotes', shiftNotesInput.value || '');
            if (modal.dataset.shiftType) sessionStorage.setItem('overnightShiftDraftShiftType', modal.dataset.shiftType);

            bindDraftPersistence();
        } else if (draftDate || draftCheckInTime || draftCheckOutTime || draftCheckOutDate || draftNotes || draftShiftType) {
            // Restore draft values (user is in-progress but hasn't submitted yet)
            if (shiftDateInput) shiftDateInput.value = draftDate || currentDate;
            if (shiftCheckInTimeInput) shiftCheckInTimeInput.value = draftCheckInTime || currentTime;
            if (shiftCheckOutDateInput) shiftCheckOutDateInput.value = draftCheckOutDate || '';
            if (shiftCheckOutTimeInput) shiftCheckOutTimeInput.value = draftCheckOutTime || '';
            if (shiftNotesInput) shiftNotesInput.value = draftNotes || '';

            // Show/hide check-out fields based on whether user has started the check-out phase
            const hasCheckoutDraft = Boolean(draftCheckOutTime) || Boolean(draftCheckOutDate);
            document.getElementById('checkOutDateGroup').style.display = hasCheckoutDraft ? 'block' : 'none';
            document.getElementById('checkOutTimeGroup').style.display = hasCheckoutDraft ? 'block' : 'none';

            // Reset submit button to initial state
            if (submitBtn) {
                submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Submit Check-In';
                submitBtn.dataset.checkedIn = 'false';
                submitBtn.classList.remove('btn-checkout', 'btn-completed');
                submitBtn.disabled = false;
            }

            // Restore shift type selection (draft)
            if (draftShiftType) {
                modal.dataset.shiftType = draftShiftType;
                document.querySelectorAll('#overnightModal .btn-shift').forEach(btn => {
                    btn.classList.remove('selected');
                    if (btn.id === `shift${draftShiftType}OvernightBtn`) {
                        btn.classList.add('selected');
                    }
                });
            }

            bindDraftPersistence();
        } else {
            // First time opening
            if (shiftDateInput) shiftDateInput.value = currentDate;
            if (shiftCheckInTimeInput) shiftCheckInTimeInput.value = currentTime;

            // Hide check-out fields and clear them
            document.getElementById('checkOutDateGroup').style.display = 'none';
            document.getElementById('shiftCheckOutDate').value = '';
            document.getElementById('checkOutTimeGroup').style.display = 'none';
            document.getElementById('shiftCheckOutTime').value = '';
            document.getElementById('shiftNotes').value = '';

            // Reset submit button
            if (submitBtn) {
                submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Submit Check-In';
                submitBtn.dataset.checkedIn = 'false';
                submitBtn.classList.remove('btn-checkout', 'btn-completed');
                submitBtn.disabled = false;
            }
            
            // Clear shift type selection
            modal.dataset.shiftType = '';
            document.querySelectorAll('#overnightModal .btn-shift').forEach(btn => {
                btn.classList.remove('selected');
            });

            // Seed draft with defaults so it doesn't reset during the session
            if (shiftDateInput?.value) sessionStorage.setItem('overnightShiftDraftDate', shiftDateInput.value);
            if (shiftCheckInTimeInput?.value) sessionStorage.setItem('overnightShiftDraftCheckInTime', shiftCheckInTimeInput.value);
            sessionStorage.setItem('overnightShiftDraftCheckOutTime', '');
            sessionStorage.setItem('overnightShiftDraftCheckOutDate', '');
            sessionStorage.setItem('overnightShiftDraftNotes', '');
            sessionStorage.setItem('overnightShiftDraftShiftType', '');

            bindDraftPersistence();
        }
        
        // Role-based lock: prevent editing overnight shift start date/time when enabled for the current role.
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        const userRole = currentUser.role;
        const roleAccess = JSON.parse(localStorage.getItem('roleAccess') || '{}');
        const currentRoleAccess = userRole ? (roleAccess[userRole] || {}) : {};
        const isShiftOLockEnabled = currentRoleAccess.shiftOLock === true;

        if (shiftDateInput) shiftDateInput.disabled = isShiftOLockEnabled;
        if (shiftCheckInTimeInput) shiftCheckInTimeInput.disabled = isShiftOLockEnabled;

        // Restore the correct check-in / check-out button state from stored records.
        try {
            syncStaffPortalAttendanceButtonsFromStorage();
        } catch (e) {
            // ignore
        }

        modal.style.display = 'block';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Helper function to check if a date is today
function isDateToday(dateString) {
    const today = new Date();
    const todayFormatted = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return dateString === todayFormatted;
}

// =============================
// Staff Portal – Attendance UI state
// =============================
// The Staff Portal check-in / check-out flows store progress in localStorage (attendance_* records).
// Button state must be derived from those records so it does not reset after refresh or date changes.

function getTodayIsoDateKey() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function getStaffPortalAttendanceUiState() {
    const attendancePrefix = getAttendanceRecordKeyPrefix();
    const deletedIds = getDeletedRecordIdSet(attendancePrefix);

    const records = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(attendancePrefix)) continue;

        let record = null;
        try {
            record = JSON.parse(localStorage.getItem(key) || 'null');
        } catch (e) {
            record = null;
        }
        if (!record || typeof record !== 'object') continue;

        const tsId = normalizeDeletedRecordId(record.timestamp);
        const isDeleted = record.isDeleted === true
            || record.deleted === true
            || (tsId && deletedIds.has(tsId))
            || deletedIds.has(key);
        if (isDeleted) continue;

        records.push({ key, record });
    }

    const isCheckInType = (r) => r && (
        r.type === 'checkin'
        || r.type === 'manual_checkin'
        || r.type === 'shift_checkin'
    );

    const byTimestampDesc = (a, b) => {
        const ams = Date.parse(String((a && a.record && a.record.timestamp) || ''));
        const bms = Date.parse(String((b && b.record && b.record.timestamp) || ''));
        const aSafe = Number.isFinite(ams) ? ams : 0;
        const bSafe = Number.isFinite(bms) ? bms : 0;
        return bSafe - aSafe;
    };

    const open = (records
        .filter((r) => isCheckInType(r.record) && !r.record.checkoutTime)
        .sort(byTimestampDesc)[0]) || null;

    if (open) return { mode: 'checkout', record: open.record, key: open.key };

    const todayKey = getTodayIsoDateKey();
    const completed = (records
        .filter((r) => isCheckInType(r.record) && r.record.checkoutTime && String(r.record.date || '') === todayKey)
        .sort(byTimestampDesc)[0]) || null;

    if (completed) return { mode: 'completed', record: completed.record, key: completed.key };

    return { mode: 'checkin', record: null, key: null };
}

function syncStaffPortalAttendanceButtonsFromStorage() {
    try {
        const state = getStaffPortalAttendanceUiState();

        const confirmBtn = document.getElementById('confirmCheckInBtn');
        if (confirmBtn) {
            if (state.mode === 'checkout') {
                confirmBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Check-Out';
                confirmBtn.dataset.checkedIn = 'true';
                confirmBtn.classList.add('btn-checkout');
                confirmBtn.classList.remove('btn-completed');
                confirmBtn.disabled = false;
            } else if (state.mode === 'completed') {
                confirmBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Completed';
                confirmBtn.dataset.checkedIn = 'completed';
                confirmBtn.classList.remove('btn-checkout');
                confirmBtn.classList.add('btn-completed');
                confirmBtn.disabled = true;
            } else {
                // Default / fresh session
                confirmBtn.innerHTML = 'Confirm Check-In';
                confirmBtn.dataset.checkedIn = 'false';
                confirmBtn.classList.remove('btn-checkout', 'btn-completed');
                confirmBtn.disabled = false;
            }
        }

        const manualSubmitBtn = document.querySelector('#manualCheckInForm button[type="submit"]');
        if (manualSubmitBtn) {
            if (state.mode === 'checkout') {
                manualSubmitBtn.innerHTML = 'Submit Check-Out';
                manualSubmitBtn.dataset.checkedIn = 'true';
                manualSubmitBtn.classList.add('btn-checkout');
                manualSubmitBtn.classList.remove('btn-completed');
                manualSubmitBtn.disabled = false;
            } else if (state.mode === 'completed') {
                // Preserve existing behavior: only lock "Completed" for today; otherwise allow edits.
                const dateInput = document.getElementById('manualCheckInDate');
                const dateVal = dateInput ? String(dateInput.value || '').trim() : '';
                if (dateVal && isDateToday(dateVal)) {
                    manualSubmitBtn.innerHTML = 'Completed';
                    manualSubmitBtn.dataset.checkedIn = 'completed';
                    manualSubmitBtn.classList.remove('btn-checkout');
                    manualSubmitBtn.classList.add('btn-completed');
                    manualSubmitBtn.disabled = true;
                } else {
                    manualSubmitBtn.innerHTML = 'Submit Check-In';
                    manualSubmitBtn.dataset.checkedIn = 'false';
                    manualSubmitBtn.classList.remove('btn-checkout', 'btn-completed');
                    manualSubmitBtn.disabled = false;
                }
            } else {
                manualSubmitBtn.innerHTML = 'Submit Check-In';
                manualSubmitBtn.dataset.checkedIn = 'false';
                manualSubmitBtn.classList.remove('btn-checkout', 'btn-completed');
                manualSubmitBtn.disabled = false;
            }
        }
    } catch (e) {
        console.warn('Failed to sync Staff Portal attendance buttons:', e);
    }
}

// =============================
// GPS Auto Check-In (Mobile)
// =============================
let gpsAutoCheckInWatchId = null;
let gpsAutoCheckInLastStatus = '';

function parseBooleanValue(value) {
    if (typeof value === 'boolean') return value;
    const normalized = String(value || '').trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off', ''].includes(normalized)) return false;
    return false;
}

function readUserPreferencesScoped() {
    const userKey = getAttendanceUserKey();
    const scopedKey = `userPreferences_${userKey}`;
    const legacy = localStorage.getItem('userPreferences');
    const raw = localStorage.getItem(scopedKey) || legacy || '{}';
    try {
        return JSON.parse(raw) || {};
    } catch (e) {
        return {};
    }
}

function writeUserPreferencesScoped(nextPrefs) {
    const userKey = getAttendanceUserKey();
    const scopedKey = `userPreferences_${userKey}`;
    localStorage.setItem(scopedKey, JSON.stringify(nextPrefs || {}));
}

function readGpsAutoCheckInConfig() {
    const appSettings = readJson('appSettings', {});
    const lat = parseFloat(appSettings.gpsAutoCheckInLat);
    const lng = parseFloat(appSettings.gpsAutoCheckInLng);
    const radiusM = parseFloat(appSettings.gpsAutoCheckInRadiusM);
    const accuracyM = parseFloat(appSettings.gpsAutoCheckInAccuracyM);
    const cooldownM = parseFloat(appSettings.gpsAutoCheckInCooldownM);

    const config = {
        enabled: parseBooleanValue(appSettings.gpsAutoCheckInEnabled),
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        radiusM: Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 150,
        accuracyM: Number.isFinite(accuracyM) && accuracyM > 0 ? accuracyM : 120,
        cooldownM: Number.isFinite(cooldownM) && cooldownM > 0 ? cooldownM : 60
    };

    config.hasValidLocation = Number.isFinite(config.lat) && Number.isFinite(config.lng);
    return config;
}

function writeGpsAutoCheckInConfig(partial) {
    const appSettings = readJson('appSettings', {});
    const next = { ...(appSettings || {}), ...(partial || {}) };
    localStorage.setItem('appSettings', JSON.stringify(next));
}

function isLikelyMobileDevice() {
    const ua = navigator.userAgent || '';
    const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const touchMobile = (navigator.maxTouchPoints || 0) > 1 && window.innerWidth < 1024;
    return uaMobile || touchMobile;
}

function isSecureGeolocationContext() {
    if (window.isSecureContext) return true;
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1';
}

function setGpsAutoCheckInStatus(text, tone) {
    const statusEl = document.getElementById('gpsAutoCheckInStatus');
    if (!statusEl) return;
    const nextText = String(text || '');
    if (gpsAutoCheckInLastStatus === nextText && statusEl.dataset.tone === (tone || '')) return;
    gpsAutoCheckInLastStatus = nextText;
    statusEl.textContent = nextText;
    statusEl.dataset.tone = tone || '';
}

function setGpsSettingsStatus(text, tone) {
    const statusEl = document.getElementById('gpsSettingsStatus');
    if (!statusEl) return;
    statusEl.textContent = String(text || '');
    statusEl.dataset.tone = tone || '';
}

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function getGpsAutoCheckInOptIn() {
    const prefs = readUserPreferencesScoped();
    return parseBooleanValue(prefs.gpsAutoCheckInOptIn);
}

function setGpsAutoCheckInOptIn(value) {
    const prefs = readUserPreferencesScoped();
    prefs.gpsAutoCheckInOptIn = Boolean(value);
    writeUserPreferencesScoped(prefs);
}

function stopGpsAutoCheckInWatch() {
    if (gpsAutoCheckInWatchId != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(gpsAutoCheckInWatchId);
    }
    gpsAutoCheckInWatchId = null;
}

function handleGpsAutoCheckInError(err) {
    if (!err) {
        setGpsAutoCheckInStatus('GPS unavailable.', 'error');
        return;
    }
    if (err.code === 1) {
        setGpsAutoCheckInStatus('Location permission denied.', 'error');
        return;
    }
    if (err.code === 2) {
        setGpsAutoCheckInStatus('Location unavailable.', 'error');
        return;
    }
    if (err.code === 3) {
        setGpsAutoCheckInStatus('Location request timed out.', 'warn');
        return;
    }
    setGpsAutoCheckInStatus('GPS error.', 'error');
}

function attemptGpsAutoCheckIn(position) {
    const cfg = readGpsAutoCheckInConfig();
    if (!cfg.enabled) {
        setGpsAutoCheckInStatus('Disabled by admin.', 'warn');
        return;
    }
    if (!cfg.hasValidLocation) {
        setGpsAutoCheckInStatus('Office location not configured.', 'warn');
        return;
    }

    const coords = position && position.coords ? position.coords : null;
    if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
        setGpsAutoCheckInStatus('Invalid GPS coordinates.', 'error');
        return;
    }

    const accuracy = Number.isFinite(coords.accuracy) ? coords.accuracy : null;
    if (accuracy != null && accuracy > cfg.accuracyM) {
        setGpsAutoCheckInStatus(`GPS accuracy too low (±${Math.round(accuracy)}m).`, 'warn');
        return;
    }

    const distance = calculateDistanceMeters(coords.latitude, coords.longitude, cfg.lat, cfg.lng);
    if (!Number.isFinite(distance)) {
        setGpsAutoCheckInStatus('Unable to measure GPS distance.', 'error');
        return;
    }

    const distanceText = `${Math.round(distance)}m`;
    if (distance > cfg.radiusM) {
        setGpsAutoCheckInStatus(`Outside office radius (${distanceText} away).`, 'warn');
        return;
    }

    const state = getStaffPortalAttendanceUiState();
    if (state.mode !== 'checkin') {
        setGpsAutoCheckInStatus('Already checked in today.', 'ok');
        return;
    }

    const prefs = readUserPreferencesScoped();
    const lastAt = Number(prefs.gpsAutoCheckInLastAt || 0);
    const nowMs = Date.now();
    if (lastAt && cfg.cooldownM > 0 && (nowMs - lastAt) < cfg.cooldownM * 60 * 1000) {
        setGpsAutoCheckInStatus('Auto check-in cooling down.', 'warn');
        return;
    }

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();

    const recordData = {
        type: 'checkin',
        time: `${hours}:${minutes}:${seconds}`,
        date: `${year}-${month}-${day}`,
        notes: 'Auto GPS check-in',
        timestamp: now.toISOString(),
        shiftType: 'Normal',
        source: 'gps-auto',
        location: {
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: accuracy != null ? Math.round(accuracy) : null,
            distanceM: Math.round(distance)
        }
    };

    saveAttendanceRecord(recordData);
    syncStaffPortalAttendanceButtonsFromStorage();

    prefs.gpsAutoCheckInLastAt = nowMs;
    writeUserPreferencesScoped(prefs);

    setGpsAutoCheckInStatus(`Checked in automatically at ${hours}:${minutes}.`, 'ok');
}

function startGpsAutoCheckInWatch() {
    if (!navigator.geolocation) {
        setGpsAutoCheckInStatus('GPS not supported on this device.', 'error');
        return;
    }
    if (!isSecureGeolocationContext()) {
        setGpsAutoCheckInStatus('GPS requires HTTPS or localhost.', 'error');
        return;
    }
    if (gpsAutoCheckInWatchId != null) return;

    setGpsAutoCheckInStatus('Waiting for GPS location...', 'warn');

    gpsAutoCheckInWatchId = navigator.geolocation.watchPosition(
        attemptGpsAutoCheckIn,
        handleGpsAutoCheckInError,
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
    );
}

function refreshGpsAutoCheckInState() {
    const cfg = readGpsAutoCheckInConfig();
    const toggle = document.getElementById('gpsAutoCheckInUserToggle');
    const isOptedIn = getGpsAutoCheckInOptIn();

    if (toggle) {
        toggle.checked = isOptedIn;
        toggle.disabled = !cfg.enabled || !cfg.hasValidLocation;
    }

    if (!cfg.enabled) {
        stopGpsAutoCheckInWatch();
        setGpsAutoCheckInStatus('Disabled by admin.', 'warn');
        return;
    }

    if (!cfg.hasValidLocation) {
        stopGpsAutoCheckInWatch();
        setGpsAutoCheckInStatus('Office location not configured.', 'warn');
        return;
    }

    if (!isOptedIn) {
        stopGpsAutoCheckInWatch();
        setGpsAutoCheckInStatus('Auto check-in disabled.', 'warn');
        return;
    }

    if (!isLikelyMobileDevice()) {
        stopGpsAutoCheckInWatch();
        setGpsAutoCheckInStatus('Auto check-in is mobile only.', 'warn');
        return;
    }

    startGpsAutoCheckInWatch();
}

function initializeGpsAutoCheckInSettings() {
    const form = document.getElementById('gpsAutoCheckInForm');
    if (!form || form.dataset.gpsBound === 'true') return;
    form.dataset.gpsBound = 'true';

    const enabledEl = document.getElementById('gpsAutoCheckInEnabled');
    const latEl = document.getElementById('gpsOfficeLat');
    const lngEl = document.getElementById('gpsOfficeLng');
    const radiusEl = document.getElementById('gpsAutoCheckInRadius');
    const accuracyEl = document.getElementById('gpsAutoCheckInAccuracy');
    const cooldownEl = document.getElementById('gpsAutoCheckInCooldown');
    const useCurrentBtn = document.getElementById('gpsUseCurrentLocationBtn');

    const loadForm = () => {
        const cfg = readGpsAutoCheckInConfig();
        if (enabledEl) enabledEl.checked = cfg.enabled;
        if (latEl) latEl.value = cfg.lat != null ? String(cfg.lat) : '';
        if (lngEl) lngEl.value = cfg.lng != null ? String(cfg.lng) : '';
        if (radiusEl) radiusEl.value = String(cfg.radiusM || '');
        if (accuracyEl) accuracyEl.value = String(cfg.accuracyM || '');
        if (cooldownEl) cooldownEl.value = String(cfg.cooldownM || '');

        if (!cfg.hasValidLocation) {
            setGpsSettingsStatus('Office GPS location not set.', 'warn');
        } else if (!cfg.enabled) {
            setGpsSettingsStatus('GPS auto check-in disabled.', 'warn');
        } else {
            setGpsSettingsStatus('GPS auto check-in configured.', 'ok');
        }
    };

    loadForm();

    if (useCurrentBtn && !useCurrentBtn.dataset.gpsBound) {
        useCurrentBtn.dataset.gpsBound = 'true';
        useCurrentBtn.addEventListener('click', function() {
            if (!navigator.geolocation) {
                setGpsSettingsStatus('GPS not supported on this device.', 'error');
                return;
            }
            if (!isSecureGeolocationContext()) {
                setGpsSettingsStatus('GPS requires HTTPS or localhost.', 'error');
                return;
            }
            setGpsSettingsStatus('Fetching current location...', 'warn');
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const coords = pos.coords || {};
                    if (latEl && Number.isFinite(coords.latitude)) latEl.value = String(coords.latitude);
                    if (lngEl && Number.isFinite(coords.longitude)) lngEl.value = String(coords.longitude);
                    setGpsSettingsStatus('Location captured. Save to apply.', 'ok');
                },
                (err) => {
                    handleGpsAutoCheckInError(err);
                    setGpsSettingsStatus('Failed to read current location.', 'error');
                },
                { enableHighAccuracy: true, timeout: 15000 }
            );
        });
    }

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        const enabled = enabledEl ? enabledEl.checked : false;
        const lat = latEl ? parseFloat(latEl.value) : NaN;
        const lng = lngEl ? parseFloat(lngEl.value) : NaN;
        const radiusM = radiusEl ? parseFloat(radiusEl.value) : NaN;
        const accuracyM = accuracyEl ? parseFloat(accuracyEl.value) : NaN;
        const cooldownM = cooldownEl ? parseFloat(cooldownEl.value) : NaN;

        if (enabled) {
            if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
                alert('Please enter a valid latitude.');
                return;
            }
            if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
                alert('Please enter a valid longitude.');
                return;
            }
        }

        writeGpsAutoCheckInConfig({
            gpsAutoCheckInEnabled: String(enabled),
            gpsAutoCheckInLat: Number.isFinite(lat) ? String(lat) : '',
            gpsAutoCheckInLng: Number.isFinite(lng) ? String(lng) : '',
            gpsAutoCheckInRadiusM: Number.isFinite(radiusM) ? String(radiusM) : '',
            gpsAutoCheckInAccuracyM: Number.isFinite(accuracyM) ? String(accuracyM) : '',
            gpsAutoCheckInCooldownM: Number.isFinite(cooldownM) ? String(cooldownM) : ''
        });

        setGpsSettingsStatus('GPS settings saved.', 'ok');
        refreshGpsAutoCheckInState();
        alert('GPS auto check-in settings saved successfully.');
    });
}

function initializeGpsAutoCheckInToggle() {
    const toggle = document.getElementById('gpsAutoCheckInUserToggle');
    if (!toggle || toggle.dataset.gpsBound === 'true') return;
    toggle.dataset.gpsBound = 'true';

    toggle.addEventListener('change', function() {
        setGpsAutoCheckInOptIn(toggle.checked);
        refreshGpsAutoCheckInState();
    });

    refreshGpsAutoCheckInState();
}

function initializeGpsAutoCheckIn() {
    initializeGpsAutoCheckInSettings();
    initializeGpsAutoCheckInToggle();
}

// Initialize Modal Event Listeners
function initializeModals() {
    // Restore check-in / check-out button state from persisted records on page load.
    syncStaffPortalAttendanceButtonsFromStorage();

    // Check-In Modal
    const closeCheckInModal = document.getElementById('closeCheckInModal');
    const cancelCheckInBtn = document.getElementById('cancelCheckInBtn');
    const confirmCheckInBtn = document.getElementById('confirmCheckInBtn');
    const shiftACheckInBtn = document.getElementById('shiftACheckInBtn');
    const shiftBCheckInBtn = document.getElementById('shiftBCheckInBtn');

    if (closeCheckInModal) {
        closeCheckInModal.addEventListener('click', function() {
            closeModal('checkInModal');
        });
    }

    if (cancelCheckInBtn) {
        cancelCheckInBtn.addEventListener('click', function() {
            closeModal('checkInModal');
        });
    }

    // Shift A button in Check-In modal
    if (shiftACheckInBtn) {
        shiftACheckInBtn.addEventListener('click', function() {
            // Remove selected class from both buttons
            document.querySelectorAll('#checkInModal .btn-shift').forEach(btn => {
                btn.classList.remove('selected');
            });
            // Add selected class to clicked button
            this.classList.add('selected');
            // Store shift type in modal
            document.getElementById('checkInModal').dataset.shiftType = 'A';
        });
    }

    // Shift B button in Check-In modal
    if (shiftBCheckInBtn) {
        shiftBCheckInBtn.addEventListener('click', function() {
            // Remove selected class from both buttons
            document.querySelectorAll('#checkInModal .btn-shift').forEach(btn => {
                btn.classList.remove('selected');
            });
            // Add selected class to clicked button
            this.classList.add('selected');
            // Store shift type in modal
            document.getElementById('checkInModal').dataset.shiftType = 'B';
        });
    }

    if (confirmCheckInBtn) {
        confirmCheckInBtn.addEventListener('click', function() {
            // Check if currently checked in or out
            const isCheckedIn = confirmCheckInBtn.dataset.checkedIn === 'true';

            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = now.getFullYear();
            const dateAndTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

            // Get notes from the modal
            const notesInput = document.getElementById('checkInNotes');
            const notes = notesInput ? notesInput.value.trim() : '';

            // Get shift type from modal
            const modal = document.getElementById('checkInModal');
            const shiftType = modal ? modal.dataset.shiftType : '';

            if (!isCheckedIn) {
                // Check-in: Record current date and time
                const recordData = {
                    type: 'checkin',
                    time: `${hours}:${minutes}:${seconds}`,
                    date: `${year}-${month}-${day}`,
                    notes: notes,
                    timestamp: now.toISOString(),
                    shiftType: 'Normal'
                };

                saveAttendanceRecord(recordData);

                console.log('Check-in confirmed at:', dateAndTime);

                // Change button to checkout with icon
                confirmCheckInBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Check-Out';
                confirmCheckInBtn.dataset.checkedIn = 'true';
                confirmCheckInBtn.classList.add('btn-checkout');
            } else {
                // Check-out: Record current date and time
                saveAttendanceRecord({
                    type: 'checkout',
                    time: `${hours}:${minutes}:${seconds}`,
                    date: `${year}-${month}-${day}`,
                    notes: notes,
                    timestamp: now.toISOString()
                });

                console.log('Check-out confirmed at:', dateAndTime);

                // Disable button after check-out is completed
                confirmCheckInBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Completed';
                confirmCheckInBtn.dataset.checkedIn = 'completed';
                confirmCheckInBtn.classList.remove('btn-checkout');
                confirmCheckInBtn.classList.add('btn-completed');
                confirmCheckInBtn.disabled = true;
            }

            // Keep Staff Portal buttons consistent after this state change.
            syncStaffPortalAttendanceButtonsFromStorage();

            closeModal('checkInModal');
        });
    }

    // Leave Modal
    const closeLeaveModal = document.getElementById('closeLeaveModal');
    const cancelLeaveBtn = document.getElementById('cancelLeaveBtn');
    const leaveForm = document.getElementById('leaveForm');
    const shiftALeaveBtn = document.getElementById('shiftALeaveBtn');
    const shiftBLeaveBtn = document.getElementById('shiftBLeaveBtn');

    if (closeLeaveModal) {
        closeLeaveModal.addEventListener('click', function() {
            closeModal('leaveModal');
        });
    }

    if (cancelLeaveBtn) {
        cancelLeaveBtn.addEventListener('click', function() {
            closeModal('leaveModal');
        });
    }

    // Shift A button in Leave modal
    if (shiftALeaveBtn) {
        shiftALeaveBtn.addEventListener('click', function() {
            // Remove selected class from both buttons
            document.querySelectorAll('#leaveModal .btn-shift').forEach(btn => {
                btn.classList.remove('selected');
            });
            // Add selected class to clicked button
            this.classList.add('selected');
            // Store shift type in modal
            document.getElementById('leaveModal').dataset.shiftType = 'A';
        });
    }

    // Shift B button in Leave modal
    if (shiftBLeaveBtn) {
        shiftBLeaveBtn.addEventListener('click', function() {
            // Remove selected class from both buttons
            document.querySelectorAll('#leaveModal .btn-shift').forEach(btn => {
                btn.classList.remove('selected');
            });
            // Add selected class to clicked button
            this.classList.add('selected');
            // Store shift type in modal
            document.getElementById('leaveModal').dataset.shiftType = 'B';
        });
    }

    if (leaveForm) {
        leaveForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get selected date from the form field
            const leaveDateInput = document.getElementById('leaveDate').value;
            const [selectedYear, selectedMonth, selectedDay] = leaveDateInput.split('-');

            // Get current time for the record
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const dateAndTime = `${selectedYear}-${selectedMonth}-${selectedDay} ${hours}:${minutes}:${seconds}`;

            // Get leave type and details
            const leaveType = document.getElementById('leaveType').value;
            const leaveDetails = document.getElementById('leaveDetails').value;
            const leaveNotes = document.getElementById('leaveNotes').value;

            // Get shift type from modal
            const modal = document.getElementById('leaveModal');
            const shiftType = modal ? modal.dataset.shiftType : '';

            // Save to attendance data with selected date and current time
            const recordData = {
                type: 'leave',
                date: `${selectedYear}-${selectedMonth}-${selectedDay}`,
                time: `${hours}:${minutes}:${seconds}`,
                leaveType: leaveType,
                leaveDetails: leaveDetails,
                notes: leaveNotes,
                timestamp: now.toISOString(),
                shiftType: 'Leave'  // Always set shift type to Leave
            };

            saveAttendanceRecord(recordData);

            console.log('Leave recorded for:', dateAndTime, 'Type:', leaveType);

            // Only show Completed status if the selected date is today
            const submitBtn = document.querySelector('#leaveForm button[type="submit"]');
            if (submitBtn && isDateToday(`${selectedYear}-${selectedMonth}-${selectedDay}`)) {
                submitBtn.innerHTML = 'Completed';
                submitBtn.classList.add('btn-completed');
                submitBtn.disabled = true;
            } else if (submitBtn) {
                // For past or future dates, reset button to allow more entries
                submitBtn.innerHTML = 'Submit Leave';
                submitBtn.classList.remove('btn-completed');
                submitBtn.disabled = false;
            }

            closeModal('leaveModal');
        });
    }

    // Manual Check-In Modal
    const closeManualCheckInModal = document.getElementById('closeManualCheckInModal');
    const cancelManualCheckInBtn = document.getElementById('cancelManualCheckInBtn');
    const manualCheckInForm = document.getElementById('manualCheckInForm');
    const shiftAManualBtn = document.getElementById('shiftAManualBtn');
    const shiftBManualBtn = document.getElementById('shiftBManualBtn');

    if (closeManualCheckInModal) {
        closeManualCheckInModal.addEventListener('click', function() {
            closeModal('manualCheckInModal');
        });
    }

    if (cancelManualCheckInBtn) {
        cancelManualCheckInBtn.addEventListener('click', function() {
            closeModal('manualCheckInModal');
        });
    }

    // Shift A button in Manual Check-In modal
    if (shiftAManualBtn) {
        shiftAManualBtn.addEventListener('click', function() {
            // Remove selected class from both buttons
            document.querySelectorAll('#manualCheckInModal .btn-shift').forEach(btn => {
                btn.classList.remove('selected');
            });
            // Add selected class to clicked button
            this.classList.add('selected');
            // Store shift type in modal
            document.getElementById('manualCheckInModal').dataset.shiftType = 'A';
        });
    }

    // Shift B button in Manual Check-In modal
    if (shiftBManualBtn) {
        shiftBManualBtn.addEventListener('click', function() {
            // Remove selected class from both buttons
            document.querySelectorAll('#manualCheckInModal .btn-shift').forEach(btn => {
                btn.classList.remove('selected');
            });
            // Add selected class to clicked button
            this.classList.add('selected');
            // Store shift type in modal
            document.getElementById('manualCheckInModal').dataset.shiftType = 'B';
        });
    }

    if (manualCheckInForm) {
        manualCheckInForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get date and time from form fields
            const manualDateInput = document.getElementById('manualCheckInDate').value;
            const manualTimeInput = document.getElementById('manualCheckInTime').value;
            const manualNotes = document.getElementById('manualCheckInNotes').value;

            // Get shift type from modal
            const modal = document.getElementById('manualCheckInModal');
            const shiftType = modal ? modal.dataset.shiftType : '';

            // Parse date and time
            const [manualYear, manualMonth, manualDay] = manualDateInput.split('-');
            const [manualHours, manualMinutes] = manualTimeInput.split(':');

            const dateAndTime = `${manualYear}-${manualMonth}-${manualDay} ${manualHours}:${manualMinutes}:00`;

            // Get the submit button to check current state
            const submitBtn = manualCheckInForm.querySelector('button[type="submit"]');
            const isCheckedIn = submitBtn ? submitBtn.dataset.checkedIn === 'true' : false;

            if (!isCheckedIn) {
                // Check-in: Record current date and time
                const recordData = {
                    type: 'manual_checkin',
                    time: `${manualHours}:${manualMinutes}:00`,
                    date: `${manualYear}-${manualMonth}-${manualDay}`,
                    notes: manualNotes,
                    timestamp: new Date().toISOString(),
                    shiftType: 'Normal'
                };

                saveAttendanceRecord(recordData);

                console.log('Manual check-in recorded at:', dateAndTime);

                // Update the submit button text to "Submit Check-Out"
                if (submitBtn) {
                    submitBtn.innerHTML = 'Submit Check-Out';
                    submitBtn.dataset.checkedIn = 'true';
                    submitBtn.classList.add('btn-checkout');
                }

                // Save the date and time to sessionStorage so it persists when reopening the modal
                sessionStorage.setItem('lastManualCheckInDate', `${manualYear}-${manualMonth}-${manualDay}`);
                sessionStorage.setItem('lastManualCheckInTime', `${manualHours}:${manualMinutes}`);
            } else {
                // Check-out: Update the existing record with check-out time
                const recordData = {
                    type: 'checkout',
                    time: `${manualHours}:${manualMinutes}:00`,
                    date: `${manualYear}-${manualMonth}-${manualDay}`,
                    notes: manualNotes,
                    timestamp: new Date().toISOString()
                };

                saveAttendanceRecord(recordData);

                console.log('Manual check-out recorded at:', dateAndTime);

                // Only show Completed status if the selected date is today
                if (submitBtn && isDateToday(`${manualYear}-${manualMonth}-${manualDay}`)) {
                    submitBtn.innerHTML = 'Completed';
                    submitBtn.dataset.checkedIn = 'completed';
                    submitBtn.classList.remove('btn-checkout');
                    submitBtn.classList.add('btn-completed');
                    submitBtn.disabled = true;
                    
                    // Keep the date/time in sessionStorage so it remains available for next opening
                    sessionStorage.setItem('lastManualCheckInDate', `${manualYear}-${manualMonth}-${manualDay}`);
                    sessionStorage.setItem('lastManualCheckInTime', `${manualHours}:${manualMinutes}`);
                } else if (submitBtn) {
                    // For past or future dates, reset to allow more entries
                    submitBtn.innerHTML = 'Submit Check-In';
                    submitBtn.dataset.checkedIn = 'false';
                    submitBtn.classList.remove('btn-checkout', 'btn-completed');
                    submitBtn.disabled = false;
                    
                    // Keep the date/time in sessionStorage for next opening
                    sessionStorage.setItem('lastManualCheckInDate', `${manualYear}-${manualMonth}-${manualDay}`);
                    sessionStorage.setItem('lastManualCheckInTime', `${manualHours}:${manualMinutes}`);
                }
            }

            // Keep Staff Portal buttons consistent after this state change.
            syncStaffPortalAttendanceButtonsFromStorage();

            closeModal('manualCheckInModal');
        });
    }

    // Overnight Modal
    const closeOvernightModal = document.getElementById('closeOvernightModal');
    const cancelOvernightBtn = document.getElementById('cancelOvernightBtn');
    const overnightForm = document.getElementById('overnightForm');

    if (closeOvernightModal) {
        closeOvernightModal.addEventListener('click', function() {
            closeModal('overnightModal');
        });
    }

    if (cancelOvernightBtn) {
        cancelOvernightBtn.addEventListener('click', function() {
            closeModal('overnightModal');
        });
    }

    // Shift A button in Overnight modal
    const shiftAOvernightBtn = document.getElementById('shiftAOvernightBtn');
    if (shiftAOvernightBtn) {
        shiftAOvernightBtn.addEventListener('click', function() {
            // Remove selected class from both buttons
            document.querySelectorAll('#overnightModal .btn-shift').forEach(btn => {
                btn.classList.remove('selected');
            });
            // Add selected class to clicked button
            this.classList.add('selected');
            // Store shift type in modal
            document.getElementById('overnightModal').dataset.shiftType = 'A';
        });
    }

    // Shift B button in Overnight modal
    const shiftBOvernightBtn = document.getElementById('shiftBOvernightBtn');
    if (shiftBOvernightBtn) {
        shiftBOvernightBtn.addEventListener('click', function() {
            // Remove selected class from both buttons
            document.querySelectorAll('#overnightModal .btn-shift').forEach(btn => {
                btn.classList.remove('selected');
            });
            // Add selected class to clicked button
            this.classList.add('selected');
            // Store shift type in modal
            document.getElementById('overnightModal').dataset.shiftType = 'B';
        });
    }

    if (overnightForm) {
        overnightForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get date and time from form fields
            const shiftDateInput = document.getElementById('shiftDate').value;
            const shiftCheckInTimeInput = document.getElementById('shiftCheckInTime').value;
            const shiftCheckOutDateInput = document.getElementById('shiftCheckOutDate').value;
            const shiftCheckOutTimeInput = document.getElementById('shiftCheckOutTime').value;
            const shiftNotes = document.getElementById('shiftNotes').value;

            // Get shift type from modal
            const modal = document.getElementById('overnightModal');
            const shiftType = modal ? modal.dataset.shiftType : '';

            // Parse date and times
            const [shiftYear, shiftMonth, shiftDay] = shiftDateInput.split('-');
            const [checkInHours, checkInMinutes] = shiftCheckInTimeInput.split(':');

            // Get the submit button to check current state
            const submitBtn = overnightForm.querySelector('button[type="submit"]');
            const isCheckedIn = submitBtn ? submitBtn.dataset.checkedIn === 'true' : false;

            if (!isCheckedIn) {
                // Check-in: Record current date and time
                const dateAndTime = `${shiftYear}-${shiftMonth}-${shiftDay} ${checkInHours}:${checkInMinutes}:00`;

                // Save to attendance data with check-in time
                const recordData = {
                    type: 'shift_checkin',
                    time: `${checkInHours}:${checkInMinutes}:00`,
                    date: `${shiftYear}-${shiftMonth}-${shiftDay}`,
                    notes: shiftNotes,
                    timestamp: new Date().toISOString(),
                    shiftType: 'B'
                };

                saveAttendanceRecord(recordData);

                console.log('Shift check-in recorded at:', dateAndTime);

                // Update the submit button text to "Submit Check-Out"
                if (submitBtn) {
                    submitBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Submit Check-Out';
                    submitBtn.dataset.checkedIn = 'true';
                    submitBtn.classList.add('btn-checkout');
                }

                // Show the check-out time field and auto-populate with current time
                document.getElementById('checkOutDateGroup').style.display = 'block';
                document.getElementById('checkOutTimeGroup').style.display = 'block';

                // Default check-out date to next day, but allow user to change it.
                const defaultNextDay = new Date(parseInt(shiftYear, 10), parseInt(shiftMonth, 10) - 1, parseInt(shiftDay, 10));
                defaultNextDay.setDate(defaultNextDay.getDate() + 1);
                const defaultCheckOutDate = `${defaultNextDay.getFullYear()}-${String(defaultNextDay.getMonth() + 1).padStart(2, '0')}-${String(defaultNextDay.getDate()).padStart(2, '0')}`;
                const checkOutDateInput = document.getElementById('shiftCheckOutDate');
                if (checkOutDateInput) {
                    checkOutDateInput.value = defaultCheckOutDate;
                }
                
                // Auto-populate check-out time with current time
                const now = new Date();
                const currentHours = String(now.getHours()).padStart(2, '0');
                const currentMinutes = String(now.getMinutes()).padStart(2, '0');
                const currentTime = `${currentHours}:${currentMinutes}`;
                const checkOutTimeInput = document.getElementById('shiftCheckOutTime');
                if (checkOutTimeInput) {
                    checkOutTimeInput.value = currentTime;
                }
                
                // Save state to sessionStorage before closing
                const state = {
                    buttonLabel: submitBtn.innerHTML,
                    checkedIn: 'true',
                    buttonClass: 'btn-checkout',
                    disabled: false,
                    shiftDate: shiftDateInput,
                    shiftCheckInTime: shiftCheckInTimeInput,
                    shiftCheckOutDate: defaultCheckOutDate,
                    shiftCheckOutTime: currentTime,
                    shiftNotes: shiftNotes,
                    shiftType: shiftType
                };
                sessionStorage.setItem('overnightShiftState', JSON.stringify(state));
                
                // Close the modal after check-in
                closeModal('overnightModal');
            } else {
                // Check-out: Update the existing record with check-out time
                if (!shiftCheckOutDateInput) {
                    alert('Please select a check-out date.');
                    return;
                }
                if (!shiftCheckOutTimeInput) {
                    alert('Please enter a check-out time.');
                    return;
                }

                const [checkOutHours, checkOutMinutes] = shiftCheckOutTimeInput.split(':');

                // Use the selected check-out date directly (do not auto-add 1 day)
                const [checkOutYear, checkOutMonth, checkOutDay] = shiftCheckOutDateInput.split('-');

                const dateAndTime = `${checkOutYear}-${checkOutMonth}-${checkOutDay} ${checkOutHours}:${checkOutMinutes}:00`;

                // Find the most recent shift check-in record without a checkout time
                const attendancePrefix = getAttendanceRecordKeyPrefix();
                const allRecords = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key.startsWith(attendancePrefix)) {
                        const rec = JSON.parse(localStorage.getItem(key));
                        allRecords.push({ key, ...rec });
                    }
                }

                // Sort by timestamp (newest first)
                allRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                // Find the most recent shift check-in without checkout time
                const checkInRecord = allRecords.find(r =>
                    r.type === 'shift_checkin' && !r.checkoutTime
                );

                if (checkInRecord) {
                    // Update existing record with checkout time
                    checkInRecord.checkoutTime = `${checkOutHours}:${checkOutMinutes}:00`;
                    checkInRecord.checkoutDate = `${checkOutYear}-${checkOutMonth}-${checkOutDay}`;
                    checkInRecord.notes = shiftNotes || checkInRecord.notes;
                    localStorage.setItem(checkInRecord.key, JSON.stringify(checkInRecord));

                    // Reload attendance table to show updated record
                    loadSavedAttendanceData();
                    
                    // Also update the current month summary
                    const summaryMonth = document.getElementById('summaryMonth');
                    const summaryYear = document.getElementById('summaryYear');
                    if (summaryMonth && summaryYear) {
                        calculateMonthlySummary(summaryMonth.value, summaryYear.value);
                    }
                    
                    // Also update the yearly summary
                    const yearlyYear = document.getElementById('yearlyYear');
                    if (yearlyYear) {
                        calculateYearlySummary(yearlyYear.value);
                    }

                    console.log('Shift check-out recorded at:', dateAndTime);

                    // Only show Completed status if the checkout date is today
                    const isCheckOutToday = isDateToday(`${checkOutYear}-${checkOutMonth}-${checkOutDay}`);
                    
                    if (submitBtn && isCheckOutToday) {
                        submitBtn.innerHTML = '<i class="fas fa-check"></i> Completed';
                        submitBtn.dataset.checkedIn = 'completed';
                        submitBtn.classList.remove('btn-checkout');
                        submitBtn.classList.add('btn-completed');
                        submitBtn.disabled = true;
                        
                        // Save the completed state to sessionStorage
                        const completedState = {
                            buttonLabel: submitBtn.innerHTML,
                            checkedIn: 'completed',
                            buttonClass: 'btn-completed',
                            disabled: true,
                            shiftDate: shiftDateInput,
                            shiftCheckInTime: shiftCheckInTimeInput,
                            shiftCheckOutDate: shiftCheckOutDateInput,
                            shiftCheckOutTime: shiftCheckOutTimeInput,
                            shiftNotes: shiftNotes,
                            shiftType: shiftType
                        };
                        sessionStorage.setItem('overnightShiftState', JSON.stringify(completedState));
                    } else if (submitBtn) {
                        // For past or future checkout dates, allow user to continue
                        submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Submit Check-In';
                        submitBtn.dataset.checkedIn = 'false';
                        submitBtn.classList.remove('btn-checkout', 'btn-completed');
                        submitBtn.disabled = false;
                        
                        // Reset state to allow further edits
                        const resetState = {
                            buttonLabel: submitBtn.innerHTML,
                            checkedIn: 'false',
                            buttonClass: '',
                            disabled: false,
                            shiftDate: shiftDateInput,
                            shiftCheckInTime: shiftCheckInTimeInput,
                            shiftCheckOutDate: shiftCheckOutDateInput,
                            shiftCheckOutTime: shiftCheckOutTimeInput,
                            shiftNotes: shiftNotes,
                            shiftType: shiftType
                        };
                        sessionStorage.setItem('overnightShiftState', JSON.stringify(resetState));
                    }
                    
                    // Close modal after check-out is completed
                    closeModal('overnightModal');
                } else {
                    console.error('No matching check-in record found for check-out');
                    alert('No matching check-in record found. Please check-in first.');
                }
            }
        });
    }

    // Edit OT Modal
    const editOTModal = document.getElementById('editOTModal');
    const closeEditOTModal = document.getElementById('closeEditOTModal');
    const cancelEditOTBtn = document.getElementById('cancelEditOTBtn');
    const editOTForm = document.getElementById('editOTForm');
    const otStartTime = document.getElementById('otStartTime');
    const otCheckOut = document.getElementById('otCheckOut');
    const otRate = document.getElementById('otRate');
    const otHours = document.getElementById('otHours');

    if (closeEditOTModal) {
        closeEditOTModal.addEventListener('click', function() {
            if (editOTModal) {
                editOTModal.style.display = 'none';
            }
        });
    }

    if (cancelEditOTBtn) {
        cancelEditOTBtn.addEventListener('click', function() {
            if (editOTModal) {
                editOTModal.style.display = 'none';
            }
        });
    }

    // Calculate OT hours when start time changes
    if (otStartTime) {
        otStartTime.addEventListener('change', function() {
            calculateOTHours();
        });
        otStartTime.addEventListener('input', function() {
            calculateOTHours();
        });
    }

    // Recalculate OT pay when rate changes
    if (otRate) {
        otRate.addEventListener('change', function() {
            calculateOTPay();
        });
    }

    // Recalculate OT pay when OT hours change
    if (otHours) {
        otHours.addEventListener('change', function() {
            calculateOTPay();
        });
        otHours.addEventListener('input', function() {
            calculateOTPay();
        });
    }

    // Recalculate OT pay when basic salary changes (in case user manually edits it)
    const otBasicSalary = document.getElementById('otBasicSalary');
    if (otBasicSalary) {
        otBasicSalary.addEventListener('change', function() {
            calculateOTPay();
        });
        otBasicSalary.addEventListener('input', function() {
            calculateOTPay();
        });
    }

    // Handle form submission
    if (editOTForm) {
        editOTForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get the record timestamp from the OT rate field
            const otRate = document.getElementById('otRate');
            const recordTimestamp = otRate ? otRate.dataset.recordTimestamp : null;

            if (!recordTimestamp) {
                alert('Error: Could not find record');
                return;
            }

            // Save OT details (in a real app, this would be sent to a server)
            const otDetails = {
                otStartTime: document.getElementById('otStartTime').value,
                otRate: document.getElementById('otRate').value,
                otHours: document.getElementById('otHours').value,
                otPayAmount: document.getElementById('otPayAmount').value
            };

            // Store OT details in localStorage
            localStorage.setItem(getOTStorageKey(recordTimestamp), JSON.stringify(otDetails));

            // Show success message
            alert('OT details saved successfully!');

            // Close modal
            if (editOTModal) {
                editOTModal.style.display = 'none';
            }

            // Refresh attendance table immediately without page reload
            loadSavedAttendanceData();

            // Refresh OT tables to keep OT Form/Approval in sync
            refreshOtTables();
            
            // Update dashboard summaries automatically (with slight delay to ensure data is processed)
            setTimeout(() => {
                console.log(`[editOTForm] Calling updateDashboardSummaries after loadSavedAttendanceData`);
                updateDashboardSummaries();
            }, 100);
        });
    }

    // Initialize OT tables (Form & Approval)
    initializeOtTables();

    // Close modals when clicking outside
    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
}

// Initialize Documents Tabs
function initializeDocumentsTabs() {
    // Support multiple tab groups (Staff Portal + Reports) without interference.
    const tabGroups = document.querySelectorAll('.documents-tabs');

    tabGroups.forEach(group => {
        const scope = group.closest('.page-section') || document;
        const tabButtons = group.querySelectorAll('.documents-tab-button');
        if (!tabButtons.length) return;

        tabButtons.forEach(button => {
            if (button.dataset.documentsTabBound === 'true') return;
            button.dataset.documentsTabBound = 'true';

            button.addEventListener('click', function() {
                const tabName = this.getAttribute('data-tab');

                // Remove active class from this group's buttons
                tabButtons.forEach(btn => btn.classList.remove('active'));

                // Remove active class from this section's tab contents
                scope.querySelectorAll('.documents-tab-content').forEach(content => {
                    content.classList.remove('active');
                });

                // Add active class to clicked button and corresponding content within scope
                this.classList.add('active');
                const activeTab = tabName ? document.getElementById(tabName) : null;
                if (activeTab && scope.contains(activeTab)) {
                    activeTab.classList.add('active');
                }
            });
        });
    });
}

// =============================
// Reports Page (Reports Section)
// =============================

function initializeReportsPage() {
    const reportPeriodTypeEl = document.getElementById('reportPeriodType');
    const reportMonthEl = document.getElementById('reportMonth');
    const reportMonthGroupEl = document.getElementById('reportMonthGroup');
    const reportYearEl = document.getElementById('reportYear');
    const reportSummaryYearEl = document.getElementById('reportSummaryYear');

    // Reports UI only exists in index.html (safe to skip for other pages).
    if (!reportYearEl) return;

    // Populate years (reuse existing helper used by Export).
    populateYearOptions(reportYearEl, 2020, 2050);
    if (reportSummaryYearEl) {
        populateYearOptions(reportSummaryYearEl, 2020, 2050);
    }

    const now = new Date();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentYear = String(now.getFullYear());

    if (reportPeriodTypeEl) reportPeriodTypeEl.value = 'monthly';
    if (reportMonthEl) reportMonthEl.value = currentMonth;
    reportYearEl.value = currentYear;
    if (reportSummaryYearEl) reportSummaryYearEl.value = currentYear;

    const syncPeriodUi = () => {
        const isYearly = reportPeriodTypeEl && reportPeriodTypeEl.value === 'yearly';
        if (reportMonthGroupEl) {
            reportMonthGroupEl.style.display = isYearly ? 'none' : '';
        }
    };

    const rerender = () => {
        syncPeriodUi();

        const periodType = reportPeriodTypeEl ? reportPeriodTypeEl.value : 'monthly';
        const month = reportMonthEl ? reportMonthEl.value : currentMonth;
        const year = reportYearEl.value;

        renderReports(periodType, month, year);
    };

    if (reportPeriodTypeEl && !reportPeriodTypeEl.dataset.reportsBound) {
        reportPeriodTypeEl.dataset.reportsBound = 'true';
        reportPeriodTypeEl.addEventListener('change', rerender);
    }

    if (reportMonthEl && !reportMonthEl.dataset.reportsBound) {
        reportMonthEl.dataset.reportsBound = 'true';
        reportMonthEl.addEventListener('change', rerender);
    }

    if (!reportYearEl.dataset.reportsBound) {
        reportYearEl.dataset.reportsBound = 'true';
        reportYearEl.addEventListener('change', () => {
            if (reportSummaryYearEl) reportSummaryYearEl.value = reportYearEl.value;
            rerender();
        });
    }

    if (reportSummaryYearEl && !reportSummaryYearEl.dataset.reportsBound) {
        reportSummaryYearEl.dataset.reportsBound = 'true';
        reportSummaryYearEl.addEventListener('change', () => {
            reportYearEl.value = reportSummaryYearEl.value;
            rerender();
        });
    }

    // Ensure latest data is shown when the user navigates to Reports.
    const sidebarReports = document.getElementById('sidebarReports');
    if (sidebarReports && sidebarReports.dataset.reportsRenderBound !== 'true') {
        sidebarReports.dataset.reportsRenderBound = 'true';
        sidebarReports.addEventListener('click', function() {
            rerender();
        });
    }

    rerender();
}

function renderReports(periodType, month, year) {
    renderReportsOtCalculation(periodType, month, year);
    renderReportsSummaryTotals(year);
}

function renderReportsOtCalculation(periodType, month, year) {
    const periodLabelEl = document.getElementById('reportsOtPeriodLabel');
    const recordCountEl = document.getElementById('reportsOtRecordCount');

    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(text);
    };

    const formatHours = (n) => `${(Number.isFinite(n) ? n : 0).toFixed(2)}h`;
    const formatMoney = (n) => `RM ${(Number.isFinite(n) ? n : 0).toFixed(2)}`;

    const parseNumber = (value) => {
        const s = String(value ?? '').replace(/,/g, '');
        const match = s.match(/-?\d+(?:\.\d+)?/);
        return match ? parseFloat(match[0]) : 0;
    };

    const parseRate = (value) => {
        const n = parseNumber(value);
        if (Math.abs(n - 1.5) < 0.01) return 1.5;
        if (Math.abs(n - 2.0) < 0.01) return 2.0;
        if (Math.abs(n - 3.0) < 0.01) return 3.0;
        return null;
    };

    const parseHours = (value) => {
        const s = String(value ?? '').trim();
        if (!s || s === '-') return 0;

        // Support patterns like "2h 30m".
        const hMatch = s.match(/(\d+(?:\.\d+)?)\s*h/i);
        const mMatch = s.match(/(\d+)\s*m/i);
        if (hMatch) {
            const h = parseFloat(hMatch[1]) || 0;
            const m = mMatch ? (parseFloat(mMatch[1]) || 0) : 0;
            return h + (m / 60);
        }

        // Support HH:MM
        const colon = s.match(/^\s*(\d+)\s*:\s*(\d+)\s*$/);
        if (colon) {
            const h = parseInt(colon[1], 10) || 0;
            const m = parseInt(colon[2], 10) || 0;
            return h + (m / 60);
        }

        return parseNumber(s);
    };

    const buckets = {
        1.5: { count: 0, hours: 0, pay: 0 },
        2.0: { count: 0, hours: 0, pay: 0 },
        3.0: { count: 0, hours: 0, pay: 0 },
        total: { count: 0, hours: 0, pay: 0 }
    };

    const yearKey = String(year);
    const monthKey = String(month).padStart(2, '0');
    const effectivePeriodType = periodType === 'yearly' ? 'yearly' : 'monthly';
    const prefix = effectivePeriodType === 'yearly'
        ? `${yearKey}-`
        : `${yearKey}-${monthKey}`;

    const label = effectivePeriodType === 'yearly'
        ? yearKey
        : `${getReportsMonthName(monthKey)} ${yearKey}`;

    if (periodLabelEl) periodLabelEl.textContent = label;

    const allRows = buildAttendanceExportRows();
    const rows = (allRows || [])
        .filter(r => r && typeof r.date === 'string' && r.date.startsWith(prefix))
        .filter(r => (r.shift || '') !== 'Leave')
        .filter(r => {
            const hasOtStart = String(r.otStart || '').trim() !== '';
            const hasOtDuration = String(r.otDuration || '').trim() !== '';
            const hasOtPay = String(r.otPay || '').trim() !== '';
            return hasOtStart || hasOtDuration || hasOtPay;
        });

    if (recordCountEl) recordCountEl.textContent = String(rows.length);

    rows.forEach(r => {
        let rate = parseRate(r.otRate);
        if (!rate && typeof getOTRateForDate === 'function') {
            const auto = getOTRateForDate(r.date, r.notes || '');
            rate = parseRate(auto);
        }

        const hours = parseHours(r.otDuration);
        const pay = parseNumber(r.otPay);

        buckets.total.count += 1;
        buckets.total.hours += hours;
        buckets.total.pay += pay;

        if (rate && buckets[rate]) {
            buckets[rate].count += 1;
            buckets[rate].hours += hours;
            buckets[rate].pay += pay;
        }
    });

    setText('reportsOtRate15Count', buckets[1.5].count);
    setText('reportsOtRate15Hours', formatHours(buckets[1.5].hours));
    setText('reportsOtRate15Pay', formatMoney(buckets[1.5].pay));

    setText('reportsOtRate20Count', buckets[2.0].count);
    setText('reportsOtRate20Hours', formatHours(buckets[2.0].hours));
    setText('reportsOtRate20Pay', formatMoney(buckets[2.0].pay));

    setText('reportsOtRate30Count', buckets[3.0].count);
    setText('reportsOtRate30Hours', formatHours(buckets[3.0].hours));
    setText('reportsOtRate30Pay', formatMoney(buckets[3.0].pay));

    setText('reportsOtGrandCount', buckets.total.count);
    setText('reportsOtGrandHours', formatHours(buckets.total.hours));
    setText('reportsOtGrandPay', formatMoney(buckets.total.pay));
}

function renderReportsSummaryTotals(year) {
    const tbody = document.getElementById('reportsSummaryTotalsBody');
    if (!tbody) return;

    const yearKey = String(year);
    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

    let totalMc = 0;
    let totalAl = 0;
    let totalEl = 0;
    let totalLate = 0;
    let totalHalfday = 0;

    let html = '';
    months.forEach(m => {
        const counts = getReportsMonthlyCategoryCounts(m, yearKey);
        totalMc += counts.mc;
        totalAl += counts.al;
        totalEl += counts.el;
        totalLate += counts.late;
        totalHalfday += counts.halfday;

        html += `
            <tr>
                <td>${getReportsMonthName(m)}</td>
                <td>${counts.mc}</td>
                <td>${counts.al}</td>
                <td>${counts.el}</td>
                <td>${counts.late}</td>
                <td>${counts.halfday}</td>
            </tr>
        `;
    });

    html += `
        <tr style="font-weight: 700;">
            <td>Total (${yearKey})</td>
            <td>${totalMc}</td>
            <td>${totalAl}</td>
            <td>${totalEl}</td>
            <td>${totalLate}</td>
            <td>${totalHalfday}</td>
        </tr>
    `;

    tbody.innerHTML = html;
}

function getReportsMonthlyCategoryCounts(month, year) {
    const ymPrefix = `${String(year)}-${String(month).padStart(2, '0')}`;
    const allRows = buildAttendanceExportRows();
    const rows = (allRows || []).filter(r => r && typeof r.date === 'string' && r.date.startsWith(ymPrefix));

    let mc = 0;
    let al = 0;
    let el = 0;
    let late = 0;
    let halfday = 0;

    rows.forEach(r => {
        const shift = String(r.shift || '');
        const notes = String(r.notes || '');

        if (shift === 'Leave') {
            if (/^\s*mc\b/i.test(notes)) mc += 1;
            else if (/^\s*al\b/i.test(notes)) al += 1;
            else if (/^\s*el\b/i.test(notes)) el += 1;
            return;
        }

        if (/\bhalf\s*day\b/i.test(notes) || /\bhalfday\b/i.test(notes)) {
            halfday += 1;
            return;
        }

        if (/\blate\b/i.test(notes)) {
            late += 1;
        }
    });

    return { mc, al, el, late, halfday };
}

function getReportsMonthName(month) {
    const key = String(month).padStart(2, '0');
    const map = {
        '01': 'January',
        '02': 'February',
        '03': 'March',
        '04': 'April',
        '05': 'May',
        '06': 'June',
        '07': 'July',
        '08': 'August',
        '09': 'September',
        '10': 'October',
        '11': 'November',
        '12': 'December'
    };
    return map[key] || key;
}

// Display Profile Name
function displayProfileName() {
    const profileNameDisplay = document.getElementById('profileNameDisplay');
    if (!profileNameDisplay) return;

    // Get current user from session storage
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    
    // Display the user's full name from profile, fallback to username
    const displayName = currentUser.name || currentUser.username || '';
    profileNameDisplay.textContent = displayName;
}

// Language Dropdown Initialization
function initializeLanguageDropdown() {
    const languageBtn = document.getElementById('languageBtn');
    const languageMenu = document.getElementById('languageMenu');
    const langItems = document.querySelectorAll('.dropdown-item[data-lang]');

    if (!languageBtn || !languageMenu) {
        console.warn('Language dropdown elements not found');
        return;
    }

    // Toggle dropdown
    languageBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        languageMenu.classList.toggle('show');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function() {
        languageMenu.classList.remove('show');
    });

    // Handle language selection
    langItems.forEach(item => {
        item.addEventListener('click', function() {
            const lang = this.getAttribute('data-lang');
            console.log('Language selected:', lang);
            // Implement language change logic here
        });
    });
}

// Theme Toggle Initialization
function initializeThemeToggle() {
    const themeToggle = document.getElementById('themeToggleBtn');
    const themeIcon = themeToggle ? themeToggle.querySelector('i') : null;

    if (!themeToggle) {
        console.warn('Theme toggle button not found');
        return;
    }

    // Load saved theme preference (user-scoped by userId)
    const userKey = getAttendanceUserKey();
    const userThemeKey = `theme_${userKey}`;
    const legacyTheme = localStorage.getItem('theme');
    const savedTheme = localStorage.getItem(userThemeKey) || legacyTheme;

    // One-time migration: if legacy theme exists, copy it to the per-user key
    if (!localStorage.getItem(userThemeKey) && legacyTheme) {
        localStorage.setItem(userThemeKey, legacyTheme);
    }
    if (savedTheme === 'dark-theme') {
        document.body.classList.add('dark-theme');
        if (themeIcon) {
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
        }
    }

    // Toggle theme on click
    themeToggle.addEventListener('click', function() {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');

        // Update icon
        if (themeIcon) {
            if (isDark) {
                themeIcon.classList.remove('fa-moon');
                themeIcon.classList.add('fa-sun');
            } else {
                themeIcon.classList.remove('fa-sun');
                themeIcon.classList.add('fa-moon');
            }
        }

        // Save theme preference (user-scoped by userId)
        localStorage.setItem(userThemeKey, isDark ? 'dark-theme' : 'light-theme');
    });
}

// Logout Initialization
function initializeLogout() {
    const logoutBtn = document.getElementById('logoutBtn');

    if (!logoutBtn) {
        console.warn('Logout button not found');
        return;
    }

    logoutBtn.addEventListener('click', function() {
        // Confirm logout
        if (confirm('Are you sure you want to logout?')) {
            // Clear user-scoped data for this user (per-user isolation by userId)
            const userKey = getAttendanceUserKey();
            localStorage.removeItem(`userPreferences_${userKey}`);
            localStorage.removeItem('appSettings');

            // Clear session storage (prevents user-specific draft state from bleeding between logins)
            sessionStorage.clear();

            // Redirect to login page
            window.location.href = 'login.html';
        }
    });
}

// Settings Page Initialization
function initializeSettingsPage() {
    const settingsForm = document.getElementById('settingsForm');

    if (!settingsForm) {
        console.warn('Settings form not found');
        return;
    }

    // Load saved settings
    const savedSettings = localStorage.getItem('appSettings');
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            // Apply saved settings to form
            Object.keys(settings).forEach(key => {
                const input = settingsForm.querySelector(`[name="${key}"]`);
                if (input) {
                    input.value = settings[key];
                }
            });
        } catch (e) {
            console.error('Error parsing saved settings:', e);
        }
    }

    // Save settings on form submit
    settingsForm.addEventListener('submit', function(e) {
        e.preventDefault();

        const formData = new FormData(settingsForm);
        const settings = {};

        formData.forEach((value, key) => {
            settings[key] = value;
        });

        localStorage.setItem('appSettings', JSON.stringify(settings));
        console.log('Settings saved:', settings);

        // Show success message
        alert('Settings saved successfully!');
    });
}

// Load User Preferences
function loadUserPreferences() {
    const userKey = getAttendanceUserKey();
    const scopedPreferencesKey = `userPreferences_${userKey}`;
    const legacyPreferences = localStorage.getItem('userPreferences');
    const preferences = localStorage.getItem(scopedPreferencesKey) || legacyPreferences;

    // One-time migration: if legacy prefs exist, copy them to the per-user key
    if (!localStorage.getItem(scopedPreferencesKey) && legacyPreferences) {
        localStorage.setItem(scopedPreferencesKey, legacyPreferences);
    }
    if (preferences) {
        try {
            const prefs = JSON.parse(preferences);
            console.log('User preferences loaded:', prefs);
            // Apply preferences
        } catch (e) {
            console.error('Error parsing user preferences:', e);
        }
    }
}

// User Management Functions
function loadUsers() {
    const usersTableBody = document.getElementById('usersTableBody');
    if (!usersTableBody) return;

    // Get users from localStorage
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const userAccess = JSON.parse(localStorage.getItem('userAccess') || '{}');
    const roleAccess = JSON.parse(localStorage.getItem('roleAccess') || '{}');

    // Clear existing table rows
    usersTableBody.innerHTML = '';

    // Populate table with users
    // "No" is the sequential row number, separate from "User ID" which is user-entered
    users.forEach((user, index) => {
        const username = user.username || '';
        const role = user.role || '';

        const statusValue = (user.status !== undefined && user.status !== null) ? user.status : 'Active';
        const statusText = (typeof statusValue === 'string')
            ? statusValue.trim()
            : (statusValue === false ? 'Inactive' : 'Active');
        const isActive = statusText.toLowerCase() === 'active';

        const statusBadge = isActive
            ? '<span class="badge badge-active">Active</span>'
            : '<span class="badge" style="background-color:#f8d7da; color:#721c24;">Inactive</span>';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${user.userId}</td>
            <td>${user.username}</td>
            <td>${user.email}</td>
            <td>${user.role}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn btn-sm btn-edit" onclick="editUser(${index})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-delete" onclick="deleteUser(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        usersTableBody.appendChild(row);
    });
}

// CSV Import Helpers (User Management)
function parseCsvTextToRows(csvText) {
    if (typeof csvText !== 'string') return [];

    const text = csvText.replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
            continue;
        }

        if (ch === '"') {
            inQuotes = true;
            continue;
        }

        if (ch === ',') {
            row.push(field);
            field = '';
            continue;
        }

        if (ch === '\r') {
            continue;
        }

        if (ch === '\n') {
            row.push(field);
            field = '';
            rows.push(row);
            row = [];
            continue;
        }

        field += ch;
    }

    // Push final field/row
    row.push(field);
    rows.push(row);

    // Drop trailing empty row(s) (common when file ends with a newline)
    while (rows.length && rows[rows.length - 1].every(cell => String(cell || '').trim() === '')) {
        rows.pop();
    }

    return rows;
}

function normalizeCsvHeader(header) {
    return String(header || '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '');
}

function getCsvField(row, headerIndexMap, possibleKeys) {
    for (const key of possibleKeys) {
        const idx = headerIndexMap[key];
        if (idx === undefined) continue;

        const val = row && row[idx] !== undefined ? String(row[idx]).trim() : '';
        if (val) return val;
    }
    return '';
}

function importUsersFromCsvText(csvText) {
    if (typeof csvText !== 'string' || !csvText.trim()) {
        alert('CSV file is empty.');
        return;
    }

    const rows = parseCsvTextToRows(csvText);
    if (rows.length < 2) {
        alert('CSV must include a header row and at least one data row.');
        return;
    }

    const headerIndexMap = {};
    rows[0].forEach((header, index) => {
        const key = normalizeCsvHeader(header);
        if (key) headerIndexMap[key] = index;
    });

    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const existingUsernames = new Set(
        users
            .map(u => String(u.username || '').trim().toLowerCase())
            .filter(Boolean)
    );
    const existingUserIds = new Set(
        users
            .map(u => String(u.userId || '').trim().toLowerCase())
            .filter(Boolean)
    );

    const newUsers = [];
    let invalidCount = 0;
    let duplicateCount = 0;

    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.every(cell => String(cell || '').trim() === '')) continue;

        const userId = getCsvField(row, headerIndexMap, ['userid', 'id', 'employeeid', 'staffid']);
        const username = getCsvField(row, headerIndexMap, ['username', 'user', 'login', 'name']);
        const email = getCsvField(row, headerIndexMap, ['email', 'mail', 'emailaddress']);
        const password = getCsvField(row, headerIndexMap, ['password', 'pass', 'pwd']);
        const role = getCsvField(row, headerIndexMap, ['role', 'userrole']);

        if (!userId || !username || !email || !password || !role) {
            invalidCount++;
            continue;
        }

        const usernameKey = username.trim().toLowerCase();
        const userIdKey = userId.trim().toLowerCase();
        if (existingUsernames.has(usernameKey) || existingUserIds.has(userIdKey)) {
            duplicateCount++;
            continue;
        }
        existingUsernames.add(usernameKey);
        existingUserIds.add(userIdKey);

        newUsers.push({
            userId: userId.trim(),
            username: username.trim(),
            email: email.trim(),
            password: password.trim(),
            role: role.trim()
        });
    }

    if (newUsers.length === 0) {
        alert(
            `No users imported.\n\nSkipped: ${duplicateCount} duplicate username/userId(s), ${invalidCount} invalid row(s).\n\nCSV headers supported: userId,username,email,password,role.`
        );
        return;
    }

    const proceed = confirm(
        `Import Users (CSV)\n\nNew users to import: ${newUsers.length}\nSkipped: ${duplicateCount} duplicate username/userId(s), ${invalidCount} invalid row(s)\n\nProceed?`
    );
    if (!proceed) return;

    users.push(...newUsers);
    localStorage.setItem('users', JSON.stringify(users));
    loadUsers();

    alert(`Imported ${newUsers.length} user(s) successfully.`);
}

function editUser(userIndex) {
    // Get users from localStorage
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    
    if (userIndex < 0 || userIndex >= users.length) {
        alert('User not found');
        return;
    }
    
    const user = users[userIndex];

    // Get edit user modal elements
    const editUserModal = document.getElementById('editUserModal');
    const editUserId = document.getElementById('editUserId');
    const editUsername = document.getElementById('editUsername');
    const editEmail = document.getElementById('editEmail');
    const editRole = document.getElementById('editRole');

    if (editUserModal && editUsername && editEmail && editRole) {
        // Set user data in form
        editUserId.value = user.userId;
        editUsername.value = user.username;
        editEmail.value = user.email;
        editRole.value = user.role;

        // Show modal
        editUserModal.style.display = 'block';
    } else {
        // Create edit user modal if it doesn't exist
        const modal = document.createElement('div');
        modal.id = 'editUserModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close" id="closeEditUserModal">&times;</span>
                <h3>Edit User</h3>
                <form id="editUserForm">
                    <div class="form-group">
                        <label for="editUserId">User ID:</label>
                        <input type="text" id="editUserId" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label for="editUsername">Username:</label>
                        <input type="text" id="editUsername" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label for="editEmail">Email:</label>
                        <input type="email" id="editEmail" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label for="editPassword">Password:</label>
                        <input type="password" id="editPassword" class="form-control" placeholder="Leave blank to keep current password">
                    </div>
                    <div class="form-group">
                        <label for="editStatus">Status:</label>
                        <select id="editStatus" class="form-control" required>
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="editRole">Role:</label>
                        <select id="editRole" class="form-control" required>
                            <option value="User">User</option>
                            <option value="Supervisor">Supervisor</option>
                            <option value="Manager">Manager</option>
                            <option value="Administrator">Administrator</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <button type="submit" class="btn btn-confirm">Save Changes</button>
                        <button type="button" class="btn btn-cancel" id="cancelEditUserBtn">Cancel</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        // Set user data in form
        document.getElementById('editUserId').value = user.userId;
        document.getElementById('editUsername').value = user.username;
        document.getElementById('editEmail').value = user.email;
        document.getElementById('editStatus').value = user.status || 'Active';
        document.getElementById('editRole').value = user.role;

        // Show modal
        modal.style.display = 'block';

        // Add event listeners for close buttons
        document.getElementById('closeEditUserModal').addEventListener('click', function() {
            modal.style.display = 'none';
        });

        document.getElementById('cancelEditUserBtn').addEventListener('click', function() {
            modal.style.display = 'none';
        });

        // Handle form submission
        document.getElementById('editUserForm').addEventListener('submit', function(e) {
            e.preventDefault();

            // Get updated user data
            const newUserId = document.getElementById('editUserId').value.trim();
            const users = JSON.parse(localStorage.getItem('users') || '[]');

            // Check if new User ID already exists (and it's different from the current one)
            // Normalize to avoid false positives from casing/whitespace/type differences.
            const newUserIdKey = String(newUserId || '').trim().toLowerCase();
            const currentUserIdKey = String(user.userId || '').trim().toLowerCase();
            const currentUsernameKey = String(user.username || '').trim().toLowerCase();

            if (newUserIdKey && newUserIdKey !== currentUserIdKey) {
                const userIdExists = (Array.isArray(users) ? users : []).some((u, idx) => {
                    // Exclude the current row (index may drift; also guard by matching original identity).
                    if (idx === userIndex) return false;
                    const uidKey = String(u && u.userId ? u.userId : '').trim().toLowerCase();
                    if (!uidKey) return false;
                    if (uidKey === currentUserIdKey) {
                        const unameKey = String(u && u.username ? u.username : '').trim().toLowerCase();
                        if (unameKey && unameKey === currentUsernameKey) return false;
                    }
                    return uidKey === newUserIdKey;
                });
                if (userIdExists) {
                    alert('User ID already exists. Please use a different User ID.');
                    return;
                }
            }
            
            // Get the new password if provided
            const newPassword = document.getElementById('editPassword').value.trim();
            
            const updatedUser = {
                userId: newUserId,
                username: document.getElementById('editUsername').value,
                email: document.getElementById('editEmail').value,
                role: document.getElementById('editRole').value,
                status: document.getElementById('editStatus').value || user.status || 'Active'
            };
            
            // Only update password if a new one was provided
            if (newPassword) {
                updatedUser.password = newPassword;
            } else {
                // Keep the existing password if no new password was provided
                updatedUser.password = user.password;
            }

            // Update user in array
            users[userIndex] = updatedUser;

            // Save to localStorage
            localStorage.setItem('users', JSON.stringify(users));

            // Ensure this user change is pushed to the DB via the auto sync loop.
            try {
                appSyncDirty.users = true;
                scheduleAppSync('user-management:edit');
            } catch {
                // ignore
            }

            // Reload users table
            loadUsers();

            // Close modal
            modal.style.display = 'none';

            // Show success message
            alert('User updated successfully!');
        });
    }
}

function deleteUser(userIndex) {
    if (confirm('Are you sure you want to delete this user?')) {
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const user = users[userIndex];
        const deletedUserId = user && user.userId ? String(user.userId).trim() : '';

        // Record tombstone so sync doesn't reintroduce this user from the DB.
        if (deletedUserId) {
            try {
                const existing = JSON.parse(localStorage.getItem('deletedUsers') || '[]');
                const arr = Array.isArray(existing) ? existing : [];
                const key = deletedUserId.toLowerCase();
                if (!arr.some((id) => String(id || '').trim().toLowerCase() === key)) {
                    arr.push(deletedUserId);
                    localStorage.setItem('deletedUsers', JSON.stringify(arr));
                }
            } catch {
                localStorage.setItem('deletedUsers', JSON.stringify([deletedUserId]));
            }
        }

        // Remove user and any direct userAccess entry.
        users.splice(userIndex, 1);
        localStorage.setItem('users', JSON.stringify(users));

        if (deletedUserId) {
            try {
                const ua = JSON.parse(localStorage.getItem('userAccess') || '{}');
                if (ua && typeof ua === 'object' && ua[deletedUserId] !== undefined) {
                    delete ua[deletedUserId];
                    localStorage.setItem('userAccess', JSON.stringify(ua));
                }
            } catch {
                // ignore
            }
        }

        // Ensure deletion + userAccess cleanup are pushed to the DB via the auto sync loop.
        try {
            appSyncDirty.users = true;
            appSyncDirty.userAccess = true;
            scheduleAppSync('user-management:delete');
        } catch {
            // ignore
        }
        loadUsers();
    }
}

// Show Add User Modal
function showAddUserModal() {
    // Remove any existing modal to avoid duplicates
    let modal = document.getElementById('addUserModal');
    if (modal) {
        modal.remove();
    }

    // Create new modal
    modal = document.createElement('div');
    modal.id = 'addUserModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close" id="closeAddUserModal">&times;</span>
            <h3>Add New User</h3>
            <form id="addUserForm">
                <div class="form-group">
                    <label for="newUserUserId">User ID <span style="color: red;">*</span>:</label>
                    <input type="text" id="newUserUserId" class="form-control" placeholder="e.g., EMP001" required>
                    <small style="color: #666;">Enter a unique User ID (Note: This is separate from the row number)</small>
                </div>
                <div class="form-group">
                    <label for="newUsername">Username <span style="color: red;">*</span>:</label>
                    <input type="text" id="newUsername" class="form-control" required>
                </div>
                <div class="form-group">
                    <label for="newEmail">Email <span style="color: red;">*</span>:</label>
                    <input type="email" id="newEmail" class="form-control" required>
                </div>
                <div class="form-group">
                    <label for="newPassword">Password <span style="color: red;">*</span>:</label>
                    <input type="password" id="newPassword" class="form-control" placeholder="Enter password" required>
                </div>
                <div class="form-group">
                    <label for="newUserStatus">Status <span style="color: red;">*</span>:</label>
                    <select id="newUserStatus" class="form-control" required>
                        <option value="Active" selected>Active</option>
                        <option value="Inactive">Inactive</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="newRole">Role <span style="color: red;">*</span>:</label>
                    <select id="newRole" class="form-control" required>
                        <option value="">Select Role</option>
                        <option value="User">User</option>
                        <option value="Supervisor">Supervisor</option>
                        <option value="Manager">Manager</option>
                        <option value="Administrator">Administrator</option>
                    </select>
                </div>
                <div class="form-group">
                    <button type="submit" class="btn btn-confirm">Add User</button>
                    <button type="button" class="btn btn-cancel" id="cancelAddUserBtn">Cancel</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    // Show modal
    modal.style.display = 'block';

    // Add event listeners for close buttons
    const closeBtn = document.getElementById('closeAddUserModal');
    const cancelBtn = document.getElementById('cancelAddUserBtn');
    const form = document.getElementById('addUserForm');

    const closeModal = function() {
        modal.remove();
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // Handle form submission
    form.addEventListener('submit', function(e) {
        e.preventDefault();

        const userId = document.getElementById('newUserUserId').value.trim();
        const username = document.getElementById('newUsername').value.trim();
        const email = document.getElementById('newEmail').value.trim();
        const password = document.getElementById('newPassword').value;
        const status = document.getElementById('newUserStatus').value || 'Active';
        const role = document.getElementById('newRole').value;

        // Validate that User ID is not empty
        if (!userId) {
            alert('Please enter a User ID');
            return;
        }

        // If this userId was previously deleted, remove the tombstone (undelete).
        try {
            const existingDeleted = JSON.parse(localStorage.getItem('deletedUsers') || '[]');
            if (Array.isArray(existingDeleted) && existingDeleted.length) {
                const key = userId.toLowerCase();
                const next = existingDeleted.filter((id) => String(id || '').trim().toLowerCase() !== key);
                if (next.length !== existingDeleted.length) {
                    localStorage.setItem('deletedUsers', JSON.stringify(next));
                }
            }
        } catch {
            // ignore
        }

        // Get existing users
        const users = JSON.parse(localStorage.getItem('users') || '[]');

        // Check if User ID already exists and replace if found
        const existingUserIndex = users.findIndex(u => u.userId === userId);
        if (existingUserIndex !== -1) {
            if (confirm(`User ID "${userId}" already exists. Do you want to replace this user?`)) {
                // Replace the existing user
                users[existingUserIndex] = {
                    userId: userId,
                    username: username,
                    email: email,
                    password: password,
                    role: role,
                    status: status
                };
                
                // Save to localStorage
                localStorage.setItem('users', JSON.stringify(users));

                // Ensure this add/replace change is pushed to the DB via the auto sync loop.
                try {
                    appSyncDirty.users = true;
                    scheduleAppSync('user-management:add/replace');
                } catch {
                    // ignore
                }
                
                // Reload users table
                loadUsers();
                
                // Close modal
                closeModal();
                
                // Show success message
                alert('User updated successfully!');
                return;
            } else {
                return; // User chose not to replace
            }
        }

        // Check if Username already exists
        const usernameExists = users.some(u => u.username === username);
        if (usernameExists) {
            alert('Username already exists. Please use a different username.');
            return;
        }

        // Create new user object
        const newUser = {
            userId: userId,
            username: username,
            email: email,
            password: password,
            role: role,
            status: status
        };

        // Add new user to array
        users.push(newUser);

        // Save to localStorage
        localStorage.setItem('users', JSON.stringify(users));

        // Ensure this add is pushed to the DB via the auto sync loop.
        try {
            appSyncDirty.users = true;
            scheduleAppSync('user-management:add');
        } catch {
            // ignore
        }

        // Reload users table
        loadUsers();

        // Close modal
        closeModal();

        // Show success message
        alert('User added successfully!');
    });

    // Close modal when clicking outside
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });
}

// Initialize user management when users tab is clicked
document.addEventListener('DOMContentLoaded', function() {
    // Add User button handler
    const addUserBtn = document.getElementById('addUserBtn');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', function() {
            showAddUserModal();
        });
    }

    // Import Users button handler (CSV)
    const importUsersBtn = document.getElementById('importUsersBtn');
    const importUsersFileInput = document.getElementById('importUsersFileInput');
    if (importUsersBtn && importUsersFileInput) {
        importUsersBtn.addEventListener('click', function() {
            // Reset so selecting the same file twice still triggers change
            importUsersFileInput.value = '';
            importUsersFileInput.click();
        });

        importUsersFileInput.addEventListener('change', function() {
            const file = this.files && this.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(event) {
                const csvText = event && event.target ? String(event.target.result || '') : '';
                importUsersFromCsvText(csvText);
            };
            reader.onerror = function() {
                alert('Error reading CSV file. Please try again.');
            };
            reader.readAsText(file);
        });
    }

    const usersTab = document.querySelector('[data-tab="users-tab"]');
    if (usersTab) {
        usersTab.addEventListener('click', function() {
            loadUsers();
        });
    }

    // Load users when page loads if users tab is active
    const activeUsersTab = document.querySelector('#users-tab.active');
    if (activeUsersTab) {
        loadUsers();
    }

    // Initialize user access control modal
    initializeUserAccessControl();

    // Initialize role-based access control
    initializeRoleAccessControl();
});

// User Access Control Functions
function initializeUserAccessControl() {
    const userAccessModal = document.getElementById('userAccessModal');
    const closeUserAccessModal = document.getElementById('closeUserAccessModal');
    const cancelUserAccessBtn = document.getElementById('cancelUserAccessBtn');
    const userAccessForm = document.getElementById('userAccessForm');

    // Verify modal elements exist
    if (!userAccessModal) {
        console.error('User access modal not found in DOM');
        return;
    }

    // Close modal when clicking the close button or cancel button
    if (closeUserAccessModal) {
        closeUserAccessModal.addEventListener('click', function() {
            userAccessModal.style.display = 'none';
        });
    }

    if (cancelUserAccessBtn) {
        cancelUserAccessBtn.addEventListener('click', function() {
            userAccessModal.style.display = 'none';
        });
    }

    // Handle form submission
    if (userAccessForm) {
        userAccessForm.addEventListener('submit', function(e) {
            e.preventDefault();

            const username = document.getElementById('accessUsername').value;
            const accessSettingsMenu = document.getElementById('accessSettingsMenu').checked;
            const accessSettingsPage = document.getElementById('accessSettingsPage').checked;
            const accessHideSignSv = document.getElementById('accessHideSignSv').checked;

            if (!username) {
                alert('Error: Username not found');
                return;
            }

            // Get existing user access data
            const userAccess = JSON.parse(localStorage.getItem('userAccess') || '{}');

            // Update user access permissions
            // IMPORTANT: key by userId when possible so DB sync stays consistent with FK (dbo.user_access -> dbo.app_users.userId).
            const accessUserKey = document.getElementById('accessUsername')?.dataset?.userKey || resolveUserAccessKey(username);
            userAccess[accessUserKey] = {
                settingsMenu: accessSettingsMenu,
                settingsPage: accessSettingsPage,
                hideSignSv: accessHideSignSv
            };

            // Clean up legacy username-keyed entries when we can resolve to a userId key.
            if (accessUserKey !== username && userAccess[username]) {
                delete userAccess[username];
            }

            // Save updated access permissions
            localStorage.setItem('userAccess', JSON.stringify(userAccess));

            // Show success message
            alert('Access permissions saved successfully!');

            // Close modal
            userAccessModal.style.display = 'none';

            // Apply access control immediately
            applyUserAccessControl();
        });
    } else {
        console.error('User access form not found in DOM');
    }

    // Apply access control on page load
    applyUserAccessControl();
}

// Resolve the canonical key for user-specific access control.
// Prefer the app user's userId (matches DB schema), fall back to username.
function resolveUserAccessKey(username) {
    const u = String(username || '').trim();
    if (!u) return '';

    try {
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        if (Array.isArray(users)) {
            const match = users.find((x) => x && (x.userId === u || x.username === u || String(x.id || '') === u));
            if (match) {
                return String(match.userId || match.username || u);
            }
        }
    } catch {
        // ignore parse errors
    }

    return u;
}

function openUserAccessModal(username) {
    console.log('Opening access modal for user:', username);
    const userAccessModal = document.getElementById('userAccessModal');
    const accessUsername = document.getElementById('accessUsername');
    const accessSettingsMenu = document.getElementById('accessSettingsMenu');
    const accessSettingsPage = document.getElementById('accessSettingsPage');
    const accessHideSignSv = document.getElementById('accessHideSignSv');

    console.log('Modal element:', userAccessModal);
    console.log('Username input:', accessUsername);

    if (userAccessModal && accessUsername && accessSettingsMenu && accessSettingsPage && accessHideSignSv) {
        // Set username
        accessUsername.value = username;

        // Load current access permissions
        const userAccess = JSON.parse(localStorage.getItem('userAccess') || '{}');
        const accessUserKey = resolveUserAccessKey(username);
        // Backward compatible: fall back to username-keyed entries if present.
        const currentUserAccess = userAccess[accessUserKey] || userAccess[username] || {};

        // Store resolved key so submit handler can use it.
        accessUsername.dataset.userKey = accessUserKey;

        // Set checkbox states
        accessSettingsMenu.checked = currentUserAccess.settingsMenu || false;
        accessSettingsPage.checked = currentUserAccess.settingsPage || false;
        accessHideSignSv.checked = currentUserAccess.hideSignSv || false;

        // Show modal
        userAccessModal.style.display = 'block';
    } else {
        console.error('Required modal elements not found');
        alert('Error: Unable to open access control dialog. Please refresh the page.');
    }
}

function applyUserAccessControl() {
    // Get current user
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    const username = currentUser.username;
    const userKey = String(currentUser.userId || username || '').trim();

    if (!userKey) return;

    // Get user access permissions
    const userAccess = JSON.parse(localStorage.getItem('userAccess') || '{}');
    // Prefer userId-keyed access; fall back to legacy username-keyed entries.
    const currentUserAccess = userAccess[userKey] || (username ? userAccess[username] : {}) || {};

    // Apply settings menu visibility
    const sidebarSettings = document.getElementById('sidebarSettings');
    if (sidebarSettings) {
        // Only enforce explicit deny here; role-based access control handles the default allow/deny.
        if (currentUserAccess.settingsMenu === false) {
            sidebarSettings.style.display = 'none';
        } else {
            // Leave visible unless role rules hide it.
            sidebarSettings.style.display = '';
        }
    }

    // Apply settings page access
    const settingsSection = document.getElementById('settingsSection');
    if (settingsSection) {
        // Block access only if explicitly denied (no more deny-on-undefined).
        if (currentUserAccess.settingsPage === false) {
            // Check if user is trying to access settings page
            if (settingsSection.classList.contains('active')) {
                // Show access denied message
                alert('Access Denied: You do not have permission to access the Settings page.');

                // Navigate to dashboard
                const dashboardSection = document.getElementById('dashboardSection');
                const sidebarDashboard = document.getElementById('sidebarDashboard');

                if (dashboardSection) {
                    document.querySelectorAll('.page-section').forEach(section => {
                        section.classList.remove('active');
                    });
                    dashboardSection.classList.add('active');
                }

                if (sidebarDashboard) {
                    document.querySelectorAll('.list-unstyled li').forEach(item => {
                        item.classList.remove('active');
                    });
                    if (sidebarDashboard.parentElement) {
                        sidebarDashboard.parentElement.classList.add('active');
                    }
                }
            }
        }
    }
}

// ========== ROLE-BASED ACCESS CONTROL FUNCTIONS ==========

function initializeRoleAccessControl() {
    const roleAccessControlBtn = document.getElementById('roleAccessControlBtn');
    const roleAccessControlModal = document.getElementById('roleAccessControlModal');
    const closeRoleAccessControlModal = document.getElementById('closeRoleAccessControlModal');
    const closeRoleAccessControlBtn = document.getElementById('closeRoleAccessControlBtn');
    const editRoleAccessModal = document.getElementById('editRoleAccessModal');
    const closeEditRoleAccessModal = document.getElementById('closeEditRoleAccessModal');
    const cancelEditRoleAccessBtn = document.getElementById('cancelEditRoleAccessBtn');
    const editRoleAccessForm = document.getElementById('editRoleAccessForm');

    // Ensure defaults exist (and include any newly added permission flags) before we render/edit.
    initializeDefaultRoleAccess();

    // Open role access control modal
    if (roleAccessControlBtn) {
        roleAccessControlBtn.addEventListener('click', function() {
            if (roleAccessControlModal) {
                loadRoleAccessTable();
                roleAccessControlModal.style.display = 'block';
            }
        });
    }

    // Close role access control modal
    if (closeRoleAccessControlModal) {
        closeRoleAccessControlModal.addEventListener('click', function() {
            roleAccessControlModal.style.display = 'none';
        });
    }

    if (closeRoleAccessControlBtn) {
        closeRoleAccessControlBtn.addEventListener('click', function() {
            roleAccessControlModal.style.display = 'none';
        });
    }

    // Close edit role access modal
    if (closeEditRoleAccessModal) {
        closeEditRoleAccessModal.addEventListener('click', function() {
            editRoleAccessModal.style.display = 'none';
        });
    }

    if (cancelEditRoleAccessBtn) {
        cancelEditRoleAccessBtn.addEventListener('click', function() {
            editRoleAccessModal.style.display = 'none';
        });
    }

    // Handle edit role access form submission
    if (editRoleAccessForm) {
        editRoleAccessForm.addEventListener('submit', function(e) {
            e.preventDefault();

            const role = document.getElementById('editAccessRole').value;
            const settingsMenuAccess = document.getElementById('editAccessSettingsMenu').checked;
            const manualInOutAccess = document.getElementById('editAccessManualInOut').checked;
            const shiftOLockEl = document.getElementById('editAccessShiftOLock');
            const shiftOLockAccess = shiftOLockEl ? shiftOLockEl.checked : false;
            const hideSignSvEl = document.getElementById('editAccessHideSignSv');
            const hideSignSvAccess = hideSignSvEl ? hideSignSvEl.checked : false;

            if (!role) {
                alert('Error: Role not found');
                return;
            }

            // Get existing role access data
            const roleAccess = JSON.parse(localStorage.getItem('roleAccess') || '{}');

            // Update role access permissions
            roleAccess[role] = {
                settingsMenu: settingsMenuAccess,
                manualInOut: manualInOutAccess,
                shiftOLock: shiftOLockAccess,
                hideSignSv: hideSignSvAccess
            };

            // Save updated access permissions
            localStorage.setItem('roleAccess', JSON.stringify(roleAccess));

            // Mark roleAccess as dirty and schedule a sync push so DB stays in lockstep.
            if (typeof appSyncDirty === 'object' && appSyncDirty) {
                appSyncDirty.roleAccess = true;
            }
            if (typeof scheduleAppSync === 'function') {
                scheduleAppSync('roleAccess');
            }

            // Show success message
            alert('Role access permissions saved successfully!');

            // Close modal
            editRoleAccessModal.style.display = 'none';

            // Reload the role access table
            loadRoleAccessTable();

            // Apply role access control to enforce changes immediately
            applyRoleAccessControl();
        });
    }

    // Close modal when clicking outside
    if (roleAccessControlModal) {
        roleAccessControlModal.addEventListener('click', function(e) {
            if (e.target === roleAccessControlModal) {
                roleAccessControlModal.style.display = 'none';
            }
        });
    }

    if (editRoleAccessModal) {
        editRoleAccessModal.addEventListener('click', function(e) {
            if (e.target === editRoleAccessModal) {
                editRoleAccessModal.style.display = 'none';
            }
        });
    }

    // Apply role access control on initialization
    applyRoleAccessControl();
}

function loadRoleAccessTable() {
    const roleAccessTableBody = document.getElementById('roleAccessTableBody');
    if (!roleAccessTableBody) return;

    const roleAccess = JSON.parse(localStorage.getItem('roleAccess') || '{}');

    // Define all available roles
    const allRoles = ['User', 'Supervisor', 'Manager', 'Administrator'];

    // Clear existing table rows
    roleAccessTableBody.innerHTML = '';

    // Populate table with all roles
    allRoles.forEach(role => {
        const row = document.createElement('tr');
        const currentRoleAccess = roleAccess[role] || {};
        
        const settingsMenuBadge = currentRoleAccess.settingsMenu 
            ? '<span class="badge" style="background-color: #d4edda; color: #155724;">✓ Enabled</span>' 
            : '<span class="badge" style="background-color: #f8d7da; color: #721c24;">✗ Disabled</span>';

        // Manual In & Out is treated as enabled unless explicitly disabled (backward-compatible default).
        const manualInOutBadge = (currentRoleAccess.manualInOut !== false)
            ? '<span class="badge" style="background-color: #d4edda; color: #155724;">✓ Enabled</span>'
            : '<span class="badge" style="background-color: #f8d7da; color: #721c24;">✗ Disabled</span>';

        // Shift (Overnight) lock is enabled only when explicitly true.
        const shiftOLockBadge = (currentRoleAccess.shiftOLock === true)
            ? '<span class="badge" style="background-color: #d4edda; color: #155724;">✓ Enabled</span>'
            : '<span class="badge" style="background-color: #f8d7da; color: #721c24;">✗ Disabled</span>';

        const hideSignSvBadge = (currentRoleAccess.hideSignSv === true)
            ? '<span class="badge" style="background-color: #d4edda; color: #155724;">✓ Hidden</span>'
            : '<span class="badge" style="background-color: #f8d7da; color: #721c24;">✗ Shown</span>';

        row.innerHTML = `
            <td><strong>${role}</strong></td>
            <td>${settingsMenuBadge}</td>
            <td>${manualInOutBadge}</td>
            <td>${shiftOLockBadge}</td>
            <td>${hideSignSvBadge}</td>
            <td>
                <button class="btn btn-sm btn-edit" onclick="openEditRoleAccessModal('${role}')">
                    <i class="fas fa-edit"></i> Edit
                </button>
            </td>
        `;
        roleAccessTableBody.appendChild(row);
    });
}

function openEditRoleAccessModal(role) {
    const editRoleAccessModal = document.getElementById('editRoleAccessModal');
    const editAccessRole = document.getElementById('editAccessRole');
    const editAccessSettingsMenu = document.getElementById('editAccessSettingsMenu');
    const editAccessManualInOut = document.getElementById('editAccessManualInOut');
    const editAccessShiftOLock = document.getElementById('editAccessShiftOLock');
    const editAccessHideSignSv = document.getElementById('editAccessHideSignSv');

    if (editRoleAccessModal && editAccessRole && editAccessSettingsMenu && editAccessManualInOut && editAccessShiftOLock && editAccessHideSignSv) {
        // Set role
        editAccessRole.value = role;

        // Load current access permissions
        const roleAccess = JSON.parse(localStorage.getItem('roleAccess') || '{}');
        const currentRoleAccess = roleAccess[role] || {};

        // Set checkbox states
        editAccessSettingsMenu.checked = currentRoleAccess.settingsMenu || false;
        // Enabled unless explicitly disabled
        editAccessManualInOut.checked = currentRoleAccess.manualInOut !== false;
        editAccessShiftOLock.checked = currentRoleAccess.shiftOLock === true;
        editAccessHideSignSv.checked = currentRoleAccess.hideSignSv === true;

        // Show modal
        editRoleAccessModal.style.display = 'block';
    } else {
        console.error('Required modal elements not found');
        alert('Error: Unable to open role access control dialog. Please refresh the page.');
    }
}

// Initialize Default Role Access Control
function initializeDefaultRoleAccess() {
    // Get current role access configuration from localStorage
    const existingRoleAccess = JSON.parse(localStorage.getItem('roleAccess') || '{}');
    
    // Define default permissions for each role
    const defaultRoleAccess = {
        'User': {
            settingsMenu: false,
            manualInOut: true,
            shiftOLock: false,
            hideSignSv: false
        },
        'Supervisor': {
            settingsMenu: false,
            manualInOut: true,
            shiftOLock: false,
            hideSignSv: false
        },
        'Manager': {
            settingsMenu: true,
            manualInOut: true,
            shiftOLock: false,
            hideSignSv: false
        },
        'Administrator': {
            settingsMenu: true,
            manualInOut: true,
            shiftOLock: false,
            hideSignSv: false
        }
    };
    
    // Merge default permissions with existing ones (existing ones take precedence)
    const mergedRoleAccess = { ...defaultRoleAccess };
    
    // Override defaults with any existing custom settings
    Object.keys(existingRoleAccess).forEach(role => {
        if (existingRoleAccess[role]) {
            const base = mergedRoleAccess[role] || {};
            mergedRoleAccess[role] = { ...base, ...existingRoleAccess[role] };
        }
    });
    
    // Save merged role access configuration
    localStorage.setItem('roleAccess', JSON.stringify(mergedRoleAccess));
    
    console.log('Default role access control initialized:', mergedRoleAccess);
}

function applyRoleAccessControl() {
    // Get current user from session storage
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    const userRole = currentUser.role;

    if (!userRole) return;

    // Get role access permissions
    const roleAccess = JSON.parse(localStorage.getItem('roleAccess') || '{}');
    const currentRoleAccess = roleAccess[userRole] || {};

    // Apply settings menu visibility based on role access
    const sidebarSettings = document.getElementById('sidebarSettings');
    if (sidebarSettings) {
        // Show settings menu only if permission is explicitly true
        if (currentRoleAccess.settingsMenu === true) {
            sidebarSettings.style.display = 'block';
        } else {
            // Hide settings menu if permission is false or not configured
            sidebarSettings.style.display = 'none';
        }
    }

    // Apply Manual In & Out visibility (hide manual check-in/out button if explicitly disabled)
    const manualCheckInBtn = document.getElementById('manualCheckInBtn');
    if (manualCheckInBtn) {
        if (currentRoleAccess.manualInOut === false) {
            manualCheckInBtn.style.display = 'none';
        } else {
            manualCheckInBtn.style.display = '';
        }
    }

    // Settings page access follows Settings Menu permission
    const settingsSection = document.getElementById('settingsSection');
    if (settingsSection) {
        // Block access if Settings Menu permission is not true
        if (currentRoleAccess.settingsMenu !== true) {
            // Check if user is trying to access settings page
            if (settingsSection.classList.contains('active')) {
                // Show access denied message
                alert('Access Denied: Your role does not have permission to access the Settings page.');

                // Navigate to dashboard
                const dashboardSection = document.getElementById('dashboardSection');
                const sidebarDashboard = document.getElementById('sidebarDashboard');

                if (dashboardSection) {
                    document.querySelectorAll('.page-section').forEach(section => {
                        section.classList.remove('active');
                    });
                    dashboardSection.classList.add('active');
                }

                if (sidebarDashboard) {
                    document.querySelectorAll('.list-unstyled li').forEach(item => {
                        item.classList.remove('active');
                    });
                    if (sidebarDashboard.parentElement) {
                        sidebarDashboard.parentElement.classList.add('active');
                    }
                }
            }
        }
    }
}

// ========== PROFILE MANAGEMENT ==========

// Initialize profile form
function initializeProfileForm() {
    const profileForm = document.getElementById('profileForm');
    const cancelBtn = document.getElementById('cancelProfileBtn');
    const profileMessage = document.getElementById('profileMessage');

    if (!profileForm) return;

    // Load current user's profile data
    loadUserProfile();

    // Handle form submission
    profileForm.addEventListener('submit', function(e) {
        e.preventDefault();
        saveUserProfile();
    });

    // Handle cancel button
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
            loadUserProfile();
            hideProfileMessage();
        });
    }
}

// Load user profile from localStorage (merged from users array + separate profile storage)
function loadUserProfile() {
    const currentUser = sessionStorage.getItem('currentUser');
    if (!currentUser) {
        showProfileMessage('User not found', 'error');
        return;
    }

    const user = JSON.parse(currentUser);
    const userId = user.userId || user.username;
    
    // Get all users to access basic data
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const userProfile = users.find(u =>
        (user.userId && u.userId === user.userId) ||
        (!user.userId && u.username === user.username)
    );

    // Get separately stored profile data (survives sync operations)
    let savedProfile = null;
    try {
        const allProfiles = JSON.parse(localStorage.getItem('userProfiles') || '{}');
        savedProfile = allProfiles[userId] || null;
    } catch (err) {
        console.warn('Failed to load saved profiles:', err);
    }

    // Merge: saved profile takes priority over synced user data
    const profile = { ...userProfile, ...savedProfile };

    if (profile) {
        document.getElementById('profileName').value = profile.fullName || profile.name || profile.username || '';
        document.getElementById('profileStaffID').value = profile.staffId || '';
        document.getElementById('profileDepartment').value = profile.department || '';
        document.getElementById('profileApprover').value = profile.approver || '';
        document.getElementById('profileSalary').value = profile.basicSalary || '';
        
        // Update display section
        updateProfileDisplay(profile);
    }
}

// Save user profile to localStorage (in separate storage to survive sync)
function saveUserProfile() {
    const currentUser = sessionStorage.getItem('currentUser');
    if (!currentUser) {
        showProfileMessage('User not found', 'error');
        return;
    }

    const user = JSON.parse(currentUser);
    const userId = user.userId || user.username;
    
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const userIndex = users.findIndex(u =>
        (user.userId && u.userId === user.userId) ||
        (!user.userId && u.username === user.username)
    );

    if (userIndex === -1) {
        showProfileMessage('User not found in database', 'error');
        return;
    }

    // Get form values
    const name = document.getElementById('profileName').value.trim();
    const staffId = document.getElementById('profileStaffID').value.trim();
    const department = document.getElementById('profileDepartment').value.trim();
    const approver = document.getElementById('profileApprover').value.trim();
    const salary = document.getElementById('profileSalary').value;

    // Validate inputs
    if (!name || !staffId || !department || !approver || !salary) {
        showProfileMessage('All fields are required', 'error');
        return;
    }

    if (isNaN(salary) || parseFloat(salary) < 0) {
        showProfileMessage('Basic salary must be a valid positive number', 'error');
        return;
    }

    // Store profile data in separate localStorage key (survives sync operations)
    const allProfiles = JSON.parse(localStorage.getItem('userProfiles') || '{}');
    allProfiles[userId] = {
        fullName: name,
        staffId: staffId,
        department: department,
        approver: approver,
        basicSalary: parseFloat(salary),
        updatedAt: new Date().toISOString()
    };
    localStorage.setItem('userProfiles', JSON.stringify(allProfiles));

    // Also update the users array for consistency
    users[userIndex].name = name;
    users[userIndex].staffId = staffId;
    users[userIndex].department = department;
    users[userIndex].approver = approver;
    users[userIndex].basicSalary = parseFloat(salary);
    users[userIndex].updatedAt = new Date().toISOString();

    // Save to localStorage
    localStorage.setItem('users', JSON.stringify(users));

    // Update session storage with new user data
    sessionStorage.setItem('currentUser', JSON.stringify(users[userIndex]));
    
    // Update display section
    updateProfileDisplay(users[userIndex]);

    // Update navbar profile name
    displayProfileName();

    showProfileMessage('Profile updated successfully!', 'success');
}

// Update profile display section
function updateProfileDisplay(userProfile) {
    if (!userProfile) return;
    
    // Check if we have a saved profile first (more recent)
    const currentUser = sessionStorage.getItem('currentUser');
    if (currentUser) {
        const user = JSON.parse(currentUser);
        const userId = user.userId || user.username;
        try {
            const allProfiles = JSON.parse(localStorage.getItem('userProfiles') || '{}');
            const savedProfile = allProfiles[userId];
            if (savedProfile) {
                userProfile = { ...userProfile, ...savedProfile };
            }
        } catch (err) {
            console.warn('Failed to load saved profile for display:', err);
        }
    }
    
    document.getElementById('displayName').textContent = userProfile.fullName || userProfile.name || userProfile.username || '-';
    document.getElementById('displayStaffId').textContent = userProfile.staffId || '-';
    document.getElementById('displayDepartment').textContent = userProfile.department || '-';
    document.getElementById('displayApprover').textContent = userProfile.approver || '-';
    document.getElementById('displaySalary').textContent = userProfile.basicSalary ? `RM ${parseFloat(userProfile.basicSalary).toFixed(2)}` : '-';
}

// Show profile message
function showProfileMessage(message, type) {
    const profileMessage = document.getElementById('profileMessage');
    if (!profileMessage) return;

    profileMessage.textContent = message;
    profileMessage.className = `profile-message ${type}`;

    // Add icon
    const icon = document.createElement('i');
    icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
    profileMessage.insertBefore(icon, profileMessage.firstChild);

    profileMessage.style.display = 'flex';

    // Auto-hide success message after 5 seconds
    if (type === 'success') {
        setTimeout(hideProfileMessage, 5000);
    }
}

// Hide profile message
function hideProfileMessage() {
    const profileMessage = document.getElementById('profileMessage');
    if (profileMessage) {
        profileMessage.style.display = 'none';
    }
}

// Initialize profile form when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeProfileForm();
    initializeBackgroundSettingsForm();
});

// ========== BACKGROUND SETTINGS IN SETTINGS PAGE ==========

// Initialize background settings form in settings page
function initializeBackgroundSettingsForm() {
    const imageUploadSettings = document.getElementById('imageUploadSettings');
    const videoUploadSettings = document.getElementById('videoUploadSettings');
    const backgroundColorSettings = document.getElementById('backgroundColorSettings');
    const resetBackgroundBtn = document.getElementById('resetBackgroundBtn');
    const imageUploadStatus = document.getElementById('imageUploadStatus');
    const videoUploadStatus = document.getElementById('videoUploadStatus');

    if (!imageUploadSettings) return;

    const STATUS_KEYS = {
        image: 'loginBgImageStatus',
        video: 'loginBgVideoStatus'
    };
    const DEFAULT_TEXT = {
        image: 'No image uploaded yet.',
        video: 'No video uploaded yet.'
    };

    const formatFileSize = (bytes) => {
        const size = Number(bytes) || 0;
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
        if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
        return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    };

    const buildStatusText = (payload, fallback) => {
        if (!payload) return fallback;
        const name = payload.name ? String(payload.name) : 'Unknown file';
        const size = payload.size ? formatFileSize(payload.size) : null;
        const timestamp = payload.updatedAt ? new Date(payload.updatedAt) : null;
        const timeText = timestamp && !Number.isNaN(timestamp.getTime())
            ? timestamp.toLocaleString()
            : null;
        const pieces = [`Uploaded: ${name}`];
        if (size) pieces.push(size);
        if (timeText) pieces.push(`at ${timeText}`);
        return pieces.join(' • ');
    };

    const applyStatus = (el, payload, fallback) => {
        if (!el) return;
        const hasPayload = Boolean(payload && payload.name);
        el.textContent = buildStatusText(payload, fallback);
        el.classList.toggle('has-upload', hasPayload);
    };

    const ensureStatusFromData = (type, key, fallback, el) => {
        const bgType = localStorage.getItem('loginBgType');
        const bgData = localStorage.getItem('loginBgData');
        const hasStatus = localStorage.getItem(key);
        if (hasStatus || !bgData || bgType !== type) return;

        // Create a synthesized status payload so the UI shows the last saved file
        // even if the status entry was never created (e.g., from older builds).
        const synthesized = {
            name: type === 'image' ? 'Saved image background' : 'Saved video background',
            size: bgData.length,
            type: bgType,
            updatedAt: new Date().toISOString()
        };
        localStorage.setItem(key, JSON.stringify(synthesized));
        applyStatus(el, synthesized, fallback);
    };

    const loadStatus = (key, fallback, el) => {
        let payload = null;
        const raw = localStorage.getItem(key);
        if (raw) {
            try {
                payload = JSON.parse(raw);
            } catch (e) {
                payload = null;
            }
        }
        applyStatus(el, payload, fallback);
    };

    const saveStatus = (key, payload, fallback, el) => {
        if (!payload) {
            localStorage.removeItem(key);
            applyStatus(el, null, fallback);
            return;
        }
        localStorage.setItem(key, JSON.stringify(payload));
        applyStatus(el, payload, fallback);
    };

    const refreshStatuses = () => {
        loadStatus(STATUS_KEYS.image, DEFAULT_TEXT.image, imageUploadStatus);
        loadStatus(STATUS_KEYS.video, DEFAULT_TEXT.video, videoUploadStatus);

        // Backfill status if background data already exists from an older session/build
        ensureStatusFromData('image', STATUS_KEYS.image, DEFAULT_TEXT.image, imageUploadStatus);
        ensureStatusFromData('video', STATUS_KEYS.video, DEFAULT_TEXT.video, videoUploadStatus);
    };

    refreshStatuses();

    if (imageUploadSettings.dataset.bgStatusBound === 'true') {
        return;
    }
    imageUploadSettings.dataset.bgStatusBound = 'true';
    if (videoUploadSettings) {
        videoUploadSettings.dataset.bgStatusBound = 'true';
    }

    // Handle image upload
    imageUploadSettings.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const statusPayload = {
                name: file.name,
                size: file.size,
                type: file.type,
                updatedAt: new Date().toISOString()
            };
            const reader = new FileReader();
            reader.onload = (event) => {
                // Send to server
                fetch('/api/background', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'image', imageData: event.target.result })
                }).catch(err => console.log('Server sync failed'));
                // Also save to localStorage as fallback
                localStorage.setItem('loginBgType', 'image');
                localStorage.setItem('loginBgData', event.target.result);
                saveStatus(STATUS_KEYS.image, statusPayload, DEFAULT_TEXT.image, imageUploadStatus);
                imageUploadSettings.value = '';
            };
            reader.readAsDataURL(file);
        }
    });

    // Handle video upload
    videoUploadSettings.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const statusPayload = {
                name: file.name,
                size: file.size,
                type: file.type,
                updatedAt: new Date().toISOString()
            };
            const reader = new FileReader();
            reader.onload = (event) => {
                // Send to server
                fetch('/api/background', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'video', videoData: event.target.result })
                }).catch(err => console.log('Server sync failed'));
                // Also save to localStorage as fallback
                localStorage.setItem('loginBgType', 'video');
                localStorage.setItem('loginBgData', event.target.result);
                saveStatus(STATUS_KEYS.video, statusPayload, DEFAULT_TEXT.video, videoUploadStatus);
                videoUploadSettings.value = '';
            };
            reader.readAsDataURL(file);
        }
    });

    // Handle color selection
    backgroundColorSettings.addEventListener('change', (e) => {
        const color = e.target.value;
        // Send to server
        fetch('/api/background', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'color', color: color })
        }).catch(err => console.log('Server sync failed'));
        // Also save to localStorage as fallback
        localStorage.setItem('loginBgType', 'color');
        localStorage.setItem('loginBgColor', color);
    });

    // Handle reset
    if (resetBackgroundBtn) {
        resetBackgroundBtn.addEventListener('click', () => {
            // Send reset to server
            fetch('/api/background/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }).catch(err => console.log('Server sync failed'));
            
            // Clear localStorage as fallback
            localStorage.removeItem('loginBgType');
            localStorage.removeItem('loginBgData');
            localStorage.removeItem('loginBgColor');
            localStorage.removeItem(STATUS_KEYS.image);
            localStorage.removeItem(STATUS_KEYS.video);
            
            // Reset form inputs
            imageUploadSettings.value = '';
            videoUploadSettings.value = '';
            backgroundColorSettings.value = '#667eea';
            refreshStatuses();
        });
    }
}
