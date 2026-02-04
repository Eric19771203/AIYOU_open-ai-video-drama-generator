/**
 * 通用多镜头提示词构建器
 * 适用于 luma, runway, veo 等非 Sora 模型
 * 不包含黑色空镜，直接从实际分镜开始
 */

import { SplitStoryboardShot } from '../../types';
import { PromptBuilder, PromptBuilderOptions } from './types';
import { getUserDefaultModel } from '../modelConfig';
import { logAPICall } from '../apiLogger';
import { llmProviderManager } from '../llmProviders';

/**
 * 通用多镜头提示词构建器
 */
export class GenericPromptBuilder implements PromptBuilder {
  readonly name = 'generic';
  readonly supportedModels = ['luma', 'runway', 'veo', 'minimax', 'volcengine', 'grok', 'qwen'] as const;

  /**
   * 构建通用多镜头提示词
   */
  async build(
    shots: SplitStoryboardShot[],
    options?: PromptBuilderOptions
  ): Promise<string> {
    if (shots.length === 0) {
      throw new Error('至少需要一个分镜');
    }

    // ✅ 提取风格和对白保留标记
    const visualStyle = options?.visualStyle || '3D动漫风格';
    const preserveDialogue = options?.preserveDialogue !== false;  // 默认保留

    // 构建完整的分镜信息（不包含对白，避免AI翻译）
    const shotsInfo = shots.map((shot, index) => {
      return `
镜头 ${shot.shotNumber} (${shot.duration}秒)
- 景别: ${shot.shotSize}
- 拍摄角度: ${shot.cameraAngle}
- 运镜方式: ${shot.cameraMovement}
- 场景: ${shot.scene || '未指定'}
- 视觉描述: ${shot.visualDescription}
- 视觉特效: ${shot.visualEffects || '无'}
- 音效: ${shot.audioEffects || '无'}`;
    }).join('\n');

    const totalDuration = shots.reduce((sum, s) => sum + s.duration, 0);

    // ✅ 修改 AI 提示词，添加风格要求和对白保留说明
    const userPrompt = `你是一位专业的视频提示词生成器。你的任务是将分镜信息转换为多镜头视频提示词格式。

**风格要求**：${visualStyle}

分镜信息：
${shotsInfo}

总时长：约 ${totalDuration.toFixed(1)} 秒

输出要求：
1. 每个镜头的 Scene 必须以 "${visualStyle}" 开头
2. Scene 格式：[风格描述]，[场景描述]，[动作描述]，${preserveDialogue ? '如有对白则用引号包裹原样输出' : '忽略对白'}
3. 只输出多镜头格式（Shot 1, Shot 2, ...）
4. 不要添加任何前缀、后缀、说明、建议或解释
5. 不要使用 "---" 分隔线
6. 不要添加"导演建议"、"色彩控制"等额外内容
7. 直接开始输出 Shot 1

输出格式示例：
Shot 1:
duration: X.Xs
Scene: ${visualStyle}，[场景描述]，[动作描述]${preserveDialogue ? '，"对白内容"（如果有）' : ''}

Shot 2:
duration: X.Xs
Scene: ${visualStyle}，[场景描述]，[动作描述]`;

    const systemPrompt = `你是一个视频提示词格式化工具。只负责将分镜信息转换为指定格式，不添加任何额外内容。`;

    try {
      return await logAPICall(
        'GenericPromptBuilder.build',
        async () => {
          const modelName = getUserDefaultModel('text');

          // 使用 llmProviderManager 统一调用，支持 Gemini 和云雾 API
          const text = await llmProviderManager.generateContent(
            systemPrompt + '\n\n' + userPrompt,
            modelName,
            {
              systemInstruction: systemPrompt
            }
          );

          if (!text) return this.buildBasicPrompt(shots, options);

          // 清理多余内容
          return this.cleanPrompt(text);
        },
        {
          model: getUserDefaultModel('text'),
          prompt: userPrompt.substring(0, 200),
          options: {
            shotCount: shots.length,
            totalDuration: shots.reduce((sum, s) => sum + s.duration, 0)
          }
        },
        { nodeId: 'generic-builder', nodeType: 'GENERIC_PROMPT_BUILDER', platform: llmProviderManager.getCurrentProvider().getName() }
      );
    } catch (error: any) {
      console.error('[GenericPromptBuilder] AI enhancement failed, using basic prompt:', error);
      return this.buildBasicPrompt(shots, options);
    }
  }

  /**
   * 清理 AI 生成的提示词，去除多余内容
   */
  private cleanPrompt(text: string): string {
    let cleaned = text.trim();

    // 移除常见的前缀
    const prefixesToRemove = [
      '好的，', '好的。', '以下是', '这是', '根据要求', '为你生成',
      '优化后的', '这是优化后的', '以下是优化后的', '你好', '你好，我是',
      '作为导演', '作为专业的', 'Sure,', 'Here is', 'Certainly,', 'I will', 'Let me'
    ];

    for (const prefix of prefixesToRemove) {
      if (cleaned.startsWith(prefix)) {
        cleaned = cleaned.substring(prefix.length).trim();
      }
    }

    // 确保以 "Shot 1:" 开头
    if (!cleaned.startsWith('Shot 1:')) {
      const shot1Index = cleaned.indexOf('Shot 1:');
      if (shot1Index !== -1) {
        cleaned = cleaned.substring(shot1Index).trim();
      } else {
        const firstShotMatch = cleaned.match(/Shot \d+:/);
        if (firstShotMatch) {
          cleaned = cleaned.substring(firstShotMatch.index).trim();
        }
      }
    }

    // 移除 markdown 代码块标记
    cleaned = cleaned.replace(/```[\w]*\n?/g, '').trim();

    // 移除分隔线和额外内容
    const separatorIndex = cleaned.indexOf('\n---');
    if (separatorIndex !== -1) {
      cleaned = cleaned.substring(0, separatorIndex).trim();
    }

    const lines = cleaned.split('\n');
    const filteredLines = lines.filter(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('###')) return false;
      if (trimmed === '---' || trimmed.match(/^--+$/)) return false;
      return true;
    });

    cleaned = filteredLines.join('\n').trim();

    return cleaned;
  }

  /**
   * 构建基础提示词（回退方案）
   */
  private buildBasicPrompt(
    shots: SplitStoryboardShot[],
    options?: PromptBuilderOptions
  ): string {
    // ✅ 提取风格和对白保留标记
    const visualStyle = options?.visualStyle || '3D动漫风格';
    const preserveDialogue = options?.preserveDialogue !== false;  // 默认保留

    const actualShots = shots.map((shot, index) => {
      const duration = shot.duration || 5;
      const scene = shot.visualDescription || '';
      const dialogue = shot.dialogue;

      // ✅ 构建Scene，包含风格+场景+对白
      let sceneText = `${visualStyle}，${scene}`;
      if (preserveDialogue && dialogue && dialogue !== '无') {
        sceneText += `，"${dialogue}"`;  // ✅ 添加对白（保持原样）
      }

      return `Shot ${index + 1}:
duration: ${duration.toFixed(1)}s
Scene: ${sceneText}`;
    }).join('\n\n');

    return actualShots;
  }
}
