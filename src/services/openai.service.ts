import axios from "axios";
import { v4 as uuidv4 } from "uuid";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const strictJsonSchema = {
  name: "government_internships_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      opportunities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            organization: { type: ["string", "null"] },
            ministry: { type: ["string", "null"] },
            program_name: { type: ["string", "null"] },
            opportunity_title: { type: ["string", "null"] },
            opportunity_type: { type: ["string", "null"] },
            description: { type: ["string", "null"] },
            eligible_courses: { type: "array", items: { type: "string" } },
            eligible_degrees: { type: "array", items: { type: "string" } },
            eligible_disciplines: { type: "array", items: { type: "string" } },
            eligibility: { type: ["string", "null"] },
            year_semester_requirement: { type: ["string", "null"] },
            minimum_marks_cgpa: { type: ["string", "null"] },
            age_limit: { type: ["string", "null"] },
            location: { type: ["string", "null"] },
            work_mode: { type: ["string", "null"], enum: ["Offline", "Online", "Hybrid", "Unknown", null] },
            duration: { type: ["string", "null"] },
            start_date: { type: ["string", "null"] },
            end_date: { type: ["string", "null"] },
            stipend: { type: ["string", "null"] },
            certificate_available: { type: ["boolean", "null"] },
            accommodation: { type: ["string", "null"] },
            application_fee: { type: ["string", "null"] },
            application_start_date: { type: ["string", "null"] },
            application_deadline: { type: ["string", "null"] },
            selection_process: { type: ["string", "null"] },
            required_documents: { type: "array", items: { type: "string" } },
            application_method: { type: ["string", "null"] },
            application_url: { type: ["string", "null"] },
            official_notification_url: { type: ["string", "null"] },
            official_source_url: { type: ["string", "null"] },
            contact_email: { type: ["string", "null"] },
            contact_phone: { type: ["string", "null"] },
            status: { type: ["string", "null"], enum: ["Open", "Opening Soon", "Closed", "Expired", "Ongoing", "Unknown", null] },
            date_published: { type: ["string", "null"] },
            last_updated: { type: ["string", "null"] },
            last_verified_date: { type: ["string", "null"] },
            internship_relevance_score: { type: "integer" },
            evidence: {
              type: "object",
              properties: {
                deadline: { type: ["string", "null"] },
                stipend: { type: ["string", "null"] },
                eligibility: { type: ["string", "null"] }
              },
              required: ["deadline", "stipend", "eligibility"],
              additionalProperties: false
            }
          },
          required: [
            "organization", "ministry", "program_name", "opportunity_title", "opportunity_type",
            "description", "eligible_courses", "eligible_degrees", "eligible_disciplines", "eligibility",
            "year_semester_requirement", "minimum_marks_cgpa", "age_limit", "location", "work_mode",
            "duration", "start_date", "end_date", "stipend", "certificate_available", "accommodation",
            "application_fee", "application_start_date", "application_deadline", "selection_process",
            "required_documents", "application_method", "application_url", "official_notification_url",
            "official_source_url", "contact_email", "contact_phone", "status", "date_published", "last_updated",
            "last_verified_date", "internship_relevance_score", "evidence"
          ],
          additionalProperties: false
        }
      }
    },
    required: ["opportunities"],
    additionalProperties: false
  }
};

export async function extractOpportunitiesWithAI(url: string, cleanText: string): Promise<any[]> {
  if (!OPENAI_API_KEY) {
    console.error("[OpenAI] API Key is missing.");
    throw new Error("OpenAI API key not configured in .env");
  }

  // Truncate clean text if it is excessively large (e.g. 20k characters)
  const contentToAnalyze = cleanText.length > 25000 
    ? cleanText.substring(0, 25000) + "... [Truncated]"
    : cleanText;

  const systemPrompt = `You are an AI-powered Government Internship Discovery Agent for CareerMitra.
Your job is to identify genuine student internship, training, project, research, fellowship, and trainee opportunities from the provided text content of official Government of India websites.

Follow these rules:
1. Search / Discovery Keywords: Use variations of internship/training/fellowship to discover listings.
2. Important Classification Rule:
   Do NOT classify a page as an internship merely because the word "internship" appears. Make sure it describes a real opportunity students can apply for.
   Do NOT treat generic guidelines, results, or completed notifications as active opportunities.
3. Open / Closed Status: Use deadlines and publication dates to determine status.
4. If a field is unavailable, set it to null instead of guessing.
5. Provide evidence snippets (exact text from the source page) for deadline, stipend, and eligibility.`;

  const userPrompt = `Here is the page URL: ${url}
Here is the text content:
---
${contentToAnalyze}
---
Extract all matching opportunities according to the schema rules.`;

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: {
          type: "json_schema",
          json_schema: strictJsonSchema
        },
        temperature: 0.1
      },
      {
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 45000
      }
    );

    const result = JSON.parse(response.data.choices[0].message.content || "{}");
    const rawOps = result.opportunities || [];
    
    return rawOps
      .filter((op: any) => op.internship_relevance_score >= 40)
      .map((op: any) => {
        return {
          id: uuidv4(),
          title: op.opportunity_title || op.program_name || "Unknown Opportunity",
          organization: op.organization || "Government of India",
          vacancies: 0,
          qualification: op.eligibility || (op.eligible_courses ? op.eligible_courses.join(", ") : "See notification"),
          lastDate: op.application_deadline || "See notification",
          applyLink: op.application_url || op.official_notification_url || url,
          source: new URL(url).hostname.replace("www.", ""),
          scrapedAt: new Date().toISOString(),
          
          // AI metadata mapping
          ministry: op.ministry,
          programName: op.program_name,
          opportunityType: op.opportunity_type,
          description: op.description,
          eligibleCourses: op.eligible_courses,
          eligibleDegrees: op.eligible_degrees,
          eligibleDisciplines: op.eligible_disciplines,
          location: op.location,
          workMode: op.work_mode,
          duration: op.duration,
          stipend: op.stipend,
          certificateAvailable: op.certificate_available,
          accommodation: op.accommodation,
          applicationFee: op.application_fee,
          applicationStartDate: op.application_start_date,
          selectionProcess: op.selection_process,
          requiredDocuments: op.required_documents,
          applicationMethod: op.application_method,
          applicationUrl: op.application_url,
          officialNotificationUrl: op.official_notification_url,
          officialSourceUrl: op.official_source_url || url,
          contactEmail: op.contact_email,
          contactPhone: op.contact_phone,
          status: op.status || "Unknown",
          datePublished: op.date_published,
          lastUpdated: op.last_updated,
          lastVerifiedDate: op.last_verified_date || new Date().toISOString().split("T")[0],
          internshipRelevanceScore: op.internship_relevance_score,
          evidence: op.evidence
        };
      });
  } catch (err: any) {
    console.error("[OpenAI] Structured Outputs call failed:", err.message);
    throw new Error(`AI extraction failed: ${err.message}`);
  }
}
