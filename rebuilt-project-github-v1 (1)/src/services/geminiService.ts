
import { GoogleGenAI } from "@google/genai";
import { Message } from '../types';

// Fix: Adhering to Gemini API guidelines.
// The API key is now exclusively sourced from the `process.env.API_KEY` environment variable.
// The previous implementation with a hardcoded constant has been removed.
const ai = process.env.API_KEY ? new GoogleGenAI({ apiKey: process.env.API_KEY }) : null;

// This flag is used by the UI to show a friendly configuration message.
export const isGeminiConfigured = !!ai;

const chatbotSystemInstruction = `
You are an expert onboarding assistant for a web application called 'ZOGU Solutions'.
Your purpose is to help new users understand and use the app's features.
The app has the following main features:
- Dashboard: Shows an overview of inventory, sales, and recent invoices.
- Inventory: Users can add, edit, and delete products. They can track stock levels (optional) and set selling prices.
- Invoices: Users can create professional invoices for their customers. They can add products from their inventory, apply correct German VAT (19% or 7%), and export invoices as PDFs.
- Customers: A database to manage customer information.
- Expenses: A simple way to track business expenses.
- Profile: Users can update their personal and company details, which will appear on invoices. They can also upload a company logo.
- Multilingual: The app supports German and Albanian.

Your tone should be helpful, clear, and concise. Answer questions based ONLY on the features listed above. If a user asks about something unrelated to the app, gently guide them back by saying "I can only help with questions about the ZOGU Solutions application." Do not make up features.
`;

export const askChatbot = async (prompt: string, history: Message[]) => {
  // If the AI client isn't configured, return a helpful message.
  if (!ai) {
    // Fix: Updated the message to reflect the use of environment variables for configuration.
    return "The AI assistant is not configured. An administrator needs to set the API_KEY environment variable to enable this feature.";
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [...history, { role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: chatbotSystemInstruction,
      },
    });

    return response.text;
  } catch (error) {
    console.error("Error calling Gemini API:", error instanceof Error ? error.message : String(error));
    return "I'm sorry, I encountered an error. The chatbot might be unavailable. Please try again later.";
  }
};
