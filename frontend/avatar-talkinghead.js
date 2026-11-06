import { TalkingHead } from "./talkinghead/talkinghead.mjs";

const shell = document.querySelector("#avatar");
const stage = document.querySelector("#talkingHeadAvatar");
const loading = document.querySelector("#avatarLoading");

const MOOD_BY_STATE = {
  normal: "neutral",
  smile: "happy",
  thinking: "neutral",
  focused: "neutral",
  listening: "neutral",
  speaking: "happy"
};

const MOOD_BY_EMOTION = {
  平静: "neutral",
  认真: "neutral",
  思考: "neutral",
  开心: "happy",
  高兴: "happy",
  欢迎: "happy",
  赞许: "happy",
  紧张: "fear",
  抱歉: "sad",
  遗憾: "sad"
};

const MANUAL_VISEMES = [
  "viseme_PP", "viseme_aa", "viseme_E", "viseme_I", "viseme_O", "viseme_U",
  "viseme_FF", "viseme_DD", "viseme_kk", "viseme_nn", "viseme_RR", "viseme_SS", "viseme_CH", "viseme_TH"
];
const MOUTH_FALLBACKS = ["mouthOpen", "jawOpen"];

const PINYIN_BY_CHAR = {
  "一":"yi", "二":"er", "三":"san", "四":"si", "五":"wu", "六":"liu", "七":"qi", "八":"ba", "九":"jiu", "十":"shi", "百":"bai", "千":"qian", "万":"wan",
  "你":"ni", "好":"hao", "我":"wo", "们":"men", "您":"nin", "的":"de", "了":"le", "在":"zai", "是":"shi", "和":"he", "与":"yu", "为":"wei", "到":"dao", "从":"cong", "再":"zai", "先":"xian", "后":"hou", "可":"ke", "以":"yi", "请":"qing", "问":"wen", "答":"da", "说":"shuo", "讲":"jiang", "解":"jie", "听":"ting", "看":"kan", "走":"zou", "去":"qu", "来":"lai", "回":"hui", "给":"gei", "帮":"bang", "按":"an", "选":"xuan", "择":"ze", "更":"geng", "新":"xin", "出":"chu", "入":"ru", "开":"kai", "始":"shi", "停":"ting", "止":"zhi", "继":"ji", "续":"xu", "播":"bo", "放":"fang", "语":"yu", "音":"yin",
  "灵":"ling", "山":"shan", "胜":"sheng", "境":"jing", "景":"jing", "区":"qu", "导":"dao", "览":"lan", "游":"you", "客":"ke", "服":"fu", "务":"wu", "数":"shu", "字":"zi", "人":"ren", "小":"xiao", "讲":"jiang", "员":"yuan",
  "佛":"fo", "大":"da", "九龙":"jiu long", "龙":"long", "灌":"guan", "浴":"yu", "梵":"fan", "宫":"gong", "坛":"tan", "城":"cheng", "印":"yin", "掌":"zhang", "祥":"xiang", "符":"fu", "福":"fu", "慧":"hui", "照":"zhao", "壁":"bi", "莲":"lian", "花":"hua", "广":"guang", "场":"chang", "香":"xiang", "水":"shui", "海":"hai", "曼":"man", "飞":"fei", "桥":"qiao", "廊":"lang", "门":"men", "牌":"pai", "坊":"fang", "钟":"zhong", "楼":"lou", "鼓":"gu", "观":"guan", "寺":"si", "庙":"miao", "塔":"ta", "殿":"dian",
  "拈":"nian", "湾":"wan", "禅":"chan", "意":"yi", "夜":"ye", "市":"shi", "灯":"deng", "光":"guang", "秀":"xiu", "演":"yan", "艺":"yi", "文":"wen", "化":"hua", "历":"li", "史":"shi", "亲":"qin", "子":"zi", "家":"jia", "庭":"ting", "拍":"pai", "照":"zhao", "休":"xiu", "闲":"xian", "半":"ban", "天":"tian", "全":"quan", "日":"ri", "路":"lu", "线":"xian", "推":"tui", "荐":"jian", "安":"an", "排":"pai", "避":"bi", "免":"mian", "拥":"yong", "挤":"ji", "人":"ren", "多":"duo", "少":"shao", "快":"kuai", "慢":"man", "适":"shi", "合":"he", "建":"jian", "议":"yi", "预":"yu", "留":"liu", "分":"fen", "钟":"zhong", "时":"shi", "间":"jian", "约":"yue", "需":"xu", "要":"yao", "步":"bu", "行":"xing", "乘":"cheng", "坐":"zuo", "车":"che", "船":"chuan", "票":"piao", "口":"kou", "附":"fu", "近":"jin", "左":"zuo", "右":"you", "前":"qian", "往":"wang", "返":"fan", "程":"cheng", "高":"gao", "峰":"feng", "错":"cuo", "过":"guo",
  "现":"xian", "在":"zai", "当":"dang", "前":"qian", "已":"yi", "按":"an", "默":"mo", "认":"ren", "兴":"xing", "趣":"qu", "查":"cha", "找":"zhao", "知":"zhi", "识":"shi", "库":"ku", "检":"jian", "索":"suo", "结":"jie", "果":"guo", "来":"lai", "源":"yuan", "相":"xiang", "关":"guan", "信":"xin", "息":"xi", "置":"zhi", "置":"zhi", "信":"xin", "度":"du", "满":"man", "意":"yi", "般":"ban", "不":"bu", "错":"cuo", "误":"wu", "离":"li", "线":"xian", "缓":"huan", "存":"cun", "网":"wang", "络":"luo", "服":"fu", "务":"wu", "连":"lian", "接":"jie", "刷":"shua", "新":"xin", "重":"chong", "试":"shi"
};

const INITIAL_TO_VISEME = [
  ["zh", "CH"], ["ch", "CH"], ["sh", "SS"],
  ["b", "PP"], ["p", "PP"], ["m", "PP"], ["f", "FF"],
  ["d", "DD"], ["t", "DD"], ["n", "nn"], ["l", "RR"],
  ["g", "kk"], ["k", "kk"], ["h", "kk"],
  ["j", "CH"], ["q", "CH"], ["x", "SS"],
  ["r", "RR"], ["z", "SS"], ["c", "SS"], ["s", "SS"],
  ["y", "I"], ["w", "U"]
];
const SPEAKING_CLASS_DELAY = 80;
let head = null;
let ready = false;
let currentMood = "neutral";
let speakTimer = 0;
let queuedText = "";
let availableMorphs = new Set();
let lipTimer = 0;
let lipStopTimer = 0;
let lipIndex = 0;
let activeViseme = "";

function setLoading(text) {
  if (loading) loading.textContent = text;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function waitForLipsync(lang = "en", timeout = 2500) {
  const started = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (!head || head.lipsync?.[lang] || performance.now() - started > timeout) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function refreshMorphTargets() {
  try {
    availableMorphs = new Set(head?.getMorphTargetNames?.() || []);
  } catch {
    availableMorphs = new Set();
  }
}

function hasMorph(name) {
  return !availableMorphs.size || availableMorphs.has(name);
}

function setMorph(name, value, ms = 80) {
  if (!head || !name || !hasMorph(name)) return false;
  try {
    head.setValue(name, value, ms);
    return true;
  } catch {
    return false;
  }
}

function getLipTargets() {
  const visemes = MANUAL_VISEMES.filter((name) => hasMorph(name));
  if (visemes.length) return visemes;
  return MOUTH_FALLBACKS.filter((name) => hasMorph(name));
}

function pinyinForChar(char) {
  return PINYIN_BY_CHAR[char] || "";
}

function fallbackPinyin(char) {
  const fallbacks = ["a", "yi", "wu", "ou", "an", "ang", "en", "eng", "shi", "ma", "de"];
  return fallbacks[(char.codePointAt(0) || 0) % fallbacks.length];
}

function splitPinyinText(text) {
  const syllables = [];
  for (const char of String(text || "")) {
    if (/\s/.test(char)) continue;
    if ("。！？!?；;".includes(char)) {
      syllables.push("sil");
      syllables.push("sil");
      continue;
    }
    if ("，、,:：".includes(char)) {
      syllables.push("sil");
      continue;
    }
    if (/[a-z]/i.test(char)) {
      syllables.push(char.toLowerCase());
      continue;
    }
    if (!/[\u4e00-\u9fff]/.test(char)) continue;
    const pinyin = pinyinForChar(char) || fallbackPinyin(char);
    syllables.push(...pinyin.split(/\s+/).filter(Boolean));
  }
  return syllables;
}

function resolveViseme(id) {
  if (!id || id === "sil") return "";
  const target = `viseme_${id}`;
  if (hasMorph(target)) return target;
  if (["aa", "O", "E", "I", "U"].includes(id)) {
    const fallback = MOUTH_FALLBACKS.find((name) => hasMorph(name));
    if (fallback) return fallback;
  }
  return "";
}

function pinyinToVisemes(pinyin) {
  if (!pinyin || pinyin === "sil") return [""];
  const py = pinyin.toLowerCase().replace(/ü/g, "v").replace(/[^a-zv]/g, "");
  if (!py) return [];

  const result = [];
  let final = py;
  for (const [initial, viseme] of INITIAL_TO_VISEME) {
    if (py.startsWith(initial)) {
      result.push(viseme);
      final = py.slice(initial.length);
      break;
    }
  }

  if (!final) return result;
  if (final.includes("a")) result.push("aa");
  else if (final.includes("o")) result.push("O");
  else if (final.includes("e")) result.push("E");
  else if (final.includes("i")) result.push("I");
  else if (final.includes("u") || final.includes("v")) result.push("U");

  if (/ng$/.test(final)) result.push("kk");
  else if (/n$/.test(final)) result.push("nn");
  else if (/r$/.test(final)) result.push("RR");

  return result.filter((item, index, items) => item && items[index - 1] !== item);
}

function makeVisemeSequence(text) {
  const sequence = [];
  for (const syllable of splitPinyinText(text)) {
    for (const viseme of pinyinToVisemes(syllable)) {
      sequence.push(resolveViseme(viseme));
    }
  }
  return sequence.filter((item, index, items) => item || items[index - 1]);
}

function estimateSpeechMs(text) {
  const chineseChars = (String(text || "").match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = String(text || "").replace(/[\u4e00-\u9fff\s]/g, "").length;
  return clamp(chineseChars * 230 + otherChars * 75 + 700, 900, 24000);
}

function clearSpeakTimer() {
  if (speakTimer) window.clearTimeout(speakTimer);
  speakTimer = 0;
}

function resetLipTargets(ms = 80) {
  for (const name of getLipTargets()) setMorph(name, 0, ms);
  for (const name of MOUTH_FALLBACKS) setMorph(name, 0, ms);
  activeViseme = "";
  if (shell) delete shell.dataset.viseme;
}

function clearManualLipSync(reset = true) {
  if (lipTimer) window.clearInterval(lipTimer);
  if (lipStopTimer) window.clearTimeout(lipStopTimer);
  lipTimer = 0;
  lipStopTimer = 0;
  lipIndex = 0;
  if (reset) resetLipTargets();
}

function startManualLipSync(text) {
  clearManualLipSync();
  const sequence = makeVisemeSequence(text);
  if (!sequence.length) return;

  const duration = estimateSpeechMs(text);
  const step = clamp(duration / Math.max(sequence.length, 1), 95, 150);

  const tick = () => {
    const next = sequence[lipIndex % sequence.length];
    lipIndex += 1;
    if (activeViseme) setMorph(activeViseme, 0, step * 0.45);
    for (const name of MOUTH_FALLBACKS) setMorph(name, 0, step * 0.45);

    activeViseme = next || "";
    if (shell) shell.dataset.viseme = activeViseme || "rest";
    if (!activeViseme) return;

    const intensity = 0.42 + ((lipIndex % 4) * 0.11);
    const changed = setMorph(activeViseme, clamp(intensity, 0.42, 0.78), step * 0.55);
    if (changed && activeViseme.startsWith("viseme_")) setMorph("mouthOpen", 0.18, step * 0.55);
  };

  tick();
  lipTimer = window.setInterval(tick, step);
  lipStopTimer = window.setTimeout(() => clearManualLipSync(), duration);
}

function applyMood(mood) {
  if (!ready || !head || !mood) return;
  try {
    head.setMood(mood);
    currentMood = mood;
  } catch {
    try {
      head.setMood("neutral");
      currentMood = "neutral";
    } catch {}
  }
}

async function init() {
  if (!shell || !stage) return;
  shell.classList.add("talkinghead-shell");
  setLoading("正在加载 3D 数字人...");

  try {
    head = new TalkingHead(stage, {
      lipsyncModules: ["en"],
      lipsyncLang: "en",
      cameraView: "upper",
      cameraRotateEnable: false,
      cameraPanEnable: false,
      cameraZoomEnable: false,
      modelPixelRatio: Math.min(window.devicePixelRatio || 1, 1.75),
      modelMovementFactor: 0.65,
      avatarMood: "neutral",
      avatarMute: true,
      avatarIdleEyeContact: 0.55,
      avatarIdleHeadMove: 0.35,
      avatarSpeakingEyeContact: 0.75,
      avatarSpeakingHeadMove: 0.45,
      lightAmbientIntensity: 2.4,
      lightDirectIntensity: 28,
      ttsEndpoint: ""
    });

    await head.showAvatar({
      url: "/frontend/talkinghead/guide.glb",
      body: "F",
      avatarMood: "neutral",
      avatarMute: true,
      lipsyncLang: "en",
      ttsLang: "zh-CN"
    }, (...args) => {
      const ev = args.find((item) => item && typeof item.loaded === "number");
      if (ev?.lengthComputable && ev.total) {
        setLoading(`正在加载 3D 数字人 ${Math.min(100, Math.round((ev.loaded / ev.total) * 100))}%`);
      }
    });

    await waitForLipsync("en");
    refreshMorphTargets();
    ready = true;
    shell.classList.add("talkinghead-ready");
    shell.classList.remove("talkinghead-error");
    setLoading("3D 数字人已就绪");
    applyMood(currentMood);
    if (queuedText) window.lingshanAvatar.speakText(queuedText);
  } catch (error) {
    console.error("TalkingHead init failed", error);
    shell.classList.add("talkinghead-error");
    setLoading("3D 数字人加载失败，请检查模型资源");
  }
}

window.lingshanAvatar = {
  speakText(text, options = {}) {
    queuedText = String(text || "");
    if (!queuedText) return;
    if (options.mood) applyMood(options.mood);
    if (!ready || !head) return;

    clearSpeakTimer();
    try {
      head.stopSpeaking();
      head.lookAtCamera?.(350);
      head.speakWithHands?.();
      startManualLipSync(queuedText);
      window.setTimeout(() => shell.classList.add("speaking"), SPEAKING_CLASS_DELAY);
      speakTimer = window.setTimeout(() => {
        shell.classList.remove("speaking");
        clearManualLipSync();
      }, estimateSpeechMs(queuedText));
    } catch (error) {
      console.warn("TalkingHead speak failed", error);
    }
  },

  stopSpeaking() {
    clearSpeakTimer();
    clearManualLipSync();
    queuedText = "";
    shell?.classList.remove("speaking");
    try { head?.stopSpeaking(); } catch {}
  },

  pauseSpeaking() {
    this.stopSpeaking();
  },

  resumeSpeaking(text = queuedText) {
    if (text) this.speakText(text);
  },

  setMood(stateOrMood, emotionName = "") {
    const mood = MOOD_BY_EMOTION[emotionName] || MOOD_BY_STATE[stateOrMood] || stateOrMood || "neutral";
    applyMood(mood);
  },

  setListening(active) {
    shell?.classList.toggle("listening", Boolean(active));
    if (active) applyMood("neutral");
  },

  start() {
    try { head?.start(); } catch {}
  },

  stop() {
    try { head?.stop(); } catch {}
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, {once: true});
} else {
  init();
}

document.addEventListener("visibilitychange", () => {
  if (!head) return;
  if (document.visibilityState === "visible") window.lingshanAvatar.start();
  else window.lingshanAvatar.stop();
});

