const fs = require('fs');
const limpeza = fs.readFileSync('public/limpeza.html', 'utf8');
console.log('limpeza', limpeza.length, limpeza.includes('secConcluidos'));
const pre = fs.readFileSync('public/prefeito.html', 'utf8');
let d = 0;
let min = 0;
const re = /<\/?div\b[^>]*>/gi;
let m;
while ((m = re.exec(pre))) {
  if (m[0].startsWith('</')) d -= 1;
  else d += 1;
  min = Math.min(min, d);
}
console.log('prefeito div end', d, 'min', min);
require('./lib/rotas-modulos.js');
console.log('modules load ok');
