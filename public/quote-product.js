// Every quote uses the same builder; products belong to individual line items.
export const quoteBuilderURL=quote=>'/?quote='+encodeURIComponent(quote.id);
