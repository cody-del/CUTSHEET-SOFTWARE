// Closing a customer order is separate from finishing its manufacturing checks.
export const isOrderCompleted=order=>order?.status==='completed';
export const activeOrders=orders=>orders.filter(order=>!isOrderCompleted(order));
