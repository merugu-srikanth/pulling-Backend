const fs = require('fs');
const text = fs.readFileSync('explorer.html', 'utf8');
const needle = 'value: {';
const pos = text.indexOf(needle);
console.log('pos', pos);
if (pos === -1) process.exit(1);
let depth = 0;
let inString = false;
let escape = false;
let start = -1;
for (let i = pos; i < text.length; i++) {
  const ch = text[i];
  if (ch === '"' && !escape) {
    inString = !inString;
  }
  escape = ch === '\\' && !escape;
  if (inString) continue;
  if (ch === '{') {
    if (depth === 0) start = i;
    depth++;
  }
  if (ch === '}') {
    depth--;
    if (depth === 0) {
      const jsonText = text.slice(start, i + 1);
      console.log('EXTRACT LEN', jsonText.length);
      fs.writeFileSync('explorer_payload.json', jsonText);
      console.log('SAVED explorer_payload.json');
      break;
    }
  }
}
