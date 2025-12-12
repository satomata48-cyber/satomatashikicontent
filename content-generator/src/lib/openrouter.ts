export interface OpenRouterConfig {
	apiKey: string;
	model: string;
}

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string | MessageContent[];
}

// マルチモーダル用のコンテンツ型
export interface MessageContent {
	type: 'text' | 'image_url';
	text?: string;
	image_url?: { url: string };
}

export interface OpenRouterResponse {
	id: string;
	choices: {
		message: {
			role: string;
			content: string;
			reasoning_content?: string;  // DeepSeek R1
			reasoning_details?: Array<{ type: string; content: string }>;  // DeepSeek V3.2
		};
	}[];
}

// 思考内容を含むレスポンス
export interface ReasoningResponse {
	content: string;
	reasoning?: string;
	reasoning_details?: Array<{ type: string; content: string }>;  // 次回リクエスト用
}

// 画像生成用のレスポンス型
export interface ImageGenerationResponse {
	id: string;
	choices: {
		message: {
			role: string;
			content: string;
			images?: string[]; // Base64エンコードされた画像
		};
	}[];
}

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function generateContent(
	config: OpenRouterConfig,
	messages: ChatMessage[]
): Promise<string> {
	const response = await fetch(OPENROUTER_API_URL, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${config.apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'http://localhost:5173',
			'X-Title': 'AI Content Generator'
		},
		body: JSON.stringify({
			model: config.model,
			messages: messages
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
	}

	const data: OpenRouterResponse = await response.json();
	return data.choices[0]?.message?.content || '';
}

// 会話履歴用のメッセージ型（reasoning_details含む）
export interface ConversationMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
	reasoning_details?: Array<{ type: string; content: string }>;
}

// 思考機能付きコンテンツ生成（DeepSeek V3.2 / V3.2 Speciale用）
export async function generateContentWithReasoning(
	config: OpenRouterConfig,
	messages: ChatMessage[],
	conversationHistory: ConversationMessage[] = []  // reasoning_details付きの履歴
): Promise<ReasoningResponse> {
	// 会話履歴がある場合はそれを使用、なければmessagesから構築
	const apiMessages = conversationHistory.length > 0
		? conversationHistory
		: messages.map(msg => ({
			role: msg.role,
			content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
		}));

	const response = await fetch(OPENROUTER_API_URL, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${config.apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'http://localhost:5173',
			'X-Title': 'AI Content Generator'
		},
		body: JSON.stringify({
			model: config.model,
			messages: apiMessages,
			reasoning: { enabled: true }  // DeepSeek V3.2形式
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
	}

	const data: OpenRouterResponse = await response.json();
	const message = data.choices[0]?.message;

	// reasoning_detailsからテキストを抽出
	let reasoningText: string | undefined;
	if (message?.reasoning_details && message.reasoning_details.length > 0) {
		reasoningText = message.reasoning_details
			.filter(d => d.type === 'thinking')
			.map(d => d.content)
			.join('\n');
	} else if (message?.reasoning_content) {
		// R1形式のフォールバック
		reasoningText = message.reasoning_content;
	}

	return {
		content: message?.content || '',
		reasoning: reasoningText,
		reasoning_details: message?.reasoning_details  // 次回リクエスト用に保存
	};
}

// reasoningモデルかどうか判定
export function isReasoningModel(modelId: string): boolean {
	return modelId.includes('deepseek-v3.2') ||
	       modelId.includes('deepseek-r1') ||
	       modelId.includes('deepseek-reasoner');
}

// ストリーミングコールバック型
export interface StreamCallbacks {
	onReasoning?: (text: string) => void;  // 思考内容の更新
	onContent?: (text: string) => void;    // 回答内容の更新
	onDone?: (result: ReasoningResponse) => void;  // 完了時
}

// ストリーミング付き思考機能（DeepSeek V3.2用）
export async function generateContentWithReasoningStream(
	config: OpenRouterConfig,
	conversationHistory: ConversationMessage[],
	callbacks: StreamCallbacks
): Promise<ReasoningResponse> {
	const response = await fetch(OPENROUTER_API_URL, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${config.apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'http://localhost:5173',
			'X-Title': 'AI Content Generator'
		},
		body: JSON.stringify({
			model: config.model,
			messages: conversationHistory,
			reasoning: { enabled: true },
			stream: true  // ストリーミング有効
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
	}

	const reader = response.body?.getReader();
	if (!reader) throw new Error('No reader available');

	const decoder = new TextDecoder();
	let fullReasoning = '';
	let fullContent = '';
	let reasoning_details: Array<{ type: string; content: string }> = [];

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const chunk = decoder.decode(value, { stream: true });
			const lines = chunk.split('\n');

			for (const line of lines) {
				if (line.startsWith('data: ')) {
					const data = line.slice(6);
					if (data === '[DONE]') continue;

					try {
						const json = JSON.parse(data);
						const delta = json.choices?.[0]?.delta;

						if (delta) {
							// 思考内容（reasoning_content または reasoning）
							if (delta.reasoning_content) {
								fullReasoning += delta.reasoning_content;
								callbacks.onReasoning?.(fullReasoning);
							} else if (delta.reasoning) {
								fullReasoning += delta.reasoning;
								callbacks.onReasoning?.(fullReasoning);
							}

							// 回答内容
							if (delta.content) {
								fullContent += delta.content;
								callbacks.onContent?.(fullContent);
							}
						}
					} catch {
						// JSON parse error - skip
					}
				}
			}
		}
	} finally {
		reader.releaseLock();
	}

	// reasoning_detailsを構築
	if (fullReasoning) {
		reasoning_details = [{ type: 'thinking', content: fullReasoning }];
	}

	const result: ReasoningResponse = {
		content: fullContent,
		reasoning: fullReasoning || undefined,
		reasoning_details: reasoning_details.length > 0 ? reasoning_details : undefined
	};

	callbacks.onDone?.(result);
	return result;
}

// 画像生成用の関数
export async function generateImage(
	config: OpenRouterConfig,
	prompt: string
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
	try {
		const response = await fetch(OPENROUTER_API_URL, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${config.apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': 'http://localhost:5173',
				'X-Title': 'AI Content Generator'
			},
			body: JSON.stringify({
				model: config.model,
				messages: [
					{
						role: 'user',
						content: prompt
					}
				],
				modalities: ['text', 'image'] // 画像生成を有効化
			})
		});

		if (!response.ok) {
			const error = await response.text();
			return { success: false, error: `API error: ${response.status} - ${error}` };
		}

		const data: ImageGenerationResponse = await response.json();
		const message = data.choices[0]?.message;

		// 画像がある場合
		if (message?.images && message.images.length > 0) {
			return { success: true, imageUrl: message.images[0] };
		}

		// 画像がない場合はcontentを返す（エラーメッセージなど）
		return { success: false, error: message?.content || '画像の生成に失敗しました' };
	} catch (e) {
		return { success: false, error: e instanceof Error ? e.message : '不明なエラー' };
	}
}

// 利用可能なテキスト生成モデル
export const AVAILABLE_MODELS = [
	{ id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash' },
	{ id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2 (思考)', reasoning: true },
	{ id: 'deepseek/deepseek-v3.2-speciale', name: 'DeepSeek V3.2 Special (思考)', reasoning: true },
	{ id: 'moonshotai/kimi-k2', name: 'Kimi K2' },
];

// スライド生成用モデル（JSON出力が得意なモデル）- 全て$3/1M以下
export const SLIDE_GENERATION_MODELS = [
	{
		id: 'google/gemini-2.0-flash-001',
		name: 'Gemini 2.0 Flash',
		description: '高速・高品質（推奨）',
		costInput: 0.10,
		costOutput: 0.40
	},
	{
		id: 'google/gemini-2.5-flash-preview',
		name: 'Gemini 2.5 Flash',
		description: '最新版・高精度',
		costInput: 0.15,
		costOutput: 0.60
	},
	{
		id: 'deepseek/deepseek-chat',
		name: 'DeepSeek V3',
		description: '最安値・安定',
		costInput: 0.14,
		costOutput: 0.28
	},
	{
		id: 'moonshotai/kimi-k2',
		name: 'Kimi K2',
		description: '無料枠あり',
		costInput: 0,
		costOutput: 0
	},
];

// LLMスライド/HPテンプレート生成用モデル（HTML/Tailwind出力が得意）- 全て$3/1M以下
export const HTML_GENERATION_MODELS = [
	{
		id: 'google/gemini-2.0-flash-001',
		name: 'Gemini 2.0 Flash',
		description: '高速・バランス良（推奨）',
		costInput: 0.10,
		costOutput: 0.40
	},
	{
		id: 'deepseek/deepseek-chat',
		name: 'DeepSeek V3',
		description: '最安値・コード得意',
		costInput: 0.14,
		costOutput: 0.28
	},
	{
		id: 'google/gemini-2.5-flash-preview',
		name: 'Gemini 2.5 Flash',
		description: '高精度・デザイン優秀',
		costInput: 0.15,
		costOutput: 0.60
	},
	{
		id: 'moonshotai/kimi-k2',
		name: 'Kimi K2',
		description: '無料枠あり',
		costInput: 0,
		costOutput: 0
	},
];

// 利用可能な画像生成モデル
export const IMAGE_GENERATION_MODELS = [
	{
		id: 'google/gemini-2.5-flash-image',
		name: 'Gemini 2.5 Flash Image',
		description: '高速・低コスト（推奨）',
		costPerImage: 0.02
	},
];
