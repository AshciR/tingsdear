<script lang="ts">
	import type { ParsedReceipt } from '$lib/receipt-client';
	import LineItemRow from './LineItemRow.svelte';

	let {
		receipt,
		error,
		saving,
		onConfirm
	}: {
		receipt: ParsedReceipt;
		error: string | null;
		saving: boolean;
		onConfirm: () => void;
	} = $props();

	const STORE_FIELDS = [
		{ key: 'name', label: 'Name' },
		{ key: 'branch', label: 'Branch' },
		{ key: 'address', label: 'Address' },
		{ key: 'city', label: 'City' },
		{ key: 'region', label: 'Region' },
		{ key: 'country', label: 'Country' }
	] as const;

	const included = $derived(receipt.line_items.filter((li) => !li.flagged).length);

	function addRow() {
		receipt.line_items.push({ name: '', quantity: 1, unit_price: 0, total: 0, flagged: false });
	}

	function deleteRow(index: number) {
		receipt.line_items.splice(index, 1);
	}
</script>

<section class="space-y-6">
	<header>
		<h1 class="text-2xl font-semibold">Check the extraction</h1>
		<p class="text-sm text-gray-600">
			Parser confidence: {receipt.confidence} · currency {receipt.currency}. Unchecked lines are not
			saved.
		</p>
	</header>

	<fieldset class="space-y-2">
		<legend class="text-sm font-medium text-gray-700">Store</legend>
		<div class="grid grid-cols-2 gap-2">
			{#each STORE_FIELDS as field (field.key)}
				<label class="text-xs text-gray-600 {field.key === 'address' ? 'col-span-2' : ''}">
					{field.label}
					<input
						type="text"
						bind:value={receipt.supermarket[field.key]}
						class="mt-0.5 w-full rounded border border-gray-300 p-1 text-sm text-black"
					/>
				</label>
			{/each}
		</div>
	</fieldset>

	<label class="block text-xs text-gray-600">
		Purchase date
		<input
			type="date"
			bind:value={receipt.purchase_date}
			class="mt-0.5 block rounded border border-gray-300 p-1 text-sm text-black"
		/>
	</label>

	<div class="space-y-2">
		<div class="flex items-end justify-between">
			<h2 class="text-sm font-medium text-gray-700">
				Line items — {included} of {receipt.line_items.length} will be saved
			</h2>
			<div class="hidden gap-2 pr-8 text-xs text-gray-500 sm:flex">
				<span class="w-24 text-right">Qty</span>
				<span class="w-24 text-right">Unit</span>
				<span class="w-24 text-right">Total</span>
			</div>
		</div>

		{#each receipt.line_items as item, i (i)}
			<LineItemRow {item} onDelete={() => deleteRow(i)} />
		{/each}

		<button type="button" onclick={addRow} class="rounded border border-gray-300 px-3 py-1 text-sm">
			+ Add row
		</button>
	</div>

	{#if error}
		<p class="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>
	{/if}

	<button
		type="button"
		disabled={saving}
		onclick={onConfirm}
		class="rounded bg-green-600 px-4 py-2 text-white disabled:bg-gray-300"
	>
		{saving ? 'Saving…' : 'Confirm and save'}
	</button>
</section>
