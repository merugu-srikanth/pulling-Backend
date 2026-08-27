const puppeteer = require('puppeteer');
const fs = require('fs');
(async () => {
  const url = 'https://onlinecourses.swayam2.ac.in/e-learning/preview/ini26_hs50';
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 5000));
  const tabs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a, div, span')).filter(el => /Course Information|Course outline|Summary|Instructor Bio|Books and References|Course Certificate/i.test(el.textContent || '')).map(el => el.textContent.trim()).slice(0,50);
  });
  console.log('Tabs/labels found:', tabs);
  const clickTab = await page.$x("//button[contains(., 'Course Information') or contains(., 'Course information') or contains(., 'Course Information')]");
  if (clickTab.length) {
    console.log('Clicking Course Information tab');
    await clickTab[0].click();
    await new Promise(resolve => setTimeout(resolve, 4000));
  }
  const rendered = await page.evaluate(() => {
    const bodyText = document.body.innerText;
    const find = (pattern) => {
      const regex = new RegExp(pattern, 'i');
      return Array.from(document.querySelectorAll('*')).filter(n => regex.test(n.textContent || '')).map(n => ({ text: n.textContent.trim().slice(0,500), html: n.outerHTML.slice(0,500) }));
    };
    return {
      title: document.querySelector('h1')?.innerText || document.querySelector('h2')?.innerText || document.title || '',
      pageText: bodyText,
      intendedNodes: find('INTENDED AUDIENCE'),
      sectorNodes: find('Indicative Industry Sectors|Indicative Program Alignments'),
      dateNodes: find('Enrollment Ends|Course End Date|Starts?|Start Date|End Date'),
      rawHtmlSnippet: document.body.innerHTML.slice(0, 5000),
    };
  });
  await fs.promises.writeFile('preview_rendered_text.txt', rendered.pageText, 'utf8');
  console.log('Title:', rendered.title);
  console.log('Intended raw:', rendered.intended);
  console.log('Found label snippets:', rendered.labels.length);
  console.log('First labels:', rendered.labels.slice(0,40));
  console.log('Saved body text to preview_rendered_text.txt');
  await browser.close();
})();
