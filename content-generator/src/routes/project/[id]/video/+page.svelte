<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { projectStore, SYSTEM_API_KEY, type Project, type ContentItem } from '$lib/stores';
	import { selectFolder, getLastDirectoryHandle, listHtmlFiles } from '$lib/filesystem';
	import { generateContent, generateImage, IMAGE_GENERATION_MODELS } from '$lib/openrouter';
	import {
		checkVoicevoxConnection,
		getSpeakers,
		textToSpeech,
		createAudioUrl,
		POPULAR_SPEAKERS,
		type VoicevoxSpeaker
	} from '$lib/voicevox';
	import {
		splitHtmlByHeadings,
		createScriptPrompt,
		parseScriptResponse,
		estimateAudioDuration,
		formatDuration,
		type VideoSection
	} from '$lib/video-utils';

	let projectId = $state('');
	let project = $state<Project | null>(null);

	// API設定
	const apiKey = SYSTEM_API_KEY;

	// 利用可能なモデル一覧
	const availableModels = [
		{ id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', description: '高速・JSON強い（推奨）', cost: '$0.10/$0.40' },
		{ id: 'google/gemini-2.5-flash-preview', name: 'Gemini 2.5 Flash', description: '最新・高性能', cost: '$0.15/$0.60' },
		{ id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', description: 'コスパ最高', cost: '$0.14/$0.28' },
		{ id: 'moonshotai/kimi-k2', name: 'Kimi K2', description: '無料枠あり', cost: '無料' },
	];

	let selectedModel = $state('google/gemini-2.0-flash-001');
	let isGenerating = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');

	// 既存コンテンツ
	let availableContents = $state<ContentItem[]>([]);
	let selectedContentId = $state<string>('');
	let selectedContent = $state<ContentItem | null>(null);
	let sourceHtml = $state('');

	// フォルダ内HTMLファイル
	let folderHtmlFiles = $state<{ name: string; content: string }[]>([]);
	let selectedHtmlFileName = $state<string>('');
	let contentSourceType = $state<'project' | 'folder'>('project');

	// ブラウザでの実行確認
	let isBrowser = $state(false);

	// VOICEVOX接続状態
	let voicevoxConnected = $state(false);
	let voicevoxSpeakers = $state<VoicevoxSpeaker[]>([]);
	let selectedSpeakerId = $state(3); // デフォルト: ずんだもん ノーマル
	let testAudioUrl = $state<string | null>(null);
	let isTestingVoicevox = $state(false);

	// 画像生成
	let selectedImageModel = $state(IMAGE_GENERATION_MODELS[0].id);
	let isTestingImage = $state(false);
	let testImageUrl = $state<string | null>(null);

	// 見出し分割されたセクション
	let sections = $state<VideoSection[]>([]);
	let isParsingHtml = $state(false);

	// 台本生成
	let isGeneratingScript = $state(false);
	let scriptProgress = $state('');

	// 音声生成
	let isGeneratingAudio = $state(false);
	let audioProgress = $state({ current: 0, total: 0 });

	// 合計推定時間
	let totalEstimatedDuration = $derived(
		sections.reduce((sum, s) => sum + estimateAudioDuration(s.script || s.textContent), 0)
	);

	onMount(async () => {
		isBrowser = true;
		// フォルダ内HTMLファイル一覧を取得
		await refreshFolderHtmlFiles();
		// VOICEVOX接続確認
		await checkVoicevox();
	});

	// VOICEVOX接続確認
	async function checkVoicevox() {
		voicevoxConnected = await checkVoicevoxConnection();
		if (voicevoxConnected) {
			voicevoxSpeakers = await getSpeakers();
		}
	}

	// VOICEVOX音声テスト
	async function testVoicevox() {
		if (!voicevoxConnected) return;

		isTestingVoicevox = true;
		errorMessage = '';

		try {
			const result = await textToSpeech('こんにちは、VOICEVOXのテストです。', selectedSpeakerId);
			if (result.success && result.audio) {
				// 前のURLを解放
				if (testAudioUrl) URL.revokeObjectURL(testAudioUrl);
				testAudioUrl = createAudioUrl(result.audio);
				successMessage = 'VOICEVOX音声生成成功！';
			} else {
				errorMessage = result.error || 'VOICEVOX音声生成に失敗しました';
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'エラーが発生しました';
		} finally {
			isTestingVoicevox = false;
		}
	}

	// 画像生成テスト
	async function testImageGeneration() {
		isTestingImage = true;
		errorMessage = '';

		try {
			const result = await generateImage(
				{ apiKey, model: selectedImageModel },
				'A beautiful sunset over mountains, digital art style'
			);
			if (result.success && result.imageUrl) {
				testImageUrl = result.imageUrl;
				successMessage = '画像生成成功！';
			} else {
				errorMessage = result.error || '画像生成に失敗しました';
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'エラーが発生しました';
		} finally {
			isTestingImage = false;
		}
	}

	page.subscribe(p => {
		projectId = p.params.id;
	});

	projectStore.subscribe(projects => {
		project = projects.find(p => p.id === projectId) || null;
		if (project) {
			availableContents = project.contents.filter(c => c.type === 'blog' || c.type === 'ebook');
		}
	});

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
		selectedContentId = '';
		selectedContent = null;
		const file = folderHtmlFiles.find(f => f.name === fileName);
		if (file) {
			sourceHtml = file.content;
			errorMessage = '';
			successMessage = '';
		}
	}

	// コンテンツを選択して読み込み（プロジェクト内コンテンツ）
	function loadContent(contentId: string) {
		selectedContentId = contentId;
		selectedHtmlFileName = '';
		selectedContent = availableContents.find(c => c.id === contentId) || null;
		if (selectedContent) {
			sourceHtml = selectedContent.content;
			errorMessage = '';
			successMessage = '';
		}
	}

	function goBack() {
		goto(`/project/${projectId}`);
	}

	// 話者名を取得
	function getSpeakerName(speakerId: number): string {
		for (const speaker of voicevoxSpeakers) {
			for (const style of speaker.styles) {
				if (style.id === speakerId) {
					return `${speaker.name} (${style.name})`;
				}
			}
		}
		const popular = POPULAR_SPEAKERS.find(s => s.id === speakerId);
		return popular ? `${popular.name} (${popular.style})` : `話者 ${speakerId}`;
	}

	// HTMLを見出しで分割
	function parseHtml() {
		if (!sourceHtml) return;

		isParsingHtml = true;
		errorMessage = '';
		successMessage = '';

		try {
			const parsed = splitHtmlByHeadings(sourceHtml);
			sections = parsed.map(s => ({
				...s,
				script: '' // 台本は後で生成
			}));
			successMessage = `${sections.length}個のセクションに分割しました`;
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'HTMLの解析に失敗しました';
		} finally {
			isParsingHtml = false;
		}
	}

	// AIで台本を生成
	async function generateScript() {
		if (sections.length === 0) return;

		isGeneratingScript = true;
		errorMessage = '';
		successMessage = '';
		scriptProgress = '台本を生成中...';

		try {
			const prompt = createScriptPrompt(sections);
			const response = await generateContent(
				{ apiKey, model: selectedModel },
				[
					{ role: 'system', content: 'あなたはプロのナレーターです。ブログ記事を自然な話し言葉の台本に変換してください。' },
					{ role: 'user', content: prompt }
				]
			);

			sections = parseScriptResponse(response, sections);
			successMessage = '台本の生成が完了しました';
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '台本生成に失敗しました';
		} finally {
			isGeneratingScript = false;
			scriptProgress = '';
		}
	}

	// 全セクションの音声を生成
	async function generateAllAudio() {
		if (sections.length === 0 || !voicevoxConnected) return;

		isGeneratingAudio = true;
		errorMessage = '';
		successMessage = '';
		audioProgress = { current: 0, total: sections.length };

		try {
			for (let i = 0; i < sections.length; i++) {
				audioProgress = { current: i + 1, total: sections.length };
				const section = sections[i];
				const text = section.script || section.textContent;

				if (!text) continue;

				const result = await textToSpeech(text, selectedSpeakerId);
				if (result.success && result.audio) {
					// 既存のURLを解放
					if (section.audioUrl) URL.revokeObjectURL(section.audioUrl);

					sections[i] = {
						...section,
						audioData: result.audio,
						audioUrl: createAudioUrl(result.audio)
					};
				}
			}
			successMessage = '全セクションの音声生成が完了しました';
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '音声生成に失敗しました';
		} finally {
			isGeneratingAudio = false;
		}
	}

	// 単一セクションの音声を生成
	async function generateSectionAudio(index: number) {
		if (!voicevoxConnected) return;

		const section = sections[index];
		const text = section.script || section.textContent;

		if (!text) return;

		try {
			const result = await textToSpeech(text, selectedSpeakerId);
			if (result.success && result.audio) {
				if (section.audioUrl) URL.revokeObjectURL(section.audioUrl);

				sections[index] = {
					...section,
					audioData: result.audio,
					audioUrl: createAudioUrl(result.audio)
				};
			} else {
				errorMessage = result.error || '音声生成に失敗しました';
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '音声生成に失敗しました';
		}
	}

	// 台本を編集
	function updateSectionScript(index: number, newScript: string) {
		sections[index] = {
			...sections[index],
			script: newScript
		};
	}

	// セクションの画像を生成
	let generatingImageIndex = $state<number | null>(null);

	async function generateSectionImage(index: number) {
		const section = sections[index];
		const text = section.script || section.textContent;

		if (!text) return;

		generatingImageIndex = index;
		errorMessage = '';

		try {
			// セクションの内容から画像プロンプトを生成
			const imagePrompt = `Create a professional illustration for a video section about: ${section.heading}. Content summary: ${text.substring(0, 200)}. Style: modern, clean, suitable for educational video.`;

			const result = await generateImage(
				{ apiKey, model: selectedImageModel },
				imagePrompt
			);

			if (result.success && result.imageUrl) {
				sections[index] = {
					...section,
					imageUrl: result.imageUrl
				};
			} else {
				errorMessage = result.error || '画像生成に失敗しました';
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '画像生成に失敗しました';
		} finally {
			generatingImageIndex = null;
		}
	}

	// 全セクションの画像を生成
	let isGeneratingAllImages = $state(false);
	let imageProgress = $state({ current: 0, total: 0 });

	async function generateAllImages() {
		if (sections.length === 0) return;

		isGeneratingAllImages = true;
		errorMessage = '';
		imageProgress = { current: 0, total: sections.length };

		try {
			for (let i = 0; i < sections.length; i++) {
				imageProgress = { current: i + 1, total: sections.length };
				await generateSectionImage(i);
			}
			successMessage = '全セクションの画像生成が完了しました';
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '画像生成に失敗しました';
		} finally {
			isGeneratingAllImages = false;
		}
	}
</script>

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
				<span class="px-2 py-1 rounded text-xs font-medium bg-red-500">動画</span>
				<h1 class="text-lg font-semibold">{project?.name || 'プロジェクト'}</h1>
			</div>
			<div class="flex items-center gap-2">
				<!-- VOICEVOX接続状態 -->
				<div class="flex items-center gap-1.5 px-2 py-1 rounded text-xs {voicevoxConnected ? 'bg-green-600/20 border border-green-500' : 'bg-red-600/20 border border-red-500'}">
					<span class="w-2 h-2 rounded-full {voicevoxConnected ? 'bg-green-400' : 'bg-red-400'}"></span>
					<span class="{voicevoxConnected ? 'text-green-400' : 'text-red-400'}">VOICEVOX</span>
				</div>
				<!-- AI接続状態 -->
				<div class="flex items-center gap-1.5 px-2 py-1 bg-green-600/20 border border-green-500 rounded text-xs">
					<svg class="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
					</svg>
					<span class="text-green-400">OpenRouter</span>
				</div>
			</div>
		</div>
	</header>

	<main class="flex-1 flex overflow-hidden">
		<!-- Left: 設定パネル -->
		<div class="w-80 flex flex-col border-r border-gray-700 flex-shrink-0 overflow-y-auto">
			<!-- VOICEVOX設定 -->
			<div class="p-3 bg-gray-800 border-b border-gray-700">
				<div class="flex items-center justify-between mb-2">
					<span class="text-xs font-semibold text-gray-300">VOICEVOX (音声生成)</span>
					<button
						onclick={checkVoicevox}
						class="text-xs text-blue-400 hover:text-blue-300"
					>
						再接続
					</button>
				</div>

				{#if voicevoxConnected}
					<div class="space-y-2">
						<select
							bind:value={selectedSpeakerId}
							class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-red-500"
						>
							{#each voicevoxSpeakers as speaker}
								<optgroup label={speaker.name}>
									{#each speaker.styles as style}
										<option value={style.id}>{speaker.name} - {style.name}</option>
									{/each}
								</optgroup>
							{/each}
						</select>
						<div class="flex gap-2">
							<button
								onclick={testVoicevox}
								disabled={isTestingVoicevox}
								class="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 px-2 py-1.5 rounded text-xs transition-colors"
							>
								{#if isTestingVoicevox}
									テスト中...
								{:else}
									音声テスト
								{/if}
							</button>
							{#if testAudioUrl}
								<audio src={testAudioUrl} controls class="h-8 flex-1"></audio>
							{/if}
						</div>
					</div>
				{:else}
					<div class="text-xs text-red-400 bg-red-900/20 rounded p-2">
						VOICEVOXが起動していません。<br>
						localhost:50021 で起動してください。
					</div>
				{/if}
			</div>

			<!-- 画像生成設定 -->
			<div class="p-3 bg-gray-800 border-b border-gray-700">
				<div class="text-xs font-semibold text-gray-300 mb-2">画像生成 (OpenRouter)</div>
				<div class="space-y-2">
					<select
						bind:value={selectedImageModel}
						class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-red-500"
					>
						{#each IMAGE_GENERATION_MODELS as model}
							<option value={model.id}>{model.name} - {model.description}</option>
						{/each}
					</select>
					<button
						onclick={testImageGeneration}
						disabled={isTestingImage}
						class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-2 py-1.5 rounded text-xs transition-colors"
					>
						{#if isTestingImage}
							生成中...
						{:else}
							画像テスト生成
						{/if}
					</button>
					{#if testImageUrl}
						<div class="mt-2">
							<img src={testImageUrl} alt="Test" class="w-full rounded" />
						</div>
					{/if}
				</div>
			</div>

			<!-- AIモデル選択 -->
			<div class="p-3 bg-gray-800 border-b border-gray-700">
				<div class="text-xs font-semibold text-gray-300 mb-2">台本生成AIモデル</div>
				<select
					bind:value={selectedModel}
					class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-red-500"
				>
					{#each availableModels as model (model.id)}
						<option value={model.id}>
							{model.name} - {model.description}
						</option>
					{/each}
				</select>
				<div class="text-[10px] text-gray-500 mt-1">
					コスト: {availableModels.find(m => m.id === selectedModel)?.cost || '-'}
				</div>
			</div>

			<!-- コンテンツ選択 -->
			<div class="p-3 bg-gray-800/50 border-b border-gray-700">
				<div class="text-xs font-semibold text-gray-300 mb-2">変換元コンテンツ</div>
				<!-- タブ切り替え -->
				<div class="flex gap-1 mb-2">
					<button
						onclick={() => { contentSourceType = 'project'; }}
						class="flex-1 px-2 py-1 text-xs rounded transition-colors {contentSourceType === 'project' ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'}"
					>
						プロジェクト内
					</button>
					<button
						onclick={async () => { contentSourceType = 'folder'; await refreshFolderHtmlFiles(); }}
						class="flex-1 px-2 py-1 text-xs rounded transition-colors {contentSourceType === 'folder' ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'}"
					>
						フォルダ内HTML
					</button>
				</div>

				{#if contentSourceType === 'project'}
					<select
						onchange={(e) => loadContent((e.target as HTMLSelectElement).value)}
						class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-red-500"
					>
						<option value="">選択してください...</option>
						{#each availableContents as content (content.id)}
							<option value={content.id} selected={selectedContentId === content.id}>
								[{content.type === 'blog' ? 'ブログ' : '電子書籍'}] {content.title}
							</option>
						{/each}
					</select>
				{:else}
					<div class="space-y-2">
						{#if getLastDirectoryHandle()}
							<div class="text-[10px] text-gray-400 truncate px-1">
								📁 {getLastDirectoryHandle()?.name}
							</div>
						{/if}
						<button
							onclick={async () => {
								const result = await selectFolder();
								if (result.success) {
									if (result.path && project) {
										projectStore.updateProject(projectId, { folderPath: result.path });
									}
									await refreshFolderHtmlFiles();
								}
							}}
							class="w-full bg-gray-700 hover:bg-gray-600 px-2 py-1.5 rounded text-xs transition-colors flex items-center justify-center gap-1"
						>
							<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
							</svg>
							{getLastDirectoryHandle() ? 'フォルダを変更' : 'フォルダを選択'}
						</button>
						{#if folderHtmlFiles.length > 0}
							<select
								onchange={(e) => loadHtmlFromFolder((e.target as HTMLSelectElement).value)}
								class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-red-500"
							>
								<option value="">HTMLファイルを選択...</option>
								{#each folderHtmlFiles as file (file.name)}
									<option value={file.name} selected={selectedHtmlFileName === file.name}>
										{file.name}
									</option>
								{/each}
							</select>
							<div class="text-[10px] text-gray-500">{folderHtmlFiles.length}個のHTMLファイル</div>
						{:else if getLastDirectoryHandle()}
							<div class="text-xs text-gray-500 text-center py-2">
								HTMLファイルがありません
							</div>
						{/if}
					</div>
				{/if}

				{#if selectedContent || selectedHtmlFileName}
					<div class="flex flex-col gap-2 mt-3">
						<!-- Step 1: HTML分割 -->
						<button
							onclick={parseHtml}
							disabled={isParsingHtml || !sourceHtml}
							class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-3 py-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-2"
						>
							{#if isParsingHtml}
								<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
								解析中...
							{:else}
								1. 見出しで分割
							{/if}
						</button>

						<!-- Step 2: 台本生成 -->
						{#if sections.length > 0}
							<button
								onclick={generateScript}
								disabled={isGeneratingScript}
								class="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 px-3 py-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-2"
							>
								{#if isGeneratingScript}
									<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
									{scriptProgress}
								{:else}
									2. 台本を生成 (AI)
								{/if}
							</button>
						{/if}

						<!-- Step 3: 音声生成 -->
						{#if sections.length > 0 && sections.some(s => s.script)}
							<button
								onclick={generateAllAudio}
								disabled={isGeneratingAudio || !voicevoxConnected}
								class="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-3 py-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-2"
							>
								{#if isGeneratingAudio}
									<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
									音声生成中 ({audioProgress.current}/{audioProgress.total})
								{:else}
									3. 全音声を生成
								{/if}
							</button>
						{/if}
					</div>
				{/if}
			</div>

			<!-- 読み込んだコンテンツプレビュー -->
			{#if sourceHtml}
				<div class="flex-1 overflow-hidden flex flex-col min-h-0">
					<div class="px-3 py-2 bg-gray-800 border-b border-gray-700">
						<span class="text-xs font-semibold text-gray-300">読み込んだコンテンツ</span>
					</div>
					<div class="flex-1 overflow-y-auto p-3">
						<div class="text-xs text-gray-400 bg-gray-800 rounded p-2">
							<div class="prose prose-invert prose-xs max-w-none">
								{@html sourceHtml.substring(0, 1500)}{sourceHtml.length > 1500 ? '...' : ''}
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Right: メインコンテンツエリア -->
		<div class="flex-1 flex flex-col overflow-hidden">
			<!-- エラー・成功メッセージ -->
			{#if errorMessage}
				<div class="mx-4 mt-2 px-3 py-2 bg-red-600/20 border border-red-500 rounded text-red-400 text-xs">
					{errorMessage}
				</div>
			{/if}
			{#if successMessage}
				<div class="mx-4 mt-2 px-3 py-2 bg-green-600/20 border border-green-500 rounded text-green-400 text-xs">
					{successMessage}
				</div>
			{/if}

			<!-- メインエリア -->
			<div class="flex-1 p-4 overflow-y-auto">
				{#if sections.length > 0}
					<!-- セクション一覧表示 -->
					<div class="max-w-4xl mx-auto space-y-4">
						<!-- サマリー -->
						<div class="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
							<div>
								<h2 class="text-lg font-bold">{sections.length} セクション</h2>
								<p class="text-gray-400 text-sm">
									推定再生時間: {formatDuration(totalEstimatedDuration)}
								</p>
							</div>
							<div class="flex gap-2">
								{#if sections.some(s => s.script)}
									<span class="px-2 py-1 bg-purple-600/20 border border-purple-500 rounded text-xs text-purple-400">
										台本生成済み
									</span>
								{/if}
								{#if sections.some(s => s.audioUrl)}
									<span class="px-2 py-1 bg-green-600/20 border border-green-500 rounded text-xs text-green-400">
										音声 {sections.filter(s => s.audioUrl).length}/{sections.length}
									</span>
								{/if}
							</div>
						</div>

						<!-- 各セクション -->
						{#each sections as section, i}
							<div class="bg-gray-800 rounded-lg overflow-hidden">
								<!-- ヘッダー -->
								<div class="px-4 py-3 bg-gray-700/50 flex items-center gap-3">
									<span class="px-2 py-1 bg-red-600 rounded text-xs font-medium">
										{section.headingLevel > 0 ? `H${section.headingLevel}` : 'イントロ'}
									</span>
									<span class="text-sm font-semibold flex-1">{section.heading}</span>
									<span class="text-xs text-gray-500">
										約 {formatDuration(estimateAudioDuration(section.script || section.textContent))}
									</span>
								</div>

								<!-- コンテンツ -->
								<div class="p-4 space-y-3">
									<!-- 元テキスト -->
									<div>
										<div class="text-xs text-gray-500 mb-1">元のテキスト</div>
										<div class="text-xs text-gray-400 bg-gray-900/50 rounded p-2 max-h-24 overflow-y-auto">
											{section.textContent.substring(0, 300)}{section.textContent.length > 300 ? '...' : ''}
										</div>
									</div>

									<!-- 台本（編集可能） -->
									<div>
										<div class="flex items-center justify-between mb-1">
											<span class="text-xs text-gray-500">台本（読み上げ用）</span>
											{#if section.script}
												<span class="text-xs text-purple-400">✓ 生成済み</span>
											{/if}
										</div>
										<textarea
											value={section.script || ''}
											onchange={(e) => updateSectionScript(i, (e.target as HTMLTextAreaElement).value)}
											placeholder="台本を生成ボタンを押すか、直接入力してください..."
											class="w-full h-24 bg-gray-700 border border-gray-600 rounded p-2 text-sm text-gray-300 resize-none focus:outline-none focus:border-purple-500"
										></textarea>
									</div>

									<!-- 音声 -->
									<div class="flex items-center gap-2">
										<button
											onclick={() => generateSectionAudio(i)}
											disabled={!voicevoxConnected || !(section.script || section.textContent)}
											class="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded text-xs transition-colors"
										>
											音声生成
										</button>
										{#if section.audioUrl}
											<audio src={section.audioUrl} controls class="h-8 flex-1"></audio>
										{:else}
											<span class="text-xs text-gray-500">音声未生成</span>
										{/if}
									</div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<!-- 接続テスト画面 -->
					<div class="max-w-2xl mx-auto">
						<div class="text-center mb-8">
							<svg class="w-16 h-16 mx-auto mb-4 opacity-50 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
							</svg>
							<h2 class="text-xl font-bold mb-2">動画生成機能</h2>
							<p class="text-gray-400 text-sm">ブログHTMLを動画に変換します</p>
						</div>

						<!-- 接続状態サマリー -->
						<div class="bg-gray-800 rounded-lg p-4 mb-6">
							<h3 class="text-sm font-semibold mb-3">API接続状態</h3>
							<div class="space-y-2">
								<div class="flex items-center justify-between p-2 bg-gray-700/50 rounded">
									<span class="text-sm">VOICEVOX (音声生成)</span>
									<span class="text-xs px-2 py-1 rounded {voicevoxConnected ? 'bg-green-600' : 'bg-red-600'}">
										{voicevoxConnected ? '接続済み' : '未接続'}
									</span>
								</div>
								<div class="flex items-center justify-between p-2 bg-gray-700/50 rounded">
									<span class="text-sm">OpenRouter (AI/画像)</span>
									<span class="text-xs px-2 py-1 rounded bg-green-600">接続済み</span>
								</div>
							</div>
						</div>

						<!-- 処理フロー説明 -->
						<div class="bg-gray-800 rounded-lg p-4">
							<h3 class="text-sm font-semibold mb-3">処理フロー</h3>
							<div class="space-y-2 text-xs text-gray-400">
								<div class="flex items-center gap-2">
									<span class="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-white font-bold">1</span>
									<span>HTMLを見出しごとに分割</span>
								</div>
								<div class="flex items-center gap-2">
									<span class="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-white font-bold">2</span>
									<span>AIで読み上げ用台本を生成</span>
								</div>
								<div class="flex items-center gap-2">
									<span class="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-white font-bold">3</span>
									<span>VOICEVOXで音声ファイルを生成</span>
								</div>
								<div class="flex items-center gap-2">
									<span class="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-white font-bold">4</span>
									<span>スライド/画像を各セクションに割り当て</span>
								</div>
								<div class="flex items-center gap-2">
									<span class="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-white font-bold">5</span>
									<span>音声+画像+字幕をMP4に合成</span>
								</div>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</main>
</div>
