const fs = require('fs');
const html = fs.readFileSync('pad_test.html', 'utf8');

const match = html.match(/1&ordm;.*?2026/);
if (match) {
    console.log("Found:", JSON.stringify(match[0]));
} else {
    // try uppercase
    const match2 = html.match(/1.*?2026/g);
    console.log("Found anything like 1...2026:", JSON.stringify(match2));
}
