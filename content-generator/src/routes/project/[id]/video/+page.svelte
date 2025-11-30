<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { projectStore, SYSTEM_API_KEY, type Project, type ContentItem } from '$lib/stores';
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
		selectAndLoadVideoProject
	} from '$lib/filesystem';
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
		splitSectionsIntoChunks,
		createBatchScriptPrompt,
		extractScriptsFromResponse,
		mergeBatchScriptResponses,
		calculateTotalChars,
		estimateApiCalls,
		type VideoSection
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

	// セクションからスライドを生成するプロンプト
	function createSlidePrompt(section: VideoSection, index: number): string {
		const theme = DEFAULT_THEMES[selectedSlideTheme];
		return `以下のセクション内容から、プレゼンテーション用のスライドを1枚生成してください。

【セクション情報】
- 番号: ${index + 1}
- 見出し: ${section.heading}
- 内容: ${section.script || section.textContent}

【テーマカラー】
- プライマリ（ヘッダー背景）: ${theme.primaryColor}
- アクセント（強調テキスト）: ${theme.accentColor}
- 背景色: ${theme.backgroundColor}
- テキスト色: ${theme.textColor}
- フォント: ${theme.fontFamily}

【スライド要件】
- サイズ: 1280x720px
- ヘッダーバー（上部80px、プライマリカラー）に見出しを白文字で表示
- 本文は箇条書き形式で要点を3-5個に整理
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
					{ apiKey, model: selectedModel },
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
					title: project?.name || '動画用スライド',
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
			}

			// プロジェクトデータを保存（スライドデータも含める）
			const saveData = {
				sections: sections.map(s => ({
					id: s.id,
					heading: s.heading,
					headingLevel: s.headingLevel,
					textContent: s.textContent,
					script: s.script,
					selectedSlideId: s.selectedSlideId,
					visualType: s.visualType,
					audioFileName: s.audioFileName,
					imageFileName: s.imageFileName
				})),
				sourceHtmlFileName: selectedHtmlFileName || selectedContent?.title,
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
				} : undefined
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

				// スピーカーIDを復元
				selectedSpeakerId = data.speakerId || 3;

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
						visualType: sectionData.visualType as 'ai-image' | 'slide' | 'none',
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

			<!-- スライドデータ状態 -->
			<div class="p-3 bg-gray-800 border-b border-gray-700">
				<div class="flex items-center justify-between mb-2">
					<span class="text-xs font-semibold text-gray-300">スライドデータ</span>
					<button
						onclick={loadSlidesFromFolder}
						disabled={isLoadingSlides || !hasFolderSelected}
						class="text-xs text-blue-400 hover:text-blue-300 disabled:text-gray-500"
					>
						再読み込み
					</button>
				</div>
				{#if isLoadingSlides}
					<div class="text-xs text-gray-400">読み込み中...</div>
				{:else if availableSlides.length > 0}
					<div class="text-xs text-green-400">
						{availableSlides.length}枚のスライドを読み込み済み
					</div>
				{:else if !hasFolderSelected}
					<div class="text-xs text-gray-500">
						フォルダを選択してください
					</div>
				{:else}
					<div class="text-xs text-gray-500">
						スライドデータなし（AI生成可能）
					</div>
				{/if}
			</div>

			<!-- スライドテーマ選択 -->
			<div class="p-3 bg-gray-800 border-b border-gray-700">
				<div class="text-xs font-semibold text-gray-300 mb-2">スライドテーマ</div>
				<select
					bind:value={selectedSlideTheme}
					class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500"
				>
					{#each slideThemeOptions as theme (theme.id)}
						<option value={theme.id}>
							{theme.name} - {theme.description}
						</option>
					{/each}
				</select>
				<!-- テーマプレビュー -->
				<div class="mt-2 flex gap-1">
					<div
						class="w-6 h-6 rounded"
						style="background-color: {DEFAULT_THEMES[selectedSlideTheme].primaryColor}"
						title="プライマリ"
					></div>
					<div
						class="w-6 h-6 rounded"
						style="background-color: {DEFAULT_THEMES[selectedSlideTheme].accentColor}"
						title="アクセント"
					></div>
					<div
						class="w-6 h-6 rounded border border-gray-600"
						style="background-color: {DEFAULT_THEMES[selectedSlideTheme].backgroundColor}"
						title="背景"
					></div>
					<div
						class="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold"
						style="background-color: {DEFAULT_THEMES[selectedSlideTheme].backgroundColor}; color: {DEFAULT_THEMES[selectedSlideTheme].textColor}"
						title="テキスト"
					>Aa</div>
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

			<!-- 台本テンプレート選択 -->
			<div class="p-3 bg-gray-800 border-b border-gray-700">
				<div class="flex items-center justify-between mb-2">
					<span class="text-xs font-semibold text-gray-300">台本テンプレート</span>
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
						{#if hasFolderSelected}
							<div class="text-[10px] text-gray-400 truncate px-1">
								📁 {getLastDirectoryHandle()?.name}
							</div>
						{/if}
						<button
							onclick={async () => {
								const result = await selectFolder();
								if (result.success) {
									hasFolderSelected = true;
									if (result.path && project) {
										await projectStore.updateProject(projectId, { folderPath: result.path });
									}
									await refreshFolderHtmlFiles();
									await loadSlidesFromFolder();
								}
							}}
							class="w-full bg-gray-700 hover:bg-gray-600 px-2 py-1.5 rounded text-xs transition-colors flex items-center justify-center gap-1"
						>
							<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
							</svg>
							{hasFolderSelected ? 'フォルダを変更' : 'フォルダを選択'}
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
						{:else if hasFolderSelected}
							<div class="text-xs text-gray-500 text-center py-2">
								HTMLファイルがありません
							</div>
						{/if}
					</div>
				{/if}

				{#if selectedContent || selectedHtmlFileName || sections.length > 0}
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
									2. 台本を一括生成 (AI)
									{#if estimatedApiCalls > 1}
										<span class="text-purple-300">({estimatedApiCalls}回)</span>
									{/if}
								{/if}
							</button>
						{/if}

						<!-- Step 3: 音声生成 -->
						{#if sections.length > 0 && sections.some(s => s.script)}
							<div class="flex gap-1">
								<button
									onclick={generateAllAudio}
									disabled={isGeneratingAudio || !voicevoxConnected}
									class="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-3 py-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-2"
								>
									{#if isGeneratingAudio}
										<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
										音声生成中 ({audioProgress.current}/{audioProgress.total})
									{:else}
										3. 音声を一括生成 ({sections.length}件)
									{/if}
								</button>
								{#if isGeneratingAudio}
									<button
										onclick={cancelAudio}
										class="px-3 py-2 bg-red-600 hover:bg-red-700 rounded text-xs font-medium transition-colors"
										title="音声生成をキャンセル"
									>
										✕
									</button>
								{/if}
							</div>
						{/if}

						<!-- Step 4: スライド生成 -->
						{#if sections.length > 0 && sections.some(s => s.script)}
							<button
								onclick={generateAllSlides}
								disabled={isGeneratingSlides}
								class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-3 py-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-2"
							>
								{#if isGeneratingSlides}
									<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
									スライド生成中 ({slideProgress.current}/{slideProgress.total})
								{:else}
									4. スライドを一括生成 ({sections.length}件)
								{/if}
							</button>
						{/if}

						<!-- Step 5: 画像生成（オプション） -->
						{#if sections.length > 0 && sections.some(s => s.script)}
							<button
								onclick={generateAllImages}
								disabled={isGeneratingAllImages}
								class="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 px-3 py-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-2"
							>
								{#if isGeneratingAllImages}
									<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
									画像一括生成中 ({imageProgress.current}/{imageProgress.total})
								{:else}
									5. AI画像を生成（オプション）
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

									<!-- ビジュアル（スライド/画像選択） -->
									<div>
										<div class="flex items-center justify-between mb-1">
											<span class="text-xs text-gray-500">ビジュアル</span>
											{#if section.visualType === 'slide' && section.selectedSlideId}
												<span class="text-xs text-blue-400">スライド選択済み</span>
											{:else if section.imageUrl}
												<span class="text-xs text-orange-400">✓ AI画像生成済み</span>
											{/if}
										</div>

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
												スライドデータがありません。<a href="/project/{projectId}/slide-canvas" class="text-blue-400 hover:underline">スライドエディタ</a>で作成・保存してください。
											</div>
										{/if}

										<!-- AI画像生成 or スライドプレビュー -->
										<div class="flex items-start gap-2">
											{#if section.visualType !== 'slide'}
												<button
													onclick={() => generateSectionImage(i)}
													disabled={generatingImageIndex === i || !(section.script || section.textContent)}
													class="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 rounded text-xs transition-colors flex-shrink-0"
												>
													{#if generatingImageIndex === i}
														生成中...
													{:else}
														AI画像生成
													{/if}
												</button>
											{/if}

											<!-- プレビュー表示 -->
											{#if section.selectedSlideId && section.visualType === 'slide'}
												{@const selectedSlide = availableSlides.find(s => s.id === section.selectedSlideId)}
												{@const slideIndex = availableSlides.findIndex(s => s.id === section.selectedSlideId)}
												<div class="flex items-start gap-2">
													<!-- スライド番号ラベル -->
													<div class="flex-shrink-0 text-xs text-blue-400 bg-blue-500/20 px-2 py-1 rounded">
														#{slideIndex + 1}
													</div>
													<!-- スライドプレビュー（1280x720 → 200x112.5） -->
													<div
														class="relative w-[200px] h-[112px] bg-gray-700 rounded border-2 border-blue-500 overflow-hidden flex-shrink-0 cursor-pointer hover:border-blue-400 transition-colors"
														title={selectedSlide?.name || 'スライド'}
													>
														{#if selectedSlide}
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
																			<!-- 矢印の先端 -->
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
																		{@const points = Array.from({length: n * 2}, (_, i) => {
																			const radius = i % 2 === 0 ? outer : inner;
																			const angle = (i * Math.PI / n) - Math.PI / 2;
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
																		{@const points = Array.from({length: sides}, (_, i) => {
																			const angle = (i * 2 * Math.PI / sides) - Math.PI / 2;
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
														{:else}
															<div class="w-full h-full flex items-center justify-center text-xs text-blue-400">
																プレビュー不可
															</div>
														{/if}
													</div>
												</div>
											{:else if section.imageUrl}
												<img src={section.imageUrl} alt={section.heading} class="w-40 h-24 object-cover rounded" />
											{:else}
												<div class="w-40 h-24 bg-gray-700 rounded border border-gray-600 flex items-center justify-center text-xs text-gray-500">
													未設定
												</div>
											{/if}
										</div>
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
