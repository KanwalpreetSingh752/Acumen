const api = '/api/admin'; let topics = [], editingId = null, starter = { cpp:'', java:'', python:'', javascript:'' }, activeLanguage = 'cpp';
const $ = (s) => document.querySelector(s); const notice = $('#notice'); const form = $('#problemForm');
function say(message, isError = true) {
  notice.textContent = message;
  notice.style.color = isError ? '#b23646' : '#278054';
  const fn = $('#formNotice');
  if (fn) { fn.textContent = message; fn.style.color = isError ? '#b23646' : '#278054'; }
  if (isError) { window.scrollTo({ top: 0, behavior: 'smooth' }); }
}
async function request(url, options) { const res = await fetch(url, options); const data = res.status === 204 ? null : await res.json(); if (!res.ok) throw new Error(data?.error || 'Request failed.'); return data; }
function slugify(value) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function itemControls(label) { return `<div class="item-head"><b>${label}</b><span><button type="button" data-move="up">↑</button><button type="button" data-move="down">↓</button><button type="button" data-remove>Delete</button></span></div>`; }
function example(data={}) { const el=document.createElement('div'); el.className='example'; el.innerHTML=`${itemControls('Example')}<div class="three-col"><label>Input<textarea data-field="input" rows="4">${data.input||''}</textarea></label><label>Output<textarea data-field="output" rows="4">${data.output||''}</textarea></label><label>Explanation<textarea data-field="explanation" rows="4">${data.explanation||''}</textarea></label></div>`; $('#examples').append(el); }
function test(data={}, hidden) { const el=document.createElement('div'); el.className='test'; el.dataset.hidden=hidden; el.innerHTML=`${itemControls(hidden?'Hidden test case':'Visible test case')}<div class="two-col"><label>Input<textarea data-field="input" rows="4">${data.input||''}</textarea></label><label>Expected output<textarea data-field="expected_output" rows="4">${data.expected_output||''}</textarea></label></div>`; $(hidden?'#hiddenTests':'#visibleTests').append(el); }
function reorder(button, direction) { const item=button.closest('.example,.test'), sibling=direction==='up'?item.previousElementSibling:item.nextElementSibling; if(sibling&&sibling.matches('.example,.test')) direction==='up'?item.parentNode.insertBefore(item,sibling):item.parentNode.insertBefore(sibling,item); }
document.addEventListener('click',(e)=>{ const add=e.target.closest('[data-add]'); if(add){ if(add.dataset.add==='example')example(); else test({},add.dataset.add==='hidden-test'); } if(e.target.matches('[data-remove]'))e.target.closest('.example,.test').remove(); if(e.target.matches('[data-move]'))reorder(e.target,e.target.dataset.move); });
function collect(container, hidden) { return [...$(container).children].map((el)=>({input:el.querySelector('[data-field="input"]').value, ...(hidden===undefined?{output:el.querySelector('[data-field="output"]').value,explanation:el.querySelector('[data-field="explanation"]').value}:{expected_output:el.querySelector('[data-field="expected_output"]').value,is_hidden:hidden})})); }
function selectTopics(ids=[]) { $('#topics').innerHTML=topics.map(t=>`<option value="${t.id}" ${ids.includes(t.id)?'selected':''}>${t.name}</option>`).join(''); }
function showForm(problem={}) { editingId=problem.id||null; $('#listView').hidden=true; form.hidden=false; $('#newProblem').hidden=true; $('#backToList').hidden=false; $('#pageTitle').textContent=editingId?'Edit Problem':'Create Problem'; $('#pageIntro').textContent='Write every detail yourself. Nothing is generated automatically.'; form.reset(); $('#examples').innerHTML=''; $('#visibleTests').innerHTML=''; $('#hiddenTests').innerHTML=''; starter={cpp:'',java:'',python:'',javascript:''}; Object.assign(starter,...(problem.starter_code||[]).map(x=>({[x.language]:x.code}))); form.title.value=problem.title||''; form.slug.value=problem.slug||''; form.difficulty.value=problem.difficulty||'Easy'; form.description.value=problem.description||''; form.constraints.value=problem.constraints||''; form.input_format.value=problem.input_format||''; form.output_format.value=problem.output_format||''; selectTopics(problem.topic_ids||[]); (problem.examples||[]).forEach(example); (problem.test_cases||[]).forEach(x=>test(x,x.is_hidden)); setLanguage('cpp'); }
function showList() { form.hidden=true; $('#listView').hidden=false; $('#newProblem').hidden=false; $('#backToList').hidden=true; $('#pageTitle').textContent='Problem Management'; $('#pageIntro').textContent='Create and maintain the DSA problems used by your coding platform.'; editingId=null; loadProblems(); }
function setLanguage(lang) { starter[activeLanguage]=$('#starterCode').value; activeLanguage=lang; $('#starterCode').value=starter[lang]||''; $('#codeTabs').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.language===lang)); }
$('#codeTabs').addEventListener('click',e=>{const b=e.target.closest('[data-language]');if(b)setLanguage(b.dataset.language)}); $('#newProblem').addEventListener('click',()=>showForm()); $('#backToList').addEventListener('click',showList); $('#cancel').addEventListener('click',showList);
form.title.addEventListener('input',()=>{if(!editingId||!form.slug.dataset.edited)form.slug.value=slugify(form.title.value)}); form.slug.addEventListener('input',()=>form.slug.dataset.edited='yes');
async function loadProblems(){try{const search=encodeURIComponent($('#search').value),difficulty=encodeURIComponent($('#difficultyFilter').value);const {problems}=await request(`${api}/problems?search=${search}&difficulty=${difficulty}`);$('#problemRows').innerHTML=problems.length?problems.map(p=>`<tr><td><b>${p.title}</b><br><small>${p.slug}</small></td><td><span class="badge">${p.difficulty}</span></td><td>${p.topics.map(t=>`<span class="topic">${t.name}</span>`).join('')}</td><td><button data-edit="${p.id}">Edit</button><button data-delete="${p.id}">Delete</button></td></tr>`).join(''):'<tr><td colspan="4">No problems yet. Create your first one.</td></tr>';}catch(e){say(e.message)}}
$('#search').addEventListener('input',loadProblems);$('#difficultyFilter').addEventListener('change',loadProblems);$('#problemRows').addEventListener('click',async e=>{const id=e.target.dataset.edit||e.target.dataset.delete;if(!id)return;try{if(e.target.dataset.delete){if(confirm('Delete this problem and all of its examples, code, and test cases?')){await request(`${api}/problems/${id}`,{method:'DELETE'});loadProblems();}}else{const {problem}=await request(`${api}/problems/${id}`);showForm(problem)}}catch(err){say(err.message)}});
form.addEventListener('submit',async e=>{
  e.preventDefault();
  const btn = $('#saveButton');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  say('', false);
  starter[activeLanguage]=$('#starterCode').value;
  const payload={
    title:form.title.value,
    slug:form.slug.value,
    difficulty:form.difficulty.value,
    description:form.description.value,
    constraints:form.constraints.value,
    input_format:form.input_format.value,
    output_format:form.output_format.value,
    topic_ids:[...$('#topics').selectedOptions].map(x=>x.value),
    examples:collect('#examples'),
    test_cases:[...collect('#visibleTests',false),...collect('#hiddenTests',true)],
    starter_code:Object.entries(starter).map(([language,code])=>({language,code}))
  };
  try {
    await request(editingId?`${api}/problems/${editingId}`:`${api}/problems`,{
      method:editingId?'PUT':'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    say('Problem saved successfully.', false);
    showList();
  } catch(err) {
    say(err.message || 'Unable to save problem.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Problem'; }
  }
});
(async()=>{try{const me=await request('/api/auth/me'); if(!me?.user?.isAdmin){window.location.replace('/dashboard.html');return;} const {topics:data}=await request(`${api}/topics`); topics=data; selectTopics(); loadProblems();}catch(e){window.location.replace('/dashboard.html');}})();
