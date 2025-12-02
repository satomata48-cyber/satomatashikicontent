// 台本ファイル保存・読み込み機能
// video/+page.svelteで使用

import { getLastDirectoryHandle } from './filesystem';

// videoサブフォルダを取得または作成
async function getVideoSubfolder(): Promise<FileSystemDirectoryHandle | null> {
	const lastDirectoryHandle = getLastDirectoryHandle();
	if (!lastDirectoryHandle) return null;

	try {
		const videoFolder = await lastDirectoryHandle.getDirectoryHandle('video', { create: true });
		return videoFolder;
	} catch (e) {
		console.error('Failed to get/create video folder:', e);
		return null;
	}
}

// 台本テキストファイルを保存
export async function saveVideoScriptFile(
	projectId: string,
	sectionId: string,
	script: string,
	heading: string
): Promise<{ success: boolean; fileName?: string; error?: string }> {
	const videoFolder = await getVideoSubfolder();
	if (!videoFolder) {
		return { success: false, error: 'videoフォルダの作成に失敗しました' };
	}

	try {
		const fileName = `script-${projectId}-${sectionId}.txt`;
		// 台本内容にヘッダー情報を追加
		const content = `# ${heading}\n\n${script}`;
		const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });

		const fileHandle = await videoFolder.getFileHandle(fileName, { create: true });
		const writable = await fileHandle.createWritable();
		await writable.write(blob);
		await writable.close();

		return { success: true, fileName };
	} catch (e) {
		console.error('Failed to save script file:', e);
		return { success: false, error: e instanceof Error ? e.message : '台本ファイルの保存に失敗しました' };
	}
}

// 台本テキストファイルを読み込み
export async function loadVideoScriptFile(fileName: string): Promise<{
	success: boolean;
	script?: string;
	heading?: string;
	error?: string;
}> {
	const videoFolder = await getVideoSubfolder();
	if (!videoFolder) {
		return { success: false, error: 'videoフォルダが見つかりません' };
	}

	try {
		const fileHandle = await videoFolder.getFileHandle(fileName);
		const file = await fileHandle.getFile();
		const content = await file.text();

		// ヘッダー情報を解析
		const lines = content.split('\n');
		let heading = '';
		let scriptText = content;

		if (lines[0]?.startsWith('# ')) {
			heading = lines[0].substring(2).trim();
			scriptText = lines.slice(2).join('\n').trim();
		}

		return { success: true, script: scriptText, heading };
	} catch (e) {
		if (e instanceof Error && e.name === 'NotFoundError') {
			return { success: false, error: '台本ファイルが見つかりません' };
		}
		console.error('Failed to load script file:', e);
		return { success: false, error: e instanceof Error ? e.message : '台本ファイルの読み込みに失敗しました' };
	}
}

// videoサブフォルダから台本ファイルを読み込み（選択したフォルダから）
export async function loadScriptFilesFromFolder(
	videoFolder: FileSystemDirectoryHandle,
	sectionIds: string[]
): Promise<Map<string, { script: string; heading: string }>> {
	const scriptFiles = new Map<string, { script: string; heading: string }>();

	for await (const entry of videoFolder.values()) {
		if (entry.kind === 'file' && entry.name.startsWith('script-') && entry.name.endsWith('.txt')) {
			try {
				const file = await entry.getFile();
				const content = await file.text();

				// ヘッダー情報を解析
				const lines = content.split('\n');
				let heading = '';
				let scriptText = content;

				if (lines[0]?.startsWith('# ')) {
					heading = lines[0].substring(2).trim();
					scriptText = lines.slice(2).join('\n').trim();
				}

				scriptFiles.set(entry.name, { script: scriptText, heading });
			} catch (e) {
				console.warn(`Failed to load script file: ${entry.name}`, e);
			}
		}
	}

	return scriptFiles;
}
