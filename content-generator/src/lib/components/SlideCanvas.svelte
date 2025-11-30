<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Konva from 'konva';
	import type { SlideData, SlideElement, SlideTheme } from '$lib/slideCanvasTypes';
	import { generateElementId } from '$lib/slideCanvasTypes';

	interface Props {
		slideData: SlideData;
		theme: SlideTheme;
		editable?: boolean;
		onUpdate?: (slideData: SlideData) => void;
		onSelectElement?: (element: SlideElement | null) => void;
	}

	let { slideData, theme, editable = true, onUpdate, onSelectElement }: Props = $props();

	let containerRef: HTMLDivElement;
	let stage: Konva.Stage | null = null;
	let layer: Konva.Layer | null = null;
	let guideLayer: Konva.Layer | null = null;
	let transformer: Konva.Transformer | null = null;
	let selectedNode: Konva.Node | null = null;
	let currentSlideId: string = '';

	const SLIDE_WIDTH = 1280;
	const SLIDE_HEIGHT = 720;
	const SNAP_THRESHOLD = 10; // スナップする距離（ピクセル）

	// スナップガイドライン
	const SNAP_LINES = {
		vertical: [0, SLIDE_WIDTH / 2, SLIDE_WIDTH],  // 左端、中央、右端
		horizontal: [0, SLIDE_HEIGHT / 2, SLIDE_HEIGHT]  // 上端、中央、下端
	};

	// コンテナサイズに合わせたスケール計算
	function calculateScale(containerWidth: number): number {
		return containerWidth / SLIDE_WIDTH;
	}

	onMount(() => {
		initializeStage();
	});

	onDestroy(() => {
		if (stage) {
			stage.destroy();
		}
	});

	function initializeStage() {
		if (!containerRef) return;

		// 現在のスライドIDを設定
		currentSlideId = slideData.id;

		const containerWidth = containerRef.clientWidth;
		const scale = calculateScale(containerWidth);

		stage = new Konva.Stage({
			container: containerRef,
			width: containerWidth,
			height: SLIDE_HEIGHT * scale
		});

		layer = new Konva.Layer();
		stage.add(layer);

		// ガイドライン用レイヤー
		guideLayer = new Konva.Layer();
		stage.add(guideLayer);
		guideLayer.scale({ x: scale, y: scale });

		// 背景
		const background = new Konva.Rect({
			x: 0,
			y: 0,
			width: SLIDE_WIDTH,
			height: SLIDE_HEIGHT,
			fill: slideData.backgroundColor || theme.backgroundColor
		});
		layer.add(background);

		// トランスフォーマー（選択時のリサイズ・回転用）
		if (editable) {
			transformer = new Konva.Transformer({
				rotateEnabled: true,
				enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center'],
				boundBoxFunc: (oldBox, newBox) => {
					// 最小サイズ制限
					if (newBox.width < 20 || newBox.height < 20) {
						return oldBox;
					}
					return newBox;
				}
			});
			layer.add(transformer);

			// ステージクリックで選択解除
			stage.on('click tap', (e) => {
				if (e.target === stage || e.target === background) {
					deselectAll();
				}
			});
		}

		// スケール適用
		layer.scale({ x: scale, y: scale });

		// 要素を描画
		renderElements();
	}

	function renderElements() {
		if (!layer || !transformer) return;

		// 既存の要素を削除（背景とトランスフォーマー以外）
		layer.getChildren().forEach((child) => {
			if (child !== transformer && child.getClassName() !== 'Rect' || (child.getClassName() === 'Rect' && child.id() !== '')) {
				// 背景以外を削除
			}
		});

		// 背景を更新
		const bgRect = layer.findOne('Rect') as Konva.Rect;
		if (bgRect && !bgRect.id()) {
			bgRect.fill(slideData.backgroundColor || theme.backgroundColor);
		}

		// 要素を追加
		slideData.elements.forEach((elem) => {
			const node = createKonvaNode(elem);
			if (node) {
				layer!.add(node);
				if (transformer) {
					node.moveToTop();
				}
			}
		});

		// トランスフォーマーを最上位に
		if (transformer) {
			transformer.moveToTop();
		}

		layer.batchDraw();
	}

	function createKonvaNode(elem: SlideElement): Konva.Node | null {
		let node: Konva.Node | null = null;

		switch (elem.type) {
			case 'text':
				// テキストの幅を計算（中央揃えの場合は広めに）
				const textWidth = elem.width || (elem.align === 'center' ? SLIDE_WIDTH : undefined);
				// 中央揃えの場合、x座標を調整
				const textX = elem.align === 'center' && !elem.width ? 0 : elem.x;

				// マーカーがある場合はグループを作成
				if (elem.marker && elem.marker !== 'none') {
					const group = new Konva.Group({
						id: elem.id,
						x: textX,
						y: elem.y,
						rotation: elem.rotation || 0,
						opacity: elem.opacity ?? 1,
						draggable: editable
					});

					// テキストノードを先に作成して寸法を取得
					const textNode = new Konva.Text({
						x: 0,
						y: 0,
						text: elem.text || '',
						fontSize: elem.fontSize || 24,
						fontFamily: elem.fontFamily || theme.fontFamily,
						fontStyle: elem.fontStyle || 'normal',
						fill: elem.fill || theme.textColor,
						align: elem.align || 'left',
						width: textWidth
					});

					// テキストの実際の寸法を取得
					const textHeight = textNode.height();
					const textActualWidth = textNode.width() || textNode.getTextWidth();
					const fontSize = elem.fontSize || 24;

					// マーカータイプに応じた高さ、位置、透明度を計算
					let markerHeight: number;
					let markerY: number;
					let markerOpacity: number;
					switch (elem.marker) {
						case 'underline':
							markerHeight = fontSize * 0.15; // 下線は細め
							markerY = textHeight - markerHeight;
							markerOpacity = 1; // 下線は不透明（テキストの後ろなので見える）
							break;
						case 'half':
							markerHeight = fontSize * 0.5; // 文字の半分の高さ
							markerY = textHeight - markerHeight;
							markerOpacity = 0.6; // 半透明でテキストが見えるように
							break;
						case 'full':
						default:
							markerHeight = textHeight; // 全体をカバー
							markerY = 0;
							markerOpacity = 0.6; // 半透明でテキストが見えるように
							break;
					}

					// マーカー用の矩形を作成
					const markerRect = new Konva.Rect({
						x: elem.align === 'center' ? (textWidth ? (textWidth - textActualWidth) / 2 : (SLIDE_WIDTH - textActualWidth) / 2) : 0,
						y: markerY,
						width: textActualWidth,
						height: markerHeight,
						fill: elem.markerColor || '#FFEB3B',
						opacity: markerOpacity
					});

					// マーカーを先に追加（背面）、その後テキスト
					group.add(markerRect);
					group.add(textNode);

					node = group;
				} else {
					// マーカーなしの通常テキスト
					node = new Konva.Text({
						id: elem.id,
						x: textX,
						y: elem.y,
						text: elem.text || '',
						fontSize: elem.fontSize || 24,
						fontFamily: elem.fontFamily || theme.fontFamily,
						fontStyle: elem.fontStyle || 'normal',
						fill: elem.fill || theme.textColor,
						align: elem.align || 'left',
						width: textWidth,
						rotation: elem.rotation || 0,
						opacity: elem.opacity ?? 1,
						draggable: editable
					});
				}
				break;

			case 'rect':
				// 線を内側に描画するための調整
				const rectStrokeWidth = elem.strokeWidth || 0;
				const rectStrokeOffset = rectStrokeWidth / 2;
				node = new Konva.Rect({
					id: elem.id,
					x: (elem.x || 0) + rectStrokeOffset,
					y: (elem.y || 0) + rectStrokeOffset,
					width: (elem.width || 100) - rectStrokeWidth,
					height: (elem.height || 100) - rectStrokeWidth,
					fill: elem.fill === 'transparent' || elem.fill === '' ? undefined : (elem.fill || theme.primaryColor),
					stroke: elem.stroke,
					strokeWidth: rectStrokeWidth,
					rotation: elem.rotation || 0,
					opacity: elem.opacity ?? 1,
					draggable: editable,
					cornerRadius: elem.id.includes('rounded') ? 10 : 0
				});
				// 元の位置・サイズを保持するためのカスタム属性
				node.setAttr('origX', elem.x);
				node.setAttr('origY', elem.y);
				node.setAttr('origWidth', elem.width);
				node.setAttr('origHeight', elem.height);
				break;

			case 'circle':
				// 線を内側に描画するための調整
				const circleStrokeWidth = elem.strokeWidth || 0;
				const circleRadius = (elem.radius || 50) - circleStrokeWidth / 2;
				node = new Konva.Circle({
					id: elem.id,
					x: elem.x,
					y: elem.y,
					radius: circleRadius > 0 ? circleRadius : 1,
					fill: elem.fill === 'transparent' || elem.fill === '' ? undefined : (elem.fill || theme.primaryColor),
					stroke: elem.stroke,
					strokeWidth: circleStrokeWidth,
					rotation: elem.rotation || 0,
					opacity: elem.opacity ?? 1,
					draggable: editable
				});
				node.setAttr('origRadius', elem.radius);
				break;

			case 'line':
				node = new Konva.Line({
					id: elem.id,
					points: elem.points || [0, 0, 100, 0],
					stroke: elem.stroke || theme.primaryColor,
					strokeWidth: elem.strokeWidth || 2,
					rotation: elem.rotation || 0,
					opacity: elem.opacity ?? 1,
					draggable: editable
				});
				break;

			case 'arrow':
				node = new Konva.Arrow({
					id: elem.id,
					points: elem.points || [0, 0, 100, 0],
					stroke: elem.stroke || theme.primaryColor,
					strokeWidth: elem.strokeWidth || 2,
					fill: elem.stroke || theme.primaryColor,
					pointerLength: 10,
					pointerWidth: 10,
					rotation: elem.rotation || 0,
					opacity: elem.opacity ?? 1,
					draggable: editable
				});
				break;

			case 'star':
				// 線を内側に描画するための調整
				const starStrokeWidth = elem.strokeWidth || 0;
				const starOuterRadius = (elem.outerRadius || 40) - starStrokeWidth / 2;
				const starInnerRadius = (elem.innerRadius || 20) - starStrokeWidth / 2;
				node = new Konva.Star({
					id: elem.id,
					x: elem.x,
					y: elem.y,
					numPoints: elem.numPoints || 5,
					innerRadius: starInnerRadius > 0 ? starInnerRadius : 1,
					outerRadius: starOuterRadius > 0 ? starOuterRadius : 2,
					fill: elem.fill === 'transparent' || elem.fill === '' ? undefined : (elem.fill || theme.accentColor),
					stroke: elem.stroke,
					strokeWidth: starStrokeWidth,
					rotation: elem.rotation || 0,
					opacity: elem.opacity ?? 1,
					draggable: editable
				});
				node.setAttr('origInnerRadius', elem.innerRadius);
				node.setAttr('origOuterRadius', elem.outerRadius);
				break;

			case 'image':
				const img = new Image();
				const slideIdAtLoad = currentSlideId;
				img.onload = () => {
					// スライドが変わっていたら追加しない
					if (slideIdAtLoad !== currentSlideId) return;

					const imageNode = new Konva.Image({
						id: elem.id,
						x: elem.x,
						y: elem.y,
						image: img,
						width: elem.width || img.width,
						height: elem.height || img.height,
						rotation: elem.rotation || 0,
						opacity: elem.opacity ?? 1,
						draggable: editable
					});
					if (layer) {
						layer.add(imageNode);
						setupNodeEvents(imageNode, elem);
						if (transformer) {
							transformer.moveToTop();
						}
						layer.batchDraw();
					}
				};
				img.src = elem.src || '';
				return null; // 非同期なのでnullを返す
		}

		if (node) {
			setupNodeEvents(node, elem);
		}

		return node;
	}

	// スナップ計算（キャンバス境界制限付き）
	function getSnapPosition(node: Konva.Node): { x: number; y: number; guides: { x?: number; y?: number } } {
		const box = node.getClientRect({ relativeTo: layer });
		let nodeX = node.x();
		let nodeY = node.y();
		const nodeWidth = box.width;
		const nodeHeight = box.height;

		// キャンバス境界制限（要素がはみ出さないように）
		// 左端
		if (nodeX < 0) {
			nodeX = 0;
		}
		// 右端
		if (nodeX + nodeWidth > SLIDE_WIDTH) {
			nodeX = SLIDE_WIDTH - nodeWidth;
		}
		// 上端
		if (nodeY < 0) {
			nodeY = 0;
		}
		// 下端
		if (nodeY + nodeHeight > SLIDE_HEIGHT) {
			nodeY = SLIDE_HEIGHT - nodeHeight;
		}

		// ノードの各エッジと中心
		const nodeEdges = {
			left: nodeX,
			centerX: nodeX + nodeWidth / 2,
			right: nodeX + nodeWidth,
			top: nodeY,
			centerY: nodeY + nodeHeight / 2,
			bottom: nodeY + nodeHeight
		};

		let snapX = nodeX;
		let snapY = nodeY;
		let guideX: number | undefined;
		let guideY: number | undefined;

		// 垂直スナップ（左端、中央、右端）
		for (const line of SNAP_LINES.vertical) {
			// 左端
			if (Math.abs(nodeEdges.left - line) < SNAP_THRESHOLD) {
				snapX = line;
				guideX = line;
				break;
			}
			// 中央
			if (Math.abs(nodeEdges.centerX - line) < SNAP_THRESHOLD) {
				snapX = line - nodeWidth / 2;
				guideX = line;
				break;
			}
			// 右端
			if (Math.abs(nodeEdges.right - line) < SNAP_THRESHOLD) {
				snapX = line - nodeWidth;
				guideX = line;
				break;
			}
		}

		// 水平スナップ（上端、中央、下端）
		for (const line of SNAP_LINES.horizontal) {
			// 上端
			if (Math.abs(nodeEdges.top - line) < SNAP_THRESHOLD) {
				snapY = line;
				guideY = line;
				break;
			}
			// 中央
			if (Math.abs(nodeEdges.centerY - line) < SNAP_THRESHOLD) {
				snapY = line - nodeHeight / 2;
				guideY = line;
				break;
			}
			// 下端
			if (Math.abs(nodeEdges.bottom - line) < SNAP_THRESHOLD) {
				snapY = line - nodeHeight;
				guideY = line;
				break;
			}
		}

		// 最終的な境界チェック（スナップ後も境界内に収める）
		if (snapX < 0) snapX = 0;
		if (snapX + nodeWidth > SLIDE_WIDTH) snapX = SLIDE_WIDTH - nodeWidth;
		if (snapY < 0) snapY = 0;
		if (snapY + nodeHeight > SLIDE_HEIGHT) snapY = SLIDE_HEIGHT - nodeHeight;

		return { x: snapX, y: snapY, guides: { x: guideX, y: guideY } };
	}

	// ガイドラインを描画
	function drawGuides(guides: { x?: number; y?: number }) {
		if (!guideLayer) return;
		guideLayer.destroyChildren();

		if (guides.x !== undefined) {
			const line = new Konva.Line({
				points: [guides.x, 0, guides.x, SLIDE_HEIGHT],
				stroke: '#f97316',
				strokeWidth: 1,
				dash: [4, 4]
			});
			guideLayer.add(line);
		}

		if (guides.y !== undefined) {
			const line = new Konva.Line({
				points: [0, guides.y, SLIDE_WIDTH, guides.y],
				stroke: '#f97316',
				strokeWidth: 1,
				dash: [4, 4]
			});
			guideLayer.add(line);
		}

		guideLayer.batchDraw();
	}

	// ガイドラインをクリア
	function clearGuides() {
		if (!guideLayer) return;
		guideLayer.destroyChildren();
		guideLayer.batchDraw();
	}

	function setupNodeEvents(node: Konva.Node, elem: SlideElement) {
		if (!editable) return;

		// クリックで選択
		node.on('click tap', (e) => {
			e.cancelBubble = true;
			selectNode(node, elem);
		});

		// ドラッグ中にスナップ
		node.on('dragmove', () => {
			const snap = getSnapPosition(node);
			node.position({ x: snap.x, y: snap.y });
			drawGuides(snap.guides);
		});

		// ドラッグ終了時にデータ更新
		node.on('dragend', () => {
			clearGuides();
			updateElementPosition(elem.id, node.x(), node.y());
		});

		// トランスフォーム終了時にデータ更新
		node.on('transformend', () => {
			updateElementTransform(elem.id, node);
		});

		// ダブルクリックでテキスト編集
		if (elem.type === 'text') {
			node.on('dblclick dbltap', () => {
				// グループの場合はグループ内のテキストノードを取得
				let textNode: Konva.Text;
				if (node instanceof Konva.Group) {
					textNode = node.findOne('Text') as Konva.Text;
				} else {
					textNode = node as Konva.Text;
				}
				if (textNode) {
					editTextWithGroup(textNode, node, elem);
				}
			});
		}
	}

	function selectNode(node: Konva.Node, elem: SlideElement) {
		selectedNode = node;
		if (transformer) {
			transformer.nodes([node]);
			layer?.batchDraw();
		}
		onSelectElement?.(elem);
	}

	function deselectAll() {
		selectedNode = null;
		if (transformer) {
			transformer.nodes([]);
			layer?.batchDraw();
		}
		onSelectElement?.(null);
	}

	function updateElementPosition(id: string, x: number, y: number) {
		const elements = slideData.elements.map((elem) => {
			if (elem.id === id) {
				// 中央揃えテキストの場合、x座標は元の値を保持（表示はwidthで中央揃えされる）
				if (elem.type === 'text' && elem.align === 'center' && !elem.width) {
					// 中央揃えで幅指定なしの場合、xは640を維持
					return { ...elem, y };
				}
				// 四角形の場合、線の太さを考慮して元の座標を復元
				if (elem.type === 'rect') {
					const strokeOffset = (elem.strokeWidth || 0) / 2;
					return { ...elem, x: x - strokeOffset, y: y - strokeOffset };
				}
				return { ...elem, x, y };
			}
			return elem;
		});
		const newSlideData = { ...slideData, elements };
		onUpdate?.(newSlideData);
	}

	function updateElementTransform(id: string, node: Konva.Node) {
		const elements = slideData.elements.map((elem) => {
			if (elem.id === id) {
				const strokeWidth = elem.strokeWidth || 0;
				const strokeOffset = strokeWidth / 2;

				const updates: Partial<SlideElement> = {
					rotation: node.rotation()
				};

				// 四角形の場合、線の太さを考慮して元の座標を復元
				if (node instanceof Konva.Rect && !(node instanceof Konva.Image)) {
					updates.x = node.x() - strokeOffset;
					updates.y = node.y() - strokeOffset;
					updates.width = (node.width() * node.scaleX()) + strokeWidth;
					updates.height = (node.height() * node.scaleY()) + strokeWidth;
					node.scaleX(1);
					node.scaleY(1);
				} else if (node instanceof Konva.Image) {
					updates.x = node.x();
					updates.y = node.y();
					updates.width = node.width() * node.scaleX();
					updates.height = node.height() * node.scaleY();
					node.scaleX(1);
					node.scaleY(1);
				} else {
					// 中央揃えテキストの場合、x座標は元の値を保持
					if (!(elem.type === 'text' && elem.align === 'center' && !elem.width)) {
						updates.x = node.x();
					}
					updates.y = node.y();
				}

				return { ...elem, ...updates };
			}
			return elem;
		});
		const newSlideData = { ...slideData, elements };
		onUpdate?.(newSlideData);
	}

	function editText(textNode: Konva.Text, elem: SlideElement) {
		if (!stage || !layer || !containerRef) return;

		// トランスフォーマーのみ非表示（テキストはそのまま表示）
		if (transformer) {
			transformer.hide();
		}
		layer.draw();

		// テキストエリアを作成
		const scale = layer.scaleX();
		const stageBox = containerRef.getBoundingClientRect();

		// テキストの実際の位置とサイズを取得
		const textRect = textNode.getClientRect();
		const fontSize = textNode.fontSize() || 24;
		const scaledFontSize = fontSize * scale;

		// テキストの配置に基づいて位置を計算
		const nodeX = textNode.x() * scale;
		const nodeY = textNode.y() * scale;
		const nodeWidth = textNode.width() ? textNode.width() * scale : stageBox.width - nodeX - 20;
		const nodeHeight = Math.max(scaledFontSize * 1.5, textRect.height * scale);

		const textarea = document.createElement('textarea');
		containerRef.style.position = 'relative';
		containerRef.appendChild(textarea);

		textarea.value = textNode.text();
		textarea.style.position = 'absolute';
		textarea.style.top = `${nodeY}px`;
		textarea.style.left = `${nodeX}px`;
		textarea.style.width = `${nodeWidth}px`;
		textarea.style.minHeight = `${Math.max(nodeHeight, scaledFontSize * 3)}px`; // 最低3行分の高さ
		textarea.style.height = 'auto';
		textarea.style.fontSize = `${scaledFontSize}px`;
		textarea.style.fontFamily = textNode.fontFamily();
		textarea.style.fontWeight = textNode.fontStyle() === 'bold' ? 'bold' : 'normal';
		textarea.style.fontStyle = textNode.fontStyle() === 'italic' ? 'italic' : 'normal';
		textarea.style.textAlign = elem.align || 'left';
		textarea.style.border = '2px solid #f97316';
		textarea.style.borderRadius = '4px';
		textarea.style.padding = '4px 8px';
		textarea.style.margin = '0px';
		textarea.style.overflow = 'auto';
		textarea.style.background = 'rgba(255, 255, 255, 0.95)';
		textarea.style.outline = 'none';
		textarea.style.resize = 'vertical';
		textarea.style.lineHeight = '1.4';
		textarea.style.transformOrigin = 'left top';
		textarea.style.color = textNode.fill() as string || '#000000';
		textarea.style.zIndex = '10000';
		textarea.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
		textarea.style.boxSizing = 'border-box';
		textarea.rows = 3; // 最低3行

		// テキストノードを非表示（textareaが表示された後）
		textNode.hide();
		layer.draw();

		textarea.focus();
		textarea.select();

		let isRemoved = false;

		function removeTextarea() {
			if (isRemoved) return;
			isRemoved = true;

			window.removeEventListener('click', handleOutsideClick);

			if (textarea.parentNode) {
				textarea.parentNode.removeChild(textarea);
			}
			textNode.show();
			if (transformer) {
				transformer.show();
				transformer.forceUpdate();
			}
			layer?.draw();
		}

		function setTextValue() {
			const newText = textarea.value;
			textNode.text(newText);

			// データを更新
			const elements = slideData.elements.map((e) => {
				if (e.id === elem.id) {
					return { ...e, text: newText };
				}
				return e;
			});
			const newSlideData = { ...slideData, elements };
			onUpdate?.(newSlideData);
		}

		textarea.addEventListener('keydown', (e) => {
			// イベントの伝播を止めて、親要素でキャプチャされないようにする
			e.stopPropagation();

			// Ctrl+Enter または Cmd+Enter で確定
			if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				setTextValue();
				removeTextarea();
				return;
			}
			// Escapeでキャンセル（値を保存しない）
			if (e.key === 'Escape') {
				e.preventDefault();
				removeTextarea();
				return;
			}
			// 通常のEnterは改行を許可（デフォルト動作）- 何もしない
		});

		textarea.addEventListener('blur', () => {
			setTextValue();
			removeTextarea();
		});

		function handleOutsideClick(e: MouseEvent) {
			if (e.target !== textarea) {
				setTextValue();
				removeTextarea();
			}
		}

		setTimeout(() => {
			window.addEventListener('click', handleOutsideClick);
		}, 100);
	}

	// グループ対応のテキスト編集関数
	function editTextWithGroup(textNode: Konva.Text, groupOrTextNode: Konva.Node, elem: SlideElement) {
		if (!stage || !layer || !containerRef) return;

		// トランスフォーマーのみ非表示
		if (transformer) {
			transformer.hide();
		}
		layer.draw();

		// テキストエリアを作成
		const scale = layer.scaleX();
		const stageBox = containerRef.getBoundingClientRect();

		// グループの場合はグループの位置を使用
		const groupX = groupOrTextNode.x();
		const groupY = groupOrTextNode.y();

		// テキストの実際の位置とサイズを取得
		const textRect = textNode.getClientRect();
		const fontSize = textNode.fontSize() || 24;
		const scaledFontSize = fontSize * scale;

		// テキストの配置に基づいて位置を計算
		const nodeX = groupX * scale;
		const nodeY = groupY * scale;
		const nodeWidth = textNode.width() ? textNode.width() * scale : stageBox.width - nodeX - 20;
		const nodeHeight = Math.max(scaledFontSize * 1.5, textRect.height * scale);

		const textarea = document.createElement('textarea');
		containerRef.style.position = 'relative';
		containerRef.appendChild(textarea);

		textarea.value = textNode.text();
		textarea.style.position = 'absolute';
		textarea.style.top = `${nodeY}px`;
		textarea.style.left = `${nodeX}px`;
		textarea.style.width = `${nodeWidth}px`;
		textarea.style.minHeight = `${Math.max(nodeHeight, scaledFontSize * 3)}px`;
		textarea.style.height = 'auto';
		textarea.style.fontSize = `${scaledFontSize}px`;
		textarea.style.fontFamily = textNode.fontFamily();
		textarea.style.fontWeight = textNode.fontStyle() === 'bold' ? 'bold' : 'normal';
		textarea.style.fontStyle = textNode.fontStyle() === 'italic' ? 'italic' : 'normal';
		textarea.style.textAlign = elem.align || 'left';
		textarea.style.border = '2px solid #f97316';
		textarea.style.borderRadius = '4px';
		textarea.style.padding = '4px 8px';
		textarea.style.margin = '0px';
		textarea.style.overflow = 'auto';
		textarea.style.background = 'rgba(255, 255, 255, 0.95)';
		textarea.style.outline = 'none';
		textarea.style.resize = 'vertical';
		textarea.style.lineHeight = '1.4';
		textarea.style.transformOrigin = 'left top';
		textarea.style.color = textNode.fill() as string || '#000000';
		textarea.style.zIndex = '10000';
		textarea.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
		textarea.style.boxSizing = 'border-box';
		textarea.rows = 3;

		// グループ全体を非表示
		groupOrTextNode.hide();
		layer.draw();

		textarea.focus();
		textarea.select();

		let isRemoved = false;

		function removeTextarea() {
			if (isRemoved) return;
			isRemoved = true;

			window.removeEventListener('click', handleOutsideClick);

			if (textarea.parentNode) {
				textarea.parentNode.removeChild(textarea);
			}
			groupOrTextNode.show();
			if (transformer) {
				transformer.show();
				transformer.forceUpdate();
			}
			layer?.draw();
		}

		function setTextValue() {
			const newText = textarea.value;
			textNode.text(newText);

			// データを更新
			const elements = slideData.elements.map((e) => {
				if (e.id === elem.id) {
					return { ...e, text: newText };
				}
				return e;
			});
			const newSlideData = { ...slideData, elements };
			onUpdate?.(newSlideData);
		}

		textarea.addEventListener('keydown', (e) => {
			e.stopPropagation();

			if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				setTextValue();
				removeTextarea();
				return;
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				removeTextarea();
				return;
			}
		});

		textarea.addEventListener('blur', () => {
			setTextValue();
			removeTextarea();
		});

		function handleOutsideClick(e: MouseEvent) {
			if (e.target !== textarea) {
				setTextValue();
				removeTextarea();
			}
		}

		setTimeout(() => {
			window.addEventListener('click', handleOutsideClick);
		}, 100);
	}

	// 外部から要素を追加するためのメソッド
	export function addElement(elem: SlideElement) {
		const newElements = [...slideData.elements, elem];
		const newSlideData = { ...slideData, elements: newElements };
		onUpdate?.(newSlideData);

		// 即座に描画
		if (layer) {
			const node = createKonvaNode(elem);
			if (node) {
				layer.add(node);
				if (transformer) {
					transformer.moveToTop();
				}
				layer.batchDraw();
			}
		}
	}

	// 選択中の要素を削除
	export function deleteSelectedElement() {
		if (!selectedNode) return;

		const id = selectedNode.id();
		const newElements = slideData.elements.filter((e) => e.id !== id);
		const newSlideData = { ...slideData, elements: newElements };

		selectedNode.destroy();
		deselectAll();
		onUpdate?.(newSlideData);
		layer?.batchDraw();
	}

	// スライドを画像としてエクスポート（PNG形式）
	export function toDataURL(pixelRatio: number = 2): string | null {
		if (!stage || !layer) return null;

		// トランスフォーマーを一時的に非表示
		if (transformer) {
			transformer.hide();
		}

		// 現在のスケールを保存
		const currentScale = layer.scaleX();

		// エクスポート用にフルサイズにリセット
		layer.scale({ x: 1, y: 1 });
		stage.width(SLIDE_WIDTH);
		stage.height(SLIDE_HEIGHT);
		layer.batchDraw();

		// 画像としてエクスポート
		const dataURL = stage.toDataURL({
			pixelRatio: pixelRatio,
			mimeType: 'image/png',
			quality: 1
		});

		// スケールを元に戻す
		if (containerRef) {
			const containerWidth = containerRef.clientWidth;
			const scale = calculateScale(containerWidth);
			stage.width(containerWidth);
			stage.height(SLIDE_HEIGHT * scale);
			layer.scale({ x: scale, y: scale });
		}

		// トランスフォーマーを再表示
		if (transformer) {
			transformer.show();
		}
		layer.batchDraw();

		return dataURL;
	}

	// スライドをBlobとしてエクスポート
	export function toBlob(pixelRatio: number = 2): Promise<Blob | null> {
		return new Promise((resolve) => {
			if (!stage || !layer) {
				resolve(null);
				return;
			}

			// トランスフォーマーを一時的に非表示
			if (transformer) {
				transformer.hide();
			}

			// 現在のスケールを保存
			const currentScale = layer.scaleX();

			// エクスポート用にフルサイズにリセット
			layer.scale({ x: 1, y: 1 });
			stage.width(SLIDE_WIDTH);
			stage.height(SLIDE_HEIGHT);
			layer.batchDraw();

			// Blobとしてエクスポート
			stage.toBlob({
				pixelRatio: pixelRatio,
				mimeType: 'image/png',
				callback: (blob) => {
					// スケールを元に戻す
					if (containerRef) {
						const containerWidth = containerRef.clientWidth;
						const scale = calculateScale(containerWidth);
						stage!.width(containerWidth);
						stage!.height(SLIDE_HEIGHT * scale);
						layer!.scale({ x: scale, y: scale });
					}

					// トランスフォーマーを再表示
					if (transformer) {
						transformer.show();
					}
					layer!.batchDraw();

					resolve(blob);
				}
			});
		});
	}

	// スライドデータが変更されたら再描画
	$effect(() => {
		// slideDataの変更を検知するために参照
		const _slideId = slideData.id;
		const _elemCount = slideData.elements.length;
		// 要素のプロパティ変更も検知するためにJSON文字列化
		const _elemData = JSON.stringify(slideData.elements);

		// 現在のスライドIDを更新（非同期画像読み込み用）
		currentSlideId = slideData.id;

		if (stage && layer) {
			// 現在選択中の要素IDを保存
			const selectedId = selectedNode?.id() || null;

			// 既存の要素を削除（背景とトランスフォーマー以外）
			const children = layer.getChildren();
			const toRemove: Konva.Node[] = [];
			children.forEach((child) => {
				// 背景（IDなしのRect）とトランスフォーマー以外を削除
				const isBackground = child.getClassName() === 'Rect' && !child.id();
				const isTransformer = child === transformer;
				if (!isBackground && !isTransformer) {
					toRemove.push(child);
				}
			});
			toRemove.forEach(node => node.destroy());

			// 背景色を更新
			const bgRect = layer.findOne((node: Konva.Node) => {
				return node.getClassName() === 'Rect' && !node.id();
			}) as Konva.Rect;
			if (bgRect) {
				bgRect.fill(slideData.backgroundColor || theme.backgroundColor);
			}

			// 要素を再描画
			let nodeToSelect: Konva.Node | null = null;
			let elemToSelect: SlideElement | null = null;
			slideData.elements.forEach((elem) => {
				const node = createKonvaNode(elem);
				if (node) {
					layer!.add(node);
					if (transformer) {
						node.moveToTop();
					}
					// 以前選択していた要素を再選択
					if (selectedId && elem.id === selectedId) {
						nodeToSelect = node;
						elemToSelect = elem;
					}
				}
			});

			// トランスフォーマーを最上位に
			if (transformer) {
				transformer.moveToTop();
				// 以前選択していた要素があれば再選択
				if (nodeToSelect) {
					transformer.nodes([nodeToSelect]);
					selectedNode = nodeToSelect;
				} else {
					transformer.nodes([]);
					selectedNode = null;
					onSelectElement?.(null);
				}
			}

			layer.batchDraw();
		}
	});

	// リサイズ対応
	function handleResize() {
		if (!stage || !layer || !containerRef) return;

		const containerWidth = containerRef.clientWidth;
		const scale = calculateScale(containerWidth);

		stage.width(containerWidth);
		stage.height(SLIDE_HEIGHT * scale);
		layer.scale({ x: scale, y: scale });
		if (guideLayer) {
			guideLayer.scale({ x: scale, y: scale });
		}
		layer.batchDraw();
	}

	onMount(() => {
		window.addEventListener('resize', handleResize);
		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});
</script>

<div
	bind:this={containerRef}
	class="slide-canvas-container"
	role="application"
	aria-label="スライドキャンバス"
></div>

<style>
	.slide-canvas-container {
		width: 100%;
		background: #4b5563;
		border-radius: 0;
		overflow: hidden;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}

	:global(.konvajs-content) {
		margin: 0 auto;
	}
</style>
