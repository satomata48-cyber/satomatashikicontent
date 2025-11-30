<script lang="ts">
	import { onMount } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';
	import { restoreDataFolderHandle, projectStore } from '$lib/stores';

	let { children } = $props();

	onMount(async () => {
		// IndexedDBからプロジェクトを読み込み
		await projectStore.init();

		// フォルダハンドルを復元（コンテンツファイル用）
		try {
			await restoreDataFolderHandle();
		} catch (e) {
			console.error('Failed to restore data folder:', e);
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
