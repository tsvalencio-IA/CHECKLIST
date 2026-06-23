const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist-apk');
const keep = ['index.html','checklist.html','login.html','manifest.webmanifest','service-worker.js','js','data','assets'];
function rm(p){ if(fs.existsSync(p)) fs.rmSync(p,{recursive:true,force:true}); }
function cp(src,dst){ const st=fs.statSync(src); if(st.isDirectory()){ fs.mkdirSync(dst,{recursive:true}); for(const f of fs.readdirSync(src)) cp(path.join(src,f), path.join(dst,f)); } else { fs.mkdirSync(path.dirname(dst),{recursive:true}); fs.copyFileSync(src,dst); } }
rm(out); fs.mkdirSync(out,{recursive:true});
for(const name of keep){ cp(path.join(root,name), path.join(out,name)); }
console.log('dist-apk pronto para APK nativo. Entrada principal: index.html -> Checklist:', out);
