// backend/meetingAgent.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const modelName = "gemini-1.5-flash-latest"; // Stable model

export async function extractMeetingInfoFromLLM(message) {
  console.log(`Requesting LLM extraction for: "${message}"`);
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const prompt = `
    Extract meeting information (title, datetime expression, attendee name) from the following text.
    Respond ONLY with a valid JSON object containing the keys "title", "datetime", and "name".
    If a value is not found, use null for that key.

    Text: "${message}"

    JSON Output:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    console.log("Raw Response from Gemini:", text);

    // Clean potential markdown backticks
    const cleanedText = text.replace(/^```json\s*|```$/g, "").trim();

    try {
      const jsonOutput = JSON.parse(cleanedText);
      console.log("Parsed LLM JSON Output:", jsonOutput);
      return {
        success: true,
        data: {
          title: jsonOutput.title || null,
          datetime: jsonOutput.datetime || null, // Return the raw string for now
          name: jsonOutput.name || null,
        },
        raw_reply: text
      };
    } catch (parseError) {
      console.warn("Failed to parse JSON from LLM:", parseError.message);
      // Attempt to extract JSON using regex as a fallback
      const match = cleanedText.match(/{\s*[^]*?\s*}/);
      if (match && match[0]) {
        try {
          const jsonOutput = JSON.parse(match[0]);
           console.log("Parsed LLM JSON Output (Regex Fallback):", jsonOutput);
           return {
             success: true,
             data: {
               title: jsonOutput.title || null,
               datetime: jsonOutput.datetime || null,
               name: jsonOutput.name || null,
             },
             raw_reply: text
           };
        } catch (innerError) { /* Ignore inner error, fall through */ }
      }
      console.error("Could not extract valid JSON from LLM response.");
      return { success: false, error: "Could not extract JSON from LLM response.", raw_reply: text };
    }
  } catch (error) {
    console.error("Error calling Google Gemini API:", error);
    let errorMessage = 'AI Service Error: Failed to process request with Gemini model.';
    if (error && error.message) {
      errorMessage = `AI Service Error: ${error.message}`;
    }
    return { success: false, error: errorMessage };
  }
}