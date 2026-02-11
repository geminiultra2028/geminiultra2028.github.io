// Settings Page JavaScript - Fixed Version

// Tab Switching Functionality
function initializeTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');

            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            this.classList.add('active');
            const activeTab = document.getElementById(tabName);
            if (activeTab) {
                activeTab.classList.add('active');

                // Load content based on tab
                if (tabName === 'users-tab') {
                    loadUsers();
                } else if (tabName === 'logo-tab') {
                    initializeLogoUpload();
                } else if (tabName === 'database-tab') {
                    loadDatabaseSettings();
                    bindDatabaseForm();
                } else if (tabName === 'email-tab') {
                    loadEmailSettings();
                    bindEmailSettingsForm();
                }
            }
        });
    });
}

function loadEmailSettings() {
    const hostEl = document.getElementById('smtpHost');
    const portEl = document.getElementById('smtpPort');
    const usernameEl = document.getElementById('smtpUsername');
    const passwordEl = document.getElementById('smtpPassword');
    const fromEmailEl = document.getElementById('smtpFromEmail');
    const fromNameEl = document.getElementById('smtpFromName');
    const secureEl = document.getElementById('smtpSecure');

    if (!hostEl || !portEl || !usernameEl || !passwordEl || !fromEmailEl || !secureEl) return;

    const stored = localStorage.getItem('smtpSettings');
    if (!stored) return;

    try {
        const settings = JSON.parse(stored) || {};
        hostEl.value = settings.host || '';
        portEl.value = settings.port || '';
        usernameEl.value = settings.username || '';
        passwordEl.value = settings.password || '';
        fromEmailEl.value = settings.fromEmail || '';
        if (fromNameEl) fromNameEl.value = settings.fromName || '';
        if (secureEl) secureEl.value = settings.secure || 'tls';
    } catch (e) {
        console.error('Failed to load SMTP settings:', e);
    }
}

function bindEmailSettingsForm() {
    const emailForm = document.getElementById('emailSettingsForm');
    if (!emailForm || emailForm.dataset.bound === 'true') return;
    emailForm.dataset.bound = 'true';

    const testSmtpBtn = document.getElementById('testSmtpBtn');

    emailForm.addEventListener('submit', function(e) {
        e.preventDefault();

        const host = document.getElementById('smtpHost')?.value.trim() || '';
        const port = document.getElementById('smtpPort')?.value.trim() || '';
        const username = document.getElementById('smtpUsername')?.value.trim() || '';
        const password = document.getElementById('smtpPassword')?.value || '';
        const fromEmail = document.getElementById('smtpFromEmail')?.value.trim() || '';
        const fromName = document.getElementById('smtpFromName')?.value.trim() || '';
        const secure = document.getElementById('smtpSecure')?.value || 'tls';

        if (!host || !port || !username || !password || !fromEmail) {
            alert('Please fill in all required SMTP fields.');
            return;
        }

        const smtpSettings = {
            host,
            port,
            username,
            password,
            fromEmail,
            fromName,
            secure
        };

        localStorage.setItem('smtpSettings', JSON.stringify(smtpSettings));

        try {
            const appSettings = JSON.parse(localStorage.getItem('appSettings') || '{}');
            appSettings.smtpSettings = JSON.stringify(smtpSettings);
            localStorage.setItem('appSettings', JSON.stringify(appSettings));
        } catch {
            // ignore
        }

        fetch('/api/smtp-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(smtpSettings)
        })
            .then(response => response.json().then(data => ({ ok: response.ok, data })))
            .then(({ ok, data }) => {
                if (!ok || !data || !data.success) {
                    const msg = (data && data.message) ? data.message : 'Failed to save SMTP settings on server.';
                    alert(`Saved locally, but server save failed: ${msg}`);
                    return;
                }
                alert('SMTP settings saved successfully.');
            })
            .catch((err) => {
                console.error('Failed to save SMTP settings on server:', err);
                alert('Saved locally, but server save failed. Please try again.');
            });
    });

    if (testSmtpBtn && testSmtpBtn.dataset.bound !== 'true') {
        testSmtpBtn.dataset.bound = 'true';
        testSmtpBtn.addEventListener('click', async () => {
            const host = document.getElementById('smtpHost')?.value.trim() || '';
            const port = document.getElementById('smtpPort')?.value.trim() || '';
            const username = document.getElementById('smtpUsername')?.value.trim() || '';
            const password = document.getElementById('smtpPassword')?.value || '';
            const fromEmail = document.getElementById('smtpFromEmail')?.value.trim() || '';
            const fromName = document.getElementById('smtpFromName')?.value.trim() || '';
            const secure = document.getElementById('smtpSecure')?.value || 'tls';

            if (!host || !port || !username || !password || !fromEmail) {
                alert('Please fill in all required SMTP fields before testing.');
                return;
            }

            const originalText = testSmtpBtn.innerHTML;
            testSmtpBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
            testSmtpBtn.disabled = true;

            try {
                const response = await fetch('/api/test-smtp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        host,
                        port,
                        username,
                        password,
                        fromEmail,
                        fromName,
                        secure
                    })
                });

                const result = await response.json().catch(() => ({}));
                if (response.ok && result && result.success) {
                    alert('✓ ' + (result.message || 'SMTP connection succeeded.'));
                } else {
                    const extra = result && (result.code || result.command)
                        ? ` (${[result.code, result.command].filter(Boolean).join(', ')})`
                        : '';
                    alert('✗ ' + (result.message || 'SMTP connection failed.') + extra);
                }
            } catch (error) {
                console.error('SMTP test error:', error);
                alert('✗ Failed to test SMTP connection: ' + (error.message || 'Unknown error'));
            } finally {
                testSmtpBtn.innerHTML = originalText;
                testSmtpBtn.disabled = false;
            }
        });
    }
}

// Load Users Function
function loadUsers() {
    const usersTableBody = document.getElementById('usersTableBody');
    if (!usersTableBody) return;

    // Get users from localStorage
    const users = JSON.parse(localStorage.getItem('users') || '[]');

    // Clear existing table rows
    usersTableBody.innerHTML = '';

    if (users.length === 0) {
        usersTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">No users found</td></tr>';
        return;
    }

    // Populate table with users
    users.forEach((user, index) => {
        const row = document.createElement('tr');
        // Display Master for all records with undefined userId
        const displayUserId = user.userId || 'Master';
        // Display name if available, otherwise show username
        const displayName = user.name || user.username || '-';
        // Display staff ID if available
        const displayStaffId = user.staffId || '-';
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${displayUserId}</td>
            <td>${displayName}</td>
            <td>${displayStaffId}</td>
            <td>${user.email || '-'}</td>
            <td>${user.role}</td>
            <td>
                <button class="btn btn-sm btn-edit" onclick="editUser('${user.id || user.userId}')">Edit</button>
                <button class="btn btn-sm btn-delete" onclick="deleteUser('${user.id || user.userId}')">Delete</button>
            </td>
        `;
        usersTableBody.appendChild(row);
    });
}

// Edit User Function
function editUser(userId) {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(u => u.id === userId || u.userId === userId);

    if (!user) {
        alert('User not found');
        return;
    }

    // Create edit modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h3>Edit User</h3>
            <form id="editUserForm">
                <div class="form-group">
                    <label for="editUserId">User ID: <span style="color: red;">*</span></label>
                    <input type="text" id="editUserId" class="form-control" value="${user.userId || ''}" required>
                    <small style="color: red; display: none;" id="editUserIdError"></small>
                </div>
                <div class="form-group">
                    <label for="editName">Full Name:</label>
                    <input type="text" id="editName" class="form-control" value="${user.name || user.username || ''}">
                </div>
                <div class="form-group">
                    <label for="editStaffId">Staff ID:</label>
                    <input type="text" id="editStaffId" class="form-control" value="${user.staffId || ''}">
                </div>
                <div class="form-group">
                    <label for="editDepartment">Department:</label>
                    <input type="text" id="editDepartment" class="form-control" value="${user.department || ''}">
                </div>
                <div class="form-group">
                    <label for="editApprover">Approver:</label>
                    <input type="text" id="editApprover" class="form-control" value="${user.approver || ''}">
                </div>
                <div class="form-group">
                    <label for="editBasicSalary">Basic Salary:</label>
                    <input type="number" id="editBasicSalary" class="form-control" value="${user.basicSalary || ''}" step="0.01">
                </div>
                <div class="form-group">
                    <label for="editUsername">Username:</label>
                    <input type="text" id="editUsername" class="form-control" value="${user.username}" required>
                </div>
                <div class="form-group">
                    <label for="editEmail">Email:</label>
                    <input type="email" id="editEmail" class="form-control" value="${user.email || ''}" required>
                </div>
                <div class="form-group">
                    <label for="editPassword">Password:</label>
                    <input type="password" id="editPassword" class="form-control" placeholder="Leave blank to keep current password">
                </div>
                <div class="form-group">
                    <label for="editRole">Role:</label>
                    <select id="editRole" class="form-control" required>
                        <option value="">Select Role</option>
                        <option value="User" ${user.role === 'User' ? 'selected' : ''}>User</option>
                        <option value="Supervisor" ${user.role === 'Supervisor' ? 'selected' : ''}>Supervisor</option>
                        <option value="Manager" ${user.role === 'Manager' ? 'selected' : ''}>Manager</option>
                        <option value="Administrator" ${user.role === 'Administrator' ? 'selected' : ''}>Administrator</option>
                    </select>
                </div>
                <button type="submit" class="btn btn-confirm">Save Changes</button>
                <button type="button" class="btn btn-cancel" id="cancelEditBtn">Cancel</button>
            </form>
        </div>
    `;

    document.body.appendChild(modal);
    modal.style.display = 'flex';

    // Close modal
    const closeBtn = modal.querySelector('.close');
    const cancelBtn = modal.querySelector('#cancelEditBtn');
    const editUserIdInput = modal.querySelector('#editUserId');
    const editUserIdErrorMsg = modal.querySelector('#editUserIdError');

    closeBtn.addEventListener('click', () => modal.remove());
    cancelBtn.addEventListener('click', () => modal.remove());

    // Validate User ID on input change
    editUserIdInput.addEventListener('blur', function() {
        const userIdValue = this.value.trim();

        if (!userIdValue) {
            editUserIdErrorMsg.textContent = 'User ID is required';
            editUserIdErrorMsg.style.display = 'block';
            return;
        }

        // Check if new User ID is duplicate (excluding current user)
        if (users.some(u => u.userId === userIdValue && (u.id !== userId && u.userId !== userId))) {
            editUserIdErrorMsg.textContent = 'This User ID already exists. Please choose a different ID.';
            editUserIdErrorMsg.style.display = 'block';
        } else {
            editUserIdErrorMsg.style.display = 'none';
        }
    });

    // Handle form submission
    const form = modal.querySelector('#editUserForm');
    form.addEventListener('submit', function(e) {
        e.preventDefault();

        const userIdValue = editUserIdInput.value.trim();
        const name = document.getElementById('editName').value.trim();
        const staffId = document.getElementById('editStaffId').value.trim();
        const department = document.getElementById('editDepartment').value.trim();
        const approver = document.getElementById('editApprover').value.trim();
        const basicSalary = document.getElementById('editBasicSalary').value;
        const username = document.getElementById('editUsername').value.trim();
        const email = document.getElementById('editEmail').value.trim();
        const password = document.getElementById('editPassword').value;
        const role = document.getElementById('editRole').value;

        // Validate User ID
        if (!userIdValue) {
            editUserIdErrorMsg.textContent = 'User ID is required';
            editUserIdErrorMsg.style.display = 'block';
            return;
        }

        if (users.some(u => u.userId === userIdValue && (u.id !== userId && u.userId !== userId))) {
            editUserIdErrorMsg.textContent = 'This User ID already exists. Please choose a different ID.';
            editUserIdErrorMsg.style.display = 'block';
            return;
        }

        // Validate Role
        if (!role) {
            alert('Please select a role');
            return;
        }

        // Create a new user object with updated values
        const updatedUser = {
            id: user.id || user.userId, // Preserve the ID
            userId: userIdValue,
            name: name || username, // Use name if provided, otherwise fallback to username
            staffId: staffId,
            department: department,
            approver: approver,
            basicSalary: basicSalary ? parseFloat(basicSalary) : undefined,
            username: username,
            email: email,
            role: role
        };

        // Only update password if a new one is provided
        if (password) {
            updatedUser.password = password;
        } else {
            // Keep the existing password
            updatedUser.password = user.password;
        }

        // Update users array
        const updatedUsers = users.map(u => (u.id === userId || u.userId === userId) ? updatedUser : u);

        // Save to localStorage
        localStorage.setItem('users', JSON.stringify(updatedUsers));

        modal.remove();
        loadUsers();
        alert('User updated successfully!');
    });
}

function deleteUser(userId) {
    if (confirm('Are you sure you want to delete this user?')) {
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const updatedUsers = users.filter(user => user.id !== userId && user.userId !== userId);
        localStorage.setItem('users', JSON.stringify(updatedUsers));
        loadUsers();
        alert('User deleted successfully!');
    }
}

// Initialize Logo Upload
function initializeLogoUpload() {
    // Logos are stored in localStorage as data URLs. Large PNGs can easily exceed browser quota.
    // We always downscale + convert to JPEG before persisting.
    const LOGO_MAX_WIDTH = 600;
    const LOGO_MAX_HEIGHT = 220;
    const LOGO_JPEG_QUALITY = 0.85;

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    function loadImageFromDataUrl(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = dataUrl;
        });
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
            reader.readAsDataURL(blob);
        });
    }

    async function downscaleLogoToJpegDataUrl(sourceDataUrl, { maxWidth, maxHeight, quality }) {
        const img = await loadImageFromDataUrl(sourceDataUrl);

        const naturalW = img.naturalWidth || img.width || 1;
        const naturalH = img.naturalHeight || img.height || 1;

        const scale = Math.min(1, maxWidth / naturalW, maxHeight / naturalH);
        const targetW = Math.max(1, Math.round(naturalW * scale));
        const targetH = Math.max(1, Math.round(naturalH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            // Fallback: store original data URL (may still fail quota)
            return sourceDataUrl;
        }

        // JPEG has no alpha; flatten on white.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error('Failed to encode JPEG'))),
                'image/jpeg',
                quality
            );
        });

        return blobToDataUrl(blob);
    }

    function getOrCreatePreviewImg(previewEl, altText) {
        if (!previewEl) return null;

        // If the preview element is already an <img>, use it directly.
        if (previewEl.tagName && previewEl.tagName.toLowerCase() === 'img') {
            if (altText) previewEl.alt = altText;
            return previewEl;
        }

        // Otherwise, the preview is a container (e.g., <div class="logo-preview">).
        let img = previewEl.querySelector('img');
        if (!img) {
            img = document.createElement('img');
            img.alt = altText || 'Logo preview';
            previewEl.innerHTML = '';
            previewEl.appendChild(img);
        }
        return img;
    }

    function setPreview(previewEl, dataUrl, altText) {
        const img = getOrCreatePreviewImg(previewEl, altText);
        if (!img) return;
        img.src = dataUrl;

        // Ensure the preview container is visible.
        if (previewEl && previewEl.style) {
            previewEl.style.display = 'flex';
        }
    }

    function clearPreview(previewEl) {
        const img = getOrCreatePreviewImg(previewEl, 'Logo preview');
        if (img) img.src = '';

        if (previewEl && previewEl.style) {
            previewEl.style.display = 'none';
        }
    }

    function bindLogoUploader({
        uploadEl,
        inputEl,
        previewEl,
        removeBtn,
        storageKey,
        altText,
    }) {
        if (!inputEl || !storageKey) return;

        // Always refresh preview from storage when opening the tab.
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            setPreview(previewEl, saved, altText);
            if (removeBtn) removeBtn.style.display = 'inline-block';
        } else {
            clearPreview(previewEl);
            if (removeBtn) removeBtn.style.display = 'none';
        }

        // Avoid double-binding if user toggles tabs.
        if (inputEl.dataset.logoUploadBound === 'true') {
            return;
        }
        inputEl.dataset.logoUploadBound = 'true';

        if (uploadEl) {
            uploadEl.addEventListener('click', () => {
                inputEl.click();
            });
        }

        inputEl.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            try {
                const rawDataUrl = await readFileAsDataUrl(file);
                const dataUrl = await downscaleLogoToJpegDataUrl(rawDataUrl, {
                    maxWidth: LOGO_MAX_WIDTH,
                    maxHeight: LOGO_MAX_HEIGHT,
                    quality: LOGO_JPEG_QUALITY,
                });

                setPreview(previewEl, dataUrl, altText);
                if (removeBtn) removeBtn.style.display = 'inline-block';

                try {
                    localStorage.setItem(storageKey, dataUrl);
                } catch (err) {
                    console.error('Failed to save logo to localStorage:', err);
                    alert('Unable to save logo. Please try a smaller image file.');
                }
            } catch (err) {
                console.error('Failed to load logo:', err);
                alert('Failed to load logo. Please try again.');
            }
        });

        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                localStorage.removeItem(storageKey);
                inputEl.value = '';
                clearPreview(previewEl);
                removeBtn.style.display = 'none';
            });
        }
    }

    // Company Logo Upload
    const companyLogoUpload = document.getElementById('companyLogoUpload');
    const companyLogoInput = document.getElementById('companyLogoInput');
    const companyLogoPreview = document.getElementById('companyLogoPreview');
    const removeCompanyLogoBtn = document.getElementById('removeCompanyLogoBtn');

    bindLogoUploader({
        uploadEl: companyLogoUpload,
        inputEl: companyLogoInput,
        previewEl: companyLogoPreview,
        removeBtn: removeCompanyLogoBtn,
        storageKey: 'companyLogo',
        altText: 'Company logo preview',
    });

    // Department Logo Upload (support both the old and current IDs)
    const departmentLogoUpload = document.getElementById('departmentLogoUpload') || document.getElementById('deptLogoUpload');
    const departmentLogoInput = document.getElementById('departmentLogoInput') || document.getElementById('deptLogoInput');
    const departmentLogoPreview = document.getElementById('departmentLogoPreview') || document.getElementById('deptLogoPreview');
    const removeDepartmentLogoBtn = document.getElementById('removeDepartmentLogoBtn') || document.getElementById('removeDeptLogoBtn');

    bindLogoUploader({
        uploadEl: departmentLogoUpload,
        inputEl: departmentLogoInput,
        previewEl: departmentLogoPreview,
        removeBtn: removeDepartmentLogoBtn,
        storageKey: 'departmentLogo',
        altText: 'Department logo preview',
    });

    // Optional explicit save buttons (some users prefer an explicit save action)
    const saveLogosBtn = document.getElementById('saveLogosBtn');
    const saveDeptLogoBtn = document.getElementById('saveDeptLogoBtn');

    function getPreviewDataUrl(previewEl) {
        if (!previewEl) return '';
        // preview may be an <img> or a container with an <img>
        const img = (previewEl.tagName && previewEl.tagName.toLowerCase() === 'img')
            ? previewEl
            : previewEl.querySelector('img');
        const src = img && img.getAttribute('src');
        return typeof src === 'string' ? src : '';
    }

    async function persistPreview(previewEl, storageKey, label) {
        const dataUrl = getPreviewDataUrl(previewEl);
        if (!dataUrl || !dataUrl.startsWith('data:image')) {
            alert(`No ${label} selected to save.`);
            return false;
        }

        // Ensure the persisted data is compact.
        let toStore = dataUrl;
        try {
            toStore = await downscaleLogoToJpegDataUrl(dataUrl, {
                maxWidth: LOGO_MAX_WIDTH,
                maxHeight: LOGO_MAX_HEIGHT,
                quality: LOGO_JPEG_QUALITY,
            });
        } catch (e) {
            // If compression fails, fall back to original.
            toStore = dataUrl;
        }

        try {
            localStorage.setItem(storageKey, toStore);
            // Keep the preview in sync with the persisted (possibly compressed) value.
            setPreview(previewEl, toStore);
            return true;
        } catch (e) {
            // Common failure: QuotaExceededError for large images/base64.
            console.error('Failed to save logo to localStorage:', e);
            alert(`Unable to save ${label}. The image may be too large for browser storage. Please try a smaller file.`);
            return false;
        }
    }

    if (saveLogosBtn && saveLogosBtn.dataset.logoSaveBound !== 'true') {
        saveLogosBtn.dataset.logoSaveBound = 'true';
        // UI label is "Save Company Logo"; keep behavior consistent with the label.
        saveLogosBtn.addEventListener('click', async () => {
            if (await persistPreview(companyLogoPreview, 'companyLogo', 'Company Logo')) {
                alert('Company Logo saved successfully.');
            }
        });
    }

    if (saveDeptLogoBtn && saveDeptLogoBtn.dataset.logoSaveBound !== 'true') {
        saveDeptLogoBtn.dataset.logoSaveBound = 'true';
        saveDeptLogoBtn.addEventListener('click', async () => {
            if (await persistPreview(departmentLogoPreview, 'departmentLogo', 'Department Logo')) {
                alert('Department Logo saved successfully.');
            }
        });
    }
}

function loadDatabaseSettings() {
    const savedSettings = localStorage.getItem('databaseSettings');
    if (!savedSettings) return;

    try {
        const settings = JSON.parse(savedSettings) || {};
        const typeEl = document.getElementById('dbType');
        const hostEl = document.getElementById('dbHost');
        const portEl = document.getElementById('dbPort');
        const nameEl = document.getElementById('dbName');
        const userEl = document.getElementById('dbUser');
        const passEl = document.getElementById('dbPassword');

        if (typeEl) typeEl.value = settings.type || '';
        if (hostEl) hostEl.value = settings.host || '';
        if (portEl) portEl.value = settings.port || '';
        if (nameEl) nameEl.value = settings.name || '';
        if (userEl) userEl.value = settings.user || '';
        if (passEl) passEl.value = settings.password || '';
    } catch (e) {
        console.error('Error loading database settings:', e);
    }
}

function bindDatabaseForm() {
    const databaseForm = document.getElementById('databaseForm');
    const testConnectionBtn = document.getElementById('testConnectionBtn');

    if (databaseForm && databaseForm.dataset.bound !== 'true') {
        databaseForm.dataset.bound = 'true';
        databaseForm.addEventListener('submit', function(e) {
            e.preventDefault();

            const dbType = document.getElementById('dbType')?.value || '';
            const dbHost = document.getElementById('dbHost')?.value || '';
            const dbPort = document.getElementById('dbPort')?.value || '';
            const dbName = document.getElementById('dbName')?.value || '';
            const dbUser = document.getElementById('dbUser')?.value || '';
            const dbPassword = document.getElementById('dbPassword')?.value || '';

            const dbSettings = {
                type: dbType,
                host: dbHost,
                port: dbPort,
                name: dbName,
                user: dbUser,
                password: dbPassword
            };

            localStorage.setItem('databaseSettings', JSON.stringify(dbSettings));
            alert('Database connection settings saved successfully!');
        });
    }

    if (testConnectionBtn && testConnectionBtn.dataset.bound !== 'true') {
        testConnectionBtn.dataset.bound = 'true';
        testConnectionBtn.addEventListener('click', async function() {
            const dbType = document.getElementById('dbType')?.value || '';
            const dbHost = document.getElementById('dbHost')?.value || '';
            const dbPort = document.getElementById('dbPort')?.value || '';
            const dbName = document.getElementById('dbName')?.value || '';
            const dbUser = document.getElementById('dbUser')?.value || '';
            const dbPassword = document.getElementById('dbPassword')?.value || '';

            if (!dbType || !dbHost || !dbPort || !dbName || !dbUser) {
                alert('Please fill in all required fields before testing the connection.');
                return;
            }

            const originalText = testConnectionBtn.innerHTML;
            testConnectionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
            testConnectionBtn.disabled = true;

            try {
                const response = await fetch('/api/test-connection', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: dbType,
                        host: dbHost,
                        port: dbPort,
                        name: dbName,
                        user: dbUser,
                        password: dbPassword
                    })
                });

                const result = await response.json().catch(() => ({}));
                if (response.ok && result && result.success) {
                    alert('✓ ' + (result.message || 'Connection test succeeded.'));
                } else {
                    alert('✗ ' + (result.message || 'Connection test failed.'));
                }
            } catch (error) {
                console.error('Connection test error:', error);
                alert('✗ Failed to test connection: ' + (error.message || 'Unknown error'));
            } finally {
                testConnectionBtn.innerHTML = originalText;
                testConnectionBtn.disabled = false;
            }
        });
    }
}

// Initialize settings page
document.addEventListener('DOMContentLoaded', function() {
    // Initialize tab switching
    initializeTabSwitching();
    bindDatabaseForm();
    loadDatabaseSettings();
    loadEmailSettings();
    bindEmailSettingsForm();

    // Load users on page load
    loadUsers();
});
