// Debug function to check password updates
function checkPasswordUpdate() {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    console.log('All users in localStorage:', users);

    // Check if Master Admin user exists
    const adminUser = users.find(u => u.username === 'Admin');
    if (adminUser) {
        console.log('Admin user found:', adminUser);
        console.log('Admin password:', adminUser.password);
    } else {
        console.log('Admin user not found');
    }

    // Check for any user with a specific username (replace with actual username)
    const testUsername = 'testuser'; // Replace with actual username to test
    const testUser = users.find(u => u.username === testUsername);
    if (testUser) {
        console.log(`Test user (${testUsername}) found:`, testUser);
        console.log(`Test user password:`, testUser.password);
    } else {
        console.log(`Test user (${testUsername}) not found`);
    }
}

// Call this function in browser console after updating a password to check if it was saved correctly
// Just type: checkPasswordUpdate()
