<script lang="ts">
	import { getTemplateById, type HpTemplate } from '$lib/hp-templates';

	interface Props {
		templateId: string;
		title: string;
		content: string[];
		subtitle?: string;
		footer?: string;
		scale?: number;
	}

	let { templateId, title, content, subtitle = '', footer = '', scale = 1 }: Props = $props();

	let template = $derived(getTemplateById(templateId));

	// 1280x720のスライドサイズ
	const WIDTH = 1280;
	const HEIGHT = 720;
</script>

<div
	class="relative overflow-hidden"
	style="width: {WIDTH * scale}px; height: {HEIGHT * scale}px; transform-origin: top left;"
>
	<div
		class="absolute inset-0 flex flex-col justify-center items-center p-12 {template?.containerClass || 'bg-gray-100'}"
		style="width: {WIDTH}px; height: {HEIGHT}px; transform: scale({scale}); transform-origin: top left;"
	>
		<!-- デコレーション要素 -->
		{#if template?.decorations}
			{#each template.decorations as decoration}
				<div class={decoration.class}></div>
			{/each}
		{/if}

		<!-- コンテンツエリア -->
		<div class="relative z-10 w-full h-full flex flex-col justify-center">
			<!-- タイトル -->
			{#if template?.category === 'title' || template?.category === 'ending'}
				<!-- タイトル/エンディングスライド: 中央揃え -->
				<div class="flex flex-col items-center justify-center flex-1">
					<h1 class={template?.titleClass || 'text-4xl font-bold'}>{title}</h1>
					{#if subtitle}
						<p class={template?.contentClass || 'text-xl mt-4'}>{subtitle}</p>
					{/if}
					{#if content.length > 0}
						<div class={template?.contentClass || 'text-xl mt-4'}>
							{#each content as line}
								<p>{line}</p>
							{/each}
						</div>
					{/if}
				</div>
			{:else if template?.category === 'quote'}
				<!-- 引用スライド -->
				<div class="flex flex-col items-center justify-center flex-1 px-16">
					<span class={template?.titleClass}>"</span>
					<blockquote class={template?.contentClass}>
						{#each content as line}
							<p>{line}</p>
						{/each}
					</blockquote>
					{#if subtitle}
						<p class="mt-6 text-lg text-gray-500">— {subtitle}</p>
					{/if}
				</div>
			{:else}
				<!-- リスト/コンテンツスライド -->
				<div class="w-full max-w-5xl mx-auto">
					{#if template?.id.includes('card')}
						<!-- カードスタイル -->
						<div class="rounded-xl overflow-hidden shadow-2xl">
							<h2 class={template?.titleClass}>{title}</h2>
							<div class={template?.contentClass}>
								<ul class="space-y-4">
									{#each content as item}
										<li class="flex items-start gap-4">
											<span class="flex-shrink-0 w-2 h-2 mt-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"></span>
											<span>{item}</span>
										</li>
									{/each}
								</ul>
							</div>
						</div>
					{:else}
						<!-- 通常スタイル -->
						<h2 class={template?.titleClass}>{title}</h2>
						<div class={template?.contentClass}>
							<ul class="space-y-4 mt-6">
								{#each content as item}
									<li class="flex items-start gap-4">
										<span class="flex-shrink-0 w-3 h-3 mt-2 bg-gradient-to-r from-blue-500 to-pink-500 rounded-full"></span>
										<span>{item}</span>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- フッター -->
		{#if footer}
			<div class="absolute bottom-4 left-0 right-0 text-center text-sm text-gray-400">
				{footer}
			</div>
		{/if}
	</div>
</div>
