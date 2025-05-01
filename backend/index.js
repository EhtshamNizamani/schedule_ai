// Import the Express library
import  express from 'express';
import dotenv from 'dotenv'

// Create an instance of an Express application
const app = express();
dotenv.config()

// Define the port the server will run on
const PORT = process.env.PORT || 3000;

// Define a simple route for the homepage (/)
app.get('/', (req, res) => {
  res.send('Hello World! Your To-Do App Backend is running.'); // Send a response to the client
});

// --- Add your To-Do API routes here later ---
// Example: app.get('/todos', ...)
// Example: app.post('/todos', ...)
// ...

// Start the server and make it listen for connections on the specified port
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});