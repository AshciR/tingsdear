<script lang="ts">
	let {
		file,
		error,
		onFile,
		onSubmit
	}: {
		file: File | null;
		error: string | null;
		onFile: (file: File | null) => void;
		onSubmit: () => void;
	} = $props();

	let previewUrl = $state<string | null>(null);

	$effect(() => {
		if (!file || !file.type.startsWith('image/')) {
			previewUrl = null;
			return;
		}
		const url = URL.createObjectURL(file);
		previewUrl = url;
		return () => URL.revokeObjectURL(url);
	});

	function handleChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		onFile(input.files?.[0] ?? null);
	}
</script>

<section class="space-y-4">
	<h1 class="text-2xl font-semibold">Scan a receipt</h1>

	<div class="flex gap-2">
		<label
			for="camera-input"
			class="cursor-pointer rounded bg-blue-600 px-4 py-2 text-sm text-white focus-within:ring-2 focus-within:ring-blue-400"
		>
			Take photo
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
				onchange={handleChange}
				class="sr-only"
			/>
		</label>
	</div>

	{#if file}
		<p class="text-sm text-gray-600">{file.name}</p>
	{/if}

	{#if previewUrl}
		<img
			src={previewUrl}
			alt="Receipt preview"
			style="image-orientation: from-image"
			class="max-h-96 rounded border border-gray-200"
		/>
	{/if}

	{#if error}
		<p class="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
	{/if}

	<button
		type="button"
		disabled={!file}
		onclick={onSubmit}
		class="rounded bg-blue-600 px-4 py-2 text-white disabled:bg-gray-300"
	>
		Parse receipt
	</button>
</section>
