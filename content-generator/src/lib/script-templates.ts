// 台本生成用プロンプトテンプレート

export interface ScriptTemplate {
	id: string;
	name: string;
	description: string;
	// キャラクター設定
	characterName: string;
	characterPersonality: string; // 性格・キャラクター説明
	speakingStyle: string; // 話し方の特徴
	// 口調設定
	toneStyle: 'polite' | 'casual' | 'formal' | 'custom'; // です・ます / カジュアル / フォーマル / カスタム
	customTone?: string; // カスタム口調の説明
	// 追加指示
	additionalInstructions: string;
	// メタデータ
	isDefault?: boolean;
	createdAt: Date;
	updatedAt: Date;
}

// 口調スタイルの説明
export const TONE_STYLES = {
	polite: {
		name: 'です・ます調',
		description: '丁寧な敬語表現',
		prompt: '「です・ます」調の丁寧な話し方'
	},
	casual: {
		name: 'カジュアル',
		description: '親しみやすいフランクな表現',
		prompt: '親しみやすいカジュアルな話し方。「〜だよ」「〜だね」などを使用'
	},
	formal: {
		name: 'フォーマル',
		description: '硬めのビジネス調',
		prompt: '硬めのフォーマルな話し方。専門的で落ち着いた印象'
	},
	custom: {
		name: 'カスタム',
		description: '自由に設定',
		prompt: ''
	}
};

// デフォルトテンプレート
export const DEFAULT_TEMPLATES: ScriptTemplate[] = [
	{
		id: 'default-narrator',
		name: 'スタンダードナレーター',
		description: '標準的なナレーション向け',
		characterName: 'ナレーター',
		characterPersonality: 'プロフェッショナルで落ち着いた雰囲気。視聴者に分かりやすく情報を伝える。',
		speakingStyle: '明瞭で聞き取りやすい。適度な間を置いて話す。',
		toneStyle: 'polite',
		additionalInstructions: '',
		isDefault: true,
		createdAt: new Date(),
		updatedAt: new Date()
	},
	{
		id: 'zundamon',
		name: 'ずんだもん風',
		description: 'ずんだもんのキャラクター設定',
		characterName: 'ずんだもん',
		characterPersonality: '東北地方出身の元気で可愛らしいキャラクター。ずんだ餅が大好き。素直で純粋な性格。',
		speakingStyle: '語尾に「〜のだ」「〜なのだ」を付ける。元気で明るいトーン。',
		toneStyle: 'custom',
		customTone: '語尾は「〜のだ」「〜なのだ」「〜だよ」を使う。可愛らしく元気な話し方。',
		additionalInstructions: '難しい言葉は簡単に言い換える。視聴者に親しみを込めて話しかける。',
		isDefault: true,
		createdAt: new Date(),
		updatedAt: new Date()
	},
	{
		id: 'teacher',
		name: '解説者・先生',
		description: '教育的なコンテンツ向け',
		characterName: '先生',
		characterPersonality: '知識豊富で親切。生徒に分かりやすく教えることが得意。',
		speakingStyle: '丁寧で分かりやすい説明。重要なポイントを強調する。',
		toneStyle: 'polite',
		additionalInstructions: '専門用語は必ず補足説明を入れる。「ポイントは〜」「ここで重要なのは〜」などの表現を使う。',
		isDefault: true,
		createdAt: new Date(),
		updatedAt: new Date()
	},
	{
		id: 'friendly-guide',
		name: 'フレンドリーガイド',
		description: 'カジュアルで親しみやすい解説',
		characterName: 'ガイド',
		characterPersonality: '親しみやすく、友達のように話しかける。',
		speakingStyle: 'フランクで親しみやすい。「〜だよね」「〜しよう！」などを使う。',
		toneStyle: 'casual',
		additionalInstructions: '視聴者を「みんな」「あなた」と呼ぶ。共感を示す表現を多用する。',
		isDefault: true,
		createdAt: new Date(),
		updatedAt: new Date()
	}
];

// LocalStorageキー
const STORAGE_KEY = 'ai-content-generator-script-templates';
const SELECTED_TEMPLATE_KEY = 'ai-content-generator-selected-template';

// テンプレートをLocalStorageから読み込み
export function loadTemplates(): ScriptTemplate[] {
	if (typeof window === 'undefined') return DEFAULT_TEMPLATES;

	try {
		const data = localStorage.getItem(STORAGE_KEY);
		if (!data) {
			// 初回はデフォルトテンプレートを保存
			saveTemplates(DEFAULT_TEMPLATES);
			return DEFAULT_TEMPLATES;
		}

		const templates = JSON.parse(data) as ScriptTemplate[];
		// Date型を復元
		return templates.map(t => ({
			...t,
			createdAt: new Date(t.createdAt),
			updatedAt: new Date(t.updatedAt)
		}));
	} catch (e) {
		console.error('Failed to load templates:', e);
		return DEFAULT_TEMPLATES;
	}
}

// テンプレートをLocalStorageに保存
export function saveTemplates(templates: ScriptTemplate[]): void {
	if (typeof window === 'undefined') return;

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
	} catch (e) {
		console.error('Failed to save templates:', e);
	}
}

// 選択中のテンプレートIDを取得
export function getSelectedTemplateId(): string {
	if (typeof window === 'undefined') return 'default-narrator';

	return localStorage.getItem(SELECTED_TEMPLATE_KEY) || 'default-narrator';
}

// 選択中のテンプレートIDを保存
export function setSelectedTemplateId(id: string): void {
	if (typeof window === 'undefined') return;

	localStorage.setItem(SELECTED_TEMPLATE_KEY, id);
}

// テンプレートを追加
export function addTemplate(template: Omit<ScriptTemplate, 'id' | 'createdAt' | 'updatedAt'>): ScriptTemplate {
	const templates = loadTemplates();
	const newTemplate: ScriptTemplate = {
		...template,
		id: crypto.randomUUID(),
		createdAt: new Date(),
		updatedAt: new Date()
	};

	templates.push(newTemplate);
	saveTemplates(templates);
	return newTemplate;
}

// テンプレートを更新
export function updateTemplate(id: string, updates: Partial<ScriptTemplate>): void {
	const templates = loadTemplates();
	const index = templates.findIndex(t => t.id === id);

	if (index !== -1) {
		templates[index] = {
			...templates[index],
			...updates,
			updatedAt: new Date()
		};
		saveTemplates(templates);
	}
}

// テンプレートを削除
export function deleteTemplate(id: string): void {
	const templates = loadTemplates();
	const filtered = templates.filter(t => t.id !== id);
	saveTemplates(filtered);
}

// テンプレートからプロンプトを生成
export function generatePromptFromTemplate(template: ScriptTemplate): string {
	const toneDescription = template.toneStyle === 'custom'
		? template.customTone
		: TONE_STYLES[template.toneStyle].prompt;

	let prompt = `あなたは「${template.characterName}」として台本を作成します。

【キャラクター設定】
${template.characterPersonality}

【話し方】
${template.speakingStyle}

【口調】
${toneDescription}`;

	if (template.additionalInstructions) {
		prompt += `

【追加指示】
${template.additionalInstructions}`;
	}

	return prompt;
}

// 台本生成用の完全なシステムプロンプトを生成
export function createScriptSystemPrompt(template: ScriptTemplate): string {
	const characterPrompt = generatePromptFromTemplate(template);

	return `${characterPrompt}

【役割】
ブログ記事を動画ナレーション用の台本に変換してください。

【変換ルール】
- 自然に読み上げられる話し言葉に変換
- 各セクションは30秒〜2分程度で読める長さに調整
- 視聴者に語りかけるようなトーンで
- キャラクター設定を維持しながら、内容を分かりやすく伝える`;
}
