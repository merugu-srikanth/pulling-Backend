const fs = require('fs');
const text = fs.readFileSync('explorer.html', 'utf8');
for (const token of ['"edges"', 'edges:', '"pageInfo"', 'pageInfo:']) {
  let idx = 0;
  while (true) {
    idx = text.indexOf(token, idx);
    if (idx === -1) break;
    const start = Math.max(0, idx - 200);
    const end = Math.min(text.length, idx + 800);
    console.log('TOKEN', token, 'INDEX', idx);
    console.log(text.slice(start, end));
    console.log('---');
    idx += token.length;
  }
}
