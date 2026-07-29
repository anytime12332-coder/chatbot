// Direct test - extract and validate the embed script without starting a server
// Run as: node test_widget_direct.js (from server directory)
const path = require('path');

// Directly read and evaluate the widget.js to extract the script lines array
const fs = require('fs');
const widgetSrc = fs.readFileSync(path.join(__dirname, 'src/routes/widget.js'), 'utf8');

// The lines array is constructed in the source — we can extract it by evaluating
// the relevant portion. The widget.js uses a `lines` array and joins it.
// Instead of running it, let's simulate it:

const serverUrl = 'https://test.railway.app';

// Find the lines array in the source and eval it
// The lines array starts after "const lines = [" and ends at "].join"
const linesStart = widgetSrc.indexOf('const lines = [');
const linesEnd   = widgetSrc.indexOf('].join(');

if (linesStart < 0 || linesEnd < 0) {
  console.log('Could not find lines array in source');
  process.exit(1);
}

// Extract just the array
const arrSrc = widgetSrc.slice(linesStart, linesEnd + 1) + ']';

// Sub in serverUrl
const evalSrc = arrSrc.replace("'" + serverUrl + "'", "'" + serverUrl + "'");

let scriptLines;
try {
  // eslint-disable-next-line no-eval
  eval('scriptLines = ' + evalSrc.replace('const lines = ', ''));
} catch(e) {
  // Use a different approach - just join what we can infer from the file
  console.log('Eval approach failed, using regex scan');
  scriptLines = null;
}

if (!scriptLines) {
  console.log('Scanning widget.js for the key patterns...');
  const hasSplitN = widgetSrc.includes("split('\\\\n')");  // bad: double-escaped
  const hasSplitGood = widgetSrc.includes("\"split('\\\\n')\"");  // good: in string
  console.log('Raw source contains split newline string in lines array:', widgetSrc.includes("\"var parts = buf.split('\\\\n');\","));
  console.log('Raw source snippet around split:');
  const idx = widgetSrc.indexOf("buf.split(");
  if (idx >= 0) {
    console.log(widgetSrc.slice(idx, idx + 60));
  }
  process.exit(0);
}

const script = scriptLines.join('\n');
try {
  new Function(script);
  let ob = 0, cb = 0;
  for (let i = 0; i < script.length; i++) {
    if (script[i] === '{') ob++;
    if (script[i] === '}') cb++;
  }
  console.log('SUCCESS: JS is valid!');
  console.log('Length:', script.length, 'chars, brace diff:', ob - cb);
} catch(e) {
  console.log('FAIL:', e.message);
}
