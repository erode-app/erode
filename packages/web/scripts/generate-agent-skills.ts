import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(__dirname, '../public/.well-known/agent-skills');
const BASE_URL = 'https://erode.dev/.well-known/agent-skills';
const SCHEMA_VERSION = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json';

interface SkillEntry {
  name: string;
  type: 'skill-md' | 'archive';
  description: string;
  url: string;
  digest: string;
}

interface SkillIndex {
  $schema: string;
  skills: SkillEntry[];
}

function parseFrontMatter(
  content: string
): { name: string; description: string } | { error: string } {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!match) return { error: 'no YAML front matter (missing --- delimiters)' };

  const yaml = match[1];
  const nameMatch = /^name:\s*(.+)$/m.exec(yaml);
  const name = nameMatch?.[1]?.trim();
  if (!name) return { error: 'missing "name" field in front matter' };

  // Handle YAML folded scalars (> and >-). Literal block scalars (|)
  // and quoted strings are not supported.
  const descMatch = /^description:\s*>-?\n((?:\s+.+\n?)+)/m.exec(yaml);

  let description: string | undefined;
  if (descMatch) {
    description = descMatch[1]
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join(' ');
  } else {
    const singleMatch = /^description:\s*(?!>)(.+)$/m.exec(yaml);
    description = singleMatch?.[1]?.trim();
  }

  if (!description) return { error: 'missing "description" field in front matter' };
  return { name, description };
}

function computeDigest(content: string): string {
  const hash = crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  return `sha256:${hash}`;
}

function discoverSkills(): SkillEntry[] {
  if (!fs.existsSync(SKILLS_DIR)) {
    console.error(`Skills directory not found: ${SKILLS_DIR}`);
    console.error('Create it with at least one skill subdirectory containing a SKILL.md file.');
    process.exit(1);
  }

  const entries: SkillEntry[] = [];
  const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const skillPath = path.join(SKILLS_DIR, dir.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;

    const content = fs.readFileSync(skillPath, 'utf-8');
    const meta = parseFrontMatter(content);
    if ('error' in meta) {
      console.warn(`Skipping ${dir.name}: ${meta.error}`);
      continue;
    }

    entries.push({
      name: meta.name,
      type: 'skill-md',
      description: meta.description,
      url: `${BASE_URL}/${dir.name}/SKILL.md`,
      digest: computeDigest(content),
    });
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function main() {
  const skills = discoverSkills();

  if (skills.length === 0) {
    console.error('No skills found in', SKILLS_DIR);
    process.exit(1);
  }

  const index: SkillIndex = {
    $schema: SCHEMA_VERSION,
    skills,
  };

  const json = JSON.stringify(index, null, 2) + '\n';
  const outPath = path.join(SKILLS_DIR, 'index.json');

  if (process.argv.includes('--check')) {
    if (!fs.existsSync(outPath)) {
      console.error(
        'index.json does not exist. Run `npm run generate:skills --workspace=packages/web`.'
      );
      process.exit(1);
    }
    const existing = fs.readFileSync(outPath, 'utf-8');
    if (existing !== json) {
      console.error('index.json is stale. Run `npm run generate:skills --workspace=packages/web`.');
      process.exit(1);
    }
    console.log('index.json is up-to-date.');
    return;
  }

  fs.writeFileSync(outPath, json);
  console.log(`index.json written with ${String(skills.length)} skill(s):`);
  for (const skill of skills) {
    console.log(`  - ${skill.name}: ${skill.digest}`);
  }
}

main();
