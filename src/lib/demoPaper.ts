import { PAPER_LAYOUT_VERSION, type IPaper, type IPaperPage } from "./types";

const pageTexts = [
  `EvidenceTrace: An Evidence-Aware Multilingual Assistant for Scientific Reading

Lin Chen, Rui Zhao, and Ming Xu

Demo Research Group, School of Intelligent Information Systems

ABSTRACT

Researchers often use large language models to summarize papers, but generated conclusions can be difficult to verify. We present EvidenceTrace, a browser-first reading workflow that combines bilingual page reading, cross-language retrieval, and citation validation. Every answer is grounded in retrieved page chunks and links back to its source page. The system stores papers and annotations locally so that users retain control of their research materials.

Keywords: scientific reading; retrieval-augmented generation; evidence tracing; bilingual interface`,
  `1. METHOD

The workflow contains four stages. First, the PDF parser preserves page boundaries and identifies titles, headings, paragraphs, lists, captions, and equations. Second, a bilingual query rewriter expands a Chinese question with English academic terms while retaining domain-specific abbreviations. Third, a BM25-style retriever ranks overlapping page chunks using term rarity and document-length normalization. Finally, the answer generator receives only the top-ranked chunks and a whitelist of citable page numbers.

Citation validation is performed after generation. A page link is accepted only when both the visible page label and its target belong to the retrieval whitelist. Unsupported page links are marked for verification instead of being presented as reliable evidence.

The reader displays the original page on the left and an editable translation on the right. Users can highlight source sentences in four colors, revise terminology in the translation, and return from an answer directly to the relevant page.`,
  `2. DEMONSTRATION EVALUATION

We created a synthetic evaluation set containing 40 questions across innovation, methods, results, limitations, and reproducibility. Half of the questions were written in Chinese while all source pages were written in English. The baseline used literal keyword matching; EvidenceTrace used bilingual query expansion and BM25 length normalization.

For the synthetic demonstration, evidence-page recall increased from 62.5% to 87.5%. Citation validation detected all deliberately injected out-of-range page links. In a small task walkthrough, participants completed evidence verification in a median of 18 seconds with clickable evidence cards, compared with 51 seconds when manually searching the document.

These values are illustrative data bundled for product demonstration, not results from a peer-reviewed user study. A formal evaluation should use public datasets, independent annotators, and confidence intervals.`,
  `3. LIMITATIONS AND FUTURE WORK

The current prototype depends on the text layer embedded in a PDF. Scanned documents require optical character recognition before reliable retrieval. Figures and tables are preserved in the original-page view, but their visual semantics are not yet converted into structured evidence. Translation quality also depends on the configured language model and should be reviewed for specialized terminology.

Future work will add local OCR, figure-caption alignment, table extraction, and a reproducible retrieval benchmark. We also plan to expose retrieval scores and query rewrites for expert inspection, while keeping the default interface concise for ordinary readers.

4. CONCLUSION

EvidenceTrace turns paper reading into a verifiable loop: ask, retrieve, answer, inspect evidence, and return to the source. The design prioritizes traceability and user correction over opaque one-click generation.`,
];

const translations: Record<number, string> = {
  1: `# EvidenceTrace：面向科研阅读的证据感知多语言助手

**作者｜** 陈林、赵睿、徐明

### 作者单位

- 智能信息系统学院 · 演示研究组

## 摘要

研究人员经常使用大语言模型概括论文，但生成的结论往往难以核验。我们提出 **EvidenceTrace**：一种浏览器优先的阅读流程，将双语分页阅读、跨语言检索与引用校验整合在一起。每条回答都以检索到的分页片段为依据，并可跳回对应原文页。系统在本地保存论文和标注，使用户能够掌控自己的研究资料。

**关键词｜** 科研阅读；检索增强生成；证据追踪；双语界面`,
  2: `## 1. 方法

该流程包含四个阶段：

1. PDF 解析器保留页码边界，并识别标题、章节、段落、列表、图注和公式。
2. 双语查询改写器为中文问题补充英文学术检索词，同时保留领域缩写。
3. BM25 风格检索器结合词项稀有度与文档长度归一化，对重叠文本块排序。
4. 回答模型只接收排名靠前的片段，以及本轮允许引用的页码白名单。

### 引用校验

回答生成后还会进行引用校验。只有当可见页码与链接目标一致，并且属于检索白名单时，引用才会被接受；不受支持的链接会被标记为“待核验”。

阅读器左侧显示原文，右侧显示可编辑译文。用户可以使用四种颜色高亮原文、修订译文术语，并从回答直接返回相关页面。`,
  3: `## 2. 演示性评估

我们构造了一个**合成评估集**，包含 40 个问题，覆盖创新、方法、结果、局限和可复现性。其中一半问题使用中文，而全部原始页面均为英文。基线采用字面关键词匹配；EvidenceTrace 使用双语查询扩展和 BM25 长度归一化。

在这组合成演示数据中，证据页召回率由 **62.5% 提升到 87.5%**。引用校验发现了全部人为注入的越界页码。在小规模任务演练中，参与者通过可点击证据卡完成核验的中位时间为 18 秒，手动搜索文档则为 51 秒。

> 这些数值仅为产品演示附带的示例数据，并非经过同行评审的用户研究结果。正式评测仍应使用公开数据集、独立标注者和置信区间。`,
  4: `## 3. 局限与未来工作

当前原型依赖 PDF 内嵌文本层。扫描文档需要先进行 OCR，才能可靠检索。图表会在原始版面中保留，但其视觉语义尚未被转为结构化证据。翻译质量也取决于所配置的语言模型，专业术语仍需人工复核。

未来将加入本地 OCR、图注对齐、表格提取和可复现的检索基准；同时为专家提供检索分数与查询改写记录，又不让普通读者的默认界面变得复杂。

## 4. 结论

EvidenceTrace 将论文阅读变成一个可核验闭环：**提问 → 检索 → 回答 → 检查证据 → 返回原文**。它优先保障可追溯性和用户修正权，而不是不可解释的一键生成。`,
};

const pages: IPaperPage[] = pageTexts.map((text, index) => ({
  pageNumber: index + 1,
  text,
  layoutVersion: PAPER_LAYOUT_VERSION,
}));

export function createDemoPaper(): IPaper {
  const now = Date.now();
  return {
    id: `demo-${crypto.randomUUID()}`,
    name: "评审演示样例｜EvidenceTrace（合成论文）",
    size: 0,
    uploadTime: now,
    status: "ready",
    progress: 100,
    textContent: pageTexts.join("\n\n"),
    pageCount: pages.length,
    pages,
    outline: [
      { title: "摘要", pageNumber: 1, level: 1 },
      { title: "方法", pageNumber: 2, level: 1 },
      { title: "演示性评估", pageNumber: 3, level: 1 },
      { title: "局限与结论", pageNumber: 4, level: 1 },
    ],
    textQuality: "good",
    translations,
    demo: true,
    aiSummary: `## 研究问题

作品聚焦 AI 论文阅读中“结论难以回到原文核验”的问题，提出一个证据感知、双语且本地优先的阅读流程。[第1页](#page=1)

## 核心方法

- 保留 PDF 页码和学术版面结构；
- 对中英文问题进行跨语言查询扩展；
- 使用 BM25 风格相关性排序召回证据；
- 用页码白名单对模型引用做生成后校验。[第2页](#page=2)

## 演示结果

合成评估中，证据页召回率由 62.5% 提升至 87.5%，但这些数字只是产品演示数据，不能替代正式实验。[第3页](#page=3)

## 局限性

当前仍依赖 PDF 文本层，尚未把图表视觉语义转成结构化证据，专业翻译也需要人工复核。[第4页](#page=4)`,
    notes: `# 评审演示笔记

## 一句话价值

把“AI 给答案”升级为“AI 给出可点击、可核对、可修正的证据链”。

## 演示提醒

- 本样例为原创合成内容，不代表真实论文实验结论。
- 可在“双语精读”中修改译文并高亮原句。
- 可在“文献问答”中点击证据卡跳回原文。`,
    chatMessages: [
      {
        id: crypto.randomUUID(),
        role: "user",
        content: "这项工作的核心创新是什么？",
        timestamp: now - 2000,
        demo: true,
      },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "核心创新不是单独的翻译或问答，而是把它们组成一个**可核验闭环**：先把中文问题改写为双语检索词，用 BM25 风格评分寻找英文原文证据，再把可引用页码限制在本轮召回页内，并对生成后的页码链接进行校验。[第2页](#page=2)\n\n在交互上，回答下方的证据卡可以跳回双语页，用户还能高亮原句和修订译文，使 AI 输出可检查、可纠正。",
        timestamp: now - 1000,
        demo: true,
        citations: [
          {
            pageNumber: 2,
            section: "1. METHOD",
            excerpt: "A bilingual query rewriter expands a Chinese question with English academic terms… a BM25-style retriever ranks overlapping page chunks…",
            score: 8.74,
          },
          {
            pageNumber: 2,
            section: "Citation validation",
            excerpt: "A page link is accepted only when both the visible page label and its target belong to the retrieval whitelist.",
            score: 7.92,
          },
        ],
      },
    ],
  };
}
