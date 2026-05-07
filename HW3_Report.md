# HW3 – Logic & Intelligent Processing: Academic Architecture Report

## 1. How the Solution Meets the Homework Requirements
This project fully satisfies the HW3 objectives by evolving a basic webhook receiver into a robust, AI-powered CRM data pipeline. It successfully demonstrates conditional logic (Validation) and intelligent processing (AI Integration). 

The solution meets the core requirements by:
- Catching and flagging malformed or missing data before it consumes API resources.
- Automatically analyzing unstructured customer messages using the Google Gemini 1.5 Flash model.
- Formatting the final dataset into a highly structured record containing both the original input and system/AI-generated metadata (`status`, `intent`, `urgency`), which is then successfully synchronized to both local (SQLite) and external (Google Sheets) CRM databases.

---

## 2. Required Architecture and Workflow Structure
The system is explicitly engineered to follow the required strict pipeline: **Input → Validation → AI Analysis → CRM/Sheets.**

1. **Input (`{name, email, message}`):** The Node.js server (`hw3_server.js`) exposes a `POST /submit` endpoint. It receives raw JSON payloads representing a customer inquiry.
2. **Validation (Email/Format Check):** A synchronous validation gateway (`validatePayload`) inspects the input. It guarantees the workflow branches correctly: malformed data skips AI processing, while clean data proceeds forward.
3. **AI Analysis (Intent/Urgency):** Validated data is securely transmitted to the Gemini API. The AI acts as an intelligent classifier, extracting business value from the raw text.
4. **CRM/Sheets (Full Record + Metadata):** The data is merged. The final payload containing `{name, email, message, status, intent, urgency, validation_errors}` is successfully appended to both the local SQLite database and the Google Sheets Web App.

---

## 3. Validation Rules and Success Criteria
The application ensures high data integrity by implementing a robust, dual-layered validation strategy within the Node.js code.

- **Missing Field Verification:** The code utilizes strict `if (!payload.field)` and `.trim() === ''` checks to ensure no mandatory field (`name`, `email`, `message`) is left blank.
- **Regex Email Validation:** To ensure routable email formats, the system enforces the Regular Expression `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.

**Success Criteria (Marking Bad Data & Categorizing Valid Data):**
- If the validation fails, the system immediately explicitly defines the variable `leadStatus = "Invalid"`. This directly fulfills the requirement to "mark bad data". The exact error (e.g., "Invalid email format") is saved into the database for CRM administrators to review.
- If the validation succeeds, the system defines `leadStatus = "Valid"`, triggering the AI to extract and categorize the data into specific fields (e.g., `intent = Sales`, `urgency = High`).

---

## 4. AI Prompt Strategy
The system integrates **Google's Gemini 1.5 Flash** model. Because the system requires a programmatic response rather than a conversational one, a highly strict **Zero-Shot Prompting Strategy** is utilized.

**The Exact Prompt Used:**
```text
Analyze the following customer message. 
Determine the 'intent' (e.g., Sales, Support, Inquiry, Feedback) and the 'urgency' (Low, Medium, High).
Return ONLY a valid JSON object with the keys "intent" and "urgency".

Message: "{message}"
```

**Strategic Breakdown of the Prompt:**
1. **Explicit Role Assignment:** The AI is immediately tasked with an analytical objective ("Analyze the following customer message").
2. **Predefined Categorization Boundaries:** The AI is strictly guided to choose from specific categories (Sales, Support, Inquiry, Feedback) and urgency levels (Low, Medium, High). This prevents the AI from generating random or unexpected categories that the CRM cannot interpret.
3. **Enforced JSON Output:** The phrase *"Return ONLY a valid JSON object"* is the most critical component. Large Language Models natively generate conversational markdown. By restricting its output to pure JSON, the Node.js application can safely utilize `JSON.parse()` to seamlessly extract the metadata without breaking the server logic. To ensure absolute safety, the code also programmatically strips any rogue markdown blocks (like ```json) before parsing.

---

## 5. Live Demonstration and Testing Strategy
To fulfill the requirement of showing at least one test case and explaining the workflow live, the repository includes a dedicated `hw3_test.js` script. 

During the live demonstration, the script executes two distinct HTTP POST requests to the local server:
1. **Test Case 1 (Invalid Input):** A payload simulating a user who typed `ahmet-hatali-email` instead of a proper email address. This successfully triggers the Validation firewall, marking the database record as "Invalid" and bypassing the AI entirely.
2. **Test Case 2 (Valid Input):** A payload simulating an enterprise customer requesting pricing information. This successfully passes Validation, triggers the Gemini API, and results in the AI successfully categorizing the valid data with `intent: "Sales"` and `urgency: "High"`.
