<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { SYSTEM_API_KEY } from '$lib/stores';
	import { generateContent, type OpenRouterConfig, type ChatMessage } from '$lib/openrouter';
	import { saveHtmlFile, loadHtmlFile, selectFolder, getLastDirectoryHandle, listHtmlFiles } from '$lib/filesystem';
	import { EBOOK_TEMPLATES, createEmptyEbook, applyTemplateToHtml, type EbookTemplate } from '$lib/ebookTemplates';

	// API設定
	const apiKey = SYSTEM_API_KEY;

	// 利用可能なモデル一覧
	const availableModels = [
		{ id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', description: '高速・推奨', context: 1000000 },
		{ id: 'google/gemini-2.5-flash-preview', name: 'Gemini 2.5 Flash', description: '最新・高性能', context: 1000000 },
		{ id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', description: 'コスパ◎', context: 64000 },
		{ id: 'moonshotai/kimi-k2', name: 'Kimi K2', description: '無料枠あり', context: 131072 },
	];

	let selectedModel = $state('google/gemini-2.0-flash-001');
	let isGenerating = $state(false);
	let isSaving = $state(false);
	let isLoading = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');

	// テンプレート
	let selectedTemplateId = $state('simple');
	let selectedTemplate = $derived(EBOOK_TEMPLATES.find(t => t.id === selectedTemplateId) || EBOOK_TEMPLATES[0]);

	// チャット
	let chatMessages = $state<{ role: 'user' | 'assistant'; content: string }[]>([]);
	let userInput = $state('');

	// HTML
	let generatedHtml = $state('');
	let contentTitle = $state('');
	let currentFileName = $state('');

	// フォルダ内HTMLファイル
	let folderHtmlFiles = $state<{ name: string; content: string }[]>([]);
	let selectedHtmlFileName = $state<string>('');

	// 見出し一覧
	type Heading = { level: number; text: string; id: string };
	let headings = $state<Heading[]>([]);
	let selectedHeadingId = $state<string>('');

	// エディタモード
	let editorMode = $state<'code' | 'visual'>('visual');
	let visualEditor: HTMLDivElement | null = $state(null);
	let lastGeneratedHtml = $state('');

	// ブラウザでの実行確認
	let isBrowser = $state(false);

	// パネル幅（調整可能）
	let chatWidth = $state(320);
	let headingsWidth = $state(208);
	let isResizingChat = $state(false);
	let isResizingHeadings = $state(false);

	// 幅をlocalStorageから復元
	function loadPanelWidths() {
		try {
			const saved = localStorage.getItem('ebook-panel-widths');
			if (saved) {
				const { chat, headings } = JSON.parse(saved);
				if (chat) chatWidth = chat;
				if (headings) headingsWidth = headings;
			}
		} catch (e) {
			console.error('Failed to load panel widths:', e);
		}
	}

	// 幅をlocalStorageに保存
	function savePanelWidths() {
		try {
			localStorage.setItem('ebook-panel-widths', JSON.stringify({
				chat: chatWidth,
				headings: headingsWidth
			}));
		} catch (e) {
			console.error('Failed to save panel widths:', e);
		}
	}

	// リサイズ開始
	function startResizeChat(e: MouseEvent) {
		isResizingChat = true;
		e.preventDefault();
	}

	function startResizeHeadings(e: MouseEvent) {
		isResizingHeadings = true;
		e.preventDefault();
	}

	// リサイズ処理
	function handleMouseMove(e: MouseEvent) {
		if (isResizingChat) {
			const newWidth = Math.max(200, Math.min(500, e.clientX));
			chatWidth = newWidth;
		} else if (isResizingHeadings) {
			const newWidth = Math.max(150, Math.min(400, e.clientX - chatWidth));
			headingsWidth = newWidth;
		}
	}

	// リサイズ終了
	function handleMouseUp() {
		if (isResizingChat || isResizingHeadings) {
			savePanelWidths();
		}
		isResizingChat = false;
		isResizingHeadings = false;
	}

	onMount(async () => {
		isBrowser = true;
		loadPanelWidths();
		await refreshFolderHtmlFiles();
	});

	// HTMLから見出しを抽出
	function extractHeadings(html: string): Heading[] {
		if (!html) return [];
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		const headingElements = doc.querySelectorAll('h1, h2, h3, h4');
		const result: Heading[] = [];
		headingElements.forEach((el, index) => {
			const level = parseInt(el.tagName.substring(1));
			const text = el.textContent?.trim() || '';
			if (text) result.push({ level, text, id: `heading-${index}` });
		});
		return result;
	}

	// HTMLが変わったら見出しを更新
	$effect(() => {
		headings = extractHeadings(generatedHtml);
	});

	// ビジュアルエディタにHTMLを反映
	$effect(() => {
		if (!visualEditor || editorMode !== 'visual') return;
		const isEmpty = visualEditor.innerHTML.length === 0;
		const hasChanged = generatedHtml !== lastGeneratedHtml;
		if (generatedHtml && (isEmpty || hasChanged)) {
			visualEditor.innerHTML = generatedHtml;
			lastGeneratedHtml = generatedHtml;
		}
	});

	// テンプレートを適用
	function applyTemplate(templateId: string) {
		selectedTemplateId = templateId;
		if (generatedHtml) {
			generatedHtml = applyTemplateToHtml(selectedTemplate, generatedHtml);
			if (visualEditor) {
				visualEditor.innerHTML = generatedHtml;
				lastGeneratedHtml = generatedHtml;
			}
			successMessage = `「${selectedTemplate.name}」を適用しました`;
			setTimeout(() => successMessage = '', 2000);
		}
	}

	// 新規作成
	function createNew() {
		const title = contentTitle.trim() || '無題';
		generatedHtml = createEmptyEbook(selectedTemplate, title);
		currentFileName = '';
		selectedHtmlFileName = '';
	}

	// フォルダ内HTMLファイル一覧を取得
	async function refreshFolderHtmlFiles() {
		const result = await listHtmlFiles();
		if (result.success && result.files) {
			folderHtmlFiles = result.files;
		} else {
			folderHtmlFiles = [];
		}
	}

	// フォルダ内HTMLファイルを選択して読み込み
	function loadHtmlFromFolder(fileName: string) {
		selectedHtmlFileName = fileName;
		const file = folderHtmlFiles.find(f => f.name === fileName);
		if (file) {
			generatedHtml = file.content;
			contentTitle = fileName.replace(/\.(html|htm)$/i, '');
			currentFileName = fileName;
			chatMessages = [...chatMessages, { role: 'assistant', content: `「${fileName}」を読み込みました。` }];
		}
	}

	// ビジュアルエディタからHTMLを同期
	function syncFromVisualEditor() {
		if (visualEditor) {
			const html = visualEditor.innerHTML;
			generatedHtml = html;
			lastGeneratedHtml = html;
		}
	}

	// 現在のHTMLをチャットに読み込む（全文）
	let loadedContent = $state(''); // AIに送信する全文を保持

	function loadCodeToChat() {
		if (!generatedHtml) {
			errorMessage = '読み込むコードがありません';
			return;
		}
		const textContent = extractTextContent(generatedHtml);
		const htmlLength = generatedHtml.length;
		loadedContent = textContent; // 全文を保持（AIに送信用）

		// チャット欄にはシンプルなメッセージのみ
		chatMessages = [...chatMessages, {
			role: 'assistant',
			content: `読み込みました\nHTML: ${htmlLength.toLocaleString()}文字 / テキスト: ${textContent.length.toLocaleString()}文字`
		}];
		successMessage = `読み込み完了`;
		setTimeout(() => successMessage = '', 2000);
	}

	// AIで本文を生成（シンプル方式 - 強制上書き）
	async function sendMessage() {
		if (!userInput.trim() || isGenerating) return;

		const userMessage = userInput.trim();
		userInput = '';
		chatMessages = [...chatMessages, { role: 'user', content: userMessage }];

		try {
			isGenerating = true;
			errorMessage = '';

			const config: OpenRouterConfig = { apiKey, model: selectedModel };
			const { styles } = selectedTemplate;

			// AIに本文生成を依頼（読み込んだコンテンツがあれば含める）
			const contentSection = loadedContent
				? `\n\n【現在の電子書籍の内容（全文）】\n${loadedContent}\n\n上記の内容を踏まえて、ユーザーの指示に従って編集・追加してください。`
				: '';

			const systemPrompt = `あなたは電子書籍の執筆・編集アシスタントです。
ユーザーの要望に基づいて電子書籍の内容を生成してください。${contentSection}

【出力形式】
見出しと本文をマークダウン形式で出力してください：
# タイトル（H1）
## 章見出し（H2）
### 節見出し（H3）
本文は通常のテキストで記載

完全な内容を出力してください。`;

			const messages: ChatMessage[] = [
				{ role: 'system', content: systemPrompt },
				...chatMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
			];

			const result = await generateContent(config, messages);

			// マークダウンをHTMLに変換
			const html = markdownToHtml(result, styles);

			// 常に新しいコンテンツで置換（強制上書き）
			generatedHtml = `<div style="${styles.containerStyle} font-family: ${styles.fontFamily}; font-size: ${styles.fontSize}; line-height: ${styles.lineHeight};">${html}</div>`;

			// ビジュアルエディタを強制更新
			if (visualEditor) {
				visualEditor.innerHTML = generatedHtml;
				lastGeneratedHtml = generatedHtml;
			}

			chatMessages = [...chatMessages, { role: 'assistant', content: '本文を生成しました。右のエディタで確認・編集できます。' }];
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '生成に失敗しました';
		} finally {
			isGenerating = false;
		}
	}

	// テキストコンテンツを抽出（全文）
	function extractTextContent(html: string): string {
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		return doc.body.textContent || '';
	}

	// マークダウンをHTMLに変換
	function markdownToHtml(markdown: string, styles: typeof selectedTemplate.styles): string {
		let html = '';
		const lines = markdown.split('\n');

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			if (trimmed.startsWith('### ')) {
				html += `<h3 style="${styles.h3Style}">${trimmed.slice(4)}</h3>`;
			} else if (trimmed.startsWith('## ')) {
				html += `<h2 style="${styles.h2Style}">${trimmed.slice(3)}</h2>`;
			} else if (trimmed.startsWith('# ')) {
				html += `<h1 style="${styles.h1Style}">${trimmed.slice(2)}</h1>`;
			} else if (!trimmed.startsWith('```') && !trimmed.startsWith('---')) {
				html += `<p style="${styles.pStyle}">${trimmed}</p>`;
			}
		}

		return html;
	}

	// 見出しをクリックしてスクロール
	function scrollToHeading(heading: Heading) {
		selectedHeadingId = heading.id;
		if (editorMode === 'visual' && visualEditor) {
			const headingElements = visualEditor.querySelectorAll('h1, h2, h3, h4');
			const index = parseInt(heading.id.split('-')[1]);
			if (headingElements[index]) {
				headingElements[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		}
	}

	// HTMLファイルを読み込み
	async function loadFromFile() {
		isLoading = true;
		errorMessage = '';
		try {
			const result = await loadHtmlFile();
			if (result.success && result.content) {
				generatedHtml = result.content;
				const titleMatch = result.content.match(/<h1[^>]*>([^<]*)<\/h1>/i);
				if (titleMatch) contentTitle = titleMatch[1].trim();
				if (result.fileName) {
					currentFileName = result.fileName;
					if (!contentTitle) contentTitle = result.fileName.replace(/\.(html|htm)$/i, '');
				}
				successMessage = `読み込みました: ${currentFileName || 'ファイル'}`;
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '読み込みに失敗しました';
		} finally {
			isLoading = false;
		}
	}

	// HTMLファイルとして保存
	async function saveToFile() {
		if (!generatedHtml) {
			errorMessage = '保存するHTMLがありません';
			return;
		}
		if (editorMode === 'visual') syncFromVisualEditor();

		isSaving = true;
		errorMessage = '';
		try {
			if (!getLastDirectoryHandle()) {
				const folderResult = await selectFolder();
				if (!folderResult.success) {
					isSaving = false;
					return;
				}
			}
			const title = contentTitle.trim() || '無題';
			const result = await saveHtmlFile('', title, generatedHtml, 'ebook');
			if (result.success) {
				currentFileName = result.filePath?.split(/[/\\]/).pop() || '';
				successMessage = `保存しました: ${currentFileName}`;
				await refreshFolderHtmlFiles();
			} else {
				errorMessage = result.error || '保存に失敗しました';
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '保存に失敗しました';
		} finally {
			isSaving = false;
		}
	}

	function goBack() {
		goto('/');
	}

	function handleKeyDown(e: KeyboardEvent) {
		const activeElement = document.activeElement as HTMLElement;
		if (e.key === 'Enter' && !e.shiftKey && activeElement?.id === 'ai-chat-input') {
			e.preventDefault();
			sendMessage();
		}
	}
</script>

<svelte:window on:keydown={handleKeyDown} on:mousemove={handleMouseMove} on:mouseup={handleMouseUp} />

<div class="h-screen flex flex-col bg-gray-900 text-white">
	<!-- Header -->
	<header class="bg-gray-800 border-b border-gray-700 px-4 py-2 flex-shrink-0">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3">
				<button onclick={goBack} class="text-gray-400 hover:text-white p-1" title="戻る">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
					</svg>
				</button>
				<span class="px-2 py-1 rounded text-xs font-medium bg-purple-500">電子書籍</span>
				<h1 class="text-lg font-semibold">電子書籍エディタ</h1>
			</div>
			<div class="flex items-center gap-3">
				<button
					onclick={async () => {
						const result = await selectFolder();
						if (result.success) {
							await refreshFolderHtmlFiles();
							successMessage = `フォルダを選択しました`;
						}
					}}
					class="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors {getLastDirectoryHandle() ? 'bg-green-600/20 border border-green-500 text-green-400' : 'bg-yellow-600/20 border border-yellow-500 text-yellow-400'}"
				>
					<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
					</svg>
					{getLastDirectoryHandle()?.name || 'フォルダを選択'}
				</button>
			</div>
		</div>
	</header>

	<main class="flex-1 flex overflow-hidden {isResizingChat || isResizingHeadings ? 'select-none' : ''}">
		<!-- Left: チャット -->
		<div class="flex flex-col border-r border-gray-700 flex-shrink-0" style="width: {chatWidth}px;">
			<div class="px-3 py-2 bg-gray-800 border-b border-gray-700">
				<span class="text-xs font-semibold text-gray-300">AI本文生成</span>
			</div>

			<!-- AIモデル選択 -->
			<div class="p-3 bg-gray-800 border-b border-gray-700">
				<select
					bind:value={selectedModel}
					class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500"
				>
					{#each availableModels as model (model.id)}
						<option value={model.id}>{model.name} - {model.description}</option>
					{/each}
				</select>
			</div>

			<!-- 保存フォルダ -->
			<div class="p-3 bg-gray-800/50 border-b border-gray-700">
				<div class="flex items-center justify-between mb-2">
					<div class="text-xs text-gray-400">保存フォルダ</div>
					{#if getLastDirectoryHandle()}
						<button onclick={refreshFolderHtmlFiles} class="text-[10px] text-gray-500 hover:text-gray-300">更新</button>
					{/if}
				</div>
				{#if folderHtmlFiles.length > 0}
					<select
						onchange={(e) => loadHtmlFromFolder((e.target as HTMLSelectElement).value)}
						class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs"
					>
						<option value="">ファイルを開く ({folderHtmlFiles.length}個)</option>
						{#each folderHtmlFiles as file (file.name)}
							<option value={file.name}>{file.name}</option>
						{/each}
					</select>
				{:else}
					<div class="text-xs text-gray-500 text-center py-1">{getLastDirectoryHandle() ? 'ファイルなし' : '未選択'}</div>
				{/if}
			</div>

			<!-- コード読み込みボタン -->
			<div class="p-2 bg-gray-800/50 border-b border-gray-700">
				<button
					onclick={loadCodeToChat}
					disabled={!generatedHtml}
					class="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:text-gray-400 rounded text-xs transition-colors"
				>
					<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
					</svg>
					コードをチャットに読み込む
				</button>
			</div>

			<!-- Chat Messages -->
			<div class="flex-1 overflow-y-auto p-2 space-y-2">
				{#if chatMessages.length === 0}
					<div class="text-center text-gray-500 py-4 text-xs">
						<p>AIに本文生成を依頼</p>
						<p class="text-[10px] mt-1 text-gray-600">例: 「第1章を書いて」</p>
						<p class="text-[10px] mt-2 text-gray-600">HTMLを読み込んでから<br/>「コードを読み込む」を押すと<br/>AIが内容を理解できます</p>
					</div>
				{:else}
					{#each chatMessages as message, i (i)}
						<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
							<div class="max-w-[90%] rounded-lg px-2.5 py-1.5 text-xs {message.role === 'user' ? 'bg-purple-600' : 'bg-gray-700'}">
								<div class="whitespace-pre-wrap break-words">{message.content}</div>
							</div>
						</div>
					{/each}
					{#if isGenerating}
						<div class="flex justify-start">
							<div class="bg-gray-700 rounded-lg px-2.5 py-1.5 flex items-center gap-2 text-xs">
								<span class="animate-spin w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full"></span>
								生成中...
							</div>
						</div>
					{/if}
				{/if}
			</div>

			<!-- 入力 -->
			<div class="p-2 bg-gray-800 border-t border-gray-700">
				<div class="flex gap-1.5">
					<textarea
						id="ai-chat-input"
						bind:value={userInput}
						placeholder="本文を生成..."
						rows="2"
						class="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs resize-none"
					></textarea>
					<button
						onclick={sendMessage}
						disabled={isGenerating || !userInput.trim()}
						class="px-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
						</svg>
					</button>
				</div>
			</div>
		</div>

		<!-- チャット欄リサイズハンドル -->
		<div
			onmousedown={startResizeChat}
			class="w-1 bg-gray-700 hover:bg-purple-500 cursor-col-resize flex-shrink-0 transition-colors"
			title="ドラッグで幅を調整"
		></div>

		<!-- Middle: 見出し一覧 -->
		<div class="flex flex-col border-r border-gray-700 bg-gray-850 flex-shrink-0" style="width: {headingsWidth}px;">
			<div class="px-3 py-2 bg-gray-800 border-b border-gray-700">
				<span class="text-xs font-semibold text-gray-300">見出し</span>
			</div>
			<div class="flex-1 overflow-y-auto p-2 space-y-1">
				{#if headings.length === 0}
					<div class="text-center text-gray-500 py-4 text-xs">見出しなし</div>
				{:else}
					{#each headings as heading (heading.id)}
						<button
							onclick={() => scrollToHeading(heading)}
							class="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-gray-700 {selectedHeadingId === heading.id ? 'bg-purple-600/30' : ''}"
							style="padding-left: {(heading.level - 1) * 8 + 8}px;"
						>
							<span class="text-[10px] text-gray-500">H{heading.level}</span>
							<span class="truncate">{heading.text}</span>
						</button>
					{/each}
				{/if}
			</div>
		</div>

		<!-- 見出し欄リサイズハンドル -->
		<div
			onmousedown={startResizeHeadings}
			class="w-1 bg-gray-700 hover:bg-purple-500 cursor-col-resize flex-shrink-0 transition-colors"
			title="ドラッグで幅を調整"
		></div>

		<!-- Right: HTMLエディタ -->
		<div class="flex-1 flex flex-col bg-gray-600">
			<!-- ヘッダー -->
			<div class="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
				<div class="flex items-center gap-3">
					<!-- モード切替 -->
					<div class="flex items-center gap-1 bg-gray-700 rounded p-0.5">
						<button
							onclick={() => { if (editorMode === 'visual') syncFromVisualEditor(); editorMode = 'code'; }}
							class="px-2 py-1 text-xs rounded {editorMode === 'code' ? 'bg-gray-600 text-white' : 'text-gray-400'}"
						>コード</button>
						<button
							onclick={() => editorMode = 'visual'}
							class="px-2 py-1 text-xs rounded {editorMode === 'visual' ? 'bg-gray-600 text-white' : 'text-gray-400'}"
						>ビジュアル</button>
					</div>
					<!-- テンプレート選択 -->
					<select
						bind:value={selectedTemplateId}
						onchange={() => applyTemplate(selectedTemplateId)}
						class="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs"
					>
						{#each EBOOK_TEMPLATES as template (template.id)}
							<option value={template.id}>{template.name}</option>
						{/each}
					</select>
				</div>
				<div class="flex items-center gap-2">
					{#if generatedHtml}
						<span class="text-[10px] text-gray-400">
							{generatedHtml.length.toLocaleString()}字 / {extractTextContent(generatedHtml).length.toLocaleString()}字
						</span>
					{/if}
					<input
						type="text"
						bind:value={contentTitle}
						placeholder="タイトル"
						class="w-32 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs"
					/>
					<button
						onclick={loadFromFile}
						disabled={isLoading}
						class="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-2 py-1.5 rounded text-xs"
					>
						{#if isLoading}
							<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
						{/if}
						読込
					</button>
					<button
						onclick={saveToFile}
						disabled={isSaving || !generatedHtml}
						class="flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-2 py-1.5 rounded text-xs"
					>
						{#if isSaving}
							<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
						{/if}
						保存
					</button>
					<button
						onclick={createNew}
						class="bg-purple-600 hover:bg-purple-700 px-2 py-1.5 rounded text-xs"
					>新規</button>
				</div>
			</div>

			<!-- メッセージ -->
			{#if errorMessage}
				<div class="px-4 py-1.5 bg-red-900/30 border-b border-red-500/30">
					<p class="text-xs text-red-400">{errorMessage}</p>
				</div>
			{/if}
			{#if successMessage}
				<div class="px-4 py-1.5 bg-green-900/30 border-b border-green-500/30">
					<p class="text-xs text-green-400">{successMessage}</p>
				</div>
			{/if}

			<!-- エディタ -->
			<div class="flex-1 overflow-hidden">
				{#if generatedHtml}
					{#if editorMode === 'code'}
						<textarea
							bind:value={generatedHtml}
							class="w-full h-full p-4 bg-gray-950 text-gray-300 text-xs font-mono resize-none focus:outline-none"
							spellcheck="false"
						></textarea>
					{:else}
						<div
							bind:this={visualEditor}
							contenteditable="true"
							oninput={syncFromVisualEditor}
							class="w-full h-full p-6 bg-white text-gray-900 overflow-auto focus:outline-none ebook-content"
						></div>
					{/if}
				{:else}
					<div class="h-full flex items-center justify-center bg-gray-950">
						<div class="text-center text-gray-500">
							<p class="text-xl mb-2">電子書籍エディタ</p>
							<p class="text-sm mb-4">「新規」で作成、または既存ファイルを読み込み</p>
							<div class="flex gap-2 justify-center">
								<button onclick={createNew} class="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm">新規作成</button>
								<button onclick={loadFromFile} class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">ファイルを開く</button>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</main>
</div>

<style>
	.bg-gray-850 {
		background-color: #1a1f2e;
	}
	.ebook-content {
		font-family: 'Hiragino Sans', 'Noto Sans JP', sans-serif;
		line-height: 1.8;
	}
</style>
