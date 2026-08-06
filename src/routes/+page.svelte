<script lang="ts">
	import UploadView from '$lib/components/UploadView.svelte';
	import VerifyView from '$lib/components/VerifyView.svelte';
	import DoneView from '$lib/components/DoneView.svelte';
	import {
		parseReceiptFile,
		saveReceipt,
		type ParsedReceipt,
		type SaveReceiptResult
	} from '$lib/receipt-client';

	let view = $state<'upload' | 'parsing' | 'verify' | 'done'>('upload');
	let file = $state<File | null>(null);
	let receipt = $state<ParsedReceipt | null>(null);
	let result = $state<SaveReceiptResult | null>(null);
	let errorMsg = $state<string | null>(null);
	let saving = $state(false);

	async function handleParse() {
		if (!file) return;
		errorMsg = null;
		view = 'parsing';
		try {
			receipt = await parseReceiptFile(file);
			view = 'verify';
		} catch (e) {
			errorMsg = (e as Error).message;
			view = 'upload';
		}
	}

	async function handleConfirm() {
		if (!receipt) return;
		errorMsg = null;
		saving = true;
		try {
			result = await saveReceipt(receipt);
			view = 'done';
		} catch (e) {
			errorMsg = (e as Error).message;
		} finally {
			saving = false;
		}
	}

	function reset() {
		view = 'upload';
		file = null;
		receipt = null;
		result = null;
		errorMsg = null;
	}
</script>

<main class="mx-auto max-w-3xl p-6">
	{#if view === 'upload'}
		<UploadView {file} error={errorMsg} onFile={(f) => (file = f)} onSubmit={handleParse} />
	{:else if view === 'parsing'}
		<p class="animate-pulse text-sm text-gray-600">Reading {file?.name}…</p>
	{:else if view === 'verify' && receipt}
		<VerifyView {receipt} error={errorMsg} {saving} onConfirm={handleConfirm} />
	{:else if view === 'done' && result}
		<DoneView {result} onReset={reset} />
	{/if}
</main>
