const enc = new TextEncoder();
const dec = new TextDecoder();
let VAULT = null;
let CURRENT_KEY = null;
let CURRENT_META = null;

function b64ToBytes(b){const s=atob(b);const a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a;}
function bytesToB64(a){let s="";a.forEach(b=>s+=String.fromCharCode(b));return btoa(s);}

async function deriveKey(pin, salt){
  const mat = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2", salt:salt, iterations:310000, hash:"SHA-256"}, mat, {name:"AES-GCM", length:256}, false, ["decrypt","encrypt"]);
}

async function unlock(){
  const pin = document.getElementById("pin").value.trim();
  const err = document.getElementById("lock-error");
  if(!/^\d{6}$/.test(pin)){ err.textContent = "Enter all 6 digits."; return; }
  try{
    const res = await fetch("data/vault.enc?ts="+Date.now(), {cache:"no-store"});
    if(!res.ok) throw new Error("vault file missing");
    const meta = await res.json();
    const salt = b64ToBytes(meta.salt), iv = b64ToBytes(meta.iv), ct = b64ToBytes(meta.ct);
    const key = await deriveKey(pin, salt);
    const plain = await crypto.subtle.decrypt({name:"AES-GCM", iv:iv}, key, ct);
    VAULT = JSON.parse(dec.decode(plain));
    CURRENT_KEY = key; CURRENT_META = meta;
    err.textContent = "";
    document.getElementById("lock").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    render();
  }catch(e){
    err.textContent = "Wrong PIN, or the vault is unreadable.";
  }
}

function lockSite(){
  VAULT = null; CURRENT_KEY = null; CURRENT_META = null;
  document.getElementById("pin").value = "";
  document.getElementById("app").classList.add("hidden");
  document.getElementById("lock").classList.remove("hidden");
}

document.getElementById("pin").addEventListener("keydown", e=>{ if(e.key==="Enter") unlock(); });

function sign(lon){ return window.SIGNS[Math.floor(((lon%360)+360)%360/30)]; }
function degInSign(lon){ return (((lon%360)+360)%360 % 30).toFixed(1); }

function greeting(){
  const h = new Date().getHours();
  const g = h<12 ? "Good morning" : h<18 ? "Good afternoon" : "Good evening";
  document.getElementById("greeting").textContent = g + ", Clarissa";
  document.getElementById("today").textContent = new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
}

function renderNatal(){
  const n = window.NATAL;
  document.getElementById("natal").innerHTML = [
    `<span class="chip"><b>Sun</b> ${sign(n.sun.lon)} ${degInSign(n.sun.lon)}&deg;</span>`,
    `<span class="chip"><b>Moon</b> ${sign(n.moon.lon)} ${degInSign(n.moon.lon)}&deg;</span>`,
    `<span class="chip"><b>Rising</b> ${sign(n.ascendant.lon)} ${degInSign(n.ascendant.lon)}&deg;</span>`,
    `<span class="chip"><b>Mercury</b> ${sign(n.mercury.lon)}&deg;</span>`,
    `<span class="chip"><b>Venus</b> ${sign(n.venus.lon)}&deg;</span>`,
    `<span class="chip"><b>Mars</b> ${sign(n.mars.lon)}&deg;</span>`,
    `<span class="chip"><b>MC</b> ${sign(n.midheaven.lon)}&deg;</span>`
  ].join("");
}

const ASPECTS = [[0,"conjunction"],[60,"sextile"],[90,"square"],[120,"trine"],[180,"opposition"]];

function transits(){
  const A = window.Astronomy;
  const now = new Date();
  const bodies = [["Sun",A.Body.Sun],["Moon",A.Body.Moon],["Mercury",A.Body.Mercury],["Venus",A.Body.Venus],["Mars",A.Body.Mars]];
  const tPos = {};
  let tRows = `<div class="item"><span class="sub">${now.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</span></div>`;
  bodies.forEach(([name,body])=>{
    const ecl = A.Ecliptic(A.GeoVector(body, now, true));
    const lon = ((ecl.elon%360)+360)%360;
    tPos[name] = lon;
    tRows += `<div class="item">${name} in <b>${sign(lon)}</b> ${degInSign(lon)}&deg;</div>`;
  });
  const phase = A.MoonPhase(now);
  const phaseName = phase<45?"New-ish":phase<90?"Waxing crescent":phase<135?"First quarter-ish":phase<180?"Waxing gibbous":phase<225?"Full-ish":phase<270?"Waning gibbous":phase<315?"Last quarter-ish":"Waning crescent";
  tRows += `<div class="item">Moon phase: <b>${phaseName}</b> (${phase.toFixed(0)}&deg; of cycle)</div>`;
  document.getElementById("transits").innerHTML = tRows;
  const n = window.NATAL;
  let rows = "";
  bodies.forEach(([name])=>{
    Object.entries({Sun:n.sun, Moon:n.moon, Mercury:n.mercury, Venus:n.venus, Mars:n.mars, Rising:n.ascendant, MC:n.midheaven}).forEach(([nname,np])=>{
      let d = Math.abs(tPos[name]-np.lon)%360; if(d>180) d=360-d;
      ASPECTS.forEach(([ang,label])=>{
        if(Math.abs(d-ang)<=4 && !(name==="Moon" && nname==="Moon")){
          rows += `<div class="item">Transit ${name} ${label} natal ${nname} <span class="sub">(orb ${Math.abs(d-ang).toFixed(1)}&deg;)</span></div>`;
        }
      });
    });
  });
  document.getElementById("aspects").innerHTML = rows || '<p class="empty">No close aspects to your chart today. Breathe.</p>';
}

function personList(elId, items, fmt){
  const el = document.getElementById(elId);
  if(!items || !items.length){ el.innerHTML = '<p class="empty">Nothing on file yet.</p>'; return; }
  el.innerHTML = items.map(fmt).join("");
}

function renderVault(){
  const v = VAULT;
  // Job ticker
  const jobs = v.job_applications||[];
  const weekAgo = Date.now()-7*864e5;
  const thisWeek = jobs.filter(j=>j.date_applied && new Date(j.date_applied) >= weekAgo).length;
  const interviews = jobs.filter(j=>["interview scheduled","phone screen scheduled","offer"].includes((j.status||"").toLowerCase())).length;
  document.getElementById("job-stats").innerHTML = `<div class="stat"><b>${jobs.length}</b><span>total applications</span></div><div class="stat"><b>${thisWeek}</b><span>past 7 days</span></div><div class="stat"><b>${interviews}</b><span>in interview stage</span></div>`;
  document.getElementById("jobs").innerHTML = jobs.length ? jobs.slice().sort((a,b)=>(b.date_applied||"").localeCompare(a.date_applied||"")).map(j=>
    `<div class="item"><b>${j.company||"?"}</b> &mdash; ${j.role||""}<div class="sub">${j.date_applied?new Date(j.date_applied+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}):"date?"} &middot; ${j.status||"applied"}${j.notes?" &middot; "+j.notes:""}</div></div>`).join("")
    : '<p class="empty">No applications logged yet.</p>';
  personList("appointments", v.appointments, a=>`<div class="item"><b>${a.title||a.provider||"?"}</b>${a.date?` <span class="sub">${new Date(a.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</span>`:""}${a.notes?`<div class="sub">${a.notes}</div>`:""}</div>`);
  personList("medications", v.medications, m=>`<div class="item"><b>${m.name}</b> <span class="sub">${[m.dose,m.schedule].filter(Boolean).join(" &middot; ")}</span>${m.notes?`<div class="sub">${m.notes}</div>`:""}</div>`);
  personList("bills", v.bills, b=>`<div class="item"><b>${b.name}</b> <span class="sub">$${b.amount}${b.due?" &middot; due "+new Date(b.due+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}):""}${b.recurring?" &middot; "+b.recurring:""}</span></div>`);
  personList("emails", v.important_emails, e=>`<div class="item"><b>${e.subject||"?"}</b> <span class="sub">${e.from||""}${e.date?" &middot; "+e.date:""}${e.why?" &middot; "+e.why:""}</span></div>`);
  personList("calendar", v.calendar, c=>`<div class="item"><b>${c.title}</b> <span class="sub">${c.date?new Date(c.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}):""}${c.time?" "+c.time:""}${c.notes?" &middot; "+c.notes:""}</span></div>`);
  personList("journal", v.journal_entries, j=>`<div class="item">${j.text?`${j.text}<div class="sub">${j.date||""}</div>`:""}</div>`);
  const doy = Math.floor((Date.now()-new Date(new Date().getFullYear(),0,0))/864e5);
  document.getElementById("prompt").textContent = window.JOURNAL_PROMPTS[doy % window.JOURNAL_PROMPTS.length];
  document.getElementById("vault-editor").value = JSON.stringify(VAULT, null, 2);
}

async function downloadVault(){
  if(!CURRENT_KEY) return;
  const data = JSON.parse(document.getElementById("vault-editor").value);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const salt = CURRENT_META.salt;
  const ct = await crypto.subtle.encrypt({name:"AES-GCM", iv:iv}, CURRENT_KEY, enc.encode(JSON.stringify(data)));
  const out = JSON.stringify({v:CURRENT_META.v, salt:salt, iv:bytesToB64(iv), ct:bytesToB64(new Uint8Array(ct))}, null, 2);
  const blob = new Blob([out], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "vault.enc"; a.click();
}

function render(){
  greeting(); renderNatal(); transits(); renderVault();
}
