const messages = document.querySelector("#messages");
const form = document.querySelector("#chatForm");
const input = document.querySelector("#messageInput");
const avatar = document.querySelector("#avatar");
const avatarName = document.querySelector("#avatarName");
const avatarTitle = document.querySelector("#avatarTitle");
const avatarChips = document.querySelector("#avatarChips");
const visitorAvatarSelect = document.querySelector("#visitorAvatarSelect");
const emotion = document.querySelector("#emotion");
const routesNode = document.querySelector("#routes");
const routeDetail = document.querySelector("#routeDetail");
const voiceButton = document.querySelector("#voiceButton");
const confidenceNode = document.querySelector("#confidence");
const sessionId = `visitor-${Date.now()}`;

let currentRoutes = [];
let currentRoute = null;
let currentSpotIndex = 0;
let recognition = null;
let currentAvatarProfile = null;
let avatarProfiles = [];
let avatarConfig = null;
let availableVoices = [];
let speechQueue = [];
let speechIndex = 0;
let activeUtterance = null;
let activeSpeechText = "";
let speechRunId = 0;
let speechPaused = false;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[char]);
}

function switchView(viewId) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
}

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

function addMessage(role, text = "", metadata = {}) {
  const node = document.createElement("div");
  node.className = `msg ${role}`;
  const sourceHtml = metadata.sources?.length ? `<div class="sources">来源：${metadata.sources.map((source) => escapeHtml(source.title)).join("、")}</div>` : "";
  const routeHtml = metadata.routeRecommendations?.length ? `<div class="sources">推荐路线：${metadata.routeRecommendations.map((route) => escapeHtml(route.title)).join("、")}</div>` : "";
  const followHtml = metadata.followups?.length ? `<div class="followups">继续问：${metadata.followups.map((item) => `<button type="button" data-followup="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}</div>` : "";
  node.innerHTML = `<div class="content">${escapeHtml(text)}</div>${sourceHtml}${routeHtml}${followHtml}`;
  messages.appendChild(node);
  messages.scrollTop = messages.scrollHeight;
  node.querySelectorAll("[data-followup]").forEach((button) => button.addEventListener("click", () => send(button.dataset.followup)));
  return node.querySelector(".content");
}

function setAvatarState(stateName, emotionName) {
  avatar.classList.remove("smile", "thinking", "focused");
  if (stateName && stateName !== "normal") avatar.classList.add(stateName);
  emotion.textContent = emotionName || "平静";
  window.lingshanAvatar?.setMood?.(stateName || "normal", emotionName || "平静");
}

function refreshVoices() {
  if (!("speechSynthesis" in window)) return;
  availableVoices = window.speechSynthesis.getVoices();
}

function pickVoice(profile) {
  refreshVoices();
  if (!availableVoices.length) return null;

  const hints = profile?.voiceHints || [];
  const hintMatch = availableVoices.find((voice) => {
    const signature = `${voice.name} ${voice.lang}`.toLowerCase();
    return hints.some((hint) => signature.includes(String(hint).toLowerCase()));
  });
  if (hintMatch) return hintMatch;

  const zhVoices = availableVoices.filter((voice) => /zh|cmn|yue|chinese|mandarin|china/i.test(`${voice.lang} ${voice.name}`));
  const pool = zhVoices.length ? zhVoices : availableVoices;
  const fallbackSlot = String(profile?.id || profile?.name || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const slot = Number.isFinite(Number(profile?.voiceSlot)) ? Number(profile.voiceSlot) : fallbackSlot;
  return pool[((slot % pool.length) + pool.length) % pool.length];
}

function splitSpeechText(text, size = 120) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const parts = [];
  let buffer = "";
  for (const char of normalized) {
    buffer += char;
    if (buffer.length >= size || "。！？；，、,.!?;".includes(char)) {
      if (buffer.trim()) parts.push(buffer.trim());
      buffer = "";
    }
  }
  if (buffer.trim()) parts.push(buffer.trim());
  return parts;
}

function buildUtterance(text, runId) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  const rate = Number(currentAvatarProfile?.rate || 1.02);
  const pitch = Number(currentAvatarProfile?.pitch || 1.05);
  utterance.rate = Math.min(1.45, Math.max(0.7, rate));
  utterance.pitch = Math.min(1.8, Math.max(0.5, pitch));
  utterance.volume = Math.min(1, Math.max(0.55, Number(currentAvatarProfile?.volume || 1)));
  const voice = pickVoice(currentAvatarProfile);
  if (voice) utterance.voice = voice;
  utterance.onstart = () => {
    if (runId !== speechRunId || speechPaused) return;
    avatar.classList.add("speaking");
    window.lingshanAvatar?.speakText?.(text);
  };
  utterance.onend = () => {
    window.lingshanAvatar?.stopSpeaking?.();
    playNextSpeechChunk(runId);
  };
  utterance.onerror = () => {
    window.lingshanAvatar?.stopSpeaking?.();
    playNextSpeechChunk(runId);
  };
  return utterance;
}

function playNextSpeechChunk(runId) {
  if (!("speechSynthesis" in window)) return;
  if (runId !== speechRunId || speechPaused) return;
  speechIndex += 1;
  if (speechIndex >= speechQueue.length) {
    activeUtterance = null;
    activeSpeechText = "";
    avatar.classList.remove("speaking");
    window.lingshanAvatar?.stopSpeaking?.();
    return;
  }
  activeUtterance = buildUtterance(speechQueue[speechIndex], runId);
  window.speechSynthesis.speak(activeUtterance);
}

function speak(text) {
  if (!("speechSynthesis" in window) || !text) return;
  speechRunId += 1;
  const runId = speechRunId;
  speechPaused = false;
  activeSpeechText = String(text || "");
  speechQueue = splitSpeechText(activeSpeechText);
  speechIndex = 0;
  window.speechSynthesis.cancel();
  window.lingshanAvatar?.stopSpeaking?.();
  window.speechSynthesis.resume();
  refreshVoices();
  if (!speechQueue.length) return;
  activeUtterance = buildUtterance(speechQueue[0], runId);
  setTimeout(() => {
    if (runId === speechRunId && activeUtterance) window.speechSynthesis.speak(activeUtterance);
  }, 60);
}

function pauseSpeech() {
  if (!("speechSynthesis" in window)) return;
  speechPaused = true;
  window.speechSynthesis.pause();
  avatar.classList.remove("speaking");
  window.lingshanAvatar?.pauseSpeaking?.();
}

function resumeSpeech() {
  if (!("speechSynthesis" in window)) return;
  speechPaused = false;
  window.speechSynthesis.resume();
  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    avatar.classList.add("speaking");
    window.lingshanAvatar?.resumeSpeaking?.(speechQueue[speechIndex] || activeSpeechText);
  }
  if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending && activeSpeechText) speak(activeSpeechText);
}

function stopSpeech() {
  if (!("speechSynthesis" in window)) return;
  speechRunId += 1;
  speechPaused = false;
  speechQueue = [];
  speechIndex = 0;
  activeUtterance = null;
  activeSpeechText = "";
  window.speechSynthesis.cancel();
  avatar.classList.remove("speaking");
  window.lingshanAvatar?.stopSpeaking?.();
}

function renderVisitorAvatarOptions(selectedId) {
  if (!visitorAvatarSelect || !avatarProfiles.length) return;
  visitorAvatarSelect.innerHTML = avatarProfiles
    .map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.avatar || profile.name)}</option>`)
    .join("");
  visitorAvatarSelect.value = selectedId;
}

function chooseAvatarProfile(config) {
  const savedId = localStorage.getItem("visitorAvatarProfileId");
  const selectedId = avatarProfiles.some((profile) => profile.id === savedId) ? savedId : config?.profileId;
  return avatarProfiles.find((profile) => profile.id === selectedId) || config?.profile || avatarProfiles[0] || {};
}

function applyAvatarConfig(config, profileOverride = null) {
  const profile = profileOverride || chooseAvatarProfile(config);
  currentAvatarProfile = profile;
  const preservedClasses = ["talkinghead-ready", "talkinghead-error", "speaking", "listening", "smile", "thinking", "focused"]
    .filter((className) => avatar.classList.contains(className));
  avatar.className = ["avatar", "talkinghead-shell", profile.cssClass || "profile-lingshan", ...preservedClasses].join(" ");
  avatarName.textContent = profile.name || "灵小山";
  avatarTitle.textContent = `${profile.title || "灵山胜境讲解员"} · ${profile.voice || config?.voice || "温柔女声"}`;
  avatarChips.innerHTML = (profile.chips || ["语音问答", "流式回答", "情绪表情", "伴随讲解"])
    .map((chip) => `<span>${escapeHtml(chip)}</span>`)
    .join("");
  renderVisitorAvatarOptions(profile.id);
}

async function loadAvatarConfig() {
  try {
    avatarConfig = await fetch("/api/admin/avatar-config").then((res) => res.json());
    avatarProfiles = avatarConfig.profiles || [];
    if (!avatarProfiles.length) {
      avatarProfiles = await fetch("/api/avatar-profiles").then((res) => res.json());
      avatarConfig.profiles = avatarProfiles;
    }
    applyAvatarConfig(avatarConfig);
  } catch {
    avatarProfiles = [];
    avatarConfig = {profile: {id: "lingshan-default", cssClass: "profile-lingshan", name: "灵小山", title: "灵山胜境讲解员", voice: "温柔女声"}};
    applyAvatarConfig(avatarConfig);
  }
}

function appendSpeakButton(container, text) {
  if (!text) return;
  const voiceBox = document.createElement("div");
  voiceBox.className = "followups";
  voiceBox.innerHTML = `
    <button type="button" data-voice="play">播放语音</button>
    <button type="button" data-voice="pause">暂停</button>
    <button type="button" data-voice="resume">继续</button>
    <button type="button" data-voice="stop">停止</button>
  `;
  voiceBox.querySelector('[data-voice="play"]').addEventListener("click", () => speak(text));
  voiceBox.querySelector('[data-voice="pause"]').addEventListener("click", pauseSpeech);
  voiceBox.querySelector('[data-voice="resume"]').addEventListener("click", resumeSpeech);
  voiceBox.querySelector('[data-voice="stop"]').addEventListener("click", stopSpeech);
  container.appendChild(voiceBox);
}

function appendFeedbackButtons(container, interactionId) {
  if (!interactionId) return;
  const box = document.createElement("div");
  box.className = "feedback-box";
  box.innerHTML = `
    <span>这次回答有帮助吗？</span>
    <button type="button" data-rating="good">满意</button>
    <button type="button" data-rating="neutral">一般</button>
    <button type="button" data-rating="bad">不满意</button>
  `;
  box.querySelectorAll("[data-rating]").forEach((button) => {
    button.addEventListener("click", async () => {
      await fetch("/api/feedback", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({interactionId, rating: button.dataset.rating})
      });
      box.innerHTML = `<span>已收到反馈，谢谢你。</span>`;
    });
  });
  container.appendChild(box);
}

async function send(message) {
  addMessage("user", message);
  const botContent = addMessage("bot", "正在检索灵山知识库...");
  setAvatarState("thinking", "思考中");
  let finalData = null;
  let fullText = "";

  try {
    const res = await fetch("/api/chat/stream", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({message, sessionId})
    });
    if (!res.ok || !res.body || !res.body.getReader) {
      throw new Error("stream unavailable");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    botContent.textContent = "";

    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, {stream: true});
      const events = buffer.split("\n\n");
      buffer = events.pop();
      for (const eventText of events) {
        const eventName = eventText.match(/^event: (.+)$/m)?.[1];
        const dataRaw = eventText.match(/^data: (.+)$/m)?.[1];
        if (!dataRaw) continue;
        const data = JSON.parse(dataRaw);
        if (eventName === "chunk") {
          fullText += data.text;
          botContent.textContent = fullText;
          messages.scrollTop = messages.scrollHeight;
        }
        if (eventName === "done") finalData = data;
      }
    }
  } catch (error) {
    try {
      const fallback = await fetch("/api/chat", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({message, sessionId})
      }).then((res) => res.json());
      finalData = fallback;
      fullText = fallback.answer;
      botContent.textContent = fullText;
    } catch {
      const cached = JSON.parse(localStorage.getItem("lastRoutes") || "[]");
      fullText = cached.length ? "当前服务没有连接上。我已启用离线兜底，可以继续查看最近一次缓存的路线。请确认黑色启动窗口还开着。" : "当前服务没有连接上。请确认 start.bat 的黑色启动窗口还开着，然后刷新页面重试。";
      botContent.textContent = fullText;
      if (cached.length) renderRoutes(cached);
    }
  }

  avatar.classList.remove("speaking", "thinking");
  if (finalData) {
    setAvatarState(finalData.emotion?.avatarState, finalData.emotion?.name);
    confidenceNode.textContent = `${Math.round((finalData.confidence || 0.9) * 100)}%`;
    const parent = botContent.closest(".msg");
    parent.insertAdjacentHTML("beforeend", [
      finalData.sources?.length ? `<div class="sources">来源：${finalData.sources.map((source) => escapeHtml(source.title)).join("、")}</div>` : "",
      finalData.routeRecommendations?.length ? `<div class="sources">推荐路线：${finalData.routeRecommendations.map((route) => escapeHtml(route.title)).join("、")}</div>` : "",
      finalData.followups?.length ? `<div class="followups">继续问：${finalData.followups.map((item) => `<button type="button" data-followup="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}</div>` : ""
    ].join(""));
    parent.querySelectorAll("[data-followup]").forEach((button) => button.addEventListener("click", () => send(button.dataset.followup)));
    appendSpeakButton(parent, finalData.answer);
    appendFeedbackButtons(parent, finalData.interactionId);
    if (finalData.routeRecommendations?.length) renderRoutes(finalData.routeRecommendations);
  } else {
    appendSpeakButton(botContent.closest(".msg"), fullText);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  send(message);
});

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const rec = new SpeechRecognition();
  rec.lang = "zh-CN";
  rec.interimResults = true;
  rec.continuous = false;
  rec.onstart = () => {
    voiceButton.classList.add("recording");
    avatar.classList.add("listening");
    window.lingshanAvatar?.setListening?.(true);
    voiceButton.textContent = "Stop";
  };
  rec.onresult = (event) => {
    const text = Array.from(event.results).map((result) => result[0].transcript).join("");
    input.value = text;
    if (event.results[event.results.length - 1].isFinal && text.trim()) {
      rec.stop();
      send(text.trim());
      input.value = "";
    }
  };
  rec.onend = () => {
    voiceButton.classList.remove("recording");
    avatar.classList.remove("listening");
    window.lingshanAvatar?.setListening?.(false);
    voiceButton.textContent = "Mic";
  };
  rec.onerror = () => addMessage("bot", "当前浏览器没有授予麦克风权限，或不支持语音识别。你也可以直接输入文字。");
  return rec;
}

voiceButton.addEventListener("click", () => {
  recognition = recognition || setupSpeechRecognition();
  if (!recognition) {
    addMessage("bot", "这个浏览器暂不支持内置语音识别。建议用 Edge 或 Chrome 打开，或先使用文本输入。");
    return;
  }
  if (voiceButton.classList.contains("recording")) recognition.stop();
  else recognition.start();
});

if (visitorAvatarSelect) {
  visitorAvatarSelect.addEventListener("change", () => {
    const profile = avatarProfiles.find((item) => item.id === visitorAvatarSelect.value);
    if (!profile) return;
    localStorage.setItem("visitorAvatarProfileId", profile.id);
    applyAvatarConfig(avatarConfig, profile);
    stopSpeech();
  });
}

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => send(button.dataset.prompt));
});

document.querySelector("#routeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const interest = document.querySelector("#interestInput").value.trim();
  try {
    const routes = await fetch("/api/routes/recommend", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({interest})
    }).then((res) => res.json());
    renderRoutes(routes);
    addMessage("bot", `已按“${interest || "默认兴趣"}”更新路线推荐。`);
  } catch {
    addMessage("bot", "网络不可用，已保留当前路线缓存。");
  }
});

function renderRoutes(routes) {
  currentRoutes = routes;
  localStorage.setItem("lastRoutes", JSON.stringify(routes));
  routesNode.innerHTML = routes.map((route, index) => `
    <article class="route-card" data-index="${index}">
      <h3>${escapeHtml(route.title)}</h3>
      <div class="route-meta"><span>${escapeHtml(route.duration)}</span>${route.interestTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      <p>${escapeHtml(route.description)}</p>
      <div class="spots">${route.spotDetails.map((spot) => escapeHtml(spot.name)).join(" -> ")}</div>
    </article>
  `).join("");
  routesNode.querySelectorAll(".route-card").forEach((card) => {
    card.addEventListener("click", () => showRouteDetail(currentRoutes[Number(card.dataset.index)]));
  });
  if (routes[0] && !currentRoute) showRouteDetail(routes[0], false);
}

function showRouteDetail(route, activate = true) {
  currentRoute = route;
  currentSpotIndex = 0;
  routeDetail.classList.remove("empty-state");
  routeDetail.innerHTML = `
    <div class="detail-head">
      <div>
        <h2>${escapeHtml(route.title)}</h2>
        <p>${escapeHtml(route.description)}</p>
      </div>
      <div class="narration-actions">
        <button type="button" id="startNarration">开始伴随讲解</button>
        <button type="button" id="stopNarration">停止语音</button>
      </div>
    </div>
    <div class="timeline">
      ${route.spotDetails.map((spot, index) => `
        <div class="spot-step" data-step="${index}">
          <strong>${index + 1}. ${escapeHtml(spot.name)}</strong>
          <span>${escapeHtml(spot.category)} · 建议停留 ${spot.duration} 分钟</span>
          <div>${escapeHtml(spot.summary)}</div>
          <div class="spot-actions">
            <button type="button" data-narrate="${index}">讲解这个景点</button>
            <button type="button" data-ask="${escapeHtml(spot.name)}有什么看点">问看点</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
  document.querySelectorAll(".route-card").forEach((card) => card.classList.toggle("active", currentRoutes[Number(card.dataset.index)]?.id === route.id));
  routeDetail.querySelector("#startNarration").addEventListener("click", narrateCurrentSpot);
  routeDetail.querySelector("#stopNarration").addEventListener("click", stopSpeech);
  routeDetail.querySelectorAll("[data-narrate]").forEach((button) => {
    button.addEventListener("click", () => {
      currentSpotIndex = Number(button.dataset.narrate);
      narrateCurrentSpot();
    });
  });
  routeDetail.querySelectorAll("[data-ask]").forEach((button) => {
    button.addEventListener("click", () => send(button.dataset.ask));
  });
  if (activate) switchView("detailView");
}

function narrateCurrentSpot() {
  if (!currentRoute) return;
  const spot = currentRoute.spotDetails[currentSpotIndex];
  if (!spot) return;
  routeDetail.querySelectorAll(".spot-step").forEach((node) => node.classList.toggle("current", Number(node.dataset.step) === currentSpotIndex));
  const text = `现在为你讲解${spot.name}。${spot.summary}${spot.tips || ""}建议停留${spot.duration}分钟。`;
  const content = addMessage("bot", text);
  appendSpeakButton(content.closest(".msg"), text);
  speak(text);
  currentSpotIndex = Math.min(currentSpotIndex + 1, currentRoute.spotDetails.length - 1);
}

async function loadRoutes() {
  try {
    const routes = await fetch("/api/routes").then((res) => res.json());
    renderRoutes(routes);
  } catch {
    const cached = JSON.parse(localStorage.getItem("lastRoutes") || "[]");
    if (cached.length) renderRoutes(cached);
  }
}

addMessage("bot", "你好，我是灵小山。阶段 4 已升级为分屏导览：右侧选路线，中间看详情，支持语音问答、流式回答、离线兜底和伴随讲解。");
refreshVoices();
if ("speechSynthesis" in window) window.speechSynthesis.onvoiceschanged = refreshVoices;
loadAvatarConfig();
loadRoutes();


