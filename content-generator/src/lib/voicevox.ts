// VOICEVOX ローカルAPI接続モジュール

const VOICEVOX_BASE_URL = 'http://localhost:50021';

// 話者情報の型定義
export interface VoicevoxStyle {
	name: string;
	id: number;
	type: string;
}

export interface VoicevoxSpeaker {
	name: string;
	speaker_uuid: string;
	styles: VoicevoxStyle[];
	version: string;
}

// 音声合成クエリの型定義
export interface AudioQuery {
	accent_phrases: unknown[];
	speedScale: number;
	pitchScale: number;
	intonationScale: number;
	volumeScale: number;
	prePhonemeLength: number;
	postPhonemeLength: number;
	outputSamplingRate: number;
	outputStereo: boolean;
	kana?: string;
}

// VOICEVOXの接続状態を確認
export async function checkVoicevoxConnection(): Promise<boolean> {
	try {
		const response = await fetch(`${VOICEVOX_BASE_URL}/version`, {
			method: 'GET',
			signal: AbortSignal.timeout(3000)
		});
		return response.ok;
	} catch {
		return false;
	}
}

// VOICEVOXのバージョンを取得
export async function getVoicevoxVersion(): Promise<string | null> {
	try {
		const response = await fetch(`${VOICEVOX_BASE_URL}/version`);
		if (response.ok) {
			return await response.text();
		}
		return null;
	} catch {
		return null;
	}
}

// 話者一覧を取得
export async function getSpeakers(): Promise<VoicevoxSpeaker[]> {
	try {
		const response = await fetch(`${VOICEVOX_BASE_URL}/speakers`);
		if (response.ok) {
			return await response.json();
		}
		return [];
	} catch {
		return [];
	}
}

// 音声合成クエリを作成
export async function createAudioQuery(text: string, speaker: number): Promise<AudioQuery | null> {
	try {
		const response = await fetch(
			`${VOICEVOX_BASE_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`,
			{ method: 'POST' }
		);
		if (response.ok) {
			return await response.json();
		}
		return null;
	} catch {
		return null;
	}
}

// 音声を合成（WAVデータを返す）
export async function synthesize(query: AudioQuery, speaker: number): Promise<ArrayBuffer | null> {
	try {
		const response = await fetch(
			`${VOICEVOX_BASE_URL}/synthesis?speaker=${speaker}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(query)
			}
		);
		if (response.ok) {
			return await response.arrayBuffer();
		}
		return null;
	} catch {
		return null;
	}
}

// テキストを分割する最大文字数（VOICEVOXの負荷軽減）
const MAX_TEXT_LENGTH = 500;

// テキストを適切なサイズに分割
function splitTextForSynthesis(text: string): string[] {
	if (text.length <= MAX_TEXT_LENGTH) {
		return [text];
	}

	const chunks: string[] = [];
	// 句読点で分割
	const sentences = text.split(/(?<=[。．！？\n])/);
	let currentChunk = '';

	for (const sentence of sentences) {
		if (currentChunk.length + sentence.length > MAX_TEXT_LENGTH) {
			if (currentChunk) {
				chunks.push(currentChunk.trim());
			}
			// 文自体が長すぎる場合はさらに分割
			if (sentence.length > MAX_TEXT_LENGTH) {
				for (let i = 0; i < sentence.length; i += MAX_TEXT_LENGTH) {
					chunks.push(sentence.slice(i, i + MAX_TEXT_LENGTH));
				}
				currentChunk = '';
			} else {
				currentChunk = sentence;
			}
		} else {
			currentChunk += sentence;
		}
	}

	if (currentChunk.trim()) {
		chunks.push(currentChunk.trim());
	}

	return chunks;
}

// 複数の音声データを結合
function concatenateAudioBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
	if (buffers.length === 1) return buffers[0];

	// WAVファイルのヘッダーを除いてデータ部分を結合
	// 最初のファイルのヘッダー（44バイト）を使用
	const headerSize = 44;
	let totalDataSize = 0;

	for (const buffer of buffers) {
		totalDataSize += buffer.byteLength - headerSize;
	}

	const result = new ArrayBuffer(headerSize + totalDataSize);
	const resultView = new Uint8Array(result);

	// ヘッダーをコピー
	const firstHeader = new Uint8Array(buffers[0], 0, headerSize);
	resultView.set(firstHeader, 0);

	// データサイズを更新（ヘッダー内のサイズフィールド）
	const dataView = new DataView(result);
	dataView.setUint32(4, 36 + totalDataSize, true); // ChunkSize
	dataView.setUint32(40, totalDataSize, true); // Subchunk2Size

	// データ部分を結合
	let offset = headerSize;
	for (const buffer of buffers) {
		const data = new Uint8Array(buffer, headerSize);
		resultView.set(data, offset);
		offset += data.length;
	}

	return result;
}

// テキストから直接音声を生成（簡易版）
export async function textToSpeech(text: string, speaker: number = 3): Promise<{
	success: boolean;
	audio?: ArrayBuffer;
	error?: string;
}> {
	try {
		// テキストを適切なサイズに分割
		const chunks = splitTextForSynthesis(text);
		console.log(`textToSpeech: Processing ${chunks.length} chunk(s), total ${text.length} chars`);

		const audioBuffers: ArrayBuffer[] = [];

		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i];
			console.log(`textToSpeech: Chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);

			// Step 1: 音声合成クエリを作成
			const query = await createAudioQuery(chunk, speaker);
			if (!query) {
				return { success: false, error: `音声合成クエリの作成に失敗しました (チャンク ${i + 1})` };
			}

			// Step 2: 音声を合成
			const audio = await synthesize(query, speaker);
			if (!audio) {
				return { success: false, error: `音声合成に失敗しました (チャンク ${i + 1})` };
			}

			audioBuffers.push(audio);

			// VOICEVOXの負荷軽減のため少し待機
			if (i < chunks.length - 1) {
				await new Promise(resolve => setTimeout(resolve, 100));
			}
		}

		// 音声データを結合
		const combinedAudio = concatenateAudioBuffers(audioBuffers);
		return { success: true, audio: combinedAudio };
	} catch (e) {
		console.error('textToSpeech error:', e);
		return { success: false, error: e instanceof Error ? e.message : '不明なエラー' };
	}
}

// ArrayBufferをBlobに変換してURLを生成
export function createAudioUrl(audioData: ArrayBuffer): string {
	const blob = new Blob([audioData], { type: 'audio/wav' });
	return URL.createObjectURL(blob);
}

// ArrayBufferをBase64に変換
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

// 主要な話者ID（よく使うもの）
export const POPULAR_SPEAKERS = [
	{ id: 3, name: 'ずんだもん', style: 'ノーマル' },
	{ id: 1, name: 'ずんだもん', style: 'あまあま' },
	{ id: 2, name: '四国めたん', style: 'ノーマル' },
	{ id: 8, name: '春日部つむぎ', style: 'ノーマル' },
	{ id: 10, name: '雨晴はう', style: 'ノーマル' },
	{ id: 14, name: '冥鳴ひまり', style: 'ノーマル' },
	{ id: 16, name: '九州そら', style: 'ノーマル' },
	{ id: 47, name: 'ナースロボ＿タイプＴ', style: 'ノーマル' },
];
