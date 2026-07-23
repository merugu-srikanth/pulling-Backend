import axios from 'axios';
import * as cheerio from 'cheerio';

async function main(){
  const url = process.argv[2] || 'https://onlinecourses.swayam2.ac.in/ini26_hs50/preview';
  console.log('[PREVIEW] Fetching', url);
  const { data } = await axios.get(url, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(data);
  console.log('Title:', $('h1, h2').first().text().trim() || $('title').text().trim());
  console.log('Meta author:', $('meta[name="author"]').attr('content'));
  console.log('Body snippet:', $('body').text().replace(/\s+/g,' ').slice(0,500));
  const nextData = $('script#__NEXT_DATA__').html();
  if (nextData) {
    console.log('\n__NEXT_DATA__ snippet:', nextData.slice(0,800));
  } else {
    console.log('\n__NEXT_DATA__ not present in server HTML');
  }
  console.log('\n--- Looking for labels ---');
  const text = $('body').text();
  ['INTENDED AUDIENCE','Indicative Program Alignments','Enrollment Ends','Enrollment'].forEach(lbl=>{
    const m = text.match(new RegExp(lbl+'[:\\s]*([A-Za-z0-9,\.\-\s]{1,200})','i'));
    console.log(lbl, '=>', m ? m[1].trim().slice(0,120) : 'NOT FOUND');
  });
}

main().catch(e=>{ console.error('ERR', e && e.message); process.exit(2); });
