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
  }catch(e){
    err.textContent = "That PIN doesn't match. Check the two leading zeros.";
    return;
  }
  try{
    render();
  }catch(e){
    console.error("render error:", e);
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


const ASPECTS = [[0,"conjunction"],[60,"sextile"],[90,"square"],[120,"trine"],[180,"opposition"]];


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
  const fmtDate = d => d ? new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "";
  document.getElementById("jobs").innerHTML = jobs.length ? '<div class="table-wrap"><table class="job-table"><thead><tr><th>Company</th><th>Role</th><th>Applied</th><th>Status</th><th>Location</th><th>Salary</th><th>About</th><th>Link</th><th>Notes</th></tr></thead><tbody>' + jobs.slice().sort((a,b)=>(b.date_applied||"").localeCompare(a.date_applied||"")).map(j=>
    `<tr><td><b>${j.company||"?"}</b></td><td>${j.role||""}</td><td>${fmtDate(j.date_applied)}</td><td>${j.status||"applied"}</td><td>${j.location||""}</td><td>${j.salary||""}</td><td class="about">${j.blurb||""}</td><td>${j.url?`<a class="joblink" href="${j.url}" target="_blank" rel="noopener">${j.url_label||"View posting &rarr;"}</a>`:""}</td><td class="notes">${j.notes||""}</td></tr>`).join("") + '</tbody></table></div>'
    : '<p class="empty">No applications logged yet.</p>';
  personList("appointments", v.appointments, a=>`<div class="item"><b>${a.title||a.provider||"?"}</b>${a.date?` <span class="sub">${new Date(a.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</span>`:""}${a.notes?`<div class="sub">${a.notes}</div>`:""}</div>`);
  personList("bills", v.bills, b=>`<div class="item"><b>${b.name}</b> <span class="sub">$${b.amount}${b.due?" &middot; due "+new Date(b.due+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}):""}${b.recurring?" &middot; "+b.recurring:""}</span></div>`);
  personList("emails", v.important_emails, e=>`<div class="item"><b>${e.subject||"?"}</b> <span class="sub">${e.from||""}${e.date?" &middot; "+e.date:""}${e.why?" &middot; "+e.why:""}</span></div>`);
  renderSchedule();
  const jent = v.journal_entries||[];
  document.getElementById("journal").innerHTML = jent.length ? jent.map(j=>`<div class="item">${j.text?`${j.text}<div class="sub">${j.date||""}</div>`:""}</div>`).join("") : "";
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

function horoscope(){
  const el = document.getElementById("horoscope");
  const A = window.Astronomy;
  if(!A){ el.textContent = "Horoscope unavailable right now."; return; }
  try{
    const now = new Date();
    const ecl = b => A.Ecliptic(A.GeoVector(b, now, true)).elon;
    const t = {Sun:ecl(A.Body.Sun), Moon:ecl(A.Body.Moon), Mercury:ecl(A.Body.Mercury), Venus:ecl(A.Body.Venus), Mars:ecl(A.Body.Mars)};
    const moonSign = SIGNS[Math.floor(t.Moon/30)%12];
    const elem = {Aries:"fire",Leo:"fire",Sagittarius:"fire",Taurus:"earth",Virgo:"earth",Capricorn:"earth",Gemini:"air",Libra:"air",Aquarius:"air",Cancer:"water",Scorpio:"water",Pisces:"water"}[moonSign];
    const elemLine = {fire:"a fire kind of day: momentum favors moving first", earth:"an earth kind of day: steady hands win", air:"an air kind of day: talk, ideas and errands move fast", water:"a water kind of day: lead with feel, back it with facts"}[elem];
    const THEMES = {Sun:"your energy and confidence", Moon:"your mood", Mercury:"conversations and paperwork", Venus:"money and what you value", Mars:"your drive", Rising:"how you come across", Midheaven:"your career and reputation"};
    const FLAVOR = {
      conjunction:["blends with","a clean boost, lean into it"],
      sextile:["teams up with","doors open if you say yes"],
      trine:["flows with","it comes easy, use the momentum"],
      square:["bumps against","friction that shows exactly where to slow down and double-check"],
      opposition:["pulls against","a balancing act, choose what serves the week and not just the hour"]
    };
    const ANG = [[0,"conjunction"],[60,"sextile"],[90,"square"],[120,"trine"],[180,"opposition"]];
    const hits = [];
    for(const [tn,tlon] of Object.entries(t)){
      for(const n of Object.values(NATAL)){
        if(tn === n.label) continue;
        let d = Math.abs(tlon - n.lon) % 360; if(d > 180) d = 360 - d;
        for(const [ang, aname] of ANG){
          const orb = Math.abs(d - ang);
          if(orb <= 6) hits.push({tn, n, aname, orb});
        }
      }
    }
    hits.sort((x,y)=>x.orb-y.orb);
    const parts = ["The Moon moves through " + moonSign + " today, making it " + elemLine + "."];
    if(!hits.length){
      parts.push("No strong transits touch your chart today, so the day is mostly yours to steer.");
    } else {
      for(const h of hits.slice(0,3)){
        const [verb, flavor] = FLAVOR[h.aname];
        parts.push(h.tn + " in " + SIGNS[Math.floor(t[h.tn]/30)%12] + " " + verb + " your " + h.n.label + " (" + h.orb.toFixed(1) + "\u00B0 orb), which colors " + THEMES[h.n.label] + ": " + flavor + ".");
      }
      if(hits.slice(0,3).some(h => h.aname === "square" || h.aname === "opposition")){
        parts.push("Take the friction as information, not a stop sign.");
      } else {
        parts.push("Easy sky. Cash in on it.");
      }
    }
    el.textContent = parts.join(" ");
  }catch(e){
    console.error("horoscope error:", e);
    el.textContent = "Horoscope unavailable right now.";
  }
}

function renderSchedule(userChanged){
  const sel = document.getElementById("schedule-range");
  if(!sel) return;
  if(userChanged){ try{ localStorage.setItem("schedule_range", sel.value); }catch(e){} }
  else { try{ const s = localStorage.getItem("schedule_range"); if(s) sel.value = s; }catch(e){} }
  const days = parseInt(sel.value, 10) || 14;
  const el = document.getElementById("schedule");
  const today = new Date(); today.setHours(0,0,0,0);
  const lastDay = new Date(today); lastDay.setDate(lastDay.getDate() + days - 1);
  const start = new Date(today); start.setDate(start.getDate() - start.getDay()); // back to Sunday
  const endD = new Date(lastDay); endD.setDate(endD.getDate() + (6 - endD.getDay())); // forward to Saturday
  const mL = document.getElementById("sched-month");
  if(mL){ mL.textContent = start.toLocaleDateString("en-US",{month:"long", day:"numeric"}) + " to " + endD.toLocaleDateString("en-US",{month:"long", day:"numeric", year:"numeric"}); }
  const items = ((VAULT && VAULT.calendar) || [])
    .filter(c => c.date)
    .map(c => Object.assign({}, c, {d: new Date(c.date + "T12:00:00")}));
  const byDay = {};
  items.forEach(c => { const k = c.d.toDateString(); (byDay[k] = byDay[k] || []).push(c); });
  const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const total = Math.round((endD - start)/864e5) + 1;
  let cells = "";
  for(let i = 0; i < total; i++){
    const d = new Date(start); d.setDate(d.getDate() + i);
    const inRange = d >= today && d <= lastDay;
    const evs = byDay[d.toDateString()] || [];
    cells += '<div class="day-cell' + (inRange ? "" : " off") + (d.toDateString() === today.toDateString() ? " today" : "") + '"><div class="day-num">' + MO[d.getMonth()] + " " + d.getDate() + '</div>'
      + evs.map(c => '<div class="day-ev" title="' + c.title + '">' + c.title + (c.time ? " \u00B7 " + c.time : "") + '</div>').join("")
      + '</div>';
  }
  el.innerHTML = '<div class="cal-week"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div class="cal-grid">' + cells + '</div>';
}




function render(){
  greeting(); horoscope(); renderVault();
}
