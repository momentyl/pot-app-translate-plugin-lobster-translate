const FAST_SYSTEM_PROMPT_TEMPLATE = `You are a professional translator and localization expert.
Translate the user's text from {{sourceLanguage}} to {{targetLanguage}}.
First understand the original meaning, tone, intent, and possible ambiguity.
Preserve the original meaning faithfully. Do not omit, add, or distort information.
Make the translation natural, fluent, idiomatic, and suitable for the target audience.
Keep terminology consistent and preserve proper nouns when appropriate.
Output only the final translation in {{targetLanguage}}. Do not explain, annotate, add labels, or include the source text unless required.`;

const SYSTEM_PROMPT_TEMPLATE = `# Role
You are a professional translator and localization expert with strong bilingual and cross-lingual writing ability.

# Task
Translate the user's text from {{sourceLanguage}} to {{targetLanguage}}.

# Required Workflow
1. Comprehension
- Fully understand the original text, including meaning, tone, intent, and possible ambiguities.
- Resolve ambiguity from context whenever possible.

2. Faithful Translation
- Preserve the original meaning as accurately as possible.
- Do not omit, add, distort, soften, or exaggerate key information.

3. Naturalization
- Rewrite the translation so it reads naturally, fluently, and idiomatically in the target language.
- Adapt sentence structure, clause order, and phrasing when needed.

4. Localization
- Match tone, style, and wording to the real context, such as technical, casual, formal, product, marketing, or literary writing.
- Make the result feel native to the target audience rather than mechanically translated.

5. Terminology Consistency
- Keep terminology consistent across the translation.
- Preserve proper nouns, product names, code, URLs, numbers, and formatting-sensitive content when appropriate, or use their standard equivalents.

# Quality Rules
- Prefer faithful meaning plus natural wording over literal but awkward phrasing.
- Break overly long sentences when needed for readability.
- Reorder logic when necessary to fit the target language naturally.
- Avoid translationese completely.
- Use precise, context-appropriate wording instead of dictionary-like wording.

# Additional Rule for Chinese Output
- When {{targetLanguage}} is Chinese, make the result read like native Chinese writing.
- Remove obvious source-language syntax traces.
- If a literal rendering sounds stiff in Chinese, preserve the meaning and rewrite it into smoother Chinese.

# Output Rules
- Output only the final translation.
- The output language must be exactly {{targetLanguage}}.
- Do not explain your choices.
- Do not add notes, labels, quotation marks, or commentary.
- Do not include the source text unless the source itself requires it.`;

async function translate(text, from, to, options) {
    const { config, detect, utils } = options;
    const { tauriFetch: fetch } = utils;
    const {
        apiFormat = "completions",
        baseUrl,
        apiKey,
        model,
        streamOutput = "off",
        systemPrompt
    } = config;
    try {
        const format = normalizeApiFormat(apiFormat);

        validateConfig({
            apiFormat: format,
            baseUrl,
            apiKey,
            model
        });

        const sourceLanguage = from === "auto" ? (detect || "auto") : from;
        const promptMode = resolvePromptMode(systemPrompt, text, to);
        const userPrompt = buildUserPrompt(text, sourceLanguage, to);
        const effectiveSystemPrompt = resolveSystemPrompt(systemPrompt, promptMode, sourceLanguage, to);
        const url = buildEndpoint(baseUrl, format);
        const request = buildRequest(format, model.trim(), effectiveSystemPrompt, userPrompt, text);
        const headers = buildHeaders(format, apiKey.trim());
        const shouldStream = streamOutput === "on" && typeof options.setResult === "function";

        if (shouldStream) {
            const streamedResult = await tryStreamTranslate({
                format,
                url,
                headers,
                request,
                setResult: options.setResult
            });
            if (streamedResult) {
                return streamedResult;
            }
        }

        const res = await fetch(url, {
            method: "POST",
            url: url,
            headers: headers,
            body: {
                type: "Json",
                payload: request
            }
        });

        if (!res.ok) {
            throw formatHttpError(format, url, res.status, res.data);
        }

        const result = extractText(format, res.data);
        if (!result) {
            throw `Empty translation result\n${JSON.stringify(res.data)}`;
        }
        return result.trim();
    } catch (error) {
        const userFacingError = formatUserFacingError(error);
        if (typeof options.setResult === "function") {
            options.setResult(userFacingError);
        }
        return userFacingError;
    }
}

function normalizeApiFormat(apiFormat) {
    if (apiFormat === "response") {
        return "responses";
    }
    return apiFormat;
}

function buildUserPrompt(text, from, to) {
    const sourceLanguage = mapLanguageCodeToName(from);
    const targetLanguage = mapLanguageCodeToName(to);
    const sourceLine = sourceLanguage && sourceLanguage !== "Auto Detect" ? `Source language: ${sourceLanguage}\n` : "";
    return `${sourceLine}Target language: ${targetLanguage}\nYou must translate the text into ${targetLanguage} only.\nText:\n${text}`;
}

function resolveSystemPrompt(customPrompt, promptMode, sourceLanguage, targetLanguage) {
    const sourceName = mapLanguageCodeToName(sourceLanguage);
    const targetName = mapLanguageCodeToName(targetLanguage);

    if (customPrompt && customPrompt.trim()) {
        return applyLanguageTemplate(customPrompt.trim(), sourceName, targetName);
    }

    if (promptMode === "detailed") {
        return applyLanguageTemplate(SYSTEM_PROMPT_TEMPLATE, sourceName, targetName);
    }

    return applyLanguageTemplate(FAST_SYSTEM_PROMPT_TEMPLATE, sourceName, targetName);
}

function resolvePromptMode(customPrompt, text, to) {
    if (customPrompt && customPrompt.trim()) {
        return "custom";
    }

    return shouldUseDetailedPrompt(text, to) ? "detailed" : "fast";
}

function shouldUseDetailedPrompt(text, to) {
    const normalizedText = `${text || ""}`.trim();
    if (!normalizedText) {
        return false;
    }

    const length = normalizedText.length;
    const newlineCount = (normalizedText.match(/\n/g) || []).length;
    const sentenceBreakCount = (normalizedText.match(/[.!?;:。！？；：]/g) || []).length;
    const bulletCount = (normalizedText.match(/(^|\n)\s*[-*•]\s+/g) || []).length;
    const clauseSeparatorCount = (normalizedText.match(/[,，]/g) || []).length;
    const quoteOrBracketCount = (normalizedText.match(/["“”'‘’()（）\[\]]/g) || []).length;

    if (length > 220) {
        return true;
    }
    if (length > 120 && (sentenceBreakCount >= 2 || newlineCount >= 1 || bulletCount >= 1)) {
        return true;
    }
    if (bulletCount >= 2) {
        return true;
    }
    if (newlineCount >= 2) {
        return true;
    }
    if (sentenceBreakCount >= 3 && length > 60) {
        return true;
    }
    if (clauseSeparatorCount >= 4 && length > 80) {
        return true;
    }
    if (quoteOrBracketCount >= 4 && length > 80) {
        return true;
    }

    return false;
}

function buildEndpoint(baseUrl, apiFormat) {
    let normalized = baseUrl.trim();
    if (!/^https?:\/\//i.test(normalized)) {
        normalized = `https://${normalized}`;
    }
    normalized = normalized.replace(/\/+$/, "");
    const path = getUrlPath(normalized);

    if (apiFormat === "completions") {
        if (hasPathSuffix(path, ["/chat/completions", "/v1/chat/completions", "/completions", "/v1/completions"])) {
            return normalized;
        }
        if (hasPathSuffix(path, ["/v1"])) {
            return `${normalized}/chat/completions`;
        }
        return `${normalized}/v1/chat/completions`;
    }
    if (apiFormat === "responses") {
        if (hasPathSuffix(path, ["/responses", "/v1/responses"])) {
            return normalized;
        }
        if (hasPathSuffix(path, ["/v1"])) {
            return `${normalized}/responses`;
        }
        return `${normalized}/v1/responses`;
    }
    if (apiFormat === "anthropic") {
        if (hasPathSuffix(path, ["/messages", "/v1/messages"])) {
            return normalized;
        }
        if (hasPathSuffix(path, ["/v1"])) {
            return `${normalized}/messages`;
        }
        return `${normalized}/v1/messages`;
    }
    throw `Unsupported apiFormat: ${apiFormat}`;
}

function getUrlPath(url) {
    const match = url.match(/^https?:\/\/[^/]+(\/.*)?$/i);
    return match && match[1] ? match[1] : "";
}

function hasPathSuffix(path, suffixes) {
    return suffixes.some((suffix) => path === suffix || path.endsWith(`${suffix}`));
}

function formatHttpError(apiFormat, url, status, data) {
    const details = extractErrorDetails(data);
    const message = details.message || JSON.stringify(data);
    const lowerMessage = message.toLowerCase();
    const type = (details.type || "").toLowerCase();
    const code = (details.code || "").toLowerCase();

    if (isEdgeBlocked(status, lowerMessage, code)) {
        return `Platform access blocked before API validation. Check network environment, client fingerprint, or provider firewall/WAF rules.\nRequest URL: ${url}\nHttp Status: ${status}\n${message}`;
    }

    if (status === 401 || isAuthError(status, lowerMessage, type, code)) {
        return `API authentication failed. Check apiKey.\nRequest URL: ${url}\nHttp Status: ${status}\n${message}`;
    }

    if (isModelError(lowerMessage, type, code)) {
        return `Model validation failed. Check model.\nRequest URL: ${url}\nHttp Status: ${status}\n${message}`;
    }

    if (status === 404) {
        return `Endpoint validation failed. Check baseUrl or apiFormat.\nRequest URL: ${url}\nHttp Status: ${status}\n${message}`;
    }

    if (status === 400) {
        if (isApiFormatError(apiFormat, lowerMessage)) {
            return `API format validation failed. Check apiFormat for this provider.\nRequest URL: ${url}\nHttp Status: ${status}\n${message}`;
        }
        return `Request validation failed. Check apiFormat, model, or provider-specific request requirements.\nRequest URL: ${url}\nHttp Status: ${status}\n${message}`;
    }

    return `Http Request Error\nRequest URL: ${url}\nHttp Status: ${status}\n${message}`;
}

function extractErrorDetails(data) {
    if (typeof data === "string") {
        return {
            message: data,
            type: "",
            code: ""
        };
    }

    if (data && data.error) {
        return {
            message: data.error.message || "",
            type: data.error.type || data.type || "",
            code: `${data.error.code || ""}`
        };
    }

    return {
        message: data && data.message ? data.message : "",
        type: data && data.type ? data.type : "",
        code: data && data.code ? `${data.code}` : ""
    };
}

function buildHeaders(apiFormat, apiKey) {
    const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Cache-Control": "no-cache",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
        "Authorization": `Bearer ${apiKey}`
    };

    if (apiFormat === "anthropic") {
        delete headers.Authorization;
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
    }

    return headers;
}

async function tryStreamTranslate({ format, url, headers, request, setResult }) {
    const streamFetch = getStreamFetch();
    if (!streamFetch) {
        return "";
    }

    const streamHeaders = {
        ...headers,
        "Accept": "text/event-stream"
    };
    const streamRequest = {
        ...request,
        stream: true
    };

    let response;
    try {
        response = await streamFetch(url, {
            method: "POST",
            headers: streamHeaders,
            body: JSON.stringify(streamRequest)
        });
    } catch (_) {
        return "";
    }

    if (!response || !response.body || typeof response.body.getReader !== "function") {
        return "";
    }

    if (!response.ok) {
        const errorData = await readStreamError(response);
        throw formatHttpError(format, url, response.status, errorData);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            buffer += decoder.decode();
            break;
        }

        buffer += decoder.decode(value, { stream: true });
        const parsed = consumeSseBuffer(buffer, format);
        buffer = parsed.buffer;

        for (const delta of parsed.deltas) {
            result += delta;
            setResult(result);
        }
    }

    if (buffer.trim()) {
        const parsed = consumeSseBuffer(`${buffer}\n\n`, format);
        for (const delta of parsed.deltas) {
            result += delta;
            setResult(result);
        }
    }

    return sanitizeOutput(result);
}

function getStreamFetch() {
    if (typeof globalThis.fetch === "function") {
        return globalThis.fetch.bind(globalThis);
    }
    return null;
}

async function readStreamError(response) {
    try {
        const text = await response.text();
        return parseJsonSafely(text);
    } catch (_) {
        return "";
    }
}

function consumeSseBuffer(buffer, format) {
    const normalized = buffer.replace(/\r\n/g, "\n");
    const chunks = normalized.split("\n\n");
    const pending = chunks.pop() || "";
    const deltas = [];

    for (const chunk of chunks) {
        const event = parseSseEvent(chunk);
        if (!event) {
            continue;
        }
        const delta = extractStreamDelta(format, event);
        if (delta) {
            deltas.push(delta);
        }
    }

    return {
        buffer: pending,
        deltas: deltas
    };
}

function parseSseEvent(chunk) {
    const lines = chunk.split("\n");
    let eventName = "";
    const dataLines = [];

    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        if (!line || line.startsWith(":")) {
            continue;
        }
        if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
            continue;
        }
        if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trim());
        }
    }

    if (dataLines.length === 0) {
        return null;
    }

    return {
        event: eventName,
        data: dataLines.join("\n")
    };
}

function extractStreamDelta(format, event) {
    if (event.data === "[DONE]") {
        return "";
    }

    const data = parseJsonSafely(event.data);
    if (!data) {
        return "";
    }

    if (format === "completions") {
        return data.choices &&
            data.choices[0] &&
            data.choices[0].delta &&
            data.choices[0].delta.content
            ? data.choices[0].delta.content
            : "";
    }

    if (format === "responses") {
        if (data.type === "response.output_text.delta" && data.delta) {
            return data.delta;
        }
        return "";
    }

    if (format === "anthropic") {
        if (data.type === "content_block_delta" &&
            data.delta &&
            data.delta.type === "text_delta" &&
            data.delta.text) {
            return data.delta.text;
        }
        return "";
    }

    return "";
}

function parseJsonSafely(text) {
    try {
        return JSON.parse(text);
    } catch (_) {
        return text;
    }
}

function buildRequest(apiFormat, model, systemPrompt, userPrompt, text) {
    if (apiFormat === "completions") {
        return {
            model: model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.2
        };
    }

    if (apiFormat === "responses") {
        return {
            model: model,
            input: [
                {
                    role: "system",
                    content: [
                        { type: "input_text", text: systemPrompt }
                    ]
                },
                {
                    role: "user",
                    content: [
                        { type: "input_text", text: userPrompt }
                    ]
                }
            ],
            temperature: 0.2
        };
    }

    if (apiFormat === "anthropic") {
        return {
            model: model,
            system: systemPrompt,
            messages: [
                { role: "user", content: userPrompt }
            ],
            max_tokens: Math.max(1024, text.length * 4)
        };
    }

    throw `Unsupported apiFormat: ${apiFormat}`;
}

function extractText(apiFormat, data) {
    if (apiFormat === "completions") {
        const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        return sanitizeOutput(content);
    }

    if (apiFormat === "responses") {
        if (data && data.output_text) {
            return sanitizeOutput(data.output_text);
        }
        const outputs = data && data.output ? data.output : [];
        for (const item of outputs) {
            const contents = item && item.content ? item.content : [];
            for (const content of contents) {
                if (content.type === "output_text" && content.text) {
                    return sanitizeOutput(content.text);
                }
            }
        }
        return "";
    }

    if (apiFormat === "anthropic") {
        const contents = data && data.content ? data.content : [];
        const texts = contents
            .filter((item) => item.type === "text" && item.text)
            .map((item) => item.text);
        return sanitizeOutput(texts.join("\n"));
    }

    return "";
}

function isEdgeBlocked(status, lowerMessage, code) {
    return status === 403 && (
        lowerMessage.includes("error code: 1010") ||
        lowerMessage.includes("access denied") ||
        lowerMessage.includes("forbidden by") ||
        lowerMessage.includes("request blocked") ||
        code === "1010"
    );
}

function isAuthError(status, lowerMessage, type, code) {
    return status === 403 && (
        type.includes("auth") ||
        code.includes("auth") ||
        lowerMessage.includes("api key") ||
        lowerMessage.includes("apikey") ||
        lowerMessage.includes("authentication") ||
        lowerMessage.includes("unauthorized") ||
        lowerMessage.includes("permission denied") ||
        lowerMessage.includes("invalid key")
    );
}

function isModelError(lowerMessage, type, code) {
    return code.includes("model") ||
        type.includes("model") ||
        (lowerMessage.includes("model") && (
            lowerMessage.includes("not found") ||
            lowerMessage.includes("invalid") ||
            lowerMessage.includes("does not exist") ||
            lowerMessage.includes("not supported")
        ));
}

function isApiFormatError(apiFormat, lowerMessage) {
    if (lowerMessage.includes("messages") && apiFormat === "responses") {
        return true;
    }
    if (lowerMessage.includes("input") && apiFormat !== "responses") {
        return true;
    }
    if (lowerMessage.includes("anthropic-version") && apiFormat !== "anthropic") {
        return true;
    }
    return false;
}

function validateConfig({ apiFormat, baseUrl, apiKey, model }) {
    if (!baseUrl || !baseUrl.trim()) {
        throw "Missing required config: baseUrl";
    }
    if (!apiKey || !apiKey.trim()) {
        throw "Missing required config: apiKey";
    }
    if (!model || !model.trim()) {
        throw "Missing required config: model";
    }
    if (!["completions", "responses", "anthropic"].includes(apiFormat)) {
        throw `Unsupported apiFormat: ${apiFormat}`;
    }
}

function formatUserFacingError(error) {
    const message = `${error || ""}`.trim();

    if (!message) {
        return buildConfigGuidance("翻译失败，请检查插件配置后重试。");
    }

    if (message === "Missing required config: baseUrl") {
        return buildConfigGuidance("缺少基础URL（baseUrl）。", ["baseUrl"]);
    }
    if (message === "Missing required config: apiKey") {
        return buildConfigGuidance("缺少 API 密钥（apiKey）。", ["apiKey"]);
    }
    if (message === "Missing required config: model") {
        return buildConfigGuidance("缺少模型 ID（model）。", ["model"]);
    }
    if (message.startsWith("Unsupported apiFormat:")) {
        return buildConfigGuidance("接口格式（apiFormat）不支持。", ["apiFormat"]);
    }
    if (message.startsWith("API authentication failed.")) {
        return buildConfigGuidance("API 密钥校验失败。", ["apiKey"], message);
    }
    if (message.startsWith("Model validation failed.")) {
        return buildConfigGuidance("模型 ID 不可用或填写错误。", ["model"], message);
    }
    if (message.startsWith("Endpoint validation failed.")) {
        return buildConfigGuidance("基础URL或接口格式不正确。", ["baseUrl", "apiFormat"], message);
    }
    if (message.startsWith("API format validation failed.")) {
        return buildConfigGuidance("接口格式与当前平台不匹配。", ["apiFormat", "baseUrl"], message);
    }
    if (message.startsWith("Request validation failed.")) {
        return buildConfigGuidance("请求参数校验失败，通常是配置项不匹配导致。", ["apiFormat", "model", "baseUrl"], message);
    }

    return buildConfigGuidance("翻译请求失败。若确认网络正常，请检查插件配置。", [], message);
}

function buildConfigGuidance(summary, fields, rawMessage) {
    const uniqueFields = [...new Set(fields || [])];
    const fieldLabelMap = {
        apiFormat: "接口格式（apiFormat）",
        baseUrl: "基础URL（baseUrl）",
        apiKey: "API密钥（apiKey）",
        model: "模型ID（model）"
    };

    const lines = [
        summary,
        "请打开 Pot-App 插件配置，检查以下项目："
    ];

    if (uniqueFields.length > 0) {
        for (const field of uniqueFields) {
            lines.push(`- ${fieldLabelMap[field] || field}`);
        }
    } else {
        lines.push("- 基础URL（baseUrl）");
        lines.push("- API密钥（apiKey）");
        lines.push("- 模型ID（model）");
        lines.push("- 接口格式（apiFormat）");
    }

    lines.push("");
    lines.push("推荐示例（SiliconFlow）：");
    lines.push("apiFormat = completions");
    lines.push("baseUrl = https://api.siliconflow.cn/v1");
    lines.push("model = deepseek-ai/DeepSeek-V3.2");

    if (rawMessage) {
        lines.push("");
        lines.push("详细错误：");
        lines.push(rawMessage);
    }

    return lines.join("\n");
}

function sanitizeOutput(text) {
    if (!text) {
        return "";
    }
    return `${text}`.trim().replace(/^["']|["']$/g, "");
}


function mapLanguageCodeToName(code) {
    const languageMap = {
        auto: "Auto Detect",
        zh_cn: "Simplified Chinese",
        zh_tw: "Traditional Chinese",
        zh: "Simplified Chinese",
        "zh-hant": "Traditional Chinese",
        en: "English",
        ja: "Japanese",
        ko: "Korean",
        fr: "French",
        es: "Spanish",
        ru: "Russian",
        de: "German",
        it: "Italian",
        tr: "Turkish",
        pt_pt: "European Portuguese",
        pt_br: "Brazilian Portuguese",
        vi: "Vietnamese",
        id: "Indonesian",
        th: "Thai",
        ms: "Malay",
        ar: "Arabic",
        hi: "Hindi",
        mn_cy: "Mongolian",
        mn_mo: "Mongolian",
        km: "Khmer",
        nb_no: "Norwegian Bokmal",
        nn_no: "Norwegian Nynorsk",
        fa: "Persian"
    };
    return languageMap[code] || code || "";
}

function applyLanguageTemplate(template, sourceLanguage, targetLanguage) {
    const sourceName = sourceLanguage && sourceLanguage !== "Auto Detect" ? sourceLanguage : "the detected source language";
    const targetName = targetLanguage || "the target language";

    return template
        .replaceAll("{{sourceLanguage}}", sourceName)
        .replaceAll("{{targetLanguage}}", targetName);
}
