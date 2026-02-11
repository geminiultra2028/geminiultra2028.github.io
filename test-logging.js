// Load the script.js functions in Node.js environment
// Simulate localStorage for Node.js
global.localStorage = {
    data: {},
    getItem: function(key) {
        return this.data[key] || null;
    },
    setItem: function(key, value) {
        this.data[key] = value;
    },
    removeItem: function(key) {
        delete this.data[key];
    }
};

// Read and execute script.js functions
const fs = require('fs');
const scriptContent = fs.readFileSync('./script.js', 'utf-8');

// Extract and execute just the functions we need
const isPublicHolidayMatch = scriptContent.match(/function isPublicHoliday[\s\S]*?^}/m);
if (isPublicHolidayMatch) {
    eval(isPublicHolidayMatch[0]);
}

// Test cases
console.log('\n=== Testing isPublicHoliday function ===\n');

const testCases = [
    'PH (New Year)',
    'PH (Thaipusam)',
    'PH',
    'Public Holiday (Chinese New Year)',
    'Public Holiday',
    'ph',
    'public holiday',
    'ABSENT',
    'PH - Medical Leave',
    'Medical Leave',
    null,
    undefined,
    '',
];

testCases.forEach(testCase => {
    console.log(`\nTesting: "${testCase}"`);
    console.log(`Result: ${isPublicHoliday(testCase)}`);
    console.log('---');
});
