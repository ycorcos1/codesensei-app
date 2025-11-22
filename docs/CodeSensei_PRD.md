# **PRODUCT REQUIREMENTS DOCUMENT (UPDATED FOR FINAL NAME)**
### **CodeSensei — AI-Powered Code Review Web Application**
**Owner:** Yahav Corcos  
**Source Brief:** Automattic Code Review Challenge  
**Status:** Finalized PRD — All Requirements Implemented

---

# **1. Product Overview**

**CodeSensei** is a full-featured, production-grade AI-powered code review tool.  
Users can upload or write code, highlight specific blocks (or the whole file), and engage in inline AI conversations (“threads”) directly tied to that selection. Using AWS Bedrock, CodeSensei provides contextual analysis, improvement suggestions, refactoring help, diff-based patches, and deep code understanding that feels natural inside a Monaco-powered coding experience.

CodeSensei brings AI directly *into* the code workflow rather than sitting in a separate chat window — making code review faster, smarter, and more intuitive.

---

# **2. Goals & Philosophy**

### Primary Goals
- Provide precise, contextual, intelligent code review using AWS Bedrock.
- Support **multiple inline conversation threads** per file.
- Deliver a polished, developer-centric UX using Monaco Editor.
- Persist all sessions, threads, and messages via AWS backend.
- Handle whole-file or block-level analysis elegantly.
- Support long files, complex structures, and multi-language code.
- Create a tool that feels like a real product — not a demo.

### CodeSensei Philosophy
- Manual edits = explicit save.  
- AI edits = auto-save for reliability.  
- Smart anchoring ensures conversations stay relevant.  
- Clean, intuitive UX that feels like VSCode + AI inline review.  
- Simple architecture that scales smoothly.

---

# **3. Core Functional Requirements**

## **3.1 Authentication**
- Sign up with Name, Email, Username, Password + Confirmation
- Password requirements:
  - Minimum 8 characters
  - At least 1 uppercase letter
  - At least 1 number
  - At least 1 special character
- Password strength indicator during signup
- Secure login (username + password)
- Protected sessions via JWT access tokens (15-min expiry) + refresh tokens (7-day expiry)
- httpOnly, secure, sameSite=strict cookies for token storage
- Automatic token refresh on expiry
- Logout support with cookie clearing
- Rate limiting: 5 login/signup attempts per minute per IP

---

## **3.2 Code Sessions**
A **CodeSensei session** represents:

- One code file  
- Its saved content (max 5MB per session)
- All associated threads  
- Version number for conflict detection

Users can:

- Create sessions by uploading files (max 5MB) or pasting code
- Reopen previous sessions from dashboard
- Restore code + threads exactly
- Rename sessions via metadata update
- Delete sessions (with confirmation)
- View session list with pagination (50 per page)

**Limits:**
- Max 100 sessions per user
- Max 5MB per session code content
- Session list sorted by most recently updated

---

## **3.3 Manual Save System (User Edits Only)**

### Manual Save
- Save button in editor toolbar
- Cmd+S / Ctrl+S keyboard shortcut
- Tracks dirty state (unsaved changes indicator)
- Unsaved changes trigger a confirmation modal on navigation
- Version number sent with save request for conflict detection

### Auto-Save on AI Patch
When the user applies an AI-generated patch:

- Code updates via Monaco API  
- Patch is **automatically saved to backend**
- Version number incremented
- Dirty flag resets  
- Ensures AI changes are never lost  
- Success toast: "Patch applied and saved"

### Conflict Handling (Optimistic Locking)
- Each session has a `version_number` field
- On save, client sends `expected_version_number`
- Backend compares with current version:
  - **Match**: Save succeeds, increment version
  - **Mismatch**: Return 409 Conflict with current code
- Frontend shows merge UI:
  - Option 1: Keep your changes (overwrite server)
  - Option 2: Use server version (discard yours)
  - Option 3: Manual merge (show diff, edit, then save)
- User's unsaved changes backed up to localStorage
- Last-write-wins only after user explicitly chooses in merge UI

---

## **3.4 Editor Interface**
Powered by **Monaco**:

- File upload  
- Syntax highlighting  
- Undo/redo support  
- Line numbers  
- Code folding  
- Multi-language support  
- Dark theme default  
- Clean layout compatible with inline threads  

---

## **3.5 Language Picker (Directly Integrated Into CodeSensei)**

Three-layer system:

1. Auto-detection (Monaco + filename)  
2. Displayed as visible dropdown  
3. Manual override by user  

Overrides update:

- Monaco highlighting  
- Session metadata  
- AI prompt language

---

## **3.6 Thread System (Inline AI Conversations)**

Threads = inline AI chats tied to:

- A selected block  
- OR the entire file (if no selection)

Each thread includes:

```
id
session_id
user_id
type: "block" | "file"
start_line
end_line
selected_text
anchor_status: "stable" | "approximate"
created_at
```

Features:

- Multiple threads per file (max 50 per session)
- Overlapping/nested selections fully supported  
- Thread sidebar for navigation  
- Gutter markers for visibility (orange dots, clickable)
- Thread list shows line ranges and anchor status
- Each thread has independent message history (max 500 messages per thread)  

---

## **3.7 Smart Anchor Tracking**
CodeSensei automatically keeps threads aligned with code changes.

1. Store exact selected_text when thread created.  
2. On load/save:  
   - If text found → update position (stable).  
   - If not → fallback to stored range (approximate).  

A subtle label shows anchor stability in the thread.

---

## **3.8 AI Integration (AWS Bedrock)**

Each AI call must include:

- Full file content (if under 80,000 tokens)
- OR fallback to block + ±50 lines context if file is large
- Selected text and its line numbers  
- Language  
- User prompt (max 5000 characters)
- Thread history (last 10 messages for context)

**Token Management:**
- Estimation: ~4 chars per token
- Max input tokens: 100,000 (~400KB)
- Fallback threshold: 80,000 tokens
- Context window: ±50 lines around selection

AI returns structured response:

```json
{
  "explanation": "Analysis in markdown format",
  "suggested_code": "Improved code (optional)",
  "patch": {
    "start_line": number,
    "end_line": number,
    "replacement": "code"
  },
  "context_mode": "full" | "local",
  "confidence": "high" | "medium" | "low"
}
```

AI capabilities:
- Structural feedback  
- Refactoring suggestions  
- Code explanations  
- Bug identification
- Security issue detection
- Performance optimization recommendations
- Best practice enforcement
- Replacement code with line-specific patches
- Patch regions for diff view  

### AI Call Hygiene (CodeSensei Standard)
- Timeout protection: 30-second max
- Cancel in-flight requests when switching context/threads
- Per-user rate limiting: 10 requests/minute
- Clear, human-readable client-side error messages
- Retry logic with exponential backoff for Bedrock throttling
- Token usage logging for cost tracking  

---

## **3.9 Large File Handling**
If file exceeds token budget (80,000 tokens):

- Automatically use selected block + ±50 lines context window
- Subtle UI indicator in thread panel: "Using local context due to large file size"
- Optional badge in editor header if file >1000 lines
- AI still provides high-quality reviews with local context
- User can select smaller blocks for more focused analysis

---

## **3.10 Diff View + Apply Patch**
- Monaco diff editor in full-screen modal
- Before/After views side-by-side
- Line-by-line comparison with red/green highlights
- **"Apply Patch"** button:
  - Replaces code in editor using Monaco API
  - Automatically saves with version increment
  - Shows success toast
  - Closes modal
- **"Cancel"** button to dismiss without applying
- Undo/redo preserved after patch application
- Esc keyboard shortcut to close modal  

---

## **3.11 AI Conversations (Thread Messages)**

- Cmd/Ctrl + Enter = send message (only when message input is focused)
- Esc = close diff/modals/thread panel
- Natural chat UX with scrollable message history
- Loading indicators: "AI is thinking..." with animated pulse
- Thread history persisted with pagination (100 messages per page)
- Human-readable error messages for all failure modes
- Message character limit: 5000 chars with counter
- Support for markdown rendering in AI responses
- Code blocks in AI messages are syntax highlighted
- "Copy Code" button for code suggestions
- "View Diff" button for patch suggestions
- Optimistic UI updates (show user message immediately)  

---

# **4. Non-Functional Requirements**

## **4.1 Performance**
- Monaco stays responsive even with 10,000+ line files
- AI calls async and cancelable
- Fast anchor scanning (< 100ms for typical files)
- Session list loads in < 500ms
- Dashboard renders in < 200ms
- Thread panel opens instantly (no animation)
- Code saves complete in < 1 second

## **4.2 Reliability**
- Sessions never corrupt due to version conflict handling
- AI errors handled gracefully with user-friendly messages
- Patch application consistent and atomic (all-or-nothing)
- DynamoDB point-in-time recovery enabled (35-day window)
- Automatic retry with exponential backoff for transient failures
- LocalStorage backup of unsaved changes

## **4.3 Security**
- Full HTTPS everywhere (TLS 1.2+)
- Hashed passwords with bcrypt (cost factor 10)
- JWT tokens with RS256 signing
- Short-lived access tokens (15 min) + refresh tokens (7 days)
- httpOnly, secure, sameSite=strict cookies
- User isolation: all queries filtered by user_id
- No cross-session data leakage
- Rate limiting on all endpoints
- Input validation and sanitization
- No code execution on backend (analysis via Bedrock only)
- IAM least-privilege roles for all Lambda functions

## **4.4 UX/UI**
Handled in Design Spec — clean, dark-first, developer-friendly.

**Key UX principles:**
- Immediate feedback for all actions
- Clear loading states (skeletons, spinners, progress indicators)
- Comprehensive error messages with recovery actions
- Empty states guide users on next steps
- Keyboard shortcuts for power users
- Mobile-responsive with touch-friendly targets
- Accessibility compliant (WCAG 2.1 AA)
- No animations (instant UI for speed perception)

---

# **5. System Architecture Summary**

### **Frontend (React)**
Pages:
- Landing Page (marketing)
- Login  
- Signup  
- Dashboard (session list with pagination)
- CodeSensei Editor Workspace (Monaco + thread panel)
- Settings (profile, password, preferences)
- About

Components:
- Monaco Editor (code editing + diff view)
- Thread/AI Panel (slide-in, fixed 450px)
- Toast notification system
- Modal dialogs (confirmations, conflicts, diffs)
- Form validation components
- Loading states (skeletons, spinners)

### **Backend (AWS)**
- **API Gateway**: REST API with CORS, rate limiting, JWT auth
- **Lambda Functions**: 
  - Auth Lambda (signup, login, logout, refresh, user profile)
  - Sessions Lambda (CRUD, versioning, conflict detection)
  - Threads Lambda (CRUD, anchor tracking)
  - Messages Lambda (CRUD, pagination)
  - AI Lambda (Bedrock integration, token management)
- **DynamoDB Tables**:
  - Users (with GSIs on email, username)
  - Sessions (with GSI on user_id + created_at)
  - Threads (with GSI on session_id + created_at)
  - Messages (composite key: thread_id + timestamp)
- **AWS Bedrock Runtime**: Claude 3.7 Sonnet (or latest)
- **CloudWatch**: Logs, metrics, alarms, dashboards

### **Deployment**
- **Frontend**: AWS Amplify or S3 + CloudFront
- **Backend**: AWS SAM or Terraform for IaC
- **CI/CD**: GitHub Actions
  - Frontend: auto-deploy on push to main
  - Backend: package + deploy Lambda functions
- **Environments**: Dev, Staging, Production  

---

# **6. Data Models**

### **User**
```
id, name, email, username, password_hash, created_at
```

**Constraints:**
- email: unique, valid format
- username: unique, 3-20 alphanumeric chars
- password_hash: bcrypt with cost 10

### **Session**
```
id, user_id, code_content, filename, language_detected,
language_override, version_number, created_at, updated_at,
last_modified_by
```

**Constraints:**
- code_content: max 5MB
- version_number: incremented on each save
- Max 100 sessions per user

### **Thread**
```
id, session_id, user_id, type, start_line, end_line,
selected_text, anchor_status, created_at
```

**Constraints:**
- type: "block" | "file"
- anchor_status: "stable" | "approximate"
- Max 50 threads per session

### **Message**
```
id, thread_id, role, content, timestamp, context_mode, token_count
```

**Constraints:**
- role: "user" | "ai"
- content: max 5000 chars for user, unlimited for AI
- context_mode: "full" | "local" (AI messages only)
- token_count: for cost tracking (AI messages only)
- Max 500 messages per thread

---

# **7. Success Criteria**

CodeSensei is successful if:

- Inline block and whole-file reviews feel natural and intuitive
- Threads persist reliably across sessions and edits
- Anchor-tracking works correctly, updating positions when code changes
- Diff view + Apply Patch workflow is smooth and confidence-inspiring
- Manual-save + auto-save hybrid works perfectly without data loss
- Version conflict detection prevents overwriting others' changes
- Language handling is flexible and accurate
- Large files degrade gracefully to local context
- Error messages are clear and actionable
- Loading states provide feedback within 100ms
- Empty states guide new users effectively
- Keyboard shortcuts work for power users
- Mobile experience is usable (even if desktop-optimized)
- AI responses are contextually relevant and helpful
- Rate limiting prevents abuse without impacting normal users
- Security measures protect user data and prevent unauthorized access
- Cost per user remains predictable and reasonable
- System scales smoothly from 10 to 10,000 users
- UX is polished and modern, comparable to professional SaaS products

**Quantitative Success Metrics:**
- Session save success rate: >99.9%
- AI response time: <10 seconds (p95)
- Page load time: <2 seconds (p95)
- Error rate: <1% across all endpoints
- User retention: >60% after 30 days
- AI helpfulness rating: >4/5 stars
- Version conflict rate: <5% of saves
- Mobile usability score: >70% on Lighthouse

**Last Updated:** November 22, 2025  
**Version:** 2.0 (Comprehensive PRD with all production requirements)  
