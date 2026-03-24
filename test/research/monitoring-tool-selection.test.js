/**
 * Test for ADR-002 / monitoring-tool-selection.md existence and content.
 * Story: FACTORY-YAAF-F016-S01
 */

const fs = require('fs');
const path = require('path');

const docPath = path.join(process.cwd(), 'docs', 'decisions', 'monitoring-tool-selection.md');

console.log('Test: monitoring-tool-selection.md exists and is valid');

if (!fs.existsSync(docPath)) {
  console.error('FAIL: Document not found at', docPath);
  process.exit(1);
}

const content = fs.readFileSync(docPath, 'utf8');

const requiredSections = [
  'Status',
  'Context',
  'Decision',
  'Consequences',
  'Alternatives Considered'
];

for (const section of requiredSections) {
  if (!content.includes(section)) {
    console.error(`FAIL: Missing section: ${section}`);
    process.exit(1);
  }
}

const requiredKeywords = [
  'codexbar',
  'session_status',
  'gateway',
  'Aggregator',
  'MetricCollector',
  'hourly',
  'daily',
  'sliding window',
  'in-memory',
  'zero persistence',
  'S02',
  'S03'
];

for (const keyword of requiredKeywords) {
  if (!content.toLowerCase().includes(keyword.toLowerCase())) {
    console.error(`FAIL: Missing keyword: ${keyword}`);
    process.exit(1);
  }
}

console.log('Document exists and contains all required sections and keywords.');
console.log('PASS');
