// 字幕生成ユーティリティ

export interface SubtitleEntry {
	id: string;
	sectionId: string;
	startTime: number; // 秒
	endTime: number; // 秒
	text: string;
}

export interface SubtitleData {
	version: string;
	createdAt: string;
	settings: SubtitleSettings;
	entries: SubtitleEntry[];
}

// 字幕設定
export interface SubtitleSettings {
	maxCharsPerLine: number; // 1行あたりの最大文字数
	playbackRate: number; // 再生倍率（1.0 = 通常、1.5 = 1.5倍速など）
	splitByPunctuation: boolean; // 句読点で分割するか
}

// デフォルト設定
// 1行20文字程度がYouTubeやテレビ字幕の標準的な長さ
export const DEFAULT_SUBTITLE_SETTINGS: SubtitleSettings = {
	maxCharsPerLine: 20,
	playbackRate: 1.0,
	splitByPunctuation: true
};

// WAVファイルから音声の長さを取得（秒）
export function getWavDuration(audioData: ArrayBuffer): number {
	const view = new DataView(audioData);

	try {
		// RIFFヘッダー確認
		const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
		if (riff !== 'RIFF') {
			console.warn('Not a valid WAV file');
			return 0;
		}

		// サンプルレート（バイト24-27）
		const sampleRate = view.getUint32(24, true);
		// ビット深度（バイト34-35）
		const bitsPerSample = view.getUint16(34, true);
		// チャンネル数（バイト22-23）
		const numChannels = view.getUint16(22, true);

		// データチャンクを探す
		let offset = 12;
		let dataSize = 0;

		while (offset < audioData.byteLength - 8) {
			const chunkId = String.fromCharCode(
				view.getUint8(offset),
				view.getUint8(offset + 1),
				view.getUint8(offset + 2),
				view.getUint8(offset + 3)
			);
			const chunkSize = view.getUint32(offset + 4, true);

			if (chunkId === 'data') {
				dataSize = chunkSize;
				break;
			}

			offset += 8 + chunkSize;
		}

		if (dataSize === 0) {
			dataSize = audioData.byteLength - 44;
		}

		const bytesPerSample = bitsPerSample / 8;
		const bytesPerSecond = sampleRate * numChannels * bytesPerSample;
		const duration = dataSize / bytesPerSecond;

		return duration;
	} catch (e) {
		console.error('Error parsing WAV file:', e);
		return 0;
	}
}

// 台本テキストを分割（設定に基づく）
export function splitTextForSubtitles(
	text: string,
	settings: SubtitleSettings = DEFAULT_SUBTITLE_SETTINGS
): string[] {
	const { maxCharsPerLine, splitByPunctuation } = settings;
	const sentences: string[] = [];

	if (splitByPunctuation) {
		// 句読点で分割
		const majorSplits = text.split(/([。！？])/);
		let currentSentence = '';

		for (let i = 0; i < majorSplits.length; i++) {
			currentSentence += majorSplits[i];

			if (/[。！？]/.test(majorSplits[i]) || i === majorSplits.length - 1) {
				if (currentSentence.trim()) {
					// 最大文字数を超える場合はさらに分割
					if (currentSentence.length > maxCharsPerLine) {
						const subSentences = splitLongSentence(currentSentence, maxCharsPerLine);
						sentences.push(...subSentences);
					} else {
						sentences.push(currentSentence.trim());
					}
					currentSentence = '';
				}
			}
		}
	} else {
		// 文字数のみで分割
		const words = text.split('');
		let currentLine = '';

		for (const char of words) {
			currentLine += char;
			if (currentLine.length >= maxCharsPerLine) {
				sentences.push(currentLine.trim());
				currentLine = '';
			}
		}

		if (currentLine.trim()) {
			sentences.push(currentLine.trim());
		}
	}

	return sentences.filter(s => s.length > 0);
}

// 長い文章を読点やスペースで分割
function splitLongSentence(text: string, maxChars: number): string[] {
	const result: string[] = [];

	// まず読点で分割を試みる
	const parts = text.split(/([、,])/);
	let current = '';

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];

		if (current.length + part.length <= maxChars) {
			current += part;
		} else {
			if (current.trim()) {
				result.push(current.trim());
			}
			current = part;
		}

		// 読点の後で区切りを入れる
		if (/[、,]/.test(part) && current.length >= maxChars * 0.5) {
			result.push(current.trim());
			current = '';
		}
	}

	if (current.trim()) {
		// まだ長い場合は強制的に分割
		if (current.length > maxChars) {
			for (let i = 0; i < current.length; i += maxChars) {
				result.push(current.substring(i, Math.min(i + maxChars, current.length)).trim());
			}
		} else {
			result.push(current.trim());
		}
	}

	return result;
}

// 文字数の比率で時間を割り当て（再生倍率対応）
export function assignTimesToSentences(
	sentences: string[],
	totalDuration: number,
	sectionId: string,
	settings: SubtitleSettings = DEFAULT_SUBTITLE_SETTINGS
): SubtitleEntry[] {
	if (sentences.length === 0 || totalDuration <= 0) {
		return [];
	}

	const { playbackRate } = settings;

	// 再生倍率を適用した実際の再生時間
	const adjustedDuration = totalDuration / playbackRate;

	const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
	if (totalChars === 0) {
		return [];
	}

	const entries: SubtitleEntry[] = [];
	let currentTime = 0;

	for (let i = 0; i < sentences.length; i++) {
		const sentence = sentences[i];
		const duration = (sentence.length / totalChars) * adjustedDuration;
		const adjustedDurationPerSentence = Math.max(duration, 0.3); // 最小0.3秒

		entries.push({
			id: `${sectionId}-sub-${i}`,
			sectionId,
			startTime: Math.round(currentTime * 100) / 100,
			endTime: Math.round((currentTime + adjustedDurationPerSentence) * 100) / 100,
			text: sentence
		});

		currentTime += adjustedDurationPerSentence;
	}

	// 最後のエントリの終了時間を調整
	if (entries.length > 0) {
		entries[entries.length - 1].endTime = Math.round(adjustedDuration * 100) / 100;
	}

	return entries;
}

// セクションから字幕データを生成
export function generateSubtitlesForSection(
	sectionId: string,
	script: string,
	audioData: ArrayBuffer | undefined,
	startOffset: number = 0,
	settings: SubtitleSettings = DEFAULT_SUBTITLE_SETTINGS
): { entries: SubtitleEntry[]; duration: number } {
	if (!script || !audioData) {
		return { entries: [], duration: 0 };
	}

	const rawDuration = getWavDuration(audioData);
	const adjustedDuration = rawDuration / settings.playbackRate;

	const sentences = splitTextForSubtitles(script, settings);
	const entries = assignTimesToSentences(sentences, rawDuration, sectionId, settings);

	// オフセットを適用
	if (startOffset > 0) {
		entries.forEach(entry => {
			entry.startTime += startOffset;
			entry.endTime += startOffset;
		});
	}

	return { entries, duration: adjustedDuration };
}

// 全セクションから字幕データを生成
export function generateAllSubtitles(
	sections: Array<{
		id: string;
		script?: string;
		audioData?: ArrayBuffer;
	}>,
	settings: SubtitleSettings = DEFAULT_SUBTITLE_SETTINGS
): SubtitleData {
	const allEntries: SubtitleEntry[] = [];
	let currentOffset = 0;

	for (const section of sections) {
		if (section.script && section.audioData) {
			const { entries, duration } = generateSubtitlesForSection(
				section.id,
				section.script,
				section.audioData,
				currentOffset,
				settings
			);
			allEntries.push(...entries);
			currentOffset += duration;
		}
	}

	return {
		version: '1.0',
		createdAt: new Date().toISOString(),
		settings,
		entries: allEntries
	};
}

// 特定の時間に表示すべき字幕を取得
export function getSubtitleAtTime(
	subtitles: SubtitleEntry[],
	time: number
): SubtitleEntry | null {
	for (const entry of subtitles) {
		if (time >= entry.startTime && time < entry.endTime) {
			return entry;
		}
	}
	return null;
}

// 字幕データを再生倍率で調整
export function adjustSubtitlesForPlaybackRate(
	subtitles: SubtitleEntry[],
	originalRate: number,
	newRate: number
): SubtitleEntry[] {
	const ratio = originalRate / newRate;

	return subtitles.map(entry => ({
		...entry,
		startTime: Math.round(entry.startTime * ratio * 100) / 100,
		endTime: Math.round(entry.endTime * ratio * 100) / 100
	}));
}
