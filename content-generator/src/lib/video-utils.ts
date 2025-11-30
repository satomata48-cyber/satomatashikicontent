// 動画生成用ユーティリティ関数

export interface Section {
	id: string;
	heading: string;
	headingLevel: number;
	content: string;
	textContent: string; // HTMLタグを除いたテキスト
}

export interface VideoSection extends Section {
	script: string; // 読み上げ用台本
	audioData?: ArrayBuffer;
	audioUrl?: string;
	audioDuration?: number; // 秒
	imageUrl?: string;
}

// HTMLを見出しごとに分割
export function splitHtmlByHeadings(html: string): Section[] {
	// DOMParserでHTMLを解析
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');
	const body = doc.body;

	const sections: Section[] = [];
	let currentSection: Section | null = null;
	let sectionIndex = 0;

	// body内の全要素を走査
	function processNode(node: Node) {
		if (node.nodeType === Node.ELEMENT_NODE) {
			const element = node as Element;
			const tagName = element.tagName.toLowerCase();

			// 見出し要素の場合
			if (/^h[1-6]$/.test(tagName)) {
				// 前のセクションを保存
				if (currentSection) {
					sections.push(currentSection);
				}

				// 新しいセクションを開始
				const level = parseInt(tagName.charAt(1));
				currentSection = {
					id: `section-${sectionIndex++}`,
					heading: element.textContent?.trim() || '',
					headingLevel: level,
					content: '',
					textContent: ''
				};
			} else if (currentSection) {
				// 見出し以外の要素をセクションに追加
				currentSection.content += element.outerHTML;
				currentSection.textContent += (element.textContent?.trim() || '') + '\n';
			} else {
				// 最初の見出しより前のコンテンツ（イントロダクション）
				const textContent = element.textContent?.trim();
				if (textContent) {
					currentSection = {
						id: `section-${sectionIndex++}`,
						heading: 'はじめに',
						headingLevel: 0,
						content: element.outerHTML,
						textContent: textContent + '\n'
					};
				}
			}
		}
	}

	// 直接の子要素を処理
	for (const child of Array.from(body.children)) {
		processNode(child);
	}

	// 最後のセクションを保存
	if (currentSection) {
		sections.push(currentSection);
	}

	// テキストコンテンツをクリーンアップ
	return sections.map(section => ({
		...section,
		textContent: section.textContent.replace(/\n+/g, '\n').trim()
	}));
}

// セクションからテキストを抽出（HTMLタグを除去）
export function extractTextFromHtml(html: string): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');
	return doc.body.textContent?.trim() || '';
}

// 台本生成用のプロンプト
export function createScriptPrompt(sections: Section[]): string {
	const sectionsText = sections.map((s, i) =>
		`## セクション${i + 1}: ${s.heading}\n${s.textContent}`
	).join('\n\n');

	return `以下のブログ記事を、動画ナレーション用の台本に変換してください。

【要件】
- 話し言葉で自然に読み上げられる文章にする
- 「である調」は「です・ます調」に変換
- 専門用語は適切に説明を補足
- 各セクションは30秒〜2分程度で読める長さに
- セクションごとに区切って出力
- 視聴者に語りかけるようなトーンで

【ブログ記事】
${sectionsText}

【出力形式】
以下のJSON形式で出力してください：
\`\`\`json
{
  "sections": [
    {
      "sectionId": "section-0",
      "heading": "見出しのテキスト",
      "script": "読み上げ用の台本テキスト"
    }
  ]
}
\`\`\``;
}

// AI応答から台本を抽出
export function parseScriptResponse(response: string, sections: Section[]): VideoSection[] {
	try {
		// JSON部分を抽出
		const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
		if (jsonMatch) {
			const json = JSON.parse(jsonMatch[1]);
			if (json.sections && Array.isArray(json.sections)) {
				return sections.map((section, index) => {
					const scriptData = json.sections.find(
						(s: { sectionId: string }) => s.sectionId === section.id
					) || json.sections[index];

					return {
						...section,
						script: scriptData?.script || section.textContent
					};
				});
			}
		}
	} catch (e) {
		console.error('台本解析エラー:', e);
	}

	// パース失敗時はそのまま返す
	return sections.map(section => ({
		...section,
		script: section.textContent
	}));
}

// 音声の長さを推定（文字数から）
export function estimateAudioDuration(text: string): number {
	// 日本語: 約5文字/秒（ゆっくりめ）
	const charCount = text.length;
	return Math.ceil(charCount / 5);
}

// 秒を「分:秒」形式に変換
export function formatDuration(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}
