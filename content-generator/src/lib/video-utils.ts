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
	// スライド選択
	selectedSlideId?: string; // 選択されたスライドのID
	slideImageUrl?: string; // スライドを画像化したURL
	visualType: 'ai-image' | 'slide' | 'none'; // ビジュアルタイプ
	// ファイル保存用
	audioFileName?: string; // 保存された音声ファイル名
	imageFileName?: string; // 保存された画像ファイル名
}

// HTMLを見出しごとに分割
export function splitHtmlByHeadings(html: string): Section[] {
	// DOMParserでHTMLを解析
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');
	const body = doc.body;

	const sections: Section[] = [];
	let sectionIndex = 0;

	// すべての見出し要素を取得（ネストされたものも含む）
	const allHeadings = body.querySelectorAll('h1, h2, h3, h4, h5, h6');

	console.log('Found headings:', allHeadings.length, Array.from(allHeadings).map(h => h.textContent));

	// 見出しがない場合は全体を1セクションとして返す
	if (allHeadings.length === 0) {
		const textContent = body.textContent?.trim() || '';
		if (textContent) {
			return [{
				id: 'section-0',
				heading: 'はじめに',
				headingLevel: 0,
				content: body.innerHTML,
				textContent: textContent
			}];
		}
		return [];
	}

	// 見出しの位置情報を収集
	const headingInfos: { element: Element; index: number }[] = [];

	// 全ての要素をフラットに取得し、見出しの位置を特定
	const allElements = body.querySelectorAll('*');
	allElements.forEach((el, idx) => {
		if (/^h[1-6]$/i.test(el.tagName)) {
			headingInfos.push({ element: el, index: idx });
		}
	});

	// 最初の見出しより前のコンテンツを抽出
	if (headingInfos.length > 0) {
		const firstHeading = headingInfos[0].element;
		let introText = '';

		// 最初の見出しの前にあるテキストを収集
		const collectTextBefore = (node: Node, target: Element): string => {
			let text = '';
			const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
			let textNode = walker.nextNode();

			while (textNode) {
				// このテキストノードが見出しより前にあるか確認
				if (target.compareDocumentPosition(textNode) & Node.DOCUMENT_POSITION_FOLLOWING) {
					text += (textNode.textContent || '') + ' ';
				}
				textNode = walker.nextNode();
			}
			return text.trim();
		};

		introText = collectTextBefore(body, firstHeading);

		if (introText && introText.length > 10) {
			sections.push({
				id: `section-${sectionIndex++}`,
				heading: 'はじめに',
				headingLevel: 0,
				content: '',
				textContent: introText
			});
		}
	}

	// 各見出しとその次の見出しまでのコンテンツを抽出
	headingInfos.forEach((info, i) => {
		const heading = info.element;
		const nextHeading = headingInfos[i + 1]?.element || null;
		const level = parseInt(heading.tagName.charAt(1));
		const headingText = heading.textContent?.trim() || '';

		// この見出しから次の見出しまで（または最後まで）のテキストを収集
		let sectionText = '';

		const collectTextBetween = (start: Element, end: Element | null): string => {
			let text = '';
			const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);
			let textNode = walker.nextNode();
			let collecting = false;

			while (textNode) {
				// startの後かどうか
				const isAfterStart = start.compareDocumentPosition(textNode) & Node.DOCUMENT_POSITION_FOLLOWING;
				// endより前かどうか（endがなければtrue）
				const isBeforeEnd = !end || (end.compareDocumentPosition(textNode) & Node.DOCUMENT_POSITION_PRECEDING);

				if (isAfterStart && isBeforeEnd) {
					// この見出し自体のテキストは含めない
					if (!start.contains(textNode)) {
						text += (textNode.textContent || '') + ' ';
					}
				}
				textNode = walker.nextNode();
			}
			return text.trim();
		};

		sectionText = collectTextBetween(heading, nextHeading);

		sections.push({
			id: `section-${sectionIndex++}`,
			heading: headingText,
			headingLevel: level,
			content: '',
			textContent: sectionText
		});
	});

	console.log('Created sections:', sections.length, sections.map(s => `${s.heading}: ${s.textContent.substring(0, 50)}...`));

	// テキストコンテンツをクリーンアップ（空のセクションは除外）
	return sections
		.map(section => ({
			...section,
			textContent: section.textContent.replace(/\s+/g, ' ').trim()
		}))
		.filter(section => section.textContent.length > 0 || section.headingLevel > 0);
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
						script: scriptData?.script || section.textContent,
						visualType: 'none' as const
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
		script: section.textContent,
		visualType: 'none' as const
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

// APIの文字数制限（余裕を持って設定）
const MAX_CHARS_PER_REQUEST = 15000;

// セクションをチャンクに分割（API制限対策）
export function splitSectionsIntoChunks(sections: Section[]): Section[][] {
	const chunks: Section[][] = [];
	let currentChunk: Section[] = [];
	let currentCharCount = 0;

	for (const section of sections) {
		const sectionCharCount = section.textContent.length + section.heading.length;

		// 1つのセクションが制限を超える場合は単独チャンクに
		if (sectionCharCount > MAX_CHARS_PER_REQUEST) {
			if (currentChunk.length > 0) {
				chunks.push(currentChunk);
				currentChunk = [];
				currentCharCount = 0;
			}
			chunks.push([section]);
			continue;
		}

		// 現在のチャンクに追加すると制限を超える場合は新しいチャンクを開始
		if (currentCharCount + sectionCharCount > MAX_CHARS_PER_REQUEST && currentChunk.length > 0) {
			chunks.push(currentChunk);
			currentChunk = [];
			currentCharCount = 0;
		}

		currentChunk.push(section);
		currentCharCount += sectionCharCount;
	}

	// 残りのチャンクを追加
	if (currentChunk.length > 0) {
		chunks.push(currentChunk);
	}

	return chunks;
}

// チャンク用の台本生成プロンプト（バッチ番号付き）
export function createBatchScriptPrompt(sections: Section[], batchNumber: number, totalBatches: number): string {
	const sectionsText = sections.map((s, i) =>
		`## セクション: ${s.id}\n### 見出し: ${s.heading}\n${s.textContent}`
	).join('\n\n');

	let batchInfo = '';
	if (totalBatches > 1) {
		batchInfo = `\n【バッチ情報】\nこれは ${totalBatches} 回に分割された処理の ${batchNumber} 回目です。一貫したトーンを保ってください。\n`;
	}

	return `以下のブログ記事を、動画ナレーション用の台本に変換してください。
${batchInfo}
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

// バッチレスポンスをマージ
export function mergeBatchScriptResponses(
	responses: { sectionId: string; script: string }[],
	originalSections: Section[]
): VideoSection[] {
	return originalSections.map(section => {
		const scriptData = responses.find(r => r.sectionId === section.id);
		return {
			...section,
			script: scriptData?.script || section.textContent,
			visualType: 'none' as const
		};
	});
}

// 単一レスポンスから台本データを抽出
export function extractScriptsFromResponse(response: string): { sectionId: string; script: string }[] {
	try {
		const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
		if (jsonMatch) {
			const json = JSON.parse(jsonMatch[1]);
			if (json.sections && Array.isArray(json.sections)) {
				return json.sections.map((s: { sectionId: string; script: string }) => ({
					sectionId: s.sectionId,
					script: s.script
				}));
			}
		}
	} catch (e) {
		console.error('バッチレスポンス解析エラー:', e);
	}
	return [];
}

// 合計文字数を計算
export function calculateTotalChars(sections: Section[]): number {
	return sections.reduce((sum, s) => sum + s.textContent.length + s.heading.length, 0);
}

// 必要なAPIコール数を推定
export function estimateApiCalls(sections: Section[]): number {
	const chunks = splitSectionsIntoChunks(sections);
	return chunks.length;
}
