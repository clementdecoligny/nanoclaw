#!/usr/bin/env python3
"""Transcribe an audio file using faster-whisper. Prints transcript to stdout."""
import sys
from faster_whisper import WhisperModel

if len(sys.argv) < 2:
    print("Usage: transcribe.py <audio_file>", file=sys.stderr)
    sys.exit(1)

model = WhisperModel("tiny", device="cpu", compute_type="int8")
segments, _ = model.transcribe(sys.argv[1], beam_size=1)
print("".join(segment.text for segment in segments).strip())
