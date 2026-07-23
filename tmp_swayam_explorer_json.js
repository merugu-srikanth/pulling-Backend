const fs = require('fs');
const data = fs.readFileSync('explorer.html', 'utf8');
const start = data.indexOf('value: {');
console.log('start', start);
if (start === -1) {
  console.error('payload not found');
  process.exit(1);
}
const snippet = data.slice(start, start + 50000);
console.log(snippet);

const m1 = snippet.match(/value:\s*(\{[\s\S]*?\})\s*;\s*\n/);
console.log('m1', !!m1);

const edgesMatch = snippet.match(/"edges"\s*:\s*\[([\s\S]*?)\]/);
console.log('edgesMatch', edgesMatch ? edgesMatch[1].slice(0, 1000) : 'none');
const pageInfoMatch = snippet.match(/"pageInfo"\s*:\s*\{([\s\S]*?)\}/);
console.log('pageInfoMatch', pageInfoMatch ? pageInfoMatch[1].slice(0, 1000) : 'none');

const urlMatches = [...new Set((snippet.match(/https?:\/\/onlinecourses\.\w+\.ac\.in\/[\w\-_/]+preview/g) || []))];
console.log('preview count', urlMatches.length);
urlMatches.slice(0, 100).forEach(u => console.log(u));
