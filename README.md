# CodeSensei — AI-Powered Inline Code Review Platform

---

## Table of Contents

1. [Overview](#overview)
2. [The Problem](#the-problem)
3. [The Solution](#the-solution)
4. [Key Features](#key-features)
5. [Technology Stack](#technology-stack)
6. [Architecture](#architecture)
7. [AWS Services Used](#aws-services-used)
8. [Database Schema](#database-schema)
9. [API Reference](#api-reference)
10. [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Backend Setup](#backend-setup)
    - [Frontend Setup](#frontend-setup)
    - [Environment Variables](#environment-variables)
11. [Development Workflow](#development-workflow)
12. [Large File Handling](#large-file-handling)
13. [Security & Privacy](#security--privacy)
14. [Scaling Considerations](#scaling-considerations)
15. [Key Architectural Decisions](#key-architectural-decisions)
16. [Trade-offs Made](#trade-offs-made)
17. [Development with AI Tools](#development-with-ai-tools)
18. [What I'd Do Differently](#what-id-do-differently-with-more-time)
19. [Future Enhancements](#future-enhancements)
20. [Lessons Learned](#lessons-learned)
21. [License](#license)
22. [Author](#author)

---

## Overview

**CodeSensei** is a full-featured, production-grade AI-powered code review web application built as part of the Automattic Code Review Challenge. It brings AI directly into the code workflow by allowing users to create inline conversation threads tied to specific code blocks, receive contextual AI analysis, view diff-based patches, and apply suggestions with one click.

Unlike traditional code review tools where AI sits in a separate chat window, CodeSensei anchors AI conversations directly to the code they reference, creating a natural and intuitive review experience.

**Version:** 2.0 (Production-Ready)  
**Status:** Fully implemented and deployed  
**Owner:** Yahav Corcos

---

## The Problem

Traditional code review workflows suffer from several pain points:

1. **Context Switching**: Developers must copy code into separate AI chat windows, losing the connection between feedback and code location.

2. **Lost Conversations**: AI suggestions aren't persisted or tied to specific code regions, making it hard to track what was discussed.

3. **Manual Patch Application**: Applying AI suggestions requires manual copy-paste, which is error-prone and tedious.

4. **No Anchor Tracking**: When code changes, previous review comments become orphaned and lose their context.

5. **Large File Limitations**: Most AI tools can't handle large codebases effectively, either timing out or losing context.

---

## The Solution

CodeSensei solves these problems by:

- **Inline AI Conversations**: Create multiple threads per file, each tied to a specific code block or the entire file
- **Persistent Threads**: All conversations are saved and restored with the session
- **Smart Anchor Tracking**: Threads automatically follow code as it moves or changes
- **One-Click Patches**: View diffs in Monaco's diff editor and apply with a single click
- **Auto-Save on Patch**: AI suggestions are automatically saved when applied
- **Large File Handling**: Intelligent context windowing for files that exceed token limits
- **Multi-Language Support**: Works with any language Monaco Editor supports

---

## Key Features

| Feature                     | Description                                                                |
| --------------------------- | -------------------------------------------------------------------------- |
| **Inline AI Threads**       | Create conversations anchored to specific code selections                  |
| **Monaco Editor**           | Full-featured code editor with syntax highlighting, folding, and undo/redo |
| **Diff View & Apply Patch** | Side-by-side comparison with one-click code replacement                    |
| **Smart Anchoring**         | Threads follow code changes; shows "stable" or "approximate" status        |
| **Session Management**      | Persistent sessions with full edit history and version control             |
| **Conflict Detection**      | Optimistic locking prevents data loss from concurrent edits                |
| **Rate Limiting**           | Per-user and per-endpoint rate limits prevent abuse                        |
| **JWT Authentication**      | Secure auth with short-lived access tokens and refresh tokens              |
| **Responsive Design**       | Works on desktop, tablet, and mobile devices                               |

---

## Technology Stack

### Frontend

| Technology       | Purpose                    |
| ---------------- | -------------------------- |
| React 19.2       | UI framework               |
| Vite 7.2         | Build tool and dev server  |
| Monaco Editor    | Code editing and diff view |
| React Router 7.9 | Client-side routing        |
| CSS (Custom)     | Dark theme styling         |

### Backend

| Technology   | Purpose                               |
| ------------ | ------------------------------------- |
| Node.js 22.x | Lambda runtime                        |
| AWS SAM      | Infrastructure as Code                |
| bcrypt       | Password hashing                      |
| jsonwebtoken | JWT token management                  |
| JSON5        | Lenient JSON parsing for AI responses |

### Infrastructure

| Service         | Purpose                  |
| --------------- | ------------------------ |
| AWS Lambda      | Serverless compute       |
| API Gateway     | REST API management      |
| DynamoDB        | NoSQL database           |
| AWS Bedrock     | Claude AI model access   |
| AWS Amplify     | Frontend hosting & CI/CD |
| Secrets Manager | JWT secret storage       |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Frontend (React + Vite)                        │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  ┌────────────┐ │
│  │  Landing    │  │  Dashboard   │  │     Editor     │  │  Settings  │ │
│  │  Login      │  │  (Sessions)  │  │  Monaco +      │  │  Profile   │ │
│  │  Signup     │  │              │  │  Thread Panel  │  │            │ │
│  └─────────────┘  └──────────────┘  └────────────────┘  └────────────┘ │
│                                                                          │
│  Hosted on AWS Amplify (CI/CD from GitHub)                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         API Gateway (REST)                               │
│  • CORS enforcement (specific origin only)                              │
│  • Rate limiting                                                         │
│  • JWT cookie validation                                                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         AWS Lambda Functions                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │   Auth   │  │ Sessions │  │ Threads  │  │ Messages │  │    AI    │ │
│  │  Lambda  │  │  Lambda  │  │  Lambda  │  │  Lambda  │  │  Lambda  │ │
│  │          │  │          │  │          │  │          │  │          │ │
│  │ signup   │  │ CRUD     │  │ CRUD     │  │ CRUD     │  │ analyze  │ │
│  │ login    │  │ version  │  │ anchor   │  │ paginate │  │ Bedrock  │ │
│  │ logout   │  │ conflict │  │ tracking │  │          │  │ fallback │ │
│  │ refresh  │  │          │  │          │  │          │  │          │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           DynamoDB Tables                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  Users   │  │ Sessions │  │ Threads  │  │ Messages │  │   Rate   │ │
│  │  + GSIs  │  │  + GSI   │  │  + GSI   │  │          │  │  Limits  │ │
│  │          │  │          │  │          │  │          │  │  (TTL)   │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         AWS Bedrock Runtime                              │
│                    Claude 3 Sonnet (Code Review AI)                      │
│  • Structured JSON responses                                             │
│  • Token-aware context management                                        │
│  • Retry with exponential backoff                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## AWS Services Used

| Service             | Usage                                                      | Why This Choice                                              |
| ------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| **Lambda**          | 6 functions (Auth, Users, Sessions, Threads, Messages, AI) | Serverless = no server management, pay-per-use, auto-scaling |
| **API Gateway**     | REST API with CORS and rate limiting                       | Managed API layer with built-in throttling                   |
| **DynamoDB**        | 5 tables with GSIs                                         | Serverless NoSQL, on-demand billing, point-in-time recovery  |
| **Bedrock**         | Claude 3 Sonnet model                                      | AWS-native AI, no API key management, IAM-based access       |
| **Amplify**         | Frontend hosting                                           | Auto-deploy from GitHub, SSL, CDN included                   |
| **Secrets Manager** | JWT signing secret                                         | Secure secret rotation, IAM-based access                     |
| **CloudWatch**      | Logs and metrics                                           | Centralized logging for all Lambda functions                 |

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USERS TABLE                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ PK: user_id (String)                                                    │
├─────────────────────────────────────────────────────────────────────────┤
│ • name (String)                                                         │
│ • email (String) ─────────────────────► GSI: EmailIndex                 │
│ • username (String) ──────────────────► GSI: UsernameIndex              │
│ • password_hash (String, bcrypt)                                        │
│ • created_at (ISO8601 String)                                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ 1:N
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            SESSIONS TABLE                                │
├─────────────────────────────────────────────────────────────────────────┤
│ PK: session_id (String)                                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ • user_id (String) ───────────────────► GSI: UserIdIndex (PK)           │
│ • code_content (String, max 5MB)        + created_at (SK)               │
│ • filename (String)                                                     │
│ • language_detected (String)                                            │
│ • language_override (String, optional)                                  │
│ • version_number (Number) ─────────────► Optimistic locking             │
│ • created_at (ISO8601 String)                                           │
│ • updated_at (ISO8601 String)                                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ 1:N
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            THREADS TABLE                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ PK: thread_id (String)                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│ • session_id (String) ────────────────► GSI: SessionIdIndex (PK)        │
│ • user_id (String)                      + created_at (SK)               │
│ • type (String: "block" | "file")                                       │
│ • start_line (Number)                                                   │
│ • end_line (Number)                                                     │
│ • selected_text (String)                                                │
│ • anchor_status (String: "stable" | "approximate")                      │
│ • created_at (ISO8601 String)                                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ 1:N
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           MESSAGES TABLE                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ PK: thread_id (String)                                                  │
│ SK: timestamp (ISO8601 String)                                          │
├─────────────────────────────────────────────────────────────────────────┤
│ • message_id (String)                                                   │
│ • role (String: "user" | "ai")                                          │
│ • content (String)                                                      │
│ • context_mode (String: "full" | "local") ── AI messages only           │
│ • token_count (Number) ───────────────────── AI messages only           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                          RATE_LIMITS TABLE                               │
├─────────────────────────────────────────────────────────────────────────┤
│ PK: rate_key (String) ─────── Format: "{endpoint}#{user_id|ip}"         │
├─────────────────────────────────────────────────────────────────────────┤
│ • count (Number)                                                        │
│ • window_start (Number, epoch)                                          │
│ • ttl (Number, epoch) ────────────────► DynamoDB TTL auto-cleanup       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Table Settings

| Table      | Billing   | Point-in-Time Recovery | TTL        |
| ---------- | --------- | ---------------------- | ---------- |
| Users      | On-demand | ✅ Enabled             | ❌         |
| Sessions   | On-demand | ✅ Enabled             | ❌         |
| Threads    | On-demand | ✅ Enabled             | ❌         |
| Messages   | On-demand | ✅ Enabled             | ❌         |
| RateLimits | On-demand | ❌                     | ✅ Enabled |

---

## API Reference

### Authentication Endpoints

| Method | Endpoint        | Description             | Auth Required |
| ------ | --------------- | ----------------------- | ------------- |
| `POST` | `/auth/signup`  | Create new user account | ❌            |
| `POST` | `/auth/login`   | Authenticate user       | ❌            |
| `POST` | `/auth/logout`  | Clear auth cookies      | ✅            |
| `POST` | `/auth/refresh` | Refresh access token    | Refresh token |

### User Endpoints

| Method   | Endpoint             | Description                            | Auth Required |
| -------- | -------------------- | -------------------------------------- | ------------- |
| `GET`    | `/users/me`          | Get current user profile               | ✅            |
| `PUT`    | `/users/me`          | Update profile (name, username, email) | ✅            |
| `PUT`    | `/users/me/password` | Change password                        | ✅            |
| `DELETE` | `/users/me`          | Delete account                         | ✅            |

### Session Endpoints

| Method   | Endpoint                  | Description                              | Auth Required |
| -------- | ------------------------- | ---------------------------------------- | ------------- |
| `GET`    | `/sessions`               | List user's sessions (paginated)         | ✅            |
| `POST`   | `/sessions`               | Create new session                       | ✅            |
| `GET`    | `/sessions/{id}`          | Get session details                      | ✅            |
| `PUT`    | `/sessions/{id}`          | Update session code (with version check) | ✅            |
| `PATCH`  | `/sessions/{id}/metadata` | Update session metadata                  | ✅            |
| `DELETE` | `/sessions/{id}`          | Delete session                           | ✅            |

### Thread Endpoints

| Method   | Endpoint                      | Description              | Auth Required |
| -------- | ----------------------------- | ------------------------ | ------------- |
| `GET`    | `/sessions/{id}/threads`      | List threads for session | ✅            |
| `POST`   | `/sessions/{id}/threads`      | Create new thread        | ✅            |
| `GET`    | `/threads/{thread_id}`        | Get thread details       | ✅            |
| `PUT`    | `/threads/{thread_id}`        | Update thread            | ✅            |
| `PATCH`  | `/threads/{thread_id}/anchor` | Update anchor position   | ✅            |
| `DELETE` | `/threads/{thread_id}`        | Delete thread            | ✅            |

### Message Endpoints

| Method | Endpoint                        | Description               | Auth Required |
| ------ | ------------------------------- | ------------------------- | ------------- |
| `GET`  | `/threads/{thread_id}/messages` | List messages (paginated) | ✅            |
| `POST` | `/threads/{thread_id}/messages` | Add message               | ✅            |

### AI Endpoints

| Method | Endpoint      | Description          | Auth Required |
| ------ | ------------- | -------------------- | ------------- |
| `POST` | `/ai/analyze` | Analyze code with AI | ✅            |

### Health Check

| Method | Endpoint  | Description          | Auth Required |
| ------ | --------- | -------------------- | ------------- |
| `GET`  | `/health` | Service health check | ❌            |

### Rate Limits

| Endpoint Category   | Limit                       |
| ------------------- | --------------------------- |
| Auth (signup/login) | 5 requests/minute per IP    |
| AI analyze          | 10 requests/minute per user |
| Session saves       | 60 requests/minute per user |
| Session creates     | 20 requests/minute per user |

### Error Response Format

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "field": "fieldName (for validation errors)"
  }
}
```

---

## Getting Started

### Prerequisites

- **Node.js 18+** and npm
- **AWS Account** with:
  - Bedrock access (Claude model enabled in us-east-1)
  - AWS CLI configured with appropriate permissions
- **AWS SAM CLI** for backend deployment
- **Git** for version control

### Backend Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/codesensei-app.git
   cd codesensei-app/backend
   ```

2. **Create JWT Secret in AWS Secrets Manager**

   ```bash
   aws secretsmanager create-secret \
     --name CodeSensei-JWT-Secret-dev \
     --secret-string '{"secret":"your-secure-random-string-here"}'
   ```

3. **Deploy with SAM**

   ```bash
   sam build
   sam deploy --guided
   ```

   During guided deployment, you'll set:

   - Stack name: `CodeSensei-backend`
   - Region: `us-east-1` (required for Bedrock)
   - Environment: `dev`, `staging`, or `prod`
   - CORS origin: Your frontend URL

4. **Note the API URL** from the deployment outputs

### Frontend Setup

1. **Navigate to frontend directory**

   ```bash
   cd ../frontend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Create environment file**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your API URL:

   ```
   VITE_API_BASE_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/dev
   ```

4. **Run development server**

   ```bash
   npm run dev
   ```

5. **Build for production**
   ```bash
   npm run build
   ```

### Environment Variables

#### Frontend (.env)

| Variable            | Required | Description             | Example                                               |
| ------------------- | -------- | ----------------------- | ----------------------------------------------------- |
| `VITE_API_BASE_URL` | ✅       | Backend API Gateway URL | `https://xxx.execute-api.us-east-1.amazonaws.com/dev` |

#### Backend (SAM Parameters & Lambda Environment)

| Variable                     | Required | Description              | Default                                   |
| ---------------------------- | -------- | ------------------------ | ----------------------------------------- |
| `Environment`                | ✅       | Deployment environment   | `dev`                                     |
| `CorsAllowedOrigin`          | ✅       | Frontend origin for CORS | -                                         |
| `NODE_ENV`                   | Auto     | Environment mode         | Set from `Environment`                    |
| `REGION`                     | Auto     | AWS region               | Set from stack region                     |
| `JWT_ACCESS_EXPIRY`          | ❌       | Access token lifetime    | `15m`                                     |
| `JWT_REFRESH_EXPIRY`         | ❌       | Refresh token lifetime   | `7d`                                      |
| `JWT_ISSUER`                 | ❌       | JWT issuer claim         | `CodeSensei`                              |
| `BEDROCK_MODEL_ID`           | ❌       | Claude model ID          | `anthropic.claude-3-sonnet-20240229-v1:0` |
| `BEDROCK_REGION`             | ❌       | Bedrock region           | `us-east-1`                               |
| `BEDROCK_MAX_OUTPUT_TOKENS`  | ❌       | Max AI response tokens   | `4000`                                    |
| `BEDROCK_TEMPERATURE`        | ❌       | AI creativity setting    | `0.7`                                     |
| `AUTH_RATE_LIMIT_PER_MINUTE` | ❌       | Auth endpoint rate limit | `5`                                       |
| `AI_RATE_LIMIT_PER_MINUTE`   | ❌       | AI endpoint rate limit   | `10`                                      |
| `MAX_SESSIONS_PER_USER`      | ❌       | User session limit       | `100`                                     |
| `MAX_SESSION_CODE_BYTES`     | ❌       | Max code size            | `5242880` (5MB)                           |
| `MAX_THREADS_PER_SESSION`    | ❌       | Thread limit per session | `50`                                      |
| `MAX_MESSAGES_PER_THREAD`    | ❌       | Message limit per thread | `500`                                     |

> **Note:** Sensitive values like `JWT_SECRET` are stored in AWS Secrets Manager and resolved at deployment time. Never commit secrets to version control.

---

## Development Workflow

### Local Development

```bash
# Terminal 1: Frontend dev server
cd frontend
npm run dev
# Runs on http://localhost:5173

# Backend: Deploy to AWS (no local Lambda runtime used)
cd backend
sam build && sam deploy
```

### Code Style

- **Frontend**: ESLint with React hooks plugin
- **Backend**: Standard Node.js practices
- **Commits**: Conventional commits format recommended

### Deployment Pipeline

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   GitHub    │────►│   Amplify   │────►│  Frontend   │
│   (push)    │     │   (build)   │     │  (deploy)   │
└─────────────┘     └─────────────┘     └─────────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   GitHub    │────►│  SAM Build  │────►│   Lambda    │
│   (manual)  │     │  & Deploy   │     │  (deploy)   │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Branch Strategy

- `main`: Production-ready code
- Feature branches for development
- PRs required for merging to main

---

## Large File Handling

CodeSensei implements intelligent context management to handle files of any size:

### Token Estimation

```
Estimated tokens = (code_chars + prompt_chars + history_chars) / 4
```

### Thresholds

| Threshold          | Value                   | Action                  |
| ------------------ | ----------------------- | ----------------------- |
| Fallback threshold | 80,000 tokens (~320KB)  | Switch to local context |
| Max input tokens   | 100,000 tokens (~400KB) | Reject with error       |
| Max code size      | 5MB                     | Reject at upload        |

### Context Windowing Strategy

```
┌──────────────────────────────────────────────────────────────┐
│                      Full File (< 80K tokens)                 │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  AI receives entire file for complete context          │  │
│  │  context_mode: "full"                                   │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                   Large File (> 80K tokens)                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  ... (earlier code not sent)                           │  │
│  │  ─────────────────────────────────────────────────────  │  │
│  │  │ 50 lines BEFORE selection (context buffer)        │  │  │
│  │  ├─────────────────────────────────────────────────────┤  │
│  │  │ SELECTED CODE BLOCK                                │  │  │
│  │  │ (what user highlighted)                            │  │  │
│  │  ├─────────────────────────────────────────────────────┤  │
│  │  │ 50 lines AFTER selection (context buffer)         │  │  │
│  │  ─────────────────────────────────────────────────────  │  │
│  │  ... (later code not sent)                             │  │
│  │  context_mode: "local"                                  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### User Feedback

When local context is used, the UI displays:

> "Using local context around your selection due to large file size."

This ensures users understand the AI's analysis scope.

---

## Security & Privacy

### Authentication Security

| Feature               | Implementation                                     |
| --------------------- | -------------------------------------------------- |
| Password Hashing      | bcrypt with cost factor 10                         |
| Password Requirements | Min 8 chars, 1 uppercase, 1 number, 1 special char |
| Access Tokens         | JWT, 15-minute expiry                              |
| Refresh Tokens        | JWT, 7-day expiry                                  |
| Cookie Security       | httpOnly, secure, sameSite=strict                  |
| Secret Storage        | AWS Secrets Manager                                |

### Data Security

| Feature           | Implementation                                 |
| ----------------- | ---------------------------------------------- |
| Transport         | HTTPS/TLS 1.2+ everywhere                      |
| User Isolation    | All queries filtered by user_id                |
| Input Validation  | Sanitization on all inputs                     |
| Rate Limiting     | Per-user and per-IP limits                     |
| No Code Execution | Backend only analyzes code via Bedrock         |
| IAM               | Least-privilege roles for all Lambda functions |

### Privacy Considerations

- **Code Storage**: User code is stored in DynamoDB, encrypted at rest
- **AI Processing**: Code is sent to AWS Bedrock (Claude) for analysis
  - Bedrock does not use customer data for training
  - Data stays within AWS infrastructure
- **No Logging of Code**: Lambda logs contain metadata only, not code content
- **Data Deletion**: Users can delete their account and all associated data

### CORS Policy

- **Development**: Allows localhost origins
- **Production**: Allows only the deployed frontend origin
- Credentials (cookies) are allowed for auth

---

## Scaling Considerations

### How would this work with real codebases?

**Current Implementation:**

- Single-file sessions (one file per session)
- Files up to 5MB supported
- Intelligent context windowing for large files

**For Real Codebases (Future):**

```
┌─────────────────────────────────────────────────────────────┐
│                    Multi-File Sessions                       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Project Root                                            ││
│  │  ├── src/                                               ││
│  │  │   ├── components/   ◄── File tree navigation        ││
│  │  │   ├── utils/                                         ││
│  │  │   └── index.js                                       ││
│  │  └── package.json                                       ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  Considerations:                                             │
│  • S3 storage for project files (not DynamoDB)              │
│  • File tree component in UI                                 │
│  • Cross-file context for AI (imports, dependencies)        │
│  • Git integration for version history                       │
└─────────────────────────────────────────────────────────────┘
```

### What would need to change for team collaboration?

**Current Implementation:**

- Single-user sessions (user_id scoping)
- No sharing or collaboration features

**For Team Collaboration (Future):**

| Feature                 | Implementation Needed                                 |
| ----------------------- | ----------------------------------------------------- |
| Shared Sessions         | Add `team_id` to sessions, permission model           |
| Real-time Collaboration | WebSocket connections (API Gateway WebSocket)         |
| Concurrent Editing      | Operational Transform or CRDT for conflict resolution |
| Comments & Mentions     | Notification system, @mentions in threads             |
| Role-Based Access       | Viewer, Commenter, Editor, Admin roles                |
| Audit Logging           | Track who made what changes when                      |

```
┌─────────────────────────────────────────────────────────────┐
│                  Team Collaboration Model                    │
│                                                              │
│  ┌─────────┐     ┌─────────────┐     ┌─────────────────┐   │
│  │  Users  │────►│    Teams    │────►│  Team Sessions  │   │
│  └─────────┘     └─────────────┘     └─────────────────┘   │
│       │                │                      │             │
│       │                ▼                      ▼             │
│       │         ┌─────────────┐      ┌─────────────────┐   │
│       └────────►│ Permissions │      │ Shared Threads  │   │
│                 └─────────────┘      └─────────────────┘   │
│                                                              │
│  New Tables Needed:                                          │
│  • Teams (team_id, name, owner_id, created_at)              │
│  • TeamMembers (team_id, user_id, role, joined_at)          │
│  • SessionPermissions (session_id, user_id, permission)     │
└─────────────────────────────────────────────────────────────┘
```

### Security and Privacy Considerations for Scaling

| Concern        | Current State      | Scaled State                          |
| -------------- | ------------------ | ------------------------------------- |
| Data Isolation | Per-user           | Per-user + per-team                   |
| Access Control | User owns all data | RBAC with permissions                 |
| Audit Trail    | None               | Full audit logging                    |
| Compliance     | Basic              | SOC2, GDPR considerations             |
| Encryption     | At rest (DynamoDB) | At rest + in transit + key management |

---

## Key Architectural Decisions

### 1. Serverless Architecture (Lambda + DynamoDB)

**Decision:** Use fully serverless AWS services instead of EC2/containers.

**Rationale:**

- Zero server management overhead
- Automatic scaling from 0 to thousands of requests
- Pay-per-use pricing (cost-effective for variable load)
- Built-in high availability

**Trade-off:** Cold starts can add latency (~200-500ms for first request after idle).

### 2. JWT Tokens in httpOnly Cookies

**Decision:** Store JWT tokens in httpOnly cookies instead of localStorage.

**Rationale:**

- Prevents XSS attacks from stealing tokens
- Automatic inclusion in requests (no manual header management)
- sameSite=strict prevents CSRF attacks

**Trade-off:** Requires careful CORS configuration; cookies don't work across different domains.

### 3. Optimistic Locking for Session Saves

**Decision:** Use version numbers for conflict detection instead of last-write-wins.

**Rationale:**

- Prevents silent data loss from concurrent edits
- Users are informed of conflicts and can choose resolution
- Matches how professional tools (Git, Google Docs) handle conflicts

**Trade-off:** More complex UX when conflicts occur; requires merge UI.

### 4. Single AI Lambda with Context Fallback

**Decision:** One AI Lambda handles both full-file and local-context analysis.

**Rationale:**

- Simpler architecture (one endpoint, one function)
- Automatic fallback based on token estimation
- Consistent API for frontend

**Trade-off:** Large files always require a selection; can't do full-file review on huge files.

### 5. DynamoDB with GSIs Instead of Relational DB

**Decision:** Use DynamoDB with Global Secondary Indexes for all data.

**Rationale:**

- Serverless and auto-scaling
- GSIs enable efficient queries (user's sessions, session's threads)
- On-demand billing matches serverless Lambda model

**Trade-off:** No complex joins; denormalized data model; GSI queries have eventual consistency.

### 6. Monaco Editor for Code Editing

**Decision:** Use Monaco (VS Code's editor) instead of simpler alternatives.

**Rationale:**

- Full-featured code editing (syntax highlighting, folding, undo/redo)
- Built-in diff editor for patch visualization
- Familiar to developers (same as VS Code)
- Supports all languages

**Trade-off:** Larger bundle size (~2MB); more complex API than simple textareas.

---

## Trade-offs Made

### 1. Single-File Sessions vs. Project Support

**Chose:** Single-file sessions  
**Over:** Multi-file project support  
**Why:** Simpler data model, faster to implement, sufficient for code review use case  
**Impact:** Users must create separate sessions for each file

### 2. Polling vs. WebSockets for Real-time

**Chose:** No real-time updates (manual refresh)  
**Over:** WebSocket connections for live updates  
**Why:** Simpler architecture, no persistent connection management  
**Impact:** Users don't see live updates from other tabs/sessions

### 3. Server-Side Rendering vs. SPA

**Chose:** Single Page Application (React SPA)  
**Over:** Server-side rendering (Next.js)  
**Why:** Simpler deployment to Amplify, no server runtime needed  
**Impact:** Initial load requires JavaScript; SEO limited (but not needed for this app)

### 4. Custom Auth vs. Cognito/Auth0

**Chose:** Custom JWT authentication  
**Over:** AWS Cognito or Auth0  
**Why:** Full control over auth flow, no additional service costs, learning experience  
**Impact:** More code to maintain; missing features like social login, MFA

### 5. On-Demand DynamoDB vs. Provisioned

**Chose:** On-demand (pay-per-request) billing  
**Over:** Provisioned capacity  
**Why:** Unpredictable traffic patterns, no capacity planning needed  
**Impact:** Slightly higher per-request cost; better for low/variable traffic

### 6. Synchronous AI Calls vs. Async/Streaming

**Chose:** Synchronous request-response for AI  
**Over:** Streaming responses or async with polling  
**Why:** Simpler implementation, structured JSON response parsing  
**Impact:** User waits for full response (up to 30s); no progressive display

---

## Development with AI Tools

### AI-Assisted Development

This project was developed with assistance from AI coding tools. Here's how AI was used and how suggestions were verified:

#### Tools Used

| Tool                     | Usage                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| **Cursor (Claude)**      | Primary development assistant for code generation, debugging, and architecture decisions |
| **AWS Bedrock (Claude)** | Production AI feature for code review functionality                                      |

#### How AI Was Used

1. **Architecture Planning**

   - Discussed serverless patterns and trade-offs
   - Reviewed DynamoDB schema design
   - Evaluated authentication strategies

2. **Code Generation**

   - Lambda function boilerplate
   - React component structure
   - Error handling patterns
   - API endpoint implementations

3. **Debugging**

   - CORS configuration issues
   - JWT token flow problems
   - DynamoDB query optimization

4. **Documentation**
   - README structure and content
   - Code comments
   - API documentation

#### Verification Process

Every AI-generated suggestion was verified through:

1. **Code Review**

   - Read and understood all generated code
   - Checked for security issues (no exposed secrets, proper validation)
   - Verified logic correctness

2. **Testing**

   - Manual testing of all features
   - Edge case testing (large files, invalid inputs, rate limits)
   - Cross-browser testing

3. **Adaptation**
   - Modified AI suggestions to match project conventions
   - Simplified over-engineered solutions
   - Added error handling AI missed
   - Fixed edge cases in AI-generated code

#### What I Changed from AI Suggestions

| AI Suggestion                    | My Adaptation                 | Reason                          |
| -------------------------------- | ----------------------------- | ------------------------------- |
| Complex state management (Redux) | React Context + local state   | Simpler for this app size       |
| Streaming AI responses           | Synchronous JSON responses    | Easier to parse structured data |
| Multiple AI endpoints            | Single `/ai/analyze` endpoint | Simpler API surface             |
| Elaborate retry logic            | Simple exponential backoff    | Sufficient for this use case    |

#### AI Limitations Encountered

- AI sometimes suggested outdated AWS SDK v2 syntax (fixed to use v3)
- Generated overly verbose error handling (simplified)
- Occasionally missed edge cases in validation logic (added manually)
- Suggested features beyond scope (politely declined)

---

## What I'd Do Differently with More Time

### Technical Improvements

1. **Add Comprehensive Testing**

   - Unit tests for Lambda functions (Jest)
   - Integration tests for API endpoints
   - E2E tests for critical flows (Playwright)
   - Coverage reporting

2. **Implement Streaming AI Responses**

   - Use Bedrock's streaming API
   - Progressive display of AI analysis
   - Better UX for long responses

3. **Add Caching Layer**

   - Redis/ElastiCache for session data
   - Reduce DynamoDB reads
   - Cache common AI responses

4. **Improve Monitoring**
   - CloudWatch dashboards
   - Custom metrics for business KPIs
   - Alerting for error spikes
   - Cost monitoring per user

### Feature Improvements

1. **Multi-File Sessions**

   - Project/folder upload
   - File tree navigation
   - Cross-file context for AI

2. **Version History**

   - Git-like commit history
   - Diff between versions
   - Restore previous versions

3. **Collaboration Features**

   - Share sessions (read-only links)
   - Team workspaces
   - Real-time collaboration

4. **Enhanced AI Features**
   - Multiple AI models (Claude, GPT-4)
   - Custom prompts/personas
   - Code generation (not just review)

### UX Improvements

1. **Keyboard Shortcuts**

   - Full keyboard navigation
   - Vim/Emacs keybindings option
   - Shortcut customization

2. **Themes**

   - Light mode option
   - Multiple color themes
   - Custom theme editor

3. **Mobile Experience**
   - Better touch interactions
   - Responsive thread panel
   - Mobile-optimized editor

---

## Future Enhancements

### Short-term (Next Release)

- [ ] Password reset / forgot password flow
- [ ] Email verification for signups
- [ ] Session search and filtering
- [ ] Export session as file
- [ ] Multiple Monaco themes

### Medium-term (Future Releases)

- [ ] Multi-file session support
- [ ] Real-time collaboration (WebSockets)
- [ ] Team workspaces
- [ ] Git integration
- [ ] VS Code extension

### Long-term (Vision)

- [ ] CI/CD integration (PR review bot)
- [ ] Custom AI model fine-tuning
- [ ] Enterprise SSO (SAML/OIDC)
- [ ] On-premise deployment option
- [ ] API for third-party integrations

---

## Lessons Learned

### Technical Lessons

1. **CORS is always harder than expected**

   - Spent significant time debugging cookie + CORS issues
   - Learned the importance of matching origins exactly

2. **DynamoDB requires different thinking**

   - Coming from SQL, had to rethink data access patterns
   - GSIs are powerful but require upfront planning

3. **AI response parsing is tricky**

   - Claude doesn't always return valid JSON
   - Needed fallback parsing (JSON5) and sanitization

4. **Serverless cold starts matter**
   - First request after idle can be slow
   - Considered provisioned concurrency for production

### Process Lessons

1. **Start with the backend**

   - Having a working API made frontend development faster
   - Could test against real endpoints from day one

2. **Document as you go**

   - Writing docs alongside code saved time
   - Easier to remember decisions when fresh

3. **AI assistance is powerful but requires verification**
   - AI accelerated development significantly
   - But every suggestion needed review and testing

### What Worked Well

- Serverless architecture eliminated ops overhead
- Monaco Editor provided professional editing experience
- JWT + cookies provided secure, simple auth
- Structured AI responses enabled reliable patch application

### What Was Challenging

- Debugging Lambda functions (CloudWatch logs are clunky)
- Managing state across React components
- Handling all the edge cases in AI response parsing
- Making the UI responsive across screen sizes

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Author

**Yahav Corcos**

- GitHub: [@yahav](https://github.com/yahav)
- LinkedIn: [Yahav Corcos](https://linkedin.com/in/yahav)

---

## Acknowledgments

- **Automattic** - For the code review challenge that inspired this project
- **AWS** - For Bedrock and the serverless infrastructure
- **Microsoft** - For Monaco Editor
- **Anthropic** - For Claude AI model
- **Cursor** - For AI-assisted development

---

<div align="center">

**Built with ❤️ for better code reviews**

[⬆ Back to Top](#codesensei--ai-powered-inline-code-review-platform)

</div>
