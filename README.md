# HW3 – Logic & Intelligent Processing

This repository contains the complete implementation for HW3. It upgrades the basic webhook receiver into an intelligent, validation-aware CRM data pipeline using the Google Gemini AI API.

## 1. Required Architecture & Workflow Diagram

The system strictly follows the required architecture:
**Input ({name, email, message}) → Validation (Email/Format Check) → AI Analysis (Intent/Urgency) → CRM/Sheets (Full Record + Metadata).**

*Note: You can double-click the `hw3_diagram.html` file in your folder to view this flowchart in full color in your web browser!*

```mermaid
flowchart TD
    A[1. Input] -->|Sends {name, email, message}| B{2. Validation}
    
    B -->|Missing Field or Invalid Email| C[System Marks Data as 'Invalid']
    C -->|Bypasses AI Analysis| E
    
    B -->|Email & Format Check Passes| D[3. AI Analysis]
    D -->|Gemini Extracts Intent & Urgency| E[4. CRM / Sheets Integration]
    
    E -->|Saves Full Record + Metadata| F[(Local SQLite Database)]
    E -->|Appends Full Record + Metadata| G[(Google Sheets CRM)]
```

---

## 2. Main Files and Endpoints (System Documentation)

*   **`hw3_server.js` (Core Engine):** The main Node.js application. It runs a local web server, receives JSON payloads, performs strict validation (email and missing fields), communicates with Gemini AI, and routes the data to SQLite and Google Sheets.
*   **`hw3_diagram.html`:** The visual, browser-friendly representation of the system's workflow architecture.
*   **`database_hw3.sqlite`:** The completely separate local SQLite database file for this homework.
*   **Port 3002 Configuration:** The server explicitly uses **Port 3002** instead of 3000 or 3001. This is a deliberate architectural choice to completely isolate HW3 from previous homework (HW1/HW2) background processes, preventing `EADDRINUSE` (Address already in use) crashing errors during live presentations.

### Main Endpoint
*   **`POST /submit` (http://localhost:3002/submit)**
    *   **Purpose:** The single entry point for receiving form data.
    *   **Behavior:** It runs the payload through the validation firewall. If valid, it triggers AI analysis. Finally, it commits the entire record to storage.

---

## 3. How to Run and Test (Live Walkthrough with Postman)

To fulfill the **"Show at least one test case"** and **"Walk through each step live"** requirements, follow these exact steps during your presentation.

### Step 1: Start the Webhook Server
Open a terminal in VS Code and run:
```bash
node hw3_server.js
```
*(Leave this terminal open. It will print "HW3 Sunucusu çalışıyor! Port: 3002")*

### Step 2: Live Testing via Postman
Open Postman, set the method to **POST**, the URL to `http://localhost:3002/submit`, and the Body format to **raw > JSON**.

#### 🔴 Test Case 1: Invalid Input (Testing the Validation Check)
*Demonstrates that the system marks bad data.*
Paste this JSON and click Send:
```json
{
  "name": "Ahmet Yilmaz",
  "email": "ahmet-hatali-mail",
  "message": "Sisteme giriş yapamıyorum."
}
```
**Expected Result:** The system will return a `status: "Invalid"` and record the error `"Invalid email format"`. It intentionally skips the AI step.

#### 🟢 Test Case 2: Valid Input (Testing the AI Analysis)
*Demonstrates that valid data is categorized into specific fields.*
Delete the previous JSON, paste this new JSON, and click Send:
```json
{
  "name": "Busra Demir",
  "email": "busra@example.com",
  "message": "Şirketimiz için Enterprise paketinizle ilgileniyoruz, acil olarak fiyat teklifi alabilir miyiz?"
}
```
**Expected Result:** The system successfully validates the email, sends the message to the Gemini AI, and returns the categorized data: `intent: "Sales"` and `urgency: "High"`. This full data is then saved to the Google Sheets CRM.
