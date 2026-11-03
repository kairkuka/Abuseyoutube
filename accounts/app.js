const $ = (id) => document.getElementById(id);
let metadataPayload = null;
let localStatus = null;

function escapeHtml(value){return String(value||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}
function notice(text,type="success"){const el=$("message");el.textContent=text;el.className=`message ${type}`;clearTimeout(notice.timer);notice.timer=setTimeout(()=>el.classList.add("hidden"),5000);}
async function json(url,options={}){const response=await fetch(url,{...options,headers:{"content-type":"application/json",...(options.headers||{})}});const data=await response.json().catch(()=>({}));if(!response.ok||data.ok===false)throw new Error(data.error||`HTTP ${response.status}`);return data;}

function profileForEmail(email){
  const clean=String(email||"").toLowerCase();
  return (localStatus&&localStatus.profiles||[]).find((profile)=>String(profile.detectedEmail||profile.email||"").toLowerCase()===clean)||null;
}

function render(){
  const accounts=metadataPayload&&metadataPayload.accounts||[];
  const configured=Boolean(metadataPayload&&metadataPayload.configured);
  $("oauth-status").textContent=configured?"Configured":"Import OAuth JSON";
  $("connect").classList.toggle("disabled",!configured);
  $("account-count").textContent=String(accounts.length);
  const matched=accounts.filter((account)=>profileForEmail(account.metadata&&account.metadata.email||account.email)).length;
  $("chrome-count").textContent=`${matched} / ${accounts.length}`;
  $("rows").innerHTML=accounts.map((account)=>{
    const meta=account.metadata||{};
    const email=meta.email||account.email||"";
    const profile=profileForEmail(email);
    return `<tr data-id="${escapeHtml(account.id)}">
      <td><strong>${escapeHtml(email||"Email появится после переподключения")}</strong><small>${escapeHtml(account.googleName||"")}</small></td>
      <td><strong>${escapeHtml(account.name||"YouTube channel")}</strong><small>${escapeHtml(account.handle||account.id)}</small></td>
      <td>${profile?`<strong>${escapeHtml(profile.name)}</strong><small>${escapeHtml(profile.profileDir)}</small>`:`<strong>Не найден</strong><small>Войди этим Gmail в отдельный Chrome-профиль и пересканируй</small>`}</td>
      <td><input class="field1" value="${escapeHtml(meta.field1||email)}" placeholder="Field 1"></td>
      <td><input class="field3" value="${escapeHtml(meta.field3||account.name||account.handle||"")}" placeholder="Field 3"></td>
    </tr>`;
  }).join("")||`<tr><td colspan="5">Пока нет подключённых Google / YouTube аккаунтов.</td></tr>`;
}

async function load(){
  const [identity,forms]=await Promise.all([
    json("/api/identity/accounts"),
    json("/api/local-form/status").catch(()=>({profiles:[]}))
  ]);
  metadataPayload={...identity,metadata:Object.fromEntries((identity.accounts||[]).map((account)=>[account.id,account.metadata||{}]))};
  localStatus=forms;
  render();
}

$("oauth-file").addEventListener("change",async()=>{
  const file=$("oauth-file").files&&$("oauth-file").files[0];
  if(!file)return;
  try{const parsed=JSON.parse(await file.text());await json("/api/oauth/import",{method:"POST",body:JSON.stringify(parsed)});notice("Google OAuth client сохранён");await load();}catch(e){notice(e.message,"error");}
  finally{$("oauth-file").value="";}
});

$("refresh").addEventListener("click",()=>load().then(()=>notice("Список обновлён")).catch(e=>notice(e.message,"error")));
$("save").addEventListener("click",async()=>{
  try{
    const incoming={...(metadataPayload.metadata||{})};
    document.querySelectorAll("#rows tr[data-id]").forEach((tr)=>{
      const id=tr.dataset.id;
      const account=(metadataPayload.accounts||[]).find((row)=>row.id===id)||{};
      const old=incoming[id]||account.metadata||{};
      incoming[id]={...old,field1:tr.querySelector(".field1").value.trim(),field3:tr.querySelector(".field3").value.trim()};
    });
    await json("/api/identity/accounts",{method:"POST",body:JSON.stringify({metadata:incoming})});
    notice("Значения аккаунтов сохранены");
    await load();
  }catch(e){notice(e.message,"error");}
});

window.addEventListener("focus",()=>{load().catch(()=>{});});
load().catch(e=>notice(e.message,"error"));
