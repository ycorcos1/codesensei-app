const EXPLAIN_PATTERNS = [
  "what does",
  "explain",
  "describe",
  "walk me through",
  "how does this work",
  "tell me about",
  "help me understand",
];

const IMPROVE_PATTERNS = [
  "improve",
  "refactor",
  "make this better",
  "cleaner",
  "simplify",
  "optimize",
  "better way",
  "clearer way",
  "fix",
  "issue with",
];

export function classifyIntent(message) {
  if (!message || typeof message !== "string") {
    return "improve";
  }

  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return "improve";
  }

  const matchesPattern = (patterns) =>
    patterns.some((pattern) => normalized.includes(pattern));

  if (matchesPattern(EXPLAIN_PATTERNS)) {
    return "explain";
  }

  if (matchesPattern(IMPROVE_PATTERNS)) {
    return "improve";
  }

  return "improve";
}

export default classifyIntent;

