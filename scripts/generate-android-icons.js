const fs = require('fs');
const path = require('path');

const root = process.cwd();
const androidRes = path.join(root, 'android', 'app', 'src', 'main', 'res');
const iconMap = [
  ['mipmap-mdpi', 'checklist-72.png'],
  ['mipmap-hdpi', 'checklist-72.png'],
  ['mipmap-xhdpi', 'checklist-96.png'],
  ['mipmap-xxhdpi', 'checklist-144.png'],
  ['mipmap-xxxhdpi', 'checklist-192.png']
];

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) throw new Error(`Arquivo de ícone não encontrado: ${src}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

for (const [folder, file] of iconMap) {
  const src = path.join(root, 'assets', 'icons', file);
  const dest = path.join(androidRes, folder, 'ic_launcher.png');
  copyIfExists(src, dest);
  copyIfExists(src, path.join(androidRes, folder, 'ic_launcher_round.png'));
  copyIfExists(src, path.join(androidRes, folder, 'ic_launcher_foreground.png'));
}

const valuesDir = path.join(androidRes, 'values');
fs.mkdirSync(valuesDir, { recursive: true });
const stringsPath = path.join(valuesDir, 'strings.xml');
fs.writeFileSync(stringsPath, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">Checklist Inteligente</string>\n    <string name="title_activity_main">Checklist Inteligente</string>\n    <string name="package_name">br.com.thiaguinhosolucoes.oficinia.checklist.v15githubpages</string>\n    <string name="custom_url_scheme">br.com.thiaguinhosolucoes.oficinia.checklist.v15githubpages</string>\n</resources>\n`);

console.log('Ícones Android e nome do app aplicados.');
