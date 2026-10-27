# 文献研读助手

一个浏览器端优先、回答可追溯到 PDF 页码的 AI 学术阅读工具。

本项目为传智杯 Vibe Coding 挑战赛作品，核心命题是：**让 AI 阅读结果能够被原文证据核验，而不是只生成一段看似正确的答案。**

## 作品展示建议

推荐使用以下 3 分钟演示流程：

1. 打开首页，说明“可追溯 RAG、本地文献库、多论文研究”三项核心创新。
2. 上传一篇 PDF，进入“双语精读”，展示按页原文、自动译文、划词高亮和译文编辑。
3. 提问“这篇论文的核心创新是什么”，点击回答中的页码引用跳到对应双语原文页。
4. 继续追问局限性，展示多轮上下文；刷新页面，展示文献和对话仍然存在。
5. 再上传一篇论文，展示自动对比表和可编辑研读笔记。

技术流程：

```text
PDF → 分页解析 → 双语精读/划词高亮 → 文本切块 → 本地相关性检索
    → DeepSeek 生成回答 → 页码引用 → 点击返回对应原文页
```

## 已实现功能

- PDF 拖拽/多选上传、解析进度、文件校验和扫描件检测
- IndexedDB 本地文献库，刷新后恢复 PDF、笔记和对话
- 分页双语精读、自动翻译、同步滚动、原文高亮和可编辑译文
- 基于页面分块和 BM25 风格关键词评分的本地检索
- DeepSeek 流式问答、多轮上下文和可点击页码引用
- 结构化摘要、可编辑研读笔记、Markdown 预览与导出
- 段落翻译和 2–5 篇论文对比分析
- 会话级/长期 API Key 保存、连接测试和删除
- 桌面端可调侧栏与移动端抽屉布局

## 本地开发

```bash
npm install
npm run dev
```

生产检查：

```bash
npm run typecheck
npm run lint:eslint
npm run build
```

## GitHub Pages 部署

普通执行 `npm run build` 时，会根据 `GITHUB_REPOSITORY` 自动生成 `/<仓库名>/` 基路径；本地未设置该变量时默认使用 `/paper-rag-assistant/`。可直接将以下目录发布到 GitHub Pages：

```text
dist/client
```

## 妙搭/传智杯构建

当平台注入 `MIAODA_CLIENT_BASE_PATH` 或 `MIAODA_RESOURCE_CDN_PREFIX` 时，构建会自动切换为妙搭协议，并生成：

```text
dist/output           页面与同源资源
dist/output_resource  CDN 静态资源
```

这一配置与项目根目录的 `spark.json` 保持一致，不需要维护两套源码。

## 数据与隐私

- PDF、解析文本、问答和笔记默认保存在当前浏览器 IndexedDB 中。
- API Key 默认只保留在当前会话；用户主动选择后才写入长期浏览器存储。
- AI 请求从浏览器直接发送给 DeepSeek，不经过本项目自有服务器。
- 扫描版 PDF 当前只做检测和提示，使用前应先通过 OCR 转成可搜索 PDF。

---

## 项目技术规范

## 技术栈

- 前端: React 19 + TypeScript
- 样式: Tailwind CSS v4
- UI 组件: shadcn/ui `import { Button } from "@/components/ui/button";`
- 图标: lucide-react `import { SearchIcon } from "lucide-react";`
- 图表: echarts-for-react `import ReactECharts from "echarts-for-react";`
- 动画: framer-motion `import { motion } from "framer-motion";`
- 路由: react-router-dom `import { Link, useNavigate } from "react-router-dom";`

---

## 目录结构

```
src/
├── index.tsx            # 入口（勿修改）
├── app.tsx              # 路由配置（仅在 <Routes> 内增删 <Route>）
├── index.css            # 全局样式 + 主题变量
├── components/          # 基础 UI 组件（禁止存放业务组件）
│   ├── layout.tsx       # 全局布局容器（含 <Outlet />）
│   └── ui/              # shadcn/ui 内置组件（勿修改）
├── pages/               # 页面模块（每个页面一个目录）
│   ├── <PageName>/      # 页面目录示例
│   │   ├── PageName.tsx        # 页面入口文件与目录同名
│   │   └── components/         # 页面专属组件
│   └── NotFoundPage/
│       └── NotFoundPage.tsx
├── hooks/               # 自定义 Hooks
└── lib/                 # 工具函数（cn() 等）

public/                  # 静态资源（dev server 原样服务；构建后随 dist/output 同源部署）
```

---

## 模板初始状态

- `app.tsx` 首页路由指向 `pages/HomePage`（占位欢迎页）
- 开发时将 `HomePage` 替换为业务首页，或在 `pages/` 下创建新页面并调整 `index` 路由
- `layout.tsx` 为空壳容器（仅 `<Outlet />`），需根据需求实现导航和布局

---

## 禁止修改的文件

| 文件 | 原因 |
|------|------|
| `src/index.tsx` | Provider 层级 + 样式引入，由模板管理 |
| `src/components/ui/*` | shadcn/ui 内置组件，版本锁定 |

---

## 文件放置规则

| 内容类型 | 放置位置 |
|---------|---------|
| 新页面 | `src/pages/<PageName>/PageName.tsx` |
| 页面专属组件 | `src/pages/<PageName>/components/` |
| 自定义 Hooks | `src/hooks/` |
| 工具函数 | `src/lib/` |
| 静态数据文件 | `public/data/` |
| 静态图片 | `public/images/` |

---

## 导入路径

```typescript
// @/ 别名 → src/
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

// public/ 下的静态资源通过 URL 引用（dev 与线上同源）
// <img src="/images/hero.png" />  fetch("/data/config.json")
```

---

## 路由配置

- 新增页面需在 `src/app.tsx` 的 `<Routes>` 内注册 `<Route>`
- `BrowserRouter` 已在 `index.tsx` 中配置，`app.tsx` 中**禁止**再包裹 Router

---

## 主题变量

主题色定义在 `src/index.css`，通过 `:root` CSS 变量 + `@theme inline` 注册到 Tailwind。

| 用途 | Tailwind 类 | CSS 变量 |
|------|------------|----------|
| 页面背景 | `bg-background` | `--background` |
| 主文本 | `text-foreground` | `--foreground` |
| 卡片背景 | `bg-card` | `--card` |
| 次要文本 | `text-muted-foreground` | `--muted-foreground` |
| 主色 | `bg-primary` / `text-primary` | `--primary` |
| 强调色 | `bg-accent` | `--accent` |
| 边框 | `border-border` | `--border` |
| 危险色 | `text-destructive` | `--destructive` |
| 图表色 | `bg-chart-1` ~ `bg-chart-5` | `--chart-1` ~ `--chart-5` |

HSL 格式使用**空格分隔**：`--primary: hsl(150 60% 40%);`
