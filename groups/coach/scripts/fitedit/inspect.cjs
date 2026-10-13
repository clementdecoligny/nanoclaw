const fs = require('fs');
const { FitFile } = require('fit-tool/dist/fit_file.js');

const buf = fs.readFileSync(process.argv[2]);
const fit = FitFile.fromBytes(new Uint8Array(buf));

let minTs = null, maxTs = null;
const types = {};
for (const rec of fit.records) {
  const name = rec.message?.name || rec.name || rec.mesgNum;
  types[name] = (types[name] || 0) + 1;
  const msg = rec.message;
  if (msg && msg.timestamp !== undefined && msg.timestamp !== null) {
    const t = msg.timestamp instanceof Date ? msg.timestamp.getTime() : null;
    if (t) {
      if (minTs === null || t < minTs) minTs = t;
      if (maxTs === null || t > maxTs) maxTs = t;
    }
  }
}
console.log('message types:', types);
console.log('min timestamp:', minTs ? new Date(minTs).toISOString() : null);
console.log('max timestamp:', maxTs ? new Date(maxTs).toISOString() : null);
