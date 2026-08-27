import * as cheerio from "cheerio";

export const ContentExtractor = {
  /**
   * Cleans HTML and returns visible content text by removing scripts, stylesheets, navigation blocks, and header/footers.
   */
  cleanHtmlToText(html: string): string {
    if (!html) return "";
    const $ = cheerio.load(html);
    
    // Eliminate navigation, footer, dynamic headers, advertising, scripts, styles, etc.
    $("script, style, nav, footer, header, iframe, noscript, svg, symbol, link, meta, head, .advertisement, .ads, [class*='ad-'], [id*='ad-']").remove();
    
    // Retrieve clean text content
    return $("body").text().replace(/\s+/g, " ").trim();
  },

  /**
   * Generates a normalized block of text containing potential opportunity details to be used for Level 3 opportunity hashing.
   */
  normalizeOpportunityContent(text: string): string {
    if (!text) return "";
    
    // Normalize case, spacing, and numbers to isolate core opportunity facts
    return text
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }
};
