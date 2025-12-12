// 電子書籍テンプレート

export interface EbookTemplate {
	id: string;
	name: string;
	description: string;
	preview: string; // グラデーションやカラー
	styles: {
		fontFamily: string;
		fontSize: string;
		lineHeight: string;
		h1Style: string;
		h2Style: string;
		h3Style: string;
		pStyle: string;
		containerStyle: string;
	};
}

export const EBOOK_TEMPLATES: EbookTemplate[] = [
	{
		id: 'plain',
		name: '無地',
		description: '装飾なしのプレーンスタイル',
		preview: 'linear-gradient(135deg, #fff, #f5f5f5)',
		styles: {
			fontFamily: "'Hiragino Sans', 'Noto Sans JP', sans-serif",
			fontSize: '16px',
			lineHeight: '1.8',
			h1Style: 'font-size: 28px; font-weight: bold; color: {{textColor}}; margin: 30px 0 15px 0;',
			h2Style: 'font-size: 22px; font-weight: bold; color: {{textColor}}; margin: 25px 0 12px 0;',
			h3Style: 'font-size: 18px; font-weight: bold; color: {{primaryColor}}; margin: 20px 0 10px 0;',
			pStyle: 'margin: 12px 0;',
			containerStyle: 'max-width: 800px; margin: 0 auto; padding: 30px; background: #fff;'
		}
	},
	{
		id: 'simple',
		name: 'シンプル',
		description: '基本的なスタイル',
		preview: 'linear-gradient(135deg, #f5f5f5, #e0e0e0)',
		styles: {
			fontFamily: "'Hiragino Sans', 'Noto Sans JP', sans-serif",
			fontSize: '16px',
			lineHeight: '1.8',
			h1Style: 'font-size: 32px; font-weight: bold; color: {{textColor}}; margin: 40px 0 20px 0; padding-bottom: 10px; border-bottom: 2px solid {{primaryColor}};',
			h2Style: 'font-size: 24px; font-weight: bold; color: {{textColor}}; margin: 30px 0 15px 0;',
			h3Style: 'font-size: 20px; font-weight: bold; color: {{primaryColor}}; margin: 25px 0 10px 0;',
			pStyle: 'margin: 15px 0; text-align: justify;',
			containerStyle: 'max-width: 800px; margin: 0 auto; padding: 40px; background: #fff;'
		}
	},
	{
		id: 'business',
		name: 'ビジネス書',
		description: 'プロフェッショナルなスタイル',
		preview: 'linear-gradient(135deg, #1e3a5f, #2c5282)',
		styles: {
			fontFamily: "'Noto Serif JP', 'Hiragino Mincho ProN', serif",
			fontSize: '15px',
			lineHeight: '1.9',
			h1Style: 'font-size: 28px; font-weight: bold; margin: 50px 0 25px 0; padding: 15px; background: linear-gradient(90deg, {{primaryColor}}, transparent); color: #fff; border-radius: 4px;',
			h2Style: 'font-size: 22px; font-weight: bold; color: {{textColor}}; margin: 35px 0 18px 0; padding-left: 15px; border-left: 4px solid {{primaryColor}};',
			h3Style: 'font-size: 18px; font-weight: bold; color: {{primaryColorLight}}; margin: 28px 0 12px 0;',
			pStyle: 'margin: 18px 0; text-align: justify; text-indent: 1em;',
			containerStyle: 'max-width: 750px; margin: 0 auto; padding: 50px; background: {{bgColor}};'
		}
	},
	{
		id: 'tech',
		name: '技術書',
		description: 'モダンな技術書スタイル',
		preview: 'linear-gradient(135deg, #0f172a, #1e293b)',
		styles: {
			fontFamily: "'Source Han Sans', 'Noto Sans JP', monospace",
			fontSize: '15px',
			lineHeight: '1.7',
			h1Style: 'font-size: 30px; font-weight: 700; color: {{primaryColor}}; margin: 45px 0 22px 0; padding-bottom: 12px; border-bottom: 3px solid {{primaryColor}};',
			h2Style: 'font-size: 24px; font-weight: 600; color: {{primaryColorLight}}; margin: 35px 0 16px 0; padding: 8px 12px; background: {{bgColor}}; border-radius: 4px;',
			h3Style: 'font-size: 19px; font-weight: 600; color: {{textColor}}; margin: 28px 0 12px 0;',
			pStyle: 'margin: 16px 0; line-height: 1.8;',
			containerStyle: 'max-width: 850px; margin: 0 auto; padding: 45px; background: #fff; font-feature-settings: "palt";'
		}
	},
	{
		id: 'tech-color',
		name: '技術書カラー',
		description: '本文もテーマカラーで統一',
		preview: 'linear-gradient(135deg, #1e40af, #3b82f6)',
		styles: {
			fontFamily: "'Source Han Sans', 'Noto Sans JP', monospace",
			fontSize: '15px',
			lineHeight: '1.7',
			h1Style: 'font-size: 30px; font-weight: 700; color: {{primaryColor}}; margin: 45px 0 22px 0; padding-bottom: 12px; border-bottom: 3px solid {{primaryColor}};',
			h2Style: 'font-size: 24px; font-weight: 600; color: {{primaryColorLight}}; margin: 35px 0 16px 0; padding: 8px 12px; background: {{bgColor}}; border-radius: 4px;',
			h3Style: 'font-size: 19px; font-weight: 600; color: {{textColor}}; margin: 28px 0 12px 0;',
			pStyle: 'margin: 16px 0; line-height: 1.8; color: {{textColor}};',
			containerStyle: 'max-width: 850px; margin: 0 auto; padding: 45px; background: {{bgColor}}; font-feature-settings: "palt";'
		}
	},
	{
		id: 'essay',
		name: 'エッセイ',
		description: '読みやすいエッセイスタイル',
		preview: 'linear-gradient(135deg, #fef3c7, #fde68a)',
		styles: {
			fontFamily: "'Hiragino Mincho ProN', 'Noto Serif JP', serif",
			fontSize: '17px',
			lineHeight: '2.0',
			h1Style: 'font-size: 26px; font-weight: normal; color: {{textColor}}; margin: 50px 0 30px 0; text-align: center; letter-spacing: 0.1em;',
			h2Style: 'font-size: 20px; font-weight: normal; color: {{primaryColor}}; margin: 40px 0 20px 0; padding: 10px 0; border-top: 1px solid {{primaryColorLight}}; border-bottom: 1px solid {{primaryColorLight}}; text-align: center;',
			h3Style: 'font-size: 18px; font-weight: normal; color: {{primaryColorLight}}; margin: 30px 0 15px 0;',
			pStyle: 'margin: 20px 0; text-indent: 1em; text-align: justify;',
			containerStyle: 'max-width: 700px; margin: 0 auto; padding: 60px 50px; background: {{bgColor}};'
		}
	},
	{
		id: 'novel',
		name: '小説',
		description: '縦書き風の小説スタイル',
		preview: 'linear-gradient(135deg, #f8fafc, #e2e8f0)',
		styles: {
			fontFamily: "'Hiragino Mincho ProN', 'Yu Mincho', serif",
			fontSize: '16px',
			lineHeight: '2.2',
			h1Style: 'font-size: 24px; font-weight: normal; color: {{textColor}}; margin: 60px 0 40px 0; text-align: center; letter-spacing: 0.2em;',
			h2Style: 'font-size: 18px; font-weight: normal; color: {{primaryColor}}; margin: 50px 0 30px 0; text-align: center; letter-spacing: 0.15em;',
			h3Style: 'font-size: 16px; font-weight: normal; color: {{primaryColorLight}}; margin: 40px 0 20px 0; letter-spacing: 0.1em;',
			pStyle: 'margin: 0; text-indent: 1em; margin-bottom: 0.5em;',
			containerStyle: 'max-width: 650px; margin: 0 auto; padding: 70px 60px; background: #fff;'
		}
	},
	{
		id: 'magazine',
		name: 'マガジン',
		description: 'カラフルな雑誌スタイル',
		preview: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
		styles: {
			fontFamily: "'Hiragino Sans', 'Noto Sans JP', sans-serif",
			fontSize: '15px',
			lineHeight: '1.7',
			h1Style: 'font-size: 36px; font-weight: 900; color: #fff; margin: 40px 0 25px 0; padding: 20px 25px; background: linear-gradient(135deg, {{primaryColor}}, {{primaryColorLight}}); border-radius: 8px; text-shadow: 2px 2px 4px rgba(0,0,0,0.2);',
			h2Style: 'font-size: 24px; font-weight: 700; color: {{textColor}}; margin: 35px 0 18px 0; padding-bottom: 8px; border-bottom: 3px solid {{primaryColor}};',
			h3Style: 'font-size: 18px; font-weight: 600; color: {{primaryColorLight}}; margin: 28px 0 12px 0;',
			pStyle: 'margin: 16px 0;',
			containerStyle: 'max-width: 800px; margin: 0 auto; padding: 40px; background: {{bgColor}};'
		}
	},
	{
		id: 'marker',
		name: 'マーカー',
		description: '蛍光ペン風（色はエディタで選択）',
		preview: 'linear-gradient(135deg, #fef9c3, #fef08a)',
		styles: {
			fontFamily: "'Hiragino Sans', 'Noto Sans JP', sans-serif",
			fontSize: '16px',
			lineHeight: '1.8',
			h1Style: 'font-size: 28px; font-weight: bold; color: {{textColor}}; margin: 35px 0 20px 0; padding: 8px 16px; background: linear-gradient(transparent 60%, {{primaryColor}} 60%); display: inline-block;',
			h2Style: 'font-size: 22px; font-weight: bold; color: {{textColor}}; margin: 28px 0 15px 0; padding: 6px 12px; background: linear-gradient(transparent 60%, {{primaryColorLight}} 60%); display: inline-block;',
			h3Style: 'font-size: 18px; font-weight: bold; color: {{textColor}}; margin: 22px 0 12px 0; padding: 4px 10px; background: linear-gradient(transparent 60%, {{bgColor}} 60%); display: inline-block;',
			pStyle: 'margin: 14px 0;',
			containerStyle: 'max-width: 800px; margin: 0 auto; padding: 40px; background: #fff;'
		}
	}
];

// テーマカラー（全テンプレート共通）
export interface ThemeColor {
	id: string;
	name: string;
	primary: string;       // メインカラー（見出し、ボーダー等）
	primaryLight: string;  // 明るめのアクセント
	bg: string;            // 背景色（薄い）
	text: string;          // テキスト色（濃い）
}

export const THEME_COLORS: ThemeColor[] = [
	{ id: 'gray', name: 'グレー', primary: '#4b5563', primaryLight: '#6b7280', bg: '#f3f4f6', text: '#1f2937' },
	{ id: 'blue', name: '青', primary: '#2563eb', primaryLight: '#3b82f6', bg: '#eff6ff', text: '#1e40af' },
	{ id: 'cyan', name: '水色', primary: '#0891b2', primaryLight: '#06b6d4', bg: '#ecfeff', text: '#155e75' },
	{ id: 'green', name: '緑', primary: '#16a34a', primaryLight: '#22c55e', bg: '#f0fdf4', text: '#166534' },
	{ id: 'yellow', name: '黄', primary: '#ca8a04', primaryLight: '#eab308', bg: '#fefce8', text: '#713f12' },
	{ id: 'orange', name: '橙', primary: '#ea580c', primaryLight: '#f97316', bg: '#fff7ed', text: '#9a3412' },
	{ id: 'red', name: '赤', primary: '#dc2626', primaryLight: '#ef4444', bg: '#fef2f2', text: '#991b1b' },
	{ id: 'pink', name: 'ピンク', primary: '#db2777', primaryLight: '#ec4899', bg: '#fdf2f8', text: '#9d174d' },
	{ id: 'purple', name: '紫', primary: '#7c3aed', primaryLight: '#8b5cf6', bg: '#f5f3ff', text: '#5b21b6' },
];

// 後方互換性のためのエイリアス（マーカーテンプレート用に軽い色を追加）
export const MARKER_COLORS = THEME_COLORS.map(c => ({
	id: c.id,
	name: c.name,
	color: c.primaryLight,      // マーカー用は明るい色
	light: c.bg,
	lighter: c.bg,
	text: c.text
}));

// HTMLを生成
export function generateEbookHtml(template: EbookTemplate, title: string, sections: { level: number; text: string; content: string }[]): string {
	const { styles } = template;

	let html = `<div style="${styles.containerStyle} font-family: ${styles.fontFamily}; font-size: ${styles.fontSize}; line-height: ${styles.lineHeight};">`;

	for (const section of sections) {
		if (section.level === 1) {
			html += `<h1 style="${styles.h1Style}">${section.text}</h1>`;
		} else if (section.level === 2) {
			html += `<h2 style="${styles.h2Style}">${section.text}</h2>`;
		} else if (section.level === 3) {
			html += `<h3 style="${styles.h3Style}">${section.text}</h3>`;
		}

		if (section.content) {
			// 段落ごとに分割
			const paragraphs = section.content.split('\n').filter(p => p.trim());
			for (const p of paragraphs) {
				html += `<p style="${styles.pStyle}">${p}</p>`;
			}
		}
	}

	html += '</div>';
	return html;
}

// 空のテンプレートHTMLを生成
export function createEmptyEbook(template: EbookTemplate, title: string = '無題'): string {
	return generateEbookHtml(template, title, [
		{ level: 1, text: title, content: '' },
		{ level: 2, text: '第1章', content: 'ここに本文を入力してください。' }
	]);
}

// テンプレートからスタイルを適用してHTMLを再生成
export function applyTemplateToHtml(template: EbookTemplate, html: string): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');
	const { styles } = template;

	// コンテナを作成または更新
	let container = doc.body.firstElementChild as HTMLElement;
	if (!container || container.tagName !== 'DIV') {
		const newContainer = doc.createElement('div');
		newContainer.innerHTML = doc.body.innerHTML;
		doc.body.innerHTML = '';
		doc.body.appendChild(newContainer);
		container = newContainer;
	}

	container.style.cssText = `${styles.containerStyle} font-family: ${styles.fontFamily}; font-size: ${styles.fontSize}; line-height: ${styles.lineHeight};`;

	// 見出しにスタイルを適用
	doc.querySelectorAll('h1').forEach(el => {
		(el as HTMLElement).style.cssText = styles.h1Style;
	});
	doc.querySelectorAll('h2').forEach(el => {
		(el as HTMLElement).style.cssText = styles.h2Style;
	});
	doc.querySelectorAll('h3').forEach(el => {
		(el as HTMLElement).style.cssText = styles.h3Style;
	});
	doc.querySelectorAll('p').forEach(el => {
		(el as HTMLElement).style.cssText = styles.pStyle;
	});

	return doc.body.innerHTML;
}
