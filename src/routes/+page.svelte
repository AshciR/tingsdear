<script lang="ts">
	import UploadView from '$lib/receipts/components/UploadView.svelte';
	import VerifyView from '$lib/receipts/components/VerifyView.svelte';
	import DoneView from '$lib/receipts/components/DoneView.svelte';
	import {
		parseReceiptFiles,
		resolveSupermarket,
		saveReceipt,
		type ParsedReceipt,
		type ResolvedSupermarket,
		type SaveReceiptResult
	} from '$lib/receipts/client';
	import { preselectedLocationId } from '$lib/supermarkets/candidates';

	let view = $state<'upload' | 'parsing' | 'verify' | 'done'>('upload');
	// One receipt, in reading order — a long one takes several photos to capture.
	let files = $state<File[]>([]);
	let receipt = $state<ParsedReceipt | null>(null);
	// Which branches on file this receipt's header could be, and which one the user is filing it
	// under. Null means "a new branch" — the safe default until the evidence is strong.
	let resolution = $state<ResolvedSupermarket | null>(null);
	let selectedLocationId = $state<number | null>(null);
	let result = $state<SaveReceiptResult | null>(null);
	let errorMsg = $state<string | null>(null);
	let saving = $state(false);

	async function handleParse() {
		if (!files.length) return;
		errorMsg = null;
		view = 'parsing';
		try {
			receipt = await parseReceiptFiles(files);
			await resolveBranches(receipt.supermarket);
			view = 'verify';
		} catch (e) {
			errorMsg = (e as Error).message;
			view = 'upload';
		}
	}

	// A lookup failure leaves the picker hidden rather than stranding the user at parsing: save
	// still works from the supermarket text, it just cannot offer an existing branch.
	async function resolveBranches(supermarket: ParsedReceipt['supermarket']) {
		try {
			resolution = await resolveSupermarket(supermarket);
		} catch {
			resolution = null;
		}
		selectedLocationId = preselectedLocationId(resolution);
	}

	async function handleConfirm() {
		if (!receipt) return;
		errorMsg = null;
		saving = true;
		try {
			result = await saveReceipt(receipt, selectedLocationId);
			view = 'done';
		} catch (e) {
			errorMsg = (e as Error).message;
		} finally {
			saving = false;
		}
	}

	function reset() {
		view = 'upload';
		files = [];
		receipt = null;
		resolution = null;
		selectedLocationId = null;
		result = null;
		errorMsg = null;
	}
</script>

<main class="mx-auto max-w-3xl p-6">
	{#if view === 'upload'}
		<UploadView {files} error={errorMsg} onFiles={(f) => (files = f)} onSubmit={handleParse} />
	{:else if view === 'parsing'}
		<p class="animate-pulse text-sm text-gray-600">
			{files.length > 1 ? `Reading ${files.length} parts…` : `Reading ${files[0]?.name}…`}
		</p>
	{:else if view === 'verify' && receipt}
		<VerifyView
			{receipt}
			{resolution}
			{selectedLocationId}
			error={errorMsg}
			{saving}
			onConfirm={handleConfirm}
			onSelectLocation={(id) => (selectedLocationId = id)}
			onSupermarketChange={() => receipt && resolveBranches(receipt.supermarket)}
		/>
	{:else if view === 'done' && result}
		<DoneView {result} onReset={reset} />
	{/if}
</main>
