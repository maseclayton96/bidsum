const fs = require('fs');
const html = fs.readFileSync('index.html','utf8');
const m = html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/);
if (!m) { console.error('no script'); process.exit(1); }
fs.writeFileSync('temp-inline.js', m[1]);
try { new Function(m[1]); console.log('syntax ok'); }
catch (e) { console.error(e.stack); process.exit(1); }
