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
		id: 'simple',
		name: 'シンプル',
		description: '基本的なスタイル',
		preview: 'linear-gradient(135deg, #f5f5f5, #e0e0e0)',
		styles: {
			fontFamily: "'Hiragino Sans', 'Noto Sans JP', sans-serif",
			fontSize: '16px',
			lineHeight: '1.8',
			h1Style: 'font-size: 32px; font-weight: bold; color: #333; margin: 40px 0 20px 0; padding-bottom: 10px; border-bottom: 2px solid #333;',
			h2Style: 'font-size: 24px; font-weight: bold; color: #444; margin: 30px 0 15px 0;',
			h3Style: 'font-size: 20px; font-weight: bold; color: #555; margin: 25px 0 10px 0;',
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
			h1Style: 'font-size: 28px; font-weight: bold; color: #1e3a5f; margin: 50px 0 25px 0; padding: 15px; background: linear-gradient(90deg, #1e3a5f, transparent); color: #fff; border-radius: 4px;',
			h2Style: 'font-size: 22px; font-weight: bold; color: #2c5282; margin: 35px 0 18px 0; padding-left: 15px; border-left: 4px solid #2c5282;',
			h3Style: 'font-size: 18px; font-weight: bold; color: #3182ce; margin: 28px 0 12px 0;',
			pStyle: 'margin: 18px 0; text-align: justify; text-indent: 1em;',
			containerStyle: 'max-width: 750px; margin: 0 auto; padding: 50px; background: #fafafa;'
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
			h1Style: 'font-size: 30px; font-weight: 700; color: #0ea5e9; margin: 45px 0 22px 0; padding-bottom: 12px; border-bottom: 3px solid #0ea5e9;',
			h2Style: 'font-size: 24px; font-weight: 600; color: #38bdf8; margin: 35px 0 16px 0; padding: 8px 12px; background: #f0f9ff; border-radius: 4px;',
			h3Style: 'font-size: 19px; font-weight: 600; color: #0284c7; margin: 28px 0 12px 0;',
			pStyle: 'margin: 16px 0; line-height: 1.8;',
			containerStyle: 'max-width: 850px; margin: 0 auto; padding: 45px; background: #fff; font-feature-settings: "palt";'
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
			h1Style: 'font-size: 26px; font-weight: normal; color: #92400e; margin: 50px 0 30px 0; text-align: center; letter-spacing: 0.1em;',
			h2Style: 'font-size: 20px; font-weight: normal; color: #b45309; margin: 40px 0 20px 0; padding: 10px 0; border-top: 1px solid #d97706; border-bottom: 1px solid #d97706; text-align: center;',
			h3Style: 'font-size: 18px; font-weight: normal; color: #d97706; margin: 30px 0 15px 0;',
			pStyle: 'margin: 20px 0; text-indent: 1em; text-align: justify;',
			containerStyle: 'max-width: 700px; margin: 0 auto; padding: 60px 50px; background: #fffbeb;'
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
			h1Style: 'font-size: 24px; font-weight: normal; color: #1f2937; margin: 60px 0 40px 0; text-align: center; letter-spacing: 0.2em;',
			h2Style: 'font-size: 18px; font-weight: normal; color: #374151; margin: 50px 0 30px 0; text-align: center; letter-spacing: 0.15em;',
			h3Style: 'font-size: 16px; font-weight: normal; color: #4b5563; margin: 40px 0 20px 0; letter-spacing: 0.1em;',
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
			h1Style: 'font-size: 36px; font-weight: 900; color: #fff; margin: 40px 0 25px 0; padding: 20px 25px; background: linear-gradient(135deg, #ec4899, #8b5cf6); border-radius: 8px; text-shadow: 2px 2px 4px rgba(0,0,0,0.2);',
			h2Style: 'font-size: 24px; font-weight: 700; color: #9333ea; margin: 35px 0 18px 0; padding-bottom: 8px; border-bottom: 3px solid #ec4899;',
			h3Style: 'font-size: 18px; font-weight: 600; color: #a855f7; margin: 28px 0 12px 0;',
			pStyle: 'margin: 16px 0;',
			containerStyle: 'max-width: 800px; margin: 0 auto; padding: 40px; background: #fdf4ff;'
		}
	}
];

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
