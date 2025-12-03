// HPテンプレート: HTML/Tailwindベースの美しいスライドテンプレート
// サイズ: 1280x720 (スライドと同じ)

export interface HpTemplate {
	id: string;
	name: string;
	description: string;
	category: 'title' | 'content' | 'list' | 'quote' | 'ending';
	// Tailwindクラスで定義
	containerClass: string;
	titleClass: string;
	contentClass: string;
	// 追加のスタイル要素
	decorations?: {
		type: 'gradient-bg' | 'pattern' | 'shapes' | 'border';
		class: string;
	}[];
}

export interface HpSlideData {
	templateId: string;
	title: string;
	content: string[];
	subtitle?: string;
	footer?: string;
}

// プリセットテンプレート（LLMへのスタイルヒントとして使用）
export const HP_TEMPLATES: HpTemplate[] = [
	// ===== タイトルスライド =====
	{
		id: 'title-gradient-blue',
		name: 'グラデーション（ブルー）',
		description: '青紫のグラデーション + SVG波形装飾',
		category: 'title',
		containerClass: 'bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700',
		titleClass: 'text-5xl font-bold text-white text-center drop-shadow-lg',
		contentClass: 'text-2xl text-white/90 text-center mt-4',
	},
	{
		id: 'title-gradient-pink',
		name: 'グラデーション（ピンク）',
		description: 'ピンクオレンジ + SVGサークル装飾',
		category: 'title',
		containerClass: 'bg-gradient-to-br from-pink-500 via-rose-500 to-orange-400',
		titleClass: 'text-5xl font-bold text-white text-center drop-shadow-lg',
		contentClass: 'text-2xl text-white/90 text-center mt-4',
	},
	{
		id: 'title-dark',
		name: 'ダークモード',
		description: 'シックなダーク + SVGグロー効果',
		category: 'title',
		containerClass: 'bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900',
		titleClass: 'text-5xl font-bold text-white text-center',
		contentClass: 'text-2xl text-gray-300 text-center mt-4',
		decorations: [
			{ type: 'shapes', class: 'absolute top-10 left-10 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl' },
			{ type: 'shapes', class: 'absolute bottom-10 right-10 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl' },
		]
	},
	{
		id: 'title-minimal-white',
		name: 'ミニマル（白）',
		description: 'クリーンな白 + SVGラインアクセント',
		category: 'title',
		containerClass: 'bg-white',
		titleClass: 'text-5xl font-bold text-gray-800 text-center',
		contentClass: 'text-2xl text-gray-500 text-center mt-4',
		decorations: [
			{ type: 'border', class: 'absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500' }
		]
	},
	{
		id: 'title-tech',
		name: 'テックスタイル',
		description: 'サイバー風 + SVGグリッド・回路模様',
		category: 'title',
		containerClass: 'bg-gradient-to-br from-slate-900 via-cyan-900 to-slate-900',
		titleClass: 'text-5xl font-bold text-cyan-400 text-center font-mono',
		contentClass: 'text-2xl text-cyan-200/80 text-center mt-4',
	},

	// ===== コンテンツスライド（リスト） =====
	{
		id: 'list-card-white',
		name: 'カード（白背景）',
		description: 'カードUI + SVGチェックアイコン',
		category: 'list',
		containerClass: 'bg-gradient-to-br from-slate-100 to-slate-200',
		titleClass: 'text-3xl font-bold text-gray-800 px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-xl',
		contentClass: 'text-xl text-gray-700 px-8 py-6 bg-white rounded-b-xl shadow-xl',
	},
	{
		id: 'list-modern-dark',
		name: 'モダンダーク',
		description: 'ダーク + SVGアローアイコン',
		category: 'list',
		containerClass: 'bg-gradient-to-br from-gray-900 to-slate-800',
		titleClass: 'text-3xl font-bold text-white mb-6 border-l-4 border-cyan-400 pl-4',
		contentClass: 'text-xl text-gray-200',
	},
	{
		id: 'list-glassmorphism',
		name: 'グラスモーフィズム',
		description: 'ガラス効果 + SVGスター装飾',
		category: 'list',
		containerClass: 'bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400',
		titleClass: 'text-3xl font-bold text-white mb-6',
		contentClass: 'text-xl text-white bg-white/20 backdrop-blur-md rounded-2xl p-6',
	},
	{
		id: 'list-satomata',
		name: 'Satomataスタイル',
		description: '青×ピンク + SVGロゴ風装飾',
		category: 'list',
		containerClass: 'bg-gradient-to-br from-sky-50 to-pink-50',
		titleClass: 'text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-pink-500 mb-6',
		contentClass: 'text-xl text-gray-700',
		decorations: [
			{ type: 'shapes', class: 'absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-400/30 to-transparent rounded-full -translate-y-1/2 translate-x-1/2' },
			{ type: 'shapes', class: 'absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-pink-400/30 to-transparent rounded-full translate-y-1/2 -translate-x-1/2' },
		]
	},
	{
		id: 'list-neo-brutalism',
		name: 'ネオブルータリズム',
		description: '太い境界線 + SVGジオメトリック',
		category: 'list',
		containerClass: 'bg-yellow-300',
		titleClass: 'text-3xl font-black text-black mb-6 border-b-4 border-black pb-2',
		contentClass: 'text-xl text-black font-medium',
	},
	{
		id: 'list-nature',
		name: 'ナチュラル',
		description: '自然な緑 + SVG葉っぱアイコン',
		category: 'list',
		containerClass: 'bg-gradient-to-br from-emerald-50 to-green-100',
		titleClass: 'text-3xl font-bold text-emerald-800 mb-6',
		contentClass: 'text-xl text-emerald-700',
	},

	// ===== 引用スライド =====
	{
		id: 'quote-elegant',
		name: 'エレガント引用',
		description: 'SVG大型引用符 + セリフ体',
		category: 'quote',
		containerClass: 'bg-gradient-to-br from-amber-50 to-orange-50',
		titleClass: 'text-6xl text-amber-300 font-serif',
		contentClass: 'text-2xl text-gray-700 italic leading-relaxed',
	},
	{
		id: 'quote-minimal',
		name: 'ミニマル引用',
		description: 'シンプル + SVG細線装飾',
		category: 'quote',
		containerClass: 'bg-white',
		titleClass: 'text-6xl text-gray-200 font-serif',
		contentClass: 'text-2xl text-gray-800 leading-relaxed',
	},

	// ===== エンディングスライド =====
	{
		id: 'ending-thankyou',
		name: 'Thank You',
		description: 'グラデーション + SVGスパークル',
		category: 'ending',
		containerClass: 'bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500',
		titleClass: 'text-6xl font-bold text-white text-center drop-shadow-lg',
		contentClass: 'text-2xl text-white/80 text-center mt-6',
	},
	{
		id: 'ending-subscribe',
		name: 'チャンネル登録',
		description: 'CTA + SVGベル・再生アイコン',
		category: 'ending',
		containerClass: 'bg-gradient-to-br from-red-600 via-red-500 to-orange-500',
		titleClass: 'text-5xl font-bold text-white text-center drop-shadow-lg',
		contentClass: 'text-xl text-white/90 text-center mt-4',
	},
];

// カテゴリ別にテンプレートを取得
export function getTemplatesByCategory(category: HpTemplate['category']): HpTemplate[] {
	return HP_TEMPLATES.filter(t => t.category === category);
}

// IDでテンプレートを取得
export function getTemplateById(id: string): HpTemplate | undefined {
	return HP_TEMPLATES.find(t => t.id === id);
}

// デフォルトテンプレートID
export const DEFAULT_HP_TEMPLATE_ID = 'list-satomata';
