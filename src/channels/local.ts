// Local channel registrations — adapters this install maintains itself rather
// than through an `/add-<channel>` skill. Kept out of index.ts on purpose: the
// update's skill refresh treats every import there as a skill to re-apply.
import './telegram-local.js';
