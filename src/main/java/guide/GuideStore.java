package guide;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.*;
import java.util.function.Function;
import org.apache.ibatis.annotations.*;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Mapper
interface GuideMapper {
    @Select("SELECT payload FROM guide_data WHERE name = #{name}")
    String read(String name);

    @Select("SELECT payload FROM guide_data WHERE name = #{name} FOR UPDATE")
    String lock(String name);

    @Insert("INSERT IGNORE INTO guide_data(name, payload) VALUES(#{name}, #{payload})")
    void seed(@Param("name") String name, @Param("payload") String payload);

    @Update("UPDATE guide_data SET payload = #{payload} WHERE name = #{name}")
    void save(@Param("name") String name, @Param("payload") String payload);
}

@Service
class GuideStore implements ApplicationRunner {
    private final GuideMapper mapper;

    GuideStore(GuideMapper mapper) { this.mapper = mapper; }

    @Override
    @Transactional
    public void run(ApplicationArguments args) throws IOException {
        var resources = new PathMatchingResourcePatternResolver().getResources("classpath*:data/*.json");
        for (var resource : resources) {
            try (var input = resource.getInputStream()) {
                String name = resource.getFilename().replaceFirst("\\.json$", "");
                mapper.seed(name, GuideAgent.JSON.readTree(input).toString());
            }
        }
        mapper.seed("interaction_logs", "[]");
    }

    JsonNode read(String name) throws IOException {
        return GuideAgent.JSON.readTree(mapper.read(name));
    }

    @Transactional
    public JsonNode change(String name, Function<JsonNode, JsonNode> update) throws IOException {
        JsonNode value = GuideAgent.JSON.readTree(mapper.lock(name));
        JsonNode result = update.apply(value);
        mapper.save(name, value.toString());
        return result;
    }
}

