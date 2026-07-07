import axios from "axios";
import xml2js from "xml2js";
import { v4 as uuidv4 } from "uuid";

export async function scrapeXML(url: string): Promise<any[]> {
  const { data } = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 15000,
  });

  const result = await xml2js.parseStringPromise(data, { explicitArray: false });
  const source = new URL(url).hostname.replace("www.", "");
  const jobs: any[] = [];

  const items = result?.rss?.channel?.item || result?.feed?.entry || [];
  const itemList = Array.isArray(items) ? items : [items];

  for (const item of itemList) {
    const title = item.title?._ || item.title || "";
    const link = item.link?._ || item.link || item.guid || "";
    const description = item.description?._ || item.description || item.summary || "";

    if (title && title.length > 5) {
      jobs.push({
        id: uuidv4(),
        title: typeof title === "string" ? title.trim() : String(title),
        organization: source,
        vacancies: 0,
        qualification: "As per notification",
        lastDate: "See notification",
        applyLink: typeof link === "string" ? link : String(link),
        source,
        scrapedAt: new Date().toISOString(),
      });
    }
  }

  return jobs.slice(0, 50);
}
