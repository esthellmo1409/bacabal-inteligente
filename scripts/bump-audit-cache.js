const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'public');
const files = [
  'obras-ops.html', 'prefeito.html', 'secretaria.html', 'iluminacao.html',
  'saude.html', 'cidadao.html', 'limpeza.html', 'equipes.html', 'login.html',
];
for (const f of files) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) {
    console.log('skip', f);
    continue;
  }
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace(/app\.js\?v=[^"]+/g, 'app.js?v=audit-fix1');
  s = s.replace(/styles\.css\?v=[^"]+/g, 'styles.css?v=audit-fix1');
  if (f === 'login.html') {
    s = s.replace('href="/styles.css"', 'href="/styles.css?v=audit-fix1"');
    if (!s.includes('app.js?v=audit-fix1')) {
      s = s.replace(/app\.js(\?v=[^"]+)?/g, 'app.js?v=audit-fix1');
    }
  }
  fs.writeFileSync(p, s);
  console.log('ok', f);
}
