<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { SYSTEM_API_KEY } from '$lib/stores';
	import { generateContent, generateContentWithReasoningStream, isReasoningModel, type OpenRouterConfig, type ChatMessage as OpenRouterChatMessage, type ConversationMessage, type ReasoningResponse } from '$lib/openrouter';
	import { saveHtmlFile, loadHtmlFile, selectFolder, getLastDirectoryHandle, listHtmlFiles } from '$lib/filesystem';
	import { EBOOK_TEMPLATES, THEME_COLORS, createEmptyEbook, applyTemplateToHtml } from '$lib/ebookTemplates';

	// API設定
	const apiKey = SYSTEM_API_KEY;

	// 利用可能なモデル一覧
	const availableModels = [
		{ id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', description: '高速・推奨' },
		{ id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', description: '思考表示' },
		{ id: 'deepseek/deepseek-v3.2-speciale', name: 'DeepSeek V3.2 Special', description: '思考・高性能' },
		{ id: 'moonshotai/kimi-k2', name: 'Kimi K2', description: '無料枠あり' },
	];

	let selectedModel = $state('deepseek/deepseek-v3.2-speciale');
	let isGenerating = $state(false);
	let isSaving = $state(false);
	let isLoading = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');

	// テンプレート
	let selectedTemplateId = $state('plain');
	let selectedTemplate = $derived(EBOOK_TEMPLATES.find(t => t.id === selectedTemplateId) || EBOOK_TEMPLATES[0]);
	let showTemplatePreview = $state(false);

	// テーマカラー（全テンプレート共通）
	let selectedThemeColorId = $state('gray');
	let selectedThemeColor = $derived(THEME_COLORS.find(c => c.id === selectedThemeColorId) || THEME_COLORS[0]);

	// ページサイズ（auto: 自動, a4: A4サイズ）
	let pageSize = $state<'auto' | 'a4'>('auto');

	// テンプレートプレビュー用サンプル
	const sampleContent = `
		<h1>サンプルタイトル</h1>
		<p>これはサンプルの本文です。テンプレートの見た目を確認できます。</p>
		<h2>第1章 はじめに</h2>
		<p>電子書籍のスタイルをプレビューしています。フォント、色、余白などを確認してください。</p>
		<h3>1.1 概要</h3>
		<p>見出しと本文のバランスを確認できます。</p>
	`;

	// チャット（actionType: 実行可能なアクションの種類）
	type ChatMessage = {
		role: 'user' | 'assistant';
		content: string;
		reasoning?: string;  // 思考内容表示用
		reasoning_details?: Array<{ type: string; content: string }>;  // 次回APIリクエスト用
		actionType?: 'execute' | null;  // 実行ボタン表示用
	};
	let chatMessages = $state<ChatMessage[]>([]);
	let expandedReasoning = $state<Set<number>>(new Set());  // 展開中の思考
	let conversationHistory = $state<ConversationMessage[]>([]);  // API用会話履歴
	let userInput = $state('');
	let streamingReasoning = $state('');  // ストリーミング中の思考内容
	let streamingContent = $state('');    // ストリーミング中の回答
	let isExecuting = $state(false);  // 実行中フラグ
	let loadedContext = $state<'none' | 'all' | 'selected'>('none');  // 読み込み済みコンテキスト

	// コンテンツ
	let contentTitle = $state('');
	let currentFileName = $state('');

	// フォルダ内HTMLファイル
	let folderHtmlFiles = $state<{ name: string; content: string }[]>([]);

	// セクション管理
	type Section = {
		id: string;
		level: number;
		heading: string;
		content: string;
		selected: boolean;
	};
	let sections = $state<Section[]>([]);

	// エディタ
	let editorMode = $state<'visual' | 'code'>('visual');
	let visualEditor: HTMLDivElement | null = $state(null);

	// パネル幅
	let chatWidth = $state(320);
	let headingsWidth = $state(240);
	let isResizingChat = $state(false);
	let isResizingHeadings = $state(false);

	// ブラウザ確認
	let isBrowser = $state(false);

	// 選択されたセクション（目次は除外）
	let selectedSections = $derived(sections.filter(s => s.selected && s.id !== 'toc'));
	let hasSelection = $derived(selectedSections.length > 0);

	// 幅をlocalStorageから復元/保存
	function loadPanelWidths() {
		try {
			const saved = localStorage.getItem('ebook-panel-widths');
			if (saved) {
				const { chat, headings } = JSON.parse(saved);
				if (chat) chatWidth = chat;
				if (headings) headingsWidth = headings;
			}
		} catch (e) { /* ignore */ }
	}

	function savePanelWidths() {
		try {
			localStorage.setItem('ebook-panel-widths', JSON.stringify({ chat: chatWidth, headings: headingsWidth }));
		} catch (e) { /* ignore */ }
	}

	// リサイズ
	function startResizeChat(e: MouseEvent) { isResizingChat = true; e.preventDefault(); }
	function startResizeHeadings(e: MouseEvent) { isResizingHeadings = true; e.preventDefault(); }

	function handleMouseMove(e: MouseEvent) {
		if (isResizingChat) chatWidth = Math.max(200, Math.min(500, e.clientX));
		else if (isResizingHeadings) headingsWidth = Math.max(150, Math.min(400, e.clientX - chatWidth));
	}

	function handleMouseUp() {
		if (isResizingChat || isResizingHeadings) savePanelWidths();
		isResizingChat = false;
		isResizingHeadings = false;
	}

	onMount(async () => {
		isBrowser = true;
		loadPanelWidths();
		await refreshFolderHtmlFiles();
	});

	// HTMLをセクションに分解
	function parseHtmlToSections(html: string): Section[] {
		if (!html) return [];
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		const result: Section[] = [];

		// 全ての見出しと本文要素を取得
		const allElements = doc.body.querySelectorAll('h1, h2, h3, h4, p, div:not(:has(h1,h2,h3,h4,p))');
		let currentSection: Section | null = null;
		let sectionIndex = 0;

		allElements.forEach(el => {
			const tagName = el.tagName.toLowerCase();

			if (['h1', 'h2', 'h3', 'h4'].includes(tagName)) {
				// 新しいセクション開始
				if (currentSection) result.push(currentSection);
				currentSection = {
					id: `section-${sectionIndex++}`,
					level: parseInt(tagName.substring(1)),
					heading: el.textContent?.trim() || '',
					content: '',
					selected: false
				};
			} else if (currentSection && tagName === 'p') {
				// 本文を追加（pタグのみ）
				currentSection.content += el.outerHTML;
			}
		});

		if (currentSection) result.push(currentSection);
		return result;
	}

	// スタイルにテーマカラーを適用（全テンプレート共通）
	function applyThemeColor(style: string): string {
		return style
			.replace(/\{\{primaryColor\}\}/g, selectedThemeColor.primary)
			.replace(/\{\{primaryColorLight\}\}/g, selectedThemeColor.primaryLight)
			.replace(/\{\{bgColor\}\}/g, selectedThemeColor.bg)
			.replace(/\{\{textColor\}\}/g, selectedThemeColor.text);
	}

	// プレビュー用スタイル取得（デフォルトグレーで表示）
	function getPreviewStyle(template: typeof EBOOK_TEMPLATES[0], styleKey: string): string {
		const style = template.styles[styleKey as keyof typeof template.styles] || '';
		const defaultColor = THEME_COLORS[0]; // グレー
		return style
			.replace(/\{\{primaryColor\}\}/g, defaultColor.primary)
			.replace(/\{\{primaryColorLight\}\}/g, defaultColor.primaryLight)
			.replace(/\{\{bgColor\}\}/g, defaultColor.bg)
			.replace(/\{\{textColor\}\}/g, defaultColor.text);
	}

	// コンテンツ内の<p>タグにスタイルを適用
	function applyParagraphStyle(content: string): string {
		const { styles } = selectedTemplate;
		const pStyle = applyThemeColor(styles.pStyle);
		// 既存の<p>タグのstyle属性を置換、またはstyleがない場合は追加
		return content
			.replace(/<p style="[^"]*">/g, `<p style="${pStyle}">`)
			.replace(/<p>/g, `<p style="${pStyle}">`);
	}

	// セクションをHTMLに変換
	function sectionsToHtml(secs: Section[]): string {
		const { styles } = selectedTemplate;
		const containerStyle = applyThemeColor(styles.containerStyle);

		if (pageSize === 'a4') {
			// A4モード: ページ分割で表示
			return sectionsToA4Html(secs);
		}

		// 自動モード: 通常表示
		let html = '';
		for (const sec of secs) {
			let hStyle = styles[`h${sec.level}Style` as keyof typeof styles] || '';
			hStyle = applyThemeColor(hStyle);
			html += `<h${sec.level} id="${sec.id}" style="${hStyle}">${sec.heading}</h${sec.level}>`;
			html += applyParagraphStyle(sec.content);
		}

		return `<div style="${containerStyle} font-family: ${styles.fontFamily}; font-size: ${styles.fontSize}; line-height: ${styles.lineHeight};">${html}</div>`;
	}

	// A4モード用HTML生成（ページ分割）
	function sectionsToA4Html(secs: Section[]): string {
		const { styles } = selectedTemplate;

		// テンプレートの背景色を取得（bgColorプレースホルダーがあれば適用）
		const pageBgColor = selectedThemeColor.bg || '#fff';

		// A4サイズ: 210mm x 297mm
		const pageStyle = `
			width: 210mm;
			min-height: 297mm;
			padding: 20mm;
			background: ${pageBgColor};
			box-shadow: 0 4px 20px rgba(0,0,0,0.3);
			margin-bottom: 20px;
			box-sizing: border-box;
			page-break-after: always;
			font-family: ${styles.fontFamily};
			font-size: ${styles.fontSize};
			line-height: ${styles.lineHeight};
		`;

		let pages: string[] = [];
		let currentPageContent = '';

		for (let i = 0; i < secs.length; i++) {
			const sec = secs[i];
			let hStyle = styles[`h${sec.level}Style` as keyof typeof styles] || '';
			hStyle = applyThemeColor(hStyle);

			// H1, H2見出しは新しいページで開始
			if ((sec.level === 1 || sec.level === 2) && currentPageContent) {
				pages.push(currentPageContent);
				currentPageContent = '';
			}

			currentPageContent += `<h${sec.level} id="${sec.id}" style="${hStyle}">${sec.heading}</h${sec.level}>`;
			currentPageContent += applyParagraphStyle(sec.content);
		}

		// 最後のページを追加
		if (currentPageContent) {
			pages.push(currentPageContent);
		}

		// ページをラップ
		const pagesHtml = pages.map((content, idx) => `
			<div class="a4-page" style="${pageStyle}" data-page="${idx + 1}">
				${content}
			</div>
		`).join('');

		return `<div class="a4-pages-container" style="display: flex; flex-direction: column; align-items: center; padding: 20px; background: #525659;">${pagesHtml}</div>`;
	}

	// 目次HTMLを生成
	function generateTocHtml(): string {
		if (sections.length === 0) return '';

		const { styles } = selectedTemplate;
		let tocItems = '';

		for (const sec of sections) {
			const indent = (sec.level - 1) * 20;
			tocItems += `<li style="margin-left: ${indent}px; margin-bottom: 4px;">
				<a href="#${sec.id}" style="color: inherit; text-decoration: none; border-bottom: 1px dotted #666;">${sec.heading}</a>
			</li>`;
		}

		return `<nav style="margin-bottom: 2em; padding: 1em; background: #f9f9f9; border-radius: 8px;">
			<h2 style="${styles.h2Style || ''} margin-bottom: 0.5em;">目次</h2>
			<ul style="list-style: none; padding: 0; margin: 0;">${tocItems}</ul>
		</nav>`;
	}

	// 目次が存在するかチェック
	let hasToc = $derived(sections.some(s => s.id === 'toc'));

	// 目次をトグル（挿入/削除）
	function toggleToc() {
		if (hasToc) {
			// 目次を削除
			sections = sections.filter(s => s.id !== 'toc');
			successMessage = '目次を削除しました';
		} else {
			if (sections.length === 0) {
				errorMessage = 'セクションがありません';
				setTimeout(() => errorMessage = '', 3000);
				return;
			}

			// 目次セクションを作成
			const tocSection: Section = {
				id: 'toc',
				level: 2,
				heading: '目次',
				content: generateTocContentHtml(),
				selected: false
			};

			sections = [tocSection, ...sections];
			successMessage = '目次を挿入しました';
		}
		setTimeout(() => successMessage = '', 3000);
	}

	// 目次の本文部分を生成（リンク付きリスト）- 目次自体は除外
	function generateTocContentHtml(): string {
		let items = '';
		for (const sec of sections) {
			if (sec.id === 'toc') continue; // 目次自体は除外
			const indent = (sec.level - 1) * 20;
			items += `<p style="margin: 4px 0; margin-left: ${indent}px;">
				<a href="#${sec.id}" style="color: #333; text-decoration: none; border-bottom: 1px dotted #999;">${sec.heading}</a>
			</p>`;
		}
		return items;
	}

	// 目次の内容を更新（セクション変更時に呼び出し）
	function updateTocContent() {
		if (!hasToc) return;
		const tocIndex = sections.findIndex(s => s.id === 'toc');
		if (tocIndex >= 0) {
			sections[tocIndex].content = generateTocContentHtml();
		}
	}

	// 生成されたHTMLを取得
	// pageSize, selectedTemplate, selectedThemeColorの変更も追跡
	let generatedHtml = $derived.by(() => {
		// 依存関係を明示的にアクセス
		const _pageSize = pageSize;
		const _template = selectedTemplate;
		const _color = selectedThemeColor;
		return sectionsToHtml(sections);
	});

	// HTMLを整形（コード表示用）
	function formatHtml(html: string): string {
		let formatted = '';
		let indent = 0;
		const tags = html.split(/(<[^>]+>)/g).filter(s => s.trim());

		for (const tag of tags) {
			if (tag.startsWith('</')) {
				// 閉じタグ
				indent = Math.max(0, indent - 1);
				formatted += '  '.repeat(indent) + tag + '\n';
			} else if (tag.startsWith('<') && !tag.endsWith('/>') && !tag.includes('</')) {
				// 開きタグ
				formatted += '  '.repeat(indent) + tag + '\n';
				if (!tag.match(/<(br|hr|img|input|meta|link)/i)) {
					indent++;
				}
			} else if (tag.startsWith('<')) {
				// 自己終了タグ
				formatted += '  '.repeat(indent) + tag + '\n';
			} else {
				// テキスト
				const text = tag.trim();
				if (text) {
					formatted += '  '.repeat(indent) + text + '\n';
				}
			}
		}
		return formatted.trim();
	}

	let formattedHtml = $derived(formatHtml(generatedHtml));

	// ビジュアルエディタを更新
	function updateVisualEditor() {
		if (visualEditor && editorMode === 'visual') {
			visualEditor.innerHTML = generatedHtml;
			highlightSelectedSections();
		}
	}

	// ビジュアルエディタからセクションを同期
	function syncFromVisualEditor() {
		if (!visualEditor) return;
		const newHtml = visualEditor.innerHTML;
		const newSections = parseHtmlToSections(newHtml);

		// 選択状態を保持しながら更新
		const selectedIds = new Set(sections.filter(s => s.selected).map(s => s.id));
		sections = newSections.map((s, i) => ({
			...s,
			id: sections[i]?.id || s.id,
			selected: sections[i] ? selectedIds.has(sections[i].id) : false
		}));
	}

	// デバウンス用タイマー
	let syncTimer: ReturnType<typeof setTimeout> | null = null;

	function debouncedSyncFromVisualEditor() {
		if (syncTimer) clearTimeout(syncTimer);
		syncTimer = setTimeout(() => {
			syncFromVisualEditor();
		}, 500); // 500ms後に同期
	}

	// エディタ内リンククリック処理（目次ジャンプ用）
	function handleEditorClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		const anchor = target.closest('a');
		if (anchor && anchor.hash) {
			e.preventDefault();
			const targetId = anchor.hash.slice(1); // #を除去
			const targetEl = visualEditor?.querySelector(`#${targetId}`);
			if (targetEl) {
				targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
		}
	}

	// 選択セクションをハイライト
	function highlightSelectedSections() {
		if (!visualEditor) return;
		const headings = visualEditor.querySelectorAll('h1, h2, h3, h4');
		headings.forEach((h, i) => {
			const el = h as HTMLElement;
			if (sections[i]?.selected) {
				// 選択時はアウトラインで表示（背景は上書きしない）
				el.style.outline = '3px solid #9333ea';
				el.style.outlineOffset = '2px';
			} else {
				// 選択解除時はアウトラインを消すだけ
				el.style.outline = '';
				el.style.outlineOffset = '';
			}
		});
	}

	// セクション変更時にエディタ更新
	$effect(() => {
		if (sections.length >= 0) updateVisualEditor();
	});

	// セクション選択トグル
	function toggleSection(id: string, ctrlKey: boolean = false) {
		if (ctrlKey) {
			sections = sections.map(s => s.id === id ? { ...s, selected: !s.selected } : s);
		} else {
			sections = sections.map(s => ({ ...s, selected: s.id === id }));
		}
		highlightSelectedSections();
	}

	// チェックボックスで選択
	function toggleSectionCheckbox(id: string) {
		sections = sections.map(s => s.id === id ? { ...s, selected: !s.selected } : s);
		highlightSelectedSections();
	}

	// 全選択/解除
	function selectAll() {
		sections = sections.map(s => ({ ...s, selected: true }));
		highlightSelectedSections();
	}

	function deselectAll() {
		sections = sections.map(s => ({ ...s, selected: false }));
		highlightSelectedSections();
	}

	// 子も含めて選択
	function selectWithChildren(id: string) {
		const idx = sections.findIndex(s => s.id === id);
		if (idx === -1) return;

		const targetLevel = sections[idx].level;
		sections = sections.map((s, i) => {
			if (i === idx) return { ...s, selected: true };
			if (i > idx && s.level > targetLevel) return { ...s, selected: true };
			if (i > idx && s.level <= targetLevel) return s;
			return s;
		});
		highlightSelectedSections();
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

	// フォルダ内HTMLファイルを読み込み
	function loadHtmlFromFolder(fileName: string) {
		const file = folderHtmlFiles.find(f => f.name === fileName);
		if (file) {
			sections = parseHtmlToSections(file.content);
			contentTitle = fileName.replace(/\.(html|htm)$/i, '');
			currentFileName = fileName;
			chatMessages = [...chatMessages, { role: 'assistant', content: `「${fileName}」を読み込みました。見出しをクリックして編集対象を選択してください。` }];
		}
	}

	// 新規作成
	function createNew() {
		const title = contentTitle.trim() || '新しい電子書籍';
		const emptyHtml = createEmptyEbook(selectedTemplate, title);
		sections = parseHtmlToSections(emptyHtml);
		currentFileName = '';
		chatMessages = [...chatMessages, { role: 'assistant', content: `「${title}」を作成しました。チャットで内容を生成できます。` }];
	}

	// ファイルから読み込み
	async function loadFromFile() {
		isLoading = true;
		try {
			const result = await loadHtmlFile();
			if (result.success && result.content) {
				sections = parseHtmlToSections(result.content);
				if (result.fileName) {
					currentFileName = result.fileName;
					contentTitle = result.fileName.replace(/\.(html|htm)$/i, '');
				}
				chatMessages = [...chatMessages, { role: 'assistant', content: `ファイルを読み込みました。${sections.length}個のセクションがあります。` }];
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '読み込みに失敗しました';
		} finally {
			isLoading = false;
		}
	}

	// 保存
	async function saveToFile() {
		if (sections.length === 0) {
			errorMessage = '保存する内容がありません';
			return;
		}

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
			const html = sectionsToHtml(sections);
			const result = await saveHtmlFile('', title, html, 'ebook');
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

	// 読み込み済みコンテンツのハッシュ（重複防止用）
	let loadedContentHash = $state('');

	// コンテンツのハッシュを計算（簡易版）
	function getContentHash(content: string): string {
		return `${content.length}-${content.substring(0, 50)}`;
	}

	// 全体コンテンツを読み込み
	function loadAllContent() {
		if (sections.length === 0) {
			errorMessage = 'セクションがありません';
			setTimeout(() => errorMessage = '', 3000);
			return;
		}

		const fullContent = sections.filter(s => s.id !== 'toc').map(s => {
			const textContent = extractTextFromHtml(s.content);
			return `${'#'.repeat(s.level)} ${s.heading}\n${textContent}`;
		}).join('\n\n');

		// 重複チェック
		const hash = 'all:' + getContentHash(fullContent);
		if (loadedContext === 'all' && loadedContentHash === hash) {
			return; // 同じ内容は再読み込みしない
		}

		const charCount = fullContent.length;
		const truncatedContent = charCount > 100000
			? fullContent.substring(0, 100000) + '\n\n...（以下省略）'
			: fullContent;

		chatMessages = [...chatMessages, {
			role: 'assistant',
			content: `📖 全体を読み込みました（${charCount.toLocaleString()}文字 / ${sections.filter(s => s.id !== 'toc').length}セクション）\n\n---\n${truncatedContent.substring(0, 500)}${truncatedContent.length > 500 ? '...' : ''}`
		}];
		loadedContext = 'all';
		loadedContentHash = hash;
	}

	// 選択セクションを読み込み
	function loadSelectedContent() {
		if (selectedSections.length === 0) {
			errorMessage = '見出しを選択してください';
			setTimeout(() => errorMessage = '', 3000);
			return;
		}

		const selectedContent = selectedSections.map((s, i) => {
			const textContent = extractTextFromHtml(s.content);
			return `【${i + 1}】${'#'.repeat(s.level)} ${s.heading}\n${textContent}`;
		}).join('\n\n');

		// 重複チェック
		const hash = 'selected:' + getContentHash(selectedContent);
		if (loadedContext === 'selected' && loadedContentHash === hash) {
			return; // 同じ内容は再読み込みしない
		}

		const charCount = selectedContent.length;

		chatMessages = [...chatMessages, {
			role: 'assistant',
			content: `📝 ${selectedSections.length}件を読み込みました（${charCount.toLocaleString()}文字）\n\n---\n${selectedContent.substring(0, 800)}${selectedContent.length > 800 ? '...' : ''}`
		}];
		loadedContext = 'selected';
		loadedContentHash = hash;
	}

	// 読み込みコンテキストをリセット
	function resetLoadedContext() {
		loadedContext = 'none';
		loadedContentHash = '';
	}

	// 思考内容の展開トグル
	function toggleReasoning(index: number) {
		const newSet = new Set(expandedReasoning);
		if (newSet.has(index)) {
			newSet.delete(index);
		} else {
			newSet.add(index);
		}
		expandedReasoning = newSet;
	}

	// AIにメッセージ送信
	async function sendMessage() {
		if (!userInput.trim() || isGenerating) return;

		const userMessage = userInput.trim();
		userInput = '';
		chatMessages = [...chatMessages, { role: 'user', content: userMessage }];

		try {
			isGenerating = true;
			errorMessage = '';

			const config: OpenRouterConfig = { apiKey, model: selectedModel };

			// モード判定: 選択あり→部分修正、選択なし→全体生成/追加
			const mode = hasSelection ? 'modify' : 'generate';

			let systemPrompt: string;
			let contextInfo = '';

			if (mode === 'modify') {
				// 選択されたセクションの情報を含める（本文も全て送信）
				const selectedInfo = selectedSections.map((s, i) => {
					const textContent = extractTextFromHtml(s.content);
					return `【${i + 1}】${s.heading}\n${textContent}`;
				}).join('\n\n');

				contextInfo = `\n\n【修正対象: ${selectedSections.length}件】\n${selectedInfo}`;

				systemPrompt = `あなたは電子書籍の編集アシスタントです。
ユーザーが選択したセクションを修正してください。${contextInfo}

【絶対ルール】
- HTMLタグは絶対に使用禁止
- マークダウン形式のみで出力

【出力形式 - 必ずこの形式で出力してください】
各セクションを以下の形式で出力：

## セクション1
（見出しを変更する場合のみ）見出し: 新しい見出し
本文をここに記載...

## セクション2
見出し: 変更後の見出し
本文をここに記載...

【ルール】
- 「## セクション1」「## セクション2」のように番号を付ける
- 見出しを変える場合だけ「見出し: 」行を入れる
- 本文は普通に記載
- 選択されたセクションのみ出力`;
			} else {
				// 現在の本の全体内容（最大10万文字）
				if (sections.length > 0) {
					const fullContent = sections.filter(s => s.id !== 'toc').map(s => {
						const textContent = extractTextFromHtml(s.content);
						return `${'#'.repeat(s.level)} ${s.heading}\n${textContent}`;
					}).join('\n\n');

					// 10万文字以内に制限
					const truncatedContent = fullContent.length > 100000
						? fullContent.substring(0, 100000) + '\n\n...（以下省略）'
						: fullContent;

					contextInfo = `\n\n【現在の本の内容】\n${truncatedContent}`;
				}

				systemPrompt = `あなたは電子書籍の執筆アシスタントです。${contextInfo}

【絶対ルール - 必ず守ってください】
- HTMLタグは絶対に使用禁止（<div>, <p>, <h1>等は使わない）
- 必ずマークダウン形式のみで出力
- コードブロック（\`\`\`）は使わない
- ユーザーが文字数を指定した場合は必ずその文字数を守る
- 指定がない場合、各セクションの本文は最低200〜400文字程度で詳しく書く

【ユーザーの意図に応じて対応】

1. 質問・相談・フィードバック依頼の場合
   → 普通のテキストで回答。見出しは使わない。

2. 具体的な執筆依頼の場合（「書いて」「追加して」「ブログを書いて」等）
   → マークダウン形式で詳しい内容を出力：

# タイトル

## 章見出し

ここに詳しい本文を書く。1段落あたり100〜200文字程度。
具体例や説明を入れて読み応えのある内容にする。

複数段落に分けて丁寧に解説する。

## 次の章見出し

同様に詳しく書く...

ユーザーが「お願いします」「やってください」等と言った場合は、直前の提案を実行してください。`;
			}

			// reasoningモデルかどうかで分岐
			let result: string;
			let reasoning: string | undefined;
			let reasoning_details: Array<{ type: string; content: string }> | undefined;

			if (isReasoningModel(selectedModel)) {
				// reasoning_details付きの会話履歴を構築
				const apiHistory: ConversationMessage[] = [
					{ role: 'system', content: systemPrompt },
					...chatMessages.slice(-10).map(m => ({
						role: m.role as 'user' | 'assistant',
						content: m.content,
						...(m.reasoning_details ? { reasoning_details: m.reasoning_details } : {})
					}))
				];

				// ストリーミングでリアルタイム表示
				streamingReasoning = '';
				streamingContent = '';

				const response = await generateContentWithReasoningStream(config, apiHistory, {
					onReasoning: (text) => { streamingReasoning = text; },
					onContent: (text) => { streamingContent = text; }
				});

				result = response.content;
				reasoning = response.reasoning;
				reasoning_details = response.reasoning_details;

				// ストリーミング状態をクリア
				streamingReasoning = '';
				streamingContent = '';
			} else {
				const messages: OpenRouterChatMessage[] = [
					{ role: 'system', content: systemPrompt },
					...chatMessages.slice(-10).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
				];
				result = await generateContent(config, messages);
			}

			if (mode === 'modify') {
				// 選択セクションのみ更新
				const selectedCount = selectedSections.length;
				const modifiedCount = applyModifications(result);
				updateTocContent(); // 目次を更新
				highlightSelectedSections(); // 選択ハイライトをクリア
				loadedContext = 'none'; // 読み込み状態をリセット
				loadedContentHash = ''; // ハッシュもリセット

				if (modifiedCount === selectedCount) {
					chatMessages = [...chatMessages, { role: 'assistant', content: `${modifiedCount}件すべて修正しました。`, reasoning, reasoning_details }];
				} else if (modifiedCount > 0) {
					chatMessages = [...chatMessages, { role: 'assistant', content: `${selectedCount}件中${modifiedCount}件を修正しました。（${selectedCount - modifiedCount}件はAIの出力形式が認識できませんでした）`, reasoning, reasoning_details }];
				} else {
					chatMessages = [...chatMessages, { role: 'assistant', content: `修正できませんでした。AIの出力形式を確認してください。\n\nブラウザのコンソール（F12）でAI Responseを確認できます。`, reasoning, reasoning_details }];
				}
			} else {
				// 見出し（# ## ###）が含まれているかチェック
				const hasHeadings = /^#{1,4}\s+.+/m.test(result);

				if (hasHeadings) {
					// コンテンツ生成モード
					const newSections = parseMarkdownToSections(result);
					if (newSections.length > 0) {
						if (sections.length === 0) {
							sections = newSections;
						} else {
							// 既存に追加
							sections = [...sections, ...newSections];
						}
						updateTocContent(); // 目次を更新
						chatMessages = [...chatMessages, { role: 'assistant', content: `${newSections.length}件のセクションを追加しました。`, reasoning, reasoning_details }];
					} else {
						// パース失敗時は会話として表示（実行ボタン付き）
						chatMessages = [...chatMessages, { role: 'assistant', content: result + '\n\n---\n提案を実行しますか？', actionType: 'execute', reasoning, reasoning_details }];
					}
				} else {
					// 会話モード（見出しなし = フィードバックや質問への回答）
					// 実行ボタンを表示
					chatMessages = [...chatMessages, { role: 'assistant', content: result + '\n\n---\nこの提案を実行しますか？', actionType: 'execute', reasoning, reasoning_details }];
				}
			}

		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '生成に失敗しました';
			chatMessages = [...chatMessages, { role: 'assistant', content: `エラー: ${errorMessage}` }];
		} finally {
			isGenerating = false;
		}
	}

	// 提案を実行（会話履歴を参照して実行）
	async function executeProposal() {
		if (isExecuting || isGenerating) return;

		try {
			isExecuting = true;
			errorMessage = '';

			// 実行ボタンを消す（最後のメッセージからactionTypeを削除）
			if (chatMessages.length > 0) {
				const lastMsg = chatMessages[chatMessages.length - 1];
				if (lastMsg.actionType) {
					chatMessages = chatMessages.map((msg, i) =>
						i === chatMessages.length - 1 ? { ...msg, actionType: null, content: msg.content.replace(/\n\n---\n.*実行しますか？$/, '') } : msg
					);
				}
			}

			chatMessages = [...chatMessages, { role: 'user', content: '実行してください' }];

			const config: OpenRouterConfig = { apiKey, model: selectedModel };

			// 現在の構造情報
			let contextInfo = '';
			if (sections.length > 0) {
				contextInfo = `\n\n【現在の本の構造】\n${sections.filter(s => s.id !== 'toc').map(s => `${'  '.repeat(s.level - 1)}H${s.level}: ${s.heading}`).join('\n')}`;
			}

			const systemPrompt = `あなたは電子書籍の執筆アシスタントです。${contextInfo}

これまでの会話で提案した内容を実行してください。
必ず以下のマークダウン形式で出力してください：

# タイトル（H1）
## 章見出し（H2）
### 節見出し（H3）
本文

提案した改善・追加・修正を実際のコンテンツとして出力してください。`;

			const messages: ChatMessage[] = [
				{ role: 'system', content: systemPrompt },
				...chatMessages.slice(-12).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
			];

			const result = await generateContent(config, messages);

			// 結果をパース
			const newSections = parseMarkdownToSections(result);
			if (newSections.length > 0) {
				if (sections.length === 0) {
					sections = newSections;
				} else {
					sections = [...sections, ...newSections];
				}
				updateTocContent();
				chatMessages = [...chatMessages, { role: 'assistant', content: `${newSections.length}件のセクションを追加しました。` }];
			} else {
				chatMessages = [...chatMessages, { role: 'assistant', content: '実行できませんでした。もう一度具体的に指示してください。' }];
			}

		} catch (e) {
			errorMessage = e instanceof Error ? e.message : '実行に失敗しました';
			chatMessages = [...chatMessages, { role: 'assistant', content: `エラー: ${errorMessage}` }];
		} finally {
			isExecuting = false;
		}
	}

	// HTMLからテキスト抽出
	function extractTextFromHtml(html: string): string {
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		return doc.body.textContent || '';
	}

	// 修正を適用（修正件数を返す）
	function applyModifications(aiResponse: string): number {
		console.log('AI Response:', aiResponse);

		const selectedIds = selectedSections.map(s => s.id);
		let modifiedCount = 0;
		const modifiedIds = new Set<string>();

		// パターン1: ## セクション または ### セクション 形式
		const sectionPattern1 = /#{2,3}\s*セクション\s*(\d+)[^\n]*\n([\s\S]*?)(?=#{2,3}\s*セクション|\s*$)/gi;
		let match;
		while ((match = sectionPattern1.exec(aiResponse)) !== null) {
			const sectionNum = parseInt(match[1]) - 1;
			if (sectionNum >= 0 && sectionNum < selectedIds.length) {
				const sectionContent = match[2].trim();
				const headingMatch = sectionContent.match(/見出し[:：]\s*(.+?)(?:\n|$)/);
				const heading = headingMatch ? headingMatch[1].trim() : undefined;
				const content = sectionContent.replace(/見出し[:：]\s*.+?\n?/, '').trim();

				const targetId = selectedIds[sectionNum];
				if (!modifiedIds.has(targetId)) {
					sections = sections.map(s => {
						if (s.id !== targetId) return s;
						modifiedIds.add(targetId);
						modifiedCount++;
						return {
							...s,
							heading: heading || s.heading,
							content: markdownToHtml(content),
							selected: false
						};
					});
				}
			}
		}

		// パターン1でマッチしなかった場合、単純なマークダウンとして処理
		if (modifiedCount === 0) {
			// 選択が1件の場合、レスポンス全体をそのセクションに適用
			if (selectedIds.length === 1) {
				const targetId = selectedIds[0];
				const lines = aiResponse.split('\n');
				let newHeading: string | undefined;
				let contentLines: string[] = [];

				for (const line of lines) {
					const headingMatch = line.match(/^#+\s+(.+)$/);
					if (headingMatch && !newHeading) {
						newHeading = headingMatch[1];
					} else if (line.trim() && !line.startsWith('#')) {
						contentLines.push(line);
					}
				}

				sections = sections.map(s => {
					if (s.id !== targetId) return s;
					return {
						...s,
						heading: newHeading || s.heading,
						content: markdownToHtml(contentLines.join('\n')),
						selected: false
					};
				});
				modifiedCount = 1;
			} else {
				// 複数選択の場合、マークダウン見出しで分割
				const newSections = parseMarkdownToSections(aiResponse);
				if (newSections.length > 0) {
					for (let i = 0; i < Math.min(selectedIds.length, newSections.length); i++) {
						const targetId = selectedIds[i];
						const newContent = newSections[i];
						sections = sections.map(s => {
							if (s.id !== targetId) return s;
							return {
								...s,
								heading: newContent.heading,
								content: newContent.content,
								selected: false
							};
						});
						modifiedCount++;
					}
				}
			}
		}

		// 選択解除
		sections = sections.map(s => ({ ...s, selected: false }));

		return modifiedCount;
	}

	// マークダウンをセクションに変換
	function parseMarkdownToSections(markdown: string): Section[] {
		const result: Section[] = [];
		const lines = markdown.split('\n');
		let currentSection: Section | null = null;
		let currentContent = '';
		let sectionIndex = sections.length;

		for (const line of lines) {
			const h1Match = line.match(/^#\s+(.+)$/);
			const h2Match = line.match(/^##\s+(.+)$/);
			const h3Match = line.match(/^###\s+(.+)$/);
			const h4Match = line.match(/^####\s+(.+)$/);

			if (h1Match || h2Match || h3Match || h4Match) {
				if (currentSection) {
					currentSection.content = markdownToHtml(currentContent);
					result.push(currentSection);
					currentContent = '';
				}

				const level = h1Match ? 1 : h2Match ? 2 : h3Match ? 3 : 4;
				const heading = (h1Match || h2Match || h3Match || h4Match)![1];

				currentSection = {
					id: `section-${sectionIndex++}`,
					level,
					heading,
					content: '',
					selected: false
				};
			} else if (currentSection && line.trim()) {
				currentContent += line + '\n';
			}
		}

		if (currentSection) {
			currentSection.content = markdownToHtml(currentContent);
			result.push(currentSection);
		}

		return result;
	}

	// マークダウンをHTMLに変換（本文のみ）
	function markdownToHtml(markdown: string): string {
		const { styles } = selectedTemplate;
		const pStyle = applyThemeColor(styles.pStyle);
		let html = '';
		const lines = markdown.split('\n');

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('```') || trimmed.startsWith('---')) continue;
			html += `<p style="${pStyle}">${trimmed}</p>`;
		}

		return html;
	}

	// 見出しクリックでスクロール
	function scrollToSection(section: Section) {
		if (editorMode === 'visual' && visualEditor) {
			const headings = visualEditor.querySelectorAll('h1, h2, h3, h4');
			const idx = sections.findIndex(s => s.id === section.id);
			if (headings[idx]) {
				headings[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		}
	}

	function goBack() {
		goto('/');
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement)?.id === 'ai-chat-input') {
			e.preventDefault();
			sendMessage();
		}
	}

	// セクション削除
	function deleteSelectedSections() {
		if (!hasSelection) return;
		const count = selectedSections.length;
		sections = sections.filter(s => !s.selected);
		updateTocContent(); // 目次を更新
		chatMessages = [...chatMessages, { role: 'assistant', content: `${count}件のセクションを削除しました。` }];
	}

	// セクション移動
	function moveSection(direction: 'up' | 'down') {
		if (selectedSections.length !== 1) return;
		const idx = sections.findIndex(s => s.selected);
		if (idx === -1) return;
		if (direction === 'up' && idx === 0) return;
		if (direction === 'down' && idx === sections.length - 1) return;

		const newIdx = direction === 'up' ? idx - 1 : idx + 1;
		const newSections = [...sections];
		[newSections[idx], newSections[newIdx]] = [newSections[newIdx], newSections[idx]];
		sections = newSections;
		updateTocContent(); // 目次を更新
	}

	// 新しいセクションを追加
	let sectionCounter = $state(0);

	function addSection(level: number) {
		const newSection: Section = {
			id: `section-new-${Date.now()}-${sectionCounter++}`,
			level,
			heading: `新しい見出し（H${level}）`,
			content: '<p>ここに本文を入力...</p>',
			selected: false
		};

		// 選択中のセクションの後ろに挿入、なければ末尾
		const selectedIdx = sections.findIndex(s => s.selected);
		if (selectedIdx >= 0) {
			sections = [...sections.slice(0, selectedIdx + 1), newSection, ...sections.slice(selectedIdx + 1)];
		} else {
			sections = [...sections, newSection];
		}
		updateTocContent();
	}

	// 本文のみ追加（選択中のセクションに追加）
	function addParagraph() {
		if (selectedSections.length === 1) {
			const idx = sections.findIndex(s => s.selected);
			if (idx >= 0) {
				sections[idx].content += '<p>新しい段落...</p>';
				sections = [...sections]; // 再描画
			}
		} else {
			// 選択なしの場合は最後のセクションに追加
			if (sections.length > 0) {
				const lastIdx = sections.length - 1;
				sections[lastIdx].content += '<p>新しい段落...</p>';
				sections = [...sections];
			}
		}
	}

	// Kindle対応HTML出力
	function generateKindleHtml(): string {
		const title = sections.find(s => s.level === 1)?.heading || '無題';
		const contentSections = sections.filter(s => s.id !== 'toc');

		// 目次HTML生成
		let tocHtml = '<nav epub:type="toc" id="toc">\n<h2>目次</h2>\n<ol>\n';
		for (const sec of contentSections) {
			const indent = '  '.repeat(sec.level - 1);
			tocHtml += `${indent}<li><a href="#${sec.id}">${sec.heading}</a></li>\n`;
		}
		tocHtml += '</ol>\n</nav>\n';

		// 本文HTML生成
		let bodyHtml = '';
		for (const sec of contentSections) {
			// 章の始まりにページブレーク（H1, H2）
			const pageBreak = sec.level <= 2 ? 'page-break-before: always;' : '';
			bodyHtml += `<section id="${sec.id}" aria-labelledby="${sec.id}-heading">\n`;
			bodyHtml += `<h${sec.level} id="${sec.id}-heading" style="${pageBreak}">${sec.heading}</h${sec.level}>\n`;
			// 本文のHTMLタグを整理
			const cleanContent = sec.content
				.replace(/<p[^>]*style="[^"]*"[^>]*>/gi, '<p>')
				.replace(/<(?!\/?(?:p|br|em|strong|span|a|ul|ol|li|blockquote))[^>]+>/gi, '');
			bodyHtml += cleanContent + '\n';
			bodyHtml += '</section>\n\n';
		}

		// Kindle対応HTMLテンプレート
		return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<style type="text/css">
/* Kindle対応CSS */
body {
  font-family: serif;
  font-size: 1em;
  line-height: 1.8;
  margin: 0;
  padding: 0;
}
h1 {
  font-size: 1.8em;
  font-weight: bold;
  text-align: center;
  margin: 2em 0 1em 0;
  page-break-before: always;
}
h2 {
  font-size: 1.4em;
  font-weight: bold;
  margin: 1.5em 0 0.8em 0;
  page-break-before: always;
}
h3 {
  font-size: 1.2em;
  font-weight: bold;
  margin: 1.2em 0 0.6em 0;
}
h4 {
  font-size: 1.1em;
  font-weight: bold;
  margin: 1em 0 0.5em 0;
}
p {
  margin: 0.8em 0;
  text-indent: 1em;
  text-align: justify;
}
nav#toc {
  page-break-after: always;
}
nav#toc h2 {
  text-align: center;
  page-break-before: avoid;
}
nav#toc ol {
  list-style-type: none;
  padding-left: 0;
}
nav#toc li {
  margin: 0.5em 0;
}
nav#toc a {
  text-decoration: none;
  color: inherit;
}
section {
  margin: 0;
  padding: 0;
}
</style>
</head>
<body>
<!-- 表紙 -->
<section id="cover" aria-label="表紙">
<h1 style="margin-top: 30%; page-break-before: avoid;">${title}</h1>
</section>

<!-- 目次 -->
${tocHtml}

<!-- 本文 -->
${bodyHtml}
</body>
</html>`;
	}

	// 電子書籍として出力
	async function exportAsKindleHtml() {
		if (sections.length === 0) {
			errorMessage = 'セクションがありません';
			setTimeout(() => errorMessage = '', 3000);
			return;
		}

		try {
			const kindleHtml = generateKindleHtml();
			const title = sections.find(s => s.level === 1)?.heading || '無題';
			const fileName = `${title.replace(/[\\/:*?"<>|]/g, '_')}_kindle.html`;

			// Blobを作成してダウンロード
			const blob = new Blob([kindleHtml], { type: 'application/xhtml+xml;charset=utf-8' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = fileName;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			successMessage = `「${fileName}」をダウンロードしました`;
			setTimeout(() => successMessage = '', 3000);
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'エクスポートに失敗しました';
			setTimeout(() => errorMessage = '', 3000);
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
				<input
					type="text"
					bind:value={contentTitle}
					placeholder="タイトル"
					class="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm w-48"
				/>
			</div>
			<div class="flex items-center gap-2">
				<button
					onclick={async () => { const r = await selectFolder(); if (r.success) await refreshFolderHtmlFiles(); }}
					class="flex items-center gap-1.5 px-2 py-1 rounded text-xs {getLastDirectoryHandle() ? 'bg-green-600/20 border border-green-500 text-green-400' : 'bg-yellow-600/20 border border-yellow-500 text-yellow-400'}"
				>
					<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
					</svg>
					{getLastDirectoryHandle()?.name || 'フォルダ選択'}
				</button>
				<button onclick={loadFromFile} disabled={isLoading} class="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-3 py-1.5 rounded text-xs">
					読込
				</button>
				<button onclick={saveToFile} disabled={isSaving || sections.length === 0} class="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-3 py-1.5 rounded text-xs">
					保存
				</button>
				<button onclick={createNew} class="bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded text-xs">
					新規
				</button>
				<span class="border-l border-gray-600 h-5"></span>
				<button
					onclick={exportAsKindleHtml}
					disabled={sections.length === 0}
					class="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 px-3 py-1.5 rounded text-xs flex items-center gap-1"
					title="Kindle対応HTMLとしてダウンロード"
				>
					<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
					</svg>
					Kindle出力
				</button>
			</div>
		</div>
	</header>

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

	<main class="flex-1 flex overflow-hidden {isResizingChat || isResizingHeadings ? 'select-none' : ''}">
		<!-- Left: チャット -->
		<div class="flex flex-col border-r border-gray-700 flex-shrink-0" style="width: {chatWidth}px;">
			<div class="px-3 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
				<span class="text-xs font-semibold text-gray-300">AIチャット</span>
				{#if hasSelection}
					<span class="text-[10px] bg-purple-600 px-1.5 py-0.5 rounded">{selectedSections.length}件選択中</span>
				{/if}
			</div>

			<!-- モデル選択 -->
			<div class="p-2 bg-gray-800/50 border-b border-gray-700">
				<select bind:value={selectedModel} class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs">
					{#each availableModels as model (model.id)}
						<option value={model.id}>{model.name}</option>
					{/each}
				</select>
			</div>

			<!-- コンテンツ読み込みボタン -->
			<div class="p-2 bg-gray-800/50 border-b border-gray-700 flex gap-1">
				<button
					onclick={loadAllContent}
					disabled={sections.length === 0 || loadedContext === 'all'}
					class="flex-1 px-2 py-1.5 text-xs rounded flex items-center justify-center gap-1 {loadedContext === 'all' ? 'bg-green-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'} disabled:opacity-50 disabled:cursor-not-allowed"
					title={loadedContext === 'all' ? '読み込み済み' : '本の全内容をAIに読み込ませる'}
				>
					{#if loadedContext === 'all'}
						<span>✓</span>
					{:else}
						<span>📖</span>
					{/if}
					<span>全体</span>
				</button>
				<button
					onclick={loadSelectedContent}
					disabled={!hasSelection || loadedContext === 'selected'}
					class="flex-1 px-2 py-1.5 text-xs rounded flex items-center justify-center gap-1 {loadedContext === 'selected' ? 'bg-purple-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'} disabled:opacity-50 disabled:cursor-not-allowed"
					title={loadedContext === 'selected' ? '読み込み済み' : '選択した見出しの内容をAIに読み込ませる'}
				>
					{#if loadedContext === 'selected'}
						<span>✓</span>
					{:else}
						<span>📝</span>
					{/if}
					<span>選択</span>
					{#if hasSelection && loadedContext !== 'selected'}
						<span class="text-[10px] opacity-70">({selectedSections.length})</span>
					{/if}
				</button>
				{#if loadedContext !== 'none'}
					<button
						onclick={resetLoadedContext}
						class="px-2 py-1.5 text-xs rounded bg-gray-700 hover:bg-red-600 text-gray-300 hover:text-white transition-colors"
						title="読み込みをリセット"
					>
						✕
					</button>
				{/if}
			</div>

			<!-- フォルダ内ファイル -->
			{#if folderHtmlFiles.length > 0}
				<div class="p-2 bg-gray-800/50 border-b border-gray-700">
					<select onchange={(e) => loadHtmlFromFolder((e.target as HTMLSelectElement).value)} class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs">
						<option value="">ファイルを開く ({folderHtmlFiles.length})</option>
						{#each folderHtmlFiles as file (file.name)}
							<option value={file.name}>{file.name}</option>
						{/each}
					</select>
				</div>
			{/if}

			<!-- チャットメッセージ -->
			<div class="flex-1 overflow-y-auto p-2 space-y-2">
				{#if chatMessages.length === 0}
					<div class="text-center text-gray-500 py-4 text-xs">
						<p class="mb-2">使い方</p>
						<p class="text-[10px] text-gray-600">1. 「新規」で作成または既存ファイル読込</p>
						<p class="text-[10px] text-gray-600">2. 見出しをクリック/チェックで選択</p>
						<p class="text-[10px] text-gray-600">3. チャットで修正指示</p>
						<p class="text-[10px] text-gray-600 mt-2">選択なし = 新規生成</p>
						<p class="text-[10px] text-gray-600">選択あり = 部分修正</p>
					</div>
				{:else}
					{#each chatMessages as message, i (i)}
						<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
							<div class="max-w-[90%] rounded-lg px-2.5 py-1.5 text-xs {message.role === 'user' ? 'bg-purple-600' : 'bg-gray-700'}">
								<!-- 思考内容（折りたたみ） -->
								{#if message.reasoning}
									<div class="mb-2">
										<button
											onclick={() => toggleReasoning(i)}
											class="flex items-center gap-1 text-[10px] text-yellow-400 hover:text-yellow-300"
										>
											<span class="transition-transform {expandedReasoning.has(i) ? 'rotate-90' : ''}">▶</span>
											<span>💭 思考過程</span>
											<span class="text-gray-500">({message.reasoning.length.toLocaleString()}文字)</span>
										</button>
										{#if expandedReasoning.has(i)}
											<div class="mt-1 p-2 bg-yellow-900/30 border border-yellow-800/50 rounded text-[10px] text-yellow-200/80 max-h-48 overflow-y-auto whitespace-pre-wrap">
												{message.reasoning.length > 3000 ? message.reasoning.substring(0, 3000) + '...(省略)' : message.reasoning}
											</div>
										{/if}
									</div>
								{/if}
								<div class="whitespace-pre-wrap break-words">{message.content.replace(/\n\n---\n.*実行しますか？$/, '')}</div>
								{#if message.actionType === 'execute'}
									<div class="mt-2 pt-2 border-t border-gray-600 flex gap-2">
										<button
											onclick={executeProposal}
											disabled={isExecuting}
											class="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded text-xs font-medium"
										>
											{isExecuting ? '実行中...' : '✓ 実行する'}
										</button>
										<button
											onclick={() => { chatMessages = chatMessages.map((m, idx) => idx === i ? { ...m, actionType: null } : m); }}
											class="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs"
										>
											スキップ
										</button>
									</div>
								{/if}
							</div>
						</div>
					{/each}
					{#if isGenerating || isExecuting}
						<div class="flex justify-start">
							<div class="bg-gray-700 rounded-lg px-2.5 py-1.5 flex flex-col gap-1 text-xs max-w-[90%]">
								<div class="flex items-center gap-2">
									<span class="animate-spin w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full flex-shrink-0"></span>
									{#if isExecuting}
										実行中...
									{:else if streamingContent}
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

			<!-- 選択状態表示 -->
			{#if hasSelection}
				<div class="px-2 py-1.5 bg-purple-900/50 border-t border-purple-700 text-xs">
					<div class="flex items-center gap-2">
						<span class="text-purple-300 font-medium">📝 {selectedSections.length}件選択中</span>
						<span class="text-purple-400 truncate flex-1">
							{selectedSections.slice(0, 3).map(s => s.heading).join('、')}{selectedSections.length > 3 ? '...' : ''}
						</span>
						<button onclick={deselectAll} class="text-purple-400 hover:text-purple-200 text-[10px]">解除</button>
					</div>
				</div>
			{/if}

			<!-- 入力 -->
			<div class="p-2 bg-gray-800 border-t border-gray-700">
				<div class="flex gap-1.5">
					<textarea
						id="ai-chat-input"
						bind:value={userInput}
						placeholder={hasSelection ? `選択した${selectedSections.length}件について指示...` : '質問や生成指示を入力...'}
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
		<div onmousedown={startResizeChat} class="w-1 bg-gray-700 hover:bg-purple-500 cursor-col-resize flex-shrink-0"></div>

		<!-- Middle: 見出しパネル -->
		<div class="flex flex-col border-r border-gray-700 bg-gray-850 flex-shrink-0" style="width: {headingsWidth}px;">
			<div class="px-3 py-2 bg-gray-800 border-b border-gray-700">
				<span class="text-xs font-semibold text-gray-300">見出し ({sections.length})</span>
			</div>

			<!-- 一括操作 -->
			<div class="p-2 bg-gray-800/50 border-b border-gray-700 flex gap-1 flex-wrap">
				<button onclick={selectAll} class="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-[10px]">全選択</button>
				<button onclick={deselectAll} class="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-[10px]">解除</button>
				{#if hasSelection}
					<button onclick={deleteSelectedSections} class="px-2 py-1 bg-red-600/50 hover:bg-red-600 rounded text-[10px]">削除</button>
				{/if}
				{#if selectedSections.length === 1}
					<button onclick={() => moveSection('up')} class="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-[10px]">↑</button>
					<button onclick={() => moveSection('down')} class="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-[10px]">↓</button>
				{/if}
				<span class="border-l border-gray-600 mx-1"></span>
				<button
					onclick={toggleToc}
					class="px-2 py-1 rounded text-[10px] {hasToc ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-700 hover:bg-gray-600'}"
				>
					{hasToc ? '目次✓' : '目次'}
				</button>
			</div>

			<!-- 見出しリスト -->
			<div class="flex-1 overflow-y-auto">
				{#if sections.length === 0}
					<div class="text-center text-gray-500 py-4 text-xs">
						見出しがありません<br />
						「新規」または「読込」で開始
					</div>
				{:else}
					{#each sections as section (section.id)}
						<div
							class="flex items-center gap-1 px-2 py-1.5 border-b border-gray-700/50 hover:bg-gray-700/50 cursor-pointer {section.selected ? 'bg-purple-600/20' : ''} {section.id === 'toc' ? 'bg-blue-900/30' : ''}"
							style="padding-left: {(section.level - 1) * 12 + 8}px;"
						>
							{#if section.id === 'toc'}
								<span class="w-3 h-3 flex items-center justify-center text-[8px] text-blue-400">📋</span>
							{:else}
								<input
									type="checkbox"
									checked={section.selected}
									onchange={() => toggleSectionCheckbox(section.id)}
									class="w-3 h-3 rounded"
								/>
							{/if}
							<button
								onclick={(e) => { if (section.id !== 'toc') toggleSection(section.id, e.ctrlKey); scrollToSection(section); }}
								ondblclick={() => { if (section.id !== 'toc') selectWithChildren(section.id); }}
								class="flex-1 text-left text-xs truncate"
								title={section.id === 'toc' ? '目次（自動更新）' : 'クリック: 選択 / Ctrl+クリック: 追加選択 / ダブルクリック: 子も選択'}
							>
								<span class="text-[10px] {section.id === 'toc' ? 'text-blue-400' : 'text-gray-500'} mr-1">{section.id === 'toc' ? '目次' : `H${section.level}`}</span>
								{section.heading}
							</button>
						</div>
					{/each}
				{/if}
			</div>
		</div>

		<!-- 見出し欄リサイズハンドル -->
		<div onmousedown={startResizeHeadings} class="w-1 bg-gray-700 hover:bg-purple-500 cursor-col-resize flex-shrink-0"></div>

		<!-- Right: エディタ -->
		<div class="flex-1 flex flex-col bg-gray-600">
			<div class="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<div class="flex items-center gap-1 bg-gray-700 rounded p-0.5">
						<button onclick={() => editorMode = 'visual'} class="px-2 py-1 text-xs rounded {editorMode === 'visual' ? 'bg-gray-600 text-white' : 'text-gray-400'}">
							ビジュアル
						</button>
						<button onclick={() => editorMode = 'code'} class="px-2 py-1 text-xs rounded {editorMode === 'code' ? 'bg-gray-600 text-white' : 'text-gray-400'}">
							コード
						</button>
					</div>
					<span class="border-l border-gray-600 h-6"></span>
					<!-- 追加ボタン -->
					<div class="flex items-center gap-1.5">
						<span class="text-xs text-gray-400">追加:</span>
						<button onclick={() => addSection(1)} class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium" title="H1見出しを追加">H1</button>
						<button onclick={() => addSection(2)} class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium" title="H2見出しを追加">H2</button>
						<button onclick={() => addSection(3)} class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium" title="H3見出しを追加">H3</button>
						<button onclick={addParagraph} class="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded text-xs font-medium" title="段落を追加">段落</button>
					</div>
					<span class="border-l border-gray-600 h-6"></span>
					<button
						onclick={() => showTemplatePreview = true}
						class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs flex items-center gap-1.5"
					>
						<span>📄</span>
						<span>{selectedTemplate.name}</span>
						<span class="text-gray-400">▼</span>
					</button>
					<span class="border-l border-gray-600 h-6"></span>
					<div class="flex items-center gap-1">
						<span class="text-xs text-gray-400 mr-1">色:</span>
						{#each THEME_COLORS as color (color.id)}
							<button
								onclick={() => selectedThemeColorId = color.id}
								class="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 {selectedThemeColorId === color.id ? 'border-white scale-110' : 'border-gray-600'}"
								style="background-color: {color.primary};"
								title={color.name}
							></button>
						{/each}
					</div>
					<span class="border-l border-gray-600 h-6"></span>
					<div class="flex items-center gap-1 bg-gray-700 rounded p-0.5">
						<button
							onclick={() => pageSize = 'auto'}
							class="px-2 py-1 text-xs rounded {pageSize === 'auto' ? 'bg-gray-600 text-white' : 'text-gray-400'}"
							title="自動幅"
						>
							自動
						</button>
						<button
							onclick={() => pageSize = 'a4'}
							class="px-2 py-1 text-xs rounded {pageSize === 'a4' ? 'bg-gray-600 text-white' : 'text-gray-400'}"
							title="A4サイズ（210×297mm）"
						>
							A4
						</button>
					</div>
				</div>
				<div class="text-[10px] text-gray-400">
					{sections.length}セクション / {generatedHtml.length.toLocaleString()}文字
				</div>
			</div>

			<div class="flex-1 overflow-hidden">
				{#if sections.length > 0}
					{#if editorMode === 'visual'}
						<div
							bind:this={visualEditor}
							contenteditable="true"
							oninput={debouncedSyncFromVisualEditor}
							onblur={syncFromVisualEditor}
							onclick={handleEditorClick}
							class="w-full h-full text-gray-900 overflow-auto focus:outline-none {pageSize === 'a4' ? 'bg-gray-600' : 'p-6'}"
							style="font-family: 'Hiragino Sans', sans-serif; line-height: 1.8; {pageSize === 'auto' ? `background-color: ${selectedThemeColor.bg};` : ''}"
						></div>
					{:else}
						<textarea
							value={formattedHtml}
							oninput={(e) => { sections = parseHtmlToSections((e.target as HTMLTextAreaElement).value); }}
							class="w-full h-full p-6 bg-gray-950 text-green-400 text-sm font-mono resize-none focus:outline-none leading-relaxed"
							spellcheck="false"
							style="tab-size: 2;"
						></textarea>
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

<!-- テンプレートプレビューモーダル -->
{#if showTemplatePreview}
	<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onclick={() => showTemplatePreview = false}>
		<div class="bg-gray-800 rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden" onclick={(e) => e.stopPropagation()}>
			<div class="flex items-center justify-between px-6 py-4 border-b border-gray-700">
				<h2 class="text-lg font-bold">テンプレートを選択</h2>
				<button onclick={() => showTemplatePreview = false} class="text-gray-400 hover:text-white text-2xl">&times;</button>
			</div>
			<div class="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{#each EBOOK_TEMPLATES as template (template.id)}
						<button
							onclick={() => { selectedTemplateId = template.id; showTemplatePreview = false; }}
							class="text-left rounded-lg overflow-hidden border-2 transition-all hover:scale-[1.02] {selectedTemplateId === template.id ? 'border-purple-500 ring-2 ring-purple-500/50' : 'border-gray-600 hover:border-gray-500'}"
						>
							<!-- プレビュー -->
							<div class="h-48 overflow-hidden bg-white">
								<div
									class="transform scale-[0.4] origin-top-left w-[250%] h-[250%] pointer-events-none"
									style="{getPreviewStyle(template, 'containerStyle')} font-family: {template.styles.fontFamily}; font-size: {template.styles.fontSize}; line-height: {template.styles.lineHeight};"
								>
									<h1 style={getPreviewStyle(template, 'h1Style')}>サンプルタイトル</h1>
									<p style={getPreviewStyle(template, 'pStyle')}>これはサンプルの本文です。テンプレートの見た目を確認できます。</p>
									<h2 style={getPreviewStyle(template, 'h2Style')}>第1章 はじめに</h2>
									<p style={getPreviewStyle(template, 'pStyle')}>電子書籍のスタイルをプレビューしています。</p>
									<h3 style={getPreviewStyle(template, 'h3Style')}>1.1 概要</h3>
									<p style={getPreviewStyle(template, 'pStyle')}>見出しと本文のバランスを確認できます。</p>
								</div>
							</div>
							<!-- ラベル -->
							<div class="px-4 py-3 bg-gray-700">
								<div class="flex items-center justify-between">
									<div>
										<div class="font-medium">{template.name}</div>
										<div class="text-xs text-gray-400">{template.description}</div>
									</div>
									{#if selectedTemplateId === template.id}
										<span class="text-purple-400 text-lg">✓</span>
									{/if}
								</div>
							</div>
						</button>
					{/each}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.bg-gray-850 { background-color: #1a1f2e; }
</style>
