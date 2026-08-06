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

	<input
		type="file"
		accept="image/*,application/pdf"
		capture="environment"
		onchange={handleChange}
		class="block w-full cursor-pointer rounded border border-gray-300 p-2 text-sm"
	/>

	{#if previewUrl}
		<img src={previewUrl} alt="Receipt preview" class="max-h-96 rounded border border-gray-200" />
	{:else if file}
		<p class="text-sm text-gray-600">PDF: {file.name}</p>
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
