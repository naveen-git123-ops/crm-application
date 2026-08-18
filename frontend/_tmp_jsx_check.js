// Parse the Requirement Analysis component with the project's Babel to catch JSX errors.
const fs = require('fs');
const babel = require('@babel/core');

const files = [
  'src/components/leads/carryOrder/CarryOrderWorkspace.js',
  'src/lib/carryOrderWorkflow.js',
];

let failed = false;
for (const file of files) {
  try {
    babel.transformSync(fs.readFileSync(file, 'utf8'), {
      filename: file,
      presets: [require.resolve('@babel/preset-react')],
      configFile: false,
      babelrc: false,
    });
    console.log('OK', file);
  } catch (err) {
    failed = true;
    console.error('FAIL', file, '\n', err.message);
  }
}
process.exit(failed ? 1 : 0);
