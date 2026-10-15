// Compares a full scan from the Lessons Lister extension ("הורד JSON של כל
// המסלולים") with the course files the schedule builder reads.
//
//   node scripts/compare-scan.mjs <all-tracks.json>
//
// For every track that exists here it reports whether the lessons match the
// site one for one, which lessons were added or removed there, and whether
// only the order changed. Tracks on the site that are not here are listed too.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Site track (bundle) slug -> the course files of the matching track here.
// Tracks missing from the public list (AI Pro, ניהול פרויקטים, UI UX) are
// scanned page by page instead and are not compared.
const TRACK_FILES = {
  'full-stack-1': { id: 'fullstack', files: ['src/data/courses/Fullstack.json'] },
  'בינה-מלאכותית-ai': { id: 'ai-dev', files: ['src/data/courses/AI DEV.json'] },
  'cybersecurity-1': { id: 'cyber', files: ['src/data/courses/Cyber.json'] },
  qa: { id: 'qa', files: ['src/data/courses/QA.json'] },
  dataanalyst: { id: 'data-analyst', files: ['src/data/courses/Data Analyst.json'] },
  digitalmarketing: {
    id: 'digital-marketing',
    files: ['Courses/digital marketing1.json', 'Courses/digital marketing2.json'],
  },
  devops: { id: 'devops', files: ['Courses/devops.json'] },
  'מנהלעסקיםחובה': { id: 'business-management', files: ['Courses/business management.json'] },
};

const scanPath = process.argv[2];
if (!scanPath) {
  console.error('usage: node scripts/compare-scan.mjs <all-tracks.json>');
  process.exit(1);
}

const scan = JSON.parse(readFileSync(scanPath, 'utf8'));
const readLessons = (files) =>
  files.flatMap((file) =>
    JSON.parse(readFileSync(path.join(ROOT, file), 'utf8')).courses.flatMap((c) => c.lessons),
  );

console.log(`scan ${scan.exportedAt} · ${scan.tracks.length} tracks`);
if (scan.problems?.length) {
  console.log(`\nproblems reported by the scan:`);
  for (const problem of scan.problems) console.log(`  ! ${problem}`);
}

let drifted = 0;
console.log('\ntracks in the schedule builder:');
for (const track of scan.tracks) {
  const local = TRACK_FILES[track.slug];
  if (!local) continue;

  const here = readLessons(local.files);
  const there = track.courses.flatMap((c) => c.lessons);
  const hereSet = new Set(here);
  const thereSet = new Set(there);
  const added = there.filter((l) => !hereSet.has(l));
  const removed = here.filter((l) => !thereSet.has(l));

  if (!added.length && !removed.length) {
    const sameOrder = here.every((lesson, i) => lesson === there[i]);
    console.log(`  ${sameOrder ? '✓' : '~'} ${local.id}: ${here.length} lessons${sameOrder ? '' : ' (same lessons, different order)'}`);
    if (!sameOrder) drifted += 1;
    continue;
  }

  drifted += 1;
  console.log(`  ✗ ${local.id}: ${here.length} here, ${there.length} on the site`);
  for (const lesson of added) console.log(`      + ${lesson}`);
  for (const lesson of removed) console.log(`      - ${lesson}`);
}

const unknown = scan.tracks.filter((t) => !TRACK_FILES[t.slug]);
if (unknown.length) {
  console.log('\non the site, not in the schedule builder:');
  for (const track of unknown) {
    console.log(`  · ${track.name} (${track.slug}): ${track.courses.length} courses, ${track.lessonCount} lessons`);
  }
}

console.log(drifted ? `\n${drifted} track(s) differ from the site.` : '\nall tracks match the site.');
