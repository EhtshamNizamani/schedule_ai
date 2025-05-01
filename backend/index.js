// Import the Express library
import express from 'express';
import dotenv from 'dotenv';
import bodyParser from 'body-parser'; // Consider using express.json() / express.urlencoded() instead
import cors from 'cors';
import nlp from 'compromise'; // NLP library for text processing
import * as chrono from 'chrono-node'; // For date/time parsing

// Create an instance of an Express application
const app = express();

// Load environment variables from .env file
dotenv.config();

// Middleware to parse JSON request bodies (Recommended over body-parser for basic use)
app.use(express.json());
// Middleware to parse URL-encoded request bodies (Recommended over body-parser)
app.use(express.urlencoded({ extended: true }));

// Define the port the server will run on
const PORT = process.env.PORT || 3000;

// CORS configuration
app.use(
  cors({
    origin: [process.env.FRONTEND_URL || 'http://localhost:3000', 'http://localhost:5173'], // Add Flutter dev port if needed
    credentials: true,
  })
);

// In-memory session store (Replace with Redis/Mongo for production)
const userSessions = {};

// Helper function to check if all data is collected
function isDataComplete(data) {
  return data.person && data.dateTime && data.title;
}

app.post('/chat', (req, res) => {
  const userId = req.body.userId;
  const userMessage = req.body.text; // Don't lowercase everything immediately, compromise handles casing

  if (!userId) {
    return res.status(400).json({ reply: "Error: userId is missing." });
  }
  if (!userMessage) {
      return res.status(400).json({ reply: "Error: text is missing." });
  }


  // Initialize session if it doesn't exist
  if (!userSessions[userId]) {
    userSessions[userId] = {
      step: 'initial', // Start at the initial step
      data: {
        person: null,
        dateTime: null,
        title: null,
      }, // Initialize data fields
    };
    console.log(`[${userId}] New session created.`);
  }

  const session = userSessions[userId];
  const { data } = session; // Get reference to session data
  const lowerCaseMessage = userMessage.toLowerCase(); // Use lower case for simple matching

  console.log(`[${userId}] Received Message: "${userMessage}", Current Step: ${session.step}`);
  console.log(`[${userId}] Current Data Before Processing:`, JSON.stringify(data));

  let reply = "Mujhe samajh nahi aaya. Kya aap dobara bolenge?"; // Default reply

  // --- Process Input Based on Current Step ---

  // If initial step, try to extract everything
  if (session.step === 'initial') {
    console.log(`[${userId}] Processing Step: initial`);
    // 1️⃣ Extract Date/Time (if not already present)
    if (!data.dateTime) {
      // Use chrono.parse which gives more context if needed, or parseDate for simplicity
      const parsedDates = chrono.parse(userMessage);
      if (parsedDates && parsedDates.length > 0) {
        data.dateTime = parsedDates[0].start.date(); // Get the JS Date object
        console.log(`[${userId}] Extracted DateTime:`, data.dateTime);
      }
    }

    // 2️⃣ Extract Person (if not already present)
    if (!data.person) {
      // Match letters only after "with" or "sath" to avoid "the"
      const personMatch = lowerCaseMessage.match(/(?:sath|with)\s+([a-zA-Z]+(?: [a-zA-Z]+)*)/); // Match one or more words (letters only)
       if (personMatch && personMatch[1]) {
            // Find the actual name in the original case using the matched index
            const matchIndex = lowerCaseMessage.indexOf(personMatch[1], lowerCaseMessage.indexOf(personMatch[0]));
            if (matchIndex !== -1) {
                 data.person = userMessage.substring(matchIndex, matchIndex + personMatch[1].length);
                 console.log(`[${userId}] Extracted Person: ${data.person}`);
             } else {
                 // Fallback if index calculation fails (less likely)
                 data.person = personMatch[1];
                  console.log(`[${userId}] Extracted Person (fallback): ${data.person}`);
            }
        }
    }

    // 3️⃣ Extract Title (if not already present) - Run only in initial step
    if (!data.title) {
       const doc = nlp(userMessage); // Use compromise NLP on original case message
       const topics = doc.topics().out('array');

       // Create list of banned words AND the extracted person AND date/time text
        const dateText = data.dateTime ? chrono.parse(userMessage).find(d => d.start.date().getTime() === data.dateTime.getTime())?.text : null;
       const bannedWords = [
         'tomorrow', 'today', 'kal', 'aaj', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
         'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
         'with', 'sath', 'meeting', 'schedule', 'meet', 'appointment', 'at', 'pm', 'am',
         ...(data.person ? data.person.toLowerCase().split(' ') : []), // Split multi-word names
         ...(dateText ? dateText.toLowerCase().split(' ') : []) // Split date text
       ].filter(Boolean); // Remove null/empty entries


       // Clean valid title from topics first
       let potentialTitle = topics.find(t => {
           const lower = t.toLowerCase();
           // Check if it contains any banned word fully or partially
           return !bannedWords.some(b => lower.includes(b)) && t.split(' ').length >= 1; // Allow single word titles if clean
       });


       // Fallback to nouns if no suitable topic found
       if (!potentialTitle) {
         const nounPhrases = doc.nouns().out('array');
         const filtered = nounPhrases.filter(p => {
             const lowerP = p.toLowerCase();
              // Ensure it's not just the person's name again or a date keyword
             return !bannedWords.some(w => lowerP.includes(w)) &&
                    lowerP !== data.person?.toLowerCase() &&
                    p.length > 2; // Minimum length for a title noun
         });

           // Prefer longer phrases, but take the first suitable one if sorting is complex
          potentialTitle = filtered.sort((a, b) => b.length - a.length)[0];
       }

       if (potentialTitle) {
          data.title = potentialTitle;
          console.log(`[${userId}] Extracted Title: ${data.title}`);
       }
    }

    // Transition to next step OR confirm if complete
    session.step = 'collecting'; // Move to a general collecting state after initial processing

  } // End of initial step processing

  // --- Collecting State Logic (Ask for missing pieces) ---
  // We are now in the 'collecting' step (or subsequent ask steps if we implement them granularly)

  // Check if DateTime is missing
  if (!data.dateTime) {
    // If user provided input, try parsing it as date/time
    if (session.step === 'ask_datetime') { // Only parse if we explicitly asked
       const parsedDates = chrono.parse(userMessage);
       if (parsedDates && parsedDates.length > 0) {
           data.dateTime = parsedDates[0].start.date();
           console.log(`[${userId}] Got DateTime:`, data.dateTime);
           session.step = 'collecting'; // Go back to general check
       } else {
           reply = "Date/time samajh nahi aayi. Format aesa use karein: 'kal 3 baje', 'next Monday 10am'";
           // Stay in ask_datetime step
           return res.json({ reply });
       }
    } else if (session.step !== 'initial') { // Ask only if not just processed initial and still missing
        session.step = 'ask_datetime';
        reply = "Meeting kis din aur time par rakhni hai? (e.g., 'kal 3 baje')";
        return res.json({ reply });
    }
  }

  // Check if Person is missing (and DateTime is present)
  if (data.dateTime && !data.person) {
     if (session.step === 'ask_person') { // Only process if we explicitly asked
       // Assume the whole message is the person's name for now
       // A better approach might use nlp('User message').people().out('array') if reliable
       data.person = userMessage.trim(); // Use the whole input as name
       console.log(`[${userId}] Got Person: ${data.person}`);
       session.step = 'collecting'; // Go back to general check
     } else if (session.step !== 'initial' && session.step !== 'ask_datetime') {
       session.step = 'ask_person';
       reply = "Kis ke sath meeting rakhni hai?";
       return res.json({ reply });
     }
  }

   // Check if Title is missing (and DateTime and Person are present)
  if (data.dateTime && data.person && !data.title) {
      if (session.step === 'ask_title') { // Only process if we explicitly asked
         // Assume the user's message is the title
         data.title = userMessage.trim();
         console.log(`[${userId}] Got Title: ${data.title}`);
         session.step = 'collecting'; // Go back to general check
      } else if (session.step !== 'initial' && session.step !== 'ask_datetime' && session.step !== 'ask_person') {
         session.step = 'ask_title';
         reply = "Meeting ka topic/title kya hai?";
         return res.json({ reply });
     }
  }


  // --- Check if all data is complete ---
  if (isDataComplete(data)) {
    console.log(`[${userId}] All data collected:`, JSON.stringify(data));
    // ✅ All information gathered, confirm and schedule (placeholder)
    const formattedDate = data.dateTime.toLocaleString('en-US', { // Or your preferred locale
        dateStyle: 'medium', // e.g., May 2, 2025
        timeStyle: 'short', // e.g., 10:00 PM
        // timeZone: 'Asia/Karachi' // IMPORTANT: Set your target timezone
    });

    reply = `Theek hai! "${data.title}" meeting schedule hogai hai ${data.person} ke sath ${formattedDate} ke liye.`;
    console.log("Meeting data ready to be scheduled:", data);

    // Optional: Add confirmation step
    // session.step = 'confirm';
    // reply = `Okay, I have: Meeting "${data.title}" with ${data.person} on ${formattedDate}. Confirm? (yes/no)`;
    // return res.json({ reply });

    // --- (Placeholder) Call Google Calendar API Here ---
    // await scheduleGoogleCalendarEvent(data.title, data.person, data.dateTime);

    // Reset session after successful scheduling (or confirmation)
    console.log(`[${userId}] Resetting session.`);
    delete userSessions[userId]; // Clear the session

    // Send final response with data
    return res.json({
      reply: reply,
      eventData: { // Send structured data back
        title: data.title,
        person: data.person,
        dateTime: data.dateTime.toISOString() // Send ISO string for consistency
      }
    });
  } else if(session.step === 'collecting' && !isDataComplete(data)){
      // If we are in collecting step but still missing data, it means we asked a question
      // in the previous turn but haven't received the specific answer yet, or initial parse failed.
      // Re-trigger the checks to ask the *next* required question.
      console.log(`[${userId}] Still collecting, re-evaluating needed info...`);
       // Re-run checks to ask the next question
      if (!data.dateTime) {
          session.step = 'ask_datetime';
          reply = "Meeting kis din aur time par rakhni hai? (e.g., 'kal 3 baje')";
      } else if (!data.person) {
          session.step = 'ask_person';
          reply = "Kis ke sath meeting rakhni hai?";
      } else if (!data.title) {
           session.step = 'ask_title';
           reply = "Meeting ka topic/title kya hai?";
      } else {
          // Should not happen if isDataComplete is false
          reply = "Kuch samajh nahi aaya. Shuru se batayein?";
          delete userSessions[userId]; // Reset if confused
      }
  }

  // Send the determined reply
  console.log(`[${userId}] Sending Reply: "${reply}"`);
  res.json({ reply });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});