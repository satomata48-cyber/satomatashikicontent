// IndexedDBを使った設定データの永続化
import { browser } from '$app/environment';

const DB_NAME = 'content-generator-db';
const DB_VERSION = 1;
const SETTINGS_STORE = 'settings';

let db: IDBDatabase | null = null;

// データベースを開く
export async function openDatabase(): Promise<IDBDatabase> {
	if (db) return db;
	if (!browser) throw new Error('IndexedDB is only available in browser');

	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			db = request.result;
			resolve(db);
		};

		request.onupgradeneeded = (event) => {
			const database = (event.target as IDBOpenDBRequest).result;

			// 設定ストア
			if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
				database.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
			}
		};
	});
}

// 設定を保存
export async function saveSetting(key: string, value: unknown): Promise<void> {
	if (!browser) return;

	try {
		const database = await openDatabase();
		return new Promise((resolve, reject) => {
			const tx = database.transaction(SETTINGS_STORE, 'readwrite');
			const store = tx.objectStore(SETTINGS_STORE);
			const request = store.put({ key, value });

			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	} catch (e) {
		console.error('Failed to save setting to IndexedDB:', e);
	}
}

// 設定を取得
export async function getSetting<T>(key: string): Promise<T | null> {
	if (!browser) return null;

	try {
		const database = await openDatabase();
		return new Promise((resolve, reject) => {
			const tx = database.transaction(SETTINGS_STORE, 'readonly');
			const store = tx.objectStore(SETTINGS_STORE);
			const request = store.get(key);

			request.onsuccess = () => {
				const result = request.result;
				resolve(result ? result.value : null);
			};
			request.onerror = () => reject(request.error);
		});
	} catch (e) {
		console.error('Failed to get setting from IndexedDB:', e);
		return null;
	}
}

// データベースを初期化（テスト用）
export async function clearAllData(): Promise<void> {
	if (!browser) return;

	try {
		const database = await openDatabase();
		return new Promise((resolve, reject) => {
			const tx = database.transaction([SETTINGS_STORE], 'readwrite');
			tx.objectStore(SETTINGS_STORE).clear();

			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	} catch (e) {
		console.error('Failed to clear IndexedDB:', e);
	}
}
