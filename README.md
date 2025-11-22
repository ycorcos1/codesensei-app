# CodeSensei - AI-Powered Code Review Platform

**Version:** 2.0 (Production-Ready)  
**Status:** Comprehensive specifications complete, ready for implementation  
**Owner:** Yahav Corcos

---

## 📋 What is CodeSensei?

CodeSensei is a full-featured, production-grade AI-powered code review tool that brings AI directly into the code workflow. Users can upload or write code, highlight specific blocks, and engage in inline AI conversations (threads) tied to that selection. Using AWS Bedrock (Claude), CodeSensei provides contextual analysis, improvement suggestions, refactoring help, diff-based patches, and deep code understanding within a Monaco-powered coding experience.

**Key Differentiator:** AI conversations are anchored to specific code blocks, creating persistent, contextual review threads that stay with your code as it evolves.

---

## 🎯 Core Features

- **Inline AI Conversations**: Create multiple threads per file, each tied to a specific code block
- **Smart Anchor Tracking**: Threads automatically follow code as it moves or changes
- **Diff View & Apply Patch**: Monaco diff editor with one-click code replacement
- **Auto-save on Patch**: AI suggestions are automatically saved when applied
- **Manual Save with Conflict Detection**: Optimistic locking prevents data loss from concurrent edits
- **Multi-language Support**: Works with any language Monaco supports
- **Large File Handling**: Automatically falls back to local context for huge files
- **Session Management**: Persistent sessions with full edit history
- **Secure Authentication**: JWT-based auth with refresh tokens
- **Production-Ready**: Full monitoring, error handling, and cost controls

---

## 📚 Documentation

### Core Documents (Version 2.0)

| Document                 | Purpose                                              | Path                                                                 |
| ------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------- |
| **Product Requirements** | What CodeSensei does and why                         | [`docs/CodeSensei_PRD.md`](docs/CodeSensei_PRD.md)                   |
| **Architecture**         | Backend, infrastructure, deployment                  | [`docs/CodeSensei_Architecture.md`](docs/CodeSensei_Architecture.md) |
| **Design Specification** | UI/UX, components, keyboard shortcuts, accessibility | [`docs/CodeSensei_Design_Spec.md`](docs/CodeSensei_Design_Spec.md)   |
| **Task List**            | Step-by-step implementation guide                    | [`docs/CodeSensei_Task_List.md`](docs/CodeSensei_Task_List.md)       |

### Quick Reference

- **Tech Stack**: React, Monaco Editor, AWS Lambda, DynamoDB, Bedrock (Claude)
- **Deployment**: AWS Amplify (frontend), SAM/Terraform (backend)
- **Authentication**: JWT access tokens (15 min) + refresh tokens (7 days)
- **AI Model**: Claude 3.7 Sonnet (or latest available)
- **Database**: DynamoDB with GSIs for efficient queries

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ Landing    │  │  Dashboard   │  │   Editor     │        │
│  │ Login/     │  │  (Sessions)  │  │   Monaco +   │        │
│  │ Signup     │  │              │  │   Threads    │        │
│  └────────────┘  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTPS
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway + Lambda                    │
│  ┌───────┐  ┌─────────┐  ┌────────┐  ┌─────────┐  ┌──────┐│
│  │ Auth  │  │Sessions │  │Threads │  │Messages │  │  AI  ││
│  │Lambda │  │ Lambda  │  │ Lambda │  │ Lambda  │  │Lambda││
│  └───────┘  └─────────┘  └────────┘  └─────────┘  └──────┘│
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      DynamoDB Tables                         │
│  ┌────────┐  ┌──────────┐  ┌─────────┐  ┌──────────┐      │
│  │ Users  │  │ Sessions │  │ Threads │  │ Messages │      │
│  │(+GSIs) │  │  (+GSIs) │  │ (+GSIs) │  │          │      │
│  └────────┘  └──────────┘  └─────────┘  └──────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      AWS Bedrock                             │
│              Claude 3.7 Sonnet (Code Review AI)             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- AWS Account with:
  - Bedrock access (Claude model enabled)
  - AWS CLI configured
  - Appropriate IAM permissions
- Git and GitHub account

### Setup Steps

1. **Initialize Repository** (Task 1)

   ```bash
   git clone <your-repo>
   cd codesensei-app
   ```

2. **Set Up AWS Infrastructure** (Tasks 2-5)

   - Configure AWS region (recommend us-east-1 for Bedrock)
   - Create DynamoDB tables with GSIs
   - Set up IAM roles and policies

3. **Deploy Backend** (Tasks 3, 6-7, 12, 14, 16-17)

   ```bash
   cd backend
   sam deploy --guided
   # or terraform apply
   ```

4. **Deploy Frontend** (Task 4, 8-11, 13, 15, 18)

   ```bash
   cd frontend
   npm install
   npm run build
   # Deploy to Amplify or S3+CloudFront
   ```

5. **Configure Environment Variables**
   - Frontend: `VITE_API_BASE_URL`
   - Backend: `BEDROCK_MODEL_ID`, `REGION`, DynamoDB table names

### Full Implementation Guide

Follow [`docs/CodeSensei_Task_List.md`](docs/CodeSensei_Task_List.md) for detailed step-by-step implementation instructions with 26 tasks covering everything from infrastructure setup to final QA.

---

## 🔐 Security Features

- **HTTPS everywhere** with TLS 1.2+
- **Password requirements**: Min 8 chars, uppercase, number, special char
- **JWT tokens** with short-lived access (15 min) + long-lived refresh (7 days)
- **httpOnly, secure, sameSite=strict** cookies
- **Rate limiting** on all endpoints (prevents brute force, abuse)
- **User isolation**: All data scoped to user_id
- **Input validation** and sanitization
- **No code execution** on backend (analysis via Bedrock only)
- **Least-privilege IAM roles**

---

## 💰 Cost Management

### Per-User Monthly Cost Estimate

- **DynamoDB**: ~$0.01 (storage + queries)
- **Lambda**: ~$0.005 (compute)
- **Bedrock AI**: ~$4.50 (300 AI requests/month)
- **Total**: ~$4.50/user/month

### Cost Controls

- AI rate limiting: 10 requests/minute per user
- Session limit: 100 per user
- File size limit: 5MB per session
- Token limit: 100K input tokens per AI call
- CloudWatch budget alerts

---

## 📊 Monitoring & Alerts

### CloudWatch Metrics

- API request counts and error rates
- Lambda duration (p50, p95, p99)
- Bedrock token consumption and costs
- DynamoDB capacity usage

### Alarms

- Error rate >5% (5-min window)
- AI timeout rate >10%
- DynamoDB throttling >10/min
- Average Bedrock cost >$50/hour

---

## 🎨 Design System

- **Color Palette**:

  - Primary background: Dark Gray (#1C1C1E)
  - Editor background: Near Black (#0D0D0F)
  - Accent: Blood Orange (#FF4A1F)
  - Text: Light Gray (#E6E6E6)
  - Secondary text: Dim Gray (#7A7A7A)

- **Typography**:

  - Headings: Inter or System UI (semi-bold)
  - Body: Inter or System UI (regular)
  - Code: Fira Code or Monaco (monospace)

- **Responsive Breakpoints**:
  - Desktop: >1200px
  - Laptop: 1024-1199px
  - Tablet: 768-1023px
  - Mobile: <768px

---

## 🧪 Testing & QA

### Test Coverage Areas

1. **Authentication**: Signup, login, token refresh, logout
2. **Sessions**: Create, read, update, delete, version conflicts
3. **Threads**: Create, list, anchor tracking, delete
4. **Messages**: Send, receive, pagination
5. **AI Integration**: Bedrock calls, token limits, error handling
6. **Diff & Patch**: Monaco diff view, apply patch, auto-save
7. **Error Handling**: All error codes, user-friendly messages
8. **Rate Limiting**: Verify limits work, no false positives
9. **Mobile**: Responsive design, touch interactions
10. **Accessibility**: Keyboard navigation, screen readers, WCAG 2.1 AA

### Success Criteria

- Session save success rate: >99.9%
- AI response time: <10s (p95)
- Page load time: <2s (p95)
- Error rate: <1%
- User retention: >60% after 30 days

---

## 🔄 Version History

### Version 2.0 (November 22, 2025) - Production-Ready

- ✅ Added DynamoDB GSIs for efficient queries
- ✅ Implemented JWT refresh token flow
- ✅ Added version conflict detection (optimistic locking)
- ✅ Defined structured AI response format
- ✅ Specified password validation requirements
- ✅ Added comprehensive error handling with error codes
- ✅ Defined all loading, empty, and error states
- ✅ Added user profile endpoints
- ✅ Specified rate limiting for all endpoints
- ✅ Added user/session/thread/message limits
- ✅ Created monitoring and alerting specifications
- ✅ Added cost management controls
- ✅ Completed accessibility specifications (WCAG 2.1 AA)
- ✅ Added keyboard shortcuts documentation

### Version 1.0 (Initial)

- Basic PRD, Architecture, and Design Spec
- Core feature definitions
- High-level architecture

---

## 📞 Support & Contributing

- **Issues**: Open GitHub issues for bugs or feature requests
- **Documentation**: All docs in `/docs` directory
- **Code Style**: Follow ESLint/Prettier configs (to be added in implementation)
- **Commit Messages**: Use conventional commits format

---

## 📝 License

[Specify your license here]

---

## 🙏 Acknowledgments

- **AWS Bedrock**: For Claude AI model access
- **Monaco Editor**: Microsoft's web-based code editor
- **React**: UI framework
- **Automattic**: Original code review challenge inspiration

---

**Built with ❤️ for better code reviews**

For detailed implementation instructions, start with [`docs/CodeSensei_Task_List.md`](docs/CodeSensei_Task_List.md).

For a comprehensive overview of V2.0 changes, see [`docs/IMPLEMENTATION_SUMMARY.md`](docs/IMPLEMENTATION_SUMMARY.md).
