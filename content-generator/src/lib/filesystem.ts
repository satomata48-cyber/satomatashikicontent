// ファイルシステム操作のユーティリティ
// ブラウザ環境用（Tauriは後で対応）

export interface FileInfo {
	name: string;
	path: string;
	content: string;
	type: string;
	createdAt: Date;
	updatedAt: Date;
}

// 最後に選択したフォルダのハンドルを保持
let lastDirectoryHandle: FileSystemDirectoryHandle | null = null;

// Tauri環境かどうかをチェック
export function isTauri(): boolean {
	return typeof window !== 'undefined' && '__TAURI__' in window;
}

// フォルダハンドルを設定（プロジェクト作成時などに使用）
export function setLastDirectoryHandle(handle: FileSystemDirectoryHandle | null) {
	lastDirectoryHandle = handle;
}

// フォルダハンドルを取得
export function getLastDirectoryHandle(): FileSystemDirectoryHandle | null {
	return lastDirectoryHandle;
}

// HTMLファイルを保存（File System Access API対応）
export async function saveHtmlFile(
	folderPath: string,
	fileName: string,
	content: string
): Promise<{ success: boolean; filePath?: string; error?: string }> {
	const sanitizedFileName = sanitizeFileName(fileName);
	const fullFileName = sanitizedFileName.endsWith('.html')
		? sanitizedFileName
		: `${sanitizedFileName}.html`;

	// フォルダハンドルが必須
	if (!lastDirectoryHandle) {
		console.log('saveHtmlFile: No folder handle');
		return {
			success: false,
			error: '保存先フォルダを選択してください。'
		};
	}

	try {
		// 権限を確認・リクエスト
		// @ts-ignore - File System Access API
		const permission = await lastDirectoryHandle.queryPermission({ mode: 'readwrite' });
		console.log('saveHtmlFile: Permission status:', permission);

		if (permission !== 'granted') {
			// @ts-ignore - File System Access API
			const requestResult = await lastDirectoryHandle.requestPermission({ mode: 'readwrite' });
			console.log('saveHtmlFile: Permission request result:', requestResult);

			if (requestResult !== 'granted') {
				return {
					success: false,
					error: 'フォルダへの書き込み権限が拒否されました。再度フォルダを選択してください。'
				};
			}
		}

		// フォルダ内にファイルを作成
		console.log('saveHtmlFile: Creating file:', fullFileName, 'in folder:', lastDirectoryHandle.name);
		const fileHandle = await lastDirectoryHandle.getFileHandle(fullFileName, { create: true });
		const writable = await fileHandle.createWritable();
		await writable.write(content);
		await writable.close();

		console.log('saveHtmlFile: File saved successfully');
		return { success: true, filePath: `${lastDirectoryHandle.name}/${fullFileName}` };
	} catch (e) {
		console.error('File System Access API save failed:', e);
		if (e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
			// 権限エラーの場合、ハンドルをクリアして再選択を促す
			lastDirectoryHandle = null;
			return {
				success: false,
				error: 'フォルダへのアクセス権限がありません。「フォルダを選択」から再選択してください。'
			};
		}
		return {
			success: false,
			error: e instanceof Error ? e.message : 'ファイルの保存に失敗しました'
		};
	}
}

// HTMLファイルを読み込み（File System Access API対応）
export async function loadHtmlFile(
	_filePath?: string
): Promise<{ success: boolean; content?: string; fileName?: string; error?: string }> {
	// File System Access APIが使える場合は、前回のフォルダから開く
	// @ts-ignore - File System Access API
	if ('showOpenFilePicker' in window) {
		try {
			const options: OpenFilePickerOptions = {
				types: [
					{
						description: 'HTMLファイル',
						accept: { 'text/html': ['.html', '.htm'] }
					}
				],
				multiple: false
			};

			// 前回選択したフォルダがあれば、そこから開く
			if (lastDirectoryHandle) {
				// @ts-ignore
				options.startIn = lastDirectoryHandle;
			}

			// @ts-ignore
			const [fileHandle] = await window.showOpenFilePicker(options);
			const file = await fileHandle.getFile();
			const content = await file.text();

			return { success: true, content, fileName: file.name };
		} catch (err) {
			// ユーザーがキャンセルした場合
			if (err instanceof Error && err.name === 'AbortError') {
				return { success: false, error: 'キャンセルされました' };
			}
			// その他のエラーの場合、従来の方法にフォールバック
			console.log('File System Access API failed, falling back to input element');
		}
	}

	// 従来のinput要素を使った方法（フォールバック）
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.html,.htm';
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (file) {
				try {
					const content = await file.text();
					resolve({ success: true, content, fileName: file.name });
				} catch (err) {
					resolve({
						success: false,
						error: err instanceof Error ? err.message : '読み込みに失敗しました'
					});
				}
			} else {
				resolve({ success: false, error: 'ファイルが選択されませんでした' });
			}
		};
		input.oncancel = () => {
			resolve({ success: false, error: 'キャンセルされました' });
		};
		input.click();
	});
}

// フォルダを選択（File System Access API対応ブラウザのみ）
export async function selectFolder(): Promise<{ success: boolean; path?: string; handle?: FileSystemDirectoryHandle; error?: string }> {
	try {
		// @ts-ignore - File System Access API
		if ('showDirectoryPicker' in window) {
			// @ts-ignore
			const dirHandle: FileSystemDirectoryHandle = await window.showDirectoryPicker();
			// 選択したフォルダを記憶
			lastDirectoryHandle = dirHandle;
			return { success: true, path: dirHandle.name, handle: dirHandle };
		}
		return { success: false, error: 'このブラウザはフォルダ選択に対応していません' };
	} catch (e) {
		if (e instanceof Error && e.name === 'AbortError') {
			return { success: false, error: 'キャンセルされました' };
		}
		return { success: false, error: 'フォルダ選択に失敗しました' };
	}
}

// ファイル名をサニタイズ
function sanitizeFileName(name: string): string {
	const date = new Date();
	const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
	const timeStr = `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;

	const sanitized = name
		.replace(/[<>:"/\\|?*]/g, '')
		.replace(/\s+/g, '_')
		.substring(0, 50);

	return `${sanitized}_${dateStr}_${timeStr}`;
}

// コンテンツタイプごとのフォルダ名
export function getContentTypeFolder(type: string): string {
	const folders: Record<string, string> = {
		blog: 'blogs',
		ebook: 'ebooks',
		video: 'videos',
		image: 'images',
		'slide-canvas': 'slides'
	};
	return folders[type] || 'contents';
}

// 画像ファイルを保存（PNG形式）
export async function saveImageFile(
	folderPath: string,
	fileName: string,
	dataUrl: string
): Promise<{ success: boolean; filePath?: string; error?: string }> {
	const sanitizedFileName = sanitizeFileName(fileName);
	const fullFileName = sanitizedFileName.endsWith('.png')
		? sanitizedFileName
		: `${sanitizedFileName}.png`;

	// data URLをBlobに変換
	const response = await fetch(dataUrl);
	const blob = await response.blob();

	// File System Access APIが使える場合、選択したフォルダに直接保存
	if (lastDirectoryHandle) {
		try {
			const fileHandle = await lastDirectoryHandle.getFileHandle(fullFileName, { create: true });
			const writable = await fileHandle.createWritable();
			await writable.write(blob);
			await writable.close();

			return { success: true, filePath: `${lastDirectoryHandle.name}/${fullFileName}` };
		} catch (e) {
			console.error('File System Access API save failed:', e);
			if (e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
				return {
					success: false,
					error: 'フォルダへのアクセス権限がありません。フォルダを再選択してください。'
				};
			}
		}
	}

	// フォールバック: ダウンロードとして保存
	try {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fullFileName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		return { success: true, filePath: fullFileName };
	} catch (e) {
		return {
			success: false,
			error: e instanceof Error ? e.message : 'ダウンロードに失敗しました'
		};
	}
}

// Blobから画像ファイルを保存
export async function saveImageBlob(
	folderPath: string,
	fileName: string,
	blob: Blob
): Promise<{ success: boolean; filePath?: string; error?: string }> {
	const sanitizedFileName = sanitizeFileName(fileName);
	const fullFileName = sanitizedFileName.endsWith('.png')
		? sanitizedFileName
		: `${sanitizedFileName}.png`;

	// File System Access APIが使える場合、選択したフォルダに直接保存
	if (lastDirectoryHandle) {
		try {
			const fileHandle = await lastDirectoryHandle.getFileHandle(fullFileName, { create: true });
			const writable = await fileHandle.createWritable();
			await writable.write(blob);
			await writable.close();

			return { success: true, filePath: `${lastDirectoryHandle.name}/${fullFileName}` };
		} catch (e) {
			console.error('File System Access API save failed:', e);
			if (e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
				return {
					success: false,
					error: 'フォルダへのアクセス権限がありません。フォルダを再選択してください。'
				};
			}
		}
	}

	// フォールバック: ダウンロードとして保存
	try {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fullFileName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		return { success: true, filePath: fullFileName };
	} catch (e) {
		return {
			success: false,
			error: e instanceof Error ? e.message : 'ダウンロードに失敗しました'
		};
	}
}

// JSONファイルを保存
export async function saveJsonFile(
	folderPath: string,
	fileName: string,
	data: object
): Promise<{ success: boolean; filePath?: string; error?: string }> {
	const fullFileName = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
	const content = JSON.stringify(data, null, 2);

	// File System Access APIが使える場合、選択したフォルダに直接保存
	if (lastDirectoryHandle) {
		try {
			const fileHandle = await lastDirectoryHandle.getFileHandle(fullFileName, { create: true });
			const writable = await fileHandle.createWritable();
			await writable.write(content);
			await writable.close();

			return { success: true, filePath: `${lastDirectoryHandle.name}/${fullFileName}` };
		} catch (e) {
			console.error('File System Access API save failed:', e);
			if (e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
				return {
					success: false,
					error: 'フォルダへのアクセス権限がありません。フォルダを再選択してください。'
				};
			}
		}
	}

	// フォールバック: ダウンロードとして保存
	try {
		const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fullFileName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		return { success: true, filePath: fullFileName };
	} catch (e) {
		return {
			success: false,
			error: e instanceof Error ? e.message : 'ダウンロードに失敗しました'
		};
	}
}

// JSONファイルを読み込み
export async function loadJsonFile(
	fileName?: string
): Promise<{ success: boolean; data?: object; fileName?: string; error?: string }> {
	// 前回選択したフォルダから特定のファイルを読み込み
	if (lastDirectoryHandle && fileName) {
		try {
			const fileHandle = await lastDirectoryHandle.getFileHandle(fileName);
			const file = await fileHandle.getFile();
			const content = await file.text();
			const data = JSON.parse(content);
			return { success: true, data, fileName };
		} catch (e) {
			// ファイルが存在しない場合は無視
			if (e instanceof Error && e.name === 'NotFoundError') {
				return { success: false, error: 'ファイルが見つかりません' };
			}
			console.error('Failed to load JSON file:', e);
		}
	}

	// File System Access APIが使える場合はファイルピッカーを表示
	// @ts-ignore - File System Access API
	if ('showOpenFilePicker' in window) {
		try {
			const options: OpenFilePickerOptions = {
				types: [
					{
						description: 'JSONファイル',
						accept: { 'application/json': ['.json'] }
					}
				],
				multiple: false
			};

			if (lastDirectoryHandle) {
				// @ts-ignore
				options.startIn = lastDirectoryHandle;
			}

			// @ts-ignore
			const [fileHandle] = await window.showOpenFilePicker(options);
			const file = await fileHandle.getFile();
			const content = await file.text();
			const data = JSON.parse(content);

			return { success: true, data, fileName: file.name };
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') {
				return { success: false, error: 'キャンセルされました' };
			}
			console.log('File System Access API failed, falling back to input element');
		}
	}

	// 従来のinput要素を使った方法（フォールバック）
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (file) {
				try {
					const content = await file.text();
					const data = JSON.parse(content);
					resolve({ success: true, data, fileName: file.name });
				} catch (err) {
					resolve({
						success: false,
						error: err instanceof Error ? err.message : '読み込みに失敗しました'
					});
				}
			} else {
				resolve({ success: false, error: 'ファイルが選択されませんでした' });
			}
		};
		input.oncancel = () => {
			resolve({ success: false, error: 'キャンセルされました' });
		};
		input.click();
	});
}

// スライドデータを自動保存するファイル名
export function getSlideDataFileName(projectId: string): string {
	return `slide-data-${projectId}.json`;
}

// フォルダ内のHTMLファイル一覧を取得
export async function listHtmlFiles(): Promise<{ success: boolean; files?: { name: string; content: string }[]; error?: string }> {
	if (!lastDirectoryHandle) {
		return { success: false, error: 'フォルダが選択されていません' };
	}

	try {
		const files: { name: string; content: string }[] = [];

		// フォルダ内のファイルを列挙
		for await (const entry of lastDirectoryHandle.values()) {
			if (entry.kind === 'file' && (entry.name.endsWith('.html') || entry.name.endsWith('.htm'))) {
				try {
					const file = await entry.getFile();
					const content = await file.text();
					files.push({ name: entry.name, content });
				} catch (e) {
					console.warn(`Failed to read file: ${entry.name}`, e);
				}
			}
		}

		// ファイル名でソート
		files.sort((a, b) => a.name.localeCompare(b.name));

		return { success: true, files };
	} catch (e) {
		console.error('Failed to list HTML files:', e);
		return { success: false, error: e instanceof Error ? e.message : 'ファイル一覧の取得に失敗しました' };
	}
}

// 複数の画像をZIPファイルとして保存
export async function saveImagesAsZip(
	folderPath: string,
	fileName: string,
	images: { name: string; dataUrl: string }[]
): Promise<{ success: boolean; filePath?: string; error?: string }> {
	// JSZipライブラリがない場合は個別保存にフォールバック
	// 簡易的な実装として、最初の画像のみを保存
	if (images.length === 0) {
		return { success: false, error: '保存する画像がありません' };
	}

	// 各画像を個別に保存
	const results: string[] = [];
	for (let i = 0; i < images.length; i++) {
		const img = images[i];
		const result = await saveImageFile(folderPath, img.name, img.dataUrl);
		if (result.success && result.filePath) {
			results.push(result.filePath);
		}
	}

	if (results.length > 0) {
		return {
			success: true,
			filePath: `${results.length}枚の画像を保存しました`
		};
	}

	return { success: false, error: '画像の保存に失敗しました' };
}

// プロジェクトのスライドデータファイルを読み込み
export async function loadSlideDataForProject(projectId: string): Promise<{
	success: boolean;
	data?: unknown;
	error?: string;
}> {
	if (!lastDirectoryHandle) {
		return { success: false, error: 'フォルダが選択されていません' };
	}

	try {
		const fileName = getSlideDataFileName(projectId);

		// フォルダ内のファイルを探す
		for await (const entry of lastDirectoryHandle.values()) {
			if (entry.kind === 'file' && entry.name === fileName) {
				const file = await entry.getFile();
				const content = await file.text();
				const data = JSON.parse(content);
				return { success: true, data };
			}
		}

		return { success: false, error: 'スライドデータファイルが見つかりません' };
	} catch (e) {
		console.error('Failed to load slide data:', e);
		return { success: false, error: e instanceof Error ? e.message : 'スライドデータの読み込みに失敗しました' };
	}
}

// ===== 動画データ保存・読み込み機能 =====

// 動画データファイル名を取得
export function getVideoDataFileName(projectId: string): string {
	return `video-data-${projectId}.json`;
}

// videoサブフォルダを取得または作成
async function getVideoSubfolder(): Promise<FileSystemDirectoryHandle | null> {
	if (!lastDirectoryHandle) return null;

	try {
		const videoFolder = await lastDirectoryHandle.getDirectoryHandle('video', { create: true });
		return videoFolder;
	} catch (e) {
		console.error('Failed to get/create video folder:', e);
		return null;
	}
}

// 動画プロジェクトデータの型
// 字幕エントリの型
export interface SubtitleEntry {
	id: string;
	sectionId: string;
	startTime: number;
	endTime: number;
	text: string;
}

export interface VideoProjectSaveData {
	sections: Array<{
		id: string;
		heading: string;
		headingLevel: number;
		textContent: string;
		script: string;
		selectedSlideId?: string;
		visualType: string;
		audioFileName?: string;
		imageFileName?: string;
		scriptFileName?: string;
		duration?: number; // 音声の長さ（秒）
	}>;
	sourceHtmlFileName?: string;
	speakerId: number;
	updatedAt: string;
	// 字幕データと設定
	subtitles?: SubtitleEntry[];
	subtitleSettings?: {
		maxCharsPerLine: number;
		playbackRate: number;
		splitByPunctuation: boolean;
	};
	// 手動編集された字幕テキスト（セクションID -> 字幕テキスト配列）
	customSubtitleTexts?: Record<string, string[]>;
	// スライドデータも保存
	slidePresentation?: {
		id: string;
		name: string;
		slides: Array<{
			id: string;
			name: string;
			elements: unknown[];
			background: unknown;
		}>;
	};
}

// 動画プロジェクトデータを保存（JSON形式）
export async function saveVideoProjectData(
	projectId: string,
	data: VideoProjectSaveData
): Promise<{ success: boolean; filePath?: string; error?: string }> {
	const videoFolder = await getVideoSubfolder();
	if (!videoFolder) {
		return { success: false, error: 'videoフォルダの作成に失敗しました' };
	}

	try {
		const fileName = getVideoDataFileName(projectId);
		const content = JSON.stringify(data, null, 2);

		const fileHandle = await videoFolder.getFileHandle(fileName, { create: true });
		const writable = await fileHandle.createWritable();
		await writable.write(content);
		await writable.close();

		return { success: true, filePath: `video/${fileName}` };
	} catch (e) {
		console.error('Failed to save video project data:', e);
		return { success: false, error: e instanceof Error ? e.message : '動画データの保存に失敗しました' };
	}
}

// 動画プロジェクトデータを読み込み
export async function loadVideoProjectData(projectId: string): Promise<{
	success: boolean;
	data?: VideoProjectSaveData;
	error?: string;
}> {
	const videoFolder = await getVideoSubfolder();
	if (!videoFolder) {
		return { success: false, error: 'videoフォルダが見つかりません' };
	}

	try {
		const fileName = getVideoDataFileName(projectId);
		const fileHandle = await videoFolder.getFileHandle(fileName);
		const file = await fileHandle.getFile();
		const content = await file.text();
		const data = JSON.parse(content);

		return { success: true, data };
	} catch (e) {
		if (e instanceof Error && e.name === 'NotFoundError') {
			return { success: false, error: '動画データファイルが見つかりません' };
		}
		console.error('Failed to load video project data:', e);
		return { success: false, error: e instanceof Error ? e.message : '動画データの読み込みに失敗しました' };
	}
}

// 音声ファイルを保存（WAV形式）
export async function saveVideoAudioFile(
	projectId: string,
	sectionId: string,
	audioData: ArrayBuffer
): Promise<{ success: boolean; fileName?: string; error?: string }> {
	const videoFolder = await getVideoSubfolder();
	if (!videoFolder) {
		return { success: false, error: 'videoフォルダの作成に失敗しました' };
	}

	try {
		const fileName = `audio-${projectId}-${sectionId}.wav`;
		const blob = new Blob([audioData], { type: 'audio/wav' });

		const fileHandle = await videoFolder.getFileHandle(fileName, { create: true });
		const writable = await fileHandle.createWritable();
		await writable.write(blob);
		await writable.close();

		return { success: true, fileName };
	} catch (e) {
		console.error('Failed to save audio file:', e);
		return { success: false, error: e instanceof Error ? e.message : '音声ファイルの保存に失敗しました' };
	}
}

// 音声ファイルを読み込み
export async function loadVideoAudioFile(fileName: string): Promise<{
	success: boolean;
	audioData?: ArrayBuffer;
	error?: string;
}> {
	const videoFolder = await getVideoSubfolder();
	if (!videoFolder) {
		return { success: false, error: 'videoフォルダが見つかりません' };
	}

	try {
		const fileHandle = await videoFolder.getFileHandle(fileName);
		const file = await fileHandle.getFile();
		const audioData = await file.arrayBuffer();

		return { success: true, audioData };
	} catch (e) {
		if (e instanceof Error && e.name === 'NotFoundError') {
			return { success: false, error: '音声ファイルが見つかりません' };
		}
		console.error('Failed to load audio file:', e);
		return { success: false, error: e instanceof Error ? e.message : '音声ファイルの読み込みに失敗しました' };
	}
}

// AI生成画像を保存（Base64またはURL）
export async function saveVideoImageFile(
	projectId: string,
	sectionId: string,
	imageData: string // Base64 data URL or URL
): Promise<{ success: boolean; fileName?: string; error?: string }> {
	const videoFolder = await getVideoSubfolder();
	if (!videoFolder) {
		return { success: false, error: 'videoフォルダの作成に失敗しました' };
	}

	try {
		const fileName = `image-${projectId}-${sectionId}.png`;
		let blob: Blob;

		// Base64 data URLの場合
		if (imageData.startsWith('data:')) {
			const response = await fetch(imageData);
			blob = await response.blob();
		} else {
			// 外部URLの場合（CORSの問題がある可能性）
			try {
				const response = await fetch(imageData);
				blob = await response.blob();
			} catch {
				// 外部URL取得に失敗した場合、URLをテキストとして保存
				const urlBlob = new Blob([imageData], { type: 'text/plain' });
				const urlFileName = `image-${projectId}-${sectionId}.url`;
				const fileHandle = await videoFolder.getFileHandle(urlFileName, { create: true });
				const writable = await fileHandle.createWritable();
				await writable.write(urlBlob);
				await writable.close();
				return { success: true, fileName: urlFileName };
			}
		}

		const fileHandle = await videoFolder.getFileHandle(fileName, { create: true });
		const writable = await fileHandle.createWritable();
		await writable.write(blob);
		await writable.close();

		return { success: true, fileName };
	} catch (e) {
		console.error('Failed to save image file:', e);
		return { success: false, error: e instanceof Error ? e.message : '画像ファイルの保存に失敗しました' };
	}
}

// 画像ファイルを読み込み（data URL形式で返す）
export async function loadVideoImageFile(fileName: string): Promise<{
	success: boolean;
	imageUrl?: string;
	error?: string;
}> {
	const videoFolder = await getVideoSubfolder();
	if (!videoFolder) {
		return { success: false, error: 'videoフォルダが見つかりません' };
	}

	try {
		const fileHandle = await videoFolder.getFileHandle(fileName);
		const file = await fileHandle.getFile();

		// .urlファイルの場合はテキストとして読み込み
		if (fileName.endsWith('.url')) {
			const url = await file.text();
			return { success: true, imageUrl: url };
		}

		// 画像ファイルの場合はdata URLに変換
		const arrayBuffer = await file.arrayBuffer();
		const blob = new Blob([arrayBuffer], { type: 'image/png' });
		const imageUrl = URL.createObjectURL(blob);

		return { success: true, imageUrl };
	} catch (e) {
		if (e instanceof Error && e.name === 'NotFoundError') {
			return { success: false, error: '画像ファイルが見つかりません' };
		}
		console.error('Failed to load image file:', e);
		return { success: false, error: e instanceof Error ? e.message : '画像ファイルの読み込みに失敗しました' };
	}
}

// フォルダを選択してvideoサブフォルダから動画データを読み込み（独立したフォルダ選択）
export async function selectAndLoadVideoProject(projectId: string): Promise<{
	success: boolean;
	folderName?: string;
	data?: VideoProjectSaveData;
	audioFiles?: Map<string, ArrayBuffer>;
	imageFiles?: Map<string, string>;
	error?: string;
}> {
	// @ts-ignore - File System Access API
	if (!('showDirectoryPicker' in window)) {
		return { success: false, error: 'File System Access APIに対応していないブラウザです' };
	}

	try {
		// フォルダを選択（読み書き権限で開く）
		// @ts-ignore
		const selectedFolder: FileSystemDirectoryHandle = await window.showDirectoryPicker({
			mode: 'readwrite'
		});

		// lastDirectoryHandleを設定（保存時にも使えるように）
		lastDirectoryHandle = selectedFolder;

		// videoサブフォルダを取得
		let videoFolder: FileSystemDirectoryHandle;
		try {
			videoFolder = await selectedFolder.getDirectoryHandle('video');
		} catch (e) {
			return { success: false, error: '選択したフォルダにvideoサブフォルダがありません' };
		}

		// プロジェクトデータファイルを読み込み
		const fileName = getVideoDataFileName(projectId);
		let data: VideoProjectSaveData;

		try {
			const fileHandle = await videoFolder.getFileHandle(fileName);
			const file = await fileHandle.getFile();
			const content = await file.text();
			data = JSON.parse(content);
		} catch (e) {
			return { success: false, error: `動画データファイル(${fileName})が見つかりません` };
		}

		// 音声ファイルを読み込み
		const audioFiles = new Map<string, ArrayBuffer>();
		for (const section of data.sections) {
			if (section.audioFileName) {
				try {
					const audioHandle = await videoFolder.getFileHandle(section.audioFileName);
					const audioFile = await audioHandle.getFile();
					const audioData = await audioFile.arrayBuffer();
					audioFiles.set(section.audioFileName, audioData);
				} catch (e) {
					console.warn(`Audio file not found: ${section.audioFileName}`);
				}
			}
		}

		// 画像ファイルを読み込み
		const imageFiles = new Map<string, string>();
		for (const section of data.sections) {
			if (section.imageFileName) {
				try {
					const imageHandle = await videoFolder.getFileHandle(section.imageFileName);
					const imageFile = await imageHandle.getFile();

					if (section.imageFileName.endsWith('.url')) {
						const url = await imageFile.text();
						imageFiles.set(section.imageFileName, url);
					} else {
						const arrayBuffer = await imageFile.arrayBuffer();
						const blob = new Blob([arrayBuffer], { type: 'image/png' });
						const imageUrl = URL.createObjectURL(blob);
						imageFiles.set(section.imageFileName, imageUrl);
					}
				} catch (e) {
					console.warn(`Image file not found: ${section.imageFileName}`);
				}
			}
		}

		return {
			success: true,
			folderName: selectedFolder.name,
			data,
			audioFiles,
			imageFiles
		};
	} catch (e) {
		if (e instanceof Error && e.name === 'AbortError') {
			return { success: false, error: 'フォルダ選択がキャンセルされました' };
		}
		console.error('Failed to select and load video project:', e);
		return { success: false, error: e instanceof Error ? e.message : '読み込みに失敗しました' };
	}
}
