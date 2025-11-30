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
		return {
			success: false,
			error: '保存先フォルダを選択してください。'
		};
	}

	try {
		// フォルダ内にファイルを作成
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
