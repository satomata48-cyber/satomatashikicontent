export interface OpenRouterConfig {
	apiKey: string;
	model: string;
}

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
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

export const AVAILABLE_MODELS = [
	{ id: 'moonshotai/kimi-k2', name: 'Kimi K2' }
];
