(() => {
  "use strict";
  const $ = (s, root=document) => root.querySelector(s);
  const fmt = n => new Intl.NumberFormat("ru-RU", {style:"currency",currency:"RUB",maximumFractionDigits:0}).format(Number(n)||0);
  const today = () => new Date().toLocaleDateString("en-CA");
  const monthNow = () => today().slice(0,7);
  const safe = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const dateLabel = s => s ? new Date(s+"T12:00:00").toLocaleDateString("ru-RU") : "—";
  const monthLabel = s => new Date(s+"-15T12:00:00").toLocaleDateString("ru-RU",{month:"long",year:"numeric"});
  const state = {client:null,session:null,tx:[],page:"dashboard",month:monthNow(),search:"",notice:"",preview:null,busy:false};
  const config = window.BUDGET_CONFIG || {};
  const configured = !!(config.supabaseUrl && config.supabaseKey && window.supabase);

  function toast(message, bad=false) {
    state.notice = message;
    const box = $("#notice");
    if (box) { box.textContent = message; box.className = "notice show" + (bad ? " bad" : ""); }
  }
  function shell(content) {
    $("#app").innerHTML = `<div class="layout">
      <aside class="sidebar">
        <div class="brand"><div class="brand-icon">₽</div><div><b>Мой бюджет</b><small>ЛИЧНЫЕ ФИНАНСЫ</small></div></div>
        <nav>${[
          ["dashboard","▦","Обзор"],["transactions","↔","Операции"],["analytics","▥","Аналитика"],["data","⇧","Импорт и экспорт"]
        ].map(([id,icon,label])=>`<button class="nav-item ${state.page===id?"active":""}" data-page="${id}"><span>${icon}</span>${label}</button>`).join("")}</nav>
        <div class="side-bottom"><div class="privacy"><span class="green-dot"></span><div><b>Личный кабинет</b><small>Данные защищены</small></div></div><button id="logout" class="nav-item logout">↪ Выйти</button></div>
      </aside>
      <main class="main">
        <header class="topbar"><div><div class="eyebrow">ФИНАНСОВАЯ ПАНЕЛЬ</div><h1>${({"dashboard":"Обзор бюджета","transactions":"Все операции","analytics":"Аналитика","data":"Импорт и экспорт"}[state.page]||"Мой бюджет")}</h1></div><div class="top-actions"><span class="cloud-status"><i></i> Облачное хранилище</span><button class="btn primary" id="add-open">＋ Добавить операцию</button></div></header>
        <div id="notice" class="notice ${state.notice?"show":""}">${safe(state.notice)}</div>
        ${content}
        <footer><span>Мой бюджет · личный финансовый кабинет</span><span>🔒 Доступ только к вашему аккаунту</span></footer>
      </main>
    </div>
    <div id="modal-root"></div>`;
    document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>{state.page=b.dataset.page;render()}));
    $("#add-open")?.addEventListener("click",showAdd);
    $("#logout")?.addEventListener("click",signOut);
  }
  function metric(label,value,sub,kind="purple",symbol="₽") {
    return `<article class="metric"><div class="metric-top"><span>${label}</span><span class="metric-symbol ${kind}">${symbol}</span></div><div class="metric-value">${value}</div><div class="metric-sub">${sub||"&nbsp;"}</div></article>`;
  }
  function txTable(rows) {
    if(!rows.length) return `<div class="empty"><div class="empty-mark">↔</div><b>Пока нет операций</b><p>Добавьте запись вручную или импортируйте Excel-файл.</p></div>`;
    return `<div class="table-wrap"><table><thead><tr><th>ОПЕРАЦИЯ</th><th>ДАТА</th><th>КАТЕГОРИЯ</th><th>СУММА</th><th></th></tr></thead><tbody>${rows.map(t=>`<tr><td><div class="tx-name"><span class="tx-icon ${t.type}">${t.type==="income"?"+":"−"}</span><div><b>${t.type==="income"?"Поступление":"Расход"}</b><small>${safe(t.comment||t.source_sheet||"Без комментария")}</small></div></div></td><td>${dateLabel(t.date)}</td><td><span class="tag">${safe(t.category)}</span></td><td class="amount ${t.type}">${t.type==="income"?"+":"−"}${fmt(t.amount)}</td><td><button class="delete-btn" data-delete="${safe(t.id)}" title="Удалить">×</button></td></tr>`).join("")}</tbody></table></div>`;
  }
  function dashboard() {
    const tx=state.tx.filter(t=>String(t.date).startsWith(state.month));
    const income=tx.filter(t=>t.type==="income").reduce((a,t)=>a+Number(t.amount),0);
    const expense=tx.filter(t=>t.type==="expense").reduce((a,t)=>a+Number(t.amount),0);
    const net=income-expense;
    const categories={}; tx.filter(t=>t.type==="expense").forEach(t=>categories[t.category]=(categories[t.category]||0)+Number(t.amount));
    const cats=Object.entries(categories).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const max=Math.max(1,...cats.map(x=>x[1]));
    return `<div class="filter-row"><label class="month-control">ПЕРИОД <input type="month" id="month-filter" value="${state.month}"></label><span class="subtle">${tx.length} операций за ${monthLabel(state.month)}</span></div>
      <section class="metrics">${metric("Доходы",fmt(income),"Все поступления за месяц","green","↗")}${metric("Расходы",fmt(expense),"Все траты за месяц","red","↘")}${metric("Баланс",fmt(net),net>=0?"Доходы превышают расходы":"Расходы превышают доходы",net>=0?"purple":"red","=")}${metric("Норма остатка",income?Math.round(net/income*100)+"%":"—",income?"Доля дохода, оставшаяся после расходов":"Нет данных о доходах","blue","%")}</section>
      <section class="content-grid"><article class="panel"><div class="panel-heading"><div><h2>Расходы по категориям</h2><p>Куда уходят деньги в выбранном месяце</p></div></div>${cats.length?`<div class="bars">${cats.map(([name,val],i)=>`<div class="bar-row"><div><span>${safe(name)}</span><b>${fmt(val)}</b></div><div class="bar-track"><i style="width:${Math.round(val/max*100)}%;--bar:${["#9a8cff","#42c7b7","#f3b75e","#f07e88","#65a4ff","#c17ce7"][i%6]}"></i></div></div>`).join("")}</div>`:`<div class="empty compact"><b>Нет расходов за этот месяц</b><p>Добавьте операции или загрузите Excel.</p></div>`}</article>
      <article class="panel"><div class="panel-heading"><div><h2>Быстрый обзор</h2><p>Последние записи за месяц</p></div><button class="link-btn" data-page="transactions">Все операции →</button></div>${txTable(tx.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5))}</article></section>
      <section class="panel recent"><div class="panel-heading"><div><h2>Последние операции</h2><p>Недавние изменения бюджета</p></div><button class="link-btn" data-page="transactions">Показать все →</button></div>${txTable(state.tx.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,6))}</section>`;
  }
  function transactionsPage() {
    const rows=state.tx.filter(t=>(state.month==="all"||String(t.date).startsWith(state.month))&&`${t.category} ${t.comment||""} ${t.date}`.toLowerCase().includes(state.search.toLowerCase())).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    return `<div class="filter-row"><label class="month-control">ПЕРИОД <select id="tx-month"><option value="all" ${state.month==="all"?"selected":""}>Все даты</option>${[...new Set(state.tx.map(t=>String(t.date).slice(0,7)))].sort().reverse().map(m=>`<option ${state.month===m?"selected":""} value="${m}">${monthLabel(m)}</option>`).join("")}</select></label><input id="tx-search" class="search-input" placeholder="⌕ Поиск по операциям…" value="${safe(state.search)}"></div><section class="panel">${txTable(rows)}</section>`;
  }
  function analyticsPage() {
    const months=[...new Set(state.tx.map(t=>String(t.date).slice(0,7)))].sort().slice(-12);
    const sums=months.map(m=>({m,inc:state.tx.filter(t=>String(t.date).startsWith(m)&&t.type==="income").reduce((a,t)=>a+Number(t.amount),0),exp:state.tx.filter(t=>String(t.date).startsWith(m)&&t.type==="expense").reduce((a,t)=>a+Number(t.amount),0)}));
    const max=Math.max(1,...sums.flatMap(x=>[x.inc,x.exp]));
    return `<section class="panel"><div class="panel-heading"><div><h2>Доходы и расходы</h2><p>Сравнение по месяцам · до 12 последних месяцев</p></div></div>${sums.length?`<div class="chart">${sums.map(x=>`<div class="chart-col"><div class="chart-bars"><i class="income-bar" title="Доходы ${fmt(x.inc)}" style="height:${Math.max(2,x.inc/max*100)}%"></i><i class="expense-bar" title="Расходы ${fmt(x.exp)}" style="height:${Math.max(2,x.exp/max*100)}%"></i></div><small>${new Date(x.m+"-15T12:00:00").toLocaleDateString("ru-RU",{month:"short"})}</small></div>`).join("")}</div><div class="legend"><span><i class="income-bar"></i> Доходы</span><span><i class="expense-bar"></i> Расходы</span></div>`:`<div class="empty"><b>Пока недостаточно данных</b><p>Импортируйте операции, чтобы увидеть динамику.</p></div>`}</section><section class="panel"><div class="panel-heading"><div><h2>Сводка по категориям</h2><p>За всё время</p></div></div>${txTable(state.tx.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,10))}</section>`;
  }
  function dataPage() {
    return `<section class="data-grid"><article class="panel data-card"><div class="data-icon">▤</div><h2>Импорт из Excel</h2><p>Загрузите файл .xlsx или .xls. Сначала покажем найденные операции и предупреждения — данные не запишутся без вашего подтверждения.</p><label class="btn primary file-btn">↑ Выбрать Excel-файл<input id="excel-file" type="file" accept=".xlsx,.xls"></label><div id="import-preview"></div></article><article class="panel data-card"><div class="data-icon">⇩</div><h2>Резервная копия</h2><p>Скачайте локальную копию всех загруженных операций в формате JSON. Храните файл в безопасном месте.</p><button class="btn secondary" id="backup">Скачать JSON-копию</button><button class="btn ghost" id="csv">Экспорт операций в CSV</button><label class="btn secondary file-btn">Восстановить из JSON<input id="restore" type="file" accept=".json"></label></article></section><section class="panel info-panel"><b>Как устроено хранение</b><p>Облачная база Supabase синхронизирует записи между устройствами. JSON-копия — дополнительный локальный резерв. Не публикуйте её и не передавайте другим людям.</p></section>`;
  }
  function render() {
    const content=state.page==="dashboard"?dashboard():state.page==="transactions"?transactionsPage():state.page==="analytics"?analyticsPage():dataPage();
    shell(content);
    $("#month-filter")?.addEventListener("change",e=>{state.month=e.target.value;render()});
    $("#tx-month")?.addEventListener("change",e=>{state.month=e.target.value;render()});
    $("#tx-search")?.addEventListener("input",e=>{state.search=e.target.value;const pos=e.target.selectionStart;render();const input=$("#tx-search");input?.focus();input?.setSelectionRange(pos,pos)});
    document.querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>deleteTx(b.dataset.delete)));
    $("#excel-file")?.addEventListener("change",onExcel);
    $("#backup")?.addEventListener("click",backup);
    $("#csv")?.addEventListener("click",exportCsv);
    $("#restore")?.addEventListener("change",restore);
    document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>{state.page=b.dataset.page;render()}));
    if(state.preview) showPreview();
  }
  function authScreen() {
    $("#app").innerHTML=`<div class="auth-wrap"><div class="auth-card"><div class="brand auth-brand"><div class="brand-icon">₽</div><div><b>Мой бюджет</b><small>ЛИЧНЫЕ ФИНАНСЫ</small></div></div><div class="eyebrow">ФИНАНСОВАЯ ПАНЕЛЬ</div><h1>Твой бюджет —<br><span>под контролем.</span></h1><p class="auth-copy">Личный кабинет для учёта доходов, расходов и финансовых привычек. Данные доступны только после входа в аккаунт.</p><form id="auth-form"><label>Email<input id="email" type="email" required placeholder="you@example.com" autocomplete="email"></label><label>Пароль<input id="password" type="password" required minlength="6" placeholder="Не менее 6 символов" autocomplete="current-password"></label><button class="btn primary wide" type="submit">Войти в кабинет</button><button class="btn ghost wide" type="button" id="signup">Создать аккаунт</button><p id="auth-message" class="auth-message"></p></form><div class="auth-foot">🔒 Защищённое подключение · Supabase</div></div><div class="auth-side"><div class="orb orb-one"></div><div class="orb orb-two"></div><div class="side-copy"><div class="eyebrow">ФИНАНСОВАЯ ЯСНОСТЬ</div><h2>Понимай свои деньги.<br>Управляй планами.</h2><p>Сводка по месяцу, категории расходов и история операций — в одном месте.</p><div class="side-stats"><div><small>УЧЁТ</small><b>Доходы и расходы</b></div><div><small>АНАЛИТИКА</small><b>Динамика бюджета</b></div><div><small>СИНХРОНИЗАЦИЯ</small><b>Между устройствами</b></div></div></div></div></div>`;
    $("#auth-form").addEventListener("submit",async e=>{e.preventDefault();await auth(false)});
    $("#signup").addEventListener("click",()=>auth(true));
  }
  async function auth(signup) {
    const msg=$("#auth-message"); msg.textContent="Подключаемся…";
    const email=$("#email").value.trim(), password=$("#password").value;
    const res=signup?await state.client.auth.signUp({email,password}):await state.client.auth.signInWithPassword({email,password});
    msg.textContent=res.error?res.error.message:(signup?"Аккаунт создан. Если подтверждение почты включено, проверьте почту, затем войдите.":"Вход выполнен.");
    if(!res.error&&!signup) {state.session=res.data.session;await loadData();}
  }
  async function signOut(){if(state.client) await state.client.auth.signOut();state.session=null;state.tx=[];authScreen()}
  async function loadData() {
    if(!state.session){authScreen();return}
    $("#app").innerHTML='<div class="loading-screen"><div class="spinner"></div><p>Загружаем операции…</p></div>';
    const {data,error}=await state.client.from("transactions").select("*").order("date",{ascending:false});
    if(error){state.tx=[];state.page="dashboard";render();toast("Не удалось загрузить операции: "+error.message,true);return}
    state.tx=data||[];state.page="dashboard";render();
    state.client.from("categories").select("name,type").then(({data})=>{if(data?.length)state.categories=data});
  }
  function showAdd() {
    $("#modal-root").innerHTML=`<div class="modal-bg" id="modal-bg"><form class="modal" id="add-form"><div class="modal-head"><div><div class="eyebrow">НОВАЯ ЗАПИСЬ</div><h2>Добавить операцию</h2></div><button type="button" class="close-btn" id="close-modal">×</button></div><div class="type-toggle"><label><input type="radio" name="type" value="expense" checked><span>− Расход</span></label><label><input type="radio" name="type" value="income"><span>＋ Доход</span></label></div><label>Сумма, ₽<input name="amount" type="number" min="0.01" step="0.01" required placeholder="0"></label><label>Дата<input name="date" type="date" value="${today()}" required></label><label>Категория<input name="category" required list="category-list" placeholder="Например, Продукты"><datalist id="category-list">${[...new Set(state.tx.map(t=>t.category))].map(c=>`<option>${safe(c)}</option>`).join("")}<option>Продукты</option><option>Транспорт</option><option>Жильё</option><option>Зарплата</option><option>Здоровье</option><option>Развлечения</option></datalist></label><label>Комментарий<input name="comment" placeholder="Необязательно"></label><button class="btn primary wide" type="submit">Сохранить операцию</button></form></div>`;
    $("#close-modal").onclick=()=>$("#modal-root").innerHTML="";
    $("#modal-bg").addEventListener("click",e=>{if(e.target.id==="modal-bg")$("#modal-root").innerHTML=""});
    $("#add-form").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const payload={user_id:state.session.user.id,type:f.get("type"),amount:Number(f.get("amount")),date:f.get("date"),category:String(f.get("category")).trim(),comment:String(f.get("comment")||""),source_sheet:"Вручную"};const btn=e.currentTarget.querySelector("button[type=submit]");btn.disabled=true;btn.textContent="Сохраняем…";const {error}=await state.client.from("transactions").insert(payload);if(error){btn.disabled=false;btn.textContent="Сохранить операцию";toast("Ошибка сохранения: "+error.message,true)}else{$("#modal-root").innerHTML="";await loadData();toast("Операция сохранена.")}});
  }
  async function deleteTx(id) {
    const t=state.tx.find(x=>String(x.id)===String(id));if(!t||!confirm(`Удалить "${t.category}" — ${fmt(t.amount)}?`))return;
    const {error}=await state.client.from("transactions").delete().eq("id",id);
    if(error)toast("Не удалось удалить: "+error.message,true);else{await loadData();toast("Операция удалена.")}
  }
  async function onExcel(e) {
    const file=e.target.files?.[0];if(!file)return;
    if(!window.XLSX){toast("Не загрузился модуль Excel. Проверьте подключение к интернету.",true);return}
    try {
      const wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
      const transactions=[], warnings=[], sheets=[];let skipped=0;
      for(const sheetName of wb.SheetNames) {
        const low=sheetName.toLowerCase();
        if(low.includes("пример")||low.includes("сводная")){skipped++;continue}
        const ws=wb.Sheets[sheetName];const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:false});
        if(!rows.length)continue;
        const findHeader=rows.findIndex(r=>r.some(v=>/дата|категор|сумм|доход|расход|операц|коммент/i.test(String(v||""))));
        const headerIndex=findHeader>=0?findHeader:0, headers=(rows[headerIndex]||[]).map(v=>String(v||"").trim().toLowerCase());
        const col=(patterns)=>headers.findIndex(h=>patterns.some(p=>p.test(h)));
        const dateCol=col([/дата/]), amountCol=col([/сумм|рубл|amount|итого/]), catCol=col([/категор|статья|назначен|описан|операц/]), typeCol=col([/тип|доход|расход/]), commentCol=col([/коммент|примечан/]);
        if(amountCol<0){warnings.push(`Лист «${sheetName}»: не найдена колонка суммы.`);continue}
        let count=0;
        for(let i=headerIndex+1;i<rows.length;i++) {
          const r=rows[i]||[];let amount=Number(String(r[amountCol]??"").replace(/\s/g,"").replace(",",".").replace(/[₽руб]/gi,""));
          if(!Number.isFinite(amount)||amount<=0){skipped++;continue}
          let rawDate=dateCol>=0?r[dateCol]:null, date=today();
          if(rawDate instanceof Date)date=rawDate.toLocaleDateString("en-CA");
          else if(typeof rawDate==="string"&&rawDate.trim()){const m=rawDate.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);if(m)date=`${m[3].length===2?"20"+m[3]:m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;else if(/^\d{4}-\d{2}-\d{2}/.test(rawDate))date=rawDate.slice(0,10);else{warnings.push(`Лист «${sheetName}», строка ${i+1}: дата не распознана.`);continue}}
          else {warnings.push(`Лист «${sheetName}», строка ${i+1}: нет даты, пропущено.`);continue}
          const category=catCol>=0&&r[catCol]?String(r[catCol]).trim():sheetName;
          const typeText=typeCol>=0?String(r[typeCol]||"").toLowerCase():"";
          const type=/доход|поступлен|income|зарплат/.test(typeText)?"income":"expense";
          const comment=commentCol>=0?String(r[commentCol]||""):"";
          transactions.push({date,type,amount,category:category||"Без категории",comment,source_sheet:sheetName});count++;
        }
        if(count){sheets.push(`${sheetName} (${count})`)}
      }
      state.preview={transactions,warnings,skipped,file:file.name,sheets};showPreview();
    } catch(err){toast("Не удалось прочитать Excel: "+String(err),true)}
  }
  function showPreview() {
    const target=$("#import-preview");if(!target||!state.preview)return;
    const p=state.preview;
    target.innerHTML=`<div class="preview-box"><h3>Проверка импорта</h3><p class="subtle">${safe(p.file)}</p><div class="preview-stats"><div><b>${p.transactions.length}</b><small>операций найдено</small></div><div><b>${p.skipped}</b><small>пропущено</small></div><div><b>${p.warnings.length}</b><small>предупреждений</small></div></div><div class="source-list">${p.sheets.map(s=>`<span>${safe(s)}</span>`).join("")}</div>${p.warnings.slice(0,8).map(w=>`<p class="warning">⚠ ${safe(w)}</p>`).join("")}<p class="subtle">Проверьте результат. Примеры и сводные листы исключаются; формулы не импортируются как вычисленные значения.</p><button class="btn primary wide" id="import-confirm" ${p.transactions.length?"":"disabled"}>Импортировать ${p.transactions.length} операций</button><button class="btn ghost wide" id="import-cancel">Отменить</button></div>`;
    $("#import-cancel").onclick=()=>{state.preview=null;showPreview()};
    $("#import-confirm").onclick=importConfirm;
  }
  async function importConfirm() {
    const p=state.preview;if(!p?.transactions.length)return;
    const btn=$("#import-confirm");btn.disabled=true;btn.textContent="Импортируем…";
    const existing=new Set(state.tx.map(t=>`${t.date}|${t.type}|${Number(t.amount)}|${t.category}|${t.comment||""}`));
    const rows=p.transactions.filter(t=>!existing.has(`${t.date}|${t.type}|${Number(t.amount)}|${t.category}|${t.comment||""}`)).map(t=>({...t,user_id:state.session.user.id}));
    if(!rows.length){toast("Новых операций нет: возможные дубликаты пропущены.");return}
    const {error}=await state.client.from("transactions").insert(rows);
    if(error){toast("Импорт не выполнен: "+error.message,true);btn.disabled=false;btn.textContent="Повторить импорт";return}
    state.preview=null;await loadData();state.page="data";render();toast(`Импортировано ${rows.length} операций.`);
  }
  function download(name,content,type) {const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  function backup() {download(`lichny-byudzhet-${today()}.json`,JSON.stringify({format:"lichny-byudzhet-v1",exportedAt:new Date().toISOString(),transactions:state.tx},null,2),"application/json")}
  function exportCsv() {const rows=[["Дата","Тип","Сумма","Категория","Комментарий","Источник"],...state.tx.map(t=>[t.date,t.type==="income"?"Доход":"Расход",t.amount,t.category,t.comment||"",t.source_sheet||""])];download(`operacii-${today()}.csv`,"\ufeff"+rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(";")).join("\r\n"),"text/csv;charset=utf-8")}
  async function restore(e) {
    const f=e.target.files?.[0];if(!f)return;
    try{const obj=JSON.parse(await f.text());if(!Array.isArray(obj.transactions))throw Error("В файле нет массива transactions");if(!confirm(`Загрузить ${obj.transactions.length} записей в облако? Существующие записи не будут удалены.`))return;const rows=obj.transactions.map(t=>({user_id:state.session.user.id,date:t.date,type:t.type,amount:Number(t.amount),category:t.category,comment:t.comment||"",source_sheet:t.source_sheet||t.sourceSheet||"Резервная копия"})).filter(t=>t.date&&["income","expense"].includes(t.type)&&t.amount>0&&t.category);const {error}=await state.client.from("transactions").insert(rows);if(error)throw error;await loadData();state.page="data";render();toast(`Восстановлено записей: ${rows.length}`)}catch(err){toast("Не удалось восстановить JSON: "+String(err.message||err),true)}e.target.value="";
  }
  async function start() {
    if(!configured) {
      $("#app").innerHTML=`<div class="setup-wrap"><div class="setup-card"><div class="brand"><div class="brand-icon">₽</div><div><b>Мой бюджет</b><small>НАСТРОЙКА ПОДКЛЮЧЕНИЯ</small></div></div><h1>Остался один шаг</h1><p>Это версия на чистом HTML, CSS и JavaScript — без React, Vite и сборки. Чтобы включить облачную авторизацию, добавьте публичный ключ Supabase в файл <code>config.js</code>.</p><ol><li>Откройте файл <code>config.js</code> в репозитории GitHub.</li><li>Вставьте ключ в поле <code>supabaseKey</code>.</li><li>Сохраните изменения и обновите страницу.</li></ol><p class="setup-note">URL проекта уже указан. Используйте только публичный publishable/anon key — не service_role и не sb_secret.</p><p class="setup-note">Пока ключ не добавлен, сайт намеренно не показывает пустой экран и объясняет, что нужно исправить.</p></div></div>`;
      return;
    }
    state.client=window.supabase.createClient(config.supabaseUrl,config.supabaseKey);
    state.client.auth.onAuthStateChange((_event,session)=>{state.session=session;if(session)loadData();else authScreen()});
    const {data,error}=await state.client.auth.getSession();
    if(error){authScreen();return}
    state.session=data.session;
    if(state.session)await loadData();else authScreen();
  }
  start().catch(err=>{$("#app").innerHTML=`<div class="setup-wrap"><div class="setup-card"><h1>Не удалось запустить приложение</h1><p>${safe(err.message||err)}</p><p>Проверьте интернет и подключение Supabase, затем обновите страницу.</p></div></div>`});
})();