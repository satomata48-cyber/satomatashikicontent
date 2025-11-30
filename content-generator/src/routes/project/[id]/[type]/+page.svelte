<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { projectStore, SYSTEM_API_KEY, type Project, type ContentType, type ContentItem } from '$lib/stores';
	import { generateContent, type OpenRouterConfig, type ChatMessage, AVAILABLE_MODELS } from '$lib/openrouter';
	import { saveHtmlFile, loadHtmlFile, getContentTypeFolder, isTauri, selectFolder, getLastDirectoryHandle } from '$lib/filesystem';

	let projectId = $state('');
	let contentType = $state<ContentType>('blog');
	let project = $state<Project | null>(null);
	let contentId = $state<string | null>(null);

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
	let currentFilePath = $state('');

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

	// コンテンツタイプの定義
	const contentTypeInfo: Record<ContentType, { name: string; color: string; systemPrompt: string }> = {
		blog: {
			name: 'ブログ',
			color: 'bg-blue-500',
			systemPrompt: 'あなたはプロのブログライターです。SEOを意識した魅力的なブログ記事を作成してください。'
		},
		ebook: {
			name: '電子書籍',
			color: 'bg-purple-500',
			systemPrompt: 'あなたはプロの作家・編集者です。電子書籍の内容を作成してください。'
		},
		video: {
			name: '動画',
			color: 'bg-red-500',
			systemPrompt: 'あなたはプロの動画クリエイターです。動画の台本、構成、サムネイル案などを作成してください。'
		},
		image: {
			name: '画像',
			color: 'bg-green-500',
			systemPrompt: 'あなたはプロの画像生成プロンプトエンジニアです。画像生成用のプロンプトを提案してください。'
		},
		slide: {
			name: 'スライド',
			color: 'bg-orange-500',
			systemPrompt: 'あなたはプロのプレゼンテーションデザイナーです。スライドの構成とコンテンツを作成してください。'
		}
	};

	page.subscribe(p => {
		projectId = p.params.id;
		contentType = p.params.type as ContentType;
		contentId = p.url.searchParams.get('edit');
	});

	projectStore.subscribe(projects => {
		project = projects.find(p => p.id === projectId) || null;

		if (contentId && project) {
			const content = project.contents.find(c => c.id === contentId);
			if (content && !generatedHtml) {
				generatedHtml = content.content;
				currentFileName = content.fileName || '';
				currentFilePath = content.filePath || '';
				contentTitle = content.title || '';
				chatMessages = [{ role: 'assistant', content: `📝 「${content.title}」を編集中です。` }];
			}
		}
	});

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
					content: `${contentTypeInfo[contentType].systemPrompt}

あなたはコンテンツ作成のアドバイザーです。
ユーザーと相談しながら、コンテンツの構成・内容を一緒に考えてください。
この段階ではHTMLは生成せず、構成案や提案を分かりやすく説明してください。
箇条書きや見出しを使って読みやすく回答してください。`
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
以下の会話で決まった内容を元に、完成度の高いHTMLコンテンツを生成してください。

要件:
- 有効なHTML形式で出力
- CSSはインラインスタイルで含める
- モダンで読みやすいデザイン
- レスポンシブ対応
- コードブロック(\`\`\`)は使わず、直接HTMLを出力`
				},
				{
					role: 'user',
					content: `以下の会話で決まった内容をHTMLコンテンツにしてください:\n\n${conversationSummary}`
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

			const messages: ChatMessage[] = [
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
	async function saveToProject() {
		if (!generatedHtml) {
			errorMessage = '保存するHTMLがありません。先にHTMLを生成してください。';
			return;
		}
		if (!project) {
			errorMessage = 'プロジェクト情報が取得できません。';
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
				console.log('saveToProject: No folder handle, showing picker');
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
				// フォルダ選択状態を更新
				hasFolderSelected = true;
				// プロジェクトのフォルダパスを更新
				if (folderResult.path) {
					projectStore.updateProject(projectId, { folderPath: folderResult.path });
				}
			}

			console.log('saveToProject: Folder handle exists, saving file');
			// タイトルを取得: 入力値 > HTMLから抽出 > チャットから > 無題
			const title = contentTitle.trim() || extractTitleFromHtml(generatedHtml) || chatMessages.find(m => m.role === 'user')?.content.substring(0, 30) || '無題';
			const folderPath = project.folderPath || getContentTypeFolder(contentType);

			const result = await saveHtmlFile(folderPath, title, generatedHtml);

			if (result.success) {
				currentFilePath = result.filePath || '';
				currentFileName = result.filePath?.split(/[/\\]/).pop() || '';

				if (contentId) {
					projectStore.updateContent(projectId, contentId, {
						title,
						content: generatedHtml,
						filePath: currentFilePath,
						fileName: currentFileName,
						status: 'completed'
					});
					successMessage = `✅ 保存しました: ${currentFileName}`;
				} else {
					projectStore.addContent(projectId, {
						type: contentType,
						title,
						content: generatedHtml,
						filePath: currentFilePath,
						fileName: currentFileName,
						status: 'completed'
					});
					successMessage = `✅ 保存しました: ${currentFileName}`;
				}

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
		currentFilePath = '';
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
		currentFilePath = '';
		contentTitle = '';
		contentId = null;
	}

	function goBack() {
		goto(`/project/${projectId}`);
	}

	// HTMLからタイトルを抽出
	function extractTitleFromHtml(html: string): string {
		// <title>タグから
		const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
		if (titleMatch && titleMatch[1].trim()) {
			return titleMatch[1].trim().substring(0, 50);
		}
		// <h1>タグから
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
				<span class="px-2 py-1 rounded text-xs font-medium {contentTypeInfo[contentType]?.color || 'bg-gray-500'}">
					{contentTypeInfo[contentType]?.name || contentType}
				</span>
				<h1 class="text-lg font-semibold">{project?.name || 'プロジェクト'}</h1>
				{#if contentId}
					<span class="px-2 py-1 bg-yellow-600/30 text-yellow-400 rounded text-xs">編集中</span>
				{/if}
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
							if (result.path && project) {
								projectStore.updateProject(projectId, { folderPath: result.path });
							}
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
				<!-- モデル選択 -->
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
				<h2 class="text-sm font-semibold text-gray-300">Chat - 構成相談</h2>
				<button onclick={clearAll} class="text-xs text-gray-500 hover:text-gray-300">全てクリア</button>
			</div>

			<!-- Chat Messages -->
			<div class="flex-1 overflow-y-auto p-4 space-y-3">
				{#if chatMessages.length === 0}
					<div class="text-center text-gray-500 py-8">
						<svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
						</svg>
						<p class="text-sm mb-1">コンテンツの構成を相談</p>
						<p class="text-xs text-gray-600">例: 「AIについての記事を書きたい」</p>
					</div>
				{:else}
					{#each chatMessages as message, i (i)}
						<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
							<div class="max-w-[90%] rounded-lg px-3 py-2 text-sm {message.role === 'user' ? 'bg-blue-600' : 'bg-gray-700'}">
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
								<!-- 直接HTMLを入力 -->
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
					💡 テキストを選択するとAI改善メニューが表示されます
				</div>
			{/if}
		</div>

		<!-- Column 3: Preview -->
		<div class="w-1/3 flex flex-col">
			<div class="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
				<h2 class="text-sm font-semibold text-gray-300">プレビュー</h2>
				{#if generatedHtml}
					<button
						onclick={saveToProject}
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
