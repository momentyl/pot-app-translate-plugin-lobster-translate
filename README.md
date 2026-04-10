# 大龙虾翻译 for Pot-App

<p align="center">
  <img src="./lobster-translate.svg" alt="大龙虾翻译 Logo" width="160" />
</p>

> 不换插件，不换工作流，直接把你手上的 AI 平台接进 Pot-App。

> 这个插件需要搭配 [Pot Desktop](https://github.com/pot-app/pot-desktop/) 使用，本身不是独立应用。

如果你已经有 `API Key`，却还在不同平台、不同模型、不同接口格式之间来回折腾，这个插件就是为这个问题准备的。

你不用再等别人适配某一家服务，也不用被单一翻译源绑住。  
你只需要填好 `baseUrl`、`apiKey`、`model`，就能把自己常用的 AI 平台直接接进 Pot-App。

如果你现在还没有可接入的 API，可以优先试试 [硅基流动 SiliconFlow](https://cloud.siliconflow.cn/i/BLUtUXTw)。注册并完成认证后会有 16 元额度，日常翻译场景通常可以用很久。

## 下载

[点击直接下载最新版](https://github.com/claw-codes/pot-app-translate-plugin-lobster-translate/releases/latest/download/plugin.com.pot-app.lobster-translate.potext)

如果下载失败，可以前往 [Latest Release](https://github.com/claw-codes/pot-app-translate-plugin-lobster-translate/releases/latest) 手动下载 `.potext` 插件文件。

第一次安装可以先看下面的安装演示：

[Bilibili 安装教程](https://www.bilibili.com/video/BV1MuQwB2EJZ/)

## 为什么有人会用它

很多人点开这个项目，不是因为“它支持某个协议”，而是因为他们正好遇到了这些问题：

- 我已经有 AI 平台账号了，不想再被某个翻译插件绑定
- 我想自己选模型，不想只能用作者预设的那个
- 我想把 AI 翻译接进 Pot-App，但不想每换一家平台就换一个插件
- 我想要更自然的翻译，而不是明显的机翻味
- 我想长文本翻译时快一点出结果，而不是一直等整段完成

如果你也是这样，这个插件基本就是对症的。

## 它实际解决了什么

| 你的问题 | 这个插件的做法 |
| --- | --- |
| 平台总在换 | 一个插件接多家平台 |
| 模型想自己选 | `model` 由你自己填 |
| 接口格式不统一 | 同时兼容 `completions`、`responses`、`anthropic` |
| URL 不知道怎么填 | 自动补常见后缀，减少出错 |
| 短句想快一点 | 简单文本优先走更轻的提示词 |
| 长文本翻中文不够自然 | 中文长文本自动切到更强的润色模式 |
| 想边出边看 | 支持流式输出 |
| 默认风格不喜欢 | 支持自定义系统提示词 |

## 效果展示

<p align="center">
  <img src="./docs/images/test.png" alt="大龙虾翻译效果图 1" width="46%" />
  <img src="./docs/images/test2.png" alt="大龙虾翻译效果图 2" width="46%" />
</p>

如果你想看更完整的对比过程、样本说明和评分结论，可以直接看：

- [翻译质量评测报告](./docs/translation-benchmark.md)

## 3 分钟上手

安装 `.potext` 后，通常只填这 4 项就够了：

| 配置项 | 你可以怎么理解 |
| --- | --- |
| `apiFormat` | 你接入的平台用哪种接口格式 |
| `baseUrl` | 平台地址 |
| `apiKey` | 你的密钥 |
| `model` | 你想用的模型 |

### 例子：SiliconFlow

如果你不知道从哪家平台开始，推荐先用 [硅基流动 SiliconFlow](https://cloud.siliconflow.cn/i/BLUtUXTw)。拿到 API Key 后，在插件配置里这样填：

```text
apiFormat = completions
baseUrl   = https://api.siliconflow.cn/v1
apiKey    = 你的 SiliconFlow API Key
model     = deepseek-ai/DeepSeek-V3.2
```

### 例子：PackyAPI

```text
apiFormat = completions
baseUrl   = https://www.packyapi.com/v1
model     = glm-5
```

## 不想研究 URL 细节？

可以直接填你最顺手的写法。插件会自动处理常见情况。

比如下面这些，通常都可以：

```text
https://api.openai.com
https://api.openai.com/v1
https://api.openai.com/v1/chat/completions
```

## 它不是一刀切地翻

这个插件默认会根据场景调整策略，而不是所有内容都用同一套重提示词：

- 单词、短句：优先更轻、更快
- 长文本翻中文：自动更注重自然度、顺滑度和去翻译腔
- 你有自己的要求：直接写 `自定义系统提示词（可选）`

这意味着它既适合你查一个词，也适合你翻整段说明文。

## 流式输出什么时候值得开

如果你更关心“先看到结果”，可以开启 `流式输出（实验性）`。

更适合这些情况：

- 长段落翻译
- 网页内容、文档、说明文
- 想边生成边看，而不是等整个结果一次性返回

如果平台不支持流式，插件会自动回退到普通请求。

## 出错时别先怀疑自己

很多平台报错并不是“你不会配”，而是不同平台的报错方式本来就不统一。  
这个插件会尽量帮你把问题归类清楚：

| 提示 | 你优先检查什么 |
| --- | --- |
| `API authentication failed` | `apiKey` 是否正确、是否有权限 |
| `Model validation failed` | 模型名是否写对、账号是否能用该模型 |
| `Endpoint validation failed` | `baseUrl` 或 endpoint 是否填错 |
| `API format validation failed` | 平台是否真的支持你选的接口格式 |
| `Platform access blocked before API validation` | 平台风控、WAF、网络环境或客户端指纹问题 |

## 当前支持

- `completions`
- `responses`
- `anthropic`

## 后续可能升级的方向

如果这个插件确实对更多人有用，后面优先考虑补这些能力：

- 平台模板预设  
  让用户少填参数，像 `SiliconFlow`、`PackyAPI`、`OpenAI-compatible` 这类场景可以更快完成配置
- 配置验证 / 测试模式  
  在用户保存配置后，更直接地判断是 `URL`、`apiKey`、`model` 还是 `apiFormat` 出了问题
- 场景化翻译质量增强  
  例如技术文档、UI 文案、字幕、说明文等不同场景使用不同策略
- 自定义术语表 / 固定翻译  
  让品牌名、产品名、专业术语按用户指定方式翻译
- 格式保护更完善  
  对 Markdown、代码块、链接、变量名等内容做更稳的保护
- 更细的错误提示  
  尽量把“填错了什么”说得更明确，而不是只返回一条通用报错

## 本地打包

确保这 3 个文件被打进包里：

- `main.js`
- `info.json`
- `lobster-translate.svg`

最终文件名示例：

```text
plugin.com.pot-app.lobster-translate.potext
```

## 自动发布

仓库已经内置 GitHub Actions：

- `push` 后自动打包并上传 artifact
- 推送 tag 后自动上传到 GitHub Release
