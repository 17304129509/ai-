from pathlib import Path
import json
import re


PROJECT = Path(__file__).resolve().parents[1]
WORKSPACE = PROJECT.parents[1]
SOURCE = WORKSPACE / "work" / "github_ai_tour_agent" / "backend" / "knowledge_base"
DATA = PROJECT / "data"


ID_MAP = {
    "LS-001": "lingshan-wall",
    "LS-002": "wuming-bridge",
    "LS-003": "buddha-footprint",
    "LS-004": "five-wisdom-gate",
    "LS-005": "bodhi-avenue",
    "LS-006": "nine-dragon",
    "LS-007": "subduing-mara-relief",
    "LS-008": "ashoka-pillar",
    "LS-009": "hundred-children",
    "LS-010": "xiangfu-temple",
    "LS-011": "lingshan-buddha",
    "LS-012": "buddhist-museum",
    "LS-013": "brahma-palace",
    "LS-014": "five-mudra",
    "LS-015": "manfeilong-pagoda",
    "LS-016": "wujinyi-zhai",
    "NH-001": "nianhua-square",
    "NH-002": "fantian-flower-sea",
    "NH-003": "xiangyue-flower-street",
    "NH-004": "nianhua-hall",
    "NH-005": "wudeng-lake",
    "NH-006": "luming-valley",
}


DURATIONS = {
    "灵山大照壁": 10,
    "五明桥": 10,
    "佛足坛": 15,
    "五智门": 10,
    "菩提大道": 15,
    "九龙灌浴": 25,
    "降魔浮雕": 12,
    "阿育王柱": 15,
    "百子戏弥勒": 15,
    "祥符禅寺": 35,
    "灵山大佛": 45,
    "佛教文化博览馆": 35,
    "灵山梵宫": 60,
    "五印坛城": 35,
    "曼飞龙塔": 15,
    "无尽意斋": 20,
    "拈花广场": 10,
    "梵天花海": 40,
    "香月花街": 50,
    "拈花堂": 35,
    "五灯湖": 30,
    "鹿鸣谷": 35,
}


def load_text(name_part):
    for path in SOURCE.glob("*.txt"):
        if name_part in path.name:
            return path.read_text(encoding="utf-8-sig")
    raise FileNotFoundError(f"Missing source text containing {name_part}")


def write_json(name, value):
    (DATA / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def clean(text):
    return re.sub(r"\s+", " ", str(text or "")).strip()


def clip(text, size):
    text = clean(text)
    if len(text) <= size:
        return text
    return text[: size - 1].rstrip("，；、。 ") + "。"


def keywords_from(*parts):
    raw = " ".join(clean(part) for part in parts if part)
    words = re.findall(r"[A-Za-z0-9]+|[\u4e00-\u9fff]{2,}", raw)
    keep = []
    stop = {"核心", "用于", "游客", "景观", "文化", "展示", "提供", "同时", "功能", "体验", "重要"}
    for word in words:
        if word not in stop and word not in keep:
            keep.append(word)
    return keep[:10]


def classify(name, area, core, detail):
    text = f"{name} {area} {core} {detail}"
    if any(word in text for word in ["入口", "门户", "集散"]):
        return "入口集散"
    if any(word in text for word in ["演艺", "灯光秀", "动态", "表演"]):
        return "演艺体验"
    if any(word in text for word in ["寺", "禅寺", "禅堂", "礼佛", "朝圣"]):
        return "寺院禅修"
    if any(word in text for word in ["大佛", "地标", "柱", "塔"]):
        return "核心地标"
    if any(word in text for word in ["博览", "展厅", "博物", "艺术"]):
        return "文化展陈"
    if any(word in text for word in ["花海", "湖", "谷", "自然", "山林"]):
        return "自然休闲"
    if any(word in text for word in ["商业", "美食", "文创", "消费"]):
        return "商业休闲"
    if "拈花湾" in area:
        return "禅意休闲"
    return "佛教文化"


def parse_spots():
    text = load_text("景点结构化")
    rows = []
    header = None
    for line in text.splitlines():
        if "|" not in line:
            continue
        parts = [part.strip() for part in line.split("|")]
        if parts and parts[0] == "景区名称":
            header = parts
            continue
        if header and len(parts) >= len(header) and parts[1] in ID_MAP:
            row = dict(zip(header, parts[: len(header)]))
            rows.append(row)

    spots = []
    for row in rows:
        area = "拈花湾" if "拈花湾" in row["景区名称"] else "灵山胜境"
        name = row["景点名称"]
        core = clean(row["核心功能"])
        culture = clean(row["文化内涵"])
        detail = clean(row["详细介绍"])
        fallback = clean(" ".join([row["具体位置"], row["建筑/景观参数"]]))
        summary = clip(" ".join(part for part in [core, culture, detail or fallback] if part), 170)
        tips = clip(" ".join(part for part in [row["游玩亮点"], row["演艺/开放信息"], row["备注"]] if clean(part)), 190)
        if not summary:
            summary = clip(fallback or f"{name}是{area}的重要导览节点。", 170)
        if not tips:
            tips = "建议根据现场客流选择停留时长，适合拍照、休息或作为路线讲解节点。"
        category = classify(name, area, core, detail)
        spots.append(
            {
                "id": ID_MAP[row["景点ID"]],
                "sourceId": row["景点ID"],
                "name": name,
                "area": area,
                "category": category,
                "keywords": keywords_from(name, area, category, core, culture, row["游玩亮点"]),
                "summary": summary,
                "duration": DURATIONS.get(name, 20),
                "tips": tips,
                "position": clean(row["具体位置"]),
                "parameters": clean(row["建筑/景观参数"]),
                "culturalMeaning": culture,
                "detail": detail,
                "highlights": clean(row["游玩亮点"]),
                "openInfo": clean(row["演艺/开放信息"]),
                "source": "YQSY-HX/AI_Tour_Agent backend/knowledge_base",
            }
        )
    return spots


def parse_behavior():
    text = load_text("游客行为")
    related_records = 0
    match = re.search(r"灵山相关记录数：(\d+)", text)
    if match:
        related_records = int(match.group(1))

    section_pattern = re.compile(
        r"^## (?P<title>.+?)\n\n景点类型：(?P<type>.+?)\n平均停留：(?P<stay>\d+) 分钟\n平均消费：(?P<spend>\d+) 元\n平均满意度：(?P<satisfaction>[\d.]+) / 5\n\n(?P<body>.*?)(?=\n## |\Z)",
        re.M | re.S,
    )
    metrics = []
    docs = []
    for match in section_pattern.finditer(text):
        title = clean(match.group("title"))
        body = clean(match.group("body"))
        metric = {
            "name": title,
            "type": clean(match.group("type")),
            "avgStayMinutes": int(match.group("stay")),
            "avgSpendYuan": int(match.group("spend")),
            "avgSatisfaction": float(match.group("satisfaction")),
        }
        metrics.append(metric)
        docs.append(
            {
                "id": f"behavior-{len(docs) + 1}",
                "title": f"{title}游客行为洞察",
                "area": "灵山胜境" if "拈花湾" not in title else "拈花湾",
                "category": "游客行为数据",
                "content": clip(
                    f"{title}平均停留{metric['avgStayMinutes']}分钟，平均消费{metric['avgSpendYuan']}元，平均满意度{metric['avgSatisfaction']}/5。{body}",
                    900,
                ),
                "keywords": keywords_from(title, metric["type"], "停留 消费 满意度 客流 推荐"),
                "source": "YQSY-HX/AI_Tour_Agent backend/knowledge_base",
            }
        )

    top_visits = []
    for name, count in re.findall(r"- ([^：\n]+)：(\d+) 次", text):
        top_visits.append({"name": clean(name), "visits": int(count)})

    return related_records, metrics, top_visits[:15], docs


def guide_docs():
    text = load_text("游览指南")
    lines = [line.strip() for line in text.splitlines()]
    docs = []
    current_title = ""
    current_lines = []

    def flush():
        nonlocal current_title, current_lines
        content = clean(" ".join(current_lines))
        if current_title and content:
            docs.append(
                {
                    "id": f"guide-{len(docs) + 1}",
                    "title": current_title,
                    "area": "灵山胜境",
                    "category": "游览指南",
                    "content": clip(content, 1000),
                    "keywords": keywords_from(current_title, content),
                    "source": "YQSY-HX/AI_Tour_Agent backend/knowledge_base",
                }
            )
        current_title = ""
        current_lines = []

    for line in lines:
        if not line or line.startswith("|"):
            continue
        normalized = line.lstrip("#").strip()
        is_heading = len(normalized) <= 32 and not normalized.startswith(("-", "1.", "2.", "3.", "4.", "5."))
        if is_heading:
            flush()
            current_title = normalized
        else:
            current_lines.append(normalized)
    flush()
    return docs


def build_routes():
    return [
        {
            "id": "history-6h",
            "title": "历史文化深度线",
            "theme": "history",
            "duration": "6小时",
            "interestTags": ["历史", "佛教文化", "建筑艺术", "首次游览"],
            "spots": [
                "lingshan-wall",
                "wuming-bridge",
                "buddha-footprint",
                "five-wisdom-gate",
                "bodhi-avenue",
                "nine-dragon",
                "ashoka-pillar",
                "xiangfu-temple",
                "lingshan-buddha",
                "brahma-palace",
                "five-mudra",
            ],
            "description": "覆盖灵山中轴、寺院、佛教艺术与三大语系建筑，适合想系统理解灵山文化的游客。",
        },
        {
            "id": "nature-5h",
            "title": "自然休闲全景线",
            "theme": "nature",
            "duration": "5小时",
            "interestTags": ["自然", "轻松", "拍照", "慢游"],
            "spots": [
                "lingshan-wall",
                "wuming-bridge",
                "bodhi-avenue",
                "hundred-children",
                "manfeilong-pagoda",
                "brahma-palace",
                "wujinyi-zhai",
                "fantian-flower-sea",
            ],
            "description": "节奏更舒缓，兼顾入口湖景、菩提步道、艺术建筑与拈花湾花海，适合不想赶路的游客。",
        },
        {
            "id": "family-4h",
            "title": "亲子家庭轻松线",
            "theme": "family",
            "duration": "4小时",
            "interestTags": ["亲子", "互动", "轻体力", "拍照"],
            "spots": [
                "lingshan-wall",
                "wuming-bridge",
                "nine-dragon",
                "hundred-children",
                "lingshan-buddha",
                "buddhist-museum",
                "nianhua-square",
            ],
            "description": "保留孩子更容易理解的动态景观、亲子雕塑和室内展陈，路线短、讲解点清晰。",
        },
        {
            "id": "nianhua-night-3h",
            "title": "拈花湾禅意夜游线",
            "theme": "leisure",
            "duration": "3小时",
            "interestTags": ["拈花湾", "夜游", "休闲", "灯光秀"],
            "spots": [
                "nianhua-square",
                "xiangyue-flower-street",
                "nianhua-hall",
                "wudeng-lake",
                "luming-valley",
            ],
            "description": "聚焦拈花湾禅意小镇、香月花街与五灯湖夜间演艺，适合作为灵山日游后的延展体验。",
        },
    ]


def build_knowledge(spots, behavior_docs, guide_items):
    docs = []
    for spot in spots:
        content = clip(
            " ".join(
                part
                for part in [
                    f"{spot['name']}位于{spot['position']}。",
                    spot["parameters"],
                    spot["summary"],
                    spot["tips"],
                    spot.get("detail"),
                ]
                if clean(part)
            ),
            1100,
        )
        docs.append(
            {
                "id": f"spot-{spot['id']}",
                "title": spot["name"],
                "area": spot["area"],
                "category": spot["category"],
                "content": content,
                "keywords": spot["keywords"],
                "source": spot["source"],
            }
        )
    return docs + behavior_docs + guide_items


def build_analytics(related_records, metrics, top_visits):
    return {
        "serviceTrend": [136, 188, 246, 308, 284, 352, 421],
        "hotQuestions": [
            "灵山大佛怎么走",
            "九龙灌浴几点开始",
            "亲子路线怎么安排",
            "梵宫需要多久",
            "拈花湾夜游怎么玩",
            "五印坛城有什么看点",
        ],
        "consumeCategories": {"门票": 42, "餐饮": 18, "文创购物": 16, "交通接驳": 9, "演艺体验": 15},
        "satisfaction": {"满意": 74, "一般": 20, "不满意": 6},
        "avgSpendTrend": [210, 238, 256, 281, 304, 318, 342],
        "sourceRecords": related_records,
        "spotMetrics": metrics,
        "topVisitorAttractions": top_visits,
        "insights": [
            "知识库已补充灵山胜境与拈花湾 22 个结构化景点，可支持更细粒度讲解。",
            "游客行为数据包含停留、消费、满意度，可用于路线推荐和运营看板说明。",
            "拈花湾夜游、梵宫室内游、亲子轻体力游可以作为现场高频推荐场景。",
        ],
        "source": "YQSY-HX/AI_Tour_Agent backend/knowledge_base",
    }


def main():
    if not SOURCE.exists():
        raise SystemExit(f"Source directory not found: {SOURCE}")
    spots = parse_spots()
    related_records, metrics, top_visits, behavior_docs = parse_behavior()
    guides = guide_docs()

    write_json("scenic_spots.json", spots)
    write_json("routes.json", build_routes())
    write_json("knowledge_store.json", build_knowledge(spots, behavior_docs, guides))
    write_json("analytics.json", build_analytics(related_records, metrics, top_visits))
    print(f"Imported {len(spots)} spots, {len(guides) + len(behavior_docs) + len(spots)} knowledge docs.")


if __name__ == "__main__":
    main()
