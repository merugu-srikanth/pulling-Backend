import { v4 as uuidv4 } from "uuid";

export function isPmInternshipUrl(url: string): boolean {
  return url.includes("pminternship.mca.gov.in");
}

/* ─── Text helpers ────────────────────────────────────────────────────────── */
function afterLabel(text: string, label: string): string {
  // Match "Label Name\n value" or "Label Name value" patterns
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = text.match(new RegExp(escaped + "\\s*[:\\n]?\\s*([^\\n]{2,100})", "i"));
  return m ? m[1].trim() : "";
}

function parseDate(raw: string): string {
  // "14 Jul 2026" -> keep as is; "14/07/2026" -> convert
  if (!raw) return "";
  const m1 = raw.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+(\d{4})/i);
  if (m1) return m1[0].trim();
  const m2 = raw.match(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}/);
  if (m2) return m2[0];
  return raw.substring(0, 30);
}

/* ─── Main scraper (Puppeteer) ────────────────────────────────────────────── */
export async function scrapePmInternship(pageUrl: string): Promise<any[]> {
  // Not available on Vercel serverless — no Chromium
  if (process.env.VERCEL) {
    console.log("[PMInternship] Skipping — Puppeteer unavailable on Vercel");
    return [];
  }

  // Lazy import so non-Vercel builds still work even if puppeteer isn't installed
  let puppeteer: any;
  try {
    puppeteer = await import("puppeteer");
    puppeteer = puppeteer.default ?? puppeteer;
  } catch {
    console.log("[PMInternship] Puppeteer not installed — skipping");
    return [];
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    console.log("[PMInternship] Loading page...");
    await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // Wait for cards (cards show a "View Details" button)
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("button")).some((b: Element) => (b as HTMLElement).textContent?.trim() === "View Details"),
      { timeout: 30000 }
    );

    // Scroll down to trigger infinite-scroll loading (max 3 scroll attempts)
    for (let s = 0; s < 5; s++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise((r) => setTimeout(r, 2000));
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 1000));

    const totalCards: number = await page.evaluate(
      () => Array.from(document.querySelectorAll("button")).filter((b: Element) => (b as HTMLElement).textContent?.trim() === "View Details").length
    );
    console.log(`[PMInternship] ${totalCards} cards found`);

    const jobs: any[] = [];
    const MAX = Math.min(totalCards, 80); // cap per run

    for (let i = 0; i < MAX; i++) {
      try {
        // --- Get card heading / company text before clicking ---
        const cardMeta: { title: string; company: string; tags: string } = await page.evaluate((idx: number) => {
          const btns = Array.from(document.querySelectorAll("button")).filter(
            (b: Element) => (b as HTMLElement).textContent?.trim() === "View Details"
          );
          const btn = btns[idx] as HTMLElement | undefined;
          if (!btn) return { title: "", company: "", tags: "" };

          // Walk up to find the card container
          let card: HTMLElement | null = btn;
          for (let depth = 0; depth < 8; depth++) {
            card = card?.parentElement ?? null;
            if (!card) break;
            const headings = card.querySelectorAll("h1,h2,h3,h4,h5");
            if (headings.length >= 2) break;
          }

          const headings = card ? Array.from(card.querySelectorAll("h1,h2,h3,h4,h5")) : [];
          const title   = headings[1]?.textContent?.trim() || headings[0]?.textContent?.trim() || "";
          const company = headings[0]?.textContent?.trim() || "";
          const tags    = card?.textContent?.replace(/\s+/g, " ").trim() || "";
          return { title, company, tags };
        }, i);

        // Scroll card into view and click
        await page.evaluate((idx: number) => {
          const btns = Array.from(document.querySelectorAll("button")).filter(
            (b: Element) => (b as HTMLElement).textContent?.trim() === "View Details"
          );
          (btns[idx] as HTMLElement)?.scrollIntoView({ block: "center" });
        }, i);
        await new Promise((r) => setTimeout(r, 400));

        const btns = await page.$$("button");
        const viewBtns: any[] = [];
        for (const b of btns) {
          const txt: string = await b.evaluate((el: HTMLElement) => el.textContent?.trim() || "");
          if (txt === "View Details") viewBtns.push(b);
        }
        if (!viewBtns[i]) continue;
        await viewBtns[i].click();

        // Wait for dialog/modal
        try {
          await page.waitForFunction(
            () => {
              const d = document.querySelector("[role='dialog']");
              return d && (d as HTMLElement).offsetHeight > 100;
            },
            { timeout: 12000 }
          );
          await new Promise((r) => setTimeout(r, 1500));
        } catch {
          await page.keyboard.press("Escape").catch(() => {});
          continue;
        }

        // --- Extract modal content ---
        const modalRaw: string = await page.evaluate(() => {
          const d = document.querySelector("[role='dialog']");
          return d?.textContent?.replace(/\s+/g, " ").trim() || "";
        });

        // --- Extract structured label/value pairs from modal DOM ---
        const modalPairs: Record<string, string> = await page.evaluate(() => {
          const d = document.querySelector("[role='dialog']");
          if (!d) return {};
          const pairs: Record<string, string> = {};

          // Strategy 1: find elements where first child is a short "label" and second is the value
          d.querySelectorAll("div, li, p").forEach((el) => {
            const kids = Array.from(el.children);
            if (kids.length === 2) {
              const label = kids[0]?.textContent?.trim() || "";
              const value = kids[1]?.textContent?.trim() || "";
              if (label.length > 3 && label.length < 80 && value.length > 0 && value.length < 200) {
                pairs[label] = value;
              }
            }
          });
          return pairs;
        });

        // --- Parse title from modal (the bigger heading inside dialog) ---
        const modalTitle: string = await page.evaluate(() => {
          const d = document.querySelector("[role='dialog']");
          if (!d) return "";
          const h = d.querySelector("h1,h2,h3");
          return h?.textContent?.trim() || "";
        });

        // --- Merge and build job object ---
        const raw = modalRaw;

        const get = (label: string): string => {
          // Check DOM pairs first
          for (const [k, v] of Object.entries(modalPairs)) {
            if (k.toLowerCase().includes(label.toLowerCase())) return v;
          }
          return afterLabel(raw, label);
        };

        const appStartRaw = get("Application Start Date");
        const appEndRaw   = get("Application End Date");
        const qualification = get("Required Qualification") || get("Qualification");
        const vacStr      = get("No of Opportunities") || get("Number of Opportunities");
        const location    = get("Location");
        const duration    = get("Duration");
        const mode        = get("Mode of Internship") || get("Mode");
        const stipendRaw  = get("Total Financial Assistance") || get("Financial Assistance") || get("Stipend");
        const insurance   = get("Insurance");
        const transport   = get("Transportation Support");
        const health      = get("Health Benefits");

        const title    = modalTitle || cardMeta.title || "PM Internship";
        const company  = cardMeta.company || get("Company") || "";

        // Extract sector/field/state from card tags text
        const tagParts = cardMeta.tags.split("/").map((s: string) => s.trim()).filter(Boolean);
        const sector   = tagParts.find((t: string) => t && t.length > 3 && !t.includes("View")) || "";

        jobs.push({
          id:             uuidv4(),
          title,
          organization:   company,
          vacancies:      parseInt(vacStr) || 0,
          qualification:  qualification || "As per notification",
          lastDate:       parseDate(appEndRaw) || "See notification",
          applyLink:      pageUrl,
          source:         "pminternship.mca.gov.in",
          scrapedAt:      new Date().toISOString(),
          // PM Internship-specific
          startDate:      parseDate(appStartRaw),
          internshipType: mode || "",
          location:       location || sector || "",
          duration:       duration || "",
          stipend:        stipendRaw ? stipendRaw.replace(/\s+/g, " ").trim() : "",
          postedDate:     "",
          // Extra details
          pmInsurance:    insurance || "",
          pmTransport:    transport || "",
          pmHealthBenefits: health || "",
        });

        console.log(`[PMInternship] ${i + 1}/${MAX}: ${title} @ ${company}`);

        // Close modal
        await page.keyboard.press("Escape");
        await new Promise((r) => setTimeout(r, 700));
      } catch (err: any) {
        console.error(`[PMInternship] Card ${i} error: ${err.message}`);
        await page.keyboard.press("Escape").catch(() => {});
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    console.log(`[PMInternship] Done — ${jobs.length} internships scraped`);
    return jobs;
  } finally {
    await browser.close();
  }
}
