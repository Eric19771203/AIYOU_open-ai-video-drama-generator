# 本地服务架构规划

## 一、概述

将当前直接在前端调用AI API的架构，重构为：
- **前端**：通过RESTful API与本地服务器通信
- **本地服务器**：处理业务逻辑，调用AI API，管理数据持久化
- **数据层**：结构化存储所有生成内容（SQLite/JSON）

---

## 二、架构设计

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (React)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Canvas UI   │  │ Node Editor  │  │ Settings     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│           │                │                │              │
│           └────────────────┴────────────────┘              │
│                            │                               │
│                    ┌───────▼───────┐                       │
│                    │  API Client   │                       │
│                    │  (axios/fetch)│                       │
│                    └───────┬───────┘                       │
└────────────────────────────┼───────────────────────────────┘
                             │ HTTP/REST
                             │
┌────────────────────────────┼───────────────────────────────┐
│                    ┌───────▼───────┐                       │
│                    │  本地服务器   │                       │
│                    │   (Node.js)   │                       │
│                    └───────┬───────┘                       │
│           ┌─────────────────┼─────────────────┐            │
│           │                 │                 │            │
│    ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐     │
│    │ Controllers │  │  Services   │  │   Models    │     │
│    └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│           │                │                 │            │
│    ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐     │
│    │   Routes    │  │  Business  │  │  Database   │     │
│    │  (Express)  │  │   Logic    │  │   (SQLite)  │     │
│    └─────────────┘  └──────┬──────┘  └─────────────┘     │
│                           │                              │
│                    ┌──────▼──────┐                       │
│                    │ AI Clients  │                       │
│                    │ (Gemini/...) │                       │
│                    └──────┬──────┘                       │
└──────────────────────────┼───────────────────────────────┘
                           │ HTTP
                           │
┌──────────────────────────┼───────────────────────────────┐
│                    ┌──────▼──────┐                       │
│                    │  AI Services │                       │
│                    │  (Gemini API)│                       │
│                    └─────────────┘                       │
└───────────────────────────────────────────────────────────┘
```

---

## 三、技术栈选择

### 3.1 后端服务器

**推荐方案：Node.js + Express + TypeScript**

**理由：**
- 与前端技术栈一致，便于全栈开发
- TypeScript提供类型安全
- Express生态成熟，中间件丰富
- 异步处理能力强

**核心依赖：**
```json
{
  "express": "^4.18.x",
  "cors": "^2.8.x",
  "helmet": "^7.0.x",
  "morgan": "^1.10.x",
  "better-sqlite3": "^9.0.x",
  "@google/generative-ai": "^0.15.x",
  "multer": "^1.4.x",
  "joi": "^17.11.x",
  "winston": "^3.11.x"
}
```

### 3.2 数据库

**推荐方案：SQLite**

**理由：**
- 轻量级，无需独立数据库服务
- 单文件存储，便于备份
- 支持事务，数据一致性有保障
- 适合本地应用场景

**数据存储结构：**

| 表名 | 用途 | 主要字段 |
|------|------|----------|
| `workspaces` | 画布管理 | id, name, created_at, updated_at |
| `nodes` | 节点数据 | id, workspace_id, type, x, y, data(JSON) |
| `connections` | 连接关系 | id, workspace_id, source_id, target_id |
| `generated_assets` | 生成资产 | id, node_id, type, file_path, metadata(JSON) |
| `api_logs` | API调用日志 | id, endpoint, model, request(JSON), response(JSON), created_at |
| `character_profiles` | 角色档案 | id, node_id, name, profile_data(JSON), created_at |

### 3.3 文件存储

**方案：混合存储**

```
项目根目录/
├── aiyou-backend/           # 后端服务
│   ├── server.ts           # 入口文件
│   ├── src/
│   │   ├── controllers/    # 控制器层
│   │   ├── services/       # 业务逻辑层
│   │   ├── models/         # 数据模型
│   │   ├── routes/         # 路由定义
│   │   ├── middleware/     # 中间件
│   │   └── utils/          # 工具函数
│   ├── database/           # 数据库文件
│   │   └── aiyou.db        # SQLite数据库
│   └── storage/            # 文件存储
│       ├── workspaces/     # 工作区文件
│       │   ├── {workspace_id}/
│       │   │   ├── nodes/  # 节点输出
│       │   │   │   ├── image_generator/
│       │   │   │   ├── video_generator/
│       │   │   │   ├── audio_generator/
│       │   │   │   └── storyboard_image/
│       │   │   └── exports/ # 用户导出
│       └── cache/          # 临时缓存
```

---

## 四、API接口设计

### 4.1 基础路由结构

```
GET    /api/health              # 健康检查
GET    /api/workspaces          # 获取所有画布
POST   /api/workspaces          # 创建画布
GET    /api/workspaces/:id      # 获取画布详情
PUT    /api/workspaces/:id      # 更新画布
DELETE /api/workspaces/:id      # 删除画布

# 节点操作
POST   /api/workspaces/:id/nodes          # 创建节点
PUT    /api/workspaces/:id/nodes/:nodeId  # 更新节点
DELETE /api/workspaces/:id/nodes/:nodeId  # 删除节点

# AI生成接口
POST   /api/generate/image              # 生成图片
POST   /api/generate/video              # 生成视频
POST   /api/generate/audio              # 生成音频
POST   /api/generate/character          # 生成角色
POST   /api/generate/storyboard         # 生成分镜
POST   /api/generate/script             # 生成剧本

# 任务管理
GET    /api/tasks/:id                   # 获取任务状态
DELETE /api/tasks/:id                   # 取消任务

# 资产管理
GET    /api/assets                      # 获取资产列表
GET    /api/assets/:id                  # 获取资产详情
DELETE /api/assets/:id                  # 删除资产
POST   /api/assets/:id/export           # 导出资产

# 系统配置
GET    /api/config                      # 获取配置
PUT    /api/config                      # 更新配置
GET    /api/logs                        # 获取日志
```

### 4.2 核心接口详细设计

#### 4.2.1 生成图片

**POST** `/api/generate/image`

**请求：**
```json
{
  "workspaceId": "workspace-123",
  "nodeId": "node-456",
  "prompt": "一只可爱的猫咪",
  "model": "gemini-2.0-flash-exp",
  "aspectRatio": "16:9",
  "count": 1
}
```

**响应：**
```json
{
  "taskId": "task-789",
  "status": "pending",
  "message": "任务已创建"
}
```

#### 4.2.2 获取任务状态

**GET** `/api/tasks/:id`

**响应：**
```json
{
  "id": "task-789",
  "status": "completed",  // pending | processing | completed | failed
  "progress": 100,
  "result": {
    "images": ["data:image/png;base64,..."],
    "metadata": {...}
  },
  "error": null
}
```

#### 4.2.3 生成角色

**POST** `/api/generate/character`

**请求：**
```json
{
  "workspaceId": "workspace-123",
  "nodeId": "node-456",
  "characterName": "张三",
  "context": "剧本内容...",
  "styleContext": "ANIME风格",
  "customDescription": "年轻貌美"
}
```

**响应：**
```json
{
  "taskId": "task-char-001",
  "status": "pending"
}
```

---

## 五、数据模型设计

### 5.1 数据库Schema

```sql
-- 工作区表
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  settings TEXT, -- JSON格式存储
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 节点表
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL, -- CHARACTER_NODE, IMAGE_GENERATOR等
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  data TEXT NOT NULL, -- JSON格式存储节点数据
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- 连接表
CREATE TABLE connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- 生成资产表
CREATE TABLE generated_assets (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  asset_type TEXT NOT NULL, -- image, video, audio, character_profile
  file_path TEXT,
  metadata TEXT, -- JSON格式存储元数据
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- API调用日志表
CREATE TABLE api_logs (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  model TEXT,
  request_text TEXT,
  response_text TEXT,
  status TEXT NOT NULL, -- success | error
  error_message TEXT,
  duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 角色档案表
CREATE TABLE character_profiles (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  profile_data TEXT NOT NULL, -- JSON格式存储完整档案
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
```

### 5.2 TypeScript类型定义

```typescript
// src/types/workspace.ts
interface Workspace {
  id: string;
  name: string;
  settings: WorkspaceSettings;
  nodes: Node[];
  connections: Connection[];
  createdAt: Date;
  updatedAt: Date;
}

// src/types/node.ts
interface Node {
  id: string;
  workspaceId: string;
  type: NodeType;
  x: number;
  y: number;
  data: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// src/types/task.ts
interface Task {
  id: string;
  type: 'image' | 'video' | 'audio' | 'character' | 'storyboard' | 'script';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

// src/types/asset.ts
interface GeneratedAsset {
  id: string;
  nodeId: string;
  workspaceId: string;
  assetType: 'image' | 'video' | 'audio' | 'character_profile';
  filePath: string;
  metadata: AssetMetadata;
  createdAt: Date;
}
```

---

## 六、服务层设计

### 6.1 服务模块划分

```
src/
├── controllers/
│   ├── workspace.controller.ts
│   ├── node.controller.ts
│   ├── generation.controller.ts
│   ├── task.controller.ts
│   └── asset.controller.ts
│
├── services/
│   ├── ai/
│   │   ├── gemini.service.ts      # Gemini AI调用
│   │   ├── claude.service.ts      # Claude AI调用（预留）
│   │   └── base-ai.service.ts     # 基类
│   │
│   ├── generation/
│   │   ├── image-generator.service.ts
│   │   ├── video-generator.service.ts
│   │   ├── audio-generator.service.ts
│   │   ├── character-generator.service.ts
│   │   └── storyboard-generator.service.ts
│   │
│   ├── task/
│   │   └── task-queue.service.ts    # 任务队列管理
│   │
│   ├── storage/
│   │   ├── file-storage.service.ts
│   │   ├── database.service.ts
│   │   └── asset-manager.service.ts
│   │
│   └── workspace.service.ts
│
├── models/
│   ├── workspace.model.ts
│   ├── node.model.ts
│   ├── task.model.ts
│   └── asset.model.ts
│
├── routes/
│   ├── index.ts
│   ├── workspace.routes.ts
│   ├── generation.routes.ts
│   └── task.routes.ts
│
├── middleware/
│   ├── error-handler.middleware.ts
│   ├── logger.middleware.ts
│   └── validation.middleware.ts
│
├── utils/
│   ├── logger.ts
│   ├── validator.ts
│   └── response-formatter.ts
│
└── server.ts
```

### 6.2 核心服务示例

#### 6.2.1 AI服务基类

```typescript
// src/services/ai/base-ai.service.ts
export abstract class BaseAIService {
  abstract generateImage(prompt: string, options: ImageGenerationOptions): Promise<string[]>;
  abstract generateVideo(prompt: string, options: VideoGenerationOptions): Promise<VideoResult>;
  abstract generateText(prompt: string, options: TextGenerationOptions): Promise<string>;

  protected async logAPICall(endpoint: string, request: any, response: any, duration: number) {
    // 记录API调用日志到数据库
  }
}
```

#### 6.2.2 Gemini服务实现

```typescript
// src/services/ai/gemini.service.ts
export class GeminiService extends BaseAIService {
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    super();
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generateImage(prompt: string, options: ImageGenerationOptions): Promise<string[]> {
    const startTime = Date.now();
    try {
      // 调用Gemini API
      const response = await this.client...;
      const images = response.images;

      // 记录日志
      await this.logAPICall('generateImage', { prompt, options }, images, Date.now() - startTime);

      return images;
    } catch (error) {
      await this.logAPICall('generateImage', { prompt, options }, error, Date.now() - startTime);
      throw error;
    }
  }
}
```

#### 6.2.3 任务队列服务

```typescript
// src/services/task/task-queue.service.ts
export class TaskQueueService {
  private queue: Map<string, Task>;
  private processing: Set<string>;

  async enqueue(task: Task): Promise<string> {
    this.queue.set(task.id, task);
    await this.saveTaskToDB(task);

    // 如果有空闲的处理槽，立即开始处理
    if (this.processing.size < this.maxConcurrent) {
      this.process(task.id);
    }

    return task.id;
  }

  private async process(taskId: string) {
    const task = this.queue.get(taskId);
    if (!task) return;

    this.processing.add(taskId);
    task.status = 'processing';
    await this.updateTaskInDB(task);

    try {
      // 根据任务类型调用相应的生成服务
      const result = await this.executeTask(task);

      task.status = 'completed';
      task.result = result;
      task.progress = 100;
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
    } finally {
      this.processing.delete(taskId);
      await this.updateTaskInDB(task);
    }
  }

  private async executeTask(task: Task): Promise<any> {
    switch (task.type) {
      case 'image':
        return this.imageGenerator.generate(task.params);
      case 'video':
        return this.videoGenerator.generate(task.params);
      // ...
    }
  }
}
```

---

## 七、前端改造

### 7.1 API客户端封装

```typescript
// src/lib/api-client.ts
class APIClient {
  private baseURL: string = 'http://localhost:3000/api';

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new APIError(response.status, await response.text());
    }

    return response.json();
  }

  // 工作区API
  async getWorkspaces() {
    return this.request<Workspace[]>('/workspaces');
  }

  async createWorkspace(data: CreateWorkspaceDTO) {
    return this.request<Workspace>('/workspaces', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // 生成API
  async generateImage(params: ImageGenerationParams) {
    return this.request<{ taskId: string }>('/generate/image', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async getTaskStatus(taskId: string) {
    return this.request<Task>(`/tasks/${taskId}`);
  }

  // 轮询任务完成
  async pollTask(taskId: string, onUpdate?: (task: Task) => void): Promise<Task> {
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const task = await this.getTaskStatus(taskId);
          onUpdate?.(task);

          if (task.status === 'completed') {
            clearInterval(interval);
            resolve(task);
          } else if (task.status === 'failed') {
            clearInterval(interval);
            reject(new Error(task.error || '任务失败'));
          }
        } catch (error) {
          clearInterval(interval);
          reject(error);
        }
      }, 1000);
    });
  }
}

export const apiClient = new APIClient();
```

### 7.2 React Hooks封装

```typescript
// src/hooks/useGeneration.ts
export function useImageGeneration() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const generate = async (params: ImageGenerationParams) => {
    setIsGenerating(true);
    setError(null);
    setProgress(0);

    try {
      // 1. 提交任务
      const { taskId } = await apiClient.generateImage(params);

      // 2. 轮询任务状态
      const task = await apiClient.pollTask(taskId, (t) => {
        setProgress(t.progress);
      });

      return task.result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  };

  return { generate, isGenerating, progress, error };
}

// src/hooks/useWorkspace.ts
export function useWorkspace(workspaceId: string) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWorkspace = async () => {
      try {
        const data = await apiClient.getWorkspace(workspaceId);
        setWorkspace(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkspace();
  }, [workspaceId]);

  return { workspace, isLoading, error };
}
```

---

## 八、实施路线图

### Phase 1: 基础设施搭建（1-2周）

- [ ] 初始化Node.js + Express + TypeScript项目
- [ ] 配置SQLite数据库连接
- [ ] 实现基础的数据库模型
- [ ] 实现健康检查接口
- [ ] 配置CORS和日志中间件

### Phase 2: 核心服务迁移（2-3周）

- [ ] 实现Gemini AI服务封装
- [ ] 实现任务队列系统
- [ ] 实现文件存储服务
- [ ] 迁移图片生成逻辑
- [ ] 迁移视频生成逻辑
- [ ] 迁移角色生成逻辑

### Phase 3: 前端改造（2周）

- [ ] 封装API客户端
- [ ] 重构App.tsx移除直接AI调用
- [ ] 实现任务轮询机制
- [ ] 更新错误处理逻辑

### Phase 4: 数据持久化（1周）

- [ ] 实现工作区保存/加载
- [ ] 实现节点数据持久化
- [ ] 实现资产元数据管理
- [ ] 实现API日志记录

### Phase 5: 高级功能（1-2周）

- [ ] 实现任务队列管理界面
- [ ] 实现资产导出功能
- [ ] 实现数据统计和分析
- [ ] 实现配置管理界面

---

## 九、优势与收益

### 9.1 架构优势

1. **关注点分离**
   - 前端专注UI/UX
   - 后端处理业务逻辑和数据管理

2. **可扩展性**
   - 易于添加新的AI服务提供商
   - 易于添加新的生成功能
   - 支持多用户并发使用

3. **数据安全**
   - 所有数据本地存储
   - API密钥服务器端管理
   - 支持数据备份和恢复

4. **性能优化**
   - 任务队列避免阻塞
   - 支持任务优先级
   - 可以实现缓存机制

5. **可维护性**
   - 代码结构清晰
   - 便于测试和调试
   - API文档自动生成

### 9.2 功能增强

1. **历史记录**
   - 所有生成内容可追溯
   - 支持重新下载历史结果

2. **成本追踪**
   - API调用次数统计
   - Token使用量统计
   - 费用预估

3. **批量操作**
   - 支持批量生成
   - 支持任务队列
   - 支持后台生成

4. **数据分析**
   - 生成成功率统计
   - 常用提示词分析
   - 使用习惯分析

---

## 十、风险与挑战

### 10.1 技术风险

| 飈险 | 影响 | 缓解措施 |
|------|------|---------|
| 后端服务稳定性 | 高 | 充分测试，实现错误重试 |
| 数据迁移复杂度 | 中 | 提供迁移脚本，兼容旧数据 |
| 性能瓶颈 | 中 | 任务队列，数据库优化 |
| API限流 | 中 | 实现请求队列和缓存 |

### 10.2 用户体验风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 需要运行后端服务 | 中 | 提供一键启动脚本 |
| 配置复杂度 | 中 | 提供默认配置，简化安装 |
| 学习成本 | 低 | 提供详细文档和示例 |

---

## 十一、后续优化方向

### 11.1 短期优化（1-3个月）

1. **性能优化**
   - 实现响应缓存
   - 数据库查询优化
   - 静态资源CDN

2. **功能增强**
   - 支持更多AI模型
   - 支持自定义模型参数
   - 支持批量导出

3. **用户体验**
   - 实时进度推送（WebSocket）
   - 通知系统
   - 快捷键支持

### 11.2 长期规划（3-6个月）

1. **多端支持**
   - 桌面客户端（Electron）
   - 移动端适配
   - 插件系统

2. **协作功能**
   - 多用户支持
   - 权限管理
   - 项目分享

3. **AI能力增强**
   - 模型微调
   - 提示词优化
   - 智能推荐

---

## 十二、总结

本架构规划将现有前端应用重构为前后端分离架构，通过本地服务器统一管理AI调用和数据持久化。主要优势包括：

1. **更好的架构**：前后端职责分离，代码更易维护
2. **数据安全**：所有数据本地存储，支持备份恢复
3. **功能增强**：支持历史记录、成本追踪、批量操作
4. **可扩展性**：易于添加新功能和新AI服务

建议按照实施路线图逐步推进，优先完成基础设施搭建和核心服务迁移，确保系统稳定后再进行功能扩展。
