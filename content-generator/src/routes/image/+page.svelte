<script lang="ts">
	import { goto } from '$app/navigation';
	import { SYSTEM_API_KEY, type ContentType } from '$lib/stores';
	import { generateContent, type OpenRouterConfig, type ChatMessage, AVAILABLE_MODELS } from '$lib/openrouter';
	import { saveHtmlFile, loadHtmlFile, getContentTypeFolder, isTauri, selectFolder, getLastDirectoryHandle } from '$lib/filesystem';

	const contentType: ContentType = 'image';

	// API設定
	const apiKey = SYSTEM_API_KEY;
	let selectedModel = $state('moonshotai/kimi-k2');

	// コンテンツタイトル（ユーザーが入力可能）
	let contentTitle = $state('');
	let isGenerating = $state(false);
	let isImproving = $state(false);
	let isSaving = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');

	// チャット履歴
	let chatMessages = $state<{ role: 'user' | 'assistant'; content: string }[]>([]);
	let userInput = $state('');

	// 生成されたHTML（編集可能）
	let generatedHtml = $state('');
	let htmlEditor: HTMLTextAreaElement | null = $state(null);
	let visualEditor: HTMLDivElement | null = $state(null);
	let currentFileName = $state('');

	// フォルダ選択状態
	let hasFolderSelected = $state(false);

	$effect(() => {
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
		{ label: 'より詳細に', prompt: 'この部分をより詳細なプロンプトに改善してください' },
		{ label: '簡潔に', prompt: 'この部分をより簡潔でわかりやすく改善してください' },
		{ label: 'スタイル強調', prompt: 'この部分にアートスタイルの指定を追加してください' },
		{ label: '構図を追加', prompt: 'この部分に構図やカメラアングルの指定を追加してください' }
	];

	// ビジュアルエディタからHTMLを同期
	function syncFromVisualEditor() {
		if (visualEditor) {
			generatedHtml = visualEditor.innerHTML;
		}
	}

	// チャットでの相談
	async function sendMessage() {
		if (!userInput.trim() || isGenerating) return;

		const userMessage = userInput.trim();
		userInput = '';

		chatMessages = [...chatMessages, { role: 'user', content: userMessage }];

		try {
			isGenerating = true;
			errorMessage = '';

			const config: OpenRouterConfig = { apiKey, model: selectedModel };

			const messages: ChatMessage[] = [
				{
					role: 'system',
					content: `あなたはプロの画像生成プロンプトエンジニアです。
ユーザーのアイデアを聞き、画像生成AI用の最適なプロンプトを提案してください。
この段階ではHTMLは生成せず、プロンプトの構成や改善案を説明してください。`
				},
				...chatMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
			];

			const result = await generateContent(config, messages);
			chatMessages = [...chatMessages, { role: 'assistant', content: result }];
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '生成に失敗しました';
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

			const messages: ChatMessage[] = [
				{
					role: 'system',
					content: `あなたはプロのWebコンテンツ制作者です。
以下の会話で決まったプロンプト案を、見やすいHTMLドキュメントにまとめてください。

要件:
- 有効なHTML形式で出力
- CSSはインラインスタイルで含める
- プロンプトをコピーしやすい形式で表示
- コードブロック(\`\`\`)は使わず、直接HTMLを出力`
				},
				{
					role: 'user',
					content: `以下の会話で決まった内容をHTMLコンテンツにしてください:\n\n${conversationSummary}`
				}
			];

			const result = await generateContent(config, messages);
			generatedHtml = extractHtml(result);

			chatMessages = [...chatMessages, { role: 'assistant', content: '✅ HTMLを生成しました。' }];
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

			const messages: ChatMessage[] = [
				{
					role: 'system',
					content: `あなたはHTMLコンテンツの編集者です。
指定された部分のみを改善してください。
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

			chatMessages = [...chatMessages, { role: 'assistant', content: `✏️ 選択部分を改善しました` }];
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
			errorMessage = '保存するHTMLがありません。';
			return;
		}

		if (editorMode === 'visual') {
			syncFromVisualEditor();
		}

		isSaving = true;
		errorMessage = '';
		successMessage = '';

		try {
			if (!getLastDirectoryHandle()) {
				const folderResult = await selectFolder();
				if (!folderResult.success) {
					errorMessage = folderResult.error || '保存先フォルダを選択してください';
					isSaving = false;
					return;
				}
				hasFolderSelected = true;
			}

			const title = contentTitle.trim() || chatMessages.find(m => m.role === 'user')?.content.substring(0, 30) || '無題';
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
			chatMessages = [...chatMessages, { role: 'assistant', content: `📂 「${result.fileName || 'ファイル'}」を読み込みました。` }];
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
				<span class="px-2 py-1 rounded text-xs font-medium bg-green-500">
					画像
				</span>
				<h1 class="text-lg font-semibold">画像プロンプト作成</h1>
			</div>
			<div class="flex items-center gap-3">
				{#if isTauri()}
					<span class="text-xs text-purple-400">Tauri</span>
				{/if}
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
				<select
					bind:value={selectedModel}
					class="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
				>
					{#each AVAILABLE_MODELS as model}
						<option value={model.id}>{model.name}</option>
					{/each}
				</select>
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
			<div class="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
				<h2 class="text-sm font-semibold text-gray-300">Chat - プロンプト相談</h2>
				<button onclick={clearAll} class="text-xs text-gray-500 hover:text-gray-300">全てクリア</button>
			</div>

			<div class="flex-1 overflow-y-auto p-4 space-y-3">
				{#if chatMessages.length === 0}
					<div class="text-center text-gray-500 py-8">
						<svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
						</svg>
						<p class="text-sm mb-1">画像生成プロンプトを相談</p>
						<p class="text-xs text-gray-600">例: 「夕暮れの海辺の写真」</p>
					</div>
				{:else}
					{#each chatMessages as message, i (i)}
						<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
							<div class="max-w-[90%] rounded-lg px-3 py-2 text-sm {message.role === 'user' ? 'bg-green-600' : 'bg-gray-700'}">
								<div class="whitespace-pre-wrap break-words">{message.content}</div>
							</div>
						</div>
					{/each}
					{#if isGenerating}
						<div class="flex justify-start">
							<div class="bg-gray-700 rounded-lg px-3 py-2">
								<span class="flex items-center gap-2 text-sm text-gray-300">
									<span class="animate-spin w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full"></span>
									生成中...
								</span>
							</div>
						</div>
					{/if}
				{/if}
			</div>

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

				<div class="flex gap-2">
					<textarea
						bind:value={userInput}
						onkeydown={handleKeyDown}
						placeholder="プロンプトを相談... (Enter で送信)"
						rows="2"
						class="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500 resize-none"
					></textarea>
					<button
						onclick={sendMessage}
						disabled={isGenerating || !userInput.trim()}
						class="px-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
						</svg>
					</button>
				</div>
			</div>
		</div>

		<!-- Column 2: HTML Editor -->
		<div class="w-1/3 flex flex-col border-r border-gray-700 relative">
			<div class="px-2 py-2 bg-gray-800 border-b border-gray-700">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-1">
						<button
							onclick={() => { if (editorMode === 'visual') syncFromVisualEditor(); editorMode = 'code'; }}
							class="px-3 py-1.5 text-xs font-medium rounded transition-colors {editorMode === 'code' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'}"
						>
							コード
						</button>
						<button
							onclick={() => editorMode = 'visual'}
							class="px-3 py-1.5 text-xs font-medium rounded transition-colors {editorMode === 'visual' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'}"
						>
							ビジュアル
						</button>
					</div>

					<div class="flex items-center gap-2">
						<button onclick={loadFromFile} class="text-xs text-gray-500 hover:text-gray-300">読込</button>
						{#if generatedHtml}
							<button onclick={() => navigator.clipboard.writeText(generatedHtml)} class="text-xs text-gray-500 hover:text-gray-300">コピー</button>
							<button onclick={clearHtml} class="text-xs text-gray-500 hover:text-red-400">クリア</button>
						{/if}
					</div>
				</div>
				{#if currentFileName}
					<div class="mt-1 text-xs text-gray-500 truncate">{currentFileName}</div>
				{/if}
				<div class="mt-2">
					<input
						type="text"
						bind:value={contentTitle}
						placeholder="タイトルを入力"
						class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500"
					/>
				</div>
			</div>

			{#if showImproveMenu && selectedText && editorMode === 'code'}
				<div class="absolute top-16 left-4 right-4 z-10 bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-3">
					<div class="text-xs text-gray-400 mb-2">選択部分をAIで改善:</div>
					<div class="flex flex-wrap gap-1 mb-2">
						{#each improveOptions as option}
							<button
								onclick={() => improveSelection(option.prompt)}
								disabled={isImproving}
								class="px-2 py-1 text-xs bg-gray-700 hover:bg-green-600 rounded transition-colors disabled:opacity-50"
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
							class="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs"
						/>
						<button
							onclick={improveWithCustomPrompt}
							disabled={isImproving || !improvePrompt.trim()}
							class="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded"
						>
							適用
						</button>
					</div>
				</div>
			{/if}

			<div class="flex-1 overflow-hidden">
				{#if generatedHtml}
					{#if editorMode === 'code'}
						<textarea
							bind:this={htmlEditor}
							bind:value={generatedHtml}
							onmouseup={handleTextSelection}
							onkeyup={handleTextSelection}
							class="w-full h-full p-4 bg-gray-950 text-gray-300 text-xs font-mono resize-none focus:outline-none border-0"
							spellcheck="false"
						></textarea>
					{:else}
						<div
							bind:this={visualEditor}
							contenteditable="true"
							oninput={syncFromVisualEditor}
							class="w-full h-full p-4 bg-white text-gray-900 text-sm overflow-auto focus:outline-none"
						>
							{@html generatedHtml}
						</div>
					{/if}
				{:else}
					<div class="h-full flex items-center justify-center text-gray-500 bg-gray-950 p-4">
						<div class="text-center">
							<p class="text-sm mb-4">HTMLコンテンツを作成・編集</p>
							<button onclick={loadFromFile} class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">
								ファイルを読み込み
							</button>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Column 3: Preview -->
		<div class="w-1/3 flex flex-col">
			<div class="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
				<h2 class="text-sm font-semibold text-gray-300">プレビュー</h2>
				{#if generatedHtml}
					<button
						onclick={saveHtml}
						disabled={isSaving}
						class="flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-3 py-1 rounded text-xs font-medium"
					>
						{#if isSaving}
							<span class="animate-spin w-3 h-3 border border-white border-t-transparent rounded-full"></span>
							保存中...
						{:else}
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
						<p class="text-sm text-gray-400">プレビューがここに表示されます</p>
					</div>
				{/if}
			</div>
		</div>
	</main>
</div>
