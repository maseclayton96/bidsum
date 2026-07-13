const fs = require('fs');
const html = fs.readFileSync('index.html','utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if(!m) throw new Error('inline script not found');
const code = m[1];
fs.writeFileSync('temp-inline.cjs', code);
new Function(code);
console.log('syntax ok');
