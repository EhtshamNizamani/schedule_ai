// backend/index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {extractMeetingInfoFromLLM} from './meetingAgent.js'; // Import the LLM extraction function
import * as chrono from 'chrono-node'; // Import chrono-node
import { format, addHours } from 'date-fns'; // Import addHours
import { google } from 'googleapis'; // Import googleapis
dotenv.config(); // Load .env variables

const app = express();
app.use(cors());
app.use(express.json());



const SERVICE_ACCOUNT_KEY_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const TIME_ZONE = process.env.DEFAULT_TIME_ZONE || 'UTC';


if (!SERVICE_ACCOUNT_KEY_PATH || !CALENDAR_ID) {
  console.error("ERROR: Missing GOOGLE_SERVICE_ACCOUNT_KEY_PATH or GOOGLE_CALENDAR_ID in .env file!");
  // process.exit(1); // Optionally exit if config is missing
}

// Setup Google Auth Client
const auth = new google.auth.GoogleAuth({
  keyFile: SERVICE_ACCOUNT_KEY_PATH,
  scopes: ['https://www.googleapis.com/auth/calendar.events'], // Scope for managing events
});

// Get Google Calendar API instance
const calendar = google.calendar({ version: 'v3', auth });
// --- End Google Calendar Setup ---

// --- In-Memory Conversation State (Replace with DB for production) ---
// Key: userId (needs to be passed from frontend)
// Value: { title: string|null, name: string|null, rawDateTime: string|null, parsedDateTime: Date|null, stage: string }
const conversations = {};

// Helper to get or initialize state
function getUserState(userId) {
  if (!conversations[userId]) {
    conversations[userId] = {
      title: null,
      name: null,
      rawDateTime: null,
      parsedDateTime: null,
      stage: 'INIT', // Stages: INIT, NEED_TITLE, NEED_NAME, NEED_DATETIME, CONFIRM, DONE
    };
  }
  return conversations[userId];
}

// API Endpoint
app.post('/schedule-meeting', async (req, res) => {
  const { userId, userMessage } = req.body; // Get userId and message from request

  if (!userId || !userMessage) {
    return res.status(400).json({ error: 'userId and userMessage are required.' });
  }

  console.log(`\n--- New Request ---`);
  console.log(`User ID: ${userId}, Message: "${userMessage}"`);

  let userState = getUserState(userId);
  console.log("Current State (Before):", JSON.stringify(userState));

  let responseMessage = "";
  let needsLLMExtraction = true;

  // --- Step 1: Handle Reply based on Current Stage ---
  // If we asked for specific info, try to apply the *entire* user message to that field
  if (userState.stage === 'NEED_TITLE') {
    userState.title = userMessage.trim();
    needsLLMExtraction = false; // Don't call LLM if user just provided title
    console.log(`State Update (Title): ${userState.title}`);
  } else if (userState.stage === 'NEED_NAME') {
    userState.name = userMessage.trim();
    needsLLMExtraction = false;
    console.log(`State Update (Name): ${userState.name}`);
  } else if (userState.stage === 'NEED_DATETIME') {
    userState.rawDateTime = userMessage.trim(); // Store raw input first
    needsLLMExtraction = false;
    console.log(`State Update (Raw DateTime): ${userState.rawDateTime}`);
    // Attempt to parse immediately
    const parsedDate = chrono.parseDate(userState.rawDateTime, new Date(), { forwardDate: true });
    if (parsedDate) {
      userState.parsedDateTime = parsedDate;
      console.log(`Chrono Parsed DateTime: ${userState.parsedDateTime.toISOString()}`);
    } else {
      console.warn(`Chrono couldn't parse "${userState.rawDateTime}"`);
      // Keep rawDateTime, stage remains NEED_DATETIME, ask again later
      userState.parsedDateTime = null;
    }
  } else if (userState.stage === 'CONFIRM') {
    needsLLMExtraction = false;
    if (userMessage.match(/yes|yeah|ok|confirm/i)) {
        console.log(`CONFIRMED by ${userId}. Attempting to schedule...`);
        // --- Google Calendar Event Creation ---
        try {
            if (!userState.parsedDateTime || !userState.title || !userState.name) {
                 throw new Error("Internal error: Missing details in confirmed state.");
             }
            // Define event end time (e.g., 1 hour duration)
            const startTime = userState.parsedDateTime;
            const endTime = addHours(startTime, 1); // Add 1 hour using date-fns

            const event = {
                summary: `${userState.title} with ${userState.name}`, // Event title
                description: `Meeting scheduled via AI Agent. Attendee: ${userState.name}.`, // Optional description
                start: {
                    dateTime: startTime.toISOString(), // ISO 8601 format
                    timeZone: TIME_ZONE,
                },
                end: {
                    dateTime: endTime.toISOString(), // ISO 8601 format
                    timeZone: TIME_ZONE,
                },
                // Add attendees if you have email addresses (optional)
                // attendees: [
                //   { email: 'user@example.com' }, // Example attendee
                // ],
                // Optional: Add reminders
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'popup', 'minutes': 10 }, // 10 min popup reminder
                    ],
                },
            };

            // Insert the event into the specified calendar
            const createdEvent = await calendar.events.insert({
                // auth: auth, // Auth is automatically handled by the 'calendar' instance
                calendarId: CALENDAR_ID, // The ID of the shared calendar
                resource: event,
            });

            console.log('Event created successfully! Link:', createdEvent.data.htmlLink);
            const formattedDate = format(userState.parsedDateTime, 'PPP p');
            responseMessage = `Great! I've scheduled "${event.summary}" for ${formattedDate}. You can view it here: ${createdEvent.data.htmlLink}`;
            userState.stage = 'DONE';
            delete conversations[userId]; // Clear state

        } catch (calendarError) {
            console.error('Error creating Google Calendar event:', calendarError);
            // Send a user-friendly error, but log the details
             responseMessage = `Okay, I understood the details, but I couldn't create the calendar event due to an error. Please try again later or schedule it manually. (Ref: ${calendarError.message || 'Unknown calendar error'})`;
            // Keep state as CONFIRM or reset? Maybe reset to allow retry.
             userState.stage = 'INIT'; // Reset stage on error
             delete conversations[userId]; // Clear state on error
        }
        // --- End Google Calendar Logic ---

    } else if (userMessage.match(/no|cancel|wait/i)) {
           responseMessage = "Okay, I've cancelled the request. Let me know if you want to try again.";
           delete conversations[userId]; // Clear state on cancellation
      } else {
           // Didn't understand confirmation, ask again
           responseMessage = `Sorry, I didn't understand. Please confirm with 'yes' or cancel with 'no'. Schedule meeting with ${userState.name} about "${userState.title}" on ${format(userState.parsedDateTime, 'PPP p')}?`;
           // Stay in CONFIRM stage
      }
       return res.json({ reply: responseMessage, stage: userState.stage }); // Send response immediately
  }


  // --- Step 2: Call LLM if needed (Initial message or specific reply didn't fill everything) ---
  if (needsLLMExtraction) {
    console.log("Calling LLM for extraction...");
    const llmResult = await extractMeetingInfoFromLLM(userMessage);

    if (!llmResult.success) {
      // If LLM fails, return its error
      return res.status(500).json({ error: llmResult.error || 'Failed to process message with LLM.' });
    }

    // Update state only if the field is currently null
    if (llmResult.data.title && !userState.title) userState.title = llmResult.data.title;
    if (llmResult.data.name && !userState.name) userState.name = llmResult.data.name;
    if (llmResult.data.datetime && !userState.rawDateTime) userState.rawDateTime = llmResult.data.datetime;
    console.log("State After LLM:", JSON.stringify(userState));
  }

   // --- Step 3: Parse DateTime using Chrono if not already parsed ---
   if (userState.rawDateTime && !userState.parsedDateTime) {
       console.log(`Attempting to parse "${userState.rawDateTime}" with Chrono...`);
       const parsedDate = chrono.parseDate(userState.rawDateTime, new Date(), { forwardDate: true });
       if (parsedDate) {
           userState.parsedDateTime = parsedDate;
           console.log(`Chrono Parsed DateTime: ${userState.parsedDateTime.toISOString()}`);
       } else {
           console.warn(`Chrono couldn't parse "${userState.rawDateTime}" after LLM/Reply.`);
           userState.rawDateTime = null; // Clear raw date if parsing failed, so we ask again
       }
   }


  // --- Step 4: Check Completeness and Ask Follow-up Questions ---
  if (userState.title && userState.name && userState.parsedDateTime) {
    // All details available, ask for confirmation
    const formattedDate = format(userState.parsedDateTime, 'PPP p'); // e.g., "May 4th, 2025 at 4:00 PM"
    responseMessage = `Okay, I have: Meeting with ${userState.name} about "${userState.title}" on ${formattedDate}. Is this correct? (yes/no)`;
    userState.stage = 'CONFIRM';
  } else if (!userState.title) {
    responseMessage = "Okay, what should be the title or topic of the meeting?";
    userState.stage = 'NEED_TITLE';
  } else if (!userState.name) {
    responseMessage = `Got it. Meeting about "${userState.title}". Who is the meeting with?`;
    userState.stage = 'NEED_NAME';
  } else if (!userState.parsedDateTime) {
    responseMessage = `Okay, meeting with ${userState.name} about "${userState.title}". When should it be scheduled? (e.g., tomorrow 4pm, next Tuesday 10:30 AM)`;
    userState.stage = 'NEED_DATETIME';
  } else {
      // Should not happen, but fallback
      responseMessage = "Sorry, I'm missing some details. Can you please provide the meeting information again?";
      userState.stage = 'INIT'; // Reset stage
      // Clear partial data?
      // conversations[userId] = { ... };
  }

  console.log("Final State:", JSON.stringify(userState));
  console.log(`Responding: "${responseMessage}"`);

  // Send the response back to Flutter
  res.json({ reply: responseMessage, stage: userState.stage }); // Send current stage too
});

const PORT = process.env.PORT || 5000; // Use environment variable for port
app.listen(PORT, () => {
  console.log(`Conversational Server running at http://localhost:${PORT}`);
});