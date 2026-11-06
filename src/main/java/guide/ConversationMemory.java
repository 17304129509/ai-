package guide;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.time.Duration;
import java.util.*;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

@Service
class ConversationMemory {
    private static final DefaultRedisScript<Long> APPEND = new DefaultRedisScript<>("""
        redis.call('RPUSH', KEYS[1], ARGV[1], ARGV[2])
        redis.call('LTRIM', KEYS[1], -12, -1)
        redis.call('EXPIRE', KEYS[1], 3600)
        return 1
        """, Long.class);
    private final StringRedisTemplate redis;

    ConversationMemory(StringRedisTemplate redis) { this.redis = redis; }

    List<JsonNode> read(String session) throws IOException {
        try {
            var values = redis.opsForList().range(key(session), 0, -1);
            List<JsonNode> result = new ArrayList<>();
            if (values != null) for (String value : values) result.add(GuideAgent.JSON.readTree(value));
            return result;
        } catch (DataAccessException e) {
            return List.of();
        }
    }

    void append(String session, JsonNode question, JsonNode answer) {
        try {
            redis.execute(APPEND, List.of(key(session)), question.toString(), answer.toString());
        } catch (DataAccessException e) {
            System.err.println("Redis unavailable. Conversation context was not saved.");
        }
    }

    private String key(String session) {
        return "guide:conversation:" + session;
    }
}

