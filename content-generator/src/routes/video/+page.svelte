<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { SYSTEM_API_KEY } from '$lib/stores';
	import {
		selectFolder,
		getLastDirectoryHandle,
		listHtmlFiles,
		loadSlideDataForProject,
		saveVideoProjectData,
		loadVideoProjectData,
		saveVideoAudioFile,
		loadVideoAudioFile,
		saveVideoImageFile,
		loadVideoImageFile,
		selectAndLoadVideoProject,
		loadHtmlFile
	} from '$lib/filesystem';
	import { generateContent, generateImage, IMAGE_GENERATION_MODELS, SLIDE_GENERATION_MODELS, HTML_GENERATION_MODELS } from '$lib/openrouter';
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
		splitSectionsIntoChunks,
		createBatchScriptPrompt,
		extractScriptsFromResponse,
		mergeBatchScriptResponses,
		calculateTotalChars,
		estimateApiCalls,
		type VideoSection,
		type SlideDataForVideo
	} from '$lib/video-utils';
	import { type SlidePresentation, type SlideData, type SlideElement, DEFAULT_THEMES, generateSlideId, generateElementId } from '$lib/slideCanvasTypes';
	import {
		loadTemplates,
		saveTemplates,
		getSelectedTemplateId,
		setSelectedTemplateId,
		addTemplate,
		deleteTemplate,
		createScriptSystemPrompt,
		TONE_STYLES,
		DEFAULT_TEMPLATES,
		type ScriptTemplate
	} from '$lib/script-templates';
	import { saveVideoScriptFile } from '$lib/script-file';
	import {
		generateSubtitlesForSection,
		getWavDuration,
		splitTextForSubtitles,
		assignTimesToSentences,
		type SubtitleEntry,
		type SubtitleSettings,
		DEFAULT_SUBTITLE_SETTINGS
	} from '$lib/subtitle-utils';
	import {
		HP_TEMPLATES,
		getTemplateById,
		getTemplatesByCategory,
		DEFAULT_HP_TEMPLATE_ID,
		type HpTemplate
	} from '$lib/hp-templates';

	// フォルダ名（プロジェクト識別用）
	let folderName = $state('');
	// 一時的なプロジェクトID（ファイル名用）
	let projectId = $state(crypto.randomUUID());

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

	// ソースHTML
	let sourceHtml = $state('');

	// フォルダ内HTMLファイル
	let folderHtmlFiles = $state<{ name: string; content: string }[]>([]);
	let selectedHtmlFileName = $state<string>('');

	// ブラウザでの実行確認
	let isBrowser = $state(false);

	// フォルダ選択状態（リアクティブ用）
	let hasFolderSelected = $state(false);

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

	// スライド生成用モデル（JSON出力）
	let selectedSlideModel = $state(SLIDE_GENERATION_MODELS[0].id);

	// LLMスライド/HP生成用モデル（HTML出力）
	let selectedHtmlModel = $state(HTML_GENERATION_MODELS[0].id);

	// サイズプリセット
	const SIZE_PRESETS = [
		{ id: 'pc', name: 'PC (16:9)', width: 1280, height: 720 },
		{ id: 'smartphone', name: 'スマホ (9:16)', width: 1080, height: 1920 },
		{ id: 'square', name: '正方形 (1:1)', width: 1080, height: 1080 },
	];
	let selectedSizePreset = $state('pc');
	let generateBothSizes = $state(false); // PC+スマホ両方生成
	let currentSize = $derived(SIZE_PRESETS.find(s => s.id === selectedSizePreset) || SIZE_PRESETS[0]);

	// スライドデータ
	let slidePresentation = $state<SlidePresentation | null>(null);
	let availableSlides = $derived(slidePresentation?.slides || []);
	let isLoadingSlides = $state(false);
	let slideLoadError = $state('');

	// 見出し分割されたセクション
	let sections = $state<VideoSection[]>([]);
	let isParsingHtml = $state(false);

	// 台本生成
	let isGeneratingScript = $state(false);
	let scriptProgress = $state('');

	// 台本テンプレート
	let scriptTemplates = $state<ScriptTemplate[]>([]);
	let selectedTemplateId = $state('');
	let selectedTemplate = $derived(scriptTemplates.find(t => t.id === selectedTemplateId) || scriptTemplates[0]);
	let showTemplateEditor = $state(false);
	let editingTemplate = $state<ScriptTemplate | null>(null);

	// 音声生成
	let isGeneratingAudio = $state(false);
	let audioProgress = $state({ current: 0, total: 0 });
	let cancelAudioGeneration = $state(false);

	// 合計推定時間
	let totalEstimatedDuration = $derived(
		sections.reduce((sum, s) => sum + estimateAudioDuration(s.script || s.textContent), 0)
	);

	// 保存・読み込み状態
	let isSaving = $state(false);
	let isLoading = $state(false);
	let hasUnsavedChanges = $state(false);
	let lastSavedAt = $state<string | null>(null);

	// 字幕設定
	let subtitleSettings = $state<SubtitleSettings>({ ...DEFAULT_SUBTITLE_SETTINGS });

	// Video Editor起動
	let isLaunchingEditor = $state(false);

	// サイドバーセクションの開閉状態（シンプル化）
	let sidebarSections = $state({
		content: true, // コンテンツ選択
		voicevox: true, // 音声生成
		aiModel: false, // 台本生成AI
		scriptTemplate: false, // 台本テンプレート
		imageGen: true, // AI画像生成
		slideGen: true, // スライド生成（Canvas形式）
		hpSlideGen: false, // HPスライド生成（Tailwind HTML形式）
	});

	// Canvasスライド生成状態（slide-canvas形式）
	let isGeneratingCanvasSlide = $state(false);
	let canvasSlideProgress = $state({ current: 0, total: 0 });
	let generatingCanvasSlideIndex = $state<number | null>(null);

	// HPスライド生成状態
	let isGeneratingHpSlide = $state(false);
	let hpSlideProgress = $state({ current: 0, total: 0 });
	let generatingHpSlideIndex = $state<number | null>(null);

	// 手動字幕編集
	// セクションごとのカスタム字幕を保持（nullの場合は自動生成を使用）
	let customSubtitles = $state<Map<string, string[]>>(new Map());

	// セクションの字幕を取得（カスタムがあればそれを、なければ自動生成）
	function getSectionSubtitles(sectionId: string, script: string): string[] {
		if (customSubtitles.has(sectionId)) {
			return customSubtitles.get(sectionId)!;
		}
		return splitTextForSubtitles(script, subtitleSettings);
	}

	// 字幕を手動モードに切り替え（自動生成から編集可能に）
	function enableManualSubtitles(sectionId: string, script: string) {
		const auto = splitTextForSubtitles(script, subtitleSettings);
		customSubtitles.set(sectionId, [...auto]);
		customSubtitles = new Map(customSubtitles);
		hasUnsavedChanges = true;
	}

	// 自動生成に戻す
	function resetToAutoSubtitles(sectionId: string) {
		customSubtitles.delete(sectionId);
		customSubtitles = new Map(customSubtitles);
		hasUnsavedChanges = true;
	}

	// 字幕パートを更新
	function updateSubtitlePart(sectionId: string, index: number, newText: string) {
		const parts = customSubtitles.get(sectionId);
		if (parts) {
			parts[index] = newText;
			customSubtitles = new Map(customSubtitles);
			hasUnsavedChanges = true;
		}
	}

	// 字幕パートを追加
	function addSubtitlePart(sectionId: string, afterIndex: number) {
		const parts = customSubtitles.get(sectionId);
		if (parts) {
			parts.splice(afterIndex + 1, 0, '新しい字幕');
			customSubtitles = new Map(customSubtitles);
			hasUnsavedChanges = true;
		}
	}

	// 字幕パートを削除
	function removeSubtitlePart(sectionId: string, index: number) {
		const parts = customSubtitles.get(sectionId);
		if (parts && parts.length > 1) {
			parts.splice(index, 1);
			customSubtitles = new Map(customSubtitles);
			hasUnsavedChanges = true;
		}
	}

	// 字幕パートを上に移動
	function moveSubtitleUp(sectionId: string, index: number) {
		const parts = customSubtitles.get(sectionId);
		if (parts && index > 0) {
			[parts[index - 1], parts[index]] = [parts[index], parts[index - 1]];
			customSubtitles = new Map(customSubtitles);
			hasUnsavedChanges = true;
		}
	}

	// 字幕パートを下に移動
	function moveSubtitleDown(sectionId: string, index: number) {
		const parts = customSubtitles.get(sectionId);
		if (parts && index < parts.length - 1) {
			[parts[index], parts[index + 1]] = [parts[index + 1], parts[index]];
			customSubtitles = new Map(customSubtitles);
			hasUnsavedChanges = true;
		}
	}

	onMount(async () => {
		isBrowser = true;
		// フォルダ選択状態を確認
		hasFolderSelected = !!getLastDirectoryHandle();
		// テンプレートを読み込み
		scriptTemplates = loadTemplates();
		selectedTemplateId = getSelectedTemplateId();
		// フォルダ内HTMLファイル一覧を取得
		await refreshFolderHtmlFiles();
		// VOICEVOX接続確認
		await checkVoicevox();
		// スライドデータを読み込み
		await loadSlidesFromFolder();
		// 注: 動画データの読み込みはユーザーが「読込」ボタンを押した時に行う
	});

	// フォルダからスライドデータを読み込み
	async function loadSlidesFromFolder() {
		if (!projectId || !getLastDirectoryHandle()) return;

		isLoadingSlides = true;
		slideLoadError = '';

		try {
			const result = await loadSlideDataForProject(projectId);
			if (result.success && result.data) {
				const data = result.data as {
					presentation?: SlidePresentation;
				};
				if (data.presentation) {
					slidePresentation = data.presentation;
				}
			}
		} catch (e) {
			slideLoadError = e instanceof Error ? e.message : 'スライドデータの読み込みに失敗しました';
		} finally {
			isLoadingSlides = false;
		}
	}

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
			sourceHtml = file.content;
			errorMessage = '';
			successMessage = '';
		}
	}

	function goBack() {
		goto('/');
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
			// スライドがある場合は自動的に順番に割り当て
			sections = parsed.map((s, index) => {
				const matchingSlide = availableSlides[index];
				return {
					...s,
					script: '', // 台本は後で生成
					visualType: matchingSlide ? 'slide' as const : 'none' as const,
					selectedSlideId: matchingSlide?.id
				};
			});

			const slideMatchCount = sections.filter(s => s.selectedSlideId).length;
			if (slideMatchCount > 0) {
				successMessage = `${sections.length}個のセクションに分割しました（${slideMatchCount}個のスライドを自動割り当て）`;
			} else {
				successMessage = `${sections.length}個のセクションに分割しました`;
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'HTMLの解析に失敗しました';
		} finally {
			isParsingHtml = false;
		}
	}

	// セクションのスライドを選択
	function selectSlideForSection(sectionIndex: number, slideId: string) {
		const slide = availableSlides.find(s => s.id === slideId);
		sections[sectionIndex] = {
			...sections[sectionIndex],
			selectedSlideId: slideId,
			visualType: slideId ? 'slide' : 'none'
		};
	}

	// 推定APIコール数
	let estimatedApiCalls = $derived(sections.length > 0 ? estimateApiCalls(sections) : 0);
	let totalCharCount = $derived(sections.length > 0 ? calculateTotalChars(sections) : 0);

	// AIで台本を一括生成（自動分割対応）
	async function generateScript() {
		if (sections.length === 0 || !selectedTemplate) return;

		isGeneratingScript = true;
		errorMessage = '';
		successMessage = '';

		try {
			// 選択されたテンプレートからシステムプロンプトを生成
			const systemPrompt = createScriptSystemPrompt(selectedTemplate);

			// セクションをチャンクに分割
			const chunks = splitSectionsIntoChunks(sections);
			const totalChunks = chunks.length;
			const allScriptData: { sectionId: string; script: string }[] = [];

			// 各チャンクを順番に処理
			for (let i = 0; i < chunks.length; i++) {
				const chunk = chunks[i];
				scriptProgress = totalChunks > 1
					? `台本を生成中... (${i + 1}/${totalChunks}バッチ) - ${selectedTemplate.name}`
					: `台本を生成中... - ${selectedTemplate.name}`;

				const prompt = createBatchScriptPrompt(chunk, i + 1, totalChunks);
				const response = await generateContent(
					{ apiKey, model: selectedModel },
					[
						{ role: 'system', content: systemPrompt },
						{ role: 'user', content: prompt }
					]
				);

				// レスポンスから台本データを抽出
				const scriptData = extractScriptsFromResponse(response);
				allScriptData.push(...scriptData);
			}

			// 全台本データをマージ
			const currentSlideAssignments = sections.map(s => ({
				selectedSlideId: s.selectedSlideId,
				visualType: s.visualType
			}));

			sections = mergeBatchScriptResponses(allScriptData, sections).map((s, i) => ({
				...s,
				selectedSlideId: currentSlideAssignments[i]?.selectedSlideId,
				visualType: currentSlideAssignments[i]?.visualType || 'none'
			}));

			if (totalChunks > 1) {
				successMessage = `台本の生成が完了しました（${totalChunks}バッチ、${selectedTemplate.name}）`;
			} else {
				successMessage = `台本の生成が完了しました（${selectedTemplate.name}）`;
			}
			hasUnsavedChanges = true;
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
		cancelAudioGeneration = false;
		errorMessage = '';
		successMessage = '';
		audioProgress = { current: 0, total: sections.length };

		try {
			let completedCount = 0;

			for (let i = 0; i < sections.length; i++) {
				// キャンセルチェック
				if (cancelAudioGeneration) {
					successMessage = `音声生成がキャンセルされました（${completedCount}/${sections.length}完了）`;
					break;
				}

				audioProgress = { current: i + 1, total: sections.length };
				const section = sections[i];
				const text = section.script || section.textContent;

				if (!text) {
					completedCount++;
					continue;
				}

				console.log(`generateAllAudio: Processing section ${i + 1}/${sections.length}, ${text.length} chars`);

				const result = await textToSpeech(text, selectedSpeakerId);
				if (result.success && result.audio) {
					// 既存のURLを解放
					if (section.audioUrl) URL.revokeObjectURL(section.audioUrl);

					sections[i] = {
						...section,
						audioData: result.audio,
						audioUrl: createAudioUrl(result.audio)
					};
					completedCount++;
				} else {
					console.warn(`Audio generation failed for section ${i + 1}:`, result.error);
				}

				// セクション間で少し待機（VOICEVOXの負荷軽減）
				if (i < sections.length - 1 && !cancelAudioGeneration) {
					await new Promise(resolve => setTimeout(resolve, 500));
				}
			}

			if (!cancelAudioGeneration) {
				successMessage = `全セクションの音声生成が完了しました（${completedCount}件）`;
			}
			hasUnsavedChanges = true;
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '音声生成に失敗しました';
		} finally {
			isGeneratingAudio = false;
			cancelAudioGeneration = false;
		}
	}

	// 音声生成をキャンセル
	function cancelAudio() {
		cancelAudioGeneration = true;
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
				hasUnsavedChanges = true;
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
		hasUnsavedChanges = true;
	}

	// セクションの画像を生成
	let generatingImageIndex = $state<number | null>(null);

	// 画像生成用のプロンプトを作成（内容を理解して適切なイメージを生成）
	function createImagePrompt(section: VideoSection, sizeOverride?: typeof SIZE_PRESETS[0]): string {
		const content = section.script || section.textContent;
		const size = sizeOverride || currentSize;
		const isVertical = size.height > size.width;
		const isSquare = size.width === size.height;

		// アスペクト比の説明
		let aspectRatioDesc = '16:9 aspect ratio (landscape)';
		if (isVertical) {
			aspectRatioDesc = '9:16 aspect ratio (portrait/vertical)';
		} else if (isSquare) {
			aspectRatioDesc = '1:1 aspect ratio (square)';
		}

		// 内容からキーワードを抽出
		const sentences = content
			.split(/[。．.!！?？]/)
			.map(s => s.trim())
			.filter(s => s.length > 5);

		const contentSummary = sentences.slice(0, 3).join(' ');

		return `Create a professional, modern illustration for an educational video.

Topic: ${section.heading}

Content to visualize:
${contentSummary}

Requirements:
- Style: Clean, modern, professional infographic style
- Colors: Vibrant but professional
- No text in the image
- Abstract or conceptual representation of the topic
- Suitable for ${aspectRatioDesc} (${size.width}x${size.height})
- High quality, detailed illustration
- Convey the main concept visually${isVertical ? '\n- Optimize composition for vertical/mobile viewing' : ''}`;
	}

	async function generateSectionImage(index: number) {
		const section = sections[index];
		const text = section.script || section.textContent;

		if (!text) return;

		generatingImageIndex = index;
		errorMessage = '';

		try {
			// セクションの内容を理解して画像プロンプトを生成
			const imagePrompt = createImagePrompt(section);

			const result = await generateImage(
				{ apiKey, model: selectedImageModel },
				imagePrompt
			);

			if (result.success && result.imageUrl) {
				sections[index] = {
					...section,
					imageUrl: result.imageUrl
				};
				hasUnsavedChanges = true;
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
			hasUnsavedChanges = true;
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '画像生成に失敗しました';
		} finally {
			isGeneratingAllImages = false;
		}
	}

	// ===== スライド一括生成 =====
	let isGeneratingSlides = $state(false);
	let slideProgress = $state({ current: 0, total: 0 });
	let selectedSlideTheme = $state<keyof typeof DEFAULT_THEMES>('satomata');

	// 利用可能なテーマ一覧
	const slideThemeOptions = [
		{ id: 'satomata', name: 'Satomata', description: '青×ピンク、明るい背景' },
		{ id: 'thqInstitute', name: 'THQ Institute', description: '青×ピンク、白背景' },
		{ id: 'modern', name: 'Modern', description: '紫グラデ、ダーク' },
		{ id: 'nature', name: 'Nature', description: '緑×オレンジ、ナチュラル' }
	] as const;

	// ===== HPテンプレート =====
	let hpTemplatePreviewRef: HTMLDivElement | null = $state(null);

	// カラーパレット（HPスライド・スライド共通）
	const colorPalette = [
		{ id: 'blue', name: '青', primary: '#3b82f6', secondary: '#1e40af', bg: 'from-blue-600 to-indigo-700' },
		{ id: 'pink', name: 'ピンク', primary: '#ec4899', secondary: '#be185d', bg: 'from-pink-500 to-rose-600' },
		{ id: 'green', name: '緑', primary: '#10b981', secondary: '#047857', bg: 'from-emerald-500 to-green-700' },
		{ id: 'purple', name: '紫', primary: '#8b5cf6', secondary: '#5b21b6', bg: 'from-purple-500 to-violet-700' },
		{ id: 'orange', name: 'オレンジ', primary: '#f97316', secondary: '#c2410c', bg: 'from-orange-500 to-red-600' },
		{ id: 'cyan', name: 'シアン', primary: '#06b6d4', secondary: '#0e7490', bg: 'from-cyan-500 to-teal-600' },
		{ id: 'dark', name: 'ダーク', primary: '#374151', secondary: '#111827', bg: 'from-gray-800 to-slate-900' },
		{ id: 'white', name: 'ホワイト', primary: '#f3f4f6', secondary: '#e5e7eb', bg: 'from-gray-100 to-white' }
	] as const;

	// 選択中のカラー
	let selectedColorId = $state<string>('blue');

	// HPテンプレートを画像として保存
	async function saveHpTemplateAsImage(section: VideoSection, sizeOverride?: { width: number; height: number }): Promise<string | null> {
		const template = getTemplateById(section.hpTemplateId || DEFAULT_HP_TEMPLATE_ID);
		if (!template) return null;

		const size = sizeOverride || currentSize;

		// 一時的なdivを作成してスライドをレンダリング
		const container = document.createElement('div');
		container.style.position = 'absolute';
		container.style.left = '-9999px';
		container.style.width = `${size.width}px`;
		container.style.height = `${size.height}px`;
		document.body.appendChild(container);

		// テンプレートHTMLを生成
		const html = renderHpTemplateHtml(template, section, size);
		container.innerHTML = html;

		try {
			// html2canvasで画像化
			const html2canvas = (await import('html2canvas')).default;
			const canvas = await html2canvas(container, {
				width: size.width,
				height: size.height,
				scale: 1,
				useCORS: true,
				backgroundColor: null
			});
			const dataUrl = canvas.toDataURL('image/png');
			return dataUrl;
		} catch (e) {
			console.error('Failed to render HP template as image:', e);
			return null;
		} finally {
			document.body.removeChild(container);
		}
	}

	// HPテンプレートのHTMLを生成
	function renderHpTemplateHtml(template: HpTemplate, section: VideoSection, size?: { width: number; height: number }): string {
		const title = section.heading;
		const content = section.script || section.textContent;
		const dimensions = size || currentSize;
		const isVertical = dimensions.height > dimensions.width;

		// コンテンツを箇条書きに分割
		const lines = content.split(/[。\n]/).filter(line => line.trim()).slice(0, isVertical ? 8 : 5);

		let decorationsHtml = '';
		if (template.decorations) {
			decorationsHtml = template.decorations.map(d => `<div class="${d.class}"></div>`).join('');
		}

		// 縦長レイアウトの場合はパディングとフォントサイズを調整
		const paddingClass = isVertical ? 'p-16' : 'p-12';
		const titleSizeClass = isVertical ? 'text-5xl' : '';
		const contentSizeClass = isVertical ? 'text-2xl' : '';

		return `
			<div class="relative w-full h-full flex flex-col items-center justify-center ${paddingClass} overflow-hidden ${template.containerClass}">
				${decorationsHtml}
				<div class="relative z-10 w-full max-w-4xl">
					<h1 class="${template.titleClass} ${titleSizeClass}">${title}</h1>
					<div class="${template.contentClass} ${contentSizeClass}">
						${template.category === 'list'
							? `<ul class="space-y-${isVertical ? '4' : '3'}">${lines.map(line => `<li class="flex items-start gap-3"><span class="text-pink-400 font-bold">•</span>${line}</li>`).join('')}</ul>`
							: `<p>${lines.join('。')}</p>`
						}
					</div>
				</div>
			</div>
		`;
	}

	// HPテンプレートを全セクション分画像として保存
	let isSavingHpImages = $state(false);
	let hpImageProgress = $state({ current: 0, total: 0 });

	async function saveAllHpTemplatesAsImages() {
		const sectionsWithHp = sections.filter(s => s.visualType === 'hp-template' || s.hpTemplateId);
		if (sectionsWithHp.length === 0) {
			errorMessage = 'HPテンプレートが適用されているセクションがありません';
			return;
		}

		isSavingHpImages = true;
		hpImageProgress = { current: 0, total: sectionsWithHp.length };
		errorMessage = '';

		try {
			let savedCount = 0;
			for (let i = 0; i < sectionsWithHp.length; i++) {
				const section = sectionsWithHp[i];
				hpImageProgress.current = i + 1;

				const imageUrl = await saveHpTemplateAsImage(section);
				if (imageUrl) {
					// 画像をvideoフォルダに保存
					const result = await saveVideoImageFile(projectId, `hp-${section.id}`, imageUrl);
					if (result.success) {
						// セクションに画像URLを設定
						const idx = sections.findIndex(s => s.id === section.id);
						if (idx !== -1) {
							sections[idx] = { ...sections[idx], hpTemplateImageUrl: imageUrl, imageFileName: result.fileName };
						}
						savedCount++;
					}
				}
			}

			successMessage = `HPテンプレート画像を${savedCount}枚保存しました`;
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'HPテンプレート画像の保存に失敗しました';
		} finally {
			isSavingHpImages = false;
		}
	}

	// セクションからスライドを生成するプロンプト
	function createSlidePrompt(section: VideoSection, index: number): string {
		const theme = DEFAULT_THEMES[selectedSlideTheme];
		const content = section.script || section.textContent;

		// 内容を文ごとに分割してキーポイントを抽出
		const sentences = content
			.split(/[。．.!！?？]/)
			.map(s => s.trim())
			.filter(s => s.length > 5);

		const keyPoints = sentences.slice(0, 5).map((s, i) => `${i + 1}. ${s}`).join('\n');

		return `以下のセクション内容を深く理解し、プレゼンテーション用のスライドを1枚生成してください。

【セクション情報】
- 番号: ${index + 1}
- 見出し: ${section.heading}

【セクションの全内容】
${content}

【抽出されたキーポイント】
${keyPoints}

【テーマカラー】
- プライマリ（ヘッダー背景）: ${theme.primaryColor}
- アクセント（強調テキスト）: ${theme.accentColor}
- 背景色: ${theme.backgroundColor}
- テキスト色: ${theme.textColor}
- フォント: ${theme.fontFamily}

【スライド要件】
- サイズ: 1280x720px
- ヘッダーバー（上部80px、プライマリカラー）に見出しを白文字で表示
- 内容を理解して、最も重要なポイントを3-5個に整理して箇条書きで表示
- 単なる文の切り出しではなく、内容を要約・整理して伝わりやすく
- 箇条書きの先頭にアクセントカラーで「•」を付ける
- 読みやすいレイアウト

【出力形式】
以下のJSON形式で出力してください。nameには見出しの内容を簡潔に表す名前（10文字以内）を付けてください：
\`\`\`json
{
  "name": "${section.heading.substring(0, 10)}",
  "elements": [
    {"id": "elem-1", "type": "rect", "x": 0, "y": 0, "width": 1280, "height": 80, "fill": "${theme.primaryColor}"},
    {"id": "elem-2", "type": "text", "x": 640, "y": 50, "text": "見出し", "fontSize": 32, "fontFamily": "${theme.fontFamily}", "fontStyle": "bold", "fill": "#ffffff", "align": "center"},
    {"id": "elem-3", "type": "text", "x": 100, "y": 150, "text": "• ポイント1", "fontSize": 28, "fontFamily": "${theme.fontFamily}", "fill": "${theme.textColor}", "align": "left"}
  ]
}
\`\`\``;
	}

	// AIレスポンスからスライドデータを抽出
	function parseSlideResponse(response: string, sectionHeading: string): SlideData | null {
		try {
			const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
			if (jsonMatch) {
				const json = JSON.parse(jsonMatch[1]);
				const theme = DEFAULT_THEMES[selectedSlideTheme];
				// スライド名: AIが生成した名前、なければセクション見出し
				const slideName = json.name && json.name !== 'スライド名'
					? json.name
					: sectionHeading.substring(0, 15);
				return {
					id: generateSlideId(),
					name: slideName,
					backgroundColor: theme.backgroundColor,
					elements: json.elements || []
				};
			}
		} catch (e) {
			console.error('スライドJSON解析エラー:', e);
		}
		return null;
	}

	// 全セクションのスライドを一括生成
	async function generateAllSlides() {
		if (sections.length === 0) return;

		isGeneratingSlides = true;
		errorMessage = '';
		slideProgress = { current: 0, total: sections.length };

		try {
			const generatedSlides: SlideData[] = [];

			for (let i = 0; i < sections.length; i++) {
				slideProgress = { current: i + 1, total: sections.length };
				const section = sections[i];

				const prompt = createSlidePrompt(section, i);
				const response = await generateContent(
					{ apiKey, model: selectedSlideModel },
					[
						{ role: 'system', content: 'あなたはプレゼンテーションデザイナーです。指定されたJSON形式でスライドを生成してください。' },
						{ role: 'user', content: prompt }
					]
				);

				const slideData = parseSlideResponse(response, section.heading);
				if (slideData) {
					generatedSlides.push(slideData);

					// セクションにスライドを割り当て
					sections[i] = {
						...sections[i],
						selectedSlideId: slideData.id,
						visualType: 'slide'
					};
				}
			}

			// slidePresentationを更新または作成
			if (slidePresentation) {
				slidePresentation = {
					...slidePresentation,
					slides: [...slidePresentation.slides, ...generatedSlides],
					updatedAt: new Date().toISOString()
				};
			} else {
				slidePresentation = {
					id: crypto.randomUUID(),
					title: folderName || '動画用スライド',
					slides: generatedSlides,
					theme: DEFAULT_THEMES.satomata,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				};
			}

			successMessage = `${generatedSlides.length}枚のスライドを生成しました`;
			hasUnsavedChanges = true;
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'スライド生成に失敗しました';
		} finally {
			isGeneratingSlides = false;
		}
	}

	// ===== Canvasスライド生成機能（slide-canvas形式） =====

	// Canvasスライド生成用のプロンプト（カラーベース・サイズ対応）
	function createCanvasSlidePrompt(section: VideoSection, index: number, sizeOverride?: typeof SIZE_PRESETS[0]): string {
		const size = sizeOverride || currentSize;
		const content = section.script || section.textContent;
		const color = colorPalette.find(c => c.id === selectedColorId) || colorPalette[0];

		// 内容を文ごとに分割してキーポイントを抽出
		const sentences = content
			.split(/[。．.!！?？]/)
			.map(s => s.trim())
			.filter(s => s.length > 5);

		const keyPoints = sentences.slice(0, 4);
		const isDark = color.id === 'dark';
		const isWhite = color.id === 'white';
		const bgColor = isDark ? '#1f2937' : isWhite ? '#f3f4f6' : color.primary + '20';
		const headerColor = color.primary;
		const textColor = isDark || !isWhite ? '#ffffff' : '#1f2937';
		const bodyTextColor = isDark ? '#e5e7eb' : isWhite ? '#374151' : '#1f2937';

		// サイズに応じたレイアウト調整
		const isVertical = size.height > size.width;
		const headerHeight = isVertical ? 150 : 100;
		const titleY = isVertical ? 80 : 55;
		const titleFontSize = isVertical ? 42 : 36;
		const pointFontSize = isVertical ? 30 : 26;
		const pointStartY = isVertical ? 220 : 160;
		const pointGap = isVertical ? 100 : 70;

		return `以下のコンテンツからSlideData JSON形式でスライドを生成。

## 要件
- サイズ: ${size.width}x${size.height}px (${size.name})
- カラー: ヘッダー ${headerColor}、背景 ${bgColor}
- 3-4個のポイントで箇条書き

## コンテンツ
タイトル: ${section.heading}
キーポイント:
${keyPoints.map((s, i) => `${i + 1}. ${s.substring(0, 30)}`).join('\n')}

## 出力
\`\`\`json
{
  "id": "slide-${index + 1}",
  "name": "${section.heading.substring(0, 30)}",
  "backgroundColor": "${bgColor}",
  "width": ${size.width},
  "height": ${size.height},
  "elements": [
    { "id": "header", "type": "rect", "x": 0, "y": 0, "width": ${size.width}, "height": ${headerHeight}, "fill": "${headerColor}" },
    { "id": "title", "type": "text", "x": ${size.width / 2}, "y": ${titleY}, "text": "タイトル", "fontSize": ${titleFontSize}, "fontStyle": "bold", "fill": "${textColor}", "align": "center" },
    { "id": "point1", "type": "text", "x": ${isVertical ? 60 : 100}, "y": ${pointStartY}, "text": "• ポイント1", "fontSize": ${pointFontSize}, "fill": "${bodyTextColor}", "align": "left" },
    { "id": "point2", "type": "text", "x": ${isVertical ? 60 : 100}, "y": ${pointStartY + pointGap}, "text": "• ポイント2", "fontSize": ${pointFontSize}, "fill": "${bodyTextColor}", "align": "left" }
  ]
}
\`\`\``;
	}

	// レスポンスからSlideData JSONを抽出
	function extractSlideDataFromResponse(response: string): SlideDataForVideo | null {
		try {
			// ```json...``` ブロックを探す
			const jsonMatch = response.match(/```json\s*([\s\S]*?)```/);
			if (jsonMatch) {
				const data = JSON.parse(jsonMatch[1].trim());
				// IDを補完
				if (!data.id) data.id = `slide-${Date.now()}`;
				if (data.elements) {
					data.elements = data.elements.map((el: any, i: number) => ({
						...el,
						id: el.id || `elem-${i}`
					}));
				}
				return data as SlideDataForVideo;
			}
			// 純粋なJSONを探す
			const pureJsonMatch = response.match(/\{[\s\S]*"elements"[\s\S]*\}/);
			if (pureJsonMatch) {
				const data = JSON.parse(pureJsonMatch[0]);
				if (!data.id) data.id = `slide-${Date.now()}`;
				return data as SlideDataForVideo;
			}
		} catch (e) {
			console.error('SlideData JSON解析エラー:', e);
		}
		return null;
	}

	// 単一セクションのCanvasスライド生成
	async function generateCanvasSlideForSection(index: number) {
		const section = sections[index];
		if (!section || !(section.script || section.textContent)) return;

		generatingCanvasSlideIndex = index;
		errorMessage = '';

		try {
			const prompt = createCanvasSlidePrompt(section, index, currentSize);
			const response = await generateContent(
				{ apiKey, model: selectedSlideModel },
				[
					{ role: 'system', content: 'あなたはプロのプレゼンテーションデザイナーです。指定されたJSON形式でスライドを生成してください。' },
					{ role: 'user', content: prompt }
				]
			);

			const slideData = extractSlideDataFromResponse(response);
			if (slideData) {
				sections[index] = {
					...sections[index],
					canvasSlideData: slideData,
					visualType: 'canvas-slide'
				};
				successMessage = 'スライドを生成しました';
				hasUnsavedChanges = true;
			} else {
				errorMessage = 'スライドJSONの抽出に失敗しました';
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'スライド生成に失敗しました';
		} finally {
			generatingCanvasSlideIndex = null;
		}
	}

	// 全セクションのCanvasスライドを一括生成
	async function generateAllCanvasSlides() {
		if (sections.length === 0) return;

		isGeneratingCanvasSlide = true;
		errorMessage = '';
		canvasSlideProgress = { current: 0, total: sections.length };

		try {
			let successCount = 0;

			for (let i = 0; i < sections.length; i++) {
				canvasSlideProgress = { current: i + 1, total: sections.length };
				const section = sections[i];

				if (!(section.script || section.textContent)) continue;

				const prompt = createCanvasSlidePrompt(section, i, currentSize);
				const response = await generateContent(
					{ apiKey, model: selectedSlideModel },
					[
						{ role: 'system', content: 'あなたはプロのプレゼンテーションデザイナーです。指定されたJSON形式でスライドを生成してください。' },
						{ role: 'user', content: prompt }
					]
				);

				const slideData = extractSlideDataFromResponse(response);
				if (slideData) {
					sections[i] = {
						...sections[i],
						canvasSlideData: slideData,
						visualType: 'canvas-slide'
					};
					successCount++;
				}

				// レート制限対策で少し待機
				await new Promise(resolve => setTimeout(resolve, 500));
			}

			successMessage = `${successCount}件のスライドを生成しました`;
			hasUnsavedChanges = true;
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'スライド一括生成に失敗しました';
		} finally {
			isGeneratingCanvasSlide = false;
		}
	}

	// ===== HPテンプレートスライド生成 (LLM使用) =====

	// HP スライド用LLMプロンプトを作成（カラーベース・サイズ対応）
	function createHpSlidePrompt(section: VideoSection, colorId: string, sizeOverride?: typeof SIZE_PRESETS[0]): string {
		const size = sizeOverride || currentSize;
		const content = section.script || section.textContent;
		const heading = section.heading;
		const color = colorPalette.find(c => c.id === colorId) || colorPalette[0];

		const colorHint = color.id === 'white' || color.id === 'dark'
			? `背景: ${color.bg}（グラデーション）、テキスト: ${color.id === 'white' ? '黒系' : '白系'}`
			: `背景: ${color.bg}（グラデーション）、テキスト: 白系、アクセント: ${color.primary}`;

		const isVertical = size.height > size.width;
		const aspectRatio = isVertical ? '9:16（縦長）' : size.width === size.height ? '1:1（正方形）' : '16:9（横長）';

		return `あなたは美しいプレゼンテーションスライドのHTMLデザイナーです。
以下の内容からTailwind CSSを使用した1枚のスライドHTMLを生成してください。

【スライドサイズ】
- 幅: ${size.width}px、高さ: ${size.height}px、${aspectRatio}
- 絶対にこのサイズからはみ出さないこと

【カラースキーム - 必ず守ること】
${colorHint}

【デザイン要件】
- Tailwind CSSのみ使用、bg-gradient-to-br ${color.bg} を背景に
- SVGアイコンやシェイプを装飾として活用
- 要点を箇条書きでシンプルに表示（${isVertical ? '3-5項目' : '2-4項目'}）
- グラスモーフィズムやシャドウを適度に使用
${isVertical ? '- 縦長レイアウト: 上部にタイトル、中央にポイント、適切な余白確保' : ''}

【テキストはみ出し防止】
- overflow-hidden必須、パディング${isVertical ? 'p-6' : 'p-8'}以上
- タイトル最大${isVertical ? '25' : '40'}文字、本文各${isVertical ? '20' : '30'}文字以内
- line-clamp使用

【コンテンツ】
タイトル: ${heading}
本文（要約すること）: ${content}

【出力】HTMLのみ出力（説明不要）
\`\`\`html
<div class="w-[${size.width}px] h-[${size.height}px] overflow-hidden relative bg-gradient-to-br ${color.bg} ...">
</div>
\`\`\``;
	}

	// LLMレスポンスからHTMLを抽出（サイズ対応）
	function extractHtmlFromResponse(response: string): string {
		// ```html ... ``` ブロックを抽出
		const htmlMatch = response.match(/```html\s*([\s\S]*?)\s*```/);
		if (htmlMatch) {
			return htmlMatch[1].trim();
		}

		// HTMLタグを直接探す（どのサイズでもマッチ）
		const divMatch = response.match(/<div[^>]*class="[^"]*w-\[\d+px\][^"]*"[^>]*>[\s\S]*<\/div>/);
		if (divMatch) {
			return divMatch[0].trim();
		}

		return '';
	}

	// フォールバック: テンプレートベースのHTML生成（サイズ対応）
	function generateHpSlideHtmlFallback(section: VideoSection, colorId: string, sizeOverride?: typeof SIZE_PRESETS[0]): string {
		const size = sizeOverride || currentSize;
		const color = colorPalette.find(c => c.id === colorId) || colorPalette[0];
		const content = section.script || section.textContent;
		const isDark = color.id !== 'white';
		const textColor = isDark ? 'text-white' : 'text-gray-800';
		const textColorMuted = isDark ? 'text-white/80' : 'text-gray-600';
		const isVertical = size.height > size.width;

		// 内容を文ごとに分割
		const sentences = content
			.split(/[。．.!！?？]/)
			.map(s => s.trim())
			.filter(s => s.length > 0);

		const maxPoints = isVertical ? 5 : 4;
		const points = sentences.slice(0, maxPoints);

		// タイトルを短縮（縦長は短め）
		const maxHeadingLen = isVertical ? 25 : 40;
		const truncatedHeading = section.heading.length > maxHeadingLen
			? section.heading.substring(0, maxHeadingLen - 3) + '...'
			: section.heading;

		// 各ポイントを制限（縦長は短め）
		const maxPointLen = isVertical ? 20 : 30;
		const truncatedPoints = points.map(p => p.length > maxPointLen ? p.substring(0, maxPointLen - 3) + '...' : p);

		// リスト形式HTML
		const contentHtml = `
			<ul class="${isVertical ? 'space-y-4' : 'space-y-3'} text-left w-full ${isVertical ? 'max-w-sm' : 'max-w-4xl'} mx-auto overflow-hidden">
				${truncatedPoints.map(p => `
					<li class="flex items-start gap-${isVertical ? '3' : '4'}">
						<svg class="w-${isVertical ? '5' : '6'} h-${isVertical ? '5' : '6'} mt-1 flex-shrink-0 ${isDark ? 'text-white/60' : 'text-gray-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
						</svg>
						<span class="${textColorMuted} ${isVertical ? 'text-lg' : 'text-xl'} line-clamp-2 overflow-hidden">${p}</span>
					</li>
				`).join('')}
				${sentences.length > maxPoints ? `<li class="${isDark ? 'text-white/40' : 'text-gray-400'} ${isVertical ? 'text-base' : 'text-lg'} pl-${isVertical ? '8' : '10'}">... 他 ${sentences.length - maxPoints} 件</li>` : ''}
			</ul>
		`;

		return `
			<div class="w-[${size.width}px] h-[${size.height}px] relative overflow-hidden bg-gradient-to-br ${color.bg}">
				<svg class="absolute top-0 right-0 ${isVertical ? 'w-48 h-48' : 'w-64 h-64'} ${isDark ? 'text-white/10' : 'text-black/5'}" viewBox="0 0 200 200" fill="currentColor">
					<circle cx="100" cy="100" r="80" />
				</svg>
				<div class="relative z-10 w-full h-full flex flex-col items-center justify-center ${isVertical ? 'p-8' : 'p-12'} overflow-hidden">
					<h1 class="${isVertical ? 'text-3xl' : 'text-4xl'} font-bold ${textColor} ${isVertical ? 'mb-10' : 'mb-8'} overflow-hidden text-center max-w-full">${truncatedHeading}</h1>
					${contentHtml}
				</div>
			</div>
		`.trim();
	}

	// LLMを使用してHPスライドHTMLを生成（カラーベース）
	async function generateHpSlideHtmlWithLLM(section: VideoSection, colorId: string, size?: typeof SIZE_PRESETS[0]): Promise<string> {
		const sizeToUse = size || currentSize;
		const prompt = createHpSlidePrompt(section, colorId, sizeToUse);

		try {
			const response = await generateContent(
				{ apiKey, model: selectedHtmlModel },
				[{ role: 'user', content: prompt }]
			);

			const html = extractHtmlFromResponse(response);
			if (html) {
				return html;
			}

			// LLM失敗時はフォールバック
			console.warn('LLMからのHTML抽出に失敗、フォールバックを使用');
			return generateHpSlideHtmlFallback(section, colorId, sizeToUse);
		} catch (e) {
			console.error('LLM HP スライド生成エラー:', e);
			// エラー時もフォールバック
			return generateHpSlideHtmlFallback(section, colorId, sizeToUse);
		}
	}

	// 単一セクションのHPスライドを生成 (カラーベース)
	async function generateHpSlideForSection(index: number) {
		const section = sections[index];

		generatingHpSlideIndex = index;
		errorMessage = '';

		try {
			const html = await generateHpSlideHtmlWithLLM(section, selectedColorId);
			if (html) {
				sections[index] = {
					...section,
					hpSlideHtml: html,
					visualType: 'hp-template'
				};
				hasUnsavedChanges = true;
				successMessage = 'HPスライドを生成しました';
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'HPスライド生成に失敗しました';
		} finally {
			generatingHpSlideIndex = null;
		}
	}

	// 全セクションのHPスライドを一括生成
	async function generateAllHpSlides() {
		if (sections.length === 0) return;

		isGeneratingHpSlide = true;
		errorMessage = '';
		hpSlideProgress = { current: 0, total: sections.length };

		try {
			let successCount = 0;

			for (let i = 0; i < sections.length; i++) {
				hpSlideProgress = { current: i + 1, total: sections.length };
				const section = sections[i];

				if (!(section.script || section.textContent)) continue;

				const html = await generateHpSlideHtmlWithLLM(section, selectedColorId);
				if (html) {
					sections[i] = {
						...sections[i],
						hpSlideHtml: html,
						visualType: 'hp-template'
					};
					successCount++;
				}

				// レート制限対策
				await new Promise(resolve => setTimeout(resolve, 500));
			}

			successMessage = `${successCount}件のHPスライドを生成しました`;
			hasUnsavedChanges = true;
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'HPスライド一括生成に失敗しました';
		} finally {
			isGeneratingHpSlide = false;
		}
	}

	// ===== 保存・読み込み機能 =====

	// 動画プロジェクトデータを保存
	async function saveVideoData() {
		if (sections.length === 0 || !projectId) return;

		isSaving = true;
		errorMessage = '';

		try {
			// 音声ファイルを保存し、ファイル名を記録
			for (let i = 0; i < sections.length; i++) {
				const section = sections[i];

				// 音声データがある場合は保存
				if (section.audioData) {
					const audioResult = await saveVideoAudioFile(projectId, section.id, section.audioData);
					if (audioResult.success && audioResult.fileName) {
						sections[i] = { ...section, audioFileName: audioResult.fileName };
					}
				}

				// 画像データがある場合は保存
				if (section.imageUrl) {
					const imageResult = await saveVideoImageFile(projectId, section.id, section.imageUrl);
					if (imageResult.success && imageResult.fileName) {
						sections[i] = { ...section, imageFileName: imageResult.fileName };
					}
				}

				// 台本テキストファイルを保存
				if (section.script) {
					const scriptResult = await saveVideoScriptFile(projectId, section.id, section.script, section.heading);
					if (scriptResult.success && scriptResult.fileName) {
						sections[i] = { ...sections[i], scriptFileName: scriptResult.fileName };
					}
				}
			}

			// 字幕データを生成（設定を適用、手動編集があればそれを使用）
			const allSubtitles: SubtitleEntry[] = [];
			let currentOffset = 0;

			for (const section of sections) {
				if (section.script && section.audioData) {
					const rawDuration = getWavDuration(section.audioData);
					const adjustedDuration = rawDuration / subtitleSettings.playbackRate;

					// 手動編集された字幕があるかチェック
					if (customSubtitles.has(section.id)) {
						// 手動編集されたテキストを使用して時間を割り当て
						const customTexts = customSubtitles.get(section.id)!;
						const entries = assignTimesToSentences(
							customTexts,
							rawDuration,
							section.id,
							subtitleSettings
						);
						// オフセットを適用
						entries.forEach(entry => {
							entry.startTime += currentOffset;
							entry.endTime += currentOffset;
						});
						allSubtitles.push(...entries);
					} else {
						// 自動生成を使用
						const { entries } = generateSubtitlesForSection(
							section.id,
							section.script,
							section.audioData,
							currentOffset,
							subtitleSettings
						);
						allSubtitles.push(...entries);
					}
					currentOffset += adjustedDuration;
				}
			}

			// プロジェクトデータを保存（スライドデータ・字幕データも含める）
			const saveData = {
				sections: sections.map(s => {
					const duration = s.audioData ? getWavDuration(s.audioData) : undefined;
					return {
						id: s.id,
						heading: s.heading,
						headingLevel: s.headingLevel,
						textContent: s.textContent,
						script: s.script,
						selectedSlideId: s.selectedSlideId,
						visualType: s.visualType,
						hpTemplateId: s.hpTemplateId,
						hpSlideHtml: s.hpSlideHtml,
						canvasSlideData: s.canvasSlideData,
						audioFileName: s.audioFileName,
						imageFileName: s.imageFileName,
						scriptFileName: s.scriptFileName,
						duration
					};
				}),
				sourceHtmlFileName: selectedHtmlFileName || 'video',
				speakerId: selectedSpeakerId,
				updatedAt: new Date().toISOString(),
				// スライドデータも保存
				slidePresentation: slidePresentation ? {
					id: slidePresentation.id,
					name: slidePresentation.name,
					slides: slidePresentation.slides.map(slide => ({
						id: slide.id,
						name: slide.name,
						elements: slide.elements,
						background: slide.background
					}))
				} : undefined,
				// 字幕データと設定
				subtitles: allSubtitles,
				subtitleSettings: subtitleSettings,
				// 手動編集された字幕のマッピング（復元用）
				customSubtitleTexts: Object.fromEntries(customSubtitles)
			};

			const result = await saveVideoProjectData(projectId, saveData);

			if (result.success) {
				successMessage = '動画データを保存しました';
				hasUnsavedChanges = false;
				lastSavedAt = new Date().toLocaleString('ja-JP');
			} else {
				errorMessage = result.error || '保存に失敗しました';
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '保存に失敗しました';
		} finally {
			isSaving = false;
		}
	}

	// 保存済み動画データを読み込み（フォルダ選択ダイアログを表示）
	async function loadSavedVideoData() {
		if (!projectId) return;

		isLoading = true;
		errorMessage = '';

		try {
			// フォルダを選択してvideoサブフォルダから読み込み
			const result = await selectAndLoadVideoProject(projectId);

			if (result.success && result.data) {
				const data = result.data;

				// 実際のプロジェクトIDに更新（既存データを読み込んだ場合）
				if (result.actualProjectId) {
					projectId = result.actualProjectId;
					console.log('Project ID updated to:', projectId);
				}

				// フォルダ名を更新
				if (result.folderName) {
					folderName = result.folderName;
					hasFolderSelected = true;
				}

				// スピーカーIDを復元
				selectedSpeakerId = data.speakerId || 3;

				// 字幕設定を復元
				if (data.subtitleSettings) {
					subtitleSettings = { ...DEFAULT_SUBTITLE_SETTINGS, ...data.subtitleSettings };
				}

				// 手動編集された字幕を復元
				if (data.customSubtitleTexts) {
					customSubtitles = new Map(Object.entries(data.customSubtitleTexts));
				} else {
					customSubtitles = new Map();
				}

				// セクションデータを復元
				const loadedSections: VideoSection[] = [];

				for (const sectionData of data.sections) {
					const section: VideoSection = {
						id: sectionData.id,
						heading: sectionData.heading,
						headingLevel: sectionData.headingLevel,
						content: '',
						textContent: sectionData.textContent,
						script: sectionData.script,
						selectedSlideId: sectionData.selectedSlideId,
						visualType: sectionData.visualType as 'ai-image' | 'slide' | 'hp-template' | 'canvas-slide' | 'none',
						hpTemplateId: sectionData.hpTemplateId,
						hpSlideHtml: sectionData.hpSlideHtml,
						canvasSlideData: sectionData.canvasSlideData,
						audioFileName: sectionData.audioFileName,
						imageFileName: sectionData.imageFileName
					};

					// 音声ファイルを読み込み（事前に読み込み済み）
					if (sectionData.audioFileName && result.audioFiles?.has(sectionData.audioFileName)) {
						const audioData = result.audioFiles.get(sectionData.audioFileName)!;
						section.audioData = audioData;
						section.audioUrl = createAudioUrl(audioData);
					}

					// 画像ファイルを読み込み（事前に読み込み済み）
					if (sectionData.imageFileName && result.imageFiles?.has(sectionData.imageFileName)) {
						section.imageUrl = result.imageFiles.get(sectionData.imageFileName);
					}

					loadedSections.push(section);
				}

				sections = loadedSections;
				lastSavedAt = data.updatedAt ? new Date(data.updatedAt).toLocaleString('ja-JP') : null;
				hasUnsavedChanges = false;

				// フォルダが選択されたことを記録（保存ボタンを有効にするため）
				hasFolderSelected = true;

				// スライドデータを復元
				if (data.slidePresentation) {
					slidePresentation = data.slidePresentation as SlidePresentation;
				}

				const folderInfo = result.folderName ? `（${result.folderName}）` : '';
				const slideInfo = data.slidePresentation ? `、スライド${data.slidePresentation.slides.length}枚` : '';
				if (data.sourceHtmlFileName) {
					successMessage = `「${data.sourceHtmlFileName}」の動画データを読み込みました${folderInfo}${slideInfo}`;
				} else {
					successMessage = `動画データを読み込みました${folderInfo}${slideInfo}`;
				}
			} else if (result.error) {
				errorMessage = result.error;
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '読み込みに失敗しました';
		} finally {
			isLoading = false;
		}
	}

	// セクション変更時に未保存フラグを立てる
	function markAsUnsaved() {
		hasUnsavedChanges = true;
	}

	// Video Editorを起動
	async function launchVideoEditor() {
		isLaunchingEditor = true;
		errorMessage = '';
		successMessage = '';

		try {
			// Satomatashiki Video Editorのショートカットパス
			const shortcutPath = 'C:\\Users\\lipto\\Desktop\\satomatashikicontent\\Satoamtashikivideoeditor.lnk';

			// カスタムプロトコルまたはコマンドで起動を試みる
			// ms-windows-store: プロトコルのように、カスタムプロトコルが使えれば最適だが、
			// 通常のWebアプリからはローカルアプリを直接起動できない

			// 代わりに、ユーザーに情報を提供
			const runCommand = `start "" "${shortcutPath}"`;

			// クリップボードにコマンドをコピー
			await navigator.clipboard.writeText(runCommand);

			successMessage = `起動コマンドをクリップボードにコピーしました。\nターミナルまたはWin+Rで実行してください:\n${runCommand}`;
		} catch (e) {
			errorMessage = 'クリップボードへのコピーに失敗しました。手動でVideo Editorを起動してください。';
		} finally {
			isLaunchingEditor = false;
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
				<h1 class="text-lg font-semibold">{folderName || '動画生成'}</h1>
			</div>
			<div class="flex items-center gap-2">
				<!-- 保存状態表示 -->
				{#if lastSavedAt}
					<span class="text-xs text-gray-500">最終保存: {lastSavedAt}</span>
				{/if}
				{#if hasUnsavedChanges}
					<span class="text-xs text-yellow-400">●未保存</span>
				{/if}

				<!-- 読み込みボタン -->
				<button
					onclick={loadSavedVideoData}
					disabled={isLoading}
					class="flex items-center gap-1.5 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 rounded text-xs font-medium transition-colors"
					title="フォルダを選択してvideoデータを読み込み"
				>
					{#if isLoading}
						<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
						読込中...
					{:else}
						<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
						</svg>
						読込
					{/if}
				</button>

				<!-- 保存ボタン -->
				<button
					onclick={saveVideoData}
					disabled={isSaving || sections.length === 0 || !hasFolderSelected}
					class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-xs font-medium transition-colors"
					title={!hasFolderSelected ? 'フォルダを選択してください' : '動画データを保存'}
				>
					{#if isSaving}
						<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
						保存中...
					{:else}
						<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
						</svg>
						保存
					{/if}
				</button>

				<!-- Video Editor起動ボタン -->
				<button
					onclick={launchVideoEditor}
					disabled={isLaunchingEditor}
					class="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded text-xs font-medium transition-colors"
					title="Satomatashiki Video Editorを起動"
				>
					{#if isLaunchingEditor}
						<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
						起動中...
					{:else}
						<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						Editor起動
					{/if}
				</button>

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
			<!-- 全て開く/閉じるボタン -->
			<div class="p-2 bg-gray-900 border-b border-gray-700 flex justify-end gap-2">
				<button
					onclick={() => {
						const allOpen = Object.values(sidebarSections).every(v => v);
						const newState = !allOpen;
						sidebarSections = {
							content: newState,
							voicevox: newState,
							aiModel: newState,
							scriptTemplate: newState,
							imageGen: newState,
							slideGen: newState,
							hpSlideGen: newState,
						};
					}}
					class="text-[10px] text-gray-400 hover:text-gray-200 transition-colors"
				>
					{Object.values(sidebarSections).every(v => v) ? '全て閉じる' : '全て開く'}
				</button>
			</div>

			<!-- ==================== 変換元コンテンツ（一番上）==================== -->
			<div class="bg-gray-800 border-b border-gray-700">
				<button
					onclick={() => sidebarSections.content = !sidebarSections.content}
					class="w-full p-3 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
				>
					<span class="text-xs font-semibold text-blue-400 flex items-center gap-2">
						📄 変換元コンテンツ
						{#if sections.length > 0}
							<span class="text-[10px] text-blue-300">({sections.length}セクション)</span>
						{:else if sourceHtml}
							<span class="text-[10px] text-green-400">読込済</span>
						{/if}
					</span>
					<svg class="w-4 h-4 text-gray-400 transition-transform {sidebarSections.content ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</button>
				{#if sidebarSections.content}
					<div class="px-3 pb-3">
						<div class="space-y-2">
							{#if hasFolderSelected}
								<div class="text-[10px] text-gray-400 truncate px-1">
									📁 {folderName || getLastDirectoryHandle()?.name}
								</div>
							{/if}
							<!-- HTMLファイルを直接選択 -->
							<button
								onclick={async () => {
									const result = await loadHtmlFile();
									if (result.success && result.content) {
										sourceHtml = result.content;
										selectedHtmlFileName = result.fileName || 'direct-loaded.html';
										// セクションをリセット
										sections = [];
									}
								}}
								class="w-full bg-green-600 hover:bg-green-700 px-2 py-1.5 rounded text-xs transition-colors flex items-center justify-center gap-1"
							>
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
								</svg>
								HTMLファイルを直接選択
							</button>

							<div class="text-[10px] text-gray-500 text-center">または</div>

							<!-- フォルダから選択 -->
							<button
								onclick={async () => {
									const result = await selectFolder();
									if (result.success) {
										hasFolderSelected = true;
										folderName = result.path || '';
										await refreshFolderHtmlFiles();
										await loadSlidesFromFolder();
									}
								}}
								class="w-full bg-gray-600 hover:bg-gray-500 px-2 py-1.5 rounded text-xs transition-colors flex items-center justify-center gap-1"
							>
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
								</svg>
								{hasFolderSelected ? 'フォルダを変更' : 'フォルダから選択'}
							</button>
							{#if folderHtmlFiles.length > 0}
								<select
									onchange={(e) => loadHtmlFromFolder((e.target as HTMLSelectElement).value)}
									class="w-full bg-gray-700 border border-blue-500/50 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500"
								>
									<option value="">2. HTMLファイルを選択...</option>
									{#each folderHtmlFiles as file (file.name)}
										<option value={file.name} selected={selectedHtmlFileName === file.name}>
											{file.name}
										</option>
									{/each}
								</select>
								<div class="text-[10px] text-gray-500">{folderHtmlFiles.length}個のHTMLファイル</div>
							{:else if hasFolderSelected}
								<div class="text-xs text-gray-500 text-center py-2">
									HTMLファイルがありません
								</div>
							{/if}
						</div>

						{#if sourceHtml}
							<div class="flex flex-col gap-2 mt-3 pt-3 border-t border-gray-700">
								<div class="text-[10px] text-gray-400 flex items-center justify-between">
									<span>読込済: {selectedHtmlFileName}</span>
									<span>{sourceHtml.length.toLocaleString()}文字</span>
								</div>
								<!-- 分割ボタン -->
								<button
									onclick={parseHtml}
									disabled={isParsingHtml}
									class="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 px-3 py-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-2"
								>
									{#if isParsingHtml}
										<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
										解析中...
									{:else}
										3. 見出しで分割してセクション化
									{/if}
								</button>
							</div>
						{/if}

						{#if sections.length > 0}
							<div class="flex flex-col gap-2 mt-3 pt-3 border-t border-gray-700">
								<div class="text-[10px] text-green-400">✓ {sections.length}セクションに分割済み</div>
								<!-- 台本生成 -->
								<button
									onclick={generateScript}
									disabled={isGeneratingScript}
									class="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 px-3 py-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-2"
								>
									{#if isGeneratingScript}
										<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
										{scriptProgress}
									{:else}
										4. 台本を一括生成 (AI)
									{/if}
								</button>

								<!-- 音声生成 -->
								{#if sections.some(s => s.script)}
									<div class="flex gap-1">
										<button
											onclick={generateAllAudio}
											disabled={isGeneratingAudio || !voicevoxConnected}
											class="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-3 py-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-2"
										>
											{#if isGeneratingAudio}
												<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
												({audioProgress.current}/{audioProgress.total})
											{:else}
												5. 音声一括生成
											{/if}
										</button>
										{#if isGeneratingAudio}
											<button
												onclick={cancelAudio}
												class="px-3 py-2 bg-red-600 hover:bg-red-700 rounded text-xs font-medium transition-colors"
											>
												✕
											</button>
										{/if}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- VOICEVOX設定 -->
			<div class="bg-gray-800 border-b border-gray-700">
				<button
					onclick={() => sidebarSections.voicevox = !sidebarSections.voicevox}
					class="w-full p-3 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
				>
					<span class="text-xs font-semibold text-gray-300 flex items-center gap-2">
						<span class="w-2 h-2 rounded-full {voicevoxConnected ? 'bg-green-400' : 'bg-red-400'}"></span>
						VOICEVOX (音声生成)
					</span>
					<svg class="w-4 h-4 text-gray-400 transition-transform {sidebarSections.voicevox ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</button>
				{#if sidebarSections.voicevox}
					<div class="px-3 pb-3">
						<div class="flex justify-end mb-2">
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
				{/if}
			</div>

			<!-- ==================== AI画像生成 ==================== -->
			<div class="bg-gray-800 border-b border-gray-700">
				<button
					onclick={() => sidebarSections.imageGen = !sidebarSections.imageGen}
					class="w-full p-3 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
				>
					<span class="text-xs font-semibold text-orange-400 flex items-center gap-2">
						🖼️ AI画像生成
						{#if sections.filter(s => s.imageUrl).length > 0}
							<span class="text-[10px] text-orange-300">({sections.filter(s => s.imageUrl).length}/{sections.length})</span>
						{/if}
					</span>
					<svg class="w-4 h-4 text-gray-400 transition-transform {sidebarSections.imageGen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</button>
				{#if sidebarSections.imageGen}
					<div class="px-3 pb-3 space-y-3">
						<p class="text-[10px] text-gray-400">
							OpenRouter経由でAI画像を生成
						</p>
						<!-- モデル選択 -->
						<div>
							<label class="text-[10px] text-gray-400 block mb-1">画像生成モデル</label>
							<select
								bind:value={selectedImageModel}
								class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-orange-500"
							>
								{#each IMAGE_GENERATION_MODELS as model (model.id)}
									<option value={model.id}>
										{model.name} - {model.description}
									</option>
								{/each}
							</select>
						</div>
						<!-- サイズ選択 -->
						<div>
							<label class="text-[10px] text-gray-400 block mb-1">サイズ</label>
							<div class="flex items-center gap-1">
								{#each SIZE_PRESETS as preset}
									<button
										onclick={() => selectedSizePreset = preset.id}
										class="flex-1 px-2 py-1 text-[10px] rounded transition-all {selectedSizePreset === preset.id ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}"
										title="{preset.width}x{preset.height}"
									>
										{preset.name.split(' ')[0]}
									</button>
								{/each}
							</div>
							<p class="text-[10px] text-gray-500 mt-1">{currentSize.width}x{currentSize.height}px</p>
						</div>
						<!-- 一括生成ボタン -->
						<button
							onclick={generateAllImages}
							disabled={isGeneratingAllImages || sections.length === 0 || !sections.some(s => s.script || s.textContent)}
							class="w-full px-3 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 rounded text-xs font-medium transition-colors flex items-center justify-center gap-2"
						>
							{#if isGeneratingAllImages}
								<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
								生成中... ({imageProgress.current}/{imageProgress.total})
							{:else}
								全セクションのAI画像生成 ({sections.length}件)
							{/if}
						</button>
						<!-- テスト生成 -->
						<div class="border-t border-gray-700 pt-2">
							<button
								onclick={testImageGeneration}
								disabled={isTestingImage}
								class="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 px-2 py-1.5 rounded text-xs transition-colors"
							>
								{isTestingImage ? '生成中...' : 'テスト生成'}
							</button>
							{#if testImageUrl}
								<div class="mt-2">
									<img src={testImageUrl} alt="Test" class="w-full rounded" />
								</div>
							{/if}
						</div>
						<p class="text-[10px] text-gray-500">
							※ 画像生成は有料APIを使用します
						</p>
					</div>
				{/if}
			</div>

			<!-- ==================== スライド生成（Canvas形式） ==================== -->
			<div class="bg-gray-800 border-b border-gray-700">
				<button
					onclick={() => sidebarSections.slideGen = !sidebarSections.slideGen}
					class="w-full p-3 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
				>
					<span class="text-xs font-semibold text-cyan-400 flex items-center gap-2">
						📊 スライド生成
						{#if sections.filter(s => s.canvasSlideData).length > 0}
							<span class="text-[10px] text-cyan-300">({sections.filter(s => s.canvasSlideData).length}/{sections.length})</span>
						{:else if availableSlides.length > 0}
							<span class="text-[10px] text-green-400">({availableSlides.length}枚読込)</span>
						{/if}
					</span>
					<svg class="w-4 h-4 text-gray-400 transition-transform {sidebarSections.slideGen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</button>
				{#if sidebarSections.slideGen}
					<div class="px-3 pb-3 space-y-3">
						<p class="text-[10px] text-gray-400">
							Canvas形式（slide-canvasと同じ形式）
						</p>

						<!-- 既存スライド読み込み状態 -->
						<div class="bg-gray-700/50 rounded p-2">
							<div class="flex items-center justify-between mb-1">
								<span class="text-[10px] text-gray-400">読み込み済みスライド</span>
								<button
									onclick={loadSlidesFromFolder}
									disabled={isLoadingSlides || !hasFolderSelected}
									class="text-[10px] text-blue-400 hover:text-blue-300 disabled:text-gray-500"
								>
									再読み込み
								</button>
							</div>
							{#if isLoadingSlides}
								<div class="text-xs text-gray-400">読み込み中...</div>
							{:else if availableSlides.length > 0}
								<div class="text-xs text-green-400">{availableSlides.length}枚</div>
								<!-- ミニサムネイル -->
								<div class="flex gap-1 mt-1 overflow-x-auto">
									{#each availableSlides.slice(0, 5) as slide, idx}
										<div
											class="w-10 h-6 bg-gray-600 rounded flex-shrink-0 overflow-hidden"
											style="background-color: {slide.backgroundColor || '#1f2937'}"
											title="{idx + 1}. {slide.name}"
										></div>
									{/each}
									{#if availableSlides.length > 5}
										<div class="w-10 h-6 bg-gray-600 rounded flex-shrink-0 flex items-center justify-center text-[8px] text-gray-400">
											+{availableSlides.length - 5}
										</div>
									{/if}
								</div>
							{:else}
								<div class="text-[10px] text-gray-500">なし（AI生成可能）</div>
							{/if}
						</div>

						<!-- テーマ選択 -->
						<div>
							<label class="text-[10px] text-gray-400 block mb-1">スライドテーマ</label>
							<div class="flex items-center gap-2">
								<select
									bind:value={selectedSlideTheme}
									class="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-cyan-500"
								>
									{#each slideThemeOptions as theme (theme.id)}
										<option value={theme.id}>{theme.name}</option>
									{/each}
								</select>
								<div class="flex gap-0.5">
									<div class="w-4 h-4 rounded" style="background-color: {DEFAULT_THEMES[selectedSlideTheme].primaryColor}"></div>
									<div class="w-4 h-4 rounded" style="background-color: {DEFAULT_THEMES[selectedSlideTheme].accentColor}"></div>
								</div>
							</div>
						</div>

						<!-- サイズ選択 -->
						<div>
							<label class="text-[10px] text-gray-400 block mb-1">サイズ</label>
							<div class="flex items-center gap-1">
								{#each SIZE_PRESETS as preset}
									<button
										onclick={() => selectedSizePreset = preset.id}
										class="flex-1 px-2 py-1 text-[10px] rounded transition-all {selectedSizePreset === preset.id ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}"
										title="{preset.width}x{preset.height}"
									>
										{preset.name.split(' ')[0]}
									</button>
								{/each}
							</div>
							<p class="text-[10px] text-gray-500 mt-1">{currentSize.width}x{currentSize.height}px</p>
						</div>

						<!-- AI一括生成ボタン -->
						<button
							onclick={generateAllCanvasSlides}
							disabled={isGeneratingCanvasSlide || sections.length === 0 || !sections.some(s => s.script || s.textContent)}
							class="w-full px-3 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 rounded text-xs font-medium transition-colors flex items-center justify-center gap-2"
						>
							{#if isGeneratingCanvasSlide}
								<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
								生成中... ({canvasSlideProgress.current}/{canvasSlideProgress.total})
							{:else}
								全セクションのスライド生成 ({sections.length}件)
							{/if}
						</button>
						<p class="text-[10px] text-gray-500">
							モデル: {SLIDE_GENERATION_MODELS.find(m => m.id === selectedSlideModel)?.name || selectedSlideModel}
						</p>
					</div>
				{/if}
			</div>

			<!-- ==================== HPスライド一括生成 ==================== -->
			<div class="bg-gray-800 border-b border-gray-700">
				<button
					onclick={() => sidebarSections.hpSlideGen = !sidebarSections.hpSlideGen}
					class="w-full p-3 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
				>
					<span class="text-xs font-semibold text-pink-400 flex items-center gap-2">
						🎨 HP一括生成
						{#if sections.filter(s => s.hpSlideHtml).length > 0}
							<span class="text-[10px] text-pink-300">({sections.filter(s => s.hpSlideHtml).length}/{sections.length})</span>
						{/if}
					</span>
					<svg class="w-4 h-4 text-gray-400 transition-transform {sidebarSections.hpSlideGen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</button>
				{#if sidebarSections.hpSlideGen}
					<div class="px-3 pb-3 space-y-3">
						<!-- LLMモデル選択 -->
						<div>
							<label class="text-[10px] text-gray-400 block mb-1">LLMモデル</label>
							<select
								bind:value={selectedHtmlModel}
								class="w-full bg-gray-700 border border-pink-500/50 rounded px-2 py-1 text-xs focus:outline-none focus:border-pink-500"
							>
								{#each HTML_GENERATION_MODELS as model}
									<option value={model.id}>{model.name}</option>
								{/each}
							</select>
						</div>

						<!-- サイズ選択 -->
						<div>
							<label class="text-[10px] text-gray-400 block mb-1">サイズ</label>
							<div class="flex items-center gap-1">
								{#each SIZE_PRESETS as preset}
									<button
										onclick={() => selectedSizePreset = preset.id}
										class="flex-1 px-2 py-1 text-[10px] rounded transition-all {selectedSizePreset === preset.id ? 'bg-pink-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}"
										title="{preset.width}x{preset.height}"
									>
										{preset.name.split(' ')[0]}
									</button>
								{/each}
							</div>
							<p class="text-[10px] text-gray-500 mt-1">{currentSize.width}x{currentSize.height}px</p>
						</div>

						<!-- カラーパレット -->
						<div>
							<label class="text-[10px] text-gray-400 block mb-1">カラー</label>
							<div class="flex items-center gap-2 flex-wrap">
								{#each colorPalette as color}
									<button
										onclick={() => selectedColorId = color.id}
										class="w-6 h-6 rounded-full border-2 transition-all {selectedColorId === color.id ? 'border-white scale-110' : 'border-transparent'}"
										style="background: linear-gradient(135deg, {color.primary}, {color.secondary})"
										title={color.name}
									></button>
								{/each}
							</div>
						</div>

						<!-- 一括生成ボタン -->
						<button
							onclick={generateAllHpSlides}
							disabled={isGeneratingHpSlide || sections.length === 0 || !sections.some(s => s.script || s.textContent)}
							class="w-full px-3 py-2 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-600 rounded text-xs font-medium transition-colors flex items-center justify-center gap-2"
						>
							{#if isGeneratingHpSlide}
								<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
								生成中... ({hpSlideProgress.current}/{hpSlideProgress.total})
							{:else}
								全セクションHP生成 ({sections.length}件)
							{/if}
						</button>

						<!-- 画像保存ボタン -->
						<button
							onclick={saveAllHpTemplatesAsImages}
							disabled={isSavingHpImages || !hasFolderSelected || sections.filter(s => s.hpSlideHtml).length === 0}
							class="w-full px-2 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded text-xs transition-colors"
						>
							{isSavingHpImages ? '保存中...' : '画像一括保存'}
						</button>
					</div>
				{/if}
			</div>

			<!-- AIモデル選択 -->
			<div class="bg-gray-800 border-b border-gray-700">
				<button
					onclick={() => sidebarSections.aiModel = !sidebarSections.aiModel}
					class="w-full p-3 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
				>
					<span class="text-xs font-semibold text-gray-300">台本生成AIモデル</span>
					<svg class="w-4 h-4 text-gray-400 transition-transform {sidebarSections.aiModel ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</button>
				{#if sidebarSections.aiModel}
					<div class="px-3 pb-3">
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
				{/if}
			</div>

			<!-- 台本テンプレート選択 -->
			<div class="bg-gray-800 border-b border-gray-700">
				<button
					onclick={() => sidebarSections.scriptTemplate = !sidebarSections.scriptTemplate}
					class="w-full p-3 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
				>
					<span class="text-xs font-semibold text-gray-300">台本テンプレート</span>
					<svg class="w-4 h-4 text-gray-400 transition-transform {sidebarSections.scriptTemplate ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</button>
				{#if sidebarSections.scriptTemplate}
					<div class="px-3 pb-3">
						<div class="flex justify-end mb-2">
							<button
								onclick={() => {
									editingTemplate = null;
									showTemplateEditor = true;
								}}
								class="text-xs text-blue-400 hover:text-blue-300"
							>
								+ 新規作成
							</button>
						</div>
						<select
							bind:value={selectedTemplateId}
							onchange={() => setSelectedTemplateId(selectedTemplateId)}
							class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500"
						>
							{#each scriptTemplates as template (template.id)}
								<option value={template.id}>
									{template.name}
								</option>
							{/each}
						</select>
						{#if selectedTemplate}
							<div class="mt-2 p-2 bg-gray-700/50 rounded text-[10px] text-gray-400">
								<div class="font-medium text-gray-300 mb-1">{selectedTemplate.characterName}</div>
								<div class="line-clamp-2">{selectedTemplate.characterPersonality}</div>
								<div class="flex gap-2 mt-2">
									<button
										onclick={() => {
											editingTemplate = { ...selectedTemplate };
											showTemplateEditor = true;
										}}
										class="text-blue-400 hover:text-blue-300"
									>
										編集
									</button>
									{#if !selectedTemplate.isDefault}
										<button
											onclick={() => {
												if (confirm('このテンプレートを削除しますか？')) {
													deleteTemplate(selectedTemplate.id);
													scriptTemplates = loadTemplates();
													selectedTemplateId = scriptTemplates[0]?.id || '';
												}
											}}
											class="text-red-400 hover:text-red-300"
										>
											削除
										</button>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>

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
									推定再生時間: {formatDuration(totalEstimatedDuration)} | 文字数: {totalCharCount.toLocaleString()}
									{#if estimatedApiCalls > 1}
										<span class="text-yellow-400 ml-2">（{estimatedApiCalls}回に分割処理）</span>
									{/if}
								</p>
							</div>
							<div class="flex gap-2 flex-wrap">
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
								{#if sections.some(s => s.selectedSlideId)}
									<span class="px-2 py-1 bg-blue-600/20 border border-blue-500 rounded text-xs text-blue-400">
										スライド {sections.filter(s => s.selectedSlideId).length}/{sections.length}
									</span>
								{/if}
								{#if sections.some(s => s.imageUrl)}
									<span class="px-2 py-1 bg-orange-600/20 border border-orange-500 rounded text-xs text-orange-400">
										AI画像 {sections.filter(s => s.imageUrl).length}/{sections.length}
									</span>
								{/if}
							</div>
						</div>

						<!-- 目次（見出しリンク） -->
						<div class="bg-gray-800/50 rounded-lg p-3 sticky top-0 z-10 backdrop-blur-sm border border-gray-700">
							<div class="text-xs font-semibold text-gray-400 mb-2">目次</div>
							<div class="flex flex-wrap gap-1">
								{#each sections as section, i}
									<a
										href="#section-{i}"
										onclick={(e) => {
											e.preventDefault();
											document.getElementById(`section-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
										}}
										class="px-2 py-1 text-xs rounded transition-colors {
											section.headingLevel === 1 ? 'bg-red-600/20 text-red-300 hover:bg-red-600/40' :
											section.headingLevel === 2 ? 'bg-blue-600/20 text-blue-300 hover:bg-blue-600/40' :
											section.headingLevel === 3 ? 'bg-green-600/20 text-green-300 hover:bg-green-600/40' :
											'bg-gray-600/20 text-gray-300 hover:bg-gray-600/40'
										}"
									>
										{i + 1}. {section.heading.substring(0, 15)}{section.heading.length > 15 ? '...' : ''}
									</a>
								{/each}
							</div>
						</div>

						<!-- 各セクション -->
						{#each sections as section, i}
							<div id="section-{i}" class="bg-gray-800 rounded-lg overflow-hidden scroll-mt-20">
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

									<!-- 字幕プレビュー・編集 -->
									{#if section.script}
										{@const isManualMode = customSubtitles.has(section.id)}
										{@const subtitleParts = getSectionSubtitles(section.id, section.script)}
										<div class="border-t border-gray-700 pt-3 mt-3">
											<div class="flex items-center justify-between mb-2">
												<div class="flex items-center gap-2">
													<span class="text-xs text-gray-500">字幕（{subtitleParts.length}分割）</span>
													{#if isManualMode}
														<span class="text-[10px] px-1.5 py-0.5 bg-yellow-600/30 text-yellow-400 rounded">手動編集中</span>
													{:else}
														<span class="text-[10px] px-1.5 py-0.5 bg-blue-600/30 text-blue-400 rounded">自動</span>
													{/if}
												</div>
												<div class="flex items-center gap-2">
													{#if isManualMode}
														<button
															onclick={() => resetToAutoSubtitles(section.id)}
															class="text-[10px] text-gray-400 hover:text-white"
														>
															自動に戻す
														</button>
													{:else}
														<button
															onclick={() => enableManualSubtitles(section.id, section.script)}
															class="text-[10px] text-blue-400 hover:text-blue-300"
														>
															手動編集
														</button>
													{/if}
												</div>
											</div>

											{#if isManualMode}
												<!-- 手動編集モード -->
												<div class="space-y-1">
													{#each subtitleParts as part, partIndex}
														<div class="flex items-center gap-1 group">
															<span class="text-[10px] text-gray-500 w-5 text-right">{partIndex + 1}.</span>
															<input
																type="text"
																value={part}
																onchange={(e) => updateSubtitlePart(section.id, partIndex, (e.target as HTMLInputElement).value)}
																class="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-yellow-500"
															/>
															<span class="text-[10px] text-gray-500 w-8">{part.length}字</span>
															<div class="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
																<button
																	onclick={() => moveSubtitleUp(section.id, partIndex)}
																	disabled={partIndex === 0}
																	class="p-1 text-gray-400 hover:text-white disabled:opacity-30"
																	title="上に移動"
																>
																	<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																		<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
																	</svg>
																</button>
																<button
																	onclick={() => moveSubtitleDown(section.id, partIndex)}
																	disabled={partIndex === subtitleParts.length - 1}
																	class="p-1 text-gray-400 hover:text-white disabled:opacity-30"
																	title="下に移動"
																>
																	<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																		<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
																	</svg>
																</button>
																<button
																	onclick={() => addSubtitlePart(section.id, partIndex)}
																	class="p-1 text-green-400 hover:text-green-300"
																	title="下に追加"
																>
																	<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																		<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
																	</svg>
																</button>
																<button
																	onclick={() => removeSubtitlePart(section.id, partIndex)}
																	disabled={subtitleParts.length <= 1}
																	class="p-1 text-red-400 hover:text-red-300 disabled:opacity-30"
																	title="削除"
																>
																	<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																		<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
																	</svg>
																</button>
															</div>
														</div>
													{/each}
												</div>
											{:else}
												<!-- 自動モード（プレビュー表示） -->
												<div class="flex flex-wrap gap-1">
													{#each subtitleParts as part, partIndex}
														<div class="relative group">
															<div
																class="bg-black/80 text-white text-xs px-2 py-1 rounded max-w-[200px] truncate cursor-pointer hover:bg-black/90"
																title="クリックで編集モードに切り替え"
																onclick={() => enableManualSubtitles(section.id, section.script)}
															>
																<span class="text-gray-500 mr-1">{partIndex + 1}.</span>{part}
															</div>
															<div class="absolute bottom-full left-0 mb-1 hidden group-hover:block z-10 pointer-events-none">
																<div class="bg-gray-900 text-white text-xs p-2 rounded shadow-lg max-w-[300px] whitespace-pre-wrap border border-gray-600">
																	{part}
																	<div class="text-gray-500 mt-1">{part.length}文字</div>
																</div>
															</div>
														</div>
													{/each}
												</div>
												<p class="text-[10px] text-gray-600 mt-1">※クリックで手動編集モードに切り替え</p>
											{/if}
										</div>
									{/if}

									<!-- ビジュアル（スライド/画像選択） -->
									<div>
										<div class="flex items-center justify-between mb-2">
											<span class="text-xs text-gray-500">ビジュアル</span>
											<span class="text-xs px-2 py-0.5 rounded {
												section.visualType === 'ai-image' ? 'bg-orange-500/30 text-orange-300' :
												section.visualType === 'canvas-slide' ? 'bg-cyan-500/30 text-cyan-300' :
												section.visualType === 'hp-template' ? 'bg-pink-500/30 text-pink-300' :
												section.visualType === 'slide' ? 'bg-blue-500/30 text-blue-300' :
												'bg-gray-500/30 text-gray-400'
											}">
												使用中: {
													section.visualType === 'ai-image' ? 'AI画像' :
													section.visualType === 'canvas-slide' ? 'スライド' :
													section.visualType === 'hp-template' ? 'HPスライド' :
													section.visualType === 'slide' ? '既存スライド' :
													'未選択'
												}
											</span>
										</div>

										<!-- 生成済みビジュアル一覧（小サムネイル） -->
										{#if section.imageUrl || section.canvasSlideData || section.hpSlideHtml}
											<div class="mb-3 p-2 bg-gray-800/50 rounded border border-gray-700">
												<div class="text-[10px] text-gray-400 mb-2">生成済みビジュアル（クリックで選択）</div>
												<div class="grid grid-cols-4 gap-2">
													<!-- なし（ビジュアル無効化） -->
													<button
														onclick={() => {
															sections[i] = { ...sections[i], visualType: 'none' };
															hasUnsavedChanges = true;
														}}
														class="relative aspect-video rounded overflow-hidden border-2 transition-all flex items-center justify-center bg-gray-700 {section.visualType === 'none' ? 'border-green-500 ring-2 ring-green-500/50' : 'border-gray-600 hover:border-gray-500'}"
													>
														<svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
														</svg>
														<div class="absolute inset-x-0 bottom-0 bg-black/70 text-[8px] text-center py-0.5 {section.visualType === 'none' ? 'text-green-300' : 'text-gray-400'}">
															{section.visualType === 'none' ? '✓ なし' : 'なし'}
														</div>
													</button>
													<!-- AI画像 -->
													{#if section.imageUrl}
														<button
															onclick={() => {
																sections[i] = { ...sections[i], visualType: 'ai-image' };
																hasUnsavedChanges = true;
															}}
															class="relative aspect-video rounded overflow-hidden border-2 transition-all {section.visualType === 'ai-image' ? 'border-green-500 ring-2 ring-green-500/50' : 'border-orange-500/50 hover:border-orange-400'}"
														>
															<img src={section.imageUrl} alt="AI生成画像" class="w-full h-full object-cover" />
															<div class="absolute inset-x-0 bottom-0 bg-black/70 text-[8px] text-center py-0.5 {section.visualType === 'ai-image' ? 'text-green-300' : 'text-orange-300'}">
																{section.visualType === 'ai-image' ? '✓ AI画像' : 'AI画像'}
															</div>
														</button>
													{/if}

													<!-- スライド -->
													{#if section.canvasSlideData}
														<button
															onclick={() => {
																sections[i] = { ...sections[i], visualType: 'canvas-slide' };
																hasUnsavedChanges = true;
															}}
															class="relative aspect-video rounded overflow-hidden border-2 transition-all {section.visualType === 'canvas-slide' ? 'border-green-500 ring-2 ring-green-500/50' : 'border-cyan-500/50 hover:border-cyan-400'}"
														>
															<svg viewBox="0 0 1280 720" class="w-full h-full" style="background-color: {section.canvasSlideData.backgroundColor || '#dbeafe'}">
																{#if section.canvasSlideData.elements}
																	{#each section.canvasSlideData.elements.slice(0, 5) as element}
																		{#if element.type === 'text'}
																			<text x={element.x} y={element.y} fill={element.fill || '#000'} font-size={element.fontSize || 24}>{element.text?.substring(0, 20)}</text>
																		{:else if element.type === 'rect'}
																			<rect x={element.x} y={element.y} width={element.width || 100} height={element.height || 100} fill={element.fill || '#3b82f6'} />
																		{/if}
																	{/each}
																{/if}
															</svg>
															<div class="absolute inset-x-0 bottom-0 bg-black/70 text-[8px] text-center py-0.5 {section.visualType === 'canvas-slide' ? 'text-green-300' : 'text-cyan-300'}">
																{section.visualType === 'canvas-slide' ? '✓ スライド' : 'スライド'}
															</div>
														</button>
													{/if}

													<!-- HPスライド -->
													{#if section.hpSlideHtml}
														<button
															onclick={() => {
																sections[i] = { ...sections[i], visualType: 'hp-template' };
																hasUnsavedChanges = true;
															}}
															class="relative aspect-video rounded overflow-hidden border-2 transition-all {section.visualType === 'hp-template' ? 'border-green-500 ring-2 ring-green-500/50' : 'border-pink-500/50 hover:border-pink-400'}"
														>
															<iframe
																srcdoc={`<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"><\/script><style>*{margin:0;padding:0;box-sizing:border-box;}html,body{width:100%;height:100%;overflow:hidden;}body>div{width:1280px!important;height:720px!important;overflow:hidden!important;transform:scale(0.1);transform-origin:top left;}</style></head><body>${section.hpSlideHtml}</body></html>`}
																class="w-full h-full border-0 pointer-events-none"
																sandbox="allow-scripts"
																title="HP Preview"
															></iframe>
															<div class="absolute inset-x-0 bottom-0 bg-black/70 text-[8px] text-center py-0.5 {section.visualType === 'hp-template' ? 'text-green-300' : 'text-pink-300'}">
																{section.visualType === 'hp-template' ? '✓ HPスライド' : 'HPスライド'}
															</div>
														</button>
													{/if}
												</div>
											</div>
										{/if}

										<!-- スライド選択 -->
										{#if availableSlides.length > 0}
											<div class="mb-2">
												<select
													value={section.selectedSlideId || ''}
													onchange={(e) => selectSlideForSection(i, (e.target as HTMLSelectElement).value)}
													class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500"
												>
													<option value="">スライドを選択... ({availableSlides.length}枚)</option>
													{#each availableSlides as slide, slideIndex}
														<option value={slide.id}>
															#{slideIndex + 1} {slide.name}
														</option>
													{/each}
												</select>
											</div>
										{:else if isLoadingSlides}
											<div class="mb-2 text-xs text-gray-500 bg-gray-700/50 rounded p-2">
												スライド読み込み中...
											</div>
										{:else if !hasFolderSelected}
											<div class="mb-2 text-xs text-gray-500 bg-gray-700/50 rounded p-2">
												フォルダを選択してスライドを読み込んでください
											</div>
										{:else}
											<div class="mb-2 text-xs text-gray-500 bg-gray-700/50 rounded p-2">
												スライドデータがありません。<a href="/slide-canvas" class="text-blue-400 hover:underline">スライドエディタ</a>で作成・保存してください。
											</div>
										{/if}

										<!-- HP作成 -->
										<div class="mb-3 p-2 bg-pink-900/20 rounded border border-pink-500/30">
											<div class="text-[10px] text-pink-400 mb-2">HP作成</div>
											<div class="flex items-center gap-2 mb-2">
												{#each colorPalette as color}
													<button
														onclick={() => selectedColorId = color.id}
														class="w-5 h-5 rounded-full border-2 transition-all {selectedColorId === color.id ? 'border-white scale-110' : 'border-transparent'}"
														style="background: linear-gradient(135deg, {color.primary}, {color.secondary})"
														title={color.name}
													></button>
												{/each}
											</div>
											<button
												onclick={() => generateHpSlideForSection(i)}
												disabled={generatingHpSlideIndex === i || !(section.script || section.textContent)}
												class="w-full px-3 py-1.5 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-600 rounded text-xs transition-colors flex items-center justify-center gap-2"
											>
												{#if generatingHpSlideIndex === i}
													<span class="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
												{:else}
													HP作成 {section.hpSlideHtml ? '✓' : ''}
												{/if}
											</button>
										</div>

										<!-- AI画像作成（簡略化） -->
										<div class="mb-3">
											<button
												onclick={() => generateImageForSection(i)}
												disabled={generatingImageIndex === i || !apiKey || !(section.script || section.textContent)}
												class="w-full px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 rounded text-xs transition-colors flex items-center justify-center gap-2"
											>
												{#if generatingImageIndex === i}
													<span class="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
												{:else}
													AI画像作成 {section.imageUrl ? '✓' : ''}
												{/if}
											</button>
										</div>

										<!-- スライド作成 -->
										<div class="mb-3 p-2 bg-cyan-900/20 rounded border border-cyan-500/30">
											<div class="text-[10px] text-cyan-400 mb-2">スライド作成</div>
											<div class="flex items-center gap-2 mb-2">
												{#each colorPalette as color}
													<button
														onclick={() => selectedColorId = color.id}
														class="w-5 h-5 rounded-full border-2 transition-all {selectedColorId === color.id ? 'border-white scale-110' : 'border-transparent'}"
														style="background: linear-gradient(135deg, {color.primary}, {color.secondary})"
														title={color.name}
													></button>
												{/each}
											</div>
											<button
												onclick={() => generateCanvasSlideForSection(i)}
												disabled={generatingCanvasSlideIndex === i || !(section.script || section.textContent)}
												class="w-full px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 rounded text-xs transition-colors flex items-center justify-center gap-2"
											>
												{#if generatingCanvasSlideIndex === i}
													<span class="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
												{:else}
													スライド作成 {section.canvasSlideData ? '✓' : ''}
												{/if}
											</button>
										</div>

										<!-- ビジュアルプレビュー（選択されたタイプのみ表示） -->
										{#if section.visualType === 'hp-template' && section.hpSlideHtml}
											<!-- HPテンプレートプレビュー -->
											<div class="mb-3 relative w-full aspect-video rounded overflow-hidden border-2 border-pink-500/50">
												<iframe
													srcdoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><script src="https://cdn.tailwindcss.com"><\/script><style>*{margin:0;padding:0;box-sizing:border-box;}html,body{width:100%;height:100%;overflow:hidden;}body{display:flex;align-items:center;justify-content:center;}body>div{width:1280px!important;height:720px!important;overflow:hidden!important;transform:scale(calc(min(100vw/1280,100vh/720)));transform-origin:center center;flex-shrink:0;}</style></head><body>${section.hpSlideHtml}</body></html>`}
													class="w-full h-full border-0"
													sandbox="allow-scripts"
													title="HP Template Preview"
												></iframe>
												<div class="absolute bottom-1 right-1 text-[8px] text-pink-400 bg-black/50 px-1 rounded z-10">
													HPスライド
												</div>
											</div>
										{:else if section.visualType === 'canvas-slide' && section.canvasSlideData}
											<div class="mb-2 relative w-full aspect-video rounded overflow-hidden border-2 border-cyan-500/50">
												<svg
													viewBox="0 0 1280 720"
													class="w-full h-full"
													style="background-color: {section.canvasSlideData.backgroundColor || '#dbeafe'}"
												>
													{#if section.canvasSlideData.elements && section.canvasSlideData.elements.length > 0}
														{#each section.canvasSlideData.elements as element}
															{#if element.type === 'rect'}
																<rect
																	x={element.x}
																	y={element.y}
																	width={element.width || 100}
																	height={element.height || 100}
																	fill={element.fill || '#3b82f6'}
																	stroke={element.stroke || 'none'}
																	stroke-width={element.strokeWidth || 0}
																/>
															{:else if element.type === 'text'}
																<text
																	x={element.x}
																	y={element.y}
																	fill={element.fill || '#ffffff'}
																	font-size={element.fontSize || 24}
																	font-family={element.fontFamily || 'sans-serif'}
																	font-weight={element.fontStyle?.includes('bold') ? 'bold' : 'normal'}
																	font-style={element.fontStyle?.includes('italic') ? 'italic' : 'normal'}
																	text-anchor={element.align === 'center' ? 'middle' : element.align === 'right' ? 'end' : 'start'}
																>
																	{element.text}
																</text>
															{:else if element.type === 'circle'}
																<circle
																	cx={element.x}
																	cy={element.y}
																	r={(element.width || 50) / 2}
																	fill={element.fill || '#3b82f6'}
																	stroke={element.stroke || 'none'}
																	stroke-width={element.strokeWidth || 0}
																/>
															{:else if element.type === 'line' || element.type === 'arrow'}
																<line
																	x1={element.x}
																	y1={element.y}
																	x2={(element.points?.[2]) ?? (element.x + 100)}
																	y2={(element.points?.[3]) ?? element.y}
																	stroke={element.stroke || '#333333'}
																	stroke-width={element.strokeWidth || 2}
																/>
															{/if}
														{/each}
													{:else}
														<!-- 要素がない場合のフォールバック表示 -->
														<text x="640" y="360" fill="#666" font-size="24" text-anchor="middle">
															{section.canvasSlideData.name || section.heading || 'スライド'}
														</text>
													{/if}
												</svg>
												<div class="absolute bottom-1 right-1 text-[8px] text-cyan-400 bg-black/50 px-1 rounded z-10">
													スライド
												</div>
											</div>
										{:else if section.visualType === 'ai-image' && section.imageUrl}
											<!-- AI画像プレビュー -->
											<div class="mb-3 relative w-full aspect-video rounded overflow-hidden border-2 border-orange-500/50">
												<img src={section.imageUrl} alt={section.heading} class="w-full h-full object-cover" />
												<div class="absolute bottom-1 right-1 text-[8px] text-orange-400 bg-black/50 px-1 rounded z-10">
													AI画像
												</div>
											</div>
										{:else if section.visualType === 'slide' && section.selectedSlideId}
											<!-- 既存スライドプレビュー -->
											{@const selectedSlide = availableSlides.find(s => s.id === section.selectedSlideId)}
											{#if selectedSlide}
												<div class="mb-3 relative w-full aspect-video rounded overflow-hidden border-2 border-blue-500/50">
													<svg
														viewBox="0 0 1280 720"
														class="w-full h-full"
														style="background-color: {selectedSlide.backgroundColor || '#1f2937'}"
													>
														{#each selectedSlide.elements as element}
															{#if element.type === 'rect'}
																<rect
																	x={element.x}
																	y={element.y}
																	width={element.width || 100}
																	height={element.height || 100}
																	fill={element.fill || '#3b82f6'}
																	stroke={element.stroke || 'none'}
																	stroke-width={element.strokeWidth || 0}
																	opacity={element.opacity ?? 1}
																/>
															{:else if element.type === 'text'}
																<text
																	x={element.x}
																	y={element.y}
																	fill={element.fill || '#ffffff'}
																	font-size={element.fontSize || 24}
																	font-family={element.fontFamily || 'sans-serif'}
																	font-weight={element.fontStyle?.includes('bold') ? 'bold' : 'normal'}
																	font-style={element.fontStyle?.includes('italic') ? 'italic' : 'normal'}
																	text-anchor={element.align === 'center' ? 'middle' : element.align === 'right' ? 'end' : 'start'}
																	opacity={element.opacity ?? 1}
																>
																	{element.text}
																</text>
															{:else if element.type === 'circle'}
																<circle
																	cx={element.x}
																	cy={element.y}
																	r={element.radius || 50}
																	fill={element.fill || '#3b82f6'}
																	stroke={element.stroke || 'none'}
																	stroke-width={element.strokeWidth || 0}
																	opacity={element.opacity ?? 1}
																/>
															{:else if element.type === 'line' || element.type === 'arrow'}
																{@const x2 = element.points?.[2] ?? element.x + 100}
																{@const y2 = element.points?.[3] ?? element.y}
																<line
																	x1={element.x}
																	y1={element.y}
																	x2={x2}
																	y2={y2}
																	stroke={element.stroke || '#ffffff'}
																	stroke-width={element.strokeWidth || 2}
																	opacity={element.opacity ?? 1}
																/>
																{#if element.type === 'arrow'}
																	{@const angle = Math.atan2(y2 - element.y, x2 - element.x)}
																	{@const arrowSize = 15}
																	<polygon
																		points="{x2},{y2} {x2 - arrowSize * Math.cos(angle - Math.PI/6)},{y2 - arrowSize * Math.sin(angle - Math.PI/6)} {x2 - arrowSize * Math.cos(angle + Math.PI/6)},{y2 - arrowSize * Math.sin(angle + Math.PI/6)}"
																		fill={element.stroke || '#ffffff'}
																	/>
																{/if}
															{:else if element.type === 'star'}
																{@const n = element.numPoints || 5}
																{@const outer = element.outerRadius || 50}
																{@const inner = element.innerRadius || 25}
																{@const points = Array.from({length: n * 2}, (_, idx) => {
																	const radius = idx % 2 === 0 ? outer : inner;
																	const angle = (idx * Math.PI / n) - Math.PI / 2;
																	return `${element.x + radius * Math.cos(angle)},${element.y + radius * Math.sin(angle)}`;
																}).join(' ')}
																<polygon
																	{points}
																	fill={element.fill || '#f59e0b'}
																	stroke={element.stroke || 'none'}
																	stroke-width={element.strokeWidth || 0}
																	opacity={element.opacity ?? 1}
																/>
															{:else if element.type === 'polygon'}
																{@const sides = element.sides || 6}
																{@const r = element.radius || 50}
																{@const points = Array.from({length: sides}, (_, idx) => {
																	const angle = (idx * 2 * Math.PI / sides) - Math.PI / 2;
																	return `${element.x + r * Math.cos(angle)},${element.y + r * Math.sin(angle)}`;
																}).join(' ')}
																<polygon
																	{points}
																	fill={element.fill || '#3b82f6'}
																	stroke={element.stroke || 'none'}
																	stroke-width={element.strokeWidth || 0}
																	opacity={element.opacity ?? 1}
																/>
															{/if}
														{/each}
													</svg>
													<div class="absolute bottom-1 right-1 text-[8px] text-blue-400 bg-black/50 px-1 rounded z-10">
														既存スライド
													</div>
												</div>
											{/if}
										{:else if section.visualType === 'none' || !section.visualType}
											<!-- なし or 未設定の場合 -->
											<div class="mb-3 relative w-full aspect-video rounded overflow-hidden border-2 border-gray-600 bg-gray-800 flex items-center justify-center">
												<div class="text-center text-gray-500">
													<svg class="w-8 h-8 mx-auto mb-1 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
													</svg>
													<div class="text-xs">ビジュアル未設定</div>
												</div>
											</div>
										{/if}

										<!-- AI画像生成ボタン -->
										<button
											onclick={() => generateSectionImage(i)}
											disabled={generatingImageIndex === i || !(section.script || section.textContent)}
											class="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 rounded text-xs transition-colors"
										>
											{#if generatingImageIndex === i}
												生成中...
											{:else}
												AI画像生成
											{/if}
										</button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{:else if sourceHtml}
					<!-- HTMLプレビュー表示 -->
					<div class="max-w-4xl mx-auto">
						<div class="bg-gray-800 rounded-lg overflow-hidden">
							<!-- ヘッダー -->
							<div class="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
								<div class="flex items-center gap-3">
									<svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
									</svg>
									<h2 class="text-sm font-semibold">読み込んだHTMLコンテンツ</h2>
									{#if selectedHtmlFileName}
										<span class="text-xs text-gray-400">({selectedHtmlFileName})</span>
									{/if}
								</div>
								<div class="flex items-center gap-2">
									<span class="text-xs text-gray-500">{sourceHtml.length.toLocaleString()}文字</span>
									<button
										onclick={parseHtml}
										disabled={isParsingHtml}
										class="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded text-xs font-medium transition-colors"
									>
										{isParsingHtml ? '処理中...' : '見出しで分割してセクション化'}
									</button>
								</div>
							</div>
							<!-- コンテンツプレビュー -->
							<div class="p-4 max-h-[calc(100vh-300px)] overflow-y-auto">
								<div class="prose prose-invert prose-sm max-w-none bg-gray-900/50 rounded-lg p-4">
									{@html sourceHtml}
								</div>
							</div>
						</div>
						<!-- ガイド -->
						<div class="mt-4 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
							<p class="text-sm text-blue-300">
								「見出しで分割してセクション化」をクリックすると、H1/H2/H3タグで区切られたセクションに分割されます。
								分割後、各セクションの台本生成や音声生成が可能になります。
							</p>
						</div>
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

		<!-- Right: 字幕設定パネル -->
		<div class="w-72 flex flex-col border-l border-gray-700 flex-shrink-0 bg-gray-800">
			<div class="p-3 border-b border-gray-700">
				<h2 class="text-sm font-semibold text-gray-300 flex items-center gap-2">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
					</svg>
					字幕設定
				</h2>
			</div>

			<div class="flex-1 overflow-y-auto p-3 space-y-4">
				<!-- 1行あたりの最大文字数 -->
				<div>
					<label class="flex items-center justify-between text-xs text-gray-400 mb-2">
						<span>最大文字数/行</span>
						<span class="text-blue-400 font-medium">{subtitleSettings.maxCharsPerLine}文字</span>
					</label>
					<input
						type="range"
						min="15"
						max="40"
						step="5"
						bind:value={subtitleSettings.maxCharsPerLine}
						class="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
					/>
					<div class="flex justify-between text-[10px] text-gray-500 mt-1">
						<span>15</span>
						<span>25</span>
						<span>40</span>
					</div>
				</div>

				<!-- 1行あたりの最小文字数 -->
				<div>
					<label class="flex items-center justify-between text-xs text-gray-400 mb-2">
						<span>最小文字数/行</span>
						<span class="text-orange-400 font-medium">{subtitleSettings.minCharsPerLine}文字</span>
					</label>
					<input
						type="range"
						min="3"
						max="15"
						step="1"
						bind:value={subtitleSettings.minCharsPerLine}
						class="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-orange-500"
					/>
					<div class="flex justify-between text-[10px] text-gray-500 mt-1">
						<span>3</span>
						<span>8</span>
						<span>15</span>
					</div>
					<p class="text-[10px] text-gray-500 mt-1">
						これより短い断片は前の行と結合されます
					</p>
				</div>

				<!-- 再生倍率 -->
				<div>
					<label class="flex items-center justify-between text-xs text-gray-400 mb-2">
						<span>再生倍率（VOICEVOX話速）</span>
						<span class="text-blue-400 font-medium">{subtitleSettings.playbackRate.toFixed(1)}x</span>
					</label>
					<input
						type="range"
						min="0.5"
						max="2.0"
						step="0.1"
						bind:value={subtitleSettings.playbackRate}
						class="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
					/>
					<div class="flex justify-between text-[10px] text-gray-500 mt-1">
						<span>0.5x</span>
						<span>1.0x</span>
						<span>2.0x</span>
					</div>
					<p class="text-[10px] text-gray-500 mt-2 leading-relaxed">
						VOICEVOXで話速を変更した場合、ここも同じ値に設定してください。
					</p>
				</div>

				<!-- 句読点で分割 -->
				<div class="flex items-center gap-2 py-2">
					<input
						type="checkbox"
						id="splitByPunctuation"
						bind:checked={subtitleSettings.splitByPunctuation}
						class="w-4 h-4 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 accent-blue-500"
					/>
					<label for="splitByPunctuation" class="text-xs text-gray-400">
						句読点（。！？）で分割する
					</label>
				</div>

				<!-- プレビュー表示 -->
				<div class="border-t border-gray-700 pt-4">
					<div class="text-xs text-gray-400 mb-2">プレビュー</div>
					<div class="bg-gray-900 rounded p-3 text-center">
						<div class="bg-black/70 inline-block px-3 py-1 rounded">
							<span class="text-white text-xs">サンプル字幕テキストです。</span>
						</div>
					</div>
					<p class="text-[10px] text-gray-500 mt-2">
						保存時に字幕データが自動生成されます。
					</p>
				</div>

				<!-- 設定情報 -->
				<div class="border-t border-gray-700 pt-4">
					<div class="text-xs text-gray-400 mb-2">現在の設定</div>
					<div class="space-y-1 text-[10px]">
						<div class="flex justify-between">
							<span class="text-gray-500">最大文字数:</span>
							<span class="text-gray-300">{subtitleSettings.maxCharsPerLine}文字/行</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-500">再生倍率:</span>
							<span class="text-gray-300">{subtitleSettings.playbackRate.toFixed(1)}倍速</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-500">分割方法:</span>
							<span class="text-gray-300">{subtitleSettings.splitByPunctuation ? '句読点+文字数' : '文字数のみ'}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</main>
</div>

<!-- テンプレート編集モーダル -->
{#if showTemplateEditor}
	<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
		<div class="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
			<div class="p-4 border-b border-gray-700 flex items-center justify-between">
				<h2 class="text-lg font-bold">
					{editingTemplate ? 'テンプレートを編集' : '新規テンプレート作成'}
				</h2>
				<button
					onclick={() => showTemplateEditor = false}
					class="text-gray-400 hover:text-white"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<form
				onsubmit={(e) => {
					e.preventDefault();
					const form = e.target as HTMLFormElement;
					const formData = new FormData(form);

					const templateData = {
						name: formData.get('name') as string,
						description: formData.get('description') as string,
						characterName: formData.get('characterName') as string,
						characterPersonality: formData.get('characterPersonality') as string,
						speakingStyle: formData.get('speakingStyle') as string,
						toneStyle: formData.get('toneStyle') as 'polite' | 'casual' | 'formal' | 'custom',
						customTone: formData.get('customTone') as string,
						additionalInstructions: formData.get('additionalInstructions') as string
					};

					if (editingTemplate) {
						// 更新
						const templates = loadTemplates();
						const index = templates.findIndex(t => t.id === editingTemplate.id);
						if (index !== -1) {
							templates[index] = {
								...templates[index],
								...templateData,
								updatedAt: new Date()
							};
							saveTemplates(templates);
						}
					} else {
						// 新規作成
						addTemplate(templateData);
					}

					scriptTemplates = loadTemplates();
					showTemplateEditor = false;
				}}
				class="p-4 space-y-4"
			>
				<!-- 基本情報 -->
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class="block text-xs text-gray-400 mb-1">テンプレート名 *</label>
						<input
							type="text"
							name="name"
							value={editingTemplate?.name || ''}
							required
							class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
							placeholder="例: ずんだもん風"
						/>
					</div>
					<div>
						<label class="block text-xs text-gray-400 mb-1">説明</label>
						<input
							type="text"
							name="description"
							value={editingTemplate?.description || ''}
							class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
							placeholder="例: 元気で可愛らしいキャラクター"
						/>
					</div>
				</div>

				<!-- キャラクター設定 -->
				<div class="bg-gray-700/30 rounded-lg p-3 space-y-3">
					<h3 class="text-sm font-semibold text-purple-400">キャラクター設定</h3>

					<div>
						<label class="block text-xs text-gray-400 mb-1">キャラクター名 *</label>
						<input
							type="text"
							name="characterName"
							value={editingTemplate?.characterName || ''}
							required
							class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
							placeholder="例: ずんだもん"
						/>
					</div>

					<div>
						<label class="block text-xs text-gray-400 mb-1">性格・キャラクター説明 *</label>
						<textarea
							name="characterPersonality"
							value={editingTemplate?.characterPersonality || ''}
							required
							rows={3}
							class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-purple-500 resize-none"
							placeholder="例: 東北地方出身の元気で可愛らしいキャラクター。ずんだ餅が大好き。素直で純粋な性格。"
						></textarea>
					</div>

					<div>
						<label class="block text-xs text-gray-400 mb-1">話し方の特徴 *</label>
						<textarea
							name="speakingStyle"
							value={editingTemplate?.speakingStyle || ''}
							required
							rows={2}
							class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-purple-500 resize-none"
							placeholder="例: 語尾に「〜のだ」「〜なのだ」を付ける。元気で明るいトーン。"
						></textarea>
					</div>
				</div>

				<!-- 口調設定 -->
				<div class="bg-gray-700/30 rounded-lg p-3 space-y-3">
					<h3 class="text-sm font-semibold text-purple-400">口調設定</h3>

					<div>
						<label class="block text-xs text-gray-400 mb-1">口調スタイル</label>
						<select
							name="toneStyle"
							value={editingTemplate?.toneStyle || 'polite'}
							class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
						>
							<option value="polite">です・ます調 - 丁寧な敬語表現</option>
							<option value="casual">カジュアル - 親しみやすいフランクな表現</option>
							<option value="formal">フォーマル - 硬めのビジネス調</option>
							<option value="custom">カスタム - 自由に設定</option>
						</select>
					</div>

					<div>
						<label class="block text-xs text-gray-400 mb-1">カスタム口調（「カスタム」選択時）</label>
						<textarea
							name="customTone"
							value={editingTemplate?.customTone || ''}
							rows={2}
							class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-purple-500 resize-none"
							placeholder="例: 語尾は「〜のだ」「〜なのだ」「〜だよ」を使う。可愛らしく元気な話し方。"
						></textarea>
					</div>
				</div>

				<!-- 追加指示 -->
				<div>
					<label class="block text-xs text-gray-400 mb-1">追加指示（オプション）</label>
					<textarea
						name="additionalInstructions"
						value={editingTemplate?.additionalInstructions || ''}
						rows={3}
						class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-purple-500 resize-none"
						placeholder="例: 難しい言葉は簡単に言い換える。視聴者に親しみを込めて話しかける。"
					></textarea>
				</div>

				<!-- ボタン -->
				<div class="flex justify-end gap-2 pt-2">
					<button
						type="button"
						onclick={() => showTemplateEditor = false}
						class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm transition-colors"
					>
						キャンセル
					</button>
					<button
						type="submit"
						class="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm font-medium transition-colors"
					>
						{editingTemplate ? '更新' : '作成'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
