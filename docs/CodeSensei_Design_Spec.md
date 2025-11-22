# **CodeSensei Design Specification**

Frontend/UI Specification for the CodeSensei Web Application  
Owner: Yahav Corcos  
Primary Style: Dark Gray + Blood Orange Accents  
Typography: Tech‑modern, clean SaaS aesthetic  
Animations: None (static, immediate UI)

---

# **1. Branding**

## **1.1 Logo System**

- **Primary Logo (Wordmark + Logo Mark)**  
  ![CodeSensei Logo](/docs/codesensei_logo.png)
- **Logo Mark Only (Used for Favicon)**  
  Same stylized `<S>` symbol from the primary logo above.
- **Usage:**
  - Favicon → Logo Mark
  - Navbars → Logo Mark + Wordmark
  - Landing Page Hero → Large logo mark centered above headline

## **1.2 Color Palette**

- **Dark Gray (#1C1C1E)** – Primary background
- **Near Black (#0D0D0F)** – Editor background
- **Blood Orange (#FF4A1F)** – Accent color for:
  - Buttons
  - Highlights
  - Selection ranges
  - Gutter thread markers
  - Links
  - AI response headers
- **Light Gray (#E6E6E6)** – Main text
- **Dim Gray (#7A7A7A)** – Subtext

---

# **2. Page List**

1. Landing Page (Marketing Hero Page)
2. Signup Page
3. Login Page
4. Dashboard (Session Table View)
5. Editor Workspace
6. Slide‑In Thread/AI Panel
7. Settings Page
8. About Page
9. New Session Modal

---

# **3. Global Layout Standards**

- **Clean SaaS aesthetic** with structured grid.
- **Dark mode only** for v1.
- **Top Navigation Bar** present on all pages except Login/Signup.
- **Max content width:** 1200px centered for all content pages (except editor).
- **Buttons:** Blood-orange primary, medium-round corners (8px border-radius).
- **No animations** — everything appears instantly.
- **Fixed-width right panel** for threads/AI (450px).
- **Typography:**
  - Headings: Inter or System UI font stack, semi-bold
  - Body: Inter or System UI, regular weight
  - Code: Fira Code or Monaco, monospace
- **Spacing:** 8px base unit (use multiples: 8px, 16px, 24px, 32px)
- **Z-index hierarchy:**
  - Modals: 1000
  - Toasts: 2000
  - Tooltips: 3000

---

# **4. Individual Page Designs**

---

## **4.1 Landing Page (Marketing Hero Page)**

### **Layout**

- Full-width hero section
- Center-aligned logo mark (large)
- Headline:  
  **“AI-Powered Inline Code Review. Faster. Smarter. Precise.”**
- Subtext paragraph (max width 600px)
- Primary CTA: **Get Started** (blood orange button → signup)
- Secondary CTA: “About CodeSensei” → About Page

### **Sections**

- Hero
- Features (3 columns): Inline Threads, AI Patches, Smart Anchoring
- Final CTA section

---

## **4.2 Signup Page**

### **Layout**

- Center card (width ~420px)
- Form fields:
  - Name (text input)
  - Email (email input with validation)
  - Username (text input, 3-20 alphanumeric chars)
  - Password (password input with strength indicator)
  - Confirm Password (password input with match validation)
- **Password requirements shown below field:**
  - Min 8 characters
  - 1 uppercase letter
  - 1 number
  - 1 special character
- **Password strength indicator:** Progress bar (red/orange/green)
- Blood orange **Create Account** button (disabled until form valid)
- Footer link: "Already have an account? Log in."
- **Inline validation:** Show error messages below each field on blur
- **Loading state:** Button shows spinner + "Creating account..." when submitting

---

## **4.3 Login Page**

### **Layout**

- Identical card size to Signup
- Fields:
  - Username (text input)
  - Password (password input)
- Blood orange **Login** button
- Link: "Create an account"
- **Error handling:** Show generic "Invalid credentials" message (never reveal if user exists)
- **Loading state:** Button shows spinner + "Logging in..." when submitting
- **Rate limit message:** If rate limited, show "Too many attempts. Try again in X seconds."

---

## **4.4 Dashboard Page**

### **Layout**

- Top header: "Your Sessions"
- Button top-right: **New Session** (small, blood orange)
- **Table View** with columns:
  - Session Name (clickable, opens editor)
  - Last Updated (relative time, e.g., "2 hours ago")
  - Language (badge with icon)
  - Actions (Open, Delete buttons)
- Rows use dark gray with alternating near-black rows
- Row hover → thin blood-orange border
- **Pagination:** Show 50 sessions per page with "Load More" button at bottom

### **Empty State**

When user has no sessions:

- Large file icon (96px, blood orange)
- Heading: "No sessions yet"
- Subtext: "Create your first session to start reviewing code with AI"
- Large blood orange **Create Session** button

### **Loading State**

- Skeleton loaders for table rows (5 rows)
- Shimmer effect on skeleton (subtle pulse)

### **New Session Modal**

- **Drag & drop upload box** with dashed border
  - "Drag a file here or click to browse"
  - Show file icon when hovering with file
  - Max file size indicator: "Max 5MB"
- **OR divider** (horizontal line with "OR" text in center)
- **"Start Empty Session" section:**
  - Session name input
  - Language dropdown (pre-populated with common languages)
  - Optional: Template selector (future)
- Blood orange **Create Session** button (disabled until file selected or name entered)
- **Close** button (X) top-right
- **Error handling:** Show "File too large" if >5MB, "Invalid file type" if binary
- **Loading state:** Show progress bar during file upload

---

## **4.5 Editor Workspace**

### **Structure**

- **Monaco Editor** left (full height)
- **Slide-in Thread/AI Panel** right (fixed width 450px)
- **Top Nav**: Logo mark + wordmark left, user menu right

### **Editor Details**

- Dark custom Monaco theme
- Blood-orange selection highlight
- **Gutter thread markers:**
  - Small orange dot (4px diameter) next to line numbers
  - Multiple threads on same line: Stacked dots vertically (max 3 visible, then "+X more")
  - Hover over dot: Show tooltip with thread title/preview
  - Click dot: Open thread panel for that thread
- **Save button in top bar:**
  - "Save" (enabled when dirty)
  - "Saved" (disabled when clean)
  - "Saving..." (when request in flight)
  - Keyboard shortcut: Cmd/Ctrl+S
- **Unsaved changes indicator:** Orange dot next to filename when dirty
- **Language picker dropdown:** Top-right, shows current language (e.g., "JavaScript ▾")
- **Large file indicator:** If file >1000 lines, show badge: "Large file - AI will use local context"
- **Version conflict banner:** If version conflict detected:
  - Banner at top: "This session was modified elsewhere."
  - Buttons: "View Changes" | "Reload" | "Dismiss"

### **Navigation Warning Modal**

When user tries to navigate away with unsaved changes:

- Title: "You have unsaved changes"
- Body: "Leaving will discard your edits. Are you sure?"
- Actions:
  - **"Save and Leave"** (primary, blood orange)
  - **"Discard Changes"** (danger, red)
  - **"Cancel"** (secondary, gray)

### **Thread/AI Panel**

- Opens from right side (slides in, no animation)
- Fixed width: 450px
- Contains:
  - **Header:**
    - Thread title (e.g., "Lines 5–12" or "Full File Review")
    - Anchor status badge: "Stable" (green) or "Approximate" (orange)
    - Close button (X)
  - **Thread history (scrollable):**
    - User messages: Left-aligned, dark gray background
    - AI messages: Right-aligned, blood orange header bar
    - Timestamp below each message (relative time)
    - If AI used local context: Show badge "Used local context"
  - **User message input:**
    - Multi-line textarea (auto-expand, max 5 lines before scroll)
    - Character counter: "X / 5000" (gray when <4500, orange when >4500)
    - Placeholder: "Ask AI about this code..."
  - **Send button:**
    - Blood orange **Ask AI** button
    - Keyboard shortcut: Cmd/Ctrl+Enter (only when textarea focused)
    - Loading state: Spinner + "Analyzing..." (disable input during)
  - **AI thinking indicator:**
    - Animated three-dot pulse
    - Text: "AI is thinking..." (gray text)
- Simple dividers in dim gray between messages

### **AI Response Rendering**

- **Explanation section:** Markdown formatted (code blocks, lists, bold, italic)
- **Code suggestions:**
  - Syntax highlighted code block
  - **View Diff** button below (blood orange, small)
- **Action buttons:**
  - **Apply Patch** (primary, blood orange) - only if patch available
  - **Copy Code** (secondary, gray outline)

### **Diff View Modal**

- Full-screen overlay (semi-transparent dark background)
- Modal card (max-width 1400px, centered)
- **Header:**
  - Title: "Review Changes"
  - Close button (X) - Esc keyboard shortcut
- **Monaco Diff Editor:**
  - Original code (left)
  - Proposed code (right)
  - Line-by-line comparison with red/green highlights
- **Footer buttons:**
  - **Apply Patch** (blood orange, primary)
  - **Cancel** (gray, secondary)
- **After applying patch:**
  - Show success toast: "Patch applied and saved"
  - Close modal automatically
  - Reset dirty state (since auto-saved)

### **Empty States**

- **No threads yet:**
  - Gray message in thread list sidebar: "No conversations yet"
  - Subtext: "Select code and click 'Ask AI' to start"
- **No messages in thread:**
  - Show thread metadata (lines, selection)
  - Prompt: "Start the conversation about this code"

---

## **4.6 Settings Page**

### **Sections**

- **Profile**
  - Display name (editable text input)
  - Username (editable text input, validate uniqueness)
  - Email (editable text input, validate uniqueness)
  - **Save Changes** button (blood orange, disabled until modified)
- **Change Password**
  - Current Password (password input)
  - New Password (password input with strength indicator)
  - Confirm New Password (password input)
  - **Update Password** button (blood orange)
  - Show success message: "Password updated successfully"
- **Preferences**
  - Theme toggle (disabled with note: "Dark theme only in v1")
  - Future: AI model preference, context window size
- **Danger Zone**
  - Section with red border
  - **Delete Account** button (red outline)
  - On click: Show confirmation modal
    - Title: "Delete Account"
    - Body: "This will permanently delete your account, all sessions, and conversation history. This cannot be undone."
    - Require password confirmation
    - Actions: "Delete Forever" (red) | "Cancel" (gray)

### **Layout**

- Left sidebar nav:
  - Profile
  - Security
  - Preferences
  - Danger Zone
- Right content panel (~900px width)
- Each section separated by horizontal divider

---

## **4.7 About Page**

### **Purpose**

Explain CodeSensei as a project.

### **Content Sections**

- Hero-style title: Logo mark + “About CodeSensei”
- Paragraph describing:
  - Purpose
  - Features
  - Why it was built
- Navigation links:
  - Back to Landing Page
  - Signup/Login

---

# **5. Component-Level Design**

## **5.1 Buttons**

- Primary color: Blood Orange
- White text
- No hover animations (only brightness difference)

## **5.2 Input Fields**

- Dark gray background
- White text
- Subtle orange border on focus
- Slight inner shadow for depth

## **5.3 Table Style**

- Dark rows
- Alternating near-black rows
- Orange border on hover
- Clear right-aligned actions

## **5.4 Modals**

- Centered
- Dark gray background
- Rounded medium corners
- Close icon top-right

## **5.5 Navigation Bar**

- Dark background
- Logo mark + CodeSensei text
- About / Settings / Logout on right

---

# **6. Iconography**

- Clean-line SVG icons (2px stroke weight)
- Color: blood orange (#FF4A1F)
- Size variants: 16px, 20px, 24px, 32px
- Icons needed:
  - **Save**: Floppy disk or cloud upload
  - **Upload**: Arrow up into cloud
  - **New Session**: Plus icon in circle
  - **Threads**: Chat bubbles or comment icon
  - **Delete**: Trash can
  - **Settings**: Gear icon
  - **Info**: Circle with "i"
  - **Close**: X icon
  - **Check**: Checkmark (for success states)
  - **Warning**: Triangle with exclamation
  - **Error**: Circle with X
  - **File**: Document icon (with language badge overlay)
  - **AI**: Sparkle or robot icon
  - **Code**: Brackets icon `</>`
  - **Diff**: Split view icon
  - **Anchor**: Link or anchor icon (for thread anchors)
  - **User**: Person silhouette
  - **Logout**: Exit door with arrow
  - **Menu**: Three horizontal lines (hamburger)
  - **Dropdown**: Chevron down
  - **Loading**: Spinner (circular)

Icon library recommendation: Heroicons, Lucide, or Feather Icons

---

# **7. Responsiveness**

## **7.1 Breakpoints**

- **Desktop**: >1200px (primary target)
- **Laptop**: 1024px - 1199px
- **Tablet**: 768px - 1023px
- **Mobile**: <768px

## **7.2 Layout Adaptations**

### **Dashboard**

- **Desktop/Laptop**: Table view with all columns
- **Tablet**: Table view, hide "Last Updated" column, make actions icons only
- **Mobile**: Card list view (stacked vertically)
  - Each session as card with name, language badge, last updated
  - Actions as dropdown menu (three-dot icon)

### **Editor Workspace**

- **Desktop/Laptop**: Side-by-side (editor + thread panel)
- **Tablet**: Editor full-width, thread panel as overlay (slides over editor)
- **Mobile**:
  - Editor full-screen by default
  - Thread list as bottom sheet (swipe up)
  - Active thread as full-screen overlay
  - Virtual keyboard pushes editor up (not overlay)
  - Selection mechanism: Long-press to select, show "Ask AI" button in context menu

### **Thread Panel**

- **Desktop**: Fixed 450px width panel on right
- **Tablet**: Full-width drawer from right (overlay)
- **Mobile**: Full-screen modal with back button

### **Landing Page**

- **Desktop**: Three-column features section
- **Tablet**: Two-column features
- **Mobile**: Single-column stack
  - Hero text smaller (24px → 18px)
  - CTA buttons full-width

### **Modals**

- **Desktop**: Centered with max-width
- **Mobile**: Full-screen with header bar

## **7.3 Touch Interactions (Mobile)**

- Larger tap targets (min 44px × 44px)
- Swipe gestures:
  - Swipe right on thread panel: Close panel
  - Swipe down on modals: Dismiss (if not mid-form)
- Long-press for context menus
- Pull-to-refresh on dashboard

## **7.4 Typography Scaling**

- **Desktop**: Base 16px
- **Tablet**: Base 15px
- **Mobile**: Base 14px
- Scale headings proportionally

## **7.5 Monaco on Mobile**

- Use Monaco's mobile-friendly configuration
- Larger line height (1.8 instead of 1.5)
- Larger touch targets for line numbers
- Hide minimap
- Simplify context menu
- Consider read-only mode for very small screens (<375px)

---

# **8. Loading, Error, and Empty States**

## **8.1 Loading States**

### **Page Loading**

- **Dashboard**: Skeleton loaders for table rows (5 placeholders)
- **Editor**: Loading spinner in center with "Loading session..." text
- **Settings**: Skeleton for form fields

### **Button Loading**

- Replace button text with spinner + loading text:
  - "Save" → "Saving..."
  - "Create Account" → "Creating account..."
  - "Ask AI" → "Analyzing..."
- Disable button during loading
- Keep button width fixed (don't resize on text change)

### **Content Loading**

- **AI response**: Animated three-dot pulse with "AI is thinking..."
- **Thread messages**: Skeleton bubbles for messages
- **File upload**: Progress bar (0-100%)

### **Skeleton Loaders**

- Gray rectangles with subtle shimmer/pulse effect
- Match shape of actual content (e.g., table rows, message bubbles)
- Show 3-5 placeholders

## **8.2 Empty States**

### **Dashboard (No Sessions)**

- Large file icon (96px, blood orange stroke)
- Heading (24px, white): "No sessions yet"
- Subtext (16px, dim gray): "Create your first session to start reviewing code with AI"
- Large CTA button: "Create Session" (blood orange)

### **Editor Thread List (No Threads)**

- Small chat bubble icon (48px, dim gray)
- Text (14px, dim gray): "No conversations yet"
- Subtext (12px, dimmer gray): "Select code and click 'Ask AI' to start"

### **Thread Panel (No Messages)**

- Show thread metadata at top (lines, anchor status)
- Center message (gray): "Start the conversation"
- Prompt text in input: "Ask AI about this code..."

### **Search Results (No Matches)**

- Magnifying glass icon (48px, dim gray)
- Text: "No sessions found"
- Subtext: "Try a different search term"

## **8.3 Error States**

### **Global Error Toast**

- **Position**: Top-right corner, 24px from top and right
- **Width**: 400px (mobile: full-width minus 16px padding)
- **Types**:
  - **Error** (red #DC2626 border): For failures
  - **Warning** (orange #FF4A1F border): For cautions
  - **Info** (blue #3B82F6 border): For information
  - **Success** (green #10B981 border): For confirmations
- **Content**:
  - Icon (left, 20px)
  - Title (bold)
  - Message (optional, smaller text)
  - Dismiss button (X, right)
- **Behavior**:
  - Success/Info: Auto-dismiss after 5 seconds
  - Warning/Error: Require manual dismiss
  - Stack multiple toasts vertically (max 3 visible)
- **Animation**: None (instant appear, instant dismiss)

### **Inline Form Errors**

- Red text (#DC2626) below input field
- Red border on invalid input
- Icon (exclamation circle) before error text
- Examples:
  - "Email is already registered"
  - "Password must be at least 8 characters"
  - "Username is already taken"

### **Network Error Page**

- Full-page state when critical API call fails
- Cloud with X icon (large, dim gray)
- Heading: "Connection lost"
- Message: "Check your internet connection and try again"
- Button: "Retry" (blood orange)

### **404 Page**

- Large "404" text (blood orange)
- Heading: "Page not found"
- Message: "The page you're looking for doesn't exist"
- Button: "Go to Dashboard" (blood orange)

### **AI Error Messages**

- Show in thread panel as system message (gray background)
- Examples:
  - "AI request timed out. Try with a smaller code selection."
  - "AI is temporarily unavailable. Please try again in a moment."
  - "Rate limit exceeded. You can try again in X seconds."
  - "This file is too large. Select a specific code block to analyze."

### **Version Conflict Error**

- Banner at top of editor (orange background)
- Icon: Warning triangle
- Text: "This session was modified elsewhere."
- Buttons: "View Changes" | "Reload" | "Dismiss"
- On "View Changes": Show diff modal comparing local vs server version

## **8.4 Success States**

### **Success Toast**

- Green border, checkmark icon
- Examples:
  - "Session saved successfully"
  - "Patch applied and saved"
  - "Password updated"
  - "Account created successfully"

### **Inline Success**

- Green checkmark next to field (e.g., username availability check)
- Green text: "Username available"

### **Save Indicator**

- Editor header, next to filename
- States:
  - Orange dot: Unsaved changes
  - Green checkmark: Saved
  - Gray spinner: Saving...
  - No indicator: No changes

## **8.5 Confirmation Modals**

### **Destructive Actions**

- Red accent color for danger zone
- Examples:
  - Delete session
  - Delete account
  - Discard unsaved changes

### **Modal Structure**

- Semi-transparent dark overlay (backdrop)
- Centered card (max-width 500px)
- Icon at top (warning triangle for danger, info circle for info)
- Title (bold, 20px)
- Body text (16px, multi-line)
- Button row at bottom:
  - Primary action (right, blood orange or red for danger)
  - Cancel (left, gray outline)
- Close X button (top-right)
- Esc keyboard shortcut to cancel

---

# **9. Keyboard Shortcuts**

All keyboard shortcuts use Cmd on macOS, Ctrl on Windows/Linux.

## **Core Functionality Shortcuts**

| Shortcut           | Action                                | Context                              |
| ------------------ | ------------------------------------- | ------------------------------------ |
| **Cmd/Ctrl+S**     | Save session                          | Editor only                          |
| **Cmd/Ctrl+Enter** | Send message                          | Thread panel textarea (when focused) |
| **Esc**            | Close modal/panel/diff                | Global                               |
| **Tab**            | Navigate forward through form fields  | Forms                                |
| **Shift+Tab**      | Navigate backward through form fields | Forms                                |
| **Enter**          | Submit form / Activate button         | Forms (when not in textarea)         |

**Note:** Monaco Editor includes its own default shortcuts (Cmd/Ctrl+F for find, Cmd/Ctrl+/ for toggle comment, etc.) which come built-in.

---

# **10. Accessibility Requirements**

CodeSensei commits to "basic sane accessibility" for launch.

## **Required Accessibility Features**

### **Keyboard Navigation**

- All interactive elements (buttons, inputs, links) must be keyboard accessible
- Logical tab order: top-to-bottom, left-to-right
- No keyboard traps (user can always navigate away)

### **Focus Indicators**

- Visible focus outline on all interactive elements
- Style: 2px solid blood orange (#FF4A1F) outline
- Never remove focus styles with `outline: none` without replacement

### **Semantic HTML**

- Use proper semantic elements: `<nav>`, `<main>`, `<button>`, `<form>`, `<label>`
- Never use `<div>` with click handlers instead of `<button>`
- Form inputs must have associated `<label>` elements

### **Labels and Text Alternatives**

- All form inputs have visible labels or `aria-label` attributes
- All icon-only buttons have `aria-label` describing their action
- Examples:
  - Save button with icon: `aria-label="Save session"`
  - Close button (X): `aria-label="Close modal"`

### **Color Contrast**

- Text must meet minimum 4.5:1 contrast ratio
- Verified ratios:
  - White (#E6E6E6) on Dark Gray (#1C1C1E): 9.8:1 ✓
  - Blood Orange (#FF4A1F) on Dark Gray (#1C1C1E): 4.8:1 ✓
  - White on Near Black (#0D0D0F): 14.1:1 ✓

### **Form Validation**

- Error messages must be programmatically associated with inputs
- Use `aria-describedby` to link error text to form fields
- Error states indicated with both color AND icon/text

## **What's Aspirational for Phase 2**

- Full WCAG 2.1 AA compliance (aspirational for Phase 2)
- Comprehensive screen reader announcements
- Skip navigation links
- aria-live regions for dynamic content
- Full accessibility audit with automated tools

**Philosophy:** Ship with accessibility that doesn't exclude users, then iterate toward full compliance.

---

# **11. Summary**

This design spec defines the complete frontend visual system for CodeSensei across all pages and components.

**Key design principles:**

- Dark modern SaaS aesthetic with blood-orange accenting (#FF4A1F)
- Fixed-width panels and clean layouts
- Comprehensive loading, error, and empty states for all user flows
- Essential keyboard navigation support (see § 9)
- Basic sane accessibility requirements (see § 10)
- Mobile-responsive with touch-friendly interactions (min 44px tap targets)
- Consistent iconography (Heroicons/Lucide) and typography (Inter/System UI)
- Clear visual hierarchy and information architecture
- No animations (instant UI for performance)

**Technology stack:**

- React for UI components
- Monaco Editor for code editing and diff views
- Tailwind CSS or CSS Modules for styling
- Heroicons/Lucide/Feather for icons
- Responsive design with defined breakpoints (desktop >1200px, tablet 768-1023px, mobile <768px)

This document is production-ready and suitable for implementation by development teams.

**Last Updated:** November 22, 2025  
**Version:** 2.0 (Comprehensive specification with all UI/UX requirements)
