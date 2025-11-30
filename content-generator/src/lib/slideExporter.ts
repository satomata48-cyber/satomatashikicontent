// スライドデータのエクスポート/インポートユーティリティ

import type { SlidePresentation } from './slideCanvasTypes';

// JSON形式でスライドをエクスポート（AI連携用）
export function exportPresentationToJson(presentation: SlidePresentation): string {
	return JSON.stringify(presentation, null, 2);
}

// JSON文字列からプレゼンテーションをインポート
export function importPresentationFromJson(jsonString: string): SlidePresentation | null {
	try {
		const data = JSON.parse(jsonString);
		// 基本的なバリデーション
		if (!data.id || !data.slides || !Array.isArray(data.slides)) {
			return null;
		}
		return data as SlidePresentation;
	} catch {
		return null;
	}
}
