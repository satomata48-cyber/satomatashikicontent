// Konva.jsスライドエディタ用の型定義
// AIがこのJSON形式でスライドを生成・編集する

export interface SlideElement {
	id: string;
	type: 'text' | 'rect' | 'circle' | 'image' | 'line' | 'arrow' | 'star' | 'polygon';
	x: number;
	y: number;
	width?: number;
	height?: number;
	rotation?: number;
	// テキスト用
	text?: string;
	fontSize?: number;
	fontFamily?: string;
	fontStyle?: 'normal' | 'bold' | 'italic' | 'bold italic';
	align?: 'left' | 'center' | 'right';
	// マーカー用（テキスト専用）
	marker?: 'none' | 'underline' | 'half' | 'full';  // マーカータイプ
	markerColor?: string;  // マーカーの色
	// 色・スタイル
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
	opacity?: number;
	// 円用
	radius?: number;
	// 線・矢印用
	points?: number[];
	// 画像用
	src?: string;
	// 星用
	numPoints?: number;
	innerRadius?: number;
	outerRadius?: number;
	// ポリゴン用
	sides?: number;
	// レイヤー順序
	zIndex?: number;
}

export interface SlideData {
	id: string;
	name: string;
	backgroundColor: string;
	backgroundGradient?: {
		type: 'linear' | 'radial';
		colors: string[];
		direction?: number; // degrees for linear
	};
	elements: SlideElement[];
}

export interface SlidePresentation {
	id: string;
	title: string;
	slides: SlideData[];
	theme: SlideTheme;
	createdAt: string;
	updatedAt: string;
}

export interface SlideTheme {
	primaryColor: string;
	accentColor: string;
	backgroundColor: string;
	textColor: string;
	fontFamily: string;
}

// デフォルトテーマ
export const DEFAULT_THEMES: Record<string, SlideTheme> = {
	satomata: {
		primaryColor: '#3b5998',
		accentColor: '#ec4899',
		backgroundColor: '#dbeafe',
		textColor: '#1f2937',
		fontFamily: 'Hiragino Sans, Noto Sans JP, sans-serif'
	},
	thqInstitute: {
		primaryColor: '#3b5998',
		accentColor: '#e91e63',
		backgroundColor: '#ffffff',
		textColor: '#333333',
		fontFamily: 'Hiragino Sans, Noto Sans JP, sans-serif'
	},
	modern: {
		primaryColor: '#667eea',
		accentColor: '#764ba2',
		backgroundColor: '#1a1a2e',
		textColor: '#ffffff',
		fontFamily: 'Hiragino Sans, Noto Sans JP, sans-serif'
	},
	nature: {
		primaryColor: '#059669',
		accentColor: '#f59e0b',
		backgroundColor: '#f0fdf4',
		textColor: '#1f2937',
		fontFamily: 'Hiragino Sans, Noto Sans JP, sans-serif'
	}
};

// AIプロンプト用のスキーマ説明
export const SLIDE_SCHEMA_DESCRIPTION = `
【スライドJSONスキーマ】

スライドはJSON形式で定義します。AIはこの形式でスライドを生成・編集してください。

■ SlideData構造:
{
  "id": "slide-1",
  "name": "タイトルスライド",
  "backgroundColor": "#dbeafe",
  "elements": [
    {
      "id": "elem-1",
      "type": "text",
      "x": 640,
      "y": 300,
      "text": "プレゼンタイトル",
      "fontSize": 64,
      "fontFamily": "Hiragino Sans",
      "fontStyle": "bold",
      "fill": "#1f2937",
      "align": "center"
    },
    {
      "id": "elem-2",
      "type": "rect",
      "x": 0,
      "y": 0,
      "width": 1280,
      "height": 80,
      "fill": "#3b5998"
    }
  ]
}

■ 要素タイプ:
- text: テキスト（fontSize, fontFamily, fontStyle, align, fill）
- rect: 四角形（width, height, fill, stroke, strokeWidth）
- circle: 円（radius, fill, stroke）
- image: 画像（src, width, height）
- line: 線（points: [x1,y1,x2,y2], stroke, strokeWidth）
- arrow: 矢印（points, stroke, strokeWidth）
- star: 星（numPoints, innerRadius, outerRadius, fill）

■ 座標系:
- スライドサイズ: 1280x720px
- 原点: 左上 (0, 0)
- テキストのalign: centerの場合、xは中心位置

■ カラー:
- fill: 塗りつぶし色（#RRGGBB形式）
- stroke: 枠線色
- strokeWidth: 枠線の太さ

■ 回転・透明度:
- rotation: 度数（0-360）
- opacity: 0-1（0=透明、1=不透明）
`;

// サンプルスライドデータ
export function createSamplePresentation(): SlidePresentation {
	return {
		id: crypto.randomUUID(),
		title: '新規プレゼンテーション',
		slides: [
			{
				id: 'slide-1',
				name: 'タイトルスライド',
				backgroundColor: '#dbeafe',
				elements: [
					{
						id: 'header-bar',
						type: 'rect',
						x: 0,
						y: 0,
						width: 1280,
						height: 80,
						fill: '#3b5998'
					},
					{
						id: 'title-text',
						type: 'text',
						x: 640,
						y: 320,
						text: 'プレゼンテーションタイトル',
						fontSize: 56,
						fontFamily: 'Hiragino Sans',
						fontStyle: 'bold',
						fill: '#1f2937',
						align: 'center'
					},
					{
						id: 'subtitle-text',
						type: 'text',
						x: 640,
						y: 420,
						text: 'サブタイトルをここに入力',
						fontSize: 32,
						fontFamily: 'Hiragino Sans',
						fontStyle: 'normal',
						fill: '#ec4899',
						align: 'center'
					}
				]
			},
			{
				id: 'slide-2',
				name: 'コンテンツスライド',
				backgroundColor: '#dbeafe',
				elements: [
					{
						id: 'header-bar-2',
						type: 'rect',
						x: 0,
						y: 0,
						width: 1280,
						height: 80,
						fill: '#3b5998'
					},
					{
						id: 'header-text-2',
						type: 'text',
						x: 640,
						y: 50,
						text: '見出しテキスト',
						fontSize: 36,
						fontFamily: 'Hiragino Sans',
						fontStyle: 'bold',
						fill: '#ffffff',
						align: 'center'
					},
					{
						id: 'content-1',
						type: 'text',
						x: 100,
						y: 150,
						text: '• ポイント1：内容を記入',
						fontSize: 28,
						fontFamily: 'Hiragino Sans',
						fill: '#ec4899',
						align: 'left'
					},
					{
						id: 'content-2',
						type: 'text',
						x: 100,
						y: 220,
						text: '• ポイント2：内容を記入',
						fontSize: 28,
						fontFamily: 'Hiragino Sans',
						fill: '#ec4899',
						align: 'left'
					},
					{
						id: 'content-3',
						type: 'text',
						x: 100,
						y: 290,
						text: '• ポイント3：内容を記入',
						fontSize: 28,
						fontFamily: 'Hiragino Sans',
						fill: '#ec4899',
						align: 'left'
					}
				]
			}
		],
		theme: DEFAULT_THEMES.satomata,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString()
	};
}

// 要素のユニークID生成
export function generateElementId(): string {
	return `elem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// スライドのユニークID生成
export function generateSlideId(): string {
	return `slide-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
