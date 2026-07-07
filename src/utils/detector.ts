import axios from "axios";

export async function detectType(url: string): Promise<"xml" | "html"> {
  try {
    const res = await axios.get(url, {
      timeout: 10000,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const contentType = String(res.headers["content-type"] || "");
    if (contentType.includes("xml") || contentType.includes("rss") || contentType.includes("atom")) {
      return "xml";
    }
    const body: string = res.data;
    if (typeof body === "string" && (body.trim().startsWith("<?xml") || body.includes("<rss"))) {
      return "xml";
    }
    return "html";
  } catch {
    return "html";
  }
}
