<script lang="ts">
	import type { ParsedReceipt } from '$lib/receipt-client';

	type LineItem = ParsedReceipt['line_items'][number];

	let { item, onDelete }: { item: LineItem; onDelete: () => void } = $props();

	const numberClass = 'w-full rounded border border-gray-300 p-1 text-right text-sm sm:w-24';
	const labelClass = 'block flex-1 sm:flex-none';
	const captionClass = 'block text-xs text-gray-500 sm:hidden';
</script>

<div
	class="rounded border p-2 {item.flagged ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'}"
>
	<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
		<div class="flex min-w-0 items-center gap-2 sm:flex-1">
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
		</div>

		<div class="flex items-center gap-2">
			<label class={labelClass}>
				<span class={captionClass}>Qty</span>
				<input
					type="number"
					inputmode="decimal"
					step="any"
					bind:value={item.quantity}
					class={numberClass}
				/>
			</label>
			<label class={labelClass}>
				<span class={captionClass}>Unit</span>
				<input
					type="number"
					inputmode="decimal"
					step="0.01"
					bind:value={item.unit_price}
					class={numberClass}
				/>
			</label>
			<label class={labelClass}>
				<span class={captionClass}>Total</span>
				<input
					type="number"
					inputmode="decimal"
					step="0.01"
					bind:value={item.total}
					class={numberClass}
				/>
			</label>
			<button
				type="button"
				onclick={onDelete}
				aria-label="Remove this line"
				title="Remove this line"
				class="shrink-0 self-end px-2 py-2 text-gray-500 hover:text-red-600 sm:self-auto sm:py-0"
				>✕</button
			>
		</div>
	</div>

	{#if item.flagged}
		<p class="mt-1 pl-6 text-xs text-yellow-800">
			Looks like a non-product line — review before saving
		</p>
	{/if}
</div>
