// Kurrant TimeOff - Frontend Application
const API = '/api';
const COLORS = ['#FE6B35','#3B82F6','#10B981','#8B5CF6','#F59E0B','#EC4899','#06B6D4','#84CC16','#F97316','#6366F1'];

let S = { user:null, users:[], vacations:[], blackouts:[], activity:[], yearlyStats:null, statsYear:new Date().getFullYear(), notifications:[], tab:'dashboard', month:new Date(), showNotif:false, showPwdModal:false, showFilter:false, showUserHistory:null, showAdminCancelModal:null, showDeclineModal:null, filters:{blackouts:true,myVac:true,team:{}}, loading:true, error:null };

async function api(url, opt={}) {
  try {
    const r = await fetch(API+url, {...opt, headers:{'Content-Type':'application/json',...opt.headers}, credentials:'include'});
    const text = await r.text();
    let d;
    try {
      d = JSON.parse(text);
    } catch(e) {
      throw new Error('Invalid server response');
    }
    if (!r.ok) throw new Error(d.error||'Request failed');
    return d;
  } catch(e) {
    console.error('API Error:', url, e);
    throw e;
  }
}

const color = (id) => COLORS[S.users.findIndex(u=>u.id===id)%COLORS.length];
const parseDate = d => { if(!d)return new Date(); if(d instanceof Date) return d; const parts=String(d).split('T')[0].split('-'); return new Date(parts[0],parts[1]-1,parts[2]); };
const fmt = d => { const p = d instanceof Date ? d : parseDate(d); return p.getFullYear()+'-'+String(p.getMonth()+1).padStart(2,'0')+'-'+String(p.getDate()).padStart(2,'0'); };
const bizDays = (s,e) => { let c=0,d=parseDate(s); const end=parseDate(e); while(d<=end){if(d.getDay()%6)c++;d.setDate(d.getDate()+1)} return c; };
const fmtNice = d => parseDate(d).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'});
const fmtTime = d => new Date(d).toLocaleString('en-US', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
const isBlackout = (d,b) => b.some(x=>parseDate(d)>=parseDate(x.startDate)&&parseDate(d)<=parseDate(x.endDate));
const getBlackoutReason = (d,b) => { const bl = b.find(x=>parseDate(d)>=parseDate(x.startDate)&&parseDate(d)<=parseDate(x.endDate)); return bl ? bl.reason : ''; };
const hasOverlap = (s,e,b) => { let d=parseDate(s); const end=parseDate(e); while(d<=end){if(isBlackout(fmt(d),b))return true;d.setDate(d.getDate()+1)} return false; };
const notify = (m,t='info') => { S.notifications.unshift({id:Date.now(),message:m,type:t,timestamp:new Date(),read:false}); render(); };
const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const isPast = (s,e) => parseDate(e) < parseDate(today());

async function login(email,pwd) {
  try { const d=await api('/auth/login',{method:'POST',body:JSON.stringify({email,password:pwd})}); S.user=d.user; S.error=null; await load(); render(); }
  catch(e) { S.error=e.message; render(); }
}
async function logout() { await api('/auth/logout',{method:'POST'}); S.user=null; S.users=[]; S.vacations=[]; S.blackouts=[]; S.activity=[]; S.yearlyStats=null; render(); }
async function changePwd(cur,neu) { await api('/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword:cur,newPassword:neu})}); S.user.mustChangePassword=false; S.showPwdModal=false; notify('Password changed','success'); }

async function load() {
  const [u,v,b] = await Promise.all([api('/users'),api('/vacations'),api('/blackouts')]);
  S.users=u; S.vacations=v; S.blackouts=b;
  S.filters.team={}; u.forEach(x=>{if(x.id!==S.user?.id)S.filters.team[x.id]=true});
  if(S.user?.role==='admin') {
    try { S.activity = await api('/activity?limit=100'); } catch(e) { S.activity=[]; }
    try { S.yearlyStats = await api('/vacations/stats/yearly?year='+S.statsYear); } catch(e) { S.yearlyStats=null; }
  }
}

async function loadYearlyStats(year) {
  S.statsYear = year;
  try { S.yearlyStats = await api('/vacations/stats/yearly?year='+year); } catch(e) { S.yearlyStats=null; }
  render();
}

async function checkAuth() { 
  try {
    const d = await api('/auth/me');
    S.user = d.user;
    await load();
  } catch(e) {
    console.log('Auth check failed:', e.message);
    S.user = null;
  } finally {
    S.loading = false; 
    render(); 
  }
}

async function createVac(s,e,r) { 
  const d=await api('/vacations',{method:'POST',body:JSON.stringify({startDate:s,endDate:e,reason:r})}); 
  S.vacations.unshift(d); 
  if(d.status === 'pending' && d.requiresApproval) {
    notify('⏳ Request submitted - pending admin approval (blackout period)','warning');
    return { pending: true, message: d.message };
  }
  notify('🏖️ Vacation booked: '+s+' to '+e,'vacation');
  return { pending: false };
}
async function cancelVac(id) { 
  const v = S.vacations.find(x=>x.id===id);
  if(!v) return;
  if(!confirm('Are you sure you want to cancel this vacation?\n\n'+fmtNice(v.startDate)+' → '+fmtNice(v.endDate)+'\n'+v.days+' days\n'+(v.reason||'No reason'))) return;
  await api('/vacations/'+id,{method:'DELETE'}); S.vacations=S.vacations.filter(x=>x.id!==id); notify('Vacation cancelled'); await load(); render(); 
}

function showAdminCancelModal(id) { S.showAdminCancelModal = id; render(); }
function closeAdminCancelModal() { S.showAdminCancelModal = null; render(); }
async function adminCancelVac(id, reason) {
  await api('/vacations/'+id+'/admin-cancel',{method:'POST',body:JSON.stringify({reason})}); 
  S.vacations=S.vacations.filter(x=>x.id!==id); 
  S.showAdminCancelModal = null;
  notify('Vacation cancelled - user notified'); 
  await load(); render(); 
}

// Approve pending vacation (for blackout requests)
async function approveVac(id) {
  if(!confirm('Approve this vacation request during the blackout period?')) return;
  await api('/vacations/'+id+'/approve',{method:'POST'});
  const v = S.vacations.find(x=>x.id===id);
  if(v) v.status = 'approved';
  notify('✅ Vacation approved - user notified','success');
  await load(); render();
}

// Show decline modal
function showDeclineModal(id) { S.showDeclineModal = id; render(); }
function closeDeclineModal() { S.showDeclineModal = null; render(); }
async function declineVac(id, reason) {
  await api('/vacations/'+id+'/decline',{method:'POST',body:JSON.stringify({reason})});
  S.vacations=S.vacations.filter(x=>x.id!==id);
  S.showDeclineModal = null;
  notify('❌ Vacation declined - user notified');
  await load(); render();
}

async function createUser(n,e,r) { const x=await api('/users',{method:'POST',body:JSON.stringify({name:n,email:e,role:r})}); S.users.push(x.user); notify('✅ Account created for '+n+'. Temp password: '+x.tempPassword,'success'); await load(); render(); return x.tempPassword; }
async function toggleRole(id) { 
  const u=S.users.find(x=>x.id===id);
  const newRole = u.role==='admin'?'member':'admin';
  if(!confirm('Are you sure you want to '+(newRole==='admin'?'make':'remove')+' '+u.name+(newRole==='admin'?' an admin':' from admin')+'?')) return;
  await api('/users/'+id+'/role',{method:'PATCH',body:JSON.stringify({role:newRole})}); u.role=newRole; notify(u.name+' is now '+(newRole==='admin'?'an admin':'a member')); await load(); render(); 
}
async function delUser(id) { const u=S.users.find(x=>x.id===id); if(!confirm('⚠️ Delete '+u.name+'?\n\nThis will permanently remove their account and all their vacation history.\n\nThis action cannot be undone.'))return; await api('/users/'+id,{method:'DELETE'}); S.users=S.users.filter(x=>x.id!==id); S.vacations=S.vacations.filter(x=>x.userId!==id); notify('Account deleted: '+u.name); await load(); render(); }

async function createBlackout(s,e,r) { const d=await api('/blackouts',{method:'POST',body:JSON.stringify({startDate:s,endDate:e,reason:r})}); S.blackouts.unshift(d); notify('🚫 Blackout set: '+s+' to '+e,'warning'); await load(); }
async function delBlackout(id) { 
  const b = S.blackouts.find(x=>x.id===id);
  if(!b) return;
  if(!confirm('Are you sure you want to remove this blackout period?\n\n'+fmtNice(b.startDate)+' → '+fmtNice(b.endDate)+'\n'+(b.reason||'No reason'))) return;
  await api('/blackouts/'+id,{method:'DELETE'}); S.blackouts=S.blackouts.filter(x=>x.id!==id); notify('Blackout removed'); await load(); render(); 
}

function showUserVacationHistory(userId) { S.showUserHistory = userId; render(); }
function closeUserHistory() { S.showUserHistory = null; render(); }

function calData() {
  const y=S.month.getFullYear(),m=S.month.getMonth(),f=new Date(y,m,1),l=new Date(y,m+1,0),days=[];
  for(let i=0;i<f.getDay();i++)days.push({day:null,events:[]});
  for(let d=1;d<=l.getDate();d++) {
    const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,ev=[],bl=isBlackout(ds,S.blackouts),blReason=getBlackoutReason(ds,S.blackouts);
    if(bl&&S.filters.blackouts)ev.push({type:'blackout',reason:blReason});
    S.vacations.filter(v=>v.status==='approved').forEach(v=>{if(parseDate(ds)>=parseDate(v.startDate)&&parseDate(ds)<=parseDate(v.endDate)){const my=v.userId===S.user?.id;if(my?S.filters.myVac:S.filters.team[v.userId])ev.push({type:'vacation',label:v.userName,userId:v.userId,my});}});
    days.push({day:d,date:ds,events:ev,isBlackout:bl,blackoutReason:blReason});
  }
  return days;
}

// Get my total days this year (only approved)
function getMyDaysThisYear() {
  const year = new Date().getFullYear();
  return S.vacations.filter(v => v.userId === S.user?.id && v.status === 'approved' && parseDate(v.startDate).getFullYear() === year).reduce((sum,v) => sum + v.days, 0);
}

const actionIcons = {
  'vacation_submitted': '🏖️',
  'vacation_cancelled': '❌',
  'vacation_admin_cancelled': '🚫',
  'vacation_approved': '✅',
  'vacation_declined': '❌',
  'user_created': '👤',
  'user_deleted': '🗑️',
  'user_role_changed': '👑',
  'password_changed': '🔐',
  'blackout_created': '🚫',
  'blackout_deleted': '✅',
  'user_login': '🔓',
  'user_logout': '🔒'
};

function render() {
  const app=document.getElementById('app');
  if(S.loading){app.innerHTML='<div class="loading">Loading...</div>';return;}
  if(!S.user){app.innerHTML=loginHTML();attachLogin();return;}
  if(S.user.mustChangePassword){app.innerHTML=forcePwdHTML();attachPwd(true);return;}
  app.innerHTML=appHTML();attachApp();
}

const loginHTML=()=>`<div class="auth-container"><div class="auth-card"><div class="auth-header"><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" stroke="#FE6B35" stroke-width="3"/><path d="M14 24L22 32L34 18" stroke="#FE6B35" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><h1 class="auth-title">Kurrant TimeOff</h1><p class="auth-subtitle">Team vacation management</p></div>${S.error?`<div class="alert alert-error">${S.error}</div>`:''}<form id="loginForm" class="form"><div class="input-group"><label class="label">Email</label><input type="email" id="loginEmail" class="input" placeholder="you@kurrant.com" required></div><div class="input-group"><label class="label">Password</label><input type="password" id="loginPwd" class="input" placeholder="••••••••" required></div><button type="submit" class="btn btn-primary">Sign In →</button></form></div></div>`;

const forcePwdHTML=()=>`<div class="auth-container"><div class="auth-card"><h1 class="auth-title">Change Password</h1><p class="auth-subtitle">Please set a new password</p><form id="pwdForm" class="form" style="margin-top:24px"><div class="input-group"><label class="label">Current Password</label><input type="password" id="curPwd" class="input" required></div><div class="input-group"><label class="label">New Password</label><input type="password" id="newPwd" class="input" required minlength="6"></div><div class="input-group"><label class="label">Confirm Password</label><input type="password" id="confPwd" class="input" required></div><button type="submit" class="btn btn-primary">Set Password →</button></form></div></div>`;

const headerHTML=()=>{const u=S.notifications.filter(n=>!n.read).length;return`<header class="header"><div class="header-left"><svg width="32" height="32" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" stroke="#FE6B35" stroke-width="3"/><path d="M14 24L22 32L34 18" stroke="#FE6B35" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="logo-text">Kurrant <span>TimeOff</span></span></div><nav class="nav">${[{id:'dashboard',label:'My Vacations'},{id:'calendar',label:'Calendar'},{id:'team',label:'Team'}].map(t=>`<button class="nav-btn ${S.tab===t.id?'active':''}" data-tab="${t.id}">${t.label}</button>`).join('')}${S.user.role==='admin'?`<button class="nav-btn ${S.tab==='admin'?'active':''}" data-tab="admin">Admin</button>`:''}</nav><div class="header-right"><button class="icon-btn" id="notifBtn">🔔${u?`<span class="badge">${u}</span>`:''}</button><div class="user-info"><span class="user-name">${S.user.name}</span><span class="user-role">${S.user.role}</span></div><button class="icon-btn" id="settingsBtn">⚙️</button><button class="logout-btn" id="logoutBtn">Sign Out</button></div></header>`;};

const notifHTML=()=>`<div class="notification-panel"><h3 style="margin:0 0 16px;font-size:16px">Notifications</h3>${S.notifications.length===0?'<p style="color:var(--gray-400)">No notifications</p>':S.notifications.slice(0,10).map(n=>`<div class="notification-item ${n.read?'':'unread'}"><p class="notification-message">${n.message}</p><span class="notification-time">${new Date(n.timestamp).toLocaleString()}</span></div>`).join('')}</div>`;

const pwdModalHTML=()=>`<div class="modal-overlay" id="modalOv"><div class="modal"><h2 class="modal-title">Change Password</h2><form id="pwdForm" class="form"><div class="input-group"><label class="label">Current Password</label><input type="password" id="curPwd" class="input" required></div><div class="input-group"><label class="label">New Password</label><input type="password" id="newPwd" class="input" required minlength="6"></div><div class="input-group"><label class="label">Confirm Password</label><input type="password" id="confPwd" class="input" required></div><div style="display:flex;gap:12px"><button type="button" class="btn btn-secondary" id="cancelPwd">Cancel</button><button type="submit" class="btn btn-primary">Update</button></div></form></div></div>`;

const adminCancelModalHTML=()=>{
  const v = S.vacations.find(x=>x.id===S.showAdminCancelModal);
  if(!v) return '';
  return `<div class="modal-overlay" id="adminCancelModalOv"><div class="modal"><h2 class="modal-title">Cancel Vacation</h2><p style="margin-bottom:16px;color:var(--gray-500)">Cancel <strong>${v.userName}</strong>'s vacation. They will receive an email notification with your reason.</p><div style="background:var(--danger-light);border:1px solid var(--danger-border);border-radius:8px;padding:16px;margin-bottom:20px"><div style="font-weight:600;color:var(--danger)">${fmtNice(v.startDate)} → ${fmtNice(v.endDate)}</div><div style="font-size:14px;color:var(--gray-500);margin-top:4px">${v.days} days • ${v.reason||'No reason provided'}</div></div><form id="adminCancelForm" class="form"><div class="input-group"><label class="label">Reason for cancellation *</label><textarea id="cancelReason" class="input" rows="3" placeholder="Please provide a reason..." required style="resize:vertical"></textarea></div><div style="display:flex;gap:12px"><button type="button" class="btn btn-secondary" id="cancelAdminCancel">Cancel</button><button type="submit" class="btn btn-danger">Confirm Cancellation</button></div></form></div></div>`;
};

const declineModalHTML=()=>{
  const v = S.vacations.find(x=>x.id===S.showDeclineModal);
  if(!v) return '';
  return `<div class="modal-overlay" id="declineModalOv"><div class="modal"><h2 class="modal-title">Decline Vacation Request</h2><p style="margin-bottom:16px;color:var(--gray-500)">Decline <strong>${v.userName}</strong>'s vacation request. They will receive an email notification with your reason.</p><div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin-bottom:20px"><div style="font-weight:600;color:#92400e">${fmtNice(v.startDate)} → ${fmtNice(v.endDate)}</div><div style="font-size:14px;color:var(--gray-500);margin-top:4px">${v.days} days • ${v.reason||'No reason provided'}</div><div style="font-size:12px;color:#92400e;margin-top:8px">⚠️ This request overlaps with a blackout period</div></div><form id="declineForm" class="form"><div class="input-group"><label class="label">Reason for declining *</label><textarea id="declineReason" class="input" rows="3" placeholder="Please explain why this request cannot be approved..." required style="resize:vertical"></textarea></div><div style="display:flex;gap:12px"><button type="button" class="btn btn-secondary" id="cancelDecline">Cancel</button><button type="submit" class="btn btn-danger">Decline Request</button></div></form></div></div>`;
};

const userHistoryModalHTML=()=>{
  const u = S.users.find(x=>x.id===S.showUserHistory);
  if(!u) return '';
  const userVacs = S.vacations.filter(v=>v.userId===u.id).sort((a,b)=>parseDate(b.startDate)-parseDate(a.startDate));
  const upcoming = userVacs.filter(v=>parseDate(v.endDate)>=parseDate(today()));
  const past = userVacs.filter(v=>parseDate(v.endDate)<parseDate(today()));
  return `<div class="modal-overlay" id="historyModalOv"><div class="modal" style="max-width:600px;max-height:80vh;overflow-y:auto"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px"><h2 class="modal-title" style="margin:0;display:flex;align-items:center;gap:12px"><div class="avatar" style="background:${color(u.id)}">${u.name.charAt(0)}</div>${u.name}'s Vacations</h2><button style="background:none;border:none;cursor:pointer;font-size:24px" id="closeHistory">✕</button></div>
  ${upcoming.length?`<div style="margin-bottom:24px"><h3 style="font-size:14px;color:var(--gray-500);margin-bottom:12px">📅 Upcoming (${upcoming.length})</h3>${upcoming.map(v=>`<div class="card" style="margin-bottom:8px"><div class="card-content"><div class="card-title">${fmtNice(v.startDate)} → ${fmtNice(v.endDate)}</div><div class="card-subtitle">${v.reason||'No reason'}</div></div><span style="font-weight:600;color:var(--orange)">${v.days} days</span></div>`).join('')}</div>`:''}
  ${past.length?`<div><h3 style="font-size:14px;color:var(--gray-500);margin-bottom:12px">📜 Past (${past.length})</h3>${past.map(v=>`<div class="card" style="margin-bottom:8px;opacity:0.7"><div class="card-content"><div class="card-title">${fmtNice(v.startDate)} → ${fmtNice(v.endDate)}</div><div class="card-subtitle">${v.reason||'No reason'}</div></div><span style="font-weight:600;color:var(--gray-400)">${v.days} days</span></div>`).join('')}</div>`:''}
  ${userVacs.length===0?'<p class="empty">No vacation history</p>':''}
  <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--gray-200);text-align:center;color:var(--gray-500)">Total: <strong style="color:var(--orange)">${userVacs.reduce((s,v)=>s+v.days,0)} days</strong> across ${userVacs.length} requests</div></div></div>`;
};

const dashHTML=()=>{const myDays=getMyDaysThisYear(),my=S.vacations.filter(v=>v.userId===S.user.id),upcoming=my.filter(v=>parseDate(v.endDate)>=parseDate(today()));return`<div class="stats-grid"><div class="stat-card"><span class="stat-icon">🏖️</span><div><div class="stat-value">${myDays}</div><div class="stat-label">Days Taken (${new Date().getFullYear()})</div></div></div><div class="stat-card"><span class="stat-icon">📅</span><div><div class="stat-value">${upcoming.length}</div><div class="stat-label">Upcoming Vacations</div></div></div><div class="stat-card"><span class="stat-icon">👥</span><div><div class="stat-value">${S.users.length}</div><div class="stat-label">Team Members</div></div></div><div class="stat-card"><span class="stat-icon">🚫</span><div><div class="stat-value">${S.blackouts.length}</div><div class="stat-label">Blackout Periods</div></div></div></div><div class="section"><h2 class="section-title">Request Time Off</h2><form id="vacForm" class="form"><div class="form-row"><div class="input-group"><label class="label">Start Date</label><input type="date" id="vacS" class="input" required></div><div class="input-group"><label class="label">End Date</label><input type="date" id="vacE" class="input" required></div></div><div class="input-group"><label class="label">Reason</label><input type="text" id="vacR" class="input" placeholder="Family vacation, etc." required></div><div id="vacPrev"></div><button type="submit" class="btn btn-primary" id="vacSubmitBtn">Submit Request</button></form></div><div class="section"><h2 class="section-title">My Time Off</h2>${my.length===0?'<p class="empty">No vacation requests yet</p>':my.map(v=>`<div class="card ${v.status==='pending'?'card-pending':''}${v.status==='rejected'?'card-rejected':''}"><div class="card-content"><div class="card-title">${fmt(v.startDate)} → ${fmt(v.endDate)} ${v.status==='pending'?'<span class="badge-pending">⏳ Pending Approval</span>':''}${v.status==='rejected'?'<span class="badge-rejected">❌ Declined</span>':''}</div><div class="card-subtitle">${v.reason}</div><div class="card-meta">${v.days} days${v.status==='rejected'&&v.declineReason?' • <span style="color:var(--danger)">Reason: '+v.declineReason+'</span>':''}</div></div>${v.status!=='rejected'?`<button class="btn btn-cancel" onclick="cancelVac(${v.id})">Cancel</button>`:''}</div>`).join('')}</div>${S.blackouts.length?`<div class="section"><h2 class="section-title">🚫 Blackout Periods</h2><p style="color:var(--gray-500);font-size:14px;margin-bottom:16px">These dates require admin approval</p>${S.blackouts.map(b=>`<div class="blackout-card"><div class="blackout-title">${fmt(b.startDate)} → ${fmt(b.endDate)}</div><div style="font-size:14px;color:var(--gray-500);margin-top:4px"><strong>Reason:</strong> ${b.reason||'No reason specified'}</div></div>`).join('')}</div>`:''}`};

const calHTML=()=>{const cd=calData(),mn=S.month.toLocaleString('default',{month:'long',year:'numeric'}),af=Object.values(S.filters.team).filter(Boolean).length+(S.filters.myVac?1:0)+(S.filters.blackouts?1:0);return`<div class="section"><div class="calendar-header"><button class="btn btn-secondary" id="prevM">← Prev</button><h2 class="calendar-title">${mn}</h2><button class="btn btn-secondary" id="nextM">Next →</button></div><button class="filter-btn" id="filterBtn">🔍 Filter Calendar <span class="filter-badge">${af}</span></button>${S.showFilter?filterHTML():''}<div class="legend">${S.filters.blackouts?'<span class="legend-item"><span class="legend-dot" style="background:var(--danger)"></span> Blackout</span>':''}${S.filters.myVac?'<span class="legend-item"><span class="legend-dot" style="background:var(--orange)"></span> My Vacation</span>':''}${S.users.filter(u=>u.id!==S.user.id&&S.filters.team[u.id]).map(u=>`<span class="legend-item"><span class="legend-dot" style="background:${color(u.id)}"></span> ${u.name.split(' ')[0]}</span>`).join('')}</div><div class="calendar-grid">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="calendar-day-header">${d}</div>`).join('')}${cd.map(d=>`<div class="calendar-day ${d.day===null?'empty':''} ${d.isBlackout&&S.filters.blackouts?'blackout':''}" ${d.isBlackout&&d.blackoutReason?`title="🚫 Blackout: ${d.blackoutReason}"`:''}>${d.day?`<span class="day-number">${d.day}</span><div class="day-events">${d.events.filter(e=>e.type!=='blackout').map(e=>`<div class="event-dot" style="background:${color(e.userId)};${e.my?'border:2px solid #fff;box-shadow:0 0 0 2px var(--orange);':''}" title="${e.label}">${e.label.charAt(0)}</div>`).join('')}</div>`:''}</div>`).join('')}</div></div>`};

const filterHTML=()=>`<div class="filter-panel"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h3 style="margin:0">Filters</h3><button style="background:none;border:none;cursor:pointer;font-size:18px" id="closeFilter">✕</button></div><div class="filter-group"><div class="filter-group-title">General</div><label class="filter-item"><input type="checkbox" id="fBlack" ${S.filters.blackouts?'checked':''}><span class="filter-dot" style="background:var(--danger)"></span> Blackout Dates</label><label class="filter-item"><input type="checkbox" id="fMy" ${S.filters.myVac?'checked':''}><span class="filter-dot" style="background:var(--orange)"></span> My Vacation</label></div><div class="filter-group"><div style="display:flex;justify-content:space-between;align-items:center"><span class="filter-group-title">Team Members</span><div><button class="btn btn-small btn-secondary" id="fAll">All</button> <button class="btn btn-small btn-secondary" id="fNone">None</button></div></div>${S.users.filter(u=>u.id!==S.user.id).map(u=>`<label class="filter-item"><input type="checkbox" class="fTeam" data-id="${u.id}" ${S.filters.team[u.id]?'checked':''}><span class="filter-dot" style="background:${color(u.id)}"></span> ${u.name}</label>`).join('')}</div></div>`;

const teamHTML=()=>{const up=S.vacations.filter(v=>v.status==='approved'&&parseDate(v.endDate)>=parseDate(today())).sort((a,b)=>parseDate(a.startDate)-parseDate(b.startDate));return`<h2 class="section-title">Team Members</h2><div class="team-grid">${S.users.map(u=>`<div class="team-card"><div class="avatar" style="background:${color(u.id)}">${u.name.charAt(0)}</div><div><div style="font-weight:600;display:flex;align-items:center;gap:8px">${u.name} ${u.id===S.user.id?'<span class="badge-you">You</span>':''}</div><div style="font-size:13px;color:var(--gray-500)">${u.role==='admin'?'<span class="badge-admin">Admin</span>':''}${u.email}</div></div></div>`).join('')}</div><h2 class="section-title" style="margin-top:32px">Upcoming Time Off</h2>${up.length===0?'<p class="empty">No upcoming vacations</p>':up.map(v=>`<div class="card"><div class="avatar avatar-sm" style="background:${color(v.userId)}">${v.userName.charAt(0)}</div><div class="card-content"><div class="card-title" style="display:flex;align-items:center;gap:8px">${v.userName} ${v.userId===S.user.id?'<span class="badge-you">You</span>':''}</div><div class="card-subtitle">${fmt(v.startDate)} → ${fmt(v.endDate)}</div><div class="card-meta">${v.reason}</div></div><div style="font-weight:600;color:var(--orange)">${v.days} days</div></div>`).join('')}`};

const yearlyStatsHTML=()=>{const years=[S.statsYear-2,S.statsYear-1,S.statsYear,S.statsYear+1];return`<div class="section"><h2 class="section-title">📊 Yearly Vacation Report</h2><div style="display:flex;gap:8px;margin-bottom:20px">${years.map(y=>`<button class="btn ${y===S.statsYear?'btn-primary':'btn-secondary'}" onclick="loadYearlyStats(${y})">${y}</button>`).join('')}</div>${S.yearlyStats?`<table style="width:100%;border-collapse:collapse"><thead><tr style="background:var(--gray-100)"><th style="padding:12px;text-align:left;border-bottom:2px solid var(--gray-200)">Employee</th><th style="padding:12px;text-align:center;border-bottom:2px solid var(--gray-200)">Days Taken</th><th style="padding:12px;text-align:center;border-bottom:2px solid var(--gray-200)">Requests</th></tr></thead><tbody>${S.yearlyStats.stats.map(s=>`<tr><td style="padding:12px;border-bottom:1px solid var(--gray-200)"><div style="display:flex;align-items:center;gap:12px"><div class="avatar avatar-sm" style="background:${color(s.userId)}">${s.userName.charAt(0)}</div><div><div style="font-weight:600">${s.userName}</div><div style="font-size:12px;color:var(--gray-500)">${s.email}</div></div></div></td><td style="padding:12px;text-align:center;border-bottom:1px solid var(--gray-200);font-weight:600;font-size:18px;color:var(--orange)">${s.totalDays}</td><td style="padding:12px;text-align:center;border-bottom:1px solid var(--gray-200);color:var(--gray-500)">${s.totalRequests}</td></tr>`).join('')}</tbody></table><div style="margin-top:16px;padding:16px;background:var(--gray-50);border-radius:8px;text-align:center"><strong>Total Team Days:</strong> ${S.yearlyStats.stats.reduce((sum,s)=>sum+s.totalDays,0)} days in ${S.statsYear}</div>`:'<p class="empty">Loading stats...</p>'}</div>`};

const activityHTML=()=>`<div class="section"><h2 class="section-title">📜 Activity Log</h2><p style="color:var(--gray-500);font-size:14px;margin-bottom:16px">All actions are tracked and timestamped</p>${S.activity.length===0?'<p class="empty">No activity yet</p>':`<div style="max-height:400px;overflow-y:auto">${S.activity.map(a=>`<div class="activity-item"><span class="activity-icon">${actionIcons[a.action]||'📝'}</span><div class="activity-content"><div class="activity-desc">${a.description}</div><div class="activity-meta">by ${a.userName} • ${fmtTime(a.createdAt)}</div></div></div>`).join('')}</div>`}</div>`;

const pendingApprovalsHTML=()=>{
  const pending = S.vacations.filter(v=>v.status==='pending'&&v.requiresApproval);
  if(pending.length === 0) return '';
  return `<div class="section" style="border:2px solid #fcd34d;background:#fffbeb"><h2 class="section-title" style="color:#92400e">⏳ Pending Approvals (${pending.length})</h2><p style="color:#92400e;font-size:14px;margin-bottom:16px">These vacation requests overlap with blackout periods and require your approval.</p>${pending.map(v=>`<div class="card" style="background:#fff"><div class="avatar avatar-sm" style="background:${color(v.userId)}">${v.userName.charAt(0)}</div><div class="card-content"><div class="card-title">${v.userName}</div><div class="card-subtitle">${fmtNice(v.startDate)} → ${fmtNice(v.endDate)}</div><div class="card-meta">${v.days} days • ${v.reason||'No reason'}</div></div><div style="display:flex;gap:8px"><button class="btn btn-approve" onclick="approveVac(${v.id})">✅ Approve</button><button class="btn btn-decline" onclick="showDeclineModal(${v.id})">❌ Decline</button></div></div>`).join('')}</div>`;
};

const upcomingVacationsHTML=()=>{
  const upcoming = S.vacations.filter(v=>v.status==='approved'&&parseDate(v.endDate)>=parseDate(today())).sort((a,b)=>parseDate(a.startDate)-parseDate(b.startDate));
  return `<div class="section"><h2 class="section-title">📅 Upcoming Vacations</h2>${upcoming.length===0?'<p class="empty">No upcoming vacations</p>':upcoming.map(v=>`<div class="card"><div class="avatar avatar-sm" style="background:${color(v.userId)}">${v.userName.charAt(0)}</div><div class="card-content"><div class="card-title">${v.userName}</div><div class="card-subtitle">${fmtNice(v.startDate)} → ${fmtNice(v.endDate)}</div><div class="card-meta">${v.reason}</div></div><div style="display:flex;align-items:center;gap:12px"><span style="font-weight:600;color:var(--orange)">${v.days} days</span><button class="btn btn-cancel" onclick="showAdminCancelModal(${v.id})">Cancel</button></div></div>`).join('')}</div>`;
};

const adminHTML=()=>`${pendingApprovalsHTML()}<div class="section"><h2 class="section-title">➕ Create New User</h2><form id="userForm" class="form"><div class="form-row"><div class="input-group"><label class="label">Full Name</label><input type="text" id="newN" class="input" placeholder="John Doe" required></div><div class="input-group"><label class="label">Email</label><input type="email" id="newE" class="input" placeholder="john@kurrant.com" required></div></div><div class="input-group"><label class="label">Role</label><select id="newR" class="input"><option value="member">Team Member</option><option value="admin">Admin</option></select></div><button type="submit" class="btn btn-primary">Create Account</button></form></div><div class="section"><h2 class="section-title">🚫 Set Blackout Dates</h2><form id="blackForm" class="form"><div class="form-row"><div class="input-group"><label class="label">Start Date</label><input type="date" id="blackS" class="input" required></div><div class="input-group"><label class="label">End Date</label><input type="date" id="blackE" class="input" required></div></div><div class="input-group"><label class="label">Reason *</label><input type="text" id="blackR" class="input" placeholder="Smart City Expo, etc." required></div><div id="blackPrev"></div><button type="submit" class="btn btn-danger">Set Blackout</button></form>${S.blackouts.length?`<div style="margin-top:24px"><h3 style="font-size:15px;margin-bottom:12px">Active Blackouts</h3>${S.blackouts.map(b=>`<div class="blackout-card" style="display:flex;justify-content:space-between;align-items:center"><div><div class="blackout-title">${fmt(b.startDate)} → ${fmt(b.endDate)}</div><div style="font-size:14px;color:var(--gray-500);margin-top:4px"><strong>Reason:</strong> ${b.reason||'No reason specified'}</div></div><button class="btn btn-danger" onclick="delBlackout(${b.id})">Remove</button></div>`).join('')}</div>`:''}</div>${upcomingVacationsHTML()}${yearlyStatsHTML()}<div class="section"><h2 class="section-title">👥 Manage Team</h2><p style="color:var(--gray-500);font-size:14px;margin-bottom:16px">Click on a user to view their full vacation history</p>${S.users.map(u=>{const userDays=S.vacations.filter(v=>v.userId===u.id&&v.status==='approved'&&parseDate(v.startDate).getFullYear()===new Date().getFullYear()).reduce((s,v)=>s+v.days,0);return`<div class="manage-card" style="cursor:pointer" onclick="showUserVacationHistory(${u.id})"><div style="display:flex;align-items:center;gap:16px"><div class="avatar" style="background:${color(u.id)}">${u.name.charAt(0)}</div><div><div style="font-weight:600">${u.name}</div><div style="font-size:13px;color:var(--gray-500)">${u.email}</div><div style="font-size:12px;color:var(--orange);margin-top:2px">${userDays} days this year</div></div></div><div class="manage-actions" onclick="event.stopPropagation()"><span style="color:var(--gray-500)">${u.role==='admin'?'👑 Admin':'👤 Member'}</span>${u.id!==S.user.id?`<button class="btn btn-secondary" onclick="toggleRole(${u.id})">${u.role==='admin'?'Remove Admin':'Make Admin'}</button><button class="btn btn-cancel" onclick="delUser(${u.id})">Delete</button>`:''}</div></div>`;}).join('')}</div>${activityHTML()}`;

const appHTML=()=>`${headerHTML()}${S.showNotif?notifHTML():''}${S.showPwdModal?pwdModalHTML():''}${S.showUserHistory?userHistoryModalHTML():''}${S.showAdminCancelModal?adminCancelModalHTML():''}${S.showDeclineModal?declineModalHTML():''}<main class="main">${S.tab==='dashboard'?dashHTML():''}${S.tab==='calendar'?calHTML():''}${S.tab==='team'?teamHTML():''}${S.tab==='admin'&&S.user.role==='admin'?adminHTML():''}</main>`;

function attachLogin(){document.getElementById('loginForm')?.addEventListener('submit',async e=>{e.preventDefault();await login(document.getElementById('loginEmail').value,document.getElementById('loginPwd').value);});}

function attachPwd(force=false){document.getElementById('pwdForm')?.addEventListener('submit',async e=>{e.preventDefault();const c=document.getElementById('curPwd').value,n=document.getElementById('newPwd').value,cf=document.getElementById('confPwd').value;if(n!==cf){alert('Passwords do not match');return;}try{await changePwd(c,n);render();}catch(err){alert(err.message);}});document.getElementById('cancelPwd')?.addEventListener('click',()=>{S.showPwdModal=false;render();});document.getElementById('modalOv')?.addEventListener('click',e=>{if(e.target.id==='modalOv'){S.showPwdModal=false;render();}});}

function attachApp(){
  document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>{S.tab=b.dataset.tab;render();}));
  document.getElementById('notifBtn')?.addEventListener('click',()=>{S.showNotif=!S.showNotif;if(S.showNotif)S.notifications.forEach(n=>n.read=true);render();});
  document.getElementById('settingsBtn')?.addEventListener('click',()=>{S.showPwdModal=true;render();});
  document.getElementById('logoutBtn')?.addEventListener('click',logout);
  document.getElementById('closeHistory')?.addEventListener('click',closeUserHistory);
  document.getElementById('historyModalOv')?.addEventListener('click',e=>{if(e.target.id==='historyModalOv')closeUserHistory();});
  if(S.showPwdModal)attachPwd();
  
  // Admin cancel modal handlers
  document.getElementById('cancelAdminCancel')?.addEventListener('click',closeAdminCancelModal);
  document.getElementById('adminCancelModalOv')?.addEventListener('click',e=>{if(e.target.id==='adminCancelModalOv')closeAdminCancelModal();});
  document.getElementById('adminCancelForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const reason = document.getElementById('cancelReason').value;
    if(!reason.trim()){alert('Please provide a reason for cancellation');return;}
    try{ await adminCancelVac(S.showAdminCancelModal, reason); }catch(err){alert(err.message);}
  });
  
  // Decline modal handlers
  document.getElementById('cancelDecline')?.addEventListener('click',closeDeclineModal);
  document.getElementById('declineModalOv')?.addEventListener('click',e=>{if(e.target.id==='declineModalOv')closeDeclineModal();});
  document.getElementById('declineForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const reason = document.getElementById('declineReason').value;
    if(!reason.trim()){alert('Please provide a reason for declining');return;}
    try{ await declineVac(S.showDeclineModal, reason); }catch(err){alert(err.message);}
  });
  
  if(S.tab==='dashboard'){
    const vs=document.getElementById('vacS'),ve=document.getElementById('vacE'),vp=document.getElementById('vacPrev');
    
    // When start date changes, set min for end date
    vs?.addEventListener('change',()=>{
      if(vs.value){
        ve.min = vs.value;
        // If end date is before start date, clear it
        if(ve.value && ve.value < vs.value){
          ve.value = '';
        }
      }
      updatePreview();
    });
    
    ve?.addEventListener('change',updatePreview);
    
    function updatePreview(){
      if(vs?.value&&ve?.value){
        // Check if end date is before start date
        if(ve.value < vs.value){
          vp.innerHTML='<div class="preview preview-error">⚠️ End date cannot be before start date!</div>';
          return;
        }
        const ov=hasOverlap(vs.value,ve.value,S.blackouts);
        const d=bizDays(vs.value,ve.value);
        const past=isPast(vs.value,ve.value);
        let html = '';
        if(ov){
          html='<div class="preview preview-warning">⚠️ Overlaps with blackout period - will require admin approval</div>';
        } else if(past){
          html=`<div class="preview preview-warning">⚠️ These dates are in the past. This will use ${d} business days.</div>`;
        } else {
          html=`<div class="preview preview-info">This will use ${d} business days</div>`;
        }
        vp.innerHTML=html;
      }
    }
    
    document.getElementById('vacForm')?.addEventListener('submit',async e=>{
      e.preventDefault();
      const startVal = vs.value;
      const endVal = ve.value;
      const reason = document.getElementById('vacR').value;
      
      // Validate end date >= start date
      if(endVal < startVal){
        alert('End date cannot be before start date!');
        return;
      }
      
      // Check if dates are in the past
      if(isPast(startVal, endVal)){
        const proceed = confirm('⚠️ These dates are in the past.\n\nAre you sure you want to submit this vacation request?');
        if(!proceed) return;
      }
      
      // Check if overlaps with blackout - warn user
      if(hasOverlap(startVal, endVal, S.blackouts)){
        const proceed = confirm('⚠️ These dates overlap with a blackout period.\n\nYour request will require admin approval. Do you want to continue?');
        if(!proceed) return;
      }
      
      try{
        const result = await createVac(startVal,endVal,reason);
        if(result.pending) {
          alert('✅ Request Submitted\n\n' + result.message);
        }
        await load();
        render();
      }catch(err){alert(err.message);}
    });
  }
  
  if(S.tab==='calendar'){
    document.getElementById('prevM')?.addEventListener('click',()=>{S.month=new Date(S.month.getFullYear(),S.month.getMonth()-1);render();});
    document.getElementById('nextM')?.addEventListener('click',()=>{S.month=new Date(S.month.getFullYear(),S.month.getMonth()+1);render();});
    document.getElementById('filterBtn')?.addEventListener('click',()=>{S.showFilter=!S.showFilter;render();});
    document.getElementById('closeFilter')?.addEventListener('click',()=>{S.showFilter=false;render();});
    document.getElementById('fBlack')?.addEventListener('change',e=>{S.filters.blackouts=e.target.checked;render();});
    document.getElementById('fMy')?.addEventListener('change',e=>{S.filters.myVac=e.target.checked;render();});
    document.getElementById('fAll')?.addEventListener('click',()=>{S.users.forEach(u=>{if(u.id!==S.user.id)S.filters.team[u.id]=true;});render();});
    document.getElementById('fNone')?.addEventListener('click',()=>{S.users.forEach(u=>{if(u.id!==S.user.id)S.filters.team[u.id]=false;});render();});
    document.querySelectorAll('.fTeam').forEach(cb=>cb.addEventListener('change',e=>{S.filters.team[+e.target.dataset.id]=e.target.checked;render();}));
  }
  
  if(S.tab==='admin'){
    document.getElementById('userForm')?.addEventListener('submit',async e=>{
      e.preventDefault();
      try{
        const tp=await createUser(document.getElementById('newN').value,document.getElementById('newE').value,document.getElementById('newR').value);
        alert('User created!\nTemp password: '+tp+'\n\nA welcome email has been sent.');
        e.target.reset();
      }catch(err){alert(err.message);}
    });
    
    const bs=document.getElementById('blackS'),be=document.getElementById('blackE'),bp=document.getElementById('blackPrev');
    bs?.addEventListener('change',()=>{
      if(bs.value){
        be.min = bs.value;
        if(be.value && be.value < bs.value){ be.value = ''; }
      }
      updateBlackoutPreview();
    });
    be?.addEventListener('change',updateBlackoutPreview);
    function updateBlackoutPreview(){
      if(bs?.value&&be?.value){
        if(be.value < bs.value){ bp.innerHTML='<div class="preview preview-error">⚠️ End date cannot be before start date!</div>'; }
        else { bp.innerHTML=''; }
      }
    }
    
    document.getElementById('blackForm')?.addEventListener('submit',async e=>{
      e.preventDefault();
      const startVal=document.getElementById('blackS').value;
      const endVal=document.getElementById('blackE').value;
      if(endVal < startVal){
        alert('End date cannot be before start date!');
        return;
      }
      try{
        await createBlackout(startVal,endVal,document.getElementById('blackR').value);
        render();
      }catch(err){alert(err.message);}
    });
  }
}

window.cancelVac=cancelVac;window.delBlackout=delBlackout;window.toggleRole=toggleRole;window.delUser=delUser;window.loadYearlyStats=loadYearlyStats;window.showUserVacationHistory=showUserVacationHistory;window.closeUserHistory=closeUserHistory;window.showAdminCancelModal=showAdminCancelModal;window.closeAdminCancelModal=closeAdminCancelModal;window.approveVac=approveVac;window.showDeclineModal=showDeclineModal;window.closeDeclineModal=closeDeclineModal;
checkAuth();
