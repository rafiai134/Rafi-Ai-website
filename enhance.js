(function(){
  var $=function(s){return document.querySelector(s)};
  var core=$('#core'), tag=$('#orbTag'), start=$('#startAi');

  function sync(){
    if(!core||!tag) return;
    var c=core.classList, s='SYSTEM STANDBY';
    if(c.contains('listening')) s='LISTENING';
    else if(c.contains('thinking')) s='THINKING';
    else if(c.contains('speaking')) s='SPEAKING';
    tag.textContent=s; tag.setAttribute('data-state',s.toLowerCase());
    if(start){ var live=c.contains('listening'); start.textContent=live?'STOP AI':'START AI'; start.classList.toggle('live',live); }
  }
  if(core){ new MutationObserver(sync).observe(core,{attributes:true,attributeFilter:['class']}); sync(); }
  if(start&&core) start.addEventListener('click',function(){core.click()});

  /* chat tabs */
  var tabs=document.querySelectorAll('.chat-tabs button');
  var voiceEls=['#chatMessages','.composer','.chat-tools'].map(function(s){return $(s)}).filter(Boolean);
  var panes={agent:$('#agentPane'),notes:$('#notesPane')};
  function show(name){
    tabs.forEach(function(b){b.classList.toggle('active',b.getAttribute('data-tab')===name)});
    voiceEls.forEach(function(el){el.style.display=(name==='voice')?'':'none'});
    Object.keys(panes).forEach(function(k){ if(panes[k]) panes[k].classList.toggle('show',k===name) });
    if(name==='agent') renderAgents();
  }
  tabs.forEach(function(b){b.addEventListener('click',function(){show(b.getAttribute('data-tab'))})});
  var modes=document.querySelectorAll('.agent-modes button');
  modes.forEach(function(b){
    b.addEventListener('click',function(){
      modes.forEach(function(x){x.classList.remove('active')});
      b.classList.add('active');
      var mode=b.textContent.trim();
      document.documentElement.setAttribute('data-agent-mode',mode);
    });
  });

  function renderAgents(){
    var box=$('#agentPane'); if(!box) return;
    var rows=document.querySelectorAll('.flow-agent');
    box.innerHTML='';
    rows.forEach(function(r){
      var name=(r.querySelector('span')||{}).textContent||'';
      var sub=(r.querySelector('small')||{}).textContent||'';
      var busy=r.classList.contains('has-task');
      var d=document.createElement('div'); d.className='arow'+(busy?' busy':'');
      d.innerHTML='<i></i><b></b><span></span>';
      d.querySelector('b').textContent=name+' · '+sub;
      d.querySelector('span').textContent=busy?'WORKING':'IDLE';
      box.appendChild(d);
    });
  }
  setInterval(function(){ if(panes.agent&&panes.agent.classList.contains('show')) renderAgents(); },1500);

  /* notes (saved on this device only) */
  var nb=$('#notesBox');
  if(nb){
    try{ nb.value=localStorage.getItem('rafi_notes')||''; }catch(e){}
    nb.addEventListener('input',function(){ try{ localStorage.setItem('rafi_notes',nb.value); }catch(e){} });
  }
})();

/* load order: voice.js -> office.js -> greeting.js -> voicefix.js -> camera.js (each after the previous one) */
(function(){
  function load(src,next){
    var s=document.createElement('script'); s.src=src;
    s.onload=s.onerror=function(){ if(next) next(); };
    document.body.appendChild(s);
  }
  load('/voice.js?v=1',function(){
    load('/office.js?v=3',function(){
      load('/greeting.js?v=4',function(){
        load('/voicefix.js?v=1',function(){
          load('/camera.js?v=1');
        });
      });
    });
  });
})();
