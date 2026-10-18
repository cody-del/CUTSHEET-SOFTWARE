// Integer cents only. Accepted totals and receipts never change quoted line prices.
export function orderFinancials(order,quotedTotal=0){
 const confirmed=!!order.finance?.confirmedAt,saleTotalCents=confirmed?order.finance.saleTotalCents:quotedTotal;
 const paidCents=(order.finance?.payments||[]).filter(p=>!p.voidedAt).reduce((sum,p)=>sum+p.amountCents,0);
 return {confirmed,saleTotalCents,paidCents,balanceCents:saleTotalCents-paidCents,paymentStatus:!confirmed?'Needs pricing':paidCents===saleTotalCents?'Paid':paidCents?'Partially paid':'Unpaid'};
}
export function salesFinancials(orders){
 return orders.reduce((sum,o)=>{const f=o.financials;if(!f?.confirmed){sum.needsPricing++;return sum;}sum.soldCents+=f.saleTotalCents;sum.receivedCents+=f.paidCents;sum.balanceCents+=f.balanceCents;return sum;},{soldCents:0,receivedCents:0,balanceCents:0,needsPricing:0});
}
