const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function inspectExplorer() {
  const url = 'https://swayam.gov.in/explorer?category=POPULAR_COURSES';
  const { data } = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      Accept: 'text/html',
    },
    timeout: 20000,
  });
  fs.writeFileSync('explorer.html', data);
  const $ = cheerio.load(data);
  const scripts = $('script').map((i,s) => $(s).html() || '').get();
  const combined = scripts.join('\n');
  const regex = /https?:\/\/[\w\-\.\/:?=&%]+/g;
  const all = [...new Set((combined.match(regex) || []))];
  const swayamUrls = all.filter(u => u.includes('swayam.gov.in') || u.includes('swayam2.ac.in') || u.includes('onlinecourses.swayam2.ac.in'));
  console.log('TOTAL SCRIPT URLS', all.length);
  console.log('SWAYAM URLS', swayamUrls.length);
  const preview = swayamUrls.filter(u => /preview/i.test(u));
  console.log('PREVIEW URLS', preview.length);
  preview.slice(0,120).forEach((u,i) => console.log(`${i+1}: ${u}`));
  const possibleApi = all.filter(u => /api|search|content|course|loadMore|query/i.test(u));
  console.log('POSSIBLE API/SEARCH URLS', possibleApi.length);
  possibleApi.slice(0,120).forEach((u,i) => console.log(`${i+1}: ${u}`));
}

async function inspectPreview() {
  const url = 'https://onlinecourses.nptel.ac.in/noc26_cs98/preview';
  const { data } = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      Accept: 'text/html',
    },
    timeout: 20000,
  });
  fs.writeFileSync('preview.html', data);
  const $ = cheerio.load(data);
  console.log('TITLE', $('title').text().trim());
  const text = $('body').text();
  console.log('BODY TEXT LENGTH', text.length);
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  console.log('LINES COUNT', lines.length);
  console.log('FIRST 120 LINES');
  console.log(lines.slice(0,120).join('\n---\n'));
  const durationMatches = data.match(/(duration|Duration|weeks|Weeks|months|Months|Days|days)/g) || [];
  console.log('DURATION MATCHES', durationMatches.length);
  console.log(durationMatches.slice(0,40));
}

(async () => {
  try {
    await inspectExplorer();
    await inspectPreview();
  } catch (err) {
    console.error('ERROR', err.message || err);
  }
})();