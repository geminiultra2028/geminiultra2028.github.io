// Login Page JavaScript

// ========== LOGIN/DB SYNC (PULL USERS BEFORE LOGIN) ==========
// The dashboard (script.js) already performs continuous two-way sync with /api/sync,
// but login.html loads only login.js. That meant new users/roles created on another
// device might not exist in this browser's localStorage yet, so login would fail.
//
// On the login screen we do a lightweight *pull* from the DB so all roles can sign in
// from any device. We preserve any non-empty local passwords if the DB returns blanks.

let loginSyncPromise = Promise.resolve();

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

async function fetchWithTimeout(url, options = {}, timeoutMs = 2500) {
    const ms = Number(timeoutMs);
    const safeTimeout = Number.isFinite(ms) && ms > 0 ? ms : 2500;

    if (typeof AbortController === 'undefined') {
        return fetch(url, { ...options, cache: 'no-store' });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), safeTimeout);
    try {
        return await fetch(url, { ...options, cache: 'no-store', signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

function safeReadJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function generateOtpCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function getOtpPayload() {
    const data = safeReadJson('forgotPasswordOtp', null);
    if (!data || typeof data !== 'object') return null;
    return data;
}

function setOtpPayload(payload) {
    if (!payload) {
        localStorage.removeItem('forgotPasswordOtp');
        return;
    }
    localStorage.setItem('forgotPasswordOtp', JSON.stringify(payload));
}

function clearOtpPayload() {
    localStorage.removeItem('forgotPasswordOtp');
}

function findUserByLoginId(loginId, users) {
    const loginNorm = String(loginId || '').trim().toLowerCase();
    if (!loginNorm) return null;
    return (users || []).find(u => {
        const usernameNorm = String(u.username || '').trim().toLowerCase();
        const userIdNorm = String(u.userId || '').trim().toLowerCase();
        const emailNorm = String(u.email || '').trim().toLowerCase();
        return usernameNorm === loginNorm || userIdNorm === loginNorm || emailNorm === loginNorm;
    }) || null;
}

async function syncLoginWithDb({ timeoutMs = 2500 } = {}) {
    let pullRes;
    try {
        pullRes = await fetchWithTimeout('/api/sync', {}, timeoutMs);
    } catch {
        return;
    }
    if (!pullRes || !pullRes.ok) return;

    const pullJson = await pullRes.json().catch(() => ({}));
    const serverData = pullJson && pullJson.data && typeof pullJson.data === 'object' ? pullJson.data : null;
    if (!serverData) return;

    const serverUsers = Array.isArray(serverData.users) ? serverData.users : [];

    // Only overwrite local users if the DB has a real list.
    // This avoids wiping local fallback users when the DB is empty/uninitialized.
    if (serverUsers.length > 0) {
        const localUsers = safeReadJson('users', []);

        // Preserve non-empty local passwords if the DB returns empty values.
        const localPasswordByKey = new Map();
        (Array.isArray(localUsers) ? localUsers : []).forEach((u) => {
            if (!u) return;
            const pw = typeof u.password === 'string' ? u.password.trim() : '';
            if (!pw) return;

            const userIdKey = String(u.userId || '').trim().toLowerCase();
            const usernameKey = String(u.username || '').trim().toLowerCase();
            if (userIdKey) localPasswordByKey.set(userIdKey, pw);
            if (usernameKey && !localPasswordByKey.has(usernameKey)) localPasswordByKey.set(usernameKey, pw);
        });

        const mergedUsersWithPasswords = serverUsers.map((u) => {
            if (!u) return u;
            const pw = typeof u.password === 'string' ? u.password.trim() : '';
            if (pw) return u;

            const userIdKey = String(u.userId || '').trim().toLowerCase();
            const usernameKey = String(u.username || '').trim().toLowerCase();
            const localPw = (userIdKey && localPasswordByKey.get(userIdKey))
                || (usernameKey && localPasswordByKey.get(usernameKey));
            return localPw ? { ...u, password: localPw } : u;
        });

        localStorage.setItem('users', JSON.stringify(mergedUsersWithPasswords));
    }

    // Access control (optional for login itself, but useful to keep consistent across devices).
    const userAccessArr = Array.isArray(serverData.userAccess) ? serverData.userAccess : [];
    if (userAccessArr.length > 0) {
        const uaObj = {};
        userAccessArr.forEach((row) => {
            if (!row || row.userId == null) return;
            const userId = String(row.userId);
            uaObj[userId] = {
                settingsMenu: normalizeBoolean(row.settingsMenu),
                settingsPage: normalizeBoolean(row.settingsPage),
                hideSignSv: normalizeBoolean(row.hideSignSv)
            };
        });
        localStorage.setItem('userAccess', JSON.stringify(uaObj));
    }

    const roleAccessArr = Array.isArray(serverData.roleAccess) ? serverData.roleAccess : [];
    if (roleAccessArr.length > 0) {
        const raObj = {};
        roleAccessArr.forEach((row) => {
            if (!row || row.role == null) return;
            const role = String(row.role);
            raObj[role] = {
                settingsMenu: normalizeBoolean(row.settingsMenu),
                settingsPage: normalizeBoolean(row.settingsPage),
                manualInOut: normalizeBooleanDefaultTrue(row.manualInOut),
                shiftOLock: normalizeBoolean(row.shiftOLock),
                hideSignSv: normalizeBoolean(row.hideSignSv)
            };
        });
        localStorage.setItem('roleAccess', JSON.stringify(raObj));
    }

    const appSettingsArr = Array.isArray(serverData.appSettings) ? serverData.appSettings : [];
    if (appSettingsArr.length > 0) {
        const settingsObj = {};
        appSettingsArr.forEach((row) => {
            if (!row || row.key == null) return;
            settingsObj[String(row.key)] = row.value != null ? String(row.value) : '';
        });
        localStorage.setItem('appSettings', JSON.stringify(settingsObj));

        // Restore settings that are also stored under dedicated keys.
        if (settingsObj.databaseSettings) localStorage.setItem('databaseSettings', settingsObj.databaseSettings); else localStorage.removeItem('databaseSettings');
        if (settingsObj.loginBgType) localStorage.setItem('loginBgType', settingsObj.loginBgType); else localStorage.removeItem('loginBgType');
        if (settingsObj.loginBgColor) localStorage.setItem('loginBgColor', settingsObj.loginBgColor); else localStorage.removeItem('loginBgColor');
    }

    const appAssetsArr = Array.isArray(serverData.appAssets) ? serverData.appAssets : [];
    if (appAssetsArr.length > 0) {
        const assetsObj = {};
        appAssetsArr.forEach((row) => {
            if (!row || row.key == null) return;
            assetsObj[String(row.key)] = row.data_url != null ? String(row.data_url) : '';
        });

        if (assetsObj.companyLogo) localStorage.setItem('companyLogo', assetsObj.companyLogo); else localStorage.removeItem('companyLogo');
        if (assetsObj.departmentLogo) localStorage.setItem('departmentLogo', assetsObj.departmentLogo); else localStorage.removeItem('departmentLogo');
        if (assetsObj.loginBgData) localStorage.setItem('loginBgData', assetsObj.loginBgData); else localStorage.removeItem('loginBgData');
    }
}

// Initialize users in localStorage if not exists
function initializeUsers() {
    const users = JSON.parse(localStorage.getItem('users') || '[]');

    // Check if Admin user exists
    const adminIndex = users.findIndex(user => user.username === 'Admin');

    if (adminIndex === -1) {
        // Add default Admin user
        const adminUser = {
            id: 1,
            userId: 'Master',
            username: 'Admin',
            password: 'P@ssw0rd6151',
            email: 'admin@pknsb',
            role: 'Administrator',
            createdAt: new Date().toISOString()
        }

// Emergency recovery: reset the Master Admin account back to known defaults.
// This is useful if the Admin password was changed/forgotten and you are locked out.
function resetMasterAdminToDefault() {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const arr = Array.isArray(users) ? users : [];

    const defaultAdmin = {
        id: 1,
        userId: 'Master',
        username: 'Admin',
        password: 'P@ssw0rd6151',
        email: 'admin@pknsb',
        role: 'Administrator',
        status: 'Active',
        createdAt: new Date().toISOString()
    };

    const idx = arr.findIndex(u => String(u && u.userId ? u.userId : '').trim().toLowerCase() === 'master'
        || String(u && u.username ? u.username : '').trim().toLowerCase() === 'admin');

    if (idx === -1) {
        arr.push(defaultAdmin);
    } else {
        const prev = (arr[idx] && typeof arr[idx] === 'object') ? arr[idx] : {};
        arr[idx] = { ...prev, ...defaultAdmin, createdAt: prev.createdAt || defaultAdmin.createdAt };
    }

    localStorage.setItem('users', JSON.stringify(arr));

    // Signal the main app (script.js) to push users to DB on next load.
    try {
        localStorage.setItem('forceUsersSync', '1');
    } catch {
        // ignore
    }
};

        users.push(adminUser);
        localStorage.setItem('users', JSON.stringify(users));
        console.log('Default Admin user created');
        return;
    }

    // Repair Admin user if userId/password were wiped (e.g., empty string)
    const adminUser = users[adminIndex];
    let didRepair = false;

    if (!adminUser.userId || String(adminUser.userId).trim() === '') {
        adminUser.userId = 'Master';
        didRepair = true;
    }

    if (!adminUser.password || String(adminUser.password).trim() === '') {
        adminUser.password = 'P@ssw0rd6151';
        didRepair = true;
    }

    if (didRepair) {
        users[adminIndex] = adminUser;
        localStorage.setItem('users', JSON.stringify(users));
        console.log('Admin user repaired (missing userId/password).');
    }
}

// Emergency recovery: reset the Master Admin account back to known defaults.
// This is useful if the Admin password was changed/forgotten and you are locked out.
function resetMasterAdminToDefault() {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const arr = Array.isArray(users) ? users : [];

    const defaultAdmin = {
        id: 1,
        userId: 'Master',
        username: 'Admin',
        password: 'P@ssw0rd6151',
        email: 'admin@pknsb',
        role: 'Administrator',
        status: 'Active',
        createdAt: new Date().toISOString()
    };

    const idx = arr.findIndex(u => String(u && u.userId ? u.userId : '').trim().toLowerCase() === 'master'
        || String(u && u.username ? u.username : '').trim().toLowerCase() === 'admin');

    if (idx === -1) {
        arr.push(defaultAdmin);
    } else {
        const prev = (arr[idx] && typeof arr[idx] === 'object') ? arr[idx] : {};
        arr[idx] = { ...prev, ...defaultAdmin, createdAt: prev.createdAt || defaultAdmin.createdAt };
    }

    localStorage.setItem('users', JSON.stringify(arr));

    // Signal the main app (script.js) to push users to DB on next load.
    try {
        localStorage.setItem('forceUsersSync', '1');
    } catch {
        // ignore
    }
}

// Check if user is already logged in
function checkAuth() {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    if (isLoggedIn === 'true') {
        window.location.href = 'index.html';
    }
}

function applySavedTheme() {
    // Theme is user-scoped in the main app (stored as: theme_<userKey>).
    // On the login page we don't have a logged-in user yet, so we apply the theme
    // for the remembered username when available (fallback to legacy global key).
    const sanitizeStorageKeyPart = (value) => {
        return String(value || '')
            .trim()
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .slice(0, 64) || 'Master';
    };

    const rememberedUsername = localStorage.getItem('rememberedUser');
    let savedTheme = null;

    if (rememberedUsername) {
        try {
            const users = JSON.parse(localStorage.getItem('users') || '[]');
            const user = users.find(u => u.username === rememberedUsername);
            const keyPart = sanitizeStorageKeyPart((user && user.userId) || rememberedUsername);
            savedTheme = localStorage.getItem(`theme_${keyPart}`);
        } catch (e) {
            // ignore parse errors; fall back to legacy key
        }
    }

    // Legacy fallback (pre user-scoped theme)
    if (!savedTheme) {
        savedTheme = localStorage.getItem('theme');
    }

    if (savedTheme === 'dark-theme') {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
}

// Handle login form submission
async function handleLogin(e) {
    e.preventDefault();

    // Ensure we have the latest users/roles/access from the DB (fast-fails on timeout).
    try {
        await loginSyncPromise;
    } catch {
        // ignore
    }

    const loginId = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const loginError = document.getElementById('loginError');

    // Get users from localStorage
    const users = JSON.parse(localStorage.getItem('users') || '[]');

    // Find user with matching credentials
    // Allow login by username OR userId OR email (case-insensitive).
    // Also trim accidental whitespace in password input/stored values.
    const loginIdNorm = String(loginId || '').trim().toLowerCase();
    const passwordNorm = String(password || '').trim();
    const user = users.find(u => {
        const usernameNorm = String(u.username || '').trim().toLowerCase();
        const userIdNorm = String(u.userId || '').trim().toLowerCase();
        const emailNorm = String(u.email || '').trim().toLowerCase();
        const storedPassword = String(u.password || '').trim();
        const idMatch = (usernameNorm === loginIdNorm || userIdNorm === loginIdNorm || emailNorm === loginIdNorm);
        return idMatch && storedPassword === passwordNorm;
    });

    if (user) {
        // Login successful
        sessionStorage.setItem('isLoggedIn', 'true');
        sessionStorage.setItem('currentUser', JSON.stringify(user));

        // Store remember me preference
        const rememberMe = document.getElementById('rememberMe').checked;
        if (rememberMe) {
            // Persist canonical username for theme/user-scoped settings
            localStorage.setItem('rememberedUser', user.username);
        } else {
            localStorage.removeItem('rememberedUser');
        }

        // Redirect to dashboard
        window.location.href = 'index.html';
    } else {
        // Login failed
        loginError.style.display = 'flex';
        setTimeout(() => {
            loginError.style.display = 'none';
        }, 3000);
    }
}

function initializeForgotPasswordFlow() {
    const forgotLink = document.querySelector('.forgot-password');
    const modal = document.getElementById('forgotPasswordModal');
    const closeBtn = document.getElementById('closeForgotPasswordModal');
    const cancelBtn = document.getElementById('cancelForgotPasswordBtn');
    const form = document.getElementById('forgotPasswordForm');
    const loginIdInput = document.getElementById('forgotLoginId');
    const sendOtpBtn = document.getElementById('sendOtpBtn');
    const otpSection = document.getElementById('otpSection');
    const otpCodeInput = document.getElementById('otpCode');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');

    if (!forgotLink || !modal || !form) return;

    const openModal = () => {
        modal.style.display = 'flex';
        if (otpSection) otpSection.style.display = 'none';
        if (otpCodeInput) otpCodeInput.value = '';
        if (newPasswordInput) newPasswordInput.value = '';
        if (confirmPasswordInput) confirmPasswordInput.value = '';
        if (loginIdInput) loginIdInput.value = '';
        clearOtpPayload();
    };

    const closeModal = () => {
        modal.style.display = 'none';
        clearOtpPayload();
    };

    forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeModal);
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });


    if (sendOtpBtn) {
        sendOtpBtn.addEventListener('click', () => {
            const loginIdValue = loginIdInput ? loginIdInput.value.trim() : '';
            if (!loginIdValue) {
                alert('Please enter your username, user ID, or email.');
                return;
            }

            const users = safeReadJson('users', []);
            const user = findUserByLoginId(loginIdValue, users);
            if (!user) {
                alert('Account not found. Please check your login ID.');
                return;
            }

            if (!user.email) {
                alert('No email address is set for this account. Please update it in Settings > Email.');
                return;
            }

            const otp = generateOtpCode();
            const expiresAt = Date.now() + 10 * 60 * 1000;

            sendOtpBtn.disabled = true;
            const originalText = sendOtpBtn.innerHTML;
            sendOtpBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

            let smtpSettingsPayload = null;
            try {
                const stored = localStorage.getItem('smtpSettings');
                if (stored) {
                    smtpSettingsPayload = JSON.parse(stored);
                }
            } catch {
                smtpSettingsPayload = null;
            }

            fetch('/api/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    toEmail: user.email,
                    otp,
                    username: user.username || '',
                    smtpSettings: smtpSettingsPayload
                })
            })
                .then(response => response.json().then(data => ({ ok: response.ok, data })))
                .then(({ ok, data }) => {
                    if (!ok || !data || !data.success) {
                        const msg = (data && data.message) ? data.message : 'Failed to send OTP email.';
                        alert(`Failed to send OTP email: ${msg}`);
                        return;
                    }

                    setOtpPayload({
                        otp,
                        userId: user.userId || user.id || user.username || loginIdValue,
                        username: user.username || '',
                        email: user.email,
                        expiresAt
                    });

                    if (otpSection) otpSection.style.display = 'block';
                    alert(`OTP sent to ${user.email}. Please check your inbox.`);
                })
                .catch((err) => {
                    console.error('Failed to send OTP email:', err);
                    alert('Failed to send OTP email. Please try again.');
                })
                .finally(() => {
                    sendOtpBtn.disabled = false;
                    sendOtpBtn.innerHTML = originalText;
                });
        });
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const otpPayload = getOtpPayload();
        if (!otpPayload) {
            alert('Please request an OTP first.');
            return;
        }

        if (Date.now() > otpPayload.expiresAt) {
            alert('OTP expired. Please request a new code.');
            clearOtpPayload();
            if (otpSection) otpSection.style.display = 'none';
            return;
        }

        const enteredOtp = otpCodeInput ? otpCodeInput.value.trim() : '';
        if (!enteredOtp || enteredOtp !== otpPayload.otp) {
            alert('Invalid OTP code. Please try again.');
            return;
        }

        const newPassword = newPasswordInput ? newPasswordInput.value : '';
        const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';

        if (!newPassword || newPassword.length < 6) {
            alert('Please enter a new password (minimum 6 characters).');
            return;
        }

        if (newPassword !== confirmPassword) {
            alert('Passwords do not match. Please re-enter.');
            return;
        }

        const users = safeReadJson('users', []);
        const updatedUsers = users.map(u => {
            const matchesUserId = otpPayload.userId && (u.userId === otpPayload.userId || u.id === otpPayload.userId);
            const matchesUsername = otpPayload.username && u.username === otpPayload.username;
            const matchesEmail = otpPayload.email && u.email === otpPayload.email;
            if (matchesUserId || matchesUsername || matchesEmail) {
                return { ...u, password: newPassword };
            }
            return u;
        });

        localStorage.setItem('users', JSON.stringify(updatedUsers));
        try {
            localStorage.setItem('forceUsersSync', '1');
        } catch {
            // ignore
        }

        clearOtpPayload();
        alert('Password reset successfully. Please log in with your new password.');
        closeModal();
    });
}

// Load remembered username if exists
function loadRememberedUser() {
    const rememberedUser = localStorage.getItem('rememberedUser');
    if (rememberedUser) {
        document.getElementById('username').value = rememberedUser;
        document.getElementById('rememberMe').checked = true;
    }
}

// Initialize Master Admin user
function initializeMasterAdmin() {
    // Get existing users
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    
    // Check if Master Admin user exists
    const adminIndex = users.findIndex(user => user.username === 'Admin');
    
    if (adminIndex === -1) {
        // Add Master Admin user
        const adminUser = {
            id: 1,
            userId: 'Master',
            username: 'Admin',
            password: 'P@ssw0rd6151',
            email: 'admin@pknsb',
            role: 'Administrator',
            createdAt: new Date().toISOString()
        };
        
        users.push(adminUser);
        localStorage.setItem('users', JSON.stringify(users));
        console.log('Master Admin user created');
        return;
    }

    // Repair Master Admin if needed
    const adminUser = users[adminIndex];
    let didRepair = false;

    if (!adminUser.userId || String(adminUser.userId).trim() === '') {
        adminUser.userId = 'Master';
        didRepair = true;
    }

    if (!adminUser.password || String(adminUser.password).trim() === '') {
        adminUser.password = 'P@ssw0rd6151';
        didRepair = true;
    }

    if (didRepair) {
        users[adminIndex] = adminUser;
        localStorage.setItem('users', JSON.stringify(users));
        console.log('Master Admin user repaired (missing userId/password).');
    }
}

// Initialize login page
document.addEventListener('DOMContentLoaded', function() {
    // Apply theme immediately on login page as well (persists across refresh + re-login)
    applySavedTheme();

    // Initialize Master Admin user
    initializeMasterAdmin();
    
    // Initialize users
    initializeUsers();

    // Check if already logged in
    checkAuth();

    // Load remembered username
    loadRememberedUser();

    // Pull latest users/roles/access from DB so login works across devices.
    loginSyncPromise = syncLoginWithDb({ timeoutMs: 2500 })
        .then(() => {
            // Theme may depend on userId mapping; re-apply after sync.
            applySavedTheme();
        })
        .catch(() => {
            // ignore; offline login should still work
        });

    // Add login form submit handler
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    initializeForgotPasswordFlow();

    // Load saved background on page load
    loadBackgroundFromServer();
});
// ========== BACKGROUND LOADING ON LOGIN PAGE ==========

// Set background image
function setBackgroundImage(imageSrc) {
    const loginPage = document.querySelector('.login-page');
    if (!loginPage) return;
    
    // Remove any existing video background
    const existingVideo = loginPage.querySelector('video');
    if (existingVideo) {
        existingVideo.remove();
    }
    
    loginPage.style.background = `url('${imageSrc}') center/cover no-repeat`;
    loginPage.style.backgroundAttachment = 'fixed';
    
    // Add a slight delay to ensure the background image is loaded before updating text color
    setTimeout(() => {
        updateTextColorForBackground();
    }, 200);
}

// Set background video
function setBackgroundVideo(videoSrc) {
    const loginPage = document.querySelector('.login-page');
    if (!loginPage) return;
    
    // Remove any existing video background
    const existingVideo = loginPage.querySelector('video');
    if (existingVideo) {
        existingVideo.remove();
    }

    const video = document.createElement('video');
    video.src = videoSrc;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsinline = true;
    video.style.position = 'fixed';
    video.style.top = '0';
    video.style.left = '0';
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    video.style.zIndex = '-1';

    loginPage.style.background = 'transparent';
    loginPage.insertBefore(video, loginPage.firstChild);
    
    // Wait for video to load before updating text color
    video.onloadeddata = function() {
        setTimeout(() => {
            updateTextColorForBackground();
        }, 200);
    };
}

// Set background color
function setBackgroundColor(color) {
    const loginPage = document.querySelector('.login-page');
    if (!loginPage) return;
    
    // Remove any existing video background
    const existingVideo = loginPage.querySelector('video');
    if (existingVideo) {
        existingVideo.remove();
    }

    loginPage.style.background = color;
    
    // Add a slight delay to ensure the background color is applied before updating text color
    setTimeout(() => {
        updateTextColorForBackground();
    }, 200);
}

// Reset background to default
function resetBackground() {
    const loginPage = document.querySelector('.login-page');
    const existingVideo = loginPage.querySelector('video');
    if (existingVideo) {
        existingVideo.remove();
    }

    loginPage.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    updateTextColorForBackground();
}

// Load saved background from multiple storage mechanisms
// Load background from server (with fallback to localStorage)
function loadBackgroundFromServer() {
    // First, try to load from server
    fetch('/api/background')
        .then(response => response.json())
        .then(backgroundData => {
            if (backgroundData.type === 'image' && backgroundData.imageData) {
                setBackgroundImage(backgroundData.imageData);
            } else if (backgroundData.type === 'video' && backgroundData.videoData) {
                setBackgroundVideo(backgroundData.videoData);
            } else if (backgroundData.type === 'color' && backgroundData.color) {
                setBackgroundColor(backgroundData.color);
            } else {
                // No server background, try localStorage
                loadSavedBackground();
            }
        })
        .catch(err => {
            // Server is unavailable, fall back to localStorage
            console.log('Failed to load background from server, using localStorage');
            loadSavedBackground();
        });
}

function loadSavedBackground() {
    // Try to get background type from multiple sources in order of preference
    let bgType = localStorage.getItem('loginBgType') || 
                sessionStorage.getItem('loginBgType') || 
                getCookie('loginBgType');

    if (bgType === 'image') {
        // Try to get background data from multiple sources
        let bgData = localStorage.getItem('loginBgData') || 
                   sessionStorage.getItem('loginBgData') || 
                   getCookie('loginBgData');
        
        if (bgData) {
            // Wait for DOM to be fully loaded before setting background
            setTimeout(() => {
                setBackgroundImage(bgData);
            }, 100);
        }
    } else if (bgType === 'video') {
        // Try to get background data from multiple sources
        let bgData = localStorage.getItem('loginBgData') || 
                   sessionStorage.getItem('loginBgData') || 
                   getCookie('loginBgData');
        
        if (bgData) {
            // Wait for DOM to be fully loaded before setting background
            setTimeout(() => {
                setBackgroundVideo(bgData);
            }, 100);
        }
    } else if (bgType === 'color') {
        // Try to get background color from multiple sources
        let bgColor = localStorage.getItem('loginBgColor') || 
                    sessionStorage.getItem('loginBgColor') || 
                    getCookie('loginBgColor');
        
        if (bgColor) {
            // Wait for DOM to be fully loaded before setting background
            setTimeout(() => {
                setBackgroundColor(bgColor);
            }, 100);
        }
    }
}

// Helper function to get cookie value
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
        const cookieValue = parts.pop().split(';').shift();
        // Decode if it's a background data cookie
        return name === 'loginBgData' ? decodeURIComponent(cookieValue) : cookieValue;
    }
    return null;
}

// Get luminance of background
function getBrightness(element) {
    const style = window.getComputedStyle(element);
    const bgColor = style.backgroundColor;

    // Extract RGB values
    const rgbMatch = bgColor.match(/\d+/g);
    if (!rgbMatch || rgbMatch.length < 3) {
        return 127; // Default to mid-brightness
    }

    const r = parseInt(rgbMatch[0]);
    const g = parseInt(rgbMatch[1]);
    const b = parseInt(rgbMatch[2]);

    // Calculate perceived brightness using standard formula
    return (r * 299 + g * 587 + b * 114) / 1000;
}

// Update text color based on background brightness
function updateTextColorForBackground() {
    const loginPage = document.querySelector('.login-page');
    const loginBox = document.querySelector('.login-panel');
    const brightness = getBrightness(loginPage);

    // If background is dark, use light text; if bright, use dark text
    const textColor = brightness > 128 ? '#333' : '#f5f5f5';
    const labelColor = brightness > 128 ? '#666' : '#ccc';
    const borderColor = brightness > 128 ? '#e0e0e0' : '#444';

    // Update login box text colors
    const header = loginBox.querySelector('.login-header');
    if (header) {
        const h2 = header.querySelector('h1');
        const p = header.querySelector('p');
        if (h2) h2.style.color = textColor;
        if (p) p.style.color = labelColor;
    }

    // Update form labels
    const labels = loginBox.querySelectorAll('label');
    labels.forEach(label => {
        label.style.color = textColor;
    });

    // Update form inputs
    const inputs = loginBox.querySelectorAll('.form-control');
    inputs.forEach(input => {
        input.style.color = textColor;
        input.style.backgroundColor = brightness > 128 ? '#f9f9f9' : '#333';
        input.style.borderColor = borderColor;
    });

    // Update remember me
    const rememberMe = loginBox.querySelector('.remember-me label');
    if (rememberMe) {
        rememberMe.style.color = textColor;
    }

    // Update footer
    const footer = loginBox.querySelector('.login-footer');
    if (footer) {
        const p = footer.querySelector('p');
        if (p) p.style.color = labelColor;
        footer.style.borderTopColor = borderColor;
    }
}