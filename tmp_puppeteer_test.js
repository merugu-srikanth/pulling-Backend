const puppeteer = require('puppeteer');
(async () => {
  try {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
    console.log('browser ok');
    const page = await browser.newPage();
    console.log('page ok', typeof page.goto, typeof page.evaluate);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto('https://swayam.gov.in/explorer?category=POPULAR_COURSES', { waitUntil: 'networkidle2', timeout: 60000 });
    const links = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map(a => a.href));
    console.log('link count', links.length);
    console.log('sample', links.slice(0,20));
    await browser.close();
  } catch (err) {
    console.error('ERROR', err);
  }
})();