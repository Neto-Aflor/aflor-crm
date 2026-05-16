document.addEventListener("DOMContentLoaded", function () {
  const API = 'https://script.google.com/macros/s/AKfycbzVJKD16n7Hog2V5JVkO9U65vucYMiTkorGdez3aA-IZhVKsUd_PgC7KepSWaulL04h/exec';
  const SECURITY_TOKEN = 'AFLOR_CRM_V1_TOKEN';
  let leads = [], sk = null, sa = true, ch = {}, currentLead = null, filtersBound = false, viewMode = 'commercial';

  // ============================================================
  // BOOTSTRAP
  // ============================================================
  function tick(){
    const now=new Date();
    const d=now.toLocaleDateString('pt-BR');
    const t=now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    document.getElementById('topTime').textContent=d+' · '+t;
    const footerTs=document.getElementById('footerTs');
    if(footerTs) footerTs.textContent='Atualizado em '+d+' às '+t;
  }
  const clientEl=document.getElementById('clientName');
  if(clientEl&&clientEl.dataset.clientName)clientEl.textContent=clientEl.dataset.clientName;
  tick();setInterval(tick,60000);

  function setViewMode(mode){
    viewMode = mode === 'operational' ? 'operational' : 'commercial';
    document.querySelectorAll('[data-view-mode]').forEach(btn=>{
      btn.classList.toggle('is-active', btn.dataset.viewMode === viewMode);
    });
    document.querySelectorAll('.view-commercial').forEach(el=>{
      el.classList.toggle('is-hidden', viewMode !== 'commercial');
    });
    document.querySelectorAll('.view-operational').forEach(el=>{
      el.classList.toggle('is-hidden', viewMode !== 'operational');
    });
  }

  document.querySelectorAll('[data-view-mode]').forEach(btn=>{
    btn.addEventListener('click',()=>setViewMode(btn.dataset.viewMode));
  });
  setViewMode('commercial');

  // ============================================================
  // API
  // ============================================================
  async function loadData(){
    const btn=document.getElementById('btnR'),ldEl=document.getElementById('ld'),tsEl=document.getElementById('ts');
    btn.classList.add('spin');
    tsEl.textContent='Carregando…';
    document.getElementById('ld-t').textContent='Atualizando dados…';
    ldEl.classList.remove('gone');
    try{
      const r=await fetch(API+'?token='+encodeURIComponent(SECURITY_TOKEN)+'&t='+Date.now());
      if(!r.ok)throw new Error('HTTP '+r.status);
      const d=await r.json();
      if(!d.rows||!d.headers)throw new Error('Resposta inválida do servidor');
      proc(d.rows,d.headers);
      const t=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      tsEl.textContent=leads.length+' leads · '+t;
      setTimeout(()=>ldEl.classList.add('gone'),60);
    }catch(e){
      tsEl.textContent='Erro';
      document.getElementById('ld-t').innerHTML=
        '<span style="color:#DC2626">Erro: '+e.message+'</span>'+
        '<br><small style="color:#8E8E93;margin-top:8px;display:block">Clique para tentar novamente</small>';
      ldEl.style.cursor='pointer';
      ldEl.onclick=loadData;
    }
    btn.classList.remove('spin');
  }

  function saveEdit(){
    if(!currentLead)return;
    const btn=document.getElementById('btnSave'),st=document.getElementById('saveStatus');

    if(!currentLead.id || !currentLead.id.trim()){
      st.className='save-status err';
      st.textContent='✗ Este lead não possui ID — salvar não é permitido em modo produção';
      console.error('[AFLOR save] currentLead sem ID:', currentLead);
      return;
    }

    btn.disabled=true;st.className='save-status';st.textContent='Salvando…';

    const gv=(id)=>{
      const el=document.getElementById(id);
      if(!el||el.disabled||el.value===''||el.value==='N/A') return null;
      return el.value;
    };

    const u={};
    u._id     = currentLead.id;
    u._action = 'update';
    u.token   = SECURITY_TOKEN;

    // ── Payload canônico — chaves literais fixas, norm() no backend converte ──
    // Data: única que precisa de conversão ISO antes de enviar
    const uItima = gv('eUltima');
    if(uItima) u['Ultima Interacao'] = toISODate(uItima);

    // Campos diretos — string (backend trata tipo)
    u['Followups Realizados']      = document.getElementById('eFollowups').value      || '';
    u['Diagnostico Enviado']       = document.getElementById('eDiagnostico').value    || '';
    const celularEl = document.getElementById('eCelular');
    u['Contato']                   = celularEl.value === celularEl.dataset.maskedValue ? (celularEl.dataset.rawValue || '') : (celularEl.value || '');
    u['Observacoes Estrategicas']  = document.getElementById('eObs').value             || '';
    u['Status']                    = document.getElementById('eStatus').value          || '';

    const params = new URLSearchParams(u);

    function _aplicarLocalmente(){
      if(u['Ultima Interacao'])              currentLead.ultima      = formatDateBR(u['Ultima Interacao']);
      if(u['Followups Realizados'])          currentLead.followups   = u['Followups Realizados'];
      if(u['Diagnostico Enviado'] !== undefined) currentLead.diagnostico = u['Diagnostico Enviado'];
      if(u['Contato']             !== undefined) currentLead.celular     = u['Contato'];
      if(u['Observacoes Estrategicas'] !== undefined) currentLead.obs    = u['Observacoes Estrategicas'];
      if(u['Status']              !== undefined) currentLead.statusb     = u['Status'];
      tbl(); kpis(); charts(); microFunnel();
    }

    async function _sincronizarAposReload(){
      const savedId = currentLead ? currentLead.id : null;
      await loadData();
      const fresh = savedId ? leads.find(l => l.id && String(l.id) === String(savedId)) : null;
      if(fresh){ currentLead = fresh; om(fresh); }
      st.textContent = '✓ Sincronizado com a planilha';
      setTimeout(() => { st.textContent = ''; }, 2500);
    }

    fetch(API + '?' + params.toString() + '&t=' + Date.now())
      .then(r => {
        if(!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(resp => {
        btn.disabled = false;
        if(resp && resp.status === 'ok'){
          st.className = 'save-status ok';
          st.textContent = '✓ Salvo! Atualizando…';
          _aplicarLocalmente();
          setTimeout(_sincronizarAposReload, 1500);
        } else {
          st.className = 'save-status err';
          const detail = resp && resp.error ? resp.error : 'resposta inesperada do Apps Script';
          st.textContent = '✗ ' + detail;
          console.error('[AFLOR save] Apps Script retornou:', resp);
        }
      })
      .catch(err => {
        btn.disabled = false;
        st.className = 'save-status err';
        st.textContent = '✗ Erro de rede — ' + err.message;
        console.error('[AFLOR save] fetch error:', err);
      });
  }

  // ============================================================
  // HELPERS
  // ============================================================
  function norm(s){
    return(s||'').toString().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // remove acentos
      .replace(/[-_?.!,;:()/\\]/g,'')                  // remove pontuação/hífens
      .replace(/\s+/g,' ').trim();                      // normaliza espaços
  }
  function fc(H,...cc){
    for(const c of cc){
      const nc=norm(c);
      let i=H.findIndex(h=>norm(h)===nc);
      if(i>=0)return H[i];
      if(nc.length>=3){
        i=H.findIndex(h=>{ const nh=norm(h); return nh===nc||nh.startsWith(nc)||nh.includes(nc); });
        if(i>=0)return H[i];
      }
    }
    return null;
  }
  function pct(c){if(!c)return 0;return parseFloat(c.replace('%+','').replace('%','').replace(',','.'))||0;}

  function prioridadeRank(p){
    const rank={critico:0,crtico:0,alta:1,media:2,mdia:2,baixa:3}[norm(p)];
    if(rank!==undefined)return rank;
    return {CRÍTICO:0,ALTA:1,MÉDIA:2,BAIXA:3}[p] ?? 9;
  }

  function formatDateBR(d){
    if(!d)return'';
    const s=String(d).trim();
    if(/^\d{2}\/\d{2}\/\d{2}$/.test(s))return s;
    if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)){
      const[dd,mm,yyyy]=s.split('/');
      return dd.padStart(2,'0')+'/'+mm.padStart(2,'0')+'/'+yyyy.slice(-2);
    }
    const iso=s.split('T')[0];
    if(/^\d{4}-\d{2}-\d{2}$/.test(iso)){
      const[y,m,dia]=iso.split('-');
      return dia+'/'+m+'/'+y.slice(-2);
    }
    return s;
  }

  function toISODate(br){
    if(!br||!br.includes('/'))return br;
    const[d,m,y]=br.split('/');
    if(!d||!m||!y)return br;
    const year=y.length===2?'20'+y:y;
    return year+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0');
  }

  function pd(s){
    if(!s)return null;
    if(/^\d{4}-\d{2}-\d{2}/.test(s.trim())){
      const iso=s.trim().split('T')[0];
      const[y,m,d]=iso.split('-');
      return new Date(parseInt(y),parseInt(m)-1,parseInt(d));
    }
    const m2=s.replace(/\s/g,'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,6})/);
    if(!m2)return null;
    let y=parseInt(m2[3]);
    if(y<100)y+=2000;
    if(y>2100)y=2026;
    return new Date(y,parseInt(m2[2])-1,parseInt(m2[1]));
  }

  function x(s){if(!s)return'';return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  function normalizePhoneBR(value){
    let digits=String(value||'').replace(/\D/g,'');
    if((digits.length===10||digits.length===11)&&!digits.startsWith('55'))digits='55'+digits;
    if(digits.startsWith('55')&&(digits.length===12||digits.length===13))return digits;
    return '';
  }

  function maskPhoneBR(value){
    let digits=String(value||'').replace(/\D/g,'');
    if(digits.startsWith('55')&&(digits.length===12||digits.length===13))digits=digits.slice(2);
    if(digits.length===11)return '('+digits.slice(0,2)+') '+digits.slice(2,7)+'-'+digits.slice(7);
    if(digits.length===10)return '('+digits.slice(0,2)+') '+digits.slice(2,6)+'-'+digits.slice(6);
    return value||'';
  }

  function periodLabel(value){
    return {month:'Mês atual',quarter:'Trimestre',semester:'Semestre',year:'Ano',all:'Total'}[value]||'Mês atual';
  }

  function inPeriod(date,period){
    if(!date)return false;
    if(period==='all')return true;
    const now=new Date();
    const year=date.getFullYear(),month=date.getMonth();
    if(period==='month')return year===now.getFullYear()&&month===now.getMonth();
    if(period==='quarter'){
      return year===now.getFullYear()&&Math.floor(month/3)===Math.floor(now.getMonth()/3);
    }
    if(period==='semester'){
      return year===now.getFullYear()&&Math.floor(month/6)===Math.floor(now.getMonth()/6);
    }
    if(period==='year')return year===now.getFullYear();
    return false;
  }

  // ============================================================
  // DATA NORMALIZATION
  // ============================================================
  function proc(rows,H){
    const C={
      id:         fc(H,'ID','Id','id'),
      contato:    fc(H,'Nome'),
      empresa:    fc(H,'Empresa'),
      cargo:      fc(H,'Cargo'),
      celular:    fc(H,'Contato'),
      acesso:     fc(H,'Acesso Rápido','Acesso Rapido'),
      statusb:    fc(H,'Status'),
      porte:      fc(H,'Porte'),
      obs:        fc(H,'Observações Estratégicas','Observacoes Estrategicas'),
      ultima:     fc(H,'Última Interação','Ultima Interacao'),
      followups:  fc(H,'Follow-ups Realizados','Followups Realizados','Follow ups Realizados'),
      diagnostico:fc(H,'Diagnóstico Enviado','Diagnostico Enviado'),
      interacoes: fc(H,'Interações Totais','Interacoes Totais'),
      status:     fc(H,'Situação Follow-up','Situacao Follow-up','Situação Followup','Situacao Followup'),
      proxfu:     fc(H,'Próximo Follow-up','Proximo Follow-up','Proximo Followup','Próximo Followup'),
      atraso:     fc(H,'Atraso real','Atraso Real','Atraso'),
      prioridade: fc(H,'Prioridade'),
      acao:       fc(H,'Ação','Acao'),
      chance:     fc(H,'Chance Fechamento','Chance de Fechamento'),
    };
    leads=rows.map(r=>Object.fromEntries(Object.entries(C).map(([k,col])=>{
      if(!col) return [k,''];
      let v=(r[col]||'').toString().trim();
      if(v && /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/.test(v)){
        try{ const d=new Date(v); if(!isNaN(d)) v=formatDateBR(d.toISOString()); }catch(e){}
      }
      if((k==='ultima'||k==='proxfu') && v){
        v=formatDateBR(v);
      }
      v=v.replace(/(\d{1,2}\/\d{1,2}\/)2(\d{4})/g,'$1$2');
      v=v.replace(/(\d{1,2}\/\d{1,2}\/\d{4})\d+/g,'$1');
      if((k==='ultima'||k==='proxfu') && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)){
        v=formatDateBR(v);
      }
      return [k,v];
    }))).filter(l=>l.empresa&&l.empresa.toLowerCase()!=='empresa'&&l.empresa.trim()!=='')
    .map(l=>{
      if(l.porte && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(l.porte) && !/^\d+-\d+/.test(l.porte)){
        l.porte = '';
      }
      if(l.chance){
        const n=parseFloat(l.chance);
        if(!isNaN(n) && n>0 && n<1){
          l.chance=Math.round(n*100)+'%';
        } else if(!isNaN(n) && n>=1 && !l.chance.includes('%')){
          l.chance=Math.round(n)+'%';
        }
      }
      return l;
    });
    kpis();microFunnel();charts();strip();filters();tbl();
  }

  // ============================================================
  // KPI
  // ============================================================
  function kpis(){
    const periodEl=document.getElementById('kPeriod');
    const period=periodEl?periodEl.value:'month';
    const periodLeads=leads.filter(l=>inPeriod(pd(l.ultima),period));
    const contactados=periodLeads.filter(l=>l.statusb&&l.statusb!=='Novo').length;
    const ganhos=periodLeads.filter(l=>l.statusb==='Ganho').length;
    const tx=contactados?Math.round((ganhos/contactados)*100):0;
    document.getElementById('kT').textContent=tx+'%';
    document.getElementById('kBadge1').textContent=contactados+' contactados · '+ganhos+' ganhos';
    document.getElementById('kA').textContent=periodLeads.length;
    document.getElementById('kBadge2').textContent=periodLabel(period);
    const label=periodLabel(period);
    document.getElementById('kPeriodLabel1').textContent=label;
    document.getElementById('kPeriodLabel2').textContent=label;
    document.getElementById('kF').textContent=leads.filter(l=>l.acao&&l.acao.includes('FOLLOW')).length;
    document.getElementById('kH').textContent=leads.filter(l=>pct(l.chance)>10).length;
    const diagCount=leads.filter(l=>l.diagnostico&&l.diagnostico.toLowerCase().startsWith('s')).length;
    const badgeEl=document.getElementById('kBadgeDiag');
    if(badgeEl) badgeEl.textContent=diagCount+' diagnóst.';
  }

  function microFunnel(){
    const root=document.getElementById('microFunnel');
    if(!root)return;
    const etapas=['Conectado','Qualificado','Proposta','Ganho'];
    root.innerHTML=etapas.map(etapa=>{
      const items=leads.filter(l=>l.statusb===etapa);
      const body=items.length?items.map(l=>{
        const originalIndex=leads.indexOf(l);
        const meta=[
          l.chance?`<span>${x(l.chance)}</span>`:'',
          l.prioridade?`<span>${x(l.prioridade)}</span>`:''
        ].filter(Boolean).join('');
        return `<button class="mfunnel-item" type="button" data-lead-index="${originalIndex}">
          <span class="mfunnel-company">${x(l.empresa)||'-'}</span>
          ${meta?`<span class="mfunnel-meta">${meta}</span>`:''}
        </button>`;
      }).join(''):'<div class="mfunnel-empty">Sem leads</div>';

      return `<div class="mfunnel-col">
        <div class="mfunnel-col-head">
          <span>${etapa}</span>
          <strong>${items.length}</strong>
        </div>
        <div class="mfunnel-list">${body}</div>
      </div>`;
    }).join('');

    root.querySelectorAll('.mfunnel-item[data-lead-index]').forEach(item=>{
      item.addEventListener('click',()=>{
        const index=Number(item.dataset.leadIndex);
        if(!Number.isNaN(index)&&leads[index]){
          om(leads[index]);
        }
      });
    });
  }

  // ============================================================
  // CHARTS
  // ============================================================
  function charts(){
    Object.values(ch).forEach(c=>c.destroy());ch={};
    Chart.defaults.color='#8E8E93';Chart.defaults.borderColor='#E5E5EA';
    Chart.defaults.font.family="'Inter',sans-serif";

    const periodEl=document.getElementById('kPeriod');
    const period=periodEl?periodEl.value:'month';
    const chartLeads=leads.filter(l=>inPeriod(pd(l.ultima),period));
    const sc={};
    chartLeads.forEach(l=>{if(l.status)sc[l.status]=(sc[l.status]||0)+1;});
    delete sc['Novo'];
    delete sc['Perdido'];
    function _sOrd(s){if(s==='Primeiro contato')return 0;const m=s.match(/^Follow-up\s+(\d+)/i);return m?parseInt(m[1]):999;}
    function followupColor(s){
      const ns=norm(s);
      const m=ns.match(/^followup\s+(\d+)/);
      if(ns==='primeiro contato')return '#FFE5D6';
      if(m){
        const n=parseInt(m[1],10);
        if(n<=1)return '#FFD2B8';
        if(n===2)return '#FDBA74';
        if(n===3||n===4)return '#FF8A3D';
        if(n===5)return '#FF5A00';
        return '#CC4A00';
      }
      if(ns==='ganho'||ns==='proposta')return '#CC4A00';
      return '#FF5A00';
    }
    const ss=Object.entries(sc).sort((a,b)=>_sOrd(a[0])-_sOrd(b[0]));
    ch.s=new Chart(document.getElementById('cS'),{type:'bar',
      data:{labels:ss.map(s=>s[0]),datasets:[{data:ss.map(s=>s[1]),backgroundColor:ss.map(s=>followupColor(s[0])),borderRadius:6,borderSkipped:false}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:10},color:'#8E8E93'}},y:{grid:{color:'#F0F0F0'},ticks:{stepSize:1,color:'#8E8E93'}}}}
    });

    const pc={};chartLeads.forEach(l=>{if(l.prioridade)pc[l.prioridade]=(pc[l.prioridade]||0)+1;});
    delete pc['-'];delete pc[''];delete pc['—'];
    const priorityColors={critico:'#CC4A00',crtico:'#CC4A00',alta:'#FF5A00',media:'#FDBA74',mdia:'#FDBA74',baixa:'#FFE5D6'};
    ch.p=new Chart(document.getElementById('cP'),{type:'doughnut',
      data:{labels:Object.keys(pc),datasets:[{data:Object.values(pc),backgroundColor:Object.keys(pc).map(k=>priorityColors[norm(k)]||'#FFD2B8'),borderColor:'#FFFFFF',borderWidth:3,hoverOffset:5}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'68%',plugins:{legend:{position:'bottom',labels:{usePointStyle:true,padding:12,font:{size:11},color:'#404045'}}}}
    });

  }

  // ============================================================
  // FOLLOW-UP
  // ============================================================
  function strip(){
    const td=new Date();td.setHours(0,0,0,0);
    const sn=new Date(td);sn.setDate(sn.getDate()+5);
    const el=document.getElementById('fuI');el.innerHTML='';
    const criticos=leads.filter(l=>l.prioridade==='CRÍTICO').length;
    document.querySelector('.fu-ttl').innerHTML=`
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      CRÍTICO · ${criticos}`;
    const u=leads.filter(l=>l.proxfu&&l.acao&&l.acao.includes('FOLLOW')).map(l=>({...l,_d:pd(l.proxfu)})).filter(l=>l._d&&l._d<=sn).sort((a,b)=>a._d-b._d).slice(0,16);
    if(!u.length){el.innerHTML='<span style="color:#8E8E93;font-size:11px">Nenhum follow-up urgente nos próximos 5 dias</span>';return;}
    u.forEach(l=>{const d=document.createElement('div');d.className='fuchip'+(l._d<td?' ov':'');d.innerHTML=`<span class="co">${x(l.empresa)}</span><span class="dt">${x(l.proxfu)}</span>`;d.onclick=()=>om(l);el.appendChild(d);});
  }

  // ============================================================
  // FILTERS
  // ============================================================
  function filters(){
    const ss=[...new Set(leads.map(l=>l.status).filter(Boolean))];
    const s1=document.getElementById('fSt');s1.innerHTML='<option value="">Todas Situações</option>';
    ss.forEach(s=>s1.insertAdjacentHTML('beforeend',`<option>${s}</option>`));
    if(!filtersBound){
      ['fQ','fStatus','fSt','fPr','fAc'].forEach(id=>document.getElementById(id).addEventListener('input',tbl));
      const periodEl=document.getElementById('kPeriod');
      if(periodEl)periodEl.addEventListener('input',()=>{kpis();charts();});
      filtersBound = true;
    }
  }

  // ============================================================
  // TABLE
  // ============================================================
  function srt(k){sa=sk===k?!sa:true;sk=k;tbl();}
  function tbl(){
    const q=document.getElementById('fQ').value.toLowerCase();
    const fStatus=document.getElementById('fStatus').value,fS=document.getElementById('fSt').value,fP=document.getElementById('fPr').value;
    const fA=document.getElementById('fAc').value;
    let list=leads.filter(l=>{
      if(q&&!l.empresa.toLowerCase().includes(q)&&!l.contato.toLowerCase().includes(q))return false;
      if(fStatus&&l.statusb!==fStatus)return false;
      if(fS&&l.status!==fS)return false;if(fP&&l.prioridade!==fP)return false;
      if(fA&&!l.acao.toUpperCase().includes(fA))return false;
      return true;
    });
    if(sk){
      list=[...list].sort((a,b)=>{let va=a[sk]||'',vb=b[sk]||'';if(sk==='chance'){va=pct(va);vb=pct(vb);return sa?va-vb:vb-va;}return sa?va.localeCompare(vb,'pt'):vb.localeCompare(va,'pt');});
    }else{
      list=[...list].sort((a,b)=>{
        const lost=(a.statusb==='Perdido'?1:0)-(b.statusb==='Perdido'?1:0);
        if(lost)return lost;
        const pr=prioridadeRank(a.prioridade)-prioridadeRank(b.prioridade);
        if(pr)return pr;
        const af=a.acao&&a.acao.includes('FOLLOW')?0:1;
        const bf=b.acao&&b.acao.includes('FOLLOW')?0:1;
        if(af!==bf)return af-bf;
        const chance=pct(b.chance)-pct(a.chance);
        if(chance)return chance;
        const ad=pd(a.proxfu),bd=pd(b.proxfu);
        if(ad&&bd)return ad-bd;
        if(ad)return -1;
        if(bd)return 1;
        return 0;
      });
    }
    document.getElementById('cnt').textContent=list.length+' lead'+(list.length!==1?'s':'');
    const tblCount=document.getElementById('tblCount');
    if(tblCount)tblCount.textContent=list.length+' registros';
    const tb=document.getElementById('tb');
    if(!list.length){tb.innerHTML='<tr><td colspan="10"><div class="empt"><span>🔍</span>Nenhum resultado com os filtros aplicados.</div></td></tr>';return;}
    tb.innerHTML=list.map(l=>{
      const originalIndex=leads.indexOf(l);
      const cv=pct(l.chance),cc=cv>20?'pH':cv>10?'pM':'pL';
      const pc2={CRÍTICO:'cA',ALTA:'cA',MÉDIA:'cM',BAIXA:'cB'}[l.prioridade]||'cS';
      const isLost=l.status==='Encerrado';
      const isFechado=l.status==='Convertido';
      const isReuniao=l.status==='Reunião agendada';
      const ac=isFechado?'cFechado':isReuniao?'cReuniao':isLost?'cLost':l.acao&&l.acao.includes('FOLLOW')?'cF':'cW';
      const fc2='';
      const trClass=isFechado?'is-fechado':isReuniao?'is-reuniao':isLost?'is-closed':'';
      const isDiag = l.diagnostico && l.diagnostico.toLowerCase().startsWith('s');
      return`<tr class="${trClass}" data-lead-index="${originalIndex}">
        <td class="te">${x(l.empresa)}</td>
        <td class="tcn">${x(l.contato)||'—'}</td>
        <td class="tsg">${x(l.celular)||'—'}</td>
        <td>${l.status?`<span class="chip cS">${x(l.status)}</span>`:'—'}</td>
        <td>${(isLost||isFechado)?`<span style="color:var(--t3);font-size:10px">N/A</span>`:(l.prioridade?`<span class="chip ${pc2}">${l.prioridade}</span>`:'—')}</td>
        <td>${isFechado?`<span class="chip cFechado">Convertido ✓</span>`:isLost?`<span class="chip cLost">Encerrado</span>`:(l.acao?`<span class="chip ${ac}">${l.acao.length>14?l.acao.slice(0,14)+'…':x(l.acao)}</span>`:'—')}</td>
        <td>${isDiag?`<span class="chip cDiag" title="Diagnóstico">✓ Diag.</span>`:l.diagnostico?`<span class="chip cDiagNo" title="${x(l.diagnostico)}">✕</span>`:'<span style="color:var(--t4);font-size:10px">—</span>'}</td>
        <td>${(isLost||isFechado)?`<span style="color:var(--t3);font-size:10px">N/A</span>`:`<span class="pct ${cc}">${x(l.chance)||'—'}</span>`}</td>
        <td>${(isLost||isFechado)?`<span style="color:var(--t3);font-size:10px">N/A</span>`:`<span class="fudt ${fc2}">${x(l.proxfu)||'—'}</span>`}</td>
        <td style="font-family:'JetBrains Mono',monospace;font-size:10px;color:#8E8E93">${l.interacoes||'—'}</td>
      </tr>`;
    }).join('');
    tb.querySelectorAll('tr[data-lead-index]').forEach(row=>{
      row.addEventListener('click',()=>{
        const index=Number(row.dataset.leadIndex);
        if(!Number.isNaN(index)&&leads[index]){
          om(leads[index]);
        }
      });
    });
  }

  // ============================================================
  // MODAL
  // ============================================================
  function om(l){
    currentLead=l;
    document.getElementById('mEmp').textContent=l.empresa||'—';
    document.getElementById('mSub').textContent=(l.contato||'—')+(l.cargo?' · '+l.cargo:'');
    const pc2={CRÍTICO:'cA',ALTA:'cA',MÉDIA:'cM',BAIXA:'cB'}[l.prioridade]||'';
    const isLost=l.status==='Encerrado';
      const isFechado=l.status==='Convertido';
      const isReuniao=l.status==='Reunião agendada';
      const ac=isFechado?'cFechado':isReuniao?'cReuniao':isLost?'cLost':l.acao&&l.acao.includes('FOLLOW')?'cF':'cW';
    const cv=pct(l.chance),cc=cv>20?'pH':cv>10?'pM':'pL';
    document.getElementById('mChips').innerHTML=`
      ${l.prioridade?`<span class="chip ${pc2}">${l.prioridade}</span>`:''}
      ${l.acao?`<span class="chip ${ac}">${x(l.acao)}</span>`:''}
      ${l.chance?`<span class="chip cS"><span class="pct ${cc}">${x(l.chance)}</span> fechamento</span>`:''}`;
    const whatsappNumber=normalizePhoneBR(l.celular);
    const whatsappChip=whatsappNumber?`<a class="chip cS m-access-chip m-action-chip" href="https://wa.me/${x(whatsappNumber)}" target="_blank" rel="noopener noreferrer">Conversar WhatsApp</a>`:'';
    const acessoChip=l.acesso?`<a class="chip cS m-access-chip m-action-chip" href="${x(l.acesso)}" target="_blank" rel="noopener noreferrer">Acesso Rápido</a>`:'';
    document.getElementById('mQuick').innerHTML=`
      ${whatsappChip}
      ${acessoChip}
      ${l.porte?`<span class="chip cS">Porte ${x(l.porte)}</span>`:''}`;
    document.getElementById('eUltima').value = formatDateBR(l.ultima||'');
    document.getElementById('eFollowups').value=l.followups ||'';
    document.getElementById('eDiagnostico').value = l.diagnostico||'';
    const celularEl=document.getElementById('eCelular');
    celularEl.dataset.rawValue = l.celular || '';
    celularEl.dataset.maskedValue = maskPhoneBR(l.celular || '');
    celularEl.value = celularEl.dataset.maskedValue;
    document.getElementById('eObs').value          = l.obs        ||'';
    document.getElementById('eStatus').value = l.statusb || '';
    document.getElementById('saveStatus').textContent='';
    document.getElementById('saveStatus').className='save-status';
    document.getElementById('msk').classList.add('open');
    document.getElementById('mbox').scrollTop=0;
  }
  function onStatusChange(status){
    // Hook legado mantido por compatibilidade com versões anteriores.
  }

  function cm(){document.getElementById('msk').classList.remove('open');currentLead=null;}
  document.addEventListener('keydown',e=>{if(e.key==='Escape')cm();});

  // Contratos chamados diretamente pelo HTML.
  window.loadData = loadData;
  window.saveEdit = saveEdit;
  window.srt = srt;
  window.cm = cm;
  window.setViewMode = setViewMode;

  loadData();
  });
