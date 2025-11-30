<script lang="ts">
	import type { SlideElement, SlideTheme } from '$lib/slideCanvasTypes';
	import { generateElementId } from '$lib/slideCanvasTypes';

	interface Props {
		theme: SlideTheme;
		selectedElement: SlideElement | null;
		backgroundColor: string;
		onAddElement: (element: SlideElement) => void;
		onDeleteElement: () => void;
		onUpdateElement: (updates: Partial<SlideElement>) => void;
		onChangeBackgroundColor: (color: string) => void;
	}

	let { theme, selectedElement, backgroundColor, onAddElement, onDeleteElement, onUpdateElement, onChangeBackgroundColor }: Props = $props();

	// キャンバスサイズ定数
	const CANVAS_WIDTH = 1280;
	const CANVAS_HEIGHT = 720;

	// 要素の幅と高さを取得（型に応じて）
	function getElementSize(elem: SlideElement): { width: number; height: number } {
		if (elem.type === 'circle') {
			const r = elem.radius || 50;
			return { width: r * 2, height: r * 2 };
		}
		if (elem.type === 'star') {
			const r = elem.outerRadius || 40;
			return { width: r * 2, height: r * 2 };
		}
		return { width: elem.width || 100, height: elem.height || 100 };
	}

	// ワンクリック配置関数
	function snapToPosition(position: 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'full-width' | 'full-height' | 'full') {
		if (!selectedElement) return;
		const size = getElementSize(selectedElement);

		let updates: Partial<SlideElement> = {};

		switch (position) {
			case 'top-left':
				updates = { x: 0, y: 0 };
				break;
			case 'top-center':
				updates = { x: (CANVAS_WIDTH - size.width) / 2, y: 0 };
				break;
			case 'top-right':
				updates = { x: CANVAS_WIDTH - size.width, y: 0 };
				break;
			case 'center-left':
				updates = { x: 0, y: (CANVAS_HEIGHT - size.height) / 2 };
				break;
			case 'center':
				updates = { x: (CANVAS_WIDTH - size.width) / 2, y: (CANVAS_HEIGHT - size.height) / 2 };
				break;
			case 'center-right':
				updates = { x: CANVAS_WIDTH - size.width, y: (CANVAS_HEIGHT - size.height) / 2 };
				break;
			case 'bottom-left':
				updates = { x: 0, y: CANVAS_HEIGHT - size.height };
				break;
			case 'bottom-center':
				updates = { x: (CANVAS_WIDTH - size.width) / 2, y: CANVAS_HEIGHT - size.height };
				break;
			case 'bottom-right':
				updates = { x: CANVAS_WIDTH - size.width, y: CANVAS_HEIGHT - size.height };
				break;
			case 'full-width':
				updates = { x: 0, width: CANVAS_WIDTH };
				break;
			case 'full-height':
				updates = { x: (CANVAS_WIDTH - size.width) / 2, y: 0, height: CANVAS_HEIGHT };
				break;
			case 'full':
				updates = { x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
				break;
		}

		// 円や星の場合は中心座標で調整
		if (selectedElement.type === 'circle' || selectedElement.type === 'star') {
			const r = selectedElement.type === 'circle' ? (selectedElement.radius || 50) : (selectedElement.outerRadius || 40);
			if (updates.x !== undefined) updates.x = (updates.x as number) + r;
			if (updates.y !== undefined) updates.y = (updates.y as number) + r;
		}

		onUpdateElement(updates);
	}

	let showTextPanel = $state(false);
	let showShapePanel = $state(false);
	let showImagePanel = $state(false);
	let showBackgroundPanel = $state(false);
	let showFillColorPanel = $state(false);
	let showStrokeColorPanel = $state(false);
	let showMarkerPanel = $state(false);

	// すべてのパネルを閉じる
	function closeAllPanels() {
		showTextPanel = false;
		showShapePanel = false;
		showImagePanel = false;
		showBackgroundPanel = false;
		showFillColorPanel = false;
		showStrokeColorPanel = false;
		showMarkerPanel = false;
	}

	// マーカーの種類
	const markerTypes = [
		{ id: 'none', name: 'なし', icon: '—' },
		{ id: 'underline', name: '下線', icon: '▁' },
		{ id: 'half', name: '半分', icon: '▄' },
		{ id: 'full', name: '全部', icon: '█' },
	];

	// 日本語対応フォント一覧
	const availableFonts = [
		{ name: 'Noto Sans JP', value: '"Noto Sans JP", sans-serif', category: 'ゴシック' },
		{ name: 'Noto Serif JP', value: '"Noto Serif JP", serif', category: '明朝' },
		{ name: 'M PLUS 1p', value: '"M PLUS 1p", sans-serif', category: 'ゴシック' },
		{ name: 'M PLUS Rounded 1c', value: '"M PLUS Rounded 1c", sans-serif', category: '丸ゴシック' },
		{ name: 'Zen Kaku Gothic New', value: '"Zen Kaku Gothic New", sans-serif', category: 'ゴシック' },
		{ name: 'Zen Maru Gothic', value: '"Zen Maru Gothic", sans-serif', category: '丸ゴシック' },
		{ name: 'Kosugi Maru', value: '"Kosugi Maru", sans-serif', category: '丸ゴシック' },
		{ name: 'Sawarabi Gothic', value: '"Sawarabi Gothic", sans-serif', category: 'ゴシック' },
	];

	// プリセット背景色
	const presetBackgroundColors = [
		{ name: '白', color: '#ffffff' },
		{ name: 'ライトブルー', color: '#dbeafe' },
		{ name: 'ライトグリーン', color: '#f0fdf4' },
		{ name: 'ライトパープル', color: '#faf5ff' },
		{ name: 'クリーム', color: '#fff7ed' },
		{ name: 'ライトグレー', color: '#f3f4f6' },
		{ name: 'ネイビー', color: '#1e3a5f' },
		{ name: 'ダークグレー', color: '#374151' },
	];

	// プリセット要素色 - 大カテゴリ別
	const colorCategories = [
		{
			name: '一般色',
			colors: [
				{ name: '黒', color: '#000000' },
				{ name: '白', color: '#ffffff' },
				{ name: 'グレー', color: '#808080' },
				{ name: 'ダークグレー', color: '#404040' },
				{ name: 'ライトグレー', color: '#c0c0c0' },
				{ name: '赤', color: '#ff0000' },
				{ name: '緑', color: '#00ff00' },
				{ name: '青', color: '#0000ff' },
				{ name: '黄', color: '#ffff00' },
				{ name: 'シアン', color: '#00ffff' },
				{ name: 'マゼンタ', color: '#ff00ff' },
				{ name: 'オレンジ', color: '#ff8000' },
			]
		},
		{
			name: 'マテリアルカラー',
			colors: [
				// Red & Pink
				{ name: 'レッド', color: '#F44336' },
				{ name: 'ピンク', color: '#E91E63' },
				// Purple
				{ name: 'パープル', color: '#9C27B0' },
				{ name: 'ディープパープル', color: '#673AB7' },
				// Indigo & Blue
				{ name: 'インディゴ', color: '#3F51B5' },
				{ name: 'ブルー', color: '#2196F3' },
				{ name: 'ライトブルー', color: '#03A9F4' },
				{ name: 'シアン', color: '#00BCD4' },
				// Teal & Green
				{ name: 'ティール', color: '#009688' },
				{ name: 'グリーン', color: '#4CAF50' },
				{ name: 'ライトグリーン', color: '#8BC34A' },
				{ name: 'ライム', color: '#CDDC39' },
				// Yellow & Orange
				{ name: 'イエロー', color: '#FFEB3B' },
				{ name: 'アンバー', color: '#FFC107' },
				{ name: 'オレンジ', color: '#FF9800' },
				{ name: 'ディープオレンジ', color: '#FF5722' },
				// Brown & Grey
				{ name: 'ブラウン', color: '#795548' },
				{ name: 'グレー', color: '#9E9E9E' },
				{ name: 'ブルーグレー', color: '#607D8B' },
				{ name: '黒', color: '#212121' },
			]
		},
		{
			name: 'マテリアルカラー（濃）',
			colors: [
				{ name: 'レッド濃', color: '#D32F2F' },
				{ name: 'ピンク濃', color: '#C2185B' },
				{ name: 'パープル濃', color: '#7B1FA2' },
				{ name: 'ディープパープル濃', color: '#512DA8' },
				{ name: 'インディゴ濃', color: '#303F9F' },
				{ name: 'ブルー濃', color: '#1976D2' },
				{ name: 'ライトブルー濃', color: '#0288D1' },
				{ name: 'シアン濃', color: '#0097A7' },
				{ name: 'ティール濃', color: '#00796B' },
				{ name: 'グリーン濃', color: '#388E3C' },
				{ name: 'ライトグリーン濃', color: '#689F38' },
				{ name: 'ライム濃', color: '#AFB42B' },
				{ name: 'イエロー濃', color: '#FBC02D' },
				{ name: 'アンバー濃', color: '#FFA000' },
				{ name: 'オレンジ濃', color: '#F57C00' },
				{ name: 'ディープオレンジ濃', color: '#E64A19' },
				{ name: 'ブラウン濃', color: '#5D4037' },
				{ name: 'グレー濃', color: '#616161' },
				{ name: 'ブルーグレー濃', color: '#455A64' },
			]
		},
		{
			name: 'マテリアルカラー（薄）',
			colors: [
				{ name: 'レッド薄', color: '#EF9A9A' },
				{ name: 'ピンク薄', color: '#F48FB1' },
				{ name: 'パープル薄', color: '#CE93D8' },
				{ name: 'ディープパープル薄', color: '#B39DDB' },
				{ name: 'インディゴ薄', color: '#9FA8DA' },
				{ name: 'ブルー薄', color: '#90CAF9' },
				{ name: 'ライトブルー薄', color: '#81D4FA' },
				{ name: 'シアン薄', color: '#80DEEA' },
				{ name: 'ティール薄', color: '#80CBC4' },
				{ name: 'グリーン薄', color: '#A5D6A7' },
				{ name: 'ライトグリーン薄', color: '#C5E1A5' },
				{ name: 'ライム薄', color: '#E6EE9C' },
				{ name: 'イエロー薄', color: '#FFF59D' },
				{ name: 'アンバー薄', color: '#FFE082' },
				{ name: 'オレンジ薄', color: '#FFCC80' },
				{ name: 'ディープオレンジ薄', color: '#FFAB91' },
				{ name: 'ブラウン薄', color: '#BCAAA4' },
				{ name: 'グレー薄', color: '#EEEEEE' },
				{ name: 'ブルーグレー薄', color: '#B0BEC5' },
			]
		},
	];

	// 全カラーをフラットにした配列（既存の互換性のため）
	const presetElementColors = colorCategories.flatMap(cat => cat.colors);

	// テンプレート画像リスト - キャラクター
	const characterImages = [
		{ name: 'キャラクター1', file: '1.png' },
		{ name: 'キャラクター2', file: '2.png' },
		{ name: 'OK', file: 'ok.png' },
		{ name: '考える', file: '考える.png' },
		{ name: '指', file: '指.png' },
		{ name: '指立て', file: '指立て.png' },
		{ name: 'アイコン', file: 'アイコン.png' },
		{ name: 'サングラス', file: 'サングラス.png' },
		{ name: 'ワイン', file: 'ワイン.png' },
		{ name: '祈り', file: '祈り.png' },
		{ name: 'ダウンロード', file: 'download.png' },
		{ name: 'デザイン4', file: '名称未設定のデザイン (4).png' },
		{ name: 'デザイン5', file: '名称未設定のデザイン (5).png' },
	];

	// テンプレート画像リスト - 透かし/ロゴ
	const watermarkImages = [
		{ name: '透かし青', file: '透かし課題解決型プログラムの素材青.png' },
		{ name: '透かしピンク', file: '透かし課題解決型プログラムの素材ピンク.png' },
	];

	// 利用可能な図形
	const availableShapes = [
		{ id: 'rect', name: '四角形', icon: '□' },
		{ id: 'circle', name: '円', icon: '○' },
		{ id: 'star', name: '星', icon: '★' },
		{ id: 'arrow', name: '矢印', icon: '→' },
		{ id: 'line', name: '線', icon: '―' },
	];

	function addText(type: 'title' | 'subtitle' | 'body' | 'bullet') {
		const configs = {
			title: { text: 'タイトル', fontSize: 56, fontStyle: 'bold' as const, y: 320 },
			subtitle: { text: 'サブタイトル', fontSize: 32, fontStyle: 'normal' as const, y: 400 },
			body: { text: '本文テキスト', fontSize: 24, fontStyle: 'normal' as const, y: 200 },
			bullet: { text: '• ポイント', fontSize: 24, fontStyle: 'normal' as const, y: 200 },
		};
		const config = configs[type];

		const element: SlideElement = {
			id: generateElementId(),
			type: 'text',
			x: 640,
			y: config.y,
			text: config.text,
			fontSize: config.fontSize,
			fontFamily: theme.fontFamily,
			fontStyle: config.fontStyle,
			fill: type === 'subtitle' ? theme.accentColor : theme.textColor,
			align: 'center'
		};
		onAddElement(element);
		showTextPanel = false;
	}

	function addShape(shapeId: string) {
		let element: SlideElement;

		switch (shapeId) {
			case 'rect':
				element = {
					id: generateElementId(),
					type: 'rect',
					x: 540,
					y: 300,
					width: 200,
					height: 120,
					fill: theme.primaryColor,
					stroke: '#ffffff',
					strokeWidth: 2
				};
				break;
			case 'rect-outline':
				element = {
					id: generateElementId(),
					type: 'rect',
					x: 540,
					y: 300,
					width: 200,
					height: 120,
					fill: 'transparent',
					stroke: theme.primaryColor,
					strokeWidth: 3
				};
				break;
			case 'circle':
				element = {
					id: generateElementId(),
					type: 'circle',
					x: 640,
					y: 360,
					radius: 60,
					fill: theme.accentColor,
					stroke: '#ffffff',
					strokeWidth: 2
				};
				break;
			case 'circle-outline':
				element = {
					id: generateElementId(),
					type: 'circle',
					x: 640,
					y: 360,
					radius: 60,
					fill: 'transparent',
					stroke: theme.accentColor,
					strokeWidth: 3
				};
				break;
			case 'star':
				element = {
					id: generateElementId(),
					type: 'star',
					x: 640,
					y: 360,
					numPoints: 5,
					innerRadius: 30,
					outerRadius: 60,
					fill: theme.accentColor
				};
				break;
			case 'star-outline':
				element = {
					id: generateElementId(),
					type: 'star',
					x: 640,
					y: 360,
					numPoints: 5,
					innerRadius: 30,
					outerRadius: 60,
					fill: 'transparent',
					stroke: theme.accentColor,
					strokeWidth: 2
				};
				break;
			case 'arrow':
				element = {
					id: generateElementId(),
					type: 'arrow',
					x: 400,
					y: 360,
					points: [0, 0, 200, 0],
					stroke: theme.primaryColor,
					strokeWidth: 4
				};
				break;
			case 'line':
				element = {
					id: generateElementId(),
					type: 'line',
					x: 400,
					y: 360,
					points: [0, 0, 300, 0],
					stroke: theme.primaryColor,
					strokeWidth: 3
				};
				break;
			default:
				return;
		}

		onAddElement(element);
		showShapePanel = false;
	}

	function addTemplateImage(fileName: string) {
		const element: SlideElement = {
			id: generateElementId(),
			type: 'image',
			x: 900,
			y: 400,
			width: 200,
			height: 200,
			src: `/template-images/${fileName}`
		};
		onAddElement(element);
		showImagePanel = false;
	}

	function handleImageUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			const dataUrl = e.target?.result as string;
			const element: SlideElement = {
				id: generateElementId(),
				type: 'image',
				x: 500,
				y: 200,
				width: 300,
				height: 200,
				src: dataUrl
			};
			onAddElement(element);
		};
		reader.readAsDataURL(file);
		input.value = '';
		showImagePanel = false;
	}

	// ヘッダーバーを追加
	function addHeaderBar() {
		const element: SlideElement = {
			id: generateElementId(),
			type: 'rect',
			x: 0,
			y: 0,
			width: 1280,
			height: 80,
			fill: theme.primaryColor
		};
		onAddElement(element);
	}
</script>

<div class="toolbar flex items-center gap-2 p-2 bg-gray-800 border-b border-gray-700">
	<!-- 背景色 -->
	<div class="relative">
		<button
			onclick={() => { showBackgroundPanel = !showBackgroundPanel; showTextPanel = false; showShapePanel = false; showImagePanel = false; }}
			class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-gray-700 hover:bg-gray-600 transition-colors"
			title="背景色"
		>
			<div class="w-4 h-4 rounded border border-gray-500" style="background-color: {backgroundColor};"></div>
			背景
		</button>
		{#if showBackgroundPanel}
			<div class="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 p-3 min-w-[200px]">
				<p class="text-xs text-gray-400 mb-2">プリセット</p>
				<div class="grid grid-cols-4 gap-1 mb-3">
					{#each presetBackgroundColors as preset}
						<button
							onclick={() => { onChangeBackgroundColor(preset.color); showBackgroundPanel = false; }}
							class="w-8 h-8 rounded border-2 transition-all {backgroundColor === preset.color ? 'border-orange-500' : 'border-gray-600 hover:border-gray-400'}"
							style="background-color: {preset.color};"
							title={preset.name}
						></button>
					{/each}
				</div>
				<hr class="border-gray-700 mb-3" />
				<p class="text-xs text-gray-400 mb-2">カスタム</p>
				<div class="flex items-center gap-2">
					<input
						type="color"
						value={backgroundColor}
						onchange={(e) => { onChangeBackgroundColor((e.target as HTMLInputElement).value); }}
						class="w-8 h-8 rounded cursor-pointer border-0"
					/>
					<input
						type="text"
						value={backgroundColor}
						onchange={(e) => { onChangeBackgroundColor((e.target as HTMLInputElement).value); }}
						class="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs"
						placeholder="#ffffff"
					/>
				</div>
			</div>
		{/if}
	</div>

	<div class="w-px h-6 bg-gray-600 mx-1"></div>

	<!-- テキスト追加 -->
	<div class="relative">
		<button
			onclick={() => { showTextPanel = !showTextPanel; showShapePanel = false; showImagePanel = false; showBackgroundPanel = false; }}
			class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-gray-700 hover:bg-gray-600 transition-colors"
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
			</svg>
			テキスト
		</button>
		{#if showTextPanel}
			<div class="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 p-2 min-w-[150px]">
				<button onclick={() => addText('title')} class="w-full text-left px-3 py-2 text-xs hover:bg-gray-700 rounded transition-colors">
					タイトル (大)
				</button>
				<button onclick={() => addText('subtitle')} class="w-full text-left px-3 py-2 text-xs hover:bg-gray-700 rounded transition-colors">
					サブタイトル
				</button>
				<button onclick={() => addText('body')} class="w-full text-left px-3 py-2 text-xs hover:bg-gray-700 rounded transition-colors">
					本文
				</button>
				<button onclick={() => addText('bullet')} class="w-full text-left px-3 py-2 text-xs hover:bg-gray-700 rounded transition-colors">
					箇条書き
				</button>
			</div>
		{/if}
	</div>

	<!-- 図形追加 -->
	<div class="relative">
		<button
			onclick={() => { showShapePanel = !showShapePanel; showTextPanel = false; showImagePanel = false; showBackgroundPanel = false; }}
			class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-gray-700 hover:bg-gray-600 transition-colors"
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" />
			</svg>
			図形
		</button>
		{#if showShapePanel}
			<div class="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 p-3 min-w-[280px]">
				<p class="text-xs text-gray-400 mb-2">塗りつぶし図形</p>
				<div class="grid grid-cols-5 gap-2 mb-3">
					<!-- 四角形 -->
					<button
						onclick={() => addShape('rect')}
						class="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 hover:ring-2 hover:ring-orange-500 transition-all"
						title="四角形"
					>
						<div class="w-8 h-6 rounded-sm" style="background-color: {theme.primaryColor};"></div>
						<span class="text-[10px] text-gray-300">四角</span>
					</button>
					<!-- 円 -->
					<button
						onclick={() => addShape('circle')}
						class="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 hover:ring-2 hover:ring-orange-500 transition-all"
						title="円"
					>
						<div class="w-7 h-7 rounded-full" style="background-color: {theme.accentColor};"></div>
						<span class="text-[10px] text-gray-300">円</span>
					</button>
					<!-- 星 -->
					<button
						onclick={() => addShape('star')}
						class="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 hover:ring-2 hover:ring-orange-500 transition-all"
						title="星"
					>
						<svg class="w-7 h-7" viewBox="0 0 24 24" fill={theme.accentColor}>
							<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
						</svg>
						<span class="text-[10px] text-gray-300">星</span>
					</button>
					<!-- 矢印 -->
					<button
						onclick={() => addShape('arrow')}
						class="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 hover:ring-2 hover:ring-orange-500 transition-all"
						title="矢印"
					>
						<svg class="w-7 h-5" viewBox="0 0 40 20" fill="none" stroke={theme.primaryColor} stroke-width="3">
							<line x1="2" y1="10" x2="30" y2="10"/>
							<polyline points="24,4 30,10 24,16"/>
						</svg>
						<span class="text-[10px] text-gray-300">矢印</span>
					</button>
					<!-- 線 -->
					<button
						onclick={() => addShape('line')}
						class="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 hover:ring-2 hover:ring-orange-500 transition-all"
						title="線"
					>
						<svg class="w-7 h-5" viewBox="0 0 40 20" fill="none" stroke={theme.primaryColor} stroke-width="3">
							<line x1="2" y1="10" x2="38" y2="10"/>
						</svg>
						<span class="text-[10px] text-gray-300">線</span>
					</button>
				</div>
				<hr class="border-gray-700 mb-3" />
				<p class="text-xs text-gray-400 mb-2">枠線のみ（塗りなし）</p>
				<div class="grid grid-cols-3 gap-2 mb-3">
					<!-- 四角形（枠線のみ） -->
					<button
						onclick={() => addShape('rect-outline')}
						class="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 hover:ring-2 hover:ring-orange-500 transition-all"
						title="四角形（枠線のみ）"
					>
						<div class="w-8 h-6 rounded-sm border-2" style="border-color: {theme.primaryColor}; background: transparent;"></div>
						<span class="text-[10px] text-gray-300">四角枠</span>
					</button>
					<!-- 円（枠線のみ） -->
					<button
						onclick={() => addShape('circle-outline')}
						class="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 hover:ring-2 hover:ring-orange-500 transition-all"
						title="円（枠線のみ）"
					>
						<div class="w-7 h-7 rounded-full border-2" style="border-color: {theme.accentColor}; background: transparent;"></div>
						<span class="text-[10px] text-gray-300">円枠</span>
					</button>
					<!-- 星（枠線のみ） -->
					<button
						onclick={() => addShape('star-outline')}
						class="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 hover:ring-2 hover:ring-orange-500 transition-all"
						title="星（枠線のみ）"
					>
						<svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke={theme.accentColor} stroke-width="1.5">
							<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
						</svg>
						<span class="text-[10px] text-gray-300">星枠</span>
					</button>
				</div>
				<hr class="border-gray-700 mb-3" />
				<p class="text-xs text-gray-400 mb-2">テンプレート</p>
				<button
					onclick={addHeaderBar}
					class="w-full flex items-center gap-2 px-3 py-2 text-xs bg-gray-700 hover:bg-gray-600 hover:ring-2 hover:ring-orange-500 rounded-lg transition-all"
				>
					<div class="w-12 h-3 rounded-sm" style="background-color: {theme.primaryColor};"></div>
					<span class="text-gray-300">ヘッダーバー</span>
				</button>
			</div>
		{/if}
	</div>

	<!-- 画像追加 -->
	<div class="relative">
		<button
			onclick={() => { showImagePanel = !showImagePanel; showTextPanel = false; showShapePanel = false; showBackgroundPanel = false; }}
			class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-gray-700 hover:bg-gray-600 transition-colors"
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
			</svg>
			画像
		</button>
		{#if showImagePanel}
			<div class="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 p-3 min-w-[320px] max-h-[400px] overflow-y-auto">
				<div class="mb-3">
					<input
						type="file"
						accept="image/*"
						onchange={handleImageUpload}
						class="hidden"
						id="image-upload"
					/>
					<label
						for="image-upload"
						class="flex items-center justify-center gap-2 w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded text-xs font-medium cursor-pointer transition-colors"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
						</svg>
						アップロード
					</label>
				</div>

				<!-- 透かし/ロゴ素材 -->
				<p class="text-xs text-gray-400 mb-2 flex items-center gap-1">
					<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
					</svg>
					透かし/ロゴ素材
				</p>
				<div class="grid grid-cols-2 gap-2 mb-3">
					{#each watermarkImages as img}
						<button
							onclick={() => addTemplateImage(img.file)}
							class="p-2 rounded bg-gray-700 hover:bg-gray-600 transition-colors flex flex-col items-center gap-1"
							title={img.name}
						>
							<img
								src="/template-images/{img.file}"
								alt={img.name}
								class="w-16 h-16 object-contain"
							/>
							<span class="text-[10px] text-gray-400">{img.name}</span>
						</button>
					{/each}
				</div>

				<hr class="border-gray-700 my-2" />

				<!-- キャラクター素材 -->
				<p class="text-xs text-gray-400 mb-2 flex items-center gap-1">
					<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
					</svg>
					キャラクター素材
				</p>
				<div class="grid grid-cols-5 gap-1">
					{#each characterImages as img}
						<button
							onclick={() => addTemplateImage(img.file)}
							class="p-1 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
							title={img.name}
						>
							<img
								src="/template-images/{img.file}"
								alt={img.name}
								class="w-10 h-10 object-contain"
							/>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<!-- 区切り線 -->
	<div class="w-px h-6 bg-gray-600 mx-1"></div>

	<!-- 選択要素の操作 -->
	{#if selectedElement}
		<span class="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
			{selectedElement.type === 'text' ? 'テキスト' : selectedElement.type === 'rect' ? '四角形' : selectedElement.type === 'circle' ? '円' : selectedElement.type === 'image' ? '画像' : selectedElement.type === 'star' ? '星' : selectedElement.type === 'line' ? '線' : selectedElement.type === 'arrow' ? '矢印' : selectedElement.type}
		</span>

		<!-- 塗り色変更 -->
		{#if selectedElement.type !== 'image' && selectedElement.type !== 'line' && selectedElement.type !== 'arrow'}
			<div class="relative">
				<button
					onclick={() => { showFillColorPanel = !showFillColorPanel; showStrokeColorPanel = false; }}
					class="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors {showFillColorPanel ? 'bg-orange-600' : 'bg-gray-700 hover:bg-gray-600'}"
					title="塗り色"
				>
					<div class="w-4 h-4 rounded border border-gray-500" style="background-color: {selectedElement.fill || '#ffffff'};"></div>
					<span class="text-gray-300">塗り</span>
				</button>
				{#if showFillColorPanel}
					<div class="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 p-3 min-w-[280px] max-h-[400px] overflow-y-auto">
						{#each colorCategories as category}
							<p class="text-xs text-gray-400 mb-1.5">{category.name}</p>
							<div class="grid grid-cols-6 gap-1 mb-2">
								{#each category.colors as preset}
									<button
										onclick={() => { onUpdateElement({ fill: preset.color }); showFillColorPanel = false; }}
										class="w-6 h-6 rounded border-2 transition-all {selectedElement.fill === preset.color ? 'border-orange-500 ring-2 ring-orange-500/50' : 'border-gray-600 hover:border-gray-400'}"
										style="background-color: {preset.color};"
										title={preset.name}
									></button>
								{/each}
							</div>
						{/each}
						<hr class="border-gray-700 my-2" />
						<p class="text-xs text-gray-400 mb-2">カスタム色</p>
						<div class="flex items-center gap-2">
							<input
								type="color"
								value={selectedElement.fill || '#ffffff'}
								onchange={(e) => { onUpdateElement({ fill: (e.target as HTMLInputElement).value }); }}
								class="w-10 h-8 rounded cursor-pointer border-0"
							/>
							<input
								type="text"
								value={selectedElement.fill || '#ffffff'}
								onchange={(e) => { onUpdateElement({ fill: (e.target as HTMLInputElement).value }); }}
								class="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs"
								placeholder="#ffffff"
							/>
						</div>
						<button
							onclick={() => {
								// 塗りを削除（transparentに設定）
								onUpdateElement({ fill: 'transparent' });
								showFillColorPanel = false;
								// 塗りも線も無い場合は図形を削除
								if (!selectedElement.stroke && !selectedElement.strokeWidth) {
									onDeleteElement();
								}
							}}
							class="w-full mt-3 px-3 py-1.5 text-xs bg-gray-700 hover:bg-red-600 rounded transition-colors"
						>
							塗りなし
						</button>
					</div>
				{/if}
			</div>
		{/if}

		<!-- 線色変更 -->
		{#if selectedElement.type === 'rect' || selectedElement.type === 'circle' || selectedElement.type === 'line' || selectedElement.type === 'arrow'}
			<div class="relative">
				<button
					onclick={() => { showStrokeColorPanel = !showStrokeColorPanel; showFillColorPanel = false; }}
					class="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors {showStrokeColorPanel ? 'bg-orange-600' : 'bg-gray-700 hover:bg-gray-600'}"
					title="線色"
				>
					<div class="w-4 h-4 rounded border-2" style="border-color: {selectedElement.stroke || '#ffffff'}; background: transparent;"></div>
					<span class="text-gray-300">線</span>
				</button>
				{#if showStrokeColorPanel}
					<div class="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 p-3 min-w-[280px] max-h-[400px] overflow-y-auto">
						{#each colorCategories as category}
							<p class="text-xs text-gray-400 mb-1.5">{category.name}</p>
							<div class="grid grid-cols-6 gap-1 mb-2">
								{#each category.colors as preset}
									<button
										onclick={() => { onUpdateElement({ stroke: preset.color, strokeWidth: selectedElement.strokeWidth || 2 }); showStrokeColorPanel = false; }}
										class="w-6 h-6 rounded border-2 transition-all {selectedElement.stroke === preset.color ? 'border-orange-500 ring-2 ring-orange-500/50' : 'border-gray-600 hover:border-gray-400'}"
										style="background-color: {preset.color};"
										title={preset.name}
									></button>
								{/each}
							</div>
						{/each}
						<hr class="border-gray-700 my-2" />
						<p class="text-xs text-gray-400 mb-2">カスタム色</p>
						<div class="flex items-center gap-2 mb-3">
							<input
								type="color"
								value={selectedElement.stroke || '#000000'}
								onchange={(e) => { onUpdateElement({ stroke: (e.target as HTMLInputElement).value, strokeWidth: selectedElement.strokeWidth || 2 }); }}
								class="w-10 h-8 rounded cursor-pointer border-0"
							/>
							<input
								type="text"
								value={selectedElement.stroke || '#000000'}
								onchange={(e) => { onUpdateElement({ stroke: (e.target as HTMLInputElement).value, strokeWidth: selectedElement.strokeWidth || 2 }); }}
								class="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs"
								placeholder="#000000"
							/>
						</div>
						<hr class="border-gray-700 mb-3" />
						<p class="text-xs text-gray-400 mb-2">線の太さ: {selectedElement.strokeWidth || 0}px</p>
						<div class="flex items-center gap-2">
							<input
								type="range"
								min="0"
								max="20"
								value={selectedElement.strokeWidth || 0}
								oninput={(e) => {
									e.preventDefault();
									e.stopPropagation();
									onUpdateElement({ strokeWidth: parseInt((e.target as HTMLInputElement).value) || 0 });
								}}
								class="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
							/>
						</div>
						<button
							onclick={() => {
								// 線を削除
								onUpdateElement({ stroke: undefined, strokeWidth: 0 });
								showStrokeColorPanel = false;
								// 塗りも線も無い場合は図形を削除
								if (!selectedElement.fill || selectedElement.fill === 'transparent') {
									onDeleteElement();
								}
							}}
							class="w-full mt-3 px-3 py-1.5 text-xs bg-gray-700 hover:bg-red-600 rounded transition-colors"
						>
							線なし
						</button>
					</div>
				{/if}
			</div>
		{/if}


		<!-- テキスト編集 -->
		{#if selectedElement.type === 'text'}
			<div class="flex items-center gap-2 flex-wrap">
				<input
					type="text"
					value={selectedElement.text || ''}
					oninput={(e) => onUpdateElement({ text: (e.target as HTMLInputElement).value })}
					class="w-32 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-orange-500"
					placeholder="テキストを入力..."
				/>
				<!-- フォント選択 -->
				<select
					value={selectedElement.fontFamily || availableFonts[0].value}
					onchange={(e) => onUpdateElement({ fontFamily: (e.target as HTMLSelectElement).value })}
					class="bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs max-w-[120px]"
					title="フォント"
				>
					{#each availableFonts as font}
						<option value={font.value} style="font-family: {font.value}">
							{font.name}
						</option>
					{/each}
				</select>
				<div class="flex items-center gap-1">
					<input
						type="number"
						value={selectedElement.fontSize || 24}
						onchange={(e) => onUpdateElement({ fontSize: parseInt((e.target as HTMLInputElement).value) || 24 })}
						class="w-12 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-center"
						min="8"
						max="200"
						title="フォントサイズ"
					/>
					<span class="text-xs text-gray-500">px</span>
				</div>
				<select
					value={selectedElement.fontStyle || 'normal'}
					onchange={(e) => onUpdateElement({ fontStyle: (e.target as HTMLSelectElement).value as 'normal' | 'bold' | 'italic' })}
					class="bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs"
					title="フォントスタイル"
				>
					<option value="normal">標準</option>
					<option value="bold">太字</option>
					<option value="italic">斜体</option>
				</select>
				<!-- マーカー -->
				<div class="relative">
					<button
						onclick={() => { showMarkerPanel = !showMarkerPanel; showFillColorPanel = false; showStrokeColorPanel = false; }}
						class="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors {showMarkerPanel ? 'bg-orange-600' : 'bg-gray-700 hover:bg-gray-600'}"
						title="マーカー"
					>
						<span class="w-4 h-3 rounded-sm" style="background-color: {selectedElement.markerColor || '#FFEB3B'}; opacity: {selectedElement.marker && selectedElement.marker !== 'none' ? 1 : 0.3};"></span>
						<span class="text-gray-300">マーカー</span>
					</button>
					{#if showMarkerPanel}
						<div class="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 p-3 min-w-[280px] max-h-[450px] overflow-y-auto">
							<p class="text-xs text-gray-400 mb-2">マーカータイプ</p>
							<div class="grid grid-cols-4 gap-1 mb-3">
								{#each markerTypes as mtype}
									<button
										onclick={() => onUpdateElement({ marker: mtype.id as 'none' | 'underline' | 'half' | 'full' })}
										class="flex flex-col items-center gap-1 p-2 rounded transition-all {selectedElement.marker === mtype.id ? 'bg-orange-600' : 'bg-gray-700 hover:bg-gray-600'}"
										title={mtype.name}
									>
										<span class="text-lg">{mtype.icon}</span>
										<span class="text-[10px]">{mtype.name}</span>
									</button>
								{/each}
							</div>
							<hr class="border-gray-700 mb-3" />
							<p class="text-xs text-gray-400 mb-2">マーカー色</p>
							<div class="max-h-[250px] overflow-y-auto">
								{#each colorCategories as category}
									<p class="text-xs text-gray-500 mb-1">{category.name}</p>
									<div class="grid grid-cols-6 gap-1 mb-2">
										{#each category.colors as preset}
											<button
												onclick={() => onUpdateElement({ markerColor: preset.color, marker: selectedElement.marker === 'none' || !selectedElement.marker ? 'half' : selectedElement.marker })}
												class="w-6 h-6 rounded border-2 transition-all {selectedElement.markerColor === preset.color ? 'border-orange-500 ring-2 ring-orange-500/50' : 'border-gray-600 hover:border-gray-400'}"
												style="background-color: {preset.color};"
												title={preset.name}
											></button>
										{/each}
									</div>
								{/each}
							</div>
							<hr class="border-gray-700 my-2" />
							<p class="text-xs text-gray-400 mb-2">カスタム色</p>
							<div class="flex items-center gap-2">
								<input
									type="color"
									value={selectedElement.markerColor || '#FFEB3B'}
									onchange={(e) => onUpdateElement({ markerColor: (e.target as HTMLInputElement).value, marker: selectedElement.marker === 'none' || !selectedElement.marker ? 'half' : selectedElement.marker })}
									class="w-8 h-6 rounded cursor-pointer border-0"
								/>
								<input
									type="text"
									value={selectedElement.markerColor || '#FFEB3B'}
									onchange={(e) => onUpdateElement({ markerColor: (e.target as HTMLInputElement).value, marker: selectedElement.marker === 'none' || !selectedElement.marker ? 'half' : selectedElement.marker })}
									class="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs"
									placeholder="#FFEB3B"
								/>
							</div>
						</div>
					{/if}
				</div>
				<!-- 配置 -->
				<div class="flex items-center border border-gray-600 rounded overflow-hidden">
					<button
						onclick={() => onUpdateElement({ align: 'left', x: 100 })}
						class="px-2 py-1 text-xs transition-colors {selectedElement.align === 'left' ? 'bg-orange-600' : 'bg-gray-700 hover:bg-gray-600'}"
						title="左揃え"
					>
						<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
							<path d="M2 4.5A.5.5 0 012.5 4h11a.5.5 0 010 1h-11A.5.5 0 012 4.5zm0 4A.5.5 0 012.5 8h7a.5.5 0 010 1h-7A.5.5 0 012 8.5zm0 4A.5.5 0 012.5 12h11a.5.5 0 010 1h-11a.5.5 0 01-.5-.5zm0 4a.5.5 0 01.5-.5h7a.5.5 0 010 1h-7a.5.5 0 01-.5-.5z"/>
						</svg>
					</button>
					<button
						onclick={() => onUpdateElement({ align: 'center', x: 640 })}
						class="px-2 py-1 text-xs transition-colors {selectedElement.align === 'center' ? 'bg-orange-600' : 'bg-gray-700 hover:bg-gray-600'}"
						title="中央揃え"
					>
						<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
							<path d="M4 4.5A.5.5 0 014.5 4h7a.5.5 0 010 1h-7A.5.5 0 014 4.5zm-2 4A.5.5 0 012.5 8h11a.5.5 0 010 1h-11A.5.5 0 012 8.5zm2 4a.5.5 0 01.5-.5h7a.5.5 0 010 1h-7a.5.5 0 01-.5-.5zm-2 4A.5.5 0 012.5 16h11a.5.5 0 010 1h-11a.5.5 0 01-.5-.5z"/>
						</svg>
					</button>
				</div>
			</div>
		{/if}

		<!-- 図形編集（rect, circle, star） -->
		{#if selectedElement.type === 'rect' || selectedElement.type === 'circle' || selectedElement.type === 'star'}
			<div class="flex items-center gap-2 flex-wrap">
				<!-- 位置 -->
				<div class="flex items-center gap-1">
					<span class="text-xs text-gray-400">X:</span>
					<input
						type="number"
						value={Math.round(selectedElement.x || 0)}
						onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
						onblur={(e) => onUpdateElement({ x: parseInt((e.target as HTMLInputElement).value) || 0 })}
						class="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-center"
						min="0"
						max="1280"
					/>
				</div>
				<div class="flex items-center gap-1">
					<span class="text-xs text-gray-400">Y:</span>
					<input
						type="number"
						value={Math.round(selectedElement.y || 0)}
						onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
						onblur={(e) => onUpdateElement({ y: parseInt((e.target as HTMLInputElement).value) || 0 })}
						class="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-center"
						min="0"
						max="720"
					/>
				</div>
				<!-- サイズ（rect用） -->
				{#if selectedElement.type === 'rect'}
					<div class="flex items-center gap-1">
						<span class="text-xs text-gray-400">幅:</span>
						<input
							type="number"
							value={Math.round(selectedElement.width || 100)}
							onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
							onblur={(e) => onUpdateElement({ width: parseInt((e.target as HTMLInputElement).value) || 100 })}
							class="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-center"
							min="1"
							max="1280"
						/>
					</div>
					<div class="flex items-center gap-1">
						<span class="text-xs text-gray-400">高さ:</span>
						<input
							type="number"
							value={Math.round(selectedElement.height || 100)}
							onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
							onblur={(e) => onUpdateElement({ height: parseInt((e.target as HTMLInputElement).value) || 100 })}
							class="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-center"
							min="1"
							max="720"
						/>
					</div>
				{/if}
				<!-- 半径（circle用） -->
				{#if selectedElement.type === 'circle'}
					<div class="flex items-center gap-1">
						<span class="text-xs text-gray-400">半径:</span>
						<input
							type="number"
							value={Math.round(selectedElement.radius || 50)}
							onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
							onblur={(e) => onUpdateElement({ radius: parseInt((e.target as HTMLInputElement).value) || 50 })}
							class="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-center"
							min="1"
							max="360"
						/>
					</div>
				{/if}
				<!-- 半径（star用） -->
				{#if selectedElement.type === 'star'}
					<div class="flex items-center gap-1">
						<span class="text-xs text-gray-400">外径:</span>
						<input
							type="number"
							value={Math.round(selectedElement.outerRadius || 40)}
							onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
							onblur={(e) => onUpdateElement({ outerRadius: parseInt((e.target as HTMLInputElement).value) || 40 })}
							class="w-12 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-center"
							min="1"
							max="360"
						/>
					</div>
					<div class="flex items-center gap-1">
						<span class="text-xs text-gray-400">内径:</span>
						<input
							type="number"
							value={Math.round(selectedElement.innerRadius || 20)}
							onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
							onblur={(e) => onUpdateElement({ innerRadius: parseInt((e.target as HTMLInputElement).value) || 20 })}
							class="w-12 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-center"
							min="1"
							max="360"
						/>
					</div>
				{/if}
			</div>
		{/if}

		<!-- 線・矢印編集 -->
		{#if selectedElement.type === 'line' || selectedElement.type === 'arrow'}
			{@const points = selectedElement.points || [0, 0, 200, 0]}
			<div class="flex items-center gap-2 flex-wrap">
				<!-- 始点 -->
				<div class="flex items-center gap-1">
					<span class="text-xs text-gray-400">始点X:</span>
					<input
						type="number"
						value={Math.round(points[0])}
						onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
						onblur={(e) => {
							const newX = parseInt((e.target as HTMLInputElement).value) || 0;
							onUpdateElement({ points: [newX, points[1], points[2], points[3]] });
						}}
						class="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-center"
						min="0"
						max="1280"
					/>
				</div>
				<div class="flex items-center gap-1">
					<span class="text-xs text-gray-400">Y:</span>
					<input
						type="number"
						value={Math.round(points[1])}
						onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
						onblur={(e) => {
							const newY = parseInt((e.target as HTMLInputElement).value) || 0;
							onUpdateElement({ points: [points[0], newY, points[2], points[3]] });
						}}
						class="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-center"
						min="0"
						max="720"
					/>
				</div>
				<!-- 終点 -->
				<div class="flex items-center gap-1">
					<span class="text-xs text-gray-400">終点X:</span>
					<input
						type="number"
						value={Math.round(points[2])}
						onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
						onblur={(e) => {
							const newX = parseInt((e.target as HTMLInputElement).value) || 0;
							onUpdateElement({ points: [points[0], points[1], newX, points[3]] });
						}}
						class="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-center"
						min="0"
						max="1280"
					/>
				</div>
				<div class="flex items-center gap-1">
					<span class="text-xs text-gray-400">Y:</span>
					<input
						type="number"
						value={Math.round(points[3])}
						onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
						onblur={(e) => {
							const newY = parseInt((e.target as HTMLInputElement).value) || 0;
							onUpdateElement({ points: [points[0], points[1], points[2], newY] });
						}}
						class="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-center"
						min="0"
						max="720"
					/>
				</div>
				<!-- 線の太さ -->
				<div class="flex items-center gap-1">
					<span class="text-xs text-gray-400">太さ:</span>
					<input
						type="range"
						min="1"
						max="50"
						value={selectedElement.strokeWidth || 3}
						oninput={(e) => onUpdateElement({ strokeWidth: parseInt((e.target as HTMLInputElement).value) || 3 })}
						class="w-20 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
					/>
					<span class="text-xs text-gray-500">{selectedElement.strokeWidth || 3}px</span>
				</div>
				<!-- 線色 -->
				<div class="flex items-center gap-1">
					<span class="text-xs text-gray-400">色:</span>
					<input
						type="color"
						value={selectedElement.stroke || '#000000'}
						onchange={(e) => onUpdateElement({ stroke: (e.target as HTMLInputElement).value })}
						class="w-8 h-6 rounded cursor-pointer border border-gray-600"
					/>
				</div>
			</div>
		{/if}

		<!-- 画像編集 -->
		{#if selectedElement.type === 'image'}
			<div class="flex items-center gap-2 flex-wrap">
				<!-- 位置 -->
				<div class="flex items-center gap-1">
					<span class="text-xs text-gray-400">X:</span>
					<input
						type="number"
						value={Math.round(selectedElement.x || 0)}
						onchange={(e) => onUpdateElement({ x: parseInt((e.target as HTMLInputElement).value) || 0 })}
						class="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-center"
						min="0"
						max="1280"
					/>
				</div>
				<div class="flex items-center gap-1">
					<span class="text-xs text-gray-400">Y:</span>
					<input
						type="number"
						value={Math.round(selectedElement.y || 0)}
						onchange={(e) => onUpdateElement({ y: parseInt((e.target as HTMLInputElement).value) || 0 })}
						class="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-center"
						min="0"
						max="720"
					/>
				</div>
				<!-- サイズ -->
				<div class="flex items-center gap-1">
					<span class="text-xs text-gray-400">幅:</span>
					<input
						type="number"
						value={Math.round(selectedElement.width || 200)}
						onchange={(e) => onUpdateElement({ width: parseInt((e.target as HTMLInputElement).value) || 200 })}
						class="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-center"
						min="10"
						max="1280"
					/>
				</div>
				<div class="flex items-center gap-1">
					<span class="text-xs text-gray-400">高さ:</span>
					<input
						type="number"
						value={Math.round(selectedElement.height || 200)}
						onchange={(e) => onUpdateElement({ height: parseInt((e.target as HTMLInputElement).value) || 200 })}
						class="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-center"
						min="10"
						max="720"
					/>
				</div>
				<!-- 角度 -->
				<div class="flex items-center gap-1">
					<span class="text-xs text-gray-400">角度:</span>
					<input
						type="number"
						value={selectedElement.rotation || 0}
						onchange={(e) => onUpdateElement({ rotation: parseInt((e.target as HTMLInputElement).value) || 0 })}
						class="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-xs text-center"
						min="-360"
						max="360"
					/>
					<span class="text-xs text-gray-500">°</span>
				</div>
				<!-- 透過度 -->
				<div class="flex items-center gap-1">
					<span class="text-xs text-gray-400">透過:</span>
					<input
						type="range"
						min="0"
						max="100"
						value={(selectedElement.opacity ?? 1) * 100}
						oninput={(e) => onUpdateElement({ opacity: parseInt((e.target as HTMLInputElement).value) / 100 })}
						class="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
						title="透過度"
					/>
					<span class="text-xs text-gray-400 w-8">{Math.round((selectedElement.opacity ?? 1) * 100)}%</span>
				</div>
			</div>
		{/if}

		<!-- ワンクリック配置パネル（図形・画像用） -->
		{#if selectedElement.type === 'rect' || selectedElement.type === 'circle' || selectedElement.type === 'star' || selectedElement.type === 'image'}
			<div class="flex items-center gap-1 ml-2 border-l border-gray-600 pl-2">
				<span class="text-xs text-gray-500 mr-1">配置:</span>
				<!-- 9グリッド配置 -->
				<div class="grid grid-cols-3 gap-0.5 bg-gray-700 p-0.5 rounded">
					<button onclick={() => snapToPosition('top-left')} class="w-4 h-4 bg-gray-600 hover:bg-orange-600 rounded-sm transition-colors" title="左上"></button>
					<button onclick={() => snapToPosition('top-center')} class="w-4 h-4 bg-gray-600 hover:bg-orange-600 rounded-sm transition-colors" title="上中央"></button>
					<button onclick={() => snapToPosition('top-right')} class="w-4 h-4 bg-gray-600 hover:bg-orange-600 rounded-sm transition-colors" title="右上"></button>
					<button onclick={() => snapToPosition('center-left')} class="w-4 h-4 bg-gray-600 hover:bg-orange-600 rounded-sm transition-colors" title="左中央"></button>
					<button onclick={() => snapToPosition('center')} class="w-4 h-4 bg-gray-600 hover:bg-orange-600 rounded-sm transition-colors" title="中央"></button>
					<button onclick={() => snapToPosition('center-right')} class="w-4 h-4 bg-gray-600 hover:bg-orange-600 rounded-sm transition-colors" title="右中央"></button>
					<button onclick={() => snapToPosition('bottom-left')} class="w-4 h-4 bg-gray-600 hover:bg-orange-600 rounded-sm transition-colors" title="左下"></button>
					<button onclick={() => snapToPosition('bottom-center')} class="w-4 h-4 bg-gray-600 hover:bg-orange-600 rounded-sm transition-colors" title="下中央"></button>
					<button onclick={() => snapToPosition('bottom-right')} class="w-4 h-4 bg-gray-600 hover:bg-orange-600 rounded-sm transition-colors" title="右下"></button>
				</div>
				<!-- フルサイズ配置（rect用のみ） -->
				{#if selectedElement.type === 'rect'}
					<button onclick={() => { onUpdateElement({ x: 0, width: CANVAS_WIDTH }); }} class="px-2 py-1 text-[10px] bg-gray-700 hover:bg-orange-600 rounded transition-colors" title="横幅いっぱい">横MAX</button>
					<button onclick={() => { onUpdateElement({ y: 0, height: CANVAS_HEIGHT }); }} class="px-2 py-1 text-[10px] bg-gray-700 hover:bg-orange-600 rounded transition-colors" title="縦いっぱい">縦MAX</button>
					<button onclick={() => { onUpdateElement({ x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT }); }} class="px-2 py-1 text-[10px] bg-gray-700 hover:bg-orange-600 rounded transition-colors" title="全画面">全画面</button>
				{/if}
			</div>
		{/if}

		<!-- 削除 -->
		<button
			onclick={onDeleteElement}
			class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-red-600 hover:bg-red-700 transition-colors"
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
			</svg>
			削除
		</button>
	{:else}
		<span class="text-xs text-gray-500">要素をクリックして選択</span>
	{/if}
</div>
