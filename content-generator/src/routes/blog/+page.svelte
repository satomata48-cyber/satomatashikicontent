<script lang="ts">
	import { goto } from '$app/navigation';
	import { SYSTEM_API_KEY, type ContentType } from '$lib/stores';
	import { generateContent, generateContentWithReasoningStream, isReasoningModel, type OpenRouterConfig, type ChatMessage as OpenRouterChatMessage, type ConversationMessage, type ReasoningResponse } from '$lib/openrouter';
	import { saveHtmlFile, loadHtmlFile, getContentTypeFolder, isTauri, selectFolder, getLastDirectoryHandle } from '$lib/filesystem';

	const contentType: ContentType = 'blog';

	// API設定
	const apiKey = SYSTEM_API_KEY;

	// 利用可能なモデル
	const availableModels = [
		{ id: 'deepseek/deepseek-v3.2-speciale', name: 'DeepSeek V3.2 Special', description: '思考・高性能' },
		{ id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', description: '思考表示' },
		{ id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', description: '高速・推奨' },
		{ id: 'moonshotai/kimi-k2', name: 'Kimi K2', description: '無料枠あり' },
	];

	let selectedModel = $state('deepseek/deepseek-v3.2-speciale');

	// コンテンツタイトル（ユーザーが入力可能）
	let contentTitle = $state('');
	let isGenerating = $state(false);
	let isImproving = $state(false);
	let isSaving = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');

	// チャット履歴（reasoning対応）
	type ChatMessage = {
		role: 'user' | 'assistant';
		content: string;
		reasoning?: string;
		reasoning_details?: Array<{ type: string; content: string }>;
	};
	let chatMessages = $state<ChatMessage[]>([]);
	let userInput = $state('');

	// ストリーミング状態
	let streamingReasoning = $state('');
	let streamingContent = $state('');

	// 生成されたHTML（編集可能）
	let generatedHtml = $state('');
	let htmlEditor: HTMLTextAreaElement | null = $state(null);
	let visualEditor: HTMLDivElement | null = $state(null);
	let currentFileName = $state('');

	// フォルダ選択状態
	let hasFolderSelected = $state(false);

	$effect(() => {
		// 初期化時にフォルダ選択状態を確認
		hasFolderSelected = !!getLastDirectoryHandle();
	});

	// エディタモード: 'code' | 'visual'
	let editorMode = $state<'code' | 'visual'>('code');

	// 選択テキストとAI改善
	let selectedText = $state('');
	let selectionStart = $state(0);
	let selectionEnd = $state(0);
	let showImproveMenu = $state(false);
	let improvePrompt = $state('');

	// 改善オプション
	const improveOptions = [
		{ label: 'もっとキャッチーに', prompt: 'この部分をもっとキャッチーで魅力的な表現に改善してください' },
		{ label: 'より詳しく', prompt: 'この部分をより詳細に説明を追加して改善してください' },
		{ label: '簡潔に', prompt: 'この部分をより簡潔でわかりやすく改善してください' },
		{ label: 'SEO最適化', prompt: 'この部分をSEOを意識した表現に改善してください' },
		{ label: 'トーンを変更', prompt: 'この部分をよりプロフェッショナルなトーンに改善してください' }
	];

	// ブログ生成設定（フォーム入力用）
	let blogTitle = $state('');
	let headingCount = $state(5);
	let contentLength = $state(300);
	let blogTone = $state('カジュアル');
	const toneOptions = ['カジュアル', 'フォーマル', '専門的', '親しみやすい'];
	const headingOptions = [3, 5, 7, 10, 15];
	const lengthOptions = [100, 200, 300, 400, 500];

	// セクション管理（ebook風）
	type Section = {
		level: number;  // 1 = h1, 2 = h2
		title: string;
		content: string;
		startIndex: number;
		endIndex: number;
	};
	let sections = $state<Section[]>([]);
	let selectedSectionIndices = $state<number[]>([]);
	let loadedContext = $state<'none' | 'all' | 'selected'>('none');
	let loadedContentHash = $state('');

	// HTMLからセクションを抽出
	function parseSectionsFromHtml(html: string): Section[] {
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		const result: Section[] = [];

		// h1, h2を順番に取得
		const headings = doc.querySelectorAll('h1, h2');

		headings.forEach((heading, index) => {
			const level = heading.tagName === 'H1' ? 1 : 2;
			const title = heading.textContent?.trim() || '';

			// 次の見出しまでのコンテンツを取得
			let content = '';
			let sibling = heading.nextElementSibling;
			while (sibling && !['H1', 'H2'].includes(sibling.tagName)) {
				content += sibling.textContent?.trim() + '\n';
				sibling = sibling.nextElementSibling;
			}

			// HTML内の位置を特定
			const headingHtml = heading.outerHTML;
			const startIndex = html.indexOf(headingHtml);
			let endIndex = html.length;

			if (index < headings.length - 1) {
				const nextHeading = headings[index + 1];
				endIndex = html.indexOf(nextHeading.outerHTML);
			}

			result.push({
				level,
				title,
				content: content.trim(),
				startIndex,
				endIndex
			});
		});

		return result;
	}

	// HTMLが変更されたらセクションを再解析
	$effect(() => {
		if (generatedHtml) {
			sections = parseSectionsFromHtml(generatedHtml);
		} else {
			sections = [];
		}
	});

	// セクション選択のトグル
	function toggleSectionSelection(index: number) {
		if (selectedSectionIndices.includes(index)) {
			selectedSectionIndices = selectedSectionIndices.filter(i => i !== index);
		} else {
			selectedSectionIndices = [...selectedSectionIndices, index];
		}
		// 選択が変わったら読み込み状態をリセット
		loadedContext = 'none';
		loadedContentHash = '';
	}

	// コンテンツハッシュ生成（重複防止用）
	function getContentHash(content: string): string {
		return `${content.length}-${content.substring(0, 50)}`;
	}

	// 全体読み込み
	function loadAllContent() {
		if (sections.length === 0) return;

		const fullContent = sections.map(s =>
			`${'#'.repeat(s.level)} ${s.title}\n${s.content}`
		).join('\n\n');

		const hash = 'all:' + getContentHash(fullContent);
		if (loadedContext === 'all' && loadedContentHash === hash) {
			return; // 既に読み込み済み
		}

		const contextMessage = `【現在のブログ全体】\n${fullContent}`;
		chatMessages = [...chatMessages, { role: 'user', content: contextMessage }];
		loadedContext = 'all';
		loadedContentHash = hash;
		selectedSectionIndices = [];
	}

	// 選択セクション読み込み
	function loadSelectedContent() {
		if (selectedSectionIndices.length === 0) return;

		const selectedSections = selectedSectionIndices
			.sort((a, b) => a - b)
			.map(i => sections[i]);

		const selectedContent = selectedSections.map(s =>
			`${'#'.repeat(s.level)} ${s.title}\n${s.content}`
		).join('\n\n');

		const hash = 'selected:' + selectedSectionIndices.join(',') + ':' + getContentHash(selectedContent);
		if (loadedContext === 'selected' && loadedContentHash === hash) {
			return;
		}

		const sectionNames = selectedSections.map(s => s.title).join('、');
		const contextMessage = `【選択セクション: ${sectionNames}】\n${selectedContent}`;
		chatMessages = [...chatMessages, { role: 'user', content: contextMessage }];
		loadedContext = 'selected';
		loadedContentHash = hash;
	}

	// 読み込み状態リセット
	function resetLoadedContext() {
		loadedContext = 'none';
		loadedContentHash = '';
		selectedSectionIndices = [];
	}

	// AIの回答からセクション修正を適用
	function applyModifications(aiResponse: string): number {
		// マークダウン形式の見出しを検出
		const headingPattern = /^(#{1,2})\s+(.+)$/gm;
		let match;
		let modifiedCount = 0;

		// AIレスポンスから見出しとコンテンツを抽出
		const responseLines = aiResponse.split('\n');
		let currentHeading = '';
		let currentContent: string[] = [];
		const modifications: { title: string; content: string }[] = [];

		for (const line of responseLines) {
			const headingMatch = line.match(/^#{1,2}\s+(.+)$/);
			if (headingMatch) {
				// 前の見出しの内容を保存
				if (currentHeading) {
					modifications.push({
						title: currentHeading,
						content: currentContent.join('\n').trim()
					});
				}
				currentHeading = headingMatch[1].trim();
				currentContent = [];
			} else if (currentHeading) {
				currentContent.push(line);
			}
		}
		// 最後の見出しの内容を保存
		if (currentHeading) {
			modifications.push({
				title: currentHeading,
				content: currentContent.join('\n').trim()
			});
		}

		// HTMLを更新
		let updatedHtml = generatedHtml;
		const parser = new DOMParser();
		const doc = parser.parseFromString(updatedHtml, 'text/html');

		for (const mod of modifications) {
			// タイトルで一致するセクションを探す
			const headings = doc.querySelectorAll('h1, h2');
			for (const heading of headings) {
				if (heading.textContent?.trim() === mod.title) {
					// 次の見出しまでの内容を置換
					let sibling = heading.nextElementSibling;
					const toRemove: Element[] = [];

					while (sibling && !['H1', 'H2'].includes(sibling.tagName)) {
						toRemove.push(sibling);
						sibling = sibling.nextElementSibling;
					}

					// 古い要素を削除
					toRemove.forEach(el => el.remove());

					// 新しい内容を追加
					const paragraphs = mod.content.split('\n').filter(p => p.trim());
					let insertPoint = heading;
					for (const p of paragraphs) {
						const newP = doc.createElement('p');
						newP.textContent = p;
						// 元のスタイルを継承（簡易版）
						newP.style.cssText = 'margin: 15px 0; line-height: 1.8;';
						insertPoint.after(newP);
						insertPoint = newP;
					}

					modifiedCount++;
					break;
				}
			}
		}

		if (modifiedCount > 0) {
			generatedHtml = doc.body.innerHTML;
		}

		return modifiedCount;
	}

	// ビジュアルエディタからHTMLを同期
	function syncFromVisualEditor() {
		if (visualEditor) {
			generatedHtml = visualEditor.innerHTML;
		}
	}

	// システムプロンプトを動的に生成
	function getSystemPrompt(): string {
		// 修正モードの場合
		if (loadedContext !== 'none') {
			return `あなたはプロのブログライターです。ユーザーが読み込んだコンテンツを修正します。

【修正モード】
ユーザーが「現在のブログ全体」または「選択セクション」を読み込みました。
ユーザーの指示に従って、該当セクションの本文を修正してください。

【重要な出力形式】
修正後の内容は、必ず以下の形式で出力してください：
- 見出しは # または ## で始める（元の見出しをそのまま使用）
- 見出しの下に修正後の本文を記載
- 複数セクション修正する場合は、それぞれの見出しと本文を順番に出力

例：
## 見出し名
修正後の本文をここに記載...

## 次の見出し名
修正後の本文をここに記載...

【絶対ルール】
- HTMLタグは絶対に使用禁止
- 見出し名は元のまま維持（変更しない）
- 指示された修正のみ行い、余計な変更はしない
- コードブロック（\`\`\`）は使わない`;
		}

		// 通常モード（相談・質問対応）
		return `あなたはプロのブログライターのアシスタントです。
ユーザーの質問や相談に簡潔に回答してください。

【絶対ルール】
- HTMLタグは使用禁止
- 簡潔に回答（長文不要）
- 質問されたことだけに答える`;
	}

	// チャットでの相談
	async function sendMessage() {
		if (!userInput.trim() || isGenerating) return;

		const userMessage = userInput.trim();
		userInput = '';

		// 修正モードかどうかを記録
		const isModificationMode = loadedContext !== 'none';

		chatMessages = [...chatMessages, { role: 'user', content: userMessage }];

		try {
			isGenerating = true;
			errorMessage = '';

			const config: OpenRouterConfig = { apiKey, model: selectedModel };
			const currentSystemPrompt = getSystemPrompt();

			let result = '';
			let reasoning: string | undefined;
			let reasoning_details: Array<{ type: string; content: string }> | undefined;

			// reasoning modelの場合はストリーミング
			if (isReasoningModel(selectedModel)) {
				// ストリーミング状態をリセット
				streamingReasoning = '';
				streamingContent = '';

				// 会話履歴を構築
				const conversationHistory: ConversationMessage[] = [
					{ role: 'system', content: currentSystemPrompt }
				];

				// 過去のメッセージを追加（reasoning_details含む）
				for (const msg of chatMessages) {
					const historyMsg: ConversationMessage = {
						role: msg.role,
						content: msg.content
					};
					if (msg.reasoning_details) {
						historyMsg.reasoning_details = msg.reasoning_details;
					}
					conversationHistory.push(historyMsg);
				}

				const response = await generateContentWithReasoningStream(
					config,
					conversationHistory,
					{
						onReasoning: (text) => { streamingReasoning = text; },
						onContent: (text) => { streamingContent = text; }
					}
				);

				// ストリーミング完了後
				streamingReasoning = '';
				streamingContent = '';

				result = response.content;
				reasoning = response.reasoning;
				reasoning_details = response.reasoning_details;
			} else {
				// 通常モデル
				const messages: OpenRouterChatMessage[] = [
					{ role: 'system', content: currentSystemPrompt },
					...chatMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
				];

				result = await generateContent(config, messages);
			}

			// 修正モードの場合、AIの回答をHTMLに適用
			if (isModificationMode && generatedHtml) {
				const modifiedCount = applyModifications(result);
				if (modifiedCount > 0) {
					result = `✅ ${modifiedCount}件のセクションを修正しました。\n\n` + result;
					// 修正後は読み込み状態をリセット
					resetLoadedContext();
				}
			}

			chatMessages = [...chatMessages, {
				role: 'assistant',
				content: result,
				reasoning,
				reasoning_details
			}];
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '生成に失敗しました';
			streamingReasoning = '';
			streamingContent = '';
		} finally {
			isGenerating = false;
		}
	}

	// フォームから直接ブログHTMLを生成
	async function generateBlogFromForm() {
		if (!blogTitle.trim() || isGenerating) return;

		try {
			isGenerating = true;
			errorMessage = '';
			streamingReasoning = '';
			streamingContent = '';

			const config: OpenRouterConfig = { apiKey, model: selectedModel };

			const prompt = `以下の仕様でブログ記事のHTMLを生成してください。

【仕様】
- タイトル: ${blogTitle}
- 見出し数: ${headingCount}個
- 各セクションの本文: 約${contentLength}文字
- トーン: ${blogTone}

【HTML要件】
- 有効なHTML形式で出力
- CSSはインラインスタイルで含める
- モダンで読みやすいデザイン（余白、フォントサイズ、行間を適切に）
- h1にタイトル、h2に各見出しを使用
- コードブロック(\`\`\`)は使わず、直接HTMLを出力
- 各見出しの本文は必ず${contentLength}文字程度で書く

HTMLのみを出力してください。`;

			const messages: OpenRouterChatMessage[] = [
				{
					role: 'system',
					content: 'あなたはプロのWebコンテンツ制作者です。指示された仕様通りにHTMLブログ記事を生成してください。'
				},
				{ role: 'user', content: prompt }
			];

			// ストリーミング対応（reasoning modelの場合）
			if (isReasoningModel(selectedModel)) {
				const conversationHistory: ConversationMessage[] = [
					{ role: 'system', content: 'あなたはプロのWebコンテンツ制作者です。指示された仕様通りにHTMLブログ記事を生成してください。' },
					{ role: 'user', content: prompt }
				];

				const response = await generateContentWithReasoningStream(
					config,
					conversationHistory,
					{
						onReasoning: (text) => { streamingReasoning = text; },
						onContent: (text) => { streamingContent = text; }
					}
				);

				streamingReasoning = '';
				streamingContent = '';
				generatedHtml = extractHtml(response.content);
			} else {
				const result = await generateContent(config, messages);
				generatedHtml = extractHtml(result);
			}

			// タイトルを設定
			contentTitle = blogTitle;

			chatMessages = [...chatMessages, {
				role: 'assistant',
				content: `✅ 「${blogTitle}」のブログを生成しました。\n見出し: ${headingCount}個 / 各セクション: 約${contentLength}文字 / トーン: ${blogTone}`
			}];
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '生成に失敗しました';
			streamingReasoning = '';
			streamingContent = '';
		} finally {
			isGenerating = false;
		}
	}

	// チャット内容からHTMLを生成
	async function generateHtmlFromChat() {
		if (chatMessages.length === 0 || isGenerating) return;

		try {
			isGenerating = true;
			errorMessage = '';

			const config: OpenRouterConfig = { apiKey, model: selectedModel };

			const conversationSummary = chatMessages
				.map(m => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.content}`)
				.join('\n\n');

			const messages: OpenRouterChatMessage[] = [
				{
					role: 'system',
					content: `あなたはプロのWebコンテンツ制作者です。
以下の会話で決まった内容を元に、完成度の高いHTMLブログ記事を生成してください。

【重要】会話で決まった仕様を必ず守ってください：
- 見出しの数: 会話で合意した数を正確に
- 各セクションの文字数: 会話で合意した文字数を各見出しの本文で必ず守る
- トーン・スタイル: 会話で決まったスタイルに合わせる

【HTML要件】
- 有効なHTML形式で出力
- CSSはインラインスタイルで含める
- モダンで読みやすいデザイン（余白、フォントサイズ、行間を適切に）
- レスポンシブ対応
- コードブロック(\`\`\`)は使わず、直接HTMLを出力
- 見出しはh1（タイトル）、h2（各セクション）を使用`
				},
				{
					role: 'user',
					content: `以下の会話で決まった構成・仕様に従って、ブログ記事の完全なHTMLを生成してください。
各セクションの本文は、会話で決めた文字数を必ず守ってください。

【会話内容】
${conversationSummary}`
				}
			];

			const result = await generateContent(config, messages);
			generatedHtml = extractHtml(result);

			chatMessages = [...chatMessages, { role: 'assistant', content: '✅ HTMLを生成しました。HTMLカラムで確認・編集できます。' }];
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'HTML生成に失敗しました';
		} finally {
			isGenerating = false;
		}
	}

	function extractHtml(content: string): string {
		const codeBlockMatch = content.match(/```html\s*([\s\S]*?)\s*```/i);
		if (codeBlockMatch) {
			return codeBlockMatch[1].trim();
		}
		if (content.includes('<') && content.includes('>')) {
			return content.trim();
		}
		return `<div style="font-family: sans-serif; line-height: 1.6; padding: 20px;">
			<div style="white-space: pre-wrap;">${content}</div>
		</div>`;
	}

	// HTMLエディタでのテキスト選択を検知
	function handleTextSelection() {
		if (!htmlEditor) return;

		const start = htmlEditor.selectionStart;
		const end = htmlEditor.selectionEnd;

		if (start !== end) {
			selectedText = generatedHtml.substring(start, end);
			selectionStart = start;
			selectionEnd = end;
			showImproveMenu = true;
		} else {
			showImproveMenu = false;
			selectedText = '';
		}
	}

	// 選択部分をAIで改善
	async function improveSelection(prompt: string) {
		if (!selectedText || isImproving) return;

		try {
			isImproving = true;
			errorMessage = '';

			const config: OpenRouterConfig = { apiKey, model: selectedModel };

			const messages: OpenRouterChatMessage[] = [
				{
					role: 'system',
					content: `あなたはHTMLコンテンツの編集者です。
指定された部分のみを改善してください。
HTMLタグ構造は維持し、テキスト内容やスタイルを改善してください。
改善後のHTMLのみを出力し、説明は不要です。`
				},
				{
					role: 'user',
					content: `以下のHTML部分を改善してください。

【改善指示】
${prompt}

【対象のHTML】
${selectedText}

改善後のHTMLのみを出力してください。`
				}
			];

			const result = await generateContent(config, messages);
			const improvedText = extractHtml(result);

			generatedHtml = generatedHtml.substring(0, selectionStart) + improvedText + generatedHtml.substring(selectionEnd);

			showImproveMenu = false;
			selectedText = '';

			chatMessages = [...chatMessages, { role: 'assistant', content: `✏️ 選択部分を改善しました: "${prompt}"` }];
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '改善に失敗しました';
		} finally {
			isImproving = false;
		}
	}

	async function improveWithCustomPrompt() {
		if (!improvePrompt.trim()) return;
		await improveSelection(improvePrompt);
		improvePrompt = '';
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	// HTMLファイルとして保存
	async function saveHtml() {
		if (!generatedHtml) {
			errorMessage = '保存するHTMLがありません。先にHTMLを生成してください。';
			return;
		}

		// ビジュアルモードの場合は先に同期
		if (editorMode === 'visual') {
			syncFromVisualEditor();
		}

		isSaving = true;
		errorMessage = '';
		successMessage = '';

		try {
			// フォルダハンドルがない場合は、フォルダ選択ダイアログを表示
			if (!getLastDirectoryHandle()) {
				const folderResult = await selectFolder();
				if (!folderResult.success) {
					if (folderResult.error !== 'キャンセルされました') {
						errorMessage = folderResult.error || '保存先フォルダを選択してください';
					} else {
						errorMessage = 'フォルダ選択がキャンセルされました。';
					}
					isSaving = false;
					return;
				}
				hasFolderSelected = true;
			}

			// タイトルを取得: 入力値 > HTMLから抽出 > チャットから > 無題
			const title = contentTitle.trim() || extractTitleFromHtml(generatedHtml) || chatMessages.find(m => m.role === 'user')?.content.substring(0, 30) || '無題';
			const folderPath = getContentTypeFolder(contentType);

			const result = await saveHtmlFile(folderPath, title, generatedHtml, contentType);

			if (result.success) {
				currentFileName = result.filePath?.split(/[/\\]/).pop() || '';
				successMessage = `✅ 保存しました: ${currentFileName}`;
				chatMessages = [...chatMessages, { role: 'assistant', content: successMessage }];
			} else {
				errorMessage = result.error || '保存に失敗しました';
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '保存に失敗しました';
		} finally {
			isSaving = false;
		}
	}

	// 外部ファイルを読み込み
	async function loadFromFile() {
		errorMessage = '';

		const result = await loadHtmlFile('');

		if (result.success && result.content) {
			generatedHtml = result.content;
			if (result.fileName) {
				currentFileName = result.fileName;
			}
			chatMessages = [...chatMessages, { role: 'assistant', content: `📂 「${result.fileName || 'ファイル'}」を読み込みました。編集できます。` }];
		} else if (result.error && result.error !== 'キャンセルされました') {
			errorMessage = result.error;
		}
	}

	function clearHtml() {
		generatedHtml = '';
		currentFileName = '';
		showImproveMenu = false;
		selectedText = '';
	}

	function clearAll() {
		chatMessages = [];
		generatedHtml = '';
		errorMessage = '';
		successMessage = '';
		showImproveMenu = false;
		selectedText = '';
		currentFileName = '';
		contentTitle = '';
	}

	function goBack() {
		goto('/');
	}

	// HTMLからタイトルを抽出
	function extractTitleFromHtml(html: string): string {
		const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
		if (titleMatch && titleMatch[1].trim()) {
			return titleMatch[1].trim().substring(0, 50);
		}
		const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
		if (h1Match && h1Match[1].trim()) {
			return h1Match[1].trim().substring(0, 50);
		}
		return '';
	}
</script>

<div class="h-screen flex flex-col bg-gray-900 text-white">
	<!-- Header -->
	<header class="bg-gray-800 border-b border-gray-700 px-4 py-3 flex-shrink-0">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3">
				<button onclick={goBack} class="text-gray-400 hover:text-white p-1">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
					</svg>
				</button>
				<span class="px-2 py-1 rounded text-xs font-medium bg-blue-500">
					ブログ
				</span>
				<h1 class="text-lg font-semibold">ブログ記事作成</h1>
			</div>
			<div class="flex items-center gap-3">
				{#if isTauri()}
					<span class="text-xs text-purple-400">Tauri</span>
				{/if}
				<!-- フォルダ選択状態 -->
				<button
					onclick={async () => {
						const result = await selectFolder();
						if (result.success) {
							hasFolderSelected = true;
							successMessage = `📁 ${result.path} を選択しました`;
						}
					}}
					class="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors {hasFolderSelected ? 'bg-green-600/20 border border-green-500 text-green-400' : 'bg-yellow-600/20 border border-yellow-500 text-yellow-400 hover:bg-yellow-600/30'}"
				>
					<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
					</svg>
					{#if hasFolderSelected}
						{getLastDirectoryHandle()?.name || 'フォルダ選択済み'}
					{:else}
						フォルダを選択
					{/if}
				</button>
				<div class="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 border border-green-500 rounded">
					<svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
					</svg>
					<span class="text-green-400 text-xs font-medium">API接続済み</span>
				</div>
			</div>
		</div>
	</header>

	<!-- Main 3-Column Layout -->
	<main class="flex-1 flex overflow-hidden">
		<!-- Column 1: Chat -->
		<div class="w-1/3 flex flex-col border-r border-gray-700">
			<div class="px-4 py-2 bg-gray-800 border-b border-gray-700">
				<div class="flex items-center justify-between">
					<h2 class="text-sm font-semibold text-gray-300">{generatedHtml ? 'チャット - 修正・相談' : 'ブログ作成'}</h2>
					<button onclick={clearAll} class="text-xs text-gray-500 hover:text-gray-300">全てクリア</button>
				</div>
				<!-- モデル選択 -->
				<div class="mt-2 flex items-center gap-2">
					<span class="text-xs text-gray-500">LLM:</span>
					<select
						bind:value={selectedModel}
						class="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
					>
						{#each availableModels as model}
							<option value={model.id}>{model.name} - {model.description}</option>
						{/each}
					</select>
				</div>
			</div>

			<!-- Chat Messages -->
			<div class="flex-1 overflow-y-auto p-4 space-y-3">
				{#if chatMessages.length === 0 && !generatedHtml}
					<!-- ブログ生成フォーム -->
					<div class="space-y-4">
						<div class="text-center text-gray-400 mb-4">
							<p class="text-sm font-medium">ブログを作成</p>
							<p class="text-xs text-gray-500">設定を入力して「作成」ボタンをクリック</p>
						</div>

						<!-- タイトル -->
						<div>
							<label class="block text-xs text-gray-400 mb-1">タイトル・テーマ</label>
							<input
								type="text"
								bind:value={blogTitle}
								placeholder="例: 男性と女性の恋愛の違い"
								class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
							/>
						</div>

						<!-- 見出し数 -->
						<div>
							<label class="block text-xs text-gray-400 mb-1">見出し数</label>
							<div class="flex gap-1">
								{#each headingOptions as count}
									<button
										onclick={() => headingCount = count}
										class="flex-1 py-2 rounded text-sm transition-colors {headingCount === count ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}"
									>
										{count}個
									</button>
								{/each}
							</div>
						</div>

						<!-- 本文文字数 -->
						<div>
							<label class="block text-xs text-gray-400 mb-1">各セクションの文字数</label>
							<div class="flex gap-1">
								{#each lengthOptions as len}
									<button
										onclick={() => contentLength = len}
										class="flex-1 py-2 rounded text-sm transition-colors {contentLength === len ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}"
									>
										{len}字
									</button>
								{/each}
							</div>
						</div>

						<!-- トーン -->
						<div>
							<label class="block text-xs text-gray-400 mb-1">トーン・スタイル</label>
							<div class="flex gap-1">
								{#each toneOptions as tone}
									<button
										onclick={() => blogTone = tone}
										class="flex-1 py-2 rounded text-xs transition-colors {blogTone === tone ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}"
									>
										{tone}
									</button>
								{/each}
							</div>
						</div>

						<!-- 生成ボタン -->
						<button
							onclick={generateBlogFromForm}
							disabled={!blogTitle.trim() || isGenerating}
							class="w-full py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 {blogTitle.trim() ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}"
						>
							{#if isGenerating}
								<span class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
								生成中...
							{:else}
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
								</svg>
								ブログを作成
							{/if}
						</button>

						<!-- ストリーミング表示 -->
						{#if isGenerating && (streamingReasoning || streamingContent)}
							<div class="mt-2 p-3 bg-gray-800 rounded-lg border border-gray-700">
								{#if streamingReasoning}
									<div class="text-xs text-yellow-400/70 mb-1">💭 思考中 ({streamingReasoning.length.toLocaleString()}文字)</div>
									<div class="text-[10px] text-yellow-200/60 max-h-20 overflow-y-auto whitespace-pre-wrap">
										{streamingReasoning.length > 300 ? '...' + streamingReasoning.slice(-300) : streamingReasoning}
									</div>
								{/if}
								{#if streamingContent}
									<div class="text-xs text-gray-400 mb-1 mt-2">📝 生成中 ({streamingContent.length.toLocaleString()}文字)</div>
									<div class="text-[10px] text-gray-300 max-h-20 overflow-y-auto whitespace-pre-wrap">
										{streamingContent.length > 200 ? streamingContent.slice(0, 200) + '...' : streamingContent}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{:else}
					{#each chatMessages as message, i (i)}
						<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
							<div class="max-w-[90%] rounded-lg px-3 py-2 text-sm {message.role === 'user' ? 'bg-blue-600' : 'bg-gray-700'}">
								{#if message.reasoning}
									<details class="mb-2">
										<summary class="text-xs text-yellow-400/70 cursor-pointer hover:text-yellow-400">
											💭 思考過程 ({message.reasoning.length.toLocaleString()}文字)
										</summary>
										<div class="mt-1 p-2 bg-yellow-900/20 border border-yellow-800/30 rounded text-[10px] text-yellow-200/60 max-h-32 overflow-y-auto whitespace-pre-wrap">
											{message.reasoning}
										</div>
									</details>
								{/if}
								<div class="whitespace-pre-wrap break-words">{message.content}</div>
							</div>
						</div>
					{/each}
					{#if isGenerating}
						<div class="flex justify-start">
							<div class="bg-gray-700 rounded-lg px-2.5 py-1.5 flex flex-col gap-1 text-xs max-w-[90%]">
								<div class="flex items-center gap-2">
									<span class="animate-spin w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full flex-shrink-0"></span>
									{#if streamingContent}
										📝 回答生成中...
									{:else if streamingReasoning}
										💭 思考中...
									{:else if isReasoningModel(selectedModel)}
										💭 思考開始...
									{:else}
										生成中...
									{/if}
								</div>
								{#if streamingReasoning}
									<div class="mt-1 p-2 bg-yellow-900/30 border border-yellow-800/50 rounded text-[10px] text-yellow-200/80 max-h-32 overflow-y-auto whitespace-pre-wrap">
										<div class="text-yellow-400/70 mb-1">💭 思考中 ({streamingReasoning.length.toLocaleString()}文字)</div>
										{streamingReasoning.length > 500 ? '...' + streamingReasoning.slice(-500) : streamingReasoning}
									</div>
								{/if}
								{#if streamingContent}
									<div class="mt-1 p-2 bg-gray-800 border border-gray-600 rounded text-[10px] text-gray-300 max-h-24 overflow-y-auto whitespace-pre-wrap">
										<div class="text-gray-400 mb-1">📝 回答 ({streamingContent.length.toLocaleString()}文字)</div>
										{streamingContent.length > 300 ? streamingContent.slice(0, 300) + '...' : streamingContent}
									</div>
								{/if}
							</div>
						</div>
					{/if}
				{/if}
			</div>

			<!-- Error/Success Message -->
			{#if errorMessage}
				<div class="px-4 py-2 bg-red-900/30 border-t border-red-500/30">
					<p class="text-xs text-red-400">{errorMessage}</p>
				</div>
			{/if}
			{#if successMessage}
				<div class="px-4 py-2 bg-green-900/30 border-t border-green-500/30">
					<p class="text-xs text-green-400">{successMessage}</p>
				</div>
			{/if}

			<!-- Input Area -->
			<div class="p-3 bg-gray-800 border-t border-gray-700 space-y-2">
				{#if chatMessages.length > 0 && !generatedHtml}
					<button
						onclick={generateHtmlFromChat}
						disabled={isGenerating}
						class="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 py-2 rounded-lg text-sm font-medium transition-colors"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
						</svg>
						この内容でHTML生成
					</button>
				{/if}

				<!-- コンテンツ読み込みボタン（HTMLがある場合） -->
				{#if sections.length > 0}
					<div class="flex gap-1">
						<button
							onclick={loadAllContent}
							disabled={isGenerating || (loadedContext === 'all')}
							class="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium transition-colors {loadedContext === 'all' ? 'bg-green-600/30 text-green-400 border border-green-500' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}"
						>
							{#if loadedContext === 'all'}✓{/if} 全体読込
						</button>
						<button
							onclick={loadSelectedContent}
							disabled={isGenerating || selectedSectionIndices.length === 0 || (loadedContext === 'selected')}
							class="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium transition-colors {loadedContext === 'selected' ? 'bg-green-600/30 text-green-400 border border-green-500' : selectedSectionIndices.length > 0 ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-700 text-gray-500'}"
						>
							{#if loadedContext === 'selected'}✓{/if} 選択読込 {#if selectedSectionIndices.length > 0}({selectedSectionIndices.length}){/if}
						</button>
						{#if loadedContext !== 'none'}
							<button
								onclick={resetLoadedContext}
								class="px-2 py-1.5 rounded text-xs bg-gray-700 hover:bg-gray-600 text-gray-400"
								title="リセット"
							>
								↺
							</button>
						{/if}
					</div>
				{/if}

				<div class="flex gap-2">
					<textarea
						bind:value={userInput}
						onkeydown={handleKeyDown}
						placeholder="構成を相談... (Enter で送信)"
						rows="2"
						class="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
					></textarea>
					<button
						onclick={sendMessage}
						disabled={isGenerating || !userInput.trim()}
						class="px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
						</svg>
					</button>
				</div>
			</div>
		</div>

		<!-- Column 2: HTML Editor with Tabs -->
		<div class="w-1/3 flex flex-col border-r border-gray-700 relative">
			<!-- Tab Header -->
			<div class="px-2 py-2 bg-gray-800 border-b border-gray-700">
				<div class="flex items-center justify-between">
					<!-- Tabs -->
					<div class="flex items-center gap-1">
						<button
							onclick={() => { if (editorMode === 'visual') syncFromVisualEditor(); editorMode = 'code'; }}
							class="px-3 py-1.5 text-xs font-medium rounded transition-colors {editorMode === 'code' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'}"
						>
							<span class="flex items-center gap-1">
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
								</svg>
								コード
							</span>
						</button>
						<button
							onclick={() => editorMode = 'visual'}
							class="px-3 py-1.5 text-xs font-medium rounded transition-colors {editorMode === 'visual' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'}"
						>
							<span class="flex items-center gap-1">
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
								</svg>
								ビジュアル
							</span>
						</button>
					</div>

					<!-- Actions -->
					<div class="flex items-center gap-2">
						<button
							onclick={async () => {
								try {
									const text = await navigator.clipboard.readText();
									if (text && (text.includes('<') || text.includes('>'))) {
										generatedHtml = text;
										successMessage = '📋 クリップボードからHTMLを貼り付けました';
										chatMessages = [...chatMessages, { role: 'assistant', content: '📋 HTMLを貼り付けました。編集できます。' }];
									} else {
										errorMessage = 'クリップボードにHTMLが見つかりません';
									}
								} catch (e) {
									errorMessage = 'クリップボードへのアクセスが拒否されました';
								}
							}}
							class="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
							title="クリップボードからHTMLを貼り付け"
						>
							<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
							</svg>
							貼付
						</button>
						<button onclick={loadFromFile} class="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
							<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
							</svg>
							読込
						</button>
						{#if generatedHtml}
							<button
								onclick={() => navigator.clipboard.writeText(generatedHtml)}
								class="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
							>
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
								</svg>
								コピー
							</button>
							<button onclick={clearHtml} class="text-xs text-gray-500 hover:text-red-400 flex items-center gap-1">
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
								</svg>
								クリア
							</button>
						{/if}
					</div>
				</div>
				{#if currentFileName}
					<div class="mt-1 text-xs text-gray-500 truncate">{currentFileName}</div>
				{/if}
				<!-- タイトル入力 -->
				<div class="mt-2">
					<input
						type="text"
						bind:value={contentTitle}
						placeholder="コンテンツタイトルを入力（保存時に使用）"
						class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500"
					/>
				</div>
			</div>

			<!-- セクション一覧（TOC） -->
			{#if sections.length > 0}
				<div class="px-2 py-2 bg-gray-850 border-b border-gray-700 max-h-40 overflow-y-auto">
					<div class="text-[10px] text-gray-500 mb-1 flex items-center justify-between">
						<span>セクション（クリックで選択）</span>
						{#if selectedSectionIndices.length > 0}
							<button
								onclick={() => selectedSectionIndices = []}
								class="text-gray-500 hover:text-gray-300"
							>
								選択解除
							</button>
						{/if}
					</div>
					<div class="space-y-0.5">
						{#each sections as section, index}
							<button
								onclick={() => toggleSectionSelection(index)}
								class="w-full text-left px-2 py-1 rounded text-xs transition-colors {selectedSectionIndices.includes(index) ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50' : 'hover:bg-gray-700 text-gray-400'}"
								style="padding-left: {section.level === 1 ? '8px' : '20px'}"
							>
								<span class="text-gray-600 mr-1">{section.level === 1 ? '■' : '└'}</span>
								{section.title}
								<span class="text-gray-600 text-[10px] ml-1">({section.content.length}文字)</span>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- AI改善メニュー (コードモード時のみ) -->
			{#if showImproveMenu && selectedText && editorMode === 'code'}
				<div class="absolute top-16 left-4 right-4 z-10 bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-3">
					<div class="text-xs text-gray-400 mb-2">選択部分をAIで改善:</div>
					<div class="flex flex-wrap gap-1 mb-2">
						{#each improveOptions as option}
							<button
								onclick={() => improveSelection(option.prompt)}
								disabled={isImproving}
								class="px-2 py-1 text-xs bg-gray-700 hover:bg-blue-600 rounded transition-colors disabled:opacity-50"
							>
								{option.label}
							</button>
						{/each}
					</div>
					<div class="flex gap-2">
						<input
							type="text"
							bind:value={improvePrompt}
							placeholder="カスタム指示..."
							class="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
						/>
						<button
							onclick={improveWithCustomPrompt}
							disabled={isImproving || !improvePrompt.trim()}
							class="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded transition-colors"
						>
							適用
						</button>
					</div>
					{#if isImproving}
						<div class="mt-2 flex items-center gap-2 text-xs text-gray-400">
							<span class="animate-spin w-3 h-3 border border-gray-400 border-t-transparent rounded-full"></span>
							改善中...
						</div>
					{/if}
				</div>
			{/if}

			<!-- Editor Content -->
			<div class="flex-1 overflow-hidden">
				{#if generatedHtml}
					{#if editorMode === 'code'}
						<!-- コードエディタ -->
						<textarea
							bind:this={htmlEditor}
							bind:value={generatedHtml}
							onmouseup={handleTextSelection}
							onkeyup={handleTextSelection}
							class="w-full h-full p-4 bg-gray-950 text-gray-300 text-xs font-mono resize-none focus:outline-none border-0"
							spellcheck="false"
						></textarea>
					{:else}
						<!-- ビジュアルエディタ -->
						<div
							bind:this={visualEditor}
							contenteditable="true"
							oninput={syncFromVisualEditor}
							class="w-full h-full p-4 bg-white text-gray-900 text-sm overflow-auto focus:outline-none"
							style="min-height: 100%;"
						>
							{@html generatedHtml}
						</div>
					{/if}
				{:else}
					<div class="h-full flex items-center justify-center text-gray-500 bg-gray-950 p-4">
						<div class="text-center max-w-md">
							<svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
							</svg>
							<p class="text-sm mb-4">HTMLコンテンツを作成・編集</p>

							<div class="space-y-2">
								<button
									onclick={async () => {
										try {
											const text = await navigator.clipboard.readText();
											if (text && (text.includes('<') || text.includes('>'))) {
												generatedHtml = text;
												successMessage = '📋 クリップボードからHTMLを貼り付けました';
											} else {
												errorMessage = 'クリップボードにHTMLが見つかりません';
											}
										} catch (e) {
											errorMessage = 'クリップボードへのアクセスが拒否されました';
										}
									}}
									class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm flex items-center justify-center gap-2"
								>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
									</svg>
									クリップボードから貼り付け
								</button>

								<button
									onclick={loadFromFile}
									class="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm flex items-center justify-center gap-2"
								>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
									</svg>
									ファイルを読み込み
								</button>
							</div>

							<p class="text-xs text-gray-600 mt-4">
								または左のチャットで相談してHTMLを生成
							</p>
						</div>
					</div>
				{/if}
			</div>

			{#if generatedHtml && editorMode === 'code'}
				<div class="px-4 py-2 bg-gray-800 border-t border-gray-700 text-xs text-gray-500">
					テキストを選択するとAI改善メニューが表示されます
				</div>
			{/if}
		</div>

		<!-- Column 3: Preview -->
		<div class="w-1/3 flex flex-col">
			<div class="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
				<h2 class="text-sm font-semibold text-gray-300">プレビュー</h2>
				{#if generatedHtml}
					<button
						onclick={saveHtml}
						disabled={isSaving}
						class="flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-3 py-1 rounded text-xs font-medium transition-colors"
					>
						{#if isSaving}
							<span class="animate-spin w-3 h-3 border border-white border-t-transparent rounded-full"></span>
							保存中...
						{:else}
							<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
							</svg>
							HTMLを保存
						{/if}
					</button>
				{/if}
			</div>

			<div class="flex-1 overflow-auto bg-white">
				{#if generatedHtml}
					<iframe
						srcdoc={generatedHtml}
						class="w-full h-full border-0"
						sandbox="allow-same-origin"
						title="HTML Preview"
					></iframe>
				{:else}
					<div class="h-full flex items-center justify-center bg-gray-100">
						<div class="text-center text-gray-400">
							<svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
							</svg>
							<p class="text-sm">プレビューがここに表示されます</p>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</main>
</div>
