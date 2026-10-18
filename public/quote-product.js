// Every quote uses the same builder; products belong to individual line items.
export const quoteBuilderURL=quote=>'/editor.html?quote='+encodeURIComponent(quote.id);
