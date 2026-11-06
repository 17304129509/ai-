package guide;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.web.servlet.config.annotation.*;

@SpringBootApplication
public class Application implements WebMvcConfigurer {
    public static void main(String[] args) { SpringApplication.run(Application.class, args); }

    @Bean
    GuideAgent guideAgent(GuideStore store, ConversationMemory memory) { return new GuideAgent(store, memory); }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/frontend/**").addResourceLocations("classpath:/frontend/");
        registry.addResourceHandler("/admin/**").addResourceLocations("classpath:/admin/");
    }

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addViewController("/").setViewName("forward:/frontend/index.html");
        registry.addViewController("/visitor").setViewName("forward:/frontend/index.html");
        registry.addViewController("/admin").setViewName("forward:/admin/index.html");
    }
}

