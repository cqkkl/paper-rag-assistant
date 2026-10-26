import { getApiKey } from "./apiKeyStore";

const API_BASE = "https://api.deepseek.com/v1";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 调用DeepSeek API（非流式）
 */
export async function callDeepSeek(
  messages: ChatMessage[],
  onChunk?: (text: string) => void
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("请先设置DeepSeek API Key");
  }

  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      stream: !!onChunk,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API调用失败: ${response.status} - ${error}`);
  }

  if (!onChunk) {
    // 非流式
    const data = await response.json();
    return data.choices[0]?.message?.content || "";
  }

  // 流式输出
  const reader = response.body?.getReader();
  if (!reader) throw new Error("无法读取响应流");

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices[0]?.delta?.content || "";
        if (delta) {
          fullText += delta;
          onChunk(delta);
        }
      } catch {
        // 忽略解析错误的行
      }
    }
  }

  return fullText;
}

/**
 * 生成论文摘要的Prompt
 */
export function buildSummaryPrompt(paperText: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: `你是一位专业的学术论文阅读助手。请根据用户提供的论文内容，生成结构化的中文摘要。

要求：
1. 分为四个部分：研究背景、研究方法、主要结果、结论与意义
2. 每部分用简洁的语言概括，不要太长
3. 关键数据和结论要准确提取
4. 用Markdown格式输出，标题用##`,
    },
    {
      role: "user",
      content: `请为以下论文生成结构化摘要：\n\n${paperText.slice(0, 30000)}`,
    },
  ];
}

/**
 * 构建RAG问答的Prompt
 */
export function buildChatPrompt(paperText: string, question: string, history: ChatMessage[] = []): ChatMessage[] {
  return [
    {
      role: "system",
      content: `你是一位专业的学术论文问答助手。请根据用户提供的论文内容回答问题。

要求：
1. 只基于论文内容回答，不要编造
2. 如果论文里没有相关信息，请明确说明
3. 回答要准确、简洁
4. 引用论文中的具体内容时，可以标注出处`,
    },
    {
      role: "user",
      content: `论文内容如下：\n\n${paperText.slice(0, 25000)}\n\n---\n\n我的问题是：${question}`,
    },
  ];
}

/**
 * 生成研读笔记的Prompt
 */
export function buildNotesPrompt(paperText: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: `你是一位专业的学术论文笔记助手。请根据用户提供的论文内容，生成结构化的研读笔记。

要求：
1. 包含以下部分：核心观点、实验设计、关键数据、个人思考、参考文献
2. 用Markdown格式
3. 关键数据用表格呈现
4. 内容要具体，不要空泛`,
    },
    {
      role: "user",
      content: `请为以下论文生成研读笔记：\n\n${paperText.slice(0, 30000)}`,
    },
  ];
}
