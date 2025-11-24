import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 5173;
const DIST_DIR = join(__dirname, "dist");

// Serve static files from dist directory
app.use(express.static(DIST_DIR));

// Mimic Amplify rewrite rules
app.get("/assets/*", (req, res, next) => {
  // Let static middleware handle assets
  next();
});

app.get("/favicon.png", (req, res, next) => {
  // Let static middleware handle favicon
  next();
});

app.get("/manifest.json", (req, res, next) => {
  // Let static middleware handle manifest
  next();
});

// SPA fallback: all other routes serve index.html
app.get("*", (req, res) => {
  const indexPath = join(DIST_DIR, "index.html");
  if (existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('index.html not found. Run "npm run build" first.');
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Production build server running at:`);
  console.log(`   http://localhost:${PORT}\n`);
  console.log(`📦 Serving from: ${DIST_DIR}`);
  console.log(`\n✨ This mimics Amplify's rewrite behavior\n`);
});
