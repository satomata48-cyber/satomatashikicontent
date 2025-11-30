<script lang="ts">
	import { onMount } from 'svelte';
	import { projectStore, allTags, selectedTags, filteredProjects, type Project, setDataFolderHandle, getDataFolderHandle, restoreDataFolderHandle } from '$lib/stores';

	let showCreateProject = $state(false);
	let errorMessage = $state('');
	let isDataFolderSet = $state(false);
	let dataFolderName = $state('');
	let isLoadingData = $state(false);
	let isInitializing = $state(true);

	// プロジェクト作成フォーム
	let projectName = $state('');
	let projectDescription = $state('');
	let projectTags = $state('');
	let projectFolderPath = $state('');

	// ストアからの値
	let projects: Project[] = $state([]);
	let tags: string[] = $state([]);
	let activeTags: string[] = $state([]);

	filteredProjects.subscribe(value => projects = value);
	allTags.subscribe(value => tags = value);
	selectedTags.subscribe(value => activeTags = value);

	onMount(async () => {
		// 起動時にフォルダハンドルを自動復元
		try {
			const restored = await restoreDataFolderHandle();
			if (restored) {
				const handle = getDataFolderHandle();
				if (handle) {
					isDataFolderSet = true;
					dataFolderName = handle.name;
					// ファイルからプロジェクトを読み込み
					await projectStore.loadFromFile();
				}
			}
		} catch (e) {
			console.error('Failed to restore data folder:', e);
		} finally {
			isInitializing = false;
		}
	});

	// データフォルダを選択
	async function selectDataFolder() {
		try {
			isLoadingData = true;
			// @ts-ignore - File System Access API
			const dirHandle: FileSystemDirectoryHandle = await window.showDirectoryPicker({
				mode: 'readwrite'
			});
			setDataFolderHandle(dirHandle);
			isDataFolderSet = true;
			dataFolderName = dirHandle.name;

			// ファイルからプロジェクトを読み込み
			await projectStore.loadFromFile();
		} catch (e) {
			if (e instanceof Error && e.name !== 'AbortError') {
				errorMessage = 'フォルダ選択に失敗しました';
			}
		} finally {
			isLoadingData = false;
		}
	}

	function parseTags(input: string): string[] {
		return input.split(',').map(t => t.trim()).filter(t => t.length > 0);
	}

	function createProject() {
		if (!projectName.trim()) {
			errorMessage = 'プロジェクト名を入力してください';
			return;
		}

		projectStore.add({
			name: projectName.trim(),
			description: projectDescription.trim(),
			tags: parseTags(projectTags),
			folderPath: projectFolderPath.trim()
		});

		// リセット
		projectName = '';
		projectDescription = '';
		projectTags = '';
		projectFolderPath = '';
		showCreateProject = false;
	}

	async function selectFolder() {
		try {
			// @ts-ignore - File System Access API
			const dirHandle = await window.showDirectoryPicker();
			projectFolderPath = dirHandle.name;
		} catch (e) {
			console.log('フォルダ選択がキャンセルされました');
		}
	}

	function toggleTag(tag: string) {
		if (activeTags.includes(tag)) {
			selectedTags.set(activeTags.filter(t => t !== tag));
		} else {
			selectedTags.set([...activeTags, tag]);
		}
	}

	function clearTagFilter() {
		selectedTags.set([]);
	}

	function formatDate(date: Date) {
		return new Date(date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
	}

	function deleteProject(id: string) {
		if (confirm('このプロジェクトを削除しますか？')) {
			projectStore.remove(id);
		}
	}

	function getContentCount(project: Project) {
		return project.contents.length;
	}

	function getContentTypeCounts(project: Project) {
		const counts = { blog: 0, ebook: 0, video: 0, image: 0, slide: 0 };
		project.contents.forEach(c => {
			if (c.type in counts) counts[c.type as keyof typeof counts]++;
		});
		return counts;
	}
</script>

<div class="min-h-screen bg-gray-900 text-white">
	<!-- 初期化中のローディング表示 -->
	{#if isInitializing}
		<div class="fixed inset-0 bg-gray-900 flex items-center justify-center z-50">
			<div class="text-center">
				<span class="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full inline-block mb-4"></span>
				<p class="text-gray-400">データを読み込み中...</p>
			</div>
		</div>
	{/if}

	<!-- Header -->
	<header class="bg-gray-800 border-b border-gray-700 px-6 py-4">
		<div class="flex items-center justify-between">
			<h1 class="text-2xl font-bold text-blue-400">AI Content Generator</h1>
			<div class="flex items-center gap-4">
				<!-- データフォルダ選択 -->
				<button
					onclick={selectDataFolder}
					disabled={isLoadingData}
					class="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors {isDataFolderSet ? 'bg-purple-600/20 border border-purple-500 hover:bg-purple-600/30' : 'bg-orange-600 hover:bg-orange-700'}"
					title={isDataFolderSet ? `データ保存先: ${dataFolderName}` : 'データ保存先フォルダを選択'}
				>
					{#if isLoadingData}
						<span class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
					{:else}
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
						</svg>
					{/if}
					{#if isDataFolderSet}
						<span class="text-purple-400 text-sm font-medium">{dataFolderName}</span>
					{:else}
						<span class="text-white text-sm font-medium">データフォルダを選択</span>
					{/if}
				</button>
				<div class="flex items-center gap-2 px-4 py-2 bg-green-600/20 border border-green-500 rounded-lg">
					<svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
					</svg>
					<span class="text-green-400 text-sm font-medium">API接続済み</span>
				</div>
			</div>
		</div>
	</header>

	<!-- Create Project Modal -->
	{#if showCreateProject}
		<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
			<div class="bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-xl font-semibold">新規プロジェクト</h2>
					<button onclick={() => showCreateProject = false} class="text-gray-400 hover:text-white">
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
				<div class="space-y-4">
					<div>
						<label for="projectName" class="block text-sm text-gray-400 mb-2">プロジェクト名 *</label>
						<input id="projectName" type="text" bind:value={projectName} placeholder="例: AIマーケティング戦略" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500" />
					</div>
					<div>
						<label for="projectDesc" class="block text-sm text-gray-400 mb-2">説明</label>
						<textarea id="projectDesc" bind:value={projectDescription} placeholder="プロジェクトの概要..." rows="3" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 resize-none"></textarea>
					</div>
					<div>
						<label class="block text-sm text-gray-400 mb-2">保存先フォルダ</label>
						<div class="flex gap-2">
							<input
								type="text"
								bind:value={projectFolderPath}
								placeholder="フォルダを選択またはパスを入力"
								class="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
							/>
							<button
								type="button"
								onclick={selectFolder}
								class="px-4 py-3 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors flex items-center gap-2"
							>
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
								</svg>
								選択
							</button>
						</div>
						<p class="text-xs text-gray-500 mt-1">生成したコンテンツの保存先フォルダ</p>
					</div>
					<div>
						<label for="projectTags" class="block text-sm text-gray-400 mb-2">タグ（カンマ区切り）</label>
						<input id="projectTags" type="text" bind:value={projectTags} placeholder="例: マーケティング, AI, ビジネス" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500" />
					</div>
					{#if errorMessage}
						<div class="text-red-400 text-sm bg-red-900/30 px-4 py-2 rounded-lg">{errorMessage}</div>
					{/if}
					<button onclick={createProject} class="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-lg font-semibold transition-colors">
						作成
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Main Content -->
	<main class="p-6">
		<!-- Header Section -->
		<div class="flex flex-wrap items-center justify-between gap-4 mb-6">
			<div>
				<h2 class="text-xl font-semibold">プロジェクト</h2>
				<p class="text-sm text-gray-400 mt-1">{projects.length}件のプロジェクト</p>
			</div>
			<button
				onclick={() => { errorMessage = ''; showCreateProject = true; }}
				class="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				新規プロジェクト
			</button>
		</div>

		<!-- Tag Filter -->
		{#if tags.length > 0}
			<div class="mb-6">
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-sm text-gray-400">タグ:</span>
					{#each tags as tag}
						<button
							onclick={() => toggleTag(tag)}
							class="px-3 py-1 rounded-full text-sm transition-colors {activeTags.includes(tag) ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}"
						>
							{tag}
						</button>
					{/each}
					{#if activeTags.length > 0}
						<button onclick={clearTagFilter} class="px-3 py-1 rounded-full text-sm bg-gray-600 text-gray-300 hover:bg-gray-500">
							クリア
						</button>
					{/if}
				</div>
			</div>
		{/if}

		<!-- データフォルダ未選択の案内 -->
		{#if !isDataFolderSet}
			<div class="mb-6 p-4 bg-orange-900/30 border border-orange-500/50 rounded-lg">
				<div class="flex items-start gap-3">
					<svg class="w-6 h-6 text-orange-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
					<div>
						<p class="text-orange-300 font-medium">データ保存先フォルダを選択してください</p>
						<p class="text-orange-200/70 text-sm mt-1">
							右上の「データフォルダを選択」ボタンからフォルダを選択すると、プロジェクトデータが自動的に保存され、再起動しても参照できるようになります。
						</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- Project Cards -->
		{#if projects.length === 0}
			<div class="text-center text-gray-500 py-20">
				<svg class="w-20 h-20 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
				</svg>
				<p class="text-lg">まだプロジェクトがありません</p>
				<p class="text-sm mt-1">「新規プロジェクト」から作成してください</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
				{#each projects as project (project.id)}
					{@const counts = getContentTypeCounts(project)}
					<a
						href="/project/{project.id}"
						class="bg-gray-800 rounded-xl overflow-hidden hover:bg-gray-750 transition-colors group block"
					>
						<div class="p-4">
							<div class="flex items-start justify-between mb-2">
								<h3 class="font-semibold text-white line-clamp-1">{project.name}</h3>
								<button
									onclick={(e) => { e.preventDefault(); deleteProject(project.id); }}
									class="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
								>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
									</svg>
								</button>
							</div>

							{#if project.description}
								<p class="text-sm text-gray-400 line-clamp-2 mb-3">{project.description}</p>
							{/if}

							<!-- Content counts -->
							<div class="flex items-center gap-3 mb-3 text-xs text-gray-500">
								{#if counts.blog > 0}
									<span class="flex items-center gap-1">
										<span class="w-2 h-2 bg-blue-500 rounded-full"></span>
										{counts.blog}
									</span>
								{/if}
								{#if counts.ebook > 0}
									<span class="flex items-center gap-1">
										<span class="w-2 h-2 bg-purple-500 rounded-full"></span>
										{counts.ebook}
									</span>
								{/if}
								{#if counts.video > 0}
									<span class="flex items-center gap-1">
										<span class="w-2 h-2 bg-red-500 rounded-full"></span>
										{counts.video}
									</span>
								{/if}
								{#if counts.image > 0}
									<span class="flex items-center gap-1">
										<span class="w-2 h-2 bg-green-500 rounded-full"></span>
										{counts.image}
									</span>
								{/if}
								{#if counts.slide > 0}
									<span class="flex items-center gap-1">
										<span class="w-2 h-2 bg-orange-500 rounded-full"></span>
										{counts.slide}
									</span>
								{/if}
								{#if getContentCount(project) === 0}
									<span>コンテンツなし</span>
								{/if}
							</div>

							{#if project.folderPath}
								<div class="flex items-center gap-1 mb-2 text-xs text-gray-500">
									<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
									</svg>
									<span class="truncate">{project.folderPath}</span>
								</div>
							{/if}

							{#if project.tags.length > 0}
								<div class="flex flex-wrap gap-1 mb-3">
									{#each project.tags.slice(0, 3) as tag}
										<span class="text-xs px-2 py-0.5 bg-gray-700 text-gray-300 rounded">{tag}</span>
									{/each}
									{#if project.tags.length > 3}
										<span class="text-xs text-gray-500">+{project.tags.length - 3}</span>
									{/if}
								</div>
							{/if}

							<div class="text-xs text-gray-500">{formatDate(project.updatedAt)}</div>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</main>
</div>

<style>
	.line-clamp-1 {
		display: -webkit-box;
		-webkit-line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.bg-gray-750 {
		background-color: rgb(42, 48, 60);
	}
</style>
