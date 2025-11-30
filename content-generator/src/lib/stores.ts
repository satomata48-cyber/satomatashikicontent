import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

// コンテンツタイプ
export type ContentType = 'blog' | 'ebook' | 'video' | 'image' | 'slide-canvas';

// コンテンツアイテム（プロジェクト内の各コンテンツ）
export interface ContentItem {
	id: string;
	type: ContentType;
	title: string;
	content: string;
	filePath?: string; // 保存されたファイルのパス
	fileName?: string; // ファイル名
	createdAt: Date;
	updatedAt?: Date;
	status: 'completed' | 'generating' | 'draft';
}

// プロジェクト
export interface Project {
	id: string;
	name: string;
	description: string;
	tags: string[];
	folderPath: string;
	contents: ContentItem[];
	createdAt: Date;
	updatedAt: Date;
}

// LocalStorageのキー
const STORAGE_KEYS = {
	projects: 'ai-content-generator-projects',
	apiSettings: 'ai-content-generator-api-settings',
	dataFolderHandle: 'ai-content-generator-data-folder'
};

// プロジェクトデータファイル名
const PROJECTS_FILE_NAME = 'projects-data.json';

// データ保存用フォルダハンドル
let dataFolderHandle: FileSystemDirectoryHandle | null = null;

// IndexedDB名とストア名
const IDB_NAME = 'ai-content-generator-db';
const IDB_STORE_NAME = 'folder-handles';

// IndexedDBを開く
function openDatabase(): Promise<IDBDatabase> {
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
		const db = await openDatabase();
		const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
		const store = tx.objectStore(IDB_STORE_NAME);
		store.put(handle, 'dataFolder');
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
		const db = await openDatabase();
		const tx = db.transaction(IDB_STORE_NAME, 'readonly');
		const store = tx.objectStore(IDB_STORE_NAME);
		const request = store.get('dataFolder');
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

// ファイルからプロジェクトを読み込み
async function loadProjectsFromFile(): Promise<Project[]> {
	if (!dataFolderHandle) return [];
	try {
		const fileHandle = await dataFolderHandle.getFileHandle(PROJECTS_FILE_NAME);
		const file = await fileHandle.getFile();
		const content = await file.text();
		const projects = JSON.parse(content);
		// Date型を復元
		return projects.map((p: Project) => ({
			...p,
			createdAt: new Date(p.createdAt),
			updatedAt: new Date(p.updatedAt),
			contents: p.contents.map((c: ContentItem) => ({
				...c,
				createdAt: new Date(c.createdAt)
			}))
		}));
	} catch (e) {
		// ファイルが存在しない場合は空配列を返す
		if (e instanceof Error && e.name === 'NotFoundError') {
			return [];
		}
		console.error('Failed to load projects from file:', e);
		return [];
	}
}

// ファイルにプロジェクトを保存
async function saveProjectsToFile(projects: Project[]) {
	if (!dataFolderHandle) {
		console.log('No data folder selected, saving to localStorage only');
		return;
	}
	try {
		const fileHandle = await dataFolderHandle.getFileHandle(PROJECTS_FILE_NAME, { create: true });
		const writable = await fileHandle.createWritable();
		await writable.write(JSON.stringify(projects, null, 2));
		await writable.close();
		console.log('Projects saved to file successfully');
	} catch (e) {
		console.error('Failed to save projects to file:', e);
	}
}

// LocalStorageからプロジェクトを読み込み（フォールバック用）
function loadProjects(): Project[] {
	if (!browser) return [];
	try {
		const data = localStorage.getItem(STORAGE_KEYS.projects);
		if (!data) return [];
		const projects = JSON.parse(data);
		// Date型を復元
		return projects.map((p: Project) => ({
			...p,
			createdAt: new Date(p.createdAt),
			updatedAt: new Date(p.updatedAt),
			contents: p.contents.map((c: ContentItem) => ({
				...c,
				createdAt: new Date(c.createdAt)
			}))
		}));
	} catch (e) {
		console.error('Failed to load projects from localStorage:', e);
		return [];
	}
}

// LocalStorageにプロジェクトを保存（フォールバック用）
function saveProjects(projects: Project[]) {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEYS.projects, JSON.stringify(projects));
	} catch (e) {
		console.error('Failed to save projects to localStorage:', e);
	}
}

function createProjectStore() {
	const initialProjects = loadProjects();
	const { subscribe, set, update } = writable<Project[]>(initialProjects);

	// ストアの変更を監視してLocalStorageとファイルに保存
	subscribe(projects => {
		saveProjects(projects);
		// ファイルへの保存も実行
		saveProjectsToFile(projects);
	});

	return {
		subscribe,
		add: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'contents'>) => {
			const now = new Date();
			update(projects => [
				{
					...project,
					id: crypto.randomUUID(),
					folderPath: project.folderPath || '',
					contents: [],
					createdAt: now,
					updatedAt: now
				},
				...projects
			]);
		},
		remove: (id: string) => {
			update(projects => projects.filter(p => p.id !== id));
		},
		addContent: (projectId: string, content: Omit<ContentItem, 'id' | 'createdAt'>) => {
			update(projects => projects.map(p => {
				if (p.id === projectId) {
					return {
						...p,
						contents: [
							{
								...content,
								id: crypto.randomUUID(),
								createdAt: new Date()
							},
							...p.contents
						],
						updatedAt: new Date()
					};
				}
				return p;
			}));
		},
		removeContent: (projectId: string, contentId: string) => {
			update(projects => projects.map(p => {
				if (p.id === projectId) {
					return {
						...p,
						contents: p.contents.filter(c => c.id !== contentId),
						updatedAt: new Date()
					};
				}
				return p;
			}));
		},
		updateContent: (projectId: string, contentId: string, updates: Partial<Pick<ContentItem, 'title' | 'content' | 'filePath' | 'fileName' | 'status'>>) => {
			update(projects => projects.map(p => {
				if (p.id === projectId) {
					return {
						...p,
						contents: p.contents.map(c => {
							if (c.id === contentId) {
								return { ...c, ...updates, updatedAt: new Date() };
							}
							return c;
						}),
						updatedAt: new Date()
					};
				}
				return p;
			}));
		},
		getContent: (projectId: string, contentId: string): ContentItem | undefined => {
			let found: ContentItem | undefined;
			update(projects => {
				const project = projects.find(p => p.id === projectId);
				found = project?.contents.find(c => c.id === contentId);
				return projects;
			});
			return found;
		},
		updateProject: (id: string, updates: Partial<Pick<Project, 'name' | 'description' | 'tags' | 'folderPath'>>) => {
			update(projects => projects.map(p => {
				if (p.id === id) {
					return { ...p, ...updates, updatedAt: new Date() };
				}
				return p;
			}));
		},
		clear: () => set([]),
		// 手動でLocalStorageから再読み込み
		reload: () => {
			const projects = loadProjects();
			set(projects);
		},
		// ファイルからプロジェクトを読み込み
		loadFromFile: async () => {
			const projects = await loadProjectsFromFile();
			if (projects.length > 0) {
				set(projects);
				// LocalStorageにも同期
				saveProjects(projects);
			}
		},
		// ファイルに強制保存
		saveToFile: async () => {
			const currentProjects = get({ subscribe });
			await saveProjectsToFile(currentProjects);
		}
	};
}

export const projectStore = createProjectStore();

// 全タグを取得
export const allTags = derived(projectStore, ($projects) => {
	const tagSet = new Set<string>();
	$projects.forEach(project => {
		project.tags.forEach(tag => tagSet.add(tag));
	});
	return Array.from(tagSet).sort();
});

// 選択されたタグ
export const selectedTags = writable<string[]>([]);

// フィルタリングされたプロジェクト
export const filteredProjects = derived(
	[projectStore, selectedTags],
	([$projects, $selectedTags]) => {
		if ($selectedTags.length === 0) {
			return $projects;
		}
		return $projects.filter(project =>
			$selectedTags.some(tag => project.tags.includes(tag))
		);
	}
);

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
		const data = localStorage.getItem(STORAGE_KEYS.apiSettings);
		if (!data) {
			return defaultSettings;
		}
		const settings = JSON.parse(data);
		// APIキーはシステム埋め込みを使用、モデル選択のみ復元
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
		localStorage.setItem(STORAGE_KEYS.apiSettings, JSON.stringify(settings));
	} catch (e) {
		console.error('Failed to save API settings to localStorage:', e);
	}
}

function createApiSettingsStore() {
	const initialSettings = loadApiSettings();
	const { subscribe, set, update } = writable<ApiSettings>(initialSettings);

	// ストアの変更を監視してLocalStorageに保存
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
