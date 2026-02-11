const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const https = require('https');
const sql = require('mssql');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3001;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
const HTTPS_ONLY = String(process.env.HTTPS_ONLY || '').toLowerCase();

const DEFAULT_DB_CONFIG = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'P@ssw0rd6151',
    server: process.env.DB_SERVER || 'localhost',
    port: Number(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME || 'PKNSB',
    options: { encrypt: false, trustServerCertificate: true },
};

const SCHEMA_PATH = path.join(__dirname, 'db', 'schema.sql');

function splitSqlBatches(sqlText) {
    return String(sqlText || '')
        .split(/^\s*GO\s*$/gim)
        .map((s) => s.trim())
        .filter(Boolean);
}

function safeJsonParse(text) {
    if (text == null) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function toIsoString(value) {
    if (!value) return null;
    try {
        const d = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(d.getTime())) return null;
        return d.toISOString();
    } catch {
        return null;
    }
}

function parseDateTime2(value) {
    if (!value) return null;
    try {
        const d = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(d.getTime())) return null;
        return d;
    } catch {
        return null;
    }
}

function escapeDbName(name) {
    // Bracket-escape for SQL Server identifiers.
    return String(name || '').replace(/]/g, ']]');
}

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

const localIP = getLocalIP();

let backgroundData = {
    type: null,
    color: '#667eea',
    imageData: null,
    videoData: null,
};

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path.endsWith('.js') || req.path.endsWith('.css')) {
        res.setHeader('Cache-Control', 'no-store');
    }
    next();
});
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.redirect('/login.html');
});

app.get('/api/background', (req, res) => {
    // Prefer DB-backed background settings when available; fall back to in-memory state.
    withDb((pool) => fetchBackgroundFromDb(pool))
        .then((dbBg) => {
            if (dbBg) {
                backgroundData = { ...backgroundData, ...dbBg };
            }
            res.json(backgroundData);
        })
        .catch(() => {
            res.json(backgroundData);
        });
});

app.post('/api/background', (req, res) => {
    const { type, color, imageData, videoData } = req.body;

    if (type === 'image' && imageData) {
        backgroundData.type = 'image';
        backgroundData.imageData = imageData;
        backgroundData.videoData = null;
    } else if (type === 'video' && videoData) {
        backgroundData.type = 'video';
        backgroundData.videoData = videoData;
        backgroundData.imageData = null;
    } else if (type === 'color' && color) {
        backgroundData.type = 'color';
        backgroundData.color = color;
        backgroundData.imageData = null;
        backgroundData.videoData = null;
    }

    // Persist to DB so it syncs across devices.
    withDb(async (pool) => {
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const t = (type === 'image' || type === 'video' || type === 'color') ? type : null;
            const bgColor = (t === 'color' && color) ? color : null;
            const bgData = (t === 'image' ? imageData : (t === 'video' ? videoData : null)) || null;

            // Upsert settings.
            await new sql.Request(tx)
                .input('t', sql.NVarChar(20), t)
                .query("DELETE FROM dbo.app_settings WHERE [key] IN ('loginBgType') ; INSERT INTO dbo.app_settings ([key],[value],[updated_at]) VALUES ('loginBgType', @t, SYSUTCDATETIME());");

            await new sql.Request(tx)
                .input('c', sql.NVarChar(50), bgColor || '')
                .query("DELETE FROM dbo.app_settings WHERE [key] IN ('loginBgColor') ; INSERT INTO dbo.app_settings ([key],[value],[updated_at]) VALUES ('loginBgColor', @c, SYSUTCDATETIME());");

            await new sql.Request(tx)
                .input('d', sql.NVarChar(sql.MAX), bgData || '')
                .query("DELETE FROM dbo.app_assets WHERE [key] IN ('loginBgData') ; INSERT INTO dbo.app_assets ([key],[data_url],[updated_at]) VALUES ('loginBgData', @d, SYSUTCDATETIME());");

            await tx.commit();
        } catch (e) {
            try { await tx.rollback(); } catch { /* ignore */ }
            throw e;
        }
    }).catch((e) => {
        console.error('Failed to persist background to DB:', e);
    });

    res.json({ success: true, message: 'Background updated successfully' });
});

app.post('/api/background/reset', (req, res) => {
    backgroundData = {
        type: null,
        color: '#667eea',
        imageData: null,
        videoData: null,
    };
    withDb(async (pool) => {
        await pool.request().query("DELETE FROM dbo.app_settings WHERE [key] IN ('loginBgType','loginBgColor')");
        await pool.request().query("DELETE FROM dbo.app_assets WHERE [key] IN ('loginBgData')");
    }).catch((e) => {
        console.error('Failed to reset background in DB:', e);
    });

    res.json({ success: true, message: 'Background reset successfully' });
});

function normalizeBoolean(val) {
    if (val === true || val === 1 || val === '1') return true;
    if (typeof val === 'string' && val.toLowerCase() === 'true') return true;
    return false;
}

function normalizeBooleanDefaultTrue(val) {
    // Backward-compatible default: enabled unless explicitly disabled.
    if (val === false || val === 0 || val === '0') return false;
    if (typeof val === 'string' && val.toLowerCase() === 'false') return false;
    return true;
}

async function withDb(action, overrides = {}) {
    const config = { ...DEFAULT_DB_CONFIG, ...overrides };
    const pool = await new sql.ConnectionPool(config).connect();
    try {
        return await action(pool);
    } finally {
        await pool.close();
    }
}

async function ensureDatabaseAndSchema() {
    // 1) Create the target database if missing.
    const dbName = DEFAULT_DB_CONFIG.database;
    const masterConfig = { ...DEFAULT_DB_CONFIG, database: 'master' };
    let masterPool;
    try {
        masterPool = await new sql.ConnectionPool(masterConfig).connect();
        const exists = await masterPool
            .request()
            .input('db', sql.NVarChar(255), dbName)
            .query('SELECT name FROM sys.databases WHERE name = @db');
        if (!exists.recordset || !exists.recordset.length) {
            const escaped = escapeDbName(dbName);
            await masterPool.request().query(`CREATE DATABASE [${escaped}]`);
            console.log(`✓ Created database: ${dbName}`);
        }
    } finally {
        if (masterPool) {
            try { await masterPool.close(); } catch (e) { /* ignore */ }
        }
    }

    // 2) Apply schema batches (idempotent).
    let schemaSql;
    try {
        schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
    } catch (e) {
        console.error('Failed to read schema.sql:', e);
        return;
    }
    const batches = splitSqlBatches(schemaSql);
    if (!batches.length) return;

    await withDb(async (pool) => {
        for (const stmt of batches) {
            await pool.request().batch(stmt);
        }
    });
    console.log('✓ DB schema is ready');
}

const schemaReadyPromise = ensureDatabaseAndSchema().catch((err) => {
    console.error('DB bootstrap failed:', err);
    // Keep the server up for static assets; API calls will surface errors.
});

async function fetchAllSync(pool) {
    const [
        usersRes,
        userAccessRes,
        roleAccessRes,
        appSettingsRes,
        appAssetsRes,
        attendanceRecordsRes,
        attendanceDeletedRes,
        attendanceNotesRes,
        otDetailsRes,
        otNotesRes,
    ] = await Promise.all([
        pool.request().query('SELECT userId, username, email, password, role, status, department, approver, basicSalary FROM dbo.app_users ORDER BY id'),
        pool.request().query('SELECT userId, settingsMenu, settingsPage, hideSignSv FROM dbo.user_access ORDER BY id'),
        pool.request().query('SELECT role, settingsMenu, settingsPage, manualInOut, shiftOLock, hideSignSv FROM dbo.role_access ORDER BY id'),
        pool.request().query('SELECT [key], [value] FROM dbo.app_settings'),
        pool.request().query('SELECT [key], [data_url] FROM dbo.app_assets'),
        pool.request().query('SELECT userKey, recordTimestamp, record_json, updated_at FROM dbo.app_attendance_records ORDER BY id'),
        pool.request().query('SELECT userKey, recordTimestamp, updated_at FROM dbo.app_attendance_deleted ORDER BY id'),
        pool.request().query('SELECT userKey, [date], notes, updated_at FROM dbo.app_attendance_notes'),
        pool.request().query('SELECT userKey, recordTimestamp, details_json, updated_at FROM dbo.app_ot_details'),
        pool.request().query('SELECT userKey, [date], notes, updated_at FROM dbo.app_ot_notes'),
    ]);

    return {
        users: usersRes.recordset || [],
        userAccess: userAccessRes.recordset || [],
        roleAccess: roleAccessRes.recordset || [],
        appSettings: appSettingsRes.recordset || [],
        appAssets: appAssetsRes.recordset || [],
        attendanceRecords: (attendanceRecordsRes.recordset || [])
            .map((r) => ({
                userKey: r.userKey,
                recordTimestamp: r.recordTimestamp,
                record: safeJsonParse(r.record_json),
                updatedAt: toIsoString(r.updated_at),
            }))
            .filter((r) => r.userKey && r.recordTimestamp && r.record),
        attendanceDeleted: (attendanceDeletedRes.recordset || [])
            .map((r) => ({ userKey: r.userKey, recordTimestamp: r.recordTimestamp, updatedAt: toIsoString(r.updated_at) }))
            .filter((r) => r.userKey && r.recordTimestamp),
        attendanceNotes: (attendanceNotesRes.recordset || [])
            .map((r) => ({ userKey: r.userKey, date: r.date, notes: r.notes || '', updatedAt: toIsoString(r.updated_at) }))
            .filter((r) => r.userKey && r.date),
        otDetails: (otDetailsRes.recordset || [])
            .map((r) => ({
                userKey: r.userKey,
                recordTimestamp: r.recordTimestamp,
                details: safeJsonParse(r.details_json),
                updatedAt: toIsoString(r.updated_at),
            }))
            .filter((r) => r.userKey && r.recordTimestamp && r.details),
        otNotes: (otNotesRes.recordset || [])
            .map((r) => ({ userKey: r.userKey, date: r.date, notes: r.notes || '', updatedAt: toIsoString(r.updated_at) }))
            .filter((r) => r.userKey && r.date),
    };
}

async function applySync(pool, payload = {}) {
    const {
        users,
        userAccess,
        roleAccess,
        appSettings,
        appAssets,
        attendanceRecords,
        attendanceDeleted,
        attendanceNotes,
        otDetails,
        otNotes,
    } = payload;
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        if (Array.isArray(users)) {
            await new sql.Request(tx).query('DELETE FROM dbo.user_access; DELETE FROM dbo.app_users;');
            for (const user of users) {
                const userId = user.userId || user.id || '';
                if (!userId) continue;
                const req = new sql.Request(tx);
                req.input('userId', sql.NVarChar(50), userId);
                req.input('username', sql.NVarChar(100), user.username || '');
                req.input('email', sql.NVarChar(255), user.email || '');
                req.input('password', sql.NVarChar(255), user.password || '');
                req.input('role', sql.NVarChar(50), user.role || '');
                req.input('status', sql.NVarChar(20), (user.status || 'Active').toString());
                req.input('department', sql.NVarChar(100), user.department || null);
                req.input('approver', sql.NVarChar(100), user.approver || null);
                req.input('basicSalary', sql.Decimal(18, 2), user.basicSalary != null && user.basicSalary !== '' ? Number(user.basicSalary) : null);
                await req.query(`
                    INSERT INTO dbo.app_users (userId, username, email, password, role, status, department, approver, basicSalary, created_at, updated_at)
                    VALUES (@userId, @username, @email, @password, @role, @status, @department, @approver, @basicSalary, SYSUTCDATETIME(), SYSUTCDATETIME());
                `);
            }
        }

        if (Array.isArray(roleAccess)) {
            await new sql.Request(tx).query('DELETE FROM dbo.role_access;');
            for (const ra of roleAccess) {
                if (!ra || !ra.role) continue;
                const req = new sql.Request(tx);
                req.input('role', sql.NVarChar(50), ra.role);
                req.input('settingsMenu', sql.Bit, normalizeBoolean(ra.settingsMenu));
                req.input('settingsPage', sql.Bit, normalizeBoolean(ra.settingsPage));
                req.input('manualInOut', sql.Bit, normalizeBooleanDefaultTrue(ra.manualInOut));
                req.input('shiftOLock', sql.Bit, normalizeBoolean(ra.shiftOLock));
                req.input('hideSignSv', sql.Bit, normalizeBoolean(ra.hideSignSv));
                await req.query(`
                    INSERT INTO dbo.role_access (role, settingsMenu, settingsPage, manualInOut, shiftOLock, hideSignSv, updated_at)
                    VALUES (@role, @settingsMenu, @settingsPage, @manualInOut, @shiftOLock, @hideSignSv, SYSUTCDATETIME());
                `);
            }
        }

        if (Array.isArray(userAccess)) {
            await new sql.Request(tx).query('DELETE FROM dbo.user_access;');
            for (const ua of userAccess) {
                const userId = ua.userId || ua.username || '';
                if (!userId) continue;
                const req = new sql.Request(tx);
                req.input('userId', sql.NVarChar(50), userId);
                req.input('settingsMenu', sql.Bit, normalizeBoolean(ua.settingsMenu));
                req.input('settingsPage', sql.Bit, normalizeBoolean(ua.settingsPage));
                req.input('hideSignSv', sql.Bit, normalizeBoolean(ua.hideSignSv));
                await req.query(`
                    INSERT INTO dbo.user_access (userId, settingsMenu, settingsPage, hideSignSv, updated_at)
                    VALUES (@userId, @settingsMenu, @settingsPage, @hideSignSv, SYSUTCDATETIME());
                `);
            }
        }

        if (Array.isArray(appSettings)) {
            await new sql.Request(tx).query('DELETE FROM dbo.app_settings;');
            for (const setting of appSettings) {
                if (!setting || setting.key === undefined || setting.key === null) continue;
                const req = new sql.Request(tx);
                req.input('key', sql.NVarChar(100), String(setting.key));
                req.input('value', sql.NVarChar(sql.MAX), setting.value !== undefined ? String(setting.value) : '');
                await req.query(`
                    INSERT INTO dbo.app_settings ([key], [value], updated_at)
                    VALUES (@key, @value, SYSUTCDATETIME());
                `);
            }
        }

        if (Array.isArray(appAssets)) {
            await new sql.Request(tx).query('DELETE FROM dbo.app_assets;');
            for (const asset of appAssets) {
                if (!asset || asset.key === undefined || asset.key === null) continue;
                const req = new sql.Request(tx);
                req.input('key', sql.NVarChar(100), String(asset.key));
                req.input('data_url', sql.NVarChar(sql.MAX), asset.data_url || asset.dataUrl || '');
                await req.query(`
                    INSERT INTO dbo.app_assets ([key], [data_url], updated_at)
                    VALUES (@key, @data_url, SYSUTCDATETIME());
                `);
            }
        }

        if (Array.isArray(attendanceRecords)) {
            for (const row of attendanceRecords) {
                if (!row || !row.userKey || !row.recordTimestamp || !row.record) continue;
                const incomingUpdatedAtRaw = row.updatedAt || row.updated_at || null;
                const req = new sql.Request(tx);
                req.input('userKey', sql.NVarChar(64), String(row.userKey));
                req.input('recordTimestamp', sql.NVarChar(64), String(row.recordTimestamp));
                req.input('record_json', sql.NVarChar(sql.MAX), JSON.stringify(row.record));
                req.input('incomingUpdatedAt', sql.DateTime2, parseDateTime2(incomingUpdatedAtRaw));
                await req.query(`
                    DECLARE @incoming DATETIME2 = COALESCE(@incomingUpdatedAt, SYSUTCDATETIME());
                    DECLARE @existing DATETIME2 = (
                        SELECT MAX(updated_at)
                        FROM dbo.app_attendance_records
                        WHERE userKey = @userKey AND recordTimestamp = @recordTimestamp
                    );
                    IF @existing IS NULL OR @existing < @incoming
                    BEGIN
                        DELETE FROM dbo.app_attendance_records WHERE userKey = @userKey AND recordTimestamp = @recordTimestamp;
                        INSERT INTO dbo.app_attendance_records (userKey, recordTimestamp, record_json, updated_at)
                        VALUES (@userKey, @recordTimestamp, @record_json, @incoming);
                    END
                `);
            }
        }

        if (Array.isArray(attendanceDeleted)) {
            for (const row of attendanceDeleted) {
                if (!row || !row.userKey || !row.recordTimestamp) continue;
                const incomingUpdatedAtRaw = row.updatedAt || row.updated_at || null;
                const req = new sql.Request(tx);
                req.input('userKey', sql.NVarChar(64), String(row.userKey));
                req.input('recordTimestamp', sql.NVarChar(64), String(row.recordTimestamp));
                req.input('incomingUpdatedAt', sql.DateTime2, parseDateTime2(incomingUpdatedAtRaw));
                await req.query(`
                    DECLARE @incoming DATETIME2 = COALESCE(@incomingUpdatedAt, SYSUTCDATETIME());
                    DECLARE @existing DATETIME2 = (
                        SELECT MAX(updated_at)
                        FROM dbo.app_attendance_deleted
                        WHERE userKey = @userKey AND recordTimestamp = @recordTimestamp
                    );
                    IF @existing IS NULL OR @existing < @incoming
                    BEGIN
                        DELETE FROM dbo.app_attendance_deleted WHERE userKey = @userKey AND recordTimestamp = @recordTimestamp;
                        INSERT INTO dbo.app_attendance_deleted (userKey, recordTimestamp, updated_at)
                        VALUES (@userKey, @recordTimestamp, @incoming);
                    END

                    -- Deletion wins: remove any corresponding records/details.
                    DELETE FROM dbo.app_attendance_records WHERE userKey = @userKey AND recordTimestamp = @recordTimestamp;
                    DELETE FROM dbo.app_ot_details WHERE userKey = @userKey AND recordTimestamp = @recordTimestamp;
                `);
            }
        }

        if (Array.isArray(attendanceNotes)) {
            for (const row of attendanceNotes) {
                if (!row || !row.userKey || !row.date) continue;
                const incomingUpdatedAtRaw = row.updatedAt || row.updated_at || null;
                const req = new sql.Request(tx);
                req.input('userKey', sql.NVarChar(64), String(row.userKey));
                req.input('date', sql.NVarChar(10), String(row.date));
                req.input('notes', sql.NVarChar(sql.MAX), row.notes != null ? String(row.notes) : '');
                req.input('incomingUpdatedAt', sql.DateTime2, parseDateTime2(incomingUpdatedAtRaw));
                await req.query(`
                    DECLARE @incoming DATETIME2 = COALESCE(@incomingUpdatedAt, SYSUTCDATETIME());
                    DECLARE @existing DATETIME2 = (
                        SELECT MAX(updated_at)
                        FROM dbo.app_attendance_notes
                        WHERE userKey = @userKey AND [date] = @date
                    );
                    IF @existing IS NULL OR @existing < @incoming
                    BEGIN
                        DELETE FROM dbo.app_attendance_notes WHERE userKey = @userKey AND [date] = @date;
                        INSERT INTO dbo.app_attendance_notes (userKey, [date], notes, updated_at)
                        VALUES (@userKey, @date, @notes, @incoming);
                    END
                `);
            }
        }

        if (Array.isArray(otDetails)) {
            for (const row of otDetails) {
                if (!row || !row.userKey || !row.recordTimestamp || !row.details) continue;
                const incomingUpdatedAtRaw = row.updatedAt || row.updated_at || null;
                const req = new sql.Request(tx);
                req.input('userKey', sql.NVarChar(64), String(row.userKey));
                req.input('recordTimestamp', sql.NVarChar(64), String(row.recordTimestamp));
                req.input('details_json', sql.NVarChar(sql.MAX), JSON.stringify(row.details));
                req.input('incomingUpdatedAt', sql.DateTime2, parseDateTime2(incomingUpdatedAtRaw));
                await req.query(`
                    DECLARE @incoming DATETIME2 = COALESCE(@incomingUpdatedAt, SYSUTCDATETIME());
                    DECLARE @existing DATETIME2 = (
                        SELECT MAX(updated_at)
                        FROM dbo.app_ot_details
                        WHERE userKey = @userKey AND recordTimestamp = @recordTimestamp
                    );
                    IF @existing IS NULL OR @existing < @incoming
                    BEGIN
                        DELETE FROM dbo.app_ot_details WHERE userKey = @userKey AND recordTimestamp = @recordTimestamp;
                        INSERT INTO dbo.app_ot_details (userKey, recordTimestamp, details_json, updated_at)
                        VALUES (@userKey, @recordTimestamp, @details_json, @incoming);
                    END
                `);
            }
        }

        if (Array.isArray(otNotes)) {
            for (const row of otNotes) {
                if (!row || !row.userKey || !row.date) continue;
                const incomingUpdatedAtRaw = row.updatedAt || row.updated_at || null;
                const req = new sql.Request(tx);
                req.input('userKey', sql.NVarChar(64), String(row.userKey));
                req.input('date', sql.NVarChar(10), String(row.date));
                req.input('notes', sql.NVarChar(sql.MAX), row.notes != null ? String(row.notes) : '');
                req.input('incomingUpdatedAt', sql.DateTime2, parseDateTime2(incomingUpdatedAtRaw));
                await req.query(`
                    DECLARE @incoming DATETIME2 = COALESCE(@incomingUpdatedAt, SYSUTCDATETIME());
                    DECLARE @existing DATETIME2 = (
                        SELECT MAX(updated_at)
                        FROM dbo.app_ot_notes
                        WHERE userKey = @userKey AND [date] = @date
                    );
                    IF @existing IS NULL OR @existing < @incoming
                    BEGIN
                        DELETE FROM dbo.app_ot_notes WHERE userKey = @userKey AND [date] = @date;
                        INSERT INTO dbo.app_ot_notes (userKey, [date], notes, updated_at)
                        VALUES (@userKey, @date, @notes, @incoming);
                    END
                `);
            }
        }

        await tx.commit();
    } catch (err) {
        try { await tx.rollback(); } catch (e) { /* ignore */ }
        throw err;
    }
}

async function fetchBackgroundFromDb(pool) {
    const settingsRes = await pool
        .request()
        .query("SELECT [key], [value] FROM dbo.app_settings WHERE [key] IN ('loginBgType', 'loginBgColor')");
    const assetsRes = await pool
        .request()
        .query("SELECT [key], [data_url] FROM dbo.app_assets WHERE [key] IN ('loginBgData')");

    const settings = {};
    (settingsRes.recordset || []).forEach((r) => {
        settings[r.key] = r.value;
    });
    const assets = {};
    (assetsRes.recordset || []).forEach((r) => {
        assets[r.key] = r.data_url;
    });

    const type = settings.loginBgType || null;
    const color = settings.loginBgColor || '#667eea';
    const data = assets.loginBgData || null;

    if (type === 'image' && data) {
        return { type: 'image', color: '#667eea', imageData: data, videoData: null };
    }
    if (type === 'video' && data) {
        return { type: 'video', color: '#667eea', imageData: null, videoData: data };
    }
    if (type === 'color' && color) {
        return { type: 'color', color, imageData: null, videoData: null };
    }
    return null;
}

// Get user profile from user_profiles table
app.get('/api/profile/:userId', async (req, res) => {
    const { userId } = req.params;
    
    if (!userId || !userId.trim()) {
        return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    try {
        await schemaReadyPromise;
        const data = await withDb(async (pool) => {
            const result = await pool.request()
                .input('userId', sql.NVarChar, userId.trim())
                .query('SELECT fullName, staffId, department, approver, basicSalary, updated_at FROM dbo.user_profiles WHERE userId = @userId');
            
            return result.recordset && result.recordset.length > 0 ? result.recordset[0] : null;
        });
        
        res.json({ success: true, data });
    } catch (err) {
        console.error('Failed to load user profile:', err);
        res.status(500).json({ success: false, message: err.message || 'Failed to load profile' });
    }
});

// Save user profile to user_profiles table
app.post('/api/profile/:userId', async (req, res) => {
    const { userId } = req.params;
    const { fullName, staffId, department, approver, basicSalary } = req.body || {};

    if (!userId || !userId.trim()) {
        return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    try {
        await schemaReadyPromise;
        const data = await withDb(async (pool) => {
            // First check if table exists
            const tableCheckResult = await pool.request().query(`
                SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'user_profiles'
            `);
            
            if (!tableCheckResult.recordset || tableCheckResult.recordset.length === 0) {
                throw new Error('Database schema not initialized. Please run db/schema.sql to create the user_profiles table.');
            }

            const result = await pool.request()
                .input('userId', sql.NVarChar, userId.trim())
                .query('SELECT id FROM dbo.user_profiles WHERE userId = @userId');
            
            const exists = result.recordset && result.recordset.length > 0;
            const now = new Date();

            if (exists) {
                // Update existing profile
                await pool.request()
                    .input('userId', sql.NVarChar, userId.trim())
                    .input('fullName', sql.NVarChar, fullName || null)
                    .input('staffId', sql.NVarChar, staffId || null)
                    .input('department', sql.NVarChar, department || null)
                    .input('approver', sql.NVarChar, approver || null)
                    .input('basicSalary', sql.Decimal(18, 2), basicSalary ? parseFloat(basicSalary) : null)
                    .input('updated_at', sql.DateTime2, now)
                    .query(`UPDATE dbo.user_profiles 
                            SET fullName = @fullName, staffId = @staffId, department = @department, 
                                approver = @approver, basicSalary = @basicSalary, updated_at = @updated_at 
                            WHERE userId = @userId`);
            } else {
                // Insert new profile
                await pool.request()
                    .input('userId', sql.NVarChar, userId.trim())
                    .input('fullName', sql.NVarChar, fullName || null)
                    .input('staffId', sql.NVarChar, staffId || null)
                    .input('department', sql.NVarChar, department || null)
                    .input('approver', sql.NVarChar, approver || null)
                    .input('basicSalary', sql.Decimal(18, 2), basicSalary ? parseFloat(basicSalary) : null)
                    .input('created_at', sql.DateTime2, now)
                    .input('updated_at', sql.DateTime2, now)
                    .query(`INSERT INTO dbo.user_profiles (userId, fullName, staffId, department, approver, basicSalary, created_at, updated_at)
                            VALUES (@userId, @fullName, @staffId, @department, @approver, @basicSalary, @created_at, @updated_at)`);
            }

            // Return the saved profile
            const getResult = await pool.request()
                .input('userId', sql.NVarChar, userId.trim())
                .query('SELECT fullName, staffId, department, approver, basicSalary, updated_at FROM dbo.user_profiles WHERE userId = @userId');
            
            return getResult.recordset && getResult.recordset.length > 0 ? getResult.recordset[0] : null;
        });

        res.json({ success: true, data });
    } catch (err) {
        console.error('Failed to save user profile:', err.message || err);
        const message = err.message && err.message.includes('user_profiles') 
            ? 'Database schema not initialized. Admin needs to run db/schema.sql'
            : err.message || 'Failed to save profile';
        res.status(500).json({ success: false, message });
    }
});

app.post('/api/test-connection', async (req, res) => {
    const { type, host, port, name, user, password } = req.body || {};

    if (!type || !host || !port || !name || !user) {
        return res.status(400).json({ success: false, message: 'Missing required connection fields' });
    }

    const portNum = Number(port);
    if (!Number.isFinite(portNum) || portNum <= 0) {
        return res.status(400).json({ success: false, message: 'Port must be a valid number' });
    }

    if (String(type).toLowerCase() !== 'sqlserver' && String(type).toLowerCase() !== 'microsoft sql server') {
        return res.status(400).json({ success: false, message: 'This build currently tests Microsoft SQL Server only.' });
    }

    const config = {
        user,
        password,
        server: host,
        port: portNum,
        database: name,
        options: { encrypt: false, trustServerCertificate: true },
        connectionTimeout: 5000,
        requestTimeout: 5000,
        pool: { max: 1, min: 0, idleTimeoutMillis: 3000 },
    };

    let pool;
    try {
        pool = await new sql.ConnectionPool(config).connect();
        const result = await pool.request().query('SELECT 1 AS ok');
        const first = result.recordset && result.recordset[0] ? result.recordset[0].ok : null;
        return res.json({ success: true, message: 'Connected successfully to SQL Server.', details: { result: first } });
    } catch (err) {
        console.error('Database connection test failed:', err);
        return res.status(500).json({ success: false, message: err.message || 'Database connection failed.' });
    } finally {
        if (pool) {
            try { await pool.close(); } catch (e) { /* ignore */ }
        }
    }
});

app.post('/api/test-smtp', async (req, res) => {
    const { host, port, username, password, fromEmail, fromName, secure } = req.body || {};

    if (!host || !port || !username || !password || !fromEmail) {
        return res.status(400).json({ success: false, message: 'Missing required SMTP fields.' });
    }

    const portNum = Number(port);
    if (!Number.isFinite(portNum) || portNum <= 0) {
        return res.status(400).json({ success: false, message: 'SMTP port must be a valid number.' });
    }

    const secureValue = String(secure || '').toLowerCase();
    const useSecure = secureValue === 'ssl';
    const useStartTls = secureValue === 'tls';

    try {
        const transportConfig = {
            host: String(host),
            port: portNum,
            secure: useSecure,
            auth: {
                user: String(username),
                pass: String(password)
            },
            connectionTimeout: 6000,
            greetingTimeout: 6000,
            socketTimeout: 8000
        };

        if (secureValue === 'none') {
            transportConfig.secure = false;
            transportConfig.ignoreTLS = true;
            transportConfig.requireTLS = false;
        } else if (useStartTls) {
            transportConfig.secure = false;
            transportConfig.requireTLS = true;
        }

        transportConfig.tls = { rejectUnauthorized: false };

        const transporter = nodemailer.createTransport(transportConfig);

        await transporter.verify();

        let modeLabel = 'SMTP connection succeeded.';
        if (secureValue === 'none') modeLabel = 'SMTP connection succeeded (no TLS).';
        if (useStartTls) modeLabel = 'SMTP connection succeeded (STARTTLS).';
        if (useSecure) modeLabel = 'SMTP connection succeeded (SSL/TLS).';

        return res.json({
            success: true,
            message: modeLabel,
            details: {
                secure: useSecure,
                startTls: useStartTls,
                host: String(host),
                port: portNum
            }
        });
    } catch (err) {
        console.error('SMTP test failed:', err);
        return res.status(500).json({
            success: false,
            message: err.message || 'SMTP connection failed.',
            code: err.code || null,
            command: err.command || null
        });
    }
});

app.post('/api/smtp-settings', async (req, res) => {
    const { host, port, username, password, fromEmail, fromName, secure } = req.body || {};

    if (!host || !port || !username || !password || !fromEmail) {
        return res.status(400).json({ success: false, message: 'Missing required SMTP fields.' });
    }

    const settingsPayload = {
        host: String(host),
        port: String(port),
        username: String(username),
        password: String(password),
        fromEmail: String(fromEmail),
        fromName: fromName ? String(fromName) : '',
        secure: String(secure || 'tls')
    };

    try {
        await withDb(async (pool) => {
            const req = pool.request();
            req.input('key', sql.NVarChar(100), 'smtpSettings');
            req.input('value', sql.NVarChar(sql.MAX), JSON.stringify(settingsPayload));
            await req.query(`
                DELETE FROM dbo.app_settings WHERE [key] = @key;
                INSERT INTO dbo.app_settings ([key], [value], updated_at)
                VALUES (@key, @value, SYSUTCDATETIME());
            `);
        });

        return res.json({ success: true, message: 'SMTP settings saved on server.' });
    } catch (err) {
        console.error('Failed to save SMTP settings:', err);
        return res.status(500).json({ success: false, message: err.message || 'Failed to save SMTP settings.' });
    }
});

app.post('/api/send-otp', async (req, res) => {
    const { toEmail, otp, username, smtpSettings: smtpFromClient } = req.body || {};

    if (!toEmail || !otp) {
        return res.status(400).json({ success: false, message: 'Missing recipient email or OTP.' });
    }

    let smtpSettings = null;
    try {
        const data = await withDb(async (pool) => {
            const result = await pool.request().query("SELECT [key], [value] FROM dbo.app_settings WHERE [key] IN ('smtpSettings')");
            return result.recordset || [];
        });

        const smtpRow = data.find((row) => row.key === 'smtpSettings');
        if (smtpRow && smtpRow.value) {
            smtpSettings = JSON.parse(smtpRow.value);
        }
    } catch (err) {
        console.error('Failed to load SMTP settings from DB:', err);
    }

    if (!smtpSettings && smtpFromClient) {
        smtpSettings = smtpFromClient;
    }

    if (!smtpSettings) {
        try {
            const fallback = process.env.SMTP_SETTINGS;
            if (fallback) smtpSettings = JSON.parse(fallback);
        } catch {
            // ignore
        }
    }

    if (!smtpSettings || !smtpSettings.host || !smtpSettings.port || !smtpSettings.username || !smtpSettings.password || !smtpSettings.fromEmail) {
        return res.status(400).json({ success: false, message: 'SMTP settings are not configured. Please save them in Settings > Email.' });
    }

    const secureValue = String(smtpSettings.secure || 'tls').toLowerCase();
    const useSecure = secureValue === 'ssl';
    const useStartTls = secureValue === 'tls';

    const transportConfig = {
        host: String(smtpSettings.host),
        port: Number(smtpSettings.port),
        secure: useSecure,
        auth: {
            user: String(smtpSettings.username),
            pass: String(smtpSettings.password)
        },
        connectionTimeout: 6000,
        greetingTimeout: 6000,
        socketTimeout: 8000
    };

    if (secureValue === 'none') {
        transportConfig.secure = false;
        transportConfig.ignoreTLS = true;
        transportConfig.requireTLS = false;
    } else if (useStartTls) {
        transportConfig.secure = false;
        transportConfig.requireTLS = true;
    }

    transportConfig.tls = { rejectUnauthorized: false };

    try {
        const transporter = nodemailer.createTransport(transportConfig);
        await transporter.verify();

        const fromName = smtpSettings.fromName ? String(smtpSettings.fromName) : 'Attendance System';
        const fromAddress = `${fromName} <${smtpSettings.fromEmail}>`;

        await transporter.sendMail({
            from: fromAddress,
            to: String(toEmail),
            subject: 'Password Reset OTP',
            text: `Hello${username ? ' ' + username : ''},\n\nYour OTP code is ${otp}. It expires in 10 minutes.\n\nIf you did not request this, please ignore this email.`,
            html: `
                <p>Hello${username ? ' ' + username : ''},</p>
                <p>Your OTP code is <strong>${otp}</strong>. It expires in 10 minutes.</p>
                <p>If you did not request this, please ignore this email.</p>
            `.trim()
        });

        return res.json({ success: true, message: 'OTP email sent successfully.' });
    } catch (err) {
        console.error('Failed to send OTP email:', err);
        return res.status(500).json({
            success: false,
            message: err.message || 'Failed to send OTP email.',
            code: err.code || null,
            command: err.command || null
        });
    }
});

app.get('/api/sync', async (req, res) => {
    try {
        await schemaReadyPromise;
        const data = await withDb((pool) => fetchAllSync(pool));
        res.json({ success: true, data });
    } catch (err) {
        console.error('Sync pull failed:', err);
        res.status(500).json({ success: false, message: err.message || 'Sync pull failed.' });
    }
});

app.post('/api/sync', async (req, res) => {
    const payload = req.body || {};
    try {
        await schemaReadyPromise;
        const data = await withDb(async (pool) => {
            await applySync(pool, payload);
            return fetchAllSync(pool);
        });
        res.json({ success: true, data });
    } catch (err) {
        console.error('Sync push failed:', err);
        res.status(500).json({ success: false, message: err.message || 'Sync push failed.' });
    }
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

function loadHttpsOptions() {
    const keyPath = process.env.SSL_KEY_PATH;
    const certPath = process.env.SSL_CERT_PATH;
    const caPath = process.env.SSL_CA_PATH;

    if (!keyPath || !certPath) return null;

    try {
        const options = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath),
        };
        if (caPath) {
            options.ca = fs.readFileSync(caPath);
        }
        return options;
    } catch (err) {
        console.warn('Failed to load HTTPS certificates:', err.message || err);
        return null;
    }
}

const httpsOptions = loadHttpsOptions();
const httpsOnly = ['true', '1', 'yes', 'y', 'on'].includes(HTTPS_ONLY);

if (!httpsOnly) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✓ Attendance App is running on:`);
        console.log(`  - http://localhost:${PORT}`);
        console.log(`  - http://${localIP}:${PORT}`);
        console.log('✓ Server is listening on all network interfaces (0.0.0.0)');
        console.log(`✓ Make sure Windows Firewall allows connections on port ${PORT}`);
        console.log('✓ Press Ctrl+C to stop the server');
    });
} else {
    console.log('✓ HTTPS_ONLY enabled: HTTP server disabled.');
}

if (httpsOptions) {
    https.createServer(httpsOptions, app).listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`✓ HTTPS enabled:`);
        console.log(`  - https://localhost:${HTTPS_PORT}`);
        console.log(`  - https://${localIP}:${HTTPS_PORT}`);
        console.log(`✓ Make sure Windows Firewall allows connections on port ${HTTPS_PORT}`);
    });
} else if (httpsOnly) {
    console.error('HTTPS_ONLY is set but SSL_KEY_PATH / SSL_CERT_PATH are not configured.');
}
