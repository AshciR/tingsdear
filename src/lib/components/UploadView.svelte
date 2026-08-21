<script lang="ts">
	let {
		files,
		error,
		onFiles,
		onSubmit
	}: {
		files: File[];
		error: string | null;
		onFiles: (files: File[]) => void;
		onSubmit: () => void;
	} = $props();

	let previewUrls = $state<(string | null)[]>([]);

	// Rebuilt wholesale whenever the list changes. A handful of photos makes this cheap, and it
	// keeps the revoke paired with the create — no leaked object URLs when a part is removed.
	$effect(() => {
		const urls = files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null));
		previewUrls = urls;
		return () => urls.forEach((url) => url && URL.revokeObjectURL(url));
	});

	// Appends rather than replaces: a long receipt is several shots, taken one after another.
	function handleChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const chosen = Array.from(input.files ?? []);
		if (chosen.length) onFiles([...files, ...chosen]);
		// Let the same file — or another shot from the camera — be chosen again next time.
		input.value = '';
	}

	function removeAt(index: number) {
		onFiles(files.filter((_, i) => i !== index));
	}

	function moveTo(index: number, target: number) {
		if (target < 0 || target >= files.length) return;
		const reordered = [...files];
		const [moved] = reordered.splice(index, 1);
		reordered.splice(target, 0, moved);
		onFiles(reordered);
	}
</script>

<section class="space-y-4">
	<h1 class="text-2xl font-semibold">Scan a receipt</h1>
	<p class="text-sm text-gray-600">
		Too long for one photo? Add each part in order — the supermarket name is only on the first.
	</p>

	<div class="flex gap-2">
		<label
			for="camera-input"
			class="cursor-pointer rounded bg-blue-600 px-4 py-2 text-sm text-white focus-within:ring-2 focus-within:ring-blue-400"
		>
			{files.length ? 'Add photo' : 'Take photo'}
			<input
				id="camera-input"
				type="file"
				accept="image/*"
				capture="environment"
				onchange={handleChange}
				class="sr-only"
			/>
		</label>

		<label
			for="file-input"
			class="cursor-pointer rounded border border-gray-300 px-4 py-2 text-sm focus-within:ring-2 focus-within:ring-blue-400"
		>
			Choose file
			<input
				id="file-input"
				type="file"
				accept="image/*,application/pdf"
				multiple
				onchange={handleChange}
				class="sr-only"
			/>
		</label>
	</div>

	{#if files.length}
		<ol class="space-y-2">
			{#each files as file, i (`${i}-${file.name}-${file.lastModified}`)}
				<li class="flex items-center gap-3 rounded border border-gray-200 p-2">
					<span class="w-6 shrink-0 text-center text-sm font-medium text-gray-500">{i + 1}</span>

					{#if previewUrls[i]}
						<img
							src={previewUrls[i]}
							alt="Part {i + 1} preview"
							style="image-orientation: from-image"
							class="h-20 w-16 shrink-0 rounded border border-gray-200 object-cover"
						/>
					{:else}
						<span
							class="flex h-20 w-16 shrink-0 items-center justify-center rounded border border-gray-200 text-xs text-gray-400"
						>
							PDF
						</span>
					{/if}

					<span class="min-w-0 grow truncate text-sm text-gray-600">{file.name}</span>

					<div class="flex shrink-0 gap-1">
						<button
							type="button"
							disabled={i === 0}
							onclick={() => moveTo(i, i - 1)}
							aria-label="Move part {i + 1} earlier"
							class="rounded border border-gray-300 px-2 py-1 text-sm disabled:text-gray-300"
						>
							↑
						</button>
						<button
							type="button"
							disabled={i === files.length - 1}
							onclick={() => moveTo(i, i + 1)}
							aria-label="Move part {i + 1} later"
							class="rounded border border-gray-300 px-2 py-1 text-sm disabled:text-gray-300"
						>
							↓
						</button>
						<button
							type="button"
							onclick={() => removeAt(i)}
							aria-label="Remove part {i + 1}"
							class="rounded border border-gray-300 px-2 py-1 text-sm text-red-700"
						>
							✕
						</button>
					</div>
				</li>
			{/each}
		</ol>
	{/if}

	{#if error}
		<p class="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
	{/if}

	<button
		type="button"
		disabled={!files.length}
		onclick={onSubmit}
		class="rounded bg-blue-600 px-4 py-2 text-white disabled:bg-gray-300"
	>
		{files.length > 1 ? `Parse ${files.length} parts` : 'Parse receipt'}
	</button>
</section>
