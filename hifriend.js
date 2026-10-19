const SUPABASE_URL = "https://hocfvvitufiuizosshhd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_lopjGcuIrVTic-T97lujrA_TIhOSxiJ";
let supabaseClient=null,currentUser=null,currentProfile=null,enteringUserId=null;
function initSupabase(){
  try{
    if(!window.supabase || typeof window.supabase.createClient!=="function"){
      authMessage("Library Supabase belum termuat. Pastikan internet aktif lalu buka ulang file.");
      return false;
    }
    supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    });
    return true;
  }catch(e){
    console.error("Supabase init error",e);
    authMessage("Koneksi Supabase gagal diinisialisasi: "+(e.message||e));
    return false;
  }
}
function authMessage(msg,ok=false){const el=document.getElementById('authStatus');if(el){el.textContent=msg||'';el.className='authStatus'+(ok?' ok':'');}}
function setAuthBusy(b){const btn=document.getElementById('loginBtn');if(btn){btn.disabled=b;btn.textContent=b?'⏳ Memproses...':'🔐 Masuk';}}
async function loadProfile(user){
  let lastError=null;
  // Coba ambil kolom tariff; jika belum ada di DB, fallback tanpa tariff.
  const selects=['id,full_name,username,role,is_active,tariff','id,full_name,username,role,is_active'];
  for(let attempt=0;attempt<3;attempt++){
    for(const sel of selects){
      const {data,error}=await supabaseClient.from('profiles').select(sel).eq('id',user.id).single();
      if(!error&&data){
        if(!data.is_active) throw new Error('Akun ini sedang dinonaktifkan.');
        return data;
      }
      // Kolom tariff belum ada → coba select tanpa tariff
      if(error && (String(error.code||'')==='42703' || /column .*tariff.* does not exist/i.test(String(error.message||'')))){
        continue;
      }
      lastError=error||new Error('Profil pengguna tidak ditemukan.');
    }
    if(attempt<2) await new Promise(resolve=>setTimeout(resolve,350*(attempt+1)));
  }
  throw lastError;
}
async function enterApp(session){
 const sessionUser=session?.user||null;
 if(!sessionUser){
  document.getElementById('authGate').style.display='flex';
  document.getElementById('appShell').style.display='none';
  return;
 }
 if(enteringUserId===sessionUser.id) return;
 enteringUserId=sessionUser.id;
 currentUser=sessionUser;
 if(!currentUser){
  document.getElementById('authGate').style.display='flex';
  document.getElementById('appShell').style.display='none';
  return;
 }
 try{
  currentProfile=await loadProfile(currentUser);
  await loadAccountTariff();
  try{ await mappingLoadState(); }catch(e){ console.warn('Generated WO cloud restore gagal',e); }
  const isAdmin=currentProfile.role==='admin';
  const pill=document.getElementById('userPill');
  if(pill)pill.textContent='👤 '+(currentProfile.full_name||currentProfile.username||currentUser.email)+(isAdmin?' • ADMIN':' • TEKNISI');
  const shell=document.getElementById('appShell');
  if(shell) shell.classList.toggle('admin-mode',isAdmin);
  const ap=document.getElementById('adminPanel');
  if(ap)ap.style.display=isAdmin?'block':'none';
  const accountPanel=document.getElementById('accountPanel');
  if(accountPanel)accountPanel.style.display='none';
  const homeBtn=document.getElementById('tabHome');
  const homePanel=document.getElementById('homePanel');
  const msgBtn=document.getElementById('tabMsg');
  const msgTab=document.getElementById('msgTab');
  const accountBtn=document.getElementById('tabAccount');
  if(homeBtn)homeBtn.style.display=isAdmin?'none':'inline-flex';
  if(homePanel)homePanel.style.display='none';
  if(msgBtn)msgBtn.style.display=isAdmin?'none':'inline-flex';
  if(msgTab)msgTab.style.display='none';
  if(accountBtn)accountBtn.style.display=isAdmin?'none':'inline-flex';
  document.getElementById('authGate').classList.remove('authLoading');
  document.getElementById('authGate').style.display='none';
  document.getElementById('appShell').style.display='block';
  if(isAdmin){
    await adminLoadUsers();
    document.getElementById('adminPanel').style.display='block';
  }else{
    showTab('home');
    try{
      await loadDatabase();
    }catch(dbErr){
      console.error('Database bootstrap error',dbErr);
      const status=document.getElementById('dbStatus');
      if(status) status.textContent='Gagal memuat database: '+(dbErr.message||dbErr);
      // Jangan logout hanya karena database gagal dimuat.
    }
  }
 }catch(e){
  console.error('Enter app error',e);
  // Jangan logout hanya karena request profil/database gagal sesaat.
  // Logout hanya dilakukan untuk akun yang memang dinonaktifkan.
  const msg=String(e?.message||e||'Akun tidak dapat digunakan.');
  if(msg.toLowerCase().includes('dinonaktifkan')){
    await supabaseClient.auth.signOut();
    currentUser=null;
    currentProfile=null;
    document.getElementById('authGate').style.display='flex';
    document.getElementById('authGate').classList.remove('authLoading');
    document.getElementById('appShell').style.display='none';
  }else{
    document.getElementById('authGate').style.display='none';
    document.getElementById('appShell').style.display='block';
  }
  authMessage(msg);
 }finally{
  enteringUserId=null;
 }
}
async function handleLogin(ev){
  ev.preventDefault();
  if(!supabaseClient){authMessage('Koneksi Supabase belum siap. Coba buka ulang file.');return false;}
  setAuthBusy(true);
  authMessage('');
  const email=document.getElementById('loginEmail').value.trim();
  const password=document.getElementById('loginPassword').value;
  const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(error){
    authMessage(error.message||'Login gagal.');
    setAuthBusy(false);
    return false;
  }
  // onAuthStateChange akan masuk ke enterApp. Fallback ini hanya jika event belum terpanggil.
  if(data?.session && !currentProfile) await enterApp(data.session);
  setAuthBusy(false);
  return false;
}
async function handleLogout(){if(!(await swalConfirm('Keluar dari akun?','Sesi akun akan ditutup.','Keluar')))return;await supabaseClient.auth.signOut();currentUser=null;currentProfile=null;document.getElementById('appShell').style.display='none';document.getElementById('authGate').style.display='flex';document.getElementById('loginPassword').value='';authMessage('');}
async function bootAuth(){
  const gate=document.getElementById('authGate');
  if(gate) gate.classList.add('authLoading');
  if(!initSupabase()){ if(gate) gate.classList.remove('authLoading'); return; }
  try{
    supabaseClient.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT'){
        currentUser=null;
        currentProfile=null;
        document.getElementById('authGate').style.display='flex';
        document.getElementById('authGate').classList.remove('authLoading');
        document.getElementById('appShell').style.display='none';
        return;
      }
      if((event==='SIGNED_IN'||event==='TOKEN_REFRESHED'||event==='INITIAL_SESSION') && session && !currentUser){
        setTimeout(()=>enterApp(session),0);
      }
    });
    const {data,error}=await supabaseClient.auth.getSession();
    if(error) throw error;
    if(data?.session){
      await enterApp(data.session);
    }else{
      document.getElementById('authGate').style.display='flex';
      document.getElementById('authGate').classList.remove('authLoading');
      document.getElementById('appShell').style.display='none';
    }
  }catch(e){
    console.error('Auth bootstrap error',e);
    authMessage('Gagal menghubungkan ke Supabase: '+(e.message||e));
  }
}

function toIsoDate(display){
  const v=String(display||'').trim().toUpperCase();
  const iso=v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(iso)return iso[1]+'-'+String(iso[2]).padStart(2,'0')+'-'+String(iso[3]).padStart(2,'0');
  const numeric=v.match(/^(?:\D+[, ]*)?(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if(numeric)return numeric[3]+'-'+String(numeric[2]).padStart(2,'0')+'-'+String(numeric[1]).padStart(2,'0');
  const m=v.match(/(?:MINGGU|SENIN|SELASA|RABU|KAMIS|KAMUS|JUMAT|SABTU)?\s*,?\s*(\d{1,2})\s+([A-Z]+)\s+(\d{4})/),months={JANUARI:1,FEBRUARI:2,MARET:3,APRIL:4,MEI:5,JUNI:6,JULI:7,AGUSTUS:8,SEPTEMBER:9,OKTOBER:10,NOVEMBER:11,DESEMBER:12};
  if(!m||!months[m[2]])return null;
  return m[3]+'-'+String(months[m[2]]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');
}
function fromIsoDate(iso){const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return String(iso||'');const dt=new Date(Number(m[1]),Number(m[2])-1,Number(m[3])),days=['MINGGU','SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'],months=['JANUARI','FEBRUARI','MARET','APRIL','MEI','JUNI','JULI','AGUSTUS','SEPTEMBER','OKTOBER','NOVEMBER','DESEMBER'];return days[dt.getDay()]+' '+Number(m[3])+' '+months[Number(m[2])-1]+' '+m[1];}
function normalizeWoType(v){
  // Hanya RC yang ditandai; selain itu WO biasa (kosong).
  const t=String(v||'').trim().toUpperCase();
  return t==='RC'?'RC':'';
}
function isRc(v){ return normalizeWoType(v)==='RC'; }
function isMissingColumnError(error,col){
  if(!error)return false;
  const code=String(error.code||'');
  const msg=String(error.message||'');
  if(code==='42703')return true;
  if(col) return new RegExp('column .*'+col+'.* does not exist','i').test(msg);
  return /column .* does not exist/i.test(msg);
}
async function syncRowsToSupabase(rows){
  if(!supabaseClient||!rows?.length)return {saved:0,skipped:rows?.length||0};
  const {data:{user:authUser},error:authError}=await supabaseClient.auth.getUser();
  if(authError||!authUser)throw new Error('Sesi login Supabase tidak tersedia. Silakan login ulang.');
  currentUser=authUser;
  const payload=rows.map(r=>({
    user_id:authUser.id,
    customer_id:String(r.id||''),
    customer_name:String(r.name||''),
    tanggal_done:toIsoDate(r.date),
    panjang_kabel:Math.max(0,Math.round(parseFloat(String(r.precone||'').replace(',','.'))||0)),
    nominal:Number(r.nominal)||getTariff(),
    status:'DONE',
    sn:String(r.sn||'').trim(),
    wo_type:normalizeWoType(r.wo_type||r.woType),
    utang_sales:Math.max(0,Math.round(Number(r.utang_sales??r.utangSales)||0)),
    sales_note:String(r.sales_note||r.salesNote||'').trim(),
    utang_due_date:toIsoDate(r.utang_due_date||r.utangDueDate)||null
  })).filter(r=>r.customer_id&&r.tanggal_done);
  if(!payload.length)return {saved:0,skipped:0};
  const {data:existing,error:readError}=await supabaseClient.from('wo').select('customer_id,tanggal_done').eq('user_id',authUser.id);
  if(readError)throw readError;
  const existingSet=new Set((existing||[]).map(r=>`${r.customer_id}|${r.tanggal_done}`));
  const fresh=[];
  for(const r of payload){
    const key=`${r.customer_id}|${r.tanggal_done}`;
    if(existingSet.has(key))continue;
    existingSet.add(key);
    fresh.push(r);
  }
  if(fresh.length){
    let {error}=await supabaseClient.from('wo').insert(fresh);
    if(error && isMissingColumnError(error)){
      let legacy=fresh.map(({wo_type,utang_sales,sales_note,utang_due_date,...row})=>row);
      let retry=await supabaseClient.from('wo').insert(legacy);
      error=retry.error;
      if(error && isMissingColumnError(error,'sn')){
        legacy=legacy.map(({sn,...row})=>row);
        retry=await supabaseClient.from('wo').insert(legacy);
        error=retry.error;
      }
    }
    if(error){
      console.error('Supabase WO insert error',error, {authUserId:authUser.id, payload:fresh});
      throw new Error((error.message||'Gagal menyimpan WO')+' [code '+(error.code||'unknown')+']');
    }
  }
  return {saved:fresh.length,skipped:payload.length-fresh.length};
}
async function getRemoteWORows(){
  const fullSelect='id,customer_id,customer_name,tanggal_done,panjang_kabel,nominal,status,sn,wo_type,utang_sales,sales_note,utang_due_date,created_at';
  let q= supabaseClient.from('wo').select(fullSelect).eq('user_id',currentUser.id).order('created_at',{ascending:true}).order('id',{ascending:true});
  let {data,error}=await q;
  if(error && isMissingColumnError(error)){
    const mid=await supabaseClient.from('wo').select('id,customer_id,customer_name,tanggal_done,panjang_kabel,nominal,status,sn,wo_type,utang_sales,sales_note,created_at').eq('user_id',currentUser.id).order('created_at',{ascending:true}).order('id',{ascending:true});
    if(!mid.error){ data=mid.data; error=null; }
    else if(isMissingColumnError(mid.error)){
      const mid2=await supabaseClient.from('wo').select('id,customer_id,customer_name,tanggal_done,panjang_kabel,nominal,status,sn,created_at').eq('user_id',currentUser.id).order('created_at',{ascending:true}).order('id',{ascending:true});
      if(!mid2.error){ data=mid2.data; error=null; }
      else if(isMissingColumnError(mid2.error,'sn')){
        const fallback=await supabaseClient.from('wo').select('id,customer_id,customer_name,tanggal_done,panjang_kabel,nominal,status,created_at').eq('user_id',currentUser.id).order('created_at',{ascending:true}).order('id',{ascending:true});
        data=fallback.data; error=fallback.error;
      }else{ error=mid2.error; }
    }else{ error=mid.error; }
  }
  if(error)throw error;
  return (data||[]).map(r=>({
    key:'remote:'+r.id,
    remote_id:r.id,
    created_at:r.created_at||'',
    date:fromIsoDate(r.tanggal_done),
    id:r.customer_id||'',
    name:r.customer_name||'',
    sn:r.sn||'',
    precone:String(r.panjang_kabel??''),
    nominal:Number(r.nominal)||getTariff(),
    status:r.status||'DONE',
    wo_type:normalizeWoType(r.wo_type),
    utang_sales:Math.max(0,Math.round(Number(r.utang_sales)||0)),
    sales_note:String(r.sales_note||'').trim(),
    utang_due_date:r.utang_due_date||''
  }));
}

// ===== DATABASE SUPABASE (REMOTE ONLY) =====
let databaseRows=[];
let accountTariff=70000;
let activeDbChip='all';
const DB_PAGE_SIZE=10;
let dbCurrentPage=1;
let dbFilterSignature='';
function tariffStorageKey(){
  return 'hifriend_tariff_'+(currentUser?.id||'guest');
}
function applyTariffValue(n){
  const val=(Number.isFinite(Number(n))&&Number(n)>=0)?Math.round(Number(n)):70000;
  accountTariff=val;
  const input=document.getElementById('tariffInput');
  if(input) input.value=val;
  if(currentUser?.id) localStorage.setItem(tariffStorageKey(),String(val));
  return val;
}
async function loadAccountTariff(){
  // Prioritas: profil Supabase → cache localStorage → default 70000
  let val=70000;
  const fromProfile=Number(currentProfile?.tariff);
  if(Number.isFinite(fromProfile)&&fromProfile>=0){
    val=Math.round(fromProfile);
  }else if(currentUser?.id){
    // Ambil ulang dari server (jika kolom tariff sudah ada)
    try{
      if(supabaseClient){
        const {data,error}=await supabaseClient.from('profiles').select('tariff').eq('id',currentUser.id).maybeSingle();
        if(!error && data && data.tariff!=null){
          const n=Number(data.tariff);
          if(Number.isFinite(n)&&n>=0) val=Math.round(n);
        }else if(error && !(String(error.code||'')==='42703' || /column .*tariff.* does not exist/i.test(String(error.message||'')))){
          console.warn('load tariff',error);
        }
      }
    }catch(e){ console.warn('load tariff',e); }
    // Fallback cache lokal
    if(val===70000){
      const raw=localStorage.getItem(tariffStorageKey());
      const n=Number(raw);
      if(Number.isFinite(n)&&n>=0) val=Math.round(n);
    }
  }else{
    const raw=localStorage.getItem(tariffStorageKey());
    const n=Number(raw);
    if(Number.isFinite(n)&&n>=0) val=Math.round(n);
  }
  return applyTariffValue(val);
}
function getTariff(){
  return Number.isFinite(Number(accountTariff))&&Number(accountTariff)>=0?Number(accountTariff):70000;
}
async function saveTariff(){
  const input=document.getElementById('tariffInput');
  const n=Number(input?.value);
  if(!Number.isFinite(n)||n<0){swalNotice('Tarif tidak valid','Masukkan nominal tarif yang benar.','warning');return;}
  if(!currentUser?.id||!supabaseClient){swalNotice('Belum login','Login dulu agar tarif tersimpan di akun ini.','warning');return;}
  const val=Math.round(n);
  applyTariffValue(val);
  const status=document.getElementById('dbStatus');
  try{
    const {error}=await supabaseClient.from('profiles').update({tariff:val}).eq('id',currentUser.id);
    if(error){
      // Kolom belum ada di database
      if(String(error.code||'')==='42703' || /column .*tariff.* does not exist/i.test(String(error.message||''))){
        if(status) status.innerHTML='<span class="ok">✓ Tarif disimpan di perangkat ini. (Kolom tariff belum ada di database — jalankan SQL migrasi.)</span>';
        swalNotice('Tarif tersimpan lokal saja','Kolom tariff belum ada di tabel profiles. Jalankan SQL migrasi di Supabase agar tarif ikut tersimpan di server.','warning');
        return;
      }
      throw error;
    }
    if(currentProfile) currentProfile.tariff=val;
    if(status) status.innerHTML='<span class="ok">✓ Tarif WO akun ini disimpan di server: '+formatRupiah(val)+'.</span>';
    if(typeof swalToast==='function') swalToast('Tarif akun disimpan');
  }catch(e){
    console.error('saveTariff',e);
    if(status) status.textContent='Tarif gagal disimpan ke server: '+(e.message||e)+' (cache lokal tetap dipakai)';
    swalNotice('Gagal simpan ke server', (e.message||String(e))+' — tarif tetap tersimpan di perangkat ini.','error');
  }
}


async function getAllWORows(){
  if(!currentUser||!supabaseClient)return [];
  return await getRemoteWORows();
}

function formatMeter(n){return (Number(n)||0).toLocaleString('id-ID',{maximumFractionDigits:2})+' M';}
function dateKey(v){
  const value=String(v||'').trim().toUpperCase();
  const iso=value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(iso)return iso[1]+'-'+String(iso[2]).padStart(2,'0')+'-'+String(iso[3]).padStart(2,'0');
  const numeric=value.match(/^(?:\D+[, ]*)?(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if(numeric)return numeric[3]+'-'+String(numeric[2]).padStart(2,'0')+'-'+String(numeric[1]).padStart(2,'0');
  const m=value.match(/(?:SENIN|SELASA|RABU|KAMIS|KAMUS|JUMAT|SABTU|MINGGU)?\s*,?\s*(\d{1,2})\s+([A-Z]+)\s+(\d{4})/);
  if(!m)return '';
  const mo={JANUARI:0,FEBRUARI:1,MARET:2,APRIL:3,MEI:4,JUNI:5,JULI:6,AGUSTUS:7,SEPTEMBER:8,OKTOBER:9,NOVEMBER:10,DESEMBER:11};
  if(mo[m[2]]===undefined)return '';
  return String(m[3])+'-'+String(mo[m[2]]+1).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');
}

/** Format tanggal lokal (WIB/device) ke YYYY-MM-DD — JANGAN pakai toISOString (UTC). */
function localISO(dt){
  const d=dt instanceof Date?dt:new Date(dt);
  if(Number.isNaN(d.getTime()))return '';
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function todayLocal(){
  const d=new Date();
  d.setHours(0,0,0,0);
  return d;
}
function dashDateLabel(dt){return dt.toLocaleDateString('id-ID',{day:'2-digit',month:'short'}).replace(/\./g,'');}
function renderBarChart(id,items,labelFn){
  const el=document.getElementById(id); if(!el)return;
  if(!items.length){el.innerHTML='<div class="chartEmpty">Belum ada data WO.</div>';return;}
  const max=Math.max(...items.map(x=>x.value),1);
  const many=items.length>14;
  el.classList.toggle('barChartDense',many);
  el.innerHTML=items.map((x,i)=>{
    const h=x.value?Math.max(3,(x.value/max)*100):0;
    const showLabel=!many||i===0||i===items.length-1||i%5===0||x.dt.getDate()===1;
    const valTxt=x.value?(many&&x.value===0?'':String(x.value)):'';
    return '<div class="barItem" title="'+escapeHtml(labelFn(x.dt)+': '+x.value+' WO')+'">'+
      '<div class="barValue">'+(valTxt||'')+'</div>'+
      '<div class="barTrack"><div class="barFill" style="height:'+h+'%"></div></div>'+
      '<div class="barLabel">'+(showLabel?escapeHtml(labelFn(x.dt)):'')+'</div>'+
    '</div>';
  }).join('');
}
function renderDashboard(){
  // Beranda: grafik WO DONE 30 hari (1 pass hitung)
  const allRows=Array.isArray(databaseRows)?databaseRows:[];
  const counts=Object.create(null);
  for(const r of allRows){
    const k=dateKey(r.date);
    if(k) counts[k]=(counts[k]||0)+1;
  }
  const anchor=todayLocal();
  const daily=[];
  for(let i=29;i>=0;i--){
    const dt=new Date(anchor);
    dt.setDate(anchor.getDate()-i);
    const key=localISO(dt);
    daily.push({dt,value:counts[key]||0});
  }
  renderBarChart('woDailyChart',daily,dashDateLabel);
}


async function loadDatabase(){
  const status=document.getElementById('dbStatus');
  const results=document.getElementById('dbResults');
  if(status)status.innerHTML='⏳ Memuat database...';
  if(results)showSkeleton('dbResults');
  try{
    databaseRows=await getAllWORows();
    const money=document.getElementById('dbMoney'),stats=document.getElementById('dbStats'),tariff=document.getElementById('tariffInput');
    if(tariff)tariff.value=getTariff();
    if(!databaseRows.length){
      if(status)status.textContent='0 WO tersimpan di akun ini.';
      if(money)money.innerHTML=''; if(stats)stats.innerHTML='';
      renderDashboard();
      if(results)results.innerHTML='<div class="empty">Database masih kosong.</div>';
      const note=document.getElementById('dbFilterNote');if(note)note.innerHTML='';
      updateUtangBadge();
      return;
    }
    const total=databaseRows.reduce((a,r)=>a+(Number(r.nominal)||getTariff()),0);
    const meter=databaseRows.reduce((a,r)=>a+(parseFloat(String(r.precone||'').replace(',','.'))||0),0);
    const days=new Set(databaseRows.map(r=>dateKey(r.date)).filter(Boolean)).size;
    const rcRows=databaseRows.filter(r=>isRc(r.wo_type));
    const totalUtang=databaseRows.reduce((a,r)=>a+(Number(r.utang_sales)||0),0);
    if(status)status.innerHTML='<span class="ok">✓ '+databaseRows.length+' WO tersimpan di akun ini.</span>';
    if(money)money.innerHTML='<div class="moneyGrid">'+
      '<div class="moneyCard moneyTotal moneyCardFull"><div class="moneyLabel">💰 Total Pendapatan</div><div class="moneyValue">'+formatRupiah(total)+'</div></div>'+
      '<div class="moneyCard"><div class="moneyLabel">💵 Tarif WO terakhir</div><div class="moneyValue">'+formatRupiah(Number(databaseRows[databaseRows.length-1].nominal)||getTariff())+'</div></div>'+
      '<div class="moneyCard" style="border-color:#f4dfaa"><div class="moneyLabel">🧾 Total Utang Sales</div><div class="moneyValue" style="color:#9b6500">'+formatRupiah(totalUtang)+'</div></div>'+
    '</div>';
    if(stats)stats.innerHTML=
      '<div class="statCard"><div class="statLabel">📦 TOTAL WO</div><div class="statValue">'+databaseRows.length+'</div></div>'+
      '<div class="statCard"><div class="statLabel">🔴 WO RC</div><div class="statValue">'+rcRows.length+'</div></div>'+
      '<div class="statCard"><div class="statLabel">📏 TOTAL METER</div><div class="statValue">'+formatMeter(meter)+'</div></div>'+
      '<div class="statCard"><div class="statLabel">📅 HARI KERJA</div><div class="statValue">'+days+'</div></div>';
    renderDashboard();
    renderDatabase(true);
    updateUtangBadge();
    setTimeout(checkUtangDueNotif,900);
  }catch(e){
    console.error('Database load error',e);
    if(status)status.textContent='Database gagal dimuat: '+(e.message||e);
    if(results)results.innerHTML='<div class="empty">Gagal memuat data.</div>';
  }
}

function checkUtangDueNotif(){
  if(!currentUser||currentProfile?.role==='admin')return;
  const today=localISO(todayLocal());
  const due=(databaseRows||[]).filter(r=>{
    const u=Number(r.utang_sales)||0;
    const d=String(r.utang_due_date||'').trim();
    return u>0&&d&&d<=today;
  });
  if(!due.length)return;
  // Cegah spam notif berulang di sesi yang sama
  const sig=due.map(r=>r.remote_id+':'+r.utang_due_date).sort().join('|');
  const key='hifriend_utang_notif_'+(currentUser.id||'')+'_'+today;
  try{ if(sessionStorage.getItem(key)===sig) return; sessionStorage.setItem(key,sig); }catch(e){}
  const lines=due.slice(0,8).map(r=>{
    const sales=r.sales_note?(' · '+r.sales_note):'';
    return '• WO <b>'+escapeHtml(r.id)+'</b> — '+formatRupiah(r.utang_sales)+sales+' <span style="color:#b91c1c">(janji '+escapeHtml(r.utang_due_date)+')</span>';
  }).join('<br>');
  const more=due.length>8?'<br><small>+'+(due.length-8)+' lainnya</small>':'';
  Swal.fire({
    icon:'warning',
    title:'Tagih utang sales',
    html:'Ada <b>'+due.length+'</b> WO yang sudah jatuh tempo:<br><br>'+lines+more,
    confirmButtonText:'Lihat daftar',
    confirmButtonColor:'#f3a500'
  }).then(res=>{ if(res.isConfirmed) filterUtangDue(); });
}

function getOverdueUtangRows(){
  const today=localISO(todayLocal());
  return (databaseRows||[]).filter(r=>{
    const u=Number(r.utang_sales)||0;
    const d=String(r.utang_due_date||'').trim();
    return u>0 && d && d<=today;
  });
}

/** Badge merah di tab Beranda + kartu ringkas di stats */
function updateUtangBadge(){
  const due=getOverdueUtangRows();
  const n=due.length;
  const total=due.reduce((a,r)=>a+(Number(r.utang_sales)||0),0);

  // Badge di tombol nav Beranda
  const homeBtn=document.getElementById('tabHome');
  if(homeBtn){
    let badge=homeBtn.querySelector('.navBadge');
    if(n>0){
      if(!badge){
        badge=document.createElement('span');
        badge.className='navBadge';
        homeBtn.appendChild(badge);
      }
      badge.textContent=String(n>99?'99+':n);
      badge.style.display='';
      homeBtn.title=n+' utang sales jatuh tempo';
    }else if(badge){
      badge.style.display='none';
      homeBtn.title='';
    }
  }

  // Banner di atas list database
  let banner=document.getElementById('utangDueBanner');
  if(!banner){
    const host=document.getElementById('dbMoney')||document.getElementById('dbStats');
    if(host && host.parentNode){
      banner=document.createElement('div');
      banner.id='utangDueBanner';
      host.parentNode.insertBefore(banner, host.nextSibling);
    }
  }
  if(banner){
    if(n>0){
      banner.className='utangDueBanner show';
      banner.innerHTML='<button type="button" class="utangDueBannerBtn" onclick="filterUtangDue()">'+
        '<span class="utangDueIcon">🔴</span> <b>'+n+' utang jatuh tempo</b> · '+formatRupiah(total)+
        ' <span class="utangDueAction">Lihat →</span></button>';
      banner.style.display='block';
    }else{
      banner.className='utangDueBanner';
      banner.innerHTML='';
      banner.style.display='none';
    }
  }
}

function filterUtangDue(){
  showTab('home');
  const chip=document.querySelector('#filterChips .filterChip[data-filter="utangdue"]');
  if(chip) setFilterChip(chip,'utangdue');
  else { activeDbChip='utangdue'; renderDatabase(true); }
}


function setFilterChip(el,key){
  activeDbChip=key;
  document.querySelectorAll('#filterChips .filterChip').forEach(c=>c.classList.remove('active'));
  if(el)el.classList.add('active');
  // Reset date inputs when using chips
  const fromEl=document.getElementById('dbFrom'),toEl=document.getElementById('dbTo');
  if(key==='all' || key==='utangdue'){
    if(fromEl)fromEl.value='';if(toEl)toEl.value='';
  }else{
    const today=todayLocal();
    if(key==='today'){
      const iso=localISO(today);
      if(fromEl)fromEl.value=iso;if(toEl)toEl.value=iso;
    }else if(key==='week'){
      const from=new Date(today);from.setDate(from.getDate()-6);
      if(fromEl)fromEl.value=localISO(from);
      if(toEl)toEl.value=localISO(today);
    }else if(key==='month'){
      const from=new Date(today.getFullYear(),today.getMonth(),1);
      if(fromEl)fromEl.value=localISO(from);
      if(toEl)toEl.value=localISO(today);
    }
  }
  renderDatabase(true);
}

function woTypeBadge(type){
  if(isRc(type)) return '<span class="woTypeBadge woTypeRC">RC</span>';
  return '<span class="mutedDash">—</span>';
}
let hfDbRenderTimer=null;
function renderDatabase(immediate){
  if(!immediate){
    if(hfDbRenderTimer) clearTimeout(hfDbRenderTimer);
    hfDbRenderTimer=setTimeout(()=>renderDatabase(true),120);
    return;
  }
  hfDbRenderTimer=null;
  // actual render below

  const out=document.getElementById('dbResults'); if(!out)return;
  const q=(document.getElementById('dbSearch')?.value||'').trim().toLowerCase();
  const from=document.getElementById('dbFrom')?.value||'';
  const to=document.getElementById('dbTo')?.value||'';
  const sort=document.getElementById('dbSort')?.value||'date-asc';
  const typeFilter=document.getElementById('dbTypeFilter')?.value||'all';
  const filterSignature=[q,from,to,sort,activeDbChip,typeFilter].join('|');
  if(filterSignature!==dbFilterSignature){dbFilterSignature=filterSignature;dbCurrentPage=1;}
  const todayIso=localISO(todayLocal());
  let filtered=databaseRows.filter(r=>{
    const hay=(String(r.id)+' '+String(r.name)+' '+String(r.sn||'')+' '+String(r.sales_note||'')+' '+String(r.wo_type||'')).toLowerCase();
    const dk=dateKey(r.date);
    const t=isRc(r.wo_type);
    const typeOk=typeFilter==='all'||(typeFilter==='RC'&&t)||(typeFilter==='nonrc'&&!t);
    if(activeDbChip==='utangdue'){
      const u=Number(r.utang_sales)||0;
      const due=String(r.utang_due_date||'').trim();
      if(!(u>0 && due && due<=todayIso)) return false;
    }
    return (!q||hay.includes(q))&&(!from||(dk&&dk>=from))&&(!to||(dk&&dk<=to))&&typeOk;
  });
  // Sort
  filtered=filtered.slice().sort((a,b)=>{
    const da=dateKey(a.date)||'',db=dateKey(b.date)||'';
    const idA=String(a.id||'').trim(),idB=String(b.id||'').trim();
    const idCmp=idA.localeCompare(idB,'id',{numeric:true,sensitivity:'base'});
    if(sort==='date-desc') return db.localeCompare(da) || idCmp;
    if(sort==='name') return String(a.name||'').localeCompare(String(b.name||''),'id');
    if(sort==='nominal-desc') return (Number(b.nominal)||0)-(Number(a.nominal)||0);
    if(sort==='meter-desc') return (parseFloat(String(b.precone||'').replace(',','.'))||0)-(parseFloat(String(a.precone||'').replace(',','.'))||0);
    if(sort==='utang-desc') return (Number(b.utang_sales)||0)-(Number(a.utang_sales)||0);
    return da.localeCompare(db) || idCmp;
  });
  const note=document.getElementById('dbFilterNote');
  const hasFilter=q||from||to||activeDbChip!=='all'||typeFilter!=='all';
  if(note)note.innerHTML=hasFilter?'<div class="filteredNote">🔎 Menampilkan '+filtered.length+' dari '+databaseRows.length+' WO sesuai filter.</div>':'';
  const pageCount=Math.max(1,Math.ceil(filtered.length/DB_PAGE_SIZE));
  dbCurrentPage=Math.min(Math.max(1,dbCurrentPage),pageCount);
  if(!filtered.length){out.innerHTML='<div class="empty">Tidak ada WO yang cocok dengan filter.</div>';return;}
  const start=(dbCurrentPage-1)*DB_PAGE_SIZE;
  const pageRows=filtered.slice(start,start+DB_PAGE_SIZE);
  let html='<div class="tableWrap"><table class="reportTable dbTable"><thead><tr><th>No.</th><th>Tanggal Done</th><th>ID Pelanggan</th><th>Nama Pelanggan</th><th>RC</th><th>SN</th><th>Panjang Kabel</th><th>Nominal</th><th>Utang Sales</th><th>Nama Sales</th><th>Janji Bayar</th><th>Aksi</th></tr></thead><tbody>';
  pageRows.forEach((r,i)=>{
    const k=encodeURIComponent(r.key||'');
    const utang=Number(r.utang_sales)||0;
    const due=r.utang_due_date||'';
    const dueOver=due&&due<=localISO(todayLocal());
    html+=`<tr><td>${start+i+1}</td><td>${escapeHtml(r.date)}</td><td><strong>${escapeHtml(r.id)}</strong></td><td>${escapeHtml(r.name)}</td><td>${woTypeBadge(r.wo_type)}</td><td>${escapeHtml(r.sn||'-')}</td><td>${escapeHtml(r.precone)} meter</td><td>${formatRupiah(Number(r.nominal)||getTariff())}</td><td>${utang?formatRupiah(utang):'<span class="mutedDash">—</span>'}</td><td>${escapeHtml(r.sales_note||'—')}</td><td>${due?(dueOver?'<span style="color:#b91c1c;font-weight:900">'+escapeHtml(due)+'</span>':escapeHtml(due)):'<span class="mutedDash">—</span>'}</td><td><div style="display:flex;gap:5px;flex-wrap:wrap"><button class="secondary" type="button" title="Detail WO" onclick="showWODetail(decodeURIComponent('${k}'))">👁️</button><button class="secondary" type="button" title="Edit WO" onclick="editWORow(decodeURIComponent('${k}'))">✏️</button><button class="deleteBtn" title="Hapus WO ini" onclick="deleteWORow(decodeURIComponent('${k}'))">🗑️</button></div></td></tr>`;
  });
  html+='</tbody></table></div>';
  const moneyOnPage=pageRows.reduce((sum,r)=>sum+(Number(r.nominal)||getTariff()),0);
  const utangOnPage=pageRows.reduce((sum,r)=>sum+(Number(r.utang_sales)||0),0);
  html+=`<div class="dbPagination" aria-label="Pagination rekap WO DONE"><div class="dbPageSummary">Menampilkan <strong>${start+1}–${Math.min(start+DB_PAGE_SIZE,filtered.length)}</strong> dari <strong>${filtered.length} WO DONE</strong><span> · Halaman ${dbCurrentPage}/${pageCount}</span><small>Subtotal halaman: ${formatRupiah(moneyOnPage)}${utangOnPage?' · Utang: '+formatRupiah(utangOnPage):''}</small></div><div class="dbPageButtons"><button type="button" class="secondary dbPageNav" onclick="changeDbPage(${dbCurrentPage-1})" ${dbCurrentPage<=1?'disabled':''} aria-label="Halaman sebelumnya">‹</button>`;
  const pageSet=new Set([1,pageCount,dbCurrentPage-1,dbCurrentPage,dbCurrentPage+1].filter(n=>n>=1&&n<=pageCount));
  let lastPage=0;
  [...pageSet].sort((a,b)=>a-b).forEach(n=>{if(lastPage&&n-lastPage>1)html+='<span class="dbPageDots">…</span>';html+=`<button type="button" class="${n===dbCurrentPage?'primary':'secondary'} dbPageNav" onclick="changeDbPage(${n})" ${n===dbCurrentPage?'aria-current="page"':''}>${n}</button>`;lastPage=n;});
  html+=`<button type="button" class="secondary dbPageNav" onclick="changeDbPage(${dbCurrentPage+1})" ${dbCurrentPage>=pageCount?'disabled':''} aria-label="Halaman berikutnya">›</button></div></div>`;
  out.innerHTML=html;
}

function changeDbPage(page){
  const pageCount=Math.max(1,Math.ceil((databaseRows||[]).length/DB_PAGE_SIZE));
  dbCurrentPage=Math.max(1,Math.min(pageCount,Math.floor(Number(page)||1)));
  renderDatabase(true);
  document.getElementById('dbResults')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function showWODetail(key){
  const row=databaseRows.find(r=>r.key===key);if(!row)return;
  const utang=Number(row.utang_sales)||0;
  Swal.fire({
    title:'Detail WO',
    html:'<div class="detailGrid">'+
      '<div class="detailItem"><div class="detailLabel">TANGGAL DONE</div><div class="detailValue">'+escapeHtml(row.date||'-')+'</div></div>'+
      '<div class="detailItem"><div class="detailLabel">ID PELANGGAN</div><div class="detailValue">'+escapeHtml(row.id||'-')+'</div></div>'+
      '<div class="detailItem"><div class="detailLabel">NAMA PELANGGAN</div><div class="detailValue">'+escapeHtml(row.name||'-')+'</div></div>'+
      '<div class="detailItem"><div class="detailLabel">RC</div><div class="detailValue">'+woTypeBadge(row.wo_type)+'</div></div>'+
      '<div class="detailItem"><div class="detailLabel">SN</div><div class="detailValue">'+escapeHtml(row.sn||'-')+'</div></div>'+
      '<div class="detailItem"><div class="detailLabel">PANJANG KABEL</div><div class="detailValue">'+escapeHtml(row.precone||'0')+' meter</div></div>'+
      '<div class="detailItem"><div class="detailLabel">NOMINAL</div><div class="detailValue">'+formatRupiah(Number(row.nominal)||getTariff())+'</div></div>'+
      '<div class="detailItem"><div class="detailLabel">UTANG SALES</div><div class="detailValue">'+(utang?formatRupiah(utang):'—')+'</div></div>'+
      '<div class="detailItem"><div class="detailLabel">NAMA SALES</div><div class="detailValue">'+escapeHtml(row.sales_note||'—')+'</div></div>'+
      '<div class="detailItem"><div class="detailLabel">JANJI BAYAR</div><div class="detailValue">'+escapeHtml(row.utang_due_date||'—')+'</div></div>'+
      '<div class="detailItem"><div class="detailLabel">STATUS</div><div class="detailValue">✓ '+escapeHtml(row.status||'DONE')+'</div></div>'+
    '</div>',
    confirmButtonText:'Tutup',
    showDenyButton:true,
    denyButtonText:'✏️ Edit',
    denyButtonColor:'#f3a500'
  }).then(res=>{ if(res.isDenied) editWORow(key); });
}

async function editWORow(key){
  const row=databaseRows.find(r=>r.key===key);if(!row)return;
  const curRc=isRc(row.wo_type);
  const result=await Swal.fire({
    title:'✏️ Edit WO',
    html:`<div class="hfEditForm">
      <div class="hfEditField"><label>ID PELANGGAN</label><input id="swalWoId" class="swal2-input" value="${escapeHtml(row.id||'')}" readonly style="opacity:.7"></div>
      <div class="hfEditField"><label>NAMA PELANGGAN</label><input id="swalWoName" class="swal2-input" value="${escapeHtml(row.name||'')}"></div>
      <div class="hfEditField"><label>TANGGAL DONE (YYYY-MM-DD)</label><input id="swalWoDate" class="swal2-input" type="date" value="${escapeHtml(dateKey(row.date)||'')}"></div>
      <div class="hfEditField">
        <label class="rcToggleLabel"><input id="swalWoRc" type="checkbox" ${curRc?'checked':''} style="width:18px;height:18px;margin-right:8px;vertical-align:middle"> <b>RC</b></label>
      </div>
      <div class="hfEditField"><label>SN ONT</label><input id="swalWoSn" class="swal2-input" value="${escapeHtml(row.sn||'')}"></div>
      <div class="hfEditField"><label>PANJANG KABEL (m)</label><input id="swalWoMeter" class="swal2-input" type="number" min="0" step="0.1" value="${escapeHtml(row.precone||'0')}"></div>
      <div class="hfEditField"><label>NOMINAL (Rp)</label><input id="swalWoNominal" class="swal2-input" type="number" min="0" step="1000" value="${Number(row.nominal)||getTariff()}"></div>
      <div class="hfEditField"><label>UTANG SALES (Rp)</label><input id="swalWoUtang" class="swal2-input" type="number" min="0" step="1000" value="${Number(row.utang_sales)||0}"></div>
      <div class="hfEditField"><label>NAMA SALES</label><input id="swalWoSalesNote" class="swal2-input" placeholder="Nama sales" value="${escapeHtml(row.sales_note||'')}"></div>
      <div class="hfEditField"><label>TANGGAL JANJI BAYAR</label><input id="swalWoDue" class="swal2-input" type="date" value="${escapeHtml(row.utang_due_date||'')}"></div>
    </div>`,
    showCancelButton:true,
    confirmButtonText:'💾 Simpan',
    cancelButtonText:'Batal',
    focusConfirm:false,
    customClass:{popup:'hfSwalPopup',htmlContainer:'hfSwalHtml'},
    preConfirm:()=>{
      const name=(document.getElementById('swalWoName')?.value||'').trim();
      const dateIso=(document.getElementById('swalWoDate')?.value||'').trim();
      const woType=document.getElementById('swalWoRc')?.checked?'RC':'';
      const sn=(document.getElementById('swalWoSn')?.value||'').trim();
      const precone=String(document.getElementById('swalWoMeter')?.value||'0').replace(',','.');
      const nominal=Number(document.getElementById('swalWoNominal')?.value);
      const utang=Math.max(0,Math.round(Number(document.getElementById('swalWoUtang')?.value)||0));
      const salesNote=(document.getElementById('swalWoSalesNote')?.value||'').trim();
      const dueDate=(document.getElementById('swalWoDue')?.value||'').trim();
      if(!name){Swal.showValidationMessage('Nama pelanggan wajib diisi.');return false;}
      if(!dateIso||!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)){Swal.showValidationMessage('Tanggal DONE tidak valid.');return false;}
      if(!Number.isFinite(nominal)||nominal<0){Swal.showValidationMessage('Nominal tidak valid.');return false;}
      if(utang>0&&!dueDate){Swal.showValidationMessage('Isi tanggal janji bayar untuk utang sales.');return false;}
      return {name,dateIso,woType,sn,precone,nominal:Math.round(nominal),utang,salesNote,dueDate:dueDate||null};
    }
  });
  if(!result.isConfirmed||!result.value)return;
  const v=result.value;
  try{
    if(!currentUser||!supabaseClient||!row.remote_id)throw new Error('Data WO tidak memiliki ID database.');
    const updatePayload={
      customer_name:v.name,
      tanggal_done:v.dateIso,
      sn:v.sn,
      panjang_kabel:Math.max(0,Math.round(parseFloat(v.precone)||0)),
      nominal:v.nominal,
      wo_type:v.woType||null,
      utang_sales:v.utang,
      sales_note:v.salesNote,
      utang_due_date:v.dueDate
    };
    let {error}=await supabaseClient.from('wo').update(updatePayload).eq('id',row.remote_id).eq('user_id',currentUser.id);
    if(error && isMissingColumnError(error)){
      const {wo_type,utang_sales,sales_note,utang_due_date,...legacy}=updatePayload;
      const retry=await supabaseClient.from('wo').update(legacy).eq('id',row.remote_id).eq('user_id',currentUser.id);
      error=retry.error;
      if(!error){
        swalNotice('Sebagian tersimpan','Kolom utang/RC belum ada di database. Jalankan SQL migrasi.','warning');
      }
    }
    if(error)throw error;
    swalToast('WO berhasil diperbarui','success');
    await loadDatabase();
  }catch(e){
    console.error('editWORow',e);
    swalNotice('Gagal menyimpan',e.message||String(e),'error');
  }
}

async function deleteWORow(key){
  if(!key)return;
  const row=databaseRows.find(r=>r.key===key);
  if(!row)return;
  if(!(await swalConfirm('Hapus WO ini?',(row.id||'-')+' — '+(row.name||'-')+'\n'+(row.date||''),'Hapus')))return;
  try{
    if(!currentUser||!supabaseClient||!row.remote_id)throw new Error('Data WO tidak memiliki ID database.');
    const {error}=await supabaseClient.from('wo').delete().eq('id',row.remote_id).eq('user_id',currentUser.id);
    if(error)throw error;
    await loadDatabase();
  }catch(e){swalNotice('Gagal menghapus WO',e.message||String(e),'error');}
}

async function adminApi(action, body){
  if(!currentUser || currentProfile?.role!=='admin') throw new Error('Akses admin diperlukan.');
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session?.access_token) throw new Error('Sesi login admin tidak tersedia.');
  const res=await fetch(SUPABASE_URL+'/functions/v1/admin-users',{
    method:body?'POST':'GET',
    headers:{'Authorization':'Bearer '+session.access_token,'apikey':SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},
    body:body?JSON.stringify({action,...body}):undefined
  });
  let data={};try{data=await res.json();}catch(_){data={};}
  if(!res.ok) throw new Error(data.error||data.message||('Admin API gagal ('+res.status+').'));
  return data;
}
function setAdminMsg(msg,ok=false){const el=document.getElementById('adminMsg');if(el){el.textContent=msg||'';el.className='adminMsg'+(ok?' ok':' err');}}
async function adminLoadUsers(){
  if(currentProfile?.role!=='admin')return;
  const out=document.getElementById('adminUsers');if(!out)return;
  out.innerHTML='<div class="count">⏳ Memuat akun teknisi...</div>';setAdminMsg('');
  try{const data=await adminApi('list');window.adminUsersCache=data.users||[];renderAdminUsers();}catch(e){out.innerHTML='<div class="empty">Gagal memuat akun.</div>';setAdminMsg(e.message||'Gagal memuat akun.');}
}
function renderAdminUsers(){
  const out=document.getElementById('adminUsers');if(!out)return;
  const all=Array.isArray(window.adminUsersCache)?window.adminUsersCache:[];
  const q=(document.getElementById('adminUserSearch')?.value||'').trim().toLowerCase();
  const users=all.filter(u=>!q||[u.full_name,u.username,u.email].some(v=>String(v||'').toLowerCase().includes(q)));
  const count=document.getElementById('adminUserCount');if(count)count.textContent=users.length+' TEKNISI';
  if(!users.length){out.innerHTML='<div class="empty">'+(q?'Tidak ada teknisi yang cocok.':'Belum ada akun teknisi.')+'</div>';return;}
  let html='<div class="adminTableWrap"><table class="adminTable"><thead><tr><th>TEKNISI</th><th>USERNAME</th><th>EMAIL</th><th>STATUS</th><th style="text-align:right">AKSI</th></tr></thead><tbody>';
  users.forEach(u=>{
    const inactive=u.is_active===false;
    const role=u.role||'teknisi';
    const displayName=u.full_name||u.username||'Teknisi';
    const safeName=encodeURIComponent(displayName);
    const actions=role==='teknisi'
      ? `<button type="button" class="secondary" onclick="adminEditUser('${u.id}')">✏️ Edit</button><button type="button" class="secondary" onclick="adminResetPassword('${u.id}','${safeName}')">🔑 Password</button><button type="button" class="${inactive?'primary':'secondary'}" onclick="adminToggleUser('${u.id}',${inactive})">${inactive?'✅ Aktifkan':'⏸️ Nonaktifkan'}</button><button type="button" class="secondary" onclick="adminDeleteUser('${u.id}','${safeName}')">🗑️ Hapus</button>`
      : '';
    html+=`<tr><td><strong>${escapeHtml(displayName)}</strong></td><td>@${escapeHtml(u.username||'-')}</td><td>${escapeHtml(u.email||'-')}</td><td><span class="roleBadge ${inactive?'inactiveBadge':''}">${inactive?'NONAKTIF':role.toUpperCase()}</span></td><td><div class="adminActions">${actions}</div></td></tr>`;
  });
  out.innerHTML=html+'</tbody></table></div>';
}

async function adminCreateTechnician(){
  const full_name=document.getElementById('newTechName')?.value.trim();
  const username=document.getElementById('newTechUsername')?.value.trim();
  const email=document.getElementById('newTechEmail')?.value.trim();
  const password=document.getElementById('newTechPassword')?.value||'';
  if(!full_name||!username||!email||!password){return swalNotice('Data belum lengkap','Lengkapi nama, username, email, dan password.','warning');}
  if(password.length<6){return swalNotice('Password terlalu pendek','Password minimal 6 karakter.','warning');}
  Swal.fire({title:'Membuat akun...',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
  try{
    await adminApi('create',{full_name,username,email,password});
    ['newTechName','newTechUsername','newTechEmail','newTechPassword'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    await swalNotice('Berhasil','Akun teknisi berhasil dibuat.','success');
    await adminLoadUsers();
  }catch(e){await swalNotice('Gagal membuat akun',e.message||'Terjadi kesalahan.','error');}
}
async function adminToggleUser(id,activate){
  if(!id)return;
  const label=activate?'mengaktifkan':'menonaktifkan';
  if(!(await swalConfirm('Ubah status akun?', 'Yakin '+label+' akun teknisi ini?', 'Ya, lanjut')))return;
  Swal.fire({title:'Memproses...',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
  try{await adminApi('toggle',{id,is_active:!!activate});await swalNotice('Berhasil','Status akun berhasil diperbarui.','success');await adminLoadUsers();}catch(e){await swalNotice('Gagal mengubah status',e.message||'Terjadi kesalahan.','error');}
}


function togglePasswordField(id,btn){
  const el=document.getElementById(id);
  if(!el)return;
  const show=el.type==='password';
  el.type=show?'text':'password';
  if(btn)btn.textContent=show?'🙈':'👁️';
}
function swalNotice(title,text,icon='info'){
  return Swal.fire({title,text,icon,confirmButtonText:'OK',confirmButtonColor:'#d9117c'});
}
function swalToast(text,icon='success'){
  return Swal.fire({toast:true,position:'top-end',showConfirmButton:false,timer:2200,timerProgressBar:true,icon,title:text});
}
async function swalConfirm(title,text,confirmText='Ya'){
  const r=await Swal.fire({title,text,icon:'warning',showCancelButton:true,confirmButtonText:confirmText,cancelButtonText:'Batal',confirmButtonColor:'#d9117c'});
  return r.isConfirmed;
}
async function changeOwnPassword(){
  if(!currentUser||!supabaseClient)return;
  const oldP=document.getElementById('oldOwnPassword')?.value||'';
  const newP=document.getElementById('newOwnPassword')?.value||'';
  const confirmP=document.getElementById('confirmOwnPassword')?.value||'';
  if(!oldP||!newP||!confirmP){return swalNotice('Belum lengkap','Isi password lama, password baru, dan konfirmasi password.','warning');}
  if(newP.length<6){return swalNotice('Password terlalu pendek','Password baru minimal 6 karakter.','warning');}
  if(newP!==confirmP){return swalNotice('Password tidak sama','Konfirmasi password baru harus sama.','warning');}
  if(oldP===newP){return swalNotice('Password sama','Password baru harus berbeda dari password lama.','warning');}
  const ok=await swalConfirm('Ganti password?','Password akun teknisi akan diperbarui.','Ganti Password');
  if(!ok)return;
  Swal.fire({title:'Memproses...',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
  try{
    const email=currentUser.email;
    const check=await supabaseClient.auth.signInWithPassword({email,password:oldP});
    if(check.error)throw new Error('Password lama salah.');
    const {error}=await supabaseClient.auth.updateUser({password:newP});
    if(error)throw error;
    ['oldOwnPassword','newOwnPassword','confirmOwnPassword'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    await swalNotice('Berhasil','Password akun berhasil diganti.','success');
  }catch(e){
    await swalNotice('Gagal mengganti password',e.message||'Terjadi kesalahan.','error');
  }
}


async function adminEditUser(id){
  if(!id)return;
  try{
    const data=await adminApi('get',{id});
    const u=data.user||{};
    const escName=escapeHtml(u.full_name||'');
    const escUsername=escapeHtml(u.username||'');
    const escEmail=escapeHtml(u.email||'');
    const r=await Swal.fire({
      title:'Edit teknisi',
      html:`<div class="hfEditForm">
        <div class="hfEditField"><label for="swalName">NAMA LENGKAP</label><input id="swalName" class="swal2-input" placeholder="Nama lengkap" value="${escName}"></div>
        <div class="hfEditField"><label for="swalUsername">USERNAME</label><input id="swalUsername" class="swal2-input" placeholder="Username" value="${escUsername}"></div>
        <div class="hfEditField"><label for="swalEmail">EMAIL LOGIN</label><input id="swalEmail" class="swal2-input" type="email" placeholder="Email login" value="${escEmail}"></div>
      </div>`,
      customClass:{popup:'hfSwalPopup',htmlContainer:'hfSwalHtml'},
      focusConfirm:false,
      showCancelButton:true,
      confirmButtonText:'Simpan',
      cancelButtonText:'Batal',
      confirmButtonColor:'#d9117c',
      preConfirm:()=>({
        full_name:document.getElementById('swalName').value.trim(),
        username:document.getElementById('swalUsername').value.trim(),
        email:document.getElementById('swalEmail').value.trim()
      })
    });
    if(!r.isConfirmed)return;
    if(!r.value.full_name||!r.value.username||!r.value.email)return swalNotice('Data belum lengkap','Nama, username, dan email wajib diisi.','warning');
    Swal.fire({title:'Menyimpan...',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
    await adminApi('update',Object.assign({id},r.value));
    await swalNotice('Berhasil','Data teknisi berhasil diperbarui.','success');
    await adminLoadUsers();
  }catch(e){await swalNotice('Gagal memperbarui',e.message||String(e),'error');}
}

async function adminResetPassword(id,name){
  name=decodeURIComponent(name||'Teknisi');
  const r=await Swal.fire({
    title:'Ganti password',
    text:'Password baru untuk '+name,
    html:'<div style="text-align:left"><div class="filterLabel">PASSWORD BARU</div><div class="passwordWrap"><input id="swalPassword" type="password" class="swal2-input" placeholder="Minimal 6 karakter"><button type="button" class="passwordEye" style="right:4px;top:50%" onclick="togglePasswordField(\'swalPassword\',this)">👁️</button></div></div>',
    customClass:{popup:'hfSwalPopup',htmlContainer:'hfSwalHtml'},
    focusConfirm:false,
    showCancelButton:true,
    confirmButtonText:'Simpan Password',
    cancelButtonText:'Batal',
    confirmButtonColor:'#d9117c',
    preConfirm:()=>document.getElementById('swalPassword').value
  });
  if(!r.isConfirmed)return;
  if(!r.value||r.value.length<6)return swalNotice('Password terlalu pendek','Minimal 6 karakter.','warning');
  try{Swal.fire({title:'Menyimpan...',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});await adminApi('password',{id,password:r.value});await swalNotice('Berhasil','Password teknisi berhasil diganti.','success');}catch(e){await swalNotice('Gagal mengganti password',e.message||String(e),'error');}
}
async function adminDeleteUser(id,name){
  name=decodeURIComponent(name||'Teknisi');
  const ok=await swalConfirm('Hapus akun teknisi?',name+' akan dihapus dari sistem dan tidak bisa login lagi.','Ya, hapus');
  if(!ok)return;
  try{Swal.fire({title:'Menghapus...',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});await adminApi('delete',{id});await swalNotice('Berhasil','Akun teknisi sudah dihapus.','success');await adminLoadUsers();}catch(e){await swalNotice('Gagal menghapus',e.message||String(e),'error');}
}

function clean(s){return (s||'').trim()}
function isTechnicianOnlyLine(line){
  // Baris nama teknisi saja: pendek, tanpa OH/SLOT/tanggal/nomor WA
  // termasuk "*NAMA TEKNISI*" dari export
  const s=String(line||'').trim().replace(/^\*+|\*+$/g,'').trim();
  if(!s||s.length>60) return false;
  if(/OH\d+/i.test(s)) return false;
  if(/SLOT\s*-?\s*\d+/i.test(s)) return false;
  if(/ANYTIME/i.test(s) && /OH\d+/i.test(String(line||''))) return false;
  if(/\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) return false;
  if(/(?:62|08)\d{8,13}/.test(s)) return false;
  return /^[A-Za-zÀ-ÿ.'\-\s]+$/.test(s) && s.split(/\s+/).length<=6;
}
function looksLikeFlatWO(line){
  const s=String(line||'');
  const hasOH=/OH\d{8,}/i.test(s);
  const hasSlot=/SLOT\s*-?\s*\d+\s*\(/i.test(s);
  const hasDate=/\d{1,2}\/\d{1,2}\/\d{4}/.test(s);
  const hasPhone=/(?:62|08)\d{8,13}/.test(s);
  return hasOH && (hasSlot||hasDate) && (hasPhone||hasDate);
}
function todayForMessage(style){
  // Tanggal real-time saat generate (lokal perangkat)
  const now=new Date();
  const d=now.getDate(), mo=now.getMonth(), y=now.getFullYear();
  if(style==='short'){
    const days=['minggu','senin','selasa','rabu','kamis','jumat','sabtu'];
    const months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    return days[now.getDay()]+' '+String(d).padStart(2,'0')+' '+months[mo]+' '+y;
  }
  const days=['MINGGU','SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'];
  const months=['JANUARI','FEBRUARI','MARET','APRIL','MEI','JUNI','JULI','AGUSTUS','SEPTEMBER','OKTOBER','NOVEMBER','DESEMBER'];
  return days[now.getDay()]+' '+d+' '+months[mo]+' '+y;
}
function greetingByHour(){
  // Sapaan otomatis sesuai jam lokal saat generate
  const h=new Date().getHours();
  if(h>=4 && h<11) return 'Selamat pagi';
  if(h>=11 && h<15) return 'Selamat siang';
  if(h>=15 && h<19) return 'Selamat sore';
  return 'Selamat malam';
}
// Parser inti bersama: kenali format export sistem tanpa mengasumsikan
// apakah kolom nomor tiket berada sebelum atau sesudah kode OH.
function parseWORecord(raw){
  const line=Array.isArray(raw)?raw.join('\t'):String(raw??'');
  let cols=line.includes('\t')?line.split('\t').map(clean):line.split(/\s{2,}/).map(clean);
  const ohIndex=cols.findIndex(v=>/^OH\d{8,}$/i.test(v));
  if(ohIndex<0) return null;
  const joined=cols.join(' ');
  const isSystemInstall=/\bINSTALLATION\b/i.test(joined) && /\b(?:Internet|HiFi)\s*\d+/i.test(joined);
  if(!isSystemInstall) return {format:'legacy',cols,oh:cols[ohIndex],ohIndex,raw:line};

  const at=(i)=>String(cols[i]??'').trim();
  const customerIdIndex=cols.findIndex((v,i)=>i>ohIndex && /^\d{7,10}$/.test(v) && !/^(?:62|08)/.test(v));
  const nameIndex=customerIdIndex>=0?customerIdIndex+1:-1;
  const name=nameIndex>=0 && /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'’\-\s]{2,80}$/.test(at(nameIndex))?at(nameIndex):'';
  const phoneField=cols.find(v=>/(?:^|\D)(?:62|08)\d{8,13}(?:\D|$)/.test(v)&&!/^\d{10,14}$/.test(v))||'';
  let phone=(String(phoneField).split('|')[0].match(/(?:62|08)\d{8,13}/)||[])[0]||'';
  if(/^08\d{8,12}$/.test(phone)) phone='62'+phone.slice(1);
  const slotField=cols.find(v=>/^slot\s*-?\s*\d+\s*[-–—]/i.test(v))||'';
  const slotMatch=slotField.match(/^slot\s*-?\s*(\d+)\s*[-–—]\s*(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/i);
  const isoField=cols.find(v=>/^\d{4}-\d{2}-\d{2}(?:\s|$)/.test(v))||'';
  const iso=isoField.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const addressCandidates=cols.filter((v,i)=>i>nameIndex && v.length>20 && /JALAN|\bJL\.?|PEMUKIMAN|PERUMAHAN|KAMPUNG|\bGANG\b|GRAHA|RESIDENCE|TAMAN/i.test(v));
  const address=addressCandidates.sort((a,b)=>b.length-a.length)[0]||'';
  const packageField=cols.find(v=>/^(?:Internet|HiFi)\s*\d+/i.test(v))||'';
  const customerId=customerIdIndex>=0?at(customerIdIndex):'';
  return {
    format:'system-install', cols, raw:line, oh:at(ohIndex), ohIndex,
    ticket:ohIndex>0?at(0):'', customerId, name,
    package:packageField, jobType:at(ohIndex+2), phone,
    address:address.replace(/^.*?\/\s*/, '').replace(/\s+/g,' ').trim(),
    slot:slotMatch?`${slotMatch[2]} - ${slotMatch[3]}`:'',
    slotNo:slotMatch?slotMatch[1]:'',
    date:iso?`${iso[3]}/${iso[2]}/${iso[1]}`:'',
    kab:cols.find(v=>/^KAB\.?\s*BEKASI$/i.test(v)||/^KAB\./i.test(v)||/^KOTA\b/i.test(v))||'',
    team:cols.find(v=>/^BBB(?:_|$)/i.test(v))||''
  };
}

function parseRows(raw){
  // Multi-format:
  // 1) Excel tab / double-space (≥10 kolom) — logika lama tetap utuh
  // 2) Baris panjang spasi tunggal (paste sistem / chat)
  const lines=raw.split(/\r?\n/).map(line=>line.trimEnd()).filter(line=>line.trim());
  const rows=[];
  for(const line of lines){
    if(isTechnicianOnlyLine(line)) continue;

    // Format export sistem dikenali oleh parser inti bersama.
    const normalized=parseWORecord(line);
    if(normalized?.format==='system-install'){
      rows.push(normalized.cols);
      continue;
    }

    // --- Format lama: tab atau 2+ spasi, minimal 10 kolom ---
    let a=line.split('\t').map(clean);
    if(a.length<10) a=line.split(/\s{2,}/).map(clean);
    if(a.length>=10){
      rows.push(a);
      continue;
    }

    // --- Format baru: satu baris panjang ---
    if(looksLikeFlatWO(line)){
      rows.push([line.trim()]);
    }
  }
  return rows;
}
function makeMessage(a){
  const parts=Array.isArray(a)?a.map(clean):[clean(a)];
  const joined=parts.join(' ').replace(/\s+/g,' ').trim();
  const isFlat=parts.length<10;

  // Format export sistem (INSTALLATION / phone| / slot-n / tanggal ISO) → template HiFriend lama
  const isSystemExport=!isFlat && parts.length>=14 && (
    (/^OH\d+/i.test(parts[1]||'') && ( /INSTALLATION/i.test(joined) || (/\|/.test(parts[8]||'') && /(?:62|08)\d{8,}/.test(parts[8]||'')) || /^slot-?\d+\s*[-–]/i.test(parts[14]||'') || /^\d{4}-\d{2}-\d{2}/.test(parts[13]||'') )) ||
    (/^OH\d{8,}$/i.test(parts[0]||'') && /INSTALLATION/i.test(joined) && /^\d{7,10}$/.test(parts[4]||'') && /Internet\s*\d+/i.test(parts[1]||''))
  );
  const isOhFirstExport=isSystemExport && /^OH\d+/i.test(parts[0]||'');

  // Format template BARU (Selamat …):
  // WAJIB ada angka ID tepat SEBELUM kode OH (contoh: 12186019 OH11599… NAMA HiFi…)
  // Baik tab maupun baris panjang. Jika baris diawali OH… (tanpa ID di depan) → template LAMA.
  const hasIdBeforeOH=(
    (!isFlat && /^\d{7,15}$/.test(parts[0]||'') && /^OH\d+/i.test(parts[1]||'')) ||
    /(?:^|[^\d])(\d{7,15})\s+OH\d+/i.test(joined)
  );
  const isNewStyle=!isSystemExport && hasIdBeforeOH && /OH\d{8,}/i.test(joined) && (
    /HiFi\s*\d+\s*Mbps/i.test(joined) ||
    /SLOT\s*-\s*\d+\s*\(/i.test(joined) ||
    /\bANYTIME\b/i.test(joined) ||
    /\bSVM_[A-Z0-9_]+/i.test(joined) ||
    /\bSeahawks\b/i.test(joined)
  );

  // ----- NAMA -----
  let name='';
  if(isSystemExport){
    name=(isOhFirstExport?parts[5]:parts[6])||'';
  }else if(isNewStyle){
    // Tab: [id, OH, NAMA, HiFi…] | Flat: antara OH dan HiFi
    if(!isFlat && /^OH\d+/i.test(parts[1]||'') && parts[2] && !/^HiFi/i.test(parts[2])){
      name=parts[2].trim();
    }else{
      const mName=joined.match(/OH\d+\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'\-\s]{2,60}?)\s+HiFi/i);
      if(mName) name=mName[1].replace(/\s+/g,' ').trim();
    }
  }else if(!isFlat && /^OH\d+/i.test(parts[0]||'') && parts[1] && !/^HiFi/i.test(parts[1]) && !/^\d{6,}$/.test(parts[1])){
    // Format OH di kolom pertama → nama di kolom 2 (template lama)
    name=parts[1];
  }else if(!isFlat && parts[1] && !/^OH\d/i.test(parts[1]) && !/^\d{6,}$/.test(parts[1])){
    name=parts[1];
  }
  if(!name){
    const mName=joined.match(/OH\d+\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'\-\s]{2,60}?)\s+HiFi/i);
    if(mName) name=mName[1].replace(/\s+/g,' ').trim();
  }
  if(!name && !isFlat && !isSystemExport && !isNewStyle) name=parts[1]||'';

  // ----- OH CODE -----
  let ohCode='';
  if((isSystemExport||isNewStyle) && /^OH\d+/i.test(parts[1]||'')) ohCode=parts[1];
  else{
    const mOH=joined.match(/\b(OH\d{10,})\b/i);
    if(mOH) ohCode=mOH[1];
  }

  // ----- NOMOR WA -----
  let phone='';
  function pickPhoneFrom(str){
    const src=String(str||'');
    const head=src.split('|')[0];
    const re=/(?:^|[^\d])((?:62|08)\d{8,13})(?!\d)/g;
    let m, found='';
    while((m=re.exec(head))){
      let digits=m[1].replace(/\D/g,'');
      if(/^08\d{8,12}$/.test(digits)) digits='62'+digits.slice(1);
      if(/^62\d{8,13}$/.test(digits)){ found=digits; break; }
    }
    if(found) return found;
    const digits=head.replace(/\D/g,'');
    if(/^62\d{8,13}$/.test(digits)||/^08\d{8,12}$/.test(digits)){
      return digits.startsWith('08')?'62'+digits.slice(1):digits;
    }
    return '';
  }
  if(isSystemExport){
    phone=isOhFirstExport?(pickPhoneFrom(parts[7])||pickPhoneFrom(parts[8])):(pickPhoneFrom(parts[8])||pickPhoneFrom(parts[9]));
  }
  if(!phone){
    const phoneCandidates=isFlat?[joined]:[...parts].filter(Boolean);
    for(const x of phoneCandidates){
      phone=pickPhoneFrom(x);
      if(phone) break;
    }
  }

  // ----- TANGGAL -----
  let date='';
  if(isSystemExport){
    for(const x of (isOhFirstExport?[parts[12],parts[13],...parts]:[parts[13],parts[14],...parts])){
      const iso=String(x||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
      if(iso){ date=iso[3]+'/'+iso[2]+'/'+iso[1]; break; }
      if(/\d{1,2}\/\d{1,2}\/\d{4}/.test(String(x||''))){ date=String(x).match(/\d{1,2}\/\d{1,2}\/\d{4}/)[0]; break; }
    }
  }
  if(!date){
    const dateMatches=joined.match(/\d{1,2}\/\d{1,2}\/\d{4}/g)||[];
    if(dateMatches.length) date=dateMatches[0];
  }
  if(!date){
    const iso=joined.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if(iso) date=iso[3]+'/'+iso[2]+'/'+iso[1];
  }

  // ----- SLOT / WAKTU -----
  let slotClean='';
  if(/\bANYTIME\b/i.test(joined)){
    // cek apakah ada kolom ANYTIME murni
    if(parts.some(p=>/^ANYTIME$/i.test(String(p||'').trim())) || /\bANYTIME\b/i.test(joined)){
      // jika ada SLOT - n (...) utamakan slot; else Anytime
      const hasSlotParen=/SLOT\s*-\s*\d+\s*\(/i.test(joined);
      if(!hasSlotParen) slotClean='Anytime';
    }
  }
  const slotM=joined.match(/SLOT\s*-\s*\d+\s*\(([^)]+)\)/i);
  if(slotM){
    slotClean=slotM[1].trim();
  }
  if(!slotClean){
    const slotSys=joined.match(/slot-?\s*\d+\s*[-–—]\s*(\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2})/i);
    if(slotSys) slotClean=slotSys[1].replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
  }
  if(!slotClean && isSystemExport && (isOhFirstExport?parts[13]:parts[14])){
    const p=String(isOhFirstExport?parts[13]:parts[14]);
    const m=p.match(/(\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2})/);
    if(m) slotClean=m[1].replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
  }
  if(!slotClean && parts.some(p=>/^ANYTIME$/i.test(String(p||'').trim()))){
    slotClean='Anytime';
  }
  const waktuFlat=slotClean||'Anytime';

  // ----- ID PELANGGAN -----
  let id='';
  // New style tab: kolom 0 = id sebelum OH
  if(isNewStyle && /^\d{7,15}$/.test(parts[0]||'') && /^OH\d+/i.test(parts[1]||'')){
    id=parts[0];
  }
  if(!id && isSystemExport && /^\d{7,15}$/.test((isOhFirstExport?parts[4]:parts[5])||'')){
    id=isOhFirstExport?parts[4]:parts[5];
  }
  if(!id && (isFlat || isNewStyle || /OH\d{8,}/i.test(joined))){
    const mBeforeOH=joined.match(/(?:^|[^\d])(\d{7,15})\s+OH\d+/i);
    if(mBeforeOH) id=mBeforeOH[1];
  }
  if(!id && !isFlat){
    for(let i=parts.length-1;i>=0;i--){
      if(/^\d{7,15}$/.test(parts[i]) && !/^62/.test(parts[i])){ id=parts[i]; break; }
    }
  }

  // ----- PAKET & SVM -----
  let paket='';
  const mPkg=joined.match(/HiFi\s*(\d+)\s*Mbps/i) || joined.match(/Internet\s*(\d+)/i);
  if(mPkg) paket='Internet '+(mPkg[1]);
  if(isSystemExport && /Internet\s*\d+/i.test((isOhFirstExport?parts[1]:parts[2])||'')) paket=isOhFirstExport?parts[1]:parts[2];

  let svm='';
  const mSvm=joined.match(/\b(SVM_[A-Z0-9_]+)\b/i);
  if(mSvm) svm=mSvm[1];
  if(isSystemExport && parts[isOhFirstExport?9:10] && /_/.test(parts[isOhFirstExport?9:10])) svm=parts[isOhFirstExport?9:10];

  // ----- ALAMAT -----
  let addr='';
  if(isSystemExport || isNewStyle){
    const addressCandidates=parts.filter(x=>
      x && x.length>25 && /JALAN|NO\.?|BLOK|RW|PERUMAHAN|GANG|RESIDENCE|GRAHA/i.test(x)
    );
    if(addressCandidates.length){
      addr=addressCandidates.slice().sort((a,b)=>b.length-a.length)[0];
    }else if(isSystemExport){
      addr=(isOhFirstExport?parts[6]:parts[7])||'';
    }
  }else if(!isFlat){
    addr=parts[12]||'';
    const addressCandidates=parts.filter(x=>
      x.length>30 && /JALAN|NO\.?|BLOK|RW|PERUMAHAN/i.test(x)
    );
    if(addressCandidates.length) addr=addressCandidates[0];
  }
  if(!addr||isFlat){
    let mAddr=joined.match(/((?:PEMUKIMAN|PERUMAHAN|PONDOK|GRAHA|JALAN|JL\.?|GANG).+?)(?=\s+99999\s+(?:62|08)\d|\s+62\d{8,13}|\s+08\d{8,12})/i);
    if(mAddr) addr=mAddr[1].trim();
    else{
      mAddr=joined.match(/((?:JALAN|JL\.?|GANG)\s+.+?)(?=\s+(?:99999|\d{5})\s+(?:62|08)\d|\s+62\d{8,13}|$)/i);
      if(mAddr) addr=mAddr[1].trim();
    }
  }
  const slash=addr.indexOf('/');
  if(slash>=0 && slash<80) addr=addr.slice(slash+1).trim();
  addr=addr.replace(/^\s*[-–—]\s*/,'').replace(/\s+/g,' ').trim();
  addr=addr.replace(/\s*99999\s*$/,'').trim();

  // Gunakan hasil parser inti yang sama untuk export instalasi sistem.
  const normalizedWO=parseWORecord(parts);
  if(normalizedWO?.format==='system-install'){
    name=normalizedWO.name||name;
    id=normalizedWO.customerId||id;
    ohCode=normalizedWO.oh||ohCode;
    phone=normalizedWO.phone||phone;
    paket=normalizedWO.package||paket;
    addr=normalizedWO.address||addr;
    slotClean=normalizedWO.slot||slotClean;
    date=normalizedWO.date||date;
  }

  // ----- TEMPLATE -----
  // isNewStyle / isFlat (HiFi baris panjang) → template baru
  // isSystemExport / Excel klasik → template HiFriend lama
  let message;
  if(isFlat || isNewStyle){
    const tanggalStr=todayForMessage('short'); // real-time saat generate
    const nameId=(name||'')+(id?'-'+id:'');
    const alamatBlock=[
      ohCode,
      nameId,
      phone,
      paket,
      svm,
      addr
    ].filter(Boolean).join('\n');
    const salam=greetingByHour();
    message=`${salam}
Kami dari Teknisi Indosat HiFi
ingin melakukan konfirmasi jadwal
pemasangan layanan internet di
lokasi Bapak/ Ibu :

Berikut detail jadwalnya:
Hari & Tanggal: ${tanggalStr}
⏰ Waktu: ${waktuFlat}
📍 Alamat:

${alamatBlock}

Apakah waktu tersebut sesuai
dengan ketersediaan nya?
Sebagai persiapan, mohon untuk
mengirimkan foto rumah dan share
location (shareloc) titik lokasi
pemasangannya.

Terima kasih`;
  }else{
    message=`HiFriend
${name}
${id}

Kami dari Indosat HiFi ingin melakukan konfirmasi jadwal pemasangan layanan internet di lokasi Bapak/Ibu.

Berikut detail jadwalnya:
📅 Hari & Tanggal: ${todayForMessage('full')}
⏰ Waktu: ${slotClean}
📍 Alamat: ${addr}

Apakah waktu tersebut sesuai dengan ketersediaan Kakak?
Sebagai persiapan, mohon untuk mengirimkan foto rumah dan share location (shareloc) titik lokasi pemasangannya.

Kami tunggu konfirmasi balasannya.

Terima kasih!
Indosat HiFi`;
  }

  return {
    message,
    phone,
    id,
    name
  };
}
async function getAccurateLocation(){
  if(!navigator.geolocation){
    swalToast('Browser tidak mendukung lokasi akurat.','error');
    return null;
  }
  const el=document.getElementById('mappingLocation');
  if(el)el.textContent='⏳ Meminta posisi akurat...';
  const maxAttempts=3;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{
      const pos=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{
        enableHighAccuracy:true,
        timeout:15000,
        maximumAge:0
      }));
      const accuracy=Number(pos.coords.accuracy);
      if(Number.isFinite(accuracy) && accuracy<=50){
        hfMappingLocation={lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy};
        if(el)el.textContent=`📍 Posisi akurat: ${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)} ±${Math.round(accuracy)}m`;
        return hfMappingLocation;
      }
      if(el)el.textContent=`⏳ Akurasi posisi ${Math.round(accuracy||9999)}m, mencoba lagi (${attempt}/${maxAttempts})...`;
    }catch(err){
      console.warn('Pengambilan lokasi gagal',err);
      if(err?.code===1){
        if(el)el.textContent='⚠️ Izin lokasi ditolak.';
        swalToast('Izinkan akses lokasi agar Generate + Mapping bisa dijalankan.','warning');
        return null;
      }
      if(attempt===maxAttempts){
        if(el)el.textContent='⚠️ Posisi akurat belum didapat.';
        swalToast('Posisi akurat belum didapat. Aktifkan GPS/lokasi lalu coba lagi.','warning');
        return null;
      }
    }
  }
  if(el)el.textContent='⚠️ Posisi akurat belum didapat.';
  swalToast('Posisi belum cukup akurat. Coba lagi di tempat dengan GPS lebih stabil.','warning');
  return null;
}

async function generate(){
  // Generate + Mapping WAJIB mendapatkan posisi akurat terlebih dahulu.
  const location=await getAccurateLocation();
  if(!location)return;
  if(!hfMappingLocation){hfMappingLocation=location;try{localStorage.setItem('hifriend_mapping_start_v1',JSON.stringify(location));}catch(e){}}
  const raw=document.getElementById('input').value;
  const box=document.getElementById('results');
  const status=document.getElementById('status');
  box.innerHTML='';
  const rows=parseRows(raw);
  if(!raw.trim()){
    status.textContent='Tempel data Excel dulu, lalu tekan Generate.';
    box.innerHTML='<div class="count">Belum ada hasil.</div>';
    return;
  }
  if(!rows.length){
    status.textContent='Data belum terbaca. Copy langsung dari Excel (semua baris dan kolom), lalu paste di kotak input.';
    box.innerHTML='<div class="count">Format data tidak terbaca.</div>';
    return;
  }
  rows.forEach((a,i)=>{
    const item=makeMessage(a);
    const div=document.createElement('div');
    div.className='result';
    const head=document.createElement('div');
    head.className='head';
    const title=document.createElement('div');
    title.className='name';
    title.textContent=`${i+1}. ${item.name||'Pelanggan'}`;

    if(item.phone){
      const wa=document.createElement('a');
      wa.className='waBtn';
      wa.textContent='💬 Buka WhatsApp';
      wa.href=`https://wa.me/${item.phone}?text=${encodeURIComponent(item.message)}`;
      wa.target='_blank';
      wa.rel='noopener';
      head.append(title,wa);
    }else{
      const missing=document.createElement('span');
      missing.className='waMissing';
      missing.textContent='⚠️ Nomor WA tidak ditemukan';
      head.append(title,missing);
    }

    const pre=document.createElement('pre');
    pre.textContent=item.message;
    div.append(head,pre);
    box.appendChild(div);
  });
  status.innerHTML=`<span class="ok">✓ ${rows.length} pelanggan berhasil dibuat. Klik <b>💬 Buka WhatsApp</b> untuk langsung membuka chat dengan pesan terisi.</span>`;
  // Mapping tidak boleh menunggu geocoding/rute selesai untuk tampil.
  try{
    await mappingRun(raw);
  }catch(err){
    console.error('Generate mapping error',err);
    mappingRender();
    swalToast('Chat berhasil dibuat, tetapi sinkronisasi mapping bermasalah: '+(err?.message||err),'warning');
  }
}

/* ===== MAPPING WO — persistent Supabase cloud state ===== */
const HF_MAPPING_KEY='hifriend_mapping_v3'; // legacy key; no longer used for primary storage
const HF_MAPPING_STATUS_KEY='hifriend_mapping_status_v3'; // legacy key; no longer used for primary storage
const HF_GENERATED_WO_TABLE='generated_wo';
let hfMappingRows=[];
let hfMappingLocation=null;
let hfMappingRoutePath=[];
try{const savedStart=JSON.parse(localStorage.getItem('hifriend_mapping_start_v1')||'null');if(savedStart&&Number.isFinite(savedStart.lat)&&Number.isFinite(savedStart.lng))hfMappingLocation=savedStart;}catch(e){}
const HF_GEO_CACHE_KEY='hifriend_mapping_geo_cache_v1';
let hfGeoCache={};
try{hfGeoCache=JSON.parse(localStorage.getItem(HF_GEO_CACHE_KEY)||'{}')||{};}catch(e){hfGeoCache={};}
let hfGeoLookupAt=0;
/** Ambil lat,lng dari link Google Maps / koordinat di teks */
/** Ambil koordinat dari URL Google Maps (prioritas pin !3d!4d, bukan kamera @). */
function parseMapsUrlCoords(urlOrText){
  const s=String(urlOrText||'').trim();
  if(!s) return null;
  const ok=(lat,lng)=>{
    lat=Number(lat); lng=Number(lng);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)) return null;
    if(Math.abs(lat)>90||Math.abs(lng)>180) return null;
    // tolak (0,0) dan angka terlalu kasar
    if(Math.abs(lat)<0.001&&Math.abs(lng)<0.001) return null;
    return {lat,lng,source:'maps_url'};
  };
  // 1) Pin tempat di data param — paling akurat (!3dLAT!4dLNG)
  // Ambil SEMUA pasangan, pakai yang terakhir (sering pin tujuan)
  const pinAll=[...s.matchAll(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/g)];
  if(pinAll.length){
    const last=pinAll[pinAll.length-1];
    const p=ok(last[1],last[2]); if(p) return p;
  }
  // 2) /maps/place/.../@lat,lng,zoom  atau /@lat,lng,zoom
  let m=s.match(/@(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)(?:,\d)/);
  if(m){ const p=ok(m[1],m[2]); if(p) return p; }
  m=s.match(/@(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/);
  if(m){ const p=ok(m[1],m[2]); if(p) return p; }
  // 3) query params
  m=s.match(/[?&](?:q|query|ll|center)=(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i);
  if(m){ const p=ok(m[1],m[2]); if(p) return p; }
  // 4) /search/-6.xxx,+107.xxx atau /dir//-6.xxx,107.xxx
  m=s.match(/\/(?:search|dir)\/\/?(-?\d{1,3}\.\d+)\s*,\s*\+?(-?\d{1,3}\.\d+)/);
  if(m){ const p=ok(m[1],m[2]); if(p) return p; }
  // 5) destination=lat,lng
  m=s.match(/[?&]destination=(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i);
  if(m){ const p=ok(m[1],m[2]); if(p) return p; }
  // 6) Pasangan lat,lng generik (Indonesia sering -6.x, 106-107.x)
  m=s.match(/(-6\.\d{4,10})\s*,\s*(10[67]\.\d{4,10})/);
  if(m){ const p=ok(m[1],m[2]); if(p) return p; }
  m=s.match(/(-?\d{1,2}\.\d{5,10})\s*,\s*(-?\d{1,3}\.\d{5,10})/);
  if(m){ const p=ok(m[1],m[2]); if(p) return p; }
  return null;
}

function isShortMapsUrl(url){
  try{
    const u=new URL(String(url||'').trim());
    const h=u.hostname.toLowerCase();
    return /(^|\.)maps\.app\.goo\.gl$/.test(h) || /(^|\.)goo\.gl$/.test(h) || /(^|\.)g\.co$/.test(h);
  }catch(e){ return false; }
}

/** Resolve short link Google Maps → URL penuh (agar koordinat bisa dibaca). */
async function expandMapsUrl(url){
  const raw=String(url||'').trim();
  if(!raw) return '';
  if(parseMapsUrlCoords(raw)) return raw;
  if(!isShortMapsUrl(raw) && !/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(raw)) return raw;

  // Cache expand
  try{
    const cache=JSON.parse(localStorage.getItem('hifriend_maps_expand_v1')||'{}');
    if(cache[raw] && parseMapsUrlCoords(cache[raw])) return cache[raw];
  }catch(e){}

  function saveExpand(full){
    if(!full || full===raw) return full;
    try{
      const cache=JSON.parse(localStorage.getItem('hifriend_maps_expand_v1')||'{}');
      cache[raw]=full;
      // batasi 80 entri
      const keys=Object.keys(cache);
      if(keys.length>80) keys.slice(0,keys.length-80).forEach(k=>delete cache[k]);
      localStorage.setItem('hifriend_maps_expand_v1',JSON.stringify(cache));
    }catch(e){}
    return full;
  }

  // 1) API unshorten (JSON final_url) — tidak kena CORS Google
  const apis=[
    u=>'https://unshorten.me/json/'+encodeURIComponent(u),
    u=>'https://api.allorigins.win/get?url='+encodeURIComponent(u),
  ];
  for(const make of apis){
    try{
      const ctrl=new AbortController();
      const t=setTimeout(()=>ctrl.abort(),9000);
      const res=await fetch(make(raw),{signal:ctrl.signal});
      clearTimeout(t);
      if(!res.ok) continue;
      const ct=(res.headers.get('content-type')||'');
      if(ct.includes('json') || make(raw).includes('unshorten') || make(raw).includes('allorigins')){
        const data=await res.json().catch(()=>null);
        // unshorten.me: { success, resolved-url / destination }
        const finalUrl=(data && (data['resolved-url']||data.resolved_url||data.destination||data.url||data.longUrl||(data.contents?null:null)))||'';
        if(finalUrl && parseMapsUrlCoords(finalUrl)) return saveExpand(finalUrl);
        // allorigins: contents = HTML body
        const body=data && (data.contents||data.content||'');
        if(body){
          const fromBody=parseMapsUrlCoords(body);
          if(fromBody){
            return saveExpand('https://www.google.com/maps?q='+fromBody.lat+','+fromBody.lng+'&data=!3d'+fromBody.lat+'!4d'+fromBody.lng);
          }
          const urlIn=String(body).match(/https?:\/\/(?:www\.)?google\.[^"'\s<>]+\/(?:maps\/)?[^"'\s<>]*@(-?\d+\.\d+),(-?\d+\.\d+)[^"'\s<>]*/i)
            || String(body).match(/https?:\/\/(?:www\.)?google\.[^"'\s<>]*!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)[^"'\s<>]*/i);
          if(urlIn) return saveExpand(urlIn[0].replace(/&amp;/g,'&'));
        }
      }
    }catch(e){}
  }

  // 2) fetch langsung (jarang berhasil di browser karena CORS)
  try{
    const ctrl=new AbortController();
    const t=setTimeout(()=>ctrl.abort(),5000);
    const res=await fetch(raw,{method:'GET',redirect:'follow',signal:ctrl.signal,mode:'cors',credentials:'omit'});
    clearTimeout(t);
    if(res.url && res.url!==raw && parseMapsUrlCoords(res.url)) return saveExpand(res.url);
  }catch(e){}

  return raw;
}

/** Simpan / ambil koordinat per mapping_key (tahan banting, tanpa schema cloud baru) */
function mappingCoordCacheGet(key){
  try{
    const c=JSON.parse(localStorage.getItem('hifriend_maps_coord_v1')||'{}');
    const p=c[String(key||'')];
    if(p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) return {lat:p.lat,lng:p.lng,source:p.source||'maps_url'};
  }catch(e){}
  return null;
}
function mappingCoordCacheSet(key, geo){
  if(!key || !geo || !Number.isFinite(geo.lat)) return;
  try{
    const c=JSON.parse(localStorage.getItem('hifriend_maps_coord_v1')||'{}');
    c[String(key)]={lat:geo.lat,lng:geo.lng,source:geo.source||'maps_url',ts:Date.now()};
    const keys=Object.keys(c);
    if(keys.length>120){
      keys.map(k=>({k,ts:c[k].ts||0})).sort((a,b)=>a.ts-b.ts).slice(0,keys.length-120).forEach(x=>delete c[x.k]);
    }
    localStorage.setItem('hifriend_maps_coord_v1',JSON.stringify(c));
  }catch(e){}
}

/** Resolve geo dari mapsUrl/** Resolve geo dari mapsUrl (expand short link bila perlu). */
async function resolveRowGeoFromMapsUrl(row, opts){
  if(!row) return null;
  const force=!!(opts&&opts.force);
  if(!force && row.geo && row.geo.source==='maps_url' && Number.isFinite(row.geo.lat)) return row.geo;
  // Cache lokal per key (hasil expand sebelumnya)
  if(!force && row.key){
    const cached=mappingCoordCacheGet(row.key);
    if(cached){ row.geo=cached; return cached; }
  }
  const url=String(row.mapsUrl||'').trim();
  if(!url) return null;
  // Parse langsung
  let coords=parseMapsUrlCoords(url);
  if(!coords){
    const expanded=await expandMapsUrl(url);
    coords=parseMapsUrlCoords(expanded)||null;
    if(expanded && expanded!==url && coords) row.mapsUrlResolved=expanded;
  }
  if(coords){
    coords.source='maps_url';
    row.geo=coords;
    if(row.key) mappingCoordCacheSet(row.key, coords);
    return coords;
  }
  return null;
}

function mappingGeoKey(x){
  const parts=[];
  if(x.address) parts.push(x.address);
  if(x.kec) parts.push(x.kec);
  if(x.kab) parts.push(x.kab);
  if(!parts.length && x.raw){
    // potong alamat kasar dari raw
    const am=String(x.raw).match(/(?:JALAN|JL\.?|PERUM|KAMPUNG|KP\.?|GANG|GRAHA|PEMUKIMAN|RW\s*\d+)[^\t]{10,80}/i);
    if(am) parts.push(am[0]);
  }
  if(!parts.length) return '';
  return mappingClean(parts.join(', ')).toLowerCase();
}

async function mappingGeocode(x){
  // 0) Cache koordinat akurat dari link Maps
  if(x.key){
    const cached=mappingCoordCacheGet(x.key);
    if(cached){ x.geo=cached; return cached; }
  }
  // 1) Koordinat dari Google Maps link (termasuk short link yang di-expand)
  if(x.mapsUrl){
    const fromMaps=await resolveRowGeoFromMapsUrl(x, {force:true});
    if(fromMaps) return fromMaps;
    // Punya link Maps tapi gagal resolve → JANGAN geocode alamat (pin pasti ngaco)
    // Biarkan null; user tempel link penuh atau tunggu expand
    console.warn('Maps link belum bisa di-resolve, skip nominatim:', x.mapsUrl);
    return null;
  }
  const fromUrl=parseMapsUrlCoords(x.raw)||parseMapsUrlCoords(x.address);
  if(fromUrl){ x.geo=fromUrl; return fromUrl; }

  const queries=[];
  const addr=mappingClean(x.address||'');
  const kec=mappingClean(x.kec||'');
  const kab=mappingClean(x.kab||'')||'Bekasi';
  if(addr) queries.push(addr+', '+kab+', Jawa Barat, Indonesia');
  if(addr && kec) queries.push(addr+', '+kec+', '+kab+', Indonesia');
  if(kec) queries.push(kec+', '+kab+', Jawa Barat, Indonesia');
  if(kab) queries.push(kab+', Jawa Barat, Indonesia');
  const key=mappingGeoKey(x);
  if(key && hfGeoCache[key] && Number.isFinite(hfGeoCache[key].lat)) return hfGeoCache[key];

  for(const q of queries){
    const ck=q.toLowerCase();
    if(hfGeoCache[ck] && Number.isFinite(hfGeoCache[ck].lat)){
      if(key) hfGeoCache[key]=hfGeoCache[ck];
      return hfGeoCache[ck];
    }
    const wait=Math.max(0,1100-(Date.now()-hfGeoLookupAt));
    if(wait) await new Promise(r=>setTimeout(r,wait));
    try{
      hfGeoLookupAt=Date.now();
      const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=id&q='+encodeURIComponent(q);
      const res=await fetch(url,{headers:{'Accept':'application/json'}});
      if(!res.ok) continue;
      const data=await res.json();
      if(data&&data[0]){
        const point={lat:Number(data[0].lat),lng:Number(data[0].lon),source:'nominatim'};
        if(Number.isFinite(point.lat)&&Number.isFinite(point.lng)){
          hfGeoCache[ck]=point;
          if(key) hfGeoCache[key]=point;
          try{localStorage.setItem(HF_GEO_CACHE_KEY,JSON.stringify(hfGeoCache));}catch(e){}
          x.geo=point;
          return point;
        }
      }
    }catch(e){ console.warn('Geocoding mapping gagal',e); }
  }
  return null;
}

function mappingDistanceKm(a,b){const rad=v=>v*Math.PI/180;const dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng);const h=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
// Ambil jarak tempuh jalan via OSRM (OpenStreetMap Routing).
// Fallback garis lurus hanya jika server rute gagal.
const OSRM_BASES=[
  'https://router.project-osrm.org',
  'https://routing.openstreetmap.de/routed-car'
];

async function osrmFetchJson(pathAndQuery){
  let lastErr=null;
  for(const base of OSRM_BASES){
    try{
      const res=await fetch(base+pathAndQuery,{headers:{'Accept':'application/json'}});
      if(!res.ok){ lastErr=new Error('HTTP '+res.status); continue; }
      const data=await res.json();
      if(data && (data.code==='Ok' || data.routes || data.distances)) return data;
      lastErr=new Error(data?.code||'OSRM bad response');
    }catch(e){ lastErr=e; }
  }
  if(lastErr) throw lastErr;
  return null;
}

/** Jarak + geometri jalan dari A → B (km + latlngs) */
async function osrmRoutePair(a,b){
  if(!a||!b||!Number.isFinite(a.lat)||!Number.isFinite(b.lat)) return null;
  const coords=`${a.lng},${a.lat};${b.lng},${b.lat}`;
  try{
    const data=await osrmFetchJson(`/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`);
    const route=data?.routes?.[0];
    if(!route) return null;
    const km=(Number(route.distance)||0)/1000;
    const coordsLL=(route.geometry?.coordinates||[]).map(c=>[c[1],c[0]]); // geojson lon,lat → lat,lng
    return {km, coords:coordsLL, durationMin:(Number(route.duration)||0)/60};
  }catch(e){
    console.warn('OSRM route pair',e);
    return null;
  }
}

async function mappingRoadDistancesForRows(rows=hfMappingRows){
  if(!hfMappingLocation || !Number.isFinite(hfMappingLocation.lat) || !Number.isFinite(hfMappingLocation.lng)) return;
  const targets=(rows||[]).filter(x=>x.geo && Number.isFinite(x.geo.lat) && Number.isFinite(x.geo.lng));
  if(!targets.length) return;

  // Reset
  for(const row of targets){
    if(!Number.isFinite(row.roadDistanceKm)) row.distanceMode=row.distanceMode||'straight';
  }

  // 1) Coba Table API (cepat, banyak tujuan)
  const batchSize=25;
  let tableOk=false;
  for(let start=0; start<targets.length; start+=batchSize){
    const batch=targets.slice(start, start+batchSize);
    const points=[hfMappingLocation, ...batch.map(x=>x.geo)];
    const coords=points.map(p=>`${p.lng},${p.lat}`).join(';');
    const destinations=batch.map((_,i)=>i+1).join(';');
    try{
      const data=await osrmFetchJson(`/table/v1/driving/${coords}?sources=0&destinations=${destinations}&annotations=distance`);
      const distances=data?.distances?.[0];
      if(!Array.isArray(distances)) continue;
      batch.forEach((row,i)=>{
        const meters=distances[i];
        if(Number.isFinite(meters) && meters>=0){
          row.roadDistanceKm=meters/1000;
          row.distanceMode='road';
          tableOk=true;
        }
      });
    }catch(e){
      console.warn('OSRM table gagal',e);
    }
  }

  // 2) Jika table gagal/sebagian kosong → route per WO (lebih lambat tapi akurat + dapat geometri)
  for(const row of targets){
    if(Number.isFinite(row.roadDistanceKm) && row.distanceMode==='road' && row.roadPath?.length) continue;
    try{
      const r=await osrmRoutePair(hfMappingLocation, row.geo);
      if(r && Number.isFinite(r.km)){
        row.roadDistanceKm=r.km;
        row.distanceMode='road';
        row.roadPath=r.coords;
        row.roadDurationMin=r.durationMin;
      }else if(!Number.isFinite(row.roadDistanceKm)){
        row.roadDistanceKm=mappingDistanceKm(hfMappingLocation, row.geo);
        row.distanceMode='straight';
        row.roadPath=[[hfMappingLocation.lat,hfMappingLocation.lng],[row.geo.lat,row.geo.lng]];
      }
    }catch(e){
      if(!Number.isFinite(row.roadDistanceKm)){
        row.roadDistanceKm=mappingDistanceKm(hfMappingLocation, row.geo);
        row.distanceMode='straight';
      }
    }
  }
}

function mappingRouteDistance(row){
  return Number.isFinite(row?.roadDistanceKm)
    ? row.roadDistanceKm
    : (hfMappingLocation&&row?.geo ? mappingDistanceKm(hfMappingLocation,row.geo) : Infinity);
}
function mappingSlotRange(x){const m=String(x.slot||'').match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);return m?[Number(m[1])*60+Number(m[2]),Number(m[3])*60+Number(m[4])]:null;}
function mappingSlotConflictKeys(rows){const conflicts=new Set();for(let i=0;i<rows.length;i++){const a=mappingSlotRange(rows[i]);if(!a)continue;for(let j=i+1;j<rows.length;j++){const b=mappingSlotRange(rows[j]);if(b&&a[0]<b[1]&&b[0]<a[1]){conflicts.add(rows[i].key);conflicts.add(rows[j].key);}}}return conflicts;}

function mappingSlotBucket(row){
  const range=mappingSlotRange(row);
  if(!range) return 9999;
  return Math.floor(range[0]/30);
}
function mappingPointDistance(from,row){
  if(!from||!row?.geo) return Infinity;
  if(Number.isFinite(row.roadDistanceKm) && from===hfMappingLocation) return row.roadDistanceKm;
  return mappingDistanceKm(from,row.geo);
}
function mappingOrderOpenRows(openRows,startPoint){
  if(!openRows.length) return [];
  const groups=new Map();
  for(const row of openRows){
    const b=mappingSlotBucket(row);
    if(!groups.has(b)) groups.set(b,[]);
    groups.get(b).push(row);
  }
  const bucketKeys=[...groups.keys()].sort((a,b)=>a-b);
  const ordered=[];
  let cursor=startPoint&&Number.isFinite(startPoint.lat)?{lat:startPoint.lat,lng:startPoint.lng}:null;
  for(const key of bucketKeys){
    const pool=[...groups.get(key)];
    while(pool.length){
      let bestIdx=0,bestDist=Infinity;
      for(let i=0;i<pool.length;i++){
        const d=cursor?mappingPointDistance(cursor,pool[i]):mappingRouteDistance(pool[i]);
        if(d<bestDist){bestDist=d;bestIdx=i;}
      }
      const next=pool.splice(bestIdx,1)[0];
      ordered.push(next);
      if(next.geo&&Number.isFinite(next.geo.lat)) cursor={lat:next.geo.lat,lng:next.geo.lng};
    }
  }
  return ordered;
}

/** Bangun polyline rute jalan berurutan: start → WO1 → WO2 → ... */
async function mappingBuildRouteGeometry(orderedRows){
  const path=[];
  let prev=hfMappingLocation;
  if(!prev||!Number.isFinite(prev.lat)) return path;
  for(const row of orderedRows){
    if(!row.geo||!Number.isFinite(row.geo.lat)) continue;
    let seg=row.roadPath;
    // segmen dari prev (bukan selalu start) — hitung ulang jika cursor sudah pindah
    const fromStart=prev===hfMappingLocation || (prev.lat===hfMappingLocation.lat && prev.lng===hfMappingLocation.lng);
    if(!fromStart || !seg?.length){
      const r=await osrmRoutePair(prev, row.geo);
      if(r?.coords?.length){
        seg=r.coords;
        if(fromStart){
          row.roadPath=seg;
          row.roadDistanceKm=r.km;
          row.distanceMode='road';
          row.roadDurationMin=r.durationMin;
        }
      }
    }
    if(seg?.length){
      if(path.length && seg.length){
        // hindari duplikat titik sambung
        path.push(...seg.slice(1));
      }else path.push(...seg);
    }else{
      path.push([prev.lat,prev.lng],[row.geo.lat,row.geo.lng]);
    }
    prev={lat:row.geo.lat,lng:row.geo.lng};
  }
  return path;
}

async function mappingOptimizeRoute(){
  if(!hfMappingLocation){swalToast('Ambil Posisi Saya terlebih dahulu.','warning');return;}
  const openRows=hfMappingRows.filter(x=>!['done','cancel'].includes(mappingNormalizeStatus(x.status||'pending')));
  const closedRows=hfMappingRows.filter(x=>['done','cancel'].includes(mappingNormalizeStatus(x.status||'pending')));
  if(!openRows.length){swalToast('Tidak ada WO aktif untuk dioptimasi.','info');return;}
  swalToast('Menghitung jarak jalan (OSRM)...','info');
  for(const row of openRows){
    if(!row.geo && (row.address||row.kab||row.kec||row.raw||row.mapsUrl)) row.geo=await mappingGeocode(row);
  }
  await mappingRoadDistancesForRows(openRows);
  const ordered=mappingOrderOpenRows(openRows,hfMappingLocation);
  hfMappingRows=[...ordered,...closedRows];
  hfMappingRows.forEach((row,index)=>{row.routeOrder=index;});
  // Geometri rute jalan untuk peta
  try{
    const openOrdered=hfMappingRows.filter(x=>!['done','cancel'].includes(mappingNormalizeStatus(x.status||'pending')));
    hfMappingRoutePath=await mappingBuildRouteGeometry(openOrdered);
  }catch(e){ console.warn('build route geometry',e); hfMappingRoutePath=[]; }
  mappingRender();
  const roadN=openRows.filter(r=>r.distanceMode==='road').length;
  swalToast(roadN?`Rute dioptimasi · ${roadN} WO jarak jalan`:'Rute dioptimasi (sebagian garis lurus — OSRM gagal)','success');
}



let hfLeafletMap=null;
let hfMapLayerGroup=null;
function mappingStatusColor(status){
  const s=mappingNormalizeStatus(status);
  if(s==='done') return '#047857';
  if(s==='progress') return '#1d4ed8';
  if(s==='replied') return '#15803d';
  if(s==='belum_shareloc') return '#0369a1';
  if(s==='reschedule') return '#7e22ce';
  if(s==='cancel') return '#b91c1c';
  return '#c2410c';
}
function mappingEnsureMap(){
  const el=document.getElementById('mappingMap');
  if(!el || typeof L==='undefined') return null;
  if(hfLeafletMap) return hfLeafletMap;
  hfLeafletMap=L.map(el,{zoomControl:true,attributionControl:true});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(hfLeafletMap);
  hfMapLayerGroup=L.layerGroup().addTo(hfLeafletMap);
  setTimeout(()=>hfLeafletMap.invalidateSize(),80);
  return hfLeafletMap;
}
function mappingNumberIcon(n,color){
  if(typeof L==='undefined') return null;
  return L.divIcon({className:'hfMapMarker',html:'<div class="hfMapPin" style="--pin:'+color+'"><span>'+n+'</span></div>',iconSize:[28,28],iconAnchor:[14,14],popupAnchor:[0,-12]});
}
function mappingStartIcon(){
  if(typeof L==='undefined') return null;
  return L.divIcon({className:'hfMapMarker',html:'<div class="hfMapStart">★</div>',iconSize:[30,30],iconAnchor:[15,15],popupAnchor:[0,-12]});
}
function mappingRenderMap(rows){
  const wrap=document.getElementById('mappingMapWrap');
  if(!wrap) return;
  if(typeof L==='undefined'){
    wrap.style.display='none';
    console.warn('Leaflet tidak termuat');
    return;
  }
  rows=rows||hfMappingRows||[];

  // SYNC ONLY — jangan await expand di sini (bikin peta hilang/macet)
  for(const r of rows){
    // Cache akurat dulu
    if(r.key){
      const cached=mappingCoordCacheGet(r.key);
      if(cached) r.geo=cached;
    }
    if(r.mapsUrl){
      const direct=parseMapsUrlCoords(r.mapsUrl)||parseMapsUrlCoords(r.mapsUrlResolved||'');
      if(direct){ r.geo=direct; if(r.key) mappingCoordCacheSet(r.key, direct); }
      // Kalau masih nominatim padahal ada mapsUrl → buang (pin bohongan)
      else if(r.geo && r.geo.source==='nominatim') r.geo=null;
    }
    if((!r.geo||!Number.isFinite(r.geo.lat)) && r.raw){
      const c=parseMapsUrlCoords(r.raw);
      if(c) r.geo=c;
    }
  }

  const withGeo=rows.filter(r=>r.geo&&Number.isFinite(r.geo.lat)&&Number.isFinite(r.geo.lng));
  const hasStart=hfMappingLocation&&Number.isFinite(hfMappingLocation.lat);
  if(!withGeo.length && !hasStart){
    wrap.style.display='none';
    // Background: coba resolve short link lalu render ulang sekali
    mappingResolveShortLinksInBackground(rows);
    return;
  }
  wrap.style.display='block';
  const map=mappingEnsureMap();
  if(!map || !hfMapLayerGroup) return;
  hfMapLayerGroup.clearLayers();
  const bounds=[], path=[];

  if(hasStart){
    const start=L.marker([hfMappingLocation.lat,hfMappingLocation.lng],{icon:mappingStartIcon(),zIndexOffset:1000})
      .bindPopup('<b>📍 Posisi awal / Saya</b><br>'+hfMappingLocation.lat.toFixed(5)+', '+hfMappingLocation.lng.toFixed(5));
    hfMapLayerGroup.addLayer(start);
    bounds.push([hfMappingLocation.lat,hfMappingLocation.lng]);
    path.push([hfMappingLocation.lat,hfMappingLocation.lng]);
  }

  // Urutan pin = urutan list (routeOrder) agar nomor sama dengan kartu WO
  const orderedForMap=[...rows].sort((a,b)=>{
    if(Number.isFinite(a.routeOrder)&&Number.isFinite(b.routeOrder)) return a.routeOrder-b.routeOrder;
    return 0;
  });
  orderedForMap.forEach((x,i)=>{
    if(!x.geo||!Number.isFinite(x.geo.lat)||!Number.isFinite(x.geo.lng)) return;
    const st=mappingNormalizeStatus(x.status||'pending');
    const color=mappingStatusColor(st);
    const num=(typeof x.routeOrder==='number'?x.routeOrder:i)+1;
    const marker=L.marker([x.geo.lat,x.geo.lng],{icon:mappingNumberIcon(num,color)})
      .bindPopup(
        '<div class="hfMapPopup"><b>#'+num+' · '+escapeHtml(x.name||'WO')+'</b><br>'+
        escapeHtml(x.slot||'')+' · '+escapeHtml(st)+'<br>'+
        escapeHtml((x.address||'').slice(0,80))+'<br>'+
        x.geo.lat.toFixed(5)+', '+x.geo.lng.toFixed(5)+
        (x.geo.source==='maps_url'?' <small>(Maps)</small>':'')+
        '</div>'
      );
    hfMapLayerGroup.addLayer(marker);
    bounds.push([x.geo.lat,x.geo.lng]);
    if(!['done','cancel'].includes(st)) path.push([x.geo.lat,x.geo.lng]);
  });

  // Prioritas: geometri jalan OSRM; fallback garis antar pin
  const roadPath=(hfMappingRoutePath&&hfMappingRoutePath.length>=2)?hfMappingRoutePath:null;
  if(roadPath){
    const line=L.polyline(roadPath,{color:'#f39a00',weight:4,opacity:0.9});
    hfMapLayerGroup.addLayer(line);
  }else if(path.length>=2){
    const line=L.polyline(path,{color:'#f39a00',weight:3,opacity:0.7,dashArray:'6 8'});
    hfMapLayerGroup.addLayer(line);
  }
  if(bounds.length){
    try{ map.fitBounds(bounds,{padding:[28,28],maxZoom:15}); }
    catch(e){ map.setView(bounds[0],13); }
  }else if(hasStart){
    map.setView([hfMappingLocation.lat,hfMappingLocation.lng],13);
  }else{
    map.setView([-6.2383,106.9756],12);
  }
  setTimeout(()=>{ try{ map.invalidateSize(true); }catch(e){} }, 100);
  setTimeout(()=>{ try{ map.invalidateSize(true); }catch(e){} }, 400);
  setTimeout(()=>{ try{ map.invalidateSize(true); if(bounds.length) map.fitBounds(bounds,{padding:[28,28],maxZoom:15}); }catch(e){} }, 800);

  // Resolve short link di background tanpa blokir UI
  mappingResolveShortLinksInBackground(rows);
}

let hfMapsResolveRunning=false;
async function mappingResolveShortLinksInBackground(rows){
  if(hfMapsResolveRunning) return;
  const need=(rows||hfMappingRows||[]).filter(r=>{
    if(!r.mapsUrl) return false;
    if(r.geo && r.geo.source==='maps_url' && Number.isFinite(r.geo.lat)) return false;
    // short link atau URL belum ada koordinat
    return isShortMapsUrl(r.mapsUrl) || !parseMapsUrlCoords(r.mapsUrl);
  });
  if(!need.length) return;
  hfMapsResolveRunning=true;
  let changed=false;
  try{
    for(const r of need){
      try{
        const before=r.geo? (r.geo.lat+','+r.geo.lng) : '';
        const geo=await resolveRowGeoFromMapsUrl(r,{force:true});
        if(geo){
          const after=geo.lat+','+geo.lng;
          if(after!==before) changed=true;
        }
      }catch(e){}
    }
    if(changed){
      // hitung ulang jarak jalan untuk yang baru dapat koordinat
      try{
        if(hfMappingLocation) await mappingRoadDistancesForRows(need.filter(r=>r.geo));
        const open=hfMappingRows.filter(x=>!['done','cancel'].includes(mappingNormalizeStatus(x.status||'pending')));
        hfMappingRoutePath=await mappingBuildRouteGeometry(open);
      }catch(e){}
      mappingRender(); // refresh list + peta
    }
  }finally{
    hfMapsResolveRunning=false;
  }
}


function mappingClean(v){return String(v??'').replace(/\s+/g,' ').trim();}
function mappingPhone(v){
  const m=String(v||'').match(/(?:62|08)\d{8,13}/);
  return m?m[0]:'';
}
function mappingParseWO(raw){
  const lines=String(raw||'').split(/\r?\n/).map(x=>x.trimEnd()).filter(x=>x.trim());
  const out=[];

  // ID pelanggan nyata: 7–9 digit awalan 1 (umumnya 8 digit awalan 12).
  // Tolak HP (62/08), angka 10 digit awalan 51/71, dan angka terlalu panjang.
  function isRealCustomerId(v){
    const s=String(v||'').trim();
    if(/^1\d{6,8}$/.test(s)) return true;
    if(/^\d{7,9}$/.test(s) && !/^62/.test(s) && !/^08/.test(s) && !/^51/.test(s) && !/^71/.test(s)) return true;
    return false;
  }

  function extractCustomerId(cols, ohIndex, joined){
    // A) ID tepat SEBELUM kode OH  →  12186019 OH11599...
    if(ohIndex>=1 && isRealCustomerId(cols[ohIndex-1])) return mappingClean(cols[ohIndex-1]);
    // B) System export: [ticket, OH, pkg, type, vendor, customerId, NAME, ...]
    if(ohIndex===1 && isRealCustomerId(cols[5])) return mappingClean(cols[5]);
    // C) Format OH-first: ID ada tepat SETELAH kolom SLOT
    const slotIdx=cols.findIndex(x=>/SLOT\s*-?\s*\d+\s*\(/i.test(x)||/^slot-?\s*\d+/i.test(x)||/^ANYTIME$/i.test(x));
    if(slotIdx>=0){
      for(let i=slotIdx+1;i<Math.min(slotIdx+5,cols.length);i++){
        if(isRealCustomerId(cols[i])) return mappingClean(cols[i]);
      }
    }
    // D) Regex di baris utuh: angka 8 digit awalan 1 tepat sebelum OH
    const beforeOH=joined.match(/(?:^|[^\d])(1\d{6,8})\s+OH\d{8,}/i);
    if(beforeOH) return beforeOH[1];
    // E) Regex: setelah SLOT ... ambil angka 8 digit awalan 1
    const afterSlot=joined.match(/SLOT\s*-?\s*\d+\s*\([^)]*\)\s+(1\d{6,8})\b/i)
      || joined.match(/\bANYTIME\b[\s\S]{0,40}?\b(1\d{6,8})\b/i);
    if(afterSlot) return afterSlot[1];
    // F) Scan kolom: prioritaskan awalan 1
    const preferred=cols.find(v=>/^1\d{6,8}$/.test(String(v||'').trim()));
    if(preferred) return mappingClean(preferred);
    // G) Cadangan dari teks penuh
    const any=joined.match(/(?:^|[^\d])(1\d{6,8})(?!\d)/);
    if(any) return any[1];
    return '';
  }

  function extractName(cols, ohIndex, joined){
    // Export instalasi terbaru: OH, Internet 100, INSTALLATION, vendor, customerId, nama, alamat...
    if(ohIndex===0 && /INSTALLATION/i.test(joined)){
      const idIdx=cols.findIndex((v,i)=>i>0 && isRealCustomerId(v));
      if(idIdx>=0 && cols[idIdx+1] && !/^\d+$/.test(cols[idIdx+1])){
        return mappingClean(cols[idIdx+1]);
      }
    }
    // Regex paling andal: ambil nama di antara OH dan HiFi/Internet (support multi-kata)
    const mJoined=joined.match(/OH\d{8,}\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'\-\s]{2,60}?)\s+(?:HiFi|Internet)/i);
    if(mJoined) return mappingClean(mJoined[1]);
    const mIdFirst=joined.match(/1\d{6,8}\s+OH\d{8,}\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'\-\s]{2,60}?)\s+(?:HiFi|Internet)/i);
    if(mIdFirst) return mappingClean(mIdFirst[1]);

    // System export: nama di cols[6]
    if(ohIndex===1 && /INSTALLATION/i.test(joined) && cols[6] && !/^\d+$/.test(cols[6]) && !/^(Internet|HiFi)/i.test(cols[6])){
      return mappingClean(cols[6]);
    }
    // ID-first tab: nama di cols[2] (bisa multi-kolom kalau spasi)
    if(ohIndex===1 && cols[2] && !/^(Internet|HiFi)\s*\d+/i.test(cols[2]) && !/^\d+$/.test(cols[2])){
      // Gabungkan kata nama sampai ketemu HiFi/Internet
      const parts=[];
      for(let i=2;i<Math.min(cols.length,8);i++){
        if(/^(HiFi|Internet)\s*\d*/i.test(cols[i]) || /^\d{5,}$/.test(cols[i])) break;
        if(/^[A-Za-zÀ-ÿ]/.test(cols[i])) parts.push(cols[i]);
        else break;
      }
      if(parts.length) return mappingClean(parts.join(' '));
      return mappingClean(cols[2]);
    }
    // OH-first: nama di cols[1]
    if(ohIndex===0 && cols[1] && !/^(Internet|HiFi)\s*\d+/i.test(cols[1]) && !/^\d+$/.test(cols[1])){
      return mappingClean(cols[1]);
    }
    if(ohIndex>=0){
      const candidates=cols.slice(ohIndex+1, Math.min(ohIndex+8,cols.length));
      const n=candidates.find(x=>x && !/^(Internet|HiFi)\s*\d+/i.test(x) && !/^(INSTALLATION|CHANGE TEAM|system|slot|ANYTIME|DONE|Nokia|Seahawks|Spartan|SVM_)/i.test(x) && !/^(?:62|08)\d{8,13}/.test(x) && !/^\d{5,}$/.test(x) && !/^(JAWA|BEKASI|KAB|KOTA)/i.test(x));
      if(n) return mappingClean(n);
    }
    return '';
  }

  for(const line of lines){
    // Parser inti bersama: format instalasi export memakai hasil normalisasi yang
    // sama dengan Generator Chat, agar ID/nama/alamat/slot tidak berbeda antarfitur.
    const normalized=parseWORecord(line);
    if(normalized?.format==='system-install'){
      const key=normalized.oh+'|'+(normalized.customerId||normalized.ticket||'');
      if(!out.some(x=>x.key===key)){
        out.push({
          key,id:normalized.ticket||'',customerId:normalized.customerId,oh:normalized.oh,
          name:normalized.name||'Pelanggan',phone:normalized.phone,
          speed:normalized.package,slot:normalized.slot||'Tanpa slot',slotNo:normalized.slotNo,
          status:'',address:normalized.address,kab:normalized.kab,kec:'',raw:line
        });
      }
      continue;
    }

    // Support tab DAN spasi (format flat chat)
    let cols=line.split('\t').map(mappingClean);
    if(cols.length<3){
      // Coba pecah spasi-ganda dulu, lalu spasi tunggal jika masih sedikit
      cols=line.split(/\s{2,}/).map(mappingClean);
      if(cols.length<3) cols=line.trim().split(/\s+/).map(mappingClean);
    }
    let ohIndex=cols.findIndex(x=>/^OH\d{8,}$/i.test(x));
    // Flat: OH nempel di token yang lebih panjang → cari token yang mengandung OH
    if(ohIndex<0){
      ohIndex=cols.findIndex(x=>/OH\d{8,}/i.test(x));
      if(ohIndex>=0 && !/^OH\d{8,}$/i.test(cols[ohIndex])){
        // ekstrak OH murni
        const om=cols[ohIndex].match(/(OH\d{8,})/i);
        if(om) cols[ohIndex]=om[1];
      }
    }
    if(ohIndex<0) continue;

    const joined=cols.join(' ');
    const slotMatch=joined.match(/(?:slot\s*-?\s*\d+\s*[-–]\s*)?(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/i);
    const slot=slotMatch ? `${slotMatch[1]} - ${slotMatch[2]}` : (/ANYTIME/i.test(joined)?'Anytime':'Tanpa slot');
    const slotNo=(joined.match(/slot\s*-?\s*(\d+)/i)||[])[1]||'';
    const speed=(cols.find(x=>/^(HiFi|Internet)\s*\d+/i.test(x))||'').trim()
      || ((joined.match(/(HiFi\s*\d+\s*Mbps|Internet\s*\d+)/i)||[])[1]||'');
    const status=(cols.find(x=>/^(DONE|PENDING|CANCEL|CANCELLED|IN PROGRESS|NEW)$/i.test(x))||'').trim();
    const phoneCol=cols.find(x=>/(?:62|08)\d{8,13}/.test(x))||'';
    const phone=mappingPhone(phoneCol)||mappingPhone(joined);
    const name=extractName(cols, ohIndex, joined)||'Pelanggan';
    const customerId=extractCustomerId(cols, ohIndex, joined);
    const id=cols[0]||'';

    const addressParts=[];
    for(let i=0;i<cols.length;i++){
      if(/JALAN|JL\.?|PERUM|KAMPUNG|KP\.?|GANG|GRAHA|PEMUKIMAN|NO\.?\s*NN|#\d/i.test(cols[i]) && cols[i].length>15){
        addressParts.push(cols[i]);
      }
    }
    const address=mappingClean(addressParts.sort((a,b)=>b.length-a.length)[0]||'')
      || mappingClean(cols.find(x=>/JALAN|JL\.?|PERUM|KAMPUNG|KP\.?|GANG/i.test(x))||'');
    const kab=cols.find(x=>/^KAB\.?\s*\.?\s*BEKASI$/i.test(x)||/^KAB\./i.test(x)||/^KOTA\b/i.test(x))||'';
    const kec=cols.find(x=>/^(TAMBUN|CIKARANG|CIBITUNG|MUSTIKAJAYA|MUKTIWARI|MANGUNJAYA|SETU|BABELAN|BEKASI|MEDANSATRIA|PEJUANG|KARANGSATRIA)/i.test(x) && !/^KAB\./i.test(x))||'';
    const key=String(cols[ohIndex]||'')+'|'+(customerId||cols[0]||'');
    if(out.some(x=>x.key===key)) continue;
    out.push({key,id,customerId,oh:cols[ohIndex],name,phone,speed,slot,slotNo,status,address,kab,kec,raw:line});
  }

  // Fallback regex untuk baris yang gagal dipecah kolom
  if(!out.length){
    for(const line of lines){
      if(!/OH\d{8,}/i.test(line)) continue;
      const oh=(line.match(/(OH\d{8,})/i)||[])[1]||'';
      const cid=(line.match(/(?:^|[^\d])(1\d{6,8})\s+OH\d{8,}/i)||line.match(/SLOT\s*-?\s*\d+\s*\([^)]*\)\s+(1\d{6,8})\b/i)||[])[1]||'';
      const nm=(line.match(/OH\d{8,}\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'\-\s]{2,50}?)\s+(?:HiFi|Internet)/i)
        ||line.match(/1\d{6,8}\s+OH\d{8,}\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'\-\s]{2,50}?)\s+(?:HiFi|Internet)/i)||[])[1]||'Pelanggan';
      const sm=line.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
      const phone=mappingPhone(line);
      const speed=((line.match(/(HiFi\s*\d+\s*Mbps|Internet\s*\d+)/i)||[])[1]||'');
      out.push({key:oh+'|'+cid,id:'',customerId:cid,oh,name:mappingClean(nm),phone,speed,slot:sm?`${sm[1]} - ${sm[2]}`:(/ANYTIME/i.test(line)?'Anytime':'Tanpa slot'),slotNo:(line.match(/slot\s*-?\s*(\d+)/i)||[])[1]||'',status:'',address:'',kab:'',kec:'',raw:line});
    }
  }
  return out;
}
async function mappingLoadState(){
  if(!supabaseClient || !currentUser?.id){
    hfMappingRows=[];
    mappingRender();
    return;
  }
  const {data,error}=await supabaseClient.from(HF_GENERATED_WO_TABLE)
    .select('id,mapping_key,oh,customer_id,name,phone,speed,slot,slot_no,status,address,maps_url,kab,kec,raw,created_at')
    .eq('user_id',currentUser.id)
    .order('created_at',{ascending:true});
  if(error){
    console.error('Generated WO load error',error);
    if(String(error.code||'')==='42P01' || /relation .*generated_wo.* does not exist/i.test(String(error.message||''))){
      throw new Error('Tabel generated_wo belum dibuat di Supabase. Jalankan SQL patch yang ikut di paket ini.');
    }
    throw error;
  }
  hfMappingRows=(data||[]).map(r=>({
    dbId:r.id,key:r.mapping_key||`${r.oh||''}|${r.customer_id||''}`,oh:r.oh||'',customerId:r.customer_id||'',
    name:r.name||'Pelanggan',phone:r.phone||'',speed:r.speed||'',slot:r.slot||'Tanpa slot',slotNo:r.slot_no||'',
    status:r.status||'pending',address:r.address||'',mapsUrl:r.maps_url||'',kab:r.kab||'',kec:r.kec||'',raw:r.raw||'',createdAt:r.created_at?new Date(r.created_at).getTime():Date.now(),geo:(()=>{ const c=mappingCoordCacheGet(r.mapping_key); return c||null; })()
  }));
  // Cloud adalah sumber kebenaran. Hapus state mapping lama yang pernah tersimpan di browser.
  try{localStorage.removeItem(HF_MAPPING_KEY);localStorage.removeItem(HF_MAPPING_STATUS_KEY);}catch(e){}
  // Memuat data cloud tidak boleh otomatis menghitung ulang rute atau memunculkan notifikasi.
  mappingRender();
}

const HF_STATUS_OPTS=globalThis.HF_STATUS_OPTS=[
  {v:'pending',     label:'Belum Respon', icon:'💬', cls:'st-pending'},
  {v:'belum_shareloc', label:'Belum Shareloc', icon:'📍', cls:'st-shareloc'},
  {v:'replied',     label:'Sudah Respon', icon:'✅', cls:'st-replied'},
  {v:'progress',    label:'On Progress',  icon:'🔄', cls:'st-progress'},
  {v:'reschedule',  label:'Reschedule',   icon:'📅', cls:'st-reschedule'},
  {v:'done',         label:'DONE',         icon:'🏁', cls:'st-done'},
  {v:'cancel',      label:'Cancel',       icon:'❌', cls:'st-cancel'}
];

async function mappingSaveRows(rows){
  if(!supabaseClient || !currentUser?.id) throw new Error('Sesi Supabase belum siap.');
  if(!rows.length) return;
  const payload=rows.map(x=>({
    user_id:currentUser.id, mapping_key:x.key, oh:x.oh||'', customer_id:x.customerId||null,
    name:x.name||'Pelanggan', phone:x.phone||'', speed:x.speed||'', slot:x.slot||'Tanpa slot',
    slot_no:x.slotNo||null, status:mappingNormalizeStatus(x.status||'pending'), address:x.address||'', maps_url:x.mapsUrl||'',
    kab:x.kab||'', kec:x.kec||'', raw:x.raw||'', created_at:x.createdAt?new Date(x.createdAt).toISOString():new Date().toISOString()
  }));
  const {data,error}=await supabaseClient.from(HF_GENERATED_WO_TABLE)
    .upsert(payload,{onConflict:'user_id,mapping_key'})
    .select('id,mapping_key,oh,customer_id,name,phone,speed,slot,slot_no,status,address,maps_url,kab,kec,raw,created_at');
  if(error) throw error;
  if(Array.isArray(data)){
    const byKey=new Map(data.map(r=>[r.mapping_key,r]));
    hfMappingRows=hfMappingRows.map(x=>{const r=byKey.get(x.key);return r?{...x,dbId:r.id}:x;});
  }
}

function mappingStatusMap(){
  const st={};
  hfMappingRows.forEach(x=>{st[x.key]=x.status||'pending';});
  return st;
}
function mappingNormalizeStatus(v){
  v=String(v||'').toLowerCase();
  if(v==='finish') return 'done';
  if(v==='done') return 'done';
  if(v==='belum_shareloc'||v==='replied'||v==='progress'||v==='reschedule'||v==='cancel'||v==='pending') return v;
  return 'pending';
}
async function mappingUpdateCloudStatus(key,value,extra={}){
  const row=hfMappingRows.find(x=>x.key===key);
  if(!row || !supabaseClient || !currentUser?.id) throw new Error('Sesi Supabase belum siap.');
  const patch={status:mappingNormalizeStatus(value),...extra};
  const {error}=await supabaseClient.from(HF_GENERATED_WO_TABLE)
    .update(patch)
    .eq('user_id',currentUser.id).eq('mapping_key',key);
  if(error) throw error;
  row.status=mappingNormalizeStatus(value);
  if(Object.prototype.hasOwnProperty.call(extra,'maps_url')) row.mapsUrl=extra.maps_url||'';
}
async function mappingEditMapsLink(key){
  const row=hfMappingRows.find(x=>x.key===key);
  if(!row){mappingRender();return;}
  const result=await Swal.fire({
    title:'✏️ Edit Link Google Maps',
    html:'<div style="text-align:left;font-size:12px;color:#64748b;margin-bottom:8px">Perbarui tautan Maps untuk <b>'+escapeHtml(row.name||'Pelanggan')+'</b>. Status WO tidak akan diubah.</div>',
    input:'url', inputLabel:'Link Google Maps', inputPlaceholder:'https://maps.app.goo.gl/...',
    inputValue:row.mapsUrl||'', showCancelButton:true, confirmButtonText:'Simpan Link', cancelButtonText:'Batal',
    allowOutsideClick:false, inputValidator:(value)=>{
      const raw=String(value||'').trim(); if(!raw)return 'Masukkan link Google Maps dulu.';
      try{const u=new URL(raw);if(u.protocol!=='https:'||!(/(^|\.)maps\.app\.goo\.gl$/i.test(u.hostname)||/(^|\.)google\.[a-z.]+$/i.test(u.hostname)||/(^|\.)google\.com$/i.test(u.hostname)||/(^|\.)maps\.googleapis\.com$/i.test(u.hostname)))return 'Gunakan link HTTPS Google Maps yang valid.';}catch(e){return 'Format link tidak valid.';}
      return undefined;
    }
  });
  if(!result.isConfirmed)return;
  const mapsUrl=String(result.value||'').trim();
  try{
    await mappingUpdateCloudStatus(key,row.status,{maps_url:mapsUrl});
    row.mapsUrl=mapsUrl;
    row.geo=null; // reset — jangan pakai geocode alamat lama
    row.roadDistanceKm=null; row.distanceMode='straight'; row.roadPath=null;
    swalToast('Link disimpan · mengambil koordinat...','info');
    const geo=await resolveRowGeoFromMapsUrl(row,{force:true});
    if(!geo){
      // fallback alamat hanya jika link tidak bisa di-resolve
      try{ await mappingGeocode(row); }catch(e){}
    }
    try{
      if(hfMappingLocation) await mappingRoadDistancesForRows([row]);
    }catch(e){}
    mappingRender();
    if(row.geo && row.geo.source==='maps_url') swalToast('Pin peta sesuai link Google Maps','success');
    else if(row.geo) swalToast('Pin dari perkiraan alamat (link pendek gagal di-resolve)','warning');
    else swalToast('Koordinat belum terbaca dari link. Coba tempel link penuh dari Google Maps.','warning');
  }catch(e){console.error('Update link Maps gagal',e);swalToast('Gagal menyimpan link Maps: '+(e.message||e),'error');}
}

/* ===== Report form: modal DOM persistent (tidak close saat kamera/GPS) ===== */
let hfScanInProgress=false;
let hfReportFormRow=null;
let hfLastOntScan=null;
let hfReportModalResolve=null;

function extractTeamFromRaw(raw){
  const s=String(raw||'');
  const m=s.match(/\b(BBB(?:_[A-Z0-9]+)?)\b/i);
  return m?m[1].toUpperCase():'BBB';
}
function reportDateLabel(dt){
  const d=dt instanceof Date?dt:new Date();
  if(Number.isNaN(d.getTime())) return fromIsoDate(localISO(new Date()));
  return fromIsoDate(localISO(d));
}
function buildInstallReportText(f){
  const line=(k,v)=>k+(v!==undefined&&v!==null&&String(v).trim()!==''?' '+String(v).trim():'');
  return [
    'REPORT INSTALASI BARU','',
    line('Hari/Tgl :',f.hariTgl), line('Team :',f.team),'',
    line('Teknisi :',f.teknisi),'', String(f.rawLine||'').trim(),'',
    line('ONT :',f.ont), line('G-SN :',f.gsn), line('MAC :',f.mac), line('DSN :',f.dsn),
    line('WIFI KEY :',f.wifiKey),'',
    line('TIKOR CST :',f.tikorCst), line('TIKOR FAT :',f.tikorFat),'',
    line('FAT ID :',f.fatId), line('PORT :',f.port),'',
    'HASIL SIGNAL :',
    line('SIGNAL FAT :',f.signalFat?f.signalFat+' dBm':'- dBm'),
    line('SIGNAL RX :',f.signalRx?f.signalRx+' dBm':'- dBm'),
    line('SIGNAL TX :',f.signalTx?f.signalTx+' dBm':' dBm'),'',
    'MATRIAL:', line('KLEM :',f.klem), line('TIES :',f.ties), line('MARKER :',f.marker), line('PRECONE :',f.precone),'',
    line('INDIKATOR:',f.indikator||'ON'), line('INDIKATOR WIFI 2,4:',f.wifi24||'ON'), line('INDIKATOR WIFI 5:',f.wifi5||'ON'),'',
    line('USERNAME :',f.username), line('PASSWORD :',f.password)
  ].join('\n');
}
function reportFormVal(id){ return String(document.getElementById(id)?.value??'').trim(); }
function reportFormSet(id,val){ const el=document.getElementById(id); if(el&&val!=null&&String(val).trim()!=='') el.value=String(val).trim(); }

function detectOntVendor(sn){
  const s=String(sn||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(!s) return '';
  const map=[['ZTEG','ZTE'],['ZTE','ZTE'],['ALCL','Nokia'],['NOKG','Nokia'],['NOKW','Nokia'],['NOKI','Nokia'],['HWTC','Huawei'],['HWTG','Huawei'],['HWT','Huawei'],['FHTT','FiberHome'],['FHT','FiberHome'],['CMDC','ZTE'],['TMBB','Technicolor'],['SCOM','Sagemcom'],['TPLG','TP-Link'],['DSNW','DASAN'],['CIGG','CIG'],['RTKG','Realtek'],['UBNT','Ubiquiti']];
  for(const [pref,name] of map){ if(s.startsWith(pref)) return name; }
  if(/^[0-9A-F]{8,}$/.test(s)){
    try{
      const chars=[];
      for(let i=0;i<8;i+=2){ const c=parseInt(s.slice(i,i+2),16); if(c>=32&&c<127) chars.push(String.fromCharCode(c)); }
      const ascii=chars.join('').toUpperCase();
      for(const [pref,name] of map){ if(ascii.startsWith(pref.slice(0,4))||ascii.startsWith(pref)) return name; }
    }catch(e){}
  }
  return '';
}

function formatMac(raw){
  const hex=String(raw||'').toUpperCase().replace(/[^0-9A-F]/g,'');
  if(hex.length!==12) return '';
  return hex.match(/.{2}/g).join('-');
}

/** Validasi ketat — tolak sampah OCR (SUPPORTDOC, dll) */
function isPlausibleGsn(s){
  const u=String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  // Prefiks vendor + 5–14 char (ZTEGDE7A9E2B = ZTEG + 8)
  if(!/^(ZTEG|ALCL|HWTC|FHTT|NOKG|NOKW)[A-Z0-9]{5,14}$/.test(u)) return false;
  if(u.length<10 || u.length>20) return false;
  if(!/\d/.test(u)) return false;
  return true;
}
/** Normalisasi kandidat DSN (barcode sering tanpa prefix penuh). */
function normalizeDsnCandidate(raw){
  let u=String(raw||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(!u) return '';
  // OCR: 3IN / 31N / 8TN → 3TN
  u=u.replace(/^3IN/,'3TN').replace(/^31N/,'3TN').replace(/^8TN/,'3TN');
  // Barcode ZTE EN: EQUGT6G11911 → ZTEEQUGT6G11911 (label: ZTE+EQUGT)
  if(/^EQUGT[A-Z0-9]{4,16}$/.test(u)) u='ZTE'+u;
  // Kadang terbaca ZTEQUGT (satu E hilang dari EQUGT)
  if(/^ZTEQUGT[A-Z0-9]{4,16}$/.test(u)) u='ZTE'+'E'+u.slice(3);
  // ZTE + EQUGT tanpa E ganda
  if(/^ZTEEQUGT/.test(u)===false && /^ZTEEQ[A-Z0-9]+/.test(u)){
    /* keep */
  }
  return u;
}

function isPlausibleDsn(s){
  const u=normalizeDsnCandidate(s);
  if(!u || u.length<8 || u.length>32) return false;
  // Tolak teks dokumentasi / URL / kata Inggris
  if(/(SUPPORT|DOCUI|HTTP|HTTPS|WWW|HTML|MANUAL|SCANTO|CORPORATION|ASIANET|UNIFIBER|PASSWORD|USERNAME)/i.test(u)) return false;
  // Jangan anggap GPON SN (ZTEG/ALCL) sebagai DSN
  if(/^(ZTEG|ALCL|HWTC|FHTT)/.test(u)) return false;
  // Nokia P/N: 3TN + 5–14 char (total 8–17) — min sebelumnya 10 menolak P/N pendek
  if(/^3TN[A-Z0-9]{5,14}$/.test(u)) return true;
  // ZTE D-SN
  if(/^(ZTE0|ZTEE)[A-Z0-9]{5,22}$/.test(u)) return true;
  if(/^ZTEEQUGT[A-Z0-9]{4,16}$/.test(u)) return true;
  // ZTE generik (bukan ZTEG = GPON)
  if(/^ZTE[A-Z0-9]{9,24}$/.test(u) && /\d/.test(u) && !/^ZTEG/.test(u)) return true;
  return false;
}
function isPlausibleMac(s){
  const hex=String(s||'').toUpperCase().replace(/[^0-9A-F]/g,'');
  if(hex.length!==12) return false;
  if(/^0{12}$/.test(hex)) return false;
  if(/^([0-9A-F])\1{11}$/.test(hex)) return false;
  // OCR sering menghasilkan pola aneh ber-nol
  if(/0{4,}/.test(hex)) return false;
  const zeros=(hex.match(/0/g)||[]).length;
  if(zeros>=6) return false;
  return true;
}

function extractNokiaPn(text){
  const raw=String(text||'').toUpperCase();
  let s=raw
    .replace(/3\s*I\s*N/g,'3TN').replace(/3\s*1\s*N/g,'3TN')
    .replace(/8\s*T\s*N/g,'3TN').replace(/3\s*T\s*M/g,'3TN')
    .replace(/3\s*T\s*N/g,'3TN');
  s=s.replace(/[^A-Z0-9]/g,'');
  // Ambil 3TN... terpanjang yang valid
  const all=[...s.matchAll(/(3TN[A-Z0-9]{5,14})/g)].map(m=>m[1]);
  for(const cand of all.sort((a,b)=>b.length-a.length)){
    if(isPlausibleDsn(cand)) return cand;
  }
  const m2=raw.match(/3\s*T\s*N\s*([0-9A-Z]{5,14})/i);
  if(m2){
    const cand=('3TN'+m2[1]).replace(/[^A-Z0-9]/gi,'').toUpperCase();
    if(isPlausibleDsn(cand)) return cand;
  }
  return '';
}

/** Cari DSN di string barcode mentah (Nokia 3TN / ZTE ZTEE|EQUGT). */
function extractDsnFromBarcodeRaw(raw){
  const s=String(raw||'');
  if(!s) return '';
  // Nokia
  const pn=extractNokiaPn(s);
  if(pn) return pn;
  const up=s.toUpperCase().replace(/[^A-Z0-9]/g,'');
  // ZTE full
  let m=up.match(/((?:ZTEE|ZTE0)[A-Z0-9]{5,22})/);
  if(m){
    const c=normalizeDsnCandidate(m[1]);
    if(isPlausibleDsn(c)) return c;
  }
  m=up.match(/(ZTEEQUGT[A-Z0-9]{4,16})/);
  if(m && isPlausibleDsn(m[1])) return m[1];
  // EQUGT saja (umum di barcode EN ZTE)
  m=up.match(/(EQUGT[A-Z0-9]{4,16})/);
  if(m){
    const c=normalizeDsnCandidate(m[1]);
    if(isPlausibleDsn(c)) return c;
  }
  // GS1 AI payload: (10) atau (21) sering bawa serial
  const ai=[...s.matchAll(/\(\s*(?:10|21|91|92)\s*\)\s*([A-Za-z0-9]{6,24})/g)];
  for(const a of ai){
    const c=normalizeDsnCandidate(a[1]);
    if(isPlausibleDsn(c)) return c;
    const pn2=extractNokiaPn(a[1]);
    if(pn2) return pn2;
  }
  // Whole string
  const whole=normalizeDsnCandidate(up);
  if(isPlausibleDsn(whole)) return whole;
  return '';
}

function expandBarcodePayload(raw){
  const s=String(raw||'').trim();
  if(!s) return [];
  const out=[];
  const add=(v)=>{
    let x=String(v||'').trim();
    if(!x) return;
    x=x.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/gi,'');
    if(x && !out.includes(x)) out.push(x);
  };

  const aiRe=/\(([^)]+)\)([^(]*)/g;
  let m;
  const aiVals=[];
  while((m=aiRe.exec(s))){
    const val=String(m[2]||'').trim();
    if(val){ add(val); aiVals.push(val.toUpperCase()); }
  }

  const snRe=/((?:ALCL|ZTEG|ZTEE|ZTE0|HWTC|FHTT|NOKG|NOKW)[A-Z0-9]{4,22})/gi;
  while((m=snRe.exec(s))) add(m[1].toUpperCase());

  // Nokia P/N + ZTE D-SN (termasuk EQUGT)
  const dsnFound=extractDsnFromBarcodeRaw(s);
  if(dsnFound) add(dsnFound);
  const pn=extractNokiaPn(s);
  if(pn) add(pn);
  const pnRe=/\b(3TN[A-Z0-9]{5,14})\b/gi;
  while((m=pnRe.exec(s))) add(m[1].toUpperCase());
  const equRe=/\b(EQUGT[A-Z0-9]{4,16})\b/gi;
  while((m=equRe.exec(s))) add(normalizeDsnCandidate(m[1]));
  const zteeRe=/\b((?:ZTEE|ZTE0)[A-Z0-9]{5,22})\b/gi;
  while((m=zteeRe.exec(s))) add(m[1].toUpperCase());

  for(const val of aiVals){
    const hex=val.replace(/[^0-9A-F]/gi,'');
    if(hex.length===12 && !/^(ALCL|ZTEG|ZTEE|ZTE0|HWTC|3TN)/i.test(val)) add(hex);
  }
  const macSep=s.match(/\b([0-9A-Fa-f]{2}(?:[:\-][0-9A-Fa-f]{2}){5})\b/g);
  if(macSep) macSep.forEach(add);

  if(!aiVals.length){
    s.split(/[\s,;|/]+/).forEach(tok=>{
      const u=tok.replace(/[^A-Za-z0-9]/g,'');
      if(u.length>=10 && u.length<=24) add(u);
    });
    const macM=s.toUpperCase().match(/(?:^|[^0-9A-F])([0-9A-F]{12})(?:[^0-9A-F]|$)/);
    if(macM) add(macM[1]);
  }

  if(!out.length) add(s.replace(/[()]/g,''));
  return out;
}

function classifyOntBarcode(raw){
  let v=String(raw||'').trim();
  if(!v) return null;
  v=v.replace(/^(MAC(?:\s*ID)?|GPON\s*SN|G-?SN|D-?SN|S\/N|SN|ONT\s*P\/N|P\/N)[:\s\-]*/i,'').trim();
  v=v.replace(/^\([A-Z0-9]+\)/i,'').trim();
  const up=v.toUpperCase().replace(/\s+/g,'');
  if(!up || up.length<6) return null;
  if(/\([A-Z0-9]+\)/i.test(v) && v.length>20) return null;

  // DSN dulu (Nokia 3TN / ZTE ZTEE|EQUGT) — sebelum MAC hex
  const dsnCand=extractDsnFromBarcodeRaw(v) || extractDsnFromBarcodeRaw(up);
  if(dsnCand) return {type:'dsn', value:dsnCand};

  if(/^([0-9A-F]{2}([-:])){5}[0-9A-F]{2}$/i.test(v) || (/^[0-9A-F]{12}$/i.test(up) && !/^(ZTEG|ZTEE|ZTE0|ALCL|HWTC|3TN|EQUGT)/i.test(up))){
    const mac=formatMac(up.length===12?up:v);
    if(isPlausibleMac(mac)) return {type:'mac', value:mac};
    return null;
  }

  if(isPlausibleGsn(up)) return {type:'gsn', value:up};
  const dsn2=normalizeDsnCandidate(up);
  if(isPlausibleDsn(dsn2)) return {type:'dsn', value:dsn2};

  return null;
}

function parseOntLabelText(ocrText){
  let t=String(ocrText||'')
    .replace(/GP0N/gi,'GPON')
    .replace(/GPOM/gi,'GPON')
    .replace(/GPON\s*5N/gi,'GPON SN')
    .replace(/[|]/g,'I');
  const found={mac:'',gsn:'',dsn:'',ont:'',username:'',password:'',wifiKey:''};
  const grab=(re)=>{
    const m=t.match(re);
    return m?String(m[1]||'').trim():'';
  };
  const cleanSn=(s)=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');

  let mac=grab(/MAC(?:\s*ID)?\s*[:.\-]?\s*([0-9A-Fa-f]{2}(?:[:\-\s]?[0-9A-Fa-f]{2}){5})/i);
  if(!mac) mac=grab(/MAC(?:\s*ID)?\s*[:.\-]?\s*([0-9A-Fa-f]{12})/i);
  if(mac){
    const fm=formatMac(mac);
    if(isPlausibleMac(fm)) found.mac=fm;
  }

  let gsn=grab(/GPON\s*SN\s*[:.\-]?\s*([A-Z0-9]{8,20})/i);
  if(!gsn) gsn=grab(/\bG[\-\s]?SN\s*[:.\-]?\s*((?:ALCL|ZTEG|HWTC|FHTT)[A-Z0-9]+)/i);
  if(!gsn) gsn=grab(/\bS\s*\/\s*N\s*[:.\-]?\s*((?:ALCL|ZTEG|HWTC|FHTT)[A-Z0-9]+)/i);
  if(!gsn) gsn=grab(/\bS\/N\s*[:.\-]?\s*((?:ALCL|ZTEG|HWTC|FHTT)[A-Z0-9]+)/i);
  if(!gsn) gsn=grab(/WiFi\s*Key\s*[:.\-]?\s*((?:ZTEG|ALCL|HWTC)[A-Z0-9]{6,16})/i);
  if(!gsn){
    const m=t.match(/\b((?:ALCL|ZTEG|HWTC|FHTT)[A-Z0-9]{6,16})\b/i);
    if(m) gsn=m[1];
  }
  if(!gsn){
    const m=t.match(/(ZTEG[A-Z0-9]{6,12})/i);
    if(m) gsn=m[1];
  }
  gsn=cleanSn(gsn);
  if(gsn && isPlausibleGsn(gsn)) found.gsn=gsn;

  // D-SN / Nokia ONT P/N — prioritas tinggi
  let dsn=grab(/\bD[\-\s]?SN\s*[:.\-]?\s*([A-Z0-9]{10,24})/i);
  if(!dsn) dsn=grab(/\bD[\-\s]?SN\s*[:.\-]?\s*((?:ZTEE|ZTE0|ZTE)[A-Z0-9\s]{8,22})/i);
  if(!dsn) dsn=grab(/ONT\s*P\s*[\/|I1l]?\s*N\s*[:.\-]?\s*(3TN[A-Z0-9]{6,14})/i);
  if(!dsn) dsn=grab(/ONT\s*P\s*\/\s*N\s*[:.\-]?\s*([A-Z0-9]{8,20})/i);
  if(!dsn) dsn=grab(/\bP\s*[\/|I1l]?\s*N\s*[:.\-]?\s*(3TN[A-Z0-9]{6,14})/i);
  if(!dsn) dsn=grab(/\bP\/?N\s*[:.\-]?\s*(3TN[A-Z0-9]{6,14})/i);
  if(!dsn) dsn=extractNokiaPn(t);
  if(!dsn){
    const m=t.match(/(3TN[A-Z0-9]{6,14})/i);
    if(m) dsn=m[1];
  }
  if(!dsn){
    const m=t.match(/\b((?:ZTE0|ZTEE)[A-Z0-9]{6,20})\b/i);
    if(m) dsn=m[1];
  }
  if(!dsn){
    const m=t.match(/(ZTEE[A-Z0-9]{6,20}|ZTE0[A-Z0-9]{6,20}|ZTEEQUGT[A-Z0-9]{4,14})/i);
    if(m) dsn=m[1];
  }
  // OCR pecah spasi: "ZTEE QUGT6G11911"
  if(!dsn){
    const m=t.toUpperCase().replace(/\s+/g,' ').match(/\b((?:ZTEE|ZTE0)\s*[A-Z0-9]{6,20})\b/);
    if(m) dsn=m[1].replace(/\s+/g,'');
  }
  // Barcode EN: EQUGT6G11911 → ZTEEQUGT6G11911
  if(!dsn){
    const m=t.toUpperCase().match(/\b(EQUGT[A-Z0-9]{4,14})\b/);
    if(m) dsn='ZTE'+m[1];
  }
  dsn=cleanSn(dsn);
  if(dsn && isPlausibleDsn(dsn)) found.dsn=dsn;

  if(/\bNOKIA\b/i.test(t) || /^ALCL/i.test(found.gsn||'')) found.ont='Nokia';
  else if(/\bZTE\b/i.test(t) || /^ZTEG/i.test(found.gsn||'') || /^ZTEE/i.test(found.dsn||'')) found.ont='ZTE';
  else if(/\bHUAWEI\b/i.test(t) || /^HWTC/i.test(found.gsn||'')) found.ont='Huawei';
  if(!found.ont && found.gsn) found.ont=detectOntVendor(found.gsn);
  if(!found.ont && /^3TN/i.test(found.dsn||'')) found.ont='Nokia';

  let user=grab(/User(?:name)?\s*[:.\-]?\s*(userAdmin|[A-Za-z][A-Za-z0-9._\-]{2,31})/i);
  if(user && /^(NOKIA|ZTE|ONT|MAC|Model|Admin|Assembled|Input|Product|Date|SSID|WiFi|S\/?N|GPON)/i.test(user)) user='';
  if(user) found.username=user;

  // WiFi Key + Password
  let wkey=extractWifiKeyFromText(t);
  if(wkey) found.wifiKey=wkey;

  let pass=grab(/(?:Password|Pass\s*word)\s*[:.\-]?\s*([A-Za-z0-9!@#$%&*?_+\-=.]{3,40})/i);
  if(pass && !/^(ssid|ALHN|ZTEG|user)/i.test(pass)) found.password=pass;

  // ZTE: WiFi Key = GPON SN
  if(found.gsn && /^ZTEG/i.test(found.gsn)){
    if(!found.wifiKey || /^(asianet|unifiber|admin)$/i.test(found.wifiKey)) found.wifiKey=found.gsn;
  }
  // Nokia: Password di label = WiFi Key (selalu sama)
  if(!found.wifiKey && found.password && !/^(asianet|unifiber|admin)$/i.test(found.password)){
    if(/[!@#$%&*?_0-9\-]/.test(found.password) || found.password.length>=6){
      found.wifiKey=found.password;
    }
  }
  // Nokia ALCL: ekstrak ulang jika masih kosong
  if(!found.wifiKey && (/^ALCL/i.test(found.gsn||'') || found.ont==='Nokia')){
    const again=extractWifiKeyFromText(t);
    if(again) found.wifiKey=again;
  }

  return found;
}

function applyOntScanResults(values, ocrFound){
  const found={mac:'',gsn:'',dsn:'',ont:'',username:'',password:'',wifiKey:''};

  const tokens=[];
  for(const raw of (values||[])){
    for(const piece of expandBarcodePayload(raw)) tokens.push(piece);
    const pnRaw=extractNokiaPn(raw);
    if(pnRaw) tokens.push(pnRaw);
  }
  for(const tok of tokens){
    const c=classifyOntBarcode(tok);
    if(!c) continue;
    if(c.type==='mac' && !found.mac) found.mac=c.value;
    else if(c.type==='gsn' && !found.gsn) found.gsn=c.value;
    else if(c.type==='dsn' && !found.dsn){ const d=normalizeDsnCandidate(c.value); if(isPlausibleDsn(d)) found.dsn=d; }
  }

  if(ocrFound){
    if(!found.mac && ocrFound.mac && isPlausibleMac(ocrFound.mac)) found.mac=ocrFound.mac;
    if(!found.gsn && ocrFound.gsn && isPlausibleGsn(ocrFound.gsn)) found.gsn=ocrFound.gsn;
    if(!found.dsn && ocrFound.dsn && isPlausibleDsn(ocrFound.dsn)) found.dsn=ocrFound.dsn;
    if(ocrFound.ont) found.ont=ocrFound.ont;
    if(ocrFound.username) found.username=ocrFound.username;
    if(ocrFound.password) found.password=ocrFound.password;
    if(ocrFound.wifiKey) found.wifiKey=ocrFound.wifiKey;
  }

  // DSN dari semua barcode mentah (Nokia 3TN + ZTE ZTEE/EQUGT)
  if(!found.dsn){
    for(const raw of (values||[])){
      const d=extractDsnFromBarcodeRaw(raw);
      if(d){ found.dsn=d; break; }
    }
  }
  if(!found.dsn && ocrFound?.dsn){
    const d=normalizeDsnCandidate(ocrFound.dsn);
    if(isPlausibleDsn(d)) found.dsn=d;
  }

  if(!found.ont){
    found.ont=detectOntVendor(found.gsn)||'';
    if(!found.ont && /^3TN/i.test(found.dsn||'')) found.ont='Nokia';
    if(!found.ont && isPlausibleDsn(found.dsn) && /^ZTE/i.test(found.dsn||'')) found.ont='ZTE';
  }

  if(found.gsn && !isPlausibleGsn(found.gsn)) found.gsn='';
  if(found.dsn && !isPlausibleDsn(found.dsn)) found.dsn='';
  if(found.mac && !isPlausibleMac(found.mac)) found.mac='';

  if(found.ont) reportFormSet('hfOnt',found.ont);
  if(found.gsn) reportFormSet('hfGsn',found.gsn);
  if(found.mac) reportFormSet('hfMac',found.mac);
  if(found.dsn) reportFormSet('hfDsn',found.dsn);
  // username form manual — tidak diisi dari scan label
  // password form manual — tidak diisi dari scan label
  if(found.wifiKey) reportFormSet('hfWifiKey',found.wifiKey);

  return found;
}

async function detectBarcodesFromImage(fileOrBlob){
  if(typeof BarcodeDetector==='undefined') return [];
  const formats=['code_128','code_39','code_93','codabar','ean_13','ean_8','upc_a','upc_e','qr_code','data_matrix','itf'];
  let detector;
  try{ detector=new BarcodeDetector({formats}); }catch(e){
    try{ detector=new BarcodeDetector(); }catch(e2){ return []; }
  }

  const all=new Set();
  const addList=(arr)=>{ for(const v of (arr||[])){ const s=String(v||'').trim(); if(s) all.add(s); } };

  // Trio MAC + G-SN + D-SN dari barcode (pakai parser yang sama)
  function coreFlags(){
    let mac=false, gsn=false, dsn=false;
    for(const raw of all){
      const c=classifyOntBarcode(raw);
      if(!c){
        // fallback DSN mentah (EQUGT dll)
        if(extractDsnFromBarcodeRaw(raw)) dsn=true;
        continue;
      }
      if(c.type==='mac') mac=true;
      else if(c.type==='gsn') gsn=true;
      else if(c.type==='dsn') dsn=true;
    }
    return {mac, gsn, dsn};
  }
  function hasCore(){
    const f=coreFlags();
    return f.mac && f.gsn && f.dsn;
  }
  function missingDsn(){
    return !coreFlags().dsn;
  }

  async function detectOnBitmap(bitmap){
    try{
      const codes=await detector.detect(bitmap);
      return (codes||[]).map(c=>String(c.rawValue||'').trim()).filter(Boolean);
    }catch(e){ return []; }
  }

  async function detectOnCanvas(canvas){
    try{
      const bmp=await createImageBitmap(canvas);
      try{ return await detectOnBitmap(bmp); }
      finally{ try{ bmp.close?.(); }catch(e){} }
    }catch(e){ return []; }
  }

  function makeCrop(bmp, x0, y0, x1, y1, scale, binary){
    const w=bmp.width, h=bmp.height;
    const sx=Math.floor(w*x0), sy=Math.floor(h*y0);
    const sw=Math.max(20,Math.floor(w*(x1-x0)));
    const sh=Math.max(20,Math.floor(h*(y1-y0)));
    const c=document.createElement('canvas');
    c.width=Math.min(1600, Math.round(sw*scale));
    c.height=Math.min(1600, Math.round(sh*scale));
    const ctx=c.getContext('2d');
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(bmp,sx,sy,sw,sh,0,0,c.width,c.height);
    if(binary){
      try{
        const img=ctx.getImageData(0,0,c.width,c.height);
        const d=img.data;
        for(let i=0;i<d.length;i+=4){
          const g=0.3*d[i]+0.59*d[i+1]+0.11*d[i+2];
          const v=g<130?0:255;
          d[i]=d[i+1]=d[i+2]=v;
        }
        ctx.putImageData(img,0,0);
      }catch(e){}
    }
    return c;
  }

  try{
    const bmp0=await createImageBitmap(fileOrBlob);
    const w=bmp0.width, h=bmp0.height;

    // 1) full (paling cepat & sering cukup)
    addList(await detectOnBitmap(bmp0));
    if(hasCore()){ try{ bmp0.close?.(); }catch(e){} console.log('Barcode fast-exit full:', [...all]); return [...all]; }

    // 2) upscale 1.6x (bukan 2.2x — lebih cepat di HP)
    try{
      const c=document.createElement('canvas');
      const sc=w>1400?1.3:1.6;
      c.width=Math.round(w*sc); c.height=Math.round(h*sc);
      const ctx=c.getContext('2d');
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(bmp0,0,0,c.width,c.height);
      addList(await detectOnCanvas(c));
    }catch(e){}
    if(hasCore()){ try{ bmp0.close?.(); }catch(e){} console.log('Barcode fast-exit upscale:', [...all]); return [...all]; }

    // 3) Crop fokusus barcode (G-SN/MAC/D-SN)
    // ZTE: D-SN sering barcode sendiri di kanan (kadang bawah), payload EQUGT... / ZTEE...
    // Nokia: P/N 3TN di kanan atas
    const crops=[
      [0.30,0.00,1.00,0.45], // kanan atas
      [0.30,0.15,1.00,0.70], // kanan tengah
      [0.30,0.35,1.00,0.95], // kanan bawah (D-SN ZTE sering di sini)
      [0.00,0.00,1.00,0.40], // strip atas
      [0.40,0.20,0.98,0.55], // fokus barcode tengah-kanan
      [0.45,0.40,0.98,0.85], // fokus barcode bawah-kanan
    ];
    for(const [x0,y0,x1,y1] of crops){
      try{
        addList(await detectOnCanvas(makeCrop(bmp0,x0,y0,x1,y1,2.4,false)));
        if(hasCore()) break;
        addList(await detectOnCanvas(makeCrop(bmp0,x0,y0,x1,y1,2.4,true)));
        if(hasCore()) break;
      }catch(e){}
    }
    // 4) Kalau DSN masih kosong: pass ekstra scale lebih besar khusus kanan
    if(missingDsn()){
      const dsnCrops=[
        [0.35,0.25,1.00,0.90],
        [0.50,0.30,1.00,0.80],
        [0.20,0.40,1.00,1.00],
      ];
      for(const [x0,y0,x1,y1] of dsnCrops){
        try{
          addList(await detectOnCanvas(makeCrop(bmp0,x0,y0,x1,y1,3.0,false)));
          addList(await detectOnCanvas(makeCrop(bmp0,x0,y0,x1,y1,3.0,true)));
          if(!missingDsn()) break;
        }catch(e){}
      }
    }

    try{ bmp0.close?.(); }catch(e){}
  }catch(e){
    console.warn('detectBarcodesFromImage',e);
  }

  const vals=[...all];
  console.log('Barcode multi-pass:', vals);
  return vals;
}

async function ocrOntLabelImage(fileOrBlob, opts){
  if(typeof Tesseract==='undefined'){
    console.warn('Tesseract tidak tersedia');
    return null;
  }
  opts=opts||{};
  // mode: 'full' | 'wifi' | 'dsn' | 'auto'
  const mode=opts.mode||'auto';
  const preferLeft=!!opts.preferLeft;   // Nokia
  const preferRight=!!opts.preferRight; // ZTE

  async function ocrCanvas(canvas){
    try{
      // Batasi resolusi OCR — Tesseract lambat di HP bila canvas terlalu besar
      const maxSide=1200;
      let srcCanvas=canvas;
      if(canvas.width>maxSide || canvas.height>maxSide){
        const sc=maxSide/Math.max(canvas.width,canvas.height);
        const c2=document.createElement('canvas');
        c2.width=Math.max(1,Math.round(canvas.width*sc));
        c2.height=Math.max(1,Math.round(canvas.height*sc));
        const ctx2=c2.getContext('2d');
        ctx2.imageSmoothingEnabled=true;
        ctx2.drawImage(canvas,0,0,c2.width,c2.height);
        srcCanvas=c2;
      }
      const result=await Tesseract.recognize(srcCanvas, 'eng', {
        logger:()=>{},
        tessedit_pageseg_mode: 6
      });
      return result?.data?.text||'';
    }catch(e){
      console.warn('OCR canvas',e);
      return '';
    }
  }
  function prepCanvas(bmp, sx, sy, sw, sh, scale){
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(sw*scale));
    canvas.height=Math.max(1,Math.round(sh*scale));
    const ctx=canvas.getContext('2d');
    ctx.imageSmoothingEnabled=true;
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    try{
      const img=ctx.getImageData(0,0,canvas.width,canvas.height);
      const d=img.data;
      for(let i=0;i<d.length;i+=4){
        const g=0.3*d[i]+0.59*d[i+1]+0.11*d[i+2];
        const v=g<160?Math.max(0,g-40):255;
        d[i]=d[i+1]=d[i+2]=v;
      }
      ctx.putImageData(img,0,0);
    }catch(e){}
    return canvas;
  }
  try{
    const bmp=await createImageBitmap(fileOrBlob);
    const w=bmp.width, h=bmp.height;
    // scale lebih rendah = jauh lebih cepat di HP
    const scale=w<900?2.4:(w<1400?1.8:1.4);

    // Pilih crop sesuai kebutuhan (jangan selalu 8 crop)
    let cropDefs=[];
    if(mode==='wifi' || preferLeft){
      // Nokia: Password/WiFi Key di kiri stiker
      cropDefs=[
        [0, Math.floor(h*0.12), Math.floor(w*0.58), Math.floor(h*0.55), scale+0.4],
        [0, Math.floor(h*0.20), Math.floor(w*0.50), Math.floor(h*0.42), scale+0.6],
      ];
    }else if(mode==='dsn' || preferRight){
      // ZTE: D-SN / GPON di kanan
      cropDefs=[
        [Math.floor(w*0.35), Math.floor(h*0.08), Math.floor(w*0.65), Math.floor(h*0.60), scale+0.3],
        [Math.floor(w*0.40), Math.floor(h*0.15), Math.floor(w*0.58), Math.floor(h*0.50), scale+0.5],
      ];
    }else{
      // auto: full + 1 kiri + 1 kanan (cukup untuk mayoritas)
      cropDefs=[
        [0, 0, w, h, scale],
        [0, Math.floor(h*0.12), Math.floor(w*0.55), Math.floor(h*0.55), scale+0.3],
        [Math.floor(w*0.38), Math.floor(h*0.08), Math.floor(w*0.62), Math.floor(h*0.58), scale+0.3],
      ];
    }

    const canvases=cropDefs.map(([sx,sy,sw,sh,sc])=>prepCanvas(bmp,sx,sy,sw,sh,sc));
    // Sequential di HP lebih stabil/hemat memori daripada 8 paralel
    const texts=[];
    for(const c of canvases){
      texts.push(await ocrCanvas(c));
    }
    try{ bmp.close?.(); }catch(e){}

    let text=texts.filter(Boolean).join('\n');
    text=text.replace(/3\s*T\s*N\s*([0-9A-Z\s]{6,20})/gi,(m,g)=>' 3TN'+String(g).replace(/\s+/g,'')+' ');
    text=text.replace(/\bF[il1]\s*Key\b/gi,'Fi Key');
    text=text.replace(/\bW[il1I]\s*[Ffp]\s*[il1I]?\s*Key\b/gi,'WiFi Key');
    text=text.replace(/\bW[il1]F[il1]\s*Key\b/gi,'WiFi Key');
    text=text.replace(/\bWi\s*Fi\s*Key\b/gi,'WiFi Key');
    text=text.replace(/\bWifi\s*Key\b/gi,'WiFi Key');
    text=text.replace(/\bPassw[o0]rd\b/gi,'Password');
    text=text.replace(/\bPass\s*word\b/gi,'Password');
    text=text.replace(/\bUsern[a4]me\b/gi,'Username');
    text=text.replace(/\bUser\s*name\b/gi,'Username');
    text=text.replace(/\bD\s*-?\s*SN\b/gi,'D-SN');
    text=text.replace(/\bGPON\s*S\s*N\b/gi,'GPON SN');
    text=text.replace(/([A-Za-z0-9])\s*-\s*([A-Za-z0-9])/g,'$1-$2');
    text=text.replace(/([A-Za-z0-9])\s*_\s*([A-Za-z0-9])/g,'$1_$2');
    console.log('ONT OCR merged:', text.slice(0,900));
    return text;
  }catch(e){
    console.warn('OCR label',e);
    return null;
  }
}

/** Ekstrak WiFi KeyocrCanvas(c));
    }
    try{ bmp.close?.(); }catch(e){}

    let text=texts.filter(Boolean).join('\n');
    text=text.replace(/3\s*T\s*N\s*([0-9A-Z\s]{6,20})/gi,(m,g)=>' 3TN'+String(g).replace(/\s+/g,'')+' ');
    text=text.replace(/\bF[il1]\s*Key\b/gi,'Fi Key');
    text=text.replace(/\bW[il1I]\s*[Ffp]\s*[il1I]?\s*Key\b/gi,'WiFi Key');
    text=text.replace(/\bW[il1]F[il1]\s*Key\b/gi,'WiFi Key');
    text=text.replace(/\bWi\s*Fi\s*Key\b/gi,'WiFi Key');
    text=text.replace(/\bWifi\s*Key\b/gi,'WiFi Key');
    text=text.replace(/\bPassw[o0]rd\b/gi,'Password');
    text=text.replace(/\bPass\s*word\b/gi,'Password');
    text=text.replace(/\bUsern[a4]me\b/gi,'Username');
    text=text.replace(/\bUser\s*name\b/gi,'Username');
    text=text.replace(/\bD\s*-?\s*SN\b/gi,'D-SN');
    text=text.replace(/\bGPON\s*S\s*N\b/gi,'GPON SN');
    text=text.replace(/([A-Za-z0-9])\s*-\s*([A-Za-z0-9])/g,'$1-$2');
    text=text.replace(/([A-Za-z0-9])\s*_\s*([A-Za-z0-9])/g,'$1_$2');
    console.log('ONT OCR merged:', text.slice(0,900));
    return text;
  }catch(e){
    console.warn('OCR label',e);
    return null;
  }
}

/** Ekstrak WiFi Key/** Ekstrak WiFi Key / Password dari teks OCR (Nokia + ZTE) */
function extractWifiKeyFromText(text){
  const t=String(text||'');
  if(!t) return '';
  const junk=/^(ssid|user|username|password|pass|ALHN|Asianet|admin|nokia|model|input|unifiber|wifi|key|mac|gpon|ont|assembled|china)$/i;
  const clean=(raw)=>{
    let v=String(raw||'').trim()
      .replace(/^[:=\-\s.|]+/,'')
      .replace(/[|,;:\s]+$/,'')
      .replace(/\s*-\s*/g,'-')
      .replace(/\s*_\s*/g,'_')
      .replace(/\s+/g,'');
    v=v.replace(/(SSID|ALHN|User|Pass|WiFi|MAC|GPON|ONT).*$/i,'');
    return v.trim();
  };
  const looksLikeKey=(v)=>{
    if(!v || v.length<4 || v.length>40) return false;
    if(junk.test(v)) return false;
    if(/^(ssid|ALHN|user|admin|asianet)/i.test(v)) return false;
    // ZTEG... boleh (ZTE WiFi Key = GPON SN)
    return /[0-9!@#$%&*?_\-]/.test(v) || (/[A-Za-z]/.test(v) && /\d/.test(v));
  };

  const wifiPatterns=[
    /(?:Wi\s*-?\s*Fi|WiFi|Wifi|Wfi|Wi\s*Fi|W[il1]F[il1])\s*Key\s*[:.\-=]?\s*([A-Za-z0-9!@#$%&*?_+\-=.]{4,48})/i,
    /(?:WiFi|Wifi|Wi\s*Fi)\s*Key\s*[:.\-=]?\s*([^\s\n]{4,48})/i,
    /WiFi\s*Key\s*[:.\-=]?\s*([A-Za-z0-9!@#$%&*?_+\-=.\s]{4,48})/i,
    /(?:^|\n)\s*(?:Fi\s*)?Key\s*[:.\-=]\s*([A-Za-z0-9!@#$%&*?_+\-=.]{4,40})/im,
  ];
  for(const re of wifiPatterns){
    const m=t.match(re);
    if(!m) continue;
    const v=clean(m[1]);
    if(looksLikeKey(v)) return v;
  }

  const passPatterns=[
    /Password\s*[:.\-=]?\s*([A-Za-z0-9!@#$%&*?_+\-=.]{4,48})/i,
    /Pass\s*word\s*[:.\-=]?\s*([A-Za-z0-9!@#$%&*?_+\-=.]{4,48})/i,
    /Password\s*[:.\-=]?\s*([^\s\n]{4,48})/i,
  ];
  for(const re of passPatterns){
    const m=t.match(re);
    if(!m) continue;
    const v=clean(m[1]);
    if(looksLikeKey(v) && !/^(asianet|unifiber|admin)$/i.test(v)) return v;
  }

  const lines=t.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  for(const line of lines){
    if(/wifi\s*key|wi\s*fi\s*key|^\s*(?:fi\s*)?key\s*[:.\-=]/i.test(line) || /password/i.test(line)){
      const m=line.match(/[:.\-=]\s*([A-Za-z0-9!@#$%&*?_+\-=.]{4,40})\s*$/i)
        || line.match(/(?:Key|Password)\s+([A-Za-z0-9!@#$%&*?_+\-=.]{4,40})\s*$/i);
      if(m){
        const v=clean(m[1]);
        if(looksLikeKey(v)) return v;
      }
    }
  }
  return '';
}

async function handleOntLabelScan(source){
  // source: 'camera' | 'gallery'
  const useCamera = source !== 'gallery';
  const status=document.getElementById('hfScanStatus');
  hfScanInProgress=true;
  const modal=document.getElementById('hfReportModal');
  if(modal) modal.style.display='flex';

  try{
    // Loop: ambil gambar → scan → kalau belum lengkap, tawarkan ambil ulang (sumber sama)
    while(true){
      if(status) status.textContent=useCamera?'📷 Buka kamera — foto label ONT...':'🖼️ Pilih foto label dari galeri...';
      const file=await pickImageFile({camera:useCamera});
      await new Promise(r=>setTimeout(r,120));
      if(modal) modal.style.display='flex';
      if(!file){
        if(status) status.textContent='Scan dibatalkan.';
        return;
      }

      const found=await processOntLabelFile(file, status, modal);

      // Isi form
      if(found.ont) reportFormSet('hfOnt',found.ont);
      if(found.gsn) reportFormSet('hfGsn',found.gsn);
      if(found.mac) reportFormSet('hfMac',found.mac);
      if(found.dsn) reportFormSet('hfDsn',found.dsn);
      if(found.wifiKey) reportFormSet('hfWifiKey',found.wifiKey);
      // USERNAME & PASSWORD sengaja manual (buat setting SSID/password baru di ONT)
      hfLastOntScan=found;
      if(modal) modal.style.display='flex';

      const parts=[];
      if(found.ont) parts.push('ONT='+found.ont);
      if(found.gsn) parts.push('G-SN='+found.gsn);
      if(found.mac) parts.push('MAC='+found.mac);
      if(found.dsn) parts.push('DSN='+found.dsn);
      if(found.wifiKey) parts.push('WIFI KEY='+found.wifiKey);

      const complete=isOntScanComplete(found);
      if(complete){
        if(status) status.textContent='✓ Lengkap · '+parts.join(' · ');
        // Simpan foto HANYA dari kamera (galeri sudah ada di HP)
        if(useCamera){
          try{
            const saved=await saveOntPhotoToDevice(file, found);
            if(saved) swalToast('✓ Data lengkap · foto disimpan','success');
            else swalToast('✓ Data lengkap · '+parts.join(' · '),'success');
          }catch(e){
            console.warn('save photo',e);
            swalToast('✓ Data lengkap · '+parts.join(' · '),'success');
          }
        }else{
          swalToast('✓ Data lengkap · '+parts.join(' · '),'success');
        }
        return;
      }

      // Belum lengkap — JANGAN simpan foto
      const missing=[];
      if(!found.ont) missing.push('ONT');
      if(!found.gsn) missing.push('G-SN');
      if(!found.mac) missing.push('MAC');
      if(!found.dsn) missing.push('DSN');
      if(!found.wifiKey) missing.push('WIFI KEY');
      if(status) status.textContent=(parts.length?'◐ '+parts.join(' · ')+' · ':'')+'⚠️ Kurang: '+missing.join(', ');

      const again=await Swal.fire({
        title:'Scan belum lengkap',
        html:'<div style="text-align:left;font-size:13px;line-height:1.5">'+
          (parts.length?'<b>Terisi:</b> '+escapeHtml(parts.join(' · '))+'<br>':'')+
          '<b>Belum:</b> '+escapeHtml(missing.join(', '))+
          '<br><br>Foto lebih dekat & tajam ke label (barcode + teks). Foto <b>tidak</b> disimpan sampai data lengkap.</div>',
        icon:'warning',
        showCancelButton:true,
        confirmButtonText: useCamera ? '📷 Foto ulang' : '🖼️ Pilih ulang',
        cancelButtonText:'Pakai data ini',
        allowOutsideClick:false
      });
      if(modal) modal.style.display='flex';
      if(!again.isConfirmed){
        if(parts.length) swalToast(parts.join(' · ')+' (sebagian)','info');
        else swalToast('Scan tidak menemukan data valid','warning');
        return;
      }
      // lanjut loop → kamera lagi
    }
  }catch(e){
    console.error('scan label',e);
    if(status) status.textContent='⚠️ Gagal scan: '+(e.message||e);
  }finally{
    hfScanInProgress=false;
    if(modal) modal.style.display='flex';
  }
}

/** Field inti ONT dianggap lengkap */
function isOntScanComplete(f){
  if(!f) return false;
  // Minimal: ONT + G-SN + MAC + WIFI KEY (DSN sangat disarankan tapi Nokia/ZTE kadang sulit)
  // User minta "semua field" scan → ONT, G-SN, MAC, DSN, WIFI KEY
  return !!(f.ont && f.gsn && f.mac && f.dsn && f.wifiKey);
}

/** Proses 1 file: barcode + OCR kondisional → objek found */
async function processOntLabelFile(file, status, modal){
  if(status) status.textContent='⏳ Scan barcode...';
  const t0=performance.now();
  const values=await detectBarcodesFromImage(file);
  if(modal) modal.style.display='flex';
  console.log('ONT barcodes raw:', values, Math.round(performance.now()-t0)+'ms');

  ['hfOnt','hfGsn','hfMac','hfDsn','hfWifiKey'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  let found=applyOntScanResults(values||[], null);

  if(!found.gsn){
    for(const raw of (values||[])){
      const m=String(raw||'').toUpperCase().match(/(ZTEG[A-Z0-9]{6,14}|ALCL[A-Z0-9]{6,14})/);
      if(m && isPlausibleGsn(m[1])){ found.gsn=m[1]; break; }
    }
  }
  if(!found.dsn){
    for(const raw of (values||[])){
      const d=extractDsnFromBarcodeRaw(raw);
      if(d){ found.dsn=d; break; }
    }
  }
  if(!found.mac){
    for(const raw of (values||[])){
      const m=String(raw||'').toUpperCase().match(/\b([0-9A-F]{2}(?:[:\-][0-9A-F]{2}){5})\b/)
        || String(raw||'').toUpperCase().match(/(?:^|[^0-9A-F])([0-9A-F]{12})(?:[^0-9A-F]|$)/);
      if(m){
        const fm=formatMac(m[1]);
        if(isPlausibleMac(fm)){ found.mac=fm; break; }
      }
    }
  }
  if(!found.ont && (found.gsn||found.dsn)){
    found.ont=detectOntVendor(found.gsn)||detectOntVendor(found.dsn)||(/^3TN/i.test(found.dsn||'')?'Nokia':'');
  }
  if(found.gsn && /^ZTEG/i.test(found.gsn)){
    found.wifiKey=found.gsn;
    if(!found.ont) found.ont='ZTE';
  }
  if(/^ALCL/i.test(found.gsn||'') && !found.ont) found.ont='Nokia';

  // G-SN / MAC / D-SN = BARCODE ONLY (Nokia & ZTE)
  // OCR hanya untuk WiFi Key Nokia (teks di kiri label)
  const needWifi= (found.ont==='Nokia' || /^ALCL/i.test(found.gsn||'')) && !found.wifiKey;

  let ocrText=null;
  if(needWifi){
    if(status) status.textContent='⏳ OCR WiFi Key (Nokia)...';
    ocrText=await ocrOntLabelImage(file, {mode:'wifi', preferLeft:true});
  }else if(status){
    if(found.gsn && found.mac && found.dsn) status.textContent='✓ Barcode lengkap (G-SN/MAC/DSN)';
    else if(!found.dsn) status.textContent='⚠️ DSN belum dari barcode — foto lebih dekat ke barcode D-SN';
    else status.textContent='✓ Scan barcode selesai';
  }
  if(modal) modal.style.display='flex';

  if(ocrText){
    const ocrFound=parseOntLabelText(ocrText);
    // Jangan timpa G-SN/MAC/DSN dari barcode dengan OCR
    if(!found.wifiKey && ocrFound.wifiKey) found.wifiKey=ocrFound.wifiKey;
    if(!found.wifiKey && ocrFound.password && !/^(asianet|unifiber|admin)$/i.test(ocrFound.password)){
      if(/[!@#$%&*?_0-9\-]/.test(ocrFound.password) || ocrFound.password.length>=6) found.wifiKey=ocrFound.password;
    }
    if(!found.wifiKey){
      const again=extractWifiKeyFromText(ocrText);
      if(again) found.wifiKey=again;
    }
  }
  if(!found.wifiKey && ocrText) found.wifiKey=extractWifiKeyFromText(ocrText);
  if(found.gsn && /^ZTEG/i.test(found.gsn)){
    if(!found.wifiKey || /^(asianet|unifiber|admin)$/i.test(found.wifiKey)) found.wifiKey=found.gsn;
  }
  if(!found.wifiKey && found.password && !/^(asianet|unifiber|admin)$/i.test(found.password)){
    if(/[!@#$%&*?_0-9\-]/.test(found.password) || found.password.length>=6) found.wifiKey=found.password;
  }
  if(!found.wifiKey && ocrText && (found.ont==='Nokia' || /^ALCL/i.test(found.gsn||''))){
    const again=extractWifiKeyFromText(ocrText);
    if(again) found.wifiKey=again;
  }
  if(!found.ont && ((found.gsn && /^ZTEG/i.test(found.gsn)) || (found.dsn && /^ZTEE/i.test(found.dsn)))) found.ont='ZTE';
  if(!found.ont && ((found.gsn && /^ALCL/i.test(found.gsn)) || (found.dsn && /^3TN/i.test(found.dsn)))) found.ont='Nokia';
  if(!found.password && ocrText){
    const pm=String(ocrText).match(/Password\s*[:.\-]?\s*([A-Za-z0-9!@#$%&*?_+\-=.]{3,40})/i);
    if(pm && !/^(ssid|ALHN|ZTEG)/i.test(pm[1])) found.password=pm[1].trim();
  }
  if(!found.username && ocrText){
    const um=String(ocrText).match(/User(?:name)?\s*[:.\-]?\s*(unifiber|userAdmin|[A-Za-z][A-Za-z0-9._\-]{2,30})/i);
    if(um && !/^(NOKIA|ZTE|ONT|MAC)/i.test(um[1])) found.username=um[1].trim();
  }
  return found;
}

/** Simpan foto ke perangkat (Share → Galeri, atau Download) */
async function saveOntPhotoToDevice(file, found){
  if(!file) return false;
  const tag=(found && (found.gsn||found.mac||found.dsn))||'ONT';
  const safe=String(tag).replace(/[^A-Za-z0-9_-]/g,'').slice(0,24)||'ONT';
  const fname='HiFriend_'+safe+'_'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'')+'.jpg';

  let blob=file;
  if(!(blob instanceof Blob)) return false;
  // Pastikan tipe image
  if(!blob.type || !blob.type.startsWith('image/')){
    blob=new Blob([blob],{type:'image/jpeg'});
  }
  const shareFile=new File([blob], fname, {type:blob.type||'image/jpeg'});

  // 1) Web Share Level 2 — di HP biasanya bisa "Simpan ke Galeri" / Files
  try{
    if(navigator.share && navigator.canShare && navigator.canShare({files:[shareFile]})){
      await navigator.share({files:[shareFile], title:fname, text:'Foto label ONT '+safe});
      return true;
    }
  }catch(e){
    // user cancel share → anggap tidak jadi simpan
    if(e && (e.name==='AbortError' || /abort|cancel/i.test(String(e.message||'')))) return false;
  }

  // 2) Fallback: trigger download (Chrome Android biasanya ke folder Download / notifikasi)
  try{
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=fname;
    a.rel='noopener';
    a.style.display='none';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ try{ URL.revokeObjectURL(url); a.remove(); }catch(e){} }, 2000);
    return true;
  }catch(e){
    console.warn('download photo failed',e);
    return false;
  }
}

function ensureOntScanInput(){
  let input=document.getElementById('hfOntScanInput');
  if(!input){
    input=document.createElement('input');
    input.id='hfOntScanInput';
    input.type='file';
    input.accept='image/*';
    input.setAttribute('capture','environment'); // kamera belakang
    input.style.cssText='position:fixed;left:-9999px;top:0;opacity:0;width:1px;height:1px;pointer-events:none;';
    document.body.appendChild(input);
  }
  return input;
}

function pickImageFile(opts){
  opts=opts||{};
  return new Promise((resolve)=>{
    const input=ensureOntScanInput();
    // Kamera langsung (default untuk scan label)
    if(opts.camera!==false){
      input.setAttribute('capture','environment');
    }else{
      input.removeAttribute('capture');
    }
    input.accept='image/*';
    const onDone=(file)=>{
      input.onchange=null;
      input.oncancel=null;
      resolve(file||null);
    };
    input.value='';
    input.onchange=()=>onDone(input.files&&input.files[0]);
    input.oncancel=()=>onDone(null);
    input.click();
  });
}


async function fillTikorFromGps(fieldId, btnId){
  const btn=document.getElementById(btnId);
  const input=document.getElementById(fieldId);
  const modal=document.getElementById('hfReportModal');
  if(!input) return;
  if(!navigator.geolocation){ swalToast('Browser tidak mendukung GPS.','error'); return; }
  if(btn){ btn.disabled=true; btn.textContent='…'; }
  if(modal) modal.style.display='flex';
  try{
    const pos=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{
      enableHighAccuracy:true, timeout:20000, maximumAge:0
    }));
    if(modal) modal.style.display='flex';
    input.value=pos.coords.latitude.toFixed(6)+', '+pos.coords.longitude.toFixed(6);
    swalToast('Tikor diisi dari GPS (±'+Math.round(pos.coords.accuracy||0)+'m)','success');
  }catch(err){
    if(modal) modal.style.display='flex';
    if(err?.code===1) swalToast('Izinkan akses lokasi dulu.','warning');
    else swalToast('Gagal ambil GPS. Aktifkan lokasi lalu coba lagi.','warning');
  }finally{
    if(btn){ btn.disabled=false; btn.textContent='📍'; }
    if(modal) modal.style.display='flex';
  }
}

function closeReportModal(result){
  const modal=document.getElementById('hfReportModal');
  if(modal) modal.style.display='none';
  document.body.classList.remove('hfReportOpen');
  const resolve=hfReportModalResolve;
  hfReportModalResolve=null;
  if(resolve) resolve(result);
}

function collectReportFormData(row){
  const customerId=String(row.customerId||'').trim();
  const displayName=row.name||'Pelanggan';
  const techName=(currentProfile?.full_name||currentProfile?.username||currentUser?.email||'Teknisi');
  const team=extractTeamFromRaw(row.raw)||'BBB';
  const hariTgl=reportDateLabel(new Date());
  const rawLine=String(row.raw||'').trim();
  const gsn=reportFormVal('hfGsn');
  const precone=reportFormVal('hfPrecone');
  if(!gsn){ swalToast('G-SN wajib diisi.','warning'); return null; }
  if(!customerId || !/^\d{7,15}$/.test(customerId)){ swalToast('ID pelanggan tidak valid.','warning'); return null; }
  const ont=reportFormVal('hfOnt')||detectOntVendor(gsn)||detectOntVendor(reportFormVal('hfDsn'));
  const fields={
    hariTgl:reportFormVal('hfHariTgl')||hariTgl, team:reportFormVal('hfTeam')||team, teknisi:reportFormVal('hfTeknisi')||techName,
    rawLine:reportFormVal('hfRawLine')||rawLine, ont, gsn, mac:reportFormVal('hfMac'), dsn:reportFormVal('hfDsn'), wifiKey:reportFormVal('hfWifiKey'),
    tikorCst:reportFormVal('hfTikorCst'), tikorFat:reportFormVal('hfTikorFat'), fatId:reportFormVal('hfFatId'), port:reportFormVal('hfPort'),
    signalFat:reportFormVal('hfSigFat'), signalRx:reportFormVal('hfSigRx'), signalTx:reportFormVal('hfSigTx'),
    klem:reportFormVal('hfKlem'), ties:reportFormVal('hfTies'), marker:reportFormVal('hfMarker'), precone,
    indikator:reportFormVal('hfIndikator')||'ON', wifi24:reportFormVal('hfWifi24')||'ON', wifi5:reportFormVal('hfWifi5')||'ON',
    username:reportFormVal('hfUsername'), password:reportFormVal('hfPassword')
  };
  return {
    parsed:{id:customerId,name:displayName,date:fields.hariTgl,sn:gsn,precone:precone||'0',nominal:getTariff()},
    reportText:buildInstallReportText(fields),
    fields
  };
}

function ensureReportModalShell(){
  let modal=document.getElementById('hfReportModal');
  if(modal) return modal;
  modal=document.createElement('div');
  modal.id='hfReportModal';
  modal.className='hfReportModal';
  modal.style.display='none';
  modal.innerHTML=
    '<div class="hfReportBackdrop"></div>'+
    '<div class="hfReportSheet" role="dialog" aria-modal="true" aria-labelledby="hfReportTitle">'+
      '<div class="hfReportTop">'+
        '<h2 id="hfReportTitle">📋 Report Instalasi · On Progress</h2>'+
        '<button type="button" class="hfReportX" id="hfReportCloseBtn" aria-label="Tutup">✕</button>'+
      '</div>'+
      '<div class="hfReportBody" id="hfReportBody"></div>'+
      '<div class="hfReportFoot">'+
        '<button type="button" class="secondary hfReportCancel" id="hfReportCancelBtn">Batal</button>'+
        '<button type="button" class="primary hfReportSave" id="hfReportSaveBtn">💾 Simpan & Generate Report</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(modal);
  // Backdrop tidak menutup (hindari mis-tap)
  modal.querySelector('.hfReportBackdrop')?.addEventListener('click',(e)=>{ e.preventDefault(); e.stopPropagation(); });
  document.getElementById('hfReportCloseBtn')?.addEventListener('click',()=>closeReportModal(null));
  document.getElementById('hfReportCancelBtn')?.addEventListener('click',()=>closeReportModal(null));
  document.getElementById('hfReportSaveBtn')?.addEventListener('click',()=>{
    if(!hfReportFormRow){ closeReportModal(null); return; }
    const data=collectReportFormData(hfReportFormRow);
    if(!data) return;
    hfLastOntScan=null;
    closeReportModal(data);
  });
  return modal;
}

/** Modal form tetap di DOM — aman untuk kamera & GPS mobile */

function showReportCopyModal(reportText, opts){
  opts=opts||{};
  const showDone=!!opts.showDone;
  return new Promise((resolve)=>{
    let modal=document.getElementById('hfCopyReportModal');
    if(!modal){
      modal=document.createElement('div');
      modal.id='hfCopyReportModal';
      modal.className='hfReportModal';
      modal.innerHTML=
        '<div class="hfReportBackdrop" id="hfCopyBackdrop"></div>'+
        '<div class="hfReportSheet" role="dialog" aria-modal="true">'+
          '<div class="hfReportTop">'+
            '<h2 id="hfCopyTitle">📄 Report Instalasi Siap</h2>'+
            '<button type="button" class="hfReportX" id="hfCopyCloseX" aria-label="Tutup">✕</button>'+
          '</div>'+
          '<div class="hfReportBody">'+
            '<p class="hfRptScanHint" id="hfCopyHint" style="margin:0 0 8px">Salin teks di bawah, lalu kirim ke group/koordinator.</p>'+
            '<textarea id="hfReportOut" readonly rows="16" class="hfRptRaw" style="min-height:220px;width:100%;resize:vertical"></textarea>'+
          '</div>'+
          '<div class="hfReportFoot" id="hfCopyFoot">'+
            '<button type="button" class="secondary" id="hfCopyCloseBtn">Tutup</button>'+
            '<button type="button" class="primary" id="hfCopyBtn">📋 Salin Report</button>'+
          '</div>'+
        '</div>';
      document.body.appendChild(modal);
    }
    const ta=modal.querySelector('#hfReportOut');
    if(ta) ta.value=String(reportText||'');
    const title=modal.querySelector('#hfCopyTitle');
    const hint=modal.querySelector('#hfCopyHint');
    if(title) title.textContent=showDone?'📄 Report Siap · Tandai DONE':'📄 Report Instalasi Siap';
    if(hint) hint.textContent=showDone
      ? 'Salin report ke group/koordinator. Setelah instalasi benar-benar selesai, tekan Tandai DONE.'
      : 'Salin teks di bawah, lalu kirim ke group/koordinator.';

    // Tombol DONE (hanya saat alur Progress)
    let foot=modal.querySelector('#hfCopyFoot');
    let btnDone=modal.querySelector('#hfCopyDoneBtn');
    if(showDone){
      if(!btnDone && foot){
        btnDone=document.createElement('button');
        btnDone.type='button';
        btnDone.id='hfCopyDoneBtn';
        btnDone.className='primary';
        btnDone.style.background='#047857';
        btnDone.textContent='🏁 Tandai DONE';
        foot.appendChild(btnDone);
      }
      if(btnDone) btnDone.style.display='';
    }else if(btnDone){
      btnDone.style.display='none';
    }

    modal.style.display='flex';
    document.body.classList.add('hfReportOpen');

    const finish=(action)=>{
      modal.style.display='none';
      document.body.classList.remove('hfReportOpen');
      resolve(action||'close');
    };
    const copyNow=async()=>{
      const text=ta?ta.value:'';
      try{
        if(navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
        else { ta.select(); document.execCommand('copy'); }
        swalToast('Report disalin ke clipboard','success');
      }catch(e){
        try{ ta.select(); document.execCommand('copy'); swalToast('Report disalin','success'); }
        catch(e2){ swalToast('Gagal salin — select manual lalu copy','warning'); }
      }
    };

    const btnCopy=modal.querySelector('#hfCopyBtn');
    const btnClose=modal.querySelector('#hfCopyCloseBtn');
    const btnX=modal.querySelector('#hfCopyCloseX');
    const bd=modal.querySelector('#hfCopyBackdrop');
    btnCopy.onclick=(e)=>{ e.preventDefault(); copyNow(); };
    btnClose.onclick=(e)=>{ e.preventDefault(); finish('close'); };
    btnX.onclick=(e)=>{ e.preventDefault(); finish('close'); };
    if(bd) bd.onclick=(e)=>{ e.preventDefault(); e.stopPropagation(); };
    if(btnDone) btnDone.onclick=(e)=>{ e.preventDefault(); finish('done'); };

    setTimeout(()=>{ try{ ta?.focus(); ta?.select(); }catch(e){} }, 200);
  });
}

async function openDoneReportForm(row, prefill){
  hfReportFormRow=row;
  const customerId=String(row.customerId||'').trim();
  const displayName=row.name||'Pelanggan';
  const techName=(currentProfile?.full_name||currentProfile?.username||currentUser?.email||'Teknisi');
  const team=extractTeamFromRaw(row.raw)||'BBB';
  const hariTgl=reportDateLabel(new Date());
  const rawLine=String(row.raw||'').trim();
  const pf=prefill||hfLastOntScan||{};

  const field=(id,label,ph='',type='text',val='')=>
    '<div class="hfRptField"><label for="'+id+'">'+label+'</label>'+
    (type==='textarea'
      ?'<textarea id="'+id+'" rows="2" placeholder="'+escapeHtml(ph)+'">'+escapeHtml(val)+'</textarea>'
      :'<input id="'+id+'" type="'+type+'" placeholder="'+escapeHtml(ph)+'" value="'+escapeHtml(val)+'" autocomplete="off" inputmode="text">')+
    '</div>';
  const tikorField=(id,label,btnId)=>
    '<div class="hfRptPinRow">'+
      '<div class="hfRptField"><label for="'+id+'">'+label+'</label>'+
      '<input id="'+id+'" type="text" placeholder="-6.xxxx, 107.xxxx" value="" autocomplete="off" inputmode="decimal"></div>'+
      '<button type="button" class="hfRptPinBtn" id="'+btnId+'" title="Ambil koordinat GPS saat ini">📍</button>'+
    '</div>';

  const bodyHtml=
    '<div class="hfRptWrap">'+
      '<div class="hfRptHead"><b>'+escapeHtml(displayName)+'</b>'+(customerId?' · ID <b>'+escapeHtml(customerId)+'</b>':'')+'</div>'+
      '<div class="hfRptGrid2">'+field('hfHariTgl','Hari/Tgl','','text',hariTgl)+field('hfTeam','Team','BBB','text',team)+'</div>'+
      field('hfTeknisi','Teknisi','','text',techName)+
      '<div class="hfRptField"><label>Data WO (otomatis dari Generate)</label><textarea id="hfRawLine" rows="3" readonly class="hfRptRaw">'+escapeHtml(rawLine||'(Data baris tidak tersedia)')+'</textarea></div>'+
      '<div class="hfRptSection">ONT / Perangkat</div>'+
      '<div class="hfRptScanRow">'+
        '<button type="button" class="hfRptScanBtn" id="hfScanCameraBtn">📷 Kamera</button>'+
        '<button type="button" class="hfRptScanBtn hfRptScanBtnAlt" id="hfScanGalleryBtn">🖼️ Galeri</button>'+
      '</div>'+
      '<div class="hfRptScanHint">Kamera atau galeri · ulang jika belum lengkap · simpan foto hanya dari kamera (jika data lengkap).</div>'+
      '<div class="hfRptScanStatus" id="hfScanStatus"></div>'+
      '<div class="hfRptGrid2">'+
        field('hfOnt','ONT','ZTE / Nokia / Huawei','text',pf.ont||'')+
        field('hfGsn','G-SN','GPON SN · ZTEG...','text',pf.gsn||'')+
        field('hfMac','MAC','D8-31-39-...','text',pf.mac||'')+
        field('hfDsn','DSN','D-SN / ONT P/N','text',pf.dsn||'')+
        field('hfWifiKey','WIFI KEY','dari label ONT','text',pf.wifiKey||'')+
      '</div>'+
      '<div class="hfRptSection">Lokasi & FAT</div>'+
      '<div class="hfRptGrid2">'+
        tikorField('hfTikorCst','TIKOR CST','hfPinCst')+
        tikorField('hfTikorFat','TIKOR FAT','hfPinFat')+
        field('hfFatId','FAT ID','')+field('hfPort','PORT','')+
      '</div>'+
      '<div class="hfRptScanHint">Tekan 📍 untuk isi Tikor dari GPS — form tidak tertutup.</div>'+
      '<div class="hfRptSection">Hasil Signal (dBm)</div>'+
      '<div class="hfRptGrid3">'+field('hfSigFat','SIGNAL FAT','contoh: -18')+field('hfSigRx','SIGNAL RX','contoh: -20')+field('hfSigTx','SIGNAL TX','contoh: 2.1')+'</div>'+
      '<div class="hfRptSection">Material</div>'+
      '<div class="hfRptGrid2">'+field('hfKlem','KLEM','')+field('hfTies','TIES','')+field('hfMarker','MARKER','')+field('hfPrecone','PRECONE','panjang kabel meter')+'</div>'+
      '<div class="hfRptSection">Indikator & Akun</div>'+
      '<div class="hfRptGrid3">'+field('hfIndikator','INDIKATOR','','text','ON')+field('hfWifi24','WIFI 2,4','','text','ON')+field('hfWifi5','WIFI 5','','text','ON')+'</div>'+
      '<div class="hfRptGrid2">'+field('hfUsername','USERNAME','SSID / user baru')+field('hfPassword','PASSWORD','password baru (manual)')+'</div>'+
    '</div>';

  const modal=ensureReportModalShell();
  const titleEl=document.getElementById('hfReportTitle');
  if(titleEl) titleEl.textContent='📋 Report Instalasi · On Progress';
  const body=document.getElementById('hfReportBody');
  if(body) body.innerHTML=bodyHtml;

  // Bind tombol di body (setiap buka form)
  document.getElementById('hfScanCameraBtn')?.addEventListener('click',(ev)=>{
    ev.preventDefault();
    ev.stopPropagation();
    handleOntLabelScan('camera');
  });
  document.getElementById('hfScanGalleryBtn')?.addEventListener('click',(ev)=>{
    ev.preventDefault();
    ev.stopPropagation();
    handleOntLabelScan('gallery');
  });
  document.getElementById('hfPinCst')?.addEventListener('click',(ev)=>{
    ev.preventDefault();
    ev.stopPropagation();
    fillTikorFromGps('hfTikorCst','hfPinCst');
  });
  document.getElementById('hfPinFat')?.addEventListener('click',(ev)=>{
    ev.preventDefault();
    ev.stopPropagation();
    fillTikorFromGps('hfTikorFat','hfPinFat');
  });
  document.getElementById('hfGsn')?.addEventListener('change',()=>{
    const v=detectOntVendor(document.getElementById('hfGsn')?.value||'');
    if(v){ const ont=document.getElementById('hfOnt'); if(ont && !ont.value) ont.value=v; }
  });
  if(pf.gsn||pf.mac||pf.dsn){
    const st=document.getElementById('hfScanStatus');
    if(st) st.textContent='✓ Data scan sebelumnya dimuat';
  }

  document.body.classList.add('hfReportOpen');
  modal.style.display='flex';
  // Jaga modal tetap di atas setelah resume dari kamera
  const keepOpen=()=>{ if(document.body.classList.contains('hfReportOpen') && modal) modal.style.display='flex'; };
  document.addEventListener('visibilitychange', keepOpen);
  window.addEventListener('focus', keepOpen);
  setTimeout(()=>document.getElementById('hfGsn')?.focus(),120);

  return await new Promise((resolve)=>{
    hfReportModalResolve=(result)=>{
      document.removeEventListener('visibilitychange', keepOpen);
      window.removeEventListener('focus', keepOpen);
      resolve(result);
    };
  });
}

async function mappingSetStatus(key,value){
  const st=mappingStatusMap();
  const prev=mappingNormalizeStatus(st[key]);
  const row=hfMappingRows.find(x=>x.key===key);
  if(!row){mappingRender();return;}

  if(value==='replied'){
    const result=await Swal.fire({
      title:'📍 Link Google Maps',
      html:'<div style="text-align:left;font-size:12px;color:#64748b;margin-bottom:8px">Masukkan link Google Maps untuk <b>'+escapeHtml(row.name||'Pelanggan')+'</b>. Tombol Maps akan membuka link ini langsung.</div>',
      input:'url', inputLabel:'Link Google Maps', inputPlaceholder:'https://maps.app.goo.gl/...',
      inputValue:row.mapsUrl||'', showCancelButton:true, confirmButtonText:'Simpan Link & Status', cancelButtonText:'Batal',
      allowOutsideClick:false, inputValidator:(value)=>{
        const raw=String(value||'').trim(); if(!raw)return 'Masukkan link Google Maps dulu.';
        try{const u=new URL(raw);if(u.protocol!=='https:'||!(/(^|\.)maps\.app\.goo\.gl$/i.test(u.hostname)||/(^|\.)google\.[a-z.]+$/i.test(u.hostname)||/(^|\.)google\.com$/i.test(u.hostname)||/(^|\.)maps\.googleapis\.com$/i.test(u.hostname)))return 'Gunakan link HTTPS Google Maps yang valid.';}catch(e){return 'Format link tidak valid.';}
        return undefined;
      }
    });
    if(!result.isConfirmed){mappingRender();return;}
    const mapsUrl=String(result.value||'').trim();
    try{await mappingUpdateCloudStatus(key,'replied',{maps_url:mapsUrl});
    row.mapsUrl=mapsUrl; row.geo=null; row.roadDistanceKm=null; row.roadPath=null;
    try{ await resolveRowGeoFromMapsUrl(row,{force:true}); }catch(e){}
    try{ if(hfMappingLocation) await mappingRoadDistancesForRows([row]); }catch(e){}}
    catch(e){console.error('Update link Maps/status gagal',e);swalToast('Gagal menyimpan link/status: '+(e.message||e),'error');mappingRender();return;}
    mappingRender(); return;
  }

  // === ON PROGRESS: isi report dulu, status progress, tombol DONE di modal report ===
  if(value==='progress'){
    const formResult=await openDoneReportForm(row, row._reportFormResult?.fields);
    if(!formResult){ mappingRender(); return; }
    row._reportFormResult=formResult;
    try{ await mappingUpdateCloudStatus(key,'progress'); }
    catch(e){ console.error('Update status progress gagal',e); swalToast('Gagal menyimpan status: '+(e.message||e),'error'); }
    mappingRender();
    const action=await showReportCopyModal(formResult.reportText,{showDone:true});
    if(action==='done'){
      await finalizeMappingDone(key, row, formResult);
    }else{
      swalToast('Status: On Progress · report tersimpan di sesi ini','info');
    }
    return;
  }

  // Status lain (pending, cancel, reschedule, …) — tanpa form
  if(value!=='done'){
    try{ await mappingUpdateCloudStatus(key,value); }catch(e){ console.error('Update status Generated WO gagal',e); swalToast('Gagal menyimpan status: '+(e.message||e),'error'); }
    mappingRender();
    return;
  }

  // === DONE dari dropdown: paste report (yang sudah ada) → simpan rekap ===
  if(prev==='done'){ mappingRender(); return; }

  let formResult=row._reportFormResult||null;
  // Modal paste: bisa tempel report lama / yang sudah ditulis di luar app
  const pasted=await showPasteReportModal(row, formResult?.reportText||'');
  if(!pasted){ mappingRender(); return; } // batal
  formResult=parseReportTextToFormResult(pasted, row);
  if(!formResult){ mappingRender(); return; }
  row._reportFormResult=formResult;
  await finalizeMappingDone(key, row, formResult);
}

/** Parse teks report instalasi → formResult untuk rekap WO */
function parseReportTextToFormResult(text, row){
  const t=String(text||'').trim();
  if(!t){ swalToast('Tempel teks report dulu','warning'); return null; }
  const grab=(re)=>{
    const m=t.match(re);
    return m?String(m[1]||'').trim():'';
  };
  const customerId=String(row.customerId||row.id||'').trim();
  if(!customerId || !/^\d{7,15}$/.test(customerId)){
    swalToast('ID pelanggan tidak valid di mapping','warning');
    return null;
  }
  const gsn=grab(/G[\-\s]?SN\s*[:.]?\s*([A-Za-z0-9]{6,24})/i)
    || grab(/GPON\s*SN\s*[:.]?\s*([A-Za-z0-9]{6,24})/i)
    || grab(/\b((?:ALCL|ZTEG|HWTC|FHTT)[A-Z0-9]{6,18})\b/i)
    || '';
  const precone=grab(/PRECONE\s*[:.]?\s*([0-9]+(?:[.,][0-9]+)?)/i)
    || grab(/panjang\s*kabel\s*[:.]?\s*([0-9]+(?:[.,][0-9]+)?)/i)
    || '0';
  const hariTgl=grab(/Hari\s*\/?\s*Tgl\s*[:.]?\s*(.+)/i) || reportDateLabel(new Date());
  const name=row.name||'Pelanggan';
  const mac=grab(/MAC\s*[:.]?\s*([0-9A-Fa-f:.-]{12,17})/i)||'';
  const dsn=grab(/D[\-\s]?SN\s*[:.]?\s*([A-Za-z0-9]{6,28})/i)||'';
  return {
    parsed:{
      id:customerId,
      name,
      date:hariTgl,
      sn:String(gsn||'').trim(),
      precone:String(precone||'0').replace(',','.'),
      nominal:getTariff()
    },
    reportText:t,
    fields:{gsn, mac, dsn, precone, hariTgl}
  };
}

/** Modal: tempel report yang sudah ada → Simpan ke rekap */
function showPasteReportModal(row, initialText){
  return new Promise((resolve)=>{
    let modal=document.getElementById('hfPasteReportModal');
    if(!modal){
      modal=document.createElement('div');
      modal.id='hfPasteReportModal';
      modal.className='hfReportModal';
      modal.innerHTML=
        '<div class="hfReportBackdrop" id="hfPasteBackdrop"></div>'+
        '<div class="hfReportSheet" role="dialog" aria-modal="true">'+
          '<div class="hfReportTop">'+
            '<h2>🏁 DONE · Paste Report</h2>'+
            '<button type="button" class="hfReportX" id="hfPasteCloseX" aria-label="Tutup">✕</button>'+
          '</div>'+
          '<div class="hfReportBody">'+
            '<p class="hfRptScanHint" style="margin:0 0 8px">Tempel report instalasi yang sudah ada (dari chat/notes). Lalu simpan ke rekap WO.</p>'+
            '<div class="hfRptHead" id="hfPasteHead"></div>'+
            '<textarea id="hfPasteReportIn" rows="16" class="hfRptRaw" style="min-height:220px;width:100%;resize:vertical" placeholder="Tempel report instalasi di sini..."></textarea>'+
          '</div>'+
          '<div class="hfReportFoot">'+
            '<button type="button" class="secondary" id="hfPasteCancelBtn">Batal</button>'+
            '<button type="button" class="primary" id="hfPasteSaveBtn" style="background:#047857">💾 Simpan ke Rekap</button>'+
          '</div>'+
        '</div>';
      document.body.appendChild(modal);
    }
    const head=modal.querySelector('#hfPasteHead');
    if(head){
      head.innerHTML='<b>'+escapeHtml(row.name||'Pelanggan')+'</b>'+
        (row.customerId?' · ID <b>'+escapeHtml(String(row.customerId))+'</b>':'');
    }
    const ta=modal.querySelector('#hfPasteReportIn');
    if(ta) ta.value=String(initialText||'');
    modal.style.display='flex';
    document.body.classList.add('hfReportOpen');

    const finish=(val)=>{
      modal.style.display='none';
      document.body.classList.remove('hfReportOpen');
      resolve(val);
    };
    modal.querySelector('#hfPasteCancelBtn').onclick=(e)=>{ e.preventDefault(); finish(null); };
    modal.querySelector('#hfPasteCloseX').onclick=(e)=>{ e.preventDefault(); finish(null); };
    const bd=modal.querySelector('#hfPasteBackdrop');
    if(bd) bd.onclick=(e)=>{ e.preventDefault(); e.stopPropagation(); };
    modal.querySelector('#hfPasteSaveBtn').onclick=(e)=>{
      e.preventDefault();
      const text=String(ta?.value||'').trim();
      if(!text){ swalToast('Tempel report dulu','warning'); return; }
      finish(text);
    };
    setTimeout(()=>{ try{ ta?.focus(); }catch(e){} }, 150);
  });
}

/** Simpan WO ke database + set status mapping DONE */
async function finalizeMappingDone(key, row, formResult){
  const customerId=String(row.customerId||'').trim();
  const displayName=row.name||'Pelanggan';
  const parsed=formResult?.parsed;
  if(!parsed){ swalToast('Data report belum ada','warning'); mappingRender(); return; }
  const finalId=String(parsed.id||customerId||'').trim();
  if(!finalId || !/^\d{7,15}$/.test(finalId)){
    swalToast('ID pelanggan tidak valid','warning');
    mappingRender();
    return;
  }
  try{
    const todayIso=localISO(new Date());
    const displayDate=parsed.date && toIsoDate(parsed.date) ? parsed.date : (parsed.date && /[A-Z]{3,}/.test(String(parsed.date)) ? parsed.date : fromIsoDate(todayIso));
    const payload=[{
      id:finalId, name:parsed.name||displayName, date:displayDate,
      precone:String(parsed.precone||'0'), nominal:Number(parsed.nominal)||getTariff(),
      sn:String(parsed.sn||'').trim(), status:'DONE'
    }];
    const sync=await syncRowsToSupabase(payload);
    if(sync.saved>0 || sync.skipped>0){
      await mappingUpdateCloudStatus(key,'done');
      try{ delete row._reportFormResult; }catch(e){}
      mappingRender();
      const meta=[finalId];
      if(payload[0].sn) meta.push('SN '+payload[0].sn);
      if(Number(payload[0].precone)>0) meta.push(payload[0].precone+'m');
      swalToast(sync.saved>0?('🏁 DONE · '+meta.join(' · ')):'WO '+finalId+' sudah ada di database',sync.saved>0?'success':'info');
      try{ await loadDatabase(); }catch(e){}
    }else{
      swalToast('Gagal menyimpan ke database','error');
      mappingRender();
    }
  }catch(e){
    console.error('Rekap DONE gagal',e);
    swalToast('Gagal simpan WO: '+(e.message||e),'error');
    mappingRender();
  }
}

async function mappingRun(raw){
  const rows=mappingParseWO(raw);
  if(!rows.length){
    mappingRender();
    return;
  }
  // Generate berikutnya DIGABUNGKAN dengan mapping yang sudah ada.
  const oldByKey=new Map(hfMappingRows.map(x=>[x.key,x]));
  const additions=rows.filter(x=>!oldByKey.has(x.key)).map(x=>({...x,createdAt:Date.now(),status:'pending'}));
  hfMappingRows=[...hfMappingRows,...additions];

  // Render lokal lebih dulu supaya mapping langsung terlihat meski cloud/geocoding lambat.
  mappingRender();

  // Sinkronisasi cloud jangan sampai menggagalkan render mapping.
  if(additions.length){
    try{
      await mappingSaveRows(additions);
    }catch(err){
      console.error('Generated WO cloud save gagal',err);
      swalToast('Mapping tampil, tetapi gagal tersimpan ke cloud: '+(err?.message||err),'warning');
    }
  }

  // Generate hanya menampilkan dan menyimpan WO. Pengurutan ulang hanya berjalan
  // jika pengguna menekan tombol 'Hitung Ulang Rute' secara manual.
  mappingRender();
  (async()=>{
    try{
      // Ambil koordinat dari maps_url dulu (cepat, tanpa internet geocode)
      for(const row of hfMappingRows){
        if(!row.geo){
          const c=parseMapsUrlCoords(row.mapsUrl)||parseMapsUrlCoords(row.raw);
          if(c) row.geo=c;
        }
      }
      const need=hfMappingRows.filter(x=>!x.geo && (x.address||x.kab||x.kec||x.raw)).slice(0,30);
      for(const row of need){ row.geo=await mappingGeocode(row); }
      mappingRender();
      try{ mappingRenderMap(hfMappingRows); }catch(e){}
      // Hitung jarak jalan otomatis jika posisi sudah ada
      if(hfMappingLocation && hfMappingRows.some(r=>r.geo)){
        mappingRoadDistancesForRows(hfMappingRows).then(async()=>{
          try{
            const open=hfMappingRows.filter(x=>!['done','cancel'].includes(mappingNormalizeStatus(x.status||'pending')));
            hfMappingRoutePath=await mappingBuildRouteGeometry(open);
          }catch(e){}
          mappingRender();
        }).catch(()=>{});
      }
    }catch(e){ console.warn('Background geocode mapping',e); }
  })();
}
function toggleMappingScreenshotMode(){
  const enabled=!document.body.classList.contains('hfScreenshotMode');
  document.body.classList.toggle('hfScreenshotMode',enabled);
  const btn=document.getElementById('mappingScreenshotBtn');
  if(btn){
    btn.textContent=enabled?'✖ Keluar Mode Screenshot':'📸 Mode Screenshot';
    btn.setAttribute('aria-pressed',enabled?'true':'false');
    btn.title=enabled?'Kembali ke tampilan normal':'Sederhanakan tampilan mapping untuk screenshot';
  }
  if(enabled){
    document.getElementById('mappingCard')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
}

function mappingRender(){
  const box=document.getElementById('mappingResults');
  const stats=document.getElementById('mappingStats');
  if(!box)return;
  const rows=[...hfMappingRows].sort((a,b)=>{
    if(Number.isFinite(a.routeOrder)&&Number.isFinite(b.routeOrder))return a.routeOrder-b.routeOrder;
    const sa=mappingSlotBucket(a),sb=mappingSlotBucket(b);
    if(sa!==sb) return sa-sb;
    const da=mappingRouteDistance(a),db=mappingRouteDistance(b);
    if(da!==db) return da-db;
    return (a.createdAt||0)-(b.createdAt||0);
  });
  const slotConflicts=mappingSlotConflictKeys(rows);
  if(!rows.length){
    box.innerHTML='<div class="mappingEmpty">🧭 Belum ada hasil mapping.<br><span>Generate WO untuk menampilkan rute di sini.</span></div>';
    if(stats)stats.innerHTML='';
    const wrap=document.getElementById('mappingMapWrap');
    if(wrap) wrap.style.display='none';
    return;
  }

  const statusOpts=Array.isArray(globalThis.HF_STATUS_OPTS)?globalThis.HF_STATUS_OPTS:[
    {v:'pending',label:'Belum Respon',icon:'💬',cls:'st-pending'},
    {v:'replied',label:'Sudah Respon',icon:'✅',cls:'st-replied'},
    {v:'progress',label:'On Progress',icon:'🔄',cls:'st-progress'},
    {v:'reschedule',label:'Reschedule',icon:'📅',cls:'st-reschedule'},
    {v:'done',label:'DONE',icon:'🏁',cls:'st-done'},
    {v:'cancel',label:'Cancel',icon:'❌',cls:'st-cancel'}
  ];
  const st=mappingStatusMap();
  const counts={pending:0,belum_shareloc:0,replied:0,progress:0,reschedule:0,done:0,cancel:0};
  rows.forEach(x=>{const v=mappingNormalizeStatus(st[x.key]);if(counts[v]!==undefined)counts[v]++;});
  if(stats)stats.innerHTML=
    `<span class="ms-all">📦 ${rows.length}</span>`+
    `<span class="ms-pending">💬 ${counts.pending}</span>`+
    (counts.belum_shareloc?`<span class="ms-shareloc">📍 ${counts.belum_shareloc}</span>`:'')+
    `<span class="ms-replied">✅ ${counts.replied}</span>`+
    `<span class="ms-progress">🔄 ${counts.progress}</span>`+
    (counts.reschedule?`<span class="ms-reschedule">📅 ${counts.reschedule}</span>`:'')+
    `<span class="ms-done">🏁 ${counts.done}</span>`+
    (counts.cancel?`<span class="ms-cancel">❌ ${counts.cancel}</span>`:'');

  const frag=document.createDocumentFragment();
  rows.forEach((x,i)=>{
    const cur=mappingNormalizeStatus(st[x.key]);
    const opt=statusOpts.find(o=>o.v===cur)||statusOpts[0];
    const card=document.createElement('div');
    card.className='mappingItem st-'+cur;
    const main=document.createElement('div');
    main.className='mappingMain';
    const no=document.createElement('div');
    no.className='mappingNo'; no.textContent=String(i+1);
    const idEl=document.createElement('div');
    idEl.className='mappingId';
    idEl.textContent='ID PELANGGAN '+(/^\d{7,15}$/.test(String(x.customerId||''))?String(x.customerId):'-');
    const nameEl=document.createElement('div'); nameEl.className='mappingName'; nameEl.textContent=String(x.name||'Pelanggan');
    // Alamat/lokasi ringkas satu baris agar kartu mapping tetap pendek untuk screenshot.
    // Utamakan kelurahan jika data tersedia, lalu kecamatan, dan fallback ke alamat WO.
    const locality=String(x.address||x.kelurahan||x.kelurahanName||x.kec||x.kab||'').trim();
    let addressEl=null;
    if(locality){
      addressEl=document.createElement('div'); addressEl.className='mappingAddress';
      addressEl.textContent='📍 '+locality;
      addressEl.title=String(x.address||x.kelurahan||x.kelurahanName||x.kec||x.kab||locality);
    }
    const meta=document.createElement('div'); meta.className='mappingMeta';
    const distance=hfMappingLocation&&x.geo?` • ${mappingRouteDistance(x).toFixed(1)} km ${x.distanceMode==='road'?'🚗 via jalan':'(garis lurus)'} · dari posisi saya`:'';
    meta.textContent=String(x.slot||'Tanpa slot')+(x.slotNo?' • SLOT '+String(x.slotNo):'')+distance;
    if(slotConflicts.has(x.key)){const conflict=document.createElement('div');conflict.className='mappingConflict';conflict.textContent='⚠️ SLOT BENTROK — waktu tumpang tindih dengan WO lain';main.append(conflict);}
    main.append(idEl,nameEl);
    if(addressEl)main.append(addressEl);
    main.append(meta);
    const btns=document.createElement('div'); btns.className='mappingBtns';
    const wrap=document.createElement('div'); wrap.className='mapStatusWrap';
    const sel=document.createElement('select'); sel.className='mapStatusSelect '+(opt?.cls||'st-pending'); sel.setAttribute('aria-label','Status WO');
    statusOpts.forEach(o=>{const op=document.createElement('option');op.value=o.v;op.textContent=o.icon+' '+o.label;if(o.v===cur)op.selected=true;sel.appendChild(op);});
    sel.addEventListener('change',()=>mappingSetStatus(x.key,sel.value));
    wrap.appendChild(sel); btns.appendChild(wrap);
    if(x.mapsUrl||x.address){
      if(x.mapsUrl){
        const editLink=document.createElement('button'); editLink.type='button'; editLink.className='mapEditLink'; editLink.textContent='✏️';
        editLink.title='Edit link Google Maps'; editLink.setAttribute('aria-label','Edit link Google Maps untuk '+String(x.name||'pelanggan'));
        editLink.addEventListener('click',()=>mappingEditMapsLink(x.key)); btns.appendChild(editLink);
      }
      const navLink=document.createElement('a'); navLink.className='mapNav'; navLink.target='_blank'; navLink.rel='noopener';
      navLink.href=x.mapsUrl||('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(String(x.address)));
      navLink.textContent='🗺️ Maps'; navLink.title=x.mapsUrl?'Buka link Google Maps tersimpan':'Cari alamat di Google Maps'; btns.appendChild(navLink);
    }
    card.append(no,main,btns); frag.appendChild(card);
  });
  box.replaceChildren(frag);
  try{ mappingRenderMap(rows); }catch(e){ console.warn('Render peta mapping gagal',e); }
}

function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
async function mappingUseMyLocation(){
  const location=await getAccurateLocation();
  if(location){
    hfMappingLocation=location;
    for(const row of hfMappingRows){row.roadDistanceKm=null;row.distanceMode='straight';row.roadPath=null;}
    hfMappingRoutePath=[];
    try{localStorage.setItem('hifriend_mapping_start_v1',JSON.stringify(location));}catch(e){}
    mappingRender();
    swalToast('Posisi tersimpan · menghitung jarak jalan...','info');
    try{
      const need=hfMappingRows.filter(x=>!x.geo && (x.address||x.kab||x.kec||x.raw||x.mapsUrl));
      for(const row of need){ row.geo=await mappingGeocode(row); }
      await mappingRoadDistancesForRows(hfMappingRows);
      const open=hfMappingRows.filter(x=>!['done','cancel'].includes(mappingNormalizeStatus(x.status||'pending')));
      hfMappingRoutePath=await mappingBuildRouteGeometry(open);
      mappingRender();
      const n=hfMappingRows.filter(r=>r.distanceMode==='road').length;
      swalToast(n?`Jarak jalan siap · ${n} WO`:'Jarak jalan gagal dihitung — coba Hitung Ulang Rute','success');
    }catch(e){
      console.warn(e);
      swalToast('Posisi OK. Tekan Hitung Ulang Rute untuk jarak jalan.','warning');
    }
  }
}
async function mappingClear(){
  if(!supabaseClient || !currentUser?.id){
    hfMappingRows=[];hfMappingLocation=null;
    if(hfMapLayerGroup) try{hfMapLayerGroup.clearLayers();}catch(e){}
    mappingRender();return;
  }
  const {error}=await supabaseClient.from(HF_GENERATED_WO_TABLE).delete().eq('user_id',currentUser.id);
  if(error){
    console.error('Generated WO clear error',error);
    swalToast('Gagal membersihkan Generated WO: '+(error.message||error),'error');
    return;
  }
  hfMappingRows=[];hfMappingLocation=null;
  if(hfMapLayerGroup) try{hfMapLayerGroup.clearLayers();}catch(e){}
  try{localStorage.removeItem(HF_MAPPING_KEY);localStorage.removeItem(HF_MAPPING_STATUS_KEY);localStorage.removeItem('hifriend_mapping_start_v1');}catch(e){}
  const el=document.getElementById('mappingLocation');if(el)el.textContent='Posisi awal belum ditentukan.';
  mappingRender();
}

function clearAll(){
  // Bersihkan Generator Pesan SAJA.
  // Mapping adalah workspace terpisah dan TIDAK boleh ikut terhapus.
  const input=document.getElementById('input');
  const results=document.getElementById('results');
  const status=document.getElementById('status');
  if(input) input.value='';
  if(results) results.innerHTML='<div class="count">Belum ada hasil.</div>';
  if(status) status.textContent='';
}

function showTab(tab){
  if(currentProfile?.role==='admin'){
    const homePanel=document.getElementById('homePanel');
    const msgTab=document.getElementById('msgTab');
    const accountPanel=document.getElementById('accountPanel');
    const adminPanel=document.getElementById('adminPanel');
    if(homePanel)homePanel.style.display='none';
    if(msgTab)msgTab.style.display='none';
    if(accountPanel)accountPanel.style.display='none';
    if(adminPanel)adminPanel.style.display='block';
    return;
  }
  const home=document.getElementById('homePanel');
  const msg=document.getElementById('msgTab');
  const account=document.getElementById('accountPanel');
  const bh=document.getElementById('tabHome');
  const bm=document.getElementById('tabMsg');
  const ba=document.getElementById('tabAccount');
  if(tab==='report') tab='home';
  if(home)home.style.display=tab==='home'?'block':'none';
  if(msg)msg.style.display=tab==='msg'?'block':'none';
  if(account)account.style.display=tab==='account'?'block':'none';
  if(bh)bh.className=tab==='home'?'primary':'secondary';
  if(bm)bm.className=tab==='msg'?'primary':'secondary';
  if(ba)ba.className=tab==='account'?'primary':'secondary';
  if(tab==='home')loadDatabase();
  else updateUtangBadge();
}



async function downloadDatabaseExcel(){
  const status=document.getElementById('dbStatus');
  try{
    if(status)status.textContent='Menyiapkan laporan Excel...';
    const rows=await getAllWORows();
    if(!rows.length){if(status)status.textContent='Database masih kosong.';return;}
    buildExcelFromData(rows,'Rekap_WO_Database');
    if(status)status.textContent='Laporan Excel berhasil dibuat · '+rows.length.toLocaleString('id-ID')+' WO.';
  }catch(e){
    console.error('Export Excel gagal',e);
    if(status)status.textContent='Export gagal: '+(e?.message||e);
    swalNotice('Export gagal',e?.message||'Data belum berhasil diambil dari database.','error');
  }
}

function buildExcelFromData(inputRows,filePrefix){
  if(typeof XLSX==='undefined'){
    swalNotice('Library Excel belum siap','Pastikan internet aktif lalu coba lagi.','warning');
    return;
  }
  const rows=[...(inputRows||[])].sort((a,b)=>{
    const da=dateKey(a.date)||'9999-99-99',db=dateKey(b.date)||'9999-99-99';
    return da.localeCompare(db)||String(a.id||'').localeCompare(String(b.id||''),'id',{numeric:true});
  });
  if(!rows.length){swalNotice('Data kosong','Tidak ada WO untuk diekspor.','info');return;}
  const num=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:0;};
  const money=v=>Number(v)||getTariff();
  const total=rows.reduce((sum,r)=>sum+money(r.nominal),0);
  const meterTotal=rows.reduce((sum,r)=>sum+num(r.precone),0);
  const utangTotal=rows.reduce((sum,r)=>sum+(Number(r.utang_sales)||0),0);
  const rcCount=rows.filter(r=>isRc(r.wo_type)).length;
  const workDays=new Set(rows.map(r=>dateKey(r.date)).filter(Boolean)).size;
  const techName=(currentProfile?.full_name||currentProfile?.username||currentUser?.email||'Teknisi');
  const exportedAt=new Date();
  const exportAt=exportedAt.toLocaleString('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const dateLabel=v=>{
    const k=dateKey(v); if(!k)return String(v||'-');
    const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
  };
  const COLS=11;
  const styles={
    title:{font:{name:'Aptos Display',sz:18,bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:'153A5B'}},alignment:{vertical:'center',horizontal:'left'}},
    subtitle:{font:{name:'Aptos',sz:10,italic:true,color:{rgb:'DCE8F2'}},fill:{fgColor:{rgb:'153A5B'}},alignment:{vertical:'center'}},
    metaLabel:{font:{name:'Aptos',sz:10,bold:true,color:{rgb:'526273'}},fill:{fgColor:{rgb:'EEF3F8'}},alignment:{vertical:'center'}},
    metaValue:{font:{name:'Aptos',sz:10,bold:true,color:{rgb:'1D2D3D'}},alignment:{vertical:'center'}},
    header:{font:{name:'Aptos',sz:10,bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:'D9117C'}},alignment:{horizontal:'center',vertical:'center',wrapText:true},border:{top:{style:'thin',color:{rgb:'D9117C'}},bottom:{style:'thin',color:{rgb:'D9117C'}}}},
    body:{font:{name:'Aptos',sz:10,color:{rgb:'243447'}},alignment:{vertical:'center'}},
    bodyCenter:{font:{name:'Aptos',sz:10,color:{rgb:'243447'}},alignment:{horizontal:'center',vertical:'center'}},
    totalLabel:{font:{name:'Aptos',sz:10,bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:'153A5B'}},alignment:{vertical:'center'}},
    totalNum:{font:{name:'Aptos',sz:10,bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:'153A5B'}},alignment:{horizontal:'right',vertical:'center'}},
    note:{font:{name:'Aptos',sz:9,italic:true,color:{rgb:'667788'}},alignment:{vertical:'center',wrapText:true}},
    summaryTitle:{font:{name:'Aptos Display',sz:17,bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:'153A5B'}},alignment:{vertical:'center'}},
    summaryHeader:{font:{name:'Aptos',sz:10,bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:'D9117C'}},alignment:{horizontal:'center',vertical:'center',wrapText:true}},
    summaryTotal:{font:{name:'Aptos',sz:10,bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:'153A5B'}},alignment:{vertical:'center'}}
  };
  const aoa=[
    ['INDOSAT HiFi | LAPORAN WORK ORDER'],
    ['REKAP WO SELESAI · Dihasilkan otomatis oleh HiFriend'],
    [],
    ['NAMA TEKNISI',techName,'','WAKTU EKSPOR',exportAt],
    ['TOTAL WO',rows.length,'','HARI KERJA',workDays],
    ['TOTAL PANJANG KABEL (M)',meterTotal,'','TOTAL NOMINAL (RP)',total],
    ['WO RC',rcCount,'','TOTAL UTANG SALES (RP)',utangTotal],
    [],
    ['NO.','TANGGAL DONE','ID PELANGGAN','NAMA PELANGGAN','RC','SERIAL NUMBER ONT','PANJANG KABEL (M)','NOMINAL (RP)','UTANG SALES (RP)','NAMA SALES','STATUS']
  ];
  rows.forEach((r,i)=>aoa.push([
    i+1,
    dateLabel(r.date),
    String(r.id||'-'),
    String(r.name||'-'),
    isRc(r.wo_type)?'RC':'-',
    String(r.sn||'-'),
    num(r.precone),
    money(r.nominal),
    Number(r.utang_sales)||0,
    String(r.sales_note||'-'),
    'DONE'
  ]));
  const headerIdx=8,firstData=9,lastData=firstData+rows.length-1,totalRow=lastData+1,noteRow=totalRow+2;
  aoa.push(['TOTAL KESELURUHAN','','','','','',meterTotal,total,utangTotal,'','']);
  aoa.push([]);
  aoa.push(['Catatan: nominal mengikuti tarif WO akun saat ini jika nominal kosong. Centang RC saat DONE/Edit bila sales berutang ke teknisi.']);
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:7},{wch:20},{wch:16},{wch:26},{wch:8},{wch:20},{wch:16},{wch:16},{wch:16},{wch:22},{wch:10}];
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:COLS-1}},{s:{r:1,c:0},e:{r:1,c:COLS-1}},{s:{r:noteRow,c:0},e:{r:noteRow,c:COLS-1}}];
  ws['!rows']=[];ws['!rows'][0]={hpt:32};ws['!rows'][1]={hpt:21};ws['!rows'][2]={hpt:8};
  ws['!rows'][3]={hpt:23};ws['!rows'][4]={hpt:23};ws['!rows'][5]={hpt:25};ws['!rows'][6]={hpt:23};ws['!rows'][7]={hpt:9};ws['!rows'][headerIdx]={hpt:34};
  for(let r=firstData;r<=lastData;r++)ws['!rows'][r]={hpt:21};
  ws['!rows'][totalRow]={hpt:25};ws['!rows'][noteRow]={hpt:30};
  const setStyle=(addr,style)=>{if(ws[addr])ws[addr].s=style;};
  ['A1'].forEach(a=>setStyle(a,styles.title));['A2'].forEach(a=>setStyle(a,styles.subtitle));
  // Metadata labels/values
  ['A4','D4','A5','D5','A6','D6','A7','D7'].forEach(a=>setStyle(a,styles.metaLabel));
  ['B4','E4','B5','E5','B6','E6','B7','E7'].forEach(a=>setStyle(a,styles.metaValue));
  ['B5','E5'].forEach(a=>{if(ws[a])ws[a].z='#,##0';});
  if(ws.B6)ws.B6.z='#,##0.##';if(ws.E6)ws.E6.z='"Rp" #,##0';if(ws.E7)ws.E7.z='"Rp" #,##0';
  for(let c=0;c<COLS;c++)setStyle(XLSX.utils.encode_cell({r:headerIdx,c}),styles.header);
  for(let r=firstData;r<=lastData;r++){
    for(let c=0;c<COLS;c++)setStyle(XLSX.utils.encode_cell({r,c}),[0,4,10].includes(c)?styles.bodyCenter:styles.body);
    // col: 6 meter, 7 nominal, 8 utang
    const m=ws[XLSX.utils.encode_cell({r,c:6})],n=ws[XLSX.utils.encode_cell({r,c:7})],u=ws[XLSX.utils.encode_cell({r,c:8})];
    if(m)m.z='#,##0.##';if(n)n.z='"Rp" #,##0';if(u)u.z='"Rp" #,##0';
    if((r-firstData)%2===1)for(let c=0;c<COLS;c++){const cell=ws[XLSX.utils.encode_cell({r,c})];if(cell)cell.s={...(cell.s||styles.body),fill:{fgColor:{rgb:'F4F7FA'}}};}
  }
  for(let c=0;c<COLS;c++)setStyle(XLSX.utils.encode_cell({r:totalRow,c}),[6,7,8].includes(c)?styles.totalNum:styles.totalLabel);
  if(ws[XLSX.utils.encode_cell({r:totalRow,c:6})])ws[XLSX.utils.encode_cell({r:totalRow,c:6})].z='#,##0.##';
  if(ws[XLSX.utils.encode_cell({r:totalRow,c:7})])ws[XLSX.utils.encode_cell({r:totalRow,c:7})].z='"Rp" #,##0';
  if(ws[XLSX.utils.encode_cell({r:totalRow,c:8})])ws[XLSX.utils.encode_cell({r:totalRow,c:8})].z='"Rp" #,##0';
  setStyle(XLSX.utils.encode_cell({r:noteRow,c:0}),styles.note);
  ws['!autofilter']={ref:`A${headerIdx+1}:K${lastData+1}`};
  ws['!freeze']={xSplit:0,ySplit:9,topLeftCell:'A10',activePane:'bottomLeft',state:'frozen'};
  ws['!pageSetup']={orientation:'landscape',paperSize:9,fitToWidth:1,fitToHeight:0};
  ws['!margins']={left:0.25,right:0.25,top:0.5,bottom:0.5,header:0.2,footer:0.2};
  ws['!printOptions']={horizontalCentered:true};
  ws['!pageMargins']={left:0.25,right:0.25,top:0.5,bottom:0.5,header:0.2,footer:0.2};
  ws['!sheetViews']=[{showGridLines:false}];

  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Detail WO');
  const safeName=(filePrefix||'Rekap_WO')+'_'+localISO(new Date());
  XLSX.writeFile(wb,safeName+'.xlsx',{cellStyles:true});
  swalToast('Laporan Excel siap · 1 sheet detail WO');
}



function formatRupiah(n){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n)||0); }





/* ===== V9: Theme, Offline, Skeleton ===== */
function applyTheme(dark){
  document.documentElement.classList.toggle('dark',!!dark);
  const btn=document.getElementById('themeBtn');
  if(btn)btn.textContent=dark?'☀️':'🌙';
  localStorage.setItem('hifriend_theme',dark?'dark':'light');
}
function toggleTheme(){
  const isDark=document.documentElement.classList.contains('dark');
  applyTheme(!isDark);
}
function initTheme(){
  const saved=localStorage.getItem('hifriend_theme');
  const preferDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved==='dark'||(!saved&&preferDark));
}
function updateOnlineStatus(){
  const badge=document.getElementById('offlineBadge');
  if(!badge)return;
  if(navigator.onLine){
    badge.classList.remove('show');
  }else{
    badge.classList.add('show');
    swalToast('Kamu sedang offline. Data mungkin tidak tersinkron.','warning');
  }
}
function showSkeleton(targetId){
  const el=document.getElementById(targetId);
  if(!el)return;
  el.innerHTML='<div class="skeletonCard"><div class="skeleton" style="width:40%"></div><div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:55%"></div></div>';
}

// Hook online/offline
window.addEventListener('online',updateOnlineStatus);
window.addEventListener('offline',updateOnlineStatus);

document.addEventListener('DOMContentLoaded',()=>{
  initTheme();
  updateOnlineStatus();
  bootAuth();
});
