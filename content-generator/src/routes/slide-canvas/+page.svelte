<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { SYSTEM_API_KEY } from '$lib/stores';
	import { generateContent, type OpenRouterConfig, type ChatMessage } from '$lib/openrouter';
	import { saveImageFile, selectFolder, getLastDirectoryHandle, saveJsonFile, loadJsonFile, listHtmlFiles } from '$lib/filesystem';
	import SlideCanvas from '$lib/components/SlideCanvas.svelte';
	import SlideToolbar from '$lib/components/SlideToolbar.svelte';
	import {
		type SlideData,
		type SlideElement,
		type SlidePresentation,
		type SlideTheme,
		SLIDE_SCHEMA_DESCRIPTION,
		generateSlideId,
		generateElementId
	} from '$lib/slideCanvasTypes';
	import {
		SLIDE_TEMPLATES,
		createPresentationFromTemplate,
		createEmptySlide,
		getAllTemplates,
		saveTemplate,
		deleteTemplate,
		savePresentationAsTemplate,
		type SlideTemplate
	} from '$lib/slideCanvasTemplates';
	import { exportPresentationToJson } from '$lib/slideExporter';

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
	let isSaving = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');

	// チャット
	let chatMessages = $state<{ role: 'user' | 'assistant'; content: string }[]>([]);
	let userInput = $state('');

	// ソースHTML
	let sourceHtml = $state('');

	// フォルダ内HTMLファイル
	let folderHtmlFiles = $state<{ name: string; content: string }[]>([]);
	let selectedHtmlFileName = $state<string>('');

	// テンプレート選択・編集
	let selectedTemplateId = $state('blank');
	let templateList = $state<SlideTemplate[]>(SLIDE_TEMPLATES);
	let selectedTemplate = $derived(templateList.find(t => t.id === selectedTemplateId) || templateList[0]);
	let isTemplateEditMode = $state(false);
	let showSaveTemplateModal = $state(false);
	let newTemplateName = $state('');
	// 保存形式選択モーダル
	let showSaveFormatModal = $state(false);
	let saveFormat = $state<'image' | 'pdf'>('image');

	// テンプレートリストを更新
	function refreshTemplateList() {
		templateList = getAllTemplates();
	}

	// プレゼンテーションデータ
	let presentation = $state<SlidePresentation>(createPresentationFromTemplate('blank', '新規プレゼンテーション'));
	let currentSlideIndex = $state(0);
	let selectedElement = $state<SlideElement | null>(null);

	// 現在のテーマ
	let currentTheme = $derived(selectedTemplate.theme);

	// Canvas参照
	let canvasRef = $state<SlideCanvas | null>(null);

	// ブラウザでの実行確認
	let isBrowser = $state(false);
	let isLoadingSlideData = $state(false);
	let hasUnsavedChanges = $state(false);

	onMount(async () => {
		isBrowser = true;
		// カスタムテンプレートを含む全テンプレートを読み込み
		refreshTemplateList();
		// フォルダ内HTMLファイル一覧を取得
		await refreshFolderHtmlFiles();
	});

	// スライドデータをJSONファイルとして保存
	async function saveSlideData() {
		isSaving = true;
		errorMessage = '';
		successMessage = '';

		try {
			if (!getLastDirectoryHandle()) {
				const folderResult = await selectFolder();
				if (!folderResult.success) {
					if (folderResult.error !== 'キャンセルされました') {
						errorMessage = folderResult.error || '保存先フォルダを選択してください';
					}
					isSaving = false;
					return;
				}
			}

			const fileName = `${presentation.title || 'slide_data'}.json`;
			const result = await saveJsonFile('', fileName, {
				presentation,
				selectedTemplateId,
				savedAt: new Date().toISOString()
			});

			if (result.success) {
				successMessage = `スライドデータを保存しました: ${result.filePath}`;
				hasUnsavedChanges = false;
			} else {
				errorMessage = result.error || '保存に失敗しました';
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '保存に失敗しました';
		} finally {
			isSaving = false;
		}
	}

	// スライドデータをJSONファイルから読み込み
	async function loadSlideData() {
		isLoadingSlideData = true;
		errorMessage = '';

		try {
			const result = await loadJsonFile();

			if (result.success && result.data) {
				const data = result.data as {
					presentation?: SlidePresentation;
					selectedTemplateId?: string;
					savedAt?: string;
				};

				if (data.presentation) {
					presentation = data.presentation;
					currentSlideIndex = 0;
					if (data.selectedTemplateId) {
						selectedTemplateId = data.selectedTemplateId;
					}
					successMessage = `スライドデータを読み込みました: ${result.fileName}`;
					hasUnsavedChanges = false;
				} else {
					errorMessage = '有効なスライドデータがありません';
				}
			} else if (result.error !== 'キャンセルされました') {
				errorMessage = result.error || '読み込みに失敗しました';
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '読み込みに失敗しました';
		} finally {
			isLoadingSlideData = false;
		}
	}

	// プレゼンテーションが変更されたらフラグを立てる
	function markAsChanged() {
		hasUnsavedChanges = true;
	}

	// 現在のスライド
	let currentSlide = $derived(presentation.slides[currentSlideIndex] || null);

	// テンプレートを変更
	function changeTemplate(templateId: string) {
		selectedTemplateId = templateId;
		const template = templateList.find(t => t.id === templateId);
		if (template) {
			presentation = createPresentationFromTemplate(templateId, presentation.title);
			currentSlideIndex = 0;
		}
	}

	// 無効な色かどうかをチェック
	function isInvalidColor(color: string | undefined): boolean {
		if (!color) return true;
		const invalidColors = ['#000000', '#000', 'black', 'transparent', '', 'none', 'undefined'];
		return invalidColors.includes(color.toLowerCase());
	}

	// スライドの要素からテーマを自動抽出
	function extractThemeFromSlides(slides: SlideData[]): SlideTheme {
		let primaryColor = '#1e40af';
		let textColor = '#1f2937';
		let backgroundColor = '#ffffff';
		let accentColor = '#3b82f6';
		let fontFamily = 'Hiragino Sans, Noto Sans JP, sans-serif';

		// 全スライドから解析（最初のスライドだけでなく）
		for (const slide of slides) {
			// 背景色
			if (slide.backgroundColor && slide.backgroundColor !== '#ffffff') {
				backgroundColor = slide.backgroundColor;
			}

			for (const elem of slide.elements) {
				// ヘッダーバー（上部の大きな四角形）からprimaryColorを取得
				if (elem.type === 'rect' && elem.y === 0 && (elem.width ?? 0) >= 1000) {
					if (!isInvalidColor(elem.fill) && elem.fill !== '#ffffff') {
						primaryColor = elem.fill!;
					}
				}
				// その他の四角形からaccentColorを取得
				else if (elem.type === 'rect' && elem.y !== 0) {
					if (!isInvalidColor(elem.fill) && elem.fill !== '#ffffff') {
						accentColor = elem.fill!;
					}
				}
				// 円形からもaccentColorを取得
				else if (elem.type === 'circle') {
					if (!isInvalidColor(elem.fill) && elem.fill !== '#ffffff') {
						accentColor = elem.fill!;
					}
				}
				// テキスト要素から色とフォントを取得
				else if (elem.type === 'text') {
					// ヘッダー外のテキストからtextColorを取得
					if ((elem.y ?? 0) >= 100 && !isInvalidColor(elem.fill) && elem.fill !== '#ffffff') {
						textColor = elem.fill!;
					}
					// フォントファミリーを取得
					if (elem.fontFamily) {
						fontFamily = elem.fontFamily;
					}
				}
			}
		}

		// primaryColorがまだ無効なら、textColorまたはaccentColorを使用
		if (isInvalidColor(primaryColor) || primaryColor === '#ffffff') {
			if (!isInvalidColor(textColor) && textColor !== '#ffffff') {
				primaryColor = textColor;
			} else if (!isInvalidColor(accentColor) && accentColor !== '#ffffff') {
				primaryColor = accentColor;
			} else {
				primaryColor = '#1e40af'; // デフォルト
			}
		}

		// textColorがまだ無効ならデフォルト値を設定
		if (isInvalidColor(textColor)) {
			textColor = '#1f2937';
		}

		console.log('Extracted theme:', { primaryColor, accentColor, backgroundColor, textColor, fontFamily });

		return { primaryColor, accentColor, backgroundColor, textColor, fontFamily };
	}

	// 現在のプレゼンテーションをテンプレートとして保存
	function saveAsTemplate() {
		if (!newTemplateName.trim()) return;

		// スライドの要素から実際のテーマを抽出
		const extractedTheme = extractThemeFromSlides(presentation.slides);

		const presentationWithTheme: SlidePresentation = {
			...presentation,
			theme: extractedTheme
		};

		console.log('Saving template with extracted theme:', extractedTheme);

		const newTemplate = savePresentationAsTemplate(
			presentationWithTheme,
			newTemplateName.trim(),
			`${newTemplateName}のカスタムテンプレート`
		);

		refreshTemplateList();
		selectedTemplateId = newTemplate.id;
		showSaveTemplateModal = false;
		newTemplateName = '';
	}

	// テンプレートを削除
	function removeTemplate(templateId: string) {
		if (deleteTemplate(templateId)) {
			refreshTemplateList();
			if (selectedTemplateId === templateId) {
				// 別のテンプレートを選択してプレゼンテーションも再生成
				const remaining = getAllTemplates();
				const newTemplateId = remaining.length > 0 ? remaining[0].id : 'blank';
				changeTemplate(newTemplateId);
			}
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
		selectedContentId = '';
		selectedContent = null;
		const file = folderHtmlFiles.find(f => f.name === fileName);
		if (file) {
			sourceHtml = file.content;
			// ファイル名から拡張子を除去してタイトルに
			const titleFromFile = fileName.replace(/\.(html|htm)$/i, '');
			presentation = {
				...presentation,
				title: titleFromFile + '_スライド'
			};
			errorMessage = '';
			successMessage = '';
			chatMessages = [...chatMessages, {
				role: 'assistant',
				content: `フォルダ内の「${fileName}」を読み込みました。\n\n「スライドを生成」ボタンを押してください。`
			}];
		}
	}

	// スライド追加
	function addSlide() {
		const newSlide = createEmptySlide(selectedTemplateId, presentation.slides.length + 1);
		presentation = {
			...presentation,
			slides: [...presentation.slides, newSlide]
		};
		currentSlideIndex = presentation.slides.length - 1;
	}

	// スライド削除
	function deleteSlide(index: number) {
		if (presentation.slides.length <= 1) return;
		const newSlides = presentation.slides.filter((_, i) => i !== index);
		presentation = { ...presentation, slides: newSlides };
		if (currentSlideIndex >= newSlides.length) {
			currentSlideIndex = newSlides.length - 1;
		}
	}

	// スライドのコピー＆ペースト用クリップボード
	let copiedSlide = $state<SlideData | null>(null);

	// スライドをコピー
	function copySlide(index: number) {
		const slide = presentation.slides[index];
		copiedSlide = JSON.parse(JSON.stringify(slide)); // ディープコピー
		successMessage = `スライド ${index + 1} をコピーしました`;
		setTimeout(() => successMessage = '', 2000);
	}

	// スライドをペースト（現在のスライドの後に挿入）
	function pasteSlide() {
		if (!copiedSlide) {
			errorMessage = 'コピーされたスライドがありません';
			setTimeout(() => errorMessage = '', 2000);
			return;
		}
		// 新しいIDを生成してペースト
		const newSlide: SlideData = {
			...JSON.parse(JSON.stringify(copiedSlide)),
			id: generateSlideId(),
			name: `${copiedSlide.name} (コピー)`,
			elements: copiedSlide.elements.map(elem => ({
				...elem,
				id: generateElementId()
			}))
		};
		// 現在のスライドの後に挿入
		const newSlides = [
			...presentation.slides.slice(0, currentSlideIndex + 1),
			newSlide,
			...presentation.slides.slice(currentSlideIndex + 1)
		];
		presentation = { ...presentation, slides: newSlides };
		currentSlideIndex = currentSlideIndex + 1;
		markAsChanged();
		successMessage = 'スライドをペーストしました';
		setTimeout(() => successMessage = '', 2000);
	}

	// スライドを複製（現在のスライドをその場で複製）
	function duplicateSlide(index: number) {
		const slide = presentation.slides[index];
		const newSlide: SlideData = {
			...JSON.parse(JSON.stringify(slide)),
			id: generateSlideId(),
			name: `${slide.name} (コピー)`,
			elements: slide.elements.map(elem => ({
				...elem,
				id: generateElementId()
			}))
		};
		const newSlides = [
			...presentation.slides.slice(0, index + 1),
			newSlide,
			...presentation.slides.slice(index + 1)
		];
		presentation = { ...presentation, slides: newSlides };
		currentSlideIndex = index + 1;
		markAsChanged();
	}

	// スライドの更新
	function updateSlide(slideData: SlideData) {
		const newSlides = presentation.slides.map((slide, i) =>
			i === currentSlideIndex ? slideData : slide
		);
		presentation = { ...presentation, slides: newSlides };
		markAsChanged();
	}

	// 要素を追加
	function addElement(element: SlideElement) {
		if (!currentSlide) return;
		const updatedSlide = {
			...currentSlide,
			elements: [...currentSlide.elements, element]
		};
		updateSlide(updatedSlide);
	}

	// 選択要素を削除
	function deleteSelectedElement() {
		if (!canvasRef || !selectedElement) return;
		canvasRef.deleteSelectedElement();
		selectedElement = null;
	}

	// 選択要素を更新
	function updateSelectedElement(updates: Partial<SlideElement>) {
		if (!selectedElement || !currentSlide) return;
		const updatedElements = currentSlide.elements.map(elem =>
			elem.id === selectedElement!.id ? { ...elem, ...updates } : elem
		);
		updateSlide({ ...currentSlide, elements: updatedElements });
		// selectedElementも更新して、ツールバーの表示を連動させる
		selectedElement = { ...selectedElement, ...updates };
	}

	// 背景色を変更
	function changeBackgroundColor(color: string) {
		if (!currentSlide) return;
		updateSlide({ ...currentSlide, backgroundColor: color });
	}

	// AIシステムプロンプト
	function getSystemPrompt(): string {
		// 選択中のテンプレートの詳細情報を取得
		const template = templateList.find(t => t.id === selectedTemplateId);
		const theme = template?.theme || currentTheme;
		const isSatomata = selectedTemplateId === 'satomata' || template?.name?.includes('さとまた');

		return `あなたはプロのプレゼンテーションデザイナーです。
JSON形式でスライドデータを生成してください。

═══════════════════════════════════════════════════════════
【絶対厳守】スライドサイズ
═══════════════════════════════════════════════════════════
- 幅: 1280px（横）
- 高さ: 720px（縦）
- アスペクト比: 16:9（横長プレゼンテーション形式）

═══════════════════════════════════════════════════════════
【絶対厳守】テンプレートカラー「${template?.name || 'デフォルト'}」
═══════════════════════════════════════════════════════════
- メインカラー: ${theme.primaryColor}
- アクセント色: ${theme.accentColor}
- スライド背景色: ${theme.backgroundColor}
- 本文テキスト色: ${theme.textColor}
- フォント: ${theme.fontFamily}

═══════════════════════════════════════════════════════════
【絶対厳守】スライド構造
═══════════════════════════════════════════════════════════
${isSatomata ? `
■ タイトルスライド（1枚目）さとまた式:
  - 外枠: { "type": "rect", "x": 0, "y": 0, "width": 1280, "height": 720, "fill": "transparent", "stroke": "#3F51B5", "strokeWidth": 20 }
  - メインタイトル: { "type": "text", "x": 640, "y": 285, "fontSize": 150, "fontStyle": "bold", "fill": "#3F51B5", "align": "center" }
  - サブタイトル: { "type": "text", "x": 640, "y": 454, "fontSize": 32, "fill": "#E91E63", "align": "center" }

■ コンテンツスライド（2枚目以降）さとまた式:
  - ヘッダーバー: { "type": "rect", "x": 0, "y": 0, "width": 1280, "height": 200, "fill": "#3F51B5" }
  - ヘッダータイトル: { "type": "text", "x": 640, "y": 73, "fontSize": 56, "fontStyle": "bold", "fill": "#ffffff", "align": "center" }
  - 本文テキスト: { "type": "text", "x": 100, "y": 270, "fontSize": 56, "fontStyle": "bold", "fill": "#3F51B5", "align": "left" }
` : `
■ タイトルスライド（1枚目）:
  - 上部ライン: { "type": "rect", "x": 0, "y": 0, "width": 1280, "height": 8, "fill": "${theme.primaryColor}" }
  - メインタイトル: { "type": "text", "x": 640, "y": 300, "fontSize": 64, "fontStyle": "bold", "fill": "${theme.textColor}", "align": "center" }
  - サブタイトル: { "type": "text", "x": 640, "y": 420, "fontSize": 32, "fill": "${theme.primaryColor}", "align": "center" }

■ コンテンツスライド（2枚目以降）:
  - ヘッダーバー: { "type": "rect", "x": 0, "y": 0, "width": 1280, "height": 100, "fill": "${theme.primaryColor}" }
  - ヘッダータイトル: { "type": "text", "x": 640, "y": 55, "fontSize": 36, "fontStyle": "bold", "fill": "#ffffff", "align": "center" }
  - 本文テキスト: { "type": "text", "x": 100, "y": 160, "fontSize": 26, "fill": "${theme.textColor}", "align": "left" }
`}
═══════════════════════════════════════════════════════════
【厳守】テキスト配置ルール
═══════════════════════════════════════════════════════════
- 中央揃え: x: 640, align: "center"
- 左揃え: x: 100, align: "left"
${isSatomata ? `- 本文開始位置: y: 270（ヘッダー高さ200px + 70px）
- 本文行間隔: 70px
- 本文フォントサイズ: 56px（太字）` : `- 本文開始位置: y: 160（ヘッダー下60px）
- 本文行間隔: 50〜60px
- 本文フォントサイズ: 26px`}
- 本文最大y座標: 650（下部余白確保）

═══════════════════════════════════════════════════════════
【使用可能な要素タイプ】
═══════════════════════════════════════════════════════════
text, rect, circle, line, arrow, star のみ
※ image は使用禁止

═══════════════════════════════════════════════════════════
【出力形式】
═══════════════════════════════════════════════════════════
必ず \`\`\`json で囲んだJSON配列として出力`;
	}

	// AIが生成したスライドデータを正規化（IDを補完、画像を除外、テンプレートカラー適用）
	function normalizeSlideData(slides: any[]): SlideData[] {
		const allowedTypes = ['text', 'rect', 'circle', 'line', 'arrow', 'star'];

		// 選択されているテンプレートのテーマを確実に取得
		const currentTemplate = templateList.find(t => t.id === selectedTemplateId);
		const theme: SlideTheme = currentTemplate?.theme || {
			primaryColor: '#1e40af',
			accentColor: '#3b82f6',
			backgroundColor: '#ffffff',
			textColor: '#1f2937',
			fontFamily: 'Hiragino Sans, Noto Sans JP, sans-serif'
		};

		console.log('=== normalizeSlideData ===');
		console.log('Selected template ID:', selectedTemplateId);
		console.log('Template found:', currentTemplate?.name);
		console.log('Is custom template:', currentTemplate?.isCustom);
		console.log('Template theme object:', currentTemplate?.theme);
		console.log('Theme colors being used:', {
			primaryColor: theme.primaryColor,
			accentColor: theme.accentColor,
			backgroundColor: theme.backgroundColor,
			textColor: theme.textColor
		});

		return slides.map((slide, slideIndex) => {
			let elements = Array.isArray(slide.elements)
				? slide.elements
					.filter((elem: any) => allowedTypes.includes(elem.type))
					.map((elem: any) => {
						const normalized: any = {
							...elem,
							id: elem.id || generateElementId(),
							type: elem.type || 'text',
							x: elem.x ?? 0,
							y: elem.y ?? 0
						};

						// テキスト要素の配置と色を正規化
						if (normalized.type === 'text') {
							// alignが指定されていない場合、x座標から推測
							if (!normalized.align) {
								normalized.align = normalized.x >= 500 ? 'center' : 'left';
							}
							// 中央揃えの場合、xを640に統一
							if (normalized.align === 'center') {
								normalized.x = 640;
							}
							// 左揃えでxが0の場合は100に修正
							if (normalized.align === 'left' && normalized.x < 50) {
								normalized.x = 100;
							}
							// ヘッダー内テキスト（y < 100）は白色に強制
							if (normalized.y < 100) {
								normalized.fill = '#ffffff';
							}
							// 本文テキストはテーマカラーに強制適用（黒や未設定の場合）
							else if (!normalized.fill || normalized.fill === '#000000' || normalized.fill === '#000' || normalized.fill === 'black') {
								normalized.fill = theme.textColor;
							}
							// フォントファミリーを設定
							if (!normalized.fontFamily) {
								normalized.fontFamily = theme.fontFamily;
							}
						}

						// 四角形要素
						if (normalized.type === 'rect') {
							// ストローク付きの外枠（さとまた式タイトルスライド）はそのまま維持
							const hasStroke = elem.stroke || elem.strokeWidth;
							const isTransparentFill = elem.fill === 'transparent' || elem.fill === 'none';

							if (hasStroke && isTransparentFill) {
								// 外枠はそのまま維持（stroke, strokeWidth, fillを保持）
								normalized.fill = 'transparent';
								normalized.stroke = elem.stroke || theme.primaryColor;
								normalized.strokeWidth = elem.strokeWidth || 20;
							}
							// ヘッダーバー（上部、幅が広い四角形、ただし高さが720未満）
							else if (normalized.y === 0 && (normalized.width >= 1000 || normalized.width === undefined) && (normalized.height || 100) < 700) {
								normalized.fill = theme.primaryColor;
								normalized.x = 0;
								normalized.width = 1280;
								normalized.height = normalized.height || 100;
							}
							// その他の四角形で黒や未設定の場合はアクセントカラーを適用
							else if (isInvalidColor(normalized.fill)) {
								normalized.fill = theme.accentColor;
							}
							// 座標がスライド外にはみ出す場合は調整
							if (normalized.x + (normalized.width || 0) > 1280) {
								normalized.width = 1280 - normalized.x;
							}
							if (normalized.y + (normalized.height || 0) > 720) {
								normalized.height = 720 - normalized.y;
							}
						}

						// 円形要素：黒や未設定の場合はアクセントカラーを適用
						if (normalized.type === 'circle') {
							if (!normalized.fill || normalized.fill === '#000000' || normalized.fill === '#000' || normalized.fill === 'black') {
								normalized.fill = theme.accentColor;
							}
						}

						// 線・矢印要素：黒や未設定の場合はプライマリカラーを適用
						if (normalized.type === 'line' || normalized.type === 'arrow') {
							if (!normalized.stroke || normalized.stroke === '#000000' || normalized.stroke === '#000' || normalized.stroke === 'black') {
								normalized.stroke = theme.primaryColor;
							}
						}

						// 星形要素：黒や未設定の場合はアクセントカラーを適用
						if (normalized.type === 'star') {
							if (!normalized.fill || normalized.fill === '#000000' || normalized.fill === '#000' || normalized.fill === 'black') {
								normalized.fill = theme.accentColor;
							}
						}

						return normalized;
					})
				: [];

			// ヘッダーバーがない場合は追加
			const hasHeaderBar = elements.some((e: any) =>
				e.type === 'rect' && e.y === 0 && (e.width >= 1000 || e.x === 0)
			);
			if (!hasHeaderBar) {
				elements = [
					{
						id: generateElementId(),
						type: 'rect',
						x: 0,
						y: 0,
						width: 1280,
						height: 100,
						fill: theme.primaryColor
					},
					...elements
				];
			}

			return {
				id: slide.id || generateSlideId(),
				name: slide.name || `スライド ${slideIndex + 1}`,
				backgroundColor: theme.backgroundColor,
				elements
			};
		});
	}

	// AIでスライドを生成
	async function generateSlides() {
		if (!sourceHtml || isGenerating) return;

		chatMessages = [...chatMessages, {
			role: 'assistant',
			content: `「${selectedTemplate.name}」テンプレートでスライドを生成しています...`
		}];

		try {
			isGenerating = true;
			errorMessage = '';

			const config: OpenRouterConfig = { apiKey, model: selectedModel };

			// テンプレートのテーマを取得
			const template = templateList.find(t => t.id === selectedTemplateId);
			const theme = template?.theme || currentTheme;
			const isSatomata = selectedTemplateId === 'satomata' || template?.name?.includes('さとまた');

			const prompt = `以下のHTMLコンテンツを「${template?.name || 'デフォルト'}」テンプレートでスライドに変換してください。

═══════════════════════════════════════════════════════════
【変換元HTML】
═══════════════════════════════════════════════════════════
${sourceHtml}

═══════════════════════════════════════════════════════════
【出力形式】5〜10枚のスライドをJSON配列で出力
═══════════════════════════════════════════════════════════
${isSatomata ? `
■ 1枚目：タイトルスライド（さとまた式）
\`\`\`json
{
  "name": "タイトル",
  "backgroundColor": "#ffffff",
  "elements": [
    { "type": "rect", "x": 0, "y": 0, "width": 1280, "height": 720, "fill": "transparent", "stroke": "#3F51B5", "strokeWidth": 20 },
    { "type": "text", "x": 640, "y": 285, "text": "タイトル", "fontSize": 150, "fontStyle": "bold", "fill": "#3F51B5", "align": "center" },
    { "type": "text", "x": 640, "y": 454, "text": "サブタイトル", "fontSize": 32, "fill": "#E91E63", "align": "center" }
  ]
}
\`\`\`

■ 2枚目以降：コンテンツスライド（さとまた式）
\`\`\`json
{
  "name": "見出し名",
  "backgroundColor": "#ffffff",
  "elements": [
    { "type": "rect", "x": 0, "y": 0, "width": 1280, "height": 200, "fill": "#3F51B5" },
    { "type": "text", "x": 640, "y": 73, "text": "見出し", "fontSize": 56, "fontStyle": "bold", "fill": "#ffffff", "align": "center" },
    { "type": "text", "x": 100, "y": 270, "text": "本文1行目", "fontSize": 56, "fontStyle": "bold", "fill": "#3F51B5", "align": "left" },
    { "type": "text", "x": 100, "y": 340, "text": "本文2行目", "fontSize": 56, "fontStyle": "bold", "fill": "#3F51B5", "align": "left" },
    { "type": "text", "x": 100, "y": 410, "text": "本文3行目", "fontSize": 56, "fontStyle": "bold", "fill": "#3F51B5", "align": "left" }
  ]
}
\`\`\`

【さとまた式の重要ルール】
- ヘッダーバー高さ: 200px
- 本文開始位置: y: 270
- 本文行間隔: 70px (y: 270, 340, 410, 480, 550, 620)
- 本文フォント: 56px 太字
- 1スライドの本文は最大5行程度
` : `
■ 1枚目：タイトルスライド
\`\`\`json
{
  "name": "タイトル",
  "backgroundColor": "${theme.backgroundColor}",
  "elements": [
    { "type": "rect", "x": 0, "y": 0, "width": 1280, "height": 8, "fill": "${theme.primaryColor}" },
    { "type": "text", "x": 640, "y": 300, "text": "タイトル", "fontSize": 64, "fontStyle": "bold", "fill": "${theme.textColor}", "align": "center" },
    { "type": "text", "x": 640, "y": 420, "text": "サブタイトル", "fontSize": 32, "fill": "${theme.primaryColor}", "align": "center" }
  ]
}
\`\`\`

■ 2枚目以降：コンテンツスライド
\`\`\`json
{
  "name": "見出し名",
  "backgroundColor": "${theme.backgroundColor}",
  "elements": [
    { "type": "rect", "x": 0, "y": 0, "width": 1280, "height": 100, "fill": "${theme.primaryColor}" },
    { "type": "text", "x": 640, "y": 55, "text": "見出し", "fontSize": 36, "fontStyle": "bold", "fill": "#ffffff", "align": "center" },
    { "type": "text", "x": 100, "y": 160, "text": "本文1行目", "fontSize": 26, "fill": "${theme.textColor}", "align": "left" },
    { "type": "text", "x": 100, "y": 220, "text": "本文2行目", "fontSize": 26, "fill": "${theme.textColor}", "align": "left" },
    { "type": "text", "x": 100, "y": 280, "text": "本文3行目", "fontSize": 26, "fill": "${theme.textColor}", "align": "left" }
  ]
}
\`\`\`

【重要な配置ルール】
- 本文の行間隔: 60px (y: 160, 220, 280, 340, ...)
- 本文の最大y座標: 650（下部余白確保）
- 1スライドの本文は最大8行程度に抑える
`}
- 内容が多い場合は複数スライドに分割する

上記形式で、全スライドを1つのJSON配列 [...] として出力してください。`;

			const messages: ChatMessage[] = [
				{ role: 'system', content: getSystemPrompt() },
				{ role: 'user', content: prompt }
			];

			const result = await generateContent(config, messages);
			console.log('AI Response:', result);

			// JSONを抽出
			const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/);
			if (jsonMatch) {
				const rawSlidesData = JSON.parse(jsonMatch[1]);
				console.log('Parsed JSON:', rawSlidesData);

				if (Array.isArray(rawSlidesData) && rawSlidesData.length > 0) {
					// IDを補完して正規化
					const slidesData = normalizeSlideData(rawSlidesData);
					console.log('Normalized slides:', slidesData);

					presentation = {
						...presentation,
						slides: slidesData,
						theme: currentTheme,
						updatedAt: new Date().toISOString()
					};
					currentSlideIndex = 0;
					chatMessages = [...chatMessages, {
						role: 'assistant',
						content: `${slidesData.length}枚のスライドを生成しました。`
					}];
				} else {
					throw new Error('有効なスライドデータがありません');
				}
			} else {
				chatMessages = [...chatMessages, { role: 'assistant', content: result }];
			}
		} catch (e) {
			console.error('Slide generation error:', e);
			errorMessage = e instanceof Error ? e.message : '生成に失敗しました';
			chatMessages = [...chatMessages, { role: 'assistant', content: `エラー: ${errorMessage}` }];
		} finally {
			isGenerating = false;
		}
	}

	// チャットでAIに指示
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
				{ role: 'system', content: getSystemPrompt() },
				...chatMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
			];

			const result = await generateContent(config, messages);

			// JSONを抽出
			const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/);
			if (jsonMatch) {
				try {
					const data = JSON.parse(jsonMatch[1]);
					if (Array.isArray(data)) {
						// 正規化して画像を除外
						const normalizedSlides = normalizeSlideData(data);
						presentation = {
							...presentation,
							slides: normalizedSlides,
							updatedAt: new Date().toISOString()
						};
						chatMessages = [...chatMessages, { role: 'assistant', content: 'スライドを更新しました。' }];
					} else if (data.id && data.elements) {
						// 単一スライドも正規化
						const normalized = normalizeSlideData([data])[0];
						updateSlide(normalized);
						chatMessages = [...chatMessages, { role: 'assistant', content: '現在のスライドを更新しました。' }];
					} else if (data.slides) {
						const normalizedSlides = normalizeSlideData(data.slides);
						presentation = { ...presentation, slides: normalizedSlides };
						chatMessages = [...chatMessages, { role: 'assistant', content: 'プレゼンテーションを更新しました。' }];
					}
				} catch {
					chatMessages = [...chatMessages, { role: 'assistant', content: result }];
				}
			} else {
				chatMessages = [...chatMessages, { role: 'assistant', content: result }];
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '生成に失敗しました';
			chatMessages = [...chatMessages, { role: 'assistant', content: `エラー: ${errorMessage}` }];
		} finally {
			isGenerating = false;
		}
	}

	// 現在のスライドを画像として保存
	async function saveCurrentSlide() {
		if (!canvasRef) return;

		isSaving = true;
		errorMessage = '';
		successMessage = '';

		try {
			if (!getLastDirectoryHandle()) {
				const folderResult = await selectFolder();
				if (!folderResult.success) {
					if (folderResult.error !== 'キャンセルされました') {
						errorMessage = folderResult.error || '保存先フォルダを選択してください';
					}
					isSaving = false;
					return;
				}
			}

			// 現在のスライドを画像としてエクスポート
			const dataUrl = canvasRef.toDataURL(2);
			if (!dataUrl) {
				errorMessage = '画像のエクスポートに失敗しました';
				isSaving = false;
				return;
			}

			const fileName = `${presentation.title}_slide${currentSlideIndex + 1}`;
			const result = await saveImageFile('slides', fileName, dataUrl, 'slide-canvas');

			if (result.success) {
				successMessage = `保存しました: ${result.filePath}`;
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

	// 全スライドを保存（画像またはPDF）
	async function saveAllSlides() {
		if (!canvasRef) return;

		isSaving = true;
		errorMessage = '';
		successMessage = '';

		try {
			const originalIndex = currentSlideIndex;
			const slideImages: string[] = [];

			// 全スライドの画像を収集
			for (let i = 0; i < presentation.slides.length; i++) {
				currentSlideIndex = i;
				await new Promise(resolve => setTimeout(resolve, 300));
				const dataUrl = canvasRef.toDataURL(2);
				if (dataUrl) {
					slideImages.push(dataUrl);
				}
			}

			// 元のスライドに戻す
			currentSlideIndex = originalIndex;

			if (slideImages.length === 0) {
				errorMessage = '保存するスライドがありません';
				isSaving = false;
				return;
			}

			if (saveFormat === 'pdf') {
				// PDFとして保存（jsPDFを動的インポート）
				const { default: jsPDF } = await import('jspdf');
				const pdf = new jsPDF({
					orientation: 'landscape',
					unit: 'px',
					format: [1280, 720]
				});

				for (let i = 0; i < slideImages.length; i++) {
					if (i > 0) {
						pdf.addPage([1280, 720], 'landscape');
					}
					pdf.addImage(slideImages[i], 'PNG', 0, 0, 1280, 720);
				}

				// PDFをダウンロード
				const pdfBlob = pdf.output('blob');
				const url = URL.createObjectURL(pdfBlob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `${presentation.title}.pdf`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);

				successMessage = `PDFを保存しました（${slideImages.length}枚）`;
				chatMessages = [...chatMessages, { role: 'assistant', content: successMessage }];
			} else {
				// 画像として保存
				if (!getLastDirectoryHandle()) {
					const folderResult = await selectFolder();
					if (!folderResult.success) {
						if (folderResult.error !== 'キャンセルされました') {
							errorMessage = folderResult.error || '保存先フォルダを選択してください';
						}
						isSaving = false;
						return;
					}
				}

				const savedCount = { success: 0, failed: 0 };
				for (let i = 0; i < slideImages.length; i++) {
					const fileName = `${presentation.title}_slide${i + 1}`;
					const result = await saveImageFile('slides', fileName, slideImages[i], 'slide-canvas');
					if (result.success) {
						savedCount.success++;
					} else {
						savedCount.failed++;
					}
				}

				if (savedCount.success > 0) {
					successMessage = `${savedCount.success}枚のスライドを保存しました`;
					if (savedCount.failed > 0) {
						successMessage += ` (${savedCount.failed}枚失敗)`;
					}
					chatMessages = [...chatMessages, { role: 'assistant', content: successMessage }];
				} else {
					errorMessage = '保存に失敗しました';
				}
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
		// AIチャット用のテキストエリア（id="ai-chat-input"）のみEnterで送信
		if (e.key === 'Enter' && !e.shiftKey && activeElement?.id === 'ai-chat-input') {
			e.preventDefault();
			sendMessage();
		}
		if (activeElement?.tagName !== 'TEXTAREA' && activeElement?.tagName !== 'INPUT') {
			if (e.key === 'ArrowLeft') { e.preventDefault(); if (currentSlideIndex > 0) currentSlideIndex--; }
			if (e.key === 'ArrowRight') { e.preventDefault(); if (currentSlideIndex < presentation.slides.length - 1) currentSlideIndex++; }
			if (e.key === 'Delete' && selectedElement) { e.preventDefault(); deleteSelectedElement(); }
		}
	}
</script>

<svelte:window on:keydown={handleKeyDown} />

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
				<span class="px-2 py-1 rounded text-xs font-medium bg-amber-500">スライド</span>
				<h1 class="text-lg font-semibold">スライドキャンバス</h1>
			</div>
			<div class="flex items-center gap-3">
				<div class="flex items-center gap-1.5 px-2 py-1 bg-green-600/20 border border-green-500 rounded text-xs">
					<svg class="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
					</svg>
					<span class="text-green-400">{availableModels.find(m => m.id === selectedModel)?.name || 'AI'}</span>
				</div>
			</div>
		</div>
	</header>

	<main class="flex-1 flex overflow-hidden">
		<!-- Left: チャット -->
		<div class="w-72 flex flex-col border-r border-gray-700 flex-shrink-0">
			<div class="px-3 py-2 bg-gray-800 border-b border-gray-700">
				<span class="text-xs font-semibold text-gray-300">AIアシスタント</span>
			</div>

			<!-- AIモデル選択 -->
			<div class="p-3 bg-gray-800 border-b border-gray-700">
				<div class="text-xs text-gray-400 mb-2">AIモデル</div>
				<select
					bind:value={selectedModel}
					class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-orange-500"
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

			<!-- テンプレート選択 -->
			<div class="p-3 bg-gray-800 border-b border-gray-700">
				<div class="text-xs text-gray-400 mb-2">テンプレート</div>
				<div class="space-y-2 max-h-48 overflow-y-auto">
					{#each templateList as template (template.id)}
						<div class="relative group">
							<button
								onclick={() => changeTemplate(template.id)}
								class="w-full flex items-center gap-3 p-2 rounded border-2 transition-all text-left {selectedTemplateId === template.id ? 'border-orange-500 bg-orange-500/10' : 'border-gray-600 hover:border-gray-500 bg-gray-700/50'}"
							>
								<div class="w-12 h-8 rounded overflow-hidden flex-shrink-0" style="background: {template.preview};"></div>
								<div class="flex-1 min-w-0">
									<div class="text-xs font-medium truncate flex items-center gap-1">
										{template.name}
										{#if template.isCustom}
											<span class="text-[8px] px-1 py-0.5 bg-purple-600/50 rounded">カスタム</span>
										{/if}
									</div>
									<div class="text-[10px] text-gray-400 truncate">{template.description}</div>
								</div>
								{#if selectedTemplateId === template.id}
									<svg class="w-4 h-4 text-orange-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
										<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
									</svg>
								{/if}
							</button>
							{#if templateList.length > 1}
								<button
									onclick={() => removeTemplate(template.id)}
									class="absolute top-1 right-1 p-1 bg-red-600 rounded opacity-0 group-hover:opacity-100 transition-opacity text-white"
									title={template.isCustom ? 'テンプレートを削除' : 'テンプレートを非表示'}
								>
									<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<!-- コンテンツ選択 -->
			<div class="p-3 bg-gray-800/50 border-b border-gray-700">
				<div class="text-xs text-gray-400 mb-2">変換元コンテンツ（フォルダ内HTML）</div>

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
							class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-orange-500"
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
							このフォルダにHTMLファイルがありません
						</div>
					{:else}
						<div class="text-xs text-gray-500 text-center py-2">
							フォルダを選択してください
						</div>
					{/if}
				</div>

				{#if selectedHtmlFileName}
					<button
						onclick={generateSlides}
						disabled={isGenerating}
						class="w-full mt-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 px-3 py-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-2"
					>
						{#if isGenerating}
							<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
							生成中...
						{:else}
							スライドを生成 (AI)
						{/if}
					</button>
				{/if}
			</div>

			<!-- Chat Messages -->
			<div class="flex-1 overflow-y-auto p-2 space-y-2">
				{#if chatMessages.length === 0}
					<div class="text-center text-gray-500 py-6 text-xs">
						<svg class="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
						</svg>
						<p>テンプレートを選択し</p>
						<p>コンテンツをスライドに変換</p>
					</div>
				{:else}
					{#each chatMessages as message, i (i)}
						<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
							<div class="max-w-[90%] rounded-lg px-2.5 py-1.5 text-xs {message.role === 'user' ? 'bg-orange-600' : 'bg-gray-700'}">
								<div class="whitespace-pre-wrap break-words">{message.content}</div>
							</div>
						</div>
					{/each}
					{#if isGenerating}
						<div class="flex justify-start">
							<div class="bg-gray-700 rounded-lg px-2.5 py-1.5 flex items-center gap-2 text-xs text-gray-300">
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
						placeholder="色を変更、図を追加..."
						rows="2"
						class="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-orange-500 resize-none"
					></textarea>
					<button
						onclick={sendMessage}
						disabled={isGenerating || !userInput.trim()}
						class="px-2.5 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition-colors"
						title="送信"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
						</svg>
					</button>
				</div>
			</div>
		</div>

		<!-- Middle: スライド一覧 -->
		<div class="w-40 flex flex-col border-r border-gray-700 bg-gray-850 flex-shrink-0">
			<div class="px-3 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
				<span class="text-xs font-semibold text-gray-300">スライド</span>
				<div class="flex items-center gap-1">
					<button
						onclick={pasteSlide}
						class="text-blue-400 hover:text-blue-300 p-1 {copiedSlide ? '' : 'opacity-30 cursor-not-allowed'}"
						title="スライドをペースト (現在の後に挿入)"
						disabled={!copiedSlide}
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
						</svg>
					</button>
					<button
						onclick={addSlide}
						class="text-orange-400 hover:text-orange-300 p-1"
						title="スライドを追加"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
						</svg>
					</button>
				</div>
			</div>
			<div class="flex-1 overflow-y-auto p-2 space-y-2">
				{#each presentation.slides as slide, i (slide.id)}
					<div class="relative group">
						<button
							onclick={() => currentSlideIndex = i}
							class="w-full bg-gray-800 rounded border-2 transition-all overflow-hidden {currentSlideIndex === i ? 'border-orange-500 ring-2 ring-orange-500/30' : 'border-gray-700 hover:border-gray-500'}"
						>
							<div class="relative w-full" style="padding-bottom: 56.25%;">
								<div class="absolute inset-0 p-1" style="background: {slide.backgroundColor};">
									<div class="text-[6px] text-gray-600 truncate">{slide.name}</div>
								</div>
							</div>
							<div class="bg-gray-900 text-xs py-1 text-center border-t border-gray-700">
								{i + 1}
							</div>
						</button>
						<!-- ホバー時に表示するボタン群 -->
						<div class="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
							<!-- コピー -->
							<button
								onclick={(e) => { e.stopPropagation(); copySlide(i); }}
								class="p-1 bg-blue-600 hover:bg-blue-500 rounded"
								title="コピー"
							>
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
								</svg>
							</button>
							<!-- 複製 -->
							<button
								onclick={(e) => { e.stopPropagation(); duplicateSlide(i); }}
								class="p-1 bg-green-600 hover:bg-green-500 rounded"
								title="複製"
							>
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
								</svg>
							</button>
							<!-- 削除 -->
							{#if presentation.slides.length > 1}
								<button
									onclick={(e) => { e.stopPropagation(); deleteSlide(i); }}
									class="p-1 bg-red-600 hover:bg-red-500 rounded"
									title="削除"
								>
									<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Right: キャンバスエディタ -->
		<div class="flex-1 flex flex-col bg-gray-600">
			<!-- ツールバー -->
			{#if currentSlide}
				<SlideToolbar
					theme={currentTheme}
					{selectedElement}
					backgroundColor={currentSlide.backgroundColor}
					onAddElement={addElement}
					onDeleteElement={deleteSelectedElement}
					onUpdateElement={updateSelectedElement}
					onChangeBackgroundColor={changeBackgroundColor}
				/>
			{/if}

			<!-- ヘッダー -->
			<div class="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
				<div class="flex items-center gap-3">
					<span class="text-sm font-semibold text-gray-300">{selectedTemplate.name}</span>
					<span class="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded">
						{currentSlideIndex + 1} / {presentation.slides.length}
					</span>
					{#if hasUnsavedChanges}
						<span class="text-xs text-orange-400 bg-orange-900/30 px-2 py-0.5 rounded">未保存</span>
					{/if}
				</div>
				<div class="flex items-center gap-2">
					<input
						type="text"
						bind:value={presentation.title}
						placeholder="タイトル"
						class="w-40 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-orange-500"
						oninput={() => markAsChanged()}
					/>
					<!-- スライドデータ保存・読み込み -->
					<div class="flex items-center gap-1 border-r border-gray-600 pr-2">
						<button
							onclick={loadSlideData}
							disabled={isLoadingSlideData}
							class="flex items-center gap-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 px-2 py-1.5 rounded text-xs transition-colors"
							title="スライドデータを読み込み (.json)"
						>
							{#if isLoadingSlideData}
								<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
							{:else}
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
								</svg>
							{/if}
							開く
						</button>
						<button
							onclick={saveSlideData}
							disabled={isSaving}
							class="flex items-center gap-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 px-2 py-1.5 rounded text-xs font-medium transition-colors"
							title="スライドデータを保存 (.json)"
						>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
							</svg>
							保存
						</button>
						<button
							onclick={() => showSaveTemplateModal = true}
							class="flex items-center gap-1 bg-amber-600 hover:bg-amber-700 px-2 py-1.5 rounded text-xs font-medium transition-colors"
							title="現在のスライドをテンプレートとして保存"
						>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
							</svg>
							テンプレ保存
						</button>
					</div>
					<!-- 画像エクスポート -->
					<button
						onclick={saveCurrentSlide}
						disabled={isSaving}
						class="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-2 py-1.5 rounded text-xs font-medium transition-colors"
						title="現在のスライドを画像として保存"
					>
						{#if isSaving}
							<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
						{:else}
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
							</svg>
						{/if}
						1枚
					</button>
					<button
						onclick={() => showSaveFormatModal = true}
						disabled={isSaving}
						class="flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-2 py-1.5 rounded text-xs font-medium transition-colors"
						title="全スライドを保存（形式選択）"
					>
						{#if isSaving}
							<span class="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
						{:else}
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
							</svg>
						{/if}
						全部
					</button>
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

			<!-- キャンバス -->
			<div class="flex-1 flex items-center justify-center p-6 overflow-hidden">
				{#if isBrowser && currentSlide}
					<div class="w-full max-w-4xl">
						<SlideCanvas
							bind:this={canvasRef}
							slideData={currentSlide}
							theme={currentTheme}
							editable={true}
							onUpdate={updateSlide}
							onSelectElement={(elem) => selectedElement = elem}
						/>
					</div>
				{:else}
					<div class="text-center text-gray-500">
						<svg class="w-20 h-20 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 13v-1m4 1v-3m4 3V8M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
						</svg>
						<p class="text-xl mb-2">キャンバスエディタ</p>
						<p class="text-sm">読み込み中...</p>
					</div>
				{/if}
			</div>

			<!-- ナビゲーション -->
			{#if presentation.slides.length > 1}
				<div class="flex items-center justify-center gap-4 pb-4">
					<button
						onclick={() => { if (currentSlideIndex > 0) currentSlideIndex--; }}
						disabled={currentSlideIndex === 0}
						class="p-2 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-30 transition-colors"
						title="前のスライド"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
						</svg>
					</button>
					<div class="flex gap-1.5">
						{#each presentation.slides as _, i}
							<button
								onclick={() => currentSlideIndex = i}
								class="w-2.5 h-2.5 rounded-full transition-colors {currentSlideIndex === i ? 'bg-orange-500' : 'bg-gray-600 hover:bg-gray-500'}"
								title="スライド {i + 1}"
							></button>
						{/each}
					</div>
					<button
						onclick={() => { if (currentSlideIndex < presentation.slides.length - 1) currentSlideIndex++; }}
						disabled={currentSlideIndex === presentation.slides.length - 1}
						class="p-2 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-30 transition-colors"
						title="次のスライド"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
						</svg>
					</button>
				</div>
			{/if}
		</div>
	</main>

	<!-- テンプレート保存モーダル -->
	{#if showSaveTemplateModal}
		<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
			<div class="bg-gray-800 rounded-lg p-6 w-96 border border-gray-700">
				<h3 class="text-lg font-semibold mb-4 text-white">テンプレートとして保存</h3>
				<p class="text-sm text-gray-400 mb-4">
					現在のプレゼンテーションの最初のスライドをテンプレートとして保存します。
				</p>
				<div class="mb-4">
					<label class="block text-sm text-gray-300 mb-2">テンプレート名</label>
					<input
						type="text"
						bind:value={newTemplateName}
						placeholder="例: マイカスタムテンプレート"
						class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
						onkeydown={(e) => e.key === 'Enter' && saveAsTemplate()}
					/>
				</div>
				<div class="flex gap-2 justify-end">
					<button
						onclick={() => { showSaveTemplateModal = false; newTemplateName = ''; }}
						class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
					>
						キャンセル
					</button>
					<button
						onclick={saveAsTemplate}
						disabled={!newTemplateName.trim()}
						class="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
					>
						保存
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- 保存形式選択モーダル -->
	{#if showSaveFormatModal}
		<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
			<div class="bg-gray-800 rounded-lg p-6 w-96 border border-gray-700">
				<h3 class="text-lg font-semibold mb-4 text-white">保存形式を選択</h3>
				<p class="text-sm text-gray-400 mb-4">
					全スライドを保存する形式を選択してください。
				</p>
				<div class="space-y-3 mb-6">
					<button
						onclick={() => { saveFormat = 'image'; }}
						class="w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-all text-left {saveFormat === 'image' ? 'border-green-500 bg-green-500/10' : 'border-gray-600 hover:border-gray-500 bg-gray-700/50'}"
					>
						<svg class="w-8 h-8 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
						</svg>
						<div>
							<div class="font-medium">PNG画像</div>
							<div class="text-xs text-gray-400">各スライドを個別の画像ファイルとして保存</div>
						</div>
						{#if saveFormat === 'image'}
							<svg class="w-5 h-5 text-green-400 ml-auto" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
							</svg>
						{/if}
					</button>
					<button
						onclick={() => { saveFormat = 'pdf'; }}
						class="w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-all text-left {saveFormat === 'pdf' ? 'border-red-500 bg-red-500/10' : 'border-gray-600 hover:border-gray-500 bg-gray-700/50'}"
					>
						<svg class="w-8 h-8 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
						</svg>
						<div>
							<div class="font-medium">PDFファイル</div>
							<div class="text-xs text-gray-400">全スライドを1つのPDFファイルにまとめて保存</div>
						</div>
						{#if saveFormat === 'pdf'}
							<svg class="w-5 h-5 text-red-400 ml-auto" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
							</svg>
						{/if}
					</button>
				</div>
				<div class="flex gap-2 justify-end">
					<button
						onclick={() => showSaveFormatModal = false}
						class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
					>
						キャンセル
					</button>
					<button
						onclick={() => { showSaveFormatModal = false; saveAllSlides(); }}
						class="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-medium transition-colors"
					>
						保存する
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.bg-gray-850 {
		background-color: #1a1f2e;
	}
</style>
