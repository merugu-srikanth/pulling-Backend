const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  page.on('requestfinished', async req => {
    const url = req.url();
    if (url.includes('swayam.gov.in') || url.includes('onlinecourses.swayam2.ac.in') || url.includes('swayam2-node') || url.includes('api')) {
      const res = req.response();
      const status = res ? res.status() : 'NORES';
      console.log('REQUEST', status, url);
      if (url.includes('/query') || url.includes('/graphql') || url.includes('explorer')) {
        try {
          const body = await res.text();
          if (body.length < 8000) {
            console.log('BODY', body.slice(0, 1000));
          } else {
            console.log('BODY LEN', body.length);
          }
        } catch (err) {
          console.error('BODY ERR', err.message);
        }
      }
    }
  });
  await page.goto('https://swayam.gov.in/explorer?category=POPULAR_COURSES', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForTimeout(10000);
  console.log('DONE');
  await browser.close();
})();