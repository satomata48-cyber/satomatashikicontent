<script lang="ts">
	import { page } from '$app/stores';
	import { projectStore, type Project, type ContentType } from '$lib/stores';

	let projectId = $state('');
	let project = $state<Project | null>(null);

	// コンテンツタイプの定義
	const contentTypes = [
		{
			id: 'blog' as ContentType,
			name: 'ブログ',
			description: 'SEOに最適化された記事を生成',
			icon: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z',
			color: 'bg-blue-500',
			borderColor: 'border-blue-500'
		},
		{
			id: 'ebook' as ContentType,
			name: '電子書籍',
			description: '目次と章構成を自動生成',
			icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
			color: 'bg-purple-500',
			borderColor: 'border-purple-500'
		},
		{
			id: 'video' as ContentType,
			name: '動画',
			description: '台本・サムネイル案を作成',
			icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
			color: 'bg-red-500',
			borderColor: 'border-red-500'
		},
		{
			id: 'image' as ContentType,
			name: '画像',
			description: '画像生成プロンプトを作成',
			icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
			color: 'bg-green-500',
			borderColor: 'border-green-500'
		},
		{
			id: 'slide-canvas' as ContentType,
			name: 'スライド',
			description: 'PowerPoint風キャンバスエディタ',
			icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z',
			color: 'bg-orange-500',
			borderColor: 'border-orange-500'
		}
	];

	page.subscribe(p => {
		projectId = p.params.id;
	});

	projectStore.subscribe(projects => {
		project = projects.find(p => p.id === projectId) || null;
	});

	function deleteContent(contentId: string) {
		if (confirm('このコンテンツを削除しますか？')) {
			projectStore.removeContent(projectId, contentId);
		}
	}

	function getTypeInfo(type: ContentType) {
		return contentTypes.find(t => t.id === type) || contentTypes[0];
	}

	function formatDate(date: Date) {
		return new Date(date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="min-h-screen bg-gray-900 text-white">
	<!-- Header -->
	<header class="bg-gray-800 border-b border-gray-700 px-6 py-4">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-4">
				<a href="/" class="text-gray-400 hover:text-white">
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
					</svg>
				</a>
				<h1 class="text-xl font-bold">{project?.name || 'プロジェクト'}</h1>
			</div>
			<div class="flex items-center gap-2 px-4 py-2 bg-green-600/20 border border-green-500 rounded-lg">
				<svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
				</svg>
				<span class="text-green-400 text-sm font-medium">API接続済み</span>
			</div>
		</div>
	</header>

	<!-- Main Content -->
	{#if project}
		<main class="p-6">
			<!-- Project Info -->
			{#if project.description}
				<p class="text-gray-400 mb-6">{project.description}</p>
			{/if}

			<!-- Content Type Cards -->
			<div class="mb-8">
				<h2 class="text-lg font-semibold mb-4">コンテンツを作成</h2>
				<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
					{#each contentTypes as type}
						<a
							href="/project/{projectId}/{type.id}"
							class="bg-gray-800 rounded-xl p-4 text-left transition-all hover:scale-105 group border-2 border-transparent hover:border-gray-600 block"
						>
							<div class="w-12 h-12 rounded-lg {type.color} flex items-center justify-center mb-3">
								<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={type.icon} />
								</svg>
							</div>
							<h3 class="font-semibold text-white mb-1">{type.name}</h3>
							<p class="text-xs text-gray-400">{type.description}</p>
						</a>
					{/each}
				</div>
			</div>

			<!-- Content List -->
			<div>
				<h2 class="text-lg font-semibold mb-4">作成したコンテンツ ({project.contents.length}件)</h2>
				{#if project.contents.length === 0}
					<div class="text-center text-gray-500 py-16 bg-gray-800/50 rounded-xl">
						<svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
						</svg>
						<p>まだコンテンツがありません</p>
						<p class="text-sm mt-1">上のカードからコンテンツを作成してください</p>
					</div>
				{:else}
					<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
						{#each project.contents as content (content.id)}
							{@const typeInfo = getTypeInfo(content.type)}
							<a
								href="/project/{projectId}/{content.type}?edit={content.id}"
								class="bg-gray-800 rounded-xl border-l-4 {typeInfo.borderColor} overflow-hidden group hover:bg-gray-750 transition-colors block"
							>
								<div class="p-4">
									<div class="flex items-start justify-between mb-2">
										<div class="flex items-center gap-2">
											<span class="text-xs px-2 py-1 rounded {typeInfo.color}">{typeInfo.name}</span>
											{#if content.fileName}
												<span class="text-xs text-gray-500 flex items-center gap-1">
													<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
													</svg>
													保存済
												</span>
											{/if}
										</div>
										<button
											onclick={(e) => { e.preventDefault(); e.stopPropagation(); deleteContent(content.id); }}
											class="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
										>
											<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
											</svg>
										</button>
									</div>
									<h3 class="font-semibold text-white mb-2">{content.title}</h3>
									<p class="text-sm text-gray-400 line-clamp-3 mb-3">{content.content.substring(0, 150)}...</p>
									<div class="flex items-center justify-between">
										<div class="text-xs text-gray-500">{formatDate(content.createdAt)}</div>
										<span class="text-xs text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
											<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
											</svg>
											編集
										</span>
									</div>
								</div>
							</a>
						{/each}
					</div>
				{/if}
			</div>
		</main>
	{:else}
		<main class="p-6">
			<div class="text-center text-gray-500 py-20">
				<p>プロジェクトが見つかりません</p>
				<a href="/" class="text-blue-400 hover:underline mt-2 inline-block">トップページに戻る</a>
			</div>
		</main>
	{/if}
</div>

<style>
	.line-clamp-3 {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
