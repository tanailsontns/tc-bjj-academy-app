// TC BJJ Academy App (estático) - funciona na Vercel
const $ = (id) => document.getElementById(id);

let supabase = null;
let currentUser = null;

function loadSupabaseFromStorage() {
  const url = localStorage.getItem("SB_URL");
  const key = localStorage.getItem("SB_KEY");
  if (url && key) {
    supabase = window.supabase.createClient(url, key);
    return true;
  }
  return false;
}

function show(el, yes=true){ el.classList.toggle('hidden', !yes); }

function toast(el, msg){ el.textContent = msg || ""; }

function activateTab(tabId){
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tabPanel').forEach(p=>p.classList.add('hidden'));
  const btn = document.querySelector(`.tab[data-tab="${tabId}"]`);
  if(btn) btn.classList.add('active');
  const panel = document.getElementById(tabId);
  if(panel) panel.classList.remove('hidden');
}

async function ensureProfile() {
  if(!currentUser) return;
  const { data, error } = await supabase.from('tc_profiles').select('*').eq('user_id', currentUser.id).maybeSingle();
  if(error) return;
  if(!data){
    await supabase.from('tc_profiles').insert({ user_id: currentUser.id, role: 'student' });
  }
}

async function loadProfileUI(){
  const { data } = await supabase.from('tc_profiles').select('*').eq('user_id', currentUser.id).maybeSingle();
  if(!data) return;
  $('fullName').value = data.full_name || '';
  $('phone').value = data.phone || '';
  $('belt').value = data.belt || '';
  if(data.avatar_url){
    $('avatarPreview').src = data.avatar_url;
  }
  // Admin gate
  const isAdmin = (data.role === 'admin');
  show($('adminPanel'), isAdmin);
  show($('adminLocked'), !isAdmin);
}

async function saveProfile(){
  toast($('profileMsg'), 'Salvando...');
  const full_name = $('fullName').value.trim();
  const phone = $('phone').value.trim();
  const belt = $('belt').value.trim();

  let avatar_url = null;

  const file = $('avatarFile').files?.[0];
  if(file){
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `${currentUser.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert:true });
    if(upErr){
      toast($('profileMsg'), 'Erro ao enviar foto: ' + upErr.message);
      return;
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    avatar_url = data.publicUrl;
    $('avatarPreview').src = avatar_url;
  }

  const payload = { full_name, phone, belt };
  if(avatar_url) payload.avatar_url = avatar_url;

  const { error } = await supabase.from('tc_profiles').update(payload).eq('user_id', currentUser.id);
  if(error){
    toast($('profileMsg'), 'Erro ao salvar: ' + error.message);
    return;
  }
  toast($('profileMsg'), 'Perfil atualizado ✅');
  await loadProfileUI();
}

async function loadSchedules(){
  const { data, error } = await supabase.from('tc_schedules').select('*').order('sort_key', { ascending:true });
  if(error){
    $('agendaList').innerHTML = `<div class="msg warn">Erro ao carregar horários: ${error.message}</div>`;
    return;
  }
  if(!data?.length){
    $('agendaList').innerHTML = `<div class="item"><div class="muted">Nenhum horário cadastrado ainda.</div></div>`;
    return;
  }

  const list = data.map(s => {
    return `<div class="item">
      <div class="toprow">
        <div><b>${s.day_of_week}</b> • ${s.time} — ${s.class_name}</div>
        <span class="badge">Aula</span>
      </div>
      <div class="row mt">
        <button class="secondary" onclick="confirmAttendance('${s.id}')">Confirmar presença</button>
      </div>
    </div>`;
  }).join('');
  $('agendaList').innerHTML = list;

  // Admin list too
  $('adminSchedules').innerHTML = data.map(s => `
    <div class="item">
      <div class="toprow">
        <div><b>${s.day_of_week}</b> • ${s.time} — ${s.class_name}</div>
        <span class="badge ok">OK</span>
      </div>
      <div class="row mt">
        <button class="secondary" onclick="deleteSchedule('${s.id}')">Excluir</button>
      </div>
    </div>
  `).join('');
}

window.confirmAttendance = async function(scheduleId){
  const date = new Date().toISOString().slice(0,10);
  const { error } = await supabase.from('tc_attendance')
    .upsert({ user_id: currentUser.id, schedule_id: scheduleId, date, present:true }, { onConflict: 'user_id,schedule_id,date' });
  if(error){
    alert('Erro: ' + error.message);
    return;
  }
  alert('Presença confirmada ✅');
}

async function sendReceipt(){
  const file = $('receiptFile').files?.[0];
  if(!file){ toast($('payMsg'), 'Selecione o comprovante.'); return; }
  toast($('payMsg'), 'Enviando...');
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `${currentUser.id}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from('receipts').upload(path, file, { upsert:false });
  if(upErr){ toast($('payMsg'), 'Erro ao enviar: ' + upErr.message); return; }
  const { data } = supabase.storage.from('receipts').getPublicUrl(path);
  const receipt_url = data.publicUrl;

  const { error } = await supabase.from('tc_payments').insert({
    user_id: currentUser.id,
    method: 'pix',
    pix_key: 'tanailsoncavalcante@gmail.com',
    receipt_url,
    status: 'pending'
  });
  if(error){ toast($('payMsg'), 'Erro ao registrar pagamento: ' + error.message); return; }
  toast($('payMsg'), 'Comprovante enviado ✅ (aguardando aprovação)');
}

async function createSchedule(){
  toast($('adminMsg'), '');
  const day_of_week = $('dayOfWeek').value;
  const time = $('time').value.trim();
  const class_name = $('className').value.trim();
  if(!time || !class_name){ toast($('adminMsg'), 'Preencha hora e turma.'); return; }

  const sort_key = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'].indexOf(day_of_week) * 10000 + (parseInt(time.replace(':',''))||0);

  const { error } = await supabase.from('tc_schedules').insert({ day_of_week, time, class_name, sort_key });
  if(error){ toast($('adminMsg'), 'Erro: ' + error.message); return; }
  $('time').value = '';
  $('className').value = '';
  toast($('adminMsg'), 'Horário adicionado ✅');
  await loadSchedules();
}

window.deleteSchedule = async function(id){
  const ok = confirm('Excluir este horário?');
  if(!ok) return;
  const { error } = await supabase.from('tc_schedules').delete().eq('id', id);
  if(error){ alert('Erro: ' + error.message); return; }
  await loadSchedules();
}

async function onLoggedIn(){
  show($('authSection'), false);
  show($('setupSection'), false);
  show($('appSection'), true);

  await ensureProfile();
  await loadProfileUI();
  await loadSchedules();
}

async function init(){
  // Tabs
  document.querySelectorAll('.tab').forEach(btn=>{
    btn.addEventListener('click', ()=> activateTab(btn.dataset.tab));
  });

  // Setup
  $('saveSb').addEventListener('click', async ()=>{
    const url = $('sbUrl').value.trim();
    const key = $('sbKey').value.trim();
    if(!url || !key){ toast($('setupMsg'), 'Cole a URL e a chave publicável.'); return; }
    localStorage.setItem('SB_URL', url);
    localStorage.setItem('SB_KEY', key);
    toast($('setupMsg'), 'Salvo ✅');
    // Create client and go auth
    supabase = window.supabase.createClient(url, key);
    show($('setupSection'), false);
    show($('authSection'), true);
  });

  // Auth
  $('btnLogin').addEventListener('click', async ()=>{
    toast($('authMsg'), 'Entrando...');
    const email = $('email').value.trim();
    const password = $('password').value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if(error){ toast($('authMsg'), 'Erro: ' + error.message); return; }
    currentUser = data.user;
    toast($('authMsg'), '');
    await onLoggedIn();
  });

  $('btnSignup').addEventListener('click', async ()=>{
    toast($('authMsg'), 'Criando conta...');
    const email = $('email').value.trim();
    const password = $('password').value;
    const { data, error } = await supabase.auth.signUp({ email, password });
    if(error){ toast($('authMsg'), 'Erro: ' + error.message); return; }
    currentUser = data.user;
    toast($('authMsg'), 'Conta criada ✅ Agora faça login.');
  });

  $('btnLogout').addEventListener('click', async ()=>{
    await supabase.auth.signOut();
    location.reload();
  });

  $('saveProfile').addEventListener('click', saveProfile);
  $('sendReceipt').addEventListener('click', sendReceipt);
  $('createSchedule').addEventListener('click', createSchedule);

  // Boot
  if(loadSupabaseFromStorage()){
    show($('setupSection'), false);
    show($('authSection'), true);
    $('sbUrl').value = localStorage.getItem('SB_URL') || '';
    $('sbKey').value = localStorage.getItem('SB_KEY') || '';
  } else {
    show($('setupSection'), true);
    show($('authSection'), false);
  }
}

window.addEventListener('load', init);
