// Test that the embed.js output is valid JavaScript
const router = require('./src/routes/widget.js');

const mockReq = {
  protocol: 'https',
  get: function() { return 'test.railway.app'; }
};

let scriptContent = '';
const mockRes = {
  setHeader: function() {},
  send: function(s) { scriptContent = s; }
};

// Find the /embed.js route handler
const embedLayer = router.stack.find(function(l) {
  return l.route && l.route.path === '/embed.js';
});

if (!embedLayer) {
  console.log('FAIL: embed.js route not found in router stack');
  process.exit(1);
}

embedLayer.route.stack[0].handle(mockReq, mockRes);

if (!scriptContent) {
  console.log('FAIL: script content is empty');
  process.exit(1);
}

try {
  new Function(scriptContent);
  var ob = 0, cb = 0;
  for (var i = 0; i < scriptContent.length; i++) {
    if (scriptContent[i] === '{') ob++;
    if (scriptContent[i] === '}') cb++;
  }
  console.log('SUCCESS: JS is valid!');
  console.log('Length:', scriptContent.length, 'chars');
  console.log('Open braces:', ob, ' Close braces:', cb, ' Diff:', ob - cb);

  // Check for real newline in split
  var splitOK = scriptContent.indexOf("split('\\n')") >= 0;
  console.log('Good newline split:', splitOK ? 'YES - OK' : 'NOT FOUND - check manually');

  // Check voice recognition
  var hasVoice = scriptContent.indexOf('SpeechRecognition') >= 0;
  console.log('Voice input code:', hasVoice ? 'YES - present' : 'MISSING');

} catch (e) {
  console.log('FAIL: JS parse error:', e.message);
  var lines = scriptContent.split('\n');
  var found = false;
  for (var j = 0; j < lines.length; j++) {
    try {
      new Function(lines.slice(0, j + 1).join('\n'));
    } catch (e2) {
      if (!found) {
        console.log('First error at line', j + 1, ':', lines[j]);
        found = true;
      }
    }
  }
  process.exit(1);
}
