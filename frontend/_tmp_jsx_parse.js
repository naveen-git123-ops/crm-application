// Parse-only check for the workspace JSX (no bundling, no dev server).
const fs = require('fs');
const parser = require('@babel/parser');

const files = [
  'src/components/leads/carryOrder/CarryOrderWorkspace.js',
  'src/lib/carryOrderWorkflow.js',
];

for (const file of files) {
  parser.parse(fs.readFileSync(file, 'utf8'), {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
  });
  console.log(`OK ${file}`);
}
