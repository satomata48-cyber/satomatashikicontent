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
		};
	}[];
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
	{ id: 'moonshotai/kimi-k2', name: 'Kimi K2' },
	{ id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash' },
	{ id: 'google/gemini-2.5-flash-preview', name: 'Gemini 2.5 Flash' },
	{ id: 'deepseek/deepseek-chat', name: 'DeepSeek V3' },
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
