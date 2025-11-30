// IndexedDBを使ったプロジェクトデータの永続化
import { browser } from '$app/environment';

const DB_NAME = 'content-generator-db';
const DB_VERSION = 1;
const PROJECTS_STORE = 'projects';
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

			// プロジェクトストア
			if (!database.objectStoreNames.contains(PROJECTS_STORE)) {
				const projectStore = database.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
				projectStore.createIndex('name', 'name', { unique: false });
				projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
				projectStore.createIndex('createdAt', 'createdAt', { unique: false });
			}

			// 設定ストア
			if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
				database.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
			}
		};
	});
}

// プロジェクト型（stores.tsと同じ）
export interface ProjectData {
	id: string;
	name: string;
	description: string;
	tags: string[];
	folderPath: string;
	contents: ContentItemData[];
	createdAt: string; // ISO string for storage
	updatedAt: string;
}

export interface ContentItemData {
	id: string;
	type: string;
	title: string;
	content: string;
	filePath?: string;
	fileName?: string;
	createdAt: string;
	updatedAt?: string;
	status: string;
}

// 全プロジェクトを取得
export async function getAllProjects(): Promise<ProjectData[]> {
	if (!browser) return [];

	try {
		const database = await openDatabase();
		return new Promise((resolve, reject) => {
			const tx = database.transaction(PROJECTS_STORE, 'readonly');
			const store = tx.objectStore(PROJECTS_STORE);
			const request = store.getAll();

			request.onsuccess = () => {
				const projects = request.result || [];
				// updatedAtで降順ソート
				projects.sort((a, b) =>
					new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
				);
				resolve(projects);
			};
			request.onerror = () => reject(request.error);
		});
	} catch (e) {
		console.error('Failed to get projects from IndexedDB:', e);
		return [];
	}
}

// プロジェクトを保存（追加または更新）
export async function saveProject(project: ProjectData): Promise<void> {
	if (!browser) return;

	try {
		const database = await openDatabase();
		return new Promise((resolve, reject) => {
			const tx = database.transaction(PROJECTS_STORE, 'readwrite');
			const store = tx.objectStore(PROJECTS_STORE);
			const request = store.put(project);

			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	} catch (e) {
		console.error('Failed to save project to IndexedDB:', e);
		throw e;
	}
}

// プロジェクトを削除
export async function deleteProject(id: string): Promise<void> {
	if (!browser) return;

	try {
		const database = await openDatabase();
		return new Promise((resolve, reject) => {
			const tx = database.transaction(PROJECTS_STORE, 'readwrite');
			const store = tx.objectStore(PROJECTS_STORE);
			const request = store.delete(id);

			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	} catch (e) {
		console.error('Failed to delete project from IndexedDB:', e);
		throw e;
	}
}

// プロジェクトを取得
export async function getProject(id: string): Promise<ProjectData | null> {
	if (!browser) return null;

	try {
		const database = await openDatabase();
		return new Promise((resolve, reject) => {
			const tx = database.transaction(PROJECTS_STORE, 'readonly');
			const store = tx.objectStore(PROJECTS_STORE);
			const request = store.get(id);

			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error);
		});
	} catch (e) {
		console.error('Failed to get project from IndexedDB:', e);
		return null;
	}
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
			const tx = database.transaction([PROJECTS_STORE, SETTINGS_STORE], 'readwrite');
			tx.objectStore(PROJECTS_STORE).clear();
			tx.objectStore(SETTINGS_STORE).clear();

			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	} catch (e) {
		console.error('Failed to clear IndexedDB:', e);
	}
}
