package guide;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.*;
import java.io.*;
import java.nio.charset.*;
import java.time.Instant;
import java.util.*;
import java.util.function.Function;
import java.util.stream.StreamSupport;
import java.util.zip.*;
import javax.xml.parsers.DocumentBuilderFactory;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
class GuideController {
    private final GuideStore store;
    private final GuideAgent agent;

    GuideController(GuideStore store, GuideAgent agent) {
        this.store = store;
        this.agent = agent;
    }

    @GetMapping("/health")
    Map<String, Object> health() { return Map.of("ok", true, "service", "java-guide-agent", "time", now()); }

    @GetMapping("/spots")
    JsonNode spots() throws IOException { return store.read("scenic_spots"); }

    @GetMapping("/routes")
    List<JsonNode> routes() throws IOException { return agent.routes("", 0); }

    @GetMapping("/routes/recommend")
    List<JsonNode> routes(@RequestParam(defaultValue = "") String interest) throws IOException {
        return agent.routes(interest, 0).stream().limit(3).toList();
    }

    @PostMapping("/routes/recommend")
    List<JsonNode> routes(@RequestBody JsonNode body) throws IOException {
        return agent.routes(body.path("interest").asText(), body.path("hours").asInt()).stream().limit(3).toList();
    }

    @GetMapping("/knowledge")
    JsonNode knowledge() throws IOException { return store.read("knowledge_store"); }

    @PostMapping("/knowledge")
    @ResponseStatus(HttpStatus.CREATED)
    JsonNode create(@RequestBody ObjectNode body) throws IOException {
        return store.change("knowledge_store", data -> {
            var item = item(body.path("title").asText("未命名知识点"), body.path("content").asText(),
                body.path("area").asText("灵山胜境"), body.path("category").asText("自定义"));
            if (body.path("keywords").isArray()) item.set("keywords", body.path("keywords"));
            ((ArrayNode) data).add(item);
            return item;
        });
    }

    @PutMapping("/knowledge/{id}")
    JsonNode update(@PathVariable String id, @RequestBody ObjectNode body) throws IOException {
        return store.change("knowledge_store", data -> {
            for (JsonNode item : data) {
                if (!item.path("id").asText().equals(id)) continue;
                for (String field : List.of("title", "content", "area", "category", "keywords")) {
                    if (body.has(field)) ((ObjectNode) item).set(field, body.get(field));
                }
                return item;
            }
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "not_found");
        });
    }

    @DeleteMapping("/knowledge/{id}")
    JsonNode delete(@PathVariable String id) throws IOException {
        return store.change("knowledge_store", data -> {
            ArrayNode items = (ArrayNode) data;
            int deleted = 0;
            for (int i = items.size() - 1; i >= 0; i--) {
                if (items.get(i).path("id").asText().equals(id)) { items.remove(i); deleted++; }
            }
            return GuideAgent.JSON.createObjectNode().put("deleted", deleted);
        });
    }

    @PostMapping("/knowledge/bulk")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, Object> bulk(@RequestBody JsonNode body) throws IOException {
        return ingest(body.path("text").asText(), "", body.path("area").asText("灵山胜境"),
            body.path("category").asText("批量导入"));
    }

    @PostMapping(value = "/knowledge/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, Object> upload(@RequestParam MultipartFile file,
            @RequestParam(defaultValue = "灵山胜境") String area,
            @RequestParam(defaultValue = "文件上传") String category) throws IOException {
        String name = Optional.ofNullable(file.getOriginalFilename()).orElse("upload.txt").replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1);
        String lower = name.toLowerCase(Locale.ROOT);
        byte[] bytes = file.getBytes();
        String content;
        if (lower.endsWith(".docx")) content = docx(bytes);
        else if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".json")) {
            try { content = StandardCharsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(bytes)).toString(); }
            catch (CharacterCodingException e) { content = new String(bytes, Charset.forName("GB18030")); }
            content = content.replaceFirst("^\uFEFF", "");
        } else throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "empty_or_unsupported");
        if (content.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "empty_or_unsupported");
        return ingest(content, name, area, category);
    }

    private Map<String, Object> ingest(String text, String name, String area, String category) throws IOException {
        ArrayNode entries = GuideAgent.JSON.createArrayNode();
        if (name.toLowerCase(Locale.ROOT).endsWith(".json")) {
            JsonNode parsed;
            try { parsed = GuideAgent.JSON.readTree(text); }
            catch (IOException e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid JSON"); }
            if (parsed == null || (!parsed.isArray() && !parsed.isObject()))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "expected a JSON object or array");
            Iterable<JsonNode> rows = parsed.isArray() ? parsed : List.of(parsed);
            for (JsonNode row : rows) {
                if (!row.isObject()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "expected a knowledge object");
                entries.add(item(row.path("title").asText(name), row.path("content").asText(row.toString()), area, category));
            }
        } else {
            for (String line : text.lines().map(String::strip).filter(s -> !s.isBlank()).toList()) {
                String[] parts = line.split("[：:]", 2);
                String title = parts[0].substring(0, Math.min(32, parts[0].length()));
                entries.add(item(title, parts.length == 2 ? parts[1].strip() : line, area, category));
            }
        }
        if (entries.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "no knowledge entries");
        store.change("knowledge_store", data -> ((ArrayNode) data).addAll(entries));
        return Map.of("created", entries.size(), "filename", name, "items",
            StreamSupport.stream(entries.spliterator(), false).limit(12).toList());
    }

    private static ObjectNode item(String title, String content, String area, String category) {
        var item = GuideAgent.JSON.createObjectNode().put("id", UUID.randomUUID().toString())
            .put("title", title).put("content", content).put("area", area).put("category", category);
        item.putArray("keywords");
        return item;
    }

    private static String docx(byte[] bytes) {
        try (var zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            for (ZipEntry entry; (entry = zip.getNextEntry()) != null;) {
                if (!entry.getName().equals("word/document.xml")) continue;
                byte[] xml = zip.readNBytes(2_000_001);
                if (xml.length > 2_000_000) break;
                var factory = DocumentBuilderFactory.newInstance();
                factory.setNamespaceAware(true);
                factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
                var document = factory.newDocumentBuilder().parse(new ByteArrayInputStream(xml));
                String ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
                var paragraphs = document.getElementsByTagNameNS(ns, "p");
                StringJoiner result = new StringJoiner("\n");
                for (int i = 0; i < paragraphs.getLength(); i++) {
                    var parts = ((org.w3c.dom.Element) paragraphs.item(i)).getElementsByTagNameNS(ns, "t");
                    StringBuilder paragraph = new StringBuilder();
                    for (int j = 0; j < parts.getLength(); j++) paragraph.append(parts.item(j).getTextContent());
                    if (!paragraph.toString().isBlank()) result.add(paragraph.toString());
                }
                return result.toString();
            }
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid DOCX");
        }
        return "";
    }

    @GetMapping("/avatar-profiles")
    JsonNode profiles() throws IOException { return store.read("avatar_profiles"); }

    @GetMapping("/admin/avatar-config")
    JsonNode avatar() throws IOException { return avatarPayload((ObjectNode) store.read("avatar_config"), profiles()); }

    @PostMapping("/admin/avatar-config")
    JsonNode avatar(@RequestBody JsonNode body) throws IOException {
        JsonNode profiles = profiles();
        JsonNode profile = profile(profiles, body.path("profileId").asText());
        return store.change("avatar_config", data -> {
            ObjectNode config = (ObjectNode) data;
            config.put("profileId", profile.path("id").asText()).put("updatedAt", now());
            for (String field : List.of("avatar", "voice", "style")) {
                config.put(field, body.path(field).asText().isBlank() ? profile.path(field).asText() : body.path(field).asText());
            }
            return avatarPayload(config, profiles);
        });
    }

    private static ObjectNode avatarPayload(ObjectNode config, JsonNode profiles) {
        ObjectNode result = config.deepCopy();
        result.set("profile", profile(profiles, config.path("profileId").asText()));
        result.set("profiles", profiles);
        return result;
    }

    private static JsonNode profile(JsonNode profiles, String id) {
        for (JsonNode item : profiles) if (item.path("id").asText().equals(id)) return item;
        return profiles.get(0);
    }

    @PostMapping("/chat")
    ObjectNode chat(@RequestBody JsonNode body) throws IOException {
        String question = body.path("message").asText().strip();
        String session = body.path("sessionId").asText("default");
        if (question.isEmpty() || question.length() > 2000 || session.length() > 128)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid message or session");
        long started = System.nanoTime();
        ObjectNode result = agent.answer(question, session);
        int elapsed = (int) ((System.nanoTime() - started) / 1_000_000);
        result.put("latencyMs", elapsed);
        result.put("confidence", Math.min(0.96, 0.68 + result.path("sources").size() * 0.07));
        String[] mood = question.matches("(?s).*(急|赶时间|马上|不耐烦).*") ? new String[]{"着急", "urgent", "focused"}
            : question.matches("(?s).*(开心|好玩|漂亮|喜欢|期待).*") ? new String[]{"开心", "happy", "smile"}
            : question.matches("(?s).*(为什么|历史|文化|讲讲|介绍).*") ? new String[]{"好奇", "curious", "thinking"}
            : new String[]{"平静", "neutral", "normal"};
        result.set("emotion", GuideAgent.JSON.valueToTree(Map.of("name", mood[0], "label", mood[1], "avatarState", mood[2])));
        result.putArray("followups").add("推荐一条相关路线").add("讲得更详细一点");
        ObjectNode log = result.deepCopy();
        log.put("id", result.path("interactionId").asText()).put("query", question)
            .put("sessionId", session).put("time", now()).put("emotionName", mood[0]).put("emotion", mood[1]);
        log.putNull("feedback");
        store.change("interaction_logs", data -> {
            ArrayNode logs = (ArrayNode) data;
            logs.add(log);
            while (logs.size() > 600) logs.remove(0);
            return log;
        });
        return result;
    }

    @PostMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody stream(@RequestBody JsonNode body) throws IOException {
        ObjectNode result = chat(body);
        return out -> {
            int[] text = result.path("answer").asText().codePoints().toArray();
            for (int start = 0; start < text.length; start += 24) {
                event(out, "chunk", Map.of("text", new String(text, start, Math.min(24, text.length - start))));
            }
            event(out, "done", result);
        };
    }

    private static void event(OutputStream out, String name, Object value) throws IOException {
        out.write(("event: " + name + "\ndata: " + GuideAgent.JSON.writeValueAsString(value) + "\n\n")
            .getBytes(StandardCharsets.UTF_8));
        out.flush();
    }

    @PostMapping("/feedback")
    Map<String, Object> feedback(@RequestBody JsonNode body) throws IOException {
        String rating = body.path("rating").asText();
        if (!List.of("good", "neutral", "bad").contains(rating))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid rating");
        JsonNode item = store.change("interaction_logs", logs -> {
            for (JsonNode log : logs) {
                if (log.path("id").asText().equals(body.path("interactionId").asText())) {
                    String comment = body.path("comment").asText();
                    return ((ObjectNode) log).put("feedback", rating).put("feedbackAt", now())
                        .put("feedbackComment", comment.substring(0, Math.min(160, comment.length())));
                }
            }
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "interaction_not_found");
        });
        return Map.of("ok", true, "item", item);
    }

    @GetMapping("/admin/analytics")
    JsonNode analytics() throws IOException { return store.read("analytics"); }

    @GetMapping("/admin/live")
    Map<String, Object> live() throws IOException {
        var logs = logs();
        var recent = logs.stream().filter(log -> log.path("time").asLong() >= now() - 180).toList();
        long rated = recent.stream().filter(log -> log.path("feedback").isTextual()).count();
        long good = recent.stream().filter(log -> log.path("feedback").asText().equals("good")).count();
        return Map.of("onlineVisitors", recent.stream().map(log -> log.path("sessionId").asText()).distinct().count(),
            "activeQuestions", recent.size(), "avgLatencyMs", Math.round(recent.stream().mapToInt(log -> log.path("latencyMs").asInt()).average().orElse(0)),
            "satisfactionNow", rated == 0 ? 0 : Math.round(100.0 * good / rated),
            "serviceTrend", analytics().path("serviceTrend"), "hotQuestions", rank(logs.stream().map(l -> l.path("query").asText()).toList(), 5));
    }

    @GetMapping("/admin/feedback-analysis")
    Map<String, Object> analysis() throws IOException {
        var logs = logs();
        Map<String, Integer> counts = new LinkedHashMap<>(Map.of("满意", 0, "一般", 0, "不满意", 0));
        Map<String, String> labels = Map.of("good", "满意", "neutral", "一般", "bad", "不满意");
        for (JsonNode log : logs) {
            String label = labels.get(log.path("feedback").asText());
            if (label != null) counts.merge(label, 1, Integer::sum);
        }
        var questions = logs.stream().map(l -> l.path("query").asText()).toList();
        var latest = new ArrayList<>(logs.subList(Math.max(0, logs.size() - 12), logs.size()));
        Collections.reverse(latest);
        var keywords = questions.stream().flatMap(question -> java.util.Arrays.stream(question.split("[\\s\\p{P}]+")))
            .filter(word -> word.length() >= 2).toList();
        return Map.of("totalInteractions", logs.size(), "ratedInteractions", counts.values().stream().mapToInt(Integer::intValue).sum(),
            "ratingCounts", counts, "hotQuestions", rank(questions, 8), "hotKeywords", rank(keywords, 10),
            "hotSources", rank(titles(logs, "sources"), 8), "routeInterest", rank(titles(logs, "routeRecommendations"), 6),
            "emotionTrend", rank(logs.stream().map(l -> l.path("emotionName").asText()).toList(), 6), "latest", latest,
            "suggestions", counts.get("不满意") > 0 ? List.of("复查不满意回答的知识库命中结果。") : List.of());
    }

    private List<JsonNode> logs() throws IOException {
        return StreamSupport.stream(store.read("interaction_logs").spliterator(), false).toList();
    }

    private static List<String> titles(List<JsonNode> logs, String field) {
        return logs.stream().flatMap(log -> StreamSupport.stream(log.path(field).spliterator(), false))
            .map(item -> item.path("title").asText()).toList();
    }

    private static List<Map<String, Object>> rank(List<String> values, int limit) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        values.stream().filter(value -> !value.isBlank()).forEach(value -> counts.merge(value, 1, Integer::sum));
        return counts.entrySet().stream().sorted(Map.Entry.<String, Integer>comparingByValue().reversed()).limit(limit)
            .map(e -> Map.<String, Object>of("name", e.getKey(), "value", e.getValue())).toList();
    }

    @GetMapping("/evaluation")
    Map<String, Object> evaluation() { return Map.of("passedItems", List.of(), "note", "实际评估结果由运行验证产生"); }

    @GetMapping("/integrations")
    Map<String, Object> integrations() {
        boolean enabled = !System.getenv().getOrDefault("AGENT_API_KEY", "").isBlank();
        return Map.of("llm", Map.of("enabled", enabled, "keyLoaded", enabled, "provider", "openai-compatible",
            "model", System.getenv().getOrDefault("AGENT_MODEL", "deepseek-chat"),
            "baseUrl", System.getenv().getOrDefault("AGENT_BASE_URL", "https://api.deepseek.com")),
            "asr", Map.of("mode", "browser-web-speech", "externalService", false),
            "tts", Map.of("mode", "browser-speech-synthesis", "externalService", false));
    }

    private static long now() { return Instant.now().getEpochSecond(); }
}

