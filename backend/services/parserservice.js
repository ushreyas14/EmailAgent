const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

async function parseWithGemini(input) {
  if (!genAI) {
    throw new Error("Gemini API Key not configured.");
  }
  
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  
  const prompt = `
    Extract the email recipient, subject, and body from the following text.
    Return ONLY a valid JSON object with the following keys:
    - "recipient": the email address. Leave as empty string if not found.
    - "subject": the subject of the email. Infer from context if not explicitly stated. Leave as empty string if not found.
    - "body": the main content/message of the email.
    
    Text: "${input}"
  `;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  let text = response.text();
  
  // Clean markdown blocks if present
  text = text.replace(/```json/gi, '').replace(/```/gi, '').trim();
  
  return JSON.parse(text);
}

function parseWithRegex(input) {
  const result = {
    recipient: '',
    subject: '',
    body: ''
  };

  // Basic email extraction
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i;
  const emailMatch = input.match(emailRegex);
  if (emailMatch) {
    result.recipient = emailMatch[1];
  }

  // Very basic subject extraction looking for "about [subject]" or "subject [subject]"
  const subjectRegex = /(?:about|subject(?: is)?)\s+([^.,\n]+)/i;
  const subjectMatch = input.match(subjectRegex);
  if (subjectMatch) {
    result.subject = subjectMatch[1].trim();
  }

  // The rest can be considered body, just filtering out "send email to"
  let bodyText = input
    .replace(emailRegex, '')
    .replace(/(?:send|draft|write) (?:an )?email (?:to)/i, '')
    .replace(subjectRegex, '')
    .trim();
    
  result.body = bodyText || input;

  return result;
}

async function parseEmailInput(input) {
  try {
    const parsedData = await parseWithGemini(input);
    return {
      ...parsedData,
      method: 'gemini'
    };
  } catch (error) {
    console.error("Gemini parsing failed, falling back to regex:", error);
    const parsedData = parseWithRegex(input);
    return {
      ...parsedData,
      method: 'regex'
    };
  }
}

module.exports = {
  parseEmailInput,
  parseWithGemini,
  parseWithRegex
};