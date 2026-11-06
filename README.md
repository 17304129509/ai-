# 灵山数字人导览系统 Ollama 版

Java 17、Spring Boot、MyBatis、MySQL、Redis、Ollama、Qwen3、RAG 和工具调用。Java 通过 Ollama 的 OpenAI 兼容接口调用本机模型，并在本地执行景区知识检索和路线推荐。

## 本机启动

启动 Ollama，拉取模型 ollama pull qwen3:4b。然后准备 MySQL 数据库 guide，给专用用户 guide 授权，并启动 Redis 或 Memurai。用环境变量 DB_URL、DB_USER、DB_PASSWORD、REDIS_HOST、REDIS_PORT 指定连接。默认连接本机 MySQL 3306 和 Redis 6379。

在项目目录运行：

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-local.ps1

## Docker Compose

也可用 start.bat 启动应用、MySQL 和 Redis。此模式要求 Docker Desktop 以及容器能访问宿主机的 Ollama 11435 端口。Compose 默认使用 host.docker.internal。若默认绑定仅允许本机访问而容器连接失败，可先使用本机启动方式。

## 验收

游客端 http://127.0.0.1:8000/visitor ，管理端 http://127.0.0.1:8000/admin 。管理端沿用本地演示登录 admin / 123456。

用 /api/chat 分别验证景点问答和亲子路线。engine 为 java-tool-agent 表示调用了模型，toolTrace 出现 search_knowledge 或 recommend_routes 表示实际执行了工具。模型出错时会走本地回退。tools/verify.ps1 检查形象配置、知识上传、问答、Redis 会话、路线和反馈。

qwen3:4b 为默认模型。如果显存紧张，可拉取 qwen3:1.7b，再给本机启动脚本传 -Model qwen3:1.7b。Compose 模式可通过 .env 设置 AGENT_MODEL。AGENT_TIMEOUT_SECONDS 默认 90 秒。

## 这台电脑上的演示启动

本机已有 MySQL 和 Memurai 程序时，双击 start-demo.bat。脚本使用项目内独立的 .local-runtime 数据目录和端口 13306、16379，原有数据库实例无需改动。该演示实例的 MySQL 使用仅限本机的无密码 root，适用于当前个人电脑上的演示。停止时会关闭脚本启动的数据库进程。

如果 Windows 上的 Memurai 无法加载，可运行 start-demo.bat -WithoutRedis 临时验证 MySQL 和本地模型。此模式没有 Redis 多轮会话，不适合运行包含 Redis 断言的完整验收脚本。桌面 Ollama 快捷方式启动 11435，使用 D:\Ollama\models。
