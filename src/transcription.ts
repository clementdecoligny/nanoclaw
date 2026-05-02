import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';

import { log } from './log.js';

const execFileAsync = promisify(execFile);

const PYTHON = path.join(process.cwd(), '.venv/whisper/bin/python');
const SCRIPT = path.join(process.cwd(), 'scripts/transcribe.py');

export async function transcribeAudio(filePath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(PYTHON, [SCRIPT, filePath], {
      timeout: 60_000,
    });
    const text = stdout.trim();
    log.info('Transcription complete', { filePath, chars: text.length });
    return text || null;
  } catch (err) {
    log.error('Transcription failed', { filePath, err });
    return null;
  }
}
