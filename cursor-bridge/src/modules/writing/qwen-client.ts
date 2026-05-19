import OpenAI from 'openai';

export interface CompletionChunk {
  type: 'token' | 'done' | 'error';
  content: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

export class QwenClient {
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, opts?: { baseURL?: string; defaultModel?: string }) {
    if (!apiKey) {
      throw new Error('DASHSCOPE_API_KEY is required for QwenClient');
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: opts?.baseURL || DEFAULT_BASE_URL,
    });
    this.defaultModel = opts?.defaultModel || 'qwen-turbo-latest';
  }

  async *streamComplete(
    systemPrompt: string,
    userPrompt: string,
    opts: CompletionOptions = {},
  ): AsyncGenerator<CompletionChunk> {
    try {
      const stream = await this.client.chat.completions.create({
        model: opts.model || this.defaultModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxTokens ?? 150,
        top_p: opts.topP ?? 0.9,
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          yield { type: 'token', content };
        }
        if (chunk.usage) {
          yield {
            type: 'done',
            content: '',
            usage: {
              prompt_tokens: chunk.usage.prompt_tokens,
              completion_tokens: chunk.usage.completion_tokens,
              total_tokens: chunk.usage.total_tokens,
            },
          };
        }
      }
    } catch (err: any) {
      yield {
        type: 'error',
        content: err.message || 'Unknown error from Qwen API',
      };
    }
  }

  async complete(
    systemPrompt: string,
    userPrompt: string,
    opts: CompletionOptions = {},
  ): Promise<{ content: string; usage?: any }> {
    const resp = await this.client.chat.completions.create({
      model: opts.model || this.defaultModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 150,
      top_p: opts.topP ?? 0.9,
    });

    return {
      content: resp.choices[0]?.message?.content || '',
      usage: resp.usage,
    };
  }
}

let _instance: QwenClient | null = null;

export function getQwenClient(): QwenClient {
  if (!_instance) {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      throw new Error(
        'DASHSCOPE_API_KEY not configured. Add it to cursor-bridge/.env',
      );
    }
    _instance = new QwenClient(apiKey);
  }
  return _instance;
}

export function isQwenConfigured(): boolean {
  return !!process.env.DASHSCOPE_API_KEY;
}
