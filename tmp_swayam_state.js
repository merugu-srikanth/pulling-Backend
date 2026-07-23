const puppeteer = require('puppeteer');
const fs = require('fs');
(async () => {
  try {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    const requests = [];
    page.on('request', req => {
      const url = req.url();
      if (url.includes('swayam.gov.in') || url.includes('onlinecourses.swayam2.ac.in') || url.includes('swayam2-node') || url.includes('/api') || url.includes('/query') || url.includes('/graphql')) {
        requests.push({ type: req.resourceType(), url });
      }
    });
    await page.goto('https://swayam.gov.in/explorer?category=POPULAR_COURSES', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 10000));
    const state = await page.evaluate(() => {
      const keys = Object.keys(window).filter(k => /course|swayam|data|explorer|page|graph/i.test(k)).sort();
      const values = {};
      keys.forEach(k => {
        try {
          const v = window[k];
          values[k] = typeof v === 'string' ? v.slice(0, 1000) : (typeof v === 'object' && v ? { type: v.constructor.name, keys: Object.keys(v).slice(0, 40) } : typeof v);
        } catch (err) {
          values[k] = 'ERROR';
        }
      });
      const dataKeys = ['__NEXT_DATA__', '__INITIAL_STATE__', '__PRELOADED_STATE__', '__APOLLO_STATE__', '__DATA__', 'window'];
      return { keys, dataKeys: dataKeys.map(k => ({ key: k, exists: typeof window[k] !== 'undefined', sample: typeof window[k] === 'string' ? window[k].slice(0, 1000) : (typeof window[k] === 'object' && window[k] ? { type: window[k].constructor.name, keys: Object.keys(window[k]).slice(0, 40) } : typeof window[k])) }) ) };
    });
    fs.writeFileSync('swayam_state.json', JSON.stringify({ requests, state }, null, 2));
    console.log('saved swyam_state.json', requests.length, 'requests');
    await browser.close();
  } catch (err) {
    console.error('ERROR', err);
    process.exit(1);
  }
})();