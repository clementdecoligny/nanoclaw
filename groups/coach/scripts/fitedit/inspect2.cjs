const fs = require('fs');
const { Decoder, Stream } = require('@garmin/fitsdk');

const buf = fs.readFileSync(process.argv[2]);
const stream = Stream.fromBuffer(buf);
const decoder = new Decoder(stream);

const { messages, errors } = decoder.read();
if (errors.length) console.log('errors:', errors);

for (const key of Object.keys(messages)) {
  console.log(key, messages[key].length);
}

const sessions = messages.sessionMesgs || [];
const activities = messages.activityMesgs || [];
const records = messages.recordMesgs || [];

console.log('--- activityMesgs ---');
console.log(JSON.stringify(activities, null, 2));
console.log('--- sessionMesgs (first) ---');
console.log(JSON.stringify(sessions[0], null, 2));
console.log('--- first record ---');
console.log(JSON.stringify(records[0], null, 2));
console.log('--- last record ---');
console.log(JSON.stringify(records[records.length - 1], null, 2));
console.log('record count:', records.length);
