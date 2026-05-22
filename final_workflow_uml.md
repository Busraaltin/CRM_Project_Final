# Final Project Workflow & UML Diagrams (End-to-End CRM Pipeline)

This document contains two visual representations of our intelligent webhook-to-CRM pipeline:
1. **Flowchart (İş Akış Şeması):** Illustrates the high-level decision routing.
2. **UML Sequence Diagram (UML Sıralı Etkileşim Diyagramı):** Chronologically details the API requests, validation logic, Gemini AI processing, and persistence layers.

---

## 📊 1. High-Level Flowchart
Illustrates how validation failure or success determines the workflow path.

```mermaid
flowchart TD
    classDef trigger fill:#FFE082,stroke:#F57F17,stroke-width:2px,color:#000000
    classDef decision fill:#FFCC80,stroke:#EF6C00,stroke-width:2px,color:#000000
    classDef ai fill:#C5E1A5,stroke:#558B2F,stroke-width:2px,color:#000000
    classDef server fill:#81D4FA,stroke:#0288D1,stroke-width:2px,color:#000000
    classDef storage fill:#BCAAA4,stroke:#4E342E,stroke-width:2px,color:#000000
    classDef invalid fill:#EF9A9A,stroke:#C62828,stroke-width:2px,color:#000000

    A["1. Input Gateway<br/>(POST /submit)"]:::trigger -->|"Receives {name, email, message}"| B{"2. Validation Gateway"}:::decision
    
    %% Invalid Path
    B -->|"Missing Field or<br/>Invalid Email"| C["System Marks Lead as 'Invalid'"]:::invalid
    C -->|"Bypasses AI Pipeline<br/>(Saves API Quota)"| H["Save Lead Record<br/>(Status & Errors)"]:::server
    
    %% Valid Path
    B -->|"Validation Passes"| D["3. AI Classification<br/>(Gemini 2.5 Flash)"]:::ai
    D -->|"Extracts Intent & Urgency"| E["4. AI Follow-up Draft<br/>(Gemini 2.5 Flash)"]:::ai
    E -->|"Generates Personalized Email"| H
    
    %% Storage & Actions
    H -->|"Commits Lead Data"| F[("SQLite DB: leads table")]:::storage
    H -->|"If Lead is Valid"| I["5. Task Creator"]:::server
    I -->|"Creates Follow-up Task"| G[("SQLite DB: tasks table")]:::storage
    
    H -->|"If EMAIL_USER/PASS exists"| J["6. Nodemailer Transporter"]:::server
    J -->|"Sends Auto-response"| K["Customer's Inbox"]:::trigger
    
    H -->|"Triggers Webhook Sync"| L[("Google Sheets CRM")]:::storage
    
    F --> M["7. Final API Response"]:::trigger
    G --> M
    L --> M
```

---

## 🎯 2. UML Sequence Diagram (Sıralı Etkileşim Diyagramı)
Chronologically maps out how the Node.js server acts as the central coordinator (orchestrator) between the client, local SQLite tables, Gemini AI, and external Google Sheets.

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client (Postman/Web Form)
    participant Server as Node.js Server (Port 3002)
    participant Val as Validation Gateway
    participant AI as Gemini AI API
    participant DB as SQLite DB
    participant Sheets as Google Sheets CRM

    Client->>Server: POST /submit {name, email, message}
    activate Server
    Server->>Val: validatePayload()
    activate Val
    
    alt Validation Fails (e.g. Missing/Bad Email)
        Val-->>Server: Return {isValid: false, errors}
        deactivate Val
        Server->>DB: INSERT INTO leads (status: 'Invalid')
        Server->>Sheets: POST sheetPayload (status: 'Invalid')
        Server-->>Client: Return 200 JSON (success: true, status: 'Invalid')
    else Validation Passes
        activate Val
        Val-->>Server: Return {isValid: true}
        deactivate Val
        
        Server->>AI: analyzeWithGemini(message)
        activate AI
        AI-->>Server: Return {intent, urgency}
        deactivate AI
        
        Server->>AI: generateFollowUpEmail(name, message, intent, urgency)
        activate AI
        AI-->>Server: Return email_draft
        deactivate AI
        
        Server->>DB: INSERT INTO leads (status: 'Valid', intent, urgency, email_draft)
        Server->>DB: createTask(leadId, name, intent, urgency)
        
        alt EMAIL credentials configured
            Server->>Client: Send auto-response email via Nodemailer
        end
        
        Server->>Sheets: POST sheetPayload (includes AI metadata & tasks)
        Server-->>Client: Return 200 JSON (success: true, status: 'Valid', ai_analysis, email_draft)
    end
    deactivate Server
```
