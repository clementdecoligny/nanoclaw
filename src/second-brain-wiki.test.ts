import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

import { GROUPS_DIR } from './config.js';
import { createAgentGroup } from './db/agent-groups.js';
import { closeDb, getDb, initTestDb } from './db/connection.js';
import { ensureContainerConfig, getContainerConfig } from './db/container-configs.js';
import { runMigrations } from './db/migrations/index.js';
import { PERSONA_PREPEND_FILE } from './group-persona.js';

/**
 * Second brain (Alain) — the two invariants that fail silently.
 *
 * Spec: docs/features/second-brain.md
 *
 * This feature ships no host code: it is a schema layer (a container skill plus
 * a block in the group's standing instructions) over plain markdown. So there
 * is little to unit-test — but two mechanical properties are load-bearing and
 * would break without raising an error anywhere.
 *
 * 1. Privacy. The wiki holds full clinical detail for Clément, his wife and
 *    their three children, by explicit decision. It stays off the git remote
 *    only because it is ignored: scripts/backup-db.sh runs `git add groups/`
 *    and pushes to origin nightly. If the ignore entry is dropped, reordered
 *    behind a negation, or the wiki path changes, medical records get pushed
 *    with full history and nothing complains. This test is that guarantee.
 *
 * 2. The schema layer. If SKILL.md disappears or the marker block in
 *    instructions.prepend.md is clobbered (the install skill is re-runnable),
 *    Alain degrades to a generic chatbot that no longer maintains the wiki —
 *    silently, since the files still exist and every command still succeeds.
 */
const ROOT = process.cwd();
const ALAIN = path.join(GROUPS_DIR, 'alain');
// Same constant the composer reads, so renaming the file fails this test rather
// than leaving it green against a path nothing loads.
const PREPEND = path.join(ALAIN, PERSONA_PREPEND_FILE);
const SKILL = path.join(ROOT, 'container', 'skills', 'wiki', 'SKILL.md');

/** Ask git itself whether a path is ignored — not a substring match on .gitignore. */
function isIgnored(relPath: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', relPath], { cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

describe('second brain — clinical detail never reaches the git remote', () => {
  // Probe paths, not the directories themselves: the assertion must hold
  // whether or not the wiki has been populated yet.
  it('ignores the wiki and source trees, including nested pages', () => {
    expect(isIgnored('groups/alain/wiki/index.md')).toBe(true);
    expect(isIgnored('groups/alain/wiki/dossiers/sante-tom.md')).toBe(true);
    expect(isIgnored('groups/alain/wiki/evenements/2026-08.md')).toBe(true);
    expect(isIgnored('groups/alain/sources/gmail/2026-08-05-x.md')).toBe(true);
  });

  it('ignores every group, not just alain', () => {
    // The wiki skill mounts into every group with skills:"all" (currently all of
    // them), so any group can grow a wiki/. A per-group entry would silently
    // leave the next one exposed — which it did, until this test.
    for (const group of ['coach', 'finance', 'pepa', 'some-future-group']) {
      expect(isIgnored(`groups/${group}/wiki/index.md`)).toBe(true);
      expect(isIgnored(`groups/${group}/sources/gmail/x.md`)).toBe(true);
    }
  });

  it('keeps tracking the rest of the group, so the ignore is scoped not blanket', () => {
    // container.json is ignored on purpose (.gitignore) — it is materialized at
    // spawn. The prepend and the composed doc are the group's tracked files.
    expect(isIgnored(path.join('groups', 'alain', PERSONA_PREPEND_FILE))).toBe(false);
    expect(isIgnored('groups/alain/CLAUDE.md')).toBe(false);
  });

  it('the nightly backup refuses to commit second-brain files', () => {
    // .gitignore is the policy; this guard is the backstop at the point of the
    // dangerous action (`git add groups/` → push), for a dropped entry or an
    // `add -f`. Without it, a gap in .gitignore is silent and irreversible.
    const script = fs.readFileSync(path.join(ROOT, 'scripts', 'backup-db.sh'), 'utf8');
    expect(script).toMatch(/groups\/\[\^\/\]\+\/\(wiki\|sources\)\//);
    expect(script).toMatch(/exit 1/);
  });

  it('has no wiki file staged or tracked in git', () => {
    const tracked = execFileSync('git', ['ls-files', '--', 'groups/alain/wiki', 'groups/alain/sources'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
    expect(tracked).toBe('');
  });
});

describe('second brain — the wiki skill is scoped to alain', () => {
  // container/skills/ mounts into every container; skills:"all" means "mount
  // everything in it". Adding an agent-specific skill there therefore hands it
  // to every group unless the others are pinned to an explicit list.
  it('does not offer the wiki skill to groups other than alain', () => {
    runMigrations(initTestDb());
    for (const [id, name, skills] of [
      ['ag-alain', 'Alain', '"all"'],
      ['ag-other', 'Other', '["agent-browser","welcome"]'],
    ] as const) {
      createAgentGroup({
        id,
        name,
        folder: name.toLowerCase(),
        agent_provider: null,
        created_at: new Date().toISOString(),
      });
      ensureContainerConfig(id);
      getDb().prepare('UPDATE container_configs SET skills = ? WHERE agent_group_id = ?').run(skills, id);
    }

    const sees = (id: string) => {
      const raw = JSON.parse(getContainerConfig(id)!.skills) as string | string[];
      return raw === 'all' || raw.includes('wiki');
    };
    expect(sees('ag-alain')).toBe(true);
    expect(sees('ag-other')).toBe(false);
    closeDb();
  });
});

describe('second brain — the schema layer reaches the agent', () => {
  it('ships the wiki container skill with frontmatter', () => {
    expect(fs.existsSync(SKILL)).toBe(true);
    const body = fs.readFileSync(SKILL, 'utf8');
    expect(body.startsWith('---')).toBe(true);
    expect(body).toMatch(/^name:\s*wiki$/m);
  });

  it('teaches all four operations, so ingest is not the only documented path', () => {
    const body = fs.readFileSync(SKILL, 'utf8').toLowerCase();
    for (const op of ['ingest', 'query', 'lint', 'découverte']) {
      expect(body).toContain(op);
    }
  });

  it('carries the event-log architecture, not the page-per-topic shape', () => {
    const body = fs.readFileSync(SKILL, 'utf8');
    // Events are the atom; jour/ and dossiers/ are generated views over them.
    expect(body).toMatch(/evenements\//);
    expect(body).toMatch(/jour\//);
    expect(body).toMatch(/dossiers\//);
  });

  it('forbids raw email bodies and credentials on disk, and defines what a leak is', () => {
    // A rewrite of this file once silently dropped these rules while the lint
    // step still referred to "leaks" with nothing defining the term.
    const body = fs.readFileSync(SKILL, 'utf8').toLowerCase();
    expect(body).toMatch(/jamais le corps complet|never write the body/);
    for (const secret of ['2fa', 'mots de passe', 'numéros de carte']) {
      expect(body).toContain(secret);
    }
    // Medical detail is the deliberate exception — it must stay recorded.
    expect(body).toMatch(/détail médical.{0,40}enregistré/s);
  });

  it('resolves the calendar by id and never falls back to primary', () => {
    // Alain's MCP is authenticated against HIS OWN Google account, whose
    // calendar is empty. Clément's calendar reaches him via a share, so it
    // appears as an extra entry in list-calendars — not as `primary`. If the
    // skill defaults to primary it ingests nothing, forever, silently.
    const body = fs.readFileSync(SKILL, 'utf8');
    expect(body).toMatch(/list-calendars/);
    expect(body.toLowerCase()).toMatch(/jamais `?primary`?|never `?primary`?/);
  });

  it('stops rather than reporting an empty history when the share is missing', () => {
    // The failure that must never be silent: a revoked or ungranted share looks
    // exactly like a working system with nothing to report. Both produce
    // "aucun événement" unless the skill distinguishes them explicitly.
    const body = fs.readFileSync(SKILL, 'utf8').toLowerCase();
    expect(body).toMatch(/partage/);
    // Absence-of-share must be called out as distinct from absence-of-events.
    expect(body).toMatch(/ne conclus pas|n'annonce pas|jamais « aucun/);
  });

  it('states the append-only rule that defends against model collapse', () => {
    const body = fs.readFileSync(SKILL, 'utf8').toLowerCase();
    expect(body).toMatch(/append-only|jamais réécrit|never rewritten/);
  });

  it('wires the wiki block into standing instructions, inside replaceable markers', () => {
    const body = fs.readFileSync(PREPEND, 'utf8');
    const begin = (body.match(/<!-- BEGIN karpathy-llm-wiki -->/g) ?? []).length;
    const end = (body.match(/<!-- END karpathy-llm-wiki -->/g) ?? []).length;
    // Exactly one pair — a re-run must replace the block, never append a second.
    expect(begin).toBe(1);
    expect(end).toBe(1);
    expect(body.indexOf('<!-- BEGIN karpathy-llm-wiki -->')).toBeLessThan(
      body.indexOf('<!-- END karpathy-llm-wiki -->'),
    );
  });

  it('puts the schema in the prepend, not the spawn-composed CLAUDE.md', () => {
    // groups/alain/CLAUDE.md is regenerated on every spawn; a wiki section
    // written there would be silently dropped at the next container start.
    const composed = fs.readFileSync(path.join(ALAIN, 'CLAUDE.md'), 'utf8');
    expect(composed).not.toContain('karpathy-llm-wiki');
  });
});
