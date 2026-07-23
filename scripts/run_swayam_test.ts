import { scrapeSwayam } from "../src/services/swayamScraper.service";

async function main() {
  try {
    console.log('[TEST] Starting Swayam scrape...');
    const jobs = await scrapeSwayam('https://swayam.gov.in/explorer');
    console.log(`[TEST] Scraped ${jobs.length} courses`);
    console.log(JSON.stringify(jobs.slice(0, 10), null, 2));
    process.exit(0);
  } catch (err: any) {
    console.error('[TEST] Error:', err && err.message ? err.message : err);
    process.exit(2);
  }
}

main();
