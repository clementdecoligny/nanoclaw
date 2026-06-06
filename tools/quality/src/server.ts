import express from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const HISTORY_PATH = path.join(__dirname, '..', 'history.json');
const BASELINE_PATH = path.join(__dirname, '..', 'baseline.json');

const app = express();

app.use(express.static(PUBLIC_DIR));

app.get('/api/history', (_req, res) => {
  if (!fs.existsSync(HISTORY_PATH)) {
    res.json({ commits: [] });
    return;
  }
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Failed to read history.json' });
  }
});

app.get('/api/baseline', (_req, res) => {
  if (!fs.existsSync(BASELINE_PATH)) {
    res.json(null);
    return;
  }
  try {
    const raw = fs.readFileSync(BASELINE_PATH, 'utf8');
    const data = JSON.parse(raw);
    res.json(data);
  } catch {
    res.json(null);
  }
});

const PORT = 3456;
app.listen(PORT, () => {
  console.log(`Quality dashboard running at http://localhost:${PORT}`);
});
