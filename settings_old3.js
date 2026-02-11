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
                }
            }
        });
    });
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
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${displayUserId}</td>
            <td>${user.username}</td>
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

        user.userId = userIdValue;
        user.username = username;
        user.email = email;
        // Only update password if a new one is provided
        if (password) {
            console.log('Updating password for user:', user.username);
            console.log('Old password type:', typeof user.password);
            console.log('Old password:', user.password);
            console.log('New password type:', typeof password);
            console.log('New password:', password);
            user.password = password;
            console.log('Updated password type:', typeof user.password);
            console.log('Updated password:', user.password);
        }
        user.role = role;

        const updatedUsers = users.map(u => (u.id === userId || u.userId === userId) ? user : u);
        console.log('Saving updated users:', updatedUsers);
        localStorage.setItem('users', JSON.stringify(updatedUsers));
        console.log('Users saved to localStorage');

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
    // Company Logo Upload
    const companyLogoUpload = document.getElementById('companyLogoUpload');
    const companyLogoInput = document.getElementById('companyLogoInput');
    const companyLogoPreview = document.getElementById('companyLogoPreview');
    const removeCompanyLogoBtn = document.getElementById('removeCompanyLogoBtn');

    // Load saved company logo
    const savedCompanyLogo = localStorage.getItem('companyLogo');
    if (savedCompanyLogo) {
        companyLogoPreview.src = savedCompanyLogo;
        companyLogoPreview.style.display = 'block';
        removeCompanyLogoBtn.style.display = 'inline-block';
    }

    companyLogoUpload.addEventListener('click', () => {
        companyLogoInput.click();
    });

    companyLogoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target.result;
                companyLogoPreview.src = dataUrl;
                companyLogoPreview.style.display = 'block';
                removeCompanyLogoBtn.style.display = 'inline-block';
                localStorage.setItem('companyLogo', dataUrl);
            };
            reader.readAsDataURL(file);
        }
    });

    removeCompanyLogoBtn.addEventListener('click', () => {
        companyLogoPreview.src = '';
        companyLogoPreview.style.display = 'none';
        removeCompanyLogoBtn.style.display = 'none';
        localStorage.removeItem('companyLogo');
    });

    // Department Logo Upload
    const departmentLogoUpload = document.getElementById('departmentLogoUpload');
    const departmentLogoInput = document.getElementById('departmentLogoInput');
    const departmentLogoPreview = document.getElementById('departmentLogoPreview');
    const removeDepartmentLogoBtn = document.getElementById('removeDepartmentLogoBtn');

    // Load saved department logo
    const savedDepartmentLogo = localStorage.getItem('departmentLogo');
    if (savedDepartmentLogo) {
        departmentLogoPreview.src = savedDepartmentLogo;
        departmentLogoPreview.style.display = 'block';
        removeDepartmentLogoBtn.style.display = 'inline-block';
    }

    departmentLogoUpload.addEventListener('click', () => {
        departmentLogoInput.click();
    });

    departmentLogoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target.result;
                departmentLogoPreview.src = dataUrl;
                departmentLogoPreview.style.display = 'block';
                removeDepartmentLogoBtn.style.display = 'inline-block';
                localStorage.setItem('departmentLogo', dataUrl);
            };
            reader.readAsDataURL(file);
        }
    });

    removeDepartmentLogoBtn.addEventListener('click', () => {
        departmentLogoPreview.src = '';
        departmentLogoPreview.style.display = 'none';
        removeDepartmentLogoBtn.style.display = 'none';
        localStorage.removeItem('departmentLogo');
    });
}

// Initialize settings page
document.addEventListener('DOMContentLoaded', function() {
    // Initialize tab switching
    initializeTabSwitching();

    // Set default tab to users
    const usersTab = document.querySelector('[data-tab="users-tab"]');
    if (usersTab) {
        usersTab.click();
    }
});
