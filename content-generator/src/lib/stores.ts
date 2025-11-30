import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { setLastDirectoryHandle } from './filesystem';
import {
	getAllProjects,
	saveProject as dbSaveProject,
	deleteProject as dbDeleteProject,
	getProject as dbGetProject,
	saveSetting,
	getSetting,
	type ProjectData,
	type ContentItemData
} from './database';

// コンテンツタイプ
export type ContentType = 'blog' | 'ebook' | 'video' | 'image' | 'slide-canvas';

// コンテンツアイテム（プロジェクト内の各コンテンツ）
export interface ContentItem {
	id: string;
	type: ContentType;
	title: string;
	content: string;
	filePath?: string;
	fileName?: string;
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

// データ保存用フォルダハンドル（コンテンツファイル保存用）
let dataFolderHandle: FileSystemDirectoryHandle | null = null;

// IndexedDBのキー
const FOLDER_HANDLE_KEY = 'dataFolderHandle';

// Project <-> ProjectData 変換
function projectToData(p: Project): ProjectData {
	return {
		...p,
		createdAt: p.createdAt.toISOString(),
		updatedAt: p.updatedAt.toISOString(),
		contents: p.contents.map(c => ({
			...c,
			createdAt: c.createdAt.toISOString(),
			updatedAt: c.updatedAt?.toISOString()
		}))
	};
}

function dataToProject(d: ProjectData): Project {
	return {
		...d,
		createdAt: new Date(d.createdAt),
		updatedAt: new Date(d.updatedAt),
		contents: d.contents.map(c => ({
			...c,
			type: c.type as ContentType,
			status: c.status as 'completed' | 'generating' | 'draft',
			createdAt: new Date(c.createdAt),
			updatedAt: c.updatedAt ? new Date(c.updatedAt) : undefined
		}))
	};
}

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

// プロジェクトストアを作成
function createProjectStore() {
	const { subscribe, set, update } = writable<Project[]>([]);

	// IndexedDBからプロジェクトを読み込み
	async function loadFromDB() {
		if (!browser) return;
		try {
			const projectsData = await getAllProjects();
			const projects = projectsData.map(dataToProject);
			set(projects);
			console.log(`Loaded ${projects.length} projects from IndexedDB`);
		} catch (e) {
			console.error('Failed to load projects from IndexedDB:', e);
		}
	}

	// プロジェクトをDBに保存
	async function saveToDB(project: Project) {
		try {
			await dbSaveProject(projectToData(project));
		} catch (e) {
			console.error('Failed to save project to IndexedDB:', e);
		}
	}

	return {
		subscribe,

		// 初期化（起動時に呼ぶ）
		init: loadFromDB,

		add: async (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'contents'>) => {
			const now = new Date();
			const newProject: Project = {
				...project,
				id: crypto.randomUUID(),
				folderPath: project.folderPath || '',
				contents: [],
				createdAt: now,
				updatedAt: now
			};

			update(projects => [newProject, ...projects]);
			await saveToDB(newProject);
		},

		remove: async (id: string) => {
			update(projects => projects.filter(p => p.id !== id));
			await dbDeleteProject(id);
		},

		addContent: async (projectId: string, content: Omit<ContentItem, 'id' | 'createdAt'>) => {
			let updatedProject: Project | null = null;

			update(projects => projects.map(p => {
				if (p.id === projectId) {
					updatedProject = {
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
					return updatedProject;
				}
				return p;
			}));

			if (updatedProject) {
				await saveToDB(updatedProject);
			}
		},

		removeContent: async (projectId: string, contentId: string) => {
			let updatedProject: Project | null = null;

			update(projects => projects.map(p => {
				if (p.id === projectId) {
					updatedProject = {
						...p,
						contents: p.contents.filter(c => c.id !== contentId),
						updatedAt: new Date()
					};
					return updatedProject;
				}
				return p;
			}));

			if (updatedProject) {
				await saveToDB(updatedProject);
			}
		},

		updateContent: async (
			projectId: string,
			contentId: string,
			updates: Partial<Pick<ContentItem, 'title' | 'content' | 'filePath' | 'fileName' | 'status'>>
		) => {
			let updatedProject: Project | null = null;

			update(projects => projects.map(p => {
				if (p.id === projectId) {
					updatedProject = {
						...p,
						contents: p.contents.map(c => {
							if (c.id === contentId) {
								return { ...c, ...updates, updatedAt: new Date() };
							}
							return c;
						}),
						updatedAt: new Date()
					};
					return updatedProject;
				}
				return p;
			}));

			if (updatedProject) {
				await saveToDB(updatedProject);
			}
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

		updateProject: async (
			id: string,
			updates: Partial<Pick<Project, 'name' | 'description' | 'tags' | 'folderPath'>>
		) => {
			let updatedProject: Project | null = null;

			update(projects => projects.map(p => {
				if (p.id === id) {
					updatedProject = { ...p, ...updates, updatedAt: new Date() };
					return updatedProject;
				}
				return p;
			}));

			if (updatedProject) {
				await saveToDB(updatedProject);
			}
		},

		clear: () => set([]),

		// DBから再読み込み
		reload: loadFromDB
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
