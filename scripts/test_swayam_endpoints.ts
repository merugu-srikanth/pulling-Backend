import axios from 'axios';

async function test(url: string){
  const m = url.match(/https?:\/\/[^\/]+\/(.+)\/preview$/i);
  if(!m){ console.error('Invalid preview URL'); return; }
  const id = m[1];
  const base = url.split('/').slice(0,3).join('/');
  const candidates = [
    `${base}/${id}/__data.json`,
    `${base}/api/subject-details/${id}`,
    `${base}/api/course/${id}`,
    `${base}/api/preview/${id}`,
    `${base}/courses/${id}/__data.json`,
    `${base}/_next/data/en-US/${id}.json`,
  ];

  for(const c of candidates){
    try{
      const res = await axios.get(c,{ timeout: 8000, headers: { 'User-Agent':'Mozilla/5.0' } });
      console.log('OK', c, '->', typeof res.data === 'string' ? res.data.slice(0,120) : JSON.stringify(res.data).slice(0,120));
    }catch(e:any){
      console.log('ERR', c, '->', e.message);
    }
  }
}

const u = process.argv[2] || 'https://onlinecourses.swayam2.ac.in/ini26_hs50/preview';
test(u).catch(e=>console.error(e.message));
