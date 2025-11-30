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

// テキストから直接音声を生成（簡易版）
export async function textToSpeech(text: string, speaker: number = 3): Promise<{
	success: boolean;
	audio?: ArrayBuffer;
	error?: string;
}> {
	try {
		// Step 1: 音声合成クエリを作成
		const query = await createAudioQuery(text, speaker);
		if (!query) {
			return { success: false, error: '音声合成クエリの作成に失敗しました' };
		}

		// Step 2: 音声を合成
		const audio = await synthesize(query, speaker);
		if (!audio) {
			return { success: false, error: '音声合成に失敗しました' };
		}

		return { success: true, audio };
	} catch (e) {
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
