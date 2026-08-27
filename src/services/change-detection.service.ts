import crypto from "crypto";

export const ChangeDetectionService = {
  /**
   * Generates a SHA-256 hash for a given string
   */
  generateHash(text: string): string {
    return crypto.createHash("sha256").update(text || "").digest("hex");
  },

  /**
   * Checks if the clean content hash matches the previous clean content hash
   */
  hasCleanContentChanged(newCleanText: string, previousHash: string | null | undefined): boolean {
    if (!previousHash) return true;
    const newHash = this.generateHash(newCleanText);
    return newHash !== previousHash;
  },

  /**
   * Performs Level 3 normalization. Removes unstable dynamic markers (session tokens, timestamps, etc.)
   * and builds a normalized string of key opportunity sections.
   */
  normalizeForLevel3(cleanText: string): string {
    if (!cleanText) return "";
    
    // Split into lines or sentences
    const lines = cleanText.split(/[.\n]/);
    
    // Preserve lines only if they contain keywords associated with details like deadlines, eligibility, stipend, location, duration.
    const detailsKeywords = [
      "last date", "deadline", "apply", "eligibility", "stipend", "duration", 
      "salary", "pay", "qualification", "location", "venue", "selection",
      "fellowship", "apprenticeship", "training", "internship", "project"
    ];

    const meaningfulLines = lines.filter(line => {
      const lower = line.toLowerCase();
      return detailsKeywords.some(kw => lower.includes(kw));
    });

    return meaningfulLines.join(" ").replace(/\s+/g, " ").trim();
  },

  /**
   * Compares the normalized Level 3 opportunity hashes to decide if there is any meaningful change.
   */
  hasOpportunityChanged(newCleanText: string, previousOpHash: string | null | undefined): { changed: boolean, hash: string } {
    const normalized = this.normalizeForLevel3(newCleanText);
    const newHash = this.generateHash(normalized);
    
    if (!previousOpHash) {
      return { changed: true, hash: newHash };
    }
    
    return { changed: newHash !== previousOpHash, hash: newHash };
  }
};
