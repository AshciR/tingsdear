<script lang="ts">
	import type { SaveReceiptResult } from '$lib/receipts/client';

	let { result, onReset }: { result: SaveReceiptResult; onReset: () => void } = $props();

	const chainNote = $derived(result.chainCreated ? 'new chain' : 'matched existing chain');
	const locationNote = $derived(
		result.locationCreated ? 'new location' : 'matched existing location'
	);
</script>

<section class="space-y-4">
	<h1 class="text-2xl font-semibold">Saved {result.lineItems.length} prices</h1>

	<p class="text-sm text-gray-600">
		Chain #{result.chainId} ({chainNote}) · Location #{result.locationId} ({locationNote})
	</p>

	<ul class="space-y-1 text-sm">
		{#each result.lineItems as line (line.priceId)}
			<li class="flex justify-between rounded border border-gray-200 px-2 py-1">
				<span>{line.itemName}</span>
				<span class="text-gray-500">{line.created ? 'new item' : 'existing item'}</span>
			</li>
		{/each}
	</ul>

	<button type="button" onclick={onReset} class="rounded bg-blue-600 px-4 py-2 text-white">
		Scan another
	</button>
</section>
