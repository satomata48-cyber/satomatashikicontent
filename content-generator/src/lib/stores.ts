import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { setLastDirectoryHandle } from './filesystem';

// コンテンツタイプ
export type ContentType = 'blog' | 'ebook' | 'video' | 'image' | 'slide-canvas';

// データ保存用フォルダハンドル（コンテンツファイル保存用）
let dataFolderHandle: FileSystemDirectoryHandle | null = null;

// IndexedDBのキー
const FOLDER_HANDLE_KEY = 'dataFolderHandle';

// IndexedDB名とストア名（フォルダハンドル用）
const IDB_NAME = 'ai-content-generator-db';
const IDB_STORE_NAME = 'folder-handles';

// IndexedDBを開く（フォルダハンドル用）
function openHandleDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(IDB_NAME, 1);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
				db.createObjectStore(IDB_STORE_NAME);
			}
		};
	});
}

// フォルダハンドルをIndexedDBに保存
async function saveFolderHandleToIDB(handle: FileSystemDirectoryHandle) {
	if (!browser) return;
	try {
		const db = await openHandleDatabase();
		const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
		const store = tx.objectStore(IDB_STORE_NAME);
		store.put(handle, FOLDER_HANDLE_KEY);
		await new Promise((resolve, reject) => {
			tx.oncomplete = resolve;
			tx.onerror = () => reject(tx.error);
		});
		db.close();
		console.log('Folder handle saved to IndexedDB');
	} catch (e) {
		console.error('Failed to save folder handle to IndexedDB:', e);
	}
}

// IndexedDBからフォルダハンドルを読み込み
async function loadFolderHandleFromIDB(): Promise<FileSystemDirectoryHandle | null> {
	if (!browser) return null;
	try {
		const db = await openHandleDatabase();
		const tx = db.transaction(IDB_STORE_NAME, 'readonly');
		const store = tx.objectStore(IDB_STORE_NAME);
		const request = store.get(FOLDER_HANDLE_KEY);
		const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error);
		});
		db.close();
		return handle;
	} catch (e) {
		console.error('Failed to load folder handle from IndexedDB:', e);
		return null;
	}
}

// フォルダハンドルの権限を確認・リクエスト
async function verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
	try {
		// @ts-ignore - File System Access API
		const options = { mode: 'readwrite' };
		// @ts-ignore
		if ((await handle.queryPermission(options)) === 'granted') {
			return true;
		}
		// @ts-ignore
		if ((await handle.requestPermission(options)) === 'granted') {
			return true;
		}
		return false;
	} catch (e) {
		console.error('Permission verification failed:', e);
		return false;
	}
}

// データフォルダハンドルを設定
export function setDataFolderHandle(handle: FileSystemDirectoryHandle | null) {
	dataFolderHandle = handle;
	// filesystem.tsのlastDirectoryHandleも同期
	setLastDirectoryHandle(handle);
	if (handle) {
		saveFolderHandleToIDB(handle);
	}
}

// データフォルダハンドルを取得
export function getDataFolderHandle(): FileSystemDirectoryHandle | null {
	return dataFolderHandle;
}

// 起動時にフォルダハンドルを復元
export async function restoreDataFolderHandle(): Promise<boolean> {
	if (!browser) return false;
	try {
		const handle = await loadFolderHandleFromIDB();
		if (handle) {
			const hasPermission = await verifyPermission(handle);
			if (hasPermission) {
				dataFolderHandle = handle;
				// filesystem.tsのlastDirectoryHandleも同期
				setLastDirectoryHandle(handle);
				console.log('Folder handle restored from IndexedDB:', handle.name);
				return true;
			} else {
				console.log('Permission denied for stored folder handle');
			}
		}
		return false;
	} catch (e) {
		console.error('Failed to restore folder handle:', e);
		return false;
	}
}

// API設定ストア
export interface ApiSettings {
	apiKey: string;
	model: string;
	isConnected: boolean;
}

// システムAPIキー（環境変数から読み込み）
export const SYSTEM_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || '';

// LocalStorageからAPI設定を読み込み（モデル選択のみ保存）
function loadApiSettings(): ApiSettings {
	const defaultSettings: ApiSettings = {
		apiKey: SYSTEM_API_KEY,
		model: 'anthropic/claude-3.5-sonnet',
		isConnected: true
	};

	if (!browser) {
		return defaultSettings;
	}
	try {
		const data = localStorage.getItem('ai-content-generator-api-settings');
		if (!data) {
			return defaultSettings;
		}
		const settings = JSON.parse(data);
		return {
			apiKey: SYSTEM_API_KEY,
			model: settings.model || 'anthropic/claude-3.5-sonnet',
			isConnected: true
		};
	} catch (e) {
		console.error('Failed to load API settings from localStorage:', e);
		return defaultSettings;
	}
}

// LocalStorageにAPI設定を保存
function saveApiSettings(settings: ApiSettings) {
	if (!browser) return;
	try {
		localStorage.setItem('ai-content-generator-api-settings', JSON.stringify(settings));
	} catch (e) {
		console.error('Failed to save API settings to localStorage:', e);
	}
}

function createApiSettingsStore() {
	const initialSettings = loadApiSettings();
	const { subscribe, set, update } = writable<ApiSettings>(initialSettings);

	subscribe(settings => {
		saveApiSettings(settings);
	});

	return {
		subscribe,
		set,
		update
	};
}

export const apiSettings = createApiSettingsStore();
