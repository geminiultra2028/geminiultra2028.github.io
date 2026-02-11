
const { exec } = require('child_process');
const os = require('os');

// Get the port from server.js or use default
const PORT = process.env.PORT || 3001;

console.log('Checking network accessibility for Attendance App...');
console.log('=====================================');

// Check if Windows Firewall is blocking the port
exec(`netsh advfirewall firewall show rule name="Attendance App Port ${PORT}"`, (error, stdout, stderr) => {
    if (error) {
        console.log(`No firewall rule found for port ${PORT}. Creating one now...`);

        // Add a new firewall rule to allow incoming connections on the port
        exec(`netsh advfirewall firewall add rule name="Attendance App Port ${PORT}" dir=in action=allow protocol=TCP localport=${PORT}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error creating firewall rule: ${error}`);
                return;
            }
            console.log(`✓ Successfully created firewall rule to allow connections on port ${PORT}`);
            console.log('Please restart your server for changes to take effect.');
        });
    } else {
        console.log(`✓ Firewall rule already exists for port ${PORT}`);
    }
});

// Get network interfaces
const interfaces = os.networkInterfaces();
console.log('\nNetwork interfaces:');
for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
            console.log(`  - ${name}: ${iface.address} (http://${iface.address}:${PORT})`);
        }
    }
}

console.log('\nTroubleshooting tips:');
console.log('1. Make sure all devices are on the same network');
console.log('2. Try accessing the app using the IP address shown above');
console.log('3. If still not accessible, check your router settings');
