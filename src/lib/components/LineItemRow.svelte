<script lang="ts">
	import type { ParsedReceipt } from '$lib/receipt-client';

	type LineItem = ParsedReceipt['line_items'][number];

	let { item, onDelete }: { item: LineItem; onDelete: () => void } = $props();

	const numberClass = 'w-24 rounded border border-gray-300 p-1 text-right text-sm';
</script>

<div
	class="rounded border p-2 {item.flagged ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'}"
>
	<div class="flex items-center gap-2">
		<input
			type="checkbox"
			checked={!item.flagged}
			onchange={(e) => (item.flagged = !e.currentTarget.checked)}
			title="Include this line in the saved receipt"
			class="size-4 shrink-0"
		/>
		<input
			type="text"
			bind:value={item.name}
			placeholder="Item name"
			class="min-w-0 flex-1 rounded border border-gray-300 p-1 text-sm"
		/>
		<input type="number" step="any" bind:value={item.quantity} class={numberClass} />
		<input type="number" step="0.01" bind:value={item.unit_price} class={numberClass} />
		<input type="number" step="0.01" bind:value={item.total} class={numberClass} />
		<button
			type="button"
			onclick={onDelete}
			title="Remove this line"
			class="shrink-0 px-2 text-gray-500 hover:text-red-600">✕</button
		>
	</div>

	{#if item.flagged}
		<p class="mt-1 pl-6 text-xs text-yellow-800">
			Looks like a non-product line — review before saving
		</p>
	{/if}
</div>
