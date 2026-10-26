const STAGES = [
  ['value_retrieval', '值检索'],
  ['few_shot_preparation', 'Few-shot 准备'],
  ['schema_linking', 'Schema Linking'],
  ['sql_generation', 'SQL 生成'],
  ['sql_revision', 'SQL 修订'],
  ['sql_selection', 'SQL 选择'],
  ['execution', '只读执行'],
];
const DETAILS = {
  value_retrieval: '从已建立的值索引中查找与问题相关的数据库值。',
  few_shot_preparation: '检索已保存的少样本问题与 SQL 示例。',
  schema_linking: '把问题关联到数据库中的表与字段。',
  sql_generation: '使用上游 DeepEye-SQL 的策略生成候选 SQL。',
  sql_revision: 'Checker 检查候选。本组案例中，展示的初始 SQL 未被改写。',
  sql_selection: '选择最终 SQL。本组案例均使用单一有效候选捷径。',
  execution: '对已注册的 SQLite 数据库执行只读查询，并保存结果。',
};
const $ = (selector) => document.querySelector(selector);
const number = (value) => new Intl.NumberFormat('zh-CN').format(value);
const seconds = (value) => `${Number(value).toFixed(value < 1 ? 3 : value < 10 ? 2 : 1)} 秒`;
const percent = (value) => `${(value * 100).toFixed(0)}%`;
let cases = [];
let current = null;
let selectedStage = 0;
let playback = 0;

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function badge(node, label, state) {
  node.textContent = label;
  node.className = `badge ${state}`;
}

function stageExtra(stageKey) {
  const artifacts = current.artifacts;
  if (stageKey === 'value_retrieval') return [`${artifacts.retrieved_value_columns} 个值检索字段`];
  if (stageKey === 'few_shot_preparation') return [`${artifacts.few_shot_example_count} 条少样本示例`];
  if (stageKey === 'schema_linking') return Object.entries(artifacts.linked_schema).flatMap(([table, columns]) => columns.map(column => `${table}.${column}`));
  if (stageKey === 'sql_generation') return [`${artifacts.generated_candidate_count} 条生成候选`];
  if (stageKey === 'sql_revision') return ['展示的候选 SQL 未改写'];
  if (stageKey === 'sql_selection') return ['已选定最终 SQL'];
  return [`${current.rows.length} 行结果`, '只读查询'];
}

function inspectStage(index) {
  selectedStage = index;
  document.querySelectorAll('#timeline li').forEach((node, idx) => node.classList.toggle('selected', idx === index));
  const [key, name] = STAGES[index];
  const box = $('#stage-inspect');
  box.replaceChildren(element('strong', '', `${name} · ${seconds(current.stage_seconds[key])}`), element('span', '', DETAILS[key]));
  const chips = element('div', 'chips');
  stageExtra(key).forEach(item => chips.append(element('span', 'chip', item)));
  box.append(chips);
}

function renderTimeline(completed = STAGES.length) {
  const list = $('#timeline');
  list.replaceChildren(...STAGES.map(([key, name], index) => {
    const done = index < completed;
    const li = element('li', done ? 'completed' : 'waiting');
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `${name}：${seconds(current.stage_seconds[key])}`);
    li.append(element('span', 'dot', done ? '✓' : String(index + 1)), element('span', 'stage-name', name), element('span', 'stage-state', done ? seconds(current.stage_seconds[key]) : '等待'));
    li.addEventListener('click', () => inspectStage(index));
    li.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspectStage(index); } });
    return li;
  }));
  inspectStage(Math.min(selectedStage, STAGES.length - 1));
}

function renderMetrics() {
  const entries = [
    ['总耗时', seconds(current.elapsed_seconds)],
    ['总 Token', number(current.usage.total_tokens)],
    ['模型响应', number(current.usage.model_responses)],
    ['生成候选', number(current.artifacts.generated_candidate_count)],
    ['结果行数', number(current.rows.length)],
  ];
  $('#metrics').replaceChildren(...entries.map(([name, value]) => {
    const card = element('div', 'metric');
    card.append(element('span', '', name), element('strong', '', value));
    return card;
  }));
}

function renderSchemaAndTimes() {
  const schema = Object.entries(current.artifacts.linked_schema)
    .flatMap(([table, columns]) => columns.map(column => `${table}.${column}`));
  $('#schema-chips').replaceChildren(...schema.map(item => element('span', 'chip', item)));
  const max = Math.max(...Object.values(current.stage_seconds));
  $('#stage-times').replaceChildren(...STAGES.map(([key, name]) => {
    const row = element('div', 'time-row');
    const bar = element('span', 'bar');
    const fill = element('i');
    fill.style.width = `${Math.max(2, current.stage_seconds[key] / max * 100)}%`;
    bar.append(fill);
    row.append(element('span', '', name), bar, element('strong', '', seconds(current.stage_seconds[key])));
    return row;
  }));
}

function renderTable() {
  const table = $('#result-table');
  const head = element('thead');
  const heading = element('tr');
  current.columns.forEach(value => heading.append(element('th', '', value)));
  head.append(heading);
  const body = element('tbody');
  current.rows.forEach(row => {
    const tr = element('tr');
    row.forEach(value => tr.append(element('td', '', value === null ? 'NULL' : String(value))));
    body.append(tr);
  });
  table.replaceChildren(head, body);
  $('#row-note').textContent = `${current.rows.length} 行`;
}

function renderResult() {
  $('#result-section').classList.remove('hidden');
  badge($('#result-badge'), '执行成功 · 历史记录', 'success');
  $('#generated-sql').textContent = current.artifacts.generated_sql;
  $('#revised-sql').textContent = current.artifacts.revised_sql;
  $('#final-sql').textContent = current.artifacts.final_sql;
  renderMetrics();
  renderSchemaAndTimes();
  renderTable();
}

function selectCase(index) {
  playback += 1;
  current = cases[index];
  selectedStage = 0;
  $('#example').value = String(index);
  $('#question').value = current.question;
  $('#evidence').value = current.evidence;
  $('#elapsed-live').textContent = `${current.elapsed_seconds.toFixed(1)}s`;
  $('#request-meta').textContent = `历史实测 · ${current.database} · 已保存 7 个阶段的耗时、SQL 和结果`;
  badge($('#service-state'), '记录已保存', 'success');
  $('#replay-button').disabled = false;
  $('#replay-button').textContent = '播放阶段记录 ▶';
  history.replaceState(null, '', `#${current.id}`);
  renderTimeline();
  renderResult();
}

function renderEvaluations() {
  const items = [
    { title: '3 题快速演示', subtitle: 'California Schools · 三道预验证案例', accuracy: 1, id: 'demo' },
    { title: '50 题三组对照', subtitle: '5 个数据库 · 固定分层样本', accuracy: .76, id: 'ablation' },
  ];
  $('#evaluation-list').replaceChildren(...items.map(item => {
    const card = element('button', 'card eval-card');
    card.type = 'button';
    card.style.textAlign = 'left';
    card.append(element('h3', '', item.title), element('div', 'muted', item.subtitle), element('div', 'eval-kpi', percent(item.accuracy)), element('div', 'muted', '完整流程集合式执行正确率'));
    card.addEventListener('click', () => showEvaluation(item.id));
    return card;
  }));
}

function showEvaluation(id) {
  const target = $('#evaluation-detail');
  target.classList.remove('hidden');
  target.replaceChildren();
  if (id === 'demo') {
    const title = element('h2', '', '3 题快速演示 · 2026-10-26');
    const summary = element('div', 'metric-grid');
    [['集合式 EX', '3 / 3'], ['严格多重集 EX', '3 / 3'], ['平均耗时', '41.62 秒'], ['总 Token', '153,436']].forEach(([name, value]) => {
      const metric = element('div', 'metric');
      metric.append(element('span', '', name), element('strong', '', value));
      summary.append(metric);
    });
    const note = element('p', 'eval-source');
    note.textContent = '三题均与 BIRD 标准 SQL 的执行结果一致；这是用于展示入口的预验证样本。';
    target.append(title, summary, note);
  } else {
    const title = element('h2', '', '50 题固定样本 · 三组对照');
    const wrapper = element('div', 'eval-table');
    const table = element('table');
    const head = element('thead');
    const hr = element('tr');
    ['方案', '正确题数', '集合式 EX', '可执行率'].forEach(value => hr.append(element('th', '', value)));
    head.append(hr);
    const body = element('tbody');
    [['仅生成', '36 / 50', '72%', '100%'], ['生成＋修订', '36 / 50', '72%', '100%'], ['完整流程', '38 / 50', '76%', '100%']].forEach(values => {
      const tr = element('tr');
      values.forEach(value => tr.append(element('td', '', value)));
      body.append(tr);
    });
    table.append(head, body);
    wrapper.append(table);
    const note = element('p', 'eval-source');
    note.textContent = '固定 50 题、5 个数据库的小样本工程验证，不能视为 BIRD 官方榜单成绩。';
    target.append(title, wrapper, note);
  }
  const source = element('p', 'eval-source');
  const anchor = element('a', '', id === 'demo' ? '查看 3 题评测记录 ↗' : '查看 50 题评测记录 ↗');
  anchor.href = id === 'demo'
    ? 'https://github.com/liunian66666/text2Sql/blob/master/evals/demo-fast/report.md'
    : 'https://github.com/liunian66666/text2Sql/blob/master/evals/bird-dev-50/ablation/report.md';
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  source.append(anchor);
  target.append(source);
}

$('#example').addEventListener('change', event => selectCase(Number(event.target.value)));
$('#run-button').addEventListener('click', () => $('#result-section').scrollIntoView({ behavior: 'smooth', block: 'start' }));
$('#replay-button').addEventListener('click', async () => {
  if (!current) return;
  const version = ++playback;
  const button = $('#replay-button');
  button.disabled = true;
  button.textContent = '浏览历史阶段中…';
  $('#request-meta').textContent = '正在浏览历史实测记录 · 播放速度经过压缩，并非实时模型运行';
  badge($('#service-state'), '回放中', 'running');
  for (let i = 0; i <= STAGES.length; i++) {
    if (playback !== version) return;
    selectedStage = Math.max(0, i - 1);
    renderTimeline(i);
    if (i < STAGES.length) await new Promise(resolve => setTimeout(resolve, 600));
  }
  if (playback === version) {
    button.disabled = false;
    button.textContent = '重新播放 ↺';
    badge($('#service-state'), '记录已保存', 'success');
    $('#request-meta').textContent = `历史实测 · ${current.database} · 全部阶段已完成`;
  }
});

document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab === button));
  document.querySelectorAll('.panel').forEach(panel => panel.classList.remove('active'));
  $(`#${button.dataset.tab}-panel`).classList.add('active');
  if (button.dataset.tab === 'evaluation') { renderEvaluations(); showEvaluation('demo'); }
}));
$('#refresh-evals').textContent = '查看来源 ↗';
$('#refresh-evals').addEventListener('click', () => window.open('https://github.com/liunian66666/text2Sql/tree/master/evals', '_blank', 'noopener,noreferrer'));
document.querySelectorAll('.copy').forEach(button => button.addEventListener('click', async () => {
  const value = $(`#${button.dataset.copy}`).textContent;
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = '已复制';
  } catch { button.textContent = '复制失败'; }
  setTimeout(() => { button.textContent = '复制'; }, 1500);
}));

fetch('./cases.json').then(response => {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}).then(data => {
  if (data.kind !== 'recorded-run-preview' || !Array.isArray(data.cases) || data.cases.length !== 3) throw new Error('案例数据不完整');
  cases = data.cases;
  $('#example').replaceChildren(...cases.map((item, index) => {
    const option = element('option', '', `[已验证 ${index + 1}] ${item.title} — ${item.question}`);
    option.value = String(index);
    return option;
  }));
  const selected = Math.max(0, cases.findIndex(item => `#${item.id}` === location.hash));
  selectCase(selected);
}).catch(error => {
  badge($('#service-state'), '加载失败', 'error');
  $('#request-meta').textContent = `无法读取保存的案例：${error.message}`;
});
