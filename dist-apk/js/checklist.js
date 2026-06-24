(function(){
'use strict';

const $ = id => document.getElementById(id);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const APP = window.CHECKLIST_APP || {};
const SESSION_KEY = 'OFICINIA_CHECKLIST_V15_SESSION';
const DRAFT_KEY = 'OFICINIA_CHECKLIST_V15_DRAFT';
const MODEL_KEY = 'OFICINIA_CHECKLIST_V15_MODEL';
const THEME_KEY = 'OFICINIA_CHECKLIST_V15_THEME';
const DEFAULT_BRAND = { name:'Checklist Inteligente OFICIN-IA', subtitle:'App separado • APK próprio • mesmo Firebase', color:'#2563eb', footer:'Powered by thIAguinho Soluções Digitais' };
const ACTIONS_FINAL = new Set(['atencao','trocar','retificar','regular','ajustar','lubrificar','limpar','revisar']);

const state = {
  model:null,
  dbCentral:null,
  dbActive:null,
  session:null,
  screen:'screenLogin',
  activeSection:'',
  answers:{},
  itemPhotos:{},
  generalPhotos:[],
  delivery:{},
  history:{os:[], checklists:[], entregas:[]},
  consulta:[],
  lastSavedId:'',
  mediaRecorder:null,
  audioChunks:[],
  audioUrl:'',
  installPrompt:null,
  theme: localStorage.getItem(THEME_KEY) || 'light'
};

const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const placaNorm = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
const nowISO = () => new Date().toISOString();
const fmtDateTime = v => { try { const d = v && v.toDate ? v.toDate() : new Date(v || Date.now()); return d.toLocaleString('pt-BR'); } catch(e){ return '-'; } };
const fmtDate = v => { try { const d = v && v.toDate ? v.toDate() : new Date(v || Date.now()); return d.toLocaleDateString('pt-BR'); } catch(e){ return '-'; } };
const uid = () => 'chk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);

function toast(msg){ const t=$('toast'); if(!t) return; t.textContent=String(msg||''); t.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('show'),3000); }
function showErr(msg){ const e=$('loginErro'); if(e){ e.textContent=msg; e.classList.remove('hidden'); } }
function hideErr(){ $('loginErro')?.classList.add('hidden'); }
function setBusy(id,busy,label){ const b=$(id); if(!b) return; if(busy){ b.dataset.old=b.textContent; b.textContent=label||'Aguarde...'; b.disabled=true; } else { b.disabled=false; if(b.dataset.old) b.textContent=b.dataset.old; } }
function downloadText(name, text, type='application/json;charset=utf-8'){ const blob=new Blob([text],{type}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
function onlyFinite(v){ const n=Number(v); return Number.isFinite(n)?n:0; }

function applyTheme(){ document.documentElement.dataset.theme = state.theme; localStorage.setItem(THEME_KEY,state.theme); }
function applyBrand(brand={}){
  const b = {...DEFAULT_BRAND, ...(brand||{})};
  document.documentElement.style.setProperty('--brand', b.color || '#2563eb');
  $('brandName').textContent = b.name || DEFAULT_BRAND.name;
  $('brandSub').textContent = b.subtitle || 'Repositório separado • APK próprio • mesmo Firebase';
  $('footerBrand').textContent = b.footer || APP.footer || DEFAULT_BRAND.footer;
}

function appFirebase(){
  if(!window.firebase) throw new Error('Firebase não carregou. Verifique internet/CDN.');
  let app = firebase.apps.find(a => a.name === '[DEFAULT]');
  if(!app) app = firebase.initializeApp(APP.firebaseConfig);
  return app;
}
function centralDb(){ if(!state.dbCentral) state.dbCentral = appFirebase().firestore(); return state.dbCentral; }
function dbFromConfig(cfg){
  if(!cfg || !cfg.apiKey || !cfg.projectId) return centralDb();
  const name = 'tenant_' + String(cfg.projectId).replace(/[^a-z0-9_]/gi,'_');
  let app = firebase.apps.find(a => a.name === name);
  if(!app) app = firebase.initializeApp(cfg, name);
  return app.firestore();
}
function activeDb(){
  if(state.dbActive) return state.dbActive;
  const sess = state.session || loadSession(false);
  state.dbActive = sess && sess.firebaseConfig ? dbFromConfig(sess.firebaseConfig) : centralDb();
  return state.dbActive;
}

function roleAllowed(role){
  const r=norm(role);
  if(!r || r.includes('cliente')) return false;
  return (APP.rolesPermitidos||[]).some(x => r.includes(norm(x)));
}
function isGestor(){
  const r=norm(state.session?.role || state.session?.cargo || '');
  return (APP.rolesGestao||[]).some(x => r.includes(norm(x)));
}
function sessionOk(sess){ return !!(sess && sess.tenantId && sess.name && roleAllowed(sess.role) && (!sess.expiresAt || Date.now() < sess.expiresAt)); }
function loadSession(apply=true){
  let sess=null;
  try{ sess = JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || 'null'); }catch(e){ sess=null; }
  if(!sessionOk(sess)) sess=null;
  if(apply){ state.session=sess; state.dbActive=null; applySessionUi(); }
  return sess;
}
function saveSession(sess, remember){
  const clean = {...sess, expiresAt: Date.now()+1000*60*60*24*7};
  delete clean.password; delete clean.senha; delete clean.pwd;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(clean));
  if(remember) localStorage.setItem(SESSION_KEY, JSON.stringify(clean)); else localStorage.removeItem(SESSION_KEY);
  localStorage.setItem('OFICINIA_CHECKLIST_V15_LAST_USER', clean.login || clean.email || '');
  state.session=clean; state.dbActive=null; applySessionUi();
}
function clearSession(){ sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); state.session=null; state.dbActive=null; state.answers={}; state.delivery={}; saveDraft(); applySessionUi(); go('screenLogin'); }
function applySessionUi(){
  const s=state.session;
  $('sessPill').textContent = s ? `✅ ${s.name} • ${s.role}` : '🔒 Bloqueado';
  $('responsavel').value = s ? s.name : '';
  $('conferente').value = s ? s.name : '';
  $('btnLogout')?.classList.toggle('hidden', !s);
  $('btnHomeTop')?.classList.toggle('hidden', !s);
  applyBrand(s?.brand || DEFAULT_BRAND);
}

async function firstQuery(db, col, fields, value){
  for(const f of fields){
    try{ const snap = await db.collection(col).where(f,'==',value).limit(1).get(); if(!snap.empty) return snap.docs[0]; }catch(e){ console.warn('query fail',col,f,e.message); }
  }
  return null;
}
function oficinaBrand(d){ return { name:d.brandName||d.nomeFantasia||d.nome||'OFICIN-IA Checklist', subtitle:d.brandTagline||'Checklist técnico integrado ao SaaS', color:d.brandColor||'#2563eb', footer:d.brandFooter||`${d.nomeFantasia||d.nome||'Oficina'} · Powered by thIAguinho Soluções Digitais` }; }
function oficinaSess(doc,d,role='gestor',name='Gestor'){ return { tenantId:doc.id, oficinaId:doc.id, oficinaNome:d.nomeFantasia||d.nome||'Oficina', role, cargo:role, name, login:name, brand:oficinaBrand(d), firebaseConfig:d.firebaseConfig&&d.firebaseConfig.apiKey?d.firebaseConfig:null, actorType:'checklist', createdAt:nowISO() }; }
function senhaBate(docData,pwd){ const campos=['senha','password','adminSenha','senhaAdmin','pwd']; return campos.some(k => String(docData?.[k]||'') === String(pwd||'')); }
function cargoLabel(v){ const r=norm(v||'mecanico'); if(r.includes('geren')) return 'gerente'; if(r.includes('gest')) return 'gestor'; if(r.includes('admin')) return 'admin'; if(r.includes('tec')) return 'tecnico'; return 'mecanico'; }
function funcionarioSess(docF,dF,ofDoc,ofData){ const role=cargoLabel(dF.cargo||dF.role||dF.perfil||'mecanico'); return { tenantId:ofDoc.id, oficinaId:ofDoc.id, oficinaNome:ofData.nomeFantasia||ofData.nome||'Oficina', role, cargo:role, name:dF.nome||dF.name||dF.usuario||dF.email||'Funcionário', login:dF.usuario||dF.login||dF.email||'', funcionarioId:docF.id, brand:oficinaBrand(ofData), firebaseConfig:ofData.firebaseConfig&&ofData.firebaseConfig.apiKey?ofData.firebaseConfig:null, actorType:'checklist', createdAt:nowISO() }; }

async function loginPorOficina(usr,pwd){
  const db=centralDb();
  const valEmail=usr.toLowerCase();
  const doc = await firstQuery(db,'oficinas',['usuario','login','email','adminEmail','ownerEmail'], usr) || await firstQuery(db,'oficinas',['email','adminEmail','ownerEmail'], valEmail);
  if(!doc) return null;
  const d=doc.data()||{};
  if(String(d.status||'').toLowerCase().includes('bloque')) throw new Error('Oficina bloqueada no SaaS.');
  if(!senhaBate(d,pwd) && !usr.includes('@')) throw new Error('Senha incorreta para a oficina.');
  if(!senhaBate(d,pwd) && usr.includes('@')) return null;
  return oficinaSess(doc,d,'gestor',d.adminNome||d.nomeResponsavel||usr);
}
async function loginFuncionarioCentral(usr,pwd){
  const db=centralDb();
  const doc = await firstQuery(db,'funcionarios',['usuario','login','email'], usr) || await firstQuery(db,'funcionarios',['email'], usr.toLowerCase());
  if(!doc) return null;
  const d=doc.data()||{};
  if(!senhaBate(d,pwd)) throw new Error('Senha incorreta para funcionário.');
  const tenantId=d.tenantId||d.oficinaId||d.tid;
  if(!tenantId) throw new Error('Funcionário encontrado, mas sem tenant/oficina vinculada.');
  const ofDoc=await db.collection('oficinas').doc(tenantId).get();
  if(!ofDoc.exists) throw new Error('Oficina vinculada ao funcionário não encontrada.');
  const ofData=ofDoc.data()||{};
  if(String(ofData.status||'').toLowerCase().includes('bloque')) throw new Error('Oficina bloqueada no SaaS.');
  return funcionarioSess(doc,d,ofDoc,ofData);
}
async function loginFuncionarioTenant(usr,pwd){
  const db=centralDb();
  let oficinas=[];
  try{ const snap=await db.collection('oficinas').limit(80).get(); oficinas=snap.docs; }catch(e){ oficinas=[]; }
  for(const ofDoc of oficinas){
    const ofData=ofDoc.data()||{};
    if(String(ofData.status||'').toLowerCase().includes('bloque')) continue;
    const tdb = ofData.firebaseConfig && ofData.firebaseConfig.apiKey ? dbFromConfig(ofData.firebaseConfig) : db;
    try{
      const doc = await firstQuery(tdb,'funcionarios',['usuario','login','email'], usr) || await firstQuery(tdb,'funcionarios',['email'], usr.toLowerCase());
      if(doc){ const d=doc.data()||{}; if(!senhaBate(d,pwd)) throw new Error('Senha incorreta para funcionário.'); return funcionarioSess(doc,d,ofDoc,ofData); }
    }catch(e){ if(String(e.message||'').includes('Senha incorreta')) throw e; console.warn('tenant login',ofDoc.id,e.message); }
  }
  return null;
}
async function loginFirebaseEmail(usr,pwd){
  if(!usr.includes('@')) return null;
  const app=appFirebase();
  await app.auth().signInWithEmailAndPassword(usr,pwd);
  const email=usr.toLowerCase();
  const db=centralDb();
  const checks=[
    ['usuariosAutorizados',['email']],['admins',['email']],['usuarios',['email']],['funcionarios',['email']],['oficinas',['adminEmail','email','ownerEmail']]
  ];
  for(const [col,fields] of checks){
    const doc=await firstQuery(db,col,fields,email);
    if(!doc) continue;
    const d=doc.data()||{};
    if(col==='oficinas') return oficinaSess(doc,d,'gestor',d.adminNome||email);
    const tenantId=d.tenantId||d.oficinaId||d.tid;
    if(tenantId){
      const ofDoc=await db.collection('oficinas').doc(tenantId).get();
      if(ofDoc.exists) return funcionarioSess(doc,d,ofDoc,ofDoc.data()||{});
    }
    const role=cargoLabel(d.role||d.cargo||d.perfil||'admin');
    if(!roleAllowed(role)) break;
    return {tenantId:d.tenantId||'MASTER_ADMIN', oficinaId:d.tenantId||'MASTER_ADMIN', oficinaNome:d.oficinaNome||'OFICIN-IA', role, cargo:role, name:d.nome||d.name||email, login:email, email, brand:DEFAULT_BRAND, actorType:'checklist', createdAt:nowISO()};
  }
  throw new Error('E-mail autentica no Firebase, mas não tem perfil autorizado no SaaS para Checklist.');
}
async function login(){
  hideErr();
  const usr=($('loginUsr').value||'').trim(); const pwd=($('loginPwd').value||'').trim(); const remember=$('loginRemember').checked;
  if(!usr || !pwd) return showErr('Informe usuário/e-mail e senha.');
  if(!$('loginLgpd').checked) return showErr('Confirme o uso interno técnico autorizado.');
  setBusy('btnLogin',true,'Autenticando...');
  try{
    let sess = await loginPorOficina(usr,pwd);
    if(!sess) sess = await loginFuncionarioCentral(usr,pwd);
    if(!sess) sess = await loginFuncionarioTenant(usr,pwd);
    if(!sess) sess = await loginFirebaseEmail(usr,pwd);
    if(!sessionOk(sess)) throw new Error('Perfil não autorizado para acessar checklist.');
    saveSession(sess,remember);
    await loadModel(true);
    restoreDraft();
    applyQueryPrefill();
    renderAll();
    go('screenInicio');
    toast('Login autorizado.');
  }catch(e){ console.error(e); showErr(e.message || 'Falha no login.'); }
  finally{ setBusy('btnLogin',false); }
}

async function loadModel(tryRemote=false){
  let model=null;
  try{ const res=await fetch('./data/checklist-model.json?v=15.0.0',{cache:'no-store'}); model=await res.json(); }catch(e){ console.warn('model local',e); }
  try{ const saved=JSON.parse(localStorage.getItem(MODEL_KEY)||'null'); if(saved && saved.secoes) model=saved; }catch(e){}
  if(tryRemote && state.session){
    try{
      const doc=await activeDb().collection('checklistModelos').doc('default').get();
      if(doc.exists && doc.data()?.model?.secoes){ model=doc.data().model; localStorage.setItem(MODEL_KEY,JSON.stringify(model)); }
    }catch(e){ console.warn('modelo remoto indisponível',e.message); }
  }
  state.model=model || {versao:'fallback',acoesPadrao:[],sintomas:[],secoes:[]};
  if(!state.activeSection && state.model.secoes?.length) state.activeSection=state.model.secoes[0].id;
}
async function saveModelRemote(auditoria={}){
  localStorage.setItem(MODEL_KEY, JSON.stringify(state.model));
  try{
    await activeDb().collection('checklistModelos').doc('default').set({model:state.model, atualizadoEm:firebase.firestore.FieldValue.serverTimestamp(), atualizadoPor:state.session?.name||'', perfil:state.session?.role||'', auditoria}, {merge:true});
    toast('Modelo salvo para a oficina.');
  }catch(e){ console.warn(e); toast('Modelo salvo localmente. Firebase bloqueou ou está offline.'); }
}

function itemMap(){ const m={}; (state.model?.secoes||[]).forEach(sec => (sec.itens||[]).forEach(it => { m[it.id]={...it, secaoId:sec.id, secaoTitulo:sec.titulo, secaoEmoji:sec.emoji}; })); return m; }
function actionInfo(id){ return (state.model?.acoesPadrao||[]).find(a=>a.id===id) || {id,label:id,emoji:'•',classe:'info'}; }
function allChecklistItems(){
  const out=[];
  (state.model?.secoes||[]).forEach(sec => (sec.itens||[]).forEach(it => out.push({...it, secaoId:sec.id, secaoTitulo:sec.titulo})));
  return out;
}
function sectionStats(sec){
  const items=sec?.itens||[];
  const done=items.filter(it=>!!state.answers[it.id]?.acao).length;
  const pending=Math.max(items.length-done,0);
  const firstPending=items.find(it=>!state.answers[it.id]?.acao);
  return {total:items.length, done, pending, complete:items.length>0 && pending===0, firstPending};
}
function firstPendingItem(){
  for(const sec of (state.model?.secoes||[])){
    const st=sectionStats(sec);
    if(st.pending>0) return {sec, item:st.firstPending, pending:st.pending};
  }
  return null;
}
function stats(){
  const allItems=allChecklistItems(); const answers=Object.values(state.answers||{});
  const total=allItems.length;
  const answered=allItems.filter(it => state.answers[it.id]?.acao).length;
  const pending=Math.max(total-answered,0);
  return {
    ok:answers.filter(a=>a.acao==='ok').length,
    atencao:answers.filter(a=>a.acao==='atencao').length,
    trocar:answers.filter(a=>a.acao==='trocar').length,
    tecnicas:answers.filter(a=>ACTIONS_FINAL.has(a.acao) && a.acao!=='atencao' && a.acao!=='trocar').length,
    pending,
    percent:total?Math.round((answered/total)*100):0
  };
}
function saveDraft(){
  const draft={answers:state.answers,itemPhotos:state.itemPhotos,generalPhotos:state.generalPhotos,delivery:state.delivery,placa:$('placa')?.value||'',osRef:$('osRef')?.value||'',km:$('km')?.value||'',relato:$('relato')?.value||'',diagnostico:$('diagnostico')?.value||'',activeSection:state.activeSection,audioUrl:state.audioUrl};
  localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));
}
function restoreDraft(){
  try{
    const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null'); if(!d) return;
    state.answers=d.answers||{}; state.itemPhotos=d.itemPhotos||{}; state.generalPhotos=d.generalPhotos||[]; state.delivery=d.delivery||{}; state.activeSection=d.activeSection||state.activeSection; state.audioUrl=d.audioUrl||'';
    if($('placa')) $('placa').value=d.placa||''; if($('osRef')) $('osRef').value=d.osRef||''; if($('km')) $('km').value=d.km||''; if($('relato')) $('relato').value=d.relato||''; if($('diagnostico')) $('diagnostico').value=d.diagnostico||'';
  }catch(e){}
}
function clearDraft(){ localStorage.removeItem(DRAFT_KEY); state.answers={}; state.itemPhotos={}; state.generalPhotos=[]; state.delivery={}; state.history={os:[],checklists:[],entregas:[]}; state.lastSavedId=''; ['placa','osRef','km','relato','diagnostico'].forEach(id=>{ if($(id)) $(id).value=''; }); renderAll(); }

function go(screen){
  if(screen!=='screenLogin' && !sessionOk(state.session||loadSession(false))) screen='screenLogin';
  state.screen=screen;
  ['screenLogin','screenInicio','screenConsulta','screenChecklist','screenMidia','screenResumo','screenEntrega'].forEach(id=>$(id)?.classList.add('hidden'));
  $(screen)?.classList.remove('hidden');
  $('bottomNav')?.classList.toggle('hidden', screen==='screenLogin' || screen==='screenConsulta');
  $('btnBack').textContent = screen==='screenInicio' ? '🏠 Início' : '⬅️ Voltar';
  $('btnNext').textContent = screen==='screenResumo' ? 'Entrega ➜' : screen==='screenEntrega' ? 'Finalizar ✅' : 'Avançar ➜';
  renderAll(); window.scrollTo({top:0,behavior:'smooth'});
}

function applyQueryPrefill(){
  try{
    const q=new URLSearchParams(location.search||'');
    const placa=q.get('placa')||q.get('plate')||'';
    const os=q.get('os')||q.get('osRef')||q.get('ordem')||'';
    const km=q.get('km')||'';
    const relato=q.get('relato')||'';
    if(placa && $('placa') && !$('placa').value) $('placa').value=placaNorm(placa);
    if(os && $('osRef') && !$('osRef').value) $('osRef').value=String(os).trim();
    if(km && $('km') && !$('km').value) $('km').value=String(km).trim();
    if(relato && $('relato') && !$('relato').value) $('relato').value=String(relato).trim();
    if(placa||os||km||relato) saveDraft();
  }catch(e){ console.warn('query prefill',e); }
}
function next(){
  if(state.screen==='screenInicio') go('screenChecklist');
  else if(state.screen==='screenChecklist') {
    const pend=firstPendingItem();
    if(pend){
      state.activeSection=pend.sec.id;
      renderSections(); renderProgress(); saveDraft();
      setTimeout(()=>document.querySelector(`[data-section="${pend.sec.id}"]`)?.scrollIntoView({behavior:'smooth',block:'start'}),80);
      toast(`Ainda falta marcar ${pend.pending} item(ns) em ${pend.sec.titulo}. Marque OK, Atenção, Trocar, Revisar ou N/A.`);
      return;
    }
    go('screenMidia');
  }
  else if(state.screen==='screenMidia') { renderResumo(); go('screenResumo'); }
  else if(state.screen==='screenResumo') abrirEntrega();
  else if(state.screen==='screenEntrega') { toast('Checklist concluído. Salve/exports ou inicie novo.'); }
  else go('screenInicio');
}
function back(){ if(state.screen==='screenEntrega') go('screenResumo'); else if(state.screen==='screenResumo') go('screenMidia'); else if(state.screen==='screenMidia') go('screenChecklist'); else if(state.screen==='screenChecklist') go('screenInicio'); else go('screenInicio'); }
function irParaInicio(){
  if(!sessionOk(state.session||loadSession(false))) return go('screenLogin');
  saveDraft();
  go('screenInicio');
  toast('Início do Checklist. Seu rascunho foi mantido.');
}

function renderAll(){ renderSymptoms(); renderSections(); renderProgress(); renderPhotos(); renderDelivery(); }
function renderProgress(){
  const s=stats();
  if($('progressBar')) $('progressBar').style.width=s.percent+'%';
  if($('percentPill')) $('percentPill').textContent=s.percent+'% concluído';
  if($('kOk')) $('kOk').textContent=s.ok; if($('kAt')) $('kAt').textContent=s.atencao; if($('kTrocar')) $('kTrocar').textContent=s.trocar; if($('kAcoes')) $('kAcoes').textContent=s.tecnicas; if($('kPend')) $('kPend').textContent=s.pending;
  if($('btnNext') && state.screen==='screenChecklist') $('btnNext').textContent = s.pending ? `Pendentes (${s.pending})` : 'Avançar ➜';
}
function renderSymptoms(){
  const box=$('symptoms'); if(!box || !state.model) return;
  box.innerHTML=(state.model.sintomas||[]).map(s=>`<button class="sym" data-sym="${esc(s.id)}"><b>${esc(s.emoji||'🔎')}</b>${esc(s.label)}</button>`).join('');
  $$('[data-sym]',box).forEach(btn=>btn.addEventListener('click',()=>{ const s=(state.model.sintomas||[]).find(x=>x.id===btn.dataset.sym); if(!s) return; state.activeSection=s.abrir?.[0]||state.activeSection; renderSections(); setTimeout(()=>document.querySelector(`[data-section="${state.activeSection}"]`)?.scrollIntoView({behavior:'smooth',block:'start'}),80); }));
}
function renderSections(){
  const box=$('sections'); if(!box || !state.model) return;
  const q=norm($('buscaItem')?.value||'');
  const html=(state.model.secoes||[]).map(sec=>{
    const items=(sec.itens||[]).filter(it=>!q || norm(it.titulo+' '+it.hint+' '+sec.titulo).includes(q));
    if(q && !items.length) return '';
    const done=items.filter(it=>state.answers[it.id]?.acao).length;
    const fullStats=sectionStats(sec);
    const open = q || state.activeSection===sec.id;
    const footer = q ? '' : `<div class="section-footer ${fullStats.complete?'done':''}"><div><b>${fullStats.complete?'✅ Seção completa':'⚠️ Falta marcar '+fullStats.pending+' item(ns)'}</b><small>${fullStats.complete?'Você pode avançar quando quiser.':'Marque cada item desta seção como OK, Atenção, Trocar, Revisar ou N/A. O app não muda de seção sozinho.'}</small></div><button class="btn ${fullStats.complete?'ok':'secondary'} small" data-next-section="${esc(sec.id)}" ${fullStats.complete?'':'disabled'} type="button">${fullStats.complete?'Próxima seção ➜':'Complete a seção'}</button></div>`;
    return `<div class="section ${open?'open':''}" data-section="${esc(sec.id)}">
      <div class="section-head" data-open-section="${esc(sec.id)}"><h3>${esc(sec.emoji||'🔧')} ${esc(sec.titulo)}</h3><div style="display:flex;gap:7px;align-items:center"><span class="pill">${done}/${items.length}</span>${isGestor()?`<button class="btn secondary small" data-manage="${esc(sec.id)}" type="button">✏️ Editar</button>`:''}</div></div>
      <div class="section-body"><div class="notice">${esc(sec.hint||'')}</div>${items.map(it=>renderItem(sec,it)).join('')}${footer}</div>
    </div>`;
  }).join('');
  box.innerHTML=html || '<div class="notice warn">Nenhum item encontrado na pesquisa.</div>';
  $$('[data-open-section]').forEach(h=>h.addEventListener('click',e=>{ if(e.target.closest('[data-manage]')) return; state.activeSection=h.dataset.openSection; renderSections(); saveDraft(); }));
  $$('[data-manage]').forEach(b=>b.addEventListener('click',e=>{ e.stopPropagation(); openManager(b.dataset.manage); }));
  $$('[data-action]').forEach(b=>b.addEventListener('click',()=>setAction(b.dataset.item,b.dataset.action)));
  $$('[data-next-section]').forEach(b=>b.addEventListener('click',()=>goNextSection(b.dataset.nextSection)));
  $$('[data-obs]').forEach(t=>t.addEventListener('input',()=>{ ensureAnswer(t.dataset.obs).obs=t.value; saveDraft(); renderProgress(); }));
  $$('[data-dictate]').forEach(b=>b.addEventListener('click',()=>dictateToItem(b.dataset.dictate)));
  $$('[data-photo-item]').forEach(inp=>inp.addEventListener('change',e=>addItemPhotos(inp.dataset.photoItem,e.target.files)));
}
function renderItem(sec,it){
  const ans=state.answers[it.id]||{};
  const photos=state.itemPhotos[it.id]||[];
  const req=it.obrigatorio!==false?'<span class="pill bad">Obrigatório</span>':'';
  const crit=it.criticidade&&it.criticidade!=='normal'?`<span class="pill ${it.criticidade==='critico'?'bad':'warn'}">${esc(it.criticidade)}</span>`:'';
  return `<div class="item ${ans.acao?'has-action':''}" data-item-box="${esc(it.id)}">
    <div class="item-top"><div><div class="item-title">${esc(it.titulo)}</div>${it.hint?`<div class="item-hint">${esc(it.hint)}</div>`:''}<div class="badges">${req}${crit}</div></div><span class="pill ${actionInfo(ans.acao).classe||''}">${ans.acao?esc(actionInfo(ans.acao).emoji+' '+actionInfo(ans.acao).label):'Pendente'}</span></div>
    <div class="action-chips">${(it.acoes||['ok','atencao','trocar','na']).map(a=>{const ai=actionInfo(a); return `<button class="chip ${esc(ai.classe)} ${ans.acao===a?'on':''}" data-action="${esc(a)}" data-item="${esc(it.id)}" type="button">${esc(ai.emoji)} ${esc(ai.label)}</button>`}).join('')}</div>
    <div class="item-extra"><textarea data-obs="${esc(it.id)}" placeholder="Observação rápida deste item...">${esc(ans.obs||'')}</textarea><div class="micro-actions"><button class="btn secondary small" data-dictate="${esc(it.id)}" type="button">🗣️ Ditar obs.</button><label class="btn secondary small">📷 Foto do item<input data-photo-item="${esc(it.id)}" type="file" accept="image/*" capture="environment" multiple hidden></label></div>${photos.length?`<div class="photos">${photos.map(p=>`<img src="${esc(p)}" alt="foto">`).join('')}</div>`:''}</div>
  </div>`;
}
function ensureAnswer(itemId){
  if(!state.answers[itemId]){ const im=itemMap()[itemId]||{}; state.answers[itemId]={id:itemId,item:im.titulo||itemId,secao:im.secaoTitulo||'',secaoId:im.secaoId||'',acao:'',obs:'',updatedAt:nowISO(),updatedBy:state.session?.name||''}; }
  return state.answers[itemId];
}
function setAction(itemId,action){
  const im=itemMap()[itemId]||{}; const ans=ensureAnswer(itemId);
  ans.item=im.titulo||itemId; ans.secao=im.secaoTitulo||''; ans.secaoId=im.secaoId||''; ans.acao=action; ans.acaoLabel=actionInfo(action).label; ans.updatedAt=nowISO(); ans.updatedBy=state.session?.name||'';
  saveDraft();
  const sec=(state.model.secoes||[]).find(s=>s.id===im.secaoId);
  const completedAfter = sec ? sectionStats(sec).complete : false;
  renderSections(); renderProgress();
  if(completedAfter) toast('Seção completa. Ela não vai mudar sozinha; toque em “Próxima seção” para avançar.');
}
function goNextSection(secId){
  const secs=state.model?.secoes||[];
  const sec=secs.find(s=>s.id===secId);
  if(!sec) return;
  const st=sectionStats(sec);
  if(!st.complete){
    state.activeSection=sec.id; renderSections(); renderProgress();
    toast(`Falta marcar ${st.pending} item(ns) nesta seção. Use OK, Atenção, Trocar, Revisar ou N/A.`);
    return;
  }
  const idx=secs.findIndex(s=>s.id===secId);
  const nextSec=secs[idx+1];
  if(nextSec){
    state.activeSection=nextSec.id; saveDraft(); renderSections(); renderProgress();
    setTimeout(()=>document.querySelector(`[data-section="${nextSec.id}"]`)?.scrollIntoView({behavior:'smooth',block:'start'}),80);
  } else {
    toast('Todas as seções foram preenchidas. Você já pode avançar para relato, fotos e relatório.');
  }
}

function payloadBase(){
  const placa=placaNorm($('placa')?.value||'');
  const allItems=itemMap();
  const itens=Object.values(state.answers).map(a=>({...a, fotos:(state.itemPhotos[a.id]||[]).length, criticidade:allItems[a.id]?.criticidade||'normal', obrigatorio:allItems[a.id]?.obrigatorio!==false}));
  return { id:state.lastSavedId||uid(), app:'OFICIN-IA-CHECKLIST-V15-12', versao:state.model?.versao||'v15.12', tenantId:state.session?.tenantId||'', oficinaNome:state.session?.oficinaNome||'', placa, osRef:($('osRef')?.value||'').trim(), km:($('km')?.value||'').trim(), responsavel:state.session?.name||'', responsavelPerfil:state.session?.role||'', relato:($('relato')?.value||'').trim(), diagnostico:($('diagnostico')?.value||'').trim(), itens, fotosGerais:state.generalPhotos.length, temAudio:!!state.audioUrl, stats:stats(), criadoEm:nowISO(), atualizadoEm:nowISO() };
}
async function saveChecklist(){
  if(!placaNorm($('placa')?.value||'')) { toast('Informe a placa antes de salvar.'); go('screenInicio'); return null; }
  const payload=payloadBase(); setBusy('btnSalvar',true,'Salvando...');
  try{
    const db=activeDb();
    if(state.lastSavedId){ await db.collection('checklists').doc(state.lastSavedId).set(payload,{merge:true}); payload.id=state.lastSavedId; }
    else { const ref=await db.collection('checklists').add(payload); state.lastSavedId=ref.id; payload.id=ref.id; await ref.set({id:ref.id},{merge:true}); }
    localStorage.setItem('OFICINIA_CHECKLIST_LAST_'+payload.placa, JSON.stringify(payload));
    let msg='Checklist salvo no Firebase.';
    if(payload.osRef){
      const linked=await anexarPayloadNaOS(payload,false,true);
      msg = linked ? 'Checklist salvo e anexado na O.S. do Jarvis.' : 'Checklist salvo. Não encontrei a O.S. informada para anexar.';
    }
    toast(msg);
    renderResumo();
    return payload;
  }catch(e){ console.warn(e); localStorage.setItem('OFICINIA_CHECKLIST_LOCAL_'+payload.id, JSON.stringify(payload)); toast('Firebase bloqueou/offline. Checklist salvo localmente.'); return payload; }
  finally{ setBusy('btnSalvar',false); }
}
function renderResumo(){
  const box=$('resumoLista'); if(!box) return;
  const itens=payloadBase().itens;
  const crit=itens.filter(i=>ACTIONS_FINAL.has(i.acao));
  $('resumoPill').textContent = state.lastSavedId ? `Editando ${state.lastSavedId}` : `${crit.length} itens para relatório`;
  if($('btnSalvar')) $('btnSalvar').textContent = state.lastSavedId ? '💾 Salvar alterações' : '✅ Salvar checklist';
  if($('btnExcluirAtual')) $('btnExcluirAtual').disabled = !state.lastSavedId || !isGestor();
  box.innerHTML = `${state.lastSavedId?`<div class="notice warn"><b>Modo edição:</b> este checklist já foi salvo. Se alterar e tocar em “Salvar alterações”, o registro ${esc(state.lastSavedId)} será atualizado.</div>`:''}` + (crit.length ? crit.map(i=>`<div class="res-line"><b>${esc(i.secao)} • ${esc(i.item)}</b><span class="pill ${esc(actionInfo(i.acao).classe)}">${esc(actionInfo(i.acao).emoji)} ${esc(i.acaoLabel)}</span>${i.obs?`<small>${esc(i.obs)}</small>`:''}</div>`).join('') : '<div class="notice">Nenhum item crítico. Se necessário, gere PDF mesmo assim para registrar a avaliação.</div>');
}

async function buscarHistorico(){
  const placa=placaNorm($('placa').value); if(!placa){ toast('Informe a placa.'); return; }
  $('placa').value=placa; setBusy('btnHistorico',true,'Buscando...');
  const db=activeDb(); const out={os:[],checklists:[],entregas:[]};
  async function queryMany(col, fields){
    const res=[]; const seen=new Set();
    for(const f of fields){ try{ const snap=await db.collection(col).where(f,'==',placa).limit(15).get(); snap.docs.forEach(d=>{ if(!seen.has(d.id)){ seen.add(d.id); res.push({id:d.id,_col:col,...d.data()}); } }); }catch(e){ console.warn('hist',col,f,e.message); } }
    return res;
  }
  try{
    out.os = await queryMany('ordens_servico',['placa','placaNorm','veiculo.placa','dadosVeiculo.placa']);
    if(!out.os.length) out.os = await queryMany('ordensServico',['placa','placaNorm','veiculo.placa']);
    out.checklists = await queryMany('checklists',['placa','placaNorm']);
    out.entregas = await queryMany('checklistsEntrega',['placa','placaNorm']);
    state.history=out; renderHistorico();
  }catch(e){ console.warn(e); toast('Histórico indisponível. Checklist continua funcionando.'); }
  finally{ setBusy('btnHistorico',false); saveDraft(); }
}
function renderHistorico(){
  const box=$('historicoBox'); if(!box) return;
  const {os,checklists,entregas}=state.history;
  const html=[];
  html.push(`<div class="notice"><b>Histórico da placa ${esc(placaNorm($('placa').value))}</b><br>O.S.: ${os.length} • Checklists: ${checklists.length} • Entregas: ${entregas.length}</div>`);
  os.slice(0,8).forEach(o=>html.push(`<div class="hist"><b>O.S. ${esc(o.numero||o.codigo||o.osRef||o.id)}</b><small>${esc(o.clienteNome||o.cliente?.nome||o.nomeCliente||'Cliente não informado')} • ${esc(o.status||o.etapa||'status não informado')} • ${fmtDateTime(o.criadoEm||o.createdAt||o.data)}</small></div>`));
  checklists.slice(0,8).forEach(c=>html.push(`<div class="hist"><b>Checklist ${esc(c.id)}</b><small>${fmtDateTime(c.criadoEm||c.createdAt)} • ${esc(c.responsavel||c.mecanico||'')} • Trocar: ${onlyFinite(c.stats?.trocar)}</small><div class="actions"><button class="btn secondary small" data-load-hist="${esc(c.id)}" type="button">✏️ Editar</button><button class="btn secondary small" data-pdf-hist="${esc(c.id)}" type="button">📄 PDF</button>${isGestor()?`<button class="btn bad small" data-del-check="${esc(c.id)}" data-col="${esc(c._col||'checklists')}" type="button">🗑️ Excluir</button>`:''}</div></div>`));
  box.innerHTML=html.join('');
  $$('[data-del-check]',box).forEach(b=>b.addEventListener('click',()=>deleteChecklist(b.dataset.col,b.dataset.delCheck)));
  $$('[data-load-hist]',box).forEach(b=>b.addEventListener('click',()=>loadChecklistFromList(state.history.checklists,b.dataset.loadHist)));
  $$('[data-pdf-hist]',box).forEach(b=>b.addEventListener('click',()=>{ const c=(state.history.checklists||[]).find(x=>x.id===b.dataset.pdfHist); if(c) gerarPDF(c); }));
}
async function deleteChecklist(col,id){
  if(!isGestor()) return toast('Somente gestor/gerente/admin pode excluir.');
  if(!id) return toast('Nenhum checklist salvo selecionado.');
  if(!confirm('Excluir checklist salvo? A O.S. não será apagada.')) return;
  try{
    await activeDb().collection(col||'checklists').doc(id).delete();
    if(state.lastSavedId===id) state.lastSavedId='';
    state.consulta=state.consulta.filter(x=>x.id!==id);
    if(placaNorm($('placa')?.value||'')) await buscarHistorico();
    renderConsulta(); renderResumo();
    toast('Checklist excluído.');
  }catch(e){ console.warn(e); toast('Firebase não permitiu excluir. Confira regras de gestor.'); }
}
async function deleteCurrentChecklist(){
  if(!state.lastSavedId) return toast('Este checklist ainda não foi salvo no Firebase.');
  await deleteChecklist('checklists', state.lastSavedId);
}
async function consultar(){
  go('screenConsulta'); setBusy('btnRodarConsulta',true,'Pesquisando...');
  const db=activeDb(); const placa=placaNorm($('consultaPlaca').value || $('placa').value || ''); const qtd=Number($('consultaQtd').value||20); let res=[];
  try{
    if(placa){ const snap=await db.collection('checklists').where('placa','==',placa).limit(qtd).get(); res=snap.docs.map(d=>({id:d.id,_col:'checklists',...d.data()})); }
    else { const snap=await db.collection('checklists').limit(qtd).get(); res=snap.docs.map(d=>({id:d.id,_col:'checklists',...d.data()})); }
    const resp=norm($('consultaResp').value||''); if(resp) res=res.filter(x=>norm(x.responsavel||'').includes(resp));
    state.consulta=res; renderConsulta();
  }catch(e){ console.warn(e); $('consultaLista').innerHTML='<div class="notice bad">Consulta bloqueada pelo Firebase ou sem índice. Pesquise por placa.</div>'; }
  finally{ setBusy('btnRodarConsulta',false); }
}
function renderConsulta(){
  const box=$('consultaLista'); if(!box) return;
  if(!state.consulta.length){ box.innerHTML='<div class="notice warn">Nenhum checklist encontrado.</div>'; return; }
  box.innerHTML=state.consulta.map(c=>`<div class="hist"><b>${esc(c.placa||'-')} • ${esc(c.osRef||'sem O.S.')}</b><small>${fmtDateTime(c.criadoEm||c.createdAt)} • ${esc(c.responsavel||'')} • ${esc(c.oficinaNome||'')}</small><div class="badges"><span class="pill ok">OK ${onlyFinite(c.stats?.ok)}</span><span class="pill warn">Atenção ${onlyFinite(c.stats?.atencao)}</span><span class="pill bad">Trocar ${onlyFinite(c.stats?.trocar)}</span></div><div class="actions"><button class="btn secondary small" data-load-check="${esc(c.id)}" type="button">✏️ Editar</button><button class="btn secondary small" data-pdf-check="${esc(c.id)}" type="button">📄 PDF</button>${isGestor()?`<button class="btn bad small" data-del-check="${esc(c.id)}" data-col="checklists" type="button">🗑️ Excluir</button>`:''}</div></div>`).join('');
  $$('[data-del-check]',box).forEach(b=>b.addEventListener('click',()=>deleteChecklist(b.dataset.col,b.dataset.delCheck)));
  $$('[data-load-check]',box).forEach(b=>b.addEventListener('click',()=>loadChecklistFromConsulta(b.dataset.loadCheck)));
  $$('[data-pdf-check]',box).forEach(b=>b.addEventListener('click',()=>{ const c=state.consulta.find(x=>x.id===b.dataset.pdfCheck); if(c) gerarPDF(c); }));
}
function hydrateChecklistForEdit(c){
  if(!c) return;
  state.lastSavedId=c.id||'';
  state.answers={};
  (c.itens||[]).forEach(i=>{
    const id=i.id || i.checklistItemId || i.itemId;
    if(id) state.answers[id]={...i,id};
  });
  state.itemPhotos={}; state.generalPhotos=[];
  $('placa').value=c.placa||'';
  $('osRef').value=c.osRef||'';
  $('km').value=c.km||'';
  $('relato').value=c.relato||'';
  $('diagnostico').value=c.diagnostico||'';
  saveDraft(); renderAll(); renderResumo(); go('screenResumo');
  toast('Checklist carregado para edição. Ao salvar, ele será atualizado.');
}
function loadChecklistFromConsulta(id){ loadChecklistFromList(state.consulta,id); }
function loadChecklistFromList(list,id){
  const c=(list||[]).find(x=>x.id===id);
  if(!c) return toast('Checklist não encontrado nesta lista.');
  hydrateChecklistForEdit(c);
}

function getCriticalItems(){ return payloadBase().itens.filter(i=>ACTIONS_FINAL.has(i.acao)); }
function abrirEntrega(){ renderResumo(); renderDelivery(true); go('screenEntrega'); }
function renderDelivery(force=false){
  const box=$('entregaLista'); if(!box) return;
  const itens=getCriticalItems();
  if(force){ itens.forEach(i=>{ if(!state.delivery[i.id]) state.delivery[i.id]={status:'pendente',obs:'',item:i.item,acao:i.acaoLabel,secao:i.secao}; }); }
  const total=itens.length; const done=itens.filter(i=>['executado','conferido','na'].includes(state.delivery[i.id]?.status)).length; const pct=total?Math.round(done/total*100):100;
  $('entregaPill').textContent=pct+'% conferido';
  if(!itens.length){ box.innerHTML='<div class="notice">Sem itens críticos para entrega. É possível salvar a entrega como liberada.</div>'; return; }
  box.innerHTML=itens.map(i=>{ const d=state.delivery[i.id]||{status:'pendente',obs:''}; return `<div class="delivery-line"><b>${esc(i.secao)} • ${esc(i.item)}</b><div class="badges"><span class="pill ${esc(actionInfo(i.acao).classe)}">${esc(actionInfo(i.acao).emoji)} ${esc(i.acaoLabel)}</span></div>${i.obs?`<small>${esc(i.obs)}</small>`:''}<div class="delivery-actions"><button class="chip ok ${d.status==='executado'?'on':''}" data-delivery="${esc(i.id)}" data-dstatus="executado" type="button">✅ Executado</button><button class="chip warn ${d.status==='pendente'?'on':''}" data-delivery="${esc(i.id)}" data-dstatus="pendente" type="button">⚠️ Pendente</button><button class="chip info ${d.status==='conferido'?'on':''}" data-delivery="${esc(i.id)}" data-dstatus="conferido" type="button">🔎 Conferido</button></div><textarea data-delivery-obs="${esc(i.id)}" placeholder="Observação da entrega...">${esc(d.obs||'')}</textarea></div>`; }).join('');
  $$('[data-delivery]',box).forEach(b=>b.addEventListener('click',()=>{ const id=b.dataset.delivery; state.delivery[id]=state.delivery[id]||{}; state.delivery[id].status=b.dataset.dstatus; state.delivery[id].atualizadoPor=state.session?.name||''; state.delivery[id].atualizadoEm=nowISO(); saveDraft(); renderDelivery(); }));
  $$('[data-delivery-obs]',box).forEach(t=>t.addEventListener('input',()=>{ const id=t.dataset.deliveryObs; state.delivery[id]=state.delivery[id]||{}; state.delivery[id].obs=t.value; saveDraft(); }));
}
async function saveEntrega(){
  const base=payloadBase(); const itens=getCriticalItems().map(i=>({checklistItemId:i.id, item:i.item, secao:i.secao, acao:i.acao, acaoLabel:i.acaoLabel, diagnosticoObs:i.obs, entrega:state.delivery[i.id]||{status:'pendente'}}));
  const payload={id:uid(), checklistId:state.lastSavedId||base.id, tenantId:base.tenantId, oficinaNome:base.oficinaNome, placa:base.placa, osRef:base.osRef, km:base.km, conferente:state.session?.name||'', perfil:state.session?.role||'', status:$('entregaStatus').value, observacaoFinal:$('entregaObs').value||'', itens, criadoEm:nowISO(), app:'OFICIN-IA-CHECKLIST-V15'};
  setBusy('btnSalvarEntrega',true,'Salvando...');
  try{ const ref=await activeDb().collection('checklistsEntrega').add(payload); await ref.set({id:ref.id},{merge:true}); toast('Entrega salva no Firebase.'); return {...payload,id:ref.id}; }
  catch(e){ console.warn(e); localStorage.setItem('OFICINIA_ENTREGA_LOCAL_'+payload.id,JSON.stringify(payload)); toast('Entrega salva localmente. Firebase bloqueou/offline.'); return payload; }
  finally{ setBusy('btnSalvarEntrega',false); }
}

function pdfLine(doc,text,x,y,max=180){ const lines=doc.splitTextToSize(String(text||''),max); doc.text(lines,x,y); return y + lines.length*5; }
function pdfColorForAction(acao){
  if(acao==='ok') return [22,163,74];
  if(acao==='atencao') return [217,119,6];
  if(acao==='trocar') return [220,38,38];
  if(acao==='na') return [100,116,139];
  return [14,165,233];
}
function pdfShortForAction(acao){
  if(acao==='ok') return 'OK';
  if(acao==='atencao') return 'AT';
  if(acao==='trocar') return 'TR';
  if(acao==='retificar') return 'RET';
  if(acao==='regular') return 'REG';
  if(acao==='ajustar') return 'AJ';
  if(acao==='lubrificar') return 'LUB';
  if(acao==='limpar') return 'LIM';
  if(acao==='revisar') return 'REV';
  if(acao==='na') return 'N/A';
  return String(acao||'-').slice(0,3).toUpperCase();
}
function pdfEnsurePage(doc,y,footer=true){
  if(y<=270) return y;
  if(footer) pdfFooter(doc);
  doc.addPage();
  return 14;
}
function pdfFooter(doc){
  const pages=doc.internal.getNumberOfPages();
  doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(100,116,139);
  doc.text(`${APP.footer||'Powered by thIAguinho Soluções Digitais'} • Página ${pages}`,12,291);
}
function pdfSectionHeader(doc,sec,y){
  y=pdfEnsurePage(doc,y+3,false);
  doc.setFillColor(232,240,254); doc.roundedRect(10,y,190,9,2,2,'F');
  doc.setDrawColor(191,219,254); doc.roundedRect(10,y,190,9,2,2,'S');
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(15,23,42);
  doc.text(String(sec||'Geral'),14,y+6);
  return y+12;
}
function pdfStatusBadge(doc,acao,x,y){
  const c=pdfColorForAction(acao); const label=pdfShortForAction(acao);
  doc.setFillColor(c[0],c[1],c[2]); doc.roundedRect(x,y-4.4,16,6.4,2,2,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(255,255,255); doc.text(label,x+8,y-.1,{align:'center'});
}
function gerarPDF(source){
  const data=source||payloadBase(); const jsPDF=window.jspdf?.jsPDF; if(!jsPDF){ toast('Biblioteca PDF não carregou.'); return; }
  const doc=new jsPDF({unit:'mm',format:'a4'}); let y=0;
  // Capa/cabeçalho premium
  doc.setFillColor(15,23,42); doc.rect(0,0,210,30,'F');
  doc.setFillColor(37,99,235); doc.circle(17,15,7,'F');
  doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.text('CHECKLIST TÉCNICO INTELIGENTE',28,14);
  doc.setFontSize(8.5); doc.setFont('helvetica','normal'); doc.text('Avaliação técnica • histórico por placa • relatório integrado à O.S.',28,21);
  doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.text('OFICIN-IA',17,16,{align:'center'});

  y=38;
  doc.setFillColor(248,250,252); doc.roundedRect(10,y,190,24,3,3,'F'); doc.setDrawColor(226,232,240); doc.roundedRect(10,y,190,24,3,3,'S');
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(71,85,105);
  doc.text('PLACA',16,y+7); doc.text('O.S.',56,y+7); doc.text('KM',96,y+7); doc.text('RESPONSÁVEL',128,y+7);
  doc.setTextColor(15,23,42); doc.setFontSize(12);
  doc.text(String(data.placa||'-'),16,y+16); doc.text(String(data.osRef||'-'),56,y+16); doc.text(String(data.km||'-'),96,y+16); doc.text(String(data.responsavel||state.session?.name||'-').slice(0,28),128,y+16);
  y+=31;
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(71,85,105);
  doc.text(`Oficina: ${data.oficinaNome||state.session?.oficinaNome||'-'}`,12,y); doc.text(`Gerado em: ${fmtDateTime(data.criadoEm||nowISO())}`,126,y); y+=8;

  const st=data.stats||{}; const boxes=[['OK',st.ok||0,[22,163,74]],['ATENÇÃO',st.atencao||0,[217,119,6]],['TROCAR',st.trocar||0,[220,38,38]],['AÇÕES TÉCNICAS',st.tecnicas||0,[14,165,233]],['PENDENTES',st.pending||0,[100,116,139]]];
  boxes.forEach((b,i)=>{ const x=10+i*38; doc.setFillColor(255,255,255); doc.setDrawColor(226,232,240); doc.roundedRect(x,y,36,18,3,3,'FD'); doc.setFillColor(...b[2]); doc.circle(x+7,y+9,3.2,'F'); doc.setTextColor(15,23,42); doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text(String(b[1]),x+15,y+8); doc.setFontSize(6.8); doc.setTextColor(100,116,139); doc.text(b[0],x+15,y+14); });
  y+=25;

  if(data.relato){ y=pdfEnsurePage(doc,y); doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(15,23,42); doc.text('Relato do cliente',12,y); y+=5; doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(51,65,85); y=pdfLine(doc,data.relato,12,y,186)+3; }
  if(data.diagnostico){ y=pdfEnsurePage(doc,y); doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(15,23,42); doc.text('Diagnóstico técnico',12,y); y+=5; doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(51,65,85); y=pdfLine(doc,data.diagnostico,12,y,186)+3; }

  const itens=(data.itens||[]).filter(i=>i.acao);
  const groups={}; itens.forEach(i=>{ const key=i.secao||'Geral'; groups[key]=groups[key]||[]; groups[key].push(i); });
  Object.entries(groups).forEach(([sec,arr])=>{
    y=pdfSectionHeader(doc,sec,y);
    arr.forEach(i=>{
      y=pdfEnsurePage(doc,y+5);
      pdfStatusBadge(doc,i.acao,12,y);
      const ai=actionInfo(i.acao);
      doc.setFont('helvetica','bold'); doc.setFontSize(8.7); doc.setTextColor(15,23,42);
      doc.text(String(i.item||'Item').slice(0,76),31,y);
      doc.setFont('helvetica','normal'); doc.setFontSize(7.4); doc.setTextColor(71,85,105);
      const meta=[]; if(i.criticidade&&i.criticidade!=='normal') meta.push('Criticidade: '+i.criticidade); if(i.fotos) meta.push('Fotos: '+i.fotos); if(i.updatedBy) meta.push('Por: '+i.updatedBy);
      if(meta.length) doc.text(meta.join(' • '),31,y+4.3);
      y+=8;
      if(i.obs){ doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(51,65,85); y=pdfLine(doc,'Obs.: '+i.obs,31,y,158)+1; }
      doc.setDrawColor(226,232,240); doc.line(12,y,198,y); y+=3;
    });
  });
  y=pdfEnsurePage(doc,y+10); doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(15,23,42); doc.text('Assinaturas / conferência',12,y); y+=15;
  doc.setDrawColor(100,116,139); doc.line(12,y,70,y); doc.line(78,y,136,y); doc.line(144,y,198,y);
  doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(100,116,139); doc.text('Responsável técnico',41,y+4,{align:'center'}); doc.text('Gestor / conferente',107,y+4,{align:'center'}); doc.text('Cliente / autorização',171,y+4,{align:'center'});
  const total=doc.internal.getNumberOfPages(); for(let i=1;i<=total;i++){ doc.setPage(i); pdfFooter(doc); }
  doc.save(`checklist_${data.placa||'veiculo'}_${new Date().toISOString().slice(0,10)}.pdf`);
}
function gerarPDFEntrega(){ const payload={...payloadBase(), itens:getCriticalItems().map(i=>({...i, entrega:state.delivery[i.id]||{}})), diagnostico:'Checklist de entrega/conferência\n'+($('entregaObs').value||'')}; gerarPDF(payload); }
function gerarXLSX(kind='checklist'){
  if(!window.XLSX){ toast('Biblioteca XLSX não carregou.'); return; }
  const base=payloadBase();
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{Placa:base.placa,OS:base.osRef,KM:base.km,Oficina:base.oficinaNome,Responsavel:base.responsavel,Data:fmtDateTime(base.criadoEm),OK:base.stats.ok,Atencao:base.stats.atencao,Trocar:base.stats.trocar,AcoesTecnicas:base.stats.tecnicas,Pendentes:base.stats.pending}]),'Resumo');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(base.itens.map(i=>({Secao:i.secao,Item:i.item,Acao:i.acaoLabel||i.acao,Obs:i.obs||'',Obrigatorio:i.obrigatorio?'Sim':'Não',Criticidade:i.criticidade||'',Fotos:i.fotos||0,AtualizadoPor:i.updatedBy||''}))),'Itens');
  const entrega=getCriticalItems().map(i=>({Secao:i.secao,Item:i.item,AcaoTecnica:i.acaoLabel,StatusEntrega:state.delivery[i.id]?.status||'pendente',ObsEntrega:state.delivery[i.id]?.obs||''}));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(entrega),'Entrega');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet((state.history.os||[]).map(o=>({OS:o.numero||o.codigo||o.id,Status:o.status||o.etapa||'',Cliente:o.clienteNome||o.cliente?.nome||'',Data:fmtDateTime(o.criadoEm||o.createdAt||o.data)}))),'Historico_OS');
  XLSX.writeFile(wb,`${kind}_${base.placa||'veiculo'}_${new Date().toISOString().slice(0,10)}.xlsx`);
}
function gerarConsultaXLSX(){ if(!window.XLSX) return toast('Biblioteca XLSX não carregou.'); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.consulta.map(c=>({Placa:c.placa,OS:c.osRef,Responsavel:c.responsavel,Data:fmtDateTime(c.criadoEm),OK:c.stats?.ok||0,Atencao:c.stats?.atencao||0,Trocar:c.stats?.trocar||0}))), 'Consulta'); XLSX.writeFile(wb,'consulta_checklists.xlsx'); }
function baixarJSON(){ const p=payloadBase(); downloadText(`checklist_${p.placa||'veiculo'}.json`,JSON.stringify(p,null,2)); }
function splitIntoColumns(sections, totalCols=4){
  const cols=Array.from({length:totalCols},()=>({peso:0,secoes:[]}));
  (sections||[]).forEach(sec=>{
    const itens=sec.itens||[];
    const peso=1+itens.length;
    cols.sort((a,b)=>a.peso-b.peso);
    cols[0].secoes.push({...sec,itens});
    cols[0].peso+=peso;
  });
  return cols;
}
function printA4(entrega=false){
  const base=payloadBase();
  const w=window.open('','_blank');
  if(!w) return toast('Bloqueador impediu impressão.');

  const css=`
    @page{size:A4 portrait;margin:5mm}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif}
    body{font-size:7.4px;line-height:1.08}
    .page{width:200mm;min-height:287mm;page-break-after:always;padding:0;overflow:hidden}
    .page:last-child{page-break-after:auto}
    .head{border:1.4px solid #111;padding:3mm 3mm 2mm;margin-bottom:2mm}
    h1{font-size:13px;line-height:1;margin:0 0 2mm;text-align:center;letter-spacing:.3px}
    .meta{display:grid;grid-template-columns:1.1fr .8fr .7fr .85fr;gap:1.2mm 2mm;font-size:8px}
    .meta span{border-bottom:1px solid #555;min-height:11px;white-space:nowrap}
    .obs-top{margin-top:1.5mm;border:1px solid #555;height:10mm;padding:1mm;font-size:7.2px}
    .cols{display:grid;grid-template-columns:1fr 1fr;gap:2mm}
    .col{min-width:0}
    .sec{border:1px solid #111;margin:0 0 1.2mm;break-inside:avoid;page-break-inside:avoid}
    .sec-title{display:grid;grid-template-columns:minmax(0,1fr) 4.4mm 4.4mm 4.4mm 5.8mm 5.3mm 4.8mm;align-items:center;background:#e9eef7;border-bottom:1px solid #111;font-weight:bold;font-size:7.4px;padding:.75mm .8mm;text-transform:uppercase;gap:.45mm}
    .sec-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sec-title span:not(.sec-name){font-size:5.7px;text-align:center;letter-spacing:-.35px;white-space:nowrap}
    .row{display:grid;grid-template-columns:minmax(0,1fr) 4.4mm 4.4mm 4.4mm 5.8mm 5.3mm 4.8mm;align-items:center;border-top:1px solid #ddd;min-height:3.95mm;padding:.45mm .8mm;gap:.45mm}
    .row:first-of-type{border-top:0}
    .item{font-size:7.05px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:.8mm}
    .row>b{display:block;width:2.75mm;height:2.75mm;border:1px solid #111;margin:auto;background:#fff}
    .legend{display:grid;grid-template-columns:repeat(6,1fr);gap:1mm;border:1px solid #111;padding:.85mm;margin-bottom:1.5mm;font-size:6.8px;text-align:center}
    .legend b{display:inline-block;width:2.3mm;height:2.3mm;border:1px solid #111;margin:0 .45mm -0.25mm 0}
    .footer{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5mm;margin-top:2mm;font-size:7px}
    .line{border-top:1px solid #111;text-align:center;padding-top:1mm;min-height:6mm}
    .mini{font-size:6.7px;text-align:center;margin-top:1mm;color:#333}
    .entrega-row{display:grid;grid-template-columns:1fr 42mm;gap:2mm;border:1px solid #111;margin-bottom:1mm;padding:1mm;font-size:7.5px;break-inside:avoid}
    @media print{.no-print{display:none!important}.page{page-break-after:always}.page:last-child{page-break-after:auto}}
  `;

  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Checklist A4 compacto</title><style>${css}</style></head><body>`);

  if(!entrega){
    const secoes=(state.model.secoes||[]).map(sec=>({...sec,itens:[...(sec.itens||[])]}));
    const cols=splitIntoColumns(secoes,4);
    const pages=[cols.slice(0,2),cols.slice(2,4)];
    pages.forEach((pageCols,idx)=>{
      w.document.write(`<section class="page">`);
      w.document.write(`<div class="head"><h1>CHECKLIST TÉCNICO MANUAL OFICIN-IA — PÁGINA ${idx+1}/2</h1><div class="meta"><span>Placa: <b>${esc(base.placa||'')}</b></span><span>O.S.: <b>${esc(base.osRef||'')}</b></span><span>KM: <b>${esc(base.km||'')}</b></span><span>Data: <b>${fmtDate(new Date())}</b></span><span>Cliente:</span><span>Veículo:</span><span>Mecânico:</span><span>Oficina: <b>${esc(base.oficinaNome||'')}</b></span></div>${idx===0?'<div class="obs-top">Relato do cliente / observações iniciais:</div>':''}</div>`);
      if(idx===0) w.document.write(`<div class="legend"><div><b></b> OK</div><div><b></b> AT</div><div><b></b> TR</div><div><b></b> RET/REG</div><div><b></b> REV</div><div><b></b> N/A</div></div>`);
      w.document.write(`<div class="cols">`);
      pageCols.forEach(col=>{
        w.document.write(`<div class="col">`);
        col.secoes.forEach(sec=>{
          w.document.write(`<div class="sec"><div class="sec-title"><span class="sec-name">${esc(sec.emoji||'')} ${esc(sec.titulo||'Seção')}</span><span>OK</span><span>AT</span><span>TR</span><span>R/R</span><span>REV</span><span>NA</span></div>`);
          (sec.itens||[]).forEach(it=>{
            w.document.write(`<div class="row"><div class="item">${esc(it.titulo||'Item')}</div><b></b><b></b><b></b><b></b><b></b><b></b></div>`);
          });
          w.document.write(`</div>`);
        });
        w.document.write(`</div>`);
      });
      w.document.write(`</div>`);
      if(idx===1){
        w.document.write(`<div class="footer"><div class="line">Responsável técnico</div><div class="line">Gestor / Conferente</div><div class="line">Cliente / Autorização</div></div><div class="mini">${esc(APP.footer||'Powered by thIAguinho Soluções Digitais')} • Checklist manual compacto em até 2 folhas A4</div>`);
      }
      w.document.write(`</section>`);
    });
  }else{
    const itens=getCriticalItems();
    w.document.write(`<section class="page"><div class="head"><h1>CHECKLIST DE ENTREGA / CONFERÊNCIA — OFICIN-IA</h1><div class="meta"><span>Placa: <b>${esc(base.placa||'')}</b></span><span>O.S.: <b>${esc(base.osRef||'')}</b></span><span>KM: <b>${esc(base.km||'')}</b></span><span>Data: <b>${fmtDate(new Date())}</b></span><span>Conferente:</span><span>Cliente:</span><span>Veículo:</span><span>Oficina: <b>${esc(base.oficinaNome||'')}</b></span></div></div>`);
    itens.forEach(i=>w.document.write(`<div class="entrega-row"><div><b>${esc(i.secao)}</b><br>${esc(i.item)} — ${esc(i.acaoLabel)}</div><div><b></b> Executado &nbsp; <b></b> Conferido &nbsp; <b></b> Pendente<br>Obs.:</div></div>`));
    w.document.write(`<div class="footer"><div class="line">Responsável técnico</div><div class="line">Gestor / Conferente</div><div class="line">Cliente / Autorização</div></div><div class="mini">${esc(APP.footer||'Powered by thIAguinho Soluções Digitais')}</div></section>`);
  }
  w.document.write(`</body></html>`);
  w.document.close();
  setTimeout(()=>w.print(),300);
}

function checklistResumoParaOS(data, entrega=false){
  const itens=Array.isArray(data?.itens)?data.itens:[];
  const crit=itens.filter(i=>ACTIONS_FINAL.has(i.acao));
  return {
    id:data?.id||state.lastSavedId||uid(),
    tipo: entrega?'entrega':'tecnico',
    app:data?.app||'OFICIN-IA-CHECKLIST-V15-12',
    versao:data?.versao||'v15.12',
    placa:data?.placa||placaNorm($('placa')?.value||''),
    osRef:data?.osRef||($('osRef')?.value||'').trim(),
    km:data?.km||($('km')?.value||'').trim(),
    oficinaNome:data?.oficinaNome||state.session?.oficinaNome||'',
    responsavel:data?.responsavel||state.session?.name||'',
    responsavelPerfil:data?.responsavelPerfil||state.session?.role||'',
    criadoEm:data?.criadoEm||nowISO(),
    atualizadoEm:nowISO(),
    stats:data?.stats||stats(),
    criticos:crit.slice(0,25).map(i=>({id:i.id,secao:i.secao,item:i.item,acao:i.acao,acaoLabel:i.acaoLabel,obs:i.obs||''})),
    totalCriticos:crit.length,
    urlChecklist:location.href.split('#')[0]
  };
}
async function anexarPayloadNaOS(data, entrega=false, silencioso=false){
  const osRef=String(data?.osRef||$('osRef')?.value||'').trim();
  if(!osRef){ if(!silencioso) toast('Informe O.S./referência para anexar.'); return false; }
  const db=activeDb();
  const cols=['ordens_servico','ordensServico','os'];
  const resumo=checklistResumoParaOS(data,entrega);
  const full=entrega?{entregaChecklist:state.delivery, entregaAtualizadaEm:nowISO(), ...resumo}:data;
  const fv=window.firebase?.firestore?.FieldValue;
  const update={
    checklistId: resumo.id,
    checklistResumo: full,
    checklistUltimo: resumo,
    checklistAtualizadoEm: fv?.serverTimestamp ? fv.serverTimestamp() : nowISO(),
    checklistAppUrl: location.href.split('#')[0]
  };
  if(fv?.arrayUnion) update.checklistsTecnicos=fv.arrayUnion(resumo);
  if(entrega){
    update.checklistEntregaUltimo=resumo;
    update.checklistEntregaResumo=full;
    update.checklistEntregaAtualizadoEm=fv?.serverTimestamp ? fv.serverTimestamp() : nowISO();
    if(fv?.arrayUnion) update.checklistsEntrega=fv.arrayUnion(resumo);
  }
  for(const col of cols){
    try{
      const byId=await db.collection(col).doc(osRef).get();
      if(byId.exists){ await byId.ref.set(update,{merge:true}); return true; }
      for(const f of ['numero','codigo','osRef','referencia']){
        const snap=await db.collection(col).where(f,'==',osRef).limit(1).get();
        if(!snap.empty){ await snap.docs[0].ref.set(update,{merge:true}); return true; }
      }
    }catch(e){ console.warn('anexar',col,e.message); }
  }
  return false;
}
async function anexarOS(entrega=false){
  const osRef=($('osRef').value||'').trim(); if(!osRef) return toast('Informe O.S./referência para anexar.');
  const data=entrega?{entregaChecklist:state.delivery, entregaAtualizadaEm:nowISO(), ...payloadBase()}:payloadBase();
  const updated=await anexarPayloadNaOS(data,entrega,false);
  toast(updated?'Checklist anexado na O.S. do Jarvis. Abra a O.S. no SaaS para visualizar em Provas & Checklist.':'Não encontrei a O.S. pelo número informado. Checklist ficou salvo/exportável.');
}

function addPhotosToArray(files, target, done){
  const arr=Array.from(files||[]); if(!arr.length) return;
  let pending=arr.length;
  arr.forEach(file=>{ const rd=new FileReader(); rd.onload=()=>{ target.push(rd.result); pending--; if(!pending){ done?.(); saveDraft(); } }; rd.readAsDataURL(file); });
}
function addItemPhotos(itemId,files){ state.itemPhotos[itemId]=state.itemPhotos[itemId]||[]; addPhotosToArray(files,state.itemPhotos[itemId],()=>{ renderSections(); toast('Foto anexada ao item.'); }); }
function renderPhotos(){ const box=$('fotosGerais'); if(box) box.innerHTML=(state.generalPhotos||[]).map(p=>`<img src="${esc(p)}" alt="foto geral">`).join(''); }
function dictateToItem(itemId){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR) return toast('Ditado não suportado neste navegador.');
  const rec=new SR(); rec.lang='pt-BR'; rec.interimResults=false; rec.onresult=e=>{ const text=e.results?.[0]?.[0]?.transcript||''; const ans=ensureAnswer(itemId); ans.obs=(ans.obs?ans.obs+' ':'')+text; saveDraft(); renderSections(); toast('Observação ditada.'); }; rec.start();
}
function dictateRelato(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR) return toast('Ditado não suportado neste navegador.');
  const rec=new SR(); rec.lang='pt-BR'; rec.onresult=e=>{ $('diagnostico').value = (($('diagnostico').value||'')+' '+(e.results?.[0]?.[0]?.transcript||'')).trim(); saveDraft(); }; rec.start();
}
async function toggleAudio(){
  if(state.mediaRecorder && state.mediaRecorder.state==='recording'){ state.mediaRecorder.stop(); return; }
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true}); state.audioChunks=[]; state.mediaRecorder=new MediaRecorder(stream); state.mediaRecorder.ondataavailable=e=>state.audioChunks.push(e.data); state.mediaRecorder.onstop=()=>{ const blob=new Blob(state.audioChunks,{type:'audio/webm'}); state.audioUrl=URL.createObjectURL(blob); const box=$('audioBox'); box.classList.remove('hidden'); box.innerHTML=`Áudio gravado: <audio controls src="${state.audioUrl}"></audio>`; $('btnAudio').textContent='🎤 Gravar áudio'; saveDraft(); stream.getTracks().forEach(t=>t.stop()); }; state.mediaRecorder.start(); $('btnAudio').textContent='⏹️ Parar gravação'; toast('Gravando áudio...');
  }catch(e){ toast('Microfone não autorizado.'); }
}

function openManager(secId){
  if(!isGestor()) return toast('Somente gestor/gerente/admin.');
  const sec=(state.model.secoes||[]).find(s=>s.id===secId); if(!sec) return;
  $('gestaoTitulo').textContent='Editar seção: '+sec.titulo;
  const actionChecks=(state.model.acoesPadrao||[]).map(a=>`<label><input type="checkbox" value="${esc(a.id)}" class="newAction" ${['ok','atencao','trocar','na'].includes(a.id)?'checked':''}> ${esc(a.emoji)} ${esc(a.label)}</label>`).join('');
  $('gestaoConteudo').innerHTML=`<div class="notice">Edição por seção salva no Firebase da oficina. Não fica só neste aparelho.</div><div class="card" style="box-shadow:none"><label>Novo item nesta seção</label><input id="newItemTitle" class="inp" placeholder="Ex: Sensor ABS dianteiro"><div class="checks" style="margin-top:8px">${actionChecks}</div><div class="row2" style="margin-top:8px"><label style="display:flex;gap:8px;align-items:center;color:var(--text)"><input id="newItemReq" type="checkbox" checked> Obrigatório</label><select id="newItemCrit" class="inp"><option value="normal">Normal</option><option value="importante">Importante</option><option value="critico">Crítico</option></select></div><button class="btn ok" id="btnAddItem" type="button" style="margin-top:8px;width:100%">Adicionar item</button></div><div id="managerItems"></div>`;
  renderManagerItems(sec);
  $('btnAddItem').onclick=()=>{ const title=($('newItemTitle').value||'').trim(); if(!title) return toast('Digite o item.'); const actions=$$('.newAction:checked').map(x=>x.value); const newIt={id:'item_'+Date.now().toString(36),titulo:title,acoes:actions.length?actions:['ok','atencao','trocar','na'],obrigatorio:$('newItemReq').checked,criticidade:$('newItemCrit').value,hint:''}; sec.itens.push(newIt); saveModelRemote({tipo:'adicionar_item',secao:sec.id,item:title,por:state.session?.name||'',em:nowISO()}); renderManagerItems(sec); renderSections(); };
  $('modalGestao').classList.remove('hidden');
}
function renderManagerItems(sec){
  const box=$('managerItems'); if(!box) return;
  box.innerHTML=(sec.itens||[]).map(it=>`<div class="manager-row"><b>${esc(it.titulo)}</b><small>${esc((it.acoes||[]).map(a=>actionInfo(a).label).join(' • '))}</small><div class="actions"><button class="btn secondary small" data-ren="${esc(it.id)}" type="button">Renomear</button><button class="btn secondary small" data-crit="${esc(it.id)}" type="button">Criticidade</button><button class="btn bad small" data-del-item="${esc(it.id)}" type="button">Excluir</button></div></div>`).join('');
  $$('[data-ren]',box).forEach(b=>b.onclick=()=>{ const it=sec.itens.find(x=>x.id===b.dataset.ren); const n=prompt('Novo nome do item:',it.titulo); if(n){ it.titulo=n.trim(); saveModelRemote({tipo:'renomear_item',secao:sec.id,item:it.id,por:state.session?.name||'',em:nowISO()}); renderManagerItems(sec); renderSections(); } });
  $$('[data-crit]',box).forEach(b=>b.onclick=()=>{ const it=sec.itens.find(x=>x.id===b.dataset.crit); const n=prompt('Criticidade: normal, importante ou critico',it.criticidade||'normal'); if(n){ it.criticidade=norm(n).includes('critic')?'critico':norm(n).includes('import')?'importante':'normal'; saveModelRemote({tipo:'criticidade',secao:sec.id,item:it.id,por:state.session?.name||'',em:nowISO()}); renderManagerItems(sec); renderSections(); } });
  $$('[data-del-item]',box).forEach(b=>b.onclick=()=>{ const it=sec.itens.find(x=>x.id===b.dataset.delItem); if(!confirm('Excluir item da seção?\n'+it.titulo)) return; sec.itens=sec.itens.filter(x=>x.id!==it.id); delete state.answers[it.id]; saveModelRemote({tipo:'excluir_item',secao:sec.id,item:it.id,por:state.session?.name||'',em:nowISO()}); renderManagerItems(sec); renderSections(); });
}

function joinUrl(base, page=''){
  const b=String(base||'').trim();
  if(!b) return '';
  return b.replace(/\/+$/,'/') + String(page||'').replace(/^\/+/, '');
}
function resolveSaasBaseUrl(){
  const saved=(localStorage.getItem('OFICINIA_SAAS_BASE_URL')||'').trim();
  if(saved) return saved;
  const cfg=(APP.saasBaseUrl||'').trim();
  if(cfg) return cfg;
  const host=(location.hostname||'').toLowerCase();
  if(host.endsWith('.github.io')) return `https://${host.split('.')[0]}.github.io/OFICIN-IA-COM_IA/`;
  return 'https://tsvalencio-ia.github.io/OFICIN-IA-COM_IA/';
}
function saasEntryPage(){ return isGestor() ? 'jarvis.html' : 'equipe.html'; }
function abrirSaas(){
  const base=resolveSaasBaseUrl();
  const url=joinUrl(base, saasEntryPage());
  if(!url){ toast('URL do SaaS não encontrada.'); return; }
  window.open(url,'_blank','noopener');
  toast('Abrindo o SaaS integrado pelo mesmo Firebase.');
}
async function instalar(){ if(state.installPrompt){ state.installPrompt.prompt(); try{ await state.installPrompt.userChoice; }catch(e){} state.installPrompt=null; return; } toast('APK real: vá em Actions > GERAR APK CHECKLIST e baixe o artefato. No navegador: menu ⋮ > Instalar app.'); }
function bind(){
  $('btnLogin')?.addEventListener('click',login); $('loginPwd')?.addEventListener('keydown',e=>{if(e.key==='Enter') login();});
  $('btnLogout')?.addEventListener('click',clearSession); $('btnTheme')?.addEventListener('click',()=>{state.theme=state.theme==='dark'?'light':'dark'; applyTheme();});
  ['btnHomeTop','btnInicioFix','btnInicioResumo'].forEach(id=>$(id)?.addEventListener('click',irParaInicio));
  ['btnAbrirSaas','btnIrSaas'].forEach(id=>$(id)?.addEventListener('click',abrirSaas)); ['btnInstalar','btnInstalarLogin'].forEach(id=>$(id)?.addEventListener('click',instalar));
  $('btnBack')?.addEventListener('click',back); $('btnNext')?.addEventListener('click',next); $('btnNovo')?.addEventListener('click',()=>{ if(confirm('Zerar rascunho e iniciar novo checklist?')) clearDraft(); }); $('btnNovoFinal')?.addEventListener('click',()=>{ clearDraft(); go('screenInicio'); });
  $('placa')?.addEventListener('input',e=>{e.target.value=placaNorm(e.target.value); saveDraft();}); ['osRef','km','relato','diagnostico'].forEach(id=>$(id)?.addEventListener('input',saveDraft));
  $('btnHistorico')?.addEventListener('click',buscarHistorico); $('btnHistoricoFinal')?.addEventListener('click',()=>{go('screenInicio'); buscarHistorico();});
  $('btnConsultar')?.addEventListener('click',consultar); $('btnRodarConsulta')?.addEventListener('click',consultar); $('btnFecharConsulta')?.addEventListener('click',()=>go('screenInicio')); $('btnVoltarInicioConsulta')?.addEventListener('click',()=>go('screenInicio')); $('btnExportConsulta')?.addEventListener('click',gerarConsultaXLSX);
  $('buscaItem')?.addEventListener('input',renderSections);
  $('fotoGeral')?.addEventListener('change',e=>addPhotosToArray(e.target.files,state.generalPhotos,()=>{renderPhotos(); toast('Fotos gerais adicionadas.');}));
  $('btnDitarRelato')?.addEventListener('click',dictateRelato); $('btnAudio')?.addEventListener('click',toggleAudio);
  $('btnSalvar')?.addEventListener('click',saveChecklist); $('btnPDF')?.addEventListener('click',()=>gerarPDF()); $('btnXLSX')?.addEventListener('click',()=>gerarXLSX('checklist')); $('btnA4')?.addEventListener('click',()=>printA4(false)); $('btnA4Topo')?.addEventListener('click',()=>printA4(false)); $('btnJSON')?.addEventListener('click',baixarJSON); $('btnAnexarOS')?.addEventListener('click',()=>anexarOS(false));
  $('btnEditarAtual')?.addEventListener('click',()=>go('screenChecklist')); $('btnExcluirAtual')?.addEventListener('click',deleteCurrentChecklist);
  $('btnEntrega')?.addEventListener('click',abrirEntrega); $('btnSalvarEntrega')?.addEventListener('click',saveEntrega); $('btnPdfEntrega')?.addEventListener('click',gerarPDFEntrega); $('btnXlsxEntrega')?.addEventListener('click',()=>gerarXLSX('entrega')); $('btnVoltarResumo')?.addEventListener('click',()=>go('screenResumo')); $('btnA4Entrega')?.addEventListener('click',()=>printA4(true)); $('btnAnexarEntrega')?.addEventListener('click',()=>anexarOS(true));
  $('btnFecharGestao')?.addEventListener('click',()=>$('modalGestao').classList.add('hidden'));
  window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); state.installPrompt=e; });
}
async function boot(){
  applyTheme(); bind();
  if('serviceWorker' in navigator){ try{ await navigator.serviceWorker.register('./service-worker.js'); }catch(e){ console.warn('sw',e.message); } }
  $('loginUsr').value=localStorage.getItem('OFICINIA_CHECKLIST_V15_LAST_USER')||'';
  await loadModel(false); loadSession(true);
  if(state.session){ await loadModel(true); restoreDraft(); applyQueryPrefill(); renderAll(); go('screenInicio'); } else go('screenLogin');
}

document.addEventListener('DOMContentLoaded',boot);
})();
