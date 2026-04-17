// ─── Constantes ────────────────────────────────────────────────────────────────
const STORAGE_KEY = "ffDashboard_v3";
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MESES_CORTO = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const COLORS = { teal:"#1D9E75", blue:"#378ADD", coral:"#D85A30", amber:"#BA7517", purple:"#7F77DD", green:"#639922", red:"#E24B4A", pink:"#D4537E" };
const COL_ARR = Object.values(COLORS);

// ─── Estructura de datos ───────────────────────────────────────────────────────
// data.periodos[año][mes] = { ingresos:[], gastos:[], inversiones:[], deudas:[], ahorros:[] }
// data.alertas_config = { ... }

const periodoVacio = () => ({
  ingresos: [
    {id:1, nombre:"Salario Perico", cantidad:2800, tipo:"mensual"},
    {id:2, nombre:"Salario Mujer", cantidad:2200, tipo:"mensual"},
  ],
  gastos: [
    {id:1, nombre:"Hipoteca", cantidad:850, categoria:"Vivienda"},
    {id:2, nombre:"Supermercado", cantidad:500, categoria:"Alimentación"},
    {id:3, nombre:"Suministros", cantidad:180, categoria:"Suministros"},
    {id:4, nombre:"Ocio", cantidad:300, categoria:"Ocio"},
  ],
  inversiones: [
    {id:1, nombre:"Fondo indexado S&P500", valor:12500, aporte:200, rentabilidad:8.5},
    {id:2, nombre:"Plan de Pensiones", valor:8900, aporte:100, rentabilidad:5.2},
  ],
  deudas: [
    {id:1, nombre:"Hipoteca Vivienda", total:140000, pendiente:112000, cuota:850, interes:2.1},
  ],
  ahorros: [
    {id:1, nombre:"Fondo de Emergencia", actual:8000, objetivo:15000},
    {id:2, nombre:"Vacaciones Verano", actual:1200, objetivo:3000},
  ],
});

const now = new Date();
const initialData = () => {
  const periodos = {};
  const anio = now.getFullYear();
  const mes = now.getMonth();
  if (!periodos[anio]) periodos[anio] = {};
  periodos[anio][mes] = periodoVacio();
  return { periodos, alertas_config: { balance_minimo:500, deuda_max_ingreso_pct:40, ahorro_minimo:5000, fondo_emergencia_meses:3 } };
};

// ─── Estado global ─────────────────────────────────────────────────────────────
let data = (() => { try { const d = localStorage.getItem(STORAGE_KEY); return d ? JSON.parse(d) : initialData(); } catch(_){ return initialData(); } })();
let activeTab = "resumen";
let currentAnio = now.getFullYear();
let currentMes = now.getMonth();
let modalState = null;
let formData = {};
let chartInstances = {};

// Asegura que el período actual existe
const ensurePeriodo = (a, m) => {
  if (!data.periodos[a]) data.periodos[a] = {};
  if (!data.periodos[a][m]) {
    // Copia el período anterior si existe
    const prev = getPeriodo(m === 0 ? a-1 : a, m === 0 ? 11 : m-1);
    data.periodos[a][m] = prev ? JSON.parse(JSON.stringify(prev)) : periodoVacio();
  }
  return data.periodos[a][m];
};
const getPeriodo = (a, m) => data.periodos[a]?.[m] || null;
const currentPeriodo = () => ensurePeriodo(currentAnio, currentMes);

// ─── Persistencia ──────────────────────────────────────────────────────────────
let savedTimer = null;
const save = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  const ind = document.getElementById("save-ind");
  if (ind) { ind.textContent = "✓ Guardado"; clearTimeout(savedTimer); savedTimer = setTimeout(()=>{ if(ind) ind.textContent=""; },1500); }
};

// ─── Utilidades ────────────────────────────────────────────────────────────────
const fmt = (n,dec=0) => (n||0).toLocaleString("es-ES",{minimumFractionDigits:dec,maximumFractionDigits:dec});
const fmtEur = n => "€"+fmt(n);
const sum = (arr,k) => (arr||[]).reduce((s,x)=>s+(x[k]||0),0);

const totalsOf = (p) => {
  if (!p) return { tI:0, tG:0, tInv:0, tD:0, tA:0, aM:0, balance:0, pneto:0, cuotas:0, deudaRatio:0 };
  const tI = sum(p.ingresos,"cantidad"), tG = sum(p.gastos,"cantidad");
  const tInv = sum(p.inversiones,"valor"), tD = sum(p.deudas,"pendiente");
  const tA = sum(p.ahorros,"actual"), aM = sum(p.inversiones,"aporte");
  const cuotas = sum(p.deudas,"cuota");
  return { tI, tG, tInv, tD, tA, aM, balance:tI-tG, pneto:tInv+tA-tD, cuotas, deudaRatio: tI>0?(cuotas/tI)*100:0 };
};

// ─── Helpers DOM ───────────────────────────────────────────────────────────────
const el = (tag, attrs={}, ...children) => {
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)) {
    if (k==="class") e.className=v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(),v);
    else e.setAttribute(k,v);
  }
  children.forEach(c => { if(c!=null) e.append(typeof c==="string"||typeof c==="number"?document.createTextNode(c):c); });
  return e;
};

const metricCard = (label,value,color,sub) => {
  const d = el("div",{class:"metric"});
  d.innerHTML = `<div class="metric-label">${label}</div><div class="metric-value" style="color:${color||"var(--text)"}">${value}</div>${sub?`<div class="metric-sub">${sub}</div>`:""}`;
  return d;
};
const progressBar = (pct,color) => {
  const w = el("div",{class:"progress-wrap"});
  w.innerHTML = `<div class="progress-bar" style="width:${Math.min(pct,100)}%;background:${color}"></div>`;
  return w;
};
const alertBadge = (type,msg) => {
  const d = el("div",{class:`alert alert-${type}`});
  d.innerHTML = `<span style="font-weight:500;flex-shrink:0">${{ok:"✓",warn:"⚠",danger:"!"}[type]}</span><span>${msg}</span>`;
  return d;
};

// ─── Gráficos ─────────────────────────────────────────────────────────────────
const destroyChart = id => { if(chartInstances[id]){chartInstances[id].destroy();delete chartInstances[id];} };
const barChart = (id, labels, datasets) => {
  destroyChart(id);
  const ctx = document.getElementById(id)?.getContext("2d"); if(!ctx) return;
  chartInstances[id] = new Chart(ctx,{type:"bar",data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{grid:{color:"rgba(128,128,128,0.15)"}}}}});
};
const donutChart = (id, labels, values, colors) => {
  destroyChart(id);
  const ctx = document.getElementById(id)?.getContext("2d"); if(!ctx) return;
  chartInstances[id] = new Chart(ctx,{type:"doughnut",data:{labels,datasets:[{data:values,backgroundColor:colors,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"right",labels:{boxWidth:12,font:{size:12}}}}}});
};

// ─── Selector de mes/año ───────────────────────────────────────────────────────
const renderPeriodoSelector = () => {
  const wrap = el("div", {style:"display:flex;align-items:center;gap:6px;background:var(--bg2);border-radius:var(--radius);padding:6px 12px;margin-bottom:16px;flex-wrap:wrap"});

  const prevBtn = el("button",{class:"btn",style:"font-size:16px;padding:2px 10px;border:none",onClick:()=>{
    if(currentMes===0){currentAnio--;currentMes=11;}else{currentMes--;}
    render();
  }},"‹");

  const label = el("span",{style:"font-size:14px;font-weight:500;min-width:140px;text-align:center"},`${MESES[currentMes]} ${currentAnio}`);

  const nextBtn = el("button",{class:"btn",style:"font-size:16px;padding:2px 10px;border:none",onClick:()=>{
    if(currentMes===11){currentAnio++;currentMes=0;}else{currentMes++;}
    render();
  }},"›");

  // Selector directo de mes
  const selMes = el("select",{style:"font-family:inherit;background:var(--bg);color:var(--text);border:0.5px solid var(--border2);border-radius:var(--radius);padding:4px 8px;font-size:13px"});
  MESES.forEach((m,i)=>{ const o=el("option",{value:i},m); if(i===currentMes) o.selected=true; selMes.append(o); });
  selMes.addEventListener("change",()=>{ currentMes=parseInt(selMes.value); render(); });

  // Selector directo de año
  const anios = new Set([now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1]);
  Object.keys(data.periodos).forEach(a=>anios.add(parseInt(a)));
  const selAnio = el("select",{style:"font-family:inherit;background:var(--bg);color:var(--text);border:0.5px solid var(--border2);border-radius:var(--radius);padding:4px 8px;font-size:13px"});
  [...anios].sort().forEach(a=>{ const o=el("option",{value:a},a); if(a===currentAnio) o.selected=true; selAnio.append(o); });
  selAnio.addEventListener("change",()=>{ currentAnio=parseInt(selAnio.value); render(); });

  // Indicador de si hay datos en este período
  const hasDatos = !!getPeriodo(currentAnio, currentMes);
  const badge = el("span",{style:`font-size:11px;padding:2px 8px;border-radius:10px;background:${hasDatos?"#EAF3DE":"#FAEEDA"};color:${hasDatos?"#3B6D11":"#854F0B"}`}, hasDatos?"Con datos":"Nuevo período");

  wrap.append(prevBtn, selMes, selAnio, nextBtn, label, badge);
  return wrap;
};

// ─── Historial comparativo (todos los períodos) ────────────────────────────────
const getHistorialCompleto = () => {
  const result = [];
  Object.keys(data.periodos).sort().forEach(a => {
    Object.keys(data.periodos[a]).sort((x,y)=>parseInt(x)-parseInt(y)).forEach(m => {
      const p = data.periodos[a][m];
      const t = totalsOf(p);
      result.push({ label:`${MESES_CORTO[m]} ${a}`, ingresos:t.tI, gastos:t.tG, balance:t.balance });
    });
  });
  return result;
};

// ─── PDF ──────────────────────────────────────────────────────────────────────
const buildPdf = (mode) => {
  const p = currentPeriodo(), t = totalsOf(p);
  const dateStr = new Date().toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"});
  const periodoStr = `${MESES[currentMes]} ${currentAnio}`;
  const tr = (cells,h=false)=>`<tr>${cells.map(c=>`<td style="padding:6px 8px;border:1px solid #eee;${h?"font-weight:600;background:#f5f5f5":""}">${c}</td>`).join("")}</tr>`;
  const section = (title,rows)=>`<h3 style="margin:20px 0 8px;font-size:14px;border-bottom:1px solid #ddd;padding-bottom:4px">${title}</h3><table style="width:100%;border-collapse:collapse;font-size:12px">${rows}</table>`;
  let body="";
  if(mode==="semana"){
    const r=1/4.33;
    body=`<h2>Resumen Semanal — ${periodoStr}</h2><p style="color:#666;font-size:12px">${dateStr}</p>
    <div style="display:flex;gap:12px;margin:16px 0">
      ${[["Ingresos semana",t.tI*r,COLORS.teal],["Gastos semana",t.tG*r,COLORS.coral],["Balance semana",t.balance*r,t.balance>=0?COLORS.teal:COLORS.red]].map(([l,v,c])=>`<div style="flex:1;background:#f9f9f9;border-radius:8px;padding:12px"><div style="font-size:11px;color:#666">${l}</div><div style="font-size:18px;font-weight:600;color:${c}">€${fmt(v,2)}</div></div>`).join("")}
    </div>
    ${section("Ingresos",tr(["Fuente","Mensual","Semanal"],true)+p.ingresos.map(i=>tr([i.nombre,fmtEur(i.cantidad),`€${fmt(i.cantidad/4.33,2)}`])).join(""))}
    ${section("Gastos",tr(["Concepto","Categoría","Mensual","Semanal"],true)+p.gastos.map(g=>tr([g.nombre,g.categoria,fmtEur(g.cantidad),`€${fmt(g.cantidad/4.33,2)}`])).join(""))}`;
  } else if(mode==="mes"){
    body=`<h2>Resumen Mensual — ${periodoStr}</h2><p style="color:#666;font-size:12px">${dateStr}</p>
    <div style="display:flex;gap:12px;margin:16px 0">
      ${[["Ingresos",t.tI,COLORS.teal],["Gastos",t.tG,COLORS.coral],["Balance",t.balance,t.balance>=0?COLORS.teal:COLORS.red]].map(([l,v,c])=>`<div style="flex:1;background:#f9f9f9;border-radius:8px;padding:12px"><div style="font-size:11px;color:#666">${l}</div><div style="font-size:18px;font-weight:600;color:${c}">${fmtEur(v)}</div></div>`).join("")}
    </div>
    ${section("Ingresos",tr(["Fuente","Tipo","Importe"],true)+p.ingresos.map(i=>tr([i.nombre,i.tipo,fmtEur(i.cantidad)])).join("")+tr(["<b>Total</b>","",`<b>${fmtEur(t.tI)}</b>`]))}
    ${section("Gastos",tr(["Concepto","Categoría","Importe"],true)+p.gastos.map(g=>tr([g.nombre,g.categoria,fmtEur(g.cantidad)])).join("")+tr(["<b>Total</b>","",`<b>${fmtEur(t.tG)}</b>`]))}`;
  } else {
    const hist = getHistorialCompleto();
    body=`<h2>Informe Completo — ${periodoStr}</h2><p style="color:#666;font-size:12px">${dateStr}</p>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0">
      ${[["Patrimonio neto",t.pneto,t.pneto>=0?COLORS.teal:COLORS.red],["Balance mensual",t.balance,t.balance>=0?COLORS.teal:COLORS.red],["Total inversiones",t.tInv,COLORS.blue],["Total deudas",t.tD,COLORS.coral],["Total ahorros",t.tA,COLORS.teal],["Aporte mensual",t.aM,COLORS.blue]].map(([l,v,c])=>`<div style="background:#f9f9f9;border-radius:8px;padding:10px"><div style="font-size:10px;color:#666">${l}</div><div style="font-size:16px;font-weight:600;color:${c}">${fmtEur(v)}</div></div>`).join("")}
    </div>
    ${section("Ingresos",tr(["Fuente","Tipo","€/mes"],true)+p.ingresos.map(i=>tr([i.nombre,i.tipo,fmtEur(i.cantidad)])).join("")+tr(["<b>Total</b>","",`<b>${fmtEur(t.tI)}</b>`]))}
    ${section("Gastos",tr(["Concepto","Categoría","€/mes"],true)+p.gastos.map(g=>tr([g.nombre,g.categoria,fmtEur(g.cantidad)])).join("")+tr(["<b>Total</b>","",`<b>${fmtEur(t.tG)}</b>`]))}
    ${section("Inversiones",tr(["Activo","Valor","Aporte/mes","Rentab.%"],true)+p.inversiones.map(i=>tr([i.nombre,fmtEur(i.valor),fmtEur(i.aporte),`${fmt(i.rentabilidad,1)}%`])).join(""))}
    ${section("Deudas",tr(["Deuda","Total","Pendiente","Cuota","TIN%"],true)+p.deudas.map(d=>tr([d.nombre,fmtEur(d.total),fmtEur(d.pendiente),fmtEur(d.cuota),`${fmt(d.interes,1)}%`])).join(""))}
    ${section("Ahorros",tr(["Objetivo","Ahorrado","Meta","%"],true)+p.ahorros.map(a=>tr([a.nombre,fmtEur(a.actual),fmtEur(a.objetivo),`${fmt((a.actual/Math.max(a.objetivo,1))*100,0)}%`])).join(""))}
    ${section("Historial todos los períodos",tr(["Período","Ingresos","Gastos","Balance"],true)+hist.map(h=>tr([h.label,fmtEur(h.ingresos),fmtEur(h.gastos),fmtEur(h.balance)])).join(""))}`;
  }
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Finanzas</title><style>body{font-family:Arial,sans-serif;max-width:900px;margin:0 auto;padding:24px;color:#222}table{width:100%;border-collapse:collapse}@media print{body{padding:12px}}</style></head><body><h1 style="font-size:20px;margin-bottom:4px">Panel de Finanzas Familiares</h1>${body}<p style="font-size:10px;color:#aaa;margin-top:32px">Generado el ${dateStr}</p></body></html>`;
  const w=window.open("","_blank"); w.document.write(html); w.document.close(); setTimeout(()=>w.print(),500);
};

// ─── Modal CRUD ───────────────────────────────────────────────────────────────
const fieldLabels={nombre:"Nombre",cantidad:"Importe (€)",tipo:"Tipo",categoria:"Categoría",valor:"Valor actual (€)",aporte:"Aporte mensual (€)",rentabilidad:"Rentabilidad %",total:"Total deuda (€)",pendiente:"Pendiente (€)",cuota:"Cuota/mes (€)",interes:"Interés % TIN",actual:"Ahorrado (€)",objetivo:"Objetivo (€)"};
const sectionLabels={ingresos:"Ingreso",gastos:"Gasto",inversiones:"Inversión",deudas:"Deuda",ahorros:"Objetivo"};

const closeModal = () => { modalState=null; document.getElementById("modal-overlay")?.remove(); };

const openModal = (type, sec, item=null) => {
  const templates={ingresos:{nombre:"",cantidad:0,tipo:"mensual"},gastos:{nombre:"",cantidad:0,categoria:"Vivienda"},inversiones:{nombre:"",valor:0,aporte:0,rentabilidad:0},deudas:{nombre:"",total:0,pendiente:0,cuota:0,interes:0},ahorros:{nombre:"",actual:0,objetivo:0}};
  formData = item?{...item}:{...templates[sec]};
  modalState = {type,sec,id:item?.id};
  document.getElementById("modal-overlay")?.remove();
  const overlay = el("div",{class:"overlay",id:"modal-overlay",onClick:e=>{if(e.target===overlay)closeModal();}});
  const modal = el("div",{class:"modal"});
  modal.append(el("div",{class:"modal-header"},
    el("span",{},`${type==="add"?"Añadir":"Editar"} ${sectionLabels[sec]}`),
    el("button",{onClick:closeModal,style:"background:none;border:none;font-size:18px;color:var(--text2);cursor:pointer"},"✕")
  ));
  Object.entries(formData).filter(([k])=>k!=="id").forEach(([k,v])=>{
    modal.append(el("label",{style:"font-size:12px;color:var(--text2);display:block;margin-bottom:4px;margin-top:12px"},fieldLabels[k]||k));
    const inp=el("input",{type:typeof v==="number"?"number":"text",value:v});
    inp.addEventListener("input",()=>{formData[k]=inp.type==="number"?parseFloat(inp.value)||0:inp.value;});
    modal.append(inp);
  });
  const btns=el("div",{style:"display:flex;gap:8px;justify-content:flex-end;margin-top:16px"});
  btns.append(
    el("button",{class:"btn",onClick:closeModal},"Cancelar"),
    el("button",{class:"btn btn-primary",onClick:()=>{
      const p=currentPeriodo();
      if(type==="add") p[sec].push({...formData,id:Date.now()});
      else { const i=p[sec].findIndex(x=>x.id===modalState.id); if(i!==-1) p[sec][i]={...formData,id:modalState.id}; }
      save(); closeModal(); render();
    }},"Guardar")
  );
  modal.append(btns);
  overlay.append(modal);
  document.body.append(overlay);
};

const delItem = (sec,id) => {
  const p=currentPeriodo(); p[sec]=p[sec].filter(x=>x.id!==parseInt(id)); save(); render();
};

// ─── PDF Modal ────────────────────────────────────────────────────────────────
const openPdfModal = () => {
  document.getElementById("pdf-overlay")?.remove();
  const overlay=el("div",{class:"overlay",id:"pdf-overlay",onClick:e=>{if(e.target===overlay)overlay.remove();}});
  const modal=el("div",{class:"modal"});
  modal.innerHTML=`<div class="modal-header"><span>Exportar a PDF</span><button onclick="this.closest('.overlay').remove()" style="background:none;border:none;font-size:18px;color:var(--text2);cursor:pointer">✕</button></div><p style="font-size:13px;color:var(--text2);margin-bottom:16px">Elige el tipo de informe para <b>${MESES[currentMes]} ${currentAnio}</b>.</p>`;
  [{mode:"semana",label:"Resumen semanal",desc:"Estimación semanal del mes actual"},{mode:"mes",label:"Resumen mensual",desc:"Balance completo del mes seleccionado"},{mode:"completo",label:"Informe completo",desc:"Todas las secciones + historial de todos los períodos"}].forEach(({mode,label,desc})=>{
    const c=el("div",{class:"card",style:"cursor:pointer;margin-bottom:10px",onClick:()=>{buildPdf(mode);overlay.remove();},onMouseenter:e=>e.currentTarget.style.borderColor="var(--border2)",onMouseleave:e=>e.currentTarget.style.borderColor="var(--border)"});
    c.innerHTML=`<div style="font-weight:500;font-size:13px">${label}</div><div style="font-size:12px;color:var(--text2);margin-top:3px">${desc}</div>`;
    modal.append(c);
  });
  overlay.append(modal); document.body.append(overlay);
};

// ─── Secciones ────────────────────────────────────────────────────────────────
const renderResumen = (p,t) => {
  const frag=document.createDocumentFragment();
  const g=el("div",{class:"grid",style:"grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-bottom:20px"});
  g.append(
    metricCard("Patrimonio neto",fmtEur(t.pneto),t.pneto>=0?COLORS.teal:COLORS.red),
    metricCard("Balance mensual",fmtEur(t.balance),t.balance>=0?COLORS.teal:COLORS.red,t.balance>=0?"Superávit":"Déficit"),
    metricCard("Ingresos",fmtEur(t.tI),null,"al mes"),
    metricCard("Gastos",fmtEur(t.tG),null,"al mes"),
    metricCard("Inversiones",fmtEur(t.tInv),COLORS.blue,`+€${fmt(t.aM)}/mes`),
    metricCard("Deuda pendiente",fmtEur(t.tD),COLORS.coral),
  );
  const hist=getHistorialCompleto();
  const card1=el("div",{class:"card",style:"margin-bottom:14px"});
  card1.innerHTML=`<h2 style="margin-bottom:12px">Evolución histórica (todos los meses)</h2><div style="position:relative;height:200px"><canvas id="chart-hist" role="img" aria-label="Historial">Historial.</canvas></div><div style="display:flex;gap:16px;margin-top:10px;font-size:12px;color:var(--text2)"><span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${COLORS.teal};margin-right:4px"></span>Ingresos</span><span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${COLORS.coral};margin-right:4px"></span>Gastos</span></div>`;
  const cats={};
  p.gastos.forEach(g2=>{cats[g2.categoria]=(cats[g2.categoria]||0)+g2.cantidad;});
  const card2=el("div",{class:"card"});
  card2.innerHTML=`<h2 style="margin-bottom:12px">Gastos de ${MESES[currentMes]} ${currentAnio}</h2><div style="position:relative;height:200px"><canvas id="chart-gastos" role="img" aria-label="Gastos">Gastos.</canvas></div>`;
  frag.append(g,card1,card2);
  setTimeout(()=>{
    barChart("chart-hist",hist.map(h=>h.label),[{label:"Ingresos",data:hist.map(h=>h.ingresos),backgroundColor:COLORS.teal},{label:"Gastos",data:hist.map(h=>h.gastos),backgroundColor:COLORS.coral}]);
    donutChart("chart-gastos",Object.keys(cats),Object.values(cats),COL_ARR.slice(0,Object.keys(cats).length));
  },50);
  return frag;
};

const renderIngastos = (p) => {
  const frag=document.createDocumentFragment();
  const grid=el("div",{style:"display:grid;grid-template-columns:1fr 1fr;gap:14px"});
  ["ingresos","gastos"].forEach(sec=>{
    const total=sum(p[sec],"cantidad");
    const card=el("div",{class:"card"});
    const hdr=el("div",{style:"display:flex;justify-content:space-between;margin-bottom:12px"});
    hdr.innerHTML=`<span style="font-weight:500;font-size:13px;text-transform:capitalize">${sec}</span><span style="font-weight:500;color:${sec==="ingresos"?COLORS.teal:COLORS.coral}">${fmtEur(total)}/mes</span>`;
    card.append(hdr);
    p[sec].forEach(item=>{
      const row=el("div",{class:"row"});
      row.innerHTML=`<div><div style="font-size:13px">${item.nombre}</div><div style="font-size:11px;color:var(--text2)">${item.categoria||item.tipo}</div></div><div style="display:flex;align-items:center;gap:6px"><span style="font-weight:500">${fmtEur(item.cantidad)}</span><button class="btn" data-sec="${sec}" data-id="${item.id}" data-action="edit">Editar</button><button class="btn" data-sec="${sec}" data-id="${item.id}" data-action="del" style="color:${COLORS.coral}">✕</button></div>`;
      card.append(row);
    });
    card.append(el("button",{class:"btn",style:"margin-top:12px;width:100%;text-align:center",onClick:()=>openModal("add",sec)},`+ Añadir ${sectionLabels[sec]}`));
    grid.append(card);
  });
  frag.append(grid);
  return frag;
};

const renderInversiones = (p,t) => {
  const frag=document.createDocumentFragment();
  const avg=p.inversiones.length?p.inversiones.reduce((s,x)=>s+x.rentabilidad,0)/p.inversiones.length:0;
  const g=el("div",{class:"grid",style:"grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-bottom:16px"});
  g.append(metricCard("Valor cartera",fmtEur(t.tInv),COLORS.blue),metricCard("Aporte mensual",fmtEur(t.aM)),metricCard("Activos",p.inversiones.length),metricCard("Rentab. media",`${fmt(avg,1)}%`,COLORS.teal));
  const card=el("div",{class:"card"});
  p.inversiones.forEach(inv=>{
    const pct=(inv.valor/Math.max(t.tInv,1))*100;
    const d=el("div",{style:"margin-bottom:16px;padding-bottom:16px;border-bottom:0.5px solid var(--border)"});
    d.innerHTML=`<div style="display:flex;justify-content:space-between;margin-bottom:6px"><div><div style="font-weight:500;font-size:13px">${inv.nombre}</div><div style="font-size:11px;color:var(--text2)">+€${fmt(inv.aporte)}/mes · ${fmt(inv.rentabilidad,1)}% rentab.</div></div><div style="text-align:right"><div style="font-weight:500;color:${COLORS.blue}">${fmtEur(inv.valor)}</div><div style="font-size:11px;color:var(--text2)">${fmt(pct,1)}%</div></div></div>`;
    d.append(progressBar(pct,COLORS.blue));
    const btns=el("div",{style:"display:flex;gap:8px;margin-top:8px"});
    btns.innerHTML=`<button class="btn" data-sec="inversiones" data-id="${inv.id}" data-action="edit">Editar</button><button class="btn" data-sec="inversiones" data-id="${inv.id}" data-action="del" style="color:${COLORS.coral}">Eliminar</button>`;
    d.append(btns); card.append(d);
  });
  card.append(el("button",{class:"btn",style:"width:100%;text-align:center",onClick:()=>openModal("add","inversiones")},"+ Añadir Inversión"));
  frag.append(g,card); return frag;
};

const renderDeudas = (p,t) => {
  const frag=document.createDocumentFragment();
  const g=el("div",{class:"grid",style:"grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-bottom:16px"});
  g.append(metricCard("Deuda total",fmtEur(t.tD),COLORS.coral),metricCard("Cuota mensual",fmtEur(t.cuotas)),metricCard("Ratio deuda/ingr.",`${fmt(t.deudaRatio,1)}%`,t.deudaRatio>data.alertas_config.deuda_max_ingreso_pct?COLORS.red:COLORS.teal));
  const card=el("div",{class:"card"});
  p.deudas.forEach(d=>{
    const pct=((d.total-d.pendiente)/Math.max(d.total,1))*100;
    const div=el("div",{style:"margin-bottom:18px;padding-bottom:18px;border-bottom:0.5px solid var(--border)"});
    div.innerHTML=`<div style="display:flex;justify-content:space-between;margin-bottom:6px"><div><div style="font-weight:500;font-size:13px">${d.nombre}</div><div style="font-size:11px;color:var(--text2)">€${fmt(d.cuota)}/mes · ${fmt(d.interes,1)}% TIN</div></div><div style="text-align:right"><div style="font-weight:500;color:${COLORS.coral}">${fmtEur(d.pendiente)}</div><div style="font-size:11px;color:var(--text2)">de ${fmtEur(d.total)}</div></div></div>`;
    div.append(progressBar(pct,COLORS.teal));
    div.innerHTML+=`<div style="font-size:11px;color:var(--text2);margin-top:4px">${fmt(pct,0)}% amortizado</div>`;
    const btns=el("div",{style:"display:flex;gap:8px;margin-top:8px"});
    btns.innerHTML=`<button class="btn" data-sec="deudas" data-id="${d.id}" data-action="edit">Editar</button><button class="btn" data-sec="deudas" data-id="${d.id}" data-action="del" style="color:${COLORS.coral}">Eliminar</button>`;
    div.append(btns); card.append(div);
  });
  card.append(el("button",{class:"btn",style:"width:100%;text-align:center",onClick:()=>openModal("add","deudas")},"+ Añadir Deuda"));
  frag.append(g,card); return frag;
};

const renderAhorros = (p) => {
  const frag=document.createDocumentFragment();
  const tA=sum(p.ahorros,"actual"),tO=sum(p.ahorros,"objetivo");
  const g=el("div",{class:"grid",style:"grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-bottom:16px"});
  g.append(metricCard("Total ahorrado",fmtEur(tA),COLORS.teal),metricCard("Objetivo total",fmtEur(tO)),metricCard("Objetivos",p.ahorros.length));
  const card=el("div",{class:"card"});
  p.ahorros.forEach(a=>{
    const pct=(a.actual/Math.max(a.objetivo,1))*100;
    const div=el("div",{style:"margin-bottom:18px;padding-bottom:18px;border-bottom:0.5px solid var(--border)"});
    div.innerHTML=`<div style="display:flex;justify-content:space-between;margin-bottom:6px"><div style="font-weight:500;font-size:13px">${a.nombre}</div><div><span style="font-weight:500;color:${COLORS.teal}">${fmtEur(a.actual)}</span><span style="font-size:12px;color:var(--text2)"> / ${fmtEur(a.objetivo)}</span></div></div>`;
    div.append(progressBar(pct,COLORS.teal));
    div.innerHTML+=`<div style="font-size:11px;color:var(--text2);margin-top:4px">${fmt(pct,0)}% · Faltan ${fmtEur(a.objetivo-a.actual)}</div>`;
    const btns=el("div",{style:"display:flex;gap:8px;margin-top:8px"});
    btns.innerHTML=`<button class="btn" data-sec="ahorros" data-id="${a.id}" data-action="edit">Editar</button><button class="btn" data-sec="ahorros" data-id="${a.id}" data-action="del" style="color:${COLORS.coral}">Eliminar</button>`;
    div.append(btns); card.append(div);
  });
  card.append(el("button",{class:"btn",style:"width:100%;text-align:center",onClick:()=>openModal("add","ahorros")},"+ Añadir Objetivo"));
  frag.append(g,card); return frag;
};

const renderAlertas = (p,t) => {
  const frag=document.createDocumentFragment();
  const ac=data.alertas_config;
  const alerts=[];
  if(t.balance<ac.balance_minimo) alerts.push({type:"danger",msg:`Balance (${fmtEur(t.balance)}) bajo el mínimo (${fmtEur(ac.balance_minimo)}).`});
  else alerts.push({type:"ok",msg:`Balance saludable: ${fmtEur(t.balance)}.`});
  if(t.deudaRatio>ac.deuda_max_ingreso_pct) alerts.push({type:"danger",msg:`Ratio deuda/ingresos: ${fmt(t.deudaRatio,1)}% (máx. ${ac.deuda_max_ingreso_pct}%).`});
  else alerts.push({type:"ok",msg:`Ratio deuda/ingresos correcto: ${fmt(t.deudaRatio,1)}%.`});
  const em=p.ahorros.find(a=>a.nombre.toLowerCase().includes("emergencia"));
  const meses=em?em.actual/Math.max(t.tG,1):0;
  if(meses<ac.fondo_emergencia_meses) alerts.push({type:"warn",msg:`Fondo emergencia: ${fmt(meses,1)} meses. Objetivo: ${ac.fondo_emergencia_meses}.`});
  else alerts.push({type:"ok",msg:`Fondo de emergencia cubre ${fmt(meses,1)} meses.`});
  const hd=p.deudas.find(d=>d.interes>10);
  if(hd) alerts.push({type:"warn",msg:`"${hd.nombre}" tiene interés alto: ${fmt(hd.interes,1)}%.`});
  if(t.tA<ac.ahorro_minimo) alerts.push({type:"warn",msg:`Ahorros totales (${fmtEur(t.tA)}) bajo el mínimo (${fmtEur(ac.ahorro_minimo)}).`});
  const sd=el("div",{style:"margin-bottom:16px"});
  sd.append(el("h2",{style:"margin-bottom:12px"},"Estado financiero"));
  alerts.forEach(a=>sd.append(alertBadge(a.type,a.msg)));
  const cfg=el("div",{class:"card"});
  cfg.append(el("h2",{style:"margin-bottom:14px"},"Configurar umbrales"));
  [{key:"balance_minimo",label:"Balance mínimo mensual (€)"},{key:"deuda_max_ingreso_pct",label:"Cuotas deuda máx. % ingresos"},{key:"ahorro_minimo",label:"Ahorro total mínimo (€)"},{key:"fondo_emergencia_meses",label:"Meses fondo de emergencia"}].forEach(({key,label})=>{
    const lbl=el("label",{style:"font-size:12px;color:var(--text2);display:block;margin-bottom:4px;margin-top:12px"},label);
    const inp=el("input",{type:"number",value:ac[key]});
    inp.addEventListener("input",()=>{data.alertas_config[key]=parseFloat(inp.value)||0;save();render();});
    cfg.append(lbl,inp);
  });
  frag.append(sd,cfg); return frag;
};

const renderGraficos = (p,t) => {
  const frag=document.createDocumentFragment();
  const hist=getHistorialCompleto();
  const cats={};p.gastos.forEach(g=>{cats[g.categoria]=(cats[g.categoria]||0)+g.cantidad;});
  const cards=[
    {id:"chart-pat",title:"Composición del patrimonio",h:200,fn:()=>donutChart("chart-pat",["Inversiones","Ahorros","Deuda"],[t.tInv,t.tA,t.tD],[COLORS.blue,COLORS.teal,COLORS.coral])},
    {id:"chart-evol",title:"Evolución histórica (todos los meses)",h:200,fn:()=>barChart("chart-evol",hist.map(h=>h.label),[{label:"Ingresos",data:hist.map(h=>h.ingresos),backgroundColor:COLORS.teal},{label:"Gastos",data:hist.map(h=>h.gastos),backgroundColor:COLORS.coral}])},
    {id:"chart-cart",title:"Cartera de inversiones",h:200,fn:()=>donutChart("chart-cart",p.inversiones.map(i=>i.nombre),p.inversiones.map(i=>i.valor),[COLORS.blue,COLORS.purple,COLORS.amber,COLORS.green])},
    {id:"chart-cats",title:`Gastos por categoría — ${MESES[currentMes]}`,h:200,fn:()=>donutChart("chart-cats",Object.keys(cats),Object.values(cats),COL_ARR.slice(0,Object.keys(cats).length))},
  ];
  cards.forEach(({id,title,h,fn})=>{
    const c=el("div",{class:"card",style:"margin-bottom:14px"});
    c.innerHTML=`<h2 style="margin-bottom:12px">${title}</h2><div style="position:relative;height:${h}px"><canvas id="${id}" role="img" aria-label="${title}"></canvas></div>`;
    frag.append(c); setTimeout(fn,60);
  });
  return frag;
};

// ─── Render principal ─────────────────────────────────────────────────────────
const render = () => {
  Object.keys(chartInstances).forEach(destroyChart);
  const app=document.getElementById("app");
  app.innerHTML="";
  const p=currentPeriodo(), t=totalsOf(p);
  const ac=data.alertas_config;
  const em=p.ahorros.find(a=>a.nombre.toLowerCase().includes("emergencia"));
  const meses=em?em.actual/Math.max(t.tG,1):0;
  const alertCount=[t.balance<ac.balance_minimo,t.deudaRatio>ac.deuda_max_ingreso_pct,meses<ac.fondo_emergencia_meses,!!p.deudas.find(d=>d.interes>10),t.tA<ac.ahorro_minimo].filter(Boolean).length;

  // Header
  const hdr=el("div",{style:"display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;flex-wrap:wrap;gap:8px"});
  hdr.innerHTML=`<div><h1>Panel de Finanzas Familiares</h1><div class="save-indicator" id="save-ind"></div></div>`;
  hdr.append(el("button",{class:"btn btn-primary",style:"padding:8px 14px;font-size:13px",onClick:openPdfModal},"Exportar PDF"));

  // Selector de período
  const selector=renderPeriodoSelector();

  // Tabs
  const tabBar=el("div",{class:"tabs"});
  [{id:"resumen",label:"Resumen"},{id:"ingresos",label:"Ingresos & Gastos"},{id:"inversiones",label:"Inversiones"},{id:"deudas",label:"Deudas"},{id:"ahorros",label:"Ahorros"},{id:"alertas",label:"Alertas"},{id:"graficos",label:"Gráficos"}].forEach(({id,label})=>{
    const wrap=el("div",{class:"tab-wrap"});
    const btn=el("button",{class:`tab${activeTab===id?" active":""}`,onClick:()=>{activeTab=id;render();}},label);
    if(id==="alertas"&&alertCount>0) wrap.append(el("span",{class:"dot"}));
    wrap.append(btn); tabBar.append(wrap);
  });

  const content=el("div");
  if(activeTab==="resumen") content.append(renderResumen(p,t));
  else if(activeTab==="ingresos") content.append(renderIngastos(p));
  else if(activeTab==="inversiones") content.append(renderInversiones(p,t));
  else if(activeTab==="deudas") content.append(renderDeudas(p,t));
  else if(activeTab==="ahorros") content.append(renderAhorros(p));
  else if(activeTab==="alertas") content.append(renderAlertas(p,t));
  else if(activeTab==="graficos") content.append(renderGraficos(p,t));

  content.addEventListener("click",e=>{
    const btn=e.target.closest("[data-action]"); if(!btn) return;
    const {sec,id,action}=btn.dataset;
    const p2=currentPeriodo();
    const item=p2[sec].find(x=>x.id===parseInt(id));
    if(action==="edit"&&item) openModal("edit",sec,item);
    else if(action==="del") delItem(sec,parseInt(id));
  });

  app.append(hdr,selector,tabBar,content);
};

render();
