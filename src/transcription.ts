import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

const PYTHON = path.join(process.cwd(), '.venv/whisper/bin/python');
const SCRIPT = path.join(process.cwd(), 'scripts/transcribe.py');

export async function transcribeAudio(
  filePath: string,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(PYTHON, [SCRIPT, filePath], {
      timeout: 60_000,
    });
    const text = stdout.trim();
    logger.info({ filePath, chars: text.length }, 'Transcription complete');
    return text || null;
  } catch (err) {
    logger.error({ filePath, err }, 'Transcription failed');
    return null;
  }
}
