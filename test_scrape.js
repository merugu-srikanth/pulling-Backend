require("dotenv").config();
const axios = require("axios");
const cheerio = require("cheerio");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = "gpt-4o-mini";

// Direct AJAX endpoint of AICTE
const BASE = "https://internship.aicte-india.org";
const AJAX_URL = `${BASE}/class/class_internship.php`;

const KEYWORDS = [
  "internship", "intern", "student", "fellowship", "apprenticeship", "trainee", "opportunity",
  "apply", "deadline", "stipend", "vacancies", "eligibility", "apply now"
];

function cleanText(html) {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, iframe, noscript, svg, symbol, link, meta, head").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

async function runTest() {
  console.log(`[Test] Sending POST request to: ${AJAX_URL}`);
  try {
    const params = new URLSearchParams({
      action: "load_internship",
      internship_type: "Virtual Internship",
      page: "1"
    });

    const { data } = await axios.post(AJAX_URL, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
        "X-Requested-With": "XMLHttpRequest"
      },
      timeout: 25000
    });

    // The response has a `list` key containing the HTML string of internship cards
    const rawListHtml = data.list || "";
    if (!rawListHtml) {
      console.log("[Test] No internships found in the list.");
      return;
    }

    const visibleText = cleanText(rawListHtml);
    console.log(`[Test] Cleaned text size: ${visibleText.length} characters.`);
    console.log(`[Test] Sample Text: ${visibleText.substring(0, 300)}...`);

    // Keyword Filter
    const lowerText = visibleText.toLowerCase();
    const matches = KEYWORDS.filter(kw => lowerText.includes(kw));
    console.log(`[Test] Matched Keywords: ${matches.join(", ")}`);
    
    if (matches.length < 2) {
      console.log("[Test] Filtered out: Not enough matching keywords.");
      return;
    }

    console.log("[Test] Relevance passed. Calling OpenAI Structured Outputs...");
    
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: OPENAI_MODEL,
        messages: [
          { 
            role: "system", 
            content: "You are a Government Internship Discovery Agent. Extract opportunities into a JSON object with 'opportunities' array containing organization, program_name, opportunity_title, opportunity_type, location, stipend, application_deadline, eligibility, and evidence (deadline, stipend, eligibility)." 
          },
          { role: "user", content: `URL: ${AJAX_URL}\nContent:\n${visibleText.substring(0, 15000)}` }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      },
      {
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const result = JSON.parse(response.data.choices[0].message.content || "{}");
    const usage = response.data.usage;

    console.log("\n=================== AI EXTRACTION RESULTS ===================");
    console.log(JSON.stringify(result, null, 2));
    console.log("=============================================================");
    console.log(`\n[Token Usage] Prompt: ${usage.prompt_tokens}, Completion: ${usage.completion_tokens}, Total: ${usage.total_tokens}`);

  } catch (err) {
    console.error("[Test Error]:", err.message);
  }
}

runTest();
