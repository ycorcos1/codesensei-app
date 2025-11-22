# **CodeSensei Architecture Document**

### Backend, Infrastructure, and Deployment Architecture

**Owner:** Yahav Corcos  
**Project:** CodeSensei – AI-Powered Inline Code Review Tool  
**Document Purpose:** Define the backend systems, AWS infrastructure, APIs, data flow, and deployment architecture that power the CodeSensei platform.

---

# **1. High-Level Architecture Overview**

CodeSensei is a cloud-backed AI code review platform built with a React frontend and a fully serverless AWS backend.  
All processing, persistence, and AI interactions are executed via AWS services to ensure scalability, reliability, and low operational overhead.

The architecture includes:

- **Frontend:** React (hosted on AWS Amplify or S3 + CloudFront)
- **Backend APIs:** AWS API Gateway + AWS Lambda
- **Database:** DynamoDB (Sessions, Threads, Messages, Users)
- **AI Provider:** AWS Bedrock (Claude 4.7 or latest)
- **Authentication:** Custom auth using DynamoDB + hashed passwords + JWT/HTTP-only cookies
- **Storage:** DynamoDB only (no S3 needed unless future attachments added)
- **Deployment:** CI/CD through GitHub → Amplify (Frontend) + Lambda (Backend)

---

# **2. AWS Backend Infrastructure**

## **2.1 API Gateway**

Acts as the unified HTTPS gateway for all backend operations.

Routes include:

### **Authentication**

- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh` (refresh expired access token)

### **User Profile**

- `GET /users/me` (get current user profile)
- `PUT /users/me` (update name, username, email)
- `PUT /users/me/password` (change password)
- `DELETE /users/me` (delete account)

### **Sessions**

- `GET /sessions` (list user sessions with pagination)
- `POST /sessions` (create session via file upload or pasted code)
- `GET /sessions/{id}`
- `PUT /sessions/{id}` (manual save or auto-save on patch with version check)
- `PATCH /sessions/{id}/metadata` (rename session, update metadata)
- `DELETE /sessions/{id}`

### **Threads**

- `POST /sessions/{id}/threads`
- `GET /sessions/{id}/threads`
- `GET /threads/{thread_id}`
- `PUT /threads/{thread_id}` (anchor update)
- `DELETE /threads/{thread_id}`

### **Messages**

- `POST /threads/{thread_id}/messages` (User message → triggers AI)
- `GET /threads/{thread_id}/messages` (paginated message history)

### **AI**

- `POST /ai/analyze`  
  Handles all Bedrock calls internally.

API Gateway responsibilities:

- Input validation
- Authentication middleware (JWT/cookies)
- Routing to lambda functions
- CORS policy enforcement (production: specific origin only)
- Rate limiting enforcement

---

# **3. Lambda Backend Services**

All backend logic is executed via AWS Lambda functions.  
Each lambda is scoped to a specific domain:

---

## **3.1 Auth Lambda**

Handles:

- Password hashing (bcrypt)
- User creation with validation rules
- JWT access token signing (15-minute expiry)
- JWT refresh token signing (7-day expiry)
- JWT verification
- Cookie-based session tokens (httpOnly, secure, sameSite)
- Duplicate email/username validation via GSI queries
- Safe login response (never reveal if email exists)
- Token refresh logic
- Password validation: min 8 chars, 1 uppercase, 1 number, 1 special char

DynamoDB table: **Users**

**Rate Limits:**

- Signup: 5 requests/minute per IP
- Login: 5 requests/minute per IP
- Refresh: 20 requests/minute per user

---

## **3.2 Sessions Lambda**

Handles:

- Session creation with file size validation (max 5MB)
- Code persistence
- Code retrieval
- Manual save updates with version checking
- Auto-save on AI patch with version increment
- Optimistic locking for conflict detection
- Language metadata storage
- Session list pagination (50 sessions per page)
- Session metadata updates (rename)

DynamoDB table: **Sessions**

**Rate Limits:**

- Session saves: 60 requests/minute per user
- Session creation: 20 requests/minute per user

**User Limits:**

- Max 100 sessions per user
- Max 5MB per session code content

---

## **3.3 Threads Lambda**

Handles:

- Thread creation (block or full-file thread)
- Selected text storage
- Smart anchor tracking
- Anchor status updates
- Thread list retrieval with pagination (50 threads per session)

DynamoDB table: **Threads**

**User Limits:**

- Max 50 threads per session

---

## **3.4 Messages Lambda**

Handles:

- Add messages to thread (user + AI)
- Retrieve message history with pagination (100 messages per page)
- Streaming AI responses (optional future feature)

DynamoDB table: **Messages**

**User Limits:**

- Max 500 messages per thread (prevents runaway conversations)

---

## **3.5 AI Lambda (Bedrock Integration)**

This lambda:

- Receives input: file content, block selection, context window, language, user prompt, and thread history
- Applies token-aware fallback logic:
  - **Token estimation**: ~4 chars per token
  - **Max input tokens**: 100,000 tokens (~400KB of code)
  - **Fallback threshold**: 80,000 tokens
  - If under threshold → send full file
  - If over threshold → send selection + ±50 lines context
- Calls **AWS Bedrock Runtime → Claude 3.7 Sonnet** (or latest available)
- Uses structured prompt engineering with system prompt template
- Parses AI response into structured format:
  - Explanation (markdown formatted)
  - Suggested code (optional)
  - Patch region (start_line, end_line, replacement)
  - Context mode indicator (full/local)
  - Confidence level (optional)
- Returns structured output to frontend
- Handles malformed AI responses gracefully

**Bedrock Configuration:**

- Model: `anthropic.claude-3-7-sonnet` (or `claude-sonnet-4` when available)
- Region: Must match Lambda region (us-east-1 recommended)
- Temperature: 0.7 (balanced creativity and accuracy)
- Max output tokens: 4,000

**System Prompt Template:**

```
You are an expert code reviewer. Analyze this {language} code and provide:
1. Specific feedback on the selected region
2. Improvement suggestions with rationale
3. If applicable, provide corrected code

Context: {full_file or local_context}
Selected region (lines {start}-{end}):
{selected_text}

Previous conversation:
{thread_history}

User question: {user_prompt}

Respond in JSON format:
{
  "explanation": "Your analysis in markdown",
  "suggested_code": "Improved code if applicable",
  "patch": {
    "start_line": number,
    "end_line": number,
    "replacement": "code"
  }
}
```

It also includes:

### **AI Call Hygiene**

- Timeout limit: 30 seconds (Lambda max for AI calls)
- Cancellation handlers for in-flight requests
- Per-user rate limiting: 10 requests/minute
- Soft failures → friendly error messages
- Retry logic with exponential backoff (Bedrock throttling)
- Cost tracking: Log input/output token counts

**Rate Limits:**

- AI analyze endpoint: 10 requests/minute per user
- Daily cap: 500 AI requests per user (optional, commented out by default)

**Error Handling:**

- `AI_TIMEOUT`: Bedrock took >30s
- `AI_MALFORMED_RESPONSE`: Couldn't parse AI output
- `TOKEN_LIMIT_EXCEEDED`: File too large even for fallback
- `RATE_LIMIT_EXCEEDED`: User exceeded request limit
- `BEDROCK_UNAVAILABLE`: AWS service issue

---

# **4. DynamoDB Schema**

## **4.1 Users Table**

Partition key: `user_id`

Fields:

```
user_id (PK)
name
email
username
password_hash
created_at
```

**Global Secondary Indexes:**

- **EmailIndex**: email (PK) - for uniqueness checks and email lookups
- **UsernameIndex**: username (PK) - for login and uniqueness checks

**Table Settings:**

- Billing mode: On-demand (pay-per-request)
- Point-in-time recovery: Enabled

---

## **4.2 Sessions Table**

Partition key: `session_id`

Fields:

```
session_id (PK)
user_id
code_content
filename
language_detected
language_override
version_number (for optimistic locking)
created_at
updated_at
last_modified_by (user_id)
```

**Global Secondary Indexes:**

- **UserIdIndex**: user_id (PK) + created_at (SK) - for listing user's sessions sorted by creation date

**Table Settings:**

- Billing mode: On-demand
- Point-in-time recovery: Enabled
- Item size limit: 5MB (enforced at application layer)

---

## **4.3 Threads Table**

Partition key: `thread_id`

Fields:

```
thread_id (PK)
session_id
user_id
type ("block" | "file")
start_line
end_line
selected_text
anchor_status ("stable" | "approximate")
created_at
```

**Global Secondary Indexes:**

- **SessionIdIndex**: session_id (PK) + created_at (SK) - for listing session's threads sorted by creation date

**Table Settings:**

- Billing mode: On-demand
- Point-in-time recovery: Enabled

---

## **4.4 Messages Table**

Partition key: `thread_id`  
Sort key: `timestamp`

Fields:

```
thread_id (PK)
timestamp (SK)
message_id (unique identifier)
role ("user" | "ai")
content
context_mode ("full" | "local") [AI messages only]
token_count (for cost tracking) [AI messages only]
```

**Table Settings:**

- Billing mode: On-demand
- Point-in-time recovery: Enabled
- TTL: Optional (delete messages older than 1 year to save costs)

---

# **5. Authentication Architecture**

## **5.1 Token Strategy**

- **Access Token (JWT)**: 15-minute expiry, stored in httpOnly cookie
- **Refresh Token (JWT)**: 7-day expiry, stored in separate httpOnly cookie
- **Cookie attributes**: httpOnly, secure (HTTPS only), sameSite=strict

## **5.2 Signup Flow**

1. User submits form with name, email, username, password, confirm_password
2. Backend validates fields:
   - Email format valid
   - Password meets requirements: min 8 chars, 1 uppercase, 1 number, 1 special char
   - Password matches confirmation
   - Username alphanumeric, 3-20 chars
3. Check uniqueness via GSI queries:
   - Query EmailIndex for email
   - Query UsernameIndex for username
4. Password hashed with bcrypt (cost factor 10)
5. User stored in DynamoDB
6. Access JWT + Refresh JWT generated
7. Both JWTs stored in httpOnly cookies
8. Response: `{ user: { id, name, email, username }, success: true }`

## **5.3 Login Flow**

1. User provides username + password
2. Backend queries UsernameIndex to find user
3. Validate password against stored hash with bcrypt.compare()
4. On success:
   - Issue Access JWT (15-min expiry)
   - Issue Refresh JWT (7-day expiry)
   - Set both as httpOnly cookies
5. On failure:
   - Generic error: "Invalid credentials" (never reveal if username exists)
   - Rate limit: 5 attempts per minute per IP

## **5.4 Token Refresh Flow**

1. Access token expires after 15 minutes
2. Frontend detects 401 response
3. Automatically calls `POST /auth/refresh` with refresh token cookie
4. Backend validates refresh token:
   - Token signature valid
   - Token not expired
   - User still exists
5. Issue new access token (15-min expiry)
6. Keep existing refresh token (unless close to expiry)
7. Frontend retries original request with new access token

## **5.5 Logout Flow**

- Clears both access and refresh token cookies
- Sets `max-age=0` on both cookies
- Optional: Token blacklist (requires Redis/DynamoDB table for revocation list)

## **5.6 Protected Endpoints**

All endpoints except `/auth/*`, `/health`, and public pages require:

- Valid access token in cookie
- JWT verification (signature, expiry, issuer)
- User extraction from token claims
- Attach `user_id` to request context for use in Lambda

---

# **6. AI Flow**

## **6.1 User Sends Message**

Frontend includes:

- Full file content (or large file fallback)
- Block selection metadata (start_line, end_line, selected_text)
- Language context
- User message
- Thread history (up to last 10 messages for context)
- Current session version_number

## **6.2 Backend Processing**

1. Validate request:
   - User authenticated
   - Thread exists and belongs to user
   - Message content within length limits (max 5000 chars)
   - Rate limit not exceeded (10 requests/minute)
2. Store user message in Messages table
3. Estimate token count:
   - Formula: (file_chars + history_chars + prompt_chars) / 4
4. Apply truncation or context window logic:
   - If estimated_tokens < 80,000 → use full file
   - Else → use selection + 50 lines before + 50 lines after
5. Build structured prompt with system template
6. Call Bedrock model with 30-second timeout
7. Parse AI response into structured format:
   ```json
   {
     "explanation": "string (markdown)",
     "suggested_code": "string (optional)",
     "patch": {
       "start_line": number,
       "end_line": number,
       "replacement": "string"
     },
     "context_mode": "full" | "local",
     "confidence": "high" | "medium" | "low"
   }
   ```
8. Store AI message in DynamoDB with metadata (token_count, context_mode)
9. Return structured response to frontend

## **6.3 Frontend Rendering**

1. Display explanation in chat panel
2. If suggested_code exists:
   - Show "View Diff" button
   - On click → open Monaco Diff Editor modal
3. If patch exists:
   - Show "Apply Patch" button
   - On apply → update editor + auto-save with version check
4. Show context mode indicator if `context_mode === "local"`

## **6.4 Bedrock Model**

Recommended:

- **Primary**: `anthropic.claude-3-7-sonnet` (or `claude-sonnet-4`)
- **Fallback**: `anthropic.claude-3-5-sonnet` (if 3.7 unavailable)
- **Region**: us-east-1 (best Bedrock model availability)
- **Pricing**: ~$3 per million input tokens, ~$15 per million output tokens

## **6.5 Error Handling**

- **Timeout (>30s)**: Return `AI_TIMEOUT` error with friendly message
- **Malformed response**: Return `AI_MALFORMED_RESPONSE` with partial explanation if available
- **Bedrock throttling**: Retry with exponential backoff (3 attempts)
- **Token limit exceeded**: Return `TOKEN_LIMIT_EXCEEDED` with suggestion to select smaller region
- **Rate limit**: Return `RATE_LIMIT_EXCEEDED` with retry-after timestamp

---

# **7. Deployment Architecture**

## **7.1 Frontend Deployment**

Two options:

### **Option A: AWS Amplify (Recommended)**

- Automatic CI/CD from GitHub
- SSL certificates handled automatically
- Environment variables for API endpoints
- Global CDN out-of-the-box

### **Option B: S3 + CloudFront**

- Build → upload to S3
- CloudFront distribution for global caching
- Manual cache invalidation if needed

---

## **7.2 Backend Deployment**

Using an Infrastructure-as-Code workflow:

### **Option A: AWS SAM (Serverless Application Model)**

- Easy Lambda bundling
- Local testing
- Unified deployment

### **Option B: Terraform**

- Full IaC flexibility
- Reusable modules
- CI/CD automation possible

### **Option C: AWS Console (not recommended for production)**

---

# **8. CI/CD Pipeline**

Recommended GitHub Actions workflow:

### **Frontend**

- On push to `main`:
  - Install deps
  - Build
  - Deploy via Amplify

### **Backend**

- On push to `main`:
  - Package lambda functions
  - Deploy via SAM or Terraform

### **Tests (Optional Enhancement)**

- Unit tests for lambda logic
- Lint formatting

---

# **9. Security & Compliance**

## **9.1 Transport Security**

- HTTPS everywhere (TLS 1.2+)
- API Gateway custom domain with ACM certificate
- CloudFront for frontend with HTTPS enforcement

## **9.2 Authentication Security**

- Passwords hashed with bcrypt (cost factor 10)
- Password requirements enforced: min 8 chars, 1 uppercase, 1 number, 1 special char
- JWT tokens signed with RS256 (asymmetric keys)
- Short-lived access tokens (15 min)
- Refresh tokens with secure rotation
- httpOnly cookies prevent XSS token theft
- sameSite=strict prevents CSRF attacks

## **9.3 Rate Limiting**

Per-endpoint rate limits:

- Auth endpoints: 5 requests/minute per IP
- AI endpoint: 10 requests/minute per user
- Session saves: 60 requests/minute per user
- Message posts: 30 requests/minute per user

## **9.4 Authorization**

- All resources scoped to user_id
- Backend validates session/thread/message ownership before access
- No cross-user data leakage
- Least-privilege IAM roles for Lambda functions

## **9.5 Input Validation**

- File size limits: max 5MB per session
- Message length limits: max 5000 chars
- Filename sanitization: prevent path traversal
- Language validation: whitelist of supported languages
- No code execution on backend (analysis only via Bedrock)

## **9.6 Data Privacy**

- No plaintext passwords stored
- No logging of user code content (logs only metadata)
- Bedrock model input secured via IAM permissions
- DynamoDB encryption at rest (AWS managed keys)
- Point-in-time recovery for data protection

## **9.7 CORS Policy**

- **Development**: Allow `http://localhost:5173` and `http://localhost:3000`
- **Production**: Allow only deployed frontend origin (e.g., `https://app.codesensei.com`)
- Credentials: true (allow cookies)
- Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
- Headers: Content-Type, Authorization

## **9.8 Secrets Management**

- JWT signing keys stored in AWS Secrets Manager or SSM Parameter Store
- Bedrock API calls via IAM roles (no API keys in code)
- Environment variables for configuration (not secrets)
- Never log tokens, passwords, or API keys

---

# **10. Scalability Considerations**

- API Gateway + Lambda are auto-scaling
- DynamoDB auto-scaling provides fast reads/writes
- Bedrock supports high request throughput
- Stateless architecture ensures easy horizontal scaling

---

# **11. Failure Handling & Error Responses**

## **11.1 Error Response Schema**

All errors return consistent structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "User-friendly message",
    "field": "fieldName (optional, for validation errors)",
    "details": {} (optional, dev environment only)
  }
}
```

## **11.2 Error Codes**

### **Authentication Errors (4xx)**

- `INVALID_CREDENTIALS`: Username/password incorrect
- `USER_ALREADY_EXISTS`: Email or username taken
- `WEAK_PASSWORD`: Password doesn't meet requirements
- `TOKEN_EXPIRED`: Access token expired (trigger refresh)
- `REFRESH_TOKEN_INVALID`: Refresh token invalid/expired
- `UNAUTHORIZED`: No valid token provided

### **Authorization Errors (4xx)**

- `SESSION_NOT_FOUND`: Session doesn't exist
- `FORBIDDEN`: User doesn't own this resource
- `THREAD_NOT_FOUND`: Thread doesn't exist

### **Validation Errors (4xx)**

- `INVALID_LANGUAGE`: Unsupported language specified
- `FILE_TOO_LARGE`: Code content exceeds 5MB
- `MESSAGE_TOO_LONG`: Message exceeds 5000 chars
- `INVALID_INPUT`: Generic validation failure

### **Rate Limit Errors (429)**

- `RATE_LIMIT_EXCEEDED`: Too many requests
  - Include: `retry_after` timestamp

### **Conflict Errors (409)**

- `VERSION_CONFLICT`: Session modified by another client
  - Include: `current_version`, `current_code` for merge UI

### **AI Errors (5xx or 503)**

- `AI_TIMEOUT`: Bedrock call exceeded 30 seconds
- `AI_MALFORMED_RESPONSE`: Couldn't parse Bedrock output
- `TOKEN_LIMIT_EXCEEDED`: File too large even with fallback
- `BEDROCK_UNAVAILABLE`: AWS Bedrock service issue

### **Resource Limit Errors (4xx)**

- `SESSION_LIMIT_EXCEEDED`: User has 100 sessions already
- `THREAD_LIMIT_EXCEEDED`: Session has 50 threads already
- `MESSAGE_LIMIT_EXCEEDED`: Thread has 500 messages already

### **System Errors (5xx)**

- `INTERNAL_ERROR`: Generic server error (logged with trace ID)
- `DATABASE_ERROR`: DynamoDB operation failed
- `NETWORK_ERROR`: External service unreachable

## **11.3 Graceful Degradation**

### **AI Timeouts**

- Show user-friendly message: "AI is taking too long. Try with a smaller code selection."
- Offer retry button
- Suggest reducing file size or selecting specific block

### **Large Files**

- Automatically fall back to selection + context
- Show indicator: "Using local context due to large file size (X lines)"
- Suggest breaking file into smaller modules

### **Version Conflicts**

- Detect via version_number mismatch
- Show merge UI with three options:
  1. Keep your changes (overwrite server)
  2. Use server version (discard your changes)
  3. Manual merge (show diff, let user edit)
- Save user's changes to localStorage as backup before merge

### **Network Errors**

- Show: "Connection lost. Check your internet and try again."
- Queue saves in localStorage
- Auto-retry when connection restored
- Indicate offline status in UI

### **DynamoDB Throttling**

- Implement exponential backoff with jitter
- Max 3 retry attempts
- If still failing: show "Service temporarily busy"

## **11.4 Frontend Error Handling**

### **Global Error Toast**

- Position: Top-right corner
- Types: error (red), warning (orange), info (blue), success (green)
- Auto-dismiss after 5 seconds (except errors, require manual dismiss)
- Show relevant action buttons (e.g., "Retry", "Refresh", "Merge")

### **Form Validation**

- Inline validation on blur
- Real-time password strength indicator
- Clear field-specific error messages below inputs
- Disable submit button until form valid

### **Loading States**

- Button loading: Show spinner + "Saving..." / "Analyzing..." text
- Content loading: Skeleton loaders (not spinners) for lists
- AI loading: Animated thinking indicator with "AI is thinking..."
- Progress indication for file uploads (0-100%)

### **Empty States**

- Dashboard (no sessions): Large icon + "No sessions yet. Create your first session."
- Thread list (no threads): "No conversations yet. Select code and ask AI."
- Message thread (no messages): Show thread metadata with prompt to start conversation

## **11.5 Logging & Monitoring**

### **CloudWatch Logs**

- All Lambda functions log to dedicated log groups
- Log levels: ERROR, WARN, INFO, DEBUG (DEBUG only in dev)
- Never log: passwords, tokens, full code content
- Always log: user_id, endpoint, error codes, trace IDs

### **CloudWatch Metrics**

- API request counts by endpoint and status code
- Lambda duration (p50, p95, p99)
- Error rates by error code
- Bedrock token consumption (input/output)
- DynamoDB read/write capacity usage

### **CloudWatch Alarms**

- Error rate >5% for any endpoint (5-minute window)
- AI Lambda timeout rate >10%
- DynamoDB throttling events >10/minute
- Average Bedrock cost >$50/hour

### **SNS Notifications**

- Send alerts to email/Slack on alarm trigger
- Include: Alarm name, metric, threshold, current value, link to dashboard

## **11.6 Recovery Procedures**

### **Data Recovery**

- DynamoDB point-in-time recovery enabled (restore to any second in last 35 days)
- Manual backup before major updates
- Session content recoverable from user's browser localStorage (24-hour cache)

### **Rollback Strategy**

- Lambda versioning with aliases (prod, staging)
- Blue-green deployment for zero-downtime updates
- Instant rollback via alias switch if errors spike

### **Incident Response**

1. CloudWatch alarm triggers
2. Check metrics dashboard for root cause
3. Check CloudWatch Logs for error details
4. If AI issue: Verify Bedrock status, check quotas
5. If DynamoDB issue: Check capacity, verify GSI queries
6. If widespread: Roll back to previous Lambda version
7. Post-mortem: Document cause, prevention measures

---

# **12. Future Extensions (Optional)**

Not required now, but architecture supports:

- Multi-file sessions with file tree navigation
- Real-time collaboration with WebSocket support
- Message streaming for AI responses (SSE or WebSocket)
- AI model switching (allow user to choose Claude vs GPT-4)
- Versioning system for code content (git-like history)
- User analytics dashboard (sessions created, AI usage, patches applied)
- Role-based access (teams, shared sessions)
- Email verification flow for signups
- Password reset / forgot password flow
- Session search and filtering (by language, date, name)
- Code templates library (starter code for common languages)
- Export session as file (.json, .zip)
- Share session (readonly public links)
- Syntax theme picker (multiple Monaco themes)
- Mobile-optimized editor with touch gestures
- Browser extension for inline code review in GitHub/GitLab
- CI/CD integration (run CodeSensei in PR workflows)
- Custom AI instructions per user (personalized review style)
- Code metrics dashboard (complexity, duplication, security issues)
- Integration with IDE plugins (VS Code extension)

---

# **13. Cost Optimization Strategies**

## **13.1 User Limits**

- Max 100 sessions per user → prevents storage bloat
- Max 50 threads per session → prevents data model sprawl
- Max 500 messages per thread → prevents runaway conversations
- Max 5MB per session → keeps DynamoDB items manageable

## **13.2 AI Cost Management**

- Token limits (100K input, 4K output) → prevents expensive calls
- Rate limiting (10 requests/min) → prevents abuse
- Context fallback → reduces token usage on large files
- Caching common questions (future) → reduce redundant Bedrock calls
- Monitor cost per user → identify and address power users

## **13.3 DynamoDB Optimization**

- On-demand billing → pay only for actual usage (ideal for production scalability)
- GSIs for efficient queries → avoid expensive table scans
- TTL on old messages (optional) → auto-delete after 1 year
- Compress large code_content (gzip) → reduce storage costs
- Batch operations where possible → reduce API calls

## **13.4 Lambda Optimization**

- Right-size memory allocation (128MB-1GB based on function)
- Reuse Bedrock client connections → reduce cold start impact
- Package lambdas efficiently → minimize deployment size
- Use Lambda layers for shared dependencies → reduce duplication

## **13.5 Monitoring Costs**

- Daily cost alerts via CloudWatch + SNS
- Monthly budget in AWS Budgets (e.g., $100/month alert threshold)
- Per-user cost tracking (log Bedrock token usage with user_id)
- Automated reports: Top 10 users by cost, total Bedrock spend, DynamoDB spend

---

# **14. Conclusion**

This Architecture Document defines the complete backend, infrastructure, and deployment model for **CodeSensei**, reflecting the PRD and ensuring a scalable, secure, and cleanly engineered implementation.

**Key architectural decisions:**

- Serverless AWS backend (API Gateway + Lambda + DynamoDB) for automatic scaling
- JWT-based authentication with refresh tokens for security and UX balance
- Optimistic locking with version numbers to prevent data loss
- DynamoDB GSIs for efficient queries without table scans
- Structured AI response format for consistent UX
- Token-aware context fallback for large files
- Comprehensive error handling with user-friendly messages
- Rate limiting and user limits for cost control
- CloudWatch monitoring and alerting for production reliability

This architecture is production-ready and designed to support CodeSensei at scale.

**Last Updated:** November 22, 2025  
**Version:** 2.0 (Comprehensive specification with all production requirements)
