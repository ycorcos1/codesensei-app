# CodeSensei – Full Implementation Task List

Owner: Yahav Corcos  
Docs: PRD, Architecture, Design Spec (in `/docs`)

This task list is designed for use with Cursor. Each task focuses on **one main feature or concern**, has clear **prerequisites**, **subtasks**, and a **completion checklist**.  
Early tasks prioritize **backend + deployment** so you can test against the deployed environment as soon as possible.

---

## Task 1: Initialize Repository & Docs Structure

**Goal**  
Prepare the CodeSensei project folder and documentation structure for development.

**Prerequisites**

- GitHub account
- Local dev environment (Node, npm, AWS CLI installed)

**Subtasks**

1. Create a new GitHub repo: `codesensei-app` (or similar).
2. Clone repo locally and create base folders:
   - `/backend`
   - `/frontend`
   - `/docs`
3. Commit & push initial structure to GitHub.

**Completion Checklist**

- [ ] Repo exists on GitHub and locally.
- [ ] `/backend`, `/frontend`, `/docs` folders present.
- [ ] PRD, Architecture, and Design Spec are in `/docs`.
- [ ] Initial commit pushed to `main` branch.

---

## Task 2: Configure AWS Project & IAM for CodeSensei

**Goal**  
Set up AWS IAM, regions, and basic config for CodeSensei backend and Bedrock usage.

**Prerequisites**

- AWS account and admin IAM user (you already have this)
- AWS CLI configured locally

**Subtasks**

1. Choose a primary AWS region that supports Bedrock (e.g. `us-east-1`).
2. Verify AWS CLI is using the correct credentials and region.
3. Create an IAM role or policy set for CodeSensei backend with least-privilege access to:
   - API Gateway
   - Lambda
   - DynamoDB
   - Bedrock Runtime
4. Ensure Bedrock access is enabled for the chosen region and the selected model (Claude 3.7/4.x as per architecture).

**Completion Checklist**

- [ ] AWS CLI works with chosen region.
- [ ] IAM role/policies exist for CodeSensei backend.
- [ ] Bedrock is enabled and callable from your account.

---

## Task 3: Scaffold Backend with API Gateway + Lambda (Health Check)

**Goal**  
Create the initial backend skeleton with a simple health-check endpoint deployed via AWS SAM or your chosen framework.

**Prerequisites**

- Tasks 1–2 complete

**Subtasks**

1. Inside `/backend`, initialize a SAM or serverless project (Node.js runtime recommended).
2. Define an `api` with a single route: `GET /health`.
3. Implement health Lambda that returns: `{ status: "ok", service: "CodeSensei" }`.
4. Add basic CORS config to allow calls from frontend domain (temporary `*` allowed for dev).
5. Deploy to AWS (SAM/Serverless deploy).

**Completion Checklist**

- [ ] SAM/serverless config exists under `/backend`.
- [ ] `GET /health` endpoint works in Postman or curl.
- [ ] API base URL documented.
- [ ] Code committed and pushed.

---

## Task 4: Set Up Frontend React App + Hosting (Amplify or S3/CloudFront)

**Goal**  
Create the React app for CodeSensei and host it live so you can test against the deployed backend.

**Prerequisites**

- Tasks 1–3 complete

**Subtasks**

1. In `/frontend`, create a new React app (Vite or CRA; Vite recommended).
2. Implement a minimal placeholder page that:
   - Displays CodeSensei logo and name
   - Calls the backend `/health` endpoint and shows the result.
3. Initialize AWS Amplify or S3+CloudFront hosting:
   - For Amplify: connect GitHub repo, configure build settings.
   - For S3+CloudFront: create bucket, upload build artifacts, configure distribution.
4. Add `.env` to frontend with `VITE_API_BASE_URL` (or similar) pointing to the API Gateway URL.
5. Commit & push; verify CI/CD deploys automatically.

**Completion Checklist**

- [ ] React app builds locally.
- [ ] Live URL shows CodeSensei placeholder.
- [ ] `/health` call works from the deployed frontend.
- [ ] CI/CD pipeline for frontend is in place.

---

## Task 5: Create DynamoDB Tables (Users, Sessions, Threads, Messages)

**Goal**  
Provision DynamoDB tables used by the backend.

**Prerequisites**

- Tasks 2–3 complete

**Subtasks**

1. Define tables according to architecture:
   - `Users` (`user_id` PK)
     - GSI: `EmailIndex` (email as PK)
     - GSI: `UsernameIndex` (username as PK)
   - `Sessions` (`session_id` PK)
     - GSI: `UserIdIndex` (user_id as PK, created_at as SK)
     - Add field: `version_number` (for optimistic locking)
   - `Threads` (`thread_id` PK)
     - GSI: `SessionIdIndex` (session_id as PK, created_at as SK)
   - `Messages` (`thread_id` PK, `timestamp` SK)
     - Add fields: `context_mode`, `token_count` (for AI messages)
2. Create the tables using IaC (SAM templates, CloudFormation, or Terraform) rather than manual console clicks.
3. Configure on-demand billing mode.
4. Enable point-in-time recovery on all tables.
5. Add table names as environment variables for related Lambdas.

**Completion Checklist**

- [ ] All four DynamoDB tables exist with correct schemas.
- [ ] All GSIs are created and active.
- [ ] Tables are created via infrastructure code.
- [ ] Point-in-time recovery enabled.
- [ ] Lambdas can access the tables (smoke test in code or temporary script).

---

## Task 6: Implement Auth Backend (Signup, Login, Logout)

**Goal**  
Create the backend authentication flow using DynamoDB and JWT/httpOnly cookies.

**Prerequisites**

- Tasks 3 & 5 complete

**Subtasks**

1. Implement `POST /auth/signup`:
   - Validate input (name, email, username, password).
   - Password validation: min 8 chars, 1 uppercase, 1 number, 1 special char.
   - Hash password (bcrypt, cost factor 10).
   - Check uniqueness: Query EmailIndex and UsernameIndex GSIs.
   - Insert into `Users` table; enforce unique email/username.
   - Generate access JWT (15-min expiry) and refresh JWT (7-day expiry).
   - Return both JWTs in httpOnly, secure, sameSite=strict cookies.
2. Implement `POST /auth/login`:
   - Query UsernameIndex GSI to find user.
   - Compare hashed password with bcrypt.
   - Generate access + refresh JWTs on success.
   - Return cookies on success.
   - Return generic "Invalid credentials" on failure (never reveal if user exists).
3. Implement `POST /auth/logout`:
   - Clear both access and refresh token cookies (set max-age=0).
4. Implement `POST /auth/refresh`:
   - Validate refresh token from cookie.
   - Issue new access token (15-min expiry).
   - Return new access token in cookie.
5. Implement a shared auth middleware for JWT validation:
   - Verify access token signature and expiry.
   - Extract user_id from token claims.
   - Attach to request context.
6. Add rate limiting: 5 requests/minute per IP for auth endpoints.
7. Add unit tests or manual scripts for the endpoints.
8. Deploy backend and test from Postman using the live API URL.

**Completion Checklist**

- [ ] Signup, login, logout, refresh endpoints work in Postman.
- [ ] Users are stored in DynamoDB with bcrypt hashes.
- [ ] Email and username uniqueness enforced via GSI queries.
- [ ] Password validation requirements enforced.
- [ ] Access + refresh JWTs are issued correctly with proper expiry.
- [ ] httpOnly cookies set correctly.
- [ ] Rate limiting prevents brute force attacks.
- [ ] Code committed and deployed.

---

## Task 6A: Implement User Profile Endpoints

**Goal**  
Add backend endpoints for user profile management (required for Settings page).

**Prerequisites**

- Task 6 complete

**Subtasks**

1. Implement `GET /users/me`:
   - Return current user profile (user_id, name, email, username, created_at).
   - Requires authentication (extract user_id from JWT).
2. Implement `PUT /users/me`:
   - Update name, username, and/or email.
   - Validate uniqueness for username and email via GSI queries.
   - Return updated user profile.
3. Implement `PUT /users/me/password`:
   - Require current_password and new_password in body.
   - Validate current password with bcrypt.
   - Validate new password meets requirements.
   - Hash new password and update Users table.
4. Implement `DELETE /users/me`:
   - Require password confirmation in body.
   - Soft delete or cascade delete (mark user as deleted, optionally delete all sessions/threads/messages).
   - Clear auth cookies.
5. Deploy and test with Postman.

**Completion Checklist**

- [ ] All profile endpoints work correctly.
- [ ] Username and email uniqueness enforced.
- [ ] Password change requires current password verification.
- [ ] Account deletion requires password confirmation.
- [ ] API deployed and tested.

---

## Task 7: Implement Session Backend (CRUD + Save Semantics)

**Goal**  
Build backend support for CodeSensei sessions (code files) with version conflict detection.

**Prerequisites**

- Tasks 5–6A complete

**Subtasks**

1. Implement `GET /sessions` → returns all sessions for the authenticated user:
   - Query UserIdIndex GSI with user_id.
   - Support pagination with limit=50 and cursor-based continuation.
   - Sort by created_at descending (most recent first).
2. Implement `POST /sessions` → create a new session with:
   - `filename`
   - initial `code_content` (validate max 5MB)
   - detected language (optional)
   - Initialize version_number=1.
   - Enforce limit: max 100 sessions per user.
3. Implement `GET /sessions/{id}` → session detail (code + metadata).
   - Verify session belongs to authenticated user.
4. Implement `PUT /sessions/{id}` → save updated `code_content`, `language_override`, etc.:
   - Require `expected_version_number` in request body.
   - Compare with current version_number in database.
   - If mismatch: Return 409 Conflict with current_code and current_version.
   - If match: Save changes, increment version_number, update updated_at.
   - Support both manual save and auto-save (same endpoint).
5. Implement `PATCH /sessions/{id}/metadata` → rename session:
   - Update filename only (not code content).
   - No version check needed.
6. Implement `DELETE /sessions/{id}` → soft or hard delete.
   - Verify ownership.
   - Optionally cascade delete threads and messages.
7. Add rate limiting: 60 saves per minute per user, 20 creates per minute.
8. Deploy backend and smoke test via Postman.

**Completion Checklist**

- [ ] All session endpoints available and secured via auth middleware.
- [ ] Sessions appear in the `Sessions` table.
- [ ] Version conflict detection works (409 response on mismatch).
- [ ] Pagination works with cursor-based continuation.
- [ ] User session limit (100) enforced.
- [ ] File size limit (5MB) enforced.
- [ ] Save updates code correctly with version increment.
- [ ] Deployed API returns expected responses.

---

## Task 8: Build Auth Frontend (Login & Signup Pages)

**Goal**  
Wire the frontend signup and login pages to the live auth backend.

**Prerequisites**

- Tasks 4 & 6 complete

**Subtasks**

1. Implement `/signup` route with form fields per design spec.
2. Implement `/login` route with username/password form.
3. Hook forms to backend endpoints (`/auth/signup`, `/auth/login`).
4. Store auth state client-side (in memory or context).
5. Use httpOnly cookies for JWT; rely on backend for verification.
6. On successful signup/login, redirect to Dashboard.
7. Add basic inline error messages for validation/auth failures.

**Completion Checklist**

- [ ] Can sign up from the deployed frontend and land on Dashboard.
- [ ] Can log in and log out from the deployed frontend.
- [ ] Error messages show for invalid credentials.

---

## Task 9: Implement Dashboard UI (Session Table + New Session Modal)

**Goal**  
Create the Dashboard page with table view and New Session modal, wired to backend.

**Prerequisites**

- Tasks 7–8 complete

**Subtasks**

1. Build `/dashboard` route with top header and table layout from design spec.
2. Fetch session list from `GET /sessions` on load.
3. Render Session Name, Last Updated, Language, and Actions.
4. Implement “Open” button → navigates to Editor with selected `session_id`.
5. Implement “Delete” button → calls backend and removes from UI.
6. Implement “New Session” small button:
   - Opens modal with: upload file OR empty session name.
   - Calls `POST /sessions` with initial data.
   - Closes modal and refreshes table.
7. Ensure dashboard is protected (redirect to login if unauthenticated).

**Completion Checklist**

- [ ] Session list shows on Dashboard for logged-in user.
- [ ] New Session modal workflow works end-to-end.
- [ ] Sessions open Editor page with correct session id in URL.

---

## Task 10: Implement Editor Workspace Skeleton (Monaco + Basic Layout)

**Goal**  
Set up the Editor page structure and integrate Monaco without threads or AI yet.

**Prerequisites**

- Tasks 4, 7, 9 complete

**Subtasks**

1. Create `/editor/:sessionId` route.
2. Fetch session data from `GET /sessions/{id}`.
3. Render Monaco Editor with:
   - Code content from session
   - Initial language (from detected/override)
4. Implement Save button and Cmd+S handler:
   - Calls `PUT /sessions/{id}` with updated code.
   - Shows simple “Saved” toast or message.
5. Add top nav bar with CodeSensei logo + links (Dashboard, Settings, Logout).
6. Add placeholder right panel area for future Thread/AI panel.

**Completion Checklist**

- [ ] Editor page loads the correct session code.
- [ ] Manual save works against backend.
- [ ] Nav bar + basic layout matches design spec.

---

## Task 11: Implement Language Detection + Picker

**Goal**  
Add language detection display and manual override on the Editor page.

**Prerequisites**

- Task 10 complete

**Subtasks**

1. Show language pill/dropdown in Editor top toolbar.
2. Set default value from `language_detected` (or infer from filename).
3. Allow user to select override language from dropdown list.
4. Update Monaco language mode when override changes.
5. Persist `language_override` via `PUT /sessions/{id}`.

**Completion Checklist**

- [ ] Language dropdown appears and works.
- [ ] Monaco highlighting changes when language is changed.
- [ ] Language override persists on reload.

---

## Task 12: Implement Threads Backend (Create + List + Anchor Storage)

**Goal**  
Create backend support for threads tied to sessions and selections.

**Prerequisites**

- Tasks 5 & 7 complete

**Subtasks**

1. Implement `POST /sessions/{id}/threads` to create a thread with:
   - `type`, `start_line`, `end_line`, `selected_text`, `anchor_status="stable"`.
2. Implement `GET /sessions/{id}/threads` to list all threads for session.
3. Implement `GET /threads/{thread_id}` for single thread detail.
4. Implement `PUT /threads/{thread_id}` to update anchor_status or line range.
5. Implement `DELETE /threads/{thread_id}` to remove a thread.
6. Deploy and test with Postman.

**Completion Checklist**

- [ ] Threads table stores new thread records.
- [ ] Threads can be listed and updated.
- [ ] API deployed and responding correctly.

---

## Task 13: Implement Thread UI (Sidebar + Gutter Markers + Creation)

**Goal**  
Add UI for showing existing threads and creating new threads in the editor.

**Prerequisites**

- Tasks 10–12 complete

**Subtasks**

1. Implement thread sidebar on the right of the editor workspace (fixed width).
2. Fetch threads from `GET /sessions/{id}/threads` on load and display them:
   - Show type (block/file), line range, short title.
3. Use Monaco API to draw gutter markers for lines participating in any thread.
4. When user selects a block of code, show “Ask AI” context action or button to start a new thread.
5. On new thread creation, call backend `POST /sessions/{id}/threads`, then open Thread/AI panel for that thread.
6. Clicking a thread in sidebar should:
   - Scroll Monaco to its range.
   - Open Thread/AI panel for that thread.

**Completion Checklist**

- [ ] Threads show in sidebar + gutter for a session.
- [ ] New threads created from a selection appear correctly.
- [ ] Clicking a thread scrolls editor and opens the panel.

---

## Task 14: Implement Messages Backend (User + AI Messages)

**Goal**  
Support message storage and retrieval for each thread.

**Prerequisites**

- Tasks 5 & 12 complete

**Subtasks**

1. Implement `POST /threads/{thread_id}/messages` to append a user or AI message.
2. Implement `GET /threads/{thread_id}/messages` to get full history ordered by timestamp.
3. Store messages in the `Messages` table with partition key + sort key.
4. Add simple validation (max length, role type).
5. Deploy and test using Postman.

**Completion Checklist**

- [ ] Messages can be created and retrieved for a thread.
- [ ] Ordered history is correct.
- [ ] API deployed successfully.

---

## Task 15: Implement Thread/AI Panel UI (Chat Without AI Yet)

**Goal**  
Create the slide-in right panel UI for thread conversations, initially using only stored messages.

**Prerequisites**

- Tasks 10, 13, 14 complete

**Subtasks**

1. Build slide-in panel on the right (fixed 450px width).
2. When a thread is selected, fetch its messages and render them in a scrollable list.
3. Add a message input box and **Send** button (or Cmd+Enter shortcut).
4. On send:
   - Append a user message via `POST /threads/{thread_id}/messages`.
   - Immediately display it in UI (optimistic).
5. No AI call yet; optionally show “AI not connected” placeholder response.

**Completion Checklist**

- [ ] Thread panel can open/close.
- [ ] User messages are stored and rendered.
- [ ] UX matches the design spec’s layout.

---

## Task 16: Implement AI Lambda (Stub + Wiring from Frontend)

**Goal**  
Wire the frontend to call the AI backend pipeline, initially with stub responses.

**Prerequisites**

- Tasks 3, 14, 15 complete

**Subtasks**

1. Implement `POST /ai/analyze` Lambda that:
   - Validates payload (code, selection, language, prompt, history).
   - Returns a stubbed “AI” response (no Bedrock call yet).
2. From the Thread/AI panel, on user send:
   - Call `/ai/analyze` after storing the user message.
   - Display stubbed AI response as another message.
   - Also store AI message via `POST /threads/{thread_id}/messages`.
3. Deploy backend and verify from the frontend that AI stubs are rendered.

**Completion Checklist**

- [ ] Thread panel shows round-trip stub responses.
- [ ] `/ai/analyze` callable and stable.
- [ ] Messages stored for both user and AI roles.

---

## Task 17: Integrate AWS Bedrock (Real AI Responses)

**Goal**  
Replace stub logic with real Bedrock calls and implement token-aware file/selection context.

**Prerequisites**

- Tasks 2, 16 complete

**Subtasks**

1. Configure Bedrock model ID and region as Lambda environment variables.
2. In AI Lambda:
   - Estimate token size for full file + history.
   - If under threshold → send full file.
   - If too large → send selection + ±N context lines.
3. Call Bedrock Runtime and parse response into:
   - Explanation text
   - Optional suggested code block
4. Store AI response as message; return to frontend.
5. Test from the deployed frontend with sample code and prompts.

**Completion Checklist**

- [ ] Bedrock call works and returns meaningful responses.
- [ ] Large files fall back to selection + context.
- [ ] No credentials or secrets exposed client-side.

---

## Task 18: Implement Diff View + Apply Patch (Auto-Save)

**Goal**  
Enable Monaco diff view and Apply Patch behavior that auto-saves changes.

**Prerequisites**

- Tasks 10, 17 complete

**Subtasks**

1. When AI suggests replacement code for a block, allow user to open a **Diff** modal.
2. Use Monaco Diff Editor to show original vs proposed block.
3. Add **Apply Patch** button that:
   - Replaces the selected range in the main editor using Monaco’s API.
   - Immediately calls `PUT /sessions/{id}` to auto-save.
4. Add **Close** button to dismiss modal without applying.
5. Ensure undo/redo still function after patch.

**Completion Checklist**

- [ ] Diff view appears with correct code.
- [ ] Apply Patch updates code and auto-saves to backend.
- [ ] Closing the modal leaves code unchanged.

---

## Task 19: Implement Smart Anchor Tracking Logic

**Goal**  
Keep thread anchors aligned with their code blocks after edits and patches.

**Prerequisites**

- Tasks 12, 18 complete

**Subtasks**

1. When creating a thread, store `selected_text` along with line range.
2. After each save (manual or auto), run anchor update logic on backend or frontend:
   - Search for `selected_text` in current `code_content`.
   - If found → update `start_line`, `end_line`, set `anchor_status="stable"`.
   - If not → keep original range, set `anchor_status="approximate"`.
3. Expose anchor_status via thread APIs.
4. In UI, show small label in Thread panel: “Anchor stable” or “Position approximate (code changed)”.

**Completion Checklist**

- [ ] Threads follow moved/changed code when content still matches.
- [ ] Approximate status shown when anchor can’t be found.
- [ ] Behavior works across manual edits and AI patches.

---

## Task 20: Implement Large File Handling Indicators

**Goal**  
Give users feedback when AI is using local context due to file size.

**Prerequisites**

- Task 17 complete

**Subtasks**

1. Have AI Lambda mark responses where fallback was used (e.g., `context_mode: "full" | "local"`).
2. In Thread/AI panel, display a small note when `context_mode="local"`:
   - “Using local context around your selection due to large file size.”
3. Optionally add a small badge in Editor header if file is considered “large” by your heuristic (e.g., over N lines).

**Completion Checklist**

- [ ] Users can tell when AI is working with local vs full context.
- [ ] No crashes or timeouts on large files during AI calls.

---

## Task 21: Implement Error Handling & User-Friendly Messages

**Goal**  
Provide clean, understandable UI feedback for backend/AI issues.

**Prerequisites**

- Tasks 8, 17 complete

**Subtasks**

1. Implement a simple global error/toast component in the frontend.
2. Handle:
   - Network errors
   - 4xx / 5xx responses from backend
   - AI timeouts or failures (show “AI request failed, please try again.”)
3. Ensure forms show validation messages (e.g., missing fields, invalid credentials).
4. Ensure error messages never expose stack traces or AWS internals.

**Completion Checklist**

- [ ] All major flows (auth, sessions, AI calls) surface clear messages on failure.
- [ ] App never fails silently; user always knows what happened.

---

## Task 22: Implement Settings Page

**Goal**  
Add Settings page for profile and preferences per design spec.

**Prerequisites**

- Tasks 8, 10 complete

**Subtasks**

1. Create `/settings` route and layout (sidebar + content panel).
2. Profile section: display and allow editing of name/username (if supported by backend).
3. Change Password form calling backend endpoint (if you add one) or stub it if deferred.
4. Preference toggles placeholder (e.g., future theme controls).
5. Danger Zone: “Delete Account” button (can be stubbed or fully implemented).

**Completion Checklist**

- [ ] Settings page reachable from nav bar.
- [ ] Profile info loads and (if implemented) saves.
- [ ] Layout visually matches design spec.

---

## Task 23: Implement About Page

**Goal**  
Create the About page focused on CodeSensei as a project.

**Prerequisites**

- Task 4 complete

**Subtasks**

1. Create `/about` route.
2. Use hero-style layout with logo and “About CodeSensei” title.
3. Add copy describing: what CodeSensei does, why it exists, key features.
4. Add links back to Landing Page and to Login/Signup.

**Completion Checklist**

- [ ] About page matches design spec.
- [ ] Links navigate correctly from Landing and Navbar.

---

## Task 24: Implement Landing Page Hero + Navigation

**Goal**  
Finish the public marketing-style landing page.

**Prerequisites**

- Tasks 4, 23 complete

**Subtasks**

1. Implement root `/` route as the Landing page.
2. Build hero section with logo mark, headline, subtext, and primary CTA (Get Started → Signup).
3. Implement features section (three columns).
4. Final CTA section at bottom.
5. Header nav with links to About, Login, and Get Started.

**Completion Checklist**

- [ ] Landing page looks like a clean SaaS marketing page.
- [ ] Both About and Auth flows are reachable.

---

## Task 25: Responsive & Visual Polish Pass

**Goal**  
Make CodeSensei feel like a cohesive, professional SaaS app on desktop and mobile.

**Prerequisites**

- Tasks 10–24 largely complete

**Subtasks**

1. Adjust layouts for tablet and mobile breakpoints (Dashboard, Editor, Landing).
2. Ensure Thread/AI panel behaves as a full-screen drawer on small screens.
3. Confirm typography and spacing across all pages.
4. Verify color usage: dark gray base, blood orange accents, consistent buttons.

**Completion Checklist**

- [ ] App usable on laptop, tablet, and phone.
- [ ] Styling consistent with Design Spec.
- [ ] No obvious visual glitches or layout issues.

---

## Task 26: Final QA & Cleanup

**Goal**  
Ensure CodeSensei is stable, coherent, and ready to demo.

**Prerequisites**

- All core features implemented

**Subtasks**

1. Walk through full flows on deployed environment:
   - Signup → Dashboard → New Session → Editor → Threads → AI → Patch → Save.
2. Test error/edge cases:
   - Invalid login
   - Large file
   - AI failure (simulate network issue)
3. Remove unused code, console.logs, and temporary stubs.
4. Verify all documentation is up to date with implementation.

**Completion Checklist**

- [ ] End-to-end flow works smoothly on deployed site.
- [ ] Edge cases behave gracefully.
- [ ] Repo is clean, documented, and ready for review.
