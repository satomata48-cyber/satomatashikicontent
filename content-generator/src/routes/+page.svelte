<script lang="ts">
	import { onMount } from 'svelte';
	import { selectFolder, getLastDirectoryHandle } from '$lib/filesystem';

	// フォルダ選択状態
	let hasFolderSelected = $state(false);
	let folderName = $state('');

	// コンテンツタイプの定義
	const contentTypes = [
		{
			id: 'blog',
			name: 'ブログ',
			description: 'SEOに最適化された記事を生成',
			icon: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z',
			color: 'bg-blue-500',
			borderColor: 'border-blue-500'
		},
		{
			id: 'ebook',
			name: '電子書籍',
			description: '目次と章構成を自動生成',
			icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
			color: 'bg-purple-500',
			borderColor: 'border-purple-500'
		},
		{
			id: 'video',
			name: '動画',
			description: '台本・サムネイル案を作成',
			icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
			color: 'bg-red-500',
			borderColor: 'border-red-500'
		},
		{
			id: 'image',
			name: '画像',
			description: '画像生成プロンプトを作成',
			icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
			color: 'bg-green-500',
			borderColor: 'border-green-500'
		},
		{
			id: 'slide-canvas',
			name: 'スライド',
			description: 'PowerPoint風キャンバスエディタ',
			icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z',
			color: 'bg-orange-500',
			borderColor: 'border-orange-500'
		}
	];

	onMount(() => {
		// 既にフォルダが選択されているか確認
		const handle = getLastDirectoryHandle();
		if (handle) {
			hasFolderSelected = true;
			folderName = handle.name;
		}
	});

	async function handleSelectFolder() {
		const result = await selectFolder();
		if (result.success) {
			hasFolderSelected = true;
			folderName = result.path || '';
		}
	}

	function getTypeLink(typeId: string): string {
		// フォルダが選択されていない場合でもリンク先へ遷移可能
		// 各ページでフォルダ選択を促す
		return `/${typeId}`;
	}
</script>

<div class="min-h-screen bg-gray-900 text-white">
	<!-- Header -->
	<header class="bg-gray-800 border-b border-gray-700 px-6 py-4">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-4">
				<h1 class="text-xl font-bold">コンテンツジェネレーター</h1>
			</div>
			<div class="flex items-center gap-4">
				<!-- フォルダ選択 -->
				<button
					onclick={handleSelectFolder}
					class="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
					</svg>
					{#if hasFolderSelected}
						<span class="text-sm">{folderName || 'フォルダ選択済'}</span>
					{:else}
						<span class="text-sm">フォルダを選択</span>
					{/if}
				</button>
				{#if hasFolderSelected}
					<div class="flex items-center gap-2 px-4 py-2 bg-green-600/20 border border-green-500 rounded-lg">
						<svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-green-400 text-sm font-medium">準備完了</span>
					</div>
				{/if}
			</div>
		</div>
	</header>

	<!-- Main Content -->
	<main class="p-6">
		<!-- フォルダ未選択時のガイド -->
		{#if !hasFolderSelected}
			<div class="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
				<div class="flex items-start gap-3">
					<svg class="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<div>
						<p class="text-yellow-200 font-medium">作業フォルダを選択してください</p>
						<p class="text-yellow-200/70 text-sm mt-1">HTMLファイルや生成したコンテンツを保存するフォルダを選択すると、全ての機能が利用できます。</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- Content Type Cards -->
		<div class="mb-8">
			<h2 class="text-lg font-semibold mb-4">コンテンツを作成</h2>
			<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
				{#each contentTypes as type}
					<a
						href={getTypeLink(type.id)}
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

		<!-- 使い方ガイド -->
		<div class="bg-gray-800/50 rounded-xl p-6">
			<h2 class="text-lg font-semibold mb-4">使い方</h2>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
				<div class="flex gap-3">
					<div class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
						<span class="text-sm font-bold">1</span>
					</div>
					<div>
						<h3 class="font-medium mb-1">フォルダを選択</h3>
						<p class="text-sm text-gray-400">作業用のフォルダを選択します。HTMLファイルや生成したコンテンツはここに保存されます。</p>
					</div>
				</div>
				<div class="flex gap-3">
					<div class="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0">
						<span class="text-sm font-bold">2</span>
					</div>
					<div>
						<h3 class="font-medium mb-1">コンテンツタイプを選択</h3>
						<p class="text-sm text-gray-400">ブログ、電子書籍、動画、画像、スライドから作成したいコンテンツを選びます。</p>
					</div>
				</div>
				<div class="flex gap-3">
					<div class="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
						<span class="text-sm font-bold">3</span>
					</div>
					<div>
						<h3 class="font-medium mb-1">AIで生成</h3>
						<p class="text-sm text-gray-400">OpenRouterのAIを使って高品質なコンテンツを自動生成します。</p>
					</div>
				</div>
			</div>
		</div>
	</main>
</div>
