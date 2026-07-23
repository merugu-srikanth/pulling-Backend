import axios from 'axios';
import * as cheerio from 'cheerio';

async function main(){
  const url = 'https://swayam.gov.in/explorer';
  console.log('[INSPECT] Fetching', url);
  const { data } = await axios.get(url, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(data);
  const hrefs = new Set<string>();
  $('a[href]').each((_, el) => {
    const h = ($(el).attr('href')||'').trim();
    if (h) hrefs.add(h);
  });

  console.log('[INSPECT] Anchor hrefs (filtered):');
  Array.from(hrefs).filter(h => /onlinecourses|preview|course|explorer|swayam2|swayam.gov.in/i.test(h)).slice(0,200).forEach(h => console.log(h));

  console.log('\n[INSPECT] Scripts containing URLs:');
  $('script').each((i, s)=>{
    const t = $(s).html()||'';
    if (/onlinecourses|swayam2|explorer|preview|course|api|fetch/i.test(t)){
      const m = t.match(/https?:\/\/[^'"\s\)]+/g)||[];
      m.slice(0,10).forEach(u=>console.log(u));
      // If token 'ini26' present print a snippet for context
      if (t.includes('ini26') || t.includes('ntr26')){
        console.log('\n--- SCRIPT SNIPPET ---\n', t.slice(0,1200));
      }
    }
  });
}

main().catch(e=>{ console.error('ERR', e && e.message); process.exit(2); });
