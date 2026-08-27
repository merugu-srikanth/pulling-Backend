const axios = require('axios');
const fs = require('fs');
const cheerio = require('cheerio');
(async () => {
  function log(...args) { console.log(...args); }
  const explorerUrl = 'https://swayam.gov.in/explorer';
  log('fetching explorer page');
  const { data: explorerHtml } = await axios.get(explorerUrl, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' }, timeout: 30000 });
  fs.writeFileSync('probe_explorer.html', explorerHtml, 'utf8');
  const urls = [...new Set((explorerHtml.match(/https?:\/\/(?:[\w\-.]+)\/[^"'\s<>]+/g) || []))];
  log('total urls found in explorer HTML:', urls.length);
  const interesting = urls.filter(u => /swayam|nptel|graphql|api|search|course|preview/i.test(u));
  log('interesting urls count:', interesting.length);
  log('interesting urls sample:', interesting.slice(0,40));
  const scriptContent = cheerio.load(explorerHtml)('script').map((i,s)=>cheerio.load('')(s).text()).get().join('\n');
  const scriptUrls = [...new Set((scriptContent.match(/https?:\/\/(?:[\w\-.]+)\/[^"'\s<>]+/g) || []))];
  log('urls found in scripts:', scriptUrls.length);
  log('script urls sample:', scriptUrls.filter(u => /swayam|nptel|graphql|api|search|course|preview/i).slice(0,40));
  const sampleUrl = 'https://onlinecourses.swayam2.ac.in/ini26_hs50/preview';
  log('fetching preview sample:', sampleUrl);
  const { data: previewHtml } = await axios.get(sampleUrl, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' }, timeout: 30000 });
  fs.writeFileSync('probe_preview.html', previewHtml, 'utf8');
  log('preview html length:', previewHtml.length);
  log('preview text snippet:', previewHtml.slice(0,2000));
  const previewUrls = [...new Set((previewHtml.match(/https?:\/\/(?:[\w\-.]+)\/[^"'\s<>]+/g) || []))];
  log('preview page urls count:', previewUrls.length);
  log('preview interesting urls:', previewUrls.filter(u => /swayam|nptel|graphql|api|search|course|preview/i).slice(0,40));
})();