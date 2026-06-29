(function(){
'use strict';

const $ = id => document.getElementById(id);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const APP = window.CHECKLIST_APP || {};
const SESSION_KEY = 'OFICINIA_CHECKLIST_V15_SESSION';
const DRAFT_KEY = 'OFICINIA_CHECKLIST_V15_DRAFT';
const MODEL_KEY = 'OFICINIA_CHECKLIST_V15_15_MODEL';
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
  osSelecionada:null,
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
  if($('responsavel')) $('responsavel').value = s ? s.name : '';
  if($('tecnicoChecklist') && !$('tecnicoChecklist').value) $('tecnicoChecklist').value = s ? s.name : '';
  if($('verificadorEntrega') && !$('verificadorEntrega').value) $('verificadorEntrega').value = s ? s.name : '';
  if($('conferente') && !$('conferente').value) $('conferente').value = s ? s.name : '';
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
function oficinaSess(doc,d,role='gestor',name='Gestor'){ return { tenantId:doc.id, oficinaId:doc.id, oficinaNome:d.nomeFantasia||d.nome||'Oficina', role, cargo:role, name, login:name, brand:oficinaBrand(d), firebaseConfig:d.firebaseConfig&&d.firebaseConfig.apiKey?d.firebaseConfig:null, cloudName:d.apiKeys?.cloudName||d.cloudName||'dmuvm1o6m', cloudPreset:d.apiKeys?.cloudPreset||d.cloudPreset||'evolution', actorType:'checklist', createdAt:nowISO() }; }
function senhaBate(docData,pwd){ const campos=['senha','password','adminSenha','senhaAdmin','pwd']; return campos.some(k => String(docData?.[k]||'') === String(pwd||'')); }
function cargoLabel(v){ const r=norm(v||'mecanico'); if(r.includes('geren')) return 'gerente'; if(r.includes('gest')) return 'gestor'; if(r.includes('admin')) return 'admin'; if(r.includes('tec')) return 'tecnico'; return 'mecanico'; }
function funcionarioSess(docF,dF,ofDoc,ofData){ const role=cargoLabel(dF.cargo||dF.role||dF.perfil||'mecanico'); return { tenantId:ofDoc.id, oficinaId:ofDoc.id, oficinaNome:ofData.nomeFantasia||ofData.nome||'Oficina', role, cargo:role, name:dF.nome||dF.name||dF.usuario||dF.email||'Funcionário', login:dF.usuario||dF.login||dF.email||'', funcionarioId:docF.id, brand:oficinaBrand(ofData), firebaseConfig:ofData.firebaseConfig&&ofData.firebaseConfig.apiKey?ofData.firebaseConfig:null, cloudName:ofData.apiKeys?.cloudName||ofData.cloudName||'dmuvm1o6m', cloudPreset:ofData.apiKeys?.cloudPreset||ofData.cloudPreset||'evolution', actorType:'checklist', createdAt:nowISO() }; }

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

function modelRank(model){
  const s=String(model?.versao||'');
  const m=s.match(/v15[.\-]?(\d+)/i) || s.match(/15\.(\d+)/);
  if(m) return Number(m[1])||0;
  if(s.includes('v15.15') || s.includes('15.15')) return 15;
  return 0;
}

async function loadModel(tryRemote=false){
  let model=null;
  try{ const res=await fetch('./data/checklist-model.json?v=15.15.0',{cache:'no-store'}); model=await res.json(); }catch(e){ console.warn('model local',e); }
  try{
    const saved=JSON.parse(localStorage.getItem(MODEL_KEY)||'null');
    if(saved && saved.secoes && modelRank(saved) >= modelRank(model)) model=saved;
  }catch(e){}
  if(tryRemote && state.session){
    try{
      const doc=await activeDb().collection('checklistModelos').doc('default').get();
      const remote=doc.exists ? doc.data()?.model : null;
      if(remote?.secoes && modelRank(remote) >= modelRank(model)){
        model=remote;
        localStorage.setItem(MODEL_KEY,JSON.stringify(model));
      }
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
  const draft={answers:state.answers,itemPhotos:state.itemPhotos,generalPhotos:state.generalPhotos,delivery:state.delivery,placa:$('placa')?.value||'',osRef:$('osRef')?.value||'',osSelecionada:state.osSelecionada||null,km:$('km')?.value||'',tecnicoChecklist:$('tecnicoChecklist')?.value||'',verificadorEntrega:$('verificadorEntrega')?.value||'',entregaEntreguePor:$('entregaEntreguePor')?.value||'',entregaRecebidoPor:$('entregaRecebidoPor')?.value||'',entregaDoc:$('entregaDoc')?.value||'',entregaData:$('entregaData')?.value||'',conferente:$('conferente')?.value||'',entregaStatus:$('entregaStatus')?.value||'',entregaObs:$('entregaObs')?.value||'',relato:$('relato')?.value||'',diagnostico:$('diagnostico')?.value||'',activeSection:state.activeSection,audioUrl:state.audioUrl};
  localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));
}
function restoreDraft(){
  try{
    const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null'); if(!d) return;
    state.answers=d.answers||{}; state.itemPhotos=d.itemPhotos||{}; state.generalPhotos=d.generalPhotos||[]; state.delivery=d.delivery||{}; state.osSelecionada=d.osSelecionada||null; state.activeSection=d.activeSection||state.activeSection; state.audioUrl=d.audioUrl||'';
    if($('placa')) $('placa').value=d.placa||''; if($('osRef')) $('osRef').value=d.osRef||''; if($('km')) $('km').value=d.km||''; if($('tecnicoChecklist')) $('tecnicoChecklist').value=d.tecnicoChecklist||state.session?.name||''; if($('verificadorEntrega')) $('verificadorEntrega').value=d.verificadorEntrega||state.session?.name||''; if($('conferente')) $('conferente').value=d.conferente||d.verificadorEntrega||state.session?.name||''; if($('entregaEntreguePor')) $('entregaEntreguePor').value=d.entregaEntreguePor||''; if($('entregaRecebidoPor')) $('entregaRecebidoPor').value=d.entregaRecebidoPor||''; if($('entregaDoc')) $('entregaDoc').value=d.entregaDoc||''; if($('entregaData')) $('entregaData').value=d.entregaData||''; if($('entregaStatus') && d.entregaStatus) $('entregaStatus').value=d.entregaStatus; if($('entregaObs')) $('entregaObs').value=d.entregaObs||''; if($('relato')) $('relato').value=d.relato||''; if($('diagnostico')) $('diagnostico').value=d.diagnostico||'';
  }catch(e){}
}
function clearDraft(){ localStorage.removeItem(DRAFT_KEY); state.answers={}; state.itemPhotos={}; state.generalPhotos=[]; state.delivery={}; state.history={os:[],checklists:[],entregas:[]}; state.osSelecionada=null; state.lastSavedId=''; ['placa','osRef','km','tecnicoChecklist','verificadorEntrega','entregaEntreguePor','entregaRecebidoPor','entregaDoc','entregaData','relato','diagnostico','entregaObs'].forEach(id=>{ if($(id)) $(id).value=''; }); if($('responsavel')) $('responsavel').value=state.session?.name||''; if($('tecnicoChecklist')) $('tecnicoChecklist').value=state.session?.name||''; if($('verificadorEntrega')) $('verificadorEntrega').value=state.session?.name||''; if($('conferente')) $('conferente').value=state.session?.name||''; renderAll(); }

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
    if(os && $('osRef') && !$('osRef').value){ $('osRef').value=String(os).trim(); state.osSelecionada={id:String(os).trim(), _col:'ordens_servico', label:String(os).trim(), origem:'link'}; }
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

function renderAll(){ renderSymptoms(); renderSections(); renderProgress(); renderPhotos(); renderDelivery(); renderOSSelecionadaInfo(); }
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
  $$('[data-quote-field]').forEach(el=>el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>updateQuoteField(el.dataset.quoteItem,el.dataset.quoteField,el.value)));
  $$('[data-dictate]').forEach(b=>b.addEventListener('click',()=>dictateToItem(b.dataset.dictate)));
  $$('[data-photo-item]').forEach(inp=>inp.addEventListener('change',e=>addItemPhotos(inp.dataset.photoItem,e.target.files)));
}

function cotacaoPrecisa(acao){ return ['trocar','atencao','revisar','retificar','regular','ajustar','lubrificar','limpar'].includes(String(acao||'')); }
function posicaoCompacta(txt){
  const p=inferPosicao({item:txt||''});
  return p || '';
}
function pecaSolicitadaPadrao(item,acao){
  const t=String(item?.titulo||item?.item||'').trim(); const n=norm(t);
  if(['regular','ajustar','lubrificar','limpar','retificar'].includes(acao)) return t;
  if(n.includes('cubo') && n.includes('rolamento')) return 'Cubo com rolamento';
  if(n.includes('rolamento de roda')) return 'Rolamento de roda';
  if(n.includes('pneu')) return 'Pneu';
  if(n.includes('amortecedor')) return 'Amortecedor';
  if(n.includes('bandeja')) return 'Bandeja';
  if(n.includes('bieleta')) return 'Bieleta';
  if(n.includes('pivo')) return 'Pivô';
  if(n.includes('pastilha')) return 'Pastilha de freio';
  if(n.includes('disco de freio')) return 'Disco de freio';
  if(n.includes('lona') || n.includes('sapata')) return 'Lona/sapata de freio';
  if(n.includes('sensor de nivel')) return 'Sensor de nível de combustível / boia';
  if(n.includes('flange')) return 'Flange/tampa da bomba de combustível';
  if(n.includes('anel de vedacao')) return 'Anel de vedação';
  if(n.includes('vidro')) return t;
  if(n.includes('forro porta')) return t;
  return t;
}
function tipoCotacaoPadrao(acao,item){
  const n=norm(item?.titulo||item?.item||'');
  if(acao==='trocar') return 'PEÇA';
  if(['regular','ajustar','lubrificar','limpar','retificar'].includes(acao)) return 'SERVIÇO';
  if(n.includes('cubo')||n.includes('rolamento')||n.includes('sensor')||n.includes('pneu')||n.includes('amortecedor')||n.includes('bateria')||n.includes('bomba')) return 'PEÇA';
  return 'AVALIAR';
}
function qtdPadrao(acao,item){ return acao==='trocar' ? 1 : ''; }
function cotacaoDefault(item,acao){ return {qtd:qtdPadrao(acao,item), peca:pecaSolicitadaPadrao(item,acao), posicao:posicaoCompacta(item?.titulo||item?.item||''), tipo:tipoCotacaoPadrao(acao,item), aprovado:'', fornecedor:'', marca:'', codigo:'', valor:''}; }
function ensureCotacao(itemId){
  const ans=ensureAnswer(itemId); const im=itemMap()[itemId]||{};
  const def=cotacaoDefault(im, ans.acao);
  ans.cotacao={...def, ...(ans.cotacao||{})};
  if(!ans.cotacao.peca) ans.cotacao.peca=def.peca;
  if(!ans.cotacao.tipo) ans.cotacao.tipo=def.tipo;
  if(!ans.cotacao.posicao) ans.cotacao.posicao=def.posicao;
  if((ans.cotacao.qtd===undefined || ans.cotacao.qtd===null || ans.cotacao.qtd==='') && ans.acao==='trocar') ans.cotacao.qtd=1;
  return ans.cotacao;
}
function renderQuotePanel(it,ans){
  if(!cotacaoPrecisa(ans.acao)) return '';
  const q={...cotacaoDefault(it,ans.acao), ...(ans.cotacao||{})};
  const positions=['','Dianteiro esquerdo','Dianteiro direito','Traseiro esquerdo','Traseiro direito','Dianteiro','Traseiro','Esquerdo','Direito','Motorista','Passageiro','Conjunto/Kit'];
  const tipos=['PEÇA','SERVIÇO','PEÇA + SERVIÇO','AVALIAR'];
  return `<div class="quote-panel"><b>🧾 Cotação/orçamento deste item</b><small>Preencha para o relatório mostrar quantidade, posição e peça correta sem confusão.</small><div class="quote-grid"><div><label>Qtd.</label><input class="inp" data-quote-field="qtd" data-quote-item="${esc(it.id)}" type="number" min="0" step="1" value="${esc(q.qtd)}" placeholder="1"></div><div><label>Peça/serviço exato</label><input class="inp" data-quote-field="peca" data-quote-item="${esc(it.id)}" value="${esc(q.peca)}" placeholder="Ex: cubo com rolamento"></div><div><label>Posição/lado</label><select class="inp" data-quote-field="posicao" data-quote-item="${esc(it.id)}">${positions.map(p=>`<option value="${esc(p)}" ${String(q.posicao||'')===p?'selected':''}>${p||'Não informado'}</option>`).join('')}</select></div><div><label>Vai para</label><select class="inp" data-quote-field="tipo" data-quote-item="${esc(it.id)}">${tipos.map(t=>`<option value="${esc(t)}" ${String(q.tipo||'')===t?'selected':''}>${t}</option>`).join('')}</select></div></div></div>`;
}
function updateQuoteField(itemId,field,value){ const q=ensureCotacao(itemId); q[field]=value; saveDraft(); renderProgress(); }

function renderItem(sec,it){
  const ans=state.answers[it.id]||{};
  const photos=state.itemPhotos[it.id]||[];
  const req=it.obrigatorio!==false?'<span class="pill bad">Obrigatório</span>':'';
  const crit=it.criticidade&&it.criticidade!=='normal'?`<span class="pill ${it.criticidade==='critico'?'bad':'warn'}">${esc(it.criticidade)}</span>`:'';
  return `<div class="item ${ans.acao?'has-action':''}" data-item-box="${esc(it.id)}">
    <div class="item-top"><div><div class="item-title">${esc(it.titulo)}</div>${it.hint?`<div class="item-hint">${esc(it.hint)}</div>`:''}<div class="badges">${req}${crit}</div></div><span class="pill ${actionInfo(ans.acao).classe||''}">${ans.acao?esc(actionInfo(ans.acao).emoji+' '+actionInfo(ans.acao).label):'Pendente'}</span></div>
    <div class="action-chips">${(it.acoes||['ok','atencao','trocar','na']).map(a=>{const ai=actionInfo(a); return `<button class="chip ${esc(ai.classe)} ${ans.acao===a?'on':''}" data-action="${esc(a)}" data-item="${esc(it.id)}" type="button">${esc(ai.emoji)} ${esc(ai.label)}</button>`}).join('')}</div>
    <div class="item-extra">${renderQuotePanel(it,ans)}<textarea data-obs="${esc(it.id)}" placeholder="Observação rápida deste item...">${esc(ans.obs||'')}</textarea><div class="micro-actions"><button class="btn secondary small" data-dictate="${esc(it.id)}" type="button">🗣️ Ditar obs.</button><label class="btn secondary small">📷 Foto do item<input data-photo-item="${esc(it.id)}" type="file" accept="image/*" capture="environment" multiple hidden></label></div>${photos.length?`<div class="photos">${photos.map(p=>`<img src="${esc(p)}" alt="foto">`).join('')}</div>`:''}</div>
  </div>`;
}
function ensureAnswer(itemId){
  if(!state.answers[itemId]){ const im=itemMap()[itemId]||{}; state.answers[itemId]={id:itemId,item:im.titulo||itemId,secao:im.secaoTitulo||'',secaoId:im.secaoId||'',acao:'',obs:'',updatedAt:nowISO(),updatedBy:state.session?.name||''}; }
  return state.answers[itemId];
}
function setAction(itemId,action){
  const im=itemMap()[itemId]||{}; const ans=ensureAnswer(itemId);
  ans.item=im.titulo||itemId; ans.secao=im.secaoTitulo||''; ans.secaoId=im.secaoId||''; ans.acao=action; ans.acaoLabel=actionInfo(action).label; ans.updatedAt=nowISO(); ans.updatedBy=state.session?.name||''; if(cotacaoPrecisa(action)) ans.cotacao={...cotacaoDefault(im,action), ...(ans.cotacao||{})};
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

function cloudinaryConfig(){
  return { cloudName: state.session?.cloudName || localStorage.getItem('j_cloud_name') || 'dmuvm1o6m', cloudPreset: state.session?.cloudPreset || localStorage.getItem('j_cloud_preset') || 'evolution' };
}
function isDataUrl(src){ return /^data:image\//.test(String(src||'')); }
function dataUrlToBlob(dataUrl){
  const parts=String(dataUrl||'').split(','); const mime=(parts[0].match(/:(.*?);/)||[])[1]||'image/jpeg';
  const bin=atob(parts[1]||''); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  return new Blob([arr],{type:mime});
}
async function uploadPhotoToCloudinary(src, folder='checklists'){
  if(!isDataUrl(src)) return src;
  const cfg=cloudinaryConfig(); if(!cfg.cloudName || !cfg.cloudPreset) return src;
  const fd=new FormData(); fd.append('file', dataUrlToBlob(src), `checklist_${Date.now()}.jpg`); fd.append('upload_preset', cfg.cloudPreset); fd.append('folder', `oficin-ia/${folder}`);
  const res=await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`,{method:'POST',body:fd});
  if(!res.ok) throw new Error('Falha ao enviar foto para Cloudinary.');
  const json=await res.json(); return json.secure_url || json.url || src;
}
async function uploadAllPendingPhotos(){
  let changed=false; const placa=placaNorm($('placa')?.value||'sem_placa');
  for(let i=0;i<(state.generalPhotos||[]).length;i++){
    const src=state.generalPhotos[i]; if(isDataUrl(src)){ state.generalPhotos[i]=await uploadPhotoToCloudinary(src,`checklists/${placa}/gerais`); changed=true; }
  }
  for(const [itemId,arr] of Object.entries(state.itemPhotos||{})){
    for(let i=0;i<(arr||[]).length;i++){
      const src=arr[i]; if(isDataUrl(src)){ arr[i]=await uploadPhotoToCloudinary(src,`checklists/${placa}/itens/${itemId}`); changed=true; }
    }
  }
  if(changed){ saveDraft(); renderPhotos(); renderSections(); }
}
function allPhotoEntries(data){
  const entries=[];
  const gen = Array.isArray(data?.fotoUrls) ? data.fotoUrls : Array.isArray(data?.fotosGeraisUrls) ? data.fotosGeraisUrls : (data===undefined ? state.generalPhotos : []);
  (gen||[]).forEach((url,idx)=>entries.push({url,label:`Foto geral ${idx+1}`,secao:'Fotos gerais'}));
  const itemPhotos = data?.itemPhotos || data?.itemFotos || (data===undefined ? state.itemPhotos : {});
  const itemById={}; (data?.itens||payloadBase().itens||[]).forEach(i=>{ itemById[i.id||i.checklistItemId]=i; (i.fotoUrls||i.fotosUrls||[]).forEach((url,idx)=>entries.push({url,label:`${i.item||'Item'} ${idx+1}`,secao:i.secao||'Item'})); });
  Object.entries(itemPhotos||{}).forEach(([id,arr])=>{ const item=itemById[id]||{}; (arr||[]).forEach((url,idx)=>entries.push({url,label:`${item.item||id} ${idx+1}`,secao:item.secao||'Fotos por item'})); });
  const seen=new Set(); return entries.filter(e=>e.url && !seen.has(e.url) && seen.add(e.url));
}
async function imageForPdf(src){
  if(!src) return null;
  if(isDataUrl(src)) return src;
  try{ const res=await fetch(src,{mode:'cors'}); const blob=await res.blob(); return await new Promise(ok=>{ const r=new FileReader(); r.onload=()=>ok(r.result); r.onerror=()=>ok(null); r.readAsDataURL(blob); }); }catch(e){ return null; }
}

function payloadBase(){
  const placa=placaNorm($('placa')?.value||'');
  const allItems=itemMap();
  const tecnico=($('tecnicoChecklist')?.value||state.session?.name||'').trim();
  const verificador=($('verificadorEntrega')?.value||$('conferente')?.value||state.session?.name||'').trim();
  const itens=Object.values(state.answers).map(a=>{ const fotos=state.itemPhotos[a.id]||[]; return {...a, fotos:fotos.length, fotoUrls:fotos, fotosUrls:fotos, criticidade:allItems[a.id]?.criticidade||'normal', obrigatorio:allItems[a.id]?.obrigatorio!==false}; });
  const osSel=state.osSelecionada||{}; const osRef=($('osRef')?.value||'').trim();
  const fotoUrls=[...(state.generalPhotos||[])]; const itemFotos=JSON.parse(JSON.stringify(state.itemPhotos||{}));
  return { id:state.lastSavedId||uid(), app:'OFICIN-IA-CHECKLIST-V15-16', versao:'v15.16', tenantId:state.session?.tenantId||'', oficinaNome:state.session?.oficinaNome||'', placa, osRef, osId:osSel.id||'', osColecao:osSel._col||'', osNumero:osSel.numero||osSel.codigo||osSel.osRef||osRef, osLabel:osSel.label||osRef, osStatus:osSel.status||osSel.etapa||'', osCliente:osSel.clienteNome||osSel.nomeCliente||osSel.cliente?.nome||'', osVeiculo:osSel.veiculoLabel||osSel.veiculoModelo||osSel.veiculo||osSel.veiculoSnapshot?.modelo||'', km:($('km')?.value||'').trim(), responsavel:tecnico, tecnicoChecklist:tecnico, tecnicoNome:tecnico, responsavelLogin:state.session?.name||'', responsavelPerfil:state.session?.role||'', verificadorEntrega:verificador, relato:($('relato')?.value||'').trim(), diagnostico:($('diagnostico')?.value||'').trim(), itens, fotosGerais:fotoUrls.length, fotoUrls, fotosGeraisUrls:fotoUrls, itemPhotos:itemFotos, itemFotos, temAudio:!!state.audioUrl, stats:stats(), criadoEm:nowISO(), atualizadoEm:nowISO() };
}
async function saveChecklist(){
  if(!placaNorm($('placa')?.value||'')) { toast('Informe a placa antes de salvar.'); go('screenInicio'); return null; }
  let payload=null;
  setBusy('btnSalvar',true,'Enviando fotos/salvando...');
  try{
    await uploadAllPendingPhotos();
    payload=payloadBase();
    const db=activeDb();
    if(state.lastSavedId){ await db.collection('checklists').doc(state.lastSavedId).set(payload,{merge:true}); payload.id=state.lastSavedId; }
    else { const ref=await db.collection('checklists').add(payload); state.lastSavedId=ref.id; payload.id=ref.id; await ref.set({id:ref.id},{merge:true}); }
    localStorage.setItem('OFICINIA_CHECKLIST_LAST_'+payload.placa, JSON.stringify(payload));
    let msg='Checklist salvo no Firebase.';
    if(payload.osRef || payload.osId){
      const linked=await anexarPayloadNaOS(payload,false,true);
      msg = linked ? 'Checklist salvo e anexado na O.S. do Jarvis.' : 'Checklist salvo. Não encontrei a O.S. informada para anexar.';
    }
    toast(msg);
    renderResumo();
    return payload;
  }catch(e){ console.warn(e); payload=payload||payloadBase(); localStorage.setItem('OFICINIA_CHECKLIST_LOCAL_'+payload.id, JSON.stringify(payload)); toast('Firebase/Cloudinary bloqueou ou está offline. Checklist salvo localmente.'); return payload; }
  finally{ setBusy('btnSalvar',false); }
}

function resumoCotacao(base=payloadBase()){
  const pecas=rowsCotacaoPecas(base);
  const servicos=rowsServicos(base);
  const avaliar=(base.itens||[]).filter(i=>['atencao','revisar'].includes(i.acao));
  const qtdPecas=pecas.reduce((s,r)=>s+(Number(r.Quantidade)||0),0);
  return {pecas, servicos, avaliar, qtdPecas, tiposPecas:pecas.length};
}
function renderResumo(){
  const box=$('resumoLista'); if(!box) return;
  const base=payloadBase();
  const crit=base.itens.filter(i=>ACTIONS_FINAL.has(i.acao));
  const res=resumoCotacao(base);
  $('resumoPill').textContent = state.lastSavedId ? `Editando ${state.lastSavedId}` : `${res.qtdPecas} peça(s) / ${res.servicos.length} serviço(s)`;
  if($('btnSalvar')) $('btnSalvar').textContent = state.lastSavedId ? '💾 Salvar alterações' : '✅ Salvar checklist';
  if($('btnExcluirAtual')) $('btnExcluirAtual').disabled = !state.lastSavedId || !isGestor();
  const modoEdicao = state.lastSavedId?`<div class="notice warn"><b>Modo edição:</b> este checklist já foi salvo. Se alterar e tocar em “Salvar alterações”, o registro ${esc(state.lastSavedId)} será atualizado.</div>`:'';
  const kpis = `<div class="quote-summary"><div class="quote-card"><b>${res.qtdPecas}</b><span>peça(s) para cotar/comprar</span></div><div class="quote-card"><b>${res.tiposPecas}</b><span>tipo(s) de peça</span></div><div class="quote-card"><b>${res.servicos.length}</b><span>serviço(s)/conserto(s)</span></div><div class="quote-card"><b>${res.avaliar.length}</b><span>itens para avaliar</span></div></div>`;
  const pecasHtml = res.pecas.length ? res.pecas.map(r=>`<div class="res-line quote-line"><b>${esc(r.Quantidade||1)}x ${esc(r.PecaSolicitada||r.Componente)}</b><span class="pill bad">${esc(r.Acao)}</span><small>${esc(r.Sistema)}${r.Posicao?' • '+esc(r.Posicao):''}${r.Motivo?' • Obs.: '+esc(r.Motivo):''}</small></div>`).join('') : '<div class="notice">Nenhuma peça para compra/cotação. Itens OK e N/A não entram aqui.</div>';
  const servHtml = res.servicos.length ? res.servicos.map(r=>`<div class="res-line quote-line"><b>${esc(r.ServicoOuComponente)}</b><span class="pill warn">${esc(r.Acao)}</span><small>${esc(r.Sistema)}${r.Posicao?' • '+esc(r.Posicao):''}${r.ObservacaoTecnica?' • Obs.: '+esc(r.ObservacaoTecnica):''}</small></div>`).join('') : '<div class="notice">Nenhum serviço/conserto separado.</div>';
  const tecnicoHtml = crit.length ? `<details class="tech-details"><summary>Ver lista técnica completa (${crit.length})</summary>${crit.map(i=>`<div class="res-line"><b>${esc(i.secao)} • ${esc(i.item)}</b><span class="pill ${esc(actionInfo(i.acao).classe)}">${esc(actionInfo(i.acao).emoji)} ${esc(i.acaoLabel)}</span>${i.obs?`<small>${esc(i.obs)}</small>`:''}</div>`).join('')}</details>` : '<div class="notice">Nenhum item crítico. Se necessário, gere PDF mesmo assim para registrar a avaliação.</div>';
  box.innerHTML = modoEdicao + `<div class="notice"><b>Resumo fácil para orçamento:</b> veja primeiro quantas peças comprar, quais posições/lados e quais serviços executar. O relatório técnico completo fica separado.</div>` + kpis + `<h3 class="mini-title">🧾 Peças para cotação / compra</h3>${pecasHtml}<h3 class="mini-title">🔧 Serviços / consertos</h3>${servHtml}<h3 class="mini-title">📋 Registro técnico</h3>${tecnicoHtml}`;
}


function osIdent(o){
  if(!o) return '';
  const raw=o.numero||o.codigo||o.osRef||o.referencia||o.prisma||o.numeroPrisma||'';
  return String(raw || (o.id ? 'OS '+String(o.id).slice(-6).toUpperCase() : '')).trim();
}
function osStatusTxt(o){ return String(o?.status||o?.etapa||o?.situacao||o?.fase||'status não informado').trim(); }
function osAberta(o){
  const st=norm(osStatusTxt(o));
  return !/(entreg|finaliz|cancel|fechad|concluid|arquivad|baixad)/.test(st);
}
function osClienteTxt(o){ return String(o?.clienteNome||o?.nomeCliente||o?.cliente?.nome||o?.cliente||'Cliente não informado').trim(); }
function osVeiculoTxt(o){ return String(o?.veiculoLabel||o?.veiculoModelo||o?.veiculoSnapshot?.modelo||o?.veiculo?.modelo||o?.modelo||o?.veiculo||'Veículo não informado').trim(); }
function osKmTxt(o){ return String(o?.km||o?.quilometragem||o?.odometro||o?.veiculoKm||'').trim(); }
function osDataVal(o){ return o?.criadoEm||o?.createdAt||o?.data||o?.dataAbertura||o?.atualizadoEm||''; }
function renderOSSelecionadaInfo(){
  const box=$('osSelecionadaInfo'); if(!box) return;
  const os=state.osSelecionada; const osRef=($('osRef')?.value||'').trim();
  if(os){
    box.className='notice';
    box.innerHTML=`<b>O.S. selecionada:</b> ${esc(osIdent(os)||os.label||os.id||osRef)}<br>${esc(osClienteTxt(os))} • ${esc(osVeiculoTxt(os))} • ${esc(osStatusTxt(os))}<br><small>Ao salvar, o checklist será anexado nessa O.S. do Jarvis.</small>`;
  } else if(osRef){
    box.className='notice warn';
    box.innerHTML=`<b>O.S./referência manual:</b> ${esc(osRef)}<br><small>Para evitar erro, prefira digitar a placa e tocar em “Buscar/selecionar O.S. pela placa”.</small>`;
  } else {
    box.className='notice';
    box.innerHTML='Digite a placa e toque em <b>Buscar/selecionar O.S. pela placa</b>. O mecânico não precisa decorar número de O.S.';
  }
}
function selecionarOS(id){
  const os=(state.history.os||[]).find(o=>String(o.id)===String(id));
  if(!os) return toast('Não encontrei essa O.S. na lista carregada.');
  state.osSelecionada={...os, label:osIdent(os)};
  const placa=placaNorm(os.placa||os.placaNorm||os.veiculo?.placa||os.veiculoSnapshot?.placa||$('placa')?.value||'');
  if(placa && $('placa')) $('placa').value=placa;
  if($('osRef')) $('osRef').value=osIdent(os)||os.id||'';
  const km=osKmTxt(os); if(km && $('km') && !$('km').value) $('km').value=km;
  const relato=String(os.relato||os.descricao||os.desc||os.diagnostico||'').trim(); if(relato && $('relato') && !$('relato').value) $('relato').value=relato.slice(0,500);
  saveDraft(); renderOSSelecionadaInfo(); renderHistorico(); toast('O.S. selecionada. Agora preencha o checklist e salve.');
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
    out.os.sort((a,b)=>Number(osAberta(b))-Number(osAberta(a)) || new Date(osDataVal(b)||0)-new Date(osDataVal(a)||0));
    state.history=out; renderHistorico();
  }catch(e){ console.warn(e); toast('Histórico indisponível. Checklist continua funcionando.'); }
  finally{ setBusy('btnHistorico',false); saveDraft(); }
}
function renderHistorico(){
  const box=$('historicoBox'); if(!box) return;
  const {os,checklists,entregas}=state.history;
  const html=[];
  html.push(`<div class="notice"><b>Histórico da placa ${esc(placaNorm($('placa').value))}</b><br>O.S.: ${os.length} • Checklists: ${checklists.length} • Entregas: ${entregas.length}</div>`);
  os.slice(0,12).forEach(o=>{ const sel=state.osSelecionada && String(state.osSelecionada.id)===String(o.id); html.push(`<div class="hist"><b>${sel?'✅ ':''}O.S. ${esc(osIdent(o)||o.id)} ${osAberta(o)?'<span class="pill ok">Aberta</span>':'<span class="pill">Histórica</span>'}</b><small>${esc(osClienteTxt(o))} • ${esc(osVeiculoTxt(o))} • ${esc(osStatusTxt(o))} • ${fmtDateTime(osDataVal(o))}</small><div class="actions"><button class="btn ok small" data-select-os="${esc(o.id)}" type="button">🔗 Usar esta O.S.</button><button class="btn secondary small" data-copy-os="${esc(osIdent(o)||o.id)}" type="button">Copiar nº</button></div></div>`); });
  checklists.slice(0,8).forEach(c=>html.push(`<div class="hist"><b>Checklist ${esc(c.id)}</b><small>${fmtDateTime(c.criadoEm||c.createdAt)} • ${esc(c.responsavel||c.mecanico||'')} • Trocar: ${onlyFinite(c.stats?.trocar)}</small><div class="actions"><button class="btn secondary small" data-load-hist="${esc(c.id)}" type="button">✏️ Editar</button><button class="btn secondary small" data-pdf-hist="${esc(c.id)}" type="button">📄 PDF</button>${isGestor()?`<button class="btn bad small" data-del-check="${esc(c.id)}" data-col="${esc(c._col||'checklists')}" type="button">🗑️ Excluir</button>`:''}</div></div>`));
  box.innerHTML=html.join('');
  $$('[data-select-os]',box).forEach(b=>b.addEventListener('click',()=>selecionarOS(b.dataset.selectOs)));
  $$('[data-copy-os]',box).forEach(b=>b.addEventListener('click',async()=>{ try{ await navigator.clipboard.writeText(b.dataset.copyOs||''); toast('Número da O.S. copiado.'); }catch(e){ toast('O.S.: '+(b.dataset.copyOs||'')); } }));
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
  $$('[data-select-os]',box).forEach(b=>b.addEventListener('click',()=>selecionarOS(b.dataset.selectOs)));
  $$('[data-copy-os]',box).forEach(b=>b.addEventListener('click',async()=>{ try{ await navigator.clipboard.writeText(b.dataset.copyOs||''); toast('Número da O.S. copiado.'); }catch(e){ toast('O.S.: '+(b.dataset.copyOs||'')); } }));
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
  state.itemPhotos=c.itemPhotos||c.itemFotos||{}; state.generalPhotos=c.fotoUrls||c.fotosGeraisUrls||[];
  $('placa').value=c.placa||'';
  $('osRef').value=c.osRef||c.osNumero||''; state.osSelecionada=c.osId?{id:c.osId,_col:c.osColecao||'ordens_servico',numero:c.osNumero||c.osRef,label:c.osLabel||c.osNumero||c.osRef,status:c.osStatus||'',clienteNome:c.osCliente||'',veiculoLabel:c.osVeiculo||''}:null;
  $('km').value=c.km||'';
  if($('tecnicoChecklist')) $('tecnicoChecklist').value=c.tecnicoChecklist||c.tecnicoNome||c.responsavel||state.session?.name||'';
  if($('verificadorEntrega')) $('verificadorEntrega').value=c.verificadorEntrega||state.session?.name||'';
  if($('conferente')) $('conferente').value=c.verificadorEntrega||state.session?.name||'';
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
function entregaPayloadBase(){
  const base=payloadBase();
  const itens=getCriticalItems().map(i=>({checklistItemId:i.id, item:i.item, secao:i.secao, acao:i.acao, acaoLabel:i.acaoLabel, diagnosticoObs:i.obs, fotos:i.fotos||0, fotoUrls:i.fotoUrls||[], entrega:state.delivery[i.id]||{status:'pendente'}}));
  const dataEntrega=($('entregaData')?.value||'').trim();
  return {id:uid(), checklistId:state.lastSavedId||base.id, tenantId:base.tenantId, oficinaNome:base.oficinaNome, placa:base.placa, osRef:base.osRef, osId:base.osId, osColecao:base.osColecao, osNumero:base.osNumero, osLabel:base.osLabel, km:base.km, tecnicoChecklist:base.tecnicoChecklist||base.responsavel, responsavel:base.responsavel, conferente:($('conferente')?.value||$('verificadorEntrega')?.value||state.session?.name||'').trim(), verificadorEntrega:($('verificadorEntrega')?.value||$('conferente')?.value||state.session?.name||'').trim(), entreguePor:($('entregaEntreguePor')?.value||'').trim(), recebidoPor:($('entregaRecebidoPor')?.value||'').trim(), documentoRecebedor:($('entregaDoc')?.value||'').trim(), dataEntrega:dataEntrega||nowISO(), perfil:state.session?.role||'', status:$('entregaStatus')?.value||'em_conferencia', observacaoFinal:$('entregaObs')?.value||'', itens, fotoUrls:base.fotoUrls||[], fotosGeraisUrls:base.fotoUrls||[], itemPhotos:base.itemPhotos||{}, itemFotos:base.itemFotos||{}, criadoEm:nowISO(), atualizadoEm:nowISO(), app:'OFICIN-IA-CHECKLIST-V15-16', versao:'v15.16', registroEntrega:true};
}
async function saveEntrega(){
  setBusy('btnSalvarEntrega',true,'Salvando entrega...');
  let payload=null;
  try{
    await uploadAllPendingPhotos();
    payload=entregaPayloadBase();
    const ref=await activeDb().collection('checklistsEntrega').add(payload);
    payload.id=ref.id; await ref.set({id:ref.id},{merge:true});
    const linked=await anexarPayloadNaOS(payload,true,true);
    toast(linked?'Registro de entrega salvo e anexado na O.S.':'Entrega salva no Firebase. Não encontrei a O.S. para anexar.');
    return payload;
  }
  catch(e){ console.warn(e); payload=payload||entregaPayloadBase(); localStorage.setItem('OFICINIA_ENTREGA_LOCAL_'+payload.id,JSON.stringify(payload)); toast('Entrega salva localmente. Firebase/Cloudinary bloqueou ou está offline.'); return payload; }
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
async function gerarPDF(source){
  const data=source||payloadBase(); const jsPDF=window.jspdf?.jsPDF; if(!jsPDF){ toast('Biblioteca PDF não carregou.'); return; }
  const doc=new jsPDF({unit:'mm',format:'a4'}); let y=0;
  doc.setFillColor(15,23,42); doc.rect(0,0,210,30,'F');
  doc.setFillColor(37,99,235); doc.circle(17,15,7,'F');
  doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.text(data.registroEntrega?'REGISTRO DE ENTREGA':'CHECKLIST TÉCNICO INTELIGENTE',28,14);
  doc.setFontSize(8.5); doc.setFont('helvetica','normal'); doc.text('Avaliação técnica • fotos • histórico por placa • integração com O.S.',28,21);
  doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.text('OFICIN-IA',17,16,{align:'center'});
  y=38;
  doc.setFillColor(248,250,252); doc.roundedRect(10,y,190,31,3,3,'F'); doc.setDrawColor(226,232,240); doc.roundedRect(10,y,190,31,3,3,'S');
  doc.setFont('helvetica','bold'); doc.setFontSize(8.2); doc.setTextColor(71,85,105);
  doc.text('PLACA',16,y+7); doc.text('O.S.',52,y+7); doc.text('KM',84,y+7); doc.text('TÉCNICO',111,y+7); doc.text('CONFERENTE',158,y+7);
  doc.setTextColor(15,23,42); doc.setFontSize(10.5);
  doc.text(String(data.placa||'-'),16,y+16); doc.text(String(data.osRef||data.osNumero||'-').slice(0,14),52,y+16); doc.text(String(data.km||'-'),84,y+16); doc.text(String(data.tecnicoChecklist||data.tecnicoNome||data.responsavel||'-').slice(0,24),111,y+16); doc.text(String(data.verificadorEntrega||data.conferente||'-').slice(0,22),158,y+16);
  doc.setFont('helvetica','normal'); doc.setFontSize(7.8); doc.setTextColor(71,85,105);
  doc.text(`Oficina: ${data.oficinaNome||state.session?.oficinaNome||'-'}`,16,y+25); doc.text(`Gerado em: ${fmtDateTime(data.criadoEm||nowISO())}`,126,y+25); y+=38;
  const st=data.stats||{}; const boxes=[['OK',st.ok||0,[22,163,74]],['ATENÇÃO',st.atencao||0,[217,119,6]],['TROCAR',st.trocar||0,[220,38,38]],['AÇÕES TÉCNICAS',st.tecnicas||0,[14,165,233]],['PENDENTES',st.pending||0,[100,116,139]]];
  boxes.forEach((b,i)=>{ const x=10+i*38; doc.setFillColor(255,255,255); doc.setDrawColor(226,232,240); doc.roundedRect(x,y,36,18,3,3,'FD'); doc.setFillColor(...b[2]); doc.circle(x+7,y+9,3.2,'F'); doc.setTextColor(15,23,42); doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text(String(b[1]),x+15,y+8); doc.setFontSize(6.8); doc.setTextColor(100,116,139); doc.text(b[0],x+15,y+14); });
  y+=25;
  if(data.relato){ y=pdfEnsurePage(doc,y); doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(15,23,42); doc.text('Relato do cliente',12,y); y+=5; doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(51,65,85); y=pdfLine(doc,data.relato,12,y,186)+3; }
  if(data.diagnostico){ y=pdfEnsurePage(doc,y); doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(15,23,42); doc.text('Diagnóstico técnico',12,y); y+=5; doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(51,65,85); y=pdfLine(doc,data.diagnostico,12,y,186)+3; }
  if(data.registroEntrega){
    y=pdfSectionHeader(doc,'Registro de entrega',y);
    doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(51,65,85);
    y=pdfLine(doc,`Status: ${data.status||'-'} • Entregue por: ${data.entreguePor||'-'} • Recebido por: ${data.recebidoPor||'-'} • Documento/telefone: ${data.documentoRecebedor||'-'} • Data/hora: ${fmtDateTime(data.dataEntrega||data.criadoEm)}`,12,y,186)+2;
    if(data.observacaoFinal) y=pdfLine(doc,'Observação final: '+data.observacaoFinal,12,y,186)+3;
  }
  const itens=(data.itens||[]).filter(i=>i.acao || i.entrega);
  const groups={}; itens.forEach(i=>{ const key=i.secao||'Geral'; groups[key]=groups[key]||[]; groups[key].push(i); });
  Object.entries(groups).forEach(([sec,arr])=>{
    y=pdfSectionHeader(doc,sec,y);
    arr.forEach(i=>{
      y=pdfEnsurePage(doc,y+5);
      pdfStatusBadge(doc,i.acao,12,y);
      doc.setFont('helvetica','bold'); doc.setFontSize(8.7); doc.setTextColor(15,23,42);
      doc.text(String(i.item||'Item').slice(0,76),31,y);
      doc.setFont('helvetica','normal'); doc.setFontSize(7.4); doc.setTextColor(71,85,105);
      const meta=[]; if(i.acaoLabel) meta.push('Ação: '+i.acaoLabel); if(i.entrega?.status) meta.push('Entrega: '+i.entrega.status); if(i.criticidade&&i.criticidade!=='normal') meta.push('Criticidade: '+i.criticidade); if(i.fotos) meta.push('Fotos: '+i.fotos); if(i.updatedBy) meta.push('Por: '+i.updatedBy);
      if(meta.length) doc.text(meta.join(' • ').slice(0,110),31,y+4.3);
      y+=8;
      if(i.obs || i.diagnosticoObs || i.entrega?.obs){ doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(51,65,85); y=pdfLine(doc,'Obs.: '+(i.obs||i.diagnosticoObs||i.entrega?.obs),31,y,158)+1; }
      doc.setDrawColor(226,232,240); doc.line(12,y,198,y); y+=3;
    });
  });
  const photos=allPhotoEntries(source?data:undefined).slice(0,24);
  if(photos.length){
    y=pdfSectionHeader(doc,`Fotos anexadas (${photos.length})`,y+4);
    let col=0;
    for(const ph of photos){
      if(y+34>270){ pdfFooter(doc); doc.addPage(); y=14; col=0; }
      const x=12 + col*47; const yy=y;
      const img=await imageForPdf(ph.url);
      doc.setDrawColor(226,232,240); doc.roundedRect(x,yy,42,30,2,2,'S');
      if(img){ try{ doc.addImage(img,'JPEG',x+1,yy+1,40,24,undefined,'FAST'); }catch(e){ try{ doc.addImage(img,'PNG',x+1,yy+1,40,24,undefined,'FAST'); }catch(_){ doc.text('Imagem',x+14,yy+14); } } }
      doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(71,85,105); doc.text(String(ph.label||'Foto').slice(0,24),x+1,yy+28);
      col++; if(col>=4){ col=0; y+=34; }
    }
    if(col) y+=34;
  }
  y=pdfEnsurePage(doc,y+14); doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(15,23,42); doc.text('Assinaturas / conferência',12,y); y+=15;
  doc.setDrawColor(100,116,139); doc.line(12,y,70,y); doc.line(78,y,136,y); doc.line(144,y,198,y);
  doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(100,116,139); doc.text('Responsável técnico',41,y+4,{align:'center'}); doc.text('Gestor / conferente',107,y+4,{align:'center'}); doc.text('Cliente / recebimento',171,y+4,{align:'center'});
  const total=doc.internal.getNumberOfPages(); for(let i=1;i<=total;i++){ doc.setPage(i); pdfFooter(doc); }
  doc.save(`${data.registroEntrega?'entrega':'checklist'}_${data.placa||'veiculo'}_${new Date().toISOString().slice(0,10)}.pdf`);
}

function gerarPDFEntrega(){ gerarPDF(entregaPayloadBase()); }

function inferPosicao(item){
  const t=norm(item?.item||item?.titulo||'');
  if(t.includes('dianteir') && t.includes('esquerd')) return 'Dianteiro esquerdo';
  if(t.includes('dianteir') && t.includes('direit')) return 'Dianteiro direito';
  if(t.includes('traseir') && t.includes('esquerd')) return 'Traseiro esquerdo';
  if(t.includes('traseir') && t.includes('direit')) return 'Traseiro direito';
  if(t.includes('dianteir')) return 'Dianteiro';
  if(t.includes('traseir')) return 'Traseiro';
  if(t.includes('esquerd')) return 'Esquerdo';
  if(t.includes('direit')) return 'Direito';
  if(t.includes('motorista')) return 'Motorista';
  if(t.includes('passageiro')) return 'Passageiro';
  if(t.includes('porta malas')||t.includes('tampa traseira')) return 'Traseira/porta-malas';
  return '';
}
function tipoOrcamentoPorAcao(acao){
  if(acao==='trocar') return 'PEÇA';
  if(['retificar','regular','ajustar','lubrificar','limpar'].includes(acao)) return 'SERVIÇO';
  if(['revisar','atencao'].includes(acao)) return 'AVALIAR';
  return '';
}
function isAcaoOrcavel(acao){ return !!tipoOrcamentoPorAcao(acao); }
function qVal(i,k,def=''){ return (i.cotacao&&i.cotacao[k]!==undefined&&i.cotacao[k]!==null&&i.cotacao[k]!=='') ? i.cotacao[k] : def; }
function itemTipoCotacao(i){ return qVal(i,'tipo', tipoCotacaoPadrao(i.acao,{titulo:i.item})); }
function itemQuantidade(i){ const q=Number(qVal(i,'qtd', i.acao==='trocar'?1:0)); return Number.isFinite(q)&&q>0?q:''; }
function itemPecaSolicitada(i){ return qVal(i,'peca', pecaSolicitadaPadrao({titulo:i.item},i.acao)); }
function itemPosicaoCotacao(i){ return qVal(i,'posicao', inferPosicao(i)); }
function rowsCotacaoPecas(base){
  return (base.itens||[]).filter(i=>{
    const tipo=itemTipoCotacao(i);
    return i.acao && i.acao!=='ok' && i.acao!=='na' && (tipo==='PEÇA'||tipo==='PEÇA + SERVIÇO'||i.acao==='trocar');
  }).map(i=>({
    Quantidade:itemQuantidade(i)||1, PecaSolicitada:itemPecaSolicitada(i), Posicao:itemPosicaoCotacao(i), Sistema:i.secao||'', Componente:i.item||'', Acao:i.acaoLabel||i.acao,
    Motivo:i.obs||'', Criticidade:i.criticidade||'', Fotos:i.fotos||0, LinksFotos:(i.fotoUrls||[]).join(' | '), Fornecedor:qVal(i,'fornecedor',''), Marca:qVal(i,'marca',''), Codigo:qVal(i,'codigo',''), ValorUnitario:qVal(i,'valor',''), Disponibilidade:'', Aprovado:'', ObservacaoCompras:''
  }));
}
function rowsServicos(base){
  return (base.itens||[]).filter(i=>{
    const tipo=itemTipoCotacao(i);
    return i.acao && i.acao!=='ok' && i.acao!=='na' && (tipo==='SERVIÇO'||tipo==='PEÇA + SERVIÇO'||['retificar','regular','ajustar','lubrificar','limpar'].includes(i.acao));
  }).map(i=>({
    Sistema:i.secao||'', ServicoOuComponente:itemPecaSolicitada(i)||i.item||'', Posicao:itemPosicaoCotacao(i), Acao:i.acaoLabel||i.acao,
    Tipo:itemTipoCotacao(i), Prioridade:i.criticidade==='critico'?'Alta':(i.criticidade==='importante'?'Média':'Normal'),
    ObservacaoTecnica:i.obs||'', MaoDeObra:'', ValorMaoDeObra:'', Status:'Aguardando orçamento', Aprovado:''
  }));
}
function rowsOrcamentoCliente(base){
  return (base.itens||[]).filter(i=>isAcaoOrcavel(i.acao)).map(i=>({
    Grupo: itemTipoCotacao(i)==='PEÇA' ? 'Peça necessária' : (itemTipoCotacao(i)==='SERVIÇO' ? 'Serviço necessário' : (itemTipoCotacao(i)==='PEÇA + SERVIÇO'?'Peça + serviço':'Recomendado / avaliar')),
    Quantidade:itemQuantidade(i)||'', Item:itemPecaSolicitada(i)||i.item||'', Sistema:i.secao||'', Acao:i.acaoLabel||i.acao, Posicao:itemPosicaoCotacao(i),
    Explicacao:i.obs||'', Prioridade:i.criticidade==='critico'?'Crítico':(i.criticidade==='importante'?'Importante':'Normal'), ValorPecas:'', ValorServico:'', Total:'', AprovadoCliente:''
  }));
}
async function gerarPDFOrcamento(){
  const data=payloadBase(); const jsPDF=window.jspdf?.jsPDF; if(!jsPDF){ toast('Biblioteca PDF não carregou.'); return; }
  const pecas=rowsCotacaoPecas(data); const servs=rowsServicos(data); const qtd=pecas.reduce((s,r)=>s+(Number(r.Quantidade)||0),0);
  const doc=new jsPDF({unit:'mm',format:'a4'}); let y=0;
  doc.setFillColor(15,23,42); doc.rect(0,0,210,30,'F');
  doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.text('RESUMO PARA COTAÇÃO E ORÇAMENTO',12,13);
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.text('Peças separadas por quantidade/posição + serviços/consertos para aprovação',12,21);
  y=38; doc.setTextColor(15,23,42); doc.setFont('helvetica','bold'); doc.setFontSize(9);
  doc.text(`Placa: ${data.placa||'-'}   O.S.: ${data.osRef||data.osNumero||'-'}   KM: ${data.km||'-'}   Técnico: ${data.tecnicoChecklist||data.responsavel||'-'}`.slice(0,118),12,y); y+=8;
  const cards=[['PEÇAS',`${qtd} un. / ${pecas.length} tipo(s)`],['SERVIÇOS',`${servs.length}`],['ATENÇÃO/REVISAR',`${(data.itens||[]).filter(i=>['atencao','revisar'].includes(i.acao)).length}`]];
  cards.forEach((c,i)=>{ const x=12+i*62; doc.setFillColor(248,250,252); doc.setDrawColor(226,232,240); doc.roundedRect(x,y,56,17,2,2,'FD'); doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(15,23,42); doc.text(c[1],x+4,y+7); doc.setFontSize(6.8); doc.setTextColor(100,116,139); doc.text(c[0],x+4,y+13); }); y+=25;
  const tableHeader=(titulo)=>{ y=pdfSectionHeader(doc,titulo,y+2); doc.setFont('helvetica','bold'); doc.setFontSize(7.2); doc.setTextColor(71,85,105); doc.text('QTD',12,y); doc.text('PEÇA / SERVIÇO',25,y); doc.text('POSIÇÃO',96,y); doc.text('AÇÃO',135,y); doc.text('OBS.',158,y); y+=4; doc.setDrawColor(203,213,225); doc.line(12,y,198,y); y+=3; };
  tableHeader('1. Peças para cotar/comprar');
  if(!pecas.length){ doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.text('Nenhuma peça para cotação.',12,y); y+=8; }
  pecas.forEach((r,idx)=>{ y=pdfEnsurePage(doc,y+7); doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(15,23,42); doc.text(String(r.Quantidade||1),12,y); doc.text(String(r.PecaSolicitada||r.Componente||'').slice(0,38),25,y); doc.setFont('helvetica','normal'); doc.setFontSize(7.2); doc.setTextColor(51,65,85); doc.text(String(r.Posicao||'-').slice(0,22),96,y); doc.text(String(r.Acao||'-').slice(0,16),135,y); doc.text(String(r.Motivo||'').slice(0,28),158,y); y+=6; doc.setDrawColor(226,232,240); doc.line(12,y,198,y); });
  tableHeader('2. Serviços / consertos');
  if(!servs.length){ doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.text('Nenhum serviço separado.',12,y); y+=8; }
  servs.forEach((r)=>{ y=pdfEnsurePage(doc,y+7); doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(15,23,42); doc.text('-',12,y); doc.text(String(r.ServicoOuComponente||'').slice(0,38),25,y); doc.setFont('helvetica','normal'); doc.setFontSize(7.2); doc.setTextColor(51,65,85); doc.text(String(r.Posicao||'-').slice(0,22),96,y); doc.text(String(r.Acao||'-').slice(0,16),135,y); doc.text(String(r.ObservacaoTecnica||'').slice(0,28),158,y); y+=6; doc.setDrawColor(226,232,240); doc.line(12,y,198,y); });
  y=pdfEnsurePage(doc,y+12); doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.text('Assinaturas / aprovação',12,y); y+=16;
  doc.setDrawColor(100,116,139); doc.line(12,y,70,y); doc.line(78,y,136,y); doc.line(144,y,198,y);
  doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(100,116,139); doc.text('Responsável técnico',41,y+4,{align:'center'}); doc.text('Gestor / orçamento',107,y+4,{align:'center'}); doc.text('Cliente / aprovação',171,y+4,{align:'center'});
  const total=doc.internal.getNumberOfPages(); for(let i=1;i<=total;i++){ doc.setPage(i); pdfFooter(doc); }
  doc.save(`orcamento_cotacao_${data.placa||'veiculo'}_${new Date().toISOString().slice(0,10)}.pdf`);
}

function gerarXLSX(kind='checklist'){
  if(!window.XLSX){ toast('Biblioteca XLSX não carregou.'); return; }
  const base=payloadBase();
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{Placa:base.placa,OS:base.osRef,KM:base.km,Oficina:base.oficinaNome,Tecnico:base.tecnicoChecklist||base.responsavel,ConferenteEntrega:base.verificadorEntrega||'',FotosGerais:(base.fotoUrls||[]).length,Data:fmtDateTime(base.criadoEm),OK:base.stats.ok,Atencao:base.stats.atencao,Trocar:base.stats.trocar,AcoesTecnicas:base.stats.tecnicas,Pendentes:base.stats.pending}]),'Resumo');
  const rc=resumoCotacao(base);
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{TotalQuantidadePecas:rc.qtdPecas,TiposDePeca:rc.tiposPecas,ServicosConsertos:rc.servicos.length,ItensParaAvaliar:rc.avaliar.length,Observacao:'Use a aba Pecas_Para_Cotar para pedir peças e a aba Servicos_Consertos para mão de obra/consertos.'}]),'Resumo_Compra');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rowsCotacaoPecas(base)),'Pecas_Para_Cotar');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rowsServicos(base)),'Servicos_Consertos');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rowsOrcamentoCliente(base)),'Orcamento_Cliente');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(base.itens.map(i=>({Secao:i.secao,Item:i.item,Posicao:inferPosicao(i),Acao:i.acaoLabel||i.acao,TipoOrcamento:tipoOrcamentoPorAcao(i.acao),Obs:i.obs||'',Obrigatorio:i.obrigatorio?'Sim':'Não',Criticidade:i.criticidade||'',Fotos:i.fotos||0,LinksFotos:(i.fotoUrls||[]).join(' | '),AtualizadoPor:i.updatedBy||''}))),'Itens_Tecnicos');
  const entrega=getCriticalItems().map(i=>({Secao:i.secao,Item:i.item,Posicao:inferPosicao(i),AcaoTecnica:i.acaoLabel,StatusEntrega:state.delivery[i.id]?.status||'pendente',ObsEntrega:state.delivery[i.id]?.obs||'',Conferente:base.verificadorEntrega||'',EntreguePor:$('entregaEntreguePor')?.value||'',RecebidoPor:$('entregaRecebidoPor')?.value||'',DataEntrega:$('entregaData')?.value||''}));
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
    app:data?.app||'OFICIN-IA-CHECKLIST-V15-15',
    versao:data?.versao||'v15.15',
    placa:data?.placa||placaNorm($('placa')?.value||''),
    osRef:data?.osRef||($('osRef')?.value||'').trim(),
    osId:data?.osId||state.osSelecionada?.id||'',
    osColecao:data?.osColecao||state.osSelecionada?._col||'',
    osNumero:data?.osNumero||state.osSelecionada?.numero||state.osSelecionada?.codigo||'',
    osLabel:data?.osLabel||state.osSelecionada?.label||'',
    km:data?.km||($('km')?.value||'').trim(),
    oficinaNome:data?.oficinaNome||state.session?.oficinaNome||'',
    responsavel:data?.responsavel||data?.tecnicoChecklist||state.session?.name||'',
    tecnicoChecklist:data?.tecnicoChecklist||data?.tecnicoNome||data?.responsavel||state.session?.name||'',
    verificadorEntrega:data?.verificadorEntrega||data?.conferente||$('verificadorEntrega')?.value||'',
    responsavelPerfil:data?.responsavelPerfil||state.session?.role||'',
    fotoUrls:data?.fotoUrls||data?.fotosGeraisUrls||[],
    fotosGeraisUrls:data?.fotoUrls||data?.fotosGeraisUrls||[],
    itemPhotos:data?.itemPhotos||data?.itemFotos||{},
    itemFotos:data?.itemPhotos||data?.itemFotos||{},
    criadoEm:data?.criadoEm||nowISO(),
    atualizadoEm:nowISO(),
    stats:data?.stats||stats(),
    criticos:crit.slice(0,25).map(i=>({id:i.id,secao:i.secao,item:i.item,acao:i.acao,acaoLabel:i.acaoLabel,obs:i.obs||'',fotoUrls:i.fotoUrls||[]})),
    totalCriticos:crit.length,
    urlChecklist:location.href.split('#')[0]
  };
}
async function anexarPayloadNaOS(data, entrega=false, silencioso=false){
  const osRef=String(data?.osRef||$('osRef')?.value||'').trim();
  const osId=String(data?.osId||state.osSelecionada?.id||'').trim();
  if(!osRef && !osId){ if(!silencioso) toast('Informe ou selecione uma O.S. para anexar.'); return false; }
  const db=activeDb();
  const cols=[data?.osColecao||state.osSelecionada?._col||'', 'ordens_servico','ordensServico','os'].filter((v,i,a)=>v&&a.indexOf(v)===i);
  const resumo=checklistResumoParaOS(data,entrega);
  const fv=window.firebase?.firestore?.FieldValue;
  const update={ checklistAppUrl: location.href.split('#')[0] };
  if(entrega){
    update.checklistEntregaUltimo=resumo;
    update.checklistEntregaResumo=data;
    update.checklistEntregaAtualizadoEm=fv?.serverTimestamp ? fv.serverTimestamp() : nowISO();
    update.entregaRegistro=data;
    if(fv?.arrayUnion) update.checklistsEntrega=fv.arrayUnion(resumo);
  }else{
    update.checklistId=resumo.id;
    update.checklistResumo=data;
    update.checklistUltimo=resumo;
    update.checklistAtualizadoEm=fv?.serverTimestamp ? fv.serverTimestamp() : nowISO();
    if(fv?.arrayUnion) update.checklistsTecnicos=fv.arrayUnion(resumo);
  }
  for(const col of cols){
    try{
      for(const directId of [osId, osRef].filter((v,i,a)=>v&&a.indexOf(v)===i)){
        const byId=await db.collection(col).doc(directId).get();
        if(byId.exists){ await byId.ref.set(update,{merge:true}); return true; }
      }
      for(const f of ['numero','codigo','osRef','referencia','prisma','numeroPrisma']){
        const snap=await db.collection(col).where(f,'==',osRef).limit(1).get();
        if(!snap.empty){ await snap.docs[0].ref.set(update,{merge:true}); return true; }
      }
    }catch(e){ console.warn('anexar',col,e.message); }
  }
  return false;
}

async function anexarOS(entrega=false){
  const osRef=($('osRef').value||'').trim(); if(!osRef) return toast('Informe O.S./referência para anexar.');
  const data=entrega?entregaPayloadBase():payloadBase();
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
  $('placa')?.addEventListener('input',e=>{e.target.value=placaNorm(e.target.value); state.osSelecionada=null; renderOSSelecionadaInfo(); saveDraft();}); $('osRef')?.addEventListener('input',()=>{ state.osSelecionada=null; renderOSSelecionadaInfo(); saveDraft(); }); ['km','tecnicoChecklist','verificadorEntrega','conferente','entregaEntreguePor','entregaRecebidoPor','entregaDoc','entregaData','entregaObs','relato','diagnostico'].forEach(id=>$(id)?.addEventListener('input',saveDraft));
  $('btnHistorico')?.addEventListener('click',buscarHistorico); $('btnHistoricoFinal')?.addEventListener('click',()=>{go('screenInicio'); buscarHistorico();});
  $('btnConsultar')?.addEventListener('click',consultar); $('btnRodarConsulta')?.addEventListener('click',consultar); $('btnFecharConsulta')?.addEventListener('click',()=>go('screenInicio')); $('btnVoltarInicioConsulta')?.addEventListener('click',()=>go('screenInicio')); $('btnExportConsulta')?.addEventListener('click',gerarConsultaXLSX);
  $('buscaItem')?.addEventListener('input',renderSections);
  $('fotoGeral')?.addEventListener('change',e=>addPhotosToArray(e.target.files,state.generalPhotos,()=>{renderPhotos(); toast('Fotos gerais adicionadas.');}));
  $('btnDitarRelato')?.addEventListener('click',dictateRelato); $('btnAudio')?.addEventListener('click',toggleAudio);
  $('btnSalvar')?.addEventListener('click',saveChecklist); $('btnPDF')?.addEventListener('click',()=>gerarPDF()); $('btnPDFOrcamento')?.addEventListener('click',gerarPDFOrcamento); $('btnXLSX')?.addEventListener('click',()=>gerarXLSX('checklist')); $('btnA4')?.addEventListener('click',()=>printA4(false)); $('btnA4Topo')?.addEventListener('click',()=>printA4(false)); $('btnJSON')?.addEventListener('click',baixarJSON); $('btnAnexarOS')?.addEventListener('click',()=>anexarOS(false));
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
