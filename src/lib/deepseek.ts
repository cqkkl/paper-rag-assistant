import { getApiKey } from "./apiKeyStore";
import { buildCoverageContext, expandAcademicQuery, formatRetrievedContext, retrieveRelevantChunks, type RagChunk } from "./rag";
import type { IChatMessage, IPaper } from "./types";

const API_BASE = "https://api.deepseek.com/v1";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function testDeepSeekApiKey(apiKey: string): Promise<void> {
  const response = await fetch(`${API_BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`连接失败（HTTP ${response.status}）`);
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

  if (buffer.trim().startsWith("data: ")) {
    try {
      const parsed = JSON.parse(buffer.trim().slice(6));
      const delta = parsed.choices[0]?.delta?.content || "";
      if (delta) {
        fullText += delta;
        onChunk(delta);
      }
    } catch {
      // 流已结束，忽略不完整的尾帧
    }
  }

  return fullText;
}

/**
 * 生成论文摘要的Prompt
 */
export function buildSummaryPrompt(paper: IPaper): ChatMessage[] {
  return [
    {
      role: "system",
      content: `你是一位专业的学术论文阅读助手。请根据用户提供的论文内容，生成结构化的中文摘要。

要求：
1. 分为四个部分：研究背景、研究方法、主要结果、结论与意义
2. 每部分用简洁的语言概括，不要太长
3. 关键数据和结论要准确提取
4. 单独列出论文局限性和可复现性风险
5. 所有事实性结论尽量使用 [第X页](#page=X) 标注依据
6. 用Markdown格式输出，标题用##`,
    },
    {
      role: "user",
      content: `请为以下论文生成结构化摘要。内容已按页码标记：\n\n${buildCoverageContext(paper)}`,
    },
  ];
}

/**
 * 构建RAG问答的Prompt
 */
export function buildChatPrompt(
  paper: IPaper,
  question: string,
  history: IChatMessage[] = [],
): ChatMessage[] {
  const chunks = retrieveRelevantChunks(paper, question, 7);
  return buildChatPromptFromChunks(question, history, chunks);
}

function buildChatPromptFromChunks(
  question: string,
  history: IChatMessage[],
  chunks: RagChunk[],
): ChatMessage[] {
  const recentHistory: ChatMessage[] = history.slice(-6).map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const allowedPages = [...new Set(chunks.map((chunk) => chunk.pageNumber))].sort((a, b) => a - b);
  return [
    {
      role: "system",
      content: `你是一位专业的学术论文问答助手。请根据用户提供的论文内容回答问题。

要求：
1. 只基于论文内容回答，不要编造
2. 如果论文里没有相关信息，请明确说明
3. 回答要准确、简洁
4. 每个关键结论必须使用 [第X页](#page=X) 标注出处
5. 本轮允许引用的页码仅为：${allowedPages.join("、")}。不要引用其他页面，也不要伪造页码
6. 结合最近的对话上下文理解追问
7. 证据不足时直接说明“当前检索证据不足”，并指出还需要什么信息`,
    },
    {
      role: "user",
      content: `以下是从论文中检索出的相关片段：\n\n${formatRetrievedContext(chunks)}`,
    },
    ...recentHistory,
    { role: "user", content: question },
  ];
}

function isCrossLanguageQuery(paper: IPaper, question: string) {
  const questionHasChinese = /[\u3400-\u9fff]/.test(question);
  const sample = (paper.textContent ?? paper.pages?.map((page) => page.text).join(" ") ?? "").slice(0, 8000);
  const chineseCount = (sample.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinCount = (sample.match(/[a-z]/gi) ?? []).length;
  return questionHasChinese ? latinCount > chineseCount * 2 : chineseCount > latinCount * 0.6;
}

export interface PreparedChatRequest {
  messages: ChatMessage[];
  chunks: RagChunk[];
  retrievalQuery: string;
}

export async function prepareChatRequest(
  paper: IPaper,
  question: string,
  history: IChatMessage[] = [],
): Promise<PreparedChatRequest> {
  let retrievalQuery = expandAcademicQuery(question);
  if (isCrossLanguageQuery(paper, question)) {
    try {
      const rewritten = await callDeepSeek([
        {
          role: "system",
          content: "你是学术检索查询改写器。把问题改写为适合在论文原文中检索的双语关键词，保留专有名词、缩写、指标和否定条件。只输出一行关键词，不回答问题，不超过80字。",
        },
        { role: "user", content: question },
      ]);
      if (rewritten.trim()) retrievalQuery = `${retrievalQuery} ${rewritten.trim()}`;
    } catch (error) {
      console.warn("跨语言检索改写失败，使用本地词表继续检索:", error);
    }
  }
  const chunks = retrieveRelevantChunks(paper, retrievalQuery, 7);
  return {
    chunks,
    retrievalQuery,
    messages: buildChatPromptFromChunks(question, history, chunks),
  };
}

/**
 * 生成研读笔记的Prompt
 */
export function buildNotesPrompt(paper: IPaper): ChatMessage[] {
  return [
    {
      role: "system",
      content: `你是一位专业的学术论文笔记助手。请根据用户提供的论文内容，生成结构化的研读笔记。

要求：
1. 包含以下部分：核心观点、实验设计、关键数据、个人思考、参考文献
2. 用Markdown格式
3. 关键数据用表格呈现
4. 内容要具体，不要空泛
5. 关键结论使用 [第X页](#page=X) 标注来源`,
    },
    {
      role: "user",
      content: `请为以下论文生成研读笔记。内容已按页码标记：\n\n${buildCoverageContext(paper)}`,
    },
  ];
}

export function buildComparisonPrompt(papers: IPaper[]): ChatMessage[] {
  const context = papers.map((paper, index) => (
    `## 文献 ${index + 1}：${paper.name}\n${buildCoverageContext(paper, 7000)}`
  )).join("\n\n---\n\n");
  return [
    {
      role: "system",
      content: `你是学术文献对比分析助手。请用Markdown表格比较各论文的研究问题、方法、数据集、指标、结果、创新点和局限性，然后总结共同趋势、主要差异和可能的研究空白。不得编造未提供的信息。`,
    },
    { role: "user", content: context },
  ];
}
