let knowledge = [];
let avatarProfiles = [];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[char]);
}

document.querySelector("#loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const ok = document.querySelector("#username").value === "admin" && document.querySelector("#password").value === "123456";
  if (!ok) return alert("账号或密码错误");
  sessionStorage.setItem("adminAuthed", "1");
  document.querySelector("#loginOverlay").classList.add("hidden");
});

if (sessionStorage.getItem("adminAuthed") === "1") {
  document.querySelector("#loginOverlay").classList.add("hidden");
}

async function loadAnalytics() {
  const data = await fetch("/api/admin/analytics").then((res) => res.json());
  renderCards({
    onlineVisitors: data.serviceTrend.at(-1),
    activeQuestions: data.hotQuestions.length,
    avgLatencyMs: 920,
    satisfactionNow: data.satisfaction["满意"],
  });
  renderLineChart("#trendChart", data.serviceTrend, "人次");
  renderLineChart("#spendChart", data.avgSpendTrend, "元");
  renderPieChart("#consumeChart", data.consumeCategories);
  renderBarChart("#satisfactionChart", data.satisfaction);
  const behaviorBadges = [
    data.sourceRecords ? `源数据 ${data.sourceRecords} 条` : "",
    data.spotMetrics?.length ? `行为样本 ${data.spotMetrics.length} 组` : "",
    ...Object.entries(data.satisfaction).map(([key, value]) => `${key} ${value}%`),
    ...(data.insights || []).slice(0, 2),
  ].filter(Boolean);
  document.querySelector("#reportBox").innerHTML = behaviorBadges.map((item) => `<span class="badge">${escapeHtml(item)}</span>`).join("");
}

async function loadLiveMetrics() {
  try {
    const live = await fetch("/api/admin/live").then((res) => res.json());
    renderCards(live);
  } catch {
    // Keep last rendered metrics.
  }
}

function renderCards(data) {
  document.querySelector("#screen").innerHTML = `
    <article class="card"><span>实时在线游客</span><strong>${data.onlineVisitors}</strong></article>
    <article class="card"><span>活跃咨询数</span><strong>${data.activeQuestions}</strong></article>
    <article class="card"><span>平均响应延迟</span><strong>${data.avgLatencyMs}ms</strong></article>
    <article class="card"><span>即时满意率</span><strong>${data.satisfactionNow}%</strong></article>`;
}

function renderLineChart(selector, values, unit) {
  const width = 420;
  const height = 190;
  const pad = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = pad + index * ((width - pad * 2) / (values.length - 1));
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return [x, y, value];
  });
  const path = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  document.querySelector(selector).innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img">
      <line class="axis" x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"></line>
      <line class="axis" x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}"></line>
      <path class="line" d="${path}"></path>
      ${points.map(([x, y, value]) => `<circle class="dot" cx="${x}" cy="${y}" r="4"></circle><text class="chart-label" x="${x - 12}" y="${y - 8}">${value}${unit}</text>`).join("")}
    </svg>`;
}

function renderPieChart(selector, data) {
  const colors = ["#126a54", "#5a8f7b", "#d19b4c", "#9c5f5f", "#496b8c"];
  let start = 0;
  const total = Object.values(data).reduce((sum, value) => sum + value, 0);
  const stops = Object.entries(data).map(([, value], index) => {
    const end = start + (value / total) * 100;
    const part = `${colors[index % colors.length]} ${start.toFixed(1)}% ${end.toFixed(1)}%`;
    start = end;
    return part;
  });
  document.querySelector(selector).innerHTML = `
    <div class="pie" style="background: conic-gradient(${stops.join(",")})"></div>
    <div class="legend">${Object.entries(data).map(([key, value], index) => `
      <div class="legend-item"><span class="swatch" style="background:${colors[index % colors.length]}"></span>${escapeHtml(key)} ${value}%</div>
    `).join("")}</div>`;
}

function renderBarChart(selector, data) {
  document.querySelector(selector).innerHTML = Object.entries(data).map(([key, value]) => `
    <div class="bar-row">
      <span>${escapeHtml(key)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${value}%"></div></div>
      <strong>${value}%</strong>
    </div>
  `).join("");
}

function rowTemplate(item, header = false) {
  if (header) return `<div class="row header"><span>标题</span><span>区域</span><span>分类</span><span>内容</span><span>操作</span></div>`;
  return `<div class="row" data-id="${escapeHtml(item.id)}">
    <input data-field="title" value="${escapeHtml(item.title || "")}">
    <input data-field="area" value="${escapeHtml(item.area || "")}">
    <input data-field="category" value="${escapeHtml(item.category || "")}">
    <input data-field="content" value="${escapeHtml(item.content || "")}">
    <div class="actions"><button data-action="save">保存</button><button class="delete" data-action="delete">删除</button></div>
  </div>`;
}

async function loadKnowledge() {
  knowledge = await fetch("/api/knowledge").then((res) => res.json());
  document.querySelector("#knowledgeList").innerHTML = rowTemplate({}, true) + knowledge.map((item) => rowTemplate(item)).join("");
}

document.querySelector("#knowledgeList").addEventListener("click", async (event) => {
  const action = event.target.dataset.action;
  if (!action) return;
  const row = event.target.closest(".row");
  const id = row.dataset.id;
  if (action === "delete") {
    await fetch(`/api/knowledge/${id}`, {method: "DELETE"});
    return loadKnowledge();
  }
  const body = {};
  row.querySelectorAll("input").forEach((field) => body[field.dataset.field] = field.value);
  body.keywords = body.title.split(/[\s,，、]+/).filter(Boolean);
  await fetch(`/api/knowledge/${id}`, {method: "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
  loadKnowledge();
});

document.querySelector("#addKnowledge").addEventListener("click", async () => {
  await fetch("/api/knowledge", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({title: "新知识点", area: "灵山胜境", category: "自定义", content: "请输入内容", keywords: ["新知识点"]})
  });
  loadKnowledge();
});

document.querySelector("#bulkImport").addEventListener("click", async () => {
  const text = document.querySelector("#bulkText").value.trim();
  if (!text) return;
  const result = await fetch("/api/knowledge/bulk", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({text, area: "灵山胜境", category: "批量导入"})
  }).then((res) => res.json());
  document.querySelector("#bulkText").value = "";
  alert(`已导入 ${result.created} 条知识点`);
  loadKnowledge();
});

document.querySelector("#uploadKnowledge").addEventListener("click", async () => {
  const file = document.querySelector("#knowledgeFile").files[0];
  if (!file) return alert("请先选择一个知识文档");
  const form = new FormData();
  form.append("file", file);
  form.append("area", document.querySelector("#uploadArea").value.trim() || "灵山胜境");
  form.append("category", document.querySelector("#uploadCategory").value.trim() || "文件上传");
  const result = await fetch("/api/knowledge/upload", {method: "POST", body: form}).then((res) => res.json());
  if (result.error) return alert(`导入失败：${result.error}`);
  document.querySelector("#knowledgeFile").value = "";
  alert(`已从 ${result.filename} 导入 ${result.created} 条知识`);
  loadKnowledge();
});

function metricCard(label, value) {
  return `<article class="mini-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function listBlock(title, items, empty = "暂无数据") {
  const rows = (items || []).length
    ? items.map((item) => `<li><span>${escapeHtml(item.name)}</span><strong>${escapeHtml(item.value)}</strong></li>`).join("")
    : `<li><span>${empty}</span><strong>-</strong></li>`;
  return `<section class="analysis-block"><h3>${escapeHtml(title)}</h3><ul>${rows}</ul></section>`;
}

async function loadFeedbackAnalysis() {
  const data = await fetch("/api/admin/feedback-analysis").then((res) => res.json());
  document.querySelector("#feedbackSummary").innerHTML = [
    metricCard("真实交互", data.totalInteractions),
    metricCard("已评价", data.ratedInteractions),
    metricCard("满意", data.ratingCounts?.["满意"] || 0),
    metricCard("不满意", data.ratingCounts?.["不满意"] || 0),
  ].join("");
  document.querySelector("#feedbackAnalysis").innerHTML = [
    listBlock("热门问题", data.hotQuestions),
    listBlock("高频关键词", data.hotKeywords),
    listBlock("知识命中", data.hotSources),
    listBlock("路线兴趣", data.routeInterest),
    listBlock("情绪趋势", data.emotionTrend),
    listBlock("运营建议", (data.suggestions || []).map((name, index) => ({name, value: index + 1}))),
  ].join("");
  document.querySelector("#latestInteractions").innerHTML = (data.latest || []).map((item) => `
    <article class="interaction-item">
      <div><strong>${escapeHtml(item.query)}</strong><span>${new Date((item.time || 0) * 1000).toLocaleString()}</span></div>
      <p>${escapeHtml(item.answer || "")}</p>
      <small>引擎：${escapeHtml(item.engine || "-")} · 置信度：${Math.round((item.confidence || 0) * 100)}% · 反馈：${escapeHtml(item.feedback || "未评价")}</small>
    </article>
  `).join("") || `<p class="empty">暂无真实交互记录。</p>`;
}

document.querySelector("#refreshFeedback").addEventListener("click", loadFeedbackAnalysis);

async function loadAvatarConfig() {
  const config = await fetch("/api/admin/avatar-config").then((res) => res.json());
  avatarProfiles = config.profiles || [];
  const profileSelect = document.querySelector("#profileSelect");
  profileSelect.innerHTML = avatarProfiles.map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.avatar)}</option>`).join("");
  profileSelect.value = config.profileId || avatarProfiles[0]?.id || "";
  renderVoiceOptions(config.voice || config.profile?.voice);
  document.querySelector("#styleSelect").value = config.style || config.profile?.style || "calm";
  renderAvatarPreview(false);
}

function selectedProfile() {
  const id = document.querySelector("#profileSelect").value;
  return avatarProfiles.find((profile) => profile.id === id) || avatarProfiles[0] || {};
}

function renderVoiceOptions(selectedVoice) {
  const voices = Array.from(new Set(avatarProfiles.map((profile) => profile.voice).filter(Boolean)));
  document.querySelector("#voiceSelect").innerHTML = voices.map((voice) => `<option>${escapeHtml(voice)}</option>`).join("");
  document.querySelector("#voiceSelect").value = selectedVoice || selectedProfile().voice || voices[0] || "";
}

function renderAvatarPreview(useProfileDefaults = true) {
  const profile = selectedProfile();
  if (useProfileDefaults) {
    document.querySelector("#styleSelect").value = profile.style || "calm";
    renderVoiceOptions(profile.voice);
  }
  document.querySelector("#avatarPreview").innerHTML = `
    <strong>${escapeHtml(profile.name || "")}</strong> · ${escapeHtml(profile.title || "")}<br>
    ${escapeHtml(profile.tagline || "")}<br>
    当前声音：${escapeHtml(document.querySelector("#voiceSelect").value || profile.voice || "-")} · 当前风格：${escapeHtml(document.querySelector("#styleSelect").selectedOptions[0]?.textContent || "-")}<br>
    ${(profile.chips || []).map((chip) => `<span>${escapeHtml(chip)}</span>`).join("")}
  `;
}

document.querySelector("#profileSelect").addEventListener("change", () => renderAvatarPreview(true));
document.querySelector("#voiceSelect").addEventListener("change", () => renderAvatarPreview(false));
document.querySelector("#styleSelect").addEventListener("change", () => renderAvatarPreview(false));

document.querySelector("#saveAvatar").addEventListener("click", async () => {
  const profile = selectedProfile();
  const config = {
    profileId: profile.id,
    avatar: profile.avatar,
    voice: document.querySelector("#voiceSelect").value,
    style: document.querySelector("#styleSelect").value,
  };
  await fetch("/api/admin/avatar-config", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(config)});
  alert("数字人配置已保存");
});

loadAnalytics();
loadLiveMetrics();
loadKnowledge();
loadAvatarConfig();
loadFeedbackAnalysis();
setInterval(loadLiveMetrics, 3000);
