// キャンバスベースのスライドテンプレート

import { browser } from '$app/environment';
import type { SlideData, SlidePresentation, SlideTheme } from './slideCanvasTypes';
import { generateElementId, generateSlideId } from './slideCanvasTypes';

// LocalStorageキー
const CUSTOM_TEMPLATES_KEY = 'slide-custom-templates';

// テンプレート定義
export interface SlideTemplate {
	id: string;
	name: string;
	description: string;
	preview: string;
	theme: SlideTheme;
	slides: SlideData[];
	isCustom?: boolean;
}

// 白紙テーマ
const blankTheme: SlideTheme = {
	primaryColor: '#000000',
	accentColor: '#666666',
	backgroundColor: '#ffffff',
	textColor: '#000000',
	fontFamily: 'Hiragino Sans, Noto Sans JP, sans-serif'
};

// ブルーテーマ
const blueTheme: SlideTheme = {
	primaryColor: '#1e40af',
	accentColor: '#3b82f6',
	backgroundColor: '#ffffff',
	textColor: '#1f2937',
	fontFamily: 'Hiragino Sans, Noto Sans JP, sans-serif'
};

// グリーンテーマ
const greenTheme: SlideTheme = {
	primaryColor: '#166534',
	accentColor: '#22c55e',
	backgroundColor: '#ffffff',
	textColor: '#1f2937',
	fontFamily: 'Hiragino Sans, Noto Sans JP, sans-serif'
};

// レッドテーマ
const redTheme: SlideTheme = {
	primaryColor: '#991b1b',
	accentColor: '#ef4444',
	backgroundColor: '#ffffff',
	textColor: '#1f2937',
	fontFamily: 'Hiragino Sans, Noto Sans JP, sans-serif'
};

// パープルテーマ
const purpleTheme: SlideTheme = {
	primaryColor: '#6b21a8',
	accentColor: '#a855f7',
	backgroundColor: '#ffffff',
	textColor: '#1f2937',
	fontFamily: 'Hiragino Sans, Noto Sans JP, sans-serif'
};

// オレンジテーマ
const orangeTheme: SlideTheme = {
	primaryColor: '#c2410c',
	accentColor: '#f97316',
	backgroundColor: '#ffffff',
	textColor: '#1f2937',
	fontFamily: 'Hiragino Sans, Noto Sans JP, sans-serif'
};

// ダークテーマ
const darkTheme: SlideTheme = {
	primaryColor: '#1f2937',
	accentColor: '#6b7280',
	backgroundColor: '#111827',
	textColor: '#f9fafb',
	fontFamily: 'Hiragino Sans, Noto Sans JP, sans-serif'
};

// 白紙スライド生成関数
function createBlankSlides(): SlideData[] {
	return [
		{
			id: generateSlideId(),
			name: 'スライド 1',
			backgroundColor: '#ffffff',
			elements: []
		}
	];
}

// 標準スライド生成関数
function createStandardSlides(theme: SlideTheme): SlideData[] {
	return [
		// タイトルスライド
		{
			id: generateSlideId(),
			name: 'タイトルスライド',
			backgroundColor: theme.backgroundColor,
			elements: [
				// 上部ライン
				{
					id: generateElementId(),
					type: 'rect',
					x: 0,
					y: 0,
					width: 1280,
					height: 8,
					fill: theme.primaryColor
				},
				// メインタイトル
				{
					id: generateElementId(),
					type: 'text',
					x: 640,
					y: 300,
					text: 'プレゼンテーションタイトル',
					fontSize: 64,
					fontFamily: theme.fontFamily,
					fontStyle: 'bold',
					fill: theme.textColor,
					align: 'center'
				},
				// サブタイトル
				{
					id: generateElementId(),
					type: 'text',
					x: 640,
					y: 420,
					text: 'サブタイトル',
					fontSize: 32,
					fontFamily: theme.fontFamily,
					fill: theme.primaryColor,
					align: 'center'
				},
				// 日付・発表者
				{
					id: generateElementId(),
					type: 'text',
					x: 640,
					y: 600,
					text: '発表者名',
					fontSize: 24,
					fontFamily: theme.fontFamily,
					fill: theme.textColor,
					align: 'center'
				}
			]
		},
		// コンテンツスライド
		{
			id: generateSlideId(),
			name: 'コンテンツスライド',
			backgroundColor: theme.backgroundColor,
			elements: [
				// ヘッダー背景
				{
					id: generateElementId(),
					type: 'rect',
					x: 0,
					y: 0,
					width: 1280,
					height: 100,
					fill: theme.primaryColor
				},
				// ヘッダーテキスト（中央揃え）
				{
					id: generateElementId(),
					type: 'text',
					x: 640,
					y: 60,
					text: '見出し',
					fontSize: 36,
					fontFamily: theme.fontFamily,
					fontStyle: 'bold',
					fill: '#ffffff',
					align: 'center'
				},
				// 本文
				{
					id: generateElementId(),
					type: 'text',
					x: 100,
					y: 160,
					text: '本文を入力してください',
					fontSize: 26,
					fontFamily: theme.fontFamily,
					fill: theme.textColor,
					align: 'left'
				}
			]
		}
	];
}

// さとまた式テーマ
const satomataTheme: SlideTheme = {
	primaryColor: '#3F51B5',      // インディゴ（ヘッダー・タイトル・本文）
	accentColor: '#E91E63',       // ピンク（サブタイトル）
	backgroundColor: '#ffffff',
	textColor: '#3F51B5',         // インディゴ
	fontFamily: '"Noto Sans JP", sans-serif'
};

// さとまた式スライド生成関数
function createSatomataSlides(): SlideData[] {
	return [
		// タイトルスライド
		{
			id: generateSlideId(),
			name: 'タイトルスライド',
			backgroundColor: '#ffffff',
			elements: [
				// 外枠（ストローク付きの透明な四角形）
				{
					id: generateElementId(),
					type: 'rect',
					x: 0,
					y: 0,
					width: 1280,
					height: 720,
					fill: 'transparent',
					stroke: '#3F51B5',
					strokeWidth: 20
				},
				// メインタイトル（中央配置・大きめ）
				{
					id: generateElementId(),
					type: 'text',
					x: 640,
					y: 285,
					text: 'タイトル',
					fontSize: 150,
					fontFamily: '"Noto Sans JP", sans-serif',
					fontStyle: 'bold',
					fill: '#3F51B5',
					align: 'center'
				},
				// サブタイトル（ピンク）
				{
					id: generateElementId(),
					type: 'text',
					x: 640,
					y: 454,
					text: 'サブタイトル',
					fontSize: 32,
					fontFamily: '"Noto Sans JP", sans-serif',
					fontStyle: 'normal',
					fill: '#E91E63',
					align: 'center'
				}
			]
		},
		// コンテンツスライド
		{
			id: generateSlideId(),
			name: 'コンテンツスライド',
			backgroundColor: '#ffffff',
			elements: [
				// ヘッダーバー（高さ200px）
				{
					id: generateElementId(),
					type: 'rect',
					x: 0,
					y: 0,
					width: 1280,
					height: 200,
					fill: '#3F51B5'
				},
				// ヘッダータイトル（中央・白色）
				{
					id: generateElementId(),
					type: 'text',
					x: 640,
					y: 73,
					text: '見出し',
					fontSize: 56,
					fontFamily: '"Noto Sans JP", sans-serif',
					fontStyle: 'bold',
					fill: '#ffffff',
					align: 'center'
				},
				// 本文（左寄せ・インディゴ）
				{
					id: generateElementId(),
					type: 'text',
					x: 100,
					y: 270,
					text: '本文',
					fontSize: 56,
					fontFamily: '"Noto Sans JP", sans-serif',
					fontStyle: 'bold',
					fill: '#3F51B5',
					align: 'left'
				}
			]
		}
	];
}

// エクスポート用テンプレート一覧
export const SLIDE_TEMPLATES: SlideTemplate[] = [
	{
		id: 'satomata',
		name: 'さとまた式',
		description: 'インディゴ×ピンクのプロフェッショナルデザイン',
		preview: 'linear-gradient(135deg, #3F51B5 0%, #E91E63 100%)',
		theme: satomataTheme,
		slides: createSatomataSlides()
	},
	{
		id: 'blank',
		name: '白紙',
		description: '何も配置されていない白紙スライド',
		preview: 'linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%)',
		theme: blankTheme,
		slides: createBlankSlides()
	},
	{
		id: 'blue',
		name: 'ブルー',
		description: 'スタンダードな青系デザイン',
		preview: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
		theme: blueTheme,
		slides: createStandardSlides(blueTheme)
	},
	{
		id: 'green',
		name: 'グリーン',
		description: '落ち着いた緑系デザイン',
		preview: 'linear-gradient(135deg, #166534 0%, #22c55e 100%)',
		theme: greenTheme,
		slides: createStandardSlides(greenTheme)
	},
	{
		id: 'red',
		name: 'レッド',
		description: 'インパクトのある赤系デザイン',
		preview: 'linear-gradient(135deg, #991b1b 0%, #ef4444 100%)',
		theme: redTheme,
		slides: createStandardSlides(redTheme)
	},
	{
		id: 'purple',
		name: 'パープル',
		description: 'エレガントな紫系デザイン',
		preview: 'linear-gradient(135deg, #6b21a8 0%, #a855f7 100%)',
		theme: purpleTheme,
		slides: createStandardSlides(purpleTheme)
	},
	{
		id: 'orange',
		name: 'オレンジ',
		description: '明るいオレンジ系デザイン',
		preview: 'linear-gradient(135deg, #c2410c 0%, #f97316 100%)',
		theme: orangeTheme,
		slides: createStandardSlides(orangeTheme)
	},
	{
		id: 'dark',
		name: 'ダーク',
		description: 'シックなダークデザイン',
		preview: 'linear-gradient(135deg, #1f2937 0%, #374151 100%)',
		theme: darkTheme,
		slides: createStandardSlides(darkTheme)
	}
];

// テンプレートからプレゼンテーションを作成
export function createPresentationFromTemplate(templateId: string, title: string): SlidePresentation {
	const allTemplates = getAllTemplates();
	const template = allTemplates.find(t => t.id === templateId);

	if (!template) {
		const defaultTemplate = SLIDE_TEMPLATES[0];
		return {
			id: crypto.randomUUID(),
			title,
			slides: JSON.parse(JSON.stringify(defaultTemplate.slides)),
			theme: defaultTemplate.theme,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};
	}

	return {
		id: crypto.randomUUID(),
		title,
		slides: JSON.parse(JSON.stringify(template.slides)),
		theme: template.theme,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString()
	};
}

// テンプレートIDからテーマを取得
export function getTemplateTheme(templateId: string): SlideTheme {
	const template = SLIDE_TEMPLATES.find(t => t.id === templateId);
	return template?.theme || blueTheme;
}

// 空のスライドを作成
export function createEmptySlide(templateId: string, slideNumber: number): SlideData {
	const template = getAllTemplates().find(t => t.id === templateId);
	const theme = template?.theme || blueTheme;

	return {
		id: generateSlideId(),
		name: `スライド ${slideNumber}`,
		backgroundColor: theme.backgroundColor,
		elements: [
			// ヘッダー背景
			{
				id: generateElementId(),
				type: 'rect' as const,
				x: 0,
				y: 0,
				width: 1280,
				height: 100,
				fill: theme.primaryColor
			},
			// ヘッダーテキスト
			{
				id: generateElementId(),
				type: 'text' as const,
				x: 60,
				y: 60,
				text: '見出し',
				fontSize: 42,
				fontFamily: theme.fontFamily,
				fontStyle: 'bold' as const,
				fill: '#ffffff',
				align: 'left' as const
			}
		]
	};
}

// カスタムテンプレート管理
export function loadCustomTemplates(): SlideTemplate[] {
	if (!browser) return [];
	try {
		const data = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
		if (!data) return [];
		return JSON.parse(data);
	} catch {
		return [];
	}
}

export function saveCustomTemplates(templates: SlideTemplate[]): void {
	if (!browser) return;
	try {
		localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates));
	} catch (e) {
		console.error('Failed to save custom templates:', e);
	}
}

export function getAllTemplates(): SlideTemplate[] {
	const customTemplates = loadCustomTemplates();
	const combined = [...SLIDE_TEMPLATES];
	for (const custom of customTemplates) {
		const existingIndex = combined.findIndex(t => t.id === custom.id);
		if (existingIndex >= 0) {
			combined[existingIndex] = custom;
		} else {
			combined.push(custom);
		}
	}
	return combined;
}

export function saveTemplate(template: SlideTemplate): void {
	const customTemplates = loadCustomTemplates();
	const existingIndex = customTemplates.findIndex(t => t.id === template.id);
	if (existingIndex >= 0) {
		customTemplates[existingIndex] = template;
	} else {
		customTemplates.push(template);
	}
	saveCustomTemplates(customTemplates);
}

export function deleteTemplate(templateId: string): boolean {
	const customTemplates = loadCustomTemplates();
	const filtered = customTemplates.filter(t => t.id !== templateId);
	saveCustomTemplates(filtered);
	return true;
}

// すべてのカスタムテンプレートをクリア
export function clearAllCustomTemplates(): void {
	if (!browser) return;
	try {
		localStorage.removeItem(CUSTOM_TEMPLATES_KEY);
	} catch (e) {
		console.error('Failed to clear custom templates:', e);
	}
}

export function savePresentationAsTemplate(
	presentation: SlidePresentation,
	templateName: string,
	templateDescription: string
): SlideTemplate {
	const template: SlideTemplate = {
		id: `custom-${Date.now()}`,
		name: templateName,
		description: templateDescription,
		preview: `linear-gradient(135deg, ${presentation.theme.backgroundColor} 0%, ${presentation.theme.primaryColor}33 100%)`,
		theme: { ...presentation.theme },
		slides: JSON.parse(JSON.stringify(presentation.slides)),
		isCustom: true
	};
	saveTemplate(template);
	return template;
}
