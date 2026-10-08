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
  const reportBtn=document.getElementById('tabReport');
  const reportTab=document.getElementById('reportTab');
  const accountBtn=document.getElementById('tabAccount');
  if(homeBtn)homeBtn.style.display=isAdmin?'none':'inline-flex';
  if(homePanel)homePanel.style.display='none';
  if(msgBtn)msgBtn.style.display=isAdmin?'none':'inline-flex';
  if(msgTab)msgTab.style.display='none';
  if(reportBtn)reportBtn.style.display=isAdmin?'none':'inline-flex';
  if(reportTab)reportTab.style.display='none';
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
async function syncRowsToSupabase(rows){
  if(!supabaseClient||!rows?.length)return {saved:0,skipped:rows?.length||0};
  const {data:{user:authUser},error:authError}=await supabaseClient.auth.getUser();
  if(authError||!authUser)throw new Error('Sesi login Supabase tidak tersedia. Silakan login ulang.');
  currentUser=authUser;
  const payload=rows.map(r=>({user_id:authUser.id,customer_id:String(r.id||''),customer_name:String(r.name||''),tanggal_done:toIsoDate(r.date),panjang_kabel:Math.max(0,Math.round(parseFloat(String(r.precone||'').replace(',','.'))||0)),nominal:Number(r.nominal)||getTariff(),status:'DONE',sn:String(r.sn||'').trim()})).filter(r=>r.customer_id&&r.tanggal_done);
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
    // RLS public.wo sudah membatasi insert ke user_id = auth.uid().
    // Tidak memakai RPC tambahan agar tetap sesuai struktur database/RLS yang sudah ada.
    let {error}=await supabaseClient.from('wo').insert(fresh);
    // Kompatibel dengan database lama yang belum memiliki kolom SN.
    if(error && (String(error.code||'')==='42703' || /column .*sn.* does not exist/i.test(String(error.message||'')))){
      const legacyFresh=fresh.map(({sn,...row})=>row);
      const retry=await supabaseClient.from('wo').insert(legacyFresh);
      error=retry.error;
    }
    if(error){
      console.error('Supabase WO insert error',error, {authUserId:authUser.id, payload:fresh});
      throw new Error((error.message||'Gagal menyimpan WO')+' [code '+(error.code||'unknown')+']');
    }
  }
  return {saved:fresh.length,skipped:payload.length-fresh.length};
}
async function getRemoteWORows(){
  let q= supabaseClient.from('wo').select('id,customer_id,customer_name,tanggal_done,panjang_kabel,nominal,status,sn,created_at').eq('user_id',currentUser.id).order('tanggal_done',{ascending:true}).order('customer_id',{ascending:true});
  let {data,error}=await q;
  if(error && (String(error.code||'')==='42703' || /column .*sn.* does not exist/i.test(String(error.message||'')))){
    const fallback=await supabaseClient.from('wo').select('id,customer_id,customer_name,tanggal_done,panjang_kabel,nominal,status,created_at').eq('user_id',currentUser.id).order('tanggal_done',{ascending:true}).order('customer_id',{ascending:true});
    data=fallback.data; error=fallback.error;
  }
  if(error)throw error;
  return (data||[]).map(r=>({key:'remote:'+r.id,remote_id:r.id,date:fromIsoDate(r.tanggal_done),id:r.customer_id||'',name:r.customer_name||'',sn:r.sn||'',precone:String(r.panjang_kabel??''),nominal:Number(r.nominal)||getTariff(),status:r.status||'DONE'}));
}

// ===== DATABASE SUPABASE (REMOTE ONLY) =====
let databaseRows=[];
let accountTariff=70000;
let activeDbChip='all';
let lastReportRows=[];
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

async function saveRowsToDatabase(rows){
  if(!rows?.length)return {saved:0,skipped:0};
  if(!currentUser||!supabaseClient)throw new Error('Sesi login Supabase tidak tersedia. Silakan login ulang.');
  return await syncRowsToSupabase(rows);
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
function dateObjFromRow(row){
  const k=dateKey(row?.date);
  if(!k)return null;
  const [y,m,d]=k.split('-').map(Number);
  const dt=new Date(y,m-1,d);
  return Number.isNaN(dt.getTime())?null:dt;
}
function dashDateLabel(dt){return dt.toLocaleDateString('id-ID',{day:'2-digit',month:'short'}).replace(/\./g,'');}
function dashMonthLabel(dt){return dt.toLocaleDateString('id-ID',{month:'short'}).replace(/\./g,'');}
function renderBarChart(id,items,labelFn){
  const el=document.getElementById(id); if(!el)return;
  if(!items.length){el.innerHTML='<div class="chartEmpty">Belum ada data WO.</div>';return;}
  const max=Math.max(...items.map(x=>x.value),1);
  el.innerHTML=items.map(x=>{
    const h=x.value?Math.max(4,(x.value/max)*100):0;
    return '<div class="barItem" title="'+escapeHtml(labelFn(x.dt)+': '+x.value+' WO')+'"><div class="barValue">'+x.value+'</div><div class="barTrack"><div class="barFill" style="height:'+h+'%"></div></div><div class="barLabel">'+escapeHtml(labelFn(x.dt))+'</div></div>';
  }).join('');
}
function getDashRange(){
  const rows=Array.isArray(databaseRows)?databaseRows:[];
  const period=document.getElementById('dashPeriod')?.value||'all';
  const today=new Date();today.setHours(0,0,0,0);
  let from=null,to=null;
  if(period==='today'){from=new Date(today);to=new Date(today);}
  else if(/^\d+$/.test(period)){to=new Date(today);from=new Date(today);from.setDate(from.getDate()-(Number(period)-1));}
  else if(period==='month'){from=new Date(today.getFullYear(),today.getMonth(),1);to=new Date(today);}
  else if(period==='lastmonth'){from=new Date(today.getFullYear(),today.getMonth()-1,1);to=new Date(today.getFullYear(),today.getMonth(),0);}
  else if(period==='custom'){const a=document.getElementById('dashFrom')?.value,b=document.getElementById('dashTo')?.value;if(a){const [y,m,d]=a.split('-').map(Number);from=new Date(y,m-1,d)}if(b){const [y,m,d]=b.split('-').map(Number);to=new Date(y,m-1,d)}}
  const filtered=rows.filter(r=>{const dt=dateObjFromRow(r);if(!dt)return false;dt.setHours(0,0,0,0);return (!from||dt>=from)&&(!to||dt<=to);});
  return {rows:filtered,from,to,period};
}
function updateDashDateControls(){
  const custom=document.getElementById('dashPeriod')?.value==='custom';
  const from=document.getElementById('dashFromWrap');
  const to=document.getElementById('dashToWrap');
  if(from)from.style.display=custom?'block':'none';
  if(to)to.style.display=custom?'block':'none';
}
function handleDashPeriodChange(){
  updateDashDateControls();
  renderDashboard();
}
function setDashPeriodCustom(){
  const el=document.getElementById('dashPeriod');
  if(el)el.value='custom';
  updateDashDateControls();
}
function getDailyTarget(){const key='hifriend_daily_target_'+(currentUser?.id||'guest');const n=Number(localStorage.getItem(key)||5);return Number.isFinite(n)&&n>0?n:5;}
function saveDailyTarget(){const el=document.getElementById('dailyTarget');const n=Math.max(1,Math.min(999,Math.round(Number(el?.value)||5)));if(el)el.value=n;localStorage.setItem('hifriend_daily_target_'+(currentUser?.id||'guest'),String(n));renderDashboard();}
function renderDashboard(){
  updateDashDateControls();
  const range=getDashRange(),rows=range.rows;

  // Target harian (selalu pakai data hari ini, bukan filter periode)
  const targetEl=document.getElementById('dailyTarget');
  if(targetEl) targetEl.value=getDailyTarget();
  const target=getDailyTarget();
  const todayKey=dateKey(new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}).toUpperCase());
  const todayRows=(databaseRows||[]).filter(r=>dateKey(r.date)===todayKey).length;
  const pct=Math.min(100,Math.round((todayRows/target)*100));
  const ts=document.getElementById('targetSummary');
  if(ts) ts.textContent=todayRows+' / '+target+' WO hari ini'+(todayRows>=target?' · Target tercapai':' · Kurang '+(target-todayRows)+' WO');
  const tf=document.getElementById('targetBarFill');
  if(tf) tf.style.width=pct+'%';

  // Chart mengikuti filter periode
  const source=rows.length?rows:[];
  const anchor=range.to||new Date();
  anchor.setHours(0,0,0,0);
  const daily=[];
  for(let i=6;i>=0;i--){
    const dt=new Date(anchor);
    dt.setDate(anchor.getDate()-i);
    const key=dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
    daily.push({dt,value:source.filter(r=>dateKey(r.date)===key).length});
  }
  const monthly=[];
  for(let i=5;i>=0;i--){
    const dt=new Date(anchor.getFullYear(),anchor.getMonth()-i,1);
    const ym=dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0');
    monthly.push({dt,value:source.filter(r=>dateKey(r.date).slice(0,7)===ym).length});
  }
  renderBarChart('woDailyChart',daily,dashDateLabel);
  renderBarChart('woMonthlyChart',monthly,dashMonthLabel);
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
      return;
    }
    const total=databaseRows.reduce((a,r)=>a+(Number(r.nominal)||getTariff()),0);
    const meter=databaseRows.reduce((a,r)=>a+(parseFloat(String(r.precone||'').replace(',','.'))||0),0);
    const days=new Set(databaseRows.map(r=>dateKey(r.date)).filter(Boolean)).size;
    if(status)status.innerHTML='<span class="ok">✓ '+databaseRows.length+' WO tersimpan di akun ini.</span>';
    if(money)money.innerHTML='<div class="moneyGrid"><div class="moneyCard"><div class="moneyLabel">💵 Tarif WO terakhir</div><div class="moneyValue">'+formatRupiah(Number(databaseRows[databaseRows.length-1].nominal)||getTariff())+'</div></div><div class="moneyCard moneyTotal"><div class="moneyLabel">💰 Total Pendapatan</div><div class="moneyValue">'+formatRupiah(total)+'</div></div></div>';
    if(stats)stats.innerHTML='<div class="statCard"><div class="statLabel">📦 TOTAL WO</div><div class="statValue">'+databaseRows.length+'</div></div><div class="statCard"><div class="statLabel">📏 TOTAL METER</div><div class="statValue">'+formatMeter(meter)+'</div></div><div class="statCard"><div class="statLabel">📅 HARI KERJA</div><div class="statValue">'+days+'</div></div><div class="statCard"><div class="statLabel">💸 PENDAPATAN</div><div class="statValue">'+formatRupiah(total)+'</div></div>';
    renderDashboard();
    renderDatabase();
    // Target notification (soft)
    setTimeout(checkDailyTargetToast,600);
  }catch(e){
    console.error('Database load error',e);
    if(status)status.textContent='Database gagal dimuat: '+(e.message||e);
    if(results)results.innerHTML='<div class="empty">Gagal memuat data.</div>';
  }
}

function setFilterChip(el,key){
  activeDbChip=key;
  document.querySelectorAll('#filterChips .filterChip').forEach(c=>c.classList.remove('active'));
  if(el)el.classList.add('active');
  // Reset date inputs when using chips
  if(key!=='all'){
    const today=todayLocal();
    const fromEl=document.getElementById('dbFrom'),toEl=document.getElementById('dbTo');
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
  }else{
    const fromEl=document.getElementById('dbFrom'),toEl=document.getElementById('dbTo');
    if(fromEl)fromEl.value='';if(toEl)toEl.value='';
  }
  renderDatabase();
}

function renderDatabase(){
  const out=document.getElementById('dbResults'); if(!out)return;
  const q=(document.getElementById('dbSearch')?.value||'').trim().toLowerCase();
  const from=document.getElementById('dbFrom')?.value||'';
  const to=document.getElementById('dbTo')?.value||'';
  const sort=document.getElementById('dbSort')?.value||'date-asc';
  let filtered=databaseRows.filter(r=>{
    const hay=(String(r.id)+' '+String(r.name)+' '+String(r.sn||'')).toLowerCase();
    const dk=dateKey(r.date);
    return (!q||hay.includes(q))&&(!from||(dk&&dk>=from))&&(!to||(dk&&dk<=to));
  });
  // Sort
  filtered=filtered.slice().sort((a,b)=>{
    if(sort==='name') return String(a.name||'').localeCompare(String(b.name||''),'id');
    if(sort==='nominal-desc') return (Number(b.nominal)||0)-(Number(a.nominal)||0);
    if(sort==='meter-desc') return (parseFloat(String(b.precone||'').replace(',','.'))||0)-(parseFloat(String(a.precone||'').replace(',','.'))||0);
    const da=dateKey(a.date)||'',db=dateKey(b.date)||'';
    if(sort==='date-desc') return db.localeCompare(da);
    return da.localeCompare(db);
  });
  const note=document.getElementById('dbFilterNote');
  const hasFilter=q||from||to||activeDbChip!=='all';
  if(note)note.innerHTML=hasFilter?'<div class="filteredNote">🔎 Menampilkan '+filtered.length+' dari '+databaseRows.length+' WO sesuai filter.</div>':'';
  if(!filtered.length){out.innerHTML='<div class="empty">Tidak ada WO yang cocok dengan filter.</div>';return;}
  let html='<div class="tableWrap"><table class="reportTable dbTable"><thead><tr><th>No.</th><th>Tanggal Done</th><th>ID Pelanggan</th><th>Nama Pelanggan</th><th>SN</th><th>Panjang Kabel</th><th>Nominal</th><th>Status</th><th>Aksi</th></tr></thead><tbody>';
  filtered.forEach((r,i)=>{
    const k=encodeURIComponent(r.key||'');
    html+=`<tr><td>${i+1}</td><td>${escapeHtml(r.date)}</td><td><strong>${escapeHtml(r.id)}</strong></td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.sn||'-')}</td><td>${escapeHtml(r.precone)} meter</td><td>${formatRupiah(Number(r.nominal)||getTariff())}</td><td class="check">✓ DONE</td><td><div style="display:flex;gap:5px"><button class="secondary" type="button" title="Detail WO" onclick="showWODetail(decodeURIComponent('${k}'))">👁️</button><button class="deleteBtn" title="Hapus WO ini" onclick="deleteWORow(decodeURIComponent('${k}'))">🗑️</button></div></td></tr>`;
  });
  out.innerHTML=html+'</tbody></table></div>';
}

function showWODetail(key){
  const row=databaseRows.find(r=>r.key===key);if(!row)return;
  Swal.fire({title:'Detail WO',html:'<div class="detailGrid"><div class="detailItem"><div class="detailLabel">TANGGAL DONE</div><div class="detailValue">'+escapeHtml(row.date||'-')+'</div></div><div class="detailItem"><div class="detailLabel">ID PELANGGAN</div><div class="detailValue">'+escapeHtml(row.id||'-')+'</div></div><div class="detailItem"><div class="detailLabel">NAMA PELANGGAN</div><div class="detailValue">'+escapeHtml(row.name||'-')+'</div></div><div class="detailItem"><div class="detailLabel">SN</div><div class="detailValue">'+escapeHtml(row.sn||'-')+'</div></div><div class="detailItem"><div class="detailLabel">PANJANG KABEL</div><div class="detailValue">'+escapeHtml(row.precone||'0')+' meter</div></div><div class="detailItem"><div class="detailLabel">NOMINAL</div><div class="detailValue">'+formatRupiah(Number(row.nominal)||getTariff())+'</div></div><div class="detailItem"><div class="detailLabel">STATUS</div><div class="detailValue">✓ '+escapeHtml(row.status||'DONE')+'</div></div></div>',confirmButtonText:'Tutup'});
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
function indoDate(value){
  const m = String(value).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(!m) return clean(value);
  const d=Number(m[1]), mo=Number(m[2]), y=Number(m[3]);
  const dt=new Date(y,mo-1,d);
  const days=['MINGGU','SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'];
  const months=['JANUARI','FEBRUARI','MARET','APRIL','MEI','JUNI','JULI','AGUSTUS','SEPTEMBER','OKTOBER','NOVEMBER','DESEMBER'];
  return `${days[dt.getDay()]} ${d} ${months[mo-1]} ${y}`;
}
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
function indoDateShort(value){
  // Format seperti di WA teknisi: "rabu 05 Oktober 2026"
  const m=String(value).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(!m) return clean(value);
  const d=Number(m[1]), mo=Number(m[2]), y=Number(m[3]);
  const dt=new Date(y,mo-1,d);
  const days=['minggu','senin','selasa','rabu','kamis','jumat','sabtu'];
  const months=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const dd=String(d).padStart(2,'0');
  return days[dt.getDay()]+' '+dd+' '+months[mo-1]+' '+y;
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
function parseRows(raw){
  // Multi-format:
  // 1) Excel tab / double-space (≥10 kolom) — logika lama tetap utuh
  // 2) Baris panjang spasi tunggal (paste sistem / chat)
  const lines=raw.split(/\r?\n/).map(line=>line.trimEnd()).filter(line=>line.trim());
  const rows=[];
  for(const line of lines){
    if(isTechnicianOnlyLine(line)) continue;

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
  const isSystemExport=!isFlat && /^OH\d+/i.test(parts[1]||'') && parts.length>=14 && (
    /INSTALLATION/i.test(joined) ||
    (/\|/.test(parts[8]||'') && /(?:62|08)\d{8,}/.test(parts[8]||'')) ||
    /^slot-?\d+\s*[-–]/i.test(parts[14]||'') ||
    /^\d{4}-\d{2}-\d{2}/.test(parts[13]||'')
  );

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
    name=parts[6]||'';
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
    phone=pickPhoneFrom(parts[8])||pickPhoneFrom(parts[9]);
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
    for(const x of [parts[13],parts[14],...parts]){
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
  if(!slotClean && isSystemExport && parts[14]){
    const p=String(parts[14]);
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
  if(!id && isSystemExport && /^\d{7,15}$/.test(parts[5]||'')){
    id=parts[5];
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
  if(isSystemExport && /Internet\s*\d+/i.test(parts[2]||'')) paket=parts[2];

  let svm='';
  const mSvm=joined.match(/\b(SVM_[A-Z0-9_]+)\b/i);
  if(mSvm) svm=mSvm[1];
  if(isSystemExport && parts[10] && /_/.test(parts[10])) svm=parts[10];

  // ----- ALAMAT -----
  let addr='';
  if(isSystemExport || isNewStyle){
    const addressCandidates=parts.filter(x=>
      x && x.length>25 && /JALAN|NO\.?|BLOK|RW|PERUMAHAN|GANG|RESIDENCE|GRAHA/i.test(x)
    );
    if(addressCandidates.length){
      addr=addressCandidates.slice().sort((a,b)=>b.length-a.length)[0];
    }else if(isSystemExport){
      addr=parts[7]||'';
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
function generate(){
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
  mappingRun(raw);
}

function clearAll(){
  document.getElementById('input').value='';
  document.getElementById('results').innerHTML='<div class="count">Belum ada hasil.</div>';
  document.getElementById('status').textContent='';
  const mt=document.getElementById('mappingTotal'); if(mt) mt.textContent='0 WO';
  const mc=document.getElementById('mappingConflict'); if(mc) mc.textContent='0 bentrok';
  const ms=document.getElementById('mappingStatus'); if(ms) ms.textContent='Belum ada hasil mapping.';
  const ml=document.getElementById('mappingList'); if(ml) ml.innerHTML='';
}

// ===== MAPPING TERINTEGRASI DENGAN GENERATOR CHAT =====
function mappingEsc(v){
  return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function mappingParseWO(raw){
  return String(raw||'').split(/\r?\n/).map(x=>x.trimEnd()).filter(x=>{
    const t=x.trim();
    return /OH\d{8,}/i.test(t) && (/\t/.test(t) || /SLOT\s*-?\s*\d+\s*\([^)]*\)/i.test(t) || /slot-?\s*\d+\s*[-–—]\s*\d{1,2}:\d{2}/i.test(t) || /HiFi\s*\d+\s*Mbps/i.test(t) || /Internet\s*\d+/i.test(t));
  }).map((line,idx)=>{
    const c=line.split('\t').map(v=>String(v??'').trim());
    const joined=c.join(' ').replace(/\s+/g,' ').trim();
    const ohIndex=c.findIndex(v=>/^OH\d{8,}/i.test(v));
    const isSystemExport=ohIndex===1 && (
      /INSTALLATION/i.test(c[3]||'') ||
      /^slot-?\d+\s*[-–—]/i.test(c[14]||'') ||
      /^\d{4}-\d{2}-\d{2}/.test(c[13]||'')
    );

    const find=(re,def='')=>{const z=c.find(v=>re.test(v));return z?String(z).trim():def};

    let name='', speed='', phone='', slot='', status='', kab='', area='', address='', oh='';

    if(isSystemExport){
      // Format export sistem yang sebenarnya:
      // [customer_id, OH, package, INSTALLATION, vendor, id, NAMA, alamat, phone|..., KAB, team, team, ..., tanggal, slot-5 - 16:00 - 18:00, ...]
      oh=c[1]||'';
      name=c[6]||'';
      speed=c[2]||'';
      phone=(c[8]||'').split('|')[0].trim();
      kab=c[9]||'';
      area=c[7]||'';
      slot=c[14]||'';
      address=c[21]||c[7]||'';
    }else{
      // Format tab baru/lama: pertahankan parser berbasis posisi OH.
      const shift=ohIndex>0 ? ohIndex : 0;
      oh=find(/^OH\d{8,}$/i);
      slot=find(/SLOT\s*-\s*\d+\s*\(([^)]+)\)/i) || find(/slot-?\s*\d+\s*[-–—]\s*(\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2})/i);
      speed=find(/(?:HiFi|Internet)\s*\d+\s*Mbps?/i);
      kab=c[6+shift]||'';
      area=c[10+shift]||'';
      name=c[2+shift]||'';
      address=c[11+shift]||'';
    }

    slot=String(slot||'').replace(/^SLOT\s*-\s*\d+\s*\(([^)]+)\)$/i,'$1')
      .replace(/^slot-?\s*\d+\s*[-–—]\s*/i,'')
      .replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();

    if(!name || /^(?:HiFi|Internet)\s*\d+/i.test(name) || /^OH\d/i.test(name)){
      const m=joined.match(/OH\d{8,}\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'\-\s]{2,60}?)\s+(?:HiFi|Internet)\s*\d+/i);
      if(m) name=m[1].replace(/\s+/g,' ').trim();
    }
    if(!name) name='WO '+(idx+1);

    if(!speed) speed=find(/(?:HiFi|Internet)\s*\d+\s*Mbps?/i);
    if(!phone){
      const m=joined.match(/(?:62|08)\d{8,13}(?:\|\d+)?/);
      if(m) phone=m[0].split('|')[0];
    }

    // Alamat lengkap export biasanya ada di kolom 21.
    if(!address){
      for(let i=11+(ohIndex>0?ohIndex:0);i<c.length;i++){
        const v=c[i];
        if(v && v.length>15 && /(?:JALAN|JL\.?|PERUMAHAN|REGENCY|KAB\.?|BEKASI|JAWA BARAT)/i.test(v)){address=v;break;}
      }
    }
    if(!address) address=[area,kab].filter(Boolean).join(', ');

    // Status mapping hanya dipakai jika memang ada status eksplisit.
    status=find(/^(DONE|OPEN|CANCEL|CLOSED|PENDING|IN\s*PROGRESS)$/i);

    return {name,slot,speed,status,province:'',city:'',kab,kec:'',kel:'',postcode:'',area,address,oh,phone};
  });
}
function mappingMins(slot){
  const m=String(slot||'').match(/(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/);
  return m?(+m[1]*60 + +m[2]):9999;
}
function mappingRun(raw){
  const list=mappingParseWO(raw);
  const total=document.getElementById('mappingTotal');
  const conflict=document.getElementById('mappingConflict');
  const status=document.getElementById('mappingStatus');
  const out=document.getElementById('mappingList');
  if(!total||!conflict||!status||!out)return;
  total.textContent=`${list.length} WO`;
  if(!list.length){conflict.textContent='0 bentrok';status.textContent='Data WO belum terbaca untuk mapping.';out.innerHTML='';return;}
  const slotCount={};
  list.forEach(x=>{const k=x.slot||'TANPA SLOT';slotCount[k]=(slotCount[k]||0)+1;});
  list.forEach(x=>x.conflict=!!x.slot&&slotCount[x.slot]>1);
  list.sort((a,b)=>mappingMins(a.slot)-mappingMins(b.slot)||a.kec.localeCompare(b.kec,'id')||a.area.localeCompare(b.area,'id')||a.name.localeCompare(b.name,'id'));
  const conflicts=list.filter(x=>x.conflict).length;
  conflict.textContent=`${conflicts} bentrok`;
  status.innerHTML=`✓ ${list.length} WO berhasil dipetakan${conflicts?` — <b>⚠️ ${conflicts} WO bentrok slot</b>`:''}.`;
  out.innerHTML=list.map((x,i)=>{
    const q=encodeURIComponent(x.address||x.area||x.name);
    return `<div class="mappingWO ${x.conflict?'mappingConflict':''}">
      <div class="mappingNum">${i+1}</div>
      <div class="mappingBody">
        <div class="mappingName">${mappingEsc(x.name||'Pelanggan')}</div>
        <div class="mappingMeta">${mappingEsc(x.speed||'-')} • ${mappingEsc(x.kec||'-')} • ${mappingEsc(x.area||'-')}</div>
        <div class="mappingAddress">${mappingEsc(x.address||'-')}</div>
        <div class="mappingBottom"><span class="mappingSlot">⏰ ${mappingEsc(x.slot||'Tanpa slot')}</span>${x.conflict?'<span class="mappingWarn">⚠️ BENTROK</span>':''}</div>
      </div>
      <a class="mappingNav" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">📍 Navigasi</a>
    </div>`;
  }).join('');
}
function mappingUseMyLocation(){
  const input=document.getElementById('mappingStart');
  const stat=document.getElementById('mappingLocStatus');
  if(!navigator.geolocation){if(stat)stat.textContent='GPS tidak didukung browser ini.';return;}
  if(stat)stat.textContent='📡 Mengambil posisi...';
  navigator.geolocation.getCurrentPosition(pos=>{
    const v=`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
    if(input)input.value=v;
    if(stat)stat.textContent='✓ Posisi teknisi siap sebagai titik start.';
  },err=>{
    if(stat)stat.textContent='⚠️ Posisi tidak bisa diambil. Pastikan izin lokasi aktif.';
  },{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
}

function showTab(tab){
  if(currentProfile?.role==='admin'){
    const homePanel=document.getElementById('homePanel');
    const msgTab=document.getElementById('msgTab');
    const reportTab=document.getElementById('reportTab');
    const accountPanel=document.getElementById('accountPanel');
    const adminPanel=document.getElementById('adminPanel');
    if(homePanel)homePanel.style.display='none';
    if(msgTab)msgTab.style.display='none';
    if(reportTab)reportTab.style.display='none';
    if(accountPanel)accountPanel.style.display='none';
    if(adminPanel)adminPanel.style.display='block';
    return;
  }
  const home=document.getElementById('homePanel');
  const msg=document.getElementById('msgTab');
  const report=document.getElementById('reportTab');
  const account=document.getElementById('accountPanel');
  const bh=document.getElementById('tabHome');
  const bm=document.getElementById('tabMsg');
  const br=document.getElementById('tabReport');
  const ba=document.getElementById('tabAccount');
  if(home)home.style.display=tab==='home'?'block':'none';
  if(msg)msg.style.display=tab==='msg'?'block':'none';
  if(report)report.style.display=tab==='report'?'block':'none';
  if(account)account.style.display=tab==='account'?'block':'none';
  if(bh)bh.className=tab==='home'?'primary':'secondary';
  if(bm)bm.className=tab==='msg'?'primary':'secondary';
  if(br)br.className=tab==='report'?'primary':'secondary';
  if(ba)ba.className=tab==='account'?'primary':'secondary';
  if(tab==='home' || tab==='report')loadDatabase();
}

function showReportSubTab(tab){
  // Rekap dan Database ditampilkan berurutan dalam satu halaman.
  const input=document.getElementById('reportInputPanel');
  const database=document.getElementById('databasePanel');
  if(input) input.classList.add('active');
  if(database) database.classList.add('active');
  if(currentProfile?.role!=='admin') loadDatabase();
}


async function downloadDatabaseExcel(){
  const rows=await getAllWORows();
  if(!rows.length){document.getElementById('dbStatus').textContent='Database masih kosong.';return;}
  buildExcelFromData(rows,'Rekap_WO_Database');
}

function buildExcelFromData(rows,filePrefix){
  if(typeof XLSX==='undefined'){
    swalNotice('Library Excel belum siap','Pastikan internet aktif lalu coba lagi.','warning');
    return;
  }
  const total=rows.reduce((sum,r)=>sum+(Number(r.nominal)||getTariff()),0);
  const meterTotal=rows.reduce((sum,r)=>sum+(parseFloat(String(r.precone||'').replace(',','.'))||0),0);
  const workDays=new Set(rows.map(r=>dateKey(r.date)).filter(Boolean)).size;
  const techName=(currentProfile?.full_name||currentProfile?.username||currentUser?.email||'Teknisi');
  const exportAt=new Date().toLocaleString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});

  // ---- Sheet 1: Data WO ----
  const headerRow=5; // 0-indexed later
  const aoa=[
    ['INDOSAT HiFi — REKAP WO DONE'],
    ['Generator HiFriend'],
    [],
    ['Teknisi',techName,'','Diekspor',exportAt],
    ['Total WO',rows.length,'','Total Meter',meterTotal],
    ['Hari Kerja',workDays,'','Total Pendapatan',total],
    [],
    ['No.','Tanggal Done','ID Pelanggan','Nama Pelanggan','SN ONT','Panjang Kabel (m)','Nominal (Rp)','Status']
  ];
  rows.forEach((r,i)=>{
    aoa.push([
      i+1,
      r.date||'',
      r.id||'',
      r.name||'',
      r.sn||'-',
      parseFloat(String(r.precone||'').replace(',','.'))||0,
      Number(r.nominal)||getTariff(),
      'DONE'
    ]);
  });
  // Footer ringkas
  aoa.push([]);
  aoa.push(['','','','','TOTAL',meterTotal,total,'']);
  aoa.push(['','','','','','','','']);
  aoa.push(['Catatan: File ini digenerate otomatis dari Generator HiFriend. Nominal default mengikuti tarif akun.']);

  const ws=XLSX.utils.aoa_to_sheet(aoa);

  // Lebar kolom rapi
  ws['!cols']=[
    {wch:5},   // No
    {wch:26},  // Tanggal
    {wch:14},  // ID
    {wch:28},  // Nama
    {wch:18},  // SN
    {wch:16},  // Meter
    {wch:15},  // Nominal
    {wch:10}   // Status
  ];

  // Merge judul
  ws['!merges']=[
    {s:{r:0,c:0},e:{r:0,c:7}},
    {s:{r:1,c:0},e:{r:1,c:7}},
    {s:{r:aoa.length-1,c:0},e:{r:aoa.length-1,c:7}}
  ];

  // Format angka (meter & nominal) + header bold via cell props
  const range=XLSX.utils.decode_range(ws['!ref']);
  const dataStart=7; // row index of first data (after header at row 7)
  const dataEnd=dataStart+rows.length-1;
  for(let R=dataStart;R<=dataEnd;R++){
    // Meter col F (5)
    const meterCell=XLSX.utils.encode_cell({r:R,c:5});
    if(ws[meterCell]&&ws[meterCell].t==='n') ws[meterCell].z='0.##';
    // Nominal col G (6)
    const nomCell=XLSX.utils.encode_cell({r:R,c:6});
    if(ws[nomCell]&&ws[nomCell].t==='n') ws[nomCell].z='#,##0';
  }
  // Summary numbers format
  ['E4','E5'].forEach(addr=>{
    if(ws[addr]&&typeof ws[addr].v==='number') ws[addr].z=addr==='E5'?'#,##0':'0.##';
  });
  // B4 total WO already number; B5 hari kerja
  // Footer total row
  const footerRow=dataEnd+2;
  const fMeter=XLSX.utils.encode_cell({r:footerRow,c:5});
  const fNom=XLSX.utils.encode_cell({r:footerRow,c:6});
  if(ws[fMeter]&&ws[fMeter].t==='n') ws[fMeter].z='0.##';
  if(ws[fNom]&&ws[fNom].t==='n') ws[fNom].z='#,##0';

  // Freeze header
  ws['!freeze']={xSplit:0,ySplit:8,topLeftCell:'A9',activePane:'bottomLeft',state:'frozen'};
  ws['!autofilter']={ref:'A8:H'+(8+rows.length)};

  // ---- Sheet 2: Ringkasan per tanggal ----
  const byDate={};
  rows.forEach(r=>{
    const k=dateKey(r.date)||'(Tanpa tanggal)';
    if(!byDate[k]) byDate[k]={date:r.date||k,count:0,meter:0,nominal:0};
    byDate[k].count+=1;
    byDate[k].meter+=parseFloat(String(r.precone||'').replace(',','.'))||0;
    byDate[k].nominal+=Number(r.nominal)||getTariff();
  });
  const summaryAoa=[
    ['RINGKASAN WO PER TANGGAL'],
    ['Teknisi: '+techName],
    [],
    ['Tanggal','Jumlah WO','Total Meter','Total Nominal (Rp)']
  ];
  Object.keys(byDate).sort().forEach(k=>{
    const d=byDate[k];
    summaryAoa.push([d.date,d.count,d.meter,d.nominal]);
  });
  summaryAoa.push([]);
  summaryAoa.push(['TOTAL',rows.length,meterTotal,total]);

  const ws2=XLSX.utils.aoa_to_sheet(summaryAoa);
  ws2['!cols']=[{wch:28},{wch:12},{wch:14},{wch:18}];
  ws2['!merges']=[{s:{r:0,c:0},e:{r:0,c:3}}];
  // Format nominal di ringkasan
  for(let R=4;R<summaryAoa.length;R++){
    const c=XLSX.utils.encode_cell({r:R,c:2});
    const n=XLSX.utils.encode_cell({r:R,c:3});
    if(ws2[c]&&ws2[c].t==='n') ws2[c].z='0.##';
    if(ws2[n]&&ws2[n].t==='n') ws2[n].z='#,##0';
  }

  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'WO Done');
  XLSX.utils.book_append_sheet(wb,ws2,'Ringkasan');
  const safeName=(filePrefix||'Rekap_WO')+'_'+localISO(new Date());
  XLSX.writeFile(wb,safeName+'.xlsx');
  swalToast('Excel rapi siap · 2 sheet (Data + Ringkasan)');
}

function normalizeReportDate(value){
  const raw=String(value||'').trim();
  const numeric=raw.match(/^(?:[A-ZÀ-Ü]+\s*,?\s*)?(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/i);
  if(numeric){
    const d=Number(numeric[1]),mo=Number(numeric[2])-1,y=Number(numeric[3]);
    const dt=new Date(y,mo,d);
    if(!Number.isNaN(dt.getTime())&&dt.getFullYear()===y&&dt.getMonth()===mo&&dt.getDate()===d){
      const days=['MINGGU','SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'];
      const months=['JANUARI','FEBRUARI','MARET','APRIL','MEI','JUNI','JULI','AGUSTUS','SEPTEMBER','OKTOBER','NOVEMBER','DESEMBER'];
      return `${days[dt.getDay()]}, ${d} ${months[mo]} ${y}`;
    }
  }
  const m=raw.toUpperCase().match(/(?:SENIN|SELASA|RABU|KAMIS|KAMUS|JUMAT|SABTU|MINGGU)?\s*,?\s*(\d{1,2})\s+([A-Z]+)\s+(\d{4})/i);
  if(!m)return raw;
  const months={JANUARI:0,FEBRUARI:1,MARET:2,APRIL:3,MEI:4,JUNI:5,JULI:6,AGUSTUS:7,SEPTEMBER:8,OKTOBER:9,NOVEMBER:10,DESEMBER:11};
  const mon=months[m[2].toUpperCase()];
  if(mon===undefined)return raw;
  const d=Number(m[1]),y=Number(m[3]),dt=new Date(y,mon,d);
  if(Number.isNaN(dt.getTime()))return raw;
  const days=['MINGGU','SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'];
  return `${days[dt.getDay()]}, ${d} ${m[2].toUpperCase()} ${y}`;
}
function extractReportRecords(raw){
  const lines=String(raw||'').split(/\r?\n/);
  const rows=[];
  let currentDate='';
  let current=-1;

  for(const rawLine of lines){
    const line=rawLine.trim();
    if(!line)continue;

    // Hari/Tgl : SELASA, 6 OKTOBER 2026  (spasi opsional di sekitar :)
    const dm=line.match(/^Hari\s*\/?\s*Tgl\s*:\s*(.+)$/i);
    if(dm){currentDate=normalizeReportDate(dm[1]);continue;}

    const cols=rawLine.split('\t').map(clean);
    const first=cols[0]||'';
    // Baris pelanggan: diawali OH... (kode OH atau "OH 1")
    if(!/^OH\s*\d+/i.test(first))continue;

    current++;
    const joined=cols.join('\t');
    const isInstallExport=/INSTALLATION/i.test(joined) || (/Internet\s*\d+/i.test(cols[1]||'') && cols.length>=6);

    // ----- NAMA -----
    let name='';
    if(isInstallExport){
      // OH | Internet xxx | INSTALLATION | PT... | ID | NAMA | alamat | ...
      // atau OH | Internet xxx | INSTALLATION | PT... | ID | NAMA
      for(let i=0;i<cols.length;i++){
        const c=cols[i];
        if(/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'\-\s]{4,60}$/.test(c) &&
           !/INSTALLATION|INDOSAT|INTERNET|HUTCHISON|SYSTEM|CHANGE|TEAM|PERUMAHAN|JALAN|SLOT|ANYTIME|SEAHWAKS|NOKIA|DONE|REGULER|BBB/i.test(c) &&
           !/^PT\b/i.test(c)){
          name=c; break;
        }
      }
      if(!name && cols[5] && !/^\d+$/.test(cols[5])) name=cols[5];
    }else{
      // Format lama: OH 1 | NAMA | ...
      name=cols[1]||'';
      if(/^Internet\s*\d+/i.test(name) || /^INSTALLATION$/i.test(name)) name='';
    }

    // ----- ID -----
    let id='';
    if(isInstallExport){
      // ID numerik 7-15 digit setelah OH/paket/INSTALLATION, sebelum nama
      for(let i=1;i<Math.min(cols.length,10);i++){
        if(/^\d{7,15}$/.test(cols[i]) && !/^62/.test(cols[i])){
          id=cols[i]; break;
        }
      }
    }
    if(!id){
      const slotId=joined.match(/SLOT\s*(?:-\s*\d+|\d+)?\s*\([^)]*\)\s*(\d{7,15})/i);
      if(slotId)id=slotId[1];
    }
    if(!id){
      const slotPos=cols.findIndex(x=>/SLOT\s*(?:-\s*\d+|\d+)?\s*\([^)]*\)/i.test(x)||/^slot-?\s*\d+/i.test(x));
      if(slotPos>=0){
        const after=cols.slice(slotPos+1);
        for(const value of after){
          const m=String(value).match(/^(\d{7,15})(?:\D|$)/);
          if(m){id=m[1];break;}
          if(value)break;
        }
      }
    }
    if(!id){
      const fallback=joined.match(/\)\s*(\d{7,15})(?:\D|$)/);
      if(fallback)id=fallback[1];
    }
    // Cadangan: angka 7-15 digit di baris (bukan OH digits, bukan phone 62)
    if(!id){
      for(const c of cols){
        if(/^\d{7,15}$/.test(c) && !/^62/.test(c) && !/^20\d{10,}$/.test(c)){
          id=c; break;
        }
      }
    }

    // Tanggal fallback dari kolom ISO di baris export (2026-10-07 12:00:00)
    let rowDate=currentDate;
    if(!rowDate || !toIsoDate(rowDate)){
      for(const c of cols){
        const iso=String(c||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
        if(iso){
          rowDate=normalizeReportDate(iso[3]+'/'+iso[2]+'/'+iso[1]);
          break;
        }
        const dmy=String(c||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if(dmy){ rowDate=normalizeReportDate(dmy[0]); break; }
      }
    }

    rows.push({name:name||'',id:id||'',sn:'',precone:'',nominal:getTariff(),done:true,date:rowDate||currentDate});
  }

  // Isi SN dan PRE/CONE berdasarkan blok pelanggan masing-masing.
  current=-1;
  for(const rawLine of lines){
    const first=(rawLine.split('\t')[0]||'').trim();
    if(/^OH\s*\d+/i.test(first))current++;
    if(current<0||!rows[current])continue;
    const gsm=rawLine.match(/^\s*G\s*-?\s*SN\s*[:\-]?\s*([A-Za-z0-9._\/-]+)\s*$/i);
    if(gsm){rows[current].sn=gsm[1].trim();continue;}
    const sm=rawLine.match(/^\s*SN\s*[:\-]?\s*([A-Za-z0-9._\/-]+)\s*$/i);
    if(sm&&!rows[current].sn)rows[current].sn=sm[1].trim();
    // G-SN : ZTEGDE7A7339
    const gsm2=rawLine.match(/^\s*G\s*-?\s*SN\s*[:\-]\s*([A-Za-z0-9._\/-]+)/i);
    if(gsm2){rows[current].sn=gsm2[1].trim();continue;}
    const pm=rawLine.match(/PRE\s*\/?\s*CONE\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i);
    if(pm)rows[current].precone=pm[1].replace(',','.');
    // PRECONE : 100 (tanpa slash)
    const pm2=rawLine.match(/^\s*PRECONE\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i);
    if(pm2)rows[current].precone=pm2[1].replace(',','.');
  }
  return rows;
}

async function generateReport(){
  if(currentProfile?.role==='admin'){swalNotice('Akses dibatasi','Fitur Rekap WO hanya tersedia untuk akun teknisi.','warning');return;}
  const input=document.getElementById('reportInput');
  const status=document.getElementById('reportStatus');
  const button=document.querySelector('#reportInputPanel button[onclick*=\"generateReport\"]');
  const raw=input?.value||'';
  if(!raw.trim()){if(status)status.textContent='Paste report instalasi dulu.';return;}

  try{
    if(status)status.innerHTML='<span class="ok">⏳ Membaca report...</span>';
    if(button){button.disabled=true;button.dataset.originalText=button.textContent;button.textContent='⏳ Memproses...';}

    const rows=extractReportRecords(raw);
    lastReportRows=rows;
    if(!rows.length)throw new Error('Belum menemukan data pelanggan yang diawali OH...');

    const invalid=rows.filter(r=>!r.id||!r.date||!toIsoDate(r.date));
    if(invalid.length){
      const detail=invalid.slice(0,3).map(r=>r.name||'Tanpa nama').join(', ');
      throw new Error(`Tanggal atau ID belum terbaca pada ${invalid.length} WO${detail?' ('+detail+(invalid.length>3?'...':'')+')':''}.`);
    }

    if(status)status.innerHTML='<span class="ok">✓ '+rows.length+' WO terbaca. Menyimpan ke database...</span>';
    const result=await saveRowsToDatabase(rows);
    await loadDatabase();
    if(status)status.innerHTML='<span class="ok">✓ '+result.saved+' WO baru tersimpan'+(result.skipped?' • '+result.skipped+' duplikat dilewati':'')+'.</span>';
    showReportSubTab('database');
    const dbSection=document.getElementById('databaseSection');
    if(dbSection)dbSection.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){
    console.error('Rekap error',e);
    if(status)status.textContent='Rekap gagal: '+(e?.message||e);
    if(typeof swalNotice==='function')swalNotice('Rekap gagal',e?.message||'Data tidak dapat direkap.','error');
  }finally{
    if(button){button.disabled=false;button.textContent=button.dataset.originalText||'⚡ Rekap';}
  }
}

function formatRupiah(n){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n)||0); }

function escapeHtml(s){
  return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

function downloadExcel(){
  const rows=lastReportRows.length?lastReportRows:extractReportRecords(document.getElementById('reportInput').value);
  if(!rows.length){
    document.getElementById('reportStatus').textContent='Rekap belum dibuat. Tekan Rekap dulu.';
    return;
  }
  buildExcelFromData(rows,'Rekap_WO_Done');
  document.getElementById('reportStatus').innerHTML='<span class="ok">✓ File Excel berhasil dibuat dan siap didownload.</span>';
}

function clearReport(){
  lastReportRows=[];
  document.getElementById('reportInput').value='';
  document.getElementById('reportStatus').textContent='';
}

/* ===== V9: Theme, Offline, Skeleton, Target Toast ===== */
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
function checkDailyTargetToast(){
  if(!currentUser||currentProfile?.role==='admin')return;
  const target=getDailyTarget();
  const todayKey=dateKey(new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}).toUpperCase());
  const todayCount=(databaseRows||[]).filter(r=>dateKey(r.date)===todayKey).length;
  if(todayCount>=target){
    swalToast('🔥 Target harian tercapai! '+todayCount+'/'+target+' WO','success');
  }else if(todayCount>0){
    // soft reminder only if already has some WO
    const left=target-todayCount;
    if(left<=2) swalToast('🎯 Tinggal '+left+' WO lagi untuk target hari ini','info');
  }
}

// Hook online/offline
window.addEventListener('online',updateOnlineStatus);
window.addEventListener('offline',updateOnlineStatus);

// Enhance loadDatabase with skeleton + target toast
const _origLoadDatabase=typeof loadDatabase==='function'?loadDatabase:null;
// (loadDatabase already exists; we patch via wrapper after definition is fine since we call it later)

document.addEventListener('DOMContentLoaded',()=>{
  initTheme();
  updateOnlineStatus();
  bootAuth();
});
