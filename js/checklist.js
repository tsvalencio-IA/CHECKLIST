(function(){
'use strict';

const $ = id => document.getElementById(id);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const APP = window.CHECKLIST_APP || {};
const SESSION_KEY = 'OFICINIA_CHECKLIST_V15_SESSION';
const DRAFT_KEY = 'OFICINIA_CHECKLIST_V15_DRAFT';
const MODEL_KEY = 'OFICINIA_CHECKLIST_V15_MODEL';
const THEME_KEY = 'OFICINIA_CHECKLIST_V15_THEME';
const DEFAULT_BRAND = { name:'OFICIN-IA Checklist', subtitle:'Checklist técnico • Entrega • Histórico', color:'#2563eb', footer:'Powered by thIAguinho Soluções Digitais' };
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
function countRequired(){ let total=0; (state.model?.secoes||[]).forEach(sec => (sec.itens||[]).forEach(it=>{ if(it.obrigatorio!==false) total++; })); return total; }
function stats(){
  const allItems=itemMap(); const answers=Object.values(state.answers||{}); const req=countRequired();
  const answeredRequired=Object.values(allItems).filter(it => it.obrigatorio!==false && state.answers[it.id]?.acao).length;
  const pending=Math.max(req-answeredRequired,0);
  return {
    ok:answers.filter(a=>a.acao==='ok').length,
    atencao:answers.filter(a=>a.acao==='atencao').length,
    trocar:answers.filter(a=>a.acao==='trocar').length,
    tecnicas:answers.filter(a=>ACTIONS_FINAL.has(a.acao) && a.acao!=='atencao' && a.acao!=='trocar').length,
    pending,
    percent:req?Math.round((answeredRequired/req)*100):0
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
function next(){ if(state.screen==='screenInicio') go('screenChecklist'); else if(state.screen==='screenChecklist') go('screenMidia'); else if(state.screen==='screenMidia') { renderResumo(); go('screenResumo'); } else if(state.screen==='screenResumo') abrirEntrega(); else if(state.screen==='screenEntrega') { toast('Checklist concluído. Salve/exports ou inicie novo.'); } else go('screenInicio'); }
function back(){ if(state.screen==='screenEntrega') go('screenResumo'); else if(state.screen==='screenResumo') go('screenMidia'); else if(state.screen==='screenMidia') go('screenChecklist'); else if(state.screen==='screenChecklist') go('screenInicio'); else go('screenInicio'); }

function renderAll(){ renderSymptoms(); renderSections(); renderProgress(); renderPhotos(); renderDelivery(); }
function renderProgress(){
  const s=stats();
  if($('progressBar')) $('progressBar').style.width=s.percent+'%';
  if($('percentPill')) $('percentPill').textContent=s.percent+'% concluído';
  if($('kOk')) $('kOk').textContent=s.ok; if($('kAt')) $('kAt').textContent=s.atencao; if($('kTrocar')) $('kTrocar').textContent=s.trocar; if($('kAcoes')) $('kAcoes').textContent=s.tecnicas; if($('kPend')) $('kPend').textContent=s.pending;
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
    const open = q || state.activeSection===sec.id;
    return `<div class="section ${open?'open':''}" data-section="${esc(sec.id)}">
      <div class="section-head" data-open-section="${esc(sec.id)}"><h3>${esc(sec.emoji||'🔧')} ${esc(sec.titulo)}</h3><div style="display:flex;gap:7px;align-items:center"><span class="pill">${done}/${items.length}</span>${isGestor()?`<button class="btn secondary small" data-manage="${esc(sec.id)}" type="button">✏️ Editar</button>`:''}</div></div>
      <div class="section-body"><div class="notice">${esc(sec.hint||'')}</div>${items.map(it=>renderItem(sec,it)).join('')}</div>
    </div>`;
  }).join('');
  box.innerHTML=html || '<div class="notice warn">Nenhum item encontrado na pesquisa.</div>';
  $$('[data-open-section]').forEach(h=>h.addEventListener('click',e=>{ if(e.target.closest('[data-manage]')) return; state.activeSection=h.dataset.openSection; renderSections(); saveDraft(); }));
  $$('[data-manage]').forEach(b=>b.addEventListener('click',e=>{ e.stopPropagation(); openManager(b.dataset.manage); }));
  $$('[data-action]').forEach(b=>b.addEventListener('click',()=>setAction(b.dataset.item,b.dataset.action)));
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
  saveDraft(); renderSections(); renderProgress(); autoAdvanceSection(im.secaoId);
}
function autoAdvanceSection(secId){
  const sec=(state.model.secoes||[]).find(s=>s.id===secId); if(!sec) return;
  const obrig=(sec.itens||[]).filter(i=>i.obrigatorio!==false);
  const all=obrig.length && obrig.every(i=>state.answers[i.id]?.acao);
  if(!all) return;
  const idx=(state.model.secoes||[]).findIndex(s=>s.id===secId);
  const nextSec=state.model.secoes[idx+1];
  if(nextSec){ state.activeSection=nextSec.id; setTimeout(()=>{ renderSections(); document.querySelector(`[data-section="${nextSec.id}"]`)?.scrollIntoView({behavior:'smooth',block:'start'}); },250); }
}

function payloadBase(){
  const placa=placaNorm($('placa')?.value||'');
  const allItems=itemMap();
  const itens=Object.values(state.answers).map(a=>({...a, fotos:(state.itemPhotos[a.id]||[]).length, criticidade:allItems[a.id]?.criticidade||'normal', obrigatorio:allItems[a.id]?.obrigatorio!==false}));
  return { id:state.lastSavedId||uid(), app:'OFICIN-IA-CHECKLIST-V15', versao:state.model?.versao||'v15', tenantId:state.session?.tenantId||'', oficinaNome:state.session?.oficinaNome||'', placa, osRef:($('osRef')?.value||'').trim(), km:($('km')?.value||'').trim(), responsavel:state.session?.name||'', responsavelPerfil:state.session?.role||'', relato:($('relato')?.value||'').trim(), diagnostico:($('diagnostico')?.value||'').trim(), itens, fotosGerais:state.generalPhotos.length, temAudio:!!state.audioUrl, stats:stats(), criadoEm:nowISO(), atualizadoEm:nowISO() };
}
async function saveChecklist(){
  if(!placaNorm($('placa')?.value||'')) { toast('Informe a placa antes de salvar.'); go('screenInicio'); return null; }
  const payload=payloadBase(); setBusy('btnSalvar',true,'Salvando...');
  try{
    const db=activeDb();
    if(state.lastSavedId){ await db.collection('checklists').doc(state.lastSavedId).set(payload,{merge:true}); }
    else { const ref=await db.collection('checklists').add(payload); state.lastSavedId=ref.id; payload.id=ref.id; await ref.set({id:ref.id},{merge:true}); }
    localStorage.setItem('OFICINIA_CHECKLIST_LAST_'+payload.placa, JSON.stringify(payload));
    toast('Checklist salvo no Firebase.');
    return payload;
  }catch(e){ console.warn(e); localStorage.setItem('OFICINIA_CHECKLIST_LOCAL_'+payload.id, JSON.stringify(payload)); toast('Firebase bloqueou/offline. Checklist salvo localmente.'); return payload; }
  finally{ setBusy('btnSalvar',false); }
}
function renderResumo(){
  const box=$('resumoLista'); if(!box) return;
  const itens=payloadBase().itens;
  const crit=itens.filter(i=>ACTIONS_FINAL.has(i.acao));
  $('resumoPill').textContent = `${crit.length} itens para relatório`;
  box.innerHTML = crit.length ? crit.map(i=>`<div class="res-line"><b>${esc(i.secao)} • ${esc(i.item)}</b><span class="pill ${esc(actionInfo(i.acao).classe)}">${esc(actionInfo(i.acao).emoji)} ${esc(i.acaoLabel)}</span>${i.obs?`<small>${esc(i.obs)}</small>`:''}</div>`).join('') : '<div class="notice">Nenhum item crítico. Se necessário, gere PDF mesmo assim para registrar a avaliação.</div>';
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
  checklists.slice(0,8).forEach(c=>html.push(`<div class="hist"><b>Checklist ${esc(c.id)}</b><small>${fmtDateTime(c.criadoEm||c.createdAt)} • ${esc(c.responsavel||c.mecanico||'')} • Trocar: ${onlyFinite(c.stats?.trocar)}</small>${isGestor()?`<button class="btn bad small" data-del-check="${esc(c.id)}" data-col="${esc(c._col||'checklists')}" type="button">Excluir</button>`:''}</div>`));
  box.innerHTML=html.join('');
  $$('[data-del-check]',box).forEach(b=>b.addEventListener('click',()=>deleteChecklist(b.dataset.col,b.dataset.delCheck)));
}
async function deleteChecklist(col,id){
  if(!isGestor()) return toast('Somente gestor/gerente/admin pode excluir.');
  if(!confirm('Excluir checklist salvo? A O.S. não será apagada.')) return;
  try{ await activeDb().collection(col||'checklists').doc(id).delete(); toast('Checklist excluído.'); await buscarHistorico(); }catch(e){ console.warn(e); toast('Firebase não permitiu excluir. Confira regras de gestor.'); }
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
  box.innerHTML=state.consulta.map(c=>`<div class="hist"><b>${esc(c.placa||'-')} • ${esc(c.osRef||'sem O.S.')}</b><small>${fmtDateTime(c.criadoEm||c.createdAt)} • ${esc(c.responsavel||'')} • ${esc(c.oficinaNome||'')}</small><div class="badges"><span class="pill ok">OK ${onlyFinite(c.stats?.ok)}</span><span class="pill warn">Atenção ${onlyFinite(c.stats?.atencao)}</span><span class="pill bad">Trocar ${onlyFinite(c.stats?.trocar)}</span></div><div class="actions">${isGestor()?`<button class="btn bad small" data-del-check="${esc(c.id)}" data-col="checklists" type="button">Excluir</button>`:''}<button class="btn secondary small" data-load-check="${esc(c.id)}" type="button">Carregar</button><button class="btn secondary small" data-pdf-check="${esc(c.id)}" type="button">PDF</button></div></div>`).join('');
  $$('[data-del-check]',box).forEach(b=>b.addEventListener('click',()=>deleteChecklist(b.dataset.col,b.dataset.delCheck)));
  $$('[data-load-check]',box).forEach(b=>b.addEventListener('click',()=>loadChecklistFromConsulta(b.dataset.loadCheck)));
  $$('[data-pdf-check]',box).forEach(b=>b.addEventListener('click',()=>{ const c=state.consulta.find(x=>x.id===b.dataset.pdfCheck); if(c) gerarPDF(c); }));
}
function loadChecklistFromConsulta(id){
  const c=state.consulta.find(x=>x.id===id); if(!c) return;
  state.lastSavedId=c.id; state.answers={}; (c.itens||[]).forEach(i=>{ if(i.id) state.answers[i.id]=i; });
  $('placa').value=c.placa||''; $('osRef').value=c.osRef||''; $('km').value=c.km||''; $('relato').value=c.relato||''; $('diagnostico').value=c.diagnostico||''; saveDraft(); renderAll(); go('screenResumo'); toast('Checklist carregado.');
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
function gerarPDF(source){
  const data=source||payloadBase(); const jsPDF=window.jspdf?.jsPDF; if(!jsPDF){ toast('Biblioteca PDF não carregou.'); return; }
  const doc=new jsPDF({unit:'mm',format:'a4'}); let y=12;
  doc.setFillColor(15,23,42); doc.rect(0,0,210,24,'F'); doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.text('OFICIN-IA CHECKLIST TÉCNICO',12,15); doc.setFontSize(9); doc.text(APP.footer||'',140,15);
  doc.setTextColor(15,23,42); y=34; doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.text(`Placa: ${data.placa||'-'}   O.S.: ${data.osRef||'-'}   KM: ${data.km||'-'}`,12,y); y+=7; doc.setFont('helvetica','normal'); doc.text(`Oficina: ${data.oficinaNome||state.session?.oficinaNome||'-'}   Responsável: ${data.responsavel||state.session?.name||'-'}`,12,y); y+=7; doc.text(`Data: ${fmtDateTime(data.criadoEm||nowISO())}`,12,y); y+=8;
  doc.setFont('helvetica','bold'); doc.text('Resumo',12,y); y+=6; doc.setFont('helvetica','normal'); doc.text(`OK: ${data.stats?.ok||0} | Atenção: ${data.stats?.atencao||0} | Trocar: ${data.stats?.trocar||0} | Pendentes: ${data.stats?.pending||0}`,12,y); y+=8;
  if(data.relato){ doc.setFont('helvetica','bold'); doc.text('Relato do cliente',12,y); y+=5; doc.setFont('helvetica','normal'); y=pdfLine(doc,data.relato,12,y,186)+2; }
  if(data.diagnostico){ doc.setFont('helvetica','bold'); doc.text('Diagnóstico técnico',12,y); y+=5; doc.setFont('helvetica','normal'); y=pdfLine(doc,data.diagnostico,12,y,186)+2; }
  const itens=(data.itens||[]).filter(i=>i.acao);
  const groups={}; itens.forEach(i=>{ groups[i.secao||'Geral']=groups[i.secao||'Geral']||[]; groups[i.secao||'Geral'].push(i); });
  Object.entries(groups).forEach(([sec,arr])=>{
    if(y>265){ doc.addPage(); y=14; }
    doc.setFillColor(238,244,255); doc.rect(10,y-5,190,8,'F'); doc.setFont('helvetica','bold'); doc.setTextColor(15,23,42); doc.text(sec,12,y); y+=6;
    arr.forEach(i=>{ if(y>275){ doc.addPage(); y=14; } const ai=actionInfo(i.acao); doc.setFont('helvetica','bold'); doc.text(`${ai.label} • ${i.item}`,12,y); y+=5; if(i.obs){ doc.setFont('helvetica','normal'); y=pdfLine(doc,'Obs.: '+i.obs,16,y,178); } y+=2; });
  });
  doc.setFontSize(8); doc.setTextColor(100); doc.text('Documento gerado pelo app separado OFICIN-IA Checklist V15.',12,292);
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
function printA4(entrega=false){
  const base=payloadBase(); const itens=entrega?getCriticalItems():base.itens.filter(i=>i.acao);
  const w=window.open('','_blank'); if(!w) return toast('Bloqueador impediu impressão.');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Checklist A4</title><style>@page{size:A4;margin:8mm}body{font-family:Arial,sans-serif;color:#111}h1{font-size:18px;margin:0 0 6px}.head{border:2px solid #111;padding:8px;margin-bottom:8px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}.sec{border:1px solid #111;margin:5px 0;padding:5px;break-inside:avoid}.sec b{font-size:12px}.row{font-size:10px;border-top:1px solid #ddd;padding:3px 0}.box{display:inline-block;width:10px;height:10px;border:1px solid #111;margin-right:4px}.sign{margin-top:18px;display:grid;grid-template-columns:1fr 1fr;gap:20px}.line{border-top:1px solid #111;text-align:center;padding-top:4px;font-size:10px}</style></head><body><div class="head"><h1>${entrega?'CHECKLIST DE ENTREGA':'CHECKLIST TÉCNICO MANUAL'} — OFICIN-IA</h1><div class="grid"><div>Placa: <b>${esc(base.placa||'________')}</b></div><div>O.S.: <b>${esc(base.osRef||'________')}</b></div><div>KM: <b>${esc(base.km||'________')}</b></div><div>Data: <b>${fmtDate(new Date())}</b></div><div>Responsável: <b>${esc(base.responsavel||'________')}</b></div><div>Oficina: <b>${esc(base.oficinaNome||'________')}</b></div></div></div>`);
  if(!entrega){ (state.model.secoes||[]).forEach(sec=>{ w.document.write(`<div class="sec"><b>${esc(sec.emoji||'')} ${esc(sec.titulo)}</b>`); (sec.itens||[]).slice(0,12).forEach(it=>w.document.write(`<div class="row"><span class="box"></span>${esc(it.titulo)} &nbsp; OK □ Atenção □ Trocar □ Retificar/Regular □ N/A □</div>`)); w.document.write('</div>'); }); }
  else { itens.forEach(i=>w.document.write(`<div class="sec"><b>${esc(i.secao)}</b><div class="row"><span class="box"></span>${esc(i.item)} — ${esc(i.acaoLabel)} &nbsp; Executado □ Conferido □ Pendente □</div></div>`)); }
  w.document.write(`<div class="sign"><div class="line">Responsável técnico</div><div class="line">Gestor / Conferente</div></div><p style="font-size:10px;text-align:center;margin-top:12px">${esc(APP.footer||'Powered by thIAguinho Soluções Digitais')}</p></body></html>`);
  w.document.close(); setTimeout(()=>w.print(),300);
}
async function anexarOS(entrega=false){
  const osRef=($('osRef').value||'').trim(); if(!osRef) return toast('Informe O.S./referência para anexar.');
  const data=entrega?{entregaChecklist:state.delivery, entregaAtualizadaEm:nowISO()}:payloadBase();
  const db=activeDb(); const cols=['ordens_servico','ordensServico','os']; let updated=false;
  for(const col of cols){
    try{
      const byId=await db.collection(col).doc(osRef).get();
      if(byId.exists){ await byId.ref.set({checklistId:state.lastSavedId||data.id, checklistResumo:data, checklistAtualizadoEm:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}); updated=true; break; }
      for(const f of ['numero','codigo','osRef','referencia']){ const snap=await db.collection(col).where(f,'==',osRef).limit(1).get(); if(!snap.empty){ await snap.docs[0].ref.set({checklistId:state.lastSavedId||data.id, checklistResumo:data, checklistAtualizadoEm:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}); updated=true; break; } }
      if(updated) break;
    }catch(e){ console.warn('anexar',col,e.message); }
  }
  toast(updated?'Checklist anexado na O.S.':'Não encontrei a O.S. pelo número informado. Checklist ficou salvo/exportável.');
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

function abrirSaas(){ const base=APP.saasBaseUrl||''; window.open(base,'_blank','noopener'); }
async function instalar(){ if(state.installPrompt){ state.installPrompt.prompt(); try{ await state.installPrompt.userChoice; }catch(e){} state.installPrompt=null; return; } toast('No celular: menu ⋮ > Adicionar à tela inicial. O APK é gerado pelo workflow do repositório.'); }
function bind(){
  $('btnLogin')?.addEventListener('click',login); $('loginPwd')?.addEventListener('keydown',e=>{if(e.key==='Enter') login();});
  $('btnLogout')?.addEventListener('click',clearSession); $('btnTheme')?.addEventListener('click',()=>{state.theme=state.theme==='dark'?'light':'dark'; applyTheme();});
  ['btnAbrirSaas','btnIrSaas'].forEach(id=>$(id)?.addEventListener('click',abrirSaas)); ['btnInstalar','btnInstalarLogin'].forEach(id=>$(id)?.addEventListener('click',instalar));
  $('btnBack')?.addEventListener('click',back); $('btnNext')?.addEventListener('click',next); $('btnNovo')?.addEventListener('click',()=>{ if(confirm('Zerar rascunho e iniciar novo checklist?')) clearDraft(); }); $('btnNovoFinal')?.addEventListener('click',()=>{ clearDraft(); go('screenInicio'); });
  $('placa')?.addEventListener('input',e=>{e.target.value=placaNorm(e.target.value); saveDraft();}); ['osRef','km','relato','diagnostico'].forEach(id=>$(id)?.addEventListener('input',saveDraft));
  $('btnHistorico')?.addEventListener('click',buscarHistorico); $('btnHistoricoFinal')?.addEventListener('click',()=>{go('screenInicio'); buscarHistorico();});
  $('btnConsultar')?.addEventListener('click',consultar); $('btnRodarConsulta')?.addEventListener('click',consultar); $('btnFecharConsulta')?.addEventListener('click',()=>go('screenInicio')); $('btnVoltarInicioConsulta')?.addEventListener('click',()=>go('screenInicio')); $('btnExportConsulta')?.addEventListener('click',gerarConsultaXLSX);
  $('buscaItem')?.addEventListener('input',renderSections);
  $('fotoGeral')?.addEventListener('change',e=>addPhotosToArray(e.target.files,state.generalPhotos,()=>{renderPhotos(); toast('Fotos gerais adicionadas.');}));
  $('btnDitarRelato')?.addEventListener('click',dictateRelato); $('btnAudio')?.addEventListener('click',toggleAudio);
  $('btnSalvar')?.addEventListener('click',saveChecklist); $('btnPDF')?.addEventListener('click',()=>gerarPDF()); $('btnXLSX')?.addEventListener('click',()=>gerarXLSX('checklist')); $('btnA4')?.addEventListener('click',()=>printA4(false)); $('btnA4Topo')?.addEventListener('click',()=>printA4(false)); $('btnJSON')?.addEventListener('click',baixarJSON); $('btnAnexarOS')?.addEventListener('click',()=>anexarOS(false));
  $('btnEntrega')?.addEventListener('click',abrirEntrega); $('btnSalvarEntrega')?.addEventListener('click',saveEntrega); $('btnPdfEntrega')?.addEventListener('click',gerarPDFEntrega); $('btnXlsxEntrega')?.addEventListener('click',()=>gerarXLSX('entrega')); $('btnVoltarResumo')?.addEventListener('click',()=>go('screenResumo')); $('btnA4Entrega')?.addEventListener('click',()=>printA4(true)); $('btnAnexarEntrega')?.addEventListener('click',()=>anexarOS(true));
  $('btnFecharGestao')?.addEventListener('click',()=>$('modalGestao').classList.add('hidden'));
  window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); state.installPrompt=e; });
}
async function boot(){
  applyTheme(); bind();
  if('serviceWorker' in navigator){ try{ await navigator.serviceWorker.register('./service-worker.js'); }catch(e){ console.warn('sw',e.message); } }
  $('loginUsr').value=localStorage.getItem('OFICINIA_CHECKLIST_V15_LAST_USER')||'';
  await loadModel(false); loadSession(true);
  if(state.session){ await loadModel(true); restoreDraft(); renderAll(); go('screenInicio'); } else go('screenLogin');
}

document.addEventListener('DOMContentLoaded',boot);
})();
