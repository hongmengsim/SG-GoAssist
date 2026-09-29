
const token=location.hash.slice(1), $=id=>document.getElementById(id);
let connected=false;
async function api(path,method='GET'){
  const response=await fetch('/api/'+path,{method,headers:{'X-Demo-Token':token},cache:'no-store',signal:AbortSignal.timeout(2000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Request failed');return data;
}
function render(s){
  connected=true;$('connection').textContent=s.ready?'ESP32 demo firmware connected':'Pi connected — waiting for ESP32 demo firmware';
  $('distance').textContent=s.mm===null?'—':s.mm+' mm';$('status').textContent=s.status;$('status').dataset.kind=s.status;
  $('lasers').textContent=s.lasers?'ON':'OFF / unconfirmed';$('markers').setAttribute('stroke',s.lasers?'#ca3749':'#9aa6af');
  $('reference').textContent=s.reference===null?'Reference: not set':'Reference: '+s.reference+' mm · demonstration tolerance ±30 mm';
  $('ramp').setAttribute('width',5+350*s.fraction);
  let label=s.fraction===0?'STOWED':'PAUSED';if(s.requested)label=s.status!=='BEAM CLEAR'?'PAUSED: '+s.status:s.fraction>=1?'DEPLOYED':'EXTENDING';
  $('ramp-label').textContent='SIMULATED RAMP: '+label;$('info').textContent=s.info;
  $('reference-button').disabled=!s.ready||s.requested;$('request-button').disabled=!s.ready||s.reference===null;$('on-button').disabled=!s.ready;
}
async function act(action){
  if(action==='reference'&&!confirm('Is the monitored path empty, with only the fixed matte backstop visible?'))return;
  try{$('error').textContent='';render(await api(action,'POST'));}catch(e){$('error').textContent=e.message;}
}
for(const [id,action]of [['reference-button','reference'],['request-button','request'],['cancel-button','cancel'],['on-button','on'],['off-button','off']])$(id).onclick=()=>act(action);
async function poll(){
  try{await api('heartbeat','POST');render(await api('state'));}
  catch(e){connected=false;$('connection').textContent='Control connection unavailable';$('distance').textContent='—';$('status').textContent='UNKNOWN';$('lasers').textContent='Unconfirmed';$('error').textContent=e.message;for(const id of ['reference-button','request-button','on-button'])$(id).disabled=true;}
  setTimeout(poll,400);
}
if(token)poll();else{$('error').textContent='Open the complete URL printed by the Pi, including the #code.';}
