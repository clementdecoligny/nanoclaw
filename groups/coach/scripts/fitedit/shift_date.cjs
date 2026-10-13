const fs = require('fs');
const { Decoder, Encoder, Stream } = require('@garmin/fitsdk');

const [, , inPath, outPath, newStartIso] = process.argv;

const buf = fs.readFileSync(inPath);
const stream = Stream.fromBuffer(buf);
const decoder = new Decoder(stream);

const ordered = [];
const { messages, errors } = decoder.read({
  mesgListener: (mesgNum, mesg) => {
    ordered.push({ mesgNum, mesg });
  },
});
if (errors.length) {
  console.error('decode errors', errors);
  process.exit(1);
}

const oldStartMs = messages.fileIdMesgs[0].timeCreated.getTime();
const newStartMs = new Date(newStartIso).getTime();
const deltaMs = newStartMs - oldStartMs;
const deltaSec = Math.round(deltaMs / 1000);

function shiftMesg(mesg) {
  for (const key of Object.keys(mesg)) {
    const val = mesg[key];
    if (val instanceof Date) {
      mesg[key] = new Date(val.getTime() + deltaMs);
    } else if (key === 'localTimestamp' && typeof val === 'number') {
      mesg[key] = val + deltaSec;
    } else if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        if (val[i] instanceof Date) val[i] = new Date(val[i].getTime() + deltaMs);
      }
    }
  }
}

for (const { mesg } of ordered) shiftMesg(mesg);

const encoder = new Encoder();
let skipped = 0;
for (let i = 0; i < ordered.length; i++) {
  const { mesgNum, mesg } = ordered[i];
  if (Object.keys(mesg).length === 0) {
    skipped++;
    continue;
  }
  try {
    encoder.onMesg(mesgNum, mesg);
  } catch (e) {
    console.error('FAILED at index', i, 'mesgNum', mesgNum, JSON.stringify(mesg));
    throw e;
  }
}
if (skipped) console.error('skipped empty messages:', skipped);
const out = encoder.close();
fs.writeFileSync(outPath, Buffer.from(out));

console.log(JSON.stringify({
  oldStart: new Date(oldStartMs).toISOString(),
  newStart: new Date(newStartMs).toISOString(),
  deltaSeconds: deltaSec,
  messageCount: ordered.length,
}));
