const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'math-app', 'public');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Replace /css/, /js/, /images/ with /math-app/css/, etc.
  content = content.replace(/"\/css\//g, '"/math-app/css/');
  content = content.replace(/"\/js\//g, '"/math-app/js/');
  content = content.replace(/"\/images\//g, '"/math-app/images/');
  content = content.replace(/'\/css\//g, "'/math-app/css/");
  content = content.replace(/'\/js\//g, "'/math-app/js/");
  content = content.replace(/'\/images\//g, "'/math-app/images/");
  // Replace dashboard.html, quiz.html links (don't break http://)
  content = content.replace(/"\/dashboard.html"/g, '"/dashboard.html"');
  content = content.replace(/"\/quiz.html"/g, '"/quiz.html"');
  content = content.replace(/"\/login.html"/g, '"/login.html"');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed', filePath);
  }
}

['index.html', 'dashboard.html', 'quiz.html', 'login.html'].forEach(f => {
  processFile(path.join(publicDir, f));
});

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const fullPath = path.join(dir, f);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.css') || fullPath.endsWith('.html')) {
      processFile(fullPath);
    }
  }
}

processDir(path.join(publicDir, 'js'));
processDir(path.join(publicDir, 'css'));
