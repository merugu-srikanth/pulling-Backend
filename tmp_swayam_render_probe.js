const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto('https://swayam.gov.in/explorer?category=POPULAR_COURSES', { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForTimeout(5000);

    const result = await page.evaluate(() => {
      const eyes = {
        title: document.title,
        anchorCount: document.querySelectorAll('a').length,
        previewLinks: Array.from(document.querySelectorAll('a[href*="/preview"], a[href*="onlinecourses.swayam2.ac.in"]')).map(a => a.href),
        cardLinks: Array.from(document.querySelectorAll('[href*="/preview"], [href*="onlinecourses.swayam2.ac.in"]')).map(el => el.href),
        allLinks: Array.from(document.querySelectorAll('a[href]')).map(a => a.href),
        renderedText: document.body.innerText.slice(0, 1000),
      };
      return eyes;
    });

    console.log('TITLE', result.title);
    console.log('ANCHOR COUNT', result.anchorCount);
    console.log('PREVIEW COUNT', result.previewLinks.length);
    console.log('CARD COUNT', result.cardLinks.length);
    console.log('PREVIEW LINKS SAMPLE');
    result.previewLinks.slice(0, 120).forEach((link, idx) => console.log(`${idx+1}: ${link}`));
    fs.writeFileSync('explorer_rendered.json', JSON.stringify(result, null, 2));
    await browser.close();
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
})();