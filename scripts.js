document.addEventListener("DOMContentLoaded", function () {
  const API = 'https://script.google.com/macros/s/AKfycbysjwcCifOlYH_gyQsjZsAgLoari6XmhXIrVfPfhruOC8fj9ihughhT-mQyzHB1BKlQ0A/exec';
  let leads = [], sk = null, sa = true, ch = {}, currentLead = null, filtersBound = false;

  // ============================================================
  // BOOTSTRAP
  // ============================================================
  function tick(){
    const now=new Date();
    const d=now.toLocaleDateString('pt-BR');
    const t=now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    document.getElementById('topTime').textContent=d+' · '+t;
    document.getElementById('footerTs').textContent='Atualizado em '+d+' às '+t;
  }
  tick();setInterval(tick,60000);

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
      const r=await fetch(API+'?t='+Date.now());
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

    // ── Payload canônico — chaves literais fixas, norm() no backend converte ──
    // Data: única que precisa de conversão ISO antes de enviar
    const uItima = gv('eUltima');
    if(uItima) u['Ultima Interacao'] = toISODate(uItima);

    // Campos diretos — string (backend trata tipo)
    u['Followups Realizados']      = document.getElementById('eFollowups').value      || '';
    u['Diagnostico Enviado']       = document.getElementById('eDiagnostico').value    || '';
    u['Contato']                   = document.getElementById('eCelular').value         || '';
    u['Possui Automacao']          = document.getElementById('ePlataforma').value      || '';
    u['Dor']                       = document.getElementById('eDor').value             || '';
    u['Observacoes Estrategicas']  = document.getElementById('eObs').value             || '';
    u['Status']                    = document.getElementById('eStatus').value          || '';

    const params = new URLSearchParams(u);

    function _aplicarLocalmente(){
      if(u['Ultima Interacao'])              currentLead.ultima      = formatDateBR(u['Ultima Interacao']);
      if(u['Followups Realizados'])          currentLead.followups   = u['Followups Realizados'];
      if(u['Diagnostico Enviado'] !== undefined) currentLead.diagnostico = u['Diagnostico Enviado'];
      if(u['Contato']             !== undefined) currentLead.celular     = u['Contato'];
      if(u['Possui Automacao']    !== undefined) currentLead.plataforma  = u['Possui Automacao'];
      if(u['Dor']                 !== undefined) currentLead.dor         = u['Dor'];
      if(u['Observacoes Estrategicas'] !== undefined) currentLead.obs    = u['Observacoes Estrategicas'];
      if(u['Status']              !== undefined) currentLead.statusb     = u['Status'];
      tbl(); kpis();
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

  // ============================================================
  // DATA NORMALIZATION
  // ============================================================
  function proc(rows,H){
    const C={
      id:         fc(H,'ID','Id','id','Código','Codigo','Num','Número','Numero'),
      contato:    fc(H,'Nome Contato','Nome do Contato','Responsável','Responsavel','Nome','Representante'),
      empresa:    fc(H,'Empresa','Nome Empresa','Nome da Empresa','Razão Social','Razao Social'),
      cargo:      fc(H,'Cargo','Função','Funcao','Título','Titulo'),
      nivel:      fc(H,'Nível Hierárquico','Nivel Hierarquico','Nível','Nivel','Hierarquia'),
      celular:    fc(H,'Contato','Celular Corporativo','Celular','Telefone','Fone','WhatsApp','Whatsapp','Tel','Número','Numero'),
      porte:      fc(H,'Porte','Porte Empresa','Tamanho','Funcionários','Funcionarios','Colaboradores'),
      plataforma: fc(H,'Possui Automação','Possui Automacao','Já Usa Plataforma Similar','Ja Usa Plataforma Similar','Plataforma Similar','Plataforma','Automação','Automacao','Sistema Atual','Usa Plataforma'),
      dor:        fc(H,'Principal Dor Identificada','Dor Identificada','Dor Principal','Dor','Problema Principal','Necessidade'),
      obs:        fc(H,'Observações Estratégicas','Observacoes Estrategicas','Observações','Observacoes','Obs','Notas','Anotações','Anotacoes'),
      ultima:     fc(H,'Última Interação','Ultima Interacao','Ultima Interação','Último Contato','Ultimo Contato','Data Contato','Data Ultima Interacao'),
      followups:  fc(H,'Follow-ups Realizados','Followups Realizados','Follow ups Realizados','Nº Follow-ups','Numero Followups','Qtd Followups','Follow-up','Followup'),
      interacoes: fc(H,'Interações Totais','Interacoes Totais','Total Interações','Total Interacoes','Interações','Interacoes','Nº Interações'),
      status:     fc(H,'Status Lead','Status do Lead','Etapa','Fase'),
      statusb:    fc(H,'Status'),                                          // col B — Status comercial (editável)
      proxfu:     fc(H,'Próximo Follow-up','Proximo Follow-up','Proximo Followup','Próximo Followup','Data Follow-up','Data Followup','Próximo Contato','Proximo Contato'),
      prioridade: fc(H,'Prioridade','Prioridade Lead','Urgência','Urgencia'),
      acao:       fc(H,'Ação','Acao','Próxima Ação','Proxima Acao','Ação Necessária','Acao Necessaria'),
      chance:     fc(H,'Chance Fechamento','Chance de Fechamento','Probabilidade','Probabilidade Fechamento','% Fechamento'),
      segmento:   fc(H,'Segmento','Segmento Principal','Setor','Ramo','Ramo de Atividade','Área','Area','Setor de Atuação','Setor de Atuacao'),
      email:      fc(H,'E-mail Direto','E-mail','Email','E-Mail','Correio'),
      linkedin:   fc(H,'LinkedIn Pessoal','Linkedin Pessoal','LinkedIn','Linkedin','Perfil LinkedIn','Perfil Linkedin','URL LinkedIn','Link LinkedIn','LinkedIn do Responsável','Rede Social','Perfil','LinkedIn Contato'),
      linkedinco: fc(H,'LinkedIn Empresa','Linkedin Empresa','linkedin empresa','LinkedIn da Empresa','Empresa LinkedIn'),
      site:       fc(H,'Site','Website','URL','Homepage','site'),
      cidade:     fc(H,'Cidade','Localização','Localizacao','Município','Municipio','Piracicaba','piracicaba','cidade','Local'),
      diagnostico:fc(H,'Diagnóstico Enviado','Diagnostico Enviado','Diagnóstico','Diagnostico','ROI Enviado','Relatorio Enviado','Relatório Enviado'),
      atraso:     fc(H,'Atraso Real','Atraso','Delay','Dias de Atraso','Dias Atraso'),
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
    kpis();charts();strip();filters();tbl();
  }

  // ============================================================
  // KPI
  // ============================================================
  function kpis(){
    const n=leads.length;
    document.getElementById('kT').textContent=n;
    document.getElementById('kBadge1').textContent=leads.filter(l=>l.status).length+' com status';
    document.getElementById('kA').textContent=leads.filter(l=>l.prioridade==='ALTA'||l.prioridade==='CRÍTICO').length;
    document.getElementById('kF').textContent=leads.filter(l=>l.acao&&l.acao.includes('FOLLOW')).length;
    document.getElementById('kW').textContent=leads.filter(l=>l.acao&&l.acao.includes('AGUARDAR')).length;
    document.getElementById('kH').textContent=leads.filter(l=>pct(l.chance)>10).length;
    const diagCount=leads.filter(l=>l.diagnostico&&l.diagnostico.toLowerCase().startsWith('s')).length;
    const badgeEl=document.getElementById('kBadgeDiag');
    if(badgeEl) badgeEl.textContent=diagCount+' diagnóst.';
  }

  // ============================================================
  // CHARTS
  // ============================================================
  function charts(){
    Object.values(ch).forEach(c=>c.destroy());ch={};
    Chart.defaults.color='#8E8E93';Chart.defaults.borderColor='#E5E5EA';
    Chart.defaults.font.family="'Inter',sans-serif";

    const sc={};
    leads.forEach(l=>{if(l.status)sc[l.status]=(sc[l.status]||0)+1;});
    delete sc['Novo'];
    delete sc['Perdido'];
    function _sOrd(s){if(s==='Primeiro contato')return 0;const m=s.match(/^Follow-up\s+(\d+)/i);return m?parseInt(m[1]):999;}
    const ss=Object.entries(sc).sort((a,b)=>_sOrd(a[0])-_sOrd(b[0]));
    ch.s=new Chart(document.getElementById('cS'),{type:'bar',
      data:{labels:ss.map(s=>s[0]),datasets:[{data:ss.map(s=>s[1]),backgroundColor:['#FFE5D6','#FDBA74','#FF5A00','#CC4A00','#9A3800','#5C2200'],borderRadius:6,borderSkipped:false}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:10},color:'#8E8E93'}},y:{grid:{color:'#F0F0F0'},ticks:{stepSize:1,color:'#8E8E93'}}}}
    });

    const pc={};leads.forEach(l=>{if(l.prioridade)pc[l.prioridade]=(pc[l.prioridade]||0)+1;});
    delete pc['-'];delete pc[''];delete pc['—'];
    ch.p=new Chart(document.getElementById('cP'),{type:'doughnut',
      data:{labels:Object.keys(pc),datasets:[{data:Object.values(pc),backgroundColor:Object.keys(pc).map(k=>({ALTA:'#DC2626',MÉDIA:'#FF5A00',BAIXA:'#8E8E93'}[k]||'#C7C7CC')),borderColor:'#FFFFFF',borderWidth:3,hoverOffset:5}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'68%',plugins:{legend:{position:'bottom',labels:{usePointStyle:true,padding:12,font:{size:11},color:'#404045'}}}}
    });

    const gc={};leads.forEach(l=>l.segmento.split(',').forEach(s=>{const k=s.trim();if(k)gc[k]=(gc[k]||0)+1;}));
    const top=Object.entries(gc).sort((a,b)=>b[1]-a[1]).slice(0,7);
    ch.g=new Chart(document.getElementById('cG'),{type:'bar',
      data:{labels:top.map(s=>s[0]),datasets:[{data:top.map(s=>s[1]),backgroundColor:'#FFE5D6',borderColor:'#FF5A00',borderWidth:2,borderRadius:5,borderSkipped:false}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:'#F0F0F0'},ticks:{stepSize:1,color:'#8E8E93'}},y:{grid:{display:false},ticks:{font:{size:10},color:'#404045'}}}}
    });
  }

  // ============================================================
  // FOLLOW-UP
  // ============================================================
  function strip(){
    const td=new Date();td.setHours(0,0,0,0);
    const sn=new Date(td);sn.setDate(sn.getDate()+5);
    const el=document.getElementById('fuI');el.innerHTML='';
    const u=leads.filter(l=>l.proxfu&&l.acao&&l.acao.includes('FOLLOW')).map(l=>({...l,_d:pd(l.proxfu)})).filter(l=>l._d&&l._d<=sn).sort((a,b)=>a._d-b._d).slice(0,16);
    if(!u.length){el.innerHTML='<span style="color:#8E8E93;font-size:11px">Nenhum follow-up urgente nos próximos 5 dias</span>';return;}
    u.forEach(l=>{const d=document.createElement('div');d.className='fuchip'+(l._d<td?' ov':'');d.innerHTML=`<span class="co">${x(l.empresa)}</span><span class="dt">${x(l.proxfu)}</span>`;d.onclick=()=>om(l);el.appendChild(d);});
  }

  // ============================================================
  // FILTERS
  // ============================================================
  function filters(){
    const ss=[...new Set(leads.map(l=>l.status).filter(Boolean))];
    const s1=document.getElementById('fSt');s1.innerHTML='<option value="">Todos os Status</option>';
    ss.forEach(s=>s1.insertAdjacentHTML('beforeend',`<option>${s}</option>`));
    const sg=[...new Set(leads.flatMap(l=>l.segmento.split(',').map(s=>s.trim())).filter(Boolean))].sort();
    const s2=document.getElementById('fSg');s2.innerHTML='<option value="">Todos os Segmentos</option>';
    sg.forEach(s=>s2.insertAdjacentHTML('beforeend',`<option>${s}</option>`));
    if(!filtersBound){
      ['fQ','fSt','fPr','fAc','fSg'].forEach(id=>document.getElementById(id).addEventListener('input',tbl));
      filtersBound = true;
    }
  }

  // ============================================================
  // TABLE
  // ============================================================
  function srt(k){sa=sk===k?!sa:true;sk=k;tbl();}
  function tbl(){
    const q=document.getElementById('fQ').value.toLowerCase();
    const fS=document.getElementById('fSt').value,fP=document.getElementById('fPr').value;
    const fA=document.getElementById('fAc').value,fG=document.getElementById('fSg').value;
    let list=leads.filter(l=>{
      if(q&&!l.empresa.toLowerCase().includes(q)&&!l.contato.toLowerCase().includes(q))return false;
      if(fS&&l.status!==fS)return false;if(fP&&l.prioridade!==fP)return false;
      if(fA&&!l.acao.toUpperCase().includes(fA))return false;if(fG&&!l.segmento.includes(fG))return false;
      return true;
    });
    if(sk){list=[...list].sort((a,b)=>{let va=a[sk]||'',vb=b[sk]||'';if(sk==='chance'){va=pct(va);vb=pct(vb);return sa?va-vb:vb-va;}return sa?va.localeCompare(vb,'pt'):vb.localeCompare(va,'pt');});}
    document.getElementById('cnt').textContent=list.length+' lead'+(list.length!==1?'s':'');
    document.getElementById('tblCount').textContent=list.length+' registros';
    const tb=document.getElementById('tb');
    if(!list.length){tb.innerHTML='<tr><td colspan="10"><div class="empt"><span>🔍</span>Nenhum resultado com os filtros aplicados.</div></td></tr>';return;}
    tb.innerHTML=list.map(l=>{
      const cv=pct(l.chance),cc=cv>20?'pH':cv>10?'pM':'pL';
      const pc2={CRÍTICO:'cA',ALTA:'cA',MÉDIA:'cM',BAIXA:'cB'}[l.prioridade]||'cS';
      const isLost=l.status==='Encerrado';
      const isFechado=l.status==='Convertido';
      const isReuniao=l.status==='Reunião agendada';
      const ac=isFechado?'cFechado':isReuniao?'cReuniao':isLost?'cLost':l.acao&&l.acao.includes('FOLLOW')?'cF':'cW';
      const fc2='';
      const trClass=isFechado?'is-fechado':isReuniao?'is-reuniao':isLost?'is-closed':'';
      const isDiag = l.diagnostico && l.diagnostico.toLowerCase().startsWith('s');
      return`<tr class="${trClass}" onclick="om(leads[${leads.indexOf(l)}])">
        <td class="te">${x(l.empresa)}</td>
        <td class="tcn">${x(l.contato)||'—'}</td>
        <td class="tsg">${x(l.segmento)||'—'}</td>
        <td>${l.status?`<span class="chip cS">${x(l.status)}</span>`:'—'}</td>
        <td>${(isLost||isFechado)?`<span style="color:var(--t3);font-size:10px">N/A</span>`:(l.prioridade?`<span class="chip ${pc2}">${l.prioridade}</span>`:'—')}</td>
        <td>${isFechado?`<span class="chip cFechado">Convertido ✓</span>`:isLost?`<span class="chip cLost">Encerrado</span>`:(l.acao?`<span class="chip ${ac}">${l.acao.length>14?l.acao.slice(0,14)+'…':x(l.acao)}</span>`:'—')}</td>
        <td>${isDiag?`<span class="chip cDiag" title="Diagnóstico enviado">✓ Diag.</span>`:l.diagnostico?`<span class="chip cDiagNo" title="${x(l.diagnostico)}">✕</span>`:'<span style="color:var(--t4);font-size:10px">—</span>'}</td>
        <td>${(isLost||isFechado)?`<span style="color:var(--t3);font-size:10px">N/A</span>`:`<span class="pct ${cc}">${x(l.chance)||'—'}</span>`}</td>
        <td>${(isLost||isFechado)?`<span style="color:var(--t3);font-size:10px">N/A</span>`:`<span class="fudt ${fc2}">${x(l.proxfu)||'—'}</span>`}</td>
        <td style="font-family:'JetBrains Mono',monospace;font-size:10px;color:#8E8E93">${l.interacoes||'—'}</td>
      </tr>`;
    }).join('');
  }

  // ============================================================
  // MODAL
  // ============================================================
  function om(l){
    currentLead=l;
    document.getElementById('mEmp').textContent=l.empresa||'—';
    document.getElementById('mSub').textContent=(l.contato||'—')+(l.cargo?' · '+l.cargo:'')+(l.nivel?' · '+l.nivel:'');
    const pc2={CRÍTICO:'cA',ALTA:'cA',MÉDIA:'cM',BAIXA:'cB'}[l.prioridade]||'';
    const isLost=l.status==='Encerrado';
      const isFechado=l.status==='Convertido';
      const isReuniao=l.status==='Reunião agendada';
      const ac=isFechado?'cFechado':isReuniao?'cReuniao':isLost?'cLost':l.acao&&l.acao.includes('FOLLOW')?'cF':'cW';
    const cv=pct(l.chance),cc=cv>20?'pH':cv>10?'pM':'pL';
    document.getElementById('mChips').innerHTML=`
      ${l.prioridade?`<span class="chip ${pc2}">${l.prioridade}</span>`:''}
      ${l.status?`<span class="chip cS">${x(l.status)}</span>`:''}
      ${l.acao?`<span class="chip ${ac}">${x(l.acao)}</span>`:''}
      ${l.chance?`<span class="chip cS"><span class="pct ${cc}">${x(l.chance)}</span> fechamento</span>`:''}`;
    document.getElementById('mInfo').innerHTML=`
      <div class="mfield"><label>Segmento</label><p>${x(l.segmento)||'—'}</p></div>
      <div class="mfield"><label>Porte</label><p>${x(l.porte)||'—'}</p></div>
      <div class="mfield"><label>Celular</label><p>${x(l.celular)||'—'}</p></div>
      <div class="mfield"><label>Interações Totais</label><p style="font-family:'JetBrains Mono',monospace">${l.interacoes||'—'}</p></div>
      <div class="mfield"><label>Follow-ups Realizados</label><p style="font-family:'JetBrains Mono',monospace">${l.followups||'—'}</p></div>
      ${l.cidade?`<div class="mfield"><label>Cidade</label><p>${x(l.cidade)}</p></div>`:''}
      ${l.diagnostico?`<div class="mfield"><label>Diagnóstico Enviado</label><p>${l.diagnostico.toLowerCase().startsWith('s')?`<span class="chip cDiag">✓ Enviado</span>`:`<span class="chip cDiagNo">✕ Não enviado</span>`}</p></div>`:''}
      `;
    document.getElementById('eUltima').value = formatDateBR(l.ultima||'');
    document.getElementById('eFollowups').value=l.followups ||'';
    document.getElementById('eDiagnostico').value = l.diagnostico||'';
    document.getElementById('ePlataforma').value   = l.plataforma ||'';
    document.getElementById('eCelular').value      = l.celular    ||'';
    document.getElementById('eDor').value          = l.dor        ||'';
    document.getElementById('eObs').value          = l.obs        ||'';
    document.getElementById('eStatus').value = l.statusb || '';

    const lk=[l.site?`<a class="mlink" href="${l.site}" target="_blank">🌐 Site</a>`:'',l.linkedin?`<a class="mlink" href="${l.linkedin}" target="_blank">🔗 LinkedIn</a>`:'',l.linkedinco?`<a class="mlink" href="${l.linkedinco}" target="_blank">🏢 Empresa</a>`:'',l.email?`<a class="mlink" href="mailto:${l.email}">✉️ ${x(l.email)}</a>`:''].filter(Boolean).join('');
    document.getElementById('mObsWrap').innerHTML=''; // dor e obs agora são editáveis acima
    document.getElementById('mLinks').innerHTML=lk;
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

  loadData();
  });
