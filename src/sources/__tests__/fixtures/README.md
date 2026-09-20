# twitter-cli 输出 fixture

这些文件是 **twitter-cli 0.8.5 真实输出格式**，由官方序列化代码生成，非手写：

```python
from twitter_cli.serialization import tweets_to_data
from twitter_cli.output import success_payload, error_payload
yaml.safe_dump(success_payload(tweets_to_data(tweets)), allow_unicode=True, sort_keys=False)
```

来源依据（twitter-cli 0.8.5 包内）：

- `output.py` —— 包装结构 `{ ok, schema_version, data|error }`
- `serialization.py::tweet_to_dict` —— 字段名 `author.screenName` / `metrics.likes` 等

**为什么要有这些 fixture**：旧单测用的是「扁平字段」格式（顶层 `id/text/name/screenName/likes`），
那是 CLI 早已不再输出的形式。测试与真实输出脱节，所以一个对齐错误格式的解析器
能长期保持「测试全绿」。用真实格式做 fixture，测试才真正守住契约。

- `twitter-cli-0.8.5-success.yaml` —— 成功：`ok: true` + `data: [...]`
- `twitter-cli-0.8.5-failure.yaml` —— 失败：`ok: false` + `error: {...}`（旧解析器会静默解析成 0 条）
